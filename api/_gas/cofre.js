// Cofre no servidor da Vercel (out/2026): mesmo formato de supabase/functions/_shared/cofre.ts.
// Abre CPF e salário do RH para a Central de Metas (teto do bônus) e acha a pessoa pelo CPF no login do Meu Bônus.
// Chave: variável de ambiente ACERVO_COFRE_CHAVE (a mesma dos segredos das Edge Functions).
const crypto = require("crypto");
const PREFIXO = "cofre:v1:";

function chave() {
  const segredo = String(process.env.ACERVO_COFRE_CHAVE || "").trim();
  if (!segredo) { throw new Error("Cofre sem chave no servidor (ACERVO_COFRE_CHAVE)."); }
  const bruto = Buffer.from(segredo, "base64");
  if (bruto.length !== 32) { throw new Error("ACERVO_COFRE_CHAVE precisa ter 32 bytes."); }
  return bruto;
}
const estaCifrado = v => typeof v === "string" && v.startsWith(PREFIXO);

function decifrar(valor, contexto) {
  const texto = String(valor == null ? "" : valor);
  if (!estaCifrado(texto)) { return texto; }
  const [ivB64, cifraB64] = texto.slice(PREFIXO.length).split(":");
  const tudo = Buffer.from(cifraB64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", chave(), Buffer.from(ivB64, "base64"));
  d.setAAD(Buffer.from(contexto));
  d.setAuthTag(tudo.subarray(tudo.length - 16));
  return Buffer.concat([d.update(tudo.subarray(0, tudo.length - 16)), d.final()]).toString("utf8");
}

function indice(valor, tipo) {
  return crypto.createHmac("sha256", chave()).update(`indice:${tipo}:${valor}`).digest("hex");
}
const temChave = () => Boolean(String(process.env.ACERVO_COFRE_CHAVE || "").trim());

// Lista de rh_funcionarios_operacionais com CPF e salário abertos (a mesma forma de antes).
function abrirFuncionarios(lista, empresaId) {
  return (Array.isArray(lista) ? lista : []).map(f => {
    const salario = f.salario_cifrado ? Number(decifrar(f.salario_cifrado, `rh:${empresaId}:salario`)) : Number(f.salario_bruto || 0);
    const { salario_cifrado, ...resto } = f;
    return { ...resto, cpf: f.cpf ? decifrar(f.cpf, `rh:${empresaId}:cpf`) : f.cpf, salario_bruto: salario };
  });
}

module.exports = { decifrar, indice, estaCifrado, temChave, abrirFuncionarios };
