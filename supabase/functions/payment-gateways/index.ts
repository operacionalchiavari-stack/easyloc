import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  assertRequiredCredentials,
  cleanCredentialInput,
  corsHeaders,
  credentialPreview,
  getConnection,
  getDecryptedCredentials,
  getGatewayDefinition,
  jsonResponse,
  listGateways,
  mergeCredentials,
  providerForGateway,
  sanitizeConnection,
  saveEncryptedCredentials,
  upsertConnection,
  validarAcessoEmpresa,
} from "../_shared/payment-gateways.ts";

type Action =
  | "list"
  | "save"
  | "test"
  | "disconnect"
  | "find_active_pix"
  | "create_pix"
  | "consultar_pagamento"
  | "cancelar_pagamento"
  | "register_whatsapp_send";

type RequestBody = {
  action?: Action;
  empresa_id?: string;
  gateway?: string;
  ambiente?: "sandbox" | "producao";
  credentials?: Record<string, unknown>;
  payment?: Record<string, unknown>;
  payment_id?: string;
  external_id?: string;
};

const ACTIVE_PIX_STATUSES = ["pending", "in_process", "authorized", "pendente", "aguardando_pagamento"];

function usuarioNome(user: Record<string, any>) {
  return String(
    user?.user_metadata?.nome
    || user?.user_metadata?.name
    || user?.email
    || ""
  ).trim() || null;
}

function parcelaIndex(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizarData(value: unknown) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return null;
}

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

async function registrarHistorico(
  serviceClient: any,
  payload: Record<string, any>,
) {
  const { error } = await serviceClient
    .from("payment_gateway_history")
    .insert({
      empresa_id: payload.empresa_id,
      payment_id: payload.payment_id || null,
      gateway_connection_id: payload.gateway_connection_id || null,
      gateway: payload.gateway,
      pedido_id: payload.pedido_id || null,
      parcela_index: payload.parcela_index ?? null,
      event_type: payload.event_type,
      usuario_id: payload.usuario_id || null,
      usuario_nome: payload.usuario_nome || null,
      external_id: payload.external_id || null,
      status: payload.status || null,
      payload: payload.payload || {},
    });

  if (error) throw error;
}

async function buscarPixAtivo(serviceClient: any, params: {
  empresaId: string;
  gateway: string;
  pedidoId?: unknown;
  parcelaIndex?: number | null;
}) {
  const pedidoId = String(params.pedidoId || "").trim();
  if (!pedidoId) return null;

  let query = serviceClient
    .from("payment_gateway_payments")
    .select("*")
    .eq("empresa_id", params.empresaId)
    .eq("gateway", params.gateway)
    .eq("payment_method", "pix")
    .eq("pedido_id", pedidoId)
    .in("status", ACTIVE_PIX_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1);

  if (params.parcelaIndex === null || params.parcelaIndex === undefined) {
    query = query.is("parcela_index", null);
  } else {
    query = query.eq("parcela_index", params.parcelaIndex);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function aplicarBaixaNoPedido(
  serviceClient: any,
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
  if (pagamentosGateway.some((item: Record<string, any>) => String(item.external_id || "") === externalId)) return;

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

function assertGateway(body: RequestBody) {
  const gateway = String(body.gateway || "").trim();
  if (!gateway) throw new Error("Gateway de pagamento ausente.");
  const definition = getGatewayDefinition(gateway);
  if (!definition) throw new Error("Gateway de pagamento invalido.");
  return { gateway, definition };
}

async function readBody(req: Request) {
  try {
    return await req.json() as RequestBody;
  } catch {
    return {} as RequestBody;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await readBody(req);

    if (!body.action || !body.empresa_id) {
      return jsonResponse({ erro: "Payload invalido" }, 400);
    }

    const empresaId = String(body.empresa_id).trim();
    const acesso = await validarAcessoEmpresa(req, empresaId);

    if ("error" in acesso) {
      return jsonResponse({ erro: acesso.error }, acesso.status);
    }

    const { serviceClient, user } = acesso;

    if (body.action === "list") {
      return jsonResponse({
        ok: true,
        gateways: await listGateways(serviceClient, empresaId),
      });
    }

    const { gateway, definition } = assertGateway(body);
    const provider = providerForGateway(gateway);

    if (!definition.available) {
      return jsonResponse({ erro: `${definition.name} ainda esta marcado como Em breve.` }, 400);
    }

    if (body.action === "save") {
      const ambiente = body.ambiente === "producao" ? "producao" : "sandbox";
      const existingConnection = await getConnection(serviceClient, empresaId, gateway);
      const currentCredentials = existingConnection?.id
        ? await getDecryptedCredentials(serviceClient, existingConnection.id)
        : null;

      const incomingCredentials = cleanCredentialInput(body.credentials || {});
      const mergedCredentials = mergeCredentials(currentCredentials, incomingCredentials);
      assertRequiredCredentials(definition, mergedCredentials);

      const status = existingConnection?.status === "conectado" && Object.keys(incomingCredentials).length === 0
        ? "conectado"
        : "desconectado";

      const connection = await upsertConnection(serviceClient, empresaId, definition, {
        ambiente,
        status,
        credential_preview: credentialPreview(definition, mergedCredentials),
        ultimo_erro: null,
        ultimo_teste_status: status === "conectado" ? existingConnection?.ultimo_teste_status : null,
      });

      await saveEncryptedCredentials(serviceClient, empresaId, connection.id, mergedCredentials);

      return jsonResponse({
        ok: true,
        gateway: sanitizeConnection(connection, definition),
        gateways: await listGateways(serviceClient, empresaId),
      });
    }

    const connection = await getConnection(serviceClient, empresaId, gateway);
    if (!connection?.id) {
      return jsonResponse({ erro: "Gateway ainda nao foi configurado." }, 400);
    }

    if (body.action === "disconnect") {
      const { error: credentialError } = await serviceClient
        .from("payment_gateway_credentials")
        .delete()
        .eq("connection_id", connection.id);

      if (credentialError) throw credentialError;

      const { data: updated, error: updateError } = await serviceClient
        .from("payment_gateway_connections")
        .update({
          status: "desconectado",
          credential_preview: {},
          connected_at: null,
          ultimo_erro: null,
          provider_account: {},
        })
        .eq("id", connection.id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      return jsonResponse({
        ok: true,
        gateway: sanitizeConnection(updated, definition),
        gateways: await listGateways(serviceClient, empresaId),
      });
    }

    const credentials = await getDecryptedCredentials(serviceClient, connection.id);
    if (!credentials) {
      return jsonResponse({ erro: "Credenciais protegidas nao encontradas para este gateway." }, 400);
    }

    if (body.action === "test") {
      await serviceClient
        .from("payment_gateway_connections")
        .update({ status: "em_teste", ultimo_erro: null })
        .eq("id", connection.id);

      const result = await provider.testarConexao(credentials, connection.ambiente);
      const testedAt = new Date().toISOString();

      const { data: updated, error: updateError } = await serviceClient
        .from("payment_gateway_connections")
        .update({
          status: result.ok ? "conectado" : "erro",
          connected_at: result.ok ? (connection.connected_at || testedAt) : connection.connected_at,
          ultimo_teste_at: testedAt,
          ultimo_teste_ms: result.response_ms,
          ultimo_teste_status: result.ok ? "sucesso" : "erro",
          ultima_sincronizacao: result.ok ? testedAt : connection.ultima_sincronizacao,
          ultimo_erro: result.ok ? null : result.error,
          provider_account: result.account || {},
        })
        .eq("id", connection.id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      return jsonResponse({
        ok: result.ok,
        test: result,
        gateway: sanitizeConnection(updated, definition),
        gateways: await listGateways(serviceClient, empresaId),
      }, result.ok ? 200 : 400);
    }

    if (body.action === "find_active_pix") {
      const paymentInput = body.payment || {};
      const active = await buscarPixAtivo(serviceClient, {
        empresaId,
        gateway,
        pedidoId: paymentInput.pedido_id,
        parcelaIndex: parcelaIndex(paymentInput.parcela_index),
      });

      return jsonResponse({ ok: true, payment: active, existing: Boolean(active) });
    }

    if (body.action === "create_pix") {
      if (connection.status !== "conectado") {
        return jsonResponse({ erro: "Teste e conecte o gateway antes de gerar PIX." }, 400);
      }

      const paymentInput = body.payment || {};
      const currentParcelaIndex = parcelaIndex(paymentInput.parcela_index);
      const forceNew = paymentInput.force_new === true;
      const active = await buscarPixAtivo(serviceClient, {
        empresaId,
        gateway,
        pedidoId: paymentInput.pedido_id,
        parcelaIndex: currentParcelaIndex,
      });

      if (active && !forceNew) {
        return jsonResponse({ ok: true, existing: true, payment: active });
      }

      const pix = await provider.criarPix(paymentInput, {
        empresaId,
        connection,
        credentials,
      });

      const { data: payment, error: paymentError } = await serviceClient
        .from("payment_gateway_payments")
        .insert({
          empresa_id: empresaId,
          gateway_connection_id: connection.id,
          gateway,
          pedido_id: paymentInput.pedido_id || null,
          parcela_index: currentParcelaIndex,
          parcela_numero: paymentInput.parcela_numero || null,
          parcela_label: paymentInput.parcela_label || null,
          due_date: normalizarData(paymentInput.due_date || paymentInput.vencimento),
          external_id: pix.external_id,
          external_reference: pix.external_reference,
          status: pix.status,
          amount: pix.amount,
          payment_method: "pix",
          payer_email: paymentInput.payer_email || paymentInput.email || null,
          qr_code: pix.qr_code,
          qr_code_base64: pix.qr_code_base64,
          ticket_url: pix.ticket_url,
          payload: pix.payload,
          response: pix.provider_response,
          expires_at: paymentInput.expires_at || null,
          generated_by: user.id,
          generated_by_name: usuarioNome(user),
        })
        .select("*")
        .single();

      if (paymentError) throw paymentError;

      await registrarHistorico(serviceClient, {
        empresa_id: empresaId,
        payment_id: payment.id,
        gateway_connection_id: connection.id,
        gateway,
        pedido_id: payment.pedido_id,
        parcela_index: payment.parcela_index,
        event_type: "pix_generated",
        usuario_id: user.id,
        usuario_nome: usuarioNome(user),
        external_id: payment.external_id,
        status: payment.status,
        payload: {
          amount: payment.amount,
          due_date: payment.due_date,
          parcela_numero: payment.parcela_numero,
          parcela_label: payment.parcela_label,
        },
      });

      await serviceClient
        .from("payment_gateway_connections")
        .update({ ultima_sincronizacao: new Date().toISOString(), ultimo_erro: null })
        .eq("id", connection.id);

      return jsonResponse({ ok: true, payment });
    }

    if (body.action === "consultar_pagamento") {
      const externalId = String(body.external_id || body.payment?.external_id || "").trim();
      const result = await provider.consultarPagamento(externalId, { empresaId, connection, credentials });

      const { data: currentPayment, error: currentPaymentError } = await serviceClient
        .from("payment_gateway_payments")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("gateway", gateway)
        .eq("external_id", externalId)
        .maybeSingle();

      if (currentPaymentError) throw currentPaymentError;

      const { data: payment, error: paymentError } = await serviceClient
        .from("payment_gateway_payments")
        .update({
          status: result.status || "consultado",
          response: result,
          paid_at: result.status === "approved" ? (result.date_approved || new Date().toISOString()) : null,
        })
        .eq("empresa_id", empresaId)
        .eq("gateway", gateway)
        .eq("external_id", externalId)
        .select("*")
        .maybeSingle();

      if (paymentError) throw paymentError;

      if (payment && result.status === "approved" && !currentPayment?.paid_at) {
        await aplicarBaixaNoPedido(serviceClient, { ...payment, paid_at: null }, result);
      }

      if (payment) {
        await registrarHistorico(serviceClient, {
          empresa_id: empresaId,
          payment_id: payment.id,
          gateway_connection_id: connection.id,
          gateway,
          pedido_id: payment.pedido_id,
          parcela_index: payment.parcela_index,
          event_type: "pix_status_refreshed",
          usuario_id: user.id,
          usuario_nome: usuarioNome(user),
          external_id: externalId,
          status: payment.status,
          payload: { provider_status: result.status || null },
        });
      }

      return jsonResponse({ ok: true, payment: payment || result, provider_payment: result });
    }

    if (body.action === "cancelar_pagamento") {
      const externalId = String(body.external_id || body.payment?.external_id || "").trim();
      const result = await provider.cancelarPagamento(externalId, { empresaId, connection, credentials });

      const { data: payment, error: paymentError } = await serviceClient
        .from("payment_gateway_payments")
        .update({
          status: result.status || "cancelled",
          response: result,
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.id,
          cancelled_by_name: usuarioNome(user),
        })
        .eq("empresa_id", empresaId)
        .eq("gateway", gateway)
        .eq("external_id", externalId)
        .select("*")
        .maybeSingle();

      if (paymentError) throw paymentError;

      if (payment) {
        await registrarHistorico(serviceClient, {
          empresa_id: empresaId,
          payment_id: payment.id,
          gateway_connection_id: connection.id,
          gateway,
          pedido_id: payment.pedido_id,
          parcela_index: payment.parcela_index,
          event_type: "pix_cancelled",
          usuario_id: user.id,
          usuario_nome: usuarioNome(user),
          external_id: externalId,
          status: payment.status,
          payload: { provider_status: result.status || null },
        });
      }

      return jsonResponse({ ok: true, payment: payment || result, provider_payment: result });
    }

    if (body.action === "register_whatsapp_send") {
      const externalId = String(body.external_id || body.payment?.external_id || "").trim();
      const paymentId = String(body.payment_id || body.payment?.id || "").trim();

      let query = serviceClient
        .from("payment_gateway_payments")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("gateway", gateway);

      if (paymentId) {
        query = query.eq("id", paymentId);
      } else {
        query = query.eq("external_id", externalId);
      }

      const { data: currentPayment, error: findError } = await query.maybeSingle();
      if (findError) throw findError;
      if (!currentPayment) return jsonResponse({ erro: "Cobranca PIX nao encontrada para registrar envio." }, 404);

      const sentAt = new Date().toISOString();
      const { data: payment, error: updateError } = await serviceClient
        .from("payment_gateway_payments")
        .update({
          sent_by: user.id,
          sent_by_name: usuarioNome(user),
          sent_at: sentAt,
        })
        .eq("id", currentPayment.id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      await registrarHistorico(serviceClient, {
        empresa_id: empresaId,
        payment_id: payment.id,
        gateway_connection_id: connection.id,
        gateway,
        pedido_id: payment.pedido_id,
        parcela_index: payment.parcela_index,
        event_type: "pix_sent_whatsapp",
        usuario_id: user.id,
        usuario_nome: usuarioNome(user),
        external_id: payment.external_id,
        status: payment.status,
        payload: {
          phone: body.payment?.phone || null,
          message_sent: Boolean(body.payment?.message_sent),
          qr_sent: Boolean(body.payment?.qr_sent),
        },
      });

      return jsonResponse({ ok: true, payment });
    }

    return jsonResponse({ erro: "Acao invalida" }, 400);
  } catch (error) {
    console.error("payment-gateways erro", error);
    return jsonResponse({ erro: error instanceof Error ? error.message : "Erro interno no gateway de pagamento" }, 500);
  }
});
