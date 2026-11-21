/* Comercial > Contas a receber (nov/2026): a MESMA tabela do Financeiro > A receber (agrupado por pedido ou por data, com
   divisão, conta, status, "Falta no pedido" e os atalhos de vencimento) e a aba Recebimentos previstos (pré-reserva e
   orçamento), também igual à do Financeiro. Só leitura: receber, editar e o "+ Novo recebimento" ficam no Financeiro.
   Dados: RPC comercial_contas_receber e comercial_recebimentos_previstos (permissão de pedidos ou do financeiro).
   Mudou o desenho do A receber em Modulos/Financeiro/financeiro.js (pintarReceber/receberPorData/desenharPrevistos)? Mude aqui também. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataBr = (d) => { const s = String(d || "").slice(0, 10); return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—"; };
  const hoje = () => new Date().toLocaleDateString("sv-SE");
  const DIV = { locacao: "Locação", frete: "Frete", montagem: "Montagem", outro: "Outro" };
  const SIT_PREV = { pre_reserva: "Pré-reserva", orcamento: "Orçamento" };
  const ST_PEDIDO = { orcamento: "Orçamento", pre_reserva: "Pré-reserva", aprovado: "Reservado", finalizado: "Reservado", enviado: "Reservado", cancelado: "Cancelado" };
  const urlPedido = (id) => "../Pedidos/pedido.html?pedido=" + encodeURIComponent(id) + "&modo=editar";
  const S = { aba: "receber", receber: [], prev: [], pedidosPrev: {}, filtroR: { busca: "", status: "abertos", div: "", conta: "", prazo: "" }, prevFiltro: { busca: "", sit: "", ini: "", fim: "" } };
  try { S.recModo = localStorage.getItem("fin_receber_modo") || "pedido"; } catch (_) { S.recModo = "pedido"; }
  try { const a = new URLSearchParams(location.search).get("aba"); if (a === "previstos") S.aba = "previstos"; } catch (_) {}

  // ------------------------------------------------------------- regras iguais às do Financeiro
  const vencido = (t) => ["aberto", "parcial"].includes(t.status) && String(t.vencimento) < hoje();
  function diasParaVencer(t) {
    if (["recebido", "cancelado"].includes(t.status) || !(Number(t.aberto) > 0.005) || !t.vencimento) return null;
    const dia = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    return Math.round((dia(String(t.vencimento).slice(0, 10)) - dia(hoje())) / 86400000);
  }
  const PRAZOS = [["vencidos", "Vencidos", (d) => d < 0], ["hoje", "Vence hoje", (d) => d === 0], ["semana", "Próximos 7 dias", (d) => d >= 1 && d <= 7]];
  const noPrazo = (t, chave) => { const d = diasParaVencer(t); return d !== null && PRAZOS.find(([k]) => k === chave)[2](d); };
  function alertaVenc(t) {
    if (t.recebido_em && Number(t.aberto) <= 0.005) return "";
    const dias = diasParaVencer(t);
    if (dias === null || dias > 7) return "";
    const txt = dias < -1 ? "Venceu há " + -dias + " dias" : dias === -1 ? "Venceu ontem" : dias === 0 ? "Vence hoje" : dias === 1 ? "Vence amanhã" : "Vence em " + dias + " dias";
    return '<span class="fin-venc-alerta ' + (dias <= 3 ? "vermelho" : "amarelo") + '"><i aria-hidden="true"></i>' + txt + "</span>";
  }
  function statusR(t) {
    if (t.status === "cancelado") return ["cancelado", "Cancelado"];
    if (t.status === "recebido" || Number(t.aberto) <= 0.005) return ["recebido", "Recebido"];
    if (vencido(t)) return ["vencido", "Vencido"];
    if (t.status === "parcial" || Number(t.recebido) > 0.005) return ["parcial", "Parcial"];
    return ["aberto", "Em aberto"];
  }
  const numeroPedidoCard = (n) => '<span class="fin-num-card" title="Pedido ' + esc(n || "") + '">' + esc(n || "—") + "</span>";
  function fotoCliente(t, cls = "") {
    const nome = String(t?.cliente_nome || "").trim();
    const ini = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
    return '<span class="fin-cli-foto ' + cls + '" title="' + esc(nome) + '"><i>' + esc(ini) + "</i>" + (t?.cliente_foto ? '<img src="' + esc(t.cliente_foto) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>";
  }
  function contaHtml(t) {
    if (!t.conta_id) return '<div class="fin-conta-cel sem">Sem conta</div>';
    return '<div class="fin-conta-cel"><b>' + esc(t.conta_nome || "Conta") + "</b><small>" + esc([t.conta_doc, t.conta_pix ? "PIX " + t.conta_pix : ""].filter(Boolean).join(" · ")) + "</small></div>";
  }
  const chavePed = (t) => t.pedido_id || "t:" + t.id;
  function situacaoPedido(chave) {
    const ts = S.receber.filter((x) => chavePed(x) === chave && x.status !== "cancelado");
    const total = ts.reduce((s, x) => s + Number(x.valor), 0), aberto = ts.reduce((s, x) => s + Number(x.aberto), 0);
    const abertas = ts.filter((x) => Number(x.aberto) > 0.005).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
    return { ts, total, aberto, pct: total > 0 ? Math.floor(((total - aberto) / total) * 100) : 0, abertas };
  }
  const barraPago = (pct) => '<span class="fin-pago-barra" role="img" aria-label="' + pct + '% pago"><i style="width:' + Math.min(100, Math.max(0, pct)) + '%"></i></span>';
  function faltaNoPedido(t) {
    const sit = situacaoPedido(chavePed(t));
    if (sit.aberto <= 0.005) return '<td class="num fin-falta"><b class="fin-quitado">Quitado</b>' + barraPago(100) + "</td>";
    const i = sit.abertas.findIndex((x) => x.id === t.id);
    const depois = i >= 0 ? sit.abertas.slice(i + 1).reduce((s, x) => s + Number(x.aberto), 0) : null;
    return '<td class="num fin-falta"><b>' + brl(sit.aberto) + "</b>" + barraPago(sit.pct) + "<small>" + sit.pct + "% pago" +
      (depois != null ? " · depois desta: " + (depois > 0.005 ? brl(depois) : "quitado") : "") + "</small></td>";
  }
  const metaPedido = (p) => [p.tipo_evento, p.data_evento ? "Evento " + dataBr(p.data_evento) + (p.data_evento_fim && p.data_evento_fim !== p.data_evento ? " a " + dataBr(p.data_evento_fim) : "") : "",
    p.data_entrega ? "Entrega " + dataBr(p.data_entrega) : "", p.data_coleta ? "Coleta " + dataBr(p.data_coleta) : ""].filter(Boolean);
  // No lugar de Editar/Detalhes (que são do Financeiro), o Comercial abre o pedido.
  const acoes = (t) => '<td><div class="acoes">' + (t.pedido_id ? '<a class="fin-btn peq claro" href="' + urlPedido(t.pedido_id) + '">Abrir pedido</a>' : "") + "</div></td>";

  // ------------------------------------------------------------- A receber
  function filtrarR() {
    const f = S.filtroR, b = f.busca.trim().toLowerCase();
    return S.receber.filter((t) => {
      if (f.prazo && !noPrazo(t, f.prazo)) return false;
      if (f.status === "abertos" && !(Number(t.aberto) > 0.005)) return false;
      if (f.status === "vencidos" && !vencido(t)) return false;
      if (f.status === "recebidos" && Number(t.aberto) > 0.005) return false;
      if (f.div && t.componente !== f.div) return false;
      if (f.conta === "sem" ? t.conta_id : (f.conta && t.conta_id !== f.conta)) return false;
      if (b && ![t.cliente_nome, t.numero_pedido, t.descricao, t.documento, t.local_nome, t.equipe_nome].join(" ").toLowerCase().includes(b)) return false;
      return true;
    });
  }
  const ICONE_LISTA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>';
  const ICONE_GRUPO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="18" height="7" rx="1.5"/></svg>';
  function receberPorData(lista) {
    const ord = ["locacao", "frete", "montagem", "outro"];
    const linhas = lista.slice().sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)) || String(a.numero_pedido || "").localeCompare(String(b.numero_pedido || ""), "pt-BR", { numeric: true }) || a.parcela - b.parcela || ord.indexOf(a.componente) - ord.indexOf(b.componente));
    if (!linhas.length) return "";
    const total = linhas.reduce((s, t) => s + Number(t.valor), 0), aberto = linhas.reduce((s, t) => s + Number(t.aberto), 0);
    return '<section class="fin-pedido fin-receber-data"><div class="fin-pedido-topo fin-pedido-linha"><strong>Por data</strong><small>' + linhas.length + " parcela(s)" +
      '</small><div class="fin-pedido-tot">Total <b>' + brl(total) + "</b><span>Em aberto <b>" + brl(aberto) + "</b></span></div></div>" +
      '<div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Vencimento</th><th>Pedido</th><th>Cliente</th><th>Local</th><th>Divisão</th><th>Conta (CNPJ · PIX)</th><th class="num">Valor</th><th>Status</th><th class="num">Falta no pedido</th><th></th></tr></thead><tbody>' +
      linhas.map((t) => {
        const [cls, rot] = statusR(t);
        const numPed = t.pedido_id ? numeroPedidoCard(t.numero_pedido) : '<span class="fin-sem-pedido">' + esc(t.descricao || "Lançamento") + "</span>";
        const quem = esc(t.cliente_nome || "—") + (t.pedido_id ? '<small class="fin-linha-meta">' + esc(metaPedido(t).join(" · ")) + "</small>" : "");
        return "<tr><td><b>" + dataBr(t.vencimento) + '</b><small class="fin-parcela-venc">Parcela ' + t.parcela + "/" + t.parcelas + "</small>" + alertaVenc(t) + '</td><td class="fin-num-ped">' + numPed + '</td><td class="fin-quem"><div class="fin-quem-foto">' + fotoCliente(t, "peq") + "<div>" + quem + '</div></div></td><td class="fin-local">' + esc(t.local_nome || "—") + '</td><td><span class="fin-chip ' + esc(t.componente) + '">' + esc(DIV[t.componente] || t.componente || "") + "</span></td><td>" + contaHtml(t) +
          '</td><td class="num">' + brl(t.valor) + (Number(t.recebido) > 0 && Number(t.recebido) < Number(t.valor) ? '<small class="fin-parcial">recebido ' + brl(t.recebido) + "</small>" : "") + "</td>" + '<td><span class="fin-status ' + cls + '">' + rot + "</span></td>" + faltaNoPedido(t) + acoes(t) + "</tr>";
      }).join("") + "</tbody></table></div></section>";
  }
  function pintarReceber() {
    const f = S.filtroR, lista = filtrarR(), porData = S.recModo === "data";
    const grupos = new Map();
    lista.forEach((t) => { const k = chavePed(t); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(t); });
    const ordem = ["locacao", "frete", "montagem", "outro"];
    const html = porData ? receberPorData(lista) : [...grupos.values()].map((ts) => {
      ts.sort((a, b) => a.parcela - b.parcela || ordem.indexOf(a.componente) - ordem.indexOf(b.componente));
      const t0 = ts[0], sit = situacaoPedido(chavePed(t0)), todos = sit.ts, total = sit.total;
      const divs = [...new Set(todos.map((x) => x.componente))];
      const dif = t0.pedido_id && t0.valor_pedido != null && Math.abs(Number(t0.valor_pedido) - total) > 0.05;
      const titulo = t0.pedido_id ? numeroPedidoCard(t0.numero_pedido) + "</strong>" + fotoCliente(t0) + "<strong>" + esc(t0.cliente_nome || "") : esc(t0.descricao) + (t0.cliente_nome ? " · " + esc(t0.cliente_nome) : "");
      const sub = t0.pedido_id ? (t0.status_comercial ? '<span class="fin-ped-st">' + esc(ST_PEDIDO[t0.status_comercial] || t0.status_comercial) + "</span>" : "") : esc(t0.documento || "Lançamento manual");
      return '<article class="fin-pedido"><div class="fin-pedido-topo fin-pedido-linha">' + (!t0.pedido_id && t0.cliente_nome ? fotoCliente(t0) : "") + "<strong>" + titulo + "</strong><small>" + sub + '</small><div class="fin-divisoes">' +
        divs.map((d) => { const v = todos.filter((x) => x.componente === d).reduce((s, x) => s + Number(x.valor), 0); return '<span class="fin-chip ' + esc(d) + '">' + esc(DIV[d] || d) + " " + brl(v) + "</span>"; }).join("") +
        (dif ? '<span class="fin-alerta-dif" title="As parcelas somam ' + brl(total) + " e o pedido está em " + brl(t0.valor_pedido) + '">As parcelas somam ' + brl(total) + " e o pedido está em " + brl(t0.valor_pedido) + "</span>" : "") +
        "</div>" + (t0.pedido_id ? '<a class="fin-btn peq claro fin-link-pag" href="' + urlPedido(t0.pedido_id) + '">Abrir pedido</a>' : "") +
        '<div class="fin-pedido-tot">Total <b>' + brl(total) + "</b></div></div>" +
        '<div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Parcela</th><th>Divisão</th><th>Conta (CNPJ · PIX)</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Recebido</th><th>Status</th><th class="num">Falta no pedido</th></tr></thead><tbody>' +
        ts.map((t) => {
          const [cls, rot] = statusR(t);
          return "<tr><td>" + t.parcela + "/" + t.parcelas + '</td><td><span class="fin-chip ' + esc(t.componente) + '">' + esc(DIV[t.componente] || t.componente || "") + "</span></td><td>" + contaHtml(t) +
            "</td><td>" + dataBr(t.vencimento) + alertaVenc(t) + '</td><td class="num">' + brl(t.valor) + '</td><td class="num">' + brl(t.recebido) + "</td>" + '<td><span class="fin-status ' + cls + '">' + rot + "</span></td>" + faltaNoPedido(t) + "</tr>";
        }).join("") + "</tbody></table></div></article>";
    }).join("");
    const contas = [...new Map(S.receber.filter((t) => t.conta_id).map((t) => [t.conta_id, t.conta_nome || "Conta"])).entries()];
    $("crConteudo").innerHTML =
      '<div class="fin-barra-ferr"><input type="search" id="frBusca" placeholder="Buscar cliente, pedido, descrição" value="' + esc(f.busca) + '">' +
      '<select id="frStatus">' + [["abertos", "Em aberto"], ["vencidos", "Vencidos"], ["recebidos", "Recebidos"], ["todos", "Todos"]].map(([v, r]) => '<option value="' + v + '"' + (f.status === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<select id="frDiv"><option value="">Todas as divisões</option>' + Object.entries(DIV).map(([v, r]) => '<option value="' + v + '"' + (f.div === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<select id="frConta"><option value="">Todas as contas</option><option value="sem"' + (f.conta === "sem" ? " selected" : "") + ">Sem conta</option>" + contas.map(([id, n]) => '<option value="' + id + '"' + (f.conta === id ? " selected" : "") + ">" + esc(n) + "</option>").join("") + "</select>" +
      '<div class="fin-prazos" role="group" aria-label="Filtrar por vencimento">' + PRAZOS.map(([k, r]) => { const n = S.receber.filter((t) => noPrazo(t, k)).length; return '<button type="button" class="fin-prazo' + (f.prazo === k ? " ativa" : "") + '" data-prazo="' + k + '" aria-pressed="' + (f.prazo === k) + '">' + r + (n ? '<span class="fin-prazo-n">' + n + "</span>" : "") + "</button>"; }).join("") + "</div>" +
      '<span class="fin-esp"></span><button type="button" class="fin-modo-btn" id="frModo" aria-pressed="' + porData + '" title="' + (porData ? "Agrupar por pedido" : "Ver por data, cada parcela numa linha") + '" aria-label="' + (porData ? "Agrupar por pedido" : "Ver por data, cada parcela numa linha") + '">' + (porData ? ICONE_GRUPO : ICONE_LISTA) + "</button>" +
      '<button type="button" class="fin-recebidas-btn" id="frRecebidas" aria-pressed="' + (f.status === "recebidos") + '">Recebidas</button></div>' +
      (html || '<div class="fin-vazio">Nenhuma conta a receber com esses filtros. Pedido aprovado aparece aqui sozinho, dividido em locação, frete e montagem.</div>');
    const at = () => { const status = $("frStatus").value; S.filtroR = { busca: $("frBusca").value, status, div: $("frDiv").value, conta: $("frConta").value, prazo: status === "abertos" ? S.filtroR.prazo : "" }; pintarReceber(); };
    $("crConteudo").querySelectorAll("[data-prazo]").forEach((b) => b.addEventListener("click", () => { S.filtroR = { ...S.filtroR, status: "abertos", prazo: S.filtroR.prazo === b.dataset.prazo ? "" : b.dataset.prazo }; pintarReceber(); }));
    { let t = 0; const inp = $("frBusca"); const rodar = () => { clearTimeout(t); const pos = inp.selectionStart; at(); const n = $("frBusca"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } };
      inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(rodar, 220); }); inp.addEventListener("keydown", (e) => { if (e.key === "Enter") rodar(); }); inp.addEventListener("search", rodar); } // filtra enquanto digita (21/11/2026)
    ["frStatus", "frDiv", "frConta"].forEach((id) => $(id).addEventListener("change", at));
    $("frRecebidas").addEventListener("click", () => { S.filtroR = { ...S.filtroR, prazo: "", status: S.filtroR.status === "recebidos" ? "abertos" : "recebidos" }; pintarReceber(); });
    $("frModo").addEventListener("click", () => { S.recModo = porData ? "pedido" : "data"; try { localStorage.setItem("fin_receber_modo", S.recModo); } catch (_) {} pintarReceber(); });
  }

  // ------------------------------------------------------------- Recebimentos previstos (pré-reserva e orçamento)
  function pintarPrevistos() {
    const box = $("crConteudo"), f = S.prevFiltro, hj = hoje(), b = f.busca.trim().toLowerCase(), P = S.pedidosPrev;
    const base = S.prev.filter((x) => { const d = String(x.dia || "").slice(0, 10);
      return (!b || [x.pedido_numero, x.cliente_nome, P[x.pedido_id]?.local_nome].join(" ").toLowerCase().includes(b)) && (!f.ini || d >= f.ini) && (!f.fim || (d && d <= f.fim)); });
    const conta = (sit) => base.filter((x) => !sit || x.situacao === sit);
    const lista = conta(f.sit).sort((a, c) => String(a.dia || "9999").localeCompare(String(c.dia || "9999")) || String(a.pedido_numero).localeCompare(String(c.pedido_numero), "pt-BR", { numeric: true }) || a.parcela - c.parcela);
    const total = lista.reduce((t, x) => t + Number(x.valor || 0), 0), pedidos = new Set(lista.map((x) => x.pedido_id)).size;
    const chip = (k, rot) => { const n = new Set(conta(k).map((x) => x.pedido_id)).size; return '<button type="button" class="fin-prazo' + (f.sit === k ? " ativa" : "") + '" data-prev-sit="' + k + '" aria-pressed="' + (f.sit === k) + '">' + rot + '<span class="fin-prev-n">' + n + "</span></button>"; };
    const linha = (x) => { const d = String(x.dia || "").slice(0, 10), vencida = d && d < hj, ped = P[x.pedido_id] || null;
      const meta = ped ? metaPedido(ped) : ["Evento " + (x.data_evento ? dataBr(x.data_evento) : "—")];
      return "<tr><td><b>" + (d ? dataBr(d) : "Sem data") + '</b><small class="fin-parcela-venc">' + (x.sem_parcelas ? "Data do evento" : "Parcela " + x.parcela + "/" + x.parcelas) + "</small>" + (vencida ? '<span class="fin-venc-alerta vermelho"><i aria-hidden="true"></i>Já deveria ter entrado</span>' : "") + "</td>" +
        '<td class="fin-num-ped">' + numeroPedidoCard(x.pedido_numero) + "</td>" +
        '<td class="fin-quem"><div class="fin-quem-foto">' + fotoCliente({ cliente_nome: x.cliente_nome, cliente_foto: ped?.cliente_foto }, "peq") + "<div>" + esc(x.cliente_nome || "—") + '<small class="fin-linha-meta">' + esc(meta.concat(["pedido " + brl(x.valor_pedido)]).join(" · ")) + "</small></div></div></td>" +
        '<td class="fin-local">' + esc(ped?.local_nome || "—") + "</td>" +
        '<td><span class="fin-chip ' + esc(x.componente || "locacao") + '">' + esc(DIV[x.componente] || x.componente || "") + "</span></td>" +
        '<td><span class="fin-pre-selo">' + esc(SIT_PREV[x.situacao] || x.situacao) + "</span>" + (x.pre_reserva_ate ? '<small class="fin-parcela-venc">até ' + dataBr(x.pre_reserva_ate) + "</small>" : "") + "</td>" + '<td class="num">' + brl(x.valor) + "</td>" +
        '<td class="num"><a class="fin-btn peq claro" href="' + urlPedido(x.pedido_id) + '">Abrir pedido</a></td></tr>'; };
    const tinhaFoco = document.activeElement?.id === "fpvBusca";
    box.innerHTML = '<div class="fin-barra-ferr fin-barra-uma"><input type="search" id="fpvBusca" class="fin-busca-linha" placeholder="Buscar pedido, cliente ou local" aria-label="Buscar pedido, cliente ou local" value="' + esc(f.busca) + '">' +
      '<div class="fin-prazos" role="group" aria-label="Situação do pedido">' + chip("", "Todos") + chip("pre_reserva", "Pré-reserva") + chip("orcamento", "Orçamento") + "</div>" +
      '<div class="fin-periodo" role="group" aria-label="Período de vencimento"><label>De<input type="date" id="fpvIni" value="' + esc(f.ini) + '"></label><label>Até<input type="date" id="fpvFim" value="' + esc(f.fim) + '"></label></div>' +
      '<span class="fin-esp"></span><b class="fin-prev-total">' + pedidos + " pedido(s) · " + brl(total) + "</b></div>" +
      (lista.length ? '<section class="fin-pedido fin-receber-data fin-previstos-tab"><div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Vencimento</th><th>Pedido</th><th>Cliente</th><th>Local</th><th>Divisão</th><th>Situação</th><th class="num">Valor</th><th></th></tr></thead><tbody>' +
        lista.map(linha).join("") + "</tbody></table></div></section>" : '<div class="fin-vazio">Nenhum recebimento previsto com esses filtros.</div>') +
      '<p class="fin-agenda-ajuda">Parcelas dos pedidos em pré-reserva e em orçamento. Quando o pedido vira Reservado, elas passam para A receber.</p>';
    const inp = $("fpvBusca");
    inp.addEventListener("input", () => { f.busca = inp.value; clearTimeout(S.prevT); S.prevT = setTimeout(pintarPrevistos, 250); });
    if (tinhaFoco) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    box.querySelectorAll("[data-prev-sit]").forEach((bt) => bt.addEventListener("click", () => { f.sit = bt.dataset.prevSit; pintarPrevistos(); }));
    $("fpvIni").addEventListener("change", (e) => { f.ini = e.target.value; pintarPrevistos(); });
    $("fpvFim").addEventListener("change", (e) => { f.fim = e.target.value; pintarPrevistos(); });
  }

  // ------------------------------------------------------------- abas e carga
  function contadores() {
    const nR = S.receber.filter(vencido).length, nP = new Set(S.prev.map((x) => x.pedido_id).filter(Boolean)).size;
    $("crContReceber").textContent = nR || ""; $("crContPrevistos").textContent = nP || "";
    $("crContPrevistos").title = nP ? nP + " pedido(s) com recebimento previsto" : "";
  }
  function pintar() {
    document.querySelectorAll("[data-cr-aba]").forEach((b) => { const on = b.dataset.crAba === S.aba; b.classList.toggle("active", on); b.classList.toggle("ativa", on); b.setAttribute("aria-selected", String(on)); });
    if (S.aba === "previstos") pintarPrevistos(); else pintarReceber();
  }
  async function carregar() {
    const { sb, empresa } = await window.ComercialRelatorios.contexto();
    const [r, p] = await Promise.all([sb.rpc("comercial_contas_receber", { p_empresa: empresa }), sb.rpc("comercial_recebimentos_previstos", { p_empresa: empresa })]);
    if (r.error) throw r.error;
    S.receber = (r.data || []).filter((t) => t.status !== "cancelado");
    S.prev = p.error ? [] : (p.data || []);
    // local, entrega, coleta e foto dos pedidos previstos (não estão no retorno da previsão)
    const ids = [...new Set(S.prev.map((x) => x.pedido_id).filter(Boolean))];
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await sb.from("separacoes_pedidos").select("id,cliente_id,local_nome,tipo_evento,data_evento,data_evento_fim,data_entrega,data_coleta").in("id", ids.slice(i, i + 100));
      (data || []).forEach((x) => { S.pedidosPrev[x.id] = x; });
    }
    const cli = [...new Set(Object.values(S.pedidosPrev).map((x) => x.cliente_id).filter(Boolean))];
    if (cli.length) {
      const { data } = await sb.from("clientes_empresas").select("id,catalogo_logo_url").in("id", cli);
      const fotos = Object.fromEntries((data || []).map((c) => [c.id, c.catalogo_logo_url]));
      Object.values(S.pedidosPrev).forEach((x) => { x.cliente_foto = fotos[x.cliente_id] || null; });
    }
    contadores(); pintar();
  }
  document.querySelectorAll("[data-cr-aba]").forEach((b) => b.addEventListener("click", () => { S.aba = b.dataset.crAba; pintar(); }));
  (async () => {
    try { await carregar(); }
    catch (e) { console.error(e); $("crConteudo").innerHTML = '<div class="fin-vazio">Não foi possível carregar: ' + esc(e.message || e) + "</div>"; }
    finally { window.finalizarCarregamentoModulo?.(); }
  })();
})();
