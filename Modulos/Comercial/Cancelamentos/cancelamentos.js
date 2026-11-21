/* =====================================================
   COMERCIAL > CANCELAMENTOS (out/2026)
   Relatório gerencial dos pedidos cancelados, em formato de planilha: motivo mais comum, decorador que mais cancela,
   região (cidade do endereço do local e distância do galpão), mês a mês e a lista dos pedidos.
   O motivo vem de separacoes_pedidos.observacoes.cancelamento ({ motivo, motivo_id, observacao, data, usuario }),
   gravado pela janela "Cancelar pedido" (motivos em Parâmetros > Comercial). Pedido cancelado antes de out/2026
   pode não ter motivo: aparece como "Sem motivo registrado". Período pela data do cancelamento (sem ela, a última
   alteração do pedido). Taxa = cancelados ÷ pedidos criados no mesmo período.
===================================================== */
(function () {
  "use strict";
  const R = window.ComercialRelatorios;
  const { esc, fmt, pct, fmtPct, dataBr } = R;
  const $ = (id) => document.getElementById(id);
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const s = { pedidos: [], locais: new Map(), foco: null, aba: "visao" };
  const SEM_MOTIVO = "Sem motivo registrado";

  // data do cancelamento no dia do Brasil (gravada em UTC: depois das 21h já seria o dia seguinte)
  const dataCanc = (p) => { const v = p.cancelamento?.data || p.atualizado_em; if (!v) return ""; const d = new Date(v); return isNaN(d) ? String(v).slice(0, 10) : d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); };
  const motivoDe = (p) => (p.cancelamento?.motivo || "").trim() || SEM_MOTIVO;
  const decoradorDe = (p) => (p.cliente_nome || "").trim() || "Sem cliente";
  const equipeDe = (p) => (p.equipe_nome || "").trim() || "Sem equipe"; // equipe do Cadastro de Clientes (out/2026)
  const valorDe = (p) => Number(p.valor_total) || 0;
  const regiaoDe = (p) => { const l = s.locais.get(p.local_id); return { ...R.regiao(l?.endereco), faixa: R.faixaDistancia(l?.distancia_galpao_km), km: l?.distancia_galpao_km }; };
  const cidadeDe = (p) => regiaoDe(p).cidade || "Cidade não identificada";

  // Fotos (15/11/2026): decorador = foto do catálogo do cliente; quem registrou = avatar da conta (bucket avatares,
  // <empresa>/<usuário>.jpg), achado pelo nome no Cadastro de Funcionários. Sem foto, as iniciais.
  const norm = (t) => String(t || "").trim().toLowerCase();
  const iniciais = (nome) => String(nome || "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "?";
  const fotoHtml = (nome, url, cls = "") => '<span class="cc-foto ' + cls + '" title="' + esc(nome || "") + '"><i>' + esc(iniciais(nome)) + "</i>" + (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>";
  const fotoCliente = (p) => { const c = (s.clis || []).find((x) => (p.cliente_id && x.id === p.cliente_id)) || (s.clis || []).find((x) => norm(x.nome_razao) === norm(p.cliente_nome)); return c?.catalogo_logo_url || ""; };
  const avatarDe = (id) => { try { return id ? s.sb.storage.from("avatares").getPublicUrl(s.empresa + "/" + id + ".jpg").data?.publicUrl || "" : ""; } catch (_) { return ""; } };
  const idPorNome = (nome) => (s.funcs || []).find((f) => norm(f.nome) === norm(nome))?.id || null;
  const pessoaHtml = (nome, id) => nome ? '<span class="cc-pessoa">' + fotoHtml(nome, avatarDe(id || idPorNome(nome))) + "<span>" + esc(nome) + "</span></span>" : "–";
  const quandoBr = (v) => { const d = new Date(v); return isNaN(d) ? dataBr(v) : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) + " " + d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }); };

  // Gaveta com o histórico completo do pedido: tudo que mudou (comercial_historico) + todos os contatos do acompanhamento
  // (comercial_followups) + o encerramento "Não vai fechar". Mais recente em cima.
  function gaveta(cabHtml) {
    let g = document.getElementById("ccGaveta");
    if (!g) {
      g = document.createElement("div"); g.id = "ccGaveta"; g.className = "cc-gaveta"; g.setAttribute("aria-hidden", "true"); g.inert = true;
      g.innerHTML = '<div class="cc-gaveta-fundo" data-fechar></div><aside class="cc-gaveta-painel" role="dialog" aria-modal="true" aria-labelledby="ccGavetaTit"><header><div id="ccGavetaTit"></div><button type="button" class="cc-gaveta-x" data-fechar aria-label="Fechar">×</button></header><div class="cc-gaveta-corpo"></div></aside>';
      document.body.append(g);
      g.addEventListener("click", (e) => {
        if (e.target.closest("[data-fechar]")) { fecharHistorico(); return; }
        const hb = e.target.closest("[data-historico]"); if (hb) { abrirHistorico(hb.dataset.historico, true); return; }
        if (e.target.closest("[data-voltar-grupo]") && s.grupo) { abrirGrupo(s.grupo.tipo, s.grupo.valor); return; }
        const ab = e.target.closest("[data-abrir]"); if (ab) window.location.href = "../Pedidos/pedido.html?pedido=" + encodeURIComponent(ab.dataset.abrir);
      });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && g.classList.contains("aberta")) fecharHistorico(); });
    }
    g.querySelector("#ccGavetaTit").innerHTML = cabHtml;
    g.removeAttribute("aria-hidden"); g.inert = false; g.classList.add("aberta"); document.documentElement.classList.add("cc-gaveta-aberta"); g.querySelector(".cc-gaveta-x").focus();
    const corpo = g.querySelector(".cc-gaveta-corpo"); corpo.scrollTop = 0; return corpo;
  }
  // Clicar numa linha da Visão geral (15/11/2026): a gaveta mostra os pedidos daquela linha, cada um com o Histórico.
  const FILTROS = { motivo: (p) => motivoDe(p), decorador: (p) => decoradorDe(p), equipe: (p) => equipeDe(p), cidade: (p) => cidadeDe(p), distancia: (p) => regiaoDe(p).faixa, mes: (p) => dataCanc(p).slice(0, 7), todos: () => "todos" };
  const ROTULO_FILTRO = { motivo: "Motivo", decorador: "Decorador", equipe: "Equipe", cidade: "Cidade", distancia: "Distância do galpão", mes: "Mês", todos: "" };
  function abrirGrupo(tipo, valor) {
    s.grupo = { tipo, valor };
    const lista = cancelados().filter((p) => FILTROS[tipo](p) === valor).sort((a, b) => dataCanc(b).localeCompare(dataCanc(a)));
    const nomeValor = tipo === "mes" ? MESES[Number(valor.slice(5, 7)) - 1] + "/" + valor.slice(0, 4) : valor;
    const soma = lista.reduce((a, p) => a + valorDe(p), 0);
    const corpo = gaveta('<div class="cc-gav-grupo"><span>' + esc(ROTULO_FILTRO[tipo] || "Pedidos cancelados") + "</span><h3>" + esc(tipo === "todos" ? textoPeriodo() : nomeValor) + "</h3><p>" + lista.length + " pedido(s) cancelado(s) · " + fmt(soma) + "</p></div>");
    corpo.innerHTML = lista.length ? '<table class="cc-gav-tab"><thead><tr><th>Pedido</th><th>Decorador</th><th>Evento</th><th class="num">Valor</th><th>Motivo</th><th>Cancelado em</th><th>Por</th><th></th></tr></thead><tbody>' +
      lista.map((p) => '<tr><td><button type="button" class="cc-num-ped" data-abrir="' + p.id + '">' + esc(p.numero_pedido || "—") + '</button></td><td><span class="cc-pessoa">' + fotoHtml(p.cliente_nome, fotoCliente(p)) + "<span>" + esc(decoradorDe(p)) + "</span></span></td><td>" + esc([p.tipo_evento, dataBr(p.data_evento)].filter((x) => x && x !== "–").join(" · ")) + '</td><td class="num">' + fmt(valorDe(p)) + "</td><td>" + esc(motivoDe(p)) + (p.cancelamento?.observacao ? '<small class="cc-obs">' + esc(p.cancelamento.observacao) + "</small>" : "") + "</td><td>" + dataBr(dataCanc(p)) + "</td><td>" + pessoaHtml(p.cancelamento?.usuario || p.cancelamento?.por || "") + '</td><td><button type="button" class="btn secondary cc-hist-btn" data-historico="' + p.id + '">Histórico</button></td></tr>').join("") + "</tbody></table>"
      : '<p class="cr-vazio">Nenhum pedido.</p>';
  }
  async function abrirHistorico(id, doGrupo) {
    const p = s.pedidos.find((x) => x.id === id); if (!p) return;
    const corpo = gaveta((doGrupo && s.grupo ? '<button type="button" class="cc-gav-voltar" data-voltar-grupo>← Voltar à lista</button>' : "") + '<div class="cc-gav-cab">' + fotoHtml(p.cliente_nome, fotoCliente(p), "grande") + "<div><h3>Pedido " + esc(p.numero_pedido || "") + " · " + esc(decoradorDe(p)) + "</h3><p>" + esc([p.tipo_evento, dataBr(p.data_evento), p.local_nome].filter((x) => x && x !== "–").join(" · ")) + " · " + fmt(valorDe(p)) + '</p><p class="cc-gav-canc">Cancelado em ' + dataBr(dataCanc(p)) + " · " + esc(motivoDe(p)) + (p.cancelamento?.observacao ? " — " + esc(p.cancelamento.observacao) : "") + "</p></div></div>");
    corpo.innerHTML = '<p class="cr-vazio">Carregando…</p>';
    try {
      const [h, f, e] = await Promise.all([
        s.sb.rpc("comercial_historico", { p_empresa_id: s.empresa, p_pedido: id, p_limite: 5000 }),
        s.sb.from("comercial_followups").select("criado_em,criado_por,criado_por_nome,motivo,observacao,proximo").eq("empresa_id", s.empresa).eq("alvo_id", id),
        s.sb.from("comercial_followup_encerrados").select("em,por,por_nome,motivo,observacao").eq("empresa_id", s.empresa).eq("alvo_id", id)
      ]);
      const itens = []
        .concat((Array.isArray(h.data) ? h.data : []).map((x) => ({ quando: x.quando, autor: x.autor, tipo: x.tipo, texto: x.descricao })))
        .concat((f.data || []).map((x) => ({ quando: x.criado_em, autor: x.criado_por_nome, autorId: x.criado_por, tipo: "contato", texto: x.motivo + (x.observacao ? " — " + x.observacao : "") + (x.proximo ? " · próximo contato " + dataBr(x.proximo) : "") })))
        .concat((e.data || []).map((x) => ({ quando: x.em, autor: x.por_nome, autorId: x.por, tipo: "encerrado", texto: "Não vai fechar: " + x.motivo + (x.observacao ? " — " + x.observacao : "") })))
        .sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
      const contatos = itens.filter((x) => x.tipo === "contato").length;
      const ROT = { contato: "Contato", encerrado: "Não vai fechar", status: "Situação", itens: "Itens", valores: "Valores", financeiro: "Financeiro", contrato: "Contrato", evento: "Evento", pedido: "Pedido", operacao: "Operação", catalogo: "Catálogo" };
      corpo.innerHTML = itens.length ? '<p class="cc-gav-total">' + itens.length + " registro(s) · " + contatos + " contato(s)</p><ol class=\"cc-linha-tempo\">" + itens.map((x) =>
        '<li class="cc-ev cc-ev-' + esc(x.tipo) + '">' + fotoHtml(x.autor || "Sistema", avatarDe(x.autorId || idPorNome(x.autor))) + '<div><div class="cc-ev-topo"><b>' + esc(x.autor || "Sistema") + '</b><span class="cc-ev-tipo">' + esc(ROT[x.tipo] || x.tipo || "") + '</span><time>' + quandoBr(x.quando) + "</time></div><p>" + esc(x.texto || "") + "</p></div></li>").join("") + "</ol>" : '<p class="cr-vazio">Nenhum registro no histórico deste pedido.</p>';
    } catch (err) { corpo.innerHTML = '<p class="cr-vazio">Não foi possível carregar: ' + esc(err.message || err) + "</p>"; }
  }
  function fecharHistorico() { const g = document.getElementById("ccGaveta"); if (!g) return; g.classList.remove("aberta"); g.setAttribute("aria-hidden", "true"); g.inert = true; document.documentElement.classList.remove("cc-gaveta-aberta"); }

  async function carregar() {
    const { sb, empresa } = await R.contexto();
    const [pedidos, locais] = await Promise.all([
      R.todos(sb, "separacoes_pedidos", "id,numero_pedido,cliente_id,cliente_nome,tipo_evento,data_evento,valor_total,status_comercial,local_id,local_nome,criado_em,atualizado_em,cancelamento:observacoes->cancelamento,equipe_nome:observacoes->>equipe_nome", (q) => q.eq("empresa_id", empresa)),
      R.todos(sb, "locais_empresas", "id,endereco,distancia_galpao_km", (q) => q.eq("empresa_id", empresa)).catch(() => [])
    ]);
    s.pedidos = pedidos;
    s.locais = new Map(locais.map((l) => [l.id, l]));
    s.sb = sb; s.empresa = empresa;
    const [funcs, clis] = await Promise.all([
      R.todos(sb, "funcionarios_acesso", "id,nome", (q) => q.eq("empresa_id", empresa)).catch(() => []),
      R.todos(sb, "clientes_empresas", "id,nome_razao,catalogo_logo_url", (q) => q.eq("empresa_id", empresa)).catch(() => [])
    ]);
    s.funcs = funcs; s.clis = clis;
  }

  function periodo() { return { de: $("cDe").value || "0000-01-01", ate: $("cAte").value || "9999-12-31" }; }
  function cancelados() {
    const { de, ate } = periodo();
    return s.pedidos.filter((p) => p.status_comercial === "cancelado").filter((p) => { const d = dataCanc(p); return d >= de && d <= ate; });
  }
  function criados() {
    const { de, ate } = periodo();
    return s.pedidos.filter((p) => { const d = String(p.criado_em || "").slice(0, 10); return d >= de && d <= ate; });
  }
  function agrupar(lista, chave) {
    const m = new Map();
    lista.forEach((p) => { const k = chave(p); const o = m.get(k) || { k, n: 0, valor: 0, pedidos: [] }; o.n++; o.valor += valorDe(p); o.pedidos.push(p); m.set(k, o); });
    return [...m.values()].sort((a, b) => b.n - a.n || b.valor - a.valor || String(a.k).localeCompare(String(b.k), "pt-BR"));
  }
  const maisComum = (lista, chave) => { const g = agrupar(lista, chave)[0]; return g ? g.k + " (" + g.n + ")" : "–"; };
  const linhaFiltro = (tipo, valor, celulas) => '<tr data-filtro="' + tipo + '" data-valor="' + esc(valor) + '" class="' + (s.foco && s.foco.tipo === tipo && s.foco.valor === valor ? "ativo" : "") + '" tabindex="0">' + celulas + "</tr>";
  const barra = (p) => '<span class="cr-barra-pct"><i style="width:' + Math.min(100, Math.max(0, p || 0)) + '%"></i></span>';

  // Gráficos (nov/2026, mesmo estilo da Produtividade comercial): cada quadro tem a tabela à esquerda e o gráfico à direita.
  const CORES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  const brlC = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  // rosca: até 7 fatias, o resto vira "Outros"
  function rosca(grupos, total, rotuloCentro) {
    let itens = grupos.map((g) => ({ k: g.k, v: g.n, valor: g.valor }));
    if (itens.length > 8) { const resto = itens.slice(7); itens = itens.slice(0, 7).concat([{ k: "Outros", v: resto.reduce((a, x) => a + x.v, 0), valor: resto.reduce((a, x) => a + x.valor, 0) }]); }
    const R = 60, C = 2 * Math.PI * R, vivos = itens.filter((x) => x.v).length; let ang = 0;
    const fatias = total > 0 ? itens.map((x, n) => { if (!x.v) return ""; const frac = x.v / total, len = Math.max(0, frac * C - (vivos > 1 ? 2 : 0)), off = -ang * C; ang += frac;
      return '<circle r="' + R + '" cx="80" cy="80" fill="none" stroke="' + CORES[n % CORES.length] + '" stroke-width="26" stroke-dasharray="' + len + " " + (C - len) + '" stroke-dashoffset="' + off + '" transform="rotate(-90 80 80)"><title>' + esc(x.k) + ": " + x.v + " (" + Math.round(frac * 100) + "%)</title></circle>"; }).join("") : '<circle r="' + R + '" cx="80" cy="80" fill="none" stroke="#e8ecf1" stroke-width="26"/>';
    return '<div class="cc-rosca"><svg viewBox="0 0 160 160" role="img" aria-label="' + esc(rotuloCentro) + '">' + fatias + '<text x="80" y="76" text-anchor="middle" class="cc-rosca-rot">' + esc(rotuloCentro) + '</text><text x="80" y="98" text-anchor="middle" class="cc-rosca-val">' + total + "</text></svg>" +
      '<ul class="cc-legenda">' + itens.map((x, n) => '<li><i style="background:' + CORES[n % CORES.length] + '"></i><span>' + esc(x.k) + "</span><b>" + x.v + "</b><small>" + (total ? Math.round(x.v / total * 100) : 0) + "%</small></li>").join("") + "</ul></div>";
  }
  // barras horizontais de uma série só (uma cor); mostra até 10 linhas
  function barras(itens, fmtV, cor) {
    const lista = itens.slice(0, 10), max = Math.max(1, ...lista.map((x) => Number(x.v) || 0));
    return '<div class="cc-barras">' + lista.map((x) => '<div class="cc-barra" title="' + esc(x.k) + ": " + fmtV(x.v) + '"><span class="cc-barra-nome">' + esc(x.k) + '</span><div class="cc-barra-trilho"><span style="width:' + ((Number(x.v) || 0) / max * 100) + "%;background:" + (cor || CORES[0]) + '"></span></div><b>' + fmtV(x.v) + "</b></div>").join("") + (itens.length > 10 ? '<p class="cc-mais">+ ' + (itens.length - 10) + " na tabela</p>" : "") + "</div>";
  }
  const quadro = (titulo, sub, tabela, grafico, extra = "") => '<section class="cr-bloco cc-quadro"' + extra + '><h3>' + titulo + (sub ? " <small>" + sub + "</small>" : "") + '</h3><div class="cc-corpo' + (grafico ? "" : " sem-grafico") + '"><div class="cc-dados"><div class="gr-rolar">' + tabela + "</div></div>" + (grafico ? '<div class="cc-graf">' + grafico + "</div>" : "") + "</div></section>";
  function pintar() {
    const lista = cancelados(), base = criados();
    const totN = lista.length, totV = lista.reduce((a, p) => a + valorDe(p), 0);
    const antecedencia = lista.filter((p) => p.data_evento && dataCanc(p)).map((p) => R.dias(dataCanc(p), p.data_evento));
    const medAnt = antecedencia.length ? antecedencia.reduce((a, b) => a + b, 0) / antecedencia.length : null;
    if (!s.pedidos.some((p) => p.status_comercial === "cancelado")) {
      $("cConteudo").innerHTML = '<div class="cr-vazio">Nenhum pedido cancelado ainda. Quando um pedido for cancelado (com o motivo), ele aparece aqui.</div>';
      return;
    }
    const resumo = [
      ["Pedidos cancelados", String(totN)],
      ["Valor dos pedidos cancelados", fmt(totV)],
      ["Pedidos criados no período", String(base.length)],
      ["Taxa de cancelamento", fmtPct(pct(base.filter((p) => p.status_comercial === "cancelado").length, base.length)) + " dos pedidos criados no período"],
      ["Valor médio do pedido cancelado", totN ? fmt(totV / totN) : "–"],
      ["Antecedência média do cancelamento", medAnt == null ? "–" : Math.round(medAnt) + " dia(s) antes do evento"],
      ["Motivo mais comum", esc(maisComum(lista, motivoDe))],
      ["Decorador que mais cancelou", esc(maisComum(lista, decoradorDe))],
      ["Cidade com mais cancelamentos", esc(maisComum(lista, cidadeDe))]
    ];
    // por motivo
    const porMotivo = agrupar(lista, motivoDe);
    const tMotivo = '<table class="gr-planilha"><thead><tr><th>Motivo</th><th class="num">Pedidos</th><th class="num">% dos cancelamentos</th><th class="num">Valor</th><th class="num">% do valor</th></tr></thead><tbody>' +
      porMotivo.map((g) => linhaFiltro("motivo", g.k, '<th scope="row">' + esc(g.k) + '</th><td class="num">' + g.n + '</td><td class="num">' + fmtPct(pct(g.n, totN)) + barra(pct(g.n, totN)) + '</td><td class="num">' + fmt(g.valor) + '</td><td class="num">' + fmtPct(pct(g.valor, totV)) + "</td>")).join("") +
      '<tr class="derivada"><th scope="row">Total</th><td class="num">' + totN + '</td><td class="num">100,0%</td><td class="num">' + fmt(totV) + '</td><td class="num">100,0%</td></tr></tbody></table>';
    // por decorador: cancelados, pedidos criados por ele no período e a taxa
    const porDec = agrupar(lista, decoradorDe);
    const criadosPor = new Map(); base.forEach((p) => criadosPor.set(decoradorDe(p), (criadosPor.get(decoradorDe(p)) || 0) + 1));
    const tDec = '<table class="gr-planilha"><thead><tr><th>Decorador / cliente</th><th class="num">Cancelados</th><th class="num">Pedidos criados</th><th class="num">Taxa</th><th class="num">Valor</th><th>Motivo mais comum</th></tr></thead><tbody>' +
      porDec.map((g) => { const c = criadosPor.get(g.k) || 0, canc = base.filter((p) => decoradorDe(p) === g.k && p.status_comercial === "cancelado").length; return linhaFiltro("decorador", g.k, '<th scope="row">' + esc(g.k) + '</th><td class="num">' + g.n + '</td><td class="num">' + (c || "–") + '</td><td class="num">' + fmtPct(pct(canc, c)) + '</td><td class="num">' + fmt(g.valor) + "</td><td>" + esc(maisComum(g.pedidos, motivoDe)) + "</td>"); }).join("") + "</tbody></table>";
    // por equipe: soma os pedidos de todas as pessoas da equipe
    const porEq = agrupar(lista, equipeDe);
    const criadosEq = new Map(); base.forEach((p) => criadosEq.set(equipeDe(p), (criadosEq.get(equipeDe(p)) || 0) + 1));
    const tEq = '<table class="gr-planilha"><thead><tr><th>Equipe</th><th class="num">Cancelados</th><th class="num">Pedidos criados</th><th class="num">Taxa</th><th class="num">Valor</th><th>Quem mais cancelou</th></tr></thead><tbody>' +
      porEq.map((g) => { const c = criadosEq.get(g.k) || 0, canc = base.filter((p) => equipeDe(p) === g.k && p.status_comercial === "cancelado").length; return linhaFiltro("equipe", g.k, '<th scope="row">' + esc(g.k) + '</th><td class="num">' + g.n + '</td><td class="num">' + (c || "–") + '</td><td class="num">' + fmtPct(pct(canc, c)) + '</td><td class="num">' + fmt(g.valor) + "</td><td>" + esc(maisComum(g.pedidos, decoradorDe)) + "</td>"); }).join("") + "</tbody></table>";
    // por cidade e por distância
    const porCidade = agrupar(lista, cidadeDe);
    const tCid = '<table class="gr-planilha"><thead><tr><th>Cidade</th><th class="num">Pedidos</th><th class="num">%</th><th class="num">Valor</th><th>Bairros</th></tr></thead><tbody>' +
      porCidade.map((g) => { const bairros = agrupar(g.pedidos, (p) => regiaoDe(p).bairro || "—").filter((b) => b.k !== "—").slice(0, 3).map((b) => b.k + " (" + b.n + ")").join(", "); return linhaFiltro("cidade", g.k, '<th scope="row">' + esc(g.k) + '</th><td class="num">' + g.n + '</td><td class="num">' + fmtPct(pct(g.n, totN)) + '</td><td class="num">' + fmt(g.valor) + '</td><td class="cr-texto">' + esc(bairros || "–") + "</td>"); }).join("") + "</tbody></table>";
    const ordemFaixa = ["Até 20 km", "De 20 a 50 km", "De 50 a 100 km", "Mais de 100 km", "Sem distância calculada"];
    const porFaixa = agrupar(lista, (p) => regiaoDe(p).faixa).sort((a, b) => ordemFaixa.indexOf(a.k) - ordemFaixa.indexOf(b.k));
    const tFaixa = '<table class="gr-planilha"><thead><tr><th>Distância do galpão</th><th class="num">Pedidos</th><th class="num">%</th><th class="num">Valor</th></tr></thead><tbody>' +
      porFaixa.map((g) => linhaFiltro("distancia", g.k, '<th scope="row">' + esc(g.k) + '</th><td class="num">' + g.n + '</td><td class="num">' + fmtPct(pct(g.n, totN)) + '</td><td class="num">' + fmt(g.valor) + "</td>")).join("") + "</tbody></table>";
    // mês a mês (pelo mês do cancelamento; criados pelo mês de criação)
    const meses = [...new Set(lista.map((p) => dataCanc(p).slice(0, 7)).concat(base.map((p) => String(p.criado_em || "").slice(0, 7))))].filter(Boolean).sort().reverse();
    const nomeMes = (m) => MESES[Number(m.slice(5, 7)) - 1] + "/" + m.slice(0, 4);
    const tMes = '<table class="gr-planilha"><thead><tr><th>Mês</th><th class="num">Pedidos criados</th><th class="num">Cancelados</th><th class="num">Taxa</th><th class="num">Valor cancelado</th><th>Motivo mais comum</th></tr></thead><tbody>' +
      meses.map((m) => { const c = lista.filter((p) => dataCanc(p).startsWith(m)), cr = base.filter((p) => String(p.criado_em || "").startsWith(m)).length; return linhaFiltro("mes", m, '<th scope="row">' + nomeMes(m) + '</th><td class="num">' + (cr || "–") + '</td><td class="num">' + (c.length || "–") + '</td><td class="num">' + fmtPct(pct(c.length, cr)) + '</td><td class="num">' + fmt(c.reduce((a, p) => a + valorDe(p), 0)) + "</td><td>" + esc(c.length ? maisComum(c, motivoDe) : "–") + "</td>"); }).join("") + "</tbody></table>";
    // lista
    const focados = s.foco ? lista.filter((p) => ({ motivo: motivoDe, decorador: decoradorDe, equipe: equipeDe, cidade: cidadeDe, distancia: (x) => regiaoDe(x).faixa, mes: (x) => dataCanc(x).slice(0, 7) })[s.foco.tipo](p) === s.foco.valor) : lista;
    focados.sort((a, b) => dataCanc(b).localeCompare(dataCanc(a)));
    const tLista = focados.length ? '<div class="gr-rolar"><table class="gr-planilha"><thead><tr><th>Pedido</th><th>Decorador / cliente</th><th>Evento</th><th>Local</th><th>Cidade</th><th class="num">Valor</th><th>Motivo</th><th>Observação</th><th>Cancelado em</th><th>Por</th><th></th></tr></thead><tbody>' +
      focados.map((p) => { const r = regiaoDe(p); return '<tr><th scope="row"><button type="button" class="cr-link" data-abrir="' + p.id + '">' + esc(p.numero_pedido || "—") + "</button></th><td><span class=\"cc-pessoa\">" + fotoHtml(p.cliente_nome, fotoCliente(p)) + "<span>" + esc(decoradorDe(p)) + (p.equipe_nome ? '<br><small class="cr-sub">' + esc(p.equipe_nome) + "</small>" : "") + "</span></span></td><td>" + esc([p.tipo_evento, dataBr(p.data_evento)].filter((x) => x && x !== "–").join(" · ")) + "</td><td>" + esc(p.local_nome || "–") + "</td><td>" + esc(r.cidade || "–") + '</td><td class="num">' + fmt(valorDe(p)) + "</td><td>" + esc(motivoDe(p)) + '</td><td class="cr-texto">' + esc(p.cancelamento?.observacao || "") + "</td><td>" + dataBr(dataCanc(p)) + "</td><td>" + pessoaHtml(p.cancelamento?.usuario || p.cancelamento?.por || "") + '</td><td><button type="button" class="btn secondary cc-hist-btn" data-historico="' + p.id + '">Histórico</button></td></tr>'; }).join("") +
      "</tbody></table></div>" : '<div class="cr-vazio">Nenhum pedido cancelado com esses filtros.</div>';
    const rotuloFoco = s.foco ? { motivo: "Motivo", decorador: "Decorador", equipe: "Equipe", cidade: "Cidade", distancia: "Distância", mes: "Mês" }[s.foco.tipo] + ": " + (s.foco.tipo === "mes" ? nomeMes(s.foco.valor) : s.foco.valor) : "";
    const taxaPct = pct(base.filter((p) => p.status_comercial === "cancelado").length, base.length);
    const grafResumo = '<h4>Taxa de cancelamento</h4><div class="cc-taxa"><div class="cc-taxa-trilho"><span style="width:' + Math.min(100, Math.max(0, taxaPct || 0)) + '%"></span></div><b>' + fmtPct(taxaPct) + '</b></div><p class="cc-graf-sub">' + base.filter((p) => p.status_comercial === "cancelado").length + " de " + base.length + " pedidos criados no período foram cancelados.</p>" +
      '<h4>Valor perdido</h4><p class="cc-grande">' + fmt(totV) + '</p><p class="cc-graf-sub">em ' + totN + " pedido(s) cancelado(s)</p>";
    const mesesCron = meses.slice().reverse();
    $("cConteudo").innerHTML = '<div class="cc-painel-aba" data-painel="visao"' + (s.aba === "visao" ? "" : " hidden") + ">" +
      quadro("Resumo", esc(textoPeriodo()), '<table class="gr-planilha"><tbody>' + resumo.map(([a, b], n) => n < 2 ? linhaFiltro("todos", "todos", '<th scope="row">' + a + '</th><td class="num forte">' + b + "</td>") : '<tr><th scope="row">' + a + '</th><td class="num forte">' + b + "</td></tr>").join("") + "</tbody></table>", grafResumo) +
      quadro("Por motivo", "", tMotivo, rosca(porMotivo, totN, "Cancelados")) +
      quadro("Por decorador", "", tDec, barras(porDec.map((g) => ({ k: g.k, v: g.n })), (v) => String(v))) +
      quadro("Por equipe", "todas as pessoas da equipe juntas", tEq, barras(porEq.map((g) => ({ k: g.k, v: g.n })), (v) => String(v))) +
      quadro("Por cidade", "tirada do endereço do local", tCid, barras(porCidade.map((g) => ({ k: g.k, v: g.n })), (v) => String(v))) +
      quadro("Por distância do galpão", "", tFaixa, barras(porFaixa.map((g) => ({ k: g.k, v: g.n })), (v) => String(v))) +
      quadro("Mês a mês", "valor cancelado por mês", tMes, barras(mesesCron.map((m) => ({ k: nomeMes(m), v: lista.filter((p) => dataCanc(p).startsWith(m)).reduce((a, p) => a + valorDe(p), 0) })), brlC, "#e34948")) +
      "</div>" + '<div class="cc-painel-aba" data-painel="lista"' + (s.aba === "lista" ? "" : " hidden") + '><section class="cr-bloco" id="cLista"><h3>Pedidos cancelados <small>' + focados.length + " pedido(s)</small>" + (s.foco ? '<span class="cr-filtro-ativo">' + esc(rotuloFoco) + ' <button type="button" data-tirar-foco aria-label="Tirar filtro">×</button></span>' : "") + "</h3>" + tLista + "</section></div>";
    const nAba = $("cAbaN"); if (nAba) nAba.textContent = focados.length || "";
    marcarAba();
  }
  // Abas (15/11/2026): Visão geral (quadros com gráficos) e Pedidos cancelados (a lista).
  function marcarAba() {
    document.querySelectorAll("[data-aba]").forEach((b) => { const on = b.dataset.aba === s.aba; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    document.querySelectorAll("[data-painel]").forEach((d) => { d.hidden = d.dataset.painel !== s.aba; });
  }
  function textoPeriodo() {
    const de = $("cDe").value, ate = $("cAte").value;
    return de && ate ? "cancelados de " + dataBr(de) + " a " + dataBr(ate) : de ? "cancelados desde " + dataBr(de) : ate ? "cancelados até " + dataBr(ate) : "todos os cancelamentos";
  }
  async function iniciar() {
    const ano = new Date().getFullYear();
    $("cDe").value = ano + "-01-01"; $("cAte").value = R.hoje();
    try { await carregar(); } catch (e) { console.error(e); $("cConteudo").innerHTML = '<div class="cr-vazio">Não foi possível carregar: ' + esc(e.message || e) + "</div>"; return; }
    pintar();
    ["cDe", "cAte"].forEach((id) => $(id).addEventListener("change", () => { s.foco = null; pintar(); }));
    $("cLimpar").addEventListener("click", () => { $("cDe").value = ""; $("cAte").value = ""; s.foco = null; pintar(); });
    const escolher = (tr) => abrirGrupo(tr.dataset.filtro, tr.dataset.valor);
    document.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => { s.aba = b.dataset.aba; marcarAba(); }));
    $("cConteudo").addEventListener("click", (e) => {
      const hb = e.target.closest("[data-historico]"); if (hb) { abrirHistorico(hb.dataset.historico); return; }
      const ab = e.target.closest("[data-abrir]"); if (ab) { window.location.href = "../Pedidos/pedido.html?pedido=" + encodeURIComponent(ab.dataset.abrir); return; }
      if (e.target.closest("[data-tirar-foco]")) { s.foco = null; pintar(); return; }
      const tr = e.target.closest("tr[data-filtro]"); if (tr) escolher(tr);
    });
    $("cConteudo").addEventListener("keydown", (e) => { const tr = e.target.closest?.("tr[data-filtro]"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); escolher(tr); } });
  }
  iniciar();
})();
