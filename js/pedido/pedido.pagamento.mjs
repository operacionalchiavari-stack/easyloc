/* =====================================================
   PAGAMENTO - EASYLOC
===================================================== */

import { formatCurrency } from "./pedido.utils.mjs";

export function initPagamento(){

  const tipoEl = document.getElementById("pagamentoTipo");
  const entradaEl = document.getElementById("pagamentoEntradaPercent");
  const parcelasEl = document.getElementById("pagamentoParcelas");
  const intervaloEl = document.getElementById("pagamentoIntervalo");
  const dataBaseEl = document.getElementById("pagamentoDataBase");
  const metodoEl = document.getElementById("pagamentoMetodo");

  const tbody = document.getElementById("cronogramaParcelas");

  const totalContratoEl = document.getElementById("pgTotalContrato");
  const totalProgramadoEl = document.getElementById("pgTotalProgramado");

  if(!tbody){
    console.warn("⚠️ Tabela de pagamento não encontrada");
    return;
  }

  /* =====================================================
     FUNÇÃO PRINCIPAL
  ===================================================== */

function calcularPagamento(){

  const total = Number(window.__TOTAL_PEDIDO || 0);

  const entradaPercent = Number(entradaEl?.value || 0);
  const parcelas = Number(parcelasEl?.value || 1);
  const intervalo = Number(intervaloEl?.value || 30);
  const dataBase = dataBaseEl?.value;
  const metodo = metodoEl?.value || "-";
const tipo = tipoEl?.value || "";

if(tipo.toLowerCase().includes("vista")){
  entradaEl.value = 100;
  parcelasEl.value = 1;
  parcelasEl.disabled = true;
} else {
  parcelasEl.disabled = false;
}
  tbody.innerHTML = "";

  if(total <= 0){
    atualizarResumo(0,0,0);
    return;
  }

    let totalProgramado = 0;

    /* =====================================================
       ENTRADA
    ===================================================== */

    const valorEntrada = total * (entradaPercent / 100);

    if(valorEntrada > 0){

const tr = document.createElement("tr");

tr.innerHTML = `
  <td>1</td>
  <td>Entrada</td>
<td>${
  dataBase
    ? new Date(dataBase + "T00:00:00")
        .toLocaleDateString("pt-BR")
    : "—"
}</td>
  <td contenteditable="true" class="pg-valor">${formatCurrency(valorEntrada)}</td>
  <td>
    <select class="pg-metodo">
      <option ${metodo === "PIX" ? "selected" : ""}>PIX</option>
      <option ${metodo === "Boleto" ? "selected" : ""}>Boleto</option>
      <option ${metodo === "Cartão" ? "selected" : ""}>Cartão</option>
      <option ${metodo === "Transferência" ? "selected" : ""}>Transferência</option>
    </select>
  </td>
`;

      tbody.appendChild(tr);

      totalProgramado += valorEntrada;
    }

    /* =====================================================
       PARCELAS
    ===================================================== */

    const restante = total - valorEntrada;

    if(parcelas > 0 && restante > 0){

let somaParcelas = 0;
const valorBase = restante / parcelas;

      for(let i = 0; i < parcelas; i++){

let valorParcela = valorBase;

if(i === parcelas - 1){
  valorParcela = restante - somaParcelas;
} else {
  valorParcela = Math.round(valorParcela * 100) / 100;
  somaParcelas += valorParcela;
}

const tr = document.createElement("tr");

        let dataTexto = "—";

        if(dataBase){
          const data = new Date(dataBase + "T00:00:00");
          data.setDate(data.getDate() + (intervalo * (i + 1)));

          dataTexto = data.toLocaleDateString("pt-BR");
        }

tr.innerHTML = `
  <td>${i + 2}</td>
  <td>Parcela ${i + 1}</td>
  <td>${dataTexto}</td>
<td contenteditable="true" class="pg-valor">${formatCurrency(valorParcela)}</td>
  <td>
    <select class="pg-metodo">
      <option ${metodo === "PIX" ? "selected" : ""}>PIX</option>
      <option ${metodo === "Boleto" ? "selected" : ""}>Boleto</option>
      <option ${metodo === "Cartão" ? "selected" : ""}>Cartão</option>
      <option ${metodo === "Transferência" ? "selected" : ""}>Transferência</option>
    </select>
  </td>
`;

        tbody.appendChild(tr);

        totalProgramado += valorParcela;
      }
    }

    /* =====================================================
       RESUMO
    ===================================================== */

let somaManual = 0;

tbody.querySelectorAll("tr").forEach(tr => {

  const valorTexto = tr.querySelector(".pg-valor")?.innerText || "0";

  const valor = parseFloat(
    valorTexto.replace("R$", "").replace(/\./g, "").replace(",", ".")
  ) || 0;

  somaManual += valor;
});
atualizarResumo(total, somaManual);

/* =====================================================
   ESTILO POR MÉTODO
===================================================== */

tbody.querySelectorAll(".pg-metodo").forEach(select => {

  const valor = select.value.toLowerCase();

  select.classList.remove("pix", "cartao", "boleto", "transferencia");

  if(valor.includes("pix")) select.classList.add("pix");
  if(valor.includes("cart")) select.classList.add("cartao");
  if(valor.includes("boleto")) select.classList.add("boleto");
  if(valor.includes("transfer")) select.classList.add("transferencia");

});
/* =====================================================
   DETECTAR MÉTODO HÍBRIDO
===================================================== */

const metodosUsados = new Set();

tbody.querySelectorAll(".pg-metodo").forEach(select => {
  if(select.value){
    metodosUsados.add(select.value);
  }
});

if(metodoEl){
  if(metodosUsados.size > 1){
    metodoEl.value = "Híbrido";
  } else if(metodosUsados.size === 1){
    metodoEl.value = [...metodosUsados][0];
  }
}
  }
  /* =====================================================
     ATUALIZA RESUMO
  ===================================================== */

function atualizarResumo(total, programado){

    if(totalContratoEl){
      totalContratoEl.innerText = formatCurrency(total);
    }

    if(totalProgramadoEl){
      totalProgramadoEl.innerText = formatCurrency(programado);
    }
  }

  /* =====================================================
     BINDS
  ===================================================== */

  [
    tipoEl,
    entradaEl,
    parcelasEl,
    intervaloEl,
    dataBaseEl,
    metodoEl
  ].forEach(el => {
    if(el){
      el.addEventListener("input", calcularPagamento);
      el.addEventListener("change", calcularPagamento);
    }
  });

  /* =====================================================
     GLOBAL (CHAMADO PELO PEDIDO)
  ===================================================== */

  window.atualizarPagamento = calcularPagamento;

  /* =====================================================
     START
  ===================================================== */

calcularPagamento();

/* =====================================================
   EVENTO MÉTODO HÍBRIDO
===================================================== */

tbody.addEventListener("change", (e) => {
  if(e.target.classList.contains("pg-metodo")){

    // 🔥 aplica cor só no select alterado
    const select = e.target;
    const valor = select.value.toLowerCase();

    select.classList.remove("pix", "cartao", "boleto", "transferencia");

    if(valor.includes("pix")) select.classList.add("pix");
    if(valor.includes("cart")) select.classList.add("cartao");
    if(valor.includes("boleto")) select.classList.add("boleto");
    if(valor.includes("transfer")) select.classList.add("transferencia");

    // 🔥 continua lógica do híbrido
    atualizarMetodoTopo();
  }
});

function atualizarMetodoTopo(){

  const metodosUsados = new Set();

  tbody.querySelectorAll(".pg-metodo").forEach(select => {
    if(select.value){
      metodosUsados.add(select.value);
    }
  });

  if(metodoEl){
    if(metodosUsados.size > 1){
      metodoEl.value = "Híbrido";
    } else if(metodosUsados.size === 1){
      metodoEl.value = [...metodosUsados][0];
    }
  }
}

}
