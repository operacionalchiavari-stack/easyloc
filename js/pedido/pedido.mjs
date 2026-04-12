console.log("✅ pedido.mjs carregado");

import { getEls, bindDiasSemana } from "./pedido.utils.mjs";
import { initAutocompleteClientes } from "./pedido.clientes.mjs";
import { initAutocompleteLocaisEKm } from "./pedido.locais-km.mjs";
import { initItens } from "./pedido.itens.mjs";
import { initFrete } from "./pedido.frete.mjs";
import { initServicos } from "./pedido.servicos.mjs";
import { carregarLogoEmpresa, imprimirPedido, abrirModalAvisoFrete } from "./pedido.misc.mjs";

export async function initPedido(){

  console.log("✅ initPedido executou");

  /* =====================================================
     SPA GUARD (EASYLOC SPA SAFE)
  ===================================================== */
  if (window.__pedidoModuleLoaded) {
    console.log("⚠️ Pedido já inicializado");
    return;
  }
  window.__pedidoModuleLoaded = true;

  /* =====================================================
     CONTEXTO
  ===================================================== */
  const supabase = window.supabaseClient;

  /* =====================================================
     CARREGAR CONFIGURAÇÃO FINANCEIRA (ABSORÇÃO FRETE/MONTAGEM)
  ===================================================== */
  async function carregarFinanceiro(){

    const empresaId = window.__CONTEXT?.empresa_id;

    if(!empresaId){
      window.__ABS_FRETE_PERCENT = 0;
      window.__ABS_MONTAGEM_PERCENT = 0;
      return;
    }

    window.__FINANCEIRO_CACHE = window.__FINANCEIRO_CACHE || {};

    if(window.__FINANCEIRO_CACHE[empresaId]){
      window.__ABS_FRETE_PERCENT = window.__FINANCEIRO_CACHE[empresaId].frete;
      window.__ABS_MONTAGEM_PERCENT = window.__FINANCEIRO_CACHE[empresaId].montagem;
      return;
    }

    const { data, error } = await supabase
      .from("empresa_financeiro")
      .select("absorcao_frete_percent, absorcao_montagem_percent")
      .eq("empresa_id", empresaId)
      .single();

    if(error){
      console.error("❌ Erro ao buscar empresa_financeiro:", error);
      window.__ABS_FRETE_PERCENT = 0;
      window.__ABS_MONTAGEM_PERCENT = 0;
      return;
    }

    const frete = Number(data?.absorcao_frete_percent || 0);
    const montagem = Number(data?.absorcao_montagem_percent || 0);

    window.__FINANCEIRO_CACHE[empresaId] = {
      frete,
      montagem
    };

    window.__ABS_FRETE_PERCENT = frete;
    window.__ABS_MONTAGEM_PERCENT = montagem;

    console.log("💰 Financeiro carregado:", {
      frete: window.__ABS_FRETE_PERCENT,
      montagem: window.__ABS_MONTAGEM_PERCENT
    });
  }

  await carregarFinanceiro();

  const els = getEls();

  if (!els.tbody || !els.addItemBtn) {
    console.warn("⚠️ Pedido: elementos ainda não estão no DOM.");
    return;
  }

  /* =====================================================
     EXPÕE FUNÇÕES GLOBAIS QUE O HTML PODE CHAMAR
  ===================================================== */
  window.imprimirPedido = imprimirPedido;
  window.abrirModalAvisoFrete = abrirModalAvisoFrete;

  /* =====================================================
     DIAS DA SEMANA
  ===================================================== */
  bindDiasSemana(els);

  /* =====================================================
     FRETE + MONTAGEM (cria window.renderizarFreteCard e window.calcularFreteInteligente)
  ===================================================== */
  initFrete({ supabase });

  /* =====================================================
     AUTOCOMPLETE CLIENTES
  ===================================================== */
  initAutocompleteClientes({
    supabase,
    clienteInput: els.clienteInput,
    clienteLista: els.clienteLista,
    clienteIdHidden: els.clienteIdHidden,
    telefoneInput: els.telefoneInput,
    responsavelInput: els.responsavelInput,
  });

  /* =====================================================
     AUTOCOMPLETE LOCAIS + KM (ao selecionar local, calcula KM e dispara frete)
  ===================================================== */
  initAutocompleteLocaisEKm({
    supabase,
    localInput: els.localInput,
    localLista: els.localLista,
    localIdHidden: els.localIdHidden,
    obsDiv: els.localObservacoes,
  });

  /* =====================================================
     ITENS (tabela, espaços, componentes, volume, resumo)
  ===================================================== */
  initItens({ supabase, els });
/* =====================================================
   SERVIÇOS
===================================================== */
initServicos({ supabase, els });

/* =====================================================
   PRÉ RESERVA
===================================================== */

const btnPreReserva = document.getElementById("btnPreReserva");
const preReservaBox = document.getElementById("preReservaBox");
const preReservaData = document.getElementById("preReservaData");
const alertaReserva = document.getElementById("alertaReserva");
const btnCancelarPreReserva = document.getElementById("btnCancelarPreReserva");
const cancelarWrapper = document.getElementById("cancelarPreReservaWrapper");

/* GARANTE QUE O BOTÃO CANCELAR COMEÇA ESCONDIDO */

cancelarWrapper?.classList.add("hidden");

/* MOSTRAR CAMPO DATA */

btnPreReserva?.addEventListener("click", () => {

  if(!preReservaBox) return;

  preReservaBox.classList.remove("hidden");

});

/* DEFINIR DATA DA PRÉ RESERVA */

preReservaData?.addEventListener("change", () => {

  const data = preReservaData.value;

  if(!data) return;

  window.preReservaData = data;

  /* FORMATAR DATA */

  const partes = data.split("-");
  const dataFormatada =
    partes[2] + "/" + partes[1] + "/" + partes[0];

  if(alertaReserva){

    alertaReserva.innerText =
      `Pré-reserva válida até ${dataFormatada}`;

    alertaReserva.classList.add("pre-reserva-ativa");

  }

  /* MOSTRAR BOTÃO CANCELAR */

  cancelarWrapper?.classList.remove("hidden");

  console.log("📦 Pré-reserva definida até:", data);

});

/* CANCELAR PRÉ RESERVA */

btnCancelarPreReserva?.addEventListener("click", () => {

  window.preReservaData = null;

  if(alertaReserva){

    alertaReserva.innerText =
      "Este orçamento não gera reserva de material";

    alertaReserva.classList.remove("pre-reserva-ativa");

  }

  if(preReservaBox){
    preReservaBox.classList.add("hidden");
  }

  if(preReservaData){
    preReservaData.value = "";
  }

  cancelarWrapper?.classList.add("hidden");

  console.log("❌ Pré-reserva cancelada");

});

/* DEFINIR DATA */

preReservaData?.addEventListener("change", () => {

  const data = preReservaData.value;

  if(!data) return;

  window.preReservaData = data;

  /* FORMATAR DATA */

  const partes = data.split("-");
  const dataFormatada =
    partes[2] + "/" + partes[1] + "/" + partes[0];

  if(alertaReserva){

    alertaReserva.innerText =
      `Pré-reserva válida até ${dataFormatada}`;

    alertaReserva.classList.add("pre-reserva-ativa");

  }

cancelarWrapper?.classList.remove("hidden");

  console.log("📦 Pré-reserva definida até:", data);

});

/* CANCELAR PRÉ RESERVA */

btnCancelarPreReserva?.addEventListener("click", () => {

  window.preReservaData = null;

  if(alertaReserva){

    alertaReserva.innerText =
      "Este orçamento não gera reserva de material";

    alertaReserva.classList.remove("pre-reserva-ativa");

  }

  if(preReservaBox){
    preReservaBox.classList.add("hidden");
  }

  if(preReservaData){
    preReservaData.value = "";
  }

cancelarWrapper?.classList.add("hidden");

  console.log("❌ Pré-reserva cancelada");

});
  /* =====================================================
     INICIAR (logo + loader)
  ===================================================== */
  carregarLogoEmpresa();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.finalizarCarregamentoModulo?.();
    });
  });

}

/* =====================================================
   DESTROY DO MÓDULO PEDIDO (SPA SAFE)
===================================================== */
export function destroyPedido(){

  console.log("🧹 destroy Pedido");

  window.__pedidoModuleLoaded = false;

  document
    .querySelectorAll(".autocomplete-list")
    .forEach(el => el.remove());

  document
    .querySelectorAll(".item-autocomplete-list")
    .forEach(el => { el.innerHTML = ""; el.style.display = "none"; });

  const root = document.getElementById("modal-root");
  if (root) root.innerHTML = "";
}

/* =====================================================
   COMPAT: EasyLoc loader pode chamar window.__moduleInit
===================================================== */
window.initPedido = initPedido;
window.__activeModuleDestroy = destroyPedido;
window.__moduleInit = initPedido;