(() => {
const HOJE = "2026-06-10";

const lancamentos = [];

let listaAtual = [...lancamentos];
let mesAtual = 5;
let anoAtual = 2026;
let financeiroInicializado = false;

const meses = [
  "Janeiro",
  "Fevereiro",
  "Marco",
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

function normalizarDataISO(value) {
  if (!value) return "";
  const texto = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? "" : data.toISOString().slice(0, 10);
}

function numeroPedidoFormatado(pedido) {
  const numero = String(pedido.numero_pedido || pedido.numero || pedido.id || "").trim();
  return numero.startsWith("#") ? numero : `#${numero}`;
}

function lancamentosDoPedido(pedido) {
  const valor = Number(pedido.valor_total || pedido.total || pedido.valor || 0);
  const data = normalizarDataISO(pedido.data_entrega)
    || normalizarDataISO(pedido.data_evento)
    || normalizarDataISO(pedido.data_hora)
    || HOJE;
  const parcelas = Array.isArray(pedido.observacoes?.parcelas_financeiras)
    ? pedido.observacoes.parcelas_financeiras
    : [];

  if (parcelas.length) {
    return parcelas
      .filter((parcela) => Number(parcela.valor || 0) > 0)
      .map((parcela, index) => ({
        data: normalizarDataISO(parcela.vencimento) || data,
        descricao: `Recebimento - ${pedido.cliente_nome || "Cliente nao informado"}`,
        categoria: "Eventos",
        tipo: "Entrada",
        valor: Number(parcela.valor || 0),
        baixado: 0,
        status: "Pendente",
        forma: parcela.metodo || "A combinar",
        documento: `PED-${String(pedido.numero_pedido || pedido.id || "").replace("#", "")}`,
        parcela: parcela.tipo || `Parcela ${index + 1}`,
        origem: "pedido",
        pedido_id: pedido.id
      }));
  }

  return [{
    data,
    descricao: `Recebimento - ${pedido.cliente_nome || "Cliente nao informado"}`,
    categoria: "Eventos",
    tipo: "Entrada",
    valor,
    baixado: 0,
    status: "Pendente",
    forma: "A combinar",
    documento: `PED-${String(pedido.numero_pedido || pedido.id || "").replace("#", "")}`,
    parcela: "Pedido",
    origem: "pedido",
    pedido_id: pedido.id
  }];
}

async function sincronizarPedidosFinanceiro() {
  const supabase = window.supabaseClient;
  const empresaId = window.__CONTEXT?.empresa_id;
  if (!supabase || !empresaId) return;

  try {
    const { data, error } = await supabase
      .from("separacoes_pedidos")
      .select("id,numero_pedido,cliente_nome,data_evento,data_entrega,data_hora,valor_total,status_comercial,observacoes")
      .eq("empresa_id", empresaId)
      .in("status_comercial", ["pre_reserva", "aprovado"])
      .order("data_evento", { ascending: true });

    if (error) throw error;

    for (let i = lancamentos.length - 1; i >= 0; i--) {
      if (lancamentos[i]?.origem === "pedido") lancamentos.splice(i, 1);
    }

    (data || [])
      .filter((pedido) => Number(pedido.valor_total || 0) > 0)
      .forEach((pedido) => lancamentos.push(...lancamentosDoPedido(pedido)));
  } catch (err) {
    console.warn("Nao foi possivel sincronizar pedidos no financeiro:", err);
  }
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatarData(dataISO) {
  if (!dataISO) return "-";
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function classeCategoria(categoria) {
  return String(categoria || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(" ", "-");
}

function normalizarTipo(tipo) {
  return tipo === "Saida" ? "Saida" : tipo;
}

function valorBaixado(item) {
  if (typeof item.baixado === "number") return item.baixado;
  if (item.status === "Recebido" || item.status === "Pago") return item.valor;
  return 0;
}

function saldoAberto(item) {
  return Math.max(Number(item.valor || 0) - valorBaixado(item), 0);
}

function statusOperacional(item) {
  if (saldoAberto(item) <= 0) return normalizarTipo(item.tipo) === "Entrada" ? "Recebido" : "Pago";
  if (valorBaixado(item) > 0) return "Parcial";
  if (item.data < HOJE) return "Vencido";
  return item.status || "Pendente";
}

function isBaixado(item) {
  return saldoAberto(item) <= 0;
}

function renderizarTabela(lista) {
  const tbody = document.getElementById("tabelaLancamentos");
  if (!tbody) return;
  tbody.innerHTML = "";

  lista.forEach((item, index) => {
    const tipo = normalizarTipo(item.tipo);
    const tr = document.createElement("tr");
    const valorClasse = tipo === "Entrada" ? "valor-entrada" : "valor-saida";
    const tipoClasse = tipo === "Entrada" ? "tipo-entrada" : "tipo-saida";
    const sinalValor = tipo === "Entrada" ? formatarMoeda(item.valor) : "-" + formatarMoeda(item.valor);
    const iconeTipo = tipo === "Entrada" ? "Entrada" : "Saida";
    const status = statusOperacional(item);

    tr.innerHTML = `
      <td>${formatarData(item.data)}</td>
      <td>
        <strong>${item.descricao}</strong>
        <small class="linha-apoio">${item.documento || "-"} - ${item.parcela || "-"}</small>
      </td>
      <td><span class="badge ${classeCategoria(item.categoria)}">${item.categoria}</span></td>
      <td class="${tipoClasse}">${iconeTipo}</td>
      <td class="${valorClasse}">${sinalValor}</td>
      <td><span class="badge status ${status.toLowerCase()}">${status}</span></td>
      <td>${item.forma}</td>
      <td class="acoes">
        <button class="btn-acao" onclick="baixarLancamento(${index})" title="Dar baixa">Baixar</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  document.getElementById("contadorTabela").innerText =
    `Mostrando ${lista.length} de ${lista.length} lancamentos`;
}

function atualizarResumo(lista) {
  const entradas = lista.filter(item => normalizarTipo(item.tipo) === "Entrada");
  const saidas = lista.filter(item => normalizarTipo(item.tipo) === "Saida");

  const totalEntradas = entradas.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const totalSaidas = saidas.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const saldo = totalEntradas - totalSaidas;
  const previsto = lista.reduce((acc, item) => {
    return normalizarTipo(item.tipo) === "Entrada"
      ? acc + Number(item.valor || 0)
      : acc - Number(item.valor || 0);
  }, 0);

  document.getElementById("totalEntradas").innerText = formatarMoeda(totalEntradas);
  document.getElementById("totalSaidas").innerText = formatarMoeda(totalSaidas);
  document.getElementById("saldoMes").innerText = formatarMoeda(saldo);
  document.getElementById("saldoPrevisto").innerText = formatarMoeda(previsto);
  document.getElementById("qtdEntradas").innerText = `${entradas.length} lancamentos`;
  document.getElementById("qtdSaidas").innerText = `${saidas.length} lancamentos`;
  document.getElementById("totalFooter").innerText = formatarMoeda(saldo);
}

function obterFiltros() {
  return {
    dataInicial: document.getElementById("filtroDataInicial").value,
    dataFinal: document.getElementById("filtroDataFinal").value,
    tipo: document.getElementById("filtroTipo").value,
    categoria: document.getElementById("filtroCategoria").value,
    status: document.getElementById("filtroStatus").value
  };
}

function aplicarFiltros(base = lancamentos) {
  const { dataInicial, dataFinal, tipo, categoria, status } = obterFiltros();

  return base.filter(item => {
    const statusAtual = statusOperacional(item);
    const dentroData = (!dataInicial || item.data >= dataInicial) && (!dataFinal || item.data <= dataFinal);
    const tipoOk = !tipo || normalizarTipo(item.tipo) === tipo;
    const categoriaOk = !categoria || item.categoria === categoria;
    const statusOk = !status || statusAtual === status;
    return dentroData && tipoOk && categoriaOk && statusOk;
  });
}

function filtrarLancamentos() {
  listaAtual = aplicarFiltros();
  renderizarTabela(listaAtual);
  atualizarResumo(listaAtual);
  renderizarContasReceber();
  renderizarContasPagar();
}

function abrirModal(tipo = "") {
  document.getElementById("modalLancamento").classList.add("show");
  document.getElementById("modalLancamentoTitulo").innerText =
    tipo === "Entrada" ? "Nova Conta a Receber" :
    tipo === "Saida" ? "Nova Conta a Pagar" :
    "Novo Lancamento";

  if (tipo) {
    document.getElementById("novoTipo").value = tipo;
    document.getElementById("novoStatus").value = "Pendente";
  }
}

function abrirModalReceber() {
  abrirModal("Entrada");
}

function abrirModalPagar() {
  abrirModal("Saida");
}

function fecharModal() {
  document.getElementById("modalLancamento").classList.remove("show");
}

function salvarLancamento() {
  const data = document.getElementById("novaData").value;
  const descricao = document.getElementById("novaDescricao").value;
  const categoria = document.getElementById("novaCategoria").value;
  const tipo = normalizarTipo(document.getElementById("novoTipo").value);
  const valor = Number(document.getElementById("novoValor").value);
  const status = document.getElementById("novoStatus").value;
  const forma = document.getElementById("novaForma").value;
  const documento = document.getElementById("novoDocumento").value;
  const parcela = document.getElementById("novaParcela").value;
  const baixado = status === "Recebido" || status === "Pago" ? valor : 0;

  if (!data || !descricao || !valor) {
    alert("Preencha data, descricao e valor.");
    return;
  }

  lancamentos.push({
    data,
    descricao,
    categoria,
    tipo,
    valor,
    baixado,
    status,
    forma,
    documento,
    parcela
  });

  fecharModal();
  limparModal();
  filtrarLancamentos();
}

function limparModal() {
  document.getElementById("novaData").value = "";
  document.getElementById("novaDescricao").value = "";
  document.getElementById("novoValor").value = "";
  document.getElementById("novoDocumento").value = "";
  document.getElementById("novaParcela").value = "";
}

function baixarLancamento(index) {
  const item = listaAtual[index];
  if (!item) return;
  item.baixado = item.valor;
  item.status = normalizarTipo(item.tipo) === "Entrada" ? "Recebido" : "Pago";
  filtrarLancamentos();
}

function baixarConta(tipo, index) {
  const lista = aplicarFiltros(lancamentos.filter(item => normalizarTipo(item.tipo) === tipo));
  const item = lista[index];
  if (!item) return;
  item.baixado = item.valor;
  item.status = tipo === "Entrada" ? "Recebido" : "Pago";
  filtrarLancamentos();
}

function excluirConta(tipo, index) {
  const lista = aplicarFiltros(lancamentos.filter(item => normalizarTipo(item.tipo) === tipo));
  const item = lista[index];
  const originalIndex = lancamentos.indexOf(item);
  if (originalIndex >= 0) lancamentos.splice(originalIndex, 1);
  filtrarLancamentos();
}

function calcularResumoContas(lista) {
  return lista.reduce((acc, item) => {
    const aberto = saldoAberto(item);
    const baixado = valorBaixado(item);
    const status = statusOperacional(item);
    acc.aberto += aberto;
    acc.baixado += baixado;
    if (status === "Vencido") acc.vencido += aberto;
    if (aberto > 0 && status !== "Vencido") acc.aVencer += aberto;
    return acc;
  }, { aberto: 0, baixado: 0, vencido: 0, aVencer: 0 });
}

function renderizarContasReceber() {
  const lista = aplicarFiltros(lancamentos.filter(item => normalizarTipo(item.tipo) === "Entrada"));
  const tbody = document.getElementById("tabelaReceber");
  if (!tbody) return;
  tbody.innerHTML = "";

  lista.forEach((item, index) => {
    const status = statusOperacional(item);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatarData(item.data)}</td>
      <td><strong>${item.descricao.replace("Recebimento - ", "")}</strong></td>
      <td>${item.documento || "-"}</td>
      <td>${item.parcela || "-"}</td>
      <td>${formatarMoeda(item.valor)}</td>
      <td class="valor-entrada">${formatarMoeda(valorBaixado(item))}</td>
      <td>${formatarMoeda(saldoAberto(item))}</td>
      <td><span class="badge status ${status.toLowerCase()}">${status}</span></td>
      <td>${item.forma}</td>
      <td class="acoes-conta">
        <button class="btn-acao" onclick="baixarConta('Entrada', ${index})" ${isBaixado(item) ? "disabled" : ""}>Baixar</button>
        <button class="btn-acao danger" onclick="excluirConta('Entrada', ${index})">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const resumo = calcularResumoContas(lista);
  document.getElementById("receberAberto").innerText = formatarMoeda(resumo.aberto);
  document.getElementById("receberBaixado").innerText = formatarMoeda(resumo.baixado);
  document.getElementById("receberVencido").innerText = formatarMoeda(resumo.vencido);
  document.getElementById("receberAVencer").innerText = formatarMoeda(resumo.aVencer);
}

function renderizarContasPagar() {
  const lista = aplicarFiltros(lancamentos.filter(item => normalizarTipo(item.tipo) === "Saida"));
  const tbody = document.getElementById("tabelaPagar");
  if (!tbody) return;
  tbody.innerHTML = "";

  lista.forEach((item, index) => {
    const status = statusOperacional(item);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatarData(item.data)}</td>
      <td><strong>${item.descricao.replace("Pagamento - ", "")}</strong></td>
      <td>${item.documento || "-"}</td>
      <td>${item.categoria || "-"}</td>
      <td>${formatarMoeda(item.valor)}</td>
      <td class="valor-saida">${formatarMoeda(valorBaixado(item))}</td>
      <td>${formatarMoeda(saldoAberto(item))}</td>
      <td><span class="badge status ${status.toLowerCase()}">${status}</span></td>
      <td>${item.forma}</td>
      <td class="acoes-conta">
        <button class="btn-acao" onclick="baixarConta('Saida', ${index})" ${isBaixado(item) ? "disabled" : ""}>Pagar</button>
        <button class="btn-acao danger" onclick="excluirConta('Saida', ${index})">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const resumo = calcularResumoContas(lista);
  document.getElementById("pagarAberto").innerText = formatarMoeda(resumo.aberto);
  document.getElementById("pagarBaixado").innerText = formatarMoeda(resumo.baixado);
  document.getElementById("pagarVencido").innerText = formatarMoeda(resumo.vencido);
  document.getElementById("pagarAVencer").innerText = formatarMoeda(resumo.aVencer);
}

function ativarTab(tabAtiva, conteudoAtivo) {
  ["Detalhado", "Calendario", "Receber", "Pagar"].forEach(nome => {
    document.getElementById(`tab${nome}`)?.classList.toggle("active", nome === tabAtiva);
    document.getElementById(`conteudo${nome}`)?.classList.toggle("hidden", nome !== conteudoAtivo);
  });
}

function mostrarCalendario() {
  ativarTab("Calendario", "Calendario");
}

function mostrarDetalhado() {
  ativarTab("Detalhado", "Detalhado");
}

function mostrarReceber() {
  ativarTab("Receber", "Receber");
  renderizarContasReceber();
}

function mostrarPagar() {
  ativarTab("Pagar", "Pagar");
  renderizarContasPagar();
}

function gerarCalendarioFluxo() {
  const calendario = document.getElementById("calendarioFluxo");
  calendario.innerHTML = "";

  const ultimoDia = new Date(anoAtual, mesAtual + 1, 0).getDate();

  for (let dia = 1; dia <= ultimoDia; dia++) {
    const dataDia = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const saldo = lancamentos
      .filter(item => item.data === dataDia)
      .reduce((acc, item) => normalizarTipo(item.tipo) === "Entrada" ? acc + item.valor : acc - item.valor, 0);

    let classe = "dia-verde";
    if (saldo < 0) classe = "dia-vermelho";
    else if (saldo < 1000) classe = "dia-amarelo";

    calendario.innerHTML += `
      <div class="dia-fluxo ${classe}" onclick="abrirDia(${dia}, ${saldo})">
        <div class="numero-dia">${dia}</div>
        <div class="valor-dia">${formatarMoeda(saldo)}</div>
      </div>
    `;
  }
}

function atualizarTituloMes() {
  document.getElementById("tituloMes").innerText = `${meses[mesAtual]} ${anoAtual}`;
}

function mesAnterior() {
  mesAtual--;
  if (mesAtual < 0) {
    mesAtual = 11;
    anoAtual--;
  }
  atualizarTituloMes();
  gerarCalendarioFluxo();
}

function proximoMes() {
  mesAtual++;
  if (mesAtual > 11) {
    mesAtual = 0;
    anoAtual++;
  }
  atualizarTituloMes();
  gerarCalendarioFluxo();
}

function abrirDia(dia, saldo) {
  document.getElementById("modalDia").classList.add("show");
  const dataDia = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const itensDia = lancamentos.filter(item => item.data === dataDia);
  const entrada = itensDia
    .filter(item => normalizarTipo(item.tipo) === "Entrada")
    .reduce((acc, item) => acc + item.valor, 0);
  const saida = itensDia
    .filter(item => normalizarTipo(item.tipo) === "Saida")
    .reduce((acc, item) => acc + item.valor, 0);

  document.getElementById("modalTituloDia").innerText = `Dia ${dia}/${mesAtual + 1}/${anoAtual}`;
  document.getElementById("modalEntradaDia").innerText = formatarMoeda(entrada);
  document.getElementById("modalSaidaDia").innerText = formatarMoeda(saida);
  document.getElementById("modalSaldoDia").innerText = formatarMoeda(saldo);

  document.getElementById("modalListaDia").innerHTML = itensDia.length
    ? itensDia.map(item => `
      <div class="item-dia">
        <span>${item.descricao}</span>
        <strong class="${normalizarTipo(item.tipo) === "Entrada" ? "valor-entrada" : "valor-saida"}">
          ${normalizarTipo(item.tipo) === "Entrada" ? "+" : "-"} ${formatarMoeda(item.valor)}
        </strong>
      </div>
    `).join("")
    : `<div class="estado-vazio">Nenhum lancamento neste dia.</div>`;
}

function fecharDia() {
  document.getElementById("modalDia").classList.remove("show");
}

async function inicializarFinanceiro() {
  if (financeiroInicializado) return;
  financeiroInicializado = true;

  renderizarTabela(listaAtual);
  atualizarResumo(listaAtual);
  renderizarContasReceber();
  renderizarContasPagar();
  gerarCalendarioFluxo();

  await sincronizarPedidosFinanceiro();
  filtrarLancamentos();
  gerarCalendarioFluxo();
  window.finalizarCarregamentoModulo?.();
}

window.filtrarLancamentos = filtrarLancamentos;
window.abrirModal = abrirModal;
window.abrirModalReceber = abrirModalReceber;
window.abrirModalPagar = abrirModalPagar;
window.fecharModal = fecharModal;
window.salvarLancamento = salvarLancamento;
window.baixarLancamento = baixarLancamento;
window.baixarConta = baixarConta;
window.excluirConta = excluirConta;
window.mostrarCalendario = mostrarCalendario;
window.mostrarDetalhado = mostrarDetalhado;
window.mostrarReceber = mostrarReceber;
window.mostrarPagar = mostrarPagar;
window.mesAnterior = mesAnterior;
window.proximoMes = proximoMes;
window.abrirDia = abrirDia;
window.fecharDia = fecharDia;

window.__activeModuleDestroy = function financeiroDestroy(){
  delete window.filtrarLancamentos;
  delete window.abrirModal;
  delete window.abrirModalReceber;
  delete window.abrirModalPagar;
  delete window.fecharModal;
  delete window.salvarLancamento;
  delete window.baixarLancamento;
  delete window.baixarConta;
  delete window.excluirConta;
  delete window.mostrarCalendario;
  delete window.mostrarDetalhado;
  delete window.mostrarReceber;
  delete window.mostrarPagar;
  delete window.mesAnterior;
  delete window.proximoMes;
  delete window.abrirDia;
  delete window.fecharDia;
};

window.__moduleInit = inicializarFinanceiro;
inicializarFinanceiro();
})();
