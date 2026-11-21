/* =====================================================
   CARTÕES DE CRÉDITO (trazido da Tecnoweld em nov/2026) — Financeiro → Bancos e cartões → aba "Cartões" (ao lado de "Bancos", na coluna das contas).
   - Cadastro do cartão: dia em que a fatura VIRA (compra a partir desse dia vai para a fatura seguinte) e dia do vencimento.
   - Toda compra no cartão (Contas a pagar → Novo pagamento com forma Cartão de crédito, ou pedido de compra pago no cartão em Compras)
     vira parcelas no contas a pagar, cada uma no vencimento da fatura em que cai (calculado no banco: fin_cartao_datas).
   - Conciliação da fatura: envia o arquivo da fatura do banco; cada linha é ligada a uma parcela do sistema pelo valor
     (fin_cartao_fatura_importar/_conciliar). O que está só no arquivo pode ser lançado (anuidade, juros, compra esquecida)
     ou ignorado; crédito vira estorno de uma compra; compra que caiu noutra fatura pode ser trazida.
   - Pagamento: na conciliação do BANCO, o débito da fatura é reconhecido como "Fatura do cartão" e paga todas as parcelas
     dela de uma vez (fin_assist_aplicar ação 'fatura').
   Montado por financeiro-clara.js (render da aba Bancos) com o mesmo contexto C.
===================================================== */
(function () {
  "use strict";
  const T = { cartao: null, fatura: null, faturas: [], det: null, config: false, busy: false, editando: null };
  let C = null;
  const $ = (id) => document.getElementById(id);
  const MES = (iso) => { const d = new Date(String(iso).slice(0, 10) + "T12:00:00"); return ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][d.getMonth()] + "/" + d.getFullYear(); };
  const SIT = { aberta: ["aberto", "Aberta"], fechada: ["vencido", "Fechada"], conferida: ["pago", "Conferida"], paga: ["pago", "Paga"] };
  const num = (v) => { const s = String(v ?? "").trim(); if (!s) return null; const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); return Number.isFinite(n) ? n : null; };
  const nomeCartao = (c) => c ? c.nome + (c.final ? " · final " + c.final : "") : "";

  // ---------------------------------------------------------------- lista à esquerda
  function nav(ctx, ativa) {
    C = ctx;
    const cs = (C.S.cartoes || []).filter((c) => c.ativo);
    if (!T.config && (!T.cartao || !cs.some((c) => c.id === T.cartao))) T.cartao = cs[0]?.id || null;
    if (!cs.length) T.config = true;
    const item = (c) => '<button type="button" class="bk-item' + (!T.config && T.cartao === c.id ? " ativa" : "") + '" data-cc-cartao="' + c.id + '">' +
      '<span class="fin-logo-conta cc-logo" aria-hidden="true">💳</span><span class="bk-item-txt"><span class="bk-item-nome">' + C.esc(c.nome) + "</span>" +
      "<small>" + C.esc([c.final ? "final " + c.final : "", "vira dia " + c.dia_virada + " · vence dia " + c.dia_vencimento].filter(Boolean).join(" · ")) + "</small></span></button>";
    return cs.map(item).join("") + (cs.length ? '<div class="bk-sep"></div>' : "") +
      '<button type="button" class="bk-item bk-config' + (T.config ? " ativa" : "") + '" data-cc-config><span class="fin-logo-conta bk-engrenagem" aria-hidden="true">⚙</span><span class="bk-item-txt"><span class="bk-item-nome">Configurar cartões</span><small>cadastro, dia que vira e vencimento</small></span></button>';
  }
  function ligarNav(raiz, repintar) {
    raiz.querySelectorAll("[data-cc-cartao]").forEach((b) => b.addEventListener("click", () => { T.config = false; if (T.cartao !== b.dataset.ccCartao) { T.cartao = b.dataset.ccCartao; T.fatura = null; } repintar(); }));
    raiz.querySelector("[data-cc-config]")?.addEventListener("click", () => { T.config = true; repintar(); });
  }
  async function main(ctx, el) {
    C = ctx;
    if (T.config) return pintarConfig(el);
    if (!T.cartao) { el.innerHTML = '<div class="fin-vazio">Nenhum cartão cadastrado. Clique em Configurar cartões.</div>'; return; }
    await pintarCartao(el);
  }

  // ---------------------------------------------------------------- cadastro (edição na própria linha)
  function pintarConfig(el) {
    const cs = C.S.cartoes || [];
    const contas = (C.S.contas || []).filter((c) => c.ativo && c.tipo !== "caixa");
    const optContas = (sel) => '<option value="">—</option>' + contas.map((c) => '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + C.esc(c.nome) + "</option>").join("");
    const form = (c) => '<tr class="cc-form"><td colspan="7"><div class="fin-form cc-form-grade" data-cc-form="' + (c?.id || "") + '">' +
      '<label>Nome<input name="nome" maxlength="60" value="' + C.esc(c?.nome || "") + '" placeholder="Ex.: Itaú empresarial"></label>' +
      '<label>Bandeira<input name="bandeira" maxlength="30" value="' + C.esc(c?.bandeira || "") + '" placeholder="Visa, Master…"></label>' +
      '<label>Final (4 números)<input name="final" maxlength="4" inputmode="numeric" value="' + C.esc(c?.final || "") + '"></label>' +
      '<label>Conta que paga a fatura<select name="conta_id">' + optContas(c?.conta_id) + "</select></label>" +
      '<label title="Compras feitas a partir deste dia entram na fatura seguinte">Dia em que a fatura vira<input name="dia_virada" type="number" min="1" max="31" value="' + (c?.dia_virada || "") + '"></label>' +
      '<label>Dia do vencimento<input name="dia_vencimento" type="number" min="1" max="31" value="' + (c?.dia_vencimento || "") + '"></label>' +
      '<label>Limite (opcional)<input name="limite" inputmode="decimal" value="' + (c?.limite != null ? String(c.limite).replace(".", ",") : "") + '"></label>' +
      '<label class="check"><input type="checkbox" name="ativo"' + (c?.ativo === false ? "" : " checked") + "> Ativo</label>" +
      '<p class="cc-form-ajuda inteiro" data-cc-exemplo></p><p class="fin-erro inteiro" data-cc-erro></p>' +
      '<div class="cc-form-acoes inteiro"><button type="button" class="fin-btn claro" data-cc-cancelar>Cancelar</button><button type="button" class="fin-btn" data-cc-salvar>Salvar</button></div></div></td></tr>';
    const linha = (c) => T.editando === c.id ? form(c) : "<tr" + (c.ativo ? "" : ' class="cc-inativo"') + "><td><b>" + C.esc(c.nome) + "</b>" + (c.bandeira ? "<small>" + C.esc(c.bandeira) + "</small>" : "") + "</td><td>" + C.esc(c.final || "—") +
      "</td><td>dia " + c.dia_virada + "</td><td>dia " + c.dia_vencimento + "</td><td>" + C.esc(C.S.contas.find((x) => x.id === c.conta_id)?.nome || "—") + '</td><td class="num">' + (c.limite != null ? C.brl(c.limite) : "—") +
      '</td><td class="num"><button type="button" class="fin-btn peq claro" data-cc-editar="' + c.id + '">Editar</button></td></tr>';
    el.innerHTML = '<section class="fin-bloco"><h3>Cartões de crédito <small>o dia em que a fatura vira decide em qual fatura cada compra cai</small></h3>' +
      '<div class="fin-rolar"><table class="fin-tabela cc-tabela"><thead><tr><th>Cartão</th><th>Final</th><th>Vira</th><th>Vence</th><th>Conta que paga</th><th class="num">Limite</th><th></th></tr></thead><tbody>' +
      cs.map(linha).join("") + (T.editando === "novo" ? form(null) : "") + (!cs.length && T.editando !== "novo" ? '<tr><td colspan="7" class="fin-vazio">Nenhum cartão ainda.</td></tr>' : "") +
      "</tbody></table></div>" + (T.editando ? "" : '<button type="button" class="fin-btn" data-cc-novo>+ Novo cartão</button>') +
      '<p class="cl-dica">Exemplo: cartão que vira no dia 8 e vence no dia 15. Compra no dia 7 vence no dia 15 deste mês; compra no dia 8 ou depois só vence no dia 15 do mês seguinte. Compra parcelada: uma parcela em cada fatura seguinte.</p></section>';
    el.querySelector("[data-cc-novo]")?.addEventListener("click", () => { T.editando = "novo"; pintarConfig(el); });
    el.querySelectorAll("[data-cc-editar]").forEach((b) => b.addEventListener("click", () => { T.editando = b.dataset.ccEditar; pintarConfig(el); }));
    const f = el.querySelector("[data-cc-form]");
    if (!f) return;
    const exemplo = () => {
      const v = Number(f.querySelector("[name=dia_virada]").value), d = Number(f.querySelector("[name=dia_vencimento]").value);
      f.querySelector("[data-cc-exemplo]").textContent = v >= 1 && v <= 31 && d >= 1 && d <= 31
        ? "Compra até o dia " + (v === 1 ? "último do mês anterior" : v - 1) + " → vence no dia " + d + (d > v ? " do mesmo mês" : " do mês seguinte") + ". Compra a partir do dia " + v + " → uma fatura depois." : "";
    };
    f.addEventListener("input", exemplo); exemplo();
    f.querySelector("[name=nome]").focus();
    f.querySelector("[data-cc-cancelar]").addEventListener("click", () => { T.editando = null; pintarConfig(el); });
    f.addEventListener("keydown", (e) => { if (e.key === "Escape") { T.editando = null; pintarConfig(el); } });
    f.querySelector("[data-cc-salvar]").addEventListener("click", async () => {
      const d = C.campos(f), erro = f.querySelector("[data-cc-erro]");
      const antes = (C.S.cartoes || []).find((x) => x.id === f.dataset.ccForm);
      if (antes && (Number(d.dia_virada) !== antes.dia_virada || Number(d.dia_vencimento) !== antes.dia_vencimento) &&
        !(await C.confirmar("Mudar o dia que vira ou o vencimento recalcula as parcelas ainda não pagas deste cartão (podem mudar de fatura). Continuar?", "Salvar"))) return;
      try {
        await C.rpc("fin_cartao_salvar", { p_empresa: C.S.emp, p_dados: { id: f.dataset.ccForm || null, nome: d.nome, bandeira: d.bandeira, final: d.final, conta_id: d.conta_id || null,
          dia_virada: d.dia_virada, dia_vencimento: d.dia_vencimento, limite: num(d.limite), ativo: d.ativo } });
        T.editando = null; await C.carregar(); pintarConfig(el);
        C.avisar("Cartão salvo.", "Cartões", "sucesso");
      } catch (e) { erro.textContent = e.message; }
    });
  }

  // ---------------------------------------------------------------- um cartão: faturas
  async function pintarCartao(el) {
    const c = (C.S.cartoes || []).find((x) => x.id === T.cartao);
    try { T.faturas = (await C.rpc("fin_cartao_faturas", { p_empresa: C.S.emp, p_cartao: T.cartao })) || []; }
    catch (e) { el.innerHTML = '<div class="fin-vazio">' + C.esc(e.message) + "</div>"; return; }
    if (!T.fatura || !T.faturas.some((f) => f.id === T.fatura)) {
      // começa pela fatura fechada mais antiga ainda não paga; senão a atual
      const pend = T.faturas.filter((f) => f.situacao === "fechada" || f.situacao === "conferida").sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
      T.fatura = (pend || T.faturas.find((f) => f.atual) || T.faturas[0])?.id || null;
    }
    const chips = T.faturas.slice().sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map((f) => { const [cls, rot] = SIT[f.situacao] || ["aberto", f.situacao];
      return '<button type="button" role="tab" class="cc-fat' + (f.id === T.fatura ? " ativa" : "") + '" aria-selected="' + (f.id === T.fatura) + '" data-cc-fat="' + f.id + '"><b>' + C.esc(MES(f.vencimento)) + '</b><span>' + C.brl(f.total) + '</span><span class="fin-status ' + cls + '">' + rot + (f.atual ? " · atual" : "") + "</span></button>"; }).join("");
    el.innerHTML = '<div class="bk-cab"><div class="cc-fats" role="tablist" aria-label="Faturas de ' + C.esc(nomeCartao(c)) + '">' + chips + "</div></div><div id=\"ccFatura\"></div>";
    el.querySelectorAll("[data-cc-fat]").forEach((b) => b.addEventListener("click", () => { T.fatura = b.dataset.ccFat; T.sel = new Set(); T.edit = {}; T.selIniciadaCC = false; pintarCartao(el); }));
    el.querySelector(".cc-fat.ativa")?.scrollIntoView({ block: "nearest", inline: "center" });
    if (T.fatura) await pintarFatura($("ccFatura"), c);
  }

  async function pintarFatura(el, cartao) {
    let d;
    try { d = await C.rpc("fin_cartao_fatura_detalhe", { p_empresa: C.S.emp, p_fatura: T.fatura }); }
    catch (e) { el.innerHTML = '<div class="fin-vazio">' + C.esc(e.message) + "</div>"; return; }
    T.det = d;
    const f = d.fatura, resumo = T.faturas.find((x) => x.id === f.id) || {};
    const parc = d.parcelas || [], linhas = d.linhas || [];
    const total = parc.reduce((s, p) => s + Number(p.valor), 0), aberto = parc.reduce((s, p) => s + Number(p.aberto), 0);
    const temArquivo = linhas.length > 0;
    const banco = f.valor_banco != null ? Number(f.valor_banco) : null;
    const dif = banco != null ? Math.round((banco - total) * 100) / 100 : null;
    const outras = d.outras || [];
    const ligadas = new Map(linhas.filter((l) => l.titulo_id).map((l) => [l.titulo_id, l]));
    const [cls, rot] = SIT[resumo.situacao] || ["aberto", resumo.situacao || ""];
    // linhas do arquivo que precisam de decisão
    const soArquivo = linhas.filter((l) => l.situacao === "pendente" && Number(l.valor) > 0 && !l.titulo_id);
    const creditos = linhas.filter((l) => l.situacao === "pendente" && Number(l.valor) < 0);
    const noutraFatura = linhas.filter((l) => l.situacao === "conferida" && l.titulo_id && l.titulo_fatura_id && l.titulo_fatura_id !== f.id);
    const resolvidas = linhas.filter((l) => ["ignorada", "lancada", "estorno"].includes(l.situacao));
    const optMover = (p) => '<select class="cc-mover" data-cc-mover="' + p.id + '" aria-label="Passar para outra fatura"' + (Number(p.pago) > 0 ? " disabled" : "") + '><option value="">Mover…</option>' +
      outras.map((o) => '<option value="' + o.id + '">Fatura de ' + C.esc(MES(o.vencimento)) + "</option>").join("") + "</select>";
    const naFatura = (p) => {
      if (!temArquivo) return '<span class="bk-sem">—</span>';
      const l = ligadas.get(p.id);
      return l ? '<span class="cc-ok">✓ na fatura do banco</span>' : '<span class="cc-falta">Não está no arquivo</span>';
    };
    // (2026-11-13) faixa fina em cima; o valor da fatura do banco e a conferência ficam no fim, depois da conciliação
    const st = (rot, val, sub) => '<div class="fe-stat"><small>' + rot + "</small><b>" + val + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + "</div>";
    el.innerHTML =
      '<div class="fe-strip cc-strip"><div class="cc-strip-filtros" id="ccFiltrosSlot"></div>' + (parc.length && C.verFaturaNoPagar ? '<button type="button" class="fin-btn claro cc-ver-pagar" data-cc-ver-pagar title="Abrir o A pagar na linha desta fatura">Ver no A pagar →</button>' : "") + "</div>" +
      '<section class="cl-envio"><label class="cl-drop" id="ccDrop"><input type="file" id="ccArquivo" accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt,.ofx,.pdf" hidden><b>' + (temArquivo ? "Enviar a fatura de novo" : "Arraste aqui a fatura do banco") + "</b><span>" +
        (temArquivo ? "Último arquivo: " + C.esc(f.arquivo_nome || "") + " · " + linhas.length + " linha(s)" : "ou clique para escolher · Excel, CSV, OFX ou PDF. Cada compra da fatura é conferida com o sistema.") + '</span></label><div class="cl-etapa" id="ccEtapa" hidden></div></section>' +
      '<div id="ccConc"></div>' +
      '<section class="fin-bloco cc-fim">' + st("Vira em", C.dataBr(f.virada)) + st("Vence em", C.dataBr(f.vencimento)) +
        st("Total no sistema", C.brl(total), parc.length + " compra(s)" + (aberto < total - 0.005 ? " · em aberto " + C.brl(aberto) : "")) +
        st("Valor da fatura do banco", banco != null ? C.brl(banco) : "—", banco != null ? "do arquivo enviado" : "envie o arquivo da fatura") +
        '<div class="cc-fim-res">' + (dif == null ? '<span class="cc-sub">O valor vem do arquivo da fatura.</span>' : Math.abs(dif) < 0.01 ? '<span class="cc-ok">✓ Bate com o total do sistema (' + C.brl(total) + ")</span>" :
          '<span class="cc-falta">Diferença de ' + C.brl(dif) + "</span><small>Resolva as linhas acima até zerar.</small>") + "</div>" +
        '<span class="fin-esp"></span>' + (f.conferida_em ? '<button type="button" class="fin-btn claro" data-cc-conferir="0">Desfazer conferência</button>' : '<button type="button" class="fin-btn verde" data-cc-conferir="1">Marcar fatura como conferida</button>') + "</section>";
    ligarFatura(el, f, parc);
  }

  // (2026-11-13) conciliação da fatura IGUAL à do banco: "Para conferir" com filtros (Prontas / Confira / Sem sugestão), linhas por dia,
  // coluna Conciliação com a sugestão (tipo + confiança + resumo + motivo), caixinhas + "Confirmar selecionadas", botão Alterar/Escolher
  // que abre o editor logo abaixo da linha, e "Já reconhecidas" embaixo. A Clara sugere categoria/centro para o que não está no sistema.
  const CONF_CC = { alta: "Pronta", media: "Confira", baixa: "Palpite" };
  const TIPO_CC = { lancar: ["t-lancar", "Lançar"], ligar: ["t-baixar", "Compra"], trazer: ["t-baixar", "Trazer"], estorno: ["t-transferencia", "Estorno"], ignorar: ["t-ignorar", "Ignorar"] };
  const palavrasCC = (s) => norm2(s).split(" ").filter((p) => p.length >= 4);
  function norm2(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  const catNome = (id) => { const c = (C.S.cats || []).find((x) => x.id === id); return c ? (c.codigo ? c.codigo + " " : "") + c.nome : ""; };
  const ccNome = (id) => (C.S.ccs || []).find((x) => x.id === id)?.nome || "";

  function renderConc(box, d, f, recarregar) {
    T.sel = T.sel || new Set(); T.edit = T.edit || {}; T.filtroCC = T.filtroCC || "todas";
    const parc = d.parcelas || [], linhas = d.linhas || [], outras = d.outras || [];
    const titulo = (id) => (C.S.pagar || []).find((x) => x.id === id) || parc.find((x) => x.id === id) || null;
    const outraFat = (l) => l.situacao === "conferida" && l.titulo_fatura_id && l.titulo_fatura_id !== f.id;
    const pendentes = linhas.filter((l) => l.situacao === "pendente" || outraFat(l));
    const feitas = linhas.filter((l) => !pendentes.includes(l));
    const ligadas = new Set(linhas.filter((l) => l.titulo_id && l.situacao !== "ignorada").map((l) => l.titulo_id));
    const soSistema = parc.filter((p) => !ligadas.has(p.id));
    const sug = (l) => {
      if (T.edit[l.id]) return T.edit[l.id];
      if (outraFat(l)) return { tipo: "trazer", conf: "alta", resumo: "Trazer para esta fatura · " + (l.titulo_nome || ""), motivo: "Mesmo valor; no sistema a compra caiu na fatura de " + MES(l.titulo_vencimento) + "." };
      if (Number(l.valor) < 0) {
        if (/pagamento|pgto|obrigad/i.test(l.descricao || "")) return { tipo: "ignorar", conf: "alta", resumo: "Ignorar · pagamento da fatura anterior", motivo: "É o pagamento da fatura passada, não uma compra." };
        const pal = palavrasCC(l.descricao), c = parc.find((p) => Number(p.aberto) >= Math.abs(Number(l.valor)) - 0.005 && pal.some((w) => norm2((p.fornecedor || "") + " " + (p.descricao || "")).includes(w)));
        return c ? { tipo: "estorno", titulo_id: c.id, conf: "media", resumo: "Estorno de " + (c.fornecedor || "compra") + " · " + C.brl(Math.abs(l.valor)), motivo: "Crédito com o mesmo nome de uma compra desta fatura." } : null;
      }
      const s = l.sugestao;
      if (s && s.tipo === "lancar") return { tipo: "lancar", categoria_id: s.categoria_id, centro_custo_id: s.centro_custo_id, descricao: s.descricao, conf: s.confianca || "baixa", motivo: s.motivo || "",
        resumo: "Lançar · " + [catNome(s.categoria_id) || "sem categoria", ccNome(s.centro_custo_id), s.descricao].filter(Boolean).join(" · ") };
      return null;
    };
    const nivel = (l) => { const s = sug(l); return s ? s.conf || "baixa" : "sem"; };
    const parcelaTxt = (t, txt) => { if (t) return t.parcelas > 1 ? t.parcela + "/" + t.parcelas : "à vista"; const m = String(txt || "").match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b(?!\/)/); return m && Number(m[2]) > 1 && Number(m[1]) <= Number(m[2]) ? m[1] + "/" + m[2] : '<span class="bk-sem">—</span>'; };
    const dreCel = (cat, cc) => '<td class="bk-dre">' + (cat || cc ? "<div><b>" + C.esc(catNome(cat) || "Sem categoria") + "</b>" + (cc ? "<span>" + C.esc(ccNome(cc)) + "</span>" : "") + "</div>" : '<span class="bk-sem">—</span>') + "</td>";
    const dreDe = (l, s) => { if (!s || s.tipo === "ignorar") return dreCel(); if (s.tipo === "lancar") return dreCel(s.categoria_id, s.centro_custo_id); const t = titulo(s.titulo_id || l.titulo_id); return t ? dreCel(t.categoria_id, t.centro_custo_id) : dreCel(); };
    const descTd = (l) => "<td>" + C.esc(l.descricao || "-") + "</td>";
    const dia = (data, n) => '<tr class="bk-dia"><td colspan="' + n + '">' + C.esc(data ? new Date(String(data).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }) : "Sem data") + "</td></tr>";
    const porDia = (lista, n, html) => { let ult = "§"; return lista.map((l) => (String(l.data || "") !== ult ? ((ult = String(l.data || "")), dia(l.data, n)) : "") + html(l)).join(""); };
    const linhaPend = (l) => {
      const s = sug(l), n = nivel(l), t = l.titulo_id ? titulo(l.titulo_id) : (s?.titulo_id ? titulo(s.titulo_id) : null);
      return '<tr class="cl-n-' + n + '" data-cc-linha="' + l.id + '"><td class="cl-ck"><input type="checkbox" data-cc-sel="' + l.id + '"' + (T.sel.has(l.id) ? " checked" : "") + (s ? "" : " disabled") + ' aria-label="Selecionar"></td>' + descTd(l) +
        '<td class="cl-sug bk-conc">' + (s ? '<div><span class="cl-tipo ' + TIPO_CC[s.tipo][0] + '">' + TIPO_CC[s.tipo][1] + '</span> <span class="cl-conf c-' + n + '">' + (CONF_CC[n] || "") + (T.edit[l.id] ? " · alterada por você" : "") + "</span></div>" +
          '<div class="cl-res">' + C.esc(s.resumo || "") + "</div>" + (s.motivo ? '<div class="cl-motivo">' + C.esc(s.motivo) + "</div>" : "") : '<div class="cl-res sem">' + (Number(l.valor) > 0 ? "Não encontrado no sistema" : "Crédito na fatura") + "</div>") + "</td>" +
        '<td class="num">' + C.brl(l.valor) + "</td><td>" + parcelaTxt(t, l.descricao) + "</td>" + dreDe(l, s) +
        '<td class="num"><button type="button" class="fin-btn peq claro" data-cc-alterar="' + l.id + '">' + (s ? "Alterar" : "Escolher") + "</button></td></tr>";
    };
    const linhaFeita = (l) => {
      const t = l.titulo_id ? titulo(l.titulo_id) : null;
      const rot = { conferida: "Compra · " + [t?.fornecedor_nome || t?.fornecedor, t?.descricao].filter(Boolean).join(" · "), lancada: "Lançado · " + (t?.descricao || ""), estorno: "Estorno · " + (t?.fornecedor_nome || t?.fornecedor || ""), ignorada: "Ignorado" }[l.situacao] || "";
      return '<tr data-cc-linha="' + l.id + '">' + descTd(l) + '<td class="bk-conc">' + C.esc(rot) + '</td><td class="num">' + C.brl(l.valor) + "</td><td>" + parcelaTxt(t, l.descricao) + "</td>" +
        (t ? dreCel(t.categoria_id, t.centro_custo_id) : dreCel()) + '<td class="num"><button type="button" class="fin-btn peq claro" data-cc-alterar="' + l.id + '">Alterar</button></td></tr>';
    };
    const cont = { todas: pendentes.length, alta: 0, media: 0, baixa: 0, sem: 0 }; pendentes.forEach((l) => { cont[nivel(l)]++; });
    const vis = pendentes.filter((l) => T.filtroCC === "todas" || nivel(l) === T.filtroCC || (T.filtroCC === "conferir" && ["media", "baixa"].includes(nivel(l))));
    const semAnalise = pendentes.filter((l) => Number(l.valor) > 0 && !outraFat(l) && !l.sugestao && !T.edit[l.id]).length;
    const CAB = "<th>Descrição</th><th>Conciliação</th><th class=\"num\">Valor</th><th>Parcela</th><th>DRE</th>";
    box.innerHTML =
      (semAnalise ? '<div class="cl-aviso">' + semAnalise + ' lançamento(s) ainda sem análise. <button type="button" class="fin-btn peq" data-cc-organizar>Organizar agora</button></div>' : "") +
      '<section class="fin-bloco cl-lista">' +
      (vis.length ? '<div class="fin-rolar"><table class="fin-tabela cl-tabela"><thead><tr><th class="cl-ck"><input type="checkbox" data-cc-todas aria-label="Selecionar todas"' + (vis.every((l) => T.sel.has(l.id)) ? " checked" : "") + "></th>" + CAB + "<th></th></tr></thead><tbody>" +
        porDia(vis, 7, linhaPend) + "</tbody></table></div>" : '<div class="fin-vazio">' + (linhas.length ? (pendentes.length ? "Nada neste filtro." : "Tudo conferido nesta fatura.") : "Envie a fatura do banco para conferir com as compras do sistema.") + "</div>") + "</section>" +
      '<div class="cl-barra" id="ccBarra"></div>' +
      (feitas.length ? '<details class="fin-bloco cl-feitas" open><summary>Já reconhecidas <small>' + feitas.length + '</small></summary><div class="fin-rolar"><table class="fin-tabela cl-tabela"><thead><tr>' + CAB + "<th></th></tr></thead><tbody>" +
        porDia(feitas, 6, linhaFeita) + "</tbody></table></div></details>" : "") +
      (soSistema.length ? '<section class="fin-bloco"><h3>Compras do sistema que ' + (linhas.length ? "não vieram nesta fatura" : "esperam a fatura do banco") + " <small>" + soSistema.length + '</small></h3><div class="fin-rolar"><table class="fin-tabela cl-tabela"><thead><tr><th>Compra</th><th>Fornecedor · descrição</th><th class="num">Valor</th><th>Parcela</th><th>DRE</th><th></th></tr></thead><tbody>' +
        soSistema.map((p) => { const t = titulo(p.id) || p; return "<tr><td>" + C.dataBr(p.compra) + "</td><td><b>" + C.esc(p.fornecedor || "-") + "</b><small>" + C.esc(p.descricao || "") + '</small></td><td class="num">' + C.brl(p.valor) + "</td><td>" + parcelaTxt(t) + "</td>" + dreCel(t.categoria_id, t.centro_custo_id) +
          '<td class="num cc-sis-acoes"><button type="button" class="fin-btn peq claro" data-cc-retirar="' + p.id + '"' + (Number(p.pago) > 0 ? " disabled" : "") + ' title="Lançada no cartão por engano? Vira conta normal (boleto, PIX…)">Tirar do cartão</button><select class="cc-mover" data-cc-mover="' + p.id + '" aria-label="Passar para outra fatura"' + (Number(p.pago) > 0 ? " disabled" : "") + '><option value="">Mover…</option>' + outras.map((o) => '<option value="' + o.id + '">Fatura de ' + C.esc(MES(o.vencimento)) + "</option>").join("") + "</select></td></tr>"; }).join("") + "</tbody></table></div></section>" : "");

    // (2026-11-13) "Para conferir" + filtros + Organizar ficam na mesma linha de Vira em / Vence em / Total no sistema
    const slot = document.getElementById("ccFiltrosSlot");
    if (slot) slot.innerHTML = '<div class="cc-strip-tit"><b>Para conferir</b><span>' + pendentes.length + " lançamento(s) da fatura</span></div>" +
      '<div class="cl-filtros">' + [["todas", "Todas", cont.todas], ["alta", "Prontas", cont.alta], ["conferir", "Confira", cont.media + cont.baixa], ["sem", "Sem sugestão", cont.sem]]
        .map(([k, t2, n2]) => '<button type="button" data-cc-filtro="' + k + '" class="' + (T.filtroCC === k ? "ativa " : "") + "f-" + k + '">' + t2 + " <b>" + n2 + "</b></button>").join("") + "</div>" +
      '<span class="fin-esp"></span>' + (pendentes.length ? '<button type="button" class="fin-btn peq claro" data-cc-organizar="1"><span class="cl-av mini">C</span> Organizar de novo</button>' : "");
    const barra = () => {
      const el = box.querySelector("#ccBarra"), sel = pendentes.filter((l) => T.sel.has(l.id) && sug(l));
      if (!sel.length) { el.hidden = true; el.innerHTML = ""; return; }
      el.hidden = false;
      el.innerHTML = "<span><b>" + sel.length + "</b> selecionada(s) · " + C.brl(sel.reduce((a, l) => a + Number(l.valor), 0)) + '</span><button type="button" class="fin-btn verde" data-cc-confirmar>Confirmar selecionadas</button>';
      el.querySelector("[data-cc-confirmar]").addEventListener("click", async (e) => {
        e.target.disabled = true; let ok = 0; const erros = [];
        for (const l of sel) {
          const s = sug(l);
          const p = s.tipo === "lancar" ? { tipo: "lancar", descricao: s.descricao || l.descricao, categoria_id: s.categoria_id, centro_custo_id: s.centro_custo_id || "" }
            : s.tipo === "ligar" ? { tipo: "vincular", titulo_id: s.titulo_id } : s.tipo === "estorno" ? { tipo: "estorno", titulo_id: s.titulo_id } : { tipo: s.tipo };
          try { await C.rpc("fin_cartao_linha_acao", { p_empresa: C.S.emp, p_linha: l.id, p_acao: p }); ok++; T.sel.delete(l.id); delete T.edit[l.id]; }
          catch (err) { erros.push((l.descricao || "") + ": " + err.message); }
        }
        if (erros.length) C.avisar(ok + " conferida(s). Não foi possível em " + erros.length + ":\n" + erros.slice(0, 6).join("\n"), "Cartões", "aviso");
        else C.avisar(ok + " lançamento(s) da fatura conferido(s).", "Cartões", "sucesso");
        await recarregar();
      });
    };
    barra();
    if (!T.selIniciadaCC) { pendentes.filter((l) => nivel(l) === "alta").forEach((l) => T.sel.add(l.id)); T.selIniciadaCC = true; renderConc(box, d, f, recarregar); return; }
    slot?.querySelectorAll("[data-cc-filtro]").forEach((b) => b.addEventListener("click", () => { T.filtroCC = b.dataset.ccFiltro; renderConc(box, d, f, recarregar); }));
    slot?.querySelectorAll("[data-cc-organizar]").forEach((b) => b.addEventListener("click", () => organizarCC(f, recarregar, true)));
    box.querySelectorAll("[data-cc-sel]").forEach((ck) => ck.addEventListener("change", () => { if (ck.checked) T.sel.add(ck.dataset.ccSel); else T.sel.delete(ck.dataset.ccSel); barra(); }));
    box.querySelector("[data-cc-todas]")?.addEventListener("change", (e) => { box.querySelectorAll("[data-cc-sel]:not(:disabled)").forEach((ck) => { ck.checked = e.target.checked; if (e.target.checked) T.sel.add(ck.dataset.ccSel); else T.sel.delete(ck.dataset.ccSel); }); barra(); });
    box.querySelectorAll("[data-cc-organizar]").forEach((b) => b.addEventListener("click", () => organizarCC(f, recarregar, b.dataset.ccOrganizar === "1")));
    box.querySelectorAll("[data-cc-mover]").forEach((s) => s.addEventListener("change", async () => {
      if (!s.value) return;
      try { await C.rpc("fin_cartao_parcela_mover", { p_empresa: C.S.emp, p_titulo: s.dataset.ccMover, p_fatura: s.value }); C.avisar("Compra passada para a outra fatura.", "Cartões", "sucesso"); await recarregar(); }
      catch (e) { s.value = ""; C.avisar(e.message, "Cartões", "erro"); }
    }));
    box.querySelectorAll("[data-cc-retirar]").forEach((b) => b.addEventListener("click", () => editorRetirar(b.closest("tr"), titulo(b.dataset.ccRetirar) || parc.find((x) => x.id === b.dataset.ccRetirar), f, recarregar)));
    box.querySelectorAll("[data-cc-alterar]").forEach((b) => b.addEventListener("click", () => {
      const l = linhas.find((x) => x.id === b.dataset.ccAlterar);
      if (pendentes.includes(l)) editorPend(b.closest("tr"), l, sug(l), { parc, outraFat: outraFat(l), titulo, rerender: () => renderConc(box, d, f, recarregar) });
      else editorFeita(b.closest("tr"), l, titulo(l.titulo_id), { outras, recarregar });
    }));
  }

  // editor da linha para conferir (igual ao "Alterar sugestão" do banco): escolhe o tipo, ajusta e "Usar esta escolha"
  function editorPend(tr, l, atual, ctx) {
    document.querySelectorAll("tr.cl-inline-ed").forEach((x) => { x.previousElementSibling?.classList.remove("cl-editando"); x.remove(); });
    const credito = Number(l.valor) < 0;
    const tipos = credito ? ["estorno", "ignorar"] : [...(ctx.outraFat ? ["trazer"] : []), "lancar", "ligar", "ignorar"];
    let tipo = atual && tipos.includes(atual.tipo) ? atual.tipo : tipos[0];
    const ROT = { lancar: "Lançar (não está no sistema)", ligar: "Ligar a uma compra", trazer: "Trazer para esta fatura", estorno: "Estorno de uma compra", ignorar: "Ignorar" };
    const optCat = (sel) => '<option value="">Escolha</option>' + (C.S.cats || []).filter((c) => c.tipo === "saida" && c.ativo !== false).map((c) => '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + C.esc((c.codigo ? c.codigo + " " : "") + c.nome) + "</option>").join("");
    const optCc = (sel) => '<option value="">Sem centro de custo</option>' + (C.S.ccs || []).filter((c) => c.ativo !== false).map((c) => '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + C.esc(c.nome) + "</option>").join("");
    const ed = document.createElement("tr"); ed.className = "cl-inline-ed";
    const corpoTipo = () => {
      if (tipo === "lancar") return '<div class="fin-form"><label class="inteiro">Descrição<input name="descricao" value="' + C.esc(atual?.descricao || l.descricao || "") + '"></label><label>Categoria (DRE)<select name="categoria_id">' + optCat(atual?.categoria_id) + '</select></label><label>Centro de custo<select name="centro_custo_id">' + optCc(atual?.centro_custo_id) + "</select></label></div>";
      if (tipo === "ligar" || tipo === "estorno") {
        const lista = tipo === "estorno" ? ctx.parc.filter((p) => Number(p.aberto) > 0.005) : (C.S.pagar || []).filter((p) => p.cartao_id === T.cartao && p.status !== "cancelado").sort((a, b) => Math.abs(Number(a.valor) - Number(l.valor)) - Math.abs(Number(b.valor) - Number(l.valor))).slice(0, 25);
        return '<div class="cc-escolha">' + (lista.length ? lista.map((p) => '<label class="cl-alt-t"><input type="radio" name="titulo" value="' + p.id + '"' + (atual?.titulo_id === p.id ? " checked" : "") + "><span><b>" + C.esc(p.fornecedor_nome || p.fornecedor || "-") + "</b><small>" + C.esc([p.descricao, (p.cartao_compra_em || p.compra) ? "compra " + C.dataBr(p.cartao_compra_em || p.compra) : ""].filter(Boolean).join(" · ")) + '</small></span><span class="num">' + C.brl(p.valor) + "</span></label>").join("") : '<div class="fin-vazio">Nenhuma compra para escolher.</div>') + "</div>";
      }
      if (tipo === "trazer") return '<p class="cl-dica">A compra (' + C.esc(l.titulo_nome || "") + ") passa para esta fatura (vencimento desta fatura).</p>";
      return '<p class="cl-dica">A linha sai da lista sem mexer em nenhuma conta (ex.: pagamento da fatura anterior).</p>';
    };
    const pintarEd = () => {
      ed.innerHTML = '<td colspan="' + tr.children.length + '"><div class="cl-inline-caixa"><div class="cl-alt-linha"><b>' + C.dataBr(l.data) + "</b> · " + C.esc(l.descricao || "") + " · <b>" + C.brl(l.valor) + "</b></div>" +
        (atual?.motivo ? '<p class="cl-alt-motivo"><span class="cl-av mini">C</span>' + C.esc(atual.motivo) + "</p>" : "") +
        '<div class="cl-alt-tipos">' + tipos.map((k) => '<button type="button" data-cc-tipo="' + k + '" class="' + (tipo === k ? "ativa" : "") + '">' + ROT[k] + "</button>").join("") + "</div>" + corpoTipo() +
        '<p class="cl-inline-erro" role="alert"></p><div class="cl-inline-acoes"><button type="button" class="fin-btn claro" data-x>Cancelar</button><button type="button" class="fin-btn" data-ok>Usar esta escolha</button></div></div></td>';
      ed.querySelectorAll("[data-cc-tipo]").forEach((b) => b.addEventListener("click", () => { tipo = b.dataset.ccTipo; pintarEd(); }));
      ed.querySelector("[data-x]").addEventListener("click", () => { ed.remove(); tr.classList.remove("cl-editando"); });
      ed.querySelector("[data-ok]").addEventListener("click", () => {
        const er = ed.querySelector(".cl-inline-erro"), d = C.campos(ed);
        let s;
        if (tipo === "lancar") { if (!d.categoria_id) { er.textContent = "Escolha a categoria (é ela que entra na DRE)."; return; } s = { tipo, descricao: d.descricao, categoria_id: d.categoria_id, centro_custo_id: d.centro_custo_id, resumo: "Lançar · " + [catNome(d.categoria_id), ccNome(d.centro_custo_id), d.descricao].filter(Boolean).join(" · ") }; }
        else if (tipo === "ligar" || tipo === "estorno") { const t = ed.querySelector("[name=titulo]:checked")?.value; if (!t) { er.textContent = "Escolha a compra."; return; } const p = ctx.titulo(t); s = { tipo, titulo_id: t, resumo: (tipo === "estorno" ? "Estorno de " : "Compra · ") + (p?.fornecedor_nome || p?.fornecedor || "") }; }
        else if (tipo === "trazer") s = { tipo, resumo: "Trazer para esta fatura · " + (l.titulo_nome || "") };
        else s = { tipo: "ignorar", resumo: "Ignorar" };
        T.edit[l.id] = { ...s, conf: "alta", motivo: "Escolhido por você." }; T.sel.add(l.id); ctx.rerender();
      });
    };
    pintarEd();
    tr.after(ed); tr.classList.add("cl-editando");
    ed.addEventListener("keydown", (e) => { if (e.key === "Escape") { ed.remove(); tr.classList.remove("cl-editando"); } });
    ed.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // editor de uma linha já reconhecida: DRE da compra, passar para outra fatura e desfazer
  function editorFeita(tr, l, t, ctx) {
    document.querySelectorAll("tr.cl-inline-ed").forEach((x) => { x.previousElementSibling?.classList.remove("cl-editando"); x.remove(); });
    const optCat = (sel) => '<option value="">Sem categoria</option>' + (C.S.cats || []).filter((c) => c.tipo === "saida" && (c.ativo !== false || c.id === sel)).map((c) => '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + C.esc((c.codigo ? c.codigo + " " : "") + c.nome) + "</option>").join("");
    const optCc = (sel) => '<option value="">Sem centro de custo</option>' + (C.S.ccs || []).filter((c) => c.ativo !== false || c.id === sel).map((c) => '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + C.esc(c.nome) + "</option>").join("");
    const ed = document.createElement("tr"); ed.className = "cl-inline-ed";
    const podeDesfazer = ["conferida", "ignorada"].includes(l.situacao);
    ed.innerHTML = '<td colspan="' + tr.children.length + '"><div class="cl-inline-caixa">' +
      (t ? '<div class="fin-form"><label>Categoria (DRE)<select name="categoria_id">' + optCat(t.categoria_id) + '</select></label><label>Centro de custo<select name="centro_custo_id">' + optCc(t.centro_custo_id) + "</select></label>" +
        (Number(t.pago || 0) > 0 ? "" : '<label>Passar para outra fatura<select name="mover"><option value="">—</option>' + ctx.outras.map((o) => '<option value="' + o.id + '">Fatura de ' + C.esc(MES(o.vencimento)) + "</option>").join("") + "</select></label>") + "</div>" : '<p class="cl-dica">Linha ignorada: não mexeu em nenhuma conta.</p>') +
      '<p class="cl-inline-erro" role="alert"></p><div class="cl-inline-acoes">' + (podeDesfazer ? '<button type="button" class="fin-btn claro" data-desfazer>Desfazer</button><span class="fin-esp"></span>' : "") +
      '<button type="button" class="fin-btn claro" data-x>Cancelar</button>' + (t ? '<button type="button" class="fin-btn" data-ok>Salvar</button>' : "") + "</div></div></td>";
    tr.after(ed); tr.classList.add("cl-editando");
    const fechar = () => { ed.remove(); tr.classList.remove("cl-editando"); };
    ed.querySelector("[data-x]").addEventListener("click", fechar);
    ed.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
    ed.querySelector("[data-desfazer]")?.addEventListener("click", async () => {
      try { await C.rpc("fin_cartao_linha_acao", { p_empresa: C.S.emp, p_linha: l.id, p_acao: { tipo: "reabrir" } }); await ctx.recarregar(); }
      catch (e) { ed.querySelector(".cl-inline-erro").textContent = e.message; }
    });
    ed.querySelector("[data-ok]")?.addEventListener("click", async () => {
      const d = C.campos(ed);
      try {
        await C.rpc("fin_editar_titulo", { p_empresa: C.S.emp, p_tipo: "pagar", p_id: t.id, p_dados: { categoria_id: d.categoria_id || null, centro_custo_id: d.centro_custo_id || null } });
        if (d.mover) await C.rpc("fin_cartao_parcela_mover", { p_empresa: C.S.emp, p_titulo: t.id, p_fatura: d.mover });
        await ctx.recarregar();
      } catch (e) { ed.querySelector(".cl-inline-erro").textContent = e.message; }
    });
  }

  // (2026-11-13) tirar do cartão uma compra lançada nele por engano: vira conta normal com a forma e o vencimento escolhidos
  function editorRetirar(tr, t, f, recarregar) {
    if (!t) return;
    document.querySelectorAll("tr.cl-inline-ed").forEach((x) => { x.previousElementSibling?.classList.remove("cl-editando"); x.remove(); });
    const irmas = (C.S.pagar || []).filter((x) => x.cartao_id && Number(x.pago || 0) <= 0 && x.status !== "cancelado" && (x.id === t.id || (t.grupo && x.grupo === t.grupo) || (t.origem === "compra" && x.origem === t.origem && x.origem_id === t.origem_id)));
    const n = Math.max(1, irmas.length);
    const ed = document.createElement("tr"); ed.className = "cl-inline-ed";
    ed.innerHTML = '<td colspan="' + tr.children.length + '"><div class="cl-inline-caixa"><div class="cl-alt-linha"><b>Tirar do cartão</b> · ' + C.esc(t.fornecedor_nome || t.fornecedor || "") + " · " + C.esc(t.descricao || "") + "</div>" +
      '<div class="fin-form"><label>Forma de pagamento<select name="forma">' + [["boleto", "Boleto"], ["pix", "PIX"], ["transferencia", "Transferência"], ["dinheiro", "Dinheiro"]].map(([k, x]) => '<option value="' + k + '">' + x + "</option>").join("") + "</select></label>" +
      '<label>' + (n > 1 ? "Vencimento da 1ª parcela" : "Vencimento") + '<input type="date" name="venc" value="' + String(f.vencimento || "").slice(0, 10) + '"></label></div>' +
      '<p class="cl-dica">' + (n > 1 ? "As " + n + " parcelas ainda não pagas desta compra saem do cartão; as seguintes vencem mês a mês." : "A conta sai do cartão e desta fatura.") + " Se veio de um pedido de compra, o pedido também deixa de ser cartão.</p>" +
      '<p class="cl-inline-erro" role="alert"></p><div class="cl-inline-acoes"><button type="button" class="fin-btn claro" data-x>Cancelar</button><button type="button" class="fin-btn" data-ok>Tirar do cartão</button></div></div></td>';
    tr.after(ed); tr.classList.add("cl-editando");
    const fechar = () => { ed.remove(); tr.classList.remove("cl-editando"); };
    ed.querySelector("[data-x]").addEventListener("click", fechar);
    ed.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
    ed.querySelector("[data-ok]").addEventListener("click", async (e) => {
      const d = C.campos(ed);
      if (!d.venc) { ed.querySelector(".cl-inline-erro").textContent = "Informe o vencimento."; return; }
      e.target.disabled = true;
      try { const k = await C.rpc("fin_cartao_retirar", { p_empresa: C.S.emp, p_titulo: t.id, p_forma: d.forma, p_vencimento: d.venc }); C.avisar((k > 1 ? k + " parcelas saíram" : "A conta saiu") + " do cartão.", "Cartões", "sucesso"); await recarregar(); }
      catch (err) { e.target.disabled = false; ed.querySelector(".cl-inline-erro").textContent = err.message; }
    });
  }

  // a Clara sugere categoria/centro para o que está na fatura e não no sistema
  async function organizarCC(f, recarregar, refazer) {
    const et = $("ccEtapa"); if (et) { et.hidden = false; et.textContent = "A Clara está organizando a fatura…"; }
    try {
      if (refazer) { T.edit = {}; T.sel = new Set(); T.selIniciadaCC = false; }
      const { data, error } = await C.S.sb.functions.invoke("financeiro-assistente", { body: { action: "cartao_sugerir", empresa_id: C.S.emp, fatura_id: f.id } });
      if (error) { let msg = error.message; try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (_) { /* sem corpo */ } throw new Error(msg); }
      if (data?.error) throw new Error(data.error);
      if ((data.sugestoes || []).length) await C.rpc("fin_cartao_sugestoes_salvar", { p_empresa: C.S.emp, p_fatura: f.id, p_sugestoes: data.sugestoes });
      T.selIniciadaCC = false;
      await recarregar();
    } catch (e) { C.avisar(e.message || String(e), "Cartões", "erro"); }
    finally { if (et) { et.hidden = true; et.textContent = ""; } }
  }

  function ligarFatura(el, f, parc) {
    const recarregar = async () => { await C.carregar(); const m = el.closest("#bkMain") || el.parentElement; await pintarCartao(m); };
    const inp = $("ccArquivo"), drop = $("ccDrop");
    inp.addEventListener("change", (e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) enviar(a, f, recarregar); });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-sobre"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-sobre"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-sobre"); const a = e.dataTransfer?.files?.[0]; if (a) enviar(a, f, recarregar); });
    el.querySelector("[data-cc-ver-pagar]")?.addEventListener("click", () => C.verFaturaNoPagar(f.id));
    el.querySelectorAll("[data-cc-conferir]").forEach((b) => b.addEventListener("click", async () => {
      const marcar = b.dataset.ccConferir === "1";
      if (marcar) {
        const total = parc.reduce((s, p) => s + Number(p.valor), 0), vb = f.valor_banco != null ? Number(f.valor_banco) : null;
        if (vb == null) return C.avisar("Envie o arquivo da fatura do banco antes de marcar como conferida.", "Cartões");
        if (Math.abs(vb - total) > 0.01 && !(await C.confirmar("O total do sistema (" + C.brl(total) + ") não bate com a fatura do banco (" + C.brl(vb) + "). Marcar como conferida mesmo assim?", "Marcar"))) return;
      }
      try { await C.rpc("fin_cartao_fatura_salvar", { p_empresa: C.S.emp, p_fatura: f.id, p_dados: { conferida: marcar } }); await recarregar(); }
      catch (e) { C.avisar(e.message, "Cartões", "erro"); }
    }));
    el.querySelectorAll("[data-cc-mover]").forEach((s) => s.addEventListener("change", async () => {
      if (!s.value) return;
      try { await C.rpc("fin_cartao_parcela_mover", { p_empresa: C.S.emp, p_titulo: s.dataset.ccMover, p_fatura: s.value }); C.avisar("Compra passada para a outra fatura.", "Cartões", "sucesso"); await recarregar(); }
      catch (e) { s.value = ""; C.avisar(e.message, "Cartões", "erro"); }
    }));
    renderConc($("ccConc"), T.det, f, recarregar);
    const salvarDre = async (sel, campo) => {
      const id = sel.dataset.ccCat || sel.dataset.ccCc;
      sel.disabled = true;
      try {
        await C.rpc("fin_editar_titulo", { p_empresa: C.S.emp, p_tipo: "pagar", p_id: id, p_dados: { [campo]: sel.value || null } });
        const t = (C.S.pagar || []).find((x) => x.id === id); if (t) t[campo] = sel.value || null;
        sel.classList.add("cc-salvo"); setTimeout(() => sel.classList.remove("cc-salvo"), 1200);
      } catch (e) { C.avisar(e.message, "Cartões", "erro"); }
      finally { sel.disabled = false; }
    };
    el.querySelectorAll("[data-cc-cat]").forEach((sel) => sel.addEventListener("change", () => salvarDre(sel, "categoria_id")));
    el.querySelectorAll("[data-cc-cc]").forEach((sel) => sel.addEventListener("change", () => salvarDre(sel, "centro_custo_id")));
  }

  // arquivo da fatura: a Clara lê (mesma leitura do extrato) e as linhas são conferidas com o sistema
  async function enviar(arquivo, f, recarregar) {
    if (T.busy) return;
    const et = $("ccEtapa"), mostrar = (t) => { if (et) { et.hidden = !t; et.textContent = t || ""; } };
    T.busy = true;
    try {
      mostrar("Lendo a fatura " + arquivo.name + "…");
      const cartao = (C.S.cartoes || []).find((x) => x.id === T.cartao);
      const lido = await window.FinanceiroClara.lerArquivo(arquivo, cartao?.conta_id || (C.S.contas.find((c) => c.ativo && c.tipo !== "caixa") || {}).id);
      let linhas = (lido.linhas || []).filter((x) => Number(x.valor));
      if (!linhas.length) throw new Error("Não encontrei lançamentos nesse arquivo.");
      // compras são a maioria: se vierem negativas no arquivo, troca o sinal (compra = positivo, crédito = negativo)
      const neg = linhas.filter((x) => Number(x.valor) < 0).length;
      if (neg > linhas.length / 2) linhas = linhas.map((x) => ({ ...x, valor: -Number(x.valor) }));
      mostrar("Conferindo " + linhas.length + " linha(s) com as compras do sistema…");
      const r = await C.rpc("fin_cartao_fatura_importar", { p_empresa: C.S.emp, p_fatura: f.id, p_arquivo: lido.arquivo || arquivo.name,
        p_linhas: linhas.map((x) => ({ data: x.data, descricao: [x.descricao, x.contraparte].filter(Boolean).join(" · "), valor: Math.round(Number(x.valor) * 100) / 100 })) });
      C.avisar(r.linhas + " linha(s) lidas; " + r.ligadas + " bateram com compras do sistema.", "Cartões", "sucesso");
      T.sel = new Set(); T.edit = {}; T.selIniciadaCC = false;
      await organizarCC(f, recarregar);
    } catch (e) { console.error(e); C.avisar(e.message || String(e), "Cartões", "erro"); }
    finally { T.busy = false; mostrar(""); }
  }

  window.FinanceiroCartoes = { nav, ligarNav, main };
})();
