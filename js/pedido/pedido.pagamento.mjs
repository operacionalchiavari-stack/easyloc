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

  const criarLinha = ({ numero, tipo, vencimento, valor, metodo }) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${numero}</td>
      <td>${tipo}</td>
      <td><input class="el-input pg-vencimento" type="date" value="${vencimento || ""}"></td>
      <td contenteditable="true" class="pg-valor">${formatCurrency(valor)}</td>
      <td><select class="pg-metodo">${metodoOptions(metodo)}</select></td>
      <td><select class="pg-status">${statusOptions()}</select></td>
    `;
    return tr;
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
  };

  const limparProgramacao = () => {
    tbody.innerHTML = "";
    atualizarResumo();
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

  btnLimpar?.addEventListener("click", limparProgramacao);

  window.atualizarPagamento = gerarParcelas;

  gerarParcelas();
}
