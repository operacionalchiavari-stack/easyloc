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

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const { item_id, empresa_id } = await req.json();

    if (!item_id || !empresa_id || typeof item_id !== "string" || typeof empresa_id !== "string") {
        return new Response(
            JSON.stringify({ error: "item_id ou empresa_id inválido" }),
            { status: 400, headers: corsHeaders },
        );
    }

    const acesso = await validarAcessoEmpresa(req, empresa_id);
    if ("error" in acesso) {
        return new Response(
            JSON.stringify({ error: acesso.error }),
            { status: acesso.status, headers: corsHeaders },
        );
    }

    const supabase = acesso.serviceClient;

    const path = `${empresa_id}/${item_id}/principal.jpg`;

    const { error } = await supabase
        .storage
        .from("itens")
        .remove([path]);

    if (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: corsHeaders },
        );
    }

    return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
});
