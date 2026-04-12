import { debounce } from "./pedido.utils.mjs";

export function initAutocompleteLocaisEKm({
  supabase,
  localInput,
  localLista,
  localIdHidden,
  obsDiv,
}){

  if(!localInput || !localLista) return;

  const doBusca = debounce(async () => {

    const termo = (localInput.value || "").trim();

    if (termo.length < 2) {
      localLista.innerHTML = "";
      localLista.style.display = "none";
      return;
    }

    const { data, error } = await supabase
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
      .ilike("nome_razao", `%${termo}%`)
      .limit(10);

    if (error) {
      console.error("Erro ao buscar locais:", error);
      return;
    }

    localLista.innerHTML = "";

    if (!data?.length) {
      localLista.innerHTML = `
        <div class="autocomplete-empty">
          Local não cadastrado
        </div>
      `;
      localLista.style.display = "block";
      return;
    }

    data.forEach(local => {
      const item = document.createElement("div");
      item.classList.add("autocomplete-item");

      item.innerHTML = `
        <strong>${local.nome_razao}</strong>
        <div style="font-size:12px;color:#64748b;">
          ${local.endereco || ""}
          ${local.numero_endereco ? ", " + local.numero_endereco : ""}
        </div>
      `;

      item.addEventListener("click", async () => {

        localInput.value = local.nome_razao;
        if(localIdHidden) localIdHidden.value = local.id;

        renderizarObservacoesLocal({ local, obsDiv });

        localLista.innerHTML = "";
        localLista.style.display = "none";

        await calcularKmAutomatico({ supabase, local });

        if (window.volumeTotalPedido != null) {
          window.calcularFreteInteligente?.();
        }

      });

      localLista.appendChild(item);
    });

    localLista.style.display = "block";

  }, 300);

  localInput.addEventListener("input", doBusca);

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".autocomplete-wrapper")) {
      localLista.style.display = "none";
    }
  });
}

/* =====================================================
   OBS DO LOCAL
===================================================== */
function renderizarObservacoesLocal({ local, obsDiv }){

  if(!obsDiv) return;

  const observacoes = local?.tags?.observacoes || [];
  let cardsHTML = "";

  if (Array.isArray(observacoes) && observacoes.length > 0) {
    cardsHTML = `
      <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">
        ${observacoes.map(obs => `
          <span style="
            background:#fff4e6;
            border:1px solid #ff6a00;
            color:#c2410c;
            padding:4px 10px;
            border-radius:20px;
            font-size:11px;
            font-weight:500;
          ">
            ${obs}
          </span>
        `).join("")}
      </div>
    `;
  }

  obsDiv.innerHTML = `
    ${local.endereco ? `
      <div style="margin-bottom:4px;">
        <strong>Endereço:</strong>
        <span>
          ${local.endereco}
          ${local.numero_endereco ? ', ' + local.numero_endereco : ''}
        </span>
      </div>
    ` : ''}

    ${local.ponto_referencia ? `
      <div style="margin-bottom:4px;">
        <strong>Referência:</strong>
        <span>${local.ponto_referencia}</span>
      </div>
    ` : ''}

    ${cardsHTML}
  `;
}

/* =====================================================
   KM AUTOMÁTICO
===================================================== */
async function calcularKmAutomatico({ supabase, local }){

  try {

    const empresaId = window.__CONTEXT?.empresa_id;

    if (!empresaId) {
      console.warn("empresa_id não encontrado.");
      return;
    }

    const { data: empresa, error: erroEmpresa } = await supabase
      .from("empresas")
      .select("endereco_google")
      .eq("id", empresaId)
      .single();

    if (erroEmpresa) {
      console.error("Erro ao buscar empresa:", erroEmpresa);
      return;
    }

    const destinoFinal = [
      local?.endereco || "",
      local?.numero_endereco ? String(local.numero_endereco) : ""
    ].filter(Boolean).join(", ");

    const origemFinal = (empresa?.endereco_google || "").trim();

    console.log("📍 ORIGEM (empresa.endereco_google):", origemFinal);
    console.log("📍 DESTINO (local):", destinoFinal);
    console.log("📦 OBJ LOCAL COMPLETO:", local);

    if (!origemFinal || !destinoFinal) {
      console.warn("❌ Endereço incompleto para cálculo.", { origemFinal, destinoFinal });
      return;
    }

    const resp = await supabase.functions.invoke("calcular-distancia", {
      body: { origem: origemFinal, destino: destinoFinal }
    });

    console.log("🧾 RESPOSTA invoke (bruta):", resp);

    const result = resp?.data;
    const erroFunction = resp?.error;

    if (erroFunction) {
      console.error("❌ Erro ao calcular distância (invoke.error):", erroFunction);
      console.error("📌 Status:", erroFunction?.context?.status);
      console.error("📌 Body:", erroFunction?.context?.body);
      return;
    }

    if (result?.km != null) {

      const km = Number(Number(result.km).toFixed(1));

      const elKm = document.getElementById("freteDistanciaKm");
      if (elKm) elKm.innerText = km + " km";

      window.kmPedido = km;

    } else {
      console.warn("⚠️ Função respondeu sem 'km':", result);
    }

  } catch (err) {
    console.error("Erro inesperado ao calcular distância:", err);
  }
}