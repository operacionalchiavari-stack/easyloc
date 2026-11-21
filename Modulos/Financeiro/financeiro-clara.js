/* =====================================================
   CLARA — assistente financeira da Conciliação (out/2026).
   Você envia o extrato (Excel, CSV, OFX ou PDF); a Edge Function financeiro-assistente lê o arquivo (aprende o
   formato de cada banco uma vez), as linhas entram em fin_extrato (fin_importar_extrato_lote) e cada uma ganha uma
   SUGESTÃO: baixa de título(s), transferência entre contas, lançamento com categoria e centro de custo, ou ignorar.
   A pessoa confere, muda o que quiser e confirma (fin_assist_aplicar). Correções viram regras (fin_assist_regras).
   Também: organizar a DRE (categoria + centro de custo) e conversar sobre o financeiro.
===================================================== */
(function () {
  "use strict";
  const NOME = "Clara";
  let C = null; // contexto vindo de financeiro.js
  const T = { linhas: [], filtro: "todas", sel: new Set(), edit: {}, busy: false, etapa: null, chat: [] };
  const $ = (id) => document.getElementById(id);

  async function clara(action, body) {
    const { data, error } = await C.S.sb.functions.invoke("financeiro-assistente", { body: { action, empresa_id: C.S.emp, ...body } });
    if (error) {
      let msg = error.message;
      try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (_) { /* sem corpo */ }
      throw new Error(msg || "A assistente não respondeu.");
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  // ---------------------------------------------------------------- leitura do arquivo no navegador
  function carregarXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      s.onload = ok; s.onerror = () => falha(new Error("Não foi possível carregar o leitor de Excel."));
      document.head.appendChild(s);
    });
  }
  function textoDoArquivo(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (_) { return new TextDecoder("windows-1252").decode(buf); }
  }
  function gradeCsv(txt) {
    const linhas = txt.replace(/^﻿/, "").split(/\r?\n/);
    const amostra = linhas.slice(0, 15).join("\n");
    const sep = [";", "\t", ","].map((s) => [s, (amostra.match(new RegExp(s === "\t" ? "\t" : "\\" + s, "g")) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
    return linhas.filter((l) => l.trim()).map((l) => {
      const out = []; let cur = "", aspas = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') { if (aspas && l[i + 1] === '"') { cur += '"'; i++; } else aspas = !aspas; }
        else if (ch === sep && !aspas) { out.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      out.push(cur.trim());
      return out;
    });
  }
  const isoLocal = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  async function gradeExcel(buf) {
    await carregarXlsx();
    const wb = window.XLSX.read(buf, { type: "array", cellDates: true });
    let melhor = [];
    wb.SheetNames.forEach((n) => {
      const g = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" });
      if (g.length > melhor.length) melhor = g;
    });
    return melhor.map((l) => l.map((c) => (c instanceof Date ? isoLocal(c) : typeof c === "number" ? c : String(c ?? ""))));
  }
  const base64 = (buf) => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

  async function prepararArquivo(f) {
    const nome = f.name || "extrato";
    const buf = await f.arrayBuffer();
    if (/\.pdf$/i.test(nome) || f.type === "application/pdf") {
      if (f.size > 10 * 1024 * 1024) throw new Error("PDF grande demais (até 10 MB).");
      return { nome, formato: "pdf", pdf_base64: base64(buf) };
    }
    if (/\.(xlsx|xls|xlsm|ods)$/i.test(nome)) return { nome, formato: "grade", grade: await gradeExcel(buf) };
    const txt = textoDoArquivo(buf);
    if (/<OFX>|<STMTTRN>/i.test(txt)) {
      const banco = (txt.match(/<ORG>([^<\r\n]+)/i) || [])[1] || "";
      return { nome, formato: "ofx", linhas: C.lerOfx(txt), banco };
    }
    return { nome, formato: "grade", grade: gradeCsv(txt) };
  }

  // ---------------------------------------------------------------- fluxo: enviar → ler → importar → organizar
  async function receberArquivo(f) {
    if (T.busy) return;
    const conta = C.S.concConta;
    if (!conta || conta === "todas") return C.avisar("Escolha a conta do extrato na lista à esquerda.", NOME);
    T.busy = true;
    try {
      etapa("ler", "Lendo o arquivo " + f.name + "…");
      const arquivo = await prepararArquivo(f);
      const lido = await clara("ler_extrato", { conta_id: conta, arquivo });
      etapa(null);
      const ok = await mostrarLeitura(lido);
      if (!ok) return;
      etapa("importar", "Importando " + lido.linhas.length + " lançamento(s)…");
      const r = lido.resumo || {};
      const imp = await C.rpc("fin_importar_extrato_lote", {
        p_empresa: C.S.emp, p_conta: conta,
        p_linhas: lido.linhas.map(({ ordem, ...x }) => x),
        p_lote: { arquivo: lido.arquivo, formato: lido.formato, banco: lido.banco, periodo_ini: r.periodo_ini, periodo_fim: r.periodo_fim, saldo_banco: r.saldo_banco, saldo_data: r.saldo_data },
      });
      if (!imp.novas) C.avisar("Esse extrato já tinha sido importado: nenhum lançamento novo.", NOME, "aviso");
      await organizarTudo(conta, false);
      T.selIniciada = false; T.sel = new Set(); // as prontas já vêm marcadas
    } catch (e) {
      console.error(e);
      C.avisar(e.message || String(e), NOME, "erro");
    } finally {
      T.busy = false; etapa(null);
      await recarregarTela();
    }
  }
  async function organizarTudo(conta, refazer) {
    etapa("organizar", "Organizando os lançamentos…");
    let r = await clara("organizar", { conta_id: conta, refazer: !!refazer }), feitas = r.total || 0, rodada = 1;
    while (r.restantes > 0 && r.total > 0 && rodada < 10) {
      rodada++;
      etapa("organizar", "Organizando os lançamentos (" + feitas + " prontos, faltam " + r.restantes + ")…");
      r = await clara("organizar", { conta_id: conta });
      feitas += r.total || 0;
    }
    return feitas;
  }
  function mostrarLeitura(lido) {
    const r = lido.resumo || {};
    // formato já conhecido: segue direto
    if (!lido.modelo_novo && lido.formato !== "pdf") return Promise.resolve(true);
    return new Promise((ok) => {
      let respondido = false;
      const fim = (v) => { if (respondido) return; respondido = true; C.fecharModal(); ok(v); };
      const amostra = lido.linhas.slice(0, 6);
      C.modal("Entendi o extrato",
        '<div class="cl-leitura"><div class="cl-av">C</div><div><p><b>' + C.esc(lido.banco || "Extrato") + "</b> · " + lido.linhas.length + " lançamento(s) de " + C.dataBr(r.periodo_ini) + " a " + C.dataBr(r.periodo_fim) + "</p>" +
        "<p>Entradas <b>" + C.brl(r.entradas) + "</b> · Saídas <b>" + C.brl(r.saidas) + "</b>" + (r.saldo_banco != null ? " · Saldo do banco em " + C.dataBr(r.saldo_data) + ": <b>" + C.brl(r.saldo_banco) + "</b>" : "") + "</p>" +
        '<small>É a primeira vez que vejo este formato' + (lido.formato === "pdf" ? " (PDF)" : "") + '. Confira se os lançamentos abaixo estão certos; depois eu leio os próximos sozinha.</small></div></div>' +
        '<table class="fin-tabela cl-amostra"><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>' +
        amostra.map((l) => "<tr><td>" + C.dataBr(l.data) + "</td><td>" + C.esc(l.descricao) + (l.contraparte ? "<small>" + C.esc(l.contraparte) + "</small>" : "") + '</td><td class="num">' + C.brl(l.valor) + "</td></tr>").join("") + "</tbody></table>",
        [{ rotulo: "Não está certo", classe: "claro", acao: () => fim(false) }, { rotulo: "Está certo, organizar", acao: () => fim(true) }]);
      $("finModal").addEventListener("close", () => fim(false), { once: true });
    });
  }
  function etapa(tipo, texto) {
    T.etapa = tipo ? { tipo, texto } : null;
    const el = $("clEtapa"); if (!el) return;
    el.hidden = !tipo;
    el.innerHTML = tipo ? '<span class="cl-giro"></span>' + C.esc(texto) : "";
    document.querySelector(".cl-drop")?.classList.toggle("is-ocupado", !!tipo);
  }
  // Bancos só desenha se ainda for a tela aberta: render/consultas terminam depois de um "await", e a pessoa pode ter
  // trocado de aba nesse meio tempo (antes o Bancos apagava a aba nova). Cada render ganha um número; um render antigo desiste.
  const naBancos = () => ["bancos", "contas", "conciliacao"].includes(C.S.aba);
  const valeAinda = (g) => g === T.ger && naBancos() && !!document.getElementById("finConteudo");
  async function recarregarTela() {
    try { await C.carregar(); } catch (e) { console.error(e); }
    if (["bancos", "contas", "conciliacao"].includes(C.S.aba)) render(C);
  }

  // ---------------------------------------------------------------- aba Bancos
  // Lista de contas à esquerda ("Todas as contas" + uma por banco + "Configurar contas"); para cada conta os modos
  // Conciliar (pendências, com a Clara) e Extrato (só conciliações finalizadas, igual ao banco). "Todas" = só extrato.
  const CONF = { alta: ["alta", "Pronta"], media: ["media", "Confira"], baixa: ["baixa", "Palpite"] };
  const TIPO = { baixar: "Baixa", transferencia: "Transferência", lancar: "Lançar", ignorar: "Ignorar", fatura: "Fatura do cartão", fechamento: "Fechamento de parceiro" };
  const sugestaoDe = (l) => T.edit[l.id] || l.sugestao || null;
  const nivel = (l) => { const s = sugestaoDe(l); return !s?.acao ? "sem" : (s.confianca || "baixa"); };
  const conciliada = (l) => l.baixa_id || l.transferencia_grupo || l.conciliado_em || l.ignorado;
  const isoHoje = () => isoLocal(new Date());
  const mesDe = (iso, delta = 0) => { const d = new Date(iso.slice(0, 8) + "01T12:00:00"); d.setMonth(d.getMonth() + delta); const ini = isoLocal(d); d.setMonth(d.getMonth() + 1); d.setDate(0); return [ini, isoLocal(d)]; };
  const diaAnterior = (iso, n = 1) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() - n); return isoLocal(d); };

  // (nov/2026, trazido da Tecnoweld) duas abas no topo da coluna das contas: Bancos | Cartões (cartões em financeiro-cartoes.js)
  const abasModo = () => '<div class="bk-modo-abas" role="tablist" aria-label="Bancos ou cartões">' + [["bancos", "Bancos"], ["cartoes", "Cartões"]].map(([k, t]) =>
    '<button type="button" role="tab" data-bk-modo="' + k + '" aria-selected="' + ((T.modo || "bancos") === k) + '" class="' + ((T.modo || "bancos") === k ? "ativa" : "") + '">' + t + "</button>").join("") + "</div>";
  async function render(ctx) {
    C = ctx;
    const S = C.S;
    if (T.modo === "cartoes" && window.FinanceiroCartoes) {
      T.ger = (T.ger || 0) + 1;
      $("finConteudo").innerHTML = '<div class="bk-layout"><nav class="bk-contas" aria-label="Cartões">' + abasModo() + window.FinanceiroCartoes.nav(C) + '</nav><div class="bk-main" id="bkMain"></div></div>';
      $("finConteudo").querySelectorAll("[data-bk-modo]").forEach((b) => b.addEventListener("click", () => { T.modo = b.dataset.bkModo; render(C); }));
      window.FinanceiroCartoes.ligarNav($("finConteudo"), () => render(C));
      await window.FinanceiroCartoes.main(C, $("bkMain"));
      return;
    }
    if (!S.contas.length) T.vista = "config";
    const g = T.ger = (T.ger || 0) + 1;
    let resumo = [];
    try { resumo = (await C.rpc("fin_bancos_resumo", { p_empresa: S.emp })) || []; } catch (e) { console.error(e); }
    if (!valeAinda(g)) return;
    T.resumo = resumo;
    const rs = (id) => resumo.find((r) => r.conta_id === id) || {};
    const totalPend = resumo.reduce((s, r) => s + Number(r.pendentes || 0), 0);
    S.bancosPend = totalPend; const cont = document.querySelector('[data-cont="bancos"]'); if (cont) cont.textContent = totalPend || "";
    const ativas = S.contas.filter((c) => c.ativo);
    if (!S.concConta || (S.concConta !== "todas" && !ativas.some((c) => c.id === S.concConta))) {
      const comPend = ativas.find((c) => Number(rs(c.id).pendentes) > 0);
      S.concConta = comPend ? comPend.id : "todas";
      T.vista = null;
    }
    if (!T.vista) T.vista = S.concConta === "todas" ? "extrato" : (Number(rs(S.concConta).pendentes) > 0 ? "conciliar" : "extrato");
    if (ehCaixa(S.concConta) && T.vista === "conciliar") T.vista = "extrato";
    const totalSaldo = resumo.reduce((s, r) => s + Number(r.saldo || 0), 0);
    const item = (id, nome, sub, saldo, pend, logo) => '<button type="button" class="bk-item' + (T.vista !== "config" && S.concConta === id ? " ativa" : "") + '" data-bk-conta="' + id + '">' + logo +
      '<span class="bk-item-txt"><span class="bk-item-nome">' + C.esc(nome) + (pend ? '<span class="bk-pend" title="Lançamentos a conciliar">' + pend + "</span>" : "") + "</span>" +
      (sub ? "<small>" + C.esc(sub) + "</small>" : "") + '<b class="bk-item-saldo">' + C.brl(saldo) + "</b></span></button>";
    // "Todas as contas": as fotos das contas sobrepostas
    const todasLogo = '<span class="bk-logos">' + ativas.slice(0, 3).map((c) => C.logoContaHtml(c, "mini")).join("") + "</span>";
    $("finConteudo").innerHTML = '<div class="bk-layout"><nav class="bk-contas" aria-label="Contas">' + abasModo() +
      item("todas", "Todas as contas", ativas.length + " conta(s) somadas", totalSaldo, totalPend, todasLogo) +
      '<div class="bk-sep"></div>' +
      ativas.map((c) => { const r = rs(c.id); return item(c.id, c.nome, c.tipo === "caixa" ? "Caixa físico · dinheiro" : [c.banco, r.ultima_data ? "extrato até " + C.dataBr(r.ultima_data) : "sem extrato ainda"].filter(Boolean).join(" · "), r.saldo, Number(r.pendentes) || 0, C.logoContaHtml(c)); }).join("") +
      '<div class="bk-sep"></div><button type="button" class="bk-item bk-config' + (T.vista === "config" ? " ativa" : "") + '" data-bk-config><span class="fin-logo-conta bk-engrenagem" aria-hidden="true">⚙</span><span class="bk-item-txt"><span class="bk-item-nome">Configurar contas</span><small>cadastro, foto, PIX, contas do pedido, transferências</small></span></button>' +
      '</nav><div class="bk-main" id="bkMain"></div></div>';
    $("finConteudo").querySelectorAll("[data-bk-conta]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.bkConta;
      if (id !== S.concConta) { T.edit = {}; T.sel = new Set(); T.selIniciada = false; T.filtro = "todas"; }
      S.concConta = id;
      T.vista = id === "todas" || ehCaixa(id) ? "extrato" : (T.vista === "extrato" ? "extrato" : "conciliar");
      render(C);
    }));
    $("finConteudo").querySelector("[data-bk-config]").addEventListener("click", () => { T.vista = "config"; render(C); });
    $("finConteudo").querySelectorAll("[data-bk-modo]").forEach((b) => b.addEventListener("click", () => { T.modo = b.dataset.bkModo; render(C); }));
    if (T.vista === "config") C.pintarContas($("bkMain"));
    else if (S.concConta === "todas" || T.vista === "extrato") await renderExtrato(g);
    else await renderConciliar(g);
  }

  function cabecalhoConta(pend) {
    const S = C.S, c = S.contas.find((x) => x.id === S.concConta);
    // sem título: a conta escolhida já está marcada na lista à esquerda (pedido do usuário)
    if (!c) return "";
    if (c.tipo === "caixa") return '<div class="bk-cab bk-cab-caixa"><span class="bk-caixa-txt">Caixa físico · dinheiro que entra e sai da empresa</span><span class="fin-esp"></span>' +
      '<button type="button" class="fin-btn verde" data-caixa-lancar="1">+ Entrada</button><button type="button" class="fin-btn verm" data-caixa-lancar="-1">− Saída</button></div>';
    return '<div class="bk-cab">' +
      ('<div class="bk-modos" role="tablist" aria-label="' + C.esc(c.nome) + '">' +
        '<button type="button" role="tab" data-bk-vista="conciliar" aria-selected="' + (T.vista === "conciliar") + '" class="' + (T.vista === "conciliar" ? "ativa" : "") + '">Conciliar' + (pend ? ' <span class="tab-badge">' + pend + "</span>" : "") + "</button>" +
        '<button type="button" role="tab" data-bk-vista="extrato" aria-selected="' + (T.vista === "extrato") + '" class="' + (T.vista === "extrato" ? "ativa" : "") + '">Extrato</button></div>') +
      '<span class="fin-esp"></span>' + (T.vista === "conciliar" ? '<button type="button" class="fin-btn claro" id="clRegras">Regras aprendidas</button>' : "") + "</div>";
  }
  function ligarCabecalho() {
    $("bkMain").querySelectorAll("[data-bk-vista]").forEach((b) => b.addEventListener("click", () => { T.vista = b.dataset.bkVista; render(C); }));
    $("bkMain").querySelectorAll("[data-caixa-lancar]").forEach((b) => b.addEventListener("click", () => lancarCaixa(Number(b.dataset.caixaLancar))));
    $("bkMain").querySelectorAll("[data-caixa-excluir]").forEach((b) => b.addEventListener("click", () => excluirCaixa(b.dataset.caixaExcluir)));
  }

  // ---------------------------------------------------------------- Extrato oficial
  async function renderExtrato(g = T.ger) {
    const S = C.S;
    if (!T.per) { const [a, b] = mesDe(isoHoje()); T.per = { ini: a, fim: b }; }
    const conta = S.concConta === "todas" ? null : S.concConta;
    const x = await C.rpc("fin_bancos_extrato", { p_empresa: S.emp, p_conta: conta, p_ini: T.per.ini, p_fim: T.per.fim });
    if (!valeAinda(g) || !$("bkMain")) return;
    const contas = x.contas || [], linhas = x.linhas || [];
    const nomeConta = (id) => contas.find((c) => c.id === id)?.nome || "";
    // saldo corrente de cada conta: o do banco quando a linha traz saldo; senão o anterior + o valor
    const corrente = {}; contas.forEach((c) => { corrente[c.id] = Number(c.saldo_antes) || 0; });
    const dias = [];
    linhas.forEach((l) => {
      corrente[l.conta_id] = l.saldo != null ? Number(l.saldo) : Math.round(((corrente[l.conta_id] || 0) + Number(l.valor)) * 100) / 100;
      l._saldo = corrente[l.conta_id];
      let d = dias[dias.length - 1];
      if (!d || d.data !== l.data) { d = { data: l.data, linhas: [] }; dias.push(d); }
      d.linhas.push(l);
      d.saldo = Object.values(corrente).reduce((s, v) => s + v, 0);
    });
    const antes = contas.reduce((s, c) => s + Number(c.saldo_antes || 0), 0), fim = contas.reduce((s, c) => s + Number(c.saldo_fim || 0), 0);
    const ent = linhas.filter((l) => l.valor > 0).reduce((s, l) => s + Number(l.valor), 0), sai = linhas.filter((l) => l.valor < 0).reduce((s, l) => s - Number(l.valor), 0);
    const todas = !conta, caixa = ehCaixa(conta), ncol = caixa ? 7 : 6;
    const conciliacaoTd = (l) => '<td class="bk-conc">' + (l.tipo ? C.esc(l.tipo === "ignorar" ? "Ignorado" : (l.resumo || TIPO[l.tipo] || l.tipo)) : '<span class="bk-sem">—</span>') + "</td>";
    const dreTd = (l) => dreCelula(l.dre || [], l.tipo);
    const diaTxt = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
    const atalhos = [["hoje", "Hoje"], ["7", "7 dias"], ["mes", "Este mês"], ["mespassado", "Mês passado"]];
    const pendConta = conta ? Number((T.resumo || []).find((r) => r.conta_id === conta)?.pendentes) || 0 : 0;
    $("bkMain").innerHTML = cabecalhoConta(pendConta) +
      '<div class="fin-barra-ferr bk-periodo"><label>De <input type="date" id="bkIni" value="' + T.per.ini + '"></label><label>Até <input type="date" id="bkFim" value="' + T.per.fim + '"></label>' +
      atalhos.map(([k, t]) => '<button type="button" class="fin-btn peq claro" data-bk-per="' + k + '">' + t + "</button>").join("") + "</div>" +
      (x.pendentes ? '<div class="cl-aviso"><span>Faltam ' + x.pendentes + " lançamento(s) para conciliar" + (todas ? " nas contas" : "") + ". Eles entram no extrato quando a conciliação do arquivo deles terminar.</span>" +
        (conta ? ' <button type="button" class="fin-btn peq" data-bk-ir="conciliar">Conciliar agora</button>' : "") + "</div>" : "") +
      '<div class="bk-resumo"><div><small>Saldo em ' + C.dataBr(diaAnterior(T.per.ini)) + "</small><b>" + C.brl(antes) + '</b></div><div><small>Entradas</small><b>' + C.brl(ent) + "</b></div><div><small>Saídas</small><b>" + C.brl(-sai) + "</b></div><div><small>Saldo em " + C.dataBr(T.per.fim) + "</small><b>" + C.brl(fim) + "</b></div></div>" +
      '<section class="fin-bloco bk-extrato">' + (linhas.length ? '<div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Descrição</th><th>Conciliação</th>' + (todas ? "<th>Conta</th>" : "") + '<th class="num">Entrada</th><th class="num">Saída</th>' + (todas ? "" : '<th class="num">Saldo</th>') + "<th>DRE</th>" + (caixa ? "<th></th>" : "") + "</tr></thead><tbody>" +
        dias.map((d) => '<tr class="bk-dia"><td colspan="' + (ncol - 2) + '">' + C.esc(diaTxt(d.data)) + '</td><td class="num" colspan="2">Saldo do dia <b>' + C.brl(d.saldo) + "</b></td></tr>" +
          d.linhas.map((l) => "<tr><td>" + C.esc(l.descricao || "-") + (l.contraparte ? " <small>" + C.esc(l.contraparte) + "</small>" : "") +
            "</td>" + conciliacaoTd(l) +
            (todas ? "<td>" + C.esc(nomeConta(l.conta_id)) + "</td>" : "") +
            '<td class="num">' + (l.valor > 0 ? C.brl(l.valor) : "") + '</td><td class="num">' + (l.valor < 0 ? C.brl(l.valor) : "") + "</td>" +
            (todas ? "" : '<td class="num">' + C.brl(l._saldo) + "</td>") + dreTd(l) +
            (caixa ? '<td class="num"><button type="button" class="fin-btn peq claro" data-caixa-excluir="' + l.id + '">Excluir</button></td>' : "") + "</tr>").join("")).join("") +
        "</tbody></table></div>" : '<div class="fin-vazio">' + (caixa ? "Nenhum lançamento no caixa neste período. Use + Entrada ou − Saída." : "Nenhuma conciliação finalizada neste período.") + "</div>") + "</section>";
    ligarCabecalho();
    $("bkMain").querySelectorAll("[data-bk-ir]").forEach((b) => b.addEventListener("click", () => { T.vista = "conciliar"; render(C); }));
    const mudar = () => { const ini = $("bkIni").value, fim2 = $("bkFim").value; if (ini && fim2 && ini <= fim2) { T.per = { ini, fim: fim2 }; renderExtrato(); } };
    $("bkIni").addEventListener("change", mudar); $("bkFim").addEventListener("change", mudar);
    $("bkMain").querySelectorAll("[data-bk-per]").forEach((b) => b.addEventListener("click", () => {
      const h = isoHoje(), k = b.dataset.bkPer;
      if (k === "hoje") T.per = { ini: h, fim: h };
      else if (k === "7") T.per = { ini: diaAnterior(h, 6), fim: h };
      else { const [a, z] = mesDe(h, k === "mespassado" ? -1 : 0); T.per = { ini: a, fim: z }; }
      renderExtrato();
    }));
  }

  // ---------------------------------------------------------------- Conciliar (uma conta)
  // ---- células iguais nas duas tabelas (Extrato e Conciliar): DRE = plano de contas · centro · competência
  const dataBr = (iso) => iso ? String(iso).slice(8, 10) + "/" + String(iso).slice(5, 7) + "/" + String(iso).slice(0, 4) : "";
  function dreCelula(itens, tipo) {
    if (tipo === "transferencia") return '<td class="bk-dre"><span class="bk-sem">Não entra na DRE</span></td>';
    if (!itens.length) return '<td class="bk-dre"><span class="bk-sem">—</span></td>';
    return '<td class="bk-dre">' + itens.map((x) => "<div><b>" + C.esc([x.codigo, x.categoria || "Sem categoria"].filter(Boolean).join(" ")) + "</b>" +
      (x.centro ? "<span>" + C.esc(x.centro) + "</span>" : "") + (x.competencia ? "<small>Competência " + dataBr(x.competencia) + "</small>" : "") + "</div>").join("") + "</td>";
  }
  // DRE de uma ação (sugestão da IA ainda não confirmada, ou já confirmada): lida dos títulos e da categoria escolhida
  function dreDaAcao(l, a) {
    if (!a || a.tipo === "ignorar" || a.tipo === "transferencia") return [];
    const cat = (id) => C.S.cats.find((x) => x.id === id), cc = (id) => C.S.ccs.find((x) => x.id === id);
    const item = (catId, ccId, comp) => { const c = cat(catId); return { codigo: c?.codigo || "", categoria: c?.nome || "", centro: cc(ccId)?.nome || "", competencia: comp }; };
    // sem categoria escolhida, o servidor lança em "Outras receitas/despesas" (fin_assist_aplicar)
    if (a.tipo === "lancar") return [item(a.categoria_id || C.S.cats.find((x) => x.chave === (Number(l.valor) > 0 ? "outras_receitas" : "outras_despesas"))?.id, a.centro_custo_id, l.data)];
    const vistos = new Set();
    return (a.titulos || []).map((t) => {
      const x = (t.tipo === "receber" ? C.S.receber : C.S.pagar).find((y) => y.id === t.id);
      if (!x) return null;
      const generica = !x.categoria_id || ["outras_receitas", "outras_despesas"].includes(cat(x.categoria_id)?.chave);
      return item(generica && a.categoria_id ? a.categoria_id : x.categoria_id, x.centro_custo_id || a.centro_custo_id, x.competencia || x.vencimento);
    }).filter((d) => { if (!d) return false; const k = JSON.stringify(d); if (vistos.has(k)) return false; vistos.add(k); return true; });
  }
  const contaNome = (id) => C.S.contas.find((c) => c.id === id)?.nome || "";
  const valoresTd = (v) => '<td class="num">' + (v > 0 ? C.brl(v) : "") + '</td><td class="num">' + (v < 0 ? C.brl(v) : "") + "</td>";
  const descTd = (l) => "<td>" + C.esc(l.descricao || "-") + (l.contraparte ? "<small>" + C.esc(l.contraparte) + "</small>" : "") + "</td>";
  const diaLinha = (data, n) => '<tr class="bk-dia"><td colspan="' + n + '">' + C.esc(new Date(data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })) + "</td></tr>";
  const porDia = (lista, n, html) => { let ult = null; return lista.map((l) => (l.data !== ult ? ((ult = l.data), diaLinha(l.data, n)) : "") + html(l)).join(""); };
  const CAB = '<th>Descrição</th><th>Conciliação</th><th>Conta</th><th class="num">Entrada</th><th class="num">Saída</th><th>DRE</th>';

  async function renderConciliar(g = T.ger) {
    const S = C.S;
    const [linhas, lotes] = await Promise.all([
      C.todos("fin_extrato", "*", (q) => q.eq("conta_id", S.concConta).order("data", { ascending: false })),
      S.sb.from("fin_extrato_lotes").select("*").eq("empresa_id", S.emp).eq("conta_id", S.concConta).order("created_at", { ascending: false }).limit(20).then((r) => r.data || []),
    ]);
    if (!valeAinda(g) || !$("bkMain")) return;
    T.linhas = linhas;
    const pend = linhas.filter((l) => !conciliada(l));
    const ids = new Set(pend.map((l) => l.id));
    T.sel = new Set([...T.sel].filter((id) => ids.has(id)));
    if (!T.selIniciada) { pend.filter((l) => nivel(l) === "alta").forEach((l) => T.sel.add(l.id)); T.selIniciada = true; }
    const cont = { todas: pend.length, alta: 0, media: 0, baixa: 0, sem: 0 };
    pend.forEach((l) => { cont[nivel(l)]++; });
    const semAnalise = pend.filter((l) => !l.sugestao && !T.edit[l.id]).length;
    const vis = pend.filter((l) => T.filtro === "todas" || nivel(l) === T.filtro || (T.filtro === "conferir" && ["media", "baixa"].includes(nivel(l))));
    const saldo = await saldoHtml(lotes);
    if (!valeAinda(g) || !$("bkMain")) return;
    const abertas = lotes.filter((l) => l.status === "aberto");
    const naAberta = (l) => abertas.some((a) => a.id === l.lote_id);
    const recentes = linhas.filter((l) => conciliada(l) && naAberta(l));
    const finalizadas = linhas.filter((l) => conciliada(l) && !naAberta(l)).slice(0, 60);
    $("bkMain").innerHTML = cabecalhoConta(pend.length) +
      // só a área de enviar o extrato (o texto de apresentação e o quadro "Conciliação em andamento" saíram a pedido)
      '<section class="cl-envio"><label class="cl-drop" id="clDrop"><input type="file" id="clArquivo" accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt,.ofx,.pdf" hidden><b>Arraste o extrato aqui</b><span>ou clique para escolher · Excel, CSV, OFX ou PDF</span></label>' +
      '<div id="clEtapa" class="cl-etapa" hidden></div></section>' +
      saldo +
      (semAnalise ? '<div class="cl-aviso">' + semAnalise + ' lançamento(s) ainda sem análise. <button type="button" class="fin-btn peq" id="clOrganizar">Organizar agora</button></div>' : "") +
      '<section class="fin-bloco cl-lista"><h3>Para conferir <small>' + pend.length + " lançamento(s)</small></h3>" +
      '<div class="cl-filtros">' + [["todas", "Todas", cont.todas], ["alta", "Prontas", cont.alta], ["conferir", "Confira", cont.media + cont.baixa], ["sem", "Sem sugestão", cont.sem]]
        .map(([k, t, n]) => '<button type="button" data-cl-filtro="' + k + '" class="' + (T.filtro === k ? "ativa " : "") + "f-" + k + '">' + t + " <b>" + n + "</b></button>").join("") +
      (pend.length ? '<span class="fin-esp"></span><button type="button" class="fin-btn peq claro" id="clRefazer">Organizar de novo</button>' : "") + "</div>" +
      (vis.length ? '<div class="fin-rolar"><table class="fin-tabela cl-tabela"><thead><tr><th class="cl-ck"><input type="checkbox" id="clTodas" aria-label="Selecionar todas"' + (vis.length && vis.every((l) => T.sel.has(l.id)) ? " checked" : "") + '></th>' + CAB + "<th></th></tr></thead><tbody>" +
        porDia(vis, 8, linhaHtml) + "</tbody></table></div>" : '<div class="fin-vazio">' + (pend.length ? "Nada neste filtro." : "Tudo conciliado nesta conta. Envie o próximo extrato quando quiser.") + "</div>") +
      "</section>" +
      '<div class="cl-barra" id="clBarra"></div>' +
      (recentes.length ? '<details class="fin-bloco cl-feitas" open><summary>Já reconhecidas nas conciliações em andamento <small>' + recentes.length + "</small></summary>" +
        '<div class="fin-rolar"><table class="fin-tabela cl-tabela"><thead><tr>' + CAB + "<th></th></tr></thead><tbody>" + porDia(recentes, 7, linhaFeita) + "</tbody></table></div></details>" : "") +
      (finalizadas.length ? '<details class="fin-bloco cl-feitas"><summary>Desfazer uma conciliação já finalizada</summary><p class="cl-dica">Desfazer uma linha reabre a conciliação do arquivo dela: as linhas saem do extrato até serem reconhecidas de novo.</p>' +
        '<div class="fin-rolar"><table class="fin-tabela cl-tabela"><thead><tr>' + CAB + "<th></th></tr></thead><tbody>" + porDia(finalizadas, 7, linhaFeita) + "</tbody></table></div></details>" : "");
    ligarCabecalho();
    pintarBarra();
    ligar();
    if (T.etapa) etapa(T.etapa.tipo, T.etapa.texto);
  }
  const linhaFeita = (l) => {
    const a = l.ignorado ? { tipo: "ignorar" } : l.conciliado_acao || (l.transferencia_grupo ? { tipo: "transferencia" } : null);
    return "<tr>" + descTd(l) + '<td class="bk-conc">' + (a ? C.esc(a.tipo === "ignorar" ? "Ignorado" : (a.resumo || TIPO[a.tipo] || "")) : '<span class="bk-sem">—</span>') + "</td>" +
      "<td>" + C.esc(contaNome(l.conta_id)) + "</td>" + valoresTd(Number(l.valor)) + dreCelula(dreDaAcao(l, a), a?.tipo) +
      '<td class="num"><button type="button" class="fin-btn peq claro" data-cl-desfazer="' + l.id + '">Desfazer</button></td></tr>';
  };

  function linhaHtml(l) {
    const s = sugestaoDe(l), n = nivel(l);
    const a = s?.acao;
    return '<tr class="cl-n-' + n + '"><td class="cl-ck"><input type="checkbox" data-cl-sel="' + l.id + '"' + (T.sel.has(l.id) ? " checked" : "") + (a ? "" : " disabled") + ' aria-label="Selecionar"></td>' +
      descTd(l) +
      '<td class="cl-sug bk-conc">' + (a ? '<div><span class="cl-tipo t-' + a.tipo + '">' + (TIPO[a.tipo] || a.tipo) + '</span> <span class="cl-conf c-' + n + '">' + (CONF[n]?.[1] || "") + (T.edit[l.id] ? " · alterada por você" : "") + "</span></div>" +
        '<div class="cl-res">' + C.esc(s.resumo || "") + "</div>" : '<div class="cl-res sem">' + (l.sugestao || T.edit[l.id] ? "Sem sugestão" : "Ainda não analisado") + "</div>") +
        (s?.motivo ? '<div class="cl-motivo">' + C.esc(s.motivo) + "</div>" : "") + "</td>" +
      "<td>" + C.esc(contaNome(l.conta_id)) + "</td>" + valoresTd(Number(l.valor)) + dreCelula(dreDaAcao(l, a), a?.tipo) +
      '<td class="num"><button type="button" class="fin-btn peq claro" data-cl-alterar="' + l.id + '">' + (a ? "Alterar" : "Escolher") + "</button></td></tr>";
  }

  async function saldoHtml(lotes) {
    const l = lotes.find((x) => x.saldo_banco != null);
    if (!l) return "";
    let sis = null;
    try { sis = await C.rpc("fin_saldo_em", { p_empresa: C.S.emp, p_conta: C.S.concConta, p_data: l.saldo_data }); } catch (_) { /* sem saldo */ }
    if (sis == null) return "";
    const dif = Math.round((Number(l.saldo_banco) - Number(sis)) * 100) / 100;
    const pend = T.linhas.filter((x) => !conciliada(x) && x.data <= l.saldo_data).length;
    const contaAtual = C.S.contas.find((c) => c.id === C.S.concConta);
    const dica = Math.abs(dif) < 0.01 ? "" : pend ? "Ainda há " + pend + " lançamento(s) até essa data para confirmar." :
      contaAtual && contaAtual.saldo_inicial_data > l.saldo_data ? "O saldo inicial desta conta começa em " + C.dataBr(contaAtual.saldo_inicial_data) + ": ajuste em Configurar contas." : "";
    return '<div class="cl-saldo ' + (Math.abs(dif) < 0.01 ? "ok" : "dif") + '"><div><small>Saldo no banco em ' + C.dataBr(l.saldo_data) + "</small><b>" + C.brl(l.saldo_banco) + "</b></div><div><small>Saldo no sistema na mesma data</small><b>" + C.brl(sis) + "</b></div><div class=\"cl-saldo-res\">" +
      (Math.abs(dif) < 0.01 ? "✓ Os saldos batem" : "<span>Diferença de " + C.brl(dif) + (dica ? "<small>" + C.esc(dica) + "</small>" : "") + '</span> <button type="button" class="fin-btn peq claro" id="clPorque">Por que não bate?</button>') + "</div></div>";
  }

  function pintarBarra() {
    const el = $("clBarra"); if (!el) return;
    const sel = T.linhas.filter((l) => T.sel.has(l.id) && !conciliada(l) && sugestaoDe(l)?.acao);
    if (!sel.length) { el.hidden = true; el.innerHTML = ""; return; }
    const ent = sel.filter((l) => l.valor > 0).reduce((s, l) => s + Number(l.valor), 0), sai = sel.filter((l) => l.valor < 0).reduce((s, l) => s - Number(l.valor), 0);
    el.hidden = false;
    el.innerHTML = "<span><b>" + sel.length + "</b> selecionada(s) · entradas " + C.brl(ent) + " · saídas " + C.brl(sai) + '</span><button type="button" class="fin-btn verde" id="clConfirmar">Confirmar selecionadas</button>';
    $("clConfirmar").addEventListener("click", confirmarSelecionadas);
  }

  function ligar() {
    const drop = $("clDrop"), inp = $("clArquivo");
    inp?.addEventListener("change", (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) receberArquivo(f); });
    drop?.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-sobre"); });
    drop?.addEventListener("dragleave", () => drop.classList.remove("is-sobre"));
    drop?.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-sobre"); const f = e.dataTransfer?.files?.[0]; if (f) receberArquivo(f); });
    $("clOrganizar")?.addEventListener("click", () => rodarOrganizar(false));
    $("clRefazer")?.addEventListener("click", async () => { if (await C.confirmar("A " + NOME + " vai analisar de novo todos os lançamentos pendentes desta conta (as sugestões que você alterou e ainda não confirmou se perdem).", "Organizar de novo")) { T.edit = {}; rodarOrganizar(true); } });
    $("clRegras")?.addEventListener("click", regras);
    $("clPorque")?.addEventListener("click", () => { perguntarNaAba("Por que o saldo do banco não bate com o do sistema nesta conta?"); });
    $("clTodas")?.addEventListener("change", (e) => {
      document.querySelectorAll("[data-cl-sel]:not(:disabled)").forEach((ck) => { ck.checked = e.target.checked; if (e.target.checked) T.sel.add(ck.dataset.clSel); else T.sel.delete(ck.dataset.clSel); });
      pintarBarra();
    });
    const raiz = $("bkMain");
    raiz.querySelectorAll("[data-cl-sel]").forEach((ck) => ck.addEventListener("change", () => { if (ck.checked) T.sel.add(ck.dataset.clSel); else T.sel.delete(ck.dataset.clSel); pintarBarra(); }));
    raiz.querySelectorAll("[data-cl-filtro]").forEach((b) => b.addEventListener("click", () => { T.filtro = b.dataset.clFiltro; render(C); }));
    raiz.querySelectorAll("[data-cl-alterar]").forEach((b) => b.addEventListener("click", () => alterar(b.dataset.clAlterar)));
    raiz.querySelectorAll("[data-cl-desfazer]").forEach((b) => b.addEventListener("click", () => desfazer(b.dataset.clDesfazer)));
  }

  async function rodarOrganizar(refazer) {
    if (T.busy) return;
    T.busy = true;
    try { await organizarTudo(C.S.concConta, refazer); T.selIniciada = false; T.sel = new Set(); }
    catch (e) { C.avisar(e.message, NOME, "erro"); }
    finally { T.busy = false; etapa(null); await recarregarTela(); }
  }

  async function confirmarSelecionadas() {
    const sel = T.linhas.filter((l) => T.sel.has(l.id) && !conciliada(l) && sugestaoDe(l)?.acao);
    if (!sel.length) return;
    const b = $("clConfirmar"); b.disabled = true;
    let ok = 0, fechadas = 0; const erros = [];
    for (let i = 0; i < sel.length; i++) {
      b.textContent = "Confirmando " + (i + 1) + " de " + sel.length + "…";
      const l = sel[i];
      try { const r = await C.rpc("fin_assist_aplicar", { p_empresa: C.S.emp, p_extrato: l.id, p_acao: { ...sugestaoDe(l).acao, resumo: sugestaoDe(l).resumo || "" } }); if (r?.conciliacao_finalizada) fechadas++; ok++; T.sel.delete(l.id); delete T.edit[l.id]; }
      catch (e) { erros.push(C.dataBr(l.data) + " " + (l.descricao || "") + " (" + C.brl(l.valor) + "): " + e.message); }
    }
    if (erros.length) C.avisar(ok + " lançamento(s) conciliado(s). Não foi possível em " + erros.length + ":\n" + erros.slice(0, 6).join("\n"), NOME, "aviso");
    else C.avisar(ok + " lançamento(s) conciliado(s)." + (fechadas ? " Conciliação finalizada: o extrato da conta foi atualizado." : ""), NOME, "sucesso");
    await recarregarTela();
  }

  async function desfazer(id) {
    if (!(await C.confirmar("Desfazer a conciliação deste lançamento? A baixa é estornada (e o lançamento criado por ela, cancelado) e a linha volta para conferir.", "Desfazer"))) return;
    try { await C.rpc("fin_assist_desfazer", { p_empresa: C.S.emp, p_extrato: id }); T.selIniciada = true; await recarregarTela(); }
    catch (e) { C.avisar(e.message, NOME, "erro"); }
  }

  // ---------------------------------------------------------------- alterar sugestão
  const palavras = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(" ").filter((p) => p.length >= 3);
  function candidatos(l, busca) {
    const v = Math.abs(Number(l.valor)), rec = l.sinal ? l.sinal > 0 : Number(l.valor) > 0;
    const lista = rec ? C.S.receber.filter((t) => ["aberto", "parcial"].includes(t.status)) : C.S.pagar.filter((t) => !t.fatura_id && !t.fechamento_parcela_id && !t.aguardando_fechamento && !["pago", "cancelado"].includes(t.status) && !(t.requer_aprovacao && t.aprovacao !== "aprovada"));
    const pl = new Set(palavras((l.descricao || "") + " " + (l.contraparte || "")));
    const b = palavras(busca);
    return lista.map((t) => {
      const nome = rec ? (t.cliente_nome || "") : (t.fornecedor_nome || "");
      const txt = nome + " " + (t.descricao || "") + " " + (t.pedido_numero ? "pedido " + t.pedido_numero : "");
      const pt = palavras(txt);
      const sim = pt.filter((p) => pl.has(p)).length;
      return { t, nome, txt, p: (Math.abs(Number(t.aberto) - v) < 0.01 ? 100 : 0) + sim * 15 - Math.min(40, Math.abs(Number(t.aberto) - v) / Math.max(v, 1) * 40) };
    }).filter((x) => !b.length || b.every((p) => palavras(x.txt).some((q) => q.startsWith(p)))).sort((a, b2) => b2.p - a.p).slice(0, 30);
  }

  function alterar(id) {
    const l = T.linhas.find((x) => x.id === id); if (!l) return;
    editorAcao(l, { titulo: "Alterar sugestão", botao: "Usar esta escolha", atual: sugestaoDe(l)?.acao, motivo: sugestaoDe(l)?.motivo,
      tipos: Number(l.valor) < 0 ? ["baixar", "fatura", "fechamento", "transferencia", "lancar", "ignorar"] : ["baixar", "transferencia", "lancar", "ignorar"],
      onOk: (acao, resumo) => { T.edit[l.id] = { acao, confianca: "alta", origem: "voce", resumo, motivo: "Escolhido por você." }; T.sel.add(l.id); C.fecharModal(); render(C); } });
  }

  // ---------------------------------------------------------------- caixa físico
  const ehCaixa = (id) => !!id && C.S.contas.some((c) => c.id === id && c.tipo === "caixa");
  function lancarCaixa(sinal) {
    const conta = C.S.concConta;
    const l = { id: "caixa", conta_id: conta, data: isoHoje(), valor: 0, descricao: "", contraparte: "", sinal };
    editorAcao(l, { titulo: sinal > 0 ? "Entrada no caixa" : "Saída do caixa", botao: sinal > 0 ? "Registrar entrada" : "Registrar saída", caixa: true,
      atual: { tipo: "baixar", titulos: [] }, tipos: ["baixar", "transferencia", "lancar"],
      onOk: async (acao, resumo) => {
        try {
          await C.rpc("fin_caixa_lancar", { p_empresa: C.S.emp, p_conta: conta, p_data: l.data, p_valor: l.valor, p_descricao: l.descricao, p_acao: { ...acao, resumo } });
          C.fecharModal(); C.avisar(sinal > 0 ? "Entrada registrada no caixa." : "Saída registrada no caixa.", "Caixa", "sucesso"); await recarregarTela();
        } catch (e) { C.erroModal(e.message); }
      } });
  }
  async function excluirCaixa(id) {
    if (!(await C.confirmar("Excluir este lançamento do caixa? O recebimento/pagamento (ou a transferência) que ele registrou é desfeito.", "Excluir"))) return;
    try { await C.rpc("fin_caixa_excluir", { p_empresa: C.S.emp, p_extrato: id }); C.avisar("Lançamento excluído.", "Caixa", "sucesso"); await recarregarTela(); }
    catch (e) { C.avisar(e.message, "Caixa", "erro"); }
  }

  function editorAcao(l, cfg) {
    const atual = cfg.atual || { tipo: "baixar", titulos: [] };
    const rec = cfg.caixa ? l.sinal > 0 : Number(l.valor) > 0;
    let v = Math.abs(Number(l.valor)), relistar = null;
    let tipo = atual.tipo;
    const marcados = new Map((atual.titulos || []).map((t) => [t.id, t.valor]));
    const tipoCat = rec ? "entrada" : "saida";
    const corpo = () => (cfg.caixa
      ? '<div class="fin-form cl-caixa-campos"><label>Data<input type="date" name="cx_data" value="' + l.data + '" max="' + isoHoje() + '"></label><label>Valor<input name="cx_valor" inputmode="decimal" placeholder="0,00"></label>' +
        '<label class="inteiro">Descrição<input name="cx_desc" placeholder="' + (rec ? "Ex.: recebido em dinheiro do cliente" : "Ex.: compra de material em dinheiro") + '"></label></div>' +
        '<p class="cl-dica">' + (rec ? "De onde veio esse dinheiro?" : "Para que foi esse dinheiro?") + "</p>"
      : '<div class="cl-alt-linha"><b>' + C.dataBr(l.data) + "</b> · " + C.esc(l.descricao || "") + (l.contraparte ? " · " + C.esc(l.contraparte) : "") + ' · <b class="' + (rec ? "pos" : "neg") + '">' + C.brl(l.valor) + "</b></div>" +
      (cfg.motivo ? '<p class="cl-alt-motivo"><span class="cl-av mini">C</span>' + C.esc(cfg.motivo) + "</p>" : "")) +
      '<div class="cl-alt-tipos">' + cfg.tipos.map((k) => '<button type="button" data-alt-tipo="' + k + '" class="' + (tipo === k ? "ativa" : "") + '">' + { baixar: rec ? "Recebimento de título" : "Pagamento de título", fatura: "Fatura do cartão", fechamento: "Fechamento de parceiro", transferencia: "Transferência entre contas", lancar: "Lançar (sem título)", ignorar: "Ignorar" }[k] + "</button>").join("") + "</div>" +
      '<div id="clAltCorpo"></div>';
    const pintarTipo = (raiz) => {
      const el = raiz.querySelector("#clAltCorpo");
      raiz.querySelectorAll("[data-alt-tipo]").forEach((b) => b.classList.toggle("ativa", b.dataset.altTipo === tipo));
      if (tipo === "baixar") {
        el.innerHTML = '<div class="fin-form"><label class="inteiro">Procurar título<input type="search" id="clAltBusca" placeholder="Nome, descrição ou nº do pedido"></label></div><div class="cl-alt-tit" id="clAltTit"></div>' +
          '<div class="fin-form" style="margin-top:10px"><label>Categoria (se o título não tiver)<select name="categoria_id">' + C.opcoesCats(tipoCat, atual.categoria_id) + '</select></label><label>Centro de custo<select name="centro_custo_id">' + C.opcoesCcs(atual.centro_custo_id) + "</select></label></div>";
        const listar = () => {
          const cs = candidatos(l, el.querySelector("#clAltBusca").value);
          el.querySelector("#clAltTit").innerHTML = cs.length ? cs.map((c) => '<label class="cl-alt-t"><input type="checkbox" data-tit="' + c.t.id + '"' + (marcados.has(c.t.id) ? " checked" : "") + '><span><b>' + C.esc(c.nome || c.t.descricao) + "</b><small>" + C.esc([c.t.descricao, c.t.pedido_numero ? "Pedido " + c.t.pedido_numero : "", "venc. " + C.dataBr(c.t.programado_para || c.t.vencimento)].filter(Boolean).join(" · ")) + "</small></span><span class=\"num\">em aberto " + C.brl(c.t.aberto) + '</span><input type="text" inputmode="decimal" class="cl-alt-v" data-tit-v="' + c.t.id + '" value="' + (marcados.has(c.t.id) ? String(marcados.get(c.t.id)).replace(".", ",") : "") + '" placeholder="valor"></label>').join("") : '<div class="fin-vazio">Nenhum título em aberto encontrado.</div>';
          el.querySelectorAll("[data-tit]").forEach((ck) => ck.addEventListener("change", () => {
            const t = (rec ? C.S.receber : C.S.pagar).find((x) => x.id === ck.dataset.tit);
            if (ck.checked) { const ja = [...marcados.values()].reduce((s, x) => s + (Number(x) || 0), 0); const val = Math.round(Math.min(Number(t.aberto), Math.max(v - ja, 0)) * 100) / 100; marcados.set(t.id, val); el.querySelector('[data-tit-v="' + t.id + '"]').value = String(val).replace(".", ","); }
            else { marcados.delete(t.id); el.querySelector('[data-tit-v="' + t.id + '"]').value = ""; }
          }));
          el.querySelectorAll("[data-tit-v]").forEach((inp) => inp.addEventListener("input", () => { const n = Number(String(inp.value).replace(/\./g, "").replace(",", ".")); if (n > 0) { marcados.set(inp.dataset.titV, n); el.querySelector('[data-tit="' + inp.dataset.titV + '"]').checked = true; } }));
        };
        el.querySelector("#clAltBusca").addEventListener("input", listar);
        relistar = listar;
        listar();
      } else if (tipo === "fatura") {
        relistar = null;
        // faturas com algo em aberto: o débito do banco paga todas as parcelas da fatura escolhida
        const fats = new Map();
        C.S.pagar.filter((x) => x.fatura_id && Number(x.aberto) > 0.005 && !["pago", "cancelado"].includes(x.status)).forEach((x) => {
          const f = fats.get(x.fatura_id) || { id: x.fatura_id, venc: x.vencimento, cartao: (C.S.cartoes || []).find((c) => c.id === x.cartao_id), aberto: 0, qtd: 0 };
          f.aberto = Math.round((f.aberto + Number(x.aberto)) * 100) / 100; f.qtd++; fats.set(x.fatura_id, f);
        });
        const lista = [...fats.values()].sort((a, b) => (Math.abs(a.aberto - v) < 0.01 ? 0 : 1) - (Math.abs(b.aberto - v) < 0.01 ? 0 : 1) || a.venc.localeCompare(b.venc));
        el.innerHTML = lista.length ? '<div class="cl-alt-tit">' + lista.map((f) => '<label class="cl-alt-t"><input type="radio" name="fatura_id" value="' + f.id + '"' + (atual.fatura_id === f.id || (!atual.fatura_id && Math.abs(f.aberto - v) < 0.01 && lista[0] === f) ? " checked" : "") + "><span><b>" +
            C.esc((f.cartao?.nome || "Cartão") + (f.cartao?.final ? " final " + f.cartao.final : "")) + "</b><small>vence " + C.dataBr(f.venc) + " · " + f.qtd + ' compra(s)</small></span><span class="num">' + C.brl(f.aberto) + (Math.abs(f.aberto - v) < 0.01 ? ' <small class="cl-bate">✓ bate</small>' : "") + "</span></label>").join("") + "</div>" +
            '<p class="cl-dica">Confirmar paga todas as compras em aberto da fatura escolhida. O valor precisa ser igual ao débito do extrato; se não for, confira a fatura em Bancos e cartões → Cartões.</p>'
          : '<div class="fin-vazio">Nenhuma fatura de cartão em aberto.</div>';
      } else if (tipo === "fechamento") {
        relistar = null;
        // parcelas de fechamento de parceiro com algo em aberto: o débito paga todas as contas da parcela escolhida
        const ps = new Map();
        C.S.pagar.filter((x) => x.fechamento_parcela_id && Number(x.aberto) > 0.005 && !["pago", "cancelado"].includes(x.status)).forEach((x) => {
          const fp = (C.S.fechParcelas || []).find((y) => y.id === x.fechamento_parcela_id) || {};
          const p = ps.get(x.fechamento_parcela_id) || { id: x.fechamento_parcela_id, venc: x.vencimento, nome: x.fornecedor_nome || "Parceiro", ref: fp.referencia || "", num: fp.numero, aberto: 0, qtd: 0 };
          p.aberto = Math.round((p.aberto + Number(x.aberto)) * 100) / 100; p.qtd++; ps.set(x.fechamento_parcela_id, p);
        });
        const lista = [...ps.values()].sort((a, b) => (Math.abs(a.aberto - v) < 0.01 ? 0 : 1) - (Math.abs(b.aberto - v) < 0.01 ? 0 : 1) || a.venc.localeCompare(b.venc));
        el.innerHTML = lista.length ? '<div class="cl-alt-tit">' + lista.map((p) => '<label class="cl-alt-t"><input type="radio" name="parcela_id" value="' + p.id + '"' + (atual.parcela_id === p.id || (!atual.parcela_id && Math.abs(p.aberto - v) < 0.01 && lista[0] === p) ? " checked" : "") + "><span><b>" +
            C.esc(p.nome) + "</b><small>" + C.esc(["Fechamento " + p.ref, p.num ? "parcela " + p.num : "", "vence " + C.dataBr(p.venc), p.qtd + " conta(s)"].filter(Boolean).join(" · ")) + '</small></span><span class="num">' + C.brl(p.aberto) + (Math.abs(p.aberto - v) < 0.01 ? ' <small class="cl-bate">✓ bate</small>' : "") + "</span></label>").join("") + "</div>" +
            '<p class="cl-dica">Confirmar paga todas as contas desta parcela do fechamento. O valor precisa ser igual ao débito do extrato.</p>'
          : '<div class="fin-vazio">Nenhum fechamento de parceiro em aberto.</div>';
      } else if (tipo === "transferencia") {
        relistar = null;
        el.innerHTML = '<div class="fin-form"><label class="inteiro">' + (rec ? "Veio da conta" : "Foi para a conta") + '<select name="conta_id">' + C.S.contas.filter((c) => c.id !== l.conta_id && c.ativo).map((c) => '<option value="' + c.id + '"' + (c.id === atual.conta_id ? " selected" : "") + ">" + C.esc(c.nome) + "</option>").join("") + '</select></label><label class="inteiro">Descrição<input name="descricao" value="' + C.esc(atual.descricao || "Transferência entre contas") + '"></label></div>';
      } else if (tipo === "lancar") {
        el.innerHTML = '<div class="fin-form"><label class="inteiro">Descrição<input name="descricao" value="' + C.esc(atual.descricao || l.descricao || "") + '"></label><label class="inteiro">' + (rec ? "Cliente / origem" : "Fornecedor / favorecido") + '<input name="nome" value="' + C.esc(atual.nome || l.contraparte || "") + '"></label>' +
          '<label>Categoria<select name="categoria_id">' + C.opcoesCats(tipoCat, atual.categoria_id) + '</select></label><label>Centro de custo<select name="centro_custo_id">' + C.opcoesCcs(atual.centro_custo_id) + '</select></label></div>' + (cfg.caixa ? "" : '<p class="cl-dica">A ' + NOME + " guarda esta escolha e usa nos próximos extratos com a mesma descrição.</p>");
      } else {
        relistar = null;
        el.innerHTML = '<p class="cl-dica">A linha sai da lista sem mexer em nenhum saldo (ex.: estorno que se anula, bloqueio judicial desfeito, linha informativa).</p>';
      }
    };
    C.modal(cfg.titulo, corpo(), [
      { rotulo: "Cancelar", classe: "claro", acao: C.fecharModal },
      { rotulo: cfg.botao, classe: cfg.caixa ? "verde" : "", acao: () => {
        const raiz = $("finModalCorpo"), d = C.campos(raiz);
        if (cfg.caixa) {
          if (!d.cx_data) return C.erroModal("Informe a data.");
          if (!(v > 0)) return C.erroModal("Informe o valor.");
          if (!String(d.cx_desc || "").trim()) return C.erroModal("Informe a descrição.");
        }
        let acao = null, resumo = "";
        if (tipo === "baixar") {
          const titulos = [...marcados.entries()].filter(([, val]) => Number(val) > 0).map(([idT, val]) => ({ tipo: rec ? "receber" : "pagar", id: idT, valor: Math.round(Number(val) * 100) / 100 }));
          if (!titulos.length) return C.erroModal("Marque o título que este lançamento " + (rec ? "recebe." : "paga."));
          const soma = titulos.reduce((s, t) => s + t.valor, 0);
          const dQue = cfg.caixa ? "do lançamento" : "do extrato";
          if (soma > v + 0.01) return C.erroModal("A soma (" + C.brl(soma) + ") passa do valor " + dQue + " (" + C.brl(v) + ").");
          if (titulos.length > 1 && Math.abs(soma - v) > 0.01) return C.erroModal("Com mais de um título, a soma precisa ser igual ao valor " + dQue + " (" + C.brl(v) + ").");
          acao = { tipo: "baixar", titulos, categoria_id: d.categoria_id || "", centro_custo_id: d.centro_custo_id || "" };
          resumo = titulos.map((t) => { const x = (rec ? C.S.receber : C.S.pagar).find((y) => y.id === t.id); return (rec ? "Recebimento · " : "Pagamento · ") + [rec ? x?.cliente_nome : x?.fornecedor_nome, x?.descricao, x?.pedido_numero ? "Pedido " + x.pedido_numero : ""].filter(Boolean).join(" · ") + " · " + C.brl(t.valor); }).join(" + ");
        } else if (tipo === "fatura") {
          const fid = raiz.querySelector("[name=fatura_id]:checked")?.value;
          if (!fid) return C.erroModal("Escolha a fatura.");
          const ps = C.S.pagar.filter((x) => x.fatura_id === fid && Number(x.aberto) > 0.005 && !["pago", "cancelado"].includes(x.status)), tot = Math.round(ps.reduce((s2, x) => s2 + Number(x.aberto), 0) * 100) / 100;
          if (Math.abs(tot - v) > 0.01) return C.erroModal("O que está em aberto nesta fatura (" + C.brl(tot) + ") não bate com o débito do extrato (" + C.brl(v) + "). Confira a fatura em Bancos e cartões → Cartões.");
          const cc = (C.S.cartoes || []).find((c) => c.id === ps[0]?.cartao_id);
          acao = { tipo: "fatura", fatura_id: fid };
          resumo = "Fatura do cartão " + (cc?.nome || "") + (cc?.final ? " final " + cc.final : "") + " · venc. " + C.dataBr(ps[0]?.vencimento) + " · " + ps.length + " compra(s)";
        } else if (tipo === "fechamento") {
          const pid = raiz.querySelector("[name=parcela_id]:checked")?.value;
          if (!pid) return C.erroModal("Escolha a parcela do fechamento.");
          const ps = C.S.pagar.filter((x) => x.fechamento_parcela_id === pid && Number(x.aberto) > 0.005 && !["pago", "cancelado"].includes(x.status)), tot = Math.round(ps.reduce((s2, x) => s2 + Number(x.aberto), 0) * 100) / 100;
          if (Math.abs(tot - v) > 0.01) return C.erroModal("O que está em aberto nesta parcela (" + C.brl(tot) + ") não bate com o débito do extrato (" + C.brl(v) + ").");
          const fp = (C.S.fechParcelas || []).find((y) => y.id === pid) || {};
          acao = { tipo: "fechamento", parcela_id: pid };
          resumo = "Fechamento " + (ps[0]?.fornecedor_nome || "") + " · " + (fp.referencia || "") + (fp.numero ? " · parcela " + fp.numero : "") + " · " + ps.length + " conta(s)";
        } else if (tipo === "transferencia") {
          if (!d.conta_id) return C.erroModal("Escolha a outra conta.");
          acao = { tipo: "transferencia", conta_id: d.conta_id, descricao: d.descricao || "" };
          resumo = "Transferência com " + (C.S.contas.find((c) => c.id === d.conta_id)?.nome || "");
        } else if (tipo === "lancar") {
          if (!d.categoria_id) return C.erroModal("Escolha a categoria (é ela que entra na DRE).");
          acao = { tipo: "lancar", descricao: d.descricao, nome: d.nome, categoria_id: d.categoria_id, centro_custo_id: d.centro_custo_id || "" };
          const ct = C.S.cats.find((c) => c.id === d.categoria_id), cc = C.S.ccs.find((c) => c.id === d.centro_custo_id);
          resumo = "Lançar · " + [ct ? (ct.codigo ? ct.codigo + " " : "") + ct.nome : "", cc?.nome, d.nome].filter(Boolean).join(" · ");
        } else { acao = { tipo: "ignorar" }; resumo = "Ignorar"; }
        return cfg.onOk(acao, resumo);
      } },
    ], (raiz) => {
      if (cfg.caixa) {
        const lerCx = () => {
          const n = Number(String(raiz.querySelector('[name="cx_valor"]').value || "").replace(/\./g, "").replace(",", ".")) || 0;
          v = Math.round(Math.abs(n) * 100) / 100; l.valor = l.sinal * v;
          l.data = raiz.querySelector('[name="cx_data"]').value; l.descricao = raiz.querySelector('[name="cx_desc"]').value.trim();
        };
        raiz.querySelectorAll("[name^='cx_']").forEach((i) => i.addEventListener("input", () => { lerCx(); if (relistar) relistar(); }));
      }
      raiz.querySelectorAll("[data-alt-tipo]").forEach((b) => b.addEventListener("click", () => { tipo = b.dataset.altTipo; pintarTipo(raiz); }));
      pintarTipo(raiz);
    });
    $("finModal").classList.add("cl-modal-largo");
    $("finModal").addEventListener("close", () => $("finModal").classList.remove("cl-modal-largo"), { once: true });
  }

  // ---------------------------------------------------------------- regras aprendidas
  async function regras() {
    const { data, error } = await C.S.sb.from("fin_assist_regras").select("*").eq("empresa_id", C.S.emp).order("ultimo_uso", { ascending: false });
    if (error) return C.avisar(error.message, NOME, "erro");
    const nomeCat = (id) => { const c = C.S.cats.find((x) => x.id === id); return c ? (c.codigo ? c.codigo + " " : "") + c.nome : ""; };
    C.modal("O que a " + NOME + " já aprendeu",
      (data?.length ? '<p class="cl-dica">Cada vez que você confirma um lançamento sem título, uma transferência ou um "ignorar", a ' + NOME + " guarda a regra e usa nos próximos extratos.</p><table class=\"fin-tabela\"><thead><tr><th>Quando aparecer</th><th>Faço</th><th></th></tr></thead><tbody>" +
        data.map((g) => "<tr><td><b>" + C.esc(g.chave) + "</b><small>" + (g.direcao === "entrada" ? "entrada" : "saída") + " · usada " + g.usos + "×" + (g.exemplo ? " · ex.: " + C.esc(g.exemplo) : "") + "</small></td><td>" +
          C.esc(g.acao === "lancar" ? "Lançar · " + [nomeCat(g.categoria_id), C.S.ccs.find((c) => c.id === g.centro_custo_id)?.nome, g.nome].filter(Boolean).join(" · ") : g.acao === "transferencia" ? "Transferência com " + (C.S.contas.find((c) => c.id === g.conta_destino)?.nome || "") : "Ignorar") +
          '</td><td class="num"><button type="button" class="fin-btn peq verm" data-regra-apagar="' + g.id + '">Esquecer</button></td></tr>').join("") + "</tbody></table>"
        : '<div class="fin-vazio">Ainda nenhuma regra. Elas aparecem conforme você confirma as conciliações.</div>'),
      [{ rotulo: "Fechar", classe: "claro", acao: C.fecharModal }],
      (raiz) => raiz.querySelectorAll("[data-regra-apagar]").forEach((b) => b.addEventListener("click", async () => {
        const r = await C.S.sb.from("fin_assist_regras").delete().eq("id", b.dataset.regraApagar).eq("empresa_id", C.S.emp);
        if (r.error) return C.erroModal(r.error.message);
        b.closest("tr").remove();
      })));
  }

  // ---------------------------------------------------------------- conversa (aba própria "Clara")
  // Mesmo desenho da conversa da Helena (catalogo-assistente.css): fundo creme, avatar dourado, saudação em serifa,
  // sugestões em pílulas, campo arredondado embaixo e, à direita, um painel branco — aqui o panorama do financeiro
  // (saldos por conta, conciliação, a receber e a pagar), em que cada item vira uma pergunta para a Clara.
  const SUGESTOES = ["Como está a saúde financeira da empresa?", "O caixa aguenta os próximos 90 dias?", "Quem devo cobrar primeiro?", "Quais eventos deram menos lucro?", "O que está pesando nas despesas?", "Por que o saldo não bate com o banco?"];
  const chaveChat = () => "clara_chat:" + (C?.S?.emp || "");
  function lerChat() { try { T.chat = JSON.parse(sessionStorage.getItem(chaveChat()) || "[]"); } catch (_) { T.chat = []; } }
  function guardarChat() { try { sessionStorage.setItem(chaveChat(), JSON.stringify(T.chat.slice(-30))); } catch (_) { try { sessionStorage.setItem(chaveChat(), JSON.stringify(T.chat.slice(-30).map(({ evidencias, ...m }) => m))); } catch (__) { /* sem armazenamento */ } } }
  // texto simples → HTML: **negrito**, listas com "-" ou "1." e quebras de linha
  function formatar(t) {
    // lista continua aberta em linha em branco; linha recuada logo depois de um item é continuação dele
    const linhas = C.esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split(/\n/);
    let html = "", lista = null, itemAberto = false;
    const fechaItem = () => { if (itemAberto) { html += "</li>"; itemAberto = false; } };
    const fecha = () => { fechaItem(); if (lista) { html += "</" + lista + ">"; lista = null; } };
    linhas.forEach((l) => {
      const ul = l.match(/^\s*[-•]\s+(.*)/), ol = l.match(/^\s*\d+[.)]\s+(.*)/);
      if (ul || ol) { const tag = ul ? "ul" : "ol"; fechaItem(); if (lista !== tag) { fecha(); html += "<" + tag + ">"; lista = tag; } html += "<li>" + (ul || ol)[1]; itemAberto = true; }
      else if (!l.trim()) { /* espaço entre itens não fecha a lista */ }
      else if (lista && itemAberto && /^\s+/.test(l)) html += "<br>" + l.trim();
      else { fecha(); html += "<p>" + l + "</p>"; }
    });
    fecha();
    return html;
  }
  function nomePessoa() {
    const n = (window.__CONTEXT?.usuario_nome || sessionStorage.getItem("usuario_nome") || "").trim();
    return n && !/^usu[aá]rio$/i.test(n) ? n.split(/\s+/)[0] : "";
  }
  async function renderChat(ctx) {
    C = ctx || C;
    lerChat();
    $("finConteudo").innerHTML = '<section class="ch-tela" aria-label="Conversa com a ' + NOME + '">' +
      '<div class="ch-conversa"><div class="ch-msgs" id="chMsgs"></div>' +
      '<form class="ch-form" id="chForm"><div class="ch-form-in"><textarea id="chTexto" rows="1" placeholder="Escreva sua pergunta…" aria-label="Mensagem para a ' + NOME + '"></textarea>' +
      '<button type="submit" class="ch-send" id="chEnviar" aria-label="Enviar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-4 16-4-6-8-2Z"/><path d="m12 14 8-10"/></svg></button></div>' +
      '<small class="ch-form-dica">Enter envia · Shift+Enter quebra a linha · a ' + NOME + " responde com os dados do sistema e não altera nada sozinha</small></form></div>" +
      '<aside class="ch-lado" id="chLado"></aside></section>';
    pintarMsgs();
    const tx = $("chTexto");
    const ajustar = () => { tx.style.height = "auto"; tx.style.height = Math.min(tx.scrollHeight, 160) + "px"; };
    tx.addEventListener("input", ajustar);
    tx.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("chForm").requestSubmit(); } });
    $("chForm").addEventListener("submit", (e) => { e.preventDefault(); const t = tx.value.trim(); if (!t || T.pensando) return; tx.value = ""; ajustar(); perguntar(t); });
    if (T.perguntaPendente) { const p = T.perguntaPendente; T.perguntaPendente = null; perguntar(p); } else tx.focus();
    pintarLado();
  }

  // (nov/2026, igual à Clara da Tecnoweld) À direita: PROVAS E RELATÓRIOS. Cada resposta da Clara pode trazer gráficos/tabelas
  // calculados no servidor com os números reais (a IA só escolhe quais mostrar). Sem resposta selecionada, o painel oferece
  // os relatórios prontos. "Gerar relatório" abre a pré-visualização em A4 (FinRelatorioA4) para imprimir ou salvar em PDF.
  const RELATORIOS = [
    ["Diagnóstico financeiro do mês", "Faça um diagnóstico financeiro completo da empresa como CFO: caixa e cobertura, resultado dos últimos meses, inadimplência, prazos de recebimento e pagamento, lucro dos eventos, dependência de clientes e o que eu deveria fazer agora. Traga as provas."],
    ["Projeção de caixa 90 dias", "Analise a projeção de caixa dos próximos 90 dias (real e com as pré-reservas). Quando o caixa aperta, qual o menor saldo e o que fazer antes disso? Traga as provas."],
    ["Inadimplência e prazos", "Analise a inadimplência por idade e os prazos médios de recebimento e pagamento (ciclo de caixa). Quem devo cobrar primeiro e quanto isso libera de caixa? Traga as provas."],
    ["Lucro dos eventos", "Analise o lucro por evento (receita x custos lançados). Onde estamos perdendo margem e o que pode estar causando? Traga as provas."],
    ["Para onde vai o dinheiro", "Analise as despesas dos últimos 90 dias por categoria e as despesas fixas. O que está pesando, o que é anormal e onde dá para economizar? Traga as provas."],
    ["Dependência de clientes", "Analise a concentração de faturamento por cliente (decorador) nos últimos 12 meses. Qual o risco e como reduzir essa dependência? Traga as provas."],
  ];
  const COR = ["#2a78d6", "#eb6834", "#1baf7a"]; // paleta categórica validada (slots 1–3)
  const fmtV = (v, u) => v == null || v === "" ? "—" : u === "brl" ? C.brl(v) : u === "pct" ? Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : u === "pp" ? (v > 0 ? "+" : "") + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " p.p." : u === "dias" ? v + " dias" : u === "meses" ? Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " meses" : typeof v === "number" ? v.toLocaleString("pt-BR") : C.esc(v);
  const curto = (v) => { const a = Math.abs(Number(v) || 0), s = v < 0 ? "-" : ""; return s + (a >= 1e6 ? (a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : a >= 1e3 ? (a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil" : a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })); };
  // gráficos em SVG simples: barras verticais (agrupadas), barras horizontais e linha; um eixo só, grade discreta,
  // legenda quando há 2+ séries e a tabela logo abaixo (os números não dependem só da cor). Dica ao passar o mouse.
  function grafico(d) {
    if (!d) return "";
    if (d.tipo === "kpis") return '<div class="clp-kpis">' + (d.itens || []).map((k) => '<div class="clp-kpi"><small>' + C.esc(k.rotulo) + "</small><b>" + fmtV(k.valor, k.unidade) + "</b>" + (k.ajuda ? "<span>" + C.esc(k.ajuda) + "</span>" : "") + "</div>").join("") + "</div>";
    if (d.tipo === "tabela") return tabela(d);
    const series = d.series || [], rot = d.rotulos || [], u = d.unidade;
    const todos = series.flatMap((s) => s.valores.map(Number)), max = Math.max(0, ...todos), min = Math.min(0, ...todos), faixa = (max - min) || 1;
    const leg = series.length > 1 ? '<div class="clp-leg">' + series.map((s, i) => '<span><i style="background:' + COR[i] + '"></i>' + C.esc(s.nome) + "</span>").join("") + "</div>" : "";
    if (d.tipo === "barras_h") {
      const W = 520, lh = 26, H = rot.length * lh + 8, x0 = 170, wMax = W - x0 - 70, v = series[0]?.valores || [], mx = Math.max(1, ...v.map(Number));
      return '<svg class="clp-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + C.esc(series[0]?.nome || "") + '">' +
        rot.map((r, i) => { const w = Math.max(2, (Number(v[i]) / mx) * wMax), y = 4 + i * lh;
          return '<g><title>' + C.esc(r + ": " + fmtV(v[i], u)) + '</title><text x="' + (x0 - 8) + '" y="' + (y + 15) + '" text-anchor="end" class="clp-rot">' + C.esc(String(r).length > 26 ? String(r).slice(0, 25) + "…" : r) + "</text>" +
            '<rect x="' + x0 + '" y="' + (y + 4) + '" width="' + w + '" height="16" rx="4" fill="' + COR[0] + '"></rect><text x="' + (x0 + w + 6) + '" y="' + (y + 16) + '" class="clp-val">' + curto(v[i]) + "</text></g>"; }).join("") + "</svg>" + tabela(d);
    }
    const W = 520, H = 220, L = 52, R = 10, T0 = 10, B = 28, pw = W - L - R, ph = H - T0 - B, y = (val) => T0 + ph - ((Number(val) - min) / faixa) * ph;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * faixa);
    let corpo = ticks.map((t) => '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '" class="clp-grade"></line><text x="' + (L - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end" class="clp-eixo">' + curto(t) + "</text>").join("");
    const passo = Math.max(1, Math.ceil(rot.length / 8));
    if (d.tipo === "linha") {
      const xs = (i) => L + (rot.length > 1 ? (i / (rot.length - 1)) * pw : pw / 2);
      corpo += series.map((s, k) => '<polyline fill="none" stroke="' + COR[k] + '" stroke-width="2" points="' + s.valores.map((v, i) => xs(i) + "," + y(v)).join(" ") + '"></polyline>' +
        s.valores.map((v, i) => '<circle cx="' + xs(i) + '" cy="' + y(v) + '" r="4" fill="' + COR[k] + '" stroke="#fff" stroke-width="2"><title>' + C.esc(s.nome + " · " + rot[i] + ": " + fmtV(v, u)) + "</title></circle>").join("")).join("");
      corpo += rot.map((r, i) => i % passo ? "" : '<text x="' + xs(i) + '" y="' + (H - 8) + '" text-anchor="middle" class="clp-eixo">' + C.esc(r) + "</text>").join("");
    } else {
      const gw = pw / Math.max(1, rot.length), bw = Math.max(4, Math.min(28, (gw - 8) / Math.max(1, series.length) - 2));
      corpo += rot.map((r, i) => series.map((s, k) => { const v = Number(s.valores[i]) || 0, x = L + i * gw + (gw - series.length * (bw + 2)) / 2 + k * (bw + 2), y0 = y(0), y1 = y(v);
        return '<rect x="' + x + '" y="' + Math.min(y0, y1) + '" width="' + bw + '" height="' + Math.max(1, Math.abs(y1 - y0)) + '" rx="3" fill="' + COR[k] + '"><title>' + C.esc(s.nome + " · " + r + ": " + fmtV(v, u)) + "</title></rect>"; }).join("") +
        (i % passo ? "" : '<text x="' + (L + i * gw + gw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" class="clp-eixo">' + C.esc(r) + "</text>")).join("");
      if (min < 0) corpo += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" class="clp-zero"></line>';
    }
    return leg + '<svg class="clp-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + C.esc(series.map((s) => s.nome).join(", ")) + '">' + corpo + "</svg>" + tabela(d);
  }
  function tabela(d) {
    if (!d.colunas || !d.linhas?.length) return d.tipo === "tabela" ? '<p class="clp-leitura">Sem dados para mostrar ainda.</p>' : "";
    const fmts = d.formatos || d.colunas.map((_, i) => (i === 0 ? "texto" : d.unidade === "brl" ? "brl" : "texto"));
    return '<details class="clp-tab"' + (d.tipo === "tabela" ? " open" : "") + "><summary>Ver os números</summary><table><thead><tr>" + d.colunas.map((c, i) => "<th" + (i ? ' class="num"' : "") + ">" + C.esc(c) + "</th>").join("") + "</tr></thead><tbody>" +
      d.linhas.map((l) => "<tr>" + l.map((v, i) => "<td" + (i ? ' class="num"' : "") + ">" + (fmts[i] === "texto" ? C.esc(v ?? "—") : fmtV(v, fmts[i])) + "</td>").join("") + "</tr>").join("") + "</tbody></table></details>";
  }
  function provasHtml(msg) {
    return (msg.evidencias || []).map((e) => '<article class="clp-card"><header><h4>' + C.esc(e.titulo) + "</h4></header>" + (e.leitura ? '<p class="clp-leitura">' + C.esc(e.leitura) + "</p>" : "") + grafico(e.dados) +
      (e.dados?.nota ? '<small class="clp-nota">' + C.esc(e.dados.nota) + "</small>" : "") + "</article>").join("");
  }
  function pintarLado() {
    const el = $("chLado"); if (!el) return;
    const sel = T.provaSel != null ? T.chat[T.provaSel] : null;
    if (sel && (sel.evidencias || []).length) {
      el.innerHTML = '<div class="clp-topo"><div><p class="ch-lado-kicker">Provas da análise</p><h3>' + C.esc(sel.titulo_relatorio || "O que sustenta a resposta") + "</h3></div>" +
        '<div class="clp-acoes"><button type="button" class="fin-btn peq" id="clpRel">Gerar relatório</button><button type="button" class="fin-btn peq claro" id="clpVoltar">Relatórios</button></div></div>' +
        '<div class="clp-lista">' + provasHtml(sel) + "</div>";
      $("clpVoltar").addEventListener("click", () => { T.provaSel = null; pintarMsgs(); pintarLado(); });
      $("clpRel").addEventListener("click", () => gerarRelatorioClara(T.provaSel));
      return;
    }
    el.innerHTML = '<p class="ch-lado-kicker">Relatórios da ' + NOME + '</p><h3>Peça uma análise</h3><p class="ch-lado-sub">A ' + NOME + " analisa como uma diretora financeira e mostra aqui os gráficos e tabelas que provam o que ela diz. Depois é só gerar o relatório.</p>" +
      '<div class="clp-rels">' + RELATORIOS.map(([t], i) => '<button type="button" class="clp-rel" data-clp-rel="' + i + '"><b>' + C.esc(t) + "</b><span>Gerar análise com gráficos</span></button>").join("") + "</div>" +
      '<button type="button" class="ch-lado-nova" id="chNova">Nova conversa</button>';
    el.querySelectorAll("[data-clp-rel]").forEach((b) => b.addEventListener("click", () => perguntar(RELATORIOS[Number(b.dataset.clpRel)][1])));
    $("chNova").addEventListener("click", () => { if (T.pensando) return; T.chat = []; T.provaSel = null; guardarChat(); pintarMsgs(); pintarLado(); $("chTexto")?.focus(); });
  }
  // relatório A4 da resposta + provas (pré-visualização antes de imprimir)
  async function gerarRelatorioClara(i) {
    const m = T.chat[i]; if (!m) return;
    const perg = [...T.chat.slice(0, i)].reverse().find((x) => x.role === "user");
    let co = {};
    try { const r = await C.S.sb.from("empresas").select("*").eq("id", C.S.emp).maybeSingle(); co = r.data || {}; } catch (_) { /* sem logo */ }
    const nomeEmp = co.razao_social || co.nome_fantasia || co.nome || window.__CONTEXT?.empresa_nome || "";
    const logo = co.logo_url ? '<img src="' + C.esc(co.logo_url) + '" alt="" onload="if(this.naturalWidth/this.naturalHeight<1.6){this.style.width=\'120px\';this.style.height=\'34px\';this.style.objectFit=\'cover\';this.style.objectPosition=\'center 49%\'}">' : "";
    const html = '<div class="rr-doc"><header class="rr-head"><div>' + logo + '<div class="rr-head-company">' + C.esc([nomeEmp, co.cnpj || co.documento].filter(Boolean).join(" · ")) + "</div></div>" +
      '<div class="rr-head-id">Análise financeira<strong>' + C.esc(NOME) + "</strong>Emitido em " + new Date().toLocaleString("pt-BR") + "</div></header>" +
      '<div class="rr-title"><div><span>Financeiro · análise da ' + C.esc(NOME) + "</span><h1>" + C.esc(m.titulo_relatorio || "Análise financeira") + "</h1></div></div>" +
      (perg ? '<div class="rr-note">Pergunta: ' + C.esc(perg.content) + "</div>" : "") +
      '<div class="rr-section clp-rel-texto">' + formatar(m.content) + "</div>" +
      (m.evidencias || []).map((e) => '<div class="rr-section"><h2>' + C.esc(e.titulo) + "</h2>" + (e.leitura ? "<p>" + C.esc(e.leitura) + "</p>" : "") + grafico(e.dados).replace(/<details class="clp-tab"[^>]*>/g, '<div class="clp-tab">').replace(/<\/details>/g, "</div>").replace(/<summary>[^<]*<\/summary>/g, "") +
        (e.dados?.nota ? "<small>" + C.esc(e.dados.nota) + "</small>" : "") + "</div>").join("") +
      '<style>.clp-svg{width:100%;max-width:170mm;height:auto;display:block;margin:6px 0}.clp-eixo,.clp-rot,.clp-val{font:9px Inter,Arial,sans-serif;fill:#52514e}.clp-grade{stroke:#e8ebef}.clp-zero{stroke:#6b7789}.clp-leg{display:flex;gap:14px;font-size:8pt;margin:4px 0}.clp-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}.clp-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.clp-kpi{border:1px solid #e8ebef;border-radius:6px;padding:7px 10px;background:#f6f7f9}.clp-kpi small{display:block;font-size:6.5pt;font-weight:600;text-transform:uppercase;color:#6b7789}.clp-kpi b{display:block;font-size:11pt;color:#04111f}.clp-kpi span{display:block;font-size:7pt;color:#6b7789}.clp-tab table{width:100%;border-collapse:collapse;margin-top:4px;font-size:8pt}.clp-tab th,.clp-tab td{padding:3px 5px;border-bottom:1px solid #e8ebef;text-align:left}.clp-tab th{font-size:7pt;color:#6b7789;text-transform:uppercase}.clp-tab .num{text-align:right;white-space:nowrap}.clp-rel-texto p{margin:4px 0}.clp-rel-texto ul,.clp-rel-texto ol{margin:4px 0 4px 18px}</style>' +
      '<div class="rr-signs"><div><strong>Financeiro</strong>Preparado por</div><div><strong>Diretoria</strong>Ciente</div><div><strong>Data</strong>____/____/______</div></div></div>';
    if (window.FinRelatorioA4) window.FinRelatorioA4.previa(html, m.titulo_relatorio || "Análise financeira");
    else C.avisar("Não foi possível abrir o relatório. Recarregue a página.", NOME, "erro");
  }

  function pintarMsgs() {
    const el = $("chMsgs"); if (!el) return;
    const nome = nomePessoa();
    el.innerHTML = '<div class="ch-coluna">' + (T.chat.length ? T.chat.map((m, i) => '<div class="ch-msg ' + (m.role === "user" ? "is-eu" : "is-bot") + '"><div class="ch-bubble">' + (m.role === "user" ? C.esc(m.content).replace(/\n/g, "<br>") : formatar(m.content)) +
        (m.role !== "user" && (m.evidencias || []).length ? '<button type="button" class="clp-ver' + (T.provaSel === i ? " ativo" : "") + '" data-clp-ver="' + i + '">Ver provas (' + m.evidencias.length + ")" + (m.titulo_relatorio ? " · gerar relatório" : "") + "</button>" : "") + "</div></div>").join("")
      : '<div class="ch-boasvindas"><span class="ch-avatar is-xl titulo-serifa">C</span><h2>Oi' + (nome ? ", " + C.esc(nome) : "") + "! Eu sou a " + NOME + ".</h2>" +
        "<p>Sou a diretora financeira da empresa. Analiso caixa, resultado, lucro dos eventos, inadimplência e prazos, digo o que está acontecendo e o que eu faria — e mostro à direita os gráficos que provam.</p></div>" +
        '<div class="ch-sugestoes">' + SUGESTOES.map((t) => '<button type="button" data-ch-sug="' + C.esc(t) + '">' + C.esc(t) + "</button>").join("") + "</div>") +
      (T.pensando ? '<div class="ch-msg is-bot"><div class="ch-bubble ch-digitando" aria-label="' + NOME + ' está analisando"><i></i><i></i><i></i></div></div>' : "") + "</div>";
    el.querySelectorAll("[data-ch-sug]").forEach((b) => b.addEventListener("click", () => perguntar(b.dataset.chSug)));
    el.querySelectorAll("[data-clp-ver]").forEach((b) => b.addEventListener("click", () => { T.provaSel = Number(b.dataset.clpVer); pintarMsgs(); pintarLado(); }));
    if ($("chEnviar")) $("chEnviar").disabled = !!T.pensando;
    el.scrollTop = el.scrollHeight;
  }
  async function perguntar(texto) {
    if (T.pensando) return;
    T.chat.push({ role: "user", content: texto, em: Date.now() });
    T.pensando = true; guardarChat(); pintarMsgs();
    try {
      const r = await clara("conversar", { mensagens: T.chat.map(({ role, content }) => ({ role, content })) });
      T.chat.push({ role: "assistant", content: r.resposta || "…", evidencias: r.evidencias || [], titulo_relatorio: r.titulo_relatorio || "", em: Date.now() });
      if ((r.evidencias || []).length) T.provaSel = T.chat.length - 1;
    }
    catch (e) { T.chat.push({ role: "assistant", content: "Não consegui responder agora: " + e.message, em: Date.now() }); }
    T.pensando = false; guardarChat(); pintarMsgs(); pintarLado(); $("chTexto")?.focus();
  }
  // De outra tela (ex.: "Por que não bate?" em Bancos): abre a aba da Clara já com a pergunta.
  function perguntarNaAba(texto) {
    T.perguntaPendente = texto;
    document.querySelector('#finAbas [data-aba="clara"]')?.click();
  }

  // ---------------------------------------------------------------- DRE
  async function organizarDre(ctx) {
    C = ctx;
    C.modal("Organizar a DRE com a " + NOME, '<div class="cl-carregando"><span class="cl-giro"></span>A ' + NOME + " está lendo os títulos sem categoria ou sem centro de custo…</div>", [{ rotulo: "Fechar", classe: "claro", acao: C.fecharModal }]);
    $("finModal").classList.add("cl-modal-largo");
    $("finModal").addEventListener("close", () => $("finModal").classList.remove("cl-modal-largo"), { once: true });
    let r;
    try { r = await clara("classificar_dre", {}); }
    catch (e) { return C.erroModal(e.message); }
    if (r.sem_centros) return propostaCentros();
    if (!r.itens?.length) { $("finModalCorpo").innerHTML = '<div class="fin-vazio">Tudo classificado: todos os títulos do último ano têm categoria e centro de custo.</div>'; return; }
    const itens = r.itens;
    $("finModalCorpo").innerHTML = '<p class="cl-dica">' + itens.length + " título(s) sem classificação completa. Confira as sugestões da " + NOME + ', mude o que quiser e confirme.</p><div class="fin-rolar"><table class="fin-tabela cl-dre"><thead><tr><th class="cl-ck"><input type="checkbox" id="clDreTodas" checked aria-label="Todas"></th><th>Título</th><th class="num">Valor</th><th>Categoria</th><th>Centro de custo</th></tr></thead><tbody>' +
      itens.map((x, i) => '<tr><td class="cl-ck"><input type="checkbox" data-dre-sel="' + i + '" checked></td><td><b>' + C.esc(x.descricao) + "</b><small>" + C.esc([x.tipo === "receber" ? "receita" : "despesa", x.nome, x.pedido_numero ? "Pedido " + x.pedido_numero : "", C.dataBr(x.vencimento)].filter(Boolean).join(" · ")) + "</small>" + (x.motivo ? '<small class="cl-motivo">' + C.esc(x.motivo) + "</small>" : "") + '</td><td class="num">' + C.brl(x.valor) + "</td>" +
        '<td><select data-dre-cat="' + i + '">' + C.opcoesCats(x.tipo === "receber" ? "entrada" : "saida", x.categoria_id) + '</select></td><td><select data-dre-cc="' + i + '">' + C.opcoesCcs(x.centro_custo_id) + "</select></td></tr>").join("") + "</tbody></table></div>";
    $("finModalRodape").innerHTML = '<button type="button" class="fin-btn claro" data-bt="0">Fechar</button><button type="button" class="fin-btn verde" id="clDreOk">Confirmar selecionados</button>';
    const raiz = $("finModalCorpo");
    raiz.querySelector("#clDreTodas").addEventListener("change", (e) => raiz.querySelectorAll("[data-dre-sel]").forEach((c) => { c.checked = e.target.checked; }));
    $("clDreOk").addEventListener("click", async () => {
      const lista = [...raiz.querySelectorAll("[data-dre-sel]")].filter((c) => c.checked).map((c) => { const i = Number(c.dataset.dreSel); return { tipo: itens[i].tipo, id: itens[i].id, categoria_id: raiz.querySelector('[data-dre-cat="' + i + '"]').value, centro_custo_id: raiz.querySelector('[data-dre-cc="' + i + '"]').value }; });
      if (!lista.length) return C.erroModal("Selecione pelo menos um título.");
      $("clDreOk").disabled = true; $("clDreOk").textContent = "Salvando…";
      try { const n = await C.rpc("fin_assist_classificar", { p_empresa: C.S.emp, p_itens: lista }); C.fecharModal(); C.avisar(n + " título(s) classificado(s). A DRE já está atualizada.", NOME, "sucesso"); await C.recarregar(); }
      catch (e) { $("clDreOk").disabled = false; $("clDreOk").textContent = "Confirmar selecionados"; C.erroModal(e.message); }
    });
  }
  async function propostaCentros() {
    $("finModalCorpo").innerHTML = '<div class="cl-carregando"><span class="cl-giro"></span>Você ainda não tem centros de custo. A ' + NOME + " está montando uma proposta…</div>";
    let r; try { r = await clara("sugerir_centros", {}); } catch (e) { return C.erroModal(e.message); }
    const cs = r.centros || [];
    $("finModalCorpo").innerHTML = '<p class="cl-dica">Proposta de centros de custo. Desmarque os que não quiser; depois a ' + NOME + " classifica os títulos.</p>" +
      cs.map((c, i) => '<label class="cl-alt-t"><input type="checkbox" data-cc-i="' + i + '" checked><span><b>' + C.esc(c.codigo + " · " + c.nome) + "</b><small>" + C.esc(c.descricao) + "</small></span></label>").join("");
    $("finModalRodape").innerHTML = '<button type="button" class="fin-btn claro" data-bt="0">Fechar</button><button type="button" class="fin-btn verde" id="clCcOk">Criar e continuar</button>';
    $("clCcOk").addEventListener("click", async () => {
      const novos = [...document.querySelectorAll("[data-cc-i]")].filter((c) => c.checked).map((c) => cs[Number(c.dataset.ccI)]).map((c) => ({ empresa_id: C.S.emp, codigo: c.codigo || null, nome: c.nome }));
      if (!novos.length) return C.erroModal("Marque pelo menos um centro.");
      const ins = await C.S.sb.from("fin_centros_custo").insert(novos);
      if (ins.error) return C.erroModal(ins.error.message);
      await C.carregar(); organizarDre(C);
    });
  }

  // leitura do arquivo da fatura do cartão e da cobrança do parceiro (mesma leitura do extrato)
  async function lerArquivo(f, conta) { const arquivo = await prepararArquivo(f); return clara("ler_extrato", { conta_id: conta, arquivo }); }
  window.FinanceiroClara = { render, organizarDre, chat: renderChat, lerArquivo };
})();
