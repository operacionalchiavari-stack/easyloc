// Out/2026 — Escala automática do Painel Logístico (api/_gas/projetos/cronograma/Escala.js):
// equipe pelo volume, responsável entre os líderes, caminhão pela capacidade, sem pessoa/caminhão
// em horários que se cruzam e sem mexer no que alguém escolheu.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
process.env.TZ = "America/Sao_Paulo";

const pessoas = [
  { nome: "Kauã Bernardes", equipe: "montagem", lider: true },
  { nome: "Wesley Santos", equipe: "montagem", lider: true },
  { nome: "Maicon Martins", equipe: "montagem", lider: true },
  { nome: "Igor Ramos", equipe: "montagem", lider: false },
  { nome: "Vitor Machado", equipe: "montagem", lider: false },
  { nome: "Jonathan Alves", equipe: "montagem", lider: false },
  { nome: "Fabio Luiz", equipe: "carregamento", lider: true },
  { nome: "João Pedro", equipe: "carregamento", lider: false },
  { nome: "Matheus Martins", equipe: "triagem", lider: true }
];
const caminhoes = [
  { codigo: "P", modelo: "Hyundai HR", capacidade: 18, empresa: "Edir" },
  { codigo: "M", modelo: "Mercedez", capacidade: 42, empresa: "Simas" },
  { codigo: "G", modelo: "Volkswagen", capacidade: 54, empresa: "Simas" }
];
const L = (id, pedido, etapa, data, hora, sis, extra = {}) =>
  [id, pedido, "", "Cliente " + pedido, "Local", etapa, data, hora, extra.cam || "", extra.resp || "", extra.eq || "", "", "", "", "", "", "", sis];

function ambiente(linhas, volumes, freeAprovados = []) {
  const rows = [["cab"], ...linhas];
  const gravadas = [];
  const aba = {
    getDataRange: () => ({ getValues: () => rows.map(r => [...r]) }),
    getRange: (r, c) => ({ setValues: v => { gravadas.push(r); v[0].forEach((x, i) => { rows[r - 1][c - 1 + i] = x; }); } })
  };
  const pad = n => String(n).padStart(2, "0");
  const ctx = {
    Acervo: {
      usuario: () => ({ id: "u", nome: "Jonatan" }),
      pode: () => true,
      escalaBase: () => ({ pessoas, caminhoes, escala: null }),
      volumePedidos: () => volumes
    },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => aba }) },
    Utilities: { formatDate: (d, t, f) => f === "HH:mm" ? pad(d.getHours()) + ":" + pad(d.getMinutes()) : d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) },
    Logger: { log: () => {} },
    FREE_CAD_APROVADO: "APROVADO", FREE_INS_CONFIRMADO: "CONFIRMADO",
    FREE_lerLinhas_: () => ({ linhas: freeAprovados.map(n => ["id", n, "", "", "", "", "", "", "APROVADO"]) }),
    FREE_lerVagas_: () => [], FREE_lerInscricoes_: () => []
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("api/_gas/projetos/cronograma/Escala.js", "utf8"), ctx);
  return { ctx, rows, gravadas };
}

test("monta a semana sozinho: tamanho pelo volume, líder, caminhão que comporta e sem ninguém em dois lugares", () => {
  const { ctx, rows } = ambiente([
    L("a1", "100", "Carregamento", "25/10/2026", "07:00", "pa"),
    L("a2", "100", "Montagem", "25/10/2026", "09:00", "pa"),
    L("b1", "200", "Carregamento", "25/10/2026", "07:30", "pb"),
    L("b2", "200", "Montagem", "25/10/2026", "10:00", "pb"),
    L("c2", "300", "Montagem", "25/10/2026", "11:00", "pc", { resp: "Wesley Santos", eq: "Igor Ramos", cam: "G" })
  ], { pa: { m3: 30, pecas: 40 }, pb: { m3: 16, pecas: 20 } }, ["Thiago Free"]);
  const r = ctx.ESC_painel("2026-10-25", 1, true);
  const et = id => r.etapas.find(e => e.id === id);
  // escolha manual intacta
  assert.equal(rows[5][9], "Wesley Santos"); assert.equal(rows[5][10], "Igor Ramos"); assert.equal(rows[5][8], "G");
  // montagem A: 30 m³ / 8 = 4 pessoas; caminhão do carregamento; M (42) é o menor que comporta 30
  assert.equal(et("a1").caminhoes[0], "M");
  assert.equal(et("a2").caminhoes.join(), "M", "montagem vai no caminhão do carregamento");
  assert.equal(1 + et("a2").equipe.length, 4, "equipe de 4: " + JSON.stringify(et("a2")));
  assert.ok(pessoas.find(p => p.nome === et("a2").responsavel).lider, "responsável é líder");
  // carregamento B cruza com o A: outro caminhão e o Fabio não pode estar nos dois
  assert.notEqual(et("b1").caminhoes[0], "M");
  assert.equal(et("b1").caminhoes[0], "P", "16 m³ cabe no P (18)");
  assert.notEqual(et("b1").responsavel, et("a1").responsavel);
  // ninguém em dois lugares ao mesmo tempo (Wesley e Igor estão no pedido 300, que cruza com os outros)
  r.etapas.forEach(e => assert.equal(e.conflitos.length, 0, e.id + ": " + e.conflitos));
  assert.ok(![et("a2"), et("b2")].some(e => [e.responsavel, ...e.equipe].some(n => /Wesley|Igor/.test(n))), "Wesley e Igor já estão ocupados");
  // o único free cobre o 2º carregamento (sem fixo livre); a montagem B cruza com tudo: fica sem gente e o painel avisa
  assert.ok(et("b1").equipe.includes("Thiago Free"), "free completa o carregamento B");
  assert.ok(et("b2").avisos.some(a => /Equipe pequena: 0 de 2/.test(a)) && et("b2").avisos.some(a => /Sem responsável/.test(a)), JSON.stringify(et("b2").avisos));
  assert.equal(r.preenchidas, 4);
});

test("falta gente: completa com free aprovado e avisa quando não há líder", () => {
  const { ctx } = ambiente([
    L("x1", "500", "Montagem", "26/10/2026", "09:00", "px"),
    L("y1", "600", "Montagem", "26/10/2026", "09:00", "py"),
    L("z1", "700", "Montagem", "26/10/2026", "09:00", "pz"),
    L("w1", "800", "Montagem", "26/10/2026", "09:00", "pw")
  ], { px: { m3: 16 }, py: { m3: 16 }, pz: { m3: 16 }, pw: { m3: 16 } }, ["Thiago Free"]);
  const r = ctx.ESC_painel("2026-10-26", 1, true);
  const todos = r.etapas.flatMap(e => [e.responsavel, ...e.equipe].filter(Boolean));
  assert.equal(new Set(todos).size, todos.length, "ninguém repetido: " + todos);
  assert.ok(todos.includes("Thiago Free"), "free entrou para completar");
  assert.equal(r.etapas.filter(e => !e.responsavel).length, 1, "só 3 líderes para 4 montagens");
  r.etapas.forEach(e => assert.equal(e.conflitos.length, 0, e.id + ": " + e.conflitos));
});

test("logística salvando uma pessoa já ocupada: avisa o conflito e só grava se confirmar", () => {
  const { ctx, rows } = ambiente([
    L("a2", "100", "Montagem", "25/10/2026", "09:00", "", { resp: "Kauã Bernardes", eq: "Igor Ramos", cam: "M" }),
    L("b2", "200", "Montagem", "25/10/2026", "10:00", "", { resp: "Wesley Santos", eq: "Vitor Machado", cam: "G" })
  ], {});
  const r1 = ctx.ESC_salvarEtapa("b2", { responsavel: "Wesley Santos", equipe: ["Igor Ramos"], caminhoes: ["M"] }, false);
  assert.equal(r1.ok, false);
  assert.ok(r1.conflitos.some(c => /Igor Ramos/.test(c)) && r1.conflitos.some(c => /Caminhão M/.test(c)), JSON.stringify(r1));
  assert.equal(rows[2][10], "Vitor Machado", "não gravou");
  const r2 = ctx.ESC_salvarEtapa("b2", { responsavel: "Wesley Santos", equipe: ["Vitor Machado", "Jonathan Alves"], caminhoes: ["G"] }, false);
  assert.equal(r2.ok, true);
  assert.equal(rows[2][10], "Vitor Machado|Jonathan Alves");
});

test("abrir o painel sem pedir para preencher não grava nada", () => {
  const { ctx, gravadas } = ambiente([L("a1", "100", "Montagem", "25/10/2026", "09:00", "pa")], { pa: { m3: 10 } });
  const r = ctx.ESC_painel("2026-10-25", 7, false);
  assert.equal(gravadas.length, 0); assert.equal(r.etapas.length, 1); assert.equal(r.etapas[0].sugerido, 2);
});

test("etapa já passada nunca é preenchida", () => {
  const { ctx, gravadas } = ambiente([L("v1", "900", "Montagem", "01/01/2020", "09:00", "pv")], {});
  ctx.ESC_painel("2020-01-01", 1, true);
  assert.equal(gravadas.length, 0);
});
