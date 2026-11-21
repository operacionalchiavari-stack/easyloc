// ATENÇÃO (19/11/2026): este roteiro CONCILIA os extratos e a fatura do Bradesco, mas o usuário queria só os arquivos
// para conciliar ele mesmo na frente do time. A conciliação foi desfeita (.tmp/desfazer-conc.sql) e os arquivos finais
// estão em outputs/demo-diretoria/financeiro/. NÃO rode de novo sem tirar as etapas 3 e 4.
// Etapa 8: Financeiro de ponta a ponta para a demonstração (bancos e cartões), pelas mesmas funções das telas.
//  1. cadastra 2 cartões de crédito (Bancos e cartões → Cartões → Configurar cartões);
//  2. compras no cartão: "Novo pagamento" com forma Cartão de crédito e um pedido do Compras pago no cartão;
//  3. fatura do Bradesco Visa de 12/11: importa o arquivo, confere linha a linha e marca como conferida;
//  4. histórico dos 3 bancos de 01/10 a 16/11: arquivo OFX → Clara lê → importa → organiza → confirma (como na tela);
//  5. gera os arquivos para a demonstração ao vivo (extratos de 17 a 19/11 e a fatura do Itaú Mastercard de 17/11),
//     em outputs/demo-diretoria/financeiro/.
// Uso: node Scripts/demo-diretoria/8-financeiro.cjs   (pode rodar de novo: o que já foi feito é pulado)
const C = require("./comum.cjs");
const fs = require("fs"), path = require("path");

const CONTA = { loc: "971d56de-cd5a-44dd-89b9-fdab49631e6a", frete: "bac13940-7962-4a09-858c-420c59fcb11c", mont: "ca316a3b-5e70-409b-b563-6763be7a8d1e" };
const BANCO = { loc: { nome: "Bradesco", banco: "237", ag: "3415", cc: "0078214-6" }, frete: { nome: "Itaú", banco: "341", ag: "0981", cc: "45127-3" }, mont: { nome: "Banco do Brasil", banco: "001", ag: "2234-7", cc: "61092-X" } };
const CAT = { aluguel: "456b5ed9-46c3-4090-a88f-09bfe68f7c28", folha: "71bec073-4bda-4a62-aec8-7874c2188b7f", impostos: "c699532c-790d-4492-88fd-31390fadc09c", tarifas: "8c287e57-d361-4ff3-8ff0-b2051561293b",
  marketing: "b60754b5-caad-40e5-a439-3d71f1abcbe3", outras: "ccdf2ff2-6637-455e-b05a-b28f2b817fe7", fretes: "9b86c70e-17fe-4f6b-811a-acec0bf57a70", equipe: "f78f0d3d-1914-4fd1-8059-04ba3bbbab16",
  manutencao: "de2e90ca-ad76-4ede-95d7-ab50d917d9b5", almox: "87d759a6-3db5-4700-a329-7fab1b473a66" };
const CC = { com: "a84ead4d-1441-4b9d-bff8-5e8775c5b563", log: "c9281f3a-b6ca-458e-ace9-445bda7fbf11", est: "7cc40ca5-f3b4-4de7-9069-8e076f4df5f8", adm: "5cd277f8-b83d-42e6-939c-3ddd665d004f" };
const PASTA = path.join(C.raiz, "outputs", "demo-diretoria", "financeiro");
const HOJE = C.dia(0);

// recebimentos que a carga anterior tinha lançado à mão (data, pedido, valor): agora entram pelo extrato do banco
const RECEB_HIST = [["2026-10-10", 5, 3368.66], ["2026-10-14", 5, 560], ["2026-10-18", 5, 89.88], ["2026-10-18", 6, 7573.5], ["2026-10-22", 6, 1400], ["2026-10-26", 6, 325.5],
  ["2026-10-26", 7, 15779.6], ["2026-10-29", 8, 5877.43], ["2026-10-30", 7, 1400], ["2026-11-01", 9, 7125.96], ["2026-11-02", 8, 560], ["2026-11-03", 10, 6054.44], ["2026-11-03", 7, 33.6],
  ["2026-11-05", 9, 560], ["2026-11-06", 8, 140.14], ["2026-11-06", 11, 4676.53], ["2026-11-07", 12, 3129.31], ["2026-11-07", 10, 560], ["2026-11-09", 13, 5047.17], ["2026-11-10", 14, 7674.78],
  ["2026-11-10", 11, 30.24], ["2026-11-11", 10, 130.9], ["2026-11-11", 12, 89.88], ["2026-11-16", 4, 3973.84]];
// recebimentos que caem no banco entre 17 e 19/11 (arquivo da demonstração): [data, pedido, valor] — valor null = parcela aberta inteira
const RECEB_VIVO = [["2026-11-19", 17, 14741.26], ["2026-11-19", 18, 6452.35], ["2026-11-18", 15, null, "locacao"], ["2026-11-19", 16, null, "locacao"],
  ["2026-11-18", 9, null, "frete"], ["2026-11-18", 13, null, "frete"], ["2026-11-19", 14, null, "frete"],
  ["2026-11-18", 11, null, "montagem"], ["2026-11-18", 12, null, "montagem"], ["2026-11-18", 13, null, "montagem"], ["2026-11-19", 14, null, "montagem"]];

const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const r2 = (v) => Math.round(Number(v) * 100) / 100;

function cartaoVencimento(c, compra, parcela) {   // mesma conta da tela (financeiro.js)
  const d = new Date(compra + "T12:00:00"), ult = (y, m) => new Date(y, m + 1, 0).getDate();
  let y = d.getFullYear(), m = d.getMonth();
  if (d.getDate() >= Math.min(c.dia_virada, ult(y, m))) m += 1;
  m += Math.max(1, parcela) - 1;
  if (!(c.dia_vencimento > c.dia_virada)) m += 1;
  const dv = new Date(y, m, 1); y = dv.getFullYear(); m = dv.getMonth();
  return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(Math.min(c.dia_vencimento, ult(y, m))).padStart(2, "0");
}

// ---------- OFX (formato que os bancos exportam; a tela lê sem precisar aprender o layout)
function ofx({ tipo = "banco", banco, conta, linhas, saldo, saldoData }) {
  const dt = (d) => d.replace(/-/g, "") + "120000[-3:BRT]";
  const ini = linhas.map((l) => l.data).sort()[0], fim = linhas.map((l) => l.data).sort().pop();
  const trs = linhas.map((l) => ["<STMTTRN>", "<TRNTYPE>" + (l.valor < 0 ? "DEBIT" : "CREDIT"), "<DTPOSTED>" + dt(l.data), "<TRNAMT>" + l.valor.toFixed(2), "<FITID>" + l.fitid,
    "<MEMO>" + l.descricao, "</STMTTRN>"].join("\n")).join("\n");
  const cab = "OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n";
  const son = "<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>" + dt(HOJE) + "<LANGUAGE>POR<FI><ORG>" + banco.nome + "<FID>" + banco.banco + "</FI></SONRS></SIGNONMSGSRSV1>";
  const lista = "<BANKTRANLIST><DTSTART>" + dt(ini) + "<DTEND>" + dt(fim) + "\n" + trs + "\n</BANKTRANLIST>";
  const bal = saldo != null ? "<LEDGERBAL><BALAMT>" + saldo.toFixed(2) + "<DTASOF>" + dt(saldoData || fim) + "</LEDGERBAL>" : "";
  if (tipo === "cartao")
    return cab + "<OFX>\n" + son + "\n<CREDITCARDMSGSRSV1><CCSTMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><CCSTMTRS><CURDEF>BRL<CCACCTFROM><ACCTID>" + conta + "</CCACCTFROM>\n" + lista + "\n" + bal + "</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>\n</OFX>\n";
  return cab + "<OFX>\n" + son + "\n<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>" + banco.banco + "<BRANCHID>" + banco.ag + "<ACCTID>" + banco.cc + "<ACCTTYPE>CHECKING</BANKACCTFROM>\n" + lista + "\n" + bal + "</STMTRS></STMTTRNRS></BANKMSGSRSV1>\n</OFX>\n";
}
function lerOfx(txt) {   // cópia do lerOfx da tela
  const out = [];
  const blocos = txt.split(/<STMTTRN>/i).slice(1);
  const tag = (b, t) => { const m = b.match(new RegExp("<" + t + ">([^<\\r\\n]*)", "i")); return m ? m[1].trim() : ""; };
  blocos.forEach((b, i) => {
    const dt = tag(b, "DTPOSTED"), v = Number(tag(b, "TRNAMT").replace(",", "."));
    if (!dt || !v) return;
    out.push({ fitid: tag(b, "FITID") || dt + "-" + v + "-" + i, data: dt.slice(0, 4) + "-" + dt.slice(4, 6) + "-" + dt.slice(6, 8), valor: v, descricao: tag(b, "MEMO") || tag(b, "NAME") });
  });
  return out;
}

(async () => {
  const E = C.lerEstado();
  E.fin ||= {};
  const salvar = () => C.gravarEstado({ fin: E.fin });
  const { client: sb } = await C.sessaoDe(E.usuario.email, E.usuario.senha);
  const rpc = async (n, a) => { const { data, error } = await sb.rpc(n, a); if (error) throw Error(n + ": " + error.message); return data; };
  const clara = async (action, body) => {
    const { data, error } = await sb.functions.invoke("financeiro-assistente", { body: { action, empresa_id: C.EMPRESA, ...body } });
    if (error) { let m = error.message; try { const j = await error.context?.json?.(); if (j?.error) m = j.error; } catch { } throw Error(action + ": " + m); }
    if (data?.error) throw Error(action + ": " + data.error);
    return data;
  };
  fs.mkdirSync(PASTA, { recursive: true });

  // ===================================================== 1. cartões
  if (!E.fin.cartoes) {
    const ids = {};
    for (const [k, d] of Object.entries({
      A: { nome: "Bradesco Empresarial Visa", bandeira: "Visa", final: "4521", conta_id: CONTA.loc, dia_virada: 5, dia_vencimento: 12, limite: 30000, ativo: true },
      B: { nome: "Itaú Empresas Mastercard", bandeira: "Mastercard", final: "7788", conta_id: CONTA.frete, dia_virada: 10, dia_vencimento: 17, limite: 15000, ativo: true },
    })) {
      await rpc("fin_cartao_salvar", { p_empresa: C.EMPRESA, p_dados: { id: null, ...d } });
      ids[k] = C.check(await sb.from("fin_cartoes").select("id").eq("empresa_id", C.EMPRESA).eq("final", d.final).single()).id;
      await C.anotar([{ tabela: "fin_cartoes", chave: "id", valor: ids[k] }]);
    }
    E.fin.cartoes = ids; salvar();
    console.log("ok - 2 cartões cadastrados");
  }
  const cartoes = Object.fromEntries(C.check(await sb.from("fin_cartoes").select("*").eq("empresa_id", C.EMPRESA)).map((c) => [c.id, c]));
  const cA = cartoes[E.fin.cartoes.A], cB = cartoes[E.fin.cartoes.B];

  // ===================================================== 2. compras no cartão ("Novo pagamento")
  const COMPRAS = [
    // [chave, cartão, data da compra, fornecedor, descrição, valor total, parcelas, categoria, centro]
    ["A1", cA, "2026-10-06", "Google Cloud Brasil", "Google Workspace (8 contas) · outubro", 336, 1, "outras", "adm"],
    ["A2", cA, "2026-10-09", "Canva Pty", "Canva Pro · assinatura mensal", 64.9, 1, "marketing", "com"],
    ["A3", cA, "2026-10-14", "Meta Platforms", "Impulsionamento Instagram · casamentos de verão", 450, 1, "marketing", "com"],
    ["A4", cA, "2026-10-21", "Kalunga", "Papelaria do escritório (pastas, etiquetas, toner)", 187.35, 1, "outras", "adm"],
    ["A5", cA, "2026-10-28", "Leroy Merlin", "Furadeira de impacto + jogo de brocas para a marcenaria", 899.7, 3, "manutencao", "est"],
    ["A6", cA, "2026-11-02", "Mercado Livre", "Extensões e filtros de linha para montagem", 238.9, 1, "almox", "log"],
    ["A7", cA, "2026-11-06", "Google Cloud Brasil", "Google Workspace (8 contas) · novembro", 336, 1, "outras", "adm"],
    ["A8", cA, "2026-11-07", "Meta Platforms", "Impulsionamento Instagram · debutantes", 450, 1, "marketing", "com"],
    ["A9", cA, "2026-11-10", "iFood", "Almoço da equipe de montagem no evento do Solar das Palmeiras", 312.4, 1, "equipe", "log"],
    ["B1", cB, "2026-10-11", "Posto Shell Rodovia", "Diesel caminhão G3", 389.5, 1, "fretes", "log"],
    ["B2", cB, "2026-10-18", "Sem Parar", "Pedágios da frota · setembro/outubro", 146.2, 1, "fretes", "log"],
    ["B3", cB, "2026-10-23", "Posto Ipiranga Centro", "Diesel caminhão M3", 412.8, 1, "fretes", "log"],
    ["B4", cB, "2026-10-30", "Auto Center Estrada", "Troca de óleo e filtros do caminhão G3", 680, 1, "fretes", "log"],
    ["B5", cB, "2026-11-04", "Posto Shell Rodovia", "Diesel caminhão G3", 401.1, 1, "fretes", "log"],
    ["B6", cB, "2026-11-06", "Amazon", "Cintas de amarração para carga (10 un.)", 239.9, 1, "almox", "log"],
    ["B7", cB, "2026-11-12", "Posto Shell Rodovia", "Diesel caminhão P1", 395, 1, "fretes", "log"],
  ];
  E.fin.compras ||= {};
  for (const [k, c, data, forn, desc, total, n, cat, cc] of COMPRAS) {
    if (E.fin.compras[k]) continue;
    const base = r2(total / n);
    const parcelas = Array.from({ length: n }, (_, i) => ({ vencimento: cartaoVencimento(c, data, i + 1), valor: i === n - 1 ? r2(total - base * (n - 1)) : base }));
    await rpc("fin_criar_titulo", { p_empresa: C.EMPRESA, p_tipo: "pagar", p_cab: { descricao: desc, documento: "", categoria_id: CAT[cat], centro_custo_id: CC[cc], conta_id: c.conta_id,
      forma: "Cartão de crédito", emissao: data, competencia: data, observacoes: "", fornecedor_id: "", fornecedor_nome: forn, codigo_barras: "", requer_aprovacao: false, cartao_id: c.id, cartao_compra_em: data }, p_parcelas: parcelas });
    const ids = C.check(await sb.from("fin_pagar").select("id").eq("empresa_id", C.EMPRESA).eq("cartao_id", c.id).eq("descricao", desc).eq("cartao_compra_em", data)).map((x) => x.id);
    await C.anotar(ids.map((id) => ({ tabela: "fin_pagar", chave: "id", valor: id })));
    E.fin.compras[k] = ids; salvar();
    console.log(`ok - compra no cartão ${c.nome}: ${desc} (${n}x)`);
  }

  // pedido de compra do Compras pago no cartão (carrinho de carga): cotação → proposta → pedido → pagamento no cartão
  if (!E.fin.pcCartao) {
    const op = async (acao, dados) => { const { data, error } = await sb.rpc("compras_operar", { p_empresa: C.EMPRESA, p_acao: acao, p_dados: dados }); if (error) throw Error(acao + ": " + error.message); return data; };
    const forn = Object.fromEntries(C.check(await sb.from("fornecedores").select("id,nome_fantasia,nome_razao_social").eq("empresa_id", C.EMPRESA)).map((f) => [f.nome_fantasia || f.nome_razao_social, f.id]));
    const nec = C.check(await sb.from("compras_registros").select("id,dados").eq("empresa_id", C.EMPRESA).eq("tipo", "necessidade")).find((x) => /Carrinho de carga/i.test(x.dados.descricao_item || x.dados.material_nome || ""));
    const r = await op("criar_cotacao", { items: [{ material_id: nec.dados.material_id || null, codigo: nec.dados.codigo || "", nome: nec.dados.descricao_item || nec.dados.material_nome, especificacao: "Plataforma em aço, rodas de borracha, 300 kg",
      unidade: nec.dados.unidade, quantidade_cotada: Number(nec.dados.quantidade_faltante), need_allocations: [{ purchase_request_id: nec.id, quantidade_alocada: Number(nec.dados.quantidade_faltante) }] }],
      supplier_ids: [forn["Ferragens Base Sul"], forn["Marcenaria Forma & Arte"]], prazo_desejado: C.dia(5), observacoes: "Para o carregamento dos móveis grandes." });
    const cotId = r?.id || r?.registro?.id || r?.cotacao?.id;
    await C.anotar([{ tabela: "compras_registros", chave: "id", valor: cotId }]);
    const cot = C.check(await sb.from("compras_registros").select("*").eq("id", cotId).single());
    const it = cot.dados.items[0];
    await op("salvar_proposta", { id: cotId, supplier_id: forn["Ferragens Base Sul"], header: { condicao_pagamento: "Cartão de crédito à vista", frete: 0, validade_proposta: C.dia(7), data_prevista_entrega: C.dia(3), observacao: "Retirar no balcão ou entrega grátis." },
      items: [{ quotation_item_id: it.id, nao_cotado: false, valor_unitario: 1289 }] });
    await op("salvar_proposta", { id: cotId, supplier_id: forn["Marcenaria Forma & Arte"], header: { condicao_pagamento: "Boleto 28 dias", frete: 80, validade_proposta: C.dia(7), data_prevista_entrega: C.dia(8), observacao: "Fabricação sob encomenda." },
      items: [{ quotation_item_id: it.id, nao_cotado: false, valor_unitario: 1450 }] });
    await op("gerar_pedidos", { id: cotId, selections: [{ quotation_item_id: it.id, supplier_id: forn["Ferragens Base Sul"], quantidade: it.quantidade_cotada }] });
    const ped = C.check(await sb.from("compras_registros").select("id,numero,dados").eq("empresa_id", C.EMPRESA).eq("tipo", "pedido").order("numero", { ascending: false }).limit(1).single());
    await C.anotar([{ tabela: "compras_registros", chave: "id", valor: ped.id }]);
    await rpc("compras_pedido_pagamento", { p_empresa: C.EMPRESA, p_pedido: ped.id, p_forma: "cartao", p_parcelas: [{ vencimento: cartaoVencimento(cB, HOJE, 1), valor: 1289 }], p_total: 1289, p_cartao: cB.id, p_cartao_compra: HOJE });
    E.fin.pcCartao = ped.id; salvar();
    console.log("ok - pedido de compra PC-" + ped.numero + " (carrinho de carga) pago no Itaú Mastercard");
  }

  const faturas = async (c) => rpc("fin_cartao_faturas", { p_empresa: C.EMPRESA, p_cartao: c.id });
  const faturaDe = async (c, venc) => (await faturas(c)).find((f) => f.vencimento === venc);
  const comprasDaFatura = async (fid) => C.check(await sb.from("fin_pagar").select("id,descricao,valor,aberto,cartao_compra_em,parcela,parcelas,fornecedor_nome").eq("fatura_id", fid).neq("status", "cancelado"));

  // ===================================================== 3. fatura do Bradesco Visa de 12/11 (conciliada aqui)
  const fA = await faturaDe(cA, "2026-11-12");
  if (!fA) throw Error("fatura de 12/11 do Bradesco Visa não encontrada");
  const linhasFatA = [];
  for (const k of ["A1", "A2", "A3", "A4", "A5", "A6"]) {
    const t = C.check(await sb.from("fin_pagar").select("descricao,valor,cartao_compra_em,parcela,parcelas,fornecedor_nome").eq("id", E.fin.compras[k][0]).single());
    linhasFatA.push({ data: t.cartao_compra_em, descricao: sem(t.fornecedor_nome) + (t.parcelas > 1 ? " PARC " + String(t.parcela).padStart(2, "0") + "/" + String(t.parcelas).padStart(2, "0") : ""), valor: Number(t.valor) });
  }
  linhasFatA.push({ data: "2026-10-15", descricao: "ANUIDADE CARTAO EMPRESARIAL 01/12", valor: 39.9 });
  linhasFatA.sort((a, b) => a.data.localeCompare(b.data));
  const totalFatA = r2(linhasFatA.reduce((s, l) => s + l.valor, 0));
  fs.mkdirSync(path.join(PASTA, "historico"), { recursive: true });
  fs.writeFileSync(path.join(PASTA, "historico", "fatura-bradesco-visa-vencimento-12-11.ofx"),
    ofx({ tipo: "cartao", banco: BANCO.loc, conta: "4521", linhas: linhasFatA.map((l, i) => ({ ...l, valor: -l.valor, fitid: "BVISA2611" + String(i + 1).padStart(3, "0") })), saldo: -totalFatA, saldoData: "2026-11-05" }));
  if (!E.fin.faturaA) {
    const r = await rpc("fin_cartao_fatura_importar", { p_empresa: C.EMPRESA, p_fatura: fA.id, p_arquivo: "fatura-bradesco-visa-vencimento-12-11.ofx", p_linhas: linhasFatA });
    console.log(`ok - fatura Bradesco Visa 12/11 importada: ${r.linhas} linhas, ${r.ligadas} bateram com compras do sistema`);
    const det = await rpc("fin_cartao_fatura_detalhe", { p_empresa: C.EMPRESA, p_fatura: fA.id });
    for (const l of det.linhas || []) {
      if (l.situacao !== "pendente") continue;
      if (/ANUIDADE/.test(l.descricao)) await rpc("fin_cartao_linha_acao", { p_empresa: C.EMPRESA, p_linha: l.id, p_acao: { tipo: "lancar", categoria_id: CAT.tarifas, centro_custo_id: CC.adm, fornecedor_nome: "Bradesco Cartões", descricao: "Anuidade do cartão empresarial (1/12)" } });
      else {
        const t = (await comprasDaFatura(fA.id)).find((x) => Math.abs(Number(x.valor) - Number(l.valor)) < 0.01);
        if (t) await rpc("fin_cartao_linha_acao", { p_empresa: C.EMPRESA, p_linha: l.id, p_acao: { tipo: "vincular", titulo_id: t.id } });
        else console.log("  linha sem par na fatura A: " + l.descricao + " " + l.valor);
      }
    }
    await rpc("fin_cartao_fatura_salvar", { p_empresa: C.EMPRESA, p_fatura: fA.id, p_dados: { conferida: true } });
    E.fin.faturaA = true; salvar();
    console.log("ok - fatura Bradesco Visa 12/11 conferida (total " + totalFatA.toFixed(2) + ")");
  }

  // ===================================================== 4. histórico dos bancos (01/10 a 16/11)
  const receber = C.check(await sb.from("fin_receber").select("id,pedido_numero,componente,conta_id,cliente_nome,valor,aberto,vencimento,status").eq("empresa_id", C.EMPRESA).neq("status", "cancelado"));
  const usados = new Set();
  const acharReceber = (num, valor, comp) => {
    const lista = receber.filter((r) => String(r.pedido_numero) === String(num) && !usados.has(r.id) && (comp ? r.componente === comp : true));
    const t = valor == null ? lista.filter((r) => Number(r.aberto) > 0).sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0]
      : lista.find((r) => Math.abs(Number(r.aberto) - valor) < 0.01) || lista.find((r) => Math.abs(Number(r.valor) - valor) < 0.01);
    if (!t) throw Error(`parcela do pedido ${num} (${valor ?? comp}) não encontrada`);
    usados.add(t.id); return t;
  };
  const contaChave = (id) => Object.keys(CONTA).find((k) => CONTA[k] === id);
  const descPix = (t, i) => {
    const nome = sem(t.cliente_nome).replace(/[^A-Z0-9 ]/g, "").slice(0, 28);
    return i % 3 === 0 ? `PIX RECEBIDO - ${nome} PED ${t.pedido_numero}` : i % 3 === 1 ? `PIX RECEB ${nome}` : `TED RECEBIDA ${nome}`;
  };

  // linhas de cada conta: { data, valor, descricao, fitid, esperado }
  const L = { loc: [], frete: [], mont: [] };
  let seq = 0;
  const add = (conta, data, valor, descricao, esperado) => L[conta].push({ data, valor: r2(valor), descricao, fitid: BANCO[conta].banco + data.replace(/-/g, "") + String(++seq).padStart(4, "0"), esperado });
  const lancar = (cat, cc, nome, descricao) => ({ tipo: "lancar", categoria_id: CAT[cat], centro_custo_id: CC[cc], nome, descricao });

  RECEB_HIST.forEach(([data, num, valor], i) => {
    const t = acharReceber(num, valor);
    add(contaChave(t.conta_id), data, valor, descPix(t, i), { tipo: "baixar", titulos: [{ tipo: "receber", id: t.id, valor }] });
  });
  for (const mes of ["10", "11"]) {
    add("loc", `2026-${mes}-03`, -69.9, "TARIFA BANCARIA CESTA PJ 3", lancar("tarifas", "adm", "Bradesco", "Tarifa da cesta de serviços PJ"));
    add("loc", `2026-${mes}-05`, -8500, "PAGTO BOLETO IMOBILIARIA SOUZA LIMA", lancar("aluguel", "adm", "Imobiliária Souza Lima", "Aluguel do galpão"));
    add("loc", `2026-${mes}-06`, -21380, "PAGTO SALARIOS FOLHA LOTE 00" + mes, lancar("folha", "adm", "Folha de pagamento", "Salários do mês"));
    add("loc", `2026-${mes}-13`, mes === "10" ? -1284.37 : -1198.62, "PAGTO CONTA ENERGIA ELETRICA", lancar("aluguel", "adm", "Concessionária de energia", "Conta de energia do galpão"));
    add("loc", `2026-${mes}-15`, -289.9, "DEB AUT VIVO EMPRESAS", lancar("aluguel", "adm", "Vivo Empresas", "Internet e telefonia"));
    add("frete", `2026-${mes}-03`, -39.9, "TAR MANUTENCAO CONTA", lancar("tarifas", "adm", "Itaú", "Tarifa de manutenção da conta"));
    add("mont", `2026-${mes}-03`, -45, "TARIFA PACOTE SERVICOS", lancar("tarifas", "adm", "Banco do Brasil", "Tarifa do pacote de serviços"));
  }
  add("loc", "2026-10-20", -6940.12, "PAGTO DARF SIMPLES NACIONAL", lancar("impostos", "adm", "Receita Federal", "Simples Nacional · competência setembro"));
  add("loc", "2026-11-12", -totalFatA, "PAGTO FATURA CARTAO VISA FINAL 4521", { tipo: "fatura", fatura_id: fA.id });
  add("loc", "2026-10-15", -6000, "TED MESMA TITULARIDADE BB 2234", { tipo: "transferencia", conta_id: CONTA.mont });
  add("mont", "2026-10-15", 6000, "TED RECEBIDA MESMA TITULARIDADE BRADESCO", { tipo: "transferencia", par: true });
  add("frete", "2026-10-22", -1340, "PIX ENVIADO MECANICA DIESEL SAO JORGE", lancar("fretes", "log", "Mecânica Diesel São Jorge", "Revisão dos freios do caminhão M3"));
  add("frete", "2026-11-08", -180, "PIX ENVIADO BORRACHARIA DO ZE", lancar("fretes", "log", "Borracharia do Zé", "Conserto de pneu do caminhão P1"));
  [["2026-10-25", "MARCOS VINICIUS SOUZA", 300], ["2026-10-25", "LEANDRO PEREIRA DIAS", 300], ["2026-10-25", "JULIANA ALVES COSTA", 300], ["2026-11-08", "MARCOS VINICIUS SOUZA", 300], ["2026-11-08", "RAFAEL NUNES LIMA", 280]]
    .forEach(([d, n, v]) => add("mont", d, -v, "PIX ENVIADO " + n, lancar("equipe", "log", n.replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase()), "Diária de montador freelancer")));

  const conciliarConta = async (k, linhas, nomeArq) => {
    if (E.fin["hist:" + k]) return;
    const conta = CONTA[k];
    linhas.sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor);
    const { data: ct } = await sb.from("fin_contas").select("saldo_inicial").eq("id", conta).single();
    // saldo do banco linha a linha (precisa ficar positivo: sobe o saldo inicial se precisar)
    let s = Number(ct.saldo_inicial), min = s;
    for (const l of linhas) { s = r2(s + l.valor); min = Math.min(min, s); }
    if (min < 3000) {
      const novo = r2(Number(ct.saldo_inicial) + (3000 - min) + 5000);
      C.check(await sb.from("fin_contas").update({ saldo_inicial: novo }).eq("id", conta));
      s = r2(s + novo - Number(ct.saldo_inicial));
      console.log(`  saldo inicial da conta ${BANCO[k].nome} ajustado para ${novo}`);
    }
    E.fin["saldo:" + k] = s;
    const txt = ofx({ banco: BANCO[k], linhas, saldo: s, saldoData: linhas[linhas.length - 1].data });
    fs.writeFileSync(path.join(PASTA, "historico", nomeArq), txt);
    // como a tela: Clara lê → importa → organiza
    const lido = await clara("ler_extrato", { conta_id: conta, arquivo: { nome: nomeArq, formato: "ofx", linhas: lerOfx(txt), banco: BANCO[k].nome } });
    const r = lido.resumo || {};
    await rpc("fin_importar_extrato_lote", { p_empresa: C.EMPRESA, p_conta: conta, p_linhas: lido.linhas.map(({ ordem, ...x }) => x),
      p_lote: { arquivo: lido.arquivo, formato: lido.formato, banco: lido.banco, periodo_ini: r.periodo_ini, periodo_fim: r.periodo_fim, saldo_banco: r.saldo_banco, saldo_data: r.saldo_data } });
    let o = await clara("organizar", { conta_id: conta, refazer: false }), rod = 1;
    while (o.restantes > 0 && o.total > 0 && rod++ < 12) o = await clara("organizar", { conta_id: conta });
    const ext = C.check(await sb.from("fin_extrato").select("id,fitid,valor,descricao,sugestao,baixa_id,transferencia_grupo,conciliado_em").eq("conta_id", conta));
    let iguais = 0, trocadas = 0;
    for (const l of linhas) {
      const x = ext.find((e) => e.fitid === l.fitid || String(e.fitid).startsWith("doc-" + l.fitid + "-")); if (!x) throw Error("linha não importada: " + l.descricao);
      if (x.conciliado_em || x.baixa_id || x.transferencia_grupo) { iguais++; continue; }
      const sug = x.sugestao?.acao; let acao = l.esperado;
      if (acao.par) {   // a outra ponta da transferência: já foi registrada ao conciliar a outra conta
        const { data: mv } = await sb.from("fin_movimentos").select("transferencia_grupo").eq("conta_id", conta).eq("tipo", "transferencia").is("cancelado_em", null).eq("valor", Math.abs(l.valor));
        acao = { tipo: "transferencia", grupo: mv?.[0]?.transferencia_grupo };
      }
      const bate = sug && sug.tipo === acao.tipo && (acao.tipo !== "baixar" || JSON.stringify((sug.titulos || []).map((t) => t.id).sort()) === JSON.stringify(acao.titulos.map((t) => t.id).sort()))
        && (acao.tipo !== "fatura" || sug.fatura_id === acao.fatura_id) && (acao.tipo !== "lancar" || sug.categoria_id === acao.categoria_id);
      if (bate) { iguais++; acao = { ...sug }; } else { trocadas++; console.log(`  ajustei a sugestão: ${l.data} ${l.descricao} (${l.valor}) · Clara: ${sug ? sug.tipo + (sug.categoria_id ? "/" + sug.categoria_id.slice(0, 4) : "") : "nenhuma"} → ${acao.tipo}`); }
      await rpc("fin_assist_aplicar", { p_empresa: C.EMPRESA, p_extrato: x.id, p_acao: { ...acao, resumo: x.sugestao?.resumo || "" } });
    }
    const lote = C.check(await sb.from("fin_extrato").select("lote_id").eq("id", ext[0].id).single()).lote_id;
    await C.anotar([{ tabela: "fin_extrato_lotes", chave: "id", valor: lote }]);
    E.fin["hist:" + k] = true; salvar();
    console.log(`ok - ${BANCO[k].nome}: ${linhas.length} lançamentos de 01/10 a 16/11 conciliados (${iguais} como a Clara sugeriu, ${trocadas} ajustados)`);
  };
  await conciliarConta("loc", L.loc, "extrato-bradesco-locacao-01-10-a-16-11.ofx");
  await conciliarConta("frete", L.frete, "extrato-itau-frete-01-10-a-16-11.ofx");
  await conciliarConta("mont", L.mont, "extrato-bb-montagem-01-10-a-16-11.ofx");

  // ===================================================== 5. arquivos da demonstração ao vivo
  const V = { loc: [], frete: [], mont: [] };
  const addV = (conta, data, valor, descricao) => V[conta].push({ data, valor: r2(valor), descricao, fitid: BANCO[conta].banco + data.replace(/-/g, "") + String(++seq).padStart(4, "0") });
  // libera as parcelas já usadas no histórico e procura as abertas de agora
  const receber2 = C.check(await sb.from("fin_receber").select("id,pedido_numero,componente,conta_id,cliente_nome,valor,aberto,vencimento,status").eq("empresa_id", C.EMPRESA).neq("status", "cancelado"));
  receber.length = 0; receber.push(...receber2); usados.clear();
  RECEB_VIVO.forEach(([data, num, valor, comp], i) => {
    const t = acharReceber(num, valor, comp);
    addV(contaChave(t.conta_id), data, valor ?? Number(t.aberto), descPix(t, i + 1));
  });
  // contas a pagar que vencem agora
  const pagar = C.check(await sb.from("fin_pagar").select("id,documento,origem,fornecedor_nome,aberto,vencimento,status").eq("empresa_id", C.EMPRESA).in("status", ["pendente", "aprovado", "programado"]));
  const pc2 = pagar.find((p) => p.documento === "PC-000002");
  if (pc2) addV("loc", "2026-11-18", -Number(pc2.aberto), "PIX ENVIADO TINTAS HORIZONTE LTDA");
  pagar.filter((p) => p.origem === "bv").forEach((p) => addV("loc", "2026-11-18", -Number(p.aberto), "PIX ENVIADO " + sem(p.fornecedor_nome).slice(0, 30)));
  pagar.filter((p) => p.origem === "free").forEach((p) => addV("mont", "2026-11-18", -Number(p.aberto), "PIX ENVIADO " + sem(p.fornecedor_nome).slice(0, 30)));
  addV("loc", "2026-11-18", -312.45, "PAGTO CONTA AGUA E ESGOTO");
  addV("loc", "2026-11-19", -3000, "TED MESMA TITULARIDADE BB 2234");
  addV("mont", "2026-11-19", 3000, "TED RECEBIDA MESMA TITULARIDADE BRADESCO");
  addV("frete", "2026-11-18", -145, "PIX ENVIADO AUTO PECAS ESTRADA");
  addV("frete", "2026-11-19", -2.5, "TARIFA PIX ENVIADO");
  // fatura do Itaú Mastercard de 17/11 (arquivo para conciliar ao vivo) e o pagamento dela no Itaú
  const fB = await faturaDe(cB, "2026-11-17");
  const linhasFatB = [];
  for (const k of ["B1", "B2", "B3", "B4", "B5", "B6"]) {
    const t = C.check(await sb.from("fin_pagar").select("valor,cartao_compra_em,fornecedor_nome").eq("id", E.fin.compras[k][0]).single());
    linhasFatB.push({ data: t.cartao_compra_em, descricao: sem(t.fornecedor_nome), valor: Number(t.valor) });
  }
  linhasFatB.push({ data: "2026-10-15", descricao: "ANUIDADE MASTERCARD EMPRESAS 01/12", valor: 29.9 },
    { data: "2026-10-19", descricao: "UBER *TRIP HELP.UBER.COM", valor: 48.7 },
    { data: "2026-10-25", descricao: "ESTORNO SEM PARAR", valor: -18.3 },
    { data: "2026-10-27", descricao: "IFOOD *RESTAURANTE SABOR CASEIRO", valor: 186.4 });
  linhasFatB.sort((a, b) => a.data.localeCompare(b.data));
  const totalFatB = r2(linhasFatB.reduce((s, l) => s + l.valor, 0));
  addV("frete", "2026-11-17", -totalFatB, "PAGTO FATURA CARTAO MASTERCARD FINAL 7788");

  const vivos = { loc: "extrato-bradesco-locacao-17-a-19-11.ofx", frete: "extrato-itau-frete-17-a-19-11.ofx", mont: "extrato-bb-montagem-17-a-19-11.ofx" };
  for (const k of Object.keys(V)) {
    V[k].sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor);
    const saldo = r2(E.fin["saldo:" + k] + V[k].reduce((s, l) => s + l.valor, 0));
    fs.writeFileSync(path.join(PASTA, vivos[k]), ofx({ banco: BANCO[k], linhas: V[k], saldo, saldoData: "2026-11-19" }));
  }
  fs.writeFileSync(path.join(PASTA, "fatura-itau-mastercard-vencimento-17-11.ofx"),
    ofx({ tipo: "cartao", banco: BANCO.frete, conta: "7788", linhas: linhasFatB.map((l, i) => ({ ...l, valor: -l.valor, fitid: "IMC2611" + String(i + 1).padStart(3, "0") })), saldo: -totalFatB, saldoData: "2026-11-10" }));
  E.fin.vivo = { V, totalFatB, linhasFatB }; salvar();
  console.log("ok - arquivos da demonstração gravados em " + PASTA);
  for (const k of Object.keys(V)) console.log(`   ${vivos[k]}: ${V[k].length} lançamentos`);
  console.log(`   fatura-itau-mastercard-vencimento-17-11.ofx: ${linhasFatB.length} linhas, total ${totalFatB.toFixed(2)}`);
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
