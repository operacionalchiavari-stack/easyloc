/* Central de Pedidos > Painel gerencial (18/11/2026): números para decisão. Quantos eventos com cada cliente e em cada local,
   regiões e raio de atuação (com mapa de calor dos locais), faturamento, ticket médio, quanto se dá de BV e de desconto.
   Lê os pedidos direto (RLS do Comercial). Período pela data do evento. */
(function () {
  "use strict";
  const R = window.ComercialRelatorios;
  const $ = (id) => document.getElementById(id);
  const { esc, fmt, pct, fmtPct } = R;
  const n = (v) => Number(v) || 0;
  const brl = (v) => n(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const RESERVADOS = ["aprovado", "finalizado", "enviado"];
  // Galpão (Estrada União e Indústria, Itaipava) — centro do mapa e dos círculos do raio de atuação
  const GALPAO = [-22.3866, -43.1338];
  const s = { pedidos: [], locais: new Map(), clientes: new Map(), bv: new Map(), mapa: null, camadas: [] };

  const valoresDe = (p) => p.observacoes?.valores || {};
  const valorDe = (p) => n(valoresDe(p).total) || n(p.valor_total);
  function descontoDe(p) {
    const cfg = p.observacoes?.pagamento_config || {};
    const areas = cfg.descontosAreas && typeof cfg.descontosAreas === "object" ? Object.values(cfg.descontosAreas).reduce((t, v) => t + n(v), 0) : n(cfg.descontoComercial);
    return areas + n(cfg.descontoBvPedido);
  }
  const locacaoDe = (p) => n(valoresDe(p).locacao_bv) || n(valoresDe(p).locacao);
  function bvDe(p) {
    const b = s.bv.get(p.id);
    if (b) return { valor: n(b.valor_aprovado ?? b.valor), pct: n(b.percentual) };
    const pctObs = n(p.observacoes?.bv?.percentual);
    return { valor: pctObs ? locacaoDe(p) * pctObs / 100 : 0, pct: pctObs };
  }

  async function carregar() {
    const { sb, empresa } = await R.contexto();
    const [pedidos, locais, clientes] = await Promise.all([
      R.todos(sb, "separacoes_pedidos", "id,numero_pedido,cliente_id,cliente_nome,local_id,local_nome,data_evento,data_hora,status_comercial,valor_total,observacoes,criado_em,pedido_origem_id", (q) => q.eq("empresa_id", empresa)),
      R.todos(sb, "locais_empresas", "id,nome_razao,endereco,latitude,longitude,distancia_galpao_km", (q) => q.eq("empresa_id", empresa)),
      R.todos(sb, "clientes_empresas", "id,nome_razao,catalogo_logo_url,bv_percentual,desconto_fixo_ativo,desconto_fixo_percentual", (q) => q.eq("empresa_id", empresa)).catch(() => [])
    ]);
    s.pedidos = pedidos.filter((p) => !p.observacoes?.teste_cronograma && !p.observacoes?.teste_ia && !p.observacoes?.demo_lote);
    s.locais = new Map(locais.map((l) => [l.id, l]));
    s.clientes = new Map(clientes.map((c) => [c.id, c]));
    try { const bv = await R.todos(sb, "fin_bv_comissoes", "pedido_id,percentual,valor,valor_aprovado,aprovacao", (q) => q.eq("empresa_id", empresa)); s.bv = new Map(bv.map((b) => [b.pedido_id, b])); } catch (_) { s.bv = new Map(); }
  }

  function periodo() { return { de: $("gDe").value || "0000-01-01", ate: $("gAte").value || "9999-12-31" }; }
  function lista() {
    const { de, ate } = periodo(), todos = $("gStatus").value === "todos";
    return s.pedidos.filter((p) => {
      const d = String(p.data_evento || p.data_hora || "").slice(0, 10);
      if (!d || d < de || d > ate) return false;
      return todos ? p.status_comercial !== "cancelado" : RESERVADOS.includes(p.status_comercial);
    });
  }
  const localDe = (p) => s.locais.get(p.local_id) || null;
  const nomeCliente = (p) => s.clientes.get(p.cliente_id)?.nome_razao || p.cliente_nome || "Sem cliente";
  const nomeLocal = (p) => localDe(p)?.nome_razao || p.local_nome || "Sem local";
  const kmDe = (p) => n(localDe(p)?.distancia_galpao_km);
  function agrupar(ps, chave) {
    const m = new Map();
    ps.forEach((p) => { const k = chave(p) || "—"; const o = m.get(k) || { k, n: 0, valor: 0, desconto: 0, bv: 0, locacao: 0, ps: [] }; o.n++; o.valor += valorDe(p); o.desconto += descontoDe(p); o.bv += bvDe(p).valor; o.locacao += locacaoDe(p); o.ps.push(p); m.set(k, o); });
    return [...m.values()].sort((a, b) => b.n - a.n || b.valor - a.valor);
  }

  const CORES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  function barras(itens, fmtV, cor) {
    const l = itens.slice(0, 10), max = Math.max(1, ...l.map((x) => n(x.v)));
    return '<div class="ge-barras">' + l.map((x) => '<div class="ge-barra" title="' + esc(x.k) + ": " + fmtV(x.v) + '"><span class="ge-barra-nome">' + esc(x.k) + '</span><div class="ge-barra-trilho"><span style="width:' + (n(x.v) / max * 100) + "%;background:" + (cor || CORES[0]) + '"></span></div><b>' + fmtV(x.v) + "</b></div>").join("") + (itens.length > 10 ? '<p class="ge-mais">+ ' + (itens.length - 10) + " na tabela</p>" : "") + "</div>";
  }
  // gráfico de pizza (19/11/2026, pedido do usuário): até 7 fatias + "Outros", com legenda e porcentagem
  const PIZZA = ["#123f86", "#2a78d6", "#1baf7a", "#eda100", "#eb6834", "#e87ba4", "#6250d6", "#b8c2cf"];
  function pizza(itens, fmtV, titulo) {
    const ord = itens.filter((x) => n(x.v) > 0).sort((a, b) => n(b.v) - n(a.v));
    const top = ord.slice(0, 7), resto = ord.slice(7).reduce((t, x) => t + n(x.v), 0);
    if (resto > 0) top.push({ k: "Outros (" + (ord.length - 7) + ")", v: resto });
    const tot = top.reduce((t, x) => t + n(x.v), 0);
    if (!tot) return '<p class="ge-mais">Sem dados para o gráfico.</p>';
    const R0 = 90, C = 100; let ang = -Math.PI / 2;
    const fatias = top.map((x, i) => {
      const fr = n(x.v) / tot, a2 = ang + fr * Math.PI * 2, cor = PIZZA[i % PIZZA.length];
      const d = fr >= 0.9999 ? `M ${C} ${C - R0} A ${R0} ${R0} 0 1 1 ${C - 0.01} ${C - R0} Z` :
        `M ${C} ${C} L ${C + R0 * Math.cos(ang)} ${C + R0 * Math.sin(ang)} A ${R0} ${R0} 0 ${fr > 0.5 ? 1 : 0} 1 ${C + R0 * Math.cos(a2)} ${C + R0 * Math.sin(a2)} Z`;
      const meio = (ang + a2) / 2; ang = a2;
      const rot = fr >= 0.06 ? `<text x="${C + R0 * 0.62 * Math.cos(meio)}" y="${C + R0 * 0.62 * Math.sin(meio)}" text-anchor="middle" dominant-baseline="central">${Math.round(fr * 100)}%</text>` : "";
      return { path: `<path d="${d}" fill="${cor}"><title>${esc(x.k)}: ${fmtV(x.v)} (${(fr * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</title></path>`, rot, cor, x, fr };
    });
    return (titulo ? "<h4>" + titulo + "</h4>" : "") + '<div class="ge-pizza"><svg viewBox="0 0 200 200" role="img" aria-label="' + esc(titulo || "Gráfico de pizza") + '"><g class="ge-fatias">' + fatias.map((f) => f.path).join("") + '</g><g class="ge-rotulos">' + fatias.map((f) => f.rot).join("") + "</g></svg>" +
      '<ul class="ge-legenda">' + fatias.map((f) => '<li><span style="background:' + f.cor + '"></span><em>' + esc(f.x.k) + "</em><b>" + fmtV(f.x.v) + "</b><small>" + (f.fr * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%</small></li>").join("") + "</ul></div>";
  }
  const quadro = (titulo, sub, tabela, grafico) => '<section class="cr-bloco ge-quadro"><h3>' + titulo + (sub ? " <small>" + sub + "</small>" : "") + '</h3><div class="ge-corpo' + (grafico ? "" : " sem-grafico") + '"><div class="ge-dados"><div class="gr-rolar">' + tabela + "</div></div>" + (grafico ? '<div class="ge-graf">' + grafico + "</div>" : "") + "</div></section>";
  const tabelaGrupo = (rotulo, grupos, totN, totV, extra) => '<table class="gr-planilha"><thead><tr><th>' + rotulo + '</th><th class="num">Eventos</th><th class="num">% eventos</th><th class="num">Faturamento</th><th class="num">Ticket médio</th>' + (extra ? extra.th : "") + "</tr></thead><tbody>" +
    grupos.map((g) => '<tr><th scope="row">' + esc(g.k) + '</th><td class="num">' + g.n + '</td><td class="num">' + fmtPct(pct(g.n, totN)) + '</td><td class="num">' + fmt(g.valor) + '</td><td class="num">' + fmt(g.n ? g.valor / g.n : 0) + "</td>" + (extra ? extra.td(g) : "") + "</tr>").join("") +
    '<tr class="derivada"><th scope="row">Total</th><td class="num">' + totN + '</td><td class="num">100,0%</td><td class="num">' + fmt(totV) + '</td><td class="num">' + fmt(totN ? totV / totN : 0) + "</td>" + (extra ? extra.total : "") + "</tr></tbody></table>";

  function pintar() {
    const ps = lista();
    if (!ps.length) { $("gConteudo").innerHTML = '<div class="cr-vazio">Nenhum evento nesse período.</div>'; return; }
    const totN = ps.length, totV = ps.reduce((t, p) => t + valorDe(p), 0);
    const totDesc = ps.reduce((t, p) => t + descontoDe(p), 0), totBv = ps.reduce((t, p) => t + bvDe(p).valor, 0), totLoc = ps.reduce((t, p) => t + locacaoDe(p), 0);
    const comBv = ps.filter((p) => bvDe(p).pct > 0), pctMedioBv = comBv.length ? comBv.reduce((t, p) => t + bvDe(p).pct, 0) / comBv.length : 0;
    const kms = ps.map(kmDe).filter((k) => k > 0).sort((a, b) => a - b);
    const quantil = (q) => kms.length ? kms[Math.min(kms.length - 1, Math.floor(q * (kms.length - 1)))] : 0;
    const cidadeDe = (p) => R.regiao(localDe(p)?.endereco).cidade || "Sem cidade";
    const bairroDe = (p) => { const r = R.regiao(localDe(p)?.endereco); return r.bairro ? r.bairro + " · " + r.cidade : r.cidade || "Sem bairro"; };
    const porCliente = agrupar(ps, nomeCliente), porLocal = agrupar(ps, nomeLocal), porCidade = agrupar(ps, cidadeDe), porBairro = agrupar(ps, bairroDe);
    const porFaixa = agrupar(ps, (p) => R.faixaDistancia(kmDe(p)));
    const meses = agrupar(ps, (p) => String(p.data_evento || p.data_hora).slice(0, 7)).sort((a, b) => a.k.localeCompare(b.k));

    const resumo = [
      ["Eventos", String(totN)], ["Faturamento", fmt(totV)], ["Ticket médio", fmt(totV / totN)],
      ["Clientes atendidos", String(porCliente.length)], ["Locais diferentes", String(porLocal.length)],
      ["Descontos dados", fmt(totDesc) + " · " + fmtPct(pct(totDesc, totV + totDesc)) + " do valor bruto"],
      ["BV (comissão de decoradores)", fmt(totBv) + " · " + fmtPct(pct(totBv, totLoc)) + " da locação"],
      ["BV médio de quem recebe", comBv.length ? fmtPct(pctMedioBv) + " (" + comBv.length + " eventos com BV)" : "–"],
      ["Distância média do galpão", kms.length ? (kms.reduce((a, b) => a + b, 0) / kms.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km" : "–"],
      ["Raio de atuação", kms.length ? "metade dos eventos até " + Math.round(quantil(0.5)) + " km · 90% até " + Math.round(quantil(0.9)) + " km · mais longe " + Math.round(kms.at(-1)) + " km" : "–"]
    ];
    const tResumo = '<table class="gr-planilha"><tbody>' + resumo.map(([k, v]) => '<tr><th scope="row">' + k + '</th><td class="num">' + v + "</td></tr>").join("") + "</tbody></table>";
    const comBvDesc = { th: '<th class="num">Desconto</th><th class="num">BV</th>', td: (g) => '<td class="num">' + fmtPct(pct(g.desconto, g.valor + g.desconto)) + '</td><td class="num">' + fmtPct(pct(g.bv, g.locacao)) + "</td>", total: '<td class="num">' + fmtPct(pct(totDesc, totV + totDesc)) + '</td><td class="num">' + fmtPct(pct(totBv, totLoc)) + "</td>" };
    const comKm = { th: '<th class="num">Distância</th>', td: (g) => { const k = kmDe(g.ps[0]); return '<td class="num">' + (k ? Math.round(k) + " km" : "–") + "</td>"; }, total: '<td class="num"></td>' };

    $("gConteudo").innerHTML =
      quadro("Resumo", "", tResumo, '<h4>Onde a empresa atua</h4><div id="gMapa" class="ge-mapa" role="img" aria-label="Mapa de calor dos locais dos eventos"></div><p class="ge-mapa-legenda">Cada círculo é um local: quanto maior e mais forte, mais eventos lá. Anéis tracejados: até onde vão metade (verde) e 90% (laranja) dos eventos. Passe o mouse para ver os detalhes.</p>') +
      quadro("Por cliente", porCliente.length + " clientes", tabelaGrupo("Cliente", porCliente, totN, totV, comBvDesc), pizza(porCliente.map((g) => ({ k: g.k, v: g.valor })), brl, "Faturamento por cliente")) +
      quadro("Por local", porLocal.length + " locais", tabelaGrupo("Local", porLocal, totN, totV, comKm), pizza(porLocal.map((g) => ({ k: g.k, v: g.n })), (v) => v + " ev.", "Eventos por local")) +
      quadro("Por cidade", "", tabelaGrupo("Cidade", porCidade, totN, totV), pizza(porCidade.map((g) => ({ k: g.k, v: g.valor })), brl, "Faturamento por cidade")) +
      quadro("Por bairro", "", tabelaGrupo("Bairro", porBairro, totN, totV), pizza(porBairro.map((g) => ({ k: g.k, v: g.n })), (v) => v + " ev.", "Eventos por bairro")) +
      quadro("Por distância do galpão", "", tabelaGrupo("Faixa", porFaixa, totN, totV), pizza(porFaixa.map((g) => ({ k: g.k, v: g.n })), (v) => v + " ev.", "Eventos por distância do galpão")) +
      quadro("Mês a mês", "pela data do evento", tabelaGrupo("Mês", meses.map((g) => ({ ...g, k: new Date(g.k + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) })), totN, totV, comBvDesc), barras(meses.map((g) => ({ k: new Date(g.k + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), v: g.valor })), brl, CORES[0]));
    desenharMapaGoogle(ps, quantil(0.5), quantil(0.9)).catch(() => desenharMapa(ps, quantil(0.5), quantil(0.9)));
  }

  // Google Maps (19/11/2026): satélite com nomes de ruas, como no pedido. A camada de calor do Google foi descontinuada
  // (mai/2026), então o "calor" são círculos por local, maiores e mais fortes conforme o número de eventos.
  async function desenharMapaGoogle(ps, km50, km90) {
    const host = $("gMapa"); if (!host) return;
    if (!window.carregarGooglePlaces) throw Error("sem Google");
    await window.carregarGooglePlaces();
    const g = window.google.maps;
    if (s.mapa?.remove) { s.mapa.remove(); } s.mapa = null;
    const mapa = new g.Map(host, { center: { lat: GALPAO[0], lng: GALPAO[1] }, zoom: 9, mapTypeId: "hybrid", streetViewControl: false, fullscreenControl: true, mapTypeControl: true, gestureHandling: "cooperative" });
    const porLocal = new Map();
    ps.forEach((p) => { const l = localDe(p); const lat = Number(l?.latitude), lng = Number(l?.longitude); if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng)) return; const o = porLocal.get(l.id) || { lat, lng, nome: l.nome_razao, n: 0, valor: 0, km: n(l.distancia_galpao_km) }; o.n++; o.valor += valorDe(p); porLocal.set(l.id, o); });
    const pontos = [...porLocal.values()], max = Math.max(1, ...pontos.map((x) => x.n));
    const info = new g.InfoWindow();
    const limites = new g.LatLngBounds(); limites.extend({ lat: GALPAO[0], lng: GALPAO[1] });
    pontos.forEach((x) => {
      const forca = x.n / max;
      const c = new g.Circle({ map: mapa, center: { lat: x.lat, lng: x.lng }, radius: 900 + forca * 4200, strokeColor: "#ffffff", strokeWeight: 1.5, strokeOpacity: 0.9, fillColor: forca > 0.66 ? "#e34948" : forca > 0.33 ? "#eb6834" : "#eda100", fillOpacity: 0.35 + forca * 0.35 });
      const txt = '<div style="font:13px Inter,sans-serif;min-width:180px"><b>' + esc(x.nome) + "</b><br>" + x.n + " evento" + (x.n > 1 ? "s" : "") + " · " + brl(x.valor) + (x.km ? "<br>" + Math.round(x.km) + " km do galpão" : "") + "</div>";
      c.addListener("mouseover", () => { info.setContent(txt); info.setPosition({ lat: x.lat, lng: x.lng }); info.open({ map: mapa }); });
      c.addListener("click", () => { info.setContent(txt); info.setPosition({ lat: x.lat, lng: x.lng }); info.open({ map: mapa }); });
      limites.extend({ lat: x.lat, lng: x.lng });
    });
    new g.Marker({ map: mapa, position: { lat: GALPAO[0], lng: GALPAO[1] }, title: "Galpão", label: { text: "G", color: "#fff", fontWeight: "700" } });
    const anel = (km, cor, rot) => { if (!km) return; const a = new g.Circle({ map: mapa, center: { lat: GALPAO[0], lng: GALPAO[1] }, radius: km * 1000, strokeColor: cor, strokeWeight: 2, strokeOpacity: 0.9, fillOpacity: 0, clickable: true });
      a.addListener("mouseover", (e) => { info.setContent('<div style="font:13px Inter,sans-serif">' + rot + "</div>"); info.setPosition(e.latLng); info.open({ map: mapa }); }); };
    anel(km50, "#1baf7a", "Metade dos eventos até " + Math.round(km50) + " km do galpão");
    anel(km90, "#eb6834", "90% dos eventos até " + Math.round(km90) + " km do galpão");
    if (pontos.length) mapa.fitBounds(limites, 40);
    s.mapa = { remove() { host.innerHTML = ""; } };
  }

  function desenharMapa(ps, km50, km90) {
    const host = $("gMapa");
    if (!host || !window.L) { if (host) host.innerHTML = '<p class="ge-mais">Não foi possível carregar o mapa (confira a internet).</p>'; return; }
    if (s.mapa) { s.mapa.remove(); s.mapa = null; }
    const mapa = L.map(host, { scrollWheelZoom: false, attributionControl: true }).setView(GALPAO, 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(mapa);
    const porLocal = new Map();
    ps.forEach((p) => { const l = localDe(p); const lat = Number(l?.latitude), lng = Number(l?.longitude); if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng)) return; const o = porLocal.get(l.id) || { lat, lng, nome: l.nome_razao, n: 0, valor: 0 }; o.n++; o.valor += valorDe(p); porLocal.set(l.id, o); });
    const pontos = [...porLocal.values()];
    const max = Math.max(1, ...pontos.map((x) => x.n));
    if (L.heatLayer && pontos.length) L.heatLayer(pontos.map((x) => [x.lat, x.lng, x.n / max]), { radius: 34, blur: 26, minOpacity: 0.35, maxZoom: 12 }).addTo(mapa);
    pontos.forEach((x) => L.circleMarker([x.lat, x.lng], { radius: 4 + Math.min(10, x.n * 1.5), color: "#123f86", weight: 1, fillColor: "#123f86", fillOpacity: 0.35 }).bindTooltip(esc(x.nome) + " · " + x.n + " evento" + (x.n > 1 ? "s" : "") + " · " + brl(x.valor)).addTo(mapa));
    L.marker(GALPAO, { title: "Galpão" }).bindTooltip("Galpão").addTo(mapa);
    if (km50) L.circle(GALPAO, { radius: km50 * 1000, color: "#1baf7a", weight: 1.5, fill: false, dashArray: "6 6" }).bindTooltip("Metade dos eventos até " + Math.round(km50) + " km").addTo(mapa);
    if (km90) L.circle(GALPAO, { radius: km90 * 1000, color: "#eb6834", weight: 1.5, fill: false, dashArray: "6 6" }).bindTooltip("90% dos eventos até " + Math.round(km90) + " km").addTo(mapa);
    if (pontos.length) mapa.fitBounds(L.latLngBounds([GALPAO, ...pontos.map((x) => [x.lat, x.lng])]).pad(0.15));
    s.mapa = mapa;
    setTimeout(() => mapa.invalidateSize(), 50);
  }

  async function iniciar() {
    const ano = new Date().getFullYear();
    $("gDe").value = ano + "-01-01"; $("gAte").value = ano + "-12-31";
    ["gDe", "gAte", "gStatus"].forEach((id) => $(id).addEventListener("change", pintar));
    $("gVoltar").addEventListener("click", () => {
      try { if (window.parent !== window && window.parent.shellNavigate) { window.parent.shellNavigate("Modulos/Comercial/Pedidos/CentralPedidos.html"); return; } } catch (e) {}
      location.href = "CentralPedidos.html";
    });
    try { await carregar(); pintar(); }
    catch (e) { $("gConteudo").innerHTML = '<div class="cr-vazio">Não foi possível carregar: ' + esc(e.message || e) + "</div>"; }
    window.finalizarCarregamentoModulo?.();
  }
  iniciar();
})();
