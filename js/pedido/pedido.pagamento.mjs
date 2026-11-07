import { iniciarSaldoClientePedido } from './pedido.saldo-cliente.mjs';
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

  const saldoContaCliente = iniciarSaldoClientePedido();

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
    // parcela com recebimento no Financeiro: quem manda é a conta a receber
    if(row?.dataset.travada) return Number(row.dataset.finAberto) <= 0.005 ? { key: "paid", label: "Pago" } : { key: "partial", label: "Pago em parte" };
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
    row.classList.remove("is-paid", "is-partial", "is-open", "is-overdue", "is-programmed", "is-canceled");
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

  /* Programação separada por divisão (out/2026): Locação, Frete e Montagem têm parcelas próprias, como nas contas a
     receber do Financeiro (cada parcela vira uma conta daquela divisão). Na tabela, cada divisão abre com uma linha de
     título (tr.pg-grupo) e as parcelas são tr.pg-linha com data-componente. */
  const COMPONENTES = [["locacao", "Locação"], ["frete", "Frete"], ["montagem", "Montagem"]];
  const rotuloComponente = (comp) => (COMPONENTES.find(([k]) => k === comp) || COMPONENTES[0])[1];
  const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const linhasParcela = (comp) => Array.from(tbody.querySelectorAll(comp ? `tr.pg-linha[data-componente="${comp}"]` : "tr.pg-linha"));

  // Valor de cada divisão; descontos, BV e créditos abatem primeiro da locação, depois do frete e da montagem.
  const valoresPorComponente = () => {
    const { totalPedido, totalDescontos, totalCreditos, valorFinal } = calcularTotais();
    const v = window.__PEDIDO_VALORES;
    if(!v) return { locacao: valorFinal, frete: 0, montagem: 0 };
    const brutos = { locacao: Number(v.locacao) || 0, frete: Number(v.frete) || 0, montagem: Number(v.montagem) || 0 };
    const soma = brutos.locacao + brutos.frete + brutos.montagem;
    if(Math.abs(soma - totalPedido) > 0.01) brutos.locacao = Math.max(0, totalPedido - brutos.frete - brutos.montagem);
    let abater = totalDescontos + totalCreditos;
    const r = {};
    COMPONENTES.forEach(([k]) => { const parte = Math.min(Math.max(brutos[k], 0), abater); r[k] = centavos(Math.max(brutos[k], 0) - parte); abater -= parte; });
    return r;
  };

  const criarGrupo = (comp) => {
    const tr = document.createElement("header");
    tr.className = "pg-grupo";
    tr.dataset.componente = comp;
    tr.innerHTML = `
        <div class="pg-grupo-head">
          <span class="pg-grupo-chip ${comp}">${rotuloComponente(comp)}</span>
          <span class="pg-grupo-total">Valor <strong data-pg-grupo-valor>R$ 0,00</strong></span>
          <span class="pg-grupo-falta" data-pg-grupo-falta></span>
          <button type="button" class="pg-grupo-add" data-pg-add="${comp}"><i data-lucide="plus"></i> Parcela</button>
        </div>
      `;
    return tr;
  };

  const criarCard = comp => {
    const card=document.createElement('section');
    card.className='pg-componente-card';card.dataset.componente=comp;
    card.setAttribute('aria-label','Parcelas de '+rotuloComponente(comp));
    card.append(criarGrupo(comp));
    const tabela=document.createElement('div');tabela.className='pg-card-tabela';
    tabela.innerHTML='<table class="cronograma-table"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Forma</th><th>Cobrança</th><th>Ações</th></tr></thead><tbody data-pg-linhas="'+comp+'"></tbody></table>';
    card.append(tabela);
    const vazio=document.createElement('p');vazio.className='pg-card-vazio';vazio.textContent='Nenhuma parcela programada.';card.append(vazio);
    return card;
  };
  const ORDEM_CARDS=['locacao','montagem','frete'];
  const montarTabela = (parcelas) => {
    tbody.innerHTML = "";
    ORDEM_CARDS.forEach(comp => {
      const doGrupo = parcelas.filter((p) => (p.componente || "locacao") === comp);
      const card=criarCard(comp);tbody.appendChild(card);
      doGrupo.forEach((p) => card.querySelector('[data-pg-linhas]').appendChild(criarLinha({ ...p, componente: comp })));
    });
  };

  const garantirGrupos = () => {
    ORDEM_CARDS.forEach((comp,i) => {
      if(tbody.querySelector(`.pg-componente-card[data-componente="${comp}"]`))return;
      const depois=ORDEM_CARDS.slice(i+1).map(c=>tbody.querySelector(`.pg-componente-card[data-componente="${c}"]`)).find(Boolean);
      tbody.insertBefore(criarCard(comp),depois || null);
    });
  };

  const atualizarTodasLinhas = () => {
    linhasParcela().forEach(atualizarLinhaVisual);
  };

  const atualizarSequencia = () => {
    linhasParcela().forEach((row, index) => {
      const numeroEl = row.querySelector(".pg-numero");
      if(numeroEl) numeroEl.textContent = String(index + 1);
    });
    COMPONENTES.forEach(([comp]) => {
      const rows = linhasParcela(comp);
      rows.forEach((row, index) => {
        const posEl = row.querySelector(".pg-parcela-pos");
        if(posEl) posEl.textContent = `${index + 1} de ${rows.length}`;
      });
    });
  };

  const atualizarGrupos = () => {
    const valores = valoresPorComponente();
    tbody.querySelectorAll(".pg-grupo").forEach((grupo) => {
      const comp = grupo.dataset.componente;
      const programado = linhasParcela(comp).reduce((s, row) => s + valorDaLinha(row), 0);
      const dif = centavos((valores[comp] || 0) - programado);
      const valorEl = grupo.querySelector("[data-pg-grupo-valor]");
      const faltaEl = grupo.querySelector("[data-pg-grupo-falta]");
      grupo.closest('.pg-componente-card').querySelector('.pg-card-vazio').hidden=linhasParcela(comp).length>0;
      if(valorEl) valorEl.textContent = formatCurrency(valores[comp] || 0);
      if(faltaEl){
        // Nov/2026: frete zerado por falta de distância não é "Distribuído" (teste do usuário final, item 2).
        const freteSemCalculo = comp === "frete" && !(Number(valores.frete) > 0) && Number(window.volumeTotalPedido || 0) > 0
          && !(Number(window.kmPedido || 0) > 0) && window.__PEDIDO_LOGISTICA_MANUAL?.frete == null;
        faltaEl.textContent = freteSemCalculo ? "Frete não calculado" : Math.abs(dif) < 0.01 ? "Distribuído" : dif > 0 ? `Falta distribuir ${formatCurrency(dif)}` : `Passou ${formatCurrency(-dif)}`;
        faltaEl.className = "pg-grupo-falta " + (!freteSemCalculo && Math.abs(dif) < 0.01 ? "ok" : "pendente");
      }
    });
  };

  const criarLinha = ({ numero, tipo, vencimento, valor, metodo, status = "Programado", recebido = "", componente = "locacao" }) => {
    const tr = document.createElement("tr");
    tr.className = "pg-linha";
    tr.dataset.componente = componente;
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
        </div>
      </td>
    `;
    atualizarLinhaVisual(tr);
    return tr;
  };

  /* Parcela paga (out/2026): a situação vem das contas a receber (recebimento pela conciliação, caixa ou link do pedido).
     Com qualquer recebimento a parcela fica travada: o Financeiro não muda mais o valor nem o vencimento dela, e a posição
     dentro da divisão é o que liga a linha à conta a receber. O banco confere de novo ao salvar. */
  let titulosFin = [];
  const dadosDaLinha = (row) => ({
    tipo: row.querySelector(".pg-parcela-label")?.textContent?.trim() || "Parcela",
    vencimento: row.querySelector(".pg-vencimento")?.value || "", valor: valorDaLinha(row),
    metodo: row.querySelector(".pg-metodo")?.value || "PIX", status: row.querySelector(".pg-status")?.value || "Programado",
    recebido: row.dataset.recebido ?? "", componente: row.dataset.componente || "locacao"
  });
  const divisaoTravada = (comp) => linhasParcela(comp).some((row) => row.dataset.travada);
  const marcarPagas = () => {
    COMPONENTES.forEach(([comp]) => {
      const titulos = titulosFin.filter((t) => t.componente === comp);
      const pagos = titulos.filter((t) => Number(t.recebido) > 0);
      if(!pagos.length) return;
      const ultima = Math.max(...pagos.map((t) => t.parcela));
      garantirGrupos();
      const destino = tbody.querySelector(`.pg-componente-card[data-componente="${comp}"] [data-pg-linhas]`);
      for(let n = linhasParcela(comp).length + 1; n <= ultima; n += 1){
        const t = titulos.find((x) => x.parcela === n);
        if(t) destino?.appendChild(criarLinha({ tipo: `Parcela ${n}`, vencimento: t.vencimento, valor: Number(t.valor), metodo: t.forma || "PIX", componente: comp }));
      }
      const rows = linhasParcela(comp);
      rows.forEach((row, i) => {
        const t = pagos.find((x) => x.parcela === i + 1);
        // tirar uma parcela antes de uma paga mudaria a posição da paga
        const remover = row.querySelector('[data-pg-action="remove"]');
        if(remover) remover.hidden = i + 1 < ultima || Boolean(t);
        if(!t) return;
        row.dataset.travada = "1";
        row.dataset.finAberto = String(t.aberto);
        row.classList.add("pg-travada");
        row.title = "Parcela com recebimento no Financeiro: não pode ser alterada.";
        const venc = row.querySelector(".pg-vencimento"), valor = row.querySelector(".pg-valor"), metodo = row.querySelector(".pg-metodo");
        if(venc){ venc.value = t.vencimento; venc.disabled = true; }
        if(valor){ valor.textContent = formatCurrency(Number(t.valor)); valor.contentEditable = "false"; }
        if(metodo) metodo.disabled = true;
        row.querySelector("[data-cobranca-parcela]")?.setAttribute("hidden", "");
        row.querySelector('[data-pg-action="edit"]')?.setAttribute("hidden", "");
        atualizarLinhaVisual(row);
      });
    });
  };
  const carregarTitulos = async () => {
    const pedido = window.__PEDIDO_ATUAL_ID;
    if(!pedido || !window.supabaseClient) return;
    const { data, error } = await window.supabaseClient.from("fin_receber").select("componente,parcela,valor,recebido,aberto,vencimento,forma,status")
      .eq("pedido_id", pedido).eq("origem", "pedido").neq("status", "cancelado");
    if(error){ console.warn("Parcelas pagas:", error.message); return; }
    titulosFin = data || [];
    marcarPagas();
    atualizarSequencia();
    atualizarResumo();
    refreshIcons();
  };
  document.addEventListener("visibilitychange", () => { if(!document.hidden) carregarTitulos(); });

  const abrirCobrancaParcela = (button) => {
    const tr = button?.closest("tr");
    const rows = linhasParcela();
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
    const parcelaLabel = rotuloComponente(tr?.dataset.componente) + " · " + (tr?.querySelector(".pg-parcela-label")?.textContent?.trim() || `Parcela ${index + 1}`);
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
        status: row.querySelector(".pg-status")?.value || "Pendente",
        componente: row.dataset.componente || "locacao"
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

  const somarProgramado = () => linhasParcela().reduce((total, row) => total + valorDaLinha(row), 0);

  const atualizarResumo = () => {
    atualizarTodasLinhas();
    const totais = calcularTotais();
    const totalProgramado = somarProgramado();
    const diferenca = totais.valorFinal - totalProgramado;
    const faltaDistribuir = Math.max(0, diferenca);

    if(totalContratoEl) totalContratoEl.innerText = formatCurrency(totais.totalPedido);
    if(totalDescontosEl) totalDescontosEl.innerText = formatCurrency(totais.totalDescontos);
    if(totalCreditosEl) totalCreditosEl.innerText = formatCurrency(totais.totalCreditos);
    if(valorFinalEl) valorFinalEl.innerText = formatCurrency(totais.valorFinal);
    if(totalProgramadoEl) totalProgramadoEl.innerText = formatCurrency(totalProgramado);
    if(diferencaEl) diferencaEl.innerText = formatCurrency(diferenca);
    if(resumoFaltaDistribuirEl) resumoFaltaDistribuirEl.innerText = formatCurrency(faltaDistribuir);
    saldoContaCliente.atualizar();

    atualizarGrupos();
  };

  // Mesmo plano (entrada + N parcelas) para cada divisão, cada uma sobre o próprio valor.
  const planoDaDivisao = (comp, valor, entradaTotal, valorFinal) => {
    const qtdParcelas = Math.max(0, Number(parcelasEl?.value || 0));
    const metodo = metodoEl?.value || "PIX";
    const vencEntrada = dataEntradaEl?.value || new Date().toLocaleDateString("sv-SE");
    const diaFixo = diaFixoEl?.value || "";
    const entrada = valorFinal > 0 ? Math.min(centavos(entradaTotal * valor / valorFinal), valor) : 0;
    const lista = [];
    let restante = valor;
    if(entrada > 0){
      lista.push({ tipo: "Entrada", vencimento: vencEntrada, valor: entrada, metodo, componente: comp });
      restante = centavos(restante - entrada);
    }
    const qtd = qtdParcelas > 0 ? qtdParcelas : (restante > 0 ? 1 : 0);
    if(qtd > 0 && restante > 0){
      const base = centavos(restante / qtd);
      for(let index = 0; index < qtd; index += 1){
        const v = index === qtd - 1 ? centavos(restante - base * (qtd - 1)) : base;
        lista.push({ tipo: `Parcela ${index + 1}`, vencimento: addMonths(vencEntrada, index, diaFixo), valor: v, metodo, componente: comp });
      }
    }
    return lista;
  };

  const gerarParcelas = () => {
    cronogramaManual = false;
    const { valorFinal } = calcularTotais();
    const valores = valoresPorComponente();
    const entradaTotal = Math.min(moneyValue(entradaEl), valorFinal);
    // divisão com parcela paga fica como está: o plano automático não pode refazer o que já foi recebido
    const parcelas = COMPONENTES.flatMap(([comp]) => divisaoTravada(comp) ? linhasParcela(comp).map(dadosDaLinha)
      : valores[comp] > 0 ? planoDaDivisao(comp, valores[comp], entradaTotal, valorFinal) : []);
    montarTabela(parcelas);
    marcarPagas();
    atualizarSequencia();
    atualizarResumo();
    refreshIcons();
  };

  // "+ Parcela" numa divisão: entra com o que falta distribuir dela, um mês depois da última.
  const adicionarParcela = (comp, { focar = true } = {}) => {
    cronogramaManual = true;
    garantirGrupos();
    const grupo = tbody.querySelector(`.pg-grupo[data-componente="${comp}"]`);
    if(!grupo) return;
    const rows = linhasParcela(comp);
    const ultima = rows.at(-1);
    const programado = rows.reduce((s, row) => s + valorDaLinha(row), 0);
    const falta = Math.max(0, centavos((valoresPorComponente()[comp] || 0) - programado));
    const venc = ultima?.querySelector(".pg-vencimento")?.value ? addMonths(ultima.querySelector(".pg-vencimento").value, 1, "") : (dataEntradaEl?.value || new Date().toLocaleDateString("sv-SE"));
    const nova = criarLinha({ tipo: `Parcela ${rows.length + 1}`, vencimento: venc, valor: falta, metodo: ultima?.querySelector(".pg-metodo")?.value || metodoEl?.value || "PIX", componente: comp });
    grupo.closest('.pg-componente-card').querySelector('[data-pg-linhas]').appendChild(nova);
    atualizarSequencia();
    atualizarResumo();
    refreshIcons();
    if(focar) nova.querySelector(".pg-vencimento")?.focus();
  };

  const limparProgramacao = () => {
    cronogramaManual = true;
    montarTabela(COMPONENTES.flatMap(([comp]) => divisaoTravada(comp) ? linhasParcela(comp).map(dadosDaLinha) : []));
    marcarPagas();
    atualizarSequencia();
    atualizarResumo();
    refreshIcons();
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

  // Pedido salvo antes da divisão: cada parcela vira uma por divisão, na mesma proporção que o Financeiro já usava
  // (locação/frete/montagem do pedido salvo), mantendo a numeração — as contas a receber já existentes continuam as mesmas.
  const dividirParcelasAntigas = (lidas) => {
    const obs = window.__PEDIDO_DADOS_ATUAL?.observacoes || {};
    const moeda = (t) => Number(String(t || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
    let frete = 0, montagem = 0, total = Number(window.__PEDIDO_DADOS_ATUAL?.valor_total) || 0;
    if(obs.valores && typeof obs.valores === "object"){
      frete = Number(obs.valores.frete) || 0; montagem = Number(obs.valores.montagem) || 0;
      total = Number(obs.valores.total) || total || (Number(obs.valores.locacao) || 0) + frete + montagem;
    }else if(obs.logistica_snapshot){
      frete = moeda(obs.logistica_snapshot.resumoFrete); montagem = moeda(obs.logistica_snapshot.resumoMontagem);
    }
    if(!(total > 0) || frete + montagem <= 0) return lidas.map((p) => ({ ...p, componente: "locacao" }));
    frete = Math.min(frete, total); montagem = Math.min(montagem, total - frete);
    const locacao = total - frete - montagem;
    const saida = [];
    for(const p of lidas){
      const pl = centavos(p.valor * locacao / total), pf = centavos(p.valor * frete / total), pm = centavos(p.valor - pl - pf);
      const rec = Number(p.recebido) || 0;
      [["locacao", pl], ["frete", pf], ["montagem", pm]].forEach(([comp, v]) => {
        if(v > 0) saida.push({ ...p, componente: comp, valor: v, recebido: rec > 0 && p.valor > 0 ? centavos(rec * v / p.valor) : p.recebido });
      });
    }
    return saida;
  };

  const aplicarConfig = (config = {}, parcelas = []) => {
    carregarTitulos();
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
      const lidas = parcelas.map((parcela, index) => ({
        numero: parcela.numero || index + 1,
        tipo: parcela.tipo || (index === 0 ? "Entrada" : `Parcela ${index}`),
        vencimento: parcela.vencimento || "",
        valor: typeof parcela.valor === "number" ? parcela.valor : moneyValue({ value: parcela.valor }),
        metodo: parcela.metodo || metodoEl?.value || "PIX",
        status: parcela.status || "Programado",
        recebido: parcela.recebido ?? parcela.valor_recebido ?? "",
        componente: parcela.componente
      }));
      montarTabela(lidas.some((p) => COMPONENTES.some(([k]) => k === p.componente)) ? lidas : dividirParcelasAntigas(lidas));
      marcarPagas();
      atualizarSequencia();
      atualizarResumo();
      refreshIcons();
      return;
    }

    cronogramaManual = false;
    gerarParcelas();
  };

  const atualizarPagamentoPorTotal = () => {
    if(cronogramaManual && tbody.querySelector("tr.pg-linha")){
      garantirGrupos();
      // Nov/2026 (teste do usuário final, item 21): divisão que passou a ter valor (ex.: o frete, depois de escolher
      // o local) e não tem nenhuma parcela ganha uma, com o valor todo, como as outras divisões já têm.
      const valores = valoresPorComponente();
      COMPONENTES.forEach(([comp]) => { if(valores[comp] > 0 && !linhasParcela(comp).length) adicionarParcela(comp, { focar: false }); });
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
    const row = event.target.closest("tr.pg-linha");
    if(row?.dataset.travada) return;
    if(row) {
      cronogramaManual = true;
      if(event.target.closest(".pg-valor")) row.dataset.recebido = "";
      atualizarLinhaVisual(row);
    }
    atualizarResumo();
  });
  tbody.addEventListener("change", (event) => {
    const row = event.target.closest("tr.pg-linha");
    if(row) {
      cronogramaManual = true;
      atualizarLinhaVisual(row);
    }
    atualizarResumo();
  });
  tbody.addEventListener("click", (event) => {
    const cobrancaButton = event.target.closest("[data-cobranca-parcela]");
    const actionButton = event.target.closest("[data-pg-action]");
    const addButton = event.target.closest("[data-pg-add]");
    const row = event.target.closest("tr.pg-linha");

    if(addButton) {
      adicionarParcela(addButton.dataset.pgAdd);
      return;
    }

    if(cobrancaButton) {
      abrirCobrancaParcela(cobrancaButton);
      return;
    }

    if(!actionButton || !row || row.dataset.travada) return;

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

  // Condição de pagamento escolhida pelo decorador no catálogo (nov/2026): fica em projeto_comercial.dados.pagamento.
  // Aparece no topo do Financeiro do pedido; "Aplicar esta condição" gera as parcelas de cada divisão
  // (entrada % + N parcelas mensais) e puxa para a data limite as que passariam de "X dias antes do evento".
  const condicaoCatalogo = () => window.__pedidoProjetoComercial?.dados?.pagamento || null;
  const aplicarCondicaoCatalogo = () => {
    const c = condicaoCatalogo();
    if(!c) return;
    if(COMPONENTES.some(([comp]) => divisaoTravada(comp))){ window.alerta?.("Há parcela recebida neste pedido: ajuste as parcelas à mão.", "Condição do catálogo", "aviso"); return; }
    const { valorFinal } = calcularTotais();
    const hoje = new Date().toLocaleDateString("sv-SE");
    if(metodoEl && c.forma) metodoEl.value = c.forma;
    if(entradaEl) entradaEl.value = centavos(valorFinal * (Number(c.entrada_pct) || 0) / 100);
    if(parcelasEl) parcelasEl.value = Number(c.entrada_pct) >= 100 ? 0 : Math.max(1, Number(c.parcelas) || 1);
    if(dataEntradaEl) dataEntradaEl.value = hoje;
    if(diaFixoEl) diaFixoEl.value = "";
    gerarParcelas();
    const evento = document.getElementById("dataEvento")?.value;
    if(evento && c.quitar_dias_antes != null){
      const lim = new Date(evento + "T12:00:00"); lim.setDate(lim.getDate() - Number(c.quitar_dias_antes));
      const limite = lim.toLocaleDateString("sv-SE") < hoje ? hoje : lim.toLocaleDateString("sv-SE");
      tbody.querySelectorAll(".pg-vencimento").forEach((inp) => { if(inp.value && inp.value > limite) inp.value = limite; });
      atualizarResumo();
    }
    mostrarCondicaoCatalogo(true);
  };
  const mostrarCondicaoCatalogo = (aplicada) => {
    const c = condicaoCatalogo(), card = document.querySelector(".pagamento-card");
    let box = document.getElementById("pgCondicaoCatalogo");
    if(!c || !card){ box?.remove(); return; }
    if(!box){ box = document.createElement("div"); box.id = "pgCondicaoCatalogo"; box.className = "pg-condicao-catalogo"; card.prepend(box); }
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    box.innerHTML = '<div><small>Condição escolhida pelo decorador no catálogo</small><b>' + esc(c.nome) + '</b><span>' + esc(c.resumo || "") + '</span></div>' +
      '<button type="button" class="pg-condicao-aplicar">' + (aplicada ? "✓ Aplicada · aplicar de novo" : "Aplicar esta condição") + '</button>';
    box.querySelector("button").onclick = aplicarCondicaoCatalogo;
  };
  window.__pedidoMostrarCondicaoCatalogo = mostrarCondicaoCatalogo;

  gerarParcelas();
  refreshIcons();
}
