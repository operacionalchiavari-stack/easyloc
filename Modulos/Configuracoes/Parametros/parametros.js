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
    descarregamento_minutos_apos_desmontagem: 60,
    hora_padrao: "08:00",
    triagem_responsavel: "",
    triagem_equipe: "",
    separacao_dias_antes_evento: 2
  };
  const ESCALA_PADRAO = {
    deslocamento_h: 1, volume_padrao_m3: 10, usar_free: true,
    etapas: {
      triagem:         { equipe: "triagem",      caminhao: false, m3_por_pessoa: 20, minimo: 1, maximo: 3, duracao_h: 3 },
      carregamento:    { equipe: "carregamento", caminhao: true,  m3_por_pessoa: 20, minimo: 2, maximo: 4, duracao_h: 2 },
      descarregamento: { equipe: "carregamento", caminhao: true,  m3_por_pessoa: 20, minimo: 2, maximo: 4, duracao_h: 2 },
      montagem:        { equipe: "montagem",     caminhao: true,  m3_por_pessoa: 8,  minimo: 2, maximo: 8, duracao_h: 5 },
      desmontagem:     { equipe: "montagem",     caminhao: true,  m3_por_pessoa: 10, minimo: 2, maximo: 8, duracao_h: 4 }
    }
  };
  const NOME_ETAPA = { triagem: "Triagem (ida e volta)", carregamento: "Carregamento", descarregamento: "Descarregamento", montagem: "Montagem", desmontagem: "Desmontagem" };
  const EQUIPES = [["triagem", "Triagem"], ["carregamento", "Carregamento"], ["montagem", "Montagem"], ["producao", "Produção"]];
  // Regras por tipo de etapa (empresa_logistica_regras.escala, lida pelo Painel Logístico)
  function escalaHtml(esc){
    document.getElementById("escalaEtapas").innerHTML = Object.keys(ESCALA_PADRAO.etapas).map((k) => {
      const e = Object.assign({}, ESCALA_PADRAO.etapas[k], (esc.etapas || {})[k] || {});
      const num = (campo, min, max, passo) => '<input type="number" min="' + min + '" max="' + max + '" step="' + passo + '" data-etapa="' + k + '" data-campo="' + campo + '" value="' + e[campo] + '" aria-label="' + NOME_ETAPA[k] + ': ' + campo + '">';
      return '<tr><th scope="row">' + NOME_ETAPA[k] + '</th>' +
        '<td><select data-etapa="' + k + '" data-campo="equipe" aria-label="' + NOME_ETAPA[k] + ': equipe">' + EQUIPES.map(([v, t]) => '<option value="' + v + '"' + (v === e.equipe ? " selected" : "") + '>' + t + '</option>').join("") + '</select></td>' +
        '<td>' + num("m3_por_pessoa", 0.5, 200, 0.5) + '</td><td>' + num("minimo", 0, 30, 1) + '</td><td>' + num("maximo", 1, 40, 1) + '</td><td>' + num("duracao_h", 0.5, 24, 0.5) + '</td>' +
        '<td><input type="checkbox" data-etapa="' + k + '" data-campo="caminhao"' + (e.caminhao ? " checked" : "") + ' aria-label="' + NOME_ETAPA[k] + ': usa caminhão"></td></tr>';
    }).join("");
  }
  function escalaLer(){
    const r = { deslocamento_h: Number(form.elements.esc_deslocamento_h.value), volume_padrao_m3: Number(form.elements.esc_volume_padrao_m3.value), usar_free: form.elements.esc_usar_free.checked, etapas: {} };
    if(!(r.deslocamento_h >= 0 && r.deslocamento_h <= 12)) throw [form.elements.esc_deslocamento_h, "Deslocamento: use de 0 a 12 horas."];
    if(!(r.volume_padrao_m3 >= 0 && r.volume_padrao_m3 <= 500)) throw [form.elements.esc_volume_padrao_m3, "Volume padrão: use de 0 a 500 m³."];
    Object.keys(ESCALA_PADRAO.etapas).forEach((k) => {
      const e = {};
      document.querySelectorAll('[data-etapa="' + k + '"]').forEach((el) => { e[el.dataset.campo] = el.type === "checkbox" ? el.checked : el.tagName === "SELECT" ? el.value : Number(el.value); });
      const campo = c => document.querySelector('[data-etapa="' + k + '"][data-campo="' + c + '"]');
      if(!(e.m3_por_pessoa > 0)) throw [campo("m3_por_pessoa"), NOME_ETAPA[k] + ": m³ por pessoa precisa ser maior que zero."];
      if(!(e.minimo >= 0) || !(e.maximo >= e.minimo)) throw [campo("maximo"), NOME_ETAPA[k] + ": o máximo precisa ser maior ou igual ao mínimo."];
      if(!(e.duracao_h > 0)) throw [campo("duracao_h"), NOME_ETAPA[k] + ": informe a duração."];
      r.etapas[k] = e;
    });
    return r;
  }
  const DIAS = ["triagem_dias_antes_carregamento", "carregamento_dias_antes_entrega", "montagem_dias_apos_entrega", "desmontagem_dias_apos_coleta", "triagem_retorno_dias_apos_coleta"];
  const form = document.getElementById("formParametros");
  const status = document.getElementById("parametrosStatus");
  const botao = document.getElementById("btnSalvarParametros");
  let empresaId = null;

  function preencher(dados){
    const r = Object.assign({}, PADRAO, dados || {});
    form.querySelectorAll('input[name="status"]').forEach((c) => { c.checked = (r.status_cronograma || []).includes(c.value); });
    DIAS.forEach((k) => { form.elements[k].value = r[k] ?? PADRAO[k]; });
    form.elements.descarregamento_minutos_apos_desmontagem.value = r.descarregamento_minutos_apos_desmontagem ?? 60;
    form.elements.hora_padrao.value = String(r.hora_padrao || PADRAO.hora_padrao).slice(0, 5);
    form.elements.triagem_responsavel.value = r.triagem_responsavel || "";
    form.elements.triagem_equipe.value = r.triagem_equipe || "";
    form.elements.separacao_dias_antes_evento.value = r.separacao_dias_antes_evento ?? PADRAO.separacao_dias_antes_evento;
    const esc = Object.assign({}, ESCALA_PADRAO, r.escala || {});
    form.elements.esc_deslocamento_h.value = esc.deslocamento_h;
    form.elements.esc_volume_padrao_m3.value = esc.volume_padrao_m3;
    form.elements.esc_usar_free.checked = esc.usar_free !== false;
    escalaHtml(esc);
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
    const minutosDescarga=Number(form.elements.descarregamento_minutos_apos_desmontagem.value);
    if(!Number.isInteger(minutosDescarga) || minutosDescarga<0 || minutosDescarga>1440){form.elements.descarregamento_minutos_apos_desmontagem.focus();window.alerta?.('Use de 0 a 1440 minutos.','Parâmetros','aviso');return;}
    payload.descarregamento_minutos_apos_desmontagem=minutosDescarga;
    payload.hora_padrao = form.elements.hora_padrao.value || PADRAO.hora_padrao;
    payload.triagem_responsavel = form.elements.triagem_responsavel.value.trim() || null;
    payload.triagem_equipe = form.elements.triagem_equipe.value.trim() || null;
    const diasSeparacao = Number(form.elements.separacao_dias_antes_evento.value);
    if(!Number.isInteger(diasSeparacao) || diasSeparacao < 0 || diasSeparacao > 60){ form.elements.separacao_dias_antes_evento.focus(); window.alerta?.("Use um número de 0 a 60 dias.", "Parâmetros", "aviso"); return; }
    payload.separacao_dias_antes_evento = diasSeparacao;
    try { payload.escala = escalaLer(); }
    catch(erro){ if(Array.isArray(erro)){ erro[0]?.focus(); window.alerta?.(erro[1], "Parâmetros", "aviso"); return; } throw erro; }
    botao.disabled = true; status.textContent = "Salvando…";
    const { error } = await window.supabaseClient.from("empresa_logistica_regras").upsert(payload, { onConflict: "empresa_id" });
    botao.disabled = false;
    if(error){ console.error(error); status.textContent = ""; window.alerta?.("Não foi possível salvar: " + error.message, "Parâmetros", "erro"); return; }
    status.textContent = "Parâmetros salvos. Valem para os próximos pedidos salvos.";
  });

  carregar();
})();
