import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
    const { item_id, empresa_id } = await req.json();

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const path = `${empresa_id}/${item_id}/principal.jpg`;

    const { error } = await supabase
        .storage
        .from("itens")
        .remove([path]);

    if (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500 },
        );
    }

    return new Response(
        JSON.stringify({ ok: true }),
        { headers: { "Content-Type": "application/json" } },
    );
});
