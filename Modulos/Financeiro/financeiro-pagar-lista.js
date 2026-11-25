/* A mesma tabela de A pagar no Financeiro e em Compras. O servidor limita os dados de Compras. */
(() => {
  'use strict';
  function render(C) {
    const { S, esc, brl, dataBr, PRAZOS, noPrazoP, vencido, statusP, cat, contaHtml, fotoFavorecido, cartaoTag, alertaPagar, buscaAoDigitar, detalhesPagar, novoTitulo } = C;
    const $ = id => id === 'finConteudo' ? C.host : C.host.querySelector('#' + id);
    const pintarPagar = () => render(C);
    const comBtn = t => window.FinanceiroComentarios?.botao(t, 'pagar') || '';
    const f = S.filtroP, b = f.busca.trim().toLowerCase();
    const lista = S.pagar.filter((t) => {
      if (f.prazo && !noPrazoP(t, f.prazo)) return false;
      if (f.cat && t.categoria_id !== f.cat) return false;
      if (f.conta && t.conta_id !== f.conta) return false;
      if (f.status === "abertos" && ["pago", "cancelado"].includes(t.status)) return false;
      if (f.status === "aprovar" && !(t.requer_aprovacao && t.aprovacao === "pendente" && t.status !== "cancelado")) return false;
      if (f.status === "vencidos" && !vencido(t)) return false;
      if (f.status === "pagos" && t.status !== "pago") return false;
      if (f.status === "cancelados" && t.status !== "cancelado") return false;
      if (f.status !== "cancelados" && f.status !== "todos" && t.status === "cancelado") return false;
      if (b && ![t.fornecedor_nome, t.descricao, t.documento].join(" ").toLowerCase().includes(b)) return false;
      return true;
    });
    { const g = new Map(), out = [];
      lista.forEach((t) => {
        if (t.fatura_id && !t.fechamento_parcela_id) {
          let x = g.get("fat:" + t.fatura_id);
          if (!x) {
            const fa = (S.faturas || []).find((y) => y.id === t.fatura_id) || {}, ct = (S.cartoes || []).find((y) => y.id === (fa.cartao_id || t.cartao_id)) || {};
            x = { sintetico: true, fatura: true, id: "fat:" + t.fatura_id, fa, cartao: ct, fornecedor_nome: ct.nome || "Cartão de crédito", descricao: "Fatura " + (ct.nome || "do cartão"),
              vencimento: fa.vencimento || t.vencimento, programado_para: null, valor: 0, aberto: 0, pago: 0, parcela: 1, parcelas: 1, conta_id: ct.conta_id || t.conta_id, status: "pago", comp: [] };
            g.set("fat:" + t.fatura_id, x); out.push(x);
          }
          x.comp.push(t); x.valor += Number(t.valor || 0); x.aberto += Number(t.aberto || 0); x.pago += Number(t.pago || 0);
          if (!["pago", "cancelado"].includes(t.status)) x.status = x.pago > 0 ? "parcial" : "aberto";
          return;
        }
        if (!t.fechamento_parcela_id) { out.push(t); return; }
        let x = g.get(t.fechamento_parcela_id);
        if (!x) {
          const fp = (S.fechParcelas || []).find((y) => y.id === t.fechamento_parcela_id) || {};
          x = { sintetico: true, id: "fp:" + t.fechamento_parcela_id, fp, fornecedor_nome: t.fornecedor_nome, fornecedor_id: t.fornecedor_id, descricao: "Fechamento " + (fp.referencia || ""),
            vencimento: t.vencimento, programado_para: null, valor: 0, aberto: 0, pago: 0, parcela: fp.numero || 1, parcelas: fp.total || 1, conta_id: t.conta_id, status: "pago", comp: [] };
          g.set(t.fechamento_parcela_id, x); out.push(x);
        }
        x.comp.push(t); x.valor += Number(t.valor || 0); x.aberto += Number(t.aberto || 0); x.pago += Number(t.pago || 0);
        if (!["pago", "cancelado"].includes(t.status)) x.status = x.pago > 0 ? "parcial" : "aberto";
      });
      lista.length = 0; out.forEach((t) => lista.push(t));
      lista.sort((a, c) => String(a.vencimento || "9999").localeCompare(String(c.vencimento || "9999"))); }
    const linhaAgrupada = (t) => {
      const [cls, rot] = statusP(t), fa = t.fa || {}, fp = t.fp || {};
      const sub = t.fatura ? t.comp.length + " compra(s)" + (fa.virada ? " · virou em " + dataBr(fa.virada) : "") + (fa.conferida_em ? " · conferida" : "")
        : t.comp.length + " conta(s)" + (fp.nf_numero ? " · NF " + fp.nf_numero : "");
      return '<tr class="fin-fech-linha fin-fat-linha" ' + (t.fatura ? 'data-fat-linha="' + esc(t.id.slice(4)) + '" title="Ver as compras desta fatura"' : 'data-fech-linha="' + esc(t.id.slice(3)) + '" data-fech-fech="' + esc(fp.fechamento_id || "") + '" title="Ver as contas desta parcela"') + ' tabindex="0" aria-expanded="false"><td>' +
        '<span class="fin-fat-ic" aria-hidden="true">▸</span>' + dataBr(t.vencimento) + alertaPagar(t) + "</td><td>" + esc(t.fornecedor_nome || "-") + (t.fatura && t.cartao.final ? " <small>final " + esc(t.cartao.final) + "</small>" : "") + "</td><td>" +
        '<div class="fin-pag-descricao">' + esc(t.descricao) + (t.parcelas > 1 ? " <small>(" + t.parcela + "/" + t.parcelas + ")</small>" : "") + "</div><small>" + esc(sub) + "</small></td><td>Várias</td><td>" + contaHtml(t.conta_id) +
        '</td><td class="num">' + brl(t.valor) + '</td><td class="num">' + brl(t.aberto) + '</td><td><span class="fin-status ' + cls + '">' + esc(rot) + '</span></td><td><small class="fin-sub-acao">' + (t.fatura ? "paga pela fatura" : "paga pelo fechamento") + "</small></td></tr>";
    };
    $("finConteudo").innerHTML =
      '<div class="fin-barra-ferr"><input type="search" id="fpBusca" placeholder="Buscar fornecedor, descrição, documento" value="' + esc(f.busca) + '">' +
      '<select id="fpStatus">' + [["abertos", "Em aberto"], ["aprovar", "Aguardando aprovação"], ["vencidos", "Vencidos"], ["pagos", "Pagos"], ["cancelados", "Cancelados"], ["todos", "Todos"]].map(([v, r]) => '<option value="' + v + '"' + (f.status === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<select id="fpCat"><option value="">Todas as categorias</option>' + S.cats.filter((c) => c.tipo === "saida" && (c.ativo !== false || c.id === f.cat)).map((c) => '<option value="' + c.id + '"' + (f.cat === c.id ? " selected" : "") + ">" + esc(c.nome) + "</option>").join("") + "</select>" +
      '<div class="fin-prazos" role="group" aria-label="Filtrar por vencimento">' + PRAZOS.map(([k, r]) => { const n = S.pagar.filter((t) => noPrazoP(t, k)).length; return '<button type="button" class="fin-prazo' + (f.prazo === k ? " ativa" : "") + '" data-prazo-p="' + k + '" aria-pressed="' + (f.prazo === k) + '">' + r + (n ? '<span class="fin-prazo-n">' + n + "</span>" : "") + "</button>"; }).join("") + "</div>" +
      // "Pagas": atalho para ver só o que já foi pago (é o filtro de status "Pagos"); clicar de novo volta.
      '<span class="fin-esp"></span><button type="button" class="fin-recebidas-btn" id="fpPagas" aria-pressed="' + (f.status === "pagos") + '">Pagas</button>' +
      (C.somenteConsulta ? '' : '<button class="fin-btn" id="fpNovo">+ Novo pagamento</button>') + '</div>' +
      (lista.length ? '<section class="fin-bloco"><div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Vencimento</th><th>Fornecedor</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th class="num">Valor</th><th class="num">Em aberto</th><th>Status</th><th></th></tr></thead><tbody>' +
        lista.map((t) => {
          if (t.sintetico) return linhaAgrupada(t);
          const [cls, rot] = statusP(t), c = cat(t.categoria_id);
          const bloqueadoServico = t.manutencao_confirmada === false;
          const aberto = !["pago", "cancelado"].includes(t.status), aguard = t.requer_aprovacao && t.aprovacao === "pendente";
          return '<tr class="fin-linha-click" data-p-linha="' + t.id + '" tabindex="0" title="Ver detalhes"><td>' + comBtn(t) + dataBr(t.vencimento) + alertaPagar(t) + '</td><td class="fin-quem"><div class="fin-quem-foto">' + fotoFavorecido(t) + "<span>" + esc(t.fornecedor_nome || "-") + "</span></div>" + "</td><td>" + esc(t.descricao) + (bloqueadoServico ? '<small class="text-danger" style="display:block;margin-top:5px">Pagar somente após confirmação do serviço em Compras → Serviços.</small>' : t.manutencao_confirmada === true ? '<small style="display:block;margin-top:5px">Serviço confirmado em Compras.</small>' : '') + (t.parcelas > 1 ? " <small>(" + t.parcela + "/" + t.parcelas + ")</small>" : "") + cartaoTag(t) + (t.aguardando_fechamento ? '<small class="fin-fech-tag" title="Parceiro com fechamento (mensal ou semanal): entra no próximo fechamento dele (aba Fechamentos de parceiros)">Vai no fechamento do parceiro</small>' : "") + "</td><td>" + esc(c?.nome || "-") +
            "</td><td>" + contaHtml(t.conta_id) + '</td><td class="num">' + brl(t.valor) + '</td><td class="num">' + brl(t.aberto) + '</td><td><span class="fin-status ' + cls + '">' + esc(rot) + "</span></td>" +
            '<td><div class="acoes">' + (!C.somenteConsulta && aguard ? '<button class="fin-btn peq" data-p-aprovar="' + t.id + '">Aprovar</button><button class="fin-btn peq verm" data-p-reprovar="' + t.id + '">Reprovar</button>' : "") +
            (!C.somenteConsulta && S.baixaManual?.baixa_manual_pagar && aberto && !aguard && !bloqueadoServico && !t.fatura_id && !t.aguardando_fechamento && t.aprovacao !== "reprovada" && Number(t.aberto) > 0.005 ? '<button class="fin-btn peq verde" data-p-baixar="' + t.id + '">Pago</button>' : "") +
            "</div></td></tr>";
        }).join("") + "</tbody></table></div></section>" : '<div class="fin-vazio">Nenhuma conta a pagar com esses filtros.</div>');
    // linhas agrupadas (fatura do cartão / parcela de fechamento): clique abre embaixo as contas que a compõem
    $("finConteudo").querySelectorAll("[data-fat-linha],[data-fech-linha]").forEach((tr) => {
      const alternar = (e) => {
        if (e.target.closest("button,a,select,input")) return;
        if (tr.nextElementSibling?.classList.contains("fin-fech-comp")) { tr.nextElementSibling.remove(); tr.setAttribute("aria-expanded", "false"); tr.classList.remove("is-aberta"); return; }
        const fat = tr.dataset.fatLinha;
        const comp = S.pagar.filter((x) => (fat ? x.fatura_id === fat : x.fechamento_parcela_id === tr.dataset.fechLinha) && x.status !== "cancelado")
          .sort((a, c) => String(a.cartao_compra_em || a.emissao || "").localeCompare(String(c.cartao_compra_em || c.emissao || "")));
        const ex = document.createElement("tr"); ex.className = "fin-fech-comp";
        ex.innerHTML = '<td colspan="' + tr.children.length + '"><table class="fin-tabela fin-fech-comp-tab"><thead><tr><th>' + (fat ? "Compra em" : "Data") + "</th><th>Favorecido</th><th>Descrição</th><th>Categoria</th><th>Status</th><th class=\"num\">Valor</th></tr></thead><tbody>" +
          comp.map((x) => { const [c2, r2] = statusP(x); return '<tr class="fin-linha-click" data-p-linha="' + x.id + '"><td>' + comBtn(x) + dataBr(x.cartao_compra_em || x.emissao) + "</td><td>" + esc(x.fornecedor_nome || "-") + "</td><td>" + esc(x.descricao || "") + (x.parcelas > 1 ? " <small>(" + x.parcela + "/" + x.parcelas + ")</small>" : "") +
            "</td><td>" + esc(cat(x.categoria_id)?.nome || "-") + '</td><td><span class="fin-status ' + c2 + '">' + esc(r2) + '</span></td><td class="num">' + brl(x.valor) + "</td></tr>"; }).join("") +
          '</tbody><tfoot><tr><td colspan="5">' + (C.somenteConsulta ? "Total das compras" : fat ? "Total da fatura" : "Total da parcela") + '</td><td class="num">' + brl(comp.reduce((a, x) => a + Number(x.valor || 0), 0)) + "</td></tr></tfoot></table></td>";
        tr.after(ex); tr.setAttribute("aria-expanded", "true"); tr.classList.add("is-aberta");
      };
      tr.addEventListener("click", alternar);
      tr.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === tr) { e.preventDefault(); alternar(e); } });
    });
    if (S.focoFat || S.focoFech) {
      const sel = S.focoFat ? '[data-fat-linha="' + S.focoFat + '"]' : '[data-fech-fech="' + S.focoFech + '"]'; S.focoFat = S.focoFech = null;
      const alvos = [...$("finConteudo").querySelectorAll(sel)];
      if (alvos.length) { alvos.forEach((a) => a.classList.add("fin-fat-foco")); alvos[0].click(); requestAnimationFrame(() => alvos[0].scrollIntoView({ block: "center", behavior: "smooth" })); setTimeout(() => alvos.forEach((a) => a.classList.remove("fin-fat-foco")), 4000); }
    }
    $("finConteudo").querySelectorAll("[data-p-linha]").forEach((tr) => tr.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === tr) { e.preventDefault(); detalhesPagar(tr.dataset.pLinha); } }));
    const at = () => { const status = $("fpStatus").value; S.filtroP = { busca: $("fpBusca").value, status, cat: $("fpCat").value, conta: "", prazo: status === "abertos" ? S.filtroP.prazo : "" }; pintarPagar(); };
    buscaAoDigitar("fpBusca", at);
    ["fpStatus", "fpCat"].forEach((id) => $(id).addEventListener("change", at));
    // clicar de novo no atalho escolhido volta a mostrar tudo em aberto
    $("finConteudo").querySelectorAll("[data-prazo-p]").forEach((b) => b.addEventListener("click", () => { S.filtroP = { ...S.filtroP, status: "abertos", prazo: S.filtroP.prazo === b.dataset.prazoP ? "" : b.dataset.prazoP }; pintarPagar(); }));
    $("fpPagas").addEventListener("click", () => { S.filtroP = { ...S.filtroP, prazo: "", status: S.filtroP.status === "pagos" ? "abertos" : "pagos" }; pintarPagar(); });
    $("fpNovo")?.addEventListener("click", () => novoTitulo("pagar"));
  }

  function contexto(S, host) {
    const $ = id => id === 'finConteudo' ? host : host.querySelector('#' + id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const hoje = () => new Date().toISOString().slice(0, 10);
  const dataBr = (d) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "-");
  const PRAZOS = [["vencidos", "Vencidos", (d) => d < 0], ["hoje", "Vence hoje", (d) => d === 0], ["semana", "Próximos 7 dias", (d) => d >= 1 && d <= 7]];
  const noPrazoP = (t, chave) => { const d = diasParaPagar(t); return d !== null && PRAZOS.find(([k]) => k === chave)[2](d); };
  const vencido = (t) => ["aberto", "parcial", "pendente", "aprovado", "programado"].includes(t.status) && (t.programado_para || t.vencimento) < hoje();
  const CAMPOS_COFRE = ["agencia", "conta", "titular_documento", "pix_chave"];
  const vis = (c, k) => { const v = c && c[k]; if (!v) return ""; if (String(v).startsWith("cofre:")) return (c.cofre_mascaras || {})[k] || "••••"; return String(v); };
    const conta = id => S.contas.find(c => c.id === id);
    const cat = id => S.cats.find(c => c.id === id);
    let buscaTimer = 0;
  function diasParaPagar(t) {
    if (["pago", "cancelado"].includes(t.status) || !(Number(t.aberto) > 0.005)) return null;
    const v = String(t.programado_para || t.vencimento || "").slice(0, 10); if (!v) return null;
    const dia = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    return Math.round((dia(v) - dia(new Date().toLocaleDateString("sv-SE"))) / 86400000);
  }
  function alertaPagar(t) {
    const dias = diasParaPagar(t);
    if (dias === null || dias > 7) return "";
    const txt = dias < -1 ? "Venceu há " + -dias + " dias" : dias === -1 ? "Venceu ontem" : dias === 0 ? "Vence hoje" : dias === 1 ? "Vence amanhã" : "Vence em " + dias + " dias";
    return '<span class="fin-venc-alerta ' + (dias <= 3 ? "vermelho" : "amarelo") + '"><i aria-hidden="true"></i>' + txt + "</span>";
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
  function fotoFavorecido(t, cls = "peq") {
    const nome = String(t.fornecedor_nome || "").trim();
    let url = null;
    if (t.origem === "bv") url = (S.clientes || []).find((c) => c.id === t.fornecedor_id)?.catalogo_logo_url;
    else if (t.origem === "free") url = S.fotoFree?.[t.id];
    else url = (S.fornecedores || []).find((f) => f.id === t.fornecedor_id)?.foto_url;
    const ini = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
    return '<span class="fin-cli-foto ' + cls + '" title="' + esc(nome) + '"><i>' + esc(ini) + "</i>" + (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>";
  }
  function contaHtml(id) {
    const c = conta(id);
    if (!c) return '<div class="fin-conta-cel sem">Sem conta</div>';
    return '<div class="fin-conta-cel"><b>' + esc(c.nome) + "</b><small>" + esc([vis(c, "titular_documento"), c.pix_chave ? "PIX " + vis(c, "pix_chave") : ""].filter(Boolean).join(" · ")) + "</small></div>";
  }
  function buscaAoDigitar(id, aplicar){
    const inp = $(id); if (!inp) return;
    const rodar = () => {
      clearTimeout(buscaTimer);
      const pos = inp.selectionStart;
      aplicar();
      const novo = $(id);
      if (novo){ novo.focus(); try { novo.setSelectionRange(pos, pos); } catch (_) {} }
    };
    inp.addEventListener("input", () => { clearTimeout(buscaTimer); buscaTimer = setTimeout(rodar, 220); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") rodar(); });
    inp.addEventListener("search", rodar);
  }
  const cartaoTag = (t) => { if (!t.cartao_id) return ""; const c = (S.cartoes || []).find((x) => x.id === t.cartao_id);
    return '<small class="fin-cartao-tag" title="Paga junto com a fatura do cartão (Bancos e cartões → Cartões)">💳 ' + esc((c?.nome || "Cartão") + (c?.final ? " final " + c.final : "")) + " · fatura " + dataBr(t.vencimento) + (t.cartao_compra_em ? " · compra " + dataBr(t.cartao_compra_em) : "") + "</small>"; };
    return {S, host, esc, brl, dataBr, PRAZOS, noPrazoP, vencido, statusP, cat, contaHtml, fotoFavorecido, cartaoTag, alertaPagar, buscaAoDigitar};
  }

  window.FinanceiroPagarLista = {render, contexto};
})();
