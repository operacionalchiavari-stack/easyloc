/* =====================================================
   EasyLoc Studio IA
   Modulo independente. Nao usa Lia nem contexto do chat.
===================================================== */

(function(){
  const FABRIC_URL = "https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js";
  const AUTOSAVE_MS = 30000;

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
    options: {
      periodo: "Dia",
      convidados: "Sem convidados"
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
      "studioCanvas",
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
      "studioCatalog",
      "studioCatalogStatus",
      "studioLayers",
      "studioProjectList",
      "studioRenderGrid",
      "studioAutosaveStatus"
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
    state.canvas.on("selection:created", renderLayers);
    state.canvas.on("selection:updated", renderLayers);
    state.canvas.on("selection:cleared", renderLayers);

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

    resizeCanvasToFrame();
    window.addEventListener("resize", resizeCanvasToFrame);
  }

  function resizeCanvasToFrame(){
    if(!state.canvas || !els.studioCanvasFrame) return;
    const rect = els.studioCanvasFrame.getBoundingClientRect();
    const width = Math.max(760, Math.floor(rect.width));
    const height = Math.max(520, Math.floor(rect.height));
    state.canvas.setDimensions({ width, height });
    state.canvas.requestRenderAll();
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
    markDirty();
  }

  function deleteSelection(){
    getActiveObjects().forEach((obj) => state.canvas.remove(obj));
    state.canvas.discardActiveObject();
    state.canvas.requestRenderAll();
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
  }

  function bringFront(){
    getActiveObjects().forEach((obj) => state.canvas.bringToFront(obj));
    state.canvas.requestRenderAll();
    renderLayers();
  }

  function sendBack(){
    getActiveObjects().forEach((obj) => state.canvas.sendToBack(obj));
    state.canvas.requestRenderAll();
    renderLayers();
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
        quality: 0.72,
        multiplier: 0.6
      });
    }catch(err){
      console.warn("Studio IA: preview indisponivel", err);
      return null;
    }
  }

  function getSceneOptions(){
    return {
      tipoImagem: els.studioTipoImagem.value,
      periodo: state.options.periodo,
      convidados: state.options.convidados,
      estilo: els.studioEstilo.value,
      iluminacao: els.studioIluminacao.value,
      fundo: state.backgroundInfo
    };
  }

  function buildPrompt(){
    const options = getSceneOptions();
    const objects = state.canvas.getObjects().filter((obj) => obj.studioType === "item");
    const itemLines = objects.map((obj, index) => {
      const scale = Number((((obj.scaleX || 1) + (obj.scaleY || 1)) / 2).toFixed(2));
      return `${index + 1}. ${obj.itemName || "Item"} na posicao x:${Math.round(obj.left || 0)}, y:${Math.round(obj.top || 0)}, escala:${scale}, rotacao:${Math.round(obj.angle || 0)} graus`;
    });

    return [
      `Crie uma fotografia hiper-realista de ${options.tipoImagem.toLowerCase()} para evento.`,
      `Estilo: ${options.estilo}. Periodo: ${options.periodo}. Convidados: ${options.convidados}.`,
      `Iluminacao: ${options.iluminacao}.`,
      "Use a imagem do canvas como referencia principal e obrigatoria.",
      "Preserve fielmente a silhueta, formato, proporcao, cor predominante, angulo e identidade visual de cada movel inserido.",
      "Nao substitua poltronas, bares, sofas, mesas ou aparadores por modelos diferentes.",
      "Respeite a composicao visual, posicoes, escala, rotacao, profundidade, camadas e relacao dos moveis com o plano de fundo.",
      "Se houver conflito entre criatividade e fidelidade ao canvas, priorize a fidelidade ao canvas.",
      itemLines.length ? `Itens posicionados: ${itemLines.join("; ")}.` : "Sem itens posicionados.",
      "Resultado com fotografia editorial profissional, realismo alto, materiais preservados, perspectiva coerente e acabamento premium, sem inventar moveis novos."
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
    setBackgroundPreview("Sem fundo");
    renderLayers();
    setStatus("Novo projeto");
  }

  function startAutosave(){
    clearInterval(state.autosaveTimer);
    state.autosaveTimer = setInterval(() => salvarProjeto(true), AUTOSAVE_MS);
  }

  async function generateScene(){
    await salvarProjeto(true);
    const prompt = buildPrompt();
    const preview = getPreview();
    const objects = state.canvas.getObjects().filter((obj) => obj.studioType === "item").map((obj) => ({
      itemId: obj.itemId,
      itemName: obj.itemName,
      itemImage: obj.itemImage,
      left: obj.left,
      top: obj.top,
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      angle: obj.angle
    }));

    renderLoadingRenders();

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
    }
  }

  function renderLoadingRenders(){
    els.studioRenderGrid.innerHTML = `
      <div class="studio-render-card">
        <div class="studio-empty-render">Gerando imagem realista...</div>
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

    els.studioRenderGrid.innerHTML = images.map((image, index) => {
      const url = image.url || image.base64 || image.imagem_url || "";
      const src = image.base64 && !String(image.base64).startsWith("data:")
        ? `data:image/png;base64,${image.base64}`
        : url;

      return `
        <article class="studio-render-card">
          ${src ? `<img src="${escapeHtml(src)}" alt="Versao ${index + 1}">` : `<div class="studio-empty-render">Sem imagem</div>`}
          <div>
            <strong>Versao ${index + 1}</strong>
            <button type="button" class="btn btn-secondary" data-use-render="${index}">Usar versao</button>
            ${src ? `<a class="btn btn-secondary" download="studio-ia-${index + 1}.png" href="${escapeHtml(src)}">Baixar</a>` : ""}
          </div>
        </article>
      `;
    }).join("");

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
    window.removeEventListener("resize", resizeCanvasToFrame);
    try{
      state.canvas?.dispose();
    }catch{}
  };
})();
