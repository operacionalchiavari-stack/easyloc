/* =====================================================
   EXPEDIÇÃO (out/2026) — ida e volta
   Quadro de 3 colunas, no visual da Separação: Aguardando conferência / Em conferência / Conferido.
   Cada pedido aprovado pode ter dois cartões:
   - Ida (carregamento): aparece desde que o pedido está para sair.
   - Retorno (volta): aparece depois que o carregamento foi concluído; cor lilás e selo "Retorno".
     A conferência de retorno é ÀS CEGAS: o cartão não mostra quantos volumes precisam voltar,
     só quantos já foram lidos. O sistema compara no fim (conferencia.html?etapa=retorno).
   Colunas: conferido = operacao.<etapa>.concluido_em (ou status_operacional); em conferência = alguma
   etiqueta lida naquela etapa; o resto aguarda. O cartão de ida conferido some quando a volta é conferida.
   Mostra pedidos com entrega ou coleta a partir de 15 dias atrás.
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
  const vol = (p) => s.volumes.get(String(p.id)) || { total: 0, carregadas: 0, voltaram: 0, descarregadas: 0 };

  const idaConcluida = (p) => ["carregado", "retornado"].includes(p.status_operacional) || !!p.operacao?.carregamento?.concluido_em;
  const descargaConcluida = (p) => !!p.operacao?.descarregamento?.concluido_em;
  const voltaConcluida = (p) => p.status_operacional === "retornado" || !!p.operacao?.retorno?.concluido_em;

  // Cartões do quadro: { p, tipo: "ida"|"retorno", col: "aguardando"|"andamento"|"conferidos" }
  function cartoes(lista) {
    const out = [];
    lista.forEach((p) => {
      const v = vol(p);
      if (!idaConcluida(p)) out.push({ p, tipo: "ida", col: v.carregadas > 0 ? "andamento" : "aguardando" });
      else if (!voltaConcluida(p)) out.push({ p, tipo: "ida", col: "conferidos" });
      if (idaConcluida(p) && !p.encerrado_operacional_em) {
        out.push({ p, tipo: "descarregamento", col: descargaConcluida(p) ? "conferidos" : (v.descarregadas > 0 ? "andamento" : "aguardando") });
      }
      if (descargaConcluida(p) && !p.encerrado_operacional_em) {
        out.push({ p, tipo: "retorno", col: voltaConcluida(p) ? "conferidos" : (v.voltaram > 0 ? "andamento" : "aguardando") });
      }
    });
    const data = (c) => String((c.tipo !== "ida" ? c.p.data_coleta : c.p.data_entrega) || c.p.data_evento || "9999");
    return out.sort((a, b) => data(a).localeCompare(data(b)));
  }

  function cartao({ p, tipo, col }) {
    const v = vol(p);
    const volta = tipo === "retorno";
    const descarga = tipo === "descarregamento";
    const numero = String(p.numero_pedido || "-");
    const feito = p.operacao?.[volta ? "retorno" : descarga ? "descarregamento" : "carregamento"];
    let nota = "";
    if (col === "conferidos" && feito) {
      const falta = Array.isArray(feito.faltando) ? feito.faltando.length : Number(feito.faltando) || 0;
      nota = (volta ? "Retorno conferido " : descarga ? "Descarregado " : "Carregado ") + dataHoraBr(feito.concluido_em) + (feito.por ? " por " + feito.por : "") +
        (falta ? " · " + falta + (volta ? " não voltou" : " pendência(s)") : "");
    } else if (volta) {
      nota = "Conferência às cegas";
    } else if (!SEPARADO.has(p.status)) {
      nota = "Ainda em separação";
    } else if (!v.total) {
      nota = "Sem etiquetas de envio: imprima na separação";
    }
    let progresso = "";
    if (col === "andamento" && !volta) {
      const lidas = descarga ? v.descarregadas : v.carregadas;
      const total = descarga ? v.carregadas : v.total;
      const pct = total ? Math.round((lidas / total) * 100) : 0;
      progresso = '<div class="separacao-card-progress"><span>' + pct + '%</span><div class="mini-progress"><span style="width:' + pct + '%"></span></div><strong>' + lidas + " / " + total + "</strong></div>";
    } else if (col === "andamento" && volta) {
      progresso = '<div class="exp-lidos">' + v.voltaram + " peça" + (v.voltaram === 1 ? "" : "s") + " lida" + (v.voltaram === 1 ? "" : "s") + "</div>";
    }
    const meta = (volta || descarga)
      ? "Coleta " + esc(dataBr(p.data_coleta || p.data_evento))
      : "Entrega " + esc(dataBr(p.data_entrega || p.data_evento)) + " · " + v.total + " volume" + (v.total === 1 ? "" : "s");
    return '<article class="separacao-order-card exp-card-' + tipo + '" data-coluna="' + col + '" data-tipo="' + tipo + '" data-pedido="' + esc(p.id) + '" tabindex="0" role="button">' +
      '<div class="separacao-card-top"><span class="separacao-order-number">Pedido ' + esc(numero.startsWith("#") ? numero : "#" + numero) + "</span>" +
      '<span class="exp-tipo">' + (volta ? "Retorno" : descarga ? "Descarregamento" : "Ida") + "</span>" +
      (col === "conferidos" ? '<span class="separacao-done-mark">✓</span>' : "") + "</div>" +
      '<div class="separacao-card-mainline"><strong>' + esc(p.cliente_nome || "Cliente não informado") + "</strong><span>" +
      esc(p.tipo_evento || "Evento") + " · " + esc(local(p)) + "</span></div>" +
      '<div class="separacao-card-meta-line">' + meta + "</div>" +
      progresso + (nota ? '<div class="separacao-lock-note">' + esc(nota) + "</div>" : "") + "</article>";
  }

  function pintar() {
    const termo = ($("expBusca").value || "").trim().toLowerCase();
    const lista = s.pedidos.filter((p) => !termo || [p.numero_pedido, p.cliente_nome, p.tipo_evento, local(p)].join(" ").toLowerCase().includes(termo));
    const grupos = { aguardando: [], andamento: [], conferidos: [] };
    cartoes(lista).forEach((c) => grupos[c.col].push(c));
    const vazio = { aguardando: "Nada aguardando conferência.", andamento: "Nenhuma conferência em andamento.", conferidos: "Nada conferido por enquanto." };
    [["aguardando", "expColAguardando", "expContAguardando"], ["andamento", "expColAndamento", "expContAndamento"], ["conferidos", "expColCarregados", "expContCarregados"]].forEach(([g, col, cont]) => {
      $(cont).textContent = grupos[g].length;
      $(col).innerHTML = grupos[g].length ? grupos[g].map(cartao).join("") : '<div class="empty-state">' + vazio[g] + "</div>";
    });
  }

  async function etiquetasDe(ids) {
    const linhas = [];
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      for (let de = 0; ; de += 1000) {
        const { data, error } = await s.sb.from("separacoes_etiquetas").select("separacao_pedido_id,lida_carregamento_em,lida_retorno_em,lida_descarregamento_em")
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
        .or("data_entrega.gte." + desde + ",data_coleta.gte." + desde + ",and(data_entrega.is.null,data_evento.gte." + desde + ")")
        .order("data_entrega", { ascending: true, nullsFirst: false });
      if (error) throw error;
      s.pedidos = (data || []).filter((p) => p.status !== "cancelado");
      const etq = await etiquetasDe(s.pedidos.map((p) => p.id));
      s.volumes = new Map();
      etq.forEach((e) => {
        const k = String(e.separacao_pedido_id);
        const v = s.volumes.get(k) || { total: 0, carregadas: 0, voltaram: 0 };
        v.total += 1;
        if (e.lida_carregamento_em) v.carregadas += 1;
        if (e.lida_retorno_em) v.voltaram += 1;
        if (e.lida_descarregamento_em) v.descarregadas += 1;
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

  function abrir(id, tipo) {
    const query = "?pedido=" + encodeURIComponent(id) + "&etapa=" + (tipo === "retorno" ? "retorno" : tipo === "descarregamento" ? "descarregamento" : "carregamento") + "&de=expedicao";
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
    const quadro = document.querySelector(".separacao-kanban");
    quadro.addEventListener("click", (ev) => {
      const card = ev.target.closest("[data-pedido]"); if (card) abrir(card.dataset.pedido, card.dataset.tipo);
    });
    quadro.addEventListener("keydown", (ev) => {
      const card = ev.target.closest("[data-pedido]");
      if (card && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); abrir(card.dataset.pedido, card.dataset.tipo); }
    });
    await carregar();
    setInterval(() => { if (!document.hidden) carregar(); }, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) carregar(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
