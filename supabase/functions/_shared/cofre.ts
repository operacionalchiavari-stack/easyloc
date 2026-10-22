// Cofre: cifra dados sensíveis antes de gravar no banco (out/2026).
// AES-256-GCM com a chave ACERVO_COFRE_CHAVE (32 bytes em base64), que só existe nos segredos das Edge Functions:
// quem tem acesso só ao banco (cópia, backup, SQL) vê "cofre:v1:..." e não consegue abrir.
// O "contexto" (ex.: "zapi:<empresa>:client_token") entra como dado autenticado: o valor cifrado de uma
// empresa/campo não abre em outro. Formato: cofre:v1:<iv base64>:<cifra+tag base64>.
// Valor sem o prefixo (gravado antes do cofre) volta como está, para a migração não quebrar nada.
// ATENÇÃO: sem a chave os dados não voltam. Ela tem cópia guardada fora do sistema (ver CLAUDE.md).

const PREFIXO = "cofre:v1:";
let chaveCache: CryptoKey | null = null;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const deB64 = (texto: string) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

async function chave() {
  if (chaveCache) return chaveCache;
  const segredo = Deno.env.get("ACERVO_COFRE_CHAVE");
  if (!segredo) throw new Error("Cofre sem chave (ACERVO_COFRE_CHAVE).");
  const bruto = deB64(segredo.trim());
  if (bruto.length !== 32) throw new Error("ACERVO_COFRE_CHAVE precisa ter 32 bytes.");
  chaveCache = await crypto.subtle.importKey("raw", bruto, "AES-GCM", false, ["encrypt", "decrypt"]);
  return chaveCache;
}

export const estaCifrado = (valor: unknown) => typeof valor === "string" && valor.startsWith(PREFIXO);

export async function cifrar(valor: string | null | undefined, contexto: string): Promise<string> {
  const texto = String(valor ?? "");
  if (!texto || estaCifrado(texto)) return texto;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifra = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(contexto) },
    await chave(),
    new TextEncoder().encode(texto),
  );
  return `${PREFIXO}${b64(iv)}:${b64(new Uint8Array(cifra))}`;
}

export async function decifrar(valor: string | null | undefined, contexto: string): Promise<string> {
  const texto = String(valor ?? "");
  if (!estaCifrado(texto)) return texto;
  const [ivB64, cifraB64] = texto.slice(PREFIXO.length).split(":");
  try {
    const claro = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: deB64(ivB64), additionalData: new TextEncoder().encode(contexto) },
      await chave(),
      deB64(cifraB64),
    );
    return new TextDecoder().decode(claro);
  } catch {
    throw new Error("Não foi possível abrir um dado protegido (chave ou contexto diferente).");
  }
}

// Credenciais do WhatsApp (zapi_credenciais): os três segredos da linha.
const CAMPOS_ZAPI = ["instance_token", "client_token", "webhook_secret"] as const;

export async function fecharCredenciaisZapi<T extends Record<string, any>>(linha: T, empresaId: string): Promise<T> {
  const saida: Record<string, any> = { ...linha };
  for (const campo of CAMPOS_ZAPI) {
    if (campo in saida) saida[campo] = await cifrar(saida[campo], `zapi:${empresaId}:${campo}`);
  }
  return saida as T;
}

export async function abrirCredenciaisZapi<T extends Record<string, any> | null>(linha: T): Promise<T> {
  if (!linha) return linha;
  const saida: Record<string, any> = { ...linha };
  for (const campo of CAMPOS_ZAPI) {
    if (campo in saida) saida[campo] = await decifrar(saida[campo], `zapi:${linha.empresa_id}:${campo}`);
  }
  return saida as T;
}

// Índice cego: acha um registro pelo valor (ex.: login do Meu Bônus pelo CPF) sem guardar o valor aberto.
// HMAC-SHA256 com a mesma chave do cofre; sem a chave não dá para testar CPFs um a um contra o índice.
// Mesmo cálculo em api/_gas/cofre.js (servidor da Vercel).
export async function indice(valor: string, tipo: string): Promise<string> {
  const segredo = Deno.env.get("ACERVO_COFRE_CHAVE");
  if (!segredo) throw new Error("Cofre sem chave (ACERVO_COFRE_CHAVE).");
  const k = await crypto.subtle.importKey("raw", deB64(segredo.trim()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`indice:${tipo}:${valor}`));
  return Array.from(new Uint8Array(assinatura), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Máscaras que a tela mostra no lugar do dado (gravadas junto, porque o banco não consegue abrir o valor).
const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export function mascara(campo: string, valor: unknown): string {
  const t = String(valor ?? "").trim();
  if (!t) return "";
  const d = soDigitos(t);
  if (campo === "cpf") return `•••.•••.•••-${d.slice(-2)}`;
  if (campo === "salario") return "R$ ••••••";
  if ((campo === "pix" || campo === "pix_chave") && t.includes("@")) return `${t[0]}•••@${t.split("@")[1]}`;
  const fim = (d || t).slice(-2);
  return `••••${fim}`;
}

// Dados do RH que vão cifrados. Contexto "rh:<empresa>:<campo>".
export const CAMPOS_RH = ["cpf", "salario", "rg", "pis", "ctps", "agencia", "conta", "pix"] as const;
export const contextoRh = (empresaId: string, campo: string) => `rh:${empresaId}:${campo}`;

// Prepara dados do RH para gravar: cifra o que veio, calcula máscara e o índice do CPF.
// Só mexe nos campos que vieram (campo ausente = "não mudou", o banco mantém o valor). Valor vazio apaga.
// O RG pode vir solto (ficha) ou dentro de dados_rh (cadastro). Salário: salario_bruto vira salario_cifrado.
export async function protegerRh(dados: Record<string, any>, empresaId: string, veio: (campo: string) => boolean) {
  const saida: Record<string, any> = { ...dados };
  const mascaras: Record<string, string> = {};
  const cif = (campo: string, v: string) => cifrar(v, contextoRh(empresaId, campo));
  for (const campo of ["cpf", "pis", "ctps", "agencia", "conta", "pix", "rg"]) {
    const noDadosRh = campo === "rg" && saida.dados_rh && typeof saida.dados_rh === "object" && !("rg" in saida);
    if (!veio(campo)) {
      if (noDadosRh) { saida.dados_rh = { ...saida.dados_rh }; delete saida.dados_rh.rg; } else delete saida[campo];
      if (campo === "cpf") delete saida.cpf_hash;
      continue;
    }
    let valor = String((noDadosRh ? saida.dados_rh.rg : saida[campo]) ?? "").trim();
    if (estaCifrado(valor)) throw new Error("Valor protegido inválido.");
    if (campo === "cpf") {
      valor = valor.replace(/\D/g, "");
      if (valor && valor.length !== 11) throw new Error("CPF deve ter 11 dígitos");
      saida.cpf_hash = valor ? await indice(valor, "cpf") : "";
    }
    const cifrado = await cif(campo, valor);
    if (noDadosRh) saida.dados_rh = { ...saida.dados_rh, rg: cifrado }; else saida[campo] = cifrado;
    mascaras[campo] = mascara(campo, valor);
  }
  if ("salario_bruto" in saida) {
    if (veio("salario_bruto")) {
      const n = Number(saida.salario_bruto || 0);
      saida.salario_cifrado = n > 0 ? await cif("salario", String(n)) : "";
      mascaras.salario = n > 0 ? mascara("salario", n) : "";
    }
    delete saida.salario_bruto;
  }
  saida.cofre_mascaras = mascaras;
  return saida;
}

// Abre os campos pedidos de uma pessoa (para quem tem a permissão de ver; quem chama registra a consulta).
export async function abrirRh(empresaId: string, campo: string, valor: unknown) {
  return decifrar(String(valor ?? ""), contextoRh(empresaId, campo === "salario_cifrado" ? "salario" : campo));
}

// Genérico (contas do Financeiro e próximos): cifra só os campos listados que vieram; vazio apaga.
// contexto(campo) dá o dado autenticado de cada um (ex.: "fin:<empresa>:pix_chave").
export async function protegerCampos(dados: Record<string, any>, campos: readonly string[], contexto: (campo: string) => string, veio: (campo: string) => boolean) {
  const saida: Record<string, any> = { ...dados };
  const mascaras: Record<string, string> = {};
  for (const campo of campos) {
    if (!veio(campo)) { delete saida[campo]; continue; }
    const valor = String(saida[campo] ?? "").trim();
    if (estaCifrado(valor)) throw new Error("Valor protegido inválido.");
    saida[campo] = valor ? await cifrar(valor, contexto(campo)) : null;
    mascaras[campo] = mascara(campo, valor);
  }
  return { dados: saida, mascaras };
}
export const CAMPOS_FIN_CONTA = ["agencia", "conta", "titular_documento", "pix_chave"] as const;
export const contextoFin = (empresaId: string, campo: string) => `fin:${empresaId}:${campo}`;
