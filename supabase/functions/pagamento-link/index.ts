// Link de pagamento do pedido (out/2026). Página pública: o cliente entra com o link + código de 6 números
// e gera o PIX de cada pagamento. Esta função gera a cobrança no gateway da CONTA daquele pagamento (valor
// travado, sem mostrar chave PIX) e consulta se já foi pago (a baixa é feita por pagamento_link_baixar,
// a mesma usada pelo webhook). Sem login: quem confere o código é o banco (pagamento_link_preparar).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  getDecryptedCredentials,
  jsonResponse,
  providerForGateway,
} from "../_shared/payment-gateways.ts";

const VALIDADE_MIN = 30;
const PENDENTES = ["pending", "in_process"];

// data no formato que o Mercado Pago aceita, no fuso de Brasília
function expiraEm(min: number) {
  const d = new Date(Date.now() + min * 60000 - 3 * 3600000);
  return d.toISOString().replace("Z", "-03:00");
}

function publico(pg: Record<string, any>) {
  return {
    qr_code: pg.qr_code,
    qr_code_base64: pg.qr_code_base64,
    expira_em: pg.expires_at,
    valor: pg.amount,
    pago: Boolean(pg.paid_at) || pg.status === "approved",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const action = String(body.action || "");
    const slug = String(body.slug || "").trim();
    const pin = String(body.pin || "").trim();
    const receberId = String(body.receber_id || "").trim();
    if (!["gerar", "consultar"].includes(action) || !slug || !pin || !receberId) {
      return jsonResponse({ erro: "Pedido inválido." }, 400);
    }

    const sc = createServiceClient();
    const { data: prep, error: prepError } = await sc.rpc("pagamento_link_preparar", { p_slug: slug, p_pin: pin, p_receber: receberId });
    if (prepError) throw prepError;
    if (prep?.erro) return jsonResponse({ erro: prep.erro, bloqueado: prep.bloqueado || false }, 403);
    if (prep.pago) return jsonResponse({ ok: true, pago: true });
    if (!prep.connection_id) return jsonResponse({ erro: "Este pagamento ainda não está disponível pelo link. Fale com a nossa equipe." }, 400);

    const { data: connection } = await sc.from("payment_gateway_connections").select("*").eq("id", prep.connection_id).single();
    const credentials = await getDecryptedCredentials(sc, connection.id);
    if (!credentials) return jsonResponse({ erro: "Este pagamento ainda não está disponível pelo link. Fale com a nossa equipe." }, 400);
    const provider = providerForGateway(connection.gateway);
    const ctx = { empresaId: prep.empresa_id, connection, credentials };

    // última cobrança deste pagamento
    const { data: ultima } = await sc.from("payment_gateway_payments").select("*")
      .eq("receber_id", receberId).is("cancelled_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();

    // confere no gateway (também serve quando o webhook não está configurado)
    async function conferir(pg: Record<string, any>) {
      const r = await provider.consultarPagamento(pg.external_id, ctx);
      const aprovado = r.status === "approved";
      const { data: atual } = await sc.from("payment_gateway_payments").update({
        status: r.status || pg.status,
        response: r,
        paid_at: aprovado ? (pg.paid_at || r.date_approved || new Date().toISOString()) : pg.paid_at,
      }).eq("id", pg.id).select("*").single();
      if (aprovado) await sc.rpc("pagamento_link_baixar", { p_payment: pg.id });
      return atual || pg;
    }

    if (action === "consultar") {
      if (!ultima) return jsonResponse({ ok: true, pago: false });
      const atual = await conferir(ultima);
      return jsonResponse({ ok: true, ...publico(atual) });
    }

    // gerar: reaproveita a cobrança em aberto do mesmo valor, se ainda vale
    const aberto = Math.round(Number(prep.aberto) * 100) / 100;
    if (ultima && PENDENTES.includes(String(ultima.status)) && Number(ultima.amount) === aberto
        && (!ultima.expires_at || new Date(ultima.expires_at).getTime() > Date.now() + 60000)) {
      const atual = await conferir(ultima);
      return jsonResponse({ ok: true, ...publico(atual) });
    }

    const expira = expiraEm(VALIDADE_MIN);
    const pix = await provider.criarPix({
      amount: aberto,
      description: "Pedido " + (prep.pedido_numero || "") + " · Pagamento " + (prep.numero || ""),
      external_reference: "link:" + receberId + ":" + Date.now(),
      expires_at: expira,
      due_date: prep.vencimento,
    } as any, ctx);

    const { data: pg, error: insError } = await sc.from("payment_gateway_payments").insert({
      empresa_id: prep.empresa_id,
      gateway_connection_id: connection.id,
      gateway: connection.gateway,
      receber_id: receberId,
      parcela_label: "Pagamento " + (prep.numero || ""),
      due_date: prep.vencimento,
      external_id: pix.external_id,
      external_reference: pix.external_reference,
      status: pix.status,
      amount: pix.amount,
      payment_method: "pix",
      qr_code: pix.qr_code,
      qr_code_base64: pix.qr_code_base64,
      ticket_url: pix.ticket_url,
      payload: pix.payload,
      response: pix.provider_response,
      expires_at: new Date(Date.now() + VALIDADE_MIN * 60000).toISOString(),
      generated_by_name: "Link de pagamento",
    }).select("*").single();
    if (insError) throw insError;

    await sc.from("payment_gateway_history").insert({
      empresa_id: prep.empresa_id, payment_id: pg.id, gateway_connection_id: connection.id, gateway: connection.gateway,
      event_type: "pix_generated", usuario_nome: "Link de pagamento", external_id: pg.external_id, status: pg.status,
      payload: { amount: pg.amount, receber_id: receberId, origem: "link" },
    });

    return jsonResponse({ ok: true, ...publico(pg) });
  } catch (e) {
    console.error("pagamento-link erro", e);
    return jsonResponse({ erro: "Não foi possível gerar o pagamento agora. Tente de novo em instantes." }, 500);
  }
});
