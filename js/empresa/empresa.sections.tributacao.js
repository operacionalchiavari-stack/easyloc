(function(){
  function render(container, state) {
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">

        <div>
          <label>Simples Nacional</label>
          <select id="simplesInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
            <option value="Sim">Sim</option>
            <option value="Não">Não</option>
          </select>
        </div>

        <div>
          <label>Tipo de Tributação</label>
          <input id="tipoTributacaoInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
        </div>

        <div>
          <label>Natureza de Tributação</label>
          <input id="naturezaInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
        </div>

        <div>
          <label>Regime de Tributação</label>
          <input id="regimeInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
        </div>

        <div>
          <label>Alíquota ISS</label>
          <input id="aliquotaIssInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
        </div>

        <div>
          <label>Alíquota IR</label>
          <input id="aliquotaIrInput" style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;">
        </div>

      </div>
    `;
  }

  function bind(container, state, api) {
    const e = state.empresa || {};
    container.querySelector("#simplesInput").value = e.simples_nacional || "Sim";
    container.querySelector("#tipoTributacaoInput").value = e.tipo_tributacao || "";
    container.querySelector("#naturezaInput").value = e.natureza || "";
    container.querySelector("#regimeInput").value = e.regime || "";
    container.querySelector("#aliquotaIssInput").value = e.aliquota_iss || "";
    container.querySelector("#aliquotaIrInput").value = e.aliquota_ir || "";
    return () => {};
  }

  window.empresa = window.empresa || {};
  window.empresa.sections = window.empresa.sections || {};
  window.empresa.sections.tributacao = { render, bind };
})();