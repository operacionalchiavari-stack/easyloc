(function(){
  const state = {
    context: null,
    payment: null,
    existingPayment: null,
    isBusy: false
  };

  function sb(){
    return window.supabaseClient || window.supabase || null;
  }

  function empresaId(){
    return window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id") || null;
  }

  function notify(message, title = "PIX", type = "info"){
    if(typeof window.alerta === "function"){
      window.alerta(message, title, type);
      return;
    }
    alert(message);
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function onlyDigits(value){
    return String(value || "").replace(/\D/g, "");
  }

  function moneyNumber(value){
    if(typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? "")
      .replace("R$", "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    return Math.max(0, Number(raw) || 0);
  }

  function formatCurrency(value){
    return moneyNumber(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function isoDate(value){
    const text = String(value || "").trim();
    if(!text) return "";
    if(/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(br) return `${br[3]}-${br[2]}-${br[1]}`;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }

  function formatDate(value){
    const iso = isoDate(value);
    if(!iso) return "-";
    const date = new Date(`${iso}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
  }

  function parcelaIndex(value){
    if(value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  function normalizeContext(raw = {}){
    const index = parcelaIndex(raw.parcelaIndex ?? raw.parcela_index);
    const numeroPedido = String(raw.numeroPedido || raw.numero_pedido || raw.documento || raw.pedido || "").replace(/^PED-/i, "").replace(/^#/, "");
    const parcelaNumero = raw.parcelaNumero || raw.parcela_numero || (index !== null ? String(index + 1) : "");
    const parcelaLabel = raw.parcelaLabel || raw.parcela_label || raw.parcela || (parcelaNumero ? `Parcela ${parcelaNumero}` : "Pedido");
    return {
      source: raw.source || "pedido",
      gateway: raw.gateway || "mercado_pago",
      pedidoId: raw.pedidoId || raw.pedido_id || null,
      numeroPedido: numeroPedido || "-",
      clienteId: raw.clienteId || raw.cliente_id || null,
      cliente: raw.cliente || raw.cliente_nome || "Cliente nao informado",
      clienteEmail: raw.clienteEmail || raw.email || raw.payer_email || "",
      contato: raw.contato || raw.telefone || raw.phone || "",
      parcelaIndex: index,
      parcelaNumero,
      parcelaLabel,
      valor: moneyNumber(raw.valor || raw.amount || raw.total || raw.saldo),
      vencimento: isoDate(raw.vencimento || raw.due_date || raw.data || raw.data_vencimento),
      descricao: raw.descricao || ""
    };
  }

  function randomId(){
    return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function getSession(){
    const client = sb();
    if(!client?.auth?.getSession) throw new Error("Supabase indisponivel.");
    const { data, error } = await client.auth.getSession();
    if(error || !data?.session?.access_token) throw new Error("Sessao expirada. Faca login novamente.");
    return data.session;
  }

  async function invokePayment(action, payload = {}){
    const client = sb();
    const company = empresaId();
    if(!client?.functions?.invoke) throw new Error("Supabase Functions indisponivel.");
    if(!company) throw new Error("Empresa nao identificada.");
    const session = await getSession();

    const { data, error } = await client.functions.invoke("payment-gateways", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        action,
        empresa_id: company,
        gateway: payload.gateway || state.context?.gateway || "mercado_pago",
        ...payload
      }
    });

    if(error){
      const context = error.context;
      if(context?.json){
        const body = await context.json().catch(() => null);
        if(body?.erro || body?.error) throw new Error(body.erro || body.error);
      }
      throw error;
    }
    if(data?.erro) throw new Error(data.erro);
    return data;
  }

  function pickEmail(row){
    if(!row || typeof row !== "object") return "";
    return row.email
      || row.email_principal
      || row.email_cliente
      || row.contato_email
      || row.email_contato
      || "";
  }

  async function resolvePayerEmail(context){
    if(context.clienteEmail) return context.clienteEmail;
    const client = sb();
    const company = empresaId();

    try{
      if(client?.from && company && (context.clienteId || context.cliente)){
        let query = client
          .from("clientes_empresas")
          .select("*")
          .eq("empresa_id", company)
          .limit(1);

        if(context.clienteId){
          query = query.eq("id", context.clienteId);
        }else{
          query = query.ilike("nome_razao", context.cliente);
        }

        const { data } = await query.maybeSingle();
        const email = pickEmail(data);
        if(email) return email;
      }
    }catch(error){
      console.warn("[EasyLocPix] email do cliente ignorado:", error);
    }

    const pedido = String(context.numeroPedido || context.pedidoId || Date.now())
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "")
      .slice(0, 32) || String(Date.now());
    return `cliente.pix.${pedido}@easyloc.app`;
  }

  function ensureModals(){
    let main = document.getElementById("easylocPixModal");
    if(!main){
      main = document.createElement("div");
      main.id = "easylocPixModal";
      main.className = "el-pix-backdrop";
      main.innerHTML = `
        <section class="el-pix-dialog" role="dialog" aria-modal="true" aria-labelledby="elPixTitle">
          <header class="el-pix-header">
            <div>
              <span class="el-pix-kicker">PIX</span>
              <h2 id="elPixTitle">Gerar cobranca PIX</h2>
            </div>
            <button type="button" class="el-pix-close" data-pix-action="close" aria-label="Fechar">
              <i data-lucide="x"></i>
            </button>
          </header>
          <div class="el-pix-body">
            <div class="el-pix-summary" id="elPixSummary"></div>
            <div class="el-pix-existing hidden" id="elPixExisting"></div>
            <div class="el-pix-result" id="elPixResult"></div>
          </div>
          <footer class="el-pix-footer" id="elPixFooter"></footer>
        </section>
      `;
      document.body.appendChild(main);
    }

    let whatsapp = document.getElementById("easylocPixWhatsappModal");
    if(!whatsapp){
      whatsapp = document.createElement("div");
      whatsapp.id = "easylocPixWhatsappModal";
      whatsapp.className = "el-pix-backdrop el-pix-backdrop-nested";
      whatsapp.innerHTML = `
        <section class="el-pix-dialog el-pix-whatsapp" role="dialog" aria-modal="true" aria-labelledby="elPixWhatsappTitle">
          <header class="el-pix-header">
            <div>
              <span class="el-pix-kicker">WhatsApp</span>
              <h2 id="elPixWhatsappTitle">Enviar PIX</h2>
            </div>
            <button type="button" class="el-pix-close" data-pix-whatsapp-action="close" aria-label="Fechar">
              <i data-lucide="x"></i>
            </button>
          </header>
          <div class="el-pix-body">
            <label class="el-pix-field">
              <span>Mensagem</span>
              <textarea id="elPixWhatsappText" rows="12"></textarea>
            </label>
          </div>
          <footer class="el-pix-footer">
            <button type="button" class="el-pix-button secondary" data-pix-whatsapp-action="close">Cancelar</button>
            <button type="button" class="el-pix-button success" data-pix-whatsapp-action="send">
              <i data-lucide="send"></i>
              Enviar WhatsApp
            </button>
          </footer>
        </section>
      `;
      document.body.appendChild(whatsapp);
    }

    bindModalEvents(main, whatsapp);
    window.lucide?.createIcons?.();
    return { main, whatsapp };
  }

  function bindModalEvents(main, whatsapp){
    if(!main.dataset.bound){
      main.dataset.bound = "1";
      main.addEventListener("click", async (event) => {
        if(event.target === main) close();
        const action = event.target.closest("[data-pix-action]")?.dataset?.pixAction;
        if(!action) return;
        if(action === "close") close();
        if(action === "generate") await generatePix(false);
        if(action === "open-existing") renderPayment(state.existingPayment);
        if(action === "replace-existing") await replaceExisting();
        if(action === "copy") await copyPixCode();
        if(action === "download") downloadQrCode();
        if(action === "cancel") await cancelPayment();
        if(action === "refresh") await refreshStatus();
        if(action === "whatsapp") openWhatsapp();
      });
    }

    if(!whatsapp.dataset.bound){
      whatsapp.dataset.bound = "1";
      whatsapp.addEventListener("click", async (event) => {
        if(event.target === whatsapp) closeWhatsapp();
        const action = event.target.closest("[data-pix-whatsapp-action]")?.dataset?.pixWhatsappAction;
        if(action === "close") closeWhatsapp();
        if(action === "send") await sendWhatsapp();
      });
    }
  }

  function badgeLabel(status){
    const normalized = String(status || "").toLowerCase();
    if(["approved", "paid", "pago", "recebido"].includes(normalized)) return "Pago";
    if(["cancelled", "canceled", "cancelado"].includes(normalized)) return "Cancelado";
    if(["expired", "expirado"].includes(normalized)) return "Expirado";
    if(["in_process", "authorized"].includes(normalized)) return "Processando";
    if(["partial", "parcial"].includes(normalized)) return "Parcialmente pago";
    if(["pending", "pendente", "aguardando_pagamento"].includes(normalized)) return "Aguardando pagamento";
    return "Nao gerado";
  }

  function badgeClass(status){
    const label = badgeLabel(status).toLowerCase();
    if(label.includes("pago")) return "paid";
    if(label.includes("cancel")) return "cancelled";
    if(label.includes("expir")) return "expired";
    if(label.includes("process")) return "processing";
    if(label.includes("parcial")) return "partial";
    if(label.includes("aguard")) return "pending";
    return "empty";
  }

  function paymentCode(payment = state.payment){
    return payment?.qr_code
      || payment?.response?.point_of_interaction?.transaction_data?.qr_code
      || payment?.provider_payment?.point_of_interaction?.transaction_data?.qr_code
      || "";
  }

  function qrImageSrc(payment = state.payment){
    const raw = payment?.qr_code_base64
      || payment?.response?.point_of_interaction?.transaction_data?.qr_code_base64
      || payment?.provider_payment?.point_of_interaction?.transaction_data?.qr_code_base64
      || "";
    if(!raw) return "";
    return String(raw).startsWith("data:image") ? raw : `data:image/png;base64,${raw}`;
  }

  function renderSummary(){
    const { main } = ensureModals();
    const summary = main.querySelector("#elPixSummary");
    const ctx = state.context || {};
    summary.innerHTML = `
      <div><span>Cliente</span><strong>${escapeHtml(ctx.cliente)}</strong></div>
      <div><span>Pedido</span><strong>${escapeHtml(ctx.numeroPedido || "-")}</strong></div>
      <div><span>Parcela</span><strong>${escapeHtml(ctx.parcelaLabel || "-")}</strong></div>
      <div><span>Valor</span><strong>${escapeHtml(formatCurrency(ctx.valor))}</strong></div>
      <div><span>Vencimento</span><strong>${escapeHtml(formatDate(ctx.vencimento))}</strong></div>
      <div><span>Gateway</span><strong>Mercado Pago</strong></div>
      <div><span>Status</span><strong><em class="el-pix-status ${badgeClass(state.payment?.status)}">${badgeLabel(state.payment?.status)}</em></strong></div>
    `;
  }

  function setBusy(busy, label = "Processando..."){
    state.isBusy = busy;
    document.querySelectorAll(".el-pix-button").forEach((button) => {
      button.disabled = Boolean(busy);
    });
    const footer = document.getElementById("elPixFooter");
    if(footer){
      footer.dataset.busyLabel = busy ? label : "";
    }
  }

  async function renderQr(container, payment){
    const src = qrImageSrc(payment);
    const code = paymentCode(payment);
    if(src){
      container.innerHTML = `<img src="${src}" alt="QR Code PIX">`;
      return;
    }
    if(code && window.EasyLocQR?.render){
      container.innerHTML = "";
      await window.EasyLocQR.render(container, code, 220);
      return;
    }
    container.innerHTML = `<div class="el-pix-empty-qr">QR Code indisponivel</div>`;
  }

  async function renderPayment(payment){
    state.payment = payment || null;
    if(payment) state.existingPayment = null;
    const { main } = ensureModals();
    const existing = main.querySelector("#elPixExisting");
    const result = main.querySelector("#elPixResult");
    const footer = main.querySelector("#elPixFooter");
    existing.classList.add("hidden");
    renderSummary();

    if(!payment){
      result.innerHTML = `
        <div class="el-pix-empty-state">
          <i data-lucide="qr-code"></i>
          <strong>PIX ainda nao gerado</strong>
          <span>Clique em Gerar PIX para criar a cobranca pelo Mercado Pago.</span>
        </div>
      `;
      footer.innerHTML = `
        <button type="button" class="el-pix-button secondary" data-pix-action="close">Fechar</button>
        <button type="button" class="el-pix-button primary" data-pix-action="generate">
          <i data-lucide="qr-code"></i>
          Gerar PIX
        </button>
      `;
      window.lucide?.createIcons?.();
      return;
    }

    const code = paymentCode(payment);
    result.innerHTML = `
      <div class="el-pix-qr" id="elPixQr"></div>
      <div class="el-pix-code">
        <span>PIX Copia e Cola</span>
        <textarea readonly>${escapeHtml(code || "Codigo PIX indisponivel")}</textarea>
      </div>
      <div class="el-pix-meta">
        <div><span>ID da cobranca</span><strong>${escapeHtml(payment.external_id || "-")}</strong></div>
        <div><span>Vencimento</span><strong>${escapeHtml(formatDate(payment.due_date || state.context?.vencimento))}</strong></div>
        <div><span>Status</span><strong><em class="el-pix-status ${badgeClass(payment.status)}">${badgeLabel(payment.status)}</em></strong></div>
      </div>
    `;
    footer.innerHTML = `
      <button type="button" class="el-pix-button secondary" data-pix-action="copy">
        <i data-lucide="copy"></i>
        Copiar codigo PIX
      </button>
      <button type="button" class="el-pix-button secondary" data-pix-action="download">
        <i data-lucide="download"></i>
        Baixar QR Code
      </button>
      <button type="button" class="el-pix-button secondary" data-pix-action="refresh">
        <i data-lucide="refresh-cw"></i>
        Atualizar status
      </button>
      <button type="button" class="el-pix-button secondary danger" data-pix-action="cancel">
        <i data-lucide="ban"></i>
        Cancelar cobranca
      </button>
      <button type="button" class="el-pix-button success" data-pix-action="whatsapp">
        <i data-lucide="message-circle"></i>
        Enviar WhatsApp
      </button>
    `;
    await renderQr(result.querySelector("#elPixQr"), payment);
    window.lucide?.createIcons?.();
  }

  function renderExistingChoice(payment){
    state.existingPayment = payment;
    const { main } = ensureModals();
    const existing = main.querySelector("#elPixExisting");
    existing.classList.remove("hidden");
    existing.innerHTML = `
      <div>
        <strong>Ja existe uma cobranca PIX ativa.</strong>
        <span>Voce pode abrir a cobranca existente ou cancelar e gerar uma nova.</span>
      </div>
      <div class="el-pix-existing-actions">
        <button type="button" class="el-pix-button secondary" data-pix-action="open-existing">Abrir cobranca existente</button>
        <button type="button" class="el-pix-button danger" data-pix-action="replace-existing">Cancelar e gerar nova</button>
      </div>
    `;
    renderPayment(null);
    main.querySelector("#elPixExisting")?.classList.remove("hidden");
  }

  function dispatchUpdate(){
    const detail = {
      pedido_id: state.context?.pedidoId || state.payment?.pedido_id || null,
      parcela_index: state.context?.parcelaIndex ?? state.payment?.parcela_index ?? null,
      payment: state.payment || null
    };
    window.dispatchEvent(new CustomEvent("easyloc:pix-atualizado", { detail }));
    window.dispatchEvent(new CustomEvent("easyloc:pedido-financeiro-atualizado", { detail }));
    try{
      localStorage.setItem("easyloc:pedido-financeiro-atualizado", String(Date.now()));
    }catch{}
  }

  async function findActive(){
    if(!state.context?.pedidoId) return null;
    const response = await invokePayment("find_active_pix", {
      payment: {
        pedido_id: state.context.pedidoId,
        parcela_index: state.context.parcelaIndex
      }
    });
    return response?.payment || null;
  }

  async function generatePix(forceNew = false){
    try{
      if(!state.context?.valor) throw new Error("Valor da cobranca PIX ausente.");
      setBusy(true, "Gerando PIX...");
      const payerEmail = await resolvePayerEmail(state.context);
      const description = state.context.descricao
        || `PIX EasyLoc - Pedido ${state.context.numeroPedido} - ${state.context.parcelaLabel}`;
      const response = await invokePayment("create_pix", {
        payment: {
          amount: state.context.valor,
          description,
          payer_email: payerEmail,
          payer_name: state.context.cliente,
          payer_phone: onlyDigits(state.context.contato),
          pedido_id: state.context.pedidoId,
          numero_pedido: state.context.numeroPedido,
          parcela_index: state.context.parcelaIndex,
          parcela_numero: state.context.parcelaNumero,
          parcela_label: state.context.parcelaLabel,
          due_date: state.context.vencimento,
          external_reference: `${state.context.pedidoId || state.context.numeroPedido || randomId()}-${state.context.parcelaIndex ?? "pedido"}`,
          force_new: forceNew
        }
      });

      if(response?.existing && response.payment){
        renderExistingChoice(response.payment);
        return;
      }

      await renderPayment(response.payment);
      dispatchUpdate();
      notify("Cobranca PIX gerada com sucesso.", "PIX", "sucesso");
    }catch(error){
      console.error("[EasyLocPix] gerar PIX:", error);
      notify(error.message || "Nao foi possivel gerar o PIX.", "PIX", "erro");
    }finally{
      setBusy(false);
    }
  }

  async function replaceExisting(){
    if(!state.existingPayment?.external_id) return;
    const ok = typeof window.confirmarGlobal === "function"
      ? await window.confirmarGlobal("Cancelar a cobranca PIX ativa e gerar uma nova?", "Gerar novo PIX", { confirmarTexto: "Gerar nova", tipo: "warning" })
      : confirm("Cancelar a cobranca PIX ativa e gerar uma nova?");
    if(!ok) return;
    state.payment = state.existingPayment;
    await cancelPayment(false);
    await generatePix(true);
  }

  async function copyPixCode(){
    const code = paymentCode();
    if(!code) return notify("Codigo PIX indisponivel.", "PIX", "aviso");
    try{
      await navigator.clipboard.writeText(code);
      notify("Codigo PIX copiado.", "PIX", "sucesso");
    }catch(error){
      console.error("[EasyLocPix] copiar:", error);
      notify("Nao foi possivel copiar o codigo PIX.", "PIX", "erro");
    }
  }

  function downloadQrCode(){
    const container = document.getElementById("elPixQr");
    const img = container?.querySelector("img");
    const canvas = container?.querySelector("canvas");
    const dataUrl = img?.src || canvas?.toDataURL?.("image/png") || "";
    if(!dataUrl) return notify("QR Code indisponivel para baixar.", "PIX", "aviso");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `PIX-${state.context?.numeroPedido || state.payment?.external_id || "EASYLOC"}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function refreshStatus(){
    if(!state.payment?.external_id) return notify("Cobranca PIX nao encontrada.", "PIX", "aviso");
    try{
      setBusy(true, "Atualizando status...");
      const response = await invokePayment("consultar_pagamento", {
        external_id: state.payment.external_id
      });
      await renderPayment(response.payment || state.payment);
      dispatchUpdate();
      notify("Status atualizado.", "PIX", "sucesso");
    }catch(error){
      console.error("[EasyLocPix] atualizar status:", error);
      notify(error.message || "Nao foi possivel atualizar o status.", "PIX", "erro");
    }finally{
      setBusy(false);
    }
  }

  async function cancelPayment(showAlert = true){
    if(!state.payment?.external_id) return notify("Cobranca PIX nao encontrada.", "PIX", "aviso");
    try{
      setBusy(true, "Cancelando PIX...");
      const response = await invokePayment("cancelar_pagamento", {
        external_id: state.payment.external_id
      });
      await renderPayment(response.payment || state.payment);
      dispatchUpdate();
      if(showAlert) notify("Cobranca PIX cancelada.", "PIX", "sucesso");
    }catch(error){
      console.error("[EasyLocPix] cancelar:", error);
      notify(error.message || "Nao foi possivel cancelar o PIX.", "PIX", "erro");
    }finally{
      setBusy(false);
    }
  }

  function defaultWhatsappMessage(){
    const ctx = state.context || {};
    return [
      `Ola, ${ctx.cliente}!`,
      "",
      `Segue o PIX referente ao pedido ${ctx.numeroPedido}.`,
      "",
      "Valor:",
      formatCurrency(ctx.valor),
      "",
      "Vencimento:",
      formatDate(ctx.vencimento),
      "",
      "PIX Copia e Cola:",
      "",
      paymentCode(),
      "",
      "Ou utilize o QR Code enviado.",
      "",
      "Apos o pagamento, a confirmacao ocorrera automaticamente.",
      "",
      "Obrigado!"
    ].join("\n");
  }

  function openWhatsapp(){
    if(!state.payment?.external_id) return notify("Gere o PIX antes de enviar.", "PIX", "aviso");
    if(!onlyDigits(state.context?.contato)) return notify("Cliente sem telefone cadastrado.", "WhatsApp", "aviso");
    const { whatsapp } = ensureModals();
    whatsapp.querySelector("#elPixWhatsappText").value = defaultWhatsappMessage();
    whatsapp.classList.add("is-open");
  }

  function closeWhatsapp(){
    document.getElementById("easylocPixWhatsappModal")?.classList.remove("is-open");
  }

  async function sendWhatsapp(){
    const phone = onlyDigits(state.context?.contato);
    const message = document.getElementById("elPixWhatsappText")?.value?.trim() || "";
    if(!phone) return notify("Cliente sem telefone cadastrado.", "WhatsApp", "aviso");
    if(!message) return notify("Digite a mensagem antes de enviar.", "WhatsApp", "aviso");
    if(!window.EasyLocWhatsApp?.send) return notify("Integracao WhatsApp indisponivel.", "WhatsApp", "erro");

    let messageSent = false;
    let qrSent = false;
    try{
      setBusy(true, "Enviando WhatsApp...");
      await window.EasyLocWhatsApp.send({
        phone,
        type: "texto",
        text: message,
        origin: "financeiro_pix",
        confirm: false
      });
      messageSent = true;

      const image = qrImageSrc();
      if(image){
        try{
          await window.EasyLocWhatsApp.send({
            phone,
            type: "imagem",
            fileUrl: image,
            caption: `QR Code PIX - Pedido ${state.context?.numeroPedido || ""}`.trim(),
            origin: "financeiro_pix_qrcode",
            confirm: false
          });
          qrSent = true;
        }catch(error){
          console.warn("[EasyLocPix] QR por WhatsApp nao enviado:", error);
        }
      }

      await invokePayment("register_whatsapp_send", {
        payment_id: state.payment?.id,
        external_id: state.payment?.external_id,
        payment: {
          phone,
          message_sent: messageSent,
          qr_sent: qrSent
        }
      });

      closeWhatsapp();
      dispatchUpdate();
      notify(qrSent ? "PIX enviado pelo WhatsApp." : "Mensagem PIX enviada. O QR Code nao foi aceito pela API.", "WhatsApp", qrSent ? "sucesso" : "aviso");
    }catch(error){
      console.error("[EasyLocPix] enviar WhatsApp:", error);
      notify(error.message || "Nao foi possivel enviar o WhatsApp.", "WhatsApp", "erro");
    }finally{
      setBusy(false);
    }
  }

  async function open(rawContext = {}){
    state.context = normalizeContext(rawContext);
    state.payment = null;
    state.existingPayment = null;
    const { main } = ensureModals();
    main.classList.add("is-open");
    renderSummary();
    await renderPayment(null);

    try{
      setBusy(true, "Buscando cobrancas...");
      const active = await findActive();
      if(active){
        renderExistingChoice(active);
      }
    }catch(error){
      console.warn("[EasyLocPix] busca de PIX ativo ignorada:", error);
    }finally{
      setBusy(false);
    }
  }

  function close(){
    document.getElementById("easylocPixModal")?.classList.remove("is-open");
    closeWhatsapp();
  }

  window.EasyLocPix = {
    open,
    close,
    refreshStatus
  };
})();
