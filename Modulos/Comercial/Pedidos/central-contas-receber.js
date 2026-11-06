/* Contas a receber do Comercial. A pagina propria reutiliza a consulta somente leitura.
   Agrupamentos por cliente, equipe, pedido e data; registro dos recebimentos permanece no Financeiro. */
(function () {
  "use strict";
  const R = window.ComercialRelatorios;
  const urlPedido=new URL("pedido.html",document.currentScript.src||location.href);
  const { esc, fmt, dataBr } = R;
  const $ = (id) => document.getElementById(id);
  const DIV = { locacao: "Locação", frete: "Frete", montagem: "Montagem", outro: "Outro" };
  // filtros vêm da Central (botão Filtros e a pesquisa de cima): { termos[], cliente, numero, local, status, de, ate }
  const s = { linhas: [], prazo: "abertos", modo: "cliente", filtros: {}, ligado: false };
  try { s.modo = localStorage.getItem("cr_receber_modo") || "cliente"; } catch (_) {}

  const aberto = (t) => Number(t.aberto) > 0.005;
  const situacao = (t) => (!aberto(t) ? "recebido" : String(t.vencimento) < R.hoje() ? "vencido" : Number(t.recebido) > 0.005 ? "parcial" : "aberto");
  const SIT = { recebido: "Recebido", vencido: "Vencido", parcial: "Pago em parte", aberto: "Em aberto" };
  const PRAZOS = [["abertos", "Em aberto"], ["vencidos", "Vencidos"], ["hoje", "Vence hoje"], ["semana", "Próximos 7 dias"], ["recebidas", "Recebidas"], ["todas", "Todas"]];
  function noPrazo(t, k) {
    const h = R.hoje(), v = String(t.vencimento || "");
    if (k === "todas") return true;
    if (k === "recebidas") return !aberto(t);
    if (!aberto(t)) return false;
    if (k === "vencidos") return v < h;
    if (k === "hoje") return v === h;
    if (k === "semana") return v > h && v <= R.somaDias(h, 7);
    return true;
  }
  // equipe do Cadastro de Clientes gravada no pedido (out/2026); sem equipe = cada pessoa no seu grupo "Sem equipe"
  const chaveEquipe = (t) => t.equipe_id || "sem-equipe";
  const chaveCliente = (t) => t.cliente_id || "nome:" + (t.cliente_nome || "").trim().toLowerCase();
  const chavePedido = (t) => t.pedido_id || "t:" + t.id;
  function situacaoGrupo(lista) {
    const total = lista.reduce((a, t) => a + Number(t.valor), 0), falta = lista.reduce((a, t) => a + Number(t.aberto), 0);
    const venc = lista.filter((t) => situacao(t) === "vencido").reduce((a, t) => a + Number(t.aberto), 0);
    const prox = lista.filter(aberto).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))[0];
    return { total, falta, recebido: Math.max(0, total - falta), venc, prox, pct: total > 0 ? Math.floor(((total - falta) / total) * 100) : 0 };
  }

  function vencHtml(t) {
    let aviso = "";
    if (aberto(t)) {
      const d = R.dias(R.hoje(), t.vencimento);
      aviso = d < 0 ? '<small class="vermelho">Venceu há ' + -d + " dia" + (d === -1 ? "" : "s") + "</small>" : d === 0 ? '<small class="vermelho">Vence hoje</small>' : d <= 3 ? '<small class="vermelho">Vence em ' + d + " dia" + (d === 1 ? "" : "s") + "</small>" : d <= 7 ? '<small class="amarelo">Vence em ' + d + " dias</small>" : "";
    }
    return '<td class="cr-venc"><b>' + dataBr(t.vencimento) + "</b>" + aviso + "</td>";
  }
  function recebHtml(t) {
    if (!t.recebido_em) return '<td class="cr-receb">–</td>';
    const d = R.dias(t.vencimento, t.recebido_em);
    const prazo = d === 0 ? '<small class="ok">no dia do vencimento</small>' : d < 0 ? '<small class="ok">' + -d + " dia" + (d === -1 ? "" : "s") + " antes</small>" : '<small class="atraso">' + d + " dia" + (d === 1 ? "" : "s") + " depois</small>";
    return '<td class="cr-receb"><b>' + dataBr(t.recebido_em) + "</b>" + prazo + "</td>";
  }
  const pedidoBotao = (t) => (t.pedido_id ? '<button type="button" class="cr-link" data-abrir="' + t.pedido_id + '">Pedido ' + esc(t.numero_pedido || "") + "</button>" : esc(t.descricao || "Lançamento"));
  const eventoTxt = (t) => [t.tipo_evento, t.data_evento ? dataBr(t.data_evento) : "", t.local_nome].filter(Boolean).join(" · ");
  function faltaPedido(t) {
    const sit = situacaoGrupo(s.linhas.filter((x) => chavePedido(x) === chavePedido(t)));
    return '<td class="num">' + (sit.falta > 0.005 ? "<b>" + fmt(sit.falta) + "</b><br><small>" + sit.pct + "% pago</small>" : '<b class="cr-quitado">Quitado</b>') + "</td>";
  }
  const linhaParcela = (t, comCliente) => "<tr>" + (comCliente ? "<td>" + esc(t.cliente_nome || "–") + "</td>" : "") + "<th scope=\"row\">" + pedidoBotao(t) + '<br><small class="cr-sub">' + esc(eventoTxt(t)) + "</small></th><td>" + esc(DIV[t.componente] || t.componente || "–") + "</td><td>" + t.parcela + "/" + t.parcelas + "</td>" +
    vencHtml(t) + '<td class="num">' + fmt(t.valor) + '</td><td class="num">' + fmt(t.recebido) + "</td>" + recebHtml(t) + '<td><span class="cr-sit ' + situacao(t) + '">' + SIT[situacao(t)] + "</span></td>" + faltaPedido(t) + "</tr>";
  const cabecalho = (comCliente) => "<thead><tr>" + (comCliente ? "<th>Cliente</th>" : "") + '<th>Pedido</th><th>Divisão</th><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Recebido</th><th>Recebido em</th><th>Situação</th><th class="num">Falta no pedido</th></tr></thead>';

  const semAcento = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const STATUS_FILTRO = { orcamento: ["orcamento"], pre_reserva: ["pre_reserva"], aprovado: ["aprovado", "finalizado", "enviado"], finalizado: ["finalizado"], cancelado: ["cancelado"] };
  function passaFiltros(t) {
    const f = s.filtros || {};
    const texto = semAcento([t.cliente_nome, t.equipe_nome, t.numero_pedido, t.local_nome, t.tipo_evento, t.descricao].join(" "));
    if ((f.termos || []).some((x) => !texto.includes(x))) return false;
    if (f.cliente && !semAcento(t.cliente_nome).includes(f.cliente) && !semAcento(t.equipe_nome).includes(f.cliente)) return false;
    if (f.numero && !semAcento(t.numero_pedido).includes(f.numero)) return false;
    if (f.local && !semAcento(t.local_nome).includes(f.local)) return false;
    if (f.status && STATUS_FILTRO[f.status] && !STATUS_FILTRO[f.status].includes(t.status_comercial)) return false;
    const v = String(t.vencimento || "").slice(0, 10);
    if (f.de && v < f.de) return false;
    if (f.ate && v > f.ate) return false;
    return true;
  }
  function filtradas() {
    return s.linhas.filter((t) => noPrazo(t, s.prazo)).filter(passaFiltros);
  }
  function pintar() {
    $("crPrazos").innerHTML = PRAZOS.map(([k, t]) => { const n = ["vencidos", "hoje", "semana"].includes(k) ? s.linhas.filter((x) => noPrazo(x, k) && passaFiltros(x)).length : 0; return '<button type="button" class="cr-prazo' + (s.prazo === k ? " ativa" : "") + '" data-prazo="' + k + '" aria-pressed="' + (s.prazo === k) + '">' + t + (n ? '<span class="tab-badge">' + n + "</span>" : "") + "</button>"; }).join("");
    $("crOrdenar").value = s.modo;
    const lista = filtradas().sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)) || String(a.numero_pedido).localeCompare(String(b.numero_pedido), "pt-BR", { numeric: true }));
    if (!lista.length) { $("crConteudo").innerHTML = '<div class="cr-vazio">Nenhuma parcela nessa situação' + (Object.values(s.filtros || {}).some((v) => (Array.isArray(v) ? v.length : v)) ? " com esses filtros" : "") + ".</div>"; return; }
    if (s.modo === "data") {
      const tot = situacaoGrupo(lista);
      $("crConteudo").innerHTML = '<section class="cr-bloco"><h3>Por data <small>' + lista.length + " parcela(s) · valor " + fmt(tot.total) + " · falta " + fmt(tot.falta) + "</small></h3><div class=\"gr-rolar\"><table class=\"gr-planilha\">" + cabecalho(true) + "<tbody>" + lista.map((t) => linhaParcela(t, true)).join("") + "</tbody></table></div></section>";
      return;
    }
    const porEquipe = s.modo === "equipe", porCliente = s.modo === "cliente", chave = porEquipe ? chaveEquipe : porCliente ? chaveCliente : chavePedido;
    const grupos = new Map(); lista.forEach((t) => { const k = chave(t); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(t); });
    const ordenados = [...grupos.entries()].map(([k, ts]) => ({ k, ts, sit: situacaoGrupo(s.linhas.filter((x) => chave(x) === k)) }))
      .sort((a, b) => b.sit.venc - a.sit.venc || b.sit.falta - a.sit.falta);
    $("crConteudo").innerHTML = ordenados.map(({ ts, sit }) => {
      const t0 = ts[0], pedidos = new Set(s.linhas.filter((x) => chave(x) === chave(t0)).map(chavePedido)).size;
      const pessoas = new Set(s.linhas.filter((x) => chave(x) === chave(t0)).map(chaveCliente)).size;
      const titulo = porEquipe ? esc(t0.equipe_id ? (t0.equipe_nome || "Equipe") : "Sem equipe") : porCliente ? esc(t0.cliente_nome || "Sem cliente") + (t0.equipe_nome ? ' <small class="cr-sub">' + esc(t0.equipe_nome) + "</small>" : "") : pedidoBotao(t0) + " · " + esc(t0.cliente_nome || "");
      const sub = porEquipe ? pedidos + " pedido(s) · " + pessoas + " pessoa(s)" : porCliente ? pedidos + " pedido(s)" : esc(eventoTxt(t0)) + (t0.equipe_nome ? " · " + esc(t0.equipe_nome) : "");
      return '<details class="cr-cliente' + (porEquipe ? " cr-equipe" : "") + '" open><summary><strong>' + titulo + '</strong><span class="cr-sub">' + sub + "</span>" +
        '<span class="cr-sub">' + (sit.prox ? "Próxima: " + dataBr(sit.prox.vencimento) + " · " + fmt(sit.prox.aberto) : "Nada em aberto") + "</span>" +
        '<span class="cr-nums"><span>Total <b>' + fmt(sit.total) + "</b></span><span>Recebido <b>" + fmt(sit.recebido) + '</b></span><span class="falta">Falta pagar <b>' + (sit.falta > 0.005 ? fmt(sit.falta) : "quitado") + "</b></span>" + (sit.venc > 0.005 ? '<span class="venc">Vencido <b>' + fmt(sit.venc) + "</b></span>" : "") + "</span></summary>" +
        '<div class="gr-rolar"><table class="gr-planilha">' + cabecalho(porEquipe) + "<tbody>" + ts.map((t) => linhaParcela(t, porEquipe)).join("") + "</tbody></table></div></details>";
    }).join("");
  }
  async function buscar() {
    const { sb, empresa } = await R.contexto();
    const { data, error } = await sb.rpc("comercial_contas_receber", { p_empresa: empresa });
    if (error) throw error;
    s.linhas = data || [];
    return s.linhas;
  }
  const MOLDE = '<div class="fin-barra-ferr cr-barra"><div class="cr-prazos" role="group" aria-label="Situação" id="crPrazos"></div><span class="fin-esp"></span>' +
    '<label class="cr-ordenar">Ordenar por... <select id="crOrdenar" aria-label="Ordenar por"><option value="cliente">Cliente</option><option value="equipe">Equipe</option><option value="pedido">Pedido</option><option value="data">Data</option></select></label></div>' +
    '<main id="crConteudo"><div class="cr-vazio">Carregando…</div></main>';
  async function abrir(host, filtros) {
    if (filtros) s.filtros = filtros;
    if (!host.dataset.montado) { host.innerHTML = MOLDE; host.dataset.montado = "1"; ligar(); }
    $("crConteudo").innerHTML = '<div class="cr-vazio">Carregando…</div>';
    try { await buscar(); }
    catch (e) { console.error(e); $("crConteudo").innerHTML = '<div class="cr-vazio">Não foi possível carregar: ' + esc(e.message || e) + "</div>"; return; }
    pintar();
  }
  // vencidos + vencem hoje (bolinha do botão na Central)
  async function contarAlertas() {
    try { await buscar(); } catch (_) { return 0; }
    return s.linhas.filter((t) => noPrazo(t, "vencidos") || noPrazo(t, "hoje")).length;
  }
  function ligar() {
    $("crPrazos").addEventListener("click", (e) => { const b = e.target.closest("[data-prazo]"); if (!b) return; s.prazo = b.dataset.prazo; pintar(); });
    $("crOrdenar").addEventListener("change", (e) => { s.modo = e.target.value; try { localStorage.setItem("cr_receber_modo", s.modo); } catch (_) {} pintar(); });
    $("crConteudo").addEventListener("click", (e) => { const ab = e.target.closest("[data-abrir]"); if (ab) { e.preventDefault(); const url=new URL(urlPedido);url.searchParams.set("pedido",ab.dataset.abrir);url.searchParams.set("modo","editar");window.location.href=url.href; } });
  }
  // Os filtros da pagina sao aplicados sem buscar novamente no banco.
  function filtrar(filtros) { s.filtros = filtros || {}; if (document.getElementById("crConteudo")) pintar(); }
  window.ContasReceber = window.CentralContasReceber = { abrir, contarAlertas, filtrar };
})();
