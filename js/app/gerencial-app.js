/* Gerencial do app (20/11/2026). Painel feito para o celular: números grandes, gráficos que respondem ao toque e
   nenhuma tabela. Pedido do usuário: "pense como um dashboard pra celular, não adianta trazer algo de web pro app".
   Lê direto do Supabase (as mesmas tabelas/funções do sistema; quem não pode ver o Financeiro não vê a aba dele).
   Gráficos em SVG desenhados aqui, sem biblioteca. Cores: paleta categórica validada (azul, laranja, verde-água, amarelo)
   + status (verde bom / vermelho ruim) sempre com texto junto. */
(function(){
  const COR = { a: "#2a78d6", aForte: "#1c5cab", aWash: "rgba(42,120,214,.10)", b: "#eb6834", c: "#1baf7a", d: "#eda100",
    bom: "#0ca30c", bomTexto: "#006300", ruim: "#d03b3b", grade: "#ece8e1", base: "#d6d0c6", texto: "#2b2622", suave: "#6b655c", mudo: "#8f897f" };
  const ST = { aba: "comercial", periodo: "mes", ctx: null, dados: {}, carregando: {} };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const num = (v) => Number(v) || 0;
  const brl = (v) => "R$ " + Math.round(num(v)).toLocaleString("pt-BR");
  const compacto = (v) => { v = num(v); const a = Math.abs(v), s = v < 0 ? "−" : "";
    if(a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(".", ",") + " mi";
    if(a >= 1e3) return s + Math.round(a / 1e3).toLocaleString("pt-BR") + " mil"; return s + Math.round(a).toLocaleString("pt-BR"); };
  const brlC = (v) => (num(v) < 0 ? "−" : "") + "R$ " + compacto(Math.abs(num(v)));
  const pct = (v) => (Math.round(num(v) * 10) / 10).toLocaleString("pt-BR") + "%";
  const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const dataLocal = (s) => { if(!s) return null; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const Mai = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const somaMes = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
  const chaveMes = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");

  function periodo(p){
    const h = hoje(), meses = p === "12m" ? 12 : p === "3m" ? 3 : 1;
    const ini = somaMes(h, -(meses - 1)), fim = new Date(h.getFullYear(), h.getMonth() + 1, 0);
    const iniAnt = somaMes(ini, -meses), fimAnt = new Date(ini.getFullYear(), ini.getMonth(), 0);
    const rotulo = meses === 1 ? MES_LONGO[h.getMonth()] : meses === 3 ? "últimos 3 meses" : "últimos 12 meses";
    const ant = meses === 1 ? MES_LONGO[iniAnt.getMonth()] : "período anterior";
    return { ini, fim, iniAnt, fimAnt, rotulo, ant, meses };
  }
  const dentro = (d, a, b) => d && d >= a && d <= b;

  /* ---------- peças de desenho ---------- */
  function tile(rotulo, valor, extra, cls){ return '<div class="gd-tile ' + (cls || "") + '"><span>' + esc(rotulo) + '</span><b>' + valor + '</b>' + (extra ? '<small>' + extra + '</small>' : "") + '</div>'; }
  function delta(atual, anterior, bomSubir, rotuloAnt){
    if(!anterior){ return atual ? '<em class="gd-delta">sem base no ' + esc(rotuloAnt) + '</em>' : ""; }
    const d = (atual - anterior) / Math.abs(anterior) * 100, sobe = d >= 0, bom = bomSubir ? sobe : !sobe;
    return '<em class="gd-delta ' + (Math.abs(d) < 0.5 ? "" : bom ? "bom" : "ruim") + '">' + (sobe ? "▲ " : "▼ ") + pct(Math.abs(d)) + ' vs ' + esc(rotuloAnt) + '</em>';
  }
  function cartao(id, titulo, sub, corpo){
    return '<section class="gd-card" id="' + id + '"><header><h3>' + esc(titulo) + '</h3>' + (sub ? '<p>' + sub + '</p>' : "") + '</header>' + corpo + '</section>';
  }
  function vazio(t){ return '<p class="gd-vazio">' + esc(t) + '</p>'; }

  // Colunas (uma série ou empilhadas). Toque numa coluna mostra o valor na linha de leitura acima do gráfico.
  function colunas(host, cfg){
    const itens = cfg.itens || [], W = Math.max(260, host.clientWidth), H = 168, padE = 40, padB = 24, padT = 8;
    const series = cfg.series || [{ cor: COR.a }];
    const total = (it) => (it.partes || [it.v]).reduce((s, v) => s + num(v), 0);
    const maxV = Math.max(1, ...itens.map(cfg.lado ? (it) => Math.max(...it.partes.map(num)) : total));
    const passo = escalaPasso(maxV), topo = Math.ceil(maxV / passo) * passo || 1;
    const ph = H - padB - padT, pw = W - padE - 4, banda = pw / Math.max(1, itens.length);
    const y = (v) => padT + ph - (num(v) / topo) * ph;
    let s = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="' + H + '" role="img" aria-label="' + esc(cfg.titulo || "") + '">';
    for(let t = 0; t <= topo + 1e-9; t += passo){ const yy = y(t); s += '<line x1="' + padE + '" x2="' + (W - 2) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + (t === 0 ? COR.base : COR.grade) + '" stroke-width="1"/>' +
      '<text x="' + (padE - 6) + '" y="' + (yy + 4) + '" text-anchor="end" class="gd-eixo">' + esc(cfg.eixo ? cfg.eixo(t) : compacto(t)) + '</text>'; }
    itens.forEach((it, i) => {
      const cx = padE + banda * i + banda / 2, partes = it.partes || [it.v];
      if(cfg.lado){
        const bw = Math.min(14, (banda * 0.7 - 2) / partes.length);
        partes.forEach((v, k) => { const x = cx - (bw * partes.length + 2 * (partes.length - 1)) / 2 + k * (bw + 2); s += barra(x, y(v), bw, y(0) - y(v), series[k].cor, true); });
      } else {
        const bw = Math.min(24, banda * 0.62); let base = 0;
        partes.forEach((v, k) => { if(!num(v)) return; const y0 = y(base), y1 = y(base + num(v)); base += num(v);
          const ultimo = partes.slice(k + 1).every((x) => !num(x));
          s += barra(cx - bw / 2, y1, bw, Math.max(0, y0 - y1 - (ultimo ? 0 : 2)), it.destaque && series.length === 1 ? COR.aForte : series[k].cor, ultimo); });
      }
      s += '<text x="' + cx + '" y="' + (H - 7) + '" text-anchor="middle" class="gd-eixo' + (it.destaque ? " forte" : "") + '">' + esc(it.rot) + '</text>' +
        '<rect class="gd-alvo" data-i="' + i + '" x="' + (padE + banda * i) + '" y="0" width="' + banda + '" height="' + (H - padB) + '" fill="transparent"/>';
    });
    s += '<line class="gd-sel" x1="0" x2="0" y1="' + padT + '" y2="' + (H - padB) + '" stroke="' + COR.base + '" stroke-width="1" opacity="0"/></svg>';
    host.innerHTML = '<div class="gd-leitura" aria-live="polite"></div>' + s + (series.length > 1 ? legenda(series) : "");
    const leitura = host.querySelector(".gd-leitura"), sel = host.querySelector(".gd-sel");
    const mostra = (i) => { const it = itens[i]; if(!it) return; leitura.innerHTML = cfg.ler(it);
      const cx = padE + banda * i + banda / 2; sel.setAttribute("x1", cx); sel.setAttribute("x2", cx); sel.setAttribute("opacity", "1");
      host.querySelectorAll(".gd-alvo").forEach((r) => r.classList.toggle("on", r.dataset.i == i)); };
    const svg = host.querySelector("svg");
    const pelo = (e) => { const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * W; return Math.max(0, Math.min(itens.length - 1, Math.floor((x - padE) / banda))); };
    svg.addEventListener("pointerdown", (e) => { mostra(pelo(e)); svg.setPointerCapture?.(e.pointerId); });
    svg.addEventListener("pointermove", (e) => { if(e.buttons || e.pointerType === "touch") mostra(pelo(e)); });
    const ini = itens.findIndex((it) => it.destaque); mostra(ini >= 0 ? ini : itens.length - 1);
  }
  function barra(x, y, w, h, cor, arredonda){
    if(h <= 0) return "";
    const r = arredonda ? Math.min(4, h, w / 2) : 0;
    return '<path d="M' + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + 'Z" fill="' + cor + '"/>';
  }
  function escalaPasso(max){ const bruto = max / 3, mag = Math.pow(10, Math.floor(Math.log10(bruto))), n = bruto / mag; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag; }
  function legenda(series){ return '<div class="gd-legenda">' + series.map((s) => '<span><i style="background:' + s.cor + '"></i>' + esc(s.nome) + '</span>').join("") + '</div>'; }

  // Linha com área clara e dedo que percorre o gráfico (saldo previsto).
  function linha(host, cfg){
    const p = cfg.pontos || [], W = Math.max(260, host.clientWidth), H = 170, padE = 44, padB = 24, padT = 10;
    if(!p.length){ host.innerHTML = vazio("Sem dados."); return; }
    const vs = p.map((q) => num(q.v)), lo = Math.min(...vs), hi = Math.max(...vs), folga = Math.max((hi - lo) * 0.2, Math.abs(hi) * 0.03, 1);
    const minV = lo < 0 ? Math.min(0, lo - folga) : Math.max(0, lo - folga), maxV = hi + folga;
    const passo = escalaPasso(maxV - minV), base = Math.floor(minV / passo) * passo, topo = Math.ceil(maxV / passo) * passo || passo;
    const ph = H - padB - padT, pw = W - padE - 8;
    const x = (i) => padE + (p.length === 1 ? pw / 2 : i / (p.length - 1) * pw), y = (v) => padT + ph - (v - base) / (topo - base) * ph;
    let s = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="' + H + '" role="img" aria-label="' + esc(cfg.titulo || "") + '">';
    for(let t = base; t <= topo + 1e-9; t += passo){ const yy = y(t); s += '<line x1="' + padE + '" x2="' + (W - 4) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + (Math.abs(t) < 1e-9 ? (minV < 0 ? COR.ruim : COR.base) : COR.grade) + '" stroke-width="1"/>' +
      '<text x="' + (padE - 6) + '" y="' + (yy + 4) + '" text-anchor="end" class="gd-eixo">' + esc(compacto(t)) + '</text>'; }
    const caminho = p.map((q, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(num(q.v)).toFixed(1)).join("");
    s += '<path d="' + caminho + "L" + x(p.length - 1) + "," + y(base) + "L" + x(0) + "," + y(base) + 'Z" fill="' + COR.aWash + '"/>' +
      '<path d="' + caminho + '" fill="none" stroke="' + COR.a + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    [0, Math.floor((p.length - 1) / 2), p.length - 1].forEach((i) => { s += '<text x="' + x(i) + '" y="' + (H - 7) + '" text-anchor="' + (i === 0 ? "start" : i === p.length - 1 ? "end" : "middle") + '" class="gd-eixo">' + esc(p[i].rot) + '</text>'; });
    const iMin = vs.indexOf(Math.min(...vs));
    s += '<circle cx="' + x(iMin) + '" cy="' + y(vs[iMin]) + '" r="4" fill="' + (vs[iMin] < 0 ? COR.ruim : COR.a) + '" stroke="#fff" stroke-width="2"/>' +
      '<line class="gd-sel" y1="' + padT + '" y2="' + (H - padB) + '" stroke="' + COR.base + '" stroke-width="1"/><circle class="gd-ponto" r="5" fill="' + COR.a + '" stroke="#fff" stroke-width="2"/></svg>';
    host.innerHTML = '<div class="gd-leitura" aria-live="polite"></div>' + s;
    const leitura = host.querySelector(".gd-leitura"), sel = host.querySelector(".gd-sel"), ponto = host.querySelector(".gd-ponto"), svg = host.querySelector("svg");
    const mostra = (i) => { const q = p[i]; leitura.innerHTML = cfg.ler(q); sel.setAttribute("x1", x(i)); sel.setAttribute("x2", x(i)); ponto.setAttribute("cx", x(i)); ponto.setAttribute("cy", y(num(q.v))); ponto.setAttribute("fill", num(q.v) < 0 ? COR.ruim : COR.a); };
    const pelo = (e) => { const r = svg.getBoundingClientRect(); const xx = (e.clientX - r.left) / r.width * W; return Math.max(0, Math.min(p.length - 1, Math.round((xx - padE) / pw * (p.length - 1)))); };
    svg.addEventListener("pointerdown", (e) => { mostra(pelo(e)); svg.setPointerCapture?.(e.pointerId); });
    svg.addEventListener("pointermove", (e) => { if(e.buttons || e.pointerType === "touch") mostra(pelo(e)); });
    mostra(cfg.inicio != null ? cfg.inicio : p.length - 1);
  }

  // Ranking: barras horizontais finas em HTML (nome em cima, valor à direita).
  function ranking(itens, formato, cor){
    if(!itens.length) return vazio("Nada no período.");
    const max = Math.max(...itens.map((i) => num(i.v)), 1);
    return '<ol class="gd-rank">' + itens.map((i) => '<li><div class="gd-rank-topo"><span>' + esc(i.nome) + (i.sub ? ' <small>' + esc(i.sub) + '</small>' : "") + '</span><b>' + formato(i.v) + '</b></div>' +
      '<div class="gd-rank-trilho"><i style="width:' + Math.max(2, num(i.v) / max * 100) + '%;background:' + (cor || COR.a) + '"></i></div></li>').join("") + '</ol>';
  }
  // Barra segmentada (parte de um todo) + legenda com os números.
  function segmentada(partes, formato){
    const tot = partes.reduce((s, p) => s + num(p.v), 0);
    if(!tot) return vazio("Nada no período.");
    return '<div class="gd-seg" role="img" aria-label="' + esc(partes.map((p) => p.nome + " " + formato(p.v)).join(", ")) + '">' + partes.filter((p) => num(p.v) > 0).map((p) => { const w = num(p.v) / tot * 100;
      return '<span style="width:' + w + '%;background:' + p.cor + ';color:' + (p.cor === COR.d ? "#0b0b0b" : "#fff") + '">' + (w >= 14 ? Math.round(w) + "%" : "") + '</span>'; }).join("") + '</div>' +
      '<ul class="gd-seg-legenda">' + partes.map((p) => '<li><i style="background:' + p.cor + '"></i><span>' + esc(p.nome) + '</span><b>' + formato(p.v) + '</b><small>' + (tot ? Math.round(num(p.v) / tot * 100) : 0) + '%</small></li>').join("") + '</ul>';
  }
  function medidor(valor, rotulo, cor){
    return '<div class="gd-medidor"><div class="gd-medidor-topo"><b>' + pct(valor) + '</b><span>' + esc(rotulo) + '</span></div><div class="gd-medidor-trilho"><i style="width:' + Math.max(0, Math.min(100, valor)) + '%;background:' + cor + '"></i></div></div>';
  }

  /* ---------- dados ---------- */
  async function todas(q){ const out = []; for(let de = 0; ; de += 1000){ const { data, error } = await q().range(de, de + 999); if(error) throw error; out.push(...(data || [])); if(!data || data.length < 1000) break; } return out; }

  async function carregarComercial(){
    const { sb, empresa } = ST.ctx, desde = iso(somaMes(hoje(), -24));
    const [pedidos, pv] = await Promise.all([
      todas(() => sb.from("separacoes_pedidos").select("id,numero_pedido,status_comercial,valor_total,data_evento,criado_em,cliente_nome,canc:observacoes->cancelamento,t1:observacoes->>teste_cronograma,t2:observacoes->>teste_ia")
        .eq("empresa_id", empresa).or("data_evento.gte." + desde + ",criado_em.gte." + desde)),
      sb.from("posvenda_contatos").select("status,atencao,concluido_em").eq("empresa_id", empresa).gte("created_at", desde).then((r) => r.data || []).catch(() => []),
    ]);
    return { pedidos: pedidos.filter((p) => p.t1 !== "true" && p.t2 !== "true"), pv };
  }
  async function carregarFinanceiro(){
    const { sb, empresa } = ST.ctx, h = hoje(), ini12 = somaMes(h, -11);
    const [saldos, contas, receber, pagar, fluxoFut, fluxoPas, dre] = await Promise.all([
      sb.rpc("fin_saldos", { p_empresa: empresa }).then((r) => r.data || []),
      sb.from("fin_contas").select("id,nome,ativo").eq("empresa_id", empresa).then((r) => r.data || []),
      todas(() => sb.from("fin_receber").select("aberto,vencimento,programado_para,componente,status").eq("empresa_id", empresa).neq("status", "cancelado").gt("aberto", 0)),
      todas(() => sb.from("fin_pagar").select("aberto,vencimento,programado_para,status").eq("empresa_id", empresa).neq("status", "cancelado").gt("aberto", 0)),
      sb.rpc("fin_fluxo", { p_empresa: empresa, p_ini: iso(h), p_fim: iso(new Date(h.getTime() + 30 * 864e5)), p_conta: null }).then((r) => r.data || []),
      sb.rpc("fin_fluxo", { p_empresa: empresa, p_ini: iso(ini12), p_fim: iso(h), p_conta: null }).then((r) => r.data || []),
      sb.rpc("fin_dre_centros", { p_empresa: empresa, p_ini: iso(ini12), p_fim: iso(new Date(h.getFullYear(), h.getMonth() + 1, 0)) }).then((r) => r.data || []).catch(() => []),
    ]);
    return { saldos, contas, receber, pagar, fluxoFut, fluxoPas, dre };
  }

  /* ---------- telas ---------- */
  function pintarComercial(host){
    const { pedidos, pv } = ST.dados.comercial, P = periodo(ST.periodo);
    const fechado = (p) => ["aprovado", "finalizado", "enviado"].includes(p.status_comercial);
    const evt = (p) => dataLocal(p.data_evento), cri = (p) => dataLocal(p.criado_em);
    const fech = pedidos.filter((p) => fechado(p) && dentro(evt(p), P.ini, P.fim)), fechAnt = pedidos.filter((p) => fechado(p) && dentro(evt(p), P.iniAnt, P.fimAnt));
    const fat = fech.reduce((s, p) => s + num(p.valor_total), 0), fatAnt = fechAnt.reduce((s, p) => s + num(p.valor_total), 0);
    const criados = pedidos.filter((p) => dentro(cri(p), P.ini, P.fim));
    const conv = criados.length ? criados.filter(fechado).length / criados.length * 100 : 0;
    const dataCanc = (p) => dataLocal(p.canc && p.canc.data) || cri(p);
    const canc = pedidos.filter((p) => p.status_comercial === "cancelado" && dentro(dataCanc(p), P.ini, P.fim));
    const valorCanc = canc.reduce((s, p) => s + num(p.valor_total), 0);
    const ticket = fech.length ? fat / fech.length : 0;

    // faturamento por mês
    const nMeses = P.meses === 12 ? 12 : 6, h = hoje(), meses = [];
    for(let i = nMeses - 1; i >= 0; i--){ const d = somaMes(h, -i); meses.push({ d, rot: MES[d.getMonth()], v: 0, n: 0, destaque: i === 0 }); }
    pedidos.filter(fechado).forEach((p) => { const e = evt(p); if(!e) return; const m = meses.find((x) => chaveMes(x.d) === chaveMes(e)); if(m){ m.v += num(p.valor_total); m.n++; } });

    // agenda das próximas 4 semanas
    const semanas = []; for(let i = 0; i < 4; i++){ const a = new Date(h.getTime() + i * 7 * 864e5), b = new Date(a.getTime() + 6 * 864e5); semanas.push({ a, b, rot: i === 0 ? "esta" : String(a.getDate()).padStart(2, "0") + "/" + String(a.getMonth() + 1).padStart(2, "0"), partes: [0, 0] }); }
    pedidos.forEach((p) => { const e = evt(p); const s = semanas.find((w) => dentro(e, w.a, w.b)); if(!s) return; if(fechado(p)) s.partes[0]++; else if(p.status_comercial === "pre_reserva") s.partes[1]++; });

    // funil, clientes, motivos, pós-venda
    const conta = (st) => criados.filter((p) => st.includes(p.status_comercial)).length;
    const funil = [{ nome: "Reservados", v: conta(["aprovado", "finalizado", "enviado"]), cor: COR.a }, { nome: "Pré-reserva", v: conta(["pre_reserva"]), cor: COR.b },
      { nome: "Orçamento", v: conta(["orcamento"]), cor: COR.c }, { nome: "Cancelados", v: conta(["cancelado"]), cor: COR.d }];
    const porCliente = {}; fech.forEach((p) => { const k = p.cliente_nome || "Sem cliente"; porCliente[k] = porCliente[k] || { nome: k, v: 0, n: 0 }; porCliente[k].v += num(p.valor_total); porCliente[k].n++; });
    const clientes = Object.values(porCliente).sort((a, b) => b.v - a.v).slice(0, 5).map((c) => ({ ...c, sub: c.n + (c.n === 1 ? " evento" : " eventos") }));
    const porMotivo = {}; canc.forEach((p) => { const k = (p.canc && p.canc.motivo) || "Sem motivo"; porMotivo[k] = (porMotivo[k] || 0) + 1; });
    const motivos = Object.entries(porMotivo).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, v]) => ({ nome, v }));
    const ligacoes = pv.filter((c) => c.status === "concluido" && dentro(dataLocal(c.concluido_em), P.ini, P.fim));
    const tudoBem = ligacoes.filter((c) => !c.atencao).length;

    host.innerHTML =
      '<section class="gd-hero"><span>Faturamento de eventos · ' + esc(P.rotulo) + '</span><b>' + brl(fat) + '</b>' + delta(fat, fatAnt, true, P.ant) + '</section>' +
      '<div class="gd-tiles">' +
        tile("Eventos fechados", fech.length.toLocaleString("pt-BR"), fechAnt.length + " no " + esc(P.ant)) +
        tile("Ticket médio", brlC(ticket), "por evento") +
        tile("Conversão", pct(conv), criados.length + " pedidos criados") +
        tile("Cancelados", canc.length.toLocaleString("pt-BR"), valorCanc ? brlC(valorCanc) + " perdidos" : "nenhum valor perdido", canc.length ? "alerta" : "") +
      '</div>' +
      cartao("gdFat", "Faturamento por mês", "Eventos reservados, pela data do evento. Toque numa coluna.", '<div class="gd-graf" data-graf="fat"></div>') +
      cartao("gdAgenda", "Próximas 4 semanas", "Eventos marcados por semana.", '<div class="gd-graf" data-graf="agenda"></div>') +
      cartao("gdFunil", "Pedidos criados no período", criados.length + " pedidos · onde estão hoje", segmentada(funil, (v) => v.toLocaleString("pt-BR"))) +
      cartao("gdClientes", "Quem mais fechou", "Faturamento por cliente no período", ranking(clientes, brlC, COR.a)) +
      cartao("gdMotivos", "Por que cancelaram", canc.length ? canc.length + " cancelamentos no período" : "", ranking(motivos, (v) => v + (v === 1 ? " pedido" : " pedidos"), COR.b)) +
      cartao("gdPv", "Pós-venda", ligacoes.length ? ligacoes.length + " ligações feitas no período" : "",
        ligacoes.length ? medidor(tudoBem / ligacoes.length * 100, "dos clientes sem reclamação", tudoBem / ligacoes.length >= 0.8 ? COR.bom : COR.ruim) +
          '<p class="gd-nota">' + (ligacoes.length - tudoBem) + ' com reclamação · ' + tudoBem + ' tudo bem</p>' : vazio("Nenhuma ligação de pós-venda no período."));
    colunas(host.querySelector('[data-graf="fat"]'), { itens: meses, titulo: "Faturamento por mês", eixo: compacto,
      ler: (m) => '<span>' + esc(Mai(MES_LONGO[m.d.getMonth()])) + ' ' + m.d.getFullYear() + '</span><b>' + brl(m.v) + '</b><small>' + m.n + (m.n === 1 ? " evento" : " eventos") + '</small>' });
    colunas(host.querySelector('[data-graf="agenda"]'), { itens: semanas, titulo: "Próximas 4 semanas", series: [{ nome: "Reservados", cor: COR.a }, { nome: "Pré-reserva", cor: COR.b }], eixo: (t) => String(Math.round(t)),
      ler: (w) => '<span>' + (w.rot === "esta" ? "Esta semana" : "Semana de " + w.rot) + '</span><b>' + (w.partes[0] + w.partes[1]) + ' eventos</b><small>' + w.partes[0] + ' reservados · ' + w.partes[1] + ' pré-reserva</small>' });
  }

  function pintarFinanceiro(host){
    const D = ST.dados.financeiro, P = periodo(ST.periodo), h = hoje(), hISO = iso(h);
    const ativos = new Set(D.contas.filter((c) => c.ativo !== false).map((c) => c.id));
    const saldo = D.saldos.filter((s) => ativos.has(s.conta_id)).reduce((s, x) => s + num(x.saldo), 0);
    const venc = (t) => String(t.programado_para || t.vencimento || "") < hISO;
    const rec = D.receber.reduce((s, t) => s + num(t.aberto), 0), recV = D.receber.filter(venc).reduce((s, t) => s + num(t.aberto), 0);
    const pag = D.pagar.reduce((s, t) => s + num(t.aberto), 0), pagV = D.pagar.filter(venc).reduce((s, t) => s + num(t.aberto), 0);
    const prox30 = D.fluxoFut.length ? num(D.fluxoFut[D.fluxoFut.length - 1].saldo_previsto) : saldo;
    const pontos = D.fluxoFut.map((f) => { const d = dataLocal(f.dia); return { d, rot: String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"), v: num(f.saldo_previsto), e: num(f.previsto_entrada), s: num(f.previsto_saida) }; });
    const minimo = pontos.reduce((m, p) => (p.v < m.v ? p : m), pontos[0] || { v: 0 });

    const nMeses = P.meses === 12 ? 12 : 6, meses = [];
    for(let i = nMeses - 1; i >= 0; i--){ const d = somaMes(h, -i); meses.push({ d, rot: MES[d.getMonth()], partes: [0, 0], destaque: i === 0 }); }
    D.fluxoPas.forEach((f) => { const d = dataLocal(f.dia); const m = d && meses.find((x) => chaveMes(x.d) === chaveMes(d)); if(m){ m.partes[0] += num(f.realizado_entrada); m.partes[1] += num(f.realizado_saida); } });

    const naoPer = (r) => { const d = dataLocal(r.dia); return !dentro(d, P.ini, P.fim); };
    const noPer = D.fluxoPas.filter((r) => !naoPer(r));
    const entPer = noPer.reduce((s, r) => s + num(r.realizado_entrada), 0), saiPer = noPer.reduce((s, r) => s + num(r.realizado_saida), 0);
    const antPer = D.fluxoPas.filter((r) => dentro(dataLocal(r.dia), P.iniAnt, P.fimAnt));
    const resAnt = antPer.reduce((s, r) => s + num(r.realizado_entrada) - num(r.realizado_saida), 0);

    const cats = {};
    D.dre.filter((r) => r.tipo === "saida").forEach((r) => { const k = r.categoria || "Sem categoria"; cats[k] = (cats[k] || 0) + num(r.realizado || r.previsto); });
    const catLista = Object.entries(cats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const top = catLista.slice(0, 5).map(([nome, v]) => ({ nome, v })), resto = catLista.slice(5).reduce((s, [, v]) => s + v, 0);
    if(resto) top.push({ nome: "Outras", v: resto });

    const comp = { locacao: 0, frete: 0, montagem: 0 }; D.receber.forEach((t) => { if(comp[t.componente] != null) comp[t.componente] += num(t.aberto); });

    host.innerHTML =
      '<section class="gd-hero"><span>Saldo nas contas hoje</span><b' + (saldo < 0 ? ' class="neg"' : "") + '>' + brl(saldo) + '</b><em class="gd-delta">Em 30 dias, previsto: ' + brlC(prox30) + '</em></section>' +
      '<div class="gd-tiles">' +
        tile("A receber", brlC(rec), recV ? '<span class="gd-alerta">' + brlC(recV) + ' vencido</span>' : "nada vencido", recV ? "alerta" : "") +
        tile("A pagar", brlC(pag), pagV ? '<span class="gd-alerta">' + brlC(pagV) + ' vencido</span>' : "nada vencido", pagV ? "alerta" : "") +
        tile("Entrou nas contas", brlC(entPer), esc(Mai(P.rotulo))) +
        tile("Entrou − saiu", brlC(entPer - saiPer), esc(Mai(P.rotulo)) + "<br>" + delta(entPer - saiPer, resAnt, true, P.ant), entPer - saiPer < 0 ? "alerta" : "") +
      '</div>' +
      cartao("gdSaldo", "Saldo previsto · próximos 30 dias", minimo && minimo.v < 0 ? '<span class="gd-alerta">Fica negativo em ' + esc(minimo.rot) + ' (' + brlC(minimo.v) + ')</span>' : "Arraste o dedo pelo gráfico.", '<div class="gd-graf" data-graf="saldo"></div>') +
      cartao("gdES", "Entrou e saiu por mês", "Movimento real das contas.", '<div class="gd-graf" data-graf="es"></div>') +
      cartao("gdRec", "A receber por divisão", "Em aberto, de todos os pedidos", segmentada([{ nome: "Locação", v: comp.locacao, cor: COR.a }, { nome: "Frete", v: comp.frete, cor: COR.b }, { nome: "Montagem", v: comp.montagem, cor: COR.c }], brlC)) +
      cartao("gdCat", "Onde está o gasto", "Despesas por categoria nos últimos 12 meses", ranking(top, brlC, COR.b));
    linha(host.querySelector('[data-graf="saldo"]'), { pontos, titulo: "Saldo previsto", inicio: pontos.indexOf(minimo),
      ler: (p) => '<span>' + esc(p.rot) + '</span><b' + (p.v < 0 ? ' class="neg"' : "") + '>' + brl(p.v) + '</b><small>entra ' + brlC(p.e) + ' · sai ' + brlC(p.s) + '</small>' });
    colunas(host.querySelector('[data-graf="es"]'), { itens: meses, lado: true, titulo: "Entrou e saiu por mês", series: [{ nome: "Entrou", cor: COR.a }, { nome: "Saiu", cor: COR.b }], eixo: compacto,
      ler: (m) => { const r = m.partes[0] - m.partes[1]; return '<span>' + esc(Mai(MES_LONGO[m.d.getMonth()])) + ' ' + m.d.getFullYear() + '</span><b>' + brlC(m.partes[0]) + ' <i>entrou</i> · ' + brlC(m.partes[1]) + ' <i>saiu</i></b><small class="' + (r < 0 ? "neg" : "pos") + '">' + (r < 0 ? "▼ " : "▲ ") + brlC(Math.abs(r)) + (r < 0 ? " a menos" : " a mais") + '</small>'; } });
  }

  /* ---------- casca ---------- */
  function casca(){
    const { host, comercial, financeiro } = ST.ctx;
    if(!comercial && !financeiro){ host.innerHTML = '<p class="ap-vazio">Seu usuário não tem acesso aos números gerenciais. Fale com o administrador.</p>'; return; }
    if(!comercial) ST.aba = "financeiro"; if(!financeiro) ST.aba = "comercial";
    host.innerHTML =
      '<div class="gd-topo">' + (comercial && financeiro ? '<div class="gd-abas" role="tablist">' +
        '<button type="button" role="tab" data-gd-aba="comercial">Comercial</button><button type="button" role="tab" data-gd-aba="financeiro">Financeiro</button></div>' : "") +
        '<div class="gd-periodos">' + [["mes", "Este mês"], ["3m", "3 meses"], ["12m", "12 meses"]].map(([k, t]) => '<button type="button" data-gd-per="' + k + '">' + t + '</button>').join("") + '</div></div>' +
      '<div class="gd-corpo" id="gdCorpo"></div><p class="gd-atualizado" id="gdAtualizado"></p>';
    host.querySelectorAll("[data-gd-aba]").forEach((b) => b.addEventListener("click", () => { ST.aba = b.dataset.gdAba; marcar(); pintar(); }));
    host.querySelectorAll("[data-gd-per]").forEach((b) => b.addEventListener("click", () => { ST.periodo = b.dataset.gdPer; try{ localStorage.setItem("gd_periodo", ST.periodo); }catch(e){} marcar(); pintar(); }));
    const cab = document.querySelector('.ap-barra, .gd-cabeca'); const topo = host.querySelector('.gd-topo'); if(cab && topo) topo.style.top = cab.offsetHeight + 'px';
    marcar();
  }
  function marcar(){
    ST.ctx.host.querySelectorAll("[data-gd-aba]").forEach((b) => { const on = b.dataset.gdAba === ST.aba; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    ST.ctx.host.querySelectorAll("[data-gd-per]").forEach((b) => b.classList.toggle("on", b.dataset.gdPer === ST.periodo));
  }
  function esqueleto(){ return '<div class="gd-esq gd-esq-hero"></div><div class="gd-tiles"><div class="gd-esq"></div><div class="gd-esq"></div><div class="gd-esq"></div><div class="gd-esq"></div></div><div class="gd-esq gd-esq-graf"></div><div class="gd-esq gd-esq-graf"></div>'; }
  async function pintar(forcar){
    const corpo = document.getElementById("gdCorpo"); if(!corpo) return;
    const aba = ST.aba;
    if(forcar || !ST.dados[aba]){
      corpo.innerHTML = esqueleto();
      try{ ST.dados[aba] = await (ST.carregando[aba] = ST.carregando[aba] || (aba === "comercial" ? carregarComercial() : carregarFinanceiro())); }
      catch(e){ console.error(e); ST.carregando[aba] = null; if(ST.aba === aba) corpo.innerHTML = '<p class="ap-vazio">Não foi possível carregar os números. <button type="button" class="ap-acao" id="gdTentar">Tentar de novo</button></p>'; document.getElementById("gdTentar")?.addEventListener("click", () => pintar(true)); return; }
      ST.carregando[aba] = null;
      const a = document.getElementById("gdAtualizado"); if(a) a.innerHTML = 'Atualizado às ' + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + ' · <button type="button" class="ap-acao" id="gdAtualizar">Atualizar</button>';
      document.getElementById("gdAtualizar")?.addEventListener("click", () => { ST.dados = {}; pintar(true); });
    }
    if(ST.aba !== aba) return;
    corpo.classList.remove("gd-entra"); void corpo.offsetWidth; corpo.classList.add("gd-entra");
    (aba === "comercial" ? pintarComercial : pintarFinanceiro)(corpo);
  }

  window.AppGerencial = {
    preparar(ctx){ const novo = !ST.ctx || ST.ctx.empresa !== ctx.empresa; ST.ctx = ctx; if(novo){ ST.dados = {}; ST.carregando = {}; } try{ ST.periodo = localStorage.getItem("gd_periodo") || "mes"; }catch(e){} ST.montado = false; },
    abrir(){ if(!ST.ctx) return; if(!ST.montado){ casca(); ST.montado = true; } pintar(); },
    atualizar(){ if(!ST.montado) return; ST.dados = {}; ST.carregando = {}; pintar(true); },
  };
  let largura = window.innerWidth;
  window.addEventListener("resize", () => { if(Math.abs(window.innerWidth - largura) > 40 && ST.montado && document.getElementById("gdCorpo")?.offsetParent){ largura = window.innerWidth; pintar(); } });
})();
