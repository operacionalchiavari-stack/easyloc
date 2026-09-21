// Projetos do catálogo (pedido explícito do usuário): o decorador monta, DE DENTRO do catálogo, um projeto pro
// casal — dividido em ambientes com o nome que ele quiser (Cerimônia, Bar, Lounge...), com os móveis escolhidos
// (e quantidades) e as renderizações 3D/IA de cada ambiente — e no fim entrega uma apresentação (página com link +
// senha, que também vira PDF pela impressão do navegador) e pode enviar o pedido à Chiavari.
//
// Módulo self-contido, mesmo padrão de catalogo-biblioteca.mjs/catalogo-lounge.mjs: não importa nada de
// catalogo.mjs — recebe o que precisa em initCatalogProjetos(). Três peças de tela:
//   1. o overlay #catalogProjetos (lista de projetos + espaço de trabalho de UM projeto);
//   2. o "dock" #catalogProjetoDock — pílula fixa no canto inferior esquerdo que mostra em qual projeto/ambiente as
//      próximas ações caem ("Ana & Bruno · Bar") e deixa trocar de ambiente sem sair da navegação;
//   3. o botão "＋" de cada item (projetoAddMarkup) que adiciona o item ao ambiente ativo em um toque.
//
// Dados: RPCs projeto_* (migration 20260920000100_projetos.sql), que já decidem sozinhas quem enxerga o quê — o
// decorador (token do catálogo) só vê os PRÓPRIOS projetos; a equipe (login) vê os da empresa. O projeto inteiro
// (ambientes → itens/renders/notas) vive num jsonb só, salvo por projeto_salvar com autosave (debounce). Nada aqui
// mostra ou envia preço: o catálogo nunca teve valores e a apresentação pública também não.
//
// Só o item_id + quantidade ficam salvos por linha — nome/foto/medidas vêm do catálogo em tela e, na apresentação
// pública, do próprio banco (projeto_publico), então um cadastro corrigido depois já aparece atualizado.

import { initLayouts, pintarLista as pintarListaLayouts, pintarEditor as pintarEditorLayouts, salvarAgora as salvarLayoutAgora } from "./catalogo-layouts.mjs?v=20260922-designer";
import { normalizarLayout } from "./projeto-layout.mjs?v=20260922-designer";

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
  pins: {},           // PINs gerados nesta sessão (o banco só guarda o hash — não dá pra ler de volta)
  dockHidden: true, dockPop: false,
  mapaRender: { projetoId: null, modo: "destaque", capa: "foto" },   // como a apresentação deste projeto posiciona as renderizações (vem do layout dele)
};

// ---------------------------------------------------------------------------------------------------------------
// Utilitários
const ambientesDe = (project = S.current) => project?.dados?.ambientes || [];
const ambienteAtivo = () => ambientesDe().find((amb) => amb.id === S.activeAmb) || null;
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

function normalizar(project){
  const dados = project.dados && Array.isArray(project.dados.ambientes) ? project.dados : { ambientes: [] };
  dados.ambientes = dados.ambientes.map((amb) => ({
    id: amb.id || novoId("a"), nome: amb.nome || "Ambiente",
    itens: Array.isArray(amb.itens) ? amb.itens : [], renders: Array.isArray(amb.renders) ? amb.renders : [], notas: amb.notas || "",
  }));
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

function linkDoProjeto(slug){
  const url = new URL("projeto.html", location.href);
  url.search = ""; url.hash = "";
  url.searchParams.set("p", slug);
  return url.toString();
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
// Renderizações: leva o resultado de IA (Composições / 3D Livre / tecido) pro ambiente do projeto.
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

// Composição (Composições / 3D Livre) que gerou cada renderização: quando a IA devolve a imagem, o módulo de origem
// registra aqui a lista de móveis da cena NAQUELE momento (window.catalogRegisterRenderItems). Fica atrelada à imagem,
// não ao estado atual do 3D — dá pra mexer na composição depois e ainda salvar o resultado antigo com os móveis certos.
const composicoes = [];
function registrarItensDaRenderizacao(src, objetos){
  if(!src || !Array.isArray(objetos)) return;
  const contagem = new Map();
  objetos.forEach((objeto) => {
    if(objeto?.itemId === undefined || objeto?.itemId === null || objeto.itemId === "") return;
    const id = String(objeto.itemId);
    const entrada = contagem.get(id) || { id, nome: objeto.itemName || "", quantidade: 0 };
    entrada.quantidade += 1;
    contagem.set(id, entrada);
  });
  composicoes.unshift({ src, itens: [...contagem.values()] });
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

async function salvarRender({ src, origem, botao }){
  if(!src) return;
  const rotulo = botao?.textContent;
  if(botao){ botao.disabled = true; botao.textContent = "Salvando…"; }
  try{
    const composicao = composicaoDaImagem(src);
    const moveis = composicao?.itens.length ? { lista: composicao.itens, incluir: true } : null;
    if(!(await garantirDestino({ titulo: "Salvar renderização", confirmar: "Salvar aqui", sempre: true, moveis }))) return;
    const project = S.current, amb = ambienteAtivo();
    const blob = await paraJpeg(src);
    const empresaId = ctx.getSession().empresa_id;
    const path = `${empresaId}/${project.id}/renders/${crypto.randomUUID()}.jpg`;
    const { error } = await ctx.supabase.storage.from("projetos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if(error) throw error;
    const { data } = ctx.supabase.storage.from("projetos").getPublicUrl(path);
    amb.renders.push({ id: novoId("r"), url: data.publicUrl, path, origem: origem || "Renderização", criado_em: new Date().toISOString() });
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
// Compartilhar (link + senha de 6 números) e enviar pedido
const pinAleatorio = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");

function fluxoCompartilhar(){
  const project = S.current;
  if(!project) return;
  return abrirModal({
    titulo: "Link e PDF do projeto", sub: "Escolha o layout e gere o link do casal (protegido por senha) ou o PDF.", confirmar: null, cancelar: "Fechar", largo: true,
    corpo: `<div data-share-layout></div><div data-share-body></div>`,
    async onMount({ dialog, erro, fechar }){
      await salvarAgora();
      const host = dialog.querySelector("[data-share-body]");
      // Layout do projeto: vale pro link E pro PDF. Vazio = o layout marcado como padrão (ou o visual original, se não houver nenhum).
      const blocoLayout = dialog.querySelector("[data-share-layout]");
      let layoutsDoDono = [];
      const pintarLayout = () => {
        blocoLayout.innerHTML = `<div class="lay-escolha">
          <div class="lay-escolha-linha">
            <label class="cpj-field"><span>Layout da apresentação</span><select name="layout" data-share-layout-select>
              <option value="">${layoutsDoDono.some((l) => l.padrao) ? "Usar o meu layout padrão" : "Visual original do sistema"}</option>
              ${layoutsDoDono.map((l) => `<option value="${escapeAttr(l.id)}"${String(l.id) === String(project.layout_id) ? " selected" : ""}>${escapeHtml(l.nome)}${l.padrao ? " (padrão)" : ""}</option>`).join("")}
            </select></label>
            <button type="button" class="cpj-btn cpj-btn-link" data-share="layouts">Gerenciar layouts</button>
          </div>
          <div class="cpj-share-actions">
            <button type="button" class="cpj-btn cpj-btn-ghost" data-share="previa">Pré-visualizar</button>
            <button type="button" class="cpj-btn cpj-btn-primary" data-share="pdf">Gerar PDF</button>
          </div>
        </div>`;
      };
      pintarLayout();
      rpc("layout_listar", { p_projeto_id: project.id }).then((lista) => { layoutsDoDono = Array.isArray(lista) ? lista : []; pintarLayout(); }).catch(() => {});
      blocoLayout.addEventListener("change", async (event) => {
        if(!event.target.matches("[data-share-layout-select]")) return;
        erro("");
        try{
          const escolhido = event.target.value || null;
          Object.assign(project, await rpc("projeto_definir_layout", { p_id: project.id, p_layout_id: escolhido }));
          carregarLayoutDoProjeto();
          ctx.notify({ title: "Layout do projeto atualizado", message: "O link e o PDF passam a usar este layout.", status: "done", duration: 2500 });
        }catch(error){
          event.target.value = project.layout_id || "";
          erro(mensagemDe(error));
        }
      });
      blocoLayout.addEventListener("click", (event) => {
        const acao = event.target.closest("[data-share]")?.dataset.share;
        if(acao === "previa") abrirPrevia();
        else if(acao === "pdf") abrirPrevia({ pdf: true });
        else if(acao === "layouts"){ fechar(true); S.view = "layouts"; pintarTela(); }
      });
      const pintar = () => {
        const link = project.compartilhar && project.slug ? linkDoProjeto(project.slug) : "";
        const pin = S.pins[project.id];
        if(!link){
          const novoPin = pin || pinAleatorio();
          host.innerHTML = `<p class="cpj-share-text">A apresentação mostra a capa do evento, cada ambiente com as renderizações e os móveis escolhidos — <strong>sem valores</strong>. Só quem tiver o link e a senha consegue abrir.</p>
            <label class="cpj-field"><span>Senha de acesso (6 números)</span><input name="pin" inputmode="numeric" maxlength="6" value="${escapeAttr(novoPin)}" class="cpj-pin-input" autocomplete="off"></label>
            <button type="button" class="cpj-btn cpj-btn-primary" data-share="ativar">Ativar link</button>`;
          return;
        }
        host.innerHTML = `<label class="cpj-field"><span>Link da apresentação</span><div class="cpj-copy-row"><input readonly value="${escapeAttr(link)}" data-share-link><button type="button" class="cpj-btn cpj-btn-ghost" data-share="copiar-link">Copiar link</button></div></label>
          <div class="cpj-field"><span>Senha</span>${pin
            ? `<div class="cpj-pin-show" data-share-pin>${escapeHtml(pin)}</div><small>Guarde esta senha: por segurança ela não pode ser mostrada de novo depois que você fechar esta janela.</small>`
            : `<small>A senha já foi definida e não pode ser exibida de novo. Se precisar, gere uma nova.</small>`}</div>
          <div class="cpj-share-actions">
            ${pin ? `<button type="button" class="cpj-btn cpj-btn-primary" data-share="copiar-msg">Copiar mensagem pro cliente</button>` : ""}
            <button type="button" class="cpj-btn cpj-btn-ghost" data-share="abrir">Abrir apresentação</button>
            <button type="button" class="cpj-btn cpj-btn-ghost" data-share="nova-senha">Gerar nova senha</button>
            <button type="button" class="cpj-btn cpj-btn-link" data-share="desativar">Desativar link</button>
          </div>`;
      };
      const chamar = async (ativo, pin) => {
        const res = await rpc("projeto_compartilhar", { p_id: project.id, p_ativo: ativo, p_pin: pin ?? null });
        project.compartilhar = res.compartilhar; project.slug = res.slug; project.pin_definido = res.pin_definido;
        if(pin) S.pins[project.id] = pin;
        pintar(); pintarCabecalho();
      };
      host.addEventListener("click", async (event) => {
        const botao = event.target.closest("[data-share]");
        if(!botao) return;
        erro("");
        const acao = botao.dataset.share;
        try{
          if(acao === "ativar"){
            const pin = host.querySelector('[name="pin"]').value.trim();
            if(!/^[0-9]{6}$/.test(pin)) throw new Error("A senha precisa ter exatamente 6 números.");
            await chamar(true, pin);
          }else if(acao === "nova-senha"){
            await chamar(true, pinAleatorio());
          }else if(acao === "desativar"){
            await chamar(false, null);
          }else if(acao === "copiar-link"){
            const ok = await copiar(linkDoProjeto(project.slug));
            ctx.notify({ title: ok ? "Link copiado" : "Não foi possível copiar", message: ok ? "Cole onde quiser enviar." : "Selecione o link e copie manualmente.", status: ok ? "done" : "error", duration: 2500 });
          }else if(acao === "copiar-msg"){
            const texto = `Olá! Preparei o projeto do seu evento (${project.noivos}). Acesse pelo link:\n${linkDoProjeto(project.slug)}\nSenha de acesso: ${S.pins[project.id]}`;
            const ok = await copiar(texto);
            ctx.notify({ title: ok ? "Mensagem copiada" : "Não foi possível copiar", message: ok ? "Link e senha prontos pra colar no WhatsApp." : "Copie manualmente.", status: ok ? "done" : "error", duration: 2500 });
          }else if(acao === "abrir"){
            const pin = S.pins[project.id];
            window.open(linkDoProjeto(project.slug) + (pin ? `#pin=${pin}` : ""), "_blank", "noopener");
          }
        }catch(error){
          erro(mensagemDe(error));
        }
      });
      pintar();
    },
  });
}

// Abre a apresentação numa aba nova em modo pré-visualização (sem compartilhar nada e sem senha): o decorador troca de layout na barra da
// própria aba e gera o PDF. Os dados vêm de projeto_previa (só o dono) e chegam por postMessage — a aba pede quando estiver pronta ("pj-pronto"),
// e a página só aceita mensagem da MESMA origem e da janela que a abriu. window.open PRECISA rodar dentro do clique (antes de qualquer await),
// senão o navegador bloqueia o pop-up.
function abrirPrevia({ pdf = false } = {}){
  const project = S.current;
  if(!project) return;
  const url = new URL("projeto.html", location.href);
  url.search = ""; url.hash = "";
  url.searchParams.set("modo", "previa");
  if(pdf) url.searchParams.set("pdf", "1");
  const janela = window.open(url.toString(), "_blank");
  if(!janela){
    ctx.notify({ title: "O navegador bloqueou a nova aba", message: "Libere os pop-ups deste site e tente de novo.", status: "error" });
    return;
  }
  const dados = (async () => { await salvarAgora(); return rpc("projeto_previa", { p_id: project.id }); })();
  dados.catch(() => {});
  const aoReceber = async (event) => {
    if(event.source !== janela || event.origin !== location.origin || event.data?.tipo !== "pj-pronto") return;
    try{
      janela.postMessage({ tipo: "pj-dados", payload: await dados }, location.origin);
    }catch(error){
      janela.postMessage({ tipo: "pj-erro", mensagem: mensagemDe(error) }, location.origin);
    }
  };
  window.addEventListener("message", aoReceber);
  const vigia = setInterval(() => { if(janela.closed){ clearInterval(vigia); window.removeEventListener("message", aoReceber); } }, 2000);
}

async function fluxoEnviarPedido(){
  const project = S.current;
  if(!project) return;
  await salvarAgora();
  const total = totalItens(project);
  const reenvio = project.status !== "rascunho";
  const resumo = ambientesDe(project).filter((amb) => amb.itens.length).map((amb) => `<li><strong>${escapeHtml(amb.nome)}</strong><span>${amb.itens.reduce((s, i) => s + (Number(i.quantidade) || 1), 0)} ${amb.itens.reduce((s, i) => s + (Number(i.quantidade) || 1), 0) === 1 ? "item" : "itens"}</span></li>`).join("");
  const enviado = await abrirModal({
    titulo: reenvio ? "Reenviar pedido à Chiavari" : "Enviar pedido à Chiavari",
    sub: total ? "A equipe recebe os itens e as quantidades de cada ambiente." : "",
    confirmar: total ? (reenvio ? "Reenviar pedido" : "Enviar pedido") : null,
    corpo: total
      ? `<ul class="cpj-order-summary">${resumo}</ul>
         <p class="cpj-order-total"><strong>${total}</strong> ${total === 1 ? "item" : "itens"} em ${ambientesDe(project).filter((a) => a.itens.length).length} ${ambientesDe(project).filter((a) => a.itens.length).length === 1 ? "ambiente" : "ambientes"}</p>
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
  pintarCabecalho(); pintarBanner();
  ctx.notify({ title: "Pedido enviado à Chiavari", message: `${project.noivos} · ${total} ${total === 1 ? "item" : "itens"}`, status: "done" });
}

async function atualizarStatus(status){
  const project = S.current;
  try{
    Object.assign(project, await rpc("projeto_atualizar_status", { p_id: project.id, p_status: status }));
    pintarCabecalho(); pintarBanner();
    ctx.notify({ title: "Status atualizado", message: STATUS_LABEL[status], status: "done", duration: 2500 });
  }catch(error){
    ctx.notify({ title: "Não foi possível atualizar", message: mensagemDe(error), status: "error" });
  }
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
      for(const nome of ["renders", "casal"]){
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
};

function pintarTela(){
  const root = $("catalogProjetos");
  if(!root || !S.open) return;
  if(S.view === "layouts"){ pintarListaLayouts(root); return; }
  if(S.view === "layout"){ pintarEditorLayouts(root); return; }
  if(S.view === "work" && S.current){
    root.innerHTML = `<div class="cpj-wrap cpj-work">
      <header class="cpj-work-head" data-cpj-head></header>
      <div data-cpj-banner></div>
      <div class="cpj-work-body">
        <nav class="cpj-amb-nav" data-cpj-nav aria-label="Ambientes"></nav>
        <section class="cpj-amb-panel" data-cpj-panel></section>
      </div>
    </div>`;
    pintarCabecalho(); pintarBanner(); pintarNavegacao(); pintarPainel();
    carregarLayoutDoProjeto();
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
      <span class="cpj-status is-${escapeAttr(p.status)}">${escapeHtml(STATUS_LABEL[p.status] || p.status)}</span>
      ${p.compartilhar ? `<span class="cpj-shared">Link ativo</span>` : ""}
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
      <div class="cpj-work-actions"><button type="button" class="cpj-btn cpj-btn-ghost" data-cpj="layouts">Layouts</button><button type="button" class="cpj-btn cpj-btn-primary" data-cpj="novo">＋ Novo projeto</button></div>
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
  host.innerHTML = `<button type="button" class="cpj-back" data-cpj="voltar" aria-label="Voltar para os projetos">← Projetos</button>
    <div class="cpj-work-id">
      <div class="cpj-avatar-wrap">
        <label class="cpj-avatar${fotoCasalDe(p) ? " has-photo" : ""}" title="${fotoCasalDe(p) ? "Trocar a foto dos noivos" : "Adicionar a foto dos noivos"}">
          ${fotoCasalDe(p) ? `<img src="${escapeAttr(otimizarFoto(fotoCasalDe(p), 260))}" alt="Foto dos noivos">` : `<span>${ICONE.camera}<small>Foto dos noivos</small></span>`}
          <input type="file" accept="image/jpeg,image/png,image/webp" data-cpj-foto-input hidden>
        </label>
        ${fotoCasalDe(p) ? `<button type="button" class="cpj-avatar-x" data-cpj="foto-remover" aria-label="Remover a foto dos noivos" title="Remover foto">×</button>` : ""}
      </div>
      <div class="cpj-work-title">
        <h2>${escapeHtml(p.noivos)}</h2>
        <p>${escapeHtml(dataLonga(p.data_evento))} · ${escapeHtml(p.local_evento)} <button type="button" class="cpj-btn cpj-btn-link" data-cpj="editar-info">Editar</button></p>
      </div>
    </div>
    <div class="cpj-work-actions">
      <span class="cpj-save-state" data-cpj-save-state aria-live="polite"></span>
      <button type="button" class="cpj-btn cpj-btn-ghost" data-cpj="compartilhar">${p.compartilhar ? "Link e PDF ✓" : "Link e PDF"}</button>
      <button type="button" class="cpj-btn cpj-btn-primary" data-cpj="enviar">${p.status === "rascunho" ? "Enviar pedido à Chiavari" : "Reenviar pedido"}</button>
    </div>`;
  pintarEstadoSalvo();
}

// Assinatura do que está no projeto vs. no que foi enviado — só pra avisar "você mudou depois de enviar".
const assinatura = (ambientes) => JSON.stringify((ambientes || []).map((amb) => [amb.nome ?? amb.ambiente, (amb.itens || []).map((i) => [String(i.item_id), Number(i.quantidade) || 1])]));

function pintarBanner(){
  const host = document.querySelector("[data-cpj-banner]");
  const p = S.current;
  if(!host || !p) return;
  if(p.status === "rascunho"){ host.innerHTML = ""; return; }
  const abertoAntes = host.querySelector("details")?.open;
  const alterado = p.pedido_snapshot?.ambientes && assinatura(p.pedido_snapshot.ambientes) !== assinatura(ambientesDe(p));
  const staff = ctx.isStaff();
  const snap = (p.pedido_snapshot?.ambientes || []).map((amb) => `<li><strong>${escapeHtml(amb.ambiente)}</strong><ul>${(amb.itens || []).map((i) => `<li>${Number(i.quantidade) || 1}× ${escapeHtml(i.nome || "Item")}${i.referencia ? ` <small>(${escapeHtml(i.referencia)})</small>` : ""}</li>`).join("") || "<li><small>Sem itens</small></li>"}</ul></li>`).join("");
  host.innerHTML = `<div class="cpj-banner is-${escapeAttr(p.status)}">
    <div class="cpj-banner-main">
      <span class="cpj-status is-${escapeAttr(p.status)}">${escapeHtml(STATUS_LABEL[p.status])}</span>
      <span>Pedido enviado em ${escapeHtml(dataHora(p.pedido_enviado_em))}${p.pedido_snapshot?.total_itens ? ` · ${p.pedido_snapshot.total_itens} ${p.pedido_snapshot.total_itens === 1 ? "item" : "itens"}` : ""}</span>
      ${staff ? `<span class="cpj-banner-status">Status: ${["pedido_enviado", "em_analise", "convertido"].map((status) => `<button type="button" class="cpj-chip" aria-pressed="${p.status === status}" data-cpj-status="${status}">${escapeHtml(STATUS_LABEL[status])}</button>`).join("")}</span>` : ""}
    </div>
    ${p.pedido_observacao ? `<p class="cpj-banner-obs">“${escapeHtml(p.pedido_observacao)}”</p>` : ""}
    ${alterado ? `<p class="cpj-banner-warn">O projeto foi alterado depois do envio. Use “Reenviar pedido” para atualizar o que a equipe recebeu.</p>` : ""}
    ${snap ? `<details class="cpj-banner-snap"${abertoAntes ? " open" : ""}><summary>Ver o que foi enviado</summary><ul>${snap}</ul></details>` : ""}
  </div>`;
}

function pintarNavegacao(){
  const host = document.querySelector("[data-cpj-nav]");
  if(!host || !S.current) return;
  pintarBanner(); // toda edição de dados repinta a navegação: o aviso "alterado depois do envio" acompanha
  host.innerHTML = ambientesDe().map((amb) => {
    const qtd = amb.itens.reduce((s, i) => s + (Number(i.quantidade) || 1), 0);
    return `<button type="button" class="cpj-amb-tab${amb.id === S.activeAmb ? " is-active" : ""}" data-cpj-amb="${escapeAttr(amb.id)}"><span>${escapeHtml(amb.nome)}</span><b>${qtd}</b></button>`;
  }).join("") + `<button type="button" class="cpj-amb-tab cpj-amb-new" data-cpj="novo-ambiente">＋ Ambiente</button>`;
}

function cartaoItem(linha){
  const item = ctx.findItem(linha.item_id);
  return `<article class="cpj-item" data-cpj-item="${escapeAttr(linha.item_id)}">
    <img src="${escapeAttr(item ? otimizarFoto(item.photo, 240) : FOTO_VAZIA)}" alt="" loading="lazy" decoding="async">
    <div class="cpj-item-body"><strong>${escapeHtml(item?.name || "Item indisponível no catálogo")}</strong><small>${escapeHtml([item?.catLabel, item?.dims].filter(Boolean).join(" · "))}</small></div>
    <div class="cpj-qty" role="group" aria-label="Quantidade">
      <button type="button" data-cpj="qtd-menos" aria-label="Diminuir quantidade">−</button>
      <input type="number" min="1" max="999" value="${Number(linha.quantidade) || 1}" data-cpj-qtd-input aria-label="Quantidade">
      <button type="button" data-cpj="qtd-mais" aria-label="Aumentar quantidade">＋</button>
    </div>
    <button type="button" class="cpj-icon-btn" data-cpj="item-remover" aria-label="Remover do ambiente" title="Remover">×</button>
  </article>`;
}

// Onde as renderizações ficam na apresentação (pedido: "mostrar onde vai ficar as futuras fotos renderizadas, pra pessoa saber onde ficará
// posicionado"). As imagens já salvas aparecem NAS POSIÇÕES da apresentação e as próximas viram espaços tracejados numerados, com a mesma
// disposição do layout do projeto: em "destaque" a 1ª ocupa a largura toda (16:9) e as demais ficam em 2 colunas (4:3); em "grade" são todas
// 4:3, duas por linha. Com menos de 3 imagens a apresentação se ajusta sozinha (1 = larga, 2 = lado a lado) — o texto avisa disso.
// A 1ª renderização do PROJETO (a do primeiro ambiente que tiver alguma) também vira a foto da capa quando o estilo de capa usa foto.
function rendersMapaHtml(amb){
  const modo = S.mapaRender.modo === "grade" ? "grade" : "destaque";
  const minimo = modo === "grade" ? 4 : 3;
  const reais = amb.renders;
  const vazios = reais.length < minimo ? minimo - reais.length : 1;   // sempre sobra pelo menos o espaço da PRÓXIMA
  const ambientes = ambientesDe();
  const ambCapa = ambientes.find((a) => a.renders.some((r) => r.url)) || ambientes[0];
  const naCapa = S.mapaRender.capa !== "limpa" && ambCapa?.id === amb.id;
  const nota = (n) => [n === 1 && modo === "destaque" ? "Destaque · tamanho grande" : "", n === 1 && naCapa ? "Também é a foto da capa" : ""].filter(Boolean).join(" · ");
  const figuras = reais.map((r, i) => `<figure class="cpj-render" data-cpj-render="${escapeAttr(r.id)}"><span class="cpj-slot-num">${i + 1}</span><img src="${escapeAttr(otimizarFoto(r.url, i === 0 && modo === "destaque" ? 960 : 640))}" alt="Renderização de ${escapeAttr(amb.nome)}" loading="lazy" decoding="async" data-cpj="render-ver" tabindex="0" role="button"><figcaption>${escapeHtml(r.origem || "Renderização")}${nota(i + 1) ? ` · ${escapeHtml(nota(i + 1))}` : ""}</figcaption><button type="button" class="cpj-icon-btn" data-cpj="render-remover" aria-label="Remover renderização" title="Remover">×</button></figure>`).join("");
  const espacos = Array.from({ length: vazios }, (_, k) => {
    const n = reais.length + k + 1;
    return `<div class="cpj-render-slot" role="img" aria-label="Espaço reservado para a renderização ${n}"><span class="cpj-slot-num">${n}</span>${ICONE.camera}<strong>Renderização ${n}</strong><span>${escapeHtml(nota(n) || "Aparece aqui na apresentação")}</span></div>`;
  }).join("");
  const dica = modo === "grade"
    ? "Assim as renderizações aparecem na apresentação: em grade, duas por linha."
    : "Assim as renderizações aparecem na apresentação: a primeira em destaque e as demais lado a lado.";
  return `<div class="cpj-renders cpj-renders-map" data-modo="${modo}">${figuras}${espacos}</div>
    <p class="cpj-map-hint">${dica} Os espaços tracejados são das próximas — gere uma imagem em Composições ou no 3D Livre e toque em “Salvar no projeto”. Com poucas imagens a apresentação se ajusta ao espaço.</p>`;
}
function atualizarMapaRenders(){
  const host = document.querySelector("[data-cpj-renders]");
  const amb = ambienteAtivo();
  if(host && amb) host.innerHTML = rendersMapaHtml(amb);
}
// Lê do banco qual layout vale pro projeto aberto (o escolhido, senão o padrão do dono, senão o visual original) — só o que o mapa precisa.
async function carregarLayoutDoProjeto(){
  const project = S.current;
  if(!project) return;
  const id = project.id;
  try{
    const lista = await rpc("layout_listar", { p_projeto_id: id });
    if(S.current?.id !== id) return;
    const layouts = Array.isArray(lista) ? lista : [];
    const escolhido = layouts.find((l) => String(l.id) === String(project.layout_id)) || layouts.find((l) => l.padrao) || null;
    const layout = normalizarLayout(escolhido?.config);
    const novo = { projetoId: id, modo: layout.ambientes.renders, capa: layout.capa.estilo };
    const mudou = novo.projetoId !== S.mapaRender.projetoId || novo.modo !== S.mapaRender.modo || novo.capa !== S.mapaRender.capa;
    S.mapaRender = novo;
    if(mudou && S.open && S.view === "work") atualizarMapaRenders();
  }catch{}   // sem layout carregado o mapa usa o visual original (destaque): nada quebra
}

function pintarPainel(){
  const host = document.querySelector("[data-cpj-panel]");
  const amb = ambienteAtivo();
  if(!host || !S.current) return;
  if(!amb){
    host.innerHTML = `<div class="cpj-empty cpj-empty-big">${ICONE.layers}<strong>Crie o primeiro ambiente</strong><span>Cerimônia, mesa de convidados, bar, lounge… escolha o nome que quiser e adicione os móveis dentro dele.</span><button type="button" class="cpj-btn cpj-btn-primary" data-cpj="novo-ambiente">＋ Criar ambiente</button></div>`;
    return;
  }
  const qtd = amb.itens.reduce((s, i) => s + (Number(i.quantidade) || 1), 0);
  host.innerHTML = `<div class="cpj-amb-head">
      <div><h3>${escapeHtml(amb.nome)}</h3><p>${qtd} ${qtd === 1 ? "item" : "itens"} · ${amb.renders.length} ${amb.renders.length === 1 ? "renderização" : "renderizações"} · <em>ambiente ativo: os móveis que você adicionar no catálogo caem aqui</em></p></div>
      <div class="cpj-amb-actions">
        <button type="button" class="cpj-btn cpj-btn-ghost" data-cpj="renomear">Renomear</button>
        <button type="button" class="cpj-btn cpj-btn-ghost cpj-btn-danger-text" data-cpj="excluir-ambiente">Excluir ambiente</button>
      </div>
    </div>
    <section class="cpj-block">
      <div class="cpj-block-head"><h4>Móveis</h4><button type="button" class="cpj-btn cpj-btn-primary" data-cpj="ir-catalogo">＋ Adicionar do catálogo</button></div>
      ${amb.itens.length ? `<div class="cpj-items">${amb.itens.map(cartaoItem).join("")}</div>` : `<p class="cpj-empty">Nenhum móvel neste ambiente ainda. Abra o catálogo e toque em ＋ nos itens que quiser.</p>`}
    </section>
    <section class="cpj-block">
      <div class="cpj-block-head"><h4>Renderizações</h4><span class="cpj-block-actions"><button type="button" class="cpj-btn cpj-btn-ghost" data-cpj="ir-lounge">Composições</button><button type="button" class="cpj-btn cpj-btn-ghost" data-cpj="ir-estudio">3D Livre</button></span></div>
      <div data-cpj-renders>${rendersMapaHtml(amb)}</div>
    </section>
    <section class="cpj-block">
      <div class="cpj-block-head"><h4>Observações do ambiente</h4></div>
      <textarea class="cpj-notes" data-cpj-notas rows="3" maxlength="1000" placeholder="Aparece na apresentação, abaixo do ambiente. Ex.: clima, cores, detalhes de montagem…">${escapeHtml(amb.notas)}</textarea>
    </section>`;
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
    return `<button type="button" class="cpj-add-page" data-projeto-add><span class="cpj-add-plus" aria-hidden="true">＋</span><span class="cpj-add-label">Adicionar ao projeto</span></button>`;
  }
  return `<span class="cpj-add-chip" role="button" tabindex="0" data-projeto-add="${escapeAttr(itemId)}" aria-label="Adicionar ao projeto" title="Adicionar ao projeto"><span class="cpj-add-plus" aria-hidden="true">＋</span><b class="cpj-add-count"></b></span>`;
}

const idDoBotao = (el) => el.dataset.projetoAdd || el.closest("[data-product-id]")?.dataset.productId || "";

export function atualizarBotoes(raiz = document){
  if(!S.enabled) return;
  const amb = ambienteAtivo();
  raiz.querySelectorAll("[data-projeto-add]").forEach((el) => {
    const qtd = Number(amb?.itens.find((i) => String(i.item_id) === String(idDoBotao(el)))?.quantidade) || 0;
    el.classList.toggle("is-added", qtd > 0);
    const contador = el.querySelector(".cpj-add-count");
    if(contador && contador.textContent !== (qtd ? String(qtd) : "")) contador.textContent = qtd ? String(qtd) : "";
    const rotulo = el.querySelector(".cpj-add-label");
    const texto = qtd ? `No projeto · ${qtd} em ${amb.nome}` : "Adicionar ao projeto";
    if(rotulo && rotulo.textContent !== texto) rotulo.textContent = texto;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Eventos do overlay e do dock
async function aoClicarOverlay(event){
  const abrir = event.target.closest("[data-cpj-open]");
  const excluir = event.target.closest("[data-cpj-delete]");
  if(excluir){ event.stopPropagation(); fluxoExcluirProjeto(excluir.dataset.cpjDelete, excluir.dataset.noivos); return; }
  const filtro = event.target.closest("[data-cpj-filter]");
  if(filtro){ S.filter = filtro.dataset.cpjFilter; pintarLista(); return; }
  const status = event.target.closest("[data-cpj-status]");
  if(status){ atualizarStatus(status.dataset.cpjStatus); return; }
  const aba = event.target.closest("[data-cpj-amb]");
  if(aba){ S.activeAmb = aba.dataset.cpjAmb; gravarAtivo(); pintarNavegacao(); pintarPainel(); pintarDock(); atualizarBotoes(); return; }
  const acao = event.target.closest("[data-cpj]");
  if(acao){
    const tipo = acao.dataset.cpj;
    const amb = ambienteAtivo();
    const linha = acao.closest("[data-cpj-item]");
    const itemId = linha?.dataset.cpjItem;
    if(tipo === "novo"){
      const criado = await fluxoCriarProjeto();
      if(criado){ S.view = "work"; pintarTela(); }
    }else if(tipo === "recarregar"){ S.listLoaded = false; pintarLista(); carregarLista().then(pintarLista); }
    else if(tipo === "voltar"){ await salvarAgora(); S.view = "list"; pintarTela(); carregarLista().then(() => { if(S.open && S.view === "list") pintarLista(); }); }
    else if(tipo === "editar-info") fluxoEditarInfo();
    else if(tipo === "layouts"){ S.view = "layouts"; pintarTela(); }
    else if(tipo === "foto-remover"){ event.preventDefault?.(); removerFotoCasal(); }
    else if(tipo === "compartilhar") fluxoCompartilhar();
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
        S.activeAmb = ambientesDe()[0]?.id || null;
        gravarAtivo(); marcarSujo(); pintarNavegacao(); pintarPainel(); pintarDock(); atualizarBotoes();
      }
    }else if(tipo === "ir-catalogo") ctx.goCatalog();
    else if(tipo === "ir-lounge") ctx.goLounge();
    else if(tipo === "ir-estudio") ctx.goStudio();
    else if(tipo === "qtd-mais" && amb) mudarQuantidade(amb.id, itemId, 1);
    else if(tipo === "qtd-menos" && amb) mudarQuantidade(amb.id, itemId, -1);
    else if(tipo === "item-remover" && amb) mudarQuantidade(amb.id, itemId, 0, { definir: 0 });
    else if(tipo === "render-ver"){
      const render = amb?.renders.find((r) => r.id === acao.closest("[data-cpj-render]")?.dataset.cpjRender);
      if(render) abrirModal({ titulo: amb.nome, sub: render.origem, corpo: `<img class="cpj-lightbox" src="${escapeAttr(otimizarFoto(render.url, 1600, 82))}" alt="">`, confirmar: null, cancelar: "Fechar", largo: true });
    }else if(tipo === "render-remover" && amb){
      const id = acao.closest("[data-cpj-render]")?.dataset.cpjRender;
      const render = amb.renders.find((r) => r.id === id);
      if(!render) return;
      amb.renders = amb.renders.filter((r) => r.id !== id);
      marcarSujo(); pintarNavegacao(); pintarPainel(); pintarDock();
      if(render.path) ctx.supabase.storage.from("projetos").remove([render.path]).catch(() => {});
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
  if(notas && amb){ amb.notas = notas.value.slice(0, 1000); marcarSujo(); }
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
export async function openCatalogProjetos({ view = "list" } = {}){
  S.open = true;
  S.dockPop = false;
  S.view = view === "work" && S.current ? "work" : view === "layouts" ? "layouts" : "list";
  pintarTela();
}

export function closeCatalogProjetos(){
  S.open = false;
  salvarAgora();
  salvarLayoutAgora();
}

export function initCatalogProjetos(contexto){
  ctx = contexto;
  S.enabled = true;
  initLayouts({
    gerarDesign: async (body) => {
      const session = ctx.getSession?.();
      if(!session?.empresa_id) return Promise.resolve({ error: new Error('Sua sessão expirou. Abra o catálogo novamente.') });
      const invoke = window.CatalogCredits?.invoke || ((name, options) => ctx.supabase.functions.invoke(name, options));
      const result = await invoke('studio-ai-engine', { body: { ...body, action: 'design_presentation', empresa_id: session.empresa_id, catalog_token: session.token || undefined } });
      if(result.error?.context?.json) {
        try { result.data = await result.error.context.json(); } catch {}
      }
      return result;
    },
    rpc, abrirModal, mensagemDe, escapeHtml, escapeAttr, notify: (...args) => ctx.notify(...args),
    decorador: () => ctx.getDecorator?.() || null, empresa: () => ctx.getCompany?.() || null, itens: () => ctx.listItems?.() || [],
    projetoAtual: () => S.current, garantirSalvo: salvarAgora,
    setView: (view) => { S.view = view; pintarTela(); },
  });
  const overlay = $("catalogProjetos");
  overlay?.addEventListener("click", aoClicarOverlay);
  overlay?.addEventListener("keydown", (event) => {
    if((event.key === "Enter" || event.key === " ") && event.target.matches?.("[data-cpj-open]")){ event.preventDefault(); aoClicarOverlay({ target: event.target, stopPropagation(){}, preventDefault(){} }); }
  });
  overlay?.addEventListener("change", aoAlterarOverlay);
  overlay?.addEventListener("input", aoDigitarOverlay);
  $("catalogProjetoDock")?.addEventListener("click", aoClicarDock);
  document.addEventListener("click", (event) => {
    // composedPath() (e não target.closest): o clique no próprio dock já re-desenhou o HTML dele, então o elemento
    // clicado pode ter saído do documento antes deste listener rodar — e aí "fora do dock" seria um falso positivo.
    if(S.dockPop && !event.composedPath().some((el) => el.id === "catalogProjetoDock")){ S.dockPop = false; pintarDock(); }
  });

  // "＋" dos itens (grade, mosaico, página do item): capturado ANTES do clique do card/seção inteira.
  document.addEventListener("click", (event) => {
    const botao = event.target.closest("[data-projeto-add]");
    if(!botao) return;
    event.preventDefault(); event.stopPropagation();
    const id = idDoBotao(botao);
    if(id) adicionarItem(id);
  }, true);
  document.addEventListener("keydown", (event) => {
    if((event.key === "Enter" || event.key === " ") && event.target.matches?.("[data-projeto-add]") && event.target.tagName !== "BUTTON"){
      event.preventDefault(); event.target.click();
    }
  }, true);
  // "Salvar no projeto" dos diálogos de resultado de IA (Composições, 3D Livre, tecido).
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
  if(ativo?.id){
    carregarProjeto(ativo.id).then((project) => definirAtual(project, ativo.amb)).catch(() => { try{ localStorage.removeItem(chaveAtivo()); }catch{} });
  }
}
