// Etapa 4b: cotações, propostas, pedidos de compra e pagamento (mesmas chamadas da tela de Compras).
const C = require("./comum.cjs");
// anotações próprias (o roteiro dos pedidos grava o arquivo comum ao mesmo tempo)
const fsx = require("fs"), arqC = require("path").join(C.raiz, ".tmp", "demo-diretoria-compras.json");
const lerC = () => { try { return JSON.parse(fsx.readFileSync(arqC, "utf8")); } catch { return {}; } };

(async () => {
  const E = { ...C.lerEstado(), compras: lerC() };
  const { client: sb } = await C.sessaoDe(E.usuario.email, E.usuario.senha);
  const op = async (acao, dados) => { const { data, error } = await sb.rpc("compras_operar", { p_empresa: C.EMPRESA, p_acao: acao, p_dados: dados }); if (error) throw Error(acao + ": " + error.message); return data; };
  const forn = Object.fromEntries(C.check(await sb.from("fornecedores").select("id,nome_fantasia,nome_razao_social").eq("empresa_id", C.EMPRESA)).map((f) => [f.nome_fantasia || f.nome_razao_social, f.id]));
  const necs = C.check(await sb.from("compras_registros").select("id,dados").eq("empresa_id", C.EMPRESA).eq("tipo", "necessidade"));
  const nec = (txt) => necs.find((n) => (n.dados.descricao_item || n.dados.material_nome || "").startsWith(txt));
  const item = (n) => ({ material_id: n.dados.material_id || null, codigo: n.dados.codigo || "", nome: n.dados.descricao_item || n.dados.material_nome, especificacao: "", unidade: n.dados.unidade,
    quantidade_cotada: Number(n.dados.quantidade_faltante), need_allocations: [{ purchase_request_id: n.id, quantidade_alocada: Number(n.dados.quantidade_faltante) }] });
  const idDe = (r) => r?.id || r?.registro?.id || r?.cotacao?.id;
  const cotacao = async (id) => C.check(await sb.from("compras_registros").select("*").eq("id", id).single());
  E.compras.cot ||= {};

  /* cotação 1: 3 materiais, 3 fornecedores, 2 propostas, vira 2 pedidos */
  if (!E.compras.cot.c1) {
    const r = await op("criar_cotacao", { items: [item(nec("Feltro")), item(nec("Verniz")), item(nec("Plástico bolha"))],
      supplier_ids: [forn["Ferragens Base Sul"], forn["Tintas Horizonte"], forn["Limpeza Brilho Total"]], prazo_desejado: C.dia(4), observacoes: "Urgente: feltro para o evento do Solar das Palmeiras." });
    E.compras.cot.c1 = idDe(r); fsx.writeFileSync(arqC, JSON.stringify(E.compras, null, 1)); await C.anotar([{ tabela: "compras_registros", chave: "id", valor: E.compras.cot.c1 }]);
    console.log("ok - cotação 1 aberta");
  }
  const c1 = await cotacao(E.compras.cot.c1);
  const its = c1.dados.items, porNome = (t) => its.find((i) => i.nome.startsWith(t));
  if (!E.compras.cot.c1prop) {
    await op("salvar_proposta", { id: c1.id, supplier_id: forn["Ferragens Base Sul"], header: { condicao_pagamento: "28 dias no boleto", frete: 35, validade_proposta: C.dia(10), data_prevista_entrega: C.dia(3), observacao: "Entrega no galpão pela manhã." },
      items: [{ quotation_item_id: porNome("Feltro").id, nao_cotado: false, valor_unitario: 17.5 }, { quotation_item_id: porNome("Verniz").id, nao_cotado: false, valor_unitario: 189 }, { quotation_item_id: porNome("Plástico").id, nao_cotado: false, valor_unitario: 139.9 }] });
    await op("salvar_proposta", { id: c1.id, supplier_id: forn["Tintas Horizonte"], header: { condicao_pagamento: "À vista no PIX", frete: 0, validade_proposta: C.dia(7), data_prevista_entrega: C.dia(2), observacao: "Frete grátis acima de R$ 500." },
      items: [{ quotation_item_id: porNome("Feltro").id, nao_cotado: false, valor_unitario: 19.9 }, { quotation_item_id: porNome("Verniz").id, nao_cotado: false, valor_unitario: 168 }, { quotation_item_id: porNome("Plástico").id, nao_cotado: true }] });
    E.compras.cot.c1prop = true; fsx.writeFileSync(arqC, JSON.stringify(E.compras, null, 1));
    console.log("ok - 2 propostas recebidas na cotação 1 (Limpeza Brilho Total ainda não respondeu)");
  }
  if (!E.compras.cot.c1ped) {
    const sel = [{ quotation_item_id: porNome("Feltro").id, supplier_id: forn["Ferragens Base Sul"], quantidade: porNome("Feltro").quantidade_cotada },
      { quotation_item_id: porNome("Plástico").id, supplier_id: forn["Ferragens Base Sul"], quantidade: porNome("Plástico").quantidade_cotada },
      { quotation_item_id: porNome("Verniz").id, supplier_id: forn["Tintas Horizonte"], quantidade: porNome("Verniz").quantidade_cotada }];
    const r = await op("gerar_pedidos", { id: c1.id, selections: sel });
    E.compras.cot.c1ped = r; fsx.writeFileSync(arqC, JSON.stringify(E.compras, null, 1));
    console.log("ok - pedidos de compra gerados");
  }
  /* pagamento de cada pedido no Contas a Pagar (bloco "Valores e pagamento") */
  const pedidos = C.check(await sb.from("compras_registros").select("id,numero,dados").eq("empresa_id", C.EMPRESA).eq("tipo", "pedido"));
  for (const p of pedidos) {
    if (E.compras["pag:" + p.id]) continue;
    const total = Math.round((p.dados.items || []).reduce((t, i) => t + Number(i.valor_unitario || 0) * Number(i.quantidade || i.quantidade_comprada || i.quantidade_cotada || 0), 0) * 100 + Number(p.dados.frete || 0) * 100) / 100;
    const ehPix = /PIX/i.test(p.dados.condicao_pagamento || "");
    const parcelas = ehPix ? [{ vencimento: C.dia(1), valor: total }] : [{ vencimento: C.dia(28), valor: total }];
    const { error } = await sb.rpc("compras_pedido_pagamento", { p_empresa: C.EMPRESA, p_pedido: p.id, p_forma: ehPix ? "pix" : "boleto", p_parcelas: parcelas, p_total: total });
    if (error) console.log("pagamento do pedido " + p.numero + ": " + error.message);
    else { E.compras["pag:" + p.id] = true; fsx.writeFileSync(arqC, JSON.stringify(E.compras, null, 1)); console.log("ok - pedido de compra PC-" + p.numero + " · R$ " + total + " no Contas a Pagar"); }
    await C.anotar([{ tabela: "compras_registros", chave: "id", valor: p.id }]);
  }

  /* cotação 2: tecido, esperando propostas */
  if (!E.compras.cot.c2) {
    const r = await op("criar_cotacao", { items: [item(nec("Tecido linho"))], supplier_ids: [forn["Tecidos Aurora Ltda"], forn["Marcenaria Forma & Arte"]], prazo_desejado: C.dia(10), observacoes: "Tom off white igual à amostra enviada por WhatsApp." });
    E.compras.cot.c2 = idDe(r); fsx.writeFileSync(arqC, JSON.stringify(E.compras, null, 1)); await C.anotar([{ tabela: "compras_registros", chave: "id", valor: E.compras.cot.c2 }]);
    const c2 = await cotacao(E.compras.cot.c2);
    await op("salvar_proposta", { id: c2.id, supplier_id: forn["Tecidos Aurora Ltda"], header: { condicao_pagamento: "30/60 dias", frete: 60, validade_proposta: C.dia(15), data_prevista_entrega: C.dia(7), observacao: "Rolo de 50 m; vendemos o rolo inteiro." },
      items: [{ quotation_item_id: c2.dados.items[0].id, nao_cotado: false, valor_unitario: 41.9 }] });
    console.log("ok - cotação 2 aberta (1 de 2 propostas)");
  }
  /* cotação de serviço: portão de carga */
  if (!E.compras.cot.c3) {
    const r = await op("criar_cotacao", { items: [item(nec("Portão de carga"))], supplier_ids: [forn["Marcenaria Forma & Arte"], forn["Ferragens Base Sul"]], prazo_desejado: C.dia(2), observacoes: "Serviço urgente: atrasa o carregamento." });
    E.compras.cot.c3 = idDe(r); fsx.writeFileSync(arqC, JSON.stringify(E.compras, null, 1)); await C.anotar([{ tabela: "compras_registros", chave: "id", valor: E.compras.cot.c3 }]);
    const c3 = await cotacao(E.compras.cot.c3);
    await op("salvar_proposta", { id: c3.id, supplier_id: forn["Marcenaria Forma & Arte"], header: { condicao_pagamento: "À vista", frete: 0, validade_proposta: C.dia(5), data_prevista_entrega: C.dia(1), observacao: "Troca das roldanas e regulagem do trilho." },
      items: [{ quotation_item_id: c3.dados.items[0].id, nao_cotado: false, valor_unitario: 480 }] });
    console.log("ok - cotação de serviço do portão (1 proposta)");
  }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
