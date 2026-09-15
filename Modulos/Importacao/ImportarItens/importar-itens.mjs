import { getEmpresaAtualId } from "../../Estoque/CadastroItens/itens.api.mjs";
import {
  CAMPOS_ITEM, COLUNAS_IGNORADAS,
  detectarLinhaCabecalho, detectarColunasDePreco, mapearColunas,
  validarLinha, construirPayloadItem, casarFornecedor,
  criarCanonicalizador, normalizeDisplay,
} from "./importar-itens-core.mjs";

const supabase = window.supabaseClient;

function $(id) { return document.getElementById(id); }

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function formatoDoCampo(campo) {
  if (campo.tipo === "kit") return 'ITEM / COMPONENTE / KIT + linhas "quantidade|referencia" (vazio = Item)';
  if (campo.tipo === "numero" || campo.tipo === "numero-nao-negativo") return "número (ex.: 1.200,50 ou 1200.5)";
  if (campo.tipo === "inteiro") return "número inteiro (vazio = sem ordem)";
  if (campo.tipo === "booleano") return "Sim/Não, S/N, 1/0, Verdadeiro/Falso, True/False, X";
  return "texto livre";
}

function renderTileColuna(numero, nome, obrigatorio, formato) {
  return `
    <div class="import-col-tile">
      <div class="import-col-tile-head">
        <span class="import-col-num">${numero}</span>
        <span class="import-col-name">${escapeHtml(nome)}</span>
        ${obrigatorio ? '<span class="import-col-required">Sim</span>' : '<span class="import-col-optional">Não</span>'}
      </div>
      <div class="import-col-format">${escapeHtml(formato)}</div>
    </div>
  `;
}

function renderColunasInfo() {
  const tiles = CAMPOS_ITEM.map((campo, index) =>
    renderTileColuna(index + 1, campo.header, campo.required, formatoDoCampo(campo))
  );
  tiles.push(renderTileColuna(
    CAMPOS_ITEM.length + 1,
    '"Val Unitário Locação" (1 ou mais colunas)',
    true,
    "número — vira uma tabela de preço (nome lido do cabeçalho acima da coluna)",
  ));
  $("colunasInfoBody").innerHTML = tiles.join("");

  $("colunasIgnoradasBody").innerHTML = COLUNAS_IGNORADAS.map((c) => `
    <tr><td>${escapeHtml(c.header)}</td><td>${escapeHtml(c.motivo)}</td></tr>
  `).join("");
}

function baixarModelo() {
  const headers = CAMPOS_ITEM.map((c) => c.header);
  const idxPreco = headers.length;
  headers.push("Val Unitário Locação");
  const grupo = new Array(idxPreco).fill("");
  grupo.push("TABELA 2026 Padrão");
  const exemplo = [
    "APA001", "Aparador", "Aparador Clássico P", "Madeira", "—", "Castanho Médio",
    "Tampo em vidro", "Aparadores", "Aparadores Clássicos", "Sala de Estar", "Aparadores",
    0.84, 0.78, 0.42, "Araras", 1400, 2800, 170, "Sim", "Não", "Não", "Sim", "Não", "ITEM", 288.75,
  ];
  const sheet = window.XLSX.utils.aoa_to_sheet([grupo, headers, exemplo]);
  sheet["!cols"] = headers.map((h) => ({ wch: Math.max(14, String(h).length + 2) }));
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, sheet, "Itens");
  window.XLSX.writeFile(workbook, "modelo-importacao-catalogo.xlsx");
}

/* =====================================================
   LEITURA DO ARQUIVO
===================================================== */

function lerArquivo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const workbook = window.XLSX.read(event.target.result, { type: "array" });
        const primeiraAba = workbook.SheetNames[0];
        const sheet = workbook.Sheets[primeiraAba];
        const linhasBrutas = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: false });
        resolve(linhasBrutas);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler o arquivo."));
    reader.readAsArrayBuffer(file);
  });
}

/* =====================================================
   ESTADO / FLUXO DA TELA
===================================================== */

const state = {
  linhas: [], // {linha, referencia, ok, erros, pendencias, valores, precos, fornecedorMatch}
  colunasPreco: [],
  empresaId: null,
  fornecedoresExistentes: [],
  itensExistentesPorReferencia: new Map(),
};

function mostrarSecao(id, mostrar) {
  $(id).classList.toggle("hidden", !mostrar);
}

async function carregarContextoEmpresa() {
  if (!state.empresaId) state.empresaId = await getEmpresaAtualId();

  const [{ data: fornecedores }, { data: itensExistentes }] = await Promise.all([
    supabase.from("fornecedores").select("id,nome_razao_social,nome_fantasia").eq("empresa_id", state.empresaId),
    supabase.from("itens").select("id,referencia").eq("empresa_id", state.empresaId).not("referencia", "is", null),
  ]);

  state.fornecedoresExistentes = fornecedores || [];
  state.itensExistentesPorReferencia = new Map((itensExistentes || []).map((i) => [i.referencia, i.id]));
}

async function handleFile(file) {
  if (!file) return;

  $("fileChip").classList.remove("hidden");
  $("fileChipName").textContent = file.name;

  let linhasBrutas;
  try {
    linhasBrutas = await lerArquivo(file);
  } catch (error) {
    console.error("Erro ao ler planilha:", error);
    window.alerta?.("Não foi possível ler esse arquivo. Confirme que é um .xlsx, .xls ou .csv válido.", "Importar Itens", "erro");
    return;
  }

  if (!linhasBrutas.length) {
    window.alerta?.("A planilha está vazia.", "Importar Itens", "aviso");
    return;
  }

  const headerRowIndex = detectarLinhaCabecalho(linhasBrutas);
  const groupRow = headerRowIndex > 0 ? linhasBrutas[headerRowIndex - 1] : null;
  const headerRow = linhasBrutas[headerRowIndex];
  const linhasDeDados = linhasBrutas.slice(headerRowIndex + 1);

  const { indices, faltando } = mapearColunas(headerRow);
  const colunasPreco = detectarColunasDePreco(headerRow, groupRow);

  if (faltando.length) {
    window.alerta?.(`Coluna(s) obrigatória(s) não encontrada(s) no cabeçalho: ${faltando.join(", ")}. Baixe o modelo novamente e não altere os nomes das colunas.`, "Importar Itens", "erro", { duracao: 9000 });
    return;
  }

  if (!colunasPreco.length) {
    window.alerta?.('Nenhuma coluna de preço encontrada (procurado: "Val Unitário Locação"). A importação precisa de pelo menos uma tabela de preço.', "Importar Itens", "erro", { duracao: 9000 });
    return;
  }

  if (!linhasDeDados.length) {
    window.alerta?.("Nenhuma linha de dados encontrada abaixo do cabeçalho.", "Importar Itens", "aviso");
    return;
  }

  try {
    await carregarContextoEmpresa();
  } catch (error) {
    console.error("Erro ao carregar contexto da empresa:", error);
    window.alerta?.("Não foi possível carregar fornecedores/itens já cadastrados para comparação. Tente novamente.", "Importar Itens", "erro");
    return;
  }

  const canonicalizadores = {
    categoria: criarCanonicalizador(),
    subcategoria: criarCanonicalizador(),
    familia: criarCanonicalizador(),
    grupo_separacao: criarCanonicalizador(),
    estilo: criarCanonicalizador(),
  };

  state.colunasPreco = colunasPreco;
  state.linhas = linhasDeDados.map((linhaArray, i) => {
    const resultado = validarLinha(linhaArray, indices, colunasPreco, canonicalizadores);
    const linhaPlanilha = headerRowIndex + i + 2; // +1 header, +1 pra 1-index humano

    let fornecedorMatch = { status: "vazio", fornecedorId: null };
    if (resultado.ok && resultado.valores.fornecedor_nome) {
      fornecedorMatch = casarFornecedor(resultado.valores.fornecedor_nome, state.fornecedoresExistentes);
    }

    const jaExiste = resultado.valores.referencia
      ? state.itensExistentesPorReferencia.has(resultado.valores.referencia)
      : false;

    return { linhaPlanilha, ...resultado, fornecedorMatch, jaExiste };
  });

  renderPreview(colunasPreco);
  mostrarSecao("previewSection", true);
  mostrarSecao("resultSection", false);
  $("previewSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

function contarPendenciasGerais() {
  const validas = state.linhas.filter((l) => l.ok);
  const invalidas = state.linhas.filter((l) => !l.ok);
  const novos = validas.filter((l) => !l.jaExiste && l.valores.tipo !== "Kit");
  const atualizados = validas.filter((l) => l.jaExiste && l.valores.tipo !== "Kit");
  const kits = validas.filter((l) => l.valores.tipo === "Kit");
  const semCodigo = state.linhas.filter((l) => l.erros.some((e) => e.includes('"Código"')));
  const fornecedoresNaoIdentificados = new Set(
    validas.filter((l) => l.fornecedorMatch.status === "nao_encontrado" || l.fornecedorMatch.status === "ambiguo")
      .map((l) => l.valores.fornecedor_nome)
  );
  const comPendenciaLeve = state.linhas.filter((l) => l.pendencias.length > 0);
  const classificacoesNovas = new Set();
  validas.forEach((l) => {
    ["categoria", "subcategoria", "familia", "grupo_separacao", "estilo"].forEach((campo) => {
      if (l.valores[campo]) classificacoesNovas.add(`${campo}:${l.valores[campo]}`);
    });
  });

  return { validas, invalidas, novos, atualizados, kits, semCodigo, fornecedoresNaoIdentificados, comPendenciaLeve, classificacoesNovas };
}

const CAMPOS_BOOLEANOS = ["exibir_no_site", "destaque_site", "locar_somente_kit", "ativo", "exclusivo"];

// Mostra o valor JÁ INTERPRETADO (não o texto bruto da célula) — é assim
// que a pessoa vê o efeito da normalização (categoria com grafia
// unificada, booleano decidido, fornecedor vinculado ou não) antes de
// confirmar a importação.
function valorParaPreviewHtml(campo, linha) {
  const v = linha.valores;

  if (campo.key === "descricao_complementar_origem") return escapeHtml(v.descricao_complementar || "—");

  if (campo.key === "kit_raw") {
    if (v.tipo === "Kit") {
      if (!v.componentesKit?.length) return "—";
      return escapeHtml(v.componentesKit.map((c) => `${c.quantidade}x ${c.referencia}`).join(", "));
    }
    return escapeHtml(v.tipo || "—");
  }

  if (CAMPOS_BOOLEANOS.includes(campo.key)) return v[campo.key] ? "Sim" : "Não";

  if (campo.key === "ordem_exposicao_site") return v.ordem_exposicao_site != null ? String(v.ordem_exposicao_site) : "—";

  if (campo.key === "fornecedor_nome") {
    if (!v.fornecedor_nome) return "—";
    return linha.fornecedorMatch?.status === "encontrado"
      ? escapeHtml(v.fornecedor_nome)
      : `<span class="import-pendencia-inline">${escapeHtml(v.fornecedor_nome)} (não vinculado)</span>`;
  }

  if (campo.tipo === "numero" || campo.tipo === "numero-nao-negativo") {
    const num = v[campo.key];
    return num != null && num !== "" ? escapeHtml(String(num)) : "—";
  }

  const valor = v[campo.key];
  return valor != null && valor !== "" ? escapeHtml(String(valor)) : "—";
}

function renderPreview(colunasPreco) {
  const c = contarPendenciasGerais();

  $("previewSummary").innerHTML = [
    `${state.linhas.length} linha(s) lida(s)`,
    `<strong class="ok">${c.validas.length} válida(s)</strong>`,
    c.invalidas.length ? `<strong class="erro">${c.invalidas.length} com erro</strong>` : "",
    c.comPendenciaLeve.length ? `<strong class="aviso">${c.comPendenciaLeve.length} com pendência (revisar depois)</strong>` : "",
  ].filter(Boolean).join(" · ");

  $("previewDetalhes").innerHTML = `
    <div class="import-stat"><strong>${c.novos.length}</strong><span>itens novos</span></div>
    <div class="import-stat"><strong>${c.atualizados.length}</strong><span>itens atualizados</span></div>
    <div class="import-stat"><strong>${c.kits.length}</strong><span>kits</span></div>
    <div class="import-stat"><strong>${c.semCodigo.length}</strong><span>sem código</span></div>
    <div class="import-stat"><strong>${c.fornecedoresNaoIdentificados.size}</strong><span>fornecedores não identificados</span></div>
    <div class="import-stat"><strong>${colunasPreco.length}</strong><span>tabela(s) de preço na planilha</span></div>
  `;

  const tabelasHtml = colunasPreco.map((col, i) => {
    const nome = col.nomeTabela || `<span class="import-pendencia-inline">nome não identificado (coluna ${col.colIndex + 1}) — será preciso nomear manualmente</span>`;
    const ano = col.ano ? `ano ${col.ano}` : `<span class="import-pendencia-inline">ano não identificado</span>`;
    return `<li>Tabela ${i + 1}: ${nome} — ${ano}</li>`;
  }).join("");
  $("previewTabelasPreco").innerHTML = `<ul>${tabelasHtml}</ul>`;

  $("previewThead").innerHTML = `<tr><th>Linha</th><th>Status</th>${CAMPOS_ITEM.map((c2) => `<th>${escapeHtml(c2.header)}</th>`).join("")}${colunasPreco.map((c2, i) => `<th>${escapeHtml(c2.nomeTabela || `Preço tab. ${i + 1}`)}</th>`).join("")}</tr>`;

  $("previewTbody").innerHTML = state.linhas.map((linha) => {
    let statusHtml;
    if (!linha.ok) {
      statusHtml = `<span class="import-preview-status erro"><i data-lucide="alert-circle"></i>${escapeHtml(linha.erros.join("; "))}</span>`;
    } else if (linha.pendencias.length) {
      statusHtml = `<span class="import-preview-status aviso"><i data-lucide="alert-triangle"></i>${escapeHtml(linha.pendencias.join("; "))}</span>`;
    } else {
      statusHtml = `<span class="import-preview-status ok"><i data-lucide="check-circle-2"></i>${linha.jaExiste ? "Atualiza" : "Novo"}</span>`;
    }

    const camposHtml = CAMPOS_ITEM.map((campo) => `<td>${valorParaPreviewHtml(campo, linha)}</td>`).join("");

    const precosHtml = colunasPreco.map((col) => {
      const preco = linha.precos.find((p) => p.colIndex === col.colIndex);
      return `<td>${preco ? preco.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>`;
    }).join("");

    return `<tr data-linha="${linha.linhaPlanilha}" class="${linha.ok ? (linha.pendencias.length ? "import-preview-row-aviso" : "") : "import-preview-row-erro"}">
      <td>${linha.linhaPlanilha}</td>
      <td>${statusHtml}</td>
      ${camposHtml}
      ${precosHtml}
    </tr>`;
  }).join("");

  window.lucide?.createIcons?.();

  const btnConfirmar = $("btnConfirmarImportacao");
  const importaveis = c.validas.length;
  btnConfirmar.disabled = importaveis === 0;
  btnConfirmar.textContent = importaveis
    ? `Importar ${importaveis} linha${importaveis === 1 ? "" : "s"} válida${importaveis === 1 ? "" : "s"}`
    : "Nenhuma linha válida para importar";
}

/* =====================================================
   PROTEÇÃO: COMPONENTE SEM NENHUM KIT VINCULADO
   Achado real: um Kit pode falhar silenciosamente na importação (linha
   com erro que o usuário não percebeu antes de confirmar mesmo assim, ou
   qualquer outro motivo) enquanto os Componentes dele são gravados
   normalmente — sobra a peça solta, sem nenhum Kit pra agrupar ela.
   "Componente" só existe pra compor um Kit (nunca é alugado sozinho), então
   um Componente sem NENHUMA linha em kit_itens é sempre um sinal de
   problema, nunca um estado válido — roda depois de toda importação,
   mesmo sem erro nenhum na hora, pra pegar isso e outros casos antigos
   também (não só desta importação específica).
===================================================== */
async function encontrarComponentesOrfaos() {
  const { data: componentes, error } = await supabase
    .from("itens")
    .select("id, produto, descricao_total, referencia")
    .eq("empresa_id", state.empresaId)
    .eq("tipo", "Componente");
  if (error || !componentes?.length) return [];

  const { data: vinculos, error: erroVinculo } = await supabase
    .from("kit_itens")
    .select("item_id")
    .eq("empresa_id", state.empresaId);
  if (erroVinculo) return [];

  const vinculados = new Set((vinculos || []).map((v) => v.item_id));
  return componentes.filter((c) => !vinculados.has(c.id));
}

function renderizarAvisoOrfaos(orfaos) {
  const box = $("resultOrfaos");
  if (!box) return;
  if (!orfaos.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }

  const porProduto = new Map();
  orfaos.forEach((o) => {
    const chave = o.produto || "(sem produto)";
    porProduto.set(chave, (porProduto.get(chave) || 0) + 1);
  });
  const linhas = [...porProduto.entries()].sort((a, b) => b[1] - a[1]);
  const TOPO = 15;
  const resumo = linhas.slice(0, TOPO).map(([nome, qtd]) => `${escapeHtml(nome)} (${qtd})`).join(", ");
  const resto = linhas.length > TOPO ? ` e mais ${linhas.length - TOPO} produto(s)` : "";

  box.innerHTML = `<strong>⚠ ${orfaos.length} componente(s) sem nenhum kit vinculado</strong> — a peça existe no cadastro, mas não faz parte de nenhum Kit montado; geralmente é sinal de que a linha do Kit correspondente falhou na importação (dele ou de uma importação anterior). Produtos afetados: ${resumo}${resto}. Confira em Cadastro de Itens (filtro "Componente") e, se for o caso, reimporte a linha do Kit que falta.`;
  box.classList.remove("hidden");
}

async function garantirTabelasPreco(colunasPreco) {
  const { data: existentes } = await supabase
    .from("tabelas_preco")
    .select("id,nome,ano_referencia")
    .eq("empresa_id", state.empresaId);

  const mapa = new Map();
  for (const col of colunasPreco) {
    const nome = col.nomeTabela || `Tabela importada (coluna ${col.colIndex + 1})`;
    const ano = col.ano || new Date().getFullYear();
    const achada = (existentes || []).find((t) => t.nome === nome && t.ano_referencia === ano);
    if (achada) { mapa.set(col.colIndex, achada.id); continue; }

    const { data: nova, error } = await supabase
      .from("tabelas_preco")
      .insert({ empresa_id: state.empresaId, nome, ano_referencia: ano, ativa: false })
      .select("id")
      .single();
    if (error) throw new Error(`Não foi possível criar a tabela de preço "${nome}": ${error.message}`);
    mapa.set(col.colIndex, nova.id);
  }
  return mapa;
}

async function confirmarImportacao() {
  const c = contarPendenciasGerais();
  if (!c.validas.length) return;

  const mensagemConfirmacao = c.invalidas.length
    ? `${c.validas.length} linha(s) serão importadas (${c.novos.length} novas, ${c.atualizados.length} atualizadas, ${c.kits.length} kits). ${c.invalidas.length} linha(s) com erro serão ignoradas. Deseja continuar?`
    : `${c.validas.length} linha(s) serão importadas (${c.novos.length} novas, ${c.atualizados.length} atualizadas, ${c.kits.length} kits). Deseja continuar?`;

  const confirmado = await window.confirmarGlobal?.(mensagemConfirmacao, "Confirmar importação");
  if (!confirmado) return;

  const btnConfirmar = $("btnConfirmarImportacao");
  btnConfirmar.disabled = true;
  const textoOriginal = btnConfirmar.textContent;
  btnConfirmar.textContent = "Importando...";

  const erros = [];
  let itensGravados = 0;
  let kitsGravados = 0;

  // ---- Feedback visual linha a linha (pedido explícito: sem isso não dá
  // pra saber se a importação travou ou só está demorando, principalmente
  // em arquivos grandes) ----
  const linhasNaoKit = c.validas.filter((l) => l.valores.tipo !== "Kit");
  const linhasKit = c.validas.filter((l) => l.valores.tipo === "Kit");
  // Achado real: com várias tabelas de preço, o passo de gravar preço (um
  // upsert por item por tabela) podia ser tão grande quanto gravar os
  // itens em si — mas não entrava na conta de progresso, então a barra
  // "parava" bem no fim do passe 1 mesmo com o import continuando de
  // verdade por trás. Agora entra na mesma conta.
  const totalPrecosNaoKit = linhasNaoKit.reduce((soma, l) => soma + l.precos.length, 0);
  const totalParaImportar = linhasNaoKit.length + totalPrecosNaoKit + linhasKit.length;
  let processados = 0;

  const barraProgresso = $("importProgress");
  const barraProgressoFill = $("importProgressBar");
  const rotuloProgresso = $("importProgressLabel");
  barraProgresso.classList.remove("hidden");
  rotuloProgresso.classList.remove("hidden");

  function atualizarProgresso() {
    const pct = totalParaImportar ? Math.round((processados / totalParaImportar) * 100) : 100;
    barraProgressoFill.style.width = `${pct}%`;
    rotuloProgresso.textContent = `Gravando... ${pct}% concluído`;
    btnConfirmar.textContent = `Importando... ${pct}%`;
  }

  // Sem ícone (lucide) aqui de propósito: chamar lucide.createIcons() a cada
  // linha gravada, em arquivos com centenas de linhas, refaz a varredura do
  // documento inteiro repetidas vezes — só texto simples, mais leve.
  function marcarLinhaGravada(linhaPlanilha, sucesso, mensagemErro) {
    const tr = $("previewTbody")?.querySelector(`tr[data-linha="${linhaPlanilha}"]`);
    if (!tr) return;
    tr.classList.remove("import-preview-row-erro", "import-preview-row-aviso");
    tr.classList.add(sucesso ? "import-row-gravado" : "import-row-erro-gravacao");
    const statusEl = tr.querySelector(".import-preview-status");
    if (!statusEl) return;
    statusEl.className = `import-preview-status ${sucesso ? "gravado" : "erro"}`;
    statusEl.textContent = sucesso
      ? "✓ Gravado"
      : `Erro ao gravar${mensagemErro ? `: ${mensagemErro}` : ""}`;
  }

  atualizarProgresso();

  try {
    const tabelasPrecoMap = await garantirTabelasPreco(state.colunasPreco);

    // ---- Passe 1: itens e componentes (tudo que NÃO é Kit) ----
    const CHUNK = 150;
    const referenciaParaId = new Map(state.itensExistentesPorReferencia);

    for (let i = 0; i < linhasNaoKit.length; i += CHUNK) {
      const lote = linhasNaoKit.slice(i, i + CHUNK);
      for (const linha of lote) {
        const idExistente = referenciaParaId.get(linha.valores.referencia);
        const payload = construirPayloadItem(linha.valores, state.empresaId, linha.valores.referencia, linha.fornecedorMatch.fornecedorId);
        let erro;
        if (idExistente) {
          ({ error: erro } = await supabase.from("itens").update(payload).eq("id", idExistente));
          if (!erro) referenciaParaId.set(linha.valores.referencia, idExistente);
        } else {
          const { data, error: erroInsert } = await supabase.from("itens").insert(payload).select("id").single();
          erro = erroInsert;
          if (!erro) referenciaParaId.set(linha.valores.referencia, data.id);
        }
        processados += 1;
        if (erro) {
          erros.push(`Item "${linha.valores.referencia}": ${erro.message}`);
          marcarLinhaGravada(linha.linhaPlanilha, false, erro.message);
        } else {
          itensGravados += 1;
          marcarLinhaGravada(linha.linhaPlanilha, true);
        }
        atualizarProgresso();
      }
    }

    // ---- Persistir preços das linhas não-kit — em LOTE, não um upsert por
    // item por tabela (com várias tabelas de preço isso já chegou a virar
    // milhares de chamadas sequenciais, cada uma uma ida e volta de rede;
    // era exatamente esse passo, silencioso e sem entrar na conta de
    // progresso, que fazia a tela parecer travada mesmo funcionando). ----
    const precosParaGravar = [];
    for (const linha of linhasNaoKit) {
      const itemId = referenciaParaId.get(linha.valores.referencia);
      if (!itemId) continue;
      for (const preco of linha.precos) {
        const tabelaId = tabelasPrecoMap.get(preco.colIndex);
        if (!tabelaId) continue;
        precosParaGravar.push({
          referencia: linha.valores.referencia,
          registro: { empresa_id: state.empresaId, tabela_preco_id: tabelaId, item_id: itemId, valor_locacao: preco.valor },
        });
      }
    }

    const PRECO_CHUNK = 300;
    for (let i = 0; i < precosParaGravar.length; i += PRECO_CHUNK) {
      const lote = precosParaGravar.slice(i, i + PRECO_CHUNK);
      const { error } = await supabase
        .from("itens_precos")
        .upsert(lote.map((p) => p.registro), { onConflict: "tabela_preco_id,item_id" });

      if (error) {
        // Um registro problemático não deve derrubar o lote inteiro — refaz
        // esse lote específico um a um só pra achar qual referência falhou.
        for (const p of lote) {
          const { error: erroIndividual } = await supabase
            .from("itens_precos")
            .upsert(p.registro, { onConflict: "tabela_preco_id,item_id" });
          if (erroIndividual) erros.push(`Preço de "${p.referencia}": ${erroIndividual.message}`);
        }
      }

      processados += lote.length;
      atualizarProgresso();
    }

    // ---- Passe 2: kits (resolvendo componentes pela referência) ----
    for (const linha of linhasKit) {
      const idExistente = referenciaParaId.get(linha.valores.referencia);
      const payload = construirPayloadItem(linha.valores, state.empresaId, linha.valores.referencia, linha.fornecedorMatch.fornecedorId);
      let kitId = idExistente;
      let erroKit;
      if (idExistente) {
        ({ error: erroKit } = await supabase.from("itens").update(payload).eq("id", idExistente));
      } else {
        const { data, error: erroInsert } = await supabase.from("itens").insert(payload).select("id").single();
        erroKit = erroInsert;
        if (!erroKit) { kitId = data.id; referenciaParaId.set(linha.valores.referencia, kitId); }
      }
      if (erroKit) {
        erros.push(`Kit "${linha.valores.referencia}": ${erroKit.message}`);
        processados += 1;
        marcarLinhaGravada(linha.linhaPlanilha, false, erroKit.message);
        atualizarProgresso();
        continue;
      }

      const componentesResolvidos = [];
      const componentesNaoResolvidos = [];
      for (const comp of linha.valores.componentesKit) {
        const componenteId = referenciaParaId.get(comp.referencia);
        if (componenteId) componentesResolvidos.push({ item_id: componenteId, quantidade: comp.quantidade });
        else componentesNaoResolvidos.push(comp.referencia);
      }

      if (componentesNaoResolvidos.length) {
        erros.push(`Kit "${linha.valores.referencia}": componente(s) não encontrado(s) por referência: ${componentesNaoResolvidos.join(", ")}.`);
      }

      // idempotente: substitui a lista de componentes do kit a cada import
      await supabase.from("kit_itens").delete().eq("kit_id", kitId).eq("empresa_id", state.empresaId);
      if (componentesResolvidos.length) {
        const { error } = await supabase.from("kit_itens").insert(
          componentesResolvidos.map((c2) => ({ empresa_id: state.empresaId, kit_id: kitId, item_id: c2.item_id, quantidade: c2.quantidade }))
        );
        if (error) erros.push(`Componentes do kit "${linha.valores.referencia}": ${error.message}`);
      }

      for (const preco of linha.precos) {
        const tabelaId = tabelasPrecoMap.get(preco.colIndex);
        if (!tabelaId) continue;
        const { error } = await supabase
          .from("itens_precos")
          .upsert({ empresa_id: state.empresaId, tabela_preco_id: tabelaId, item_id: kitId, valor_locacao: preco.valor }, { onConflict: "tabela_preco_id,item_id" });
        if (error) erros.push(`Preço do kit "${linha.valores.referencia}": ${error.message}`);
      }

      kitsGravados += 1;
      processados += 1;
      marcarLinhaGravada(linha.linhaPlanilha, true);
      atualizarProgresso();
    }
  } catch (error) {
    console.error("Erro na importação:", error);
    erros.push(error.message || "erro desconhecido");
  }

  barraProgresso.classList.add("hidden");
  rotuloProgresso.classList.add("hidden");
  btnConfirmar.disabled = false;
  btnConfirmar.textContent = textoOriginal;

  mostrarSecao("previewSection", false);
  mostrarSecao("resultSection", true);

  const orfaos = await encontrarComponentesOrfaos().catch(() => []);
  renderizarAvisoOrfaos(orfaos);

  const icone = $("resultIcon");
  const totalGravado = itensGravados + kitsGravados;
  if (erros.length) {
    icone.classList.add("erro");
    icone.innerHTML = '<i data-lucide="alert-triangle"></i>';
    $("resultTitle").textContent = totalGravado ? "Importação parcial" : "Falha na importação";
    $("resultDetail").innerHTML = `${totalGravado} linha(s) gravada(s) (${itensGravados} itens/componentes, ${kitsGravados} kits).<br>Pendências: ${erros.map(escapeHtml).join("<br>")}`;
  } else {
    icone.classList.remove("erro");
    icone.innerHTML = '<i data-lucide="check-circle-2"></i>';
    $("resultTitle").textContent = "Importação concluída";
    $("resultDetail").textContent = `${totalGravado} linha(s) gravada(s) com sucesso (${itensGravados} itens/componentes, ${kitsGravados} kits).`;
  }
  window.lucide?.createIcons?.();
  $("resultSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetarParaNovoArquivo() {
  state.linhas = [];
  state.colunasPreco = [];
  $("importFileInput").value = "";
  $("fileChip").classList.add("hidden");
  mostrarSecao("previewSection", false);
  mostrarSecao("resultSection", false);
  $("dropSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* =====================================================
   INIT
===================================================== */

async function init() {
  renderColunasInfo();

  $("btnBaixarModelo").addEventListener("click", baixarModelo);

  const dropzone = $("dropzone");
  const input = $("importFileInput");

  input.addEventListener("change", (e) => handleFile(e.target.files?.[0]));

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "dragend"].forEach((evt) => {
    dropzone.addEventListener(evt, () => dropzone.classList.remove("is-dragover"));
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  $("btnTrocarArquivo").addEventListener("click", resetarParaNovoArquivo);
  $("btnCancelarPreview").addEventListener("click", resetarParaNovoArquivo);
  $("btnConfirmarImportacao").addEventListener("click", confirmarImportacao);
  $("btnNovaImportacao").addEventListener("click", resetarParaNovoArquivo);

  $("btnAjudaImportacao").addEventListener("click", () => $("ajudaImportacaoModal").classList.add("is-open"));
  $("btnFecharAjudaImportacao").addEventListener("click", () => $("ajudaImportacaoModal").classList.remove("is-open"));
  $("ajudaImportacaoModal").addEventListener("click", (e) => {
    if (e.target.id === "ajudaImportacaoModal") $("ajudaImportacaoModal").classList.remove("is-open");
  });

  const contexto = await window.aguardarContexto?.();
  if (contexto?.empresa_id) state.empresaId = contexto.empresa_id;
}

init();
