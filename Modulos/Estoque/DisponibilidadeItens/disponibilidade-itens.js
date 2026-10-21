(function () {
  "use strict";

  const state = {
    itens: [],
    patrimonios: [],
    reservas: [],
    rows: [],
    visibleCount: 20,
    offset: 0,
    hasMore: true,
    loading: false,
    generation: 0,
    perPage: 20,
    initialized: false
  };
  let catalogo = new Map();
  let composicoes = new Map();
  let fatoresCache = new Map();
  let materiaisCarregados = new Set();
  let scrollEvents = null;
  let scrollPositions = new WeakMap();
  let filterTimer = null;
  let detalheAtual = null;
  let detalheVersao = 0;
  let retornoLista = null;
  let simulacao = null;
  let filtrosAntesSimulacao = null;
  const bloqueiosPorData = new Map();
  async function carregarBloqueios(data, atualizar = false){
    if(!atualizar && bloqueiosPorData.has(data)) return;
    const generation = state.generation;
    const { data: rows, error } = await sb().rpc("operacao_indisponiveis", { p_empresa: empresaId(), p_data: data });
    if(error) throw error;
    if (generation === state.generation) bloqueiosPorData.set(data, new Map((rows || []).map(r => [r.item_id,Number(r.quantidade)])));
  }

  const sb = () => simulacao?.client || window.supabaseClient || window.supabase;
  const empresaId = () => window.__CONTEXT?.empresa_id || window.empresa_id || null;
  const $ = (selector, root = document) => root.querySelector(selector);

  function criarSemanaSimulada(referencia) {
    const segunda = new Date(`${referencia}T00:00:00Z`);
    segunda.setUTCDate(segunda.getUTCDate() + ((8 - segunda.getUTCDay()) % 7));
    const datas = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(segunda);
      date.setUTCDate(date.getUTCDate() + i);
      return date.toISOString().slice(0, 10);
    });
    const empresa = empresaId();
    const item = (id, produto, tipo, total, manutencao = 0) => ({
      id: `sim-${id}`, codigo: `SIM-${id}`, produto, tipo, estoque_total: total,
      estoque_manutencao: manutencao, empresa_id: empresa, categoria: "Semana simulada"
    });
    const itens = [
      item("01-estante", "Estante modular", "Kit", 0),
      item("02-buffet", "Buffet com duas bases", "Kit", 0),
      item("03-mesa", "Mesa de apoio", "Kit", 0),
      item("04-base", "Base compartilhada", "Componente", 8),
      item("05-topo", "Parte superior da estante", "Componente", 6),
      item("06-prateleira", "Prateleira da estante", "Componente", 10),
      item("07-buffet", "Tampo do buffet", "Componente", 8),
      item("08-mesa", "Tampo da mesa", "Componente", 6, 1)
    ];
    const partes = [
      ["01-estante", "04-base", 1], ["01-estante", "05-topo", 1], ["01-estante", "06-prateleira", 2],
      ["02-buffet", "04-base", 2], ["02-buffet", "07-buffet", 1],
      ["03-mesa", "04-base", 1], ["03-mesa", "08-mesa", 1]
    ].map(([kit, componente, quantidade]) => ({ kit_id: `sim-${kit}`, item_id: `sim-${componente}`, quantidade, empresa_id: empresa }));
    const reserva = (numero, produto, qtd, de, ate, cliente, evento, status = "aprovado") => ({
      id: `sim-linha-${numero}`, empresa_id: empresa, item_id: `sim-${produto}`, quantidade_solicitada: qtd,
      separacoes_pedidos: {
        id: `sim-pedido-${numero}`, numero_pedido: `SIM-${numero}`, cliente_nome: cliente,
        tipo_evento: evento, local_nome: "Espaço de demonstração", status_comercial: status,
        data_entrega: datas[de], data_coleta: datas[ate], data_evento: datas[de]
      }
    });
    const reservas = [
      reserva("101", "01-estante", 3, 0, 1, "Mostra de decoração", "Exposição"),
      reserva("102", "03-mesa", 2, 0, 2, "Lançamento Aurora", "Corporativo"),
      reserva("103", "02-buffet", 1, 1, 3, "Jantar Oliveira", "Jantar"),
      reserva("104", "04-base", 1, 2, 3, "Cenografia Lima", "Locação avulsa"),
      reserva("105", "01-estante", 2, 3, 5, "Feira de design", "Feira"),
      reserva("106", "02-buffet", 2, 4, 5, "Casamento Jardim", "Casamento"),
      reserva("107", "03-mesa", 2, 4, 6, "Recepção Horizonte", "Recepção"),
      reserva("108", "01-estante", 2, 6, 6, "Brunch de domingo", "Social"),
      reserva("109", "02-buffet", 20, 4, 5, "Orçamento de exemplo", "Não ocupa estoque", "orcamento"),
      reserva("110", "01-estante", 20, 4, 5, "Pedido cancelado", "Não ocupa estoque", "cancelado")
    ];
    const tabelas = { itens, kit_itens: partes, separacoes_itens: reservas, itens_patrimonios: [] };
    // Fonte de demonstração apenas para leitura. Nenhum método de gravação é exposto.
    const client = {
      from(tabela) {
        if (!Object.hasOwn(tabelas, tabela)) throw new Error("Tabela não disponível na simulação.");
        const filtros = [], ordens = [];
        let faixa = null;
        const query = {
          select() { return query; },
          eq(coluna, valor) { filtros.push(row => row[coluna] === valor); return query; },
          in(coluna, valores) { filtros.push(row => valores.includes(row[coluna])); return query; },
          order(coluna) { ordens.push(coluna); return query; },
          range(inicio, fim) { faixa = [inicio, fim]; return query; },
          then(resolve, reject) {
            let rows = tabelas[tabela].filter(row => filtros.every(filtro => filtro(row)));
            if (ordens.length) rows.sort((a, b) => {
              for (const coluna of ordens) {
                const comparacao = String(a[coluna] || "").localeCompare(String(b[coluna] || ""));
                if (comparacao) return comparacao;
              }
              return 0;
            });
            if (faixa) rows = rows.slice(faixa[0], faixa[1] + 1);
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          }
        };
        return query;
      },
      async rpc(nome) {
        if (nome !== "operacao_indisponiveis") throw new Error("Operação não disponível na simulação.");
        return { data: [], error: null };
      }
    };
    return { client, datas, periodo: { inicio: datas[0], fim: datas[6] } };
  }

  async function iniciarSimulacao() {
    if (simulacao) return;
    clearTimeout(filterTimer);
    filtrosAntesSimulacao = Object.fromEntries(["disponData", "disponBusca", "disponCategoria", "disponStatus"].map(id => [id, $("#" + id).value]));
    simulacao = criarSemanaSimulada(selectedDate());
    $("#disponData").value = simulacao.datas[4];
    $("#disponBusca").value = "";
    $("#disponCategoria").innerHTML = '<option value="">Todas</option>';
    $("#disponStatus").value = "";
    $("#disponSimulacaoAviso").hidden = false;
    $("#disponSimulacaoRoteiro").hidden = false;
    $("#btnSimularSemana").hidden = true;
    await resetRowsAndRender();
  }

  async function sairSimulacao() {
    if (!simulacao) return;
    if (detalheAtual) voltarParaLista();
    clearTimeout(filterTimer);
    simulacao = null;
    $("#disponSimulacaoAviso").hidden = true;
    $("#disponSimulacaoRoteiro").hidden = true;
    $("#btnSimularSemana").hidden = false;
    $("#disponCategoria").innerHTML = '<option value="">Todas</option>';
    const anteriores = filtrosAntesSimulacao;
    for (const id of ["disponData", "disponBusca", "disponStatus"]) $("#" + id).value = anteriores[id];
    // Mantém a categoria durante o primeiro cálculo, antes de recarregar as opções reais.
    if (anteriores.disponCategoria) $("#disponCategoria").add(new Option(anteriores.disponCategoria, anteriores.disponCategoria, true, true));
    filtrosAntesSimulacao = null;
    await resetRowsAndRender();
  }

  function renderizarRoteiroSimulacao() {
    if (!simulacao) return;
    const nomes = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    $("#disponSimulacaoDias").innerHTML = simulacao.datas.map((data, index) =>
      `<button type="button" data-sim-dia="${data}" aria-pressed="${data === selectedDate()}">${nomes[index]}<span>${formatDate(data)}</span></button>`).join("");
  }

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function number(value) {
    return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }

  function formatDate(value) {
    if (!value) return "-";
    const iso = String(value).slice(0, 10);
    const date = new Date(`${iso}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
  }

  function statusLabel(status) {
    return {
      disponivel: "Disponivel",
      atencao: "Atencao",
      indisponivel: "Indisponivel"
    }[status] || status;
  }

  function itemPhoto(item) {
    return item.foto_url
      || item.imagem_url
      || item.foto
      || item.url_foto
      || item.image_url
      || "";
  }

  async function getRows(table, ids) {
    const result = [];
    for (let offset = 0; ; offset += 1000) {
      let query = sb().from(table).select("*").order("id");
      if (empresaId()) query = query.eq("empresa_id", empresaId());
      const { data, error } = await query.in("item_id", ids).range(offset, offset + 999);
      if (error) throw error;
      result.push(...(data || []));
      if ((data || []).length < 1000) return result;
    }
  }

  async function loadAll() {
    const periodo = selectedPeriod();
    const generation = ++state.generation;
    catalogo = new Map();
    composicoes = new Map();
    fatoresCache = new Map();
    materiaisCarregados = new Set();
    bloqueiosPorData.clear();
    Object.assign(state, { itens: [], patrimonios: [], reservas: [], rows: [], offset: 0,
      hasMore: true, loading: false, visibleCount: state.perPage });
    $("#disponTabela").innerHTML = "";
    $("#disponMais").hidden = true;
    $("#disponErro").hidden = true;
    $("#disponErro").textContent = "";
    renderizarRoteiroSimulacao();
    await carregarComposicoes(generation);
    await carregarBloqueios(periodo.inicio, true);
    if (generation !== state.generation) return;
    await loadMore(generation);
    if (generation === state.generation) await loadCategories(generation);
  }

  async function loadMore(generation = state.generation) {
    if (state.loading || !state.hasMore || generation !== state.generation) return;
    state.loading = true;
    try {
      do {
        let query = sb().from("itens").select("*").order("id");
        if (empresaId()) query = query.eq("empresa_id", empresaId());
        const { data, error } = await query.range(state.offset, state.offset + state.perPage - 1);
        if (error) throw error;
        if (generation !== state.generation) return;
        const items = data || [];
        await carregarMateriais(items, generation);
        if (generation !== state.generation) return;
        state.itens.push(...items);
        state.offset += items.length;
        state.hasMore = items.length === state.perPage;
        buildRows();
      } while (state.hasMore && filteredRows().length < state.visibleCount);
      fillCategories();
      render(true);
    } catch (error) {
      if (generation === state.generation) {
        window.alerta?.(error.message, "Disponibilidade", "erro");
        const sentinel = $("#disponMais");
        if (sentinel) { sentinel.hidden = false; sentinel.textContent = "Falha ao carregar. Clique para tentar novamente."; }
      }
    } finally {
      if (generation === state.generation) state.loading = false;
    }
  }

  async function loadReservas(ids) {
    if (!sb()) return [];
    let query = sb()
      .from("separacoes_itens")
      .select(`
        id,
        item_id,
        quantidade_solicitada,
        separacoes_pedidos(
          id,
          numero_pedido,
          cliente_nome,
          tipo_evento,
          local_nome,
          data_hora,
          data_evento,
          data_evento_fim,
          data_entrega,
          data_coleta,
          status,
          status_comercial,
          encerrado_operacional_em
        )
      `);
    if (empresaId()) query = query.eq("empresa_id", empresaId());
    const result = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await query.in("item_id", ids).order("id").range(offset, offset + 999);
      if (error) throw error;
      result.push(...(data || []));
      if ((data || []).length < 1000) return result;
    }
  }

  function selectedDate() {
    return $("#disponData")?.value || new Date().toISOString().slice(0, 10);
  }

  function selectedPeriod() {
    const inicio = selectedDate();
    return { inicio, fim: inicio };
  }

  function diaSeguinte(value) {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  function periodoPedido(pedido) {
    const inicio = String(pedido.data_entrega || pedido.data_evento || pedido.data_hora || "").slice(0, 10);
    const fim = String(pedido.data_coleta || pedido.data_evento_fim || pedido.data_evento || pedido.data_hora || inicio).slice(0, 10);
    return { inicio, fim: fim < inicio ? inicio : fim };
  }

  async function carregarComposicoes(generation) {
    const mapa = new Map();
    for (let offset = 0; ; offset += 1000) {
      let query = sb().from("kit_itens").select("kit_id,item_id,quantidade").order("kit_id").order("item_id");
      if (empresaId()) query = query.eq("empresa_id", empresaId());
      const { data, error } = await query.range(offset, offset + 999);
      if (error) throw error;
      if (generation !== state.generation) return;
      (data || []).forEach(row => {
        if (!mapa.has(row.kit_id)) mapa.set(row.kit_id, []);
        mapa.get(row.kit_id).push(row);
      });
      if ((data || []).length < 1000) break;
    }
    composicoes = mapa;
  }

  function fatoresDoItem(id, caminho = new Set()) {
    if (fatoresCache.has(id)) return fatoresCache.get(id);
    if (caminho.has(id)) throw new Error("Composição circular de kit. Revise o cadastro.");
    const item = catalogo.get(id);
    if (!item) throw new Error("Componente não encontrado no cadastro.");
    const partes = composicoes.get(id) || [];
    if (!partes.length) {
      if (normalize(item.tipo) === "kit") throw new Error("Kit sem componentes cadastrados.");
      return new Map([[id, 1]]);
    }
    const fatores = new Map();
    const proximos = new Set([...caminho, id]);
    partes.forEach(parte => {
      const quantidade = Number(parte.quantidade);
      if (!(quantidade > 0)) throw new Error("Quantidade inválida na composição do kit.");
      fatoresDoItem(parte.item_id, proximos).forEach((fator, componente) => {
        fatores.set(componente, (fatores.get(componente) || 0) + fator * quantidade);
      });
    });
    fatoresCache.set(id, fatores);
    return fatores;
  }

  async function carregarMateriais(items, generation) {
    function descendentes(ids) {
      const encontrados = new Set(ids);
      const fila = [...ids];
      for (let i = 0; i < fila.length; i++) {
        (composicoes.get(fila[i]) || []).forEach(parte => {
          if (!encontrados.has(parte.item_id)) { encontrados.add(parte.item_id); fila.push(parte.item_id); }
        });
      }
      return encontrados;
    }
    // Só as peças consultadas e os kits que as consomem, sem percorrer kits
    // ligados apenas a componentes secundários dos outros kits.
    const ancestrais = descendentes(items.map(item => item.id));
    let mudou = true;
    while (mudou) {
      mudou = false;
      composicoes.forEach((partes, kitId) => {
        if (!ancestrais.has(kitId) && partes.some(parte => ancestrais.has(parte.item_id))) {
          ancestrais.add(kitId);
          mudou = true;
        }
      });
    }
    const relacionados = descendentes([...ancestrais]);
    const novos = [...relacionados].filter(id => !materiaisCarregados.has(id));
    const itensPagina = new Map(items.map(item => [item.id, item]));
    const cadastro = [];
    const patrimonios = [];
    const reservas = [];
    for (let start = 0; start < novos.length; start += 100) {
      const ids = novos.slice(start, start + 100);
      const faltantes = ids.filter(id => !itensPagina.has(id));
      if (faltantes.length) {
        let query = sb().from("itens").select("*").in("id", faltantes);
        if (empresaId()) query = query.eq("empresa_id", empresaId());
        const { data, error } = await query;
        if (error) throw error;
        cadastro.push(...(data || []));
      }
      const [pats, res] = await Promise.all([getRows("itens_patrimonios", ids), loadReservas(ids)]);
      patrimonios.push(...pats);
      reservas.push(...res);
    }
    if (generation !== state.generation) return;
    [...cadastro, ...items].forEach(item => catalogo.set(item.id, item));
    novos.forEach(id => materiaisCarregados.add(id));
    state.patrimonios.push(...patrimonios);
    state.reservas.push(...reservas);
    // O saldo muda apenas nas bordas das reservas e após a previsão de devolução.
    const datas = datasDoPeriodo(selectedPeriod());
    for (let start = 0; start < datas.length; start += 4) {
      await Promise.all(datas.slice(start, start + 4).map(data => carregarBloqueios(data)));
    }
  }

  function datasDoPeriodo(periodo) {
    const datas = new Set([periodo.inicio, periodo.fim]);
    state.reservas.filter(isReservaAtiva).forEach(row => {
      const faixa = periodoPedido(row.separacoes_pedidos || {});
      if (faixa.inicio >= periodo.inicio && faixa.inicio <= periodo.fim) datas.add(faixa.inicio);
      if (faixa.fim && faixa.fim < periodo.fim && faixa.fim >= periodo.inicio) datas.add(diaSeguinte(faixa.fim));
    });
    return [...datas].sort();
  }

  function isReservaAtiva(row) {
    const pedido = row.separacoes_pedidos || {};
    if (pedido.encerrado_operacional_em) return false;
    const status = normalize(pedido.status);
    const comercial = normalize(pedido.status_comercial);
    if (status === "cancelado" || comercial === "cancelado" || comercial === "orcamento") return false;
    return !comercial || ["pre_reserva", "aprovado", "enviado", "finalizado"].includes(comercial);
  }

  function reservasDasPecas(fatores, periodo) {
    function usaPeca(id, visitados = new Set()) {
      if (fatores.has(id)) return true;
      if (visitados.has(id)) return false;
      visitados.add(id);
      return (composicoes.get(id) || []).some(parte => usaPeca(parte.item_id, visitados));
    }
    const reservas = [];
    state.reservas.filter(isReservaAtiva).forEach(row => {
      const faixa = periodoPedido(row.separacoes_pedidos || {});
      if (!faixa.inicio || faixa.inicio > periodo.fim || faixa.fim < periodo.inicio) return;
      if (!usaPeca(row.item_id)) return;
      let consumo;
      try { consumo = fatoresDoItem(row.item_id); }
      catch (error) { throw new Error("Reserva com composi??o inv?lida: " + error.message); }
      consumo.forEach((quantidade, id) => {
        if (!fatores.has(id)) return;
        reservas.push({ ...row, componente_id: id,
          quantidade_componente: quantidade * Number(row.quantidade_solicitada || 0), ...faixa });
      });
    });
    return reservas;
  }

  function totalItem(item) {
    const patrimonioTotal = state.patrimonios.filter(p => p.item_id === item.id && p.status !== "inativo").length;
    return Math.max(0, Number(item.estoque_total ?? item.quantidade_total ?? item.quantidade ?? item.estoque ?? patrimonioTotal));
  }

  function manutencaoItem(item) {
    const patrimonioManutencao = state.patrimonios.filter(p => p.item_id === item.id && p.status === "manutencao").length;
    return Math.max(0, Number(item.estoque_manutencao ?? item.quantidade_manutencao ?? patrimonioManutencao));
  }

  function bloqueioNoDia(itemId, data) {
    // Os bloqueios permanecem iguais entre as bordas das reservas carregadas.
    const referencia = [...bloqueiosPorData.keys()].filter(dia => dia <= data).sort().at(-1);
    return bloqueiosPorData.get(referencia)?.get(itemId) || 0;
  }

  function calcularItem(item, periodo = selectedPeriod()) {
    if (typeof periodo === "string") periodo = { inicio: periodo, fim: periodo };
    const kit = composicoes.has(item.id) || normalize(item.tipo) === "kit";
    try {
      const fatores = fatoresDoItem(item.id);
      const reservas = reservasDasPecas(fatores, periodo);
      const datas = datasDoPeriodo(periodo);
      let total = Infinity, semManutencao = Infinity, disponivel = Infinity;
      let limitante = null;
      const componentes = [];
      fatores.forEach((porKit, id) => {
        const componente = catalogo.get(id);
        const estoque = totalItem(componente);
        let saldo = Infinity, saldoSemManutencao = Infinity, reservadoPico = 0, bloqueadoPico = 0, dataLimitante;
        datas.forEach(data => {
          const reservado = reservas.filter(row => row.componente_id === id && row.inicio <= data && row.fim >= data)
            .reduce((sum, row) => sum + row.quantidade_componente, 0);
          const bloqueado = manutencaoItem(componente) + bloqueioNoDia(id, data);
          const livre = Math.max(0, estoque - bloqueado - reservado);
          if (livre < saldo) { saldo = livre; dataLimitante = data; }
          saldoSemManutencao = Math.min(saldoSemManutencao, Math.max(0, estoque - bloqueado));
          reservadoPico = Math.max(reservadoPico, reservado);
          bloqueadoPico = Math.max(bloqueadoPico, bloqueado);
        });
        const capacidade = kit ? Math.floor(saldo / porKit) : saldo;
        const capacidadeTotal = kit ? Math.floor(estoque / porKit) : estoque;
        const capacidadeManutencao = kit ? Math.floor(saldoSemManutencao / porKit) : saldoSemManutencao;
        total = Math.min(total, capacidadeTotal);
        semManutencao = Math.min(semManutencao, capacidadeManutencao);
        if (capacidade < disponivel) { disponivel = capacidade; limitante = { item: componente, data: dataLimitante }; }
        componentes.push({ item: componente, porKit, total: estoque, reservado: reservadoPico,
          manutencao: bloqueadoPico, disponivel: saldo });
      });
      const manutencao = total - semManutencao;
      const reservado = semManutencao - disponivel;
      const status = disponivel <= 0 ? "indisponivel" : disponivel <= Math.max(1, total * 0.2) ? "atencao" : "disponivel";
      return { total, reservado, manutencao, disponivel, status, kit, limitante, componentes, reservas };
    } catch (error) {
      return { total: 0, reservado: 0, manutencao: 0, disponivel: 0, status: "indisponivel", kit,
        erro: error.message, componentes: [], reservas: [] };
    }
  }

  function buildRows() {
    const periodo = selectedPeriod();
    state.rows = state.itens.map(item => ({ item, ...calcularItem(item, periodo) }));
  }

  async function loadCategories(generation) {
    const categories = new Set();
    for (let offset = 0; ; offset += 1000) {
      let query = sb().from("itens").select("categoria").order("id");
      if (empresaId()) query = query.eq("empresa_id", empresaId());
      const { data, error } = await query.range(offset, offset + 999);
      if (generation !== state.generation) return;
      if (error) { console.warn("[Disponibilidade] categorias:", error); return; }
      (data || []).forEach(item => { if (item.categoria) categories.add(item.categoria); });
      if ((data || []).length < 1000) break;
    }
    const select = $("#disponCategoria");
    if (!select) return;
    const selected = select.value;
    select.innerHTML = '<option value="">Todas</option>' + [...categories].sort().map(cat =>
      '<option value="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</option>').join("");
    select.value = selected;
  }

  function fillCategories() {
    const select = $("#disponCategoria");
    if (!select) return;
    const selected = select.value;
    const categories = [...new Set([...Array.from(select.options).map(option => option.value), ...state.itens.map((item) => item.categoria)].filter(Boolean))].sort();
    select.innerHTML = `<option value="">Todas</option>` + categories.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join("");
    select.value = selected;
  }

  function filteredRows() {
    const term = normalize($("#disponBusca")?.value);
    const category = $("#disponCategoria")?.value || "";
    const status = $("#disponStatus")?.value || "";
    return state.rows.filter((row) => {
      const item = row.item;
      const haystack = normalize([item.codigo, item.produto, item.descricao_total, item.categoria, item.setor_estoque].join(" "));
      return (!term || haystack.includes(term))
        && (!category || item.categoria === category)
        && (!status || row.status === status);
    });
  }

  function observeMore(rows) {
    const sentinel = $("#disponMais");
    if (!sentinel) return;
    sentinel.textContent = "Carregando mais itens...";
    sentinel.hidden = !state.hasMore && state.visibleCount >= rows.length;

  }

  function render(append = false) {
    buildRows();
    const rows = filteredRows();
    const tbody = $("#disponTabela");
    const start = append ? tbody.querySelectorAll(".dispon-row").length : 0;
    const pageRows = rows.slice(start, state.visibleCount);

    if (append && pageRows.length) tbody.querySelector(".dispon-empty")?.remove();
    const html = pageRows.map((row) => {
      const item = row.item;
      const photo = itemPhoto(item);
      const itemName = item.descricao_total || item.produto || "-";
      const limitante = row.limitante?.item;
      const nota = row.erro || (row.kit
        ? `Kits completos · Limite: ${limitante?.descricao_total || limitante?.produto || "componente"}` : "");
      return `
        <tr class="dispon-row" data-item-id="${escapeHtml(item.id)}">
          <td>
            <div class="dispon-photo">
              ${photo
                ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(itemName)}" loading="lazy">`
                : ""
              }
            </div>
          </td>
          <td>
            <button type="button" class="dispon-item-link" data-item-id="${escapeHtml(item.id)}">
              <span class="dispon-item-name">${escapeHtml(itemName)}</span>
              <span class="dispon-item-code">${escapeHtml(item.codigo || "-")} - ${escapeHtml(item.tipo || "Item")}</span>
              ${nota ? `<span class="dispon-kit-note">${escapeHtml(nota)}</span>` : ""}
            </button>
          </td>
          <td>${escapeHtml(item.categoria || "-")}</td>
          <td class="dispon-quantity-cell"><span class="dispon-quantity">${number(row.total)}</span></td>
          <td class="dispon-quantity-cell"><span title="${row.kit ? 'Capacidade de kits comprometida por reservas dos componentes, inclusive em outros kits.' : 'Maior quantidade reservada simultaneamente no período.'}" class="dispon-quantity ${row.reservado > 0 ? 'dispon-quantity-reserved' : ''}">${number(row.reservado)}</span></td>
          <td class="dispon-quantity-cell"><span class="dispon-quantity ${row.manutencao > 0 ? 'dispon-quantity-maintenance' : ''}">${number(row.manutencao)}</span></td>
          <td class="dispon-quantity-cell"><strong class="dispon-quantity dispon-quantity-available ${row.disponivel <= 0 ? 'dispon-quantity-empty' : ''}">${number(row.disponivel)}</strong></td>
          <td><span class="dispon-badge ${row.status}">${statusLabel(row.status)}</span></td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="8" class="dispon-empty">Nenhum item encontrado.</td></tr>`;

    if (!append || !rows.length) tbody.innerHTML = html;
    else if (pageRows.length) tbody.insertAdjacentHTML("beforeend", html);
    observeMore(rows);
  }

  function renderizarDetalhe(item, periodo) {
    if (!item) return;

    const titulo = $("#disponReservasTitulo");
    const tbody = $("#disponReservasTbody");
    const resultado = calcularItem(item, periodo);
    const reservas = resultado.reservas;
    const detalhes = $("#disponComponentes");
    if (detalhes) {
      detalhes.innerHTML = resultado.erro ? '<div class="dispon-detail-error">' + escapeHtml(resultado.erro) + '</div>' : `
        <div class="dispon-detail-section-head"><span>Visão do período</span><span>${formatDate(periodo.inicio)} a ${formatDate(periodo.fim)}</span></div>
        <div class="dispon-detail-metrics">
          <div><span>Estoque total</span><strong>${number(resultado.total)}</strong></div>
          <div class="is-reserved"><span>Reservado</span><strong>${number(resultado.reservado)}</strong></div>
          <div class="is-maintenance"><span>Manutenção / bloqueio</span><strong>${number(resultado.manutencao)}</strong></div>
          <div class="is-available"><span>Disponível${resultado.kit ? " em kits" : ""}</span><strong>${number(resultado.disponivel)}</strong></div>
        </div>
        <div class="dispon-component-card">
          <h3>${resultado.kit ? "Componentes do kit" : "Saldo da peça"}</h3>
          <p>${resultado.kit ? "Conjuntos completos, calculados pelo componente mais limitado. As peças também podem estar reservadas em outros kits." : "Quantidade livre durante todo o período selecionado, considerando reservas e bloqueios."}</p>
          <div class="dispon-component-table-wrap"><table class="dispon-component-table">
            <thead><tr><th>${resultado.kit ? "Componente" : "Item"}</th>${resultado.kit ? "<th>Por kit</th>" : ""}<th>Estoque</th><th>Reservado*</th><th>Bloqueado*</th><th>Livre</th></tr></thead>
            <tbody>${resultado.componentes.map(comp => `<tr><td>${escapeHtml(comp.item.descricao_total || comp.item.produto || comp.item.id)}</td>${resultado.kit ? `<td>${number(comp.porKit)}</td>` : ""}<td>${number(comp.total)}</td><td>${number(comp.reservado)}</td><td>${number(comp.manutencao)}</td><td><strong>${number(comp.disponivel)}</strong></td></tr>`).join("")}</tbody>
          </table></div>
          <p class="dispon-detail-footnote">* Maior quantidade no período. ${resultado.kit ? "Os saldos dos kits compartilham as mesmas peças e não devem ser somados." : "O saldo livre considera o pior momento do período."}</p>
        </div>`;
    }

    if (titulo) titulo.textContent = item.descricao_total || item.produto || "Reservas no período";
    $("#disponDetalheCodigo").textContent = [item.codigo, item.tipo || "Item", item.categoria].filter(Boolean).join(" / ");
    const foto = itemPhoto(item);
    $("#disponDetalheFoto").innerHTML = foto ? '<img src="' + escapeHtml(foto) + '" alt="">' : "";
    $("#disponDetalheFoto").hidden = !foto;

    if (tbody) {
      tbody.innerHTML = reservas.length
        ? reservas.map((row) => {
          const pedido = row.separacoes_pedidos || {};
          const origem = catalogo.get(row.item_id);
          const componente = catalogo.get(row.componente_id);
          return `
            <tr>
              <td>#${escapeHtml(pedido.numero_pedido || "-")}</td>
              <td>${escapeHtml(pedido.cliente_nome || "-")}</td>
              <td>${escapeHtml(origem?.descricao_total || origem?.produto || "-")}</td>
              <td>${escapeHtml(componente?.descricao_total || componente?.produto || "-")}</td>
              <td>${escapeHtml(pedido.tipo_evento || "-")}</td>
              <td>${escapeHtml(pedido.local_nome || "-")}</td>
              <td>${formatDate(row.inicio)} a ${formatDate(row.fim)}</td>
              <td>${number(row.quantidade_componente)}</td>
              <td><span class="dispon-badge atencao">${escapeHtml(pedido.status_comercial || pedido.status || "-")}</span></td>
            </tr>
          `;
        }).join("")
        : `<tr><td colspan="9" class="dispon-empty">Nenhuma reserva ativa usando estas peças no período.</td></tr>`;
    }

  }

  async function abrirDetalheItem(itemId, periodo = simulacao?.periodo || selectedPeriod()) {
    const item = catalogo.get(itemId);
    if (!item) return;
    if (!detalheAtual) {
      const ancestrais = new Set([document.scrollingElement]);
      for (let node = $(".dispon-page"); node; node = node.parentElement) ancestrais.add(node);
      retornoLista = { itemId, posicoes: [...ancestrais].filter(Boolean).map(node => ({ node, top: node.scrollTop, left: node.scrollLeft })) };
      $("#disponLista").hidden = true;
      $("#disponDetalheTela").hidden = false;
      retornoLista.posicoes.forEach(({node}) => { node.scrollTop = 0; });
      $("#btnVoltarDispon").focus({ preventScroll: true });
    }
    const versao = ++detalheVersao;
    detalheAtual = { item, periodo, proximoDia: periodo.inicio };
    $("#disponDetalheInicio").value = periodo.inicio;
    $("#disponDetalheFim").value = periodo.fim;
    $("#disponDiasResumo").textContent = "Consultando saldos...";
    $("#disponDias").innerHTML = "";
    $("#disponVerPeriodo").hidden = true;
    try {
      if (!periodo.inicio || !periodo.fim || periodo.fim < periodo.inicio) throw new Error("Informe um período válido.");
      const datas = datasDoPeriodo(periodo);
      for (let start = 0; start < datas.length; start += 4) {
        await Promise.all(datas.slice(start, start + 4).map(data => carregarBloqueios(data)));
        if (versao !== detalheVersao) return;
      }
      renderizarDetalhe(item, periodo);
      $("#disponReservasPeriodo").textContent = "Pedidos que utilizam as peças no período";
      $("#disponDiasResumo").textContent = "Selecione um dia para ver os pedidos. Saldo em " + (calcularItem(item, periodo).kit ? "kits completos." : "peças.");
      adicionarDias();
      $("#disponDiasScroll").scrollTop = 0;
    } catch (error) {
      if (versao !== detalheVersao) return;
      $("#disponDiasResumo").textContent = error.message;
      $("#disponComponentes").textContent = error.message;
      $("#disponReservasTbody").innerHTML = "";
    }
  }

  function adicionarDias() {
    if (!detalheAtual) return;
    const { item, periodo } = detalheAtual;
    let data = detalheAtual.proximoDia;
    const linhas = [];
    for (let i = 0; i < 31 && data <= periodo.fim; i++, data = diaSeguinte(data)) {
      const saldo = calcularItem(item, { inicio: data, fim: data });
      const classe = saldo.disponivel <= 0 ? "dispon-quantity-empty" : "dispon-quantity-available";
      linhas.push('<tr data-dia="' + data + '"><td><button type="button" class="dispon-day-button" data-dispon-dia="' + data + '">' + formatDate(data) + '</button></td><td><span class="dispon-quantity ' + classe + '" title="' + escapeHtml(saldo.erro || "Saldo disponível neste dia") + '">' + (saldo.erro ? "?" : number(saldo.disponivel)) + '</span></td></tr>');
    }
    detalheAtual.proximoDia = data;
    $("#disponDias").insertAdjacentHTML("beforeend", linhas.join(""));
  }

  async function calcularDisponibilidade(itemId, data, fim) {
    const periodo = data ? { inicio: data, fim: fim || data } : selectedPeriod();
    if (periodo.fim < periodo.inicio) throw new Error("Período inválido.");
    const item = catalogo.get(itemId);
    if (!item) return null;
    for (const dia of datasDoPeriodo(periodo)) await carregarBloqueios(dia);
    return calcularItem(item, periodo);
  }

  async function resetRowsAndRender() {
    state.visibleCount = state.perPage;
    try { await loadAll(); }
    catch(error){
      state.generation++;
      state.hasMore = false;
      state.loading = false;
      $("#disponTabela").innerHTML = "";
      $("#disponMais").hidden = true;
      $("#disponErro").textContent = error.message;
      $("#disponErro").hidden = false;
      window.alerta?.(error.message, "Disponibilidade", "erro");
    }
  }

  function scheduleReset() {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(resetRowsAndRender, 250);
  }

  function bindEvents() {
    $("#btnSimularSemana")?.addEventListener("click", iniciarSimulacao);
    $("#btnSairSimulacao")?.addEventListener("click", sairSimulacao);
    $("#disponSimulacaoDias")?.addEventListener("click", event => {
      const button = event.target.closest("[data-sim-dia]");
      if (!button || !simulacao) return;
      $("#disponData").value = button.dataset.simDia;
      clearTimeout(filterTimer);
      resetRowsAndRender();
    });
    $("#disponMais")?.addEventListener("click", () => loadMore());
    ["disponDetalheInicio", "disponDetalheFim"].forEach(id => {
      $("#" + id)?.addEventListener("change", () => {
        if (detalheAtual) abrirDetalheItem(detalheAtual.item.id, {
          inicio: $("#disponDetalheInicio").value, fim: $("#disponDetalheFim").value
        });
      });
    });
    $("#disponDiasScroll")?.addEventListener("scroll", event => {
      const root = event.currentTarget;
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 10) adicionarDias();
    });
    $("#disponDias")?.addEventListener("click", event => {
      const button = event.target.closest("[data-dispon-dia]");
      if (!button || !detalheAtual) return;
      const dia = button.dataset.disponDia;
      renderizarDetalhe(detalheAtual.item, { inicio: dia, fim: dia });
      $("#disponDias").querySelectorAll("[data-dia]").forEach(row => row.setAttribute("aria-selected", String(row.dataset.dia === dia)));
      $("#disponVerPeriodo").hidden = false;
      $("#disponReservasPeriodo").textContent = "Pedidos que utilizam as peças em " + formatDate(dia);
    });
    $("#disponVerPeriodo")?.addEventListener("click", () => {
      if (!detalheAtual) return;
      renderizarDetalhe(detalheAtual.item, detalheAtual.periodo);
      $("#disponDias").querySelectorAll("[aria-selected]").forEach(row => row.removeAttribute("aria-selected"));
      $("#disponVerPeriodo").hidden = true;
      $("#disponReservasPeriodo").textContent = "Pedidos que utilizam as peças no período";
    });
    ["disponData", "disponBusca", "disponCategoria", "disponStatus"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", scheduleReset);
      document.getElementById(id)?.addEventListener("change", scheduleReset);
    });

    $("#disponTabela")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-item-id]");
      if (!button) return;
      abrirDetalheItem(button.dataset.itemId);
    });

    $("#btnVoltarDispon")?.addEventListener("click", voltarParaLista);
  }

  function voltarParaLista() {
    detalheVersao++;
    detalheAtual = null;
    $("#disponDetalheTela").hidden = true;
    $("#disponLista").hidden = false;
    const retorno = retornoLista;
    if (!retorno) return;
    const button = [...$("#disponTabela").querySelectorAll(".dispon-item-link")]
      .find(el => el.dataset.itemId === retorno.itemId);
    button?.focus({ preventScroll: true });
    retorno.posicoes.forEach(({node, top, left}) => {
      scrollPositions.set(node, top);
      node.scrollTop = top;
      node.scrollLeft = left;
    });
    retornoLista = null;
  }

  function onListScroll(event) {
    const scroller = event.target === document ? document.scrollingElement : event.target;
    const page = $(".dispon-page");
    if (!scroller || !page || (scroller !== document.scrollingElement && !scroller.contains(page))) return;
    const position = scroller.scrollTop;
    const previous = scrollPositions.get(scroller) || 0;
    scrollPositions.set(scroller, position);
    if (position <= previous || state.loading || !state.initialized || detalheAtual) return;
    const sentinel = $("#disponMais");
    if (!sentinel || sentinel.hidden) return;
    const rect = sentinel.getBoundingClientRect();
    const viewport = scroller === document.scrollingElement
      ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
    if (rect.top > viewport.bottom || rect.bottom < viewport.top) return;
    state.visibleCount += state.perPage;
    if (filteredRows().length >= state.visibleCount || !state.hasMore) render(true);
    else loadMore();
  }

  function initDisponibilidade() {
    if (state.initialized) return;
    state.initialized = true;
    const inputDate = $("#disponData");
    if (inputDate && !inputDate.value) inputDate.value = new Date().toISOString().slice(0, 10);
    scrollEvents = new AbortController();
    scrollPositions = new WeakMap();
    document.addEventListener("scroll", onListScroll, {
      capture: true, passive: true, signal: scrollEvents.signal
    });
    bindEvents();
    resetRowsAndRender().finally(() => window.finalizarCarregamentoModulo?.());
  }

  function destroyDisponibilidade() {
    detalheVersao++;
    detalheAtual = null;
    retornoLista = null;
    simulacao = null;
    filtrosAntesSimulacao = null;
    clearTimeout(filterTimer);
    scrollEvents?.abort();
    scrollEvents = null;
    state.generation++;
    state.initialized = false;
  }

  window.EasyLocDisponibilidade = {
    calcular: calcularDisponibilidade,
    recarregar: loadAll
  };
  window.__moduleInit = initDisponibilidade;
  window.__activeModuleDestroy = destroyDisponibilidade;
})();
