/* Comercial > Cadastros > Clientes finais (18/11/2026)
   Quem contrata de fato o evento (ex.: os noivos). Os dados são digitados nos dados do pedido e guardados aqui UMA vez
   por pessoa (pelo CPF/CNPJ), ligados a todos os pedidos em que ela aparece (gatilho clientes_finais_sincronizar).
   Para mudar os dados, mude no pedido: esta tela só consulta. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dataBr = (d) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "–");
  const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const doc = (d) => { d = String(d || "").replace(/\D/g, ""); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : d; };
  const tel = (t) => { const d = String(t || "").replace(/\D/g, ""); return d.length === 11 ? d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3") : d.length === 10 ? d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3") : (t || ""); };
  const iniciais = (n) => String(n || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const STATUS = { orcamento: "Orçamento", pre_reserva: "Pré-reserva", aprovado: "Reservado", finalizado: "Reservado", enviado: "Reservado", cancelado: "Cancelado" };
  const s = { lista: [], escolhido: null, busca: "" };

  function filtrados() {
    const q = norm(s.busca).trim(), qd = s.busca.replace(/\D/g, "");
    if (!q) return s.lista;
    return s.lista.filter((c) => norm([c.nome, c.email, ...(c.pedidos || []).flatMap((p) => [p.numero, p.decorador, p.local])].join(" ")).includes(q)
      || (qd.length >= 3 && (String(c.documento).includes(qd) || String(c.telefone || "").replace(/\D/g, "").includes(qd))));
  }
  function pintarLista() {
    const lista = filtrados();
    $("cfiConta").textContent = lista.length + (lista.length === 1 ? " cliente final" : " clientes finais");
    if (!s.escolhido || !lista.some((c) => c.id === s.escolhido)) s.escolhido = lista[0]?.id || null;
    $("cfiLista").innerHTML = lista.length ? lista.map((c) => {
      const ped = c.pedidos || [];
      return '<button type="button" role="listitem" class="cfi-item' + (c.id === s.escolhido ? " is-ativo" : "") + '" data-id="' + c.id + '">'
        + '<span class="cfi-ini" aria-hidden="true">' + esc(iniciais(c.nome)) + "</span>"
        + '<span class="cfi-item-txt"><b>' + esc(c.nome) + "</b><small>" + esc(doc(c.documento)) + "</small></span>"
        + '<span class="cfi-item-ped"><b>' + ped.length + "</b><small>" + (ped.length === 1 ? "pedido" : "pedidos") + "</small></span></button>";
    }).join("") : '<p class="cfi-vazio">' + (s.lista.length ? "Nenhum cliente final com essa pesquisa." : "Nenhum cliente final ainda. Eles entram aqui quando são informados nos dados de um pedido.") + "</p>";
    pintarDetalhe();
  }
  function pintarDetalhe() {
    const c = s.lista.find((x) => x.id === s.escolhido);
    if (!c) { $("cfiDetalhe").innerHTML = ""; return; }
    const ped = c.pedidos || [];
    const total = ped.filter((p) => p.status !== "cancelado").reduce((t, p) => t + (Number(p.valor) || 0), 0);
    const campo = (r, v) => (v ? '<div class="cfi-campo"><span>' + r + "</span><b>" + esc(v) + "</b></div>" : "");
    const pj = String(c.documento).length === 14;
    const linha = (p) => '<tr><td><span class="cfi-num">' + esc(p.numero || "—") + "</span></td><td>" + esc(dataBr(p.data_evento)) + '</td><td><span class="cfi-dec">'
      + (p.decorador_foto ? '<img src="' + esc(p.decorador_foto) + '" alt="">' : '<span class="cfi-ini peq" aria-hidden="true">' + esc(iniciais(p.decorador)) + "</span>") + esc(p.decorador || "—") + "</span></td><td>" + esc(p.local || "—") + "</td>"
      + '<td><span class="cfi-st st-' + esc(p.status) + '">' + esc(STATUS[p.status] || p.status || "—") + '</span></td><td class="num">' + brl(p.valor) + '</td><td class="num"><a class="btn secondary cfi-abrir" href="../Pedidos/pedido.html?pedido=' + encodeURIComponent(p.id) + '&modo=editar">Abrir pedido</a></td></tr>';
    $("cfiDetalhe").innerHTML = '<div class="cfi-card"><div class="cfi-cab"><span class="cfi-ini grande" aria-hidden="true">' + esc(iniciais(c.nome)) + "</span><div><h3>" + esc(c.nome) + "</h3><p>Cliente final desde " + esc(dataBr(c.criado_em)) + "</p></div></div>"
      + '<div class="cfi-campos">' + campo(pj ? "CNPJ" : "CPF", doc(c.documento)) + campo("RG", c.rg) + campo("Inscrição estadual", c.ie) + campo("Telefone", tel(c.telefone)) + campo("E-mail", c.email) + campo("Endereço", c.endereco) + "</div>"
      + '<div class="cfi-numeros"><div><span>Pedidos</span><b>' + ped.length + "</b></div><div><span>Valor dos pedidos (sem cancelados)</span><b>" + brl(total) + "</b></div><div><span>Último evento</span><b>" + esc(dataBr(ped[0]?.data_evento)) + "</b></div></div>"
      + '<p class="cfi-nota">Os dados vêm dos pedidos: para corrigir, mude nos dados do pedido.</p></div>'
      + '<div class="cfi-card"><h4>Pedidos deste cliente final</h4><table class="cfi-tabela"><thead><tr><th>Pedido</th><th>Evento</th><th>Decorador</th><th>Local</th><th>Situação</th><th class="num">Valor</th><th></th></tr></thead><tbody>'
      + ped.map(linha).join("") + "</tbody></table></div>";
  }
  async function iniciar() {
    try {
      await window.aguardarContexto?.();
      const sb = window.supabaseClient, empresa = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
      const { data, error } = await sb.rpc("clientes_finais_lista", { p_empresa: empresa });
      if (error) throw error;
      s.lista = Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      $("cfiConta").textContent = "Não foi possível carregar os clientes finais.";
    }
    pintarLista();
  }
  $("cfiBusca").addEventListener("input", (e) => { s.busca = e.target.value; pintarLista(); });
  $("cfiLista").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (!b) return; s.escolhido = b.dataset.id; pintarLista(); });
  iniciar();
})();
