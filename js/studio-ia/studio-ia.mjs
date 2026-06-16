/* =====================================================
   EasyLoc Studio IA
   Modulo independente. Nao usa Lia nem contexto do chat.
===================================================== */

(function(){
  const FABRIC_URL = "https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js";
  const AUTOSAVE_MS = 30000;
  const CANVAS_PRESETS = {
    wide: { label: "Paisagem livre", width: 1280, height: 760 },
    reels: { label: "Reels / Stories", width: 1080, height: 1920 },
    feed: { label: "Feed quadrado", width: 1080, height: 1080 },
    mobile: { label: "Celular", width: 1080, height: 1920 },
    slide: { label: "PowerPoint", width: 1920, height: 1080 },
    a4: { label: "Folha A4", width: 1240, height: 1754 },
    "a4-landscape": { label: "Folha A4 paisagem", width: 1754, height: 1240 }
  };
  const GENERATE_MESSAGES = [
    "Lendo a composicao do canvas.",
    "Preservando o formato dos moveis.",
    "Ajustando profundidade e posicao.",
    "Aplicando iluminacao profissional.",
    "Estou quase finalizando.",
    "Preparando o resultado na tela."
  ];

  const state = {
    supabase: null,
    empresaId: null,
    usuarioId: null,
    canvas: null,
    projetoId: null,
    itens: [],
    filtroCategoria: "",
    filtroBusca: "",
    autosaveTimer: null,
    backgroundInfo: null,
    draggingCanvas: false,
    lastPan: null,
    canvasPreset: "wide",
    lastRenderSrc: "",
    generateMessageTimer: null,
    generateMessageIndex: 0,
    options: {
      periodo: "Dia",
      convidados: "Sem convidados",
      ambientacao: []
    }
  };

  const els = {};

  function $(id){
    return document.getElementById(id);
  }

  function avisar(mensagem, titulo = "EasyLoc Studio IA", tipo = "info"){
    if(typeof window.alerta === "function"){
      window.alerta(mensagem, titulo, tipo);
      return;
    }
    alert(mensagem);
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function debounce(fn, wait = 250){
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function setStatus(text){
    if(els.studioAutosaveStatus) els.studioAutosaveStatus.textContent = text;
  }

  function cacheEls(){
    [
      "studioProjectName",
      "studioNewProject",
      "studioSaveProject",
      "studioGenerate",
      "studioRegenerate",
      "studioTipoImagem",
      "studioEstilo",
      "studioIluminacao",
      "studioSelectBackground",
      "studioBackgroundInput",
      "studioBgPreview",
      "studioShowGrid",
      "studioGridSize",
      "studioGridOverlay",
      "studioCanvasFrame",
      "studioCanvasPreset",
      "studioCanvasPresetHint",
      "studioCanvas",
      "studioObjectToolbar",
      "studioDuplicate",
      "studioFlip",
      "studioCrop",
      "studioLock",
      "studioDelete",
      "studioBringFront",
      "studioSendBack",
      "studioZoomOut",
      "studioZoomIn",
      "studioResetView",
      "studioSearchItem",
      "studioCategoryFilters",
      "studioEnhancements",
      "studioCatalog",
      "studioCatalogStatus",
      "studioLayers",
      "studioProjectList",
      "studioRenderGrid",
      "studioAutosaveStatus",
      "studioGenerateOverlay",
      "studioGenerateMessage",
      "studioResultModal",
      "studioResultImage",
      "studioResultClose",
      "studioResultUse",
      "studioResultDownload"
    ].forEach((id) => {
      els[id] = $(id);
    });
  }

  async function loadScript(src){
    if(window.fabric) return;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if(existing){
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Nao foi possivel carregar ${src}`));
      document.head.appendChild(script);
    });
  }

  async function resolverContexto(){
    state.supabase = window.supabaseClient;
    state.empresaId = window.__CONTEXT?.empresa_id || null;

    if(!state.supabase){
      throw new Error("Supabase nao encontrado");
    }

    const { data:{ session } } = await state.supabase.auth.getSession();
    state.usuarioId = session?.user?.id || null;

    if(!state.empresaId && state.usuarioId){
      const { data } = await state.supabase
        .from("usuarios_empresas")
        .select("empresa_id")
        .eq("user_id", state.usuarioId)
        .maybeSingle();

      state.empresaId = data?.empresa_id || null;
    }

    if(!state.empresaId){
      throw new Error("Empresa atual nao encontrada");
    }
  }

  function initCanvas(){
    const fabric = window.fabric;
    state.canvas = new fabric.Canvas(els.studioCanvas, {
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: "#f8fafc"
    });

    state.canvas.setDimensions({ width: 1280, height: 760 });
    fabric.Object.prototype.cornerColor = "#ff6a00";
    fabric.Object.prototype.cornerStrokeColor = "#ffffff";
    fabric.Object.prototype.borderColor = "#ff6a00";
    fabric.Object.prototype.cornerStyle = "circle";

    state.canvas.on("object:modified", markDirty);
    state.canvas.on("object:added", markDirty);
    state.canvas.on("object:removed", markDirty);
    state.canvas.on("selection:created", () => {
      renderLayers();
      positionObjectToolbar();
    });
    state.canvas.on("selection:updated", () => {
      renderLayers();
      positionObjectToolbar();
    });
    state.canvas.on("selection:cleared", () => {
      renderLayers();
      hideObjectToolbar();
    });
    state.canvas.on("object:moving", positionObjectToolbar);
    state.canvas.on("object:scaling", positionObjectToolbar);
    state.canvas.on("object:rotating", positionObjectToolbar);
    state.canvas.on("object:modified", positionObjectToolbar);

    state.canvas.on("mouse:down", (opt) => {
      const event = opt.e;
      if(event.altKey || event.code === "Space" || event.button === 1){
        state.draggingCanvas = true;
        state.lastPan = new fabric.Point(event.clientX, event.clientY);
        state.canvas.selection = false;
      }
    });

    state.canvas.on("mouse:move", (opt) => {
      if(!state.draggingCanvas || !state.lastPan) return;
      const event = opt.e;
      const delta = new fabric.Point(event.clientX - state.lastPan.x, event.clientY - state.lastPan.y);
      state.canvas.relativePan(delta);
      state.lastPan = new fabric.Point(event.clientX, event.clientY);
    });

    state.canvas.on("mouse:up", () => {
      state.draggingCanvas = false;
      state.lastPan = null;
      state.canvas.selection = true;
    });

    applyCanvasPreset(state.canvasPreset, false);
    window.addEventListener("resize", resizeCanvasToFrame);
  }

  function resizeCanvasToFrame(){
    if(!state.canvas || !els.studioCanvasFrame) return;
    applyCanvasPreset(state.canvasPreset, false);
  }

  function applyCanvasPreset(presetKey = "wide", dirty = true){
    if(!state.canvas || !els.studioCanvasFrame) return;
    const preset = CANVAS_PRESETS[presetKey] || CANVAS_PRESETS.wide;
    state.canvasPreset = presetKey;
    els.studioCanvasFrame.dataset.preset = presetKey;

    const rect = els.studioCanvasFrame.getBoundingClientRect();
    const width = Math.max(360, Math.floor(rect.width));
    const height = Math.max(360, Math.round(width * (preset.height / preset.width)));
    state.canvas.setDimensions({ width, height });
    fitBackgroundToCanvas();
    state.canvas.requestRenderAll();

    if(els.studioCanvasPresetHint){
      els.studioCanvasPresetHint.textContent = `${preset.label} - ${preset.width} x ${preset.height} px`;
    }

    positionObjectToolbar();
    if(dirty) markDirty();
  }

  function fitBackgroundToCanvas(){
    const bg = state.canvas?.backgroundImage;
    if(!bg || !bg.width || !bg.height) return;
    const scale = Math.max(state.canvas.width / bg.width, state.canvas.height / bg.height);
    bg.set({
      left: 0,
      top: 0,
      originX: "left",
      originY: "top",
      scaleX: scale,
      scaleY: scale
    });
  }

  async function carregarItens(){
    els.studioCatalogStatus.textContent = "Carregando...";
    const { data, error } = await state.supabase
      .from("itens")
      .select("id,codigo,produto,descricao_total,categoria,tipo,foto_url")
      .eq("empresa_id", state.empresaId)
      .order("descricao_total", { ascending: true });

    if(error){
      console.error("Studio IA: erro ao carregar itens", error);
      els.studioCatalogStatus.textContent = "Erro";
      return;
    }

    state.itens = data || [];
    els.studioCatalogStatus.textContent = `${state.itens.length} itens`;
    renderCatalog();
  }

  function categoriaMatch(item, categoria){
    if(!categoria) return true;
    const text = `${item.categoria || ""} ${item.produto || ""} ${item.descricao_total || ""}`.toLowerCase();
    return text.includes(categoria.toLowerCase().replace("sofás", "sofa"));
  }

  function renderCatalog(){
    const busca = state.filtroBusca.toLowerCase();
    const itens = state.itens
      .filter((item) => categoriaMatch(item, state.filtroCategoria))
      .filter((item) => {
        const text = `${item.codigo || ""} ${item.produto || ""} ${item.descricao_total || ""}`.toLowerCase();
        return !busca || text.includes(busca);
      })
      .slice(0, 80);

    if(!itens.length){
      els.studioCatalog.innerHTML = `<div class="studio-empty-render">Nenhum item encontrado.</div>`;
      return;
    }

    els.studioCatalog.innerHTML = itens.map((item) => {
      const nome = item.descricao_total || item.produto || "Item";
      const foto = item.foto_url
        ? `<img src="${escapeHtml(item.foto_url)}" alt="">`
        : `<div class="studio-catalog-placeholder">Item</div>`;
      return `
        <button type="button" class="studio-catalog-card" data-item-id="${escapeHtml(item.id)}">
          ${foto}
          <div>
            <strong>${escapeHtml(nome)}</strong>
            <span>${escapeHtml(item.codigo || item.categoria || "Sem codigo")}</span>
          </div>
        </button>
      `;
    }).join("");
  }

  function nomeObjeto(item){
    return item?.descricao_total || item?.produto || "Item EasyLoc";
  }

  function addTextFallback(item){
    const fabric = window.fabric;
    const group = new fabric.Group([
      new fabric.Rect({
        width: 150,
        height: 90,
        fill: "#ffffff",
        stroke: "#cbd5e1",
        rx: 12,
        ry: 12,
        originX: "center",
        originY: "center"
      }),
      new fabric.Textbox(nomeObjeto(item), {
        width: 130,
        fontSize: 14,
        fontWeight: "700",
        fill: "#0f2a44",
        textAlign: "center",
        originX: "center",
        originY: "center"
      })
    ], {
      left: 120,
      top: 120,
      studioType: "item",
      itemId: item.id,
      itemName: nomeObjeto(item),
      itemImage: item.foto_url || null
    });
    state.canvas.add(group).setActiveObject(group);
    state.canvas.requestRenderAll();
  }

  function addItemToCanvas(itemId){
    const item = state.itens.find((i) => String(i.id) === String(itemId));
    if(!item) return;

    if(!item.foto_url){
      addTextFallback(item);
      return;
    }

    window.fabric.Image.fromURL(item.foto_url, (img) => {
      img.set({
        left: 120,
        top: 120,
        scaleX: 0.42,
        scaleY: 0.42,
        studioType: "item",
        itemId: item.id,
        itemName: nomeObjeto(item),
        itemImage: item.foto_url
      });
      img.setControlsVisibility({ mtr: true });
      state.canvas.add(img).setActiveObject(img);
      state.canvas.requestRenderAll();
    }, { crossOrigin: "anonymous" });
  }

  function updateGrid(){
    const show = els.studioShowGrid.checked;
    const size = Number(els.studioGridSize.value || 50);
    els.studioGridOverlay.style.display = show ? "block" : "none";
    els.studioGridOverlay.style.backgroundSize = `${size}px ${size}px`;
  }

  function setBackgroundPreview(content){
    els.studioBgPreview.innerHTML = content || "Sem fundo";
  }

  function setBackgroundColor(color, label){
    state.backgroundInfo = { type: "color", value: color, label };
    state.canvas.setBackgroundColor(color, () => state.canvas.requestRenderAll());
    setBackgroundPreview(label);
    markDirty();
  }

  function setBackgroundImage(url, label = "Imagem selecionada"){
    state.backgroundInfo = { type: "image", value: url, label };
    window.fabric.Image.fromURL(url, (img) => {
      const scale = Math.max(state.canvas.width / img.width, state.canvas.height / img.height);
      img.set({
        originX: "left",
        originY: "top",
        left: 0,
        top: 0,
        scaleX: scale,
        scaleY: scale
      });
      state.canvas.setBackgroundImage(img, () => state.canvas.requestRenderAll());
      setBackgroundPreview(`<img src="${escapeHtml(url)}" alt="">`);
      markDirty();
    }, { crossOrigin: "anonymous" });
  }

  function applyLibraryBackground(kind){
    if(kind === "white"){
      state.canvas.backgroundImage = null;
      setBackgroundColor("#ffffff", "Fundo branco");
      return;
    }

    const gradients = {
      garden: "linear-gradient(135deg, #dff5e6, #f8fafc 62%, #fef3c7)",
      salon: "linear-gradient(135deg, #f8fafc, #dbeafe 55%, #fff7ed)"
    };

    state.backgroundInfo = { type: "library", value: kind, label: kind === "garden" ? "Jardim" : "Salao" };
    state.canvas.backgroundImage = null;
    state.canvas.setBackgroundColor(kind === "garden" ? "#eef8ee" : "#f4f7fb", () => state.canvas.requestRenderAll());
    els.studioCanvasFrame.style.background = gradients[kind] || "#e9edf3";
    setBackgroundPreview(kind === "garden" ? "Biblioteca: jardim" : "Biblioteca: salão");
    markDirty();
  }

  function getActiveObjects(){
    return state.canvas.getActiveObjects ? state.canvas.getActiveObjects() : [];
  }

  function getObjectActions(){
    return {
      duplicate: duplicateSelection,
      flip: flipSelection,
      crop: cropSelection,
      lock: toggleLockSelection,
      front: bringFront,
      back: sendBack,
      delete: deleteSelection
    };
  }

  function hideObjectToolbar(){
    if(els.studioObjectToolbar) els.studioObjectToolbar.hidden = true;
  }

  function positionObjectToolbar(){
    if(!els.studioObjectToolbar || !state.canvas) return;
    const active = state.canvas.getActiveObject();
    if(!active){
      hideObjectToolbar();
      return;
    }

    els.studioObjectToolbar.hidden = false;
    requestAnimationFrame(() => {
      const toolbar = els.studioObjectToolbar;
      const bounds = active.getBoundingRect(true, true);
      const frameRect = els.studioCanvasFrame.getBoundingClientRect();
      const canvasRect = state.canvas.upperCanvasEl.getBoundingClientRect();
      const offsetX = canvasRect.left - frameRect.left;
      const offsetY = canvasRect.top - frameRect.top;

      let left = offsetX + bounds.left + (bounds.width / 2) - (toolbar.offsetWidth / 2);
      let top = offsetY + bounds.top - toolbar.offsetHeight - 12;
      if(top < 10) top = offsetY + bounds.top + bounds.height + 12;

      left = Math.max(10, Math.min(left, frameRect.width - toolbar.offsetWidth - 10));
      top = Math.max(10, Math.min(top, frameRect.height - toolbar.offsetHeight - 10));
      toolbar.style.left = `${left}px`;
      toolbar.style.top = `${top}px`;
    });
  }

  function duplicateSelection(){
    const active = getActiveObjects();
    if(!active.length) return;
    active.forEach((obj) => {
      obj.clone((clone) => {
        clone.set({
          left: (obj.left || 0) + 26,
          top: (obj.top || 0) + 26,
          evented: true
        });
        state.canvas.add(clone);
      }, ["studioType", "studioLocked", "studioCropped", "itemId", "itemName", "itemImage"]);
    });
    state.canvas.discardActiveObject();
    state.canvas.requestRenderAll();
    positionObjectToolbar();
  }

  function flipSelection(){
    const active = getActiveObjects();
    if(!active.length){
      avisar("Selecione uma imagem ou movel para inverter.", "EasyLoc Studio IA", "aviso");
      return;
    }

    active.forEach((obj) => {
      obj.set("flipX", !obj.flipX);
    });

    state.canvas.requestRenderAll();
    positionObjectToolbar();
    markDirty();
  }

  function getImageSourceSize(obj){
    const element = typeof obj.getElement === "function" ? obj.getElement() : null;
    return {
      width: Number(element?.naturalWidth || element?.width || obj.width || 0),
      height: Number(element?.naturalHeight || element?.height || obj.height || 0)
    };
  }

  function cropSelection(){
    const images = getActiveObjects().filter((obj) => obj.type === "image");
    if(!images.length){
      avisar("Selecione uma foto no canvas para cortar.", "EasyLoc Studio IA", "aviso");
      return;
    }

    images.forEach((img) => {
      const source = getImageSourceSize(img);
      if(!source.width || !source.height) return;

      if(img.studioCropped){
        img.set({
          cropX: 0,
          cropY: 0,
          width: source.width,
          height: source.height,
          studioCropped: false
        });
        return;
      }

      const cropWidth = source.width * 0.84;
      const cropHeight = source.height * 0.84;
      img.set({
        cropX: (source.width - cropWidth) / 2,
        cropY: (source.height - cropHeight) / 2,
        width: cropWidth,
        height: cropHeight,
        studioCropped: true
      });
    });

    state.canvas.requestRenderAll();
    positionObjectToolbar();
    markDirty();
  }

  function deleteSelection(){
    getActiveObjects().forEach((obj) => state.canvas.remove(obj));
    state.canvas.discardActiveObject();
    state.canvas.requestRenderAll();
    hideObjectToolbar();
  }

  function toggleLockSelection(){
    getActiveObjects().forEach((obj) => {
      const locked = !obj.lockMovementX;
      obj.set({
        lockMovementX: locked,
        lockMovementY: locked,
        lockScalingX: locked,
        lockScalingY: locked,
        lockRotation: locked,
        selectable: true,
        studioLocked: locked
      });
    });
    state.canvas.requestRenderAll();
    renderLayers();
    positionObjectToolbar();
  }

  function bringFront(){
    getActiveObjects().forEach((obj) => state.canvas.bringToFront(obj));
    state.canvas.requestRenderAll();
    renderLayers();
    positionObjectToolbar();
  }

  function sendBack(){
    getActiveObjects().forEach((obj) => state.canvas.sendToBack(obj));
    state.canvas.requestRenderAll();
    renderLayers();
    positionObjectToolbar();
  }

  function zoom(delta){
    const current = state.canvas.getZoom();
    const next = Math.min(Math.max(current + delta, 0.25), 3);
    state.canvas.zoomToPoint({ x: state.canvas.width / 2, y: state.canvas.height / 2 }, next);
  }

  function resetView(){
    state.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    state.canvas.setZoom(1);
    state.canvas.requestRenderAll();
    positionObjectToolbar();
  }

  function renderLayers(){
    const active = new Set(getActiveObjects());
    const objects = state.canvas
      ? state.canvas.getObjects().filter((obj) => obj.studioType !== "grid").slice().reverse()
      : [];

    if(!objects.length){
      els.studioLayers.innerHTML = `<div class="studio-empty-render">Sem camadas.</div>`;
      return;
    }

    els.studioLayers.innerHTML = objects.map((obj) => {
      const index = state.canvas.getObjects().indexOf(obj);
      const name = obj.itemName || obj.name || obj.type || "Objeto";
      return `
        <div class="studio-layer-row ${active.has(obj) ? "active" : ""}" data-layer-index="${index}">
          <div>
            <strong>${escapeHtml(name)}</strong>
            <span>${obj.studioLocked ? "Bloqueado" : "Editavel"}</span>
          </div>
          <div class="studio-layer-actions">
            <button type="button" class="studio-layer-action" data-layer-action="up" title="Subir">↑</button>
            <button type="button" class="studio-layer-action" data-layer-action="down" title="Descer">↓</button>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderEnhancementButtons(){
    if(!els.studioEnhancements) return;
    const selected = new Set(state.options.ambientacao || []);
    els.studioEnhancements.querySelectorAll("button[data-value]").forEach((button) => {
      button.classList.toggle("active", selected.has(button.dataset.value));
    });
  }

  function renderSceneOptionButtons(){
    document.querySelectorAll(".studio-segmented[data-group]").forEach((group) => {
      const value = state.options[group.dataset.group];
      group.querySelectorAll("button[data-value]").forEach((button) => {
        button.classList.toggle("active", button.dataset.value === value);
      });
    });
  }

  function markDirty(){
    renderLayers();
    setStatus("Alteracoes pendentes");
  }

  function getCanvasJson(){
    return state.canvas.toJSON([
      "studioType",
      "studioLocked",
      "studioCropped",
      "itemId",
      "itemName",
      "itemImage"
    ]);
  }

  function getPreview(){
    try{
      return state.canvas.toDataURL({
        format: "jpeg",
        quality: 0.88,
        multiplier: 1
      });
    }catch(err){
      console.warn("Studio IA: preview indisponivel", err);
      return null;
    }
  }

  function getSceneOptions(){
    const preset = CANVAS_PRESETS[state.canvasPreset] || CANVAS_PRESETS.wide;
    return {
      tipoImagem: els.studioTipoImagem.value,
      periodo: state.options.periodo,
      convidados: state.options.convidados,
      ambientacao: [...state.options.ambientacao],
      estilo: els.studioEstilo.value,
      iluminacao: els.studioIluminacao.value,
      fundo: state.backgroundInfo,
      formato: {
        id: state.canvasPreset,
        nome: preset.label,
        largura: preset.width,
        altura: preset.height,
        proporcao: `${preset.width}:${preset.height}`
      }
    };
  }

  function buildPrompt(){
    const options = getSceneOptions();
    const objects = state.canvas.getObjects().filter((obj) => obj.studioType === "item");
    const convidadosRule = {
      "Sem convidados": "Regra obrigatoria de convidados: nao incluir pessoas visiveis, convidados, equipes ou figurantes.",
      "Poucos convidados": "Regra obrigatoria de convidados: incluir poucas pessoas de evento, de forma discreta e elegante, como pequenos grupos ao fundo ou nas laterais. Nao deixar a cena vazia. Os convidados devem ocupar areas livres e se adaptar aos moveis, nunca mover, cobrir ou substituir as pecas.",
      "Evento cheio": "Regra obrigatoria de convidados: a cena deve parecer um evento cheio, com publico/convidados visiveis e bem distribuidos. Os convidados devem ocupar areas livres, corredores, fundo e laterais, sem mover, cobrir ou substituir os moveis principais."
    }[options.convidados] || `Regra obrigatoria de convidados: seguir exatamente a opcao ${options.convidados}.`;
    const ambientacaoRule = options.ambientacao?.length
      ? `Ambientacao obrigatoria selecionada pelo usuario: ${options.ambientacao.join(", ")}. Esses elementos devem enriquecer a cena de evento premium, usando areas livres, teto, fundo, laterais, quinas, mesas e bar quando fizer sentido, sem alterar a posicao ou identidade dos moveis do canvas.`
      : "Ambientacao extra: nao adicionar elementos decorativos importantes alem do necessario para realismo.";
    const itemLines = objects.map((obj, index) => {
      const scale = Number((((obj.scaleX || 1) + (obj.scaleY || 1)) / 2).toFixed(2));
      const orientacao = obj.flipX ? "imagem invertida horizontalmente pelo usuario" : "mesma orientacao/frente da foto original";
      const bounds = obj.getBoundingRect(true, true);
      const centerX = ((bounds.left + bounds.width / 2) / state.canvas.width) * 100;
      const centerY = ((bounds.top + bounds.height / 2) / state.canvas.height) * 100;
      const widthPct = (bounds.width / state.canvas.width) * 100;
      const heightPct = (bounds.height / state.canvas.height) * 100;
      const zonaX = centerX < 33 ? "terco esquerdo" : centerX > 66 ? "terco direito" : "centro horizontal";
      const zonaY = centerY < 33 ? "parte superior/fundo" : centerY > 66 ? "parte inferior/frente" : "meio da cena";
      return `${index + 1}. ${obj.itemName || "Item"}: ancora visual no ${zonaX}, ${zonaY}; centro aproximado ${centerX.toFixed(1)}% da largura e ${centerY.toFixed(1)}% da altura; tamanho ${widthPct.toFixed(1)}% x ${heightPct.toFixed(1)}% do quadro; posicao original x:${Math.round(obj.left || 0)}, y:${Math.round(obj.top || 0)}; escala:${scale}; rotacao:${Math.round(obj.angle || 0)} graus; orientacao:${orientacao}`;
    });

    return [
      "Modo de trabalho: renderizacao fiel do canvas, como uma planta 3D premium transformada em fotografia realista.",
      "A imagem do canvas e a referencia principal e obrigatoria. Nao reinvente o cenario.",
      `Formato de saida: ${options.formato.nome}, proporcao ${options.formato.proporcao}.`,
      `Tipo: ${options.tipoImagem}. Estilo visual: ${options.estilo}. Periodo: ${options.periodo}. Convidados: ${options.convidados}.`,
      convidadosRule,
      ambientacaoRule,
      "As escolhas de Tipo, Periodo, Convidados, Estilo e Iluminacao sao soberanas e devem aparecer no resultado final.",
      "Regra de hierarquia: moveis e itens do canvas sao fixos. Convidados, noivos, decoracao, paisagismo, velas, lustres, tecidos, bebidas e arranjos devem se adaptar ao layout existente, nunca deslocar ou reorganizar as pecas.",
      "Regra geometrica obrigatoria: o posicionamento dos itens e soberano. Cada movel deve permanecer na mesma zona visual e ancora percentual do canvas. Se esta no centro, fica no centro; se esta no terco esquerdo, fica no terco esquerdo; se esta no terco direito, fica no terco direito.",
      "Nao mover bar, mesas, cadeiras, poltronas ou qualquer item para abrir espaco para convidados, noivos, decoracao, lustres, velas, arvores, bebidas ou arranjos. Esses elementos extras devem entrar apenas nos espacos livres.",
      "E permitido ajustar perspectiva e profundidade apenas sem mudar a leitura de posicao original do item no quadro.",
      "A cena deve continuar com linguagem de evento/locacao premium, mesmo quando o fundo for externo, interno, grama, salao, jardim ou outro ambiente.",
      `Iluminacao desejada: ${options.iluminacao}.`,
      "Preserve o ambiente/plano de fundo do canvas ao maximo: terreno, piso, parede, grama, ceu, horizonte, montanhas, perspectiva e enquadramento devem continuar reconheciveis.",
      "Nao trocar grama por salao, salao por jardim, fundo externo por interno, nem transformar o local em outro ambiente.",
      "Transforme apenas os recortes/objetos chapados em moveis realistas integrados ao mesmo fundo.",
      "Remova visualmente fundos brancos e caixas das fotos dos moveis, mas preserve fielmente silhueta, formato, proporcao, cor predominante, material, frente, angulo e identidade de cada movel.",
      "A vista de cada movel na foto e soberana: se a cadeira aparece de frente, renderize de frente; se aparece de lado, renderize de lado; se aparece de costas, renderize de costas.",
      "Nao girar cadeira, poltrona, sofa, mesa, bar ou aparador para mostrar outro lado diferente da foto enviada pelo usuario.",
      "Nao transformar uma cadeira de frente em cadeira de costas. A orientacao so pode mudar se o objeto estiver explicitamente invertido/rotacionado no canvas.",
      "Nao substitua poltronas, bares, sofas, mesas ou aparadores por modelos diferentes e nao adicione moveis novos.",
      "Respeite posicoes, escala relativa, rotacao, camadas e distancias do canvas. Objetos mais abaixo devem parecer mais proximos; objetos menores e mais altos devem parecer mais distantes.",
      "Adicionar somente realismo: sombras coerentes, contato com o chao, profundidade, oclusao, perspectiva, textura e acabamento fotografico.",
      "Se houver conflito entre criatividade e fidelidade ao canvas, priorize a fidelidade ao canvas em 100%.",
      itemLines.length ? `Itens posicionados: ${itemLines.join("; ")}.` : "Sem itens posicionados.",
      "Resultado final: render 3D/fotografia editorial realista do mesmo layout, preservando composicao e ambiente, sem inventar outro cenario."
    ].join(" ");
  }

  async function salvarProjeto(silencioso = false){
    if(!state.supabase || !state.empresaId || !state.canvas) return;

    const nome = (els.studioProjectName.value || "").trim() || "Projeto Studio IA";
    const payload = {
      empresa_id: state.empresaId,
      nome,
      descricao: JSON.stringify(getSceneOptions()),
      canvas_json: getCanvasJson(),
      imagem_preview: getPreview(),
      updated_at: new Date().toISOString()
    };

    try{
      let result;
      if(state.projetoId){
        result = await state.supabase
          .from("studio_projetos")
          .update(payload)
          .eq("id", state.projetoId)
          .eq("empresa_id", state.empresaId)
          .select("id")
          .single();
      }else{
        result = await state.supabase
          .from("studio_projetos")
          .insert(payload)
          .select("id")
          .single();
      }

      if(result.error) throw result.error;
      state.projetoId = result.data?.id || state.projetoId;
      setStatus(`Salvo ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
      carregarProjetos();
      if(!silencioso) avisar("Projeto salvo com sucesso.", "EasyLoc Studio IA", "sucesso");
    }catch(err){
      console.error("Studio IA: erro ao salvar projeto", err);
      setStatus("Erro ao salvar");
      if(!silencioso){
        avisar("Nao foi possivel salvar. Verifique se a tabela studio_projetos foi criada.", "EasyLoc Studio IA", "erro");
      }
    }
  }

  async function carregarProjetos(){
    if(!state.supabase || !state.empresaId) return;
    const { data, error } = await state.supabase
      .from("studio_projetos")
      .select("id,nome,updated_at,imagem_preview")
      .eq("empresa_id", state.empresaId)
      .order("updated_at", { ascending: false })
      .limit(12);

    if(error){
      els.studioProjectList.innerHTML = `<div class="studio-empty-render">Crie a tabela studio_projetos para salvar.</div>`;
      return;
    }

    if(!data?.length){
      els.studioProjectList.innerHTML = `<div class="studio-empty-render">Nenhum projeto salvo.</div>`;
      return;
    }

    els.studioProjectList.innerHTML = data.map((p) => `
      <button type="button" class="studio-project-card" data-project-id="${escapeHtml(p.id)}">
        <strong>${escapeHtml(p.nome)}</strong>
        <span>${p.updated_at ? new Date(p.updated_at).toLocaleString("pt-BR") : "Sem data"}</span>
      </button>
    `).join("");
  }

  async function carregarProjeto(id){
    const { data, error } = await state.supabase
      .from("studio_projetos")
      .select("*")
      .eq("id", id)
      .eq("empresa_id", state.empresaId)
      .single();

    if(error || !data){
      avisar("Projeto nao encontrado.", "EasyLoc Studio IA", "erro");
      return;
    }

    state.projetoId = data.id;
    els.studioProjectName.value = data.nome || "";
    state.canvas.loadFromJSON(data.canvas_json || {}, () => {
      state.canvas.renderAll();
      renderLayers();
      setStatus("Projeto carregado");
    });

    try{
      const options = JSON.parse(data.descricao || "{}");
      if(options.tipoImagem) els.studioTipoImagem.value = options.tipoImagem;
      if(options.estilo) els.studioEstilo.value = options.estilo;
      if(options.iluminacao) els.studioIluminacao.value = options.iluminacao;
      if(options.periodo) state.options.periodo = options.periodo;
      if(options.convidados) state.options.convidados = options.convidados;
      state.options.ambientacao = Array.isArray(options.ambientacao) ? options.ambientacao : [];
      renderSceneOptionButtons();
      renderEnhancementButtons();
      if(options.formato?.id && CANVAS_PRESETS[options.formato.id]){
        els.studioCanvasPreset.value = options.formato.id;
        applyCanvasPreset(options.formato.id, false);
      }
      state.backgroundInfo = options.fundo || null;
    }catch{}
  }

  function novoProjeto(){
    state.projetoId = null;
    els.studioProjectName.value = "";
    state.canvas.clear();
    state.canvas.backgroundImage = null;
    state.canvas.setBackgroundColor("#f8fafc", () => state.canvas.requestRenderAll());
    state.backgroundInfo = null;
    state.options.periodo = "Dia";
    state.options.convidados = "Sem convidados";
    state.options.ambientacao = [];
    renderSceneOptionButtons();
    renderEnhancementButtons();
    state.canvasPreset = "wide";
    if(els.studioCanvasPreset) els.studioCanvasPreset.value = "wide";
    applyCanvasPreset("wide", false);
    setBackgroundPreview("Sem fundo");
    renderLayers();
    setStatus("Novo projeto");
  }

  function startAutosave(){
    clearInterval(state.autosaveTimer);
    state.autosaveTimer = setInterval(() => salvarProjeto(true), AUTOSAVE_MS);
  }

  function setGenerateLoading(active){
    if(els.studioGenerateOverlay) els.studioGenerateOverlay.hidden = !active;
    if(els.studioGenerate) els.studioGenerate.disabled = active;
    if(els.studioRegenerate) els.studioRegenerate.disabled = active;

    clearInterval(state.generateMessageTimer);
    state.generateMessageTimer = null;

    if(active){
      state.generateMessageIndex = 0;
      if(els.studioGenerate) els.studioGenerate.textContent = "Gerando...";
      if(els.studioGenerateMessage) els.studioGenerateMessage.textContent = GENERATE_MESSAGES[0];
      state.generateMessageTimer = setInterval(() => {
        state.generateMessageIndex = (state.generateMessageIndex + 1) % GENERATE_MESSAGES.length;
        if(els.studioGenerateMessage){
          els.studioGenerateMessage.textContent = GENERATE_MESSAGES[state.generateMessageIndex];
        }
      }, 4200);
      return;
    }

    if(els.studioGenerate) els.studioGenerate.textContent = "Gerar imagem realista";
  }

  function extractImageSrc(image){
    if(!image) return "";
    const url = image.url || image.imagem_url || "";
    if(image.base64){
      return String(image.base64).startsWith("data:")
        ? image.base64
        : `data:image/png;base64,${image.base64}`;
    }
    return url;
  }

  function openResultModal(src){
    if(!src || !els.studioResultModal || !els.studioResultImage) return;
    state.lastRenderSrc = src;
    els.studioResultImage.src = src;
    if(els.studioResultDownload) els.studioResultDownload.href = src;
    els.studioResultModal.hidden = false;
  }

  function closeResultModal(){
    if(els.studioResultModal) els.studioResultModal.hidden = true;
  }

  async function generateScene(){
    await salvarProjeto(true);
    const prompt = buildPrompt();
    const preview = getPreview();
    const objects = state.canvas.getObjects().filter((obj) => obj.studioType === "item").map((obj) => {
      const bounds = obj.getBoundingRect(true, true);
      const centerXPercent = Number((((bounds.left + bounds.width / 2) / state.canvas.width) * 100).toFixed(2));
      const centerYPercent = Number((((bounds.top + bounds.height / 2) / state.canvas.height) * 100).toFixed(2));
      const zoneX = centerXPercent < 33 ? "left" : centerXPercent > 66 ? "right" : "center";
      const zoneY = centerYPercent < 33 ? "back/top" : centerYPercent > 66 ? "front/bottom" : "middle";
      return {
        itemId: obj.itemId,
        itemName: obj.itemName,
        itemImage: obj.itemImage,
        left: obj.left,
        top: obj.top,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        angle: obj.angle,
        flipX: Boolean(obj.flipX),
        flipY: Boolean(obj.flipY),
        anchor: {
          centerXPercent,
          centerYPercent,
          widthPercent: Number(((bounds.width / state.canvas.width) * 100).toFixed(2)),
          heightPercent: Number(((bounds.height / state.canvas.height) * 100).toFixed(2)),
          zoneX,
          zoneY
        },
        positionRule: `Manter este item na zona ${zoneX}/${zoneY}, com centro visual perto de ${centerXPercent}% x ${centerYPercent}% do quadro.`,
        orientationRule: obj.flipX
          ? "Preservar o mesmo lado da foto, apenas invertido horizontalmente como no canvas."
          : "Preservar exatamente a vista/frente da foto original; nao virar para costas ou outro angulo."
      };
    });

    renderLoadingRenders();
    setGenerateLoading(true);

    try{
      const { data, error } = await state.supabase.functions.invoke("studio-ai-engine", {
        body: {
          empresa_id: state.empresaId,
          projeto_id: state.projetoId,
          prompt,
          scene: {
            options: getSceneOptions(),
            canvas_json: getCanvasJson(),
            objects,
            preview
          },
          provider: "openai",
          versions: 1
        }
      });

      if(error) throw error;
      if(data?.providerStatus && data.providerStatus !== "ok"){
        console.warn("Studio IA: provedor nao retornou imagem real", data);
        renderResults(createFallbackImages(preview), data?.prompt || prompt, data?.modelo || "studio-ai-engine");
        const providerMessage = data?.error?.error?.message || data?.error?.message || data?.erro || "";
        const msg = data.providerStatus === "not_configured"
          ? "Studio AI Engine publicado, mas falta configurar a chave de imagem no Supabase."
          : providerMessage
            ? `Provedor de imagem recusou a geracao: ${providerMessage}`
            : "Studio AI Engine respondeu, mas o provedor de imagem ainda nao retornou imagens reais.";
        avisar(msg, "EasyLoc Studio IA", "aviso");
        return;
      }
      renderResults(data?.images || [], data?.prompt || prompt, data?.modelo || "studio-ai-engine");
    }catch(err){
      console.error("Studio IA: erro ao gerar imagem", err);
      renderResults(createFallbackImages(preview), prompt, "preview-local");
      avisar("Studio AI Engine ainda nao retornou imagem real. Mostrei o preview local para comparar a composicao.", "EasyLoc Studio IA", "aviso");
    }finally{
      setGenerateLoading(false);
    }
  }

  function renderLoadingRenders(){
    els.studioRenderGrid.innerHTML = `
      <div class="studio-empty-render">
        Gerando imagem realista...
      </div>
    `;
  }

  function createFallbackImages(preview){
    return [{
      url: preview,
      label: "Preview local",
      prompt: buildPrompt()
    }];
  }

  function renderResults(images, prompt, modelo){
    if(!images.length){
      els.studioRenderGrid.innerHTML = `<div class="studio-empty-render">Nenhuma imagem retornada.</div>`;
      return;
    }

    const prepared = images.map((image) => ({
      ...image,
      src: extractImageSrc(image)
    }));

    els.studioRenderGrid.innerHTML = prepared.map((image, index) => {
      const src = image.src || "";

      return `
        <article class="studio-render-card">
          ${src ? `<img src="${escapeHtml(src)}" alt="Imagem gerada ${index + 1}">` : `<div class="studio-empty-render">Sem imagem</div>`}
          <div>
            <strong>Imagem gerada</strong>
            <button type="button" class="btn btn-secondary" data-use-render="${index}">Usar versao</button>
            ${src ? `<a class="btn btn-secondary" download="studio-ia-${index + 1}.png" href="${escapeHtml(src)}">Baixar</a>` : ""}
          </div>
        </article>
      `;
    }).join("");

    const firstSrc = prepared.find((image) => image.src)?.src;
    if(firstSrc) openResultModal(firstSrc);

    persistRenderHistory(images, prompt, modelo);
  }

  async function persistRenderHistory(images, prompt, modelo){
    if(!state.projetoId) return;
    const rows = images.map((image) => ({
      projeto_id: state.projetoId,
      imagem_url: image.url || image.base64 || image.imagem_url || null,
      prompt,
      modelo
    }));

    try{
      await state.supabase.from("studio_renderizacoes").insert(rows);
    }catch(err){
      console.warn("Studio IA: historico nao salvo", err);
    }
  }

  function bindEvents(){
    els.studioNewProject.addEventListener("click", novoProjeto);
    els.studioSaveProject.addEventListener("click", () => salvarProjeto(false));
    els.studioGenerate.addEventListener("click", generateScene);
    els.studioRegenerate.addEventListener("click", generateScene);

    els.studioDuplicate.addEventListener("click", duplicateSelection);
    els.studioFlip.addEventListener("click", flipSelection);
    els.studioCrop.addEventListener("click", cropSelection);
    els.studioLock.addEventListener("click", toggleLockSelection);
    els.studioDelete.addEventListener("click", deleteSelection);
    els.studioBringFront.addEventListener("click", bringFront);
    els.studioSendBack.addEventListener("click", sendBack);
    els.studioZoomOut.addEventListener("click", () => zoom(-0.1));
    els.studioZoomIn.addEventListener("click", () => zoom(0.1));
    els.studioResetView.addEventListener("click", resetView);
    els.studioCanvasPreset?.addEventListener("change", () => {
      applyCanvasPreset(els.studioCanvasPreset.value || "wide");
    });

    els.studioShowGrid.addEventListener("change", updateGrid);
    els.studioGridSize.addEventListener("change", updateGrid);

    els.studioSelectBackground.addEventListener("click", () => els.studioBackgroundInput.click());
    els.studioBackgroundInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if(!file) return;
      const url = URL.createObjectURL(file);
      setBackgroundImage(url, file.name);
    });

    document.querySelectorAll(".studio-bg-library button").forEach((button) => {
      button.addEventListener("click", () => applyLibraryBackground(button.dataset.bg));
    });

    document.querySelectorAll(".studio-segmented button").forEach((button) => {
      button.addEventListener("click", () => {
        const group = button.closest("[data-group]");
        group.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        button.classList.add("active");
        state.options[group.dataset.group] = button.dataset.value;
        markDirty();
      });
    });

    els.studioEnhancements?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if(!button) return;
      const value = button.dataset.value;
      const selected = new Set(state.options.ambientacao || []);
      if(selected.has(value)) selected.delete(value);
      else selected.add(value);
      state.options.ambientacao = [...selected];
      renderEnhancementButtons();
      markDirty();
    });

    ["studioTipoImagem", "studioEstilo", "studioIluminacao", "studioProjectName"].forEach((id) => {
      els[id]?.addEventListener("input", markDirty);
      els[id]?.addEventListener("change", markDirty);
    });

    els.studioSearchItem.addEventListener("input", debounce(() => {
      state.filtroBusca = els.studioSearchItem.value || "";
      renderCatalog();
    }));

    els.studioCategoryFilters.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-category]");
      if(!button) return;
      els.studioCategoryFilters.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      state.filtroCategoria = button.dataset.category || "";
      renderCatalog();
    });

    els.studioCatalog.addEventListener("click", (event) => {
      const card = event.target.closest("[data-item-id]");
      if(card) addItemToCanvas(card.dataset.itemId);
    });

    els.studioLayers.addEventListener("click", (event) => {
      const row = event.target.closest("[data-layer-index]");
      if(!row) return;
      const obj = state.canvas.getObjects()[Number(row.dataset.layerIndex)];
      if(!obj) return;

      const action = event.target.closest("[data-layer-action]")?.dataset.layerAction;
      if(action === "up") state.canvas.bringForward(obj);
      else if(action === "down") state.canvas.sendBackwards(obj);
      else state.canvas.setActiveObject(obj);

      state.canvas.requestRenderAll();
      renderLayers();
      markDirty();
    });

    els.studioProjectList.addEventListener("click", (event) => {
      const card = event.target.closest("[data-project-id]");
      if(card) carregarProjeto(card.dataset.projectId);
    });

    els.studioRenderGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-use-render]");
      if(!button) return;
      const card = button.closest(".studio-render-card");
      const img = card?.querySelector("img");
      if(img?.src){
        setBackgroundImage(img.src, "Versao gerada por IA");
      }
    });

    els.studioObjectToolbar?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if(!button) return;
      event.preventDefault();
      event.stopPropagation();
      const action = getObjectActions()[button.dataset.action];
      if(typeof action === "function") action();
    });

    els.studioResultClose?.addEventListener("click", closeResultModal);
    els.studioResultModal?.addEventListener("click", (event) => {
      if(event.target === els.studioResultModal) closeResultModal();
    });
    els.studioResultUse?.addEventListener("click", () => {
      if(state.lastRenderSrc){
        setBackgroundImage(state.lastRenderSrc, "Imagem gerada por IA");
        closeResultModal();
      }
    });
  }

  async function init(){
    try{
      cacheEls();
      await resolverContexto();
      await loadScript(FABRIC_URL);
      initCanvas();
      bindEvents();
      updateGrid();
      await carregarItens();
      await carregarProjetos();
      renderLayers();
      renderSceneOptionButtons();
      renderEnhancementButtons();
      startAutosave();
      setStatus("Pronto");
      window.finalizarCarregamentoModulo?.();
    }catch(err){
      console.error("Studio IA: erro no init", err);
      avisar("Nao foi possivel iniciar o Studio IA.", "EasyLoc Studio IA", "erro");
      window.finalizarCarregamentoModulo?.();
    }
  }

  window.__moduleInit = init;
  window.__activeModuleDestroy = function(){
    clearInterval(state.autosaveTimer);
    clearInterval(state.generateMessageTimer);
    window.removeEventListener("resize", resizeCanvasToFrame);
    try{
      state.canvas?.dispose();
    }catch{}
  };
})();
