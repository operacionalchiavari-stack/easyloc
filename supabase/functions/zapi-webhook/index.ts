import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function getEventType(payload: Record<string, unknown>) {
  return String(payload.type || payload.event || payload.status || "zapi_event");
}

function getInstanceId(payload: Record<string, unknown>, url: URL) {
  return String(
    payload.instanceId ||
    payload.instance_id ||
    payload.instance ||
    url.searchParams.get("instanceId") ||
    "",
  );
}

function mapMessageStatus(status: string) {
  const value = status.toUpperCase();
  if (value === "READ" || value === "READ_BY_ME" || value === "PLAYED") return "lido";
  if (value === "RECEIVED") return "recebido";
  if (value === "SENT") return "enviado";
  if (value === "ERROR" || value === "FAILED") return "falha";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return jsonResponse({ erro: "Metodo nao permitido" }, 405);

    const url = new URL(req.url);
    const secret = url.searchParams.get("secret") || req.headers.get("x-zapi-secret") || "";
    const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
    const instanceId = getInstanceId(payload, url);

    if (!instanceId) return jsonResponse({ erro: "instanceId ausente" }, 400);

    const supabase = serviceClient();
    const { data: credentials, error: credError } = await supabase
      .from("zapi_credenciais")
      .select("empresa_id,instance_id,webhook_secret")
      .eq("instance_id", instanceId)
      .maybeSingle();

    if (credError || !credentials) return jsonResponse({ erro: "Instancia nao encontrada" }, 404);
    if (secret !== credentials.webhook_secret) return jsonResponse({ erro: "Webhook nao autorizado" }, 401);

    const eventType = getEventType(payload);
    await supabase.from("zapi_eventos").insert({
      empresa_id: credentials.empresa_id,
      instance_id: instanceId,
      tipo: eventType,
      payload,
    });

    if ("connected" in payload) {
      const connected = Boolean(payload.connected);
      await supabase
        .from("zapi_integracoes")
        .update({
          status: connected ? "conectado" : "desconectado",
          numero_conectado: connected ? String(payload.phone || payload.phoneConnected || "") : null,
          ultima_sincronizacao: new Date().toISOString(),
          ultimo_erro: null,
        })
        .eq("empresa_id", credentials.empresa_id);
    }

    const status = mapMessageStatus(String(payload.status || ""));
    const ids = Array.isArray(payload.ids)
      ? payload.ids.map(String)
      : [payload.id, payload.messageId, payload.zaapId].filter(Boolean).map(String);

    if (status && ids.length) {
      await supabase
        .from("zapi_mensagens")
        .update({
          status,
          erro: status === "falha" ? String(payload.error || payload.message || "Falha informada pela Z-API") : null,
          response: payload,
          updated_at: new Date().toISOString(),
        })
        .eq("empresa_id", credentials.empresa_id)
        .or(ids.map((id) => `zapi_message_id.eq.${id},zapi_zaap_id.eq.${id}`).join(","));
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("zapi-webhook erro", error);
    return jsonResponse({
      erro: "Erro interno no webhook Z-API",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
