(function(){
  const state = {
    supabase: null,
    empresaId: null,
    gateways: [],
    selectedId: "mercado_pago",
    channel: null,
  };

  const els = {};
  const FALLBACK_GATEWAYS = [
    {
      gateway: "mercado_pago",
      name: "Mercado Pago",
      logo: "MP",
      available: true,
      comingSoon: false,
      description: "PIX, boleto, cartao e checkout com confirmacao automatica.",
      capabilities: ["PIX", "Boleto", "Cartao", "Checkout", "Assinaturas"],
      fields: [
        { key: "access_token", label: "Access Token", type: "password", required: true, placeholder: "APP_USR-..." },
        { key: "public_key", label: "Public Key", type: "password", placeholder: "APP_USR-..." },
        { key: "webhook_secret", label: "Webhook Secret", type: "password", placeholder: "Chave de assinatura do webhook" },
      ],
      ambiente: "sandbox",
      status: "desconectado",
      credential_preview: {},
      provider_account: {},
    },
    { gateway: "asaas", name: "Asaas", logo: "AS", available: false, comingSoon: true, description: "Arquitetura pronta para API Key, PIX, boleto e assinatura.", capabilities: ["PIX", "Boleto", "Cartao", "Assinaturas"], status: "em_breve" },
    { gateway: "itau", name: "Itau", logo: "IT", available: false, comingSoon: true, description: "Arquitetura pronta para certificados, PIX e boleto.", capabilities: ["PIX", "Boleto"], status: "em_breve" },
    { gateway: "nubank", name: "Nubank", logo: "NU", available: false, comingSoon: true, description: "Arquitetura pronta para cobrancas e reconciliacao.", capabilities: ["PIX", "Checkout"], status: "em_breve" },
    { gateway: "banco_inter", name: "Banco Inter", logo: "BI", available: false, comingSoon: true, description: "Arquitetura pronta para OAuth, certificados, PIX e boleto.", capabilities: ["PIX", "Boleto"], status: "em_breve" },
    { gateway: "pagseguro", name: "PagSeguro", logo: "PS", available: false, comingSoon: true, description: "Arquitetura pronta para checkout, cartao e notificacoes.", capabilities: ["PIX", "Boleto", "Cartao", "Checkout"], status: "em_breve" },
    { gateway: "pagarme", name: "Pagar.me", logo: "PM", available: false, comingSoon: true, description: "Arquitetura pronta para recebedores, PIX, boleto e cartao.", capabilities: ["PIX", "Boleto", "Cartao", "Assinaturas"], status: "em_breve" },
    { gateway: "stripe", name: "Stripe", logo: "ST", available: false, comingSoon: true, description: "Arquitetura pronta para checkout, cartao e assinaturas.", capabilities: ["Cartao", "Checkout", "Assinaturas"], status: "em_breve" },
  ];

  function $(id){ return document.getElementById(id); }

  function cacheEls(){
    ["pgBtnRefresh", "pgGatewayList", "pgConfigPanel"].forEach((id) => {
      els[id] = $(id);
    });
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function notify(message, type = "info", title = "Gateways de Pagamento"){
    if(typeof window.alerta === "function") return window.alerta(message, title, type);
    alert(message);
  }

  async function confirmAction(message, title = "Confirmar"){
    if(typeof window.confirmarGlobal === "function"){
      return await window.confirmarGlobal(message, title, { confirmarTexto: "Confirmar", tipo: "warning" });
    }
    return confirm(message);
  }

  function setLoading(active){
    document.querySelector(".payment-gateways-page")?.classList.toggle("is-loading", Boolean(active));
  }

  function refreshIcons(){
    if(window.lucide?.createIcons) window.lucide.createIcons();
  }

  function cloneFallbackGateways(){
    return FALLBACK_GATEWAYS.map((gateway) => ({
      ...gateway,
      capabilities: [...(gateway.capabilities || [])],
      fields: (gateway.fields || []).map((field) => ({ ...field })),
      credential_preview: { ...(gateway.credential_preview || {}) },
      provider_account: { ...(gateway.provider_account || {}) },
    }));
  }

  function finishModuleLoading(){
    window.finalizarCarregamentoModulo?.();
  }

  function withTimeout(promise, ms, message){
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function formatDateTime(value){
    if(!value) return "-";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("pt-BR");
  }

  function statusText(status){
    const labels = {
      conectado: "Conectado",
      desconectado: "Desconectado",
      erro: "Erro",
      em_teste: "Testando",
      em_breve: "Em breve",
    };
    return labels[status] || "Desconectado";
  }

  function capabilityText(value){
    const labels = {
      PIX: "PIX",
      Boleto: "Boleto",
      Cartao: "Cartão",
      Checkout: "Checkout",
      Assinaturas: "Assinaturas",
    };
    return labels[value] || value;
  }

  async function resolveEmpresa(session){
    state.empresaId = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id") || state.empresaId;
    if(!session?.user?.id) return;

    const { data, error } = await withTimeout(
      state.supabase
        .from("usuarios_empresas")
        .select("empresa_id")
        .eq("user_id", session.user.id),
      10000,
      "Tempo esgotado ao validar a empresa do usuario."
    );

    if(error) throw new Error(`Não foi possível validar a empresa do usuário: ${error.message}`);
    const empresas = (data || []).map((item) => String(item.empresa_id));
    if(!empresas.length) throw new Error("Usuário sem empresa vinculada.");

    if(!state.empresaId || !empresas.includes(String(state.empresaId))){
      state.empresaId = empresas[0];
      sessionStorage.setItem("empresa_id", state.empresaId);
      window.__CONTEXT = { ...(window.__CONTEXT || {}), empresa_id: state.empresaId };
    }
  }

  async function invoke(action, payload = {}){
    if(!state.supabase) throw new Error("Supabase não inicializado.");

    const { data: sessionData, error: sessionError } = await withTimeout(
      state.supabase.auth.getSession(),
      10000,
      "Tempo esgotado ao validar a sessao."
    );
    const session = sessionData?.session;
    if(sessionError || !session?.access_token){
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    await resolveEmpresa(session);
    if(!state.empresaId) throw new Error("Empresa não encontrada no contexto.");

    const { data, error } = await withTimeout(
      state.supabase.functions.invoke("payment-gateways", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { action, empresa_id: state.empresaId, ...payload },
      }),
      15000,
      "Tempo esgotado ao carregar os gateways de pagamento."
    );

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

  function selectedGateway(){
    return state.gateways.find((gateway) => gateway.gateway === state.selectedId)
      || state.gateways.find((gateway) => gateway.gateway === "mercado_pago")
      || state.gateways[0]
      || null;
  }

  function renderGatewayList(){
    if(!els.pgGatewayList) return;
    if(!state.gateways.length){
      els.pgGatewayList.innerHTML = `<div class="pg-empty">Nenhum gateway encontrado.</div>`;
      return;
    }

    els.pgGatewayList.innerHTML = state.gateways.map((gateway) => {
      const selected = gateway.gateway === state.selectedId ? " is-selected" : "";
      const capabilities = (gateway.capabilities || [])
        .slice(0, 5)
        .map((capability) => `<span class="pg-badge capability">${escapeHtml(capabilityText(capability))}</span>`)
        .join("");

      return `
        <button type="button" class="pg-gateway-card${selected}" data-pg-gateway="${escapeHtml(gateway.gateway)}">
          <span class="pg-logo">${escapeHtml(gateway.logo || gateway.name?.slice(0, 2) || "PG")}</span>
          <span class="pg-gateway-main">
            <span class="pg-gateway-title">
              <strong>${escapeHtml(gateway.name)}</strong>
              <span class="pg-badge status-${escapeHtml(gateway.status)}">${escapeHtml(statusText(gateway.status))}</span>
            </span>
            <p>${escapeHtml(gateway.description || "")}</p>
            <span class="pg-badges">${capabilities}</span>
          </span>
        </button>
      `;
    }).join("");
  }

  function renderComingSoon(gateway){
    els.pgConfigPanel.innerHTML = `
      <div class="pg-config-head">
        <span class="pg-config-logo">${escapeHtml(gateway.logo || "PG")}</span>
        <div>
          <h2>${escapeHtml(gateway.name)}</h2>
          <p>${escapeHtml(gateway.description || "Gateway preparado para implementação futura.")}</p>
        </div>
        <span class="pg-badge status-em_breve">Em breve</span>
      </div>
      <div class="pg-coming-soon">
        <div>
          <i data-lucide="construction"></i>
          <h3>Integração preparada</h3>
          <p>A estrutura de provider já está pronta. Quando este gateway for ativado, ele usará a mesma interface de conexão, PIX, consulta, cancelamento e webhook.</p>
        </div>
      </div>
    `;
  }

  function fieldMarkup(gateway, field){
    const preview = gateway.credential_preview?.[field.key] || "";
    const note = preview
      ? `Salvo no servidor: ${preview}`
      : field.required
        ? "Obrigatório para salvar este gateway."
        : "Opcional. Preencha apenas se este recurso estiver configurado.";
    const placeholder = preview ? "Preencha apenas para substituir" : (field.placeholder || field.label);

    return `
      <div class="pg-field">
        <label for="pgField_${escapeHtml(field.key)}">${escapeHtml(field.label)}</label>
        <div class="pg-input-wrap">
          <input
            id="pgField_${escapeHtml(field.key)}"
            data-pg-field="${escapeHtml(field.key)}"
            type="${field.type === "password" ? "password" : "text"}"
            autocomplete="off"
            spellcheck="false"
            placeholder="${escapeHtml(placeholder)}"
          >
          <button type="button" class="pg-eye-btn" data-pg-toggle-secret="${escapeHtml(field.key)}" aria-label="Mostrar ou ocultar ${escapeHtml(field.label)}">
            <i data-lucide="eye"></i>
          </button>
        </div>
        <small>${escapeHtml(note)}</small>
      </div>
    `;
  }

  function testResultMarkup(gateway){
    if(gateway.status === "conectado" && gateway.ultimo_teste_at){
      return `
        <div class="pg-test-result">
          <div>
            <strong>Conectado com sucesso</strong>
            <small>Data/Hora: ${escapeHtml(formatDateTime(gateway.ultimo_teste_at))} · Tempo de resposta: ${escapeHtml(gateway.ultimo_teste_ms || "-")} ms</small>
          </div>
          <span class="pg-badge status-conectado">Ativo</span>
        </div>
      `;
    }

    if(gateway.status === "erro" && gateway.ultimo_erro){
      return `
        <div class="pg-test-result">
          <div>
            <strong>Falha no último teste</strong>
            <small>${escapeHtml(gateway.ultimo_erro)}</small>
          </div>
          <span class="pg-badge status-erro">Erro</span>
        </div>
      `;
    }

    return `
      <div class="pg-test-result">
        <div>
          <strong>Teste de conexão pendente</strong>
          <small>Salve as credenciais e execute o teste para validar a API.</small>
        </div>
        <span class="pg-badge status-desconectado">Pendente</span>
      </div>
    `;
  }

  function webhookMarkup(gateway){
    if(gateway.gateway !== "mercado_pago") return "";
    if(!gateway.webhook_url){
      return `
        <div class="pg-readonly">
          <label>Webhook</label>
          <small>Configure PAYMENT_GATEWAY_WEBHOOK_URL nas secrets do Supabase para exibir a URL final de webhook.</small>
        </div>
      `;
    }

    return `
      <div class="pg-readonly">
        <label>Webhook URL</label>
        <div class="pg-readonly-box">
          <code>${escapeHtml(gateway.webhook_url)}</code>
          <button type="button" class="pg-copy-btn" data-pg-copy-webhook aria-label="Copiar Webhook URL">
            <i data-lucide="copy"></i>
          </button>
        </div>
        <small>Use esta URL no painel do Mercado Pago e informe o Webhook Secret no campo acima.</small>
      </div>
    `;
  }

  function renderConfigPanel(){
    if(!els.pgConfigPanel) return;
    const gateway = selectedGateway();
    if(!gateway){
      els.pgConfigPanel.innerHTML = `<div class="pg-empty pg-empty-large">Selecione um gateway para configurar.</div>`;
      return;
    }

    if(!gateway.available){
      renderComingSoon(gateway);
      refreshIcons();
      return;
    }

    const fields = (gateway.fields || []).map((field) => fieldMarkup(gateway, field)).join("");
    const account = gateway.provider_account?.id
      ? `<span class="pg-badge capability">Conta: ${escapeHtml(gateway.provider_account.nickname || gateway.provider_account.id)}</span>`
      : "";

    els.pgConfigPanel.innerHTML = `
      <div class="pg-config-head">
        <span class="pg-config-logo">${escapeHtml(gateway.logo || "PG")}</span>
        <div>
          <h2>${escapeHtml(gateway.name)}</h2>
          <p>${escapeHtml(gateway.description || "")}</p>
          <div class="pg-badges" style="margin-top:10px">
            <span class="pg-badge status-${escapeHtml(gateway.status)}">${escapeHtml(statusText(gateway.status))}</span>
            ${account}
          </div>
        </div>
        <div class="pg-config-actions">
          <span class="pg-badge capability">${gateway.ambiente === "producao" ? "Produção" : "Sandbox"}</span>
        </div>
      </div>

      <div class="pg-form">
        <section class="pg-section">
          <span class="pg-section-label">Ambiente</span>
          <div class="pg-env-toggle" data-pg-env-group>
            <button type="button" data-pg-env="sandbox" class="${gateway.ambiente === "sandbox" ? "is-active" : ""}">Sandbox</button>
            <button type="button" data-pg-env="producao" class="${gateway.ambiente === "producao" ? "is-active" : ""}">Produção</button>
          </div>
        </section>

        <section class="pg-section">
          <span class="pg-section-label">Credenciais protegidas</span>
          <div class="pg-field-grid">${fields}</div>
        </section>

        ${webhookMarkup(gateway)}
        ${testResultMarkup(gateway)}

        <div class="pg-footer-actions">
          <button type="button" class="btn secondary" data-pg-action="disconnect">
            <i data-lucide="unlink"></i>
            Desconectar
          </button>
          <button type="button" class="btn secondary" data-pg-action="test">
            <i data-lucide="activity"></i>
            Testar conexão
          </button>
          <button type="button" class="btn primary" data-pg-action="save">
            <i data-lucide="save"></i>
            Salvar
          </button>
        </div>
      </div>
    `;

    refreshIcons();
  }

  function render(){
    renderGatewayList();
    renderConfigPanel();
    refreshIcons();
  }

  async function loadGateways(selectId){
    setLoading(true);
    try{
      const response = await invoke("list");
      state.gateways = response.gateways || [];
      if(selectId) state.selectedId = selectId;
      if(!selectedGateway() && state.gateways[0]) state.selectedId = state.gateways[0].gateway;
      render();
    }catch(error){
      notify(error.message || "Erro ao carregar gateways.", "error");
      if(!state.gateways.length){
        state.gateways = cloneFallbackGateways();
        render();
      }
      if(els.pgGatewayList){
        els.pgGatewayList.insertAdjacentHTML("afterbegin", `<div class="pg-empty">Nao foi possivel sincronizar agora. A tela continua disponivel para tentar novamente.</div>`);
      }
    }finally{
      setLoading(false);
      finishModuleLoading();
    }
  }

  function selectedEnvironment(){
    return els.pgConfigPanel?.querySelector("[data-pg-env].is-active")?.dataset.pgEnv || selectedGateway()?.ambiente || "sandbox";
  }

  function collectCredentials(){
    const credentials = {};
    els.pgConfigPanel?.querySelectorAll("[data-pg-field]").forEach((input) => {
      const key = input.dataset.pgField;
      const value = input.value.trim();
      if(key && value) credentials[key] = value;
    });
    return credentials;
  }

  async function saveGateway(){
    const gateway = selectedGateway();
    if(!gateway) return;
    setLoading(true);
    try{
      await invoke("save", {
        gateway: gateway.gateway,
        ambiente: selectedEnvironment(),
        credentials: collectCredentials(),
      });
      notify("Credenciais salvas com segurança.", "success");
      await loadGateways(gateway.gateway);
    }catch(error){
      notify(error.message || "Erro ao salvar gateway.", "error");
    }finally{
      setLoading(false);
    }
  }

  async function testGateway(){
    const gateway = selectedGateway();
    if(!gateway) return;
    setLoading(true);
    try{
      const response = await invoke("test", { gateway: gateway.gateway });
      const ms = response.test?.response_ms ? ` (${response.test.response_ms} ms)` : "";
      notify(`Conectado com sucesso${ms}.`, "success");
      await loadGateways(gateway.gateway);
    }catch(error){
      notify(error.message || "Falha ao testar conexão.", "error");
      await loadGateways(gateway.gateway);
    }finally{
      setLoading(false);
    }
  }

  async function disconnectGateway(){
    const gateway = selectedGateway();
    if(!gateway) return;
    const ok = await confirmAction(`Desconectar ${gateway.name}? As credenciais protegidas serão removidas.`, "Desconectar gateway");
    if(!ok) return;

    setLoading(true);
    try{
      await invoke("disconnect", { gateway: gateway.gateway });
      notify("Gateway desconectado.", "success");
      await loadGateways(gateway.gateway);
    }catch(error){
      notify(error.message || "Erro ao desconectar gateway.", "error");
    }finally{
      setLoading(false);
    }
  }

  function selectGateway(gatewayId){
    state.selectedId = gatewayId;
    render();
  }

  function toggleEnvironment(button){
    const group = button.closest("[data-pg-env-group]");
    group?.querySelectorAll("[data-pg-env]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
  }

  function toggleSecret(button){
    const key = button.dataset.pgToggleSecret;
    const input = key ? els.pgConfigPanel?.querySelector(`[data-pg-field="${CSS.escape(key)}"]`) : null;
    if(!input) return;
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.innerHTML = `<i data-lucide="${visible ? "eye" : "eye-off"}"></i>`;
    refreshIcons();
  }

  async function copyWebhook(){
    const gateway = selectedGateway();
    if(!gateway?.webhook_url) return;
    try{
      await navigator.clipboard.writeText(gateway.webhook_url);
      notify("Webhook URL copiada.", "success");
    }catch{
      notify("Não foi possível copiar a URL automaticamente.", "warning");
    }
  }

  function bindEvents(){
    els.pgBtnRefresh?.addEventListener("click", () => loadGateways(state.selectedId));

    els.pgGatewayList?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-pg-gateway]");
      if(card) selectGateway(card.dataset.pgGateway);
    });

    els.pgConfigPanel?.addEventListener("click", (event) => {
      const target = event.target;
      const envButton = target.closest("[data-pg-env]");
      if(envButton) return toggleEnvironment(envButton);

      const toggleButton = target.closest("[data-pg-toggle-secret]");
      if(toggleButton) return toggleSecret(toggleButton);

      const copyButton = target.closest("[data-pg-copy-webhook]");
      if(copyButton) return copyWebhook();

      const actionButton = target.closest("[data-pg-action]");
      if(!actionButton) return;

      const action = actionButton.dataset.pgAction;
      if(action === "save") return saveGateway();
      if(action === "test") return testGateway();
      if(action === "disconnect") return disconnectGateway();
    });
  }

  function subscribeRealtime(){
    if(!state.supabase?.channel || !state.empresaId) return;
    if(state.channel && state.supabase.removeChannel) state.supabase.removeChannel(state.channel);

    state.channel = state.supabase
      .channel(`payment-gateways:${state.empresaId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "payment_gateway_connections",
        filter: `empresa_id=eq.${state.empresaId}`,
      }, () => loadGateways(state.selectedId))
      .subscribe();
  }

  async function init(){
    cacheEls();
    state.supabase = window.supabaseClient;
    state.empresaId = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    bindEvents();
    state.gateways = cloneFallbackGateways();
    render();
    refreshIcons();
    finishModuleLoading();
    loadGateways(state.selectedId)
      .then(() => subscribeRealtime())
      .catch(() => {})
      .finally(() => finishModuleLoading());
  }

  function destroy(){
    if(state.channel && state.supabase?.removeChannel){
      state.supabase.removeChannel(state.channel);
    }
    delete window.__paymentGatewaysLoaded;
  }

  window.__moduleInit = function initPaymentGateways(){
    if(window.__paymentGatewaysLoaded) return;
    window.__paymentGatewaysLoaded = true;
    Promise.resolve(init()).catch((error) => {
      console.error("Erro ao iniciar Gateways de Pagamento:", error);
      if(!state.gateways.length){
        state.gateways = cloneFallbackGateways();
        render();
      }
      finishModuleLoading();
    });
  };

  window.__activeModuleDestroy = destroy;
})();
