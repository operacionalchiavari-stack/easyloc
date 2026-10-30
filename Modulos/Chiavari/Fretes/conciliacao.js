/* =====================================================
   CONCILIAÇÃO DE FRETES (out/2026, no banco)
   - "Sistema": cada caminhão escalado no Painel Logístico, separado em Entrega (carregamento/montagem) e Coleta
     (desmontagem/descarregamento). Valor = valor/km da categoria do caminhão × km do pedido ÷ 2 (frete_sincronizar).
   - "Transportadora": o que ela informou no Cadastro de Fretes (pode lançar viagem extra).
   - Valor final: a logística define (Enter salva) e fecha várias viagens da MESMA transportadora → uma conta a pagar
     no Financeiro e um custo por pedido em Resultados (frete_fechar). Desfazer (sem pagamento) reabre as viagens.
===================================================== */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const brl = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const dataBr = (v) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "-");
  const num = (v) => (v == null || v === "" ? null : Number(v));
  const S = { sb: null, emp: null, dados: { viagens: [], fechamentos: [] }, sel: new Set(), podeEditar: false };

  async function rpc(nome, args) { const { data, error } = await S.sb.rpc(nome, args); if (error) throw new Error(error.message || error); return data; }
  const avisar = (m, t = "Conciliação de Fretes", tipo = "aviso") => window.alerta ? window.alerta(m, t, tipo) : alert(m);

  async function carregar() {
    S.dados = await rpc("frete_conciliacao", { p_empresa: S.emp, p_de: null, p_ate: null });
    const fornecs = [...new Map(S.dados.viagens.filter((v) => v.fornecedor_id).map((v) => [v.fornecedor_id, v.fornecedor])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const sel = $("cfTransp"), atual = sel.value;
    sel.innerHTML = '<option value="">Todas</option>' + fornecs.map(([id, n]) => '<option value="' + id + '">' + esc(n) + "</option>").join("");
    sel.value = fornecs.some(([id]) => id === atual) ? atual : "";
    const sf = Number(S.dados.sem_fornecedor || 0);
    $("cfAvisoForn").hidden = !sf;
    $("cfAvisoForn").textContent = sf ? sf + " caminhão(ões) escalado(s) sem fornecedor: os fretes deles não entram aqui. Ligue o caminhão à transportadora em Logística > Caminhões." : "";
    for (const id of [...S.sel]) if (!S.dados.viagens.some((v) => v.id === id && v.status === "aberto")) S.sel.delete(id);
    pintar();
  }

  function filtradas() {
    const t = $("cfTransp").value, st = $("cfSituacao").value, q = $("cfBusca").value.trim().toLowerCase();
    return S.dados.viagens.filter((v) => v.status === st && (!t || v.fornecedor_id === t) &&
      (!q || [v.pedido, v.cliente, v.caminhao, v.fornecedor].some((x) => String(x || "").toLowerCase().includes(q))));
  }

  function linha(v) {
    const aberto = v.status === "aberto", dif = v.valor_transportadora != null ? Number(v.valor_transportadora) - Number(v.valor_sistema) : null;
    const tipo = '<span class="cf-tipo ' + v.direcao + '">' + (v.direcao === "entrega" ? "Entrega" : "Coleta") + "</span>" + (v.extra ? '<span class="cf-tipo extra" title="Lançada pela transportadora, sem estar escalada">Extra</span>' : "") + (v.fora_escala ? '<span class="cf-tipo fora" title="O caminhão saiu da escala depois de a transportadora informar o valor">Fora da escala</span>' : "");
    const difHtml = dif == null ? '<span class="cf-pend">aguardando</span>' : Math.abs(dif) < 0.005 ? '<span class="cf-ok">igual</span>' : '<span class="' + (dif > 0 ? "cf-mais" : "cf-menos") + '">' + (dif > 0 ? "+" : "") + brl(dif) + "</span>";
    const final = aberto && S.podeEditar
      ? '<div class="cf-final"><input type="number" min="0" step="0.01" data-final="' + v.id + '" value="' + (v.valor_final ?? "") + '" placeholder="R$" aria-label="Valor final"><div class="cf-atalhos">' +
        '<button type="button" data-usar="sistema" data-id="' + v.id + '">= sistema</button>' + (v.valor_transportadora != null ? '<button type="button" data-usar="transp" data-id="' + v.id + '">= transportadora</button>' : "") + "</div></div>"
      : "<b>" + brl(v.valor_final) + "</b>";
    const obs = aberto && S.podeEditar ? '<input class="cf-obs" data-obs="' + v.id + '" value="' + esc(v.obs || "") + '" placeholder="Observação">' : esc(v.obs || "");
    return "<tr" + (S.sel.has(v.id) ? ' class="is-sel"' : "") + ">" +
      (aberto ? '<td class="cf-chk"><input type="checkbox" data-sel="' + v.id + '"' + (S.sel.has(v.id) ? " checked" : "") + (v.valor_final == null ? ' title="Defina o valor final para poder fechar"' : "") + ' aria-label="Selecionar"></td>' : '<td></td>') +
      "<td><b>" + (v.pedido ? "Pedido " + esc(v.pedido) : "Sem pedido") + "</b><small>" + esc(v.cliente || "") + "</small></td>" +
      "<td>" + tipo + "<small>" + dataBr(v.data) + "</small></td>" +
      "<td>" + esc(v.caminhao || "-") + (v.categoria ? "<small>Categoria " + esc(v.categoria) + "</small>" : "") + "</td>" +
      "<td><small>" + esc(v.origem || "") + " → " + esc(v.destino || "") + "</small>" + (Number(v.km) ? "<small>" + String(v.km).replace(".", ",") + " km</small>" : "") + "</td>" +
      '<td class="num">' + brl(v.valor_sistema) + "</td>" +
      '<td class="num">' + brl(v.valor_transportadora) + (v.transp_obs ? '<small title="' + esc(v.transp_obs) + '">' + esc(v.transp_obs) + "</small>" : "") + "</td>" +
      '<td class="num">' + difHtml + "</td>" +
      '<td class="num">' + final + "</td><td>" + obs + "</td></tr>";
  }

  function pintar() {
    const lista = filtradas(), st = $("cfSituacao").value;
    const grupos = new Map();
    for (const v of lista) { const k = v.fornecedor_id || ""; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(v); }
    if (!lista.length) {
      $("cfConteudo").innerHTML = '<div class="cf-vazio">' + (st === "aberto" ? "Nenhuma viagem em aberto. As viagens aparecem quando um caminhão de transportadora é escalado no Painel Logístico." : "Nenhuma viagem fechada.") + "</div>";
    } else {
      const venc = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      $("cfConteudo").innerHTML = [...grupos.entries()].map(([fid, vs]) => {
        vs.sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.pedido).localeCompare(String(b.pedido), "pt-BR", { numeric: true }) || a.direcao.localeCompare(b.direcao));
        const tSist = vs.reduce((s, v) => s + Number(v.valor_sistema || 0), 0), tTransp = vs.reduce((s, v) => s + Number(v.valor_transportadora || 0), 0);
        const sels = vs.filter((v) => S.sel.has(v.id)), tSel = sels.reduce((s, v) => s + Number(v.valor_final || 0), 0);
        const pend = vs.filter((v) => v.valor_transportadora == null).length;
        return '<section class="cf-bloco cf-grupo" data-grupo="' + fid + '"><header><div><h2>' + esc(vs[0].fornecedor || "Sem fornecedor") + "</h2><small>" + vs.length + " viagem(ns)" + (st === "aberto" && pend ? " · " + pend + " sem valor da transportadora" : "") + "</small></div>" +
          '<div class="cf-tot"><span>Sistema <b>' + brl(tSist) + "</b></span><span>Transportadora <b>" + brl(tTransp) + "</b></span></div></header>" +
          '<div class="cf-rolar"><table class="cf-tabela"><thead><tr>' + (st === "aberto" ? '<th class="cf-chk"><input type="checkbox" data-sel-todos="' + fid + '" aria-label="Selecionar todas"' + (vs.some((v) => v.valor_final != null) && vs.filter((v) => v.valor_final != null).every((v) => S.sel.has(v.id)) ? " checked" : "") + '></th>' : "<th></th>") +
          '<th>Pedido</th><th>Tipo · data</th><th>Caminhão</th><th>Trajeto</th><th class="num">Sistema</th><th class="num">Transportadora</th><th class="num">Diferença</th><th class="num">Valor final</th><th>Observação</th></tr></thead><tbody>' +
          vs.map(linha).join("") + "</tbody></table></div>" +
          (st === "aberto" && S.podeEditar ? '<footer class="cf-rodape"><span><b>' + sels.length + "</b> selecionada(s) · Total final <b>" + brl(tSel) + "</b></span>" +
            '<label>Vencimento<input type="date" data-venc="' + fid + '" value="' + venc + '"></label><input class="cf-obs-fech" data-obsfech="' + fid + '" placeholder="Observação do pagamento (opcional)">' +
            '<button type="button" class="btn primary" data-fechar="' + fid + '"' + (sels.length ? "" : " disabled") + ">Fechar e enviar ao Contas a Pagar</button></footer>" : "") +
          "</section>";
      }).join("");
    }
    const fechs = S.dados.fechamentos || [];
    $("cfFechamentos").hidden = !fechs.length;
    $("cfFechLista").innerHTML = '<div class="cf-rolar"><table class="cf-tabela"><thead><tr><th>Documento</th><th>Transportadora</th><th class="num">Total</th><th>Vencimento</th><th>Situação</th><th>Feito por</th><th></th></tr></thead><tbody>' +
      fechs.map((f) => {
        const sit = f.status === "cancelado" ? "Desfeito" : f.pagar_status === "pago" ? "Pago" : f.pagar_status === "cancelado" ? "Cancelado no Financeiro" : "No Contas a Pagar";
        const pode = f.status === "ativo" && f.pagar_status !== "pago" && !(Number(f.pago) > 0) && S.podeEditar;
        return "<tr" + (f.status === "cancelado" ? ' class="is-desfeito"' : "") + "><td><b>FR-" + String(f.numero).padStart(4, "0") + "</b></td><td>" + esc(f.beneficiario) + '</td><td class="num">' + brl(f.total) + "</td><td>" + dataBr(f.vencimento) + "</td><td>" + sit + "</td><td>" + esc(f.criado_por || "") + "<small>" + new Date(f.criado_em).toLocaleString("pt-BR") + "</small></td><td>" + (pode ? '<button type="button" class="btn" data-desfazer="' + f.id + '">Desfazer</button>' : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  async function salvarFinal(id, valor) {
    const v = S.dados.viagens.find((x) => x.id === id); if (!v) return;
    const obs = document.querySelector('[data-obs="' + id + '"]')?.value ?? v.obs ?? "";
    try {
      const novo = await rpc("frete_definir_final", { p_empresa: S.emp, p_viagem: id, p_valor: valor, p_obs: obs });
      Object.assign(v, novo);
      if (valor == null) S.sel.delete(id);
      pintar();
    } catch (e) { avisar(e.message); }
  }

  async function fechar(fid) {
    const ids = filtradas().filter((v) => (v.fornecedor_id || "") === fid && S.sel.has(v.id)).map((v) => v.id);
    if (!ids.length) return;
    const semFinal = S.dados.viagens.filter((v) => ids.includes(v.id) && v.valor_final == null).length;
    if (semFinal) return avisar("Defina o valor final de todas as viagens selecionadas (" + semFinal + " sem valor).");
    const total = S.dados.viagens.filter((v) => ids.includes(v.id)).reduce((s, v) => s + Number(v.valor_final || 0), 0);
    const venc = document.querySelector('[data-venc="' + fid + '"]')?.value;
    if (!venc) return avisar("Informe o vencimento.");
    const ok = window.confirmarGlobal ? await window.confirmarGlobal("Fechar " + ids.length + " viagem(ns) no total de " + brl(total) + " e enviar ao Contas a Pagar com vencimento em " + dataBr(venc) + "?", "Fechar fretes") : confirm("Fechar?");
    if (!ok) return;
    try {
      const r = await rpc("frete_fechar", { p_empresa: S.emp, p_viagens: ids, p_vencimento: venc, p_obs: document.querySelector('[data-obsfech="' + fid + '"]')?.value || null });
      ids.forEach((id) => S.sel.delete(id));
      avisar("Fechamento " + r.documento + " (" + brl(r.total) + ") enviado ao Contas a Pagar. O custo de cada pedido já aparece em Financeiro > Resultados.", "Fretes fechados", "sucesso");
      await carregar();
    } catch (e) { avisar(e.message); }
  }

  function ligar() {
    ["cfTransp", "cfSituacao"].forEach((id) => $(id).addEventListener("change", () => { S.sel.clear(); pintar(); }));
    $("cfBusca").addEventListener("input", pintar);
    $("cfAtualizar").addEventListener("click", () => carregar().catch((e) => avisar(e.message)));
    document.addEventListener("click", async (e) => {
      const u = e.target.closest("[data-usar]");
      if (u) { const v = S.dados.viagens.find((x) => x.id === u.dataset.id); return salvarFinal(u.dataset.id, u.dataset.usar === "sistema" ? Number(v.valor_sistema) : Number(v.valor_transportadora)); }
      const f = e.target.closest("[data-fechar]"); if (f) return fechar(f.dataset.fechar);
      const d = e.target.closest("[data-desfazer]");
      if (d) {
        const ok = window.confirmarGlobal ? await window.confirmarGlobal("Desfazer este fechamento? A conta a pagar é cancelada e as viagens voltam para Em aberto.", "Desfazer fechamento") : confirm("Desfazer?");
        if (!ok) return;
        try { await rpc("logistica_fechamento_desfazer", { p_empresa: S.emp, p_fechamento: d.dataset.desfazer }); await carregar(); } catch (err) { avisar(err.message); }
      }
    });
    document.addEventListener("change", (e) => {
      const c = e.target.closest("[data-sel]");
      if (c) {
        const v = S.dados.viagens.find((x) => x.id === c.dataset.sel);
        if (c.checked && v?.valor_final == null) { c.checked = false; return avisar("Defina o valor final antes de selecionar."); }
        c.checked ? S.sel.add(c.dataset.sel) : S.sel.delete(c.dataset.sel); return pintar();
      }
      const t = e.target.closest("[data-sel-todos]");
      if (t) {
        filtradas().filter((v) => (v.fornecedor_id || "") === t.dataset.selTodos && v.valor_final != null).forEach((v) => t.checked ? S.sel.add(v.id) : S.sel.delete(v.id));
        return pintar();
      }
      const fi = e.target.closest("[data-final]"); if (fi) return salvarFinal(fi.dataset.final, num(fi.value));
      const ob = e.target.closest("[data-obs]");
      if (ob) { const v = S.dados.viagens.find((x) => x.id === ob.dataset.obs); if (v) salvarFinal(v.id, v.valor_final == null ? null : Number(v.valor_final)); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const fi = e.target.closest?.("[data-final]"); if (!fi) return;
      e.preventDefault();
      const todos = [...document.querySelectorAll("[data-final]")], i = todos.indexOf(fi), prox = todos[i + 1]?.dataset.final;
      fi.blur();
      setTimeout(() => { const n = prox && document.querySelector('[data-final="' + prox + '"]'); if (n) { n.focus(); n.select?.(); } }, 250);
    });
  }

  async function iniciar() {
    const ctx = await window.aguardarContexto?.();
    S.sb = window.supabaseClient; S.emp = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    try { await window.EasyLocPermissions?.load?.(); S.podeEditar = window.EasyLocPermissions?.hasPermission ? !!window.EasyLocPermissions.hasPermission("logistica.planejamento.editar") : true; } catch (_) { S.podeEditar = true; }
    ligar();
    try { await carregar(); } catch (e) { $("cfConteudo").innerHTML = '<div class="cf-vazio">' + esc(e.message) + "</div>"; }
  }
  iniciar();
})();
