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
  const s = { pedidos: [], locais: new Map(), foco: null };
  const SEM_MOTIVO = "Sem motivo registrado";

  // data do cancelamento no dia do Brasil (gravada em UTC: depois das 21h já seria o dia seguinte)
  const dataCanc = (p) => { const v = p.cancelamento?.data || p.atualizado_em; if (!v) return ""; const d = new Date(v); return isNaN(d) ? String(v).slice(0, 10) : d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); };
  const motivoDe = (p) => (p.cancelamento?.motivo || "").trim() || SEM_MOTIVO;
  const decoradorDe = (p) => (p.cliente_nome || "").trim() || "Sem cliente";
  const equipeDe = (p) => (p.equipe_nome || "").trim() || "Sem equipe"; // equipe do Cadastro de Clientes (out/2026)
  const valorDe = (p) => Number(p.valor_total) || 0;
  const regiaoDe = (p) => { const l = s.locais.get(p.local_id); return { ...R.regiao(l?.endereco), faixa: R.faixaDistancia(l?.distancia_galpao_km), km: l?.distancia_galpao_km }; };
  const cidadeDe = (p) => regiaoDe(p).cidade || "Cidade não identificada";

  async function carregar() {
    const { sb, empresa } = await R.contexto();
    const [pedidos, locais] = await Promise.all([
      R.todos(sb, "separacoes_pedidos", "id,numero_pedido,cliente_id,cliente_nome,tipo_evento,data_evento,valor_total,status_comercial,local_id,local_nome,criado_em,atualizado_em,cancelamento:observacoes->cancelamento,equipe_nome:observacoes->>equipe_nome", (q) => q.eq("empresa_id", empresa)),
      R.todos(sb, "locais_empresas", "id,endereco,distancia_galpao_km", (q) => q.eq("empresa_id", empresa)).catch(() => [])
    ]);
    s.pedidos = pedidos;
    s.locais = new Map(locais.map((l) => [l.id, l]));
  }

  function periodo() { return { de: $("cDe").value || "0000-01-01", ate: $("cAte").value || "9999-12-31" }; }
  function cancelados() {
    const { de, ate } = periodo(), dec = $("cDecorador").value, mot = $("cMotivo").value;
    return s.pedidos.filter((p) => p.status_comercial === "cancelado").filter((p) => { const d = dataCanc(p); return d >= de && d <= ate; })
      .filter((p) => (!dec || decoradorDe(p) === dec) && (!mot || motivoDe(p) === mot));
  }
  function criados() {
    const { de, ate } = periodo(), dec = $("cDecorador").value;
    return s.pedidos.filter((p) => { const d = String(p.criado_em || "").slice(0, 10); return d >= de && d <= ate && (!dec || decoradorDe(p) === dec); });
  }
  function agrupar(lista, chave) {
    const m = new Map();
    lista.forEach((p) => { const k = chave(p); const o = m.get(k) || { k, n: 0, valor: 0, pedidos: [] }; o.n++; o.valor += valorDe(p); o.pedidos.push(p); m.set(k, o); });
    return [...m.values()].sort((a, b) => b.n - a.n || b.valor - a.valor || String(a.k).localeCompare(String(b.k), "pt-BR"));
  }
  const maisComum = (lista, chave) => { const g = agrupar(lista, chave)[0]; return g ? g.k + " (" + g.n + ")" : "–"; };
  const linhaFiltro = (tipo, valor, celulas) => '<tr data-filtro="' + tipo + '" data-valor="' + esc(valor) + '" class="' + (s.foco && s.foco.tipo === tipo && s.foco.valor === valor ? "ativo" : "") + '" tabindex="0">' + celulas + "</tr>";
  const barra = (p) => '<span class="cr-barra-pct"><i style="width:' + Math.min(100, Math.max(0, p || 0)) + '%"></i></span>';

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
    const tLista = focados.length ? '<div class="gr-rolar"><table class="gr-planilha"><thead><tr><th>Pedido</th><th>Decorador / cliente</th><th>Evento</th><th>Local</th><th>Cidade</th><th class="num">Valor</th><th>Motivo</th><th>Observação</th><th>Cancelado em</th><th>Por</th></tr></thead><tbody>' +
      focados.map((p) => { const r = regiaoDe(p); return '<tr><th scope="row"><button type="button" class="cr-link" data-abrir="' + p.id + '">' + esc(p.numero_pedido || "—") + "</button></th><td>" + esc(decoradorDe(p)) + (p.equipe_nome ? '<br><small class="cr-sub">' + esc(p.equipe_nome) + "</small>" : "") + "</td><td>" + esc([p.tipo_evento, dataBr(p.data_evento)].filter((x) => x && x !== "–").join(" · ")) + "</td><td>" + esc(p.local_nome || "–") + "</td><td>" + esc(r.cidade || "–") + '</td><td class="num">' + fmt(valorDe(p)) + "</td><td>" + esc(motivoDe(p)) + '</td><td class="cr-texto">' + esc(p.cancelamento?.observacao || "") + "</td><td>" + dataBr(dataCanc(p)) + "</td><td>" + esc(p.cancelamento?.usuario || "–") + "</td></tr>"; }).join("") +
      "</tbody></table></div>" : '<div class="cr-vazio">Nenhum pedido cancelado com esses filtros.</div>';
    const rotuloFoco = s.foco ? { motivo: "Motivo", decorador: "Decorador", equipe: "Equipe", cidade: "Cidade", distancia: "Distância", mes: "Mês" }[s.foco.tipo] + ": " + (s.foco.tipo === "mes" ? nomeMes(s.foco.valor) : s.foco.valor) : "";
    $("cConteudo").innerHTML =
      '<section class="cr-bloco"><h3>Resumo <small>' + esc(textoPeriodo()) + '</small></h3><div class="gr-rolar"><table class="gr-planilha"><tbody>' + resumo.map(([a, b]) => '<tr><th scope="row">' + a + '</th><td class="num forte">' + b + "</td></tr>").join("") + "</tbody></table></div></section>" +
      '<div class="cr-grade"><section class="cr-bloco"><h3>Por motivo</h3><div class="gr-rolar">' + tMotivo + '</div></section><section class="cr-bloco"><h3>Por decorador</h3><div class="gr-rolar">' + tDec + "</div></section></div>" +
      '<section class="cr-bloco"><h3>Por equipe <small>todas as pessoas da equipe juntas</small></h3><div class="gr-rolar">' + tEq + "</div></section>" +
      '<div class="cr-grade"><section class="cr-bloco"><h3>Por cidade <small>tirada do endereço do local</small></h3><div class="gr-rolar">' + tCid + '</div></section><section class="cr-bloco"><h3>Por distância do galpão</h3><div class="gr-rolar">' + tFaixa + "</div></section></div>" +
      '<section class="cr-bloco"><h3>Mês a mês</h3><div class="gr-rolar">' + tMes + "</div></section>" +
      '<section class="cr-bloco" id="cLista"><h3>Pedidos cancelados <small>' + focados.length + " pedido(s)</small>" + (s.foco ? '<span class="cr-filtro-ativo">' + esc(rotuloFoco) + ' <button type="button" data-tirar-foco aria-label="Tirar filtro">×</button></span>' : "") + "</h3>" + tLista + "</section>";
  }
  function textoPeriodo() {
    const de = $("cDe").value, ate = $("cAte").value;
    return de && ate ? "cancelados de " + dataBr(de) + " a " + dataBr(ate) : de ? "cancelados desde " + dataBr(de) : ate ? "cancelados até " + dataBr(ate) : "todos os cancelamentos";
  }
  function opcoes() {
    const canc = s.pedidos.filter((p) => p.status_comercial === "cancelado");
    const preencher = (sel, valores) => { const v = sel.value; sel.innerHTML = '<option value="">Todos</option>' + valores.map((x) => '<option' + (x === v ? " selected" : "") + ">" + esc(x) + "</option>").join(""); };
    preencher($("cDecorador"), [...new Set(s.pedidos.map(decoradorDe))].sort((a, b) => a.localeCompare(b, "pt-BR")));
    preencher($("cMotivo"), [...new Set(canc.map(motivoDe))].sort((a, b) => a.localeCompare(b, "pt-BR")));
  }
  function exportar() {
    const lista = cancelados();
    R.exportar([{
      nome: "Pedidos cancelados",
      linhas: [["Pedidos cancelados · " + textoPeriodo()], [], ["Pedido", "Decorador / cliente", "Tipo de evento", "Data do evento", "Local", "Cidade", "Bairro", "Distância do galpão (km)", "Valor", "Motivo", "Observação", "Cancelado em", "Por"]]
        .concat(lista.map((p) => { const r = regiaoDe(p); return [String(p.numero_pedido || ""), decoradorDe(p), p.tipo_evento || "", R.dataPlan(p.data_evento), p.local_nome || "", r.cidade, r.bairro, Number(r.km) || "", R.r2(valorDe(p)), motivoDe(p), p.cancelamento?.observacao || "", R.dataPlan(dataCanc(p)), p.cancelamento?.usuario || ""]; })),
      larguras: [10, 30, 16, 13, 30, 22, 20, 12, 14, 26, 40, 13, 20]
    }, {
      nome: "Por motivo",
      linhas: [["Motivo", "Pedidos", "Valor"]].concat(agrupar(lista, motivoDe).map((g) => [g.k, g.n, R.r2(g.valor)])), larguras: [32, 10, 14]
    }, {
      nome: "Por decorador",
      linhas: [["Decorador / cliente", "Cancelados", "Valor"]].concat(agrupar(lista, decoradorDe).map((g) => [g.k, g.n, R.r2(g.valor)])), larguras: [32, 10, 14]
    }, {
      nome: "Por equipe",
      linhas: [["Equipe", "Cancelados", "Valor"]].concat(agrupar(lista, equipeDe).map((g) => [g.k, g.n, R.r2(g.valor)])), larguras: [32, 10, 14]
    }, {
      nome: "Por cidade",
      linhas: [["Cidade", "Cancelados", "Valor"]].concat(agrupar(lista, cidadeDe).map((g) => [g.k, g.n, R.r2(g.valor)])), larguras: [32, 10, 14]
    }], "Cancelamentos");
  }

  async function iniciar() {
    const ano = new Date().getFullYear();
    $("cDe").value = ano + "-01-01"; $("cAte").value = R.hoje();
    try { await carregar(); } catch (e) { console.error(e); $("cConteudo").innerHTML = '<div class="cr-vazio">Não foi possível carregar: ' + esc(e.message || e) + "</div>"; return; }
    opcoes(); pintar();
    ["cDe", "cAte", "cDecorador", "cMotivo"].forEach((id) => $(id).addEventListener("change", () => { s.foco = null; pintar(); }));
    $("cLimpar").addEventListener("click", () => { $("cDe").value = ""; $("cAte").value = ""; $("cDecorador").value = ""; $("cMotivo").value = ""; s.foco = null; pintar(); });
    $("cExcel").addEventListener("click", exportar);
    const escolher = (tr) => { const f = { tipo: tr.dataset.filtro, valor: tr.dataset.valor }; s.foco = s.foco && s.foco.tipo === f.tipo && s.foco.valor === f.valor ? null : f; pintar(); document.getElementById("cLista")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
    $("cConteudo").addEventListener("click", (e) => {
      const ab = e.target.closest("[data-abrir]"); if (ab) { window.location.href = "../Pedidos/pedido.html?pedido=" + encodeURIComponent(ab.dataset.abrir); return; }
      if (e.target.closest("[data-tirar-foco]")) { s.foco = null; pintar(); return; }
      const tr = e.target.closest("tr[data-filtro]"); if (tr) escolher(tr);
    });
    $("cConteudo").addEventListener("keydown", (e) => { const tr = e.target.closest?.("tr[data-filtro]"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); escolher(tr); } });
  }
  iniciar();
})();
