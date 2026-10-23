/* =====================================================================
   OPERAÇÃO SEM O MOTOR DA VERCEL (out/2026)

   Cronograma, Painel Logístico, Equipe Free, Painel RH Free, App do
   Montador, Vagas Free e QR do líder continuam chamando
   google.script.run.funcao(...) como antes; o gas-cliente.js entrega cada
   chamada para a função de mesmo nome deste arquivo (window.ACERVO_LOCAL),
   que lê e grava direto no Supabase — igual à Tecnoweld:
   - telas internas: tabelas com as regras de acesso do banco (RLS);
   - apps de campo (montador, free, líder): funções do banco que conferem a
     sessão do app (login próprio: PIN do RH / CPF e senha).
   Tabelas: operacao_*, free_*, app_sessoes (migrations 20261019000200..0700).
   ===================================================================== */
(function () {
  "use strict";
  var L = window.ACERVO_LOCAL = window.ACERVO_LOCAL || {};
  var RAIZ = new URL("../../", document.currentScript.src).href;
  var URL_APP = new URL("Cronograma/", document.currentScript.src).href;
  var FUSO = "America/Sao_Paulo";

  /* ---------------- conexão ---------------- */
  var carregando = null;
  function carregarScript(src) {
    return new Promise(function (ok, erro) {
      var s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = function () { erro(new Error("Sem conexão com o servidor. Verifique a internet e tente de novo.")); };
      document.head.appendChild(s);
    });
  }
  function sb() {
    if (!carregando) {
      carregando = (async function () {
        try { if (window.top !== window && window.top.supabaseClient) { window.supabaseClient = window.top.supabaseClient; } } catch (e) {}
        if (!window.supabaseClient) {
          if (!window.supabase) { await carregarScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"); }
          await carregarScript(RAIZ + "js/core/supabase.js");
        }
        return window.supabaseClient;
      })();
    }
    return carregando;
  }
  function erroBanco(e) {
    var msg = (e && (e.message || e.details)) || String(e);
    return new Error(msg.replace(/^P0001:\s*/, ""));
  }
  async function q(promessa) {
    var r = await promessa;
    if (r.error) { throw erroBanco(r.error); }
    return r.data;
  }
  async function rpc(nome, args) { var c = await sb(); return q(c.rpc(nome, args || {})); }
  // CPF e PIX dos Free ficam no cofre: cadastro, login e troca de PIX passam pela Edge Function free-protegido.
  async function funcaoFree(body) {
    var c = await sb(), r = await c.functions.invoke("free-protegido", { body: body }), msg = r.data && r.data.error;
    if (r.error && !msg) { try { msg = (await r.error.context.json()).error; } catch (e) { msg = r.error.message; } }
    if (msg) { throw new Error(msg); }
    return r.data || {};
  }
  // o que as telas podem mostrar de um dado do cofre: a máscara (ou o valor antigo, anterior ao cofre)
  function visivelCofre(valor, mascaras, campo) {
    if (!valor) { return ""; }
    return String(valor).indexOf("cofre:") === 0 ? ((mascaras || {})[campo] || "••••") : String(valor);
  }
  async function tudo(montar) { // lê além do limite de 1000 linhas
    var lista = [];
    for (var de = 0; ; de += 1000) {
      var lote = await q(montar().range(de, de + 999));
      lista = lista.concat(lote || []);
      if (!lote || lote.length < 1000) { return lista; }
    }
  }
  function blocos(lista, n) { var r = []; for (var i = 0; i < lista.length; i += n) { r.push(lista.slice(i, i + n)); } return r; }
  async function emLote(ids, montar) {
    var lista = []; ids = Array.from(new Set(ids.filter(Boolean)));
    for (var b of blocos(ids, 150)) { lista = lista.concat(await tudo(function () { return montar(b); })); }
    return lista;
  }

  var cache = { empresa: null, perms: null, permsEm: 0, nome: null };
  async function empresa() {
    if (cache.empresa) { return cache.empresa; }
    var id = await rpc("operacao_empresa");
    if (!id) { throw new Error("Entre no sistema para usar esta tela."); }
    return (cache.empresa = id);
  }
  async function permissoes() {
    if (cache.perms && Date.now() - cache.permsEm < 60000) { return cache.perms; }
    cache.perms = (await rpc("operacao_minhas_permissoes")) || {}; cache.permsEm = Date.now();
    return cache.perms;
  }
  async function pode(chave) { return !!(await permissoes())[chave]; }
  async function meuNome() {
    if (cache.nome) { return cache.nome; }
    var c = await sb(); var u = (await c.auth.getUser()).data.user;
    if (!u) { throw new Error("Entre no sistema para usar esta tela."); }
    var f = await q(c.from("funcionarios_acesso").select("nome").eq("id", u.id).maybeSingle()).catch(function () { return null; });
    var nome = (f && f.nome) || sessionStorage.getItem("usuario_nome") || (u.user_metadata && u.user_metadata.nome) || u.email;
    return (cache.nome = nome);
  }

  /* ---------------- datas ---------------- */
  function pad(n) { return String(n).padStart(2, "0"); }
  function partes(ts) {
    var d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d.getTime())) { return null; }
    var o = {};
    new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function dataHoraTexto(ts) { if (!ts) { return ""; } var p = partes(ts); return p ? p.day + "/" + p.month + "/" + p.year + " " + p.hour + ":" + p.minute + ":" + p.second : ""; }
  function hojeISO() { var p = partes(new Date()); return p.year + "-" + p.month + "-" + p.day; }
  function hhmm(t) { var m = String(t || "").match(/^(\d{1,2}):(\d{2})/); return m ? pad(m[1]) + ":" + m[2] : ""; }
  function br(iso) { var p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : ""; }
  function somarDias(iso, n) { var p = iso.split("-").map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)); return d.toISOString().slice(0, 10); }
  function isoDeQualquer(v) {
    var s = String(v || "").trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) { return m[1] + "-" + m[2] + "-" + m[3]; }
    if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/))) { return m[3] + "-" + m[2] + "-" + m[1]; }
    return "";
  }
  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim(); }
  function uuid(v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "")) ? String(v) : null; }
  function lista(txt) { return String(txt || "").split("|").map(function (s) { return s.trim(); }).filter(function (s) { return s && s !== "-"; }); }

  /* ---------------- fotos ---------------- */
  function dataUrlParaBlob(dataUrl) {
    var m = String(dataUrl).match(/^data:([^;]+);base64,(.*)$/);
    if (!m) { return null; }
    var bin = atob(m[2]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { arr[i] = bin.charCodeAt(i); }
    return new Blob([arr], { type: m[1] });
  }
  async function subirFoto(dataUrl, pasta) {
    if (!dataUrl) { return ""; }
    if (/^https?:\/\//i.test(dataUrl)) { return dataUrl; }
    var blob = dataUrlParaBlob(dataUrl);
    if (!blob) { throw new Error("Foto inválida. Tire a foto de novo."); }
    var c = await sb();
    var ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    var caminho = pasta + "/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2)) + "." + ext;
    var r = await c.storage.from("operacao-fotos").upload(caminho, blob, { contentType: blob.type, upsert: false });
    if (r.error) { throw new Error("Não foi possível enviar a foto. Verifique a internet e tente de novo."); }
    return c.storage.from("operacao-fotos").getPublicUrl(caminho).data.publicUrl;
  }

  /* =====================================================================
     REGRAS DOS FREE (copiadas do antigo Freelancers.js — só cálculo)
     ===================================================================== */
  var F = { CHECKIN_ANTES: 3, CHECKIN_DEPOIS: 12, CHECKOUT_LIMITE: 24, DIST_ALERTA: 1000, TOLERANCIA_ATRASO: 15, NOTA_INICIAL: 5, NOTA_MINIMA: 1,
    PONTOS: { concluido: 0.2, cancelouAntes: -0.1, cancelouEmCima: -0.5, faltou: -1.5, atraso: -0.3, semCheckout: -0.2, uniformeIncompleto: -0.3, semUniforme: -0.6 } };
  function fParse(texto) {
    var m = String(texto || "").match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0)) : null;
  }
  function fMin(t) { var m = String(t || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
  function fDuracao(min) { if (min == null) { return ""; } var h = Math.floor(min / 60), m = min % 60; return h + "h" + pad(m); }
  function fQuando(v) { var p = String(v.dataISO || "").split("-"); if (p.length !== 3) { return null; } var m = fMin(v.horario); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), m == null ? 23 : Math.floor(m / 60), m == null ? 59 : m % 60); }
  function fPassou(v) { var q = fQuando(v); return q ? q.getTime() < Date.now() : false; }
  function fFase(v, i, agora) {
    agora = agora || new Date();
    if (i.checkoutEm) { return "CONCLUIDO"; }
    if (i.checkinEm) { var e = fParse(i.checkinEm); return agora.getTime() <= (e ? e.getTime() + F.CHECKOUT_LIMITE * 3600000 : 0) ? "TRABALHANDO" : "SEM_CHECKOUT"; }
    if (v.status === "CANCELADA") { return "CANCELADA"; }
    var q = fQuando(v); if (!q) { return "AGUARDANDO"; }
    if (agora.getTime() < q.getTime() - F.CHECKIN_ANTES * 3600000) { return "AGUARDANDO"; }
    return agora.getTime() <= q.getTime() + F.CHECKIN_DEPOIS * 3600000 ? "CHECKIN" : "FALTOU";
  }
  function fTrabalhados(i) { var e = fParse(i.checkinEm), s = fParse(i.checkoutEm); return e && s ? Math.max(0, Math.round((s - e) / 60000)) : null; }
  function fMudanca(v, i) {
    if (i.status !== "CONFIRMADO" || i.checkinEm || !i.dataCiente) { return null; }
    var fase = fFase(v, i); if (fase !== "AGUARDANDO" && fase !== "CHECKIN") { return null; }
    if (i.dataCiente === v.dataISO && i.horarioCiente === v.horario) { return null; }
    return { dataAntes: i.dataCiente, horarioAntes: i.horarioCiente, dataAgora: v.dataISO, horarioAgora: v.horario };
  }
  function fResumo(v, i) {
    var min = fTrabalhados(i);
    return { fase: fFase(v, i), mudanca: fMudanca(v, i), checkinEm: i.checkinEm, checkinVia: i.checkinVia, checkinDistancia: i.checkinDistancia,
      checkinSemGps: !!i.checkinEm && i.checkinLat === "", checkoutEm: i.checkoutEm, checkoutDistancia: i.checkoutDistancia,
      checkoutSemGps: !!i.checkoutEm && i.checkoutLat === "", minutosTrabalhados: min, horasTrabalhadas: fDuracao(min), presencaPor: i.presencaPor,
      longeDoPonto: (i.checkinDistancia !== "" && i.checkinDistancia > F.DIST_ALERTA) || (i.checkoutDistancia !== "" && i.checkoutDistancia > F.DIST_ALERTA) };
  }
  function fVisivel(v, idFree) {
    if (v.modo === "EXCLUSIVA") { return v.preferidos.indexOf(idFree) >= 0; }
    if (v.modo === "PRIORIDADE") { if (v.preferidos.indexOf(idFree) >= 0) { return true; } var l = fParse(v.liberarEm); return !l || Date.now() >= l.getTime(); }
    return true;
  }
  function fDataCurta(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] : ""; }
  function fNotaVazia() { return { nota: F.NOTA_INICIAL, trabalhos: 0, faltas: 0, cancelamentos: 0, historico: [] }; }
  function fPontuacao(listaIns, mapaVagas) {
    var ev = [];
    listaIns.forEach(function (i) {
      var v = mapaVagas[i.idVaga]; if (!v) { return; }
      var quando = (v.dataISO || "") + " " + (v.horario || ""), titulo = (v.etapa || "Vaga") + " " + fDataCurta(v.dataISO);
      if (i.status === "CANCELADO") { ev.push({ quando: quando, titulo: titulo, delta: i.cimaDaHora ? F.PONTOS.cancelouEmCima : F.PONTOS.cancelouAntes, motivo: i.cimaDaHora ? "Cancelou com menos de 24h" : "Cancelou com antecedência" }); return; }
      if (i.status !== "CONFIRMADO") { return; }
      var fase = fFase(v, i);
      if (fase === "FALTOU") { ev.push({ quando: quando, titulo: titulo, delta: F.PONTOS.faltou, motivo: "Faltou sem avisar" }); return; }
      if (fase === "CONCLUIDO" || fase === "SEM_CHECKOUT") {
        ev.push({ quando: quando, titulo: titulo, delta: F.PONTOS.concluido, motivo: "Trabalho realizado" });
        var e = fParse(i.checkinEm), marc = fQuando(v), atraso = e && marc ? Math.round((e - marc) / 60000) : 0;
        if (atraso > F.TOLERANCIA_ATRASO) { ev.push({ quando: quando, titulo: titulo, delta: F.PONTOS.atraso, motivo: "Chegou " + atraso + " min atrasado" }); }
        if (fase === "SEM_CHECKOUT") { ev.push({ quando: quando, titulo: titulo, delta: F.PONTOS.semCheckout, motivo: "Não fez check-out" }); }
        if (i.uniforme === "INCOMPLETO") { ev.push({ quando: quando, titulo: titulo, delta: F.PONTOS.uniformeIncompleto, motivo: "Uniforme incompleto" }); }
        if (i.uniforme === "SEM") { ev.push({ quando: quando, titulo: titulo, delta: F.PONTOS.semUniforme, motivo: "Sem uniforme" }); }
      }
    });
    ev.sort(function (a, b) { return a.quando.localeCompare(b.quando); });
    var nota = F.NOTA_INICIAL;
    ev.forEach(function (e) { nota = Math.max(F.NOTA_MINIMA, Math.min(F.NOTA_INICIAL, nota + e.delta)); e.notaDepois = Math.round(nota * 10) / 10; });
    return { nota: Math.round(nota * 10) / 10, trabalhos: ev.filter(function (e) { return e.delta === F.PONTOS.concluido; }).length,
      faltas: ev.filter(function (e) { return e.delta === F.PONTOS.faltou; }).length,
      cancelamentos: ev.filter(function (e) { return e.delta === F.PONTOS.cancelouAntes || e.delta === F.PONTOS.cancelouEmCima; }).length,
      historico: ev.slice(-12).reverse().map(function (e) { return { titulo: e.titulo, motivo: e.motivo, delta: e.delta, nota: e.notaDepois }; }) };
  }
  function fMapaNotas(insc, vagas) {
    var mv = {}; vagas.forEach(function (v) { mv[v.idVaga] = v; });
    var pf = {}; insc.forEach(function (i) { (pf[i.idFree] = pf[i.idFree] || []).push(i); });
    var m = {}; Object.keys(pf).forEach(function (id) { m[id] = fPontuacao(pf[id], mv); });
    return m;
  }
  function vagaLegado(v) {
    return { idVaga: v.id, idEtapa: v.etapa_id, pedido: v.pedido || "", cliente: v.cliente || "", local: v.local || "", etapa: v.etapa, dataISO: v.data,
      dataOriginal: v.data, horario: v.horario, horarioOriginal: v.horario_original, horarioEtapaBase: v.horario_etapa_base, horarioEtapaAtual: v.horario_etapa_atual,
      horarioMudou: v.horario !== v.horario_original, pontoEncontro: v.ponto_encontro, lider: v.lider, quantidade: Number(v.quantidade) || 0, observacao: v.observacao,
      status: v.status, criadoPor: v.criado_por, criadoEm: dataHoraTexto(v.criado_em), atualizadoEm: dataHoraTexto(v.atualizado_em),
      pontoLat: v.ponto_lat == null ? "" : Number(v.ponto_lat), pontoLng: v.ponto_lng == null ? "" : Number(v.ponto_lng), valor: v.valor == null ? "" : Number(v.valor),
      modo: v.modo, preferidos: (v.preferidos || []).map(String), liberarEm: v.liberar_em ? dataHoraTexto(v.liberar_em) : "", etapaRemovida: false };
  }
  function insLegado(i, extra) {
    var n = function (x) { return x == null ? "" : Number(x); };
    return Object.assign({ id: i.id, idVaga: i.vaga_id, idFree: i.free_id, nome: i.nome, cpf: (extra && extra.cpf) || "", telefone: i.telefone || "", status: i.status,
      confirmadoEm: dataHoraTexto(i.confirmado_em), canceladoEm: dataHoraTexto(i.cancelado_em), motivo: i.motivo || "", canceladoPor: i.cancelado_por || "",
      cimaDaHora: !!i.cima_da_hora, dataCiente: i.data_ciente || "", horarioCiente: i.horario_ciente || "",
      checkinEm: dataHoraTexto(i.checkin_em), checkinLat: n(i.checkin_lat), checkinLng: n(i.checkin_lng), checkinDistancia: n(i.checkin_distancia), checkinVia: i.checkin_via || "",
      checkoutEm: dataHoraTexto(i.checkout_em), checkoutLat: n(i.checkout_lat), checkoutLng: n(i.checkout_lng), checkoutDistancia: n(i.checkout_distancia),
      presencaPor: i.presenca_por || "", fotoUniforme: i.foto_uniforme || "", fotoUniformeId: "" }, extra || {});
  }

  /* ---------------- dados dos free para as telas internas ---------------- */
  async function freeTudo(filtroVagas) {
    var c = await sb(); var emp = await empresa();
    var vagas = await tudo(function () { var x = c.from("free_vagas_v").select("*").eq("empresa_id", emp); return filtroVagas ? filtroVagas(x) : x; });
    var todasIns = await tudo(function () { return c.from("free_inscricoes").select("*").eq("empresa_id", emp).order("confirmado_em"); });
    var unis = await tudo(function () { return c.from("free_rh_uniforme").select("*").eq("empresa_id", emp); });
    var cads = await tudo(function () { return c.from("free_cadastros").select("id,nome,cpf,telefone,foto_url,status,chave_pix,cofre_mascaras,created_at,ultimo_acesso").eq("empresa_id", emp); });
    var mU = {}; unis.forEach(function (u) { mU[u.inscricao_id] = u; });
    // as telas internas recebem CPF e PIX só com a máscara (o valor completo, só no pagamento, com permissão)
    var mC = {}; cads.forEach(function (x) { mC[x.id] = Object.assign({}, x, { cpf: visivelCofre(x.cpf, x.cofre_mascaras, "cpf"), chave_pix: visivelCofre(x.chave_pix, x.cofre_mascaras, "pix") }); });
    var todasVagas = filtroVagas ? await tudo(function () { return c.from("free_vagas_v").select("*").eq("empresa_id", emp); }) : vagas;
    var V = vagas.map(vagaLegado), TV = todasVagas.map(vagaLegado);
    var I = todasIns.map(function (i) { return insLegado(i, { cpf: (mC[i.free_id] || {}).cpf || "", uniforme: mU[i.id] ? mU[i.id].avaliacao : "" }); });
    return { vagas: V, todasVagas: TV, inscricoes: I, uniformes: mU, cadastros: mC, notas: fMapaNotas(I, TV) };
  }
  function porVaga(insc) { var m = {}; insc.forEach(function (i) { (m[i.idVaga] = m[i.idVaga] || []).push(i); }); return m; }
  function mapaVagaEtapa(v, lst) {
    var conf = lst.filter(function (i) { return i.status === "CONFIRMADO"; });
    return { idVaga: v.idVaga, status: v.status, quantidade: v.quantidade, confirmados: conf.length,
      cancelados: lst.filter(function (i) { return i.status === "CANCELADO"; }).length,
      checkins: conf.filter(function (i) { return i.checkinEm; }).length, checkouts: conf.filter(function (i) { return i.checkoutEm; }).length,
      faltas: conf.filter(function (i) { return fFase(v, i) === "FALTOU"; }).length, mudancasPendentes: conf.filter(function (i) { return fMudanca(v, i); }).length,
      nomes: conf.map(function (i) { return i.nome; }), horario: v.horario, pontoEncontro: v.pontoEncontro, lider: v.lider, valor: v.valor, modo: v.modo };
  }

  /* =====================================================================
     CRONOGRAMA
     ===================================================================== */
  var SEL_ETAPA = "id,pedido_id,nome,tipo,data,hora,observacao,origem,pessoas:operacao_etapa_pessoas(nome,papel,ordem,funcionario_id,free_id),cams:operacao_etapa_caminhoes(caminhao_id,caminhoes(codigo))";
  function responsavelDe(e) { var r = (e.pessoas || []).filter(function (p) { return p.papel === "responsavel"; })[0]; return r ? r.nome : ""; }
  function equipeDe(e) { return (e.pessoas || []).filter(function (p) { return p.papel === "equipe"; }).sort(function (a, b) { return a.ordem - b.ordem; }).map(function (p) { return p.nome; }); }
  function caminhoesDe(e) { return (e.cams || []).map(function (c) { return c.caminhoes && c.caminhoes.codigo; }).filter(Boolean); }
  function localTexto(p, l) {
    var end = l ? [l.endereco, l.numero_endereco].filter(Boolean).join(", ") : "";
    return p && p.local_nome && end ? p.local_nome + " - " + end : String((p && p.local_nome) || end || "");
  }

  function resumoMontagem(regs, uni) {
    if (!regs || !Object.keys(regs).length) { return null; }
    var r = {}, eq = regs.equipe, ch = eq && eq.chegada;
    if (eq) {
      var p = ch && ch.em ? partes(ch.em) : null;
      r.equipeTerceirizada = { empresa: eq.empresa || "", quantidade: eq.quantidade || "", observacao: eq.observacao || "", foto: eq.foto || "",
        latitude: eq.latitude || "", longitude: eq.longitude || "", data: p ? p.day + "/" + p.month + "/" + p.year : "", hora: p ? p.hour + ":" + p.minute : "",
        localStatus: ch ? ch.localStatus : "", minutosAtraso: ch ? ch.atraso : "", previsto: ch ? ch.previsto : "", origemChegada: ch ? "CHEGADA_V1" : "",
        distanciaEvento: ch ? ch.distancia : "", enviadoPor: (ch && ch.autor) || "", uniformizada: uni ? uni.valor : "", avaliadoPor: uni ? uni.avaliadoPor : "", avaliadoEm: uni ? uni.avaliadoEm : "" };
    }
    if (regs.sacolas) { r.sacolas = regs.sacolas.sacolas || []; }
    if (regs.posicionamento) { r.posicionamento = { observacao: regs.posicionamento.observacao || "", fotos: regs.posicionamento.fotos || [] }; }
    if (regs.observacoes) { r.observacoesGerais = { texto: regs.observacoes.observacao || "", observacao: regs.observacoes.observacao || "", responsavel: regs.observacoes.responsavel || "" }; }
    if (regs.lista_assinada) { r.listaAssinada = { recebedor: regs.lista_assinada.nome || "", nome: regs.lista_assinada.nome || "", foto: regs.lista_assinada.foto || "" }; }
    var total = (r.equipeTerceirizada ? 1 : 0) + (r.sacolas && r.sacolas.length ? 1 : 0) + (r.posicionamento ? 1 : 0) + (r.listaAssinada ? 1 : 0);
    r.totalRegistros = total; r.totalEsperado = 4; r.completo = total === 4;
    return r;
  }

  function trocaLegado(t) {
    return { id: t.id, idEtapa: t.etapa_id, item: t.item, quantidade: String(t.quantidade), motivo: t.motivo, descricao: t.descricao, fotoUrl: t.foto_url,
      solicitadoPor: t.solicitado_por, solicitadoEm: dataHoraTexto(t.solicitado_em), status: t.status, separadoPor: t.separado_por || "",
      separadoEm: dataHoraTexto(t.separado_em), enviadoPor: t.enviado_por || "", enviadoEm: dataHoraTexto(t.enviado_em), observacao: t.observacao || "" };
  }

  async function andamentoPedidos(ids) {
    ids = Array.from(new Set(ids.filter(Boolean))); if (!ids.length) { return {}; }
    var c = await sb();
    var peds = await emLote(ids, function (b) { return c.from("separacoes_pedidos").select("id,status,status_comercial,status_operacional,operacao").in("id", b); });
    var itens = await emLote(ids, function (b) { return c.from("separacoes_itens").select("separacao_pedido_id,quantidade_solicitada,quantidade_separada,item_id,componentes,itens:item_id(tipo)").in("separacao_pedido_id", b).order("id"); });
    var kitIds = Array.from(new Set(itens.filter(function (i) { return String((i.itens && i.itens.tipo) || "").toLowerCase() === "kit"; }).map(function (i) { return i.item_id; })));
    var porKit = {};
    if (kitIds.length) { (await emLote(kitIds, function (b) { return c.from("kit_itens").select("kit_id,quantidade").in("kit_id", b); })).forEach(function (k) { porKit[k.kit_id] = (porKit[k.kit_id] || 0) + Number(k.quantidade || 0); }); }
    var etq = await emLote(ids, function (b) { return c.from("separacoes_etiquetas").select("separacao_pedido_id,lida_carregamento_em,lida_descarregamento_em,lida_retorno_em").in("separacao_pedido_id", b).order("id"); });
    var pecas = function (i) { return porKit[i.item_id] ? Number(i.quantidade_solicitada || 0) * porKit[i.item_id] : Number(i.quantidade_solicitada || 0); };
    var sep = function (i) { return porKit[i.item_id] ? Object.values(i.componentes || {}).reduce(function (t, x) { return t + Number((x && x.separado) || 0); }, 0) : Number(i.quantidade_separada || 0); };
    var mapa = {};
    peds.forEach(function (p) {
      var meus = itens.filter(function (i) { return i.separacao_pedido_id === p.id; }), op = p.operacao || {};
      var resumo = function (o) { return o && o.concluido_em ? { lidas: o.lidas, total: o.total, faltando: (o.faltando || []).length, em: o.concluido_em, por: o.por || "" } : null; };
      var vols = etq.filter(function (e) { return e.separacao_pedido_id === p.id; }), carr = vols.filter(function (e) { return e.lida_carregamento_em; });
      var base = carr.length ? carr : vols;
      var conf = function (reg, b, campo) { return b.length ? Object.assign({}, resumo(reg) || {}, { lidas: b.filter(function (e) { return e[campo]; }).length, total: b.length, faltando: reg && reg.concluido_em ? b.filter(function (e) { return !e[campo]; }).length : 0 }) : resumo(reg); };
      mapa[p.id] = { status: p.status, comercial: p.status_comercial, operacional: p.status_operacional || "",
        separado: meus.reduce(function (s, i) { return s + sep(i); }, 0), total: meus.reduce(function (s, i) { return s + pecas(i); }, 0),
        carregamento: conf(op.carregamento, vols, "lida_carregamento_em"), descarregamento: conf(op.descarregamento, base, "lida_descarregamento_em"), retorno: conf(op.retorno, base, "lida_retorno_em") };
    });
    return mapa;
  }

  L.getCronogramaSemana = async function (inicio) {
    var c = await sb(), emp = await empresa();
    inicio = isoDeQualquer(inicio) || hojeISO();
    var fim = somarDias(inicio, 6);
    var daSemana = await tudo(function () { return c.from("operacao_etapas").select("id,pedido_id").eq("empresa_id", emp).gte("data", inicio).lte("data", fim); });
    var pedIds = Array.from(new Set(daSemana.map(function (e) { return e.pedido_id; }).filter(Boolean)));
    var soltas = daSemana.filter(function (e) { return !e.pedido_id; }).map(function (e) { return e.id; });
    var etapas = (await emLote(pedIds, function (b) { return c.from("operacao_etapas").select(SEL_ETAPA).in("pedido_id", b); }))
      .concat(await emLote(soltas, function (b) { return c.from("operacao_etapas").select(SEL_ETAPA).in("id", b); }));
    var etIds = etapas.map(function (e) { return e.id; });
    var peds = await emLote(pedIds, function (b) { return c.from("separacoes_pedidos").select("id,numero_pedido,cliente_nome,local_nome,local_id,data_evento").in("id", b); });
    var locais = await emLote(peds.map(function (p) { return p.local_id; }), function (b) { return c.from("locais_empresas").select("id,endereco,numero_endereco,latitude,longitude").in("id", b); });
    var infos = await emLote(pedIds, function (b) { return c.from("operacao_pedidos_info").select("*").in("pedido_id", b); });
    var alertas = await emLote(pedIds, function (b) { return c.from("operacao_alertas_motorista").select("*").in("pedido_id", b).order("criado_em", { ascending: false }); });
    var regs = await emLote(etIds, function (b) { return c.from("operacao_registros").select("etapa_id,tipo,dados").in("etapa_id", b); });
    var trocas = await emLote(etIds, function (b) { return c.from("operacao_trocas").select("*").in("etapa_id", b).neq("status", "CANCELADO").order("solicitado_em"); });
    var vagas = await emLote(etIds, function (b) { return c.from("free_vagas_v").select("*").in("etapa_id", b).neq("status", "CANCELADA"); });
    var insc = await emLote(vagas.map(function (v) { return v.id; }), function (b) { return c.from("free_inscricoes").select("*").in("vaga_id", b); });
    var andamento = await andamentoPedidos(pedIds).catch(function (e) { console.error("Andamento indisponível:", e); return {}; });

    var mP = {}; peds.forEach(function (p) { mP[p.id] = p; });
    var mL = {}; locais.forEach(function (l) { mL[l.id] = l; });
    var mI = {}; infos.forEach(function (i) { mI[i.pedido_id] = i; });
    var mA = {}; alertas.forEach(function (a) { if (!mA[a.pedido_id]) { mA[a.pedido_id] = a; } });
    var mR = {}; regs.forEach(function (r) { (mR[r.etapa_id] = mR[r.etapa_id] || {})[r.tipo] = r.dados; });
    var mT = {}; trocas.forEach(function (t) { (mT[t.etapa_id] = mT[t.etapa_id] || []).push(trocaLegado(t)); });
    var pv = porVaga(insc.map(function (i) { return insLegado(i); }));
    var mV = {}; vagas.forEach(function (v) { var lv = vagaLegado(v); mV[v.etapa_id] = mapaVagaEtapa(lv, pv[v.id] || []); });

    var grupos = {};
    etapas.forEach(function (e) {
      var p = e.pedido_id ? mP[e.pedido_id] : null, chave = p ? "sis:" + p.id : "etapa:" + e.id;
      if (!grupos[chave]) {
        var info = (p && mI[p.id]) || {}, al = p && mA[p.id];
        grupos[chave] = { pedido: p ? String(p.numero_pedido || "") : "", chave: chave, pedidoSistemaId: p ? p.id : "", cliente: p ? p.cliente_nome || "" : "",
          local: p ? localTexto(p, mL[p.local_id]) : "", dataEvento: p && p.data_evento ? br(p.data_evento) : "",
          alertaMotorista: al ? { problema: al.problema, observacao: al.observacao, enviadoPor: al.enviado_por, status: al.status, abertoEm: dataHoraTexto(al.criado_em), resolucao: al.resolucao || "", resolvidoEm: dataHoraTexto(al.resolvido_em) } : null,
          infoLogistica: { baldeacao: info.baldeacao || "", escada: info.escada || "", caminhaoPerto: info.caminhao_perto || "", horarioLimite: info.horario_limite || "", lona: info.lona || "" },
          etapas: [] };
        if (p && andamento[p.id]) { grupos[chave].andamento = andamento[p.id]; }
      }
      var r = mR[e.id] || {};
      grupos[chave].etapas.push({ id: e.id, etapa: e.nome, dataEtapa: e.data, horario: hhmm(e.hora), caminhao: caminhoesDe(e).join(","), responsavel: responsavelDe(e),
        equipe: equipeDe(e).join("|"), equipeQtd: "", observacao: e.observacao || "", confirmadoDecorador: true, lona: grupos[chave].infoLogistica.lona,
        carregamento: null, montagem: e.tipo === "montagem" ? resumoMontagem(r, r.uniformizacao) : null,
        progressoDesmontagem: e.tipo === "desmontagem" ? { equipe: !!r.equipe, lista: !!r.lista_conferida, concluida: !!r.desmontagem_concluida } : null,
        freeVaga: mV[e.id] || null, trocas: mT[e.id] || [] });
    });
    var lst = Object.values(grupos).filter(function (g) { return g.etapas.some(function (e) { return e.dataEtapa >= inicio && e.dataEtapa <= fim; }); });
    lst.forEach(function (g) {
      var m = g.etapas.filter(function (e) { return norm(e.etapa) === "montagem"; })[0];
      g.dataPrincipal = m ? m.dataEtapa + "T" + (m.horario || "00:00") + ":00" : "2100-01-01T00:00:00";
    });
    lst.sort(function (a, b) { return a.dataPrincipal.localeCompare(b.dataPrincipal); });
    return lst;
  };

  /* ---------------- agenda interna ---------------- */
  L.getAgenda = async function () {
    var c = await sb(), emp = await empresa();
    var linhas = await tudo(function () { return c.from("operacao_agenda").select("*").eq("empresa_id", emp).gte("data", somarDias(hojeISO(), -120)).order("data"); });
    return linhas.map(function (a) { return { envio: a.id, responsavel: a.enviado_por, data: a.data, setor: a.setor, tipo: a.tipo, descricao: a.descricao, caminhao: a.caminhao, equipe: a.equipe, equipeQtd: "", horario: hhmm(a.hora) }; });
  };
  async function exigirAgenda() { if (!(await pode("logistica.cronograma.agenda"))) { throw new Error("Seu usuário não tem permissão para mexer na agenda."); } }
  function agendaCampos(d) { return { data: isoDeQualquer(d.data), hora: hhmm(d.horario) || null, setor: d.setor || "", tipo: d.tipo || "", descricao: d.descricao || "", caminhao: d.caminhao || "", equipe: d.equipe || "" }; }
  L.salvarAgenda = async function (d) {
    await exigirAgenda(); var c = await sb();
    if (!isoDeQualquer(d.data)) { throw new Error("Informe a data."); }
    await q(c.from("operacao_agenda").insert(Object.assign({ empresa_id: await empresa(), enviado_por: d.responsavel || (await meuNome()) }, agendaCampos(d))));
    return true;
  };
  L.atualizarAgendaPorEnvio = async function (obj) {
    await exigirAgenda(); var c = await sb();
    await q(c.from("operacao_agenda").update(agendaCampos(obj.dados || {})).eq("id", obj.envio));
    return true;
  };
  L.excluirAgendaPorEnvio = async function (envio) { await exigirAgenda(); var c = await sb(); await q(c.from("operacao_agenda").delete().eq("id", envio)); return true; };
  L.validarSenhaAgenda = function () { return pode("logistica.cronograma.agenda"); };

  /* ---------------- acesso (login do Acervo) ---------------- */
  var PERFIS = [["montagem", "logistica.cronograma.montagem"], ["internas", "logistica.cronograma.internas"], ["expedicao", "logistica.cronograma.expedicao"], ["frete", "logistica.cronograma.motorista"]];
  L.CRON_entrarComLogin = async function (contexto) {
    var p = await permissoes(), tem = PERFIS.filter(function (x) { return p[x[1]]; }).map(function (x) { return x[0]; });
    var ctx = norm(contexto);
    if (ctx.indexOf("equipe free") >= 0 && p["rh.colaboradores.editar"] && tem.indexOf("montagem") < 0) { tem.push("montagem"); }
    var pref = ctx.indexOf("expedi") >= 0 ? ["expedicao"] : ctx.indexOf("troca") >= 0 ? ["montagem", "internas"] : ["montagem", "internas", "expedicao", "frete"];
    var perfil = pref.filter(function (x) { return tem.indexOf(x) >= 0; })[0];
    if (!perfil) { return null; }
    return { valido: true, perfil: perfil, usuario: await meuNome(), token: "acervo", duracaoSegundos: 3600 };
  };
  L.validarSenhaPerfil = function () { return L.CRON_entrarComLogin(""); };
  L.validarAcessoExecucaoEtapa = async function () { return { valido: await pode("logistica.cronograma.montagem"), tipo: "SUPERVISOR" }; };
  L.getWebAppUrl = function () { return URL_APP; };
  L.MONT_getUrlApp = function () { return URL_APP + "?page=montador"; };
  L.FREE_getUrlApp = function () { return URL_APP + "?page=free"; };
  L.salvarConclusaoCarregamento = function () { throw new Error("O carregamento é conferido bipando as etiquetas (Expedição)."); };

  /* ---------------- listas oficiais (Cadastro de Funcionários, free e Logística > Caminhões) ---------------- */
  async function pessoas() { return (await rpc("operacao_pessoas")) || []; }
  async function caminhoesLista() {
    var c = await sb(), emp = await empresa();
    return q(c.from("caminhoes").select("id,modelo,codigo,placa,capacidade_m3,empresa_nome,tipo,status").eq("empresa_id", emp).eq("status", "ativo").order("codigo"));
  }
  L.listarCaminhoes = async function () { return (await caminhoesLista()).filter(function (k) { return k.codigo; }).map(function (k) { return { id: k.id, nome: k.modelo, tipo: k.codigo, empresa: k.empresa_nome || "", vinculo: k.tipo === "proprio" ? "Próprio" : "Terceiro", status: "Ativo", capacidade: Number(k.capacidade_m3) || 0 }; }); };
  L.listarResponsaveis = async function () { return (await pessoas()).filter(function (p) { return p.lider; }).map(function (p) { return { id: p.id, nome: p.nome, status: "Ativo" }; }); };
  L.listarEquipes = async function () { return (await pessoas()).map(function (p) { return { id: p.id, nome: p.nome, tipo: p.free ? "Free" : "Fixo", status: "Ativo" }; }); };
  L.getCaminhoes = async function () { return (await L.listarCaminhoes()).map(function (k) { return { tipo: k.tipo, empresa: k.empresa }; }); };
  L.getEquipes = async function () { return (await L.listarEquipes()).map(function (e) { return { nome: e.nome, tipo: e.tipo }; }); };

  /* ---------------- editar pedido (só etapas: cliente/local/itens vêm do Comercial) ---------------- */
  var TIPO = { "triagem (separacao)": "triagem_ida", "triagem (conferencia)": "triagem_volta", carregamento: "carregamento", montagem: "montagem", desmontagem: "desmontagem", descarregamento: "descarregamento" };
  function tipoDoNome(nome) { var n = norm(nome).replace(/[()]/g, function (x) { return x; }); return TIPO[norm(nome)] || (n.indexOf("triagem") >= 0 ? (n.indexOf("confer") >= 0 ? "triagem_volta" : "triagem_ida") : "outra"); }
  L.salvarPedidoCompleto = async function (payload) {
    payload = payload || {};
    var c = await sb(), emp = await empresa();
    var pedidoId = uuid(payload.pedidoSistemaId) || uuid(String(payload.chave || "").replace(/^sis:/, ""));
    if (!pedidoId) { throw new Error("Pedidos novos são criados no Comercial. Aqui só se ajustam as etapas."); }
    if (!(await pode("logistica.cronograma.editar")) && !(await pode("logistica.planejamento.editar"))) { throw new Error("Sem permissão para alterar o cronograma."); }
    var info = payload.infoLogistica || {};
    await q(c.from("operacao_pedidos_info").upsert({ pedido_id: pedidoId, empresa_id: emp, baldeacao: info.baldeacao || "", escada: info.escada || "", caminhao_perto: info.caminhaoPerto || "", horario_limite: info.horarioLimite || "", lona: info.lona || "", atualizado_em: new Date().toISOString() }));
    var antes = await q(c.from("operacao_etapas").select(SEL_ETAPA).eq("pedido_id", pedidoId));
    var mAntes = {}; antes.forEach(function (e) { mAntes[e.id] = e; });
    var ped = (await q(c.from("separacoes_pedidos").select("numero_pedido,cliente_nome").eq("id", pedidoId).maybeSingle())) || {};
    var usuario = await meuNome(), mov = crypto.randomUUID ? crypto.randomUUID() : null, alteracoes = [], manter = {}, novasSemEscala = [];
    var reg = function (et, campo, a, d) { if (String(a || "") !== String(d || "")) { alteracoes.push({ empresa_id: emp, etapa_id: et && et.id, pedido_id: pedidoId, descricao: campo, antes: String(a || ""), depois: String(d || ""), usuario_nome: usuario, movimento: mov, perfil: "", etapa_nome: et ? et.nome : "", cliente: ped.cliente_nome || "", pedido_numero: ped.numero_pedido || "" }); } };
    for (var e of (payload.etapas || [])) {
      var nome = String(e.etapa || "").trim(); if (!nome) { continue; }
      var data = isoDeQualquer(e.dataEtapa); if (!data) { throw new Error("Preencha a data da etapa " + nome + "."); }
      var hora = hhmm(e.horario) || null, id = uuid(e.id) && mAntes[e.id] ? e.id : null, et;
      if (id) {
        var a = mAntes[id];
        reg(a, "Data", br(a.data), br(data)); reg(a, "Horário", hhmm(a.hora), hora || ""); reg(a, "Observação", a.observacao, e.observacao || "");
        et = (await q(c.from("operacao_etapas").update({ nome: nome, tipo: tipoDoNome(nome), data: data, hora: hora, observacao: e.observacao || "" }).eq("id", id).select("id,nome").single()));
      } else {
        et = (await q(c.from("operacao_etapas").insert({ empresa_id: emp, pedido_id: pedidoId, nome: nome, tipo: tipoDoNome(nome), data: data, hora: hora, observacao: e.observacao || "", origem: "manual" }).select("id,nome").single()));
        reg(et, "Nova etapa", "", nome + " " + br(data));
      }
      manter[et.id] = true;
      var respAntes = id ? responsavelDe(mAntes[id]) : "", eqAntes = id ? equipeDe(mAntes[id]).join("|") : "", camAntes = id ? caminhoesDe(mAntes[id]).join(",") : "";
      var eq = lista(e.equipe), cams = String(e.caminhao || "").split(/[|,]/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!id && !String(e.responsavel || "").trim().replace(/^-$/, "") && !eq.length && !cams.length) { novasSemEscala.push(et.id); continue; }
      if (!id || respAntes !== (e.responsavel || "") || eqAntes !== eq.join("|") || camAntes !== cams.join(",")) {
        reg(et, "Responsável", respAntes, e.responsavel || ""); reg(et, "Equipe", eqAntes, eq.join("|")); reg(et, "Caminhão", camAntes, cams.join(","));
        await rpc("operacao_escala_salvar", { p_etapa: et.id, p_responsavel: e.responsavel || "", p_equipe: eq, p_caminhoes: cams, p_forcar: true });
      }
    }
    for (var x of antes) { if (!manter[x.id]) { reg(x, "Etapa removida", x.nome + " " + br(x.data), ""); await q(c.from("operacao_etapas").delete().eq("id", x.id)); } }
    if (alteracoes.length) { await q(c.from("operacao_alteracoes").insert(alteracoes)); }
    if (novasSemEscala.length) { await rpc("operacao_escala_preencher_etapas", { p_etapas: novasSemEscala }).catch(function () {}); }
    return { sucesso: true };
  };

  /* ---------------- histórico de alterações ---------------- */
  async function alteracoesDaSemana(inicio) {
    var c = await sb(), emp = await empresa(); inicio = isoDeQualquer(inicio) || hojeISO();
    var ini = new Date(inicio + "T00:00:00-03:00").toISOString(), fim = new Date(somarDias(inicio, 7) + "T00:00:00-03:00").toISOString();
    return tudo(function () { return c.from("operacao_alteracoes").select("*").eq("empresa_id", emp).gte("em", ini).lt("em", fim).order("em", { ascending: false }); });
  }
  L.getQuantidadeAlteracoesCronogramaSemana = async function (inicio) { var l = await alteracoesDaSemana(inicio); return new Set(l.map(function (a) { return (a.movimento || a.id) + ":" + a.etapa_id; })).size; };
  L.getAlteracoesCronogramaSemana = async function (inicio) {
    var g = {}, ordem = [];
    (await alteracoesDaSemana(inicio)).forEach(function (a) {
      var k = (a.movimento || a.id) + ":" + a.etapa_id;
      if (!g[k]) { g[k] = { usuario: a.usuario_nome || "", perfil: a.perfil || "", dataAlteracao: dataHoraTexto(a.em), pedido: a.pedido_numero || "", cliente: a.cliente || "", etapa: a.etapa_nome || "", alteracoes: [] }; ordem.push(k); }
      g[k].alteracoes.push({ campo: a.descricao, anterior: a.antes || "", novo: a.depois || "" });
    });
    return ordem.map(function (k) { return g[k]; });
  };

  /* ---------------- alertas do motorista, trocas e uniformização ---------------- */
  async function pedidoPorNumero(numero) {
    var c = await sb(), emp = await empresa();
    var p = await q(c.from("separacoes_pedidos").select("id").eq("empresa_id", emp).eq("numero_pedido", String(numero || "").trim()).order("criado_em", { ascending: false }).limit(1));
    if (!p.length) { throw new Error("Pedido não encontrado."); }
    return p[0].id;
  }
  L.salvarAlertaMotorista = async function (p) {
    p = p || {}; if (!String(p.problema || "").trim()) { throw new Error("Problema não informado."); } if (!String(p.observacao || "").trim()) { throw new Error("Informe uma observação."); }
    var c = await sb();
    await q(c.from("operacao_alertas_motorista").insert({ empresa_id: await empresa(), pedido_id: await pedidoPorNumero(p.pedido), problema: p.problema, observacao: p.observacao, enviado_por: await meuNome() }));
    return { sucesso: true };
  };
  L.resolverAlertaMotorista = async function (p) {
    p = p || {}; if (!String(p.resolucao || "").trim()) { throw new Error("Informe como o problema foi resolvido."); }
    var c = await sb(), ped = await pedidoPorNumero(p.pedido);
    await q(c.from("operacao_alertas_motorista").update({ status: "RESOLVIDO", resolucao: p.resolucao, resolvido_por: await meuNome(), resolvido_em: new Date().toISOString() }).eq("pedido_id", ped).neq("status", "RESOLVIDO"));
    return { sucesso: true };
  };
  L.TROCA_atualizarStatus = async function (token, idTroca, status) {
    var c = await sb(), nome = await meuNome(), agora = new Date().toISOString();
    if (status !== "SEPARADO" && status !== "ENVIADO") { throw new Error("Status inválido."); }
    var t = await q(c.from("operacao_trocas").select("*").eq("id", idTroca).single());
    if (status === "ENVIADO" && t.status !== "SEPARADO") { throw new Error("Marque como separado antes de enviar."); }
    var upd = status === "SEPARADO" ? { status: status, separado_por: nome, separado_em: agora } : { status: status, enviado_por: nome, enviado_em: agora };
    await q(c.from("operacao_trocas").update(upd).eq("id", idTroca));
    return (await q(c.from("operacao_trocas").select("*").eq("etapa_id", t.etapa_id).neq("status", "CANCELADO").order("solicitado_em"))).map(trocaLegado);
  };
  L.MON_salvarUniformizacaoEquipe = async function (idEtapa, valor) {
    var c = await sb();
    await q(c.from("operacao_registros").upsert({ empresa_id: await empresa(), etapa_id: idEtapa, tipo: "uniformizacao", dados: { valor: String(valor || ""), avaliadoPor: await meuNome(), avaliadoEm: dataHoraTexto(new Date()) }, autor: await meuNome(), atualizado_em: new Date().toISOString() }, { onConflict: "etapa_id,tipo" }));
    return { sucesso: true };
  };

  /* =====================================================================
     PAINEL LOGÍSTICO (mesmas respostas do antigo Escala.js)
     ===================================================================== */
  function tipoRegra(t) { return t === "triagem_ida" || t === "triagem_volta" ? "triagem" : t; }
  L.ESC_painel = async function (inicio, dias, preencher) {
    var c = await sb(), emp = await empresa();
    if (!(await pode("logistica.planejamento.visualizar")) && !(await pode("logistica.cronograma.visualizar"))) { throw new Error("Sem permissão para o Painel Logístico."); }
    inicio = isoDeQualquer(inicio) || hojeISO(); dias = Math.max(1, Math.min(14, Number(dias) || 7));
    var fim = somarDias(inicio, dias - 1), preenchidas = 0;
    if (preencher) { preenchidas = await rpc("operacao_escala_preencher_periodo", { p_empresa_id: emp, p_inicio: inicio, p_fim: fim }); }
    var regras = await rpc("operacao_regras_escala", { p_empresa: emp });
    var etapas = await tudo(function () { return c.from("operacao_etapas").select(SEL_ETAPA + ",pedido:separacoes_pedidos(numero_pedido,cliente_nome,local_nome)").eq("empresa_id", emp).gte("data", inicio).lte("data", fim).order("data").order("hora"); });
    var conflitos = await rpc("operacao_conflitos", { p_empresa: emp, p_inicio: inicio, p_fim: fim });
    var vagas = await emLote(etapas.map(function (e) { return e.id; }), function (b) { return c.from("free_vagas").select("id,etapa_id").in("etapa_id", b).neq("status", "CANCELADA"); });
    var insc = await emLote(vagas.map(function (v) { return v.id; }), function (b) { return c.from("free_inscricoes").select("vaga_id,nome,status").in("vaga_id", b).eq("status", "CONFIRMADO"); });
    var vols = {}; for (var pid of Array.from(new Set(etapas.map(function (e) { return e.pedido_id; }).filter(Boolean)))) { vols[pid] = await rpc("operacao_volume_pedido", { p_pedido: pid }); }
    var cams = await caminhoesLista(), pess = await pessoas();
    var hoje = hojeISO(), mConf = {}; (conflitos || []).forEach(function (x) { (mConf[x.etapa_id] = mConf[x.etapa_id] || []).push(x.mensagem); });
    var vagaDe = {}; vagas.forEach(function (v) { vagaDe[v.etapa_id] = v.id; });
    return { inicio: inicio, fim: fim, hoje: hoje, preenchidas: preenchidas || 0, regras: regras,
      pessoas: pess.map(function (p) { return { nome: p.nome, equipe: p.equipe, lider: p.lider, free: p.free }; }),
      caminhoes: cams.map(function (k) { return { id: k.id, modelo: k.modelo, codigo: k.codigo || "", placa: k.placa, capacidade: Number(k.capacidade_m3) || 0, empresa: k.empresa_nome || "", vinculo: k.tipo === "proprio" ? "Próprio" : "Terceiro" }; }),
      etapas: etapas.map(function (e) {
        var conf = regras.etapas && regras.etapas[tipoRegra(e.tipo)], v = vols[e.pedido_id] || {}, m3 = Number(v.m3) || 0, estimado = !(m3 > 0);
        if (estimado) { m3 = Number(regras.volume_padrao_m3) || 0; }
        var sug = conf ? Math.min(Number(conf.maximo) || 99, Math.max(Number(conf.minimo) || 1, Math.ceil(m3 / Math.max(0.5, Number(conf.m3_por_pessoa) || 1)))) : 0;
        var resp = responsavelDe(e), eq = equipeDe(e), cs = caminhoesDe(e), av = [];
        if (conf) {
          var tem = (resp ? 1 : 0) + eq.length;
          if (tem < sug) { av.push("Equipe pequena: " + tem + " de " + sug + " pessoas sugeridas"); }
          if (!resp) { av.push("Sem responsável (nenhum líder livre)"); }
          if (conf.caminhao && !cs.length) { av.push("Sem caminhão"); }
          if (conf.caminhao && cs.length) {
            var cap = cs.reduce(function (t, cod) { var k = cams.filter(function (x) { return norm(x.codigo) === norm(cod); })[0]; return t + (k ? Number(k.capacidade_m3) || 0 : 0); }, 0);
            if (cap > 0 && m3 > cap) { av.push("Caminhão pequeno: " + cap + " m³ para " + m3 + " m³"); }
            if (!cap) { av.push("Capacidade do caminhão não cadastrada"); }
          }
        }
        return { id: e.id, pedido: e.pedido ? String(e.pedido.numero_pedido || "") : "", cliente: e.pedido ? e.pedido.cliente_nome || "" : "", local: e.pedido ? e.pedido.local_nome || "" : "",
          etapa: e.nome, tipo: tipoRegra(e.tipo), data: e.data, hora: hhmm(e.hora), responsavel: resp, equipe: eq, caminhoes: cs, pedidoSistemaId: e.pedido_id || "",
          m3: m3, pecas: Number(v.pecas) || 0, volumeEstimado: estimado, sugerido: sug,
          freeConfirmados: insc.filter(function (i) { return i.vaga_id === vagaDe[e.id]; }).map(function (i) { return i.nome; }),
          conflitos: Array.from(new Set(mConf[e.id] || [])), avisos: av, passada: e.data < hoje };
      }) };
  };
  L.ESC_salvarEtapa = async function (id, dados, forcar) {
    try {
      var r = await rpc("operacao_escala_salvar", { p_etapa: id, p_responsavel: (dados && dados.responsavel) || "", p_equipe: (dados && dados.equipe) || [], p_caminhoes: (dados && dados.caminhoes) || [], p_forcar: !!forcar });
      return { ok: true, conflitos: r.conflitos || [] };
    } catch (e) {
      var m = String(e.message || "").match(/CONFLITO:(\[.*\])/);
      if (m) { return { ok: false, conflitos: JSON.parse(m[1]) }; }
      throw e;
    }
  };
  L.ESC_listas = async function () { return { pessoas: await pessoas(), caminhoes: await L.listarCaminhoes() }; };

  /* =====================================================================
     EQUIPE FREE (tela interna)
     ===================================================================== */
  async function detalheVaga(idVaga) {
    var d = await freeTudo();
    var v = d.vagas.filter(function (x) { return x.idVaga === idVaga; })[0];
    if (!v) { throw new Error("Vaga não encontrada."); }
    var lst = d.inscricoes.filter(function (i) { return i.idVaga === idVaga; });
    v.inscricoes = lst.map(function (i) {
      i.miniatura = (d.cadastros[i.idFree] || {}).foto_url || ""; i.nota = (d.notas[i.idFree] || fNotaVazia()).nota;
      if (i.status === "CONFIRMADO") { i.presenca = fResumo(v, i); }
      return i;
    });
    v.confirmados = lst.filter(function (i) { return i.status === "CONFIRMADO"; }).length;
    return v;
  }
  async function exigirFreeAdmin() {
    if (!(await pode("logistica.planejamento.editar")) && !(await pode("rh.colaboradores.editar")) && !(await pode("logistica.cronograma.montagem"))) { throw new Error("Sem permissão para a Equipe Free."); }
  }
  L.FREE_admDetalheVaga = function (t, idVaga) { return detalheVaga(idVaga); };
  L.FREE_admBuscarVagaPorEtapa = async function (t, idEtapa) {
    var c = await sb(); var v = await q(c.from("free_vagas").select("id").eq("etapa_id", idEtapa).neq("status", "CANCELADA").limit(1));
    return v.length ? detalheVaga(v[0].id) : null;
  };
  L.FREE_admSalvarVaga = async function (t, dados) {
    await exigirFreeAdmin(); dados = dados || {};
    var c = await sb(), emp = await empresa();
    var qtd = Math.floor(Number(dados.quantidade)), ponto = String(dados.pontoEncontro || "").trim().slice(0, 300), lider = String(dados.lider || "").trim().slice(0, 120), horario = String(dados.horario || "").trim();
    var valor = Math.round((typeof dados.valor === "number" ? dados.valor : Number(String(dados.valor == null ? "" : dados.valor).replace(/\./g, "").replace(",", "."))) * 100) / 100;
    var modo = ["TODOS", "PRIORIDADE", "EXCLUSIVA"].indexOf(dados.modo) >= 0 ? dados.modo : "TODOS";
    var prefs = (Array.isArray(dados.preferidos) ? dados.preferidos : []).map(String).filter(uuid);
    if (!(valor > 0)) { throw new Error("Informe o valor da diária."); }
    if (modo !== "TODOS" && !prefs.length) { throw new Error("Escolha quem recebe a vaga primeiro."); }
    if (!(qtd >= 1 && qtd <= 50)) { throw new Error("Informe quantos free você precisa (1 a 50)."); }
    if (fMin(horario) == null) { throw new Error("Informe o horário de encontro."); }
    if (!ponto) { throw new Error("Informe o ponto de encontro."); }
    if (!lider) { throw new Error("Informe o líder da equipe."); }
    var atual = null;
    if (uuid(dados.idVaga)) { atual = await q(c.from("free_vagas_v").select("*").eq("id", dados.idVaga).maybeSingle()); }
    if (!atual && uuid(dados.idEtapa)) { atual = (await q(c.from("free_vagas_v").select("*").eq("etapa_id", dados.idEtapa).neq("status", "CANCELADA").limit(1)))[0] || null; }
    var etapaId = atual ? atual.etapa_id : uuid(dados.idEtapa);
    var et = etapaId ? await q(c.from("operacao_etapas").select("id,data,hora").eq("id", etapaId).maybeSingle()) : null;
    if (!et) { throw new Error("Etapa não encontrada no cronograma."); }
    var lat = dados.pontoLat === "" || dados.pontoLat == null ? null : Number(dados.pontoLat), lng = dados.pontoLng === "" || dados.pontoLng == null ? null : Number(dados.pontoLng);
    if ((lat == null || lng == null) && atual && atual.ponto_encontro === ponto) { lat = atual.ponto_lat; lng = atual.ponto_lng; }
    var prazo = Number(dados.prazoMin) || 0, liberar = null;
    if (modo === "PRIORIDADE") { liberar = prazo > 0 ? new Date(Date.now() + prazo * 60000).toISOString() : (atual && atual.modo === "PRIORIDADE" && atual.liberar_em) || new Date(Date.now() + 120 * 60000).toISOString(); }
    var campos = { horario: hhmm(horario), horario_etapa_base: hhmm(et.hora), ponto_encontro: ponto, ponto_lat: lat, ponto_lng: lng, lider: lider, quantidade: qtd, observacao: String(dados.observacao || "").slice(0, 500), valor: valor, modo: modo, preferidos: prefs, liberar_em: liberar, atualizado_em: new Date().toISOString() };
    if (atual) {
      var conf = (await q(c.from("free_inscricoes").select("id").eq("vaga_id", atual.id).eq("status", "CONFIRMADO"))).length;
      if (qtd < conf) { throw new Error("Já há " + conf + " free confirmados. Retire alguém antes de diminuir para " + qtd + "."); }
      await q(c.from("free_vagas").update(campos).eq("id", atual.id));
      return detalheVaga(atual.id);
    }
    if (fPassou({ dataISO: et.data, horario: horario })) { throw new Error("Esta etapa já passou. Os free só veem vagas de hoje em diante."); }
    var nova = await q(c.from("free_vagas").insert(Object.assign({ empresa_id: emp, etapa_id: et.id, criado_por: await meuNome() }, campos)).select("id").single());
    return detalheVaga(nova.id);
  };
  L.FREE_admAlterarStatusVaga = async function (t, idVaga, status) {
    await exigirFreeAdmin(); if (["ABERTA", "ENCERRADA", "CANCELADA"].indexOf(status) < 0) { throw new Error("Status inválido."); }
    var c = await sb(); await q(c.from("free_vagas").update({ status: status, atualizado_em: new Date().toISOString() }).eq("id", idVaga));
    return detalheVaga(idVaga);
  };
  L.FREE_admRemoverInscricao = async function (t, idIns) {
    await exigirFreeAdmin(); var c = await sb();
    var i = await q(c.from("free_inscricoes").update({ status: "REMOVIDO", cancelado_em: new Date().toISOString(), motivo: "Retirado pelo supervisor", cancelado_por: await meuNome() }).eq("id", idIns).select("vaga_id").single());
    return detalheVaga(i.vaga_id);
  };
  L.FREE_admLancarPresenca = async function (t, idIns, tipo, hora) {
    await exigirFreeAdmin(); var min = fMin(hora);
    if (min == null) { throw new Error("Informe o horário (ex.: 07:30)."); }
    if (tipo !== "checkin" && tipo !== "checkout") { throw new Error("Tipo inválido."); }
    var c = await sb(), quem = (await meuNome()) + " (manual)";
    var i = await q(c.from("free_inscricoes").select("*").eq("id", idIns).eq("status", "CONFIRMADO").maybeSingle());
    if (!i) { throw new Error("Confirmação não encontrada."); }
    var v = await q(c.from("free_vagas_v").select("*").eq("id", i.vaga_id).single());
    if (tipo === "checkin") {
      var quando = new Date(v.data + "T" + pad(Math.floor(min / 60)) + ":" + pad(min % 60) + ":00-03:00");
      await q(c.from("free_inscricoes").update({ data_ciente: v.data, horario_ciente: v.horario, checkin_em: quando.toISOString(), checkin_lat: null, checkin_lng: null, checkin_distancia: null, checkin_via: "Manual", presenca_por: quem }).eq("id", idIns));
    } else {
      if (!i.checkin_em) { throw new Error("Lance o check-in antes do check-out."); }
      var e = partes(i.checkin_em), saida = new Date(e.year + "-" + e.month + "-" + e.day + "T" + pad(Math.floor(min / 60)) + ":" + pad(min % 60) + ":00-03:00");
      if (saida <= new Date(i.checkin_em)) { saida = new Date(saida.getTime() + 86400000); }
      await q(c.from("free_inscricoes").update({ checkout_em: saida.toISOString(), checkout_lat: null, checkout_lng: null, checkout_distancia: null, presenca_por: quem }).eq("id", idIns));
    }
    return detalheVaga(i.vaga_id);
  };
  L.FREE_admListarVagas = async function (t, ini, fim) {
    var d = await freeTudo(function (x) { return x.gte("data", ini).lte("data", fim); });
    var pv = porVaga(d.inscricoes);
    return d.vagas.map(function (v) {
      var lst = pv[v.idVaga] || [], conf = lst.filter(function (i) { return i.status === "CONFIRMADO"; });
      return Object.assign(v, { confirmados: conf.length, cancelados: lst.filter(function (i) { return i.status === "CANCELADO"; }).length,
        cimaDaHora: lst.filter(function (i) { return i.status === "CANCELADO" && i.cimaDaHora; }).length, checkins: conf.filter(function (i) { return i.checkinEm; }).length,
        checkouts: conf.filter(function (i) { return i.checkoutEm; }).length, faltas: conf.filter(function (i) { return fFase(v, i) === "FALTOU"; }).length,
        mudancasPendentes: conf.filter(function (i) { return fMudanca(v, i); }).length, nomes: conf.map(function (i) { return i.nome; }) });
    }).sort(function (a, b) { return (a.dataISO + a.horario).localeCompare(b.dataISO + b.horario); });
  };
  L.FREE_admListarCadastros = async function () {
    var d = await freeTudo(), mv = {}; d.todasVagas.forEach(function (v) { mv[v.idVaga] = v; });
    return Object.values(d.cadastros).sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }).map(function (c) {
      var minhas = d.inscricoes.filter(function (i) { return i.idFree === c.id; }), conf = minhas.filter(function (i) { return i.status === "CONFIRMADO"; }), n = d.notas[c.id] || fNotaVazia();
      return { id: c.id, nome: c.nome, cpf: c.cpf, telefone: c.telefone, status: String(c.status).toUpperCase(), cadastradoEm: dataHoraTexto(c.created_at), ultimoAcesso: dataHoraTexto(c.ultimo_acesso),
        fotoUrl: c.foto_url || "", miniatura: c.foto_url || "", nota: n.nota, historico: n.historico, confirmacoes: conf.length,
        trabalhos: conf.filter(function (i) { return i.checkinEm; }).length,
        faltas: conf.filter(function (i) { var v = mv[i.idVaga]; return v && fFase(v, i) === "FALTOU"; }).length,
        cancelamentos: minhas.filter(function (i) { return i.status === "CANCELADO"; }).length, cimaDaHora: minhas.filter(function (i) { return i.cimaDaHora; }).length };
    });
  };
  L.FREE_admListarAprovados = async function () {
    var d = await freeTudo();
    return Object.values(d.cadastros).filter(function (c) { return c.status === "aprovado"; }).map(function (c) {
      var n = d.notas[c.id] || fNotaVazia(); return { id: c.id, nome: c.nome, telefone: c.telefone, nota: n.nota, trabalhos: n.trabalhos, faltas: n.faltas };
    }).sort(function (a, b) { return b.nota - a.nota || b.trabalhos - a.trabalhos || a.nome.localeCompare(b.nome); });
  };
  L.FREE_admAlterarStatusCadastro = async function (t, idFree, status) {
    await exigirFreeAdmin(); var s = String(status || "").toLowerCase();
    if (["pendente", "aprovado", "bloqueado"].indexOf(s) < 0) { throw new Error("Status inválido."); }
    var c = await sb(); await q(c.from("free_cadastros").update({ status: s }).eq("id", idFree));
    return L.FREE_admListarCadastros();
  };
  function qrComLinks(d) {
    d.urlQr = URL_APP + "?page=free&c=" + encodeURIComponent(d.idVaga + "." + d.codigo);
    d.linkLider = URL_APP + "?page=free-qr&v=" + encodeURIComponent(d.idVaga) + "&k=" + encodeURIComponent(d.chaveLider || "");
    delete d.chaveLider;
    return d;
  }
  L.FREE_admQrVaga = async function (t, idVaga) { return qrComLinks(await rpc("free_adm_qr", { p_vaga: idVaga })); };
  L.FREE_liderQr = async function (idVaga, chave) { return qrComLinks(await rpc("free_lider_qr", { p_vaga: idVaga, p_chave: chave })); };

  /* =====================================================================
     PAINEL RH FREE (tela interna: entra com o login do Acervo)
     ===================================================================== */
  function dinheiro(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function inicioCiclo(iso) { var d = iso ? new Date(iso + "T12:00:00") : new Date(); var volta = (d.getDay() - 2 + 7) % 7; d.setDate(d.getDate() - volta); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  async function rhConfig() { var c = await sb(), emp = await empresa(); var r = await q(c.from("free_rh_config").select("*").eq("empresa_id", emp).maybeSingle()); return { valorHora: r ? Number(r.valor_hora) || 0 : 0, horasDiaria: r ? Number(r.horas_diaria) || 8 : 8 }; }
  function rhCalcular(v, i, pag, uni, cfg) {
    var fase = fFase(v, i), min = fTrabalhados(i), e = fParse(i.checkinEm), marc = fQuando(v), atraso = e && marc ? Math.round((e - marc) / 60000) : 0;
    var diaria = dinheiro(v.valor), extraMin = min != null ? Math.max(0, min - Math.round(cfg.horasDiaria * 60)) : 0, extraValor = dinheiro(extraMin / 60 * cfg.valorHora);
    var motivos = [], situacao = "PAGAR";
    if (fase === "FALTOU") { situacao = "NAO_PAGAR"; motivos.push("Faltou (sem check-in)"); }
    else if (fase === "AGUARDANDO" || fase === "CHECKIN" || fase === "TRABALHANDO") { situacao = "EM_ANDAMENTO"; }
    else {
      if (fase === "SEM_CHECKOUT") { motivos.push("Sem check-out: horas não calculadas"); }
      if (i.presencaPor) { motivos.push("Presença lançada à mão por " + i.presencaPor); }
      if (i.checkinDistancia !== "" && i.checkinDistancia > F.DIST_ALERTA) { motivos.push("Check-in a " + (i.checkinDistancia / 1000).toFixed(1).replace(".", ",") + " km do ponto"); }
      if (atraso > F.TOLERANCIA_ATRASO) { motivos.push("Chegou " + atraso + " min atrasado"); }
      if (!i.fotoUniforme && !i.presencaPor) { motivos.push("Sem foto de uniforme"); }
      if (uni && uni.avaliacao === "INCOMPLETO") { motivos.push("Uniforme incompleto"); }
      if (uni && uni.avaliacao === "SEM") { motivos.push("Sem uniforme"); }
      if (motivos.length) { situacao = "REVISAR"; }
    }
    if (pag && pag.naoPagar) { situacao = "NAO_PAGAR"; motivos.unshift("Marcado para não pagar"); }
    var pagavel = situacao === "PAGAR" || situacao === "REVISAR";
    var total = pagavel ? dinheiro(diaria + (pag && pag.pagarExtra ? extraValor : 0) + (pag ? pag.ajuste : 0)) : 0;
    if (pag && pag.valorPago != null && pag.pagoEm) { situacao = "PAGO"; }
    return { fase: fase, minutos: min, horas: fDuracao(min), atrasoMin: Math.max(0, atraso), diaria: diaria, extraMin: extraMin, extraTexto: fDuracao(extraMin), extraValor: extraValor, total: situacao === "PAGO" ? pag.valorPago : total, situacao: situacao, motivos: motivos };
  }
  function pagLegado(p) { return p ? { pagarExtra: !!p.pagar_extra, ajuste: Number(p.ajuste) || 0, motivoAjuste: p.motivo_ajuste || "", naoPagar: !!p.nao_pagar, valorPago: p.valor_pago == null ? null : Number(p.valor_pago), pagoEm: dataHoraTexto(p.pago_em), forma: p.forma || "", pagoPor: p.pago_por || "" } : null; }
  async function rhCiclo(inicioISO) {
    var c = await sb(), emp = await empresa(), ini = inicioCiclo(isoDeQualquer(inicioISO) || ""), fim = somarDias(ini, 6), cfg = await rhConfig();
    var d = await freeTudo(function (x) { return x.gte("data", ini).lte("data", fim).neq("status", "CANCELADA"); });
    var pags = await tudo(function () { return c.from("free_rh_pagamentos").select("*").eq("empresa_id", emp); }), mPag = {}; pags.forEach(function (p) { mPag[p.inscricao_id] = pagLegado(p); });
    var etIds = d.vagas.map(function (v) { return v.idEtapa; });
    var ets = await emLote(etIds, function (b) { return c.from("operacao_etapas").select(SEL_ETAPA).in("id", b); }), mEt = {}; ets.forEach(function (e) { mEt[e.id] = e; });
    var regs = await emLote(etIds, function (b) { return c.from("operacao_registros").select("etapa_id,tipo,dados").in("etapa_id", b); }), mR = {}; regs.forEach(function (r) { (mR[r.etapa_id] = mR[r.etapa_id] || {})[r.tipo] = r.dados; });
    var trs = await emLote(etIds, function (b) { return c.from("operacao_trocas").select("*").in("etapa_id", b).neq("status", "CANCELADO"); });
    var pv = porVaga(d.inscricoes);
    var eventos = d.vagas.map(function (v) {
      var et = mEt[v.idEtapa] || {}, r = mR[v.idEtapa] || {}, fotos = [];
      var add = function (url, tipo, leg) { if (url) { fotos.push({ url: url, tipo: tipo, legenda: leg || "" }); } };
      if (r.equipe) { add(r.equipe.foto, "equipe", "Foto da equipe" + (r.equipe.empresa ? " · " + r.equipe.empresa : "")); }
      ((r.sacolas && r.sacolas.sacolas) || []).forEach(function (s) { (s.fotos || []).forEach(function (u) { add(u, "sacola", "Sacola " + (s.codigo || "")); }); });
      ((r.posicionamento && r.posicionamento.fotos) || []).forEach(function (u, k) { add(u, "posicionamento", "Posicionamento " + (k + 1)); });
      if (r.lista_assinada) { add(r.lista_assinada.foto, "lista", "Lista assinada" + (r.lista_assinada.nome ? " · " + r.lista_assinada.nome : "")); }
      ((r.lista_conferida && r.lista_conferida.fotos) || []).forEach(function (u, k) { add(u, "lista", "Lista conferida · pág. " + (k + 1)); });
      trs.filter(function (t) { return t.etapa_id === v.idEtapa; }).forEach(function (t) { add(t.foto_url, "troca", "Troca: " + t.quantidade + "× " + t.item); });
      return { idVaga: v.idVaga, idEtapa: v.idEtapa, pedido: v.pedido, cliente: v.cliente, local: v.local, etapa: v.etapa, dataISO: v.dataISO, horario: v.horario, lider: v.lider,
        responsavel: responsavelDe(et) || v.lider, valor: v.valor, quantidade: v.quantidade, fotos: fotos,
        pessoas: (pv[v.idVaga] || []).filter(function (i) { return i.status === "CONFIRMADO"; }).map(function (i) {
          var cad = d.cadastros[i.idFree] || {}, pag = mPag[i.id] || null, uni = d.uniformes[i.id] ? { avaliacao: d.uniformes[i.id].avaliacao, observacao: d.uniformes[i.id].observacao, avaliadoPor: d.uniformes[i.id].avaliado_por } : null;
          return { idInscricao: i.id, idFree: i.idFree, nome: i.nome, cpf: cad.cpf || "", telefone: i.telefone, pix: cad.chave_pix || "", nota: (d.notas[i.idFree] || fNotaVazia()).nota,
            checkinEm: i.checkinEm, checkoutEm: i.checkoutEm, via: i.checkinVia, distancia: i.checkinDistancia, presencaPor: i.presencaPor, fotoUniforme: i.fotoUniforme, fotoUniformeId: "",
            uniforme: uni, pagamento: pag, calc: rhCalcular(v, i, pag, uni, cfg), miniatura: cad.foto_url || "" };
        }) };
    }).sort(function (a, b) { return (a.dataISO + a.horario).localeCompare(b.dataISO + b.horario); });
    return { inicio: ini, fim: fim, config: cfg, eventos: eventos, usuario: await meuNome() };
  }
  async function exigirRh() { if (!(await pode("rh.colaboradores.editar")) && !(await pode("logistica.cronograma.montagem"))) { throw new Error("Sem permissão para o Painel RH Free."); } }
  L.RH_login = async function () {
    await exigirRh();
    return { token: "acervo", nome: await meuNome(), cicloAtual: inicioCiclo("") };
  };
  L.RH_sair = function () { return true; };
  L.RH_carregarCiclo = async function (t, ini) { await exigirRh(); return rhCiclo(ini); };
  async function gravarPag(idIns, ini, campos) {
    var c = await sb();
    await q(c.from("free_rh_pagamentos").upsert(Object.assign({ inscricao_id: idIns, empresa_id: await empresa(), ciclo: inicioCiclo(isoDeQualquer(ini) || ""), atualizado_por: await meuNome(), atualizado_em: new Date().toISOString() }, campos), { onConflict: "inscricao_id" }));
  }
  L.RH_salvarDiaria = async function (t, ini, idIns, dados) {
    await exigirRh(); dados = dados || {};
    var c = await sb(), atual = await q(c.from("free_rh_pagamentos").select("pago_em").eq("inscricao_id", idIns).maybeSingle());
    if (atual && atual.pago_em) { throw new Error("Esta diária já foi paga. Desfaça o pagamento para alterar."); }
    var ajuste = dinheiro(String(dados.ajuste == null ? "" : dados.ajuste).replace(",", ".")), motivo = String(dados.motivoAjuste || "").trim().slice(0, 200);
    if (ajuste !== 0 && !motivo) { throw new Error("Informe o motivo do ajuste."); }
    await gravarPag(idIns, ini, { pagar_extra: !!dados.pagarExtra, ajuste: ajuste, motivo_ajuste: ajuste ? motivo : "", nao_pagar: !!dados.naoPagar });
    return rhCiclo(ini);
  };
  L.RH_marcarPago = async function (t, ini, ids, forma) {
    await exigirRh(); var ciclo = await rhCiclo(ini), por = {}, nome = await meuNome();
    ciclo.eventos.forEach(function (ev) { ev.pessoas.forEach(function (p) { por[p.idInscricao] = p; }); });
    for (var id of (ids || [])) {
      var p = por[id]; if (!p || (p.calc.situacao !== "PAGAR" && p.calc.situacao !== "REVISAR")) { continue; }
      await gravarPag(id, ciclo.inicio, { valor_pago: p.calc.total, pago_em: new Date().toISOString(), forma: String(forma || "PIX").slice(0, 40), pago_por: nome });
    }
    return rhCiclo(ciclo.inicio);
  };
  L.RH_desfazerPago = async function (t, ini, idIns) { await exigirRh(); await gravarPag(idIns, ini, { valor_pago: null, pago_em: null, forma: null, pago_por: null }); return rhCiclo(ini); };
  L.RH_avaliarUniforme = async function (t, ini, idIns, avaliacao, obs) {
    await exigirRh(); var c = await sb();
    if (["OK", "INCOMPLETO", "SEM", ""].indexOf(avaliacao) < 0) { throw new Error("Avaliação inválida."); }
    if (!avaliacao) { await q(c.from("free_rh_uniforme").delete().eq("inscricao_id", idIns)); }
    else { await q(c.from("free_rh_uniforme").upsert({ inscricao_id: idIns, empresa_id: await empresa(), avaliacao: avaliacao, observacao: String(obs || "").slice(0, 300), avaliado_por: await meuNome(), avaliado_em: new Date().toISOString() }, { onConflict: "inscricao_id" })); }
    return rhCiclo(ini);
  };
  L.RH_salvarConfig = async function (t, ini, valorHora, horas) {
    await exigirRh(); var v = dinheiro(String(valorHora).replace(",", ".")), h = Number(String(horas).replace(",", "."));
    if (v < 0) { throw new Error("Valor da hora inválido."); }
    if (!(h > 0 && h <= 24)) { throw new Error("Informe quantas horas a diária cobre (1 a 24)."); }
    var c = await sb(); await q(c.from("free_rh_config").upsert({ empresa_id: await empresa(), valor_hora: v, horas_diaria: h }, { onConflict: "empresa_id" }));
    return rhCiclo(ini);
  };
  L.RH_exportarCiclo = async function (t, ini) {
    await exigirRh(); var ciclo = await rhCiclo(ini);
    // CPF e PIX completos para pagar: só com a permissão de ver dados sensíveis do RH (fica registrado); sem ela, sai a máscara
    var ids = []; ciclo.eventos.forEach(function (ev) { ev.pessoas.forEach(function (p) { if (ids.indexOf(p.idFree) < 0) { ids.push(p.idFree); } }); });
    var abertos = {};
    if (ids.length) { try { abertos = (await funcaoFree({ action: "revelar_rh", empresa_id: await empresa(), ids: ids, motivo: "exportar pagamento dos free" })).valores || {}; } catch (e) { abertos = {}; } }
    ciclo.eventos.forEach(function (ev) { ev.pessoas.forEach(function (p) { var a = abertos[p.idFree]; if (a) { p.cpf = a.cpf; p.pix = a.pix; } }); });
    var linhas = [["Data", "Evento", "Etapa", "Free", "CPF", "Chave PIX", "Check-in", "Check-out", "Horas", "Hora extra", "Diária", "Hora extra (R$)", "Ajuste", "Motivo do ajuste", "Total", "Situação", "Observações", "Pago em", "Forma"]];
    ciclo.eventos.forEach(function (ev) { ev.pessoas.forEach(function (p) { var k = p.calc, g = p.pagamento || {}; linhas.push([br(ev.dataISO), ev.cliente + " (#" + ev.pedido + ")", ev.etapa, p.nome, p.cpf, p.pix, p.checkinEm, p.checkoutEm, k.horas, k.extraTexto, k.diaria, g.pagarExtra ? k.extraValor : 0, g.ajuste || 0, g.motivoAjuste || "", k.total, k.situacao, k.motivos.join("; "), g.pagoEm || "", g.forma || ""]); }); });
    var csv = "﻿" + linhas.map(function (l) { return l.map(function (x) { return '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
    return URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  };
  L.RH_fichaFree = async function (t, idFree) {
    await exigirRh(); var d = await freeTudo(), cfg = await rhConfig(), c = await sb();
    var cad = d.cadastros[idFree]; if (!cad) { throw new Error("Free não encontrado."); }
    var pags = await tudo(function () { return c.from("free_rh_pagamentos").select("*").eq("empresa_id", cad.empresa_id || cad.empresa || cache.empresa); }), mPag = {}; pags.forEach(function (p) { mPag[p.inscricao_id] = pagLegado(p); });
    var mv = {}; d.todasVagas.forEach(function (v) { mv[v.idVaga] = v; });
    var hist = d.inscricoes.filter(function (i) { return i.idFree === idFree; }).map(function (i) {
      var v = mv[i.idVaga] || {}, uni = d.uniformes[i.id];
      return { dataISO: v.dataISO, etapa: v.etapa, cliente: v.cliente, pedido: v.pedido, status: i.status, motivoCancelamento: i.motivo, cimaDaHora: i.cimaDaHora, checkinEm: i.checkinEm, checkoutEm: i.checkoutEm,
        uniforme: uni ? uni.avaliacao : "", calc: i.status === "CONFIRMADO" && v.idVaga ? rhCalcular(v, i, mPag[i.id] || null, uni || null, cfg) : null };
    }).sort(function (a, b) { return String(b.dataISO).localeCompare(String(a.dataISO)); });
    var ano = String(new Date().getFullYear()), mes = hojeISO().slice(0, 7), pagos = hist.filter(function (h) { return h.calc && h.calc.situacao === "PAGO"; });
    var soma = function (l) { return dinheiro(l.reduce(function (s, h) { return s + h.calc.total; }, 0)); };
    return { id: cad.id, nome: cad.nome, cpf: cad.cpf, telefone: cad.telefone, pix: cad.chave_pix || "", status: String(cad.status).toUpperCase(), cadastradoEm: dataHoraTexto(cad.created_at), miniatura: cad.foto_url || "",
      pontuacao: d.notas[cad.id] || fNotaVazia(), recebidoMes: soma(pagos.filter(function (h) { return String(h.dataISO).slice(0, 7) === mes; })),
      recebidoAno: soma(pagos.filter(function (h) { return String(h.dataISO).slice(0, 4) === ano; })),
      aPagar: soma(hist.filter(function (h) { return h.calc && (h.calc.situacao === "PAGAR" || h.calc.situacao === "REVISAR"); })), historico: hist };
  };

  /* =====================================================================
     APP DO MONTADOR (login: nome + PIN do Cadastro de Funcionários)
     ===================================================================== */
  function tokMont() { try { return localStorage.getItem("montadorToken") || ""; } catch (e) { return ""; } }
  function pastaMont() { try { return localStorage.getItem("montadorPasta") || ""; } catch (e) { return ""; } }
  var nomesMont = {};
  L.MONT_listarResponsaveis = async function () {
    var l = (await rpc("mont_nomes")) || []; nomesMont = {};
    l.forEach(function (p) { nomesMont[p.nome] = p.id; });
    return l.map(function (p) { return p.nome; });
  };
  L.MONT_login = async function (nome, senha, supervisor) {
    var r;
    if (supervisor) {
      var c = await sb(), u = (await c.auth.getUser()).data.user;
      if (!u) { throw new Error("Para entrar como supervisor, entre antes no sistema (Acervo) neste aparelho com o seu usuário."); }
      r = await rpc("mont_login_supervisor");
    } else {
      if (!nomesMont[nome]) { await L.MONT_listarResponsaveis(); }
      if (!nomesMont[nome]) { throw new Error("Escolha o seu nome."); }
      if (!String(senha || "").trim()) { throw new Error("Digite o seu PIN."); }
      r = await rpc("mont_login", { p_funcionario: nomesMont[nome], p_pin: String(senha).trim() });
    }
    try { localStorage.setItem("montadorPasta", r.pasta); } catch (e) {}
    return { token: r.token, nome: r.nome, perfil: r.perfil };
  };
  L.MONT_sair = function (t) { return rpc("app_sair", { p_token: t }); };
  L.MONT_appCarregar = async function (token, idExtra) {
    var d = await rpc("mont_dados", { p_token: token, p_id_extra: uuid(idExtra) });
    try { if (d.pasta) { localStorage.setItem("montadorPasta", d.pasta); } } catch (e) {}
    var etapas = (d.etapas || []).map(function (e) {
      var r = e.registros || {}, info = e.info || {}, ch = r.equipe && r.equipe.chegada, p = ch && ch.em ? partes(ch.em) : null;
      return { id: e.id, pedido: e.pedido, dataEvento: e.dataEvento || "", cliente: e.cliente, local: e.local, etapa: e.etapa, dataISO: e.dataISO, horario: e.horario || "",
        caminhao: e.caminhao || "", responsavel: e.responsavel, equipe: e.equipe || [], observacao: e.observacao || "", lat: e.lat == null ? "" : e.lat, lng: e.lng == null ? "" : e.lng,
        lona: info.lona || "", confirmadoDecorador: true, operacao: e.tipo === "montagem" || e.tipo === "desmontagem" ? e.tipo : "",
        registros: (r.equipe ? 1 : 0) + (r.sacolas ? 1 : 0) + (r.posicionamento ? 1 : 0) + (r.observacoes ? 1 : 0) + (r.lista_assinada ? 1 : 0),
        chegadaEquipe: r.equipe ? { empresa: r.equipe.empresa, quantidade: r.equipe.quantidade, foto: r.equipe.foto, data: p ? p.day + "/" + p.month + "/" + p.year : "", hora: p ? p.hour + ":" + p.minute : "",
          origemChegada: ch ? "CHEGADA_V1" : "", previsto: ch ? ch.previsto : "", minutosAtraso: ch ? ch.atraso : "", localStatus: ch ? ch.localStatus : "", uniformizada: r.uniformizacao ? r.uniformizacao.valor : "" } : null,
        free: e.free ? Object.assign({}, e.free, { pessoas: (e.free.pessoas || []).map(function (x) { return Object.assign({}, x, { checkinEm: dataHoraTexto(x.checkinEm), checkoutEm: dataHoraTexto(x.checkoutEm) }); }) }) : null,
        trocas: (e.trocas || []).map(trocaLegado), sacolasMontagem: e.sacolasMontagem || [], alerta: e.alerta || null,
        info: { baldeacao: info.baldeacao || "", escada: info.escada || "", caminhaoPerto: info.caminhao_perto || "", horarioLimite: info.horario_limite || "" },
        outrasEtapas: e.outrasEtapas || [] };
    });
    var a = d.apontamento ? Object.assign({}, d.apontamento, { inicio: d.apontamento.inicio, fim: d.apontamento.fim || "" }) : null;
    var resp = { nome: d.nome, perfil: d.perfil, etapas: etapas, apontamento: a };
    if (d.avisoExtra) { resp.avisoExtra = d.avisoExtra; }
    return resp;
  };
  L.MONT_qrVaga = async function (token, idEtapa) { return qrComLinks(await rpc("mont_qr_vaga", { p_token: token, p_etapa: idEtapa })); };
  L.MONT_iniciarApontamento = function (token, idEtapa) { return rpc("mont_apontamento_iniciar", { p_token: token, p_etapa: idEtapa }); };
  L.MONT_finalizarApontamento = function (token, id) { return rpc("mont_apontamento_finalizar", { p_token: token, p_id: id }); };
  L.MONT_apontamentoAtual = async function (token) { return (await L.MONT_appCarregar(token, "")).apontamento; };
  L.MONT_solicitarTroca = async function (token, dados) {
    dados = Object.assign({}, dados || {}); dados.foto = await subirFoto(dados.foto, pastaMont());
    return (await rpc("mont_troca_solicitar", { p_token: token, p_dados: dados })).map(trocaLegado);
  };
  L.MONT_cancelarTroca = async function (token, id) { return (await rpc("mont_troca_cancelar", { p_token: token, p_troca: id })).map(trocaLegado); };
  function ler(tipo) { return function (id) { return rpc("mont_registro_ler", { p_token: tokMont(), p_etapa: id, p_tipo: tipo }); }; }
  async function salvarReg(id, tipo, dados) { return rpc("mont_registro_salvar", { p_token: tokMont(), p_etapa: id, p_tipo: tipo, p_dados: dados }); }
  L.verificarEquipeTerceirizadaJaEnviada = ler("equipe");
  L.verificarSacolasJaEnviadas = async function (id) { var r = await ler("sacolas")(id); r.sacolas = r.sacolas || []; return r; };
  L.verificarPosicionamentoJaEnviado = async function (id) { var r = await ler("posicionamento")(id); r.fotos = r.fotos || []; return r; };
  L.buscarObservacoesMontagem = async function (id) { var r = await ler("observacoes")(id); return { observacao: r.enviado ? r.observacao || "" : "" }; };
  L.verificarListaAssinadaJaEnviada = ler("lista_assinada");
  L.verificarListaConferidaDesmontagem = async function (id) { var r = await ler("lista_conferida")(id); r.fotos = r.fotos || []; return r; };
  L.verificarDesmontagemConcluida = async function (id) { var r = await ler("desmontagem_concluida")(id); return { concluida: !!r.enviado }; };
  L.salvarEquipeTerceirizada = async function (d) {
    var foto = await subirFoto(d.foto, pastaMont());
    var r = await rpc("mont_registro_salvar", { p_token: d.token || tokMont(), p_etapa: d.idCronograma, p_tipo: "equipe", p_dados: { empresa: d.empresa || "", quantidade: String(d.quantidade || ""), observacao: d.observacao || "", foto: foto, latitude: d.latitude, longitude: d.longitude, precisaoGPS: d.precisaoGPS } });
    return { sucesso: true, chegada: r.chegada || null };
  };
  L.salvarSacolasProtecao = async function (d) {
    var sacolas = []; for (var s of (d.sacolas || [])) { sacolas.push({ codigo: s.codigo, fotos: [await subirFoto(s.foto, pastaMont())] }); }
    var r = await salvarReg(d.idCronograma, "sacolas", { sacolas: sacolas });
    return { sucesso: true, sacolas: r.sacolas || sacolas };
  };
  L.salvarPosicionamentoItens = async function (d) {
    var fotos = []; for (var f of (d.fotos || [])) { fotos.push(await subirFoto(f, pastaMont())); }
    var r = await salvarReg(d.idCronograma, "posicionamento", { observacao: d.observacao || "", fotos: fotos });
    return { sucesso: true, fotos: r.fotos || fotos };
  };
  L.salvarObservacoesMontagem = async function (d) { await salvarReg(d.idCronograma, "observacoes", { observacao: d.observacao || "", responsavel: d.responsavel || "" }); return { sucesso: true }; };
  L.salvarListaAssinada = async function (d) { await salvarReg(d.idCronograma, "lista_assinada", { nome: d.nome || "", foto: await subirFoto(d.foto, pastaMont()) }); return { sucesso: true }; };
  L.salvarListaConferidaDesmontagem = async function (d) {
    var fotos = []; for (var f of (d.fotos || [])) { fotos.push(await subirFoto(f, pastaMont())); }
    var r = await salvarReg(d.idCronograma, "lista_conferida", { fotos: fotos });
    return { sucesso: true, fotos: r.fotos || fotos };
  };
  L.concluirDesmontagem = async function (d) { await salvarReg(d.idCronograma, "desmontagem_concluida", { em: new Date().toISOString() }); return { sucesso: true }; };
  L.buscarItensOperacao = function (texto) { return rpc("mont_itens", { p_token: tokMont(), p_texto: String(texto || "") }); };
  L.buscarEmpresasTerceirizadas = function () { return []; };

  /* =====================================================================
     APP DO FREE (login: CPF + senha)
     ===================================================================== */
  function pastaFree() { try { return localStorage.getItem("freePasta") || ""; } catch (e) { return ""; } }
  L.FREE_appCadastrar = async function (dados) {
    dados = dados || {};
    if (!dados.foto) { throw new Error("Tire uma foto do rosto para o cadastro."); }
    var r = await funcaoFree({ action: "cadastrar", dados: { nome: dados.nome, cpf: dados.cpf, telefone: dados.telefone, senha: dados.senha, pix: dados.pix } });
    try { localStorage.setItem("freePasta", r.pasta); } catch (e) {}
    var url = await subirFoto(dados.foto, r.pasta);
    await rpc("free_app_foto", { p_token: r.token, p_url: url });
    return { token: r.token };
  };
  L.FREE_appLogin = async function (cpf, senha) {
    var r = await funcaoFree({ action: "login", cpf: cpf, senha: senha });
    try { localStorage.setItem("freePasta", r.pasta); } catch (e) {}
    return { token: r.token };
  };
  L.FREE_appSair = function (t) { return rpc("app_sair", { p_token: t }).catch(function () { return true; }); };
  L.FREE_appCarregar = async function (token) {
    var d = await rpc("free_app_dados", { p_token: token }), f = d.free;
    try { if (f.pasta) { localStorage.setItem("freePasta", f.pasta); } } catch (e) {}
    var perfil = { nome: f.nome, cpf: f.cpf, telefone: f.telefone, pix: f.pix, status: f.status, miniatura: f.miniatura };
    if (f.status !== "APROVADO") { return { perfil: perfil, vagas: [], minhas: [] }; }
    var vagas = (d.vagas || []).map(function (v) {
      return { idVaga: v.idVaga, idEtapa: v.idEtapa, etapa: v.etapa, dataISO: v.dataISO, horario: v.horario, pontoEncontro: v.pontoEncontro, pontoLat: v.pontoLat == null ? "" : Number(v.pontoLat),
        pontoLng: v.pontoLng == null ? "" : Number(v.pontoLng), lider: v.lider, observacao: v.observacao, quantidade: Number(v.quantidade) || 0, status: v.status, valor: Number(v.valor) || "",
        modo: v.modo, preferidos: (v.preferidos || []).map(String), liberarEm: v.liberarEm || "", etapaRemovida: false,
        inscricoes: (v.inscricoes || []).map(function (i) { return { id: i.id, idVaga: v.idVaga, idFree: i.idFree, nome: i.nome, status: i.status, confirmadoEm: dataHoraTexto(i.confirmadoEm), cimaDaHora: !!i.cimaDaHora,
          dataCiente: i.dataCiente || "", horarioCiente: i.horarioCiente || "", checkinEm: dataHoraTexto(i.checkinEm), checkoutEm: dataHoraTexto(i.checkoutEm), presencaPor: i.presencaPor || "", uniforme: i.uniforme || "" }; }) };
    });
    var mv = {}; vagas.forEach(function (v) { mv[v.idVaga] = v; });
    var minhasIns = []; vagas.forEach(function (v) { v.inscricoes.forEach(function (i) { if (i.idFree === f.id) { minhasIns.push(i); } }); });
    perfil.pontuacao = fPontuacao(minhasIns, mv);
    var abertas = [], minhas = [];
    vagas.forEach(function (v) {
      var lst = v.inscricoes, conf = lst.filter(function (i) { return i.status === "CONFIRMADO"; }), minha = lst.filter(function (i) { return i.idFree === f.id; }).pop() || null;
      var item = { idVaga: v.idVaga, etapa: v.etapa, dataISO: v.dataISO, horario: v.horario, pontoEncontro: v.pontoEncontro, valor: v.valor,
        convite: v.modo !== "TODOS" && v.preferidos.indexOf(f.id) >= 0,
        reservaAte: v.modo === "PRIORIDADE" && v.preferidos.indexOf(f.id) >= 0 && fParse(v.liberarEm) && fParse(v.liberarEm).getTime() > Date.now() ? v.liberarEm : "",
        pontoLat: v.pontoLat, pontoLng: v.pontoLng, lider: v.lider, observacao: v.observacao, quantidade: v.quantidade, confirmados: conf.length,
        restantes: Math.max(0, v.quantidade - conf.length), status: v.status, passou: fPassou(v), minhaStatus: minha ? minha.status : "", minhaConfirmadaEm: minha ? minha.confirmadoEm : "",
        colegas: conf.filter(function (i) { return i.idFree !== f.id; }).map(function (i) { return String(i.nome || "").split(" ")[0]; }) };
      if (minha && minha.status === "CONFIRMADO") {
        var fase = fFase(v, minha), quando = fQuando(v);
        item.fase = fase; item.mudanca = fMudanca(v, minha); item.checkinEm = minha.checkinEm; item.checkoutEm = minha.checkoutEm;
        item.horasTrabalhadas = fDuracao(fTrabalhados(minha));
        item.checkinAbreEm = quando ? dataHoraTexto(new Date(quando.getTime() - F.CHECKIN_ANTES * 3600000)) : "";
        item.podeCancelar = !minha.checkinEm && !item.passou && (fase === "AGUARDANDO" || fase === "CHECKIN");
      }
      if (item.minhaStatus) { minhas.push(item); }
      if (v.status === "ABERTA" && !item.passou && item.minhaStatus !== "CONFIRMADO" && item.minhaStatus !== "REMOVIDO" && fVisivel(v, f.id)) { abertas.push(item); }
    });
    var porData = function (a, b) { return (a.dataISO + a.horario).localeCompare(b.dataISO + b.horario); };
    abertas.sort(function (a, b) { return a.convite !== b.convite ? (a.convite ? -1 : 1) : porData(a, b); });
    minhas.sort(porData);
    return { perfil: perfil, vagas: abertas, minhas: minhas };
  };
  L.FREE_appConfirmar = async function (t, idVaga) { await rpc("free_app_confirmar", { p_token: t, p_vaga: idVaga }); return L.FREE_appCarregar(t); };
  L.FREE_appCancelar = async function (t, idVaga, motivo) { await rpc("free_app_cancelar", { p_token: t, p_vaga: idVaga, p_motivo: motivo || "" }); return L.FREE_appCarregar(t); };
  L.FREE_appCiente = async function (t, idVaga) { await rpc("free_app_ciente", { p_token: t, p_vaga: idVaga }); return L.FREE_appCarregar(t); };
  L.FREE_appSalvarPix = async function (t, pix) { await funcaoFree({ action: "pix", token: t, pix: pix }); return L.FREE_appCarregar(t); };
  L.FREE_appPresenca = async function (t, idVaga, codigo, gps) {
    gps = Object.assign({}, gps || {});
    if (gps.foto) { gps.foto = await subirFoto(gps.foto, pastaFree()); }
    var registro = await rpc("free_app_presenca", { p_token: t, p_vaga: idVaga, p_codigo: String(codigo || ""), p_gps: gps });
    var dados = await L.FREE_appCarregar(t);
    dados.registro = registro; dados.registroVaga = idVaga;
    return dados;
  };
})();
