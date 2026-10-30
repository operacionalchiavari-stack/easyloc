/* =====================================================
   CONTROLE DE UBER (out/2026, no banco)
   Corrida em andamento aparece só para acompanhar; depois do check-out a logística confere o valor (Enter salva) e
   fecha várias corridas conferidas do MESMO motorista → uma conta a pagar (PIX) + custo por pedido em Resultados.
===================================================== */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const brl = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const dataBr = (v) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "-");
  const horaBr = (v) => (v ? new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");
  const S = { sb: null, emp: null, dados: { corridas: [], fechamentos: [] }, sel: new Set(), podeEditar: true };
  async function rpc(nome, args) { const { data, error } = await S.sb.rpc(nome, args); if (error) throw new Error(error.message || error); return data; }
  const avisar = (m, t = "Controle de Uber", tipo = "aviso") => window.alerta ? window.alerta(m, t, tipo) : alert(m);

  async function carregar() {
    S.dados = await rpc("uber_controle", { p_empresa: S.emp, p_de: null, p_ate: null });
    const mots = [...new Map(S.dados.corridas.map((c) => [c.motorista_id, c.motorista])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const sel = $("ucMotorista"), atual = sel.value;
    sel.innerHTML = '<option value="">Todos</option>' + mots.map(([id, n]) => '<option value="' + id + '">' + esc(n) + "</option>").join("");
    sel.value = mots.some(([id]) => id === atual) ? atual : "";
    for (const id of [...S.sel]) if (!S.dados.corridas.some((c) => c.id === id && !c.fechamento_id && c.conferido_em)) S.sel.delete(id);
    pintar();
  }

  function filtradas() {
    const m = $("ucMotorista").value, st = $("ucSituacao").value, q = $("ucBusca").value.trim().toLowerCase();
    return S.dados.corridas.filter((c) => (st === "fechadas" ? !!c.fechamento_id : !c.fechamento_id) && (!m || c.motorista_id === m) &&
      (!q || [c.pedido, c.cliente, c.motorista, c.destino].some((x) => String(x || "").toLowerCase().includes(q))));
  }

  function linha(c) {
    const aberta = !c.fechamento_id, concl = c.status === "concluida";
    const sit = !concl ? '<span class="cf-pend">Em andamento</span>' : c.conferido_em ? '<span class="cf-ok">Conferida</span><small>' + esc(c.conferido_por || "") + "</small>" : '<span class="cf-pend">A conferir</span>';
    const final = aberta && concl && S.podeEditar
      ? '<div class="cf-final"><input type="number" min="0" step="0.01" data-final="' + c.id + '" value="' + (c.valor_final ?? "") + '" placeholder="R$" aria-label="Valor conferido"><div class="cf-atalhos"><button type="button" data-usar="' + c.id + '">= previsto</button></div></div>'
      : "<b>" + brl(c.valor_final) + "</b>";
    const obs = aberta && concl && S.podeEditar ? '<input class="cf-obs" data-obs="' + c.id + '" value="' + esc(c.obs || "") + '" placeholder="Observação">' : esc(c.obs || "");
    return "<tr" + (S.sel.has(c.id) ? ' class="is-sel"' : "") + ">" +
      (aberta ? '<td class="cf-chk">' + (concl ? '<input type="checkbox" data-sel="' + c.id + '"' + (S.sel.has(c.id) ? " checked" : "") + ' aria-label="Selecionar">' : "") + "</td>" : "<td></td>") +
      "<td><b>" + dataBr(c.data) + "</b><small>" + esc(c.hora || "") + "</small></td>" +
      "<td><b>" + (c.pedido ? "Pedido " + esc(c.pedido) : "-") + "</b><small>" + esc(c.cliente || "") + "</small><small>" + esc(c.etapa || "") + "</small></td>" +
      "<td><small>" + esc(c.ponto_encontro) + " → " + esc(c.destino) + "</small><small>" + String(c.km).replace(".", ",") + " km · " + (c.ida_volta ? "ida e volta" : "só ida") + "</small></td>" +
      "<td><small>Chegou " + horaBr(c.checkin_em) + "</small><small>Saiu " + horaBr(c.checkout_em) + "</small></td>" +
      '<td class="num">' + brl(c.valor) + "</td><td>" + sit + '</td><td class="num">' + final + "</td><td>" + obs + "</td></tr>";
  }

  function pintar() {
    const lista = filtradas(), st = $("ucSituacao").value, grupos = new Map();
    for (const c of lista) { if (!grupos.has(c.motorista_id)) grupos.set(c.motorista_id, []); grupos.get(c.motorista_id).push(c); }
    if (!lista.length) $("ucConteudo").innerHTML = '<div class="cf-vazio">' + (st === "abertas" ? "Nenhuma corrida para conferir. As corridas aparecem aqui depois do check-in do motorista." : "Nenhuma corrida fechada.") + "</div>";
    else {
      const venc = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
      $("ucConteudo").innerHTML = [...grupos.entries()].map(([mid, cs]) => {
        const m = cs[0], sels = cs.filter((c) => S.sel.has(c.id)), tSel = sels.reduce((s, c) => s + Number(c.valor_final || 0), 0);
        const fone = String(m.telefone || "").replace(/\D/g, "");
        return '<section class="cf-bloco cf-grupo"><header><div><h2>' + esc(m.motorista) + '</h2><small><a href="https://wa.me/55' + fone + '" target="_blank" rel="noopener">' + esc(m.telefone) + "</a> · " + esc(m.carro || "") + " · PIX " + esc(m.pix || "-") + "</small></div>" +
          '<div class="cf-tot"><span>' + cs.length + " corrida(s)</span><span>Previsto <b>" + brl(cs.reduce((s, c) => s + Number(c.valor || 0), 0)) + "</b></span></div></header>" +
          '<div class="cf-rolar"><table class="cf-tabela"><thead><tr>' + (st === "abertas" ? '<th class="cf-chk"><input type="checkbox" data-sel-todos="' + mid + '" aria-label="Selecionar todas"' + (cs.some((c) => c.conferido_em) && cs.filter((c) => c.conferido_em && c.status === "concluida").every((c) => S.sel.has(c.id)) ? " checked" : "") + '></th>' : "<th></th>") +
          '<th>Data</th><th>Pedido</th><th>Trajeto</th><th>Check-in / out</th><th class="num">Previsto</th><th>Situação</th><th class="num">Valor conferido</th><th>Observação</th></tr></thead><tbody>' + cs.map(linha).join("") + "</tbody></table></div>" +
          (st === "abertas" && S.podeEditar ? '<footer class="cf-rodape"><span><b>' + sels.length + "</b> selecionada(s) · Total <b>" + brl(tSel) + '</b></span><label>Vencimento<input type="date" data-venc="' + mid + '" value="' + venc + '"></label>' +
            '<input class="cf-obs-fech" data-obsfech="' + mid + '" placeholder="Observação do pagamento (opcional)"><button type="button" class="btn primary" data-fechar="' + mid + '"' + (sels.length ? "" : " disabled") + ">Fechar e enviar ao Contas a Pagar</button></footer>" : "") +
          "</section>";
      }).join("");
    }
    const fechs = S.dados.fechamentos || [];
    $("ucFechamentos").hidden = !fechs.length;
    $("ucFechLista").innerHTML = '<div class="cf-rolar"><table class="cf-tabela"><thead><tr><th>Documento</th><th>Motorista</th><th class="num">Total</th><th>Vencimento</th><th>Situação</th><th>Feito por</th><th></th></tr></thead><tbody>' +
      fechs.map((f) => {
        const sit = f.status === "cancelado" ? "Desfeito" : f.pagar_status === "pago" ? "Pago" : f.pagar_status === "cancelado" ? "Cancelado no Financeiro" : "No Contas a Pagar";
        const pode = f.status === "ativo" && f.pagar_status !== "pago" && S.podeEditar;
        return "<tr" + (f.status === "cancelado" ? ' class="is-desfeito"' : "") + "><td><b>UB-" + String(f.numero).padStart(4, "0") + "</b></td><td>" + esc(f.beneficiario) + '</td><td class="num">' + brl(f.total) + "</td><td>" + dataBr(f.vencimento) + "</td><td>" + sit + "</td><td>" + esc(f.criado_por || "") + "<small>" + new Date(f.criado_em).toLocaleString("pt-BR") + "</small></td><td>" + (pode ? '<button type="button" class="btn" data-desfazer="' + f.id + '">Desfazer</button>' : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  async function conferir(id, valor) {
    const c = S.dados.corridas.find((x) => x.id === id); if (!c || valor == null || !(valor >= 0)) return;
    try {
      await rpc("uber_conferir", { p_empresa: S.emp, p_corrida: id, p_valor: valor, p_obs: document.querySelector('[data-obs="' + id + '"]')?.value || "" });
      await carregar();
    } catch (e) { avisar(e.message); }
  }

  async function fechar(mid) {
    const ids = filtradas().filter((c) => c.motorista_id === mid && S.sel.has(c.id)).map((c) => c.id);
    if (!ids.length) return;
    const total = S.dados.corridas.filter((c) => ids.includes(c.id)).reduce((s, c) => s + Number(c.valor_final || 0), 0);
    const venc = document.querySelector('[data-venc="' + mid + '"]')?.value;
    if (!venc) return avisar("Informe o vencimento.");
    const ok = window.confirmarGlobal ? await window.confirmarGlobal("Fechar " + ids.length + " corrida(s) no total de " + brl(total) + " e enviar ao Contas a Pagar com vencimento em " + dataBr(venc) + "?", "Fechar corridas") : confirm("Fechar?");
    if (!ok) return;
    try {
      const r = await rpc("uber_fechar", { p_empresa: S.emp, p_corridas: ids, p_vencimento: venc, p_obs: document.querySelector('[data-obsfech="' + mid + '"]')?.value || null });
      ids.forEach((id) => S.sel.delete(id));
      avisar("Fechamento " + r.documento + " (" + brl(r.total) + ") enviado ao Contas a Pagar.", "Corridas fechadas", "sucesso");
      await carregar();
    } catch (e) { avisar(e.message); }
  }

  function ligar() {
    ["ucMotorista", "ucSituacao"].forEach((id) => $(id).addEventListener("change", () => { S.sel.clear(); pintar(); }));
    $("ucBusca").addEventListener("input", pintar);
    $("ucAtualizar").addEventListener("click", () => carregar().catch((e) => avisar(e.message)));
    document.addEventListener("click", async (e) => {
      const u = e.target.closest("[data-usar]"); if (u) { const c = S.dados.corridas.find((x) => x.id === u.dataset.usar); return conferir(c.id, Number(c.valor)); }
      const f = e.target.closest("[data-fechar]"); if (f) return fechar(f.dataset.fechar);
      const d = e.target.closest("[data-desfazer]");
      if (d) {
        const ok = window.confirmarGlobal ? await window.confirmarGlobal("Desfazer este fechamento? A conta a pagar é cancelada e as corridas voltam para conferir.", "Desfazer fechamento") : confirm("Desfazer?");
        if (!ok) return;
        try { await rpc("logistica_fechamento_desfazer", { p_empresa: S.emp, p_fechamento: d.dataset.desfazer }); await carregar(); } catch (err) { avisar(err.message); }
      }
    });
    document.addEventListener("change", (e) => {
      const c = e.target.closest("[data-sel]");
      if (c) {
        const x = S.dados.corridas.find((y) => y.id === c.dataset.sel);
        if (c.checked && !x?.conferido_em) { c.checked = false; return avisar("Confira o valor da corrida antes de selecionar."); }
        c.checked ? S.sel.add(c.dataset.sel) : S.sel.delete(c.dataset.sel); return pintar();
      }
      const t = e.target.closest("[data-sel-todos]");
      if (t) { filtradas().filter((x) => x.motorista_id === t.dataset.selTodos && x.conferido_em).forEach((x) => t.checked ? S.sel.add(x.id) : S.sel.delete(x.id)); return pintar(); }
      const fi = e.target.closest("[data-final]"); if (fi && fi.value !== "") return conferir(fi.dataset.final, Number(fi.value));
      const ob = e.target.closest("[data-obs]");
      if (ob) { const x = S.dados.corridas.find((y) => y.id === ob.dataset.obs); if (x && x.valor_final != null) conferir(x.id, Number(x.valor_final)); }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest?.("[data-final]")) { e.preventDefault(); e.target.blur(); } });
  }

  async function iniciar() {
    const ctx = await window.aguardarContexto?.();
    S.sb = window.supabaseClient; S.emp = ctx?.empresa_id || window.__CONTEXT?.empresa_id;
    try { await window.EasyLocPermissions?.load?.(); if (window.EasyLocPermissions?.hasPermission) S.podeEditar = !!window.EasyLocPermissions.hasPermission("logistica.planejamento.editar"); } catch (_) {}
    ligar();
    try { await carregar(); } catch (e) { $("ucConteudo").innerHTML = '<div class="cf-vazio">' + esc(e.message) + "</div>"; }
  }
  iniciar();
})();
