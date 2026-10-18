// Parâmetros do sistema (out/2026). Hoje: regras de como o pedido abastece o cronograma
// (tabela empresa_logistica_regras, uma linha por empresa). Novos parâmetros entram aqui.
(function(){
  "use strict";
  const PADRAO = {
    status_cronograma: ["pre_reserva", "aprovado"],
    triagem_dias_antes_carregamento: 1,
    carregamento_dias_antes_entrega: 0,
    montagem_dias_apos_entrega: 0,
    desmontagem_dias_apos_coleta: 0,
    triagem_retorno_dias_apos_coleta: 0,
    hora_padrao: "08:00",
    triagem_responsavel: "",
    triagem_equipe: "",
    separacao_dias_antes_evento: 2
  };
  const DIAS = ["triagem_dias_antes_carregamento", "carregamento_dias_antes_entrega", "montagem_dias_apos_entrega", "desmontagem_dias_apos_coleta", "triagem_retorno_dias_apos_coleta"];
  const form = document.getElementById("formParametros");
  const status = document.getElementById("parametrosStatus");
  const botao = document.getElementById("btnSalvarParametros");
  let empresaId = null;

  function preencher(dados){
    const r = Object.assign({}, PADRAO, dados || {});
    form.querySelectorAll('input[name="status"]').forEach((c) => { c.checked = (r.status_cronograma || []).includes(c.value); });
    DIAS.forEach((k) => { form.elements[k].value = r[k] ?? PADRAO[k]; });
    form.elements.hora_padrao.value = String(r.hora_padrao || PADRAO.hora_padrao).slice(0, 5);
    form.elements.triagem_responsavel.value = r.triagem_responsavel || "";
    form.elements.triagem_equipe.value = r.triagem_equipe || "";
    form.elements.separacao_dias_antes_evento.value = r.separacao_dias_antes_evento ?? PADRAO.separacao_dias_antes_evento;
  }

  async function carregar(){
    const ctx = await window.aguardarContexto?.();
    empresaId = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    if(!empresaId){ status.textContent = "Empresa não identificada."; return; }
    const { data, error } = await window.supabaseClient.from("empresa_logistica_regras").select("*").eq("empresa_id", empresaId).maybeSingle();
    if(error){ status.textContent = "Não foi possível carregar os parâmetros."; console.error(error); }
    preencher(data);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const escolhidos = [...form.querySelectorAll('input[name="status"]:checked')].map((c) => c.value);
    if(!escolhidos.length){ window.alerta?.("Escolha pelo menos um status para o pedido entrar no cronograma.", "Parâmetros", "aviso"); return; }
    // Pedido aprovado continua no cronograma depois de finalizado/enviado.
    if(escolhidos.includes("aprovado")) escolhidos.push("finalizado", "enviado");
    const payload = { empresa_id: empresaId, status_cronograma: escolhidos, updated_at: new Date().toISOString() };
    for(const k of DIAS){
      const v = Number(form.elements[k].value);
      if(!Number.isInteger(v) || v < 0 || v > 30){ form.elements[k].focus(); window.alerta?.("Use um número de 0 a 30 dias.", "Parâmetros", "aviso"); return; }
      payload[k] = v;
    }
    payload.hora_padrao = form.elements.hora_padrao.value || PADRAO.hora_padrao;
    payload.triagem_responsavel = form.elements.triagem_responsavel.value.trim() || null;
    payload.triagem_equipe = form.elements.triagem_equipe.value.trim() || null;
    const diasSeparacao = Number(form.elements.separacao_dias_antes_evento.value);
    if(!Number.isInteger(diasSeparacao) || diasSeparacao < 0 || diasSeparacao > 60){ form.elements.separacao_dias_antes_evento.focus(); window.alerta?.("Use um número de 0 a 60 dias.", "Parâmetros", "aviso"); return; }
    payload.separacao_dias_antes_evento = diasSeparacao;
    botao.disabled = true; status.textContent = "Salvando…";
    const { error } = await window.supabaseClient.from("empresa_logistica_regras").upsert(payload, { onConflict: "empresa_id" });
    botao.disabled = false;
    if(error){ console.error(error); status.textContent = ""; window.alerta?.("Não foi possível salvar: " + error.message, "Parâmetros", "erro"); return; }
    status.textContent = "Parâmetros salvos. Valem para os próximos pedidos salvos.";
  });

  carregar();
})();
