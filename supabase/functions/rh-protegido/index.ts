// Dados sensíveis do RH (cofre, out/2026).
//  salvar_ficha: a ficha da Gestão de Pessoas passa por aqui para CPF, RG, PIS, CTPS, agência, conta e PIX
//                chegarem cifrados ao banco (rh_ficha_salvar roda como o próprio usuário, com as regras de sempre).
//  revelar:      devolve o valor inteiro de campos pedidos, só para quem tem rh.dados_sensiveis.ver,
//                e registra quem viu o quê de quem (seguranca_eventos, tipo "dado_revelado").
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";
import { abrirRh, protegerRh } from "../_shared/cofre.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const resposta = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;
const CAMPOS = ["cpf", "rg", "salario", "pis", "ctps", "agencia", "conta", "pix"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
  try {
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return resposta({ error: "Sessão necessária" }, 401);
    const { data: { user }, error: erroUser } = await admin.auth.getUser(token);
    if (erroUser || !user) return resposta({ error: "Sessão inválida" }, 401);
    if (await segundaEtapaPendente(authorization)) return resposta({ error: MENSAGEM_2FA }, 403);

    const body = await req.json().catch(() => ({}));
    const empresa = String(body.empresa_id || ""), pessoa = String(body.funcionario_id || "");
    if (!UUID.test(empresa) || !UUID.test(pessoa)) return resposta({ error: "Pedido inválido" }, 400);
    const pode = async (chave: string) => {
      const { data, error } = await admin.rpc("funcionario_pode", { p_empresa: empresa, p_usuario: user.id, p_chave: chave });
      if (error) throw new Error(error.message);
      return data === true;
    };

    if (body.action === "salvar_ficha") {
      const dados = body.dados && typeof body.dados === "object" ? body.dados : null;
      if (!dados) return resposta({ error: "Dados inválidos" }, 400);
      const protegidos = await protegerRh(dados, empresa, (c) => Object.prototype.hasOwnProperty.call(dados, c));
      // Roda como o usuário: rh_ficha_salvar confere rh.colaboradores.editar e a empresa da pessoa.
      const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
      const { error } = await comoUsuario.rpc("rh_ficha_salvar", { p_empresa: empresa, p_funcionario: pessoa, p_dados: protegidos });
      if (error) return resposta({ error: error.message }, 400);
      return resposta({ ok: true });
    }

    if (body.action === "revelar") {
      const campos = (Array.isArray(body.campos) ? body.campos : []).map(String).filter((c: string) => CAMPOS.includes(c));
      if (!campos.length) return resposta({ error: "Informe o que quer ver" }, 400);
      if (!await pode("rh.dados_sensiveis.ver")) return resposta({ error: "Você não tem permissão para ver este dado completo." }, 403);
      const { data: f, error } = await admin.from("funcionarios_acesso").select("id,empresa_id,nome,cpf,salario_cifrado,salario_bruto,dados_rh").eq("id", pessoa).maybeSingle();
      if (error) throw new Error(error.message);
      if (!f || f.empresa_id !== empresa) return resposta({ error: "Pessoa não encontrada" }, 404);
      const { data: ficha } = await admin.from("rh_fichas").select("pis,ctps,agencia,conta,pix").eq("funcionario_id", pessoa).maybeSingle();
      const valores: Record<string, string> = {};
      for (const c of campos) {
        if (c === "cpf") valores.cpf = await abrirRh(empresa, "cpf", f.cpf);
        else if (c === "rg") valores.rg = await abrirRh(empresa, "rg", f.dados_rh?.rg);
        else if (c === "salario") valores.salario = f.salario_cifrado ? await abrirRh(empresa, "salario", f.salario_cifrado) : String(f.salario_bruto ?? "");
        else valores[c] = await abrirRh(empresa, c, (ficha as any)?.[c]);
      }
      await admin.from("seguranca_eventos").insert({ empresa_id: empresa, user_id: user.id, tipo: "dado_revelado",
        detalhes: { funcionario_id: pessoa, nome: f.nome, campos, motivo: String(body.motivo || "").slice(0, 200) } });
      return resposta({ valores });
    }

    return resposta({ error: "Ação inválida" }, 400);
  } catch (e) {
    return resposta({ error: e instanceof Error ? e.message : "Erro" }, 400);
  }
});
