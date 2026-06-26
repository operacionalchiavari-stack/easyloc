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
  const condicoesEl = document.getElementById("pagamentoCondicoes");
  const btnFinanceiroAcoes = document.getElementById("btnFinanceiroAcoes");

  const totalContratoEl = document.getElementById("pgTotalContrato");
  const totalDescontosEl = document.getElementById("pgTotalDescontos");
  const totalCreditosEl = document.getElementById("pgTotalCreditos");
  const valorFinalEl = document.getElementById("pgValorFinal");
  const totalProgramadoEl = document.getElementById("pgTotalProgramado");
  const diferencaEl = document.getElementById("pgDiferenca");
  const resumoTotalEl = document.getElementById("pgResumoTotal");
  const resumoRecebidoEl = document.getElementById("pgResumoRecebido");
  const resumoAbertoEl = document.getElementById("pgResumoAberto");
  const resumoPagamentoEl = document.getElementById("pgResumoPagamento");
  const condEntradaResumoEl = document.getElementById("pgCondEntradaResumo");
  const condVencResumoEl = document.getElementById("pgCondVencResumo");
  const condDescontoResumoEl = document.getElementById("pgCondDescontoResumo");
  const condFormaResumoEl = document.getElementById("pgCondFormaResumo");
  const condParcelasResumoEl = document.getElementById("pgCondParcelasResumo");
  const painelParcelaEl = document.getElementById("pgPainelParcela");
  const painelVencimentoEl = document.getElementById("pgPainelVencimento");
  const painelValorEl = document.getElementById("pgPainelValor");
  const painelStatusEl = document.getElementById("pgPainelStatus");
  const painelMetodoEl = document.getElementById("pgPainelMetodo");
  const painelPixBtn = document.getElementById("pgPainelPixBtn");

  const btnLimpar = document.getElementById("btnLimparProgramacao");
  let selectedRow = null;

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

  const metodoOptions = (selected) => {
    const metodos = ["PIX", "Cartao", "Transferencia", "Boleto", "Dinheiro", "A combinar"];
    return metodos.map((metodo) =>
      `<option ${metodo === selected ? "selected" : ""}>${metodo}</option>`
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
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = vencimento ? new Date(`${vencimento}T00:00:00`) : null;
    const atrasada = venc && !Number.isNaN(venc.getTime()) && venc < hoje && !isPago(status) && !isCancelado(status);

    if(isPago(status)) return { key: "paid", label: "Paga", action: "Ver" };
    if(atrasada) return { key: "overdue", label: "Atrasada", action: "Gerar PIX" };
    if(normalizarStatus(status).includes("pendente") || normalizarStatus(status).includes("abert")) {
      return { key: "open", label: "Aberta", action: "Gerar PIX" };
    }
    if(isCancelado(status)) return { key: "canceled", label: "Cancelada", action: "Ver" };
    return { key: "programmed", label: "Programada", action: "Ver" };
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
    const metodo = row.querySelector(".pg-metodo")?.value || metodoEl?.value || "A combinar";
    const recebidoEl = row.querySelector(".pg-recebido");
    const badge = row.querySelector(".pg-status-badge");
    const actionText = row.querySelector(".pg-action-text");
    const methodText = row.querySelector(".pg-metodo-text");

    if(recebidoEl) recebidoEl.textContent = formatCurrency(recebido);
    if(methodText) methodText.textContent = metodo;
    if(badge) {
      badge.className = `pg-status-badge ${meta.key}`;
      badge.textContent = meta.label;
    }
    if(actionText) actionText.textContent = meta.action;

    row.dataset.valor = String(valor);
    row.dataset.status = row.querySelector(".pg-status")?.value || "Programado";

    if(row === selectedRow) atualizarPainel(row);
  };

  const atualizarTodasLinhas = () => {
    tbody.querySelectorAll("tr").forEach(atualizarLinhaVisual);
  };

  const selecionarLinha = (row) => {
    if(!row) {
      selectedRow?.classList.remove("is-selected");
      selectedRow = null;
      atualizarPainel(null);
      return;
    }

    selectedRow?.classList.remove("is-selected");
    selectedRow = row;
    selectedRow.classList.add("is-selected");
    atualizarPainel(row);
  };

  const selecionarPrimeiraParcela = () => {
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const aberta = rows.find((row) => {
      const meta = statusMeta(row);
      return meta.key === "open" || meta.key === "overdue";
    });
    selecionarLinha(aberta || rows[0] || null);
  };

  const atualizarPainel = (row) => {
    const meta = row ? statusMeta(row) : null;
    const tipo = row?.querySelector(".pg-parcela-label")?.textContent?.trim() || "Selecione uma parcela";
    const vencimento = row?.querySelector(".pg-vencimento")?.value || "";
    const valor = row ? valorDaLinha(row) : 0;
    const metodo = row?.querySelector(".pg-metodo")?.value || "-";

    if(painelParcelaEl) painelParcelaEl.textContent = tipo;
    if(painelVencimentoEl) painelVencimentoEl.textContent = dateToBR(vencimento);
    if(painelValorEl) painelValorEl.textContent = formatCurrency(valor);
    if(painelStatusEl) painelStatusEl.textContent = meta?.label || "-";
    if(painelMetodoEl) painelMetodoEl.textContent = metodo;
    if(painelPixBtn) {
      painelPixBtn.disabled = !row;
      painelPixBtn.textContent = meta?.action === "Ver" ? "Ver PIX" : "Gerar QR Code PIX";
    }
  };

  const criarLinha = ({ numero, tipo, vencimento, valor, metodo, status = "Programado", recebido = "" }) => {
    const tr = document.createElement("tr");
    tr.dataset.recebido = recebido !== undefined && recebido !== null ? String(recebido) : "";
    tr.innerHTML = `
      <td>
        <strong class="pg-parcela-label">${tipo}</strong>
        <span class="pg-numero sr-only">${numero}</span>
        <small><span class="pg-metodo-text">${metodo || "A combinar"}</span></small>
        <select class="pg-metodo" aria-label="Forma de pagamento da parcela">${metodoOptions(metodo)}</select>
      </td>
      <td><input class="el-input pg-vencimento" type="date" value="${vencimento || ""}"></td>
      <td contenteditable="true" class="pg-valor">${formatCurrency(valor)}</td>
      <td><span class="pg-recebido">R$ 0,00</span></td>
      <td>
        <span class="pg-status-badge programmed">Programada</span>
        <select class="pg-status" aria-label="Status da parcela">${statusOptions(status)}</select>
      </td>
      <td>
        <button type="button" class="pedido-pix-btn" data-pix-parcela title="Gerar PIX" aria-label="Gerar PIX">
          <i data-lucide="qr-code"></i>
          <span class="pg-action-text">Gerar PIX</span>
        </button>
      </td>
    `;
    atualizarLinhaVisual(tr);
    return tr;
  };

  const abrirPixParcela = (button) => {
    const tr = button?.closest("tr");
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const index = rows.indexOf(tr);
    const pedidoId = window.__PEDIDO_ATUAL_ID || null;

    if(!pedidoId){
      if(typeof window.alerta === "function"){
        window.alerta("Salve o pedido antes de gerar PIX.", "PIX", "aviso");
      }else{
        alert("Salve o pedido antes de gerar PIX.");
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
        metodo: row.querySelector(".pg-metodo")?.value || "",
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
    const totalRecebido = Array.from(tbody.querySelectorAll("tr"))
      .reduce((sum, row) => sum + recebidoDaLinha(row), 0);
    const totalAberto = Math.max(0, totais.valorFinal - totalRecebido);
    const diferenca = totais.valorFinal - totalProgramado;

    if(totalContratoEl) totalContratoEl.innerText = formatCurrency(totais.totalPedido);
    if(totalDescontosEl) totalDescontosEl.innerText = formatCurrency(totais.totalDescontos);
    if(totalCreditosEl) totalCreditosEl.innerText = formatCurrency(totais.totalCreditos);
    if(valorFinalEl) valorFinalEl.innerText = formatCurrency(totais.valorFinal);
    if(totalProgramadoEl) totalProgramadoEl.innerText = formatCurrency(totalProgramado);
    if(diferencaEl) diferencaEl.innerText = formatCurrency(diferenca);
    if(resumoTotalEl) resumoTotalEl.innerText = formatCurrency(totais.valorFinal);
    if(resumoRecebidoEl) resumoRecebidoEl.innerText = formatCurrency(totalRecebido);
    if(resumoAbertoEl) resumoAbertoEl.innerText = formatCurrency(totalAberto);
    if(resumoPagamentoEl) resumoPagamentoEl.innerText = `${metodoEl?.value || "PIX"} • ${parcelasEl?.value || 0}x`;
    if(condEntradaResumoEl) condEntradaResumoEl.innerText = `Entrada ${formatCurrency(moneyValue(entradaEl))}`;
    if(condVencResumoEl) condVencResumoEl.innerText = `Vencimento ${diaFixoEl?.value ? `dia ${diaFixoEl.value}` : dateToBR(dataEntradaEl?.value)}`;
    if(condDescontoResumoEl) condDescontoResumoEl.innerText = `Desconto ${formatCurrency(totais.totalDescontos)}`;
    if(condFormaResumoEl) condFormaResumoEl.innerText = metodoEl?.value || "PIX";
    if(condParcelasResumoEl) condParcelasResumoEl.innerText = `${parcelasEl?.value || 0}x`;
  };

  const gerarParcelas = () => {
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

    atualizarResumo();
    selecionarPrimeiraParcela();
    refreshIcons();
  };

  const limparProgramacao = () => {
    tbody.innerHTML = "";
    selecionarLinha(null);
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
      atualizarResumo();
      selecionarPrimeiraParcela();
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
      if(event.target.closest(".pg-valor")) row.dataset.recebido = "";
      atualizarLinhaVisual(row);
    }
    atualizarResumo();
  });
  tbody.addEventListener("change", (event) => {
    const row = event.target.closest("tr");
    if(row) atualizarLinhaVisual(row);
    atualizarResumo();
  });
  tbody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pix-parcela]");
    const row = event.target.closest("tr");
    if(row) selecionarLinha(row);
    if(button) abrirPixParcela(button);
  });

  btnLimpar?.addEventListener("click", limparProgramacao);
  btnFinanceiroAcoes?.addEventListener("click", () => {
    if(condicoesEl) condicoesEl.open = !condicoesEl.open;
  });
  painelPixBtn?.addEventListener("click", () => {
    const button = selectedRow?.querySelector("[data-pix-parcela]");
    if(button) abrirPixParcela(button);
  });

  window.atualizarPagamento = gerarParcelas;
  window.__pedidoColetarPagamentoConfig = coletarConfig;
  window.__pedidoAplicarPagamentoConfig = aplicarConfig;

  gerarParcelas();
  refreshIcons();
}
