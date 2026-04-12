console.log("🔥 assistente-ia.js FOI CARREGADO");
window.__SUPABASE_ANON_KEY__ =
  window.__SUPABASE_ANON_KEY__ ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3ZW11b2h0dnd2cmR6Znh3cm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NjE3MjAsImV4cCI6MjA4MTIzNzcyMH0.Q-hy9slxlojDNUlnCCZjZIn7TYhCSvnhT7NxWbP-JfM";

function getEmpresaIdLogada() {
  if (!window.__CONTEXT || !window.__CONTEXT.empresa_id) {
    throw new Error("Empresa não identificada. Contexto global não carregado.");
  }
  return window.__CONTEXT.empresa_id;
}

async function buscarDadosPorFonte({ categoria, empresa_id }) {
  const SUPABASE_URL = 'https://awemuohtvwvrdzfxwrmd.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ';

  console.group('🧠 buscarDadosPorFonte');
  console.log('➡️ categoria recebida:', categoria);
  console.log('➡️ empresa_id:', empresa_id);

  const fontesUrl =
    `${SUPABASE_URL}/rest/v1/ia_fontes_dados` +
    `?empresa_id=eq.${empresa_id}` +
    `&ativo=eq.true` +
    `&palavras_chave=cs.{${encodeURIComponent(categoria)}}`;

  console.log('📡 URL fontes:', fontesUrl);

  const fonteRes = await fetch(fontesUrl, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
}
function closeModalById(id) {
  const el = document.getElementById(id);
  if (el) el.setAttribute('aria-hidden', 'true');
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

  conversa.forEach((item, idx) => {
    const q = escapeHtml(item.pergunta);
    const a = item.resposta_is_html ? item.resposta : escapeHtml(item.resposta);

    chatBox.innerHTML += `
      <div class="msg-row user">
        <div class="msg user">${q}</div>
      </div>

      <div class="msg-row ia">
        <div class="msg ia">
          ${a}
          <div class="msg-tools">
            <button class="tool primary" data-save-learning="${idx}">⭐ Salvar como aprendizado</button>
            <button class="tool" data-copy-answer="${idx}">Copiar</button>
          </div>
        </div>
      </div>
    `;
  });

  chatBox.scrollTop = chatBox.scrollHeight;
}

function persistChat() {
  sessionStorage.setItem(SS_CHAT_KEY, JSON.stringify(conversa));
}
renderChat();

/* AÇÕES: salvar aprendizado / copiar */
if (chatBox) {
  chatBox.addEventListener('click', (e) => {
    const saveIdx = e.target?.getAttribute?.('data-save-learning');
    const copyIdx = e.target?.getAttribute?.('data-copy-answer');

    if (saveIdx !== null && saveIdx !== undefined) {
      const idx = Number(saveIdx);
      const item = conversa[idx];
      if (!item) return;

      const text = stripHtml(item.resposta_is_html ? item.resposta : item.resposta);

      if (learnTitulo) learnTitulo.value = suggestTitle(item.pergunta);
      if (learnCategoria) learnCategoria.value = 'Comercial';
      if (learnConteudo) learnConteudo.value = text;
      if (learnAtivo) learnAtivo.checked = true;

      if (btnConfirmSaveLearning) {
        btnConfirmSaveLearning.dataset.mode = 'create';
        btnConfirmSaveLearning.dataset.editId = '';
      }

      openModal(modalSaveLearning);
    }

    if (copyIdx !== null && copyIdx !== undefined) {
      const idx = Number(copyIdx);
      const item = conversa[idx];
      if (!item) return;

      const text = stripHtml(item.resposta_is_html ? item.resposta : item.resposta);
      navigator.clipboard?.writeText(text);
    }
  });
}

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

    const response = await fetch(
      "https://awemuohtvwvrdzfxwrmd.supabase.co/functions/v1/rag-buscar-conhecimento",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${window.__SUPABASE_ANON_KEY__}`,
          apikey: window.__SUPABASE_ANON_KEY__,
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
  const response = await fetch(
    "https://awemuohtvwvrdzfxwrmd.supabase.co/functions/v1/lia-chat",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",

        // 🔑 JWT anon public key
        "Authorization": `Bearer ${window.__SUPABASE_ANON_KEY__}`,
        "apikey": window.__SUPABASE_ANON_KEY__
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

async function askLiaWithText(pergunta) {
  console.log("❓ PERGUNTA RECEBIDA:", pergunta);
  if (!pergunta) return;

  if (window.__liaVoice) {
    window.__liaVoice.aguardandoResposta = true;
  }

  conversa.push({
    pergunta,
    resposta: '<em>escrevendo...</em>',
    resposta_is_html: true,
  });

  persistChat();
  renderChat();

  try {
    let resposta = '';

    // ✅ ÚNICA FONTE DE VERDADE: RAG SEMÂNTICO
let resultados = null;
try {
  resultados = await buscarConhecimentoSemantico({
    pergunta,
    empresa_id: getEmpresaIdLogada()
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
  empresa_id: getEmpresaIdLogada(),
  papel: "assistente_interna",
  publico: "equipe_interna",
  tom: "profissional_proximo",
  origem: "ia_conhecimento",
  tema_ativo: sessionStorage.getItem("lia_tema_ativo"),
  conhecimento: contextoBase,
  historico: montarContextoConversa()
});


    } else {
      // ✅ Fallback honesto (SEM inventar processo)
resposta = await chamarLia(pergunta, {
  empresa_id: getEmpresaIdLogada(),
  papel: "assistente_interna",
  publico: "equipe_interna",
  tom: "profissional_proximo",
  origem: "sem_conhecimento",
  tema_ativo: sessionStorage.getItem("lia_tema_ativo"),
  instrucao: `
Seja honesta.
Diga claramente que esse assunto não está documentado nos processos internos.
Não invente regras.
Explique de forma genérica como isso costuma funcionar no mercado, se fizer sentido.
`,
  historico: montarContextoConversa()
});


    }

    conversa[conversa.length - 1].resposta = resposta;
    conversa[conversa.length - 1].resposta_is_html = true;

  } catch (err) {
    console.error("🔴 ERRO REAL:", err);

    conversa[conversa.length - 1].resposta =
      err?.message || 'Erro ao consultar o sistema.';
    conversa[conversa.length - 1].resposta_is_html = false;
  }

  persistChat();
  renderChat();

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
    if (!file) { alert('Escolha um arquivo (PDF/DOCX/TXT).'); return; }

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

    if (!conteudo) { alert('Cole um conteúdo no campo de texto.'); return; }

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

    if (!conteudo) { alert('Conteúdo vazio.'); return; }

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

