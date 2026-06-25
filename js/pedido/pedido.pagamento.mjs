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

  const totalContratoEl = document.getElementById("pgTotalContrato");
  const totalDescontosEl = document.getElementById("pgTotalDescontos");
  const totalCreditosEl = document.getElementById("pgTotalCreditos");
  const valorFinalEl = document.getElementById("pgValorFinal");
  const totalProgramadoEl = document.getElementById("pgTotalProgramado");
  const diferencaEl = document.getElementById("pgDiferenca");

  const btnLimpar = document.getElementById("btnLimparProgramacao");

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

  const statusOptions = () => `
    <option>Programado</option>
    <option>Pago</option>
    <option>Pendente</option>
    <option>Cancelado</option>
  `;

  const refreshIcons = () => window.lucide?.createIcons?.();

  const criarLinha = ({ numero, tipo, vencimento, valor, metodo }) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${numero}</td>
      <td>${tipo}</td>
      <td><input class="el-input pg-vencimento" type="date" value="${vencimento || ""}"></td>
      <td contenteditable="true" class="pg-valor">${formatCurrency(valor)}</td>
      <td><select class="pg-metodo">${metodoOptions(metodo)}</select></td>
      <td><select class="pg-status">${statusOptions()}</select></td>
      <td>
        <button type="button" class="pedido-pix-btn" data-pix-parcela title="Gerar PIX" aria-label="Gerar PIX">
          <i data-lucide="qr-code"></i>
        </button>
      </td>
    `;
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
    const cells = Array.from(tr?.children || []);
    const parcelaNumero = cells[0]?.textContent?.trim() || String(index + 1);
    const parcelaLabel = cells[1]?.textContent?.trim() || `Parcela ${index + 1}`;
    const vencimento = tr.querySelector(".pg-vencimento")?.value || "";
    const valor = moneyValue(tr.querySelector(".pg-valor"));

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
    const totais = calcularTotais();
    const totalProgramado = somarProgramado();
    const diferenca = totais.valorFinal - totalProgramado;

    if(totalContratoEl) totalContratoEl.innerText = formatCurrency(totais.totalPedido);
    if(totalDescontosEl) totalDescontosEl.innerText = formatCurrency(totais.totalDescontos);
    if(totalCreditosEl) totalCreditosEl.innerText = formatCurrency(totais.totalCreditos);
    if(valorFinalEl) valorFinalEl.innerText = formatCurrency(totais.valorFinal);
    if(totalProgramadoEl) totalProgramadoEl.innerText = formatCurrency(totalProgramado);
    if(diferencaEl) diferencaEl.innerText = formatCurrency(diferenca);
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
    refreshIcons();
  };

  const limparProgramacao = () => {
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
          metodo: parcela.metodo || metodoEl?.value || "PIX"
        });
        const status = tr.querySelector(".pg-status");
        if(status && parcela.status) status.value = parcela.status;
        tbody.appendChild(tr);
      });
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

  tbody.addEventListener("input", atualizarResumo);
  tbody.addEventListener("change", atualizarResumo);
  tbody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pix-parcela]");
    if(button) abrirPixParcela(button);
  });

  btnLimpar?.addEventListener("click", limparProgramacao);

  window.atualizarPagamento = gerarParcelas;
  window.__pedidoColetarPagamentoConfig = coletarConfig;
  window.__pedidoAplicarPagamentoConfig = aplicarConfig;

  gerarParcelas();
  refreshIcons();
}
