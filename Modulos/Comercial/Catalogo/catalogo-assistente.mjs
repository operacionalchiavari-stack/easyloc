// Assistente comercial do catálogo (out/2026) — a conversa. O "cérebro" é a Edge Function `catalogo-assistente`
// (conversa, ferramentas, perfil do decorador); aqui fica só a tela e a execução das AÇÕES que ela devolve:
//   quantidade     → põe/tira item do projeto (window.catalogAssistenteProjeto, mesmo caminho do "＋")
//   usar_projeto   → abre o projeto que ela acabou de criar
//   enviar_pedido  → abre a revisão "Enviar pedido" de sempre (a pessoa confirma)
//   renderizar     → monta o FORMATO cadastrado com os móveis escolhidos no motor do 3D Livre (palco escondido) e gera a
//                    mesma fotografia de estúdio do "Renderizar com IA"; a imagem volta pra conversa.
// Self-contido: não importa catalogo.mjs nem o contrário (recebe tudo por initCatalogAssistente).

let ctx = null;
const S = { pendentes: [], aberto: false, carregado: false, enviando: false, nome: "Helena", mensagens: [], fila: Promise.resolve(), naoLidas: 0 };
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
      <button type="button" class="cas-pedido-btn" data-cas-pedido aria-expanded="false" title="Ver o pedido que está sendo alterado"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></svg><span data-cas-pedido-nome>Pedido</span><b data-cas-pedido-qtd></b><i class="cas-pedido-novo" aria-hidden="true"></i></button>
      <button type="button" class="cas-head-btn cas-ligar" data-cas-ligar title="Ligar para a Helena e conversar por voz"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5l2.6.4 1.3 4-1.9 1.5a12 12 0 0 0 6 6l1.5-1.9 4 1.3.4 2.6a2 2 0 0 1-2 2.2A17 17 0 0 1 4.4 5.5a2 2 0 0 1 2.2-2z"/></svg><span>Ligar</span></button>
      <button type="button" class="cas-head-btn" data-cas-limpar title="Começar uma nova conversa"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg><span>Nova conversa</span></button>
      <button type="button" class="cas-head-btn" data-cas-fechar title="Minimizar e voltar ao catálogo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg><span>Minimizar</span></button>
    </header>
    <div class="cas-corpo">
      <div class="cas-conversa">
        <div class="cas-ligacao" data-cas-ligacao hidden></div>
        <div class="cas-vitrine" data-cas-vitrine hidden></div>
        <div class="cas-msgs" data-cas-msgs aria-live="polite"><div class="cas-coluna" data-cas-coluna></div></div>
        <form class="cas-form" data-cas-form>
          <div class="cas-anexos-pend" data-cas-pend hidden></div>
          <div class="cas-form-in">
            <button type="button" class="cas-clip" data-cas-clip aria-label="Anexar arquivo (planta em PDF ou foto)" title="Anexar arquivo (planta em PDF ou foto)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/></svg></button>
            <input type="file" data-cas-arquivo accept="image/*,application/pdf" multiple hidden>
            <textarea rows="1" maxlength="2000" placeholder="Escreva ou mande um áudio…" aria-label="Mensagem" data-cas-input></textarea>
            <div class="cas-gravando" data-cas-gravando hidden>
              <button type="button" class="cas-grav-cancelar" data-cas-cancelar-audio aria-label="Descartar o áudio" title="Descartar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg></button>
              <i class="cas-grav-ponto" aria-hidden="true"></i><span class="cas-grav-tempo" data-cas-tempo>0:00</span>
              <span class="cas-grav-ondas" data-cas-ondas aria-hidden="true"></span>
              <span class="cas-grav-auto" data-cas-auto>envia quando você parar</span>
            </div>
            <button type="button" class="cas-send cas-mic" data-cas-mic aria-label="Gravar áudio" title="Gravar áudio"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
            <button type="submit" class="cas-send cas-enviar" aria-label="Enviar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2-7z"/></svg></button>
          </div>
          <small class="cas-form-dica" data-cas-dica>Enter envia · Shift+Enter quebra a linha · no microfone, é só falar e parar que o áudio vai sozinho</small>
        </form>
      </div>
      <aside class="cas-lado" data-cas-lado aria-label="Seu pedido"></aside>
    </div>`;
  document.body.append(botao, painel);
  document.body.classList.add("tem-assistente");

  botao.addEventListener("click", () => alternar(true));
  painel.querySelectorAll("[data-cas-fechar]").forEach((b) => b.addEventListener("click", () => alternar(false)));
  painel.querySelector("[data-cas-limpar]").addEventListener("click", limpar);
  painel.querySelector("[data-cas-ligar]").addEventListener("click", () => {
    if(!lig) iniciarLigacao();
    else if(painel.querySelector("[data-cas-ligacao]").hidden) mostrarTelaLigacao(true);
    else encerrarLigacao();
  });
  if(!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) painel.querySelector("[data-cas-ligar]").hidden = true;
  painel.querySelector("[data-cas-pedido]").addEventListener("click", () => alternarPedido());
  const input = painel.querySelector("[data-cas-input]");
  const ajustar = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; painel.querySelector("[data-cas-form]").classList.toggle("tem-texto", Boolean(input.value.trim() || S.pendentes.length)); };
  S.ajustarForm = ajustar;
  painel.querySelector("[data-cas-clip]").addEventListener("click", () => painel.querySelector("[data-cas-arquivo]").click());
  painel.querySelector("[data-cas-arquivo]").addEventListener("change", (event) => { escolherArquivos([...event.target.files]); event.target.value = ""; });
  painel.querySelector("[data-cas-pend]").addEventListener("click", (event) => {
    const x = event.target.closest("[data-cas-tirar]");
    if(x){ S.pendentes.splice(Number(x.dataset.casTirar), 1); pintarPendentes(); }
  });
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
    if((!valor && !S.pendentes.length) || S.enviando) return;
    const arquivos = S.pendentes.splice(0);
    input.value = ""; pintarPendentes(); ajustar();
    enviar(valor, { arquivos });
  });
  painel.addEventListener("click", aoClicar);
  painel.addEventListener("keydown", (event) => { if(event.key === "Escape"){ event.stopPropagation(); if(lig) return; if(gravacao) pararGravacao(false); else alternar(false); } });
}

// ---------------------------------------------------------------------------------------------------------------
// Mostrar no catálogo (pedido do usuário): em vez de só cartões na conversa, a Helena leva a pessoa até as peças no
// próprio catálogo — a conversa vira uma barra pequena no canto (com a legenda dela e, na ligação, os botões da
// ligação) e o catálogo abre nas peças. Ela não indica por conta própria (pedido do usuário): "opções" = tudo o que está
// disponível de um tipo, sem destaque; o círculo vai só na peça que a PESSOA escolheu (ou que entrou no pedido), pra
// conferir que é a certa.
function irAoCatalogo(ids, opcoes = {}){
  if(!ids?.length) return;
  abrirVitrine(ids, { titulo: opcoes.titulo || "" });
}
function circularEscolha(ids){
  if(!ids?.length) return;
  marcarEscolha(ids);
}

// ---------------------------------------------------------------------------------------------------------------
// Vitrine (pedido do usuário: "o pedido deve ficar visível o tempo inteiro... aquele catálogo deve aparecer aqui,
// ocupando todo esse espaço"): em vez de levar a pessoa pro catálogo, as peças aparecem DENTRO do painel da Helena,
// cobrindo a área da conversa/ligação; o pedido continua à direita. Por cima, uma faixa com a fala atual dela e os
// botões da ligação. A peça escolhida ganha uma moldura dourada e o selo "Sua escolha" (no lugar do círculo à mão).
const dinheiroVit = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const chaveVit = (i) => `${i?.name || ""}|${i?.dims || ""}`;
function vitrine(){ return $("catalogAssistente")?.querySelector("[data-cas-vitrine]"); }
function abrirVitrine(ids, { titulo = "" } = {}){
  const el = vitrine();
  if(!el) return;
  if(!S.aberto) alternar(true, { semFoco: true });
  const grupos = new Map();
  for(const id of ids){
    const item = ctx.findItem?.(id);
    if(!item) continue;
    const k = chaveVit(item);
    const g = grupos.get(k);
    if(g){ if(item.cor && !g.cores.includes(item.cor)) g.cores.push(item.cor); continue; }
    grupos.set(k, { item, cores: item.cor ? [item.cor] : [] });
  }
  if(!grupos.size) return;
  const lista = [...grupos.values()];
  const nome = titulo || (lista.length === 1 ? "Peça" : "Seleção da " + S.nome);
  el.innerHTML = `
    <header class="cas-vit-topo">
      <span class="cas-avatar" aria-hidden="true">${esc(S.nome[0])}</span>
      <div class="cas-vit-fala"><small>${esc(S.nome)}</small><p data-vit-fala></p></div>
      <div class="cas-vit-acoes" data-vit-acoes></div>
      <button type="button" class="cas-vit-voltar" data-vit-fechar>${lig ? "Voltar à ligação" : "Voltar à conversa"}</button>
    </header>
    <div class="cas-vit-titulo"><h3>${esc(nome)}</h3><span>${lista.length} ${lista.length === 1 ? "peça" : "peças"}</span></div>
    <div class="cas-vit-grade">${lista.map(({ item, cores }, n) => `
      <article class="cas-vit-card" data-vit-chave="${esc(chaveVit(item))}" style="--i:${Math.min(n, 12)}">
        <span class="cas-vit-selo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg>Sua escolha</span>
        <button type="button" class="cas-vit-foto" data-vit-zoom="${esc(item.photo || "")}" aria-label="Ver a foto de ${esc(item.name)}"><img src="${esc(miniatura(item.photo, 480))}" alt="" loading="lazy"></button>
        <div class="cas-vit-info">
          <strong>${esc(item.name)}</strong>
          ${item.dims ? `<small>${esc(item.dims)}</small>` : ""}
          ${cores.length > 1 ? `<small class="cas-vit-cores">${cores.length} cores · ${esc(cores.slice(0, 3).join(", "))}${cores.length > 3 ? "…" : ""}</small>` : item.cor ? `<small class="cas-vit-cores">${esc(item.cor)}</small>` : ""}
          ${Number.isFinite(item.rentalPrice) ? `<b class="cas-vit-preco">${dinheiroVit.format(item.rentalPrice)}</b>` : ""}
          <span class="cas-vit-stock" data-stock-item="${esc(item.id)}" hidden></span>
        </div>
        ${ctx.temProjetos ? `<button type="button" class="cas-vit-add" data-projeto-add="${esc(item.id)}">＋ Adicionar ao pedido</button>` : ""}
      </article>`).join("")}</div>`;
  el.hidden = false;
  el.scrollTop = 0;
  pintarVitrineAcoes();
  const ultima = lig ? (lig.falas.filter((f) => f.papel === "assistant").at(-1)?.texto || "") : ([...S.mensagens].reverse().find((m) => m.papel === "assistant" && m.conteudo)?.conteudo || "");
  miniTexto(ultima, !lig);
}
function marcarEscolha(ids){
  const el = vitrine();
  const chaves = ids.map((id) => chaveVit(ctx.findItem?.(id))).filter((k) => k !== "|");
  const achar = () => el && !el.hidden ? chaves.filter((k) => el.querySelector(`[data-vit-chave="${CSS.escape(k)}"]`)) : [];
  let presentes = achar();
  if(!presentes.length){ abrirVitrine(ids, { titulo: "Sua escolha" }); presentes = achar(); if(!presentes.length) return; }
  el.querySelectorAll(".cas-vit-card.is-escolhida").forEach((c) => c.classList.remove("is-escolhida"));
  presentes.forEach((k, n) => {
    const card = el.querySelector(`[data-vit-chave="${CSS.escape(k)}"]`);
    card.classList.remove("is-escolhida"); void card.offsetWidth; card.classList.add("is-escolhida");
    if(!n) card.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
function fecharVitrine(){ const el = vitrine(); if(el){ el.hidden = true; el.innerHTML = ""; } }
function pintarVitrineAcoes(){
  const el = vitrine();
  const box = el && !el.hidden ? el.querySelector("[data-vit-acoes]") : null;
  if(!box) return;
  el.classList.toggle("em-ligacao", Boolean(lig));
  el.classList.toggle("falando", Boolean(lig?.elaFalando));
  box.innerHTML = lig ? `
    ${lig.elaFalando ? `<button type="button" class="cas-mini-btn" data-mini-interromper aria-label="Interromper"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg></button>` : ""}
    <button type="button" class="cas-mini-btn${lig.mudo ? " ativo" : ""}" data-mini-mudo aria-label="${lig.mudo ? "Desligar o mudo" : "Mudo"}" aria-pressed="${lig.mudo ? "true" : "false"}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
    <button type="button" class="cas-mini-btn is-desligar" data-mini-desligar aria-label="Desligar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15.5c5-4.7 13-4.7 18 0l-2.4 2.6-3.4-1.3v-2.6a10 10 0 0 0-6.4 0v2.6l-3.4 1.3z"/></svg></button>` : "";
  const voltar = el.querySelector("[data-vit-fechar]");
  if(voltar) voltar.textContent = lig ? "Voltar à ligação" : "Voltar à conversa";
}
// Resultado de uma resposta (escrita ou da ligação): opções → itens citados → círculo na escolha.
function mostrarResultado({ opcoes, itens, circular }){
  let espera = 0;
  if(opcoes?.ids?.length){ irAoCatalogo(opcoes.ids, { titulo: opcoes.titulo, exato: true }); espera = 700; }
  else if(itens?.length && !circular?.length){ irAoCatalogo(itens); espera = 700; }
  if(circular?.length) setTimeout(() => circularEscolha(circular), espera);
}
function mini(){
  let el = $("catalogAssistenteMini");
  if(el) return el;
  el = document.createElement("div");
  el.id = "catalogAssistenteMini"; el.className = "cas-mini"; el.hidden = true;
  el.setAttribute("role", "region"); el.setAttribute("aria-label", `Conversa com a ${S.nome}`);
  el.innerHTML = `<button type="button" class="cas-mini-abrir" data-mini-abrir aria-label="Abrir a conversa inteira"><span class="cas-avatar" aria-hidden="true">${esc(S.nome[0])}</span><span class="cas-mini-copy"><b>${esc(S.nome)}</b><span data-mini-texto></span></span></button>
    <div class="cas-mini-acoes" data-mini-acoes></div>
    <button type="button" class="cas-mini-x" data-mini-fechar aria-label="Esconder">×</button>`;
  document.body.appendChild(el);
  el.addEventListener("click", (e) => {
    if(e.target.closest("[data-mini-abrir]")){ mostrarMini(false); alternar(true); if(lig) mostrarTelaLigacao(true); return; }
    if(e.target.closest("[data-mini-fechar]")){ mostrarMini(false); return; }
    if(e.target.closest("[data-mini-interromper]")){ interromperHelena(); return; }
    if(e.target.closest("[data-mini-mudo]")){ $("catalogAssistente")?.querySelector("[data-lig-mudo]")?.click(); pintarMini(); return; }
    if(e.target.closest("[data-mini-desligar]")){ encerrarLigacao(); return; }
  });
  return el;
}
function mostrarMini(ver){
  const el = mini();
  if(ver){
    if(S.aberto) alternar(false, { semFoco: true });
    el.hidden = false;
    document.body.classList.add("cas-mini-aberta");
    if(!lig){ const ultima = [...S.mensagens].reverse().find((m) => m.papel === "assistant" && m.conteudo); miniTexto(ultima?.conteudo || "", true); }
    pintarMini();
  }else{
    el.hidden = true;
    document.body.classList.remove("cas-mini-aberta");
  }
}
// Por escrito mostra o começo da mensagem (onde está a indicação); na ligação, a fala mais recente.
function miniTexto(t, doComeco = false){
  const vit = vitrine()?.querySelector("[data-vit-fala]");
  const el = $("catalogAssistenteMini")?.querySelector("[data-mini-texto]");
  if(!el && !vit) return;
  const frases = String(t || "").replace(/[*_#>]/g, "").match(/[^.!?]+[.!?]*\s*/g) || [];
  let fim = (doComeco ? frases.slice(0, 2) : frases.slice(-2)).join("").trim();
  if(fim.length > 180) fim = doComeco ? fim.slice(0, 180).replace(/\s\S*$/, "") + "…" : "…" + fim.slice(-180).replace(/^\S*\s/, "");
  if(el) el.textContent = fim;
  if(vit) vit.textContent = fim;
}
function pintarMini(){
  pintarVitrineAcoes();
  const el = $("catalogAssistenteMini");
  if(!el || el.hidden) return;
  el.classList.toggle("em-ligacao", Boolean(lig));
  el.classList.toggle("falando", Boolean(lig?.elaFalando));
  el.querySelector("[data-mini-acoes]").innerHTML = lig ? `
    ${lig.elaFalando ? `<button type="button" class="cas-mini-btn" data-mini-interromper aria-label="Interromper"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg></button>` : ""}
    <button type="button" class="cas-mini-btn${lig.mudo ? " ativo" : ""}" data-mini-mudo aria-label="${lig.mudo ? "Desligar o mudo" : "Mudo"}" aria-pressed="${lig.mudo ? "true" : "false"}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
    <button type="button" class="cas-mini-btn is-desligar" data-mini-desligar aria-label="Desligar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15.5c5-4.7 13-4.7 18 0l-2.4 2.6-3.4-1.3v-2.6a10 10 0 0 0-6.4 0v2.6l-3.4 1.3z"/></svg></button>` : "";
}

async function alternar(abrir, { semFoco = false } = {}){
  const painel = $("catalogAssistente"), botao = $("catalogAssistenteBotao");
  S.aberto = abrir;
  painel.hidden = !abrir;
  botao.setAttribute("aria-expanded", String(abrir));
  document.body.classList.toggle("assistente-aberta", abrir);
  document.documentElement.classList.toggle("cas-trava-rolagem", abrir);
  if(!abrir){ if(gravacao) pararGravacao(false); alternarPedido(false); if(!semFoco) botao.focus(); return; }
  if($("catalogAssistenteMini") && !$("catalogAssistenteMini").hidden) mostrarMini(false);
  S.naoLidas = 0; pintarBadge(); pintarLado();
  painel.querySelector("[data-cas-input]").focus();
  if(!S.carregado || projetoAtualId() !== S.conversaDe) await carregarHistorico();
  rolarFim();
}

const projetoAtualId = () => window.catalogAssistenteProjeto?.retrato()?.id || null;
// Trocou o pedido aberto (no catálogo, no app ou pela própria Helena)? A conversa na tela passa a ser a do novo pedido.
async function sincronizarConversa(){
  if(!S.carregado || S.enviando || S.carregandoConversa) return;
  if(projetoAtualId() === S.conversaDe) return;
  S.carregandoConversa = true;
  try{ await carregarHistorico(); rolarFim(); }finally{ S.carregandoConversa = false; }
}
setInterval(() => { if(S.aberto) sincronizarConversa(); }, 1500);

async function carregarHistorico(){
  const lista = coluna();
  lista.innerHTML = `<div class="cas-carregando">Abrindo a conversa…</div>`;
  try{
    const id = projetoAtualId();
    const data = await chamar("historico", { projeto_id: id });
    S.conversaDe = id;
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
// No celular (sem espaço pra coluna) o pedido abre por cima da conversa pelo botão do topo.
function alternarPedido(abrir){
  const painel = $("catalogAssistente");
  const aberto = abrir ?? !painel.classList.contains("mostra-pedido");
  painel.classList.toggle("mostra-pedido", aberto);
  painel.querySelector("[data-cas-pedido]")?.setAttribute("aria-expanded", String(aberto));
  if(aberto) painel.querySelector("[data-cas-pedido]")?.classList.remove("tem-novidade");
}
// Destaque do que mudou desde a última vez que o pedido foi desenhado (ela pôs/tirou/trocou quantidade): a linha fica
// marcada por alguns segundos e, com o pedido fechado no celular, o botão do topo ganha um ponto.
const destaques = new Map();
const animar = new Map();   // mudanças desta pintura (entrou/subiu/desceu/saiu) → animação + rolar até a linha
const saindo = new Map();   // linhas tiradas do pedido, mostradas saindo por um instante
let retratoAnterior = null;
function pintarLado(){
  const lado = $("catalogAssistente")?.querySelector("[data-cas-lado]");
  if(!lado) return;
  const p = window.catalogAssistenteProjeto?.retrato();
  const limparBtn = $("catalogAssistente")?.querySelector("[data-cas-limpar]");
  if(limparBtn) limparBtn.hidden = Boolean(p);
  const botao = $("catalogAssistente")?.querySelector("[data-cas-pedido]");
  if(botao){
    const total = p ? p.ambientes.reduce((t, a) => t + a.itens.reduce((q, i) => q + i.quantidade, 0), 0) : 0;
    botao.querySelector("[data-cas-pedido-nome]").textContent = p ? p.noivos : "Sem projeto";
    botao.querySelector("[data-cas-pedido-qtd]").textContent = p ? String(total) : "";
  }
  if(p){
    const atual = new Map(p.ambientes.flatMap((a) => a.itens.map((i) => [`${a.id}:${i.item_id}`, i.quantidade])));
    if(retratoAnterior && retratoAnterior.id === p.id){
      let mudou = false;
      for(const [k, q] of atual) if(retratoAnterior.mapa.get(k) !== q){
        destaques.set(k, Date.now() + 8000); mudou = true;
        animar.set(k, retratoAnterior.mapa.has(k) ? (q > retratoAnterior.mapa.get(k) ? "subiu" : "desceu") : "entrou");
      }
      // Saiu do pedido: a linha continua um instante na tela, saindo, pra dar pra ver o que foi tirado.
      for(const [k, q] of retratoAnterior.mapa) if(!atual.has(k)){ mudou = true; saindo.set(k, { quantidade: q, ate: Date.now() + 1700 }); animar.set(k, "saiu"); setTimeout(pintarLado, 1750); }
      if(mudou && !$("catalogAssistente").classList.contains("mostra-pedido")) botao?.classList.add("tem-novidade");
    }
    retratoAnterior = { id: p.id, mapa: atual };
  }
  if(!p){
    lado.innerHTML = `<button type="button" class="cas-lado-fechar" data-cas-pedido-fechar aria-label="Fechar">×</button><div class="cas-lado-vazio"><p class="cas-lado-kicker">Seu pedido</p><strong>Nenhum projeto aberto</strong><p>Conte pra ${esc(S.nome)} sobre o evento (noivos, data e local) que ela cria o projeto e vai montando o pedido com você.</p></div>`;
    return;
  }
  const data = p.data_evento ? new Date(p.data_evento + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) : "";
  const soma = (a) => a.itens.reduce((t, i) => t + i.quantidade, 0);
  const total = p.ambientes.reduce((t, a) => t + soma(a), 0);
  for(const [k, v] of saindo) if(v.ate < Date.now()) saindo.delete(k);
  const linha = (a) => (i) => { const k = `${a.id}:${i.item_id}`; const it = ctx.findItem?.(i.item_id); const novo = (destaques.get(k) || 0) > Date.now(); const anim = animar.get(k); return `<li class="${[novo ? "mudou" : "", anim ? "anima-" + anim : "", saindo.has(k) && !anim ? "anima-saiu" : ""].filter(Boolean).join(" ")}"${anim ? " data-foco" : ""}><img src="${esc(miniatura(it?.photo || "", 120))}" alt="" loading="lazy"><span>${esc(it?.name || "Item")}${it?.cor ? `<small>${esc(it.cor)}</small>` : ""}</span><b>${i.quantidade}×</b></li>`; };
  const rolagemAntes = lado.querySelector(".cas-lado-ambs")?.scrollTop || 0;
  queueMicrotask(() => {
    const lista = lado.querySelector(".cas-lado-ambs");
    if(!lista) return;
    lista.scrollTop = rolagemAntes;
    const foco = [...lista.querySelectorAll("[data-foco]")].pop();
    animar.clear();
    if(!foco) return;
    const alvo = foco.offsetTop - (lista.clientHeight - foco.offsetHeight) / 2;
    const reduzir = matchMedia("(prefers-reduced-motion: reduce)").matches;
    lista.scrollTo({ top: Math.max(0, alvo), behavior: reduzir ? "auto" : "smooth" });
  });
  lado.innerHTML = `<button type="button" class="cas-lado-fechar" data-cas-pedido-fechar aria-label="Fechar o pedido">×</button><p class="cas-lado-kicker">Pedido que estamos alterando</p><h3>${esc(p.noivos)}</h3><p class="cas-lado-sub">${esc([data, p.local_evento].filter(Boolean).join(" · "))}</p>
    <div class="cas-lado-ambs">${p.ambientes.map((a) => { const fora = [...saindo].filter(([k]) => k.startsWith(a.id + ":") && !a.itens.some((i) => `${a.id}:${i.item_id}` === k)).map(([k, v]) => ({ item_id: k.slice(a.id.length + 1), quantidade: v.quantidade })); const todas = [...a.itens, ...fora]; return `<section><h4>${esc(a.nome)}<b>${soma(a)}</b></h4>${todas.length ? `<ul>${todas.map(linha(a)).join("")}</ul>` : `<p class="cas-lado-nada">Ainda sem peças</p>`}</section>`; }).join("") || `<p class="cas-lado-nada">Sem ambientes ainda</p>`}</div>
    <p class="cas-lado-total">${total} ${total === 1 ? "peça" : "peças"} no total</p>
    ${ctx.modoPedido || !total ? "" : `<button type="button" class="cas-lado-enviar" data-cas-enviar>${p.status && p.status !== "rascunho" ? "Reenviar pedido" : "Revisar e enviar pedido"}</button>`}`;
}

function boasVindas(){
  const primeiro = String(S.cliente || "").trim().split(/\s+/)[0];
  const ola = primeiro ? `Oi, ${esc(primeiro)}! ` : "Oi! ";
  const pedido = window.catalogAssistenteProjeto?.retrato();
  if(pedido) return `<div class="cas-boasvindas"><span class="cas-avatar is-xl" aria-hidden="true">${esc(S.nome[0])}</span><h2>${ola}Conversa do pedido ${esc(pedido.noivos)}</h2><p>Tudo o que combinarmos sobre este pedido — por escrito ou por ligação — fica guardado aqui.</p></div>`;
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
    if(a.tipo === "arquivo"){
      const apagar = m.id ? `<button type="button" class="cas-link cas-link-apagar" data-cas-apagar-img="${esc(m.id)}">Apagar</button>` : "";
      if(a.mime === "application/pdf") return `<div class="cas-arquivo"><a class="cas-arquivo-pdf" href="${esc(a.url || "#")}" target="_blank" rel="noopener"><i class="cas-pdf-ico">PDF</i><span>${esc(a.nome || "arquivo.pdf")}</span></a>${a.enviando ? `<small>enviando…</small>` : apagar}</div>`;
      return `<figure class="cas-arquivo"><button type="button" class="cas-foto-ver" data-cas-zoom="${esc(a.url)}" aria-label="Ver o arquivo"><img src="${esc(a.url?.startsWith("blob:") ? a.url : miniatura(a.url, 520))}" alt="${esc(a.nome || "Arquivo")}" loading="lazy"></button>${a.enviando ? `<small>enviando…</small>` : apagar}</figure>`;
    }
    if(a.tipo === "itens") return `<div class="cas-itens">${a.itens.map(itemHtml).join("")}</div>`;
    if(a.tipo === "opcoes") return `<button type="button" class="cas-opcoes" data-cas-opcoes="${esc((a.ids || []).join(","))}" data-titulo="${esc(a.titulo || "Opções")}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span><b>${esc(a.titulo || "Opções")}</b><small>${a.total || (a.ids || []).length} peças disponíveis · ver no catálogo</small></span></button>`;
    if(a.tipo === "locais") return `<div class="cas-locais">${(a.locais || []).map(localHtml).join("")}</div>`;
    if(a.tipo === "imagem") return `<figure class="cas-foto"><button type="button" class="cas-foto-ver" data-cas-zoom="${esc(a.url)}" aria-label="Ver a composição em tela cheia"><img src="${esc(miniatura(a.url, 720))}" alt="Composição: ${esc((a.itens || []).join(", "))}" loading="lazy"></button>
      <figcaption>${a.itens?.length ? `<small>${esc(a.itens.join(" · "))}</small>` : ""}<span><button type="button" class="cas-link" data-cas-salvar-img="${esc(a.url)}" data-cena="${esc(a.cena_url || "")}">Adicionar ao projeto</button><a class="cas-link" href="${esc(a.url)}" download target="_blank" rel="noopener">Baixar</a>${m.id ? `<button type="button" class="cas-link cas-link-apagar" data-cas-apagar-img="${esc(m.id)}">Apagar</button>` : ""}</span></figcaption></figure>`;
    return "";
  }).join("");
  if(!m.conteudo && !anexos) return "";
  const tipos = (m.anexos || []).map((a) => a.tipo);
  if(tipos.includes("ligacao")) return `<div class="cas-lig-marca"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5l2.6.4 1.3 4-1.9 1.5a12 12 0 0 0 6 6l1.5-1.9 4 1.3.4 2.6a2 2 0 0 1-2 2.2A17 17 0 0 1 4.4 5.5a2 2 0 0 1 2.2-2z"/></svg>${esc(m.conteudo)}</div>`;
  const deAudio = tipos.includes("audio");
  const naLigacao = tipos.includes("voz") || tipos.includes("voz_helena");
  return `<div class="cas-msg${naLigacao ? " is-voz" : ""} ${bot ? "is-bot" : "is-eu"}">${m.conteudo ? `<div class="cas-bubble">${deAudio ? `<span class="cas-audio-tag"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Áudio</span>` : ""}${texto(m.conteudo)}</div>` : ""}${anexos}</div>`;
}
// Local encontrado pela Helena (cadastro ou Google): mapa + nome + endereço + "É este" (manda a confirmação pra ela).
function mapaUrl(l){
  const q = l.lat != null && l.lng != null ? `${l.lat},${l.lng}` : encodeURIComponent([l.nome, l.endereco].filter(Boolean).join(", "));
  return `https://maps.google.com/maps?q=${q}&z=15&output=embed`;
}
function localHtml(l){
  const resposta = `É este: ${l.nome}${l.endereco ? " — " + l.endereco : ""}`;
  return `<article class="cas-local"><iframe src="${esc(mapaUrl(l))}" title="Mapa de ${esc(l.nome)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    <div class="cas-local-copy"><span class="cas-local-fonte">${l.fonte === "cadastro" ? "Local cadastrado" : "Google Maps"}</span><strong>${esc(l.nome)}</strong>${l.endereco ? `<small>${esc(l.endereco)}</small>` : ""}</div>
    <button type="button" class="cas-local-ok" data-cas-local="${esc(resposta)}">É este</button></article>`;
}
function itemHtml(i){
  return `<article class="cas-item"><button type="button" class="cas-item-foto" data-cas-abrir="${esc(i.id)}" aria-label="Abrir ${esc(i.nome)}"><img src="${esc(miniatura(i.foto))}" alt="" loading="lazy"></button>
    <div class="cas-item-copy"><strong>${esc(i.nome)}</strong>${i.medidas ? `<small>${esc(i.medidas)}</small>` : ""}${i.livres > 0 ? `<small class="cas-livres">${i.livres} ${i.livres === 1 ? "livre" : "livres"} no dia do evento</small>` : ""}</div>
    <div class="cas-item-acoes"><button type="button" class="cas-link" data-cas-abrir="${esc(i.id)}">Ver</button>${i.livres === 0 ? `<span class="cas-esgotado">Esgotado no dia</span>` : ctx.temProjetos ? `<button type="button" class="cas-link" data-projeto-add="${esc(i.id)}">＋ Projeto</button>` : ""}</div></article>`;
}

async function aoClicar(event){
  const local = event.target.closest("[data-cas-local]");
  if(local){
    const texto = local.dataset.casLocal;
    // Na ligação, o toque vira uma fala dela na conversa de voz; fora dela, uma mensagem normal.
    if(lig?.dc?.readyState === "open"){
      enviarEvento({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: texto }] } });
      enviarEvento({ type: "response.create" });
      lig.falas.push({ id: "local-" + Date.now(), papel: "user", texto });
      ligVoce(texto);
    }else enviar(texto);
    return;
  }
  if(event.target.closest("[data-vit-fechar]")){ fecharVitrine(); return; }
  const zoomVit = event.target.closest("[data-vit-zoom]");
  if(zoomVit){ if(zoomVit.dataset.vitZoom) window.catalogOpenPhotoZoom?.(zoomVit.dataset.vitZoom, zoomVit.getAttribute("aria-label") || "", zoomVit.querySelector("img")?.currentSrc); return; }
  if(event.target.closest("[data-mini-interromper]")){ interromperHelena(); return; }
  if(event.target.closest("[data-mini-mudo]")){ $("catalogAssistente")?.querySelector("[data-lig-mudo]")?.click(); pintarVitrineAcoes(); return; }
  if(event.target.closest("[data-mini-desligar]")){ encerrarLigacao(); return; }
  const sugestao = event.target.closest("[data-cas-sugestao]");
  if(sugestao){ enviar(sugestao.textContent.trim()); return; }
  if(event.target.closest("[data-cas-pedido-fechar]")){ alternarPedido(false); return; }
  if(event.target.closest("[data-cas-enviar]")){ alternar(false); window.catalogAssistenteProjeto?.enviarPedido(); return; }
  if(event.target.closest("[data-cas-recarregar]")){ carregarHistorico(); return; }
  const abrir = event.target.closest("[data-cas-abrir]");
  if(abrir){ alternar(false); ctx.abrirItem?.(abrir.dataset.casAbrir); return; }
  const opc = event.target.closest("[data-cas-opcoes]");
  if(opc){ irAoCatalogo(opc.dataset.casOpcoes.split(",").filter(Boolean), { titulo: opc.dataset.titulo, exato: true }); return; }
  const zoom = event.target.closest("[data-cas-zoom]");
  if(zoom){ window.catalogOpenPhotoZoom?.(zoom.dataset.casZoom, "Composição", zoom.querySelector("img")?.currentSrc); return; }
  const apagar = event.target.closest("[data-cas-apagar-img]");
  if(apagar){ apagarFoto(apagar); return; }
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

// Apaga a foto só da conversa (o que já foi adicionado ao projeto continua lá).
async function apagarFoto(botao){
  if(!confirm("Apagar esta foto da conversa? Se ela já foi adicionada ao projeto, continua lá.")) return;
  botao.disabled = true;
  try{
    await chamar("apagar_imagem", { mensagem_id: botao.dataset.casApagarImg });
    S.mensagens = S.mensagens.filter((m) => m.id !== botao.dataset.casApagarImg);
    pintar();
    ctx.notify({ title: "Foto apagada", message: "Saiu da conversa.", status: "done", duration: 3000 });
  }catch(error){
    botao.disabled = false;
    ctx.notify({ title: "Não foi possível apagar", message: error.message, status: "error" });
  }
}

async function limpar(){
  if(!S.mensagens.length) return;
  if(!confirm("Começar uma nova conversa? O que eu já sei sobre o seu gosto continua guardado.")) return;
  try{ await chamar("limpar", { projeto_id: projetoAtualId() }); S.mensagens = []; pintar(); }
  catch(error){ ctx.notify({ title: "Não foi possível limpar", message: error.message, status: "error" }); }
}

// ---------------------------------------------------------------------------------------------------------------
// Conversa
async function enviar(valor, { porAudio = false, arquivos = [] } = {}){
  if(!S.carregado || projetoAtualId() !== S.conversaDe) await carregarHistorico();
  const local = { papel: "user", conteudo: valor, anexos: [...(porAudio ? [{ tipo: "audio" }] : []), ...arquivos.map((a) => ({ tipo: "arquivo", nome: a.nome, mime: a.mime, url: a.preview, enviando: true }))] };
  S.mensagens.push(local);
  S.enviando = true; pintar(); statusTopo(arquivos.length ? "recebendo o arquivo…" : "digitando…");
  try{
    for(const a of arquivos) await subirArquivo(a);
    local.anexos = local.anexos.map((x) => (x.tipo === "arquivo" ? { ...x, enviando: false } : x));
    pintar(); statusTopo("digitando…");
    const data = await chamar("conversar", { mensagem: valor, por_audio: porAudio, arquivos: arquivos.map((a) => ({ path: a.path, mime: a.mime, nome: a.nome })), projeto: window.catalogAssistenteProjeto?.retrato() || null, modo: ctx.modoPedido ? "pedido" : "catalogo" });
    if(data?.pergunta) Object.assign(local, data.pergunta);
    if(data?.nome && data.nome !== S.nome){ S.nome = data.nome; atualizarNome(); }
    if(data?.mensagem) S.mensagens.push(data.mensagem);
    S.enviando = false; pintar(); statusTopo();
    await aplicarAcoes(data?.acoes || []);
    pintarLado();
    const anexos = data?.mensagem?.anexos || [];
    const res = { opcoes: anexos.find((x) => x.tipo === "opcoes"), itens: anexos.find((x) => x.tipo === "itens")?.itens?.map((i) => i.id) || [], circular: anexos.find((x) => x.tipo === "escolha")?.ids || [] };
    if(res.opcoes || res.itens.length || res.circular.length) mostrarResultado(res);
    if(!$("catalogAssistenteMini")?.hidden) miniTexto(data?.mensagem?.conteudo || "", true);
  }catch(error){
    S.enviando = false; statusTopo();
    local.anexos = (local.anexos || []).map((x) => ({ ...x, enviando: false }));
    S.mensagens.push({ papel: "assistant", conteudo: error.message, anexos: [] });
    pintar();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Arquivos (planta em PDF ou foto). Foto vira JPEG de até 2400 px (planta precisa de detalhe); PDF vai como está
// (até 20 MB). Sobe direto pro Storage com a URL assinada que o servidor dá; a conversa recebe só o caminho.
const MAX_ARQUIVO = 20 * 1024 * 1024;
function escolherArquivos(lista){
  for(const file of lista){
    if(S.pendentes.length >= 4){ ctx.notify({ title: "Até 4 arquivos por mensagem", status: "error", duration: 4000 }); break; }
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if(!pdf && !file.type.startsWith("image/")){ ctx.notify({ title: "Arquivo não aceito", message: "Mande a planta em PDF ou em foto.", status: "error" }); continue; }
    if(file.size > MAX_ARQUIVO){ ctx.notify({ title: "Arquivo grande demais", message: "O máximo é 20 MB.", status: "error" }); continue; }
    S.pendentes.push({ file, nome: file.name || (pdf ? "planta.pdf" : "foto.jpg"), mime: pdf ? "application/pdf" : "image/jpeg", pdf, preview: pdf ? "" : URL.createObjectURL(file) });
  }
  pintarPendentes();
  $("catalogAssistente")?.querySelector("[data-cas-input]")?.focus();
}
function pintarPendentes(){
  const el = $("catalogAssistente")?.querySelector("[data-cas-pend]");
  if(!el) return;
  el.hidden = !S.pendentes.length;
  el.innerHTML = S.pendentes.map((a, i) => `<span class="cas-pend">${a.pdf ? `<i class="cas-pdf-ico">PDF</i>` : `<img src="${esc(a.preview)}" alt="">`}<span>${esc(a.nome)}</span><button type="button" data-cas-tirar="${i}" aria-label="Tirar ${esc(a.nome)}">×</button></span>`).join("");
  S.ajustarForm?.();
}
async function subirArquivo(a){
  let blob = a.file;
  if(!a.pdf){
    try{ const dataUrl = await paraJpegDataUrl(URL.createObjectURL(a.file), 2400); blob = await (await fetch(dataUrl)).blob(); }
    catch{ throw new Error("Não consegui abrir essa foto. Tente tirar um print ou mandar em PDF."); }
  }
  const prep = await chamar("arquivo_upload", { mime: a.mime, tamanho: blob.size });
  const { error } = await ctx.supabase.storage.from("catalogo-assistente").uploadToSignedUrl(prep.path, prep.token, blob, { contentType: a.mime });
  if(error) throw new Error("Não consegui enviar o arquivo. Tente de novo.");
  a.path = prep.path; a.url = prep.url;
  return { path: prep.path, url: prep.url };
}

function statusTopo(texto = ""){
  const el = $("catalogAssistente")?.querySelector("[data-cas-status]");
  if(el) el.textContent = texto || (S.renderizando?.size ? "montando sua composição…" : "Consultora comercial · online");
}

async function aplicarAcoes(acoes){
  const projeto = window.catalogAssistenteProjeto;
  for(const acao of acoes){
    try{
      if(acao.tipo === "usar_projeto"){ await projeto?.usarProjeto(acao.projeto_id); if(!lig) await carregarHistorico(); }
      else if(acao.tipo === "atualizar_evento"){
        await projeto?.atualizarEvento?.(acao);
        ctx.notify({ title: "Dados do pedido atualizados", message: "Entrega, evento, coleta e local conferidos.", status: "done", duration: 3500 });
      }
      else if(acao.tipo === "quantidade"){
        const r = await projeto.quantidade(acao);
        const nome = ctx.findItem?.(acao.item_id)?.name || "Item";
        ctx.notify({ title: acao.quantidade ? "Pedido atualizado" : "Removido do pedido",
          message: acao.quantidade ? `${acao.quantidade}× ${nome} → ${r.ambiente}` : `${nome} saiu de ${r.ambiente}`,
          status: "done", duration: 4200, actionLabel: "Desfazer", onAction: r.desfazer });
      }
      else if(acao.tipo === "enviar_pedido") projeto?.enviarPedido();
      else if(acao.tipo === "ver_pedido"){
        // Versão final do pedido: a conversa encolhe pra barra pequena e a prévia abre por cima do catálogo.
        if(acao.abrir){ mostrarMini(true); if(!(await projeto?.verPedido?.(true))) ctx.notify({ title: "Nenhum pedido aberto", message: "Escolha ou crie um pedido primeiro.", status: "error" }); }
        else await projeto?.verPedido?.(false);
      }
      else if(acao.tipo === "renderizar") enfileirarRender(acao);
      else if(acao.tipo === "apagar_imagem"){ S.mensagens = S.mensagens.filter((m) => m.id !== acao.mensagem_id); pintar(); }
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
        if(lig && anexo) ligacaoAvisarImagem(anexo.url, acao.itens || []);
        if(!S.aberto){ S.naoLidas += 1; pintarBadge(); }
        if(!S.aberto) ctx.notify({ title: `${S.nome} mandou a foto da composição`, message: (acao.itens || []).join(" · "), status: "done", image: anexo?.url, actionLabel: "Ver", onAction: () => alternar(true) });
      }
    }catch(error){
      console.warn("Composição da assistente:", error);
      const motivo = /cr[eé]dito/i.test(error?.message || "") ? "Pra gerar a foto precisa de créditos de imagem." : "";
      try{ const data = await chamar("falha_imagem", { projeto_id: projetoAtualId(), mensagem: `Não consegui terminar a foto dessa composição agora. ${motivo} Quer que eu tente de novo?`.replace(/\s+/g, " ") }); if(data?.mensagem) S.mensagens.push(data.mensagem); }catch{}
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
    const barras = [...ondas.children], dados = new Uint8Array(analisador.frequencyBinCount), onda = new Uint8Array(analisador.fftSize);
    // Envio automático (pedido do usuário: "quero ter a opção de simplesmente parar de falar e a mensagem ser enviada"):
    // mede o volume da voz; os primeiros 400 ms calibram o ruído do ambiente. Depois que a pessoa FALOU (volume acima do
    // limiar por 250 ms), 1,5 s de silêncio envia sozinho. Sem fala nenhuma em 12 s, descarta. Os botões continuam valendo.
    const auto = form.querySelector("[data-cas-auto]");
    const vad = { ruido: 0, amostras: 0, falando: 0, falou: false, silencioDesde: 0, ultimo: performance.now() };
    const desenhar = () => {
      if(!gravacao) return;
      analisador.getByteFrequencyData(dados);
      barras.forEach((b, i) => { const v = dados[Math.floor(i * dados.length / barras.length / 1.6)] / 255; b.style.transform = `scaleY(${Math.max(.12, v)})`; });
      analisador.getByteTimeDomainData(onda);
      let soma = 0; for(const x of onda){ const d = (x - 128) / 128; soma += d * d; }
      const rms = Math.sqrt(soma / onda.length), agora = performance.now(), dt = agora - vad.ultimo, decorrido = Date.now() - gravacao.inicio;
      vad.ultimo = agora;
      if(decorrido < 400){ vad.ruido = (vad.ruido * vad.amostras + rms) / (vad.amostras + 1); vad.amostras++; }
      else{
        const limiar = Math.max(0.018, vad.ruido * 2.2 + 0.008);
        if(rms > limiar){ vad.falando += dt; vad.silencioDesde = 0; if(vad.falando > 250 && !vad.falou){ vad.falou = true; auto.textContent = "ouvindo…"; } }
        else{
          vad.falando = Math.max(0, vad.falando - dt);
          if(vad.falou){
            vad.silencioDesde ||= agora;
            const falta = 1500 - (agora - vad.silencioDesde);
            auto.textContent = falta < 1100 ? "enviando…" : "ouvindo…";
            if(falta <= 0){ pararGravacao(true); return; }
          }else if(decorrido > 12000){
            ctx.notify({ title: "Não ouvi nada", message: "Toque no microfone e fale de novo, um pouco mais perto.", status: "error", duration: 5000 });
            pararGravacao(false); return;
          }
        }
      }
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
    const auto = form.querySelector("[data-cas-auto]"); if(auto) auto.textContent = "envia quando você parar";
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

// ---------------------------------------------------------------------------------------------------------------
// Ligação (voz em tempo real, como um telefonema). O áudio vai direto do aparelho para a OpenAI por WebRTC (resposta em
// ~1 s, dá pra interromper a Helena falando); o servidor só entrega uma chave temporária já com as instruções e as
// ferramentas. Quando ela consulta o acervo ou mexe no pedido, a ferramenta roda no NOSSO servidor (ação "ferramenta"),
// com as mesmas regras da conversa por texto. No fim, a transcrição entra na conversa.
let lig = null;
const LIG_MAX_S = 20 * 60;
const tempoFmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function telaLigacao(){
  const el = $("catalogAssistente").querySelector("[data-cas-ligacao]");
  el.innerHTML = `
    <div class="cas-lig-topo"><span class="cas-lig-estado" data-lig-estado>Chamando…</span><span class="cas-lig-tempo" data-lig-tempo></span></div>
    <div class="cas-lig-centro">
      <div class="cas-lig-avatar" data-lig-avatar><span class="cas-lig-onda" aria-hidden="true"></span><span class="cas-lig-onda" aria-hidden="true"></span><span class="cas-avatar is-xl" aria-hidden="true">${esc(S.nome[0])}</span></div>
      <h2>${esc(S.nome)}</h2>
      <p class="cas-lig-quem">Consultora comercial</p>
      <p class="cas-lig-legenda" data-lig-legenda aria-live="polite"></p>
      <p class="cas-lig-voce" data-lig-voce></p>
    </div>
    <div class="cas-lig-itens" data-lig-itens hidden></div>
    <div class="cas-lig-botoes">
      <button type="button" class="cas-lig-btn is-interromper" data-lig-interromper hidden><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg></span><small>Interromper</small></button>
      <button type="button" class="cas-lig-btn" data-lig-mudo aria-pressed="false"><span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></span><small>Mudo</small></button>
      <button type="button" class="cas-lig-btn is-desligar" data-lig-desligar><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15.5c5-4.7 13-4.7 18 0l-2.4 2.6-3.4-1.3v-2.6a10 10 0 0 0-6.4 0v2.6l-3.4 1.3z"/></svg></span><small>Desligar</small></button>
      <button type="button" class="cas-lig-btn" data-lig-chat><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg></span><small>Conversa</small></button>
    </div>
    <audio data-lig-audio autoplay playsinline></audio>`;
  el.hidden = false;
  el.querySelector("[data-lig-desligar]").addEventListener("click", () => encerrarLigacao());
  el.querySelector("[data-lig-interromper]").addEventListener("click", interromperHelena);
  el.querySelector("[data-lig-mudo]").addEventListener("click", (event) => {
    if(!lig?.stream) return;
    lig.mudo = !lig.mudo;
    atualizarMicrofone();
    event.currentTarget.setAttribute("aria-pressed", String(lig.mudo));
    event.currentTarget.querySelector("small").textContent = lig.mudo ? "Mudo ligado" : "Mudo";
  });
  // "Conversa": esconde a tela da ligação (que continua) para ver as mensagens; o botão Ligar do topo vira "Voltar à ligação".
  el.querySelector("[data-lig-chat]").addEventListener("click", () => mostrarTelaLigacao(false));
  return el;
}
function mostrarTelaLigacao(ver){
  const painel = $("catalogAssistente");
  painel.querySelector("[data-cas-ligacao]").hidden = !ver;
  const b = painel.querySelector("[data-cas-ligar]");
  b.classList.toggle("em-ligacao", Boolean(lig));
  b.querySelector("span").textContent = lig ? (ver ? "Desligar" : "Voltar à ligação") : "Ligar";
  b.title = lig ? (ver ? "Encerrar a ligação" : "Voltar para a tela da ligação") : "Ligar para a Helena e conversar por voz";
  $("catalogAssistenteBotao")?.classList.toggle("em-ligacao", Boolean(lig));
}
function ligEstado(texto){ const el = $("catalogAssistente")?.querySelector("[data-lig-estado]"); if(el) el.textContent = texto; }
function ligLegenda(texto){
  const el = $("catalogAssistente")?.querySelector("[data-lig-legenda]");
  if(!el) return;
  const frases = String(texto || "").match(/[^.!?]+[.!?]*\s*/g) || [];
  let fim = frases.slice(-2).join("").trim();
  if(fim.length > 220) fim = "…" + fim.slice(-220).replace(/^\S*\s/, "");
  el.textContent = fim;
  miniTexto(texto);
}
function ligVoce(texto){ const el = $("catalogAssistente")?.querySelector("[data-lig-voce]"); if(el) el.textContent = texto ? `Você: ${texto}` : ""; }
function ligItens(itens){
  if(!lig || !itens?.length) return;
  for(const i of itens){ lig.itens = lig.itens.filter((x) => x.id !== i.id); lig.itens.unshift(i); }
  lig.itens = lig.itens.slice(0, 8);
  const el = $("catalogAssistente")?.querySelector("[data-lig-itens]");
  if(!el) return;
  el.hidden = false;
  el.closest("[data-cas-ligacao]")?.classList.add("tem-itens");
  el.innerHTML = lig.itens.map((i) => i.tipo === "local" ? localHtml(i) : i.tipo === "imagem"
    ? `<figure class="cas-lig-foto"><button type="button" class="cas-foto-ver" data-cas-zoom="${esc(i.url)}" aria-label="Ver a composição"><img src="${esc(miniatura(i.url, 520))}" alt="Composição"></button></figure>`
    : itemHtml(i)).join("");
}

async function iniciarLigacao(){
  if(lig) return;
  if(gravacao) pararGravacao(false);
  if(!S.carregado) await carregarHistorico();
  lig = { estado: "chamando", falas: [], ordem: [], mudo: false, itens: [], feitas: new Set(), respondendo: false, avisos: [], inicio: 0, legenda: "" };
  const atual = lig;
  telaLigacao(); mostrarTelaLigacao(true);
  try{
    ligEstado("Chamando…");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if(lig !== atual){ stream.getTracks().forEach((t) => t.stop()); return; }
    lig.stream = stream;
    lig.elaFalando = true; atualizarMicrofone(); // começa fechado: o primeiro som é o cumprimento dela
    iniciarDetectorDeFala(stream);
    const data = await chamar("ligacao_iniciar", { projeto: window.catalogAssistenteProjeto?.retrato() || null, modo: ctx.modoPedido ? "pedido" : "catalogo" });
    if(lig !== atual) return;
    const pc = new RTCPeerConnection();
    lig.pc = pc;
    const audio = $("catalogAssistente").querySelector("[data-lig-audio]");
    pc.ontrack = (event) => { audio.srcObject = event.streams[0]; audio.play?.().catch(() => {}); lig.temAudio = true; };
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    const dc = pc.createDataChannel("oai-events");
    lig.dc = dc;
    dc.addEventListener("open", () => {
      if(lig !== atual) return;
      lig.estado = "ligado"; lig.inicio = Date.now();
      ligEstado("Em ligação"); statusTopo("em ligação");
      lig.relogio = setInterval(() => {
        const s = (Date.now() - lig.inicio) / 1000;
        const el = $("catalogAssistente").querySelector("[data-lig-tempo]"); if(el) el.textContent = tempoFmt(s);
        if(s >= LIG_MAX_S) encerrarLigacao("A ligação chegou ao limite de 20 minutos. O que conversamos já está na conversa.");
      }, 1000);
      // Ela atende: só o cumprimento (sem ferramentas nem retomar assunto antigo de cara).
      // Chiado no começo: só cumprimenta quando a conexão de áudio já está estável (conectada, com o áudio dela chegando)
      // e mais um respiro — falar no instante em que o canal abre fazia os primeiros pedaços chegarem picotados.
      const pronto = () => lig === atual && pc.connectionState === "connected" && lig.temAudio;
      const t0 = Date.now();
      const esperar = () => {
        if(lig !== atual) return;
        if(pronto() || Date.now() - t0 > 5000) setTimeout(() => { if(lig === atual) enviarEvento({ type: "response.create", response: { tool_choice: "none" } }); }, 700);
        else setTimeout(esperar, 100);
      };
      esperar();
      // Garantia: se o cumprimento não chegar, o microfone abre mesmo assim.
      lig.timerMic = setTimeout(() => { if(lig === atual && !lig.falouAlgo){ lig.atendeu = true; lig.elaFalando = false; atualizarMicrofone(); } }, 12000);
    });
    dc.addEventListener("message", (event) => { try{ aoEventoLigacao(JSON.parse(event.data)); }catch(error){ console.warn("ligação:", error); } });
    pc.addEventListener("connectionstatechange", () => {
      if(lig === atual && ["failed", "closed"].includes(pc.connectionState)) encerrarLigacao("A ligação caiu. O que conversamos já está na conversa.");
    });
    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    const r = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", body: oferta.sdp, headers: { Authorization: `Bearer ${data.chave}`, "Content-Type": "application/sdp" } });
    if(!r.ok) throw new Error("Não consegui completar a ligação agora. Tente de novo em instantes.");
    if(lig !== atual) return;
    await pc.setRemoteDescription({ type: "answer", sdp: await r.text() });
  }catch(error){
    if(lig !== atual) return;
    const negado = error?.name === "NotAllowedError" || error?.name === "SecurityError";
    encerrarLigacao(negado ? "Para ligar, permita o uso do microfone neste navegador." : (error.message || "Não consegui completar a ligação."));
  }
}

// Eco: a voz dela sai pela caixa de som e volta pelo microfone, e o servidor achava que era a pessoa falando (ela
// "respondia a si mesma"). Por isso o microfone que vai pro servidor fica FECHADO enquanto ela fala. Pra dar pra
// interromper falando (pedido do usuário), o navegador escuta uma CÓPIA do microfone (só o microfone, nunca o áudio dela,
// que dava chiado) e compara com o nível do eco dela: som bem mais alto que o eco por ~0,3 s = a pessoa falando de
// verdade → corta a fala dela e abre o microfone. Botão "Interromper" continua como reserva.
function atualizarMicrofone(){
  if(!lig?.stream) return;
  const aberto = !lig.mudo && !lig.elaFalando;
  lig.stream.getAudioTracks().forEach((t) => { t.enabled = aberto; });
  const b = $("catalogAssistente")?.querySelector("[data-lig-interromper]");
  if(b) b.hidden = !lig.elaFalando;
  pintarMini();
}
function elaFalando(sim){
  if(!lig) return;
  clearTimeout(lig.timerMic);
  if(sim){ lig.elaFalando = true; atualizarMicrofone(); return; }
  // Uma folga curta: o fim do áudio ainda está saindo da caixa quando o aviso chega.
  lig.timerMic = setTimeout(() => { if(lig){ if(lig.falouAlgo) lig.atendeu = true; lig.elaFalando = false; atualizarMicrofone(); } }, 450);
}
function rampaDeVolume(){
  const audio = $("catalogAssistente")?.querySelector("[data-lig-audio]");
  if(!audio) return;
  try{
    audio.volume = .15;
    const t0 = performance.now();
    const passo = () => { const k = Math.min(1, (performance.now() - t0) / 260); audio.volume = .15 + .85 * k; if(k < 1) requestAnimationFrame(passo); };
    requestAnimationFrame(passo);
  }catch{}
}
// ---------------------------------------------------------------------------------------------------------------
// Detector de "furar a fila": mede o volume (RMS) de uma cópia do microfone a cada 50 ms. Enquanto ela fala, aprende o
// nível do eco (média móvel lenta dos primeiros instantes e dos trechos baixos) e dispara quando o som passa de
// ~3x esse nível (e de um piso fixo) por 6 leituras seguidas. Ajustes pra calibrar com a voz de verdade: DETECTOR.
const DETECTOR = { intervalo: 50, aprender: 400, fator: 3, piso: 0.03, seguidas: 6 };
function iniciarDetectorDeFala(stream){
  try{
    const faixa = stream.getAudioTracks()[0]?.clone();
    if(!faixa) return;
    faixa.enabled = true; // a cópia herda o "fechado" do original (o microfone começa fechado no cumprimento)
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new Ctx();
    audioCtx.resume?.().catch(() => {});
    const fonte = audioCtx.createMediaStreamSource(new MediaStream([faixa]));
    const analisador = audioCtx.createAnalyser();
    analisador.fftSize = 1024;
    fonte.connect(analisador);
    const buf = new Float32Array(analisador.fftSize);
    const det = { faixa, audioCtx, eco: 0, inicioFala: 0, acima: 0 };
    det.timer = setInterval(() => {
      if(!lig || lig.detector !== det) return;
      if(audioCtx.state === "suspended") audioCtx.resume?.().catch(() => {});
      analisador.getFloatTimeDomainData(buf);
      let soma = 0; for(let i = 0; i < buf.length; i++) soma += buf[i] * buf[i];
      const rms = Math.sqrt(soma / buf.length);
      if(window.__casDebug) window.__casDebug.push([Math.round(performance.now()), +rms.toFixed(4), +det.eco.toFixed(4), lig.elaFalando ? 1 : 0]); // depuração: definir window.__casDebug = [] no console pra calibrar
      if(!lig.elaFalando || lig.mudo){ det.inicioFala = 0; det.acima = 0; return; }
      const agora = performance.now();
      if(!det.inicioFala){ det.inicioFala = agora; det.eco = rms; return; }
      const limite = Math.max(DETECTOR.piso, det.eco * DETECTOR.fator);
      if(agora - det.inicioFala < DETECTOR.aprender){ det.eco = Math.max(det.eco * 0.7 + rms * 0.3, rms * 0.6); return; }
      if(rms > limite){
        if(++det.acima >= DETECTOR.seguidas){ det.acima = 0; det.inicioFala = 0; interromperHelena(); }
      }else{
        det.acima = 0;
        det.eco = det.eco * 0.95 + rms * 0.05; // o eco acompanha a voz dela, que sobe e desce
      }
    }, DETECTOR.intervalo);
    lig.detector = det;
  }catch(error){ console.warn("detector de fala:", error); }
}
function pararDetectorDeFala(alvo){
  const det = alvo?.detector;
  if(!det) return;
  clearInterval(det.timer);
  try{ det.faixa.stop(); }catch{}
  try{ det.audioCtx.close(); }catch{}
  alvo.detector = null;
}

function interromperHelena(){
  if(!lig) return;
  enviarEvento({ type: "response.cancel" });
  enviarEvento({ type: "output_audio_buffer.clear" });
  clearTimeout(lig.timerMic);
  lig.elaFalando = false; atualizarMicrofone();
  ligAvatar("falando", false); ligEstado("Pode falar");
}

function enviarEvento(evento){ if(lig?.dc?.readyState === "open") lig.dc.send(JSON.stringify(evento)); }

// Falas na ordem em que entraram na conversa (a transcrição da pessoa pode chegar depois da resposta começar).
function falaDoItem(id, papel){
  let f = lig.falas.find((x) => x.id === id);
  if(!f){ f = { id, papel, texto: "" }; lig.falas.push(f); }
  return f;
}

async function aoEventoLigacao(ev){
  if(!lig) return;
  switch(ev.type){
    case "conversation.item.added": case "conversation.item.created": {
      const it = ev.item;
      if(it?.type === "message" && (it.role === "user" || it.role === "assistant")) falaDoItem(it.id, it.role);
      break;
    }
    case "input_audio_buffer.speech_started": ligEstado("Ouvindo você…"); ligVoce("…"); ligAvatar("ouvindo", true); break;
    case "input_audio_buffer.speech_stopped": ligEstado("Em ligação"); ligAvatar("ouvindo", false); break;
    case "output_audio_buffer.started": if(!lig.falouAlgo) rampaDeVolume(); lig.falouAlgo = true; ligAvatar("falando", true); elaFalando(true); break;
    case "output_audio_buffer.stopped": case "output_audio_buffer.cleared": ligAvatar("falando", false); elaFalando(false); break;
    case "conversation.item.input_audio_transcription.completed": {
      const t = String(ev.transcript || "").trim();
      if(!t || /^(A consultora se chama|Conversa de decoradora)/i.test(t)) break;
      // Eco: o microfone pegou a própria voz dela (caixa de som). Sem isso ela "responde a si mesma":
      // cancela a resposta que o eco disparou e tira a fala falsa da conversa.
      if(ehEco(t)){
        enviarEvento({ type: "response.cancel" });
        enviarEvento({ type: "conversation.item.delete", item_id: ev.item_id });
        lig.falas = lig.falas.filter((f) => f.id !== ev.item_id);
        ligVoce("");
        break;
      }
      falaDoItem(ev.item_id, "user").texto = t; ligVoce(t);
      break;
    }
    case "response.created": lig.respondendo = true; lig.legenda = ""; break;
    case "response.output_audio_transcript.delta": {
      lig.legenda += ev.delta || ""; ligLegenda(lig.legenda);
      if(ev.item_id){ const f = falaDoItem(ev.item_id, "assistant"); f.parcial = (f.parcial || "") + (ev.delta || ""); }
      break;
    }
    case "response.output_audio_transcript.done": {
      const t = String(ev.transcript || lig.legenda).trim();
      if(t){ falaDoItem(ev.item_id, "assistant").texto = t; ligLegenda(t); }
      break;
    }
    case "response.done": {
      lig.respondendo = false;
      const chamadas = (ev.response?.output || []).filter((o) => o.type === "function_call" && !lig.feitas.has(o.call_id));
      if(chamadas.length){ await executarFerramentas(chamadas); break; }
      if(lig.avisos.length){ const a = lig.avisos.shift(); enviarAviso(a); }
      break;
    }
    case "error": console.warn("ligação (OpenAI):", ev.error); break;
  }
}

// A "fala da pessoa" é quase toda feita de palavras que a Helena acabou de dizer? Então é eco, não pergunta.
function ehEco(texto){
  const palavras = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) || [];
  const dela = new Set(lig.falas.filter((f) => f.papel === "assistant").slice(-2).flatMap((f) => palavras(f.texto || f.parcial)));
  const p = palavras(texto).filter((w) => w.length > 2);
  if(p.length < 4 || !dela.size) return false;
  return p.filter((w) => dela.has(w)).length / p.length >= 0.85;
}

async function executarFerramentas(chamadas){
  const atual = lig;
  chamadas.forEach((c) => lig.feitas.add(c.call_id));
  ligEstado("Consultando…");
  // Uma de cada vez: a próxima pode depender do pedido que a anterior acabou de mudar.
  for(const c of chamadas){
    let saida = "";
    try{
      const data = await chamar("ferramenta", { nome: c.name, args: c.arguments || "{}", projeto: window.catalogAssistenteProjeto?.retrato() || null, modo: ctx.modoPedido ? "pedido" : "catalogo" });
      saida = data?.resultado || "{}";
      await aplicarAcoes(data?.acoes || []);
      pintarLado();
      ligItens(data?.itens);
      mostrarResultado({ opcoes: data?.opcoes, itens: (data?.itens || []).map((i) => i.id), circular: data?.circular || [] });
      ligItens((data?.locais || []).map((l) => ({ ...l, id: "local:" + l.ref, tipo: "local" })));
    }catch(error){ saida = JSON.stringify({ erro: error.message || "Falha na ferramenta" }); }
    if(lig !== atual) return;
    enviarEvento({ type: "conversation.item.create", item: { type: "function_call_output", call_id: c.call_id, output: saida } });
  }
  ligEstado("Em ligação");
  enviarEvento({ type: "response.create" });
}

// A foto da composição ficou pronta durante a ligação: aparece na tela e ela comenta (sem interromper uma fala dela).
function ligacaoAvisarImagem(url, itens){
  ligItens([{ id: `img:${url}`, tipo: "imagem", url }]);
  const aviso = `[Aviso do sistema: a fotografia da composição com ${itens.join(", ") || "as peças"} ficou pronta e já está aparecendo na tela da pessoa e na conversa. Avise com naturalidade, em uma frase, e pergunte o que ela achou.]`;
  if(lig.respondendo) lig.avisos.push(aviso); else enviarAviso(aviso);
}
function enviarAviso(texto){
  enviarEvento({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: texto }] } });
  enviarEvento({ type: "response.create" });
}

// O avatar "respira" enquanto ela fala e o anel acende quando você fala — pelos avisos da própria ligação.
// Antes media o volume do áudio (Web Audio); no celular isso, com o microfone aberto, deixava a ligação chiando.
function ligAvatar(classe, ligado){ $("catalogAssistente")?.querySelector("[data-lig-avatar]")?.classList.toggle(classe, ligado); }

async function encerrarLigacao(motivo = ""){
  const atual = lig;
  if(!atual) return;
  lig = null;
  clearInterval(atual.relogio);
  try{ atual.dc?.close(); }catch{}
  try{ atual.pc?.getSenders().forEach((s) => s.track?.stop()); atual.pc?.close(); }catch{}
  pararDetectorDeFala(atual);
  atual.stream?.getTracks().forEach((t) => t.stop());
  const painel = $("catalogAssistente");
  const audio = painel.querySelector("[data-lig-audio]"); if(audio) audio.srcObject = null;
  painel.querySelector("[data-cas-ligacao]").innerHTML = "";
  mostrarTelaLigacao(false);
  pintarMini();
  statusTopo();
  if(motivo) ctx.notify({ title: atual.inicio ? "Ligação encerrada" : "Não foi possível ligar", message: motivo, status: atual.inicio ? "done" : "error", duration: 6000 });
  const falas = atual.falas.map((f) => ({ papel: f.papel, texto: (f.texto || f.parcial || "").trim() })).filter((f) => f.texto);
  if(!atual.inicio && !falas.length) return;
  const segundos = atual.inicio ? Math.round((Date.now() - atual.inicio) / 1000) : 0;
  try{
    const data = await chamar("ligacao_registrar", { falas, segundos, projeto_id: window.catalogAssistenteProjeto?.retrato()?.id || null });
    if(Array.isArray(data?.mensagens)) S.mensagens.push(...data.mensagens);
  }catch(error){
    falas.forEach((f) => S.mensagens.push({ papel: f.papel, conteudo: f.texto, anexos: [{ tipo: f.papel === "user" ? "voz" : "voz_helena" }] }));
  }
  pintar();
}
window.addEventListener("pagehide", () => { if(lig) encerrarLigacao(); });

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
