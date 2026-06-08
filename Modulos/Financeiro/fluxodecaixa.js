(() => {
const lancamentos = [
  {
    data: "2026-06-01",
    descricao: "Recebimento - Evento João e Maria",
    categoria: "Eventos",
    tipo: "Entrada",
    valor: 5200,
    status: "Recebido",
    forma: "PIX"
  },
  {
    data: "2026-06-01",
    descricao: "Pagamento - Fornecedor Madeira & Cia",
    categoria: "Fornecedores",
    tipo: "Saída",
    valor: 2500,
    status: "Pago",
    forma: "Transferência"
  },
  {
    data: "2026-06-02",
    descricao: "Recebimento - Evento Empresa XPTO",
    categoria: "Eventos",
    tipo: "Entrada",
    valor: 3800,
    status: "Recebido",
    forma: "PIX"
  },
  {
    data: "2026-06-02",
    descricao: "Pagamento - Aluguel Galpão",
    categoria: "Despesas Fixas",
    tipo: "Saída",
    valor: 1200,
    status: "Pago",
    forma: "Débito Automático"
  },
  {
    data: "2026-06-03",
    descricao: "Recebimento - Locação Cadeiras",
    categoria: "Locações",
    tipo: "Entrada",
    valor: 2900,
    status: "Recebido",
    forma: "PIX"
  },
  {
    data: "2026-06-04",
    descricao: "Pagamento - Transportadora",
    categoria: "Logística",
    tipo: "Saída",
    valor: 800,
    status: "Pago",
    forma: "Transferência"
  },
  {
    data: "2026-06-05",
    descricao: "Recebimento - Evento Corporativo",
    categoria: "Eventos",
    tipo: "Entrada",
    valor: 600,
    status: "Recebido",
    forma: "PIX"
  },
  {
    data: "2026-06-06",
    descricao: "Pagamento - Folha de Pagamento",
    categoria: "Recursos Humanos",
    tipo: "Saída",
    valor: 6000,
    status: "Pago",
    forma: "Transferência"
  },
  {
    data: "2026-06-07",
    descricao: "Pagamento - Material de Limpeza",
    categoria: "Despesas Gerais",
    tipo: "Saída",
    valor: 420,
    status: "Pago",
    forma: "PIX"
  },
  {
    data: "2026-06-08",
    descricao: "Recebimento - Evento Ana Beatriz",
    categoria: "Eventos",
    tipo: "Entrada",
    valor: 1200,
    status: "Pendente",
    forma: "PIX"
  }
];

let listaAtual = [...lancamentos];

function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatarData(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function classeCategoria(categoria) {
  return categoria
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(" ", "-");
}

function renderizarTabela(lista) {
  const tbody = document.getElementById("tabelaLancamentos");
  tbody.innerHTML = "";

  lista.forEach(item => {
    const tr = document.createElement("tr");

    const valorClasse =
      item.tipo === "Entrada"
        ? "valor-entrada"
        : "valor-saida";

    const tipoClasse =
      item.tipo === "Entrada"
        ? "tipo-entrada"
        : "tipo-saida";

    const sinalValor =
      item.tipo === "Entrada"
        ? formatarMoeda(item.valor)
        : "-" + formatarMoeda(item.valor);

    const iconeTipo =
      item.tipo === "Entrada"
        ? "↓ Entrada"
        : "↑ Saída";

    tr.innerHTML = `
      <td>${formatarData(item.data)}</td>
      <td>${item.descricao}</td>
      <td>
        <span class="badge ${classeCategoria(item.categoria)}">
          ${item.categoria}
        </span>
      </td>
      <td class="${tipoClasse}">${iconeTipo}</td>
      <td class="${valorClasse}">${sinalValor}</td>
      <td>
        <span class="badge status ${item.status === "Pendente" ? "pendente" : ""}">
          ${item.status}
        </span>
      </td>
      <td>${item.forma}</td>
      <td class="acoes">⋮</td>
    `;

    tbody.appendChild(tr);
  });

  document.getElementById("contadorTabela").innerText =
    `Mostrando 1 a ${lista.length} de ${lista.length} lançamentos`;
}

function atualizarResumo(lista) {
  const entradas = lista.filter(item => item.tipo === "Entrada");
  const saidas = lista.filter(item => item.tipo === "Saída");

  const totalEntradas = entradas.reduce((acc, item) => acc + item.valor, 0);
  const totalSaidas = saidas.reduce((acc, item) => acc + item.valor, 0);
  const saldo = totalEntradas - totalSaidas;

  document.getElementById("totalEntradas").innerText =
    formatarMoeda(totalEntradas);

  document.getElementById("totalSaidas").innerText =
    formatarMoeda(totalSaidas);

  document.getElementById("saldoMes").innerText =
    formatarMoeda(saldo);

  document.getElementById("saldoPrevisto").innerText =
    formatarMoeda(saldo);

  document.getElementById("qtdEntradas").innerText =
    `${entradas.length} lançamentos`;

  document.getElementById("qtdSaidas").innerText =
    `${saidas.length} lançamentos`;

  document.getElementById("totalFooter").innerText =
    formatarMoeda(totalEntradas);
}

function filtrarLancamentos() {
  const dataInicial = document.getElementById("filtroDataInicial").value;
  const dataFinal = document.getElementById("filtroDataFinal").value;
  const tipo = document.getElementById("filtroTipo").value;
  const categoria = document.getElementById("filtroCategoria").value;
  const status = document.getElementById("filtroStatus").value;

  listaAtual = lancamentos.filter(item => {
    const dentroData =
      (!dataInicial || item.data >= dataInicial) &&
      (!dataFinal || item.data <= dataFinal);

    const tipoOk =
      !tipo || item.tipo === tipo;

    const categoriaOk =
      !categoria || item.categoria === categoria;

    const statusOk =
      !status || item.status === status;

    return dentroData && tipoOk && categoriaOk && statusOk;
  });

  renderizarTabela(listaAtual);
  atualizarResumo(listaAtual);
}

function abrirModal() {
  document.getElementById("modalLancamento").classList.add("show");
}

function fecharModal() {
  document.getElementById("modalLancamento").classList.remove("show");
}

function salvarLancamento() {
  const data = document.getElementById("novaData").value;
  const descricao = document.getElementById("novaDescricao").value;
  const categoria = document.getElementById("novaCategoria").value;
  const tipo = document.getElementById("novoTipo").value;
  const valor = Number(document.getElementById("novoValor").value);
  const status = document.getElementById("novoStatus").value;
  const forma = document.getElementById("novaForma").value;

  if (!data || !descricao || !valor) {
    alert("Preencha data, descrição e valor.");
    return;
  }

  lancamentos.push({
    data,
    descricao,
    categoria,
    tipo,
    valor,
    status,
    forma
  });

  fecharModal();
  limparModal();
  filtrarLancamentos();
}

function limparModal() {
  document.getElementById("novaData").value = "";
  document.getElementById("novaDescricao").value = "";
  document.getElementById("novoValor").value = "";
}

renderizarTabela(listaAtual);
atualizarResumo(listaAtual);

function mostrarCalendario(){

  document
    .getElementById("conteudoDetalhado")
    .classList.add("hidden");

  document
    .getElementById("conteudoCalendario")
    .classList.remove("hidden");

  document
    .getElementById("tabDetalhado")
    .classList.remove("active");

  document
    .getElementById("tabCalendario")
    .classList.add("active");

}

function mostrarDetalhado(){

  document
    .getElementById("conteudoCalendario")
    .classList.add("hidden");

  document
    .getElementById("conteudoDetalhado")
    .classList.remove("hidden");

  document
    .getElementById("tabCalendario")
    .classList.remove("active");

  document
    .getElementById("tabDetalhado")
    .classList.add("active");

}
function gerarCalendarioFluxo(){

  const calendario =
    document.getElementById(
      "calendarioFluxo"
    );

  calendario.innerHTML = "";

  for(let dia = 1; dia <= 30; dia++){

    let saldo =
      Math.floor(
        Math.random() * 20000
      ) - 5000;

    let classe = "dia-verde";

    if(saldo < 0){

      classe = "dia-vermelho";

    }
    else if(saldo < 5000){

      classe = "dia-amarelo";

    }

calendario.innerHTML += `
  <div
    class="dia-fluxo ${classe}"
    onclick="abrirDia(${dia}, ${saldo})"
  >

    <div class="numero-dia">
      ${dia}
    </div>

    <div class="valor-dia">
      ${formatarMoeda(saldo)}
    </div>

  </div>
`;

  }

}

gerarCalendarioFluxo();
let mesAtual = 5;
let anoAtual = 2026;

const meses = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];

function atualizarTituloMes(){

  document.getElementById(
    "tituloMes"
  ).innerText =
    `${meses[mesAtual]} ${anoAtual}`;

}

function mesAnterior(){

  mesAtual--;

  if(mesAtual < 0){
    mesAtual = 11;
    anoAtual--;
  }

  atualizarTituloMes();
  gerarCalendarioFluxo();

}

function proximoMes(){

  mesAtual++;

  if(mesAtual > 11){
    mesAtual = 0;
    anoAtual++;
  }

  atualizarTituloMes();
  gerarCalendarioFluxo();

}
function abrirDia(
  dia,
  saldo
){

  document
    .getElementById(
      "modalDia"
    )
    .classList.add(
      "show"
    );

  document
    .getElementById(
      "modalTituloDia"
    )
    .innerText =
      `Dia ${dia}/${mesAtual + 1}/${anoAtual}`;

  const entrada =
    Math.max(
      saldo + 3000,
      0
    );

  const saida =
    Math.max(
      entrada - saldo,
      0
    );

  document
    .getElementById(
      "modalEntradaDia"
    )
    .innerText =
      formatarMoeda(
        entrada
      );

  document
    .getElementById(
      "modalSaidaDia"
    )
    .innerText =
      formatarMoeda(
        saida
      );

  document
    .getElementById(
      "modalSaldoDia"
    )
    .innerText =
      formatarMoeda(
        saldo
      );

  document
    .getElementById(
      "modalListaDia"
    )
    .innerHTML = `

      <div class="item-dia">

        <span>
          Recebimento Evento João e Maria
        </span>

        <strong style="color:#15803d">
          + ${formatarMoeda(entrada)}
        </strong>

      </div>

      <div class="item-dia">

        <span>
          Pagamento Fornecedor Madeira
        </span>

        <strong style="color:#dc2626">
          - ${formatarMoeda(saida)}
        </strong>

      </div>

    `;

}
function fecharDia(){

  document
    .getElementById(
      "modalDia"
    )
    .classList.remove(
      "show"
    );

}

window.filtrarLancamentos = filtrarLancamentos;
window.abrirModal = abrirModal;
window.fecharModal = fecharModal;
window.salvarLancamento = salvarLancamento;
window.mostrarCalendario = mostrarCalendario;
window.mostrarDetalhado = mostrarDetalhado;
window.mesAnterior = mesAnterior;
window.proximoMes = proximoMes;
window.abrirDia = abrirDia;
window.fecharDia = fecharDia;

window.__activeModuleDestroy = function financeiroDestroy(){
  delete window.filtrarLancamentos;
  delete window.abrirModal;
  delete window.fecharModal;
  delete window.salvarLancamento;
  delete window.mostrarCalendario;
  delete window.mostrarDetalhado;
  delete window.mesAnterior;
  delete window.proximoMes;
  delete window.abrirDia;
  delete window.fecharDia;
};

window.finalizarCarregamentoModulo?.();
})();
