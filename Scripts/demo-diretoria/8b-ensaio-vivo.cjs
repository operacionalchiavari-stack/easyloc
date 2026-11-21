// Ensaio dos arquivos da demonstração ao vivo (não confirma nada): a Clara lê e organiza cada extrato e a fatura do
// Itaú Mastercard como na tela, o roteiro mostra as sugestões e depois apaga o que o ensaio importou.
const C = require("./comum.cjs");
const fs = require("fs"), path = require("path");
const PASTA = path.join(C.raiz, "outputs", "demo-diretoria", "financeiro");
const CONTA = { "extrato-bradesco-locacao-01-10-a-19-11.ofx": "971d56de-cd5a-44dd-89b9-fdab49631e6a", "extrato-itau-frete-01-10-a-19-11.ofx": "bac13940-7962-4a09-858c-420c59fcb11c", "extrato-bb-montagem-01-10-a-19-11.ofx": "ca316a3b-5e70-409b-b563-6763be7a8d1e" };
function lerOfx(txt) {
  const out = []; const tag = (b, t) => { const m = b.match(new RegExp("<" + t + ">([^<\\r\\n]*)", "i")); return m ? m[1].trim() : ""; };
  txt.split(/<STMTTRN>/i).slice(1).forEach((b, i) => { const dt = tag(b, "DTPOSTED"), v = Number(tag(b, "TRNAMT")); if (!dt || !v) return;
    out.push({ fitid: tag(b, "FITID") || dt + "-" + v + "-" + i, data: dt.slice(0, 4) + "-" + dt.slice(4, 6) + "-" + dt.slice(6, 8), valor: v, descricao: tag(b, "MEMO") }); });
  return out;
}
(async () => {
  const E = C.lerEstado();
  const { client: sb } = await C.sessaoDe(E.usuario.email, E.usuario.senha);
  const rpc = async (n, a) => { const { data, error } = await sb.rpc(n, a); if (error) throw Error(n + ": " + error.message); return data; };
  const clara = async (action, body) => { const { data, error } = await sb.functions.invoke("financeiro-assistente", { body: { action, empresa_id: C.EMPRESA, ...body } });
    if (error) { let m = error.message; try { const j = await error.context?.json?.(); if (j?.error) m = j.error; } catch { } throw Error(action + ": " + m); } return data; };
  const titulos = {};
  for (const t of C.check(await C.admin.from("fin_receber").select("id,pedido_numero,componente,cliente_nome").eq("empresa_id", C.EMPRESA))) titulos[t.id] = `pedido ${t.pedido_numero} ${t.componente} ${t.cliente_nome}`;
  for (const t of C.check(await C.admin.from("fin_pagar").select("id,documento,fornecedor_nome").eq("empresa_id", C.EMPRESA))) titulos[t.id] = `${t.documento || ""} ${t.fornecedor_nome || ""}`;
  // fatura primeiro (a sugestão "Fatura do cartão" no banco depende dela)
  const cB = C.check(await sb.from("fin_cartoes").select("id").eq("empresa_id", C.EMPRESA).eq("final", "7788").single());
  const fB = (await rpc("fin_cartao_faturas", { p_empresa: C.EMPRESA, p_cartao: cB.id })).find((f) => f.vencimento === "2026-11-17");
  const txtF = fs.readFileSync(path.join(PASTA, "fatura-itau-mastercard-vencimento-17-11.ofx"), "latin1");
  let lf = lerOfx(txtF); if (lf.filter((x) => x.valor < 0).length > lf.length / 2) lf = lf.map((x) => ({ ...x, valor: -x.valor }));
  const imp = await rpc("fin_cartao_fatura_importar", { p_empresa: C.EMPRESA, p_fatura: fB.id, p_arquivo: "ensaio.ofx", p_linhas: lf.map((x) => ({ data: x.data, descricao: x.descricao, valor: x.valor })) });
  const sug = await clara("cartao_sugerir", { fatura_id: fB.id });
  console.log(`== Fatura Itaú Mastercard: ${imp.linhas} linhas, ${imp.ligadas} bateram sozinhas`);
  for (const s of sug.sugestoes || []) console.log("   ", s.resumo || JSON.stringify(s).slice(0, 120), s.confianca ? "(" + s.confianca + ")" : "");
  try {
    for (const [arq, conta] of Object.entries(CONTA)) {
      const txt = fs.readFileSync(path.join(PASTA, arq), "latin1");
      const lido = await clara("ler_extrato", { conta_id: conta, arquivo: { nome: arq, formato: "ofx", linhas: lerOfx(txt), banco: "" } });
      const r = lido.resumo || {};
      const res = await rpc("fin_importar_extrato_lote", { p_empresa: C.EMPRESA, p_conta: conta, p_linhas: lido.linhas.map(({ ordem, ...x }) => x),
        p_lote: { arquivo: "ENSAIO " + arq, formato: lido.formato, banco: lido.banco, periodo_ini: r.periodo_ini, periodo_fim: r.periodo_fim, saldo_banco: r.saldo_banco, saldo_data: r.saldo_data } });
      let o = await clara("organizar", { conta_id: conta, refazer: false }), rod = 1;
      while (o.restantes > 0 && o.total > 0 && rod++ < 10) o = await clara("organizar", { conta_id: conta });
      const linhas = C.check(await C.admin.from("fin_extrato").select("id,lote_id,data,valor,descricao,sugestao").eq("conta_id", conta).is("conciliado_em", null).is("baixa_id", null).order("data"));
      console.log(`== ${arq} (saldo do banco ${r.saldo_banco})`);
      for (const l of linhas) { const a = l.sugestao?.acao || {};
        const det = a.tipo === "baixar" ? (a.titulos || []).map((t) => titulos[t.id] || t.id).join(" + ") : a.tipo === "fatura" ? "fatura do cartão" : a.tipo === "transferencia" ? "transferência" : a.tipo === "lancar" ? "lançar" : "";
        console.log(`   ${l.data} ${String(l.valor).padStart(10)} ${l.descricao.padEnd(44)} → ${a.tipo || "SEM SUGESTÃO"} ${det} [${l.sugestao?.confianca || ""}]`); }
      const lotes = [...new Set(linhas.map((l) => l.lote_id))];
      C.check(await C.admin.from("fin_extrato").delete().in("id", linhas.map((l) => l.id)));
      C.check(await C.admin.from("fin_extrato_lotes").delete().in("id", lotes));
    }
  } finally {
    C.check(await C.admin.from("fin_cartao_fatura_linhas").delete().eq("fatura_id", fB.id));
    C.check(await C.admin.from("fin_cartao_faturas").update({ valor_banco: null, arquivo_nome: null }).eq("id", fB.id));
    console.log("ensaio desfeito");
  }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
