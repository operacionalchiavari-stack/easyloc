/* =====================================================
   PAINEL GERENCIAL (out/2026) — aba "Gerencial" do Financeiro.
   Pedido da diretoria: ver a saúde financeira da empresa "como uma DRE, só que melhor", em números e no formato de
   planilha (nada de gráficos), e poder abrir qualquer número até os lançamentos que o formam (ex.: "impostos estão
   altos, deixa eu ver de onde vem").
   Tudo é calculado aqui a partir dos títulos já carregados pelo financeiro.js (S.receber / S.pagar), pela mesma regra
   da DRE (fin_dre_centros): mês = competência (senão o vencimento), sem os cancelados; "Lançado" usa o valor do título,
   "Realizado" usa o que já foi recebido/pago; centro de custo do título, senão o da categoria.
   Os grupos vêm do plano de contas (categorias de primeiro nível): Impostos (chave "impostos") e Custos da operação
   (nome com "custo") têm linha própria na conta; os outros grupos de saída entram como despesas, na ordem do plano.
===================================================== */
(function () {
  "use strict";
  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  let C = null;   // contexto do financeiro.js
  const G = { ano: null, mes: null, base: "lancado", abertos: new Set() };

  const esc = (v) => C.esc(v);
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  // número no padrão de planilha: 1.234,56; negativo entre parênteses; zero vira traço
  const fmt = (n) => {
    const v = r2(n); if (Math.abs(v) < 0.005) return "–";
    const t = Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v < 0 ? "(" + t + ")" : t;
  };
  const pct = (n, base) => (base && Math.abs(base) > 0.005 ? (n / base) * 100 : null);
  const fmtPct = (p) => (p == null || !isFinite(p) ? "–" : (Math.abs(p) < 0.05 ? 0 : p).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%");
  const hojeLocal = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const somaDias = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const mesDe = (t) => String(t.competencia || t.vencimento || "").slice(0, 7);
  const valorDe = (t, tipo) => Number(G.base === "realizado" ? (tipo === "entrada" ? t.recebido : t.pago) : t.valor) || 0;

  // Fixo ou variável (ponto de equilíbrio): a marcação da categoria; sem marcação, a do grupo; sem nenhuma, a regra:
  // impostos, custos da operação e comissões de decoradores variam com os eventos; o resto é fixo.
  function naturezaDe(c, cats) {
    if (!c) return "fixo";
    const porId = new Map((cats || []).map((x) => [x.id, x]));
    let x = c, n = 0;
    while (x && n++ < 6) { if (x.natureza) return x.natureza; x = x.pai_id ? porId.get(x.pai_id) : null; }
    let topo = c; n = 0;
    while (topo.pai_id && porId.get(topo.pai_id) && n++ < 6) topo = porId.get(topo.pai_id);
    return [c, topo].some((y) => y.chave === "impostos" || y.chave === "bv_decoradores" || /imposto|custo|comiss/i.test(y.nome || "")) ? "variavel" : "fixo";
  }

  // ---------------------------------------------------------------- estrutura (plano de contas)
  function estrutura() {
    const S = C.S, cats = S.cats || [];
    const porId = new Map(cats.map((c) => [c.id, c]));
    const topo = (c) => { let x = c, n = 0; while (x && x.pai_id && porId.get(x.pai_id) && n++ < 6) x = porId.get(x.pai_id); return x; };
    const ordem = (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a.codigo || "").localeCompare(String(b.codigo || ""), "pt-BR", { numeric: true });
    const raizes = cats.filter((c) => !c.pai_id).sort(ordem);
    const nome = (c) => (c.codigo ? c.codigo + " " : "") + c.nome;
    const filhos = (c) => cats.filter((x) => x.pai_id === c.id).sort(ordem);
    // linhas de um grupo: o próprio grupo (lançamentos diretos nele) + cada categoria filha
    const linhasDe = (g) => {
      const fs = filhos(g);
      if (!fs.length) return [{ id: g.id, rotulo: nome(g), ids: [g.id] }];
      return [{ id: g.id, rotulo: nome(g) + " (direto no grupo)", ids: [g.id], direto: true }].concat(fs.map((f) => ({ id: f.id, rotulo: nome(f), ids: [f.id].concat(filhos(f).map((n) => n.id)) })));
    };
    const ent = raizes.filter((c) => c.tipo === "entrada"), sai = raizes.filter((c) => c.tipo !== "entrada");
    const impostos = sai.find((c) => c.chave === "impostos") || sai.find((c) => /imposto/i.test(c.nome));
    const custos = sai.find((c) => c !== impostos && /custo/i.test(c.nome));
    const despesas = sai.filter((c) => c !== impostos && c !== custos);
    const grupo = (c, chave) => ({ chave: chave || c.id, rotulo: c.nome.toUpperCase(), linhas: linhasDe(c), simples: !filhos(c).length });
    return {
      porId, topo,
      receitas: { chave: "receitas", rotulo: "RECEITA BRUTA", linhas: ent.flatMap(linhasDe).concat([{ id: "sem-entrada", rotulo: "Sem categoria", ids: [null], semCat: true }]) },
      impostos: impostos ? grupo(impostos, "impostos") : null,
      custos: custos ? grupo(custos, "custos") : null,
      despesas: despesas.map((c) => grupo(c)).concat([{ chave: "sem-saida", rotulo: "SEM CATEGORIA", linhas: [{ id: "sem-saida", rotulo: "Lançamentos sem categoria", ids: [null], semCat: true }] }])
    };
  }

  // títulos válidos do ano escolhido, com o tipo
  function titulos() {
    const S = C.S, ano = String(G.ano);
    const ok = (t) => t.status !== "cancelado" && mesDe(t).slice(0, 4) === ano;
    return S.receber.filter(ok).map((t) => ({ t, tipo: "entrada" })).concat(S.pagar.filter(ok).map((t) => ({ t, tipo: "saida" })));
  }
  // soma por linha (lista de ids de categoria) e por mês (1..12); null = sem categoria
  function somar(lista, tipo, ids, mes) {
    const alvo = new Set(ids);
    let s = 0;
    for (const x of lista) {
      if (x.tipo !== tipo) continue;
      const cat = x.t.categoria_id || null;
      if (!alvo.has(cat) && !(alvo.has(null) && cat && !C.S.cats.some((c) => c.id === cat))) continue;
      if (mes && Number(mesDe(x.t).slice(5, 7)) !== mes) continue;
      s += valorDe(x.t, x.tipo);
    }
    return s;
  }
  const filtrar = (lista, tipo, ids, mes) => {
    const alvo = new Set(ids);
    return lista.filter((x) => x.tipo === tipo && (alvo.has(x.t.categoria_id || null) || (alvo.has(null) && x.t.categoria_id && !C.S.cats.some((c) => c.id === x.t.categoria_id))) && (!mes || Number(mesDe(x.t).slice(5, 7)) === mes));
  };

  // ---------------------------------------------------------------- monta os números do ano
  function calcular() {
    const E = estrutura(), lista = titulos();
    const meses = Array.from({ length: 12 }, (_, i) => i + 1);
    const serie = (tipo, ids) => meses.map((m) => somar(lista, tipo, ids, m));
    const somaSeries = (ss) => meses.map((_, i) => ss.reduce((a, s) => a + s[i], 0));
    const montarGrupo = (g, tipo) => {
      const linhas = g.linhas.map((l) => ({ ...l, tipo, valores: serie(tipo, l.ids) })).filter((l) => l.valores.some((v) => Math.abs(v) > 0.005) || (!l.direto && !l.semCat && tipo === "entrada"));
      return { ...g, tipo, linhas, ids: g.linhas.flatMap((l) => l.ids), valores: somaSeries(linhas.map((l) => l.valores)) };
    };
    const rec = montarGrupo(E.receitas, "entrada");
    const imp = E.impostos ? montarGrupo(E.impostos, "saida") : null;
    const cus = E.custos ? montarGrupo(E.custos, "saida") : null;
    const des = E.despesas.map((g) => montarGrupo(g, "saida")).filter((g) => g.linhas.length || !String(g.chave).startsWith("sem"));
    const z = meses.map(() => 0);
    const recLiq = meses.map((_, i) => rec.valores[i] - (imp ? imp.valores[i] : 0));
    const margem = meses.map((_, i) => recLiq[i] - (cus ? cus.valores[i] : 0));
    const desTot = des.length ? somaSeries(des.map((g) => g.valores)) : z;
    const resultado = meses.map((_, i) => margem[i] - desTot[i]);
    const pedidos = meses.map((m) => new Set(lista.filter((x) => x.tipo === "entrada" && x.t.pedido_id && Number(mesDe(x.t).slice(5, 7)) === m).map((x) => x.t.pedido_id)).size);
    // ponto de equilíbrio: despesas separadas em variáveis e fixas pelo plano de contas
    const cats = C.S.cats, porId = new Map(cats.map((c) => [c.id, c]));
    const nat = (t) => naturezaDe(porId.get(t.categoria_id), cats);
    const variaveis = meses.map((m) => lista.filter((x) => x.tipo === "saida" && nat(x.t) === "variavel" && Number(mesDe(x.t).slice(5, 7)) === m).reduce((a, x) => a + valorDe(x.t, "saida"), 0));
    const fixos = meses.map((m) => lista.filter((x) => x.tipo === "saida" && nat(x.t) === "fixo" && Number(mesDe(x.t).slice(5, 7)) === m).reduce((a, x) => a + valorDe(x.t, "saida"), 0));
    return { E, lista, rec, imp, cus, des, recLiq, margem, desTot, resultado, pedidos, variaveis, fixos, nat };
  }

  // ---------------------------------------------------------------- tela
  async function render(ctx, manterCache) {
    C = ctx;
    if (!manterCache) G.ev = null; // ao abrir a aba relê os eventos (custos podem ter sido lançados)
    const hj = hojeLocal();
    if (!G.ano) { G.ano = Number(hj.slice(0, 4)); G.mes = Number(hj.slice(5, 7)); }
    const anos = new Set([G.ano, Number(hj.slice(0, 4))]);
    C.S.receber.concat(C.S.pagar).forEach((t) => { const a = Number(mesDe(t).slice(0, 4)); if (a > 2000) anos.add(a); });
    const D = calcular();
    D.ev = await carregarEventos();
    const raiz = document.getElementById("finConteudo");
    raiz.innerHTML =
      '<div class="gr">' +
      '<div class="fin-barra-ferr gr-barra">' +
      '<label>Ano <select id="grAno">' + [...anos].sort((a, b) => b - a).map((a) => '<option' + (a === G.ano ? " selected" : "") + ">" + a + "</option>").join("") + "</select></label>" +
      '<label>Mês de referência <select id="grMes">' + MESES_LONGOS.map((m, i) => '<option value="' + (i + 1) + '"' + (i + 1 === G.mes ? " selected" : "") + ">" + m.charAt(0).toUpperCase() + m.slice(1) + "</option>").join("") + "</select></label>" +
      '<div class="gr-base" role="group" aria-label="Valores">' + [["lancado", "Lançado (competência)"], ["realizado", "Realizado (recebido e pago)"]].map(([k, t]) => '<button type="button" data-gr-base="' + k + '" class="' + (G.base === k ? "ativa" : "") + '" aria-pressed="' + (G.base === k) + '">' + t + "</button>").join("") + "</div>" +
      '<span class="fin-esp"></span><button type="button" class="fin-btn claro" id="grImprimir">Imprimir</button><button type="button" class="fin-btn" id="grExcel">Exportar para Excel</button></div>' +
      '<p class="gr-nota">Valores em R$. ' + (G.base === "realizado" ? "Realizado: só o que já foi recebido e pago" : "Lançado: tudo o que foi lançado no mês de competência, recebido ou não") +
      ". Despesas entre parênteses. Clique em qualquer número para ver os lançamentos.</p>" +
      saude(D) + posicao() + pontoEquilibrio(D) + dreMensal(D) + lucroEventos(D) + maioresDespesas(D) + fornecedores(D) + centros(D) +
      "</div>";
    ligar(raiz, D);
  }

  // célula clicável que abre os lançamentos
  const cel = (v, alvo, extra = "") => {
    const vazio = Math.abs(r2(v)) < 0.005;
    return '<td class="num' + (v < -0.005 ? " neg" : "") + extra + '">' + (vazio || !alvo ? fmt(v) : '<button type="button" class="gr-num" data-gr-ver="' + esc(alvo) + '">' + fmt(v) + "</button>") + "</td>";
  };

  // ---------------------------------------------------------------- 1. saúde financeira
  function saude(D) {
    const m = G.mes, i = m - 1, ant = i - 1;
    const v = (arr, k) => (k < 0 ? null : arr[k]);
    const ac = (arr) => arr.slice(0, m).reduce((a, b) => a + b, 0);
    const imp = D.imp ? D.imp.valores : D.rec.valores.map(() => 0), cus = D.cus ? D.cus.valores : D.rec.valores.map(() => 0);
    const adm = D.desTot;
    const pe = pontos(D);
    const linhas = [
      ["Receita bruta", "rs", D.rec.valores, null, "Tudo o que foi faturado (locação, frete, montagem e outras)."],
      ["Impostos sobre a receita", "pct", imp, D.rec.valores, "Quanto da receita vai para impostos."],
      ["Custos da operação sobre a receita", "pct", cus, D.rec.valores, "Fretes, equipe, Uber, manutenção e insumos."],
      ["Margem de contribuição", "pct", D.margem, D.rec.valores, "O que sobra da receita depois dos impostos e dos custos da operação."],
      ["Despesas (administrativas e outras) sobre a receita", "pct", adm, D.rec.valores, "Folha, aluguel, marketing, tarifas, comissões."],
      ["Resultado do período", "rs", D.resultado, null, "Receita menos impostos, custos e despesas."],
      ["Margem líquida", "pct", D.resultado, D.rec.valores, "Resultado sobre a receita."],
      ["Ponto de equilíbrio (faturamento necessário)", "rs", pe.mes, null, "Quanto faturar para pagar os custos fixos. Abaixo disso, prejuízo.", pe.ac(m)],
      ["Faturamento acima (abaixo) do ponto", "rs", pe.mes.map((p, k) => (p == null ? null : D.rec.valores[k] - p)), null, "Folga sobre o ponto de equilíbrio; entre parênteses, quanto faltou.", pe.ac(m) == null ? null : ac(D.rec.valores) - pe.ac(m)],
      ["Pedidos faturados", "n", D.pedidos, null, "Pedidos com receita no mês."],
      ["Ticket médio por pedido", "ticket", D.rec.valores, D.pedidos, "Receita dividida pelos pedidos."]
    ];
    const valor = ([, tipo, arr, base, , acFixo], k) => {
      if (k == null) return "–";
      if (k === "ac" && acFixo !== undefined) return acFixo == null ? "–" : fmt(acFixo);
      if (k === "ac") {
        const a = ac(arr), b = base ? ac(base) : null;
        return tipo === "rs" ? fmt(a) : tipo === "n" ? String(a) : tipo === "ticket" ? (b ? fmt(a / b) : "–") : fmtPct(pct(a, b));
      }
      const a = v(arr, k), b = base ? v(base, k) : null;
      if (a == null) return "–";
      return tipo === "rs" ? fmt(a) : tipo === "n" ? String(a) : tipo === "ticket" ? (b ? fmt(a / b) : "–") : fmtPct(pct(a, b));
    };
    const nomeMes = (k) => (k < 0 ? "Mês anterior" : MESES[k] + "/" + G.ano);
    return '<section class="fin-bloco gr-bloco"><h3>Saúde financeira <small>' + MESES_LONGOS[i] + " de " + G.ano + "</small></h3>" +
      '<div class="gr-rolar"><table class="gr-planilha"><thead><tr><th>Indicador</th><th class="num">' + nomeMes(ant) + '</th><th class="num">' + nomeMes(i) + '</th><th class="num">Variação</th><th class="num">Acumulado ' + MESES[0] + "–" + MESES[i] + '</th><th>Como ler</th></tr></thead><tbody>' +
      linhas.map((l) => {
        const [rot, tipo, arr, base] = l;
        const atual = arr[i], anterior = ant >= 0 ? arr[ant] : null;
        let varia = "–";
        if (anterior != null && atual != null) {
          if (tipo === "pct") { const pa = pct(atual, base[i]), pb = pct(anterior, base[ant]); varia = pa != null && pb != null ? (pa - pb >= 0 ? "+" : "") + (pa - pb).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " p.p." : "–"; }
          else if (tipo === "ticket") varia = "–";
          else if (Math.abs(anterior) > 0.005) { const p = ((atual - anterior) / Math.abs(anterior)) * 100; varia = (p >= 0 ? "+" : "") + fmtPct(p); }
        }
        return "<tr><th scope=\"row\">" + esc(rot) + '</th><td class="num">' + valor(l, ant >= 0 ? ant : null) + '</td><td class="num forte">' + valor(l, i) + '</td><td class="num">' + varia + '</td><td class="num">' + valor(l, "ac") + '</td><td class="gr-leitura">' + esc(l[4]) + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  // ---------------------------------------------------------------- 2. posição de hoje
  function posicao() {
    const S = C.S, hj = hojeLocal(), lim = somaDias(hj, 30);
    const abertoR = S.receber.filter((t) => ["aberto", "parcial"].includes(t.status));
    const abertoP = S.pagar.filter((t) => !["pago", "cancelado"].includes(t.status) && t.aprovacao !== "reprovada");
    const quando = (t) => String(t.programado_para || t.vencimento || "").slice(0, 10);
    const soma = (l) => l.reduce((a, t) => a + (Number(t.aberto) || 0), 0);
    const saldo = (S.contas || []).filter((c) => c.ativo !== false).reduce((a, c) => a + (Number(S.saldos[c.id]) || 0), 0);
    const recTot = soma(abertoR), recVenc = soma(abertoR.filter((t) => quando(t) < hj)), rec30 = soma(abertoR.filter((t) => quando(t) <= lim));
    const pagVenc = soma(abertoP.filter((t) => quando(t) < hj)), pag30 = soma(abertoP.filter((t) => quando(t) <= lim)), pagTot = soma(abertoP);
    const cobertura = pag30 > 0.005 ? (saldo + rec30) / pag30 : null;
    const lin = (rot, v, leitura, alvo, cls = "") => "<tr" + (cls ? ' class="' + cls + '"' : "") + "><th scope=\"row\">" + esc(rot) + "</th>" + (typeof v === "number" ? cel(v, alvo, " forte") : '<td class="num forte">' + v + "</td>") + '<td class="gr-leitura">' + esc(leitura) + "</td></tr>";
    return '<section class="fin-bloco gr-bloco"><h3>Posição de hoje <small>' + C.dataBr(hj) + "</small></h3>" +
      '<div class="gr-rolar"><table class="gr-planilha gr-pos"><thead><tr><th>Item</th><th class="num">Valor</th><th>Como ler</th></tr></thead><tbody>' +
      lin("Saldo nas contas", saldo, "Soma do saldo de todas as contas ativas (bancos e caixa).") +
      lin("A receber em aberto", recTot, "Tudo o que os clientes ainda devem.", "pos:receber") +
      lin("dos quais vencidos", recVenc, "Parcelas que já passaram do vencimento e não foram pagas.", "pos:receber-vencido", "sub" + (recVenc > 0.005 ? " alerta" : "")) +
      lin("Inadimplência", fmtPct(pct(recVenc, recTot)), "Vencido sobre o total a receber em aberto.") +
      lin("A receber nos próximos 30 dias", rec30, "Inclui os vencidos.", "pos:receber-30") +
      lin("A pagar em aberto", -pagTot, "Tudo o que a empresa ainda deve.", "pos:pagar") +
      lin("dos quais vencidos", -pagVenc, "Contas a pagar já vencidas.", "pos:pagar-vencido", "sub" + (pagVenc > 0.005 ? " alerta" : "")) +
      lin("A pagar nos próximos 30 dias", -pag30, "Inclui os vencidos.", "pos:pagar-30") +
      lin("Cobertura dos próximos 30 dias", cobertura == null ? "–" : cobertura.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " vez(es)", "(Saldo + a receber em 30 dias) dividido pelo a pagar em 30 dias. Abaixo de 1,00 o dinheiro não cobre as contas.", "", cobertura != null && cobertura < 1 ? "alerta" : "") +
      "</tbody></table></div></section>";
  }

  // ---------------------------------------------------------------- ponto de equilíbrio
  // margem de contribuição % = (receita − custos variáveis) / receita; ponto = custos fixos / margem %.
  function pontos(D) {
    const pe1 = (rec, vari, fix) => { if (rec <= 0.005) return null; const mc = (rec - vari) / rec; return mc > 0 ? fix / mc : null; };
    const ac = (arr, m) => arr.slice(0, m).reduce((a, b) => a + b, 0);
    return {
      mes: D.rec.valores.map((r, i) => pe1(r, D.variaveis[i], D.fixos[i])),
      ac: (m) => pe1(ac(D.rec.valores, m), ac(D.variaveis, m), ac(D.fixos, m)),
      pe1
    };
  }
  function pontoEquilibrio(D) {
    const P = pontos(D), i = G.mes - 1;
    const tot = (arr) => arr.reduce((a, b) => a + b, 0);
    const rec = D.rec.valores, vari = D.variaveis, fix = D.fixos;
    const mc = rec.map((r, k) => r - vari[k]);
    const peAno = P.pe1(tot(rec), tot(vari), tot(fix));
    const ticket = rec.map((r, k) => (D.pedidos[k] ? r / D.pedidos[k] : null));
    const ticketAno = tot(D.pedidos) ? tot(rec) / tot(D.pedidos) : null;
    const ref = (k) => (k + 1 === G.mes ? " ref" : "");
    const linha = (rot, arr, total, alvo, cls = "", formato = fmt) => '<tr class="' + cls + '"><th scope="row" class="gr-fixa">' + rot + "</th>" +
      arr.map((v, k) => (alvo ? cel(v, alvo + "|" + (k + 1), ref(k)) : '<td class="num' + ref(k) + (v != null && v < -0.005 ? " neg" : "") + '">' + (v == null ? "–" : formato(v)) + "</td>")).join("") +
      (alvo ? cel(total, alvo + "|0", " tot") : '<td class="num tot' + (total != null && total < -0.005 ? " neg" : "") + '">' + (total == null ? "–" : formato(total)) + "</td>") + "</tr>";
    const pctF = (v) => fmtPct(v);
    const pedidosNec = P.mes.map((p, k) => (p != null && ticket[k] ? p / ticket[k] : null));
    const inteiro = (v) => (v > 0.005 ? Math.ceil(v - 1e-9).toLocaleString("pt-BR") : "–");
    // frase do mês de referência
    let frase = "";
    if (P.mes[i] != null) {
      const folga = rec[i] - P.mes[i];
      frase = "Em " + MESES_LONGOS[i] + " a empresa precisava faturar <b>R$ " + fmt(P.mes[i]) + "</b> para pagar os custos fixos de R$ " + fmt(fix[i]) +
        " (margem de contribuição de " + fmtPct(pct(mc[i], rec[i])) + "). Faturou <b>R$ " + fmt(rec[i]) + "</b>: " +
        (folga >= 0 ? "<b>R$ " + fmt(folga) + " acima</b> do ponto." : '<b class="gr-vermelho">R$ ' + fmt(-folga) + " abaixo</b> do ponto, ou seja, prejuízo.");
    } else if (fix[i] > 0.005) frase = "Em " + MESES_LONGOS[i] + " os custos fixos foram de R$ " + fmt(fix[i]) + (rec[i] > 0.005 ? ", mas os custos variáveis passaram da receita: não há ponto de equilíbrio possível." : " e não houve receita.");
    return '<section class="fin-bloco gr-bloco"><h3>Ponto de equilíbrio <small>' + G.ano + '</small><span class="fin-esp"></span><button type="button" class="fin-btn peq claro" data-gr-plano>Marcar custos fixos e variáveis</button></h3>' +
      (frase ? '<p class="gr-frase">' + frase + "</p>" : "") +
      '<div class="gr-rolar"><table class="gr-planilha gr-dre gr-pe"><thead><tr><th class="gr-fixa">Conta</th>' + MESES.map((m, k) => '<th class="num' + ref(k) + '">' + m + "</th>").join("") + '<th class="num">Total ' + G.ano + "</th></tr></thead><tbody>" +
      linha("Receita bruta", rec, tot(rec), "g:receitas:entrada", "grupo") +
      linha("(−) Custos variáveis", vari.map((v) => -v), -tot(vari), "nat:variavel") +
      linha("(=) Margem de contribuição", mc, tot(mc), "", "derivada") +
      linha("Margem de contribuição %", mc.map((v, k) => pct(v, rec[k])), pct(tot(mc), tot(rec)), "", "pct-linha", pctF) +
      linha("(−) Custos fixos", fix.map((v) => -v), -tot(fix), "nat:fixo") +
      linha("(=) Resultado", mc.map((v, k) => v - fix[k]), tot(mc) - tot(fix), "", "derivada") +
      linha("Ponto de equilíbrio (faturamento necessário)", P.mes, peAno, "", "derivada final") +
      linha("Faturamento acima (abaixo) do ponto", P.mes.map((p, k) => (p == null ? null : rec[k] - p)), peAno == null ? null : tot(rec) - peAno) +
      linha("% do ponto atingido", P.mes.map((p, k) => (p ? (rec[k] / p) * 100 : null)), peAno ? (tot(rec) / peAno) * 100 : null, "", "pct-linha", pctF) +
      linha("Pedidos necessários (pelo ticket médio)", pedidosNec, peAno != null && ticketAno ? peAno / ticketAno : null, "", "", inteiro) +
      linha("Pedidos faturados", D.pedidos, tot(D.pedidos), "", "", (v) => (v ? String(v) : "–")) +
      "</tbody></table></div>" +
      '<p class="gr-legenda">Fixo: existe mesmo sem evento (folha, aluguel). Variável: cresce com os eventos (impostos, frete, equipe, Uber, comissões). A marcação de cada categoria fica no Plano de contas.</p></section>';
  }

  // ---------------------------------------------------------------- lucro por evento
  const CUSTO_EV = { equipe: "Equipe", frete: "Frete", uber: "Uber", terceiros: "Terceiros", personalizacao: "Personalização", reparo: "Reparo", impostos: "Impostos", outros: "Outros" };
  async function carregarEventos() {
    if (G.ev && G.ev.ano === G.ano) return G.ev;
    const ev = { ano: G.ano, eventos: [], custos: [], erro: "" };
    try {
      const r = await C.rpc("fin_resultado_eventos", { p_empresa: C.S.emp, p_inicio: G.ano + "-01-01", p_fim: G.ano + "-12-31" });
      ev.eventos = (r && r.eventos) || [];
      const ids = ev.eventos.map((e) => e.id);
      for (let k = 0; k < ids.length; k += 100) {
        const { data, error } = await C.S.sb.from("fin_custos_evento").select("pedido_id,categoria,descricao,valor,cancelado_em,criado_em").eq("empresa_id", C.S.emp).in("pedido_id", ids.slice(k, k + 100));
        if (error) throw error;
        ev.custos.push(...(data || []).filter((c) => !c.cancelado_em));
      }
    } catch (e) { console.error(e); ev.erro = e.message || String(e); }
    G.ev = ev;
    return ev;
  }
  function eventosCalc(D) {
    const ev = D.ev || { eventos: [], custos: [] };
    const lista = ev.eventos.filter((e) => !G.evMes || String(e.data_evento || "").slice(0, 7) === G.ano + "-" + String(G.mes).padStart(2, "0")).map((e) => {
      const custos = {}; ev.custos.filter((c) => c.pedido_id === e.id).forEach((c) => { custos[c.categoria] = (custos[c.categoria] || 0) + (Number(c.valor) || 0); });
      const receita = (Number(e.valor_total) || 0) - (Number(e.credito) || 0) + (Number(e.reposicao) || 0);
      const total = Object.values(custos).reduce((a, b) => a + b, 0);
      return { ...e, receita, custos, totalCustos: total, lucro: receita - total, margem: pct(receita - total, receita) };
    });
    const ordem = { data: (a, b) => String(b.data_evento).localeCompare(String(a.data_evento)), lucro: (a, b) => b.lucro - a.lucro, margem: (a, b) => (a.margem ?? 1e9) - (b.margem ?? 1e9) }[G.evOrdem || "data"];
    lista.sort(ordem);
    const cats = Object.keys(CUSTO_EV).filter((k) => lista.some((e) => Math.abs(e.custos[k] || 0) > 0.005)).concat([...new Set(lista.flatMap((e) => Object.keys(e.custos)))].filter((k) => !CUSTO_EV[k]));
    return { lista, cats, erro: ev.erro };
  }
  function lucroEventos(D) {
    const { lista, cats, erro } = eventosCalc(D);
    const soma = (f) => lista.reduce((a, e) => a + f(e), 0);
    const nomeCat = (k) => CUSTO_EV[k] || k;
    const prejuizo = lista.filter((e) => e.lucro < -0.005).length, semCusto = lista.filter((e) => e.totalCustos < 0.005).length;
    const ordemBt = (k, t) => '<button type="button" data-gr-evordem="' + k + '" class="' + ((G.evOrdem || "data") === k ? "ativa" : "") + '" aria-pressed="' + ((G.evOrdem || "data") === k) + '">' + t + "</button>";
    const recTot = soma((e) => e.receita), lucroTot = soma((e) => e.lucro);
    return '<section class="fin-bloco gr-bloco"><h3>Lucro por evento <small>' + (G.evMes ? MESES_LONGOS[G.mes - 1] + " de " + G.ano : "eventos de " + G.ano) + "</small><span class=\"fin-esp\"></span>" +
      '<div class="gr-base" role="group" aria-label="Período">' + '<button type="button" data-gr-evmes="0" class="' + (G.evMes ? "" : "ativa") + '">Ano todo</button><button type="button" data-gr-evmes="1" class="' + (G.evMes ? "ativa" : "") + '">Só ' + MESES_LONGOS[G.mes - 1] + "</button></div>" +
      '<div class="gr-base" role="group" aria-label="Ordenar">' + ordemBt("data", "Por data") + ordemBt("lucro", "Maior lucro") + ordemBt("margem", "Menor margem") + "</div>" +
      '<button type="button" class="fin-btn peq claro" data-gr-ir="resultados">Lançar custos dos eventos</button></h3>' +
      (erro ? '<div class="fin-vazio">Não foi possível carregar os eventos: ' + esc(erro) + "</div>" : !lista.length ? '<div class="fin-vazio">Nenhum evento reservado no período.</div>' :
        '<p class="gr-frase">' + lista.length + " evento(s) · receita R$ " + fmt(recTot) + " · lucro R$ " + fmt(lucroTot) + " · margem média " + fmtPct(pct(lucroTot, recTot)) +
        (prejuizo ? ' · <b class="gr-vermelho">' + prejuizo + " com prejuízo</b>" : "") + (semCusto ? " · " + semCusto + " ainda sem custo lançado (o lucro deles está alto porque falta custo)" : "") + ".</p>" +
        '<div class="gr-rolar"><table class="gr-planilha gr-ev"><thead><tr><th>Pedido</th><th>Cliente</th><th>Evento</th><th class="num">Receita</th>' + cats.map((k) => '<th class="num">' + esc(nomeCat(k)) + "</th>").join("") +
        '<th class="num">Total de custos</th><th class="num">Lucro</th><th class="num">Margem</th><th class="num">Recebido</th><th class="num">Em aberto</th><th>Custos</th></tr></thead><tbody>' +
        lista.map((e) => '<tr class="' + (e.lucro < -0.005 ? "alerta" : "") + '"><th scope="row"><button type="button" class="gr-num" data-gr-ver="ev:' + e.id + '">Pedido ' + esc(e.numero_pedido) + "</button></th><td>" + esc(e.cliente_nome) + "</td><td>" + C.dataBr(e.data_evento) + '</td><td class="num">' + fmt(e.receita) + "</td>" +
          cats.map((k) => cel(-(e.custos[k] || 0), "ev:" + e.id + ":" + k)).join("") + cel(-e.totalCustos, "ev:" + e.id) +
          '<td class="num forte' + (e.lucro < -0.005 ? " neg" : "") + '">' + fmt(e.lucro) + '</td><td class="num' + (e.margem != null && e.margem < 0 ? " neg" : "") + '">' + fmtPct(e.margem) + '</td><td class="num">' + fmt(Number(e.recebido) || 0) + '</td><td class="num">' + fmt(Number(e.em_aberto) || 0) + "</td><td>" + (e.custos_revisados ? "Revisados" : '<span class="gr-pendente">Em preenchimento</span>') + "</td></tr>").join("") +
        '<tr class="derivada"><th scope="row" colspan="3">Total</th><td class="num">' + fmt(recTot) + "</td>" + cats.map((k) => '<td class="num neg">' + fmt(-soma((e) => e.custos[k] || 0)) + "</td>").join("") +
        '<td class="num neg">' + fmt(-soma((e) => e.totalCustos)) + '</td><td class="num' + (lucroTot < 0 ? " neg" : "") + '">' + fmt(lucroTot) + '</td><td class="num">' + fmtPct(pct(lucroTot, recTot)) + '</td><td class="num">' + fmt(soma((e) => Number(e.recebido) || 0)) + '</td><td class="num">' + fmt(soma((e) => Number(e.em_aberto) || 0)) + "</td><td></td></tr>" +
        "</tbody></table></div>" +
        '<p class="gr-legenda">Receita = valor do pedido menos créditos dados mais cobranças de reposição (Posição final). Custos = os lançados para o evento em "Lançar custos dos eventos" (fretes e Uber entram sozinhos ao fechar).</p>') +
      "</section>";
  }

  // ---------------------------------------------------------------- 3. DRE mês a mês
  function dreMensal(D) {
    const rec = D.rec.valores.reduce((a, b) => a + b, 0);
    const tot = (arr) => arr.reduce((a, b) => a + b, 0);
    const cab = '<tr><th class="gr-fixa">Conta</th>' + MESES.map((m, i) => '<th class="num' + (i + 1 === G.mes ? " ref" : "") + '">' + m + "</th>").join("") + '<th class="num">Total ' + G.ano + '</th><th class="num">% receita</th></tr>';
    // média dos meses anteriores com valor: o mês de despesa 30% acima dela fica marcado
    const acima = (arr, i) => { const prev = arr.slice(0, i).filter((x) => Math.abs(x) > 0.005); if (prev.length < 2) return false; const med = prev.reduce((a, b) => a + b, 0) / prev.length; return arr[i] > med * 1.3 && arr[i] - med > 50; };
    const linhaValores = (rot, arr, sinal, alvoBase, cls, despesa) => {
      const t = tot(arr);
      return '<tr class="' + cls + '"><th scope="row" class="gr-fixa">' + rot + "</th>" +
        arr.map((v, i) => cel(sinal * v, alvoBase ? alvoBase + "|" + (i + 1) : "", (despesa && acima(arr, i) ? " acima" : "") + (i + 1 === G.mes ? " ref" : ""))).join("") +
        cel(sinal * t, alvoBase ? alvoBase + "|0" : "", " tot") + '<td class="num pct">' + fmtPct(pct(sinal * t, rec)) + "</td></tr>";
    };
    const grupoHtml = (g, sinal, prefixo) => {
      const aberto = G.abertos.has(g.chave) || G.abertos.has("*");
      const temFilhos = !g.simples && g.linhas.length > 0;
      const rot = (temFilhos ? '<button type="button" class="gr-abrir" data-gr-abrir="' + esc(g.chave) + '" aria-expanded="' + aberto + '">' + (aberto ? "▾" : "▸") + "</button>" : '<span class="gr-abrir-vazio"></span>') + esc(prefixo + g.rotulo);
      return linhaValores(rot, g.valores, sinal, "g:" + g.chave + ":" + g.tipo, "grupo", sinal < 0) +
        (temFilhos && aberto ? g.linhas.map((l) => linhaValores('<span class="gr-recuo">' + esc(l.rotulo) + "</span>", l.valores, sinal, "l:" + l.ids.map((x) => x || "-").join(",") + ":" + g.tipo + ":" + encodeURIComponent(l.rotulo), "sub", sinal < 0)).join("") : "");
    };
    const derivada = (rot, arr, cls = "derivada") => linhaValores(esc(rot), arr, 1, "", cls, false);
    const margemPct = (rot, arr) => '<tr class="pct-linha"><th scope="row" class="gr-fixa">' + esc(rot) + "</th>" + arr.map((v, i) => '<td class="num' + (i + 1 === G.mes ? " ref" : "") + '">' + fmtPct(pct(v, D.rec.valores[i])) + "</td>").join("") + '<td class="num tot">' + fmtPct(pct(tot(arr), rec)) + '</td><td class="num"></td></tr>';
    return '<section class="fin-bloco gr-bloco"><h3>Demonstrativo de resultado mês a mês <small>' + G.ano + ' · clique no ▸ para abrir o grupo</small><span class="fin-esp"></span>' +
      '<button type="button" class="fin-btn peq claro" data-gr-abrir="*">' + (G.abertos.has("*") ? "Fechar todos os grupos" : "Abrir todos os grupos") + "</button></h3>" +
      '<div class="gr-rolar"><table class="gr-planilha gr-dre"><thead>' + cab + "</thead><tbody>" +
      grupoHtml(D.rec, 1, "") +
      (D.imp ? grupoHtml(D.imp, -1, "(−) ") + derivada("(=) RECEITA LÍQUIDA", D.recLiq) : "") +
      (D.cus ? grupoHtml(D.cus, -1, "(−) ") : "") +
      derivada("(=) MARGEM DE CONTRIBUIÇÃO", D.margem) + margemPct("Margem de contribuição %", D.margem) +
      D.des.map((g) => grupoHtml(g, -1, "(−) ")).join("") +
      derivada("(=) RESULTADO", D.resultado, "derivada final") + margemPct("Margem líquida %", D.resultado) +
      "</tbody></table></div>" +
      '<p class="gr-legenda"><span class="gr-amostra"></span> Despesa do mês mais de 30% acima da média dos meses anteriores.</p></section>';
  }

  // ---------------------------------------------------------------- 4. onde está o gasto
  function maioresDespesas(D) {
    const i = G.mes - 1;
    const linhas = [];
    [D.imp, D.cus].concat(D.des).filter(Boolean).forEach((g) => g.linhas.forEach((l) => linhas.push({ ...l, grupo: g.rotulo, tipo: g.tipo })));
    const tot = (arr) => arr.reduce((a, b) => a + b, 0);
    const totalDesp = linhas.reduce((a, l) => a + tot(l.valores), 0), rec = tot(D.rec.valores);
    const meses = Math.max(1, G.mes);
    const lista = linhas.map((l) => ({ ...l, total: tot(l.valores) })).filter((l) => Math.abs(l.total) > 0.005).sort((a, b) => b.total - a.total);
    if (!lista.length) return "";
    return '<section class="fin-bloco gr-bloco"><h3>Onde está o gasto <small>despesas de ' + G.ano + ", da maior para a menor</small></h3>" +
      '<div class="gr-rolar"><table class="gr-planilha"><thead><tr><th>#</th><th>Conta</th><th>Grupo</th><th class="num">Total ' + G.ano + '</th><th class="num">% das despesas</th><th class="num">% da receita</th><th class="num">Média por mês (até ' + MESES[i] + ')</th><th class="num">' + MESES[i] + '</th><th class="num">' + (i > 0 ? MESES[i - 1] : "Mês anterior") + '</th><th class="num">Variação</th></tr></thead><tbody>' +
      lista.map((l, k) => {
        const atual = l.valores[i], ant = i > 0 ? l.valores[i - 1] : 0;
        const varia = Math.abs(ant) > 0.005 ? ((atual - ant) / Math.abs(ant)) * 100 : null;
        const alvo = "l:" + l.ids.map((x) => x || "-").join(",") + ":saida:" + encodeURIComponent(l.rotulo);
        return "<tr><td>" + (k + 1) + "</td><th scope=\"row\">" + esc(l.rotulo) + "</th><td>" + esc(l.grupo.charAt(0) + l.grupo.slice(1).toLowerCase()) + "</td>" + cel(-l.total, alvo + "|0") +
          '<td class="num">' + fmtPct(pct(l.total, totalDesp)) + '</td><td class="num">' + fmtPct(pct(l.total, rec)) + '</td><td class="num">' + fmt(-tot(l.valores.slice(0, meses)) / meses) + "</td>" +
          cel(-atual, alvo + "|" + G.mes) + cel(-ant, i > 0 ? alvo + "|" + (G.mes - 1) : "") +
          '<td class="num' + (varia != null && varia > 30 ? " alto" : "") + '">' + (varia == null ? "–" : (varia >= 0 ? "+" : "") + fmtPct(varia)) + "</td></tr>";
      }).join("") +
      '<tr class="derivada"><th scope="row" colspan="3">Total das despesas</th>' + cel(-totalDesp, "") + '<td class="num">100,0%</td><td class="num">' + fmtPct(pct(totalDesp, rec)) + '</td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td></tr>' +
      "</tbody></table></div></section>";
  }

  // ---------------------------------------------------------------- 5. fornecedores
  function fornecedores(D) {
    const mapa = new Map();
    D.lista.filter((x) => x.tipo === "saida").forEach((x) => {
      const nome = (x.t.fornecedor_nome || "").trim() || "Sem fornecedor informado";
      const k = nome.toLowerCase(), o = mapa.get(k) || { nome, n: 0, total: 0 };
      o.n += 1; o.total += valorDe(x.t, "saida"); mapa.set(k, o);
    });
    const lista = [...mapa.values()].filter((o) => Math.abs(o.total) > 0.005).sort((a, b) => b.total - a.total).slice(0, 15);
    if (!lista.length) return "";
    const tot = [...mapa.values()].reduce((a, o) => a + o.total, 0);
    return '<section class="fin-bloco gr-bloco"><h3>Para quem a empresa mais pagou <small>' + G.ano + " · 15 maiores</small></h3>" +
      '<div class="gr-rolar"><table class="gr-planilha"><thead><tr><th>#</th><th>Fornecedor</th><th class="num">Lançamentos</th><th class="num">Total ' + G.ano + '</th><th class="num">% das despesas</th></tr></thead><tbody>' +
      lista.map((o, k) => "<tr><td>" + (k + 1) + "</td><th scope=\"row\">" + esc(o.nome) + '</th><td class="num">' + o.n + "</td>" + cel(-o.total, "f:" + encodeURIComponent(o.nome.toLowerCase())) + '<td class="num">' + fmtPct(pct(o.total, tot)) + "</td></tr>").join("") +
      "</tbody></table></div></section>";
  }

  // ---------------------------------------------------------------- 6. centros de custo
  function centros(D) {
    const S = C.S, mapa = new Map();
    const ccDe = (t) => t.centro_custo_id || (S.cats.find((c) => c.id === t.categoria_id) || {}).centro_custo_id || "";
    D.lista.forEach((x) => {
      const k = ccDe(x.t), o = mapa.get(k) || { id: k, rec: 0, des: 0 };
      if (x.tipo === "entrada") o.rec += valorDe(x.t, "entrada"); else o.des += valorDe(x.t, "saida");
      mapa.set(k, o);
    });
    const lista = [...mapa.values()].filter((o) => Math.abs(o.rec) + Math.abs(o.des) > 0.005);
    if (!lista.length) return "";
    const nome = (id) => (id ? (S.ccs.find((c) => c.id === id) || {}).nome || "Centro removido" : "Sem centro de custo");
    lista.sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || nome(a.id).localeCompare(nome(b.id), "pt-BR"));
    return '<section class="fin-bloco gr-bloco"><h3>Resultado por centro de custo <small>' + G.ano + "</small></h3>" +
      '<div class="gr-rolar"><table class="gr-planilha"><thead><tr><th>Centro de custo</th><th class="num">Receitas</th><th class="num">Despesas</th><th class="num">Resultado</th><th class="num">Margem</th></tr></thead><tbody>' +
      lista.map((o) => "<tr><th scope=\"row\">" + esc(nome(o.id)) + "</th>" + cel(o.rec, "c:" + (o.id || "-") + ":entrada") + cel(-o.des, "c:" + (o.id || "-") + ":saida") + cel(o.rec - o.des, "") + '<td class="num">' + fmtPct(pct(o.rec - o.des, o.rec)) + "</td></tr>").join("") +
      "</tbody></table></div></section>";
  }

  // ---------------------------------------------------------------- lançamentos de um número
  function lancamentosDe(alvo, D) {
    const S = C.S, hj = hojeLocal(), lim = somaDias(hj, 30);
    const quando = (t) => String(t.programado_para || t.vencimento || "").slice(0, 10);
    const [chave, mesTxt] = alvo.split("|"), mes = Number(mesTxt) || 0;
    const nomeMes = mes ? MESES_LONGOS[mes - 1] + " de " + G.ano : "ano de " + G.ano;
    let titulo = "", lista = [];
    if (chave.startsWith("pos:")) {
      const k = chave.slice(4);
      const rec = k.startsWith("receber"), base = rec ? S.receber.filter((t) => ["aberto", "parcial"].includes(t.status)) : S.pagar.filter((t) => !["pago", "cancelado"].includes(t.status) && t.aprovacao !== "reprovada");
      lista = base.filter((t) => (k.endsWith("vencido") ? quando(t) < hj : k.endsWith("30") ? quando(t) <= lim : true)).map((t) => ({ t, tipo: rec ? "entrada" : "saida", aberto: true }));
      titulo = { receber: "A receber em aberto", "receber-vencido": "A receber vencido", "receber-30": "A receber nos próximos 30 dias", pagar: "A pagar em aberto", "pagar-vencido": "A pagar vencido", "pagar-30": "A pagar nos próximos 30 dias" }[k];
    } else if (chave.startsWith("g:") || chave.startsWith("l:")) {
      const partes = chave.split(":");
      const tipo = partes[2];
      let ids, rot;
      if (chave.startsWith("g:")) {
        const g = [D.rec, D.imp, D.cus].concat(D.des).find((x) => x && x.chave === partes[1]);
        ids = g ? g.ids : []; rot = g ? g.rotulo.charAt(0) + g.rotulo.slice(1).toLowerCase() : "";
      } else { ids = partes[1].split(",").map((x) => (x === "-" ? null : x)); rot = decodeURIComponent(partes.slice(3).join(":")); }
      lista = filtrar(D.lista, tipo, ids, mes);
      titulo = rot + " · " + nomeMes;
    } else if (chave.startsWith("nat:")) {
      const n = chave.slice(4);
      lista = D.lista.filter((x) => x.tipo === "saida" && D.nat(x.t) === n && (!mes || Number(mesDe(x.t).slice(5, 7)) === mes));
      titulo = "Custos " + (n === "variavel" ? "variáveis" : "fixos") + " · " + nomeMes;
    } else if (chave.startsWith("f:")) {
      const nome = decodeURIComponent(chave.slice(2));
      lista = D.lista.filter((x) => x.tipo === "saida" && (((x.t.fornecedor_nome || "").trim() || "Sem fornecedor informado").toLowerCase() === nome));
      titulo = (lista[0]?.t.fornecedor_nome || "Sem fornecedor informado") + " · " + nomeMes;
    } else if (chave.startsWith("c:")) {
      const [, id, tipo] = chave.split(":");
      const ccDe = (t) => t.centro_custo_id || (S.cats.find((c) => c.id === t.categoria_id) || {}).centro_custo_id || "";
      lista = D.lista.filter((x) => x.tipo === tipo && (ccDe(x.t) || "-") === id);
      titulo = (id === "-" ? "Sem centro de custo" : (S.ccs.find((c) => c.id === id) || {}).nome || "") + " · " + (tipo === "entrada" ? "receitas" : "despesas") + " · " + nomeMes;
    }
    return { titulo, lista };
  }

  function linhasDetalhe(lista) {
    const S = C.S;
    const cat = (id) => S.cats.find((c) => c.id === id);
    const cc = (t) => { const id = t.centro_custo_id || (cat(t.categoria_id) || {}).centro_custo_id; return id ? (S.ccs.find((c) => c.id === id) || {}).nome || "" : ""; };
    return lista.map(({ t, tipo, aberto }) => {
      const ped = t.pedido_id ? S.pedidos[t.pedido_id] : null;
      const quem = tipo === "entrada" ? (ped ? "Pedido " + (ped.numero_pedido || t.pedido_numero || "") + " · " : "") + (t.cliente_nome || ped?.cliente_nome || "") : t.fornecedor_nome || "";
      const valor = aberto ? Number(t.aberto) || 0 : valorDe(t, tipo);
      return {
        competencia: String(t.competencia || t.vencimento || "").slice(0, 10), vencimento: String(t.vencimento || "").slice(0, 10), quem,
        descricao: t.descricao || "", documento: t.documento || "", categoria: (cat(t.categoria_id) || {}).nome || "Sem categoria", centro: cc(t) || "Sem centro",
        parcela: t.parcelas > 1 ? t.parcela + "/" + t.parcelas : "", total: Number(t.valor) || 0, quitado: Number(tipo === "entrada" ? t.recebido : t.pago) || 0,
        valor: tipo === "entrada" ? valor : -valor, status: t.status, tipo
      };
    }).sort((a, b) => a.competencia.localeCompare(b.competencia) || Math.abs(b.valor) - Math.abs(a.valor));
  }

  function abrirEvento(alvo, D) {
    const [, id, catSel] = alvo.split(":");
    const e = eventosCalc(D).lista.find((x) => x.id === id) || (D.ev.eventos || []).find((x) => x.id === id);
    if (!e) return;
    const custos = D.ev.custos.filter((c) => c.pedido_id === id && (!catSel || c.categoria === catSel)).sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
    const receita = (Number(e.valor_total) || 0) - (Number(e.credito) || 0) + (Number(e.reposicao) || 0), totC = custos.reduce((a, c) => a + (Number(c.valor) || 0), 0);
    const titulo = "Pedido " + e.numero_pedido + " · " + e.cliente_nome + (catSel ? " · " + (CUSTO_EV[catSel] || catSel) : "");
    const corpo = '<div class="gr-rolar"><table class="gr-planilha"><tbody>' +
      '<tr><th scope="row">Valor do pedido</th><td class="num">' + fmt(e.valor_total) + "</td></tr>" +
      (Number(e.credito) ? '<tr><th scope="row">(−) Créditos dados</th><td class="num neg">' + fmt(-e.credito) + "</td></tr>" : "") +
      (Number(e.reposicao) ? '<tr><th scope="row">(+) Cobranças de reposição</th><td class="num">' + fmt(e.reposicao) + "</td></tr>" : "") +
      '<tr class="derivada"><th scope="row">Receita do evento</th><td class="num">' + fmt(receita) + "</td></tr></tbody></table></div>" +
      '<h4 class="gr-sub">Custos lançados' + (catSel ? " de " + esc(CUSTO_EV[catSel] || catSel) : "") + "</h4>" +
      (custos.length ? '<div class="gr-rolar gr-detalhe"><table class="gr-planilha"><thead><tr><th>Lançado em</th><th>Tipo</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>' +
        custos.map((c) => "<tr><td>" + C.dataBr(c.criado_em) + "</td><td>" + esc(CUSTO_EV[c.categoria] || c.categoria) + "</td><td>" + esc(c.descricao) + '</td><td class="num neg">' + fmt(-c.valor) + "</td></tr>").join("") +
        '<tr class="derivada"><th colspan="3">Total</th><td class="num neg">' + fmt(-totC) + "</td></tr></tbody></table></div>" : '<div class="fin-vazio">Nenhum custo lançado' + (catSel ? " deste tipo" : "") + ' para este evento.</div>') +
      (catSel ? "" : '<p class="gr-frase">Lucro: <b>R$ ' + fmt(receita - totC) + "</b> · margem " + fmtPct(pct(receita - totC, receita)) + "</p>");
    const dlg = document.getElementById("finModal");
    dlg.classList.add("gr-modal-largo");
    dlg.addEventListener("close", () => dlg.classList.remove("gr-modal-largo"), { once: true });
    C.modal(titulo, corpo, [{ rotulo: "Lançar custos", classe: "claro", acao: () => { C.fecharModal(); C.irPara?.("resultados"); } }, { rotulo: "Fechar", acao: C.fecharModal }]);
  }
  function abrirDetalhe(alvo, D) {
    if (alvo.startsWith("ev:")) return abrirEvento(alvo, D);
    const { titulo, lista } = lancamentosDe(alvo, D);
    const L = linhasDetalhe(lista);
    const soma = L.reduce((a, l) => a + l.valor, 0);
    const corpo = '<p class="gr-nota">' + L.length + " lançamento(s) · total <b>" + fmt(soma) + "</b>" + (alvo.startsWith("pos:") ? " (valor em aberto)" : G.base === "realizado" ? " (realizado)" : " (lançado)") + "</p>" +
      (L.length ? '<div class="gr-rolar gr-detalhe"><table class="gr-planilha"><thead><tr><th>Competência</th><th>Vencimento</th><th>Cliente / fornecedor</th><th>Descrição</th><th>Documento</th><th>Categoria</th><th>Centro de custo</th><th class="num">Valor do título</th><th class="num">' + (lista[0]?.tipo === "entrada" ? "Recebido" : "Pago") + '</th><th class="num">Considerado</th><th>Situação</th></tr></thead><tbody>' +
        L.map((l) => "<tr><td>" + C.dataBr(l.competencia) + "</td><td>" + C.dataBr(l.vencimento) + "</td><td>" + esc(l.quem) + "</td><td>" + esc(l.descricao) + (l.parcela ? " <small>(" + l.parcela + ")</small>" : "") + "</td><td>" + esc(l.documento) + "</td><td>" + esc(l.categoria) + "</td><td>" + esc(l.centro) + '</td><td class="num">' + fmt(l.total) + '</td><td class="num">' + fmt(l.quitado) + '</td><td class="num' + (l.valor < 0 ? " neg" : "") + '"><b>' + fmt(l.valor) + "</b></td><td>" + esc(SIT[l.status] || l.status) + "</td></tr>").join("") +
        '<tr class="derivada"><th colspan="9">Total</th><td class="num"><b>' + fmt(soma) + '</b></td><td></td></tr></tbody></table></div>' : '<div class="fin-vazio">Nenhum lançamento.</div>');
    const dlg = document.getElementById("finModal");
    dlg.classList.add("gr-modal-largo");
    dlg.addEventListener("close", () => dlg.classList.remove("gr-modal-largo"), { once: true });
    C.modal(titulo, corpo, [
      { rotulo: "Exportar para Excel", classe: "claro", acao: () => exportar([{ nome: "Lançamentos", linhas: planilhaDetalhe(L, titulo) }], "Lançamentos - " + titulo) },
      { rotulo: "Fechar", acao: C.fecharModal }
    ]);
  }
  const SIT = { aberto: "Em aberto", parcial: "Parcial", recebido: "Recebido", pago: "Pago", pendente: "Pendente", aprovado: "Aprovado", programado: "Programado", cancelado: "Cancelado" };

  // ---------------------------------------------------------------- Excel
  function carregarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      s.onload = () => (window.XLSX ? ok(window.XLSX) : erro(new Error("Não foi possível carregar o Excel.")));
      s.onerror = () => erro(new Error("Não foi possível carregar o Excel. Confira a internet."));
      document.head.appendChild(s);
    });
  }
  const dataPlan = (d) => (d ? new Date(d + "T12:00:00") : "");
  function planilhaDetalhe(L, titulo) {
    return [[titulo], [], ["Competência", "Vencimento", "Cliente / fornecedor", "Descrição", "Parcela", "Documento", "Categoria", "Centro de custo", "Valor do título", "Recebido / pago", "Considerado", "Situação"]]
      .concat(L.map((l) => [dataPlan(l.competencia), dataPlan(l.vencimento), l.quem, l.descricao, l.parcela, l.documento, l.categoria, l.centro, r2(l.total), r2(l.quitado), r2(l.valor), SIT[l.status] || l.status]))
      .concat([[], ["Total", "", "", "", "", "", "", "", "", "", r2(L.reduce((a, l) => a + l.valor, 0))]]);
  }
  async function exportar(abas, nomeArquivo) {
    try {
      const X = await carregarXlsx();
      const wb = X.utils.book_new();
      abas.forEach((a) => {
        const ws = X.utils.aoa_to_sheet(a.linhas, { cellDates: true });
        // formato brasileiro nos números e datas
        Object.keys(ws).forEach((k) => { if (k[0] === "!") return; const c = ws[k]; if (c.t === "n") c.z = a.pct && a.pct(k) ? "0.0%" : "#,##0.00;[Red](#,##0.00);\"–\""; if (c.t === "d") c.z = "dd/mm/yyyy"; });
        ws["!cols"] = (a.larguras || [14, 12, 34, 40, 9, 14, 26, 22, 14, 14, 14, 12]).map((w) => ({ wch: w }));
        X.utils.book_append_sheet(wb, ws, a.nome.slice(0, 31));
      });
      X.writeFile(wb, nomeArquivo.replace(/[\\/:*?"<>|]/g, "-").slice(0, 120) + ".xlsx");
    } catch (e) { console.error(e); C.avisar(e.message || "Não foi possível exportar.", "Painel gerencial", "erro"); }
  }
  function exportarTudo(D) {
    const meses = MESES.map((m) => m + "/" + G.ano);
    const tot = (arr) => arr.reduce((a, b) => a + b, 0);
    const dre = [["Demonstrativo de resultado " + G.ano + " (" + (G.base === "realizado" ? "realizado" : "lançado por competência") + ")"], [], ["Conta"].concat(meses, ["Total", "% receita"])];
    const rec = tot(D.rec.valores);
    const add = (rot, arr, sinal) => dre.push([rot].concat(arr.map((v) => r2(sinal * v)), [r2(sinal * tot(arr)), rec ? r2((sinal * tot(arr)) / rec) : ""]));
    const grupo = (g, sinal, pre) => { add(pre + g.rotulo, g.valores, sinal); if (g.linhas.length > 1) g.linhas.forEach((l) => add("    " + l.rotulo, l.valores, sinal)); };
    grupo(D.rec, 1, "");
    if (D.imp) { grupo(D.imp, -1, "(−) "); add("(=) RECEITA LÍQUIDA", D.recLiq, 1); }
    if (D.cus) grupo(D.cus, -1, "(−) ");
    add("(=) MARGEM DE CONTRIBUIÇÃO", D.margem, 1);
    D.des.forEach((g) => grupo(g, -1, "(−) "));
    add("(=) RESULTADO", D.resultado, 1);
    const colPct = (k) => /^[A-Z]+/.exec(k)[0] === "O" && Number(k.replace(/^[A-Z]+/, "")) > 3;
    const lanc = planilhaDetalhe(linhasDetalhe(D.lista), "Todos os lançamentos de " + G.ano + " (" + (G.base === "realizado" ? "realizado" : "lançado") + ")");
    const P = pontos(D), rv = D.rec.valores;
    const peAno = P.pe1(tot(rv), tot(D.variaveis), tot(D.fixos));
    const pe = [["Ponto de equilíbrio " + G.ano], [], ["Conta"].concat(meses, ["Total"]),
      ["Receita bruta"].concat(rv.map(r2), [r2(tot(rv))]),
      ["(−) Custos variáveis"].concat(D.variaveis.map((v) => r2(-v)), [r2(-tot(D.variaveis))]),
      ["(=) Margem de contribuição"].concat(rv.map((r, k) => r2(r - D.variaveis[k])), [r2(tot(rv) - tot(D.variaveis))]),
      ["(−) Custos fixos"].concat(D.fixos.map((v) => r2(-v)), [r2(-tot(D.fixos))]),
      ["Ponto de equilíbrio (faturamento necessário)"].concat(P.mes.map((p) => (p == null ? "" : r2(p))), [peAno == null ? "" : r2(peAno)]),
      ["Faturamento acima (abaixo) do ponto"].concat(P.mes.map((p, k) => (p == null ? "" : r2(rv[k] - p))), [peAno == null ? "" : r2(tot(rv) - peAno)])];
    const EV = eventosCalc(D);
    const ev = [["Lucro por evento " + G.ano], [], ["Pedido", "Cliente", "Data do evento", "Receita"].concat(EV.cats.map((k) => CUSTO_EV[k] || k), ["Total de custos", "Lucro", "Margem %", "Recebido", "Em aberto", "Custos revisados"])]
      .concat(EV.lista.map((e) => [String(e.numero_pedido), e.cliente_nome, dataPlan(String(e.data_evento || "").slice(0, 10)), r2(e.receita)].concat(EV.cats.map((k) => r2(-(e.custos[k] || 0))), [r2(-e.totalCustos), r2(e.lucro), e.margem == null ? "" : r2(e.margem) + "%", r2(e.recebido), r2(e.em_aberto), e.custos_revisados ? "Sim" : "Não"])));
    exportar([
      { nome: "DRE mês a mês", linhas: dre, larguras: [40].concat(MESES.map(() => 13), [15, 10]), pct: colPct },
      { nome: "Ponto de equilíbrio", linhas: pe, larguras: [44].concat(MESES.map(() => 13), [15]) },
      { nome: "Lucro por evento", linhas: ev, larguras: [10, 30, 13, 14].concat(EV.cats.map(() => 13), [15, 14, 10, 14, 14, 10]) },
      { nome: "Lançamentos " + G.ano, linhas: lanc }
    ], "Painel gerencial " + G.ano);
  }

  // ---------------------------------------------------------------- eventos
  function ligar(raiz, D) {
    const box = raiz.querySelector(".gr");
    box.querySelector("#grAno").addEventListener("change", (e) => { G.ano = Number(e.target.value); render(C); });
    box.querySelector("#grMes").addEventListener("change", (e) => { G.mes = Number(e.target.value); render(C, true); });
    box.querySelector("#grExcel").addEventListener("click", () => exportarTudo(D));
    box.querySelector("#grImprimir").addEventListener("click", () => { G.abertos.add("*"); render(C, true).then(() => setTimeout(() => window.print(), 60)); });
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-gr-base],[data-gr-abrir],[data-gr-ver],[data-gr-evmes],[data-gr-evordem],[data-gr-ir],[data-gr-plano]"); if (!b) return;
      const manter = () => { const y = window.scrollY; render(C, true).then(() => window.scrollTo(0, y)); };
      if (b.dataset.grBase) { G.base = b.dataset.grBase; manter(); return; }
      if (b.dataset.grEvmes) { G.evMes = b.dataset.grEvmes === "1"; manter(); return; }
      if (b.dataset.grEvordem) { G.evOrdem = b.dataset.grEvordem; manter(); return; }
      if (b.dataset.grIr) { C.irPara?.(b.dataset.grIr); return; }
      if (b.hasAttribute("data-gr-plano")) { C.irPara?.("plano"); return; }
      if (b.dataset.grAbrir) {
        const k = b.dataset.grAbrir;
        if (k === "*") { if (G.abertos.has("*")) G.abertos.clear(); else G.abertos.add("*"); }
        else if (G.abertos.has("*")) { G.abertos.delete("*"); [D.rec, D.imp, D.cus].concat(D.des).filter(Boolean).forEach((g) => { if (g.chave !== k) G.abertos.add(g.chave); }); }
        else if (G.abertos.has(k)) G.abertos.delete(k); else G.abertos.add(k);
        manter(); return;
      }
      if (b.dataset.grVer) abrirDetalhe(b.dataset.grVer, D);
    });
  }

  window.FinanceiroGerencial = { render, naturezaDe };
})();
