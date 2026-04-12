// =========================================
// STATE
// =========================================
// Sempre reinicializar o state quando o módulo é carregado
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
    console.log('[Cronograma] Inicializando módulo');
    
    // Aguardar DOM estar pronto
    if (!document.getElementById("cronogramaBody")) {
      console.warn('[Cronograma] Aguardando DOM estar pronto...');
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    window.__cronogramaState.semanaInicioAtual = getInicioSemanaOperacional(new Date());
    atualizarCabecalhoSemana();
    console.log('[Cronograma] Carregando dados...');
    await carregarCronograma();
    console.log('[Cronograma] Módulo carregado com sucesso!');
  } catch (e) {
    console.error("[Cronograma] Erro na inicialização:", e);
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
    console.log('[Cronograma] Destruindo módulo');
    
    // Cancelar requisições pendentes
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
  // TODO: Implementar chamada para Supabase
  // const { data, error } = await supabase
  //   .from('cronograma')
  //   .select('*')
  //   .gte('data_etapa', inicioSemanaStr)
  //   .lt('data_etapa', new Date(new Date(inicioSemanaStr) + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  // Mock data para desenvolvimento
  return gerarMockCronograma();
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

// =========================================
// UTILITÁRIOS
// =========================================
// Declarar apenas se não existir (proteção contra re-carregamento)
if (typeof window.__DIAS_SEMANA === 'undefined') {
  window.__DIAS_SEMANA = ["Ter", "Qua", "Qui", "Sex", "Sáb", "Dom", "Seg"];
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

function formatWeekRange(startDate) {
  const end = new Date(startDate);
  end.setDate(end.getDate() + 6);
  return `${formatDateBR(startDate)} até ${formatDateBR(end)}`;
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
      (modo !== "triagemAgenda" && (!filtroEtapa || nomeEtapa === filtroEtapa || (filtroEtapa === "Separação" && nomeEtapa.includes("triagem"))));

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
  // TODO: Implementar lógica de pendências
  return false;
}

function analisarCronograma() {
  // TODO: Implementar análise de conflitos
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
          responsavel: "João Silva",
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
    console.log('[Cronograma] Renderização completa');
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
    // Garantir que o módulo está inicializado
    if (!window.__cronogramaState) {
      console.warn('[Cronograma] Estado não inicializado');
      return;
    }

    const tbody = document.getElementById("cronogramaBody");
    
    if (!tbody) {
      console.warn('[Cronograma] Elemento cronogramaBody não encontrado no DOM');
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
    <strong>Caminhão:</strong> ${escapeHtml(a.caminhao)}
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

    html += `<tr>`;
    html += `
<td class="col-evento" onclick="editarPedido('${pedido.pedido}')">
  <div class="evento-box">
    <span class="pedido-tag">Pedido #${escapeHtml(pedido.pedido || "-")}</span>
    <div class="evento-cliente">${escapeHtml(pedido.cliente || "-")}</div>
    <div class="evento-meta">
      <span>📍 ${escapeHtml(pedido.local || "-")}</span>
      <span>📅 ${formatDateBR(pedido.dataEvento)}</span>
    </div>
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
<div class="task-card task-evento">
  <div class="task-top">
    <div class="task-title">EVENTO</div>
    <div class="task-time"></div>
  </div>
</div>
`;
      }

      if (dias[i].length) {
        dias[i].forEach(etapa => {
          const etapaClasse = slugEtapa(etapa.etapa);
          html += `
<div class="task-card task-${etapaClasse}" style="position:relative;">
  ${etapaTemPendencia(etapa) ? `<div class="pendencia-dot"></div>` : ""}
  <div class="task-top">
    <div class="task-title">${escapeHtml(etapa.etapa || "-")}</div>
    <div class="task-time">${escapeHtml(etapa.horario || etapa.hora || "-")}</div>
  </div>

  ${!(etapa.etapa || "").toLowerCase().includes("triagem") ? `
  <div class="task-line"><strong>Caminhão:</strong> ${escapeHtml(formatarCaminhao(etapa.caminhao))}</div>
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

  const analise = analisarCronograma();
  window.analiseAtual = analise;

  const conflitosCaminhao = analise.conflitos.filter(c => c.tipo === "caminhao").length;
  const conflitosResp = analise.conflitos.filter(c => c.tipo === "responsavel").length;
  const pendencias = analise.pendencias.length;

  let htmlAlerta = "";

  if (conflitosCaminhao > 0) {
    htmlAlerta += `🚛 ${conflitosCaminhao} conflito(s) de caminhão &nbsp;&nbsp;`;
  }

  if (conflitosResp > 0) {
    htmlAlerta += `👤 ${conflitosResp} responsável duplicado &nbsp;&nbsp;`;
  }

  if (pendencias > 0) {
    htmlAlerta += `🟡 ${pendencias} pendência(s)`;
  }

  if (!htmlAlerta) {
    htmlAlerta = "✔️ Nenhum problema no cronograma";
  }

  const painel = document.getElementById("painelAlertas");
  if (painel) {
    painel.innerHTML = htmlAlerta;
  }
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
      console.warn('Módulo cronograma não está inicializado');
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

// Funções de interface (placeholders)
function abrirAgendaNova() {
  if (!window.__cronogramaState) {
    console.warn('Módulo cronograma não está ativo');
    return;
  }
  console.log('Abrir agenda nova');
}

function abrirNovoPedido() {
  if (!window.__cronogramaState) {
    console.warn('Módulo cronograma não está ativo');
    return;
  }
  console.log('Abrir novo pedido');
}

function abrirDetalhesAlertas() {
  if (!window.__cronogramaState) {
    console.warn('Módulo cronograma não está ativo');
    return;
  }
  console.log('Abrir detalhes alertas');
}

function editarPedido(pedido) {
  if (!window.__cronogramaState) {
    console.warn('Módulo cronograma não está ativo');
    return;
  }
  console.log('Editar pedido:', pedido);
}

function abrirSenhaAgenda(element) {
  if (!window.__cronogramaState) {
    console.warn('Módulo cronograma não está ativo');
    return;
  }
  console.log('Abrir senha agenda:', element);
}