// CPF e chave PIX dos Free (cofre, out/2026). O app do Free não tem login do Acervo, então esta função é pública
// (verify_jwt = false) e confere sozinha o que cada ação exige:
//  cadastrar:  valida, cifra CPF e PIX, calcula o índice do CPF e cria o cadastro (free_app_cadastrar_cofre).
//  login:      acha o Free pelo índice do CPF e confere a senha (free_app_login_cofre).
//  pix:        troca a chave PIX de quem está logado no app (token do app; free_app_pix_cofre).
//  revelar_rh: CPF e PIX completos para o pagamento dos Free — exige login da equipe, verificação em duas etapas e
//              rh.dados_sensiveis.ver; registra quem viu.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";
import { cifrar, contextoFree, decifrar, estaCifrado, indice, mascara } from "../_shared/cofre.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const resposta = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;

function cpfValido(d: string) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const dv = (soma * 10) % 11 % 10;
    if (dv !== Number(d[n])) return false;
  }
  return true;
}
const empresaDona = async () => {
  const { data, error } = await admin.rpc("gs_empresa_dona");
  if (error || !data) throw new Error("Empresa não encontrada.");
  return String(data);
};
const erroDoBanco = (e: { message?: string } | null) => String(e?.message || "Erro").replace(/^.*?ERROR:\s*/i, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
  try {
    const body = await req.json().catch(() => ({}));

    if (body.action === "cadastrar") {
      const d = body.dados && typeof body.dados === "object" ? body.dados : {};
      const cpf = String(d.cpf ?? "").replace(/\D/g, "");
      const pix = String(d.pix ?? "").trim().slice(0, 120);
      if (!cpfValido(cpf)) return resposta({ error: "CPF inválido. Confira os números." }, 400);
      if (pix.length < 5 || estaCifrado(pix)) return resposta({ error: "Informe sua chave PIX para receber os pagamentos." }, 400);
      const emp = await empresaDona();
      const { data, error } = await admin.rpc("free_app_cadastrar_cofre", { p_dados: {
        nome: d.nome, telefone: d.telefone, senha: d.senha,
        cpf: await cifrar(cpf, contextoFree(emp, "cpf")), cpf_hash: await indice(cpf, "cpf"),
        pix: await cifrar(pix, contextoFree(emp, "pix")), mascaras: { cpf: mascara("cpf", cpf), pix: mascara("pix", pix) },
      } });
      if (error) return resposta({ error: erroDoBanco(error) }, 400);
      return resposta(data);
    }

    if (body.action === "login") {
      const cpf = String(body.cpf ?? "").replace(/\D/g, "");
      if (cpf.length !== 11) return resposta({ error: "CPF ou senha incorretos." }, 400);
      const { data, error } = await admin.rpc("free_app_login_cofre", { p_cpf_hash: await indice(cpf, "cpf"), p_senha: String(body.senha ?? "") });
      if (error) return resposta({ error: erroDoBanco(error) }, 400);
      return resposta(data);
    }

    if (body.action === "pix") {
      const pix = String(body.pix ?? "").trim().slice(0, 120);
      if (pix.length < 5 || estaCifrado(pix)) return resposta({ error: "Informe uma chave PIX válida." }, 400);
      const emp = await empresaDona();
      const { error } = await admin.rpc("free_app_pix_cofre", { p_token: String(body.token ?? ""), p_pix: await cifrar(pix, contextoFree(emp, "pix")), p_mascara: mascara("pix", pix) });
      if (error) return resposta({ error: erroDoBanco(error) }, 400);
      return resposta({ ok: true });
    }

    if (body.action === "revelar_rh") {
      const authorization = req.headers.get("authorization") || "";
      const token = authorization.replace(/^Bearer\s+/i, "");
      const { data: { user } } = token ? await admin.auth.getUser(token) : { data: { user: null } };
      if (!user) return resposta({ error: "Entre no sistema para ver estes dados." }, 401);
      if (await segundaEtapaPendente(authorization)) return resposta({ error: MENSAGEM_2FA }, 403);
      const empresa = String(body.empresa_id || "");
      if (!UUID.test(empresa)) return resposta({ error: "Pedido inválido" }, 400);
      const { data: pode, error: erroPode } = await admin.rpc("funcionario_pode", { p_empresa: empresa, p_usuario: user.id, p_chave: "rh.dados_sensiveis.ver" });
      if (erroPode) throw new Error(erroPode.message);
      if (pode !== true) return resposta({ error: "Você não tem permissão para ver este dado completo." }, 403);
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x: string) => UUID.test(x)).slice(0, 500);
      if (!ids.length) return resposta({ valores: {} });
      const { data: linhas, error } = await admin.from("free_cadastros").select("id,empresa_id,nome,cpf,chave_pix").in("id", ids).eq("empresa_id", empresa);
      if (error) throw new Error(error.message);
      const valores: Record<string, { cpf: string; pix: string }> = {};
      for (const l of linhas || []) {
        valores[l.id] = { cpf: await decifrar(l.cpf, contextoFree(empresa, "cpf")), pix: await decifrar(l.chave_pix, contextoFree(empresa, "pix")) };
      }
      await admin.from("seguranca_eventos").insert({ empresa_id: empresa, user_id: user.id, tipo: "dado_revelado",
        detalhes: { free_ids: Object.keys(valores), campos: ["cpf", "pix"], motivo: String(body.motivo || "pagamento dos free").slice(0, 120) } });
      return resposta({ valores });
    }

    return resposta({ error: "Ação inválida" }, 400);
  } catch (e) {
    return resposta({ error: e instanceof Error ? e.message : "Erro" }, 400);
  }
});
