// Cofre das Edge Functions (supabase/functions/_shared/cofre.ts) rodando no Node com a mesma Web Crypto do Deno.
// Rodar: node --test tests/cofre.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
globalThis.Deno = { env: { get: (k) => (k === "ACERVO_COFRE_CHAVE" ? process.env.CHAVE_TESTE : undefined) } };
process.env.CHAVE_TESTE = randomBytes(32).toString("base64");
// O Node trata .ts fora de pacote "module" como CommonJS: copia como .mts (mesmo código, só a extensão muda).
const copia = join(mkdtempSync(join(tmpdir(), "cofre-")), "cofre.mts");
writeFileSync(copia, readFileSync(new URL("../supabase/functions/_shared/cofre.ts", import.meta.url)));
const { cifrar, decifrar, estaCifrado, fecharCredenciaisZapi, abrirCredenciaisZapi, protegerRh, indice } = await import(pathToFileURL(copia).href);
process.env.ACERVO_COFRE_CHAVE = process.env.CHAVE_TESTE;
const cofreVercel = (await import("node:module")).createRequire(import.meta.url)("../api/_gas/cofre.js");

test("ida e volta, e o texto não aparece no valor guardado", async () => {
  const v = await cifrar("token-super-secreto", "zapi:e1:client_token");
  assert.ok(estaCifrado(v));
  assert.ok(!v.includes("token-super-secreto"));
  assert.equal(await decifrar(v, "zapi:e1:client_token"), "token-super-secreto");
});
test("cada gravação gera um valor diferente", async () => {
  assert.notEqual(await cifrar("x", "c"), await cifrar("x", "c"));
});
test("valor de outra empresa ou de outro campo não abre", async () => {
  const v = await cifrar("abc", "zapi:e1:client_token");
  await assert.rejects(decifrar(v, "zapi:e2:client_token"));
  await assert.rejects(decifrar(v, "zapi:e1:instance_token"));
});
test("valor adulterado não abre", async () => {
  const v = await cifrar("abc", "c");
  const ruim = v.slice(0, -4) + (v.endsWith("AAAA") ? "BBBB" : "AAAA");
  await assert.rejects(decifrar(ruim, "c"));
});
test("texto antigo (sem prefixo) e vazio passam como estão", async () => {
  assert.equal(await decifrar("antigo", "c"), "antigo");
  assert.equal(await cifrar("", "c"), "");
});
test("credenciais da Z-API: fecha os 3 segredos, mantém o instance_id", async () => {
  const linha = { empresa_id: "e1", instance_id: "INST", instance_token: "t1", client_token: "t2", webhook_secret: "t3" };
  const fechada = await fecharCredenciaisZapi(linha, "e1");
  assert.equal(fechada.instance_id, "INST");
  for (const c of ["instance_token", "client_token", "webhook_secret"]) assert.ok(estaCifrado(fechada[c]), c);
  assert.deepEqual(await abrirCredenciaisZapi(fechada), linha);
});

test("cadastro: CPF, RG e salário cifrados; o servidor da Vercel abre igual", async () => {
  const entrada = { nome: "Ana", cpf: "123.456.789-09", salario_bruto: 3500.5, dados_rh: { rg: "12.345.678-9", data_nascimento: "1990-01-01" } };
  const p = await protegerRh(entrada, "emp", (c) => c === "rg" ? "rg" in entrada.dados_rh : c in entrada);
  assert.ok(estaCifrado(p.cpf) && estaCifrado(p.salario_cifrado) && estaCifrado(p.dados_rh.rg));
  assert.equal(p.dados_rh.data_nascimento, "1990-01-01");
  assert.ok(!("salario_bruto" in p));
  assert.equal(p.cpf_hash, await indice("12345678909", "cpf"));
  assert.equal(p.cpf_hash, cofreVercel.indice("12345678909", "cpf"));
  assert.deepEqual(p.cofre_mascaras, { cpf: "•••.•••.•••-09", rg: "••••89", salario: "R$ ••••••" });
  const [aberto] = cofreVercel.abrirFuncionarios([{ id: "1", cpf: p.cpf, salario_bruto: 0, salario_cifrado: p.salario_cifrado }], "emp");
  assert.equal(aberto.cpf, "12345678909"); assert.equal(aberto.salario_bruto, 3500.5); assert.ok(!("salario_cifrado" in aberto));
});
test("cadastro: campo que não veio some do envio (o banco mantém o de antes)", async () => {
  const p = await protegerRh({ nome: "Ana", cpf: "", salario_bruto: 0, dados_rh: { rg: "", endereco: "Rua 1" } }, "emp", () => false);
  assert.ok(!("cpf" in p) && !("cpf_hash" in p) && !("salario_cifrado" in p) && !("salario_bruto" in p) && !("rg" in p.dados_rh));
  assert.equal(p.dados_rh.endereco, "Rua 1");
});
test("cadastro: CPF incompleto é recusado e valor já cifrado vindo de fora também", async () => {
  await assert.rejects(protegerRh({ cpf: "123" }, "emp", () => true), /11 dígitos/);
  const c = await cifrar("x", "rh:emp:pis");
  await assert.rejects(protegerRh({ pis: c }, "emp", () => true), /inválido/);
});
