// catalogo-arquivos — upload/remoção/listagem nos buckets "projetos" e "lounge-formatos" para o DECORADOR
// (sem login no Acervo, só com o token do catálogo).
//
// Por que existe (out/2026, achado do Sentinela): as políticas do Storage liberavam inserir/apagar/sobrescrever
// para `anon` checando só se a pasta <empresa>/<projeto> existia — o Storage não tem como conferir o token do
// catálogo. Como o bucket também era listável sem login, qualquer visitante descobria as pastas e podia apagar
// ou trocar arquivos dos projetos dos clientes. Agora o `anon` não escreve mais no Storage: o decorador pede aqui,
// esta função confere o token e se o projeto/formato é DELE (mesma regra de projeto_do_chamador) e só então
// gera a URL de upload assinada ou apaga/lista com a chave de serviço.
//
// A equipe (logada) continua indo direto no Storage, com as políticas `authenticated` da empresa dela.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NOME = "[A-Za-z0-9][A-Za-z0-9._-]{0,119}";

// Para cada bucket: a tabela dona da pasta e o formato aceito de arquivo/pasta.
// Grupo 1 = empresa, grupo 2 = id do projeto/formato.
const BUCKETS: Record<string, { tabela: string; arquivo: RegExp; pasta: RegExp }> = {
  "projetos": {
    tabela: "projetos",
    arquivo: new RegExp(`^(${UUID})/(${UUID})/[a-z0-9_-]{1,40}/${NOME}$`, "i"),   // <empresa>/<projeto>/renders/<uuid>.jpg
    pasta: new RegExp(`^(${UUID})/(${UUID})/[a-z0-9_-]{1,40}$`, "i"),
  },
  "lounge-formatos": {
    tabela: "lounge_formatos",
    arquivo: new RegExp(`^(${UUID})/(${UUID})/${NOME}$`, "i"),                    // <empresa>/<formato>/capa.jpg
    pasta: new RegExp(`^(${UUID})/(${UUID})$`, "i"),
  },
};
const MAX_ARQUIVOS = 500;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ erro: "Requisição inválida" }, 400); }
  const bucket = String(body?.bucket || "");
  const cfg = BUCKETS[bucket];
  if (!cfg) return json({ erro: "Bucket não permitido" }, 400);

  const token = String(body?.catalog_token || "");
  if (!token) return json({ erro: "Sua sessão do catálogo expirou. Entre novamente." }, 401);

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: sessao, error: erroSessao } = await service.rpc("catalogo_validar_sessao", { p_token: token });
  if (erroSessao || !sessao?.valido) return json({ erro: "Sua sessão do catálogo expirou. Entre novamente." }, 401);
  const empresa = String(sessao.empresa_id).toLowerCase();
  const cliente = String(sessao.cliente_id);

  // Só a pasta de um projeto/formato DO decorador desta sessão (cliente_id dele, na empresa dele).
  const donoConferido = new Map<string, boolean>();
  async function pode(caminho: string, re: RegExp) {
    if (caminho.includes("..") || caminho.includes("//")) return false;
    const m = re.exec(caminho);
    if (!m || m[1].toLowerCase() !== empresa) return false;
    const id = m[2].toLowerCase();
    if (!donoConferido.has(id)) {
      const { data } = await service.from(cfg.tabela).select("id")
        .eq("id", id).eq("empresa_id", empresa).eq("cliente_id", cliente).maybeSingle();
      donoConferido.set(id, !!data);
    }
    return donoConferido.get(id)!;
  }

  const storage = service.storage.from(bucket);
  const acao = String(body?.acao || "");

  if (acao === "upload") {
    const path = String(body?.path || "");
    if (!(await pode(path, cfg.arquivo))) return json({ erro: "Sem permissão para enviar arquivos para este item." }, 403);
    const { data, error } = await storage.createSignedUploadUrl(path, { upsert: body?.upsert === true });
    if (error || !data) return json({ erro: error?.message || "Não foi possível preparar o envio." }, 500);
    return json({ path, token: data.token });
  }

  if (acao === "remover") {
    const paths: string[] = Array.isArray(body?.paths) ? body.paths.map(String).slice(0, MAX_ARQUIVOS) : [];
    for (const p of paths) {
      if (!(await pode(p, cfg.arquivo))) return json({ erro: "Sem permissão para apagar arquivos deste item." }, 403);
    }
    if (!paths.length) return json({ removidos: [] });
    const { data, error } = await storage.remove(paths);
    if (error) return json({ erro: error.message }, 500);
    return json({ removidos: data ?? [] });
  }

  if (acao === "listar") {
    const pasta = String(body?.pasta || "").replace(/\/+$/, "");
    if (!(await pode(pasta, cfg.pasta))) return json({ erro: "Sem permissão para ver os arquivos deste item." }, 403);
    const limite = Math.min(Math.max(Number(body?.limit) || 100, 1), MAX_ARQUIVOS);
    const { data, error } = await storage.list(pasta, { limit: limite });
    if (error) return json({ erro: error.message }, 500);
    return json({ arquivos: data ?? [] });
  }

  return json({ erro: "Ação desconhecida" }, 400);
});
