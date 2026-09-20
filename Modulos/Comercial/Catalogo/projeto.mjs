// Apresentação do projeto de um evento (pedido explícito do usuário: "no final quero que saia um projeto em arquivo e landing page
// bonito e apresentável pro cliente"). Três jeitos de abrir esta mesma página:
//   • LINK PÚBLICO (sem parâmetro de modo): o casal abre com a senha de 6 números; toda a leitura vem de UMA função do banco,
//     projeto_publico(slug, pin), que confere a senha (5 erros bloqueiam por 15 minutos), devolve nome/foto/medidas dos itens, as
//     renderizações e o LAYOUT escolhido pro projeto — NUNCA preço (decisão do usuário: "sempre escondidos").
//   • ?modo=previa: o decorador gera o PDF / testa layouts sem compartilhar nada. Os dados chegam do catálogo (a janela que abriu esta
//     por window.open) via postMessage — só aceita mensagem da MESMA origem e da janela que abriu; uma barra no topo troca de layout
//     na hora e tem o botão "Gerar PDF". `&pdf=1` já abre a caixa de impressão sozinho.
//   • ?modo=editor: a pré-visualização ao vivo dentro do editor de layouts (iframe): recebe os dados uma vez e cada mudança de opção.
// O layout (projeto-layout.mjs) decide capa, cores, fonte, renderizações, móveis, rodapé e formato do PDF. "Gerar PDF" é a impressão
// do navegador ("Salvar como PDF") com um @media print próprio: não há biblioteca de PDF no projeto, e o resultado sai idêntico à página.
import { FONTES, normalizarLayout, temaDaPagina, variaveisCss, regraPagina } from "./projeto-layout.mjs?v=20260921-mais-opcoes";

const supabase = window.supabaseClient;
const app = document.getElementById("app");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const escapeAttr = (value) => escapeHtml(value).replace(/`/g, "&#96;");

function otimizarFoto(url, width, quality = 78){
  if(!url || typeof url !== "string" || !width) return url;
  const marcador = "/storage/v1/object/public/";
  const indice = url.indexOf(marcador);
  if(indice === -1) return url;
  const base = url.slice(0, indice);
  const caminho = url.slice(indice + marcador.length);
  const separador = caminho.includes("?") ? "&" : "?";
  return `${base}/storage/v1/render/image/public/${caminho}${separador}width=${width}&quality=${quality}&resize=contain`;
}

const params = new URLSearchParams(location.search);
const slug = (params.get("p") || "").trim();
const modo = ["previa", "editor"].includes(params.get("modo")) ? params.get("modo") : "";
const chavePin = `projeto_pin:${slug}`;
// Estado da página: os dados do projeto e QUAL layout está valendo agora (o do banco, o escolhido na barra da pré-visualização ou o
// rascunho que o editor manda a cada mudança).
const estado = { payload: null, layouts: [], layoutId: undefined, rascunho: null, primeira: true };

function dataLonga(iso){
  const [y, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}
function medidas(item){
  const valores = [item.largura, item.altura, item.profundidade].map((v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) : null);
  return valores.every((v) => v === null) ? "" : valores.map((v) => v ?? "–").join(" × ") + " cm";
}

function telaMensagem(titulo, texto){
  app.innerHTML = `<section class="pj-gate"><div class="pj-gate-card"><span class="pj-eyebrow">Apresentação de projeto</span><h1>${escapeHtml(titulo)}</h1><p>${escapeHtml(texto)}</p></div></section>`;
}

function telaSenha(mensagem = ""){
  app.innerHTML = `<section class="pj-gate"><form class="pj-gate-card" id="pjGate" novalidate>
      <span class="pj-eyebrow">Projeto exclusivo</span>
      <h1>Digite a senha de acesso</h1>
      <p>A senha de 6 números foi enviada junto com o link pelo seu decorador.</p>
      <label class="pj-sr" for="pjPin">Senha de 6 números</label>
      <input id="pjPin" class="pj-pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" autofocus>
      <button type="submit" class="pj-btn">Abrir projeto</button>
      <small class="pj-gate-error" id="pjGateError" role="alert">${escapeHtml(mensagem)}</small>
    </form></section>`;
  const form = document.getElementById("pjGate"), input = document.getElementById("pjPin");
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
    if(input.value.length === 6) form.requestSubmit();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if(input.value.length !== 6){ document.getElementById("pjGateError").textContent = "A senha tem 6 números."; return; }
    input.disabled = true;
    await abrir(input.value, true);
  });
}

async function abrir(pin, viaFormulario){
  let resposta;
  try{
    const { data, error } = await supabase.rpc("projeto_publico", { p_slug: slug, p_pin: pin });
    if(error) throw error;
    resposta = data;
  }catch{
    if(viaFormulario) telaSenha("Não foi possível conectar. Verifique a internet e tente novamente.");
    else telaMensagem("Não foi possível abrir", "Verifique a internet e recarregue a página.");
    return;
  }
  if(resposta?.ok){
    try{ sessionStorage.setItem(chavePin, pin); }catch{}
    receberDados(resposta);
    return;
  }
  try{ sessionStorage.removeItem(chavePin); }catch{}
  if(resposta?.erro === "nao_encontrado") telaMensagem("Este link não está disponível", "O projeto pode ter sido despublicado. Peça um novo link ao seu decorador.");
  else if(resposta?.erro === "bloqueado") telaMensagem("Acesso temporariamente bloqueado", "Houve muitas tentativas com senha incorreta. Aguarde alguns minutos e tente de novo.");
  else telaSenha(viaFormulario ? "Senha incorreta. Confira e tente novamente." : "");
}

// ---------------------------------------------------------------------------------------------------------------
// Layout em vigor
function layoutAtual(){
  if(estado.rascunho) return normalizarLayout(estado.rascunho);
  if(estado.layoutId !== undefined){
    const escolhido = estado.layouts.find((l) => String(l.id) === String(estado.layoutId));
    return normalizarLayout(escolhido ? escolhido.config : null);   // "" ou id desconhecido = padrão do sistema
  }
  return normalizarLayout(estado.payload?.layout);
}

// Vars e ajustes de página que dependem do layout (tudo sai de variaveisCss() em projeto-layout.mjs: tabelas fixas + cores já validadas).
// A orientação/papel/margem do PDF só se resolvem com uma regra @page — por isso a <style> própria.
function aplicarTema(layout, decorador){
  const fonte = FONTES[layout.fonte];
  const raiz = document.documentElement.style;
  Object.entries(variaveisCss(layout, decorador)).forEach(([nome, valor]) => raiz.setProperty(nome, valor));
  let link = document.getElementById("pjFonte");
  const href = `https://fonts.googleapis.com/css2?${fonte.google}&display=swap`;
  if(!link){ link = document.createElement("link"); link.id = "pjFonte"; link.rel = "stylesheet"; document.head.appendChild(link); }
  if(link.getAttribute("href") !== href) link.setAttribute("href", href);
  let pagina = document.getElementById("pjPagina");
  if(!pagina){ pagina = document.createElement("style"); pagina.id = "pjPagina"; document.head.appendChild(pagina); }
  pagina.textContent = regraPagina(layout);
}

// ---------------------------------------------------------------------------------------------------------------
function renderizar(){
  const { projeto, itens, decorador, empresa } = estado.payload;
  const layout = layoutAtual();
  aplicarTema(layout, decorador);
  const tema = temaDaPagina(layout, decorador);
  const rolagem = window.scrollY;

  const catalogo = new Map((itens || []).map((item) => [String(item.id), item]));
  const ambientes = (projeto.ambientes || []).map((amb, indice) => ({
    ...amb, indice,
    linhas: (amb.itens || []).map((linha) => ({ item: catalogo.get(String(linha.item_id)), quantidade: Number(linha.quantidade) || 1 })).filter((linha) => linha.item),
    renders: amb.renders || [],
  })).filter((amb) => amb.linhas.length || amb.renders.length || (layout.ambientes.notas && (amb.notas || "").trim()));

  const marca = decorador?.nome || empresa?.nome || "";
  const logo = decorador?.logo_url || empresa?.logo_url || "";
  const primeiraRender = ambientes.flatMap((amb) => amb.renders).find((render) => render.url)?.url || "";
  const fotoCasal = projeto.foto_casal || "";
  const c = layout.capa, pg = layout.pagina, a = layout.ambientes, m = layout.moveis, r = layout.rodape;
  document.title = `${projeto.noivos} — Projeto do evento`;

  // Foto da capa: "foto" usa a 1ª renderização de fundo; "lateral" usa a renderização (ou, sem ela, a foto dos noivos) ao lado do texto.
  const fundoFoto = c.estilo === "foto" ? primeiraRender : "";
  const fotoLateral = c.estilo === "lateral" ? (primeiraRender || fotoCasal) : "";
  const circuloCasal = c.mostrarFotoCasal && fotoCasal && !(c.estilo === "lateral" && fotoLateral === fotoCasal);
  const escuro = Boolean(fundoFoto) || tema.capaEscura;   // texto branco sobre foto ou sobre fundo escuro (a cor de fundo pode ser qualquer uma)

  const totalItens = ambientes.reduce((soma, amb) => soma + amb.linhas.reduce((s, l) => s + l.quantidade, 0), 0);
  const contato = r.contato
    ? [decorador?.telefone ? `<a href="tel:${escapeAttr(String(decorador.telefone).replace(/[^\d+]/g, ""))}">${escapeHtml(decorador.telefone)}</a>` : "", decorador?.email ? `<a href="mailto:${escapeAttr(decorador.email)}">${escapeHtml(decorador.email)}</a>` : ""].filter(Boolean).join("<span aria-hidden=\"true\"> · </span>")
    : "";

  const quantidade = (quantidade, posicao) => `<b class="pj-qty" data-pos="${posicao}" aria-label="Quantidade">× ${quantidade}</b>`;
  const cartaoMovel = ({ item, quantidade: qtd }) => `
    <article class="pj-piece">
      <div class="pj-piece-photo">${item.foto_url ? `<img src="${escapeAttr(otimizarFoto(item.foto_url, 560))}" alt="${escapeAttr(item.nome)}" loading="lazy" decoding="async">` : ""}</div>
      <div class="pj-piece-body">
        <strong>${escapeHtml(item.nome || "Item")}</strong>
        ${m.quantidade && m.posicaoQuantidade === "nome" ? quantidade(qtd, "nome") : ""}
        ${m.medidas && medidas(item) ? `<span>${escapeHtml(medidas(item))}</span>` : ""}
        ${m.materialCor && [item.material, item.cor].filter(Boolean).length ? `<small>${escapeHtml([item.material, item.cor].filter(Boolean).join(" · "))}</small>` : ""}
      </div>
      ${m.quantidade && m.posicaoQuantidade === "selo" ? quantidade(qtd, "selo") : ""}
    </article>`;

  const rendersDoAmbiente = (amb, i) => amb.renders.length ? `<div class="pj-renders pj-renders-${a.renders === "grade" ? "grade" : Math.min(amb.renders.length, 3)}">${amb.renders.map((render, n) => `<figure class="pj-render${n === 0 ? " is-first" : ""}"><img src="${escapeAttr(otimizarFoto(render.url, n === 0 && a.renders === "destaque" ? 1800 : 1000, 80))}" alt="Renderização — ${escapeAttr(amb.nome)}" loading="${i === 0 && n === 0 ? "eager" : "lazy"}" decoding="async"${pg.ampliarFotos ? ` data-lightbox="${escapeAttr(render.url)}"` : ""}></figure>`).join("")}</div>` : "";
  const moveisDoAmbiente = (amb) => amb.linhas.length ? `<div class="pj-furniture">${a.tituloMoveis ? `<h3>${escapeHtml(a.tituloMoveis)}</h3>` : ""}<div class="pj-grid">${amb.linhas.map(cartaoMovel).join("")}</div></div>` : "";

  const raizAttrs = {
    modo, capa: c.estilo, alinhamento: c.alinhamento, fundo: c.fundo, moveis: m.estilo, renders: a.renders,
    pagina: a.umaPorPagina ? "uma" : "corrida", orientacao: layout.pdf.orientacao, "capa-pagina": layout.pdf.capaPaginaInteira ? "cheia" : "corrida",
    nav: pg.navegacao, "nav-estilo": pg.navegacaoEstilo, divisoria: pg.divisoria, efeito: pg.efeitoFotos ? "1" : "0",
    rcols: String(a.colunasFotos), ordem: a.ordem, "amb-alin": a.alinhamento, "amb-caixa": a.caixaTitulo,
    casal: c.formatoFotoCasal, logopos: c.posicaoLogo, moldura: c.moldura ? "1" : "0", "nome-caixa": c.caixaNome,
    selo: m.estiloSelo, "mov-efeito": m.efeito ? "1" : "0", "mov-alin": m.alinhamentoTexto, "mov-caixa": m.caixaNome,
    "mov-ajuste": m.ajusteFoto, "mov-foto": m.fundoFoto, msg: r.italico ? "italico" : "normal",
  };
  const dataAttrs = Object.entries(raizAttrs).map(([nome, valor]) => `data-${nome}="${escapeAttr(valor)}"`).join(" ");

  const listaNav = pg.navegacao !== "escondida" && ambientes.length;
  const botaoPdf = modo !== "previa" && pg.mostrarBotaoPdf;
  const nav = listaNav || botaoPdf ? `<nav class="pj-nav" aria-label="Ambientes">
      ${listaNav ? `<div class="pj-nav-list">${ambientes.map((amb, i) => `<a href="#amb-${i}">${escapeHtml(amb.nome)}</a>`).join("")}</div>` : ""}
      ${botaoPdf ? `<button type="button" class="pj-btn pj-btn-outline" id="pjPdf">Baixar PDF</button>` : ""}
    </nav>` : "";

  app.innerHTML = `
  <div class="pj-root" ${dataAttrs}>
    ${modo === "previa" ? `<div class="pj-toolbar" role="toolbar" aria-label="Pré-visualização">
      <span class="pj-toolbar-titulo">Pré-visualização</span>
      <label class="pj-toolbar-campo"><span>Layout</span><select id="pjLayoutSelect">
        <option value="">Padrão do sistema</option>
        ${estado.layouts.map((l) => `<option value="${escapeAttr(l.id)}"${String(l.id) === String(estado.layoutId) ? " selected" : ""}>${escapeHtml(l.nome)}${l.padrao ? " (padrão)" : ""}</option>`).join("")}
      </select></label>
      <button type="button" class="pj-btn pj-btn-toolbar" id="pjPdf">Gerar PDF</button>
    </div>` : ""}
    <header class="pj-cover${fundoFoto ? " has-photo" : ""}${escuro ? " is-dark" : ""}">
      ${fundoFoto ? `<img class="pj-cover-photo" src="${escapeAttr(otimizarFoto(fundoFoto, 1920, 80))}" alt="" fetchpriority="high">` : ""}
      <div class="pj-cover-shade"></div>
      ${c.moldura ? `<span class="pj-cover-frame" aria-hidden="true"></span>` : ""}
      <div class="pj-cover-main">
        <div class="pj-cover-top">${c.mostrarLogo ? (logo ? `<img class="pj-logo" src="${escapeAttr(otimizarFoto(logo, 400))}" alt="${escapeAttr(marca)}">` : `<span class="pj-brand">${escapeHtml(marca)}</span>`) : ""}</div>
        <div class="pj-cover-body">
          ${circuloCasal ? `<div class="pj-couple"><img src="${escapeAttr(otimizarFoto(fotoCasal, 520, 82))}" alt="${escapeAttr(projeto.noivos)}"></div>` : ""}
          ${c.textoAbertura ? `<span class="pj-eyebrow">${escapeHtml(c.textoAbertura)}</span>` : ""}
          <h1>${escapeHtml(projeto.noivos)}</h1>
          ${c.linhaFina ? `<div class="pj-cover-rule" aria-hidden="true"></div>` : ""}
          ${c.mostrarData ? `<p class="pj-cover-date">${escapeHtml(dataLonga(projeto.data_evento))}</p>` : ""}
          ${c.mostrarLocal ? `<p class="pj-cover-place">${escapeHtml(projeto.local_evento)}</p>` : ""}
          ${c.subtitulo ? `<p class="pj-cover-sub">${escapeHtml(c.subtitulo)}</p>` : ""}
        </div>
        ${c.mostrarRolagem ? `<a class="pj-scroll" href="#pjConteudo" aria-label="Ver o projeto"><span>Ver o projeto</span><i aria-hidden="true"></i></a>` : ""}
      </div>
      ${c.estilo === "lateral" ? `<div class="pj-cover-media">${fotoLateral ? `<img src="${escapeAttr(otimizarFoto(fotoLateral, 1400, 80))}" alt="" fetchpriority="high">` : ""}</div>` : ""}
    </header>
    ${nav}
    <main id="pjConteudo" class="pj-content">
      ${layout.resumo ? `<section class="pj-intro"><p>${ambientes.length ? `${ambientes.length} ${ambientes.length === 1 ? "ambiente" : "ambientes"}${totalItens ? ` · ${totalItens} ${totalItens === 1 ? "peça" : "peças"} selecionadas` : ""}` : "Projeto em preparação"}</p></section>` : ""}
      ${ambientes.map((amb, i) => {
        const pecas = amb.linhas.reduce((s, l) => s + l.quantidade, 0);
        const blocos = [rendersDoAmbiente(amb, i), moveisDoAmbiente(amb)];
        if(a.ordem === "moveis") blocos.reverse();
        return `
      <section class="pj-amb" id="amb-${i}">
        <header class="pj-amb-head">${a.numeracao ? `<span class="pj-amb-num">${String(i + 1).padStart(2, "0")}</span>` : ""}<h2>${escapeHtml(amb.nome)}</h2>${a.contagem && pecas ? `<span class="pj-amb-count">${pecas} ${pecas === 1 ? "peça" : "peças"}</span>` : ""}</header>
        ${a.notas && (amb.notas || "").trim() ? `<p class="pj-amb-notes">${escapeHtml(amb.notas).replace(/\n/g, "<br>")}</p>` : ""}
        ${blocos.join("")}
      </section>`;
      }).join("")}
    </main>
    ${r.mostrar ? `<footer class="pj-footer">
      ${logo && r.mostrarLogo ? `<img class="pj-logo" src="${escapeAttr(otimizarFoto(logo, 400))}" alt="${escapeAttr(marca)}">` : ""}
      ${r.mensagem ? `<p class="pj-footer-thanks">${escapeHtml(r.mensagem)}</p>` : ""}
      ${r.assinatura ? `<p class="pj-footer-sign">${escapeHtml(r.assinatura)}</p>` : ""}
      ${marca && r.mostrarMarca ? `<p class="pj-footer-brand">${escapeHtml(marca)}</p>` : ""}
      ${contato ? `<p class="pj-footer-contact">${contato}</p>` : ""}
      ${r.mostrarCredito && decorador?.nome && empresa?.nome && decorador.nome !== empresa.nome ? `<p class="pj-footer-credit">Mobiliário: ${escapeHtml(empresa.nome)}</p>` : ""}
    </footer>` : ""}
    <div class="pj-lightbox" id="pjLightbox" hidden><button type="button" class="pj-lightbox-close" aria-label="Fechar">×</button><img alt=""></div>
  </div>`;

  document.getElementById("pjPdf")?.addEventListener("click", imprimir);
  document.getElementById("pjLayoutSelect")?.addEventListener("change", (event) => {
    estado.layoutId = event.target.value;
    renderizar();
  });
  if(estado.primeira && modo !== "editor") window.scrollTo(0, 0); else window.scrollTo(0, rolagem);
  estado.primeira = false;
}

// Antes de imprimir, carrega todas as imagens (as de baixo da página são lazy e sairiam em branco no PDF).
async function imprimir(){
  const botao = document.getElementById("pjPdf");
  const rotulo = botao?.textContent;
  if(botao){ botao.disabled = true; botao.textContent = "Preparando…"; }
  const imagens = [...document.querySelectorAll(".pj-cover img, .pj-content img, .pj-footer img")];
  imagens.forEach((img) => { img.loading = "eager"; });
  await Promise.all(imagens.map((img) => img.complete ? null : new Promise((resolve) => { img.addEventListener("load", resolve, { once: true }); img.addEventListener("error", resolve, { once: true }); })));
  if(botao){ botao.disabled = false; botao.textContent = rotulo; }
  window.print();
}

function receberDados(dados, layoutId){
  estado.payload = dados;
  estado.layouts = Array.isArray(dados.layouts) ? dados.layouts : [];
  if(layoutId !== undefined) estado.layoutId = layoutId === null ? (dados.layout_id ?? estado.layouts.find((l) => l.padrao)?.id ?? "") : layoutId;
  renderizar();
  if(modo === "previa" && params.get("pdf") === "1" && !estado.pdfFeito){
    estado.pdfFeito = true;
    setTimeout(imprimir, 400);   // dá um respiro pro navegador começar a baixar as imagens antes da checagem de "todas carregadas"
  }
}

function ligarEventosGlobais(){
  app.addEventListener("click", (event) => {
    const lightbox = document.getElementById("pjLightbox");
    if(!lightbox) return;
    const foto = event.target.closest("[data-lightbox]");
    if(foto && modo === "editor") return;   // o iframe do editor tem a altura do conteúdo inteiro: um visualizador fixo ficaria fora da vista
    if(foto){ lightbox.querySelector("img").src = otimizarFoto(foto.dataset.lightbox, 2200, 85); lightbox.hidden = false; return; }
    if(event.target.closest(".pj-lightbox")) lightbox.hidden = true;
  });
  document.addEventListener("keydown", (event) => { if(event.key === "Escape") { const l = document.getElementById("pjLightbox"); if(l) l.hidden = true; } });
}

// ---------------------------------------------------------------------------------------------------------------
// Pré-visualização / editor: os dados vêm por postMessage do catálogo (mesma origem, e só da janela que abriu esta)
// No editor a página vive dentro de um iframe SEM barra de rolagem própria: ela avisa o tamanho real do conteúdo (pj-altura) e quem a
// hospeda estica o iframe até lá — a apresentação inteira desce junto com a página e com a coluna de edição. Mede o #app (altura do
// conteúdo), não o documento: o scrollHeight do documento nunca fica menor que o iframe e a prévia não conseguiria encolher.
function acompanharAltura(pai){
  let ultima = 0;
  const enviar = () => {
    const altura = Math.ceil(app.getBoundingClientRect().height);
    if(altura < 40 || altura === ultima) return;
    ultima = altura;
    pai.postMessage({ tipo: "pj-altura", altura }, location.origin);
  };
  new ResizeObserver(enviar).observe(app);
  enviar();
}

function iniciarPrevia(){
  const pai = window.opener || (window.parent !== window ? window.parent : null);
  if(!pai){ telaMensagem("Pré-visualização", "Abra esta página pelo botão do catálogo (Projetos → Link e PDF)."); return; }
  if(modo === "editor") acompanharAltura(pai);
  window.addEventListener("message", (event) => {
    if(event.origin !== location.origin || event.source !== pai) return;
    const msg = event.data || {};
    if(msg.tipo === "pj-dados" && msg.payload?.projeto){
      estado.rascunho = msg.rascunho || null;
      receberDados(msg.payload, msg.layoutId === undefined ? null : msg.layoutId);
    }else if(msg.tipo === "pj-layout" && estado.payload){
      estado.rascunho = msg.layout || null;
      renderizar();
    }else if(msg.tipo === "pj-erro"){
      telaMensagem("Não foi possível carregar", String(msg.mensagem || "Tente novamente."));
    }
  });
  telaMensagem("Carregando pré-visualização…", "Só um instante.");
  pai.postMessage({ tipo: "pj-pronto" }, location.origin);
}

async function iniciar(){
  if(modo === "editor") document.documentElement.dataset.modo = "editor";
  ligarEventosGlobais();
  if(modo){ iniciarPrevia(); return; }
  if(!supabase){ telaMensagem("Não foi possível abrir", "Recarregue a página em alguns instantes."); return; }
  if(!slug){ telaMensagem("Link inválido", "Este endereço está incompleto. Peça o link novamente ao seu decorador."); return; }
  // O decorador pode abrir a própria apresentação com a senha no fragmento (#pin=123456) — nunca vai pro servidor —
  // e ela é removida do endereço na hora.
  const doFragmento = new URLSearchParams(location.hash.replace(/^#/, "")).get("pin");
  if(doFragmento) history.replaceState(null, "", location.pathname + location.search);
  let pin = /^[0-9]{6}$/.test(doFragmento || "") ? doFragmento : "";
  if(!pin){ try{ pin = sessionStorage.getItem(chavePin) || ""; }catch{} }
  if(pin){ await abrir(pin, false); return; }
  telaSenha();
}

iniciar();
