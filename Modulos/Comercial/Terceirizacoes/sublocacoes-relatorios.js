/* =====================================================
   COMERCIAL > SUBLOCAÇÕES > RELATÓRIOS (20/11/2026)
   Visão do gestor sobre os itens sublocados (alugados de empresas parceiras para os nossos eventos):
   o que mais alugamos, quanto pagamos por mês e a quem, quanto cobramos do cliente (margem), quem mais pede,
   onde a margem é ruim e quais itens já custaram tanto que talvez compense comprar.
   Fonte: os itens sublocados de cada pedido (separacoes_pedidos.observacoes.projeto_comercial.dados.terceirizados,
   gravados pelo botão "Sublocação" da Lista Completa), com custo e valor de cada linha no momento do pedido; o
   cadastro dos itens (terceirizacao_itens: categoria, foto, valor de reposição) e das empresas (fornecedores).
   Período pela data do evento. Formato: cada quadro com a tabela à esquerda e a pizza à direita (igual a Cancelamentos).
   "Ver com exemplo" inventa pedidos só na tela (com os itens reais do cadastro) para ver os relatórios funcionando.
===================================================== */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const brl0 = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const int = (n) => (Number(n) || 0).toLocaleString("pt-BR");
  const pct = (a, b) => (b ? (a / b) * 100 : null);
  const fpct = (p) => (p == null || !isFinite(p) ? "–" : p.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%");
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const nomeMes = (m) => MESES[Number(m.slice(5, 7)) - 1] + "/" + m.slice(0, 4);
  const dataBr = (d) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "–");
  const CORES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  const SITUACOES = { reservados: ["aprovado", "finalizado", "enviado"], pre: ["aprovado", "finalizado", "enviado", "pre_reserva"], todos: ["aprovado", "finalizado", "enviado", "pre_reserva", "orcamento"] };
  const R = { sb: null, emp: null, carregado: false, exemplo: false, pedidos: [], itens: new Map(), empresas: new Map(), clientes: new Map(), pago: [] };

  async function contexto() {
    await window.aguardarContexto?.();
    R.sb = window.supabaseClient; R.emp = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    if (!R.sb || !R.emp) throw new Error("Sem empresa no contexto. Entre no sistema de novo.");
  }
  async function todos(tabela, colunas, ajustar) {
    const out = [];
    for (let de = 0; ; de += 1000) {
      let q = R.sb.from(tabela).select(colunas).range(de, de + 999); if (ajustar) q = ajustar(q);
      const { data, error } = await q; if (error) throw error;
      out.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    return out;
  }
  async function carregar() {
    await contexto();
    const [pedidos, itens, empresas] = await Promise.all([
      todos("separacoes_pedidos", "id,numero_pedido,cliente_id,cliente_nome,tipo_evento,data_evento,status_comercial,local_nome,terc:observacoes->projeto_comercial->dados->terceirizados", (q) => q.eq("empresa_id", R.emp).neq("status_comercial", "cancelado")),
      todos("terceirizacao_itens", "id,fornecedor_id,produto,descricao,categoria,foto_url,valor_reposicao,custo,valor_locacao,quantidade,ativo", (q) => q.eq("empresa_id", R.emp)),
      R.sb.rpc("terceirizacao_empresas", { p_empresa: R.emp }).then((r) => r.data || []).catch(() => []),
    ]);
    R.pedidosReais = pedidos.filter((p) => Array.isArray(p.terc) && p.terc.length);
    R.totalReais = pedidos;
    R.itens = new Map(itens.map((i) => [i.id, i]));
    R.empresas = new Map((empresas || []).map((e) => [e.id, e]));
    const ids = [...new Set(R.pedidosReais.map((p) => p.cliente_id).filter(Boolean))];
    if (ids.length) { const { data } = await R.sb.from("clientes_empresas").select("id,catalogo_logo_url").in("id", ids); (data || []).forEach((c) => R.clientes.set(c.id, c.catalogo_logo_url)); }
    // Contas a pagar das sublocações (só parceiros com fechamento geram conta; quem não vê o Financeiro fica sem esta coluna)
    try { R.pago = await todos("fin_pagar", "id,fornecedor_id,valor,pago,aberto,competencia,vencimento,status", (q) => q.eq("empresa_id", R.emp).eq("origem", "sublocacao").neq("status", "cancelado")); R.temFinanceiro = true; } catch (_) { R.pago = []; R.temFinanceiro = false; }
    R.carregado = true;
  }

  /* Exemplo só na tela: 18 pedidos espalhados pelos últimos 6 meses, com os itens reais do cadastro. */
  function exemplo() {
    const itens = [...R.itens.values()].filter((i) => i.ativo !== false);
    if (!itens.length) return { pedidos: [], total: [] };
    const clientes = ["Mariana Albuquerque", "Studio Flor de Lis", "Carla Decorações", "Ateliê Bianca Reis", "Lúcia Eventos"];
    const tipos = ["Casamento", "Aniversário", "Corporativo", "15 anos"];
    const pedidos = [], hoje = new Date();
    let semente = 7; const aleat = () => (semente = (semente * 9301 + 49297) % 233280) / 233280;
    for (let n = 0; n < 18; n++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - Math.floor(aleat() * 6), 1 + Math.floor(aleat() * 27));
      const qtdLinhas = 1 + Math.floor(aleat() * 3), terc = [];
      for (let k = 0; k < qtdLinhas; k++) {
        const it = itens[Math.floor(aleat() * itens.length)], custo = Number(it.custo) || 80 + Math.round(aleat() * 200), valor = Number(it.valor_locacao) || Math.round(custo * (1.3 + aleat() * 0.8));
        terc.push({ terceirizado_id: it.id, nome: it.produto, fornecedor_id: it.fornecedor_id, fornecedor_nome: R.empresas.get(it.fornecedor_id)?.nome || "Parceiro", quantidade: 1 + Math.floor(aleat() * 12), valor, custo });
      }
      pedidos.push({ id: "ex" + n, numero_pedido: "EX-" + (n + 1), cliente_nome: clientes[n % clientes.length], tipo_evento: tipos[n % tipos.length], data_evento: d.toLocaleDateString("sv-SE"), status_comercial: n % 5 === 0 ? "pre_reserva" : "aprovado", local_nome: "Local de exemplo", terc });
    }
    const total = pedidos.concat(Array.from({ length: 22 }, (_, n) => ({ id: "exs" + n, data_evento: pedidos[n % pedidos.length].data_evento, status_comercial: "aprovado" })));
    return { pedidos, total };
  }

  /* Linhas: uma por item sublocado em cada pedido do período (custo e cobrado já multiplicados pela quantidade). */
  function linhas() {
    const de = $("srDe").value || "0000-01-01", ate = $("srAte").value || "9999-12-31", st = SITUACOES[$("srSituacao").value] || SITUACOES.reservados;
    const base = R.exemplo ? exemplo() : { pedidos: R.pedidosReais, total: R.totalReais };
    const noPeriodo = (p) => p.data_evento && p.data_evento >= de && p.data_evento <= ate && st.includes(p.status_comercial);
    const pedidos = base.pedidos.filter(noPeriodo);
    const out = [];
    pedidos.forEach((p) => (p.terc || []).forEach((t) => {
      const it = R.itens.get(t.terceirizado_id) || {}, q = Number(t.quantidade) || 0;
      out.push({ pedido: p, itemId: t.terceirizado_id || t.nome, item: t.nome || it.produto || "Item", foto: it.foto_url || t.foto || "", categoria: it.categoria || "Sem categoria",
        empresaId: t.fornecedor_id || it.fornecedor_id || "", empresa: R.empresas.get(t.fornecedor_id)?.nome || t.fornecedor_nome || "Sem empresa",
        qtd: q, custo: r2((Number(t.custo) || 0) * q), cobrado: r2((Number(t.valor) || 0) * q), reposicao: Number(it.valor_reposicao) || 0, mes: p.data_evento.slice(0, 7),
        cliente: (p.cliente_nome || "").trim() || "Sem cliente", clienteId: p.cliente_id, tipo: p.tipo_evento || "Sem tipo" });
    }));
    return { linhas: out, pedidos, totalPedidos: base.total.filter(noPeriodo).length };
  }
  function agrupar(ls, chave) {
    const m = new Map();
    ls.forEach((l) => { const k = chave(l); const o = m.get(k) || { k, qtd: 0, custo: 0, cobrado: 0, pedidos: new Set(), linhas: [] }; o.qtd += l.qtd; o.custo += l.custo; o.cobrado += l.cobrado; o.pedidos.add(l.pedido.id); o.linhas.push(l); m.set(k, o); });
    return [...m.values()].map((o) => ({ ...o, custo: r2(o.custo), cobrado: r2(o.cobrado), margem: r2(o.cobrado - o.custo), mPct: pct(o.cobrado - o.custo, o.cobrado), nPed: o.pedidos.size }));
  }
  const maior = (gs, campo) => gs.slice().sort((a, b) => b[campo] - a[campo])[0];

  /* ---------- desenho ---------- */
  const iniciais = (t) => String(t || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
  const foto = (nome, url, quadrada) => '<span class="sr-foto' + (quadrada ? " quadrada" : "") + '"><i>' + esc(iniciais(nome)) + "</i>" + (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>";
  const comFoto = (nome, url, quadrada, sub) => '<span class="sr-pessoa">' + foto(nome, url, quadrada) + "<span>" + esc(nome) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span></span>";
  const corMargem = (p) => (p == null ? "" : p < 0 ? " ruim" : p < 25 ? " atencao" : " boa");
  const celMargem = (g) => '<td class="num' + corMargem(g.mPct) + '">' + brl(g.margem) + "<small>" + fpct(g.mPct) + "</small></td>";
  function pizza(itens, centro, valorCentro, fmtV) {
    let lista = itens.filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    if (lista.length > 8) { const resto = lista.slice(7); lista = lista.slice(0, 7).concat([{ k: "Outros", v: resto.reduce((a, x) => a + x.v, 0) }]); }
    const total = lista.reduce((a, x) => a + x.v, 0), RR = 60, C = 2 * Math.PI * RR; let ang = 0;
    const fatias = total > 0 ? lista.map((x, n) => { const frac = x.v / total, len = Math.max(0, frac * C - (lista.length > 1 ? 2 : 0)), off = -ang * C; ang += frac;
      return '<circle r="' + RR + '" cx="80" cy="80" fill="none" stroke="' + CORES[n % CORES.length] + '" stroke-width="26" stroke-dasharray="' + len + " " + (C - len) + '" stroke-dashoffset="' + off + '" transform="rotate(-90 80 80)"><title>' + esc(x.k) + ": " + fmtV(x.v) + " (" + Math.round(frac * 100) + "%)</title></circle>"; }).join("")
      : '<circle r="' + RR + '" cx="80" cy="80" fill="none" stroke="#e8ecf1" stroke-width="26"/>';
    return '<div class="sr-rosca"><svg viewBox="0 0 160 160" role="img" aria-label="' + esc(centro) + '">' + fatias + '<text x="80" y="76" text-anchor="middle" class="sr-rosca-rot">' + esc(centro) + '</text><text x="80" y="98" text-anchor="middle" class="sr-rosca-val">' + esc(valorCentro) + "</text></svg>" +
      '<ul class="sr-legenda">' + (lista.length ? lista.map((x, n) => '<li title="' + esc(x.k) + '"><i style="background:' + CORES[n % CORES.length] + '"></i><span>' + esc(x.k) + "</span><b>" + fmtV(x.v) + "</b><small>" + Math.round(x.v / total * 100) + "%</small></li>").join("") : '<li class="sr-sem">Sem dados no período</li>') + "</ul></div>";
  }
  const quadro = (titulo, sub, tabela, grafico) => '<section class="cr-bloco sr-quadro"><h3>' + titulo + (sub ? " <small>" + sub + "</small>" : "") + '</h3><div class="sr-corpo"><div class="sr-dados"><div class="gr-rolar">' + tabela + '</div></div><div class="sr-graf">' + grafico + "</div></div></section>";
  const tabela = (cab, corpo, rodape) => '<table class="gr-planilha"><thead><tr>' + cab.map((c) => "<th" + (c.n ? ' class="num"' : "") + ">" + c.t + "</th>").join("") + "</tr></thead><tbody>" + (corpo || '<tr><td colspan="' + cab.length + '" class="sr-vazio-linha">Nada no período.</td></tr>') + (rodape || "") + "</tbody></table>";
  const C = (t, n) => ({ t, n });

  function pintar() {
    const alvo = $("srConteudo");
    if (!R.carregado) { alvo.innerHTML = '<div class="cr-vazio">Carregando…</div>'; return; }
    const { linhas: ls, pedidos, totalPedidos } = linhas();
    const custo = r2(ls.reduce((a, l) => a + l.custo, 0)), cobrado = r2(ls.reduce((a, l) => a + l.cobrado, 0)), pecas = ls.reduce((a, l) => a + l.qtd, 0), margem = r2(cobrado - custo);
    $("srAviso").hidden = R.exemplo || R.pedidosReais.length > 0;
    $("srAvisoExemplo").hidden = !R.exemplo;
    const porItem = agrupar(ls, (l) => l.itemId).map((g) => ({ ...g, nome: g.linhas[0].item, foto: g.linhas[0].foto, empresa: g.linhas[0].empresa, reposicao: g.linhas[0].reposicao, categoria: g.linhas[0].categoria })).sort((a, b) => b.qtd - a.qtd || b.custo - a.custo);
    const porEmpresa = agrupar(ls, (l) => l.empresaId || l.empresa).map((g) => ({ ...g, nome: g.linhas[0].empresa, foto: R.empresas.get(g.linhas[0].empresaId)?.foto_url || "" })).sort((a, b) => b.custo - a.custo);
    const porMes = agrupar(ls, (l) => l.mes).sort((a, b) => a.k.localeCompare(b.k));
    const porCategoria = agrupar(ls, (l) => l.categoria).sort((a, b) => b.custo - a.custo);
    const porCliente = agrupar(ls, (l) => l.cliente).map((g) => ({ ...g, foto: R.clientes.get(g.linhas[0].clienteId) || "" })).sort((a, b) => b.custo - a.custo);
    const porTipo = agrupar(ls, (l) => l.tipo).sort((a, b) => b.custo - a.custo);
    const itemTop = porItem[0], empTop = porEmpresa[0], cliTop = porCliente[0];

    // 1. Resumo
    const resumo = [
      ["Pedidos com sublocação", int(pedidos.length) + (totalPedidos ? " de " + int(totalPedidos) + " (" + fpct(pct(pedidos.length, totalPedidos)) + ")" : "")],
      ["Peças sublocadas", int(pecas)],
      ["Pago às empresas parceiras (custo)", brl(custo)],
      ["Cobrado dos clientes", brl(cobrado)],
      ["Margem", brl(margem) + " · " + fpct(pct(margem, cobrado))],
      ["Custo médio por pedido", pedidos.length ? brl(custo / pedidos.length) : "–"],
      ["Item mais alugado", itemTop ? esc(itemTop.nome) + " (" + int(itemTop.qtd) + " peças)" : "–"],
      ["Empresa onde mais gastamos", empTop ? esc(empTop.nome) + " (" + brl(empTop.custo) + ")" : "–"],
      ["Cliente que mais pede sublocação", cliTop ? esc(cliTop.k) + " (" + brl(cliTop.custo) + ")" : "–"],
    ];
    const tResumo = '<table class="gr-planilha"><tbody>' + resumo.map(([a, b]) => '<tr><th scope="row">' + a + '</th><td class="num forte">' + b + "</td></tr>").join("") + "</tbody></table>";
    const gResumo = pizza([{ k: "Pago às parceiras", v: custo }, { k: "Margem", v: Math.max(0, margem) }], "Cobrado", brl0(cobrado), brl0);

    // 2. Itens mais alugados
    const tItens = tabela([C("Item"), C("Empresa"), C("Pedidos", 1), C("Peças", 1), C("Custo", 1), C("Cobrado", 1), C("Margem", 1)],
      porItem.map((g) => "<tr><td>" + comFoto(g.nome, g.foto, true, g.categoria) + "</td><td>" + esc(g.empresa) + '</td><td class="num">' + g.nPed + '</td><td class="num">' + int(g.qtd) + '</td><td class="num">' + brl(g.custo) + '</td><td class="num">' + brl(g.cobrado) + "</td>" + celMargem(g) + "</tr>").join(""));
    const gItens = pizza(porItem.map((g) => ({ k: g.nome, v: g.qtd })), "Peças", int(pecas), int);

    // 3. Mês a mês (quanto pagamos)
    const pagoMes = new Map();
    if (R.temFinanceiro && !R.exemplo) R.pago.forEach((p) => { const m = String(p.competencia || p.vencimento || "").slice(0, 7); if (!m) return; const o = pagoMes.get(m) || { lancado: 0, pago: 0 }; o.lancado += Number(p.valor) || 0; o.pago += Number(p.pago) || 0; pagoMes.set(m, o); });
    const cabMes = [C("Mês"), C("Pedidos", 1), C("Peças", 1), C("Custo", 1), C("Cobrado", 1), C("Margem", 1)].concat(R.temFinanceiro && !R.exemplo ? [C("Lançado no Contas a pagar", 1), C("Já pago", 1)] : []);
    const tMes = tabela(cabMes, porMes.slice().reverse().map((g) => { const f = pagoMes.get(g.k); return '<tr><th scope="row">' + nomeMes(g.k) + '</th><td class="num">' + g.nPed + '</td><td class="num">' + int(g.qtd) + '</td><td class="num">' + brl(g.custo) + '</td><td class="num">' + brl(g.cobrado) + "</td>" + celMargem(g) + (R.temFinanceiro && !R.exemplo ? '<td class="num">' + (f ? brl(f.lancado) : "–") + '</td><td class="num">' + (f ? brl(f.pago) : "–") + "</td>" : "") + "</tr>"; }).join(""),
      porMes.length ? '<tr class="derivada"><th scope="row">Total</th><td class="num">' + pedidos.length + '</td><td class="num">' + int(pecas) + '</td><td class="num">' + brl(custo) + '</td><td class="num">' + brl(cobrado) + '</td><td class="num">' + brl(margem) + "</td>" + (R.temFinanceiro && !R.exemplo ? "<td></td><td></td>" : "") + "</tr>" : "");
    const mediaMes = porMes.length ? custo / porMes.length : 0;
    const gMes = pizza(porMes.map((g) => ({ k: nomeMes(g.k), v: g.custo })), "Pago", brl0(custo), brl0) + (porMes.length ? '<p class="sr-graf-sub">Média de ' + brl(mediaMes) + " por mês · maior mês: " + esc(nomeMes(maior(porMes, "custo").k)) + "</p>" : "");

    // 4. Empresas parceiras
    const tEmp = tabela([C("Empresa"), C("Pedidos", 1), C("Peças", 1), C("Custo", 1), C("% do gasto", 1), C("Cobrado", 1), C("Margem", 1), C("Item mais alugado")],
      porEmpresa.map((g) => { const top = agrupar(g.linhas, (l) => l.item).sort((a, b) => b.qtd - a.qtd)[0]; return "<tr><td>" + comFoto(g.nome, g.foto) + '</td><td class="num">' + g.nPed + '</td><td class="num">' + int(g.qtd) + '</td><td class="num">' + brl(g.custo) + '</td><td class="num">' + fpct(pct(g.custo, custo)) + '</td><td class="num">' + brl(g.cobrado) + "</td>" + celMargem(g) + "<td>" + esc(top ? top.k : "–") + "</td></tr>"; }).join(""));
    const conc = empTop ? pct(empTop.custo, custo) : null;
    const gEmp = pizza(porEmpresa.map((g) => ({ k: g.nome, v: g.custo })), "Gasto", brl0(custo), brl0) + (conc != null && conc >= 60 && porEmpresa.length ? '<p class="sr-graf-sub sr-alerta">' + fpct(conc) + " do gasto está numa empresa só: vale ter uma segunda opção para negociar e não depender dela.</p>" : "");

    // 5. Compensa comprar? custo acumulado × valor de reposição do item
    const comprar = porItem.filter((g) => g.reposicao > 0).map((g) => ({ ...g, rel: pct(g.custo, g.reposicao) })).sort((a, b) => b.rel - a.rel);
    const semRep = porItem.filter((g) => !(g.reposicao > 0)).length;
    const sinal = (p) => (p >= 100 ? '<span class="sr-selo ruim">Já pagamos mais que o item</span>' : p >= 50 ? '<span class="sr-selo atencao">Avaliar compra</span>' : '<span class="sr-selo boa">Alugar compensa</span>');
    const tComprar = tabela([C("Item"), C("Pedidos", 1), C("Peças", 1), C("Pago no período", 1), C("Valor de reposição", 1), C("Pago ÷ reposição", 1), C("Sinal")],
      comprar.map((g) => "<tr><td>" + comFoto(g.nome, g.foto, true, g.empresa) + '</td><td class="num">' + g.nPed + '</td><td class="num">' + int(g.qtd) + '</td><td class="num">' + brl(g.custo) + '</td><td class="num">' + brl(g.reposicao) + '</td><td class="num">' + fpct(g.rel) + "</td><td>" + sinal(g.rel) + "</td></tr>").join(""));
    const faixas = [["Já pagamos mais que o item", (p) => p >= 100], ["Avaliar compra (50% a 100%)", (p) => p >= 50 && p < 100], ["Alugar compensa (até 50%)", (p) => p < 50]];
    const gComprar = pizza(faixas.map(([k, f]) => ({ k, v: comprar.filter((g) => f(g.rel)).reduce((a, g) => a + g.custo, 0) })), "Pago", brl0(comprar.reduce((a, g) => a + g.custo, 0)), brl0) +
      '<p class="sr-graf-sub">Compara o que já pagamos de aluguel no período com o valor de reposição do item (cadastro do item de sublocação).' + (semRep ? " " + semRep + " item(ns) sem valor de reposição ficam de fora." : "") + "</p>";

    // 6. Margem
    const faixaM = (p) => (p == null ? "Sem valor cobrado" : p < 0 ? "Prejuízo (margem negativa)" : p < 25 ? "Margem baixa (até 25%)" : p < 50 ? "Margem média (25% a 50%)" : "Margem boa (acima de 50%)");
    const ruins = porItem.filter((g) => g.mPct == null || g.mPct < 25).sort((a, b) => (a.mPct ?? -999) - (b.mPct ?? -999));
    const tMargem = tabela([C("Item"), C("Empresa"), C("Custo", 1), C("Cobrado", 1), C("Margem", 1)],
      ruins.map((g) => "<tr><td>" + comFoto(g.nome, g.foto, true) + "</td><td>" + esc(g.empresa) + '</td><td class="num">' + brl(g.custo) + '</td><td class="num">' + brl(g.cobrado) + "</td>" + celMargem(g) + "</tr>").join("")) +
      (ruins.length ? "" : '<p class="sr-graf-sub">Nenhum item com margem abaixo de 25% no período.</p>');
    const gMargem = pizza(agrupar(ls, (l) => faixaM(pct(l.cobrado - l.custo, l.cobrado))).map((g) => ({ k: g.k, v: g.cobrado || g.custo })), "Cobrado", brl0(cobrado), brl0);

    // 7. Clientes, 8. categorias, 9. tipo de evento
    const tCli = tabela([C("Cliente / decorador"), C("Pedidos", 1), C("Peças", 1), C("Custo", 1), C("Cobrado", 1), C("Margem", 1)],
      porCliente.map((g) => "<tr><td>" + comFoto(g.k, g.foto) + '</td><td class="num">' + g.nPed + '</td><td class="num">' + int(g.qtd) + '</td><td class="num">' + brl(g.custo) + '</td><td class="num">' + brl(g.cobrado) + "</td>" + celMargem(g) + "</tr>").join(""));
    const tCat = tabela([C("Categoria"), C("Itens diferentes", 1), C("Peças", 1), C("Custo", 1), C("% do gasto", 1), C("Margem", 1)],
      porCategoria.map((g) => '<tr><th scope="row">' + esc(g.k) + '</th><td class="num">' + new Set(g.linhas.map((l) => l.itemId)).size + '</td><td class="num">' + int(g.qtd) + '</td><td class="num">' + brl(g.custo) + '</td><td class="num">' + fpct(pct(g.custo, custo)) + "</td>" + celMargem(g) + "</tr>").join(""));
    const tTipo = tabela([C("Tipo de evento"), C("Pedidos", 1), C("Peças", 1), C("Custo", 1), C("Custo médio por pedido", 1), C("Margem", 1)],
      porTipo.map((g) => '<tr><th scope="row">' + esc(g.k) + '</th><td class="num">' + g.nPed + '</td><td class="num">' + int(g.qtd) + '</td><td class="num">' + brl(g.custo) + '</td><td class="num">' + brl(g.custo / (g.nPed || 1)) + "</td>" + celMargem(g) + "</tr>").join(""));

    // 10. Pedidos (detalhe)
    const tPed = tabela([C("Pedido"), C("Cliente"), C("Evento"), C("Itens sublocados"), C("Custo", 1), C("Cobrado", 1), C("Margem", 1)],
      pedidos.slice().sort((a, b) => String(b.data_evento).localeCompare(String(a.data_evento))).map((p) => { const lp = ls.filter((l) => l.pedido === p), c = lp.reduce((a, l) => a + l.custo, 0), v = lp.reduce((a, l) => a + l.cobrado, 0);
        return "<tr><td>" + (R.exemplo ? '<span class="sr-num">' + esc(p.numero_pedido) + "</span>" : '<a class="sr-num" href="../Pedidos/pedido.html?pedido=' + encodeURIComponent(p.id) + '">' + esc(p.numero_pedido || "—") + "</a>") + (p.status_comercial === "pre_reserva" ? '<small class="sr-pre">Pré-reserva</small>' : "") + "</td><td>" + comFoto(p.cliente_nome || "Sem cliente", R.clientes.get(p.cliente_id) || "") + "</td><td>" + esc([p.tipo_evento, dataBr(p.data_evento)].filter(Boolean).join(" · ")) + '</td><td class="cr-texto">' + esc(lp.map((l) => l.qtd + "× " + l.item).join(", ")) + '</td><td class="num">' + brl(c) + '</td><td class="num">' + brl(v) + "</td>" + celMargem({ margem: r2(v - c), mPct: pct(v - c, v) }) + "</tr>"; }).join(""));

    alvo.innerHTML =
      quadro("Resumo", esc(textoPeriodo()), tResumo, gResumo) +
      quadro("Itens mais alugados", "o que mais pedimos para as parceiras", tItens, gItens) +
      quadro("Quanto pagamos por mês", "pela data do evento", tMes, gMes) +
      quadro("Empresas parceiras", "onde o dinheiro vai", tEmp, gEmp) +
      quadro("Compensa comprar?", "aluguel pago × valor de reposição", tComprar, gComprar) +
      quadro("Margem", "itens com margem abaixo de 25% ou prejuízo", tMargem, gMargem) +
      quadro("Clientes que mais pedem sublocação", "", tCli, pizza(porCliente.map((g) => ({ k: g.k, v: g.custo })), "Gasto", brl0(custo), brl0)) +
      quadro("Por categoria do item", "", tCat, pizza(porCategoria.map((g) => ({ k: g.k, v: g.custo })), "Gasto", brl0(custo), brl0)) +
      quadro("Por tipo de evento", "", tTipo, pizza(porTipo.map((g) => ({ k: g.k, v: g.custo })), "Gasto", brl0(custo), brl0)) +
      quadro("Pedidos com sublocação", int(pedidos.length) + " pedido(s)", tPed, pizza(pedidos.map((p) => { const lp = ls.filter((l) => l.pedido === p); return { k: (p.numero_pedido || "") + " · " + (p.cliente_nome || ""), v: lp.reduce((a, l) => a + l.custo, 0) }; }), "Gasto", brl0(custo), brl0));
  }
  function textoPeriodo() {
    const de = $("srDe").value, ate = $("srAte").value, st = { reservados: "pedidos reservados", pre: "reservados e pré-reservas", todos: "reservados, pré-reservas e orçamentos" }[$("srSituacao").value];
    return (de && ate ? "eventos de " + dataBr(de) + " a " + dataBr(ate) : de ? "eventos desde " + dataBr(de) : ate ? "eventos até " + dataBr(ate) : "todos os eventos") + " · " + st;
  }

  let iniciado = false;
  async function abrir() {
    if (!iniciado) {
      iniciado = true;
      const hoje = new Date(); $("srDe").value = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1).toLocaleDateString("sv-SE"); $("srAte").value = new Date(hoje.getFullYear(), hoje.getMonth() + 3, 0).toLocaleDateString("sv-SE");
      ["srDe", "srAte", "srSituacao"].forEach((id) => $(id).addEventListener("change", pintar));
      $("srExemplo").addEventListener("click", () => { R.exemplo = !R.exemplo; $("srExemplo").textContent = R.exemplo ? "Voltar aos dados reais" : "Ver com exemplo"; $("srExemplo").setAttribute("aria-pressed", String(R.exemplo)); pintar(); });
      pintar();
      try { await carregar(); } catch (e) { console.error(e); $("srConteudo").innerHTML = '<div class="cr-vazio">Não foi possível carregar: ' + esc(e.message || e) + "</div>"; return; }
    }
    pintar();
  }
  window.SublocacoesRelatorios = { abrir };
})();
