// Módulo Lounge — pedido explícito do usuário: uma tela dedicada, mais
// simples que o Estúdio de Ambientes ("um mais simples pro decorador
// testar os formatos"), pra montar composições de lounge (sofá +
// poltronas). Reaproveita a IDEIA e os PAPÉIS (sofá/poltrona/mesa de
// centro/mesa lateral/aparador) já usados pelo preset "Lounge compacto"
// dentro do Estúdio de Ambientes (catalogo-studio3d.mjs, PRESETS.lounge)
// — que continua existindo lá também, sem nenhuma mudança (usuário
// confirmou explicitamente: "continua nos dois lugares"). NÃO importa
// nada daquele arquivo: catalogo-studio3d.mjs só exporta
// initCatalogStudio3D, e todo o motor 3D de lá (createScene/addItem/
// loadModelTemplate) fecha sobre um único objeto `studio` module-level,
// sem parâmetro de host/instância — não dá pra rodar um 2º visualizador
// independente reaproveitando aquelas funções sem arriscar quebrar o
// Estúdio profissional já funcionando (ver seção correspondente no
// CLAUDE.md, investigação feita antes de escrever este arquivo). Este
// módulo monta sua PRÓPRIA cena Three.js, pequena, com ciclo de vida
// EXPLÍCITO — criada ao abrir, destruída ao fechar (teardownCatalogLounge) —
// diferente do Estúdio, que nunca desliga o próprio render loop, só o
// pausa enquanto escondido.

const THREE_URL = "three";
const GLTF_URL = "three/addons/loaders/GLTFLoader.js";
const ORBIT_URL = "three/addons/controls/OrbitControls.js";

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));
const escapeAttr = (value) => escapeHtml(value).replace(/`/g, "&#96;");

// "Lounge compacto" é o único formato por enquanto — pedido explícito do
// usuário: "imagina que ali será uma coluna com vários que vamos criar no
// futuro". Adicionar um novo formato = um novo objeto neste array (título,
// descrição, papéis com o padrão de busca no catálogo, e layout() com as
// posições relativas de cada peça). Mesmos papéis/regex do preset
// original (PRESETS.lounge em catalogo-studio3d.mjs) — copiados, não
// importados (ver comentário no topo do arquivo).
const FORMATS = [
  {
    key: "lounge-compacto",
    title: "Lounge compacto",
    description: "Sofá com poltronas nas pontas, viradas para o centro, sem sobreposições.",
    roles: [
      { key: "sofa", label: "Sofá", pattern: /sof[aá]/i, required: true },
      { key: "armchair", label: "Poltrona", pattern: /poltrona/i, required: true },
      { key: "center", label: "Mesa de centro", pattern: /mesa.*centro|centro.*mesa/i, required: false },
      { key: "side", label: "Mesa lateral/canto", pattern: /mesa.*(lateral|canto)|(lateral|canto).*mesa/i, required: false },
      { key: "console", label: "Aparador", pattern: /aparador/i, required: false },
    ],
    // Posições relativas (metros) de cada peça ao redor do sofá,
    // escaladas pela largura/profundidade REAL do sofá escolhido — mesmo
    // raciocínio de posicionamento do preset original (poltronas nas
    // pontas, viradas pro centro), só que FIXO, sem diagrama arrastável:
    // pedido explícito "mais simples pro decorador testar os formatos",
    // não precisa do ajuste manual que o Estúdio de Ambientes já tem.
    layout(sofaSize){
      const halfW = Math.max(sofaSize.width || 1.8, 1.4) / 2;
      const depth = sofaSize.depth || 0.9;
      return {
        sofa: [{ position: [0, 0, 0], rotation: 0 }],
        armchair: [
          { position: [-(halfW + 0.78), 0, depth * 0.72], rotation: Math.PI / 2 },
          { position: [halfW + 0.78, 0, depth * 0.72], rotation: -Math.PI / 2 },
        ],
        center: [{ position: [0, 0, depth + 0.85], rotation: 0 }],
        side: [
          { position: [-(halfW + 0.4), 0, depth * 0.1], rotation: 0 },
          { position: [halfW + 0.4, 0, depth * 0.1], rotation: 0 },
        ],
        console: [{ position: [0, 0, -depth - 0.35], rotation: Math.PI }],
      };
    },
  },
];

// Pedido explícito do usuário, depois de ver a 1ª versão renderizada:
// "quero que a pessoa possa escolher o piso, o fundo ela também pode
// escolher através de foto". Piso = alguns acabamentos prontos pra
// aplicar no plano do chão (mesma ideia do seletor de piso do Estúdio de
// Ambientes — `floorFinish`/`createFloorFinishCanvas` em
// catalogo-studio3d.mjs — texturas procedurais num `<canvas>` 2D, só que
// mais simples/com menos opções, consistente com o resto deste módulo).
// Fundo = uma foto de verdade escolhida pelo usuário (upload), aplicada
// como `background-image` do próprio host do canvas (mesmo truque do
// Estúdio: o renderer usa `alpha:true`, então a foto aparece por trás de
// qualquer área da cena sem geometria — o "céu"/entorno acima do chão).
const FLOORS = [
  { key: "neutral", label: "Piso neutro", color: "#d8d1c7" },
  { key: "wood", label: "Madeira", color: "#8a5a35", planks: true },
  { key: "grass", label: "Grama", color: "#5e7d43" },
  { key: "sand", label: "Areia", color: "#d8c294" },
  { key: "dark", label: "Piso escuro", color: "#3b3530" },
];

let ctx = { items: [] };
// `lounge` só existe enquanto a cena Three.js está viva — criada em
// ensureScene(), destruída por completo em teardownCatalogLounge() (nunca
// fica "pausada" rodando escondida, diferente do Estúdio de Ambientes).
let lounge = null;
let ui = { formatKey: FORMATS[0].key, selection: {}, floorKey: FLOORS[0].key };
let fullscreenHandler = null;

function itemById(id){
  if(!id) return null;
  return ctx.items.find((item) => String(item.id) === String(id)) || null;
}

function matchingItems(pattern){
  return ctx.items.filter((item) => item.glb && pattern.test(`${item.catLabel || ""} ${item.name || ""}`));
}

function currentFormat(){
  return FORMATS.find((format) => format.key === ui.formatKey) || FORMATS[0];
}

function ensureDefaultSelection(){
  currentFormat().roles.forEach((role) => {
    if(ui.selection[role.key] !== undefined) return;
    if(role.required){
      const first = matchingItems(role.pattern)[0];
      ui.selection[role.key] = first ? first.id : null;
    }else{
      ui.selection[role.key] = null;
    }
  });
}

// ---------- Markup ----------

function formatsMarkup(){
  return FORMATS.map((format) => `<button type="button" class="catalog-lounge-format ${format.key === ui.formatKey ? "is-active" : ""}" data-lounge-format="${escapeAttr(format.key)}" aria-pressed="${format.key === ui.formatKey}">
    <strong>${escapeHtml(format.title)}</strong>
    <small>${escapeHtml(format.description)}</small>
  </button>`).join("");
}

function rolePickerMarkup(role){
  const options = matchingItems(role.pattern);
  const selectedId = ui.selection[role.key] || "";
  return `<fieldset class="catalog-lounge-role" data-lounge-role="${escapeAttr(role.key)}">
    <legend>${escapeHtml(role.label)}${role.required ? " *" : ""}</legend>
    <div class="catalog-lounge-role-items">
      ${role.required ? "" : `<button type="button" class="catalog-lounge-item-chip is-none ${!selectedId ? "is-active" : ""}" data-lounge-pick="${escapeAttr(role.key)}" data-lounge-item="" aria-pressed="${!selectedId}">Nenhuma</button>`}
      ${options.map((item) => `<button type="button" class="catalog-lounge-item-chip ${String(item.id) === String(selectedId) ? "is-active" : ""}" data-lounge-pick="${escapeAttr(role.key)}" data-lounge-item="${escapeAttr(item.id)}" aria-pressed="${String(item.id) === String(selectedId)}" title="${escapeAttr(item.name)}">
        <img src="${escapeHtml(item.photo)}" alt="" loading="lazy">
        <span>${escapeHtml(item.name)}</span>
      </button>`).join("")}
      ${options.length === 0 ? `<p class="catalog-lounge-role-empty">Nenhum item com modelo 3D nesta categoria.</p>` : ""}
    </div>
  </fieldset>`;
}

function itemsMarkup(){
  return currentFormat().roles.map(rolePickerMarkup).join("");
}

function floorsMarkup(){
  return FLOORS.map((floor) => `<button type="button" class="catalog-lounge-floor-swatch ${floor.key === ui.floorKey ? "is-active" : ""}" data-lounge-floor="${escapeAttr(floor.key)}" style="--swatch-color:${floor.color}" title="${escapeAttr(floor.label)}" aria-label="${escapeAttr(floor.label)}" aria-pressed="${floor.key === ui.floorKey}"></button>`).join("");
}

function renderSidebar(){
  const formatList = $("loungeFormatList");
  const itemRoles = $("loungeItemRoles");
  const floorRow = $("loungeFloorRow");
  if(formatList) formatList.innerHTML = formatsMarkup();
  if(itemRoles) itemRoles.innerHTML = itemsMarkup();
  if(floorRow) floorRow.innerHTML = floorsMarkup();
}

// ---------- Cena 3D ----------

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
  const [THREE, gltf, orbit] = await Promise.all([import(THREE_URL), import(GLTF_URL), import(ORBIT_URL)]);
  return { THREE, GLTFLoader: gltf.GLTFLoader, OrbitControls: orbit.OrbitControls };
}

async function ensureScene(){
  if(lounge) return lounge;
  const host = $("loungeCanvasHost");
  if(!host) return null;
  const { THREE, GLTFLoader, OrbitControls } = await loadThree();
  if(lounge) return lounge; // outra chamada pode ter terminado primeiro enquanto esperávamos o import

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1), 0.1, 100);
  const initialCameraPosition = new THREE.Vector3(0, 2.5, 4.4);
  const initialTarget = new THREE.Vector3(0, 0.5, 0.3);
  camera.position.copy(initialCameraPosition);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(Math.max(host.clientWidth, 1), Math.max(host.clientHeight, 1));
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.innerHTML = "";
  host.appendChild(renderer.domElement);

  // Intensidade igualada à do Estúdio de Ambientes (catalogo-studio3d.mjs,
  // HemisphereLight 2.2 / DirectionalLight 3.2) — pedido explícito do
  // usuário, reportando com print: "os 3d estão aparecendo só que mais
  // escuros... quero que eles abram nas cores normais". Causa: esta cena
  // sempre teve luz bem mais fraca que a do Estúdio (1.15/1.5, quase
  // metade), então os MESMOS materiais/texturas dos itens renderizavam
  // visivelmente mais escuros/acinzentados aqui do que no Estúdio, que é
  // a referência de "cor normal" já validada pelo usuário.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe7e1d6, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.position.set(3.2, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  // Piso de verdade, escolhível (pedido explícito do usuário) — tamanho
  // moderado (9×9m, bem maior que a composição mas longe do "infinito")
  // de propósito: deixa uma área de "céu" visível acima/ao redor na
  // maioria dos ângulos de câmera, onde a foto de fundo (se escolhida)
  // aparece — um piso do tamanho da tela inteira esconderia a foto por
  // completo.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), floorMaterial(THREE, FLOORS[0]));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  host.dataset.floorKey = FLOORS[0].key;
  // Mesmo espírito de dataset.cameraDistance/dataset.floorKey: dá pra
  // verificar de fora (teste de regressão) que a parede de fundo existe
  // de verdade na cena, sem expor nada extra em `window`.
  host.dataset.backgroundWall = "none";

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.copy(initialTarget);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.minDistance = 1.6;
  orbit.maxDistance = 11;
  orbit.maxPolarAngle = Math.PI * 0.49;
  orbit.update();

  const loader = new GLTFLoader();

  lounge = {
    THREE, scene, camera, renderer, orbit, loader, host, floor,
    raf: null, resizeObserver: null,
    initialCameraPosition, initialTarget,
    modelCache: new Map(), pieces: new Map(), floorMaterials: new Map([[FLOORS[0].key, floor.material]]),
    backgroundUrl: null, backgroundWall: null, wallAdjusting: false, wallAdjustDrag: null,
  };

  const render = () => {
    lounge.raf = requestAnimationFrame(render);
    lounge.orbit.update();
    lounge.renderer.render(lounge.scene, lounge.camera);
  };
  render();

  lounge.resizeObserver = new ResizeObserver(() => {
    if(!lounge || !host.isConnected) return;
    const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
    lounge.camera.aspect = width / height;
    lounge.camera.updateProjectionMatrix();
    lounge.renderer.setSize(width, height);
  });
  lounge.resizeObserver.observe(host);

  // Dica de uso esmaece na 1ª interação real (arrastar ou rolar) — mesmo
  // espírito do filtro `source==="user-interaction"` do <model-viewer> no
  // mini-menu Módulo 3D, só que aqui é raw Three.js/OrbitControls: escuta
  // o gesto direto no canvas em vez de um evento de câmera já filtrado.
  const dismissHint = () => document.querySelector(".catalog-lounge-hint")?.classList.add("is-dismissed");
  renderer.domElement.addEventListener("pointerdown", dismissHint, { once: true });
  renderer.domElement.addEventListener("wheel", dismissHint, { once: true, passive: true });

  return lounge;
}

// Textura procedural simples num <canvas> 2D (mesma técnica do Estúdio de
// Ambientes, `createFloorFinishCanvas` em catalogo-studio3d.mjs — bem
// mais simples aqui: grão sutil + tábuas só pra "madeira", sem replicar
// toda a elaboração daquele arquivo, consistente com o resto deste
// módulo mais enxuto).
function createFloorCanvas(floorDef){
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = floorDef.color;
  context.fillRect(0, 0, 256, 256);
  for(let i = 0; i < 900; i += 1){
    context.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.05)";
    context.fillRect(Math.random() * 256, Math.random() * 256, 1.2, 1.2);
  }
  if(floorDef.planks){
    context.strokeStyle = "rgba(0,0,0,.16)";
    context.lineWidth = 1;
    for(let x = 0; x < 256; x += 32){
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 256);
      context.stroke();
    }
  }
  return canvas;
}

function floorMaterial(THREE, floorDef){
  const texture = new THREE.CanvasTexture(createFloorCanvas(floorDef));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return new THREE.MeshStandardMaterial({ map: texture, roughness: .94, metalness: 0 });
}

function applyFloor(key){
  if(!lounge) return;
  const floorDef = FLOORS.find((candidate) => candidate.key === key) || FLOORS[0];
  ui.floorKey = floorDef.key;
  if(!lounge.floorMaterials.has(floorDef.key)) lounge.floorMaterials.set(floorDef.key, floorMaterial(lounge.THREE, floorDef));
  lounge.floor.material = lounge.floorMaterials.get(floorDef.key);
  lounge.host.dataset.floorKey = floorDef.key;
  const floorRow = $("loungeFloorRow");
  if(floorRow) floorRow.innerHTML = floorsMarkup();
}

function syncBackgroundControls(){
  const hasPhoto = Boolean(lounge?.backgroundUrl);
  $("loungeBgRemove")?.classList.toggle("hidden", !hasPhoto);
  const label = $("loungeBgLabel");
  if(label) label.textContent = hasPhoto ? "Trocar foto de fundo" : "Escolher foto de fundo";
  const adjustBtn = $("loungeBgAdjust");
  if(adjustBtn){
    adjustBtn.classList.toggle("hidden", !hasPhoto);
    adjustBtn.classList.toggle("is-active", Boolean(lounge?.wallAdjusting));
    adjustBtn.textContent = lounge?.wallAdjusting ? "Concluir ajuste" : "Ajustar imagem (arrastar)";
  }
  $("loungeBgZoom")?.classList.toggle("hidden", !hasPhoto);
}

// Foto de fundo — pedido explícito do usuário, com uma correção depois de
// ver a 1ª versão (que era só um `background-image` de CSS atrás do
// canvas): *"a foto de fundo ela deve ser igual a parede que nós temos
// no outro módulo 3d"* — ou seja, uma PAREDE de verdade na cena (mesma
// técnica do Estúdio de Ambientes, `studio.walls`/`configureWallTexture`
// em catalogo-studio3d.mjs: um plano vertical com a foto desenhada num
// `<canvas>` 2D em modo "cover" e aplicada como textura), não um truque
// de CSS que só aparecia nos vãos sem geometria 3D. Criada sob demanda
// (só quando a 1ª foto é escolhida) — igual a parede do Estúdio.
const BACKGROUND_WALL_WIDTH = 9;
const BACKGROUND_WALL_HEIGHT = 4.6;

// Bug real reportado pelo usuário: "quero arrastar a foto de fundo mais
// pra baixo e eu não consigo". Causa: em "cover" fit puro (zoom=1), o
// eixo que precisa da MAIOR escala pra cobrir a parede fica com folga
// ZERO pra arrastar (a imagem cobre esse eixo exatamente, sem sobra) —
// como a parede é bem larga (9:4.6 ≈ 1,96:1), qualquer foto AINDA MAIS
// larga que isso (foto panorâmica de ambiente, comum como fundo) zera a
// folga vertical por completo, e arrastar pra cima/baixo não tem efeito
// nenhum até a pessoa dar zoom manualmente primeiro. Multiplicador fixo
// que garante folga em AMBOS os eixos desde o zoom mínimo, não importa a
// proporção da foto escolhida.
const MIN_WALL_OVERSCAN = 1.25;

function createBackgroundWall(THREE, scene){
  const canvas = document.createElement("canvas");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(BACKGROUND_WALL_WIDTH, BACKGROUND_WALL_HEIGHT), material);
  mesh.position.set(0, BACKGROUND_WALL_HEIGHT / 2, -4.4); // reposicionada de verdade em positionBackgroundWall()
  scene.add(mesh);
  return { canvas, texture, material, mesh };
}

// Pedido explícito do usuário, olhando a tela real: "esse espaço do 3d
// até o fundo não pode ter, o primeiro 3D tem que ficar pertinho da
// parede" — a parede tinha uma posição FIXA (z=-4.4), bem mais atrás do
// que a composição realmente ocupa, sobrando um vão vazio de piso entre
// os móveis e a parede. Corrigido calculando a caixa delimitadora REAL
// (`THREE.Box3`) de todas as peças já colocadas na cena — cobre a
// profundidade de verdade de cada peça (já escalada pelas dimensões
// comerciais do item, já rotacionada) sem precisar adivinhar a partir das
// posições nominais do `layout()` — e encostando a parede logo atrás da
// peça mais ao fundo, com uma margem pequena (nunca colada, mas bem
// "pertinho"). Chamada de novo sempre que a composição muda (troca de
// item/formato), então a parede sempre acompanha o que está montado.
const BACKGROUND_WALL_MARGIN = 0.3;

function positionBackgroundWall(){
  if(!lounge?.backgroundWall) return;
  const { THREE } = lounge;
  const box = new THREE.Box3();
  let hasPieces = false;
  lounge.pieces.forEach((meshes) => {
    meshes.forEach((mesh) => { box.expandByObject(mesh); hasPieces = true; });
  });
  const backZ = hasPieces && Number.isFinite(box.min.z) ? box.min.z : -1.5;
  lounge.backgroundWall.mesh.position.z = backZ - BACKGROUND_WALL_MARGIN;
  // Mesmo espírito de dataset.cameraDistance/dataset.floorKey — dá pra
  // provar de fora (teste de regressão) que a parede realmente encostou
  // perto da composição, não só que existe.
  if(lounge.host) lounge.host.dataset.backgroundWallZ = lounge.backgroundWall.mesh.position.z.toFixed(3);
}

// Desenha a foto no canvas em modo "cover" (preenche a parede inteira,
// cortando o excesso — nunca distorce) — mesma fórmula de
// `configureWallTexture()` no Estúdio de Ambientes, inclusive o mesmo
// jeito de guardar posição/zoom (`wall.x`/`wall.y` 0-100%, `wall.zoom`)
// pra dar pra reaplicar o desenho a cada ajuste sem duplicar a foto
// original — só o `<canvas>` é redesenhado do zero a cada chamada.
function paintBackgroundWall(wall){
  const wallAspect = BACKGROUND_WALL_WIDTH / BACKGROUND_WALL_HEIGHT;
  const textureSize = 1400;
  const canvas = wall.canvas;
  if(wallAspect >= 1){ canvas.width = textureSize; canvas.height = Math.max(280, Math.round(textureSize / wallAspect)); }
  else{ canvas.height = textureSize; canvas.width = Math.max(280, Math.round(textureSize * wallAspect)); }
  const context = canvas.getContext("2d");
  context.fillStyle = "#e8e4dc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const baseScale = Math.max(canvas.width / wall.image.naturalWidth, canvas.height / wall.image.naturalHeight) * MIN_WALL_OVERSCAN;
  const scale = baseScale * wall.zoom;
  const drawWidth = wall.image.naturalWidth * scale, drawHeight = wall.image.naturalHeight * scale;
  const drawX = (canvas.width - drawWidth) * (wall.x / 100);
  const drawY = (canvas.height - drawHeight) * (wall.y / 100);
  context.drawImage(wall.image, drawX, drawY, drawWidth, drawHeight);
  wall.texture.needsUpdate = true;
  // Mesmo espírito de dataset.cameraDistance/floorKey/backgroundWallZ —
  // dá pra provar de fora que arrastar/rolar realmente mudou x/y/zoom.
  if(lounge?.host){
    lounge.host.dataset.wallOffset = `${wall.x.toFixed(1)},${wall.y.toFixed(1)},${wall.zoom.toFixed(2)}`;
    // `wallOffset` só prova que x/y (0-100%) mudaram — não prova que a
    // foto realmente SE MOVEU na tela: se a folga de arrastar for zero
    // num eixo (bug corrigido logo acima, ver MIN_WALL_OVERSCAN), x/y
    // mudam mas drawX/drawY ficam sempre no mesmo valor. Esse dataset
    // expõe o resultado de verdade (posição em pixels no canvas da
    // parede), pra um teste conseguir provar que arrastar tem efeito.
    lounge.host.dataset.wallDrawOffset = `${drawX.toFixed(1)},${drawY.toFixed(1)}`;
  }
}

function applyBackgroundPhoto(file){
  if(!lounge || !file || !file.type?.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if(!lounge){ URL.revokeObjectURL(url); return; } // sessão fechada enquanto a imagem carregava
    if(lounge.backgroundUrl) URL.revokeObjectURL(lounge.backgroundUrl);
    lounge.backgroundUrl = url;
    if(!lounge.backgroundWall) lounge.backgroundWall = createBackgroundWall(lounge.THREE, lounge.scene);
    Object.assign(lounge.backgroundWall, { image, x: 50, y: 50, zoom: 1 });
    paintBackgroundWall(lounge.backgroundWall);
    lounge.backgroundWall.mesh.visible = true;
    positionBackgroundWall();
    lounge.host.dataset.backgroundWall = "visible";
    syncBackgroundControls();
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    window.catalogNotify?.({ title: "Não foi possível abrir a imagem", message: "Tente usar outra imagem JPG, PNG ou WebP.", status: "error" });
  };
  image.src = url;
}

function removeBackgroundPhoto(){
  if(!lounge) return;
  if(lounge.wallAdjusting) exitWallAdjust();
  if(lounge.backgroundUrl) URL.revokeObjectURL(lounge.backgroundUrl);
  lounge.backgroundUrl = null;
  if(lounge.backgroundWall) lounge.backgroundWall.mesh.visible = false;
  lounge.host.dataset.backgroundWall = "hidden";
  syncBackgroundControls();
}

// Ajustar a foto de fundo ARRASTANDO — pedido explícito do usuário,
// preferindo isso a botões: "quero que a pessoa possa ajustar a imagem
// de fundo, se puder ser arrastar seria ótimo ao invés de botões". Como
// arrastar no visualizador normalmente gira a câmera (OrbitControls), um
// modo de ajuste explícito alterna o que o mesmo gesto faz: enquanto
// ativo, `orbit.enabled=false` (a MESMA flag que o OrbitControls já
// expõe pra isso, sem precisar remover/recriar os listeners internos
// dele) e arrastar/rolar no canvas passa a mover/dar zoom na foto da
// parede (`wall.x/y/zoom`, repintados a cada gesto via
// paintBackgroundWall()) em vez de orbitar a câmera. Sensibilidade do
// arraste é relativa ao tamanho do canvas (não um valor fixo em pixels),
// pra sentir proporcional em qualquer tamanho de tela.
function wallAdjustPointerDown(event){
  if(!lounge) return;
  lounge.wallAdjustDrag = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
  lounge.renderer.domElement.setPointerCapture?.(event.pointerId);
  lounge.host.classList.add("is-dragging-wall");
}

function wallAdjustPointerMove(event){
  const drag = lounge?.wallAdjustDrag;
  if(!drag || drag.pointerId !== event.pointerId || !lounge.backgroundWall) return;
  const rect = lounge.renderer.domElement.getBoundingClientRect();
  const dx = event.clientX - drag.lastX, dy = event.clientY - drag.lastY;
  drag.lastX = event.clientX; drag.lastY = event.clientY;
  const wall = lounge.backgroundWall;
  wall.x = Math.min(100, Math.max(0, wall.x - (dx / rect.width) * 100));
  wall.y = Math.min(100, Math.max(0, wall.y - (dy / rect.height) * 100));
  paintBackgroundWall(wall);
}

function wallAdjustPointerUp(event){
  if(!lounge?.wallAdjustDrag || lounge.wallAdjustDrag.pointerId !== event.pointerId) return;
  lounge.wallAdjustDrag = null;
  lounge.host.classList.remove("is-dragging-wall");
}

// Pedido explícito do usuário, corrigindo a 1ª versão (que dava zoom com
// a roda do mouse durante o modo de ajuste): "o zoom não pode ser com o
// mouse, tem que ser com botão + e - mesmo". Zoom por BOTÃO não conflita
// com nada (não é um gesto contínuo tipo arrastar/rolar), então funciona
// a qualquer momento que exista uma foto — não precisa do modo de ajuste
// ativo, diferente de arrastar (que só faz sentido dentro do modo, pra
// não brigar com o gesto de girar a câmera).
function zoomBackgroundWall(direction){
  if(!lounge?.backgroundWall?.image) return;
  const wall = lounge.backgroundWall;
  wall.zoom = Math.min(3, Math.max(1, wall.zoom + (direction > 0 ? 0.15 : -0.15)));
  paintBackgroundWall(wall);
}

function enterWallAdjust(){
  if(!lounge?.backgroundWall?.image || lounge.wallAdjusting) return;
  lounge.wallAdjusting = true;
  lounge.orbit.enabled = false;
  const canvas = lounge.renderer.domElement;
  canvas.addEventListener("pointerdown", wallAdjustPointerDown);
  canvas.addEventListener("pointermove", wallAdjustPointerMove);
  canvas.addEventListener("pointerup", wallAdjustPointerUp);
  canvas.addEventListener("pointercancel", wallAdjustPointerUp);
  lounge.host.classList.add("is-adjusting-wall");
  const hintText = document.querySelector(".catalog-lounge-hint span");
  if(hintText){ hintText.dataset.original = hintText.textContent; hintText.textContent = "Arraste para posicionar a foto de fundo"; }
  document.querySelector(".catalog-lounge-hint")?.classList.remove("is-dismissed");
}

function exitWallAdjust(){
  if(!lounge?.wallAdjusting) return;
  lounge.wallAdjusting = false;
  lounge.wallAdjustDrag = null;
  lounge.orbit.enabled = true;
  const canvas = lounge.renderer.domElement;
  canvas.removeEventListener("pointerdown", wallAdjustPointerDown);
  canvas.removeEventListener("pointermove", wallAdjustPointerMove);
  canvas.removeEventListener("pointerup", wallAdjustPointerUp);
  canvas.removeEventListener("pointercancel", wallAdjustPointerUp);
  lounge.host.classList.remove("is-adjusting-wall", "is-dragging-wall");
  const hintText = document.querySelector(".catalog-lounge-hint span");
  if(hintText && hintText.dataset.original){ hintText.textContent = hintText.dataset.original; delete hintText.dataset.original; }
}

function toggleWallAdjust(){
  if(!lounge) return;
  if(lounge.wallAdjusting) exitWallAdjust(); else enterWallAdjust();
  syncBackgroundControls();
}

async function loadModel(item, onProgress){
  if(lounge.modelCache.has(item.glb)) return lounge.modelCache.get(item.glb);
  const modelUrl = typeof window.catalogLoadModelAsset === "function"
    ? await window.catalogLoadModelAsset(item.glb, onProgress)
    : item.glb;
  const gltf = await lounge.loader.loadAsync(modelUrl);
  lounge.modelCache.set(item.glb, gltf.scene);
  return gltf.scene;
}

function clearRole(role){
  if(!lounge) return;
  const pieces = lounge.pieces.get(role) || [];
  pieces.forEach((piece) => lounge.scene.remove(piece));
  lounge.pieces.set(role, []);
}

async function placeRole(role, item, placements){
  clearRole(role);
  if(!item || !placements?.length) return;
  const template = await loadModel(item);
  const { THREE } = lounge;
  const placed = placements.map((placement) => {
    const root = template.clone(true);
    root.traverse((node) => {
      if(node.isMesh){ node.castShadow = true; node.receiveShadow = true; }
    });
    // Cadastro usa metros — ajustamos cada eixo do GLB uma única vez pra
    // largura/altura/profundidade coincidirem com as dimensões comerciais
    // do item (mesmo cálculo do Estúdio de Ambientes, addItem()).
    const sourceBox = new THREE.Box3().setFromObject(root);
    const sourceSize = sourceBox.getSize(new THREE.Vector3());
    const dimensions = item.dimensions || {};
    const axisScale = (target, current) => Number(target) > 0 && current > 0 ? Number(target) / current : 1;
    root.scale.multiply(new THREE.Vector3(
      axisScale(dimensions.width, sourceSize.x),
      axisScale(dimensions.height, sourceSize.y),
      axisScale(dimensions.depth, sourceSize.z),
    ));
    const normalized = new THREE.Box3().setFromObject(root);
    root.position.set(placement.position[0], placement.position[1] - normalized.min.y, placement.position[2]);
    root.rotation.y = placement.rotation;
    lounge.scene.add(root);
    return root;
  });
  lounge.pieces.set(role, placed);
}

function setLoading(isLoading){
  const stage = $("loungeCanvasHost");
  if(!stage) return;
  let indicator = stage.querySelector(".catalog-lounge-loading");
  if(isLoading){
    if(!indicator){
      indicator = document.createElement("div");
      indicator.className = "catalog-lounge-loading";
      indicator.setAttribute("role", "status");
      indicator.innerHTML = `<span class="catalog-lounge-loading-ring"></span><span>Montando composição</span>`;
      stage.appendChild(indicator);
    }
  }else{
    indicator?.remove();
  }
  // Bug real reportado pelo usuário: "a renderização mudou completamente
  // o mobiliário". Causa: `placeRole()` é assíncrono — `clearRole()` já
  // remove a peça antiga da cena na hora, mas o `.glb` novo só entra
  // depois de um `await loadModel()` — nessa janela, clicar em
  // "Renderizar com IA" capturava uma composição incompleta/desincroni-
  // zada da que a pessoa via nos chips de seleção (papel sem nenhuma
  // peça, ou ainda com a peça antiga), e a IA "completava" a cena com
  // mobiliário genérico pra preencher o que faltava — o problema nunca
  // esteve na fidelidade da IA em si (o pipeline é idêntico ao do
  // Estúdio de Ambientes), e sim no que estava sendo fotografado. O
  // botão fica desabilitado durante toda a montagem (mesma janela que já
  // mostra "Montando composição" no visualizador), nunca clicável
  // enquanto alguma peça ainda pode estar faltando.
  const renderButton = $("loungeRenderButton");
  if(renderButton && renderButton.dataset.loungeRendering !== "true") renderButton.disabled = isLoading;
}

function showEmptyState(){
  const stage = $("loungeCanvasHost");
  if(!stage || stage.querySelector(".catalog-lounge-empty")) return;
  const empty = document.createElement("div");
  empty.className = "catalog-lounge-empty";
  empty.innerHTML = `<strong>Nenhum sofá com modelo 3D cadastrado ainda</strong><span>Cadastre um modelo 3D em pelo menos um sofá pra usar este formato.</span>`;
  stage.appendChild(empty);
}

function hideEmptyState(){
  $("loungeCanvasHost")?.querySelector(".catalog-lounge-empty")?.remove();
}

async function applySelection(){
  if(!supportsWebGL()){
    const stage = $("loungeCanvasHost");
    if(stage) stage.innerHTML = `<div class="catalog-lounge-empty"><strong>3D indisponível neste navegador</strong><span>Ative a aceleração de hardware nas configurações do navegador e recarregue a página.</span></div>`;
    return;
  }
  const scene = await ensureScene();
  if(!scene) return;
  const format = currentFormat();
  const sofaItem = itemById(ui.selection.sofa);
  if(!sofaItem){
    format.roles.forEach((role) => clearRole(role.key));
    showEmptyState();
    return;
  }
  hideEmptyState();
  setLoading(true);
  try{
    const sofaSize = { width: sofaItem.dimensions?.width || 1.8, depth: sofaItem.dimensions?.depth || 0.9 };
    const layout = format.layout(sofaSize);
    for(const role of format.roles){
      const item = itemById(ui.selection[role.key]);
      await placeRole(role.key, item, layout[role.key]);
    }
    // A parede (se já escolhida) acompanha a composição — troca de sofá/
    // formato muda a profundidade real ocupada, ela precisa encostar de
    // novo no lugar certo (ver positionBackgroundWall()).
    positionBackgroundWall();
  }catch(error){
    console.warn("Não foi possível montar a composição do Lounge:", error);
  }finally{
    setLoading(false);
  }
}

// ---------- Câmera ----------

// `host.dataset.cameraDistance` não é lido por nenhum CSS/JS da própria
// tela — existe só pra dar um jeito de VERIFICAR de fora (teste de
// regressão) que aproximar/afastar/redefinir realmente mexem na câmera de
// verdade, já que esta cena é raw Three.js (sem uma API pública tipo
// getCameraOrbit() do <model-viewer> usada pelo mini-menu Módulo 3D).
// Mesmo espírito de `dataset.mesmoToast` já usado no teste das
// notificações do catálogo.
function syncCameraDebugAttr(){
  if(!lounge?.host) return;
  const distance = lounge.camera.position.distanceTo(lounge.orbit.target);
  lounge.host.dataset.cameraDistance = distance.toFixed(4);
}

function zoomCamera(direction){
  if(!lounge) return;
  const factor = direction > 0 ? 0.85 : 1 / 0.85;
  const { camera, orbit } = lounge;
  const toCamera = camera.position.clone().sub(orbit.target);
  const distance = toCamera.length();
  const nextDistance = Math.min(Math.max(distance * factor, orbit.minDistance), orbit.maxDistance);
  toCamera.setLength(nextDistance);
  camera.position.copy(orbit.target).add(toCamera);
  orbit.update();
  syncCameraDebugAttr();
}

function resetCamera(){
  if(!lounge) return;
  lounge.camera.position.copy(lounge.initialCameraPosition);
  lounge.orbit.target.copy(lounge.initialTarget);
  lounge.orbit.update();
  syncCameraDebugAttr();
}

function syncFullscreenUI(){
  const viewerBox = document.querySelector(".catalog-lounge-viewer");
  const button = document.querySelector("[data-lounge-fullscreen]");
  if(!viewerBox || !button) return;
  const isFullscreen = document.fullscreenElement === viewerBox;
  viewerBox.classList.toggle("is-fullscreen", isFullscreen);
  button.innerHTML = isFullscreen
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>`;
  button.setAttribute("aria-label", isFullscreen ? "Sair da tela cheia" : "Tela cheia");
  button.setAttribute("title", isFullscreen ? "Sair da tela cheia" : "Tela cheia");
}

// "Tela cheia deve expandir SOMENTE o visualizador" (mesma regra já
// aplicada ao mini-menu Módulo 3D) — Fullscreen API no contêiner do
// visualizador, nunca na página. Esc sai sozinho (nativo).
function toggleFullscreen(){
  const viewerBox = document.querySelector(".catalog-lounge-viewer");
  if(!viewerBox) return;
  if(document.fullscreenElement) document.exitFullscreen?.();
  else viewerBox.requestFullscreen?.().catch(() => {});
}

// ---------- Renderizar com IA ----------

// Pedido explícito do usuário: "preciso que tenha aqui o botão renderizar
// com IA também" — mesma capacidade que já existe no Estúdio de
// Ambientes (`renderWithAI()`/`studio-ai-engine` em
// catalogo-studio3d.mjs), chamando a MESMA função de borda (Edge
// Function) do Supabase, com o MESMO padrão de créditos
// (`window.CatalogCredits`, já carregado globalmente pelo catalogo.mjs —
// nenhum import novo necessário) — só o conteúdo da cena capturada/
// enviada muda (composição de lounge, não sala inteira do Estúdio). Sem
// o diálogo de "atmosfera" (dia/entardecer/noite, convidados) que o
// Estúdio tem — pedido foi só "o botão", e esta tela já é a versão mais
// simples do conceito; usa os mesmos padrões (dia, luz suave, sem
// convidados) que o Estúdio usa quando chamado sem opções.
// Bug real reportado pelo usuário, com prints lado a lado (a foto que a
// IA devolveu não tinha NADA a ver com a composição real): o renderer
// (`new THREE.WebGLRenderer({...})`, sem `preserveDrawingBuffer:true`,
// mesma configuração do Estúdio) pode ter o buffer de desenho limpo pelo
// navegador logo depois de cada frame ser apresentado na tela — ler
// `renderer.domElement` via `drawImage()` só é confiável se isso
// acontecer LOGO DEPOIS de um `render()` síncrono, na mesma tarefa. O
// loop de `requestAnimationFrame` renderiza continuamente, mas o clique
// em "Renderizar com IA" roda numa tarefa assíncrona separada — nada
// garante que o buffer ainda contém o último frame válido nesse momento.
// `captureCleanPreview()` do Estúdio de Ambientes (`catalogo-studio3d.
// mjs`) já fazia um `render()` explícito bem antes de capturar,
// exatamente por essa razão — esta função nunca tinha copiado esse
// passo, só lia o canvas "como estivesse", o que funcionava na maior
// parte das vezes (a coincidência de timing costuma dar certo) mas podia
// capturar um frame velho/parcial sem aviso nenhum. Corrigido forçando
// um `render()` síncrono imediatamente antes de ler o canvas.
function loungeCleanPreview(){
  lounge.renderer.render(lounge.scene, lounge.camera);
  const source = lounge.renderer.domElement;
  const canvas = document.createElement("canvas");
  canvas.width = 1536; canvas.height = 1024;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#e9e5de";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
  const width = source.width * scale, height = source.height * scale;
  context.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  return canvas.toDataURL("image/png");
}

function loungeExtractResult(image){
  if(!image) return "";
  if(image.base64) return String(image.base64).startsWith("data:") ? image.base64 : `data:image/png;base64,${image.base64}`;
  return image.url || "";
}

function loungeComposedObjects(){
  const objects = [];
  lounge.pieces.forEach((meshes, role) => {
    meshes.forEach((mesh) => {
      const item = mesh.userData.item;
      objects.push({
        itemId: item?.id, itemName: item?.name, role,
        dimensions: item?.dimensions || {},
        position: mesh.position.toArray(),
        rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
        scale: mesh.scale.toArray(),
      });
    });
  });
  return objects;
}

function openLoungeRenderResult(src){
  const img = $("loungeResultImage");
  const download = $("loungeResultDownload");
  if(img) img.src = src;
  if(download) download.href = src;
  $("loungeResultDialog")?.showModal();
}

async function renderLoungeWithAI(){
  const button = $("loungeRenderButton");
  if(!lounge || !button || button.disabled) return;
  const objects = loungeComposedObjects();
  if(!objects.length){
    window.catalogNotify?.({ title: "Composição vazia", message: "Escolha pelo menos um sofá antes de renderizar.", status: "error" });
    return;
  }
  const floorDef = FLOORS.find((floor) => floor.key === ui.floorKey) || FLOORS[0];
  const originalText = button.textContent;
  button.disabled = true;
  button.dataset.loungeRendering = "true"; // impede setLoading() de reabilitar o botão se uma troca de item terminar enquanto o render está em andamento
  button.textContent = "Preparando…";
  let workingToast = null;
  try{
    const preview = loungeCleanPreview();
    button.textContent = "Renderizando…";
    workingToast = window.catalogNotify?.({
      title: "Renderização em andamento",
      message: "A IA está compondo o ambiente, preservando rigorosamente os móveis.",
      status: "working",
      duration: 0,
    });
    const { data, error } = await window.CatalogCredits.invoke("studio-ai-engine", {
      body: {
        empresa_id: ctx.empresaId,
        catalog_token: sessionStorage.getItem("catalogo_token"),
        prompt: `Aplique um acabamento fotorrealista sobre a EXATA cena capturada do lounge, sem recompor nem estender nada. O ângulo de câmera, a distância, a altura do ponto de vista e o enquadramento desta captura são definitivos e têm prioridade máxima: reproduza-os com fidelidade absoluta, pixel a pixel, sem recentralizar, reenquadrar, cortar, aproximar, afastar, inclinar nem rotacionar a câmera em nenhum grau — como se fosse a própria foto revelada com materiais e luz reais, não uma nova composição. Preserve rigidamente os móveis: não altere quantidade, modelo, desenho, material, cor, medidas, proporções, escala, posição, rotação nem distância entre os itens. O piso deve ser interpretado como ${floorDef.label.toLowerCase()}. A parede de fundo (se houver) permanece exatamente como está enquadrada, sem esticar nem completar além do que já é visível. Se o topo da captura está aberto, sem teto, o resultado também deve ficar aberto, sem teto — não invente nenhum elemento arquitetônico que não esteja literalmente na captura. Não acrescente novos móveis nem pessoas.`,
        scene: {
          preview, objects,
          camera: { position: lounge.camera.position.toArray(), target: lounge.orbit.target.toArray(), fov: lounge.camera.fov },
          architecture: { piso: floorDef.key, temFotoDeFundo: Boolean(lounge.backgroundWall?.mesh.visible) },
          // Pedido explícito do usuário: "quero que respeite exatamente o
          // ângulo, a distância e principalmente o preview... é como se
          // tirasse um print do que eu estou vendo no 3D e desse só o
          // realismo... sem inventar nada" — política mais rígida que a
          // do Estúdio de Ambientes (que continua com
          // "furniture_strict_architecture_adaptive", sem nenhuma
          // mudança): aqui a arquitetura também fica travada, nunca
          // estendida/completada pela IA (ver normalizarPrompt() em
          // supabase/functions/studio-ai-engine/index.ts).
          referencePolicy: "furniture_strict_literal_scene",
          options: { formato: { largura: 1536, altura: 1024 }, periodo: "dia", iluminacao: "suave", convidados: "nenhum", ambientacao: [], piso: floorDef.key },
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
    const src = loungeExtractResult(data?.images?.[0]);
    if(!src) throw new Error(data?.erro || "A IA não retornou uma imagem.");
    workingToast?.close();
    window.catalogNotify?.({
      title: "Sua renderização ficou pronta",
      message: "O ambiente já pode ser visualizado e baixado.",
      actionLabel: "Ver resultado",
      duration: 15000,
      // Pedido explícito do usuário: "quero que a notificação de todos
      // os módulos apareça a imagem, igual é em troca de tecido" — a
      // MESMA imagem já usada no diálogo de resultado, sem gerar nada
      // novo (mesmo padrão de `notify({image:...})` já usado pra "Sob
      // Medida"/tecido em catalogo.mjs).
      image: src,
      onAction: () => openLoungeRenderResult(src),
    });
  }catch(error){
    console.error("Erro ao renderizar o lounge:", error);
    workingToast?.close();
    window.catalogNotify?.({
      title: "Renderização não concluída",
      message: error?.message || "Não foi possível concluir a renderização com IA.",
      status: "error",
      duration: 12000,
    });
  }finally{
    delete button.dataset.loungeRendering;
    button.disabled = false;
    button.textContent = originalText;
  }
}

// ---------- Interações ----------

function bindInteractions(){
  const root = $("catalogLounge");
  if(!root || root.dataset.loungeBound === "true") return;
  root.dataset.loungeBound = "true";
  root.addEventListener("click", (event) => {
    const formatBtn = event.target.closest("[data-lounge-format]");
    if(formatBtn){
      if(formatBtn.dataset.loungeFormat === ui.formatKey) return;
      exitWallAdjust();
      ui.formatKey = formatBtn.dataset.loungeFormat;
      ui.selection = {};
      ensureDefaultSelection();
      renderSidebar();
      applySelection();
      resetCamera();
      return;
    }
    const pickBtn = event.target.closest("[data-lounge-pick]");
    if(pickBtn){
      exitWallAdjust();
      const role = pickBtn.dataset.loungePick;
      ui.selection[role] = pickBtn.dataset.loungeItem || null;
      renderSidebar();
      applySelection();
      return;
    }
    const floorBtn = event.target.closest("[data-lounge-floor]");
    if(floorBtn){ applyFloor(floorBtn.dataset.loungeFloor); return; }
    if(event.target.closest("[data-lounge-bg-adjust]")){ toggleWallAdjust(); return; }
    if(event.target.closest("[data-lounge-bg-zoom-in]")){ zoomBackgroundWall(1); return; }
    if(event.target.closest("[data-lounge-bg-zoom-out]")){ zoomBackgroundWall(-1); return; }
    if(event.target.closest("[data-lounge-bg-remove]")){ removeBackgroundPhoto(); return; }
    if(event.target.closest("[data-lounge-zoom-in]")){ zoomCamera(1); return; }
    if(event.target.closest("[data-lounge-zoom-out]")){ zoomCamera(-1); return; }
    if(event.target.closest("[data-lounge-reset]")){ resetCamera(); return; }
    if(event.target.closest("[data-lounge-fullscreen]")){ toggleFullscreen(); return; }
    if(event.target.closest("[data-lounge-render]")){ renderLoungeWithAI(); return; }
  });
  // O diálogo de resultado (#loungeResultDialog) é irmão de #catalogLounge
  // no HTML, não filho — mesmo padrão de #studioResultDialog/
  // #catalogFabricResultDialog — então o botão de fechar precisa do
  // próprio listener, fora da delegação de `root` acima.
  $("loungeResultClose")?.addEventListener("click", () => $("loungeResultDialog")?.close());
  root.querySelector("#loungeBgInput")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if(file) applyBackgroundPhoto(file);
    event.target.value = "";
  });
}

// ---------- Ciclo de vida ----------

export function initCatalogLounge({ items, empresaId }){
  ctx = { items: items || [], empresaId };
  bindInteractions();
}

export async function openCatalogLounge(){
  ui = { formatKey: FORMATS[0].key, selection: {}, floorKey: FLOORS[0].key };
  ensureDefaultSelection();
  renderSidebar();
  syncBackgroundControls();
  fullscreenHandler = syncFullscreenUI;
  document.addEventListener("fullscreenchange", fullscreenHandler);
  await applySelection();
  resetCamera();
}

function disposeSceneObjects(scene){
  scene?.traverse((node) => {
    if(!node.isMesh) return;
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if(!material) return;
      Object.values(material).forEach((value) => { if(value?.isTexture) value.dispose(); });
      material.dispose();
    });
  });
}

// Chamada sempre que a tela é escondida (troca de overlay ou navegação
// pra outra `view`) — pedido explícito do usuário no redesenho do Módulo
// 3D, "evitar vazamentos de memória... remover listeners, animações e
// recursos gráficos quando a tela for fechada", mesma disciplina aplicada
// aqui: desliga o loop de render, desconecta o ResizeObserver, libera
// geometrias/materiais/texturas e destrói o renderer — nada fica "pausado
// escondido" como no Estúdio de Ambientes (ver comentário no topo do
// arquivo).
export function teardownCatalogLounge(){
  if(fullscreenHandler){
    document.removeEventListener("fullscreenchange", fullscreenHandler);
    fullscreenHandler = null;
  }
  if(document.fullscreenElement?.classList.contains("catalog-lounge-viewer")) document.exitFullscreen?.().catch(() => {});
  if(!lounge) return;
  if(lounge.wallAdjusting) exitWallAdjust();
  if(lounge.raf) cancelAnimationFrame(lounge.raf);
  lounge.resizeObserver?.disconnect();
  lounge.orbit?.dispose();
  disposeSceneObjects(lounge.scene);
  // Materiais de piso trocados durante a sessão (ex.: usuário testou
  // "Madeira" e "Grama") ficam em cache (lounge.floorMaterials) mesmo
  // depois de deixarem de estar aplicados no piso — disposeSceneObjects
  // só limpa o que ainda está NA CENA, então precisam ser liberados à
  // parte aqui pra não vazar textura/material sem uso.
  lounge.floorMaterials?.forEach((material) => {
    material.map?.dispose?.();
    material.dispose?.();
  });
  // A parede de fundo (lounge.backgroundWall.mesh), se existir, já está
  // NA CENA — disposeSceneObjects() acima já liberou sua geometria/
  // material/textura junto com o resto; só falta revogar a URL do blob.
  if(lounge.backgroundUrl) URL.revokeObjectURL(lounge.backgroundUrl);
  lounge.renderer?.dispose();
  lounge.renderer?.domElement?.remove();
  lounge = null;
}
