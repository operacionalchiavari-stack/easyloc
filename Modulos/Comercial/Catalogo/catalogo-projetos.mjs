// Projetos do catálogo (pedido explícito do usuário): o decorador monta, DE DENTRO do catálogo, um projeto pro
// casal — dividido em ambientes com o nome que ele quiser (Cerimônia, Bar, Lounge...), com os móveis escolhidos
// (e quantidades) e as renderizações 3D/IA de cada ambiente — e pode enviar o pedido à Chiavari. Também é onde vive
// a ferramenta de Plantas legendadas (ver seção própria mais abaixo).
//
// Pedido explícito do usuário numa sessão seguinte: "remova o link do projeto, remova os layout do projeto
// também, deixe apenas a planta dentro dessa modalidade" — a apresentação pública com link+senha
// (`projeto.html`/`.css`/`.mjs`, apagados) e o editor de layouts/Designer de IA
// (`catalogo-layouts.mjs`/`.css`, `catalogo-designer.mjs`, `projeto-layout.mjs`, todos apagados) saíram por
// completo. Ambientes/móveis/renderizações/"Enviar pedido" continuam exatamente como estavam — são a base de
// dados que a planta usa pra legendar (cada ponto marcado nela aponta pra um destes ambientes). O banco (RPCs
// projeto_compartilhar/projeto_publico/layout_*, a tabela projeto_layouts, as colunas projetos.slug/pin_hash/
// compartilhar/layout_id) não foi tocado — mesma cautela já documentada neste arquivo pra outras remoções: fica
// órfão, não apagado, sem misturar limpeza de banco não pedida com a mudança pedida.
//
// Módulo self-contido, mesmo padrão de catalogo-biblioteca.mjs: não importa nada de
// catalogo.mjs — recebe o que precisa em initCatalogProjetos(). Três peças de tela:
//   1. o overlay #catalogProjetos (lista de projetos + espaço de trabalho de UM projeto);
//   2. o "dock" #catalogProjetoDock — pílula fixa no canto inferior esquerdo que mostra em qual projeto/ambiente as
//      próximas ações caem ("Ana & Bruno · Bar") e deixa trocar de ambiente sem sair da navegação;
//   3. o botão "＋" de cada item (projetoAddMarkup) que adiciona o item ao ambiente ativo em um toque.
//
// Dados: RPCs projeto_* (migration 20260920000100_projetos.sql), que já decidem sozinhas quem enxerga o quê — o
// decorador (token do catálogo) só vê os PRÓPRIOS projetos; a equipe (login) vê os da empresa. O projeto inteiro
// (ambientes → itens/renders/notas) vive num jsonb só, salvo por projeto_salvar com autosave (debounce). Nada aqui
// mostra ou envia preço: o catálogo nunca teve valores.

import { dadosApresentacao, pedidoPreviewHtml, imprimirPedido, geralHtml, apresentacaoHtml, imprimirApresentacao, reordenarItens, bindOrdenacao } from './projeto-apresentacao.mjs?v=20260926-legenda-cena';

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));
const escapeAttr = (value) => escapeHtml(value).replace(/`/g, "&#96;");

// Mesma otimização de imagem de catalogo.mjs (duplicada de propósito — módulo self-contido). `resize=contain` é
// obrigatório: só `width` faz o Storage manter a altura original (foto cortada/esticada).
function otimizarFoto(url, width, quality = 74){
  if(!url || typeof url !== "string" || !width) return url;
  const marcador = "/storage/v1/object/public/";
  const indice = url.indexOf(marcador);
  if(indice === -1) return url;
  const base = url.slice(0, indice);
  const caminho = url.slice(indice + marcador.length);
  const separador = caminho.includes("?") ? "&" : "?";
  return `${base}/storage/v1/render/image/public/${caminho}${separador}width=${width}&quality=${quality}&resize=contain`;
}

const SUGESTOES_AMBIENTE = ["Cerimônia", "Mesa de convidados", "Bar", "Lounge", "Bistrôs", "Recepção", "Pista de dança"];
const STATUS_LABEL = { rascunho: "Rascunho", pedido_enviado: "Pedido enviado", em_analise: "Em análise", convertido: "Convertido em pedido" };
const FOTO_VAZIA = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNDAgMjQwIj48cmVjdCB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgZmlsbD0iI2YxZjJmNCIvPjwvc3ZnPg==";

let ctx = null;
const S = {
  enabled: false,
  list: [], listLoaded: false, listError: "",
  current: null,      // projeto aberto/ativo (com dados completos), o mesmo que o dock mostra
  activeAmb: null,    // id do ambiente ativo: onde caem "＋ adicionar" e "salvar renderização"
  view: "list",       // "list" | "work" — só vale com o overlay aberto
  open: false,        // overlay aberto?
  filter: "todos",    // filtro da lista (equipe): "todos" | "pedidos"
  save: "idle", rev: 0, saveTimer: 0, savePromise: null, saveError: "",
  dockHidden: true, dockPop: false,
  // Plantas legendadas (ver seção própria mais abaixo): "workTab" decide se o painel do espaço de trabalho mostra o
  // ambiente ativo (de sempre) ou a aba nova "Plantas"; "activePlanta" é o id da planta aberta dentro dessa aba
  // (null = mostra a grade de plantas do projeto, não uma planta específica).
  workTab: "ambiente", // "ambiente" | "plantas"
  activePlanta: null,
  presentationAmb: null,
};

// ---------------------------------------------------------------------------------------------------------------
// Utilitários
const ambientesDe = (project = S.current) => project?.dados?.ambientes || [];
const ambienteAtivo = () => ambientesDe().find((amb) => amb.id === S.activeAmb) || null;
const plantasDe = (project = S.current) => project?.dados?.plantas || [];
const plantaAtiva = () => plantasDe().find((p) => p.id === S.activePlanta) || null;
const totalItens = (project = S.current) => ambientesDe(project).reduce((sum, amb) => sum + amb.itens.reduce((s, i) => s + (Number(i.quantidade) || 1), 0), 0);
const novoId = (prefixo) => prefixo + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");

function parseData(iso){
  const [y, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}
const dataLonga = (iso) => parseData(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
function diasAte(iso){
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((parseData(iso) - hoje) / 86400000);
}
function contagemRegressiva(iso){
  const dias = diasAte(iso);
  if(dias === 0) return "É hoje!";
  if(dias === 1) return "Amanhã";
  if(dias > 1) return `Faltam ${dias} dias`;
  return dias === -1 ? "Foi ontem" : `Realizado há ${-dias} dias`;
}
const dataHora = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function mensagemDe(error){
  const texto = String(error?.message || error || "");
  if(/failed to fetch|network|fetch failed/i.test(texto)) return "Não foi possível conectar. Verifique a internet e tente novamente.";
  if(/expirada|Sess[aã]o/i.test(texto)) return "Sua sessão do catálogo expirou. Entre novamente.";
  return texto || "Algo deu errado. Tente novamente.";
}

function rpcParams(extra){
  const sessao = ctx.getSession() || {};
  return sessao.token ? { p_token: sessao.token, ...extra } : { p_empresa_id: sessao.empresa_id, ...extra };
}
async function rpc(nome, extra = {}){
  const { data, error } = await ctx.supabase.rpc(nome, rpcParams(extra));
  if(error) throw error;
  return data;
}

// 0-1 (proporção da imagem, não pixel) — assim o ponto continua batendo com o desenho não importa o tamanho em que a
// planta é exibida na tela (zoom, celular, impressão).
function faixa01(valor, padrao){
  const n = Number(valor);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : padrao;
}
// Posição MANUAL da legenda (pedido explícito: "quero poder arrastar os blocos pra espalhar melhor") — fração do
// próprio .cpj-planta-frame (não da imagem), null enquanto ninguém arrastou ainda (aí o layout automático decide).
function normalizarPosManual(pos){
  const x = Number(pos?.x), y = Number(pos?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) } : null;
}
// Tamanho de papel escolhido pra planta (pedido explícito do usuário: "mostre as bordas como se fosse a folha de
// impressão, pra eu saber os espaços que eu posso ocupar com os prints") — chave fixa, nunca texto livre, porque
// tanto o desenho da borda na tela (`PAPEL_MM`/aspect-ratio de `.cpj-planta-stage`) quanto o `@page` de verdade na
// hora de imprimir (`estilosImpressaoPlanta`) dependem de bater com uma das opções conhecidas.
const PAPEIS_PLANTA = ["a4-retrato", "a4-paisagem", "a3-retrato", "a3-paisagem", "carta-retrato", "carta-paisagem"];
function normalizarPapelPlanta(v){ return PAPEIS_PLANTA.includes(v) ? v : "a4-retrato"; }
// Posição e zoom da imagem dentro do recorte, independentes do tamanho da área na folha.
function normalizarAjustePlanta(a){
  const x = Number(a?.x), y = Number(a?.y);
  return {
    zoom: normarFator(a?.zoom, .1, 5, 1),
    x: Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : 50,
    y: Number.isFinite(y) ? Math.max(0, Math.min(100, y)) : 50,
  };
}
// Tamanho do RETÂNGULO da planta e dos PRINTS (legendas) dentro da folha — pedido explícito: "eu preciso ter a
// opcao de aumentar a planta do cliente e diminuir os prints". São dois controles independentes (a pessoa decide
// o equilíbrio manualmente — nunca um ajusta o outro sozinho, nem os prints encolhem automaticamente pra caber,
// pedido explícito: "eu nao quero ajuste o tamanho das fotos automaticamente").
function normarFator(v, min, max, padrao){
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : padrao;
}
function normalizarPlanta(p){
  return {
    id: p.id || novoId("pl"), nome: p.nome || "Planta", url: p.url || "", path: p.path || "",
    mostrarNomes: p.mostrarNomes !== false, // padrão: com nome
    marcacao: ["ambos", "letras", "setas"].includes(p.marcacao) ? p.marcacao : "ambos",
    papel: normalizarPapelPlanta(p.papel),
    ajuste: normalizarAjustePlanta(p.ajuste),
    tamanhoPlanta: normarFator(p.tamanhoPlanta, .3, 2.5, 1),
    tamanhoPrints: normarFator(p.tamanhoPrints, .3, 2.5, 1),
    legendas: Array.isArray(p.legendas) ? p.legendas.map((l) => ({
      id: l.id || novoId("lg"), ambienteId: l.ambienteId || null,
      ponto: { x: faixa01(l.ponto?.x, .5), y: faixa01(l.ponto?.y, .5) },
      pos: normalizarPosManual(l.pos),
    })) : [],
  };
}

function normalizar(project){
  const dados = project.dados && Array.isArray(project.dados.ambientes) ? project.dados : { ambientes: [] };
  dados.ambientes = dados.ambientes.map((amb) => ({
    ...amb, id: amb.id || novoId("a"), nome: amb.nome || "Ambiente",
    itens: Array.isArray(amb.itens) ? amb.itens : [], renders: Array.isArray(amb.renders) ? amb.renders : [], notas: amb.notas || "",
  }));
  dados.plantas = Array.isArray(dados.plantas) ? dados.plantas.map(normalizarPlanta) : [];
  project.dados = dados;
  return project;
}

async function copiar(texto){
  try{ await navigator.clipboard.writeText(texto); return true; }catch{}
  const area = document.createElement("textarea");
  area.value = texto; area.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(area); area.select();
  let ok = false;
  try{ ok = document.execCommand("copy"); }catch{}
  area.remove();
  return ok;
}

// Projeto ativo lembrado entre telas/recarregamentos (por navegador — nunca vai pro banco).
function chaveAtivo(){
  const sessao = ctx.getSession() || {};
  return `catalogo_projeto_ativo:${sessao.empresa_id || ""}:${sessao.cliente_id || "equipe"}`;
}
function lerAtivo(){ try{ return JSON.parse(localStorage.getItem(chaveAtivo()) || "null"); }catch{ return null; } }
function gravarAtivo(){
  try{
    if(S.current) localStorage.setItem(chaveAtivo(), JSON.stringify({ id: S.current.id, amb: S.activeAmb }));
    else localStorage.removeItem(chaveAtivo());
  }catch{}
}

// ---------------------------------------------------------------------------------------------------------------
// Diálogo genérico (criado e removido a cada uso — sem HTML estático). onSubmit(api) devolve o valor que fecha o
// diálogo (qualquer coisa !== undefined) ou lança um erro, que aparece dentro dele sem fechar.
function abrirModal({ titulo, sub = "", corpo = "", confirmar = "Confirmar", cancelar = "Cancelar", extra = "", largo = false, perigo = false, onMount = null, onSubmit = null }){
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = `cpj-modal${largo ? " is-wide" : ""}`;
    dialog.innerHTML = `<form class="cpj-modal-form" novalidate>
      <header><h3>${escapeHtml(titulo)}</h3>${sub ? `<p>${escapeHtml(sub)}</p>` : ""}</header>
      <div class="cpj-modal-body">${corpo}</div>
      <p class="cpj-modal-error" role="alert" hidden></p>
      <footer>${extra}${cancelar ? `<button type="button" class="cpj-btn cpj-btn-ghost" data-cpj-cancel>${escapeHtml(cancelar)}</button>` : ""}${confirmar ? `<button type="submit" class="cpj-btn ${perigo ? "cpj-btn-danger" : "cpj-btn-primary"}">${escapeHtml(confirmar)}</button>` : ""}</footer>
    </form>`;
    document.body.appendChild(dialog);
    let resultado = null;
    const fechar = (valor) => { resultado = valor; if(dialog.open) dialog.close(); };
    dialog.addEventListener("close", () => { dialog.remove(); resolve(resultado); });
    dialog.addEventListener("click", (event) => { if(event.target === dialog) fechar(null); });
    const form = dialog.querySelector("form");
    const erro = dialog.querySelector(".cpj-modal-error");
    const botao = dialog.querySelector('button[type="submit"]');
    const api = {
      dialog, form, fechar,
      erro(mensagem){ erro.textContent = mensagem || ""; erro.hidden = !mensagem; },
      ocupado(valor){ if(botao) botao.disabled = Boolean(valor); },
    };
    dialog.querySelector("[data-cpj-cancel]")?.addEventListener("click", () => fechar(null));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if(!onSubmit) return fechar(true);
      api.erro(""); api.ocupado(true);
      try{
        const valor = await onSubmit(api);
        if(valor !== undefined) fechar(valor);
      }catch(error){
        api.erro(mensagemDe(error));
      }finally{
        api.ocupado(false);
      }
    });
    onMount?.(api);
    dialog.showModal();
    dialog.querySelector("[autofocus], input:not([type=hidden]), select, textarea")?.focus();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Carregamento
async function carregarLista(){
  try{
    const lista = await rpc("projeto_listar");
    S.list = Array.isArray(lista) ? lista : [];
    S.listError = "";
  }catch(error){
    S.listError = mensagemDe(error);
  }
  S.listLoaded = true;
}
async function carregarProjeto(id){
  return normalizar(await rpc("projeto_obter", { p_id: id }));
}
function definirAtual(project, ambienteId){
  S.current = project;
  S.activeAmb = ambientesDe(project).some((amb) => amb.id === ambienteId) ? ambienteId : (ambientesDe(project)[0]?.id || null);
  // Entrar num projeto sempre abre a aba "Geral" (pedido do usuário). Continua lembrando o ambiente ativo (S.activeAmb)
  // pro "＋" do catálogo e pro dock.
  S.workTab = "geral"; S.activePlanta = null;
  gravarAtivo(); pintarDock(); atualizarBotoes();
}

// ---------------------------------------------------------------------------------------------------------------
// Autosave: cada edição marca "sujo" e agenda um salvamento; salvamentos nunca se sobrepõem (o seguinte espera o
// anterior) e uma edição feita DURANTE um salvamento deixa o projeto "sujo" de novo (rev) em vez de ser dada como salva.
function marcarSujo(){
  if(!S.current) return;
  S.rev += 1; S.save = "dirty";
  pintarEstadoSalvo();
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(salvarAgora, 800);
}
async function salvarAgora(){
  clearTimeout(S.saveTimer);
  if(S.savePromise) await S.savePromise;
  if(!S.current || (S.save !== "dirty" && S.save !== "error")) return;
  const project = S.current, rev = S.rev;
  S.save = "saving"; pintarEstadoSalvo();
  S.savePromise = (async () => {
    try{
      const resumo = await rpc("projeto_salvar", { p_id: project.id, p_noivos: project.noivos, p_data_evento: project.data_evento, p_local_evento: project.local_evento, p_dados: project.dados });
      Object.assign(project, resumo);
      S.save = S.rev === rev ? "saved" : "dirty";
      S.saveError = "";
    }catch(error){
      S.save = "error"; S.saveError = mensagemDe(error);
      ctx.notify({ title: "Não foi possível salvar o projeto", message: S.saveError, status: "error" });
    }finally{
      S.savePromise = null;
      pintarEstadoSalvo();
    }
  })();
  await S.savePromise;
}
function pintarEstadoSalvo(){
  const el = document.querySelector("[data-cpj-save-state]");
  if(!el) return;
  const texto = { idle: "", dirty: "Salvando…", saving: "Salvando…", saved: "Salvo ✓", error: "Erro ao salvar" }[S.save] || "";
  el.textContent = texto;
  if(S.save === 'error'){
    const retry=document.createElement('button'); retry.type='button'; retry.className='cpj-btn cpj-btn-ghost';
    retry.textContent='Tentar salvar'; retry.onclick=()=>salvarAgora(); el.append(retry);
  }
  el.dataset.state = S.save;
}

// ---------------------------------------------------------------------------------------------------------------
// Criar projeto (noivos, data e local são obrigatórios — o servidor valida de novo)
async function fluxoCriarProjeto(){
  let fotoEscolhida = null;
  const chips = SUGESTOES_AMBIENTE.map((nome) => `<button type="button" class="cpj-chip" data-chip aria-pressed="false">${escapeHtml(nome)}</button>`).join("");
  const project = await abrirModal({
    titulo: "Novo projeto", sub: "Informações do evento — usadas na capa da apresentação.", confirmar: "Criar projeto",
    corpo: `
      <label class="cpj-field"><span>Nome dos noivos <b>*</b></span><input name="noivos" required maxlength="120" placeholder="Ex.: Ana &amp; Bruno" autocomplete="off" autofocus></label>
      <div class="cpj-field-row">
        <label class="cpj-field"><span>Data do evento <b>*</b></span><input type="date" name="data" required></label>
        <label class="cpj-field"><span>Local <b>*</b></span><input name="local" required maxlength="160" placeholder="Ex.: Sítio Vale Verde" autocomplete="off"></label>
      </div>
      <div class="cpj-field">
        <span>Foto dos noivos <small>(opcional — aparece na capa da apresentação)</small></span>
        <div class="cpj-photo-pick">
          <span class="cpj-photo-preview" data-foto-preview>${ICONE.camera}</span>
          <label class="cpj-btn cpj-btn-ghost">Escolher foto<input type="file" accept="image/jpeg,image/png,image/webp" data-foto-input hidden></label>
          <button type="button" class="cpj-btn cpj-btn-link hidden" data-foto-limpar>Remover</button>
        </div>
      </div>
      <div class="cpj-field">
        <span>Ambientes do evento</span>
        <small>Toque para incluir. Você pode criar outros, com o nome que quiser, quando quiser.</small>
        <div class="cpj-chips" data-chips>${chips}</div>
        <div class="cpj-inline-add"><input data-amb-input maxlength="60" placeholder="Outro ambiente…" autocomplete="off"><button type="button" class="cpj-btn cpj-btn-ghost" data-amb-add>＋ Adicionar</button></div>
      </div>`,
    onMount({ dialog }){
      const preview = dialog.querySelector("[data-foto-preview]");
      const limpar = dialog.querySelector("[data-foto-limpar]");
      const vazio = preview.innerHTML;
      dialog.querySelector("[data-foto-input]").addEventListener("change", (event) => {
        const arquivo = event.target.files?.[0];
        event.target.value = "";
        if(!arquivo || !arquivo.type.startsWith("image/")) return;
        fotoEscolhida = arquivo;
        preview.innerHTML = `<img src="${URL.createObjectURL(arquivo)}" alt="">`;
        limpar.classList.remove("hidden");
      });
      limpar.addEventListener("click", () => { fotoEscolhida = null; preview.innerHTML = vazio; limpar.classList.add("hidden"); });
      const host = dialog.querySelector("[data-chips]");
      host.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-chip]");
        if(chip) chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
      });
      const input = dialog.querySelector("[data-amb-input]");
      const adicionar = () => {
        const nome = input.value.trim();
        if(!nome) return;
        const existente = [...host.children].find((chip) => chip.textContent.trim().toLowerCase() === nome.toLowerCase());
        if(existente) existente.setAttribute("aria-pressed", "true");
        else host.insertAdjacentHTML("beforeend", `<button type="button" class="cpj-chip" data-chip aria-pressed="true">${escapeHtml(nome)}</button>`);
        input.value = "";
      };
      dialog.querySelector("[data-amb-add]").addEventListener("click", adicionar);
      input.addEventListener("keydown", (event) => { if(event.key === "Enter"){ event.preventDefault(); adicionar(); } });
    },
    async onSubmit(api){
      const campo = (nome) => api.form.elements[nome];
      const noivos = campo("noivos").value.trim(), data = campo("data").value, local = campo("local").value.trim();
      if(!noivos){ campo("noivos").focus(); throw new Error("Informe o nome dos noivos."); }
      if(!data){ campo("data").focus(); throw new Error("Informe a data do evento."); }
      if(!local){ campo("local").focus(); throw new Error("Informe o local do evento."); }
      const ambientes = [...api.dialog.querySelectorAll('[data-chip][aria-pressed="true"]')].map((chip) => chip.textContent.trim());
      return normalizar(await rpc("projeto_criar", { p_noivos: noivos, p_data_evento: data, p_local_evento: local, p_ambientes: ambientes }));
    },
  });
  if(!project) return null;
  await salvarAgora(); // o projeto anterior (se estava sujo) é salvo antes de trocar
  definirAtual(project, null);
  // A foto só pode subir agora: a política do Storage exige que o projeto já exista.
  if(fotoEscolhida) await definirFotoCasal(fotoEscolhida);
  S.list = [];
  S.listLoaded = false;
  return project;
}

// Nome de um ambiente novo (ou renomeado)
async function fluxoAmbiente({ titulo = "Novo ambiente", nomeAtual = "", confirmar = "Criar ambiente" } = {}){
  const existentes = new Set(ambientesDe().map((amb) => amb.nome.toLowerCase()));
  const sugestoes = nomeAtual ? "" : SUGESTOES_AMBIENTE.filter((nome) => !existentes.has(nome.toLowerCase())).map((nome) => `<button type="button" class="cpj-chip" data-sugestao>${escapeHtml(nome)}</button>`).join("");
  return abrirModal({
    titulo, confirmar,
    corpo: `<label class="cpj-field"><span>Nome do ambiente</span><input name="nome" maxlength="60" value="${escapeAttr(nomeAtual)}" placeholder="Ex.: Bar, Cerimônia, Lounge" autocomplete="off" autofocus></label>
      ${sugestoes ? `<div class="cpj-chips" data-sugestoes>${sugestoes}</div>` : ""}`,
    onMount({ dialog, form }){
      dialog.querySelector("[data-sugestoes]")?.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-sugestao]");
        if(!chip) return;
        form.elements.nome.value = chip.textContent.trim();
        form.requestSubmit();
      });
    },
    async onSubmit(api){
      const nome = api.form.elements.nome.value.trim();
      if(!nome) throw new Error("Dê um nome ao ambiente.");
      return nome;
    },
  });
}

async function criarAmbiente(nome){
  const amb = { id: novoId("a"), nome: nome.slice(0, 60), itens: [], renders: [], notas: "" };
  S.current.dados.ambientes.push(amb);
  S.activeAmb = amb.id;
  gravarAtivo(); marcarSujo(); pintarDock(); atualizarBotoes();
  return amb;
}

// Escolhe onde as próximas ações caem: sem projeto ativo, pergunta (ou cria); `sempre` mostra a escolha mesmo com um
// ativo (renderização: o ambiente importa). Devolve true quando há projeto + ambiente ativos.
async function garantirDestino({ titulo, confirmar = "Confirmar", sempre = false, moveis = null } = {}){
  if(!sempre && S.current && ambienteAtivo()) return true;
  await carregarLista();
  if(S.listError){ ctx.notify({ title: "Não foi possível abrir seus projetos", message: S.listError, status: "error" }); return false; }
  if(!S.list.length && !S.current){
    const criado = await fluxoCriarProjeto();
    if(!criado) return false;
    return garantirAmbiente();
  }
  const escolha = await escolherDestino({ titulo, confirmar, moveis });
  if(escolha === "novo"){
    const criado = await fluxoCriarProjeto();
    if(!criado) return false;
    return garantirAmbiente();
  }
  return Boolean(escolha);
}
async function garantirAmbiente(){
  if(ambienteAtivo()) return true;
  const nome = await fluxoAmbiente({ titulo: "Em qual ambiente?", confirmar: "Criar e usar" });
  if(!nome) return false;
  await criarAmbiente(nome);
  return true;
}

function escolherDestino({ titulo = "Escolha o projeto", confirmar = "Confirmar", moveis = null }){
  const projetos = S.list.slice();
  if(S.current && !projetos.some((p) => p.id === S.current.id)) projetos.unshift({ id: S.current.id, noivos: S.current.noivos, data_evento: S.current.data_evento });
  const inicial = S.current?.id || projetos[0]?.id;
  return abrirModal({
    titulo, sub: "Onde isto deve ficar salvo?", confirmar,
    extra: `<button type="button" class="cpj-btn cpj-btn-link" data-cpj-novo>＋ Novo projeto</button>`,
    corpo: `<label class="cpj-field"><span>Projeto</span><select name="projeto">${projetos.map((p) => `<option value="${escapeAttr(p.id)}"${p.id === inicial ? " selected" : ""}>${escapeHtml(p.noivos)} · ${escapeHtml(dataLonga(p.data_evento))}</option>`).join("")}</select></label>
      <label class="cpj-field"><span>Ambiente</span><select name="ambiente" disabled><option>Carregando…</option></select></label>
      <label class="cpj-field hidden" data-novo-amb><span>Nome do novo ambiente</span><input name="novoAmbiente" maxlength="60" placeholder="Ex.: Bar" autocomplete="off"></label>
      ${moveis ? `<label class="cpj-check"><input type="checkbox" name="levarMoveis" checked><span><strong>Levar também os móveis desta composição</strong><small>${escapeHtml(resumoMoveis(moveis.lista))}</small></span></label>` : ""}`,
    onMount({ dialog, form, fechar }){
      dialog.querySelector("[data-cpj-novo]").addEventListener("click", () => fechar("novo"));
      const selProjeto = form.elements.projeto, selAmb = form.elements.ambiente, novo = dialog.querySelector("[data-novo-amb]");
      let ativo = null;
      const carregar = async () => {
        selAmb.disabled = true;
        selAmb.innerHTML = "<option>Carregando…</option>";
        try{
          ativo = selProjeto.value === S.current?.id ? S.current : await carregarProjeto(selProjeto.value);
        }catch(error){
          dialog.querySelector(".cpj-modal-error").textContent = mensagemDe(error);
          dialog.querySelector(".cpj-modal-error").hidden = false;
          return;
        }
        const preferido = ativo.id === S.current?.id ? S.activeAmb : ambientesDe(ativo)[0]?.id;
        selAmb.innerHTML = ambientesDe(ativo).map((amb) => `<option value="${escapeAttr(amb.id)}"${amb.id === preferido ? " selected" : ""}>${escapeHtml(amb.nome)}</option>`).join("") + `<option value="__novo__"${ambientesDe(ativo).length ? "" : " selected"}>＋ Criar novo ambiente…</option>`;
        selAmb.disabled = false;
        selAmb.dispatchEvent(new Event("change"));
      };
      selAmb.addEventListener("change", () => novo.classList.toggle("hidden", selAmb.value !== "__novo__"));
      selProjeto.addEventListener("change", carregar);
      carregar();
      form.__alvo = () => ativo;
    },
    async onSubmit(api){
      const form = api.form;
      if(moveis) moveis.incluir = Boolean(form.elements.levarMoveis?.checked);
      const alvo = form.__alvo?.();
      if(!alvo) throw new Error("Aguarde o carregamento do projeto.");
      let nomeNovo = "";
      if(form.elements.ambiente.value === "__novo__"){
        nomeNovo = form.elements.novoAmbiente.value.trim();
        if(!nomeNovo){ form.elements.novoAmbiente.focus(); throw new Error("Dê um nome ao ambiente."); }
      }
      if(alvo.id !== S.current?.id){
        await salvarAgora();
        definirAtual(alvo, form.elements.ambiente.value === "__novo__" ? null : form.elements.ambiente.value);
      }else if(form.elements.ambiente.value !== "__novo__"){ S.activeAmb = form.elements.ambiente.value; gravarAtivo(); pintarDock(); atualizarBotoes(); }
      if(nomeNovo) await criarAmbiente(nomeNovo);
      return true;
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Itens: adicionar/alterar quantidade
function itemNome(itemId){ return ctx.findItem(itemId)?.name || "Item"; }

async function adicionarItem(itemId){
  if(!(await garantirDestino({ titulo: "Adicionar ao projeto", confirmar: "Adicionar" }))) return;
  const amb = ambienteAtivo();
  if(!amb) return;
  mudarQuantidade(amb.id, itemId, 1, { silencioso: true });
  ctx.notify({
    title: "Adicionado ao projeto", message: `${itemNome(itemId)} → ${amb.nome} · ${S.current.noivos}`, status: "done", duration: 3200,
    actionLabel: "Desfazer", onAction: () => mudarQuantidade(amb.id, itemId, -1),
  });
}

// Digitar a quantidade (pedido do usuário: "imagina que são 30 itens do mesmo" — clicar 30 vezes no "＋" não dá).
// Clicar no "＋" continua somando 1; clicar no número do chip (ou em "Quantidade" na página do item) abre um campo
// pequeno junto do botão: digita, Enter salva (0 tira do ambiente), Esc cancela. O campo mora no <body> — o chip
// fica DENTRO do <button> do card, e um <input> dentro de um <button> é HTML inválido (nem recebe foco em todo navegador).
let qtdPop = null;
function fecharQtdPop(){
  if(!qtdPop) return;
  qtdPop.el.remove();
  document.removeEventListener("pointerdown", qtdPop.fora, true);
  window.removeEventListener("resize", fecharQtdPop);
  window.removeEventListener("scroll", qtdPop.fora, true);
  const volta = qtdPop.ancora; qtdPop = null;
  if(volta?.isConnected) volta.focus?.({ preventScroll: true });
}
async function abrirQtdPop(ancora, itemId){
  fecharQtdPop();
  if(!(await garantirDestino({ titulo: "Adicionar ao projeto", confirmar: "Continuar" }))) return;
  const amb = ambienteAtivo();
  if(!amb || !ancora.isConnected) return;
  const atual = Number(amb.itens.find((i) => String(i.item_id) === String(itemId))?.quantidade) || 0;
  const el = document.createElement("div");
  el.className = "cpj-qty-pop"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Quantidade no projeto");
  el.innerHTML = `<p class="cpj-qty-pop-title">${escapeHtml(itemNome(itemId))}</p>
    <p class="cpj-qty-pop-sub">Quantidade em ${escapeHtml(amb.nome)}</p>
    <div class="cpj-qty-pop-row">
      <button type="button" data-qty-step="-1" aria-label="Diminuir">−</button>
      <input type="number" inputmode="numeric" min="0" max="999" step="1" value="${atual || 1}" aria-label="Quantidade">
      <button type="button" data-qty-step="1" aria-label="Aumentar">＋</button>
    </div>
    <button type="button" class="cpj-qty-pop-ok" data-qty-ok>${atual ? "Salvar" : "Adicionar"}</button>
    <small class="cpj-qty-pop-hint">Enter salva · 0 tira do ambiente</small>`;
  document.body.append(el);
  const input = el.querySelector("input");
  const r = ancora.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8);
  let top = r.bottom + 8; if(top + h > innerHeight - 8) top = Math.max(8, r.top - h - 8);
  el.style.left = left + "px"; el.style.top = top + "px";
  const ler = () => Math.max(0, Math.min(999, Math.round(Number(String(input.value).replace(",", ".")) || 0)));
  const desfazer = () => mudarQuantidade(amb.id, itemId, 0, { definir: atual });
  const salvar = () => {
    const nova = ler();
    fecharQtdPop();
    if(nova === atual) return;
    mudarQuantidade(amb.id, itemId, 0, { definir: nova });
    ctx.notify(nova
      ? { title: "Quantidade no projeto", message: `${nova}× ${itemNome(itemId)} → ${amb.nome}`, status: "done", duration: 3200, actionLabel: "Desfazer", onAction: desfazer }
      : { title: "Removido do projeto", message: `${itemNome(itemId)} saiu de ${amb.nome}`, status: "done", duration: 3200, actionLabel: "Desfazer", onAction: desfazer });
  };
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    const passo = event.target.closest("[data-qty-step]");
    if(passo){ input.value = String(Math.max(0, Math.min(999, ler() + Number(passo.dataset.qtyStep)))); input.focus(); input.select(); return; }
    if(event.target.closest("[data-qty-ok]")) salvar();
  });
  el.addEventListener("keydown", (event) => {
    if(event.key === "Enter"){ event.preventDefault(); salvar(); }
    else if(event.key === "Escape"){ event.preventDefault(); event.stopPropagation(); fecharQtdPop(); }
  });
  const fora = (event) => { if(!el.contains(event.target)) fecharQtdPop(); };
  qtdPop = { el, ancora, fora };
  document.addEventListener("pointerdown", fora, true);
  window.addEventListener("resize", fecharQtdPop);
  window.addEventListener("scroll", fora, true);
  input.focus(); input.select();
}

// delta positivo/negativo; zerar remove a linha. Atualiza a tela aberta sem re-renderizar tudo.
function mudarQuantidade(ambienteId, itemId, delta, { definir = null } = {}){
  const amb = ambientesDe().find((a) => a.id === ambienteId);
  if(!amb) return;
  const linha = amb.itens.find((i) => String(i.item_id) === String(itemId));
  const atual = linha ? Number(linha.quantidade) || 1 : 0;
  const nova = Math.max(0, Math.min(999, definir !== null ? definir : atual + delta));
  if(nova === atual) return;
  if(!nova) amb.itens = amb.itens.filter((i) => String(i.item_id) !== String(itemId));
  else if(linha) linha.quantidade = nova;
  else amb.itens.push({ item_id: String(itemId), quantidade: nova });
  marcarSujo(); atualizarBotoes(); pintarDock();
  if(S.open && S.view === "work"){ pintarNavegacao(); pintarPainel(); }
}

// ---------------------------------------------------------------------------------------------------------------
// Renderizações: leva o resultado de IA (3D Livre / tecido) pro ambiente do projeto.
async function paraJpeg(src, ladoMax = 2400, qualidade = 0.88){
  const resposta = await fetch(src);
  const blob = await resposta.blob();
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const c2d = canvas.getContext("2d");
  c2d.fillStyle = "#ffffff"; c2d.fillRect(0, 0, canvas.width, canvas.height);
  c2d.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((saida) => saida ? resolve(saida) : reject(new Error("Não foi possível preparar a imagem.")), "image/jpeg", qualidade));
}

// Composição (3D Livre) que gerou cada renderização: quando a IA devolve a imagem, o módulo de origem
// registra aqui a lista de móveis da cena NAQUELE momento (window.catalogRegisterRenderItems). Fica atrelada à imagem,
// não ao estado atual do 3D — dá pra mexer na composição depois e ainda salvar o resultado antigo com os móveis certos.
const composicoes = [];
function registrarItensDaRenderizacao(src, objetos, cena = null){
  if(!src || !Array.isArray(objetos)) return;
  const contagem = new Map();
  objetos.forEach((objeto) => {
    if(objeto?.itemId === undefined || objeto?.itemId === null || objeto.itemId === "") return;
    const id = String(objeto.itemId);
    const entrada = contagem.get(id) || { id, nome: objeto.itemName || "", quantidade: 0 };
    entrada.quantidade += 1;
    contagem.set(id, entrada);
  });
  // cena = { tipo: "print"|"ia", snapshot }: a cena 3D daquela imagem — vai pro Storage junto com a imagem salva, e é o
  // que o editor de cena (abrirEditorCena) reabre quando a imagem é clicada no projeto.
  composicoes.unshift({ src, itens: [...contagem.values()], cena: cena?.snapshot ? cena : null });
  composicoes.length = Math.min(composicoes.length, 8);
}
const chaveDeImagem = (src) => { try{ return src.startsWith("data:") ? src : new URL(src, location.href).href; }catch{ return src; } };
const composicaoDaImagem = (src) => composicoes.find((c) => c.src === src || chaveDeImagem(c.src) === chaveDeImagem(src)) || null;
const resumoMoveis = (lista) => lista.map((m) => `${m.quantidade}× ${ctx.findItem(m.id)?.name || m.nome || "Item"}`).join(", ");

// Devolve quantos móveis entraram/subiram de quantidade no ambiente.
function levarMoveisParaAmbiente(amb, lista){
  let alterados = 0;
  lista.forEach(({ id, quantidade }) => {
    const linha = amb.itens.find((i) => String(i.item_id) === String(id));
    const atual = linha ? Number(linha.quantidade) || 1 : 0;
    if(quantidade <= atual) return;
    if(linha) linha.quantidade = Math.min(999, quantidade);
    else amb.itens.push({ item_id: String(id), quantidade: Math.min(999, quantidade) });
    alterados += 1;
  });
  return alterados;
}

// Sobe uma imagem pro bucket "projetos" e já empurra a entrada em amb.renders (sem salvar/notificar — isso fica
// por conta de quem chama, que pode estar subindo só uma imagem ou um lote de várias de uma vez).
async function subirImagemRender(project, src){
  const blob = await paraJpeg(src);
  const path = `${ctx.getSession().empresa_id}/${project.id}/renders/${crypto.randomUUID()}.jpg`;
  const { error } = await ctx.supabase.storage.from("projetos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if(error) throw error;
  return { url: ctx.supabase.storage.from("projetos").getPublicUrl(path).data.publicUrl, path };
}
// A cena 3D da imagem vira um .json em <empresa>/<projeto>/cenas/ (mesma política de upload das imagens). Fica fora de
// projetos.dados de propósito: pode ter fotos de parede embutidas (alguns MB) e o autosave manda "dados" inteiro a cada edição.
async function subirCena(project, cena){
  const path = `${ctx.getSession().empresa_id}/${project.id}/cenas/${crypto.randomUUID()}.json`;
  const blob = new Blob([JSON.stringify(cena.snapshot)], { type: "application/json" });
  const { error } = await ctx.supabase.storage.from("projetos").upload(path, blob, { contentType: "application/json", upsert: false });
  if(error) throw error;
  return { url: ctx.supabase.storage.from("projetos").getPublicUrl(path).data.publicUrl, path, tipo: cena.tipo === "ia" ? "ia" : "print" };
}
async function uploadRenderPara(amb, project, src, origem, cena = null){
  const imagem = await subirImagemRender(project, src);
  // Sem a cena a imagem continua salva normalmente — só não dá pra reabrir o 3D dela depois.
  let cenaSalva = null;
  if(cena) try{ cenaSalva = await subirCena(project, cena); }catch(error){ console.warn("Cena 3D não salva junto da imagem:", error); }
  amb.renders.push({ id: novoId("r"), url: imagem.url, path: imagem.path, origem: origem || "Renderização", criado_em: new Date().toISOString(), ...(cenaSalva ? { cena: cenaSalva } : {}) });
}

async function salvarRender({ src, origem, botao }){
  if(!src) return;
  const rotulo = botao?.textContent;
  if(botao){ botao.disabled = true; botao.textContent = "Salvando…"; }
  try{
    const composicao = composicaoDaImagem(src);
    const moveis = composicao?.itens.length ? { lista: composicao.itens, incluir: true } : null;
    if(!(await garantirDestino({ titulo: "Salvar renderização", confirmar: "Salvar aqui", sempre: true, moveis }))) return;
    const project = S.current, amb = ambienteAtivo();
    await uploadRenderPara(amb, project, src, origem, composicao?.cena || null);
    // Os móveis da composição entram no MESMO ambiente. Quantidade = a da composição, sem somar com o que já estava lá
    // (salvar 2 ângulos da mesma composição não pode dobrar os móveis; e 24 cadeiras já no ambiente não viram 2).
    const trazidos = moveis && moveis.incluir ? levarMoveisParaAmbiente(amb, moveis.lista) : 0;
    marcarSujo(); pintarDock(); atualizarBotoes();
    if(S.open && S.view === "work"){ pintarNavegacao(); pintarPainel(); }
    await salvarAgora();
    if(botao) botao.textContent = "Salvo no projeto ✓";
    ctx.notify({ title: trazidos ? "Renderização e móveis salvos no projeto" : "Renderização salva no projeto", message: `${trazidos ? `${trazidos} ${trazidos === 1 ? "móvel" : "móveis"} · ` : ""}${amb.nome} · ${project.noivos}`, status: "done", actionLabel: "Ver projeto", onAction: () => ctx.openProjetos({ view: "work" }) });
    setTimeout(() => { if(botao){ botao.textContent = rotulo; botao.disabled = false; } }, 2400);
    return;
  }catch(error){
    ctx.notify({ title: "Não foi possível salvar a renderização", message: mensagemDe(error), status: "error" });
  }
  if(botao){ botao.textContent = rotulo; botao.disabled = false; }
}

// ---------------------------------------------------------------------------------------------------------------
// Editor de cena (pedido do usuário): clicar num print/renderização do ambiente que tenha a cena 3D guardada abre um
// modal com aquele 3D, onde a pessoa só TROCA móveis (qualquer item do catálogo com modelo 3D). Cada troca tira 1
// unidade do móvel que saiu da cena e põe 1 do que entrou, no pedido desse ambiente, na hora. Ao fechar, a imagem é
// substituída sozinha: print → print novo na hora; renderização de IA → print novo na hora e, em segundo plano, uma
// renderização de IA nova da cena editada, que toma o lugar do print quando fica pronta. A cena usa o motor do 3D Livre
// (ctx.cenaEditor, catalogo-studio3d.mjs).
async function abrirEditorCena(amb, render){
  const editor = ctx.cenaEditor;
  if(!editor?.pronto?.()){ ctx.notify({ title: "3D indisponível", message: "Abra o catálogo de novo e tente outra vez.", status: "error" }); return; }
  const project = S.current;
  const dialog = document.createElement("dialog");
  dialog.className = "cpj-modal cpj-cena-modal";
  dialog.setAttribute("aria-label", `Trocar móveis de ${amb.nome} no 3D`);
  dialog.innerHTML = `<div class="cpj-cena">
    <header class="cpj-cena-head"><div><h3>${escapeHtml(amb.nome)} · trocar móveis</h3><p>Clique num móvel do 3D e escolha ao lado o que entra no lugar. O pedido é atualizado a cada troca.</p></div>
      <button type="button" class="cpj-btn cpj-btn-primary" data-cena-concluir>Concluir</button></header>
    <div class="cpj-cena-body">
      <div class="cpj-cena-palco" data-cena-host><div class="cpj-cena-carregando" data-cena-carregando>Carregando o 3D…</div></div>
      <aside class="cpj-cena-lado">
        <section class="cpj-cena-trocas" data-cena-trocas aria-live="polite" aria-label="Alterações no pedido"></section>
        <div class="cpj-cena-sel" data-cena-sel><p class="cpj-cena-dica">Nenhum móvel selecionado. Clique num móvel do 3D.</p></div>
        <input type="search" class="cpj-cena-busca" data-cena-busca placeholder="Buscar móvel do catálogo" aria-label="Buscar móvel do catálogo" disabled>
        <div class="cpj-cena-lista" data-cena-lista role="list"></div>
      </aside>
    </div></div>`;
  document.body.appendChild(dialog);
  const $d = (sel) => dialog.querySelector(sel);
  const itens = editor.itens();
  const trocas = [];
  let selecionado = null, ocupado = false, fechando = false, carregou = false;
  const nomeDe = (id) => ctx.findItem(id)?.name || itens.find((i) => i.id === String(id))?.nome || "Item";

  const pintarLista = () => {
    const termo = editor.normalizar($d("[data-cena-busca]").value.trim());
    const lista = selecionado ? itens.filter((i) => !termo || i.busca.includes(termo)).slice(0, 80) : [];
    $d("[data-cena-lista]").innerHTML = !selecionado ? "" : lista.length ? lista.map((i) => `<button type="button" class="cpj-cena-item${i.id === selecionado.id ? " is-atual" : ""}" data-cena-item="${escapeAttr(i.id)}" role="listitem"${i.id === selecionado.id || ocupado ? " disabled" : ""}>
      <img src="${escapeAttr(otimizarFoto(i.foto, 120))}" alt="" loading="lazy"><span><strong>${escapeHtml(i.nome)}</strong>${i.categoria ? `<small>${escapeHtml(i.categoria)}</small>` : ""}</span></button>`).join("") : '<p class="cpj-cena-dica">Nenhum móvel encontrado.</p>';
  };
  const pintarSelecao = (item) => {
    selecionado = item;
    $d("[data-cena-busca]").disabled = !item;
    $d("[data-cena-sel]").innerHTML = item
      ? `<small>Selecionado</small><div class="cpj-cena-sel-item"><img src="${escapeAttr(otimizarFoto(item.foto, 120))}" alt=""><strong>${escapeHtml(item.nome)}</strong></div><small>Trocar por:</small>`
      : '<p class="cpj-cena-dica">Nenhum móvel selecionado. Clique num móvel do 3D.</p>';
    pintarLista();
  };
  // "Alterações no pedido" é a informação mais importante do modal (pedido do usuário): fica em destaque no topo da coluna,
  // sempre visível, com foto e nome de cada móvel que SAI e que ENTRA.
  const fotoDe = (id) => ctx.findItem(id)?.photo || itens.find((i) => i.id === String(id))?.foto || "";
  const linhaTroca = (tipo, id) => `<span class="cpj-cena-troca is-${tipo}"><b>${tipo === "sai" ? "− 1" : "+ 1"}</b><img src="${escapeAttr(otimizarFoto(fotoDe(id), 96))}" alt=""><span><small>${tipo === "sai" ? "Sai do pedido" : "Entra no pedido"}</small>${escapeHtml(nomeDe(id))}</span></span>`;
  const pintarTrocas = () => {
    const n = trocas.length;
    $d("[data-cena-trocas]").innerHTML = `<header><strong>Alterações no pedido</strong>${n ? `<span>${n} ${n === 1 ? "troca" : "trocas"}</span>` : ""}</header>`
      + (n ? `<ol>${trocas.map((t) => `<li>${linhaTroca("sai", t.antigo)}${linhaTroca("entra", t.novo)}</li>`).join("")}</ol>`
        : '<p>Nenhuma alteração ainda. Cada troca feita no 3D aparece aqui e já vale para o pedido.</p>');
    const lista = $d("[data-cena-trocas] ol");
    if(lista) lista.scrollTop = lista.scrollHeight;
  };

  const fechar = async () => {
    if(fechando || ocupado) return;
    fechando = true;
    const botao = $d("[data-cena-concluir]");
    botao.disabled = true; botao.textContent = trocas.length ? "Atualizando imagem…" : "Fechando…";
    let captura = null, corpoIA = null;
    if(carregou && trocas.length){
      try{
        captura = editor.capturar();
        if(render.cena?.tipo === "ia") corpoIA = editor.corpoIA();
      }catch(error){ console.error("Captura da cena editada falhou:", error); }
    }
    await editor.fechar();
    dialog.close(); dialog.remove();
    if(captura) substituirImagemDaCena(project, amb.id, render.id, captura, corpoIA);
  };

  dialog.addEventListener("cancel", (event) => { event.preventDefault(); fechar(); });
  $d("[data-cena-concluir]").addEventListener("click", fechar);
  $d("[data-cena-busca]").addEventListener("input", pintarLista);
  $d("[data-cena-lista]").addEventListener("click", async (event) => {
    const botao = event.target.closest("[data-cena-item]");
    if(!botao || ocupado || !selecionado || botao.dataset.cenaItem === selecionado.id) return;
    ocupado = true; pintarLista();
    try{
      const troca = await editor.trocar(botao.dataset.cenaItem);
      if(troca.antigo !== troca.novo){
        // "só retire aquilo que sair do 3D": 1 unidade sai, 1 entra.
        mudarQuantidade(amb.id, troca.antigo, -1);
        mudarQuantidade(amb.id, troca.novo, 1);
        trocas.push(troca); pintarTrocas();
      }
    }catch(error){
      ctx.notify({ title: "Não foi possível trocar o móvel", message: mensagemDe(error), status: "error" });
    }finally{
      ocupado = false; pintarLista();
    }
  });

  pintarTrocas();
  dialog.showModal();
  try{
    const resposta = await fetch(render.cena.url);
    if(!resposta.ok) throw new Error("A cena 3D desta imagem não foi encontrada.");
    const cena = await resposta.json();
    const { faltando } = await editor.abrir($d("[data-cena-host]"), cena, { onSelecionar: pintarSelecao });
    carregou = true;
    $d("[data-cena-carregando]")?.remove();
    if(faltando) ctx.notify({ title: "Alguns móveis não apareceram", message: `${faltando} ${faltando === 1 ? "móvel não está mais disponível" : "móveis não estão mais disponíveis"} em 3D no catálogo.`, status: "error" });
  }catch(error){
    console.error("Editor de cena:", error);
    const aviso = $d("[data-cena-carregando]");
    if(aviso){ aviso.textContent = "Não foi possível abrir o 3D desta imagem. " + mensagemDe(error); aviso.classList.add("is-erro"); }
  }
}

// Substitui a imagem do ambiente depois da edição: sobe o print novo + a cena nova no lugar dos antigos (mesma posição
// na lista). Se a imagem era de IA, dispara uma renderização de IA nova e troca de novo quando ela chega.
async function substituirImagemDaCena(project, ambId, renderId, captura, corpoIA){
  const localizar = () => {
    const alvo = S.current?.id === project.id ? S.current : project;
    const amb = ambientesDe(alvo).find((a) => a.id === ambId);
    return { alvo, amb, render: amb?.renders.find((r) => r.id === renderId) };
  };
  const persistir = async (alvo) => {
    if(alvo === S.current){ marcarSujo(); if(S.open && S.view === "work"){ pintarNavegacao(); pintarPainel(); } await salvarAgora(); }
    else await rpc("projeto_salvar", { p_id: alvo.id, p_noivos: alvo.noivos, p_data_evento: alvo.data_evento, p_local_evento: alvo.local_evento, p_dados: alvo.dados });
  };
  try{
    const [imagem, cena] = await Promise.all([subirImagemRender(project, captura.foto), subirCena(project, { tipo: corpoIA ? "ia" : "print", snapshot: captura.snapshot })]);
    const { alvo, render } = localizar();
    if(!render){ ctx.supabase.storage.from("projetos").remove([imagem.path, cena.path]).catch(() => {}); return; }
    const antigos = [render.path, render.cena?.path].filter(Boolean);
    Object.assign(render, { url: imagem.url, path: imagem.path, cena, atualizado_em: new Date().toISOString() });
    await persistir(alvo);
    if(antigos.length) ctx.supabase.storage.from("projetos").remove(antigos).catch(() => {});
    if(!corpoIA) ctx.notify({ title: "Pedido e imagem atualizados", message: "A imagem do ambiente já mostra os móveis novos.", status: "done", image: imagem.url });
  }catch(error){
    ctx.notify({ title: "O pedido foi atualizado, mas a imagem não", message: mensagemDe(error), status: "error" });
    return;
  }
  if(!corpoIA) return;
  const aguarde = ctx.notify({ title: "Renderizando a cena com os móveis novos", message: "A imagem de IA do ambiente será trocada quando ficar pronta.", status: "working", duration: 0 });
  try{
    const src = await ctx.cenaEditor.executarIA(corpoIA);
    const imagem = await subirImagemRender(project, src);
    const { alvo, render } = localizar();
    aguarde?.close?.();
    if(!render){ ctx.supabase.storage.from("projetos").remove([imagem.path]).catch(() => {}); return; }
    const printProvisorio = render.path;
    Object.assign(render, { url: imagem.url, path: imagem.path, atualizado_em: new Date().toISOString() });
    await persistir(alvo);
    if(printProvisorio) ctx.supabase.storage.from("projetos").remove([printProvisorio]).catch(() => {});
    ctx.notify({ title: "Renderização atualizada", message: "A imagem de IA do ambiente já mostra os móveis novos.", status: "done", image: imagem.url });
  }catch(error){
    aguarde?.close?.();
    ctx.notify({ title: "A renderização de IA não foi concluída", message: `${mensagemDe(error)} A imagem ficou com o print do 3D com os móveis novos.`, status: "error" });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Foto dos noivos (opcional): vive em dados.foto_casal = {url, path} e aparece no cabeçalho do projeto, no cartão da lista
// e na capa da apresentação. Sobe no bucket "projetos" em <empresa>/<projeto>/casal/<uuid>.jpg (a mesma política de
// upload das renderizações). Mantém a proporção original (até 1600px) — o enquadramento em círculo é do CSS.
const fotoCasalDe = (project = S.current) => project?.dados?.foto_casal?.url || "";

async function definirFotoCasal(file){
  const project = S.current;
  if(!project || !file) return false;
  if(!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024){
    ctx.notify({ title: "Não foi possível usar essa foto", message: "Envie uma imagem JPG, PNG ou WebP de até 20 MB.", status: "error" });
    return false;
  }
  try{
    const local = URL.createObjectURL(file);
    let blob;
    try{ blob = await paraJpeg(local, 1600, 0.88); }finally{ URL.revokeObjectURL(local); }
    const path = `${ctx.getSession().empresa_id}/${project.id}/casal/${crypto.randomUUID()}.jpg`;
    const { error } = await ctx.supabase.storage.from("projetos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if(error) throw error;
    const { data } = ctx.supabase.storage.from("projetos").getPublicUrl(path);
    const antigo = project.dados.foto_casal?.path;
    project.dados.foto_casal = { url: data.publicUrl, path };
    marcarSujo(); pintarCabecalho();
    await salvarAgora();
    if(antigo) ctx.supabase.storage.from("projetos").remove([antigo]).catch(() => {});
    return true;
  }catch(error){
    ctx.notify({ title: "Não foi possível enviar a foto", message: mensagemDe(error), status: "error" });
    return false;
  }
}

function removerFotoCasal(){
  const project = S.current;
  const antigo = project?.dados?.foto_casal?.path;
  if(!project || !project.dados.foto_casal) return;
  delete project.dados.foto_casal;
  marcarSujo(); pintarCabecalho();
  if(antigo) ctx.supabase.storage.from("projetos").remove([antigo]).catch(() => {});
}

// ---------------------------------------------------------------------------------------------------------------
// Enviar pedido
async function fluxoEnviarPedido(){
  const project = S.current;
  if(!project) return;
  await salvarAgora();
  const total = totalItens(project);
  const reenvio = project.status !== "rascunho";

  const enviado = await abrirModal({
    largo: true,
    extra: total ? '<button type="button" class="cpj-btn cpj-btn-ghost cpj-btn-link" data-cpj-pedido-pdf>Baixar PDF</button>' : '',
    onMount({dialog,form,erro}){
      if(total) dialog.classList.add("cpj-order-preview");
      dialog.querySelector('[data-cpj-pedido-pdf]')?.addEventListener('click',async (event)=>{
        const botao = event.currentTarget;
        botao.disabled = true; botao.textContent = 'Preparando PDF…'; erro('');
        try {
          await imprimirPedido(dadosApresentacao(project,ctx.findItem),{decorador:ctx.getDecorator?.(),empresa:ctx.getCompany?.(),observacao:form.elements.obs.value});
        } catch(error){ erro(mensagemDe(error)); }
        finally { botao.disabled = false; botao.textContent = 'Baixar PDF'; }
      });
    },
    titulo: reenvio ? "Reenviar pedido à Chiavari" : "Enviar pedido à Chiavari",
    sub: total ? "A equipe recebe os itens e as quantidades de cada ambiente." : "",
    confirmar: total ? (reenvio ? "Reenviar pedido" : "Enviar pedido") : null,
    corpo: total
      ? `${pedidoPreviewHtml(dadosApresentacao(project, ctx.findItem), { decorador: ctx.getDecorator?.(), empresa: ctx.getCompany?.() })}
         <label class="cpj-field"><span>Observação para a equipe (opcional)</span><textarea name="obs" rows="3" maxlength="800" placeholder="Ex.: prazo, detalhes de montagem, preferências…">${escapeHtml(reenvio ? (project.pedido_observacao || "") : "")}</textarea></label>`
      : `<p class="cpj-share-text">Adicione ao menos um móvel a um ambiente antes de enviar o pedido.</p>`,
    async onSubmit(api){
      const resumoNovo = await rpc("projeto_enviar_pedido", { p_id: project.id, p_observacao: api.form.elements.obs.value.trim() || null });
      Object.assign(project, resumoNovo);
      return true;
    },
  });
  if(!enviado) return;
  try{
    const atualizado = await carregarProjeto(project.id);
    definirAtual(atualizado, S.activeAmb);
  }catch{}
  pintarCabecalho();
  ctx.notify({ title: "Pedido enviado à Chiavari", message: `${project.noivos} · ${total} ${total === 1 ? "item" : "itens"}`, status: "done" });
}

// Muda o status de UM projeto específico (não necessariamente S.current — "Ver pedido" pode ser aberto direto da
// lista, sem passar pelo espaço de trabalho). Sincroniza S.current só se for o mesmo projeto já aberto.
async function atualizarStatus(project, status){
  try{
    Object.assign(project, await rpc("projeto_atualizar_status", { p_id: project.id, p_status: status }));
    if(S.current?.id === project.id){ Object.assign(S.current, project); pintarCabecalho(); }
    ctx.notify({ title: "Status atualizado", message: STATUS_LABEL[status], status: "done", duration: 2500 });
    return true;
  }catch(error){
    ctx.notify({ title: "Não foi possível atualizar", message: mensagemDe(error), status: "error" });
    return false;
  }
}

// "Ver pedido": mesma prévia bonita (com foto e renderizações) que já existe em "Enviar/Reenviar pedido" —
// pedido explícito do usuário pra não inventar uma segunda forma de mostrar a mesma coisa. Abre a partir da linha
// do projeto na lista, sem precisar entrar no espaço de trabalho; busca os dados na hora (carregarProjeto), já
// que a lista só guarda um resumo. Status atual/observação/aviso de "alterado depois do envio" ficam num bloco no
// topo do diálogo (staff pode mudar o status ali mesmo) — sem o resumo de texto cru que existia antes (o "Ver o
// que foi enviado" da caixa que ficava dentro do projeto); a prévia com foto já mostra isso de um jeito melhor.
function pedidoStatusHtml(project, staff){
  const alterado = project.pedido_snapshot?.ambientes && assinatura(project.pedido_snapshot.ambientes) !== assinatura(ambientesDe(project));
  return `<div class="cpj-banner is-${escapeAttr(project.status)}">
    <div class="cpj-banner-main">
      <span class="cpj-status is-${escapeAttr(project.status)}">${escapeHtml(STATUS_LABEL[project.status])}</span>
      <span>Pedido enviado em ${escapeHtml(dataHora(project.pedido_enviado_em))}${project.pedido_snapshot?.total_itens ? ` · ${project.pedido_snapshot.total_itens} ${project.pedido_snapshot.total_itens === 1 ? "item" : "itens"}` : ""}</span>
      ${staff ? `<span class="cpj-banner-status" role="group" aria-label="Mudar status do pedido">${["pedido_enviado", "em_analise", "convertido"].map((status) => `<button type="button" class="cpj-chip" aria-pressed="${project.status === status}" data-cpj-ver-status="${status}">${escapeHtml(STATUS_LABEL[status])}</button>`).join("")}</span>` : ""}
    </div>
    ${project.pedido_observacao ? `<p class="cpj-banner-obs">“${escapeHtml(project.pedido_observacao)}”</p>` : ""}
    ${alterado ? `<p class="cpj-banner-warn">O projeto foi alterado depois do envio. Abra o projeto e use “Reenviar pedido” para atualizar o que a equipe recebeu.</p>` : ""}
  </div>`;
}

async function fluxoVerPedido(id){
  let project;
  try{
    project = await carregarProjeto(id);
  }catch(error){
    ctx.notify({ title: "Não foi possível abrir o pedido", message: mensagemDe(error), status: "error" });
    return;
  }
  const staff = ctx.isStaff();
  await abrirModal({
    largo: true,
    titulo: project.noivos,
    confirmar: null,
    cancelar: "Fechar",
    extra: '<button type="button" class="cpj-btn cpj-btn-ghost cpj-btn-link" data-cpj-pedido-pdf>Baixar PDF</button>',
    corpo: `<div data-cpj-pedido-status>${pedidoStatusHtml(project, staff)}</div>${pedidoPreviewHtml(dadosApresentacao(project, ctx.findItem), { decorador: ctx.getDecorator?.(), empresa: ctx.getCompany?.() })}`,
    onMount({ dialog, erro }){
      dialog.classList.add("cpj-order-preview");
      dialog.querySelector('[data-cpj-pedido-pdf]')?.addEventListener('click', async (event) => {
        const botao = event.currentTarget;
        botao.disabled = true; botao.textContent = 'Preparando PDF…'; erro('');
        try{
          await imprimirPedido(dadosApresentacao(project, ctx.findItem), { decorador: ctx.getDecorator?.(), empresa: ctx.getCompany?.(), observacao: project.pedido_observacao || '' });
        }catch(error){ erro(mensagemDe(error)); }
        finally{ botao.disabled = false; botao.textContent = 'Baixar PDF'; }
      });
      if(!staff) return;
      const status = dialog.querySelector('[data-cpj-pedido-status]');
      status.addEventListener('click', async (event) => {
        const botao = event.target.closest('[data-cpj-ver-status]');
        if(!botao || botao.dataset.cpjVerStatus === project.status) return;
        const grupo = botao.closest('.cpj-banner-status');
        grupo?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        const ok = await atualizarStatus(project, botao.dataset.cpjVerStatus);
        if(ok){
          status.innerHTML = pedidoStatusHtml(project, staff);
          const entrada = S.list.find((item) => item.id === project.id);
          if(entrada) entrada.status = project.status;
          pintarLista();
        }else{
          grupo?.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        }
      });
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Editar dados do evento / excluir / abrir
async function fluxoEditarInfo(){
  const project = S.current;
  const feito = await abrirModal({
    titulo: "Dados do evento", confirmar: "Salvar",
    corpo: `<label class="cpj-field"><span>Nome dos noivos <b>*</b></span><input name="noivos" required maxlength="120" value="${escapeAttr(project.noivos)}" autocomplete="off" autofocus></label>
      <div class="cpj-field-row">
        <label class="cpj-field"><span>Data do evento <b>*</b></span><input type="date" name="data" required value="${escapeAttr(String(project.data_evento).slice(0, 10))}"></label>
        <label class="cpj-field"><span>Local <b>*</b></span><input name="local" required maxlength="160" value="${escapeAttr(project.local_evento)}" autocomplete="off"></label>
      </div>`,
    async onSubmit(api){
      const noivos = api.form.elements.noivos.value.trim(), data = api.form.elements.data.value, local = api.form.elements.local.value.trim();
      if(!noivos) throw new Error("Informe o nome dos noivos.");
      if(!data) throw new Error("Informe a data do evento.");
      if(!local) throw new Error("Informe o local do evento.");
      project.noivos = noivos; project.data_evento = data; project.local_evento = local;
      return true;
    },
  });
  if(!feito) return;
  marcarSujo(); pintarCabecalho(); pintarDock();
}

async function fluxoExcluirProjeto(id, noivos){
  const ok = await abrirModal({
    titulo: "Excluir projeto?", sub: `“${noivos}” será apagado, com os ambientes e as renderizações salvas. Isso não pode ser desfeito.`,
    confirmar: "Excluir projeto", perigo: true, corpo: "",
  });
  if(!ok) return;
  try{
    // Apaga as renderizações do Storage ANTES de excluir a linha: a política de remoção só vale enquanto o projeto existe.
    try{
      const empresaId = ctx.getSession().empresa_id;
      for(const nome of ["renders", "casal", "cenas"]){
        const pasta = `${empresaId}/${id}/${nome}`;
        const { data } = await ctx.supabase.storage.from("projetos").list(pasta, { limit: 500 });
        if(data?.length) await ctx.supabase.storage.from("projetos").remove(data.map((arquivo) => `${pasta}/${arquivo.name}`));
      }
    }catch{}
    await rpc("projeto_excluir", { p_id: id });
    if(S.current?.id === id){ S.current = null; S.activeAmb = null; gravarAtivo(); pintarDock(); atualizarBotoes(); }
    S.list = S.list.filter((p) => p.id !== id);
    pintarLista();
    ctx.notify({ title: "Projeto excluído", message: noivos, status: "done", duration: 2500 });
  }catch(error){
    ctx.notify({ title: "Não foi possível excluir", message: mensagemDe(error), status: "error" });
  }
}

async function abrirProjeto(id){
  try{
    await salvarAgora();
    if(S.save==='error') return;
    const project = await carregarProjeto(id);
    definirAtual(project, S.current?.id === id ? S.activeAmb : lerAtivo()?.id === id ? lerAtivo().amb : null);
    S.view = "work";
    pintarTela();
  }catch(error){
    ctx.notify({ title: "Não foi possível abrir o projeto", message: mensagemDe(error), status: "error" });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Telas do overlay
const ICONE = {
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v10H4z"/><circle cx="12" cy="13" r="3.4"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>`,
  layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>`,
  planta: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M3.5 14h7v6.5M14 3.5v6.5h6.5"/></svg>`,
};

function pintarTela(){
  const root = $("catalogProjetos");
  if(!root || !S.open) return;
  if(S.view !== "work" || S.workTab !== "plantas") limparPlantaListeners(); // saindo do espaço de trabalho/da aba Plantas — não deixa o listener de resize vazando
  if(S.view === "work" && S.current){
    root.innerHTML = `<div class="cpj-wrap cpj-work">
      <header class="cpj-work-head" data-cpj-head></header>
      <div class="cpj-work-body">
        <nav class="cpj-amb-nav" data-cpj-nav aria-label="Ambientes"></nav>
        <section class="cpj-amb-panel" data-cpj-panel></section>
      </div>
    </div>`;
    pintarCabecalho(); pintarNavegacao(); pintarPainel();
  }else{
    S.view = "list";
    root.innerHTML = `<div class="cpj-wrap cpj-listing" data-cpj-lista></div>`;
    pintarLista();
    if(!S.listLoaded) carregarLista().then(() => { if(S.open && S.view === "list") pintarLista(); });
  }
}

function cartaoProjeto(p){
  const dias = diasAte(p.data_evento);
  const passado = dias < 0;
  const data = parseData(p.data_evento);
  return `<article class="cpj-card${passado ? " is-past" : ""}" data-cpj-open="${escapeAttr(p.id)}" tabindex="0" role="button" aria-label="Abrir projeto ${escapeAttr(p.noivos)}">
    <div class="cpj-card-date" aria-hidden="true"><b>${data.getDate()}</b><span>${escapeHtml(data.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""))}</span><small>${data.getFullYear()}</small></div>
    <div class="cpj-card-main">
      <div class="cpj-card-title">${p.foto_casal_url ? `<img class="cpj-card-avatar" src="${escapeAttr(otimizarFoto(p.foto_casal_url, 120))}" alt="" loading="lazy">` : ""}<h3>${escapeHtml(p.noivos)}</h3></div>
      <p>${ICONE.pin}<span>${escapeHtml(p.local_evento)}</span></p>
      <p class="cpj-card-meta">${p.ambientes} ${p.ambientes === 1 ? "ambiente" : "ambientes"} · ${p.itens} ${p.itens === 1 ? "item" : "itens"}${p.renders ? ` · ${p.renders} ${p.renders === 1 ? "renderização" : "renderizações"}` : ""}</p>
      ${ctx.isStaff() ? `<p class="cpj-card-owner">${p.dono === "Equipe" ? "Criado pela equipe" : `Decorador: <strong>${escapeHtml(p.dono)}</strong>`}</p>` : ""}
    </div>
    <div class="cpj-card-side">
      <span class="cpj-countdown">${escapeHtml(contagemRegressiva(p.data_evento))}</span>
      ${p.status === "rascunho"
        ? `<span class="cpj-status is-${escapeAttr(p.status)}">${escapeHtml(STATUS_LABEL[p.status] || p.status)}</span>`
        : `<button type="button" class="cpj-status is-${escapeAttr(p.status)}" data-cpj-ver-pedido="${escapeAttr(p.id)}" title="Ver o pedido enviado">${escapeHtml(STATUS_LABEL[p.status] || p.status)}</button>`}
      <button type="button" class="cpj-icon-btn" data-cpj-delete="${escapeAttr(p.id)}" data-noivos="${escapeAttr(p.noivos)}" aria-label="Excluir projeto" title="Excluir projeto">${ICONE.trash}</button>
    </div>
  </article>`;
}

function pintarLista(){
  const host = document.querySelector("[data-cpj-lista]");
  if(!host) return;
  const staff = ctx.isStaff();
  let projetos = S.list.slice();
  if(staff && S.filter === "pedidos") projetos = projetos.filter((p) => p.status !== "rascunho");
  const hoje = projetos.filter((p) => diasAte(p.data_evento) >= 0).sort((a, b) => String(a.data_evento).localeCompare(String(b.data_evento)));
  const passados = projetos.filter((p) => diasAte(p.data_evento) < 0).sort((a, b) => String(b.data_evento).localeCompare(String(a.data_evento)));
  const pedidos = S.list.filter((p) => p.status !== "rascunho").length;
  host.innerHTML = `<header class="cpj-head">
      <div><h2>Projetos</h2><p>${staff ? "Projetos dos decoradores e da equipe." : "Cada evento em um projeto, dividido por ambiente."}</p></div>
      <div class="cpj-work-actions"><button type="button" class="cpj-btn cpj-btn-primary" data-cpj="novo">＋ Novo projeto</button></div>
    </header>
    ${staff ? `<div class="cpj-filters" role="group" aria-label="Filtrar projetos"><button type="button" class="cpj-chip" aria-pressed="${S.filter === "todos"}" data-cpj-filter="todos">Todos</button><button type="button" class="cpj-chip" aria-pressed="${S.filter === "pedidos"}" data-cpj-filter="pedidos">Pedidos recebidos${pedidos ? ` (${pedidos})` : ""}</button></div>` : ""}
    ${!S.listLoaded ? `<p class="cpj-empty">Carregando projetos…</p>`
      : S.listError ? `<p class="cpj-empty">${escapeHtml(S.listError)} <button type="button" class="cpj-btn cpj-btn-link" data-cpj="recarregar">Tentar novamente</button></p>`
      : !projetos.length ? `<div class="cpj-empty cpj-empty-big">${ICONE.layers}<strong>${S.filter === "pedidos" ? "Nenhum pedido recebido ainda" : "Nenhum projeto ainda"}</strong><span>${S.filter === "pedidos" ? "Quando um decorador enviar um pedido, ele aparece aqui." : "Crie o primeiro: informe o evento, escolha os ambientes e comece a adicionar os móveis."}</span>${S.filter === "pedidos" ? "" : `<button type="button" class="cpj-btn cpj-btn-primary" data-cpj="novo">＋ Criar projeto</button>`}</div>`
      : `<div class="cpj-list">${hoje.map(cartaoProjeto).join("")}</div>${passados.length ? `<h4 class="cpj-list-sep">Eventos já realizados</h4><div class="cpj-list">${passados.map(cartaoProjeto).join("")}</div>` : ""}`}`;
}

function pintarCabecalho(){
  const host = document.querySelector("[data-cpj-head]");
  const p = S.current;
  if(!host || !p) return;
  host.innerHTML = `
    <div class="cpj-work-id">
      <div class="cpj-avatar-wrap">
        <label class="cpj-avatar${fotoCasalDe(p) ? " has-photo" : ""}" title="${fotoCasalDe(p) ? "Trocar a foto dos noivos" : "Adicionar a foto dos noivos"}">
          ${fotoCasalDe(p) ? `<img src="${escapeAttr(otimizarFoto(fotoCasalDe(p), 260))}" alt="Foto dos noivos">` : `<span>${ICONE.camera}<small>Foto dos noivos</small></span>`}
          <input type="file" accept="image/jpeg,image/png,image/webp" data-cpj-foto-input hidden>
        </label>
        ${fotoCasalDe(p) ? `<button type="button" class="cpj-avatar-x" data-cpj="foto-remover" aria-label="Remover a foto dos noivos" title="Remover foto">×</button>` : ""}
      </div>
      <div class="cpj-work-title">
        <div class="cpj-work-title-row">
          <h2>${escapeHtml(p.noivos)}</h2>
          ${p.status === "rascunho" ? "" : `<button type="button" class="cpj-status is-${escapeAttr(p.status)}" data-cpj-ver-pedido="${escapeAttr(p.id)}" title="Ver o pedido enviado">${escapeHtml(STATUS_LABEL[p.status] || p.status)}</button>`}
        </div>
        <p>${escapeHtml(dataLonga(p.data_evento))} · ${escapeHtml(p.local_evento)} <button type="button" class="cpj-btn cpj-btn-link" data-cpj="editar-info">Editar</button></p>
      </div>
    </div>
    <div class="cpj-work-actions">
      <span class="cpj-save-state" data-cpj-save-state aria-live="polite"></span>
    </div>`;
  pintarEstadoSalvo();
}

// Assinatura do que está no projeto vs. no que foi enviado — só pra avisar "você mudou depois de enviar" (usada
// por pedidoStatusHtml, dentro do diálogo "Ver pedido" — ver função mais acima, perto de fluxoEnviarPedido).
const assinatura = (ambientes) => JSON.stringify((ambientes || []).map((amb) => [amb.nome ?? amb.ambiente, (amb.itens || []).map((i) => [String(i.item_id), Number(i.quantidade) || 1])]));

function pintarNavegacao(){
  const host = document.querySelector("[data-cpj-nav]");
  if(!host || !S.current) return;
  host.innerHTML = `<button type="button" class="cpj-amb-tab${S.workTab === "geral" ? " is-active" : ""}" data-cpj-worktab="geral">Geral</button>` + ambientesDe().map((amb) => {
    const qtd = amb.itens.reduce((s, i) => s + (Number(i.quantidade) || 1), 0);
    const ativo = S.workTab === "ambiente" && amb.id === S.activeAmb;
    return `<div class="cpj-amb-nav-entry"><button type="button" class="cpj-amb-tab${ativo ? " is-active" : ""}" data-cpj-amb="${escapeAttr(amb.id)}"><span>${escapeHtml(amb.nome)}</span><b>${qtd}</b></button>${ativo ? `<div class="cpj-amb-actions">
      <button type="button" class="cpj-amb-icon" data-cpj="renomear" data-cpj-target-amb="${escapeAttr(amb.id)}" aria-label="Renomear ${escapeAttr(amb.nome)}" title="Renomear ambiente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5L8 21H3v-5L16 3Z M13 6l5 5"/></svg></button>
      <button type="button" class="cpj-amb-icon cpj-btn-danger-text" data-cpj="excluir-ambiente" data-cpj-target-amb="${escapeAttr(amb.id)}" aria-label="Excluir ${escapeAttr(amb.nome)}" title="Excluir ambiente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7"/></svg></button>
    </div>` : ""}</div>`;
  }).join("")
    + `<button type="button" class="cpj-amb-tab cpj-amb-new" data-cpj="novo-ambiente">＋ Ambiente</button>`
    // Pedido explícito do usuário: o projeto virou uma ferramenta de legendar a planta baixa (feita no AutoCAD) pra
    // equipe de montagem, além de continuar servindo pra apresentação. "Plantas" não é mais um ambiente (não tem
    // móveis/renders/notas próprios — cada legenda dela APONTA pra um ambiente já existente), então é uma aba FIXA à
    // parte, sempre por último, nunca uma das abas dinâmicas de ambiente.
    + `<button type="button" class="cpj-amb-tab cpj-amb-tab-plantas${S.workTab === "plantas" ? " is-active" : ""}" data-cpj-worktab="plantas">${ICONE.planta}<span>Plantas</span><b>${plantasDe().length || ""}</b></button>`;
}

// Exibe somente as renderiza??es salvas com imagem, com a primeira em destaque.
function rendersMapaHtml(amb){
  const reais = amb.renders.filter((r) => r.url);
  if(!reais.length) return "";
  const ambientes = ambientesDe();
  const ambCapa = ambientes.find((a) => a.renders.some((r) => r.url)) || ambientes[0];
  const naCapa = ambCapa?.id === amb.id;
  const nota = (n) => [n === 1 ? "Destaque · tamanho grande" : "", n === 1 && naCapa ? "Também é a foto da capa" : ""].filter(Boolean).join(" · ");
  const figuras = reais.map((r, i) => `<figure class="cpj-render" data-cpj-render="${escapeAttr(r.id)}"><span class="cpj-slot-num">${i + 1}</span><img src="${escapeAttr(otimizarFoto(r.url, i === 0 ? 960 : 640))}" alt="${r.cena?.url ? `Trocar móveis de ${escapeAttr(amb.nome)} no 3D` : `Renderização de ${escapeAttr(amb.nome)}`}" loading="lazy" decoding="async" data-cpj="render-ver" tabindex="0" role="button">${r.cena?.url ? '<span class="cpj-render-3d" aria-hidden="true">Trocar móveis no 3D</span>' : ""}<figcaption>${escapeHtml(r.origem || "Renderização")}${nota(i + 1) ? ` · ${escapeHtml(nota(i + 1))}` : ""}</figcaption><button type="button" class="cpj-icon-btn" data-cpj="render-remover" aria-label="Remover renderização" title="Remover">×</button></figure>`).join("");
  return `<div class="cpj-renders cpj-renders-map" data-modo="destaque">${figuras}</div>`;
}

function vincularOrdemLista(host){
    bindOrdenacao(host.querySelector('.pa-geral'), async (ambienteId,origem,destino)=>{
      const amb=ambientesDe().find(a=>a.id===ambienteId);
      if(!amb || !reordenarItens(amb,origem,destino)) return;
      marcarSujo(); pintarPainel();
      const row=[...host.querySelectorAll('[data-pa-item]')].find(r=>r.dataset.paAmb===ambienteId && r.dataset.paItem===origem);
      row?.querySelector('button')?.focus({preventScroll:true});
      const anuncio=host.querySelector('[data-pa-anuncio]'); if(anuncio) anuncio.textContent='Ordem atualizada. Salvando…';
      await salvarAgora();
      if(anuncio?.isConnected) anuncio.textContent=S.save==='error'?'Não foi possível salvar. Use Tentar salvar.':'Ordem salva.';
    });
}

function pintarPainel(){
  const host = document.querySelector("[data-cpj-panel]");
  if(!host || !S.current) return;
  if(S.workTab !== "plantas") limparPlantaListeners(); // saindo da aba Plantas (ou nem chegando a entrar) — desliga o listener de resize se algum ficou de uma visita anterior
  if(S.workTab === "geral"){
    host.innerHTML = geralHtml(dadosApresentacao(S.current,ctx.findItem))
      + `<footer class="pa-geral-footer"><button type="button" class="cpj-btn cpj-btn-primary" data-cpj="enviar">${S.current.status === "rascunho" ? "Enviar pedido à Chiavari" : "Reenviar pedido"}</button></footer>`;
    vincularOrdemLista(host);
    return;
  }
  if(S.workTab === "apresentacao"){
    host.innerHTML=apresentacaoHtml(dadosApresentacao(S.current,ctx.findItem),S.presentationAmb); return;
  }
  if(S.workTab === "plantas"){ pintarPlantas(host); return; }
  const amb = ambienteAtivo();
  if(!amb){
    host.innerHTML = `<div class="cpj-empty cpj-empty-big">${ICONE.layers}<strong>Crie o primeiro ambiente</strong><span>Cerimônia, mesa de convidados, bar, lounge… escolha o nome que quiser e adicione os móveis dentro dele.</span><button type="button" class="cpj-btn cpj-btn-primary" data-cpj="novo-ambiente">＋ Criar ambiente</button></div>`;
    return;
  }
  // Sem título do ambiente em cima (pedido do usuário: o nome já está marcado na coluna de ambientes).
  host.innerHTML = `
    <!-- Renderizações 3D primeiro, móveis embaixo (pedido do usuário). -->
    <section class="cpj-block">
      <div class="cpj-block-head cpj-block-head-center"><h4>Renderizações</h4><span class="cpj-block-actions"><button type="button" class="cpj-btn cpj-btn-ghost" data-cpj="ir-estudio">3D Livre</button></span></div>
      <div data-cpj-renders>${rendersMapaHtml(amb)}</div>
    </section>
    <section class="cpj-block">
      <div class="cpj-block-head cpj-block-head-center"><h4>Móveis</h4></div>
      ${amb.itens.length ? `${geralHtml({ ambientes: dadosApresentacao(S.current,ctx.findItem).ambientes.filter(a=>a.id===amb.id) }, { editar: true, titulos: false })}` : `<p class="cpj-empty">Nenhum móvel neste ambiente ainda. Abra o catálogo e toque em ＋ nos itens que quiser.</p>`}
    </section>
    <section class="cpj-block">
      <div class="cpj-block-head"><h4>Observações do ambiente</h4></div>
      <textarea class="cpj-notes" data-cpj-notas rows="3" maxlength="1000" placeholder="Aparece na apresentação, abaixo do ambiente. Ex.: clima, cores, detalhes de montagem…">${escapeHtml(amb.notas)}</textarea>
    </section>`;
  if(amb.itens.length) vincularOrdemLista(host);
}

// ---------------------------------------------------------------------------------------------------------------
// Plantas legendadas — pedido explícito do usuário, depois de ouvir de uma cliente real que o projeto (do jeito que
// era, uma apresentação completa pros noivos) nunca dava pra ENVIAR de verdade: sem almofada/flor/outros detalhes
// de decoração (fora do catálogo), a apresentação ficava incompleta e ela tinha que montar outra do zero de
// qualquer forma. A partir daqui o projeto GANHA (não substitui nada — apresentação, layouts, renders e "enviar
// pedido" continuam intactos) uma ferramenta pra uso interno: a decoradora sobe a planta baixa 2D que ela já monta
// no AutoCAD, marca áreas nela arrastando o mouse, liga cada área a um AMBIENTE já cadastrado neste projeto (não é
// um formato novo — reaproveita a mesma lista de itens que "Móveis" já mantém), e o sistema desenha sozinho uma
// linha saindo daquele ponto até fora da planta, terminando numa legenda com as fotos (e opcionalmente o nome) dos
// itens daquele ambiente — pra equipe de montagem identificar o que vai em cada lugar. Um projeto pode ter várias
// plantas; cada planta tem seu próprio interruptor "mostrar nomes".
//
// Marcação por CLIQUE, não arrasto (pedido explícito do usuário, corrigindo a 1ª versão desta tela): antes era
// clicar-e-arrastar pra desenhar um retângulo, que ficava marcado na planta. Achou confuso/desnecessário — o que
// importa é DE ONDE a linha sai, não uma área inteira destacada. Agora é um clique só: marca um PONTO (não uma
// área), a linha nasce exatamente no centro desse ponto. Nem o ponto nem um número ficam "pintados" sobre a planta
// (pedido explícito numa rodada seguinte: "não quero que apareça número na planta, quero que seja somente a
// linha") — o marcador só aparece discreto no hover/foco, pra continuar editável na tela sem sobrar nada visível na
// planta impressa além da própria linha.
//
// As legendas ARRASTÁVEIS (pedido explícito depois de ver uma planta real: "quero poder arrastar os blocos pra
// espalhar melhor") — o layout automático (empilhar por lado mais próximo) continua sendo o ponto de partida, mas
// qualquer legenda pode ser puxada pra qualquer lugar do quadro; a posição escolhida fica salva por legenda
// (`legenda.pos`) e, a partir daí, essa legenda específica não entra mais no cálculo automático — só as que
// ninguém tocou ainda. A margem VERTICAL (cima/baixo) também parou de ser um valor fixo generoso: virou dinâmica,
// calculada a partir de quantas legendas (e a altura delas) realmente caem em cada lado — um lado sem nenhuma
// legenda encolhe pra um respiro mínimo, em vez de reservar sempre a margem inteira à toa (achado real, reportado
// pelo usuário com print mostrando um vão enorme acima da planta). A margem LATERAL continua fixa de propósito —
// muda só o tamanho do RETÂNGULO da planta dentro dela (`tamanhoPlanta`/`larguraPlanta`, abaixo), não a margem.
const MARGEM_PLANTA_DESKTOP = 280;
// Tamanhos "1×" — o valor real de cada planta é isso × `planta.tamanhoPlanta`/`tamanhoPrints` (pedido explícito:
// "aumentar a planta do cliente e diminuir os prints", dois controles independentes e manuais).
const LARGURA_PLANTA_BASE = 480, LABEL_PLANTA_LARGURA_BASE = 260;
function larguraPlanta(planta){ return Math.round(LARGURA_PLANTA_BASE * (planta.tamanhoPlanta ?? 1)); }
function larguraLabel(planta){ return Math.round(LABEL_PLANTA_LARGURA_BASE * (planta.tamanhoPrints ?? 1)); }
const MARGEM_VAZIA_PLANTA_DESKTOP = 48;
let pontoPendente = null;       // ponto clicado enquanto o diálogo "qual ambiente" está aberto — nunca persiste
let arrastoLabel = null;        // sessão de arrasto de uma legenda em andamento — nunca persiste
let suprimirProximoClique = false; // um arrasto de verdade ainda dispara um "click" nativo logo depois do soltar; essa flag faz esse click ser ignorado, pra não reabrir "trocar ambiente" por engano
let plantaListenersCleanup = null; // desliga o listener de resize/beforeprint/clique da planta aberta — chamado sempre que o painel troca de conteúdo
let fotosPlantaRaf = 0; // debounce do recálculo disparado quando uma foto de renderização termina de carregar (ver comentário em recalcularPlanta)
// Ajuste (zoom/posição) da PLANTA BAIXA dentro da folha — modo dedicado (igual "Ajustar imagem" do Módulo Lounge):
// enquanto ativo, arrastar na planta reposiciona a imagem em vez de marcar um ponto novo.
let ajustandoPlanta = false;
let arrastoPlanta = null; // sessão de arrasto do ajuste de planta em andamento — nunca persiste

// Achado real construindo o modo "Ajustar planta": `bindPlantaEditor()` precisa desligar/religar os listeners
// TODA vez que a planta é repintada — inclusive num repintura causada pelo PRÓPRIO botão que liga o modo
// (`pintarPainel()` depois de `ajustandoPlanta = true`, que agenda um `bindPlantaEditor()` novo via RAF). Se essa
// religada resetasse `ajustandoPlanta`, o próprio clique que liga o modo o desligaria de novo um instante depois,
// silenciosamente — o botão/CSS ainda mostrariam "ligado" (já renderizados antes desse reset), mas o arrasto real
// nunca funcionaria (bug real, achado testando). Por isso duas funções, não uma: `pararListenersPlanta()` só
// desliga os listeners de DOM (usada tanto ao religar a MESMA planta quanto ao sair de verdade) — nunca mexe no
// modo. `limparPlantaListeners()` é a saída de VERDADE do editor (trocar de aba, fechar o projeto, voltar pra
// grade de plantas) — essa sim reseta tudo, inclusive o modo, porque não faria sentido "Ajustar planta" continuar
// ligado depois de sair da tela onde ele se aplica.
function pararListenersPlanta(){
  if(plantaListenersCleanup){ plantaListenersCleanup(); plantaListenersCleanup = null; }
  cancelAnimationFrame(fotosPlantaRaf);
  pontoPendente = null;
  arrastoLabel = null;
  suprimirProximoClique = false;
}
function limparPlantaListeners(){
  pararListenersPlanta();
  ajustandoPlanta = false;
  arrastoPlanta = null;
}

// Tamanho de cada papel em mm (retrato — a orientação "paisagem" só inverte largura/altura na hora de usar).
const PAPEL_MM = { a4: [210, 297], a3: [297, 420], carta: [215.9, 279.4] };
function papelDimensoes(chave){
  const [base, orientacao] = String(chave || "a4-retrato").split("-");
  const [w, h] = PAPEL_MM[base] || PAPEL_MM.a4;
  return orientacao === "paisagem" ? { w: h, h: w } : { w, h };
}
// 1 CSS px = 1/96in (definição da própria spec, é o que a impressão do navegador usa) — 96/25.4 converte mm pra
// esse px. Achado real, reportado pelo usuário ("a marcacao da folha a4 nao condiz com a folha de impressao"):
// `.cpj-planta-pagina` (abaixo) usava `frame.getBoundingClientRect().width` como largura — o espaço que SOBRAVA
// NA TELA, que não tem NENHUMA relação com o tamanho FÍSICO real de uma folha A4 (varia com a largura da janela/
// painel lateral do navegador de cada um). A folha impressa é sempre o MESMO tamanho físico não importa a janela
// — só calculando em mm reais (`PX_POR_MM`) a linha de referência passa a corresponder de verdade à folha impressa.
const PX_POR_MM = 96 / 25.4;
const PAPEL_ROTULOS = { a4: "A4", a3: "A3", carta: "Carta" };
function papelRotulo(chave){
  const [base, orientacao] = String(chave || "a4-retrato").split("-");
  return `${PAPEL_ROTULOS[base] || "A4"} ${orientacao === "paisagem" ? "paisagem" : "retrato"}`;
}
// Regra @page de verdade pra impressão bater com o formato mostrado na tela (nome exato que a CSS spec aceita em
// `size:`, ex. "A4"/"A3"/"letter" — diferente da chave interna PAPEL_MM/PAPEL_ROTULOS).
const PAPEL_CSS = { a4: "A4", a3: "A3", carta: "letter" };
function estilosImpressaoPlanta(planta){
  const [base, orientacao] = String(planta.papel || "a4-retrato").split("-");
  return `@page{size:${PAPEL_CSS[base] || "A4"} ${orientacao === "paisagem" ? "landscape" : "portrait"};margin:0}`;
}

// Ponto do RETÂNGULO (a caixa da legenda) mais próximo de um alvo (o ponto marcado na planta) — a linha sempre
// aponta pro ponto mais curto possível até a caixa, em vez de uma borda fixa (esquerda/direita/cima/baixo); assim
// continua parecendo natural mesmo quando a legenda foi arrastada pra um lugar qualquer, não só empilhada num lado.
function letraMarcacao(indice){
  let letra = "";
  for(let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) letra = String.fromCharCode(65 + (n - 1) % 26) + letra;
  return letra;
}

function detalhesConexao(origem, destino){
  const dx = destino.x - origem.x, dy = destino.y - origem.y;
  const comprimento = Math.hypot(dx, dy);
  const ux = comprimento ? dx / comprimento : 1, uy = comprimento ? dy / comprimento : 0;
  const ponto = (base, recuo, lateral) => ({ x: base.x - ux * recuo - uy * lateral, y: base.y - uy * recuo + ux * lateral });
  const a = ponto(destino, 8, 4), b = ponto(destino, 8, -4);
  return {
    seta: `M ${a.x} ${a.y} L ${destino.x} ${destino.y} L ${b.x} ${b.y}`,
    saida: ponto(origem, 0, 12), chegada: ponto(destino, 12, 12),
  };
}

function atualizarDetalhesConexao(linha, origem, destino){
  const grupo = linha.parentElement, detalhes = detalhesConexao(origem, destino);
  grupo.querySelector(".cpj-planta-seta")?.setAttribute("d", detalhes.seta);
  for(const nome of ["saida", "chegada"]){
    const texto = grupo.querySelector(`[data-extremidade="${nome}"]`);
    texto?.setAttribute("x", detalhes[nome].x);
    texto?.setAttribute("y", detalhes[nome].y);
  }
}

function pontoMaisProximoRetangulo(box, alvo){
  return {
    x: Math.max(box.left, Math.min(box.left + box.width, alvo.x)),
    y: Math.max(box.top, Math.min(box.top + box.height, alvo.y)),
  };
}

function plantasGridHtml(){
  const plantas = plantasDe();
  return `<div class="cpj-amb-head"><div><h3>Plantas</h3><p>Suba a planta baixa (exportada do AutoCAD) e clique nos pontos — o sistema gera sozinho a legenda com fotos dos móveis, pra equipe de montagem saber o que vai em cada lugar.</p></div></div>
    <div class="cpj-plantas-grid">
      ${plantas.map((p) => `<button type="button" class="cpj-planta-card" data-cpj="planta-abrir" data-planta="${escapeAttr(p.id)}">
        <img src="${escapeAttr(otimizarFoto(p.url, 420))}" alt="" loading="lazy">
        <strong>${escapeHtml(p.nome)}</strong>
        <small>${p.legendas.length} ${p.legendas.length === 1 ? "ponto marcado" : "pontos marcados"}</small>
      </button>`).join("")}
      <label class="cpj-planta-card cpj-planta-nova">${ICONE.planta}<strong>＋ Nova planta</strong><small>Imagem (PNG ou JPEG) da planta baixa</small><input type="file" accept="image/png,image/jpeg,image/webp" data-cpj-planta-nova-input hidden></label>
    </div>`;
}

// Pedido explícito do usuário: "eu quero que voce mostre as bordas como se fosse a folha de impressao, pra eu
// saber os espacos que eu posso ocupar com os prints". Duas linhas DIFERENTES, não uma: `.cpj-planta-stage` é só
// o retângulo da PLANTA em si (proporção do papel, mas TAMANHO ajustável — ver `larguraPlanta`/"Aumentar/Diminuir
// a planta"); `.cpj-planta-pagina` (nova) é a folha de VERDADE, por FORA de tudo — planta e prints das legendas
// juntos. Pedido explícito, numa rodada seguinte, depois de ver a tela real: "por fora ali dos ambientes 3d
// precisaria ter uma outra linha que representa de fato a pagina que sera impressa" — a de cima só mostrava o
// espaço da planta, não da folha inteira. A folha é uma LINHA DE REFERÊNCIA, não um limite rígido (pedido
// explícito: "a linha sera referencia... eu nao quero que ajuste o tamanho das fotos automaticamente") — quem
// ultrapassar ela (planta ou alguma legenda) fica com o contorno VERMELHO (`recalcularPlanta()` decide isso lendo
// os retângulos de verdade depois de posicionar tudo), mas nada encolhe sozinho; a pessoa ajusta manualmente pelos
// controles de tamanho.
function plantaEditorHtml(planta){
  const { w: papelW, h: papelH } = papelDimensoes(planta.papel);
  const opcoesPapel = PAPEIS_PLANTA.map((chave) => `<option value="${chave}"${chave === planta.papel ? " selected" : ""}>${papelRotulo(chave)}</option>`).join("");
  return `<div class="cpj-planta-editor">
    <div class="cpj-planta-toolbar">
      <button type="button" class="cpj-back" data-cpj="plantas-voltar" aria-label="Voltar para as plantas">← Plantas</button>
      <button type="button" class="cpj-btn cpj-btn-ghost" data-cpj="apresentacao">Apresentação dos ambientes</button>
      <input type="text" class="cpj-planta-nome-input" data-cpj-planta-nome maxlength="60" value="${escapeAttr(planta.nome)}" aria-label="Nome da planta">
      <div class="cpj-work-actions">
        <label class="cpj-planta-toggle"><input type="checkbox" data-cpj-planta-nomes${planta.mostrarNomes ? " checked" : ""}><span>Nomes nas legendas</span></label>
        <select class="cpj-planta-papel-select" data-cpj-planta-papel aria-label="Tamanho da folha de impressão">${opcoesPapel}</select>
        <select class="cpj-planta-papel-select" data-cpj-planta-marcacao aria-label="Exibir marcações">
          ${[["ambos", "Setas e letras"], ["letras", "Só letras"], ["setas", "Só setas"]].map(([valor, texto]) => `<option value="${valor}"${(planta.marcacao || "ambos") === valor ? " selected" : ""}>${texto}</option>`).join("")}
        </select>
        <div class="cpj-planta-ajuste-group" role="group" aria-label="Tamanho da planta">
          <span class="cpj-planta-ajuste-rotulo">Área da planta</span>
          <button type="button" class="cpj-icon-btn cpj-planta-ajuste-zoom" data-cpj="planta-tamanho-menos" aria-label="Diminuir a planta" title="Diminuir a planta">−</button>
          <button type="button" class="cpj-icon-btn cpj-planta-ajuste-zoom" data-cpj="planta-tamanho-mais" aria-label="Aumentar a planta" title="Aumentar a planta">+</button>
        </div>
        <div class="cpj-planta-ajuste-group" role="group" aria-label="Zoom da imagem dentro da planta">
          <span class="cpj-planta-ajuste-rotulo">Zoom da imagem</span>
          <button type="button" class="cpj-icon-btn cpj-planta-ajuste-zoom" data-cpj="planta-zoom-menos" aria-label="Diminuir zoom da imagem" title="Diminuir zoom da imagem">−</button>
          <output class="cpj-planta-ajuste-rotulo" data-cpj-planta-zoom>${Math.round((planta.ajuste?.zoom ?? 1) * 100)}%</output>
          <button type="button" class="cpj-icon-btn cpj-planta-ajuste-zoom" data-cpj="planta-zoom-mais" aria-label="Aumentar zoom da imagem" title="Aumentar zoom da imagem">+</button>
        </div>
        <div class="cpj-planta-ajuste-group" role="group" aria-label="Tamanho dos prints">
          <span class="cpj-planta-ajuste-rotulo">Prints</span>
          <button type="button" class="cpj-icon-btn cpj-planta-ajuste-zoom" data-cpj="planta-prints-menos" aria-label="Diminuir os prints" title="Diminuir os prints">−</button>
          <button type="button" class="cpj-icon-btn cpj-planta-ajuste-zoom" data-cpj="planta-prints-mais" aria-label="Aumentar os prints" title="Aumentar os prints">+</button>
        </div>
        <button type="button" class="cpj-btn cpj-btn-ghost${ajustandoPlanta ? " is-active" : ""}" data-cpj="planta-ajuste-toggle" data-cpj-planta-ajuste-btn>${ajustandoPlanta ? "Concluir ajuste" : "Ajustar planta (arrastar)"}</button>
        <button type="button" class="cpj-btn cpj-btn-ghost" data-cpj="planta-trocar-imagem">Trocar imagem</button>
        <button type="button" class="cpj-btn cpj-btn-ghost" data-cpj="planta-baixar">Baixar planta</button>
        <button type="button" class="cpj-btn cpj-btn-ghost cpj-btn-danger-text" data-cpj="planta-excluir">Excluir planta</button>
        <input type="file" accept="image/png,image/jpeg,image/webp" data-cpj-planta-trocar-input hidden>
      </div>
    </div>
    <div class="cpj-planta-viewport" data-cpj-planta-viewport aria-label="Folha inteira">
    <div class="cpj-planta-frame" data-cpj-planta-frame>
      <div class="cpj-planta-pagina" data-cpj-planta-pagina style="aspect-ratio:${papelW}/${papelH}"><span class="cpj-planta-pagina-rotulo">Folha (${papelRotulo(planta.papel)})</span></div>
      <div class="cpj-planta-stage${ajustandoPlanta ? " is-ajustando" : ""}" data-cpj-planta-stage style="aspect-ratio:${papelW}/${papelH};width:${larguraPlanta(planta)}px">
        <img class="cpj-planta-img" src="${escapeAttr(planta.url)}" alt="${escapeAttr(planta.nome)}" data-cpj-planta-img draggable="false">
      </div>
      <svg class="cpj-planta-lines" data-cpj-planta-lines></svg>
      <div class="cpj-planta-points" data-cpj-planta-points></div>
      <div class="cpj-planta-labels" data-cpj-planta-labels></div>
    </div>
    </div>
    <p class="cpj-empty" data-cpj-planta-vazio${planta.legendas.length ? " hidden" : ""}>Nenhum ponto marcado ainda nesta planta.</p>
  </div>`;
}

// Pedido explícito do usuário, vendo a tela real: "aqui precisa os prints e nao as fotos dos itens separadas" — a
// capa de cada card, tanto no diálogo "qual é esse ponto da planta?" quanto na grade de ambientes reaproveitada
// noutros lugares, mostra a MESMA renderização (print) que a legenda da própria planta usa
// (`renderAtualDoAmbiente()`, ver `legendaLabelHtml`), não mais um mosaico de fotos soltas por item —
// evita mostrar duas coisas diferentes pro mesmo ambiente (a foto que a pessoa escolhe aqui vs. a que aparece na
// legenda depois). Ambiente sem nenhuma renderização ainda cai no mesmo estado vazio de sempre.
// Imagem que representa o ambiente na planta (legenda e cartão): a atualizada por último. Uma imagem nova entra no fim
// da lista, então sem edição continua sendo a última, como sempre; mas quando os móveis são trocados no 3D (editor de
// cena), a imagem editada ganha atualizado_em e passa a ser a da legenda, junto com o pedido (pedido do usuário: "quando
// eu alterar no 3D eu altero o pedido e a legenda automaticamente"). Empate/sem data: vale a ordem da lista.
function renderAtualDoAmbiente(amb){
  const lista = (amb?.renders || []).filter((r) => r.url);
  let escolhido = null, maior = -Infinity;
  lista.forEach((r, i) => {
    const t = Date.parse(r.atualizado_em || r.criado_em || "") || 0;
    const chave = t * 1000 + i;
    if(chave >= maior){ maior = chave; escolhido = r; }
  });
  return escolhido;
}
function ambienteMosaicoHtml(amb){
  const render = renderAtualDoAmbiente(amb);
  if(!render) return `<div class="cpj-planta-amb-mosaico is-vazio">${ICONE.layers}</div>`;
  return `<div class="cpj-planta-amb-mosaico is-print"><img src="${escapeAttr(otimizarFoto(render.url, 320))}" alt="" loading="lazy"></div>`;
}

// Escolher a QUE ambiente deste projeto um ponto marcado se refere — nunca cria ambiente novo aqui de propósito
// (isso já tem um fluxo próprio, "＋ Ambiente"; misturar os dois complicaria sem necessidade). Clique direto no
// cartão resolve a promessa — sem botão "Confirmar" separado, mais rápido pra quem vai marcar vários pontos seguidos.
function escolherAmbientePlanta(atualId){
  const ambientes = ambientesDe();
  if(!ambientes.length){
    return abrirModal({ titulo: "Nenhum ambiente neste projeto ainda", sub: "Crie um ambiente (aba anterior, “＋ Ambiente”) com os móveis daquele ponto antes de legendar a planta.", confirmar: null, cancelar: "Entendi" });
  }
  return abrirModal({
    titulo: "Qual é esse ponto da planta?", sub: "Escolha o ambiente deste projeto que fica nesse espaço — a legenda mostra as fotos dos itens dele.",
    confirmar: null, largo: true,
    corpo: `<div class="cpj-planta-amb-grid">${ambientes.map((amb) => {
      const qtd = amb.itens.reduce((s, i) => s + (Number(i.quantidade) || 1), 0);
      return `<button type="button" class="cpj-planta-amb-card${amb.id === atualId ? " is-active" : ""}" data-amb="${escapeAttr(amb.id)}">${ambienteMosaicoHtml(amb)}<strong>${escapeHtml(amb.nome)}</strong><small>${qtd} ${qtd === 1 ? "item" : "itens"}</small></button>`;
    }).join("")}</div>`,
    onMount({ dialog, fechar }){
      dialog.querySelectorAll("[data-amb]").forEach((btn) => btn.addEventListener("click", () => fechar(btn.dataset.amb)));
    },
  });
}

// Fotos GRANDES, sem nenhum card envolvendo o grupo (pedido explícito do usuário, olhando uma planta real já
// impressa: "as fotos precisam ser maiores e precisam ficar fora de qualquer card pra ganhar espaço") — só um
// cabeçalho simples (número + nome do ambiente + remover) com uma linha fina embaixo, e as fotos soltas depois,
// cada uma com um contorno bem discreto (não é uma "caixa", é só a moldura da própria foto). `data-legenda` no
// elemento RAIZ é o que `recalcularPlanta()` usa pra medir a altura de verdade de cada legenda antes de posicionar
// (a quantidade de fotos varia por ambiente, então a altura não é a mesma pra todas).
// Pedido explícito do usuário, com uma foto de referência (uma composição de lounge renderizada em 3D): "eu não
// quero que apareça a fotos os itens soltas, quero que apareça a montagem... isso o próprio sistema registrou em
// 3D" — a legenda passou a mostrar a ÚLTIMA renderização do ambiente (a mesma imagem já salva em `amb.renders` pelo
// 3D Livre, "Renderizar com IA"), não mais um mosaico de fotos avulsas por item. Fallback claro quando
// o ambiente ainda não tem nenhuma renderização — nunca volta a mostrar fotos soltas (foi pedido explicitamente pra
// tirar isso). A lista de nomes (controlada por "Nomes nas legendas") virou texto simples abaixo da imagem, em vez
// de legenda por foto — mesma informação, formato adaptado ao novo layout.
// Sem cabeçalho/card nenhum em volta da foto (pedido explícito: "retire o card em volta da foto, e retire a
// descrição também... bar, lounge, bistros... nosso objetivo é ganhar espaço") — o nome do ambiente não aparece
// mais na legenda, só a foto (e a lista de itens, se "Nomes nas legendas" estiver ligado). O "×" de remover, que
// morava dentro desse cabeçalho, virou um botão flutuando sobre o canto da própria foto (mesmo `.cpj-planta-point-x`
// já usado nos pontos da planta — aparece só no hover, `.cpj-planta-label:hover .cpj-planta-point-x` já cobria
// esse caso). `amb?.nome` continua sendo lido só pro `aria-label` do botão (acessibilidade) e como chave dos dados
// (render/itens), nunca mais impresso na tela.
function legendaLabelHtml(entrada, planta){
  const amb = ambientesDe().find((a) => a.id === entrada.legenda.ambienteId);
  const render = renderAtualDoAmbiente(amb);
  const itensTexto = (amb?.itens || []).map((linha) => {
    const item = ctx.findItem(linha.item_id);
    const qtd = Number(linha.quantidade) || 1;
    return `${qtd > 1 ? `${qtd}× ` : ""}${escapeHtml(item?.name || "Indisponível")}`;
  }).join(", ");
  return `<div class="cpj-planta-label" data-cpj="planta-legenda-trocar" data-legenda="${escapeAttr(entrada.legenda.id)}" style="width:${larguraLabel(planta)}px">
    <button type="button" class="cpj-planta-point-x" data-cpj="planta-legenda-remover" data-legenda="${escapeAttr(entrada.legenda.id)}" aria-label="Remover a legenda de ${escapeAttr(amb?.nome || "ambiente removido")}" title="Remover">×</button>
    ${render
      ? `<img class="cpj-planta-label-render" src="${escapeAttr(otimizarFoto(render.url, 700))}" alt="" draggable="false">`
      : `<p class="cpj-planta-label-vazio">Sem renderização deste ambiente ainda — gere uma composição no 3D Livre.</p>`}
    ${planta.mostrarNomes && itensTexto ? `<p class="cpj-planta-label-itens">${itensTexto}</p>` : ""}
  </div>`;
}

// Tamanho/posição da PLANTA BAIXA dentro do palco (que agora tem o formato da folha escolhida — ver
// `plantaEditorHtml`). "Cover" — a planta sempre preenche o retângulo inteiro sem sobrar vão, igual object-
// fit:cover — + a posição que a pessoa arrastar (`planta.ajuste`). Não dá pra fazer isso só com CSS (`object-fit`)
// porque o arrasto do usuário precisa compor por CIMA do "cover" — por isso o tamanho final vira pixel calculado
// aqui, não porcentagem do palco.
//
// MIN_PLANTA_OVERSCAN: mesma lição já aprendida noutro ajuste de foto de fundo desta sessão (bug real: "cover"
// puro deixa o eixo mais "apertado" (o que precisou de MENOS
// escala pra cobrir) sem NENHUMA folga pra arrastar; uma planta baixa bem mais larga que alta, numa folha em pé
// (retrato), é exatamente esse caso. Escalar um pouco além do "cover" mínimo garante folga real nos dois eixos
// sempre.
const MIN_PLANTA_OVERSCAN = 1.15;
function posicionarPlantaImg(planta){
  const stage = document.querySelector("[data-cpj-planta-stage]");
  const img = document.querySelector("[data-cpj-planta-img]");
  if(!stage || !img || !img.naturalWidth || !img.naturalHeight) return;
  const stageRect = { width: stage.offsetWidth, height: stage.offsetHeight };
  if(!stageRect.width || !stageRect.height) return;
  const ajuste = planta.ajuste || { x: 50, y: 50 };
  const escala = Math.max(stageRect.width / img.naturalWidth, stageRect.height / img.naturalHeight) * MIN_PLANTA_OVERSCAN * (ajuste.zoom ?? 1);
  const larguraFinal = img.naturalWidth * escala, alturaFinal = img.naturalHeight * escala;
  // Clampa x/y pro intervalo em que a imagem AINDA cobre o palco inteiro dos dois lados — sem isso, arrastar
  // revelaria uma faixa de fundo vazio além da borda da imagem, já que left/top sozinhos aceitariam qualquer
  // valor 0-100% sem saber se ainda sobra imagem pra cobrir ali. Matemática: com left:{x}%;transform:
  // translate(-50%,-50%), a borda esquerda da imagem fica em (x/100)*larguraPalco - larguraImagem/2 — precisa ser
  // <=0 (cobre até a borda esquerda do palco) e o mesmo espelhado do lado direito; isso dá um intervalo válido
  // `[50-folga,50+folga]` em volta do centro, onde `folga` cresce com o quanto a imagem excede o palco (zero
  // exatamente no "cover" mínimo, sem o overscan de folga).
  // Abaixo do tamanho do recorte, permite mover a imagem dentro dele;
  // acima, limita o arrasto para manter o recorte coberto.
  const folgaX = 50 * Math.abs(larguraFinal / stageRect.width - 1);
  const folgaY = 50 * Math.abs(alturaFinal / stageRect.height - 1);
  ajuste.x = Math.max(50 - folgaX, Math.min(50 + folgaX, ajuste.x));
  ajuste.y = Math.max(50 - folgaY, Math.min(50 + folgaY, ajuste.y));
  img.style.width = `${larguraFinal}px`;
  img.style.height = `${alturaFinal}px`;
  img.style.left = `${ajuste.x}%`;
  img.style.top = `${ajuste.y}%`;
}

// Tamanho do RETÂNGULO da planta e dos PRINTS — por BOTÃO, nunca pela roda do mouse (mesma decisão já tomada, e
// corrigida a pedido do usuário, pro ajuste da foto de fundo do Módulo Lounge). Os dois recalculam a planta
// inteira (não só reposicionam a imagem como o arrasto) porque mudam o TAMANHO do retângulo/das legendas, que
// afeta o empilhamento de todo mundo ao redor — diferente do arrasto, que só move a imagem dentro do MESMO
// retângulo. Faixa BEM larga de propósito (pedido explícito: "quero poder ajustar o tamanho que eu quiser") — de
// quase 1/3 do tamanho original até 2,5× maior, pros dois controles (não só a planta) — mesmos limites de
// `normarFator()` em `normalizarPlanta()`, só repetidos aqui porque o clamp acontece a cada clique, não só na
// hora de carregar/salvar.
function ampliarImagemPlanta(planta, direcao){
  const ajuste = planta.ajuste = normalizarAjustePlanta(planta.ajuste);
  const anterior = ajuste.zoom;
  ajuste.zoom = Math.max(.1, Math.min(5, Math.round((anterior + direcao * .01) * 100) / 100));
  // Amplia ao redor do centro do recorte, preservando o ponto observado após arrastar.
  ajuste.x = Math.max(0, Math.min(100, 50 + (ajuste.x - 50) * ajuste.zoom / anterior));
  ajuste.y = Math.max(0, Math.min(100, 50 + (ajuste.y - 50) * ajuste.zoom / anterior));
  posicionarPlantaImg(planta);
  const rotulo = document.querySelector("[data-cpj-planta-zoom]");
  if(rotulo) rotulo.textContent = `${Math.round(ajuste.zoom * 100)}%`;
  marcarSujo();
}

function redimensionarPlanta(planta, direcao){
  planta.tamanhoPlanta = Math.max(.3, Math.min(2.5, (planta.tamanhoPlanta ?? 1) + direcao * .15));
  marcarSujo();
  recalcularPlanta(planta);
}
function redimensionarPrints(planta, direcao){
  planta.tamanhoPrints = Math.max(.3, Math.min(2.5, (planta.tamanhoPrints ?? 1) + direcao * .15));
  marcarSujo();
  recalcularPlanta(planta);
}

// Único ponto que desenha pontos+linhas+legendas — chamado sempre que algo muda (marcar/apagar/trocar um ponto,
// redimensionar a janela). Posiciona TUDO em pixels relativos a .cpj-planta-frame (não em % da imagem) pra poder
// colocar as legendas FORA da própria planta, na margem ao redor — o ponto em si continua guardado em 0-1
// (proporção da imagem), só a exibição vira pixel na hora de desenhar.
//
// As legendas são medidas de verdade antes de posicionar (2 passos, não 1): a quantidade de fotos de cada ambiente
// varia, então a ALTURA de cada legenda varia — posicionar todas assumindo uma altura fixa faria legendas grandes
// (muitos móveis) sobrepor a vizinha. 1º passo: pinta todas sem posição (só a largura é fixa, `larguraLabel(planta)`),
// deixando o navegador calcular a altura real de cada uma. 2º passo: lê `offsetHeight` de cada uma e só depois
// decide onde cada uma entra, empilhando pela altura medida — sem re-pintar HTML de novo, só ajustando left/top de
// cada elemento já existente. Também é o único lugar que liga/desliga o aviso "nenhum ponto marcado ainda" —
// `plantaEditorHtml()` só desenha esse texto UMA vez, então precisa de alguém atualizando o `hidden` dele sempre
// que a contagem de legendas mudar (criar o 1º ponto, remover o último), não só quando o painel inteiro é refeito.
function escalaVisualPlanta(frame){
  return Number(frame.dataset.escalaVisual) || 1;
}

function enquadrarPlanta(){
  const viewport = document.querySelector("[data-cpj-planta-viewport]");
  const frame = viewport?.querySelector("[data-cpj-planta-frame]");
  if(!frame || !frame.offsetWidth || document.body.classList.contains("cpj-imprimindo-planta")) return;
  const rect = viewport.getBoundingClientRect();
  const altura = rect.height;
  const escala = Math.min(1, Math.max(1, rect.width - 24) / frame.offsetWidth, Math.max(1, altura - 24) / frame.offsetHeight);
  frame.dataset.escalaVisual = String(escala);
  frame.style.left = `${(rect.width - frame.offsetWidth * escala) / 2}px`;
  frame.style.top = `${(altura - frame.offsetHeight * escala) / 2}px`;
  frame.style.transform = `scale(${escala})`;
}

function recalcularPlanta(planta){
  const frame = document.querySelector("[data-cpj-planta-frame]");
  const stage = document.querySelector("[data-cpj-planta-stage]");
  const pointsHost = document.querySelector("[data-cpj-planta-points]");
  const labelsHost = document.querySelector("[data-cpj-planta-labels]");
  const linesHost = document.querySelector("[data-cpj-planta-lines]");
  const paginaEl = document.querySelector("[data-cpj-planta-pagina]");
  if(!frame || !stage || !pointsHost || !labelsHost || !linesHost) return;
  const larguraLabelAtual = larguraLabel(planta);
  // O documento tem coordenadas fixas. Apenas a visualizacao se adapta a tela.
  frame.style.transform = "none";
  const margemLateral = MARGEM_PLANTA_DESKTOP;
  const margemVaziaBase = MARGEM_VAZIA_PLANTA_DESKTOP;
  const { w: papelW } = papelDimensoes(planta.papel);
  const larguraPaginaPx = papelW * PX_POR_MM;
  if(paginaEl) paginaEl.style.width = `${larguraPaginaPx}px`;
  const larguraDesejada = larguraPlanta(planta);
  frame.style.width = `${Math.max(larguraDesejada + margemLateral * 2, larguraPaginaPx)}px`;
  stage.style.width = `${larguraDesejada}px`;
  posicionarPlantaImg(planta);
  // 1ª pintura: margem vertical provisória, só pra descobrir o tamanho da própria imagem — a LARGURA nunca depende
  // do valor vertical (só da margem lateral, fixa), então essa 1ª medição já é definitiva pro eixo horizontal.
  frame.style.padding = `${margemVaziaBase}px ${margemLateral}px`;
  let frameRect = frame.getBoundingClientRect();
  let stageRect = stage.getBoundingClientRect();
  if(!frameRect.width || !stageRect.width) return; // planta ainda não tem layout (imagem não carregou/painel escondido)
  let origem = { left: stageRect.left - frameRect.left, top: stageRect.top - frameRect.top, width: stageRect.width, height: stageRect.height };
  const pxPonto = (ponto) => ({ x: origem.left + ponto.x * origem.width, y: origem.top + ponto.y * origem.height });

  // `<div>`, não `<button>` — precisa aninhar o × de remover, e um botão não pode conter outro elemento interativo
  // (mesma razão já documentada nos blocos do Portal); o × em si é um `<button>` de verdade, focável.
  const entradas = planta.legendas.map((legenda) => ({ legenda, ponto: pxPonto(legenda.ponto) }));

  // Só as SEM posição manual entram no cálculo automático — as arrastadas já sabem onde vão (ver comentário da
  // seção acima).
  const automaticas = entradas.filter((entrada) => !entrada.legenda.pos);
  const manuais = entradas.filter((entrada) => entrada.legenda.pos);

  // Cada legenda automática sai pelo lado da planta mais perto do PONTO clicado (esquerda/direita/cima/baixo).
  const lados = { esquerda: [], direita: [], cima: [], baixo: [] };
  automaticas.forEach((entrada) => {
    const distancias = { esquerda: entrada.ponto.x - origem.left, direita: origem.left + origem.width - entrada.ponto.x, cima: entrada.ponto.y - origem.top, baixo: origem.top + origem.height - entrada.ponto.y };
    const lado = Object.entries(distancias).sort((a, b) => a[1] - b[1])[0][0];
    lados[lado].push(entrada);
  });
  lados.esquerda.sort((a, b) => a.ponto.y - b.ponto.y);
  lados.direita.sort((a, b) => a.ponto.y - b.ponto.y);
  lados.cima.sort((a, b) => a.ponto.x - b.ponto.x);
  lados.baixo.sort((a, b) => a.ponto.x - b.ponto.x);

  // 1º passo: pinta todas (automáticas e manuais) sem posição ainda, só pra medir a altura real de cada uma — ver
  // comentário da função acima.
  labelsHost.innerHTML = entradas.map((entrada) => legendaLabelHtml(entrada, planta)).join("");
  const els = new Map();
  labelsHost.querySelectorAll('[data-cpj="planta-legenda-trocar"]').forEach((el) => els.set(el.dataset.legenda, el));

  // Achado real (usuário reportou a linha "parando antes de encostar na foto"): a foto de cada legenda
  // (`.cpj-planta-label-render`) é uma imagem de rede de verdade (a renderização salva pelo 3D Livre),
  // que leva um tempo real pra carregar — MUITO diferente do resto da planta, que já está tudo pronto na hora. A
  // medição de altura acima (`offsetHeight`) roda na MESMA hora que o HTML é criado, ou seja, ANTES de qualquer
  // foto ter terminado de carregar: um `<img>` sem `width`/`height`/`aspect-ratio` some pra altura ZERO enquanto
  // não carrega (`height:auto` sem nada pra calcular em cima) — a legenda inteira é medida como se fosse só o
  // texto dos itens embaixo, bem mais baixa do que vai ficar de verdade. Como NADA reagia ao carregamento
  // individual de cada foto (só a imagem da PLANTA em si tinha um listener de `load`), a linha e a posição da
  // legenda ficavam PRESAS nessa medição errada pro resto da sessão — mesmo depois da foto aparecer e a legenda
  // crescer na tela, a régua continuava mirando o tamanho antigo. Corrigido re-rodando `recalcularPlanta()`
  // assim que QUALQUER foto ainda não carregada termina (sucesso ou erro, senão uma foto quebrada travaria a
  // régua pra sempre) — debounced num único `requestAnimationFrame` (`fotosPlantaRaf`) pra várias fotos
  // terminando perto uma da outra não disparar um recálculo por cada uma. Uma foto já em cache (comum: a mesma
  // renderização já apareceu no mosaico do diálogo "qual é esse ponto da planta?") never dispara isso —
  // `img.complete` já vem `true` na hora, sem esperar nada.
  labelsHost.querySelectorAll(".cpj-planta-label-render").forEach((img) => {
    if(img.complete) return;
    // Nunca recalcula EM CIMA de um arrasto em andamento — recalcularPlanta() reescreve todo o labelsHost,
    // destruindo o próprio elemento sendo arrastado (mesmo raciocínio já documentado no soltar/arrastar acima).
    // Se uma foto termina de carregar bem nesse meio-tempo, o recálculo só fica adiado (tentando de novo a cada
    // frame) até o arrasto terminar — nunca é perdido, só atrasado.
    const aoCarregar = () => {
      cancelAnimationFrame(fotosPlantaRaf);
      const tentar = () => { if(arrastoLabel){ fotosPlantaRaf = requestAnimationFrame(tentar); return; } recalcularPlanta(planta); };
      fotosPlantaRaf = requestAnimationFrame(tentar);
    };
    img.addEventListener("load", aoCarregar, { once: true });
    img.addEventListener("error", aoCarregar, { once: true });
  });

  // Mede o espaço das composições automáticas antes de reservar margens simétricas.
  // As posições manuais continuam independentes desse empilhamento.
  const alturaNecessaria = (lista) => lista.length ? Math.max(...lista.map((entrada) => els.get(entrada.legenda.id)?.offsetHeight || 110)) + 40 : margemVaziaBase;
  // Planta e folha compartilham o mesmo centro, independentemente do zoom e
  // da quantidade de composições em cada lado. Reserva espaço para a folha inteira.
  const alturaPagina = paginaEl?.getBoundingClientRect().height || 0;
  const margemCentralizada = Math.max(alturaNecessaria(lados.cima), alturaNecessaria(lados.baixo), (alturaPagina - stageRect.height) / 2);
  const margemCima = margemCentralizada;
  const margemBaixo = margemCentralizada;
  frame.style.padding = `${margemCima}px ${margemLateral}px ${margemBaixo}px ${margemLateral}px`;

  // Com a margem final aplicada, remede o frame (só a ALTURA muda — a largura já era definitiva) e recalcula os
  // pontos com a origem atualizada.
  frameRect = frame.getBoundingClientRect();
  stageRect = stage.getBoundingClientRect();
  origem = { left: stageRect.left - frameRect.left, top: stageRect.top - frameRect.top, width: stageRect.width, height: stageRect.height };
  const larguraFrame = frameRect.width, alturaFrame = frameRect.height;
  if(paginaEl){
    const paginaRect = paginaEl.getBoundingClientRect();
    paginaEl.style.left = `${(larguraFrame - paginaRect.width) / 2}px`;
    paginaEl.style.top = `${(alturaFrame - paginaRect.height) / 2}px`;
  }
  entradas.forEach((entrada) => { entrada.ponto = pxPonto(entrada.legenda.ponto); });

  // Sem número nenhum (pedido explícito: "não quero que apareça número na planta, quero que seja somente a
  // linha") — o marcador em si fica invisível por padrão (só a LINHA aparece, inclusive na impressão), revelando um
  // pontinho discreto só no hover/foco, pra ainda dar pra clicar nele no editor sem "pintar" nada na planta.
  let pontosHtml = entradas.map(({ legenda, ponto }) => `<div class="cpj-planta-point" data-cpj="planta-legenda-trocar" data-legenda="${escapeAttr(legenda.id)}" style="left:${ponto.x}px;top:${ponto.y}px"><button type="button" class="cpj-planta-point-x" data-cpj="planta-legenda-remover" data-legenda="${escapeAttr(legenda.id)}" aria-label="Remover este ponto" title="Remover">×</button></div>`).join("");
  if(pontoPendente){
    const p = pxPonto(pontoPendente);
    pontosHtml += `<span class="cpj-planta-point is-pendente" style="left:${p.x}px;top:${p.y}px" aria-hidden="true"></span>`;
  }
  pointsHost.innerHTML = pontosHtml;

  // 2º passo: agora que já sabe a altura de cada uma e a margem final, empilha de verdade (sem sobrepor) e desenha
  // a linha do PONTO exato até o canto/borda mais próximo da legenda — "a linha sai do centro da marcação", pedido
  // explícito (nunca uma borda fixa, pra continuar parecendo natural também nas legendas arrastadas).
  let linhasHtml = "";
  const GAP = 14;
  const linhaPara = (entrada, box) => {
    const alvo = pontoMaisProximoRetangulo(box, entrada.ponto);
    const letra = letraMarcacao(planta.legendas.indexOf(entrada.legenda));
    const detalhes = detalhesConexao(entrada.ponto, alvo);
    linhasHtml += `<g class="cpj-planta-conexao" aria-label="Marcação ${letra}">
      <line data-legenda="${escapeAttr(entrada.legenda.id)}" x1="${entrada.ponto.x}" y1="${entrada.ponto.y}" x2="${alvo.x}" y2="${alvo.y}"/>
      <path class="cpj-planta-seta" d="${detalhes.seta}"/>
      <text class="cpj-planta-letra" data-extremidade="saida" x="${detalhes.saida.x}" y="${detalhes.saida.y}">${letra}</text>
      <text class="cpj-planta-letra" data-extremidade="chegada" x="${detalhes.chegada.x}" y="${detalhes.chegada.y}">${letra}</text>
    </g>`;
  };
  const posicionarLateral = (lista, ladoX) => {
    const alturas = lista.map((entrada) => els.get(entrada.legenda.id)?.offsetHeight || 110);
    const total = alturas.reduce((s, h) => s + h, 0) + GAP * Math.max(0, lista.length - 1);
    let y = Math.max(4, origem.top + origem.height / 2 - total / 2);
    lista.forEach((entrada, i) => {
      const h = alturas[i];
      const top = Math.max(4, Math.min(alturaFrame - h - 4, y));
      const left = ladoX === "esquerda" ? 6 : larguraFrame - larguraLabelAtual - 6;
      const el = els.get(entrada.legenda.id);
      if(el){ el.style.left = `${left}px`; el.style.top = `${top}px`; }
      linhaPara(entrada, { left, top, width: larguraLabelAtual, height: h });
      y += h + GAP;
    });
  };
  const posicionarTopoBase = (lista, ladoY) => {
    const total = lista.length * larguraLabelAtual + GAP * Math.max(0, lista.length - 1);
    let x = Math.max(4, origem.left + origem.width / 2 - total / 2);
    lista.forEach((entrada) => {
      const el = els.get(entrada.legenda.id);
      const h = el?.offsetHeight || 110;
      const left = Math.max(4, Math.min(larguraFrame - larguraLabelAtual - 4, x));
      const top = ladoY === "cima" ? 4 : Math.max(4, alturaFrame - h - 4);
      if(el){ el.style.left = `${left}px`; el.style.top = `${top}px`; }
      linhaPara(entrada, { left, top, width: larguraLabelAtual, height: h });
      x += larguraLabelAtual + GAP;
    });
  };
  posicionarLateral(lados.esquerda, "esquerda");
  posicionarLateral(lados.direita, "direita");
  posicionarTopoBase(lados.cima, "cima");
  posicionarTopoBase(lados.baixo, "baixo");

  // Manuais: direto na posição salva (fração do frame) — nunca entram no empilhamento automático.
  manuais.forEach((entrada) => {
    const el = els.get(entrada.legenda.id);
    const left = entrada.legenda.pos.x * larguraFrame, top = entrada.legenda.pos.y * alturaFrame;
    const h = el?.offsetHeight || 110;
    if(el){ el.style.left = `${left}px`; el.style.top = `${top}px`; }
    linhaPara(entrada, { left, top, width: larguraLabelAtual, height: h });
  });

  linesHost.setAttribute("viewBox", `0 0 ${larguraFrame} ${alturaFrame}`);
  linesHost.innerHTML = linhasHtml;
  linesHost.dataset.modo = planta.marcacao || "ambos";

  const vazio = document.querySelector("[data-cpj-planta-vazio]");
  if(vazio) vazio.hidden = planta.legendas.length > 0;

  // Achado real, reportado pelo usuário vendo a tela publicada: a linha da folha é só REFERÊNCIA (pedido
  // explícito: "a linha sera referencia... eu nao quero que ajuste o tamanho das fotos automaticamente") — nada
  // aqui encolhe/reposiciona sozinho. Em vez disso, quem ultrapassa a folha (a planta ou alguma legenda) fica com
  // contorno VERMELHO, pra pessoa perceber e ajustar manualmente pelos controles de tamanho (Planta/Prints).
  // Comparação em coordenadas de TELA (getBoundingClientRect), não de frame — mais simples e já é exatamente o que
  // "cabe visualmente dentro da folha" significa.
  if(paginaEl){
    const paginaRect = paginaEl.getBoundingClientRect();
    const cabeDentro = (rect) => Boolean(rect.width) && Boolean(paginaRect.width)
      && rect.left >= paginaRect.left - .5 && rect.top >= paginaRect.top - .5
      && rect.right <= paginaRect.right + .5 && rect.bottom <= paginaRect.bottom + .5;
    stage.classList.toggle("is-fora-da-folha", !cabeDentro(stage.getBoundingClientRect()));
    els.forEach((el) => el.classList.toggle("is-fora-da-folha", !cabeDentro(el.getBoundingClientRect())));
  }
  enquadrarPlanta();
}

// Clicar na planta marca um PONTO (não mais arrastar um retângulo — pedido explícito do usuário: "eu dou um clique
// no local de onde eu quero que a linha saia"). Ligado à própria imagem (.cpj-planta-stage): o overlay dos pontos
// fica ACIMA dela na pilha (mesmo empilhamento visual de antes), mas só os pontinhos em si capturam ponteiro — o
// resto tem pointer-events:none — então um clique numa área VAZIA da planta sempre alcança este handler, e um
// clique num ponto JÁ marcado vai pro handler dele (trocar/remover, via `aoClicarOverlay`), nunca os dois ao mesmo
// tempo.
function bindPlantaEditor(planta){
  pararListenersPlanta(); // religando pra ESTA MESMA planta — nunca reseta o modo "Ajustar planta" (ver comentário acima)
  const frame = document.querySelector("[data-cpj-planta-frame]");
  const stage = document.querySelector("[data-cpj-planta-stage]");
  const img = document.querySelector("[data-cpj-planta-img]");
  const labelsHost = document.querySelector("[data-cpj-planta-labels]");
  const linesHost = document.querySelector("[data-cpj-planta-lines]");
  if(!frame || !stage || !img || !labelsHost || !linesHost) return;

  const recalc = () => recalcularPlanta(planta);
  if(img.complete) recalc(); else img.addEventListener("load", recalc, { once: true });

  let resizeRaf = 0;
  const onResize = () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(recalc); };
  window.addEventListener("resize", onResize);
  window.visualViewport?.addEventListener("resize", onResize);
  const observer = new ResizeObserver(() => enquadrarPlanta());
  observer.observe(frame.parentElement);
  observer.observe(frame.closest(".cpj-planta-editor").querySelector(".cpj-planta-toolbar"));
  const prepararImpressao = () => prepararImpressaoPlanta(planta);
  window.addEventListener("beforeprint", prepararImpressao);
  window.addEventListener("afterprint", limparImpressaoPlanta);

  const onStageClick = async (event) => {
    if(ajustandoPlanta) return; // nesse modo o clique/arrasto na planta reposiciona a IMAGEM, nunca marca ponto
    const rect = stage.getBoundingClientRect();
    const ponto = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
    pontoPendente = ponto;
    recalcularPlanta(planta); // mostra o ponto marcado enquanto o diálogo de escolher ambiente está aberto (o backdrop é translúcido, dá pra ver por trás) — só limpa "pontoPendente" depois de decidir
    const ambienteId = await escolherAmbientePlanta(null);
    pontoPendente = null;
    if(ambienteId){
      planta.legendas.push({ id: novoId("lg"), ambienteId, ponto });
      marcarSujo();
    }
    recalcularPlanta(planta);
  };
  stage.addEventListener("click", onStageClick);

  // Modo "Ajustar planta (arrastar)" — pedido explícito do usuário: "eu quero que tenha a opção de eu aumentar ou
  // diminuir o pdf que o decorador enviar dentro desse espaço da folha". Arrastar dentro do palco SEMPRE conflitaria
  // com o clique-pra-marcar-ponto de cima (o mesmo elemento, o mesmo gesto) se não fosse um modo dedicado — mesma
  // solução já usada no ajuste da foto de fundo do Lounge. Só ajusta a IMAGEM, nunca mexe em ponto/legenda nenhum,
  // então não precisa (nem deve) chamar recalcularPlanta() a cada frame do arrasto — só reposiciona a imagem.
  const onStagePointerDown = (event) => {
    if(!ajustandoPlanta || event.button) return;
    event.preventDefault();
    arrastoPlanta = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("is-arrastando-planta");
  };
  const onStagePointerMove = (event) => {
    if(!arrastoPlanta || arrastoPlanta.pointerId !== event.pointerId) return;
    const rect = stage.getBoundingClientRect();
    const dx = event.clientX - arrastoPlanta.lastX, dy = event.clientY - arrastoPlanta.lastY;
    arrastoPlanta.lastX = event.clientX; arrastoPlanta.lastY = event.clientY;
    planta.ajuste.x = Math.max(0, Math.min(100, planta.ajuste.x + (dx / rect.width) * 100));
    planta.ajuste.y = Math.max(0, Math.min(100, planta.ajuste.y + (dy / rect.height) * 100));
    posicionarPlantaImg(planta);
  };
  const onStagePointerUp = (event) => {
    if(!arrastoPlanta || arrastoPlanta.pointerId !== event.pointerId) return;
    arrastoPlanta = null;
    stage.classList.remove("is-arrastando-planta");
    marcarSujo();
  };
  stage.addEventListener("pointerdown", onStagePointerDown);
  stage.addEventListener("pointermove", onStagePointerMove);
  stage.addEventListener("pointerup", onStagePointerUp);
  stage.addEventListener("pointercancel", onStagePointerUp);

  // Arrastar uma legenda (pedido explícito: "quero poder arrastar os blocos pra espalhar melhor"). Delegado no
  // HOST (não em cada `.cpj-planta-label`) porque os elementos são recriados a cada `recalcularPlanta()` — um
  // listener direto neles morreria junto. Durante o arrasto NUNCA chama `recalcularPlanta()` (que destruiria o
  // próprio elemento sendo arrastado) — só move ESSE elemento e SUA linha diretamente; o recálculo completo (que
  // grava a posição definitiva) só roda no soltar.
  const origemAtual = () => {
    const frameRect = frame.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const escala = escalaVisualPlanta(frame);
    return { left: (stageRect.left - frameRect.left) / escala, top: (stageRect.top - frameRect.top) / escala, width: stageRect.width / escala, height: stageRect.height / escala };
  };
  const onLabelsPointerDown = (event) => {
    if(event.button) return;
    const label = event.target.closest(".cpj-planta-label");
    if(!label || event.target.closest(".cpj-planta-point-x")) return; // clicar no × não inicia arrasto
    const legenda = planta.legendas.find((l) => l.id === label.dataset.legenda);
    if(!legenda) return;
    const labelRect = label.getBoundingClientRect();
    arrastoLabel = { legenda, elemento: label, offsetX: event.clientX - labelRect.left, offsetY: event.clientY - labelRect.top, moveu: false, pointerId: event.pointerId };
    label.setPointerCapture(event.pointerId);
  };
  const onLabelsPointerMove = (event) => {
    if(!arrastoLabel || arrastoLabel.pointerId !== event.pointerId) return;
    const frameRect = frame.getBoundingClientRect();
    const escala = escalaVisualPlanta(frame);
    const left = (event.clientX - frameRect.left - arrastoLabel.offsetX) / escala;
    const top = (event.clientY - frameRect.top - arrastoLabel.offsetY) / escala;
    arrastoLabel.moveu = true;
    arrastoLabel.elemento.style.left = `${left}px`;
    arrastoLabel.elemento.style.top = `${top}px`;
    arrastoLabel.elemento.classList.add("is-arrastando");
    const linha = linesHost.querySelector(`line[data-legenda="${arrastoLabel.legenda.id}"]`);
    if(linha){
      const o = origemAtual();
      const origemPonto = { x: o.left + arrastoLabel.legenda.ponto.x * o.width, y: o.top + arrastoLabel.legenda.ponto.y * o.height };
      const alvo = pontoMaisProximoRetangulo({ left, top, width: larguraLabel(planta), height: arrastoLabel.elemento.offsetHeight }, origemPonto);
      linha.setAttribute("x2", alvo.x); linha.setAttribute("y2", alvo.y);
      atualizarDetalhesConexao(linha, origemPonto, alvo);
    }
  };
  const onLabelsPointerUp = (event) => {
    if(!arrastoLabel || arrastoLabel.pointerId !== event.pointerId) return;
    const { legenda, elemento, moveu } = arrastoLabel;
    arrastoLabel = null;
    elemento.classList.remove("is-arrastando");
    if(moveu){
      legenda.pos = {
        x: Math.max(0, Math.min(1, parseFloat(elemento.style.left) / frame.offsetWidth)),
        y: Math.max(0, Math.min(1, parseFloat(elemento.style.top) / frame.offsetHeight)),
      };
      marcarSujo();
      suprimirProximoClique = true; // um arrasto de verdade ainda dispara um "click" nativo logo depois — sem isso reabriria "trocar ambiente"
      // Adiado pro próximo tick de propósito: recalcularPlanta() reescreve o innerHTML de labelsHost, destruindo o
      // PRÓPRIO elemento que acabou de ser solto — se isso rodasse síncrono aqui dentro, o "click" nativo que o
      // navegador ainda vai disparar por causa deste mesmo gesto (pointerup) não teria mais em cima de quê disparar,
      // e "suprimirProximoClique" nunca seria consumido — ficaria preso em `true` e engoliria o PRÓXIMO clique de
      // verdade da pessoa por engano (achado testando: o clique seguinte simplesmente não abria mais o diálogo).
      setTimeout(() => recalcularPlanta(planta), 0);
    }
  };
  const onLabelsPointerCancel = () => {
    if(!arrastoLabel) return;
    arrastoLabel.elemento.classList.remove("is-arrastando");
    arrastoLabel = null;
    recalcularPlanta(planta);
  };
  const onLabelsClickCapture = (event) => {
    if(suprimirProximoClique){ suprimirProximoClique = false; event.stopPropagation(); event.preventDefault(); }
  };
  labelsHost.addEventListener("pointerdown", onLabelsPointerDown);
  labelsHost.addEventListener("pointermove", onLabelsPointerMove);
  labelsHost.addEventListener("pointerup", onLabelsPointerUp);
  labelsHost.addEventListener("pointercancel", onLabelsPointerCancel);
  labelsHost.addEventListener("click", onLabelsClickCapture, true);

  plantaListenersCleanup = () => {
    window.removeEventListener("resize", onResize);
    window.visualViewport?.removeEventListener("resize", onResize);
    observer.disconnect();
    window.removeEventListener("beforeprint", prepararImpressao);
    window.removeEventListener("afterprint", limparImpressaoPlanta);
    limparImpressaoPlanta();
    cancelAnimationFrame(resizeRaf);
    stage.removeEventListener("click", onStageClick);
    stage.removeEventListener("pointerdown", onStagePointerDown);
    stage.removeEventListener("pointermove", onStagePointerMove);
    stage.removeEventListener("pointerup", onStagePointerUp);
    stage.removeEventListener("pointercancel", onStagePointerUp);
    labelsHost.removeEventListener("pointerdown", onLabelsPointerDown);
    labelsHost.removeEventListener("pointermove", onLabelsPointerMove);
    labelsHost.removeEventListener("pointerup", onLabelsPointerUp);
    labelsHost.removeEventListener("pointercancel", onLabelsPointerCancel);
    labelsHost.removeEventListener("click", onLabelsClickCapture, true);
  };
}

function pintarPlantas(host){
  const planta = plantaAtiva();
  if(!planta){
    limparPlantaListeners(); // saindo do editor de verdade (voltou pra grade) — reseta tudo, inclusive o modo "Ajustar planta"
    host.innerHTML = `<div class="pa-ferramentas"><button type="button" class="cpj-btn cpj-btn-ghost" data-cpj="apresentacao">Apresentação dos ambientes →</button></div>` + plantasGridHtml();
    return;
  }
  host.innerHTML = plantaEditorHtml(planta);
  requestAnimationFrame(() => bindPlantaEditor(planta));
}

// Preparo da imagem da planta: PNG (nunca JPEG) — a planta é um desenho de linhas/texto do AutoCAD, e compressão
// com perdas borraria exatamente o que a equipe de montagem precisa ler. Só limita o lado maior (evita subir um
// arquivo gigante do CAD sem necessidade), mantendo a nitidez.
async function prepararImagemPlanta(file, ladoMax = 3000){
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const c2d = canvas.getContext("2d");
  c2d.fillStyle = "#ffffff"; c2d.fillRect(0, 0, canvas.width, canvas.height);
  c2d.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((saida) => saida ? resolve(saida) : reject(new Error("Não foi possível preparar a imagem.")), "image/png"));
}

async function enviarPlanta(file){
  if(!file || !S.current) return;
  if(!/^image\//.test(file.type)){ ctx.notify({ title: "Arquivo inválido", message: "Envie uma imagem (PNG ou JPEG) exportada da planta.", status: "error" }); return; }
  try{
    const blob = await prepararImagemPlanta(file);
    const empresaId = ctx.getSession().empresa_id;
    const path = `${empresaId}/${S.current.id}/plantas/${crypto.randomUUID()}.png`;
    const { error } = await ctx.supabase.storage.from("projetos").upload(path, blob, { contentType: "image/png", upsert: false });
    if(error) throw error;
    const { data } = ctx.supabase.storage.from("projetos").getPublicUrl(path);
    const planta = normalizarPlanta({ nome: `Planta ${plantasDe().length + 1}`, url: data.publicUrl, path });
    S.current.dados.plantas.push(planta);
    S.activePlanta = planta.id;
    marcarSujo(); pintarNavegacao(); pintarPainel();
  }catch(error){
    ctx.notify({ title: "Não foi possível subir a planta", message: mensagemDe(error), status: "error" });
  }
}

async function trocarImagemPlanta(planta, file){
  if(!file) return;
  if(!/^image\//.test(file.type)){ ctx.notify({ title: "Arquivo inválido", message: "Envie uma imagem (PNG ou JPEG).", status: "error" }); return; }
  try{
    const blob = await prepararImagemPlanta(file);
    const empresaId = ctx.getSession().empresa_id;
    const pathAntigo = planta.path;
    const path = `${empresaId}/${S.current.id}/plantas/${crypto.randomUUID()}.png`;
    const { error } = await ctx.supabase.storage.from("projetos").upload(path, blob, { contentType: "image/png", upsert: false });
    if(error) throw error;
    const { data } = ctx.supabase.storage.from("projetos").getPublicUrl(path);
    planta.url = data.publicUrl; planta.path = path;
    marcarSujo(); pintarPainel();
    if(pathAntigo) ctx.supabase.storage.from("projetos").remove([pathAntigo]).catch(() => {});
  }catch(error){
    ctx.notify({ title: "Não foi possível trocar a imagem", message: mensagemDe(error), status: "error" });
  }
}

async function excluirPlanta(planta){
  const ok = await abrirModal({ titulo: `Excluir “${planta.nome}”?`, sub: "As legendas desta planta somem junto. Os ambientes em si (e os móveis deles) continuam no projeto normalmente.", confirmar: "Excluir planta", perigo: true });
  if(!ok) return;
  S.current.dados.plantas = plantasDe().filter((p) => p.id !== planta.id);
  if(S.activePlanta === planta.id) S.activePlanta = null;
  marcarSujo(); pintarNavegacao(); pintarPainel();
  if(planta.path) ctx.supabase.storage.from("projetos").remove([planta.path]).catch(() => {});
}

// PDF/imagem = impressão do navegador (mesmo padrão já usado no resto do catálogo, sem gerador de PDF próprio) —
// ver @media print em catalogo-projetos.css, que esconde tudo menos a própria planta com as legendas. O `@page`
// (tamanho/orientação de verdade da folha impressa) é injetado aqui, na hora — precisa bater com o formato que já
// aparece na tela (`planta.papel`/o contorno do palco), senão a pessoa via o contorno certo mas o PDF saía com
// outro tamanho de página.
function limparImpressaoPlanta(){
  document.getElementById("cpjPlantaImpressao")?.remove();
  document.getElementById("cpjPlantaPagina")?.remove();
  document.body.classList.remove("cpj-imprimindo-planta");
}

// Congela o layout visível: a impressão recorta exatamente a referência da folha,
// sem recalcular posições dentro do painel ou encolher conteúdos que ultrapassem a borda.
function prepararImpressaoPlanta(planta){
  if(document.getElementById("cpjPlantaImpressao")) return;
  const frame = document.querySelector("[data-cpj-planta-frame]");
  const pagina = frame?.querySelector("[data-cpj-planta-pagina]");
  if(!frame || !pagina) return;
  const transformTela = frame.style.transform;
  frame.style.transform = "none";
  const folha = pagina.getBoundingClientRect(), quadro = frame.getBoundingClientRect();
  if(!folha.width || !folha.height){ frame.style.transform = transformTela; return; }
  const { w, h } = papelDimensoes(planta.papel);
  const copia = frame.cloneNode(true);
  const originais = [frame, ...frame.querySelectorAll("*")];
  const clones = [copia, ...copia.querySelectorAll("*")];
  originais.forEach((original, i) => {
    const clone = clones[i], estilo = getComputedStyle(original);
    for(const nome of estilo) clone.style.setProperty(nome, estilo.getPropertyValue(nome));
    for(const atributo of [...clone.attributes]){
      if(atributo.name === "id" || atributo.name.startsWith("data-")) clone.removeAttribute(atributo.name);
    }
  });
  const palco = frame.querySelector(".cpj-planta-stage").getBoundingClientRect();
  Object.assign(copia.querySelector(".cpj-planta-stage").style, {
    position: "absolute", margin: "0", left: `${palco.left - quadro.left}px`, top: `${palco.top - quadro.top}px`,
    width: `${palco.width}px`, height: `${palco.height}px`, boxSizing: "border-box",
  });
  copia.querySelectorAll(".cpj-planta-pagina, .cpj-planta-points, .cpj-planta-point-x").forEach((el) => el.remove());
  copia.querySelectorAll(".is-fora-da-folha, .cpj-planta-label-render, .cpj-planta-label-vazio").forEach((el) => {
    el.classList.remove("is-fora-da-folha"); el.style.outline = "none";
  });
  Object.assign(copia.style, {
    position: "absolute", margin: "0", left: `${quadro.left - folha.left}px`, top: `${quadro.top - folha.top}px`,
    width: `${quadro.width}px`, height: `${quadro.height}px`, boxSizing: "border-box",
    transformOrigin: `${folha.left - quadro.left}px ${folha.top - quadro.top}px`,
    transform: `scale(${w * PX_POR_MM / folha.width})`,
  });
  const impressao = document.createElement("div");
  impressao.id = "cpjPlantaImpressao";
  impressao.style.width = `${w}mm`;
  impressao.style.height = `${h}mm`;
  impressao.appendChild(copia);
  frame.style.transform = transformTela;
  const paginaStyle = document.createElement("style");
  paginaStyle.id = "cpjPlantaPagina";
  paginaStyle.textContent = estilosImpressaoPlanta(planta);
  document.head.appendChild(paginaStyle);
  document.body.appendChild(impressao);
  document.body.classList.add("cpj-imprimindo-planta");
}

async function baixarPlanta(planta){
  const imgs = [...document.querySelectorAll(".cpj-planta-frame img")];
  await Promise.all(imgs.map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
    img.addEventListener("load", resolve, { once: true }); img.addEventListener("error", resolve, { once: true });
  })));
  recalcularPlanta(planta);
  prepararImpressaoPlanta(planta);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { window.print(); } finally { limparImpressaoPlanta(); }
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Dock (pílula fixa) e botões "＋"
function pintarDock(){
  const dock = $("catalogProjetoDock");
  if(!dock) return;
  const p = S.current;
  if(!S.enabled || !p || S.dockHidden){ dock.classList.add("hidden"); dock.innerHTML = ""; return; }
  const amb = ambienteAtivo();
  const total = totalItens(p);
  dock.classList.remove("hidden");
  dock.innerHTML = `<button type="button" class="cpj-dock-main" data-cpj-dock="abrir" title="Abrir o projeto"><span class="cpj-dock-icon">${ICONE.layers}</span><span class="cpj-dock-text"><small>Projeto</small><strong>${escapeHtml(p.noivos)}</strong></span></button>
    <button type="button" class="cpj-dock-amb" data-cpj-dock="ambiente" aria-expanded="${S.dockPop}" aria-haspopup="listbox"><span class="cpj-dock-text"><small>Ambiente</small><strong>${escapeHtml(amb?.nome || "Escolher…")}</strong></span><b class="cpj-dock-count" aria-label="${total} itens no projeto">${total}</b><i aria-hidden="true">▾</i></button>
    ${S.dockPop ? `<div class="cpj-dock-pop" role="listbox" aria-label="Ambientes do projeto">${ambientesDe(p).map((a) => `<button type="button" role="option" aria-selected="${a.id === S.activeAmb}" class="${a.id === S.activeAmb ? "is-active" : ""}" data-cpj-dock-amb="${escapeAttr(a.id)}"><span>${escapeHtml(a.nome)}</span><b>${a.itens.reduce((s, i) => s + (Number(i.quantidade) || 1), 0)}</b></button>`).join("")}<button type="button" data-cpj-dock="novo-ambiente">＋ Novo ambiente</button><button type="button" data-cpj-dock="trocar">Trocar de projeto</button></div>` : ""}`;
}

export function setProjetoDockVisible(visivel){
  S.dockHidden = !visivel;
  if(!visivel) S.dockPop = false;
  pintarDock();
}

export function projetoAddMarkup(itemId, tipo = "chip"){
  if(!S.enabled) return "";
  if(tipo === "page"){
    return `<span class="cpj-add-page-wrap"><button type="button" class="cpj-add-page" data-projeto-add><span class="cpj-add-plus" aria-hidden="true">＋</span><span class="cpj-add-label">Adicionar ao projeto</span></button><button type="button" class="cpj-add-page-qty" data-projeto-qty title="Digitar a quantidade">Quantidade</button></span>`;
  }
  return `<span class="cpj-add-chip" role="button" tabindex="0" data-projeto-add="${escapeAttr(itemId)}" aria-label="Adicionar ao projeto" title="Adicionar ao projeto"><span class="cpj-add-plus" aria-hidden="true">＋</span><b class="cpj-add-count" role="button" tabindex="0" data-projeto-qty aria-label="Digitar a quantidade" title="Digitar a quantidade">Qtd.</b></span>`;
}

const idDoBotao = (el) => el.dataset.projetoAdd || el.closest(".cpj-add-chip")?.dataset.projetoAdd || el.closest("[data-product-id]")?.dataset.productId || "";

export function atualizarBotoes(raiz = document){
  if(!S.enabled) return;
  const amb = ambienteAtivo();
  raiz.querySelectorAll("[data-projeto-add]").forEach((el) => {
    const qtd = Number(amb?.itens.find((i) => String(i.item_id) === String(idDoBotao(el)))?.quantidade) || 0;
    el.classList.toggle("is-added", qtd > 0);
    const contador = el.querySelector(".cpj-add-count");
    const textoQtd = qtd ? String(qtd) : "Qtd.";
    if(contador && contador.textContent !== textoQtd) contador.textContent = textoQtd;
    if(contador) contador.setAttribute("aria-label", qtd ? `${qtd} no projeto — digitar a quantidade` : "Digitar a quantidade");
    const rotulo = el.querySelector(".cpj-add-label");
    const texto = qtd ? `No projeto · ${qtd} em ${amb.nome}` : "Adicionar ao projeto";
    if(rotulo && rotulo.textContent !== texto) rotulo.textContent = texto;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Eventos do overlay e do dock
async function aoClicarOverlay(event){
  const pagina=event.target.closest('[data-pa-page]');
  if(pagina){ S.presentationAmb=pagina.dataset.paPage || null; pintarPainel(); document.querySelector('[data-cpj-panel]')?.scrollIntoView({block:'start'}); return; }
  const abrir = event.target.closest("[data-cpj-open]");
  const excluir = event.target.closest("[data-cpj-delete]");
  if(excluir){ event.stopPropagation(); fluxoExcluirProjeto(excluir.dataset.cpjDelete, excluir.dataset.noivos); return; }
  const verPedido = event.target.closest("[data-cpj-ver-pedido]");
  if(verPedido){ event.stopPropagation(); fluxoVerPedido(verPedido.dataset.cpjVerPedido); return; }
  const filtro = event.target.closest("[data-cpj-filter]");
  if(filtro){ S.filter = filtro.dataset.cpjFilter; pintarLista(); return; }
  const aba = event.target.closest("[data-cpj-amb]");
  if(aba){ S.workTab = "ambiente"; S.activeAmb = aba.dataset.cpjAmb; gravarAtivo(); pintarNavegacao(); pintarPainel(); pintarDock(); atualizarBotoes(); return; }
  const worktab = event.target.closest("[data-cpj-worktab]");
  if(worktab){ S.workTab = worktab.dataset.cpjWorktab; pintarNavegacao(); pintarPainel(); pintarDock(); atualizarBotoes(); return; }
  const acao = event.target.closest("[data-cpj]");
  if(acao){
    const tipo = acao.dataset.cpj;
    const amb = acao.dataset.cpjTargetAmb ? ambientesDe().find(a => a.id === acao.dataset.cpjTargetAmb) : ambienteAtivo();
    const linha = acao.closest("[data-cpj-item]");
    const itemId = linha?.dataset.cpjItem;
    if(tipo === "apresentacao"){
      await salvarAgora(); S.workTab="apresentacao"; S.presentationAmb=null; pintarNavegacao(); pintarPainel();
    }else if(tipo === "apresentacao-voltar"){
      S.workTab="plantas"; pintarNavegacao(); pintarPainel();
    }else if(tipo === "apresentacao-pdf"){
      acao.disabled=true; acao.textContent='Preparando PDF…';
      try { await salvarAgora(); await imprimirApresentacao(dadosApresentacao(S.current,ctx.findItem)); }
      catch(error){ ctx.notify({title:'Não foi possível gerar o PDF',message:mensagemDe(error),status:'error'}); }
      finally { acao.disabled=false; acao.textContent='Exportar PDF'; }
    }else if(tipo === "novo"){
      const criado = await fluxoCriarProjeto();
      if(criado){ S.view = "work"; pintarTela(); }
    }else if(tipo === "recarregar"){ S.listLoaded = false; pintarLista(); carregarLista().then(pintarLista); }
    else if(tipo === "voltar"){ await salvarAgora(); S.view = "list"; pintarTela(); carregarLista().then(() => { if(S.open && S.view === "list") pintarLista(); }); }
    else if(tipo === "editar-info") fluxoEditarInfo();
    else if(tipo === "foto-remover"){ event.preventDefault?.(); removerFotoCasal(); }
    else if(tipo === "enviar") fluxoEnviarPedido();
    else if(tipo === "novo-ambiente"){
      const nome = await fluxoAmbiente();
      if(nome){ await criarAmbiente(nome); pintarNavegacao(); pintarPainel(); }
    }else if(tipo === "renomear" && amb){
      const nome = await fluxoAmbiente({ titulo: "Renomear ambiente", nomeAtual: amb.nome, confirmar: "Salvar" });
      if(nome){ amb.nome = nome.slice(0, 60); marcarSujo(); pintarNavegacao(); pintarPainel(); pintarDock(); }
    }else if(tipo === "excluir-ambiente" && amb){
      const ok = await abrirModal({ titulo: `Excluir “${amb.nome}”?`, sub: "Os móveis e as renderizações deste ambiente saem do projeto.", confirmar: "Excluir ambiente", perigo: true });
      if(ok){
        S.current.dados.ambientes = ambientesDe().filter((a) => a.id !== amb.id);
        if(S.activeAmb === amb.id) S.activeAmb = ambientesDe()[0]?.id || null;
        gravarAtivo(); marcarSujo(); pintarNavegacao(); pintarPainel(); pintarDock(); atualizarBotoes();
      }
    }else if(tipo === "ir-catalogo") ctx.goCatalog();
    else if(tipo === "ir-estudio") ctx.goStudio();
    else if(tipo === "qtd-mais" && amb) mudarQuantidade(amb.id, itemId, 1);
    else if(tipo === "qtd-menos" && amb) mudarQuantidade(amb.id, itemId, -1);
    else if(tipo === "item-remover" && amb) mudarQuantidade(amb.id, itemId, 0, { definir: 0 });
    else if(tipo === "render-ver"){
      const render = amb?.renders.find((r) => r.id === acao.closest("[data-cpj-render]")?.dataset.cpjRender);
      if(render?.cena?.url) abrirEditorCena(amb, render);
      // Imagem salva antes do editor de cena existir: não tem a cena guardada, só a foto.
      else if(render) abrirModal({ titulo: amb.nome, sub: render.origem, corpo: `<p class="cpj-cena-aviso">Esta imagem foi salva antes da troca de móveis no 3D existir. Para trocar os móveis por aqui, gere a imagem de novo no 3D Livre e salve no projeto.</p><img class="cpj-lightbox" src="${escapeAttr(otimizarFoto(render.url, 1600, 82))}" alt="">`, confirmar: null, cancelar: "Fechar", largo: true });
    }else if(tipo === "render-remover" && amb){
      const id = acao.closest("[data-cpj-render]")?.dataset.cpjRender;
      const render = amb.renders.find((r) => r.id === id);
      if(!render) return;
      amb.renders = amb.renders.filter((r) => r.id !== id);
      marcarSujo(); pintarNavegacao(); pintarPainel(); pintarDock();
      const arquivos = [render.path, render.cena?.path].filter(Boolean);
      if(arquivos.length) ctx.supabase.storage.from("projetos").remove(arquivos).catch(() => {});
    }else if(tipo === "plantas-voltar"){ S.activePlanta = null; pintarPainel(); }
    else if(tipo === "planta-abrir"){ S.activePlanta = acao.dataset.planta; pintarPainel(); }
    else if(tipo === "planta-trocar-imagem") document.querySelector("[data-cpj-planta-trocar-input]")?.click();
    else if(tipo === "planta-baixar"){ const planta = plantaAtiva(); if(planta) baixarPlanta(planta); }
    else if(tipo === "planta-excluir"){ const planta = plantaAtiva(); if(planta) excluirPlanta(planta); }
    else if(tipo === "planta-ajuste-toggle"){ ajustandoPlanta = !ajustandoPlanta; pintarPainel(); }
    else if(tipo === "planta-tamanho-mais"){ const planta = plantaAtiva(); if(planta) redimensionarPlanta(planta, 1); }
    else if(tipo === "planta-tamanho-menos"){ const planta = plantaAtiva(); if(planta) redimensionarPlanta(planta, -1); }
    else if(tipo === "planta-zoom-mais"){ const planta = plantaAtiva(); if(planta) ampliarImagemPlanta(planta, 1); }
    else if(tipo === "planta-zoom-menos"){ const planta = plantaAtiva(); if(planta) ampliarImagemPlanta(planta, -1); }
    else if(tipo === "planta-prints-mais"){ const planta = plantaAtiva(); if(planta) redimensionarPrints(planta, 1); }
    else if(tipo === "planta-prints-menos"){ const planta = plantaAtiva(); if(planta) redimensionarPrints(planta, -1); }
    else if(tipo === "planta-legenda-remover"){
      const planta = plantaAtiva();
      if(planta){
        planta.legendas = planta.legendas.filter((l) => l.id !== acao.dataset.legenda);
        marcarSujo(); pintarNavegacao(); recalcularPlanta(planta);
      }
    }else if(tipo === "planta-legenda-trocar"){
      const planta = plantaAtiva();
      const legenda = planta?.legendas.find((l) => l.id === acao.dataset.legenda);
      if(planta && legenda){
        const novoAmbienteId = await escolherAmbientePlanta(legenda.ambienteId);
        if(novoAmbienteId){ legenda.ambienteId = novoAmbienteId; marcarSujo(); recalcularPlanta(planta); }
      }
    }
    return;
  }
  if(abrir) abrirProjeto(abrir.dataset.cpjOpen);
}

function aoAlterarOverlay(event){
  const foto = event.target.closest("[data-cpj-foto-input]");
  if(foto){
    const arquivo = foto.files?.[0];
    foto.value = "";
    if(arquivo) definirFotoCasal(arquivo);
    return;
  }
  const plantaNova = event.target.closest("[data-cpj-planta-nova-input]");
  if(plantaNova){
    const arquivo = plantaNova.files?.[0];
    plantaNova.value = "";
    if(arquivo) enviarPlanta(arquivo);
    return;
  }
  const plantaTrocar = event.target.closest("[data-cpj-planta-trocar-input]");
  if(plantaTrocar){
    const arquivo = plantaTrocar.files?.[0];
    plantaTrocar.value = "";
    const planta = plantaAtiva();
    if(arquivo && planta) trocarImagemPlanta(planta, arquivo);
    return;
  }
  const plantaMarcacao = event.target.closest("[data-cpj-planta-marcacao]");
  if(plantaMarcacao){
    const planta = plantaAtiva();
    if(planta){ planta.marcacao = plantaMarcacao.value; marcarSujo(); recalcularPlanta(planta); }
    return;
  }
  const plantaNomes = event.target.closest("[data-cpj-planta-nomes]");
  if(plantaNomes){
    const planta = plantaAtiva();
    if(planta){ planta.mostrarNomes = plantaNomes.checked; marcarSujo(); recalcularPlanta(planta); }
    return;
  }
  const plantaPapel = event.target.closest("[data-cpj-planta-papel]");
  if(plantaPapel){
    const planta = plantaAtiva();
    // Muda o formato do palco (aspect-ratio) — precisa repintar o painel inteiro (não só recalcularPlanta) porque
    // `plantaEditorHtml()` é quem escreve o `style="aspect-ratio:…"` no palco; um recálculo sozinho não mudaria
    // isso, só reposicionaria pontos/legendas dentro do mesmo formato de antes.
    if(planta){ planta.papel = normalizarPapelPlanta(plantaPapel.value); marcarSujo(); pintarPainel(); }
    return;
  }
  const amb = ambienteAtivo();
  const entrada = event.target.closest("[data-cpj-qtd-input]");
  if(entrada && amb){
    const itemId = entrada.closest("[data-cpj-item]")?.dataset.cpjItem;
    const valor = Math.max(1, Math.min(999, parseInt(entrada.value, 10) || 1));
    mudarQuantidade(amb.id, itemId, 0, { definir: valor });
    entrada.value = String(valor);
  }
}
function aoDigitarOverlay(event){
  const notas = event.target.closest("[data-cpj-notas]");
  const amb = ambienteAtivo();
  if(notas && amb){ amb.notas = notas.value.slice(0, 1000); marcarSujo(); return; }
  const plantaNome = event.target.closest("[data-cpj-planta-nome]");
  if(plantaNome){
    const planta = plantaAtiva();
    if(planta){ planta.nome = plantaNome.value.slice(0, 60); marcarSujo(); }
  }
}

async function aoClicarDock(event){
  const ambiente = event.target.closest("[data-cpj-dock-amb]");
  if(ambiente){ S.activeAmb = ambiente.dataset.cpjDockAmb; S.dockPop = false; gravarAtivo(); pintarDock(); atualizarBotoes(); return; }
  const acao = event.target.closest("[data-cpj-dock]")?.dataset.cpjDock;
  if(!acao) return;
  if(acao === "abrir"){ S.dockPop = false; pintarDock(); ctx.openProjetos({ view: "work" }); }
  else if(acao === "ambiente"){ S.dockPop = !S.dockPop; pintarDock(); }
  else if(acao === "novo-ambiente"){
    S.dockPop = false; pintarDock();
    const nome = await fluxoAmbiente();
    if(nome) await criarAmbiente(nome);
  }else if(acao === "trocar"){ S.dockPop = false; pintarDock(); ctx.openProjetos({ view: "list" }); }
}

// ---------------------------------------------------------------------------------------------------------------
// API pública
export async function escolherProjetoNaEntrada(){
  if(ctx.isStaff() || document.querySelector(".cpj-entry")) return;
  const dialog = document.createElement("section");
  dialog.className = "cpj-entry";
  dialog.setAttribute("aria-labelledby", "cpjEntryTitle");
  dialog.innerHTML = `<div class="cpj-entry-shell">
    <div class="cpj-entry-heading"><div class="cpj-entry-intro"><h1 id="cpjEntryTitle">Qual história vamos<br><em>criar hoje?</em></h1></div>
    <div class="cpj-entry-shortcuts"><button type="button" class="cpj-entry-row cpj-entry-without" data-entry-without>
      <span class="cpj-entry-portrait cpj-entry-catalog-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="13" height="13" rx="2"/><rect x="28" y="7" width="13" height="13" rx="2"/><rect x="7" y="28" width="13" height="13" rx="2"/><path d="M28 34.5h13m-6-6 6 6-6 6"/></svg></span>
      <span class="cpj-entry-copy"><span class="cpj-entry-without-title">Entrar sem projeto</span></span>
    </button>
    <button type="button" class="cpj-entry-row cpj-entry-without" data-entry-new>
      <span class="cpj-entry-portrait cpj-entry-catalog-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14V9h12l5 5h13v25H9z"/><path d="M17 26h14m-7-7v14"/></svg></span>
      <span class="cpj-entry-copy"><span class="cpj-entry-without-title">Novo projeto</span></span>
    </button></div></div>
    <div class="cpj-entry-options"><div class="cpj-entry-list" aria-live="polite"><p>Carregando seus projetos…</p></div></div>
    <p class="cpj-entry-error" role="alert"></p>
  </div>`;
  $("catalogGrid").before(dialog);
  const list = dialog.querySelector(".cpj-entry-list");
  const errorHost = dialog.querySelector(".cpj-entry-error");
  let busy = false;
  const carregar = async () => {
    list.innerHTML = '<p>Carregando seus projetos…</p>';
    await carregarLista();
    if(S.listError){
      list.innerHTML = '<p>Não foi possível carregar seus projetos. <button type="button" data-entry-retry>Tentar novamente</button></p>';
      return;
    }
    list.innerHTML = S.list.length ? S.list.map((p) => `<button type="button" class="cpj-entry-row" data-entry-project="${escapeAttr(p.id)}" aria-label="${escapeAttr(p.noivos)}">
      <span class="cpj-entry-portrait">${p.foto_casal_url ? `<img src="${escapeAttr(otimizarFoto(p.foto_casal_url, 360))}" alt="" loading="lazy">` : `<span aria-hidden="true">${escapeHtml(String(p.noivos || "").trim().slice(0, 1))}</span>`}</span>
      <span class="cpj-entry-copy"><span class="cpj-entry-meta">${escapeHtml(p.data_evento ? dataLonga(p.data_evento) : "")}${p.local_evento ? ` · ${escapeHtml(p.local_evento)}` : ""}</span></span>
    </button>`).join("") : '<p class="cpj-entry-empty">Nenhum projeto disponível.</p>';
  };
  dialog.addEventListener("error", event => {
    if(event.target.tagName === "IMG") event.target.replaceWith(document.createTextNode("♡"));
  }, true);
    dialog.addEventListener("click", async event => {
      if(busy) return;
      const projectButton = event.target.closest("[data-entry-project]");
      const retry = event.target.closest("[data-entry-retry]");
      const create = event.target.closest("[data-entry-new]");
      const without = event.target.closest("[data-entry-without]");
      if(!projectButton && !retry && !create && !without) return;
      busy = true;
      errorHost.textContent = "";
      dialog.setAttribute("aria-busy", "true");
      dialog.querySelectorAll("button").forEach(button => button.disabled = true);
      try{
        if(retry){ await carregar(); return; }
        await salvarAgora();
        if(S.save === "error" || S.save === "dirty") throw new Error("Salve as alterações do projeto atual antes de trocar.");
        if(without){
          S.current = null; S.activeAmb = null; S.dockPop = false;
          gravarAtivo(); pintarDock(); atualizarBotoes();
        }else if(create){
          if(!await fluxoCriarProjeto()) return;
        }else{
          const project = await carregarProjeto(projectButton.dataset.entryProject);
          if(!dialog.isConnected) return;
          const previous = lerAtivo();
          definirAtual(project, previous?.id === project.id ? previous.amb : null);
        }
        if(!dialog.isConnected) return;
        ctx.goCatalog();
        dialog.remove();
      }catch(error){ errorHost.textContent = mensagemDe(error); }
      finally{
        busy = false;
        dialog.removeAttribute("aria-busy");
        dialog.querySelectorAll("button").forEach(button => button.disabled = false);
      }
    });
    await carregar();
}

export async function openCatalogProjetos({ view = "list" } = {}){
  S.open = true;
  S.dockPop = false;
  S.view = view === "work" && S.current ? "work" : "list";
  pintarTela();
}

export function closeCatalogProjetos(){
  S.open = false;
  limparPlantaListeners();
  salvarAgora();
}

export async function beforeLeaveProjetos(){
  await salvarAgora();
  return S.save !== 'error' && S.save !== 'dirty';
}

export async function backCatalogProjetos(){
  if(!S.open || S.view!=='work') return false;
  if(!(await beforeLeaveProjetos())) return true;
  if(S.workTab==='apresentacao'){
    if(S.presentationAmb) S.presentationAmb=null;
    else S.workTab='plantas';
  }else if(S.workTab==='plantas' && S.activePlanta) S.activePlanta=null;
  else if(S.workTab!=='geral') S.workTab='geral'; // Geral é a aba de entrada: voltar de qualquer outra cai nela, e dela sai pra lista
  else { S.view='list'; pintarTela(); return true; }
  pintarNavegacao(); pintarPainel(); return true;
}

export function initCatalogProjetos(contexto){
  ctx = contexto;
  S.enabled = true;
  const overlay = $("catalogProjetos");
  overlay?.addEventListener("click", aoClicarOverlay);
  overlay?.addEventListener("keydown", (event) => {
    if((event.key === "Enter" || event.key === " ") && event.target.matches?.("[data-cpj-open]")){ event.preventDefault(); aoClicarOverlay({ target: event.target, stopPropagation(){}, preventDefault(){} }); }
  });
  overlay?.addEventListener("change", aoAlterarOverlay);
  overlay?.addEventListener("input", aoDigitarOverlay);
  overlay?.addEventListener('error',event=>{
    if(event.target.tagName!=='IMG' || !event.target.closest('.pa-geral,.pa-apresentacao')) return;
    const vazio=document.createElement('span'); vazio.className='pa-vazio'; vazio.textContent='Imagem indisponível';
    event.target.replaceWith(vazio);
  },true);
  window.addEventListener('beforeunload',event=>{
    if(['dirty','saving','error'].includes(S.save)){ event.preventDefault(); event.returnValue=''; }
  });
  $("catalogProjetoDock")?.addEventListener("click", aoClicarDock);
  document.addEventListener("click", (event) => {
    // composedPath() (e não target.closest): o clique no próprio dock já re-desenhou o HTML dele, então o elemento
    // clicado pode ter saído do documento antes deste listener rodar — e aí "fora do dock" seria um falso positivo.
    if(S.dockPop && !event.composedPath().some((el) => el.id === "catalogProjetoDock")){ S.dockPop = false; pintarDock(); }
  });

  // "＋" dos itens (grade, mosaico, página do item): capturado ANTES do clique do card/seção inteira.
  document.addEventListener("click", (event) => {
    const qtd = event.target.closest("[data-projeto-qty]");
    if(qtd){
      event.preventDefault(); event.stopPropagation();
      const id = idDoBotao(qtd);
      if(id) abrirQtdPop(qtd.closest(".cpj-add-chip") || qtd, id);
      return;
    }
    const botao = event.target.closest("[data-projeto-add]");
    if(!botao) return;
    event.preventDefault(); event.stopPropagation();
    const id = idDoBotao(botao);
    if(id) adicionarItem(id);
  }, true);
  document.addEventListener("keydown", (event) => {
    if((event.key === "Enter" || event.key === " ") && event.target.matches?.("[data-projeto-add],[data-projeto-qty]") && event.target.tagName !== "BUTTON"){
      event.preventDefault(); event.target.click();
    }
  }, true);
  // "Salvar no projeto" dos diálogos de resultado de IA (3D Livre, tecido) — e do "Tirar print" do 3D
  // Livre, que reaproveita o MESMO diálogo/botão com uma imagem só (ver tirarPrintComposicao()).
  document.addEventListener("click", (event) => {
    const botao = event.target.closest("[data-projeto-save-render]");
    if(!botao) return;
    event.preventDefault();
    const img = $(botao.dataset.img);
    salvarRender({ src: img?.currentSrc || img?.src, origem: botao.dataset.origem, botao });
  });
  window.catalogRegisterRenderItems = registrarItensDaRenderizacao;
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden") salvarAgora(); });

  // Os "＋" são desenhados junto com o HTML dos cards; quando o conteúdo do catálogo troca, marca os já adicionados.
  const grade = $("catalogGrid");
  if(grade){
    let agendado = false;
    new MutationObserver(() => {
      if(agendado) return;
      agendado = true;
      requestAnimationFrame(() => { agendado = false; atualizarBotoes(grade); });
    }).observe(grade, { childList: true, subtree: true });
  }

  // Retoma o projeto em que a pessoa estava (segundo plano — nunca atrasa o catálogo).
  const ativo = lerAtivo();
  if(ctx.isStaff() && ativo?.id){
    carregarProjeto(ativo.id).then((project) => definirAtual(project, ativo.amb)).catch(() => { try{ localStorage.removeItem(chaveAtivo()); }catch{} });
  }
}
