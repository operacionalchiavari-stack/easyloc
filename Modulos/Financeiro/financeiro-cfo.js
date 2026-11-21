/* =====================================================
   PAINEL DO CFO (2026-11-12) — página própria painel-cfo.html, aberta em NOVA ABA pelo Financeiro → Gerencial → "Painel do CFO".
   Fundo preto; texto branco, verde = bom, vermelho = problema.

   REGRA DO PAINEL (pedido do usuário): ele é só um RESUMO dos dados que o sistema já tem. Nada inventado, nenhuma nota ou peso
   escolhido por nós. Todo número é clicável e abre a "prova": a conta feita com os valores, de qual tela do sistema vieram e a
   lista dos lançamentos que somam aquele valor. O que é PREVISÃO (contas fixas cadastradas no Plano de contas e pedidos ainda a
   faturar, de fin_previsoes) aparece separado e marcado — nunca misturado com o que está lançado.

   Fontes (somente leitura): fin_contas + fin_saldos (dinheiro nas contas), fin_receber / fin_pagar (títulos em aberto),
   fin_movimentos (entrou/saiu nos bancos, sem transferências entre contas), previsões = fin_contas_fixas_previstas (contas fixas)
   + fin_recebimentos_previstos (pré-reservas e orçamentos), lucro = fin_resultado_eventos + fin_custos_evento (a mesma conta do
   "Lucro por evento" da aba Gerencial).
   Trazido da Tecnoweld (que copiou o Financeiro deste sistema) em nov/2026, adaptado aos dados da Chiavari.
===================================================== */
(function () {
  "use strict";
  const P = { S: null, X: null, K: null, provas: new Map() };
  let timer = null, relogio = null;
  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const MESES_L = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const n = (v) => Number(v) || 0;
  const r2 = (v) => Math.round(n(v) * 100) / 100;
  const hoje = () => new Date().toLocaleDateString("sv-SE");
  const somaDias = (d, k) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + k); return x.toLocaleDateString("sv-SE"); };
  const difDias = (a, b) => Math.round((Date.parse(a + "T12:00:00") - Date.parse(b + "T12:00:00")) / 86400000);
  const ddmm = (d) => String(d).slice(8, 10) + "/" + String(d).slice(5, 7);
  const dataBr = (d) => (d ? String(d).slice(8, 10) + "/" + String(d).slice(5, 7) + "/" + String(d).slice(0, 4) : "–");
  const brl = (v) => n(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  // número curto dos quadros (a prova mostra o valor exato)
  const curto = (v) => {
    const a = Math.abs(n(v)), s = n(v) < -0.005 ? "−" : "";
    if (a >= 1e6) return s + "R$ " + (a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " mi";
    if (a >= 1e4) return s + "R$ " + (a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
    return s + "R$ " + a.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  };
  const pctTxt = (p) => (p == null || !isFinite(p) ? "–" : p.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%");
  const tom = (v) => (n(v) < -0.005 ? "neg" : n(v) > 0.005 ? "pos" : "");
  const aberto = (t) => !["recebido", "pago", "cancelado"].includes(t.status) && n(t.aberto) > 0.005;
  const diaT = (t) => String(t.programado_para || t.vencimento || "").slice(0, 10); // mesma data do Fluxo de caixa
  const soma = (l, f = (t) => n(t.aberto)) => r2(l.reduce((s, t) => s + f(t), 0));

  // ---------------------------------------------------------------- leitura
  async function todos(tabela, colunas, ajustar) {
    const out = [];
    for (let de = 0; ; de += 1000) {
      let q = P.S.sb.from(tabela).select(colunas).eq("empresa_id", P.S.emp).range(de, de + 999);
      if (ajustar) q = ajustar(q);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  async function rpc(nome, args) { const { data, error } = await P.S.sb.rpc(nome, args); if (error) throw new Error(error.message); return data; }

  async function carregar() {
    const S = P.S, h = hoje();
    const ini12 = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11); return d.toLocaleDateString("sv-SE"); })();
    const falhas = [];
    const seguro = (nome, p, vazio) => p.then((x) => x, (e) => { console.warn("Painel do CFO:", nome, e); falhas.push(nome); return vazio; });
    const fim90 = somaDias(h, 90);
    const [contas, saldos, receber, pagar, movs, fixas, previstos, eventos, cats, empresa] = await Promise.all([
      todos("fin_contas", "id,nome,banco,ativo,saldo_minimo"),
      rpc("fin_saldos", { p_empresa: S.emp }),
      todos("fin_receber", "*"),
      todos("fin_pagar", "*"),
      seguro("movimentos dos bancos", todos("fin_movimentos", "id,direcao,data,valor,descricao,conta_id,transferencia_grupo,cancelado_em", (q) => q.gte("data", ini12).lte("data", h).is("transferencia_grupo", null).is("cancelado_em", null).order("data")), []),
      seguro("contas fixas previstas", rpc("fin_contas_fixas_previstas", { p_empresa: S.emp, p_ini: h, p_fim: fim90 }), []),
      seguro("recebimentos previstos", rpc("fin_recebimentos_previstos", { p_empresa: S.emp }), []),
      seguro("lucro dos eventos", carregarEventos(ini12, h), []),
      seguro("plano de contas", todos("fin_categorias", "*"), []),
      seguro("empresa", S.sb.from("empresas").select("logo_url,nome,razao_social").eq("id", S.emp).maybeSingle().then((r) => r.data || {}), {})
    ]);
    S.contas = contas; S.receber = receber; S.pagar = pagar; S.cats = cats || []; S.empresa = empresa || {};
    S.cnpjs = [{ is_principal: true, nome_fantasia: S.empresa.nome || S.empresa.razao_social || "" }];
    S.saldos = {}; (saldos || []).forEach((s) => { S.saldos[s.conta_id] = n(s.saldo); });
    // Previsões no mesmo formato da Tecnoweld (fin_previsoes): contas fixas saem, pré-reservas e orçamentos entram.
    const prev = (fixas || []).map((f) => ({ tipo: "fixa", direcao: "saida", dia: f.dia, valor: f.valor, titulo: f.titulo, detalhe: f.detalhe }))
      .concat((previstos || []).filter((p) => p.dia && String(p.dia).slice(0, 10) >= h && String(p.dia).slice(0, 10) <= fim90)
        .map((p) => ({ tipo: "pedido", direcao: "entrada", dia: p.dia, valor: p.valor, titulo: "Pedido " + (p.pedido_numero || "") + " · " + (p.cliente_nome || ""), detalhe: (p.situacao === "pre_reserva" ? "pré-reserva" : "orçamento") + (p.componente ? " · " + p.componente : "") })));
    P.X = { movs: movs || [], prev, margem: eventos || [], incluirVencidos: true, falhas };
  }

  // Lucro por evento (a mesma conta do Gerencial): receita = valor do pedido − créditos + reposição; custo = custos lançados no evento.
  // Entram os eventos dos últimos 12 meses; "apuração completa" = custos marcados como revisados.
  const CUSTO_EV = { equipe: "equipe", frete: "frete", uber: "Uber", terceiros: "terceiros", personalizacao: "personalização", reparo: "reparo", impostos: "impostos", outros: "outros" };
  async function carregarEventos(ini, fim) {
    const r = await rpc("fin_resultado_eventos", { p_empresa: P.S.emp, p_inicio: ini, p_fim: fim });
    const evs = (r && r.eventos) || [], ids = evs.map((e) => e.id), custos = [];
    for (let k = 0; k < ids.length; k += 100) {
      const { data, error } = await P.S.sb.from("fin_custos_evento").select("pedido_id,categoria,valor,cancelado_em").eq("empresa_id", P.S.emp).in("pedido_id", ids.slice(k, k + 100));
      if (error) throw error;
      custos.push(...(data || []).filter((c) => !c.cancelado_em));
    }
    return evs.map((e) => {
      const porCat = {}; custos.filter((c) => c.pedido_id === e.id).forEach((c) => { porCat[c.categoria] = (porCat[c.categoria] || 0) + n(c.valor); });
      const preco = n(e.valor_total) - n(e.credito) + n(e.reposicao), custo = Object.values(porCat).reduce((a, b) => a + b, 0);
      return { pedido: "Pedido " + (e.numero_pedido || ""), cliente: e.cliente_nome || "", preco: r2(preco), custo_real: r2(custo), porCat, apuracao: e.custos_revisados ? "completa" : "parcial" };
    });
  }

  // ---------------------------------------------------------------- cálculo (tudo a partir das listas acima)
  function calcular() {
    const S = P.S, X = P.X, h = hoje();
    const contas = S.contas.filter((c) => c.ativo !== false).map((c) => ({ ...c, saldo: r2(S.saldos[c.id]) }));
    const caixa = soma(contas, (c) => c.saldo), minimo = soma(contas, (c) => n(c.saldo_minimo));
    const rec = S.receber.filter(aberto), pag = S.pagar.filter(aberto);
    const recAb = soma(rec), pagAb = soma(pag);
    const recVenc = rec.filter((t) => diaT(t) < h), pagVenc = pag.filter((t) => diaT(t) < h);
    const recVencV = soma(recVenc), pagVencV = soma(pagVenc);

    // entrou / saiu nos bancos por mês
    const meses = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); meses.push({ k: d.toLocaleDateString("sv-SE").slice(0, 7), rot: MESES[d.getMonth()] + "/" + String(d.getFullYear()).slice(2), nome: MESES_L[d.getMonth()] + " de " + d.getFullYear(), ent: 0, sai: 0, movs: [] }); }
    const porMes = new Map(meses.map((m) => [m.k, m]));
    X.movs.forEach((m) => { const x = porMes.get(String(m.data).slice(0, 7)); if (!x) return; x.movs.push(m); if (m.direcao === "entrada") x.ent += n(m.valor); else x.sai += n(m.valor); });
    meses.forEach((m) => { m.ent = r2(m.ent); m.sai = r2(m.sai); m.res = r2(m.ent - m.sai); });
    const temMovs = X.movs.length > 0;
    const fechados = meses.slice(8, 11);
    const saida3 = r2(fechados.reduce((s, m) => s + m.sai, 0)), saidaMedia = r2(saida3 / 3);
    const folego = saidaMedia > 0.005 ? caixa / saidaMedia : null;

    // projeção 90 dias: a mesma regra do Fluxo de caixa, feita aqui para poder mostrar cada lançamento de cada dia
    const prevItens = X.prev.filter((p) => p.dia && String(p.dia).slice(0, 10) >= h).map((p) => ({ ...p, dia: String(p.dia).slice(0, 10), sinal: p.direcao === "entrada" ? 1 : -1 }));
    const proj = [];
    let sL = caixa, sP = caixa;
    for (let i = 0; i <= 90; i++) {
      const d = somaDias(h, i);
      const ent = rec.filter((t) => diaT(t) === d), sai = pag.filter((t) => diaT(t) === d);
      const entV = i === 0 && X.incluirVencidos ? recVenc : [], saiV = i === 0 && X.incluirVencidos ? pagVenc : [];
      const pv = prevItens.filter((p) => p.dia === d);
      const iniL = sL, iniP = sP;
      const mov = soma(ent) + soma(entV) - soma(sai) - soma(saiV);
      sL = r2(sL + mov);
      sP = r2(sP + mov + soma(pv, (p) => p.sinal * n(p.valor)));
      proj.push({ d, iniL, iniP, ent, sai, entV, saiV, pv, l: sL, p: sP });
    }
    const pior = proj.reduce((a, p) => (!a || p.l < a.l ? p : a), null);
    const prevFixas = prevItens.filter((p) => p.tipo === "fixa"), prevFat = prevItens.filter((p) => p.tipo !== "fixa");

    // idade dos recebíveis (pelo vencimento)
    const faixas = [["A vencer", (d) => d >= 0], ["Vencido 1 a 30 dias", (d) => d < 0 && d >= -30], ["Vencido 31 a 60 dias", (d) => d < -30 && d >= -60], ["Vencido 61 a 90 dias", (d) => d < -60 && d >= -90], ["Vencido há mais de 90 dias", (d) => d < -90]]
      .map(([rot, f], i) => { const l = rec.filter((t) => f(difDias(diaT(t), h))); return { rot, l, v: soma(l), venc: i > 0 }; });

    const agrupa = (l, nome) => { const m = new Map(); l.forEach((t) => { const k = (nome(t) || "Sem nome").trim(); if (!m.has(k)) m.set(k, []); m.get(k).push(t); }); return [...m.entries()].map(([k, ts]) => ({ nome: k, l: ts, v: soma(ts) })).sort((a, b) => b.v - a.v).slice(0, 5); };
    const topCli = agrupa(rec, (t) => t.cliente_nome || t.descricao), topForn = agrupa(pag, (t) => t.fornecedor_nome || t.descricao);

    // margem: pedidos com todas as OPs concluídas (apuração completa), a mesma conta da aba Margem por pedido
    const comp = X.margem.filter((m) => n(m.preco) > 0 && m.apuracao === "completa");
    const precoT = soma(comp, (m) => n(m.preco)), custoT = soma(comp, (m) => n(m.custo_real)), orcT = 0;
    const margReal = precoT > 0 ? ((precoT - custoT) / precoT) * 100 : null, margOrc = null;
    const margemDe = (m) => (n(m.preco) > 0 ? ((n(m.preco) - n(m.custo_real)) / n(m.preco)) * 100 : null);
    const margemOrcDe = () => null; // a Chiavari não tem custo orçado por evento
    const negativos = comp.filter((m) => n(m.custo_real) > n(m.preco));
    const abaixo = [];

    const urgentes = [];
    const diretoria = pag.filter((t) => t.requer_aprovacao && t.aprovacao === "pendente");
    const lim90 = somaDias(h, -90);
    const semCat = S.receber.concat(S.pagar).filter((t) => t.status !== "cancelado" && String(t.competencia || t.vencimento || "") >= lim90 && String(t.competencia || t.vencimento || "") <= h && !t.categoria_id);

    const pe = pontoEquilibrio(h);
    return { pe, h, contas, caixa, minimo, rec, pag, recAb, pagAb, recVenc, pagVenc, recVencV, pagVencV, meses, temMovs, fechados, saida3, saidaMedia, folego,
      proj, pior, prevItens, prevFixas, prevFat, faixas, topCli, topForn, comp, precoT, custoT, orcT, margReal, margOrc, margemDe, margemOrcDe, negativos, abaixo,
      urgentes, diretoria, semCat, saldoLiq: r2(caixa + recAb - pagAb), atrasoPct: recAb > 0.005 ? (recVencV / recAb) * 100 : null };
  }

  // ---------------------------------------------------------------- ponto de equilíbrio
  // MESMA REGRA da aba Gerencial (financeiro-gerencial.js): mês = competência (senão vencimento), sem cancelados, valor lançado do título;
  // fixo ou variável = a marcação que o Plano de contas mostra (FinanceiroGerencial.naturezaDe). Margem de contribuição = (receita − variáveis) ÷ receita;
  // ponto = custos fixos ÷ margem. Mês em andamento: custos fixos = lançado + o que falta lançar do valor mensal cadastrado nas contas fixas
  // (a mesma conta das previsões do Fluxo de caixa) e margem dos 3 últimos meses fechados (o mês ainda está incompleto).
  const mesDe = (t) => String(t.competencia || t.vencimento || "").slice(0, 7);
  function naturezaDe(c) {
    if (window.FinanceiroGerencial?.naturezaDe) return window.FinanceiroGerencial.naturezaDe(c, P.S.cats);
    return c?.natureza || "fixo";
  }
  function previstoNoMes(c, mes) { // valor cadastrado que vale para o mês (mensal / trimestral / anual)
    // Chiavari: um valor previsto para cada mês (fin_categorias.previsao_meses, janeiro a dezembro)
    const arr = Array.isArray(c.previsao_meses) ? c.previsao_meses : [];
    return n(arr[Number(mes.slice(5, 7)) - 1]);
  }
  const PER = { mensal: "todo mês", trimestral: "a cada 3 meses", anual: "uma vez por ano" };
  const temPrevisao = (c) => (Array.isArray(c.previsao_meses) ? c.previsao_meses : []).some((v) => n(v) > 0);
  function pontoEquilibrio(h) {
    const S = P.S, cats = S.cats || [], porId = new Map(cats.map((c) => [c.id, c]));
    const ok = (t) => t.status !== "cancelado";
    const natT = (t) => naturezaDe(porId.get(t.categoria_id));
    const filhosDe = (id) => { const out = new Set([id]); let mudou = true; while (mudou) { mudou = false; cats.forEach((c) => { if (c.pai_id && out.has(c.pai_id) && !out.has(c.id)) { out.add(c.id); mudou = true; } }); } return out; };
    const mesAtual = h.slice(0, 7);
    const meses = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); meses.push({ k: d.toLocaleDateString("sv-SE").slice(0, 7), rot: MESES[d.getMonth()] + "/" + String(d.getFullYear()).slice(2), nome: MESES_L[d.getMonth()] + " de " + d.getFullYear() }); }
    meses.forEach((m) => {
      m.recL = S.receber.filter((t) => ok(t) && mesDe(t) === m.k); m.rec = soma(m.recL, (t) => n(t.valor));
      const sai = S.pagar.filter((t) => ok(t) && mesDe(t) === m.k);
      m.varL = sai.filter((t) => natT(t) === "variavel"); m.vari = soma(m.varL, (t) => n(t.valor));
      m.fixL = sai.filter((t) => natT(t) !== "variavel"); m.fixLanc = soma(m.fixL, (t) => n(t.valor));
      m.semCatFix = m.fixL.filter((t) => !t.categoria_id).length;
      m.atual = m.k === mesAtual;
      m.prevFalta = [];
      if (m.atual) {
        cats.filter((c) => c.tipo !== "entrada" && previstoNoMes(c, m.k) > 0).forEach((c) => {
          const ids = filhosDe(c.id), prev = previstoNoMes(c, m.k), lanc = soma(sai.filter((t) => ids.has(t.categoria_id)), (t) => n(t.valor));
          if (prev - lanc > 0.005) m.prevFalta.push({ c, prev, lanc, falta: r2(prev - lanc) });
        });
      }
      m.fix = r2(m.fixLanc + soma(m.prevFalta, (x) => x.falta));
      m.mc = m.rec > 0.005 ? (m.rec - m.vari) / m.rec : null;
    });
    const fechados = meses.slice(3, 6), atual = meses[6];
    const rec3 = soma(fechados, (m) => m.rec), var3 = soma(fechados, (m) => m.vari);
    const mcBase = rec3 > 0.005 ? (rec3 - var3) / rec3 : null;
    meses.forEach((m) => {
      const mc = m.atual ? mcBase : m.mc;
      m.mcUsada = mc;
      m.pe = mc != null && mc > 0 ? r2(m.fix / mc) : null;
      m.pct = m.pe ? (m.rec / m.pe) * 100 : null;
    });
    // contas fixas do plano com valor cadastrado ou lançamento no mês
    const fixasPlano = cats.filter((c) => c.tipo !== "entrada" && naturezaDe(c) === "fixo")
      .map((c) => { const ids = filhosDe(c.id); return { c, prevMes: previstoNoMes(c, atual.k), filhosL: atual.fixL.filter((t) => ids.has(t.categoria_id)) }; })
      .map((x) => ({ ...x, lanc: soma(x.filhosL, (t) => n(t.valor)) }))
      .filter((x) => temPrevisao(x.c) || (x.lanc > 0.005 && !x.c.pai_id))
      .sort((a, b) => Math.max(b.prevMes, b.lanc) - Math.max(a.prevMes, a.lanc));
    const fixoSemValor = cats.filter((c) => c.tipo !== "entrada" && c.natureza === "fixo" && !temPrevisao(c));
    return { meses, fechados, atual, rec3, var3, mcBase, fixasPlano, fixoSemValor };
  }

  // ---------------------------------------------------------------- provas: a conta + a lista do que forma cada número
  const linhaTitulo = (t, sinal = 1, extra = "") => ({ d: diaT(t), quem: t.cliente_nome || t.fornecedor_nome || "", desc: (t.descricao || "") + (n(t.parcelas) > 1 ? " · parcela " + t.parcela + "/" + t.parcelas : "") + extra, v: sinal * n(t.aberto) });
  const linhaMov = (m, contas) => ({ d: String(m.data).slice(0, 10), quem: (contas.find((c) => c.id === m.conta_id) || {}).nome || "", desc: m.descricao || "", v: (m.direcao === "entrada" ? 1 : -1) * n(m.valor) });
  const linhaPrev = (p) => ({ d: p.dia, quem: p.tipo === "fixa" ? "Conta fixa" : "Pedido previsto", desc: (p.titulo || "") + (p.detalhe ? " · " + p.detalhe : ""), v: p.sinal * n(p.valor), prev: true });
  const ordemData = (l) => l.slice().sort((a, b) => String(a.d).localeCompare(String(b.d)));
  const B = (v) => "<b>" + esc(brl(v)) + "</b>";

  function montarProvas() {
    const K = P.K, M = P.provas; M.clear();
    const rec = (l, tit) => ({ tit, linhas: ordemData(l.map((t) => linhaTitulo(t))), total: soma(l) });
    const pagS = (l, tit) => ({ tit, linhas: ordemData(l.map((t) => linhaTitulo(t))), total: soma(l) });
    const secContas = { tit: "Saldo de cada conta ativa", linhas: K.contas.map((c) => ({ d: "", quem: c.nome, desc: (c.banco || "") + (n(c.saldo_minimo) ? " · mínimo cadastrado " + brl(c.saldo_minimo) : ""), v: c.saldo })), total: K.caixa };

    M.set("caixa", () => ({ tit: "Dinheiro nas contas", valor: K.caixa,
      formula: "Soma do saldo de cada conta ativa em Bancos = " + B(K.caixa) + ".<br>O saldo de cada conta é o saldo inicial cadastrado mais tudo o que entrou e saiu nela (baixas, conciliações e transferências).",
      fonte: "Financeiro → Bancos e cartões", aba: "bancos", secoes: [secContas] }));
    M.set("receber", () => ({ tit: "A receber em aberto", valor: K.recAb, formula: "Soma do que ainda falta receber de cada parcela que não está recebida nem cancelada = " + B(K.recAb) + ". Desse total, " + B(K.recVencV) + " já passou do vencimento.", fonte: "Financeiro → A receber", aba: "receber", secoes: [rec(K.rec, "Parcelas em aberto")] }));
    M.set("pagar", () => ({ tit: "A pagar em aberto", valor: K.pagAb, formula: "Soma do que ainda falta pagar de cada conta que não está paga nem cancelada = " + B(K.pagAb) + ". Desse total, " + B(K.pagVencV) + " já passou do vencimento.", fonte: "Financeiro → A pagar", aba: "pagar", secoes: [pagS(K.pag, "Contas em aberto")] }));
    M.set("saldoLiq", () => ({ tit: "Saldo se tudo for pago e recebido", valor: K.saldoLiq,
      formula: "Dinheiro nas contas " + B(K.caixa) + " + a receber em aberto " + B(K.recAb) + " − a pagar em aberto " + B(K.pagAb) + " = " + B(K.saldoLiq) + ".<br>É quanto sobraria se todos os clientes pagassem e todas as contas fossem pagas hoje. Não inclui previsões.",
      fonte: "Financeiro → Bancos e cartões, A receber e A pagar", aba: "geral",
      secoes: [secContas, rec(K.rec, "+ A receber em aberto"), { ...pagS(K.pag, "− A pagar em aberto"), linhas: ordemData(K.pag.map((t) => linhaTitulo(t, -1))), total: -K.pagAb }] }));
    M.set("atraso", () => ({ tit: "Atrasado do que há a receber", valor: null,
      formula: "Parcelas vencidas e não recebidas " + B(K.recVencV) + " ÷ total a receber em aberto " + B(K.recAb) + " = <b>" + pctTxt(K.atrasoPct) + "</b>.",
      fonte: "Financeiro → A receber (filtro Vencidos)", aba: "receber", secoes: [rec(K.recVenc, "Parcelas vencidas")] }));
    M.set("pagarVenc", () => ({ tit: "Contas a pagar vencidas", valor: K.pagVencV, formula: "Contas não pagas com vencimento antes de hoje = " + B(K.pagVencV) + ".", fonte: "Financeiro → A pagar (filtro Vencidos)", aba: "pagar", secoes: [pagS(K.pagVenc, "Contas vencidas")] }));
    M.set("folego", () => ({ tit: "Meses que o caixa cobre", valor: null,
      formula: K.folego == null ? "Não dá para calcular: não há saídas registradas nos bancos em " + K.fechados.map((m) => m.nome).join(", ") + ". Este número só aparece quando houver pagamentos baixados ou conciliados em Bancos."
        : "Dinheiro nas contas " + B(K.caixa) + " ÷ média de saídas dos 3 últimos meses fechados (" + B(K.saida3) + " ÷ 3 = " + B(K.saidaMedia) + " por mês) = <b>" + K.folego.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " meses</b>.<br>Considera o que de fato saiu dos bancos; transferências entre contas não contam.",
      fonte: "Financeiro → Bancos e cartões (extrato)", aba: "bancos",
      secoes: [secContas, { tit: "Saídas dos bancos em " + K.fechados.map((m) => m.nome).join(", "), linhas: K.fechados.flatMap((m) => m.movs.filter((x) => x.direcao !== "entrada").map((x) => linhaMov(x, K.contas))), total: -K.saida3 }] }));
    K.meses.forEach((m, i) => M.set("mes:" + i, () => ({ tit: "Entrou e saiu nos bancos em " + m.nome, valor: m.res,
      formula: "Entradas " + B(m.ent) + " − saídas " + B(m.sai) + " = " + B(m.res) + ".<br>Só o que foi baixado ou conciliado nas contas (dinheiro que de fato entrou ou saiu). Transferências entre contas da empresa não contam." + (i === 11 ? " Mês em andamento: até hoje." : ""),
      fonte: "Financeiro → Bancos e cartões (extrato)", aba: "bancos",
      secoes: [{ tit: "Entradas", linhas: m.movs.filter((x) => x.direcao === "entrada").map((x) => linhaMov(x, K.contas)), total: m.ent },
        { tit: "Saídas", linhas: m.movs.filter((x) => x.direcao !== "entrada").map((x) => linhaMov(x, K.contas)), total: -m.sai }] })));
    K.proj.forEach((p, i) => M.set("dia:" + i, () => {
      const dataTxt = i === 0 ? "hoje (" + dataBr(p.d) + ")" : dataBr(p.d);
      const secs = [];
      if (p.entV.length) secs.push({ tit: "+ Parcelas vencidas a receber (o Fluxo de caixa conta no dia de hoje)", linhas: ordemData(p.entV.map((t) => linhaTitulo(t))), total: soma(p.entV) });
      if (p.ent.length) secs.push({ tit: "+ A receber neste dia", linhas: p.ent.map((t) => linhaTitulo(t)), total: soma(p.ent) });
      if (p.saiV.length) secs.push({ tit: "− Contas vencidas a pagar (o Fluxo de caixa conta no dia de hoje)", linhas: ordemData(p.saiV.map((t) => linhaTitulo(t, -1))), total: -soma(p.saiV) });
      if (p.sai.length) secs.push({ tit: "− A pagar neste dia", linhas: p.sai.map((t) => linhaTitulo(t, -1)), total: -soma(p.sai) });
      if (p.pv.length) secs.push({ tit: "PREVISÕES neste dia (não são lançamentos)", linhas: p.pv.map(linhaPrev), total: soma(p.pv, (x) => x.sinal * n(x.valor)), prev: true });
      const mov = r2(p.l - p.iniL);
      return { tit: "Saldo previsto em " + dataTxt, valor: p.l,
        formula: (i === 0 ? "Dinheiro nas contas hoje " : "Saldo do dia anterior ") + B(p.iniL) + (mov >= 0 ? " + " : " − ") + B(Math.abs(mov)) + " (lançamentos deste dia) = " + B(p.l) + " <span class=\"cfo-p-tag\">só lançamentos</span>" +
          (P.K.prevItens.length ? "<br>Com as previsões: " + B(p.iniP) + (r2(p.p - p.iniP) >= 0 ? " + " : " − ") + B(Math.abs(r2(p.p - p.iniP))) + " = " + B(p.p) + " <span class=\"cfo-p-tag prev\">com previsões</span>" : "") +
          (secs.length ? "" : "<br>Nenhum lançamento nem previsão neste dia: o saldo é o mesmo do dia anterior."),
        fonte: "Financeiro → Bancos e cartões (saldo de hoje), A receber e A pagar (pela data de vencimento ou a data programada, as mesmas usadas no Fluxo de caixa)", aba: "geral", secoes: secs };
    }));
    M.set("previsoes", () => ({ tit: "Previsões dos próximos 90 dias", valor: null,
      formula: "Estes valores <b>não são lançamentos</b>. Contas fixas: valor mensal cadastrado em cada categoria do Plano de contas, menos o que já foi lançado na categoria no mês. Pedidos previstos: parcelas dos pedidos em pré-reserva e em orçamento (as mesmas de Recebimentos previstos). Só entram na linha tracejada.",
      fonte: "Financeiro → DRE → Plano de contas (Previsão mensal) e Recebimentos previstos", aba: "previstos",
      secoes: [{ tit: "Contas fixas previstas", linhas: K.prevFixas.map(linhaPrev), total: soma(K.prevFixas, (x) => x.sinal * n(x.valor)), prev: true },
        { tit: "Pedidos previstos (pré-reserva e orçamento)", linhas: K.prevFat.map(linhaPrev), total: soma(K.prevFat, (x) => x.sinal * n(x.valor)), prev: true }] }));
    K.faixas.forEach((f, i) => M.set("faixa:" + i, () => ({ tit: "A receber · " + f.rot, valor: f.v, formula: "Soma do que falta receber das parcelas nesta faixa de vencimento = " + B(f.v) + ".", fonte: "Financeiro → A receber", aba: "receber", secoes: [rec(f.l, "Parcelas")] })));
    K.topCli.forEach((c, i) => M.set("cli:" + i, () => ({ tit: "A receber de " + c.nome, valor: c.v, formula: "Soma das parcelas em aberto deste cliente = " + B(c.v) + " (" + pctTxt(K.recAb ? (c.v / K.recAb) * 100 : null) + " de todo o a receber, " + B(K.recAb) + ").", fonte: "Financeiro → A receber", aba: "receber", secoes: [rec(c.l, "Parcelas em aberto")] })));
    K.topForn.forEach((c, i) => M.set("forn:" + i, () => ({ tit: "A pagar para " + c.nome, valor: c.v, formula: "Soma das contas em aberto deste fornecedor = " + B(c.v) + " (" + pctTxt(K.pagAb ? (c.v / K.pagAb) * 100 : null) + " de todo o a pagar, " + B(K.pagAb) + ").", fonte: "Financeiro → A pagar", aba: "pagar", secoes: [pagS(c.l, "Contas em aberto")] })));
    const linhaPed = (m) => ({ d: m.pedido || "", quem: m.cliente || "", desc: "receita " + brl(m.preco) + " · custos " + brl(m.custo_real) + (Object.keys(m.porCat || {}).length ? " (" + Object.entries(m.porCat).map(([k, v]) => (CUSTO_EV[k] || k) + " " + brl(v)).join(", ") + ")" : "") + " · margem " + pctTxt(K.margemDe(m)), v: r2(n(m.preco) - n(m.custo_real)) });
    const secPed = (l, tit) => ({ tit, linhas: l.map(linhaPed), total: soma(l, (m) => n(m.preco) - n(m.custo_real)) });
    M.set("margem", () => ({ tit: "Margem dos eventos com custos revisados", valor: null,
      formula: K.comp.length ? "Soma das receitas " + B(K.precoT) + " − soma dos custos " + B(K.custoT) + " = " + B(r2(K.precoT - K.custoT)) + " de lucro ÷ " + B(K.precoT) + " = <b>" + pctTxt(K.margReal) + "</b>.<br>Mesma conta do Lucro por evento da aba Gerencial: receita = valor do pedido − créditos dados + cobranças de reposição; custos = os lançados para o evento em Lançar custos dos eventos (fretes e Uber entram sozinhos ao fechar). Só entram eventos dos últimos 12 meses com os custos marcados como revisados."
        : "Nenhum evento dos últimos 12 meses com os custos revisados ainda, então não há margem para mostrar.",
      fonte: "Financeiro → Gerencial → Lucro por evento", aba: "gerencial", secoes: [secPed(K.comp, "Eventos apurados (lucro = receita − custos)")] }));
    M.set("margNeg", () => ({ tit: "Eventos com prejuízo", valor: null, formula: "Eventos com custos revisados em que os custos passaram da receita.", fonte: "Financeiro → Gerencial → Lucro por evento", aba: "gerencial", secoes: [secPed(K.negativos, "Pedidos")] }));
    M.set("margAbaixo", () => ({ tit: "Pedidos com margem real menor que a orçada", valor: null, formula: "Pedidos concluídos com lucro, mas com margem real menor que a margem orçada.", fonte: "Financeiro → Gerencial → Lucro por evento", aba: "gerencial", secoes: [secPed(K.abaixo, "Pedidos")] }));
    K.comp.forEach((m, i) => M.set("ped:" + i, () => ({ tit: "Margem do pedido " + (m.pedido || ""), valor: r2(n(m.preco) - n(m.custo_real)), formula: "Receita " + B(m.preco) + " − custos " + B(m.custo_real) + " = " + B(r2(n(m.preco) - n(m.custo_real))) + " → margem <b>" + pctTxt(K.margemDe(m)) + "</b>.", fonte: "Financeiro → Gerencial → Lucro por evento", aba: "gerencial", secoes: [secPed([m], "Pedido")] })));
    M.set("urgentes", () => ({ tit: "PIX urgentes a pagar", valor: soma(K.urgentes), formula: "Contas marcadas como PIX urgente por Compras e ainda não pagas = " + B(soma(K.urgentes)) + ".", fonte: "Financeiro → A pagar (filtro Urgentes)", aba: "pagar", secoes: [pagS(K.urgentes, "Contas")] }));
    M.set("diretoria", () => ({ tit: "Pagamentos aguardando a diretoria", valor: soma(K.diretoria), formula: "Contas enviadas para aprovação da diretoria e ainda pendentes = " + B(soma(K.diretoria)) + ".", fonte: "Financeiro → A pagar (filtro A aprovar)", aba: "pagar", secoes: [pagS(K.diretoria, "Contas")] }));
    const E = K.pe, nomeCat = (id) => { const c = (P.S.cats || []).find((x) => x.id === id); return c ? (c.codigo ? c.codigo + " " : "") + c.nome : "Sem categoria"; };
    const linhaCat = (t, sinal = 1) => ({ d: String(t.competencia || t.vencimento || "").slice(0, 10), quem: t.cliente_nome || t.fornecedor_nome || "", desc: nomeCat(t.categoria_id) + " · " + (t.descricao || ""), v: sinal * n(t.valor) });
    const secRec = (m) => ({ tit: "Faturamento lançado em " + m.nome + " (A receber, pela competência)", linhas: ordemData(m.recL.map((t) => linhaCat(t))), total: m.rec });
    const secVar = (m) => ({ tit: "Custos VARIÁVEIS lançados em " + m.nome, linhas: ordemData(m.varL.map((t) => linhaCat(t, -1))), total: -m.vari });
    const secFix = (m) => ({ tit: "Custos FIXOS lançados em " + m.nome + (m.semCatFix ? " (inclui " + m.semCatFix + " sem categoria, que o Gerencial conta como fixo)" : ""), linhas: ordemData(m.fixL.map((t) => linhaCat(t, -1))), total: -m.fixLanc });
    const secFalta = (m) => ({ tit: "Valor mensal cadastrado nas contas fixas que ainda não foi lançado neste mês", prev: true, linhas: m.prevFalta.map((x) => ({ d: "", quem: (x.c.codigo ? x.c.codigo + " " : "") + x.c.nome, desc: "cadastrado para o mês " + brl(x.prev) + " − já lançado " + brl(x.lanc), v: -x.falta, prev: true })), total: -soma(m.prevFalta, (x) => x.falta) });
    const mcTxt = (rec, vari) => "(faturamento " + B(rec) + " − custos variáveis " + B(vari) + ") ÷ " + B(rec) + " = <b>" + pctTxt(rec > 0.005 ? ((rec - vari) / rec) * 100 : null) + "</b>";
    const regra = '<br><small class="cfo-p-obs">Mesma regra da aba Gerencial: mês pela competência (ou vencimento), valor lançado, fixo ou variável conforme o Plano de contas.</small>';
    const fechNomes = E.fechados.map((m) => m.nome).join(", ");
    M.set("pe:fixos", () => ({ tit: "Custos fixos de " + E.atual.nome, valor: E.atual.fix,
      formula: "Já lançado em contas fixas " + B(E.atual.fixLanc) + " + valor mensal cadastrado ainda não lançado " + B(soma(E.atual.prevFalta, (x) => x.falta)) + " = " + B(E.atual.fix) + ".<br>Como o mês não acabou, para cada conta fixa com valor mensal cadastrado no Plano de contas entra o que ainda falta lançar (a mesma conta das previsões do Fluxo de caixa)." + regra,
      fonte: "Financeiro → DRE → Plano de contas (Previsão mensal) e A pagar", aba: "plano", secoes: [secFix(E.atual), secFalta(E.atual)] }));
    M.set("pe:mc", () => ({ tit: "Margem de contribuição", valor: null,
      formula: E.mcBase == null ? "Não dá para calcular: não há faturamento lançado em " + fechNomes + "."
        : "De cada R$ 100 faturados, quanto sobra para pagar os custos fixos depois dos custos variáveis (os que crescem com a produção: material, terceirização, impostos sobre a venda, fretes…). Base: os 3 últimos meses fechados (" + fechNomes + "):<br>" + mcTxt(E.rec3, E.var3) + "." + regra,
      fonte: "Financeiro → A receber e A pagar · Plano de contas (fixo ou variável)", aba: "plano",
      secoes: E.fechados.flatMap((m) => [secRec(m), secVar(m)]) }));
    M.set("pe:atual", () => { const m = E.atual, falta = m.pe != null ? r2(m.pe - m.rec) : null;
      return { tit: "Ponto de equilíbrio de " + m.nome, valor: m.pe,
        formula: m.pe == null ? (E.mcBase == null ? "Não dá para calcular: sem faturamento lançado nos 3 últimos meses fechados para medir a margem de contribuição." : "Não dá para calcular: nos 3 últimos meses os custos variáveis foram maiores que o faturamento (margem de contribuição negativa).")
          : "Custos fixos do mês " + B(m.fix) + " ÷ margem de contribuição " + pctTxt(E.mcBase * 100) + " = " + B(m.pe) + " de faturamento necessário para não ter prejuízo.<br>Faturado no mês até agora: " + B(m.rec) + " (" + pctTxt(m.pct) + " do ponto) → " + (falta > 0 ? '<b class="neg">faltam ' + esc(brl(falta)) + "</b>." : '<b class="pos">' + esc(brl(-falta)) + " acima do ponto</b>.") + "<br>Clique em Custos fixos do mês e em Margem de contribuição para ver cada lançamento." + regra,
        fonte: "Financeiro → Gerencial → Painel (ponto de equilíbrio)", aba: "gerencial", secoes: [secRec(m)] }; });
    E.meses.forEach((m, i) => M.set("pe:mes:" + i, () => {
      if (m.atual) return M.get("pe:atual")();
      const falta = m.pe != null ? r2(m.pe - m.rec) : null;
      return { tit: "Ponto de equilíbrio de " + m.nome, valor: m.pe,
        formula: m.pe == null ? (m.rec > 0.005 ? "Custos variáveis maiores que o faturamento neste mês: não existe ponto de equilíbrio possível." : "Sem faturamento lançado neste mês, então não dá para calcular.")
          : "Margem de contribuição do mês: " + mcTxt(m.rec, m.vari) + ".<br>Custos fixos lançados " + B(m.fix) + " ÷ " + pctTxt(m.mcUsada * 100) + " = ponto de equilíbrio " + B(m.pe) + ".<br>Faturado " + B(m.rec) + " → " + (falta > 0 ? '<b class="neg">' + esc(brl(falta)) + " abaixo do ponto</b>." : '<b class="pos">' + esc(brl(-falta)) + " acima do ponto</b>.") + regra,
        fonte: "Financeiro → Gerencial → Painel (ponto de equilíbrio)", aba: "gerencial", secoes: [secRec(m), secVar(m), secFix(m)] }; }));
    E.fixasPlano.forEach((x, i) => M.set("pe:cat:" + i, () => ({ tit: "Conta fixa: " + (x.c.codigo ? x.c.codigo + " " : "") + x.c.nome, valor: null,
      formula: (temPrevisao(x.c) ? "Valor cadastrado no Plano de contas para " + E.atual.nome + ": " + B(x.prevMes) + "." : "Sem valor mensal cadastrado no Plano de contas.") +
        "<br>Lançado em " + E.atual.nome + " nesta conta e nas de dentro dela: " + B(x.lanc) + ".",
      fonte: "Financeiro → DRE → Plano de contas", aba: "plano", secoes: [{ tit: "Lançado em " + E.atual.nome, linhas: ordemData(x.filhosL.map((t) => linhaCat(t, -1))), total: -x.lanc }] })));
    M.set("pe:semvalor", () => ({ tit: "Contas fixas sem valor mensal cadastrado", valor: null, formula: "Estas contas estão marcadas como FIXAS no Plano de contas, mas não têm o valor previsto por mês. Enquanto não tiverem, o ponto de equilíbrio do mês em andamento só conta o que já foi lançado nelas.", fonte: "Financeiro → DRE → Plano de contas (botão Preencher previsão)", aba: "plano",
      secoes: [{ tit: "Contas", linhas: E.fixoSemValor.map((c) => ({ d: c.codigo || "", quem: c.nome, desc: "marcada como fixa, sem valor mensal", v: 0 })), total: null }] }));

    M.set("semcat", () => ({ tit: "Lançamentos sem categoria (últimos 90 dias)", valor: null, formula: K.semCat.length + " lançamento(s) sem categoria do Plano de contas. Enquanto não forem classificados, a DRE fica incompleta.", fonte: "Financeiro → A receber / A pagar", aba: "dre",
      secoes: [{ tit: "Lançamentos", linhas: ordemData(K.semCat.map((t) => ({ d: String(t.competencia || t.vencimento || "").slice(0, 10), quem: t.cliente_nome || t.fornecedor_nome || "", desc: t.descricao || "", v: (P.S.pagar.includes(t) ? -1 : 1) * n(t.valor) }))), total: null }] }));
  }

  // alertas: só fatos que os dados mostram (sem limites escolhidos por nós). crit = vermelho, aten = branco
  function alertas() {
    const K = P.K, A = [], add = (nivel, titulo, detalhe, prova) => A.push({ nivel, titulo, detalhe, prova });
    if (K.caixa < -0.005) add("crit", "Dinheiro nas contas está negativo", brl(K.caixa), "caixa");
    else if (K.minimo > 0 && K.caixa < K.minimo) add("crit", "Dinheiro nas contas abaixo do mínimo cadastrado", brl(K.caixa) + " · mínimo cadastrado nas contas " + brl(K.minimo), "caixa");
    if (K.pior && K.pior.l < -0.005) add("crit", "Saldo previsto fica negativo em " + dataBr(K.pior.d), "Pior saldo dos próximos 90 dias, só com lançamentos: " + brl(K.pior.l), "dia:" + K.proj.indexOf(K.pior));
    else if (K.pior && K.minimo > 0 && K.pior.l < K.minimo) add("aten", "Saldo previsto abaixo do mínimo em " + dataBr(K.pior.d), brl(K.pior.l) + " · mínimo cadastrado " + brl(K.minimo), "dia:" + K.proj.indexOf(K.pior));
    if (K.pagVenc.length) add("crit", K.pagVenc.length + " conta(s) a pagar vencida(s)", brl(K.pagVencV) + " sem pagar depois do vencimento", "pagarVenc");
    if (K.negativos.length) add("crit", K.negativos.length + " evento(s) com prejuízo", K.negativos.map((m) => m.pedido).slice(0, 3).join(", "), "margNeg");
    if (K.recVenc.length) add("aten", K.recVenc.length + " parcela(s) a receber vencida(s)", brl(K.recVencV) + " · " + pctTxt(K.atrasoPct) + " do que há a receber", "atraso");
    if (K.faixas[4].l.length) add("aten", K.faixas[4].l.length + " parcela(s) vencida(s) há mais de 90 dias", brl(K.faixas[4].v), "faixa:4");
    if (K.abaixo.length) add("aten", K.abaixo.length + " pedido(s) com margem real menor que a orçada", K.abaixo.map((m) => m.pedido).slice(0, 3).join(", "), "margAbaixo");
    if (K.temMovs && K.meses[11].res < -0.005) add("aten", "Neste mês saiu mais do que entrou nos bancos", "Até hoje: " + brl(K.meses[11].res), "mes:11");
    if (K.urgentes.length) add("aten", K.urgentes.length + " PIX urgente(s) para pagar", brl(soma(K.urgentes)), "urgentes");
    if (K.diretoria.length) add("aten", K.diretoria.length + " pagamento(s) aguardando a diretoria", brl(soma(K.diretoria)), "diretoria");
    const E = K.pe, ant = E.meses[5];
    if (ant.pe != null && ant.rec < ant.pe) add("crit", "Em " + ant.nome + " o faturamento ficou abaixo do ponto de equilíbrio", "Faturou " + brl(ant.rec) + " · precisava " + brl(ant.pe), "pe:mes:5");
    if (E.atual.pe != null && E.atual.rec < E.atual.pe) add("aten", "Faturamento do mês ainda abaixo do ponto de equilíbrio", "Até agora " + brl(E.atual.rec) + " de " + brl(E.atual.pe) + " · faltam " + brl(E.atual.pe - E.atual.rec), "pe:atual");
    if (E.fixoSemValor.length) add("aten", E.fixoSemValor.length + " conta(s) fixa(s) sem valor mensal cadastrado", "O ponto de equilíbrio do mês fica incompleto", "pe:semvalor");
    if (K.semCat.length) add("aten", K.semCat.length + " lançamento(s) sem categoria nos últimos 90 dias", "A DRE fica incompleta até classificar", "semcat");
    return A;
  }

  // ---------------------------------------------------------------- gráficos (SVG)
  const W = 760;
  function escala(min, max) { if (max === min) { max += 1; min -= 1; } const pad = (max - min) * 0.08; return [min - pad, max + pad]; }
  function graficoMeses(K) {
    if (!K.temMovs) return '<div class="cfo-vazio cfo-vazio-grande">Nenhuma entrada ou saída registrada nos bancos nos últimos 12 meses.<br><small>Este quadro mostra só o dinheiro que de fato entrou ou saiu das contas (baixas e conciliações em Bancos). Ele se preenche sozinho conforme os recebimentos e pagamentos forem baixados.</small></div>';
    const H = 230, M = K.meses, max = Math.max(1, ...M.map((m) => Math.max(m.ent, m.sai)));
    const y = (v) => 12 + ((max * 1.08 - v) * (H - 52)) / (max * 1.08), base = y(0), passo = (W - 64) / 12, bw = Math.min(22, passo / 2 - 4);
    const barra = (v, xx, cls) => { const hh = Math.max(base - y(v), v > 0 ? 2 : 0); if (!hh) return ""; const r = Math.min(4, hh); return '<path d="M' + xx + " " + base + " V" + (base - hh + r) + " Q" + xx + " " + (base - hh) + " " + (xx + r) + " " + (base - hh) + " H" + (xx + bw - r) + " Q" + (xx + bw) + " " + (base - hh) + " " + (xx + bw) + " " + (base - hh + r) + " V" + base + ' Z" class="' + cls + '"/>'; };
    const barras = M.map((m, i) => { const cx = 56 + passo * i + passo / 2;
      return '<g class="cfo-mes" data-i="' + i + '" data-prova="mes:' + i + '"><rect x="' + (cx - passo / 2) + '" y="0" width="' + passo + '" height="' + H + '" class="cfo-hit"/>' + barra(m.ent, cx - bw - 1, "cfo-bar-ent") + barra(m.sai, cx + 1, "cfo-bar-sai") +
        '<text x="' + cx + '" y="' + (H - 26) + '" class="cfo-eixo" text-anchor="middle">' + m.rot + '</text><text x="' + cx + '" y="' + (H - 8) + '" class="cfo-res ' + tom(m.res) + '" text-anchor="middle">' + (Math.abs(m.res) < 0.5 ? "–" : (m.res > 0 ? "+" : "") + esc(curto(m.res).replace("R$ ", ""))) + "</text></g>"; }).join("");
    const grade = [0, 0.5, 1].map((f) => '<line x1="56" x2="' + W + '" y1="' + y(max * f) + '" y2="' + y(max * f) + '" class="cfo-grade"/><text x="50" y="' + (y(max * f) + 4) + '" class="cfo-eixo" text-anchor="end">' + esc(curto(max * f).replace("R$ ", "")) + "</text>").join("");
    return '<div class="cfo-chart" data-chart="meses"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Entradas e saídas nos bancos dos últimos 12 meses"><defs><pattern id="cfoHach" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#e5484d"/><line x1="0" y1="0" x2="0" y2="6" stroke="#7a1d20" stroke-width="2"/></pattern></defs>' + grade + barras + '</svg><div class="cfo-tip" hidden></div></div>';
  }

  function graficoPE(E) {
    const H = 210, M = E.meses, max = Math.max(1, ...M.map((m) => Math.max(m.rec, m.pe || 0)));
    const y = (v) => 14 + ((max * 1.1 - v) * (H - 54)) / (max * 1.1), base = y(0), passo = (W - 64) / M.length, bw = Math.min(46, passo * 0.5);
    const grade = [0, 0.5, 1].map((f) => '<line x1="56" x2="' + W + '" y1="' + y(max * f) + '" y2="' + y(max * f) + '" class="cfo-grade"/><text x="50" y="' + (y(max * f) + 4) + '" class="cfo-eixo" text-anchor="end">' + esc(curto(max * f).replace("R$ ", "")) + "</text>").join("");
    const barras = M.map((m, i) => {
      const cx = 56 + passo * i + passo / 2, x0 = cx - bw / 2, hh = Math.max(base - y(m.rec), m.rec > 0 ? 2 : 0), r = Math.min(4, hh);
      const cls = m.pe == null ? "cfo-bar-neutra" : m.rec >= m.pe ? "cfo-bar-ent" : "cfo-bar-sai";
      const bar = hh ? '<path d="M' + x0 + " " + base + " V" + (base - hh + r) + " Q" + x0 + " " + (base - hh) + " " + (x0 + r) + " " + (base - hh) + " H" + (x0 + bw - r) + " Q" + (x0 + bw) + " " + (base - hh) + " " + (x0 + bw) + " " + (base - hh + r) + " V" + base + ' Z" class="' + cls + '"/>' : "";
      const marca = m.pe != null ? '<line x1="' + (x0 - 8) + '" x2="' + (x0 + bw + 8) + '" y1="' + y(m.pe) + '" y2="' + y(m.pe) + '" class="cfo-pe-linha"/>' : "";
      return '<g class="cfo-mes" data-i="' + i + '" data-prova="pe:mes:' + i + '"><rect x="' + (cx - passo / 2) + '" y="0" width="' + passo + '" height="' + H + '" class="cfo-hit"/>' + bar + marca +
        '<text x="' + cx + '" y="' + (H - 24) + '" class="cfo-eixo" text-anchor="middle">' + m.rot + (m.atual ? " · até hoje" : "") + '</text><text x="' + cx + '" y="' + (H - 6) + '" class="cfo-res ' + (m.pct == null ? "" : m.pct >= 100 ? "pos" : "neg") + '" text-anchor="middle">' + (m.pct == null ? "–" : pctTxt(m.pct) + " do ponto") + "</text></g>";
    }).join("");
    return '<div class="cfo-chart" data-chart="pe"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Faturamento de cada mês comparado com o ponto de equilíbrio">' + grade + barras + '</svg><div class="cfo-tip" hidden></div></div>';
  }
  function quadroPE(K) {
    const E = K.pe, m = E.atual, falta = m.pe != null ? r2(m.pe - m.rec) : null, prog = m.pct == null ? 0 : Math.min(m.pct, 100);
    const mini = (prova, rot, valor, sub, cls) => '<button type="button" class="cfo-pe-num ' + (cls || "") + '" data-prova="' + prova + '"><span>' + rot + "</span><strong>" + valor + "</strong><small>" + sub + "</small></button>";
    const naoLanc = soma(m.prevFalta, (x) => x.falta);
    return '<article class="cfo-card cfo-span2 cfo-pe"><header><h3>Ponto de equilíbrio · quanto faturar para pagar os custos fixos</h3><div class="cfo-leg"><span><i class="b-ent"></i>Faturou acima</span><span><i class="b-sai"></i>Faturou abaixo</span><span><i class="l-pe"></i>Ponto de equilíbrio</span><span class="cfo-leg-nota">clique no mês</span></div></header>' +
      '<div class="cfo-pe-nums">' +
      mini("pe:fixos", "Custos fixos do mês", esc(curto(m.fix)), naoLanc > 0.005 ? "inclui " + esc(curto(naoLanc)) + " cadastrado e ainda não lançado" : "lançados nas contas fixas", "") +
      mini("pe:mc", "Margem de contribuição", E.mcBase == null ? "–" : pctTxt(E.mcBase * 100), E.mcBase == null ? "sem faturamento nos 3 últimos meses" : "sobra de cada venda · 3 últimos meses", E.mcBase != null && E.mcBase <= 0 ? "neg" : "") +
      mini("pe:atual", "Precisa faturar no mês", m.pe == null ? "–" : esc(curto(m.pe)), m.pe == null ? "sem dados para calcular" : "custos fixos ÷ margem", "") +
      mini("pe:atual", "Faturado no mês até agora", esc(curto(m.rec)), m.pe == null ? "lançado em A receber" : falta > 0 ? '<span class="neg">faltam ' + esc(curto(falta)) + "</span>" : '<span class="pos">' + esc(curto(-falta)) + " acima do ponto</span>", m.pe == null ? "" : falta > 0 ? "neg" : "pos") +
      "</div>" +
      (m.pe != null ? '<div class="cfo-pe-barra" data-prova="pe:atual" title="Faturado no mês ÷ ponto de equilíbrio"><i class="' + (m.pct >= 100 ? "pos" : "neg") + '" style="width:' + prog + '%"></i><span>' + pctTxt(m.pct) + " do ponto de equilíbrio de " + MESES_L[Number(m.k.slice(5, 7)) - 1] + "</span></div>" : "") +
      graficoPE(E) +
      '<footer class="cfo-rodape cfo-pe-fixas"><span class="cfo-pe-fixas-rot">Contas fixas do Plano de contas</span>' +
      (E.fixasPlano.length ? E.fixasPlano.slice(0, 6).map((x, i) => '<button type="button" data-prova="pe:cat:' + i + '">' + esc(x.c.nome) + " <b>" + (x.prevMes > 0 ? esc(curto(x.prevMes)) + "/mês" : esc(curto(x.lanc))) + "</b></button>").join("") : "<span>Nenhuma conta fixa com valor mensal cadastrado ou lançamento neste mês.</span>") +
      (E.fixoSemValor.length ? '<button type="button" data-prova="pe:semvalor" class="neg">' + E.fixoSemValor.length + " fixa(s) sem valor cadastrado ›</button>" : "") + "</footer></article>";
  }

  // ---------------------------------------------------------------- tela
  const kpi = (prova, rot, valor, sub, cls) => '<button type="button" class="cfo-kpi ' + (cls || "") + '" data-prova="' + prova + '"><span class="cfo-kpi-rot">' + rot + '</span><strong class="cfo-kpi-v">' + valor + '</strong><span class="cfo-kpi-sub">' + (sub || "") + '</span><span class="cfo-kpi-ver">ver de onde vem ›</span></button>';
  function html(A) {
    const K = P.K, S = P.S;
    const pr = (S.cnpjs || []).find((c) => c.is_principal) || (S.cnpjs || [])[0], empresa = pr ? pr.nome_fantasia || pr.razao_social || "" : "";
    const crit = A.filter((a) => a.nivel === "crit").length, aten = A.length - crit;
    const mesAt = K.meses[11], mesAn = K.meses[10], delta = r2(mesAt.res - mesAn.res);
    const maxF = Math.max(1, ...K.faixas.map((f) => f.v));
    const lista = (l, tot, pref, vazio) => l.length ? l.map((c, i) => '<li data-prova="' + pref + i + '" tabindex="0"><span class="cfo-nome">' + esc(c.nome) + '</span><span class="cfo-barrinha"><i style="width:' + (tot ? Math.max(2, (c.v / tot) * 100) : 0) + '%"></i></span><b>' + esc(curto(c.v)) + "</b><small>" + pctTxt(tot ? (c.v / tot) * 100 : null) + "</small></li>").join("") : '<li class="cfo-vazio">' + vazio + "</li>";
    return '<header class="cfo-topo"><div class="cfo-tit">' + (S.empresa?.logo_url ? '<span class="cfo-logo"><img src="' + esc(S.empresa.logo_url) + '" alt="' + esc(empresa || "Logo da empresa") + '"></span>' : "") + '<div><h2>Painel gerencial</h2><small>' + esc(empresa) + (empresa ? " · " : "") + "dados de agora, atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + "</small></div></div>" +
      '<div class="cfo-relogio" id="cfoRelogio"></div>' +
      '<div class="cfo-resumo-al"><span>Alertas</span><div><b class="' + (crit ? "neg" : "pos") + '">' + crit + '</b><small>' + (crit === 1 ? "crítico" : "críticos") + '</small></div><div><b>' + aten + "</b><small>de atenção</small></div></div>" +
      '<div class="cfo-acoes"><button type="button" data-cfo="atualizar">↻ Atualizar</button><button type="button" data-cfo="tela">⛶ Tela cheia</button></div></header>' +
      (P.X.falhas.length ? '<p class="cfo-falha">Não foi possível ler: ' + esc(P.X.falhas.join(", ")) + ". Os quadros que dependem disso aparecem vazios.</p>" : "") +

      '<div class="cfo-telas"><section class="cfo-tela" data-tela="0" aria-label="Tela 1: números principais, ponto de equilíbrio e alertas"><div class="cfo-kpis">' +
      kpi("caixa", "Dinheiro nas contas", esc(curto(K.caixa)), K.minimo > 0 ? "mínimo cadastrado " + esc(curto(K.minimo)) : "soma das contas ativas", K.caixa < Math.max(K.minimo, 0) ? "neg" : "pos") +
      kpi("receber", "A receber em aberto", esc(curto(K.recAb)), K.recVencV > 0.005 ? '<span class="neg">' + esc(curto(K.recVencV)) + " vencido</span>" : '<span class="pos">nada vencido</span>', "") +
      kpi("pagar", "A pagar em aberto", esc(curto(K.pagAb)), K.pagVencV > 0.005 ? '<span class="neg">' + esc(curto(K.pagVencV)) + " vencido</span>" : '<span class="pos">nada vencido</span>', "") +
      kpi("saldoLiq", "Saldo se tudo for pago e recebido", esc(curto(K.saldoLiq)), "contas + a receber − a pagar", K.saldoLiq < 0 ? "neg" : "pos") +
      kpi("mes:11", "Entrou − saiu nos bancos no mês", K.temMovs ? esc(curto(mesAt.res)) : "–", K.temMovs ? '<span class="' + tom(delta) + '">' + (delta >= 0 ? "▲ " : "▼ ") + esc(curto(Math.abs(delta))) + "</span> vs " + mesAn.rot : "sem movimento registrado nos bancos", K.temMovs ? tom(mesAt.res) : "") +
      kpi("folego", "Meses que o caixa cobre", K.folego == null ? "–" : K.folego.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + (K.folego >= 1 && K.folego < 2 ? " mês" : " meses"), K.folego == null ? "sem saídas registradas nos bancos" : "caixa ÷ saída média " + esc(curto(K.saidaMedia)) + "/mês", "") +
      kpi("atraso", "Atrasado do que há a receber", pctTxt(K.atrasoPct), K.recVenc.length + " parcela(s) vencida(s)", K.recVenc.length ? "neg" : "pos") +
      kpi("margem", "Margem dos eventos", pctTxt(K.margReal), K.comp.length ? K.comp.length + " evento(s) com custos revisados" : "nenhum evento com custos revisados", K.margReal == null ? "" : K.margReal < 0 ? "neg" : "pos") +
      "</div>" +

      '<div class="cfo-grid cfo-grid-1">' +
      quadroPE(K) +
      '<article class="cfo-card cfo-alertas"><header><h3>Alertas</h3><span class="cfo-cont ' + (crit ? "neg" : A.length ? "" : "pos") + '">' + A.length + "</span></header>" +
      (A.length ? "<ul>" + A.map((a) => '<li class="' + a.nivel + '" data-prova="' + a.prova + '" tabindex="0"><i aria-hidden="true">' + (a.nivel === "crit" ? "●" : "▲") + "</i><div><b>" + esc(a.titulo) + "</b><small>" + esc(a.detalhe) + '</small></div><span class="cfo-seta">›</span></li>').join("") + "</ul>"
        : '<div class="cfo-ok"><strong>✓</strong><span>Nenhum problema encontrado nos dados.</span></div>') + "</article>" +
      '</div></section><section class="cfo-tela" data-tela="1" aria-label="Tela 2: bancos, próximos dias, a receber, a pagar e margem"><div class="cfo-grid cfo-grid-2">' +

      '<article class="cfo-card cfo-c-meses"><header><h3>Entrou × saiu nos bancos · 12 meses</h3>' + (K.temMovs ? '<div class="cfo-leg"><span><i class="b-ent"></i>Entradas</span><span><i class="b-sai"></i>Saídas</span><span class="cfo-leg-nota">número embaixo = entrou − saiu · clique no mês</span></div>' : "") + "</header>" +
      graficoMeses(K) + "</article>" +

      '<article class="cfo-card cfo-c-dias"><header><h3>Próximos 7 dias</h3></header><table class="cfo-tab"><thead><tr><th>Dia</th><th>Entra</th><th>Sai</th><th>Saldo</th></tr></thead><tbody>' +
      K.proj.slice(0, 7).map((p, i) => { const wd = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(p.d + "T12:00:00").getDay()], e = soma(p.ent) + soma(p.entV), s = soma(p.sai) + soma(p.saiV);
        return '<tr data-prova="dia:' + i + '" tabindex="0"><td>' + (i ? ddmm(p.d) + " <small>" + wd + "</small>" : "Hoje") + '</td><td class="pos">' + (e > 0.005 ? esc(curto(e)) : "–") + '</td><td class="neg">' + (s > 0.005 ? esc(curto(s)) : "–") + '</td><td class="' + (p.l < Math.max(K.minimo, 0) ? "neg" : "") + '">' + esc(curto(p.l)) + "</td></tr>"; }).join("") +
      '</tbody></table><p class="cfo-nota-peq">Só lançamentos.' + (P.X.incluirVencidos ? " Hoje inclui o que já venceu (mesma regra do Fluxo de caixa)." : "") + "</p></article>" +

      '<article class="cfo-card cfo-c-idade"><header><h3>Idade do a receber</h3></header><ul class="cfo-aging">' +
      K.faixas.map((f, i) => '<li data-prova="faixa:' + i + '" tabindex="0"><span>' + f.rot + '</span><span class="cfo-barrinha ' + (f.venc ? "neg" : "pos") + '"><i style="width:' + (f.v ? Math.max(2, (f.v / maxF) * 100) : 0) + '%"></i></span><b class="' + (f.venc && f.v > 0.005 ? "neg" : "") + '">' + esc(curto(f.v)) + "</b><small>" + f.l.length + "</small></li>").join("") + "</ul></article>" +

      '<article class="cfo-card cfo-c-rec"><header><h3>Maiores a receber</h3></header><ul class="cfo-top">' + lista(K.topCli, K.recAb, "cli:", "Nada a receber.") + "</ul></article>" +
      '<article class="cfo-card cfo-c-pag"><header><h3>Maiores a pagar</h3></header><ul class="cfo-top neg">' + lista(K.topForn, K.pagAb, "forn:", "Nada a pagar.") + "</ul></article>" +

      '<article class="cfo-card cfo-c-marg"><header><h3>Margem dos eventos</h3></header>' +
      (K.comp.length ? '<ul class="cfo-marg">' + K.comp.map((m, i) => ({ m, i })).sort((a, b) => K.margemDe(a.m) - K.margemDe(b.m)).slice(0, 6).map(({ m, i }) => '<li data-prova="ped:' + i + '" tabindex="0"><span class="cfo-nome">' + esc(m.pedido || "") + " <small>" + esc(m.cliente || "") + '</small></span><span class="' + (K.margemDe(m) < 0 ? "neg" : "pos") + '">' + pctTxt(K.margemDe(m)) + "</span><small>" + esc(curto(n(m.preco) - n(m.custo_real))) + "</small></li>").join("") + '</ul><p class="cfo-nota-peq">As 6 menores margens entre os eventos com custos revisados.</p>'
        : '<div class="cfo-vazio">Nenhum evento com custos revisados ainda.</div>') + "</article>" +
      "</div></section></div>" +
      '<footer class="cfo-pe-pag"><nav class="cfo-pontos" aria-label="Telas do painel">' + TELAS.map((t, i) => '<button type="button" data-cfo-tela="' + i + '" title="' + t + '"><i></i><span>' + t + "</span></button>").join("") + "</nav>" +
      '<p class="cfo-transp">Números tirados dos lançamentos do sistema; previsão aparece marcada como PREVISÃO. Clique em qualquer número para ver de onde vem. <span class="cfo-tecla">←</span> <span class="cfo-tecla">→</span> troca a tela · <span class="cfo-tecla">T</span> fundo preto / branco.</p></footer>' +
      '<aside class="cfo-prova" id="cfoProva" hidden></aside>';
  }

  // ---------------------------------------------------------------- quadro da prova
  function abrirProva(chave) {
    const f = P.provas.get(chave); if (!f) return;
    const p = f(), box = document.getElementById("cfoProva");
    const secHtml = (s) => {
      const soma2 = s.linhas.reduce((a, l) => a + n(l.v), 0);
      const confere = s.total == null || Math.abs(r2(soma2) - r2(s.total)) < 0.01;
      return '<section class="cfo-p-sec' + (s.prev ? " prev" : "") + '"><h4>' + esc(s.tit) + (s.prev ? ' <span class="cfo-p-tag prev">PREVISÃO</span>' : "") + "<small>" + s.linhas.length + " item(ns)</small></h4>" +
        (s.linhas.length ? '<table class="cfo-p-tab"><thead><tr><th>Data</th><th>Quem</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>' +
          s.linhas.map((l) => "<tr><td>" + esc(/^\d{4}-\d\d-\d\d$/.test(l.d) ? dataBr(l.d) : l.d) + "</td><td>" + esc(l.quem) + "</td><td>" + esc(l.desc) + '</td><td class="' + tom(l.v) + '">' + esc(brl(l.v)) + "</td></tr>").join("") +
          "</tbody>" + (s.total != null ? '<tfoot><tr><td colspan="3">Soma das linhas' + (confere ? ' <span class="pos">✓ confere</span>' : ' <span class="neg">não confere</span>') + '</td><td class="' + tom(s.total) + '">' + esc(brl(s.total)) + "</td></tr></tfoot>" : "") + "</table>"
          : '<p class="cfo-p-vazio">Nenhum lançamento.</p>') + "</section>";
    };
    box.innerHTML = '<div class="cfo-p-caixa" role="dialog" aria-modal="true" aria-label="' + esc(p.tit) + '"><header><div><small>De onde vem este número</small><h3>' + esc(p.tit) + '</h3></div><button type="button" data-cfo="fecharProva" aria-label="Fechar">×</button></header>' +
      '<div class="cfo-p-corpo"><div class="cfo-p-conta"><span>A conta</span><p>' + p.formula + "</p></div>" +
      '<div class="cfo-p-fonte"><span>Fonte</span><p>' + esc(p.fonte) + (p.aba ? ' · <a href="financeiro.html?aba=' + esc(p.aba) + '" target="_blank" rel="noopener">abrir no sistema ↗</a>' : "") + "</p></div>" +
      (p.secoes || []).map(secHtml).join("") + "</div></div>";
    box.hidden = false;
    box.querySelector("[data-cfo='fecharProva']").focus();
  }
  const fecharProva = () => { const b = document.getElementById("cfoProva"); if (b) b.hidden = true; };

  function ligar(raiz) {
    // projeção: dica ao passar e clique abre o dia
    const ch = raiz.querySelector('.cfo-chart[data-chart="proj"]');
    const posDia = (ev, svg) => { const r = svg.getBoundingClientRect(), vx = ((ev.clientX - r.left) / r.width) * W; return Math.max(0, Math.min(P.K.proj.length - 1, Math.round(((vx - 56) / (W - 64)) * (P.K.proj.length - 1)))); };
    const dica = (ch2, htmlTip, ev) => { const tip = ch2.querySelector(".cfo-tip"); tip.innerHTML = htmlTip; tip.hidden = false; const r = ch2.getBoundingClientRect(); tip.style.left = Math.min(Math.max(ev.clientX - r.left + 14, 0), r.width - tip.offsetWidth - 4) + "px"; tip.style.top = Math.max(ev.clientY - r.top - tip.offsetHeight - 10, 0) + "px"; };
    if (ch) {
      const svg = ch.querySelector("svg"), cruz = svg.querySelector(".cfo-cruz");
      ch.addEventListener("mousemove", (ev) => { const i = posDia(ev, svg), p = P.K.proj[i], xx = 56 + (i * (W - 64)) / Math.max(P.K.proj.length - 1, 1);
        cruz.setAttribute("visibility", "visible"); cruz.setAttribute("x1", xx); cruz.setAttribute("x2", xx);
        dica(ch, "<b>" + dataBr(p.d) + '</b><span>Só lançamentos <em class="' + tom(p.l) + '">' + esc(brl(p.l)) + "</em></span>" + (P.K.prevItens.length ? '<span>Com previsões <em class="' + tom(p.p) + '">' + esc(brl(p.p)) + "</em></span>" : "") + "<small>clique para ver os lançamentos</small>", ev); });
      ch.addEventListener("mouseleave", () => { ch.querySelector(".cfo-tip").hidden = true; cruz.setAttribute("visibility", "hidden"); });
      ch.addEventListener("click", (ev) => abrirProva("dia:" + posDia(ev, svg)));
    }
    const cp = raiz.querySelector('.cfo-chart[data-chart="pe"]');
    if (cp) {
      cp.querySelectorAll(".cfo-mes").forEach((g) => g.addEventListener("mousemove", (ev) => { const m = P.K.pe.meses[Number(g.dataset.i)];
        dica(cp, "<b>" + m.nome + (m.atual ? " (até hoje)" : "") + '</b><span>Faturado <em>' + esc(brl(m.rec)) + "</em></span><span>Ponto de equilíbrio <em>" + (m.pe == null ? "–" : esc(brl(m.pe))) + "</em></span>" + (m.pe != null ? '<span>' + (m.rec >= m.pe ? "Acima" : "Faltou") + ' <em class="' + (m.rec >= m.pe ? "pos" : "neg") + '">' + esc(brl(Math.abs(m.rec - m.pe))) + "</em></span>" : "") + "<small>clique para ver a conta e os lançamentos</small>", ev); }));
      cp.addEventListener("mouseleave", () => { cp.querySelector(".cfo-tip").hidden = true; });
    }
    const cm = raiz.querySelector('.cfo-chart[data-chart="meses"]');
    if (cm) {
      cm.querySelectorAll(".cfo-mes").forEach((g) => g.addEventListener("mousemove", (ev) => { const m = P.K.meses[Number(g.dataset.i)];
        dica(cm, "<b>" + m.nome + '</b><span>Entradas <em class="pos">' + esc(brl(m.ent)) + '</em></span><span>Saídas <em class="neg">' + esc(brl(m.sai)) + '</em></span><span>Entrou − saiu <em class="' + tom(m.res) + '">' + esc(brl(m.res)) + "</em></span><small>clique para ver os lançamentos</small>", ev); }));
      cm.addEventListener("mouseleave", () => { cm.querySelector(".cfo-tip").hidden = true; });
    }
  }

  async function telaCheia() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch (_) { /* navegador recusou */ }
  }

  async function atualizar() {
    const raiz = document.getElementById("cfoPainel");
    try { await carregar(); } catch (e) { console.error(e); raiz.innerHTML = '<div class="cfo-vazio cfo-vazio-grande">Não foi possível ler o financeiro: ' + esc(e.message || e) + "</div>"; return; }
    P.K = calcular(); montarProvas();
    const aberta = document.getElementById("cfoProva") && !document.getElementById("cfoProva").hidden;
    raiz.innerHTML = html(alertas());
    raiz.style.setProperty("--cfo-rot", ROTACAO_MS + "ms");
    ligar(raiz);
    mostrarTela(P.tela);
    if (aberta) fecharProva();
    tick();
  }
  function tick() {
    const r = document.getElementById("cfoRelogio"); if (!r) return;
    const d = new Date(), t = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
    r.innerHTML = "<strong>" + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + "</strong><span>" + t.charAt(0).toUpperCase() + t.slice(1) + "</span>";
  }

  // duas telas que se alternam sozinhas (sem rolagem vertical); para enquanto a prova estiver aberta
  const TELAS = ["Resumo e ponto de equilíbrio", "Bancos, prazos e margem"], ROTACAO_MS = 25000;
  P.tela = 0; P.telaDesde = Date.now();
  function mostrarTela(i) {
    P.tela = (i + TELAS.length) % TELAS.length; P.telaDesde = Date.now();
    const raiz = document.getElementById("cfoPainel"); if (!raiz) return;
    raiz.querySelectorAll(".cfo-tela").forEach((t) => t.classList.toggle("ativa", Number(t.dataset.tela) === P.tela));
    raiz.querySelectorAll("[data-cfo-tela]").forEach((b) => { const on = Number(b.dataset.cfoTela) === P.tela; b.classList.remove("ativa"); if (on) { void b.offsetWidth; b.classList.add("ativa"); } b.setAttribute("aria-current", on ? "true" : "false"); });
  }
  setInterval(() => {
    const raiz = document.getElementById("cfoPainel"), prova = document.getElementById("cfoProva");
    if (prova && !prova.hidden) { P.telaDesde = Date.now(); raiz?.classList.add("cfo-pausado"); return; }
    if (raiz?.classList.contains("cfo-pausado")) { raiz.classList.remove("cfo-pausado"); mostrarTela(P.tela); return; }
    if (!document.hidden && Date.now() - P.telaDesde >= ROTACAO_MS) mostrarTela(P.tela + 1);
  }, 1000);

  // fundo preto (padrão) ou branco: tecla T alterna e o navegador lembra
  const TEMA_KEY = "for106_painel_cfo_tema";
  let temaClaro = (() => { try { return localStorage.getItem(TEMA_KEY) === "claro"; } catch (_) { return false; } })();
  function aplicarTema() {
    document.getElementById("cfoPainel")?.classList.toggle("cfo-claro", temaClaro);
    document.documentElement.style.background = document.body.style.background = temaClaro ? "#fff" : "#000";
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = temaClaro ? "#ffffff" : "#000000";
  }
  function alternarTema() {
    temaClaro = !temaClaro;
    try { localStorage.setItem(TEMA_KEY, temaClaro ? "claro" : "escuro"); } catch (_) { /* sem armazenamento: vale só nesta aba */ }
    aplicarTema();
  }

  async function iniciar() {
    const raiz = document.getElementById("cfoPainel");
    // Chiavari: mesma sessão do sistema (supabase.js + context.js)
    try { if (window.aguardarContexto) await window.aguardarContexto(); } catch (_) { /* segue */ }
    P.S = { sb: window.supabaseClient, emp: window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id") };
    if (!P.S.sb || !P.S.emp) { raiz.innerHTML = '<div class="cfo-vazio cfo-vazio-grande">Entre no sistema para ver o painel.</div>'; return; }
    raiz.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-cfo]");
      if (b?.dataset.cfo === "tela") return telaCheia();
      if (b?.dataset.cfo === "atualizar") { b.disabled = true; b.textContent = "Atualizando…"; return atualizar(); }
      if (b?.dataset.cfo === "fecharProva") return fecharProva();
      const bt = ev.target.closest("[data-cfo-tela]"); if (bt) return mostrarTela(Number(bt.dataset.cfoTela));
      if (ev.target.closest(".cfo-prova")) { if (ev.target.classList.contains("cfo-prova")) fecharProva(); return; }
      const pv = ev.target.closest("[data-prova]"); if (pv) abrirProva(pv.dataset.prova);
    });
    aplicarTema();
    document.addEventListener("keydown", (ev) => {
      if ((ev.key === "t" || ev.key === "T") && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName || "")) { alternarTema(); return; }
      if (ev.key === "Escape") fecharProva();
      const provaAberta = document.getElementById("cfoProva") && !document.getElementById("cfoProva").hidden;
      if (!provaAberta && (ev.key === "ArrowRight" || ev.key === "PageDown")) mostrarTela(P.tela + 1);
      if (!provaAberta && (ev.key === "ArrowLeft" || ev.key === "PageUp")) mostrarTela(P.tela - 1);
      if (ev.key === "Enter" && ev.target.matches?.("[data-prova]")) abrirProva(ev.target.dataset.prova);
    });
    // O navegador só deixa entrar em tela cheia depois de um toque/clique na página: o primeiro já coloca.
    const primeiro = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); document.removeEventListener("pointerdown", primeiro, true); document.removeEventListener("keydown", primeiro, true); };
    document.addEventListener("pointerdown", primeiro, true); document.addEventListener("keydown", primeiro, true);
    document.addEventListener("fullscreenchange", () => document.body.classList.toggle("cfo-cheio", !!document.fullscreenElement));
    await atualizar();
    relogio = setInterval(tick, 15000);
    // atualiza sozinho a cada 5 minutos (TV da sala), sem fechar a prova aberta à toa: só se ninguém estiver olhando uma
    timer = setInterval(() => { if (!document.hidden && document.getElementById("cfoProva")?.hidden !== false) atualizar(); }, 5 * 60 * 1000);
  }

  window.FinanceiroCFO = { iniciar };
  if (document.getElementById("cfoPainel")) iniciar().catch((e) => { console.error(e); document.getElementById("cfoPainel").innerHTML = '<div class="cfo-vazio cfo-vazio-grande">Não foi possível abrir o painel.</div>'; });
})();
