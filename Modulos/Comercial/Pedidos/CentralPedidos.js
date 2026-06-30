(function(){
  const state = {
    pedidos: [],
    filtrados: [],
    supabase: null,
    empresaId: null,
    whatsappPedido: null,
    onFinanceiroAtualizado: null,
    onPixAtualizado: null,
    onStorageFinanceiroAtualizado: null,
    realtimeChannel: null
  };

  const els = {};
  const MISSING_SEPARACAO_TABLES_KEY = "easyloc:separacao-tabelas-ausentes";

  function $(id){
    return document.getElementById(id);
  }

  function cacheEls(){
    [
      "btnNovoPedidoCentral",
      "btnAtualizarPedidos",
      "filtroClientePedido",
      "filtroNumeroPedido",
      "filtroLocalPedido",
      "filtroComercialPedido",
      "filtroStatusPedido",
      "filtroDataInicialPedido",
      "filtroDataFinalPedido",
      "centralStatusCarregamento",
      "centralPedidosTbody",
      "centralPedidoPreviewModal",
      "centralPedidoPreviewBody",
      "centralPreviewTitulo",
      "btnFecharPreviewPedido",
      "btnImprimirPreviewPedido",
      "centralWhatsappModal",
      "centralWhatsappTitulo",
      "centralWhatsappCliente",
      "centralWhatsappTelefone",
      "centralWhatsappMensagem",
      "btnFecharWhatsappPedido",
      "btnCancelarWhatsappPedido",
      "btnEnviarWhatsappPedido",
      "centralCadastroRelacionadoModal",
      "centralCadastroRelacionadoTitulo",
      "centralCadastroRelacionadoSubtitulo",
      "centralCadastroRelacionadoBody",
      "btnFecharCadastroRelacionado"
    ].forEach((id) => {
      els[id] = $(id);
    });
  }

  function avisar(mensagem, titulo = "Central de Pedidos", tipo = "info"){
    if(typeof window.alerta === "function"){
      window.alerta(mensagem, titulo, tipo);
      return;
    }
    alert(mensagem);
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatCurrency(value){
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function formatDate(value){
    if(!value) return "-";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  }

  function onlyDigits(value){
    return String(value || "").replace(/\D/g, "");
  }

  function formatPhone(value){
    const digits = onlyDigits(value);
    if(!digits) return "-";
    if(digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if(digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return value || digits;
  }

  function formatCadastroValue(value){
    const text = String(value ?? "").trim();
    return text || "-";
  }

  function formatEnderecoCadastro(registro){
    const partes = [
      registro?.endereco,
      registro?.numero_endereco,
      registro?.bairro,
      registro?.cidade,
      registro?.estado || registro?.uf
    ].filter(Boolean);
    return partes.join(", ") || "-";
  }

  function tagsCadastroHtml(tags){
    let parsed = tags;
    if(typeof parsed === "string"){
      try{
        parsed = JSON.parse(parsed);
      }catch{
        parsed = {};
      }
    }
    if(!parsed || typeof parsed !== "object") return "";

    return Object.entries(parsed)
      .filter(([, value]) => {
        if(Array.isArray(value)) return value.length;
        return value !== null && value !== undefined && String(value).trim() !== "";
      })
      .map(([key, value]) => {
        const values = Array.isArray(value) ? value : [value];
        return `
          <div class="central-cadastro-tags-group">
            <span>${escapeHtml(key)}</span>
            <div>
              ${values.map((item) => `<em>${escapeHtml(item)}</em>`).join("")}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function moneyNumber(value){
    if(typeof value === "number") return Number.isFinite(value) ? value : 0;
    if(value === null || value === undefined) return 0;
    const raw = String(value)
      .replace("R$", "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    return Math.max(0, Number(raw) || 0);
  }

  function firstMoneyValue(...values){
    for(const value of values){
      const parsed = moneyNumber(value);
      if(parsed > 0) return parsed;
    }
    return 0;
  }

  function normalizarObservacoes(value){
    if(!value) return {};
    if(typeof value === "object") return value;
    try{
      return JSON.parse(value);
    }catch{
      return {};
    }
  }

  function statusParcelaPago(status){
    const normalized = String(status || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    return ["pago", "recebido", "quitado", "liquidado", "baixado"].includes(normalized);
  }

  function statusParcelaCancelado(status){
    return String(status || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim() === "cancelado";
  }

  function dateISO(value){
    if(!value) return "";
    const text = String(value).trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(br) return `${br[3]}-${br[2]}-${br[1]}`;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }

  function calcularFinanceiroPedido(pedido){
    const total = moneyNumber(pedido.valor);
    const observacoes = pedido.observacoes || {};
    const parcelas = Array.isArray(observacoes.parcelas_financeiras)
      ? observacoes.parcelas_financeiras
      : [];

    const recebidoPorCampo = firstMoneyValue(
      pedido.valor_recebido,
      pedido.total_recebido,
      pedido.valor_pago,
      pedido.total_pago,
      pedido.recebido,
      pedido.baixado,
      pedido.valor_baixado,
      observacoes.valor_recebido,
      observacoes.total_recebido,
      observacoes.valor_pago,
      observacoes.total_pago,
      observacoes.baixado
    );

    const recebidoPorParcelas = parcelas.reduce((sum, parcela) => {
      if(!statusParcelaPago(parcela?.status)) return sum;
      return sum + moneyNumber(parcela?.valor);
    }, 0);

    const statusQuitado = statusParcelaPago(
      pedido.status_pagamento
      || pedido.status_financeiro
      || pedido.pagamento_status
      || pedido.financeiro_status
      || observacoes.status_financeiro
      || observacoes.pagamento_status
      || observacoes.financeiro_status
    );
    const recebido = Math.min(total, statusQuitado ? total : (recebidoPorCampo || recebidoPorParcelas));
    const pendente = Math.max(0, total - recebido);
    const percentual = total > 0 ? Math.min(100, Math.round((recebido / total) * 100)) : 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const pendentes = parcelas
      .filter((parcela) => !statusParcelaPago(parcela?.status) && !statusParcelaCancelado(parcela?.status))
      .map((parcela) => ({
        ...parcela,
        vencimentoISO: dateISO(parcela?.vencimento)
      }))
      .filter((parcela) => parcela.vencimentoISO)
      .sort((a, b) => a.vencimentoISO.localeCompare(b.vencimentoISO));

    const vencimentoDireto = dateISO(
      pedido.proximo_vencimento
      || pedido.proximo_vencimento_pagamento
      || pedido.data_vencimento
      || pedido.vencimento
      || observacoes.proximo_vencimento
      || observacoes.proximo_vencimento_pagamento
      || observacoes.data_vencimento
      || observacoes.vencimento
    );
    const proxima = pendentes[0] || (vencimentoDireto ? { vencimentoISO: vencimentoDireto } : null);
    const proximaDate = proxima?.vencimentoISO ? new Date(`${proxima.vencimentoISO}T00:00:00`) : null;
    const atrasado = percentual < 100 && proximaDate && proximaDate < hoje;
    const qtdParcelas = parcelas.length
      || Number(pedido.quantidade_parcelas || pedido.parcelas || observacoes.quantidade_parcelas || observacoes.parcelas || 0);

    let estado = "empty";
    if(percentual >= 100) estado = "paid";
    else if(atrasado) estado = "overdue";
    else if(percentual > 0) estado = "partial";

    const label = `${percentual}% pago${atrasado ? " (atrasado)" : ""}`;

    return {
      total,
      recebido,
      pendente,
      percentual,
      estado,
      label,
      proximoVencimento: proxima?.vencimentoISO || "",
      qtdParcelas
    };
  }

  function renderValorFinanceiro(pedido){
    const financeiro = calcularFinanceiroPedido(pedido);
    const tooltip = [
      `Valor total: ${formatCurrency(financeiro.total)}`,
      `Valor recebido: ${formatCurrency(financeiro.recebido)}`,
      `Valor pendente: ${formatCurrency(financeiro.pendente)}`,
      `Proximo vencimento: ${financeiro.proximoVencimento ? dataBR(financeiro.proximoVencimento) : "-"}`,
      `Quantidade de parcelas: ${financeiro.qtdParcelas}`
    ].map(escapeHtml).join("&#10;");

    return `
      <div class="central-finance-indicator ${escapeHtml(financeiro.estado)}" style="--finance-progress:${financeiro.percentual}%" title="${tooltip}" aria-label="${tooltip}">
        <span class="central-finance-value">${formatCurrency(financeiro.total)}</span>
        <span class="central-finance-track">
          <span class="central-finance-fill"></span>
        </span>
        <span class="central-finance-label">${escapeHtml(financeiro.label)}</span>
      </div>
    `;
  }

  function formatStatusLabel(status){
    const labels = {
      pre_reserva: "Pre reserva",
      orcamento: "Orcamento",
      aprovado: "Aprovado",
      pendente: "Pendente",
      em_separacao: "Em separacao",
      separado: "Separado",
      finalizado: "Finalizado",
      cancelado: "cancelado"
    };

    return labels[status] || String(status || "-").replaceAll("_", " ");
  }

  function isTabelaAusente(error){
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    return code === "42P01" || /does not exist|schema cache|could not find/i.test(message);
  }

  function tabelasSeparacaoAusentes(){
    try{
      return localStorage.getItem(MISSING_SEPARACAO_TABLES_KEY) === "1";
    }catch{
      return false;
    }
  }

  function marcarTabelasSeparacaoAusentes(){
    try{
      localStorage.setItem(MISSING_SEPARACAO_TABLES_KEY, "1");
    }catch{}
  }

  function abrirPedido(pedidoId = "", modo = "editar"){
    if(typeof window.carregarNaMain === "function"){
      const suffix = pedidoId ? `?pedido=${encodeURIComponent(pedidoId)}` : "";
      window.__PEDIDO_ATUAL_ID = pedidoId || null;
      window.__PEDIDO_MODO_ABERTURA = modo;
      window.carregarNaMain(
        `Modulos/Comercial/Pedidos/pedido.html${suffix}`,
        "js/pedido/pedido.mjs",
        null,
        "Modulos/Comercial/Pedidos/pedido.css"
      );
      return;
    }

    window.location.href = pedidoId
      ? `pedido.html?pedido=${encodeURIComponent(pedidoId)}`
      : "pedido.html";
  }

  function escolherParcelaPix(pedido){
    const parcelas = Array.isArray(pedido?.observacoes?.parcelas_financeiras)
      ? pedido.observacoes.parcelas_financeiras
      : [];

    const indexAberto = parcelas.findIndex((parcela) => {
      return moneyNumber(parcela?.valor) > 0
        && !statusParcelaPago(parcela?.status)
        && !statusParcelaCancelado(parcela?.status);
    });

    if(indexAberto >= 0){
      const parcela = parcelas[indexAberto];
      return {
        index: indexAberto,
        numero: parcela.numero || indexAberto + 1,
        label: parcela.tipo || `Parcela ${indexAberto + 1}`,
        valor: moneyNumber(parcela.valor),
        vencimento: dateISO(parcela.vencimento) || dateISO(pedido.data)
      };
    }

    return {
      index: null,
      numero: "",
      label: "Pedido",
      valor: moneyNumber(pedido?.valor),
      vencimento: dateISO(pedido?.vencimento || pedido?.data_vencimento || pedido?.data)
    };
  }

  function abrirPixPedido(pedido){
    if(!pedido) return;
    if(!window.EasyLocPix?.open){
      avisar("Fluxo PIX indisponivel neste momento.", "PIX", "erro");
      return;
    }

    const parcela = escolherParcelaPix(pedido);
    const parcelas = Array.isArray(pedido?.observacoes?.parcelas_financeiras)
      ? pedido.observacoes.parcelas_financeiras
      : [];

    window.EasyLocPix.open({
      source: "central_pedidos",
      pedidoId: pedido.id,
      numeroPedido: pedido.numero,
      clienteId: pedido.cliente_id,
      cliente: pedido.cliente,
      contato: pedido.contato,
      valor: parcela.valor,
      vencimento: parcela.vencimento,
      parcelaIndex: parcela.index,
      parcelaNumero: parcela.numero,
      parcelaLabel: parcela.label,
      parcelas,
      gateway: "mercado_pago"
    });
  }

  function campoCadastro(label, value, extraClass = ""){
    return `
      <div class="central-cadastro-field ${extraClass}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(formatCadastroValue(value))}</strong>
      </div>
    `;
  }

  function renderCadastroRelacionado(tipo, registro, pedido){
    const isCliente = tipo === "cliente";
    const tituloFallback = isCliente ? pedido?.cliente : pedido?.local;
    const nome = registro?.nome_razao || registro?.nome || tituloFallback || "-";
    const tagsHtml = tagsCadastroHtml(registro?.tags);
    const status = registro?.status || registro?.status_cliente || (isCliente ? "Cliente" : "Local");

    if(els.centralCadastroRelacionadoSubtitulo){
      els.centralCadastroRelacionadoSubtitulo.textContent = isCliente ? "Cadastro de cliente" : "Cadastro de local";
    }
    if(els.centralCadastroRelacionadoTitulo){
      els.centralCadastroRelacionadoTitulo.textContent = nome;
    }

    if(els.centralCadastroRelacionadoBody){
      els.centralCadastroRelacionadoBody.innerHTML = `
        <section class="central-cadastro-summary">
          <div>
            <span>${isCliente ? "Cliente" : "Local"}</span>
            <strong>${escapeHtml(nome)}</strong>
            <p>${escapeHtml(formatEnderecoCadastro(registro))}</p>
          </div>
          <em>${escapeHtml(formatCadastroValue(status))}</em>
        </section>

        <section class="central-cadastro-grid">
          ${campoCadastro("CPF / CNPJ", registro?.cpf_cnpj)}
          ${campoCadastro("Telefone", formatPhone(registro?.telefone || registro?.celular || pedido?.contato))}
          ${campoCadastro("Email", registro?.email)}
          ${campoCadastro("Ultima locacao", dataBR(registro?.ultima_locacao))}
          ${campoCadastro("Endereco", formatEnderecoCadastro(registro), "wide")}
          ${campoCadastro("Ponto de referencia", registro?.ponto_referencia, "wide")}
          ${isCliente ? campoCadastro("Origem / canal", registro?.canal || registro?.origem) : campoCadastro("Responsavel", registro?.responsavel)}
          ${campoCadastro("Observacoes", registro?.observacoes || registro?.observacao, "wide")}
        </section>

        ${tagsHtml ? `<section class="central-cadastro-tags">${tagsHtml}</section>` : ""}
      `;
    }

    els.centralCadastroRelacionadoModal?.classList.remove("hidden");
    window.lucide?.createIcons?.();
  }

  async function buscarCadastroRelacionado(tipo, pedido){
    if(!state.supabase || !state.empresaId) throw new Error("Supabase indisponivel.");
    const isCliente = tipo === "cliente";
    const table = isCliente ? "clientes_empresas" : "locais_empresas";
    const id = isCliente ? pedido?.cliente_id : pedido?.local_id;
    const nome = isCliente ? pedido?.cliente : pedido?.local;

    let query = state.supabase
      .from(table)
      .select("*")
      .eq("empresa_id", state.empresaId)
      .limit(1);

    if(id){
      query = query.eq("id", id);
    }else if(nome){
      query = query.ilike("nome_razao", nome);
    }else{
      return null;
    }

    const { data, error } = await query.maybeSingle();
    if(error && !isTabelaAusente(error)) throw error;
    return data || null;
  }

  async function abrirCadastroRelacionado(tipo, pedido){
    if(!pedido) return;

    const isCliente = tipo === "cliente";
    const id = isCliente ? pedido.cliente_id : pedido.local_id;
    const nome = isCliente ? pedido.cliente : pedido.local;

    if(!id && !nome){
      avisar(isCliente ? "Cliente nao encontrado neste pedido." : "Local nao encontrado neste pedido.", "Cadastro", "aviso");
      return;
    }

    try{
      if(els.centralCadastroRelacionadoSubtitulo){
        els.centralCadastroRelacionadoSubtitulo.textContent = isCliente ? "Cadastro de cliente" : "Cadastro de local";
      }
      if(els.centralCadastroRelacionadoTitulo){
        els.centralCadastroRelacionadoTitulo.textContent = "Carregando...";
      }
      if(els.centralCadastroRelacionadoBody){
        els.centralCadastroRelacionadoBody.innerHTML = `<div class="central-cadastro-loading">Buscando cadastro...</div>`;
      }
      els.centralCadastroRelacionadoModal?.classList.remove("hidden");

      const registro = await buscarCadastroRelacionado(tipo, pedido);
      renderCadastroRelacionado(tipo, registro || {
        nome_razao: nome,
        telefone: pedido.contato,
        status: "Nao encontrado"
      }, pedido);
    }catch(error){
      console.error("[CentralPedidos] cadastro relacionado:", error);
      avisar("Nao foi possivel abrir o cadastro neste momento.", "Cadastro", "erro");
      els.centralCadastroRelacionadoModal?.classList.add("hidden");
    }
  }

  function normalizarPedido(row){
    const observacoes = normalizarObservacoes(row.observacoes);
    return {
      id: row.id,
      numero: row.numero_pedido || row.numero || row.codigo || row.id || "-",
      cliente_id: row.cliente_id || null,
      local_id: row.local_id || null,
      cliente: row.cliente_nome || row.cliente || row.nome_cliente || "Cliente nao informado",
      contato: row.contato_cliente || row.telefone_cliente || row.cliente_telefone || row.telefone || "",
      evento: row.tipo_evento || row.evento || row.nome_evento || "Evento",
      local: row.local_nome || row.local || row.endereco || "Local nao informado",
      data: row.data_evento || row.data_hora || row.data || row.created_at,
      status: row.status_comercial || row.status || "orcamento",
      valor: moneyNumber(row.valor_total || row.total || row.valor || 0),
      valor_recebido: row.valor_recebido,
      total_recebido: row.total_recebido,
      valor_pago: row.valor_pago,
      total_pago: row.total_pago,
      recebido: row.recebido,
      baixado: row.baixado,
      valor_baixado: row.valor_baixado,
      status_pagamento: row.status_pagamento,
      status_financeiro: row.status_financeiro,
      pagamento_status: row.pagamento_status,
      financeiro_status: row.financeiro_status,
      proximo_vencimento: row.proximo_vencimento,
      proximo_vencimento_pagamento: row.proximo_vencimento_pagamento,
      data_vencimento: row.data_vencimento,
      vencimento: row.vencimento,
      quantidade_parcelas: row.quantidade_parcelas,
      parcelas: row.parcelas,
      observacoes,
      comercial: row.comercial_nome || row.comercial || row.responsavel || "-"
    };
  }

  async function enriquecerContatosClientes(pedidos){
    if(!state.supabase || !state.empresaId || !pedidos.length) return pedidos;

    const ids = [...new Set(pedidos.map((pedido) => pedido.cliente_id).filter(Boolean))];
    const nomesSemContato = [...new Set(pedidos
      .filter((pedido) => !pedido.contato && !pedido.cliente_id && pedido.cliente)
      .map((pedido) => pedido.cliente))];

    const contatosPorId = new Map();
    const contatosPorNome = new Map();

    try{
      if(ids.length){
        const { data, error } = await state.supabase
          .from("clientes_empresas")
          .select("id,nome_razao,telefone")
          .eq("empresa_id", state.empresaId)
          .in("id", ids);
        if(error && !isTabelaAusente(error)) console.warn("[CentralPedidos] contatos clientes:", error);
        (data || []).forEach((cliente) => {
          contatosPorId.set(String(cliente.id), cliente.telefone || "");
          if(cliente.nome_razao) contatosPorNome.set(String(cliente.nome_razao).toLowerCase(), cliente.telefone || "");
        });
      }

      if(nomesSemContato.length){
        const buscas = await Promise.allSettled(nomesSemContato.map((nome) => state.supabase
          .from("clientes_empresas")
          .select("nome_razao,telefone")
          .eq("empresa_id", state.empresaId)
          .ilike("nome_razao", nome)
          .limit(1)
          .maybeSingle()));

        buscas.forEach((result) => {
          const cliente = result.value?.data;
          if(cliente?.nome_razao) contatosPorNome.set(String(cliente.nome_razao).toLowerCase(), cliente.telefone || "");
        });
      }
    }catch(error){
      console.warn("[CentralPedidos] nao foi possivel buscar contato dos clientes:", error);
    }

    return pedidos.map((pedido) => ({
      ...pedido,
      contato: pedido.contato
        || contatosPorId.get(String(pedido.cliente_id))
        || contatosPorNome.get(String(pedido.cliente).toLowerCase())
        || ""
    }));
  }

  function mensagemPadraoWhatsapp(pedido){
    return [
      `Ola, ${pedido.cliente}!`,
      "",
      `Tudo bem? Estou entrando em contato sobre o pedido ${pedido.numero} do evento ${pedido.evento}.`,
      `Data do evento: ${formatDate(pedido.data)}.`,
      `Local: ${pedido.local}.`,
      "",
      "Qualquer duvida, estou a disposicao."
    ].join("\n");
  }

  function abrirModalWhatsapp(pedido){
    if(!pedido) return;
    const phone = onlyDigits(pedido.contato);
    if(!phone){
      avisar("Este cliente ainda nao tem telefone cadastrado.", "WhatsApp", "aviso");
      return;
    }

    state.whatsappPedido = pedido;
    if(els.centralWhatsappTitulo) els.centralWhatsappTitulo.textContent = `Pedido #${pedido.numero}`;
    if(els.centralWhatsappCliente) els.centralWhatsappCliente.value = pedido.cliente;
    if(els.centralWhatsappTelefone) els.centralWhatsappTelefone.value = formatPhone(pedido.contato);
    if(els.centralWhatsappMensagem) els.centralWhatsappMensagem.value = mensagemPadraoWhatsapp(pedido);
    els.centralWhatsappModal?.classList.remove("hidden");
    els.centralWhatsappModal?.setAttribute("aria-hidden", "false");
    window.lucide?.createIcons?.();
  }

  function fecharModalWhatsapp(){
    state.whatsappPedido = null;
    els.centralWhatsappModal?.classList.add("hidden");
    els.centralWhatsappModal?.setAttribute("aria-hidden", "true");
  }

  async function enviarWhatsappPedido(){
    const pedido = state.whatsappPedido;
    if(!pedido) return;

    const phone = onlyDigits(pedido.contato);
    const text = els.centralWhatsappMensagem?.value?.trim();
    if(!phone){
      avisar("Numero de WhatsApp ausente.", "WhatsApp", "aviso");
      return;
    }
    if(!text){
      avisar("Digite a mensagem antes de enviar.", "WhatsApp", "aviso");
      return;
    }

    if(!window.EasyLocWhatsApp?.send){
      avisar("Integracao WhatsApp indisponivel neste momento.", "WhatsApp", "erro");
      return;
    }

    const button = els.btnEnviarWhatsappPedido;
    const original = button?.innerHTML;
    try{
      if(button){
        button.disabled = true;
        button.innerHTML = `<i data-lucide="loader-circle"></i> Enviando...`;
        window.lucide?.createIcons?.();
      }
      await window.EasyLocWhatsApp.send({
        phone,
        text,
        caption: text,
        type: "texto",
        origin: "central_pedidos",
        confirm: false
      });
      avisar("Mensagem enviada pelo WhatsApp.", "WhatsApp", "sucesso");
      fecharModalWhatsapp();
    }catch(error){
      avisar(error.message || "Nao foi possivel enviar a mensagem.", "WhatsApp", "erro");
    }finally{
      if(button){
        button.disabled = false;
        button.innerHTML = original;
        window.lucide?.createIcons?.();
      }
    }
  }

  function dataPedidoParaCadastro(row){
    const raw = row.data_evento || row.data_coleta || row.data_entrega || row.data_hora || row.created_at;
    if(!raw) return "";
    const iso = String(raw).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
  }

  function pedidoContaComoUltimaLocacao(row){
    const status = String(row.status_comercial || row.status || "").toLowerCase();
    return !["cancelado", "cancelada", "pausado"].includes(status);
  }

  function escolherMaisRecente(map, key, payload){
    if(!key || !payload.ultima_locacao) return;
    const atual = map.get(key);
    if(!atual || payload.ultima_locacao > atual.ultima_locacao){
      map.set(key, payload);
    }
  }

  async function atualizarCadastroPorIdOuNome(tabela, id, nome, payload){
    if(!state.supabase || !state.empresaId || !payload.ultima_locacao) return;

    let result = null;

    if(id){
      result = await state.supabase
        .from(tabela)
        .update(payload)
        .eq("empresa_id", state.empresaId)
        .eq("id", id);
    }

    if((!id || result?.error) && nome){
      result = await state.supabase
        .from(tabela)
        .update(payload)
        .eq("empresa_id", state.empresaId)
        .eq("nome_razao", nome);
    }

    if(result?.error && !isTabelaAusente(result.error)){
      console.warn(`[CentralPedidos] nao foi possivel atualizar ${tabela}:`, result.error);
    }
  }

  async function sincronizarInatividadeCadastros(rows){
    const clientes = new Map();
    const locais = new Map();

    (rows || []).filter(pedidoContaComoUltimaLocacao).forEach((row) => {
      const ultima_locacao = dataPedidoParaCadastro(row);
      if(!ultima_locacao) return;

      escolherMaisRecente(clientes, row.cliente_id || row.cliente_nome, {
        id: row.cliente_id || null,
        nome: row.cliente_nome || row.cliente || row.nome_cliente || "",
        ultima_locacao
      });

      escolherMaisRecente(locais, row.local_id || row.local_nome, {
        id: row.local_id || null,
        nome: row.local_nome || row.local || "",
        ultima_locacao
      });
    });

    const tarefas = [];
    clientes.forEach((cliente) => {
      tarefas.push(atualizarCadastroPorIdOuNome("clientes_empresas", cliente.id, cliente.nome, {
        ultima_locacao: cliente.ultima_locacao
      }));
    });

    locais.forEach((local) => {
      tarefas.push(atualizarCadastroPorIdOuNome("locais", local.id, local.nome, {
        ultima_locacao: local.ultima_locacao
      }));
    });

    if(tarefas.length){
      await Promise.allSettled(tarefas);
    }
  }

  function dataBR(value){
    if(!value) return "-";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
  }

  function getEnderecoPedido(pedido){
    const html = pedido.observacoes?.local_html || "";
    if(!html) return "-";
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.innerText.replace(/\s+/g, " ").trim() || "-";
  }

  function getTagsPedido(pedido){
    const html = pedido.observacoes?.local_tags_html || "";
    if(!html) return [];
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return Array.from(temp.querySelectorAll("*"))
      .map((el) => el.textContent.trim())
      .filter(Boolean);
  }

  async function abrirPreviewPedido(pedidoId){
    if(!pedidoId || !state.supabase || !state.empresaId) return;

    const { data: pedido, error } = await state.supabase
      .from("separacoes_pedidos")
      .select("*")
      .eq("empresa_id", state.empresaId)
      .eq("id", pedidoId)
      .single();

    if(error || !pedido){
      avisar("Nao foi possivel abrir a visualizacao do pedido.", "Visualizar", "erro");
      return;
    }

    const { data: itens, error: itensError } = await state.supabase
      .from("separacoes_itens")
      .select("*, itens:item_id(codigo,produto,descricao_total,foto_url,valor_locacao,valor_reposicao)")
      .eq("empresa_id", state.empresaId)
      .eq("separacao_pedido_id", pedidoId)
      .order("created_at", { ascending: true });

    if(itensError){
      console.warn("Erro ao carregar itens do preview:", itensError);
    }

    const parcelas = Array.isArray(pedido.observacoes?.parcelas_financeiras)
      ? pedido.observacoes.parcelas_financeiras
      : [];

    const { data: empresa } = await state.supabase
      .from("empresas")
      .select("nome,logo_url")
      .eq("id", state.empresaId)
      .maybeSingle();

    const itensRows = (itens || []).map((item) => {
      const cadastro = item.itens || {};
      const nome = item.item_nome || cadastro.descricao_total || cadastro.produto || "Item";
      const qtd = Number(item.quantidade_solicitada || 0);
      const unit = Number(cadastro.valor_locacao || 0);
      const total = qtd * unit;
      return `
        <tr>
          <td>${qtd}</td>
          <td>${item.foto_url || cadastro.foto_url ? `<img src="${escapeHtml(item.foto_url || cadastro.foto_url)}">` : ""}</td>
          <td><strong>${escapeHtml(nome)}</strong><small>${escapeHtml(item.codigo_item || cadastro.codigo || "")}</small></td>
          <td>${formatCurrency(unit)}</td>
          <td>${formatCurrency(total)}</td>
          <td>${formatCurrency(cadastro.valor_reposicao || 0)}</td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="6" class="empty">Nenhum item salvo neste pedido.</td></tr>`;

    const parcelasRows = parcelas.map((parcela, index) => `
      <tr>
        <td>${parcela.numero || index + 1}</td>
        <td>${escapeHtml(parcela.tipo || `Parcela ${index + 1}`)}</td>
        <td>${dataBR(parcela.vencimento)}</td>
        <td>${formatCurrency(parcela.valor || 0)}</td>
        <td>${escapeHtml(parcela.metodo || "A combinar")}</td>
        <td><span class="badge-ok">${escapeHtml(parcela.status || "Programado")}</span></td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="empty">Programacao de pagamento nao informada.</td></tr>`;

    if(els.centralPreviewTitulo){
      els.centralPreviewTitulo.textContent = `Pedido #${pedido.numero_pedido || "-"}`;
    }

    if(els.centralPedidoPreviewBody){
      const tags = getTagsPedido(pedido);
      const endereco = getEnderecoPedido(pedido);
      const logo = empresa?.logo_url
        ? `<img class="preview-logo" src="${escapeHtml(empresa.logo_url)}" alt="${escapeHtml(empresa.nome || "Logo")}">`
        : `<div class="preview-logo-fallback">${escapeHtml(empresa?.nome || "Acervo")}</div>`;

      els.centralPedidoPreviewBody.innerHTML = `
        <main class="preview-page">
          <header class="preview-hero">
            <div class="preview-brand">
              ${logo}
              <div>
                <h1>Proposta comercial</h1>
                <p>Locacao de mobiliario e decoracao de eventos.</p>
              </div>
            </div>
            <div class="preview-pedido-box">
              <span>Pedido</span>
              <strong>#${escapeHtml(pedido.numero_pedido || "-")}</strong>
              <em>${escapeHtml(pedido.status_comercial || pedido.status || "orcamento")}</em>
            </div>
          </header>
          <section class="preview-section">
            <div class="preview-section-title">
              <h2>Dados do evento</h2>
              <span>${new Date().toLocaleDateString("pt-BR")}</span>
            </div>
          <div class="preview-grid">
            <div><span>Cliente</span><strong>${escapeHtml(pedido.cliente_nome || "-")}</strong></div>
            <div><span>Contato</span><strong>${escapeHtml(pedido.contato_cliente || "-")}</strong></div>
            <div><span>Evento</span><strong>${escapeHtml(pedido.tipo_evento || "-")}</strong></div>
            <div><span>Data do evento</span><strong>${dataBR(pedido.data_evento || pedido.data_hora)}</strong></div>
            <div><span>Entrega / Coleta</span><strong>${dataBR(pedido.data_entrega)} / ${dataBR(pedido.data_coleta)}</strong></div>
            <div class="wide"><span>Local</span><strong>${escapeHtml(pedido.local_nome || "-")}</strong></div>
            <div class="wide"><span>Endereco e referencia</span><strong>${escapeHtml(endereco)}</strong></div>
          </div>
            ${tags.length ? `<div class="preview-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
          </section>
          <section class="preview-section">
            <h2>Itens do pedido</h2>
            <table><thead><tr><th>Qtd</th><th>Foto</th><th>Item</th><th>Locacao</th><th>Total</th><th>Reposicao</th></tr></thead><tbody>${itensRows}</tbody></table>
          </section>
          <section class="preview-finance preview-section">
            <div>
              <h2>Programacao de pagamento</h2>
              <table><thead><tr><th>#</th><th>Tipo</th><th>Vencimento</th><th>Valor</th><th>Metodo</th><th>Status</th></tr></thead><tbody>${parcelasRows}</tbody></table>
            </div>
            <div>
              <h2>Resumo financeiro</h2>
              <div class="preview-total"><span>Total do pedido</span><strong>${formatCurrency(pedido.valor_total || 0)}</strong></div>
            </div>
          </section>
        </main>
      `;
    }

    els.centralPedidoPreviewModal?.classList.remove("hidden");
  }

  function aplicarFiltros(){
    const cliente = (els.filtroClientePedido?.value || "").trim().toLowerCase();
    const numero = (els.filtroNumeroPedido?.value || "").trim().toLowerCase();
    const local = (els.filtroLocalPedido?.value || "").trim().toLowerCase();
    const comercial = (els.filtroComercialPedido?.value || "").trim().toLowerCase();
    const status = els.filtroStatusPedido?.value || "";
    const inicial = els.filtroDataInicialPedido?.value;
    const final = els.filtroDataFinalPedido?.value;

    state.filtrados = state.pedidos.filter((pedido) => {
      const dataPedido = pedido.data ? new Date(pedido.data) : null;
      const dataISO = dataPedido && !Number.isNaN(dataPedido.getTime())
        ? dataPedido.toISOString().slice(0, 10)
        : "";

      return (!cliente || pedido.cliente.toLowerCase().includes(cliente))
        && (!numero || String(pedido.numero).toLowerCase().includes(numero))
        && (!local || pedido.local.toLowerCase().includes(local))
        && (!comercial || pedido.comercial.toLowerCase().includes(comercial))
        && (!status || pedido.status === status)
        && (!inicial || dataISO >= inicial)
        && (!final || dataISO <= final);
    });

    render();
  }

  function render(){
    if(els.centralStatusCarregamento){
      els.centralStatusCarregamento.textContent = `${state.filtrados.length} pedido(s)`;
    }

    if(!els.centralPedidosTbody) return;

    if(!state.filtrados.length){
      els.centralPedidosTbody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="central-empty">
              Nenhum pedido encontrado. Use "Novo Pedido" para montar um evento.
            </div>
          </td>
        </tr>
      `;
      return;
    }

    els.centralPedidosTbody.innerHTML = state.filtrados.map((pedido) => `
      <tr data-pedido-id="${escapeHtml(pedido.id)}" title="Clique duas vezes para abrir o pedido">
          <td><span class="pedido-numero-card">${escapeHtml(pedido.numero)}</span></td>
        <td>
          <button type="button" class="central-record-link" data-action="abrir-cliente" title="Abrir cadastro do cliente">
            ${escapeHtml(pedido.cliente)}
          </button>
        </td>
        <td class="central-contact-cell">${escapeHtml(formatPhone(pedido.contato))}</td>
        <td>${escapeHtml(pedido.evento)}</td>
        <td>
          <button type="button" class="central-record-link" data-action="abrir-local" title="Abrir cadastro do local">
            ${escapeHtml(pedido.local)}
          </button>
        </td>
        <td>${escapeHtml(formatDate(pedido.data))}</td>
        <td><span class="status-pill ${escapeHtml(pedido.status)}">${escapeHtml(formatStatusLabel(pedido.status))}</span></td>
        <td class="central-value-cell">${renderValorFinanceiro(pedido)}</td>
        <td>
          <div class="central-actions">
            <button type="button" class="central-icon-action" data-action="visualizar" title="Visualizar pedido" aria-label="Visualizar pedido">
              <i data-lucide="eye"></i>
            </button>
            <button type="button" class="central-icon-action" data-action="contrato" title="Abrir contrato" aria-label="Abrir contrato">
              <i data-lucide="file-text"></i>
            </button>
            <button type="button" class="central-icon-action whatsapp" data-action="whatsapp" title="Enviar WhatsApp" aria-label="Enviar WhatsApp">
              <i data-lucide="message-circle"></i>
            </button>
            <button type="button" class="central-icon-action pix" data-action="pix" title="Gerar PIX" aria-label="Gerar PIX">
              <i data-lucide="qr-code"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join("");
    window.lucide?.createIcons?.();
  }

  async function carregarPedidos(){
    if(els.centralStatusCarregamento) els.centralStatusCarregamento.textContent = "Carregando...";

    if(!state.supabase || !state.empresaId){
      state.pedidos = [];
      state.filtrados = [];
      render();
      window.finalizarCarregamentoModulo?.();
      return;
    }

    try{
      const { data:{ session } } = await state.supabase.auth.getSession();
      if(!session?.access_token){
        console.warn("[EasyLoc Debug]", {
          arquivo: "Modulos/Comercial/Pedidos/CentralPedidos.js",
          funcao: "carregarPedidos",
          tabela: "separacoes_pedidos",
          causa: "Sessao ausente/expirada antes da consulta"
        });
        throw new Error("Sessao ausente para carregar pedidos");
      }

      const { data, error } = await state.supabase
        .from("separacoes_pedidos")
        .select("*")
        .eq("empresa_id", state.empresaId)
        .order("data_hora", { ascending: false })
        .limit(200);

      if(error){
        console.warn("[EasyLoc Debug]", {
          arquivo: "Modulos/Comercial/Pedidos/CentralPedidos.js",
          funcao: "carregarPedidos",
          tabela: "separacoes_pedidos",
          empresaId: state.empresaId,
          erro: error
        });
        if(isTabelaAusente(error)) marcarTabelasSeparacaoAusentes();
        throw error;
      }
      state.pedidos = await enriquecerContatosClientes((data || []).map(normalizarPedido));
      sincronizarInatividadeCadastros(data || []).catch((error) => {
        console.warn("[CentralPedidos] sincronizacao de inatividade falhou:", error);
      });
    }catch(err){
      console.warn("Central de Pedidos sem tabela de pedidos disponivel:", err);
      state.pedidos = [];
      if(els.centralStatusCarregamento){
        els.centralStatusCarregamento.textContent = "Tabela de pedidos indisponivel";
      }
    }

    aplicarFiltros();
    window.finalizarCarregamentoModulo?.();
  }

  function setupRealtime(){
    if(!state.supabase?.channel || !state.empresaId || state.realtimeChannel) return;

    state.realtimeChannel = state.supabase
      .channel(`central-pedidos-${state.empresaId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "separacoes_pedidos",
        filter: `empresa_id=eq.${state.empresaId}`
      }, () => carregarPedidos())
      .subscribe();
  }

  function bindEvents(){
    els.btnNovoPedidoCentral?.addEventListener("click", () => abrirPedido());
    els.btnAtualizarPedidos?.addEventListener("click", carregarPedidos);
    els.btnFecharPreviewPedido?.addEventListener("click", () => {
      els.centralPedidoPreviewModal?.classList.add("hidden");
    });
    els.btnImprimirPreviewPedido?.addEventListener("click", () => {
      window.print();
    });
    els.centralPedidoPreviewModal?.addEventListener("click", (event) => {
      if(event.target === els.centralPedidoPreviewModal){
        els.centralPedidoPreviewModal.classList.add("hidden");
      }
    });
    els.btnFecharWhatsappPedido?.addEventListener("click", fecharModalWhatsapp);
    els.btnCancelarWhatsappPedido?.addEventListener("click", fecharModalWhatsapp);
    els.btnEnviarWhatsappPedido?.addEventListener("click", enviarWhatsappPedido);
    els.centralWhatsappModal?.addEventListener("click", (event) => {
      if(event.target === els.centralWhatsappModal) fecharModalWhatsapp();
    });
    els.btnFecharCadastroRelacionado?.addEventListener("click", () => {
      els.centralCadastroRelacionadoModal?.classList.add("hidden");
    });
    els.centralCadastroRelacionadoModal?.addEventListener("click", (event) => {
      if(event.target === els.centralCadastroRelacionadoModal){
        els.centralCadastroRelacionadoModal.classList.add("hidden");
      }
    });

    [
      els.filtroClientePedido,
      els.filtroNumeroPedido,
      els.filtroLocalPedido,
      els.filtroComercialPedido,
      els.filtroStatusPedido,
      els.filtroDataInicialPedido,
      els.filtroDataFinalPedido
    ].forEach((el) => {
      el?.addEventListener("input", aplicarFiltros);
      el?.addEventListener("change", aplicarFiltros);
    });

    els.centralPedidosTbody?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if(!button) return;

      const row = button.closest("[data-pedido-id]");
      const pedidoId = row?.dataset?.pedidoId || "";
      const action = button.dataset.action;
      const pedido = state.pedidos.find((item) => String(item.id) === String(pedidoId));

      if(action === "abrir-cliente"){
        abrirCadastroRelacionado("cliente", pedido);
        return;
      }

      if(action === "abrir-local"){
        abrirCadastroRelacionado("local", pedido);
        return;
      }

      if(action === "visualizar"){
        abrirPreviewPedido(pedidoId);
        return;
      }

      if(action === "contrato"){
        abrirPedido(pedidoId);
        return;
      }

      if(action === "whatsapp"){
        abrirModalWhatsapp(pedido);
        return;
      }

      if(action === "pix"){
        abrirPixPedido(pedido);
      }
    });

    els.centralPedidosTbody?.addEventListener("dblclick", (event) => {
      if(event.target.closest("[data-action]")) return;
      const row = event.target.closest("[data-pedido-id]");
      const pedidoId = row?.dataset?.pedidoId || "";
      if(pedidoId) abrirPedido(pedidoId, "editar");
    });

    state.onFinanceiroAtualizado = () => carregarPedidos();
    state.onPixAtualizado = () => carregarPedidos();
    state.onStorageFinanceiroAtualizado = (event) => {
      if(event.key === "easyloc:pedido-financeiro-atualizado") carregarPedidos();
    };
    window.addEventListener("easyloc:pedido-financeiro-atualizado", state.onFinanceiroAtualizado);
    window.addEventListener("easyloc:pix-atualizado", state.onPixAtualizado);
    window.addEventListener("storage", state.onStorageFinanceiroAtualizado);
  }

  async function init(){
    cacheEls();
    state.supabase = window.supabaseClient;
    state.empresaId = window.__CONTEXT?.empresa_id;
    bindEvents();
    await carregarPedidos();
    setupRealtime();
  }

  function destroy(){
    if(state.onFinanceiroAtualizado){
      window.removeEventListener("easyloc:pedido-financeiro-atualizado", state.onFinanceiroAtualizado);
    }
    if(state.onPixAtualizado){
      window.removeEventListener("easyloc:pix-atualizado", state.onPixAtualizado);
    }
    if(state.onStorageFinanceiroAtualizado){
      window.removeEventListener("storage", state.onStorageFinanceiroAtualizado);
    }
    if(state.realtimeChannel && state.supabase?.removeChannel){
      state.supabase.removeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
    }
    delete window.__centralPedidosLoaded;
  }

  window.__moduleInit = async function initCentralPedidos(){
    if(window.__centralPedidosLoaded) return;
    window.__centralPedidosLoaded = true;
    await init();
  };

  window.__activeModuleDestroy = destroy;
})();
