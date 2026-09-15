import { getEmpresaAtualId } from "./itens.api.mjs";

const supabase = window.supabaseClient;

const THREE_URL = "https://esm.sh/three@0.166.1";
const GLTF_LOADER_URL = "https://esm.sh/three@0.166.1/examples/jsm/loaders/GLTFLoader.js";
const ORBIT_CONTROLS_URL = "https://esm.sh/three@0.166.1/examples/jsm/controls/OrbitControls.js";
const GLTF_EXPORTER_URL = "https://esm.sh/three@0.166.1/examples/jsm/exporters/GLTFExporter.js";

const state = {
  itemId: null,
  empresaId: null,
  item: null,
  modeloExistente: null,
  imageUrl: "",
  imageFile: null,
  imageMime: "image/png",
  imageFilename: "item.png",
  preparedImageUrl: "",
  generated: false,
  saved: false,
  three: null,
  loadingThree: null,
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  loader: null,
  exporter: null,
  model: null,
  boundingBox: null,
  rulerGroup: null,
  gridHelper: null,
  raf: null,
  autoRotate: false,
  realMeasures: {
    width: 80,
    height: 90,
    depth: 75,
  },
  currentMeasures: {
    width: 0,
    height: 0,
    depth: 0,
  },
};

const dom = {};

function $(id){
  return document.getElementById(id);
}

function mapDom(){
  [
    "ai3dBackBtn",
    "ai3dSaveTop",
    "ai3dTitle",
    "ai3dSubtitle",
    "ai3dImageInput",
    "ai3dDropzoneOriginal",
    "ai3dOriginalPreview",
    "ai3dOriginalPlaceholder",
    "ai3dPhotoChip",
    "ai3dSelectPhotoBtn",
    "ai3dRemoveBgBtn",
    "ai3dBackgroundPreview",
    "ai3dBackgroundPlaceholder",
    "ai3dBgChip",
    "ai3dGenerateBtn",
    "ai3dViewer",
    "ai3dViewerEmpty",
    "ai3dLoading",
    "ai3dMeasureWidth",
    "ai3dMeasureHeight",
    "ai3dMeasureDepth",
    "ai3dHideRulers",
    "ai3dRotateBtn",
    "ai3dCenterBtn",
    "ai3dResetBtn",
    "ai3dGenerationLabel",
    "ai3dGenerationPercent",
    "ai3dGenerationBar",
    "ai3dGenerationSteps",
    "ai3dRealWidth",
    "ai3dRealHeight",
    "ai3dRealDepth",
    "ai3dCurrentWidth",
    "ai3dCurrentHeight",
    "ai3dCurrentDepth",
    "ai3dAdjustBtn",
    "ai3dSaveBtn",
  ].forEach((id) => {
    dom[id] = $(id);
  });
}

function notify(message, type = "info"){
  if(typeof window.alerta === "function") return window.alerta(message, "Modelo 3D", type);
  alert(message);
}

function delay(ms){
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeNumber(value, fallback = 0){
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function centimetersFromMeters(value, fallback){
  const number = safeNumber(value, 0);
  return number > 0 ? Math.round(number * 1000) / 10 : fallback;
}

function formatCm(value){
  const number = safeNumber(value, 0);
  if(!number) return "-";
  return `${number.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`;
}

function text(value, fallback = ""){
  const clean = String(value ?? "").trim();
  return clean || fallback;
}

function itemName(item = state.item){
  return text(item?.descricao_total) || [
    item?.produto,
    item?.material,
    item?.cor,
    item?.descricao_complementar,
  ].map((part) => text(part)).filter(Boolean).join(" ") || "Item sem nome";
}

function slug(value){
  return String(value || "modelo-3d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "modelo-3d";
}

function showLoading(show, label = "Processando..."){
  if(!dom.ai3dLoading) return;
  dom.ai3dLoading.textContent = label;
  dom.ai3dLoading.hidden = !show;
}

function setButtonLoading(button, loading, label){
  if(!button) return;
  if(loading){
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = label || "Processando...";
  }else{
    button.disabled = false;
    if(button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    window.lucide?.createIcons?.();
  }
}

function setStep(step, status){
  const normalized = normalizeStage(step);
  document.querySelectorAll(`.ai3d-steps [data-step="${normalized}"]`).forEach((el) => {
    el.classList.toggle("active", status === "active");
    el.classList.toggle("done", status === "done");
  });
}

function setCreationStatus(key, status){
  const item = document.querySelector(`#ai3dCreationStatus [data-status="${key}"]`);
  if(!item) return;
  item.classList.toggle("active", status === "active");
  item.classList.toggle("done", status === "done");
  const icon = item.querySelector("i");
  if(icon){
    icon.setAttribute("data-lucide", status === "done" ? "check-circle-2" : status === "active" ? "loader-circle" : "circle");
  }
  window.lucide?.createIcons?.();
}

function setProcessStatus(key, status){
  const item = dom.ai3dGenerationSteps?.querySelector(`[data-process="${key}"]`);
  if(!item) return;
  item.classList.toggle("active", status === "active");
  item.classList.toggle("done", status === "done");
  const icon = item.querySelector("i");
  if(icon){
    icon.setAttribute("data-lucide", status === "done" ? "check-circle-2" : status === "active" ? "loader-circle" : "circle");
  }
  window.lucide?.createIcons?.();
}

function setProgress(percent, label){
  const clean = Math.max(0, Math.min(100, Number(percent) || 0));
  if(dom.ai3dGenerationBar) dom.ai3dGenerationBar.style.width = `${clean}%`;
  if(dom.ai3dGenerationPercent) dom.ai3dGenerationPercent.textContent = `${Math.round(clean)}%`;
  if(dom.ai3dGenerationLabel) dom.ai3dGenerationLabel.textContent = label || "Processando";
}

function normalizeStage(step){
  if(step === "fundo") return "foto";
  if(["foto", "gerar", "medidas", "salvar"].includes(step)) return step;
  return "foto";
}

function setStage(stage){
  const nextStage = normalizeStage(stage);
  const page = document.querySelector(".ai3d-page");
  if(page) page.dataset.stage = nextStage;

  document.querySelectorAll("[data-stage-target]").forEach((button) => {
    const active = button.dataset.stageTarget === nextStage;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  requestAnimationFrame(() => {
    resizeRenderer();
    if(state.model) fitCameraToObject(state.model);
  });
}

function setImagePreview(url){
  state.imageUrl = url || "";
  if(dom.ai3dOriginalPreview){
    dom.ai3dOriginalPreview.src = url || "";
    dom.ai3dOriginalPreview.hidden = !url;
  }
  if(dom.ai3dOriginalPlaceholder) dom.ai3dOriginalPlaceholder.hidden = Boolean(url);
  if(dom.ai3dPhotoChip){
    dom.ai3dPhotoChip.textContent = url ? "Pronta" : "Pendente";
    dom.ai3dPhotoChip.classList.toggle("muted", !url);
  }
  if(dom.ai3dRemoveBgBtn) dom.ai3dRemoveBgBtn.disabled = !url;
}

function setPreparedPreview(url){
  state.preparedImageUrl = url || "";
  if(dom.ai3dBackgroundPreview){
    dom.ai3dBackgroundPreview.src = url || "";
    dom.ai3dBackgroundPreview.hidden = !url;
  }
  if(dom.ai3dBackgroundPlaceholder) dom.ai3dBackgroundPlaceholder.hidden = Boolean(url);
  if(dom.ai3dBgChip){
    dom.ai3dBgChip.textContent = url ? "Pronta" : "Pendente";
    dom.ai3dBgChip.classList.toggle("muted", !url);
  }
  if(dom.ai3dGenerateBtn) dom.ai3dGenerateBtn.disabled = !url;
}

function blobToBase64(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Nao foi possivel ler a imagem."));
    reader.readAsDataURL(blob);
  });
}

async function getImageBlobForBackgroundRemoval(){
  if(state.imageFile) return state.imageFile;
  if(!state.imageUrl) throw new Error("Imagem do item nao encontrada.");

  const response = await fetch(state.imageUrl);
  if(!response.ok) throw new Error("Nao foi possivel baixar a foto do item.");
  return response.blob();
}

async function getAuthToken(){
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if(!token) throw new Error("Sessao expirada. Entre novamente no sistema.");
  return token;
}

function apiBases(){
  const currentOrigin = window.location.origin || "";
  const bases = [
    window.ACERVO_API_BASE,
    currentOrigin.includes(":5500") ? "http://localhost:3000" : "",
    "",
  ].filter((base) => typeof base === "string");
  return [...new Set(bases.map((base) => base.replace(/\/$/, "")))];
}

async function callRemoveBackgroundApi(){
  const blob = await getImageBlobForBackgroundRemoval();
  if(blob.size > 5 * 1024 * 1024){
    throw new Error("A imagem deve ter no maximo 5 MB.");
  }

  const token = await getAuthToken();
  const imageBase64 = await blobToBase64(blob);
  const payload = {
    empresa_id: state.empresaId,
    image_base64: imageBase64,
    mime_type: blob.type || state.imageMime || "image/png",
    filename: state.imageFilename || "item.png",
  };

  let lastError = null;
  for(const base of apiBases()){
    try{
      const response = await fetch(`${base}/api/images/remove-background`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if(response.ok && data?.data_url) return data.data_url;

      lastError = new Error(data?.error || `Falha HTTP ${response.status}`);
      if(response.status !== 404) break;
    }catch(error){
      lastError = error;
    }
  }

  throw lastError || new Error("Nao foi possivel remover o fundo.");
}

function updateMeasureInputs(){
  if(dom.ai3dRealWidth) dom.ai3dRealWidth.value = state.realMeasures.width;
  if(dom.ai3dRealHeight) dom.ai3dRealHeight.value = state.realMeasures.height;
  if(dom.ai3dRealDepth) dom.ai3dRealDepth.value = state.realMeasures.depth;
}

function readRealMeasures(){
  state.realMeasures = {
    width: Math.max(1, safeNumber(dom.ai3dRealWidth?.value, state.realMeasures.width)),
    height: Math.max(1, safeNumber(dom.ai3dRealHeight?.value, state.realMeasures.height)),
    depth: Math.max(1, safeNumber(dom.ai3dRealDepth?.value, state.realMeasures.depth)),
  };
  return state.realMeasures;
}

function updateCurrentMeasures(){
  if(dom.ai3dCurrentWidth) dom.ai3dCurrentWidth.textContent = formatCm(state.currentMeasures.width);
  if(dom.ai3dCurrentHeight) dom.ai3dCurrentHeight.textContent = formatCm(state.currentMeasures.height);
  if(dom.ai3dCurrentDepth) dom.ai3dCurrentDepth.textContent = formatCm(state.currentMeasures.depth);
  if(dom.ai3dMeasureWidth) dom.ai3dMeasureWidth.textContent = formatCm(state.currentMeasures.width);
  if(dom.ai3dMeasureHeight) dom.ai3dMeasureHeight.textContent = formatCm(state.currentMeasures.height);
  if(dom.ai3dMeasureDepth) dom.ai3dMeasureDepth.textContent = formatCm(state.currentMeasures.depth);
}

async function loadThree(){
  if(state.three) return state.three;
  if(state.loadingThree) return state.loadingThree;

  state.loadingThree = Promise.all([
    import(THREE_URL),
    import(GLTF_LOADER_URL),
    import(ORBIT_CONTROLS_URL),
    import(GLTF_EXPORTER_URL),
  ]).then(([THREE, loaderModule, controlsModule, exporterModule]) => {
    state.three = {
      THREE,
      GLTFLoader: loaderModule.GLTFLoader,
      OrbitControls: controlsModule.OrbitControls,
      GLTFExporter: exporterModule.GLTFExporter,
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

function clearSceneModel(){
  if(state.model){
    state.scene?.remove(state.model);
    disposeObject(state.model);
    state.model = null;
  }
  if(state.boundingBox){
    state.scene?.remove(state.boundingBox);
    state.boundingBox = null;
  }
  if(state.rulerGroup){
    state.scene?.remove(state.rulerGroup);
    disposeObject(state.rulerGroup);
    state.rulerGroup = null;
  }
}

function resizeRenderer(){
  if(!state.renderer || !state.camera || !dom.ai3dViewer) return;
  const rect = dom.ai3dViewer.getBoundingClientRect();
  const width = Math.max(360, Math.floor(rect.width));
  const height = Math.max(320, Math.floor(rect.height));
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(width, height, false);
}

async function inicializarThreeJS(){
  await loadThree();
  const { THREE, OrbitControls, GLTFLoader, GLTFExporter } = state.three;

  if(!dom.ai3dViewer) return;

  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0xf8fafc);

  const ambient = new THREE.HemisphereLight(0xffffff, 0xd7dee9, 2.2);
  state.scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(3, 6, 4);
  state.scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 1.2);
  fill.position.set(-4, 3, -3);
  state.scene.add(fill);

  state.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  state.camera.position.set(2.8, 2.0, 3.2);

  state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
  dom.ai3dViewer.querySelector("canvas")?.remove();
  dom.ai3dViewer.appendChild(state.renderer.domElement);

  state.controls = new OrbitControls(state.camera, state.renderer.domElement);
  state.controls.enableDamping = true;
  state.controls.dampingFactor = 0.08;
  state.controls.enableRotate = true;
  state.controls.enablePan = true;
  state.controls.enableZoom = true;
  state.controls.screenSpacePanning = true;
  state.controls.rotateSpeed = 0.85;
  state.controls.zoomSpeed = 0.9;
  state.controls.panSpeed = 0.9;
  state.controls.target.set(0, 0.45, 0);

  state.loader = new GLTFLoader();
  state.exporter = new GLTFExporter();

  updateGrid(10);
  resizeRenderer();
  animate();
}

function updateGrid(unitCm = 10){
  if(!state.scene || !state.three) return;
  const { THREE } = state.three;
  if(state.gridHelper){
    state.scene.remove(state.gridHelper);
    state.gridHelper.dispose?.();
  }
  const step = Math.max(0.05, unitCm / 100);
  state.gridHelper = new THREE.GridHelper(3.4, Math.max(4, Math.round(3.4 / step)), 0xd8dee9, 0xe8edf5);
  state.gridHelper.position.y = 0;
  state.scene.add(state.gridHelper);
}

function animate(){
  state.raf = requestAnimationFrame(animate);
  if(state.autoRotate && state.model) state.model.rotation.y += 0.006;
  state.controls?.update();
  if(state.renderer && state.scene && state.camera){
    state.renderer.render(state.scene, state.camera);
  }
}

function fitCameraToObject(object){
  if(!object || !state.camera || !state.controls || !state.three) return;
  const { THREE } = state.three;
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.8);
  const fov = state.camera.fov * (Math.PI / 180);
  const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.85;

  state.controls.target.copy(center);
  state.camera.position.set(center.x + distance * 0.62, center.y + distance * 0.42, center.z + distance * 0.78);
  state.camera.near = Math.max(distance / 100, 0.01);
  state.camera.far = distance * 100;
  state.camera.updateProjectionMatrix();
  state.controls.update();
}

function calcularMedidasModelo(){
  if(!state.model || !state.three) return null;
  const { THREE } = state.three;
  const box = new THREE.Box3().setFromObject(state.model);
  const size = box.getSize(new THREE.Vector3());
  state.currentMeasures = {
    width: Math.max(0, Math.round(size.x * 1000) / 10),
    height: Math.max(0, Math.round(size.y * 1000) / 10),
    depth: Math.max(0, Math.round(size.z * 1000) / 10),
  };
  updateCurrentMeasures();
  return state.currentMeasures;
}

function criarBoundingBox(){
  if(!state.model || !state.three || !state.scene) return;
  const { THREE } = state.three;
  if(state.boundingBox) state.scene.remove(state.boundingBox);
  const box = new THREE.Box3().setFromObject(state.model);
  state.boundingBox = new THREE.Box3Helper(box, 0x2f6fed);
  state.scene.add(state.boundingBox);
}

function criarReguasMedidas(){
  if(!state.model || !state.three || !state.scene) return;
  const { THREE } = state.three;
  if(state.rulerGroup){
    state.scene.remove(state.rulerGroup);
    disposeObject(state.rulerGroup);
  }

  const box = new THREE.Box3().setFromObject(state.model);
  const min = box.min;
  const max = box.max;
  const group = new THREE.Group();
  const makeLine = (points, color) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, linewidth: 2 });
    const line = new THREE.Line(geometry, material);
    group.add(line);
  };

  makeLine([new THREE.Vector3(min.x, 0.02, max.z + 0.08), new THREE.Vector3(max.x, 0.02, max.z + 0.08)], 0xef4444);
  makeLine([new THREE.Vector3(min.x - 0.08, min.y, max.z), new THREE.Vector3(min.x - 0.08, max.y, max.z)], 0x2563eb);
  makeLine([new THREE.Vector3(max.x + 0.08, 0.02, min.z), new THREE.Vector3(max.x + 0.08, 0.02, max.z)], 0x16a34a);
  state.rulerGroup = group;
  state.scene.add(group);
  atualizarReguasELabels();
}

function atualizarReguasELabels(){
  const hidden = Boolean(dom.ai3dHideRulers?.checked);
  if(state.rulerGroup) state.rulerGroup.visible = !hidden;
  [dom.ai3dMeasureWidth, dom.ai3dMeasureHeight, dom.ai3dMeasureDepth].forEach((label) => {
    if(label) label.hidden = hidden || !state.model;
  });
}

function createProceduralFurniture(){
  const { THREE } = state.three;
  const group = new THREE.Group();
  const name = itemName().toLowerCase();
  const real = readRealMeasures();
  const width = real.width / 100;
  const height = real.height / 100;
  const depth = real.depth / 100;

  const fabric = new THREE.MeshStandardMaterial({
    color: name.includes("azul") ? 0x315f8f : name.includes("off") ? 0xf3eee7 : 0xd8cec1,
    roughness: 0.82,
    metalness: 0.03,
  });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a31, roughness: 0.58, metalness: 0.05 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9a815f, roughness: 0.34, metalness: 0.42 });

  function box(w, h, d, material, position, radius = 0){
    const geometry = new THREE.BoxGeometry(w, h, d, 8, 8, 8);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if(radius) mesh.scale.setScalar(1);
    group.add(mesh);
    return mesh;
  }

  function cylinder(radiusTop, radiusBottom, h, material, position, radial = 48){
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, h, radial);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  if(name.includes("mesa") || name.includes("bar") || name.includes("aparador")){
    const topHeight = Math.max(0.05, height * 0.08);
    box(width, topHeight, depth, name.includes("ferro") ? metal : wood, { x: 0, y: height - topHeight / 2, z: 0 });
    const legHeight = Math.max(0.1, height - topHeight);
    const legW = Math.max(0.035, Math.min(width, depth) * 0.045);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      box(legW, legHeight, legW, metal, {
        x: sx * (width / 2 - legW * 1.7),
        y: legHeight / 2,
        z: sz * (depth / 2 - legW * 1.7),
      });
    });
    if(name.includes("redonda")){
      group.clear?.();
      cylinder(width / 2, width / 2, topHeight, name.includes("ferro") ? metal : wood, { x: 0, y: height - topHeight / 2, z: 0 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        box(legW, legHeight, legW, metal, {
          x: sx * width * 0.28,
          y: legHeight / 2,
          z: sz * width * 0.28,
        });
      });
    }
  }else{
    const seatH = Math.max(0.10, height * 0.14);
    const seatY = Math.max(0.28, height * 0.42);
    const backH = Math.max(0.28, height * 0.48);
    const armW = Math.max(0.06, width * 0.11);
    const legW = Math.max(0.035, width * 0.045);

    box(width, seatH, depth * 0.78, fabric, { x: 0, y: seatY, z: 0.02 });
    box(width, backH, Math.max(0.07, depth * 0.12), fabric, { x: 0, y: seatY + backH * 0.48, z: -depth * 0.36 });
    box(armW, Math.max(0.18, height * 0.38), depth * 0.72, fabric, { x: -width / 2 + armW / 2, y: seatY + height * 0.12, z: 0.03 });
    box(armW, Math.max(0.18, height * 0.38), depth * 0.72, fabric, { x: width / 2 - armW / 2, y: seatY + height * 0.12, z: 0.03 });
    box(width * 0.82, Math.max(0.055, height * 0.05), depth * 0.10, wood, { x: 0, y: seatY - seatH * 0.65, z: depth * 0.35 });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      box(legW, seatY, legW, wood, {
        x: sx * (width / 2 - legW * 1.6),
        y: seatY / 2,
        z: sz * (depth / 2 - legW * 1.8),
      });
    });
  }

  group.name = "modelo_gerado_acervo";
  group.scale.setScalar(0.985);
  return group;
}

async function carregarGLB(url){
  if(!url || !state.loader || !state.scene) return;
  showLoading(true, "Carregando GLB...");
  try{
    clearSceneModel();
    const cacheUrl = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
    const gltf = await state.loader.loadAsync(cacheUrl);
    state.model = gltf.scene;
    state.scene.add(state.model);
    dom.ai3dViewerEmpty.hidden = true;
    state.generated = true;
    setStep("gerar", "done");
    setCreationStatus("modelo", "done");
    setStage("medidas");
    calcularMedidasModelo();
    criarBoundingBox();
    criarReguasMedidas();
    fitCameraToObject(state.model);
    if(dom.ai3dAdjustBtn) dom.ai3dAdjustBtn.disabled = false;
    if(dom.ai3dSaveBtn) dom.ai3dSaveBtn.disabled = false;
    if(dom.ai3dSaveTop) dom.ai3dSaveTop.disabled = false;
  }catch(error){
    console.error("Erro ao carregar GLB existente:", error);
    notify("Nao foi possivel carregar o GLB existente deste item.", "erro");
  }finally{
    showLoading(false);
  }
}

function handleImageUpload(event){
  const file = event.target?.files?.[0] || event.dataTransfer?.files?.[0];
  if(!file) return;
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if(!allowed.includes(file.type)){
    notify("Envie uma imagem JPG, PNG ou WEBP.", "erro");
    return;
  }
  if(file.size > 5 * 1024 * 1024){
    notify("A imagem deve ter no maximo 5 MB.", "erro");
    return;
  }
  const url = URL.createObjectURL(file);
  state.imageFile = file;
  state.imageMime = file.type || "image/png";
  state.imageFilename = file.name || "item.png";
  setImagePreview(url);
  setPreparedPreview("");
  setStage("foto");
  setStep("foto", "active");
  setCreationStatus("foto", "done");
  setCreationStatus("fundo", "active");
}

async function removerFundoImagem(){
  if(!state.imageUrl){
    notify("Selecione uma foto antes de remover o fundo.", "erro");
    return;
  }
  setButtonLoading(dom.ai3dRemoveBgBtn, true, "Preparando...");
  if(dom.ai3dBgChip){
    dom.ai3dBgChip.textContent = "Processando";
    dom.ai3dBgChip.classList.add("processing");
  }
  setStep("fundo", "active");
  setCreationStatus("fundo", "active");

  try{
    const transparentImageUrl = await callRemoveBackgroundApi();
    setPreparedPreview(transparentImageUrl);
    setStep("fundo", "done");
    setStep("gerar", "active");
    setStage("gerar");
    setCreationStatus("fundo", "done");
  }catch(error){
    console.error("Erro ao remover fundo com IA:", error);
    setPreparedPreview(state.imageUrl);
    setStep("fundo", "active");
    setCreationStatus("fundo", "active");
    notify(
      `${error.message || "Nao foi possivel remover o fundo com IA."} A imagem original foi mantida para teste.`,
      "erro"
    );
  }finally{
    if(dom.ai3dBgChip) dom.ai3dBgChip.classList.remove("processing");
    setButtonLoading(dom.ai3dRemoveBgBtn, false);
  }
}

async function gerarModelo3D(){
  if(!state.preparedImageUrl){
    notify("Prepare a imagem antes de gerar o modelo 3D.", "erro");
    return;
  }

  setStage("gerar");
  setButtonLoading(dom.ai3dGenerateBtn, true, "Gerando...");
  showLoading(true, "Gerando GLB...");
  setStep("gerar", "active");
  setCreationStatus("modelo", "active");
  setProgress(4, "Iniciando");

  try{
    clearSceneModel();
    const flow = [
      ["prepare", 18, "Preparando imagem"],
      ["geometry", 44, "Gerando geometria"],
      ["texture", 68, "Aplicando materiais"],
      ["convert", 88, "Convertendo para GLB"],
      ["done", 100, "Finalizado"],
    ];

    for(const [key, percent, label] of flow){
      setProcessStatus(key, "active");
      setProgress(percent, label);
      await delay(220);
      setProcessStatus(key, "done");
    }

    state.model = createProceduralFurniture();
    state.scene.add(state.model);
    dom.ai3dViewerEmpty.hidden = true;
    state.generated = true;
    calcularMedidasModelo();
    criarBoundingBox();
    criarReguasMedidas();
    fitCameraToObject(state.model);
    setStep("gerar", "done");
    setStep("medidas", "active");
    setStage("medidas");
    setCreationStatus("modelo", "done");
    setCreationStatus("medidas", "active");
    if(dom.ai3dAdjustBtn) dom.ai3dAdjustBtn.disabled = false;
    if(dom.ai3dSaveBtn) dom.ai3dSaveBtn.disabled = false;
    if(dom.ai3dSaveTop) dom.ai3dSaveTop.disabled = false;
  }catch(error){
    console.error("Erro ao gerar modelo 3D:", error);
    notify("Nao foi possivel gerar o modelo 3D.", "erro");
  }finally{
    setButtonLoading(dom.ai3dGenerateBtn, false);
    showLoading(false);
  }
}

function ajustarEscalaModelo(){
  if(!state.model){
    notify("Gere o modelo antes de ajustar as medidas.", "erro");
    return;
  }

  const measures = calcularMedidasModelo();
  const real = readRealMeasures();
  if(!measures?.width || !measures?.height || !measures?.depth) return;

  state.model.scale.x *= real.width / measures.width;
  state.model.scale.y *= real.height / measures.height;
  state.model.scale.z *= real.depth / measures.depth;

  calcularMedidasModelo();
  criarBoundingBox();
  criarReguasMedidas();
  fitCameraToObject(state.model);
  setStep("medidas", "done");
  setStep("salvar", "active");
  setStage("salvar");
  setCreationStatus("medidas", "done");
}

function exportModelToGlbBlob(){
  if(!state.model || !state.exporter){
    return Promise.reject(new Error("Modelo 3D indisponivel para exportacao."));
  }

  return new Promise((resolve, reject) => {
    state.exporter.parse(
      state.model,
      (result) => {
        if(result instanceof ArrayBuffer){
          resolve(new Blob([result], { type: "model/gltf-binary" }));
          return;
        }
        resolve(new Blob([JSON.stringify(result)], { type: "model/gltf+json" }));
      },
      (error) => reject(error),
      { binary: true, onlyVisible: true }
    );
  });
}

async function salvarModeloCorrigido(){
  if(!supabase){
    notify("Cliente Supabase nao encontrado.", "erro");
    return false;
  }
  if(!state.itemId || !state.empresaId){
    notify("Abra esta tela a partir de um item salvo.", "erro");
    return false;
  }
  if(!state.model){
    notify("Gere o modelo 3D antes de salvar.", "erro");
    return false;
  }

  setButtonLoading(dom.ai3dSaveBtn, true, "Salvando...");
  setButtonLoading(dom.ai3dSaveTop, true, "Salvando...");
  showLoading(true, "Exportando GLB...");

  try{
    const blob = await exportModelToGlbBlob();
    const storagePath = `${state.empresaId}/${state.itemId}/modelo-3d/modelo.glb`;
    const { error: uploadError } = await supabase.storage
      .from("itens")
      .upload(storagePath, blob, {
        cacheControl: "3600",
        contentType: "model/gltf-binary",
        upsert: true,
      });

    if(uploadError) throw uploadError;

    const { data: publicData } = supabase.storage
      .from("itens")
      .getPublicUrl(storagePath);

    const payload = {
      empresa_id: state.empresaId,
      item_id: state.itemId,
      nome_arquivo: `${slug(itemName())}.glb`,
      path: storagePath,
      url: publicData?.publicUrl,
      mime_type: "model/gltf-binary",
      tamanho_bytes: blob.size,
      status: "ativo",
    };

    const { data, error } = await supabase
      .from("itens_modelos_3d")
      .upsert(payload, { onConflict: "item_id" })
      .select("*")
      .single();

    if(error) throw error;

    state.modeloExistente = data;
    state.saved = true;
    setStep("salvar", "done");
    setStage("salvar");
    setCreationStatus("salvo", "done");
    notify("Modelo 3D salvo no item.", "sucesso");
    return true;
  }catch(error){
    console.error("Erro ao salvar modelo 3D:", error);
    notify(error.message || "Nao foi possivel salvar o modelo 3D.", "erro");
    return false;
  }finally{
    showLoading(false);
    setButtonLoading(dom.ai3dSaveBtn, false);
    setButtonLoading(dom.ai3dSaveTop, false);
  }
}

async function carregarItem(){
  const itemIdFromUrl = new URLSearchParams(window.location.search).get("id");
  state.itemId = window.__ITEM_3D_AI_ID || window.itemAtualId || window.__ITEM_DETALHE_ID || itemIdFromUrl || null;
  state.empresaId = await getEmpresaAtualId();

  if(!state.itemId){
    notify("Selecione um item salvo para criar o modelo 3D.", "erro");
    voltarParaItem();
    return;
  }

  const { data, error } = await supabase
    .from("itens")
    .select("*")
    .eq("empresa_id", state.empresaId)
    .eq("id", state.itemId)
    .single();

  if(error){
    console.error("Erro ao carregar item para modelo 3D:", error);
    notify("Nao foi possivel carregar o item.", "erro");
    voltarParaItem();
    return;
  }

  state.item = data;
  const name = itemName(data);
  if(dom.ai3dTitle) dom.ai3dTitle.textContent = `Criar modelo 3D - ${name}`;
  if(dom.ai3dSubtitle) dom.ai3dSubtitle.textContent = `Foto e medidas do item ${text(data.codigo, "")}`.trim();

  state.realMeasures = {
    width: centimetersFromMeters(data.largura, 80),
    height: centimetersFromMeters(data.altura, 90),
    depth: centimetersFromMeters(data.profundidade, 75),
  };
  updateMeasureInputs();
  setImagePreview(data.foto_url || "");

  if(data.foto_url){
    state.imageFile = null;
    state.imageMime = "image/png";
    state.imageFilename = `${slug(name)}.png`;
    setCreationStatus("foto", "done");
    setStep("foto", "active");
    setStage("foto");
  }

  await carregarModeloExistente();
}

async function carregarModeloExistente(){
  const { data, error } = await supabase
    .from("itens_modelos_3d")
    .select("*")
    .eq("item_id", state.itemId)
    .maybeSingle();

  if(error){
    console.warn("Modelo 3D existente nao carregado:", error);
    return;
  }

  state.modeloExistente = data || null;
  if(data?.url){
    setPreparedPreview(state.imageUrl || "");
    setStep("fundo", "done");
    await carregarGLB(data.url);
  }
}

function voltarParaItem(){
  const itemId = state.itemId || window.__ITEM_3D_AI_ID || window.itemAtualId || window.__ITEM_DETALHE_ID || null;
  window.__ITEM_DETALHE_ID = itemId;
  window.__ITEM_DETALHE_MODO = itemId ? "editar" : "novo";
  window.__ITEM_3D_AI_ID = null;

  const suffix = itemId ? `?id=${encodeURIComponent(itemId)}` : "";
  window.location.href = `item-detalhes.html${suffix}`;
}

function bindEvents(){
  dom.ai3dBackBtn?.addEventListener("click", voltarParaItem);
  dom.ai3dSaveTop?.addEventListener("click", salvarModeloCorrigido);
  dom.ai3dSaveBtn?.addEventListener("click", salvarModeloCorrigido);
  dom.ai3dSelectPhotoBtn?.addEventListener("click", () => dom.ai3dImageInput?.click());
  dom.ai3dImageInput?.addEventListener("change", handleImageUpload);
  dom.ai3dRemoveBgBtn?.addEventListener("click", removerFundoImagem);
  dom.ai3dGenerateBtn?.addEventListener("click", gerarModelo3D);
  dom.ai3dAdjustBtn?.addEventListener("click", ajustarEscalaModelo);
  dom.ai3dRotateBtn?.addEventListener("click", () => {
    state.autoRotate = !state.autoRotate;
    dom.ai3dRotateBtn.classList.toggle("active", state.autoRotate);
  });
  dom.ai3dCenterBtn?.addEventListener("click", () => fitCameraToObject(state.model));
  dom.ai3dResetBtn?.addEventListener("click", () => fitCameraToObject(state.model));
  dom.ai3dHideRulers?.addEventListener("change", atualizarReguasELabels);

  document.querySelector(".ai3d-viewer-options")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-grid-unit]");
    if(!button) return;
    document.querySelectorAll("[data-grid-unit]").forEach((el) => el.classList.remove("active"));
    button.classList.add("active");
    updateGrid(Number(button.dataset.gridUnit));
  });

  document.querySelector(".ai3d-steps")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stage-target]");
    if(!button) return;
    setStage(button.dataset.stageTarget);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dom.ai3dDropzoneOriginal?.addEventListener(eventName, (event) => {
      event.preventDefault();
      dom.ai3dDropzoneOriginal.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dom.ai3dDropzoneOriginal?.addEventListener(eventName, (event) => {
      event.preventDefault();
      dom.ai3dDropzoneOriginal.classList.remove("dragover");
    });
  });

  dom.ai3dDropzoneOriginal?.addEventListener("drop", handleImageUpload);

  [dom.ai3dRealWidth, dom.ai3dRealHeight, dom.ai3dRealDepth].forEach((field) => {
    field?.addEventListener("input", () => {
      readRealMeasures();
      if(state.model){
        calcularMedidasModelo();
      }
    });
  });

  window.addEventListener("resize", resizeRenderer);
}

function destroyModelo3DIA(){
  window.removeEventListener("resize", resizeRenderer);
  stopAnimation();
  clearSceneModel();
  state.controls?.dispose?.();
  state.renderer?.dispose?.();
  state.renderer?.domElement?.remove?.();
  state.renderer = null;
  state.scene = null;
  state.camera = null;
  state.controls = null;
  state.loader = null;
  state.exporter = null;
  state.model = null;
}

async function initModelo3DIA(){
  mapDom();
  bindEvents();
  setStage("foto");
  window.lucide?.createIcons?.();

  try{
    await inicializarThreeJS();
    await carregarItem();
  }catch(error){
    console.error("Erro ao iniciar modulo de modelo 3D:", error);
    notify("Nao foi possivel iniciar o modulo de modelo 3D.", "erro");
  }finally{
    updateCurrentMeasures();
    window.lucide?.createIcons?.();
    window.finalizarCarregamentoModulo?.();
  }
}

window.__activeModuleDestroy = destroyModelo3DIA;
requestAnimationFrame(() => requestAnimationFrame(initModelo3DIA));

export {
  handleImageUpload,
  removerFundoImagem,
  gerarModelo3D,
  inicializarThreeJS,
  carregarGLB,
  calcularMedidasModelo,
  criarBoundingBox,
  criarReguasMedidas,
  atualizarReguasELabels,
  ajustarEscalaModelo,
  salvarModeloCorrigido,
};
