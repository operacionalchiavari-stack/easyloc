/* =====================================================
   EXPEDIÇÃO (out/2026)
   Quadro de 3 colunas, no visual da Separação de Materiais, com os pedidos aprovados
   que estão para sair: Aguardando carregamento / Em carregamento / Carregados.
   Clicar num pedido abre a conferência do carregamento por bipagem
   (Logistica/Conferencia/conferencia.html?etapa=carregamento).
   - Carregado: status_operacional carregado/retornado ou operacao.carregamento.concluido_em
   - Em carregamento: pelo menos uma etiqueta lida no carregamento
   - Aguardando: o resto (separado, ou ainda em separação — aparece o aviso no cartão)
   Mostra pedidos com entrega a partir de 15 dias atrás.
===================================================== */
(function () {
  "use strict";
  const STATUS_COMERCIAL = ["aprovado", "finalizado", "enviado"];
  const SEPARADO = new Set(["separado", "separado_com_divergencia"]);
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const s = { sb: null, empresa: null, pedidos: [], volumes: new Map(), carregando: false };

  const dataBr = (v) => {
    if (!v) return "-";
    const d = new Date(String(v).length === 10 ? v + "T12:00:00" : v);
    return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("pt-BR");
  };
  const dataHoraBr = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };
  const local = (p) => p.local_nome || p.local_evento || p.local || "-";

  function carregado(p) {
    return ["carregado", "retornado"].includes(p.status_operacional) || !!p.operacao?.carregamento?.concluido_em;
  }

  function coluna(p) {
    if (carregado(p)) return "carregados";
    return (s.volumes.get(String(p.id))?.lidas || 0) > 0 ? "andamento" : "aguardando";
  }

  function cartao(p, col) {
    const v = s.volumes.get(String(p.id)) || { total: 0, lidas: 0 };
    const pct = v.total ? Math.round((v.lidas / v.total) * 100) : 0;
    const numero = String(p.numero_pedido || "-");
    const feito = p.operacao?.carregamento;
    let nota = "";
    if (col === "carregados" && feito) {
      const falta = Number(feito.faltando) || 0;
      nota = "Carregado " + dataHoraBr(feito.concluido_em) + (feito.por ? " por " + feito.por : "") + (falta ? " · " + falta + " pendência(s)" : "");
    } else if (!SEPARADO.has(p.status) && col !== "carregados") {
      nota = "Ainda em separação";
    } else if (!v.total) {
      nota = "Sem etiquetas de envio: imprima na separação";
    }
    const progresso = col === "andamento"
      ? '<div class="separacao-card-progress"><span>' + pct + '%</span><div class="mini-progress"><span style="width:' + pct + '%"></span></div><strong>' + v.lidas + " / " + v.total + "</strong></div>"
      : "";
    return '<article class="separacao-order-card" data-coluna="' + col + '" data-pedido="' + esc(p.id) + '" tabindex="0" role="button">' +
      '<div class="separacao-card-top"><span class="separacao-order-number">Pedido ' + esc(numero.startsWith("#") ? numero : "#" + numero) + "</span>" +
      (col === "carregados" ? '<span class="separacao-done-mark">✓</span>' : "") + "</div>" +
      '<div class="separacao-card-mainline"><strong>' + esc(p.cliente_nome || "Cliente não informado") + "</strong><span>" +
      esc(p.tipo_evento || "Evento") + " · " + esc(local(p)) + "</span></div>" +
      '<div class="separacao-card-meta-line">Entrega ' + esc(dataBr(p.data_entrega || p.data_evento)) + " · " + v.total + " volume" + (v.total === 1 ? "" : "s") + "</div>" +
      progresso + (nota ? '<div class="separacao-lock-note">' + esc(nota) + "</div>" : "") + "</article>";
  }

  function pintar() {
    const termo = ($("expBusca").value || "").trim().toLowerCase();
    const lista = s.pedidos.filter((p) => !termo || [p.numero_pedido, p.cliente_nome, p.tipo_evento, local(p)].join(" ").toLowerCase().includes(termo));
    const grupos = { aguardando: [], andamento: [], carregados: [] };
    lista.forEach((p) => grupos[coluna(p)].push(p));
    const vazio = { aguardando: "Nenhum pedido aguardando carregamento.", andamento: "Nenhum pedido em carregamento.", carregados: "Nenhum pedido carregado por enquanto." };
    [["aguardando", "expColAguardando", "expContAguardando"], ["andamento", "expColAndamento", "expContAndamento"], ["carregados", "expColCarregados", "expContCarregados"]].forEach(([g, col, cont]) => {
      $(cont).textContent = grupos[g].length;
      $(col).innerHTML = grupos[g].length ? grupos[g].map((p) => cartao(p, g)).join("") : '<div class="empty-state">' + vazio[g] + "</div>";
    });
  }

  async function etiquetasDe(ids) {
    const linhas = [];
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      for (let de = 0; ; de += 1000) {
        const { data, error } = await s.sb.from("separacoes_etiquetas").select("separacao_pedido_id,lida_carregamento_em")
          .eq("empresa_id", s.empresa).in("separacao_pedido_id", lote).range(de, de + 999);
        if (error) throw error;
        linhas.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
    }
    return linhas;
  }

  async function carregar() {
    if (s.carregando || !s.sb || !s.empresa) return;
    s.carregando = true;
    try {
      const desde = new Date(Date.now() - 15 * 864e5).toISOString().slice(0, 10);
      const { data, error } = await s.sb.from("separacoes_pedidos")
        .select("*")
        .eq("empresa_id", s.empresa).in("status_comercial", STATUS_COMERCIAL)
        .or("data_entrega.gte." + desde + ",and(data_entrega.is.null,data_evento.gte." + desde + ")")
        .order("data_entrega", { ascending: true, nullsFirst: false });
      if (error) throw error;
      s.pedidos = (data || []).filter((p) => p.status !== "cancelado");
      const etq = await etiquetasDe(s.pedidos.map((p) => p.id));
      s.volumes = new Map();
      etq.forEach((e) => {
        const k = String(e.separacao_pedido_id);
        const v = s.volumes.get(k) || { total: 0, lidas: 0 };
        v.total += 1; if (e.lida_carregamento_em) v.lidas += 1;
        s.volumes.set(k, v);
      });
      pintar();
    } catch (e) {
      console.error(e);
      $("expColAguardando").innerHTML = '<div class="empty-state">Não foi possível carregar os pedidos.</div>';
    } finally {
      s.carregando = false;
      window.finalizarCarregamentoModulo?.();
    }
  }

  function abrir(id) {
    const query = "?pedido=" + encodeURIComponent(id) + "&etapa=carregamento&de=expedicao";
    try {
      if (window.top !== window && typeof window.top.shellNavigate === "function") {
        window.top.shellNavigate("Modulos/Logistica/Conferencia/conferencia.html" + query); return;
      }
    } catch (_) { /* outra origem */ }
    location.href = "../Conferencia/conferencia.html" + query;
  }

  async function iniciar() {
    const ctx = await window.aguardarContexto?.();
    s.sb = window.supabaseClient;
    s.empresa = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    $("expBusca").addEventListener("input", pintar);
    document.querySelector(".separacao-kanban").addEventListener("click", (ev) => {
      const card = ev.target.closest("[data-pedido]"); if (card) abrir(card.dataset.pedido);
    });
    document.querySelector(".separacao-kanban").addEventListener("keydown", (ev) => {
      const card = ev.target.closest("[data-pedido]");
      if (card && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); abrir(card.dataset.pedido); }
    });
    await carregar();
    setInterval(() => { if (!document.hidden) carregar(); }, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) carregar(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
