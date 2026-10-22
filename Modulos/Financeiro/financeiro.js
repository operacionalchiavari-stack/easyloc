/* =====================================================
   FINANCEIRO (out/2026) — baseado no Financeiro da Tecnoweld.
   Banco: supabase/migrations/20261018000100_financeiro.sql (tabelas fin_*). Toda gravação de
   título/baixa passa pelas funções fin_* (conferem a permissão); cadastros (contas, categorias,
   centros de custo) gravam direto nas tabelas.
   Pedido aprovado vira contas a receber sozinho (fin_sincronizar_pedido), cada parcela dividida
   em locação / frete / montagem, cada parte na sua conta (CNPJ + PIX) — aqui aparecem agrupadas
   por pedido, com a divisão sinalizada.
===================================================== */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const hoje = () => new Date().toISOString().slice(0, 10);
  const dataBr = (d) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "-");
  const somaDias = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const num = (v) => { const t = String(v ?? "").trim(); if (!t) return 0; return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) || 0; };
  const DIV = { locacao: "Locação", frete: "Frete", montagem: "Montagem", outro: "Outro" };
  const TIPOS_CONTA = { corrente: "Conta corrente", poupanca: "Poupança", caixa: "Caixa", aplicacao: "Aplicação", digital: "Conta digital", gateway: "Gateway de pagamento" };
  const FORMAS = ["PIX", "Boleto", "Transferência", "Cartão de crédito", "Cartão de débito", "Dinheiro", "Cheque"];

  const S = {
    sb: null, emp: null, aba: "geral",
    contas: [], saldos: {}, cfg: {}, cats: [], ccs: [], receber: [], pagar: [], fornecedores: [], clientes: [], pedidos: {},
    filtroR: { busca: "", status: "abertos", div: "", conta: "" }, filtroP: { busca: "", status: "abertos" },
    concConta: "", dre: { ini: null, fim: null }
  };

  function avisar(msg, titulo = "Financeiro", tipo = "aviso") { window.alerta ? window.alerta(msg, titulo, tipo) : alert(msg); }
  async function confirmar(msg, titulo = "Confirmar") {
    return typeof window.confirmarGlobal === "function" ? window.confirmarGlobal(msg, titulo, { confirmarTexto: "Confirmar", cancelarTexto: "Voltar", tipo: "warning" }) : confirm(msg);
  }
  async function rpc(nome, args) {
    const { data, error } = await S.sb.rpc(nome, args);
    if (error) throw new Error(error.message || "Erro no financeiro");
    return data;
  }
  async function todos(tabela, colunas, ajustar) {
    const out = [];
    for (let de = 0; ; de += 1000) {
      let q = S.sb.from(tabela).select(colunas).eq("empresa_id", S.emp).range(de, de + 999);
      if (ajustar) q = ajustar(q);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  // ---------------------------------------------------------------- dados
  async function carregar() {
    await rpc("fin_preparar", { p_empresa: S.emp });
    const [contas, cfg, cats, ccs, receber, pagar, saldos, forn, cli] = await Promise.all([
      todos("fin_contas", "*", (q) => q.order("nome")),
      S.sb.from("fin_config").select("*").eq("empresa_id", S.emp).maybeSingle().then((r) => r.data || {}),
      todos("fin_categorias", "*", (q) => q.order("ordem")),
      todos("fin_centros_custo", "*", (q) => q.order("nome")),
      todos("fin_receber", "*", (q) => q.order("vencimento")),
      todos("fin_pagar", "*", (q) => q.order("vencimento")),
      rpc("fin_saldos", { p_empresa: S.emp }),
      todos("fornecedores", "id,nome_razao_social,nome_fantasia,documento", (q) => q.order("nome_razao_social")).catch(() => []),
      todos("clientes_empresas", "id,nome_razao,cpf_cnpj", (q) => q.order("nome_razao")).catch(() => [])
    ]);
    S.contas = contas; S.cfg = cfg; S.cats = cats; S.ccs = ccs; S.receber = receber; S.pagar = pagar;
    S.fornecedores = forn; S.clientes = cli;
    S.saldos = {}; (saldos || []).forEach((s) => { S.saldos[s.conta_id] = Number(s.saldo) || 0; });
    const ids = [...new Set(receber.map((r) => r.pedido_id).filter(Boolean))];
    S.pedidos = {};
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await S.sb.from("separacoes_pedidos").select("id,numero_pedido,cliente_nome,tipo_evento,data_evento,valor_total,status_comercial").in("id", ids.slice(i, i + 100));
      (data || []).forEach((p) => { S.pedidos[p.id] = p; });
    }
    contadores();
  }

  const conta = (id) => S.contas.find((c) => c.id === id);
  const cat = (id) => S.cats.find((c) => c.id === id);
  const vencido = (t) => ["aberto", "parcial", "pendente", "aprovado", "programado"].includes(t.status) && (t.programado_para || t.vencimento) < hoje();
  function statusR(t) {
    if (t.status === "cancelado") return ["cancelado", "Cancelado"];
    if (t.status === "recebido") return ["recebido", "Recebido"];
    if (vencido(t)) return ["vencido", "Vencido"];
    if (t.status === "parcial") return ["parcial", "Parcial"];
    return ["aberto", "Em aberto"];
  }
  function statusP(t) {
    if (t.status === "cancelado") return ["cancelado", "Cancelado"];
    if (t.status === "pago") return ["pago", "Pago"];
    if (t.requer_aprovacao && t.aprovacao === "pendente") return ["aguardando", "Aguardando aprovação"];
    if (t.aprovacao === "reprovada") return ["vencido", "Reprovado"];
    if (vencido(t)) return ["vencido", "Vencido"];
    if (t.status === "parcial") return ["parcial", "Parcial"];
    if (t.status === "programado") return ["programado", "Programado " + dataBr(t.programado_para)];
    if (t.status === "aprovado") return ["aprovado", "Aprovado"];
    return ["aberto", "Pendente"];
  }
  function contadores() {
    const nR = S.receber.filter((t) => vencido(t)).length, nP = S.pagar.filter((t) => vencido(t) || (t.requer_aprovacao && t.aprovacao === "pendente" && t.status !== "cancelado")).length;
    document.querySelector('[data-cont="receber"]').textContent = nR || "";
    document.querySelector('[data-cont="pagar"]').textContent = nP || "";
  }
  // Agência, conta, CNPJ/CPF e chave PIX ficam cifrados no banco (cofre): a tela só mostra a máscara.
  const CAMPOS_COFRE = ["agencia", "conta", "titular_documento", "pix_chave"];
  const vis = (c, k) => { const v = c && c[k]; if (!v) return ""; if (String(v).startsWith("cofre:")) return (c.cofre_mascaras || {})[k] || "••••"; return String(v); };
  function contaHtml(id) {
    const c = conta(id);
    if (!c) return '<div class="fin-conta-cel sem">Sem conta</div>';
    return '<div class="fin-conta-cel"><b>' + esc(c.nome) + "</b><small>" + esc([vis(c, "titular_documento"), c.pix_chave ? "PIX " + vis(c, "pix_chave") : ""].filter(Boolean).join(" · ")) + "</small></div>";
  }
  const opcoesContas = (sel, vazio = "Sem conta") => '<option value="">' + vazio + "</option>" + S.contas.filter((c) => c.ativo || c.id === sel).map((c) => '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + esc(c.nome + (c.titular_documento ? " · " + vis(c, "titular_documento") : "")) + "</option>").join("");
  const opcoesCats = (tipo, sel) => '<option value="">Sem categoria</option>' + S.cats.filter((c) => c.tipo === tipo && (c.ativo || c.id === sel)).map((c) => '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + esc((c.codigo ? c.codigo + " " : "") + c.nome) + "</option>").join("");
  const opcoesCcs = (sel) => '<option value="">Sem centro de custo</option>' + S.ccs.filter((c) => c.ativo || c.id === sel).map((c) => '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + esc(c.nome) + "</option>").join("");
  const opcoesFormas = (sel) => '<option value="">-</option>' + FORMAS.map((f) => "<option" + (f === sel ? " selected" : "") + ">" + f + "</option>").join("");

  // ---------------------------------------------------------------- modal
  let aoConfirmar = null;
  function modal(titulo, corpo, botoes, montar) {
    $("finModalTitulo").textContent = titulo;
    // caixa nova a cada janela: os eventos da janela anterior não podem disparar nesta
    const velho = $("finModalCorpo"), novo = velho.cloneNode(false); velho.replaceWith(novo);
    $("finModalCorpo").innerHTML = corpo;
    $("finModalRodape").innerHTML = (botoes || []).map((b, i) => '<button type="button" class="fin-btn ' + (b.classe || "") + '" data-bt="' + i + '">' + esc(b.rotulo) + "</button>").join("");
    aoConfirmar = botoes || [];
    const dlg = $("finModal");
    if (!dlg.open) dlg.showModal();
    montar?.($("finModalCorpo"));
  }
  function fecharModal() { const d = $("finModal"); if (d.open) d.close(); }
  function campos(raiz) { const o = {}; raiz.querySelectorAll("[name]").forEach((el) => { o[el.name] = el.type === "checkbox" ? el.checked : el.value; }); return o; }
  function erroModal(msg) { let e = $("finModalCorpo").querySelector(".fin-erro"); if (!e) { e = document.createElement("p"); e.className = "fin-erro"; $("finModalCorpo").appendChild(e); } e.textContent = msg; }
  async function executar(fn, ok) {
    try { await fn(); fecharModal(); if (ok) avisar(ok, "Financeiro", "sucesso"); await recarregar(); }
    catch (e) { console.error(e); erroModal(e.message || String(e)); }
  }

  // ---------------------------------------------------------------- abas
  async function recarregar() {
    try { await carregar(); } catch (e) { console.error(e); mostrarAviso("Não foi possível carregar o financeiro: " + (e.message || e)); return; }
    pintar();
  }
  function mostrarAviso(msg) { $("finAviso").hidden = !msg; $("finAviso").textContent = msg || ""; }
  function pintar() {
    document.querySelectorAll("#finAbas [data-aba]").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === S.aba));
    const f = { geral: pintarGeral, receber: pintarReceber, pagar: pintarPagar, contas: pintarContas, conciliacao: pintarConciliacao, dre: pintarDre, inadimplencia: pintarInadimplencia, plano: pintarPlano }[S.aba];
    Promise.resolve(f()).catch((e) => { console.error(e); $("finConteudo").innerHTML = '<div class="fin-vazio">Erro: ' + esc(e.message || e) + "</div>"; });
  }

  // ---------------------------------------------------------------- visão geral
  async function pintarGeral() {
    const abertosR = S.receber.filter((t) => ["aberto", "parcial"].includes(t.status));
    const abertosP = S.pagar.filter((t) => !["pago", "cancelado"].includes(t.status));
    const saldoTotal = S.contas.filter((c) => c.ativo).reduce((s, c) => s + (S.saldos[c.id] || 0), 0);
    const soma = (l, f) => l.reduce((s, t) => s + Number(t[f] || 0), 0);
    const vencR = abertosR.filter(vencido), vencP = abertosP.filter(vencido);
    const porDiv = {}; abertosR.forEach((t) => { porDiv[t.componente] = (porDiv[t.componente] || 0) + Number(t.aberto); });
    const ini = hoje(), fim = somaDias(ini, 30);
    const fluxo = await rpc("fin_fluxo", { p_empresa: S.emp, p_ini: ini, p_fim: fim, p_conta: null });
    const max = Math.max(1, ...fluxo.map((d) => Math.max(Number(d.previsto_entrada) + Number(d.realizado_entrada), Number(d.previsto_saida) + Number(d.realizado_saida))));
    const dias = fluxo.filter((d) => Number(d.previsto_entrada) || Number(d.previsto_saida) || Number(d.realizado_entrada) || Number(d.realizado_saida));
    $("finConteudo").innerHTML =
      '<section class="fin-cards">' +
      card("Saldo nas contas", brl(saldoTotal), S.contas.filter((c) => c.ativo).length + " conta(s)", saldoTotal < 0 ? "is-vermelho" : "") +
      card("A receber em aberto", brl(soma(abertosR, "aberto")), abertosR.length + " título(s)", "is-verde") +
      card("A pagar em aberto", brl(soma(abertosP, "aberto")), abertosP.length + " título(s)") +
      card("Recebimentos vencidos", brl(soma(vencR, "aberto")), vencR.length + " título(s)", vencR.length ? "is-vermelho" : "") +
      card("Pagamentos vencidos", brl(soma(vencP, "aberto")), vencP.length + " título(s)", vencP.length ? "is-vermelho" : "") +
      "</section>" +
      '<div class="fin-grade"><div>' +
      '<section class="fin-bloco"><h3>Saldos por conta</h3>' + (S.contas.length ? '<table class="fin-tabela"><tbody>' + S.contas.filter((c) => c.ativo).map((c) => "<tr><td>" + contaHtml(c.id) + '</td><td class="num"><b>' + brl(S.saldos[c.id] || 0) + "</b></td></tr>").join("") + "</tbody></table>" : '<div class="fin-vazio">Cadastre as contas em <b>Contas e PIX</b>.</div>') + "</section>" +
      '<section class="fin-bloco"><h3>A receber por divisão <small>em aberto</small></h3><table class="fin-tabela"><tbody>' +
      ["locacao", "frete", "montagem", "outro"].filter((k) => porDiv[k]).map((k) => '<tr><td><span class="fin-chip ' + k + '">' + DIV[k] + "</span></td><td>" + contaHtml(S.cfg["conta_" + k]) + '</td><td class="num"><b>' + brl(porDiv[k]) + "</b></td></tr>").join("") +
      (Object.keys(porDiv).length ? "" : '<tr><td class="fin-vazio">Nada em aberto.</td></tr>') + "</tbody></table></section>" +
      "</div>" +
      '<section class="fin-bloco"><h3>Próximos 30 dias <small>vencidos: ' + brl(fluxo[0]?.vencido_receber) + " a receber · " + brl(fluxo[0]?.vencido_pagar) + " a pagar</small></h3>" +
      '<div class="fin-barras" title="Verde: entradas · Vermelho: saídas">' + fluxo.map((d) => {
        const e = Number(d.previsto_entrada) + Number(d.realizado_entrada), s = Number(d.previsto_saida) + Number(d.realizado_saida);
        return '<div title="' + dataBr(d.dia) + " · entra " + brl(e) + " · sai " + brl(s) + '"><i class="e" style="height:' + Math.round((e / max) * 55) + 'px"></i><i class="s" style="height:' + Math.round((s / max) * 55) + 'px"></i></div>';
      }).join("") + "</div>" +
      (dias.length ? '<div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Dia</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo previsto</th></tr></thead><tbody>' +
        dias.map((d) => "<tr><td>" + dataBr(d.dia) + '</td><td class="num">' + brl(Number(d.previsto_entrada) + Number(d.realizado_entrada)) + '</td><td class="num">' + brl(Number(d.previsto_saida) + Number(d.realizado_saida)) + '</td><td class="num"><b>' + brl(d.saldo_previsto) + "</b></td></tr>").join("") + "</tbody></table></div>"
        : '<div class="fin-vazio">Nada previsto nos próximos 30 dias.</div>') +
      "</section></div>";
  }
  const card = (rot, val, sub, cls = "") => '<div class="fin-card ' + cls + '"><span>' + esc(rot) + "</span><strong>" + val + "</strong><small>" + esc(sub) + "</small></div>";

  // ---------------------------------------------------------------- a receber (agrupado por pedido, com a divisão)
  function filtrarR() {
    const f = S.filtroR, b = f.busca.trim().toLowerCase();
    return S.receber.filter((t) => {
      if (f.status === "abertos" && !["aberto", "parcial"].includes(t.status)) return false;
      if (f.status === "vencidos" && !vencido(t)) return false;
      if (f.status === "recebidos" && t.status !== "recebido") return false;
      if (f.status === "cancelados" && t.status !== "cancelado") return false;
      if (f.status !== "cancelados" && f.status !== "todos" && t.status === "cancelado") return false;
      if (f.div && t.componente !== f.div) return false;
      if (f.conta === "sem" ? t.conta_id : (f.conta && t.conta_id !== f.conta)) return false;
      if (b && ![t.cliente_nome, t.pedido_numero, t.descricao, t.documento].join(" ").toLowerCase().includes(b)) return false;
      return true;
    });
  }
  function pintarReceber() {
    const f = S.filtroR, lista = filtrarR();
    const grupos = new Map();
    lista.forEach((t) => { const k = t.pedido_id || t.grupo; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(t); });
    const html = [...grupos.values()].map((ts) => {
      ts.sort((a, b) => a.parcela - b.parcela || ["locacao", "frete", "montagem", "outro"].indexOf(a.componente) - ["locacao", "frete", "montagem", "outro"].indexOf(b.componente));
      const t0 = ts[0], ped = t0.pedido_id ? S.pedidos[t0.pedido_id] : null;
      const todosDoGrupo = S.receber.filter((x) => (x.pedido_id || x.grupo) === (t0.pedido_id || t0.grupo) && x.status !== "cancelado");
      const total = todosDoGrupo.reduce((s, x) => s + Number(x.valor), 0), aberto = todosDoGrupo.reduce((s, x) => s + Number(x.aberto), 0);
      const divs = [...new Set(todosDoGrupo.map((x) => x.componente))];
      const dif = ped && Math.abs(Number(ped.valor_total) - total) > 0.05;
      const titulo = ped ? "Pedido " + esc(ped.numero_pedido || t0.pedido_numero) + " · " + esc(ped.cliente_nome || t0.cliente_nome || "") : esc(t0.descricao) + (t0.cliente_nome ? " · " + esc(t0.cliente_nome) : "");
      const sub = ped ? esc([ped.tipo_evento, ped.data_evento ? "evento " + dataBr(ped.data_evento) : ""].filter(Boolean).join(" · ")) : esc(t0.documento || "Lançamento manual");
      return '<article class="fin-pedido"><div class="fin-pedido-topo"><div><strong>' + titulo + "</strong><br><small>" + sub + '</small><div class="fin-divisoes">' +
        divs.map((d) => { const v = todosDoGrupo.filter((x) => x.componente === d).reduce((s, x) => s + Number(x.valor), 0); return '<span class="fin-chip ' + d + '">' + DIV[d] + " " + brl(v) + "</span>"; }).join("") +
        (dif ? '<span class="fin-alerta-dif">As parcelas somam ' + brl(total) + " e o pedido está em " + brl(ped.valor_total) + "</span>" : "") +
        '</div></div><div class="fin-pedido-tot">Total <b>' + brl(total) + "</b><br>Em aberto <b>" + brl(aberto) + "</b></div></div>" +
        '<div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Parcela</th><th>Divisão</th><th>Conta (CNPJ · PIX)</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Recebido</th><th>Status</th><th></th></tr></thead><tbody>' +
        ts.map((t) => {
          const [cls, rot] = statusR(t);
          const pode = ["aberto", "parcial"].includes(t.status);
          return "<tr><td>" + t.parcela + "/" + t.parcelas + '</td><td><span class="fin-chip ' + t.componente + '">' + DIV[t.componente] + "</span></td><td>" + contaHtml(t.conta_id) +
            "</td><td>" + dataBr(t.vencimento) + '</td><td class="num">' + brl(t.valor) + '</td><td class="num">' + brl(t.recebido) + '</td><td><span class="fin-status ' + cls + '">' + rot + "</span></td>" +
            '<td><div class="acoes">' + (pode ? '<button class="fin-btn peq verde" data-r-baixar="' + t.id + '">Receber</button>' : "") +
            '<button class="fin-btn peq claro" data-r-editar="' + t.id + '">Editar</button><button class="fin-btn peq claro" data-r-ver="' + t.id + '">Detalhes</button></div></td></tr>';
        }).join("") + "</tbody></table></div></article>";
    }).join("");
    $("finConteudo").innerHTML =
      '<div class="fin-barra-ferr"><input type="search" id="frBusca" placeholder="Buscar cliente, pedido, descrição" value="' + esc(f.busca) + '">' +
      '<select id="frStatus">' + [["abertos", "Em aberto"], ["vencidos", "Vencidos"], ["recebidos", "Recebidos"], ["cancelados", "Cancelados"], ["todos", "Todos"]].map(([v, r]) => '<option value="' + v + '"' + (f.status === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<select id="frDiv"><option value="">Todas as divisões</option>' + Object.entries(DIV).map(([v, r]) => '<option value="' + v + '"' + (f.div === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<select id="frConta"><option value="">Todas as contas</option><option value="sem"' + (f.conta === "sem" ? " selected" : "") + ">Sem conta</option>" + S.contas.map((c) => '<option value="' + c.id + '"' + (f.conta === c.id ? " selected" : "") + ">" + esc(c.nome) + "</option>").join("") + "</select>" +
      '<span class="fin-esp"></span><button class="fin-btn" id="frNovo">+ Novo recebimento</button></div>' +
      (html || '<div class="fin-vazio">Nenhuma conta a receber com esses filtros. Pedido aprovado aparece aqui sozinho, dividido em locação, frete e montagem.</div>');
    const at = () => { S.filtroR = { busca: $("frBusca").value, status: $("frStatus").value, div: $("frDiv").value, conta: $("frConta").value }; pintarReceber(); };
    $("frBusca").addEventListener("change", at); $("frBusca").addEventListener("keydown", (e) => { if (e.key === "Enter") at(); });
    ["frStatus", "frDiv", "frConta"].forEach((id) => $(id).addEventListener("change", at));
    $("frNovo").addEventListener("click", () => novoTitulo("receber"));
  }

  // ---------------------------------------------------------------- a pagar
  function pintarPagar() {
    const f = S.filtroP, b = f.busca.trim().toLowerCase();
    const lista = S.pagar.filter((t) => {
      if (f.status === "abertos" && ["pago", "cancelado"].includes(t.status)) return false;
      if (f.status === "aprovar" && !(t.requer_aprovacao && t.aprovacao === "pendente" && t.status !== "cancelado")) return false;
      if (f.status === "vencidos" && !vencido(t)) return false;
      if (f.status === "pagos" && t.status !== "pago") return false;
      if (f.status === "cancelados" && t.status !== "cancelado") return false;
      if (b && ![t.fornecedor_nome, t.descricao, t.documento].join(" ").toLowerCase().includes(b)) return false;
      return true;
    });
    $("finConteudo").innerHTML =
      '<div class="fin-barra-ferr"><input type="search" id="fpBusca" placeholder="Buscar fornecedor, descrição, documento" value="' + esc(f.busca) + '">' +
      '<select id="fpStatus">' + [["abertos", "Em aberto"], ["aprovar", "Aguardando aprovação"], ["vencidos", "Vencidos"], ["pagos", "Pagos"], ["cancelados", "Cancelados"], ["todos", "Todos"]].map(([v, r]) => '<option value="' + v + '"' + (f.status === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<span class="fin-esp"></span><button class="fin-btn" id="fpNovo">+ Novo pagamento</button></div>' +
      (lista.length ? '<section class="fin-bloco"><div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Fornecedor</th><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th>Conta</th><th class="num">Valor</th><th class="num">Em aberto</th><th>Status</th><th></th></tr></thead><tbody>' +
        lista.map((t) => {
          const [cls, rot] = statusP(t), c = cat(t.categoria_id);
          const aberto = !["pago", "cancelado"].includes(t.status), aguard = t.requer_aprovacao && t.aprovacao === "pendente";
          return "<tr><td>" + esc(t.fornecedor_nome || "-") + "</td><td>" + esc(t.descricao) + (t.parcelas > 1 ? " <small>(" + t.parcela + "/" + t.parcelas + ")</small>" : "") + "</td><td>" + esc(c?.nome || "-") +
            "</td><td>" + dataBr(t.vencimento) + "</td><td>" + contaHtml(t.conta_id) + '</td><td class="num">' + brl(t.valor) + '</td><td class="num">' + brl(t.aberto) + '</td><td><span class="fin-status ' + cls + '">' + esc(rot) + "</span></td>" +
            '<td><div class="acoes">' + (aguard ? '<button class="fin-btn peq" data-p-aprovar="' + t.id + '">Aprovar</button><button class="fin-btn peq verm" data-p-reprovar="' + t.id + '">Reprovar</button>' : "") +
            (aberto && !aguard && t.aprovacao !== "reprovada" ? '<button class="fin-btn peq claro" data-p-programar="' + t.id + '">Programar</button><button class="fin-btn peq verde" data-p-baixar="' + t.id + '">Pagar</button>' : "") +
            '<button class="fin-btn peq claro" data-p-editar="' + t.id + '">Editar</button><button class="fin-btn peq claro" data-p-ver="' + t.id + '">Detalhes</button></div></td></tr>';
        }).join("") + "</tbody></table></div></section>" : '<div class="fin-vazio">Nenhuma conta a pagar com esses filtros.</div>');
    const at = () => { S.filtroP = { busca: $("fpBusca").value, status: $("fpStatus").value }; pintarPagar(); };
    $("fpBusca").addEventListener("change", at); $("fpBusca").addEventListener("keydown", (e) => { if (e.key === "Enter") at(); });
    $("fpStatus").addEventListener("change", at);
    $("fpNovo").addEventListener("click", () => novoTitulo("pagar"));
  }

  // ---------------------------------------------------------------- títulos: novo, editar, baixar, detalhes
  function novoTitulo(tipo) {
    const rec = tipo === "receber";
    const lista = rec ? S.clientes.map((c) => c.nome_razao) : S.fornecedores.map((f) => f.nome_fantasia || f.nome_razao_social);
    modal(rec ? "Novo recebimento" : "Novo pagamento",
      '<datalist id="finParte">' + lista.map((n) => '<option value="' + esc(n) + '">').join("") + "</datalist>" +
      '<div class="fin-form">' +
      '<label class="inteiro">' + (rec ? "Cliente" : "Fornecedor") + '<input name="parte" list="finParte" autocomplete="off"></label>' +
      '<label class="inteiro">Descrição<input name="descricao" required></label>' +
      "<label>Documento / NF<input name=\"documento\"></label>" +
      (rec ? '<label>Divisão<select name="componente">' + Object.entries(DIV).map(([v, r]) => '<option value="' + v + '"' + (v === "outro" ? " selected" : "") + ">" + r + "</option>").join("") + "</select></label>" : '<label>Código de barras<input name="codigo_barras"></label>') +
      '<label>Categoria<select name="categoria_id">' + opcoesCats(rec ? "entrada" : "saida", null) + "</select></label>" +
      '<label>Centro de custo<select name="centro_custo_id">' + opcoesCcs(null) + "</select></label>" +
      '<label>Conta<select name="conta_id">' + opcoesContas(null) + "</select></label>" +
      '<label>Forma<select name="forma">' + opcoesFormas("PIX") + "</select></label>" +
      '<label>Emissão<input type="date" name="emissao" value="' + hoje() + '"></label>' +
      '<label>Competência<input type="date" name="competencia" value="' + hoje() + '"></label>' +
      '<p class="fin-sub">Valor e parcelas</p>' +
      '<label>Valor total<input name="valor" inputmode="decimal" placeholder="0,00"></label>' +
      '<label>Parcelas<input type="number" name="parcelas" min="1" max="60" value="1"></label>' +
      '<label>1º vencimento<input type="date" name="vencimento" value="' + hoje() + '"></label>' +
      '<label>Intervalo (dias)<input type="number" name="intervalo" min="1" value="30"></label>' +
      (rec ? "" : '<label class="check inteiro"><input type="checkbox" name="requer_aprovacao"> Precisa de aprovação antes de pagar</label>') +
      '<label class="inteiro">Observações<textarea name="observacoes"></textarea></label>' +
      '<p class="fin-info" id="finParcelasPrev"></p></div>',
      [{ rotulo: "Cancelar", classe: "claro", acao: fecharModal }, { rotulo: "Salvar", acao: () => salvarNovo(tipo) }],
      (corpo) => {
        const prev = () => { const p = parcelasDe(campos(corpo)); $("finParcelasPrev").textContent = p.length ? p.map((x, i) => (i + 1) + "ª " + dataBr(x.vencimento) + " " + brl(x.valor)).join(" · ") : "Informe o valor."; };
        corpo.addEventListener("input", prev); prev();
      });
  }
  function parcelasDe(d) {
    const total = num(d.valor), n = Math.max(1, parseInt(d.parcelas, 10) || 1), passo = Math.max(1, parseInt(d.intervalo, 10) || 30);
    if (total <= 0 || !d.vencimento) return [];
    const base = Math.round((total / n) * 100) / 100;
    return Array.from({ length: n }, (_, i) => ({ vencimento: somaDias(d.vencimento, i * passo), valor: i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base }));
  }
  async function salvarNovo(tipo) {
    const d = campos($("finModalCorpo")), rec = tipo === "receber";
    const parc = parcelasDe(d);
    if (!d.descricao.trim()) return erroModal("Informe a descrição.");
    if (!parc.length) return erroModal("Informe o valor e o vencimento.");
    const nome = d.parte.trim();
    const achado = rec ? S.clientes.find((c) => c.nome_razao === nome) : S.fornecedores.find((f) => (f.nome_fantasia || f.nome_razao_social) === nome);
    const cab = { descricao: d.descricao, documento: d.documento, categoria_id: d.categoria_id, centro_custo_id: d.centro_custo_id, conta_id: d.conta_id, forma: d.forma, emissao: d.emissao, competencia: d.competencia, observacoes: d.observacoes };
    if (rec) Object.assign(cab, { cliente_id: achado?.id || "", cliente_nome: nome, componente: d.componente });
    else Object.assign(cab, { fornecedor_id: achado?.id || "", fornecedor_nome: nome, codigo_barras: d.codigo_barras, requer_aprovacao: !!d.requer_aprovacao });
    await executar(() => rpc("fin_criar_titulo", { p_empresa: S.emp, p_tipo: tipo, p_cab: cab, p_parcelas: parc }), rec ? "Recebimento lançado." : "Pagamento lançado.");
  }

  function editarTitulo(tipo, id) {
    const t = (tipo === "receber" ? S.receber : S.pagar).find((x) => x.id === id);
    if (!t) return;
    const rec = tipo === "receber", semBaixa = Number(rec ? t.recebido : t.pago) === 0;
    modal("Editar " + (rec ? "recebimento" : "pagamento"),
      '<div class="fin-form">' +
      (rec && t.origem === "pedido" ? '<p class="fin-info">Parte <b>' + DIV[t.componente] + "</b> do pedido " + esc(t.pedido_numero || "") + ". O valor vem do pedido; aqui você escolhe a conta que recebe essa parte.</p>" : "") +
      '<label class="inteiro">Conta que ' + (rec ? "recebe" : "paga") + '<select name="conta_id">' + opcoesContas(t.conta_id) + "</select></label>" +
      '<label class="inteiro">Descrição<input name="descricao" value="' + esc(t.descricao) + '"></label>' +
      '<label>Documento<input name="documento" value="' + esc(t.documento || "") + '"></label>' +
      '<label>Forma<select name="forma">' + opcoesFormas(t.forma) + "</select></label>" +
      '<label>Vencimento<input type="date" name="vencimento" value="' + t.vencimento + '"' + (semBaixa ? "" : " disabled") + "></label>" +
      (!rec || t.origem !== "pedido" ? '<label>Valor<input name="valor" value="' + String(t.valor).replace(".", ",") + '"' + (semBaixa ? "" : " disabled") + "></label>" : "<label></label>") +
      '<label>Categoria<select name="categoria_id">' + opcoesCats(rec ? "entrada" : "saida", t.categoria_id) + "</select></label>" +
      '<label>Centro de custo<select name="centro_custo_id">' + opcoesCcs(t.centro_custo_id) + "</select></label>" +
      (rec ? "" : '<label class="inteiro">Código de barras<input name="codigo_barras" value="' + esc(t.codigo_barras || "") + '"></label>') +
      '<label class="inteiro">Observações<textarea name="observacoes">' + esc(t.observacoes || "") + "</textarea></label></div>",
      [{ rotulo: "Cancelar", classe: "claro", acao: fecharModal }, { rotulo: "Salvar", acao: async () => {
        const d = campos($("finModalCorpo")), dados = {};
        if (d.conta_id !== (t.conta_id || "")) dados.conta_id = d.conta_id;
        ["descricao", "documento", "forma", "categoria_id", "centro_custo_id", "observacoes", "codigo_barras"].forEach((k) => { if (k in d && d[k] !== (t[k] || "")) dados[k] = d[k]; });
        if (semBaixa && d.vencimento && d.vencimento !== t.vencimento) dados.vencimento = d.vencimento;
        if (semBaixa && "valor" in d && num(d.valor) !== Number(t.valor)) dados.valor = num(d.valor);
        if (!Object.keys(dados).length) return fecharModal();
        await executar(() => rpc("fin_editar_titulo", { p_empresa: S.emp, p_tipo: tipo, p_id: id, p_dados: dados }), "Salvo.");
      } }]);
  }

  function baixar(tipo, id) {
    const t = (tipo === "receber" ? S.receber : S.pagar).find((x) => x.id === id);
    if (!t) return;
    const rec = tipo === "receber";
    modal(rec ? "Registrar recebimento" : "Registrar pagamento",
      '<div class="fin-form"><p class="fin-info">' + esc(rec ? (t.pedido_numero ? "Pedido " + t.pedido_numero + " · " : "") + DIV[t.componente] + " · " + (t.cliente_nome || "") : (t.fornecedor_nome || "") + " · " + t.descricao) + " — em aberto <b>" + brl(t.aberto) + "</b></p>" +
      '<label>Data<input type="date" name="data" value="' + hoje() + '"></label>' +
      '<label>Valor<input name="valor" inputmode="decimal" value="' + String(t.aberto).replace(".", ",") + '"></label>' +
      '<label>Juros<input name="juros" inputmode="decimal" placeholder="0,00"></label>' +
      '<label>Multa<input name="multa" inputmode="decimal" placeholder="0,00"></label>' +
      '<label>Desconto<input name="desconto" inputmode="decimal" placeholder="0,00"></label>' +
      '<label>Tarifa<input name="tarifa" inputmode="decimal" placeholder="0,00"></label>' +
      '<label class="inteiro">Conta<select name="conta">' + opcoesContas(t.conta_id, "Escolha a conta") + "</select></label>" +
      '<label>Forma<select name="forma">' + opcoesFormas(t.forma) + "</select></label>" +
      '<label>Observação<input name="obs"></label></div>',
      [{ rotulo: "Cancelar", classe: "claro", acao: fecharModal }, { rotulo: rec ? "Confirmar recebimento" : "Confirmar pagamento", classe: "verde", acao: async () => {
        const d = campos($("finModalCorpo"));
        if (!d.conta) return erroModal("Escolha a conta.");
        await executar(() => rpc("fin_baixar", { p_empresa: S.emp, p_tipo: tipo, p_id: id, p_data: d.data, p_valor: num(d.valor), p_juros: num(d.juros), p_multa: num(d.multa), p_desconto: num(d.desconto), p_tarifa: num(d.tarifa), p_conta: d.conta, p_forma: d.forma || null, p_obs: d.obs || null }), rec ? "Recebimento registrado." : "Pagamento registrado.");
      } }]);
  }

  async function detalhes(tipo, id) {
    const t = (tipo === "receber" ? S.receber : S.pagar).find((x) => x.id === id);
    if (!t) return;
    const rec = tipo === "receber";
    const { data: baixas } = await S.sb.from("fin_baixas").select("*").eq("empresa_id", S.emp).eq(rec ? "receber_id" : "pagar_id", id).order("data");
    const [cls, rot] = rec ? statusR(t) : statusP(t);
    const linhas = [
      ["Status", '<span class="fin-status ' + cls + '">' + esc(rot) + "</span>"],
      rec ? ["Cliente", esc(t.cliente_nome || "-")] : ["Fornecedor", esc(t.fornecedor_nome || "-")],
      rec && t.pedido_numero ? ["Pedido", esc(t.pedido_numero) + ' · <span class="fin-chip ' + t.componente + '">' + DIV[t.componente] + "</span>"] : null,
      ["Descrição", esc(t.descricao)], ["Documento", esc(t.documento || "-")], ["Parcela", t.parcela + " de " + t.parcelas],
      ["Vencimento", dataBr(t.vencimento) + (t.programado_para ? " · programado " + dataBr(t.programado_para) : "")],
      ["Valor", brl(t.valor)], [rec ? "Recebido" : "Pago", brl(rec ? t.recebido : t.pago)], ["Em aberto", brl(t.aberto)],
      ["Conta", contaHtml(t.conta_id)], ["Categoria", esc(cat(t.categoria_id)?.nome || "-")], ["Forma", esc(t.forma || "-")],
      t.cancelamento_motivo ? ["Cancelado", esc(t.cancelamento_motivo)] : null, t.observacoes ? ["Observações", esc(t.observacoes)] : null
    ].filter(Boolean);
    modal(rec ? "Conta a receber" : "Conta a pagar",
      '<table class="fin-tabela"><tbody>' + linhas.map(([a, b]) => '<tr><th style="width:160px">' + a + "</th><td>" + b + "</td></tr>").join("") + "</tbody></table>" +
      '<h4 style="margin:18px 0 8px">Baixas</h4>' + ((baixas || []).length ? '<table class="fin-tabela"><thead><tr><th>Data</th><th>Conta</th><th class="num">Valor</th><th class="num">Líquido</th><th>Origem</th><th></th></tr></thead><tbody>' +
        baixas.map((b) => "<tr" + (b.estornado_em ? ' style="opacity:.5;text-decoration:line-through"' : "") + "><td>" + dataBr(b.data) + "</td><td>" + esc(conta(b.conta_id)?.nome || "-") + '</td><td class="num">' + brl(b.valor) + '</td><td class="num">' + brl(b.liquido) + "</td><td>" + esc({ manual: "Manual", gateway: "PIX do gateway", conciliacao: "Extrato" }[b.origem] || b.origem) + (b.estornado_em ? " · estornada" : "") + "</td><td>" +
          (b.estornado_em ? "" : '<button type="button" class="fin-btn peq verm" data-estornar="' + b.id + '">Estornar</button>') + "</td></tr>").join("") + "</tbody></table>" : '<p class="fin-vazio">Nenhuma baixa.</p>'),
      [t.status !== "cancelado" && Number(rec ? t.recebido : t.pago) === 0 ? { rotulo: "Cancelar título", classe: "verm", acao: () => cancelar(tipo, id) } : null, { rotulo: "Fechar", classe: "claro", acao: fecharModal }].filter(Boolean),
      (corpo) => corpo.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-estornar]"); if (!b) return;
        const motivo = prompt("Motivo do estorno:"); if (!motivo) return;
        await executar(() => rpc("fin_estornar_baixa", { p_empresa: S.emp, p_baixa: b.dataset.estornar, p_motivo: motivo }), "Baixa estornada.");
      }));
  }
  async function cancelar(tipo, id) {
    const motivo = prompt("Motivo do cancelamento:"); if (!motivo) return;
    await executar(() => rpc("fin_cancelar_titulo", { p_empresa: S.emp, p_tipo: tipo, p_id: id, p_motivo: motivo }), "Título cancelado.");
  }
  async function aprovar(id, sim) {
    const obs = sim ? "" : prompt("Motivo da reprovação:"); if (!sim && !obs) return;
    try { await rpc("fin_aprovar_pagar", { p_empresa: S.emp, p_id: id, p_aprovar: sim, p_obs: obs || null }); await recarregar(); } catch (e) { avisar(e.message, "Aprovação", "erro"); }
  }
  function programar(id) {
    const t = S.pagar.find((x) => x.id === id);
    modal("Programar pagamento", '<div class="fin-form"><label>Data do pagamento<input type="date" name="data" value="' + (t.programado_para || t.vencimento) + '"></label><label>Conta<select name="conta">' + opcoesContas(t.conta_id) + "</select></label></div>",
      [{ rotulo: "Cancelar", classe: "claro", acao: fecharModal }, { rotulo: "Programar", acao: async () => { const d = campos($("finModalCorpo")); await executar(() => rpc("fin_programar_pagar", { p_empresa: S.emp, p_id: id, p_data: d.data, p_conta: d.conta || null }), "Pagamento programado."); } }]);
  }

  // ---------------------------------------------------------------- contas e PIX
  function pintarContas() {
    const cfg = S.cfg || {};
    $("finConteudo").innerHTML =
      '<section class="fin-bloco"><h3>Para onde vai o dinheiro do pedido <small>cada parte do pedido entra numa conta (CNPJ e PIX)</small></h3><div class="fin-padroes">' +
      [["conta_locacao", "Locação"], ["conta_frete", "Frete"], ["conta_montagem", "Montagem"], ["conta_gateway", "PIX recebido pelo gateway (opcional)"]].map(([k, r]) =>
        '<label class="fin-form" style="display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:#5f5b54">' + r + '<select data-cfg="' + k + '" style="height:40px;border:1px solid #e1dbcf;border-radius:10px;padding:0 12px">' + opcoesContas(cfg[k], k === "conta_gateway" ? "Mesma conta da parte" : "Sem conta") + "</select></label>").join("") +
      '<div><button class="fin-btn" id="fcSalvarCfg">Salvar</button></div></div>' +
      '<p class="fin-info" style="margin-top:12px">Ao salvar, as partes de pedido ainda em aberto (e sem conta escolhida à mão) passam a usar essas contas. Em cada conta a receber dá para trocar a conta pelo botão Editar.</p></section>' +
      '<div class="fin-barra-ferr"><span class="fin-esp"></span><button class="fin-btn claro" id="fcTransf">Transferir entre contas</button><button class="fin-btn claro" id="fcAjuste">Ajustar saldo</button><button class="fin-btn" id="fcNova">+ Nova conta</button></div>' +
      (S.contas.length ? '<div class="fin-contas-grade">' + S.contas.map((c) => {
        const s = S.saldos[c.id] || 0;
        return '<article class="fin-conta' + (c.ativo ? "" : " inativa") + '"><h4>' + esc(c.nome) + "</h4>" +
          '<div class="linha">' + esc(TIPOS_CONTA[c.tipo] || c.tipo) + (c.banco ? " · " + esc(c.banco) : "") + (c.agencia || c.conta ? " · ag " + esc(vis(c, "agencia") || "-") + " cc " + esc(vis(c, "conta") || "-") : "") + "</div>" +
          '<div class="linha"><b>Titular:</b> ' + esc(c.titular_nome || "-") + (c.titular_documento ? " · " + esc(vis(c, "titular_documento")) : "") + "</div>" +
          '<div class="linha"><b>PIX:</b> ' + esc(c.pix_chave ? vis(c, "pix_chave") + (c.pix_tipo ? " (" + c.pix_tipo + ")" : "") : "-") + "</div>" +
          '<div class="saldo' + (s < 0 ? " neg" : "") + '">' + brl(s) + "</div>" +
          '<div><button class="fin-btn peq claro" data-c-editar="' + c.id + '">Editar</button></div></article>';
      }).join("") + "</div>" : '<div class="fin-vazio">Nenhuma conta ainda. Cadastre as contas de cada CNPJ (locação, frete, montagem) com o PIX de cada uma.</div>');
    $("fcSalvarCfg").addEventListener("click", async () => {
      const dados = {}; document.querySelectorAll("[data-cfg]").forEach((s) => { dados[s.dataset.cfg] = s.value; });
      try { await rpc("fin_salvar_config", { p_empresa: S.emp, p_dados: dados }); avisar("Contas do pedido salvas.", "Financeiro", "sucesso"); await recarregar(); } catch (e) { avisar(e.message, "Financeiro", "erro"); }
    });
    $("fcNova").addEventListener("click", () => editarConta(null));
    $("fcTransf").addEventListener("click", transferir);
    $("fcAjuste").addEventListener("click", ajustar);
  }
  function editarConta(id) {
    const c = id ? conta(id) : { tipo: "corrente", ativo: true, saldo_inicial: 0, saldo_minimo: 0, saldo_inicial_data: hoje() };
    modal(id ? "Editar conta" : "Nova conta",
      '<div class="fin-form">' +
      '<label class="inteiro">Nome da conta<input name="nome" value="' + esc(c.nome || "") + '" placeholder="Ex.: Chiavari Locações · Itaú"></label>' +
      '<label>Tipo<select name="tipo">' + Object.entries(TIPOS_CONTA).map(([v, r]) => '<option value="' + v + '"' + (c.tipo === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select></label>" +
      '<label>Banco<input name="banco" value="' + esc(c.banco || "") + '"></label>' +
      '<label>Agência<input name="agencia"></label>' +
      '<label>Conta<input name="conta"></label>' +
      '<p class="fin-sub">Titular e PIX</p>' +
      '<label>Titular (razão social)<input name="titular_nome" value="' + esc(c.titular_nome || "") + '"></label>' +
      '<label>CNPJ / CPF<input name="titular_documento"></label>' +
      '<label>Tipo da chave PIX<select name="pix_tipo"><option value="">-</option>' + ["cnpj", "cpf", "email", "telefone", "aleatoria"].map((v) => '<option value="' + v + '"' + (c.pix_tipo === v ? " selected" : "") + ">" + { cnpj: "CNPJ", cpf: "CPF", email: "E-mail", telefone: "Telefone", aleatoria: "Aleatória" }[v] + "</option>").join("") + "</select></label>" +
      '<label>Chave PIX<input name="pix_chave"></label>' +
      '<p class="fin-sub">Saldo</p>' +
      '<label>Saldo inicial<input name="saldo_inicial" inputmode="decimal" value="' + String(c.saldo_inicial ?? 0).replace(".", ",") + '"></label>' +
      '<label>Data do saldo inicial<input type="date" name="saldo_inicial_data" value="' + (c.saldo_inicial_data || hoje()) + '"></label>' +
      '<label>Saldo mínimo (alerta)<input name="saldo_minimo" inputmode="decimal" value="' + String(c.saldo_minimo ?? 0).replace(".", ",") + '"></label>' +
      '<label class="check"><input type="checkbox" name="ativo"' + (c.ativo ? " checked" : "") + "> Conta ativa</label>" +
      '<label class="inteiro">Observações<textarea name="observacoes">' + esc(c.observacoes || "") + "</textarea></label></div>",
      [{ rotulo: "Cancelar", classe: "claro", acao: fecharModal }, { rotulo: "Salvar", acao: async () => {
        const d = campos($("finModalCorpo"));
        if (!d.nome.trim()) return erroModal("Informe o nome da conta.");
        const linha = { nome: d.nome.trim(), tipo: d.tipo, banco: d.banco || null, titular_nome: d.titular_nome || null,
          pix_tipo: d.pix_tipo || null, saldo_inicial: num(d.saldo_inicial), saldo_inicial_data: d.saldo_inicial_data || hoje(), saldo_minimo: num(d.saldo_minimo), ativo: !!d.ativo, observacoes: d.observacoes || null };
        // campo protegido só vai se a pessoa digitou (em branco = fica como está)
        const corpo = $("finModalCorpo");
        CAMPOS_COFRE.forEach((k) => { const inp = corpo.querySelector('[name="' + k + '"]'); if (window.EasyLocCofre ? EasyLocCofre.mudou(inp) : true) linha[k] = d[k] || null; });
        await executar(async () => {
          const { data, error } = await S.sb.functions.invoke("financeiro-protegido", { body: { action: "salvar_conta", empresa_id: S.emp, conta_id: id || null, conta: linha } });
          let msg = data && data.error;
          if (error && !msg) { try { msg = (await error.context.json()).error; } catch (_) { msg = error.message; } }
          if (msg) throw new Error(msg);
        }, "Conta salva.");
      } }], (corpo) => {
        const podeVer = !!window.EasyLocPermissions?.hasPermission?.("financeiro.dados_bancarios.ver");
        CAMPOS_COFRE.forEach((k) => {
          const inp = corpo.querySelector('[name="' + k + '"]');
          if (!window.EasyLocCofre) { inp.value = c[k] && !String(c[k]).startsWith("cofre:") ? c[k] : ""; return; }
          EasyLocCofre.preparar(inp, { protegido: !!c[k], mascara: vis(c, k), podeRevelar: podeVer && !!id, revelar: async () => (await revelarConta(id, [k]))[k] });
        });
      });
  }
  async function revelarConta(id, camposPedidos) {
    const { data, error } = await S.sb.functions.invoke("financeiro-protegido", { body: { action: "revelar", empresa_id: S.emp, conta_id: id, campos: camposPedidos } });
    let msg = data && data.error;
    if (error && !msg) { try { msg = (await error.context.json()).error; } catch (_) { msg = error.message; } }
    if (msg) throw new Error(msg);
    return (data && data.valores) || {};
  }
  function transferir() {
    modal("Transferir entre contas", '<div class="fin-form"><label>De<select name="de">' + opcoesContas(null, "Escolha") + '</select></label><label>Para<select name="para">' + opcoesContas(null, "Escolha") + '</select></label><label>Data<input type="date" name="data" value="' + hoje() + '"></label><label>Valor<input name="valor" inputmode="decimal"></label><label class="inteiro">Descrição<input name="descricao"></label></div>',
      [{ rotulo: "Cancelar", classe: "claro", acao: fecharModal }, { rotulo: "Transferir", acao: async () => { const d = campos($("finModalCorpo")); await executar(() => rpc("fin_transferir", { p_empresa: S.emp, p_de: d.de || null, p_para: d.para || null, p_data: d.data, p_valor: num(d.valor), p_descricao: d.descricao || null }), "Transferência registrada."); } }]);
  }
  function ajustar() {
    modal("Ajustar saldo", '<div class="fin-form"><label>Conta<select name="conta">' + opcoesContas(null, "Escolha") + '</select></label><label>Tipo<select name="direcao"><option value="entrada">Entrada (aumenta)</option><option value="saida">Saída (diminui)</option></select></label><label>Data<input type="date" name="data" value="' + hoje() + '"></label><label>Valor<input name="valor" inputmode="decimal"></label><label class="inteiro">Motivo<input name="motivo"></label></div>',
      [{ rotulo: "Cancelar", classe: "claro", acao: fecharModal }, { rotulo: "Ajustar", acao: async () => { const d = campos($("finModalCorpo")); await executar(() => rpc("fin_ajustar_saldo", { p_empresa: S.emp, p_conta: d.conta || null, p_direcao: d.direcao, p_data: d.data, p_valor: num(d.valor), p_motivo: d.motivo }), "Saldo ajustado."); } }]);
  }

  // ---------------------------------------------------------------- conciliação
  function lerOfx(txt) {
    const out = [];
    const blocos = txt.split(/<STMTTRN>/i).slice(1);
    const tag = (b, t) => { const m = b.match(new RegExp("<" + t + ">([^<\\r\\n]*)", "i")); return m ? m[1].trim() : ""; };
    blocos.forEach((b, i) => {
      const dt = tag(b, "DTPOSTED"), v = Number(tag(b, "TRNAMT").replace(",", "."));
      if (!dt || !v) return;
      out.push({ fitid: tag(b, "FITID") || dt + "-" + v + "-" + i, data: dt.slice(0, 4) + "-" + dt.slice(4, 6) + "-" + dt.slice(6, 8), valor: v, descricao: tag(b, "MEMO") || tag(b, "NAME") });
    });
    return out;
  }
  function lerCsv(txt) {
    const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
    if (!linhas.length) return [];
    const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ";" : ",";
    const out = [];
    linhas.forEach((l, i) => {
      const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
      const dataTxt = c.find((x) => /^\d{2}\/\d{2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(x));
      const valTxt = [...c].reverse().find((x) => /^-?[\d.]+(,\d{1,2})?$|^-?\d+(\.\d{1,2})?$/.test(x) && x !== dataTxt);
      if (!dataTxt || !valTxt) return;
      const data = dataTxt.includes("/") ? dataTxt.split("/").reverse().join("-") : dataTxt;
      const valor = num(valTxt);
      if (!valor) return;
      const descricao = c.filter((x) => x !== dataTxt && x !== valTxt).join(" ").slice(0, 200);
      out.push({ fitid: "csv-" + data + "-" + valor + "-" + descricao.slice(0, 30) + "-" + i, data, valor, descricao });
    });
    return out;
  }
  async function pintarConciliacao() {
    if (!S.concConta && S.contas.length) S.concConta = S.contas.find((c) => c.ativo)?.id || S.contas[0].id;
    const linhas = S.concConta ? (await todos("fin_extrato", "*", (q) => q.eq("conta_id", S.concConta).order("data", { ascending: false }))) : [];
    const pend = linhas.filter((l) => !l.baixa_id && !l.ignorado), feitas = linhas.filter((l) => l.baixa_id || l.ignorado);
    const candidatos = (l) => {
      const v = Math.abs(Number(l.valor)), rec = Number(l.valor) > 0;
      const lista = (rec ? S.receber.filter((t) => ["aberto", "parcial"].includes(t.status)) : S.pagar.filter((t) => !["pago", "cancelado"].includes(t.status) && !(t.requer_aprovacao && t.aprovacao !== "aprovada")));
      return lista.map((t) => ({ t, d: Math.abs(Number(t.aberto) - v) + (t.conta_id === l.conta_id ? 0 : 0.001) })).sort((a, b) => a.d - b.d).slice(0, 12);
    };
    $("finConteudo").innerHTML =
      '<div class="fin-barra-ferr"><select id="fcConta">' + S.contas.map((c) => '<option value="' + c.id + '"' + (c.id === S.concConta ? " selected" : "") + ">" + esc(c.nome) + "</option>").join("") + "</select>" +
      '<span class="fin-esp"></span><label class="fin-btn claro" style="cursor:pointer">Importar extrato (OFX ou CSV)<input type="file" id="fcArquivo" accept=".ofx,.csv,.txt" hidden></label></div>' +
      (!S.contas.length ? '<div class="fin-vazio">Cadastre uma conta em Contas e PIX para importar o extrato.</div>' :
      '<section class="fin-bloco"><h3>Para conciliar <small>' + pend.length + " lançamento(s)</small></h3>" + (pend.length ? '<div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Data</th><th>Extrato</th><th class="num">Valor</th><th>Conta do sistema</th><th></th></tr></thead><tbody>' +
        pend.map((l) => {
          const cs = candidatos(l), rec = Number(l.valor) > 0, bom = cs[0] && cs[0].d < 0.01;
          return "<tr><td>" + dataBr(l.data) + "</td><td>" + esc(l.descricao || "-") + '</td><td class="num" style="color:' + (rec ? "#2f7a4b" : "#b0362d") + '"><b>' + brl(l.valor) + "</b></td>" +
            '<td><select data-cand="' + l.id + '" style="max-width:360px;height:34px;border:1px solid #e1dbcf;border-radius:8px"><option value="">' + (cs.length ? "Escolher conta…" : "Nenhuma conta em aberto") + "</option>" +
            cs.map((c, i) => '<option value="' + (rec ? "receber:" : "pagar:") + c.t.id + '"' + (i === 0 && bom ? " selected" : "") + ">" + esc((rec ? (c.t.pedido_numero ? "Ped. " + c.t.pedido_numero + " " + DIV[c.t.componente] : c.t.descricao) + " · " + (c.t.cliente_nome || "") : (c.t.fornecedor_nome || "") + " · " + c.t.descricao) + " · " + dataBr(c.t.vencimento) + " · " + brl(c.t.aberto)) + "</option>").join("") + "</select>" +
            (bom ? ' <small style="color:#2f7a4b">sugestão</small>' : "") + '</td><td><div class="acoes"><button class="fin-btn peq verde" data-conc="' + l.id + '">Conciliar</button><button class="fin-btn peq claro" data-conc-novo="' + l.id + '">Lançar nova</button><button class="fin-btn peq claro" data-conc-ign="' + l.id + '">Ignorar</button></div></td></tr>';
        }).join("") + "</tbody></table></div>" : '<div class="fin-vazio">Nada pendente nesta conta.</div>') + "</section>" +
      '<section class="fin-bloco"><h3>Conciliados e ignorados <small>' + feitas.length + "</small></h3>" + (feitas.length ? '<table class="fin-tabela"><tbody>' + feitas.slice(0, 100).map((l) => "<tr><td>" + dataBr(l.data) + "</td><td>" + esc(l.descricao || "-") + '</td><td class="num">' + brl(l.valor) + "</td><td>" + (l.baixa_id ? '<span class="fin-status recebido">Conciliado</span>' : '<span class="fin-status cancelado">Ignorado</span> <button class="fin-btn peq claro" data-conc-volta="' + l.id + '">Desfazer</button>') + "</td></tr>").join("") + "</tbody></table>" : '<div class="fin-vazio">Nada ainda.</div>') + "</section>");
    $("fcConta")?.addEventListener("change", (e) => { S.concConta = e.target.value; pintarConciliacao(); });
    $("fcArquivo")?.addEventListener("change", async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      const txt = await f.text();
      const linhasArq = /<OFX>|<STMTTRN>/i.test(txt) ? lerOfx(txt) : lerCsv(txt);
      if (!linhasArq.length) { avisar("Não encontrei lançamentos nesse arquivo. Use o OFX do banco ou um CSV com data, descrição e valor.", "Extrato", "aviso"); return; }
      if (!(await confirmar("Importar " + linhasArq.length + " lançamento(s) para a conta " + (conta(S.concConta)?.nome || "") + "?", "Importar extrato"))) return;
      try { const n = await rpc("fin_importar_extrato", { p_empresa: S.emp, p_conta: S.concConta, p_linhas: linhasArq }); avisar(n + " lançamento(s) novos importados.", "Extrato", "sucesso"); pintarConciliacao(); } catch (er) { avisar(er.message, "Extrato", "erro"); }
    });
  }
  async function conciliarAcao(btn) {
    try {
      if (btn.dataset.conc) {
        const v = document.querySelector('[data-cand="' + btn.dataset.conc + '"]')?.value;
        if (!v) { avisar("Escolha a conta do sistema que esse lançamento paga ou recebe.", "Conciliação"); return; }
        const [tipo, id] = v.split(":");
        await rpc("fin_conciliar", { p_empresa: S.emp, p_extrato: btn.dataset.conc, p_tipo: tipo, p_titulo: id });
      } else if (btn.dataset.concNovo) {
        const desc = prompt("Descrição do lançamento (ex.: Tarifa bancária):"); if (desc === null) return;
        await rpc("fin_conciliar_novo", { p_empresa: S.emp, p_extrato: btn.dataset.concNovo, p_descricao: desc || null, p_categoria: null });
      } else if (btn.dataset.concIgn) {
        await rpc("fin_ignorar_extrato", { p_empresa: S.emp, p_extrato: btn.dataset.concIgn, p_ignorar: true });
      } else if (btn.dataset.concVolta) {
        await rpc("fin_ignorar_extrato", { p_empresa: S.emp, p_extrato: btn.dataset.concVolta, p_ignorar: false });
      }
      await carregar(); pintarConciliacao();
    } catch (e) { avisar(e.message, "Conciliação", "erro"); }
  }

  // ---------------------------------------------------------------- DRE e inadimplência
  async function pintarDre() {
    if (!S.dre.ini) { const d = new Date(); S.dre.ini = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); S.dre.fim = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); }
    const linhas = await rpc("fin_dre", { p_empresa: S.emp, p_ini: S.dre.ini, p_fim: S.dre.fim });
    const ent = linhas.filter((l) => l.tipo === "entrada"), sai = linhas.filter((l) => l.tipo !== "entrada");
    const soma = (l, k) => l.reduce((s, x) => s + Number(x[k] || 0), 0);
    const bloco = (rot, l) => '<tr class="grupo"><td>' + rot + '</td><td class="num">' + brl(soma(l, "previsto")) + '</td><td class="num">' + brl(soma(l, "realizado")) + "</td></tr>" +
      l.map((x) => "<tr><td>" + esc((x.codigo ? x.codigo + " " : "") + x.nome) + '</td><td class="num">' + brl(x.previsto) + '</td><td class="num">' + brl(x.realizado) + "</td></tr>").join("");
    $("finConteudo").innerHTML =
      '<div class="fin-barra-ferr"><label>De <input type="date" id="fdIni" value="' + S.dre.ini + '"></label><label>Até <input type="date" id="fdFim" value="' + S.dre.fim + '"></label><button class="fin-btn claro" id="fdOk">Atualizar</button></div>' +
      '<section class="fin-bloco"><h3>DRE por competência <small>previsto = títulos · realizado = recebido/pago</small></h3><table class="fin-tabela fin-dre"><thead><tr><th>Categoria</th><th class="num">Previsto</th><th class="num">Realizado</th></tr></thead><tbody>' +
      bloco("Receitas", ent) + bloco("Despesas", sai) +
      '<tr class="total"><td>Resultado</td><td class="num">' + brl(soma(ent, "previsto") - soma(sai, "previsto")) + '</td><td class="num">' + brl(soma(ent, "realizado") - soma(sai, "realizado")) + "</td></tr></tbody></table></section>";
    $("fdOk").addEventListener("click", () => { S.dre = { ini: $("fdIni").value, fim: $("fdFim").value }; pintarDre(); });
  }
  async function pintarInadimplencia() {
    const l = await rpc("fin_inadimplencia", { p_empresa: S.emp });
    $("finConteudo").innerHTML = '<section class="fin-bloco"><h3>Recebimentos vencidos por cliente</h3>' + (l.length ? '<table class="fin-tabela"><thead><tr><th>Cliente</th><th class="num">Títulos</th><th class="num">Em aberto</th><th class="num">Maior atraso</th><th>Mais antigo</th></tr></thead><tbody>' +
      l.map((x) => "<tr><td>" + esc(x.cliente) + '</td><td class="num">' + x.titulos + '</td><td class="num"><b>' + brl(x.valor) + '</b></td><td class="num">' + x.maior_atraso + " dia(s)</td><td>" + dataBr(x.mais_antigo) + "</td></tr>").join("") + "</tbody></table>" : '<div class="fin-vazio">Nenhum recebimento vencido.</div>') + "</section>";
  }

  // ---------------------------------------------------------------- plano de contas
  function pintarPlano() {
    const arv = (tipo) => {
      const raiz = S.cats.filter((c) => c.tipo === tipo && !c.pai_id);
      return raiz.map((r) => linhaCat(r, 0) + S.cats.filter((c) => c.pai_id === r.id).map((f) => linhaCat(f, 1)).join("")).join("");
    };
    $("finConteudo").innerHTML = '<div class="fin-grade"><section class="fin-bloco"><h3>Plano de contas <button class="fin-btn peq" id="fpcNova">+ Categoria</button></h3><table class="fin-tabela"><tbody>' +
      '<tr class="grupo"><td colspan="2"><b>Entradas</b></td></tr>' + arv("entrada") + '<tr><td colspan="2"><b>Saídas</b></td></tr>' + arv("saida") + "</tbody></table></section>" +
      '<section class="fin-bloco"><h3>Centros de custo <button class="fin-btn peq" id="fpcCc">+ Centro de custo</button></h3><table class="fin-tabela"><tbody>' +
      S.ccs.map((c) => "<tr" + (c.ativo ? "" : ' style="opacity:.5"') + "><td>" + esc((c.codigo ? c.codigo + " · " : "") + c.nome) + '</td><td class="num"><button class="fin-btn peq claro" data-cc-tog="' + c.id + '">' + (c.ativo ? "Desativar" : "Ativar") + "</button></td></tr>").join("") + "</tbody></table></section></div>";
    $("fpcNova").addEventListener("click", () => {
      modal("Nova categoria", '<div class="fin-form"><label>Tipo<select name="tipo"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label><label>Código<input name="codigo" placeholder="Ex.: 4.4"></label><label class="inteiro">Nome<input name="nome"></label><label class="inteiro">Dentro de<select name="pai_id"><option value="">(principal)</option>' + S.cats.filter((c) => !c.pai_id).map((c) => '<option value="' + c.id + '">' + esc(c.codigo + " " + c.nome) + "</option>").join("") + "</select></label></div>",
        [{ rotulo: "Cancelar", classe: "claro", acao: fecharModal }, { rotulo: "Salvar", acao: async () => { const d = campos($("finModalCorpo")); if (!d.nome.trim()) return erroModal("Informe o nome."); await executar(async () => { const r = await S.sb.from("fin_categorias").insert({ empresa_id: S.emp, tipo: d.tipo, codigo: d.codigo || null, nome: d.nome.trim(), pai_id: d.pai_id || null, ordem: 100 }); if (r.error) throw r.error; }, "Categoria criada."); } }]);
    });
    $("fpcCc").addEventListener("click", () => {
      modal("Novo centro de custo", '<div class="fin-form"><label>Código<input name="codigo"></label><label>Nome<input name="nome"></label></div>',
        [{ rotulo: "Cancelar", classe: "claro", acao: fecharModal }, { rotulo: "Salvar", acao: async () => { const d = campos($("finModalCorpo")); if (!d.nome.trim()) return erroModal("Informe o nome."); await executar(async () => { const r = await S.sb.from("fin_centros_custo").insert({ empresa_id: S.emp, codigo: d.codigo || null, nome: d.nome.trim() }); if (r.error) throw r.error; }, "Centro de custo criado."); } }]);
    });
  }
  const linhaCat = (c, nivel) => "<tr" + (c.ativo ? "" : ' style="opacity:.5"') + '><td style="padding-left:' + (10 + nivel * 22) + 'px">' + esc((c.codigo ? c.codigo + " " : "") + c.nome) + (c.chave ? ' <small style="color:#8a6c48">automática</small>' : "") + '</td><td class="num"><button class="fin-btn peq claro" data-cat-tog="' + c.id + '">' + (c.ativo ? "Desativar" : "Ativar") + "</button></td></tr>";

  // ---------------------------------------------------------------- eventos
  function ligar() {
    $("finAbas").addEventListener("click", (e) => { const b = e.target.closest("[data-aba]"); if (!b) return; S.aba = b.dataset.aba; pintar(); });
    $("finModalRodape").addEventListener("click", (e) => { const b = e.target.closest("[data-bt]"); if (!b) return; aoConfirmar?.[Number(b.dataset.bt)]?.acao(); });
    $("finModal").addEventListener("click", (e) => { if (e.target.closest("[data-fechar]")) fecharModal(); });
    $("finConteudo").addEventListener("click", async (e) => {
      const b = e.target.closest("button,[data-conc]"); if (!b) return;
      const d = b.dataset;
      if (d.rBaixar) baixar("receber", d.rBaixar);
      else if (d.rEditar) editarTitulo("receber", d.rEditar);
      else if (d.rVer) detalhes("receber", d.rVer);
      else if (d.pBaixar) baixar("pagar", d.pBaixar);
      else if (d.pEditar) editarTitulo("pagar", d.pEditar);
      else if (d.pVer) detalhes("pagar", d.pVer);
      else if (d.pAprovar) aprovar(d.pAprovar, true);
      else if (d.pReprovar) aprovar(d.pReprovar, false);
      else if (d.pProgramar) programar(d.pProgramar);
      else if (d.cEditar) editarConta(d.cEditar);
      else if (d.conc || d.concNovo || d.concIgn || d.concVolta) conciliarAcao(b);
      else if (d.catTog) { const c = cat(d.catTog); const r = await S.sb.from("fin_categorias").update({ ativo: !c.ativo }).eq("id", c.id).eq("empresa_id", S.emp); if (r.error) avisar(r.error.message); await recarregar(); }
      else if (d.ccTog) { const c = S.ccs.find((x) => x.id === d.ccTog); const r = await S.sb.from("fin_centros_custo").update({ ativo: !c.ativo }).eq("id", c.id).eq("empresa_id", S.emp); if (r.error) avisar(r.error.message); await recarregar(); }
    });
  }

  async function iniciar() {
    ligar();
    const ctx = await window.aguardarContexto?.();
    S.sb = window.supabaseClient;
    S.emp = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    if (!S.sb || !S.emp) { $("finConteudo").innerHTML = '<div class="fin-vazio">Entre no sistema para ver o financeiro.</div>'; return; }
    const aba = new URLSearchParams(location.search).get("aba");
    if (aba && document.querySelector('#finAbas [data-aba="' + aba + '"]')) S.aba = aba;
    await recarregar();
    window.finalizarCarregamentoModulo?.();
  }
  iniciar().catch((e) => { console.error(e); $("finConteudo").innerHTML = '<div class="fin-vazio">Não foi possível abrir o financeiro.</div>'; });
})();
