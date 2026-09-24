// Vitrine da tela de login do catálogo (pedido do usuário, com referência visual): peças do PRÓPRIO acervo ao redor do
// login, algumas nítidas, outras desfocadas/apagadas, trocando devagar com fade, "como uma vitrine viva do catálogo".
// As fotos e a logo vêm da RPC pública catalogo_vitrine_login (roda antes do login; ver a migration). Self-contido: não
// importa nada de catalogo.mjs. iniciarVitrineLogin() devolve uma função que para tudo (chamada quando o login some).

// Posições em % da área abaixo da faixa (pedido do usuário: "mais embaralhado", não duas colunas de cada lado): alturas,
// tamanhos e distâncias do centro irregulares, e duas peças pequenas acima da frase e abaixo do cartão. Nenhuma encosta na
// coluna central (frase + cartão). w em vw; mh = altura máxima em vh (as de cima/baixo do centro são baixinhas pra não
// invadir a frase nem o cartão); nitida=false => desfocada e apagada. "cel" = as que aparecem no celular.
const SLOTS = [
  { l: 2, t: 5, w: 12, nitida: true, cel: true },
  { l: 17, t: 15, w: 7, nitida: false },
  { l: 27, t: 3, w: 5, mh: 13, nitida: false },
  { l: 5, t: 34, w: 15, nitida: true },
  { l: 24, t: 40, w: 7, nitida: false },
  { l: 14, t: 64, w: 12, nitida: true, cel: true },
  { l: 1, t: 80, w: 8, nitida: false },
  { l: 43, t: 2, w: 6, mh: 14, nitida: false, cel: true },
  { l: 52, t: 85, w: 7, mh: 11, nitida: false },
  { r: 4, t: 3, w: 9, nitida: false },
  { r: 14, t: 8, w: 13, nitida: true, cel: true },
  { r: 26, t: 30, w: 6, nitida: false },
  { r: 2, t: 38, w: 15, nitida: true },
  { r: 20, t: 60, w: 8, nitida: false },
  { r: 5, t: 72, w: 14, nitida: true, cel: true },
];
const JITTER = 1.6;         // cada visita desloca as peças um pouco (± % da tela), pra nunca parecer uma grade fixa
const TROCA_MS = 3600;      // intervalo entre uma troca e outra (uma peça por vez)
const FADE_MS = 1800;       // duração do fade de cada troca

function otimizarFoto(url, width){
  if(!url || !String(url).includes("/storage/v1/object/public/")) return url || "";
  const u = String(url).replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  return `${u}${u.includes("?") ? "&" : "?"}width=${width}&quality=78&resize=contain`;
}
const escapar = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Seta "desconstruída" do nome (pedido do usuário): traço curvo saindo da peça e a ponta solta, um pouco afastada do traço.
const SETA = '<svg class="catalog-login-seta" viewBox="0 0 48 36" aria-hidden="true"><path class="traco" d="M3 33c6-9 13-16 22-21 4-2 8-3 12-4"/><path class="ponta" d="M34 3.5l7.5 3.8-5.6 6"/></svg>';
const embaralhar = (lista) => { const a = [...lista]; for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function iniciarVitrineLogin(supabase, { empresaId = null } = {}){
  const vitrine = document.querySelector("[data-login-vitrine]");
  const marca = document.querySelector("[data-login-marca]");
  if(!vitrine || !supabase?.rpc) return () => {};
  let parado = false, timer = null;
  let parar = () => { parado = true; clearInterval(timer); };

  (async () => {
    let dados = null;
    try{
      const { data, error } = await supabase.rpc("catalogo_vitrine_login", empresaId ? { p_empresa_id: empresaId } : {});
      if(error) throw error;
      dados = data;
    }catch(error){ console.warn("Vitrine do login indisponível:", error); }
    if(parado || !dados) return;

    // Logo da empresa, em branco sobre a faixa escura. A da Chiavari é um PNG quadrado com a arte numa faixa estreita no
    // meio: logo quadrada ganha .is-quadrada e é recortada nessa faixa (mesma técnica do cabeçalho do pedido).
    if(marca){
      const empresa = dados.empresa || {};
      if(empresa.logo_url){
        const img = new Image();
        img.className = "catalog-login-logo"; img.alt = empresa.nome || "Logo";
        img.onload = () => { if(img.naturalWidth / img.naturalHeight < 1.6) img.classList.add("is-quadrada"); marca.classList.add("is-pronta"); };
        img.src = empresa.logo_url;
        marca.replaceChildren(img);
      }else if(empresa.nome){ marca.textContent = empresa.nome; marca.classList.add("is-pronta"); }
    }

    const nomes = new Map((dados.fotos || []).map((f) => [f.url, f.nome || ""]));
    const fotos = embaralhar((dados.fotos || []).map((f) => f.url).filter(Boolean));
    if(!fotos.length) return;
    const compacto = matchMedia("(max-width: 900px)").matches;
    const slots = compacto ? SLOTS.filter((s) => s.cel) : SLOTS;
    const sorteio = () => (Math.random() * 2 - 1) * JITTER;
    let proxima = 0;
    const pegar = () => { const url = fotos[proxima % fotos.length]; proxima += 1; return url; };
    const naTela = new Set();

    const elementos = slots.map((s, i) => {
      const el = document.createElement("div");
      el.className = `catalog-login-peca${s.nitida ? "" : " is-fundo"}`;
      const lado = s.l !== undefined ? `left:${Math.max(0, s.l + sorteio())}%` : `right:${Math.max(0, s.r + sorteio())}%`;
      el.style.cssText = `${lado};top:${Math.max(0, s.t + sorteio())}%;width:${compacto ? s.w * 2.2 : s.w}vw;--atraso:${i * 160}ms;--flutua:${9 + Math.random() * 7}s;--flutua-atraso:${-Math.random() * 12}s${s.mh ? `;--mh:${s.mh}vh` : ""}`;
      const img = document.createElement("img");
      img.alt = ""; img.decoding = "async"; img.draggable = false;
      const url = pegar(); naTela.add(url);
      img.src = otimizarFoto(url, s.nitida ? 520 : 320);
      img.onload = () => { el.classList.add("is-visivel"); evitarCentro(); };
      el.appendChild(img); el.dataset.url = url;
      // Nome ao passar o mouse, só nas peças nítidas: seta + nome, apontando pro lado do centro da tela (as da direita
      // espelham) e, nas que ficam coladas na faixa de cima, abaixo da peça em vez de acima.
      if(s.nitida){
        el.classList.add(s.r !== undefined ? "is-direita" : "is-esquerda");
        if(s.t < 15) el.classList.add("is-abaixo");
        const nome = document.createElement("span");
        nome.className = "catalog-login-nome";
        nome.innerHTML = `${SETA}<em>${escapar(nomes.get(url))}</em>`;
        el.appendChild(nome);
      }
      vitrine.appendChild(el);
      return el;
    });

    // Em tela baixa ou estreita nem todas as posições cabem: a peça que encostaria na frase ou no cartão não aparece (e não
    // entra na troca). Recalculado a cada imagem carregada e ao redimensionar.
    function evitarCentro(){
      const centro = document.querySelector(".catalog-login-centro")?.getBoundingClientRect();
      if(!centro) return;
      const folga = 12;
      elementos.forEach((el) => {
        el.classList.remove("is-fora");
        const r = el.querySelector("img").getBoundingClientRect();
        if(!r.width) return;
        const toca = r.left < centro.right + folga && r.right > centro.left - folga && r.top < centro.bottom + folga && r.bottom > centro.top - folga;
        el.classList.toggle("is-fora", toca);
      });
    }
    let redim = null;
    const aoRedimensionar = () => { clearTimeout(redim); redim = setTimeout(evitarCentro, 150); };
    window.addEventListener("resize", aoRedimensionar);
    const pararAntes = parar;
    parar = () => { pararAntes(); window.removeEventListener("resize", aoRedimensionar); };
    evitarCentro();

    if(matchMedia("(prefers-reduced-motion: reduce)").matches || fotos.length <= elementos.length) return;
    // Uma peça por vez: some devagar, troca por outra do acervo que não está na tela, e reaparece.
    let ultima = -1;
    timer = setInterval(() => {
      if(parado || document.hidden) return;
      let i = Math.floor(Math.random() * elementos.length);
      if(i === ultima) i = (i + 1) % elementos.length;
      ultima = i;
      const el = elementos[i];
      if(el.classList.contains("is-fora") || el.matches(":hover")) return; // escondida por falta de espaço, ou com o nome aberto
      let url = pegar(), tentativas = 0;
      while(naTela.has(url) && tentativas++ < fotos.length) url = pegar();
      if(naTela.has(url)) return;
      el.classList.remove("is-visivel");
      setTimeout(() => {
        if(parado) return;
        naTela.delete(el.dataset.url); naTela.add(url); el.dataset.url = url;
        const rotulo = el.querySelector(".catalog-login-nome em");
        if(rotulo) rotulo.textContent = nomes.get(url) || "";
        const img = el.querySelector("img");
        img.onload = () => { el.classList.add("is-visivel"); evitarCentro(); };
        img.src = otimizarFoto(url, el.classList.contains("is-fundo") ? 320 : 520);
      }, FADE_MS);
    }, TROCA_MS);
  })();

  return () => parar();
}
