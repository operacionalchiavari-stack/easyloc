(function(){
  const state = {
    supabase: null,
    empresaId: null,
    integration: null,
    history: [],
    historyPage: 1,
    historyPageSize: 10,
    qrTimer: null,
    channel: null,
  };

  const els = {};

  function $(id){ return document.getElementById(id); }

  function cacheEls(){
    [
      "zapiBtnSync",
      "zapiBtnQr",
      "zapiStatusLabel",
      "zapiStatusDot",
      "zapiNumero",
      "zapiUltimaSync",
      "zapiMensagensOk",
      "zapiMensagensFalha",
      "zapiUltimoEnvio",
      "zapiQrStatus",
      "zapiQrBox",
      "zapiQrUpdated",
      "zapiConnectionCard",
      "zapiConnectionEyebrow",
      "zapiBtnSaveCredentials",
      "zapiBtnReconnect",
      "zapiBtnDisconnect",
      "zapiTestPhone",
      "zapiTestType",
      "zapiTestMessage",
      "zapiTestFileUrl",
      "zapiFileUrlWrap",
      "zapiBtnSendTest",
      "zapiHistorySearch",
      "zapiHistoryStatus",
      "zapiHistoryPeriod",
      "zapiHistoryCount",
      "zapiHistoryBody",
      "zapiPaginationInfo",
      "zapiPaginationControls",
    ].forEach((id) => { els[id] = $(id); });
  }

  function notify(message, type = "info", title = "WhatsApp"){
    if(typeof window.alerta === "function") return window.alerta(message, title, type);
    alert(message);
  }

  async function confirmAction(message, title = "Confirmar envio"){
    if(typeof window.confirmarGlobal === "function"){
      return await window.confirmarGlobal(message, title, { confirmarTexto: "Confirmar", tipo: "warning" });
    }
    return confirm(message);
  }

  function setLoading(active){
    document.querySelector(".zapi-page")?.classList.toggle("zapi-loading", Boolean(active));
  }

  function formatDate(value, withTime = true){
    if(!value) return "-";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "-";
    return withTime
      ? date.toLocaleString("pt-BR")
      : date.toLocaleDateString("pt-BR");
  }

  function statusLabel(status){
    const labels = {
      nao_configurado: "Nao configurado",
      aguardando_qr: "Aguardando QR Code",
      conectado: "Conectado",
      desconectado: "Desconectado",
      erro: "Erro",
    };
    return labels[status] || "Nao configurado";
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function refreshIcons(){
    if(window.lucide?.createIcons) window.lucide.createIcons();
  }

  function statusBadge(status){
    const labels = {
      enviado: "Enviado",
      recebido: "Enviado",
      lido: "Enviado",
      falha: "Erro",
      pendente: "Processando",
    };
    const dots = {
      enviado: "â—",
      recebido: "â—",
      lido: "â—",
      falha: "â—",
      pendente: "â—",
    };
    const key = status || "pendente";
    return `<span class="zapi-badge ${escapeHtml(key)}">${dots[key] || "â—"} ${escapeHtml(labels[key] || key)}</span>`;
  }

  function typeBadge(type){
    const value = type || "texto";
    const labels = {
      texto: "Texto",
      imagem: "Imagem",
      pdf: "PDF",
      audio: "Audio",
      documento: "Documento",
    };
    return `<span class="zapi-badge tipo-${escapeHtml(value)}">${escapeHtml(labels[value] || value)}</span>`;
  }

  async function invoke(action, payload = {}){
    if(!state.supabase || !state.empresaId) throw new Error("Contexto da empresa indisponivel.");

    const { data: sessionData, error: sessionError } = await state.supabase.auth.getSession();
    const session = sessionData?.session;
    if(sessionError || !session?.access_token){
      throw new Error("Sessao expirada. Faca login novamente.");
    }

    const { data: vinculos, error: vinculoError } = await state.supabase
      .from("usuarios_empresas")
      .select("empresa_id")
      .eq("user_id", session.user.id);

    if(vinculoError){
      throw new Error(`Nao foi possivel validar a empresa do usuario: ${vinculoError.message}`);
    }

    const empresasPermitidas = (vinculos || []).map((item) => String(item.empresa_id));
    if(!empresasPermitidas.includes(String(state.empresaId))){
      const empresaValida = empresasPermitidas[0];
      if(!empresaValida){
        throw new Error("Usuario sem empresa vinculada para configurar a Z-API.");
      }
      state.empresaId = empresaValida;
      sessionStorage.setItem("empresa_id", empresaValida);
      window.__CONTEXT = { ...(window.__CONTEXT || {}), empresa_id: empresaValida };
    }

    const { data, error } = await state.supabase.functions.invoke("zapi-integration", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: { action, empresa_id: state.empresaId, ...payload },
    });

    if(error){
      const context = error.context;
      if(context?.json){
        const body = await context.json().catch(() => null);
        if(body?.erro || body?.details) throw new Error(body.details || body.erro);
      }
      throw error;
    }
    if(data?.erro) throw new Error(data.erro);
    return data;
  }

  function renderStatus(){
    const integration = state.integration || {};
    const status = integration.status || "nao_configurado";
    const connected = status === "conectado";

    if(els.zapiStatusLabel) els.zapiStatusLabel.textContent = statusLabel(status);
    if(els.zapiStatusDot){
      els.zapiStatusDot.className = `zapi-status-dot ${status}`;
    }
    if(els.zapiNumero){
      els.zapiNumero.textContent = integration.numero_conectado
        ? `Numero conectado: ${integration.numero_conectado}`
        : "Nenhum numero conectado";
    }
    if(els.zapiUltimaSync){
      els.zapiUltimaSync.textContent = `Ultima sincronizacao: ${formatDate(integration.ultima_sincronizacao)}`;
    }
    if(els.zapiMensagensOk) els.zapiMensagensOk.textContent = String(integration.mensagens_enviadas || 0);
    if(els.zapiMensagensFalha) els.zapiMensagensFalha.textContent = String(integration.mensagens_falhas || 0);
    if(els.zapiUltimoEnvio) els.zapiUltimoEnvio.textContent = formatDate(integration.ultimo_envio_at, false);
    if(els.zapiQrStatus){
      els.zapiQrStatus.textContent = integration.ultimo_erro
        ? `Erro: ${integration.ultimo_erro}`
        : status === "conectado"
          ? "Celular conectado"
          : "QR Code disponivel quando solicitado";
    }
    renderConnectionPanel(integration, connected);
    refreshIcons();
  }

  function renderConnectionPanel(integration, connected){
    els.zapiConnectionCard?.classList.toggle("is-connected", connected);

    if(els.zapiConnectionEyebrow){
      els.zapiConnectionEyebrow.textContent = connected ? "Conexao ativa" : "QR Code";
    }

    if(!els.zapiQrBox) return;

    if(!connected){
      if(!els.zapiQrBox.querySelector("img") && !els.zapiQrBox.querySelector(".zapi-qr-empty")){
        els.zapiQrBox.innerHTML = `<div class="zapi-qr-empty">Clique em Conectar para buscar o QR Code.</div>`;
      }
      if(els.zapiQrUpdated) els.zapiQrUpdated.style.display = "";
      return;
    }

    const connectedAt = integration.ultima_sincronizacao || integration.ultimo_qr_at || integration.updated_at || integration.created_at;
    els.zapiQrBox.innerHTML = `
      <div class="zapi-connected-panel">
        <div class="zapi-device-scene">
          <span class="zapi-wave"></span>
          <span class="zapi-wave"></span>
          <div class="zapi-phone-orbit">
            <i data-lucide="smartphone"></i>
            <span class="zapi-whatsapp-mini"><i data-lucide="message-circle"></i></span>
            <span class="zapi-connected-dot"><i data-lucide="check"></i></span>
          </div>
          <h2>Celular conectado</h2>
          <p>Seu WhatsApp esta conectado e pronto para enviar mensagens automaticamente pelo Acervo.</p>
          <span class="zapi-connected-since"><i data-lucide="wifi"></i>Conectado desde: ${escapeHtml(formatDate(connectedAt))}</span>
        </div>
      </div>
    `;
    if(els.zapiQrUpdated) els.zapiQrUpdated.style.display = "none";
  }

  function filteredHistory(){
    const search = (els.zapiHistorySearch?.value || "").replace(/\D/g, "");
    const status = els.zapiHistoryStatus?.value || "";
    const period = Number(els.zapiHistoryPeriod?.value || 0);
    const since = period ? Date.now() - period * 24 * 60 * 60 * 1000 : null;

    return state.history.filter((row) => {
      const number = String(row.numero || "").replace(/\D/g, "");
      const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
      return (!search || number.includes(search))
        && (!status || row.status === status)
        && (!since || createdAt >= since);
    });
  }

  function renderPagination(totalRows){
    const totalPages = Math.max(1, Math.ceil(totalRows / state.historyPageSize));
    state.historyPage = Math.min(Math.max(1, state.historyPage), totalPages);
    const start = totalRows ? (state.historyPage - 1) * state.historyPageSize + 1 : 0;
    const end = Math.min(totalRows, state.historyPage * state.historyPageSize);

    if(els.zapiPaginationInfo){
      els.zapiPaginationInfo.textContent = totalRows
        ? `Mostrando ${start}-${end} de ${totalRows} mensagens`
        : "Mostrando 0 de 0 mensagens";
    }

    if(!els.zapiPaginationControls) return;

    const pageButtons = [];
    const first = Math.max(1, state.historyPage - 2);
    const last = Math.min(totalPages, first + 4);
    for(let page = first; page <= last; page += 1){
      pageButtons.push(`<button type="button" class="zapi-page-btn ${page === state.historyPage ? "active" : ""}" data-page="${page}">${page}</button>`);
    }

    els.zapiPaginationControls.innerHTML = `
      <button type="button" class="zapi-page-btn" data-page="${state.historyPage - 1}" ${state.historyPage <= 1 ? "disabled" : ""}>Anterior</button>
      ${pageButtons.join("")}
      <button type="button" class="zapi-page-btn" data-page="${state.historyPage + 1}" ${state.historyPage >= totalPages ? "disabled" : ""}>Proxima</button>
    `;

    els.zapiPaginationControls.querySelectorAll("[data-page]").forEach((button) => {
      button.addEventListener("click", () => {
        const page = Number(button.dataset.page || 1);
        if(page < 1 || page > totalPages || page === state.historyPage) return;
        state.historyPage = page;
        renderHistory();
      });
    });
  }

  function renderHistory(){
    const rows = filteredHistory();
    renderPagination(rows.length);
    const start = (state.historyPage - 1) * state.historyPageSize;
    const pageRows = rows.slice(start, start + state.historyPageSize);

    if(els.zapiHistoryCount) els.zapiHistoryCount.textContent = `${rows.length} registro(s)`;
    if(!els.zapiHistoryBody) return;

    if(!pageRows.length){
      els.zapiHistoryBody.innerHTML = `<tr><td colspan="5">Nenhuma mensagem encontrada.</td></tr>`;
      return;
    }

    els.zapiHistoryBody.innerHTML = pageRows.map((row) => `
      <tr>
        <td>${escapeHtml(formatDate(row.created_at))}</td>
        <td>${escapeHtml(row.numero || "-")}</td>
        <td>${typeBadge(row.tipo)}</td>
        <td>${statusBadge(row.status)}</td>
        <td class="zapi-message-cell">${escapeHtml(row.mensagem || row.erro || "-")}</td>
      </tr>
    `).join("");
    refreshIcons();
  }

  async function loadStatus(){
    setLoading(true);
    try{
      const data = await invoke("get-status");
      state.integration = data.integration;
      state.history = data.history || [];
      state.historyPage = 1;
      renderStatus();
      renderHistory();
    }catch(error){
      notify(error.message || "Nao foi possivel carregar a integracao.", "erro");
    }finally{
      setLoading(false);
      window.finalizarCarregamentoModulo?.();
    }
  }

  async function syncStatus(){
    setLoading(true);
    try{
      const data = await invoke("sync-status");
      if(data.integration) state.integration = data.integration;
      renderStatus();
      await loadStatus();
    }catch(error){
      notify(error.message || "Nao foi possivel sincronizar a Z-API.", "erro");
    }finally{
      setLoading(false);
    }
  }

  function clearQrTimer(){
    if(state.qrTimer){
      clearInterval(state.qrTimer);
      state.qrTimer = null;
    }
  }

  async function fetchQr(){
    setLoading(true);
    try{
      const data = await invoke("get-qr");
      if(data.integration) state.integration = data.integration;
      if(data.connected){
        renderStatus();
        await loadStatus();
        return;
      }
      if(els.zapiQrBox){
        els.zapiQrBox.innerHTML = data.qr
          ? `<img src="${escapeHtml(data.qr)}" alt="QR Code WhatsApp">`
          : `<div class="zapi-qr-empty">QR Code indisponivel no momento.</div>`;
      }
      if(els.zapiQrUpdated) els.zapiQrUpdated.textContent = `Ultimo QR: ${formatDate(new Date().toISOString())}`;
      await loadStatus();
      clearQrTimer();
      state.qrTimer = setInterval(fetchQr, 45000);
    }catch(error){
      notify(error.message || "Nao foi possivel buscar o QR Code.", "erro");
    }finally{
      setLoading(false);
    }
  }

  async function connect(){
    setLoading(true);
    try{
      await invoke("save-credentials");
      await loadStatus();
      if(state.integration?.status === "conectado"){
        notify("WhatsApp ja esta conectado.", "sucesso");
        return;
      }
      await fetchQr();
    }catch(error){
      notify(
        error.message ||
        "Nao foi possivel criar a instancia automaticamente. Configure as credenciais manualmente e tente novamente.",
        "erro"
      );
    }finally{
      setLoading(false);
    }
  }

  async function saveCredentials(){
    const instance_id = els.zapiInstanceId?.value?.trim();
    const instance_token = els.zapiInstanceToken?.value?.trim();
    const client_token = els.zapiClientToken?.value?.trim();

    setLoading(true);
    try{
      await invoke("save-credentials", { instance_id, instance_token, client_token });
      ["zapiInstanceId", "zapiInstanceToken", "zapiClientToken"].forEach((key) => {
        if(els[key]) els[key].value = "";
      });
      notify("Integracao ativada. Agora busque o QR Code.", "sucesso");
      await loadStatus();
    }catch(error){
      notify(error.message || "Nao foi possivel salvar as credenciais.", "erro");
    }finally{
      setLoading(false);
    }
  }

  async function disconnect(){
    const ok = await confirmAction("Deseja desconectar o WhatsApp desta empresa?", "Desconectar WhatsApp");
    if(!ok) return;

    setLoading(true);
    try{
      await invoke("disconnect");
      clearQrTimer();
      if(els.zapiQrBox) els.zapiQrBox.innerHTML = `<div class="zapi-qr-empty">WhatsApp desconectado.</div>`;
      await loadStatus();
    }catch(error){
      notify(error.message || "Nao foi possivel desconectar.", "erro");
    }finally{
      setLoading(false);
    }
  }

  async function reconnect(){
    setLoading(true);
    try{
      const data = await invoke("reconnect");
      if(els.zapiQrBox){
        els.zapiQrBox.innerHTML = data.qr
          ? `<img src="${escapeHtml(data.qr)}" alt="QR Code WhatsApp">`
          : `<div class="zapi-qr-empty">Reconexao solicitada.</div>`;
      }
      await loadStatus();
    }catch(error){
      notify(error.message || "Nao foi possivel reconectar.", "erro");
    }finally{
      setLoading(false);
    }
  }

  function toggleFileUrl(){
    const type = els.zapiTestType?.value || "texto";
    if(els.zapiFileUrlWrap) els.zapiFileUrlWrap.style.display = type === "texto" ? "none" : "grid";
  }

  async function sendTest(){
    const phone = els.zapiTestPhone?.value?.trim();
    const type = els.zapiTestType?.value || "texto";
    const text = els.zapiTestMessage?.value?.trim();
    const fileUrl = els.zapiTestFileUrl?.value?.trim();

    const ok = await confirmAction(`Enviar mensagem de teste para ${phone || "numero nao informado"}?`);
    if(!ok) return;

    setLoading(true);
    const originalHtml = els.zapiBtnSendTest?.innerHTML;
    els.zapiBtnSendTest?.classList.add("is-sending");
    if(els.zapiBtnSendTest) els.zapiBtnSendTest.innerHTML = `<i data-lucide="loader-circle"></i><span>Enviando</span>`;
    refreshIcons();
    try{
      await invoke("send-message", {
        message: {
          phone,
          type,
          text,
          caption: text,
          fileUrl,
          origem: "teste_configuracoes",
        },
      });
      notify("Mensagem enviada para a fila da Z-API.", "sucesso");
      await loadStatus();
    }catch(error){
      notify(error.message || "Falha ao enviar mensagem.", "erro");
      await loadStatus();
    }finally{
      els.zapiBtnSendTest?.classList.remove("is-sending");
      if(els.zapiBtnSendTest && originalHtml) els.zapiBtnSendTest.innerHTML = originalHtml;
      refreshIcons();
      setLoading(false);
    }
  }

  function resetHistoryPage(){
    state.historyPage = 1;
    renderHistory();
  }

  function bindEvents(){
    els.zapiBtnSync?.addEventListener("click", syncStatus);
    els.zapiBtnQr?.addEventListener("click", connect);
    els.zapiBtnSaveCredentials?.addEventListener("click", saveCredentials);
    els.zapiBtnDisconnect?.addEventListener("click", disconnect);
    els.zapiBtnReconnect?.addEventListener("click", reconnect);
    els.zapiBtnSendTest?.addEventListener("click", sendTest);
    els.zapiTestType?.addEventListener("change", toggleFileUrl);
    els.zapiHistorySearch?.addEventListener("input", resetHistoryPage);
    els.zapiHistoryStatus?.addEventListener("change", resetHistoryPage);
    els.zapiHistoryPeriod?.addEventListener("change", resetHistoryPage);
  }

  function subscribeRealtime(){
    if(!state.supabase?.channel || !state.empresaId) return;

    state.channel = state.supabase
      .channel(`zapi-integracao-${state.empresaId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "zapi_integracoes",
        filter: `empresa_id=eq.${state.empresaId}`,
      }, () => loadStatus())
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "zapi_mensagens",
        filter: `empresa_id=eq.${state.empresaId}`,
      }, () => loadStatus())
      .subscribe();
  }

  async function init(){
    cacheEls();
    state.supabase = window.supabaseClient;
    state.empresaId = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    bindEvents();
    toggleFileUrl();
    refreshIcons();
    subscribeRealtime();
    await loadStatus();
  }

  function destroy(){
    clearQrTimer();
    if(state.channel && state.supabase?.removeChannel){
      state.supabase.removeChannel(state.channel);
    }
    delete window.__zapiWhatsAppLoaded;
  }

  window.__moduleInit = async function initZapiWhatsApp(){
    if(window.__zapiWhatsAppLoaded) return;
    window.__zapiWhatsAppLoaded = true;
    await init();
  };

  window.__activeModuleDestroy = destroy;
})();
