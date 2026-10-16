// Assistente comercial do catálogo (out/2026) — a conversa. O "cérebro" é a Edge Function `catalogo-assistente`
// (conversa, ferramentas, perfil do decorador); aqui fica só a tela e a execução das AÇÕES que ela devolve:
//   quantidade     → põe/tira item do projeto (window.catalogAssistenteProjeto, mesmo caminho do "＋")
//   usar_projeto   → abre o projeto que ela acabou de criar
//   enviar_pedido  → abre a revisão "Enviar pedido" de sempre (a pessoa confirma)
//   renderizar     → monta o FORMATO cadastrado com os móveis escolhidos no motor do 3D Livre (palco escondido) e gera a
//                    mesma fotografia de estúdio do "Renderizar com IA"; a imagem volta pra conversa.
// Self-contido: não importa catalogo.mjs nem o contrário (recebe tudo por initCatalogAssistente).

let ctx = null;
const S = { aberto: false, carregado: false, enviando: false, nome: "Helena", mensagens: [], fila: Promise.resolve(), naoLidas: 0 };
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function texto(v){
  return esc(v).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>").replace(/\n/g, "<br>");
}
const SEM_FOTO = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#f4f1ec"/><path d="M24 54l12-14 9 10 6-7 9 11z" fill="#d6cdbf"/><circle cx="52" cy="30" r="5" fill="#d6cdbf"/></svg>');
function miniatura(url, w = 220){
  if(!url) return SEM_FOTO;
  return /\/storage\/v1\/object\/public\//.test(url) ? url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") + `${url.includes("?") ? "&" : "?"}width=${w}&quality=74&resize=contain` : url;
}

async function chamar(action, extra = {}){
  const sessao = ctx.getSession() || {};
  const { data, error } = await ctx.supabase.functions.invoke("catalogo-assistente", {
    body: { action, empresa_id: sessao.empresa_id, catalog_token: sessao.token || undefined, ...extra },
  });
  if(error){
    let detalhe = "";
    try{ const corpo = await error.context?.json(); detalhe = corpo?.erro || ""; }catch{}
    throw new Error(detalhe || "Não consegui falar com a assistente agora. Tente de novo em instantes.");
  }
  if(data?.erro) throw new Error(data.erro);
  return data;
}

// ---------------------------------------------------------------------------------------------------------------
// Tela
function montar(){
  const botao = document.createElement("button");
  botao.type = "button"; botao.id = "catalogAssistenteBotao"; botao.className = "cas-launcher";
  botao.setAttribute("aria-controls", "catalogAssistente"); botao.setAttribute("aria-expanded", "false");
  botao.innerHTML = `<span class="cas-avatar" aria-hidden="true">${esc(S.nome[0])}</span><span class="cas-launcher-text"><b>Fale com a ${esc(S.nome)}</b><small>Consultora comercial</small></span><span class="cas-badge" data-cas-badge hidden></span>`;
  const painel = document.createElement("section");
  painel.id = "catalogAssistente"; painel.className = "cas-panel"; painel.hidden = true;
  painel.setAttribute("role", "dialog"); painel.setAttribute("aria-label", "Conversa com a consultora comercial");
  painel.innerHTML = `
    <header class="cas-head">
      <button type="button" class="cas-icon cas-voltar" data-cas-fechar title="Voltar ao catálogo" aria-label="Minimizar a conversa e voltar ao catálogo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
      <span class="cas-avatar is-lg" aria-hidden="true">${esc(S.nome[0])}</span>
      <div class="cas-head-copy"><strong data-cas-nome>${esc(S.nome)}</strong><small><i class="cas-dot" aria-hidden="true"></i><span data-cas-status>Consultora comercial · online</span></small></div>
      <button type="button" class="cas-head-btn" data-cas-limpar title="Começar uma nova conversa"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg><span>Nova conversa</span></button>
      <button type="button" class="cas-head-btn" data-cas-fechar title="Minimizar e voltar ao catálogo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg><span>Minimizar</span></button>
    </header>
    <div class="cas-corpo">
      <div class="cas-conversa">
        <div class="cas-msgs" data-cas-msgs aria-live="polite"><div class="cas-coluna" data-cas-coluna></div></div>
        <form class="cas-form" data-cas-form>
          <div class="cas-form-in">
            <textarea rows="1" maxlength="2000" placeholder="Escreva ou mande um áudio…" aria-label="Mensagem" data-cas-input></textarea>
            <div class="cas-gravando" data-cas-gravando hidden>
              <button type="button" class="cas-grav-cancelar" data-cas-cancelar-audio aria-label="Descartar o áudio" title="Descartar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg></button>
              <i class="cas-grav-ponto" aria-hidden="true"></i><span class="cas-grav-tempo" data-cas-tempo>0:00</span>
              <span class="cas-grav-ondas" data-cas-ondas aria-hidden="true"></span>
            </div>
            <button type="button" class="cas-send cas-mic" data-cas-mic aria-label="Gravar áudio" title="Gravar áudio"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
            <button type="submit" class="cas-send cas-enviar" aria-label="Enviar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2-7z"/></svg></button>
          </div>
          <small class="cas-form-dica" data-cas-dica>Enter envia · Shift+Enter quebra a linha · o microfone grava um áudio</small>
        </form>
      </div>
      <aside class="cas-lado" data-cas-lado aria-label="Seu pedido"></aside>
    </div>`;
  document.body.append(botao, painel);
  document.body.classList.add("tem-assistente");

  botao.addEventListener("click", () => alternar(true));
  painel.querySelectorAll("[data-cas-fechar]").forEach((b) => b.addEventListener("click", () => alternar(false)));
  painel.querySelector("[data-cas-limpar]").addEventListener("click", limpar);
  const input = painel.querySelector("[data-cas-input]");
  const ajustar = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; painel.querySelector("[data-cas-form]").classList.toggle("tem-texto", Boolean(input.value.trim())); };
  const temMicrofone = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  if(!temMicrofone) painel.querySelector("[data-cas-form]").classList.add("sem-mic");
  painel.querySelector("[data-cas-mic]").addEventListener("click", () => (gravacao ? pararGravacao(true) : iniciarGravacao()));
  painel.querySelector("[data-cas-cancelar-audio]").addEventListener("click", () => pararGravacao(false));
  input.addEventListener("input", ajustar);
  input.addEventListener("keydown", (event) => {
    if(event.key === "Enter" && !event.shiftKey){ event.preventDefault(); painel.querySelector("[data-cas-form]").requestSubmit(); }
  });
  painel.querySelector("[data-cas-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    if(gravacao){ pararGravacao(true); return; }
    const valor = input.value.trim();
    if(!valor || S.enviando) return;
    input.value = ""; ajustar();
    enviar(valor);
  });
  painel.addEventListener("click", aoClicar);
  painel.addEventListener("keydown", (event) => { if(event.key === "Escape"){ event.stopPropagation(); if(gravacao) pararGravacao(false); else alternar(false); } });
}

async function alternar(abrir){
  const painel = $("catalogAssistente"), botao = $("catalogAssistenteBotao");
  S.aberto = abrir;
  painel.hidden = !abrir;
  botao.setAttribute("aria-expanded", String(abrir));
  document.body.classList.toggle("assistente-aberta", abrir);
  document.documentElement.classList.toggle("cas-trava-rolagem", abrir);
  if(!abrir){ if(gravacao) pararGravacao(false); botao.focus(); return; }
  S.naoLidas = 0; pintarBadge();
  painel.querySelector("[data-cas-input]").focus();
  if(!S.carregado) await carregarHistorico();
  rolarFim();
}

async function carregarHistorico(){
  const lista = coluna();
  lista.innerHTML = `<div class="cas-carregando">Abrindo a conversa…</div>`;
  try{
    const data = await chamar("historico");
    S.nome = data?.nome || S.nome;
    S.cliente = data?.cliente || "";
    S.mensagens = Array.isArray(data?.mensagens) ? data.mensagens : [];
    S.carregado = true;
    atualizarNome();
  }catch(error){
    lista.innerHTML = `<div class="cas-erro">${esc(error.message)} <button type="button" data-cas-recarregar>Tentar de novo</button></div>`;
    return;
  }
  pintar();
}

function atualizarNome(){
  document.querySelectorAll("[data-cas-nome]").forEach((el) => { el.textContent = S.nome; });
  const b = $("catalogAssistenteBotao");
  if(b) b.querySelector(".cas-launcher-text b").textContent = `Fale com a ${S.nome}`;
  document.querySelectorAll(".cas-avatar").forEach((el) => { el.textContent = S.nome[0]; });
}

const painelMsgs = () => $("catalogAssistente").querySelector("[data-cas-msgs]");
const coluna = () => $("catalogAssistente").querySelector("[data-cas-coluna]");
function rolarFim(){ const l = painelMsgs(); if(l) l.scrollTop = l.scrollHeight; }
function pintarBadge(){
  const b = document.querySelector("[data-cas-badge]");
  if(!b) return;
  b.hidden = !S.naoLidas; b.textContent = S.naoLidas > 9 ? "9+" : String(S.naoLidas);
}
// Coluna da direita (telas largas): o pedido em andamento, pra ver o que já foi montado sem sair da conversa.
function pintarLado(){
  const lado = $("catalogAssistente")?.querySelector("[data-cas-lado]");
  if(!lado) return;
  const p = window.catalogAssistenteProjeto?.retrato();
  if(!p){
    lado.innerHTML = `<div class="cas-lado-vazio"><p class="cas-lado-kicker">Seu pedido</p><strong>Nenhum projeto aberto</strong><p>Conte pra ${esc(S.nome)} sobre o evento (noivos, data e local) que ela cria o projeto e vai montando o pedido com você.</p></div>`;
    return;
  }
  const data = p.data_evento ? new Date(p.data_evento + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) : "";
  const soma = (a) => a.itens.reduce((t, i) => t + i.quantidade, 0);
  const total = p.ambientes.reduce((t, a) => t + soma(a), 0);
  const linha = (i) => { const it = ctx.findItem?.(i.item_id); return `<li><img src="${esc(miniatura(it?.photo || "", 120))}" alt="" loading="lazy"><span>${esc(it?.name || "Item")}</span><b>${i.quantidade}×</b></li>`; };
  lado.innerHTML = `<p class="cas-lado-kicker">Seu pedido</p><h3>${esc(p.noivos)}</h3><p class="cas-lado-sub">${esc([data, p.local_evento].filter(Boolean).join(" · "))}</p>
    <div class="cas-lado-ambs">${p.ambientes.map((a) => `<section><h4>${esc(a.nome)}<b>${soma(a)}</b></h4>${a.itens.length ? `<ul>${a.itens.map(linha).join("")}</ul>` : `<p class="cas-lado-nada">Ainda sem peças</p>`}</section>`).join("") || `<p class="cas-lado-nada">Sem ambientes ainda</p>`}</div>
    <p class="cas-lado-total">${total} ${total === 1 ? "peça" : "peças"} no total</p>
    ${ctx.modoPedido || !total ? "" : `<button type="button" class="cas-lado-enviar" data-cas-enviar>${p.status && p.status !== "rascunho" ? "Reenviar pedido" : "Revisar e enviar pedido"}</button>`}`;
}

function boasVindas(){
  const primeiro = String(S.cliente || "").trim().split(/\s+/)[0];
  const ola = primeiro ? `Oi, ${esc(primeiro)}! ` : "Oi! ";
  return `<div class="cas-boasvindas"><span class="cas-avatar is-xl" aria-hidden="true">${esc(S.nome[0])}</span><h2>${ola}Eu sou a ${esc(S.nome)}.</h2><p>Sou do comercial. Me conta do seu evento que eu te ajudo a escolher as peças, monto as composições em foto e deixo seu pedido prontinho.</p></div>
    <div class="cas-sugestoes">${["Quero montar um lounge", "Tenho um casamento e queria ideias", "Me manda uma foto de uma composição", "O que vocês têm em tons claros?"].map((s) => `<button type="button" data-cas-sugestao>${esc(s)}</button>`).join("")}</div>`;
}

function pintar(){
  pintarLado();
  // Enquanto ela transcreve ou responde, o microfone fica visivelmente desativado (não ignora o clique em silêncio).
  const ocupado = Boolean(S.enviando || S.transcrevendo);
  const mic = $("catalogAssistente")?.querySelector("[data-cas-mic]");
  if(mic){ mic.disabled = ocupado; mic.title = ocupado ? "Aguarde a resposta para gravar outro áudio" : "Gravar áudio"; }
  const lista = coluna();
  lista.innerHTML = (S.mensagens.length || S.transcrevendo ? "" : boasVindas()) + S.mensagens.map(mensagemHtml).join("")
    + (S.transcrevendo ? `<div class="cas-msg is-eu"><div class="cas-bubble cas-transcrevendo"><span class="cas-audio-tag">Áudio</span>Entendendo seu áudio…</div></div>` : "")
    + (S.enviando ? digitandoHtml() : "") + pendentesHtml();
  rolarFim();
}
const digitandoHtml = () => `<div class="cas-msg is-bot"><div class="cas-bubble cas-digitando" aria-label="${esc(S.nome)} está digitando"><i></i><i></i><i></i></div></div>`;
function pendentesHtml(){
  return [...(S.renderizando || [])].map((r) => `<div class="cas-msg is-bot"><div class="cas-render-wait"><span class="cas-shimmer" aria-hidden="true"></span><p><strong>Montando a composição</strong><small>${esc(r.itens.join(" · "))}<br>A foto fica pronta em 1 a 2 minutos.</small></p></div></div>`).join("");
}

function mensagemHtml(m){
  const bot = m.papel !== "user";
  const anexos = (m.anexos || []).map((a) => {
    if(a.tipo === "itens") return `<div class="cas-itens">${a.itens.map(itemHtml).join("")}</div>`;
    if(a.tipo === "imagem") return `<figure class="cas-foto"><button type="button" class="cas-foto-ver" data-cas-zoom="${esc(a.url)}" aria-label="Ver a composição em tela cheia"><img src="${esc(miniatura(a.url, 720))}" alt="Composição: ${esc((a.itens || []).join(", "))}" loading="lazy"></button>
      <figcaption>${a.itens?.length ? `<small>${esc(a.itens.join(" · "))}</small>` : ""}<span><button type="button" class="cas-link" data-cas-salvar-img="${esc(a.url)}" data-cena="${esc(a.cena_url || "")}">Adicionar ao projeto</button><a class="cas-link" href="${esc(a.url)}" download target="_blank" rel="noopener">Baixar</a></span></figcaption></figure>`;
    return "";
  }).join("");
  if(!m.conteudo && !anexos) return "";
  const deAudio = (m.anexos || []).some((a) => a.tipo === "audio");
  return `<div class="cas-msg ${bot ? "is-bot" : "is-eu"}">${m.conteudo ? `<div class="cas-bubble">${deAudio ? `<span class="cas-audio-tag"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Áudio</span>` : ""}${texto(m.conteudo)}</div>` : ""}${anexos}</div>`;
}
function itemHtml(i){
  return `<article class="cas-item"><button type="button" class="cas-item-foto" data-cas-abrir="${esc(i.id)}" aria-label="Abrir ${esc(i.nome)}"><img src="${esc(miniatura(i.foto))}" alt="" loading="lazy"></button>
    <div class="cas-item-copy"><strong>${esc(i.nome)}</strong>${i.medidas ? `<small>${esc(i.medidas)}</small>` : ""}${i.livres > 0 ? `<small class="cas-livres">${i.livres} ${i.livres === 1 ? "livre" : "livres"} no dia do evento</small>` : ""}</div>
    <div class="cas-item-acoes"><button type="button" class="cas-link" data-cas-abrir="${esc(i.id)}">Ver</button>${i.livres === 0 ? `<span class="cas-esgotado">Esgotado no dia</span>` : ctx.temProjetos ? `<button type="button" class="cas-link" data-projeto-add="${esc(i.id)}">＋ Projeto</button>` : ""}</div></article>`;
}

async function aoClicar(event){
  const sugestao = event.target.closest("[data-cas-sugestao]");
  if(sugestao){ enviar(sugestao.textContent.trim()); return; }
  if(event.target.closest("[data-cas-enviar]")){ alternar(false); window.catalogAssistenteProjeto?.enviarPedido(); return; }
  if(event.target.closest("[data-cas-recarregar]")){ carregarHistorico(); return; }
  const abrir = event.target.closest("[data-cas-abrir]");
  if(abrir){ alternar(false); ctx.abrirItem?.(abrir.dataset.casAbrir); return; }
  const zoom = event.target.closest("[data-cas-zoom]");
  if(zoom){ window.catalogOpenPhotoZoom?.(zoom.dataset.casZoom, "Composição", zoom.querySelector("img")?.currentSrc); return; }
  const salvar = event.target.closest("[data-cas-salvar-img]");
  if(salvar){ salvarImagemNoProjeto(salvar); }
}

async function salvarImagemNoProjeto(botao){
  const url = botao.dataset.casSalvarImg;
  botao.disabled = true;
  try{
    // Com a cena guardada, "Adicionar ao projeto" leva os móveis junto (mesmo fluxo do 3D Livre) e a imagem pode ser
    // reaberta no editor de cena do projeto depois.
    if(botao.dataset.cena){
      const r = await fetch(botao.dataset.cena);
      if(r.ok){
        const snapshot = await r.json();
        window.catalogRegisterRenderItems?.(url, (snapshot.objects || []).map((o) => ({ itemId: o.itemId })), { tipo: "ia", snapshot });
      }
    }
    await window.catalogAddCompositionToProject?.(url, "Assistente comercial");
  }catch(error){
    ctx.notify({ title: "Não foi possível adicionar", message: error.message, status: "error" });
  }finally{ botao.disabled = false; }
}

async function limpar(){
  if(!S.mensagens.length) return;
  if(!confirm("Começar uma nova conversa? O que eu já sei sobre o seu gosto continua guardado.")) return;
  try{ await chamar("limpar"); S.mensagens = []; pintar(); }
  catch(error){ ctx.notify({ title: "Não foi possível limpar", message: error.message, status: "error" }); }
}

// ---------------------------------------------------------------------------------------------------------------
// Conversa
async function enviar(valor, { porAudio = false } = {}){
  if(!S.carregado) await carregarHistorico();
  S.mensagens.push({ papel: "user", conteudo: valor, anexos: porAudio ? [{ tipo: "audio" }] : [] });
  S.enviando = true; pintar(); statusTopo("digitando…");
  try{
    const data = await chamar("conversar", { mensagem: valor, por_audio: porAudio, projeto: window.catalogAssistenteProjeto?.retrato() || null, modo: ctx.modoPedido ? "pedido" : "catalogo" });
    if(data?.nome && data.nome !== S.nome){ S.nome = data.nome; atualizarNome(); }
    if(data?.mensagem) S.mensagens.push(data.mensagem);
    S.enviando = false; pintar(); statusTopo();
    await aplicarAcoes(data?.acoes || []);
    pintarLado();
  }catch(error){
    S.enviando = false; statusTopo();
    S.mensagens.push({ papel: "assistant", conteudo: error.message, anexos: [] });
    pintar();
  }
}

function statusTopo(texto = ""){
  const el = $("catalogAssistente")?.querySelector("[data-cas-status]");
  if(el) el.textContent = texto || (S.renderizando?.size ? "montando sua composição…" : "Consultora comercial · online");
}

async function aplicarAcoes(acoes){
  const projeto = window.catalogAssistenteProjeto;
  for(const acao of acoes){
    try{
      if(acao.tipo === "usar_projeto") await projeto?.usarProjeto(acao.projeto_id);
      else if(acao.tipo === "quantidade"){
        const r = await projeto.quantidade(acao);
        const nome = ctx.findItem?.(acao.item_id)?.name || "Item";
        ctx.notify({ title: acao.quantidade ? "Pedido atualizado" : "Removido do pedido",
          message: acao.quantidade ? `${acao.quantidade}× ${nome} → ${r.ambiente}` : `${nome} saiu de ${r.ambiente}`,
          status: "done", duration: 4200, actionLabel: "Desfazer", onAction: r.desfazer });
      }
      else if(acao.tipo === "enviar_pedido") projeto?.enviarPedido();
      else if(acao.tipo === "renderizar") enfileirarRender(acao);
    }catch(error){
      ctx.notify({ title: "Não consegui concluir", message: error.message, status: "error" });
    }
  }
}

// Uma imagem por vez (só existe um motor 3D). O palco fica fora da tela; o 3D Livre é devolvido como estava.
function enfileirarRender(acao){
  S.renderizando ||= new Set();
  const marca = { itens: acao.itens || [] };
  S.renderizando.add(marca); pintar(); statusTopo();
  S.fila = S.fila.catch(() => {}).then(async () => {
    const editor = ctx.cenaEditor;
    const palco = document.createElement("div");
    palco.setAttribute("aria-hidden", "true");
    palco.style.cssText = "position:fixed;left:-12000px;top:0;width:1200px;height:800px;overflow:hidden;pointer-events:none";
    let montado = null;
    try{
      if(!editor?.pronto?.()) throw new Error("O 3D ainda não está pronto neste aparelho.");
      document.body.appendChild(palco);
      try{ montado = await editor.montarFormato(palco, acao.formato_id, acao.selecao || {}); }
      finally{ await editor.fechar().catch(() => {}); palco.remove(); }
      const src = await editor.executarIA(montado.corpo);
      const imagem = await paraJpegDataUrl(src);
      const projetoId = window.catalogAssistenteProjeto?.retrato()?.id || null;
      const data = await chamar("salvar_imagem", { imagem, cena: montado.snapshot, legenda: acao.legenda, itens: acao.itens, formato: acao.formato_nome, projeto_id: projetoId });
      if(data?.mensagem){
        S.mensagens.push(data.mensagem);
        const anexo = data.mensagem.anexos?.find((a) => a.tipo === "imagem");
        if(anexo) window.catalogRegisterRenderItems?.(anexo.url, (montado.snapshot.objects || []).map((o) => ({ itemId: o.itemId })), { tipo: "ia", snapshot: montado.snapshot });
        if(!S.aberto){ S.naoLidas += 1; pintarBadge(); }
        if(!S.aberto) ctx.notify({ title: `${S.nome} mandou a foto da composição`, message: (acao.itens || []).join(" · "), status: "done", image: anexo?.url, actionLabel: "Ver", onAction: () => alternar(true) });
      }
    }catch(error){
      console.warn("Composição da assistente:", error);
      const motivo = /cr[eé]dito/i.test(error?.message || "") ? "Pra gerar a foto precisa de créditos de imagem." : "";
      try{ const data = await chamar("falha_imagem", { mensagem: `Não consegui terminar a foto dessa composição agora. ${motivo} Quer que eu tente de novo?`.replace(/\s+/g, " ") }); if(data?.mensagem) S.mensagens.push(data.mensagem); }catch{}
    }finally{
      S.renderizando.delete(marca); pintar(); statusTopo();
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Áudio (mensagem de voz). Toca no microfone, fala, toca de novo (ou no enviar) e vai. A transcrição sai no servidor
// (gpt-4o-transcribe + vocabulário do acervo + revisão dos nomes das peças) e aparece escrita no balão — a pessoa vê
// exatamente o que foi entendido. Até 2 minutos por áudio.
let gravacao = null;
const LIMITE_AUDIO_S = 120;
function tipoDeAudio(){
  for(const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"]) if(MediaRecorder.isTypeSupported?.(t)) return t;
  return "";
}
async function iniciarGravacao(){
  if(gravacao || S.enviando || S.transcrevendo) return;
  const form = $("catalogAssistente").querySelector("[data-cas-form]");
  let stream;
  try{ stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch(error){
    const negado = /denied|not ?allowed|permission/i.test(error?.name + error?.message);
    ctx.notify({ title: negado ? "Microfone bloqueado" : "Microfone indisponível",
      message: negado ? "Libere o microfone no navegador (no cadeado ao lado do endereço) e tente de novo." : "Não encontrei um microfone neste aparelho.", status: "error", duration: 9000 });
    return;
  }
  const tipo = tipoDeAudio();
  const recorder = new MediaRecorder(stream, tipo ? { mimeType: tipo, audioBitsPerSecond: 64000 } : undefined);
  const partes = [];
  recorder.addEventListener("dataavailable", (e) => { if(e.data?.size) partes.push(e.data); });
  gravacao = { stream, recorder, partes, inicio: Date.now(), enviar: false, timer: null, raf: 0, audioCtx: null };
  recorder.addEventListener("stop", () => finalizarGravacao());
  recorder.start(250);
  form.classList.add("is-gravando");
  form.querySelector("[data-cas-gravando]").hidden = false;
  form.querySelector("[data-cas-mic]").setAttribute("aria-label", "Enviar o áudio");
  form.querySelector("[data-cas-mic]").title = "Enviar o áudio";
  const tempo = form.querySelector("[data-cas-tempo]");
  gravacao.timer = setInterval(() => {
    const s = Math.floor((Date.now() - gravacao.inicio) / 1000);
    tempo.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    if(s >= LIMITE_AUDIO_S) pararGravacao(true);
  }, 250);
  // Ondas: nível do microfone ao vivo (mostra que está captando de verdade).
  try{
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const fonte = audioCtx.createMediaStreamSource(stream), analisador = audioCtx.createAnalyser();
    analisador.fftSize = 256; fonte.connect(analisador);
    gravacao.audioCtx = audioCtx;
    // Criado depois do "await" da permissão, o navegador costuma deixar o contexto suspenso (ondas paradas).
    if(audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const ondas = form.querySelector("[data-cas-ondas]");
    ondas.innerHTML = "<i></i>".repeat(28);
    const barras = [...ondas.children], dados = new Uint8Array(analisador.frequencyBinCount);
    const desenhar = () => {
      if(!gravacao) return;
      analisador.getByteFrequencyData(dados);
      barras.forEach((b, i) => { const v = dados[Math.floor(i * dados.length / barras.length / 1.6)] / 255; b.style.transform = `scaleY(${Math.max(.12, v)})`; });
      gravacao.raf = requestAnimationFrame(desenhar);
    };
    desenhar();
  }catch{ /* sem ondas, a gravação continua */ }
}
function pararGravacao(enviar){
  if(!gravacao) return;
  gravacao.enviar = enviar;
  if(gravacao.recorder.state !== "inactive") gravacao.recorder.stop();
  else finalizarGravacao();
}
async function finalizarGravacao(){
  const g = gravacao;
  if(!g) return;
  gravacao = null;
  clearInterval(g.timer); cancelAnimationFrame(g.raf);
  g.stream.getTracks().forEach((t) => t.stop());
  g.audioCtx?.close?.();
  const form = $("catalogAssistente")?.querySelector("[data-cas-form]");
  if(form){
    form.classList.remove("is-gravando");
    form.querySelector("[data-cas-gravando]").hidden = true;
    form.querySelector("[data-cas-tempo]").textContent = "0:00";
    form.querySelector("[data-cas-mic]").setAttribute("aria-label", "Gravar áudio");
    form.querySelector("[data-cas-mic]").title = "Gravar áudio";
  }
  const duracao = (Date.now() - g.inicio) / 1000;
  if(!g.enviar) return;
  if(duracao < 0.8){ ctx.notify({ title: "Áudio curto demais", message: "Toque no microfone, fale e toque de novo para enviar.", status: "error", duration: 5000 }); return; }
  const blob = new Blob(g.partes, { type: g.recorder.mimeType || "audio/webm" });
  const audio = await new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = erro; r.readAsDataURL(blob); });
  if(!S.carregado) await carregarHistorico();
  S.transcrevendo = true; pintar(); statusTopo("ouvindo seu áudio…");
  let textoFalado = "";
  try{
    const data = await chamar("transcrever", { audio });
    textoFalado = String(data?.texto || "").trim();
  }catch(error){
    S.transcrevendo = false; pintar(); statusTopo();
    ctx.notify({ title: "Não entendi o áudio", message: error.message, status: "error", duration: 8000 });
    return;
  }
  S.transcrevendo = false; statusTopo();
  if(textoFalado) enviar(textoFalado, { porAudio: true });
  else pintar();
}

async function paraJpegDataUrl(src, lado = 2000){
  const blob = await (await fetch(src)).blob();
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala); canvas.height = Math.round(bitmap.height * escala);
  const c = canvas.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, canvas.width, canvas.height);
  c.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", .88);
}

export function initCatalogAssistente(contexto){
  ctx = contexto;
  if($("catalogAssistenteBotao")) return;
  montar();
}
export function abrirCatalogAssistente(){ if(ctx) alternar(true); }
