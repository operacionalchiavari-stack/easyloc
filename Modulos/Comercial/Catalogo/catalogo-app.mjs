// App do catálogo no celular (out/2026). Pedido do usuário: "quero de fato um app e não um site que abre no celular...
// vou acessar pelo mesmo link, mas quando for pelo celular abre a versão mobile", com a assistente comercial (Helena).
//
// Mesmos dados e mesmas regras do catálogo do computador: mesmo login (decorador por token, equipe pelo Supabase Auth,
// visitante), mesmas RPCs de itens/projetos, mesma Helena (catalogo-assistente.mjs) e o mesmo motor 3D pra ela montar as
// fotos das composições (as peças de tela do 3D Livre são buscadas do próprio catalogo.html e montadas escondidas).
// Navegação de app: abas embaixo, telas empilhadas com o "voltar" do celular (history), folhas que sobem de baixo.
import { getEmpresaAtualId } from "../../Estoque/CadastroItens/itens.api.mjs";
import { initCatalogAssistente, abrirCatalogAssistente } from "./catalogo-assistente.mjs?v=20261016-helena-catalogo2";

const supabase = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const normalizar = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const FOTO_VAZIA = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="#f4f1ec"/><path d="M70 160l40-46 30 34 20-22 30 34z" fill="#ddd3c4"/><circle cx="160" cy="88" r="13" fill="#ddd3c4"/></svg>');
const ICO = {
  inicio: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  catalogo: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  projeto: '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
  conta: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  voltar: '<path d="M15 5l-7 7 7 7"/>', busca: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  seta: '<path d="M9 5l7 7-7 7"/>', mais: '<path d="M12 5v14M5 12h14"/>', fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  baixo: '<path d="M6 9l6 6 6-6"/>', site: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  sair: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>', instalar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  enviar: '<path d="M4 12l16-8-6 16-2-7z"/>', trocar: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>', compartilhar: '<path d="M12 4v12M7 9l5-5 5 5M5 14v5h14v-5"/>',
};
function ajustarLogo(img){
  const marcar = () => { if(img.naturalWidth && img.naturalWidth / img.naturalHeight < 1.6) img.classList.add("quadrada"); };
  img.complete ? marcar() : img.addEventListener("load", marcar, { once: true });
}
document.addEventListener("load", (e) => { if(e.target?.matches?.(".inicio-logo,.login-logo,.app-abertura-logo")) ajustarLogo(e.target); }, true);
const ico = (nome, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICO[nome] || ""}</svg>`;

function otimizar(url, largura, q = 74){
  if(!url || typeof url !== "string") return url || FOTO_VAZIA;
  const m = "/storage/v1/object/public/", i = url.indexOf(m);
  if(i === -1) return url;
  const caminho = url.slice(i + m.length);
  return `${url.slice(0, i)}/storage/v1/render/image/public/${caminho}${caminho.includes("?") ? "&" : "?"}width=${largura}&quality=${q}&resize=contain`;
}
const slugify = (v) => String(v || "sem-categoria").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "sem-categoria";
const cm = (v) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) : null);
const dataLonga = (d) => d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) : "";

// ---------------------------------------------------------------------------------------------------------------
// Estado
const S = {
  sessao: null, empresa: null, decorador: null, itens: [], capas: {},
  aba: "inicio", pilha: [], projeto: null, projetos: [], ambAtivo: null,
  salvar: { timer: null, rev: 0, salvoRev: 0, promessa: null },
  composicoes: [],
};
const visitante = () => Boolean(S.sessao?.visitante);
const equipe = () => Boolean(S.sessao && !S.sessao.token && !S.sessao.visitante);

// ---------------------------------------------------------------------------------------------------------------
// Itens (mesma montagem do catálogo do computador — o motor 3D e a Helena usam estes campos)
function mapRow(row){
  const modelo = Array.isArray(row.itens_modelos_3d) ? row.itens_modelos_3d[0] : row.itens_modelos_3d;
  const fotos = (row.itens_fotos || []).filter((f) => f.url).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const proprias = fotos.filter((f) => f.tipo === "galeria" && f.cliente_id && String(f.cliente_id) === String(S.sessao?.cliente_id || ""));
  const eventos = proprias.length ? proprias : fotos.filter((f) => f.tipo === "galeria" && !f.cliente_id);
  const nome = row.produto_base ? `${row.produto_base} ${row.produto || ""}`.trim() : (row.produto || "Item");
  const dims = [row.largura, row.altura, row.profundidade].map(cm);
  return {
    id: row.id, tipo: row.tipo, name: nome, fullName: String(row.descricao_total || "").trim() || nome,
    cat: slugify(row.categoria), catLabel: row.categoria || "Sem categoria", catOrdem: row.categoria_ordem ?? null,
    subcat: row.subcategoria ? slugify(row.subcategoria) : "", subcatLabel: row.subcategoria || "",
    material: row.material || "", cor: row.cor || "", estilo: row.estilo || "", desc: row.descricao_complementar || "",
    rentalPrice: row.valor_locacao != null && row.valor_locacao !== "" && Number.isFinite(Number(row.valor_locacao)) ? Number(row.valor_locacao) : null,
    dims: dims.every((d) => d === null) ? "" : dims.map((d) => d ?? "–").join(" × ") + " cm",
    medidas: dims.every((d) => d === null) ? "" : `(L) ${dims[0] ?? "–"} × (A) ${dims[1] ?? "–"} × (P) ${dims[2] ?? "–"} cm`,
    dimensions: { width: Number(row.largura) > 0 ? Number(row.largura) : null, height: Number(row.altura) > 0 ? Number(row.altura) : null, depth: Number(row.profundidade) > 0 ? Number(row.profundidade) : null },
    photo: row.foto_url || FOTO_VAZIA, capaCategoria: row.capa_categoria === true,
    ordem: Number.isFinite(Number(row.ordem_exposicao_site)) && row.ordem_exposicao_site !== null ? Number(row.ordem_exposicao_site) : null,
    glb: modelo && modelo.status !== "removido" ? modelo.url : null,
    details: fotos.filter((f) => f.tipo === "detalhe").map((f) => ({ img: f.url })),
    events: eventos.map((f) => ({ img: f.url })),
    specs: [["Categoria", row.categoria], ["Material", row.material], ["Cor", row.cor], ["Estilo", row.estilo], ["Medidas", dims.every((d) => d === null) ? "" : `(L) ${dims[0] ?? "–"} × (A) ${dims[1] ?? "–"} × (P) ${dims[2] ?? "–"} cm`], ["Código", row.referencia]].filter(([, v]) => String(v || "").trim()),
  };
}
// Mesma regra do catálogo: mesma peça em cores diferentes vira um card só, com as variações.
function agruparVariantes(itens){
  const grupos = new Map();
  for(const i of itens){ const k = [i.cat, i.tipo || "", i.name, i.material || "", i.dims || ""].join("||"); grupos.set(k, [...(grupos.get(k) || []), i]); }
  const saida = [];
  for(const v of grupos.values()){
    if(v.length === 1){ saida.push(v[0]); continue; }
    const ord = [...v].sort((a, b) => (a.cor || "").localeCompare(b.cor || "", "pt-BR"));
    ord.forEach((x) => { x.variantGroup = ord; });
    const comFoto = ord.filter((x) => x.photo !== FOTO_VAZIA);
    const principal = (comFoto.length ? comFoto : ord).find((x) => x.capaCategoria) || (comFoto.length ? comFoto : ord)[0];
    const ordens = ord.map((x) => x.ordem).filter((o) => o !== null);
    principal.ordem = ordens.length ? Math.min(...ordens) : null;
    saida.push(principal);
  }
  return saida;
}
function acharItem(id){
  for(const i of S.itens){
    if(String(i.id) === String(id)) return i;
    const v = i.variantGroup?.find((x) => String(x.id) === String(id));
    if(v) return v;
  }
  return null;
}
function categorias(){
  const m = new Map();
  for(const i of S.itens){
    if(!m.has(i.cat)) m.set(i.cat, { cat: i.cat, label: i.catLabel, ordem: i.catOrdem, itens: [] });
    m.get(i.cat).itens.push(i);
  }
  return [...m.values()].sort((a, b) => (a.ordem === null) - (b.ordem === null) || (a.ordem ?? 0) - (b.ordem ?? 0));
}
const capaDaCategoria = (c) => (c.itens.find((i) => i.capaCategoria && i.photo !== FOTO_VAZIA) || c.itens.find((i) => i.photo !== FOTO_VAZIA) || c.itens[0])?.photo || FOTO_VAZIA;
const ordenarNaCategoria = (a, b) => (a.ordem === null) - (b.ordem === null) || (a.ordem ?? 0) - (b.ordem ?? 0) || (a.photo === FOTO_VAZIA) - (b.photo === FOTO_VAZIA);

// ---------------------------------------------------------------------------------------------------------------
// Avisos
function notify({ title = "", message = "", status = "done", actionLabel = "", onAction = null, duration = 4200, image = "" } = {}){
  const caixa = $("appToasts");
  const el = document.createElement("div");
  el.className = `toast${status === "error" ? " erro" : ""}`;
  el.innerHTML = `${image ? `<img src="${esc(otimizar(image, 120))}" alt="">` : ""}<div><strong>${esc(title)}</strong>${message ? `<span>${esc(message)}</span>` : ""}</div>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ""}`;
  const fechar = () => el.remove();
  el.querySelector("button")?.addEventListener("click", () => { fechar(); onAction?.(); });
  caixa.appendChild(el);
  if(status !== "working" && duration) setTimeout(fechar, duration);
  return { close: fechar, update: (n) => { el.querySelector("strong").textContent = n.title || title; } };
}
window.catalogNotify = notify;

// ---------------------------------------------------------------------------------------------------------------
// Folha que sobe de baixo (escolhas, formulários)
function folha({ titulo, sub = "", corpo = "", aoMontar = null }){
  return new Promise((resolve) => {
    const fundo = document.createElement("div"); fundo.className = "folha-fundo";
    const el = document.createElement("section"); el.className = "folha"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", titulo);
    el.innerHTML = `<h3>${esc(titulo)}</h3>${sub ? `<p class="folha-sub">${esc(sub)}</p>` : ""}${corpo}`;
    // A folha ocupa uma entrada do histórico (o "voltar" do celular fecha ela). Fechando por código, desfaz essa entrada e
    // só resolve DEPOIS do popstate chegar — senão o voltar atrasado derrubava a próxima folha aberta em seguida.
    let fechada = false;
    const remover = (v) => { if(fechada) return; fechada = true; fundo.remove(); el.remove(); resolve(v); };
    const aoVoltar = () => remover(null);
    const fecharPorCodigo = (v = null) => {
      if(fechada) return;
      window.removeEventListener("popstate", aoVoltar);
      window.addEventListener("popstate", () => remover(v), { once: true });
      history.back();
    };
    fundo.addEventListener("click", () => fecharPorCodigo(null));
    document.body.append(fundo, el);
    history.pushState({ folha: true }, "");
    window.addEventListener("popstate", aoVoltar, { once: true });
    aoMontar?.({ el, fechar: fecharPorCodigo });
  });
}

// Visualizador de foto em tela cheia (toque duplo amplia; arrasta pra ver detalhes)
function abrirZoom(src){
  if(!src) return;
  const el = document.createElement("div"); el.className = "zoom";
  el.innerHTML = `<div class="zoom-area"><img src="${esc(otimizar(src, 2000, 88))}" alt=""></div><button type="button" class="btn-icone" aria-label="Fechar">${ico("fechar")}</button><small>Toque duas vezes para ampliar</small>`;
  const area = el.querySelector(".zoom-area");
  let ultimo = 0;
  area.addEventListener("click", () => { const t = Date.now(); if(t - ultimo < 300) area.classList.toggle("ampliado"); ultimo = t; });
  const sair = () => { el.remove(); window.removeEventListener("popstate", sair); };
  el.querySelector("button").addEventListener("click", () => history.back());
  window.addEventListener("popstate", sair, { once: true });
  history.pushState({ zoom: true }, "");
  document.body.appendChild(el);
}
window.catalogOpenPhotoZoom = (src) => abrirZoom(src);

// ---------------------------------------------------------------------------------------------------------------
// Navegação: abas + pilha de telas por aba, com o "voltar" do celular (history)
const ABAS = [
  { id: "inicio", rotulo: "Início", ico: "inicio" },
  { id: "catalogo", rotulo: "Catálogo", ico: "catalogo" },
  { id: "helena", rotulo: "Helena", helena: true },
  { id: "projeto", rotulo: "Projeto", ico: "projeto" },
  { id: "conta", rotulo: "Conta", ico: "conta" },
];
function pintarAbas(){
  const nav = $("appAbas");
  const abas = ABAS.filter((a) => !visitante() || !["helena", "projeto"].includes(a.id));
  nav.style.gridTemplateColumns = `repeat(${abas.length},1fr)`;
  nav.innerHTML = abas.map((a) => a.helena
    ? `<button type="button" class="aba aba-helena${S.aba === a.id ? " ativa" : ""}" data-aba="helena" aria-label="Conversar com a Helena"><span class="aba-bola">H</span>${a.rotulo}${S.naoLidas ? `<i class="aba-ponto">${S.naoLidas}</i>` : ""}</button>`
    : `<button type="button" class="aba${S.aba === a.id ? " ativa" : ""}" data-aba="${a.id}" aria-label="${a.rotulo}"${S.aba === a.id ? ' aria-current="page"' : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${ICO[a.ico]}</svg>${a.rotulo}${a.id === "projeto" && totalPecas() ? `<i class="aba-ponto" style="background:var(--grafite)">${totalPecas()}</i>` : ""}</button>`).join("");
  nav.hidden = false;
}
function irParaAba(id){
  if(id === "helena"){ abrirHelena(); return; }
  S.aba = id;
  S.pilha.forEach((t) => t.el.remove());
  S.pilha = [];
  const raiz = { inicio: telaInicio, catalogo: telaCatalogo, projeto: telaProjeto, conta: telaConta }[id]();
  montarTela(raiz, "troca");
  history.replaceState({ n: 0 }, "");
  pintarAbas();
}
function montarTela(el, efeito){
  el.classList.add("tela", efeito);
  $("appTelas").appendChild(el);
  S.pilha.push({ el });
  document.body.classList.toggle("sem-abas", el.classList.contains("sem-abas"));
  // linha embaixo do topo só quando a tela rola
  const rol = el.querySelector(".tela-rolagem"), topo = el.querySelector(".topo");
  if(rol && topo) rol.addEventListener("scroll", () => topo.classList.toggle("com-linha", rol.scrollTop > 4), { passive: true });
}
function empurrar(el){
  const anterior = S.pilha.at(-1)?.el;
  montarTela(el, "entra");
  history.pushState({ n: S.pilha.length - 1 }, "");
  if(anterior) setTimeout(() => { anterior.style.visibility = "hidden"; }, 340);
}
function voltar(){ history.back(); }
window.addEventListener("popstate", () => {
  if(document.querySelector(".folha, .zoom")) return; // a folha/zoom tratam o próprio voltar
  if(document.body.classList.contains("assistente-aberta")){ document.querySelector("[data-cas-fechar]")?.click(); return; }
  if(S.pilha.length > 1){
    const atual = S.pilha.pop().el;
    const anterior = S.pilha.at(-1).el;
    anterior.style.visibility = "";
    document.body.classList.toggle("sem-abas", anterior.classList.contains("sem-abas"));
    atual.classList.remove("entra"); atual.classList.add("sai");
    setTimeout(() => atual.remove(), 260);
    anterior.querySelectorAll("[data-atualizar]").forEach((x) => x.dispatchEvent(new Event("atualizar")));
  }
});
// Em qual projeto/ambiente as peças estão entrando (pedido do usuário: "no app eu não consigo ver qual pedido estamos
// alterando"). Tocar abre a aba Projeto.
function chipProjeto(){
  if(visitante()) return "";
  if(!S.projeto) return `<button type="button" class="chip-projeto vazio" data-ir-aba="projeto">${ico("projeto")}<span>Escolher projeto</span></button>`;
  return `<button type="button" class="chip-projeto" data-ir-aba="projeto" aria-label="Projeto ${esc(S.projeto.noivos)}">${ico("projeto")}<span>${esc(S.projeto.noivos)}${ambienteAtivo() ? `<small>${esc(ambienteAtivo().nome)} · ${totalPecas()} ${totalPecas() === 1 ? "peça" : "peças"}</small>` : ""}</span></button>`;
}
function topo(titulo, { voltar: comVoltar = true, extra = "" } = {}){
  return `<header class="topo">${comVoltar ? `<button type="button" class="btn-icone" data-voltar aria-label="Voltar">${ico("voltar")}</button>` : ""}<h1>${esc(titulo)}</h1>${extra}</header>`;
}
function novaTela(html, classes = ""){
  const el = document.createElement("section");
  el.className = classes;
  el.innerHTML = html;
  el.addEventListener("click", (e) => { if(e.target.closest("[data-voltar]")) voltar(); });
  return el;
}

// ---------------------------------------------------------------------------------------------------------------
// Telas
function saudacao(){
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
const primeiroNome = () => String(S.decorador?.nome || S.sessao?.nomeEquipe || "").trim().split(/\s+/)[0] || "";

function telaInicio(){
  const nome = primeiroNome();
  const cats = categorias();
  const p = S.projeto;
  const el = novaTela(`<div class="tela-rolagem">
    <section class="inicio-hero"${S.capas.portal || S.capas.catalogo ? ` style="background-image:url('${esc(otimizar(S.capas.portal || S.capas.catalogo, 1100))}')"` : ""}>
      <div class="inicio-hero-topo">${S.empresa?.logo_url ? `<img class="inicio-logo" src="${esc(S.empresa.logo_url)}" alt="${esc(S.empresa?.nome || "")}">` : `<span class="inicio-logo" style="font:600 1.4rem var(--serif)">${esc(S.empresa?.nome || "Chiavari")}</span>`}
        <button type="button" class="avatar" data-ir-aba="conta" aria-label="Minha conta">${S.decorador?.logo_url ? `<img src="${esc(S.decorador.logo_url)}" alt="">` : esc((nome || "?")[0])}</button></div>
      <h1 class="inicio-ola">${esc(saudacao())}${nome ? `, <em>${esc(nome)}</em>` : ""}</h1>
      <p class="inicio-sub">Transite por vários estilos e encontre o seu.</p>
    </section>
    ${visitante() ? `<button type="button" class="helena-card" data-ir-aba="catalogo"><span class="cas-avatar">C</span><span><strong>Explorar o catálogo</strong><small>${S.itens.length} peças para o seu evento</small></span>${ico("seta")}</button>`
      : `<button type="button" class="helena-card" data-helena><span class="cas-avatar">H</span><span><strong>Fale com a Helena</strong><small>Sua consultora: sugere peças, monta fotos das composições e fecha o pedido com você. Pode mandar áudio.</small></span>${ico("seta")}</button>`}
    ${!visitante() ? (p ? `<button type="button" class="projeto-card" data-ir-aba="projeto"><span class="projeto-card-foto">${p.dados?.foto_casal?.url ? `<img src="${esc(otimizar(p.dados.foto_casal.url, 120))}" alt="">` : esc((p.noivos || "?")[0])}</span><div><small>Projeto em andamento</small><strong>${esc(p.noivos)}</strong><span>${esc(dataLonga(p.data_evento))} · ${totalPecas()} ${totalPecas() === 1 ? "peça" : "peças"}</span></div>${ico("seta")}</button>`
      : `<button type="button" class="projeto-card" data-ir-aba="projeto"><span class="projeto-card-foto">${ico("mais")}</span><div><small>Comece por aqui</small><strong>Crie o projeto do evento</strong><span>Noivos, data e local — e vá montando o pedido</span></div>${ico("seta")}</button>`) : ""}
    <h2 class="secao-titulo">Categorias <button type="button" data-ir-aba="catalogo">Ver todas</button></h2>
    <div class="carrossel">${cats.map((c) => `<button type="button" class="cat-chip" data-cat="${esc(c.cat)}"><span class="cat-chip-foto"><img src="${esc(otimizar(capaDaCategoria(c), 260))}" alt="" loading="lazy"></span><span>${esc(c.label)}</span></button>`).join("")}</div>
    <h2 class="secao-titulo">Destaques</h2>
    <div class="grade-produtos">${destaques().map(cardProduto).join("")}</div>
  </div>`);
  el.addEventListener("click", aoClicarComum);
  return el;
}
function destaques(){
  // Um pouco de cada categoria, só peças com foto (renova a cada abertura).
  const porCat = categorias().map((c) => c.itens.filter((i) => i.photo !== FOTO_VAZIA));
  const saida = [];
  for(let r = 0; saida.length < 10 && r < 3; r++) for(const l of porCat){ const i = l[Math.floor(Math.random() * l.length)]; if(i && !saida.includes(i) && saida.length < 10) saida.push(i); }
  return saida;
}
function cardProduto(i){
  const qtd = qtdNoAmbiente(i.id);
  const cores = i.variantGroup?.length > 1 ? `<span class="cores">${i.variantGroup.slice(0, 5).map((v) => `<i style="background-image:url('${esc(otimizar(v.photo, 40))}')"></i>`).join("")}</span>` : "";
  return `<button type="button" class="produto" data-item="${esc(i.id)}"><span class="produto-foto"><img src="${esc(otimizar(i.photo, 360))}" alt="" loading="lazy">${qtd ? `<span class="produto-qtd">${qtd}</span>` : ""}</span>
    <strong>${esc(i.name)}</strong>${i.dims ? `<small>${esc(i.dims)}</small>` : ""}${!visitante() ? `<b>${i.rentalPrice === null ? "Sob consulta" : dinheiro.format(i.rentalPrice)}</b>` : ""}${cores}</button>`;
}
function aoClicarComum(e){
  const aba = e.target.closest("[data-ir-aba]"); if(aba){ irParaAba(aba.dataset.irAba); return; }
  if(e.target.closest("[data-helena]")){ abrirHelena(); return; }
  const cat = e.target.closest("[data-cat]"); if(cat){ empurrar(telaCategoria(cat.dataset.cat)); return; }
  const item = e.target.closest("[data-item]"); if(item){ abrirItem(item.dataset.item); return; }
}

function telaCatalogo(){
  const cats = categorias();
  const el = novaTela(`${topo("Catálogo", { voltar: false, extra: chipProjeto() })}<div class="tela-rolagem">
    <label class="busca"><svg viewBox="0 0 24 24" aria-hidden="true">${ICO.busca}</svg><input type="search" placeholder="Buscar sofá, cadeira, boho…" aria-label="Buscar no catálogo" data-busca enterkeyhint="search"></label>
    <div data-resultado><div class="grade-cats">${cats.map((c) => `<button type="button" class="cat-card" data-cat="${esc(c.cat)}"><img src="${esc(otimizar(capaDaCategoria(c), 420))}" alt="" loading="lazy"><span>${esc(c.label)}<small>${c.itens.length} ${c.itens.length === 1 ? "peça" : "peças"}</small></span></button>`).join("")}</div></div>
  </div>`);
  el.addEventListener("click", aoClicarComum);
  const res = el.querySelector("[data-resultado]"), padrao = res.innerHTML;
  let t = null;
  el.setAttribute("data-atualizar", ""); el.addEventListener("atualizar", () => { const chip = el.querySelector(".chip-projeto"); if(chip) chip.outerHTML = chipProjeto(); });
  el.querySelector("[data-busca]").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      const termos = normalizar(e.target.value).split(/\s+/).filter(Boolean);
      if(!termos.length){ res.innerHTML = padrao; return; }
      const achados = S.itens.filter((i) => { const txt = normalizar([i.name, i.catLabel, i.subcatLabel, i.material, i.cor, i.estilo, ...(i.variantGroup || []).map((v) => v.cor)].join(" ")); return termos.every((x) => txt.includes(x)); });
      res.innerHTML = achados.length ? `<p class="subtitulo">${achados.length} ${achados.length === 1 ? "peça encontrada" : "peças encontradas"}</p><div class="grade-produtos">${achados.slice(0, 80).map(cardProduto).join("")}</div>` : `<p class="vazio">Nada encontrado para "${esc(e.target.value)}".<br>Que tal perguntar pra Helena?</p>`;
    }, 180);
  });
  return el;
}

function telaCategoria(cat){
  const c = categorias().find((x) => x.cat === cat);
  if(!c) return novaTela(`${topo("Categoria")}<p class="vazio">Categoria não encontrada.</p>`);
  const subs = [...new Map(c.itens.filter((i) => i.subcat).map((i) => [i.subcat, i.subcatLabel])).entries()];
  let filtro = "";
  const el = novaTela(`${topo(c.label, { extra: chipProjeto() })}<div class="tela-rolagem">
    ${subs.length > 1 ? `<div class="chips">${[["", "Todos"], ...subs].map(([k, v]) => `<button type="button" class="chip${k === "" ? " ativo" : ""}" data-sub="${esc(k)}">${esc(v)}</button>`).join("")}</div>` : ""}
    <div class="grade-produtos" data-grade></div></div>`, "");
  const pintar = () => { const chip = el.querySelector(".chip-projeto"); if(chip) chip.outerHTML = chipProjeto(); el.querySelector("[data-grade]").innerHTML = c.itens.filter((i) => !filtro || i.subcat === filtro).sort(ordenarNaCategoria).map(cardProduto).join(""); };
  pintar();
  el.addEventListener("click", (e) => {
    const sub = e.target.closest("[data-sub]");
    if(sub){ filtro = sub.dataset.sub; el.querySelectorAll("[data-sub]").forEach((b) => b.classList.toggle("ativo", b === sub)); pintar(); return; }
    aoClicarComum(e);
  });
  el.setAttribute("data-atualizar", ""); el.addEventListener("atualizar", pintar);
  return el;
}

// Disponibilidade da peça na data do evento do projeto aberto (mesma regra da Helena e da tela Disponibilidade de Itens).
const dispCache = new Map();
async function disponibilidade(itemId){
  const data = S.projeto?.data_evento;
  if(!data || visitante()) return null;
  const chave = `${data}:${itemId}`;
  if(!dispCache.has(chave)) dispCache.set(chave, supabase.functions.invoke("catalogo-assistente", {
    body: { action: "disponibilidade", empresa_id: S.sessao.empresa_id, catalog_token: S.sessao.token || undefined, data, item_ids: [itemId] },
  }).then(({ data: r }) => r?.itens?.[itemId] || null).catch(() => null));
  return dispCache.get(chave);
}
const dataCurta = (d) => new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long" });

function abrirItem(id){ const i = acharItem(id); if(i) empurrar(telaItem(i)); }

// A Helena mostra as peças no próprio catálogo: uma categoria só → a tela da categoria; várias → "Seleção da Helena".
// Rola até a primeira e circula as indicadas (mesmo desenho do computador).
const SVG_CIRCULO = `<svg class="helena-circulo" viewBox="0 0 200 160" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M58 22 C112 4 184 22 190 74 C196 128 120 156 66 146 C14 136 2 86 22 52 C36 28 74 14 118 16"/></svg>`;
function principalApp(id){ const i = S.itens.find((x) => String(x.id) === String(id) || x.variantGroup?.some((v) => String(v.id) === String(id))); return i || null; }
function mostrarPelaHelena(ids, { circular = true } = {}){
  const itens = [...new Map((ids || []).map(principalApp).filter(Boolean).map((i) => [String(i.id), i])).values()];
  if(!itens.length) return;
  if(S.aba !== "catalogo") irParaAba("catalogo");
  const cats = new Set(itens.map((i) => i.cat));
  const tela = cats.size === 1 ? telaCategoria(itens[0].cat)
    : (() => { const el = novaTela(`${topo("Seleção da Helena", { extra: chipProjeto() })}<div class="tela-rolagem"><div class="grade-produtos">${itens.map(cardProduto).join("")}</div></div>`, ""); el.addEventListener("click", aoClicarComum); return el; })();
  empurrar(tela);
  setTimeout(() => {
    const ids2 = itens.map((i) => String(i.id));
    const cards = [...tela.querySelectorAll("[data-item]")].filter((c) => ids2.includes(String(principalApp(c.dataset.item)?.id)));
    if(!cards.length) return;
    cards[0].scrollIntoView({ behavior: "smooth", block: "center" });
    if(circular) cards.forEach((card, n) => { card.classList.add("helena-alvo"); card.insertAdjacentHTML("beforeend", SVG_CIRCULO); card.querySelector(".helena-circulo").style.animationDelay = `${600 + n * 350}ms`; });
  }, 380);
}

function telaItem(itemInicial){
  let item = itemInicial;
  let livres = null;
  const el = novaTela("", "sem-abas");
  const pintar = () => {
    const fotos = [{ img: item.photo, tipo: "principal" }, ...item.details.map((d) => ({ img: d.img, tipo: "detalhe" })), ...item.events.map((d) => ({ img: d.img, tipo: "ambientada" }))].filter((f) => f.img);
    const qtd = qtdNoAmbiente(item.id);
    const amb = ambienteAtivo();
    el.innerHTML = `<div class="tela-rolagem">
      <div class="item-galeria">
        <button type="button" class="btn-icone item-voltar" data-voltar aria-label="Voltar">${ico("voltar")}</button>
        <div class="item-acoes-topo"><button type="button" class="btn-icone" data-compartilhar aria-label="Compartilhar">${ico("compartilhar")}</button></div>
        <div class="item-fotos" data-fotos>${fotos.map((f, n) => `<figure class="${f.tipo === "ambientada" ? "ambientada" : ""}"><img src="${esc(otimizar(f.img, 900))}" alt="${esc(item.name)}" ${n ? 'loading="lazy"' : ""} data-zoom="${esc(f.img)}"></figure>`).join("")}</div>
        ${fotos.length > 1 ? `<div class="item-pontos">${fotos.map((_, n) => `<i class="${n ? "" : "ativo"}"></i>`).join("")}</div>` : ""}
      </div>
      <div class="item-info">
        <span class="item-cat">${esc(item.catLabel)}${item.subcatLabel ? ` · ${esc(item.subcatLabel)}` : ""}</span>
        <h1 class="item-nome">${esc(item.name)}</h1>
        ${!visitante() ? `<p class="item-preco">${item.rentalPrice === null ? "Sob consulta" : `${dinheiro.format(item.rentalPrice)} <small>locação</small>`}</p><p class="item-disp" data-disp></p>` : ""}
        ${item.variantGroup?.length > 1 ? `<div class="item-variantes">${item.variantGroup.map((v) => `<button type="button" class="variante${v.id === item.id ? " ativa" : ""}" data-variante="${esc(v.id)}" aria-label="${esc(v.cor || v.name)}"><i style="background-image:url('${esc(otimizar(v.photo, 100))}')"></i><span>${esc(v.cor || "—")}</span></button>`).join("")}</div>` : ""}
        ${item.desc ? `<p class="item-desc">${esc(item.desc)}</p>` : ""}
        ${item.specs.length ? `<dl class="specs">${item.specs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        ${!visitante() ? `<button type="button" class="item-perguntar" data-perguntar><span class="cas-avatar">H</span><span><strong>Perguntar à Helena</strong><small>Disponibilidade, combinações, foto em composição…</small></span></button>` : ""}
      </div></div>
      ${!visitante() ? `<div class="barra-acao"><div class="barra-destino">${S.projeto ? `${ico("projeto")}<span>Projeto <b>${esc(S.projeto.noivos)}</b>${amb ? ` · ${esc(amb.nome)}` : ""}${qtd ? ` · já tem ${qtd}` : ""}</span><button type="button" class="link" data-trocar-amb>${amb ? "trocar" : "escolher"}</button>` : `${ico("projeto")}<span>Nenhum projeto aberto</span><button type="button" class="link" data-trocar-amb>escolher</button>`}</div><div class="passos"><button type="button" data-passo="-1" aria-label="Menos">−</button><input type="number" inputmode="numeric" min="1" max="999" value="${qtd || 1}" aria-label="Quantidade" data-qtd><button type="button" data-passo="1" aria-label="Mais">+</button></div>
        <button type="button" class="btn" data-adicionar>${qtd ? `Atualizar${amb ? ` · ${esc(amb.nome)}` : ""}` : `Adicionar${amb ? ` · ${esc(amb.nome)}` : " ao projeto"}`}</button></div>` : ""}`;
    const atual = item;
    disponibilidade(item.id).then((d) => {
      const linha = el.querySelector("[data-disp]"), botao = el.querySelector("[data-adicionar]");
      if(!linha || atual !== item) return;
      livres = null;
      if(!d || !d.total){ linha.textContent = S.projeto?.data_evento ? "A equipe confirma a disponibilidade no pedido" : ""; linha.className = "item-disp"; return; }
      livres = d.livre;
      if(d.livre <= 0){
        linha.textContent = `Esgotado em ${dataCurta(S.projeto.data_evento)}`; linha.className = "item-disp esgotado";
        if(botao && !qtdNoAmbiente(item.id)){ botao.disabled = true; botao.textContent = "Indisponível no dia"; }
      }else{ linha.textContent = `${d.livre} ${d.livre === 1 ? "livre" : "livres"} em ${dataCurta(S.projeto.data_evento)}`; linha.className = "item-disp livre"; }
    });
    const trilho = el.querySelector("[data-fotos]"), pontos = el.querySelectorAll(".item-pontos i");
    trilho?.addEventListener("scroll", () => { const n = Math.round(trilho.scrollLeft / trilho.clientWidth); pontos.forEach((p, k) => p.classList.toggle("ativo", k === n)); }, { passive: true });
  };
  pintar();
  el.addEventListener("click", async (e) => {
    if(e.target.closest("[data-voltar]")) return;
    const z = e.target.closest("[data-zoom]"); if(z){ abrirZoom(z.dataset.zoom); return; }
    const v = e.target.closest("[data-variante]"); if(v){ item = acharItem(v.dataset.variante) || item; pintar(); return; }
    const passo = e.target.closest("[data-passo]");
    if(passo){
      const inp = el.querySelector("[data-qtd]"), teto = livres > 0 ? livres : 999;
      const novo = (Number(inp.value) || 1) + Number(passo.dataset.passo);
      if(novo > teto) notify({ title: `Só ${teto} ${teto === 1 ? "livre" : "livres"} nessa data`, status: "error", duration: 2600 });
      inp.value = Math.max(1, Math.min(teto, novo)); return;
    }
    if(e.target.closest("[data-adicionar]")){
      let n = Math.max(1, Math.min(999, Math.round(Number(el.querySelector("[data-qtd]").value) || 1)));
      if(livres !== null && n > livres){ notify({ title: livres ? `Só ${livres} ${livres === 1 ? "livre" : "livres"} em ${dataCurta(S.projeto.data_evento)}` : "Indisponível nessa data", message: "Ajuste a quantidade ou peça à Helena uma alternativa.", status: "error" }); return; }
      const ok = await definirQuantidade(item.id, n);
      if(ok) pintar();
      return;
    }
    if(e.target.closest("[data-trocar-amb]")){ if(!S.projeto){ await garantirDestino(); } else { await escolherAmbiente(); } pintar(); return; }
    if(e.target.closest("[data-perguntar]")){ abrirHelena(`Me fala sobre o ${item.name}${item.cor ? ` (${item.cor})` : ""}: tem disponível pro meu evento e com o que combina?`); return; }
    if(e.target.closest("[data-compartilhar]")){
      const url = location.href.split("#")[0];
      try{ if(navigator.share) await navigator.share({ title: item.name, text: `${item.name} — Catálogo Chiavari`, url }); else { await navigator.clipboard.writeText(url); notify({ title: "Link copiado" }); } }catch{}
    }
  });
  return el;
}

// ---------------------------------------------------------------------------------------------------------------
// Projetos (mesmas RPCs do catálogo do computador; o projeto ativo é o mesmo nos dois)
function rpcParams(extra = {}){ return S.sessao?.token ? { p_token: S.sessao.token, ...extra } : { p_empresa_id: S.sessao?.empresa_id, ...extra }; }
async function rpc(nome, extra = {}){ const { data, error } = await supabase.rpc(nome, rpcParams(extra)); if(error) throw error; return data; }
const chaveAtivo = () => `catalogo_projeto_ativo:${S.sessao?.empresa_id || ""}:${S.sessao?.cliente_id || "equipe"}`;
function lerAtivo(){ try{ return JSON.parse(localStorage.getItem(chaveAtivo()) || "null"); }catch{ return null; } }
function gravarAtivo(){ try{ S.projeto ? localStorage.setItem(chaveAtivo(), JSON.stringify({ id: S.projeto.id, amb: S.ambAtivo })) : localStorage.removeItem(chaveAtivo()); }catch{} }
function normalizarProjeto(p){
  if(!p) return null;
  const dados = p.dados && typeof p.dados === "object" ? p.dados : {};
  dados.ambientes = (Array.isArray(dados.ambientes) ? dados.ambientes : []).map((a) => ({ ...a, itens: Array.isArray(a.itens) ? a.itens : [], renders: Array.isArray(a.renders) ? a.renders : [], notas: a.notas || "" }));
  return { ...p, dados };
}
const ambientes = () => S.projeto?.dados?.ambientes || [];
const ambienteAtivo = () => ambientes().find((a) => a.id === S.ambAtivo) || null;
const qtdNoAmbiente = (id) => Number(ambienteAtivo()?.itens.find((i) => String(i.item_id) === String(id))?.quantidade) || 0;
const totalPecas = () => ambientes().reduce((t, a) => t + a.itens.reduce((q, i) => q + (Number(i.quantidade) || 0), 0), 0);
const novoId = (p) => p + Math.random().toString(36).slice(2, 10);

async function carregarProjetos(){ const l = await rpc("projeto_listar"); S.projetos = Array.isArray(l) ? l : []; return S.projetos; }
async function usarProjeto(id, amb = null){
  await salvarAgora();
  S.projeto = normalizarProjeto(await rpc("projeto_obter", { p_id: id }));
  S.ambAtivo = ambientes().some((a) => a.id === amb) ? amb : (ambientes()[0]?.id || null);
  gravarAtivo(); presenca(true); pintarAbas();
}
function marcarSujo(){
  S.salvar.rev++;
  clearTimeout(S.salvar.timer);
  S.salvar.timer = setTimeout(salvarAgora, 800);
  presenca(); pintarAbas();
}
async function salvarAgora(){
  clearTimeout(S.salvar.timer);
  if(S.salvar.promessa) await S.salvar.promessa;
  const p = S.projeto;
  if(!p || S.salvar.rev === S.salvar.salvoRev) return;
  const rev = S.salvar.rev;
  S.salvar.promessa = (async () => {
    try{
      await rpc("projeto_salvar", { p_id: p.id, p_noivos: p.noivos, p_data_evento: p.data_evento, p_local_evento: p.local_evento, p_dados: p.dados });
      S.salvar.salvoRev = rev;
    }catch(error){
      notify({ title: "Não foi possível salvar", message: mensagem(error), status: "error", actionLabel: "Tentar de novo", onAction: () => { S.salvar.rev++; salvarAgora(); } });
    }finally{ S.salvar.promessa = null; }
  })();
  await S.salvar.promessa;
}
let ultimaPresenca = 0;
function presenca(forcar = false){
  if(!S.projeto || equipe() || visitante() || document.visibilityState !== "visible") return;
  if(!forcar && Date.now() - ultimaPresenca < 20000) return;
  ultimaPresenca = Date.now();
  rpc("projeto_presenca", { p_id: S.projeto.id, p_detalhe: ["No app", ambienteAtivo()?.nome].filter(Boolean).join(" · ") }).catch(() => {});
}
function mensagem(error){
  const t = String(error?.message || error || "");
  if(/failed to fetch|network/i.test(t)) return "Sem conexão. Verifique a internet.";
  if(/expirad|sess/i.test(t)) return "Sua sessão expirou. Entre novamente.";
  return t || "Algo deu errado. Tente de novo.";
}

// Garante projeto + ambiente antes de pôr uma peça (pergunta pelas folhas, como o "＋" do computador).
async function garantirDestino(){
  if(S.projeto && ambienteAtivo()) return true;
  if(!S.projeto){
    let lista = [];
    try{ lista = await carregarProjetos(); }catch(error){ notify({ title: "Projetos indisponíveis", message: mensagem(error), status: "error" }); return false; }
    const escolha = await folha({ titulo: "Em qual projeto?", sub: "Escolha o evento onde a peça vai entrar.",
      corpo: `<div class="folha-opcoes">${lista.map((p) => `<button type="button" class="folha-opcao" data-p="${esc(p.id)}"><span>${esc(p.noivos)}<br><small style="color:var(--muted);font-weight:500">${esc(dataLonga(p.data_evento))}</small></span>${ico("seta")}</button>`).join("")}<button type="button" class="folha-opcao" data-novo><span>＋ Novo projeto</span></button></div>`,
      aoMontar: ({ el, fechar }) => el.addEventListener("click", (e) => { const b = e.target.closest("[data-p],[data-novo]"); if(b) fechar(b.dataset.p || "novo"); }) });
    if(!escolha) return false;
    if(escolha === "novo"){ if(!(await criarProjeto())) return false; }
    else await usarProjeto(escolha);
  }
  if(!ambienteAtivo()){
    const nome = await escolherAmbiente();
    if(!nome) return false;
  }
  return true;
}
async function escolherAmbiente(){
  const lista = ambientes();
  const escolha = await folha({ titulo: "Em qual ambiente?", sub: S.projeto?.noivos || "",
    corpo: `<div class="folha-opcoes">${lista.map((a) => `<button type="button" class="folha-opcao${a.id === S.ambAtivo ? " ativa" : ""}" data-a="${esc(a.id)}"><span>${esc(a.nome)}</span><small style="color:var(--muted)">${a.itens.length} ${a.itens.length === 1 ? "peça" : "peças"}</small></button>`).join("")}</div>
      <form data-form style="margin-top:14px"><label class="campo"><span>Novo ambiente</span><input name="nome" maxlength="60" placeholder="Ex.: Lounge, Cerimônia, Bar" autocomplete="off"></label><button class="btn btn-bloco" type="submit">Criar ambiente</button></form>`,
    aoMontar: ({ el, fechar }) => {
      el.addEventListener("click", (e) => { const b = e.target.closest("[data-a]"); if(b) fechar({ id: b.dataset.a }); });
      el.querySelector("[data-form]").addEventListener("submit", (e) => { e.preventDefault(); const n = e.target.nome.value.trim(); if(n) fechar({ nome: n }); });
    } });
  if(!escolha) return null;
  if(escolha.id){ S.ambAtivo = escolha.id; gravarAtivo(); return ambienteAtivo()?.nome; }
  const amb = { id: novoId("a"), nome: escolha.nome.slice(0, 60), itens: [], renders: [], notas: "" };
  S.projeto.dados.ambientes.push(amb); S.ambAtivo = amb.id; gravarAtivo(); marcarSujo();
  return amb.nome;
}
async function criarProjeto(){
  const r = await folha({ titulo: "Novo projeto", sub: "Os dados do evento. Depois é só ir colocando as peças.",
    corpo: `<form data-form><label class="campo"><span>Tipo de evento</span><input name="tipo" maxlength="80" autocomplete="off" placeholder="Ex.: Casamento, aniversário"></label>
      <label class="campo"><span>Noivos ou homenageado (opcional)</span><input name="noivos" maxlength="120" autocomplete="off" placeholder="Ex.: Ana e Bruno"></label>
      <label class="campo"><span>Entrega dos móveis</span><input name="entrega" type="date"></label>
      <label class="campo"><span>Data do evento</span><input name="data" type="date" required></label>
      <label class="campo"><span>Até (se durar vários dias)</span><input name="fim" type="date"></label>
      <label class="campo"><span>Coleta dos móveis</span><input name="coleta" type="date"></label>
      <label class="campo"><span>Local</span><input name="local" required maxlength="160" autocomplete="off" placeholder="Ex.: Fazenda Vila Rica"></label>
      <p class="folha-erro" data-erro></p><button class="btn btn-bloco" type="submit">Criar projeto</button></form>`,
    aoMontar: ({ el, fechar }) => el.querySelector("[data-form]").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, btn = f.querySelector("button");
      btn.disabled = true;
      try{
        const evento = Object.fromEntries([["tipo", f.tipo.value.trim()], ["data_entrega", f.entrega.value], ["data_fim", f.fim.value > f.data.value ? f.fim.value : ""], ["data_coleta", f.coleta.value]].filter(([, v]) => v));
        const p = await rpc("projeto_criar", { p_noivos: f.noivos.value.trim() || null, p_data_evento: f.data.value, p_local_evento: f.local.value.trim(), p_ambientes: [], p_evento: evento });
        fechar(p);
      }catch(error){ el.querySelector("[data-erro]").textContent = mensagem(error); btn.disabled = false; }
    }) });
  if(!r) return false;
  await salvarAgora();
  S.projeto = normalizarProjeto(r); S.ambAtivo = null; gravarAtivo(); presenca(true); pintarAbas();
  notify({ title: "Projeto criado", message: S.projeto.noivos });
  return true;
}
async function definirQuantidade(itemId, quantidade, { nomeAmbiente = "", silencioso = false } = {}){
  if(nomeAmbiente && S.projeto){
    let amb = ambientes().find((a) => normalizar(a.nome) === normalizar(nomeAmbiente));
    if(!amb){ amb = { id: novoId("a"), nome: nomeAmbiente.slice(0, 60), itens: [], renders: [], notas: "" }; S.projeto.dados.ambientes.push(amb); }
    S.ambAtivo = amb.id; gravarAtivo();
  }
  if(!(await garantirDestino())) return false;
  const amb = ambienteAtivo();
  const linha = amb.itens.find((i) => String(i.item_id) === String(itemId));
  const antes = linha ? Number(linha.quantidade) || 0 : 0;
  const nova = Math.max(0, Math.min(999, Math.round(quantidade)));
  if(!nova) amb.itens = amb.itens.filter((i) => String(i.item_id) !== String(itemId));
  else if(linha) linha.quantidade = nova;
  else amb.itens.push({ item_id: String(itemId), quantidade: nova });
  marcarSujo();
  const nome = acharItem(itemId)?.name || "Peça";
  if(!silencioso) notify({ title: nova ? "No projeto" : "Removido", message: nova ? `${nova}× ${nome} · ${amb.nome}` : `${nome} saiu de ${amb.nome}`,
    image: acharItem(itemId)?.photo, actionLabel: "Desfazer", onAction: () => { definirQuantidade(itemId, antes, { silencioso: true }); atualizarTelaAtual(); } });
  return { ambiente: amb.nome, antes };
}
function atualizarTelaAtual(){ S.pilha.at(-1)?.el.dispatchEvent(new Event("atualizar")); }

function telaProjeto(){
  const el = novaTela("", "");
  const pintar = async () => {
    if(!S.projeto){
      el.innerHTML = `${topo("Projetos", { voltar: false })}<div class="tela-rolagem"><p class="subtitulo">Cada evento é um projeto. Escolha um ou crie um novo.</p><div class="lista-projetos" data-lista><p class="vazio">Carregando…</p></div><div style="padding:16px"><button type="button" class="btn btn-bloco" data-novo>${ico("mais")} Novo projeto</button></div></div>`;
      try{
        const lista = await carregarProjetos();
        el.querySelector("[data-lista]").innerHTML = lista.length ? lista.map((p) => `<button type="button" class="projeto-card" style="margin:0;width:100%" data-abrir="${esc(p.id)}"><span class="projeto-card-foto">${p.foto_casal_url ? `<img src="${esc(otimizar(p.foto_casal_url, 120))}" alt="">` : esc((p.noivos || "?")[0])}</span><div><small>${esc(rotuloStatus(p.status))}</small><strong>${esc(p.noivos)}</strong><span>${esc(dataLonga(p.data_evento))} · ${esc(p.local_evento || "")}</span></div>${ico("seta")}</button>`).join("") : `<p class="vazio">Você ainda não tem projetos.</p>`;
      }catch(error){ el.querySelector("[data-lista]").innerHTML = `<p class="vazio">${esc(mensagem(error))}</p>`; }
      return;
    }
    const p = S.projeto, amb = ambienteAtivo();
    const valor = ambientes().reduce((t, a) => t + a.itens.reduce((q, i) => q + (Number(i.quantidade) || 0) * (acharItem(i.item_id)?.rentalPrice || 0), 0), 0);
    el.innerHTML = `${topo("Projeto", { voltar: false })}<div class="tela-rolagem">
      <section class="proj-cab"><button type="button" class="btn-icone proj-trocar" data-trocar aria-label="Trocar de projeto">${ico("trocar")}</button><small>Seu projeto</small><h2>${esc(p.noivos)}</h2><p>${esc(dataLonga(p.data_evento))} · ${esc(p.local_evento || "")}</p><span class="proj-status">${esc(rotuloStatus(p.status))}</span></section>
      <div class="chips" style="margin-top:16px">${ambientes().map((a) => `<button type="button" class="chip${a.id === S.ambAtivo ? " ativo" : ""}" data-amb="${esc(a.id)}">${esc(a.nome)} · ${a.itens.reduce((q, i) => q + (Number(i.quantidade) || 0), 0)}</button>`).join("")}<button type="button" class="chip" data-novo-amb>＋ Ambiente</button></div>
      ${amb ? (amb.itens.length ? `<div class="linhas">${amb.itens.map((l) => { const i = acharItem(l.item_id); return `<div class="linha" data-linha="${esc(l.item_id)}"><img src="${esc(otimizar(i?.photo || FOTO_VAZIA, 140))}" alt="" data-item="${esc(l.item_id)}"><div><strong>${esc(i?.name || "Peça")}</strong><small>${i?.rentalPrice != null ? dinheiro.format(i.rentalPrice) + " · " : ""}${esc(i?.cor || "")}</small></div><div class="passos"><button type="button" data-q="-1" aria-label="Menos">−</button><input type="number" inputmode="numeric" value="${Number(l.quantidade) || 1}" aria-label="Quantidade" data-qi><button type="button" data-q="1" aria-label="Mais">+</button></div></div>`; }).join("")}</div>`
        : `<p class="vazio">Nenhuma peça em ${esc(amb.nome)} ainda.<br><button type="button" class="link" data-ir-aba="catalogo">Ver o catálogo</button> ou <button type="button" class="link" data-helena>pedir sugestões à Helena</button></p>`)
        : `<p class="vazio">Crie um ambiente (ex.: Lounge, Cerimônia) para começar.</p>`}
      ${amb?.renders?.length ? `<h2 class="secao-titulo">Imagens</h2><div class="proj-renders">${amb.renders.map((r) => `<img src="${esc(otimizar(r.url, 600))}" alt="" data-zoom="${esc(r.url)}">`).join("")}</div>` : ""}
      ${totalPecas() ? `<div class="total"><span>${totalPecas()} ${totalPecas() === 1 ? "peça" : "peças"} no projeto</span><strong>${dinheiro.format(valor)}</strong></div>
      <div style="padding:16px"><button type="button" class="btn btn-bloco btn-ouro" data-enviar>${ico("enviar")} ${p.status && p.status !== "rascunho" ? "Reenviar pedido" : "Enviar pedido à Chiavari"}</button></div>` : ""}
    </div>`;
  };
  pintar();
  el.setAttribute("data-atualizar", ""); el.addEventListener("atualizar", pintar);
  el.addEventListener("click", async (e) => {
    const abrir = e.target.closest("[data-abrir]"); if(abrir){ await usarProjeto(abrir.dataset.abrir); pintar(); return; }
    if(e.target.closest("[data-novo]")){ if(await criarProjeto()){ await escolherAmbiente(); pintar(); } return; }
    if(e.target.closest("[data-trocar]")){ await salvarAgora(); S.projeto = null; S.ambAtivo = null; gravarAtivo(); pintarAbas(); pintar(); return; }
    const amb = e.target.closest("[data-amb]"); if(amb){ S.ambAtivo = amb.dataset.amb; gravarAtivo(); presenca(true); pintar(); return; }
    if(e.target.closest("[data-novo-amb]")){ await escolherAmbiente(); pintar(); return; }
    const z = e.target.closest("[data-zoom]"); if(z){ abrirZoom(z.dataset.zoom); return; }
    const q = e.target.closest("[data-q]");
    if(q){ const id = q.closest("[data-linha]").dataset.linha; await definirQuantidade(id, qtdNoAmbiente(id) + Number(q.dataset.q), { silencioso: true }); pintar(); return; }
    if(e.target.closest("[data-enviar]")){ await enviarPedido(); pintar(); return; }
    aoClicarComum(e);
  });
  el.addEventListener("change", async (e) => {
    const inp = e.target.closest("[data-qi]");
    if(inp){ await definirQuantidade(inp.closest("[data-linha]").dataset.linha, Number(inp.value) || 0, { silencioso: true }); pintar(); }
  });
  return el;
}
const rotuloStatus = (s) => ({ rascunho: "Em montagem", pedido_enviado: "Pedido enviado", em_analise: "Em análise", convertido: "Convertido em pedido" }[s] || "Em montagem");

async function enviarPedido(){
  if(!S.projeto) return;
  await salvarAgora();
  const r = await folha({ titulo: "Enviar pedido", sub: `${S.projeto.noivos} · ${totalPecas()} peças. A equipe da Chiavari recebe os itens e as quantidades de cada ambiente e confirma a disponibilidade, o frete e os serviços.`,
    corpo: `<form data-form><label class="campo"><span>Observação (opcional)</span><textarea name="obs" maxlength="1000" placeholder="Algo que a equipe precisa saber?"></textarea></label><p class="folha-erro" data-erro></p><button class="btn btn-bloco btn-ouro" type="submit">Enviar pedido</button></form>`,
    aoMontar: ({ el, fechar }) => el.querySelector("[data-form]").addEventListener("submit", async (e) => {
      e.preventDefault(); const btn = e.target.querySelector("button"); btn.disabled = true;
      try{ await rpc("projeto_enviar_pedido", { p_id: S.projeto.id, p_observacao: e.target.obs.value.trim() || null }); fechar(true); }
      catch(error){ el.querySelector("[data-erro]").textContent = mensagem(error); btn.disabled = false; }
    }) });
  if(!r) return;
  S.projeto = normalizarProjeto(await rpc("projeto_obter", { p_id: S.projeto.id }));
  notify({ title: "Pedido enviado!", message: "A equipe da Chiavari já recebeu. Você pode continuar ajustando por aqui." });
}

function telaConta(){
  const nome = S.decorador?.nome || S.sessao?.nomeEquipe || (visitante() ? "Visitante" : "");
  const el = novaTela(`<div class="tela-rolagem">
    <section class="conta-cab"><span class="avatar">${S.decorador?.logo_url ? `<img src="${esc(S.decorador.logo_url)}" alt="">` : esc((nome || "?")[0])}</span><h2>${esc(nome)}</h2><p>${esc(visitante() ? "Explorando o catálogo" : equipe() ? `Equipe · ${S.empresa?.nome || ""}` : `Decorador · ${S.empresa?.nome || ""}`)}</p><div id="catalogUser"></div></section>
    <div class="opcoes">
      ${visitante() ? `<button type="button" class="opcao" data-entrar>${ico("conta")}<span>Entrar com acesso exclusivo</span>${ico("seta")}</button>` : ""}
      <button type="button" class="opcao" data-instalar>${ico("instalar")}<span>Instalar o app no celular</span>${ico("seta")}</button>
      <button type="button" class="opcao" data-site>${ico("site")}<span>Abrir a versão completa</span>${ico("seta")}</button>
      ${!visitante() ? `<button type="button" class="opcao perigo" data-sair>${ico("sair")}<span>Sair</span></button>` : `<button type="button" class="opcao perigo" data-sair>${ico("sair")}<span>Voltar à entrada</span></button>`}
    </div></div>`);
  if(!visitante()) setTimeout(() => window.CatalogCredits?.refresh?.().catch(() => {}), 0);
  el.addEventListener("click", async (e) => {
    if(e.target.closest("[data-site]")){ await salvarAgora(); sessionStorage.setItem("catalogo_versao", "site"); location.href = "catalogo.html" + location.search; return; }
    if(e.target.closest("[data-instalar]")){ instalar(); return; }
    if(e.target.closest("[data-entrar]")){ sessionStorage.removeItem("catalogo_visitante"); location.reload(); return; }
    if(e.target.closest("[data-sair]")){
      await salvarAgora();
      ["catalogo_token", "catalogo_visitante", "catalogo_acesso_interno_direto"].forEach((k) => sessionStorage.removeItem(k));
      if(equipe() && !sessionStorage.getItem("login_ok")) await supabase.auth.signOut().catch(() => {});
      location.reload();
    }
  });
  return el;
}

// Instalação (PWA): Android mostra o convite do navegador; iPhone precisa do "Compartilhar > Adicionar à Tela de Início".
let convite = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); convite = e; });
async function instalar(){
  if(window.matchMedia("(display-mode: standalone)").matches || navigator.standalone){ notify({ title: "O app já está instalado", message: "Você está usando o app agora." }); return; }
  if(convite){ convite.prompt(); const r = await convite.userChoice.catch(() => null); if(r?.outcome === "accepted") notify({ title: "App instalado", message: "Procure o ícone Chiavari na tela inicial." }); convite = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  folha({ titulo: "Instalar o app", sub: ios ? "No iPhone: toque em Compartilhar (o quadrado com a seta, embaixo) e depois em “Adicionar à Tela de Início”." : "No menu do navegador (⋮), toque em “Instalar app” ou “Adicionar à tela inicial”.", corpo: `<button type="button" class="btn btn-bloco btn-claro" onclick="history.back()">Entendi</button>` });
}

// ---------------------------------------------------------------------------------------------------------------
// Helena (assistente comercial)
const ctxHelena = { cenaEditor: null };
function abrirHelena(texto = ""){
  if(visitante()){ notify({ title: "A Helena atende clientes cadastrados", message: "Entre com seu acesso exclusivo para conversar com ela.", status: "error" }); return; }
  S.abaAntesHelena = S.aba;
  abrirCatalogAssistente();
  history.pushState({ helena: true }, "");
  S.naoLidas = 0; pintarAbas();
  if(texto){
    const input = document.querySelector("[data-cas-input]");
    if(input){ input.value = texto; input.dispatchEvent(new Event("input")); setTimeout(() => input.focus(), 300); }
  }
}
// A ponte que a Helena usa pra mexer no projeto (mesma interface do catálogo do computador).
window.catalogAssistenteProjeto = {
  retrato(){
    const p = S.projeto;
    if(!p) return null;
    return { id: p.id, noivos: p.noivos, data_evento: p.data_evento, local_evento: p.local_evento, evento: p.dados?.evento || {}, status: p.status, ambiente_ativo: S.ambAtivo,
      ambientes: ambientes().map((a) => ({ id: a.id, nome: a.nome, itens: a.itens.map((i) => ({ item_id: String(i.item_id), quantidade: Number(i.quantidade) || 1 })) })) };
  },
  async quantidade({ item_id, quantidade, ambiente }){
    if(!S.projeto) throw new Error("Abra ou crie um projeto primeiro.");
    const r = await definirQuantidade(item_id, quantidade, { nomeAmbiente: ambiente || "", silencioso: true });
    if(!r) throw new Error("Não foi possível colocar no projeto.");
    atualizarTelaAtual();
    return { ambiente: r.ambiente, antes: r.antes, desfazer: () => { definirQuantidade(item_id, r.antes, { nomeAmbiente: r.ambiente, silencioso: true }); atualizarTelaAtual(); } };
  },
  async usarProjeto(id){ await usarProjeto(id); atualizarTelaAtual(); },
  enviarPedido(){ setTimeout(() => { irParaAba("projeto"); enviarPedido().then(atualizarTelaAtual); }, 320); },
  async atualizarEvento({ data_evento, local_evento, evento, noivos }){
    const p = S.projeto;
    if(!p) throw new Error("Abra um projeto primeiro.");
    if(data_evento) p.data_evento = data_evento;
    if(local_evento) p.local_evento = local_evento;
    if(evento){ p.dados ||= { ambientes: [] }; p.dados.evento = evento; }
    if(noivos !== undefined){
      const tipo = String(p.dados?.evento?.tipo || "").trim();
      p.noivos = String(noivos || "").trim() || [tipo ? tipo[0].toUpperCase() + tipo.slice(1) : "", p.local_evento].filter(Boolean).join(" · ") || "Evento";
    }
    marcarSujo(); await salvarAgora(); atualizarTelaAtual();
  },
};
// Fotos de composição da Helena: "Adicionar ao projeto" leva a imagem (e os móveis dela) pra um ambiente.
window.catalogRegisterRenderItems = (src, objetos, cena) => {
  const contagem = new Map();
  (objetos || []).forEach((o) => { if(o?.itemId) contagem.set(String(o.itemId), (contagem.get(String(o.itemId)) || 0) + 1); });
  S.composicoes.unshift({ src, itens: [...contagem.entries()].map(([id, quantidade]) => ({ id, quantidade })), cena: cena?.snapshot ? cena : null });
  S.composicoes.length = Math.min(S.composicoes.length, 8);
};
window.catalogAddCompositionToProject = async (src) => {
  if(!(await garantirDestino())) return;
  const amb = ambienteAtivo(), p = S.projeto;
  const aviso = notify({ title: "Salvando a imagem no projeto…", status: "working", duration: 0 });
  try{
    const blob = await (await fetch(src)).blob();
    const caminho = `${S.sessao.empresa_id}/${p.id}/renders/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("projetos").upload(caminho, blob, { contentType: blob.type || "image/jpeg", upsert: false });
    if(error) throw error;
    const comp = S.composicoes.find((c) => c.src === src);
    let cena = null;
    if(comp?.cena){
      const cc = `${S.sessao.empresa_id}/${p.id}/cenas/${crypto.randomUUID()}.json`;
      const { error: e2 } = await supabase.storage.from("projetos").upload(cc, new Blob([JSON.stringify(comp.cena.snapshot)], { type: "application/json" }), { contentType: "application/json" });
      if(!e2) cena = { url: supabase.storage.from("projetos").getPublicUrl(cc).data.publicUrl, path: cc, tipo: "ia" };
    }
    amb.renders.push({ id: novoId("r"), url: supabase.storage.from("projetos").getPublicUrl(caminho).data.publicUrl, path: caminho, origem: "Assistente comercial", criado_em: new Date().toISOString(), ...(cena ? { cena } : {}) });
    (comp?.itens || []).forEach(({ id, quantidade }) => {
      const linha = amb.itens.find((i) => String(i.item_id) === id);
      if(!linha) amb.itens.push({ item_id: id, quantidade });
      else if((Number(linha.quantidade) || 0) < quantidade) linha.quantidade = quantidade;
    });
    marcarSujo(); await salvarAgora();
    aviso.close();
    notify({ title: "Imagem salva no projeto", message: `${amb.nome}${comp?.itens?.length ? ` · ${comp.itens.length} móveis junto` : ""}`, image: src });
    atualizarTelaAtual();
  }catch(error){ aviso.close(); notify({ title: "Não foi possível salvar", message: mensagem(error), status: "error" }); }
};
// Botões "＋ Projeto" dos cartões da Helena.
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-projeto-add]");
  if(!b) return;
  e.preventDefault(); e.stopPropagation();
  definirQuantidade(b.dataset.projetoAdd, qtdNoAmbiente(b.dataset.projetoAdd) + 1);
}, true);

// O motor 3D (pra a Helena montar as fotos): busca as peças de tela do 3D Livre no próprio catalogo.html e liga escondido.
async function prepararMotor3D(){
  try{
    const html = await (await fetch("catalogo.html", { cache: "no-store" })).text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const host = $("appStudioHost");
    const pecas = [doc.getElementById("catalogStudio"), ...doc.querySelectorAll("dialog[id^='studio']")].filter(Boolean);
    pecas.forEach((p) => host.appendChild(document.importNode(p, true)));
    const m = await import("./catalogo-studio3d.mjs?v=20261015-assistente");
    m.initCatalogStudio3D({ items: S.itens, supabase, empresaId: S.sessao.empresa_id, ownerId: S.sessao.cliente_id, token: S.sessao.token });
    ctxHelena.cenaEditor = m.cenaEditor;
  }catch(error){ console.warn("Motor 3D indisponível no app:", error); }
}

// ---------------------------------------------------------------------------------------------------------------
// Entrada
async function resolverEquipe(){
  try{
    const { data } = await supabase.auth.getUser();
    if(!data?.user) return null;
    const empresaId = await getEmpresaAtualId();
    const { data: acesso } = await supabase.rpc("funcionario_contexto", { p_empresa_id: empresaId });
    if(!acesso?.ativo) return null;
    if(!acesso.administrador_legado){
      const { data: perms } = await supabase.rpc("get_permissoes_usuario_resolvidas", { p_empresa_id: empresaId, p_usuario_id: data.user.id });
      if(!perms?.some((p) => p.chave === "comercial.catalogo.visualizar" && p.permitido)) return null;
    }
    const { data: u } = await supabase.from("usuarios").select("nome").eq("id", data.user.id).maybeSingle();
    return { token: null, cliente_id: null, empresa_id: empresaId, nomeEquipe: u?.nome || data.user.email };
  }catch{ return null; }
}
async function resolverSessao(){
  if(sessionStorage.getItem("catalogo_visitante")) return { token: null, cliente_id: null, empresa_id: null, visitante: true };
  const token = sessionStorage.getItem("catalogo_token");
  if(token){
    const { data } = await supabase.rpc("catalogo_validar_sessao", { p_token: token });
    if(data?.valido) return { token, cliente_id: data.cliente_id, empresa_id: data.empresa_id };
    sessionStorage.removeItem("catalogo_token");
  }
  return await resolverEquipe();
}
function telaLogin(){
  return new Promise((resolve) => {
    const el = document.createElement("section");
    el.className = "login";
    el.innerHTML = `<div class="login-topo" data-topo><img class="login-logo" data-logo alt="" hidden><p class="login-frase">Transite por vários estilos e encontre <em>o seu</em></p></div>
      <div class="login-corpo"><p class="login-convite">Acesse seu catálogo exclusivo</p>
        <form data-form style="display:flex;flex-direction:column;gap:14px"><label class="campo"><span>E-mail</span><input name="email" type="email" autocomplete="username" inputmode="email" required></label>
        <label class="campo"><span>Senha</span><input name="senha" type="password" autocomplete="current-password" required></label>
        <p class="login-erro" data-erro></p><button class="btn btn-bloco" type="submit">Entrar</button></form>
        <p class="login-ou">ou</p><button type="button" class="btn btn-bloco btn-claro" data-visitante>Explorar o catálogo</button></div>`;
    $("appTelas").appendChild(el);
    supabase.rpc("catalogo_vitrine_login", new URLSearchParams(location.search).get("empresa") ? { p_empresa_id: new URLSearchParams(location.search).get("empresa") } : {}).then(({ data }) => {
      const logo = data?.logo_url || data?.empresa?.logo_url;
      if(logo){ const l = el.querySelector("[data-logo]"); l.src = logo; l.hidden = false; }
    }).catch(() => {});
    supabase.rpc("catalogo_capas_publico", {}).then(({ data }) => { const u = data?.portal || data?.catalogo; if(u) el.querySelector("[data-topo]").style.backgroundImage = `url('${otimizar(u, 1000)}')`; }).catch(() => {});
    el.querySelector("[data-visitante]").addEventListener("click", () => { sessionStorage.setItem("catalogo_visitante", "1"); el.remove(); resolve({ token: null, cliente_id: null, empresa_id: null, visitante: true }); });
    el.querySelector("[data-form]").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, btn = f.querySelector("button"), erro = el.querySelector("[data-erro]");
      btn.disabled = true; erro.textContent = "Verificando…";
      const email = f.email.value.trim().toLowerCase(), senha = f.senha.value;
      const { data, error } = await supabase.rpc("catalogo_login", { p_email: email, p_senha: senha });
      if(!error && data?.token){ sessionStorage.setItem("catalogo_token", data.token); el.remove(); resolve({ token: data.token, cliente_id: data.cliente_id, empresa_id: data.empresa_id }); return; }
      if(error && /failed to fetch|network/i.test(String(error.message))){ erro.textContent = "Sem conexão. Verifique a internet."; btn.disabled = false; return; }
      const { data: auth, error: authErro } = await supabase.auth.signInWithPassword({ email, password: senha });
      if(!authErro && auth?.user){
        const s = await resolverEquipe();
        if(s){ sessionStorage.setItem("catalogo_acesso_interno_direto", "1"); el.remove(); resolve(s); return; }
        await supabase.auth.signOut();
      }
      erro.textContent = "E-mail ou senha inválidos."; btn.disabled = false;
    });
  });
}
async function carregarCatalogo(){
  if(visitante()){
    const emp = new URLSearchParams(location.search).get("empresa");
    const { data, error } = await supabase.rpc("catalogo_publico_carregar", emp ? { p_empresa_id: emp } : {});
    if(error || !Array.isArray(data?.itens)) throw error || new Error("Catálogo indisponível");
    S.empresa = data.empresa || null; S.sessao.empresa_id = data.empresa_id || null;
    return data.itens;
  }
  const externo = Boolean(S.sessao.token);
  const { data, error } = await supabase.rpc(externo ? "catalogo_carregar" : "catalogo_carregar_interno", externo ? { p_token: S.sessao.token } : { p_empresa_id: S.sessao.empresa_id });
  if(error || !Array.isArray(data?.itens)) throw error || new Error("Catálogo indisponível");
  S.empresa = data.empresa || null; S.decorador = externo ? data.decorador || null : null;
  return data.itens;
}
async function carregarCapas(){
  try{
    const { data } = visitante() ? await supabase.rpc("catalogo_capas_publico", {})
      : await supabase.rpc(S.sessao.token ? "catalogo_capas_carregar" : "catalogo_capas_carregar_interno", S.sessao.token ? { p_token: S.sessao.token } : { p_empresa_id: S.sessao.empresa_id });
    S.capas = data || {};
  }catch{ S.capas = {}; }
}

async function iniciar(){
  const abertura = $("appAbertura");
  const sairAbertura = () => { abertura.classList.add("is-saindo"); setTimeout(() => abertura.remove(), 500); };
  try{
    if(!supabase) throw new Error("Sem conexão com o servidor.");
    S.sessao = await resolverSessao();
    if(!S.sessao){ sairAbertura(); S.sessao = await telaLogin(); $("appAbertura")?.remove(); }
    const linhas = await carregarCatalogo();
    S.itens = agruparVariantes(linhas.filter((r) => ["item", "kit"].includes(String(r?.tipo || "").toLowerCase())).map(mapRow));
    if(S.empresa?.logo_url){ const l = $("appAberturaLogo"); if(l){ l.src = S.empresa.logo_url; l.hidden = false; } }
    await carregarCapas();
    if(!visitante()){
      const ativo = lerAtivo();
      if(ativo?.id) await usarProjeto(ativo.id, ativo.amb).catch(() => { try{ localStorage.removeItem(chaveAtivo()); }catch{} });
      initCatalogAssistente(Object.assign(ctxHelena, {
        supabase, getSession: () => S.sessao, modoPedido: false, notify, temProjetos: true,
        // Fechar a Helena dispara um "voltar" (history); espera ele passar antes de empilhar a tela do item.
        findItem: acharItem, abrirItem: (id) => setTimeout(() => abrirItem(id), 320),
        mostrarNoCatalogo: (ids, opcoes) => { setTimeout(() => mostrarPelaHelena(ids, opcoes), 340); return true; },
      }));
      // Fechar a Helena (voltar/minimizar) devolve pra aba de antes; foto nova com ela fechada vira um ponto na aba.
      new MutationObserver(() => {
        const aberta = document.body.classList.contains("assistente-aberta");
        if(!aberta && history.state?.helena) history.back();
      }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
      document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden") salvarAgora(); else presenca(true); });
      setInterval(() => presenca(true), 60000);
      setTimeout(prepararMotor3D, 1500);
    }
    irParaAba(new URLSearchParams(location.search).get("aba") || "inicio");
    sairAbertura();
  }catch(error){
    console.error(error);
    abertura.querySelector(".app-abertura-linha")?.remove();
    abertura.insertAdjacentHTML("beforeend", `<p style="max-width:280px;text-align:center;color:rgba(255,255,255,.8);font-size:.95rem">Não foi possível abrir o catálogo agora.</p><button class="btn btn-claro" onclick="location.reload()">Tentar de novo</button>`);
  }
}
$("appAbas").addEventListener("click", (e) => { const b = e.target.closest("[data-aba]"); if(b) irParaAba(b.dataset.aba); });
if("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("catalogo-app-sw.js").catch(() => {}));
iniciar();
