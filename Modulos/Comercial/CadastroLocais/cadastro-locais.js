function initCadastroLocais(){
"use strict";

const container = document.querySelector(".locais-container");

/* =====================================================
   SPA GUARD (EVITA DUPLA INICIALIZAÇÃO)
===================================================== */
if (
  window.__locaisModuleLoaded &&
  container?.dataset.initialized === "true"
){
  return;
}

if (!container) return;

// ✅ só executa se realmente entrou no módulo
resetEnderecoAutocomplete();

container.dataset.initialized = "true";
window.__locaisModuleLoaded = true;
  /* =====================================================
     UTIL
  ===================================================== */
  function normalizarDataUltimaLocacao(valor) {
    if (!valor) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return valor;
    }

    const match = valor.match(/\d+/);
    if (match) {
      const dias = parseInt(match[0], 10);
      const d = new Date();
      d.setDate(d.getDate() - dias);
      return d.toISOString().slice(0, 10);
    }

    return null;
  }

  /* =====================================================
     VALIDAÇÕES – LOCAIS
  ===================================================== */

  // remove tudo que não é número
  function soNumeros(v) {
    return (v || "").replace(/\D/g, "");
  }

  /* ---------- CPF ---------- */
  function validarCPF(cpf) {
    cpf = soNumeros(cpf);

    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;

    let soma = 0;
    let resto;

    for (let i = 1; i <= 9; i++) {
      soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    }

    resto = (soma * 10) % 11;
    if (resto >= 10) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;

    soma = 0;
    for (let i = 1; i <= 10; i++) {
      soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    }

    resto = (soma * 10) % 11;
    if (resto >= 10) resto = 0;
    if (resto !== parseInt(cpf.substring(10, 11))) return false;

    return true;
  }

  /* ---------- EMAIL ---------- */
  function validarEmail(email) {
    if (!email) return false;
    email = email.trim().toLowerCase();

    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  /* ---------- TELEFONE (BR) ---------- */
  function validarTelefoneBR(tel) {
    tel = soNumeros(tel);

    if (tel.length < 10 || tel.length > 11) return false;
    if (tel[0] === "0") return false;
    if (tel.length === 11 && tel[2] !== "9") return false;

    return true;
  }

  /* ---------- TAGS ---------- */
  function validarTagsObrigatorias() {
    let valido = true;

    document.querySelectorAll(".tag-group").forEach(group => {
      const groupName = group.dataset.group;
      if (!groupName) return;

      const selecionadas = group.querySelectorAll(".tag.selected");
      if (selecionadas.length === 0) valido = false;
    });

    if (!valido) {
      mostrarAlerta("Selecione pelo menos uma opção em cada grupo de tags.");
      return false;
    }

    return true;
  }

  /* ---------- VALIDAÇÃO COMPLETA DO LOCAL ---------- */
function validarLocalCompleto() {
  const nome = document.getElementById("locaisNome");
  const cpfCnpj = document.getElementById("locaisCpfCnpj");
  const email = document.getElementById("locaisEmail");
  const telefone = document.getElementById("locaisTelefone");
  const numeroEndereco = document.getElementById("locaisNumeroEndereco");
  const pontoReferencia = document.getElementById("locaisPontoReferencia");
  const status = document.getElementById("locaisStatus");

  if (!nome.value.trim()) {
    mostrarAlerta("Nome / Razão Social é obrigatório");
    nome.focus();
    return false;
  }

  if (!cpfCnpj.value.trim()) {
    mostrarAlerta("CPF / CNPJ é obrigatório");
    cpfCnpj.focus();
    return false;
  }

  if (
    locaisTipoPessoa.value === "Pessoa Física" &&
    !validarCPF(cpfCnpj.value)
  ) {
    mostrarAlerta("CPF inválido. Verifique os números.");
    cpfCnpj.focus();
    return false;
  }

  if (!validarEmail(email.value)) {
    mostrarAlerta("Email inválido. Verifique e tente novamente.");
    email.focus();
    return false;
  }

  if (!validarTelefoneBR(telefone.value)) {
    mostrarAlerta("Telefone inválido. Use DDD + número.");
    telefone.focus();
    return false;
  }

if (!window.enderecoSelecionadoGoogle) {
  mostrarAlerta("Selecione um endereço válido da lista do Google.");
  return false;
}

  if (localGeoState.lat === null || localGeoState.lng === null) {
    mostrarAlerta("Selecione um endereço do Google ou marque o ponto correto no mapa.");
    return false;
  }

  if (localGeoState.calculating) {
    mostrarAlerta("Aguarde o cálculo da distância do galpão terminar.");
    return false;
  }

  if (localGeoState.distanciaKm === null) {
    mostrarAlerta("A distância do galpão ainda não foi calculada. Selecione o endereço novamente ou marque o ponto no mapa.");
    return false;
  }


  if (!numeroEndereco.value.trim()) {
    mostrarAlerta("Número do endereço é obrigatório.");
    numeroEndereco.focus();
    return false;
  }

  if (!pontoReferencia.value.trim()) {
    mostrarAlerta("Ponto de referência é obrigatório.");
    pontoReferencia.focus();
    return false;
  }

  if (!status.value) {
    mostrarAlerta("Status do local é obrigatório.");
    status.focus();
    return false;
  }

  return true;
}

  /* =====================================================
     SUPABASE
  ===================================================== */
  if (!window.supabaseClient) {
    console.error("SupabaseClient não encontrado");
    return;
  }

  const supabase = window.supabaseClient;


/* =====================================================
   EMPRESA CACHE (SPA SAFE)
===================================================== */
async function getEmpresaIdCache() {

  if (window.__empresa_id_cache) {
    return window.__empresa_id_cache;
  }

  const { data: sessionData, error } =
    await supabase.auth.getSession();

  if (error || !sessionData?.session?.user) {
    throw new Error("Usuário não autenticado");
  }

  const userId = sessionData.session.user.id;

  const { data, error: empresaError } = await supabase
    .from("usuarios_empresas")
    .select("empresa_id")
    .eq("user_id", userId)
    .single();

  if (empresaError || !data?.empresa_id) {
    throw new Error("Empresa não encontrada");
  }

  window.__empresa_id_cache = data.empresa_id;

  return data.empresa_id;
}
/* =====================================================
   ESTADO
===================================================== */
let localAtualId = null;
const modal = document.getElementById("locais-modal");
let locaisCache = [];
const GALPAO_ORIGEM = "Chiavari Eventos, Estrada Uniao e Industria, Itaipava, Petropolis - RJ, Brasil";
const GALPAO_COORDS = { lat: -22.3952, lng: -43.1348 };
const localGeoState = {
  lat: null,
  lng: null,
  placeId: "",
  distanciaKm: null,
  distanciaTexto: "",
  calculadaEm: null,
  map: null,
  marker: null,
  mapClickListener: null,
  calculating: false
};

function numeroGeo(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatarCoordenada(value) {
  const number = numeroGeo(value);
  return number === null ? "-" : number.toFixed(6);
}

function formatarKmTexto(km) {
  const number = numeroGeo(km);
  if (number === null) return "";
  return `${number.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })} km`;
}

function resetLocalGeoState() {
  localGeoState.lat = null;
  localGeoState.lng = null;
  localGeoState.placeId = "";
  localGeoState.distanciaKm = null;
  localGeoState.distanciaTexto = "";
  localGeoState.calculadaEm = null;
  localGeoState.calculating = false;
  if (localGeoState.marker) {
    localGeoState.marker.setMap(null);
    localGeoState.marker = null;
  }
  if (localGeoState.map) {
    atualizarMapaLocal();
  }
  renderLocalGeoCard();
}

function preencherLocalGeoState(local = {}) {
  localGeoState.lat = numeroGeo(local.latitude);
  localGeoState.lng = numeroGeo(local.longitude);
  localGeoState.placeId = local.google_place_id || "";
  localGeoState.distanciaKm = numeroGeo(local.distancia_galpao_km);
  localGeoState.distanciaTexto = local.distancia_galpao_texto || formatarKmTexto(localGeoState.distanciaKm);
  localGeoState.calculadaEm = local.distancia_calculada_em || null;
  renderLocalGeoCard();
}

function renderLocalGeoCard() {
  const distanciaTexto = document.getElementById("locaisDistanciaTexto");
  const distanciaHint = document.getElementById("locaisDistanciaHint");
  const distanciaBadge = document.getElementById("locaisDistanciaBadge");
  const latTexto = document.getElementById("locaisLatitudeTexto");
  const lngTexto = document.getElementById("locaisLongitudeTexto");

  if (distanciaTexto) {
    distanciaTexto.textContent = localGeoState.calculating
      ? "Calculando..."
      : (localGeoState.distanciaTexto || "-");
  }

  if (distanciaHint) {
    distanciaHint.textContent = localGeoState.distanciaKm !== null
      ? "Distancia calculada automaticamente e salva para uso nos pedidos."
      : "Selecione um endereco ou marque o ponto no mapa para calcular.";
  }

  if (distanciaBadge) {
    distanciaBadge.classList.toggle("hidden", localGeoState.distanciaKm === null);
  }

  if (latTexto) latTexto.textContent = formatarCoordenada(localGeoState.lat);
  if (lngTexto) lngTexto.textContent = formatarCoordenada(localGeoState.lng);
}

function setMarkerDraggable() {
  if (localGeoState.marker) {
    localGeoState.marker.setDraggable(!modal.classList.contains("readonly"));
  }
}

function vincularCliqueMapaLocal() {
  if (!localGeoState.map || localGeoState.mapClickListener) return;

  localGeoState.mapClickListener = localGeoState.map.addListener("click", async (event) => {
    if (modal.classList.contains("readonly")) return;
    await selecionarPontoNoMapa(event?.latLng);
  });
}

function atualizarMapaLocal() {
  const mapEl = document.getElementById("locaisMapa");
  if (!mapEl || !window.google?.maps) return;

  const hasPoint = localGeoState.lat !== null && localGeoState.lng !== null;
  const position = hasPoint
    ? { lat: localGeoState.lat, lng: localGeoState.lng }
    : GALPAO_COORDS;

  if (!localGeoState.map) {
    localGeoState.map = new google.maps.Map(mapEl, {
      center: position,
      zoom: hasPoint ? 15 : 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });
  } else {
    localGeoState.map.setCenter(position);
    localGeoState.map.setZoom(hasPoint ? 15 : 12);
  }

  vincularCliqueMapaLocal();

  if (!hasPoint) return;

  if (!localGeoState.marker) {
    localGeoState.marker = new google.maps.Marker({
      map: localGeoState.map,
      position,
      draggable: !modal.classList.contains("readonly"),
      title: "Ponto do evento"
    });

    localGeoState.marker.addListener("dragend", async () => {
      const pos = localGeoState.marker.getPosition();
      await selecionarPontoNoMapa(pos);
    });
  } else {
    localGeoState.marker.setPosition(position);
    localGeoState.marker.setMap(localGeoState.map);
  }

  setMarkerDraggable();
}

async function initMapaLocal() {
  if (!window.google?.maps) {
    try {
      await window.carregarGooglePlaces?.();
    } catch (error) {
      console.warn("Google Maps nao carregado para o mapa do local:", error);
      return;
    }
  }
  atualizarMapaLocal();
}

async function calcularDistanciaGalpaoAteLocal(latitude, longitude) {
  const lat = numeroGeo(latitude);
  const lng = numeroGeo(longitude);
  if (lat === null || lng === null) throw new Error("Coordenadas ausentes.");

  const session = await supabase.auth.getSession?.();
  const token = session?.data?.session?.access_token;
  const supabaseUrl = supabase.supabaseUrl || "https://awemuohtvwvrdzfxwrmd.supabase.co";
  const supabaseKey = supabase.supabaseKey || "sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ";
  const destino = `${lat},${lng}`;

  const response = await fetch(`${supabaseUrl}/functions/v1/calcular-distancia`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseKey,
      "Authorization": `Bearer ${token || supabaseKey}`
    },
    body: JSON.stringify({
      origem: GALPAO_ORIGEM,
      destino,
      origin: GALPAO_ORIGEM,
      destination: destino,
      latitudeDestino: lat,
      longitudeDestino: lng
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false || data?.km == null) {
    throw new Error(data?.error || "Nao foi possivel calcular a distancia.");
  }

  const km = Number(Number(data.km).toFixed(1));
  return { km, texto: formatarKmTexto(km) };
}

async function aplicarPontoLocal({ lat, lng, placeId = "", calcular = true }) {
  localGeoState.lat = numeroGeo(lat);
  localGeoState.lng = numeroGeo(lng);
  localGeoState.placeId = placeId || localGeoState.placeId || "";

  if (localGeoState.lat === null || localGeoState.lng === null) {
    renderLocalGeoCard();
    return;
  }

  atualizarMapaLocal();

  if (!calcular) {
    renderLocalGeoCard();
    return;
  }

  try {
    localGeoState.calculating = true;
    renderLocalGeoCard();
    const distancia = await calcularDistanciaGalpaoAteLocal(localGeoState.lat, localGeoState.lng);
    localGeoState.distanciaKm = distancia.km;
    localGeoState.distanciaTexto = distancia.texto;
    localGeoState.calculadaEm = new Date().toISOString();
  } catch (error) {
    console.warn("Nao foi possivel calcular distancia do local:", error);
    localGeoState.distanciaKm = null;
    localGeoState.distanciaTexto = "";
    localGeoState.calculadaEm = null;
    if (typeof window.alerta === "function") {
      window.alerta("Nao foi possivel calcular a distancia agora.", "Local", "aviso");
    }
  } finally {
    localGeoState.calculating = false;
    renderLocalGeoCard();
  }
}

async function centralizarMapaNoEndereco() {
  if (localGeoState.lat === null || localGeoState.lng === null) {
    const endereco = document.getElementById("locais-endereco")?.value?.trim();
    if (!endereco) {
      mostrarAlerta("Selecione um endereço no Google para centralizar o mapa.");
      return;
    }

    try {
      const geocoded = await geocodificarEnderecoLocal(endereco);
      window.enderecoSelecionadoGoogle = true;
      await aplicarPontoLocal({
        lat: geocoded.lat,
        lng: geocoded.lng,
        placeId: geocoded.placeId || localGeoState.placeId,
        calcular: true
      });
      return;
    } catch (error) {
      console.warn("Nao foi possivel centralizar no endereco:", error);
      mostrarAlerta("Não consegui localizar esse endereço no mapa. Selecione uma opção da lista do Google.");
      return;
    }
  }

  atualizarMapaLocal();
}

async function selecionarPontoNoMapa(latLng) {
  if (!latLng) {
    mostrarAlerta("Não foi possível identificar o ponto no mapa.");
    return;
  }

  await aplicarPontoLocal({
    lat: latLng.lat(),
    lng: latLng.lng(),
    placeId: localGeoState.placeId,
    calcular: true
  });
}

document.getElementById("locaisCentralizarEndereco")
  ?.addEventListener("click", centralizarMapaNoEndereco);

/* =====================================================
   MODAL
===================================================== */
function Locais_openAdd() {
  localAtualId = null;

  modal.style.display = "flex";

  window.enderecoSelecionadoGoogle = false;
  resetLocalGeoState();

  // cria input limpo
  criarInputEndereco("");

  document
    .querySelectorAll("#locais-modal input, #locais-modal textarea")
    .forEach(e => {
      e.value = "";
      e.readOnly = false;
    });

  document
    .querySelectorAll("#locais-modal select")
    .forEach(e => (e.disabled = false));

document.querySelectorAll(".tag").forEach(tag => {
  tag.classList.remove("selected");
  tag.style.pointerEvents = "auto";
});


  document.querySelector(".btn-save").style.display = "inline-block";

  setTimeout(() => {
    initEnderecoAutocomplete();
    initMapaLocal();
  }, 200);
}

function Locais_enableEdit() {
  resetEnderecoAutocomplete(); // limpa autocomplete antigo
  setReadOnly(false);

  // 🔒 endereço que veio do banco é válido até o usuário alterar
  window.enderecoSelecionadoGoogle = true;

  setTimeout(() => {
    if (window.google?.maps?.places) initEnderecoAutocomplete();
    initMapaLocal();
  }, 300);
}

function Locais_closeModal() {
  modal.style.display = "none";
}

function setReadOnly(v) {
  modal.classList.toggle("readonly", v);

  document
    .querySelectorAll("#locais-modal input, #locais-modal textarea")
    .forEach(e => (e.readOnly = v));

  document
    .querySelectorAll("#locais-modal select")
    .forEach(e => (e.disabled = v));

document.querySelectorAll(".tag").forEach(tag => {
  tag.style.pointerEvents = "auto";
  tag.style.opacity = "1";
});


  document.querySelector(".btn-save").style.display = v ? "none" : "inline-block";
  document.querySelector(".btn-delete").style.display = v ? "inline-block" : "none";
  setMarkerDraggable();
}

/* =====================================================
   VALIDAÇÃO
===================================================== */
function mostrarAlerta(msg) {
  // 🔒 tira o foco de qualquer campo (derruba o autocomplete)
  try { document.activeElement?.blur(); } catch (e) {}

  // 🔒 esconde a lista do Google Places
  const pac = document.querySelector(".pac-container");
  if (pac) pac.style.display = "none";

  if (typeof window.alerta === "function") {
    window.alerta(msg, "Atenção", "aviso");
    return;
  }

  alert(msg);
}

function fecharValidationModal() {
  const modal = document.getElementById("locaisValidationModal");
  if (modal) modal.style.display = "none";

  // ✅ NÃO reabre automaticamente o pac-container
  // Ele volta sozinho quando o usuário focar/digitar no endereço.
}

window.fecharValidationModal = fecharValidationModal;

/* =====================================================
   TAGS
===================================================== */
function coletarTagsSelecionadas() {
  const tags = {};

  document.querySelectorAll(".tag-group").forEach(group => {
    const groupName = group.dataset.group;
    if (!groupName) return;

    const selecionadas = Array.from(
      group.querySelectorAll(".tag.selected")
    ).map(tag => tag.textContent.trim());

    if (group.classList.contains("single")) {
      tags[groupName] = selecionadas[0] || null;
    } else {
      tags[groupName] = selecionadas;
    }
  });

  return tags;
}

/* =====================================================
   DUPLICIDADE – LOCAIS
===================================================== */
async function verificarDuplicidadeLocal({ cpf, nome, empresaId, localId }) {
  const cpfLimpo = soNumeros(cpf);
  const nomeLimpo = nome.trim();

  // 🔒 VERIFICA CPF DUPLICADO (MESMA EMPRESA)
  if (cpfLimpo) {
    let query = window.supabaseClient
      .from("locais_empresas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("cpf_cnpj", cpfLimpo);

    if (localId) {
      query = query.neq("id", localId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Erro CPF duplicado:", error);
      return "Erro ao verificar CPF.";
    }

    if (data && data.length > 0) {
      return "Já existe um local com este CPF/CNPJ cadastrado nesta empresa.";
    }
  }

  // 🔒 VERIFICA NOME DUPLICADO (MESMA EMPRESA)
  if (nomeLimpo) {
    let query = window.supabaseClient
      .from("locais_empresas")
      .select("id")
      .eq("empresa_id", empresaId)
      .ilike("nome_razao", nomeLimpo);

    if (localId) {
      query = query.neq("id", localId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Erro nome duplicado:", error);
      return "Erro ao verificar nome.";
    }

    if (data && data.length > 0) {
      return "Já existe um local com este nome cadastrado nesta empresa.";
    }
  }

  return null;
}
/* =====================================================
   SALVAR
===================================================== */

async function Locais_salvar() {
  if (!validarLocalCompleto()) return;
  if (!validarTagsObrigatorias()) return;

  try {
    const empresaId = await getEmpresaIdCache();

    // 🔒 VERIFICA CPF OU NOME JÁ CADASTRADOS
const existe = await verificarDuplicidadeLocal({
  cpf: soNumeros(document.getElementById("locaisCpfCnpj").value),
  nome: document.getElementById("locaisNome").value,
  empresaId,
  localId: localAtualId
});


    if (existe) {
      mostrarAlerta(existe);
      return;
    }

const payload = {
  nome_razao: document.getElementById("locaisNome").value,
  cpf_cnpj: soNumeros(document.getElementById("locaisCpfCnpj").value),
  telefone: document.getElementById("locaisTelefone").value,
  email: document.getElementById("locaisEmail").value,
  endereco: document.getElementById("locais-endereco").value,
  numero_endereco: document.getElementById("locaisNumeroEndereco").value,
  ponto_referencia: document.getElementById("locaisPontoReferencia").value,
  status: document.getElementById("locaisStatus").value,
  ultima_locacao: normalizarDataUltimaLocacao(
    document.getElementById("locaisUltimaLocacao").value
  ),
  tipo_pessoa:
    locaisTipoPessoa.value === "Pessoa Jurídica" ? "PJ" : "PF",
  inscricao_estadual:
    document.getElementById("locaisInscricaoEstadual")?.value || null,
  latitude: localGeoState.lat,
  longitude: localGeoState.lng,
  distancia_galpao_km: localGeoState.distanciaKm,
  distancia_galpao_texto: localGeoState.distanciaTexto || null,
  distancia_calculada_em: localGeoState.calculadaEm,
  google_place_id: localGeoState.placeId || null,
  empresa_id: empresaId,
  tags: coletarTagsSelecionadas()
};


    let query = supabase.from("locais_empresas");
    let result;

    if (localAtualId) {
      result = await query.update(payload).eq("id", localAtualId);
    } else {
      result = await query.insert(payload);
    }

    if (result.error) {
      mostrarAlerta("Erro ao salvar local.");
      return;
    }

    Locais_closeModal();
    Locais_carregar();

  } catch (err) {
    mostrarAlerta(err.message || "Erro ao salvar local");
  }
}

function abrirDetalhesLocal(local) {
  localAtualId = local.id;

  modal.style.display = "flex";
  preencherLocalGeoState(local);

  const campos = {
    tipoPessoa: document.getElementById("locaisTipoPessoa"),
    cpfCnpj: document.getElementById("locaisCpfCnpj"),
    nome: document.getElementById("locaisNome"),
    telefone: document.getElementById("locaisTelefone"),
    email: document.getElementById("locaisEmail"),
    inscricao: document.getElementById("locaisInscricaoEstadual"),
    numero: document.getElementById("locaisNumeroEndereco"),
    referencia: document.getElementById("locaisPontoReferencia"),
    ultimaLocacao: document.getElementById("locaisUltimaLocacao"),
    status: document.getElementById("locaisStatus")
  };

  /* =============================
     GARANTE VISUAL ANTES DO READONLY
  ============================= */
  Object.values(campos).forEach(el => {
    if (!el) return;
    el.removeAttribute("readonly");
    el.removeAttribute("disabled");
  });

  /* =============================
     ENDEREÇO
  ============================= */
  criarInputEndereco(local.endereco || "");
  setTimeout(() => {
    initEnderecoAutocomplete();
    initMapaLocal();
  }, 200);

  /* =============================
     PREENCHIMENTO
  ============================= */
  if (campos.tipoPessoa) {
    campos.tipoPessoa.value =
      local.tipo_pessoa === "PJ" ? "Pessoa Jurídica" : "Pessoa Física";
  }

  if (campos.cpfCnpj) campos.cpfCnpj.value = local.cpf_cnpj || "";
  if (campos.nome) campos.nome.value = local.nome_razao || "";
  if (campos.telefone) campos.telefone.value = local.telefone || "";
  if (campos.email) campos.email.value = local.email || "";
  if (campos.inscricao) campos.inscricao.value = local.inscricao_estadual || "";

  if (campos.numero) campos.numero.value = local.numero_endereco || "";
  if (campos.referencia) campos.referencia.value = local.ponto_referencia || "";

  if (campos.ultimaLocacao) campos.ultimaLocacao.value = local.ultima_locacao || "";
  if (campos.status) campos.status.value = local.status || "Ativo";

  /* =============================
     TAGS (RESET + APLICAÇÃO)
  ============================= */
  document.querySelectorAll(".tag").forEach(tag =>
    tag.classList.remove("selected")
  );

  if (local.tags && typeof local.tags === "object") {
    document.querySelectorAll(".tag-group").forEach(group => {
      const groupName = group.dataset.group;
      const valor = local.tags[groupName];
      if (!valor) return;

      const valores = Array.isArray(valor) ? valor : [valor];

      valores.forEach(v => {
        const tagEl = [...group.querySelectorAll(".tag")]
          .find(t => t.textContent.trim() === v);

        if (tagEl) tagEl.classList.add("selected");
      });
    });
  }

  /* =============================
     VOLTA PARA VISUALIZAÇÃO
  ============================= */
  setTimeout(() => {
    setReadOnly(true);
  }, 50);

  window.enderecoSelecionadoGoogle = true;
}


async function Locais_excluir() {
  if (!localAtualId) return;

  const confirmou = await window.confirmarGlobal?.(
    "Deseja realmente excluir este local?",
    "Confirmar exclusão",
    { confirmarTexto: "Excluir", tipo: "error" }
  );

  if (!confirmou) return;

  const { error } = await supabase
    .from("locais_empresas")
    .delete()
    .eq("id", localAtualId);

  if (error) {
    mostrarAlerta("Erro ao excluir local.");
    return;
  }

  Locais_closeModal();
  Locais_carregar();
}
/* =====================================================
   LISTAGEM
===================================================== */
async function Locais_carregar() {
  try {
    const empresaId = await getEmpresaIdCache();

    const { data, error } = await supabase
      .from("locais_empresas")
.select(`
  id,
  nome_razao,
  cpf_cnpj,
  telefone,
  email,
  endereco,
  numero_endereco,
  ponto_referencia,
  tipo_pessoa,
  inscricao_estadual,
  ultima_locacao,
  status,
  latitude,
  longitude,
  distancia_galpao_km,
  distancia_galpao_texto,
  distancia_calculada_em,
  google_place_id,
  tags
`)
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false });

    if (!error) {
      locaisCache = (data || []).map(l => {
        // 🔒 garante que tags seja objeto e não string
        if (typeof l.tags === "string") {
          try {
            l.tags = JSON.parse(l.tags);
          } catch (e) {
            l.tags = {};
          }
        }
        return l;
      });

      Locais_aplicarFiltros();
    }
  } catch {}
}

async function Locais_abrirDetalhesPorIdOuNome({ id, nome } = {}) {
  const termoNome = String(nome || "").trim().toLowerCase();
  let local = (window.locaisCache || locaisCache || []).find((item) => {
    if (id && String(item.id) === String(id)) return true;
    return termoNome && String(item.nome_razao || "").trim().toLowerCase() === termoNome;
  });

  if (!local || !("endereco" in local)) {
    const empresaId = await getEmpresaIdCache();
    let query = supabase
      .from("locais_empresas")
      .select("*")
      .eq("empresa_id", empresaId);

    query = id
      ? query.eq("id", id)
      : query.eq("nome_razao", nome);

    const { data, error } = await query.maybeSingle();

    if (error) {
      mostrarAlerta("Nao foi possivel abrir o cadastro do local.");
      return;
    }

    local = data;
  }

  if (!local) {
    mostrarAlerta("Local nao encontrado no cadastro.");
    return;
  }

  if (typeof local.tags === "string") {
    try {
      local.tags = JSON.parse(local.tags);
    } catch {
      local.tags = {};
    }
  }

  abrirDetalhesLocal(local);
}

function calcularInatividade(ultimaLocacao) {
  if (!ultimaLocacao) return "-";

  const hoje = new Date();
  const ultima = new Date(ultimaLocacao);

  const diffMs = hoje - ultima;
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDias + " dias";
}

function extrairTag(tags, nomeGrupo) {
  if (!tags) return "-";

  // procura ignorando maiúscula/minúscula
  const chave = Object.keys(tags).find(
    k => k.toLowerCase() === nomeGrupo.toLowerCase()
  );

  if (!chave) return "-";

  const valor = tags[chave];

  return Array.isArray(valor)
    ? valor.join(", ")
    : valor;
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderizarTagsComoCards(tags, grupo, classe) {
  if (!tags) return "-";

  const normalizar = str =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const chave = Object.keys(tags).find(
    k => normalizar(k) === normalizar(grupo)
  );

  if (!chave) return "-";

  const valores = Array.isArray(tags[chave])
    ? tags[chave]
    : [tags[chave]];

  return `
    <div class="table-tags">
      ${valores
        .map(
          v => `<span class="table-tag ${classe}">${esc(v)}</span>`
        )
        .join("")}
    </div>
  `;
}

function renderizarTabelaLocais(locais) {
  const tbody = document.getElementById("locaisTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  const paginaLocais = window.EasyLocListPager?.slice(
    "cadastro-locais",
    locais,
    renderizarTabelaLocais
  ) || locais;

  paginaLocais.forEach(l => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";

    const status = calcularStatusAutomatico(l);
    const inatividade = calcularInatividade(l.ultima_locacao);

    tr.innerHTML = `
      <td>${esc(l.nome_razao || "-")}</td>
      <td>${esc(l.cpf_cnpj || "-")}</td>
      <td>${esc(l.telefone || "-")}</td>
      <td>${esc(l.email || "-")}</td>

      <td>${renderizarTagsComoCards(l.tags, "tipo", "tag-tipo")}</td>
      <td>${renderizarTagsComoCards(l.tags, "canal", "tag-canal")}</td>
      <td>${renderizarTagsComoCards(l.tags, "orcamento", "tag-orcamento")}</td>

      <td>${inatividade}</td>

      <td>
        <span class="status ${esc(String(status).toLowerCase())}">${esc(status)}</span>
      </td>
    `;

    tr.addEventListener("click", () => abrirDetalhesLocal(l));
    tbody.appendChild(tr);
  });

  window.EasyLocListPager?.render(
    "cadastro-locais",
    tbody,
    locais,
    renderizarTabelaLocais
  );
}

function Locais_aplicarFiltros() {
  const texto =
    document.getElementById("locaisSearchInput")?.value.toLowerCase() || "";
  const status =
    document.getElementById("locaisStatusFilter")?.value || "";
  const inatividade =
    document.getElementById("locaisInactiveFilter")?.value || "";
  const estilo =
    document.getElementById("locaisStyleFilter")?.value || "";
  const orcamento =
    document.getElementById("locaisBudgetFilter")?.value || "";

  let filtrados = [...locaisCache];

  // 🔍 BUSCA
  if (texto) {
    filtrados = filtrados.filter(l =>
      l.nome_razao?.toLowerCase().includes(texto) ||
      l.cpf_cnpj?.includes(texto) ||
      l.email?.toLowerCase().includes(texto)
    );
  }

  // 🟢 STATUS
  if (status) {
    filtrados = filtrados.filter(l => {
      return calcularStatusAutomatico(l) === status;
    });
  }

  // ⏱️ INATIVIDADE
  if (inatividade) {
    filtrados = filtrados.filter(l => {
      if (!l.ultima_locacao) return false;

      const dias =
        (new Date() - new Date(l.ultima_locacao)) /
        (1000 * 60 * 60 * 24);

      if (inatividade === "30") return dias <= 30;
      if (inatividade === "90") return dias > 30 && dias <= 90;
      if (inatividade === "180") return dias > 90;
      return true;
    });
  }

// 🏷️ TIPO (LOCAIS)
if (estilo) {
  filtrados = filtrados.filter(l => {
    if (!l.tags) return false;

    const tipo = l.tags.tipo;
    if (Array.isArray(tipo)) return tipo.includes(estilo);
    return tipo === estilo;
  });
}


// 💰 ORÇAMENTO
if (orcamento) {
  filtrados = filtrados.filter(l => {
    if (!l.tags) return false;
    return l.tags.orcamento === orcamento;
  });
}


  window.locaisFiltrados = filtrados;
  renderizarTabelaLocais(filtrados);
}
/* =====================================================
   TAGS
===================================================== */
if (!window.__locaisClickBound) {

  window.__locaisClickBound = true;

  document.addEventListener("click", e => {

    const tag = e.target.closest(".tag");
    if (!tag) return;

    if (tag.closest(".modal.readonly")) return;

    const group = tag.closest(".tag-group");

    if (group?.classList.contains("single")) {
      group.querySelectorAll(".tag")
        .forEach(t => t.classList.remove("selected"));
    }

    tag.classList.toggle("selected");
  });

}

/* =====================================================
   EXPORT
===================================================== */
window.Locais_openAdd = Locais_openAdd;
window.Locais_enableEdit = Locais_enableEdit;
window.Locais_closeModal = Locais_closeModal;
window.Locais_salvar = Locais_salvar;
window.Locais_excluir = Locais_excluir;
window.Locais_aplicarFiltros = Locais_aplicarFiltros;
window.Locais_abrirDetalhesPorIdOuNome = Locais_abrirDetalhesPorIdOuNome;
window.__locaisAplicarPontoLocal = aplicarPontoLocal;
window.__locaisResetLocalGeoState = resetLocalGeoState;
window.__locaisMostrarAlerta = mostrarAlerta;

// inicialização
// inicialização
Locais_carregar();

/* =====================================================
   DESTROY DO MÓDULO LOCAIS (SPA SAFE)
===================================================== */
window.__activeModuleDestroy = function(){

  console.log("🧹 destroy Cadastro Locais");

  // limpa Google Places
  resetEnderecoAutocomplete();

  // libera flag SPA
  window.__locaisModuleLoaded = false;

};

window.finalizarCarregamentoModulo?.();
}

window.__moduleInit = initCadastroLocais;

window.__locaisModuleLoaded = true;

/* =====================================================
   GOOGLE PLACES – AUTOCOMPLETE + VALIDAÇÃO
===================================================== */

// 🔒 estado global (SPA safe)
window.enderecoAutocomplete = window.enderecoAutocomplete || null;
window.enderecoSelecionadoGoogle = window.enderecoSelecionadoGoogle || false;

function resetEnderecoAutocomplete() {

  if (window.enderecoAutocomplete) {

    try {
      google.maps.event.clearInstanceListeners(
        window.enderecoAutocomplete
      );
    } catch(e){}

    window.enderecoAutocomplete = null;
  }

  window.enderecoSelecionadoGoogle = false;
}

async function geocodificarEnderecoLocal(endereco) {
  const address = String(endereco || "").trim();
  if (!address) throw new Error("Endereço vazio.");

  if (!window.google?.maps) {
    await window.carregarGooglePlaces?.();
  }

  if (!window.google?.maps?.Geocoder) {
    throw new Error("Google Maps Geocoder indisponivel.");
  }

  const geocoder = new google.maps.Geocoder();

  return new Promise((resolve, reject) => {
    geocoder.geocode(
      {
        address,
        componentRestrictions: { country: "BR" }
      },
      (results, status) => {
        const result = results?.[0];
        const location = result?.geometry?.location;

        if (status !== "OK" || !location) {
          reject(new Error(`Endereco nao encontrado no Google (${status}).`));
          return;
        }

        resolve({
          formattedAddress: result.formatted_address || address,
          lat: location.lat(),
          lng: location.lng(),
          placeId: result.place_id || ""
        });
      }
    );
  });
}

function initEnderecoAutocomplete() {

  const input = document.getElementById("locais-endereco");
  if (!input) return;

  // ✅ limpa SEMPRE
  resetEnderecoAutocomplete();

  if (!window.google?.maps?.places) {
    console.error("Google Places não carregado");
    window.carregarGooglePlaces?.()
      .then(() => initEnderecoAutocomplete())
      .catch((error) => {
        console.error("Google Places nao carregado:", error);
        window.__locaisMostrarAlerta?.("Google Places nao configurado. Verifique a chave do Google Maps.");
      });
    return;
  }

  window.enderecoAutocomplete =
    new google.maps.places.Autocomplete(input, {
      componentRestrictions: { country: "br" },
      fields: ["formatted_address", "geometry", "place_id", "name"]
    });

  window.enderecoAutocomplete.addListener(
    "place_changed",
    async () => {
      const place =
        window.enderecoAutocomplete.getPlace();

      if (!place?.formatted_address) {
        window.enderecoSelecionadoGoogle = false;
        return;
      }

      input.value = place.formatted_address;
      const location = place.geometry?.location;

      if (location) {
        window.enderecoSelecionadoGoogle = true;
        await window.__locaisAplicarPontoLocal?.({
          lat: location.lat(),
          lng: location.lng(),
          placeId: place.place_id || "",
          calcular: true
        });
        return;
      }

      try {
        const geocoded = await geocodificarEnderecoLocal(place.formatted_address);
        window.enderecoSelecionadoGoogle = true;
        input.value = geocoded.formattedAddress;
        await window.__locaisAplicarPontoLocal?.({
          lat: geocoded.lat,
          lng: geocoded.lng,
          placeId: place.place_id || geocoded.placeId || "",
          calcular: true
        });
      } catch (error) {
        console.warn("Nao foi possivel localizar o endereco selecionado:", error);
        window.enderecoSelecionadoGoogle = false;
        window.__locaisResetLocalGeoState?.();
        window.__locaisMostrarAlerta?.("Não consegui localizar esse endereço no mapa. Selecione uma opção da lista do Google.");
      }
    }
  );

  input.addEventListener("input", () => {
    window.enderecoSelecionadoGoogle = false;
    window.__locaisResetLocalGeoState?.();
  });

  if (input.value.trim()) {
    window.enderecoSelecionadoGoogle = true;
  }

  console.log("✅ Google Places OK");
}

/* =====================================================
   STATUS AUTOMÁTICO
===================================================== */
function calcularStatusAutomatico(local) {
  if (!local.ultima_locacao) return "Ativo";

  const hoje = new Date();
  const ultima = new Date(local.ultima_locacao);
  const diffDias = Math.floor(
    (hoje - ultima) / (1000 * 60 * 60 * 24)
  );

  if (diffDias > 120) return "Inativo";
  if (diffDias > 90) return "Morno";

  return "Ativo";
}

/* =====================================================
   IMPRESSÃO
===================================================== */
function Locais_imprimir() {
  const locais = window.locaisFiltrados || locaisCache || [];

  if (!locais.length) {
    mostrarAlerta("Nenhum local para imprimir.");
    return;
  }

  const win = window.open("", "_blank");

  win.document.write(`
    <html>
      <head>
        <title>Locais • EasyLoc</title>
        <style>
          ${Locais_css_impressao()}
        </style>
      </head>
      <body>
        <h1>Locais Cadastrados</h1>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF / CNPJ</th>
              <th>Telefone</th>
              <th>Email</th>
              <th>Endereço</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${locais.map(l => Locais_linha_impressao(l)).join("")}
          </tbody>
        </table>
      </body>
    </html>
  `);

  win.document.close();

  win.onload = () => {
    win.focus();
    win.print();
  };
}

function Locais_css_impressao() {
  return `
    @page {
      size: A4;
      margin: 20mm;
    }

    body {
      font-family: 'Inter', Arial, sans-serif;
      color: #1f2937;
      background: #ffffff;
    }

    h1 {
      color: #1f3b73;
      border-bottom: 3px solid #ff7a00;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    thead {
      background: #1f3b73;
      color: #ffffff;
    }

    th, td {
      padding: 8px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
    }

    tr:nth-child(even) {
      background: #f9fafb;
    }

    .status {
      font-weight: 600;
      color: #ff7a00;
    }
  `;
}

function Locais_linha_impressao(l) {
  return `
    <tr>
      <td>${l.nome_razao || "-"}</td>
      <td>${l.cpf_cnpj || "-"}</td>
      <td>${l.telefone || "-"}</td>
      <td>${l.email || "-"}</td>
      <td>${l.endereco || ""} ${l.numero_endereco || ""}</td>
      <td class="status">${calcularStatusAutomatico(l)}</td>
    </tr>
  `;
}


window.Locais_imprimir = function () {
  const lista =
    window.locaisFiltrados ||
    window.locaisCache ||
    [];

  if (!lista.length) {
    mostrarAlerta("Nenhum local para imprimir.");
    return;
  }

  const iframe = document.getElementById("locaisPrintFrame");
  const doc = iframe.contentWindow.document;

  doc.open();
  doc.write(`
    <html>
      <head>
        <title>Locais • EasyLoc</title>
        <style>
          ${Locais_css_impressao()}
        </style>
      </head>
      <body>
${Locais_cabecalho_impressao()}
${Locais_filtros_impressao()}

<table>
  <thead>
    <tr>
      <th>Nome</th>
      <th>CPF / CNPJ</th>
      <th>Telefone</th>
      <th>Email</th>
      <th>Endereço</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    ${lista.map(l => Locais_card_impressao(l)).join("")}
  </tbody>
</table>

      </body>
    </html>
  `);
  doc.close();

  // aguarda renderização antes de imprimir
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, 300);
};

function Locais_cabecalho_impressao() {
  const agora = new Date();
  const dataHora = agora.toLocaleString("pt-BR");

  return `
    <div class="header">
      <div class="logo">
        <img
          src="https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/logos/logo.png"
          alt="EasyLoc"
        >
      </div>

      <div class="meta">
        <div><strong>Relatório de Locais</strong></div>
        <div>Impresso em: ${dataHora}</div>
      </div>
    </div>
  `;
}

function Locais_filtros_impressao() {
  const filtros = [];

  const searchInput = document.getElementById("locaisSearchInput");
  const statusFilter = document.getElementById("locaisStatusFilter");
  const styleFilter = document.getElementById("locaisStyleFilter");
  const budgetFilter = document.getElementById("locaisBudgetFilter");
  const inactiveFilter = document.getElementById("locaisInactiveFilter");

  if (searchInput?.value) filtros.push(`Busca: "${searchInput.value}"`);
  if (statusFilter?.value) filtros.push(`Status: ${statusFilter.value}`);
  if (styleFilter?.value) filtros.push(`Estilo: ${styleFilter.value}`);
  if (budgetFilter?.value) filtros.push(`Orçamento: ${budgetFilter.value}`);
  if (inactiveFilter?.value)
    filtros.push(`Inatividade: ${inactiveFilter.value} dias`);

  if (!filtros.length) {
    filtros.push("Nenhum filtro aplicado");
  }

  return `
    <div class="filters">
      <strong>Filtros aplicados:</strong><br>
      ${filtros.join(" • ")}
    </div>
  `;
}

function Locais_card_impressao(l) {
  return `
    <tr>
      <td>${l.nome_razao || "-"}</td>
      <td>${l.cpf_cnpj || "-"}</td>
      <td>${l.telefone || "-"}</td>
      <td>${l.email || "-"}</td>
      <td>${l.endereco || ""} ${l.numero_endereco || ""}</td>
      <td class="status">${calcularStatusAutomatico(l)}</td>
    </tr>
  `;
}

/* =====================
   MODAL AJUDA
===================== */

function abrirModalAjuda() {
  const modal = document.getElementById("locaisModalAjuda");
  if (modal) modal.style.display = "flex";
}

function fecharModalAjuda() {
  const modal = document.getElementById("locaisModalAjuda");
  if (modal) modal.style.display = "none";

  const iframe = document.getElementById("ajudaIframe");
  if (iframe) iframe.src = "";
}

function trocarVideo(url, el) {
  const iframe = document.getElementById("ajudaIframe");
  if (iframe) iframe.src = url;

  document
    .querySelectorAll(".ajuda-video-item")
    .forEach(item => item.classList.remove("active"));

  if (el) el.classList.add("active");
}

/* =====================
   ENDEREÇO (INPUT DINÂMICO)
===================== */

function criarInputEndereco(valor = "") {
const wrapper = document.getElementById("locais-endereco-wrapper");
  if (!wrapper) return;

  wrapper.innerHTML = "";

  const input = document.createElement("input");
input.id = "locais-endereco";
  input.className = "el-input";
  input.type = "text";
  input.placeholder =
    "Pesquise rua, salão, chácara, buffet, ponto conhecido...";
  input.value = valor || "";
  input.autocomplete = "off";

  wrapper.appendChild(input);
}

/* =====================
   MINI PLAYER (INFORMATIVO)
===================== */

function abrirMiniPlayer() {
  mostrarAlerta(
    "No vídeo do YouTube, clique no ícone Picture-in-Picture (quadrado pequeno) para assistir enquanto usa o sistema."
  );
}

function fecharMiniPlayer() {
  // não utilizado (YouTube controla o PiP)
}
function Locais_fecharValidationModal() {
  const modal = document.getElementById("locaisValidationModal");
  if (modal) modal.style.display = "none";
}
if (!window.__locaisPrintShortcut) {

  window.__locaisPrintShortcut = true;

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
      e.preventDefault();
      window.Locais_imprimir?.();
    }
  });

}
