(function(){
  if(window.__globalHelpLoaded) return;
  window.__globalHelpLoaded = true;

  const videos = [
    {
      id: "clientes-visao-geral",
      title: "Cadastro de clientes - visao geral",
      desc: "Primeiros passos no cadastro de clientes.",
      url: "https://www.youtube.com/embed/A8Gn9rZjJic",
      keywords: ["cliente", "clientes", "cadastro", "cadastrar", "visao", "geral", "comercial"]
    },
    {
      id: "clientes-preenchimento",
      title: "Cadastro de clientes - preenchimento",
      desc: "Como preencher os principais campos do cliente.",
      url: "https://www.youtube.com/embed/pzTkdZoUUTg",
      keywords: ["cliente", "clientes", "preencher", "preenchimento", "campo", "cpf", "cnpj", "telefone", "email"]
    },
    {
      id: "clientes-boas-praticas",
      title: "Dicas rapidas e boas praticas",
      desc: "Boas praticas para manter o cadastro organizado.",
      url: "https://www.youtube.com/embed/A8Gn9rZjJic",
      keywords: ["dica", "dicas", "boas", "praticas", "organizar", "organizacao", "cadastro"]
    },
    {
      id: "pedido-ajuda",
      title: "Pedidos e orcamentos",
      desc: "Ajuda inicial para montar e revisar pedidos.",
      url: "https://www.youtube.com/embed/A8Gn9rZjJic",
      keywords: ["pedido", "pedidos", "orcamento", "orcamentos", "item", "itens", "contrato", "evento"]
    },
    {
      id: "financeiro-ajuda",
      title: "Financeiro do pedido",
      desc: "Ajuda sobre pagamento, parcelas e valores.",
      url: "https://www.youtube.com/embed/pzTkdZoUUTg",
      keywords: ["financeiro", "pagamento", "parcela", "parcelas", "entrada", "valor", "desconto", "boleto", "pix"]
    }
  ];

  let currentVideo = videos[0];

  const els = {};

  function $(id){
    return document.getElementById(id);
  }

  function cacheEls(){
    els.button = $("globalHelpButton");
    els.modal = $("globalHelpModal");
    els.close = $("globalHelpClose");
    els.question = $("globalHelpQuestion");
    els.search = $("globalHelpSearch");
    els.results = $("globalHelpResults");
    els.iframe = $("globalHelpIframe");
    els.title = $("globalHelpVideoTitle");
    els.desc = $("globalHelpVideoDesc");
    els.float = $("globalHelpFloat");
    els.mini = $("globalHelpMini");
    els.miniIframe = $("globalHelpMiniIframe");
    els.miniTitle = $("globalHelpMiniTitle");
    els.miniBack = $("globalHelpMiniBack");
    els.miniMinimize = $("globalHelpMiniMinimize");
    els.miniClose = $("globalHelpMiniClose");
  }

  function normalizar(text){
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function pontuar(video, query){
    const termos = normalizar(query).split(/\s+/).filter(Boolean);
    if(!termos.length) return 1;

    const base = normalizar([
      video.title,
      video.desc,
      video.keywords.join(" ")
    ].join(" "));

    return termos.reduce((score, termo) => score + (base.includes(termo) ? 1 : 0), 0);
  }

  function buscarVideos(query){
    const ranked = videos
      .map((video) => ({ video, score: pontuar(video, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return ranked.length ? ranked.map((item) => item.video) : videos;
  }

  function renderResults(lista = videos){
    if(!els.results) return;

    els.results.innerHTML = lista.map((video) => `
      <button type="button" class="global-help-result ${video.id === currentVideo.id ? "active" : ""}" data-video-id="${video.id}">
        <strong>${video.title}</strong>
        <span>${video.desc}</span>
      </button>
    `).join("");
  }

  function videoSrc(video, autoplay = false){
    if(!video) return "";
    return autoplay
      ? `${video.url}${video.url.includes("?") ? "&" : "?"}autoplay=1`
      : video.url;
  }

  function miniPlayerAberto(){
    return Boolean(els.mini && !els.mini.classList.contains("hidden"));
  }

  function modalAjudaAberto(){
    return Boolean(els.modal && !els.modal.classList.contains("hidden"));
  }

  function desligarIframeModal(){
    if(els.iframe) els.iframe.src = "";
  }

  function desligarIframeMini(){
    if(els.miniIframe) els.miniIframe.src = "";
  }

  function setVideo(video, autoplay = false){
    if(!video) return;
    currentVideo = video;

    const src = videoSrc(video, autoplay);

    if(modalAjudaAberto() && els.iframe) els.iframe.src = src;
    if(els.title) els.title.textContent = video.title;
    if(els.desc) els.desc.textContent = video.desc;
    if(els.miniTitle) els.miniTitle.textContent = video.title;

    if(miniPlayerAberto() && els.miniIframe){
      desligarIframeModal();
      els.miniIframe.src = src;
    }

    renderResults(buscarVideos(els.question?.value || ""));
  }

  function abrirAjuda(){
    fecharMiniPlayer();
    els.modal?.classList.remove("hidden");
    els.modal?.setAttribute("aria-hidden", "false");
    if(els.iframe) els.iframe.src = videoSrc(currentVideo);
    renderResults(buscarVideos(els.question?.value || ""));
    setTimeout(() => els.question?.focus?.(), 0);
  }

  function fecharAjuda(){
    els.modal?.classList.add("hidden");
    els.modal?.setAttribute("aria-hidden", "true");
    desligarIframeModal();
  }

  function pesquisar(){
    const encontrados = buscarVideos(els.question?.value || "");
    renderResults(encontrados);
    setVideo(encontrados[0] || videos[0]);
  }

  function abrirMiniPlayer(){
    if(!els.mini || !els.miniIframe) return;
    desligarIframeModal();
    els.miniIframe.src = currentVideo.url;
    els.miniTitle.textContent = currentVideo.title;
    els.mini.classList.remove("hidden");
    restaurarMiniPlayerLayout();
    fecharAjuda();
  }

  function fecharMiniPlayer(){
    els.mini?.classList.add("hidden");
    desligarIframeMini();
  }

  function salvarMiniPlayerLayout(){
    if(!els.mini || els.mini.classList.contains("hidden")) return;
    const rect = els.mini.getBoundingClientRect();
    let anterior = null;
    try{
      anterior = JSON.parse(localStorage.getItem("easyloc:global-help-mini-layout") || "null");
    }catch{
      anterior = null;
    }

    const minimized = els.mini.classList.contains("is-minimized");
    const payload = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: minimized ? Number(anterior?.height || 280) : rect.height,
      minimized
    };

    try{
      localStorage.setItem("easyloc:global-help-mini-layout", JSON.stringify(payload));
    }catch{}
  }

  function clamp(value, min, max){
    return Math.min(Math.max(value, min), max);
  }

  function aplicarMiniPlayerLayout(layout){
    if(!els.mini || !layout) return;

    const width = clamp(Number(layout.width || 420), 260, window.innerWidth - 24);
    const height = clamp(Number(layout.height || 280), 190, window.innerHeight - 24);
    const left = clamp(Number(layout.left ?? (window.innerWidth - width - 20)), 12, window.innerWidth - width - 12);
    const top = clamp(Number(layout.top ?? (window.innerHeight - height - 20)), 12, window.innerHeight - 44);

    els.mini.style.left = `${left}px`;
    els.mini.style.top = `${top}px`;
    els.mini.style.right = "auto";
    els.mini.style.bottom = "auto";
    els.mini.style.width = `${width}px`;
    els.mini.style.height = layout.minimized ? "44px" : `${height}px`;
    els.mini.classList.toggle("is-minimized", Boolean(layout.minimized));
    if(els.miniMinimize) els.miniMinimize.textContent = layout.minimized ? "+" : "-";
  }

  function restaurarMiniPlayerLayout(){
    let layout = null;
    try{
      layout = JSON.parse(localStorage.getItem("easyloc:global-help-mini-layout") || "null");
    }catch{
      layout = null;
    }

    aplicarMiniPlayerLayout(layout || {
      left: window.innerWidth - 440,
      top: window.innerHeight - 300,
      width: 420,
      height: 280,
      minimized: false
    });
  }

  function toggleMiniPlayerMinimizado(){
    if(!els.mini) return;

    const minimized = !els.mini.classList.contains("is-minimized");
    if(!minimized){
      let saved = null;
      try{
        saved = JSON.parse(localStorage.getItem("easyloc:global-help-mini-layout") || "null");
      }catch{}
      if(saved?.height) els.mini.style.height = `${saved.height}px`;
    }

    els.mini.classList.toggle("is-minimized", minimized);
    if(els.miniMinimize) els.miniMinimize.textContent = minimized ? "+" : "-";
    salvarMiniPlayerLayout();
  }

  function bindMiniPlayerLivre(){
    if(!els.mini) return;

    const header = els.mini.querySelector(".global-help-mini-head");
    let dragging = null;
    let resizeObserver = null;

    header?.addEventListener("pointerdown", (event) => {
      if(event.target.closest("button")) return;

      const rect = els.mini.getBoundingClientRect();
      dragging = {
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };

      els.mini.style.left = `${rect.left}px`;
      els.mini.style.top = `${rect.top}px`;
      els.mini.style.right = "auto";
      els.mini.style.bottom = "auto";
      els.mini.style.width = `${rect.width}px`;
      if(!els.mini.classList.contains("is-minimized")) els.mini.style.height = `${rect.height}px`;
      header.setPointerCapture?.(event.pointerId);
    });

    header?.addEventListener("pointermove", (event) => {
      if(!dragging) return;

      const nextLeft = clamp(dragging.left + event.clientX - dragging.x, 8, window.innerWidth - dragging.width - 8);
      const nextTop = clamp(dragging.top + event.clientY - dragging.y, 8, window.innerHeight - 44);

      els.mini.style.left = `${nextLeft}px`;
      els.mini.style.top = `${nextTop}px`;
    });

    header?.addEventListener("pointerup", (event) => {
      if(!dragging) return;
      dragging = null;
      header.releasePointerCapture?.(event.pointerId);
      salvarMiniPlayerLayout();
    });

    header?.addEventListener("pointercancel", () => {
      dragging = null;
      salvarMiniPlayerLayout();
    });

    if(window.ResizeObserver){
      resizeObserver = new ResizeObserver(() => {
        if(!els.mini.classList.contains("is-minimized")) salvarMiniPlayerLayout();
      });
      resizeObserver.observe(els.mini);
    }

    window.addEventListener("resize", () => {
      const rect = els.mini.getBoundingClientRect();
      aplicarMiniPlayerLayout({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        minimized: els.mini.classList.contains("is-minimized")
      });
      salvarMiniPlayerLayout();
    });

    return () => resizeObserver?.disconnect?.();
  }

  function salvarBotaoLayout(){
    if(!els.button) return;
    const rect = els.button.getBoundingClientRect();
    try{
      localStorage.setItem("easyloc:global-help-button-layout", JSON.stringify({
        left: rect.left,
        top: rect.top
      }));
    }catch{}
  }

  function aplicarBotaoLayout(layout){
    if(!els.button || !layout) return;
    const rect = els.button.getBoundingClientRect();
    const width = rect.width || 54;
    const height = rect.height || 54;
    const left = clamp(Number(layout.left ?? window.innerWidth - width - 22), 8, window.innerWidth - width - 8);
    const top = clamp(Number(layout.top ?? window.innerHeight - height - 22), 8, window.innerHeight - height - 8);

    els.button.style.left = `${left}px`;
    els.button.style.top = `${top}px`;
    els.button.style.right = "auto";
    els.button.style.bottom = "auto";
  }

  function restaurarBotaoLayout(){
    let layout = null;
    try{
      layout = JSON.parse(localStorage.getItem("easyloc:global-help-button-layout") || "null");
    }catch{}
    aplicarBotaoLayout(layout || {
      left: window.innerWidth - 76,
      top: window.innerHeight - 76
    });
  }

  function bindBotaoAjudaLivre(){
    if(!els.button) return;

    let dragging = null;
    let moved = false;

    restaurarBotaoLayout();

    els.button.addEventListener("pointerdown", (event) => {
      const rect = els.button.getBoundingClientRect();
      dragging = {
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };
      moved = false;
      els.button.setPointerCapture?.(event.pointerId);
    });

    els.button.addEventListener("pointermove", (event) => {
      if(!dragging) return;
      const dx = event.clientX - dragging.x;
      const dy = event.clientY - dragging.y;
      if(Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;

      const left = clamp(dragging.left + dx, 8, window.innerWidth - dragging.width - 8);
      const top = clamp(dragging.top + dy, 8, window.innerHeight - dragging.height - 8);

      els.button.style.left = `${left}px`;
      els.button.style.top = `${top}px`;
      els.button.style.right = "auto";
      els.button.style.bottom = "auto";
    });

    els.button.addEventListener("pointerup", (event) => {
      if(!dragging) return;
      dragging = null;
      els.button.releasePointerCapture?.(event.pointerId);
      salvarBotaoLayout();

      if(moved){
        event.preventDefault();
        event.stopPropagation();
        setTimeout(() => { moved = false; }, 0);
      }
    });

    els.button.addEventListener("click", (event) => {
      if(moved){
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    window.addEventListener("resize", () => {
      const rect = els.button.getBoundingClientRect();
      aplicarBotaoLayout({ left: rect.left, top: rect.top });
      salvarBotaoLayout();
    });
  }

  function bindEvents(){
    els.button?.addEventListener("click", abrirAjuda);
    els.close?.addEventListener("click", fecharAjuda);
    els.modal?.addEventListener("click", (event) => {
      if(event.target === els.modal) fecharAjuda();
    });

    els.search?.addEventListener("click", pesquisar);
    els.question?.addEventListener("keydown", (event) => {
      if(event.key === "Enter") pesquisar();
    });

    els.results?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-video-id]");
      if(!button) return;
      setVideo(videos.find((video) => video.id === button.dataset.videoId));
    });

    els.float?.addEventListener("click", abrirMiniPlayer);
    els.miniBack?.addEventListener("click", abrirAjuda);
    els.miniMinimize?.addEventListener("click", toggleMiniPlayerMinimizado);
    els.miniClose?.addEventListener("click", fecharMiniPlayer);
    bindMiniPlayerLivre();
    bindBotaoAjudaLivre();

    document.addEventListener("keydown", (event) => {
      if(event.key === "Escape") fecharAjuda();
    });
  }

  window.abrirModalAjuda = abrirAjuda;
  window.fecharAjuda = fecharAjuda;
  window.trocarVideo = function(url){
    const video = videos.find((item) => item.url === url) || { ...videos[0], url };
    setVideo(video);
  };

  document.addEventListener("DOMContentLoaded", () => {
    cacheEls();
    renderResults(videos);
    setVideo(currentVideo);
    bindEvents();
  });
})();
