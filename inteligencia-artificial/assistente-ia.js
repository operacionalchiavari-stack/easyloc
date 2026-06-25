console.log("🔥 assistente-ia.js FOI CARREGADO");
(function(){
if (typeof window.__liaAssistenteDestroy === "function") {
  try { window.__liaAssistenteDestroy(); } catch (err) { console.warn("Erro ao limpar Lia anterior:", err); }
}

setTimeout(() => {
  window.finalizarCarregamentoModulo?.();
}, 0);

window.__SUPABASE_ANON_KEY__ =
  window.__SUPABASE_ANON_KEY__ ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3ZW11b2h0dnd2cmR6Znh3cm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NjE3MjAsImV4cCI6MjA4MTIzNzcyMH0.Q-hy9slxlojDNUlnCCZjZIn7TYhCSvnhT7NxWbP-JfM";

function avisar(mensagem, titulo = "Atenção", tipo = "aviso") {
  if (typeof window.alerta === "function") {
    window.alerta(mensagem, titulo, tipo);
    return;
  }
  alert(mensagem);
}

function getEasyLocContext() {
  if (window.__CONTEXT?.empresa_id) return window.__CONTEXT;
  try {
    if (window.parent && window.parent !== window && window.parent.__CONTEXT?.empresa_id) {
      window.__CONTEXT = window.parent.__CONTEXT;
      return window.__CONTEXT;
    }
  } catch (error) {
    console.warn("Lia: contexto do dashboard indisponivel.", error);
  }
  return window.__CONTEXT || null;
}

function getEmpresaIdLogada() {
  const context = getEasyLocContext();
  if (!context?.empresa_id) {
    throw new Error("Empresa não identificada. Contexto global não carregado.");
  }
  return context.empresa_id;
}

async function getSupabaseAuthHeaders() {
  if (!window.supabaseClient?.auth) {
    throw new Error("Cliente Supabase não carregado.");
  }

  const { data: { session }, error } = await window.supabaseClient.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  return {
    apikey: window.supabaseClient?.supabaseKey || window.__SUPABASE_ANON_KEY__,
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function buscarDadosPorFonte({ categoria, empresa_id }) {
  const SUPABASE_URL = 'https://awemuohtvwvrdzfxwrmd.supabase.co';

  console.group('🧠 buscarDadosPorFonte');
  console.log('➡️ categoria recebida:', categoria);
  console.log('➡️ empresa_id:', empresa_id);

  const fontesUrl =
    `${SUPABASE_URL}/rest/v1/ia_fontes_dados` +
    `?empresa_id=eq.${empresa_id}` +
    `&ativo=eq.true` +
    `&palavras_chave=cs.{${encodeURIComponent(categoria)}}`;

  console.log('📡 URL fontes:', fontesUrl);

  const authHeaders = await getSupabaseAuthHeaders();

  const fonteRes = await fetch(fontesUrl, {
    headers: {
      ...authHeaders,
    },
  });

  if (!fonteRes.ok) {
    const erro = await fonteRes.text();
    console.error('❌ ERRO AO BUSCAR FONTES:', erro);
    console.groupEnd();
    throw new Error('Erro ao buscar configuração da IA.');
  }

  const fontes = await fonteRes.json();

  console.log('📚 fontes encontradas:', fontes);
  console.log('📚 total de fontes:', fontes.length);

  if (!fontes.length) {
    console.warn('⚠️ Nenhuma fonte configurada para essa categoria');
    console.groupEnd();
    return [];
  }

  let dadosAgregados = [];

  for (const fonte of fontes) {
    console.group(`📦 Fonte: ${fonte.titulo || fonte.tabela_nome}`);

    const campos = Array.isArray(fonte.campos_permitidos)
      ? fonte.campos_permitidos.join(',')
      : '*';

    const dadosUrl =
      `${SUPABASE_URL}/rest/v1/${fonte.tabela_nome}` +
      `?empresa_id=eq.${empresa_id}` +
      `&select=${campos}` +
      `&limit=50`;

    console.log('📡 URL dados:', dadosUrl);
    console.log('🧾 campos:', campos);

    const dadosRes = await fetch(dadosUrl, {
      headers: {
        ...authHeaders,
      },
    });

    if (!dadosRes.ok) {
      const erroTexto = await dadosRes.text();
      console.error('❌ ERRO NA TABELA:', fonte.tabela_nome, erroTexto);
      console.groupEnd();
      continue;
    }

    const registros = await dadosRes.json();

    console.log('📊 registros encontrados:', registros.length);

    dadosAgregados.push({
      fonte: fonte.titulo || fonte.tabela_nome,
      categoria,
      registros
    });

    console.groupEnd();
  }

  console.log('✅ dados agregados finais:', dadosAgregados);
  console.groupEnd();

  return dadosAgregados;
}

/* ============================
  STORAGE
  - Conversa: sessionStorage (some ao fechar)
  - Base: localStorage (conhecimento curado)
============================= */
if (!window.__LIA_KEYS__) {

  window.__LIA_KEYS__ = {
    SS_CHAT_KEY: 'lia_conversa',
    LS_KB_KEY: 'lia_kb_v1'
  };
}

const { SS_CHAT_KEY, LS_KB_KEY } = window.__LIA_KEYS__;


/* ELEMENTOS */
const chatBox = document.getElementById('chat');
const inputPergunta = document.getElementById('pergunta');
const btnPerguntar = document.getElementById('btnPerguntar');

const btnOpenAddKnowledge = document.getElementById('btnOpenAddKnowledge');
const btnOpenKB = document.getElementById('btnOpenKB');

const modalAddKnowledge = document.getElementById('modalAddKnowledge');
const modalSaveLearning = document.getElementById('modalSaveLearning');
const modalKB = document.getElementById('modalKB');

/* Tabs */
const tabs = document.querySelectorAll('.tab');
const tabPanels = {
  tabDoc: document.getElementById('tabDoc'),
  tabText: document.getElementById('tabText'),
};

/* Add Doc */
const docTitulo = document.getElementById('docTitulo');
const docCategoria = document.getElementById('docCategoria');
const docArquivo = document.getElementById('docArquivo');
const docAtivo = document.getElementById('docAtivo');
const btnSalvarDoc = document.getElementById('btnSalvarDoc');

/* Add Text */
const txtTitulo = document.getElementById('txtTitulo');
const txtCategoria = document.getElementById('txtCategoria');
const txtConteudo = document.getElementById('txtConteudo');
const txtAtivo = document.getElementById('txtAtivo');
const btnSalvarTexto = document.getElementById('btnSalvarTexto');

/* Save Learning */
const learnTitulo = document.getElementById('learnTitulo');
const learnCategoria = document.getElementById('learnCategoria');
const learnConteudo = document.getElementById('learnConteudo');
const learnAtivo = document.getElementById('learnAtivo');
const btnConfirmSaveLearning = document.getElementById('btnConfirmSaveLearning');

/* KB */
const kbList = document.getElementById('kbList');
const kbSearch = document.getElementById('kbSearch');
const kbFilterCat = document.getElementById('kbFilterCat');
const kbFilterTipo = document.getElementById('kbFilterTipo');

/* (SE EXISTIR NO HTML) */
const btnExportKB = document.getElementById('btnExportKB');
const btnClearKB = document.getElementById('btnClearKB');

/* ESTADO */
let conversa = safeJsonParse(sessionStorage.getItem(SS_CHAT_KEY), []);
let kb = safeJsonParse(localStorage.getItem(LS_KB_KEY), []);

/* UTIL */
function safeJsonParse(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}
function uid() {
  return 'id_' + Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function escapeHtml(s) {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}
function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.innerText || tmp.textContent || '';
}
function openModal(modalEl) {
  if (!modalEl) return;
  modalEl.setAttribute('aria-hidden', 'false');
  modalEl.classList.add('is-open');
}
function closeModalById(id) {
  const el = document.getElementById(id);
  if (el) {
    el.setAttribute('aria-hidden', 'true');
    el.classList.remove('is-open');
  }
}

/* FECHAR MODAL click overlay/botão */
document.addEventListener('click', (e) => {
  const closeId = e.target?.getAttribute?.('data-close');
  if (closeId) closeModalById(closeId);
});

/* ============================
  CHAT RENDER
============================= */
function renderChat() {
  if (!chatBox) return;
  chatBox.innerHTML = '';

  if (!conversa.length) {
    chatBox.innerHTML = `<div class="placeholder">Faça uma pergunta sobre processos, produtos ou atendimento.</div>`;
    return;
  }

  const ctx = getEasyLocContext();
  const userPhoto = ctx?.usuario_foto || ctx?.foto_usuario || ctx?.avatar_url || ctx?.foto_url || document.querySelector("#userAvatar img, .user-avatar img, .sidebar-user img")?.src || window.parent?.document?.querySelector("#userAvatar img, .user-avatar img, .sidebar-user img")?.src || "";
  const userName = ctx?.usuario_nome || ctx?.nome_usuario || "Voce";
  const initials = String(userName).trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "U";
  const userAvatar = `<div class="msg-avatar user-avatar-msg">${userPhoto ? `<img src="${escapeHtml(userPhoto)}" alt="">` : initials}</div>`;
  const liaAvatar = `<div class="msg-avatar lia-avatar">✦</div>`;

  conversa.forEach((item, idx) => {
    const q = escapeHtml(item.pergunta);
    const a = item.resposta_is_html ? item.resposta : escapeHtml(item.resposta);

    chatBox.innerHTML += `
      <div class="msg-row user">
        <div class="msg user">${q}</div>
        ${userAvatar}
      </div>

      <div class="msg-row ia">
        ${liaAvatar}
        <div class="msg ia">
          ${a}
        </div>
      </div>
    `;
  });

  chatBox.scrollTop = chatBox.scrollHeight;
}

let liaTypingTimer = null;

function typeAssistantResponse(index, respostaFinal, respostaIsHtml) {
  if (liaTypingTimer) {
    clearTimeout(liaTypingTimer);
    liaTypingTimer = null;
  }

  const item = conversa[index];
  if (!item) return Promise.resolve();

  const texto = stripHtml(respostaIsHtml ? respostaFinal : String(respostaFinal || "")).trim();
  const tokens = texto.match(/(\s+|[^\s]+)/g) || [];

  if (!tokens.length) {
    item.resposta = respostaFinal;
    item.resposta_is_html = respostaIsHtml;
    renderChat();
    return Promise.resolve();
  }

  item.resposta = "";
  item.resposta_is_html = false;
  renderChat();

  return new Promise((resolve) => {
    let cursor = 0;
    let parcial = "";

    const step = () => {
      parcial += tokens[cursor] || "";
      cursor += 1;
      item.resposta = `${escapeHtml(parcial)}<span class="lia-typing-caret"></span>`;
      item.resposta_is_html = true;
      renderChat();

      if (cursor < tokens.length) {
        liaTypingTimer = setTimeout(step, tokens[cursor - 1]?.trim() ? 22 : 8);
        return;
      }

      item.resposta = respostaFinal;
      item.resposta_is_html = respostaIsHtml;
      renderChat();
      resolve();
    };

    liaTypingTimer = setTimeout(step, 140);
  });
}

function persistChat() {
  sessionStorage.setItem(SS_CHAT_KEY, JSON.stringify(conversa));
}

function persistKB() {
  localStorage.setItem(LS_KB_KEY, JSON.stringify(kb));
}

function renderKB() {
  if (modalKB?.getAttribute("aria-hidden") === "false") {
    renderMinhaBase();
  }
}
renderChat();

function suggestTitle(pergunta) {
  const p = (pergunta || '').trim();
  if (!p) return 'Aprendizado';
  return p.length > 48 ? p.slice(0, 48) + '…' : p;
}

// ✅ usa o supabase global SEM redeclarar
const supabaseClient = window.supabase
  ? window.supabase.createClient(
      'https://awemuohtvwvrdzfxwrmd.supabase.co',
      'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ'
    )
  : null;

if (!supabaseClient) {
  console.warn('⚠️ Supabase JS não carregado. Busca semântica desativada.');
}


/* ============================
   CONTEXTO DE TEMA (MEMÓRIA)
============================ */
const SS_TEMA_ATIVO = 'lia_tema_ativo';

function getTemaAtivo() {
  return sessionStorage.getItem(SS_TEMA_ATIVO);
}

function setTemaAtivo(tema) {
  if (tema) sessionStorage.setItem(SS_TEMA_ATIVO, tema);
}

/* ============================
   NORMALIZA PERGUNTA COM CONTEXTO
============================ */
function montarPerguntaComContexto(pergunta) {
  const tema = getTemaAtivo();
  if (!tema) return pergunta;

  // Perguntas curtas mantêm o tema
  const palavras = pergunta.trim().split(/\s+/);
  if (palavras.length <= 6) {
    return `${tema}. ${pergunta}`;
  }

  return pergunta;
}

/* ============================
   BUSCA SEMÂNTICA COM CONTEXTO
============================ */
async function buscarConhecimentoSemantico({ pergunta, empresa_id }) {
  try {
    const perguntaContextualizada = montarPerguntaComContexto(pergunta);

    console.log("🧠 Pergunta original:", pergunta);
    console.log("🧠 Pergunta com contexto:", perguntaContextualizada);

    const authHeaders = await getSupabaseAuthHeaders();

    const response = await fetch(
      "https://awemuohtvwvrdzfxwrmd.supabase.co/functions/v1/rag-buscar-conhecimento",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          empresa_id,
          pergunta: perguntaContextualizada
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Erro RAG:", err);
      return null;
    }

    const data = await response.json();

    // 🔑 Atualiza o tema ativo com base no conhecimento retornado
    if (Array.isArray(data) && data.length && data[0]?.assunto) {
      setTemaAtivo(data[0].assunto);
      console.log("🎯 Tema ativo atualizado:", data[0].assunto);
    }

    return Array.isArray(data) && data.length ? data : null;
  } catch (err) {
    console.error("Erro geral RAG:", err);
    return null;
  }
}

async function chamarLia(mensagem, contexto = {}) {
  const authHeaders = await getSupabaseAuthHeaders();

  const response = await fetch(
    "https://awemuohtvwvrdzfxwrmd.supabase.co/functions/v1/lia-chat",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        mensagem,
        contexto
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || "Erro ao chamar a Lia");
  }

  const data = await response.json();
  return data.resposta || "Não consegui gerar uma resposta agora.";
}


function montarContextoConversa(max = 4) {
  const ultimas = conversa.slice(-max);

  return ultimas.map(item => ({
    pergunta: stripHtml(item.pergunta),
    resposta: stripHtml(item.resposta)
  }));
}

const LIA_STOPWORDS = new Set([
  "sobre",
  "para",
  "qual",
  "quais",
  "quem",
  "como",
  "com",
  "sem",
  "dos",
  "das",
  "por",
  "que",
  "uma",
  "uns",
  "umas",
  "esse",
  "essa",
  "esses",
  "essas",
  "cliente",
  "clientes",
  "item",
  "itens",
  "produto",
  "produtos",
  "cadastrado",
  "cadastrados",
  "cadastrada",
  "cadastradas"
]);

function extrairTermosBusca(pergunta) {
  return Array.from(
    new Set(
      String(pergunta || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s@._-]/gu, " ")
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length >= 3 && !LIA_STOPWORDS.has(t))
    )
  ).slice(0, 6);
}

function montarFiltroIlike(campos, termos) {
  const filtros = [];

  termos.forEach(termo => {
    const seguro = termo.replaceAll("%", "").replaceAll(",", "").replaceAll("(", "").replaceAll(")", "");
    if (!seguro) return;

    campos.forEach(campo => {
      filtros.push(`${campo}.ilike.%${seguro}%`);
    });
  });

  return filtros.join(",");
}

async function contarTabelaEmpresa(tabela, empresa_id) {
  const { count, error } = await window.supabaseClient
    .from(tabela)
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresa_id);

  if (error) {
    console.warn(`Lia: erro ao contar ${tabela}`, error);
    return null;
  }

  return count || 0;
}

async function buscarClientesParaLia({ pergunta, empresa_id }) {
  const termos = extrairTermosBusca(pergunta);

  let query = window.supabaseClient
    .from("clientes_empresas")
    .select(`
      id,
      nome_razao,
      telefone,
      email,
      endereco,
      numero_endereco,
      ponto_referencia,
      tipo_pessoa,
      status,
      ultima_locacao,
      tags
    `)
    .eq("empresa_id", empresa_id)
    .limit(12);

  const filtro = montarFiltroIlike(
    ["nome_razao", "telefone", "email", "cpf_cnpj", "endereco"],
    termos
  );

  if (filtro) {
    query = query.or(filtro);
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    console.warn("Lia: erro ao buscar clientes", error);
    return [];
  }

  return data || [];
}

async function buscarItensParaLia({ pergunta, empresa_id }) {
  const termos = extrairTermosBusca(pergunta);

  let query = window.supabaseClient
    .from("itens")
    .select(`
      id,
      codigo,
      produto,
      descricao_total,
      material,
      cor,
      tipo,
      familia,
      categoria,
      setor_estoque,
      valor_locacao,
      valor_reposicao,
      ativo,
      foto_url
    `)
    .eq("empresa_id", empresa_id)
    .limit(12);

  const filtro = montarFiltroIlike(
    ["codigo", "produto", "descricao_total", "material", "cor", "tipo", "familia", "categoria", "setor_estoque"],
    termos
  );

  if (filtro) {
    query = query.or(filtro);
  } else {
    query = query.order("produto", { ascending: true });
  }

  const { data, error } = await query;

  if (error) {
    console.warn("Lia: erro ao buscar itens", error);
    return [];
  }

  return data || [];
}

async function safeLiaQuery(label, queryBuilder) {
  try {
    const { data, error } = await queryBuilder();
    if (error) {
      console.warn(`Lia: erro ao buscar ${label}`, error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.warn(`Lia: falha ao buscar ${label}`, error);
    return [];
  }
}

async function buscarPedidosParaLia({ pergunta, empresa_id }) {
  const termos = extrairTermosBusca(pergunta);

  return safeLiaQuery("pedidos", async () => {
    let query = window.supabaseClient
      .from("separacoes_pedidos")
      .select("*")
      .eq("empresa_id", empresa_id)
      .limit(10);

    const filtro = montarFiltroIlike(
      [
        "numero_pedido",
        "cliente_nome",
        "contato_cliente",
        "tipo_evento",
        "local_nome",
        "status",
        "status_comercial"
      ],
      termos
    );

    if (filtro) {
      query = query.or(filtro);
    } else {
      query = query.order("data_evento", { ascending: false });
    }

    return query;
  });
}

async function buscarItensDosPedidosParaLia({ pedidos, empresa_id }) {
  const ids = (pedidos || []).map(p => p.id).filter(Boolean);
  if (!ids.length) return [];

  return safeLiaQuery("itens dos pedidos", async () => (
    window.supabaseClient
      .from("separacoes_itens")
      .select("*")
      .eq("empresa_id", empresa_id)
      .in("separacao_pedido_id", ids)
      .order("created_at", { ascending: true })
      .limit(80)
  ));
}

async function buscarCaminhoesParaLia({ pergunta, empresa_id }) {
  const termos = extrairTermosBusca(pergunta);

  return safeLiaQuery("caminhoes", async () => {
    let query = window.supabaseClient
      .from("caminhoes")
      .select("*")
      .eq("empresa_id", empresa_id)
      .limit(20);

    const filtro = montarFiltroIlike(
      ["modelo", "placa", "tipo", "status"],
      termos
    );

    if (filtro) {
      query = query.or(filtro);
    } else {
      query = query.order("modelo", { ascending: true });
    }

    return query;
  });
}

async function buscarColaboradoresParaLia({ pergunta, empresa_id }) {
  const termos = extrairTermosBusca(pergunta);

  return safeLiaQuery("colaboradores", async () => {
    let query = window.supabaseClient
      .from("colaboradores")
      .select("*")
      .eq("empresa_id", empresa_id)
      .limit(20);

    const filtro = montarFiltroIlike(["nome", "funcao", "telefone", "status"], termos);

    if (filtro) {
      query = query.or(filtro);
    } else {
      query = query.order("nome", { ascending: true });
    }

    return query;
  });
}

async function buscarCronogramaParaLia({ pergunta, empresa_id, pedidos }) {
  const termos = extrairTermosBusca(pergunta);
  const pedidoIds = (pedidos || []).map(p => p.id).filter(Boolean);

  return safeLiaQuery("cronograma logistico", async () => {
    let query = window.supabaseClient
      .from("cronograma_logistico")
      .select("*")
      .eq("empresa_id", empresa_id)
      .limit(30);

    if (pedidoIds.length) {
      query = query.in("pedido_id", pedidoIds);
    } else {
      const filtro = montarFiltroIlike(
        ["numero_pedido", "cliente_nome", "local_nome", "tipo_evento", "etapa", "responsavel", "caminhao", "equipe", "status"],
        termos
      );
      if (filtro) query = query.or(filtro);
      else query = query.order("data_etapa", { ascending: true });
    }

    return query;
  });
}

async function buscarPlanejamentosParaLia({ empresa_id, pedidos }) {
  const pedidoIds = (pedidos || []).map(p => p.id).filter(Boolean);
  if (!pedidoIds.length) return [];

  return safeLiaQuery("planejamentos logisticos", async () => (
    window.supabaseClient
      .from("planejamentos_logisticos")
      .select("*")
      .eq("empresa_id", empresa_id)
      .in("pedido_id", pedidoIds)
      .limit(20)
  ));
}

function formatarClienteParaLia(c) {
  const tags = c.tags && typeof c.tags === "object"
    ? Object.entries(c.tags)
        .map(([chave, valor]) => `${chave}: ${Array.isArray(valor) ? valor.join(", ") : valor}`)
        .join("; ")
    : "";

  return {
    nome: c.nome_razao || "",
    telefone: c.telefone || "",
    email: c.email || "",
    endereco: [c.endereco, c.numero_endereco].filter(Boolean).join(", "),
    ponto_referencia: c.ponto_referencia || "",
    tipo_pessoa: c.tipo_pessoa || "",
    status: c.status || "",
    ultima_locacao: c.ultima_locacao || "",
    tags
  };
}

function formatarItemParaLia(item) {
  return {
    codigo: item.codigo || "",
    nome: item.descricao_total || item.produto || "",
    produto: item.produto || "",
    material: item.material || "",
    cor: item.cor || "",
    tipo: item.tipo || "",
    familia: item.familia || "",
    categoria: item.categoria || "",
    setor_estoque: item.setor_estoque || "",
    valor_locacao: Number(item.valor_locacao || 0),
    valor_reposicao: Number(item.valor_reposicao || 0),
    foto_url: item.foto_url || "",
    ativo: item.ativo !== false
  };
}

function formatarPedidoParaLia(pedido, itensPedido, cronograma, planejamentos) {
  const observacoes = pedido.observacoes && typeof pedido.observacoes === "object"
    ? pedido.observacoes
    : {};

  return {
    id: pedido.id || "",
    numero: pedido.numero_pedido || pedido.numero || "",
    cliente: pedido.cliente_nome || "",
    contato_cliente: pedido.contato_cliente || "",
    evento: pedido.tipo_evento || "",
    local: pedido.local_nome || "",
    local_id: pedido.local_id || "",
    data_evento: pedido.data_evento || pedido.data_hora || "",
    data_entrega: pedido.data_entrega || "",
    data_coleta: pedido.data_coleta || "",
    status_operacional: pedido.status || "",
    status_comercial: pedido.status_comercial || "",
    status_planejamento: pedido.status_planejamento || "",
    valor_total: Number(pedido.valor_total || 0),
    endereco: observacoes.endereco_evento || observacoes.endereco || "",
    referencia: observacoes.referencia_evento || observacoes.referencia || "",
    logistica: observacoes.logistica || observacoes.resumo_logistica || null,
    financeiro: {
      forma_pagamento: observacoes.financeiro?.forma_pagamento || observacoes.forma_pagamento || "",
      entrada: observacoes.financeiro?.entrada || observacoes.entrada || "",
      parcelas: observacoes.financeiro?.parcelas || observacoes.parcelas_financeiras || []
    },
    itens: itensPedido
      .filter(item => item.separacao_pedido_id === pedido.id)
      .map(formatarItemPedidoParaLia),
    cronograma: cronograma
      .filter(item => item.pedido_id === pedido.id)
      .map(formatarCronogramaParaLia),
    planejamento: planejamentos
      .filter(item => item.pedido_id === pedido.id)
      .map(formatarPlanejamentoParaLia)
  };
}

function formatarItemPedidoParaLia(item) {
  return {
    item_id: item.item_id || "",
    codigo: item.codigo_item || "",
    nome: item.item_nome || "",
    quantidade_solicitada: Number(item.quantidade_solicitada || 0),
    quantidade_separada: Number(item.quantidade_separada || 0),
    status: item.status || "",
    localizacao: item.localizacao || "",
    tipo_controle: item.tipo_controle || "",
    foto_url: item.foto_url || ""
  };
}

function formatarCaminhaoParaLia(caminhao) {
  return {
    id: caminhao.id || "",
    modelo: caminhao.modelo || caminhao.nome || "",
    placa: caminhao.placa || "",
    tipo: caminhao.tipo || "",
    status: caminhao.status || "",
    capacidade_m3: Number(caminhao.capacidade_m3 || caminhao.capacidade || 0),
    largura: Number(caminhao.largura || 0),
    altura: Number(caminhao.altura || 0),
    comprimento: Number(caminhao.comprimento || 0),
    proprietario: caminhao.proprietario_nome || caminhao.proprietario || "",
    telefone: caminhao.telefone || ""
  };
}

function formatarColaboradorParaLia(colaborador) {
  return {
    id: colaborador.id || "",
    nome: colaborador.nome || "",
    funcao: colaborador.funcao || colaborador.cargo || "",
    telefone: colaborador.telefone || "",
    status: colaborador.status || ""
  };
}

function formatarCronogramaParaLia(item) {
  return {
    pedido: item.numero_pedido || "",
    etapa: item.etapa || "",
    data: item.data_etapa || "",
    horario: item.horario || "",
    responsavel: item.responsavel || "",
    caminhao: item.caminhao || "",
    equipe: item.equipe || "",
    status: item.status || "",
    observacao: item.observacao || ""
  };
}

function formatarPlanejamentoParaLia(item) {
  return {
    status: item.status || "",
    data_planejamento: item.data_planejamento || "",
    observacoes: item.observacoes || {}
  };
}

async function buscarDadosOperacionaisLia({ pergunta, empresa_id }) {
  const [
    totalClientes,
    totalItens,
    totalPedidos,
    totalCaminhoes,
    clientes,
    itens,
    pedidos,
    caminhoes,
    colaboradores
  ] = await Promise.all([
    contarTabelaEmpresa("clientes_empresas", empresa_id),
    contarTabelaEmpresa("itens", empresa_id),
    contarTabelaEmpresa("separacoes_pedidos", empresa_id),
    contarTabelaEmpresa("caminhoes", empresa_id),
    buscarClientesParaLia({ pergunta, empresa_id }),
    buscarItensParaLia({ pergunta, empresa_id }),
    buscarPedidosParaLia({ pergunta, empresa_id }),
    buscarCaminhoesParaLia({ pergunta, empresa_id }),
    buscarColaboradoresParaLia({ pergunta, empresa_id })
  ]);

  const [itensPedido, cronograma, planejamentos] = await Promise.all([
    buscarItensDosPedidosParaLia({ pedidos, empresa_id }),
    buscarCronogramaParaLia({ pergunta, empresa_id, pedidos }),
    buscarPlanejamentosParaLia({ empresa_id, pedidos })
  ]);

  return {
    empresa_id,
    totais: {
      clientes: totalClientes,
      itens: totalItens,
      pedidos: totalPedidos,
      caminhoes: totalCaminhoes
    },
    clientes: clientes.map(formatarClienteParaLia),
    itens: itens.map(formatarItemParaLia),
    pedidos: pedidos.map(p => formatarPedidoParaLia(p, itensPedido, cronograma, planejamentos)),
    caminhoes: caminhoes.map(formatarCaminhaoParaLia),
    colaboradores: colaboradores.map(formatarColaboradorParaLia),
    cronograma: cronograma.map(formatarCronogramaParaLia),
    observacao: "Dados reais do EasyLoc filtrados por empresa_id da empresa logada. Use somente estes dados quando responder sobre cadastros, pedidos, itens, caminhões, equipe, cronograma, planejamento e logística."
  };
}

async function askLiaWithText(pergunta) {
  console.log("❓ PERGUNTA RECEBIDA:", pergunta);
  if (!pergunta) return;

  if (window.__liaVoice) {
    window.__liaVoice.aguardandoResposta = true;
  }

  conversa.push({
    pergunta,
    resposta: '<span class="lia-thinking"><span></span><span></span><span></span></span>',
    resposta_is_html: true,
  });

  persistChat();
  renderChat();
  const respostaIndex = conversa.length - 1;

  try {
    let resposta = '';
    const empresaId = getEmpresaIdLogada();
    let dadosOperacionais = null;

    try {
      dadosOperacionais = await buscarDadosOperacionaisLia({
        pergunta,
        empresa_id: empresaId
      });
      console.log("📦 DADOS OPERACIONAIS LIA:", dadosOperacionais);
    } catch (e) {
      console.warn("Lia: não foi possível buscar dados operacionais.", e);
    }

    // ✅ ÚNICA FONTE DE VERDADE: RAG SEMÂNTICO
let resultados = null;
try {
  resultados = await buscarConhecimentoSemantico({
    pergunta,
    empresa_id: empresaId
  });
} catch (e) {
  console.error("Falha no RAG, seguindo fallback", e);
}


    console.log("📚 RESULTADOS SEMÂNTICOS:", resultados);

    if (resultados && resultados.length) {
      const contextoBase = resultados
        .map(r => `### ${r.assunto}\n${r.resposta_base}`)
        .join('\n\n---\n\n');

resposta = await chamarLia(pergunta, {
  empresa_id: empresaId,
  papel: "assistente_interna",
  publico: "equipe_interna",
  tom: "profissional_proximo",
  origem: "ia_conhecimento",
  tema_ativo: sessionStorage.getItem("lia_tema_ativo"),
  conhecimento: contextoBase,
  dados_operacionais: dadosOperacionais,
  instrucao_dados_operacionais: `
Quando a pergunta envolver clientes, itens, pedidos, caminhões, equipe, cronograma, planejamento, separação ou logística, use dados_operacionais.
Quando a pergunta pedir um pedido específico, responda com cliente, contato, evento, datas, local, status, itens, valores, cronograma e logística quando esses dados estiverem disponíveis.
Não invente cliente, item, pedido, caminhão, equipe, código, preço, telefone, email, data, status ou endereço.
Se o dado não estiver em dados_operacionais, diga que não encontrou no cadastro filtrado.
Se a pergunta pedir foto/imagem de um item e o item tiver foto_url, mostre a imagem usando <img class="lia-item-photo" src="FOTO_URL" alt="Nome do item">.
Se o item não tiver foto_url, diga que o item está cadastrado sem foto.
`,
  historico: montarContextoConversa()
});


    } else {
      // ✅ Fallback honesto (SEM inventar processo)
resposta = await chamarLia(pergunta, {
  empresa_id: empresaId,
  papel: "assistente_interna",
  publico: "equipe_interna",
  tom: "profissional_proximo",
  origem: "sem_conhecimento",
  tema_ativo: sessionStorage.getItem("lia_tema_ativo"),
  dados_operacionais: dadosOperacionais,
  instrucao: `
Seja honesta.
Diga claramente que esse assunto não está documentado nos processos internos.
Não invente regras.
Se a pergunta for sobre clientes, itens, pedidos, caminhões, equipe, cronograma, planejamento, separação ou logística, responda com os dados_operacionais reais.
Se a pergunta pedir um pedido específico, responda com cliente, contato, evento, datas, local, status, itens, valores, cronograma e logística quando esses dados estiverem disponíveis.
Não invente cliente, item, pedido, caminhão, equipe, código, preço, telefone, email, data, status ou endereço.
Se a pergunta pedir foto/imagem de um item e o item tiver foto_url, mostre a imagem usando <img class="lia-item-photo" src="FOTO_URL" alt="Nome do item">.
Se o item não tiver foto_url, diga que o item está cadastrado sem foto.
Explique de forma genérica como isso costuma funcionar no mercado, se fizer sentido.
`,
  historico: montarContextoConversa()
});


    }

    conversa[respostaIndex].resposta = resposta;
    conversa[respostaIndex].resposta_is_html = true;

  } catch (err) {
    console.error("🔴 ERRO REAL:", err);

    conversa[respostaIndex].resposta =
      err?.message || 'Erro ao consultar o sistema.';
    conversa[respostaIndex].resposta_is_html = false;
  }

  const respostaFinal = conversa[respostaIndex].resposta;
  const respostaFinalIsHtml = conversa[respostaIndex].resposta_is_html;
  persistChat();
  await typeAssistantResponse(respostaIndex, respostaFinal, respostaFinalIsHtml);
  persistChat();

  if (window.__liaVoice) {
    window.__liaVoice.aguardandoResposta = false;
  }
}


/* ============================
  PERGUNTAR (MVP)
============================= */
function askLia() {
  const pergunta = inputPergunta?.value?.trim() || '';
  if (!pergunta) return;

  inputPergunta.value = '';
  askLiaWithText(pergunta);
}

if (!btnPerguntar || !inputPergunta) {
  console.warn("⚠️ Botões da Lia não encontrados no DOM");
} else {
  btnPerguntar.onclick = askLia;

  inputPergunta.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      askLia();
    }
  };
}

/* ============================
  MODAL: + ADICIONAR CONHECIMENTO
============================= */
if (btnOpenAddKnowledge) {
  btnOpenAddKnowledge.addEventListener('click', () => {
    if (docTitulo) docTitulo.value = '';
    if (docCategoria) docCategoria.value = 'Comercial';
    if (docArquivo) docArquivo.value = '';
    if (docAtivo) docAtivo.checked = true;

    if (txtTitulo) txtTitulo.value = '';
    if (txtCategoria) txtCategoria.value = 'Comercial';
    if (txtConteudo) txtConteudo.value = '';
    if (txtAtivo) txtAtivo.checked = true;

    // tabs default doc
    tabs.forEach(b => b.classList.remove('active'));
    document.querySelector('.tab[data-tab="tabDoc"]')?.classList.add('active');

    Object.values(tabPanels).forEach(p => p?.classList.remove('active'));
    tabPanels.tabDoc?.classList.add('active');

    openModal(modalAddKnowledge);
  });
}

/* Tabs */
tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const id = btn.getAttribute('data-tab');
    Object.values(tabPanels).forEach(p => p?.classList.remove('active'));
    if (tabPanels[id]) tabPanels[id].classList.add('active');
  });
});

/* Salvar Documento */
if (btnSalvarDoc) {
  btnSalvarDoc.addEventListener('click', () => {
    const titulo = docTitulo?.value?.trim() || 'Documento sem título';
    const categoria = docCategoria?.value || 'Comercial';
    const ativo = !!docAtivo?.checked;

    const file = docArquivo?.files?.[0];
    if (!file) { avisar('Escolha um arquivo (PDF/DOCX/TXT).'); return; }

    const item = {
      id: uid(),
      tipo: 'documento',
      titulo,
      categoria,
      ativo,
      criado_em: new Date().toISOString(),
      conteudo:
        `Arquivo: ${file.name}\nTamanho: ${(file.size/1024).toFixed(1)} KB\nTipo: ${file.type || 'desconhecido'}\n\nObs.: Upload real via Supabase será ligado depois.`,
    };

    kb.unshift(item);
    persistKB();
    closeModalById('modalAddKnowledge');
  });
}

/* Salvar Texto */
if (btnSalvarTexto) {
  btnSalvarTexto.addEventListener('click', () => {
    const titulo = txtTitulo?.value?.trim() || 'Texto sem título';
    const categoria = txtCategoria?.value || 'Comercial';
    const conteudo = txtConteudo?.value?.trim() || '';
    const ativo = !!txtAtivo?.checked;

    if (!conteudo) { avisar('Cole um conteúdo no campo de texto.'); return; }

    const item = {
      id: uid(),
      tipo: 'texto',
      titulo,
      categoria,
      ativo,
      criado_em: new Date().toISOString(),
      conteudo,
    };

    kb.unshift(item);
    persistKB();
    closeModalById('modalAddKnowledge');
  });
}

/* ============================
  MODAL: SALVAR APRENDIZADO
============================= */
if (btnConfirmSaveLearning) {
  btnConfirmSaveLearning.addEventListener('click', () => {
    const titulo = learnTitulo?.value?.trim() || 'Aprendizado';
    const categoria = learnCategoria?.value || 'Comercial';
    const conteudo = learnConteudo?.value?.trim() || '';
    const ativo = !!learnAtivo?.checked;

    if (!conteudo) { avisar('Conteúdo vazio.'); return; }

    const mode = btnConfirmSaveLearning.dataset.mode || 'create';
    const editId = btnConfirmSaveLearning.dataset.editId || '';

    if (mode === 'edit' && editId) {
      const item = kb.find(x => x.id === editId);
      if (!item) return;

      item.titulo = titulo;
      item.categoria = categoria;
      item.conteudo = conteudo;
      item.ativo = ativo;

      persistKB();
      closeModalById('modalSaveLearning');
      renderKB();
      return;
    }

    const item = {
      id: uid(),
      tipo: 'aprendizado',
      titulo,
      categoria,
      ativo,
      criado_em: new Date().toISOString(),
      conteudo,
    };

    kb.unshift(item);
    persistKB();
    closeModalById('modalSaveLearning');
  });
}
/* ============================
   BASE DE CONHECIMENTO (SUPABASE)
============================= */

async function carregarBaseConhecimento() {
  const empresa_id = getEmpresaIdLogada();

const { data, error } = await supabaseClient
  .from("ia_conhecimento")
  .select(`
    id,
    assunto,
    categoria,
    resposta_base,
    perguntas_exemplo,
    ativo,
    created_at
  `)
  .eq("empresa_id", empresa_id)
  .order("created_at", { ascending: false });


  if (error) {
    console.error("❌ Erro ao carregar base:", error);
    kbList.innerHTML = `<div class="placeholder">Erro ao carregar a base.</div>`;
    return [];
  }

  return data || [];
}

/* ============================
  MODAL: MINHA BASE
============================= */
if (btnOpenKB) {
  btnOpenKB.addEventListener("click", async () => {
    openModal(modalKB);
    await renderMinhaBase();
  });
}

if (kbSearch) kbSearch.addEventListener("input", renderMinhaBase);
if (kbFilterCat) kbFilterCat.addEventListener("change", renderMinhaBase);
if (kbFilterTipo) kbFilterTipo.addEventListener("change", renderMinhaBase);

async function renderMinhaBase() {
  if (!kbList) return;

  kbList.innerHTML = `<div class="placeholder">Carregando base...</div>`;

  const dados = await carregarBaseConhecimento();

  const q = (kbSearch?.value || "").toLowerCase();
  const cat = kbFilterCat?.value || "__ALL__";

  const filtrados = dados.filter(item => {
    const matchQ =
      !q ||
      item.assunto?.toLowerCase().includes(q) ||
      item.resposta_base?.toLowerCase().includes(q);

    const matchCat = (cat === "__ALL__") || item.categoria === cat;

    return matchQ && matchCat;
  });

  kbList.innerHTML = "";

  if (!filtrados.length) {
    kbList.innerHTML = `<div class="placeholder">Nenhum conhecimento encontrado.</div>`;
    return;
  }

kbList.innerHTML = `
  <div class="kb-table">
    <div class="kb-header">
      <span>Assunto</span>
      <span>Perguntas-exemplo</span>
      <span>Categoria</span>
      <span>Status</span>
    </div>
  </div>
`;

const table = kbList.querySelector(".kb-table");

filtrados.forEach(item => {
  const perguntas = Array.isArray(item.perguntas_exemplo)
    ? item.perguntas_exemplo
    : [];

  const previewPerguntas = perguntas.slice(0, 2).join(" • ");
  const tooltipPerguntas = perguntas.join("\n");

  table.innerHTML += `
    <div class="kb-row" data-id="${item.id}">
      <span class="kb-assunto">${escapeHtml(item.assunto)}</span>

      <span class="kb-perguntas" title="${escapeHtml(tooltipPerguntas)}">
        ${escapeHtml(previewPerguntas || "—")}
        ${perguntas.length > 2 ? " …" : ""}
      </span>

      <span class="kb-categoria">${escapeHtml(item.categoria)}</span>

      <span class="kb-status ${item.ativo ? "ativo" : "inativo"}">
        ${item.ativo ? "Ativo" : "Inativo"}
      </span>
    </div>
  `;
});

}
/* ============================
  CLICK NA LINHA DA BASE (MODAIS EMPILHADOS)
============================= */
if (kbList) {
  kbList.addEventListener("click", async (e) => {
    const row = e.target.closest(".kb-row");
    if (!row) return;

    const id = row.dataset.id;

    const { data, error } = await supabaseClient
      .from("ia_conhecimento")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      console.error("Erro ao carregar conhecimento:", error);
      return;
    }

    // 🔁 MAPEAMENTO CORRETO DAS COLUNAS
    learnTitulo.value = data.assunto || "";
    learnCategoria.value = data.categoria || "Comercial";
    learnConteudo.value = data.resposta_base || "";
    learnAtivo.checked = !!data.ativo;

    btnConfirmSaveLearning.dataset.mode = "edit";
    btnConfirmSaveLearning.dataset.editId = id;

    // ✅ GARANTE QUE O MODAL DE EDIÇÃO FIQUE ACIMA
    modalSaveLearning.style.zIndex = 2100;
    modalKB.style.zIndex = 2000;

    openModal(modalSaveLearning);
  });
}


/* ESC fecha modais */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  [modalAddKnowledge, modalSaveLearning, modalKB].forEach(m => {
    if (m && m.getAttribute('aria-hidden') === 'false') {
      m.setAttribute('aria-hidden', 'true');
      m.classList.remove('is-open');
    }
  });
});

/* File name */
const fileInput = document.getElementById('docArquivo');
const fileName = document.getElementById('fileName');

if (fileInput) {
  fileInput.addEventListener('change', () => {
    if (!fileName) return;

    if (fileInput.files.length) {
      fileName.textContent = fileInput.files[0].name;
      fileInput.closest('.file-upload')?.classList.add('has-file');
    } else {
      fileName.textContent = 'Nenhum arquivo selecionado';
      fileInput.closest('.file-upload')?.classList.remove('has-file');
    }
  });
}

/* ================================
   MODO CONVERSA DA LIA (CONTÍNUO)
   - fala envia direto
   - não escreve no input
   - volta a ouvir após a resposta
================================ */
(() => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  const micBtn = document.getElementById("liaMicBtn");
  const voiceStatus = document.getElementById("liaVoiceStatus");
  const voiceText = document.getElementById("liaVoiceText");
  const voiceStop = document.getElementById("liaVoiceStop");

  if (!micBtn || !voiceStatus || !voiceStop) return;

  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.title = "Navegador não suporta voz";
    return;
  }

  let recognition = null;
  let modoConversa = false;
  let aguardandoResposta = false;
  let isListening = false;
  let ultimoTexto = "";

  function criarRecognition() {
    const r = new SpeechRecognition();
    r.lang = "pt-BR";
r.continuous = true;
r.interimResults = true;
;

    r.onstart = () => {
      isListening = true;
      micBtn.style.display = "none";
      voiceStatus.style.display = "flex";
      if (voiceText) voiceText.textContent = "Ouvindo…";
    };

let bufferTexto = "";

r.onresult = (event) => {
  let parcial = "";

  for (let i = event.resultIndex; i < event.results.length; i++) {
    parcial += event.results[i][0].transcript;
  }

  bufferTexto = parcial.trim();

  // só envia quando o navegador considera a fala "final"
  if (event.results[event.results.length - 1].isFinal) {
    if (!bufferTexto) return;
    if (bufferTexto === ultimoTexto) return;

    ultimoTexto = bufferTexto;
    bufferTexto = "";

    aguardandoResposta = true;
    askLiaWithText(ultimoTexto);
  }
};


    r.onerror = () => {
      // se der erro, marca que não está ouvindo mais
      isListening = false;
    };

    r.onend = () => {
      isListening = false;

      // Se saiu do modo conversa, não faz nada
      if (!modoConversa) return;

      // Se ainda está aguardando a resposta, não reinicia aqui
      // (vai reiniciar quando aguardandoResposta voltar pra false)
      if (aguardandoResposta) return;

      setTimeout(() => {
        startListening();
      }, 450);
    };

    return r;
  }

  function startListening() {
    if (!modoConversa) return;
    if (aguardandoResposta) return;
    if (isListening) return;

    if (!recognition) recognition = criarRecognition();

    try {
      recognition.start();
    } catch (e) {
      // alguns navegadores lançam erro se chamar start muito rápido
    }
  }

  function stop() {
    modoConversa = false;
    aguardandoResposta = false;
    ultimoTexto = "";
    isListening = false;

    try { recognition && recognition.stop(); } catch {}

    micBtn.style.display = "inline-flex";
    voiceStatus.style.display = "none";
  }

  micBtn.addEventListener("click", () => {
    modoConversa = true;
    ultimoTexto = "";
    aguardandoResposta = false;
    startListening();
  });

  voiceStop.addEventListener("click", stop);

  // 🔑 GANCHO: quando a Lia terminar de responder, volta a ouvir automaticamente
  window.__liaVoice = {
    set aguardandoResposta(v) {
      aguardandoResposta = !!v;

      // quando a resposta terminar, reinicia a escuta
      if (modoConversa && !aguardandoResposta) {
        setTimeout(() => {
          startListening();
        }, 450);
      }
    }
  };
})();

window.__liaAssistenteDestroy = function(){
  delete window.__liaVoice;
  delete window.__liaAssistenteDestroy;
};

window.__activeModuleDestroy = window.__liaAssistenteDestroy;
window.finalizarCarregamentoModulo?.();
})();
