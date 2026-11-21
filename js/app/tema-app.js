/*
 * Identidade visual da empresa no app do celular (21/11/2026, pedido do usuário: "o app também precisa seguir as cores
 * da identidade visual do sistema"). Mesma regra do menu do sistema (themePrepaint/companyTheme): cor do menu
 * (cor_sidebar) e cor de destaque (cor_destaque), trocadas pelas do tema festivo (Natal, Carnaval…) dentro do período.
 *
 * - No <head> de cada tela do app (síncrono): lê o tema guardado no navegador (easyloc_theme_<empresa>) e põe
 *   --app-cor / --app-destaque no :root e a cor da barra do celular (meta theme-color), antes da 1ª pintura.
 * - Depois, com a conexão do Supabase pronta, busca o tema no banco, guarda no navegador (mesmo formato do sistema)
 *   e reaplica se mudou.
 * O visual que usa essas variáveis está em styles/app-tema.css (carregado por último em cada tela).
 */
(function () {
  "use strict";
  const hex = v => /^#[0-9a-f]{6}$/i.test(String(v || "").trim());
  const FESTIVOS = {
    carnaval: { cor_sidebar: "#46206b", cor_destaque: "#853b95" },
    natal: { cor_sidebar: "#173f37", cor_destaque: "#a53741" },
    pascoa: { cor_sidebar: "#53416a", cor_destaque: "#805293" },
    ano_novo: { cor_sidebar: "#1e2c46", cor_destaque: "#8a652c" }
  };
  const dataOk = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
  function hoje() {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const v = k => p.find(x => x.type === k).value;
    return `${v("year")}-${v("month")}-${v("day")}`;
  }
  function empresaId() {
    try { return sessionStorage.getItem("empresa_id") || localStorage.getItem("acervo_ultima_empresa") || ""; } catch (_) { return ""; }
  }
  function cores(t) {
    if (!t) return null;
    let cor = hex(t.cor_sidebar) && t.cor_sidebar.trim().toLowerCase() !== "#290610" ? t.cor_sidebar.trim() : "#5a5a55";
    let destaque = hex(t.cor_destaque) ? t.cor_destaque.trim() : "#7d603d";
    const d = hoje();
    if (FESTIVOS[t.tema_festivo] && dataOk(t.tema_festivo_inicio) && dataOk(t.tema_festivo_fim) && t.tema_festivo_inicio <= d && d <= t.tema_festivo_fim) {
      const f = t.cores_sistema || FESTIVOS[t.tema_festivo];
      if (hex(f.cor_sidebar)) cor = f.cor_sidebar;
      if (hex(f.cor_destaque)) destaque = f.cor_destaque;
    }
    return { cor, destaque };
  }
  function aplicar(t) {
    const c = cores(t);
    if (!c) return;
    const raiz = document.documentElement;
    raiz.style.setProperty("--app-cor", c.cor);
    raiz.style.setProperty("--app-destaque", c.destaque);
    raiz.classList.add("app-tema-empresa");
    let meta = document.querySelector('meta[name="theme-color"]');
    // Só troca a barra do celular nas telas que a usam na cor do menu (app.html marca com data-tema="menu").
    if (meta && meta.dataset.tema === "menu") meta.setAttribute("content", c.cor);
  }
  function lerCache(id) {
    try { return JSON.parse(localStorage.getItem("easyloc_theme_" + id) || "null"); } catch (_) { return null; }
  }

  const id = empresaId();
  if (id) aplicar(lerCache(id));

  async function atualizar() {
    const eid = empresaId();
    const sb = window.supabaseClient;
    if (!eid || !sb) return;
    try {
      const { data: sessao } = await sb.auth.getSession();
      if (!sessao?.session) return;
      const { data, error } = await sb.from("configuracoes_empresa")
        .select("logo_url,cor_sidebar,cor_destaque,tema_festivo,tema_festivo_inicio,tema_festivo_fim")
        .eq("empresa_id", eid).maybeSingle();
      if (error || !data) return;
      const antigo = lerCache(eid) || {};
      const f = FESTIVOS[data.tema_festivo] || data;
      const novo = { ...antigo, ...data, logo_url: data.logo_url || antigo.logo_url || "", cores_sistema: { cor_sidebar: f.cor_sidebar, cor_destaque: f.cor_destaque } };
      try { localStorage.setItem("easyloc_theme_" + eid, JSON.stringify(novo)); } catch (_) {}
      aplicar(novo);
    } catch (_) {}
  }
  let tentativas = 0;
  function esperar() {
    if (window.supabaseClient) {
      atualizar();
      // Entrou agora (login do app): a empresa só fica conhecida depois do login terminar.
      try { window.supabaseClient.auth.onAuthStateChange(ev => { if (ev === "SIGNED_IN") { setTimeout(atualizar, 1500); setTimeout(atualizar, 5000); } }); } catch (_) {}
      return;
    }
    if (++tentativas < 60) setTimeout(esperar, 250);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", esperar); else esperar();
  window.AppTema = { aplicar, atualizar };
})();
