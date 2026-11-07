/* =====================================================
   PÓS-VENDA · CONVERSAS NO WHATSAPP (nov/2026)
   A IA conversa com o decorador pelo Z-API para pegar o feedback do evento. Aqui a equipe acompanha:
   à esquerda as conversas (Agora / Anteriores), no meio as mensagens (enviadas e recebidas, com foto, áudio,
   vídeo e documento) e à direita o resultado registrado (nota, sentimento, elogios, críticas, sugestões).
   A equipe pode assumir a conversa (pausa a IA) e responder pelo WhatsApp, e encerrar.
   Dados: posvenda_conversas / posvenda_mensagens (o webhook zapi-webhook grava as respostas).
   ?exemplo=1 mostra conversas de exemplo (só na tela, nada é gravado).
===================================================== */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const EXEMPLO = new URLSearchParams(location.search).get("exemplo") === "1";
  const C = { sb: null, emp: null, conversas: [], msgs: {}, sel: null, filtro: "agora", busca: "", timer: 0, carregado: false, pedidosPorContato: {} };
  const avisar = (m, tipo = "aviso") => (window.alerta ? window.alerta(m, "Pós-venda", tipo) : alert(m));
  const ATIVAS = ["ativa", "aguardando"];
  const SIT = {
    ativa: ["IA conversando", "ia"], aguardando: ["Aguardando resposta", "espera"], concluida: ["Concluída", "ok"],
    sem_resposta: ["Sem resposta", "cinza"], encerrada: ["Encerrada", "cinza"],
  };
  const SENT = { positivo: ["Positivo", "ok"], neutro: ["Neutro", "cinza"], negativo: ["Negativo", "ruim"] };

  const hora = (v) => (v ? new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
  function quando(v) {
    if (!v) return "";
    const d = new Date(v), hoje = new Date(), ontem = new Date(Date.now() - 864e5);
    if (d.toDateString() === hoje.toDateString()) return hora(v);
    if (d.toDateString() === ontem.toDateString()) return "Ontem";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  const diaTitulo = (v) => { const d = new Date(v), h = new Date(); if (d.toDateString() === h.toDateString()) return "Hoje"; if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return "Ontem"; return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }); };
  const fone = (t) => { const d = String(t || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t || ""; };
  const iniciais = (n) => String(n || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  async function rpc(nome, args) { const { data, error } = await C.sb.rpc(nome, args); if (error) throw new Error(error.message || error); return data; }

  /* ---------------- dados ---------------- */
  async function carregarConversas() {
    if (EXEMPLO) { if (!C.carregado) exemplo(); C.carregado = true; return; }
    const { data, error } = await C.sb.from("posvenda_conversas").select("*").eq("empresa_id", C.emp).order("ultima_mensagem_em", { ascending: false, nullsFirst: false }).limit(300);
    if (error) throw error;
    C.conversas = data || [];
    // Último texto de cada conversa (para a prévia da lista).
    const ids = C.conversas.map((c) => c.id);
    if (ids.length) {
      const { data: ult } = await C.sb.from("posvenda_mensagens").select("conversa_id,texto,tipo,direcao,autor,created_at").in("conversa_id", ids.slice(0, 300)).order("created_at", { ascending: false }).limit(1500);
      const vis = {};
      (ult || []).forEach((m) => { if (!vis[m.conversa_id]) vis[m.conversa_id] = m; });
      C.conversas.forEach((c) => { c._ultima = vis[c.id] || null; });
    }
    C.carregado = true;
  }
  async function carregarMensagens(id) {
    if (EXEMPLO) return;
    const { data, error } = await C.sb.from("posvenda_mensagens").select("*").eq("conversa_id", id).order("created_at");
    if (error) throw error;
    C.msgs[id] = data || [];
  }

  /* ---------------- desenho ---------------- */
  function filtradas() {
    const b = C.busca.trim().toLowerCase();
    return C.conversas.filter((c) => (C.filtro === "agora" ? ATIVAS.includes(c.status) : !ATIVAS.includes(c.status)))
      .filter((c) => !b || [c.cliente_nome, c.telefone, c.resultado?.resumo].join(" ").toLowerCase().includes(b));
  }
  function contagens() {
    const agora = C.conversas.filter((c) => ATIVAS.includes(c.status)).length;
    const badge = $("pvContConversas"); if (badge) badge.textContent = agora || "";
    return { agora, anteriores: C.conversas.length - agora };
  }
  function previa(c) {
    const m = c._ultima; if (!m) return "Sem mensagens ainda";
    const quem = m.direcao === "saida" ? (m.autor === "ia" ? "IA: " : "Equipe: ") : "";
    const t = m.tipo === "imagem" ? "📷 Foto" + (m.texto ? " · " + m.texto : "") : m.tipo === "audio" ? "🎙 Áudio" : m.tipo === "video" ? "🎬 Vídeo" : m.tipo === "documento" ? "📄 " + (m.texto || "Documento") : m.texto || "";
    return quem + t;
  }
  function itemLista(c) {
    const sit = SIT[c.status] || [c.status, "cinza"];
    const rot = !c.ia_ativa && ATIVAS.includes(c.status) ? ["Equipe assumiu", "equipe"] : sit;
    const nota = c.resultado && c.resultado.nota != null && c.resultado.nota !== "" ? '<span class="pvc-nota">' + esc(c.resultado.nota) + "/10</span>" : "";
    const sent = c.resultado?.sentimento && SENT[c.resultado.sentimento] ? '<span class="pvc-ponto ' + SENT[c.resultado.sentimento][1] + '" title="' + SENT[c.resultado.sentimento][0] + '"></span>' : "";
    return '<button type="button" class="pvc-item' + (C.sel === c.id ? " is-sel" : "") + '" data-conversa="' + c.id + '">' +
      '<span class="pvc-av">' + esc(iniciais(c.cliente_nome)) + "</span>" +
      '<span class="pvc-item-meio"><span class="pvc-item-topo"><b>' + esc(c.cliente_nome || fone(c.telefone)) + "</b><small>" + esc(quando(c.ultima_mensagem_em || c.iniciada_em)) + "</small></span>" +
      '<span class="pvc-prev">' + esc(previa(c)) + "</span>" +
      '<span class="pvc-item-pe"><span class="pvc-selo ' + rot[1] + '">' + esc(rot[0]) + "</span>" + nota + sent + "</span></span></button>";
  }
  function pintarLista() {
    const n = contagens();
    $("pvcFiltroAgora").textContent = "Agora" + (n.agora ? " · " + n.agora : "");
    $("pvcFiltroAnt").textContent = "Anteriores" + (n.anteriores ? " · " + n.anteriores : "");
    document.querySelectorAll("[data-pvc-filtro]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pvcFiltro === C.filtro)));
    const lista = filtradas();
    $("pvcLista").innerHTML = lista.length ? lista.map(itemLista).join("")
      : '<p class="pvc-vazio-lista">' + (C.filtro === "agora" ? "Nenhuma conversa acontecendo agora." : "Nenhuma conversa anterior.") + (C.conversas.length ? "" : "<br><small>Quando a IA começar a falar com os decoradores pelo WhatsApp, as conversas aparecem aqui.</small>") + "</p>";
  }

  function midia(m) {
    const u = esc(m.midia_url || "");
    if (!m.midia_url) return "";
    if (m.tipo === "imagem") return '<a class="pvc-img" href="' + u + '" target="_blank" rel="noopener"><img src="' + u + '" alt="Foto enviada" loading="lazy"></a>';
    if (m.tipo === "audio") return '<audio controls preload="none" src="' + u + '"></audio>';
    if (m.tipo === "video") return '<video controls preload="none" src="' + u + '"></video>';
    return '<a class="pvc-doc" href="' + u + '" target="_blank" rel="noopener">📄 ' + esc(m.texto || "Documento") + "</a>";
  }
  function tique(m) {
    if (m.direcao !== "saida") return "";
    if (m.status === "falha") return '<span class="pvc-tique falha" title="' + esc(m.erro || "Falha no envio") + '">! não enviada</span>';
    if (m.status === "lido") return '<span class="pvc-tique lido" title="Lida">✓✓</span>';
    if (m.status === "recebido") return '<span class="pvc-tique" title="Entregue">✓✓</span>';
    if (m.status === "pendente") return '<span class="pvc-tique" title="Enviando">🕓</span>';
    return '<span class="pvc-tique" title="Enviada">✓</span>';
  }
  function balao(m) {
    const quem = m.direcao === "entrada" ? "" : m.autor === "ia" ? '<span class="pvc-autor ia">IA</span>' : '<span class="pvc-autor">' + esc(m.autor_nome || "Equipe") + "</span>";
    const texto = m.texto && !(m.tipo === "documento" && m.midia_url) ? "<p>" + esc(m.texto) + "</p>" : "";
    return '<div class="pvc-msg ' + (m.direcao === "entrada" ? "entrada" : "saida " + m.autor) + '">' + quem + midia(m) + texto + '<span class="pvc-hora">' + hora(m.created_at) + tique(m) + "</span></div>";
  }
  function pintarConversa() {
    const c = C.conversas.find((x) => x.id === C.sel);
    const host = $("pvcConversa"), res = $("pvcResultado");
    if (!c) { host.innerHTML = '<div class="pvc-nada"><span>💬</span><p>Escolha uma conversa para ver as mensagens.</p></div>'; res.innerHTML = ""; return; }
    const msgs = C.msgs[c.id] || [];
    let dia = "", corpo = "";
    msgs.forEach((m) => { const d = new Date(m.created_at).toDateString(); if (d !== dia) { dia = d; corpo += '<div class="pvc-dia"><span>' + esc(diaTitulo(m.created_at)) + "</span></div>"; } corpo += balao(m); });
    const ativa = ATIVAS.includes(c.status);
    const rodape = !ativa ? '<div class="pvc-rodape-fim">Conversa ' + esc((SIT[c.status] || [c.status])[0].toLowerCase()) + (c.encerrada_em ? " em " + new Date(c.encerrada_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "") + ".</div>"
      : c.ia_ativa ? '<div class="pvc-rodape-ia"><span class="pvc-pulso"></span><span>A IA está conduzindo esta conversa.</span><button type="button" class="btn" data-pvc="assumir">Assumir conversa</button></div>'
      : '<form class="pvc-escrever" id="pvcEscrever"><textarea rows="1" placeholder="Escreva para ' + esc(String(c.cliente_nome || "o decorador").split(" ")[0]) + '…" aria-label="Mensagem"></textarea><button type="submit" class="btn primary">Enviar</button></form><div class="pvc-rodape-equipe">Você assumiu a conversa' + (c.assumida_por_nome ? " (" + esc(c.assumida_por_nome) + ")" : "") + '. <button type="button" class="pv-link" data-pvc="devolver">Devolver para a IA</button></div>';
    host.innerHTML = '<header class="pvc-cab"><span class="pvc-av">' + esc(iniciais(c.cliente_nome)) + '</span><div><b>' + esc(c.cliente_nome || "Decorador") + "</b><small>" + esc(fone(c.telefone)) + ' · <a href="https://wa.me/' + esc(String(c.telefone).replace(/\D/g, "")) + '" target="_blank" rel="noopener">abrir no WhatsApp</a></small></div></header>' +
      '<div class="pvc-msgs" id="pvcMsgs">' + (corpo || '<p class="pvc-vazio-lista">Nenhuma mensagem ainda.</p>') + "</div>" + rodape;
    const box = $("pvcMsgs"); box.scrollTop = box.scrollHeight;
    pintarResultado(c);
  }
  function lista(titulo, itens, cls) {
    const arr = (Array.isArray(itens) ? itens : []).filter(Boolean);
    return '<section class="pvc-res-bloco ' + cls + '"><h4>' + titulo + ' <small>' + arr.length + "</small></h4>" + (arr.length ? "<ul>" + arr.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul>" : '<p class="pvc-res-vazio">Nada registrado.</p>') + "</section>";
  }
  function pintarResultado(c) {
    const r = c.resultado || {}, sent = SENT[r.sentimento];
    const pedidos = C.pedidosPorContato[c.contato_id] || [];
    const ativa = ATIVAS.includes(c.status);
    $("pvcResultado").innerHTML =
      '<h3>Resultado da conversa</h3>' +
      '<div class="pvc-res-topo"><div><small>Nota</small><b class="pvc-res-nota">' + (r.nota != null && r.nota !== "" ? esc(r.nota) + "<em>/10</em>" : "—") + "</b></div><div><small>Sentimento</small>" + (sent ? '<span class="pvc-selo ' + sent[1] + '">' + sent[0] + "</span>" : "<b>—</b>") + "</div></div>" +
      (r.resumo ? '<p class="pvc-res-resumo">' + esc(r.resumo) + "</p>" : '<p class="pvc-res-vazio">' + (ativa ? "A IA preenche o resultado conforme a conversa avança." : "Sem resumo.") + "</p>") +
      (r.quer_retorno ? '<p class="pvc-res-alerta">⚠ O decorador quer um retorno da equipe.</p>' : "") +
      lista("Elogios", r.elogios, "elogio") + lista("Críticas", r.criticas, "critica") + lista("Sugestões", r.sugestoes, "sugestao") +
      (pedidos.length ? '<section class="pvc-res-bloco"><h4>Eventos</h4>' + pedidos.map((p) => "<div class=\"pvc-ev\"><b>Pedido " + esc(p.numero) + "</b><small>" + esc([p.data_evento ? new Date(p.data_evento + "T12:00:00").toLocaleDateString("pt-BR") : "", p.local].filter(Boolean).join(" · ")) + "</small></div>").join("") + "</section>" : "") +
      (ativa ? '<div class="pvc-res-acoes"><button type="button" class="btn" data-pvc="concluir">Marcar como concluída</button><button type="button" class="pv-link" data-pvc="sem_resposta">Sem resposta</button></div>' : "");
  }
  function pintar() { pintarLista(); pintarConversa(); }

  /* ---------------- ações ---------------- */
  async function abrir(id) {
    C.sel = id; pintar();
    try { await carregarMensagens(id); } catch (e) { avisar("Não foi possível carregar as mensagens: " + e.message, "erro"); }
    if (C.sel === id) pintarConversa();
  }
  async function acao(qual) {
    const c = C.conversas.find((x) => x.id === C.sel); if (!c) return;
    if (EXEMPLO) { avisar("No modo de exemplo nada é gravado."); return; }
    try {
      if (qual === "assumir" || qual === "devolver") Object.assign(c, await rpc("posvenda_conversa_assumir", { p_empresa: C.emp, p_id: c.id, p_assumir: qual === "assumir" }));
      if (qual === "concluir" || qual === "sem_resposta") {
        const ok = await (window.confirmarGlobal ? window.confirmarGlobal(qual === "concluir" ? "Marcar a conversa como concluída?" : "Marcar como sem resposta?") : Promise.resolve(confirm("Confirmar?")));
        if (!ok) return;
        Object.assign(c, await rpc("posvenda_conversa_resultado", { p_empresa: C.emp, p_id: c.id, p_status: qual === "concluir" ? "concluida" : "sem_resposta" }));
      }
      pintar();
    } catch (e) { avisar(e.message, "erro"); }
  }
  async function enviar(texto) {
    const c = C.conversas.find((x) => x.id === C.sel); if (!c || !texto.trim()) return;
    if (EXEMPLO) { avisar("No modo de exemplo nada é enviado."); return; }
    const botao = document.querySelector("#pvcEscrever [type=submit]"); if (botao) botao.disabled = true;
    let zapiId = null, erro = null;
    try {
      const { data, error } = await C.sb.functions.invoke("zapi-integration", { body: { action: "send-message", empresa_id: C.emp, message: { phone: c.telefone, type: "texto", text: texto.trim(), origem: "posvenda" } } });
      if (error) { let m = ""; try { const b = await error.context?.json?.(); m = b?.details || b?.erro || ""; } catch (_) {} throw new Error(m || error.message); }
      if (data?.erro || data?.ok === false) throw new Error(data.erro || "Falha no envio");
      zapiId = data?.response?.messageId || data?.response?.id || null;
    } catch (e) { erro = e.message || String(e); }
    try {
      const m = await rpc("posvenda_mensagem_equipe", { p_empresa: C.emp, p_conversa: c.id, p_texto: texto, p_zapi_id: zapiId, p_erro: erro });
      (C.msgs[c.id] = C.msgs[c.id] || []).push(m); c.ultima_mensagem_em = m.created_at; c._ultima = m;
    } catch (e) { avisar(e.message, "erro"); }
    if (erro) avisar("A mensagem não foi enviada pelo WhatsApp: " + erro, "erro");
    pintar();
    if (botao) botao.disabled = false;
  }

  async function atualizar() {
    if (document.hidden || $("pvConversas")?.hidden) return;
    try { await carregarConversas(); if (C.sel) await carregarMensagens(C.sel); pintar(); } catch (e) { console.warn("[Pós-venda] conversas:", e); }
  }

  function ligar() {
    document.addEventListener("click", (e) => {
      const it = e.target.closest("[data-conversa]"); if (it) { abrir(it.dataset.conversa); return; }
      const f = e.target.closest("[data-pvc-filtro]"); if (f) { C.filtro = f.dataset.pvcFiltro; pintarLista(); return; }
      const a = e.target.closest("[data-pvc]"); if (a) acao(a.dataset.pvc);
    });
    document.addEventListener("submit", (e) => { if (e.target.id !== "pvcEscrever") return; e.preventDefault(); const t = e.target.querySelector("textarea"); const v = t.value; t.value = ""; enviar(v); });
    document.addEventListener("keydown", (e) => { if (e.target.closest?.("#pvcEscrever") && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.closest("form").requestSubmit(); } });
    $("pvcBusca").addEventListener("input", (e) => { C.busca = e.target.value; pintarLista(); });
  }

  /* ---------------- exemplo (só na tela) ---------------- */
  function exemplo() {
    const agora = Date.now(), min = (n) => new Date(agora - n * 60000).toISOString(), img = "https://images.unsplash.com/photo-1519741497674-611481863552?w=600";
    C.conversas = [
      { id: "ex1", cliente_nome: "Ana Beatriz Decorações", telefone: "5524999112233", status: "ativa", ia_ativa: true, iniciada_em: min(40), ultima_mensagem_em: min(2), contato_id: "c1",
        resultado: { nota: 9, sentimento: "positivo", resumo: "Gostou muito da montagem e do estado dos móveis. Reclamou do atraso de 40 minutos na entrega.", elogios: ["Equipe de montagem educada e caprichosa", "Sofás impecáveis, sem manchas"], criticas: ["Entrega chegou 40 minutos depois do combinado"], sugestoes: [], quer_retorno: false } },
      { id: "ex2", cliente_nome: "Studio Lírio", telefone: "5521988776655", status: "aguardando", ia_ativa: true, iniciada_em: min(300), ultima_mensagem_em: min(280), resultado: {} },
      { id: "ex3", cliente_nome: "Carla Mendes Eventos", telefone: "5532991234567", status: "concluida", ia_ativa: true, iniciada_em: min(3000), ultima_mensagem_em: min(2900), encerrada_em: min(2900),
        resultado: { nota: 6, sentimento: "negativo", resumo: "Uma poltrona chegou com o tecido rasgado e foi trocada no local. Quer conversar sobre o desconto.", elogios: ["Atendimento comercial rápido"], criticas: ["Poltrona Orka com tecido rasgado", "Faltou um puff no carregamento"], sugestoes: ["Conferir o tecido das poltronas antes de carregar"], quer_retorno: true } },
    ];
    C.msgs.ex1 = [
      { direcao: "saida", autor: "ia", texto: "Oi, Ana! Aqui é da Chiavari 😊 Queria saber como foi o casamento de sábado na Villa Bisutti. Deu tudo certo com os móveis?", status: "lido", created_at: min(40) },
      { direcao: "entrada", autor: "cliente", texto: "Oi! Foi lindo demais, os noivos amaram o lounge", status: "recebido", created_at: min(30) },
      { direcao: "entrada", autor: "cliente", tipo: "imagem", midia_url: img, texto: "Olha como ficou", status: "recebido", created_at: min(29) },
      { direcao: "saida", autor: "ia", texto: "Que lindo, ficou incrível! E a entrega e a montagem, como foram?", status: "lido", created_at: min(25) },
      { direcao: "entrada", autor: "cliente", texto: "A equipe foi ótima, muito educada. Só a entrega que chegou uns 40 minutos atrasada", status: "recebido", created_at: min(10) },
      { direcao: "saida", autor: "ia", texto: "Obrigada por avisar, vou registrar o atraso para a logística. De 0 a 10, que nota você daria para o atendimento da Chiavari nesse evento?", status: "recebido", created_at: min(2) },
    ].map((m, i) => ({ id: "m" + i, tipo: "texto", ...m }));
    C.msgs.ex2 = [{ id: "n1", direcao: "saida", autor: "ia", tipo: "texto", texto: "Oi! Aqui é da Chiavari. Como foi o evento de ontem? Deu tudo certo com os móveis?", status: "recebido", created_at: min(280) }];
    C.msgs.ex3 = [
      { direcao: "saida", autor: "ia", texto: "Oi, Carla! Como foi a festa de 15 anos no sábado?", status: "lido", created_at: min(3000) },
      { direcao: "entrada", autor: "cliente", texto: "Oi, no geral foi bom, mas uma poltrona chegou rasgada", status: "recebido", created_at: min(2990) },
      { direcao: "entrada", autor: "cliente", tipo: "imagem", midia_url: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600", status: "recebido", created_at: min(2989) },
      { direcao: "saida", autor: "equipe", autor_nome: "Jonatan", texto: "Carla, sinto muito! Vou te ligar ainda hoje para resolvermos.", status: "lido", created_at: min(2950) },
    ].map((m, i) => ({ id: "k" + i, tipo: "texto", ...m }));
    C.conversas.forEach((c) => { const l = (C.msgs[c.id] || []).slice(-1)[0]; c._ultima = l || null; });
    C.pedidosPorContato.c1 = [{ numero: "9", data_evento: "2026-11-01", local: "Villa Bisutti" }];
  }

  /* ---------------- início (chamado pelo posvenda.js ao abrir a aba) ---------------- */
  let iniciado = false;
  async function mostrar(ctx) {
    C.sb = ctx.sb; C.emp = ctx.emp;
    (ctx.contatos || []).forEach((c) => { C.pedidosPorContato[c.id] = c.pedidos || []; });
    if (!iniciado) { iniciado = true; ligar(); C.timer = setInterval(atualizar, 8000); document.addEventListener("visibilitychange", atualizar); }
    try { await carregarConversas(); } catch (e) { $("pvcLista").innerHTML = '<p class="pvc-vazio-lista">Não foi possível carregar as conversas: ' + esc(e.message) + "</p>"; return; }
    if (!C.sel) { const primeira = filtradas()[0]; if (primeira) { abrir(primeira.id); return; } }
    pintar();
  }
  async function contar(ctx) { C.sb = ctx.sb; C.emp = ctx.emp; try { await carregarConversas(); contagens(); } catch (_) {} }
  window.PosvendaConversas = { mostrar, contar };
})();
