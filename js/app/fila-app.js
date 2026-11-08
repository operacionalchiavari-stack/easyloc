/* Fila dos apps de Triagem e Expedição (nov/2026): as mesmas colunas do quadro do computador, uma por aba embaixo,
   e o cartão do pedido com letra maior, as datas (carregamento e entrega, ou coleta e descarregamento) e as cores
   de cada coluna iguais às do computador (styles/app-fila.css).
   AppFila.datas(sb, empresa, ids) lê as datas das etapas no cronograma (operacao_etapas); sem acesso, usa as do pedido.
   AppFila.cartao({...}) devolve o HTML do cartão. AppFila.nav(host, colunas, ativa, contagens) desenha as abas. */
(function () {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const imagem = (u) => /^(https?:|data:)/i.test(u || "");
  function dataCurta(v) {
    if (!v) return "—";
    const d = new Date(String(v).length === 10 ? v + "T12:00:00" : v);
    if (Number.isNaN(d.getTime())) return "—";
    const sem = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    return sem.charAt(0).toUpperCase() + sem.slice(1) + " " + d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  async function datas(sb, empresa, ids) {
    const mapa = new Map();
    for (let i = 0; i < ids.length; i += 150) {
      try {
        const { data } = await sb.from("operacao_etapas").select("pedido_id,tipo,data,hora").eq("empresa_id", empresa)
          .in("tipo", ["carregamento", "descarregamento"]).is("servico_ref", null).in("pedido_id", ids.slice(i, i + 150));
        (data || []).forEach((e) => { const m = mapa.get(String(e.pedido_id)) || {}; if (!m[e.tipo] || String(e.data) < String(m[e.tipo])) m[e.tipo] = e.data; mapa.set(String(e.pedido_id), m); });
      } catch (_) { /* sem acesso ao cronograma: ficam as datas do pedido */ }
    }
    return mapa;
  }
  function cartao({ id, numero, cliente, local, foto, coluna, tipo, selo, datas: linhas = [], status, trava, extra = "" }) {
    const inicial = esc(String(cliente || "?").trim().charAt(0).toUpperCase());
    return '<button type="button" class="af-card" data-coluna="' + esc(coluna) + '" data-tipo="' + esc(tipo || "") + '" data-pedido="' + esc(id) + '"' + (trava ? ' data-trava="' + esc(trava) + '"' : "") + ">" +
      '<span class="af-topo"><span class="af-numero">Pedido #' + esc(numero) + "</span>" + (selo ? '<span class="af-selo">' + esc(selo) + "</span>" : "") + (trava ? '<span class="af-dot" aria-hidden="true"></span>' : "") + "</span>" +
      '<span class="af-pessoa"><span class="af-avatar">' + inicial + (imagem(foto) ? '<img src="' + esc(foto) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + '</span><span class="af-pessoa-texto"><strong>' + esc(cliente || "Decorador") + "</strong><small>" + esc(local || "Local não informado") + "</small></span></span>" +
      (linhas.length ? '<span class="af-datas">' + linhas.map(([r, v]) => '<span><small>' + esc(r) + "</small><b>" + esc(dataCurta(v)) + "</b></span>").join("") + "</span>" : "") +
      extra +
      (trava ? '<span class="af-status af-status-trava">' + esc(trava) + "</span>" : status ? '<span class="af-status">' + esc(status) + "</span>" : "") +
      "</button>";
  }
  function nav(host, colunas, ativa, contagens) {
    host.classList.add("af-nav");
    host.innerHTML = colunas.map((c) => '<button type="button" data-coluna-aba="' + esc(c.chave) + '" class="af-aba af-aba-' + esc(c.chave) + '"' + (c.chave === ativa ? ' aria-current="page"' : "") + '><b>' + (contagens[c.chave] || 0) + "</b><span>" + esc(c.nome) + "</span></button>").join("");
  }
  window.AppFila = { datas, cartao, nav, dataCurta };
})();
