import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseService = ReturnType<typeof createClient<any>>;

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | "get-status"
  | "create-instance"
  | "save-credentials"
  | "get-qr"
  | "sync-status"
  | "disconnect"
  | "reconnect"
  | "send-message";

type RequestBody = {
  action?: Action;
  empresa_id?: string;
  instance_id?: string;
  instance_token?: string;
  client_token?: string;
  message?: {
    phone?: string;
    type?: "texto" | "imagem" | "pdf" | "audio" | "documento";
    text?: string;
    caption?: string;
    fileUrl?: string;
    fileName?: string;
    origem?: string;
  };
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function maskInstance(value = "") {
  if (value.length <= 8) return value ? "****" : "";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function normalizePhone(value = "") {
  return String(value).replace(/\D/g, "");
}

function zapiBaseUrl() {
  return (Deno.env.get("ZAPI_BASE_URL") || "https://api.z-api.io").replace(/\/$/, "");
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variavel de ambiente ausente: ${name}`);
  return value;
}

async function validarAcessoEmpresa(req: Request, empresaId: string) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Usuario nao autenticado", status: 401 } as const;
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const authClient = createClient<any>(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser();

  if (userError || !user) {
    return { error: "Sessao invalida", status: 401 } as const;
  }

  const serviceClient = createClient<any>(supabaseUrl, serviceKey);
  const { data: vinculo, error: vinculoError } = await serviceClient
    .from("usuarios_empresas")
    .select("empresa_id,user_id")
    .eq("user_id", user.id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (vinculoError) {
    console.error("Erro ao validar vinculo usuarios_empresas", {
      user_id: user.id,
      empresa_id: empresaId,
      message: vinculoError.message,
    });
    return { error: `Erro ao validar acesso a empresa: ${vinculoError.message}`, status: 500 } as const;
  }

  if (!vinculo) {
    return { error: "Usuario sem acesso a esta empresa", status: 403 } as const;
  }

  return { user, vinculo, serviceClient };
}

async function ensureIntegration(serviceClient: SupabaseService, empresaId: string) {
  const { data: current, error: selectError } = await serviceClient
    .from("zapi_integracoes")
    .select("*")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (current) return current;

  const { data, error } = await serviceClient
    .from("zapi_integracoes")
    .insert({ empresa_id: empresaId })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

function emptyIntegration(empresaId: string) {
  return {
    empresa_id: empresaId,
    status: "nao_configurado",
    numero_conectado: null,
    instancia_id_mascarado: maskInstance(Deno.env.get("ZAPI_INSTANCE_ID") || ""),
    ultimo_qr_at: null,
    ultima_sincronizacao: null,
    ultimo_envio_at: null,
    ultimo_erro: null,
    mensagens_enviadas: 0,
    mensagens_falhas: 0,
  };
}

async function getCredentials(serviceClient: SupabaseService, empresaId: string) {
  const { data, error } = await serviceClient
    .from("zapi_credenciais")
    .select("*")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function envCredentials(empresaId: string) {
  const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
  const instanceToken = Deno.env.get("ZAPI_INSTANCE_TOKEN");
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

  if (!instanceId || !instanceToken) return null;

  return {
    empresa_id: empresaId,
    instance_id: instanceId,
    instance_token: instanceToken,
    client_token: clientToken || "",
    webhook_secret: Deno.env.get("ZAPI_WEBHOOK_SECRET") || crypto.randomUUID().replaceAll("-", ""),
  };
}

async function getCredentialsOrEnv(serviceClient: SupabaseService, empresaId: string) {
  const saved = await getCredentials(serviceClient, empresaId);
  const fallback = envCredentials(empresaId);

  if (!saved) return fallback;
  if (!fallback) return saved;

  return {
    ...saved,
    instance_id: String(saved.instance_id || fallback.instance_id || "").trim(),
    instance_token: String(saved.instance_token || fallback.instance_token || "").trim(),
    client_token: String(saved.client_token || fallback.client_token || "").trim(),
    webhook_secret: String(saved.webhook_secret || fallback.webhook_secret || "").trim(),
  };
}

function isClientTokenNotConfiguredError(payload: unknown) {
  const text = typeof payload === "string"
    ? payload
    : JSON.stringify(payload || {});

  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return normalized.includes("client-token")
    && (
      normalized.includes("not configured")
      || normalized.includes("not found")
      || normalized.includes("invalid")
      || normalized.includes("unauthorized")
      || normalized.includes("nao configur")
      || normalized.includes("invalido")
    );
}

function zapiErrorMessage(payload: unknown, status: number) {
  if (typeof payload === "string") return payload || `Z-API HTTP ${status}`;
  const data = payload as Record<string, any>;
  return data?.message || data?.error || data?.erro || `Z-API HTTP ${status}`;
}

async function zapiFetchOnce(credentials: Record<string, string>, endpoint: string, options: RequestInit = {}, sendClientToken = true) {
  const url = `${zapiBaseUrl()}/instances/${credentials.instance_id}/token/${credentials.instance_token}/${endpoint.replace(/^\//, "")}`;
  const headers = new Headers(options.headers || {});
  if (sendClientToken && credentials.client_token) headers.set("Client-Token", credentials.client_token);
  if (!sendClientToken) headers.delete("Client-Token");
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");

  const response = await fetch(url, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");

  return { response, payload };
}

async function zapiFetch(credentials: Record<string, string>, endpoint: string, options: RequestInit = {}) {
  const firstAttempt = await zapiFetchOnce(credentials, endpoint, options, true);
  if (firstAttempt.response.ok) return firstAttempt.payload;

  if (isClientTokenNotConfiguredError(firstAttempt.payload)) {
    const retryWithoutClientToken = await zapiFetchOnce(credentials, endpoint, options, false);
    if (retryWithoutClientToken.response.ok) return retryWithoutClientToken.payload;
    throw new Error(zapiErrorMessage(retryWithoutClientToken.payload, retryWithoutClientToken.response.status));
  }

  throw new Error(zapiErrorMessage(firstAttempt.payload, firstAttempt.response.status));
}

function isConnectedPayload(payload: Record<string, any> = {}) {
  const statusText = String(
    payload?.status
    || payload?.state
    || payload?.connection
    || payload?.instanceStatus
    || ""
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return Boolean(
    payload?.connected === true
    || payload?.value === true
    || payload?.smartphoneConnected === true
    || payload?.phoneConnected
    || payload?.connectedPhone
    || payload?.phone
    || ["connected", "conectado", "open", "online", "logged", "logged_in"].includes(statusText)
  );
}

function connectedPhone(payload: Record<string, any> = {}) {
  return payload?.phone
    || payload?.phoneConnected
    || payload?.connectedPhone
    || payload?.number
    || payload?.connectedNumber
    || null;
}

async function configureWebhooks(serviceClient: SupabaseService, credentials: Record<string, string>) {
  const webhookBase = Deno.env.get("ZAPI_WEBHOOK_URL");
  if (!webhookBase) return { configured: false, reason: "ZAPI_WEBHOOK_URL nao configurada" };

  const url = new URL(webhookBase);
  url.searchParams.set("secret", credentials.webhook_secret);

  const body = JSON.stringify({ value: url.toString() });
  const endpoints = [
    "update-webhook-connected",
    "update-webhook-message-status",
    "update-webhook-received",
    "update-webhook-delivery",
  ];

  const results = await Promise.allSettled(
    endpoints.map((endpoint) => zapiFetch(credentials, endpoint, { method: "PUT", body }))
  );

  const eventResult = await serviceClient.from("zapi_eventos").insert({
    empresa_id: credentials.empresa_id,
    instance_id: credentials.instance_id,
    tipo: "webhooks_configurados",
    payload: { results: results.map((item) => item.status) },
  });

  return {
    configured: results.some((item) => item.status === "fulfilled"),
    event_logged: !eventResult.error,
    event_error: eventResult.error?.message || null,
  };
}

function webhookUrl(secret: string) {
  const webhookBase = Deno.env.get("ZAPI_WEBHOOK_URL");
  if (!webhookBase) return "";
  const url = new URL(webhookBase);
  url.searchParams.set("secret", secret);
  return url.toString();
}

async function createPartnerInstance(name: string, secret: string) {
  const partnerToken = Deno.env.get("ZAPI_PARTNER_TOKEN");
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

  if (!partnerToken || !clientToken) {
    throw new Error("ZAPI_PARTNER_TOKEN e ZAPI_CLIENT_TOKEN precisam estar configurados para criar instancia automaticamente.");
  }

  const callbackUrl = webhookUrl(secret);
  const payload: Record<string, unknown> = {
    name,
    sessionName: name,
    autoReadMessage: false,
    autoReadStatus: false,
    isDevice: false,
    disableEnqueueWhenDisconnected: false,
  };

  if (callbackUrl) {
    payload.connectedCallbackUrl = callbackUrl;
    payload.disconnectedCallbackUrl = callbackUrl;
    payload.deliveryCallbackUrl = callbackUrl;
    payload.receivedCallbackUrl = callbackUrl;
    payload.messageStatusCallbackUrl = callbackUrl;
  }

  const response = await fetch(`${zapiBaseUrl()}/instances/integrator/on-demand`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${partnerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Falha ao criar instancia Z-API (${response.status})`);
  }

  if (!data?.id || !data?.token) {
    throw new Error("Z-API nao retornou id/token da instancia criada.");
  }

  return {
    instance_id: String(data.id),
    instance_token: String(data.token),
    client_token: clientToken,
    raw: data,
  };
}

async function syncStatus(serviceClient: SupabaseService, empresaId: string, credentials: Record<string, string>) {
  try {
    const payload = await zapiFetch(credentials, "status", { method: "GET" });
    const connected = isConnectedPayload(payload);
    const numero = connectedPhone(payload);
    const status = connected ? "conectado" : "aguardando_qr";

    const { data, error } = await serviceClient
      .from("zapi_integracoes")
      .upsert({
        empresa_id: empresaId,
        status,
        numero_conectado: numero,
        ultima_sincronizacao: new Date().toISOString(),
        ultimo_erro: null,
      }, { onConflict: "empresa_id" })
      .select("*")
      .single();

    if (error) throw error;
    return { integration: data, zapi: payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { data } = await serviceClient
      .from("zapi_integracoes")
      .update({
        ultima_sincronizacao: new Date().toISOString(),
        ultimo_erro: message,
      })
      .eq("empresa_id", empresaId)
      .select("*")
      .maybeSingle();

    return { integration: data, error: message };
  }
}

async function getQr(serviceClient: SupabaseService, empresaId: string, credentials: Record<string, string>) {
  const currentStatus = await syncStatus(serviceClient, empresaId, credentials);
  if (currentStatus.integration?.status === "conectado") {
    return { qr: null, integration: currentStatus.integration, connected: true };
  }

  const payload = await zapiFetch(credentials, "qr-code/image", { method: "GET" });
  const image = payload?.value || payload?.image || payload?.qrcode || payload?.qrCode || payload;
  const qr = typeof image === "string" && image.startsWith("data:image")
    ? image
    : `data:image/png;base64,${String(image || "").replace(/^data:image\/\w+;base64,/, "")}`;

  await serviceClient
    .from("zapi_integracoes")
    .update({
      status: "aguardando_qr",
      ultimo_qr_at: new Date().toISOString(),
      ultima_sincronizacao: new Date().toISOString(),
      ultimo_erro: null,
    })
    .eq("empresa_id", empresaId);

  return { qr };
}

function endpointForMessage(type: string) {
  if (type === "imagem") return "send-image";
  if (type === "audio") return "send-audio";
  if (type === "pdf" || type === "documento") return "send-document";
  return "send-text";
}

function bodyForMessage(message: NonNullable<RequestBody["message"]>) {
  const phone = normalizePhone(message.phone);
  const type = message.type || "texto";

  if (!phone) throw new Error("Numero de destino ausente");
  if (type === "texto" && !message.text?.trim()) throw new Error("Mensagem de texto ausente");
  if (type !== "texto" && !message.fileUrl?.trim()) throw new Error("URL do arquivo ausente");

  if (type === "texto") {
    return { phone, message: message.text?.trim() };
  }

  if (type === "imagem") {
    return { phone, image: message.fileUrl, caption: message.caption || message.text || "" };
  }

  if (type === "audio") {
    return { phone, audio: message.fileUrl };
  }

  return {
    phone,
    document: message.fileUrl,
    fileName: message.fileName || (type === "pdf" ? "documento.pdf" : "documento"),
    caption: message.caption || message.text || "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return jsonResponse({ erro: "Metodo nao permitido" }, 405);

    const body = await req.json().catch(() => null) as RequestBody | null;
    if (!body?.empresa_id || !body.action) return jsonResponse({ erro: "Payload invalido" }, 400);
    body.empresa_id = String(body.empresa_id).trim();

    const acesso = await validarAcessoEmpresa(req, body.empresa_id);
    if ("error" in acesso) return jsonResponse({ erro: acesso.error }, acesso.status);

    const { serviceClient, user, vinculo } = acesso;

    if (body.action === "get-status") {
      const { data: integration, error: integrationError } = await serviceClient
        .from("zapi_integracoes")
        .select("*")
        .eq("empresa_id", body.empresa_id)
        .maybeSingle();

      if (integrationError) {
        return jsonResponse({
          ok: true,
          integration: emptyIntegration(body.empresa_id),
          history: [],
          warning: integrationError.message,
        });
      }

      const history = await serviceClient
        .from("zapi_mensagens")
        .select("id,created_at,numero,tipo,origem,mensagem,status,erro")
        .eq("empresa_id", body.empresa_id)
        .order("created_at", { ascending: false })
        .limit(50);

      return jsonResponse({ ok: true, integration: integration || emptyIntegration(body.empresa_id), history: history.data || [] });
    }

    const integration = await ensureIntegration(serviceClient, body.empresa_id);

    if (body.action === "create-instance") {
      const secret = crypto.randomUUID().replaceAll("-", "");
      const instance = await createPartnerInstance(`EasyLoc ${body.empresa_id}`, secret);

      await serviceClient.from("zapi_integracoes").upsert({
        empresa_id: body.empresa_id,
        status: "aguardando_qr",
        instancia_id_mascarado: maskInstance(instance.instance_id),
        ultima_sincronizacao: new Date().toISOString(),
        ultimo_erro: null,
      }, { onConflict: "empresa_id" });

      const refreshed = await ensureIntegration(serviceClient, body.empresa_id);
      const { data: credentials, error } = await serviceClient
        .from("zapi_credenciais")
        .upsert({
          empresa_id: body.empresa_id,
          integracao_id: refreshed.id,
          instance_id: instance.instance_id,
          instance_token: instance.instance_token,
          client_token: instance.client_token,
          webhook_secret: secret,
          updated_at: new Date().toISOString(),
        }, { onConflict: "empresa_id" })
        .select("*")
        .single();

      if (error) throw error;

      const webhook = await configureWebhooks(serviceClient, credentials);
      return jsonResponse({ ok: true, instance: { id: maskInstance(instance.instance_id), due: instance.raw?.due || null }, webhook });
    }

    if (body.action === "save-credentials") {
      const fallback = envCredentials(body.empresa_id);
      const instanceId = body.instance_id?.trim() || fallback?.instance_id;
      const instanceToken = body.instance_token?.trim() || fallback?.instance_token;
      const clientToken = body.client_token?.trim() || fallback?.client_token || "";

      if (!instanceId || !instanceToken) {
        return jsonResponse({ erro: "Informe Instance ID e Token da instancia" }, 400);
      }

      const { data: upserted, error } = await serviceClient
        .from("zapi_credenciais")
        .upsert({
          empresa_id: body.empresa_id,
          integracao_id: integration.id,
          instance_id: instanceId,
          instance_token: instanceToken,
          client_token: clientToken,
          webhook_secret: fallback?.webhook_secret || crypto.randomUUID().replaceAll("-", ""),
          updated_at: new Date().toISOString(),
        }, { onConflict: "empresa_id" })
        .select("*")
        .single();

      if (error) throw error;

      await serviceClient.from("zapi_integracoes").upsert({
        empresa_id: body.empresa_id,
        status: "aguardando_qr",
        instancia_id_mascarado: maskInstance(instanceId),
        ultima_sincronizacao: new Date().toISOString(),
        ultimo_erro: null,
      }, { onConflict: "empresa_id" });

      const webhook = await configureWebhooks(serviceClient, upserted).catch((error) => ({
        configured: false,
        reason: error instanceof Error ? error.message : String(error),
      }));
      const synced = await syncStatus(serviceClient, body.empresa_id, upserted);
      return jsonResponse({ ok: true, webhook, ...synced });
    }

    const credentials = await getCredentialsOrEnv(serviceClient, body.empresa_id);
    if (!credentials) return jsonResponse({ erro: "Credenciais Z-API nao configuradas" }, 400);

    if (body.action === "sync-status") {
      const result = await syncStatus(serviceClient, body.empresa_id, credentials);
      return jsonResponse({ ok: !result.error, ...result });
    }

    if (body.action === "get-qr" || body.action === "reconnect") {
      if (body.action === "reconnect") {
        await zapiFetch(credentials, "restart", { method: "GET" }).catch(() => null);
      }
      const result = await getQr(serviceClient, body.empresa_id, credentials);
      return jsonResponse({ ok: true, ...result });
    }

    if (body.action === "disconnect") {
      const result = await zapiFetch(credentials, "disconnect", { method: "GET" });
      await serviceClient
        .from("zapi_integracoes")
        .update({
          status: "desconectado",
          numero_conectado: null,
          ultima_sincronizacao: new Date().toISOString(),
        })
        .eq("empresa_id", body.empresa_id);
      return jsonResponse({ ok: true, result });
    }

    if (body.action === "send-message") {
      if (!body.message) return jsonResponse({ erro: "Mensagem ausente" }, 400);

      const msgType = body.message.type || "texto";
      const payload = bodyForMessage(body.message);
      const insert = await serviceClient
        .from("zapi_mensagens")
        .insert({
          empresa_id: body.empresa_id,
          usuario_id: user.id,
          usuario_nome: String(user.user_metadata?.nome || user.user_metadata?.name || user.email || "Usuario"),
          numero: payload.phone,
          tipo: msgType,
          origem: body.message.origem || "manual",
          mensagem: body.message.text || body.message.caption || "",
          legenda: body.message.caption || null,
          arquivo_url: body.message.fileUrl || null,
          payload,
          status: "pendente",
        })
        .select("*")
        .single();

      if (insert.error) throw insert.error;

      try {
        const response = await zapiFetch(credentials, endpointForMessage(msgType), {
          method: "POST",
          body: JSON.stringify(payload),
        });

        await serviceClient
          .from("zapi_mensagens")
          .update({
            status: "enviado",
            response,
            zapi_message_id: response?.messageId || response?.id || null,
            zapi_zaap_id: response?.zaapId || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", insert.data.id);

        await serviceClient
          .from("zapi_integracoes")
          .update({
            ultimo_envio_at: new Date().toISOString(),
            mensagens_enviadas: Number(integration.mensagens_enviadas || 0) + 1,
            ultimo_erro: null,
          })
          .eq("empresa_id", body.empresa_id);

        return jsonResponse({ ok: true, response });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await serviceClient
          .from("zapi_mensagens")
          .update({ status: "falha", erro: message, updated_at: new Date().toISOString() })
          .eq("id", insert.data.id);
        await serviceClient
          .from("zapi_integracoes")
          .update({
            mensagens_falhas: Number(integration.mensagens_falhas || 0) + 1,
            ultimo_erro: message,
          })
          .eq("empresa_id", body.empresa_id);
        return jsonResponse({ ok: false, erro: message }, 502);
      }
    }

    return jsonResponse({ erro: "Acao nao suportada" }, 400);
  } catch (error) {
    console.error("zapi-integration erro", error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({
      erro: message || "Erro interno na integracao Z-API",
      details: message || "Erro interno na integracao Z-API",
    }, 500);
  }
});
