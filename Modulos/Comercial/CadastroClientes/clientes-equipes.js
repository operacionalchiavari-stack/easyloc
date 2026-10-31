// Equipes de clientes (out/2026): decoradora titular + assistentes/sócios que fazem pedidos em nome dela.
// Uma pessoa pode estar em várias equipes; o pedido pergunta de qual equipe ele é (js/pedido/pedido.equipe.mjs).
// Tabelas: clientes_equipes, clientes_equipe_membros, clientes_equipe_papeis (papéis em Parâmetros > Comercial).
(function () {
  const db = () => window.supabaseClient;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const avisar = (m, t = "Equipes", tipo = "aviso") => (window.alerta ? window.alerta(m, t, tipo) : alert(m));
  const s = { equipes: [], membros: [], papeis: [], editando: null, dlg: null };

  async function empresa() {
    if (window.aguardarContexto) await window.aguardarContexto();
    return window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
  }
  const clientes = () => (window.clientesCache || []).filter((c) => c && c.id);
  const nomeCliente = (id) => clientes().find((c) => c.id === id)?.nome_razao || "Cliente";
  const fotoCliente = (id) => { const c = clientes().find((x) => x.id === id); const u = c?.catalogo_logo_url || ""; return /^https?:\/\//i.test(u) ? u : ""; };
  const avatar = (id) => { const f = fotoCliente(id); return f ? `<img src="${esc(f)}" alt="">` : esc(nomeCliente(id).trim().charAt(0).toUpperCase() || "?"); };

  async function carregar() {
    const emp = await empresa();
    const [e, m, p] = await Promise.all([
      db().from("clientes_equipes").select("*").eq("empresa_id", emp).order("nome"),
      db().from("clientes_equipe_membros").select("*").eq("empresa_id", emp),
      db().from("clientes_equipe_papeis").select("*").eq("empresa_id", emp).order("ordem").order("nome"),
    ]);
    const erro = e.error || m.error || p.error;
    if (erro) throw erro;
    s.equipes = e.data || []; s.membros = m.data || []; s.papeis = p.data || [];
  }
  const papelNome = (id) => s.papeis.find((p) => p.id === id)?.nome || "";
  const membrosDe = (eqId) => s.membros.filter((m) => m.equipe_id === eqId);

  function dialogo() {
    if (s.dlg) return s.dlg;
    const d = document.createElement("dialog");
    d.className = "ceq-dialog"; d.id = "clientesEquipesDialog"; d.setAttribute("aria-labelledby", "ceqTitulo");
    d.innerHTML = '<div class="ceq-topo"><h3 id="ceqTitulo">Equipes</h3><button type="button" class="ceq-x" data-ceq="fechar" aria-label="Fechar">×</button></div><div class="ceq-corpo" id="ceqCorpo"></div>';
    document.body.appendChild(d);
    d.addEventListener("click", (ev) => { if (ev.target === d) d.close(); });
    d.addEventListener("close", () => window.ClientesEquipes?.mostrarDoCliente?.(window.__clienteDetalheId || null));
    s.dlg = d; return d;
  }

  async function abrir(equipeId) {
    const d = dialogo();
    if (!d.open) d.showModal();
    d.querySelector("#ceqCorpo").innerHTML = '<div class="ceq-vazio">Carregando…</div>';
    try { await carregar(); } catch (err) { console.error(err); d.querySelector("#ceqCorpo").innerHTML = '<div class="ceq-vazio">Não foi possível carregar as equipes.</div>'; return; }
    if (equipeId === "nova") editar(null); else if (equipeId) editar(s.equipes.find((e) => e.id === equipeId) || null); else lista();
  }

  function lista() {
    const d = dialogo(); d.querySelector("#ceqTitulo").textContent = "Equipes";
    const corpo = d.querySelector("#ceqCorpo");
    const linhas = s.equipes.map((e) => {
      const ms = membrosDe(e.id);
      return `<tr data-ceq-abrir="${e.id}" tabindex="0"${e.ativo ? "" : ' class="is-inativa"'}>
        <td><strong>${esc(e.nome)}</strong>${e.ativo ? "" : ' <span class="ceq-selo">Inativa</span>'}${e.observacao ? `<small>${esc(e.observacao)}</small>` : ""}</td>
        <td>${e.titular_id ? `<span class="ceq-pessoa"><span class="ceq-av">${avatar(e.titular_id)}</span>${esc(nomeCliente(e.titular_id))}</span>` : "—"}</td>
        <td><div class="ceq-avs">${ms.slice(0, 6).map((m) => `<span class="ceq-av" title="${esc(nomeCliente(m.cliente_id))}">${avatar(m.cliente_id)}</span>`).join("")}</div>${ms.length} pessoa${ms.length === 1 ? "" : "s"}</td>
      </tr>`;
    }).join("");
    corpo.innerHTML = `<div class="ceq-barra"><p>Junte a decoradora titular e quem faz pedidos por ela (assistentes, sócios). No pedido, o sistema pergunta de qual equipe ele é.</p><button type="button" class="btn primary" data-ceq="nova">+ Nova equipe</button></div>` +
      (s.equipes.length ? `<table class="ceq-tabela"><thead><tr><th>Equipe</th><th>Titular</th><th>Pessoas</th></tr></thead><tbody>${linhas}</tbody></table>`
        : '<div class="ceq-vazio">Nenhuma equipe ainda. Crie a primeira.</div>');
  }

  function editar(eq) {
    const d = dialogo();
    s.editando = {
      id: eq?.id || null, nome: eq?.nome || "", observacao: eq?.observacao || "", ativo: eq ? eq.ativo !== false : true,
      titular_id: eq?.titular_id || "",
      membros: eq ? membrosDe(eq.id).map((m) => ({ cliente_id: m.cliente_id, papel_id: m.papel_id || "" })) : [],
    };
    d.querySelector("#ceqTitulo").textContent = eq ? "Editar equipe" : "Nova equipe";
    pintarEdicao();
  }

  function opcoesPapel(sel) {
    return '<option value="">Sem papel</option>' + s.papeis.filter((p) => p.ativo !== false || p.id === sel)
      .map((p) => `<option value="${p.id}"${p.id === sel ? " selected" : ""}>${esc(p.nome)}</option>`).join("");
  }

  function pintarEdicao() {
    const e = s.editando; const corpo = dialogo().querySelector("#ceqCorpo");
    const ids = new Set(e.membros.map((m) => m.cliente_id));
    if (e.titular_id && !ids.has(e.titular_id)) e.titular_id = "";
    const membros = e.membros.map((m, i) => `<li><span class="ceq-pessoa"><span class="ceq-av">${avatar(m.cliente_id)}</span>${esc(nomeCliente(m.cliente_id))}</span>
        <label class="ceq-tit"><input type="radio" name="ceqTitular" value="${m.cliente_id}"${m.cliente_id === e.titular_id ? " checked" : ""}> Titular</label>
        <select class="el-select" data-ceq-papel="${i}" aria-label="Papel de ${esc(nomeCliente(m.cliente_id))}">${opcoesPapel(m.papel_id)}</select>
        <button type="button" class="ceq-rem" data-ceq-rem="${i}" aria-label="Tirar ${esc(nomeCliente(m.cliente_id))} da equipe">×</button></li>`).join("");
    const disponiveis = clientes().filter((c) => !ids.has(c.id)).sort((a, b) => String(a.nome_razao).localeCompare(String(b.nome_razao), "pt-BR"));
    corpo.innerHTML = `<div class="ceq-form">
      <div class="el-field"><label for="ceqNome">Nome da equipe *</label><input id="ceqNome" class="el-input" maxlength="80" value="${esc(e.nome)}" placeholder="Ex.: Equipe Kelly Khawam"></div>
      <div class="el-field"><label for="ceqObs">Observação</label><input id="ceqObs" class="el-input" maxlength="500" value="${esc(e.observacao)}"></div>
      <label class="ceq-ativa"><input type="checkbox" id="ceqAtivo"${e.ativo ? " checked" : ""}> Equipe ativa (aparece no pedido)</label>
      <h4>Pessoas da equipe</h4>
      ${e.membros.length ? `<ul class="ceq-membros">${membros}</ul>` : '<div class="ceq-vazio">Adicione pelo menos uma pessoa e marque quem é a titular.</div>'}
      <div class="ceq-add"><input id="ceqBuscaCliente" class="el-input" list="ceqClientesLista" placeholder="Adicionar cliente à equipe…" autocomplete="off">
        <datalist id="ceqClientesLista">${disponiveis.map((c) => `<option value="${esc(c.nome_razao)}"></option>`).join("")}</datalist>
        <button type="button" class="btn secondary" data-ceq="add">Adicionar</button></div>
      <div class="ceq-acoes">${e.id ? '<button type="button" class="btn danger" data-ceq="excluir">Excluir equipe</button>' : ""}<span></span>
        <button type="button" class="btn secondary" data-ceq="voltar">Voltar</button><button type="button" class="btn primary" data-ceq="salvar">Salvar equipe</button></div>
    </div>`;
    const campo = (id) => corpo.querySelector("#" + id);
    campo("ceqNome").addEventListener("input", (ev) => { e.nome = ev.target.value; });
    campo("ceqObs").addEventListener("input", (ev) => { e.observacao = ev.target.value; });
    campo("ceqAtivo").addEventListener("change", (ev) => { e.ativo = ev.target.checked; });
    corpo.querySelectorAll('input[name="ceqTitular"]').forEach((r) => r.addEventListener("change", () => { e.titular_id = r.value; }));
    corpo.querySelectorAll("[data-ceq-papel]").forEach((sel) => sel.addEventListener("change", () => { e.membros[+sel.dataset.ceqPapel].papel_id = sel.value; }));
    campo("ceqBuscaCliente").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); adicionarMembro(); } });
  }

  function adicionarMembro() {
    const e = s.editando; const campo = dialogo().querySelector("#ceqBuscaCliente");
    const texto = campo.value.trim().toLowerCase();
    if (!texto) return;
    const c = clientes().find((x) => String(x.nome_razao || "").trim().toLowerCase() === texto);
    if (!c) { avisar("Escolha um cliente da lista."); return; }
    if (e.membros.some((m) => m.cliente_id === c.id)) return;
    const titular = s.papeis.find((p) => /titular/i.test(p.nome));
    const assistente = s.papeis.find((p) => /assistente/i.test(p.nome));
    const primeiro = !e.membros.length;
    e.membros.push({ cliente_id: c.id, papel_id: (primeiro ? titular?.id : assistente?.id) || "" });
    if (primeiro) e.titular_id = c.id;
    pintarEdicao();
    dialogo().querySelector("#ceqBuscaCliente")?.focus();
  }

  async function salvar(botao) {
    const e = s.editando; const emp = await empresa();
    const nome = e.nome.trim();
    if (nome.length < 2) { avisar("Dê um nome à equipe."); return; }
    if (!e.membros.length) { avisar("Adicione pelo menos uma pessoa à equipe."); return; }
    if (!e.titular_id) { avisar("Marque quem é a titular da equipe."); return; }
    botao.disabled = true;
    try {
      const dados = { empresa_id: emp, nome, observacao: e.observacao.trim() || null, ativo: e.ativo, titular_id: e.titular_id };
      let id = e.id;
      if (id) { const { error } = await db().from("clientes_equipes").update(dados).eq("id", id).eq("empresa_id", emp); if (error) throw error; }
      else { const { data, error } = await db().from("clientes_equipes").insert(dados).select("id").single(); if (error) throw error; id = data.id; }
      const antes = id === e.id ? membrosDe(id).map((m) => m.cliente_id) : [];
      const sair = antes.filter((c) => !e.membros.some((m) => m.cliente_id === c));
      if (sair.length) { const { error } = await db().from("clientes_equipe_membros").delete().eq("equipe_id", id).in("cliente_id", sair); if (error) throw error; }
      const linhas = e.membros.map((m) => ({ equipe_id: id, cliente_id: m.cliente_id, empresa_id: emp, papel_id: m.papel_id || null }));
      const { error } = await db().from("clientes_equipe_membros").upsert(linhas, { onConflict: "equipe_id,cliente_id" }); if (error) throw error;
      await carregar(); lista();
      avisar("Equipe salva.", "Equipes", "sucesso");
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || "");
      avisar(/clientes_equipes_nome|duplicate/i.test(msg) ? "Já existe uma equipe com esse nome." : /row-level|permission|policy/i.test(msg) ? "Você não tem permissão para editar equipes (Comercial > Clientes > editar)." : "Não foi possível salvar a equipe: " + msg);
    } finally { botao.disabled = false; }
  }

  async function excluir() {
    const e = s.editando; if (!e?.id) return;
    const ok = window.confirmarGlobal ? await window.confirmarGlobal(`Excluir a equipe "${e.nome}"? Os pedidos já feitos continuam com o nome da equipe.`, "Excluir equipe", { tipo: "perigo", confirmarTexto: "Excluir" }) : confirm("Excluir a equipe?");
    if (!ok) return;
    const { error } = await db().from("clientes_equipes").delete().eq("id", e.id).eq("empresa_id", await empresa());
    if (error) { avisar("Não foi possível excluir: " + error.message); return; }
    await carregar(); lista();
  }

  document.addEventListener("click", (ev) => {
    const alvo = ev.target.closest("[data-ceq],[data-ceq-abrir],[data-ceq-rem],[data-ceq-gerenciar]");
    if (!alvo) return;
    if (alvo.dataset.ceqGerenciar !== undefined) { abrir(alvo.dataset.ceqGerenciar || null); return; }
    if (alvo.dataset.ceqAbrir) { editar(s.equipes.find((e) => e.id === alvo.dataset.ceqAbrir)); return; }
    if (alvo.dataset.ceqRem !== undefined) { s.editando.membros.splice(+alvo.dataset.ceqRem, 1); pintarEdicao(); return; }
    const acao = alvo.dataset.ceq;
    if (acao === "fechar") dialogo().close();
    else if (acao === "nova") editar(null);
    else if (acao === "voltar") lista();
    else if (acao === "add") adicionarMembro();
    else if (acao === "salvar") salvar(alvo);
    else if (acao === "excluir") excluir();
  });
  document.addEventListener("keydown", (ev) => { const tr = ev.target.closest?.("[data-ceq-abrir]"); if (tr && ev.key === "Enter") editar(s.equipes.find((e) => e.id === tr.dataset.ceqAbrir)); });

  // detalhes do cliente: em quais equipes ele está
  async function mostrarDoCliente(clienteId) {
    window.__clienteDetalheId = clienteId || null;
    const bloco = document.getElementById("clienteEquipesBloco"); if (!bloco) return;
    if (!clienteId) { bloco.innerHTML = '<h4>Equipes</h4><p class="ceq-dica">Salve o cliente para colocá-lo numa equipe.</p>'; return; }
    try { await carregar(); } catch (err) { bloco.innerHTML = '<h4>Equipes</h4><p class="ceq-dica">Não foi possível carregar as equipes.</p>'; return; }
    if (window.__clienteDetalheId !== clienteId) return;
    const minhas = s.membros.filter((m) => m.cliente_id === clienteId).map((m) => ({ m, e: s.equipes.find((x) => x.id === m.equipe_id) })).filter((x) => x.e);
    bloco.innerHTML = '<h4>Equipes</h4>' + (minhas.length
      ? '<ul class="ceq-do-cliente">' + minhas.map(({ m, e }) => `<li><button type="button" data-ceq-gerenciar="${e.id}"><strong>${esc(e.nome)}</strong><span>${esc(papelNome(m.papel_id) || "Sem papel")}${e.titular_id === clienteId ? " · titular" : e.titular_id ? " · titular: " + esc(nomeCliente(e.titular_id)) : ""}${e.ativo ? "" : " · inativa"}</span></button></li>`).join("") + "</ul>"
      : '<p class="ceq-dica">Este cliente não está em nenhuma equipe.</p>') +
      '<button type="button" class="btn secondary ceq-ger" data-ceq-gerenciar="">Gerenciar equipes</button>';
  }

  window.ClientesEquipes = { abrir, mostrarDoCliente };
})();
