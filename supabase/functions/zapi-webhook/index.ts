import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { abrirCredenciaisZapi } from "../_shared/cofre.ts";

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

// Pós-venda (nov/2026): mensagens recebidas (e as enviadas pelo próprio celular) entram na conversa de pós-venda em
// aberto com aquele número. Foto/áudio/vídeo/documento são copiados para o bucket posvenda-midia (o link do Z-API expira).
const so = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const chaveFone = (v: unknown) => { const d = so(v).replace(/^55(?=\d{10,11}$)/, ""); return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : d; };

async function copiarMidia(supabase: any, empresaId: string, url: string, tipo: string) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return url;
    const ct = r.headers.get("content-type") || "";
    const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : ct.includes("ogg") ? "ogg" : ct.includes("mpeg") ? "mp3" : ct.includes("mp4") ? "mp4" : ct.includes("pdf") ? "pdf" : tipo === "imagem" ? "jpg" : tipo === "audio" ? "ogg" : "bin";
    const caminho = `${empresaId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("posvenda-midia").upload(caminho, new Uint8Array(await r.arrayBuffer()), { contentType: ct || undefined });
    if (error) return url;
    return supabase.storage.from("posvenda-midia").getPublicUrl(caminho).data.publicUrl;
  } catch { return url; }
}

async function registrarPosvenda(supabase: any, empresaId: string, p: Record<string, any>) {
  if (p.isGroup || p.isNewsletter || !p.phone) return;
  const tipoEvento = String(p.type || "");
  if (tipoEvento && !/Received/i.test(tipoEvento)) return;
  const chave = chaveFone(p.phone);
  const { data: conversas } = await supabase.from("posvenda_conversas").select("id,telefone,status")
    .eq("empresa_id", empresaId).in("status", ["ativa", "aguardando"]).order("iniciada_em", { ascending: false }).limit(200);
  const conversa = (conversas || []).find((c: any) => chaveFone(c.telefone) === chave);
  if (!conversa) return;
  const fromMe = Boolean(p.fromMe);
  let tipo = "texto", texto = p.text?.message ?? null, midia: string | null = null;
  if (p.image) { tipo = "imagem"; midia = p.image.imageUrl; texto = p.image.caption || null; }
  else if (p.audio) { tipo = "audio"; midia = p.audio.audioUrl; }
  else if (p.video) { tipo = "video"; midia = p.video.videoUrl; texto = p.video.caption || null; }
  else if (p.document) { tipo = "documento"; midia = p.document.documentUrl; texto = p.document.fileName || p.document.title || null; }
  if (!texto && !midia) return;
  if (midia) midia = await copiarMidia(supabase, empresaId, midia, tipo);
  const quando = p.momment ? new Date(Number(p.momment)).toISOString() : new Date().toISOString();
  const { error } = await supabase.from("posvenda_mensagens").insert({
    empresa_id: empresaId, conversa_id: conversa.id, direcao: fromMe ? "saida" : "entrada", autor: fromMe ? "equipe" : "cliente",
    autor_nome: fromMe ? "Pelo celular" : (p.senderName || p.chatName || null), tipo, texto, midia_url: midia,
    zapi_message_id: p.messageId || null, status: fromMe ? "enviado" : "recebido", created_at: quando,
  });
  if (error && !String(error.message).includes("duplicate")) { console.warn("posvenda mensagem:", error.message); return; }
  await supabase.from("posvenda_conversas").update({ ultima_mensagem_em: quando, ...(conversa.status === "aguardando" && !fromMe ? { status: "ativa" } : {}) }).eq("id", conversa.id);
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
    const { data: credBrutas, error: credError } = await supabase
      .from("zapi_credenciais")
      .select("empresa_id,instance_id,webhook_secret")
      .eq("instance_id", instanceId)
      .maybeSingle();

    if (credError || !credBrutas) return jsonResponse({ erro: "Instancia nao encontrada" }, 404);
    const credentials = await abrirCredenciaisZapi(credBrutas);
    if (!secret || secret !== credentials.webhook_secret) return jsonResponse({ erro: "Webhook nao autorizado" }, 401);

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

    if (payload.phone && ("text" in payload || "image" in payload || "audio" in payload || "video" in payload || "document" in payload)) {
      await registrarPosvenda(supabase, credentials.empresa_id, payload as Record<string, any>);
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

    if (status && ids.length) {
      await supabase.from("posvenda_mensagens").update({ status }).eq("empresa_id", credentials.empresa_id).eq("direcao", "saida").in("zapi_message_id", ids);
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
