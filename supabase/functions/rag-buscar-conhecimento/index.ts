import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function validarAcessoEmpresa(req: Request, empresaId: string) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Usuário não autenticado", status: 401 };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser();

  if (userError || !user) {
    return { error: "Sessão inválida", status: 401 };
  }

  const serviceClient = createClient(supabaseUrl, serviceKey);
  const { data: vinculo, error: vinculoError } = await serviceClient
    .from("usuarios_empresas")
    .select("empresa_id")
    .eq("user_id", user.id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (vinculoError || !vinculo) {
    return { error: "Usuário sem acesso a esta empresa", status: 403 };
  }

  return { user, serviceClient };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validar entrada
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ erro: "JSON inválido" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { empresa_id, pergunta } = body;

    // Validar parâmetros
    if (!empresa_id || typeof empresa_id !== "string") {
      return new Response(
        JSON.stringify({ erro: "empresa_id inválida ou ausente" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!pergunta || typeof pergunta !== "string" || pergunta.trim().length === 0) {
      return new Response(
        JSON.stringify({ erro: "pergunta inválida ou ausente" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const acesso = await validarAcessoEmpresa(req, empresa_id);
    if ("error" in acesso) {
      return new Response(
        JSON.stringify({ erro: acesso.error }),
        { status: acesso.status, headers: corsHeaders }
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY não configurada");
    }

    const supabase = acesso.serviceClient;

    // Fetch com timeout (10 segundos)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: pergunta.substring(0, 2000), // Limitar tamanho
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!embRes.ok) {
      const errText = await embRes.text();
      throw new Error(`OpenAI error (${embRes.status}): ${errText}`);
    }

    const embJson = await embRes.json();
    const embedding = embJson?.data?.[0]?.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Embedding inválido retornado pela OpenAI");
    }

    const { data, error } = await supabase.rpc(
      "rag_buscar_conhecimento",
      {
        p_empresa_id: empresa_id,
        p_query_embedding: embedding,
        p_limit: 3,
      }
    );

    if (error) {
      console.error("Erro ao chamar RPC:", error);
      throw error;
    }

    return new Response(JSON.stringify(data ?? []), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err: any) {
    console.error("❌ Erro em rag-buscar-conhecimento:", err.message);
    return new Response(
      JSON.stringify({
        erro: "Erro ao buscar conhecimento",
        detalhe: err.message,
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
