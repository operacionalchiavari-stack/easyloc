const supabase = window.supabaseClient;

const THREE_URL = "https://esm.sh/three@0.166.1";
const GLTF_LOADER_URL = "https://esm.sh/three@0.166.1/examples/jsm/loaders/GLTFLoader.js";
const ORBIT_CONTROLS_URL = "https://esm.sh/three@0.166.1/examples/jsm/controls/OrbitControls.js";

const state = {
  itemId: null,
  empresaId: null,
  modelo: null,
  three: null,
  loadingThree: null,
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  loader: null,
  model: null,
  raf: null,
  autoRotate: false,
};

function $(id){
  return document.getElementById(id);
}

function setText(id, value){
  const el = $(id);
  if(el) el.textContent = value;
}

function notify(message, type = "info"){
  if(typeof window.alerta === "function") return window.alerta(message, "Modelo 3D", type);
  alert(message);
}

function formatBytes(bytes){
  const size = Number(bytes || 0);
  if(!size) return "-";
  if(size < 1024) return `${size} B`;
  if(size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value){
  if(!value) return "-";
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showLoading(show){
  const loading = $("item3DLoading");
  if(loading) loading.hidden = !show;
}

function cacheBustUrl(url, version){
  if(!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(version || Date.now())}`;
}

function updateMeta(modelo){
  const status = $("item3DStatus");
  const hasModel = Boolean(modelo?.url);

  if(status){
    status.textContent = hasModel ? "Ativo" : "Sem modelo";
    status.classList.toggle("ativo", hasModel);
    status.classList.toggle("sem-modelo", !hasModel);
  }

  setText("item3DNome", modelo?.nome_arquivo || "-");
  setText("item3DFormato", "GLB");
  setText("item3DTamanho", formatBytes(modelo?.tamanho_bytes));
  setText("item3DOrigem", modelo?.path || "-");
  setText("item3DCriado", formatDate(modelo?.criado_em));
  setText("item3DAtualizado", formatDate(modelo?.atualizado_em));

  const empty = $("item3DEmpty");
  if(empty) empty.hidden = hasModel;
}

function activePanelIs3D(){
  return Boolean($("item3DCanvasHost"));
}

async function loadThree(){
  if(state.three) return state.three;
  if(state.loadingThree) return state.loadingThree;

  state.loadingThree = Promise.all([
    import(THREE_URL),
    import(GLTF_LOADER_URL),
    import(ORBIT_CONTROLS_URL),
  ]).then(([THREE, gltfModule, controlsModule]) => {
    state.three = {
      THREE,
      GLTFLoader: gltfModule.GLTFLoader,
      OrbitControls: controlsModule.OrbitControls,
    };
    return state.three;
  }).catch((error) => {
    state.loadingThree = null;
    throw error;
  });

  return state.loadingThree;
}

function disposeObject(object){
  if(!object) return;
  object.traverse?.((node) => {
    if(node.geometry) node.geometry.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((value) => {
        if(value?.isTexture) value.dispose?.();
      });
      material.dispose?.();
    });
  });
}

function stopAnimation(){
  if(state.raf) cancelAnimationFrame(state.raf);
  state.raf = null;
}

function resetSceneModel(){
  if(state.model){
    state.scene?.remove(state.model);
    disposeObject(state.model);
    state.model = null;
  }
}

function ensureRenderer(){
  const host = $("item3DCanvasHost");
  if(!host) return null;

  const { THREE, OrbitControls, GLTFLoader } = state.three;

  if(!state.scene){
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0xf8fafc);

    const ambient = new THREE.HemisphereLight(0xffffff, 0xdbeafe, 2.1);
    state.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 5, 4);
    state.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 1.2);
    fill.position.set(-4, 2, -3);
    state.scene.add(fill);
  }

  if(!state.camera){
    state.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    state.camera.position.set(2.8, 2.2, 3.2);
  }

  if(!state.renderer){
    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    state.renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
    host.querySelector("canvas")?.remove();
    host.appendChild(state.renderer.domElement);
  }

  if(!state.controls){
    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.08;
    state.controls.enableRotate = true;
    state.controls.enableZoom = true;
    state.controls.enablePan = true;
    state.controls.screenSpacePanning = true;
    state.controls.rotateSpeed = 0.85;
    state.controls.zoomSpeed = 0.9;
    state.controls.panSpeed = 0.9;
    state.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    state.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    state.controls.target.set(0, 0.6, 0);
  }

  if(!state.loader){
    state.loader = new GLTFLoader();
  }

  resizeRenderer();
  return host;
}

function resizeRenderer(){
  const host = $("item3DCanvasHost");
  if(!host || !state.renderer || !state.camera) return;

  const rect = host.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(280, Math.floor(rect.height));

  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(width, height, false);
}

function fitCameraToObject(object){
  if(!object || !state.camera || !state.controls) return;
  const { THREE } = state.three;
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fov = state.camera.fov * (Math.PI / 180);
  const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.8;

  state.controls.target.copy(center);
  state.camera.position.set(
    center.x + distance * 0.65,
    center.y + distance * 0.42,
    center.z + distance * 0.78
  );
  state.camera.near = Math.max(distance / 100, 0.01);
  state.camera.far = distance * 100;
  state.camera.updateProjectionMatrix();
  state.controls.update();
}

function animate(){
  state.raf = requestAnimationFrame(animate);
  if(state.autoRotate && state.model) state.model.rotation.y += 0.006;
  state.controls?.update();
  if(state.renderer && state.scene && state.camera){
    state.renderer.render(state.scene, state.camera);
  }
}

async function renderModel(modelo = state.modelo){
  if(!modelo?.url) return;
  showLoading(true);

  try{
    await loadThree();
    ensureRenderer();
    resetSceneModel();

    const url = cacheBustUrl(modelo.url, modelo.atualizado_em || modelo.criado_em);
    const gltf = await state.loader.loadAsync(url);
    state.model = gltf.scene;
    state.scene.add(state.model);
    fitCameraToObject(state.model);
    stopAnimation();
    animate();
    updateMeta(modelo);
  }catch(error){
    console.error("Erro ao carregar GLB:", error);
    notify("Nao foi possivel visualizar este GLB. Verifique se o arquivo esta valido.", "erro");
    $("item3DEmpty")?.removeAttribute("hidden");
  }finally{
    showLoading(false);
  }
}

async function fetchModelo(){
  if(!supabase || !state.itemId){
    state.modelo = null;
    updateMeta(null);
    return null;
  }

  const { data, error } = await supabase
    .from("itens_modelos_3d")
    .select("*")
    .eq("item_id", state.itemId)
    .maybeSingle();

  if(error){
    console.error("Erro ao carregar modelo 3D:", error);
    state.modelo = null;
    updateMeta(null);
    return null;
  }

  state.modelo = data || null;
  updateMeta(state.modelo);
  return state.modelo;
}

async function uploadModel(file){
  if(!state.itemId || !state.empresaId){
    notify("Salve o item antes de enviar o modelo 3D.", "erro");
    return false;
  }

  const name = file?.name || "";
  if(!file || !name.toLowerCase().endsWith(".glb")){
    notify("Envie apenas arquivos GLB.", "erro");
    return false;
  }

  showLoading(true);

  try{
    const storagePath = `${state.empresaId}/${state.itemId}/modelo-3d/modelo.glb`;
    const { error: uploadError } = await supabase.storage
      .from("itens")
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type || "model/gltf-binary",
        upsert: true,
      });

    if(uploadError) throw uploadError;

    const { data: publicData } = supabase.storage
      .from("itens")
      .getPublicUrl(storagePath);

    const payload = {
      empresa_id: state.empresaId,
      item_id: state.itemId,
      nome_arquivo: name,
      path: storagePath,
      url: publicData?.publicUrl,
      mime_type: file.type || "model/gltf-binary",
      tamanho_bytes: file.size,
      status: "ativo",
    };

    const { data, error } = await supabase
      .from("itens_modelos_3d")
      .upsert(payload, { onConflict: "item_id" })
      .select("*")
      .single();

    if(error) throw error;

    state.modelo = data;
    updateMeta(data);
    await renderModel(data);
    notify("Modelo 3D salvo com sucesso.", "sucesso");
    return true;
  }catch(error){
    console.error("Erro ao salvar modelo 3D:", error);
    notify(error.message || "Nao foi possivel salvar o modelo 3D.", "erro");
    return false;
  }finally{
    showLoading(false);
  }
}

window.itens_3d_init = async function({ itemId, empresaId } = {}){
  state.itemId = itemId || window.itemAtualId || null;
  state.empresaId = empresaId || state.empresaId || null;
  await fetchModelo();
  if(activePanelIs3D() && state.modelo?.url) await renderModel(state.modelo);
};

window.itens_3d_ensureViewer = async function(){
  if(!state.modelo) await fetchModelo();
  if(state.modelo?.url) await renderModel(state.modelo);
};

window.itens_3d_reset = function(){
  state.itemId = null;
  state.empresaId = null;
  state.modelo = null;
  resetSceneModel();
  stopAnimation();
  updateMeta(null);
};

window.itens_3d_openFile = function(){
  if(!state.itemId){
    notify("Salve o item antes de enviar o modelo 3D.", "erro");
    return;
  }
  $("item3DInput")?.click();
};

window.itens_3d_toggleRotate = function(){
  state.autoRotate = !state.autoRotate;
  $("item3DRotateBtn")?.classList.toggle("active", state.autoRotate);
};

window.itens_3d_resetCamera = function(){
  if(state.model) fitCameraToObject(state.model);
};

window.itens_3d_fullscreen = function(){
  const card = $("item3DViewerCard");
  if(!card) return;
  if(document.fullscreenElement) document.exitFullscreen?.();
  else card.requestFullscreen?.();
};

window.itens_3d_remove = async function(){
  if(!state.modelo?.id){
    notify("Este item ainda nao possui modelo 3D.", "info");
    return;
  }

  const confirmed = confirm("Remover o modelo 3D deste item?");
  if(!confirmed) return;

  showLoading(true);

  try{
    if(state.modelo.path){
      await supabase.storage.from("itens").remove([state.modelo.path]);
    }

    const { error } = await supabase
      .from("itens_modelos_3d")
      .delete()
      .eq("item_id", state.itemId);

    if(error) throw error;

    state.modelo = null;
    resetSceneModel();
    updateMeta(null);
    notify("Modelo 3D removido.", "sucesso");
  }catch(error){
    console.error("Erro ao remover modelo 3D:", error);
    notify(error.message || "Nao foi possivel remover o modelo 3D.", "erro");
  }finally{
    showLoading(false);
  }
};

window.itens_3d_destroy = function(){
  stopAnimation();
  resetSceneModel();
  state.controls?.dispose?.();
  state.renderer?.dispose?.();
  state.renderer?.domElement?.remove?.();
  state.renderer = null;
  state.scene = null;
  state.camera = null;
  state.controls = null;
  state.loader = null;
  state.model = null;
};

document.addEventListener("change", (event) => {
  if(event.target?.id !== "item3DInput") return;
  const file = event.target.files?.[0];
  uploadModel(file).finally(() => {
    event.target.value = "";
  });
});

window.addEventListener("resize", resizeRenderer);
document.addEventListener("fullscreenchange", () => {
  requestAnimationFrame(resizeRenderer);
});
