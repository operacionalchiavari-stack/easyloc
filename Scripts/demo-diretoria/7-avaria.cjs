// Etapa 7: triagem da volta do pedido P4 com uma peça danificada (recamier com o tecido rasgado), mandada para a Forração.
// Mesma chamada da tela de conferência (operacao_concluir_retorno_avarias com danificados, foto e setor): abre a O.S e a
// avaria aparece na posição final do Financeiro.
const C = require("./comum.cjs");
(async () => {
  const E = C.lerEstado();
  const p = E.pedidos.P4;
  if ((E.operacao?.P4 || 0) >= 7) return console.log("P4 já teve a volta conferida");
  const { client: sb } = await C.sessaoDe(E.usuario.email, E.usuario.senha);
  const rpc = async (n, a) => { const { data, error } = await sb.rpc(n, a); if (error) throw Error(n + ": " + error.message); return data; };
  await rpc("operacao_iniciar_conferencia", { p_pedido: p.id, p_etapa: "retorno" });
  const pecas = await rpc("operacao_conferencia_pecas", { p_pedido: p.id, p_grupo: true });
  const q = {}; for (const x of pecas) q[x.chave] = Number(x.esperado ?? x.quantidade ?? 0);
  const rec = pecas.find((x) => /recamier/i.test(x.nome || x.item_nome || ""));
  if (!rec) throw Error("recamier não encontrado: " + pecas.map((x) => x.nome || x.item_nome).join(", "));
  // foto da avaria: a própria foto do item (foto fictícia de evidência)
  const item = C.check(await sb.from("itens").select("foto_url").eq("id", rec.item_id).single());
  const bytes = Buffer.from(await (await fetch(item.foto_url)).arrayBuffer());
  const caminho = `${C.EMPRESA}/${p.id}/avaria-${require("crypto").randomUUID()}.jpg`;
  C.check(await sb.storage.from("evidencias-operacionais").upload(caminho, bytes, { contentType: "image/jpeg" }), "foto");
  await rpc("operacao_concluir_retorno_avarias", { p_pedido: p.id, p_etapa: "retorno", p_aceitar_faltas: false, p_quantidades: q,
    p_observacoes: { [rec.chave]: "Tecido do assento rasgado no canto (provável arrasto no deck)." }, p_primeira: null,
    p_danificados: { [rec.chave]: 1 }, p_fotos: { [rec.chave]: [caminho] }, p_setores: { [rec.chave]: "Forração" } });
  C.gravarEstado({ operacao: { P4: 7 } });
  console.log("ok - volta do pedido " + p.numero + " conferida, 1 recamier danificado mandado para a Forração");
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
