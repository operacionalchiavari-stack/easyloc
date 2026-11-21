/* =====================================================
   PÓS-VENDA (out/2026, no banco)
   posvenda_lista gera as ligações a partir das Posições finais confirmadas (regras em Parâmetros > Comercial) e
   devolve as ligações + a configuração (formulário). posvenda_registrar: concluir (formulário), não atendeu ou não ligar.
===================================================== */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const dataBr = (v) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "-");
  const dataHora = (v) => (v ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  const S = { sb: null, emp: null, dados: { contatos: [], config: {} }, aba: "ligacoes", atual: null };
  const avisar = (m, t = "Pós-venda", tipo = "aviso") => window.alerta ? window.alerta(m, t, tipo) : alert(m);
  async function rpc(nome, args) { const { data, error } = await S.sb.rpc(nome, args); if (error) throw new Error(error.message || error); return data; }

  async function carregar() {
    S.dados = await rpc("posvenda_lista", { p_empresa: S.emp });
    pintar();
  }

  // Abas (out/2026): Ligações (para ligar hoje + as próximas, numa lista só) · Precisam de atenção · Concluídas.
  function grupo(c) {
    if (c.status === "pendente") return "ligacoes";
    if (c.status === "concluido" && c.atencao && !c.tratativa_concluida_em) return "atencao";
    return "feitas";
  }

  function clienteHtml(c) {
    const ini = String(c.cliente_nome || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
    const foto = /^https?:\/\//.test(c.foto || "") ? '<img src="' + esc(c.foto) + '" alt="">' : esc(ini);
    return '<div class="pv-cli"><span class="pv-foto">' + foto + "</span><span><b>" + esc(c.cliente_nome) + "</b>" + (c.novo ? '<span class="pv-selo novo">Cliente novo</span>' : "") + "</span></div>";
  }
  function foneHtml(c) {
    const fone = String(c.telefone || "").replace(/\D/g, "");
    return fone ? '<a href="tel:+55' + fone + '">' + esc(c.telefone) + '</a><small><a href="https://wa.me/55' + fone + '" target="_blank" rel="noopener">WhatsApp</a></small>' : '<small>Sem telefone</small>';
  }
  const eventosHtml = (c) => (c.pedidos || []).map((p) => '<div class="pv-ev"><b>Pedido ' + esc(p.numero) + "</b> · " + dataBr(p.data_evento) + "<small>" + esc([p.tipo, p.local].filter(Boolean).join(" · ")) + "</small></div>").join("") || "—";

  // 15/11/2026: montador responsável (etapa Montagem) e posição final de cada pedido da ligação.
  const iniciaisPv = (n) => String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "?";
  function fotoMontador(m) {
    let url = m.free_foto || "";
    if (!url && m.funcionario_id) { try { url = S.sb.storage.from("avatares").getPublicUrl(S.emp + "/" + m.funcionario_id + ".jpg").data?.publicUrl || ""; } catch (_) {} }
    return '<span class="pv-mini-foto"><i>' + esc(iniciaisPv(m.nome)) + "</i>" + (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>";
  }
  const montadorHtml = (c) => (c.pedidos || []).map((p) => p.montador ? '<div class="pv-montador">' + fotoMontador(p.montador) + "<span>" + esc(p.montador.nome) + ((c.pedidos || []).length > 1 ? "<small>Pedido " + esc(p.numero) + "</small>" : "") + "</span></div>" : '<div class="pv-montador"><small>Sem responsável na montagem</small></div>').join("") || "—";
  const posicaoHtml = (c) => (c.pedidos || []).map((p) => {
    const oc = Number(p.ocorrencias || 0);
    return '<div class="pv-posicao">' + (p.posicao_final ? '<button type="button" class="pv-doc" data-posicao="' + p.id + '" title="Abrir o documento da posição final">📄 ' + ((c.pedidos || []).length > 1 ? "Pedido " + esc(p.numero) : "Ver documento") + "</button>" : "<small>Posição não confirmada</small>") +
      '<span class="pv-oc ' + (oc ? "tem" : "") + '">' + (oc ? oc + " ocorrência" + (oc > 1 ? "s" : "") : "Sem ocorrências") + "</span></div>";
  }).join("") || "—";
  async function abrirPosicaoFinal(pedidoId) {
    try {
      const base = await rpc("posvenda_posicao_final", { p_empresa: S.emp, p_pedido: pedidoId });
      const modulo = await import("../../Financeiro/financeiro-posicao-documento.mjs?v=20261108-posicao-documento");
      const { data: emp } = await S.sb.from("empresas").select("nome,logo_url").eq("id", S.emp);
      const p = base.pedido || {};
      let endereco = p.observacoes?.projeto_comercial?.dados?.evento?.endereco || "";
      if (p.local_id) { const { data: locais } = await S.sb.from("locais_empresas").select("endereco").eq("empresa_id", S.emp).eq("id", p.local_id); if (locais?.[0]?.endereco) endereco = locais[0].endereco; }
      const contato = (S.dados.contatos || []).find((c) => (c.pedidos || []).some((x) => x.id === pedidoId));
      modulo.abrirDocumentoPosicao({ base, linhas: base.salvo?.itens || base.itens || [], empresa: emp?.[0], decorador: { nome: p.cliente_nome, logo_url: contato?.foto || "" }, endereco });
    } catch (e) { avisar(e.message || String(e)); }
  }
  // 15/11/2026: valor, quem vendeu, problemas do evento e a última ligação do cliente.
  const brlPv = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const TIPOS_PROBLEMA = { falta: "Falta", sobra: "Sobra", avaria: "Avaria", protecao_insuficiente: "Proteção insuficiente", sem_protecao: "Proteção não aplicada",
    divergencia_contagens: "Divergência entre contagens", perda: "Perda confirmada", reprovacao: "Inspeção reprovada", atraso_inicio: "Atraso no início da etapa",
    saida_sem_registro: "Saída sem registro", entrega_incompleta: "Entrega incompleta", coleta_incompleta: "Coleta incompleta", divergencia_entrega: "Diferença na entrega", avaria_entrega: "Móvel avariado na entrega", carregamento_incompleto: "Carregamento incompleto", confirmacao_entrega_atrasada: "Entrega confirmada com atraso",
    confirmacao_coleta_atrasada: "Coleta confirmada com atraso", retorno_pendente: "Triagem da volta pendente", equipe_sem_escala: "Etapa sem equipe escalada",
    equipe_incompleta: "Equipe incompleta", caminhao_sem_escala: "Sem caminhão programado", checklist_incompleto: "Registros da etapa incompletos",
    posicionamento_incorreto: "Posicionamento incorreto", uniforme_reprovado: "Uniforme reprovado", checkin_atrasado: "Freelancer chegou atrasado",
    alerta_motorista: "Alerta do motorista", troca_solicitada: "Troca de móvel solicitada", limpeza: "Limpeza", manutencao: "Manutenção", outro: "Outro" };
  const nomeProblema = (t) => TIPOS_PROBLEMA[t] || String(t || "Problema").replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());
  function fotoUsuario(nome, id) {
    let url = "";
    if (id) { try { url = S.sb.storage.from("avatares").getPublicUrl(S.emp + "/" + id + ".jpg").data?.publicUrl || ""; } catch (_) {} }
    return '<span class="pv-mini-foto pv-mini-foto-p"><i>' + esc(iniciaisPv(nome)) + "</i>" + (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>";
  }
  const vendedorHtml = (p) => p.vendedor?.nome ? '<span class="pv-vendedor">' + fotoUsuario(p.vendedor.nome, p.vendedor.usuario_id) + "<span>Vendido por " + esc(p.vendedor.nome) + "</span></span>" : "";
  const eventosLinhaHtml = (c) => (c.pedidos || []).map((p) => '<div class="pv-ev"><b>Pedido ' + esc(p.numero) + "</b> · " + dataBr(p.data_evento) + "<small>" + esc([p.tipo, p.local].filter(Boolean).join(" · ")) + "</small></div>").join("") || "—";
  const valorColHtml = (c) => (c.pedidos || []).map((p) => '<div class="pv-valor-lin">' + (Number(p.valor) ? '<span class="pv-valor">' + brlPv(p.valor) + "</span>" : "<small>—</small>") + ((c.pedidos || []).length > 1 ? "<small>Pedido " + esc(p.numero) + "</small>" : "") + "</div>").join("") || "—";
  // Coluna própria "Vendido por" (15/11/2026): uma linha por pedido, com o número quando a ligação cobre mais de um.
  const vendidoPorHtml = (c) => (c.pedidos || []).map((p) => p.vendedor?.nome ? '<div class="pv-montador">' + fotoUsuario(p.vendedor.nome, p.vendedor.usuario_id).replace("pv-mini-foto pv-mini-foto-p", "pv-mini-foto") + "<span>" + esc(p.vendedor.nome) + ((c.pedidos || []).length > 1 ? "<small>Pedido " + esc(p.numero) + "</small>" : "") + "</span></div>" : '<div class="pv-montador"><small>Sem vendedor registrado</small></div>').join("") || "—";
  const problemasDe = (p) => {
    const lista = (p.problemas || []).map((x) => nomeProblema(x.tipo) + (Number(x.qtd) > 1 ? " (" + x.qtd + "×)" : "") + (Array.isArray(x.itens) && x.itens.length ? ": " + x.itens.slice(0, 4).join(", ") + (x.itens.length > 4 ? "…" : "") : ""));
    const sep = Number(p.separacao_problemas || 0); if (sep) lista.push(sep + " problema(s) reportado(s) na separação");
    return lista;
  };
  const problemasHtml = (c) => (c.pedidos || []).map((p) => {
    const lista = problemasDe(p), n = (p.problemas || []).reduce((a, x) => a + (Number(x.qtd) || 1), 0) + Number(p.separacao_problemas || 0);
    return '<div class="pv-posicao">' + ((c.pedidos || []).length > 1 ? "<small>Pedido " + esc(p.numero) + "</small>" : "") + '<span class="pv-oc ' + (n ? "tem" : "") + '" title="' + esc(lista.join("\n")) + '">' + (n ? n + " problema" + (n > 1 ? "s" : "") : "Sem problemas") + "</span></div>";
  }).join("") || "—";
  function ultimaHtml(c, completo) {
    const u = c.ultima_ligacao; if (!u) return completo ? "<small>Primeira ligação para este cliente.</small>" : "";
    const ruins = Array.isArray(u.ruins) ? u.ruins : [];
    const sel = ruins.length || u.atencao ? '<span class="pv-oc tem">Teve reclamação</span>' : '<span class="pv-oc">Tudo bem</span>';
    if (!completo) return '<div class="pv-ultima"><small>Última ligação ' + dataBr(u.em) + "</small>" + sel + "</div>";
    return '<div class="pv-ultima-det">' + sel + " <small>" + dataHora(u.em) + (u.por ? " · " + esc(u.por) : "") + "</small>" + (ruins.length ? '<ul class="pv-ruins">' + ruins.map((r) => "<li>" + esc(r) + "</li>").join("") + "</ul>" : "") + (u.observacao ? '<p class="pv-ult-obs">“' + esc(u.observacao) + "”</p>" : "") + "</div>";
  }
  function linhaLigacao(c) {
    const hoje = S.dados.hoje, liberada = c.disponivel_em <= hoje, atrasada = liberada && c.prazo && c.prazo < hoje;
    const quando = !liberada ? '<span class="pv-selo">A partir de ' + dataBr(c.disponivel_em) + "</span>" + (c.ultimo_contato ? "<small>Último contato " + dataBr(c.ultimo_contato) + "</small>" : "<small>Intervalo entre contatos</small>")
      : atrasada ? '<span class="pv-selo atrasada">Atrasada</span><small>Era até ' + dataBr(c.prazo) + "</small>" : '<span class="pv-selo hoje">Ligar agora</span><small>Até ' + dataBr(c.prazo) + "</small>";
    // 15/11/2026: os botões saíram da linha; clicar na linha abre a gaveta com os dados e as ações (abrirLigacao).
    return '<tr class="pv-linha-lig ' + (liberada ? "" : "is-futura") + (atrasada ? " is-atrasada" : "") + '" data-abrir-lig="' + c.id + '" tabindex="0" title="Abrir a ligação"><td>' + clienteHtml(c) + ultimaHtml(c) + "</td><td>" + foneHtml(c) + "</td><td>" + eventosLinhaHtml(c) + '</td><td class="num">' + valorColHtml(c) + "</td><td>" + vendidoPorHtml(c) + "</td><td>" + montadorHtml(c) + "</td><td>" + problemasHtml(c) + "</td><td>" + posicaoHtml(c) + "</td><td>" + quando + (c.tentativas ? "<small>" + c.tentativas + " tentativa" + (c.tentativas > 1 ? "s" : "") + "</small>" : "") + "</td></tr>";
  }

  // 15/11/2026: últimos elogios e últimos feedbacks negativos do cliente, a partir das ligações anteriores (respostas,
  // observação) e do resultado das conversas do WhatsApp. Elogio = resposta na melhor opção da pergunta ou o que mais
  // gostou; negativo = opção marcada como ruim, crítica da conversa ou observação de ligação que precisou de atenção.
  function feedbacksDe(c) {
    const perguntas = (S.dados.config?.perguntas) || [], bons = [], ruins = [];
    const rot = (pergunta, r) => String(pergunta || "").replace(/[?:\s]+$/, "") + " — " + r;
    for (const h of Array.isArray(c.historico) ? c.historico : []) {
      const quando = dataBr(h.em);
      for (const r of Array.isArray(h.respostas) ? h.respostas : []) {
        const resp = (r.respostas || []).filter(Boolean); if (!resp.length) continue;
        if (r.ruim) { ruins.push({ t: rot(r.pergunta, resp.join(", ")), quando }); continue; }
        const p = perguntas.find((x) => x.texto === r.pergunta);
        if (p?.tipo === "multipla") { bons.push({ t: "Gostou de: " + resp.join(", "), quando }); continue; }
        const melhor = p?.opcoes?.find((o) => !o.ruim)?.texto;
        if (melhor && resp.includes(melhor)) bons.push({ t: rot(r.pergunta, melhor), quando });
      }
      for (const e of h.elogios || []) bons.push({ t: e, quando, wpp: true });
      for (const e of h.criticas || []) ruins.push({ t: e, quando, wpp: true });
      if (h.observacao && h.atencao) ruins.push({ t: "“" + h.observacao + "”", quando });
      else if (h.observacao) bons.push({ t: "“" + h.observacao + "”", quando });
    }
    return { bons: bons.slice(0, 6), ruins: ruins.slice(0, 6) };
  }
  function feedbacksHtml(c) {
    const { bons, ruins } = feedbacksDe(c);
    const lista = (xs, vazio) => xs.length ? '<ul class="pv-fb-lista">' + xs.map((x) => "<li>" + esc(x.t) + "<small>" + x.quando + (x.wpp ? " · WhatsApp" : "") + "</small></li>").join("") + "</ul>" : '<p class="pv-fb-vazio">' + vazio + "</p>";
    const vazio = (c.historico || []).length ? "Nada registrado." : "Primeira ligação para este cliente.";
    return '<div class="pv-fb"><section class="pv-fb-card bom"><h4>Últimos elogios</h4>' + lista(bons, vazio) + '</section><section class="pv-fb-card ruim"><h4>Últimos feedbacks negativos</h4>' + lista(ruins, vazio) + "</section></div>";
  }
  // 15/11/2026: abas na tela da ligação: Eventos desta ligação · Equipe · Caminhão (o cliente pode comentar sobre quem foi).
  const NOME_ETAPA = { carregamento: "Carregamento", montagem: "Montagem", desmontagem: "Desmontagem", descarregamento: "Descarregamento" };
  const horaPv = (h) => (h ? String(h).slice(0, 5) : "");
  // 15/11/2026: elogio / feedback negativo direto para a pessoa da equipe (um clique; clicar de novo desfaz).
  const chaveEq = (pedido, etapa, nome) => pedido + "|" + etapa + "|" + nome;
  function botoesEq(p, e, x) {
    const marcado = (S.eqFb || {})[chaveEq(p.id, e.tipo, x.nome)] || "";
    const at = ' data-ped="' + esc(p.id) + '" data-etapa="' + esc(e.tipo) + '" data-nome="' + esc(x.nome) + '"';
    return '<span class="pv-eq-fb">' +
      '<button type="button" class="pv-eq-btn elogio' + (marcado === "elogio" ? " on" : "") + '" data-eq-fb="elogio"' + at + ' aria-pressed="' + (marcado === "elogio") + '" title="Elogio para ' + esc(x.nome) + '">👍<span>Elogio</span></button>' +
      '<button type="button" class="pv-eq-btn negativo' + (marcado === "negativo" ? " on" : "") + '" data-eq-fb="negativo"' + at + ' aria-pressed="' + (marcado === "negativo") + '" title="Feedback negativo para ' + esc(x.nome) + '">👎<span>Negativo</span></button></span>';
  }
  async function carregarEqFb(c) {
    S.eqFb = {};
    try {
      const { data } = await S.sb.from("posvenda_equipe_feedback").select("pedido_id,etapa_tipo,nome,tipo").eq("contato_id", c.id);
      (data || []).forEach((f) => { S.eqFb[chaveEq(f.pedido_id, f.etapa_tipo, f.nome)] = f.tipo; });
    } catch (_) {}
    pintarEqFb();
  }
  function pintarEqFb() {
    document.querySelectorAll("#pvGaveta [data-eq-fb]").forEach((b) => {
      const on = (S.eqFb || {})[chaveEq(b.dataset.ped, b.dataset.etapa, b.dataset.nome)] === b.dataset.eqFb;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
    });
  }
  async function marcarEq(b) {
    const k = chaveEq(b.dataset.ped, b.dataset.etapa, b.dataset.nome), antes = (S.eqFb || {})[k], novo = antes === b.dataset.eqFb ? null : b.dataset.eqFb;
    S.eqFb = S.eqFb || {}; if (novo) S.eqFb[k] = novo; else delete S.eqFb[k]; pintarEqFb();
    try {
      const lista = await rpc("posvenda_equipe_marcar", { p_empresa: S.emp, p_contato: S.ligAtual.id, p_pedido: b.dataset.ped, p_etapa: b.dataset.etapa, p_nome: b.dataset.nome, p_tipo: novo });
      S.eqFb = {}; (lista || []).forEach((f) => { S.eqFb[chaveEq(f.pedido_id, f.etapa, f.nome)] = f.tipo; }); pintarEqFb();
    } catch (e) { if (antes) S.eqFb[k] = antes; else delete S.eqFb[k]; pintarEqFb(); avisar(e.message || String(e)); }
  }
  function pessoaEquipe(x, p, e) {
    const foto = x.free_foto ? '<span class="pv-eq-foto"><i>' + esc(iniciaisPv(x.nome)) + '</i><img src="' + esc(x.free_foto) + '" alt="" loading="lazy" onerror="this.remove()"></span>'
      : fotoMontador({ nome: x.nome, funcionario_id: x.funcionario_id }).replace("pv-mini-foto", "pv-eq-foto");
    const papel = x.papel === "responsavel" ? '<span class="pv-eq-papel resp">Responsável</span>' : x.free ? '<span class="pv-eq-papel free">Freelancer</span>' : '<span class="pv-eq-papel">' + esc(x.setor || "Equipe") + "</span>";
    return '<li class="pv-eq-pessoa">' + foto + '<span class="pv-eq-nome"><b>' + esc(x.nome) + "</b>" + papel + "</span>" + (p && e ? botoesEq(p, e, x) : "") + "</li>";
  }
  function equipeHtml(c, editavel = true) {
    const ped = c.pedidos || [], varios = ped.length > 1;
    const html = ped.map((p) => {
      const etapas = (p.etapas || []).filter((e) => (e.pessoas || []).length);
      if (!etapas.length) return varios ? '<p class="pv-fb-vazio"><b>Pedido ' + esc(p.numero) + "</b> · Sem equipe escalada.</p>" : "";
      return (varios ? '<h5 class="pv-eq-ped">Pedido ' + esc(p.numero) + "</h5>" : "") + etapas.map((e) => '<section class="pv-eq-etapa"><header><b>' + esc(e.nome || NOME_ETAPA[e.tipo] || e.tipo) + "</b><small>" + dataBr(e.data) + (e.hora ? " · " + horaPv(e.hora) : "") + "</small></header><ul>" + e.pessoas.map((x) => pessoaEquipe(x, editavel ? p : null, e)).join("") + "</ul></section>").join("");
    }).join("");
    return html.replace(/<p class="pv-fb-vazio">.*?<\/p>/g, "").trim() ? html : '<p class="pv-fb-vazio">Nenhuma equipe escalada nas etapas deste evento.</p>';
  }
  function caminhoesHtml(c) {
    const mapa = new Map();
    for (const p of c.pedidos || []) for (const e of p.etapas || []) for (const k of e.caminhoes || []) {
      const ch = k.placa || k.codigo; if (!mapa.has(ch)) mapa.set(ch, { ...k, usos: [] });
      mapa.get(ch).usos.push(NOME_ETAPA[e.tipo] + " " + dataBr(e.data).slice(0, 5) + ((c.pedidos || []).length > 1 ? " (Pedido " + p.numero + ")" : ""));
    }
    if (!mapa.size) return '<p class="pv-fb-vazio">Nenhum caminhão programado nas etapas deste evento.</p>';
    return '<div class="pv-cam-lista">' + [...mapa.values()].map((k) => '<article class="pv-cam">' + (/^https?:\/\//.test(k.foto_url || "") ? '<span class="pv-cam-sem pv-cam-foto">🚚<img src="' + esc(k.foto_url) + '" alt="" loading="lazy" onerror="this.remove()"></span>' : '<span class="pv-cam-sem">🚚</span>') +
      "<div><b>" + esc(k.codigo || "") + (k.modelo ? " · " + esc(k.modelo) : "") + "</b><small>Placa " + esc(k.placa || "—") + " · " + (k.terceiro ? "Terceirizado · " + esc(k.terceiro) : "Frota própria") + '</small><ul class="pv-cam-usos">' + k.usos.map((u) => "<li>" + esc(u) + "</li>").join("") + "</ul></div></article>").join("") + "</div>";
  }
  function abasLigacaoHtml(eventos) {
    const c = S.ligAtual, nEq = new Set(), nCam = new Set();
    for (const p of c?.pedidos || []) for (const e of p.etapas || []) { (e.pessoas || []).forEach((x) => nEq.add(x.nome)); (e.caminhoes || []).forEach((k) => nCam.add(k.placa || k.codigo)); }
    const aba = (k, r, n) => '<button type="button" role="tab" class="pv-gav-aba' + (k === "eventos" ? " ativa" : "") + '" data-gav-aba="' + k + '" aria-selected="' + (k === "eventos") + '">' + r + (n ? " <span>" + n + "</span>" : "") + "</button>";
    return '<div class="pv-gav-abas" role="tablist">' + aba("eventos", "Eventos desta ligação", (c?.pedidos || []).length) + aba("equipe", "Equipe", nEq.size) + aba("caminhao", "Caminhão", nCam.size) + "</div>" +
      '<div class="pv-gav-painel" data-gav-painel="eventos">' + eventos + "</div>" +
      '<div class="pv-gav-painel" data-gav-painel="equipe" hidden>' + equipeHtml(c) + "</div>" +
      '<div class="pv-gav-painel" data-gav-painel="caminhao" hidden>' + caminhoesHtml(c) + "</div>";
  }
  function abrirLigacao(c) {
    if (!c) return;
    S.ligAtual = c; S.eqFb = {}; carregarEqFb(c);
    const hoje = S.dados.hoje, liberada = c.disponivel_em <= hoje, atrasada = liberada && c.prazo && c.prazo < hoje;
    let g = document.getElementById("pvGaveta");
    if (!g) {
      g = document.createElement("div"); g.id = "pvGaveta"; g.className = "pv-gaveta"; g.setAttribute("aria-hidden", "true"); g.inert = true;
      g.innerHTML = '<div class="pv-gaveta-fundo" data-fechar-gaveta></div><aside class="pv-gaveta-painel" role="dialog" aria-modal="true" aria-labelledby="pvGavTit"><header><button type="button" class="pv-gaveta-voltar" data-fechar-gaveta>← Voltar</button><div id="pvGavTit"></div></header><div class="pv-gaveta-corpo"></div><footer class="pv-gaveta-acoes"></footer></aside>';
      document.body.append(g);
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && g.classList.contains("aberta")) fecharGaveta(); });
    }
    const quando = !liberada ? '<span class="pv-selo">A partir de ' + dataBr(c.disponivel_em) + "</span>" : atrasada ? '<span class="pv-selo atrasada">Atrasada</span> <small>era até ' + dataBr(c.prazo) + "</small>" : '<span class="pv-selo hoje">Ligar agora</span> <small>até ' + dataBr(c.prazo) + "</small>";
    const log = (Array.isArray(c.tentativas_log) ? c.tentativas_log : []).slice().reverse();
    const RES = { atendeu: "Atendeu", nao_atendeu: "Não atendeu", sem_contato: "Sem contato", dispensado: "Não ligar" };
    // 15/11/2026: o cliente e os dados da ligação ficam no topo, na linha do Voltar.
    g.querySelector("#pvGavTit").innerHTML = '<div class="pv-gav-topo">' + clienteHtml(c) + '<dl class="pv-gav-topo-dados"><div><dt>Telefone</dt><dd>' + foneHtml(c) + "</dd></div><div><dt>Situação</dt><dd>" + quando + "</dd></div><div><dt>Tentativas</dt><dd>" + (c.tentativas || 0) + (c.ultimo_contato ? " <small>· último contato " + dataBr(c.ultimo_contato) + "</small>" : "") + "</dd></div>" + (c.ultima_ligacao ? "<div><dt>Última ligação</dt><dd>" + dataHora(c.ultima_ligacao.em) + (c.ultima_ligacao.por ? " <small>· " + esc(c.ultima_ligacao.por) + "</small>" : "") + "</dd></div>" : "") + "</dl></div>";
    g.querySelector(".pv-gaveta-corpo").innerHTML = '<div class="pv-gav-info">' +
      feedbacksHtml(c) +
      abasLigacaoHtml('<div class="pv-gav-eventos">' + (c.pedidos || []).map((p) => '<div class="pv-ev pv-ev-det"><div><b>Pedido ' + esc(p.numero) + "</b> · " + dataBr(p.data_evento) + (Number(p.valor) ? ' · <span class="pv-valor">' + brlPv(p.valor) + "</span>" : "") + "<small>" + esc([p.tipo, p.local].filter(Boolean).join(" · ")) + "</small>" + vendedorHtml(p) + "</div>" + (p.montador ? '<div class="pv-montador">' + fotoMontador(p.montador) + "<span>" + esc(p.montador.nome) + "<small>Responsável pela montagem</small></span></div>" : '<div class="pv-montador"><small>Sem responsável na montagem</small></div>') + posicaoHtml({ pedidos: [p] }) + "</div>" + (problemasDe(p).length ? '<ul class="pv-prob-lista">' + problemasDe(p).map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "")).join("") + "</div>") +
      (log.length ? '<h4>Tentativas anteriores</h4><ol class="pv-gav-log">' + log.map((t) => "<li><b>" + esc(RES[t.resultado] || t.resultado || "") + "</b> <small>" + dataHora(t.em) + (t.por ? " · " + esc(t.por) : "") + "</small></li>").join("") + "</ol>" : "") + "</div>";
    g.querySelector(".pv-gaveta-acoes").innerHTML = liberada
      ? '<button type="button" class="btn primary" data-registrar="' + c.id + '">Registrar ligação</button><button type="button" class="btn" data-naoatendeu="' + c.id + '">Não atendeu</button><button type="button" class="btn pv-link" data-dispensar="' + c.id + '">Não ligar</button>'
      : '<button type="button" class="btn primary" data-registrar="' + c.id + '">Ligar agora</button>';
    g.removeAttribute("aria-hidden"); g.inert = false; g.classList.add("aberta"); document.documentElement.classList.add("pv-gaveta-aberta"); g.querySelector(".pv-gaveta-voltar").focus();
    // 15/11/2026: as perguntas já aparecem ao entrar (coluna da direita), sem precisar clicar em "Registrar ligação".
    abrirFormulario(c, true);
  }
  function fecharGaveta() { if (S.formNaTela) formNaTela(false); const g = document.getElementById("pvGaveta"); if (!g) return; g.classList.remove("aberta"); g.setAttribute("aria-hidden", "true"); g.inert = true; document.documentElement.classList.remove("pv-gaveta-aberta"); }

  // 15/11/2026: tabelas "Precisam de atenção" e "Concluídas" refeitas: cliente, eventos, resultado em selo, o que o cliente
  // disse (pergunta pequena em cima, resposta embaixo; ruim em vermelho), retorno ao cliente (só na atenção) e quem ligou.
  // Clicar na linha abre as respostas.
  const SETOR_NOME = { triagem: "Triagem", carregamento: "Carregamento", montagem: "Montagem" };
  function resultadoSelo(c) {
    if (c.status === "sem_contato") return '<span class="pv-res cinza">Sem contato</span>';
    if (c.status === "dispensado") return '<span class="pv-res cinza">Não ligar</span>' + (c.motivo ? '<small class="pv-res-mot">' + esc(c.motivo) + "</small>" : "");
    const ruins = (c.respostas || []).filter((r) => r.ruim && r.respostas?.length).length;
    return c.atencao ? '<span class="pv-res ruim">' + (ruins ? ruins + " reclamaç" + (ruins > 1 ? "ões" : "ão") : "Precisa de atenção") + "</span>" : '<span class="pv-res bom">Tudo bem</span>';
  }
  function disseHtml(c) {
    const resp = Array.isArray(c.respostas) ? c.respostas.filter((r) => r.respostas?.length) : [];
    const ruins = resp.filter((r) => r.ruim), mostrar = (ruins.length ? ruins : resp).slice(0, 3);
    const extra = (ruins.length ? ruins : resp).length - mostrar.length;
    const setor = Object.entries(c.observacoes_setor || {}).filter(([, v]) => v);
    const html = mostrar.map((r) => '<div class="pv-disse' + (r.ruim ? " ruim" : "") + '"><small>' + esc(String(r.pergunta || "").replace(/[?:\s]+$/, "")) + "</small><span>" + r.respostas.map(esc).join(", ") + "</span></div>").join("") +
      (extra > 0 ? '<small class="pv-disse-mais">+ ' + extra + " resposta(s)</small>" : "") +
      (c.observacao ? '<p class="pv-disse-obs">“' + esc(c.observacao) + "”</p>" : "") +
      setor.map(([k, v]) => '<p class="pv-disse-obs setor"><b>' + (SETOR_NOME[k] || k) + ":</b> " + esc(v) + "</p>").join("");
    return html || '<small class="pv-vazio-cel">Sem respostas</small>';
  }
  function retornoHtml(c) {
    if (c.tratativa_concluida_em) return '<div class="pv-ret"><span class="pv-res bom">Resolvido</span><small>' + esc(c.tratativa_responsavel || "") + " · " + dataHora(c.tratativa_concluida_em) + "</small>" + (c.tratativa_obs ? '<p class="pv-disse-obs">' + esc(c.tratativa_obs) + "</p>" : "") + "</div>";
    return '<div class="pv-ret">' + (c.tratativa_responsavel ? '<span class="pv-ret-pessoa">' + fotoUsuario(c.tratativa_responsavel, null) + "<span>" + esc(c.tratativa_responsavel) + "<small>Aguardando retorno</small></span></span>" : '<span class="pv-res amarelo">Sem responsável</span>') +
      '<button type="button" class="pv-btn-ret" data-tratativa="' + c.id + '">' + (c.tratativa_responsavel ? "Atualizar" : "Definir responsável") + "</button></div>";
  }
  function ligouHtml(c) {
    const nome = c.feito_por_nome || "";
    return (nome ? '<span class="pv-ret-pessoa pv-corta">' + fotoUsuario(nome, c.feito_por) + "<span>" + esc(nome) + "<small>" + dataHora(c.concluido_em || c.ultima_tentativa_em) + "</small></span></span>" : "<small>" + dataHora(c.concluido_em || c.ultima_tentativa_em) + "</small>");
  }
  const eventosCurtoHtml = (c) => (c.pedidos || []).map((p) => '<div class="pv-ev-c"><b>Pedido ' + esc(p.numero) + "</b> · " + dataBr(p.data_evento) + "<small>" + esc([p.tipo, p.local].filter(Boolean).join(" · ")) + "</small></div>").join("") || "—";
  // 15/11/2026: linha compacta (no máximo 2 linhas); o resto fica no card lateral.
  function eventosLinhaCurta(c) {
    const ped = c.pedidos || []; if (!ped.length) return "—";
    const p = ped[0];
    return '<div class="pv-ev-c"><b>Pedido ' + esc(p.numero) + "</b> · " + dataBr(p.data_evento) + (ped.length > 1 ? ' <span class="pv-mais">+' + (ped.length - 1) + "</span>" : "") + "<small>" + esc([p.tipo, p.local].filter(Boolean).join(" · ")) + "</small></div>";
  }
  function disseCurto(c) {
    const resp = Array.isArray(c.respostas) ? c.respostas.filter((r) => r.respostas?.length) : [];
    const ruins = resp.filter((r) => r.ruim), base = ruins.length ? ruins : resp;
    if (!base.length && !c.observacao) return '<small class="pv-vazio-cel">Sem respostas</small>';
    const r = base[0];
    const linha1 = r ? '<span class="pv-curto' + (r.ruim ? " ruim" : "") + '">' + r.respostas.map(esc).join(", ") + (base.length > 1 ? ' <span class="pv-mais">+' + (base.length - 1) + "</span>" : "") + '</span><span class="pv-curto-perg">' + esc(String(r.pergunta || "").replace(/[?:\s]+$/, "")) + "</span>" : "";
    const obs = c.observacao || Object.values(c.observacoes_setor || {}).find(Boolean) || "";
    return linha1 + (obs && !r ? '<span class="pv-curto-obs">“' + esc(obs) + "”</span>" : "");
  }
  // 15/11/2026: mais colunas (valor, quem vendeu, montagem, há quanto tempo aguarda o retorno), sem rolagem lateral.
  const somaValor = (c) => (c.pedidos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
  function vendedorCurto(c) {
    const nomes = [...new Set((c.pedidos || []).map((p) => p.vendedor?.nome).filter(Boolean))];
    if (!nomes.length) return '<small class="pv-vazio-cel">—</small>';
    const p = (c.pedidos || []).find((x) => x.vendedor?.nome === nomes[0]);
    return '<span class="pv-ret-pessoa pv-corta">' + fotoUsuario(nomes[0], p?.vendedor?.usuario_id) + "<span>" + esc(nomes[0]) + (nomes.length > 1 ? ' <span class="pv-mais">+' + (nomes.length - 1) + "</span>" : "") + "</span></span>";
  }
  function montadorCurto(c) {
    const m = (c.pedidos || []).map((p) => p.montador).find(Boolean);
    return m ? '<span class="pv-ret-pessoa pv-corta">' + fotoMontador(m) + "<span>" + esc(m.nome) + "</span></span>" : '<small class="pv-vazio-cel">—</small>';
  }
  function aguardandoHtml(c) {
    const ini = c.concluido_em ? new Date(c.concluido_em) : null; if (!ini) return "—";
    const fim = c.tratativa_concluida_em ? new Date(c.tratativa_concluida_em) : new Date();
    const dias = Math.max(0, Math.floor((fim - ini) / 86400000));
    if (c.tratativa_concluida_em) return '<span class="pv-dias ok">Resolvido em ' + (dias ? dias + " dia" + (dias > 1 ? "s" : "") : "menos de 1 dia") + "</span>";
    return '<span class="pv-dias' + (dias > 3 ? " atrasado" : "") + '">' + (dias ? dias + " dia" + (dias > 1 ? "s" : "") : "Hoje") + "</span><small>desde " + dataBr(c.concluido_em) + "</small>";
  }
  function linhaFeita(c) {
    const at = ' data-ver="' + c.id + '" tabindex="0" title="Ver a ligação"';
    const pendente = c.atencao && !c.tratativa_concluida_em, v = somaValor(c);
    const valor = '<td class="num">' + (v ? '<span class="pv-valor">' + brlPv(v) + "</span>" : "—") + "</td>";
    const base = "<td>" + clienteHtml(c) + "</td><td>" + eventosLinhaCurta(c) + "</td>" + valor + "<td>" + vendedorCurto(c) + "</td>";
    const meio = S.aba === "atencao"
      ? "<td>" + disseCurto(c) + "</td><td>" + aguardandoHtml(c) + "</td><td>" + retornoHtml(c) + "</td>"
      : "<td>" + resultadoSelo(c) + "</td><td>" + disseCurto(c) + "</td><td>" + montadorCurto(c) + "</td>";
    return '<tr class="pv-linha-feita' + (pendente ? " is-pendente" : "") + '"' + at + ">" + base + meio + "<td>" + ligouHtml(c) + "</td></tr>";
  }


  // Detalhe em tela inteira para atenção/concluídas e para ligações abertas pelo Painel.
  const detalheData = (v) => new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const detalhePares = (pares) => '<dl class="pvd-pares">' + pares.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>').join("") + '</dl>';
  const detalheCard = (titulo, sub, html, classe = "") => '<section class="pvd-card ' + classe + '"><div class="pvd-card-topo"><h3>' + esc(titulo) + '</h3>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' + html + '</section>';
  const detalheComplemento = (titulo, html, classe = "", nota = "") => '<section class="pvd-card pvd-complemento ' + classe + '"><details><summary>' + esc(titulo) + (nota ? '<span>' + esc(nota) + '</span>' : '') + '</summary><div class="pvd-complemento-corpo">' + html + '</div></details></section>';
  function detalheSituacao(c) {
    if (c.status === "sem_contato") return "Sem contato";
    if (c.status === "dispensado") return "Não ligar";
    if (c.tratativa_concluida_em) return "Retorno concluído";
    return c.atencao ? "Retorno pendente" : "Ligação concluída";
  }
  function detalheTempo(c) {
    const nomes = { atendeu: "Ligação atendida", nao_atendeu: "Cliente não atendeu", sem_contato: "Sem contato", dispensado: "Não ligar" };
    const fim = c.concluido_em || c.ultima_tentativa_em;
    const eventos = [];
    if (c.created_at) eventos.push({ em: c.created_at, titulo: "Pós-venda criado", texto: "Acompanhamento dos pedidos vinculados." });
    for (const t of Array.isArray(c.tentativas_log) ? c.tentativas_log : []) {
      if (t.em === fim && (t.resultado === "atendeu" || t.resultado === c.status)) continue;
      eventos.push({ em: t.em, titulo: nomes[t.resultado] || "Tentativa de contato", por: t.por });
    }
    if (fim) eventos.push({ em: fim, titulo: c.status === "concluido" ? "Ligação registrada" : nomes[c.status] || "Contato registrado", por: c.feito_por_nome, texto: c.status === "dispensado" ? c.motivo : c.atencao ? "Feedback sinalizado para atenção e retorno ao cliente." : c.status === "concluido" ? "Respostas do cliente registradas no pós-venda." : "" });
    if (c.tratativa_concluida_em) eventos.push({ em: c.tratativa_concluida_em, titulo: "Retorno concluído", por: c.tratativa_por_nome || c.tratativa_responsavel, texto: c.tratativa_obs });
    const lista = eventos.filter((x) => x.em && Number.isFinite(new Date(x.em).getTime())).sort((a, b) => new Date(b.em) - new Date(a.em));
    const html = lista.length ? '<ol class="pvd-tempo">' + lista.map((x, i) => {
      const [dia, hora] = detalheData(x.em).split(", ");
      return '<li><time datetime="' + esc(new Date(x.em).toISOString()) + '"><b>' + esc(hora) + '</b><span>' + esc(dia) + '</span></time><div class="pvd-tempo-evento">' + (i === 0 ? '<small class="pvd-recente">Mais recente</small>' : '') + '<b>' + esc(x.titulo) + '</b>' + (x.por ? '<span class="pvd-autor">' + esc(x.por) + '</span>' : '') + (x.texto ? '<p>' + esc(x.texto) + '</p>' : '') + '</div></li>';
    }).join("") + '</ol>' : '<p class="pvd-vazio">Nenhuma data de contato registrada.</p>';
    return detalheCard("Linha do tempo", "Histórico deste acompanhamento, do mais recente ao mais antigo", html, "pvd-historico");
  }
  function detalheRetorno(c) {
    let html;
    if (c.atencao) {
      const resolvido = Boolean(c.tratativa_concluida_em);
      html = '<div class="pvd-retorno-estado"><b>' + (resolvido ? "Retorno concluído" : c.tratativa_responsavel ? "Aguardando retorno ao cliente" : "Defina quem vai cuidar do retorno") + '</b><span>' + (resolvido ? esc(detalheData(c.tratativa_concluida_em)) : aguardandoHtml(c)) + '</span></div>' +
        detalhePares([["Responsável", esc(c.tratativa_responsavel || "Ainda não definido")]].concat(c.tratativa_por_nome ? [["Atualizado por", esc(c.tratativa_por_nome)]] : [])) +
        (c.tratativa_obs ? '<div class="pvd-anotacao"><small>O que foi feito</small><p>' + esc(c.tratativa_obs) + '</p></div>' : '') +
        (!resolvido ? '<button type="button" class="pvd-botao pvd-botao-principal" data-tratativa="' + esc(c.id) + '">' + (c.tratativa_responsavel ? "Atualizar retorno" : "Definir responsável") + '</button>' : '');
    } else {
      const mensagem = c.status === "sem_contato" ? "As tentativas de contato foram encerradas sem falar com o cliente." : c.status === "dispensado" ? "Este contato foi marcado para não receber ligação." : "Nenhum retorno pendente sinalizado nesta ligação.";
      html = '<p class="pvd-retorno-mensagem">' + mensagem + '</p>' + (c.motivo ? '<div class="pvd-anotacao"><small>Motivo registrado</small><p>' + esc(c.motivo) + '</p></div>' : '');
    }
    return detalheCard("Retorno ao cliente", "Situação e acompanhamento", html, "pvd-retorno");
  }
  function detalhePedidos(c) {
    const pedidos = c.pedidos || [];
    const html = pedidos.map((p) => {
      const problemas = problemasDe(p);
      const equipe = (p.etapas || []).some((e) => e.pessoas?.length || e.caminhoes?.length);
      return '<article class="pvd-pedido"><div class="pvd-pedido-topo"><span class="pvd-pedido-num">Pedido ' + esc(p.numero) + '</span><b>' + (p.valor != null ? esc(brlPv(p.valor)) : "Valor não informado") + '</b></div><p class="pvd-evento">' + esc([p.tipo, p.data_evento ? dataBr(p.data_evento) : "", p.local].filter(Boolean).join(" · ") || "Dados do evento não informados") + '</p>' +
        detalhePares([["Vendido por", p.vendedor?.nome ? '<span class="pvd-pessoa">' + fotoUsuario(p.vendedor.nome, p.vendedor.usuario_id) + esc(p.vendedor.nome) + '</span>' : "Não informado"], ["Montagem", p.montador ? '<span class="pvd-pessoa">' + fotoMontador(p.montador) + esc(p.montador.nome) + '</span>' : "Sem responsável registrado"]]) +
        (problemas.length ? '<div class="pvd-problemas"><b>Problemas registrados no evento</b><ul>' + problemas.map((x) => '<li>' + esc(x) + '</li>').join("") + '</ul></div>' : '<p class="pvd-vazio">Nenhum problema operacional listado para este evento.</p>') +
        '<div class="pvd-documento">' + posicaoHtml({ pedidos: [p] }) + '</div>' +
        (equipe ? '<details class="pvd-operacao"><summary>Ver equipe e caminhões</summary>' + equipeHtml({ pedidos: [p] }, false) + caminhoesHtml({ pedidos: [p] }) + '</details>' : '') + '</article>';
    }).join("") || '<p class="pvd-vazio">Este contato não tem pedidos vinculados disponíveis. Não é possível confirmar o evento ou os valores de origem. As respostas e a tratativa da ligação permanecem registradas.</p>';
    return detalheComplemento("Pedidos e eventos", html, "pvd-pedidos", pedidos.length + (pedidos.length === 1 ? " pedido" : " pedidos"));
  }
  function detalheRespostas(c) {
    const respostas = (Array.isArray(c.respostas) ? c.respostas : []).filter((r) => r.respostas?.length).sort((a, b) => Number(Boolean(b.ruim)) - Number(Boolean(a.ruim)));
    const n = respostas.filter((r) => r.ruim).length;
    const html = respostas.length ? '<div class="pvd-respostas">' + respostas.map((r) => '<div class="pv-disse' + (r.ruim ? ' ruim' : '') + '"><small>' + esc(String(r.pergunta || "").replace(/[?:\s]+$/, "")) + '</small><span>' + r.respostas.map(esc).join(", ") + '</span>' + (r.ruim ? '<em>Precisa de atenção</em>' : '') + '</div>').join("") + '</div>' : '<p class="pvd-vazio">Nenhuma resposta registrada para este contato.</p>';
    const setores = Object.entries(c.observacoes_setor || {}).filter(([, v]) => v);
    return detalheCard("O que o cliente disse", respostas.length + (respostas.length === 1 ? " resposta registrada" : " respostas registradas") + (n ? " · " + n + (n === 1 ? " ponto de atenção" : " pontos de atenção") : ""), html +
      '<div class="pvd-notas">' + (c.observacao ? '<div class="pvd-anotacao"><h4>Observação da ligação</h4><p>“' + esc(c.observacao) + '”</p></div>' : '') +
      (setores.length ? '<div class="pvd-setores"><h4>Observações para os setores</h4>' + setores.map(([k, v]) => '<div class="pvd-anotacao"><small>' + esc(SETOR_NOME[k] || k) + '</small><p>' + esc(v) + '</p></div>').join("") + '</div>' : '') + '</div>', "pvd-feedback");
  }
  function abrirLateral(c) {
    if (!c) return;
    const aberta = $("pvLateral")?.classList.contains("aberta");
    if (!aberta) S.detalheFoco = document.activeElement;
    S.detalhe = c;
    let g = document.getElementById("pvLateral");
    if (!g) {
      g = document.createElement("div"); g.id = "pvLateral"; g.className = "pvd"; g.setAttribute("aria-hidden", "true"); g.inert = true;
      g.innerHTML = '<section class="pvd-tela" role="dialog" aria-modal="true" aria-labelledby="pvLatTit"><header class="pvd-topo"><button type="button" class="pvd-botao pvd-voltar" data-fechar-lateral>← Voltar</button><div id="pvLatTit"></div><div data-pvd-resumo></div><div class="pvd-titulo"></div></header><div class="pvd-conteudo"></div></section>';
      document.body.append(g);
      g.addEventListener("keydown", (e) => {
        if (e.key !== "Tab" || document.querySelector("dialog[open]")) return;
        const itens = [...g.querySelectorAll('button:not(:disabled),a[href],summary')].filter((x) => x.getClientRects().length);
        const primeiro = itens[0], ultimo = itens[itens.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo?.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro?.focus(); }
      });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && g.classList.contains("aberta") && !document.querySelector("dialog[open]")) fecharLateral(); });
    }
    g.querySelector("#pvLatTit").innerHTML = clienteHtml(c);
    g.querySelector(".pvd-titulo").innerHTML = '<small>Pós-venda</small><h2>' + esc(detalheSituacao(c)) + '</h2>';
    const pedidos = c.pedidos || [], temValor = pedidos.some((p) => p.valor != null);
    const resumo = '<div class="pvd-resumo" aria-label="Resumo da ligação"><div><small>Resultado da ligação</small>' + resultadoSelo(c) + '</div><div><small>Pedidos vinculados</small><b>' + pedidos.length + '</b></div><div><small>Valor dos pedidos</small><b>' + (temValor ? esc(brlPv(somaValor(c))) : "Não informado") + '</b>' + (temValor && pedidos.some((p) => p.valor == null) ? '<span>Há pedido sem valor informado</span>' : '') + '</div><div><small>Quem registrou</small><span class="pvd-registrou">' + (c.feito_por_nome ? fotoUsuario(c.feito_por_nome, c.feito_por) + '<b>' + esc(c.feito_por_nome) + '</b>' : 'Não informado') + '</span><span>' + (c.concluido_em || c.ultima_tentativa_em ? esc(detalheData(c.concluido_em || c.ultima_tentativa_em)) : 'Data não informada') + '</span></div></div>';
    const contato = detalheComplemento("Contato do cliente", detalhePares([["Telefone", foneHtml(c)], ["Perfil", c.novo == null ? "Não informado" : c.novo ? "Cliente novo" : "Cliente recorrente"], ["Tentativas registradas", esc(c.tentativas ?? (c.tentativas_log || []).length)]]), "pvd-contato");
    const anteriores = (c.historico || []).length ? detalheComplemento("Histórico anterior do cliente", feedbacksHtml(c), "pvd-anteriores") : '';
    g.querySelector("[data-pvd-resumo]").innerHTML = resumo;
    g.querySelector(".pvd-conteudo").innerHTML = '<div class="pvd-grade"><div class="pvd-coluna">' + detalheRetorno(c) + detalheTempo(c) + '</div><div class="pvd-coluna">' + detalheRespostas(c) + '</div></div><div class="pvd-complementos">' + detalhePedidos(c) + contato + anteriores + '</div>';
    g.removeAttribute("aria-hidden"); g.inert = false; g.classList.add("aberta"); document.documentElement.classList.add("pvd-aberta");
    document.querySelector(".pv-page").inert = true;
    if (!aberta) { g.querySelector(".pvd-tela").scrollTop = 0; g.querySelector(".pvd-voltar").focus(); }
    else if (!g.contains(document.activeElement)) g.querySelector(".pvd-voltar").focus();
  }
  function fecharLateral() {
    const g = $("pvLateral"); if (!g) return;
    g.classList.remove("aberta"); g.setAttribute("aria-hidden", "true"); g.inert = true;
    document.documentElement.classList.remove("pvd-aberta"); document.querySelector(".pv-page").inert = false;
    S.detalhe = null;
    if (S.detalheFoco?.isConnected) S.detalheFoco.focus();
    else document.querySelector('#pvAbas [aria-selected="true"]')?.focus();
  }

  function verRespostas(c) {
    S.atual = c; S.modo = "ver";
    $("pvFormTitulo").textContent = "Respostas · " + (c.cliente_nome || "");
    $("pvFormErro").textContent = "";
    $("pvFormCorpo").innerHTML = '<dl class="pv-resp">' + (c.respostas || []).filter((r) => r.respostas?.length).map((r) => "<dt>" + esc(r.pergunta) + '</dt><dd class="' + (r.ruim ? "ruim" : "") + '">' + r.respostas.map(esc).join(", ") + "</dd>").join("") + "</dl>" + (c.observacao ? '<p class="pv-obs">' + esc(c.observacao) + "</p>" : "");
    Object.entries(c.observacoes_setor || {}).filter(([, v]) => v).forEach(([k, v]) => { $("pvFormCorpo").insertAdjacentHTML("beforeend", '<p class="pv-obs"><b>' + (SETOR_NOME[k] || k) + ":</b> " + esc(v) + "</p>"); });
    $("pvFormulario").querySelector("button[type=submit]").hidden = true;
    $("pvForm").showModal();
  }

  function pintar() {
    const q = $("pvBusca").value.trim().toLowerCase(), todos = S.dados.contatos || [], hoje = S.dados.hoje;
    $("pvContHoje").textContent = todos.filter((c) => c.status === "pendente" && c.disponivel_em <= hoje).length || "";
    $("pvContAtencao").textContent = todos.filter((c) => grupo(c) === "atencao").length || "";
    document.querySelectorAll("#pvAbas [data-aba]").forEach((b) => { const ativa = b.dataset.aba === S.aba; b.classList.toggle("ativa", ativa); b.setAttribute("aria-selected", String(ativa)); });
    // 15/11/2026: aba "Painel" (posvenda-painel.js): números do pós-venda no lugar da tabela; a busca vira De/Até.
    const painel = S.aba === "painel";
    $("pvLista").hidden = painel; $("pvPainel").hidden = !painel; $("pvBusca").closest(".pv-busca").hidden = painel; $("ppFiltros").hidden = !painel;
    if (painel) { window.PosvendaPainel?.mostrar({ sb: S.sb, emp: S.emp, host: $("pvPainel"), filtros: $("ppFiltros") }); return; }
    const lista = todos.filter((c) => grupo(c) === S.aba && (!q || [c.cliente_nome, ...(c.pedidos || []).map((p) => p.numero)].some((x) => String(x || "").toLowerCase().includes(q))));
    if (S.aba === "ligacoes") lista.sort((a, b) => String(a.disponivel_em).localeCompare(String(b.disponivel_em)) || String(a.prazo).localeCompare(String(b.prazo)));
    else lista.sort((a, b) => String(b.concluido_em || "").localeCompare(String(a.concluido_em || "")));
    if (!lista.length) {
      $("pvLista").innerHTML = '<div class="pv-vazio">' + ({ ligacoes: "Nenhuma ligação. As ligações aparecem quando o Financeiro confirma a Posição final do pedido.", atencao: "Nenhum feedback com resposta ruim.", feitas: "Nenhuma ligação registrada ainda." })[S.aba] + "</div>";
      return;
    }
    const cab = S.aba === "ligacoes" ? '<th>Cliente</th><th>Telefone</th><th>Eventos</th><th class="num">Valor do pedido</th><th>Vendido por</th><th>Montagem</th><th>Problemas no evento</th><th>Posição final</th><th>Quando</th>' : (S.aba === "atencao" ? '<th>Cliente</th><th>Eventos</th><th class="num">Valor</th><th>Vendido por</th><th>Reclamação</th><th>Aguarda há</th><th>Retorno ao cliente</th><th>Quem ligou</th>' : '<th>Cliente</th><th>Eventos</th><th class="num">Valor</th><th>Vendido por</th><th>Resultado</th><th>O que o cliente disse</th><th>Montagem</th><th>Quem ligou</th>');
    $("pvLista").innerHTML = '<div class="pv-rolar"><table class="pv-tabela' + (S.aba === "ligacoes" ? "" : " pv-tabela-feitas pv-aba-" + S.aba) + '"><thead><tr>' + cab + "</tr></thead><tbody>" + lista.map(S.aba === "ligacoes" ? linhaLigacao : linhaFeita).join("") + "</tbody></table></div>";
  }

  async function abrirTratativa(c) {
    if (!c) return;
    S.atual = c; S.modo = "tratativa"; $("pvFormulario").querySelector("button[type=submit]").hidden = false;
    $("pvFormTitulo").textContent = "Retorno ao cliente · " + (c.cliente_nome || "");
    $("pvFormErro").textContent = "";
    if (!S.pessoas) { const { data } = await S.sb.from("funcionarios_acesso").select("nome").eq("empresa_id", S.emp).eq("ativo", true).order("nome"); S.pessoas = (data || []).map((x) => x.nome).filter(Boolean); }
    const ruins = (c.respostas || []).filter((r) => r.ruim && r.respostas?.length);
    $("pvFormCorpo").innerHTML = (ruins.length ? '<dl class="pv-resp">' + ruins.map((r) => "<dt>" + esc(r.pergunta) + '</dt><dd class="ruim">' + r.respostas.map(esc).join(", ") + "</dd>").join("") + "</dl>" : "") +
      (c.observacao ? '<p class="pv-obs">' + esc(c.observacao) + "</p>" : "") +
      '<label class="pv-obs-campo">Quem vai cuidar do retorno?<input name="__resp" list="pvPessoas" required minlength="2" value="' + esc(c.tratativa_responsavel || "") + '" placeholder="Nome da pessoa"></label><datalist id="pvPessoas">' + S.pessoas.map((n) => '<option value="' + esc(n) + '">').join("") + "</datalist>" +
      '<label class="pv-obs-campo">O que foi feito (preencha ao resolver)<textarea name="__trat" rows="3" placeholder="Ex.: liguei, pedimos desculpas e demos 10% no próximo pedido">' + esc(c.tratativa_obs || "") + "</textarea></label>" +
      '<label class="pv-opcao"><input type="checkbox" name="__concluir"><span>Retorno feito: marcar como resolvido</span></label>';
    $("pvForm").showModal();
  }

  function abrirDispensar(c) {
    S.atual = c; S.modo = "dispensar"; $("pvFormulario").querySelector("button[type=submit]").hidden = false;
    $("pvFormTitulo").textContent = "Não ligar · " + (c.cliente_nome || "");
    $("pvFormErro").textContent = "";
    $("pvFormCorpo").innerHTML = '<label class="pv-obs-campo">Por que não ligar? (fica registrado)<textarea name="__motivo" rows="3" required minlength="3" placeholder="Ex.: o cliente pediu para não ligar"></textarea></label>';
    $("pvForm").showModal();
  }

  // 15/11/2026: aberto pela tela da ligação, o questionário entra na própria tela (no lugar dos botões), sem janela por cima.
  // O mesmo <form id="pvFormulario"> é movido para lá e volta para a janela ao terminar ou cancelar.
  function formNaTela(ligar) {
    const f = $("pvFormulario"), g = document.getElementById("pvGaveta");
    if (ligar && g) {
      let caixa = g.querySelector(".pv-gav-form"); if (!caixa) { caixa = document.createElement("section"); caixa.className = "pv-gav-form"; g.querySelector(".pv-gaveta-corpo").append(caixa); }
      caixa.append(f); g.querySelector(".pv-gaveta-acoes").hidden = true; S.formNaTela = true;
      const c = S.atual, hoje = S.dados.hoje, extra = document.createElement("div"); extra.className = "pv-form-extra";
      extra.innerHTML = c && c.disponivel_em <= hoje ? '<button type="button" class="btn" data-naoatendeu="' + c.id + '">Não atendeu</button><button type="button" class="btn pv-link" data-dispensar="' + c.id + '">Não ligar</button>'
        : '<small>Ligação programada para ' + dataBr(c?.disponivel_em) + "</small>";
      f.querySelector("footer").prepend(extra); g.querySelector(".pv-gaveta-corpo").classList.add("com-form");
      g.querySelector(".pv-gaveta-painel").scrollTop = 0;
    } else if (S.formNaTela) {
      f.querySelector(".pv-form-extra")?.remove(); g?.querySelector(".pv-gaveta-corpo")?.classList.remove("com-form");
      $("pvForm").append(f); g?.querySelector(".pv-gav-form")?.remove(); if (g) g.querySelector(".pv-gaveta-acoes").hidden = false; S.formNaTela = false;
    }
  }
  function fecharForm(terminou) {
    if (S.formNaTela) { formNaTela(false); if (terminou) fecharGaveta(); return; }
    $("pvForm").close();
  }
  // 15/11/2026: perguntas agrupadas pelas categorias de Parâmetros (config.categorias + pergunta.categoria).
  function perguntasPorCategoria(cfg) {
    const cats = Array.isArray(cfg.categorias) ? cfg.categorias : [], perg = cfg.perguntas || [];
    if (!cats.length) return [["", perg]];
    const grupos = cats.map((c) => [c.nome, perg.filter((p) => p.categoria === c.id)]);
    const sem = perg.filter((p) => !cats.some((c) => c.id === p.categoria));
    if (sem.length) grupos.push(["Outras", sem]);
    return grupos.filter(([, l]) => l.length);
  }
  function trocarAbaForm(id) {
    const f = $("pvFormulario");
    f.querySelectorAll("[data-form-aba]").forEach((b) => { const on = b.dataset.formAba === id; b.classList.toggle("ativa", on); b.setAttribute("aria-selected", on); });
    f.querySelectorAll("[data-form-painel]").forEach((p) => { p.hidden = p.dataset.formPainel !== id; });
  }
  // ✓ na aba quando todas as perguntas obrigatórias dela foram respondidas (Observação: quando algo foi escrito).
  function marcarAbasForm() {
    const f = $("pvFormulario");
    f.querySelectorAll("[data-form-painel]").forEach((p) => {
      const obrig = [...p.querySelectorAll("[data-obrig]")], todas = [...p.querySelectorAll(".pv-perg")];
      const ok = p.dataset.formPainel === "obs" ? [...p.querySelectorAll("textarea")].some((x) => x.value.trim())
        : (obrig.length ? obrig : todas).every((fs) => fs.querySelector("input:checked"));
      f.querySelector('[data-form-aba="' + p.dataset.formPainel + '"]')?.classList.toggle("feita", ok);
    });
  }
  function abrirFormulario(c, naTela) {
    S.atual = c; S.modo = "concluir"; $("pvFormulario").querySelector("button[type=submit]").hidden = false;
    const cfg = S.dados.config || {};
    $("pvFormTitulo").textContent = "Ligação · " + (c.cliente_nome || "");
    $("pvFormErro").textContent = "";
    // 15/11/2026: o questionário em abas: uma por categoria + "Observação" (geral e para Triagem, Carregamento e Montagem).
    const grupos = perguntasPorCategoria(cfg);
    const perg = (p) => '<fieldset class="pv-perg" data-perg="' + esc(p.id) + '"' + (p.obrigatoria ? ' data-obrig="1"' : "") + "><legend>" + esc(p.texto) + (p.obrigatoria ? ' <span class="pv-obrig">*</span>' : "") + (p.tipo === "multipla" ? " <small>(pode marcar mais de uma)</small>" : "") + '</legend><div class="pv-opcoes">' +
      (p.opcoes || []).map((o) => '<label class="pv-opcao"><input type="' + (p.tipo === "multipla" ? "checkbox" : "radio") + '" name="' + esc(p.id) + '" value="' + esc(o.id) + '"><span>' + esc(o.texto) + "</span></label>").join("") + "</div></fieldset>";
    const abas = grupos.map(([cat], i) => ({ id: "c" + i, nome: cat || "Perguntas" })).concat([{ id: "obs", nome: "Observação" }]);
    const obsSetor = (k, r) => '<label class="pv-obs-campo">' + r + '<textarea name="__obs_' + k + '" rows="2" placeholder="O que o cliente comentou sobre ' + r.toLowerCase() + '"></textarea></label>';
    $("pvFormCorpo").innerHTML = '<ul class="pv-eventos">' + (c.pedidos || []).map((p) => "<li><b>Pedido " + esc(p.numero) + "</b> · " + dataBr(p.data_evento) + " · " + esc(p.local || "") + "</li>").join("") + "</ul>" +
      '<div class="pv-form-abas" role="tablist">' + abas.map((x, i) => '<button type="button" role="tab" class="pv-form-aba' + (i ? "" : " ativa") + '" data-form-aba="' + x.id + '" aria-selected="' + !i + '">' + esc(x.nome) + '<i class="pv-form-ok" aria-hidden="true"></i></button>').join("") + "</div>" +
      grupos.map(([, lista], i) => '<div class="pv-form-painel" data-form-painel="c' + i + '"' + (i ? " hidden" : "") + ">" + lista.map(perg).join("") + "</div>").join("") +
      '<div class="pv-form-painel" data-form-painel="obs" hidden>' + (cfg.observacao !== false ? '<label class="pv-obs-campo">Observação geral<textarea name="__obs" rows="3"></textarea></label>' : "") +
      '<p class="pv-obs-setor-tit">Observação para os setores</p>' + obsSetor("triagem", "Triagem") + obsSetor("carregamento", "Carregamento") + obsSetor("montagem", "Montagem") + "</div>";
    marcarAbasForm();
    if (naTela) { $("pvFormTitulo").textContent = "Registrar ligação"; formNaTela(true); return; }
    $("pvForm").showModal();
  }

  async function salvarFormulario(e) {
    e.preventDefault();
    const f = $("pvFormulario"), cfg = S.dados.config || {}, respostas = {};
    if (S.modo === "ver") { $("pvForm").close(); return; }
    if (S.modo === "tratativa") {
      const botao = f.querySelector('button[type="submit"]'); botao.disabled = true;
      try {
        const atualizado = await rpc("posvenda_tratativa", { p_empresa: S.emp, p_contato: S.atual.id, p_responsavel: f.querySelector('[name="__resp"]').value, p_obs: f.querySelector('[name="__trat"]').value, p_concluir: f.querySelector('[name="__concluir"]').checked });
        $("pvForm").close(); await carregar();
        if (S.detalhe?.id === S.atual.id) abrirLateral(atualizado || S.dados.contatos.find((c) => c.id === S.atual.id) || S.atual);
        avisar("Retorno ao cliente atualizado.", "Pós-venda", "sucesso");
      } catch (err) { $("pvFormErro").textContent = err.message; }
      finally { botao.disabled = false; }
      return;
    }
    if (S.modo === "dispensar") {
      try { await rpc("posvenda_registrar", { p_empresa: S.emp, p_contato: S.atual.id, p_acao: "dispensar", p_respostas: null, p_observacao: null, p_motivo: f.querySelector('[name="__motivo"]').value });
        $("pvForm").close(); await carregar(); } catch (err) { $("pvFormErro").textContent = err.message; }
      return;
    }
    for (const p of cfg.perguntas || []) {
      const marcadas = [...f.querySelectorAll('input[name="' + CSS.escape(p.id) + '"]:checked')].map((i) => i.value);
      if (p.obrigatoria && !marcadas.length) { $("pvFormErro").textContent = "Responda: " + p.texto; const fs = f.querySelector('[data-perg="' + CSS.escape(p.id) + '"]'); const pn = fs?.closest("[data-form-painel]"); if (pn) trocarAbaForm(pn.dataset.formPainel); fs?.scrollIntoView({ block: "center" }); return; }
      respostas[p.id] = p.tipo === "multipla" ? marcadas : (marcadas[0] || null);
    }
    const b = f.querySelector("button[type=submit]"); b.disabled = true;
    try {
      await rpc("posvenda_registrar", { p_empresa: S.emp, p_contato: S.atual.id, p_acao: "concluir", p_respostas: respostas, p_observacao: f.querySelector('[name="__obs"]')?.value || null, p_motivo: null });
      const setor = {}; ["triagem", "carregamento", "montagem"].forEach((k) => { const v = f.querySelector('[name="__obs_' + k + '"]')?.value.trim(); if (v) setor[k] = v; });
      if (Object.keys(setor).length) await rpc("posvenda_observacoes_setor", { p_empresa: S.emp, p_contato: S.atual.id, p_obs: setor });
      fecharForm(true); avisar("Ligação registrada.", "Pós-venda", "sucesso"); await carregar();
    } catch (err) { $("pvFormErro").textContent = err.message; }
    finally { b.disabled = false; }
  }

  async function acao(id, tipo) {
    const motivo = null;
    if (window.confirmarGlobal && !(await window.confirmarGlobal("Registrar que o cliente não atendeu? Uma nova tentativa é agendada pelas regras de Parâmetros.", "Não atendeu"))) return;
    try { await rpc("posvenda_registrar", { p_empresa: S.emp, p_contato: id, p_acao: tipo, p_respostas: null, p_observacao: null, p_motivo: motivo }); await carregar(); }
    catch (e) { avisar(e.message); }
  }

  function ligar() {
    $("pvAbas").addEventListener("click", (e) => { const b = e.target.closest("[data-aba]"); if (b) { S.aba = b.dataset.aba; pintar(); } });
    $("pvBusca").addEventListener("input", pintar);
    document.addEventListener("click", (e) => {
      const fa = e.target.closest("[data-form-aba]"); if (fa) return trocarAbaForm(fa.dataset.formAba);
      const eb = e.target.closest("[data-eq-fb]"); if (eb) return marcarEq(eb);
      const ga = e.target.closest("[data-gav-aba]"); if (ga) { const g = document.getElementById("pvGaveta"); g.querySelectorAll("[data-gav-aba]").forEach((b) => { const on = b === ga; b.classList.toggle("ativa", on); b.setAttribute("aria-selected", on); }); g.querySelectorAll("[data-gav-painel]").forEach((p) => { p.hidden = p.dataset.gavPainel !== ga.dataset.gavAba; }); return; }
      const pf = e.target.closest("[data-posicao]"); if (pf) { e.stopPropagation(); return abrirPosicaoFinal(pf.dataset.posicao); }
      if (e.target.closest("[data-fechar-gaveta]")) return fecharGaveta();
      const rg = e.target.closest("#pvGaveta [data-registrar]"); if (rg) return abrirFormulario(S.dados.contatos.find((c) => c.id === rg.dataset.registrar), true);
      if (e.target.closest("#pvGaveta [data-naoatendeu],#pvGaveta [data-dispensar]")) fecharGaveta();
      const lg = e.target.closest("[data-abrir-lig]"); if (lg && !e.target.closest("a")) return abrirLigacao(S.dados.contatos.find((c) => c.id === lg.dataset.abrirLig));
      const tr = e.target.closest("[data-tratativa]"); if (tr) return abrirTratativa(S.detalhe?.id === tr.dataset.tratativa ? S.detalhe : S.dados.contatos.find((c) => c.id === tr.dataset.tratativa));
      const r = e.target.closest("[data-registrar]"); if (r) return abrirFormulario(S.dados.contatos.find((c) => c.id === r.dataset.registrar));
      const n = e.target.closest("[data-naoatendeu]"); if (n) return acao(n.dataset.naoatendeu, "nao_atendeu");
      if (e.target.closest("[data-fechar-lateral]")) return fecharLateral();
      const v = e.target.closest("[data-ver]"); if (v) return abrirLateral(S.dados.contatos.find((c) => c.id === v.dataset.ver));
      const d = e.target.closest("[data-dispensar]"); if (d) return abrirDispensar(S.dados.contatos.find((c) => c.id === d.dataset.dispensar));
      if (e.target.closest("[data-fechar]")) fecharForm(false);
    });
    $("pvFormulario").addEventListener("submit", salvarFormulario);
    $("pvFormulario").addEventListener("change", (e) => { if (e.target.matches("input")) $("pvFormErro").textContent = ""; marcarAbasForm(); }); $("pvFormulario").addEventListener("input", (e) => { if (e.target.matches("textarea")) marcarAbasForm(); });
    document.addEventListener("keydown", (e) => { const vr = e.target.matches?.("tr[data-ver]") ? e.target : null; if (vr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); return abrirLateral(S.dados.contatos.find((c) => c.id === vr.dataset.ver)); }
      const lg = e.target.closest?.("[data-abrir-lig]"); if (lg && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrirLigacao(S.dados.contatos.find((c) => c.id === lg.dataset.abrirLig)); } });
  }

  async function iniciar() {
    const ctx = await window.aguardarContexto?.();
    S.sb = window.supabaseClient; S.emp = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    ligar();
    if (new URLSearchParams(location.search).get("aba") === "painel") S.aba = "painel";
    window.PosvendaAbrirLigacao = abrirLateral;
    try { await carregar(); } catch (e) { $("pvLista").innerHTML = '<div class="pv-vazio">' + esc(e.message) + "</div>"; if (S.aba === "painel") pintar(); }
  }
  iniciar();
})();
