(function(){
  const state = {
    supabase: null,
    empresaId: null,
    pedidos: [],
    planejamentos: [],
    caminhoes: [],
    colaboradores: [],
    agenda: [],
    selectedPedidoId: null,
    selectedCaminhoes: new Set(),
    selectedEquipe: new Set(),
    agendaTab: "caminhoes",
    dbStatus: {
      planejamentos: true,
      caminhoes: true,
      caminhoesPlanejamento: true,
      equipePlanejamento: true,
      colaboradores: true
    }
  };

  const els = {};
  const HORARIOS = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];

  function $(id){ return document.getElementById(id); }

  function cacheEls(){
    [
      "planejamentoFiltroData",
      "planejamentoFiltroRecurso",
      "planejamentoFiltroSituacao",
      "planejamentoFiltroBusca",
      "btnAgendaPlanejamento",
      "btnNovoPlanejamento",
      "planejamentoQtdPedidos",
      "planejamentoPedidosLista",
      "planejamentoPedidoVazio",
      "planejamentoPedidoDetalhe",
      "planejamentoPedidoStatus",
      "planejamentoPedidoTitulo",
      "planejamentoPedidoSubtitulo",
      "btnLimparSelecaoPlanejamento",
      "planejamentoDataEntrega",
      "planejamentoDataEvento",
      "planejamentoDataColeta",
      "planejamentoNecessidadeResumo",
      "planejamentoCaminhoesNecessarios",
      "planejamentoPessoasNecessarias",
      "planejamentoResumoCaminhoes",
      "planejamentoAlertaCaminhoes",
      "planejamentoCaminhoesLista",
      "planejamentoResumoEquipe",
      "planejamentoAlertaEquipe",
      "planejamentoEquipeLista",
      "btnConfirmarPlanejamento",
      "planejamentoAgendaGrade",
      "planejamentoQtdConflitos",
      "planejamentoConflitosLista"
    ].forEach((id) => els[id] = $(id));
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function avisar(msg, titulo = "Planejamento Logistico", tipo = "info"){
    if(typeof window.alerta === "function"){
      window.alerta(msg, titulo, tipo);
      return;
    }
    alert(msg);
  }

  function isTabelaAusente(error){
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    return code === "42P01" || code === "42703" || /does not exist|schema cache|could not find/i.test(message);
  }

  function isoHoje(){
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function formatDate(value){
    if(!value) return "-";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if(Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  }

  function dataBasePedido(pedido){
    return pedido.data_entrega || pedido.data_evento || pedido.data_hora || pedido.created_at || isoHoje();
  }

  function normalizarStatus(value){
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function parseObservacoes(row){
    const obs = row?.observacoes;
    if(!obs) return {};
    if(typeof obs === "object") return obs;
    try { return JSON.parse(obs); } catch { return {}; }
  }

  function getPedidoNumero(pedido){
    return pedido.numero_pedido || pedido.numero || pedido.codigo || pedido.id || "-";
  }

  function getPedidoTexto(pedido){
    return [
      getPedidoNumero(pedido),
      pedido.cliente_nome,
      pedido.local_nome,
      pedido.tipo_evento
    ].join(" ").toLowerCase();
  }

  function calcularNecessidade(pedido){
    const obs = parseObservacoes(pedido);
    const logistica = obs.logistica || obs.resumo_logistica || {};
    const brutoCaminhoes = pedido.qtd_caminhoes || pedido.caminhoes_necessarios || logistica.caminhoes || logistica.qtd_caminhoes || 0;
    const brutoPessoas = pedido.qtd_ajudantes || pedido.pessoas_necessarias || pedido.qtd_montadores || logistica.qtd_ajudantes || logistica.pessoas || 0;
    const volume = Number(pedido.volume_total || logistica.volume || logistica.volume_total || 0);

    const caminhoes = Math.max(1, Number(brutoCaminhoes) || Math.ceil(volume / 27) || 1);
    const pessoas = Math.max(1, Number(brutoPessoas) || Math.max(2, caminhoes * 2));
    const tipo = pedido.tipo_caminhao || logistica.tipo_caminhao || logistica.categoria_caminhao || (volume > 27 ? "G" : volume > 12 ? "M" : "P");

    return { caminhoes, pessoas, tipo, volume };
  }

  function getPlanejamentoPedido(pedidoId){
    return state.planejamentos.find((item) => item.pedido_id === pedidoId);
  }

  function statusPlanejamento(pedido){
    const planejamento = getPlanejamentoPedido(pedido.id);
    if(planejamento?.status) return normalizarStatus(planejamento.status);
    const obs = parseObservacoes(pedido);
    return normalizarStatus(obs.planejamento_logistico_status || pedido.status_planejamento || "aguardando");
  }

  function pedidoJaConfirmado(pedido){
    return statusPlanejamento(pedido).includes("confirm");
  }

  function pedidoSelecionado(){
    return state.pedidos.find((pedido) => pedido.id === state.selectedPedidoId) || null;
  }

  async function safeSelect(table, select, opts = {}){
    if(!state.supabase || !state.empresaId) return [];
    let query = state.supabase.from(table).select(select);
    if(opts.empresa !== false) query = query.eq("empresa_id", state.empresaId);
    if(opts.in?.field && opts.in.values?.length) query = query.in(opts.in.field, opts.in.values);
    if(opts.gte?.field) query = query.gte(opts.gte.field, opts.gte.value);
    if(opts.lt?.field) query = query.lt(opts.lt.field, opts.lt.value);
    if(opts.order) query = query.order(opts.order.field, { ascending: opts.order.ascending ?? true });
    const { data, error } = await query;
    if(error){
      if(isTabelaAusente(error)){
        console.warn(`[Planejamento] Tabela/campo indisponivel: ${table}`, error);
        return null;
      }
      throw error;
    }
    return data || [];
  }

  function recursosMock(){
    const podeUsarMock = !state.supabase || !state.empresaId;
    if((podeUsarMock || !state.dbStatus.caminhoes) && !state.caminhoes.length){
      state.caminhoes = [
        { id: "mock-g01", modelo: "G01", placa: "G01", categoria: "G", capacidade_m3: 52, status: "disponivel" },
        { id: "mock-g02", modelo: "G02", placa: "G02", categoria: "G", capacidade_m3: 52, status: "disponivel" },
        { id: "mock-m01", modelo: "M01", placa: "M01", categoria: "M", capacidade_m3: 27, status: "disponivel" }
      ];
    }
    if((podeUsarMock || !state.dbStatus.colaboradores) && !state.colaboradores.length){
      state.colaboradores = [
        { id: "mock-joao", nome: "Joao Silva", funcao: "Montador", status: "disponivel" },
        { id: "mock-pedro", nome: "Pedro Lopes", funcao: "Montador", status: "disponivel" },
        { id: "mock-carlos", nome: "Carlos Souza", funcao: "Motorista", status: "disponivel" },
        { id: "mock-marcos", nome: "Marcos Lima", funcao: "Montador", status: "disponivel" }
      ];
    }
  }

  async function carregarPedidosAprovados(){
    const selects = [
      "id,numero_pedido,cliente_nome,tipo_evento,local_nome,local_id,data_evento,data_entrega,data_coleta,data_hora,status,status_comercial,valor_total,observacoes,volume_total,qtd_caminhoes,qtd_ajudantes,status_planejamento",
      "id,numero_pedido,cliente_nome,tipo_evento,local_nome,local_id,data_evento,data_entrega,data_coleta,data_hora,status,status_comercial,valor_total,observacoes",
      "*"
    ];

    for(const select of selects){
      const data = await safeSelect("separacoes_pedidos", select, { order: { field: "data_evento", ascending: true } });
      if(Array.isArray(data)) return data;
    }

    return [];
  }

  function pedidoComercialAprovado(pedido){
    const comercial = normalizarStatus(pedido.status_comercial || "");
    const operacional = normalizarStatus(pedido.status || "");
    const combinado = `${comercial} ${operacional}`;
    if(combinado.includes("cancel")) return false;
    return (
      combinado.includes("aprov") ||
      combinado.includes("pre_reserva") ||
      combinado.includes("pre-reserva") ||
      combinado.includes("em_separacao") ||
      combinado.includes("pendente") ||
      combinado.includes("separado")
    );
  }

  async function carregarDados(){
    state.supabase = window.supabaseClient;
    state.empresaId = window.__CONTEXT?.empresa_id;
    if(!els.planejamentoFiltroData.value) els.planejamentoFiltroData.value = isoHoje();

    if(!state.supabase || !state.empresaId){
      renderTudo();
      window.finalizarCarregamentoModulo?.();
      return;
    }

    try{
      const pedidos = await carregarPedidosAprovados();
      state.pedidos = Array.isArray(pedidos)
        ? pedidos.filter(pedidoComercialAprovado)
        : [];

      const planejamentoRows = await safeSelect("planejamentos_logisticos", "*", { order: { field: "created_at", ascending: false } });
      state.planejamentos = Array.isArray(planejamentoRows) ? planejamentoRows : [];
      state.dbStatus.planejamentos = Array.isArray(planejamentoRows);

      const caminhoes = await safeSelect("caminhoes", "*", { order: { field: "created_at", ascending: false } });
      state.caminhoes = Array.isArray(caminhoes) ? caminhoes : [];
      state.dbStatus.caminhoes = Array.isArray(caminhoes);

      const colaboradores = await safeSelect("colaboradores", "*", { order: { field: "created_at", ascending: false } });
      state.colaboradores = Array.isArray(colaboradores) ? colaboradores : [];
      state.dbStatus.colaboradores = Array.isArray(colaboradores);

      const dataFiltro = els.planejamentoFiltroData.value || isoHoje();
      const inicio = `${dataFiltro}T00:00:00`;
      const fim = `${dataFiltro}T23:59:59`;
      const agendaCaminhoes = await safeSelect("planejamento_caminhoes", "*, planejamento:planejamento_id(pedido_id,status)", {
        empresa: false,
        gte: { field: "data_inicio", value: inicio },
        lt: { field: "data_inicio", value: fim },
        order: { field: "data_inicio", ascending: true }
      });
      const agendaEquipe = await safeSelect("planejamento_equipe", "*, planejamento:planejamento_id(pedido_id,status)", {
        empresa: false,
        gte: { field: "data_inicio", value: inicio },
        lt: { field: "data_inicio", value: fim },
        order: { field: "data_inicio", ascending: true }
      });
      state.agenda = [
        ...(Array.isArray(agendaCaminhoes) ? agendaCaminhoes.map((row) => ({ ...row, tipo_recurso: "caminhao" })) : []),
        ...(Array.isArray(agendaEquipe) ? agendaEquipe.map((row) => ({ ...row, tipo_recurso: "equipe" })) : [])
      ];
      state.dbStatus.caminhoesPlanejamento = Array.isArray(agendaCaminhoes);
      state.dbStatus.equipePlanejamento = Array.isArray(agendaEquipe);
    }catch(error){
      console.error("[Planejamento] Erro ao carregar dados:", error);
      avisar("Nao foi possivel carregar todos os dados do planejamento.", "Planejamento", "erro");
    }

    recursosMock();
    renderTudo();
    window.finalizarCarregamentoModulo?.();
  }

  function pedidosFiltrados(){
    const busca = (els.planejamentoFiltroBusca.value || "").toLowerCase().trim();
    const situacao = els.planejamentoFiltroSituacao.value;
    const data = els.planejamentoFiltroData.value;

    return state.pedidos.filter((pedido) => {
      const status = statusPlanejamento(pedido);
      const matchSituacao = !situacao || status.includes(situacao);
      const matchBusca = !busca || getPedidoTexto(pedido).includes(busca);
      const matchData = !data || String(dataBasePedido(pedido)).slice(0, 10) === data || !pedidoJaConfirmado(pedido);
      return matchSituacao && matchBusca && matchData;
    });
  }

  function renderPedidos(){
    const pedidos = pedidosFiltrados();
    els.planejamentoQtdPedidos.textContent = pedidos.length;
    if(!pedidos.length){
      els.planejamentoPedidosLista.innerHTML = `<div class="empty-state-mini">Nenhum pedido aprovado aguardando planejamento.</div>`;
      return;
    }

    els.planejamentoPedidosLista.innerHTML = pedidos.map((pedido) => {
      const necessidade = calcularNecessidade(pedido);
      const status = statusPlanejamento(pedido);
      const active = pedido.id === state.selectedPedidoId ? " active" : "";
      return `
        <article class="pedido-card${active}" data-pedido-id="${escapeHtml(pedido.id)}">
          <div class="pedido-card-top">
            <span class="pedido-numero">Pedido #${escapeHtml(getPedidoNumero(pedido))}</span>
            <span class="status-pill status-${escapeHtml(status || "aguardando")}">${escapeHtml(status || "aguardando")}</span>
          </div>
          <h3>${escapeHtml(pedido.cliente_nome || "Cliente")}</h3>
          <p>${escapeHtml(pedido.local_nome || "Local nao informado")} · ${escapeHtml(formatDate(dataBasePedido(pedido)))}</p>
          <div class="pedido-necessidade">
            <div><span>Caminhoes</span><strong>${necessidade.caminhoes} ${escapeHtml(necessidade.tipo)}</strong></div>
            <div><span>Pessoas</span><strong>${necessidade.pessoas}</strong></div>
          </div>
          <div class="pedido-card-footer">
            <span class="metric-soft"><span>Status</span><strong>Aguardando</strong></span>
            <button type="button" class="btn secondary" data-planejar-id="${escapeHtml(pedido.id)}">Planejar</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function statusRecurso(resource){
    const status = normalizarStatus(resource.status || "");
    if(status.includes("inativo") || status.includes("indispon")) return "Indisponivel";
    if(status.includes("reserv")) return "Reservado";
    return "Disponivel";
  }

  function recursoDisponivel(resource){
    return statusRecurso(resource) === "Disponivel";
  }

  function renderPedidoDetalhe(){
    const pedido = pedidoSelecionado();
    els.planejamentoPedidoVazio.classList.toggle("hidden", !!pedido);
    els.planejamentoPedidoDetalhe.classList.toggle("hidden", !pedido);
    if(!pedido) return;

    const necessidade = calcularNecessidade(pedido);
    const status = statusPlanejamento(pedido) || "aguardando";
    els.planejamentoPedidoStatus.textContent = status;
    els.planejamentoPedidoStatus.className = `status-pill status-${status.includes("confirm") ? "confirmado" : status.includes("parcial") ? "parcial" : "aguardando"}`;
    els.planejamentoPedidoTitulo.textContent = `Pedido #${getPedidoNumero(pedido)}`;
    els.planejamentoPedidoSubtitulo.textContent = `${pedido.cliente_nome || "Cliente"} - ${pedido.local_nome || "Local"}`;
    els.planejamentoDataEntrega.textContent = formatDate(pedido.data_entrega);
    els.planejamentoDataEvento.textContent = formatDate(pedido.data_evento || pedido.data_hora);
    els.planejamentoDataColeta.textContent = formatDate(pedido.data_coleta);
    els.planejamentoNecessidadeResumo.textContent = `${necessidade.caminhoes} Caminhao(es) ${necessidade.tipo} · ${necessidade.pessoas} Pessoas`;
    els.planejamentoCaminhoesNecessarios.textContent = necessidade.caminhoes;
    els.planejamentoPessoasNecessarias.textContent = necessidade.pessoas;

    renderRecursos();
    renderValidacao();
  }

  function renderRecursos(){
    els.planejamentoCaminhoesLista.innerHTML = state.caminhoes.map((cam) => {
      const selected = state.selectedCaminhoes.has(String(cam.id));
      const nome = cam.nome || cam.modelo || cam.placa || "Caminhao";
      const status = statusRecurso(cam);
      return `
        <article class="recurso-card${selected ? " selected" : ""}">
          <div class="recurso-icon">
            ${cam.foto_url ? `<img src="${escapeHtml(cam.foto_url)}" alt="${escapeHtml(nome)}">` : `<i data-lucide="truck"></i>`}
          </div>
          <div class="recurso-main">
            <strong>${escapeHtml(nome)}</strong>
            <span>${escapeHtml(cam.placa || "-")} · ${escapeHtml(cam.categoria || cam.tipo || "-")} · ${Number(cam.capacidade_m3 || cam.capacidade || 0).toLocaleString("pt-BR")} m3</span>
            <span>${escapeHtml(status)}</span>
          </div>
          <button type="button" class="btn-icon" data-toggle-caminhao="${escapeHtml(cam.id)}" ${!recursoDisponivel(cam) && !selected ? "disabled" : ""} title="${selected ? "Remover" : "Selecionar"}">
            <i data-lucide="${selected ? "minus" : "plus"}"></i>
          </button>
        </article>
      `;
    }).join("") || `<div class="empty-state-mini">Nenhum caminhao cadastrado.</div>`;

    els.planejamentoEquipeLista.innerHTML = state.colaboradores.map((pessoa) => {
      const selected = state.selectedEquipe.has(String(pessoa.id));
      const nome = pessoa.nome || pessoa.name || "Colaborador";
      const status = statusRecurso(pessoa);
      return `
        <article class="recurso-card${selected ? " selected" : ""}">
          <div class="recurso-icon">
            ${pessoa.foto_url ? `<img src="${escapeHtml(pessoa.foto_url)}" alt="${escapeHtml(nome)}">` : `<i data-lucide="user-round"></i>`}
          </div>
          <div class="recurso-main">
            <strong>${escapeHtml(nome)}</strong>
            <span>${escapeHtml(pessoa.funcao || pessoa.cargo || "Equipe")} · ${escapeHtml(pessoa.telefone || "-")}</span>
            <span>${escapeHtml(status)}</span>
          </div>
          <button type="button" class="btn-icon" data-toggle-equipe="${escapeHtml(pessoa.id)}" ${!recursoDisponivel(pessoa) && !selected ? "disabled" : ""} title="${selected ? "Remover" : "Selecionar"}">
            <i data-lucide="${selected ? "minus" : "plus"}"></i>
          </button>
        </article>
      `;
    }).join("") || `<div class="empty-state-mini">Nenhum colaborador cadastrado.</div>`;

    if(window.lucide) lucide.createIcons();
  }

  function conflitosAtuais(){
    const pedido = pedidoSelecionado();
    if(!pedido) return [];
    const data = String(dataBasePedido(pedido)).slice(0, 10);
    const conflitos = [];

    for(const agenda of state.agenda){
      const inicio = String(agenda.data_inicio || "").slice(0, 10);
      if(inicio !== data) continue;
      if(agenda.planejamento?.pedido_id === pedido.id) continue;
      if(agenda.tipo_recurso === "caminhao" && state.selectedCaminhoes.has(String(agenda.caminhao_id))){
        conflitos.push({ recurso: "Caminhao", pedido: agenda.planejamento?.pedido_id || "-", horario: String(agenda.data_inicio || "").slice(11, 16) || "08:00", motivo: "Ja reservado no mesmo dia" });
      }
      if(agenda.tipo_recurso === "equipe" && state.selectedEquipe.has(String(agenda.colaborador_id))){
        conflitos.push({ recurso: "Equipe", pedido: agenda.planejamento?.pedido_id || "-", horario: String(agenda.data_inicio || "").slice(11, 16) || "08:00", motivo: "Colaborador ja escalado no mesmo dia" });
      }
    }
    return conflitos;
  }

  function renderValidacao(){
    const pedido = pedidoSelecionado();
    if(!pedido) return;
    const necessidade = calcularNecessidade(pedido);
    const qtdCam = state.selectedCaminhoes.size;
    const qtdEquipe = state.selectedEquipe.size;
    const conflitos = conflitosAtuais();

    els.planejamentoResumoCaminhoes.textContent = `${qtdCam} / ${necessidade.caminhoes} caminhoes alocados`;
    els.planejamentoAlertaCaminhoes.textContent = qtdCam < necessidade.caminhoes ? "Pendente" : qtdCam > necessidade.caminhoes ? "Excesso" : "Completo";
    els.planejamentoAlertaCaminhoes.className = `badge-alerta ${qtdCam === necessidade.caminhoes ? "ok" : qtdCam > necessidade.caminhoes ? "excesso" : ""}`;

    els.planejamentoResumoEquipe.textContent = `${qtdEquipe} / ${necessidade.pessoas} pessoas alocadas`;
    els.planejamentoAlertaEquipe.textContent = qtdEquipe < necessidade.pessoas ? "Pendente" : qtdEquipe > necessidade.pessoas ? "Excesso" : "Completo";
    els.planejamentoAlertaEquipe.className = `badge-alerta ${qtdEquipe === necessidade.pessoas ? "ok" : qtdEquipe > necessidade.pessoas ? "excesso" : ""}`;

    els.planejamentoQtdConflitos.textContent = conflitos.length;
    els.planejamentoConflitosLista.innerHTML = conflitos.length
      ? conflitos.map((c) => `<div class="conflito-item"><strong>${escapeHtml(c.recurso)} - ${escapeHtml(c.motivo)}</strong><span>Pedido ${escapeHtml(c.pedido)} · ${escapeHtml(c.horario)}</span></div>`).join("")
      : `<div class="empty-state-mini">Nenhum conflito bloqueante encontrado.</div>`;

    els.btnConfirmarPlanejamento.disabled = !(qtdCam >= necessidade.caminhoes && qtdEquipe >= necessidade.pessoas && conflitos.length === 0);
  }

  function agendaBlocksPara(resourceId, tipo, horario){
    const data = els.planejamentoFiltroData.value || isoHoje();
    return state.agenda.filter((item) => {
      const inicio = String(item.data_inicio || "");
      const sameDay = inicio.slice(0, 10) === data;
      const sameHour = !inicio || inicio.slice(11, 13) === horario.slice(0, 2);
      const sameResource = tipo === "caminhao"
        ? String(item.caminhao_id) === String(resourceId)
        : String(item.colaborador_id) === String(resourceId);
      return sameDay && sameHour && sameResource;
    });
  }

  function renderAgenda(){
    const recursos = state.agendaTab === "caminhoes" ? state.caminhoes : state.colaboradores;
    const tipo = state.agendaTab === "caminhoes" ? "caminhao" : "equipe";

    if(!recursos.length){
      els.planejamentoAgendaGrade.innerHTML = `<div class="empty-state-mini">Nenhum recurso para exibir na agenda.</div>`;
      return;
    }

    els.planejamentoAgendaGrade.innerHTML = recursos.slice(0, 8).map((recurso) => {
      const nome = recurso.nome || recurso.modelo || recurso.placa || "Recurso";
      return `
        <div class="agenda-row">
          <div class="agenda-resource">${escapeHtml(nome)}</div>
          ${HORARIOS.map((h) => {
            const blocks = agendaBlocksPara(recurso.id, tipo, h);
            if(!blocks.length) return `<div class="agenda-cell"><span>${h}</span><br>Livre</div>`;
            return `<div class="agenda-cell">${blocks.map((b) => `
              <div class="agenda-block ${escapeHtml(normalizarStatus(b.status || b.planejamento?.status || "planejado"))}">
                <span>${escapeHtml(h)}</span>
                <strong>${escapeHtml(b.numero_pedido || b.pedido || "Pedido")}</strong>
                <small>${escapeHtml(b.local_nome || b.tipo_operacao || "Planejado")}</small>
              </div>
            `).join("")}</div>`;
          }).join("")}
        </div>
      `;
    }).join("");
  }

  function renderTudo(){
    renderPedidos();
    renderPedidoDetalhe();
    renderAgenda();
  }

  function selecionarPedido(pedidoId){
    state.selectedPedidoId = pedidoId;
    state.selectedCaminhoes.clear();
    state.selectedEquipe.clear();

    const planejamento = getPlanejamentoPedido(pedidoId);
    if(planejamento){
      state.agenda
        .filter((item) => item.planejamento_id === planejamento.id)
        .forEach((item) => {
          if(item.caminhao_id) state.selectedCaminhoes.add(String(item.caminhao_id));
          if(item.colaborador_id) state.selectedEquipe.add(String(item.colaborador_id));
        });
    }

    renderTudo();
  }

  function toggleSet(set, id){
    const key = String(id);
    if(set.has(key)) set.delete(key);
    else set.add(key);
  }

  function montarPeriodoPedido(pedido){
    const base = String(pedido.data_entrega || pedido.data_evento || isoHoje()).slice(0, 10);
    return {
      inicio: `${base}T08:00:00`,
      fim: `${base}T18:00:00`
    };
  }

  async function confirmarPlanejamento(){
    const pedido = pedidoSelecionado();
    if(!pedido || els.btnConfirmarPlanejamento.disabled) return;

    if(!state.supabase || !state.empresaId){
      avisar("Planejamento validado na tela. Conecte o Supabase para salvar definitivamente.", "Planejamento", "aviso");
      return;
    }

    const periodo = montarPeriodoPedido(pedido);
    const payloadPlanejamento = {
      empresa_id: state.empresaId,
      pedido_id: pedido.id,
      status: "confirmado",
      data_planejamento: new Date().toISOString(),
      observacoes: {
        origem: "Planejamento Logistico",
        caminhoes: Array.from(state.selectedCaminhoes),
        equipe: Array.from(state.selectedEquipe)
      },
      updated_at: new Date().toISOString()
    };

    try{
      let planejamentoId = getPlanejamentoPedido(pedido.id)?.id;
      if(state.dbStatus.planejamentos){
        const existente = await state.supabase
          .from("planejamentos_logisticos")
          .select("id")
          .eq("empresa_id", state.empresaId)
          .eq("pedido_id", pedido.id)
          .maybeSingle();
        if(existente.error && !isTabelaAusente(existente.error)) throw existente.error;

        if(existente.data?.id){
          planejamentoId = existente.data.id;
          const { error } = await state.supabase
            .from("planejamentos_logisticos")
            .update(payloadPlanejamento)
            .eq("id", planejamentoId);
          if(error) throw error;
        }else{
          const { data, error } = await state.supabase
            .from("planejamentos_logisticos")
            .insert({ ...payloadPlanejamento, created_at: new Date().toISOString() })
            .select("id")
            .single();
          if(error) throw error;
          planejamentoId = data?.id || planejamentoId;
        }
      }

      if(planejamentoId && state.dbStatus.caminhoesPlanejamento){
        await state.supabase.from("planejamento_caminhoes").delete().eq("planejamento_id", planejamentoId);
        const rows = Array.from(state.selectedCaminhoes).map((caminhaoId) => ({
          planejamento_id: planejamentoId,
          caminhao_id: caminhaoId,
          tipo_operacao: "operacao_pedido",
          data_inicio: periodo.inicio,
          data_fim: periodo.fim
        }));
        if(rows.length){
          const { error } = await state.supabase.from("planejamento_caminhoes").insert(rows);
          if(error) throw error;
        }
      }

      if(planejamentoId && state.dbStatus.equipePlanejamento){
        await state.supabase.from("planejamento_equipe").delete().eq("planejamento_id", planejamentoId);
        const rows = Array.from(state.selectedEquipe).map((colaboradorId) => ({
          planejamento_id: planejamentoId,
          colaborador_id: colaboradorId,
          funcao_na_operacao: "operacao",
          data_inicio: periodo.inicio,
          data_fim: periodo.fim
        }));
        if(rows.length){
          const { error } = await state.supabase.from("planejamento_equipe").insert(rows);
          if(error) throw error;
        }
      }

      const nomesCaminhoes = state.caminhoes
        .filter((cam) => state.selectedCaminhoes.has(String(cam.id)))
        .map((cam) => cam.nome || cam.modelo || cam.placa)
        .filter(Boolean)
        .join(" | ");
      const nomesEquipe = state.colaboradores
        .filter((p) => state.selectedEquipe.has(String(p.id)))
        .map((p) => p.nome)
        .filter(Boolean)
        .join(" | ");

      await atualizarPedidoPlanejado(pedido, nomesCaminhoes, nomesEquipe);
      await atualizarCronograma(pedido, nomesCaminhoes, nomesEquipe);

      avisar("Planejamento confirmado e enviado para o cronograma.", "Planejamento", "sucesso");
      await carregarDados();
    }catch(error){
      console.error("[Planejamento] Erro ao confirmar:", error);
      avisar("Nao foi possivel salvar o planejamento. Verifique as tabelas de planejamento no Supabase.", "Planejamento", "erro");
    }
  }

  async function atualizarPedidoPlanejado(pedido, caminhoes, equipe){
    const obs = parseObservacoes(pedido);
    obs.planejamento_logistico_status = "confirmado";
    obs.planejamento_logistico = {
      caminhoes,
      equipe,
      confirmado_em: new Date().toISOString()
    };
    const payloadCompleto = {
      status_planejamento: "confirmado",
      observacoes: obs,
      updated_at: new Date().toISOString()
    };
    let { error } = await state.supabase
      .from("separacoes_pedidos")
      .update(payloadCompleto)
      .eq("empresa_id", state.empresaId)
      .eq("id", pedido.id);
    if(error && isTabelaAusente(error)){
      const fallback = await state.supabase
        .from("separacoes_pedidos")
        .update({ observacoes: obs })
        .eq("empresa_id", state.empresaId)
        .eq("id", pedido.id);
      error = fallback.error;
    }
    if(error && !isTabelaAusente(error)) throw error;
  }

  async function atualizarCronograma(pedido, caminhoes, equipe){
    const etapas = [
      { etapa: "Carregamento", data: pedido.data_entrega || pedido.data_evento, obs: "Recursos definidos no planejamento logistico." },
      { etapa: "Montagem", data: pedido.data_entrega || pedido.data_evento, obs: "Equipe definida no planejamento logistico." },
      { etapa: "Desmontagem", data: pedido.data_coleta || pedido.data_evento, obs: "Recursos definidos no planejamento logistico." }
    ].filter((row) => row.data);

    for(const item of etapas){
      const payload = {
        empresa_id: state.empresaId,
        pedido_id: pedido.id,
        numero_pedido: getPedidoNumero(pedido),
        cliente_nome: pedido.cliente_nome,
        local_nome: pedido.local_nome,
        etapa: item.etapa,
        data_etapa: String(item.data).slice(0, 10),
        horario: "08:00",
        caminhao: caminhoes,
        equipe,
        observacao: item.obs,
        status: "planejado"
      };

      const existente = await state.supabase
        .from("cronograma_logistico")
        .select("id")
        .eq("empresa_id", state.empresaId)
        .eq("pedido_id", pedido.id)
        .eq("etapa", item.etapa)
        .maybeSingle();

      if(existente.error && !isTabelaAusente(existente.error)){
        console.warn("[Planejamento] Cronograma nao consultado:", existente.error);
        continue;
      }

      const resposta = existente.data?.id
        ? await state.supabase
          .from("cronograma_logistico")
          .update(payload)
          .eq("id", existente.data.id)
        : await state.supabase
        .from("cronograma_logistico")
        .insert(payload);
      if(resposta.error && !isTabelaAusente(resposta.error)) console.warn("[Planejamento] Cronograma nao atualizado:", resposta.error);
    }
  }

  function bindEvents(){
    [els.planejamentoFiltroData, els.planejamentoFiltroRecurso, els.planejamentoFiltroSituacao, els.planejamentoFiltroBusca].forEach((el) => {
      el?.addEventListener("input", renderTudo);
      el?.addEventListener("change", () => {
        if(el === els.planejamentoFiltroData) carregarDados();
        else renderTudo();
      });
    });

    els.planejamentoPedidosLista?.addEventListener("click", (event) => {
      const planejar = event.target.closest("[data-planejar-id]");
      const card = event.target.closest("[data-pedido-id]");
      const id = planejar?.dataset.planejarId || card?.dataset.pedidoId;
      if(id) selecionarPedido(id);
    });

    els.planejamentoCaminhoesLista?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-toggle-caminhao]");
      if(!btn || btn.disabled) return;
      toggleSet(state.selectedCaminhoes, btn.dataset.toggleCaminhao);
      renderPedidoDetalhe();
    });

    els.planejamentoEquipeLista?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-toggle-equipe]");
      if(!btn || btn.disabled) return;
      toggleSet(state.selectedEquipe, btn.dataset.toggleEquipe);
      renderPedidoDetalhe();
    });

    document.querySelectorAll("[data-agenda-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.agendaTab = btn.dataset.agendaTab;
        document.querySelectorAll("[data-agenda-tab]").forEach((el) => el.classList.toggle("active", el === btn));
        renderAgenda();
      });
    });

    els.btnLimparSelecaoPlanejamento?.addEventListener("click", () => {
      state.selectedPedidoId = null;
      state.selectedCaminhoes.clear();
      state.selectedEquipe.clear();
      renderTudo();
    });

    els.btnConfirmarPlanejamento?.addEventListener("click", confirmarPlanejamento);
    els.btnAgendaPlanejamento?.addEventListener("click", () => {
      if(typeof window.carregarNaMain === "function"){
        window.carregarNaMain(
          "Modulos/Logistica/Cronograma/Cronograma.html",
          "Modulos/Logistica/Cronograma/Cronograma.js",
          null,
          "Modulos/Logistica/Cronograma/Cronograma.css"
        );
      }
    });
    els.btnNovoPlanejamento?.addEventListener("click", () => {
      els.planejamentoFiltroSituacao.value = "aguardando";
      state.selectedPedidoId = null;
      renderTudo();
    });
  }

  window.__moduleInit = async function initPlanejamentoLogistico(){
    cacheEls();
    bindEvents();
    await carregarDados();
    if(window.lucide) lucide.createIcons();
  };
})();
