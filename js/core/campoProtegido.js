/* Campos protegidos pelo cofre (out/2026): CPF, RG, salário, PIS, CTPS, agência, conta, PIX.
   O banco só devolve a máscara (•••.•••.•••-01). O campo nasce vazio, com a máscara de dica; o botão "Ver"
   (só para quem tem rh.dados_sensiveis.ver) busca o valor inteiro na Edge Function rh-protegido, que registra
   quem viu. Campo protegido que ninguém mexeu não é enviado ao salvar: o banco mantém o valor de antes.
   Uso: EasyLocCofre.preparar(input, { protegido, mascara, podeRevelar, revelar: async () => "valor" })
        EasyLocCofre.mudou(input) -> mandar o campo ao salvar? */
(function () {
  const estilo = document.createElement("style");
  estilo.textContent = ".cofre-campo{display:flex;gap:6px;align-items:stretch}.cofre-campo>input{flex:1;min-width:0}" +
    ".cofre-ver{border:1px solid #c9d3e3;background:#fff;color:#1f2020;border-radius:8px;padding:0 10px;font:600 12px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}" +
    ".cofre-ver:hover{border-color:#123f86}.cofre-ver[disabled]{opacity:.55;cursor:wait}" +
    ".cofre-selo{display:inline-block;margin-left:6px;font:600 10.5px Inter,system-ui,sans-serif;color:#6b6b6b;letter-spacing:.02em}";
  document.head.appendChild(estilo);

  function envolver(input) {
    if (input.parentElement && input.parentElement.classList.contains("cofre-campo")) return input.parentElement;
    const caixa = document.createElement("span");
    caixa.className = "cofre-campo";
    input.parentNode.insertBefore(caixa, input);
    caixa.appendChild(input);
    return caixa;
  }

  function preparar(input, opcoes) {
    if (!input) return;
    const o = opcoes || {};
    const caixa = envolver(input);
    caixa.querySelectorAll(".cofre-ver").forEach((b) => b.remove());
    input.dataset.cofreAlterado = "";
    if (!input.dataset.cofreDica) input.dataset.cofreDica = input.placeholder || "";
    input.oninput = () => { input.dataset.cofreAlterado = "1"; };
    if (!o.protegido) {
      input.dataset.cofreProtegido = "";
      input.placeholder = input.dataset.cofreDica;
      return;
    }
    input.dataset.cofreProtegido = "1";
    input.value = "";
    input.placeholder = (o.mascara || "••••") + "  · protegido";
    input.title = "Dado protegido. Para trocar, digite o novo valor; em branco, fica como está.";
    if (!o.podeRevelar || typeof o.revelar !== "function") return;
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "cofre-ver";
    botao.textContent = "Ver";
    botao.title = "Mostrar o valor completo (fica registrado quem viu)";
    botao.onclick = async () => {
      botao.disabled = true;
      try {
        const valor = await o.revelar();
        input.value = valor == null ? "" : String(valor);
        input.placeholder = input.dataset.cofreDica;
        botao.remove();
      } catch (e) {
        botao.disabled = false;
        (window.alerta || alert)(e && e.message ? e.message : "Não foi possível mostrar o dado.");
      }
    };
    caixa.appendChild(botao);
  }

  // Mandar ao salvar? Campo comum: sempre. Protegido: só se a pessoa digitou algo nele (ou revelou e mexeu).
  const mudou = (input) => !!input && (input.dataset.cofreProtegido !== "1" || input.dataset.cofreAlterado === "1");

  // Chama a Edge Function rh-protegido e devolve os valores pedidos.
  async function revelarRh(client, empresaId, funcionarioId, campos) {
    const { data, error } = await client.functions.invoke("rh-protegido", {
      body: { action: "revelar", empresa_id: empresaId, funcionario_id: funcionarioId, campos } });
    let msg = data && data.error;
    if (error && !msg) {
      try { msg = (await error.context.json()).error; } catch (_) { msg = error.message; }
    }
    if (msg) throw new Error(msg);
    return (data && data.valores) || {};
  }

  window.EasyLocCofre = { preparar, mudou, revelarRh };
})();
