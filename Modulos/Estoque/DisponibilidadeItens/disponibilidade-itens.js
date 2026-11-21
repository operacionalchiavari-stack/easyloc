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
  const bloqueiosPorData = new Map();
  // Disponível de cada item no período, da MESMA conta do catálogo/pedido/salvar (operacao_livre_calc no banco). O
  // cálculo desta tela (abaixo) fica só para o detalhe dia a dia; o número principal é o do banco.
  const livrePorPeriodo = new Map();
  const bloqueadosContagem = new Set();
  const chavePeriodo = (p) => p.inicio + "~" + (p.fim || p.inicio);
  // Visão "por pedido" (out/2026): no lugar da coluna "Reservado na data", uma coluna para cada pedido que tem itens na
  // data, com a quantidade que ele usa de cada item, logo antes de "Disponível". Escolha guardada no navegador.
  // 15/11/2026: a visão "somada" (Reservado na data numa coluna) foi removida a pedido; fica só esta, com uma coluna
  // por pedido. O nome continua para não mexer nas condições abaixo.
  const visao = "pedidos";
  // 15/11/2026: simulação SÓ NA TELA, para testar a visão com muitos eventos: abra o sistema com ?simular=20
  // (dashboard.html?simular=20) e entre na Disponibilidade. A tela inventa N pedidos para a data escolhida usando os
  // itens reais; nada é gravado no banco e nenhuma outra tela vê. O "Disponível" passa a ser a conta da tela
  // (a do banco não conhece os pedidos inventados).
  const SIMULACAO = (() => { try { const n = Number(new URLSearchParams(location.search).get("simular")); return n > 0 ? Math.min(60, Math.floor(n)) : 0; } catch (_) { return 0; } })();
  const SIM_CLIENTES = ["Kelly Khawam", "Fabiane Gabrich", "Ana Ribeiro Decor", "Marina Couto Eventos", "Lis Andrade", "Carolina Prado", "Juliana Mendes", "Beatriz Fontes", "Patrícia Lemos", "Renata Duarte", "Camila Torres", "Luiza Fernandes", "Gabriela Nunes", "Isabela Rocha", "Fernanda Lima", "Mariana Alves", "Paula Martins", "Vanessa Castro", "Débora Freitas", "Aline Moraes"];
  const SIM_TIPOS = ["Casamento", "Aniversário de 15 anos", "Corporativo", "Bodas", "Formatura", "Batizado"];
  const SIM_LOCAIS = ["Villa Bisutti", "Espaço Jardim Imperial", "Casa Petrópolis", "Fazenda Santa Clara", "Hotel Quitandinha", "Sítio das Hortênsias", "Clube Petropolitano"];
  function simPedidos() {
    // os eventos se espalham pelo período escolhido (um dia só = todos naquele dia)
    const periodo = selectedPeriod(), dias = [];
    for (let d = periodo.inicio; d <= periodo.fim && dias.length < 62; d = diaSeguinte(d)) dias.push(d);
    return Array.from({ length: SIMULACAO }, (_, i) => { const hoje = dias[i % dias.length], amanha = diaSeguinte(hoje); return {
      id: "sim-" + (i + 1), numero_pedido: String(9001 + i), cliente_id: null,
      cliente_nome: SIM_CLIENTES[i % SIM_CLIENTES.length] + (i >= SIM_CLIENTES.length ? " " + (Math.floor(i / SIM_CLIENTES.length) + 1) : ""),
      tipo_evento: SIM_TIPOS[i % SIM_TIPOS.length], local_nome: SIM_LOCAIS[i % SIM_LOCAIS.length],
      data_entrega: hoje, data_evento: hoje, data_coleta: i % 3 === 0 ? amanha : hoje,
      status: "pendente", status_comercial: i % 4 === 3 ? "pre_reserva" : "aprovado", encerrado_operacional_em: null
    }; });
  }
  function simSorteio(texto) { let h = 2166136261; for (const c of String(texto)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  function reservasSimuladas(items) {
    const pedidos = simPedidos(), out = [];
    items.forEach((item) => {
      if (normalize(item.tipo) === "kit") return;
      const estoque = totalItem(item); if (!estoque) return;
      let sobra = estoque; // nunca reserva mais do que o estoque (alguns itens chegam a esgotar)
      pedidos.forEach((p, i) => {
        if (!sobra || simSorteio(item.id + ":" + i) > 0.28) return;
        const q = Math.min(sobra, Math.max(1, Math.round(estoque * (0.05 + simSorteio(i + ":" + item.id) * 0.22))));
        sobra -= q;
        out.push({ id: "sim-" + i + "-" + item.id, item_id: item.id, quantidade_solicitada: q, separacoes_pedidos: p });
      });
    });
    return out;
  }
  function avisoSimulacao() {
    if (!SIMULACAO || $(".dispon-sim-aviso")) return;
    const p = document.createElement("p");
    p.className = "dispon-sim-aviso"; p.setAttribute("role", "status");
    p.innerHTML = "<b>Simulação:</b> " + SIMULACAO + " pedidos inventados no período escolhido, só nesta tela. Nada foi gravado. Para sair, abra o sistema sem <code>?simular</code>.";
    $(".dispon-card")?.before(p);
  }
  async function carregarLivre(periodo, atualizar = false){
    if (SIMULACAO) return;
    const chave = chavePeriodo(periodo);
    if(!atualizar && livrePorPeriodo.has(chave)) return;
    const { data: rows, error } = await sb().rpc("operacao_livre_periodo", { p_empresa: empresaId(), p_inicio: periodo.inicio, p_fim: periodo.fim || periodo.inicio });
    if(error){ console.warn("[Disponibilidade] conta única indisponível:", error.message); return; }
    const mapa = new Map();
    (rows || []).forEach(r => { mapa.set(r.item_id, Number(r.livre)); if(r.bloqueio_contagem) bloqueadosContagem.add(r.item_id); });
    livrePorPeriodo.set(chave, mapa);
  }
  async function carregarBloqueios(data, atualizar = false){
    if(!atualizar && bloqueiosPorData.has(data)) return;
    const generation = state.generation;
    const { data: rows, error } = await sb().rpc("operacao_indisponiveis", { p_empresa: empresaId(), p_data: data });
    if(error) throw error;
    if (generation === state.generation) bloqueiosPorData.set(data, new Map((rows || []).map(r => [r.item_id,Number(r.quantidade)])));
  }

  const sb = () => window.supabaseClient || window.supabase;
  const empresaId = () => window.__CONTEXT?.empresa_id || window.empresa_id || null;
  const $ = (selector, root = document) => root.querySelector(selector);

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
      disponivel: "Disponível",
      atencao: "Atenção",
      indisponivel: "Indisponível"
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
    livrePorPeriodo.clear(); bloqueadosContagem.clear();
    Object.assign(state, { itens: [], patrimonios: [], reservas: [], rows: [], offset: 0,
      hasMore: true, loading: false, visibleCount: state.perPage });
    $("#disponTabela").innerHTML = "";
    $("#disponMais").hidden = true;
    $("#disponErro").hidden = true;
    $("#disponErro").textContent = "";
    await carregarComposicoes(generation);
    await carregarBloqueios(periodo.inicio, true);
    await carregarLivre(periodo, true);
    await carregarPedidosPeriodo(periodo, generation);
    if (generation !== state.generation) return;
    await loadMore(generation);
    if (generation === state.generation) await loadCategories(generation);
  }

  async function loadMore(generation = state.generation) {
    if (state.loading || !state.hasMore || generation !== state.generation) return;
    state.loading = true;
    observeMore(filteredRows());
    let falhou = false;
    try {
      do {
        let query = sb().from("itens").select("*").order("id");
        if (empresaId()) query = query.eq("empresa_id", empresaId());
        // Com busca/categoria/status ativos, busca lotes maiores (menos idas ao banco até achar os itens filtrados).
        const lote = filtroAtivo() ? 200 : state.perPage;
        const { data, error } = await query.range(state.offset, state.offset + lote - 1);
        if (error) throw error;
        if (generation !== state.generation) return;
        const items = data || [];
        await carregarMateriais(items, generation);
        if (generation !== state.generation) return;
        state.itens.push(...items);
        state.offset += items.length;
        state.hasMore = items.length === lote;
        buildRows();
      } while (state.hasMore && filteredRows().length < state.visibleCount);
      fillCategories();
      render(false);
    } catch (error) {
      falhou = true;
      if (generation === state.generation) {
        window.alerta?.(error.message, "Disponibilidade", "erro");
        const sentinel = $("#disponMais");
        if (sentinel) { sentinel.hidden = false; sentinel.textContent = "Falha ao carregar. Clique para tentar novamente."; }
      }
    } finally {
      if (generation === state.generation) {
        state.loading = false;
        const sentinel = $("#disponMais");
        if (sentinel) { sentinel.disabled = false; sentinel.setAttribute("aria-busy", "false"); }
        if (!falhou) observeMore(filteredRows());
        // O filtro pode mudar enquanto o lote ainda está sendo carregado.
        if (!falhou && state.hasMore && filtroAtivo() && filteredRows().length < state.visibleCount) {
          queueMicrotask(() => loadMore(generation));
        }
      }
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
          cliente_id,
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

  // 15/11/2026: consulta por período (De / Até) em vez de uma data só. "Até" antes de "De" vira o mesmo dia.
  function selectedPeriod() {
    const inicio = selectedDate();
    const campoFim = $("#disponDataFim");
    let fim = campoFim?.value || inicio;
    if (fim < inicio) { fim = inicio; if (campoFim) campoFim.value = inicio; }
    return { inicio, fim };
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
    if (SIMULACAO) reservas.push(...reservasSimuladas([...cadastro, ...items].filter((it) => novos.includes(it.id))));
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
          const livre = bloqueadosContagem.has(id) ? 0 : Math.max(0, estoque - bloqueado - reservado);
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
      const doBanco = livrePorPeriodo.get(chavePeriodo(periodo))?.get(item.id);
      if (doBanco != null && Number.isFinite(doBanco)) disponivel = doBanco;
      const manutencao = total - semManutencao;
      const reservado = Math.max(0, semManutencao - disponivel);
      const status = disponivel <= 0 ? "indisponivel" : disponivel <= Math.max(1, total * 0.2) ? "atencao" : "disponivel";
      return { total, reservado, manutencao, disponivel, status, kit, limitante, componentes, reservas };
    } catch (error) {
      return { total: 0, reservado: 0, manutencao: 0, disponivel: 0, status: "indisponivel", kit,
        erro: error.message, componentes: [], reservas: [] };
    }
  }

  // 18/11/2026: TODOS os pedidos que seguram móveis no período aparecem como coluna logo de cara, mesmo que nenhum item
  // da primeira tela seja deles (antes só apareciam conforme a lista ia carregando, o que confundia).
  let pedidosPeriodo = [];
  async function carregarPedidosPeriodo(periodo, generation) {
    pedidosPeriodo = [];
    if (!sb()) return;
    try {
      let query = sb().from("separacoes_pedidos")
        .select("id,numero_pedido,cliente_id,cliente_nome,tipo_evento,local_nome,data_hora,data_evento,data_evento_fim,data_entrega,data_coleta,status,status_comercial,encerrado_operacional_em")
        .in("status_comercial", ["pre_reserva", "aprovado", "enviado", "finalizado"]).is("encerrado_operacional_em", null)
        .or(`data_coleta.gte.${periodo.inicio},data_evento.gte.${periodo.inicio}`);
      if (empresaId()) query = query.eq("empresa_id", empresaId());
      const { data, error } = await query.limit(1000);
      if (error) throw error;
      if (generation !== state.generation) return;
      pedidosPeriodo = (data || []).filter((p) => normalize(p.status) !== "cancelado").map((p) => ({ ...p, ...periodoPedido(p) }))
        .filter((p) => p.inicio && p.inicio <= periodo.fim && p.fim >= periodo.inicio);
    } catch (e) { console.warn("[Disponibilidade] pedidos do período:", e.message || e); }
  }
  // Pedidos com reserva no período (todos os do período + os das linhas carregadas), na ordem do número
  function pedidosDaData(rows, periodo) {
    const mapa = new Map();
    pedidosPeriodo.forEach((p) => mapa.set(p.id, p));
    rows.forEach((row) => (row.reservas || []).forEach((r) => {
      const p = r.separacoes_pedidos || {};
      if (!p.id || r.inicio > periodo.fim || r.fim < periodo.inicio) return;
      if (!mapa.has(p.id)) mapa.set(p.id, { ...p, inicio: r.inicio, fim: r.fim });
    }));
    return [...mapa.values()].sort((a, b) => String(a.numero_pedido || "").localeCompare(String(b.numero_pedido || ""), "pt-BR", { numeric: true }));
  }
  // Quanto o pedido usa deste item na data. Item comum: as peças (inclusive dentro de kits do pedido).
  // Kit: quantos kits as reservas do pedido comprometem (o componente mais tomado).
  function usoDoPedido(row, pedidoId) {
    const doPedido = (row.reservas || []).filter((r) => r.separacoes_pedidos?.id === pedidoId);
    if (!doPedido.length) return 0;
    if (!row.kit) return doPedido.reduce((s, r) => s + Number(r.quantidade_componente || 0), 0);
    let kits = 0;
    (row.componentes || []).forEach((c) => {
      const usado = doPedido.filter((r) => r.componente_id === c.item?.id).reduce((s, r) => s + Number(r.quantidade_componente || 0), 0);
      if (usado && c.porKit) kits = Math.max(kits, Math.ceil(usado / c.porKit));
    });
    return kits;
  }
  const STATUS_PEDIDO = { pre_reserva: "Pré-reserva", aprovado: "Reservado", enviado: "Reservado", finalizado: "Reservado" };
  // 15/11/2026: na visão por pedido, o cabeçalho mostra só a foto e o nome do cliente; os detalhes aparecem num cartão
  // ao passar o mouse (ou com o foco do teclado). Foto = catálogo do cliente (clientes_empresas.catalogo_logo_url).
  const fotosClientes = new Map(); // chave "id:<uuid>" ou "nome:<nome>" -> url ("" = sem foto)
  const chaveFoto = (p) => p.cliente_id ? "id:" + p.cliente_id : "nome:" + String(p.cliente_nome || "").trim().toLowerCase();
  const iniciaisCli = (nome) => String(nome || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "?";
  let pedidosCabecalho = [];
  async function carregarFotosClientes(pedidos) {
    const faltam = pedidos.filter((p) => !fotosClientes.has(chaveFoto(p)));
    if (!faltam.length || !sb()) return;
    faltam.forEach((p) => fotosClientes.set(chaveFoto(p), ""));
    const url = (c) => /^https?:\/\//i.test(c?.catalogo_logo_url || "") ? c.catalogo_logo_url : "";
    try {
      const ids = [...new Set(faltam.map((p) => p.cliente_id).filter(Boolean))];
      const nomes = [...new Set(faltam.filter((p) => !p.cliente_id && p.cliente_nome).map((p) => p.cliente_nome))];
      if (ids.length) {
        const { data } = await sb().from("clientes_empresas").select("id,catalogo_logo_url").eq("empresa_id", empresaId()).in("id", ids);
        (data || []).forEach((c) => fotosClientes.set("id:" + c.id, url(c)));
      }
      if (nomes.length) {
        const { data } = await sb().from("clientes_empresas").select("nome_razao,catalogo_logo_url").eq("empresa_id", empresaId()).in("nome_razao", nomes);
        (data || []).forEach((c) => fotosClientes.set("nome:" + String(c.nome_razao || "").trim().toLowerCase(), url(c)));
      }
    } catch (_) { return; }
    if (visao === "pedidos" && pedidos === pedidosCabecalho) cabecalhoTabela(pedidos, true);
  }
  function cartaoPedidoHtml(p) {
    const st = normalize(p.status_comercial);
    const linha = (rot, val) => val ? '<div><dt>' + rot + "</dt><dd>" + escapeHtml(val) + "</dd></div>" : "";
    return '<strong>Pedido ' + escapeHtml(p.numero_pedido || "–") + "</strong>" +
      (st === "pre_reserva" ? '<span class="dispon-ped-st">Pré-reserva</span>' : "") +
      "<dl>" + linha("Cliente", p.cliente_nome) + linha("Evento", p.tipo_evento) + linha("Local", p.local_nome) +
      linha("Período", formatDate(p.inicio) + (p.fim && p.fim !== p.inicio ? " a " + formatDate(p.fim) : "")) +
      linha("Situação", STATUS_PEDIDO[st] || p.status_comercial) + "</dl>";
  }
  // 15/11/2026: cartão branco com os detalhes ao passar o mouse em Total, Reservado, Manutenção, Disponível e nas
  // células dos pedidos. Usa só o que a tela já calculou (mesma conta dos números).
  const nomeItem = (it) => String(it?.descricao_total || it?.produto || "Item").replace(/\s*\(L\)[\s\S]*$/, "");
  const qtd = (n, um, varios) => number(n) + " " + (Number(n) === 1 ? um : varios);
  function pedidosDaLinha(row) {
    const periodo = selectedPeriod(), mapa = new Map();
    (row.reservas || []).forEach((r) => {
      const p = r.separacoes_pedidos || {};
      if (!p.id || r.inicio > periodo.fim || r.fim < periodo.inicio) return;
      if (!mapa.has(p.id)) mapa.set(p.id, { p, inicio: r.inicio, fim: r.fim, pecas: 0, kits: new Map() });
      const x = mapa.get(p.id);
      x.pecas += Number(r.quantidade_componente || 0);
      if (!row.kit && r.item_id && String(r.item_id) !== String(row.item.id)) { // a peça foi pedida dentro de um kit
        const k = nomeItem(catalogo.get(r.item_id)); x.kits.set(k, (x.kits.get(k) || 0) + Number(r.quantidade_solicitada || 0));
      }
    });
    return [...mapa.values()].map((x) => ({ ...x, uso: row.kit ? usoDoPedido(row, x.p.id) : x.pecas }))
      .sort((a, b) => String(a.p.numero_pedido || "").localeCompare(String(b.p.numero_pedido || ""), "pt-BR", { numeric: true }));
  }
  const linhaPedido = (x, row) => {
    const pre = normalize(x.p.status_comercial) === "pre_reserva";
    const viaKit = x.kits && x.kits.size ? '<small class="dispon-cartao-kit">Dentro de: ' + [...x.kits].map(([k, n]) => escapeHtml(k) + " (" + number(n) + " kit" + (n === 1 ? "" : "s") + ")").join(", ") + "</small>" : "";
    return '<li' + (pre ? ' class="is-pre"' : "") + '><span><b>Pedido ' + escapeHtml(x.p.numero_pedido || "–") + "</b> · " + escapeHtml(x.p.cliente_nome || "") + (pre ? ' <span class="dispon-ped-st">Pré-reserva</span>' : "") +
      "<small>" + escapeHtml([x.p.tipo_evento, x.p.local_nome, x.inicio ? formatDate(x.inicio) + (x.fim && x.fim !== x.inicio ? " a " + formatDate(x.fim) : "") : ""].filter(Boolean).join(" · ")) + "</small>" + viaKit + "</span>" +
      "<em>" + number(x.uso) + (row.kit ? " kit" + (x.uso === 1 ? "" : "s") : "") + "</em></li>";
  };
  function cartaoCelulaHtml(row, det) {
    const it = row.item, kit = row.kit, un = kit ? ["kit", "kits"] : ["peça", "peças"];
    const titulo = '<strong>' + escapeHtml(nomeItem(it)) + "</strong>";
    const comps = row.componentes || [];
    const tabelaComp = (col, rot) => kit && comps.length ? '<p class="dispon-cartao-sub">Peças do kit</p><ul class="dispon-cartao-lista">' + comps.map((c) =>
      "<li><span>" + escapeHtml(nomeItem(c.item)) + "<small>" + c.porKit + " por kit</small></span><em>" + number(c[col]) + " " + rot + "</em></li>").join("") + "</ul>" : "";
    if (det === "total") return titulo + '<p class="dispon-cartao-num">' + qtd(row.total, ...un) + " no estoque</p>" +
      (kit ? '<p class="dispon-cartao-txt">Quantos kits completos dá para montar com as peças cadastradas.</p>' + tabelaComp("total", "em estoque") : '<p class="dispon-cartao-txt">Quantidade cadastrada no item (Cadastro de Itens).</p>');
    if (det === "manutencao") {
      const contagem = kit ? comps.some((c) => bloqueadosContagem.has(c.item?.id)) : bloqueadosContagem.has(it.id);
      return titulo + '<p class="dispon-cartao-num">' + qtd(row.manutencao, ...un) + " fora de uso</p>" +
        '<p class="dispon-cartao-txt">Peças em manutenção, aguardando retorno ou com avaria registrada na Gestão do acervo.</p>' +
        (contagem ? '<p class="dispon-cartao-alerta">Bloqueado: aguardando a contagem geral na Gestão do acervo.</p>' : "") + tabelaComp("manutencao", "fora de uso");
    }
    if (det === "reservado" || det.startsWith("pedido:")) {
      let lista = pedidosDaLinha(row);
      if (det.startsWith("pedido:")) { const p = pedidosCabecalho[Number(det.slice(7))]; lista = lista.filter((x) => x.p.id === p?.id); }
      const somaPre = lista.filter((x) => normalize(x.p.status_comercial) === "pre_reserva").reduce((s, x) => s + x.uso, 0);
      const somaConf = lista.reduce((s, x) => s + x.uso, 0) - somaPre;
      const resumo = det === "reservado" && lista.length ? '<p class="dispon-cartao-resumo"><span>' + number(somaConf) + " reservad" + (kit ? "o" : "a") + (somaConf === 1 ? "" : "s") + "</span>" + (somaPre ? '<span class="pre">' + number(somaPre) + " em pré-reserva</span>" : "") + "</p>" : "";
      return titulo + (det === "reservado" ? '<p class="dispon-cartao-num">' + qtd(row.reservado, ...un) + " reservad" + (kit ? "o" : "a") + (row.reservado === 1 ? "" : "s") + " no período</p>" + resumo : "") +
        (lista.length ? '<ul class="dispon-cartao-lista">' + lista.map((x) => linhaPedido(x, row)).join("") + "</ul>" : '<p class="dispon-cartao-txt">Nenhum pedido usa este item no período.</p>') +
        (kit && det === "reservado" ? '<p class="dispon-cartao-txt">Num kit, conta também as peças usadas por outros kits.</p>' : "");
    }
    const lim = row.limitante?.item;
    return titulo + '<p class="dispon-cartao-num">' + qtd(row.disponivel, ...un) + " livre" + (row.disponivel === 1 ? "" : "s") + "</p>" +
      '<dl class="dispon-cartao-conta"><div><dt>No estoque</dt><dd>' + number(row.total) + "</dd></div><div><dt>Fora de uso</dt><dd>− " + number(row.manutencao) + "</dd></div><div><dt>Reservado</dt><dd>− " + number(row.reservado) + '</dd></div><div class="tot"><dt>Disponível</dt><dd>' + number(row.disponivel) + "</dd></div></dl>" +
      (kit && lim ? '<p class="dispon-cartao-txt">Quem limita: ' + escapeHtml(nomeItem(lim)) + (row.limitante.data ? " em " + formatDate(row.limitante.data) : "") + ".</p>" : "") +
      (row.disponivel <= 0 ? '<p class="dispon-cartao-alerta">Sem peças livres no período.</p>' : "");
  }
  function cartaoAberto() {
    let c = document.getElementById("disponPedidoCartao");
    if (!c) { c = document.createElement("div"); c.id = "disponPedidoCartao"; c.className = "dispon-ped-cartao"; c.setAttribute("role", "tooltip"); document.body.append(c); }
    return c;
  }
  function posicionarCartao(c, alvo) {
    c.hidden = false;
    const r = alvo.getBoundingClientRect(), w = c.offsetWidth, h = c.offsetHeight;
    c.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    c.style.top = (r.bottom + 8 + h > innerHeight - 8 ? Math.max(8, r.top - h - 8) : r.bottom + 8) + "px";
  }

  function cabecalhoTabela(pedidos, soFotos) {
    const tr = $("#disponCabecalho");
    if (!tr) return;
    pedidosCabecalho = pedidos;
    const colPedido = (p, i) => {
      const st = normalize(p.status_comercial), foto = fotosClientes.get(chaveFoto(p)) || "";
      const rotulo = ["Pedido " + (p.numero_pedido || ""), p.cliente_nome].filter(Boolean).join(" · ");
      return '<th class="dispon-quantity-cell dispon-col-pedido' + (st === "pre_reserva" ? " is-pre" : "") + (i === 0 ? " dispon-divisao" : "") + '" tabindex="0" data-pedido-col="' + i + '" aria-label="' + escapeHtml(rotulo) + '">' +
        '<span class="dispon-ped-cab"><span class="dispon-ped-foto" aria-hidden="true">' + (foto ? '<img src="' + escapeHtml(foto) + '" alt="" onerror="this.remove()">' : "") + "<span>" + escapeHtml(iniciaisCli(p.cliente_nome)) + "</span></span>" +
        '<span class="dispon-ped-nome">' + escapeHtml(p.cliente_nome || "Pedido " + (p.numero_pedido || "")) + "</span></span></th>";
    };
    tr.innerHTML = '<th class="dispon-fixa dispon-fixa-1">Foto</th><th class="dispon-fixa dispon-fixa-2">Item</th><th>Categoria</th>' + '<th class="dispon-quantity-cell">Total</th>' +
      '<th class="dispon-quantity-cell">Manutencao</th><th class="dispon-quantity-cell">Reservado</th><th class="dispon-quantity-cell dispon-fixa dispon-fixa-3">Disponivel</th>' + (pedidos.length ? pedidos.map(colPedido).join("") : '<th class="dispon-quantity-cell dispon-col-pedido dispon-divisao">Pedidos<span class="dispon-ped-cli">nenhum no período</span></th>');
    if (visao === "pedidos" && !soFotos) carregarFotosClientes(pedidos);
    if (soFotos) agendarCabecalho();
  }

  function buildRows() {
    const periodo = selectedPeriod();
    state.rows = state.itens.map(item => ({ item, ...calcularItem(item, periodo) }));
  }

  const FILTROS_ITEM = [["disponCategoria", "categoria", "Categoria"], ["disponSubcategoria", "subcategoria", "Subcategoria"], ["disponCor", "cor", "Cor"], ["disponMaterial", "material", "Material"], ["disponEstilo", "estilo", "Estilo"], ["disponSetor", "setor_estoque", "Setor"]];
  // Opções dos filtros (18/11/2026): valores distintos de todos os itens da empresa, não só dos já carregados.
  async function loadCategories(generation) {
    const valores = Object.fromEntries(FILTROS_ITEM.map(([, campo]) => [campo, new Set()]));
    for (let offset = 0; ; offset += 1000) {
      let query = sb().from("itens").select("categoria,subcategoria,cor,material,estilo,setor_estoque").order("id");
      if (empresaId()) query = query.eq("empresa_id", empresaId());
      const { data, error } = await query.range(offset, offset + 999);
      if (generation !== state.generation) return;
      if (error) { console.warn("[Disponibilidade] filtros:", error); return; }
      (data || []).forEach((item) => FILTROS_ITEM.forEach(([, campo]) => { const v = String(item[campo] || "").trim(); if (v) valores[campo].add(v); }));
      if ((data || []).length < 1000) break;
    }
    FILTROS_ITEM.forEach(([id, campo, rotulo]) => {
      const select = document.getElementById(id); if (!select) return;
      const atual = select.value;
      select.innerHTML = `<option value="">${rotulo}</option>` + [...valores[campo]].sort((a, b) => a.localeCompare(b, "pt-BR")).map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
      select.value = atual;
    });
  }

  function fillCategories() {}

  const ID_FILTROS = ["disponCategoria", "disponSubcategoria", "disponCor", "disponMaterial", "disponEstilo", "disponSetor", "disponTipo", "disponStatus", "disponReserva"];
  function filtroAtivo() {
    const algum = ID_FILTROS.some((id) => document.getElementById(id)?.value);
    const limpar = $("#disponLimparFiltros"); if (limpar) limpar.hidden = !algum;
    return Boolean(normalize($("#disponBusca")?.value) || algum);
  }

  // Busca, categoria e status filtram o que já foi carregado (sem recarregar do banco); só a data recarrega.
  function aplicarFiltros() {
    state.visibleCount = state.perPage;
    render(false);
    if (filteredRows().length < state.visibleCount && state.hasMore) loadMore();
  }

  function scheduleFiltro() {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(aplicarFiltros, 200);
  }

  function filteredRows() {
    const term = normalize($("#disponBusca")?.value);
    const status = $("#disponStatus")?.value || "";
    const tipo = $("#disponTipo")?.value || "";
    const reserva = $("#disponReserva")?.value || "";
    const porCampo = FILTROS_ITEM.map(([id, campo]) => [campo, document.getElementById(id)?.value || ""]).filter(([, v]) => v);
    return state.rows.filter((row) => {
      const item = row.item;
      const haystack = normalize([item.codigo, item.referencia, item.produto, item.descricao_total, item.categoria, item.subcategoria, item.cor, item.material, item.setor_estoque].join(" "));
      return (!term || haystack.includes(term))
        && porCampo.every(([campo, v]) => String(item[campo] || "").trim() === v)
        && (!tipo || String(item.tipo || "") === tipo)
        && (!status || row.status === status)
        && (!reserva || (reserva === "com" ? Number(row.reservado) > 0 : !(Number(row.reservado) > 0)));
    });
  }

  function observeMore(rows) {
    const sentinel = $("#disponMais");
    if (!sentinel) return;
    sentinel.textContent = state.loading ? "Carregando mais itens..." : "Carregar mais itens";
    sentinel.disabled = state.loading;
    sentinel.setAttribute("aria-busy", String(state.loading));
    sentinel.hidden = !state.hasMore && state.visibleCount >= rows.length;

  }

  function render(append = false) {
    buildRows();
    const rows = filteredRows();
    if (visao === "pedidos") append = false;
    const pedidos = visao === "pedidos" ? pedidosDaData(rows.slice(0, state.visibleCount), selectedPeriod()) : [];
    cabecalhoTabela(pedidos);
    const colunas = 5 + (visao === "pedidos" ? Math.max(1, pedidos.length) + 2 : 2);
    const tbody = $("#disponTabela");
    const start = append ? tbody.querySelectorAll(".dispon-row").length : 0;
    const pageRows = rows.slice(start, state.visibleCount);

    if (append && pageRows.length) tbody.querySelector(".dispon-empty")?.remove();
    const html = pageRows.map((row) => {
      const item = row.item;
      const photo = itemPhoto(item);
      const itemName = item.descricao_total || item.produto || "-";
      // nome na 1ª linha, medidas "(L) … (A) … (P) …" na 2ª (15/11/2026: sem o código/tipo e sem "Kits completos · Limite")
      const partesNome = String(itemName).match(/^(.*?)\s*(\(L\)[\s\S]*)$/);
      const nomeLinha = partesNome && partesNome[1] ? partesNome[1] : itemName;
      const medidasLinha = partesNome && partesNome[1] ? partesNome[2] : "";
      const nota = row.erro || "";
      const celDisponivel = `<td class="dispon-quantity-cell dispon-fixa dispon-fixa-3" data-det="disponivel"><strong class="dispon-quantity dispon-quantity-available ${row.disponivel <= 0 ? 'dispon-quantity-empty' : ''}">${number(row.disponivel)}</strong></td>`;
      return `
        <tr class="dispon-row" data-item-id="${escapeHtml(item.id)}" data-status="${escapeHtml(row.status || "")}" title="${escapeHtml(statusLabel(row.status))}">
          <td class="dispon-fixa dispon-fixa-1">
            <div class="dispon-photo">
              ${photo
                ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(itemName)}" loading="lazy">`
                : ""
              }
            </div>
          </td>
          <td class="dispon-fixa dispon-fixa-2">
            <div class="dispon-item-link dispon-item-sem-detalhe">
              <span class="dispon-item-name">${escapeHtml(nomeLinha)}</span>
              ${medidasLinha ? `<span class="dispon-item-medidas">${escapeHtml(medidasLinha)}</span>` : ""}
              ${nota ? `<span class="dispon-kit-note">${escapeHtml(nota)}</span>` : ""}
            </div>
          </td>
          <td class="dispon-categoria">${escapeHtml(item.categoria || "-")}</td>
          <td class="dispon-quantity-cell" data-det="total"><span class="dispon-quantity">${number(row.total)}</span></td>
          <td class="dispon-quantity-cell" data-det="manutencao"><span class="dispon-quantity ${row.manutencao > 0 ? 'dispon-quantity-maintenance' : ''}">${number(row.manutencao)}</span></td>
          <td class="dispon-quantity-cell" data-det="reservado"><span class="dispon-quantity ${row.reservado > 0 ? 'dispon-quantity-reserved' : ''}">${number(row.reservado)}</span></td>
          ${celDisponivel}
          ${pedidos.length ? pedidos.map((p, i) => { const q = usoDoPedido(row, p.id); return `<td class="dispon-quantity-cell dispon-cel-pedido${i === 0 ? " dispon-divisao" : ""}"${q ? ` data-det="pedido:${i}"` : ""}>${q ? `<span class="dispon-quantity dispon-quantity-reserved${normalize(p.status_comercial) === "pre_reserva" ? " is-pre" : ""}">${number(q)}</span>` : '<span class="dispon-sem">–</span>'}</td>`; }).join("") : '<td class="dispon-quantity-cell dispon-divisao"><span class="dispon-sem">–</span></td>'}
        </tr>
      `;
    }).join("") || `<tr><td colspan="${colunas}" class="dispon-empty">Nenhum item encontrado.</td></tr>`;

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

  async function abrirDetalheItem(itemId, periodo = selectedPeriod()) {
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
    agendarCabecalho();
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
      await carregarLivre(periodo);
      if (versao !== detalheVersao) return;
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
    await carregarLivre(periodo);
    return calcularItem(item, periodo);
  }

  async function resetRowsAndRender() {
    state.visibleCount = state.perPage;
    try { await loadAll(); }
    catch(error){
      state.generation++;
      state.hasMore = false;
      state.loading = false;
      const tb = $("#disponTabela"), mais = $("#disponMais"), erro = $("#disponErro");
      if (tb) tb.innerHTML = "";
      if (mais) mais.hidden = true;
      if (erro) { erro.textContent = error.message; erro.hidden = false; }
      window.alerta?.(error.message, "Disponibilidade", "erro");
    }
  }

  function scheduleReset() {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(resetRowsAndRender, 250);
  }

  function bindEvents() {
    $("#disponMais")?.addEventListener("click", carregarProximaPagina);
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
    $("#disponData")?.addEventListener("change", scheduleReset);
    $("#disponDataFim")?.addEventListener("change", scheduleReset);
    $("#disponLimparFiltros")?.addEventListener("click", () => { ID_FILTROS.forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; }); scheduleFiltro(); });
    ["disponBusca", ...ID_FILTROS].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", scheduleFiltro);
      document.getElementById(id)?.addEventListener("change", scheduleFiltro);
    });

    // 15/11/2026: a tela "Reservas no período" (detalhe do item) foi removida a pedido; clicar no item não abre nada.

    $("#btnVoltarDispon")?.addEventListener("click", voltarParaLista);
    // cartão com os detalhes do pedido ao passar o mouse (ou focar) no cabeçalho da coluna do pedido
    const mostrarCartao = (th) => {
      const p = pedidosCabecalho[Number(th.dataset.pedidoCol)]; if (!p) return;
      const c = cartaoAberto(); c.innerHTML = cartaoPedidoHtml(p); c.classList.toggle("is-pre", normalize(p.status_comercial) === "pre_reserva"); posicionarCartao(c, th);
    };
    const esconderCartao = () => { const c = document.getElementById("disponPedidoCartao"); if (c) c.hidden = true; };
    const cab = $("#disponCabecalho");
    cab?.addEventListener("mouseover", (e) => { const th = e.target.closest("[data-pedido-col]"); if (th) mostrarCartao(th); });
    cab?.addEventListener("mouseleave", esconderCartao);
    cab?.addEventListener("mouseout", (e) => { if (!e.relatedTarget?.closest?.("[data-pedido-col]")) esconderCartao(); });
    cab?.addEventListener("focusin", (e) => { const th = e.target.closest("[data-pedido-col]"); if (th) mostrarCartao(th); });
    cab?.addEventListener("focusout", esconderCartao);
    const tab = $("#disponTabela");
    const mostrarCelula = (td) => {
      const id = td.closest("tr[data-item-id]")?.dataset.itemId, row = state.rows.find((r) => String(r.item.id) === String(id));
      if (!row) return;
      const det = td.dataset.det, pPed = det.startsWith("pedido:") ? pedidosCabecalho[Number(det.slice(7))] : null;
      const c = cartaoAberto(); c.innerHTML = cartaoCelulaHtml(row, det); c.classList.toggle("is-pre", normalize(pPed?.status_comercial) === "pre_reserva"); posicionarCartao(c, td.querySelector(".dispon-quantity") || td);
    };
    tab?.addEventListener("mouseover", (e) => { const td = e.target.closest("td[data-det]"); if (td) mostrarCelula(td); });
    tab?.addEventListener("mouseout", (e) => { const de = e.target.closest("td[data-det]"); if (de && !de.contains(e.relatedTarget)) esconderCartao(); });
    document.addEventListener("scroll", esconderCartao, { capture: true, passive: true, signal: scrollEvents?.signal });
  }

  function voltarParaLista() {
    detalheVersao++;
    detalheAtual = null;
    agendarCabecalho();
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

  function carregarProximaPagina() {
    if (state.loading || detalheAtual) return;
    state.visibleCount += state.perPage;
    if (filteredRows().length >= state.visibleCount || !state.hasMore) render(true);
    else loadMore();
  }

  let cabecalhoFixo=null,observadorTabela=null,medidorTabela=null,frameCabecalho=0;
  function agendarCabecalho(){if(!frameCabecalho)frameCabecalho=requestAnimationFrame(()=>{frameCabecalho=0;atualizarCabecalhoFixo();});}
  // 15/11/2026: Foto, Item e Disponível ficam presos no canto esquerdo ao arrastar a tabela para o lado.
  // As posições vêm da largura real das duas primeiras colunas (o nome do item quebra linha e muda a largura).
  function posicionarColunasFixas(){
    const wrap=$('.dispon-table-wrap'),ths=$('#disponCabecalho')?.children;
    if(!wrap||!ths||ths.length<2)return;
    const w1=ths[0].getBoundingClientRect().width,w2=ths[1].getBoundingClientRect().width;
    wrap.style.setProperty('--fx2',w1+'px');wrap.style.setProperty('--fx3',(w1+w2)+'px');
    wrap.classList.toggle('dispon-rolado',wrap.scrollLeft>2);
  }
  function atualizarCabecalhoFixo(){
    posicionarColunasFixas();
    const wrap=$('.dispon-table-wrap'),head=$('#disponCabecalho'),page=$('.dispon-page');
    if(!wrap||!head||!page||detalheAtual||!head.getClientRects().length){if(cabecalhoFixo)cabecalhoFixo.hidden=true;return;}
    const tabela=wrap.querySelector('table'),rect=wrap.getBoundingClientRect(),hr=head.getBoundingClientRect();
    let topo=0,esquerda=Math.max(0,rect.left),direita=Math.min(innerWidth,rect.right);
    for(let pai=wrap.parentElement;pai&&pai!==document.body;pai=pai.parentElement){
      const css=getComputedStyle(pai);if(/auto|scroll/.test(css.overflowY)&&pai.scrollHeight>pai.clientHeight){const pr=pai.getBoundingClientRect();topo=Math.max(topo,pr.top);esquerda=Math.max(esquerda,pr.left);direita=Math.min(direita,pr.right);break;}
    }
    const menu=document.getElementById('sidebar');if(menu){const mr=menu.getBoundingClientRect();if(mr.top<=1&&mr.width>innerWidth*.7&&mr.right>innerWidth*.7&&mr.height<Math.min(200,innerHeight*.5)&&mr.bottom>0)topo=Math.max(topo,mr.bottom);}
    if(hr.top>=topo||rect.bottom<=topo||direita<=esquerda){if(cabecalhoFixo)cabecalhoFixo.hidden=true;return;}
    if(!cabecalhoFixo){cabecalhoFixo=document.createElement('div');cabecalhoFixo.className='dispon-floating-header';cabecalhoFixo.setAttribute('aria-hidden','true');cabecalhoFixo.inert=true;page.append(cabecalhoFixo);}
    cabecalhoFixo.hidden=false;Object.assign(cabecalhoFixo.style,{top:Math.min(topo,rect.bottom-hr.height)+'px',left:esquerda+'px',width:(direita-esquerda)+'px',height:hr.height+'px'});
    const html=head.parentElement.outerHTML;
    if(cabecalhoFixo.dataset.conteudo!==html){cabecalhoFixo.innerHTML='<table>'+html+'</table>';cabecalhoFixo.dataset.conteudo=html;cabecalhoFixo.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));}
    const clone=cabecalhoFixo.querySelector('table');Object.assign(clone.style,{width:tabela.getBoundingClientRect().width+'px',marginLeft:(rect.left-esquerda-wrap.scrollLeft)+'px'});
    const originais=[...head.children];cabecalhoFixo.querySelectorAll('th').forEach((th,i)=>{th.style.transform='';if(originais[i]?.classList.contains('dispon-fixa')){th.style.position='relative';th.style.zIndex='2';th.style.background='#fff';}const largura=originais[i]?.getBoundingClientRect().width||0;const estilo=getComputedStyle(originais[i]);for(const prop of ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform','textAlign','verticalAlign','whiteSpace','paddingTop','paddingRight','paddingBottom','paddingLeft','color'])th.style[prop]=estilo[prop];th.style.width=largura+'px';th.style.minWidth=largura+'px';th.style.maxWidth=largura+'px';});
    // colunas fixas também no cabeçalho flutuante: cada uma vai para onde a original está na tela
    cabecalhoFixo.querySelectorAll('th').forEach((th,i)=>{if(!originais[i]?.classList.contains('dispon-fixa'))return;const d=originais[i].getBoundingClientRect().left-th.getBoundingClientRect().left;if(Math.abs(d)>0.5)th.style.transform='translateX('+d+'px)';});
  }
  function onListScroll(event) {
    agendarCabecalho();
    const scroller = event.target === document ? document.scrollingElement : event.target;
    const page = $(".dispon-page");
    // rola a página ou a própria tabela (cabeçalho fixo: a tabela rola dentro da caixa dela)
    if (!scroller || !page || (scroller !== document.scrollingElement && !scroller.contains(page) && !page.contains(scroller))) return;
    const position = scroller.scrollTop;
    const previous = scrollPositions.get(scroller) || 0;
    scrollPositions.set(scroller, position);
    if (position <= previous || state.loading || !state.initialized || detalheAtual) return;
    const sentinel = $("#disponMais");
    if (!sentinel || sentinel.hidden) return;
    if (scroller.contains($("#disponTabela")) && !scroller.contains(sentinel)) {
      // O rodapé fica fora da caixa rolável da tabela: observar o fim da própria caixa.
      if (position + scroller.clientHeight < scroller.scrollHeight - 80) return;
    } else {
      const rect = sentinel.getBoundingClientRect();
      const viewport = scroller === document.scrollingElement
        ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
      if (rect.top > viewport.bottom || rect.bottom < viewport.top) return;
    }
    carregarProximaPagina();
  }

  function ativarArrasteHorizontal(){
    const wrap=$('.dispon-table-wrap'),signal=scrollEvents.signal;if(!wrap)return;
    let arraste=null,bloquearCliqueAte=0;
    const encerrar=()=>{if(!arraste)return;const atual=arraste;arraste=null;if(atual.ativo)bloquearCliqueAte=performance.now()+350;wrap.classList.remove('dispon-arrastando');if(wrap.hasPointerCapture(atual.id))wrap.releasePointerCapture(atual.id);};
    wrap.addEventListener('pointerdown',e=>{
      if(e.pointerType!=='mouse'||e.button!==0||wrap.scrollWidth<=wrap.clientWidth||e.target.closest('input,select,textarea,button:not(.dispon-item-link),[contenteditable="true"]'))return;
      arraste={id:e.pointerId,x:e.clientX,y:e.clientY,scroll:wrap.scrollLeft,ativo:false};
    },{signal});
    document.addEventListener('pointermove',e=>{
      if(!arraste||e.pointerId!==arraste.id)return;
      const dx=e.clientX-arraste.x,dy=e.clientY-arraste.y;
      if(!arraste.ativo){if(Math.abs(dx)<6)return;if(Math.abs(dy)>Math.abs(dx)){encerrar();return;}arraste.ativo=true;wrap.setPointerCapture(e.pointerId);wrap.classList.add('dispon-arrastando');window.getSelection()?.removeAllRanges();}
      e.preventDefault();wrap.scrollLeft=arraste.scroll-dx;agendarCabecalho();
    },{signal,passive:false});
    document.addEventListener('pointerup',e=>{if(e.pointerId===arraste?.id)encerrar();},{signal});
    document.addEventListener('pointercancel',e=>{if(e.pointerId===arraste?.id)encerrar();},{signal});
    wrap.addEventListener('lostpointercapture',encerrar,{signal});
    wrap.addEventListener('dragstart',e=>{if(arraste)e.preventDefault();},{signal});
    wrap.addEventListener('click',e=>{if(e.detail>0&&performance.now()<bloquearCliqueAte){e.preventDefault();e.stopImmediatePropagation();}},{signal,capture:true});
    signal.addEventListener('abort',encerrar,{once:true});
  }
  function initDisponibilidade() {
    if (state.initialized) return;
    state.initialized = true;
    const inputDate = $("#disponData");
    if (inputDate && !inputDate.value) inputDate.value = new Date().toISOString().slice(0, 10);
    const inputFim = $("#disponDataFim");
    if (inputFim && !inputFim.value) inputFim.value = inputDate?.value || new Date().toISOString().slice(0, 10);
    scrollEvents = new AbortController();
    scrollPositions = new WeakMap();
    document.addEventListener("scroll", onListScroll, {
      capture: true, passive: true, signal: scrollEvents.signal
    });
    bindEvents();
    avisoSimulacao();
    ativarArrasteHorizontal();
    window.addEventListener('resize',agendarCabecalho,{signal:scrollEvents.signal});
    const wrap=$('.dispon-table-wrap');if(wrap){observadorTabela=new MutationObserver(agendarCabecalho);observadorTabela.observe(wrap,{childList:true,subtree:true});medidorTabela=new ResizeObserver(agendarCabecalho);medidorTabela.observe(wrap);}
    resetRowsAndRender().finally(() => window.finalizarCarregamentoModulo?.());
  }

  function destroyDisponibilidade() {
    detalheVersao++;
    detalheAtual = null;
    retornoLista = null;
    clearTimeout(filterTimer);
    observadorTabela?.disconnect();medidorTabela?.disconnect();observadorTabela=null;medidorTabela=null;
    cancelAnimationFrame(frameCabecalho);frameCabecalho=0;cabecalhoFixo?.remove();cabecalhoFixo=null;
    document.getElementById("disponPedidoCartao")?.remove();
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
