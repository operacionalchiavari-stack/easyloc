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
    if (c.status === "concluido" && c.atencao) return "atencao";
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

  function linhaLigacao(c) {
    const hoje = S.dados.hoje, liberada = c.disponivel_em <= hoje, atrasada = liberada && c.prazo && c.prazo < hoje;
    const quando = !liberada ? '<span class="pv-selo">A partir de ' + dataBr(c.disponivel_em) + "</span>" + (c.ultimo_contato ? "<small>Último contato " + dataBr(c.ultimo_contato) + "</small>" : "<small>Intervalo entre contatos</small>")
      : atrasada ? '<span class="pv-selo atrasada">Atrasada</span><small>Era até ' + dataBr(c.prazo) + "</small>" : '<span class="pv-selo hoje">Ligar agora</span><small>Até ' + dataBr(c.prazo) + "</small>";
    const acoes = liberada
      ? '<button type="button" class="btn primary" data-registrar="' + c.id + '">Registrar</button><button type="button" class="btn" data-naoatendeu="' + c.id + '">Não atendeu</button><button type="button" class="btn pv-link" data-dispensar="' + c.id + '">Não ligar</button>'
      : '<button type="button" class="btn" data-registrar="' + c.id + '">Ligar agora</button>';
    return '<tr class="' + (liberada ? "" : "is-futura") + (atrasada ? " is-atrasada" : "") + '"><td>' + clienteHtml(c) + "</td><td>" + foneHtml(c) + "</td><td>" + eventosHtml(c) + "</td><td>" + quando + '</td><td class="num">' + (c.tentativas || 0) + '</td><td><div class="pv-acoes">' + acoes + "</div></td></tr>";
  }

  function linhaFeita(c) {
    const sit = c.status === "sem_contato" ? '<span class="pv-selo atrasada">Sem contato</span>' : c.status === "dispensado" ? '<span class="pv-selo">Não ligar</span><small>' + esc(c.motivo || "") + "</small>" : c.atencao ? '<span class="pv-selo atrasada">Precisa de atenção</span>' : '<span class="pv-selo novo">Concluída</span>';
    const resp = Array.isArray(c.respostas) ? c.respostas.filter((r) => r.respostas?.length) : [];
    const ruins = resp.filter((r) => r.ruim);
    const resumo = (ruins.length ? ruins : resp.slice(0, 2)).map((r) => '<div class="' + (r.ruim ? "pv-ruim" : "") + '"><small>' + esc(r.pergunta) + "</small> " + r.respostas.map(esc).join(", ") + "</div>").join("") + (c.observacao ? '<div class="pv-obs-l">“' + esc(c.observacao) + "”</div>" : "");
    return "<tr" + (c.atencao ? ' class="is-atencao"' : "") + "><td>" + clienteHtml(c) + "</td><td>" + eventosHtml(c) + "</td><td>" + sit + "</td><td>" + (resumo || "—") + "</td><td>" + esc(c.feito_por_nome || "") + "<small>" + dataHora(c.concluido_em || c.ultima_tentativa_em) + "</small></td><td>" +
      (resp.length ? '<button type="button" class="btn" data-ver="' + c.id + '">Ver respostas</button>' : "") + "</td></tr>";
  }

  function verRespostas(c) {
    S.atual = c; S.modo = "ver";
    $("pvFormTitulo").textContent = "Respostas · " + (c.cliente_nome || "");
    $("pvFormErro").textContent = "";
    $("pvFormCorpo").innerHTML = '<dl class="pv-resp">' + (c.respostas || []).filter((r) => r.respostas?.length).map((r) => "<dt>" + esc(r.pergunta) + '</dt><dd class="' + (r.ruim ? "ruim" : "") + '">' + r.respostas.map(esc).join(", ") + "</dd>").join("") + "</dl>" + (c.observacao ? '<p class="pv-obs">' + esc(c.observacao) + "</p>" : "");
    $("pvFormulario").querySelector("button[type=submit]").hidden = true;
    $("pvForm").showModal();
  }

  function pintar() {
    const q = $("pvBusca").value.trim().toLowerCase(), todos = S.dados.contatos || [], hoje = S.dados.hoje;
    $("pvContHoje").textContent = todos.filter((c) => c.status === "pendente" && c.disponivel_em <= hoje).length || "";
    $("pvContAtencao").textContent = todos.filter((c) => grupo(c) === "atencao").length || "";
    document.querySelectorAll("#pvAbas [data-aba]").forEach((b) => { const ativa = b.dataset.aba === S.aba; b.classList.toggle("ativa", ativa); b.setAttribute("aria-selected", String(ativa)); });
    // Nov/2026: aba "Conversas no WhatsApp" (posvenda-conversas.js) troca a tabela pela central de conversas.
    const conversas = S.aba === "conversas";
    $("pvLista").hidden = conversas; $("pvConversas").hidden = !conversas; $("pvBusca").closest(".pv-busca").hidden = conversas;
    if (conversas) { window.PosvendaConversas?.mostrar({ sb: S.sb, emp: S.emp, contatos: S.dados.contatos }); return; }
    const lista = todos.filter((c) => grupo(c) === S.aba && (!q || [c.cliente_nome, ...(c.pedidos || []).map((p) => p.numero)].some((x) => String(x || "").toLowerCase().includes(q))));
    if (S.aba === "ligacoes") lista.sort((a, b) => String(a.disponivel_em).localeCompare(String(b.disponivel_em)) || String(a.prazo).localeCompare(String(b.prazo)));
    else lista.sort((a, b) => String(b.concluido_em || "").localeCompare(String(a.concluido_em || "")));
    if (!lista.length) {
      $("pvLista").innerHTML = '<div class="pv-vazio">' + ({ ligacoes: "Nenhuma ligação. As ligações aparecem quando o Financeiro confirma a Posição final do pedido.", atencao: "Nenhum feedback com resposta ruim.", feitas: "Nenhuma ligação registrada ainda." })[S.aba] + "</div>";
      return;
    }
    const cab = S.aba === "ligacoes" ? '<th>Cliente</th><th>Telefone</th><th>Eventos</th><th>Quando</th><th class="num">Tentativas</th><th></th>' : "<th>Cliente</th><th>Eventos</th><th>Situação</th><th>Respostas</th><th>Registrado por</th><th></th>";
    $("pvLista").innerHTML = '<div class="pv-rolar"><table class="pv-tabela"><thead><tr>' + cab + "</tr></thead><tbody>" + lista.map(S.aba === "ligacoes" ? linhaLigacao : linhaFeita).join("") + "</tbody></table></div>";
  }

  function abrirDispensar(c) {
    S.atual = c; S.modo = "dispensar"; $("pvFormulario").querySelector("button[type=submit]").hidden = false;
    $("pvFormTitulo").textContent = "Não ligar · " + (c.cliente_nome || "");
    $("pvFormErro").textContent = "";
    $("pvFormCorpo").innerHTML = '<label class="pv-obs-campo">Por que não ligar? (fica registrado)<textarea name="__motivo" rows="3" required minlength="3" placeholder="Ex.: o cliente pediu para não ligar"></textarea></label>';
    $("pvForm").showModal();
  }

  function abrirFormulario(c) {
    S.atual = c; S.modo = "concluir"; $("pvFormulario").querySelector("button[type=submit]").hidden = false;
    const cfg = S.dados.config || {};
    $("pvFormTitulo").textContent = "Ligação · " + (c.cliente_nome || "");
    $("pvFormErro").textContent = "";
    $("pvFormCorpo").innerHTML = '<ul class="pv-eventos">' + (c.pedidos || []).map((p) => "<li><b>Pedido " + esc(p.numero) + "</b> · " + dataBr(p.data_evento) + " · " + esc(p.local || "") + "</li>").join("") + "</ul>" +
      (cfg.perguntas || []).map((p) => '<fieldset class="pv-perg" data-perg="' + esc(p.id) + '"><legend>' + esc(p.texto) + (p.obrigatoria ? ' <span class="pv-obrig">*</span>' : "") + (p.tipo === "multipla" ? " <small>(pode marcar mais de uma)</small>" : "") + "</legend><div class=\"pv-opcoes\">" +
        (p.opcoes || []).map((o) => '<label class="pv-opcao"><input type="' + (p.tipo === "multipla" ? "checkbox" : "radio") + '" name="' + esc(p.id) + '" value="' + esc(o.id) + '"><span>' + esc(o.texto) + "</span></label>").join("") + "</div></fieldset>").join("") +
      (cfg.observacao !== false ? '<label class="pv-obs-campo">Observação (opcional)<textarea name="__obs" rows="3"></textarea></label>' : "");
    $("pvForm").showModal();
  }

  async function salvarFormulario(e) {
    e.preventDefault();
    const f = $("pvFormulario"), cfg = S.dados.config || {}, respostas = {};
    if (S.modo === "ver") { $("pvForm").close(); return; }
    if (S.modo === "dispensar") {
      try { await rpc("posvenda_registrar", { p_empresa: S.emp, p_contato: S.atual.id, p_acao: "dispensar", p_respostas: null, p_observacao: null, p_motivo: f.querySelector('[name="__motivo"]').value });
        $("pvForm").close(); await carregar(); } catch (err) { $("pvFormErro").textContent = err.message; }
      return;
    }
    for (const p of cfg.perguntas || []) {
      const marcadas = [...f.querySelectorAll('input[name="' + CSS.escape(p.id) + '"]:checked')].map((i) => i.value);
      if (p.obrigatoria && !marcadas.length) { $("pvFormErro").textContent = "Responda: " + p.texto; f.querySelector('[data-perg="' + CSS.escape(p.id) + '"]')?.scrollIntoView({ block: "center" }); return; }
      respostas[p.id] = p.tipo === "multipla" ? marcadas : (marcadas[0] || null);
    }
    const b = f.querySelector("button[type=submit]"); b.disabled = true;
    try {
      await rpc("posvenda_registrar", { p_empresa: S.emp, p_contato: S.atual.id, p_acao: "concluir", p_respostas: respostas, p_observacao: f.querySelector('[name="__obs"]')?.value || null, p_motivo: null });
      $("pvForm").close(); avisar("Ligação registrada.", "Pós-venda", "sucesso"); await carregar();
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
      const r = e.target.closest("[data-registrar]"); if (r) return abrirFormulario(S.dados.contatos.find((c) => c.id === r.dataset.registrar));
      const n = e.target.closest("[data-naoatendeu]"); if (n) return acao(n.dataset.naoatendeu, "nao_atendeu");
      const v = e.target.closest("[data-ver]"); if (v) return verRespostas(S.dados.contatos.find((c) => c.id === v.dataset.ver));
      const d = e.target.closest("[data-dispensar]"); if (d) return abrirDispensar(S.dados.contatos.find((c) => c.id === d.dataset.dispensar));
      if (e.target.closest("[data-fechar]")) $("pvForm").close();
    });
    $("pvFormulario").addEventListener("submit", salvarFormulario);
  }

  async function iniciar() {
    const ctx = await window.aguardarContexto?.();
    S.sb = window.supabaseClient; S.emp = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    ligar();
    if (new URLSearchParams(location.search).get("aba") === "conversas" || new URLSearchParams(location.search).get("exemplo") === "1") S.aba = "conversas";
    try { await carregar(); } catch (e) { $("pvLista").innerHTML = '<div class="pv-vazio">' + esc(e.message) + "</div>"; if (S.aba === "conversas") pintar(); }
    if (S.aba !== "conversas") window.PosvendaConversas?.contar({ sb: S.sb, emp: S.emp });
  }
  iniciar();
})();
