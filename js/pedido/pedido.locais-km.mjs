import { debounce } from "./pedido.utils.mjs";

const GALPAO_ORIGEM_PADRAO = "Chiavari Eventos, Estrada Uniao e Industria, Itaipava, Petropolis - RJ, Brasil";
const MINI_MAP_CENTER_PADRAO = { lat: -22.3928, lng: -43.1348 };
const pedidoMiniMapState = {
  map: null,
  marker: null,
  localId: null,
  largeMap: null,
  largeMarker: null,
  currentLocal: null,
  supabase: null,
  modalBound: false
};

export function initAutocompleteLocaisEKm({
  supabase,
  localInput,
  localLista,
  localIdHidden,
  obsDiv,
}){
  if(!localInput || !localLista) return;

  let ultimoLocalCalculado = "";

  window.__pedidoRenderizarLocalEvento = (local) => {
    renderizarObservacoesLocal({ local, obsDiv });
    renderizarMiniMapaPedido({ supabase, local });
  };

  const selecionarLocal = async (local) => {
    if(!local) return;

    localInput.value = local.nome_razao || "";
    if(localIdHidden) localIdHidden.value = local.id || "";

    window.__pedidoRenderizarLocalEvento?.(local);

    localLista.innerHTML = "";
    localLista.style.display = "none";

    const chaveLocal = [
      local.id || "",
      local.endereco || "",
      local.numero_endereco || ""
    ].join("|");

    if(chaveLocal === ultimoLocalCalculado) return;
    ultimoLocalCalculado = chaveLocal;

    await calcularKmAutomatico({ supabase, local });
  };

  const buscarLocais = async (termo, exato = false, limite = 10) => {
    const query = supabase
      .from("locais_empresas")
      .select(`
        id,
        nome_razao,
        endereco,
        numero_endereco,
        ponto_referencia,
        latitude,
        longitude,
        distancia_galpao_km,
        distancia_galpao_texto,
        distancia_calculada_em,
        google_place_id,
        tags
      `)
      .eq("empresa_id", window.__CONTEXT?.empresa_id)
      .limit(limite);

    return exato
      ? query.ilike("nome_razao", termo)
      : query.ilike("nome_razao", `%${termo}%`);
  };

  const resolverLocalPorNome = debounce(async () => {
    const termo = (localInput.value || "").trim();
    if(termo.length < 2 || localIdHidden?.value) return;

    const { data, error } = await buscarLocais(termo, true, 1);

    if(error){
      console.error("[EasyLoc Debug]", {
        arquivo: "js/pedido/pedido.locais-km.mjs",
        funcao: "resolverLocalPorNome",
        tabela: "locais_empresas",
        termo,
        erro: error
      });
      return;
    }

    if(data?.[0]){
      await selecionarLocal(data[0]);
    }
  }, 250);

  const doBusca = debounce(async () => {
    const termo = (localInput.value || "").trim();

    if(termo.length < 2){
      localLista.innerHTML = "";
      localLista.style.display = "none";
      return;
    }

    const { data, error } = await buscarLocais(termo, false, 10);

    if(error){
      console.error("[EasyLoc Debug]", {
        arquivo: "js/pedido/pedido.locais-km.mjs",
        funcao: "doBusca",
        tabela: "locais_empresas",
        termo,
        erro: error
      });
      return;
    }

    localLista.innerHTML = "";

    if(!data?.length){
      localLista.innerHTML = `<div class="autocomplete-empty">Local nao cadastrado</div>`;
      localLista.style.display = "block";
      return;
    }

    data.forEach((local) => {
      const item = document.createElement("div");
      item.classList.add("autocomplete-item");
      item.innerHTML = `
        <strong>${local.nome_razao}</strong>
        <div style="font-size:12px;color:#64748b;">
          ${local.endereco || ""}
          ${local.numero_endereco ? ", " + local.numero_endereco : ""}
        </div>
      `;
      item.addEventListener("click", () => selecionarLocal(local));
      localLista.appendChild(item);
    });

    localLista.style.display = "block";
  }, 300);

  localInput.addEventListener("input", () => {
    if(localIdHidden) localIdHidden.value = "";
    doBusca();
  });

  localInput.addEventListener("change", resolverLocalPorNome);
  localInput.addEventListener("blur", resolverLocalPorNome);

  setTimeout(resolverLocalPorNome, 0);

  document.addEventListener("click", (e) => {
    if(!e.target.closest(".autocomplete-wrapper")){
      localLista.style.display = "none";
    }
  });
}

function renderizarObservacoesLocal({ local, obsDiv }){
  if(!obsDiv) return;

  const observacoes = getTagsOperacionais(local?.tags || {});
  const tagsDiv = document.getElementById("localTagsInline");
  atualizarIndicadoresLocal(local?.tags || {});

  const endereco = [
    local.endereco,
    local.numero_endereco ? String(local.numero_endereco).trim() : ""
  ].filter(Boolean).join(", ");
  const referencia = local.ponto_referencia || "-";

  obsDiv.innerHTML = `
    <div class="local-address-row">
      <strong>Endereço:</strong>
      <span>${endereco || "-"}</span>
    </div>
    <div class="local-reference-row">
      <strong>Referência:</strong>
      <span>${referencia}</span>
    </div>
  `;

  if(tagsDiv){
    tagsDiv.innerHTML = observacoes.length
      ? observacoes.map((obs) => `<span class="local-tag-real">${obs}</span>`).join("")
      : "";
  }
}

function enderecoCompletoLocal(local = {}){
  return [
    local.endereco || "",
    local.numero_endereco ? String(local.numero_endereco).trim() : "",
    "Brasil"
  ].filter(Boolean).join(", ");
}

function coordenadasLocal(local = {}){
  const lat = Number(local.latitude);
  const lng = Number(local.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

async function geocodificarLocal(local = {}){
  const endereco = enderecoCompletoLocal(local);
  if(!endereco || !window.google?.maps?.Geocoder) return null;

  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ address: endereco }, (results, status) => {
      if(status !== "OK" || !results?.[0]?.geometry?.location){
        resolve(null);
        return;
      }
      const location = results[0].geometry.location;
      resolve({
        lat: location.lat(),
        lng: location.lng(),
        placeId: results[0].place_id || ""
      });
    });
  });
}

async function salvarCoordenadasLocal({ supabase, local, position, placeId = "" }){
  if(!supabase || !local?.id || !window.__CONTEXT?.empresa_id || !position) return;

  const payload = {
    latitude: Number(position.lat),
    longitude: Number(position.lng)
  };
  if(placeId) payload.google_place_id = placeId;

  const { error } = await supabase
    .from("locais_empresas")
    .update(payload)
    .eq("empresa_id", window.__CONTEXT.empresa_id)
    .eq("id", local.id);

  if(error){
    console.warn("[EasyLoc Debug]", {
      arquivo: "js/pedido/pedido.locais-km.mjs",
      funcao: "salvarCoordenadasLocal",
      erro: error
    });
  }
}

function sincronizarPosicaoMapas(position){
  if(!position) return;
  pedidoMiniMapState.marker?.setPosition(position);
  pedidoMiniMapState.map?.panTo(position);
  pedidoMiniMapState.largeMarker?.setPosition(position);
  pedidoMiniMapState.largeMap?.panTo(position);
}

async function atualizarPosicaoLocal({ supabase, local, position }){
  if(!local || !position) return;
  local.latitude = Number(position.lat);
  local.longitude = Number(position.lng);
  sincronizarPosicaoMapas(position);
  await salvarCoordenadasLocal({ supabase, local, position });
  await calcularKmAutomatico({ supabase, local, forcarRecalculo: true });
}

function fecharMapaAmpliado(){
  const modal = document.getElementById("pedidoMapModal");
  if(!modal) return;
  modal.hidden = true;
  document.body.classList.remove("pedido-map-modal-open");
}

function bindModalMapaPedido(){
  if(pedidoMiniMapState.modalBound) return;
  const modal = document.getElementById("pedidoMapModal");
  const closeBtn = document.getElementById("pedidoMapModalFechar");
  const doneBtn = document.getElementById("pedidoMapModalConcluir");
  if(!modal) return;

  modal.querySelector("[data-map-close]")?.addEventListener("click", fecharMapaAmpliado);
  closeBtn?.addEventListener("click", fecharMapaAmpliado);
  doneBtn?.addEventListener("click", fecharMapaAmpliado);
  document.addEventListener("keydown", (event) => {
    if(event.key === "Escape" && !modal.hidden) fecharMapaAmpliado();
  });

  pedidoMiniMapState.modalBound = true;
}

function abrirMapaAmpliado({ supabase, local, center }){
  const modal = document.getElementById("pedidoMapModal");
  const largeEl = document.getElementById("pedidoMapaAmpliado");
  if(!modal || !largeEl || !local || !window.google?.maps?.Map) return;

  bindModalMapaPedido();
  pedidoMiniMapState.currentLocal = local;
  pedidoMiniMapState.supabase = supabase;
  modal.hidden = false;
  document.body.classList.add("pedido-map-modal-open");

  requestAnimationFrame(() => {
    const position = coordenadasLocal(local) || center || MINI_MAP_CENTER_PADRAO;

    if(!pedidoMiniMapState.largeMap || pedidoMiniMapState.largeMap.getDiv?.() !== largeEl){
      largeEl.innerHTML = "";
      pedidoMiniMapState.largeMap = new google.maps.Map(largeEl, {
        center: position,
        zoom: 16,
        disableDefaultUI: false,
        zoomControl: true,
        gestureHandling: "greedy",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      pedidoMiniMapState.largeMap.addListener("click", async (event) => {
        if(!event?.latLng || !pedidoMiniMapState.currentLocal) return;
        const nextPosition = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        await atualizarPosicaoLocal({
          supabase: pedidoMiniMapState.supabase,
          local: pedidoMiniMapState.currentLocal,
          position: nextPosition
        });
      });
    }

    if(!pedidoMiniMapState.largeMarker){
      pedidoMiniMapState.largeMarker = new google.maps.Marker({
        map: pedidoMiniMapState.largeMap,
        position,
        draggable: true,
        title: local.nome_razao || "Local do evento"
      });

      pedidoMiniMapState.largeMarker.addListener("dragend", async () => {
        const markerPosition = pedidoMiniMapState.largeMarker?.getPosition?.();
        if(!markerPosition || !pedidoMiniMapState.currentLocal) return;
        const nextPosition = { lat: markerPosition.lat(), lng: markerPosition.lng() };
        await atualizarPosicaoLocal({
          supabase: pedidoMiniMapState.supabase,
          local: pedidoMiniMapState.currentLocal,
          position: nextPosition
        });
      });
    }else{
      pedidoMiniMapState.largeMarker.setMap(pedidoMiniMapState.largeMap);
      pedidoMiniMapState.largeMarker.setTitle(local.nome_razao || "Local do evento");
      pedidoMiniMapState.largeMarker.setPosition(position);
    }

    google.maps.event.trigger(pedidoMiniMapState.largeMap, "resize");
    pedidoMiniMapState.largeMap.setCenter(position);
  });
}

function aplicarMiniMapaFallback(label = "Mapa indisponível"){
  const mapEl = document.getElementById("pedidoMiniMapa");
  if(!mapEl) return;
  mapEl.innerHTML = `
    <div class="pedido-mini-map-placeholder">
      <i data-lucide="map-pin"></i>
      <span>${label}</span>
    </div>
  `;
  window.lucide?.createIcons?.();
}

async function renderizarMiniMapaPedido({ supabase, local }){
  const mapEl = document.getElementById("pedidoMiniMapa");
  const locateBtn = document.getElementById("pedidoMiniMapaCentralizar");
  const expandBtn = document.getElementById("pedidoMiniMapaAbrir");
  if(!mapEl || !local) return;

  try{
    if(!window.google?.maps?.Map){
      if(typeof window.carregarGooglePlaces === "function"){
        await window.carregarGooglePlaces();
      }
    }

    if(!window.google?.maps?.Map){
      aplicarMiniMapaFallback("Google Maps não carregado");
      return;
    }

    let center = coordenadasLocal(local);
    if(!center){
      const geocode = await geocodificarLocal(local);
      if(geocode){
        center = { lat: geocode.lat, lng: geocode.lng };
        local.latitude = center.lat;
        local.longitude = center.lng;
        salvarCoordenadasLocal({ supabase, local, position: center, placeId: geocode.placeId });
      }
    }

    center = center || MINI_MAP_CENTER_PADRAO;
    pedidoMiniMapState.currentLocal = local;
    pedidoMiniMapState.supabase = supabase;
    bindModalMapaPedido();

    const precisaNovoMapa = !pedidoMiniMapState.map
      || pedidoMiniMapState.localId !== local.id
      || pedidoMiniMapState.map.getDiv?.() !== mapEl;

    if(precisaNovoMapa){
      mapEl.innerHTML = "";
      pedidoMiniMapState.map = new google.maps.Map(mapEl, {
        center,
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      pedidoMiniMapState.marker = new google.maps.Marker({
        map: pedidoMiniMapState.map,
        position: center,
        draggable: true,
        title: local.nome_razao || "Local do evento"
      });

      pedidoMiniMapState.map.addListener("click", () => {
        abrirMapaAmpliado({ supabase, local, center: coordenadasLocal(local) || center });
      });

      pedidoMiniMapState.marker.addListener("dragend", async () => {
        const markerPosition = pedidoMiniMapState.marker?.getPosition?.();
        if(!markerPosition) return;
        const position = { lat: markerPosition.lat(), lng: markerPosition.lng() };
        await atualizarPosicaoLocal({ supabase, local, position });
      });

      pedidoMiniMapState.localId = local.id || null;
    }else{
      pedidoMiniMapState.map.setCenter(center);
      pedidoMiniMapState.marker?.setPosition(center);
    }

    if(locateBtn){
      locateBtn.onclick = () => {
        const position = pedidoMiniMapState.marker?.getPosition?.();
        if(position) pedidoMiniMapState.map?.panTo(position);
      };
    }
    if(expandBtn){
      expandBtn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        abrirMapaAmpliado({ supabase, local, center: coordenadasLocal(local) || center });
      };
    }
  }catch(error){
    console.warn("[EasyLoc Debug]", {
      arquivo: "js/pedido/pedido.locais-km.mjs",
      funcao: "renderizarMiniMapaPedido",
      erro: error?.message || String(error)
    });
    aplicarMiniMapaFallback("Mapa indisponível");
  }
}

function getTagsOperacionais(tags){
  const observacoes = Array.isArray(tags?.observacoes) ? tags.observacoes.filter(Boolean) : [];
  const normalizar = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const entradas = [
    ...Object.entries(tags || {}).filter(([, value]) => value === true).map(([key]) => key),
    ...Object.values(tags || {}).filter((value) => typeof value === "string")
  ].map(normalizar);
  const tem = (...nomes) => nomes.some((nome) => entradas.some((entrada) => entrada.includes(normalizar(nome))));
  const inferidas = [
    tem("baldeacao", "baldeacao necessaria") ? "Necessita Baldeação" : "",
    tem("escada") ? "Tem escadas" : "",
    tem("elevador") ? "Tem Elevador" : "",
    tem("caminhao perto", "caminhao_proximo", "caminhao proximo") ? "Caminhão para perto" : ""
  ].filter(Boolean);
  return [...new Set([...observacoes, ...inferidas])];
}

function atualizarIndicadoresLocal(tags){
  const normalizar = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const entradas = [
    ...Object.entries(tags || {}).filter(([, value]) => value === true).map(([key]) => key),
    ...Object.values(tags || {}).filter((value) => typeof value === "string")
  ].map(normalizar);

  const temFlag = (...nomes) =>
    nomes.some((nome) => entradas.some((entrada) => entrada.includes(normalizar(nome))));

  const set = (id, ativo) => {
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = ativo ? "Sim" : "Nao";
    el.dataset.state = ativo ? "sim" : "nao";
  };

  set("indBaldeacao", temFlag("baldeacao", "baldeacao necessaria"));
  set("indEscada", temFlag("escada"));
  set("indElevador", temFlag("elevador"));
  set("indCaminhaoPerto", temFlag("caminhao perto", "caminhao_proximo", "caminhao proximo"));
}

function formatKmTexto(km){
  const numero = Number(km);
  if(!Number.isFinite(numero) || numero <= 0) return "";
  return `${numero.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })} km`;
}

function aplicarKmCalculado(km, texto = ""){
  const numero = Number(Number(km).toFixed(1));
  const elKm = document.getElementById("freteDistanciaKm");
  if(elKm) elKm.innerText = texto || formatKmTexto(numero) || `${numero} km`;

  window.kmPedido = numero;
  window.calcularFreteInteligente?.();
}

async function salvarDistanciaNoLocal({ supabase, local, km, texto }){
  if(!local?.id || !window.__CONTEXT?.empresa_id) return;

  const payload = {
    distancia_galpao_km: Number(Number(km).toFixed(1)),
    distancia_galpao_texto: texto || formatKmTexto(km),
    distancia_calculada_em: new Date().toISOString()
  };

  if(Number.isFinite(Number(local.latitude))) payload.latitude = Number(local.latitude);
  if(Number.isFinite(Number(local.longitude))) payload.longitude = Number(local.longitude);
  if(local.google_place_id) payload.google_place_id = local.google_place_id;

  const { error } = await supabase
    .from("locais_empresas")
    .update(payload)
    .eq("empresa_id", window.__CONTEXT.empresa_id)
    .eq("id", local.id);

  if(error){
    console.warn("[EasyLoc Debug]", {
      arquivo: "js/pedido/pedido.locais-km.mjs",
      funcao: "salvarDistanciaNoLocal",
      erro: error
    });
  }
}

async function calcularKmAutomatico({ supabase, local, forcarRecalculo = false }){
  const debugBase = {
    arquivo: "js/pedido/pedido.locais-km.mjs",
    funcao: "calcularKmAutomatico"
  };

  try{
    const distanciaSalva = Number(local?.distancia_galpao_km || 0);
    if(!forcarRecalculo && Number.isFinite(distanciaSalva) && distanciaSalva > 0){
      aplicarKmCalculado(distanciaSalva, local?.distancia_galpao_texto || "");
      return;
    }

    const empresaId = window.__CONTEXT?.empresa_id;

    if(!empresaId){
      console.warn("[EasyLoc Debug]", {
        ...debugBase,
        erro: "empresa_id nao encontrado",
        parametrosRecebidos: { local }
      });
      return;
    }

    const { data: empresa, error: erroEmpresa } = await supabase
      .from("empresas")
      .select("endereco_google")
      .eq("id", empresaId)
      .single();

    if(erroEmpresa){
      console.error("[EasyLoc Debug]", {
        ...debugBase,
        tabela: "empresas",
        erro: erroEmpresa
      });
      return;
    }

    const latitudeDestino = Number(local?.latitude);
    const longitudeDestino = Number(local?.longitude);
    const temCoordenadasDestino = Number.isFinite(latitudeDestino) && Number.isFinite(longitudeDestino);
    const enderecoLocal = String(local?.endereco || "").trim();
    const numeroLocal = String(local?.numero_endereco || "").trim();
    const enderecoComNumero = numeroLocal && !enderecoLocal.includes(numeroLocal)
      ? `${enderecoLocal}, ${numeroLocal}`
      : enderecoLocal;

    const destinoFinal = temCoordenadasDestino
      ? `${latitudeDestino},${longitudeDestino}`
      : [
          enderecoComNumero,
          "Brasil"
        ].filter(Boolean).join(", ").trim();

    const origemFinal = (empresa?.endereco_google || "").trim() || GALPAO_ORIGEM_PADRAO;

    console.log("[EasyLoc Debug]", {
      ...debugBase,
      parametrosRecebidos: { empresaId, local },
      latitudeOrigem: null,
      longitudeOrigem: null,
      latitudeDestino: null,
      longitudeDestino: null,
      origem: origemFinal,
      destino: destinoFinal,
      origemVazia: !origemFinal,
      destinoVazio: !destinoFinal,
      origemNaN: Number.isNaN(Number(origemFinal)),
      destinoNaN: Number.isNaN(Number(destinoFinal))
    });

    if(!origemFinal || !destinoFinal){
      console.warn("[EasyLoc Debug]", {
        ...debugBase,
        erro: "Endereco incompleto para calculo",
        campoCausador: !origemFinal ? "empresa.endereco_google" : "local.endereco/numero_endereco",
        origemFinal,
        destinoFinal
      });
      aplicarDistanciaIndisponivel("Nao calculado");
      return;
    }

    const payloadDistancia = {
      origem: origemFinal,
      destino: destinoFinal,
      origin: origemFinal,
      destination: destinoFinal,
      latitudeOrigem: null,
      longitudeOrigem: null,
      latitudeDestino: temCoordenadasDestino ? latitudeDestino : null,
      longitudeDestino: temCoordenadasDestino ? longitudeDestino : null
    };

    console.log("[EasyLoc Debug]", {
      ...debugBase,
      requisicaoEnviada: {
        edgeFunction: "calcular-distancia",
        body: payloadDistancia
      }
    });

    const resp = await invocarDistanciaComFallback({ supabase, payloadDistancia, debugBase });

    console.log("[EasyLoc Debug]", {
      ...debugBase,
      respostaRecebida: resp
    });

    const result = resp?.data;
    const erroFunction = resp?.error;

    if(erroFunction){
      const body = erroFunction?.context?.body || {};
      console.error("[EasyLoc Debug]", {
        ...debugBase,
        erro: "Erro ao calcular distancia",
        status: erroFunction?.context?.status,
        statusGoogle: body?.statusGoogle || body?.details?.status || null,
        errorMessageGoogle: body?.errorMessageGoogle || body?.details?.error_message || null,
        destinoStatus: body?.destinoStatus || body?.details?.rows?.[0]?.elements?.[0]?.status || null,
        origem: body?.origem || payloadDistancia.origem,
        destino: body?.destino || payloadDistancia.destino,
        body,
        payloadDistancia
      });
      aplicarDistanciaIndisponivel("Nao calculado");
      return;
    }

    if(result?.km != null){
      const km = Number(Number(result.km).toFixed(1));
      const texto = formatKmTexto(km);
      aplicarKmCalculado(km, texto);
      salvarDistanciaNoLocal({ supabase, local, km, texto });
      return;
    }

    if(result?.ok === false){
      console.warn("[EasyLoc Debug]", {
        ...debugBase,
        erro: "Distancia nao calculada pelo provedor externo",
        statusGoogle: result?.statusGoogle || null,
        errorMessageGoogle: result?.errorMessageGoogle || null,
        destinoStatus: result?.destinoStatus || null,
        origem: result?.origem || payloadDistancia.origem,
        destino: result?.destino || payloadDistancia.destino
      });
      aplicarDistanciaIndisponivel(
        result?.statusGoogle === "REQUEST_DENIED" ? "Google bloqueado" : "Nao calculado"
      );
      return;
    }

    console.warn("[EasyLoc Debug]", {
      ...debugBase,
      erro: "Funcao respondeu sem km",
      respostaRecebida: result
    });
  }catch(err){
    console.error("[EasyLoc Debug]", {
      ...debugBase,
      erro: "Erro inesperado ao calcular distancia",
      detalhes: err?.message || String(err)
    });
  }
}

function aplicarDistanciaIndisponivel(label = "Nao calculado"){
  const elKm = document.getElementById("freteDistanciaKm");
  if(elKm) elKm.innerText = label;

  window.kmPedido = 0;
  window.calcularFreteInteligente?.();
}

async function invocarDistanciaComFallback({ supabase, payloadDistancia, debugBase }){
  const session = await supabase.auth.getSession?.();
  const token = session?.data?.session?.access_token;
  const supabaseUrl = supabase.supabaseUrl || "https://awemuohtvwvrdzfxwrmd.supabase.co";
  const supabaseKey = supabase.supabaseKey || "sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ";

  const response = await fetch(`${supabaseUrl}/functions/v1/calcular-distancia`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseKey,
      "Authorization": `Bearer ${token || supabaseKey}`
    },
    body: JSON.stringify(payloadDistancia)
  });

  const data = await response.json().catch(() => null);

  console.log("[EasyLoc Debug]", {
    ...debugBase,
    etapa: "fetch direto calcular-distancia",
    status: response.status,
    requisicaoEnviada: payloadDistancia,
    respostaRecebida: data,
    statusGoogle: data?.statusGoogle || data?.details?.status || null,
    errorMessageGoogle: data?.errorMessageGoogle || data?.details?.error_message || null,
    destinoStatus: data?.destinoStatus || data?.details?.rows?.[0]?.elements?.[0]?.status || null
  });

  return response.ok
    ? { data, error: null }
    : {
        data,
        error: {
          context: { status: response.status, body: data },
          message: data?.error || "Erro ao calcular distancia"
        }
      };
}
