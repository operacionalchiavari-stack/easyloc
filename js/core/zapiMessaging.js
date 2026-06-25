(function(){
  function contextEmpresaId(){
    return window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id") || null;
  }

  function supabase(){
    return window.supabaseClient || window.supabase || null;
  }

  function normalizePhone(value = ""){
    return String(value).replace(/\D/g, "");
  }

  async function confirmSend(phone, preview){
    const message = `Enviar WhatsApp para ${phone}?\n\n${String(preview || "").slice(0, 220)}`;
    if(typeof window.confirmarGlobal === "function"){
      return await window.confirmarGlobal(message, "Confirmar envio WhatsApp", {
        confirmarTexto: "Enviar",
        tipo: "warning"
      });
    }
    return confirm(message);
  }

  async function send(payload = {}){
    const sb = supabase();
    let empresaId = contextEmpresaId();
    const phone = normalizePhone(payload.phone);
    const text = String(payload.text || payload.caption || "").trim();

    if(!sb?.functions?.invoke) throw new Error("Supabase Functions indisponivel.");
    if(!empresaId) throw new Error("Empresa nao identificada.");
    if(!phone) throw new Error("Numero de WhatsApp ausente.");

    if(payload.confirm !== false){
      const ok = await confirmSend(phone, text || payload.fileUrl || "Arquivo");
      if(!ok) return { cancelled: true };
    }

    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    const session = sessionData?.session;
    if(sessionError || !session?.access_token) throw new Error("Sessao expirada. Faca login novamente.");

    const { data: vinculos, error: vinculoError } = await sb
      .from("usuarios_empresas")
      .select("empresa_id")
      .eq("user_id", session.user.id);

    if(vinculoError) throw new Error(`Nao foi possivel validar a empresa do usuario: ${vinculoError.message}`);

    const empresasPermitidas = (vinculos || []).map((item) => String(item.empresa_id));
    if(!empresasPermitidas.includes(String(empresaId))){
      empresaId = empresasPermitidas[0] || null;
      if(!empresaId) throw new Error("Usuario sem empresa vinculada para envio por WhatsApp.");
      sessionStorage.setItem("empresa_id", empresaId);
      window.__CONTEXT = { ...(window.__CONTEXT || {}), empresa_id: empresaId };
    }

    const { data, error } = await sb.functions.invoke("zapi-integration", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: {
        action: "send-message",
        empresa_id: empresaId,
        message: {
          phone,
          type: payload.type || "texto",
          text,
          caption: payload.caption || text,
          fileUrl: payload.fileUrl || "",
          fileName: payload.fileName || "",
          origem: payload.origin || payload.origem || "manual",
        }
      }
    });

    if(error){
      const context = error.context;
      if(context?.json){
        const body = await context.json().catch(() => null);
        if(body?.erro || body?.details) throw new Error(body.erro || body.details);
      }
      throw error;
    }
    if(data?.erro) throw new Error(data.erro);
    return data;
  }

  const templates = {
    orcamento: (pedido = {}) => ({
      origin: "comercial_orcamento",
      text: `Olá! Segue o orçamento ${pedido.numero ? `#${pedido.numero}` : ""} da ${pedido.empresa || "EasyLoc"}. ${pedido.link || ""}`.trim()
    }),
    proposta: (pedido = {}) => ({
      origin: "comercial_proposta",
      text: `Olá! Preparamos a proposta ${pedido.numero ? `#${pedido.numero}` : ""}. ${pedido.link || ""}`.trim()
    }),
    cobrancaAsaas: (cobranca = {}) => ({
      origin: "financeiro_cobranca_asaas",
      text: `Olá! Segue a cobrança${cobranca.valor ? ` no valor de ${cobranca.valor}` : ""}: ${cobranca.link || ""}`.trim()
    }),
    pix: (pix = {}) => ({
      origin: "financeiro_pix",
      text: `Olá! Segue o PIX para pagamento: ${pix.codigo || pix.link || ""}`.trim()
    }),
    lembrete: (payload = {}) => ({
      origin: "financeiro_lembrete",
      text: payload.text || "Olá! Passando para lembrar sobre o pagamento em aberto."
    }),
    separacao: (pedido = {}) => ({
      origin: "separacao_status",
      text: `Olá! Seu pedido ${pedido.numero ? `#${pedido.numero}` : ""} entrou em separação.`.trim()
    }),
    expedicao: (pedido = {}) => ({
      origin: "expedicao_saida",
      text: `Seu pedido ${pedido.numero ? `#${pedido.numero}` : ""} saiu para entrega.`.trim()
    }),
    entrega: (pedido = {}) => ({
      origin: "entrega_concluida",
      text: `Pedido ${pedido.numero ? `#${pedido.numero}` : ""} entregue.`.trim()
    }),
    crm: (payload = {}) => ({
      origin: "crm_manual",
      text: payload.text || ""
    })
  };

  async function sendTemplate(templateName, phone, data = {}){
    const template = templates[templateName];
    if(!template) throw new Error("Template WhatsApp nao encontrado.");
    return send({ phone, ...template(data), ...data });
  }

  window.EasyLocWhatsApp = {
    send,
    sendTemplate,
    templates,
    normalizePhone
  };
})();
