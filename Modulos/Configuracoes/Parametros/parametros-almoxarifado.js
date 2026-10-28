// Parâmetros > Almoxarifado (out/2026): liga/desliga a solicitação de compra automática (estoque chegou no mínimo →
// pede ideal − estoque) e diz se o Almoxarifado pode lançar valores/pagamento no recebimento. Grava em almoxarifado_configuracoes pela RPC almox_compra_config_salvar; a regra roda no banco.
(function(){
  "use strict";
  const form = document.getElementById("formAlmoxParametros");
  if(!form) return;
  const status = document.getElementById("almoxParametrosStatus");
  const botao = document.getElementById("btnSalvarAlmox");
  const campo = document.getElementById("almoxCompraAutomatica");
  const campoFin = document.getElementById("almoxEditaFinanceiro");
  let empresaId = null;

  async function carregar(){
    const ctx = await window.aguardarContexto?.();
    empresaId = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    if(!empresaId){ status.textContent = "Empresa não identificada."; botao.disabled = true; return; }
    const { data, error } = await window.supabaseClient.rpc("almox_compra_config", { p_empresa: empresaId });
    if(error){ console.error(error); status.textContent = "Não foi possível carregar os parâmetros do almoxarifado."; return; }
    campo.checked = Boolean(data?.automatica);
    if(campoFin) campoFin.checked = Boolean(data?.edita_financeiro);
    status.textContent = campo.checked ? "Compra automática ligada." : "Compra automática desligada.";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if(!empresaId) return;
    botao.disabled = true; status.textContent = "Salvando…";
    const { data, error } = await window.supabaseClient.rpc("almox_compra_config_salvar", { p_empresa: empresaId, p_automatica: campo.checked, p_edita_financeiro: campoFin ? campoFin.checked : null });
    botao.disabled = false;
    if(error){ console.error(error); status.textContent = ""; window.alerta?.("Não foi possível salvar: " + error.message, "Parâmetros", "erro"); return; }
    const n = Number(data?.abertas || 0);
    status.textContent = data?.automatica
      ? "Salvo. Compra automática ligada" + (n ? " · " + n + (n === 1 ? " solicitação aberta." : " solicitações abertas.") : ".")
      : "Salvo. Compra automática desligada.";
  });

  carregar();
})();
