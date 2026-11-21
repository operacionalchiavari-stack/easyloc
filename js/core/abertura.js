/**
 * ABERTURA DO SISTEMA (nov/2026, pedido do usuário: "nunca o vinho nem a logo Acervo… uma animação premium ao
 * entrar"). Uma tela na cor do menu cobre o sistema desde a 1ª pintura, com a logo DA EMPRESA se desenhando,
 * um filete dourado e "Bem-vindo(a), <nome>". Quando o menu e a logo do sistema estão prontos, a logo da abertura
 * voa até o lugar dela no menu e a tela some. Nunca mostra logo genérica: sem logo conhecida, só o filete.
 *
 *  - dashboard.html: <script src="js/core/abertura.js" data-abertura="sistema"> no <head> (síncrono).
 *  - login.html: AcervoAbertura.doLogin() depois de entrar, antes de ir para o sistema (a mesma tela cresce a
 *    partir da faixa do topo; o sistema começa com ela já montada, sem piscar).
 */
(function () {
  "use strict";
  if (window.AcervoAbertura) return;
  const raiz = document.documentElement;
  const reduzido = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } })();
  const hex = v => /^#[0-9a-f]{6}$/i.test(String(v || "").trim());

  function festivoAtivo(t) {
    try {
      if (!["carnaval", "natal", "pascoa", "ano_novo"].includes(t.tema_festivo)) return "";
      const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      const v = k => p.find(x => x.type === k).value, hoje = `${v("year")}-${v("month")}-${v("day")}`;
      const d = x => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ""));
      const c = String(t.cores_sistema?.cor_sidebar || "").trim().toLowerCase();
      return d(t.tema_festivo_inicio) && d(t.tema_festivo_fim) && t.tema_festivo_inicio <= hoje && hoje <= t.tema_festivo_fim && hex(c) ? c : "";
    } catch (_) { return ""; }
  }
  // A cor de fundo acompanha a do menu (--color-sidebar), inclusive quando o tema chega do banco depois.
  function pintarCor(cor) {
    if (!el || !hex(cor) || el.dataset.cor === cor) return;
    el.dataset.cor = cor;
    el.style.setProperty("--ab-cor", cor);
    el.style.setProperty("--ab-claro", clarear(cor, .12));
    el.style.setProperty("--ab-escuro", escurecer(cor, .38));
  }
  function corDoMenu() {
    try {
      const c = getComputedStyle(document.documentElement).getPropertyValue("--color-sidebar").trim().toLowerCase();
      return hex(c) && c !== "#290610" ? c : "";
    } catch (_) { return ""; }
  }

  function marca() {
    let logo = "", cor = "#5a5a55";
    try {
      const id = sessionStorage.getItem("empresa_id") || localStorage.getItem("acervo_ultima_empresa");
      const t = id && JSON.parse(localStorage.getItem("easyloc_theme_" + id) || "null");
      if (t) {
        logo = t.logo_url || "";
        const c = String(t.cor_sidebar || "").trim().toLowerCase();
        if (hex(c) && c !== "#290610") cor = c;
        // Tema festivo (Natal, Carnaval…) no período: a cor do menu é a do tema (mesma regra do themePrepaint).
        const f = festivoAtivo(t);
        if (f) cor = f;
      }
    } catch (_) {}
    if (logo && !/^(blob:|data:)/.test(logo)) {
      const limpa = logo.replace(/([?&])v=[^&]*(&?)/, (m, a, b) => (b ? a : ""));
      logo = limpa + (limpa.includes("?") ? "&" : "?") + "v=stable";
    }
    return { logo, cor };
  }

  function primeiroNome() {
    try {
      const n = String(sessionStorage.getItem("usuario_nome") || "").trim().split(/\s+/)[0];
      return n && n.toLowerCase() !== "usuário" ? n : "";
    } catch (_) { return ""; }
  }

  function clarear(cor, f) {
    const n = parseInt(cor.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * f));
    return "rgb(" + c.join(",") + ")";
  }
  function escurecer(cor, f) {
    const n = parseInt(cor.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * (1 - f)));
    return "rgb(" + c.join(",") + ")";
  }

  const CSS = `
#acervoAbertura{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow:hidden;
  color:#fff;font-family:"Manrope","Inter",system-ui,sans-serif;-webkit-font-smoothing:antialiased;
  transition:opacity .75s cubic-bezier(.22,1,.36,1)}
#acervoAbertura *{box-sizing:border-box}
#acervoAbertura .ab-fundo{position:absolute;inset:0;will-change:opacity;background:radial-gradient(120% 90% at 50% 42%,var(--ab-claro) 0%,var(--ab-cor) 46%,var(--ab-escuro) 100%)}
#acervoAbertura.voando{pointer-events:none}
#acervoAbertura.voando :is(.ab-luz,.ab-aneis,.ab-grao,.ab-brilho){display:none!important}
#acervoAbertura.voando :is(.ab-fundo,.ab-texto,.ab-filete){opacity:0!important;transition:opacity .7s cubic-bezier(.22,1,.36,1)}
#acervoAbertura.voando .ab-logo{animation:none!important;clip-path:none!important;opacity:1;will-change:transform}
#acervoAbertura.leve :is(.ab-luz,.ab-aneis,.ab-grao){display:none!important}
#acervoAbertura .ab-luz{position:absolute;border-radius:50%;opacity:.55;pointer-events:none;will-change:transform}
#acervoAbertura .ab-luz.l1{width:46vmax;height:46vmax;left:-12vmax;top:-14vmax;background:radial-gradient(circle,rgba(212,182,132,.32),transparent 66%);animation:abDeriva 14s ease-in-out infinite alternate}
#acervoAbertura .ab-luz.l2{width:40vmax;height:40vmax;right:-12vmax;bottom:-16vmax;background:radial-gradient(circle,rgba(255,255,255,.16),transparent 66%);animation:abDeriva 17s ease-in-out infinite alternate-reverse}
#acervoAbertura .ab-aneis{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none}
#acervoAbertura .ab-aneis i{position:absolute;left:0;top:0;width:var(--d);height:var(--d);margin:calc(var(--d) / -2) 0 0 calc(var(--d) / -2);
  border:1px solid rgba(255,255,255,.08);border-radius:50%;animation:abAnel 3.6s cubic-bezier(.22,1,.36,1) infinite;animation-delay:var(--a);opacity:0}
#acervoAbertura .ab-grao{position:absolute;inset:0;opacity:.06;pointer-events:none;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>")}
#acervoAbertura .ab-centro{position:relative;display:flex;flex-direction:column;align-items:center;gap:26px;padding:24px;text-align:center}
#acervoAbertura .ab-logo-caixa{position:relative;display:grid;place-items:center;min-height:90px}
#acervoAbertura .ab-logo{display:block;height:84px;width:auto;max-width:min(380px,78vw);object-fit:contain;filter:brightness(0) invert(1);
  opacity:0;clip-path:inset(0 100% 0 0);will-change:transform,clip-path,opacity}
#acervoAbertura .ab-logo.is-quadrada{width:312px;height:90px;max-width:78vw;object-fit:cover;object-position:center 49%}
#acervoAbertura .ab-logo.ver{animation:abRevela 1.25s cubic-bezier(.65,0,.25,1) forwards}
#acervoAbertura.continua .ab-logo.ver{animation:none;opacity:1;clip-path:inset(0 0 0 0)}
#acervoAbertura .ab-brilho{position:absolute;inset:-10px -30px;pointer-events:none;overflow:hidden;
  -webkit-mask:var(--ab-mascara) center/contain no-repeat;mask:var(--ab-mascara) center/contain no-repeat}
#acervoAbertura .ab-brilho::before{content:"";position:absolute;top:0;bottom:0;width:38%;left:-45%;
  background:linear-gradient(100deg,transparent,rgba(255,236,200,.85),transparent);transform:skewX(-18deg);animation:abBrilho 2.8s 1.1s ease-in-out infinite}
#acervoAbertura .ab-filete{width:180px;height:1px;background:linear-gradient(90deg,transparent,#d8bd8c,transparent);transform:scaleX(0);
  animation:abFilete 1.1s .55s cubic-bezier(.22,1,.36,1) forwards}
#acervoAbertura.continua .ab-filete{animation:abPulso 2.2s ease-in-out infinite;transform:scaleX(1)}
#acervoAbertura .ab-filete.espera{animation:abFilete 1.1s cubic-bezier(.22,1,.36,1) forwards,abPulso 2.2s 1.1s ease-in-out infinite}
#acervoAbertura .ab-texto{font-size:12px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:rgba(255,255,255,.78);
  opacity:0;transform:translateY(8px);animation:abSobe .9s 1s cubic-bezier(.22,1,.36,1) forwards}
#acervoAbertura.continua .ab-texto{animation:none;opacity:1;transform:none}
#acervoAbertura .ab-texto b{color:#fff;font-weight:700}
#acervoAbertura.saindo{opacity:0;pointer-events:none}
#acervoAbertura.saindo .ab-texto,#acervoAbertura.saindo .ab-filete{opacity:0;transition:opacity .35s}
@keyframes abRevela{0%{opacity:0;clip-path:inset(0 100% 0 0);transform:translateY(6px) scale(.985)}
  12%{opacity:1}100%{opacity:1;clip-path:inset(0 0 0 0);transform:none}}
@keyframes abBrilho{0%{left:-45%}55%,100%{left:120%}}
@keyframes abFilete{to{transform:scaleX(1)}}
@keyframes abPulso{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes abSobe{to{opacity:1;transform:none}}
@keyframes abDeriva{to{transform:translate(6vmax,4vmax) scale(1.08)}}
@keyframes abAnel{0%{opacity:0;transform:scale(.55)}25%{opacity:1}100%{opacity:0;transform:scale(1.25)}}
@media (max-width:600px){#acervoAbertura .ab-logo{height:64px}#acervoAbertura .ab-logo.is-quadrada{width:236px;height:68px}#acervoAbertura .ab-texto{font-size:11px;letter-spacing:.26em}}
@media (prefers-reduced-motion:reduce){#acervoAbertura *{animation:none!important}
  #acervoAbertura .ab-logo{opacity:1;clip-path:none}#acervoAbertura .ab-filete{transform:scaleX(1)}#acervoAbertura .ab-texto{opacity:1;transform:none}}`;

  let el = null, inicio = 0, logoPronta = false;
  // Aparelho fraco (poucos núcleos/memória ou economia de dados): abertura sem as luzes e sem o voo da logo.
  const fraco = (() => { try { const n = navigator; return (n.hardwareConcurrency && n.hardwareConcurrency <= 2) || (n.deviceMemory && n.deviceMemory <= 2) || (n.connection && n.connection.saveData); } catch (_) { return false; } })();
  // Mede os quadros durante a abertura: se a tela está engasgando, a saída é só a transição (sem a logo voar).
  const quadros = { lentos: 0, total: 0, ultimo: 0 };
  function medir(t) {
    if (!el) return;
    if (quadros.ultimo) { const d = t - quadros.ultimo; quadros.total++; if (d > 40) quadros.lentos++; }
    quadros.ultimo = t; requestAnimationFrame(medir);
  }
  const engasgando = () => quadros.total > 10 && quadros.lentos / quadros.total > 0.25;

  function montar(opcoes) {
    if (el) return el;
    if (!document.getElementById("acervoAberturaCss")) {
      const s = document.createElement("style"); s.id = "acervoAberturaCss"; s.textContent = CSS;
      (document.head || raiz).appendChild(s);
    }
    const m = marca(), nome = primeiroNome();
    el = document.createElement("div");
    el.id = "acervoAbertura";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "Abrindo o sistema");
    pintarCor(m.cor);
    if (opcoes && opcoes.continua) el.classList.add("continua");
    if (fraco) el.classList.add("leve");
    el.innerHTML = `<span class="ab-fundo"></span><span class="ab-luz l1"></span><span class="ab-luz l2"></span>
      <span class="ab-aneis"><i style="--d:300px;--a:0s"></i><i style="--d:470px;--a:1.2s"></i><i style="--d:640px;--a:2.4s"></i></span>
      <span class="ab-grao"></span>
      <div class="ab-centro">
        <div class="ab-logo-caixa"><img class="ab-logo" alt=""><span class="ab-brilho" hidden></span></div>
        <i class="ab-filete"></i>
        <p class="ab-texto">${nome ? `Bem-vindo, <b>${nome.replace(/[<>&"]/g, "")}</b>` : "Preparando tudo para você"}</p>
      </div>`;
    raiz.appendChild(el);
    inicio = performance.now();
    requestAnimationFrame(medir);
    if (m.logo) definirLogo(m.logo); else el.querySelector(".ab-filete").classList.add("espera");
    return el;
  }

  function definirLogo(url) {
    if (!el || !url) return;
    const img = el.querySelector(".ab-logo");
    if (img.dataset.url === url) return;
    img.dataset.url = url;
    img.onload = () => {
      img.classList.toggle("is-quadrada", !!img.naturalWidth && img.naturalWidth / img.naturalHeight < 1.6);
      img.classList.add("ver");
      logoPronta = true;
      // Brilho que passa por dentro da logo: usa a própria logo como máscara.
      const b = el.querySelector(".ab-brilho");
      if (!img.classList.contains("is-quadrada")) { b.style.setProperty("--ab-mascara", `url("${url}")`); b.hidden = false; }
    };
    img.onerror = () => { logoPronta = true; };
    img.src = url;
  }

  function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }

  // A logo da abertura voa até a logo do menu (mesmo recorte) e a tela some por trás.
  async function sair() {
    if (!el || el.classList.contains("saindo")) return;
    const fim = el;
    const img = fim.querySelector(".ab-logo");
    const alvo = document.getElementById("sidebarLogo");
    const r1 = img.getBoundingClientRect();
    const r2 = alvo && alvo.getAttribute("src") && alvo.offsetParent !== null ? alvo.getBoundingClientRect() : null;
    const podeVoar = !reduzido && !fraco && !engasgando() && img.classList.contains("ver") && r1.width && r2 && r2.width && r2.top < innerHeight && r2.bottom > 0;
    if (podeVoar && img.animate) {
      // A página usa zoom (systemZoom.js, html{zoom:.9}): as medidas já vêm com o zoom, mas o translate é aplicado
      // antes dele. Sem dividir, a logo andava só 90% do caminho e "pulava" para o lugar no fim (nov/2026).
      alvo.style.transition = "none"; alvo.style.opacity = "0";
      fim.classList.add("voando");
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      // Mede de novo já no modo de voo (sem a animação de entrada) e o destino no último instante.
      const a = img.getBoundingClientRect(), b = alvo.getBoundingClientRect();
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const dx = ((b.left + b.width / 2) - (a.left + a.width / 2)) / zoom;
      const dy = ((b.top + b.height / 2) - (a.top + a.height / 2)) / zoom;
      const esc = Math.min(b.width / a.width, b.height / a.height);
      const anim = img.animate([
        { transform: "translate(0,0) scale(1)" },
        { transform: `translate(${dx}px,${dy}px) scale(${esc})` }
      ], { duration: 900, easing: "cubic-bezier(.65,0,.25,1)", fill: "forwards", composite: "replace" });
      await anim.finished.catch(() => {});
      alvo.style.transition = "opacity .3s"; alvo.style.opacity = "";
      img.style.transition = "opacity .3s"; img.style.opacity = "0";
      await esperar(320);
      alvo.style.transition = "";
    } else {
      fim.classList.add("saindo");
      await esperar(reduzido ? 200 : 780);
    }
    fim.remove();
    if (el === fim) el = null;
    window.dispatchEvent(new CustomEvent("acervo:abertura-fim"));
  }

  // ---- No sistema (dashboard): fica até a logo e o menu estarem prontos ----
  function noSistema() {
    let veioDoLogin = false;
    try { veioDoLogin = sessionStorage.getItem("acervo_abertura") === "login"; sessionStorage.removeItem("acervo_abertura"); } catch (_) {}
    montar({ continua: veioDoLogin });
    const minimo = reduzido ? 300 : (veioDoLogin ? 1500 : 1100);
    const maximo = 9000;
    window.addEventListener("easyloc:themechange", e => {
      const logo = e.detail && e.detail.logo_url;
      if (logo && el && !el.querySelector(".ab-logo").dataset.url) {
        el.querySelector(".ab-filete").classList.remove("espera");
        definirLogo(logo);
      }
    });
    const pronto = () => {
      const menu = document.getElementById("appMenu");
      const logo = document.getElementById("sidebarLogo");
      const menuOk = menu && menu.children.length > 0;
      const logoOk = logo && logo.getAttribute("src") && logo.complete && logo.naturalWidth > 0;
      // Na Início, espera o mural ser montado por baixo (montar trava a página; voar ao mesmo tempo engasgava).
      const inicioOk = !document.body.classList.contains("portal-em-inicio") && new URLSearchParams(location.search).get("page") || window.__portalInicioPronto || performance.now() - inicio > 4000;
      return menuOk && logoOk && inicioOk && (logoPronta || !el?.querySelector(".ab-logo").dataset.url);
    };
    const conferir = async () => {
      const t = performance.now() - inicio;
      const cm = corDoMenu(); if (cm) pintarCor(cm);
      if ((pronto() && t >= minimo) || t >= maximo) {
        // deixa a logo terminar de se desenhar antes de voar
        if (!veioDoLogin && t < 1400 && !reduzido && logoPronta) await esperar(1400 - t);
        const vai = () => requestAnimationFrame(() => requestAnimationFrame(sair));
        if (window.requestIdleCallback) requestIdleCallback(vai, { timeout: 700 }); else setTimeout(vai, 60);
        return;
      }
      setTimeout(conferir, 120);
    };
    setTimeout(conferir, 200);
  }

  // ---- No login: a faixa do topo cresce e vira a abertura; depois vai para o sistema ----
  async function doLogin() {
    try { sessionStorage.setItem("acervo_abertura", "login"); } catch (_) {}
    const barra = document.querySelector(".catalog-login-bar");
    const alt = barra ? barra.getBoundingClientRect().height : 76;
    montar({ continua: false });
    const logoBarra = document.querySelector(".catalog-login-logo");
    if (!el.querySelector(".ab-logo").dataset.url && logoBarra && logoBarra.src) definirLogo(logoBarra.src);
    if (!reduzido && el.animate) {
      el.animate([
        { clipPath: `inset(0 0 calc(100% - ${alt}px) 0)` },
        { clipPath: "inset(0 0 0 0)" }
      ], { duration: 850, easing: "cubic-bezier(.76,0,.24,1)", fill: "both" });
      document.querySelector(".catalog-login-palco")?.animate(
        [{ opacity: 1, filter: "blur(0)", transform: "none" }, { opacity: 0, filter: "blur(6px)", transform: "scale(.98)" }],
        { duration: 600, easing: "ease-out", fill: "forwards" });
      await esperar(1700);
    }
  }

  window.AcervoAbertura = { montar, sair, doLogin, definirLogo };
  const script = document.currentScript;
  if (script && script.dataset.abertura === "sistema") {
    try { if (window.self !== window.top) return; } catch (_) { return; }
    noSistema();
  }
})();
