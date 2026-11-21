// Etapa 5: Comercial do dia a dia (mesmas funções da Central de Pedidos):
// contatos de acompanhamento nos orçamentos e pré-reservas, dois orçamentos que "não vão fechar" (cancelados com motivo)
// e a confirmação de datas de um pedido que entrega nesta semana.
const C = require("./comum.cjs");

(async () => {
  const E = C.lerEstado();
  E.comercial ||= {};
  const { client: sb } = await C.sessaoDe(E.usuario.email, E.usuario.senha);
  const rpc = async (nome, args) => { const { data, error } = await sb.rpc(nome, args); if (error) throw Error(nome + ": " + error.message); return data; };
  const lista = await rpc("comercial_followup_lista", { p_empresa: C.EMPRESA });
  const motivos = lista?.config?.motivos || [];
  console.log("motivos:", motivos.join(" | "));
  const P = (k) => E.pedidos[k];
  const contatos = [
    ["P19", [motivos[0], 2, "Cliente vai mostrar o orçamento para a mãe da aniversariante no fim de semana."]],
    ["P20", [motivos[1] || motivos[0], 3, "Noiva achou o lounge lindo, está esperando o noivo aprovar o valor."]],
    ["P21", [motivos[2] || motivos[0], 1, "Pediram trocar as cadeiras Argus por Katrina verde e mandar de novo."]],
    ["P22", [motivos[0], 5, "Reunião com os noivos marcada para a próxima terça."]],
    ["P15", [motivos[1] || motivos[0], 2, "Pré-reserva confirmada por WhatsApp; aguardando o sinal."]],
    ["P17", [motivos[0], 4, "Mãe da debutante quer ver as poltronas pessoalmente no showroom."]],
  ];
  for (const [k, [motivo, dias, obs]] of contatos) {
    if (E.comercial["contato:" + k] || !P(k)) continue;
    await rpc("comercial_followup_registrar", { p_empresa: C.EMPRESA, p_tipo: "pedido", p_alvo: P(k).id, p_motivo: motivo, p_proximo: C.dia(dias), p_observacao: obs });
    E.comercial["contato:" + k] = true; C.gravarEstado({ comercial: E.comercial });
    console.log("ok - contato registrado no pedido " + P(k).numero);
  }
  // segundo contato num orçamento (histórico com mais de um contato)
  if (!E.comercial["contato2:P20"] && P("P20")) {
    await rpc("comercial_followup_registrar", { p_empresa: C.EMPRESA, p_tipo: "pedido", p_alvo: P("P20").id, p_motivo: motivos[2] || motivos[0], p_proximo: C.dia(4), p_observacao: "Noivo pediu para trocar o sofá Berlim por um modular." });
    E.comercial["contato2:P20"] = true; C.gravarEstado({ comercial: E.comercial });
  }
  for (const k of ["P23", "P24"]) {
    if (E.comercial["cancelado:" + k] || !P(k)) continue;
    await rpc("comercial_followup_registrar", { p_empresa: C.EMPRESA, p_tipo: "pedido", p_alvo: P(k).id, p_motivo: motivos[0], p_proximo: C.dia(1), p_observacao: "Liguei, cliente disse que ia pensar." });
    const motivoFim = k === "P23" ? "Fechou com outro fornecedor, mais barato." : "O evento da empresa foi cancelado.";
    await rpc("comercial_followup_nao_fechou", { p_empresa: C.EMPRESA, p_tipo: "pedido", p_alvo: P(k).id, p_motivo: motivos[motivos.length - 1] || motivos[0], p_observacao: motivoFim });
    E.comercial["cancelado:" + k] = true; C.gravarEstado({ comercial: E.comercial });
    console.log("ok - pedido " + P(k).numero + " não vai fechar (cancelado com motivo)");
  }
  if (!E.comercial["confirmou:P7"] && P("P7")) {
    await rpc("comercial_confirmar_datas_registrar", { p_empresa: C.EMPRESA, p_pedido: P("P7").id, p_observacao: "Studio Ramos confirmou por WhatsApp: entrega sexta 10h, coleta domingo de manhã." });
    E.comercial["confirmou:P7"] = true; C.gravarEstado({ comercial: E.comercial });
    console.log("ok - datas do pedido " + P("P7").numero + " confirmadas com a decoradora");
  }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
