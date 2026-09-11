import { renderPdfPage } from './catalogo-pdf.mjs';
const THREE_URL = "three";
const GLTF_URL = "three/addons/loaders/GLTFLoader.js";
const ORBIT_URL = "three/addons/controls/OrbitControls.js";
const TRANSFORM_URL = "three/addons/controls/TransformControls.js";

function detectPerformanceProfile(){
  const cores = Number(navigator.hardwareConcurrency) || 4;
  const memory = Number(navigator.deviceMemory) || 4;
  const compactScreen = matchMedia("(max-width: 820px)").matches;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const low = reducedMotion || cores <= 4 || memory <= 4 || compactScreen;
  const high = !low && cores >= 8 && memory >= 8;
  return {
    tier: low ? "economy" : high ? "high" : "balanced",
    antialias: !low,
    shadows: !low,
    maxFps: low ? 30 : high ? 60 : 45,
    pixelRatio: low ? 1 : high ? 1.5 : 1.25,
    shadowMapSize: high ? 1024 : 512,
    wallTextureSize: low ? 900 : high ? 1500 : 1200,
  };
}

const studio = {
  initialized: false, items: [], supabase: null, empresaId: null, three: null,
  scene: null, camera: null, renderer: null, orbit: null, transform: null,
  loader: null, objects: [], selected: null, raf: null, backgroundImage: null,
  floor: null, grid: null, neutralFloorMaterial: null, shadowFloorMaterial: null,
  cameraLocked: false, threePromise: null, scenePromise: null,
  backgroundFit: "contain", backgroundX: 50, backgroundY: 50,
  roomWidth: 10, roomDepth: 10, roomBorder: null,
  floorPlanMaterial: null, floorFinish: "neutral", floorFinishMaterials: new Map(),
  rulerActive: false, rulerPoints: [], rulerVisual: null, rulerDistance: null,
  floorPlanSource: null, cropActive: false, cropDrag: null,
  walls: {}, wallHeight: 4,
  customWalls: [], selectedCustomWallId: null, wallDrawActive: false,
  wallDrawPoints: [], wallDrawPreview: null, wallSequence: 0,
  gridVisible: true,
  zoomFocus: null,
  directDrag: null, rotateRaf: null,
  grouping: false, groupSelection: new Set(), groupHelpers: [],
  performance: detectPerformanceProfile(), lastFrameAt: 0,
  modelCache: new Map(), modelLoads: new Map(), modelProgress: new Map(),
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));
const normalizeSearch = (value) => String(value || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function isTopViewActive(){
  return $("studioTopView")?.getAttribute("aria-pressed") === "true";
}

function shouldEnableOrbit(){
  return !studio.rulerActive && !studio.cropActive && !studio.wallDrawActive && (!studio.cameraLocked || isTopViewActive());
}

function supportsWebGL(){
  try{
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if(!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  }catch{
    return false;
  }
}

async function loadThree(){
  if(studio.three) return studio.three;
  if(studio.threePromise) return studio.threePromise;
  studio.threePromise = Promise.all([
    import(THREE_URL), import(GLTF_URL), import(ORBIT_URL), import(TRANSFORM_URL),
  ]).then(([THREE, loader, orbit, transform]) => {
    studio.three = { THREE, GLTFLoader: loader.GLTFLoader, OrbitControls: orbit.OrbitControls, TransformControls: transform.TransformControls };
    return studio.three;
  }).catch((error) => {
    studio.threePromise = null;
    throw error;
  });
  return studio.threePromise;
}

function renderLibrary(query = ""){
  const list = $("studioLibraryList");
  const normalized = normalizeSearch(query.trim());
  const available = studio.items.filter((item) => item.glb);
  list.innerHTML = available.length ? available.map((item) => {
    const loading = studio.modelProgress.has(String(item.id));
    const search = normalizeSearch(`${item.name} ${item.catLabel || ""}`);
    const hidden = normalized && !search.includes(normalized);
    return `
    <button type="button" class="studio-library-item ${loading ? "is-loading" : ""} ${hidden ? "hidden" : ""}" data-studio-add="${escapeHtml(item.id)}" data-search="${escapeHtml(search)}" title="${loading ? "Carregando" : "Adicionar"} ${escapeHtml(item.name)}" ${loading ? 'disabled aria-busy="true"' : ""}>
      <img src="${escapeHtml(item.photo)}" alt="" loading="lazy">
      <span>${escapeHtml(item.name)}</span><b aria-hidden="true">${loading ? "" : "+"}</b>
    </button>`;
  }).join("") + `<div class="studio-library-empty ${available.some((item) => !normalized || normalizeSearch(`${item.name} ${item.catLabel || ""}`).includes(normalized)) ? "hidden" : ""}">Nenhum modelo 3D disponível.</div>`
    : `<div class="studio-library-empty">Nenhum modelo 3D disponível.</div>`;
}

function filterLibrary(query = ""){
  const list = $("studioLibraryList");
  const normalized = normalizeSearch(query.trim());
  let visible = 0;
  list?.querySelectorAll("[data-studio-add]").forEach((button) => {
    const match = !normalized || button.dataset.search.includes(normalized);
    button.classList.toggle("hidden", !match);
    if(match) visible += 1;
  });
  list?.querySelector(".studio-library-empty")?.classList.toggle("hidden", visible > 0);
}

function setModelLoading(item, loading, progress = 0){
  const key = String(item.id);
  if(loading) studio.modelProgress.set(key, Math.max(0, Math.min(1, progress)));
  else studio.modelProgress.delete(key);
  document.querySelectorAll(`[data-studio-add="${CSS.escape(key)}"]`).forEach((button) => {
    button.classList.toggle("is-loading", loading);
    button.toggleAttribute("disabled", loading);
    button.toggleAttribute("aria-busy", loading);
    button.title = `${loading ? "Carregando" : "Adicionar"} ${item.name}`;
    const indicator = button.querySelector("b");
    if(indicator) indicator.textContent = loading ? "" : "+";
  });
}

async function ensureScene(){
  if(studio.renderer) return;
  if(studio.scenePromise) return studio.scenePromise;
  studio.scenePromise = createScene().catch((error) => {
    studio.scenePromise = null;
    throw error;
  });
  return studio.scenePromise;
}

async function createScene(){
  if(!supportsWebGL()) throw new Error("WEBGL_UNAVAILABLE");
  const { THREE, GLTFLoader, OrbitControls, TransformControls } = await loadThree();
  THREE.Cache.enabled = true;
  const profile = studio.performance;
  const host = $("studioCanvasHost");
  host.dataset.performanceProfile = profile.tier;
  studio.scene = new THREE.Scene();
  studio.scene.background = null;
  studio.camera = new THREE.PerspectiveCamera(38, 1, .01, 200);
  studio.camera.position.set(6.4, 4.7, 7.6);

  studio.renderer = new THREE.WebGLRenderer({
    antialias: profile.antialias,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: profile.tier === "economy" ? "low-power" : "high-performance",
  });
  studio.renderer.setClearColor(0x000000, 0);
  studio.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, profile.pixelRatio));
  studio.renderer.outputColorSpace = THREE.SRGBColorSpace;
  studio.renderer.shadowMap.enabled = profile.shadows;
  studio.renderer.shadowMap.type = profile.tier === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  host.appendChild(studio.renderer.domElement);
  studio.renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    showStudioLoadError("A visualização 3D foi interrompida pelo navegador.");
  });
  studio.renderer.domElement.addEventListener("webglcontextrestored", () => {
    $("studioCanvasEmpty")?.classList.toggle("hidden", studio.objects.length > 0);
    resize();
  });

  studio.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ad9f, 2.2));
  const key = new THREE.DirectionalLight(0xfff8ed, 3.2);
  key.position.set(5, 8, 4); key.castShadow = profile.shadows; key.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
  studio.scene.add(key);
  studio.neutralFloorMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d1c7, roughness: .92, metalness: 0 });
  studio.shadowFloorMaterial = new THREE.ShadowMaterial({ color: 0x463b34, opacity: .16, transparent: true });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(studio.roomWidth, studio.roomDepth), studio.neutralFloorMaterial);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = profile.shadows; floor.name = "studio-floor";
  studio.scene.add(floor); studio.floor = floor;
  const grid = new THREE.GridHelper(10, 10, 0xc2b8aa, 0xd2c9bd);
  grid.material.opacity = .2; grid.material.transparent = true; studio.scene.add(grid); studio.grid = grid;
  updateRoomPlan();

  studio.orbit = new OrbitControls(studio.camera, studio.renderer.domElement);
  studio.orbit.enableDamping = true;
  studio.orbit.target.set(0, .8, 0);
  studio.orbit.maxPolarAngle = Math.PI * .495;
  studio.orbit.screenSpacePanning = true;
  studio.orbit.zoomToCursor = true;
  studio.orbit.zoomSpeed = 1.15;
  studio.orbit.panSpeed = .9;
  studio.orbit.minDistance = .5;
  studio.orbit.maxDistance = 3000;
  studio.transform = new TransformControls(studio.camera, studio.renderer.domElement);
  studio.transform.setMode("translate"); studio.transform.setSpace("world");
  studio.transform.showY = false;
  studio.transform.enabled = false;
  studio.transform.visible = false;
  studio.transform.addEventListener("dragging-changed", (event) => {
    studio.orbit.enabled = !event.value && shouldEnableOrbit();
  });
  studio.transform.addEventListener("objectChange", () => {
    if(studio.selected){
      const original = studio.selected.userData.catalogOriginalScale;
      if(original) studio.selected.scale.copy(original);
      keepObjectAboveFloor(studio.selected);
      validateRoomFit();
    }
  });
  studio.scene.add(studio.transform);
  studio.loader = new GLTFLoader();

  studio.renderer.domElement.addEventListener("pointerdown", selectFromPointer);
  studio.renderer.domElement.addEventListener("pointermove", moveSelectedFromPointer);
  studio.renderer.domElement.addEventListener("pointerup", finishDirectDrag);
  studio.renderer.domElement.addEventListener("pointercancel", finishDirectDrag);
  studio.renderer.domElement.addEventListener("dblclick", focusCameraFromPointer);
  window.addEventListener("resize", resize);
  resize();
  const loop = (time = 0) => {
    studio.raf = requestAnimationFrame(loop);
    if(document.hidden || $("catalogStudio")?.classList.contains("hidden")) return;
    const minimumFrameTime = 1000 / studio.performance.maxFps;
    if(time - studio.lastFrameAt < minimumFrameTime) return;
    studio.lastFrameAt = time;
    studio.orbit.update();
    studio.renderer.render(studio.scene, studio.camera);
  };
  loop();
}

function showStudioLoadError(message){
  const empty = $("studioCanvasEmpty");
  if(!empty) return;
  empty.classList.remove("hidden");
  empty.innerHTML = `<strong>Não foi possível carregar o 3D</strong><span>${escapeHtml(message)}</span><button type="button" data-studio-retry>Tentar novamente</button>`;
}

async function openStudioScene(){
  const empty = $("studioCanvasEmpty");
  if(empty && !studio.renderer) empty.innerHTML = "<strong>Preparando o ambiente 3D</strong><span>Isso leva apenas um instante.</span>";
  try{
    await ensureScene();
    requestAnimationFrame(resize);
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if(!connection?.saveData && !/2g/.test(connection?.effectiveType || "")){
      const firstItem = studio.items.find((item) => item.glb);
      const preload = () => warmModel(firstItem);
      if("requestIdleCallback" in window) window.requestIdleCallback(preload, { timeout: 1800 });
      else window.setTimeout(preload, 500);
    }
  }catch(error){
    console.error("Falha ao iniciar painel 3D:", error);
    showStudioLoadError(error?.message === "WEBGL_UNAVAILABLE"
      ? "Ative a aceleração de hardware do navegador e recarregue a página."
      : "Confira a conexão e tente novamente.");
  }
}

function resize(){
  const host = $("studioCanvasHost");
  if(!host || !studio.renderer) return;
  const rect = host.getBoundingClientRect();
  if(rect.width < 2 || rect.height < 2) return;
  studio.camera.aspect = rect.width / rect.height;
  studio.camera.updateProjectionMatrix();
  studio.renderer.setSize(rect.width, rect.height, false);
}

function seededRandom(seed = 73421){
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function drawWoodPlate(context, x, y, size, vertical, index, random){
  const colors = ["#9a6542", "#a8734d", "#8b593b", "#b07b52", "#96613f", "#a56d47", "#875638"];
  const slats = 7;
  const slatSize = size / slats;
  context.save();
  context.beginPath();
  context.rect(x + 2, y + 2, size - 4, size - 4);
  context.clip();
  for(let slat = 0; slat < slats; slat += 1){
    const offset = slat * slatSize;
    context.fillStyle = colors[(index * 3 + slat) % colors.length];
    if(vertical) context.fillRect(x + offset, y, slatSize, size);
    else context.fillRect(x, y + offset, size, slatSize);
    context.strokeStyle = "rgba(255,225,184,.17)";
    context.lineWidth = 1;
    for(let grain = 0; grain < 4; grain += 1){
      context.beginPath();
      if(vertical){
        const gx = x + offset + slatSize * (.18 + random() * .64);
        context.moveTo(gx, y + random() * 24);
        context.bezierCurveTo(gx + 2, y + size * .35, gx - 2, y + size * .7, gx + 1, y + size);
      }else{
        const gy = y + offset + slatSize * (.18 + random() * .64);
        context.moveTo(x + random() * 24, gy);
        context.bezierCurveTo(x + size * .35, gy + 2, x + size * .7, gy - 2, x + size, gy + 1);
      }
      context.stroke();
    }
    context.fillStyle = "rgba(53,31,19,.42)";
    if(vertical) context.fillRect(x + offset + slatSize - 2.5, y, 2.5, size);
    else context.fillRect(x, y + offset + slatSize - 2.5, size, 2.5);
  }
  context.restore();
  context.strokeStyle = "rgba(57,35,22,.7)";
  context.lineWidth = 5;
  context.strokeRect(x + 2.5, y + 2.5, size - 5, size - 5);
}

function createFloorFinishCanvas(finish){
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const random = seededRandom(finish === "grass" ? 9817 : finish === "sand" ? 4289 : 6421);
  if(finish === "grass"){
    context.fillStyle = "#66854a";
    context.fillRect(0, 0, 512, 512);
    for(let index = 0; index < 7000; index += 1){
      const x = random() * 512, y = random() * 512;
      const green = Math.floor(72 + random() * 62);
      context.fillStyle = `rgba(${Math.floor(green * .7)},${green},${Math.floor(green * .52)},${.2 + random() * .32})`;
      context.fillRect(x, y, 1 + random() * 1.8, 2 + random() * 4);
    }
  }else if(finish === "sand"){
    context.fillStyle = "#d8c294";
    context.fillRect(0, 0, 512, 512);
    for(let index = 0; index < 9000; index += 1){
      const shade = random() > .52 ? "110,84,48" : "255,242,204";
      context.fillStyle = `rgba(${shade},${.035 + random() * .11})`;
      const radius = .35 + random() * 1.2;
      context.beginPath();
      context.arc(random() * 512, random() * 512, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = "rgba(131,105,66,.09)";
    context.lineWidth = 2;
    for(let line = 0; line < 8; line += 1){
      const y = 30 + line * 64 + random() * 18;
      context.beginPath();
      context.moveTo(-20, y);
      context.bezierCurveTo(130, y - 13, 330, y + 16, 540, y - 4);
      context.stroke();
    }
  }else{
    context.fillStyle = "#68432d";
    context.fillRect(0, 0, 512, 512);
    const plateSize = 256;
    drawWoodPlate(context, 0, 0, plateSize, true, 0, random);
    drawWoodPlate(context, plateSize, 0, plateSize, false, 1, random);
    drawWoodPlate(context, 0, plateSize, plateSize, false, 2, random);
    drawWoodPlate(context, plateSize, plateSize, plateSize, true, 3, random);
  }
  return canvas;
}

function floorFinishMaterial(finish){
  if(finish === "neutral") return studio.neutralFloorMaterial;
  if(studio.floorFinishMaterials.has(finish)) return studio.floorFinishMaterials.get(finish);
  const { THREE } = studio.three;
  const texture = new THREE.CanvasTexture(createFloorFinishCanvas(finish));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(studio.performance.tier === "economy" ? 2 : 6, studio.renderer.capabilities.getMaxAnisotropy());
  const metersPerPattern = finish === "slatted-wood" ? 2 : 2.5;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: finish === "slatted-wood" ? .76 : .98,
    metalness: 0,
  });
  material.userData.catalogMetersPerPattern = metersPerPattern;
  studio.floorFinishMaterials.set(finish, material);
  return material;
}

function updateFloorFinishScale(material = studio.floor?.material){
  const texture = material?.map;
  const meters = Number(material?.userData?.catalogMetersPerPattern);
  if(!texture || !(meters > 0)) return;
  texture.repeat.set(Math.max(.2, studio.roomWidth / meters), Math.max(.2, studio.roomDepth / meters));
  texture.needsUpdate = true;
}

function applyFloorFinish(finish, announce = false){
  if(!studio.floor || !studio.three) return;
  const next = finish === "plan" && studio.floorPlanMaterial ? "plan"
    : ["neutral", "grass", "sand", "slatted-wood"].includes(finish) ? finish : "neutral";
  studio.floorFinish = next;
  studio.floor.material = next === "plan" ? studio.floorPlanMaterial : floorFinishMaterial(next);
  updateFloorFinishScale(studio.floor.material);
  const select = $("studioFloorFinish");
  if(select) select.value = next;
  if(announce){
    const names = { neutral: "Piso neutro", grass: "Grama", sand: "Areia de praia", "slatted-wood": "Madeira ripada", plan: "Planta importada" };
    window.catalogNotify?.({ title: "Piso atualizado", message: `${names[next]} aplicado em toda a área, sem alterar as medidas.`, status: "success", duration: 4000 });
  }
}

function updateCount(){
  const host = $("studioCanvasHost");
  host?.classList.toggle("has-furniture", studio.objects.length > 0);
  if(host) host.dataset.furnitureCount = String(studio.objects.length);
  $("studioCanvasEmpty")?.classList.toggle("hidden", studio.objects.length > 0);
  validateRoomFit();
}

function updateRoomPlan(){
  if(!studio.scene || !studio.three || !studio.floor) return;
  const { THREE } = studio.three;
  studio.floor.geometry.dispose();
  studio.floor.geometry = new THREE.PlaneGeometry(studio.roomWidth, studio.roomDepth);
  updateFloorFinishScale();
  if(studio.grid){
    studio.scene.remove(studio.grid);
    studio.grid.geometry?.dispose();
    studio.grid.material?.dispose();
  }
  const gridPoints = [];
  const halfWidth = studio.roomWidth / 2, halfDepth = studio.roomDepth / 2;
  for(let x = Math.ceil(-halfWidth); x <= halfWidth; x += 1) gridPoints.push(new THREE.Vector3(x, .006, -halfDepth), new THREE.Vector3(x, .006, halfDepth));
  for(let z = Math.ceil(-halfDepth); z <= halfDepth; z += 1) gridPoints.push(new THREE.Vector3(-halfWidth, .006, z), new THREE.Vector3(halfWidth, .006, z));
  studio.grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(gridPoints),
    new THREE.LineBasicMaterial({ color: 0xc5b9aa, transparent: true, opacity: .45 }),
  );
  studio.grid.visible = studio.gridVisible;
  studio.scene.add(studio.grid);
  if(studio.roomBorder){ studio.scene.remove(studio.roomBorder); studio.roomBorder.geometry.dispose(); studio.roomBorder.material.dispose(); }
  const w = studio.roomWidth / 2, d = studio.roomDepth / 2;
  const points = [[-w,.012,-d],[w,.012,-d],[w,.012,d],[-w,.012,d]].map((p) => new THREE.Vector3(...p));
  studio.roomBorder = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x8b6a45 }));
  studio.scene.add(studio.roomBorder);
  updatePhotoWalls();
  validateRoomFit();
}

function validateRoomFit(){
  const status = $("studioRoomStatus");
  if(!status || !studio.three) return;
  const halfWidth = studio.roomWidth / 2, halfDepth = studio.roomDepth / 2;
  let outside = 0;
  studio.objects.forEach((object) => {
    const box = new studio.three.THREE.Box3().setFromObject(object);
    const doesNotFit = box.min.x < -halfWidth || box.max.x > halfWidth || box.min.z < -halfDepth || box.max.z > halfDepth;
    object.userData.outsideRoom = doesNotFit;
    if(doesNotFit) outside += 1;
  });
  status.classList.toggle("has-overflow", outside > 0);
  status.textContent = outside
    ? `Espaço: ${studio.roomWidth} × ${studio.roomDepth} m • ${outside} ${outside === 1 ? "item fora da planta" : "itens fora da planta"}`
    : `Espaço: ${studio.roomWidth} × ${studio.roomDepth} m • Tudo dentro da planta`;
  if(studio.roomBorder) studio.roomBorder.material.color.setHex(outside ? 0xb43b31 : 0x8b6a45);
}

function showTopView(){
  if(!studio.camera || !studio.orbit) return;
  resize();
  const halfFov = studio.three.THREE.MathUtils.degToRad(studio.camera.fov / 2);
  const distanceForDepth = studio.roomDepth / (2 * Math.tan(halfFov));
  const distanceForWidth = studio.roomWidth / (2 * Math.tan(halfFov) * Math.max(studio.camera.aspect, .25));
  const distance = Math.max(8, distanceForDepth, distanceForWidth) * 1.2;
  studio.camera.up.set(0, 0, -1);
  // Vista quase vertical, como uma planta fotografada de cima, com uma leve
  // perspectiva para manter a leitura de volume dos móveis.
  studio.camera.position.set(0, distance, distance * .1);
  studio.orbit.target.set(0, 0, 0);
  studio.camera.lookAt(studio.orbit.target);
  studio.camera.updateMatrixWorld(true);
  studio.camera.updateProjectionMatrix();
  studio.orbit.enableRotate = false;
  studio.orbit.minPolarAngle = 0;
  studio.orbit.maxPolarAngle = Math.PI;
  studio.orbit.enablePan = true;
  studio.orbit.enableZoom = true;
  studio.orbit.zoomToCursor = true;
  studio.orbit.mouseButtons.LEFT = studio.three.THREE.MOUSE.PAN;
  studio.orbit.mouseButtons.RIGHT = studio.three.THREE.MOUSE.PAN;
  studio.orbit.touches.ONE = studio.three.THREE.TOUCH.PAN;
  studio.orbit.touches.TWO = studio.three.THREE.TOUCH.DOLLY_PAN;
  studio.orbit.update();
  studio.cameraLocked = true;
  studio.orbit.enabled = !studio.rulerActive && !studio.cropActive;
  const lockButton = $("studioCameraLock");
  if(lockButton){
    lockButton.setAttribute("aria-pressed", "true");
    lockButton.textContent = "Câmera travada";
  }
  $("studioCanvasHost")?.classList.add("is-map-view");
  $("studioTopView")?.classList.add("active");
  $("studioTopView")?.setAttribute("aria-pressed", "true");
  $("studioPerspectiveView")?.classList.remove("active");
  $("studioPerspectiveView")?.setAttribute("aria-pressed", "false");
  studio.renderer?.render(studio.scene, studio.camera);
}

function showPerspectiveView(){
  if(!studio.camera || !studio.orbit || !studio.three) return;
  resize();
  const span = Math.max(8, Math.hypot(studio.roomWidth, studio.roomDepth) * .72);
  studio.camera.up.set(0, 1, 0);
  studio.orbit.target.set(0, Math.min(1.2, studio.wallHeight * .25), 0);
  studio.camera.position.set(span * .72, span * .58, span * .82);
  studio.camera.lookAt(studio.orbit.target);
  studio.camera.updateMatrixWorld(true);
  studio.camera.updateProjectionMatrix();
  studio.orbit.enabled = !studio.rulerActive && !studio.cropActive && !studio.wallDrawActive;
  studio.orbit.enableRotate = true;
  studio.orbit.enablePan = true;
  studio.orbit.enableZoom = true;
  studio.orbit.zoomToCursor = true;
  studio.orbit.screenSpacePanning = true;
  studio.orbit.mouseButtons.LEFT = studio.three.THREE.MOUSE.ROTATE;
  studio.orbit.mouseButtons.RIGHT = studio.three.THREE.MOUSE.PAN;
  studio.orbit.touches.ONE = studio.three.THREE.TOUCH.ROTATE;
  studio.orbit.touches.TWO = studio.three.THREE.TOUCH.DOLLY_PAN;
  studio.orbit.minPolarAngle = 0;
  studio.orbit.maxPolarAngle = Math.PI * .495;
  studio.orbit.update();
  studio.cameraLocked = false;
  $("studioCanvasHost")?.classList.remove("is-map-view");
  $("studioTopView")?.classList.remove("active");
  $("studioTopView")?.setAttribute("aria-pressed", "false");
  $("studioPerspectiveView")?.classList.add("active");
  $("studioPerspectiveView")?.setAttribute("aria-pressed", "true");
  const lockButton = $("studioCameraLock");
  if(lockButton){ lockButton.setAttribute("aria-pressed", "false"); lockButton.textContent = "Travar câmera"; }
  studio.renderer?.render(studio.scene, studio.camera);
}

function toggleGrid(){
  studio.gridVisible = !studio.gridVisible;
  if(studio.grid) studio.grid.visible = studio.gridVisible;
  const button = $("studioGridToggle");
  if(button){
    button.textContent = studio.gridVisible ? "Ocultar linhas" : "Mostrar linhas";
    button.setAttribute("aria-pressed", String(studio.gridVisible));
  }
}

function zoomPlan(factor){
  if(!studio.camera || !studio.orbit) return;
  if(factor < 1 && studio.zoomFocus){
    studio.orbit.target.lerp(studio.zoomFocus, .45);
  }
  const offset = studio.camera.position.clone().sub(studio.orbit.target);
  const nextLength = Math.max(.8, Math.min(180, offset.length() * factor));
  offset.setLength(nextLength);
  studio.camera.position.copy(studio.orbit.target).add(offset);
  studio.orbit.update();
}

function focusCameraFromPointer(event){
  if(studio.cameraLocked || studio.rulerActive || studio.cropActive) return;
  const point = floorPointFromPointer(event);
  if(!point) return;
  studio.orbit.target.set(point.x, 0, point.z);
  studio.zoomFocus = point.clone();
  studio.orbit.update();
}

async function loadFloorPlan(file){
  if(!file) return;
  if(file.type === "application/pdf" || /\.pdf$/i.test(file.name)){
    try{
      window.catalogNotify?.({ title: "Abrindo PDF", message: "Preparando a planta em alta resolução...", status: "working", duration: 5000 });
      file = await renderPdfPage(file);
      if (!file) return;
    }catch(error){
      window.catalogNotify?.({ title: "Não foi possível abrir o PDF", message: error?.message || "Verifique o arquivo.", status: "error", duration: 12000 });
      return;
    }
  }
  if(!["image/png", "image/jpeg", "image/webp"].includes(file.type)){
    window.catalogNotify?.({ title: "Arquivo não compatível", message: "Envie a planta em PDF, PNG, JPG ou WebP.", status: "error" });
    return;
  }
  if(file.size > 8 * 1024 * 1024){
    window.catalogNotify?.({ title: "Planta muito grande", message: "Envie uma imagem de até 8 MB.", status: "error" });
    return;
  }
  let working;
  try{
    await ensureScene();
    working = window.catalogNotify?.({ title: "Lendo medidas da planta", message: "A IA está identificando cotas e limites...", status: "working", duration: 60000 });
    const planImage = await fileToDataUrl(file);
    const { data, error } = await studio.supabase.functions.invoke("studio-ai-engine", { body: {
      action: "analyze_floor_plan", empresa_id: studio.empresaId,
      catalog_token: sessionStorage.getItem("catalogo_token"), plan_image: planImage,
    }});
    if(error){
      let details = "";
      try{
        const payload = await error.context?.json();
        details = payload?.details || payload?.erro || payload?.error || "";
      }catch{ /* A resposta pode não ser JSON. */ }
      throw new Error(details || error.message || "A IA não conseguiu analisar a planta.");
    }
    if(!data?.ok) throw new Error(data?.details || data?.erro || "A IA não conseguiu analisar a planta.");
    const result = data.analysis || {};
    if(!(Number(result.width_m) > 0) || !(Number(result.depth_m) > 0)) throw new Error("As cotas principais não foram encontradas. Use uma imagem com medidas legíveis.");
    const imageSize = await getImageSize(planImage);
    const boundsWidth = Math.max(.05, Number(result.bounds?.right) - Number(result.bounds?.left));
    const boundsDepth = Math.max(.05, Number(result.bounds?.bottom) - Number(result.bounds?.top));
    const horizontalMetersPerPixel = Number(result.width_m) / (boundsWidth * imageSize.width);
    const verticalMetersPerPixel = Number(result.depth_m) / (boundsDepth * imageSize.height);
    const validScales = [horizontalMetersPerPixel, verticalMetersPerPixel].filter((value) => Number.isFinite(value) && value > 0);
    if(!validScales.length) throw new Error("Não foi possível calcular a escala da planta.");
    const metersPerPixel = validScales.length === 2 ? Math.sqrt(validScales[0] * validScales[1]) : validScales[0];
    studio.roomWidth = Number((imageSize.width * metersPerPixel).toFixed(3));
    studio.roomDepth = Number((imageSize.height * metersPerPixel).toFixed(3));
    $("studioRoomWidth").value = String(studio.roomWidth);
    $("studioRoomDepth").value = String(studio.roomDepth);
    updateRoomPlan();
    applyFloorPlanTexture(planImage);
    showTopView();
    working?.close?.();
    window.catalogNotify?.({ title: "Planta inteira dimensionada", message: `Escala calculada pelas cotas, sem cortar a imagem (${Math.round(Number(result.confidence || 0) * 100)}% de confiança).`, status: "success", duration: 12000 });
  }catch(error){
    working?.close?.();
    window.catalogNotify?.({ title: "Não foi possível medir", message: error?.message || "Confira se as cotas estão legíveis.", status: "error", duration: 12000 });
  }
}

function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getImageSize(src){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });
}

function cropPlanImage(src, rawBounds){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const clamp = (value, fallback) => Math.min(1, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : fallback));
      const left = clamp(rawBounds?.left, 0), top = clamp(rawBounds?.top, 0);
      const right = Math.max(left + .05, clamp(rawBounds?.right, 1));
      const bottom = Math.max(top + .05, clamp(rawBounds?.bottom, 1));
      const sx = left * image.naturalWidth, sy = top * image.naturalHeight;
      const sw = Math.min(image.naturalWidth - sx, (right - left) * image.naturalWidth);
      const sh = Math.min(image.naturalHeight - sy, (bottom - top) * image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw)); canvas.height = Math.max(1, Math.round(sh));
      canvas.getContext("2d").drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", .92));
    };
    image.onerror = reject; image.src = src;
  });
}

function applyFloorPlanTexture(url){
  studio.floorPlanSource = url;
  new studio.three.THREE.TextureLoader().load(url, (texture) => {
    texture.colorSpace = studio.three.THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(studio.performance.tier === "economy" ? 2 : 8, studio.renderer.capabilities.getMaxAnisotropy());
    studio.floorPlanMaterial?.map?.dispose();
    studio.floorPlanMaterial?.dispose();
    studio.floorPlanMaterial = new studio.three.THREE.MeshStandardMaterial({ map: texture, roughness: .95, metalness: 0 });
    const planOption = $("studioFloorPlanOption");
    if(planOption){ planOption.hidden = false; planOption.disabled = false; }
    applyFloorFinish("plan");
  }, undefined, () => {
    window.catalogNotify?.({ title: "Erro ao abrir planta", message: "Não foi possível ler essa imagem.", status: "error" });
  });
}

async function toggleStudioFullscreen(){
  const target = $("catalogStudio");
  if(!target) return;
  if(document.fullscreenElement) await document.exitFullscreen();
  else await target.requestFullscreen();
}

function groupMembers(object){
  const groupId = object?.userData?.catalogGroupId;
  return groupId ? studio.objects.filter((item) => item.userData.catalogGroupId === groupId) : object ? [object] : [];
}

function clearGroupHelpers(){
  studio.groupHelpers.forEach((helper) => { studio.scene?.remove(helper); helper.geometry?.dispose?.(); helper.material?.dispose?.(); });
  studio.groupHelpers = [];
}

function refreshGroupHelpers(){
  clearGroupHelpers();
  if(!studio.three) return;
  studio.groupSelection.forEach((object) => {
    const helper = new studio.three.THREE.BoxHelper(object, 0xc28b46);
    studio.scene.add(helper); studio.groupHelpers.push(helper);
  });
  const count = studio.groupSelection.size;
  if($("studioGroupingCount")) $("studioGroupingCount").textContent = String(count);
  const label = $("studioGroupingBar")?.querySelector("span");
  if(label) label.lastChild.textContent = count === 1 ? " móvel selecionado" : " móveis selecionados";
}

function toggleGrouping(){
  if(!studio.grouping){
    studio.grouping = true;
    studio.groupSelection = new Set(studio.selected ? groupMembers(studio.selected) : []);
    refreshGroupHelpers();
    $("studioGroupButton").querySelector("small").textContent = "Concluir bloco";
    $("studioGroupingBar")?.classList.remove("hidden");
    window.catalogNotify?.({ title: "Selecione o bloco", message: "Clique nos outros móveis e depois em Concluir bloco.", status: "success" });
    return;
  }
  if(studio.groupSelection.size < 2){
    window.catalogNotify?.({ title: "Selecione mais móveis", message: "Um bloco precisa ter pelo menos duas peças.", status: "error" });
    return;
  }
  const groupId = crypto.randomUUID();
  studio.groupSelection.forEach((object) => { object.userData.catalogGroupId = groupId; });
  const first = [...studio.groupSelection][0];
  studio.grouping = false; clearGroupHelpers(); studio.groupSelection.clear();
  $("studioGroupingBar")?.classList.add("hidden");
  $("studioGroupButton").querySelector("small").textContent = "Criar bloco";
  selectObject(first);
}

function cancelGrouping(){
  studio.grouping = false; studio.groupSelection.clear(); clearGroupHelpers();
  $("studioGroupingBar")?.classList.add("hidden");
  if($("studioGroupButton")) $("studioGroupButton").querySelector("small").textContent = "Criar bloco";
}

function ungroupSelected(){
  groupMembers(studio.selected).forEach((object) => { delete object.userData.catalogGroupId; });
  selectObject(studio.selected);
}

function selectedCustomWall(){
  return studio.customWalls.find((wall) => wall.id === studio.selectedCustomWallId) || null;
}

function disposeWallDrawPreview(){
  if(!studio.wallDrawPreview) return;
  studio.scene?.remove(studio.wallDrawPreview);
  studio.wallDrawPreview.traverse?.((node) => { node.geometry?.dispose?.(); node.material?.dispose?.(); });
  studio.wallDrawPreview = null;
}

function renderWallDrawPreview(start, end){
  if(!studio.scene || !studio.three || !start || !end) return;
  disposeWallDrawPreview();
  const { THREE } = studio.three;
  const group = new THREE.Group();
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([start.clone().setY(.045), end.clone().setY(.045)]),
    new THREE.LineBasicMaterial({ color: 0xc84a37 }),
  ));
  for(const point of [start, end]){
    const marker = new THREE.Mesh(new THREE.SphereGeometry(.09, 14, 8), new THREE.MeshBasicMaterial({ color: 0xc84a37 }));
    marker.position.copy(point).setY(.055);
    group.add(marker);
  }
  studio.wallDrawPreview = group;
  studio.scene.add(group);
}

function renderCustomWallList(){
  const list = $("studioCustomWallList");
  if(!list) return;
  if(!studio.customWalls.length){ list.innerHTML = "<span>Nenhuma parede desenhada</span>"; return; }
  list.innerHTML = studio.customWalls.map((wall) => `
    <button type="button" class="${wall.id === studio.selectedCustomWallId ? "active" : ""} ${wall.image ? "has-photo" : ""}" data-custom-wall-id="${escapeHtml(wall.id)}">
      ${escapeHtml(wall.name)} · ${wall.length.toFixed(2).replace(".", ",")} m
    </button>`).join("");
}

function refreshCustomWallSelection(){
  const selected = selectedCustomWall();
  studio.customWalls.forEach((wall) => wall.floorLine?.material?.color?.setHex(wall === selected ? 0xc84a37 : 0x8b6a45));
  renderCustomWallList();
  $("studioCustomWallRemove")?.classList.toggle("hidden", !selected);
}

function selectCustomWall(id){
  const wall = studio.customWalls.find((candidate) => candidate.id === id);
  if(!wall) return;
  studio.selectedCustomWallId = wall.id;
  selectObject(null);
  refreshCustomWallSelection();
  refreshWallControls();
}

function updateCustomWallGeometry(wall){
  if(!wall || !studio.three) return;
  const { THREE } = studio.three;
  wall.length = wall.start.distanceTo(wall.end);
  wall.mesh.geometry.dispose();
  wall.mesh.geometry = new THREE.PlaneGeometry(wall.length, wall.height);
  wall.mesh.position.set((wall.start.x + wall.end.x) / 2, wall.height / 2, (wall.start.z + wall.end.z) / 2);
  wall.mesh.rotation.y = -Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
  wall.floorLine.geometry.dispose();
  wall.floorLine.geometry = new THREE.BufferGeometry().setFromPoints([wall.start.clone().setY(.035), wall.end.clone().setY(.035)]);
  if(wall.image) configureWallTexture(wall, wall.length);
}

function createCustomWall(start, end){
  if(!studio.scene || !studio.three) return null;
  const { THREE } = studio.three;
  const length = start.distanceTo(end);
  if(length < .2) return null;
  const heightValue = Number($("studioWallHeight")?.value);
  const height = Number.isFinite(heightValue) ? Math.max(1, Math.min(12, heightValue)) : 3;
  const id = crypto.randomUUID();
  const name = `Parede ${++studio.wallSequence}`;
  const material = new THREE.MeshStandardMaterial({ color: 0xeee9e1, roughness: .9, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: .94 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, height), material);
  mesh.position.set((start.x + end.x) / 2, height / 2, (start.z + end.z) / 2);
  mesh.rotation.y = -Math.atan2(end.z - start.z, end.x - start.x);
  mesh.receiveShadow = true;
  mesh.userData.catalogCustomWallId = id;
  const floorLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([start.clone().setY(.035), end.clone().setY(.035)]),
    new THREE.LineBasicMaterial({ color: 0x8b6a45 }),
  );
  floorLine.userData.catalogCustomWallId = id;
  const wall = { id, name, start: start.clone(), end: end.clone(), length, height, mesh, floorLine, material, image: null, objectUrl: null, canvas: null, texture: null, fit: "cover", x: 50, y: 50, zoom: 1 };
  studio.customWalls.push(wall);
  studio.scene.add(mesh, floorLine);
  studio.selectedCustomWallId = id;
  refreshCustomWallSelection();
  refreshWallControls();
  return wall;
}

function wallPointFromPointer(event){
  const point = floorPointFromPointer(event);
  if(!point) return null;
  point.x = Math.max(-studio.roomWidth / 2, Math.min(studio.roomWidth / 2, point.x));
  point.z = Math.max(-studio.roomDepth / 2, Math.min(studio.roomDepth / 2, point.z));
  point.y = 0;
  return point;
}

function updateWallDrawPreview(event){
  if(!studio.wallDrawActive || studio.wallDrawPoints.length !== 1) return;
  const point = wallPointFromPointer(event);
  if(!point) return;
  renderWallDrawPreview(studio.wallDrawPoints[0], point);
  const distance = studio.wallDrawPoints[0].distanceTo(point);
  if($("studioWallDrawMessage")) $("studioWallDrawMessage").textContent = `${distance.toFixed(2).replace(".", ",")} m · clique para criar`;
}

function drawWallFromPointer(event){
  const point = wallPointFromPointer(event);
  if(!point) return;
  if(!studio.wallDrawPoints.length){
    studio.wallDrawPoints = [point.clone()];
    renderWallDrawPreview(point, point);
    if($("studioWallDrawMessage")) $("studioWallDrawMessage").textContent = "Mova o mouse e clique no final da parede";
    return;
  }
  const wall = createCustomWall(studio.wallDrawPoints[0], point);
  if(!wall){
    if($("studioWallDrawMessage")) $("studioWallDrawMessage").textContent = "A parede precisa ter pelo menos 20 cm";
    return;
  }
  studio.wallDrawPoints = [];
  disposeWallDrawPreview();
  if($("studioWallDrawMessage")) $("studioWallDrawMessage").textContent = `${wall.name} criada · clique para iniciar outra`;
}

function setWallDrawActive(active){
  studio.wallDrawActive = Boolean(active);
  studio.wallDrawPoints = [];
  disposeWallDrawPreview();
  $("studioWallDraw")?.setAttribute("aria-pressed", String(studio.wallDrawActive));
  if($("studioWallDraw")) $("studioWallDraw").textContent = studio.wallDrawActive ? "Desenhando paredes…" : "+ Desenhar parede";
  $("studioWallDrawStatus")?.classList.toggle("hidden", !studio.wallDrawActive);
  $("studioCanvasHost")?.classList.toggle("is-wall-draw-mode", studio.wallDrawActive);
  if($("studioWallDrawMessage")) $("studioWallDrawMessage").textContent = "Clique no início da parede";
  if(studio.orbit) studio.orbit.enabled = shouldEnableOrbit();
}

function toggleWallDraw(){
  const willActivate = !studio.wallDrawActive;
  if(willActivate){
    if(studio.rulerActive) toggleRuler();
    if(studio.cropActive) toggleCrop();
    studio.wallDrawActive = true;
    showTopView();
  }
  setWallDrawActive(willActivate);
}

function removeSelectedCustomWall(){
  const wall = selectedCustomWall();
  if(!wall) return;
  studio.scene?.remove(wall.mesh, wall.floorLine);
  wall.mesh.geometry?.dispose?.();
  wall.mesh.material?.dispose?.();
  wall.floorLine.geometry?.dispose?.();
  wall.floorLine.material?.dispose?.();
  wall.texture?.dispose?.();
  if(wall.objectUrl) URL.revokeObjectURL(wall.objectUrl);
  studio.customWalls = studio.customWalls.filter((candidate) => candidate !== wall);
  studio.selectedCustomWallId = null;
  refreshCustomWallSelection();
  refreshWallControls();
  window.catalogNotify?.({ title: "Parede removida", message: "A parede desenhada foi retirada do ambiente.", status: "success" });
}

function selectObject(object){
  studio.selected = object || null;
  if(object){
    studio.transform.detach();
    $("studioSelectedLabel").textContent = object.userData.item?.name || "Móvel selecionado";
    const dimensions = object.userData.item?.dimensions || {};
    const formatMeasure = (value) => Number(value) > 0 ? `${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m` : "—";
    $("studioSelectedDimensions").textContent = `L ${formatMeasure(dimensions.width)} × A ${formatMeasure(dimensions.height)} × P ${formatMeasure(dimensions.depth)}`;
    $("studioEasyControls")?.classList.remove("hidden");
    const members = groupMembers(object);
    if(members.length > 1) $("studioSelectedLabel").textContent = `Bloco com ${members.length} móveis`;
    $("studioUngroupButton")?.classList.toggle("hidden", members.length < 2);
  }else{
    studio.transform.detach();
    if($("studioSelectedDimensions")) $("studioSelectedDimensions").textContent = "";
    $("studioUngroupButton")?.classList.add("hidden");
    $("studioEasyControls")?.classList.add("hidden");
  }
}

function disposeRulerVisual(){
  if(studio.rulerVisual){
    studio.scene?.remove(studio.rulerVisual);
    studio.rulerVisual.traverse?.((node) => { node.geometry?.dispose?.(); node.material?.dispose?.(); });
    studio.rulerVisual = null;
  }
}

function clearRuler(){
  studio.rulerPoints = [];
  studio.rulerDistance = null;
  $("studioRulerCalibration")?.classList.add("hidden");
  disposeRulerVisual();
}

function renderRulerVisual(start, end, finished = false){
  if(!studio.scene || !studio.three) return;
  const { THREE } = studio.three;
  disposeRulerVisual();
  const group = new THREE.Group();
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(start.x, .06, start.z), new THREE.Vector3(end.x, .06, end.z),
  ]), new THREE.LineBasicMaterial({ color: 0xd52f25, depthTest: false }));
  line.renderOrder = 100;
  group.add(line);
  const markers = finished ? [start, end] : [start];
  for(const value of markers){
    const marker = new THREE.Mesh(new THREE.SphereGeometry(.07, 18, 18), new THREE.MeshBasicMaterial({ color: 0xd52f25, depthTest: false }));
    marker.position.set(value.x, .07, value.z);
    marker.renderOrder = 101;
    group.add(marker);
  }
  studio.rulerVisual = group;
  studio.scene.add(group);
}

function updateRulerPreview(event){
  if(!studio.rulerActive || studio.rulerPoints.length !== 1) return;
  const point = floorPointFromPointer(event);
  if(!point) return;
  const distance = studio.rulerPoints[0].distanceTo(point);
  renderRulerVisual(studio.rulerPoints[0], point);
  if($("studioRulerMessage")) $("studioRulerMessage").textContent = `${distance.toFixed(2).replace(".", ",")} m • clique para concluir`;
}

function measureFromPointer(event){
  const point = floorPointFromPointer(event);
  if(!point) return;
  if(studio.rulerPoints.length >= 2) clearRuler();
  studio.rulerPoints.push(point.clone());
  const message = $("studioRulerMessage");
  if(studio.rulerPoints.length === 1){
    renderRulerVisual(point, point);
    message.textContent = "Mova o mouse e clique no segundo ponto";
    return;
  }
  const [start, end] = studio.rulerPoints;
  const distance = start.distanceTo(end);
  studio.rulerDistance = distance;
  renderRulerVisual(start, end, true);
  message.textContent = `Régua: ${distance.toFixed(2).replace(".", ",")} m`;
  $("studioRulerCalibration")?.classList.remove("hidden");
  $("studioRulerActual")?.focus();
}

function toggleRuler(){
  studio.rulerActive = !studio.rulerActive;
  clearRuler();
  const button = $("studioRuler");
  button?.setAttribute("aria-pressed", String(studio.rulerActive));
  button?.classList.toggle("active", studio.rulerActive);
  const status = $("studioRulerStatus");
  status?.classList.toggle("hidden", !studio.rulerActive);
  $("studioCanvasHost")?.classList.toggle("is-ruler-mode", studio.rulerActive);
  if($("studioRulerMessage")) $("studioRulerMessage").textContent = "Clique no primeiro ponto";
  if(studio.orbit) studio.orbit.enabled = shouldEnableOrbit();
  if(studio.rulerActive) studio.transform?.detach();
  else studio.transform?.detach();
}

function calibrateFromRuler(){
  const actual = Number($("studioRulerActual")?.value);
  if(!(actual > 0) || !(studio.rulerDistance > 0)) return;
  const factor = actual / studio.rulerDistance;
  if(!Number.isFinite(factor) || factor < .05 || factor > 20) return;
  studio.roomWidth = Number((studio.roomWidth * factor).toFixed(3));
  studio.roomDepth = Number((studio.roomDepth * factor).toFixed(3));
  studio.objects.forEach((object) => {
    object.position.x *= factor;
    object.position.z *= factor;
    rememberValidTransform(object);
  });
  studio.customWalls.forEach((wall) => {
    wall.start.x *= factor; wall.start.z *= factor;
    wall.end.x *= factor; wall.end.z *= factor;
    updateCustomWallGeometry(wall);
  });
  $("studioRoomWidth").value = String(studio.roomWidth);
  $("studioRoomDepth").value = String(studio.roomDepth);
  updateRoomPlan();
  showTopView();
  clearRuler();
  $("studioRulerMessage").textContent = `Escala calibrada pela medida de ${actual.toFixed(2).replace(".", ",")} m`;
  window.catalogNotify?.({ title: "Escala corrigida", message: "Toda a planta foi recalculada pela medida marcada na régua.", status: "success" });
}

function selectFromPointer(event){
  if(beginWallDrag(event)) return;
  if(studio.wallDrawActive){ drawWallFromPointer(event); return; }
  if(studio.cropActive){ cropFromPointer(event); return; }
  if(studio.rulerActive){ measureFromPointer(event); return; }
  if(studio.transform.dragging || studio.transform.axis) return;
  const { THREE } = studio.three;
  const rect = studio.renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(pointer, studio.camera);
  const wallHit = ray.intersectObjects(studio.customWalls.map((wall) => wall.mesh), false)[0];
  if(wallHit?.object?.userData?.catalogCustomWallId){
    selectCustomWall(wallHit.object.userData.catalogCustomWallId);
    return;
  }
  const hits = ray.intersectObjects(studio.objects, true);
  if(!hits.length){ selectObject(null); return; }
  let root = hits[0].object;
  while(root.parent && !studio.objects.includes(root)) root = root.parent;
  if(!studio.objects.includes(root)) return;
  if(studio.grouping){
    if(studio.groupSelection.has(root)) studio.groupSelection.delete(root);
    else groupMembers(root).forEach((member) => studio.groupSelection.add(member));
    refreshGroupHelpers();
    return;
  }
  selectObject(root);
  const point = new studio.three.THREE.Vector3();
  const plane = new studio.three.THREE.Plane(new studio.three.THREE.Vector3(0, 1, 0), 0);
  if(ray.ray.intersectPlane(plane, point)){
    const members = groupMembers(root);
    studio.directDrag = {
      object: root, members, plane, startPoint: point.clone(),
      starts: members.map((member) => member.position.clone()),
    };
    studio.orbit.enabled = false;
    studio.renderer.domElement.setPointerCapture?.(event.pointerId);
    studio.renderer.domElement.classList.add("is-dragging-object");
  }
}

function moveSelectedFromPointer(event){
  if(moveWallDrag(event)) return;
  if(studio.wallDrawActive){ updateWallDrawPreview(event); return; }
  if(!studio.directDrag && !studio.rulerActive && !studio.cropActive){
    const focus = floorPointFromPointer(event);
    if(focus) studio.zoomFocus = focus.clone();
  }
  if(studio.cropActive && studio.cropDrag){ updateCropSelection(event); return; }
  if(studio.rulerActive){ updateRulerPreview(event); return; }
  if(!studio.directDrag || !studio.renderer || !studio.camera) return;
  const { THREE } = studio.three;
  const rect = studio.renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(pointer, studio.camera);
  const point = new THREE.Vector3();
  if(!ray.ray.intersectPlane(studio.directDrag.plane, point)) return;
  const dx = point.x - studio.directDrag.startPoint.x, dz = point.z - studio.directDrag.startPoint.z;
  studio.directDrag.members.forEach((member, index) => {
    member.position.x = studio.directDrag.starts[index].x + dx;
    member.position.z = studio.directDrag.starts[index].z + dz;
    rememberValidTransform(member);
  });
  validateRoomFit();
}

function finishDirectDrag(event){
  if(studio.wallDrag){ studio.wallDrag = null; disposeWallDrawPreview(); studio.orbit.enabled = shouldEnableOrbit(); saveProject(); return; }
  if(studio.cropActive && studio.cropDrag){ finishCropSelection(event); return; }
  if(!studio.directDrag) return;
  studio.directDrag = null;
  studio.renderer?.domElement.classList.remove("is-dragging-object");
  if(studio.orbit) studio.orbit.enabled = shouldEnableOrbit();
}

function startContinuousRotation(){
  if(!studio.selected || studio.rotateRaf) return;
  const rotate = () => {
    if(!studio.selected){ studio.rotateRaf = null; return; }
    const members = groupMembers(studio.selected);
    if(members.length === 1){
      studio.selected.rotation.y += .025;
      rememberValidTransform(studio.selected);
    }else{
      const centerX = members.reduce((sum, member) => sum + member.position.x, 0) / members.length;
      const centerZ = members.reduce((sum, member) => sum + member.position.z, 0) / members.length;
      const cosine = Math.cos(.025), sine = Math.sin(.025);
      members.forEach((member) => {
        const x = member.position.x - centerX, z = member.position.z - centerZ;
        member.position.x = centerX + x * cosine - z * sine;
        member.position.z = centerZ + x * sine + z * cosine;
        member.rotation.y += .025;
      });
      members.forEach(rememberValidTransform);
    }
    studio.rotateRaf = requestAnimationFrame(rotate);
  };
  studio.rotateRaf = requestAnimationFrame(rotate);
}

function stopContinuousRotation(){
  if(studio.rotateRaf) cancelAnimationFrame(studio.rotateRaf);
  studio.rotateRaf = null;
}

function floorPointFromPointer(event){
  if(!studio.renderer || !studio.camera || !studio.three) return null;
  const { THREE } = studio.three;
  const rect = studio.renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(pointer, studio.camera);
  const point = new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point) ? point : null;
}

function cropImageSource(src, left, top, right, bottom){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const sx = Math.round(left * image.naturalWidth), sy = Math.round(top * image.naturalHeight);
      const sw = Math.max(1, Math.round((right - left) * image.naturalWidth));
      const sh = Math.max(1, Math.round((bottom - top) * image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = sw; canvas.height = sh;
      canvas.getContext("2d").drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL("image/jpeg", .94));
    };
    image.onerror = reject; image.src = src;
  });
}

function cropFromPointer(event){
  const point = floorPointFromPointer(event);
  if(!point) return;
  const canvas = studio.renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  studio.cropDrag = {
    point: point.clone(),
    pointerId: event.pointerId,
    startX: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
    startY: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
  };
  canvas.setPointerCapture?.(event.pointerId);
  updateCropSelection(event);
  const status = $("studioCropStatus");
  if(status) status.textContent = "Arraste a caixa até o canto oposto e solte";
}

function updateCropSelection(event){
  const drag = studio.cropDrag;
  const selection = $("studioCropSelection");
  if(!drag || !selection || !studio.renderer) return;
  const canvasRect = studio.renderer.domElement.getBoundingClientRect();
  const hostRect = $("studioCanvasHost").getBoundingClientRect();
  const currentX = Math.max(0, Math.min(canvasRect.width, event.clientX - canvasRect.left));
  const currentY = Math.max(0, Math.min(canvasRect.height, event.clientY - canvasRect.top));
  selection.style.left = `${canvasRect.left - hostRect.left + Math.min(drag.startX, currentX)}px`;
  selection.style.top = `${canvasRect.top - hostRect.top + Math.min(drag.startY, currentY)}px`;
  selection.style.width = `${Math.abs(currentX - drag.startX)}px`;
  selection.style.height = `${Math.abs(currentY - drag.startY)}px`;
  selection.classList.remove("hidden");
}

async function finishCropSelection(event){
  const drag = studio.cropDrag;
  if(!drag) return;
  const canvas = studio.renderer?.domElement;
  const b = event.type === "pointercancel" ? null : floorPointFromPointer(event);
  studio.cropDrag = null;
  $("studioCropSelection")?.classList.add("hidden");
  try{ canvas?.releasePointerCapture?.(drag.pointerId); }catch{ /* A captura pode já ter sido liberada. */ }
  const status = $("studioCropStatus");
  if(!b){
    if(status) status.textContent = "Não foi possível marcar essa área. Tente novamente.";
    return;
  }
  const a = drag.point;
  const halfW = studio.roomWidth / 2, halfD = studio.roomDepth / 2;
  const minX = Math.max(-halfW, Math.min(a.x, b.x)), maxX = Math.min(halfW, Math.max(a.x, b.x));
  const minZ = Math.max(-halfD, Math.min(a.z, b.z)), maxZ = Math.min(halfD, Math.max(a.z, b.z));
  if(maxX - minX < .1 || maxZ - minZ < .1){
    if(status) status.textContent = "A área marcada é muito pequena. Clique e arraste novamente.";
    return;
  }
  const left = (minX + halfW) / studio.roomWidth, right = (maxX + halfW) / studio.roomWidth;
  const top = (halfD - maxZ) / studio.roomDepth, bottom = (halfD - minZ) / studio.roomDepth;
  try{
    const cropped = await cropImageSource(studio.floorPlanSource, left, top, right, bottom);
    const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
    studio.objects.forEach((object) => { object.position.x -= centerX; object.position.z -= centerZ; rememberValidTransform(object); });
    studio.customWalls.forEach((wall) => {
      wall.start.x -= centerX; wall.start.z -= centerZ;
      wall.end.x -= centerX; wall.end.z -= centerZ;
      updateCustomWallGeometry(wall);
    });
    studio.roomWidth = Number((maxX - minX).toFixed(3)); studio.roomDepth = Number((maxZ - minZ).toFixed(3));
    $("studioRoomWidth").value = String(studio.roomWidth); $("studioRoomDepth").value = String(studio.roomDepth);
    updateRoomPlan(); applyFloorPlanTexture(cropped); showTopView();
    window.catalogNotify?.({ title: "Planta recortada", message: "As bordas foram removidas sem alterar a escala em metros.", status: "success" });
  }catch{ window.catalogNotify?.({ title: "Falha ao recortar", message: "Não foi possível processar essa área.", status: "error" }); }
  toggleCrop();
}

function toggleCrop(){
  if(!studio.floorPlanSource){ window.catalogNotify?.({ title: "Importe uma planta", message: "Adicione uma planta antes de usar o recorte.", status: "error" }); return; }
  studio.cropActive = !studio.cropActive;
  studio.cropDrag = null;
  $("studioCropSelection")?.classList.add("hidden");
  if(studio.cropActive && studio.rulerActive) toggleRuler();
  $("studioCrop")?.classList.toggle("active", studio.cropActive);
  $("studioCrop")?.setAttribute("aria-pressed", String(studio.cropActive));
  $("studioCropStatus")?.classList.toggle("hidden", !studio.cropActive);
  $("studioCanvasHost")?.classList.toggle("is-crop-mode", studio.cropActive);
  if($("studioCropStatus")) $("studioCropStatus").textContent = "Clique, arraste e solte para marcar a área que deseja manter";
  if(studio.orbit) studio.orbit.enabled = shouldEnableOrbit();
  studio.transform?.detach();
  if(studio.cropActive) showTopView();
}

function loadModelTemplate(item, onProgress){
  const key = String(item.glb || "");
  if(studio.modelCache.has(key)) return Promise.resolve(studio.modelCache.get(key));
  if(studio.modelLoads.has(key)) return studio.modelLoads.get(key);
  const load = (async () => {
    const source = typeof window.catalogLoadModelAsset === "function"
      ? await window.catalogLoadModelAsset(key, onProgress)
      : key;
    return new Promise((resolve, reject) => {
      studio.loader.load(source, (gltf) => {
        gltf.scene.userData.catalogSourceUrl = source;
        studio.modelCache.set(key, gltf.scene);
        resolve(gltf.scene);
      }, (event) => {
        if(source === key && event?.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
      }, reject);
    });
  })().finally(() => studio.modelLoads.delete(key));
  studio.modelLoads.set(key, load);
  return load;
}

function disposeTemplate(template){
  template?.traverse?.((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((value) => { if(value?.isTexture) value.dispose?.(); });
      material.dispose?.();
    });
  });
  const source = template?.userData?.catalogSourceUrl;
  if(source) studio.three?.THREE.Cache.remove(source);
}

function trimModelTemplateCache(){
  const limit = studio.performance.tier === "economy" ? 3 : 6;
  if(studio.modelCache.size <= limit) return;
  const activeUrls = new Set(studio.objects.map((object) => String(object.userData.item?.glb || "")));
  for(const [url, template] of studio.modelCache){
    if(activeUrls.has(url)) continue;
    studio.modelCache.delete(url);
    disposeTemplate(template);
    if(studio.modelCache.size <= limit) break;
  }
}

function warmModel(item){
  if(!item?.glb || !studio.loader || studio.modelCache.has(String(item.glb))) return;
  loadModelTemplate(item).catch(() => { /* O clique normal exibe o erro e permite nova tentativa. */ });
}

async function addItem(item, attempt = 0, placement = null){
  setModelLoading(item, true);
  try{
    await ensureScene();
    const template = await loadModelTemplate(item, (progress) => setModelLoading(item, true, progress));
    const root = template.clone(true);
    root.userData.item = item;
    root.traverse((node) => {
      if(node.isMesh){
        node.castShadow = studio.performance.shadows;
        node.receiveShadow = studio.performance.shadows;
      }
    });
    // O cadastro usa metros. Ajustamos cada eixo do GLB uma única vez para que
    // largura, altura e profundidade coincidam com as dimensões comerciais.
    const sourceBox = new studio.three.THREE.Box3().setFromObject(root);
    const sourceSize = sourceBox.getSize(new studio.three.THREE.Vector3());
    const dimensions = item.dimensions || {};
    const axisScale = (target, current) => Number(target) > 0 && current > 0 ? Number(target) / current : 1;
    root.scale.multiply(new studio.three.THREE.Vector3(
      axisScale(dimensions.width, sourceSize.x),
      axisScale(dimensions.height, sourceSize.y),
      axisScale(dimensions.depth, sourceSize.z),
    ));
    root.userData.catalogOriginalScale = root.scale.clone();
    root.userData.catalogDimensions = dimensions;
    const normalized = new studio.three.THREE.Box3().setFromObject(root);
    const position = placement?.position || [(studio.objects.length % 3 - 1) * 2.2, 0, Math.floor(studio.objects.length / 3) * -1.8];
    root.position.set(position[0], position[1] - normalized.min.y, position[2]);
    if(Number.isFinite(placement?.rotation)) root.rotation.y = placement.rotation;
    studio.scene.add(root); studio.objects.push(root); selectObject(root); updateCount();
    rememberValidTransform(root);
    trimModelTemplateCache();
    setModelLoading(item, false);
    return root;
  }catch(error){
    console.warn("Falha ao carregar GLB no estúdio:", error);
    if(attempt < 1){
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      return addItem(item, attempt + 1, placement);
    }
    setModelLoading(item, false);
    const empty = $("studioCanvasEmpty");
    if(empty && studio.objects.length === 0){
      empty.classList.remove("hidden");
      empty.innerHTML = `<strong>Modelo indisponível</strong><span>Não foi possível abrir ${escapeHtml(item.name)}. Selecione-o novamente para tentar.</span>`;
    }
    throw error;
  }
}

function removeSelected(){
  if(!studio.selected) return;
  studio.transform.detach();
  const removing = new Set(groupMembers(studio.selected));
  removing.forEach((object) => studio.scene.remove(object));
  studio.objects = studio.objects.filter((object) => !removing.has(object));
  studio.selected = null; updateCount(); trimModelTemplateCache();
}

function keepObjectAboveFloor(object){
  if(!object || !studio.three) return;
  object.updateMatrixWorld(true);
  const box = new studio.three.THREE.Box3().setFromObject(object);
  if(Number.isFinite(box.min.y) && box.min.y < 0){
    object.position.y += -box.min.y;
    object.updateMatrixWorld(true);
  }
}

function applyEasyAction(action){
  const object = studio.selected;
  if(!object) return;
  const step = .28;
  if(action === "left") object.position.x -= step;
  if(action === "right") object.position.x += step;
  if(action === "back") object.position.z -= step;
  if(action === "front") object.position.z += step;
  if(action === "up") object.position.y += step;
  if(action === "down") object.position.y -= step;
  if(action === "rotate-left") object.rotation.y -= Math.PI / 12;
  if(action === "rotate-right") object.rotation.y += Math.PI / 12;
  if(action === "remove") removeSelected();
  if(studio.selected) keepObjectAboveFloor(studio.selected);
  if(studio.selected) rememberValidTransform(studio.selected);
  validateRoomFit();
  studio.transform?.updateMatrixWorld();
}

const PRESETS = {
  lounge: {
    title: "Lounge compacto",
    description: "Escolha as peças; o formato compacto padrão será montado automaticamente e sem sobreposições.",
    fields: [
      ["sofa", "Sofá", /sof[aá]/i, true], ["armchair", "Poltrona", /poltrona/i, true],
      ["center", "Mesa de centro", /mesa.*centro|centro.*mesa/i], ["side", "Mesa lateral/canto", /mesa.*(lateral|canto)|(lateral|canto).*mesa/i],
      ["console", "Aparador", /aparador/i],
    ],
  },
  "guest-table": {
    title: "Mesa de convidados",
    description: "Selecione uma mesa e uma cadeira; todas as cadeiras serão distribuídas de uma só vez.",
    fields: [["table", "Mesa", /mesa/i, true], ["chair", "Cadeira", /cadeira/i, true]],
  },
};

function matchingItems(pattern){
  return studio.items.filter((item) => item.glb && pattern.test(`${item.catLabel || ""} ${item.name || ""}`));
}

function itemPicker([key, label, pattern, required]){
  const options = matchingItems(pattern);
  return `<fieldset class="studio-picker" data-picker="${escapeHtml(key)}">
    <div class="studio-picker-heading">
      <div><legend>${escapeHtml(label)}${required ? " *" : ""}</legend><small>${options.length} ${options.length === 1 ? "item" : "itens"}</small></div>
      <label class="studio-picker-search"><span aria-hidden="true">⌕</span><input type="search" data-picker-search placeholder="Pesquisar ${escapeHtml(label.toLocaleLowerCase("pt-BR"))}" autocomplete="off"></label>
    </div>
    <div class="studio-picker-items">
      ${required ? "" : `<label class="studio-picker-card studio-picker-none"><input type="radio" name="${key}" value="" checked><span>Não adicionar</span></label>`}
      ${options.map((item) => `<label class="studio-picker-card" data-picker-item data-search="${escapeHtml(normalizeSearch(`${item.name} ${item.catLabel || ""}`))}">
        <input type="radio" name="${key}" value="${escapeHtml(item.id)}" ${required ? "required" : ""}>
        <img src="${escapeHtml(item.photo)}" alt="${escapeHtml(item.name)}" loading="lazy">
        <span>${escapeHtml(item.name)}</span><b>Selecionado</b>
      </label>`).join("")}
      <p class="studio-picker-empty hidden">Nenhum item encontrado nesta busca.</p>
    </div>
  </fieldset>`;
}

function loungeDiagram(){
  return `<section class="studio-lounge-diagram" aria-label="Esquema de posicionamento do lounge">
    <div class="studio-diagram-copy"><span>Formato padrão</span><strong>Lounge compacto</strong><small>Poltronas junto às pontas do sofá, voltadas para o centro e sem sobreposições.</small></div>
    <div class="studio-diagram-floor">
      <div class="diagram-piece diagram-console" data-diagram-role="console" data-diagram-optional="console">Aparador</div>
      <div class="diagram-piece diagram-sofa" data-diagram-role="sofa">Sofá</div>
      <div class="diagram-piece diagram-side diagram-side-left" data-diagram-role="side" data-diagram-optional="side">Mesa lateral</div>
      <div class="diagram-piece diagram-side diagram-side-right" data-diagram-role="side" data-diagram-optional="side">Mesa lateral</div>
      <div class="diagram-piece diagram-chair diagram-chair-left-one" data-diagram-role="armchair" data-rotation="90">Poltrona<i>FRENTE ↑</i><button type="button" data-diagram-rotate title="Segure e arraste para girar" aria-label="Girar poltrona livremente">↻</button></div>
      <div class="diagram-piece diagram-chair diagram-chair-left-two" data-diagram-role="armchair" data-rotation="90" data-diagram-second>Poltrona<i>FRENTE ↑</i><button type="button" data-diagram-rotate title="Segure e arraste para girar" aria-label="Girar poltrona livremente">↻</button></div>
      <div class="diagram-piece diagram-chair diagram-chair-right-one" data-diagram-role="armchair" data-rotation="-90">Poltrona<i>FRENTE ↑</i><button type="button" data-diagram-rotate title="Segure e arraste para girar" aria-label="Girar poltrona livremente">↻</button></div>
      <div class="diagram-piece diagram-chair diagram-chair-right-two" data-diagram-role="armchair" data-rotation="-90" data-diagram-second>Poltrona<i>FRENTE ↑</i><button type="button" data-diagram-rotate title="Segure e arraste para girar" aria-label="Girar poltrona livremente">↻</button></div>
      <div class="diagram-piece diagram-center" data-diagram-role="center" data-diagram-optional="center">Mesa de centro</div>
    </div>
  </section>`;
}

function bindDiagramDragging(){
  const floor = document.querySelector(".studio-diagram-floor");
  if(!floor) return;
  floor.querySelectorAll(".diagram-piece").forEach((piece) => {
    const floorRect = floor.getBoundingClientRect(), pieceRect = piece.getBoundingClientRect();
    piece.dataset.x = String((pieceRect.left + pieceRect.width / 2 - floorRect.left) / floorRect.width);
    piece.dataset.z = String((pieceRect.top + pieceRect.height / 2 - floorRect.top) / floorRect.height);
    const rotateHandle = piece.querySelector("[data-diagram-rotate]");
    rotateHandle?.addEventListener("pointerdown", (event) => {
      event.preventDefault(); event.stopPropagation();
      rotateHandle.setPointerCapture(event.pointerId);
      piece.classList.add("is-rotating");
      const rotate = (moveEvent) => {
        const bounds = piece.getBoundingClientRect();
        const centerX = bounds.left + bounds.width / 2, centerY = bounds.top + bounds.height / 2;
        const degrees = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI + 90;
        const previousRotation = piece.dataset.rotation, previousTransform = piece.style.transform;
        piece.dataset.rotation = String(Number(degrees.toFixed(1)));
        piece.style.transform = piece.dataset.dragged === "true"
          ? `translate(-50%,-50%) rotate(${piece.dataset.rotation}deg)`
          : `rotate(${piece.dataset.rotation}deg)`;
        const current = piece.getBoundingClientRect();
        const collision = [...floor.querySelectorAll(".diagram-piece:not(.hidden):not(.is-disabled)")].some((other) => {
          if(other === piece) return false;
          const target = other.getBoundingClientRect(), gap = 6;
          return current.left < target.right + gap && current.right + gap > target.left && current.top < target.bottom + gap && current.bottom + gap > target.top;
        });
        if(collision){ piece.dataset.rotation = previousRotation; piece.style.transform = previousTransform; }
      };
      const finish = () => {
        piece.classList.remove("is-rotating");
        rotateHandle.removeEventListener("pointermove", rotate);
        rotateHandle.removeEventListener("pointerup", finish);
        rotateHandle.removeEventListener("pointercancel", finish);
      };
      rotateHandle.addEventListener("pointermove", rotate);
      rotateHandle.addEventListener("pointerup", finish);
      rotateHandle.addEventListener("pointercancel", finish);
    });
    piece.addEventListener("pointerdown", (event) => {
      event.preventDefault(); piece.setPointerCapture(event.pointerId); piece.classList.add("is-dragging");
      const move = (moveEvent) => {
        const bounds = floor.getBoundingClientRect(), own = piece.getBoundingClientRect();
        const previous = { left: piece.style.left, top: piece.style.top, right: piece.style.right, transform: piece.style.transform, x: piece.dataset.x, z: piece.dataset.z, dragged: piece.dataset.dragged };
        const x = Math.max(own.width / 2, Math.min(bounds.width - own.width / 2, moveEvent.clientX - bounds.left));
        const y = Math.max(own.height / 2, Math.min(bounds.height - own.height / 2, moveEvent.clientY - bounds.top));
        piece.style.left = `${x}px`; piece.style.top = `${y}px`; piece.style.right = "auto";
        piece.dataset.dragged = "true";
        piece.style.transform = piece.dataset.rotation ? `translate(-50%,-50%) rotate(${piece.dataset.rotation}deg)` : "translate(-50%,-50%)";
        piece.dataset.x = String(x / bounds.width); piece.dataset.z = String(y / bounds.height);
        const current = piece.getBoundingClientRect();
        const collision = [...floor.querySelectorAll(".diagram-piece:not(.hidden):not(.is-disabled)")].some((other) => {
          if(other === piece) return false;
          const target = other.getBoundingClientRect(), gap = 6;
          return current.left < target.right + gap && current.right + gap > target.left && current.top < target.bottom + gap && current.bottom + gap > target.top;
        });
        if(collision){
          piece.style.left = previous.left; piece.style.top = previous.top; piece.style.right = previous.right; piece.style.transform = previous.transform;
          piece.dataset.x = previous.x; piece.dataset.z = previous.z; piece.dataset.dragged = previous.dragged;
        }
      };
      const end = () => { piece.classList.remove("is-dragging"); piece.removeEventListener("pointermove", move); piece.removeEventListener("pointerup", end); };
      piece.addEventListener("pointermove", move); piece.addEventListener("pointerup", end);
    });
  });
}

function diagramPlacement(role, index, sofaSize){
  const pieces = [...document.querySelectorAll(`[data-diagram-role="${role}"]:not(.hidden)`)];
  const piece = pieces[index];
  if(!piece) return null;
  const spanX = Math.max(5, sofaSize.width * 2.5), spanZ = Math.max(4, sofaSize.depth * 5);
  return {
    position: [(Number(piece.dataset.x) - .5) * spanX, 0, (Number(piece.dataset.z) - .23) * spanZ],
    rotation: Number(piece.dataset.rotation || 0) * Math.PI / 180,
  };
}

function diagramPiece(role, index){
  return [...document.querySelectorAll(`[data-diagram-role="${role}"]:not(.hidden)`)][index] || null;
}

function updateLoungeDiagram(){
  const form = $("studioPresetForm");
  const diagram = form?.querySelector(".studio-lounge-diagram");
  if(!diagram) return;
  const data = new FormData(form);
  diagram.querySelectorAll("[data-diagram-second]").forEach((piece) => piece.classList.toggle("hidden", Number(data.get("armchairCount") || 1) < 2));
  diagram.querySelectorAll("[data-diagram-optional]").forEach((piece) => piece.classList.toggle("is-disabled", !data.get(piece.dataset.diagramOptional)));
}

function openPreset(type){
  const preset = PRESETS[type];
  if(!preset) return;
  const dialog = $("studioPresetDialog");
  dialog.dataset.preset = type;
  $("studioPresetTitle").textContent = preset.title;
  $("studioPresetDescription").textContent = preset.description;
  $("studioPresetFields").innerHTML = (type === "lounge" ? loungeDiagram() : "") + preset.fields.map(itemPicker).join("") + (type === "lounge"
    ? `<label class="studio-preset-quantity">Poltronas por lado<select name="armchairCount"><option value="1">1 de cada lado</option><option value="2">2 de cada lado</option></select></label>`
    : `<label class="studio-preset-quantity">Lugares<select name="chairCount"><option>4</option><option selected>6</option><option>8</option><option>10</option><option>12</option></select></label>`);
  $("studioPresetStatus").textContent = "";
  updateLoungeDiagram();
  dialog.showModal();
  requestAnimationFrame(bindDiagramDragging);
}

function selectedItem(form, name){
  const id = new FormData(form).get(name);
  return studio.items.find((item) => String(item.id) === String(id));
}

function footprint(object){
  const box = new studio.three.THREE.Box3().setFromObject(object);
  const size = box.getSize(new studio.three.THREE.Vector3());
  return { width: size.x, depth: size.z };
}

function ensureFurnitureSpacing(object, clearance = .3, candidates = studio.objects){
  if(!object || !studio.three) return;
  const { THREE } = studio.three;
  for(let attempt = 0; attempt < 10; attempt++){
    object.updateMatrixWorld(true);
    const current = new THREE.Box3().setFromObject(object);
    let collision = null;
    for(const other of candidates){
      if(other === object) continue;
      other.updateMatrixWorld(true);
      const otherBox = new THREE.Box3().setFromObject(other);
      const overlapX = Math.min(current.max.x, otherBox.max.x) - Math.max(current.min.x, otherBox.min.x) + clearance;
      const overlapZ = Math.min(current.max.z, otherBox.max.z) - Math.max(current.min.z, otherBox.min.z) + clearance;
      if(overlapX > 0 && overlapZ > 0){ collision = { otherBox, overlapX, overlapZ }; break; }
    }
    if(!collision) break;
    const center = current.getCenter(new THREE.Vector3());
    const otherCenter = collision.otherBox.getCenter(new THREE.Vector3());
    if(collision.overlapX < collision.overlapZ) object.position.x += (center.x >= otherCenter.x ? 1 : -1) * collision.overlapX;
    else object.position.z += (center.z >= otherCenter.z ? 1 : -1) * collision.overlapZ;
  }
  keepObjectAboveFloor(object);
  rememberValidTransform(object);
}

function placePresetWithoutOverlap(objects, existing, clearance = .35){
  if(!objects.length || !studio.three) return false;
  const { THREE } = studio.three;
  const groupBox = new THREE.Box3();
  objects.forEach((object) => { object.updateMatrixWorld(true); groupBox.union(new THREE.Box3().setFromObject(object)); });
  const size = groupBox.getSize(new THREE.Vector3());
  const center = groupBox.getCenter(new THREE.Vector3());
  const margin = .2;
  const minX = -studio.roomWidth / 2 + size.x / 2 + margin;
  const maxX = studio.roomWidth / 2 - size.x / 2 - margin;
  const minZ = -studio.roomDepth / 2 + size.z / 2 + margin;
  const maxZ = studio.roomDepth / 2 - size.z / 2 - margin;
  if(minX > maxX || minZ > maxZ) return false;
  const existingBoxes = existing.map((object) => {
    object.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(object).expandByVector(new THREE.Vector3(clearance, 0, clearance));
  });
  const columns = Math.min(32, Math.max(2, Math.ceil((maxX - minX) / Math.max(.5, size.x / 4))));
  const rows = Math.min(32, Math.max(2, Math.ceil((maxZ - minZ) / Math.max(.5, size.z / 4))));
  const candidates = [];
  for(let row = 0; row <= rows; row++) for(let column = 0; column <= columns; column++){
    const x = minX + (maxX - minX) * column / columns;
    const z = minZ + (maxZ - minZ) * row / rows;
    candidates.push({ x, z, distance: x * x + z * z });
  }
  candidates.push({ x: Math.max(minX, Math.min(maxX, 0)), z: Math.max(minZ, Math.min(maxZ, 0)), distance: 0 });
  candidates.sort((a, b) => a.distance - b.distance);
  const target = candidates.find((candidate) => {
    const shifted = groupBox.clone().translate(new THREE.Vector3(candidate.x - center.x, 0, candidate.z - center.z));
    return existingBoxes.every((box) => !shifted.intersectsBox(box));
  });
  if(!target) return false;
  const dx = target.x - center.x, dz = target.z - center.z;
  objects.forEach((object) => {
    object.position.x += dx;
    object.position.z += dz;
    keepObjectAboveFloor(object);
    rememberValidTransform(object);
  });
  return true;
}

function rememberValidTransform(object){
  object.userData.catalogValidPosition = object.position.clone();
  object.userData.catalogValidRotation = object.rotation.clone();
}

async function buildPreset(form){
  const type = $("studioPresetDialog").dataset.preset;
  const data = new FormData(form);
  const status = $("studioPresetStatus");
  status.textContent = "Montando composição...";
  const existing = [...studio.objects];
  const added = [];
  try{
    if(type === "guest-table"){
      const tableObject = await addItem(selectedItem(form, "table"), 0, { position: [0, 0, 0] });
      added.push(tableObject);
      const chair = selectedItem(form, "chair");
      const count = Number(data.get("chairCount"));
      const tableSize = footprint(tableObject);
      for(let i = 0; i < count; i++){
        const angle = i * Math.PI * 2 / count;
        const radiusX = tableSize.width / 2 + .72;
        const radiusZ = tableSize.depth / 2 + .72;
        const chairObject = await addItem(chair, 0, { position: [Math.sin(angle) * radiusX, 0, Math.cos(angle) * radiusZ], rotation: angle + Math.PI });
        added.push(chairObject);
        ensureFurnitureSpacing(chairObject, .25, added);
      }
    }else{
      const sofa = selectedItem(form, "sofa");
      const armchair = selectedItem(form, "armchair");
      const sofaObject = await addItem(sofa, 0, { position: [0, 0, 0], rotation: 0 });
      added.push(sofaObject);
      const sofaSize = footprint(sofaObject);
      const sofaPlacement = diagramPlacement("sofa", 0, sofaSize);
      if(sofaPlacement){
        sofaObject.position.x = sofaPlacement.position[0];
        sofaObject.position.z = sofaPlacement.position[2];
        sofaObject.rotation.y = 0;
        keepObjectAboveFloor(sofaObject);
        rememberValidTransform(sofaObject);
      }
      const perSide = Number(data.get("armchairCount"));
      let chairIndex = 0;
      for(const side of [-1, 1]) for(let i = 0; i < perSide; i++){
        const pieceIndex = chairIndex++;
        const diagram = diagramPiece("armchair", pieceIndex);
        const fallback = { position: [side * (sofaSize.width / 2 + .9 + i), 0, .25], rotation: side * -Math.PI / 6 };
        const chairObject = await addItem(armchair, 0, diagramPlacement("armchair", pieceIndex, sofaSize) || fallback);
        added.push(chairObject);
        if(diagram?.dataset.dragged !== "true"){
          const chairSize = footprint(chairObject);
          chairObject.position.x = side * (sofaSize.width / 2 + chairSize.width / 2 + .15);
          chairObject.position.z = sofaSize.depth / 2 + chairSize.depth / 2 - .1 + i * (chairSize.depth + .15);
          chairObject.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
          keepObjectAboveFloor(chairObject);
        }
        ensureFurnitureSpacing(chairObject, .15, added);
      }
      const optional = [["center",0,[0,0,sofaSize.depth / 2 + .9],0], ["side",0,[-sofaSize.width/2-.55,0,0],0], ["side",1,[sofaSize.width/2+.55,0,0],0], ["console",0,[0,0,-sofaSize.depth/2-.5],Math.PI]];
      for(const [key, index, position, rotation] of optional){
        const item = selectedItem(form, key);
        if(item){
          const optionalObject = await addItem(item, 0, diagramPlacement(key, index, sofaSize) || { position, rotation });
          added.push(optionalObject);
          if(diagramPiece(key, index)?.dataset.dragged !== "true"){
            const size = footprint(optionalObject);
            if(key === "center") optionalObject.position.set(0, optionalObject.position.y, sofaSize.depth / 2 + size.depth / 2 + .25);
            if(key === "console") optionalObject.position.set(0, optionalObject.position.y, -(sofaSize.depth / 2 + size.depth / 2 + .12));
            if(key === "side") optionalObject.position.set(index === 0 ? -(sofaSize.width / 2 + size.width / 2 + .12) : sofaSize.width / 2 + size.width / 2 + .12, optionalObject.position.y, .05);
            keepObjectAboveFloor(optionalObject);
          }
          ensureFurnitureSpacing(optionalObject, key === "center" ? .25 : .12, added);
        }
      }
    }
    if(!placePresetWithoutOverlap(added, existing)) throw new Error("NO_FREE_PRESET_SPACE");
    $("studioPresetDialog").close();
    window.catalogNotify?.({ title: "Ambiente adicionado", message: "A nova composição foi posicionada sem remover os móveis que já estavam na planta.", status: "success" });
  }catch(error){
    console.error(error);
    const rollback = new Set(added);
    added.forEach((object) => studio.scene?.remove(object));
    studio.objects = studio.objects.filter((object) => !rollback.has(object));
    selectObject(null);
    updateCount();
    status.textContent = error?.message === "NO_FREE_PRESET_SPACE"
      ? "Não existe uma área livre suficiente para adicionar esse ambiente."
      : "Não foi possível carregar uma das peças selecionadas.";
  }
}

function configureWallTexture(entry, wallWidth){
  const imageAspect = entry.image.naturalWidth / Math.max(1, entry.image.naturalHeight);
  const wallAspect = wallWidth / (entry.height || studio.wallHeight);
  const canvas = entry.canvas;
  const textureSize = studio.performance.wallTextureSize;
  if(wallAspect >= 1){ canvas.width = textureSize; canvas.height = Math.max(280, Math.round(textureSize / wallAspect)); }
  else{ canvas.height = textureSize; canvas.width = Math.max(280, Math.round(textureSize * wallAspect)); }
  const context = canvas.getContext("2d");
  context.fillStyle = "#e8e4dc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const baseScale = entry.fit === "contain"
    ? Math.min(canvas.width / entry.image.naturalWidth, canvas.height / entry.image.naturalHeight)
    : Math.max(canvas.width / entry.image.naturalWidth, canvas.height / entry.image.naturalHeight);
  const scale = baseScale * entry.zoom;
  const drawWidth = entry.image.naturalWidth * scale;
  const drawHeight = entry.image.naturalHeight * scale;
  const drawX = (canvas.width - drawWidth) * (entry.x / 100);
  const drawY = (canvas.height - drawHeight) * (entry.y / 100);
  context.drawImage(entry.image, drawX, drawY, drawWidth, drawHeight);
  entry.texture.needsUpdate = true;
}

function updatePhotoWalls(){
  if(!studio.scene || !studio.three) return;
  const { THREE } = studio.three;
  const halfWidth = studio.roomWidth / 2;
  const halfDepth = studio.roomDepth / 2;
  Object.entries(studio.walls).forEach(([side, entry]) => {
    const width = side === "left" || side === "right" ? studio.roomDepth : studio.roomWidth;
    entry.mesh.geometry.dispose();
    entry.mesh.geometry = new THREE.PlaneGeometry(width, studio.wallHeight);
    entry.mesh.position.set(0, studio.wallHeight / 2, 0);
    entry.mesh.rotation.set(0, 0, 0);
    if(side === "back") entry.mesh.position.z = -halfDepth;
    if(side === "front") { entry.mesh.position.z = halfDepth; entry.mesh.rotation.y = Math.PI; }
    if(side === "left") { entry.mesh.position.x = -halfWidth; entry.mesh.rotation.y = Math.PI / 2; }
    if(side === "right") { entry.mesh.position.x = halfWidth; entry.mesh.rotation.y = -Math.PI / 2; }
    configureWallTexture(entry, width);
  });
}

function loadEnvironment(file){
  if(!file) return;
  if(file.type && !["image/jpeg", "image/png", "image/webp"].includes(file.type)){
    window.catalogNotify?.({ title: "Imagem não compatível", message: "Escolha uma imagem JPG, PNG ou WebP.", status: "error" });
    return;
  }
  if(file.size > 15 * 1024 * 1024){
    window.catalogNotify?.({ title: "Imagem muito grande", message: "Escolha uma imagem de até 15 MB.", status: "error" });
    return;
  }
  const url = URL.createObjectURL(file);
  const customWallId = studio.selectedCustomWallId;
  const selectedSide = $("studioWallSide")?.value || "back";
  const image = new Image();
  image.onload = () => {
    const customWall = customWallId ? studio.customWalls.find((wall) => wall.id === customWallId) : null;
    if(customWallId && !customWall){ URL.revokeObjectURL(url); return; }
    if(customWall){
      if(customWall.objectUrl) URL.revokeObjectURL(customWall.objectUrl);
      customWall.texture?.dispose?.();
      customWall.mesh.material?.dispose?.();
      const canvas = document.createElement("canvas");
      const texture = new studio.three.THREE.CanvasTexture(canvas);
      texture.colorSpace = studio.three.THREE.SRGBColorSpace;
      const material = new studio.three.THREE.MeshBasicMaterial({ map: texture, side: studio.three.THREE.DoubleSide });
      Object.assign(customWall, { image, objectUrl: url, canvas, texture, material, fit: "cover", x: 50, y: 50, zoom: 1 });
      customWall.mesh.material = material;
      configureWallTexture(customWall, customWall.length);
      $("studioCanvasHost")?.classList.add("has-environment");
      refreshCustomWallSelection();
      refreshWallControls();
      window.catalogNotify?.({ title: "Foto aplicada", message: `A imagem foi aplicada à ${customWall.name.toLowerCase()}.`, status: "success" });
      return;
    }
    const side = selectedSide;
    const previous = studio.walls[side];
    if(previous){
      studio.scene.remove(previous.mesh);
      previous.mesh.geometry.dispose();
      previous.material.dispose();
      previous.texture.dispose();
      URL.revokeObjectURL(previous.objectUrl);
    }
    const canvas = document.createElement("canvas");
    const texture = new studio.three.THREE.CanvasTexture(canvas);
    texture.colorSpace = studio.three.THREE.SRGBColorSpace;
    const material = new studio.three.THREE.MeshBasicMaterial({ map: texture, side: studio.three.THREE.FrontSide });
    const mesh = new studio.three.THREE.Mesh(new studio.three.THREE.PlaneGeometry(1, 1), material);
    mesh.name = `studio-photo-wall-${side}`;
    studio.walls[side] = { image, objectUrl: url, canvas, texture, material, mesh, fit: "cover", x: 50, y: 50, zoom: 1 };
    studio.scene.add(mesh);
    updatePhotoWalls();
    const host = $("studioCanvasHost");
    host.style.backgroundImage = "none";
    host.classList.add("has-environment");
    refreshWallControls();
    applyFloorFinish(studio.floorFinish);
    if(studio.grid) studio.grid.visible = true;
    const sideNames = { back: "do fundo", front: "da frente", left: "esquerda", right: "direita" };
    window.catalogNotify?.({ title: "Parede criada", message: `A foto foi aplicada à parede ${sideNames[side]}.`, status: "success" });
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    window.catalogNotify?.({ title: "Não foi possível abrir a imagem", message: "Tente usar outra imagem JPG, PNG ou WebP.", status: "error" });
  };
  image.src = url;
}

function selectedWallEntry(){
  return selectedCustomWall() || studio.walls[$("studioWallSide")?.value || "back"] || null;
}

function refreshWallControls(){
  const side = $("studioWallSide")?.value || "back";
  const customWall = selectedCustomWall();
  const entry = customWall || studio.walls[side];
  const controls = $("studioEnvironmentControls");
  controls?.classList.toggle("hidden", !entry?.image);
  const names = { back: "fundo", front: "frente", left: "esquerda", right: "direita" };
  if($("studioWallControlsTitle")) $("studioWallControlsTitle").textContent = customWall ? customWall.name : `Parede ${names[side]}`;
  $("studioWallSelector")?.querySelectorAll("[data-wall-side]").forEach((button) => {
    button.classList.toggle("active", !customWall && button.dataset.wallSide === side);
    button.classList.toggle("has-photo", Boolean(studio.walls[button.dataset.wallSide]));
  });
  const uploadLabel = $("studioEnvironmentButton")?.querySelector("span");
  if(uploadLabel) uploadLabel.textContent = entry?.image ? "Trocar foto desta parede" : customWall ? `Adicionar foto à ${customWall.name}` : "Adicionar foto";
  const menuSummary = $("studioWallsMenuSummary");
  if(menuSummary){
    const occupied = Object.keys(studio.walls).length;
    const selectedName = names[side]?.replace(/^./, (letter) => letter.toUpperCase()) || "Fundo";
    menuSummary.textContent = customWall ? `${customWall.name} · ${customWall.length.toFixed(2).replace(".", ",")} m` : occupied ? `${selectedName} · ${occupied}/4` : selectedName;
  }
  refreshCustomWallSelection();
  controls?.querySelectorAll("[data-wall-fit]").forEach((button) => button.classList.toggle("active", button.dataset.wallFit === entry?.fit));
}

function selectWallSide(side){
  if(!["back", "front", "left", "right"].includes(side)) return;
  const select = $("studioWallSide");
  if(select) select.value = side;
  studio.selectedCustomWallId = null;
  refreshCustomWallSelection();
  refreshWallControls();
}

function removeSelectedWall(){
  const customWall = selectedCustomWall();
  if(customWall){
    if(!customWall.image) return;
    if(customWall.objectUrl) URL.revokeObjectURL(customWall.objectUrl);
    customWall.texture?.dispose?.();
    customWall.mesh.material?.dispose?.();
    const material = new studio.three.THREE.MeshStandardMaterial({ color: 0xeee9e1, roughness: .9, metalness: 0, side: studio.three.THREE.DoubleSide, transparent: true, opacity: .94 });
    customWall.mesh.material = material;
    Object.assign(customWall, { image: null, objectUrl: null, canvas: null, texture: null, material, fit: "cover", x: 50, y: 50, zoom: 1 });
    $("studioCanvasHost")?.classList.toggle("has-environment", Object.keys(studio.walls).length > 0 || studio.customWalls.some((wall) => wall.image));
    refreshCustomWallSelection();
    refreshWallControls();
    window.catalogNotify?.({ title: "Foto removida", message: `A ${customWall.name.toLowerCase()} foi mantida sem revestimento.`, status: "success" });
    return;
  }
  const side = $("studioWallSide")?.value || "back";
  const entry = studio.walls[side];
  if(!entry) return;
  studio.scene.remove(entry.mesh);
  entry.mesh.geometry.dispose();
  entry.material.dispose();
  entry.texture.dispose();
  URL.revokeObjectURL(entry.objectUrl);
  delete studio.walls[side];
  $("studioCanvasHost")?.classList.toggle("has-environment", Object.keys(studio.walls).length > 0 || studio.customWalls.some((wall) => wall.image));
  refreshWallControls();
  window.catalogNotify?.({ title: "Parede removida", message: "A foto foi retirada deste lado do cenário.", status: "success" });
}

function adjustSelectedWall(action){
  const side = $("studioWallSide")?.value || "back";
  const customWall = selectedCustomWall();
  const entry = customWall || studio.walls[side];
  if(!entry) return;
  if(action === "left") entry.x = Math.max(0, entry.x - 5);
  if(action === "right") entry.x = Math.min(100, entry.x + 5);
  if(action === "up") entry.y = Math.max(0, entry.y - 5);
  if(action === "down") entry.y = Math.min(100, entry.y + 5);
  if(action === "zoom-in") entry.zoom = Math.min(3, entry.zoom + .1);
  if(action === "zoom-out") entry.zoom = Math.max(.5, entry.zoom - .1);
  if(action === "remove"){ removeSelectedWall(); return; }
  const width = customWall?.length || (side === "left" || side === "right" ? studio.roomDepth : studio.roomWidth);
  configureWallTexture(entry, width);
}

function applyEnvironmentView(){
  const host = $("studioCanvasHost");
  if(!host) return;
  host.style.backgroundSize = studio.backgroundFit;
  host.style.backgroundPosition = `${studio.backgroundX}% ${studio.backgroundY}%`;
  document.querySelectorAll("[data-environment-fit]").forEach((button) =>
    button.classList.toggle("active", button.dataset.environmentFit === studio.backgroundFit)
  );
}

function adjustEnvironment(action){
  if(action === "left") studio.backgroundX = Math.max(0, studio.backgroundX - 5);
  if(action === "right") studio.backgroundX = Math.min(100, studio.backgroundX + 5);
  if(action === "up") studio.backgroundY = Math.max(0, studio.backgroundY - 5);
  if(action === "down") studio.backgroundY = Math.min(100, studio.backgroundY + 5);
  applyEnvironmentView();
}

function adjustFloor(action){
  if(!studio.camera || !studio.orbit) return;
  if(action === "lower") studio.orbit.target.y += .2;
  if(action === "raise") studio.orbit.target.y = Math.max(-1, studio.orbit.target.y - .2);
  if(action === "closer" || action === "farther"){
    const factor = action === "closer" ? .9 : 1.1;
    studio.camera.position.sub(studio.orbit.target).multiplyScalar(factor).add(studio.orbit.target);
  }
  studio.orbit.update();
}

function capturePreview(){
  const source = studio.renderer.domElement;
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#e9e5de";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const environment = studio.backgroundImage?.image;
  if(environment){
    const scale = studio.backgroundFit === "contain"
      ? Math.min(canvas.width / environment.naturalWidth, canvas.height / environment.naturalHeight)
      : Math.max(canvas.width / environment.naturalWidth, canvas.height / environment.naturalHeight);
    const width = environment.naturalWidth * scale;
    const height = environment.naturalHeight * scale;
    context.globalAlpha = .82;
    context.drawImage(
      environment,
      (canvas.width - width) * (studio.backgroundX / 100),
      (canvas.height - height) * (studio.backgroundY / 100),
      width,
      height
    );
    context.globalAlpha = 1;
  }
  const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  context.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  return canvas.toDataURL("image/png");
}

function captureCleanPreview(){
  const helpers = [studio.grid, studio.roomBorder, studio.rulerVisual, studio.wallDrawPreview, ...studio.customWalls.map((wall) => wall.floorLine), ...studio.groupHelpers].filter(Boolean);
  const visibility = helpers.map((helper) => helper.visible);
  helpers.forEach((helper) => { helper.visible = false; });
  studio.renderer.render(studio.scene, studio.camera);
  const preview = capturePreview();
  helpers.forEach((helper, index) => { helper.visible = visibility[index]; });
  studio.renderer.render(studio.scene, studio.camera);
  return preview;
}

function toggleCameraLock(){
  studio.cameraLocked = !studio.cameraLocked;
  if(studio.orbit){
    studio.orbit.enabled = !studio.cameraLocked;
    if(!studio.cameraLocked){
      studio.orbit.enableRotate = true;
      studio.orbit.enablePan = true;
      studio.orbit.enableZoom = true;
      studio.orbit.zoomToCursor = true;
      studio.orbit.screenSpacePanning = true;
      studio.orbit.mouseButtons.LEFT = studio.three.THREE.MOUSE.ROTATE;
      studio.orbit.mouseButtons.RIGHT = studio.three.THREE.MOUSE.PAN;
      studio.orbit.touches.ONE = studio.three.THREE.TOUCH.ROTATE;
      studio.orbit.touches.TWO = studio.three.THREE.TOUCH.DOLLY_PAN;
      studio.orbit.minPolarAngle = 0;
      studio.orbit.maxPolarAngle = Math.PI * .495;
      studio.camera.up.set(0, 1, 0);
      $("studioCanvasHost")?.classList.remove("is-map-view");
      $("studioTopView")?.classList.remove("active");
      $("studioTopView")?.setAttribute("aria-pressed", "false");
      $("studioPerspectiveView")?.classList.add("active");
      $("studioPerspectiveView")?.setAttribute("aria-pressed", "true");
      studio.orbit.update();
    }
  }
  const button = $("studioCameraLock");
  if(button){
    button.setAttribute("aria-pressed", String(studio.cameraLocked));
    button.textContent = studio.cameraLocked ? "Câmera travada" : "Travar câmera";
  }
}

function extractResult(image){
  if(!image) return "";
  if(image.base64) return String(image.base64).startsWith("data:") ? image.base64 : `data:image/png;base64,${image.base64}`;
  return image.url || "";
}

function refreshToolbarSummaries(){
  const space = $("studioSpaceMenuSummary");
  if(space) space.textContent = `${studio.roomWidth} × ${studio.roomDepth} m`;
  const view = $("studioViewMenuSummary");
  if(view){
    const topView = $("studioTopView")?.getAttribute("aria-pressed") === "true";
    view.textContent = topView ? "Superior" : studio.cameraLocked ? "3D travada" : "3D livre";
  }
  refreshWallControls();
}

function closeToolbarMenus(except = null){
  $("studioToolbar")?.querySelectorAll("[data-studio-menu]").forEach((menu) => {
    if(menu === except) return;
    menu.querySelector("[data-studio-menu-panel]")?.setAttribute("hidden", "");
    menu.querySelector("[data-studio-menu-trigger]")?.setAttribute("aria-expanded", "false");
  });
}

function handleToolbarMenuClick(event){
  const trigger = event.target.closest("[data-studio-menu-trigger]");
  if(!trigger) return;
  event.preventDefault();
  event.stopPropagation();
  const menu = trigger.closest("[data-studio-menu]");
  const panel = menu?.querySelector("[data-studio-menu-panel]");
  if(!menu || !panel) return;
  const willOpen = panel.hasAttribute("hidden");
  closeToolbarMenus(menu);
  panel.toggleAttribute("hidden", !willOpen);
  trigger.setAttribute("aria-expanded", String(willOpen));
}

async function renderWithAI(){
  if(!studio.objects.length){ alert("Adicione pelo menos um móvel à composição."); return; }
  const button = $("studioRenderButton");
  const floorNames = { neutral: "piso neutro", grass: "grama natural", sand: "areia de praia", "slatted-wood": "placas modulares de madeira ripada", plan: "planta técnica importada" };
  const selectedFloor = floorNames[studio.floorFinish] || floorNames.neutral;
  button.disabled = true; button.textContent = "Preparando…";
  let workingToast = null;
  try{
    selectObject(null);
    const preview = captureCleanPreview();
    const objects = studio.objects.map((object) => ({
      itemId: object.userData.item.id,
      itemName: object.userData.item.name,
      dimensions: object.userData.item.dimensions || {},
      position: object.position.toArray(),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: object.scale.toArray(),
    }));
    button.textContent = "Renderizando…";
    workingToast = window.catalogNotify?.({
      title: "Renderização em andamento",
      message: "A IA está conectando a arquitetura e preservando rigorosamente todos os móveis.",
      status: "working",
      duration: 0,
    });
    const { data, error } = await studio.supabase.functions.invoke("studio-ai-engine", {
      body: {
        empresa_id: studio.empresaId,
        catalog_token: sessionStorage.getItem("catalogo_token"),
        prompt: `Converta a captura 3D em uma fotografia arquitetônica ultrarrealista. Preserve rigidamente somente os móveis e o enquadramento: não altere quantidade, modelo, desenho, material, cor, medidas, proporções, escala, posição, rotação nem distância entre os itens. O piso deve ser interpretado como ${selectedFloor}. Trate paredes, teto, piso e as fotos aplicadas nas paredes como referências arquitetônicas flexíveis: conecte quinas e superfícies, complete o teto, harmonize perspectiva, iluminação e continuidade dos materiais e elimine cortes, emendas ou painéis flutuantes sem sentido. As fotos orientam o aspecto e a localização da arquitetura; elas não devem parecer coladas como retângulos. Não acrescente novos móveis, objetos decorativos ou pessoas.`,
        scene: {
          preview, objects,
          camera: { position: studio.camera.position.toArray(), target: studio.orbit.target.toArray(), fov: studio.camera.fov },
          architecture: {
            wallHeight: studio.wallHeight,
            outerWallsWithPhoto: Object.keys(studio.walls),
            customWalls: studio.customWalls.map((wall) => ({
              name: wall.name,
              start: [wall.start.x, wall.start.z],
              end: [wall.end.x, wall.end.z],
              length: wall.length,
              height: wall.height,
              hasPhotoReference: Boolean(wall.image),
            })),
          },
          referencePolicy: "furniture_strict_architecture_adaptive",
          options: { formato: { largura: 1536, altura: 1024 }, convidados: "Sem convidados", ambientacao: [], piso: studio.floorFinish },
        },
        provider: "openai", versions: 1,
      },
    });
    if(error){
      let details = "";
      try{
        const payload = await error.context?.json();
        details = payload?.details || payload?.erro || payload?.error?.message || payload?.error || "";
      }catch{ /* A resposta da função pode não estar em JSON. */ }
      throw new Error(details || error.message || "A função de renderização recusou a solicitação.");
    }
    if(data?.providerStatus !== "ok") throw new Error(data?.error?.message || data?.error?.error?.message || data?.erro || "O Studio IA não conseguiu concluir a imagem.");
    const src = extractResult(data?.images?.[0]);
    if(!src) throw new Error(data?.erro || "A IA não retornou uma imagem.");
    workingToast?.close();
    window.catalogNotify?.({
      title: "Sua renderização ficou pronta",
      message: "O cenário já pode ser visualizado e baixado.",
      actionLabel: "Ver resultado",
      duration: 15000,
      onAction: () => {
        $("studioResultImage").src = src;
        $("studioResultDownload").href = src;
        $("studioResultDialog").showModal();
      },
    });
  }catch(error){
    console.error("Erro ao renderizar composição:", error);
    workingToast?.close();
    window.catalogNotify?.({
      title: "Renderização não concluída",
      message: error?.message || "Não foi possível concluir a renderização com IA.",
      status: "error",
      duration: 12000,
    });
  }finally{
    button.disabled = false;
    button.textContent = "Renderizar com IA";
  }
}

async function handleToolbarAction(event){
  const button = event.target.closest("[data-studio-toolbar-action]");
  if(!button || !$("studioToolbar")?.contains(button)) return;
  event.preventDefault();
  const action = button.dataset.studioToolbarAction;
  try{
    if(action !== "fullscreen") await ensureScene();
    if(action === "top-view") showTopView();
    else if(action === "perspective-view") showPerspectiveView();
    else if(action === "wall-draw") toggleWallDraw();
    else if(action === "ruler") toggleRuler();
    else if(action === "crop") toggleCrop();
    else if(action === "zoom-out") zoomPlan(1.25);
    else if(action === "zoom-in") zoomPlan(.8);
    else if(action === "grid") toggleGrid();
    else if(action === "camera-lock") toggleCameraLock();
    else if(action === "fullscreen") await toggleStudioFullscreen();
    else if(action === "render") await renderWithAI();
    refreshToolbarSummaries();
    if(button.closest("[data-studio-menu]")) closeToolbarMenus();
  }catch(error){
    console.error(`Falha no controle ${action}:`, error);
    window.catalogNotify?.({
      title: "Controle indisponível",
      message: error?.message || "Não foi possível executar essa ação.",
      status: "error",
    });
  }
}

export function initCatalogStudio3D({ items, supabase, empresaId, ownerId }){
  if(studio.initialized) return;
  studio.initialized = true; studio.items = items; studio.supabase = supabase; studio.empresaId = empresaId;
  studio.ownerId = ownerId;
  initProjectTools();
  renderLibrary();
  $("studioFloorPlan")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const width = Number($("studioRoomWidth").value);
    const depth = Number($("studioRoomDepth").value);
    if(!Number.isFinite(width) || !Number.isFinite(depth) || width < 1 || depth < 1) return;
    studio.roomWidth = Math.min(width, 500);
    studio.roomDepth = Math.min(depth, 500);
    await ensureScene();
    updateRoomPlan();
    showTopView();
    refreshToolbarSummaries();
    closeToolbarMenus();
  });
  $("studioFloorFinish")?.addEventListener("change", async (event) => {
    try{
      await ensureScene();
      applyFloorFinish(event.target.value, true);
      closeToolbarMenus();
    }catch(error){
      console.error("Falha ao trocar o piso:", error);
      window.catalogNotify?.({ title: "Piso indisponível", message: "Não foi possível aplicar esse acabamento.", status: "error" });
    }
  });
  $("studioToolbar")?.addEventListener("click", handleToolbarMenuClick);
  $("studioToolbar")?.addEventListener("click", handleToolbarAction);
  document.addEventListener("click", (event) => {
    if(!event.target.closest("#studioToolbar")) closeToolbarMenus();
  });
  document.addEventListener("keydown", (event) => {
    if(event.key === "Escape"){
      closeToolbarMenus();
      if(studio.wallDrawActive) setWallDrawActive(false);
    }
  });
  $("studioRulerApply")?.addEventListener("click", calibrateFromRuler);
  $("studioRulerActual")?.addEventListener("keydown", (event) => { if(event.key === "Enter"){ event.preventDefault(); calibrateFromRuler(); } });
  $("studioPlanInput")?.addEventListener("change", async (event) => {
    await loadFloorPlan(event.target.files?.[0]);
    event.target.value = "";
  });
  document.addEventListener("fullscreenchange", () => {
    const active = document.fullscreenElement === $("catalogStudio");
    const button = $("studioFullscreen");
    if(button){ button.textContent = active ? "Sair da tela cheia" : "Tela cheia"; button.setAttribute("aria-pressed", String(active)); }
    refreshToolbarSummaries();
    requestAnimationFrame(resize);
  });
  document.querySelectorAll("[data-studio-preset]").forEach((button) => button.addEventListener("click", () => openPreset(button.dataset.studioPreset)));
  $("studioPresetClose")?.addEventListener("click", () => $("studioPresetDialog").close());
  $("studioPresetForm")?.addEventListener("submit", (event) => { event.preventDefault(); buildPreset(event.currentTarget); });
  $("studioPresetFields")?.addEventListener("input", (event) => {
    const search = event.target.closest("[data-picker-search]");
    if(!search) return;
    const picker = search.closest("[data-picker]");
    const query = normalizeSearch(search.value.trim());
    let visible = 0;
    picker.querySelectorAll("[data-picker-item]").forEach((card) => {
      const match = !query || card.dataset.search.includes(query);
      card.classList.toggle("hidden", !match);
      if(match) visible += 1;
    });
    picker.querySelector(".studio-picker-empty")?.classList.toggle("hidden", visible > 0);
  });
  $("studioPresetFields")?.addEventListener("change", updateLoungeDiagram);
  $("studioLibrarySearch")?.addEventListener("input", (event) => filterLibrary(event.target.value));
  $("studioLibraryList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-studio-add]");
    if(!button) return;
    const item = studio.items.find((candidate) => String(candidate.id) === button.dataset.studioAdd);
    if(item) addItem(item).catch(() => window.catalogNotify?.({
      title: "Modelo indisponível",
      message: `Não foi possível abrir ${item.name}. Tente novamente.`,
      status: "error",
    }));
  });
  const warmLibraryItem = (event) => {
    const button = event.target.closest("[data-studio-add]");
    if(!button) return;
    const item = studio.items.find((candidate) => String(candidate.id) === button.dataset.studioAdd);
    if(item) warmModel(item);
  };
  $("studioLibraryList")?.addEventListener("pointerover", warmLibraryItem, { passive: true });
  $("studioLibraryList")?.addEventListener("focusin", warmLibraryItem);
  $("studioCanvasHost")?.addEventListener("click", (event) => {
    if(event.target.closest("[data-studio-retry]")) openStudioScene();
  });
  $("studioEasyControls")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-studio-action]");
    if(button) applyEasyAction(button.dataset.studioAction);
  });
  const rotateButton = document.querySelector("[data-studio-rotate-hold]");
  rotateButton?.addEventListener("pointerdown", (event) => { event.preventDefault(); rotateButton.setPointerCapture?.(event.pointerId); startContinuousRotation(); });
  rotateButton?.addEventListener("pointerup", stopContinuousRotation);
  rotateButton?.addEventListener("pointercancel", stopContinuousRotation);
  rotateButton?.addEventListener("pointerleave", stopContinuousRotation);
  $("studioGroupButton")?.addEventListener("click", toggleGrouping);
  $("studioGroupingFinish")?.addEventListener("click", toggleGrouping);
  $("studioGroupingCancel")?.addEventListener("click", cancelGrouping);
  $("studioUngroupButton")?.addEventListener("click", ungroupSelected);
  $("studioEnvironmentInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if(!file) return;
    try{
      await ensureScene();
      loadEnvironment(file);
      closeToolbarMenus();
    }catch(error){
      console.error("Falha ao adicionar imagem de fundo:", error);
      window.catalogNotify?.({ title: "Imagem não adicionada", message: "O ambiente 3D não está disponível.", status: "error" });
    }
  });
  $("studioWallSide")?.addEventListener("change", refreshWallControls);
  $("studioWallSelector")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-wall-side]");
    if(button) selectWallSide(button.dataset.wallSide);
  });
  $("studioCustomWallList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-custom-wall-id]");
    if(button) selectCustomWall(button.dataset.customWallId);
  });
  $("studioCustomWallRemove")?.addEventListener("click", removeSelectedCustomWall);
  $("studioWallDrawFinish")?.addEventListener("click", () => setWallDrawActive(false));
  $("studioEnvironmentControls")?.addEventListener("click", (event) => {
    const fit = event.target.closest("[data-wall-fit]");
    if(fit){
      const entry = selectedWallEntry();
      if(!entry) return;
      entry.fit = fit.dataset.wallFit;
      const side = $("studioWallSide")?.value || "back";
      configureWallTexture(entry, side === "left" || side === "right" ? studio.roomDepth : studio.roomWidth);
      refreshWallControls();
      return;
    }
    const wallAction = event.target.closest("[data-wall-action]");
    if(wallAction){
      adjustSelectedWall(wallAction.dataset.wallAction);
      return;
    }
    const floorAction = event.target.closest("[data-floor-action]");
    if(floorAction) adjustFloor(floorAction.dataset.floorAction);
  });
  $("studioResultClose")?.addEventListener("click", () => $("studioResultDialog").close());
  window.addEventListener("catalog-studio-open", openStudioScene, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if(!document.hidden && studio.renderer) requestAnimationFrame(resize);
  });
  refreshToolbarSummaries();
}

// Projetos locais persistem em IndexedDB, inclusive as imagens incorporadas.
let projectId = crypto.randomUUID(), projectBusy = false, projectSignature = '';
const projectDB = new Promise((resolve, reject) => {
  const request = indexedDB.open('acervo-studio-projects', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
projectDB.catch(() => {});
async function projectStore(mode, operation){
  const db = await projectDB;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', mode), request = operation(tx.objectStore('projects'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function projectStatus(message){ $('studioProjectStatus').textContent = message; }
const savedImageData = new WeakMap();
function imageData(image){
  if(!image) return null;
  if(savedImageData.has(image)) return savedImageData.get(image);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width; canvas.height = image.naturalHeight || image.height;
  canvas.getContext('2d').drawImage(image, 0, 0);
  const data=canvas.toDataURL('image/png');savedImageData.set(image,data);return data;
}
function wallData(w){ return { name:w.name, start:w.start?.toArray(), end:w.end?.toArray(), height:w.height, image:imageData(w.image), fit:w.fit, x:w.x, y:w.y, zoom:w.zoom }; }
function snapshotProject(){
  return { version:1, id:projectId, owner:studio.projectOwner, name:$('studioProjectName').value.trim() || 'Meu projeto', updatedAt:Date.now(),
    roomWidth:studio.roomWidth, roomDepth:studio.roomDepth, wallHeight:studio.wallHeight, floorFinish:studio.floorFinish,
    floorPlanSource:studio.floorPlanSource, gridVisible:studio.gridVisible,
    walls:Object.fromEntries(Object.entries(studio.walls).map(([k,w])=>[k,wallData(w)])), customWalls:studio.customWalls.map(wallData),
    objects:studio.objects.map(o=>({itemId:o.userData.item.id, position:o.position.toArray(), rotation:o.rotation.toArray(), scale:o.scale.toArray(), group:o.userData.catalogGroupId})),
    camera:studio.camera ? {position:studio.camera.position.toArray(), target:studio.orbit.target.toArray(), topView:isTopViewActive()} : null,
    rules:readDesignRules() };
}
async function saveProject(force = false){
  if(projectBusy) return;
  if(!studio.scene){ if(force) await ensureScene(); else return; }
  try{
    const data = snapshotProject(), signature = JSON.stringify({...data,updatedAt:0});
    if(!force && signature === projectSignature) return;
    await projectStore('readwrite', store=>store.put(data)); projectSignature = signature;
    projectStatus('Salvo neste navegador às ' + new Date().toLocaleTimeString('pt-BR'));
    await refreshProjects();
  }catch(error){ projectStatus('Não foi possível salvar. Exporte um backup: ' + error.message); }
}
async function refreshProjects(){
  const rows = (await projectStore('readonly',store=>store.getAll())).filter(p=>p.owner===studio.projectOwner).sort((a,b)=>b.updatedAt-a.updatedAt);
  $('studioProjectList').innerHTML = '<option value="">Abrir projeto salvo…</option>' + rows.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — ${new Date(p.updatedAt).toLocaleString('pt-BR')}</option>`).join('');
}
async function restoreWallImage(w, data){
  if(!data.image) return;
  const image = new Image(); image.src = data.image; await image.decode();
  const {THREE}=studio.three;
  w.canvas=document.createElement('canvas'); w.texture=new THREE.CanvasTexture(w.canvas); w.texture.colorSpace=THREE.SRGBColorSpace;
  w.material=new THREE.MeshBasicMaterial({map:w.texture,side:THREE.DoubleSide}); w.mesh.material=w.material;
  Object.assign(w,{image,fit:data.fit,x:data.x,y:data.y,zoom:data.zoom});
}
async function openProject(data){
  if(data?.version!==1 || !Array.isArray(data.objects) || data.objects.length>1000 || !Number.isFinite(data.roomWidth) || data.roomWidth<1 || data.roomWidth>500 || !Number.isFinite(data.roomDepth) || data.roomDepth<1 || data.roomDepth>500) throw new Error('Arquivo de projeto inválido');
  const validVector=v=>Array.isArray(v)&&v.length>=3&&v.slice(0,3).every(n=>Number.isFinite(n)&&Math.abs(n)<10000);
  if(data.objects.some(o=>!validVector(o.position)||!validVector(o.rotation)||!validVector(o.scale)) || (data.customWalls||[]).some(w=>!validVector(w.start)||!validVector(w.end))) throw new Error('Coordenadas inválidas');
  await saveProject(true); projectBusy=true;
  try{
    await ensureScene(); selectObject(null);
    studio.objects.forEach(o=>studio.scene.remove(o)); studio.objects=[];
    for(const w of [...studio.customWalls,...Object.values(studio.walls)]){studio.scene.remove(w.mesh,w.floorLine);w.mesh.geometry.dispose();w.material?.dispose();w.texture?.dispose();}
    studio.customWalls=[];studio.walls={};studio.selectedCustomWallId=null;
    projectId=data.id || crypto.randomUUID(); $('studioProjectName').value=data.name;
    studio.roomWidth=data.roomWidth;studio.roomDepth=data.roomDepth;studio.wallHeight=data.wallHeight || 4;
    $('studioRoomWidth').value=data.roomWidth;$('studioRoomDepth').value=data.roomDepth;
    studio.floorPlanSource=data.floorPlanSource;
    if(data.floorPlanSource){
      applyFloorPlanTexture(data.floorPlanSource);
      await new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=()=>reject(new Error("Planta indisponível"));image.src=data.floorPlanSource;});
    }
    applyFloorFinish(data.floorFinish || 'neutral');studio.gridVisible=data.gridVisible!==false;
    const {THREE}=studio.three;
    for(const saved of data.customWalls || []){
      const w=createCustomWall(new THREE.Vector3(...saved.start),new THREE.Vector3(...saved.end));
      if(w){ w.height=saved.height;w.name=saved.name;await restoreWallImage(w,saved);updateCustomWallGeometry(w); }
    }
    for(const [side,saved] of Object.entries(data.walls || {})){
      if(!['back','front','left','right'].includes(side)) continue;
      const w={mesh:new THREE.Mesh(new THREE.PlaneGeometry(1,1)),...saved};
      await restoreWallImage(w,saved);studio.walls[side]=w;studio.scene.add(w.mesh);
    }
    updateRoomPlan(); let missing=0;
    for(const saved of data.objects){
      const item=studio.items.find(i=>String(i.id)===String(saved.itemId));
      if(!item?.glb){missing++;continue;}
      try{const o=await addItem(item);o.position.fromArray(saved.position);o.rotation.fromArray(saved.rotation);o.scale.fromArray(saved.scale);o.userData.catalogGroupId=saved.group;rememberValidTransform(o);}catch{missing++;}
    }
    if(data.camera?.topView) showTopView();
    else showPerspectiveView();
    if(data.camera){studio.camera.position.fromArray(data.camera.position);studio.orbit.target.fromArray(data.camera.target);studio.orbit.update();}
    for(const [k,v] of Object.entries(data.rules || {})){const input=$('design-'+k);if(input) input.value=v;}
    selectObject(null);updateCount();refreshToolbarSummaries();refreshCustomWallSelection();
    projectStatus(missing ? `Projeto aberto; ${missing} modelos indisponíveis. O original salvo foi preservado; exporte uma cópia.` : 'Projeto aberto. Pode continuar de onde parou.');
    if(missing) projectId=crypto.randomUUID();
  }catch(error){ projectId=crypto.randomUUID(); throw error; }finally{projectBusy=false;projectSignature='';}
}
function readDesignRules(){
  return Object.fromEntries(['wallGap','furnitureGap','tableGap','aisle','quantity','brief'].map(k=>[k,k==='brief'?$('design-'+k)?.value || '':Number($('design-'+k)?.value ?? ({wallGap:.5,furnitureGap:.4,tableGap:1.2,aisle:1.2,quantity:12}[k]))]));
}
function initProjectTools(){
  studio.projectOwner=String(studio.empresaId)+':'+String(studio.ownerId || 'local');
  const panel=document.createElement('section');panel.className='studio-project-panel';
  panel.innerHTML=`<details open><summary>Projetos</summary><input id="studioProjectName" aria-label="Nome do projeto" value="Meu projeto" maxlength="120"><div><button id="studioProjectSave">Salvar projeto</button><button id="studioProjectNew">Novo projeto</button></div><select id="studioProjectList" aria-label="Projetos salvos"></select><div><button id="studioProjectExport">Exportar backup</button><label>Importar backup<input id="studioProjectImport" type="file" accept=".json,application/json"></label></div><small id="studioProjectStatus" role="status">Salvamento automático a cada 5 segundos neste navegador. Exporte para usar em outro computador.</small></details><details><summary>Decoradora IA · montar espaço</summary><p>Escolha os modelos e quantidades. A IA interpreta as orientações; a montagem verifica as distâncias em metros e mantém os móveis existentes.</p><label>Distância das paredes (m)<input id="design-wallGap" type="number" min="0" max="10" step=".1" value=".5"></label><label>Entre móveis (m)<input id="design-furnitureGap" type="number" min="0" max="10" step=".1" value=".4"></label><label>Entre mesas, borda a borda (m)<input id="design-tableGap" type="number" min="0" max="10" step=".1" value="1.2"></label><label>Corredor central livre (m)<input id="design-aisle" type="number" min="0" max="10" step=".1" value="1.2"></label><label>Quantidade por modelo<input id="design-quantity" type="number" min="1" max="100" value="6"></label><label>Orientações da decoradora<textarea id="design-brief" maxlength="4000" placeholder="Ex.: mesas próximas ao fundo, lounge acolhedor e entrada livre."></textarea></label><div id="studioDesignItems">${studio.items.filter(i=>i.glb).map(i=>`<label><input type="checkbox" value="${escapeHtml(i.id)}">${escapeHtml(i.name)}</label>`).join('')}</div><button id="studioDesignBuild">Montar espaço automaticamente</button><small id="studioDesignStatus" role="status"></small></details>`;
  document.querySelector('.studio-library').prepend(panel);
  $('studioProjectSave').onclick=()=>saveProject(true);
  $('studioProjectNew').onclick=async()=>{await openProject({version:1,id:crypto.randomUUID(),name:'Novo projeto',objects:[],roomWidth:10,roomDepth:10});};
  $('studioProjectList').onchange=async e=>{if(!e.target.value)return;try{await openProject(await projectStore('readonly',s=>s.get(e.target.value)));}catch(err){projectStatus(err.message);}};
  $('studioProjectExport').onclick=()=>{try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(snapshotProject())],{type:'application/json'}));a.download='projeto-acervo.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){projectStatus(e.message);}};
  $('studioProjectImport').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>100*1024*1024)throw new Error('Backup maior que 100 MB');const data=JSON.parse(await f.text());data.id=crypto.randomUUID();await openProject(data);await saveProject(true);}catch(err){projectStatus(err.message);}e.target.value='';};
  $('studioDesignBuild').onclick=buildDesignedSpace;
  refreshProjects().catch(e=>projectStatus('Armazenamento indisponível: '+e.message));
  setInterval(()=>saveProject(),5000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveProject();});
}
function beginWallDrag(event){
  if(event.button!==0 || studio.wallDrawActive || studio.rulerActive || studio.cropActive || !isTopViewActive()) return false;
  const point=wallPointFromPointer(event);if(!point)return false;
  const threshold=Math.max(.15,studio.camera.position.y*.015);
  let best=null;
  for(const wall of studio.customWalls){
    for(const end of ['start','end']){const distance=point.distanceTo(wall[end]);if(distance<threshold && (!best||distance<best.distance))best={wall,end,distance};}
    const segment=wall.end.clone().sub(wall.start), t=Math.max(0,Math.min(1,point.clone().sub(wall.start).dot(segment)/segment.lengthSq()));
    const distance=point.distanceTo(wall.start.clone().addScaledVector(segment,t));
    if(distance<threshold*.6 && !best)best={wall,end:null,distance};
  }
  if(!best)return false;
  selectCustomWall(best.wall.id);studio.wallDrag={...best,point,start:best.wall.start.clone(),finish:best.wall.end.clone()};
  studio.orbit.enabled=false;studio.renderer.domElement.setPointerCapture(event.pointerId);return true;
}
function moveWallDrag(event){
  const drag=studio.wallDrag;if(!drag)return false;const point=wallPointFromPointer(event);if(!point)return true;
  if(drag.end){if(point.distanceTo(drag.wall[drag.end==='start'?'end':'start'])>=.2)drag.wall[drag.end].copy(point);}
  else{const delta=point.clone().sub(drag.point);delta.x=Math.max(-studio.roomWidth/2-Math.min(drag.start.x,drag.finish.x),Math.min(studio.roomWidth/2-Math.max(drag.start.x,drag.finish.x),delta.x));delta.z=Math.max(-studio.roomDepth/2-Math.min(drag.start.z,drag.finish.z),Math.min(studio.roomDepth/2-Math.max(drag.start.z,drag.finish.z),delta.z));drag.wall.start.copy(drag.start).add(delta);drag.wall.end.copy(drag.finish).add(delta);}
  updateCustomWallGeometry(drag.wall);renderWallDrawPreview(drag.wall.start,drag.wall.end);renderCustomWallList();return true;
}

async function buildDesignedSpace(){
  const button=$('studioDesignBuild'),status=$('studioDesignStatus'),rules=readDesignRules();
  if(['wallGap','furnitureGap','tableGap','aisle'].some(k=>!Number.isFinite(rules[k])||rules[k]<0||rules[k]>10)||!Number.isInteger(rules.quantity)||rules.quantity<1||rules.quantity>100){status.textContent='Confira as distâncias (0 a 10 m) e a quantidade (1 a 100).';return;}
  const chosen=[...document.querySelectorAll('#studioDesignItems input:checked')].map(e=>studio.items.find(i=>String(i.id)===e.value)).filter(Boolean);
  if(!chosen.length){status.textContent='Selecione os modelos que deseja usar.';return;}
  if(chosen.length*rules.quantity>300){status.textContent='Monte até 300 itens por vez.';return;}
  button.disabled=true;let added=0,failed=0;let strategy='Distribuição automática por medidas';
  try{
    await ensureScene();await saveProject(true);projectBusy=true;
    let requests=chosen.map(i=>({itemId:String(i.id),quantity:rules.quantity,zone:'any'}));
    if(rules.brief.trim()){
      status.textContent='A IA está interpretando suas orientações…';
      try{
        const {data,error}=await studio.supabase.functions.invoke('studio-ai-engine',{body:{action:'plan_layout',empresa_id:studio.empresaId,catalog_token:sessionStorage.getItem('catalogo_token'),prompt:rules.brief,scene:{rules,room:{width:studio.roomWidth,depth:studio.roomDepth},items:chosen.map(i=>({id:String(i.id),name:i.name,dimensions:i.dimensions}))}}});
        if(error||!Array.isArray(data?.plan?.items))throw new Error('Planejamento IA indisponível');
        requests=chosen.map(i=>{const proposal=data.plan.items.find(p=>String(p.itemId)===String(i.id));return {itemId:String(i.id),quantity:rules.quantity,zone:['front','back','left','right','any'].includes(proposal?.zone)?proposal.zone:'any'};});
        strategy='Orientações interpretadas pela IA';
      }catch{strategy='IA indisponível; distribuição por medidas, sem interpretação do texto';}
    }
    const {fitsPlacement}=await import('./studio-layout.mjs');const {THREE}=studio.three;
    const boxOf=o=>{const b=new THREE.Box3().setFromObject(o);return {minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z,table:/mesa/i.test(o.userData.item.name)};};
    const occupied=studio.objects.map(boxOf);
    const existingAisle=occupied.some(b=>rules.aisle>0&&b.minX<rules.aisle/2&&b.maxX>-rules.aisle/2);
    const wallAisle=studio.customWalls.some(w=>Math.min(w.start.x,w.end.x)<rules.aisle/2&&Math.max(w.start.x,w.end.x)>-rules.aisle/2);
    if(existingAisle || (rules.aisle>0&&wallAisle))throw new Error('O corredor central já está ocupado por móveis ou paredes. Libere essa faixa ou ajuste sua largura antes de montar.');
    for(const request of requests){
      const item=chosen.find(i=>String(i.id)===request.itemId);
      for(let n=0;n<request.quantity;n++){
        status.textContent=`Posicionando ${item.name} (${n+1}/${request.quantity})…`;
        let object;try{object=await addItem(item);}catch{failed+=request.quantity-n;break;}
        const initial=boxOf(object),w=initial.maxX-initial.minX,d=initial.maxZ-initial.minZ;
        const offsetX=(initial.maxX+initial.minX)/2-object.position.x,offsetZ=(initial.maxZ+initial.minZ)/2-object.position.z;
        const candidates=[];const step=Math.max(.2,Math.max(studio.roomWidth,studio.roomDepth)/150);
        for(let z=-studio.roomDepth/2+rules.wallGap+d/2;z<=studio.roomDepth/2-rules.wallGap-d/2;z+=step)
          for(let x=-studio.roomWidth/2+rules.wallGap+w/2;x<=studio.roomWidth/2-rules.wallGap-w/2;x+=step)candidates.push({x,z});
        const score=p=>request.zone==='front'?-p.z:request.zone==='back'?p.z:request.zone==='left'?p.x:request.zone==='right'?-p.x:p.z;
        candidates.sort((a,b)=>score(a)-score(b));
        const position=candidates.find(p=>fitsPlacement({minX:p.x-w/2,maxX:p.x+w/2,minZ:p.z-d/2,maxZ:p.z+d/2,table:initial.table},occupied,studio.customWalls,{width:studio.roomWidth,depth:studio.roomDepth},rules));
        if(!position){studio.scene.remove(object);studio.objects.splice(studio.objects.indexOf(object),1);failed+=request.quantity-n;break;}
        object.position.x=position.x-offsetX;object.position.z=position.z-offsetZ;rememberValidTransform(object);occupied.push(boxOf(object));added++;
        await new Promise(resolve=>requestAnimationFrame(resolve));
      }
    }
    selectObject(null);updateCount();showTopView();
    status.textContent=`${strategy}. ${added} itens adicionados.${failed?` ${failed} não couberam ou estavam indisponíveis.`:''} Distâncias verificadas nas bordas dos modelos. Use modelos de cadeiras para considerar sua ocupação.`;
  }catch(e){status.textContent=e.message;}
  finally{projectBusy=false;button.disabled=false;await saveProject(true);}
}
