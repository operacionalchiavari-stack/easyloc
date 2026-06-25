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

function normalizarObservacoes(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function statusPago(status) {
  const normalized = String(status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return ["pago", "recebido", "quitado", "liquidado", "baixado"].includes(normalized);
}

function statusCancelado(status) {
  return String(status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim() === "cancelado";
}

function statusLancamentoParcela(status) {
  if (statusPago(status)) return "Recebido";
  if (statusCancelado(status)) return "Cancelado";
  return "Pendente";
}

function numeroMoeda(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const parsed = String(value)
    .replace("R$", "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return Math.max(0, Number(parsed) || 0);
}

function valorRecebidoParcela(parcela) {
  if (!parcela) return 0;
  const baixado = numeroMoeda(parcela.baixado);
  const valorRecebido = numeroMoeda(parcela.valor_recebido);
  const recebido = numeroMoeda(parcela.recebido);
  if (baixado > 0) return baixado;
  if (valorRecebido > 0) return valorRecebido;
  if (recebido > 0) return recebido;
  return statusPago(parcela.status) ? numeroMoeda(parcela.valor) : 0;
}

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
  const valor = numeroMoeda(pedido.valor_total || pedido.total || pedido.valor || 0);
  const observacoes = normalizarObservacoes(pedido.observacoes);
  const data = normalizarDataISO(pedido.data_entrega)
    || normalizarDataISO(pedido.data_evento)
    || normalizarDataISO(pedido.data_hora)
    || HOJE;
  const parcelas = Array.isArray(observacoes.parcelas_financeiras)
    ? observacoes.parcelas_financeiras
    : [];

  if (parcelas.length) {
    return parcelas
      .filter((parcela) => numeroMoeda(parcela.valor) > 0)
      .map((parcela, index) => ({
        data: normalizarDataISO(parcela.vencimento) || data,
        descricao: `Recebimento - ${pedido.cliente_nome || "Cliente nao informado"}`,
        categoria: "Eventos",
        tipo: "Entrada",
        valor: numeroMoeda(parcela.valor),
        baixado: valorRecebidoParcela(parcela),
        status: statusLancamentoParcela(parcela.status),
        forma: parcela.metodo || "A combinar",
        documento: `PED-${String(pedido.numero_pedido || pedido.id || "").replace("#", "")}`,
        parcela: parcela.tipo || `Parcela ${index + 1}`,
        origem: "pedido",
        pedido_id: pedido.id,
        cliente_id: pedido.cliente_id || null,
        cliente_nome: pedido.cliente_nome || "Cliente nao informado",
        contato_cliente: pedido.contato_cliente || "",
        parcela_index: index,
        parcela_numero: parcela.numero || index + 1
      }));
  }

  const recebido = numeroMoeda(observacoes.valor_recebido || observacoes.total_recebido || 0);
  const status = statusPago(observacoes.status_financeiro || observacoes.pagamento_status)
    ? "Recebido"
    : recebido > 0 ? "Parcial" : "Pendente";

  return [{
    data,
    descricao: `Recebimento - ${pedido.cliente_nome || "Cliente nao informado"}`,
    categoria: "Eventos",
    tipo: "Entrada",
    valor,
    baixado: recebido,
    status,
    forma: "A combinar",
    documento: `PED-${String(pedido.numero_pedido || pedido.id || "").replace("#", "")}`,
    parcela: "Pedido",
    origem: "pedido",
    pedido_id: pedido.id,
    cliente_id: pedido.cliente_id || null,
    cliente_nome: pedido.cliente_nome || "Cliente nao informado",
    contato_cliente: pedido.contato_cliente || ""
  }];
}

async function sincronizarPedidosFinanceiro() {
  const supabase = window.supabaseClient;
  const empresaId = window.__CONTEXT?.empresa_id;
  if (!supabase || !empresaId) return;

  try {
    const { data, error } = await supabase
      .from("separacoes_pedidos")
      .select("id,numero_pedido,cliente_id,cliente_nome,contato_cliente,data_evento,data_entrega,data_hora,valor_total,status_comercial,observacoes")
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

function localizarParcela(parcelas, item) {
  if (!Array.isArray(parcelas) || !parcelas.length) return -1;
  if (Number.isInteger(item.parcela_index) && parcelas[item.parcela_index]) return item.parcela_index;

  const numero = String(item.parcela_numero || "").trim();
  const tipo = String(item.parcela || "").trim().toLowerCase();
  const vencimento = normalizarDataISO(item.data);
  const valor = numeroMoeda(item.valor);

  return parcelas.findIndex((parcela) => {
    const mesmoNumero = numero && String(parcela.numero || "").trim() === numero;
    const mesmoTipo = tipo && String(parcela.tipo || "").trim().toLowerCase() === tipo;
    const mesmoVencimento = vencimento && normalizarDataISO(parcela.vencimento) === vencimento;
    const mesmoValor = Math.abs(numeroMoeda(parcela.valor) - valor) < 0.01;
    return mesmoNumero || (mesmoTipo && (mesmoVencimento || mesmoValor));
  });
}

function resumoFinanceiroObservacoes(observacoes, valorTotal, item) {
  const parcelas = Array.isArray(observacoes.parcelas_financeiras)
    ? observacoes.parcelas_financeiras
    : [];

  const recebidoParcelas = parcelas.reduce((sum, parcela) => sum + valorRecebidoParcela(parcela), 0);
  const recebidoFallback = numeroMoeda(observacoes.valor_recebido || observacoes.total_recebido || 0);
  const recebidoItem = item?.origem === "pedido" && !parcelas.length ? numeroMoeda(item.valor) : 0;
  const total = numeroMoeda(valorTotal);
  const recebido = Math.min(total, recebidoParcelas || recebidoFallback || recebidoItem);
  const status = recebido >= total && total > 0
    ? "Recebido"
    : recebido > 0 ? "Parcial" : "Pendente";

  return { recebido, status };
}

async function registrarBaixaPedido(item) {
  if (!item || item.origem !== "pedido" || !item.pedido_id || normalizarTipo(item.tipo) !== "Entrada") return;

  const supabase = window.supabaseClient;
  const empresaId = window.__CONTEXT?.empresa_id;
  if (!supabase || !empresaId) return;

  const { data: pedido, error } = await supabase
    .from("separacoes_pedidos")
    .select("id,valor_total,observacoes")
    .eq("empresa_id", empresaId)
    .eq("id", item.pedido_id)
    .maybeSingle();

  if (error) throw error;
  if (!pedido) throw new Error("Pedido nao encontrado para registrar baixa.");

  const observacoes = normalizarObservacoes(pedido.observacoes);
  const parcelas = Array.isArray(observacoes.parcelas_financeiras)
    ? observacoes.parcelas_financeiras.map((parcela) => ({ ...parcela }))
    : [];
  const now = new Date().toISOString();

  if (parcelas.length) {
    const index = localizarParcela(parcelas, item);
    if (index < 0) throw new Error("Parcela do pedido nao encontrada para baixa.");
    parcelas[index] = {
      ...parcelas[index],
      status: "Recebido",
        valor_recebido: numeroMoeda(parcelas[index].valor || item.valor || 0),
        baixado: numeroMoeda(parcelas[index].valor || item.valor || 0),
      baixado_em: now
    };
    observacoes.parcelas_financeiras = parcelas;
  }

  const resumo = resumoFinanceiroObservacoes(observacoes, pedido.valor_total || item.valor, item);
  const nextObservacoes = {
    ...observacoes,
    valor_recebido: resumo.recebido,
    total_recebido: resumo.recebido,
    status_financeiro: resumo.status,
    financeiro_atualizado_em: now
  };

  const { error: updateError } = await supabase
    .from("separacoes_pedidos")
    .update({ observacoes: nextObservacoes })
    .eq("empresa_id", empresaId)
    .eq("id", item.pedido_id);

  if (updateError) throw updateError;

  item.pedido_baixa_sincronizada = true;
  item.baixado_em = now;

  const eventPayload = {
    pedido_id: item.pedido_id,
    atualizado_em: now
  };
  try {
    localStorage.setItem("easyloc:pedido-financeiro-atualizado", JSON.stringify(eventPayload));
  } catch {}
  window.dispatchEvent(new CustomEvent("easyloc:pedido-financeiro-atualizado", { detail: eventPayload }));
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

async function concluirBaixa(item, tipoOperacao = "") {
  if (!item) return;
  const anterior = {
    baixado: item.baixado,
    status: item.status,
    baixado_em: item.baixado_em,
    pedido_baixa_sincronizada: item.pedido_baixa_sincronizada
  };
  const tipo = tipoOperacao || normalizarTipo(item.tipo);

  item.baixado = item.valor;
  item.status = tipo === "Entrada" ? "Recebido" : "Pago";
  filtrarLancamentos();

  try {
    await registrarBaixaPedido(item);
    filtrarLancamentos();
  } catch (error) {
    console.error("Nao foi possivel registrar baixa do pedido:", error);
    item.baixado = anterior.baixado;
    item.status = anterior.status;
    item.baixado_em = anterior.baixado_em;
    item.pedido_baixa_sincronizada = anterior.pedido_baixa_sincronizada;
    filtrarLancamentos();
    if (typeof window.alerta === "function") {
      window.alerta("Nao foi possivel salvar a baixa no pedido. Tente novamente.", "Financeiro", "erro");
    } else {
      alert("Nao foi possivel salvar a baixa no pedido. Tente novamente.");
    }
  }
}

async function baixarLancamento(index) {
  const item = listaAtual[index];
  if (!item) return;
  await concluirBaixa(item);
}

async function baixarConta(tipo, index) {
  const lista = aplicarFiltros(lancamentos.filter(item => normalizarTipo(item.tipo) === tipo));
  const item = lista[index];
  if (!item) return;
  await concluirBaixa(item, tipo);
}

function abrirPixContaReceber(index) {
  const lista = aplicarFiltros(lancamentos.filter(item => normalizarTipo(item.tipo) === "Entrada"));
  const item = lista[index];
  if (!item) return;

  if (!window.EasyLocPix?.open) {
    if (typeof window.alerta === "function") {
      window.alerta("Fluxo PIX indisponivel neste momento.", "PIX", "erro");
    } else {
      alert("Fluxo PIX indisponivel neste momento.");
    }
    return;
  }

  const cliente = item.cliente_nome || String(item.descricao || "").replace("Recebimento - ", "") || "Cliente nao informado";
  const numeroPedido = String(item.documento || "").replace(/^PED-/i, "");

  window.EasyLocPix.open({
    source: "contas_receber",
    pedidoId: item.pedido_id || null,
    numeroPedido,
    clienteId: item.cliente_id || null,
    cliente,
    contato: item.contato_cliente || item.telefone || "",
    parcelaIndex: Number.isInteger(item.parcela_index) ? item.parcela_index : null,
    parcelaNumero: item.parcela_numero || "",
    parcelaLabel: item.parcela || "Pedido",
    valor: saldoAberto(item) || item.valor || 0,
    vencimento: item.data,
    gateway: "mercado_pago"
  });
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
        <button class="btn-acao pix" onclick="abrirPixContaReceber(${index})" title="Gerar PIX" aria-label="Gerar PIX">
          <i data-lucide="qr-code"></i>
        </button>
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
  window.lucide?.createIcons?.();
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

  if (window.__financeiroPixHandler) {
    window.removeEventListener("easyloc:pix-atualizado", window.__financeiroPixHandler);
    window.removeEventListener("easyloc:pedido-financeiro-atualizado", window.__financeiroPixHandler);
  }
  window.__financeiroPixHandler = async () => {
    await sincronizarPedidosFinanceiro();
    filtrarLancamentos();
    gerarCalendarioFluxo();
  };
  window.addEventListener("easyloc:pix-atualizado", window.__financeiroPixHandler);
  window.addEventListener("easyloc:pedido-financeiro-atualizado", window.__financeiroPixHandler);

  if (window.__financeiroRealtimeChannel && window.supabaseClient?.removeChannel) {
    window.supabaseClient.removeChannel(window.__financeiroRealtimeChannel);
    window.__financeiroRealtimeChannel = null;
  }
  if (window.supabaseClient?.channel && window.__CONTEXT?.empresa_id) {
    window.__financeiroRealtimeChannel = window.supabaseClient
      .channel(`financeiro-pedidos-${window.__CONTEXT.empresa_id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "separacoes_pedidos",
        filter: `empresa_id=eq.${window.__CONTEXT.empresa_id}`
      }, window.__financeiroPixHandler)
      .subscribe();
  }
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
window.abrirPixContaReceber = abrirPixContaReceber;
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
  if (window.__financeiroPixHandler) {
    window.removeEventListener("easyloc:pix-atualizado", window.__financeiroPixHandler);
    window.removeEventListener("easyloc:pedido-financeiro-atualizado", window.__financeiroPixHandler);
    delete window.__financeiroPixHandler;
  }
  if (window.__financeiroRealtimeChannel && window.supabaseClient?.removeChannel) {
    window.supabaseClient.removeChannel(window.__financeiroRealtimeChannel);
    delete window.__financeiroRealtimeChannel;
  }
  delete window.filtrarLancamentos;
  delete window.abrirModal;
  delete window.abrirModalReceber;
  delete window.abrirModalPagar;
  delete window.fecharModal;
  delete window.salvarLancamento;
  delete window.baixarLancamento;
  delete window.baixarConta;
  delete window.abrirPixContaReceber;
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
