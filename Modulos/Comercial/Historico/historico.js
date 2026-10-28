/* =====================================================
   COMERCIAL > HISTÓRICO (out/2026)
   Todas as movimentações dos pedidos (e dos projetos do catálogo), registradas pelo BANCO por gatilho
   (comercial_historico e projetos_historico) — ver migration 20261021001100. A tela só lê, pela RPC
   comercial_historico(p_empresa_id, p_pedido, p_projeto, p_tipo, p_autor, p_de, p_ate, p_busca, p_limite).
   Filtros: busca, tipo, quem e período (no servidor); à esquerda os pedidos com quantas alterações cada um teve —
   escolher um mostra o histórico completo dele.
===================================================== */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const TIPOS = {
    pedido: "Pedido", status: "Situação", itens: "Itens", evento: "Evento e datas", valores: "Valores",
    financeiro: "Recebimento", operacao: "Operação", contrato: "Contrato", catalogo: "Catálogo"
  };
  const FUSO = { timeZone: "America/Sao_Paulo" };
  const diaDe = (d) => new Date(d).toLocaleDateString("en-CA", FUSO);
  const s = { sb: null, empresa: null, linhas: [], pedido: null, projeto: null, debounce: null, carregando: 0 };

  function hojeMenos(dias) { return diaDe(Date.now() - dias * 86400000); }

  function filtros(extra = {}) {
    return {
      p_empresa_id: s.empresa,
      p_pedido: s.pedido || null,
      p_projeto: s.projeto || null,
      p_tipo: $("hcTipo").value || null,
      p_autor: $("hcAutor").value || null,
      p_de: $("hcDe").value || null,
      p_ate: $("hcAte").value || null,
      p_busca: $("hcBusca").value.trim() || null,
      p_limite: s.pedido || s.projeto ? 5000 : 2000,
      ...extra
    };
  }

  async function carregar() {
    const minha = ++s.carregando;
    $("hcStatus").hidden = false; $("hcStatus").textContent = "Carregando…";
    const { data, error } = await s.sb.rpc("comercial_historico", filtros());
    if (minha !== s.carregando) return;
    if (error) { $("hcStatus").textContent = "Não foi possível carregar o histórico: " + error.message; $("hcLista").innerHTML = ""; return; }
    s.linhas = Array.isArray(data) ? data : [];
    pintar();
  }

  // Resumo dos últimos 7 dias (independente dos filtros).
  async function carregarResumo() {
    const { data } = await s.sb.rpc("comercial_historico", { p_empresa_id: s.empresa, p_de: hojeMenos(6), p_limite: 5000 });
    const lista = Array.isArray(data) ? data : [];
    const hoje = diaDe(Date.now());
    $("hcKpiHoje").textContent = lista.filter((h) => diaDe(h.quando) === hoje).length;
    $("hcKpiSemana").textContent = lista.length + (lista.length >= 5000 ? "+" : "");
    $("hcKpiPedidos").textContent = new Set(lista.map((h) => h.pedido_id || h.projeto_id).filter(Boolean)).size;
    $("hcKpiPessoas").textContent = new Set(lista.filter((h) => h.autor_tipo !== "sistema").map((h) => h.autor)).size;
    // "Quem": todas as pessoas que aparecem no histórico recente (mantém a escolhida)
    const atual = $("hcAutor").value;
    const pessoas = [...new Set(lista.map((h) => h.autor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (atual && !pessoas.includes(atual)) pessoas.unshift(atual);
    $("hcAutor").innerHTML = '<option value="">Todas as pessoas</option>' + pessoas.map((p) => `<option${p === atual ? " selected" : ""}>${esc(p)}</option>`).join("");
  }

  const rotuloPedido = (h) => h.origem === "catalogo" && !h.pedido_numero
    ? `Projeto ${h.projeto_nome || ""}`.trim()
    : `Pedido ${h.pedido_numero || "—"}`;
  const iniciais = (nome) => String(nome || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  function pintarPedidos() {
    const filtro = $("hcBuscaPedido").value.trim().toLowerCase();
    const mapa = new Map();
    s.linhas.forEach((h) => {
      const chave = h.pedido_id ? "p:" + h.pedido_id : h.projeto_id ? "c:" + h.projeto_id : null;
      if (!chave) return;
      if (!mapa.has(chave)) mapa.set(chave, { chave, pedido: h.pedido_id, projeto: h.pedido_id ? null : h.projeto_id, rotulo: rotuloPedido(h), cliente: h.cliente_nome || "", n: 0, ultimo: h.quando });
      mapa.get(chave).n += 1;
    });
    const grupos = [...mapa.values()].filter((g) => !filtro || (g.rotulo + " " + g.cliente).toLowerCase().includes(filtro));
    const ativo = s.pedido ? "p:" + s.pedido : s.projeto ? "c:" + s.projeto : "";
    $("hcListaPedidos").innerHTML =
      `<li><button type="button" class="hc-ped${!ativo ? " is-ativo" : ""}" data-hc-ped=""><strong>Todos os pedidos</strong><span>${s.linhas.length} alteração(ões)</span></button></li>` +
      grupos.map((g) => `<li><button type="button" class="hc-ped${ativo === g.chave ? " is-ativo" : ""}" data-hc-ped="${esc(g.chave)}"><strong>${esc(g.rotulo)}</strong><span>${esc(g.cliente)}</span><b>${g.n}</b></button></li>`).join("");
  }

  function pintarTopo() {
    const topo = $("hcPedidoTopo");
    if (!s.pedido && !s.projeto) { topo.hidden = true; topo.innerHTML = ""; return; }
    const h = s.linhas[0] || {};
    const pessoas = new Set(s.linhas.map((x) => x.autor)).size;
    const primeiro = s.linhas.length ? s.linhas[s.linhas.length - 1].inicio : null;
    topo.hidden = false;
    topo.innerHTML = `<div><small>${s.projeto ? "Projeto do catálogo" : "Pedido"}</small><strong>${esc(s.linhas.length ? rotuloPedido(h) : "Sem alterações registradas")}</strong><span>${esc(h.cliente_nome || "")}</span></div>
      <dl><div><dt>Alterações</dt><dd>${s.linhas.length}</dd></div><div><dt>Pessoas</dt><dd>${pessoas}</dd></div><div><dt>Desde</dt><dd>${primeiro ? new Date(primeiro).toLocaleDateString("pt-BR", FUSO) : "—"}</dd></div></dl>
      <div class="hc-topo-acoes">${s.pedido ? `<button type="button" class="btn primary" data-hc-abrir="${esc(s.pedido)}">Abrir pedido</button>` : ""}<button type="button" class="btn secondary" data-hc-ped="">Ver todos</button></div>`;
  }

  function pintar() {
    pintarPedidos(); pintarTopo();
    const lista = s.linhas;
    $("hcStatus").hidden = lista.length > 0;
    $("hcStatus").textContent = "Nenhuma alteração encontrada com esses filtros.";
    const hoje = diaDe(Date.now()), ontem = hojeMenos(1);
    const nomeDia = (d) => d === hoje ? "Hoje" : d === ontem ? "Ontem" : new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const grupos = new Map();
    lista.forEach((h) => { const d = diaDe(h.quando); if (!grupos.has(d)) grupos.set(d, []); grupos.get(d).push(h); });
    const mostrarPedido = !s.pedido && !s.projeto;
    $("hcLista").innerHTML = [...grupos].map(([d, hs]) => `<section class="hc-dia"><h4>${esc(nomeDia(d))}<span>${hs.length}</span></h4><ol>${hs.map((h) => `
      <li class="hc-item is-${esc(h.tipo)}">
        <time datetime="${esc(h.quando)}">${new Date(h.quando).toLocaleTimeString("pt-BR", { ...FUSO, hour: "2-digit", minute: "2-digit" })}</time>
        <span class="hc-ponto" aria-hidden="true"></span>
        <div class="hc-item-corpo">
          <div class="hc-item-topo"><span class="hc-tipo">${esc(TIPOS[h.tipo] || h.tipo)}</span>${mostrarPedido ? `<button type="button" class="hc-ped-link" data-hc-ped="${esc(h.pedido_id ? "p:" + h.pedido_id : h.projeto_id ? "c:" + h.projeto_id : "")}">${esc(rotuloPedido(h))}${h.cliente_nome ? " · " + esc(h.cliente_nome) : ""}</button>` : ""}</div>
          <p>${esc(h.descricao)}</p>
          <span class="hc-autor"><i class="is-${esc(h.autor_tipo)}">${esc(iniciais(h.autor))}</i>${esc(h.autor || "Sistema")}<em>${h.autor_tipo === "decorador" ? "decorador" : h.autor_tipo === "equipe" ? "equipe" : "automático"}</em></span>
        </div>
      </li>`).join("")}</ol></section>`).join("");
  }

  function exportar() {
    if (!s.linhas.length) { window.alerta?.("Não há alterações para exportar com esses filtros.", "Histórico", "aviso"); return; }
    const campo = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const linhas = [["Data", "Hora", "Pedido", "Cliente", "Tipo", "Alteração", "Quem", "Origem"].map(campo).join(";")]
      .concat(s.linhas.map((h) => [new Date(h.quando).toLocaleDateString("pt-BR", FUSO), new Date(h.quando).toLocaleTimeString("pt-BR", { ...FUSO, hour: "2-digit", minute: "2-digit" }),
        rotuloPedido(h), h.cliente_nome, TIPOS[h.tipo] || h.tipo, h.descricao, h.autor, h.autor_tipo].map(campo).join(";")));
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "historico-comercial-" + diaDe(Date.now()) + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function escolherPedido(chave) {
    s.pedido = chave && chave.startsWith("p:") ? chave.slice(2) : null;
    s.projeto = chave && chave.startsWith("c:") ? chave.slice(2) : null;
    carregar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function abrirPedido(id) {
    const caminho = "Modulos/Comercial/Pedidos/pedido.html?pedido=" + encodeURIComponent(id) + "&modo=editar";
    try { if (window.top !== window && typeof window.top.shellNavigate === "function") { window.top.shellNavigate(caminho); return; } } catch (_) {}
    location.href = "../Pedidos/pedido.html?pedido=" + encodeURIComponent(id) + "&modo=editar";
  }

  async function iniciar() {
    const ctx = await window.aguardarContexto?.();
    s.sb = window.supabaseClient;
    s.empresa = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    if (!s.empresa) { $("hcStatus").textContent = "Empresa não identificada."; return; }
    const params = new URLSearchParams(location.search);
    if (params.get("pedido")) s.pedido = params.get("pedido");
    $("hcDe").value = s.pedido ? "" : hojeMenos(29);
    const recarregar = () => { clearTimeout(s.debounce); s.debounce = setTimeout(carregar, 300); };
    ["hcTipo", "hcAutor", "hcDe", "hcAte"].forEach((id) => $(id).addEventListener("change", carregar));
    $("hcBusca").addEventListener("input", recarregar);
    $("hcBuscaPedido").addEventListener("input", pintarPedidos);
    $("hcLimpar").addEventListener("click", () => {
      $("hcTipo").value = ""; $("hcAutor").value = ""; $("hcBusca").value = ""; $("hcAte").value = ""; $("hcDe").value = hojeMenos(29);
      s.pedido = null; s.projeto = null; carregar();
    });
    $("hcExportar").addEventListener("click", exportar);
    document.addEventListener("click", (ev) => {
      const abrir = ev.target.closest("[data-hc-abrir]");
      if (abrir) { abrirPedido(abrir.dataset.hcAbrir); return; }
      const ped = ev.target.closest("[data-hc-ped]");
      if (ped) escolherPedido(ped.dataset.hcPed);
    });
    await Promise.all([carregar(), carregarResumo()]);
  }

  iniciar().catch((e) => { console.error(e); $("hcStatus").textContent = "Não foi possível abrir o histórico."; });
})();
