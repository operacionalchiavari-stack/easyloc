import { debounce } from "./pedido.utils.mjs";

export function initAutocompleteLocaisEKm({
  supabase,
  localInput,
  localLista,
  localIdHidden,
  obsDiv,
}){
  if(!localInput || !localLista) return;

  let ultimoLocalCalculado = "";

  const selecionarLocal = async (local) => {
    if(!local) return;

    localInput.value = local.nome_razao || "";
    if(localIdHidden) localIdHidden.value = local.id || "";

    renderizarObservacoesLocal({ local, obsDiv });

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

  const observacoes = local?.tags?.observacoes || [];
  const tagsDiv = document.getElementById("localTagsInline");
  atualizarIndicadoresLocal(local?.tags || {});

  obsDiv.innerHTML = `
    ${local.endereco ? `
      <div style="margin-bottom:4px;">
        <strong>Endereco:</strong>
        <span>
          ${local.endereco}
          ${local.numero_endereco ? ", " + local.numero_endereco : ""}
        </span>
      </div>
    ` : ""}

    ${local.ponto_referencia ? `
      <div style="margin-bottom:4px;">
        <strong>Referencia:</strong>
        <span>${local.ponto_referencia}</span>
      </div>
    ` : ""}
  `;

  if(tagsDiv){
    tagsDiv.innerHTML = Array.isArray(observacoes) && observacoes.length
      ? observacoes.map((obs) => `<span class="local-tag-real">${obs}</span>`).join("")
      : "";
  }
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

async function calcularKmAutomatico({ supabase, local }){
  const debugBase = {
    arquivo: "js/pedido/pedido.locais-km.mjs",
    funcao: "calcularKmAutomatico"
  };

  try{
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

    const enderecoLocal = String(local?.endereco || "").trim();
    const numeroLocal = String(local?.numero_endereco || "").trim();
    const enderecoComNumero = numeroLocal && !enderecoLocal.includes(numeroLocal)
      ? `${enderecoLocal}, ${numeroLocal}`
      : enderecoLocal;

    const destinoFinal = [
      enderecoComNumero,
      "Brasil"
    ].filter(Boolean).join(", ").trim();

    const origemFinal = (empresa?.endereco_google || "").trim();

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
      latitudeDestino: null,
      longitudeDestino: null
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
      const elKm = document.getElementById("freteDistanciaKm");
      if(elKm) elKm.innerText = `${km} km`;

      window.kmPedido = km;
      window.calcularFreteInteligente?.();
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
