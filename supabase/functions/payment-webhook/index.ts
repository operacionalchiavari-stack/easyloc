import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  getDecryptedCredentials,
  getGatewayDefinition,
  jsonResponse,
  providerForGateway,
  validateMercadoPagoWebhookSignature,
} from "../_shared/payment-gateways.ts";

function numero(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const raw = String(value)
    .replace("R$", "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return Math.max(0, Number(raw) || 0);
}

function parcelaIndex(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function readPayload(req: Request) {
  try {
    return await req.json() as Record<string, any>;
  } catch {
    return {};
  }
}

async function findConnection(serviceClient: ReturnType<typeof createServiceClient>, url: URL, gateway: string) {
  const connectionId = url.searchParams.get("connection_id");
  const empresaId = url.searchParams.get("empresa_id");

  let query = serviceClient
    .from("payment_gateway_connections")
    .select("*")
    .eq("gateway", gateway);

  if (connectionId) {
    query = query.eq("id", connectionId);
  } else if (empresaId) {
    query = query.eq("empresa_id", empresaId);
  } else {
    throw new Error("connection_id ou empresa_id ausente na URL do webhook.");
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function aplicarBaixaNoPedido(
  serviceClient: ReturnType<typeof createServiceClient>,
  payment: Record<string, any>,
  providerPayment: Record<string, any>,
) {
  if (!payment?.pedido_id || payment?.paid_at) return;

  const { data: pedido, error } = await serviceClient
    .from("separacoes_pedidos")
    .select("id,empresa_id,valor_total,observacoes")
    .eq("id", payment.pedido_id)
    .eq("empresa_id", payment.empresa_id)
    .maybeSingle();

  if (error) throw error;
  if (!pedido) return;

  const observacoes = pedido.observacoes && typeof pedido.observacoes === "object"
    ? { ...pedido.observacoes }
    : {};
  const pagamentosGateway = Array.isArray(observacoes.pagamentos_gateway)
    ? [...observacoes.pagamentos_gateway]
    : [];

  const externalId = String(payment.external_id || providerPayment.id || "");
  if (pagamentosGateway.some((item) => String(item.external_id || "") === externalId)) return;

  const valorPago = numero(payment.amount || providerPayment.transaction_amount);
  const valorRecebidoAtual = numero(observacoes.valor_recebido || observacoes.total_recebido);
  const valorTotal = numero(pedido.valor_total);
  const novoRecebido = valorTotal > 0
    ? Math.min(valorTotal, valorRecebidoAtual + valorPago)
    : valorRecebidoAtual + valorPago;
  const statusFinanceiro = valorTotal > 0 && novoRecebido + 0.01 >= valorTotal ? "quitado" : "parcial";

  const currentParcelaIndex = parcelaIndex(payment.parcela_index);

  pagamentosGateway.push({
    gateway: payment.gateway,
    external_id: externalId,
    valor: valorPago,
    status: providerPayment.status || payment.status,
    parcela_index: currentParcelaIndex,
    parcela_numero: payment.parcela_numero || null,
    parcela_label: payment.parcela_label || null,
    pago_em: providerPayment.date_approved || new Date().toISOString(),
  });

  const parcelas = Array.isArray(observacoes.parcelas_financeiras)
    ? [...observacoes.parcelas_financeiras]
    : [];
  if (currentParcelaIndex !== null && parcelas[currentParcelaIndex]) {
    parcelas[currentParcelaIndex] = {
      ...parcelas[currentParcelaIndex],
      status: "Recebido",
      baixado: valorPago,
      valor_recebido: valorPago,
      recebido: valorPago,
      baixado_em: providerPayment.date_approved || new Date().toISOString(),
      pix_status: providerPayment.status || payment.status,
      pix_external_id: externalId,
      gateway_pagamento: payment.gateway,
    };
    observacoes.parcelas_financeiras = parcelas;
  }

  observacoes.pagamentos_gateway = pagamentosGateway;
  observacoes.valor_recebido = novoRecebido;
  observacoes.total_recebido = novoRecebido;
  observacoes.status_financeiro = statusFinanceiro;
  observacoes.gateway_pagamento_atualizado_em = new Date().toISOString();

  const { error: updateError } = await serviceClient
    .from("separacoes_pedidos")
    .update({ observacoes })
    .eq("id", pedido.id)
    .eq("empresa_id", pedido.empresa_id);

  if (updateError) throw updateError;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const gateway = url.searchParams.get("gateway") || "mercado_pago";
    const definition = getGatewayDefinition(gateway);
    if (!definition?.available) return jsonResponse({ erro: "Gateway de webhook invalido." }, 400);
    if (!url.searchParams.get("connection_id") && !url.searchParams.get("empresa_id")) {
      return jsonResponse({ erro: "connection_id ou empresa_id ausente na URL do webhook." }, 400);
    }

    const payload = await readPayload(req);
    const serviceClient = createServiceClient();
    const connection = await findConnection(serviceClient, url, gateway);
    if (!connection) return jsonResponse({ erro: "Conexao do gateway nao encontrada." }, 404);

    const credentials = await getDecryptedCredentials(serviceClient, connection.id);
    if (!credentials) return jsonResponse({ erro: "Credenciais do gateway nao encontradas." }, 404);

    const provider = providerForGateway(gateway);
    const parsed = await provider.receberWebhook(payload, req);
    const secret = credentials.webhook_secret || "";
    const fallbackSecret = url.searchParams.get("secret") || req.headers.get("x-easyloc-webhook-secret") || "";
    const allowUnsigned = Deno.env.get("PAYMENT_GATEWAY_ALLOW_UNSIGNED_WEBHOOKS") === "true";

    let authorized = allowUnsigned;
    if (gateway === "mercado_pago" && secret) {
      authorized = await validateMercadoPagoWebhookSignature(req, secret, parsed.external_payment_id);
    }
    if (!authorized && secret && fallbackSecret && fallbackSecret === secret) {
      authorized = true;
    }
    if (!authorized) {
      return jsonResponse({ erro: "Assinatura do webhook invalida." }, 401);
    }

    const { data: event, error: eventError } = await serviceClient
      .from("payment_gateway_events")
      .insert({
        empresa_id: connection.empresa_id,
        gateway_connection_id: connection.id,
        gateway,
        event_type: parsed.event_type,
        provider_event_id: parsed.provider_event_id,
        external_payment_id: parsed.external_payment_id,
        payload,
      })
      .select("*")
      .single();

    if (eventError) throw eventError;

    let providerPayment: Record<string, any> | null = null;

    if (parsed.external_payment_id) {
      providerPayment = await provider.consultarPagamento(parsed.external_payment_id, {
        empresaId: connection.empresa_id,
        connection,
        credentials,
      });

      const { data: currentPayment, error: currentError } = await serviceClient
        .from("payment_gateway_payments")
        .select("*")
        .eq("empresa_id", connection.empresa_id)
        .eq("gateway", gateway)
        .eq("external_id", parsed.external_payment_id)
        .maybeSingle();

      if (currentError) throw currentError;

      const metadata = providerPayment.metadata || {};
      const paidAt = providerPayment.status === "approved"
        ? (providerPayment.date_approved || new Date().toISOString())
        : currentPayment?.paid_at || null;

      const paymentPayload = {
        empresa_id: connection.empresa_id,
        gateway_connection_id: connection.id,
        gateway,
        pedido_id: currentPayment?.pedido_id || metadata?.pedido_id || null,
        parcela_index: parcelaIndex(currentPayment?.parcela_index) ?? parcelaIndex(metadata?.parcela_index),
        parcela_numero: currentPayment?.parcela_numero || metadata?.parcela_numero || null,
        parcela_label: currentPayment?.parcela_label || metadata?.parcela_label || null,
        due_date: currentPayment?.due_date || metadata?.due_date || null,
        external_id: parsed.external_payment_id,
        external_reference: providerPayment.external_reference || currentPayment?.external_reference || null,
        status: providerPayment.status || "recebido",
        amount: numero(providerPayment.transaction_amount || currentPayment?.amount),
        currency: providerPayment.currency_id || currentPayment?.currency || "BRL",
        payment_method: providerPayment.payment_method_id || currentPayment?.payment_method || "pix",
        payer_email: providerPayment.payer?.email || currentPayment?.payer_email || null,
        qr_code: currentPayment?.qr_code || null,
        qr_code_base64: currentPayment?.qr_code_base64 || null,
        ticket_url: currentPayment?.ticket_url || null,
        payload: currentPayment?.payload || {},
        response: providerPayment,
        paid_at: paidAt,
      };

      const { data: updatedPayment, error: paymentError } = await serviceClient
        .from("payment_gateway_payments")
        .upsert(paymentPayload, { onConflict: "gateway,external_id" })
        .select("*")
        .single();

      if (paymentError) throw paymentError;

      if (providerPayment.status === "approved" && !currentPayment?.paid_at) {
        await aplicarBaixaNoPedido(serviceClient, { ...updatedPayment, paid_at: null }, providerPayment);
      }

      await serviceClient
        .from("payment_gateway_history")
        .insert({
          empresa_id: connection.empresa_id,
          payment_id: updatedPayment.id,
          gateway_connection_id: connection.id,
          gateway,
          pedido_id: updatedPayment.pedido_id,
          parcela_index: updatedPayment.parcela_index,
          event_type: providerPayment.status === "approved" ? "pix_paid" : "pix_webhook_status",
          external_id: updatedPayment.external_id,
          status: updatedPayment.status,
          payload: {
            provider_event_id: parsed.provider_event_id || null,
            provider_status: providerPayment.status || null,
          },
        });
    }

    await serviceClient
      .from("payment_gateway_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", event.id);

    await serviceClient
      .from("payment_gateway_connections")
      .update({ ultima_sincronizacao: new Date().toISOString(), ultimo_erro: null })
      .eq("id", connection.id);

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("payment-webhook erro", error);
    return jsonResponse({ erro: error instanceof Error ? error.message : "Erro interno no webhook de pagamento" }, 500);
  }
});
