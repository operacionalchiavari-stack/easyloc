(function(){

  function render(container, state){

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:32px;max-width:760px;">

        <h3 style="margin:0;color:#2E1F1F;">
          LogÃ­stica
        </h3>

        <div style="display:flex;flex-direction:column;gap:18px;">

          <div style="
            display:flex;
            gap:24px;
            align-items:flex-end;
            flex-wrap:nowrap;
          ">

            <!-- FRETE -->
            <div style="display:flex;flex-direction:column;gap:6px;min-width:260px;">
              <label style="font-size:14px;font-weight:600;display:block;">
                AbsorÃ§Ã£o automÃ¡tica de Frete (%)
              </label>

              <div style="display:flex;align-items:center;gap:8px;">
                <input
                  id="financeiroAbsorcaoFrete"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  inputmode="numeric"
                  style="
                    width:72px;
                    padding:10px 12px;
                    border-radius:12px;
                    border:1px solid #e5e7eb;
                    font-size:14px;
                    text-align:center;
                  "
                >
                <span style="color:#64748b;font-weight:600;">%</span>
              </div>
            </div>

            <!-- MONTAGEM -->
            <div style="display:flex;flex-direction:column;gap:6px;min-width:300px;">
              <label style="font-size:14px;font-weight:600;display:block;">
                AbsorÃ§Ã£o automÃ¡tica de Montagem (%)
              </label>

              <div style="display:flex;align-items:center;gap:8px;">
                <input
                  id="financeiroAbsorcaoMontagem"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  inputmode="numeric"
                  style="
                    width:72px;
                    padding:10px 12px;
                    border-radius:12px;
                    border:1px solid #e5e7eb;
                    font-size:14px;
                    text-align:center;
                  "
                >
                <span style="color:#64748b;font-weight:600;">%</span>
              </div>
            </div>

          </div>

          <div style="font-size:13px;color:#64748b;line-height:1.5;">
            Esses percentuais serÃ£o aplicados automaticamente como desconto
            em todos os pedidos da empresa.
          </div>

        </div>

      </div>
    `;
  }

  async function bind(container, state, api){

    const inputFrete = container.querySelector("#financeiroAbsorcaoFrete");
    const inputMont  = container.querySelector("#financeiroAbsorcaoMontagem");

    if(!inputFrete || !inputMont) return () => {};

    const f = state.financeiro || null;

    inputFrete.value = (f?.absorcao_frete_percent ?? 0);
    inputMont.value  = (f?.absorcao_montagem_percent ?? 0);

    function clampInt(el){
      let v = parseInt(el.value, 10);
      if (Number.isNaN(v)) v = 0;
      if (v < 0) v = 0;
      if (v > 100) v = 100;
      el.value = v;
    }

    const onFrete = () => clampInt(inputFrete);
    const onMont  = () => clampInt(inputMont);

    inputFrete.addEventListener("input", onFrete);
    inputMont.addEventListener("input", onMont);

    // garante que jÃ¡ entra â€œlimpoâ€
    clampInt(inputFrete);
    clampInt(inputMont);

    return () => {
      inputFrete.removeEventListener("input", onFrete);
      inputMont.removeEventListener("input", onMont);
    };
  }

  window.empresa = window.empresa || {};
  window.empresa.sections = window.empresa.sections || {};
  window.empresa.sections.financeiro = { render, bind };

})();