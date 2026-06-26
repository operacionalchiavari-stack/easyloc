import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type SupabaseService = ReturnType<typeof createClient<any>>;

export type GatewayEnvironment = "sandbox" | "producao";

export type GatewayField = {
  key: string;
  label: string;
  type: "password" | "text";
  required?: boolean;
  placeholder?: string;
};

export type GatewayDefinition = {
  id: string;
  name: string;
  logo: string;
  available: boolean;
  comingSoon?: boolean;
  description: string;
  capabilities: string[];
  fields: GatewayField[];
};

export type GatewayCredentials = Record<string, string>;

export type ProviderContext = {
  empresaId: string;
  connection: Record<string, any>;
  credentials: GatewayCredentials;
};

export type ProviderTestResult = {
  ok: boolean;
  response_ms: number;
  account?: Record<string, unknown>;
  error?: string;
};

export type PixInput = {
  amount?: number;
  valor?: number;
  description?: string;
  payer_email?: string;
  email?: string;
  payer_name?: string;
  payer_phone?: string;
  external_reference?: string;
  pedido_id?: string;
  numero_pedido?: string;
  parcela_index?: number;
  parcela_numero?: string;
  parcela_label?: string;
  due_date?: string;
  notification_url?: string;
  expires_at?: string;
};

export type PixResult = {
  external_id: string;
  external_reference?: string;
  status: string;
  amount: number;
  qr_code?: string | null;
  qr_code_base64?: string | null;
  ticket_url?: string | null;
  provider_response: Record<string, any>;
  payload: Record<string, any>;
};

export type PaymentProvider = {
  id: string;
  name: string;
  testarConexao(credentials: GatewayCredentials, ambiente: GatewayEnvironment): Promise<ProviderTestResult>;
  criarPix(input: PixInput, context: ProviderContext): Promise<PixResult>;
  consultarPagamento(externalId: string, context: ProviderContext): Promise<Record<string, any>>;
  cancelarPagamento(externalId: string, context: ProviderContext): Promise<Record<string, any>>;
  receberWebhook(payload: Record<string, any>, req: Request): Promise<{
    event_type: string;
    provider_event_id?: string;
    external_payment_id?: string;
  }>;
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const GATEWAY_DEFINITIONS: GatewayDefinition[] = [
  {
    id: "mercado_pago",
    name: "Mercado Pago",
    logo: "MP",
    available: true,
    description: "PIX, boleto, cartao e checkout com confirmacao automatica.",
    capabilities: ["PIX", "Boleto", "Cartao", "Checkout", "Assinaturas"],
    fields: [
      { key: "access_token", label: "Access Token", type: "password", required: true, placeholder: "APP_USR-..." },
      { key: "public_key", label: "Public Key", type: "password", placeholder: "APP_USR-..." },
      { key: "webhook_secret", label: "Webhook Secret", type: "password", placeholder: "Chave de assinatura do webhook" },
    ],
  },
  {
    id: "asaas",
    name: "Asaas",
    logo: "AS",
    available: false,
    comingSoon: true,
    description: "Arquitetura pronta para API Key, PIX, boleto e assinatura.",
    capabilities: ["PIX", "Boleto", "Cartao", "Assinaturas"],
    fields: [],
  },
  {
    id: "itau",
    name: "Itau",
    logo: "IT",
    available: false,
    comingSoon: true,
    description: "Arquitetura pronta para certificados, PIX e boleto.",
    capabilities: ["PIX", "Boleto"],
    fields: [],
  },
  {
    id: "nubank",
    name: "Nubank",
    logo: "NU",
    available: false,
    comingSoon: true,
    description: "Arquitetura pronta para cobrancas e reconciliacao.",
    capabilities: ["PIX", "Checkout"],
    fields: [],
  },
  {
    id: "banco_inter",
    name: "Banco Inter",
    logo: "BI",
    available: false,
    comingSoon: true,
    description: "Arquitetura pronta para OAuth, certificados, PIX e boleto.",
    capabilities: ["PIX", "Boleto"],
    fields: [],
  },
  {
    id: "pagseguro",
    name: "PagSeguro",
    logo: "PS",
    available: false,
    comingSoon: true,
    description: "Arquitetura pronta para checkout, cartao e notificacoes.",
    capabilities: ["PIX", "Boleto", "Cartao", "Checkout"],
    fields: [],
  },
  {
    id: "pagarme",
    name: "Pagar.me",
    logo: "PM",
    available: false,
    comingSoon: true,
    description: "Arquitetura pronta para recebedores, PIX, boleto e cartao.",
    capabilities: ["PIX", "Boleto", "Cartao", "Assinaturas"],
    fields: [],
  },
  {
    id: "stripe",
    name: "Stripe",
    logo: "ST",
    available: false,
    comingSoon: true,
    description: "Arquitetura pronta para checkout, cartao e assinaturas.",
    capabilities: ["Cartao", "Checkout", "Assinaturas"],
    fields: [],
  },
];

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variavel de ambiente ausente: ${name}`);
  return value;
}

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function createServiceClient() {
  return createClient<any>(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

export async function validarAcessoEmpresa(req: Request, empresaId: string) {
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
    return { error: `Erro ao validar acesso a empresa: ${vinculoError.message}`, status: 500 } as const;
  }

  if (!vinculo) {
    return { error: "Usuario sem acesso a esta empresa", status: 403 } as const;
  }

  return { user, vinculo, serviceClient };
}

export function getGatewayDefinition(gateway: string) {
  return GATEWAY_DEFINITIONS.find((item) => item.id === gateway) || null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function encryptionKey() {
  const secret = Deno.env.get("PAYMENT_GATEWAY_ENCRYPTION_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("Variavel de ambiente ausente: PAYMENT_GATEWAY_ENCRYPTION_KEY");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptCredentials(credentials: GatewayCredentials) {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(credentials));
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    credentials_ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
    credentials_iv: bytesToBase64(iv),
  };
}

export async function decryptCredentials(row: Record<string, any> | null) {
  if (!row?.credentials_ciphertext || !row?.credentials_iv) return null;
  const key = await encryptionKey();
  const cipher = base64ToBytes(row.credentials_ciphertext);
  const iv = base64ToBytes(row.credentials_iv);
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plainBuffer)) as GatewayCredentials;
}

export function maskSecret(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 10) return "****";
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

export function credentialPreview(definition: GatewayDefinition, credentials: GatewayCredentials) {
  return definition.fields.reduce((acc, field) => {
    acc[field.key] = credentials[field.key] ? maskSecret(credentials[field.key]) : "";
    return acc;
  }, {} as Record<string, string>);
}

export function cleanCredentialInput(input: Record<string, unknown> = {}) {
  return Object.entries(input).reduce((acc, [key, value]) => {
    const text = String(value ?? "").trim();
    if (text) acc[key] = text;
    return acc;
  }, {} as GatewayCredentials);
}

export function mergeCredentials(current: GatewayCredentials | null, incoming: GatewayCredentials) {
  return { ...(current || {}), ...incoming };
}

export function assertRequiredCredentials(definition: GatewayDefinition, credentials: GatewayCredentials) {
  const missing = definition.fields
    .filter((field) => field.required && !credentials[field.key])
    .map((field) => field.label);

  if (missing.length) {
    throw new Error(`Credenciais obrigatorias ausentes: ${missing.join(", ")}`);
  }
}

export function sanitizeConnection(connection: Record<string, any> | null, definition: GatewayDefinition) {
  return {
    id: connection?.id || null,
    gateway: definition.id,
    name: definition.name,
    logo: definition.logo,
    available: definition.available,
    comingSoon: Boolean(definition.comingSoon),
    description: definition.description,
    capabilities: definition.capabilities,
    fields: definition.fields,
    ambiente: connection?.ambiente || "sandbox",
    status: definition.available ? (connection?.status || "desconectado") : "em_breve",
    credential_preview: connection?.credential_preview || {},
    connected_at: connection?.connected_at || null,
    ultimo_teste_at: connection?.ultimo_teste_at || null,
    ultimo_teste_ms: connection?.ultimo_teste_ms || null,
    ultimo_teste_status: connection?.ultimo_teste_status || null,
    ultima_sincronizacao: connection?.ultima_sincronizacao || null,
    ultimo_erro: connection?.ultimo_erro || null,
    provider_account: connection?.provider_account || {},
    webhook_url: definition.id === "mercado_pago" && connection?.id ? buildWebhookUrl(definition.id, connection.id) : null,
  };
}

export async function listGateways(serviceClient: SupabaseService, empresaId: string) {
  const { data, error } = await serviceClient
    .from("payment_gateway_connections")
    .select("*")
    .eq("empresa_id", empresaId);

  if (error) throw error;

  const connections = new Map((data || []).map((item: any) => [item.gateway, item]));
  return GATEWAY_DEFINITIONS.map((definition) => sanitizeConnection(connections.get(definition.id) || null, definition));
}

export async function getConnection(serviceClient: SupabaseService, empresaId: string, gateway: string) {
  const { data, error } = await serviceClient
    .from("payment_gateway_connections")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("gateway", gateway)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertConnection(
  serviceClient: SupabaseService,
  empresaId: string,
  definition: GatewayDefinition,
  payload: Record<string, any>,
) {
  const { data, error } = await serviceClient
    .from("payment_gateway_connections")
    .upsert({
      empresa_id: empresaId,
      gateway: definition.id,
      capabilities: definition.capabilities,
      ...payload,
    }, { onConflict: "empresa_id,gateway" })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function getCredentialRow(serviceClient: SupabaseService, connectionId: string) {
  const { data, error } = await serviceClient
    .from("payment_gateway_credentials")
    .select("*")
    .eq("connection_id", connectionId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getDecryptedCredentials(serviceClient: SupabaseService, connectionId: string) {
  const row = await getCredentialRow(serviceClient, connectionId);
  return decryptCredentials(row);
}

export async function saveEncryptedCredentials(
  serviceClient: SupabaseService,
  empresaId: string,
  connectionId: string,
  credentials: GatewayCredentials,
) {
  const encrypted = await encryptCredentials(credentials);
  const { error } = await serviceClient
    .from("payment_gateway_credentials")
    .upsert({
      empresa_id: empresaId,
      connection_id: connectionId,
      ...encrypted,
      credentials_algorithm: "AES-GCM",
      key_version: "v1",
    }, { onConflict: "connection_id" });

  if (error) throw error;
}

export function buildWebhookUrl(gateway: string, connectionId: string, secret?: string) {
  const base = Deno.env.get("PAYMENT_GATEWAY_WEBHOOK_URL");
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("gateway", gateway);
  url.searchParams.set("connection_id", connectionId);
  if (secret) url.searchParams.set("secret", secret);
  return url.toString();
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function apiMessage(data: Record<string, any>) {
  const cause = Array.isArray(data?.cause) && data.cause[0]
    ? data.cause[0].description || data.cause[0].message || data.cause[0].code
    : "";
  return data?.message || data?.error || cause || "Falha na API do gateway";
}

function sanitizeMercadoPagoAccount(data: Record<string, any>) {
  return {
    id: data.id || null,
    nickname: data.nickname || null,
    site_id: data.site_id || null,
    country_id: data.country_id || null,
    email: data.email || null,
  };
}

function mercadoPagoAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function syntheticPayerEmail(input: PixInput, context: ProviderContext) {
  const seed = String(input.external_reference || input.pedido_id || crypto.randomUUID())
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 48) || crypto.randomUUID().replace(/-/g, "");
  return `cliente.pix.${seed}@easyloc.app`;
}

function shouldRetryWithSyntheticPayer(data: Record<string, any>) {
  const message = apiMessage(data);
  return /unauthorized use of live credentials/i.test(message);
}

class MercadoPagoProvider implements PaymentProvider {
  id = "mercado_pago";
  name = "Mercado Pago";

  private accessToken(credentials: GatewayCredentials) {
    if (!credentials.access_token) throw new Error("Access Token do Mercado Pago nao configurado.");
    return credentials.access_token;
  }

  async testarConexao(credentials: GatewayCredentials): Promise<ProviderTestResult> {
    const accessToken = this.accessToken(credentials);
    const started = performance.now();
    const endpoints = [
      "https://api.mercadopago.com/users/me",
      "https://api.mercadolibre.com/users/me",
    ];

    let lastError = "Nao foi possivel validar as credenciais.";
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await parseJsonSafe(response);
      const elapsed = Math.max(1, Math.round(performance.now() - started));

      if (response.ok) {
        return {
          ok: true,
          response_ms: elapsed,
          account: sanitizeMercadoPagoAccount(payload),
        };
      }

      lastError = apiMessage(payload);
      if (response.status !== 404) break;
    }

    return {
      ok: false,
      response_ms: Math.max(1, Math.round(performance.now() - started)),
      error: lastError,
    };
  }

  async criarPix(input: PixInput, context: ProviderContext): Promise<PixResult> {
    const accessToken = this.accessToken(context.credentials);
    const amount = Number(input.amount ?? input.valor ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor invalido para gerar PIX.");

    const sellerEmail = normalizeEmail(context.connection?.provider_account?.email);
    const incomingPayerEmail = String(input.payer_email || input.email || "").trim();
    const payerEmail = !incomingPayerEmail || (sellerEmail && normalizeEmail(incomingPayerEmail) === sellerEmail)
      ? syntheticPayerEmail(input, context)
      : incomingPayerEmail;

    const notificationUrl = input.notification_url ||
      buildWebhookUrl(this.id, context.connection.id, context.credentials.webhook_secret);
    const externalReference = input.external_reference || input.pedido_id || crypto.randomUUID();

    const buildPayload = (email: string): Record<string, any> => ({
      transaction_amount: amount,
      description: input.description || "Pagamento EasyLoc",
      payment_method_id: "pix",
      payer: {
        email,
      },
      external_reference: externalReference,
      metadata: {
        empresa_id: context.empresaId,
        pedido_id: input.pedido_id || null,
        numero_pedido: input.numero_pedido || null,
        parcela_index: Number.isInteger(input.parcela_index) ? input.parcela_index : null,
        parcela_numero: input.parcela_numero || null,
        parcela_label: input.parcela_label || null,
        due_date: input.due_date || null,
        gateway_connection_id: context.connection.id,
      },
    });

    const payload: Record<string, any> = buildPayload(payerEmail);

    if (input.payer_name) {
      payload.payer.first_name = String(input.payer_name).trim();
    }

    if (notificationUrl) payload.notification_url = notificationUrl;
    if (input.expires_at) payload.date_of_expiration = input.expires_at;

    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        ...mercadoPagoAuthHeaders(accessToken),
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });

    const data = await parseJsonSafe(response);
    if (!response.ok) {
      const fallbackEmail = syntheticPayerEmail(input, context);
      if (shouldRetryWithSyntheticPayer(data) && normalizeEmail(payerEmail) !== normalizeEmail(fallbackEmail)) {
        const retryPayload = buildPayload(fallbackEmail);
        if (notificationUrl) retryPayload.notification_url = notificationUrl;
        if (input.expires_at) retryPayload.date_of_expiration = input.expires_at;
        if (input.payer_name) retryPayload.payer.first_name = String(input.payer_name).trim();

        const retryResponse = await fetch("https://api.mercadopago.com/v1/payments", {
          method: "POST",
          headers: {
            ...mercadoPagoAuthHeaders(accessToken),
            "X-Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify(retryPayload),
        });
        const retryData = await parseJsonSafe(retryResponse);
        if (retryResponse.ok) {
          const transactionData = retryData?.point_of_interaction?.transaction_data || {};
          return {
            external_id: String(retryData.id || ""),
            external_reference: externalReference,
            status: retryData.status || "pendente",
            amount,
            qr_code: transactionData.qr_code || null,
            qr_code_base64: transactionData.qr_code_base64 || null,
            ticket_url: transactionData.ticket_url || null,
            provider_response: retryData,
            payload: retryPayload,
          };
        }
        throw new Error(apiMessage(retryData));
      }
      throw new Error(apiMessage(data));
    }

    const transactionData = data?.point_of_interaction?.transaction_data || {};
    return {
      external_id: String(data.id || ""),
      external_reference: externalReference,
      status: data.status || "pendente",
      amount,
      qr_code: transactionData.qr_code || null,
      qr_code_base64: transactionData.qr_code_base64 || null,
      ticket_url: transactionData.ticket_url || null,
      provider_response: data,
      payload,
    };
  }

  async consultarPagamento(externalId: string, context: ProviderContext) {
    const accessToken = this.accessToken(context.credentials);
    if (!externalId) throw new Error("ID externo do pagamento ausente.");

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(externalId)}`, {
      method: "GET",
      headers: mercadoPagoAuthHeaders(accessToken),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) throw new Error(apiMessage(data));
    return data;
  }

  async cancelarPagamento(externalId: string, context: ProviderContext) {
    const accessToken = this.accessToken(context.credentials);
    if (!externalId) throw new Error("ID externo do pagamento ausente.");

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(externalId)}`, {
      method: "PUT",
      headers: mercadoPagoAuthHeaders(accessToken),
      body: JSON.stringify({ status: "cancelled" }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) throw new Error(apiMessage(data));
    return data;
  }

  async receberWebhook(payload: Record<string, any>, req: Request) {
    const url = new URL(req.url);
    const queryDataId = url.searchParams.get("data.id") ||
      url.searchParams.get("data_id") ||
      url.searchParams.get("id") ||
      "";
    const queryType = url.searchParams.get("type") || url.searchParams.get("topic") || "";
    const dataId = queryDataId ||
      payload?.data?.id ||
      payload?.data_id ||
      payload?.resource?.id ||
      payload?.id ||
      null;
    return {
      event_type: queryType || payload?.type || payload?.topic || payload?.action || "payment",
      provider_event_id: payload?.id ? String(payload.id) : (dataId ? String(dataId) : undefined),
      external_payment_id: dataId ? String(dataId) : undefined,
    };
  }
}

class UnsupportedProvider implements PaymentProvider {
  id: string;
  name: string;

  constructor(definition: GatewayDefinition) {
    this.id = definition.id;
    this.name = definition.name;
  }

  private unavailable(): never {
    throw new Error(`${this.name} ainda esta marcado como Em breve.`);
  }

  testarConexao(): Promise<ProviderTestResult> {
    this.unavailable();
  }

  criarPix(): Promise<PixResult> {
    this.unavailable();
  }

  consultarPagamento(): Promise<Record<string, any>> {
    this.unavailable();
  }

  cancelarPagamento(): Promise<Record<string, any>> {
    this.unavailable();
  }

  receberWebhook(): Promise<{ event_type: string; provider_event_id?: string; external_payment_id?: string }> {
    this.unavailable();
  }
}

const mercadoPagoProvider = new MercadoPagoProvider();

export function providerForGateway(gateway: string): PaymentProvider {
  const definition = getGatewayDefinition(gateway);
  if (!definition) throw new Error("Gateway de pagamento invalido.");
  if (definition.id === "mercado_pago") return mercadoPagoProvider;
  return new UnsupportedProvider(definition);
}

function parseSignatureHeader(value: string) {
  return value.split(",").reduce((acc, part) => {
    const [key, raw] = part.split("=");
    if (key && raw) acc[key.trim()] = raw.trim();
    return acc;
  }, {} as Record<string, string>);
}

async function hmacSha256Hex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(signature).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

export async function validateMercadoPagoWebhookSignature(req: Request, secret: string, fallbackDataId?: string) {
  if (!secret) return false;
  const signature = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  if (!signature) return false;

  const parsed = parseSignatureHeader(signature);
  const timestamp = parsed.ts;
  const receivedHash = parsed.v1;
  if (!timestamp || !receivedHash) return false;

  const url = new URL(req.url);
  const queryDataId = url.searchParams.get("data.id") || url.searchParams.get("data_id") || fallbackDataId || "";
  const normalizedDataId = /^[A-Z0-9]+$/.test(queryDataId) ? queryDataId.toLowerCase() : queryDataId;

  const manifestParts: string[] = [];
  if (normalizedDataId) manifestParts.push(`id:${normalizedDataId};`);
  if (requestId) manifestParts.push(`request-id:${requestId};`);
  manifestParts.push(`ts:${timestamp};`);

  const expected = await hmacSha256Hex(secret, manifestParts.join(""));
  return timingSafeEqual(expected, receivedHash);
}
