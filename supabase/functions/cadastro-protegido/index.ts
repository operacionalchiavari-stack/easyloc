// CPF/CNPJ de clientes e locais (cofre, out/2026).
//  proteger:           cifra o documento e devolve { cpf_cnpj, cpf_cnpj_hash, mascara } para a tela gravar.
//  indice:             índice cego de um documento (checar duplicado / procurar pelo CPF inteiro).
//  revelar:            documento completo, só com comercial.clientes.dados_sensiveis; registra quem viu.
//  documento_contrato: documento completo do cliente para o contrato do pedido; registra o uso.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { segundaEtapaPendente, MENSAGEM_2FA } from "../_shared/dois-fatores.ts";
import { cifrar, contextoDoc, decifrar, documentoLimpo, indice, mascara } from "../_shared/cofre.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const resposta = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;
const TABELAS = { cliente: { tabela: "clientes_empresas", modulo: "clientes" }, local: { tabela: "locais_empresas", modulo: "locais" } } as const;

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
    const tipo = body.tabela === "local" ? "local" : "cliente";
    const cfg = TABELAS[tipo];
    const pode = async (chave: string) => {
      const { data, error } = await admin.rpc("funcionario_pode", { p_empresa: empresa, p_usuario: user.id, p_chave: chave });
      if (error) throw new Error(error.message);
      return data === true;
    };
    const algum = async (chaves: string[]) => { for (const c of chaves) if (await pode(c)) return true; return false; };

    if (body.action === "proteger") {
      if (!(await algum([`comercial.${cfg.modulo}.criar`, `comercial.${cfg.modulo}.editar`]))) return resposta({ error: "Sem permissão para salvar este cadastro" }, 403);
      const d = documentoLimpo(body.documento);
      if (!d) return resposta({ cpf_cnpj: null, cpf_cnpj_hash: null, mascara: "" });
      return resposta({ cpf_cnpj: await cifrar(d, contextoDoc(tipo, empresa)), cpf_cnpj_hash: await indice(d, "doc"), mascara: mascara("cpf_cnpj", d) });
    }

    if (body.action === "indice") {
      if (!(await algum([`comercial.${cfg.modulo}.visualizar`]))) return resposta({ error: "Sem permissão" }, 403);
      const d = documentoLimpo(body.documento);
      return resposta({ hash: d ? await indice(d, "doc") : null });
    }

    if (body.action === "revelar" || body.action === "documento_contrato") {
      const id = String(body.id || "");
      if (!UUID.test(id)) return resposta({ error: "Pedido inválido" }, 400);
      const contrato = body.action === "documento_contrato";
      const permitido = contrato
        ? await algum(["comercial.pedidos.visualizar", "comercial.contratos.visualizar", "comercial.clientes.dados_sensiveis"])
        : await pode("comercial.clientes.dados_sensiveis");
      if (!permitido) return resposta({ error: "Você não tem permissão para ver este dado completo." }, 403);
      const tabelaAlvo = contrato ? TABELAS.cliente : cfg;
      const { data: r, error } = await admin.from(tabelaAlvo.tabela).select("id,empresa_id,nome_razao,cpf_cnpj").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!r || r.empresa_id !== empresa) return resposta({ error: "Cadastro não encontrado" }, 404);
      const documento = await decifrar(r.cpf_cnpj, contextoDoc(contrato ? "cliente" : tipo, empresa));
      await admin.from("seguranca_eventos").insert({ empresa_id: empresa, user_id: user.id, tipo: contrato ? "documento_contrato" : "dado_revelado",
        detalhes: { [contrato || tipo === "cliente" ? "cliente_id" : "local_id"]: id, nome: r.nome_razao, campos: ["cpf_cnpj"], pedido_id: body.pedido_id || null } });
      return resposta({ documento });
    }

    return resposta({ error: "Ação inválida" }, 400);
  } catch (e) {
    return resposta({ error: e instanceof Error ? e.message : "Erro" }, 400);
  }
});
