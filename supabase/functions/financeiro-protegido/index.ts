// Dados bancários das contas do Financeiro (cofre, out/2026).
//  salvar_conta: cria/atualiza a conta com agência, conta, CNPJ/CPF do titular e chave PIX cifrados
//                (grava como o próprio usuário: a regra fin_gravar do banco continua valendo).
//  revelar:      devolve o valor inteiro, só com financeiro.dados_bancarios.ver, e registra quem viu.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";
import { CAMPOS_FIN_CONTA, contextoFin, decifrar, protegerCampos } from "../_shared/cofre.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const resposta = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;
// Campos da conta que a tela pode mandar (o resto é ignorado).
const PERMITIDOS = ["nome", "tipo", "banco", "agencia", "conta", "titular_nome", "titular_documento", "pix_tipo", "pix_chave",
  "saldo_inicial", "saldo_inicial_data", "saldo_minimo", "ativo", "observacoes"];

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
    const empresa = String(body.empresa_id || "");
    if (!UUID.test(empresa)) return resposta({ error: "Pedido inválido" }, 400);
    const contaId = body.conta_id ? String(body.conta_id) : "";
    if (contaId && !UUID.test(contaId)) return resposta({ error: "Pedido inválido" }, 400);

    if (body.action === "salvar_conta") {
      const entrada = body.conta && typeof body.conta === "object" ? body.conta : null;
      if (!entrada) return resposta({ error: "Dados inválidos" }, 400);
      const limpa: Record<string, unknown> = {};
      for (const k of PERMITIDOS) if (Object.prototype.hasOwnProperty.call(entrada, k)) limpa[k] = entrada[k];
      const { dados, mascaras } = await protegerCampos(limpa, CAMPOS_FIN_CONTA, (c) => contextoFin(empresa, c),
        (c) => Object.prototype.hasOwnProperty.call(entrada, c));
      const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
      let anteriores: Record<string, string> = {};
      if (contaId) {
        const { data: atual } = await comoUsuario.from("fin_contas").select("cofre_mascaras").eq("id", contaId).eq("empresa_id", empresa).maybeSingle();
        if (!atual) return resposta({ error: "Conta não encontrada" }, 404);
        anteriores = atual.cofre_mascaras || {};
      }
      const linha = { ...dados, empresa_id: empresa, cofre_mascaras: { ...anteriores, ...mascaras } };
      const r = contaId
        ? await comoUsuario.from("fin_contas").update(linha).eq("id", contaId).eq("empresa_id", empresa).select("id")
        : await comoUsuario.from("fin_contas").insert(linha).select("id");
      if (r.error) return resposta({ error: r.error.message }, 400);
      if (!r.data?.length) return resposta({ error: "Sem permissão para salvar contas" }, 403);
      return resposta({ ok: true, id: r.data[0].id });
    }

    if (body.action === "revelar") {
      const campos = (Array.isArray(body.campos) ? body.campos : []).map(String).filter((c: string) => (CAMPOS_FIN_CONTA as readonly string[]).includes(c));
      if (!contaId || !campos.length) return resposta({ error: "Informe o que quer ver" }, 400);
      const { data: pode, error: erroPode } = await admin.rpc("funcionario_pode", { p_empresa: empresa, p_usuario: user.id, p_chave: "financeiro.dados_bancarios.ver" });
      if (erroPode) throw new Error(erroPode.message);
      if (pode !== true) return resposta({ error: "Você não tem permissão para ver este dado completo." }, 403);
      const { data: c, error } = await admin.from("fin_contas").select("id,empresa_id,nome," + CAMPOS_FIN_CONTA.join(",")).eq("id", contaId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!c || (c as any).empresa_id !== empresa) return resposta({ error: "Conta não encontrada" }, 404);
      const valores: Record<string, string> = {};
      for (const k of campos) valores[k] = await decifrar((c as any)[k], contextoFin(empresa, k));
      await admin.from("seguranca_eventos").insert({ empresa_id: empresa, user_id: user.id, tipo: "dado_revelado",
        detalhes: { conta_id: contaId, nome: (c as any).nome, campos } });
      return resposta({ valores });
    }

    return resposta({ error: "Ação inválida" }, 400);
  } catch (e) {
    return resposta({ error: e instanceof Error ? e.message : "Erro" }, 400);
  }
});
