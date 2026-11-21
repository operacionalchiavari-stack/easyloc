/* =====================================================
   PÓS-VENDA › PAINEL (15/11/2026)
   Visão gerencial do pós-venda no lugar da antiga aba Conversas. Mesmo desenho da Produtividade comercial:
   cada assunto numa faixa, com a tabela à esquerda e o gráfico à direita; clicar numa linha abre um card lateral
   com os registros que formam aquele número. Dados: RPC posvenda_painel(p_empresa, p_de, p_ate).
===================================================== */
(function () {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const dataBr = (v) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "-");
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const iniciais = (n) => String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "?";
  const SETOR = { triagem: "Triagem", carregamento: "Carregamento", montagem: "Montagem" };
  const ETAPA = { carregamento: "Carregamento", montagem: "Montagem", desmontagem: "Desmontagem", descarregamento: "Descarregamento" };
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const P = { sb: null, emp: null, host: null, dados: null, de: "", ate: "", grupos: {} };

  const hojeIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  function foto(nome, id, fotoUrl) {
    let url = fotoUrl || "";
    if (!url && id) { try { url = P.sb.storage.from("avatares").getPublicUrl(P.emp + "/" + id + ".jpg").data?.publicUrl || ""; } catch (_) {} }
    return '<span class="pp-foto"><i>' + esc(iniciais(nome)) + "</i>" + (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>";
  }
  const pessoa = (nome, id, fotoUrl, sub) => '<span class="pp-pessoa">' + foto(nome, id, fotoUrl) + "<span><b>" + esc(nome) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span></span>";

  // ------------------------------------------------------------ gráficos (SVG simples, sem biblioteca)
  function rosca(fatias, centro, rotulo) {
    const total = fatias.reduce((s, f) => s + f.v, 0);
    let acc = 0;
    const partes = total ? fatias.filter((f) => f.v).map((f) => { const a = (acc / total) * 360, b = ((acc += f.v) / total) * 360; return f.cor + " " + a + "deg " + b + "deg"; }).join(",") : "#eef1f4 0 360deg";
    return '<div class="pp-rosca-wrap"><div class="pp-rosca" style="background:conic-gradient(' + partes + ')" role="img" aria-label="' + esc(rotulo) + '"><span><b>' + esc(centro) + "</b><small>" + esc(rotulo) + "</small></span></div>" +
      '<ul class="pp-legenda">' + fatias.map((f) => '<li><i style="background:' + f.cor + '"></i>' + esc(f.nome) + "<b>" + f.v + "</b><small>" + pct(f.v, total) + "%</small></li>").join("") + "</ul></div>";
  }
  // barras horizontais; series = [{nome, cor}], itens = [{rotulo, valores:[...]}]
  function barras(itens, series, sufixo) {
    const max = Math.max(1, ...itens.flatMap((i) => i.valores));
    return '<div class="pp-barras">' + (series.length > 1 ? '<ul class="pp-legenda pp-legenda-linha">' + series.map((s) => '<li><i style="background:' + s.cor + '"></i>' + esc(s.nome) + "</li>").join("") + "</ul>" : "") +
      itens.map((i) => '<div class="pp-barra-linha"><span class="pp-barra-rot" title="' + esc(i.rotulo) + '">' + esc(i.rotulo) + '</span><span class="pp-barra-trilhos">' +
        i.valores.map((v, k) => '<span class="pp-barra-trilho"><span class="pp-barra" style="width:' + Math.max(v ? 2 : 0, (v / max) * 100) + "%;background:" + series[k].cor + '"></span><b>' + v + (sufixo || "") + "</b></span>").join("") +
        "</span></div>").join("") + "</div>";
  }

  function secao(id, titulo, ajuda, tabela, grafico) {
    return '<section class="pp-secao" data-secao="' + id + '"><header><h3>' + esc(titulo) + "</h3>" + (ajuda ? "<p>" + esc(ajuda) + "</p>" : "") + '</header><div class="pp-secao-grade"><div class="pp-tab">' + tabela + '</div><div class="pp-graf">' + grafico + "</div></div></section>";
  }
  const vazio = (t) => '<p class="pp-vazio">' + esc(t) + "</p>";
  // linha clicável que abre o card lateral com os registros do grupo
  function linha(grupo, cels) { const k = "g" + Object.keys(P.grupos).length; P.grupos[k] = grupo; return '<tr data-pp-grupo="' + k + '" tabindex="0" title="Ver os registros">' + cels + "</tr>"; }

  // ------------------------------------------------------------ cálculos
  function respostasDe(c) { return (Array.isArray(c.respostas) ? c.respostas : []).filter((r) => r.respostas?.length); }
  const temReclamacao = (c) => c.status === "concluido" && (c.atencao || respostasDe(c).some((r) => r.ruim));

  function montar() {
    const d = P.dados, contatos = d.contatos || [], equipe = d.equipe || [];
    P.grupos = {};
    const feitas = contatos.filter((c) => c.status === "concluido"), semContato = contatos.filter((c) => c.status === "sem_contato"), naoLigar = contatos.filter((c) => c.status === "dispensado");
    const recl = feitas.filter(temReclamacao), bem = feitas.filter((c) => !temReclamacao(c));
    const comRet = recl.filter((c) => c.tratativa_concluida_em), semRet = recl.filter((c) => !c.tratativa_concluida_em);
    const diasRet = comRet.map((c) => (new Date(c.tratativa_concluida_em) - new Date(c.concluido_em)) / 86400000).filter((x) => x >= 0);
    const mediaRet = diasRet.length ? (diasRet.reduce((a, b) => a + b, 0) / diasRet.length) : null;
    const noPrazo = feitas.filter((c) => c.prazo && String(c.concluido_em || "").slice(0, 10) <= c.prazo).length;
    let html = "";

    // 1) Resumo
    const resumo = '<table class="pp-tabela"><tbody>' +
      linha({ titulo: "Ligações realizadas", lista: feitas }, "<th>Ligações realizadas (cliente atendeu)</th><td class='num'>" + feitas.length + "</td>") +
      linha({ titulo: "Clientes satisfeitos", lista: bem }, "<th>Tudo bem</th><td class='num ok'>" + bem.length + " <small>" + pct(bem.length, feitas.length) + "%</small></td>") +
      linha({ titulo: "Com reclamação", lista: recl }, "<th>Com reclamação</th><td class='num ruim'>" + recl.length + " <small>" + pct(recl.length, feitas.length) + "%</small></td>") +
      linha({ titulo: "Sem contato", lista: semContato }, "<th>Sem contato (não atendeu)</th><td class='num'>" + semContato.length + "</td>") +
      linha({ titulo: "Não ligar", lista: naoLigar }, "<th>Marcadas como não ligar</th><td class='num'>" + naoLigar.length + "</td>") +
      "<tr><th>Feitas dentro do prazo</th><td class='num'>" + noPrazo + " <small>" + pct(noPrazo, feitas.length) + "%</small></td></tr>" +
      linha({ titulo: "Retornos ainda pendentes", lista: semRet }, "<th>Reclamações aguardando retorno</th><td class='num " + (semRet.length ? "ruim" : "") + "'>" + semRet.length + "</td>") +
      "<tr><th>Tempo médio do retorno ao cliente</th><td class='num'>" + (mediaRet == null ? "—" : (mediaRet < 1 ? "menos de 1 dia" : mediaRet.toFixed(1).replace(".", ",") + " dias")) + "</td></tr>" +
      "<tr><th>Fila de hoje (a ligar · atrasadas)</th><td class='num'>" + (d.pendentes?.total || 0) + " · <span class='" + ((d.pendentes?.atrasadas || 0) ? "ruim" : "") + "'>" + (d.pendentes?.atrasadas || 0) + "</span></td></tr>" +
      "</tbody></table>";
    html += secao("resumo", "Resumo do período", "", resumo,
      rosca([{ nome: "Tudo bem", v: bem.length, cor: "#13784f" }, { nome: "Com reclamação", v: recl.length, cor: "#b42318" }, { nome: "Sem contato", v: semContato.length, cor: "#9aa3ad" }, { nome: "Não ligar", v: naoLigar.length, cor: "#d7dde4" }],
        pct(bem.length, feitas.length) + "%", "satisfeitos"));

    // 2) Equipe: elogios e negativos
    const porPessoa = new Map();
    equipe.forEach((f) => {
      const k = f.funcionario_id || f.free_id || f.nome;
      if (!porPessoa.has(k)) porPessoa.set(k, { nome: f.nome, id: f.funcionario_id, foto: f.free_foto, sub: f.free_id ? "Freelancer" : (f.setor || ""), elogios: [], negativos: [] });
      porPessoa.get(k)[f.tipo === "elogio" ? "elogios" : "negativos"].push(f);
    });
    const pessoas = [...porPessoa.values()].sort((a, b) => b.elogios.length - a.elogios.length || a.negativos.length - b.negativos.length);
    html += secao("equipe", "Equipe: elogios e feedbacks negativos", "Marcados na ligação, na aba Equipe, para cada pessoa que trabalhou no evento.",
      pessoas.length ? '<table class="pp-tabela"><thead><tr><th>Pessoa</th><th class="num">Elogios</th><th class="num">Negativos</th><th class="num">Saldo</th></tr></thead><tbody>' +
        pessoas.map((p) => linha({ titulo: p.nome, equipe: [...p.elogios, ...p.negativos] }, "<td>" + pessoa(p.nome, p.id, p.foto, p.sub) + "</td><td class='num ok'>" + p.elogios.length + "</td><td class='num ruim'>" + p.negativos.length + "</td><td class='num " + (p.elogios.length - p.negativos.length < 0 ? "ruim" : "") + "'>" + (p.elogios.length - p.negativos.length > 0 ? "+" : "") + (p.elogios.length - p.negativos.length) + "</td>")).join("") + "</tbody></table>"
        : vazio("Nenhum elogio ou feedback negativo marcado para a equipe no período."),
      pessoas.length ? barras(pessoas.slice(0, 10).map((p) => ({ rotulo: p.nome, valores: [p.elogios.length, p.negativos.length] })), [{ nome: "Elogios", cor: "#13784f" }, { nome: "Negativos", cor: "#b42318" }]) : "");

    // 3) Respostas por pergunta
    const perguntas = (d.config?.perguntas || []), cats = d.config?.categorias || [];
    const porPerg = perguntas.map((p) => {
      const lista = feitas.filter((c) => respostasDe(c).some((r) => r.pergunta === p.texto));
      const ruins = lista.filter((c) => respostasDe(c).some((r) => r.pergunta === p.texto && r.ruim));
      return { p, cat: cats.find((x) => x.id === p.categoria)?.nome || "", lista, ruins };
    }).filter((x) => x.lista.length);
    html += secao("perguntas", "Respostas por pergunta", "Quantas vezes cada pergunta foi respondida e quantas com uma opção marcada como ruim.",
      porPerg.length ? '<table class="pp-tabela"><thead><tr><th>Pergunta</th><th class="num">Respostas</th><th class="num">Ruins</th></tr></thead><tbody>' +
        porPerg.map((x) => linha({ titulo: x.p.texto, lista: x.ruins.length ? x.ruins : x.lista }, "<td><span class='pp-perg'>" + esc(x.p.texto) + "</span>" + (x.cat ? "<small>" + esc(x.cat) + "</small>" : "") + "</td><td class='num'>" + x.lista.length + "</td><td class='num " + (x.ruins.length ? "ruim" : "") + "'>" + x.ruins.length + " <small>" + pct(x.ruins.length, x.lista.length) + "%</small></td>")).join("") + "</tbody></table>"
        : vazio("Nenhuma resposta no período."),
      porPerg.length ? barras(porPerg.map((x) => ({ rotulo: x.p.texto.replace(/[?:\s]+$/, ""), valores: [pct(x.ruins.length, x.lista.length)] })), [{ nome: "% ruim", cor: "#b42318" }], "%") : "");

    // 4) Por vendedor
    const porVend = new Map();
    feitas.forEach((c) => {
      const v = (c.pedidos || []).map((p) => p.vendedor).find((x) => x?.nome); const k = v?.nome || "Sem vendedor";
      if (!porVend.has(k)) porVend.set(k, { nome: k, id: v?.usuario_id, lista: [], recl: [] });
      porVend.get(k).lista.push(c); if (temReclamacao(c)) porVend.get(k).recl.push(c);
    });
    const vends = [...porVend.values()].sort((a, b) => b.lista.length - a.lista.length);
    html += secao("vendedor", "Por quem vendeu", "Clientes ouvidos no pós-venda de cada vendedor e quantos reclamaram.",
      vends.length ? '<table class="pp-tabela"><thead><tr><th>Vendedor</th><th class="num">Ligações</th><th class="num">Reclamações</th></tr></thead><tbody>' +
        vends.map((v) => linha({ titulo: "Vendido por " + v.nome, lista: v.lista }, "<td>" + pessoa(v.nome, v.id) + "</td><td class='num'>" + v.lista.length + "</td><td class='num " + (v.recl.length ? "ruim" : "") + "'>" + v.recl.length + " <small>" + pct(v.recl.length, v.lista.length) + "%</small></td>")).join("") + "</tbody></table>"
        : vazio("Nenhuma ligação no período."),
      vends.length ? barras(vends.slice(0, 10).map((v) => ({ rotulo: v.nome, valores: [v.lista.length - v.recl.length, v.recl.length] })), [{ nome: "Tudo bem", cor: "#13784f" }, { nome: "Com reclamação", cor: "#b42318" }]) : "");

    // 5) Quem ligou
    const porQuem = new Map();
    contatos.forEach((c) => {
      const k = c.feito_por_nome || "Sem registro";
      if (!porQuem.has(k)) porQuem.set(k, { nome: k, id: c.feito_por, lista: [], feitas: 0, sem: 0, prazo: 0 });
      const q = porQuem.get(k); q.lista.push(c);
      if (c.status === "concluido") { q.feitas++; if (c.prazo && String(c.concluido_em || "").slice(0, 10) <= c.prazo) q.prazo++; }
      if (c.status === "sem_contato") q.sem++;
    });
    const quem = [...porQuem.values()].sort((a, b) => b.feitas - a.feitas);
    html += secao("quem", "Quem fez as ligações", "Ligações registradas por cada pessoa da equipe e quantas dentro do prazo.",
      quem.length ? '<table class="pp-tabela"><thead><tr><th>Pessoa</th><th class="num">Realizadas</th><th class="num">No prazo</th><th class="num">Sem contato</th></tr></thead><tbody>' +
        quem.map((q) => linha({ titulo: "Ligações de " + q.nome, lista: q.lista }, "<td>" + pessoa(q.nome, q.id) + "</td><td class='num'>" + q.feitas + "</td><td class='num'>" + q.prazo + " <small>" + pct(q.prazo, q.feitas) + "%</small></td><td class='num'>" + q.sem + "</td>")).join("") + "</tbody></table>"
        : vazio("Nenhuma ligação no período."),
      quem.length ? barras(quem.slice(0, 10).map((q) => ({ rotulo: q.nome, valores: [q.feitas] })), [{ nome: "Realizadas", cor: "#123f86" }]) : "");

    // 6) Observações para os setores
    const porSetor = Object.keys(SETOR).map((k) => ({ k, lista: feitas.filter((c) => (c.observacoes_setor || {})[k]) }));
    const totSetor = porSetor.reduce((s, x) => s + x.lista.length, 0);
    html += secao("setores", "Observações para os setores", "O que os clientes comentaram de Triagem, Carregamento e Montagem.",
      totSetor ? '<table class="pp-tabela"><thead><tr><th>Setor</th><th class="num">Observações</th><th>Última</th></tr></thead><tbody>' +
        porSetor.map((x) => linha({ titulo: "Observações para " + SETOR[x.k], lista: x.lista, setor: x.k }, "<td>" + SETOR[x.k] + "</td><td class='num'>" + x.lista.length + "</td><td><span class='pp-trecho'>" + (x.lista[0] ? "“" + esc(x.lista[0].observacoes_setor[x.k]) + "”" : "—") + "</span></td>")).join("") + "</tbody></table>"
        : vazio("Nenhuma observação para os setores no período."),
      totSetor ? barras(porSetor.map((x) => ({ rotulo: SETOR[x.k], valores: [x.lista.length] })), [{ nome: "Observações", cor: "#123f86" }]) : "");

    // 7) Mês a mês
    const porMes = new Map();
    feitas.forEach((c) => { const m = String(c.concluido_em || "").slice(0, 7); if (!m) return; if (!porMes.has(m)) porMes.set(m, { m, lista: [], recl: 0 }); porMes.get(m).lista.push(c); if (temReclamacao(c)) porMes.get(m).recl++; });
    const meses = [...porMes.values()].sort((a, b) => a.m.localeCompare(b.m));
    const nomeMes = (m) => MESES[Number(m.slice(5, 7)) - 1] + "/" + m.slice(2, 4);
    html += secao("meses", "Mês a mês", "",
      meses.length ? '<table class="pp-tabela"><thead><tr><th>Mês</th><th class="num">Ligações</th><th class="num">Com reclamação</th></tr></thead><tbody>' +
        meses.map((x) => linha({ titulo: nomeMes(x.m), lista: x.lista }, "<td>" + nomeMes(x.m) + "</td><td class='num'>" + x.lista.length + "</td><td class='num " + (x.recl ? "ruim" : "") + "'>" + x.recl + " <small>" + pct(x.recl, x.lista.length) + "%</small></td>")).join("") + "</tbody></table>"
        : vazio("Nenhuma ligação no período."),
      meses.length ? barras(meses.map((x) => ({ rotulo: nomeMes(x.m), valores: [x.lista.length - x.recl, x.recl] })), [{ nome: "Tudo bem", cor: "#13784f" }, { nome: "Com reclamação", cor: "#b42318" }]) : "");

    P.host.querySelector(".pp-conteudo").innerHTML = html;
  }

  // ------------------------------------------------------------ card lateral com os registros de um número
  function gaveta(g) {
    let el = document.getElementById("ppGaveta");
    if (!el) {
      el = document.createElement("div"); el.id = "ppGaveta"; el.className = "pv-lateral"; el.setAttribute("aria-hidden", "true"); el.inert = true;
      el.innerHTML = '<div class="pv-lateral-fundo" data-pp-fechar></div><aside class="pv-lateral-painel" role="dialog" aria-modal="true" aria-labelledby="ppGavTit"><header><div id="ppGavTit"></div><button type="button" class="pv-lateral-x" data-pp-fechar aria-label="Fechar">×</button></header><div class="pv-lateral-corpo"></div></aside>';
      document.body.append(el);
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-pp-fechar]")) return fechar();
        const c = e.target.closest("[data-pp-ligacao]"); if (c) { fechar(); window.PosvendaAbrirLigacao?.(P.dados.contatos.find((x) => x.id === c.dataset.ppLigacao)); }
      });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && el.classList.contains("aberta")) fechar(); });
    }
    const n = g.equipe ? g.equipe.length : (g.lista || []).length;
    el.querySelector("#ppGavTit").innerHTML = '<div class="pp-gav-tit"><b>' + esc(g.titulo) + "</b><small>" + n + " registro(s) · " + dataBr(P.de) + " a " + dataBr(P.ate) + "</small></div>";
    el.querySelector(".pv-lateral-corpo").innerHTML = g.equipe
      ? (n ? '<ul class="pp-gav-lista">' + g.equipe.sort((a, b) => String(b.em).localeCompare(String(a.em))).map((f) => '<li><span class="pp-tag ' + (f.tipo === "elogio" ? "ok" : "ruim") + '">' + (f.tipo === "elogio" ? "👍 Elogio" : "👎 Negativo") + "</span><div><b>Pedido " + esc(f.pedido) + " · " + esc(f.cliente || "") + "</b><small>" + (ETAPA[f.etapa] || f.etapa) + " · marcado por " + esc(f.por || "—") + " em " + dataBr(f.em) + "</small></div></li>").join("") + "</ul>" : vazio("Nada no período."))
      : (n ? '<ul class="pp-gav-lista">' + g.lista.map((c) => {
          const r = respostasDe(c).find((x) => x.ruim) || respostasDe(c)[0];
          const txt = g.setor ? "“" + (c.observacoes_setor || {})[g.setor] + "”" : r ? String(r.pergunta || "").replace(/[?:\s]+$/, "") + ": " + r.respostas.join(", ") : (c.motivo || c.observacao || "");
          const tag = c.status === "sem_contato" ? '<span class="pp-tag">Sem contato</span>' : c.status === "dispensado" ? '<span class="pp-tag">Não ligar</span>' : temReclamacao(c) ? '<span class="pp-tag ruim">Reclamação</span>' : '<span class="pp-tag ok">Tudo bem</span>';
          return '<li class="pp-gav-lig" data-pp-ligacao="' + c.id + '" tabindex="0">' + tag + "<div><b>" + esc(c.cliente_nome || "") + "</b><small>" + (c.pedidos || []).map((p) => "Pedido " + esc(p.numero)).join(", ") + " · " + dataBr(c.concluido_em || c.ultima_tentativa_em) + (c.feito_por_nome ? " · " + esc(c.feito_por_nome) : "") + "</small>" + (txt ? '<span class="pp-gav-txt' + (r?.ruim && !g.setor ? " ruim" : "") + '">' + esc(txt) + "</span>" : "") + "</div></li>";
        }).join("") + "</ul>" : vazio("Nada no período."));
    el.removeAttribute("aria-hidden"); el.inert = false; el.classList.add("aberta"); el.querySelector(".pv-lateral-x").focus();
    function fechar() { el.classList.remove("aberta"); el.setAttribute("aria-hidden", "true"); el.inert = true; }
  }

  async function carregar() {
    const c = P.host.querySelector(".pp-conteudo");
    c.innerHTML = '<p class="pp-vazio">Carregando…</p>';
    try {
      const { data, error } = await P.sb.rpc("posvenda_painel", { p_empresa: P.emp, p_de: P.de, p_ate: P.ate });
      if (error) throw new Error(error.message);
      P.dados = data || {}; montar();
    } catch (e) { c.innerHTML = '<p class="pp-vazio">Não foi possível carregar o painel: ' + esc(e.message || e) + "</p>"; }
  }

  function mostrar({ sb, emp, host, filtros }) {
    P.sb = sb; P.emp = emp; P.host = host;
    if (!P.de) { P.ate = hojeIso(); P.de = somaDias(P.ate, -89); }
    if (!host.dataset.pronto) {
      host.dataset.pronto = "1";
      host.innerHTML = '<div class="pp-conteudo"></div>';
      filtros.innerHTML = '<label>De <input type="date" id="ppDe"></label><label>Até <input type="date" id="ppAte"></label>';
      filtros.querySelector("#ppDe").value = P.de; filtros.querySelector("#ppAte").value = P.ate;
      filtros.addEventListener("change", () => {
        const de = filtros.querySelector("#ppDe").value, ate = filtros.querySelector("#ppAte").value;
        if (!de || !ate || ate < de) return; P.de = de; P.ate = ate; carregar();
      });
      host.addEventListener("click", (e) => { const tr = e.target.closest("[data-pp-grupo]"); if (tr) gaveta(P.grupos[tr.dataset.ppGrupo]); });
      host.addEventListener("keydown", (e) => { const tr = e.target.closest("[data-pp-grupo]"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); gaveta(P.grupos[tr.dataset.ppGrupo]); } });
    }
    carregar();
  }
  window.PosvendaPainel = { mostrar };
})();
