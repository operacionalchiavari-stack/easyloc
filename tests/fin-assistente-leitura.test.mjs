// node --test tests/fin-assistente-leitura.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../supabase/functions/financeiro-assistente/leitura.mjs";

test("lerNumero: formatos brasileiros e internacionais", () => {
  assert.equal(L.lerNumero("1.234,56"), 1234.56);
  assert.equal(L.lerNumero("-320,00"), -320);
  assert.equal(L.lerNumero("(320,00)"), -320);
  assert.equal(L.lerNumero("320,00 D"), -320);
  assert.equal(L.lerNumero("320,00 C"), 320);
  assert.equal(L.lerNumero("R$ 1.500,00"), 1500);
  assert.equal(L.lerNumero("-150.00"), -150);
  assert.equal(L.lerNumero("1,234.50"), 1234.5);
  assert.equal(L.lerNumero("1.500"), 1500);
  assert.equal(L.lerNumero(42.1), 42.1);
  assert.equal(L.lerNumero("PIX RECEBIDO"), null);
  assert.equal(L.lerNumero(""), null);
});

test("lerData: dd/mm/aaaa, ISO, Excel e AAAAMMDD", () => {
  assert.equal(L.lerData("05/10/2026"), "2026-10-05");
  assert.equal(L.lerData("05/10/26"), "2026-10-05");
  assert.equal(L.lerData("2026-10-05"), "2026-10-05");
  assert.equal(L.lerData("20261005120000[-3:BRT]"), "2026-10-05");
  assert.equal(L.lerData(46300), "2026-10-05");
  assert.equal(L.lerData("10/05/2026", "mdy"), "2026-10-05");
  assert.equal(L.lerData("31/02/2026"), null);
  assert.equal(L.lerData("SALDO"), null);
});

const itau = [
  ["Extrato Conta Corrente"], ["Agência: 1234  Conta: 56789-0"], [],
  ["Data", "Lançamento", "Valor (R$)", "Saldo (R$)"],
  ["30/09/2026", "SALDO ANTERIOR", "", "10.000,00"],
  ["01/10/2026", "PIX RECEBIDO MARIA SOUZA", "1.500,00", "11.500,00"],
  ["01/10/2026", "TAR MANUT CONTA", "-45,90", "11.454,10"],
  ["02/10/2026", "SALDO DO DIA", "", "11.454,10"],
  ["03/10/2026", "PIX ENVIADO JOAO FRETES", "-800,00", "10.654,10"],
];

test("modelo com valor com sinal e linhas de saldo puladas", () => {
  const m = { linha_inicio: 5, colunas: { data: 0, descricao: 1, valor: 2, saldo: 3, credito: -1, debito: -1, tipo_dc: -1, documento: -1, contraparte: -1, contraparte_doc: -1 }, formato_valor: "sinal", palavras_pular: ["SALDO ANTERIOR", "SALDO DO DIA"] };
  const r = L.aplicarModelo(itau, m);
  assert.equal(r.linhas.length, 3);
  assert.deepEqual(r.linhas.map((l) => l.valor), [1500, -45.9, -800]);
  const res = L.resumoLinhas(r.linhas);
  assert.equal(res.periodo_ini, "2026-10-01");
  assert.equal(res.saldo_banco, 10654.1);
  assert.equal(res.saldo_data, "2026-10-03");
  assert.equal(res.entradas, 1500);
});

test("modelo com Crédito e Débito em colunas separadas + documento", () => {
  const brad = [["Data", "Histórico", "Docto.", "Crédito (R$)", "Débito (R$)", "Saldo (R$)"],
    ["01/10/2026", "TRANSF PIX REM: CLIENTE ANA", "123", "2.000,00", "", "2.000,00"],
    ["02/10/2026", "PAGTO BOLETO FORNECEDOR X", "456", "", "350,00", "1.650,00"]];
  const m = { linha_inicio: 2, colunas: { data: 0, descricao: 1, documento: 2, credito: 3, debito: 4, saldo: 5, valor: -1, tipo_dc: -1, contraparte: -1, contraparte_doc: -1 }, formato_valor: "credito_debito" };
  const r = L.aplicarModelo(brad, m);
  assert.deepEqual(r.linhas.map((l) => [l.valor, l.documento]), [[2000, "123"], [-350, "456"]]);
});

test("modelo valor + coluna Entrada/Saída", () => {
  const bb = [["Data", "Lançamento", "Detalhes", "Valor", "Tipo Lançamento"],
    ["01/10/2026", "Pix - Recebido", "ANA LIMA", "500,00", "Entrada"],
    ["01/10/2026", "Pagamento de Boleto", "ENERGIA", "200,00", "Saída"]];
  const m = { linha_inicio: 2, colunas: { data: 0, descricao: 1, valor: 3, tipo_dc: 4, credito: -1, debito: -1, documento: -1, contraparte: 2, contraparte_doc: -1, saldo: -1 }, descricao_extra: [2], formato_valor: "valor_dc", saida_dc: ["Saída"] };
  const r = L.aplicarModelo(bb, m);
  assert.deepEqual(r.linhas.map((l) => l.valor), [500, -200]);
  assert.equal(r.linhas[0].descricao, "Pix - Recebido · ANA LIMA");
  assert.equal(r.linhas[0].contraparte, "ANA LIMA");
});

test("fitid estável e sem duplicar lançamentos iguais no mesmo dia", () => {
  const a = L.comFitid([{ data: "2026-10-01", valor: -10, descricao: "TARIFA" }, { data: "2026-10-01", valor: -10, descricao: "TARIFA" }]);
  assert.notEqual(a[0].fitid, a[1].fitid);
  const b = L.comFitid([{ data: "2026-10-01", valor: -10, descricao: "TARIFA" }, { data: "2026-10-01", valor: -10, descricao: "TARIFA" }]);
  assert.deepEqual(a.map((x) => x.fitid), b.map((x) => x.fitid));
});

test("assinatura igual para o mesmo layout com dados diferentes", () => {
  const outro = itau.map((l) => [...l]); outro[5] = ["15/10/2026", "OUTRA COISA", "9,00", "1,00"];
  assert.equal(L.assinaturaGrade(itau), L.assinaturaGrade(outro));
});

test("candidatos: valor + nome + número do pedido", () => {
  const titulos = [
    { tipo: "receber", id: "a", aberto: 1500, valor: 1500, nome: "Maria Souza", descricao: "Pedido 12 · locacao", vencimento: "2026-10-01", pedido_numero: "12" },
    { tipo: "receber", id: "b", aberto: 1500, valor: 1500, nome: "Carlos Lima", descricao: "Pedido 30", vencimento: "2026-11-20", pedido_numero: "30" },
    { tipo: "pagar", id: "c", aberto: 1500, valor: 1500, nome: "X", descricao: "", vencimento: "2026-10-01" },
  ];
  const c = L.candidatosDaLinha({ data: "2026-10-01", valor: 1500, descricao: "PIX RECEBIDO MARIA SOUZA" }, titulos);
  assert.equal(c[0].t.id, "a");
  assert.ok(c[0].pontos - c[1].pontos >= 30);
  assert.ok(!c.some((x) => x.t.id === "c"));
});

test("chave da regra igual à do banco", () => {
  assert.equal(L.chaveRegra("PIX ENVIADO 12/10 João Fretes LTDA."), "pix enviado joao fretes ltda");
});

test("começa no cabeçalho: o primeiro lançamento não se perde quando não há SALDO ANTERIOR", () => {
  const m = { linha_cabecalho: 4, linha_inicio: 6, colunas: { data: 0, descricao: 1, valor: 2, saldo: 3 }, formato_valor: "sinal", palavras_pular: ["SALDO ANTERIOR"] };
  const outro = [["Extrato"], [], [], ["Data", "Lançamento", "Valor (R$)", "Saldo (R$)"], ["08/10/2026", "TAR MANUT CONTA", "-45,90", "1,00"], ["09/10/2026", "PIX", "10,00", "11,00"]];
  assert.equal(L.aplicarModelo(outro, m).linhas.length, 2);
  assert.equal(L.aplicarModelo(itau, m).linhas.length, 3);
});

test("seq: ordem cronológica mesmo quando o banco lista do mais novo para o mais antigo", () => {
  const ls = [{ data: "2026-10-02", ordem: 0, valor: 1 }, { data: "2026-10-01", ordem: 1, valor: 2 }, { data: "2026-10-01", ordem: 2, valor: 3 }];
  assert.deepEqual(L.comSeq(ls).map((l) => l.seq), [2, 1, 0]);
});
