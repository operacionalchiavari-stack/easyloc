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
  const TIPOS_CONTA = { corrente: "Conta corrente", poupanca: "Poupança", caixa: "Caixa físico (dinheiro)", aplicacao: "Aplicação", digital: "Conta digital", gateway: "Gateway de pagamento" };
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
    // Baixa manual (Parâmetros > Financeiro, nov/2026): sem ela, recebimento e pagamento só pela conciliação em Bancos.
    S.baixaManual = await S.sb.from("empresa_financeiro").select("baixa_manual_receber,baixa_manual_pagar").eq("empresa_id", S.emp).maybeSingle().then((r) => r.data || {}).catch(() => ({}));
    S.fornecedores = forn; S.clientes = cli;
    // pré-reservas (nov/2026): parcelas programadas no pedido, só como previsão (não são contas a receber)
    S.previsoes = await rpc("fin_previsao_pre_reservas", { p_empresa: S.emp }).catch(() => []) || [];
    S.saldos = {}; (saldos || []).forEach((s) => { S.saldos[s.conta_id] = Number(s.saldo) || 0; });
    S.recebidoEm = {};
    const baixas = await todos("fin_baixas", "receber_id,data,estornado_em", (q) => q.not("receber_id", "is", null)).catch(() => []);
    baixas.forEach((b) => { if (b.estornado_em || !b.receber_id) return; const d = String(b.data || "").slice(0, 10); if (d > (S.recebidoEm[b.receber_id] || "")) S.recebidoEm[b.receber_id] = d; });
    const ids = [...new Set(receber.map((r) => r.pedido_id).filter(Boolean))];
    S.pedidos = {};
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await S.sb.from("separacoes_pedidos").select("id,numero_pedido,cliente_nome,tipo_evento,data_evento,data_evento_fim,data_entrega,data_coleta,local_nome,valor_total,status_comercial").in("id", ids.slice(i, i + 100));
      (data || []).forEach((p) => { S.pedidos[p.id] = p; });
    }
    contadores();
  }

  const conta = (id) => S.contas.find((c) => c.id === id);
  const cat = (id) => S.cats.find((c) => c.id === id);
  const vencido = (t) => ["aberto", "parcial", "pendente", "aprovado", "programado"].includes(t.status) && (t.programado_para || t.vencimento) < hoje();
  // Aviso de vencimento em A receber (out/2026): bolinha piscando ao lado da data. Até 3 dias (e vencido) em vermelho,
  // até 7 dias em amarelo. Usa a data local: hoje() é em UTC e viraria o dia às 21h no Brasil.
  function diasParaVencer(t) {
    if (["recebido", "cancelado"].includes(t.status) || !(Number(t.aberto) > 0.005) || !t.vencimento) return null;
    const dia = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    return Math.round((dia(String(t.vencimento).slice(0, 10)) - dia(new Date().toLocaleDateString("sv-SE"))) / 86400000);
  }
  // Abas rápidas de A receber: cada conta em aberto cai em uma só
  const PRAZOS = [["vencidos", "Vencidos", (d) => d < 0], ["hoje", "Vence hoje", (d) => d === 0], ["semana", "Próximos 7 dias", (d) => d >= 1 && d <= 7]];
  const noPrazo = (t, chave) => { const d = diasParaVencer(t); return d !== null && PRAZOS.find(([k]) => k === chave)[2](d); };
  function alertaVenc(t) {
    if (S.recebidoEm?.[t.id] && Number(t.aberto) <= 0.005) return "";
    const dias = diasParaVencer(t);
    if (dias === null || dias > 7) return "";
    const txt = dias < -1 ? "Venceu há " + -dias + " dias" : dias === -1 ? "Venceu ontem" : dias === 0 ? "Vence hoje" : dias === 1 ? "Vence amanhã" : "Vence em " + dias + " dias";
    return '<span class="fin-venc-alerta ' + (dias <= 3 ? "vermelho" : "amarelo") + '"><i aria-hidden="true"></i>' + txt + "</span>";
  }
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
    if (t.manutencao_confirmada === false) return ["aguardando", "Aguardando serviço"];
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
    $("finModal").classList.remove("fin-modal-detalhe");
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
  // Abas que juntam duas telas (out/2026, para caber tudo numa linha): a aba é a primeira tela e as duas partes
  // aparecem como botões pequenos logo abaixo (#finSubAbas). S.aba continua sendo o nome da tela de dentro.
  const GRUPOS_ABA = {
    // Decoradores: uma tela só (a "Gestão de créditos" saiu, tudo é feito na conta corrente); a linha fica para
    // os botões Atualizar / Registrar crédito que financeiro-bv.js põe à direita.
    bv: [["bv", "Conta dos decoradores"]],
    dre: [["dre", "DRE"], ["plano", "Plano de contas"]],
    gerencial: [["gerencial", "Painel"], ["resultados", "Lançar custos dos eventos"]]
  };
  const abaDoGrupo = (aba) => (aba === "contas" || aba === "conciliacao") ? "bancos" : Object.keys(GRUPOS_ABA).find((g) => GRUPOS_ABA[g].some(([k]) => k === aba)) || aba;
  function pintarSubAbas() {
    const nav = $("finSubAbas"); if (!nav) return;
    const grupo = GRUPOS_ABA[abaDoGrupo(S.aba)];
    nav.hidden = !grupo;
    nav.innerHTML = grupo && grupo.length > 1 ? grupo.map(([k, t]) => '<button type="button" data-subaba="' + k + '" class="' + (k === S.aba ? "ativa" : "") + '" aria-pressed="' + (k === S.aba) + '">' + t + "</button>").join("") : "";
  }
  function pintar() {
    $('finConteudo').classList.toggle('fin-bv-extrato', S.aba === 'bv');
    document.querySelectorAll("#finAbas [data-aba]").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === abaDoGrupo(S.aba)));
    pintarSubAbas();
    const f = { geral: pintarGeral, gerencial: () => window.FinanceiroGerencial.render({ S, esc, brl, dataBr, modal, fecharModal, avisar, rpc, irPara: (aba) => { S.aba = aba; pintar(); } }), receber: pintarReceber, pagar: pintarPagar, bv: () => window.FinanceiroBV.render({ S, rpc, brl, esc, dataBr, card, recarregar, registrarCredito }), resultados: () => window.FinanceiroGestao.resultados({ S, rpc, brl, esc, dataBr, recarregar }), posicao: () => window.FinanceiroPosicaoFinal.render({ S, rpc, brl, esc, dataBr, recarregar }), bancos: pintarConciliacao, clara: () => window.FinanceiroClara.chat(ctxClara()), gateways: () => window.FinanceiroGateways.render(), contas: pintarConciliacao, conciliacao: pintarConciliacao, dre: pintarDre, plano: pintarPlano }[S.aba];
    Promise.resolve(f()).catch((e) => { console.error(e); $("finConteudo").innerHTML = '<div class="fin-vazio">Erro: ' + esc(e.message || e) + "</div>"; });
  }

  // ---------------------------------------------------------------- visão geral
  // Calendário financeiro em destaque na Visão geral (out/2026, igual ao da Tecnoweld): um quadro por mês com entradas (E),
  // saídas (S) e o saldo previsto de cada dia (fin_fluxo); verde = saldo positivo, amarelo = no saldo mínimo das contas
  // ou abaixo, vermelho = negativo. Passar o mouse (ou clicar) num dia mostra os recebimentos e pagamentos dele.
  const mesIni = (d) => d.slice(0, 8) + "01";
  const mesFim = (d) => { const x = new Date(d.slice(0, 8) + "01T12:00:00"); x.setMonth(x.getMonth() + 1); x.setDate(0); return x.toISOString().slice(0, 10); };
  const mesSoma = (d, n) => { const x = new Date(d.slice(0, 8) + "01T12:00:00"); x.setMonth(x.getMonth() + n); return x.toISOString().slice(0, 10); };
  const mesNome = (d) => { const t = new Date(d.slice(0, 8) + "01T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const compacto = (n) => { const v = Number(n) || 0, a = Math.abs(v); return (v < 0 ? "-" : "") + (a >= 1e6 ? (a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : a >= 1e3 ? (a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })); };
  const diaDoTitulo = (t) => String(t.programado_para || t.vencimento || "").slice(0, 10);

  async function pintarGeral() {
    const abertosR = S.receber.filter((t) => ["aberto", "parcial"].includes(t.status));
    const porDiv = {}; abertosR.forEach((t) => { porDiv[t.componente] = (porDiv[t.componente] || 0) + Number(t.aberto); });
    // Visão geral em duas colunas (out/2026): calendário à esquerda; saldos por conta e a receber por divisão à direita.
    // Os cartões de totais saíram a pedido do usuário.
    $("finConteudo").innerHTML = '<div class="fin-geral-2col"><div class="fin-geral-cal">' +
      '<section class="fin-bloco fin-calendario" id="finCalendario">' +
      '<header class="fin-cal-topo"><div><h3>Calendário financeiro</h3><p>Todas as contas</p></div>' +
      '<div class="fin-cal-nav"><button type="button" class="fin-cal-seta" data-cal="-1" aria-label="Mês anterior">‹</button><strong id="finCalMes"></strong>' +
      '<button type="button" class="fin-cal-seta" data-cal="1" aria-label="Próximo mês">›</button><button type="button" class="btn secondary" data-cal="hoje">Hoje</button></div></header>' +
      '<div class="fin-cal-semana"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div>' +
      '<div class="fin-cal-dias" id="finCalDias"><div class="fin-vazio">Carregando…</div></div>' +
      '<footer class="fin-cal-legenda"><span><i class="positivo"></i> Saldo positivo</span><span><i class="alerta"></i> No saldo mínimo ou abaixo</span><span><i class="negativo"></i> Saldo negativo</span></footer>' +
      "</section></div>" +
      '<div class="fin-geral-lado">' +
      '<section class="fin-bloco"><h3>Saldos por conta</h3>' + (S.contas.length ? '<table class="fin-tabela"><tbody>' + S.contas.filter((c) => c.ativo).map((c) => "<tr><td>" + contaHtml(c.id) + '</td><td class="num"><b>' + brl(S.saldos[c.id] || 0) + "</b></td></tr>").join("") + "</tbody></table>" : '<div class="fin-vazio">Nenhuma conta cadastrada. Cadastre em Contas e PIX.</div>') + "</section>" +
      '<section class="fin-bloco"><h3>A receber por divisão <small>em aberto</small></h3><table class="fin-tabela"><tbody>' +
      ["locacao", "frete", "montagem", "outro"].filter((k) => porDiv[k]).map((k) => '<tr><td><span class="fin-chip ' + k + '">' + DIV[k] + "</span></td><td>" + contaHtml(S.cfg["conta_" + k]) + '</td><td class="num"><b>' + brl(porDiv[k]) + "</b></td></tr>").join("") +
      (Object.keys(porDiv).length ? "" : '<tr><td class="fin-vazio">Nada em aberto.</td></tr>') + "</tbody></table></section>" +
      "</div></div>";
    S.calMes = S.calMes || mesIni(hoje());
    $("finCalendario").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-cal]");
      if (b) { S.calMes = b.dataset.cal === "hoje" ? mesIni(hoje()) : mesSoma(S.calMes, Number(b.dataset.cal)); pintarCalendario(); return; }
      const dia = ev.target.closest("[data-dia]");
      if (dia) { S.calDia = dia.dataset.dia; $("finCalDias").querySelectorAll(".fin-cal-dia.selecionado").forEach((d) => d.classList.remove("selecionado")); dia.classList.add("selecionado"); detalheDia(dia); }
    });
    await pintarCalendario();
  }

  async function pintarCalendario() {
    const caixa = $("finCalDias"); if (!caixa) return;
    fecharDetalheDia();
    const ini = S.calMes, fim = mesFim(S.calMes);
    $("finCalMes").textContent = mesNome(ini);
    let fluxo = [];
    try { fluxo = await rpc("fin_fluxo", { p_empresa: S.emp, p_ini: ini, p_fim: fim, p_conta: null }) || []; }
    catch (e) { console.error(e); caixa.innerHTML = '<div class="fin-vazio">Não foi possível carregar o calendário.</div>'; return; }
    if (S.calMes !== ini) return; // trocou de mês enquanto carregava
    const porDia = new Map(fluxo.map((d) => [String(d.dia).slice(0, 10), d]));
    S.calFluxo = porDia;
    const minimo = S.contas.filter((c) => c.ativo).reduce((s, c) => s + (Number(c.saldo_minimo) || 0), 0);
    const primeiro = new Date(ini + "T12:00:00"), qtd = Number(fim.slice(8, 10)), vazios = primeiro.getDay(), hj = hoje();
    let html = "";
    for (let i = 0; i < vazios; i++) html += '<span class="fin-cal-dia vazio" aria-hidden="true"></span>';
    for (let d = 1; d <= qtd; d++) {
      const chave = ini.slice(0, 8) + String(d).padStart(2, "0"), r = porDia.get(chave) || {};
      const entra = Number(r.previsto_entrada || 0) + Number(r.realizado_entrada || 0), sai = Number(r.previsto_saida || 0) + Number(r.realizado_saida || 0);
      const saldo = Number(r.saldo_previsto || 0), estado = !porDia.has(chave) ? "neutro" : saldo < 0 ? "negativo" : saldo <= minimo ? "alerta" : "positivo";
      const pre = (S.previsoes || []).filter((x) => String(x.vencimento || "").slice(0, 10) === chave).reduce((t, x) => t + Number(x.valor || 0), 0);
      html += '<button type="button" class="fin-cal-dia ' + estado + (chave === hj ? " hoje" : "") + (chave === S.calDia ? " selecionado" : "") + '" data-dia="' + chave + '" aria-label="' + esc(dataBr(chave) + ": entradas " + brl(entra) + ", saídas " + brl(sai) + ", saldo " + brl(saldo)) + '">' +
        '<span class="fin-cal-num">' + d + '</span><span class="fin-cal-valores"><span class="e">E: ' + compacto(entra) + '</span><span class="s">S: ' + compacto(sai) + '</span><b>Saldo: ' + compacto(saldo) + "</b>" + (pre ? '<span class="p" title="Previsão de pré-reserva, fora do saldo">Pré: ' + compacto(pre) + "</span>" : "") + "</span></button>";
    }
    const resto = (7 - ((vazios + qtd) % 7)) % 7;
    for (let i = 0; i < resto; i++) html += '<span class="fin-cal-dia vazio" aria-hidden="true"></span>';
    caixa.innerHTML = html;
    caixa.querySelectorAll("[data-dia]").forEach((b) => {
      b.addEventListener("mouseenter", () => detalheDia(b));
      b.addEventListener("focus", () => detalheDia(b));
      b.addEventListener("mouseleave", fecharDetalheDia);
      b.addEventListener("blur", fecharDetalheDia);
    });
  }

  function fecharDetalheDia() { const p = document.getElementById("finCalDetalhe"); if (p) p.hidden = true; }
  function detalheDia(botao) {
    const dia = botao.dataset.dia, r = S.calFluxo?.get(dia) || {};
    let p = document.getElementById("finCalDetalhe");
    if (!p) {
      p = document.createElement("div"); p.id = "finCalDetalhe"; p.className = "fin-cal-detalhe"; p.setAttribute("role", "tooltip"); document.body.append(p);
      window.addEventListener("scroll", fecharDetalheDia, true); window.addEventListener("resize", fecharDetalheDia);
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharDetalheDia(); });
    }
    const entradas = S.receber.filter((t) => t.status !== "cancelado" && diaDoTitulo(t) === dia);
    const saidas = S.pagar.filter((t) => t.status !== "cancelado" && diaDoTitulo(t) === dia);
    const nomeR = (t) => (t.pedido_id && S.pedidos[t.pedido_id] ? "Pedido " + (S.pedidos[t.pedido_id].numero_pedido || "") + " · " : "") + (t.cliente_nome || t.descricao || "Recebimento");
    const nomeP = (t) => t.fornecedor_nome || t.descricao || "Pagamento";
    const lista = (itens, nome) => itens.length
      ? "<ul>" + itens.slice(0, 5).map((t) => "<li><div><strong>" + esc(nome(t)) + "</strong><small>" + esc([t.descricao, t.componente ? DIV[t.componente] : ""].filter(Boolean).join(" · ")) + "</small></div><b>" + brl(Number(t.aberto) || Number(t.valor) || 0) + "</b></li>").join("") + "</ul>" + (itens.length > 5 ? "<small>+ " + (itens.length - 5) + " lançamento(s) neste dia</small>" : "")
      : '<p class="fin-cal-nada">Nenhum lançamento neste dia.</p>';
    p.innerHTML = "<header>" + esc(dataBr(dia)) + "</header>" +
      '<section class="entrada"><h4><span>Entradas do dia</span><b>' + brl(Number(r.previsto_entrada || 0) + Number(r.realizado_entrada || 0)) + "</b></h4>" + lista(entradas, nomeR) + "</section>" +
      (() => { const pr = (S.previsoes || []).filter((x) => String(x.vencimento || "").slice(0, 10) === dia); return pr.length ? '<section class="pre"><h4><span>Pré-reservas (previsão, fora do saldo)</span><b>' + brl(pr.reduce((t, x) => t + Number(x.valor || 0), 0)) + "</b></h4><ul>" + pr.slice(0, 5).map((x) => "<li><div><strong>Pedido " + esc(x.pedido_numero || "") + " · " + esc(x.cliente_nome || "") + "</strong><small>" + esc((DIV[x.componente] || "") + " · " + (x.parcela || "")) + "</small></div><b>" + brl(x.valor) + "</b></li>").join("") + "</ul></section>" : ""; })() +
      '<section class="saida"><h4><span>Saídas do dia</span><b>' + brl(Number(r.previsto_saida || 0) + Number(r.realizado_saida || 0)) + "</b></h4>" + lista(saidas, nomeP) + "</section>";
    p.hidden = false;
    const rect = botao.getBoundingClientRect(), largura = Math.min(380, innerWidth - 24);
    p.style.width = largura + "px";
    const alto = p.getBoundingClientRect().height;
    p.style.left = Math.max(12, Math.min(rect.left, innerWidth - largura - 12)) + "px";
    p.style.top = Math.max(12, rect.bottom + 8 + alto > innerHeight ? rect.top - alto - 8 : rect.bottom + 8) + "px";
  }
  const card = (rot, val, sub, cls = "") => '<div class="fin-card ' + cls + '"><span>' + esc(rot) + "</span><strong>" + val + "</strong><small>" + esc(sub) + "</small></div>";

  // ---------------------------------------------------------------- a receber (agrupado por pedido, com a divisão)
  function filtrarR() {
    const f = S.filtroR, b = f.busca.trim().toLowerCase();
    return S.receber.filter((t) => {
      if (f.prazo && !noPrazo(t, f.prazo)) return false;
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
  // A receber pode ser visto agrupado por pedido (padrão) ou "por data": cada parcela numa linha, em ordem de
  // vencimento (botão ao lado de "+ Novo recebimento"; a escolha fica guardada no navegador).
  const ICONE_LISTA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>';
  const ICONE_GRUPO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="18" height="7" rx="1.5"/></svg>';
  function modoReceber() { if (!S.recModo) { try { S.recModo = localStorage.getItem("fin_receber_modo") || "pedido"; } catch (_) { S.recModo = "pedido"; } } return S.recModo; }
  function acoesR(t) {
    // receber: só pela conciliação em Bancos (ou lançando no caixa, se foi em dinheiro)
    return '<td><div class="acoes">' +
      (S.baixaManual?.baixa_manual_receber && Number(t.aberto) > 0.005 && t.status !== "cancelado" ? '<button class="fin-btn peq verde" data-r-baixar="' + t.id + '">Recebido</button>' : "") +
      '<button class="fin-btn peq claro" data-r-editar="' + t.id + '">Editar</button><button class="fin-btn peq claro" data-r-ver="' + t.id + '">Detalhes</button></div></td>';
  }
  // Situação do pedido inteiro (todas as parcelas, sem olhar os filtros): quanto já entrou e quanto falta para quitar.
  const ST_PEDIDO = { orcamento: "Orçamento", pre_reserva: "Pré-reserva", aprovado: "Reservado", finalizado: "Reservado", enviado: "Reservado", cancelado: "Cancelado" };
  function situacaoPedido(chave) {
    const ts = S.receber.filter((x) => (x.pedido_id || x.grupo) === chave && x.status !== "cancelado");
    const total = ts.reduce((s, x) => s + Number(x.valor), 0), aberto = ts.reduce((s, x) => s + Number(x.aberto), 0);
    const vencidoV = ts.filter(vencido).reduce((s, x) => s + Number(x.aberto), 0);
    const abertas = ts.filter((x) => Number(x.aberto) > 0.005).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
    return { ts, total, aberto, recebido: Math.max(0, total - aberto), vencido: vencidoV, pct: total > 0 ? Math.floor(((total - aberto) / total) * 100) : 0,
      pagas: ts.filter((x) => Number(x.aberto) <= 0.005).length, proxima: abertas[0] || null, abertas };
  }
  const barraPago = (pct) => '<span class="fin-pago-barra" role="img" aria-label="' + pct + '% pago"><i style="width:' + Math.min(100, Math.max(0, pct)) + '%"></i></span>';
  // Coluna "Falta no pedido" de cada parcela: o que falta para o pedido ficar quitado e, embaixo, quanto ainda vai faltar
  // depois que esta parcela for paga (as parcelas em aberto em ordem de vencimento).
  function faltaNoPedido(t) {
    const sit = situacaoPedido(t.pedido_id || t.grupo);
    if (sit.aberto <= 0.005) return '<td class="num fin-falta"><b class="fin-quitado">Quitado</b>' + barraPago(100) + "</td>";
    const i = sit.abertas.findIndex((x) => x.id === t.id);
    const depois = i >= 0 ? sit.abertas.slice(i + 1).reduce((s, x) => s + Number(x.aberto), 0) : null;
    return '<td class="num fin-falta"><b>' + brl(sit.aberto) + "</b>" + barraPago(sit.pct) + "<small>" + sit.pct + "% pago" +
      (depois != null ? " · depois desta: " + (depois > 0.005 ? brl(depois) : "quitado") : "") + "</small></td>";
  }
  // Quando foi recebido e se foi no prazo: "Recebido em 02/11 · 3 dias depois do vencimento".
  // Pagamento parcial mostra a data do último recebimento.
  function recebidoEmHtml(t) {
    const d = S.recebidoEm?.[t.id];
    if (!d) return '<td class="fin-receb-em"><span class="fin-receb-nada">—</span></td>';
    const venc = String(t.vencimento || "").slice(0, 10);
    const dias = venc ? Math.round((new Date(d + "T12:00:00") - new Date(venc + "T12:00:00")) / 864e5) : 0;
    const prazo = !venc ? "" : dias === 0 ? '<small class="ok">no dia do vencimento</small>' : dias < 0 ? '<small class="ok">' + -dias + " dia" + (dias === -1 ? "" : "s") + " antes</small>" : '<small class="atraso">' + dias + " dia" + (dias === 1 ? "" : "s") + " depois</small>";
    return '<td class="fin-receb-em"><b>' + dataBr(d) + "</b>" + prazo + "</td>";
  }
  const metaPedido = (ped) => [ped.tipo_evento, ped.data_evento ? "Evento " + dataBr(ped.data_evento) + (ped.data_evento_fim && ped.data_evento_fim !== ped.data_evento ? " a " + dataBr(ped.data_evento_fim) : "") : "",
    ped.local_nome, ped.data_entrega ? "Entrega " + dataBr(ped.data_entrega) : "", ped.data_coleta ? "Coleta " + dataBr(ped.data_coleta) : ""].filter(Boolean);
  function receberPorData(lista) {
    const ord = ["locacao", "frete", "montagem", "outro"];
    const linhas = lista.slice().sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)) || String(a.pedido_numero || "").localeCompare(String(b.pedido_numero || ""), "pt-BR", { numeric: true }) || a.parcela - b.parcela || ord.indexOf(a.componente) - ord.indexOf(b.componente));
    if (!linhas.length) return "";
    const total = linhas.reduce((s, t) => s + Number(t.valor), 0), aberto = linhas.reduce((s, t) => s + Number(t.aberto), 0);
    return '<section class="fin-pedido fin-receber-data"><div class="fin-pedido-topo fin-pedido-linha"><strong>Por data</strong><small>' + linhas.length + " parcela(s)" +
      '</small><div class="fin-pedido-tot">Total <b>' + brl(total) + "</b><span>Em aberto <b>" + brl(aberto) + "</b></span></div></div>" +
      '<div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Vencimento</th><th>Pedido · cliente</th><th>Divisão</th><th>Conta (CNPJ · PIX)</th><th class="num">Valor</th><th>Recebido em</th><th>Status</th><th class="num">Falta no pedido</th><th></th></tr></thead><tbody>' +
      linhas.map((t) => {
        const [cls, rot] = statusR(t), ped = t.pedido_id ? S.pedidos[t.pedido_id] : null;
        const quem = (ped ? "<b>Pedido " + esc(ped.numero_pedido || t.pedido_numero) + "</b> · " + esc(ped.cliente_nome || t.cliente_nome || "") : esc(t.descricao || "Lançamento") + (t.cliente_nome ? " · " + esc(t.cliente_nome) : "")) +
          (ped ? '<small class="fin-linha-meta">' + esc(metaPedido(ped).join(" · ")) + "</small>" : "");
        // Nov/2026: parcela embaixo do vencimento e sem a coluna "Recebido" (linha mais fina, mais espaço para pedido · cliente).
        return "<tr><td><b>" + dataBr(t.vencimento) + '</b><small class="fin-parcela-venc">Parcela ' + t.parcela + "/" + t.parcelas + "</small>" + alertaVenc(t) + '</td><td class="fin-quem">' + quem + '</td><td><span class="fin-chip ' + t.componente + '">' + DIV[t.componente] + "</span></td><td>" + contaHtml(t.conta_id) +
          '</td><td class="num">' + brl(t.valor) + (Number(t.recebido) > 0 && Number(t.recebido) < Number(t.valor) ? '<small class="fin-parcial">recebido ' + brl(t.recebido) + "</small>" : "") + "</td>" + recebidoEmHtml(t) + '<td><span class="fin-status ' + cls + '">' + rot + "</span></td>" + faltaNoPedido(t) + acoesR(t) + "</tr>";
      }).join("") + "</tbody></table></div></section>";
  }
  // Pré-reservas como previsão (nov/2026): selo amarelo, sem cobrança, sem link de PIX e sem baixa.
  function previsaoHtml(f) {
    if (["recebidos", "cancelados", "vencidos"].includes(f.status) || f.prazo || f.conta) return "";
    const b = (f.busca || "").trim().toLowerCase();
    const lista = (S.previsoes || []).filter((x) => (!f.div || x.componente === f.div) && (!b || [x.cliente_nome, x.pedido_numero].join(" ").toLowerCase().includes(b)));
    if (!lista.length) return "";
    const grupos = new Map(); lista.forEach((x) => { if (!grupos.has(x.pedido_id)) grupos.set(x.pedido_id, []); grupos.get(x.pedido_id).push(x); });
    const total = lista.reduce((t, x) => t + Number(x.valor || 0), 0);
    return '<details class="fin-previsao"' + (S.previsaoAberta ? " open" : "") + '><summary><span class="fin-pre-selo">Pré-reserva</span><b>Previsão de ' + grupos.size + " pedido(s) em pré-reserva · " + brl(total) + "</b>" +
      '<small>Não são contas a receber: viram cobrança quando o pedido for Reservado.</small></summary>' +
      [...grupos.values()].map((ps) => { const x0 = ps[0];
        return '<article class="fin-previsao-ped"><header><strong>Pedido ' + esc(x0.pedido_numero || "") + " · " + esc(x0.cliente_nome || "") + "</strong>" +
          '<span class="fin-pre-selo">Pré-reserva' + (x0.pre_reserva_ate ? " até " + dataBr(x0.pre_reserva_ate) : "") + "</span>" + (x0.data_evento ? "<small>Evento " + dataBr(x0.data_evento) + "</small>" : "") + "</header>" +
          '<table class="fin-tabela"><thead><tr><th>Vencimento</th><th>Parcela</th><th>Divisão</th><th>Forma</th><th class="num">Valor</th></tr></thead><tbody>' +
          ps.map((x) => "<tr><td>" + (x.vencimento ? dataBr(x.vencimento) : "—") + "</td><td>" + esc(x.parcela || "") + "</td><td>" + esc(DIV[x.componente] || x.componente) + "</td><td>" + esc(x.forma || "") + '</td><td class="num">' + brl(x.valor) + "</td></tr>").join("") +
          "</tbody></table></article>"; }).join("") + "</details>";
  }
  function pintarReceber() {
    const f = S.filtroR, lista = filtrarR(), porData = modoReceber() === "data";
    const grupos = new Map();
    lista.forEach((t) => { const k = t.pedido_id || t.grupo; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(t); });
    const html = porData ? receberPorData(lista) : [...grupos.values()].map((ts) => {
      ts.sort((a, b) => a.parcela - b.parcela || ["locacao", "frete", "montagem", "outro"].indexOf(a.componente) - ["locacao", "frete", "montagem", "outro"].indexOf(b.componente));
      const t0 = ts[0], ped = t0.pedido_id ? S.pedidos[t0.pedido_id] : null;
      const sit = situacaoPedido(t0.pedido_id || t0.grupo), todosDoGrupo = sit.ts, total = sit.total, aberto = sit.aberto;
      const divs = [...new Set(todosDoGrupo.map((x) => x.componente))];
      const dif = ped && Math.abs(Number(ped.valor_total) - total) > 0.05;
      const titulo = ped ? "Pedido " + esc(ped.numero_pedido || t0.pedido_numero) + " · " + esc(ped.cliente_nome || t0.cliente_nome || "") : esc(t0.descricao) + (t0.cliente_nome ? " · " + esc(t0.cliente_nome) : "");
      const sub = ped ? (ped.status_comercial ? '<span class="fin-ped-st">' + esc(ST_PEDIDO[ped.status_comercial] || ped.status_comercial) + "</span>" : "") : esc(t0.documento || "Lançamento manual");
      const meta = ped ? metaPedido(ped) : [];
      const prox = sit.proxima ? "Próxima parcela " + dataBr(sit.proxima.vencimento) + " · " + brl(sit.proxima.aberto) : "Sem parcelas em aberto";
      const resumo = '<div class="fin-ped-resumo">' + (meta.length ? '<span class="fin-ped-meta">' + meta.map(esc).join("<i>·</i>") + "</span>" : "") +
        '<span class="fin-ped-quita">' + barraPago(sit.pct) + "<b>" + sit.pct + "% pago</b><span>" + sit.pagas + " de " + todosDoGrupo.length + " parcela(s) recebidas</span><span>" + esc(prox) + "</span></span>" +
        '<span class="fin-ped-nums"><span>Recebido <b>' + brl(sit.recebido) + "</b></span><span" + (aberto > 0.005 ? ' class="falta"' : "") + ">Falta para quitar <b>" + (aberto > 0.005 ? brl(aberto) : "quitado") + "</b></span>" +
        (sit.vencido > 0.005 ? '<span class="venc">Vencido <b>' + brl(sit.vencido) + "</b></span>" : "") + "</span></div>";
      return '<article class="fin-pedido"><div class="fin-pedido-topo fin-pedido-linha"><strong>' + titulo + "</strong><small>" + sub + '</small><div class="fin-divisoes">' +
        divs.map((d) => { const v = todosDoGrupo.filter((x) => x.componente === d).reduce((s, x) => s + Number(x.valor), 0); return '<span class="fin-chip ' + d + '">' + DIV[d] + " " + brl(v) + "</span>"; }).join("") +
        (dif ? '<span class="fin-alerta-dif" title="As parcelas somam ' + brl(total) + " e o pedido está em " + brl(ped.valor_total) + '">As parcelas somam ' + brl(total) + " e o pedido está em " + brl(ped.valor_total) + "</span>" : "") +
        '</div>' + (ped && aberto > 0.005 ? '<button type="button" class="fin-btn peq claro fin-link-pag" data-link-pag="' + t0.pedido_id + '" title="Pedido digital: o cliente vê o pedido e paga pelo mesmo link">Link do pedido</button>' : "") +
        '<div class="fin-pedido-tot">Total <b>' + brl(total) + "</b></div></div>" + resumo +
        '<div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Parcela</th><th>Divisão</th><th>Conta (CNPJ · PIX)</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Recebido</th><th>Recebido em</th><th>Status</th><th class="num">Falta no pedido</th><th></th></tr></thead><tbody>' +
        ts.map((t) => {
          const [cls, rot] = statusR(t);
          return "<tr><td>" + t.parcela + "/" + t.parcelas + '</td><td><span class="fin-chip ' + t.componente + '">' + DIV[t.componente] + "</span></td><td>" + contaHtml(t.conta_id) +
            "</td><td>" + dataBr(t.vencimento) + alertaVenc(t) + '</td><td class="num">' + brl(t.valor) + '</td><td class="num">' + brl(t.recebido) + "</td>" + recebidoEmHtml(t) + '<td><span class="fin-status ' + cls + '">' + rot + "</span></td>" +
            faltaNoPedido(t) + acoesR(t) + "</tr>";
        }).join("") + "</tbody></table></div></article>";
    }).join("");
    $("finConteudo").innerHTML =
      '<div class="fin-barra-ferr"><input type="search" id="frBusca" placeholder="Buscar cliente, pedido, descrição" value="' + esc(f.busca) + '">' +
      '<select id="frStatus">' + [["abertos", "Em aberto"], ["vencidos", "Vencidos"], ["recebidos", "Recebidos"], ["cancelados", "Cancelados"], ["todos", "Todos"]].map(([v, r]) => '<option value="' + v + '"' + (f.status === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<select id="frDiv"><option value="">Todas as divisões</option>' + Object.entries(DIV).map(([v, r]) => '<option value="' + v + '"' + (f.div === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<select id="frConta"><option value="">Todas as contas</option><option value="sem"' + (f.conta === "sem" ? " selected" : "") + ">Sem conta</option>" + S.contas.map((c) => '<option value="' + c.id + '"' + (f.conta === c.id ? " selected" : "") + ">" + esc(c.nome) + "</option>").join("") + "</select>" +
      '<div class="fin-prazos" role="group" aria-label="Filtrar por vencimento">' + PRAZOS.map(([k, r]) => { const n = S.receber.filter((t) => noPrazo(t, k)).length; return '<button type="button" class="fin-prazo' + (f.prazo === k ? " ativa" : "") + '" data-prazo="' + k + '" aria-pressed="' + (f.prazo === k) + '">' + r + (n ? '<span class="fin-prazo-n">' + n + "</span>" : "") + "</button>"; }).join("") + "</div>" +
      '<span class="fin-esp"></span><button type="button" class="fin-modo-btn" id="frModo" aria-pressed="' + porData + '" title="' + (porData ? "Agrupar por pedido" : "Ver por data, cada parcela numa linha") + '" aria-label="' + (porData ? "Agrupar por pedido" : "Ver por data, cada parcela numa linha") + '">' + (porData ? ICONE_GRUPO : ICONE_LISTA) + '</button>' +
      // "Recebidas": atalho para ver só o que já foi recebido (é o filtro de status "Recebidos"); clicar de novo volta.
      '<button type="button" class="fin-recebidas-btn" id="frRecebidas" aria-pressed="' + (f.status === "recebidos") + '">Recebidas</button>' +
      '<button class="fin-btn" id="frNovo">+ Novo recebimento</button></div>' +
      previsaoHtml(f) +
      (html || '<div class="fin-vazio">Nenhuma conta a receber com esses filtros. Pedido aprovado aparece aqui sozinho, dividido em locação, frete e montagem.</div>');
    const at = () => { const status = $("frStatus").value; S.filtroR = { busca: $("frBusca").value, status, div: $("frDiv").value, conta: $("frConta").value, prazo: status === "abertos" ? S.filtroR.prazo : "" }; pintarReceber(); };
    // clicar de novo na aba escolhida volta a mostrar tudo em aberto
    $("finConteudo").querySelectorAll("[data-prazo]").forEach((b) => b.addEventListener("click", () => { S.filtroR = { ...S.filtroR, status: "abertos", prazo: S.filtroR.prazo === b.dataset.prazo ? "" : b.dataset.prazo }; pintarReceber(); }));
    $("finConteudo").querySelector(".fin-previsao")?.addEventListener("toggle", (e) => { S.previsaoAberta = e.target.open; });
    $("frBusca").addEventListener("change", at); $("frBusca").addEventListener("keydown", (e) => { if (e.key === "Enter") at(); });
    ["frStatus", "frDiv", "frConta"].forEach((id) => $(id).addEventListener("change", at));
    $("frNovo").addEventListener("click", () => novoTitulo("receber"));
    $("frRecebidas").addEventListener("click", () => { S.filtroR = { ...S.filtroR, prazo: "", status: S.filtroR.status === "recebidos" ? "abertos" : "recebidos" }; pintarReceber(); });
    $("frModo").addEventListener("click", () => { S.recModo = porData ? "pedido" : "data"; try { localStorage.setItem("fin_receber_modo", S.recModo); } catch (_) {} pintarReceber(); });
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
          const bloqueadoServico = t.manutencao_confirmada === false;
          const aberto = !["pago", "cancelado"].includes(t.status), aguard = t.requer_aprovacao && t.aprovacao === "pendente";
          return '<tr class="fin-linha-click" data-p-linha="' + t.id + '" tabindex="0" title="Ver detalhes"><td>' + esc(t.fornecedor_nome || "-") + "</td><td>" + esc(t.descricao) + (bloqueadoServico ? '<small class="text-danger" style="display:block;margin-top:5px">Pagar somente após confirmação do serviço em Compras → Serviços.</small>' : t.manutencao_confirmada === true ? '<small style="display:block;margin-top:5px">Serviço confirmado em Compras.</small>' : '') + (t.parcelas > 1 ? " <small>(" + t.parcela + "/" + t.parcelas + ")</small>" : "") + "</td><td>" + esc(c?.nome || "-") +
            "</td><td>" + dataBr(t.vencimento) + "</td><td>" + contaHtml(t.conta_id) + '</td><td class="num">' + brl(t.valor) + '</td><td class="num">' + brl(t.aberto) + '</td><td><span class="fin-status ' + cls + '">' + esc(rot) + "</span></td>" +
            '<td><div class="acoes">' + (aguard ? '<button class="fin-btn peq" data-p-aprovar="' + t.id + '">Aprovar</button><button class="fin-btn peq verm" data-p-reprovar="' + t.id + '">Reprovar</button>' : "") +
            (S.baixaManual?.baixa_manual_pagar && aberto && !aguard && !bloqueadoServico && t.aprovacao !== "reprovada" && Number(t.aberto) > 0.005 ? '<button class="fin-btn peq verde" data-p-baixar="' + t.id + '">Pago</button>' : "") +
            "</div></td></tr>";
        }).join("") + "</tbody></table></div></section>" : '<div class="fin-vazio">Nenhuma conta a pagar com esses filtros.</div>');
    $("finConteudo").querySelectorAll("[data-p-linha]").forEach((tr) => tr.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === tr) { e.preventDefault(); detalhesPagar(tr.dataset.pLinha); } }));
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

  function registrarCredito(cliente, clientes) {
    modal('Registrar crédito do decorador', '<div class="fin-form"><p class="fin-info inteiro">Registre um crédito já reconhecido, como um valor pago a maior. Ele ficará disponível na conta corrente até a devolução. Este lançamento não registra uma nova entrada de dinheiro no caixa.</p>' +
      '<label class="inteiro">Decorador<select name="cliente">' + '<option value="">Escolha o decorador</option>' + clientes.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===cliente?' selected':'')+'>'+esc(c.nome_razao)+'</option>').join('') + '</select></label>' +
      '<label>Origem<select name="tipo"><option value="pagamento_maior">Pagamento a maior</option><option value="adiantamento">Adiantamento</option><option value="ajuste">Ajuste</option><option value="outro">Outro crédito</option></select></label>' +
      '<label>Valor<input name="valor" inputmode="decimal" placeholder="0,00"></label><label>Data<input name="data" type="date" value="'+hoje()+'"></label><label class="inteiro">Observação obrigatória<textarea name="obs" required rows="3" placeholder="Explique a origem do crédito e identifique o pedido ou recebimento"></textarea></label></div>',
      [{rotulo:'Cancelar',classe:'claro',acao:fecharModal},{rotulo:'Registrar crédito',acao:async()=>{
        const d=campos($('finModalCorpo'));
        if(!d.cliente || num(d.valor)<=0 || !d.data || !d.obs.trim()){erroModal('Informe o decorador, valor, data e a observação do crédito.');return;}
        await executar(()=>rpc('fin_cliente_registrar_credito',{p_empresa:S.emp,p_cliente:d.cliente,p_tipo:d.tipo,p_valor:num(d.valor),p_data:d.data,p_obs:d.obs.trim()}),'Crédito registrado na conta corrente.');
      }}]);
  }
  // Registrar recebimento/pagamento à mão saiu (30/out/2026): o reconhecimento é pela conciliação em Bancos
  // ou, se foi em dinheiro, por um lançamento no caixa físico.

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
          (b.estornado_em || b.origem === "conciliacao" ? "" : '<button type="button" class="fin-btn peq verm" data-estornar="' + b.id + '">Estornar</button>') + "</td></tr>").join("") + "</tbody></table>" : '<p class="fin-vazio">Nenhuma baixa.</p>'),
      [t.origem !== 'bv' && t.status !== "cancelado" && Number(rec ? t.recebido : t.pago) === 0 ? { rotulo: "Cancelar título", classe: "verm", acao: () => cancelar(tipo, id) } : null, { rotulo: "Fechar", classe: "claro", acao: fecharModal }].filter(Boolean),
      (corpo) => corpo.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-estornar]"); if (!b) return;
        const motivo = prompt("Motivo do estorno:"); if (!motivo) return;
        await executar(() => rpc("fin_estornar_baixa", { p_empresa: S.emp, p_baixa: b.dataset.estornar, p_motivo: motivo }), "Baixa estornada.");
      }));
  }
  // Detalhes da conta a pagar (nov/2026): abre ao clicar na linha. Mostra de onde veio a conta (pedido do evento,
  // fechamento de frete/Uber/freelancer, BV, compra), a classificação, os pagamentos e as ações (programar, editar,
  // aprovar, cancelar), que saíram da linha da tabela.
  const ORIGEM_P = { manual: "Lançamento manual", compra: "Compra (pedido de compra)", frete: "Fechamento de frete", uber: "Corridas de Uber", free: "Pagamento de freelancer", bv: "BV do decorador", manutencao_predial: "Manutenção predial", conciliacao: "Conciliação bancária", caixa: "Caixa físico" };
  const CUSTO_CAT = { equipe: "Equipe", frete: "Frete", uber: "Uber", terceiros: "Terceiros", personalizacao: "Personalização", reparo: "Reparo", impostos: "Impostos", outros: "Outros" };
  const FECH_PREF = { frete: "FR", uber: "UB", free: "FL" };
  function prazoTexto(t) {
    if (["pago", "cancelado"].includes(t.status) || !t.vencimento) return "";
    const d = Math.round((new Date(t.vencimento + "T12:00:00") - new Date(hoje() + "T12:00:00")) / 864e5);
    if (d === 0) return "vence hoje";
    return d > 0 ? "vence em " + d + (d === 1 ? " dia" : " dias") : "vencido há " + -d + (d === -1 ? " dia" : " dias");
  }
  async function detalhesPagar(id) {
    const t = S.pagar.find((x) => x.id === id);
    if (!t) return;
    const ler = (p) => Promise.resolve(p).then((r) => (r && r.data) || []).catch(() => []);
    const [baixas, custos, fechs, bvs, compras] = await Promise.all([
      ler(S.sb.from("fin_baixas").select("*").eq("empresa_id", S.emp).eq("pagar_id", id).order("data")),
      ler(S.sb.from("fin_custos_evento").select("pedido_id,categoria,descricao,valor,cancelado_em").eq("empresa_id", S.emp).eq("pagar_id", id)),
      ler(S.sb.from("logistica_fechamentos").select("tipo,numero,beneficiario,total,vencimento,obs,status,criado_por_nome,criado_em").eq("empresa_id", S.emp).eq("pagar_id", id)),
      ler(S.sb.from("fin_bv_partes").select("pedido_id,cliente_id,percentual,valor,ativo").eq("empresa_id", S.emp).eq("pagar_id", id)),
      t.origem === "compra" && t.origem_id ? ler(S.sb.from("compras_registros").select("numero,status").eq("id", t.origem_id)) : []
    ]);
    const porPedido = {};
    custos.filter((c) => !c.cancelado_em).forEach((c) => { (porPedido[c.pedido_id] ||= []).push({ rot: CUSTO_CAT[c.categoria] || c.categoria, desc: c.descricao, valor: c.valor }); });
    bvs.filter((b) => b.ativo !== false).forEach((b) => { (porPedido[b.pedido_id] ||= []).push({ rot: "BV", desc: "BV de " + Number(b.percentual || 0).toLocaleString("pt-BR") + "% da locação", valor: b.valor }); });
    const ids = Object.keys(porPedido).filter((x) => !S.pedidos[x]);
    if (ids.length) {
      const peds = await ler(S.sb.from("separacoes_pedidos").select("id,numero_pedido,cliente_nome,tipo_evento,data_evento,data_evento_fim,data_entrega,data_coleta,local_nome,valor_total,status_comercial").in("id", ids));
      peds.forEach((p) => { S.pedidos[p.id] = p; });
    }
    const [cls, rot] = statusP(t), c = cat(t.categoria_id), cc = S.ccs.find((x) => x.id === t.centro_custo_id);
    const aberto = !["pago", "cancelado"].includes(t.status), aguard = t.requer_aprovacao && t.aprovacao === "pendente" && t.status !== "cancelado";
    const bloqueado = t.manutencao_confirmada === false;
    const pago = Number(t.pago) || 0, pct = Number(t.valor) > 0 ? Math.min(100, Math.round((pago / Number(t.valor)) * 100)) : 0;
    const prazo = prazoTexto(t), info = (r, v) => (v ? '<div class="fpd-info"><span>' + r + "</span><b>" + v + "</b></div>" : "");
    const pedidosHtml = Object.entries(porPedido).map(([pid, itens]) => {
      const p = S.pedidos[pid] || {};
      const evento = p.data_evento ? dataBr(p.data_evento) + (p.data_evento_fim && p.data_evento_fim !== p.data_evento ? " a " + dataBr(p.data_evento_fim) : "") : "";
      const dados = [p.tipo_evento && ["Evento", esc(p.tipo_evento)], evento && ["Data", evento], p.local_nome && ["Local", esc(p.local_nome)], p.data_entrega && ["Entrega", dataBr(p.data_entrega)], p.data_coleta && ["Coleta", dataBr(p.data_coleta)]].filter(Boolean);
      return '<article class="fpd-pedido"><header><div><span class="fpd-selo">Pedido ' + esc(p.numero_pedido || "—") + "</span><strong>" + esc(p.cliente_nome || "Pedido") + "</strong></div>" +
        '<a class="fpd-abrir" href="../Comercial/Pedidos/pedido.html?pedido=' + encodeURIComponent(pid) + '&modo=editar">Abrir pedido →</a></header>' +
        (dados.length ? '<div class="fpd-ped-dados">' + dados.map(([a, b]) => "<div><span>" + a + "</span><b>" + b + "</b></div>").join("") + "</div>" : "") +
        '<ul class="fpd-custos">' + itens.map((i) => "<li><span>" + esc(i.rot) + "</span><em>" + esc(i.desc || "") + "</em><b>" + brl(i.valor) + "</b></li>").join("") + "</ul></article>";
    }).join("");
    const fechHtml = fechs.map((f) => '<div class="fpd-fech"><span class="fpd-selo claro">' + (FECH_PREF[f.tipo] || "FC") + "-" + String(f.numero).padStart(4, "0") + "</span><div><b>" + esc(f.beneficiario) + "</b><small>Fechado" + (f.criado_por_nome ? " por " + esc(f.criado_por_nome) : "") + (f.criado_em ? " em " + dataBr(f.criado_em) : "") + (f.obs ? " · " + esc(f.obs) : "") + "</small></div><b>" + brl(f.total) + "</b></div>").join("");
    const comp = compras[0];
    const compraHtml = comp ? '<div class="fpd-fech"><span class="fpd-selo claro">PC-' + String(comp.numero).padStart(4, "0") + "</span><div><b>Pedido de compra</b><small>Situação: " + esc(comp.status || "-") + "</small></div></div>" : "";
    const origemHtml = fechHtml + compraHtml + pedidosHtml;
    const baixasHtml = baixas.length ? '<ul class="fpd-linha-tempo">' + baixas.map((b) => '<li class="' + (b.estornado_em ? "estornada" : "") + '"><i></i><div><b>' + brl(b.valor) + "</b> em " + dataBr(b.data) + "<small>" + esc(conta(b.conta_id)?.nome || "Sem conta") + " · " + esc({ manual: "Manual", gateway: "PIX do gateway", conciliacao: "Extrato do banco" }[b.origem] || b.origem || "") + (b.estornado_em ? " · estornada" : "") + "</small></div>" +
      (b.estornado_em || b.origem === "conciliacao" ? "" : '<button type="button" class="fin-btn peq verm" data-estornar="' + b.id + '">Estornar</button>') + "</li>").join("") + "</ul>" : '<p class="fpd-vazio">Nenhum pagamento registrado. O pagamento é reconhecido pela conciliação em Bancos.</p>';
    const corpo =
      '<div class="fpd">' +
      '<section class="fpd-topo"><div class="fpd-quem"><span class="fpd-origem">' + esc(ORIGEM_P[t.origem] || t.origem || "Lançamento") + "</span><h4>" + esc(t.fornecedor_nome || "Sem fornecedor") + "</h4><p>" + esc(t.descricao) + (t.parcelas > 1 ? " · parcela " + t.parcela + " de " + t.parcelas : "") + '</p><span class="fin-status ' + cls + '">' + esc(rot) + "</span></div>" +
      '<div class="fpd-valor"><span>' + (aberto ? "Em aberto" : "Valor") + "</span><strong>" + brl(aberto ? t.aberto : t.valor) + "</strong><small>Vencimento " + dataBr(t.vencimento) + (prazo ? ' · <em class="' + (prazo.startsWith("vencido") ? "atraso" : "") + '">' + prazo + "</em>" : "") + "</small>" +
      '<div class="fpd-barra" title="' + pct + '% pago"><i style="width:' + pct + '%"></i></div><small>' + brl(pago) + " pago de " + brl(t.valor) + "</small></div></section>" +
      (bloqueado ? '<p class="fpd-alerta">Pagar somente depois da confirmação do serviço em Compras → Serviços.</p>' : "") +
      (aguard ? '<p class="fpd-alerta amarelo">Esta conta precisa de aprovação antes de ser paga.</p>' : "") +
      (t.aprovacao === "reprovada" ? '<p class="fpd-alerta">Reprovada' + (t.aprovacao_obs ? ": " + esc(t.aprovacao_obs) : "") + "</p>" : "") +
      (origemHtml ? '<section class="fpd-bloco"><h5>De onde vem esta conta</h5>' + origemHtml + "</section>" : "") +
      '<section class="fpd-bloco"><h5>Informações</h5><div class="fpd-grade">' +
      info("Documento", esc(t.documento || "")) + info("Forma de pagamento", esc(t.forma || "")) + info("Conta que paga", esc(conta(t.conta_id)?.nome || "")) +
      info("Categoria", esc(c?.nome || "")) + info("Centro de custo", esc(cc?.nome || "")) + info("Programado para", t.programado_para ? dataBr(t.programado_para) : "") +
      info("Emissão", t.emissao ? dataBr(t.emissao) : "") + info("Competência", t.competencia ? dataBr(t.competencia) : "") +
      info("Aprovação", t.requer_aprovacao ? ({ pendente: "Aguardando", aprovada: "Aprovada" + (t.aprovado_em ? " em " + dataBr(t.aprovado_em) : ""), reprovada: "Reprovada" }[t.aprovacao] || "") : "") +
      info("Lançado em", t.created_at ? dataBr(t.created_at) : "") +
      "</div>" + (t.codigo_barras ? '<div class="fpd-codigo"><span>Código de barras</span><code>' + esc(t.codigo_barras) + '</code><button type="button" class="fin-btn peq claro" data-copiar-cb>Copiar</button></div>' : "") +
      (t.observacoes ? '<div class="fpd-obs"><span>Observações</span><p>' + esc(t.observacoes) + "</p></div>" : "") +
      (t.cancelamento_motivo ? '<div class="fpd-obs"><span>Cancelamento</span><p>' + esc(t.cancelamento_motivo) + "</p></div>" : "") + "</section>" +
      '<section class="fpd-bloco"><h5>Pagamentos</h5>' + baixasHtml + "</section></div>";
    const botoes = [
      t.origem !== "bv" && t.status !== "cancelado" && pago === 0 ? { rotulo: "Cancelar conta", classe: "verm", acao: () => cancelar("pagar", id) } : null,
      aguard ? { rotulo: "Reprovar", classe: "verm", acao: () => { fecharModal(); aprovar(id, false); } } : null,
      aguard ? { rotulo: "Aprovar", acao: () => { fecharModal(); aprovar(id, true); } } : null,
      aberto && !aguard && !bloqueado && t.aprovacao !== "reprovada" ? { rotulo: "Programar pagamento", classe: "claro", acao: () => programar(id) } : null,
      S.baixaManual?.baixa_manual_pagar && aberto && !aguard && !bloqueado && t.aprovacao !== "reprovada" ? { rotulo: "Marcar como pago", classe: "verde", acao: () => { fecharModal(); baixar("pagar", id); } } : null,
      t.status !== "cancelado" ? { rotulo: "Editar", classe: "claro", acao: () => editarTitulo("pagar", id) } : null,
      { rotulo: "Fechar", classe: "claro", acao: fecharModal }
    ].filter(Boolean);
    modal("Conta a pagar", corpo, botoes, (cx) => cx.addEventListener("click", async (e) => {
      if (e.target.closest("[data-copiar-cb]")) { try { await navigator.clipboard.writeText(t.codigo_barras); avisar("Código copiado.", "Financeiro", "sucesso"); } catch (_) {} return; }
      const b = e.target.closest("[data-estornar]"); if (!b) return;
      const motivo = prompt("Motivo do estorno:"); if (!motivo) return;
      await executar(() => rpc("fin_estornar_baixa", { p_empresa: S.emp, p_baixa: b.dataset.estornar, p_motivo: motivo }), "Baixa estornada.");
    }));
    $("finModal").classList.add("fin-modal-detalhe");
  }
  // Baixa manual (nov/2026): só aparece com a opção ligada em Parâmetros > Financeiro; o banco confere de novo (fin_baixar).
  function baixar(tipo, id) {
    const t = (tipo === "receber" ? S.receber : S.pagar).find((x) => x.id === id);
    if (!t) return;
    const rec = tipo === "receber";
    modal(rec ? "Marcar como recebido" : "Marcar como pago",
      '<div class="fin-form"><p class="fin-info">' + esc(rec ? (t.pedido_numero ? "Pedido " + t.pedido_numero + " · " : "") + (DIV[t.componente] || "") + " · " + (t.cliente_nome || "") : (t.fornecedor_nome || "") + " · " + t.descricao) + " — em aberto <b>" + brl(t.aberto) + "</b></p>" +
      '<p class="fin-info fin-aviso-baixa">Baixa manual, sem a conciliação: quando o extrato do banco chegar, ignore a linha deste valor na conciliação para não contar duas vezes.</p>' +
      '<label>Data<input type="date" name="data" max="' + hoje() + '" value="' + hoje() + '"></label>' +
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
        if (!(num(d.valor) > 0)) return erroModal("Informe o valor.");
        await executar(() => rpc("fin_baixar", { p_empresa: S.emp, p_tipo: tipo, p_id: id, p_data: d.data, p_valor: num(d.valor), p_juros: num(d.juros), p_multa: num(d.multa), p_desconto: num(d.desconto), p_tarifa: num(d.tarifa), p_conta: d.conta, p_forma: d.forma || null, p_obs: d.obs || null }), rec ? "Recebimento registrado." : "Pagamento registrado.");
      } }]);
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
  // Cadastro das contas: mora dentro da aba Bancos ("Configurar contas"), desenhado em `alvo`.
  function pintarContas(alvo = $("finConteudo")) {
    const cfg = S.cfg || {};
    alvo.innerHTML =
      '<section class="fin-bloco"><h3>Para onde vai o dinheiro do pedido <small>cada parte do pedido entra numa conta (CNPJ e PIX)</small></h3><div class="fin-padroes">' +
      [["conta_locacao", "Locação"], ["conta_frete", "Frete"], ["conta_montagem", "Montagem"], ["conta_gateway", "PIX recebido pelo gateway (opcional)"]].map(([k, r]) =>
        '<label class="fin-form" style="display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:#5f5b54">' + r + '<select data-cfg="' + k + '" style="height:40px;border:1px solid #e1dbcf;border-radius:10px;padding:0 12px">' + opcoesContas(cfg[k], k === "conta_gateway" ? "Mesma conta da parte" : "Sem conta") + "</select></label>").join("") +
      '<div><button class="fin-btn" id="fcSalvarCfg">Salvar</button></div></div>' +
      '<p class="fin-info" style="margin-top:12px">Ao salvar, as partes de pedido ainda em aberto (e sem conta escolhida à mão) passam a usar essas contas. Em cada conta a receber dá para trocar a conta pelo botão Editar.</p></section>' +
      '<div class="fin-barra-ferr"><span class="fin-esp"></span><button class="fin-btn claro" id="fcTransf">Transferir entre contas</button><button class="fin-btn claro" id="fcAjuste">Ajustar saldo</button><button class="fin-btn" id="fcNova">+ Nova conta</button></div>' +
      (S.contas.length ? '<div class="fin-contas-grade">' + S.contas.map((c) => {
        const s = S.saldos[c.id] || 0;
        return '<article class="fin-conta' + (c.ativo ? "" : " inativa") + '"><h4 class="fin-conta-tit">' + logoContaHtml(c) + esc(c.nome) + "</h4>" +
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
  const logoContaHtml = (c, cls = "") => '<span class="fin-logo-conta ' + cls + '">' + (c.logo_url ? '<img src="' + esc(c.logo_url) + '" alt="">' : esc(iniciaisConta(c.nome))) + "</span>";
  const iniciaisConta = (nome) => String(nome || "").replace(/^conta\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "C";
  // Foto escolhida → PNG de no máximo 256px (mantém o fundo transparente do logo).
  function logoPng(arquivo) {
    if (arquivo.size > 5 * 1024 * 1024) return Promise.reject(new Error("Imagem grande demais (até 5 MB)."));
    return new Promise((ok, falha) => {
      const img = new Image(), url = URL.createObjectURL(arquivo);
      img.onload = () => {
        const lado = 256, esc2 = Math.min(1, lado / Math.max(img.naturalWidth || lado, img.naturalHeight || lado));
        const w = Math.max(1, Math.round((img.naturalWidth || lado) * esc2)), h = Math.max(1, Math.round((img.naturalHeight || lado) * esc2));
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        cv.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível ler a imagem."))), "image/png");
      };
      img.onerror = () => { URL.revokeObjectURL(url); falha(new Error("Não foi possível ler a imagem.")); };
      img.src = url;
    });
  }
  function editarConta(id) {
    const c = id ? conta(id) : { tipo: "corrente", ativo: true, saldo_inicial: 0, saldo_minimo: 0, saldo_inicial_data: hoje() };
    // foto da conta (logo do banco): escolhida aqui, enviada ao salvar (bucket empresas-logos, pasta <empresa>/bancos/)
    let logo = { url: c.logo_url || "", arquivo: null, remover: false };
    modal(id ? "Editar conta" : "Nova conta",
      '<div class="fin-form">' +
      '<div class="inteiro fin-logo-campo"><span class="fin-logo-prev" id="fcLogoPrev"></span><div><b>Foto da conta</b><small>Logo do banco, para reconhecer a conta na lista (PNG, JPG ou SVG).</small>' +
      '<div class="fin-logo-acoes"><label class="fin-btn peq claro" style="cursor:pointer">Escolher foto<input type="file" id="fcLogoArq" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label><button type="button" class="fin-btn peq verm" id="fcLogoTirar">Remover</button></div></div></div>' +
      '<label class="inteiro">Nome da conta<input name="nome" value="' + esc(c.nome || "") + '" placeholder="Ex.: Chiavari Locações · Itaú"></label>' +
      '<label>Tipo<select name="tipo">' + Object.entries(TIPOS_CONTA).map(([v, r]) => '<option value="' + v + '"' + (c.tipo === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select></label>" +
      '<label>Banco<input name="banco" value="' + esc(c.banco || "") + '"></label>' +
      '<label>Agência<input name="agencia"></label>' +
      '<label>Conta<input name="conta"></label>' +
      '<p class="fin-sub">Titular e PIX</p>' +
      '<label>Titular (razão social)<input name="titular_nome" value="' + esc(c.titular_nome || "") + '"></label>' +
      '<label>CNPJ / CPF<input name="titular_documento" data-mascara="cpfcnpj"></label>' +
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
          const contaId = id || data?.id;
          if (contaId && (logo.arquivo || logo.remover)) {
            let url = null;
            if (logo.arquivo) {
              const caminho = S.emp + "/bancos/" + contaId + "-" + Date.now() + ".png";
              const up = await S.sb.storage.from("empresas-logos").upload(caminho, logo.arquivo, { contentType: "image/png", upsert: true });
              if (up.error) throw new Error("A conta foi salva, mas a foto não subiu: " + up.error.message);
              url = S.sb.storage.from("empresas-logos").getPublicUrl(caminho).data.publicUrl;
            }
            const r = await S.sb.from("fin_contas").update({ logo_url: url }).eq("id", contaId).eq("empresa_id", S.emp);
            if (r.error) throw new Error("A conta foi salva, mas a foto não: " + r.error.message);
          }
        }, "Conta salva.");
      } }], (corpo) => {
        const prev = corpo.querySelector("#fcLogoPrev");
        const pintarLogo = () => { prev.innerHTML = logo.url ? '<img src="' + esc(logo.url) + '" alt="">' : esc(iniciaisConta(c.nome || "Conta")); corpo.querySelector("#fcLogoTirar").hidden = !logo.url; };
        pintarLogo();
        corpo.querySelector("#fcLogoArq").addEventListener("change", async (e) => {
          const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
          try { logo.arquivo = await logoPng(f); logo.url = URL.createObjectURL(logo.arquivo); logo.remover = false; pintarLogo(); }
          catch (er) { erroModal(er.message || "Não foi possível ler a imagem."); }
        });
        corpo.querySelector("#fcLogoTirar").addEventListener("click", () => { logo = { url: "", arquivo: null, remover: true }; pintarLogo(); });
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
  // Conciliação = Clara, a assistente financeira (financeiro-clara.js).
  const ctxClara = () => ({ pintarContas, logoContaHtml, S, rpc, brl, esc, dataBr, avisar, confirmar, modal, fecharModal, erroModal, campos, carregar, recarregar, todos, lerOfx, opcoesCats, opcoesCcs });
  async function pintarConciliacao() {
    if (!window.FinanceiroClara) { $("finConteudo").innerHTML = '<div class="fin-vazio">A assistente não carregou. Recarregue a página.</div>'; return; }
    await window.FinanceiroClara.render(ctxClara());
  }


  // ---------------------------------------------------------------- DRE
  async function pintarDre() {
    if (!S.dre.ini) { const d = new Date(); S.dre.ini = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); S.dre.fim = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); }
    if (S.dre.modo === "centros") return pintarDreCentros();
    // uma linha por categoria e centro de custo; categoria com mais de um centro ganha uma linha de subtotal
    const linhas = await rpc("fin_dre_centros", { p_empresa: S.emp, p_ini: S.dre.ini, p_fim: S.dre.fim });
    const ent = linhas.filter((l) => l.tipo === "entrada"), sai = linhas.filter((l) => l.tipo !== "entrada");
    const soma = (l, k) => l.reduce((s, x) => s + Number(x[k] || 0), 0);
    const nomeCat = (x) => (x.codigo ? x.codigo + " " : "") + (x.categoria || "Sem categoria");
    const semCentro = (x) => !x.centro_id;
    const ccTd = (x) => "<td" + (semCentro(x) ? ' class="fin-dre-semcc"' : "") + ">" + esc(x.centro || "Sem centro de custo") + "</td>";
    // despesas aparecem negativas (e ficam vermelhas pelo colorirValores)
    const bloco = (rot, l, sinal = 1) => {
      const cats = [...new Map(l.map((x) => [x.categoria_id || "-", x])).keys()];
      const pct = (v) => { const base = soma(ent, "previsto"); return base ? Math.round((v / base) * 1000) / 10 : null; };
      return '<tr class="grupo"><td>' + rot + '</td><td></td><td class="num">' + brl(sinal * soma(l, "previsto")) + '</td><td class="num">' + brl(sinal * soma(l, "realizado")) + "</td></tr>" +
        cats.map((id) => {
          const g = l.filter((x) => (x.categoria_id || "-") === id).sort((a, b) => String(a.centro).localeCompare(String(b.centro)));
          const p = pct(soma(g, "previsto"));
          const cat = esc(nomeCat(g[0])) + (p != null ? ' <small class="fin-dre-pct" title="Parte das receitas previstas">' + String(p).replace(".", ",") + "%</small>" : "");
          if (g.length === 1) return "<tr><td>" + cat + "</td>" + ccTd(g[0]) + '<td class="num">' + brl(sinal * Number(g[0].previsto || 0)) + '</td><td class="num">' + brl(sinal * Number(g[0].realizado || 0)) + "</td></tr>";
          return '<tr class="fin-dre-cat"><td>' + cat + '</td><td class="fin-dre-semcc">' + g.length + " centros</td>" + '<td class="num">' + brl(sinal * soma(g, "previsto")) + '</td><td class="num">' + brl(sinal * soma(g, "realizado")) + "</td></tr>" +
            g.map((x) => '<tr class="fin-dre-sub"><td></td>' + ccTd(x) + '<td class="num">' + brl(sinal * Number(x.previsto || 0)) + '</td><td class="num">' + brl(sinal * Number(x.realizado || 0)) + "</td></tr>").join("");
        }).join("");
    };
    const faltaCc = linhas.filter(semCentro).length;
    $("finConteudo").innerHTML =
      barraDre() +
      '<section class="fin-bloco"><h3>DRE por competência <small>previsto = títulos · realizado = recebido/pago · % = parte das receitas previstas</small></h3>' +
      (faltaCc ? '<div class="cl-aviso">' + faltaCc + ' linha(s) sem centro de custo. Defina o centro de cada categoria no Plano de contas, ou use "Organizar com a Clara".</div>' : "") +
      (linhas.length ? '<table class="fin-tabela fin-dre"><thead><tr><th>Categoria</th><th>Centro de custo</th><th class="num">Previsto</th><th class="num">Realizado</th></tr></thead><tbody>' +
      bloco("Receitas", ent) + bloco("Despesas", sai, -1) +
      '<tr class="total"><td>Resultado</td><td></td><td class="num">' + brl(soma(ent, "previsto") - soma(sai, "previsto")) + '</td><td class="num">' + brl(soma(ent, "realizado") - soma(sai, "realizado")) + "</td></tr></tbody></table>" : '<div class="fin-vazio">Nada no período.</div>') + "</section>";
    ligarBarraDre();
  }
  function barraDre() {
    return '<div class="fin-barra-ferr"><label>De <input type="date" id="fdIni" value="' + S.dre.ini + '"></label><label>Até <input type="date" id="fdFim" value="' + S.dre.fim + '"></label><button class="fin-btn claro" id="fdOk">Atualizar</button>' +
      '<div class="cl-dre-modo" role="group" aria-label="Ver por">' + [["categorias", "Por categoria"], ["centros", "Por centro de custo"]].map(([k, t]) => '<button type="button" data-dre-modo="' + k + '" class="' + ((S.dre.modo || "categorias") === k ? "ativa" : "") + '">' + t + "</button>").join("") + "</div>" +
      '<span class="fin-esp"></span><button class="fin-btn" id="fdClara"><span class="cl-av mini">C</span> Organizar com a Clara</button></div>';
  }
  function ligarBarraDre() {
    $("fdOk").addEventListener("click", () => { S.dre = { ...S.dre, ini: $("fdIni").value, fim: $("fdFim").value }; pintarDre(); });
    document.querySelectorAll("[data-dre-modo]").forEach((b) => b.addEventListener("click", () => { S.dre.modo = b.dataset.dreModo; pintarDre(); }));
    $("fdClara").addEventListener("click", () => window.FinanceiroClara?.organizarDre(ctxClara()));
  }
  async function pintarDreCentros() {
    const linhas = await rpc("fin_dre_centros", { p_empresa: S.emp, p_ini: S.dre.ini, p_fim: S.dre.fim });
    const centros = [...new Map(linhas.map((l) => [l.centro_id || "-", l.centro])).entries()];
    const soma = (l, k) => l.reduce((s, x) => s + Number(x[k] || 0), 0);
    $("finConteudo").innerHTML = barraDre() + (linhas.length ? '<div class="cl-dre-centros">' + centros.map(([id, nome]) => {
      const l = linhas.filter((x) => (x.centro_id || "-") === id), ent = l.filter((x) => x.tipo === "entrada"), sai = l.filter((x) => x.tipo !== "entrada");
      const res = soma(ent, "realizado") - soma(sai, "realizado");
      const lin = (x) => "<tr><td>" + esc((x.codigo ? x.codigo + " " : "") + x.categoria) + '</td><td class="num">' + brl(x.tipo === "entrada" ? x.previsto : -x.previsto) + '</td><td class="num">' + brl(x.tipo === "entrada" ? x.realizado : -x.realizado) + "</td></tr>";
      return '<section class="fin-bloco' + (id === "-" ? " cl-sem-centro" : "") + '"><h3>' + esc(nome) + ' <small>resultado realizado <b>' + brl(res) + "</b></small></h3>" +
        '<table class="fin-tabela fin-dre"><thead><tr><th>Categoria</th><th class="num">Previsto</th><th class="num">Realizado</th></tr></thead><tbody>' + ent.map(lin).join("") + sai.map(lin).join("") +
        '<tr class="total"><td>Resultado</td><td class="num">' + brl(soma(ent, "previsto") - soma(sai, "previsto")) + '</td><td class="num">' + brl(res) + "</td></tr></tbody></table>" +
        (id === "-" ? '<p class="cl-dica">Estes lançamentos ainda não têm centro de custo. Use "Organizar com a Clara".</p>' : "") + "</section>";
    }).join("") + "</div>" : '<div class="fin-vazio">Nada no período.</div>');
    ligarBarraDre();
  }

  // ---------------------------------------------------------------- plano de contas
  function pintarPlano() {
    const arv = (tipo) => {
      const raiz = S.cats.filter((c) => c.tipo === tipo && !c.pai_id);
      return raiz.map((r) => linhaCat(r, 0) + S.cats.filter((c) => c.pai_id === r.id).map((f) => linhaCat(f, 1)).join("")).join("");
    };
    $("finConteudo").innerHTML = '<div class="fin-grade fin-grade-plano"><section class="fin-bloco"><h3>Plano de contas <button class="fin-btn peq" id="fpcNova">+ Categoria</button></h3><p class="cl-dica">O centro de custo de cada categoria vale para os títulos que não têm centro próprio, na DRE e no extrato.</p><table class="fin-tabela fin-plano"><thead><tr><th>Categoria</th><th>Centro de custo</th><th title="Para o ponto de equilíbrio no Gerencial">Fixo ou variável</th><th></th></tr></thead><tbody>' +
      '<tr class="grupo"><td colspan="4">Entradas</td></tr>' + arv("entrada") + '<tr class="grupo"><td colspan="4">Saídas</td></tr>' + arv("saida") + "</tbody></table></section>" +
      '<section class="fin-bloco"><h3>Centros de custo <button class="fin-btn peq" id="fpcCc">+ Centro de custo</button></h3><table class="fin-tabela"><tbody>' +
      S.ccs.map((c) => "<tr" + (c.ativo ? "" : ' style="opacity:.5"') + "><td>" + esc((c.codigo ? c.codigo + " · " : "") + c.nome) + '</td><td class="num"><button class="fin-btn peq claro" data-cc-tog="' + c.id + '">' + (c.ativo ? "Desativar" : "Ativar") + "</button></td></tr>").join("") + "</tbody></table></section></div>";
    $("finConteudo").querySelectorAll("[data-cat-nat]").forEach((sel) => sel.addEventListener("change", async () => {
      const id = sel.dataset.catNat, v = sel.value || null;
      const r = await S.sb.from("fin_categorias").update({ natureza: v }).eq("id", id).eq("empresa_id", S.emp);
      if (r.error) { avisar(r.error.message || "Não foi possível salvar.", "Financeiro", "erro"); return; }
      const c = S.cats.find((x) => x.id === id); if (c) c.natureza = v;
      avisar("Categoria marcada como " + (v === "variavel" ? "variável" : v === "fixo" ? "fixa" : "automática") + ".", "Financeiro", "sucesso");
      pintarPlano();
    }));
    $("finConteudo").querySelectorAll("[data-cat-cc]").forEach((sel) => sel.addEventListener("change", async () => {
      const id = sel.dataset.catCc, v = sel.value || null;
      const r = await S.sb.from("fin_categorias").update({ centro_custo_id: v }).eq("id", id).eq("empresa_id", S.emp);
      if (r.error) { avisar(r.error.message || "Não foi possível salvar.", "Financeiro", "erro"); return; }
      const c = S.cats.find((x) => x.id === id); if (c) c.centro_custo_id = v;
      avisar("Centro de custo da categoria salvo.", "Financeiro", "sucesso");
    }));
    $("fpcNova").addEventListener("click", () => {
      modal("Nova categoria", '<div class="fin-form"><label>Tipo<select name="tipo"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label><label>Código<input name="codigo" placeholder="Ex.: 4.4"></label><label class="inteiro">Nome<input name="nome"></label><label class="inteiro">Dentro de<select name="pai_id"><option value="">(principal)</option>' + S.cats.filter((c) => !c.pai_id).map((c) => '<option value="' + c.id + '">' + esc(c.codigo + " " + c.nome) + "</option>").join("") + "</select></label></div>",
        [{ rotulo: "Cancelar", classe: "claro", acao: fecharModal }, { rotulo: "Salvar", acao: async () => { const d = campos($("finModalCorpo")); if (!d.nome.trim()) return erroModal("Informe o nome."); await executar(async () => { const r = await S.sb.from("fin_categorias").insert({ empresa_id: S.emp, tipo: d.tipo, codigo: d.codigo || null, nome: d.nome.trim(), pai_id: d.pai_id || null, ordem: 100 }); if (r.error) throw r.error; }, "Categoria criada."); } }]);
    });
    $("fpcCc").addEventListener("click", () => {
      modal("Novo centro de custo", '<div class="fin-form"><label>Código<input name="codigo"></label><label>Nome<input name="nome"></label></div>',
        [{ rotulo: "Cancelar", classe: "claro", acao: fecharModal }, { rotulo: "Salvar", acao: async () => { const d = campos($("finModalCorpo")); if (!d.nome.trim()) return erroModal("Informe o nome."); await executar(async () => { const r = await S.sb.from("fin_centros_custo").insert({ empresa_id: S.emp, codigo: d.codigo || null, nome: d.nome.trim() }); if (r.error) throw r.error; }, "Centro de custo criado."); } }]);
    });
  }
  // Fixo ou variável (ponto de equilíbrio do Gerencial). "Automático" mostra o que vale hoje (regra em financeiro-gerencial.js).
  function naturezaSelect(c) {
    if (c.tipo === "entrada") return '<span class="fin-dre-semcc">—</span>';
    const auto = window.FinanceiroGerencial?.naturezaDe ? window.FinanceiroGerencial.naturezaDe({ ...c, natureza: null }, S.cats) : "fixo";
    const op = (v, t) => '<option value="' + v + '"' + ((c.natureza || "") === v ? " selected" : "") + ">" + t + "</option>";
    return '<select class="fin-cat-cc fin-cat-nat" data-cat-nat="' + c.id + '" aria-label="Fixo ou variável: ' + esc(c.nome) + '">' +
      op("", "Automático (" + (auto === "variavel" ? "variável" : "fixo") + ")") + op("fixo", "Fixo") + op("variavel", "Variável") + "</select>";
  }
  const linhaCat = (c, nivel) => "<tr" + (c.ativo ? "" : ' style="opacity:.5"') + '><td style="padding-left:' + (10 + nivel * 22) + 'px">' + esc((c.codigo ? c.codigo + " " : "") + c.nome) + (c.chave ? ' <small style="color:#8a6c48">automática</small>' : "") + '</td><td><select class="fin-cat-cc" data-cat-cc="' + c.id + '" aria-label="Centro de custo de ' + esc(c.nome) + '"><option value="">— nenhum —</option>' +
    S.ccs.filter((x) => x.ativo || x.id === c.centro_custo_id).map((x) => '<option value="' + x.id + '"' + (x.id === c.centro_custo_id ? " selected" : "") + ">" + esc(x.nome) + "</option>").join("") + '</select></td><td>' + naturezaSelect(c) + '</td><td class="num"><button class="fin-btn peq claro" data-cat-tog="' + c.id + '">' + (c.ativo ? "Desativar" : "Ativar") + "</button></td></tr>";

  // ---------------------------------------------------------------- eventos
  function ligar() {
    $("finAbas").addEventListener("click", (e) => { const b = e.target.closest("[data-aba]"); if (!b) return; S.aba = b.dataset.aba; pintar(); });
    $("finSubAbas")?.addEventListener("click", (e) => { const b = e.target.closest("[data-subaba]"); if (!b || b.dataset.subaba === S.aba) return; S.aba = b.dataset.subaba; pintar(); });
    $("finModalRodape").addEventListener("click", (e) => { const b = e.target.closest("[data-bt]"); if (!b) return; aoConfirmar?.[Number(b.dataset.bt)]?.acao(); });
    $("finModal").addEventListener("click", (e) => { if (e.target.closest("[data-fechar]")) fecharModal(); });
    $("finConteudo").addEventListener("click", async (e) => {
      const linhaP = !e.target.closest("button, a, input, select, label") && e.target.closest("[data-p-linha]");
      if (linhaP) { detalhesPagar(linhaP.dataset.pLinha); return; }
      const b = e.target.closest("button"); if (!b) return;
      const d = b.dataset;
      if (d.linkPag) { const p = S.pedidos[d.linkPag] || {}; window.EasyLocLinkPagamento?.abrir({ empresaId: S.emp, pedidoId: d.linkPag, numero: p.numero_pedido || "", cliente: p.cliente_nome || "", telefone: p.telefone || "" }); }
      else if (d.rBaixar) baixar("receber", d.rBaixar);
      else if (d.pBaixar) baixar("pagar", d.pBaixar);
      else if (d.rEditar) editarTitulo("receber", d.rEditar);
      else if (d.rVer) detalhes("receber", d.rVer);
      else if (d.pEditar) editarTitulo("pagar", d.pEditar);
      else if (d.pVer) detalhesPagar(d.pVer);
      else if (d.pAprovar) aprovar(d.pAprovar, true);
      else if (d.pReprovar) aprovar(d.pReprovar, false);
      else if (d.pProgramar) programar(d.pProgramar);
      else if (d.cEditar) editarConta(d.cEditar);
      else if (d.catTog) { const c = cat(d.catTog); const r = await S.sb.from("fin_categorias").update({ ativo: !c.ativo }).eq("id", c.id).eq("empresa_id", S.emp); if (r.error) avisar(r.error.message); await recarregar(); }
      else if (d.ccTog) { const c = S.ccs.find((x) => x.id === d.ccTog); const r = await S.sb.from("fin_centros_custo").update({ ativo: !c.ativo }).eq("id", c.id).eq("empresa_id", S.emp); if (r.error) avisar(r.error.message); await recarregar(); }
    });
  }

  // Cor dos valores no Financeiro inteiro (out/2026): todo valor em reais que aparece sozinho num elemento
  // ("R$ 1.200,00", "-R$ 50,00") fica verde se positivo e vermelho se negativo; zero fica como está. Vale para todas as
  // abas (inclusive as desenhadas em outros arquivos) porque roda sempre que o conteúdo muda.
  const VALOR_BRL = /^[-−–]?\s*R\$\s*[-−–]?\s*\d{1,3}(\.\d{3})*,\d{2}$/;
  function colorirValores(raiz) {
    if (!raiz) return;
    raiz.querySelectorAll("td, th, strong, b, span, small, div, p").forEach((el) => {
      if (el.children.length || el.closest("button, select, option, .fin-chip, .fin-status, .fin-ped-nums, .fin-falta")) return;
      const t = el.textContent.replace(/ /g, " ").trim();
      if (!VALOR_BRL.test(t)) { el.classList.remove("fin-valor-pos", "fin-valor-neg"); return; }
      const negativo = /[-−–]/.test(t), zero = !/[1-9]/.test(t);
      el.classList.toggle("fin-valor-neg", negativo && !zero);
      el.classList.toggle("fin-valor-pos", !negativo && !zero);
    });
  }
  let coloracaoAgendada = 0;
  function vigiarValores() {
    const raiz = $("finConteudo"); if (!raiz) return;
    new MutationObserver(() => { cancelAnimationFrame(coloracaoAgendada); coloracaoAgendada = requestAnimationFrame(() => colorirValores(raiz)); })
      .observe(raiz, { childList: true, subtree: true, characterData: true });
    colorirValores(raiz);
  }

  async function iniciar() {
    ligar();
    vigiarValores();
    const ctx = await window.aguardarContexto?.();
    S.sb = window.supabaseClient;
    S.emp = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    if (!S.sb || !S.emp) { $("finConteudo").innerHTML = '<div class="fin-vazio">Entre no sistema para ver o financeiro.</div>'; return; }
    const aba = new URLSearchParams(location.search).get("aba");
    if (aba && document.querySelector('#finAbas [data-aba="' + abaDoGrupo(aba) + '"]')) S.aba = aba;
    await recarregar();
    window.finalizarCarregamentoModulo?.();
  }
  iniciar().catch((e) => { console.error(e); $("finConteudo").innerHTML = '<div class="fin-vazio">Não foi possível abrir o financeiro.</div>'; });
})();
