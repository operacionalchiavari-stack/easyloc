// =========================================
// EASYLOC - SYSTEM STATUS MONITOR
// =========================================

(function(){

  if(window.__systemStatusLoaded) return;
  window.__systemStatusLoaded = true;

  let interval = null;

  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");

  const internetEl = document.getElementById("statusInternet");
  const backendEl  = document.getElementById("statusBackend");
  const geralEl    = document.getElementById("statusGeral");

  const panel = document.getElementById("statusPanel");
  const indicator = document.getElementById("statusIndicator");

  if(!dot || !text) return;

  // =============================
  // PAINEL TOGGLE
  // =============================

  indicator?.addEventListener("click", (e)=>{
    e.stopPropagation();
    panel.style.display = panel.style.display === "block" ? "none" : "block";
  });

  document.addEventListener("click", ()=>{
    panel.style.display = "none";
  });

  // =============================
  // TESTE INTERNET
  // =============================

async function testInternet(){

  if(!navigator.onLine) return null;

  const start = performance.now();

  try{

    await fetch(window.supabaseClient.supabaseUrl + "/rest/v1/", {
      method: "HEAD",
      headers: {
        "apikey": window.supabaseClient.supabaseKey
      }
    });

    return performance.now() - start;

  }catch{
    return null;
  }

}

  // =============================
  // TESTE BACKEND (LEVE)
  // =============================

  async function testBackend(){

    const start = performance.now();

    try{

      await window.supabaseClient
        .from("empresas")
        .select("id")
        .limit(1);

      return performance.now() - start;

    }catch{
      return null;
    }

  }

  // =============================
  // CLASSIFICAÇÃO
  // =============================

  function classify(internet, backend){

    if(!navigator.onLine){
      return {
        color: "#6b7280",
        label: "Sem conexão",
        internet: "Offline",
        backend: "Indisponível",
        geral: "Sem internet"
      };
    }

    if(internet === null || backend === null){
      return {
        color: "#dc2626",
        label: "Lentidão",
        internet: "Erro",
        backend: "Erro",
        geral: "Instável"
      };
    }

    if(internet > 1000){
      return {
        color: "#f59e0b",
        label: "Instável",
        internet: "Conexão lenta",
        backend: backend < 400 ? "Normal" : "Lento",
        geral: "Conexão instável"
      };
    }

    if(backend > 800){
      return {
        color: "#f59e0b",
        label: "Instável",
        internet: "Normal",
        backend: "Resposta lenta",
        geral: "Servidor com lentidão"
      };
    }

    if(backend > 1500){
      return {
        color: "#dc2626",
        label: "Lentidão",
        internet: "Normal",
        backend: "Muito lento",
        geral: "Sistema sobrecarregado"
      };
    }

    return {
      color: "#16a34a",
      label: "Estável",
      internet: "Normal",
      backend: "Rápido",
      geral: "Funcionando normalmente"
    };

  }

  // =============================
  // UPDATE
  // =============================

  async function update(){

    if(document.hidden) return;

    const internet = await testInternet();
    const backend  = await testBackend();

    const result = classify(internet, backend);

    dot.style.background = result.color;
    text.innerText = result.label;

    internetEl.innerText = result.internet;
    backendEl.innerText  = result.backend;
    geralEl.innerText    = result.geral;

  }

  // =============================
  // INICIAR
  // =============================

  update();
  interval = setInterval(update, 30000);

})();