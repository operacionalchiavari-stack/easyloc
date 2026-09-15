/* =====================================================================
   IMPORTAR ITENS — núcleo de leitura/mapeamento/validação (sem DOM)
   Separado da orquestração de UI (importar-itens.mjs) de propósito: estas
   funções são puras (recebem dados, devolvem dados) e por isso dá pra
   testar com `node --test`, sem precisar de navegador/Playwright pra cada
   caso de borda de parsing.
===================================================================== */

export const CLASSIFICACOES_OFICIAIS = ["categoria", "subcategoria", "familia", "grupo_separacao", "estilo"];

// Mapa coluna-da-planilha (nome exato do cabeçalho da planilha real do
// cliente) -> campo do sistema. Ver CLAUDE.md ("Importação do catálogo real
// — planilha do cliente") para o raciocínio por trás de cada mapeamento,
// especialmente PRODUTO/ESPECIFICAÇÃO (regra explícita do usuário) e as
// colunas de classificação (LINHA (CATEGORIA) NOVA / GRUPO (CHAR 30)
// FAMÍLIAS SITE são ignoradas de propósito).
export const CAMPOS_ITEM = [
  { header: "Código", key: "referencia", required: true, tipo: "texto" },
  { header: "PRODUTO", key: "produto_base", required: false, tipo: "texto" },
  { header: "ESPECIFICAÇÃO", key: "produto", required: true, tipo: "texto" },
  { header: "MATERIAL", key: "material", required: false, tipo: "texto" },
  { header: "MARCA/MODELO", key: "marca_modelo", required: false, tipo: "texto" },
  { header: "COR", key: "cor", required: false, tipo: "texto" },
  { header: "DESCRIÇÃO COMPLEMENTAR", key: "descricao_complementar_origem", required: false, tipo: "texto" },
  { header: "CATEGORIA", key: "categoria", required: true, tipo: "texto" },
  { header: "SUB-CATEGORIA", key: "subcategoria", required: false, tipo: "texto" },
  { header: "FAMÍLIA", key: "familia", required: false, tipo: "texto" },
  { header: "SETOR SEPARAÇÃO (CHAR 30)", key: "grupo_separacao", required: false, tipo: "texto" },
  { header: "LARGURA ou DIÂMETRO", key: "largura", required: true, tipo: "numero-nao-negativo" },
  { header: "ALTURA", key: "altura", required: true, tipo: "numero-nao-negativo" },
  { header: "PROFUNDIDADE", key: "profundidade", required: true, tipo: "numero-nao-negativo" },
  { header: "Fornecedor", key: "fornecedor_nome", required: false, tipo: "texto" },
  { header: "Valor de Compra", key: "custo", required: false, tipo: "numero" },
  { header: "Valor de Reposição (+100%)", key: "valor_reposicao", required: false, tipo: "numero" },
  { header: "Ordem de Exposição no Site", key: "ordem_exposicao_site", required: false, tipo: "inteiro" },
  { header: "EXIBIR NO SITE (S/N)", key: "exibir_no_site", required: false, tipo: "booleano", default: false },
  { header: "DESTAQUE SITE (S/N)", key: "destaque_site", required: false, tipo: "booleano", default: false },
  { header: "LOCAR SOMENTE NO KIT (S/N)", key: "locar_somente_kit", required: false, tipo: "booleano", default: false },
  { header: "ATIVO (S/N)", key: "ativo", required: false, tipo: "booleano", default: true },
  { header: "EXCLUSIVO (S/N)", key: "exclusivo", required: false, tipo: "booleano", default: false },
  { header: "KIT", key: "kit_raw", required: true, tipo: "kit" },
];

// Colunas da planilha real do cliente confirmadas como não tendo campo
// correspondente no sistema hoje — ignoradas de propósito, não por
// descuido. Ver seção 4 do relatório final / CLAUDE.md.
export const COLUNAS_IGNORADAS = [
  { header: "Qt", motivo: "quantidade em estoque não tem campo de importação hoje (estoque_total existe na tabela mas não é gerenciado por nenhuma tela de cadastro — fora do escopo desta importação, evita popular um campo que nenhuma tela exibe/mantém)." },
  { header: "Valor Total", motivo: "coluna auxiliar da própria planilha (Valor de Compra × Qt), não corresponde a nenhum campo do sistema." },
  { header: "LINHA (CATEGORIA) NOVA", motivo: "classificação duplicada/legada — a planilha já tem uma coluna \"CATEGORIA\" explícita, usada como fonte oficial." },
  { header: "GRUPO (CHAR 30) FAMÍLIAS SITE", motivo: "classificação duplicada/legada — a planilha já tem \"FAMÍLIA\" explícita, usada como fonte oficial." },
  { header: "GALPÃO CONTROLE INTERNO", motivo: "sem campo correspondente no sistema hoje; não foi pedido explicitamente." },
];

// Convenção da planilha real do cliente: uma célula com exatamente "#"
// significa "em branco de propósito" (não é um valor de texto de verdade) —
// nunca deve virar valor literal em nenhum campo (texto, número, booleano,
// preço, kit). Normalizado num único ponto (`valorDe`, dentro de
// `validarLinha`, e a leitura das colunas de preço) pra valer em toda
// coluna automaticamente.
export function ehMarcadorDeVazio(raw) {
  return String(raw ?? "").trim() === "#";
}

function celulaBruta(raw) {
  return ehMarcadorDeVazio(raw) ? "" : raw;
}

export function normalizeMatch(value) {
  return String(value ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

// Preserva acentuação/maiúsculas originais, só limpa espaçamento — usado
// pra guardar o TEXTO exibido (categoria, fornecedor, etc.), nunca para
// comparação (isso é sempre via normalizeMatch).
export function normalizeDisplay(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function parseNumeroBR(raw) {
  if (typeof raw === "number") return raw;
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  // "." só é separador de milhar quando "," também aparece na mesma célula
  // (formato BR inequívoco, ex. "1.500,00"). Sozinho, "." é sempre decimal —
  // evita interpretar "1.2" (metros) como "1200".
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(s);
}

const BOOL_VERDADEIRO = ["sim", "s", "true", "verdadeiro", "1", "x"];
const BOOL_FALSO = ["nao", "n", "false", "falso", "0"];

// Retorna {value, recognized}. `recognized:false` significa "célula não
// vazia mas não reconhecida" — nunca convertida silenciosamente (pedido
// explícito): o chamador decide o que fazer (registrar como pendência).
export function parseBooleanoEstrito(raw, defaultValue) {
  const s = normalizeMatch(raw);
  if (!s) return { value: defaultValue, recognized: true, vazio: true };
  if (BOOL_VERDADEIRO.includes(s)) return { value: true, recognized: true, vazio: false };
  if (BOOL_FALSO.includes(s)) return { value: false, recognized: true, vazio: false };
  return { value: defaultValue, recognized: false, vazio: false };
}

// "ITEM E COMPONENTE" (ou variações: "ITEM/COMPONENTE", "ITEM, COMPONENTE",
// "COMPONENTE E ITEM"...) — caso real encontrado na planilha do cliente: um
// produto que é alugado avulso (Item) mas também é usado como peça de algum
// kit (Componente). Separador exigido com espaço ao redor no "e" (senão
// combinaria com o próprio "e" de dentro da palavra "compon-e-nte").
const SEPARADOR_COMBINACAO_KIT = /\s+e\s+|\s*[\/,&+]\s*/;
function ehCombinacaoItemComponente(normalizado) {
  const partes = normalizado.split(SEPARADOR_COMBINACAO_KIT).map((p) => p.trim()).filter(Boolean);
  return partes.length === 2 && partes.includes("item") && partes.includes("componente");
}

// Analisa a célula da coluna "KIT": "ITEM" | "COMPONENTE" | "KIT" seguido
// de uma ou mais linhas "<quantidade>|<referencia>" (quebras de linha
// dentro da própria célula, como o cliente já usa na planilha dele).
export function parseKitCell(raw) {
  const texto = String(raw ?? "").trim();
  // Célula vazia é diferente de um valor errado: a maioria das linhas reais
  // é item simples e nem sempre vem marcada — bloquear a linha inteira por
  // isso seria pior do que assumir "Item" (o caso mais comum) e avisar.
  if (!texto) return { reconhecido: true, tipo: "Item", componentes: [], vazio: true };

  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const primeira = normalizeMatch(linhas[0]);

  if (primeira === "item") return { reconhecido: true, tipo: "Item", componentes: [] };
  if (primeira === "componente") return { reconhecido: true, tipo: "Componente", componentes: [] };
  if (ehCombinacaoItemComponente(primeira)) {
    // Grava como "Item" — decisão tecnicamente mais segura: garante que o
    // produto continue aparecendo na busca de item avulso pra pedido (que
    // filtra por tipo="Item"), e não perde a possibilidade de ser usado
    // como componente de um kit, já que a resolução de kit casa por
    // REFERÊNCIA, não por tipo — qualquer item importado (Item ou
    // Componente) já pode ser referenciado dentro de um KIT hoje.
    return { reconhecido: true, tipo: "Item", componentes: [], combinado: true };
  }

  if (primeira === "kit") {
    const componentes = [];
    const erros = [];
    for (const linha of linhas.slice(1)) {
      const partes = linha.split("|");
      if (partes.length !== 2) {
        erros.push(`linha de componente mal formada: "${linha}" (esperado "quantidade|referencia")`);
        continue;
      }
      const quantidade = parseNumeroBR(partes[0].trim());
      const referencia = partes[1].trim();
      if (!referencia) {
        erros.push(`componente sem referência: "${linha}"`);
        continue;
      }
      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        erros.push(`quantidade inválida para "${referencia}": "${partes[0].trim()}"`);
        continue;
      }
      componentes.push({ quantidade, referencia });
    }
    if (!componentes.length && !erros.length) {
      erros.push('"KIT" sem nenhuma linha de componente ("quantidade|referencia") abaixo');
    }
    return { reconhecido: true, tipo: "Kit", componentes, erros };
  }

  return { reconhecido: false };
}

// Reaproveita a grafia já vista pro mesmo valor normalizado (evita
// "Sofá"/"Sofás"/"sofa " virarem 3 categorias diferentes) — a PRIMEIRA
// grafia encontrada no lote (ou já existente no banco, se fornecida em
// `previamente`) vira a canônica; mantém acentos/maiúsculas de propósito
// (não força um padrão arbitrário como Title Case sobre o texto real do
// cliente).
export function criarCanonicalizador(previamente = []) {
  const mapa = new Map();
  for (const valor of previamente) {
    const norm = normalizeMatch(valor);
    if (norm && !mapa.has(norm)) mapa.set(norm, normalizeDisplay(valor));
  }
  return function canonicalizar(raw) {
    const limpo = normalizeDisplay(raw);
    if (!limpo) return "";
    const norm = normalizeMatch(limpo);
    if (mapa.has(norm)) return mapa.get(norm);
    mapa.set(norm, limpo);
    return limpo;
  };
}

// -----------------------------------------------------------------------
// Cabeçalho: a planilha real do cliente tem DUAS linhas de cabeçalho (uma
// linha de rótulo/grupo por cima — usada pra nomear as tabelas de preço —
// e a linha com os nomes de coluna de verdade por baixo). O modelo baixável
// desta tela usa só uma linha. As duas formas são aceitas.
// -----------------------------------------------------------------------
const ANCORAS_CABECALHO = ["codigo", "kit", "especificacao", "produto"];

export function detectarLinhaCabecalho(linhasBrutas) {
  for (let i = 0; i < Math.min(linhasBrutas.length, 3); i++) {
    const normalizada = linhasBrutas[i].map(normalizeMatch);
    const acertos = ANCORAS_CABECALHO.filter((a) => normalizada.includes(a)).length;
    if (acertos >= 2) return i;
  }
  return 0;
}

const PADRAO_COLUNA_PRECO = /val(or)?\s*unit(ario|ário)?\s*loca[cç][aã]o/;

// Acha toda coluna de preço de locação no cabeçalho (pode haver várias —
// uma por tabela/ano) e tenta achar o nome completo da tabela na linha de
// grupo (se existir) logo acima. Nunca inventa nome/ano — quando não dá
// pra ler um nome de verdade, devolve `nomeTabela: null` e o chamador
// registra como pendência em vez de adivinhar.
export function detectarColunasDePreco(headerRow, groupRow) {
  const colunas = [];
  headerRow.forEach((celula, colIndex) => {
    if (!PADRAO_COLUNA_PRECO.test(normalizeMatch(celula))) return;
    const rotuloGrupo = groupRow ? normalizeDisplay(groupRow[colIndex]) : "";
    const nomeTabela = rotuloGrupo || null;
    const anoMatch = nomeTabela ? nomeTabela.match(/\b(20\d{2})\b/) : null;
    colunas.push({
      colIndex,
      nomeTabela,
      ano: anoMatch ? Number(anoMatch[1]) : null,
    });
  });
  return colunas;
}

export function mapearColunas(headerRow) {
  const normalizada = headerRow.map(normalizeMatch);
  const indices = {};
  const faltando = [];
  CAMPOS_ITEM.forEach((campo) => {
    const idx = normalizada.indexOf(normalizeMatch(campo.header));
    if (idx === -1) {
      if (campo.required) faltando.push(campo.header);
      return;
    }
    indices[campo.key] = idx;
  });
  return { indices, faltando };
}

export function montarDescricaoTotal(v) {
  // "Produto" (linha/tipo genérico, ex. "Bar") sempre vem primeiro, seguido
  // da "Especificação" (nome específico, ex. "Bistrol") — pedido explícito
  // do usuário. Fica de fora quando "Produto" não foi preenchido (`filter`
  // já cuida disso), sem bloquear a linha por causa disso.
  const partes = [v.produto_base, v.produto, v.material, v.cor, v.descricao_complementar].map((p) => String(p || "").trim()).filter(Boolean);
  const medidas = (v.largura != null && v.altura != null && v.profundidade != null)
    ? `(L) ${v.largura} m (A) ${v.altura} m (P) ${v.profundidade} m`
    : "";
  return [...partes, medidas].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Valida uma linha de dados e devolve:
 *  - ok: se a linha pode ser importada (sem erro bloqueante)
 *  - erros: lista de problemas que bloqueiam a linha
 *  - pendencias: lista de avisos que NÃO bloqueiam (ex.: booleano
 *    desconhecido, sem revisão o valor fica no default do campo)
 *  - valores: campos já convertidos/prontos pra virar payload
 *  - precos: [{colIndex, valor}] valores de locação lidos nas colunas de
 *    preço detectadas (brutos — a validação de número acontece aqui, mas a
 *    ligação com a tabela de preço acontece fora, já que isso é por linha)
 */
export function validarLinha(linhaArray, indices, colunasPreco, canonicalizadores) {
  const erros = [];
  const pendencias = [];
  const valores = {};

  const valorDe = (key) => {
    const idx = indices[key];
    return idx == null ? "" : celulaBruta(linhaArray[idx]);
  };

  // ---- Código / referência (chave de idempotência) ----
  const referencia = normalizeDisplay(valorDe("referencia"));
  if (!referencia) {
    erros.push('"Código" vazio — sem código não é possível importar de forma segura (reimportar geraria duplicata, pois não há como reconhecer a linha depois).');
  }
  valores.referencia = referencia;

  // ---- KIT (tipo + componentes) ----
  const kitRaw = valorDe("kit_raw");
  const kit = parseKitCell(kitRaw);
  if (!kit.reconhecido) {
    // Mostra o valor bruto lido da planilha (mesmo padrão já usado pros
    // outros "não reconhecido" — booleano, preço): sem isso, a única forma
    // de descobrir POR QUE uma célula não foi reconhecida é o usuário
    // conseguir copiar o texto exato dela e mandar aqui pra investigação —
    // com o valor já na mensagem, o problema (espaço/palavra a mais,
    // grafia diferente etc.) fica visível direto na prévia.
    const brutoExibido = String(kitRaw ?? "").replace(/\r?\n/g, " / ").trim();
    erros.push(`"KIT" com valor não reconhecido: "${brutoExibido}" (use ITEM, COMPONENTE, ou KIT seguido de linhas "quantidade|referencia").`);
  } else if (kit.vazio) {
    pendencias.push('"KIT" estava vazio — importado como "Item" (revisar se deveria ser Componente ou Kit).');
  } else if (kit.combinado) {
    pendencias.push('"KIT" veio como "Item e Componente" — importado como "Item" (continua podendo ser referenciado como componente de qualquer kit, a montagem do kit não depende do tipo).');
  } else if (kit.tipo === "Kit" && kit.erros?.length) {
    kit.erros.forEach((e) => erros.push(`"KIT": ${e}`));
  }
  valores.tipo = kit.reconhecido ? kit.tipo : null;
  valores.componentesKit = kit.componentes || [];

  // ---- Nome do item (ESPECIFICAÇÃO -> produto) ----
  const produto = normalizeDisplay(valorDe("produto"));
  if (!produto) erros.push('"ESPECIFICAÇÃO" (nome do item) é obrigatório.');
  valores.produto = produto;

  // ---- Produto (linha/tipo genérico, ex. "Bar") — prefixa o nome gerado
  // automaticamente, antes da Especificação. Opcional: uma linha sem
  // "PRODUTO" preenchido não é bloqueada, o nome só começa direto pela
  // Especificação.
  valores.produto_base = normalizeDisplay(valorDe("produto_base"));

  // ---- Descrição complementar ----
  valores.descricao_complementar = normalizeDisplay(valorDe("descricao_complementar_origem"));

  valores.material = normalizeDisplay(valorDe("material"));
  valores.marca_modelo = normalizeDisplay(valorDe("marca_modelo"));
  valores.cor = normalizeDisplay(valorDe("cor"));

  // ---- Classificações oficiais (normalizadas/canonicalizadas) ----
  const categoriaRaw = valorDe("categoria");
  if (!normalizeDisplay(categoriaRaw)) erros.push('"CATEGORIA" é obrigatória.');
  valores.categoria = canonicalizadores.categoria(categoriaRaw);
  valores.subcategoria = canonicalizadores.subcategoria(valorDe("subcategoria"));
  valores.familia = canonicalizadores.familia(valorDe("familia"));
  valores.grupo_separacao = canonicalizadores.grupo_separacao(valorDe("grupo_separacao"));
  valores.estilo = canonicalizadores.estilo(valorDe("estilo"));

  // ---- Dimensões (zero é um valor válido — ex.: item sem profundidade
  // real a informar — só número negativo ou não numérico bloqueia).
  // Obrigatória pra QUALQUER tipo, Kit incluso — cada linha de Kit tem
  // nome e medida PRÓPRIOS, é um cadastro completo igual Item/Componente,
  // não uma linha "virtual" (confirmado explicitamente pelo usuário depois
  // de uma tentativa errada de tornar isso opcional pra Kit).
  ["largura", "altura", "profundidade"].forEach((campo) => {
    const bruto = valorDe(campo);
    const texto = String(bruto ?? "").trim();
    if (!texto) { erros.push(`"${campo === "largura" ? "LARGURA ou DIÂMETRO" : campo.toUpperCase()}" é obrigatória.`); return; }
    const num = parseNumeroBR(bruto);
    if (!Number.isFinite(num) || num < 0) { erros.push(`"${campo}" inválida: "${texto}" (precisa ser um número, 0 é aceito).`); return; }
    valores[campo] = num;
  });

  // ---- Fornecedor (resolvido fora, aqui só guarda o texto bruto) ----
  valores.fornecedor_nome = normalizeDisplay(valorDe("fornecedor_nome"));

  // ---- Valores monetários (custo/reposição) ----
  ["custo", "valor_reposicao"].forEach((campo) => {
    const bruto = valorDe(campo);
    const texto = String(bruto ?? "").trim();
    if (!texto) { valores[campo] = 0; return; }
    const num = parseNumeroBR(bruto);
    if (!Number.isFinite(num) || num < 0) { erros.push(`"${campo}" inválido: "${texto}".`); return; }
    valores[campo] = num;
  });

  // ---- Ordem de exposição (inteiro, vazio = null, não 0) ----
  const ordemBruta = String(valorDe("ordem_exposicao_site") ?? "").trim();
  if (!ordemBruta) {
    valores.ordem_exposicao_site = null;
  } else {
    const ordem = parseNumeroBR(ordemBruta);
    if (!Number.isFinite(ordem) || !Number.isInteger(ordem)) {
      pendencias.push(`"Ordem de Exposição no Site" não é um número inteiro: "${ordemBruta}" — ficará sem ordem definida.`);
      valores.ordem_exposicao_site = null;
    } else {
      valores.ordem_exposicao_site = ordem;
    }
  }

  // ---- Booleanos (nunca convertidos silenciosamente) ----
  ["exibir_no_site", "destaque_site", "locar_somente_kit", "ativo", "exclusivo"].forEach((campo) => {
    const definicao = CAMPOS_ITEM.find((c) => c.key === campo);
    const { value, recognized, vazio } = parseBooleanoEstrito(valorDe(campo), definicao.default);
    valores[campo] = value;
    if (!recognized && !vazio) {
      pendencias.push(`"${definicao.header}" com valor não reconhecido: "${String(valorDe(campo)).trim()}" (aceito: Sim/Não, S/N, 1/0, Verdadeiro/Falso, True/False, X, vazio) — ficou como ${definicao.default ? "Sim" : "Não"} até ser revisado.`);
    }
  });

  // ---- Preços de locação (uma ou mais tabelas) ----
  const precos = [];
  colunasPreco.forEach((col) => {
    const bruto = celulaBruta(linhaArray[col.colIndex]);
    const texto = String(bruto ?? "").trim();
    if (!texto) return; // sem preço nessa tabela pra esse item — não é erro
    const num = parseNumeroBR(bruto);
    if (!Number.isFinite(num) || num < 0) {
      pendencias.push(`Preço inválido na coluna "${col.nomeTabela || `tabela na coluna ${col.colIndex + 1}`}": "${texto}".`);
      return;
    }
    precos.push({ colIndex: col.colIndex, valor: num });
  });

  return { ok: erros.length === 0, erros, pendencias, valores, precos };
}

export function construirPayloadItem(valores, empresaId, referenciaParaCodigo, fornecedorId) {
  return {
    empresa_id: empresaId,
    referencia: valores.referencia,
    codigo: `REF-${referenciaParaCodigo}`,
    produto: valores.produto,
    produto_base: valores.produto_base || "",
    material: valores.material || "",
    cor: valores.cor || "",
    marca_modelo: valores.marca_modelo || "",
    descricao_complementar: valores.descricao_complementar || "",
    descricao_total: montarDescricaoTotal(valores),
    largura: valores.largura,
    altura: valores.altura,
    profundidade: valores.profundidade,
    volume_cubico: Number((valores.largura * valores.altura * valores.profundidade).toFixed(3)),
    categoria: valores.categoria,
    subcategoria: valores.subcategoria || "",
    familia: valores.familia || "",
    grupo_separacao: valores.grupo_separacao || "",
    estilo: valores.estilo || "",
    custo: valores.custo ?? 0,
    valor_reposicao: valores.valor_reposicao ?? 0,
    tipo: valores.tipo,
    ativo: valores.ativo ?? true,
    exibir_no_site: valores.exibir_no_site ?? false,
    destaque_site: valores.destaque_site ?? false,
    locar_somente_kit: valores.locar_somente_kit ?? false,
    exclusivo: valores.exclusivo ?? false,
    ordem_exposicao_site: valores.ordem_exposicao_site,
    fornecedor_id: fornecedorId || null,
    fornecedor_nome_origem: valores.fornecedor_nome || null,
  };
}

// Casamento de fornecedor por nome normalizado (razão social OU fantasia).
// Só devolve um id quando há exatamente UMA correspondência seguraa —
// nunca cria fornecedor novo automaticamente (decisão documentada: mais
// seguro deixar pra revisão humana do que arriscar vincular errado ou
// criar fornecedor duplicado por uma pequena variação de nome).
export function casarFornecedor(nomeRaw, fornecedoresExistentes) {
  const nome = normalizeMatch(nomeRaw);
  if (!nome) return { fornecedorId: null, status: "vazio" };
  const candidatos = fornecedoresExistentes.filter((f) =>
    normalizeMatch(f.nome_razao_social) === nome || normalizeMatch(f.nome_fantasia) === nome
  );
  if (candidatos.length === 1) return { fornecedorId: candidatos[0].id, status: "encontrado" };
  if (candidatos.length > 1) return { fornecedorId: null, status: "ambiguo" };
  return { fornecedorId: null, status: "nao_encontrado" };
}
