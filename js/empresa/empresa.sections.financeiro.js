(function(){

  function render(container, state){

    container.innerHTML = `
      <section class="pr-card" data-fin-card="desconto"><div style="display:flex;flex-direction:column;gap:32px;max-width:760px;">

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
                Absorção automática de Frete (%)
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
                Absorção automática de Montagem (%)
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
            Esses percentuais serão aplicados automaticamente como desconto
            em todos os pedidos da empresa.
          </div>

        </div>

      </div></section>
      <section class="pr-card" data-fin-card="pagamento">
        <h3>Pagamento mínimo para liberar o pedido</h3>
        <p class="pr-ajuda">Quando ligado, o pedido só passa da etapa escolhida se tiver pelo menos a porcentagem abaixo paga em Contas a receber. Ex.: 100% = pedido quitado; 80% = libera com 80% pago. A entrega nunca é travada.</p>
        <div class="pr-opcoes"><label class="pr-check"><input type="checkbox" id="financeiroPagamentoExige"><span>Exigir o pagamento mínimo</span></label></div>
        <div class="pr-campo" style="margin-top:16px"><span>Onde travar</span><div class="pr-opcoes" role="radiogroup" aria-label="Onde travar"><label class="pr-check"><input type="radio" name="finPagamentoEtapa" value="triagem"><span>Na Triagem (a separação não começa)</span></label><label class="pr-check"><input type="radio" name="finPagamentoEtapa" value="carregamento"><span>No Carregamento (separa, mas não carrega)</span></label></div></div>
        <label class="pr-campo fin-pagamento-perc" style="margin-top:16px"><span>Pagamento mínimo</span><div><input id="financeiroPagamentoPercent" type="number" min="1" max="100" step="1" inputmode="numeric"><small>% do valor do pedido</small></div></label>
      </section>
      <section class="pr-card" data-fin-card="baixa-manual">
        <h3>Baixa manual de recebimentos e pagamentos</h3>
        <p class="pr-ajuda">O caminho normal &#233; a concilia&#231;&#227;o em Financeiro &#8250; Bancos. Ligado, quem pode editar contas a receber ou a pagar tamb&#233;m consegue marcar uma parcela como recebida ou paga direto na lista, informando data, valor e conta. Aten&#231;&#227;o: quando o extrato do banco chegar, a linha desse valor deve ser ignorada na concilia&#231;&#227;o para n&#227;o contar duas vezes.</p>
        <div class="pr-opcoes"><label class="pr-check"><input type="checkbox" id="financeiroBaixaReceber"><span>Permitir marcar como recebido manualmente (Contas a receber)</span></label><label class="pr-check"><input type="checkbox" id="financeiroBaixaPagar"><span>Permitir marcar como pago manualmente (Contas a pagar)</span></label></div>
      </section>
      <section class="pr-card" data-fin-card="producao">
        <h3>Libera&#231;&#227;o financeira da Produ&#231;&#227;o</h3>
        <p class="pr-ajuda">Regra independente da Triagem e do Carregamento. Sem o pagamento confirmado, a produ&#231;&#227;o n&#227;o pode iniciar nem retomar uma etapa.</p>
        <label class="pr-check"><input type="checkbox" id="financeiroProducaoExige"><span>Exigir pagamento para iniciar a produ&#231;&#227;o</span></label>
        <label class="pr-campo fin-pagamento-perc"><span>Pagamento m&#237;nimo para produ&#231;&#227;o</span><div><input id="financeiroProducaoPercent" type="number" min="1" max="100" step="1"><small>% do valor do pedido</small></div></label>
      </section>
    `;
  }

  async function bind(container, state, api){

    const inputFrete = container.querySelector("#financeiroAbsorcaoFrete");
    const inputMont  = container.querySelector("#financeiroAbsorcaoMontagem");

    if(!inputFrete || !inputMont) return () => {};

    const f = state.financeiro || null;
    const prodExige=container.querySelector('#financeiroProducaoExige'),prodPercent=container.querySelector('#financeiroProducaoPercent');
    const bxR=container.querySelector('#financeiroBaixaReceber'),bxP=container.querySelector('#financeiroBaixaPagar');
    if(bxR)bxR.checked=f?.baixa_manual_receber===true; if(bxP)bxP.checked=f?.baixa_manual_pagar===true;
    prodExige.checked=f?.producao_pagamento_exige===true;
    prodPercent.value=f?.producao_pagamento_percent??100;
    const atualizarProducao=()=>{prodPercent.disabled=!prodExige.checked;};
    prodExige.addEventListener('change',atualizarProducao);atualizarProducao();

    inputFrete.value = (f?.absorcao_frete_percent ?? 0);
    inputMont.value  = (f?.absorcao_montagem_percent ?? 0);
    const exige = container.querySelector("#financeiroPagamentoExige"), perc = container.querySelector("#financeiroPagamentoPercent");
    exige.checked = f?.pagamento_exige === true;
    const etapaTrava = f?.pagamento_trava_etapa === "triagem" ? "triagem" : "carregamento";
    container.querySelectorAll("[name=finPagamentoEtapa]").forEach((r) => { r.checked = r.value === etapaTrava; });
    perc.value = Number(f?.pagamento_percent ?? 100);
    const verPerc = () => { perc.disabled = !exige.checked; container.querySelectorAll("[name=finPagamentoEtapa]").forEach((r) => { r.disabled = !exige.checked; }); };
    exige.addEventListener("change", verPerc); verPerc();

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

    // garante que já entra “limpo”
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
