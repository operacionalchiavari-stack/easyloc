/* =====================================================
   MODULE LOADER GLOBAL EASYLOC (SPA SAFE ✅ FINAL)
===================================================== */

/* =====================
   LOCK GLOBAL
===================== */
window.__loadingModule = false;

window.carregarNaMain = async function (
  htmlPath,
  jsPath,
  el,
  cssPath
){

  function reaplicarOverridesGlobais(){
    document
      .getElementById("dynamic-module-overrides-css")
      ?.remove();

    const overrides = document.createElement("link");
    overrides.rel = "stylesheet";
    overrides.href = "styles/module-overrides.css?v=" + Date.now();
    overrides.id = "dynamic-module-overrides-css";

    document.head.appendChild(overrides);
  }

  function normalizarBotoesGlobais(root){
    if(!root) return;

    root.querySelectorAll("button").forEach((button) => {
      const texto = (button.textContent || "").trim().toLowerCase();
      const aria = (button.getAttribute("aria-label") || "").trim().toLowerCase();
      const onclick = (button.getAttribute("onclick") || "").toLowerCase();
      const dataClose = button.hasAttribute("data-close");

      if(texto === "fechar" || aria === "fechar"){
        button.classList.add("btn", "danger", "btn-fechar");
        button.classList.remove("secondary", "btn-cancel", "btn-cancelar");
        return;
      }

      if(texto === "salvar"){
        button.classList.add("btn", "primary");
        return;
      }

      if(texto === "cancelar"){
        button.classList.add("btn", "secondary");
        return;
      }

      if(texto === "sair" || onclick.includes("sair") || dataClose && texto === "x"){
        button.classList.add("btn", "danger");
      }
    });
  }

  /* =====================
   FINALIZADOR GLOBAL
===================== */

window.finalizarCarregamentoModulo = function(){

  const loader = document.getElementById("global-loader");

  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      loader?.classList.add("hidden");
    });
  });

};

  /* =====================
     ANTI DOUBLE CLICK
  ===================== */
  if (window.__loadingModule) {
    console.log("⚠️ carregamento já em andamento");
    return;
  }

  window.__loadingModule = true;

  const main   = document.getElementById("main-content");
  const loader = document.getElementById("global-loader");

  if(!main){
    window.__loadingModule = false;
    return;
  }

  try{

    loader?.classList.remove("hidden");

    /* =====================
       ACTIVE MENU
    ===================== */
    document
      .querySelectorAll(".submenu-item")
      .forEach(i => i.classList.remove("active"));

    el?.classList.add("active");

/* =====================================================
   DESTROY MÓDULO ANTERIOR (SPA SAFE ✅)
===================================================== */

if (typeof window.__activeModuleDestroy === "function") {

  try{
    console.log("🧹 destruindo módulo anterior");
    window.__activeModuleDestroy();
  }catch(e){
    console.warn("Erro ao destruir módulo:", e);
  }

}

delete window.__activeModuleDestroy;
    /* =====================================================
       LIMPA INIT + FLAGS ANTIGAS
    ===================================================== */
    delete window.__moduleInit;
delete window.__caminhoesEventosAtivos;
    delete window.__fornecedoresInicializado;
    delete window.__caminhoesInicializado;
    delete window.__pedidoInicializado;
    delete window.__personalizacoesLoaded;
    delete window.almoxarifadoInitialized;
    delete window.eventListenersAlmoxarifado;


    /* =====================
       REMOVE SCRIPT ANTIGO
    ===================== */
    document
      .getElementById("dynamic-module-js")
      ?.remove();


    /* =====================
       LOAD HTML
    ===================== */
    const response = await fetch(htmlPath);
    const html = await response.text();

    main.innerHTML = html;
    normalizarBotoesGlobais(main);


    /* =====================
       LOAD CSS
    ===================== */
    if(cssPath){

      document
        .getElementById("dynamic-module-css")
        ?.remove();

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssPath + "?v=" + Date.now();
      link.id = "dynamic-module-css";

      document.head.appendChild(link);
    }

    reaplicarOverridesGlobais();


    /* =====================
       LOAD JS DO MÓDULO
    ===================== */
    if(jsPath){

      await new Promise((resolve)=>{

const script = document.createElement("script");

if (jsPath.endsWith(".mjs")) {
  script.type = "module";   // 🔥 ESSENCIAL PARA MJS
}

script.src = jsPath + "?v=" + Date.now();
script.id  = "dynamic-module-js";

script.onload = () => {

  console.log("✅ módulo carregado:", jsPath);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {

      /* ================= INIT DO MÓDULO ================= */
      if(
        window.__moduleInit &&
        typeof window.__moduleInit === "function"
      ){
        console.log("🚀 init do módulo executado");

        try{
          window.__moduleInit();
        }catch(e){
          console.error("❌ erro no init:", e);
        }

        delete window.__moduleInit;
      }

      /* ================= 🔥 RECRIAR ÍCONES LUCIDE ================= */
      if (window.lucide) {
        lucide.createIcons();
      }

      resolve();

    });
  });

};

        document.body.appendChild(script);

      });

    }

  }catch(err){
    console.error("❌ Erro ao carregar módulo:", err);
  }
finally{

  /* loader agora é controlado pelo módulo */
  window.__loadingModule = false;
}

};
