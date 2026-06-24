(function(){
  const DEFAULT_REGRAS = {
    carregamento_dias_antes_entrega: 1,
    triagem_dias_antes_carregamento: 2,
    montagem_dias_apos_entrega: 0,
    desmontagem_dias_apos_coleta: 0,
    triagem_retorno_dias_apos_coleta: 1,
    separacao_dias_antes_evento: 2,
    hora_padrao: "08:00"
  };

  async function render(container) {
    container.innerHTML = "";

    const regrasWrapper = document.createElement("div");
    regrasWrapper.id = "logistica-regras-section";
    container.appendChild(regrasWrapper);

    const freteWrapper = document.createElement("div");
    freteWrapper.id = "frete-section";
    container.appendChild(freteWrapper);

    const montagemWrapper = document.createElement("div");
    montagemWrapper.id = "montagem-section";
    container.appendChild(montagemWrapper);
  }

  function inputRegra(label, id, hint) {
    return `
      <label style="display:grid;gap:7px;font-size:12px;color:#64748b;font-weight:600;">
        ${label}
        <input id="${id}" type="number" min="0" step="1" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;color:#0f172a;font-size:14px;">
        <span style="font-size:11px;font-weight:500;color:#94a3b8;">${hint}</span>
      </label>
    `;
  }

  function renderRegras(container) {
    container.innerHTML = `
      <div style="margin-bottom:34px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px;">
          <div>
            <div style="font-weight:600;font-size:15px;color:#0f2a44;margin-bottom:4px;">
              Regras do cronograma
            </div>
            <div style="font-size:13px;color:#64748b;line-height:1.35;">
              Aplicadas automaticamente apenas nos pedidos novos. Pedidos que ja estao no cronograma permanecem intactos.
            </div>
          </div>
          <span id="logisticaRegrasStatus" style="font-size:12px;color:#64748b;white-space:nowrap;">Pronto</span>
        </div>

        <div style="
          border:1px solid #e5e7eb;
          background:#f8fafc;
          border-radius:16px;
          padding:16px;
          display:grid;
          grid-template-columns:repeat(6,minmax(120px,1fr));
          gap:14px;
        ">
          ${inputRegra("Carregamento", "logRegCarregamento", "dias antes da entrega")}
          ${inputRegra("Triagem separacao", "logRegTriagem", "dias antes do carregamento")}
          ${inputRegra("Montagem", "logRegMontagem", "dias apos entrega")}
          ${inputRegra("Desmontagem", "logRegDesmontagem", "dias apos coleta")}
          ${inputRegra("Triagem retorno", "logRegTriagemRetorno", "dias apos coleta")}
          ${inputRegra("Liberar separacao", "logRegLiberarSeparacao", "dias antes do evento")}
          <label style="display:grid;gap:7px;font-size:12px;color:#64748b;font-weight:600;">
            Hora padrao
            <input id="logRegHoraPadrao" type="time" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;color:#0f172a;font-size:14px;">
          </label>
        </div>
      </div>
    `;
  }

  async function bindRegras(container, state, api) {
    renderRegras(container);

    const empresaId = state.empresaId || window.__CONTEXT?.empresa_id;
    const status = container.querySelector("#logisticaRegrasStatus");
    const ids = {
      carregamento_dias_antes_entrega: "logRegCarregamento",
      triagem_dias_antes_carregamento: "logRegTriagem",
      montagem_dias_apos_entrega: "logRegMontagem",
      desmontagem_dias_apos_coleta: "logRegDesmontagem",
      triagem_retorno_dias_apos_coleta: "logRegTriagemRetorno",
      separacao_dias_antes_evento: "logRegLiberarSeparacao",
      hora_padrao: "logRegHoraPadrao"
    };

    const setStatus = (text, color = "#64748b") => {
      if (!status) return;
      status.textContent = text;
      status.style.color = color;
    };

    const preencher = (regras) => {
      Object.entries(ids).forEach(([key, id]) => {
        const input = container.querySelector(`#${id}`);
        if (!input) return;
        const value = regras?.[key] ?? DEFAULT_REGRAS[key];
        input.value = key === "hora_padrao" ? String(value).slice(0, 5) : Number(value || 0);
      });
    };

    try {
      const regras = await api.getLogisticaRegras(empresaId);
      preencher(regras || DEFAULT_REGRAS);
    } catch (error) {
      console.warn("Nao foi possivel carregar regras logisticas:", error);
      preencher(DEFAULT_REGRAS);
      setStatus("Usando padrao", "#f97316");
    }

    let timer = null;
    const salvar = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const payload = {
          empresa_id: empresaId,
          updated_at: new Date().toISOString()
        };

        Object.entries(ids).forEach(([key, id]) => {
          const input = container.querySelector(`#${id}`);
          if (!input) return;
          payload[key] = key === "hora_padrao"
            ? (input.value || DEFAULT_REGRAS.hora_padrao)
            : Number(input.value || 0);
        });

        setStatus("Salvando...");
        const { error } = await api.saveLogisticaRegras(payload);
        if (error) {
          console.error("Erro ao salvar regras logisticas:", error);
          setStatus("Erro ao salvar", "#dc2626");
          return;
        }
        setStatus("Salvo", "#16a34a");
      }, 450);
    };

    const inputs = Array.from(container.querySelectorAll("input"));
    inputs.forEach((input) => input.addEventListener("input", salvar));

    return () => {
      clearTimeout(timer);
      inputs.forEach((input) => input.removeEventListener("input", salvar));
    };
  }

  async function bind(container, state, api) {
    const regrasWrapper = container.querySelector("#logistica-regras-section");
    const cleanupRegras = await bindRegras(regrasWrapper, state, api);

    const freteWrapper = container.querySelector("#frete-section");
    window.empresa.logistica.frete.render(freteWrapper, state);
    const cleanupFrete = await window.empresa.logistica.frete.bind(freteWrapper, state, api);

    const montagemWrapper = container.querySelector("#montagem-section");
    window.empresa.logistica.montagem.render(montagemWrapper, state);
    const cleanupMontagem = await window.empresa.logistica.montagem.bind(montagemWrapper, state, api);

    return () => {
      cleanupRegras && cleanupRegras();
      cleanupFrete && cleanupFrete();
      cleanupMontagem && cleanupMontagem();
    };
  }

  window.empresa = window.empresa || {};
  window.empresa.sections = window.empresa.sections || {};
  window.empresa.sections.logistica = { render, bind };
})();
