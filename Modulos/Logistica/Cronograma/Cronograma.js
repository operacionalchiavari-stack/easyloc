// =========================================
// STATE
// =========================================
// Sempre reinicializar o state quando o modulo e carregado
window.__cronogramaState = {
  semanaInicioAtual: null,
  cronogramaData: [],
  agendaData: [],
  filtroEtapa: 'semAgenda',
  filtroResponsavel: '',
  filtroCaminhao: '',
  loading: false,
  abortController: null
};

// =========================================
// INIT
// =========================================
window.initCronograma = async function() {
  try {
    console.log('[Cronograma] Inicializando modulo');
    
    // Aguardar DOM estar pronto
    if (!document.getElementById("cronogramaBody")) {
      console.warn('[Cronograma] Aguardando DOM estar pronto...');
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    window.__cronogramaState.semanaInicioAtual = getInicioSemanaOperacional(new Date());
    atualizarCabecalhoSemana();
    console.log('[Cronograma] Carregando dados...');
    await carregarCronograma();
    console.log('[Cronograma] Modulo carregado com sucesso!');
  } catch (e) {
    console.error("[Cronograma] Erro na inicializacao:", e);
    // Tentar mostrar mensagem de erro no body
    const tbody = document.getElementById("cronogramaBody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Erro ao carregar cronograma: ${escapeHtml(e.message)}</td></tr>`;
    }
  } finally {
    console.log('[Cronograma] Finalizando carregamento...');
    window.finalizarCarregamentoModulo?.();
  }
};

window.__moduleInit = window.initCronograma;

// =========================================
// DESTRUIDOR
// =========================================
window.__activeModuleDestroy = function() {
  try {
    console.log('[Cronograma] Destruindo modulo');
    
    // Cancelar requisicoes pendentes
    if (window.__cronogramaState && window.__cronogramaState.abortController) {
      window.__cronogramaState.abortController.abort();
    }
    
    // Limpar estado completamente
    window.__cronogramaState = null;
    delete window.__cronogramaState;
    
    // Remover listeners de eventos globais se houver
    // (proteja contra memory leaks)
    
  } catch (e) {
    console.warn('[Cronograma] Erro ao destruir:', e);
  }
};

// =========================================
// API (PRONTO PARA SUPABASE)
// =========================================
async function buscarCronograma(inicioSemanaStr) {
  const supabase = window.supabaseClient;
  const empresaId = window.__CONTEXT?.empresa_id;

  if (!supabase || !empresaId) {
    return [];
  }

  const inicio = parseDateAny(inicioSemanaStr);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);

  const { data, error } = await supabase
    .from("cronograma_logistico")
    .select("*")
    .eq("empresa_id", empresaId)
    .gte("data_etapa", inicioSemanaStr)
    .lt("data_etapa", formatDateISO(fim))
    .order("data_etapa", { ascending: true })
    .order("horario", { ascending: true });

  if (error) {
    throw error;
  }

  const pedidos = new Map();
  const pedidoIds = [...new Set((data || []).map((row) => row.pedido_id).filter(Boolean))];
  const detalhesPedidos = new Map();
  const detalhesLocais = new Map();

  if (pedidoIds.length) {
    const { data: pedidosDetalhes, error: pedidosError } = await supabase
      .from("separacoes_pedidos")
      .select("id,numero_pedido,cliente_nome,contato_cliente,tipo_evento,local_id,local_nome,data_evento,data_entrega,data_coleta,valor_total,status,status_comercial,observacoes")
      .eq("empresa_id", empresaId)
      .in("id", pedidoIds);

    if (pedidosError) {
      console.warn("[Cronograma] Nao foi possivel carregar detalhes dos pedidos:", pedidosError);
    }

    (pedidosDetalhes || []).forEach((pedido) => detalhesPedidos.set(pedido.id, pedido));

    const localIds = [...new Set((pedidosDetalhes || []).map((pedido) => pedido.local_id).filter(Boolean))];
    if (localIds.length) {
      let { data: locais, error: locaisError } = await supabase
        .from("locais_empresas")
        .select("id,endereco,numero_endereco,ponto_referencia,tags")
        .eq("empresa_id", empresaId)
        .in("id", localIds);

      if (locaisError) {
        const fallback = await supabase
          .from("locais_empresas")
          .select("id,endereco,numero_endereco,ponto_referencia")
          .eq("empresa_id", empresaId)
          .in("id", localIds);
        locais = fallback.data || [];
        locaisError = fallback.error;
      }

      if (locaisError) {
        console.warn("[Cronograma] Nao foi possivel carregar detalhes dos locais:", locaisError);
      }

      (locais || []).forEach((local) => detalhesLocais.set(local.id, local));
    }
  }

  (data || []).forEach((row) => {
    const key = row.pedido_id || row.numero_pedido || row.id;
    const detalhePedido = detalhesPedidos.get(row.pedido_id) || {};
    const detalheLocal = detalhesLocais.get(detalhePedido.local_id) || {};

    if (!pedidos.has(key)) {
      pedidos.set(key, {
        pedido: detalhePedido.numero_pedido || row.numero_pedido || "-",
        pedidoId: row.pedido_id,
        cliente: detalhePedido.cliente_nome || row.cliente_nome || "-",
        contato: detalhePedido.contato_cliente || "",
        evento: detalhePedido.tipo_evento || row.tipo_evento || "",
        local: detalhePedido.local_nome || row.local_nome || "-",
        endereco: montarEnderecoLocal(detalhePedido, detalheLocal),
        localTags: montarTagsLocal(detalhePedido, detalheLocal),
        dataEvento: detalhePedido.data_evento || row.data_evento || "",
        dataEntrega: detalhePedido.data_entrega || "",
        dataColeta: detalhePedido.data_coleta || "",
        valorTotal: detalhePedido.valor_total || 0,
        statusComercial: detalhePedido.status_comercial || detalhePedido.status || "",
        etapas: []
      });
    }

    pedidos.get(key).etapas.push({
      id: row.id,
      etapa: row.etapa,
      dataEtapa: row.data_etapa,
      horario: String(row.horario || "08:00").slice(0, 5),
      caminhao: row.caminhao || "",
      responsavel: row.responsavel || "",
      equipe: row.equipe || "",
      observacao: row.observacao || "",
      status: row.status || "programado"
    });
  });

  return Array.from(pedidos.values());
}

async function buscarAgenda() {
  // TODO: Implementar chamada para Supabase
  // const { data, error } = await supabase
  //   .from('agenda')
  //   .select('*');

  return [];
}

async function salvarPedido(payload) {
  // TODO: Implementar chamada para Supabase
  console.log('Salvando pedido:', payload);
  return true;
}

async function salvarAgenda(dados) {
  // TODO: Implementar chamada para Supabase
  console.log('Salvando agenda:', dados);
  return true;
}

async function carregarLocalCronograma(localId, empresaId) {
  const supabase = window.supabaseClient;
  if (!supabase || !localId || !empresaId) return { data: null };

  let resposta = await supabase
    .from("locais_empresas")
    .select("id,endereco,numero_endereco,ponto_referencia,tags")
    .eq("empresa_id", empresaId)
    .eq("id", localId)
    .maybeSingle();

  if (resposta.error) {
    resposta = await supabase
      .from("locais_empresas")
      .select("id,endereco,numero_endereco,ponto_referencia")
      .eq("empresa_id", empresaId)
      .eq("id", localId)
      .maybeSingle();
  }

  return resposta;
}

// =========================================
// UTILITARIOS
// =========================================
// Declarar apenas se nao existir (protecao contra re-carregamento)
if (typeof window.__DIAS_SEMANA === 'undefined') {
  window.__DIAS_SEMANA = ["Ter", "Qua", "Qui", "Sex", "Sab", "Dom", "Seg"];
}

function getInicioSemanaOperacional(dataBase) {
  const d = new Date(dataBase);
  d.setHours(0, 0, 0, 0);

  const day = d.getDay();
  let diff;

  if (day === 2) {
    diff = 0;
  } else if (day > 2) {
    diff = day - 2;
  } else {
    diff = day + 5;
  }

  d.setDate(d.getDate() - diff);
  return d;
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateAny(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-");
      return new Date(Number(y), Number(m) - 1, Number(d));
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      const [d, m, y] = value.split("/");
      return new Date(Number(y), Number(m) - 1, Number(d));
    }

    const d = new Date(value);
    if (!isNaN(d)) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }

  return null;
}

function formatDateBR(value) {
  const d = parseDateAny(value);
  if (!d) return "-";
  return d.toLocaleDateString("pt-BR");
}

function extractTextFromHtml(html) {
  if (!html) return "";
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return limparTextoCronograma(temp.innerText.replace(/\s+/g, " ").trim());
}

function limparTextoCronograma(value) {
  return String(value || "")
    .replace(/Ã£/g, "a")
    .replace(/Ã¡/g, "a")
    .replace(/Ã¢/g, "a")
    .replace(/Ã©/g, "e")
    .replace(/Ãª/g, "e")
    .replace(/Ã­/g, "i")
    .replace(/Ã³/g, "o")
    .replace(/Ã´/g, "o")
    .replace(/Ãº/g, "u")
    .replace(/Ã§/g, "c")
    .replace(/Ã‰/g, "E")
    .replace(/Ã‡/g, "C");
}

function montarEnderecoLocal(pedido = {}, local = {}) {
  const fromHtml = extractTextFromHtml(pedido.observacoes?.local_html || "");
  if (fromHtml) return fromHtml;

  const endereco = limparTextoCronograma([local.endereco, local.numero_endereco].filter(Boolean).join(", "));
  const referencia = local.ponto_referencia ? `Referencia: ${limparTextoCronograma(local.ponto_referencia)}` : "";
  return [endereco, referencia].filter(Boolean).join(" | ");
}

function montarTagsLocal(pedido = {}, local = {}) {
  const html = pedido.observacoes?.local_tags_html || "";
  if (html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    const tagsHtml = Array.from(temp.querySelectorAll("*"))
      .map((el) => limparTextoCronograma(el.textContent.trim()))
      .filter(Boolean);
    if (tagsHtml.length) return [...new Set(tagsHtml)];
  }

  let tags = local.tags || {};
  if (typeof tags === "string") {
    try {
      tags = JSON.parse(tags);
    } catch (_) {
      tags = {};
    }
  }
  const observacoes = Array.isArray(tags.observacoes)
    ? tags.observacoes.map(limparTextoCronograma).filter(Boolean)
    : [];
  const normalizar = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const entradas = [
    ...Object.entries(tags).filter(([, value]) => value === true).map(([key]) => key),
    ...Object.values(tags).filter((value) => typeof value === "string")
  ].map(normalizar);
  const tem = (...nomes) => nomes.some((nome) => entradas.some((entrada) => entrada.includes(normalizar(nome))));
  const inferidas = [
    tem("baldeacao", "baldeacao necessaria") ? "Necessita Baldeacao" : "",
    tem("escada") ? "Tem escadas" : "",
    tem("elevador") ? "Tem Elevador" : "",
    tem("caminhao perto", "caminhao_proximo", "caminhao proximo") ? "Caminhao para perto" : ""
  ].filter(Boolean);
  return [...new Set([...observacoes, ...inferidas])];
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatWeekRange(startDate) {
  const end = new Date(startDate);
  end.setDate(end.getDate() + 6);
  return `${formatDateBR(startDate)} ate ${formatDateBR(end)}`;
}

function slugEtapa(etapa) {
  const e = (etapa || "").toLowerCase().trim();

  if (e.includes("triagem")) return "separacao";
  if (e === "carregamento") return "carregamento";
  if (e === "montagem") return "montagem";
  if (e === "evento") return "evento";
  if (e === "desmontagem") return "desmontagem";

  return "separacao";
}

function ordenarPedidos(lista) {
  return [...lista].sort((a, b) => {
    const dataA = descobrirDataPrincipal(a);
    const dataB = descobrirDataPrincipal(b);
    return dataA - dataB;
  });
}

function descobrirDataPrincipal(pedido) {
  if (!pedido || !Array.isArray(pedido.etapas)) return new Date(2100, 0, 1);

  const montagem = pedido.etapas.find(e => (e.etapa || "").toLowerCase() === "montagem");
  if (montagem) {
    return combinarDataHora(montagem.dataEtapa || montagem.data, montagem.horario || montagem.hora);
  }

  const evento = pedido.etapas.find(e => (e.etapa || "").toLowerCase() === "evento");
  if (evento) {
    return combinarDataHora(evento.dataEtapa || evento.data, evento.horario || evento.hora);
  }

  const primeira = pedido.etapas[0];
  if (primeira) {
    return combinarDataHora(primeira.dataEtapa || primeira.data, primeira.horario || primeira.hora);
  }

  return new Date(2100, 0, 1);
}

function combinarDataHora(data, hora) {
  const d = parseDateAny(data) || new Date(2100, 0, 1);
  const horaStr = hora || "23:59";
  const [hh, mm] = horaStr.split(":");
  d.setHours(Number(hh || 0), Number(mm || 0), 0, 0);
  return d;
}

function getDayIndexTerSeg(value) {
  if (!value) return -1;

  const dataStr = String(value).split("T")[0].split(" ")[0];
  const d = new Date(dataStr + "T00:00:00");

  const inicioStr = formatDateISO(window.__cronogramaState.semanaInicioAtual);
  const inicio = new Date(inicioStr + "T00:00:00");

  const diff = Math.floor((d - inicio) / (1000 * 60 * 60 * 24));

  return (diff >= 0 && diff <= 6) ? diff : -1;
}

function filtrarEtapas(etapas) {
  let filtroEtapa = window.__cronogramaState.filtroEtapa;
  const filtroResponsavel = window.__cronogramaState.filtroResponsavel;
  const filtroCaminhao = window.__cronogramaState.filtroCaminhao;

  const modo = filtroEtapa;

  if (filtroEtapa === "semAgenda" || filtroEtapa === "comAgenda" || filtroEtapa === "triagemAgenda") {
    filtroEtapa = "";
  }

  return (etapas || []).filter(e => {
    const nomeEtapa = (e.etapa || "").toLowerCase();

    const okEtapa = (modo === "triagemAgenda" && nomeEtapa.includes("triagem")) ||
      (modo !== "triagemAgenda" && (!filtroEtapa || nomeEtapa === filtroEtapa || (filtroEtapa === "Separacao" && nomeEtapa.includes("triagem"))));

    const okResp = !filtroResponsavel || (e.responsavel || "").toLowerCase().includes(filtroResponsavel);
    const okCam = !filtroCaminhao || (e.caminhao || "").toLowerCase().includes(filtroCaminhao);

    return okEtapa && okResp && okCam;
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatarCaminhao(caminhao) {
  if (!caminhao) return "-";
  return caminhao.split("|").join(", ");
}

function etapaTemPendencia(etapa) {
  // TODO: Implementar logica de pendencias
  return false;
}

function analisarCronograma() {
  // TODO: Implementar analise de conflitos
  return {
    conflitos: [],
    pendencias: []
  };
}

function gerarMockCronograma() {
  // Mock data para desenvolvimento
  return [
    {
      pedido: "2451",
      cliente: "Cliente Exemplo",
      local: "Rio de Janeiro, RJ",
      dataEvento: "2026-04-15",
      etapas: [
        {
          id: "1",
          etapa: "Carregamento",
          dataEtapa: "2026-04-10",
          horario: "08:00",
          caminhao: "G|XL",
          responsavel: "Joao Silva",
          equipe: "Equipe A",
          observacao: ""
        },
        {
          id: "2",
          etapa: "Montagem",
          dataEtapa: "2026-04-12",
          horario: "14:00",
          caminhao: "",
          responsavel: "Maria Santos",
          equipe: "Equipe B",
          observacao: ""
        }
      ]
    }
  ];
}

// =========================================
// RENDER
// =========================================
function atualizarCabecalhoSemana() {
  const label = document.getElementById("weekLabel");
  if (label) {
    label.textContent = `Semana: ${formatWeekRange(window.__cronogramaState.semanaInicioAtual)}`;
  }

  for (let i = 0; i < 7; i++) {
    const d = new Date(window.__cronogramaState.semanaInicioAtual);
    d.setDate(d.getDate() + i);
    const th = document.getElementById(`th${i}`);
    if (th) {
      th.textContent = `${window.__DIAS_SEMANA[i]} ${d.toLocaleDateString("pt-BR")}`;
    }
  }
}

async function carregarCronograma() {
  try {
    console.log('[Cronograma] Iniciando carregamento de dados...');
    mostrarLoading("Carregando cronograma...");

    const inicioSemanaStr = formatDateISO(window.__cronogramaState.semanaInicioAtual);

    window.__cronogramaState.cronogramaData = await buscarCronograma(inicioSemanaStr);
    window.__cronogramaState.agendaData = await buscarAgenda();
    
    console.log('[Cronograma] Dados carregados, renderizando...');
    renderCronograma();
    console.log('[Cronograma] Renderizacao completa');
  } catch (error) {
    console.error('[Cronograma] Erro ao carregar dados:', error);
    const tbody = document.getElementById("cronogramaBody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Erro ao carregar cronograma: ${escapeHtml(error.message || 'Desconhecido')}</td></tr>`;
    }
  } finally {
    esconderLoading();
  }
}

function renderCronograma() {
  try {
    // Garantir que o modulo esta inicializado
    if (!window.__cronogramaState) {
      console.warn('[Cronograma] Estado nao inicializado');
      return;
    }

    const tbody = document.getElementById("cronogramaBody");
    
    if (!tbody) {
      console.warn('[Cronograma] Elemento cronogramaBody nao encontrado no DOM');
      return;
    }

    if (!window.__cronogramaState.cronogramaData.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Nenhum pedido encontrado para esta semana.</td></tr>`;
      return;
    }

    const listaOrdenada = ordenarPedidos(window.__cronogramaState.cronogramaData);
    let html = "";

    const filtro = window.__cronogramaState.filtroEtapa;

  if (filtro === "comAgenda" || filtro === "triagemAgenda") {
    html += `<tr class="linha-agenda">`;
    html += `<td class="col-evento" style="text-align:center; vertical-align:middle;">
      <strong>Cronograma Interno</strong>
    </td>`;

    for (let i = 0; i < 7; i++) {
      html += `<td class="day-cell"><div class="cards">`;

      const dataDia = formatDateISO(new Date(window.__cronogramaState.semanaInicioAtual.getFullYear(),
        window.__cronogramaState.semanaInicioAtual.getMonth(),
        window.__cronogramaState.semanaInicioAtual.getDate() + i));

      const eventos = (window.__cronogramaState.agendaData || []).filter(a => a.data === dataDia);

      eventos.forEach(a => {
        const tipo = (a.tipo || "").toLowerCase();

        html += `
<div class="task-card agenda-card agenda-${tipo} agenda-setor-${(a.setor || "").toLowerCase().trim().replace(/\s+/g, "")}"
     onclick='abrirSenhaAgenda(this)'
     data-envio="${a.envio}"
     data-responsavel="${a.responsavel}"
     data-info='${encodeURIComponent(JSON.stringify(a).replace(/'/g, "%27"))}'
     style="cursor:pointer;">

  <div class="task-top">
    <div class="task-title">${escapeHtml(a.tipo || "AGENDA")}</div>
  </div>

  <div class="task-line"><strong>Para:</strong> ${escapeHtml(a.setor || "-")}</div>
  <div class="task-line"><strong>Enviado por:</strong> ${escapeHtml(a.responsavel || "-")}</div>

  ${a.caminhao ? `
  <div class="task-line">
    <strong>Caminhao:</strong> ${escapeHtml(a.caminhao)}
  </div>
  ` : ``}

  ${a.equipe ? `
  <div class="task-line">
    <strong>Equipe:</strong> ${escapeHtml(a.equipe)}
  </div>
  ` : ``}

  ${a.descricao ? `
  <div class="task-line" style="color:#dc2626;">
    <strong>Obs:</strong> ${escapeHtml(a.descricao)}
  </div>
  ` : ``}

</div>
`;
      });

      html += `</div></td>`;
    }

    html += `</tr>`;
  }

  listaOrdenada.forEach(pedido => {
    const etapasFiltradas = filtrarEtapas(pedido.etapas || []);

    const dias = [[], [], [], [], [], [], []];

    etapasFiltradas.forEach(etapa => {
      const idx = getDayIndexTerSeg(etapa.dataEtapa || etapa.data);
      if (idx >= 0) {
        dias[idx].push(etapa);
      }
    });

    dias.forEach(arr => {
      arr.sort((a, b) => {
        const ta = combinarDataHora(a.dataEtapa || a.data, a.horario || a.hora);
        const tb = combinarDataHora(b.dataEtapa || b.data, b.horario || b.hora);
        return ta - tb;
      });
    });

    const tagsLocal = (pedido.localTags || [])
      .map((tag) => `<span>${escapeHtml(tag)}</span>`)
      .join("");

    html += `<tr>`;
    html += `
<td class="col-evento" onclick="abrirPreviewPedidoCronograma('${escapeHtml(pedido.pedidoId || "")}')" title="Visualizar pedido">
  <div class="evento-box">
    <span class="pedido-tag">Pedido #${escapeHtml(pedido.pedido || "-")}</span>
    <div class="evento-cliente">${escapeHtml(pedido.cliente || "-")}</div>
    <div class="evento-meta">
      <span class="evento-local">${escapeHtml(pedido.local || "-")}</span>
      ${pedido.endereco ? `<span class="evento-endereco">${escapeHtml(pedido.endereco)}</span>` : ""}
      <span>${formatDateBR(pedido.dataEvento)}</span>
    </div>
    ${tagsLocal ? `<div class="evento-tags">${tagsLocal}</div>` : ""}
  </div>
</td>
`;

    for (let i = 0; i < 7; i++) {
      html += `<td class="day-cell"><div class="cards">`;

      const dataDia = formatDateISO(new Date(window.__cronogramaState.semanaInicioAtual.getFullYear(),
        window.__cronogramaState.semanaInicioAtual.getMonth(),
        window.__cronogramaState.semanaInicioAtual.getDate() + i));

      let dataEvento = pedido.dataEvento || "";
      if (dataEvento.includes("/")) {
        const [d, m, y] = dataEvento.split("/");
        dataEvento = `${y}-${m}-${d}`;
      } else {
        dataEvento = dataEvento.split(" ")[0];
      }

      if (dataEvento === dataDia) {
        html += `
<div class="task-card task-evento" onclick="abrirPreviewPedidoCronograma('${escapeHtml(pedido.pedidoId || "")}')" title="Visualizar pedido" style="cursor:pointer;">
  <div class="task-top">
    <div class="task-title">EVENTO</div>
    <div class="task-time"></div>
  </div>
</div>
`;
      }

      if (dias[i].length) {
        dias[i].forEach(etapa => {
          if ((etapa.etapa || "").toLowerCase() === "evento") return;
          const etapaClasse = slugEtapa(etapa.etapa);
          html += `
<div class="task-card task-${etapaClasse}" onclick="abrirPreviewPedidoCronograma('${escapeHtml(pedido.pedidoId || "")}')" title="Visualizar pedido" style="position:relative; cursor:pointer;">
  ${etapaTemPendencia(etapa) ? `<div class="pendencia-dot"></div>` : ""}
  <div class="task-top">
    <div class="task-title">${escapeHtml(etapa.etapa || "-")}</div>
    <div class="task-time">${escapeHtml(etapa.horario || etapa.hora || "-")}</div>
  </div>

  ${!(etapa.etapa || "").toLowerCase().includes("triagem") ? `
  <div class="task-line"><strong>Caminhao:</strong> ${escapeHtml(formatarCaminhao(etapa.caminhao))}</div>
  ` : ``}
  <div class="task-line"><strong>Resp:</strong> ${escapeHtml(etapa.responsavel || "-")}</div>
  <div class="task-line"><strong>Equipe:</strong> ${escapeHtml(etapa.equipe || "-")}</div>
  ${etapa.observacao || etapa.obs ? `<div class="task-line" style="color:#dc2626;"><strong>Obs:</strong> ${escapeHtml(etapa.observacao || etapa.obs)}</div>` : ``}
</div>
`;
        });
      }

      html += `</div></td>`;
    }

    html += `</tr>`;
  });

  tbody.innerHTML = html || `<tr><td colspan="8" class="empty-state">Nenhum pedido encontrado para esta semana.</td></tr>`;

  window.analiseAtual = analisarCronograma();
  } catch (error) {
    console.error('[Cronograma] Erro ao renderizar cronograma:', error);
    const tbody = document.getElementById("cronogramaBody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Erro ao renderizar: ${escapeHtml(error.message || 'Erro desconhecido')}</td></tr>`;
    }
  }
}

// =========================================
// EVENTOS
// =========================================
function mudarSemana(qtdDias) {
  try {
    if (!window.__cronogramaState || !window.__cronogramaState.semanaInicioAtual) {
      console.warn('Modulo cronograma nao esta inicializado');
      return;
    }
    
    window.__cronogramaState.semanaInicioAtual.setDate(window.__cronogramaState.semanaInicioAtual.getDate() + qtdDias);
    window.__cronogramaState.semanaInicioAtual = getInicioSemanaOperacional(window.__cronogramaState.semanaInicioAtual);
    atualizarCabecalhoSemana();
    carregarCronograma();
  } catch (e) {
    console.error('Erro ao mudar semana:', e);
  }
}

function mostrarLoading(texto = "Carregando...") {
  // TODO: Implementar loading global
  console.log(texto);
}

function esconderLoading() {
  // TODO: Implementar esconder loading
}

// Funcoes de interface (placeholders)
function abrirAgendaNova() {
  if (!window.__cronogramaState) {
    console.warn('Modulo cronograma nao esta ativo');
    return;
  }
  console.log('Abrir agenda nova');
}

function abrirNovoPedido() {
  if (!window.__cronogramaState) {
    console.warn('Modulo cronograma nao esta ativo');
    return;
  }
  console.log('Abrir novo pedido');
}

async function abrirPreviewPedidoCronograma(pedidoId) {
  if (!window.__cronogramaState || !pedidoId) {
    console.warn("Pedido sem identificador para visualizacao.");
    return;
  }

  const supabase = window.supabaseClient;
  const empresaId = window.__CONTEXT?.empresa_id;
  if (!supabase || !empresaId) return;

  const modal = document.getElementById("cronogramaPreviewModal");
  const titulo = document.getElementById("cronogramaPreviewTitulo");
  const body = document.getElementById("cronogramaPreviewBody");
  if (!modal || !body) return;

  body.innerHTML = `<div class="empty-state">Carregando visualizacao...</div>`;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  try {
    const { data: pedido, error } = await supabase
      .from("separacoes_pedidos")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("id", pedidoId)
      .single();

    if (error || !pedido) throw error || new Error("Pedido nao encontrado");

    const itensPromise = supabase
      .from("separacoes_itens")
      .select("*, itens:item_id(codigo,produto,descricao_total,foto_url,valor_locacao,valor_reposicao)")
      .eq("empresa_id", empresaId)
      .eq("separacao_pedido_id", pedidoId)
      .order("created_at", { ascending: true });

    const empresaPromise = supabase
      .from("empresas")
      .select("nome,logo_url")
      .eq("id", empresaId)
      .maybeSingle();

    const localPromise = pedido.local_id
      ? carregarLocalCronograma(pedido.local_id, empresaId)
      : Promise.resolve({ data: null });

    const [{ data: itens, error: itensError }, { data: empresa }, { data: local }] = await Promise.all([
      itensPromise,
      empresaPromise,
      localPromise
    ]);

    if (itensError) console.warn("[Cronograma] Erro ao carregar itens do preview:", itensError);

    const parcelas = Array.isArray(pedido.observacoes?.parcelas_financeiras)
      ? pedido.observacoes.parcelas_financeiras
      : [];
    const endereco = montarEnderecoLocal(pedido, local || {});
    const tags = montarTagsLocal(pedido, local || {});
    const logo = empresa?.logo_url
      ? `<img class="cron-preview-logo" src="${escapeHtml(empresa.logo_url)}" alt="${escapeHtml(empresa.nome || "Logo")}">`
      : `<div class="cron-preview-logo-fallback">${escapeHtml(empresa?.nome || "EasyLoc")}</div>`;

    const itensRows = (itens || []).map((item) => {
      const cadastro = item.itens || {};
      const nome = item.item_nome || cadastro.descricao_total || cadastro.produto || "Item";
      const qtd = Number(item.quantidade_solicitada || 0);
      const unit = Number(cadastro.valor_locacao || 0);
      return `
        <tr>
          <td>${qtd}</td>
          <td>${item.foto_url || cadastro.foto_url ? `<img src="${escapeHtml(item.foto_url || cadastro.foto_url)}" alt="">` : ""}</td>
          <td><strong>${escapeHtml(nome)}</strong><small>${escapeHtml(item.codigo_item || cadastro.codigo || "")}</small></td>
          <td>${formatCurrency(unit)}</td>
          <td>${formatCurrency(qtd * unit)}</td>
          <td>${formatCurrency(cadastro.valor_reposicao || 0)}</td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="6" class="empty-state">Nenhum item salvo neste pedido.</td></tr>`;

    const parcelasRows = parcelas.map((parcela, index) => `
      <tr>
        <td>${parcela.numero || index + 1}</td>
        <td>${escapeHtml(parcela.tipo || `Parcela ${index + 1}`)}</td>
        <td>${formatDateBR(parcela.vencimento)}</td>
        <td>${formatCurrency(parcela.valor || 0)}</td>
        <td>${escapeHtml(parcela.metodo || "A combinar")}</td>
        <td><span class="cron-preview-badge-ok">${escapeHtml(parcela.status || "Programado")}</span></td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="empty-state">Programacao de pagamento nao informada.</td></tr>`;

    if (titulo) titulo.textContent = `Pedido #${pedido.numero_pedido || "-"}`;

    body.innerHTML = `
      <main class="cron-preview-page">
        <header class="cron-preview-hero">
          <div class="cron-preview-brand">
            ${logo}
            <div>
              <h1>Proposta comercial</h1>
              <p>Locacao de mobiliario e decoracao de eventos.</p>
            </div>
          </div>
          <div class="cron-preview-pedido-box">
            <span>Pedido</span>
            <strong>#${escapeHtml(pedido.numero_pedido || "-")}</strong>
            <em>${escapeHtml(pedido.status_comercial || pedido.status || "orcamento")}</em>
          </div>
        </header>

        <section class="cron-preview-section">
          <div class="cron-preview-section-title">
            <h2>Dados do evento</h2>
            <span>${new Date().toLocaleDateString("pt-BR")}</span>
          </div>
          <div class="cron-preview-grid">
            <div><span>Cliente</span><strong>${escapeHtml(pedido.cliente_nome || "-")}</strong></div>
            <div><span>Contato</span><strong>${escapeHtml(pedido.contato_cliente || "-")}</strong></div>
            <div><span>Evento</span><strong>${escapeHtml(pedido.tipo_evento || "-")}</strong></div>
            <div><span>Data do evento</span><strong>${formatDateBR(pedido.data_evento || pedido.data_hora)}</strong></div>
            <div><span>Entrega / Coleta</span><strong>${formatDateBR(pedido.data_entrega)} / ${formatDateBR(pedido.data_coleta)}</strong></div>
            <div class="wide"><span>Local</span><strong>${escapeHtml(pedido.local_nome || "-")}</strong></div>
            <div class="wide"><span>Endereco e referencia</span><strong>${escapeHtml(endereco || "-")}</strong></div>
          </div>
          ${tags.length ? `<div class="cron-preview-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        </section>

        <section class="cron-preview-section">
          <h2>Itens do pedido</h2>
          <table>
            <thead><tr><th>Qtd</th><th>Foto</th><th>Item</th><th>Locacao</th><th>Total</th><th>Reposicao</th></tr></thead>
            <tbody>${itensRows}</tbody>
          </table>
        </section>

        <section class="cron-preview-section cron-preview-finance">
          <div>
            <h2>Programacao de pagamento</h2>
            <table>
              <thead><tr><th>#</th><th>Tipo</th><th>Vencimento</th><th>Valor</th><th>Metodo</th><th>Status</th></tr></thead>
              <tbody>${parcelasRows}</tbody>
            </table>
          </div>
          <div>
            <h2>Resumo financeiro</h2>
            <div class="cron-preview-total-row">
              <span>Total do pedido</span>
              <strong>${formatCurrency(pedido.valor_total || 0)}</strong>
            </div>
          </div>
        </section>
      </main>
    `;
  } catch (error) {
    console.error("[Cronograma] Erro ao abrir preview:", error);
    body.innerHTML = `<div class="empty-state">Nao foi possivel abrir a visualizacao do pedido.</div>`;
  }
}

function fecharPreviewCronograma() {
  const modal = document.getElementById("cronogramaPreviewModal");
  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
}

function imprimirPreviewCronograma() {
  window.print();
}

window.abrirPreviewPedidoCronograma = abrirPreviewPedidoCronograma;
window.fecharPreviewCronograma = fecharPreviewCronograma;
window.imprimirPreviewCronograma = imprimirPreviewCronograma;

function abrirSenhaAgenda(element) {
  if (!window.__cronogramaState) {
    console.warn('Modulo cronograma nao esta ativo');
    return;
  }
  console.log('Abrir senha agenda:', element);
}
