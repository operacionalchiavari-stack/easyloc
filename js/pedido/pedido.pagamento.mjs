/* =====================================================
   PAGAMENTO - EASYLOC
===================================================== */

import { formatCurrency } from "./pedido.utils.mjs";

export function initPagamento(){
  const metodoEl = document.getElementById("pagamentoMetodo");
  const entradaEl = document.getElementById("pagamentoEntradaPercent");
  const parcelasEl = document.getElementById("pagamentoParcelas");
  const dataEntradaEl = document.getElementById("pagamentoDataBase");
  const diaFixoEl = document.getElementById("pagamentoDiaFixo");
  const descontoComercialEl = document.getElementById("pagamentoDescontoComercial");
  const bvTotalEl = document.getElementById("bvTotal");
  const bvAbatidoEl = document.getElementById("bvAbatido");
  const creditoClienteEl = document.getElementById("pagamentoCreditoCliente");

  const tbody = document.getElementById("cronogramaParcelas");
  const resumoFaltaDistribuirEl = document.getElementById("pgResumoFaltaDistribuir");
  const resumoBVEl = document.getElementById("pgResumoBV");
  const resumoCreditoEl = document.getElementById("pgResumoCredito");
  const btnAdicionarAbatimento = document.getElementById("btnAdicionarAbatimento");
  const abatimentoPopover = document.getElementById("pagamentoAbatimentoPopover");
  const abatimentoBVEl = document.getElementById("pagamentoAbatimentoBV");
  const abatimentoCreditoEl = document.getElementById("pagamentoAbatimentoCredito");
  const btnConfirmarAbatimento = document.getElementById("btnConfirmarAbatimento");

  const totalContratoEl = document.getElementById("pgTotalContrato");
  const totalDescontosEl = document.getElementById("pgTotalDescontos");
  const totalCreditosEl = document.getElementById("pgTotalCreditos");
  const valorFinalEl = document.getElementById("pgValorFinal");
  const totalProgramadoEl = document.getElementById("pgTotalProgramado");
  const diferencaEl = document.getElementById("pgDiferenca");

  const btnLimpar = document.getElementById("btnLimparProgramacao");
  let cronogramaManual = false;

  if(!tbody){
    console.warn("Tabela de pagamento nao encontrada");
    return;
  }

  const moneyValue = (el) => {
    if(!el) return 0;
    const raw = String(el.value ?? el.innerText ?? "")
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim();
    return Math.max(0, Number(raw) || 0);
  };

  const dateToBR = (value) => {
    if(!value) return "-";
    const date = new Date(`${value}T00:00:00`);
    if(Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  };

  const addMonths = (value, months, fixedDay) => {
    if(!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if(Number.isNaN(date.getTime())) return "";

    date.setMonth(date.getMonth() + months);

    const day = Number(fixedDay || 0);
    if(day > 0){
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(day, lastDay));
    }

    return date.toISOString().slice(0, 10);
  };

  const formasPagamento = [
    { value: "PIX", label: "PIX", icon: "qr-code" },
    { value: "Cartao", label: "Cartão de crédito", icon: "credit-card" },
    { value: "Boleto", label: "Boleto", icon: "barcode" },
    { value: "Transferencia", label: "Transferência", icon: "banknote" },
    { value: "Dinheiro", label: "Dinheiro", icon: "wallet" },
    { value: "A combinar", label: "A combinar", icon: "circle-ellipsis" }
  ];

  const metodoKey = (value = "") => normalizarStatus(value).replace(/\s+/g, "");

  const normalizarMetodo = (value = "") => {
    const key = metodoKey(value);
    if(key.includes("pix")) return "PIX";
    if(key.includes("cartao") || key.includes("credito")) return "Cartao";
    if(key.includes("boleto")) return "Boleto";
    if(key.includes("transferencia")) return "Transferencia";
    if(key.includes("dinheiro")) return "Dinheiro";
    return "A combinar";
  };

  const metodoConfig = (value = "") => {
    const normalizado = normalizarMetodo(value);
    return formasPagamento.find((forma) => forma.value === normalizado) || formasPagamento[0];
  };

  const metodoClass = (value = "") => normalizarMetodo(value).toLowerCase().replace(/\s+/g, "-");

  const metodoOptions = (selected) => {
    const normalizado = normalizarMetodo(selected);
    return formasPagamento.map((metodo) =>
      `<option value="${metodo.value}" ${metodo.value === normalizado ? "selected" : ""}>${metodo.label}</option>`
    ).join("");
  };

  const normalizarStatus = (status = "") => String(status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  const statusOptions = (selected = "Programado") => `
    ${["Programado", "Pago", "Pendente", "Cancelado"].map((status) =>
      `<option ${
        normalizarStatus(status) === normalizarStatus(selected) ||
        (status === "Pago" && isPago(selected))
          ? "selected"
          : ""
      }>${status}</option>`
    ).join("")}
  `;

  const refreshIcons = () => window.lucide?.createIcons?.();

  const isPago = (status = "") => ["pago", "paga", "recebido", "quitado", "liquidado", "baixado"].includes(normalizarStatus(status));
  const isCancelado = (status = "") => ["cancelado", "cancelada"].includes(normalizarStatus(status));

  const statusMeta = (row) => {
    const status = row?.querySelector(".pg-status")?.value || row?.dataset.status || "Programado";
    const vencimento = row?.querySelector(".pg-vencimento")?.value || "";
    const valor = valorDaLinha(row);
    const recebido = recebidoDaLinha(row);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = vencimento ? new Date(`${vencimento}T00:00:00`) : null;
    const pagaPorBaixa = valor > 0 && recebido >= valor;
    const atrasada = venc && !Number.isNaN(venc.getTime()) && venc < hoje && !pagaPorBaixa && !isPago(status) && !isCancelado(status);

    if(isPago(status) || pagaPorBaixa) return { key: "paid", label: "Pago" };
    if(atrasada) return { key: "overdue", label: "Atrasado" };
    if(normalizarStatus(status).includes("pendente") || normalizarStatus(status).includes("abert")) {
      return { key: "open", label: "Em dia" };
    }
    if(isCancelado(status)) return { key: "canceled", label: "Cancelada" };
    return { key: "programmed", label: "Em dia" };
  };

  const valorDaLinha = (row) => moneyValue(row?.querySelector(".pg-valor"));

  const recebidoDaLinha = (row) => {
    const dataValue = row?.dataset.recebido;
    if(dataValue !== undefined && dataValue !== null && dataValue !== ""){
      const parsed = Number(dataValue);
      if(Number.isFinite(parsed)) return Math.max(0, parsed);
    }
    return isPago(row?.querySelector(".pg-status")?.value) ? valorDaLinha(row) : 0;
  };

  const atualizarLinhaVisual = (row) => {
    if(!row) return;

    const meta = statusMeta(row);
    row.classList.remove("is-paid", "is-open", "is-overdue", "is-programmed", "is-canceled");
    row.classList.add(`is-${meta.key}`);

    const valor = valorDaLinha(row);
    const recebido = recebidoDaLinha(row);
    const metodo = normalizarMetodo(row.querySelector(".pg-metodo")?.value || metodoEl?.value || "A combinar");
    const metodoAtual = metodoConfig(metodo);
    const recebidoEl = row.querySelector(".pg-recebido");
    const badge = row.querySelector(".pg-status-badge");
    const methodText = row.querySelector(".pg-metodo-text");
    const cobrancaButton = row.querySelector("[data-cobranca-parcela]");

    if(recebidoEl) recebidoEl.textContent = formatCurrency(recebido);
    if(methodText) methodText.textContent = metodoAtual.label;
    if(badge) {
      badge.className = `pg-status-badge ${meta.key}`;
      badge.textContent = meta.label;
    }
    if(cobrancaButton) {
      cobrancaButton.className = `pedido-cobranca-btn ${metodoClass(metodoAtual.value)}`;
      cobrancaButton.title = `Cobrança via ${metodoAtual.label}`;
      cobrancaButton.setAttribute("aria-label", `Cobrança via ${metodoAtual.label}`);
      cobrancaButton.innerHTML = `<i data-lucide="${metodoAtual.icon}"></i>`;
    }

    row.dataset.valor = String(valor);
    row.dataset.status = row.querySelector(".pg-status")?.value || "Programado";
    row.dataset.metodo = metodo;
  };

  const atualizarTodasLinhas = () => {
    tbody.querySelectorAll("tr").forEach(atualizarLinhaVisual);
  };

  const atualizarSequencia = () => {
    const rows = Array.from(tbody.querySelectorAll("tr"));
    rows.forEach((row, index) => {
      const numero = String(index + 1);
      const numeroEl = row.querySelector(".pg-numero");
      const posEl = row.querySelector(".pg-parcela-pos");
      if(numeroEl) numeroEl.textContent = numero;
      if(posEl) posEl.textContent = `${numero} de ${rows.length}`;
    });
  };

  const criarLinha = ({ numero, tipo, vencimento, valor, metodo, status = "Programado", recebido = "" }) => {
    const tr = document.createElement("tr");
    tr.dataset.recebido = recebido !== undefined && recebido !== null ? String(recebido) : "";
    const metodoInicial = normalizarMetodo(metodo);
    tr.innerHTML = `
      <td>
        <strong class="pg-parcela-label">${tipo}</strong>
        <span class="pg-numero sr-only">${numero}</span>
        <small class="pg-parcela-pos"></small>
      </td>
      <td><input class="el-input pg-vencimento" type="date" value="${vencimento || ""}"></td>
      <td contenteditable="true" class="pg-valor">${formatCurrency(valor)}</td>
      <td>
        <span class="pg-status-badge programmed">Em dia</span>
        <select class="pg-status sr-only" aria-label="Status da parcela">${statusOptions(status)}</select>
      </td>
      <td>
        <select class="pg-metodo pagamento-metodo-select" aria-label="Forma de pagamento da parcela">${metodoOptions(metodoInicial)}</select>
        <span class="pg-metodo-text sr-only">${metodoConfig(metodoInicial).label}</span>
        <span class="pg-recebido sr-only">R$ 0,00</span>
      </td>
      <td>
        <button type="button" class="pedido-cobranca-btn pix" data-cobranca-parcela title="Cobrança" aria-label="Cobrança">
          <i data-lucide="qr-code"></i>
        </button>
      </td>
      <td>
        <div class="pg-row-actions">
          <button type="button" class="pg-action-btn" data-pg-action="edit" title="Editar parcela" aria-label="Editar parcela">
            <i data-lucide="pencil"></i>
          </button>
          <button type="button" class="pg-action-btn danger" data-pg-action="remove" title="Remover parcela" aria-label="Remover parcela">
            <i data-lucide="trash-2"></i>
          </button>
          <button type="button" class="pg-action-btn muted" data-pg-action="more" title="Mais opções" aria-label="Mais opções">
            <i data-lucide="grip-vertical"></i>
          </button>
        </div>
      </td>
    `;
    atualizarLinhaVisual(tr);
    return tr;
  };

  const abrirCobrancaParcela = (button) => {
    const tr = button?.closest("tr");
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const index = rows.indexOf(tr);
    const pedidoId = window.__PEDIDO_ATUAL_ID || null;
    const metodo = normalizarMetodo(tr?.querySelector(".pg-metodo")?.value || "PIX");
    const metodoAtual = metodoConfig(metodo);

    if(!pedidoId){
      if(typeof window.alerta === "function"){
        window.alerta("Salve o pedido antes de gerar a cobrança.", "Cobrança", "aviso");
      }else{
        alert("Salve o pedido antes de gerar a cobrança.");
      }
      return;
    }

    if(metodo !== "PIX"){
      const mensagem = `Cobrança por ${metodoAtual.label} ainda não está integrada neste fluxo.`;
      if(typeof window.alerta === "function"){
        window.alerta(mensagem, "Cobrança", "aviso");
      }else{
        alert(mensagem);
      }
      return;
    }

    if(!window.EasyLocPix?.open){
      if(typeof window.alerta === "function"){
        window.alerta("Fluxo PIX indisponivel neste momento.", "PIX", "erro");
      }
      return;
    }

    const numeroPedido = document.getElementById("orcamentoNumero")?.textContent?.trim() || "";
    const cliente = document.getElementById("clienteInput")?.value?.trim() || "Cliente nao informado";
    const clienteId = document.getElementById("clienteIdHidden")?.value || null;
    const contato = document.getElementById("telefoneInput")?.value?.trim() || "";
    const parcelaNumero = tr?.querySelector(".pg-numero")?.textContent?.trim() || String(index + 1);
    const parcelaLabel = tr?.querySelector(".pg-parcela-label")?.textContent?.trim() || `Parcela ${index + 1}`;
    const vencimento = tr.querySelector(".pg-vencimento")?.value || "";
    const valor = moneyValue(tr.querySelector(".pg-valor"));
    const parcelas = rows.map((row, rowIndex) => {
      return {
        numero: row.querySelector(".pg-numero")?.textContent?.trim() || String(rowIndex + 1),
        tipo: row.querySelector(".pg-parcela-label")?.textContent?.trim() || `Parcela ${rowIndex + 1}`,
        vencimento: row.querySelector(".pg-vencimento")?.value || "",
        valor: moneyValue(row.querySelector(".pg-valor")),
        recebido: recebidoDaLinha(row),
        metodo: normalizarMetodo(row.querySelector(".pg-metodo")?.value || ""),
        status: row.querySelector(".pg-status")?.value || "Pendente"
      };
    }).filter((parcela) => parcela.valor > 0);

    window.EasyLocPix.open({
      source: "pedido",
      pedidoId,
      numeroPedido,
      clienteId,
      cliente,
      contato,
      valor,
      vencimento,
      parcelaIndex: index >= 0 ? index : null,
      parcelaNumero,
      parcelaLabel,
      parcelas,
      gateway: "mercado_pago"
    });
  };

  const calcularTotais = () => {
    const totalPedido = Number(window.__TOTAL_PEDIDO || 0);
    const descontoComercial = moneyValue(descontoComercialEl);
    const descontoBV = moneyValue(bvTotalEl);
    const abatimentoBV = moneyValue(bvAbatidoEl);
    const creditoCliente = moneyValue(creditoClienteEl);

    const totalDescontos = descontoComercial + descontoBV;
    const totalCreditos = abatimentoBV + creditoCliente;
    const valorFinal = Math.max(0, totalPedido - totalDescontos - totalCreditos);

    return {
      totalPedido,
      totalDescontos,
      totalCreditos,
      valorFinal
    };
  };

  const somarProgramado = () => {
    let total = 0;
    tbody.querySelectorAll(".pg-valor").forEach((el) => {
      total += moneyValue(el);
    });
    return total;
  };

  const atualizarResumo = () => {
    atualizarTodasLinhas();
    const totais = calcularTotais();
    const totalProgramado = somarProgramado();
    const diferenca = totais.valorFinal - totalProgramado;
    const faltaDistribuir = Math.max(0, diferenca);
    const bvDisponivel = moneyValue(bvTotalEl);
    const creditoDisponivel = moneyValue(creditoClienteEl);

    if(totalContratoEl) totalContratoEl.innerText = formatCurrency(totais.totalPedido);
    if(totalDescontosEl) totalDescontosEl.innerText = formatCurrency(totais.totalDescontos);
    if(totalCreditosEl) totalCreditosEl.innerText = formatCurrency(totais.totalCreditos);
    if(valorFinalEl) valorFinalEl.innerText = formatCurrency(totais.valorFinal);
    if(totalProgramadoEl) totalProgramadoEl.innerText = formatCurrency(totalProgramado);
    if(diferencaEl) diferencaEl.innerText = formatCurrency(diferenca);
    if(resumoFaltaDistribuirEl) resumoFaltaDistribuirEl.innerText = formatCurrency(faltaDistribuir);
    if(resumoBVEl) resumoBVEl.innerText = formatCurrency(bvDisponivel);
    if(resumoCreditoEl) resumoCreditoEl.innerText = formatCurrency(creditoDisponivel);
  };

  const gerarParcelas = () => {
    cronogramaManual = false;
    const { valorFinal } = calcularTotais();
    const entrada = Math.min(moneyValue(entradaEl), valorFinal);
    const qtdParcelas = Math.max(0, Number(parcelasEl?.value || 0));
    const metodo = metodoEl?.value || "PIX";
    const vencEntrada = dataEntradaEl?.value || "";
    const primeiroVencimento = vencEntrada;
    const diaFixo = diaFixoEl?.value || "";

    tbody.innerHTML = "";

    let numero = 1;
    let restante = valorFinal;

    if(entrada > 0){
      tbody.appendChild(criarLinha({
        numero,
        tipo: "Entrada",
        vencimento: vencEntrada,
        valor: entrada,
        metodo
      }));
      numero += 1;
      restante -= entrada;
    }

    if(qtdParcelas > 0 && restante > 0){
      let somaParcelas = 0;
      const valorBase = restante / qtdParcelas;

      for(let index = 0; index < qtdParcelas; index += 1){
        let valor = valorBase;

        if(index === qtdParcelas - 1){
          valor = restante - somaParcelas;
        } else {
          valor = Math.round(valor * 100) / 100;
          somaParcelas += valor;
        }

        tbody.appendChild(criarLinha({
          numero,
          tipo: `Parcela ${index + 1}`,
          vencimento: addMonths(primeiroVencimento, index, diaFixo),
          valor,
          metodo
        }));

        numero += 1;
      }
    }

    atualizarSequencia();
    atualizarResumo();
    refreshIcons();
  };

  const limparProgramacao = () => {
    cronogramaManual = true;
    tbody.innerHTML = "";
    atualizarResumo();
  };

  const coletarConfig = () => ({
    metodo: metodoEl?.value || "PIX",
    entrada: entradaEl?.value || "",
    parcelas: parcelasEl?.value || "",
    dataEntrada: dataEntradaEl?.value || "",
    diaFixo: diaFixoEl?.value || "",
    descontoComercial: descontoComercialEl?.value || "",
    descontoBV: bvTotalEl?.value || "",
    abatidoBV: bvAbatidoEl?.value || "",
    creditoCliente: creditoClienteEl?.value || ""
  });

  const setIfExists = (el, value) => {
    if(el && value !== undefined && value !== null) el.value = value;
  };

  const aplicarConfig = (config = {}, parcelas = []) => {
    setIfExists(metodoEl, config.metodo);
    setIfExists(entradaEl, config.entrada);
    setIfExists(parcelasEl, config.parcelas);
    setIfExists(dataEntradaEl, config.dataEntrada);
    setIfExists(diaFixoEl, config.diaFixo);
    setIfExists(descontoComercialEl, config.descontoComercial);
    setIfExists(bvTotalEl, config.descontoBV);
    setIfExists(bvAbatidoEl, config.abatidoBV);
    setIfExists(creditoClienteEl, config.creditoCliente);

    if(Array.isArray(parcelas) && parcelas.length){
      cronogramaManual = true;
      tbody.innerHTML = "";
      parcelas.forEach((parcela, index) => {
        const valor = typeof parcela.valor === "number"
          ? parcela.valor
          : moneyValue({ value: parcela.valor });
        const tr = criarLinha({
          numero: parcela.numero || index + 1,
          tipo: parcela.tipo || (index === 0 ? "Entrada" : `Parcela ${index}`),
          vencimento: parcela.vencimento || "",
          valor,
          metodo: parcela.metodo || metodoEl?.value || "PIX",
          status: parcela.status || "Programado",
          recebido: parcela.recebido ?? parcela.valor_recebido ?? ""
        });
        tbody.appendChild(tr);
      });
      atualizarSequencia();
      atualizarResumo();
      refreshIcons();
      return;
    }

    cronogramaManual = false;
    gerarParcelas();
  };

  const atualizarPagamentoPorTotal = () => {
    if(cronogramaManual && tbody.querySelector("tr")){
      atualizarResumo();
      refreshIcons();
      return;
    }
    gerarParcelas();
  };

  [
    metodoEl,
    entradaEl,
    parcelasEl,
    dataEntradaEl,
    diaFixoEl,
    descontoComercialEl,
    bvTotalEl,
    bvAbatidoEl,
    creditoClienteEl
  ].forEach((el) => {
    if(!el) return;
    el.addEventListener("input", gerarParcelas);
    el.addEventListener("change", gerarParcelas);
  });

  tbody.addEventListener("input", (event) => {
    const row = event.target.closest("tr");
    if(row) {
      cronogramaManual = true;
      if(event.target.closest(".pg-valor")) row.dataset.recebido = "";
      atualizarLinhaVisual(row);
    }
    atualizarResumo();
  });
  tbody.addEventListener("change", (event) => {
    const row = event.target.closest("tr");
    if(row) {
      cronogramaManual = true;
      atualizarLinhaVisual(row);
    }
    atualizarResumo();
  });
  tbody.addEventListener("click", (event) => {
    const cobrancaButton = event.target.closest("[data-cobranca-parcela]");
    const actionButton = event.target.closest("[data-pg-action]");
    const row = event.target.closest("tr");

    if(cobrancaButton) {
      abrirCobrancaParcela(cobrancaButton);
      return;
    }

    if(!actionButton || !row) return;

    const action = actionButton.dataset.pgAction;
    if(action === "edit"){
      row.querySelector(".pg-valor")?.focus();
      return;
    }

    if(action === "remove"){
      cronogramaManual = true;
      row.remove();
      atualizarSequencia();
      atualizarResumo();
      refreshIcons();
    }
  });

  btnLimpar?.addEventListener("click", limparProgramacao);

  const fecharPopoverAbatimento = () => {
    if(!abatimentoPopover) return;
    abatimentoPopover.hidden = true;
    btnAdicionarAbatimento?.setAttribute("aria-expanded", "false");
  };

  btnAdicionarAbatimento?.addEventListener("click", (event) => {
    event.stopPropagation();
    if(!abatimentoPopover) return;
    const aberto = !abatimentoPopover.hidden;
    abatimentoPopover.hidden = aberto;
    btnAdicionarAbatimento.setAttribute("aria-expanded", aberto ? "false" : "true");
  });

  btnConfirmarAbatimento?.addEventListener("click", () => {
    const bv = moneyValue(abatimentoBVEl);
    const credito = moneyValue(abatimentoCreditoEl);
    if(bvTotalEl) bvTotalEl.value = String(moneyValue(bvTotalEl) + bv);
    if(creditoClienteEl) creditoClienteEl.value = String(moneyValue(creditoClienteEl) + credito);
    if(abatimentoBVEl) abatimentoBVEl.value = "";
    if(abatimentoCreditoEl) abatimentoCreditoEl.value = "";
    atualizarResumo();
    fecharPopoverAbatimento();
  });

  document.addEventListener("click", (event) => {
    if(abatimentoPopover?.hidden) return;
    if(event.target.closest("#pagamentoAbatimentoPopover") || event.target.closest("#btnAdicionarAbatimento")) return;
    fecharPopoverAbatimento();
  });

  window.atualizarPagamento = atualizarPagamentoPorTotal;
  window.__pedidoColetarPagamentoConfig = coletarConfig;
  window.__pedidoAplicarPagamentoConfig = aplicarConfig;

  gerarParcelas();
  refreshIcons();
}
