/* Acompanhamento simples (nov/2026) nas abas Pré-reserva, Orçamento e Catálogo da Central de Pedidos.
   A linha é a mesma dos pedidos; no lugar do Fluxo entram colunas: "Orçamento enviado" (automático, data do pedido ou
   do envio do projeto), os acompanhamentos registrados (data + motivo de não estar fechando) e o próximo contato
   (N dias depois, N em Parâmetros > Comercial). Botões: Registrar acompanhamento e Cliente decidiu não fechar.
   Banco: comercial_followup_lista / _registrar / _nao_fechou (migration 20261105000100). */
(() => {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const somaDias = (iso, n) => { const d = new Date(String(iso).slice(0, 10) + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const diaLocal = (v) => !v ? "" : String(v).includes("T") ? new Date(v).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : String(v).slice(0, 10);
  const br = (iso) => iso ? String(iso).slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "—";
  const brAno = (iso) => iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—";
  const dias = (iso) => Math.round((new Date(iso + "T12:00:00") - new Date(hoje() + "T12:00:00")) / 864e5);

  const S = { sb: null, empresa: null, pedido: () => null, aoMudar: () => {}, cfg: { dias: 3, motivos: [] }, lista: new Map(), encerrados: new Map(), pronto: false };
  const chave = (p) => p?.origemCatalogo ? "projeto:" + p.projetoId : "pedido:" + p?.id;
  const alvo = (p) => p?.origemCatalogo ? { tipo: "projeto", id: p.projetoId } : { tipo: "pedido", id: p.id };

  async function carregar() {
    if (!S.sb || !S.empresa) return;
    try {
      const { data, error } = await S.sb.rpc("comercial_followup_lista", { p_empresa: S.empresa });
      if (error) throw error;
      S.cfg = data?.config || S.cfg;
      S.lista = new Map(); S.encerrados = new Map();
      (data?.acompanhamentos || []).forEach((a) => { const k = a.alvo_tipo + ":" + a.alvo_id; if (!S.lista.has(k)) S.lista.set(k, []); S.lista.get(k).push(a); });
      (data?.encerrados || []).forEach((e) => S.encerrados.set(e.alvo_tipo + ":" + e.alvo_id, e));
      S.pronto = true;
    } catch (e) { console.warn("Acompanhamentos indisponíveis:", e.message || e); }
  }

  function situacao(p) {
    const lista = S.lista.get(chave(p)) || [];
    const enviado = diaLocal(p.criadoEm || p.data);
    const ultimo = lista[lista.length - 1];
    const proximo = ultimo?.proximo || (enviado ? somaDias(enviado, Number(S.cfg.dias) || 3) : "");
    return { lista, enviado, proximo };
  }

  function celula(p) {
    if (S.encerrados.has(chave(p))) {
      const e = S.encerrados.get(chave(p));
      return `<div class="ca-trilha"><div class="ca-col ca-fim"><span>Não vai fechar</span><b>${esc(br(diaLocal(e.em)))}</b><small>${esc(e.motivo)}</small></div></div>`;
    }
    const { lista, enviado, proximo } = situacao(p);
    const ultimo = lista[lista.length - 1];
    const d = proximo ? dias(proximo) : null;
    const tom = d == null ? "" : d < 0 ? "atrasado" : d === 0 ? "hoje" : "futuro";
    const quando = d == null ? "" : d < 0 ? `Atrasado ${-d} dia${d === -1 ? "" : "s"}` : d === 0 ? "Hoje" : `Em ${d} dia${d === 1 ? "" : "s"}`;
    return `<div class="ca-trilha">
      ${ultimo
        ? `<div class="ca-col ca-ok ca-ultimo" tabindex="0" data-acomp-historico aria-label="Ver o histórico de contatos"><span>${lista.length}º contato${lista.length > 1 ? ` <em class="ca-qtd">de ${lista.length}</em>` : ""}</span><b>${esc(br(diaLocal(ultimo.em)))}</b><small>${esc(ultimo.motivo)}</small></div>`
        : `<div class="ca-col ca-ok ca-ultimo" tabindex="0" data-acomp-historico aria-label="Ver o histórico de contatos"><span>Orçamento enviado</span><b>${esc(br(enviado))}</b><small>Automático</small></div>`}
      <div class="ca-col ca-proximo ${tom}"><span>Próximo contato</span><b>${esc(br(proximo))}</b><small>${esc(quando)}</small></div>
      <div class="ca-acoes"><button type="button" class="ca-btn ca-btn-reg" data-action="acomp-registrar">Registrar</button><button type="button" class="ca-btn ca-btn-nao" data-action="acomp-nao-fechou">Não vai fechar</button></div>
    </div>`;
  }

  function dialogo(titulo, corpo, rotulo, enviar) {
    document.querySelector(".ca-dialog")?.remove();
    const d = document.createElement("dialog"); d.className = "ca-dialog";
    d.innerHTML = `<form><header><h2>${esc(titulo)}</h2><button type="button" data-fechar aria-label="Fechar">×</button></header>${corpo}<p class="ca-erro" role="status"></p>
      <footer><button type="button" class="ca-btn" data-fechar>Voltar</button><button type="submit" class="ca-btn ca-btn-principal">${esc(rotulo)}</button></footer></form>`;
    document.body.append(d);
    const fechar = () => { d.close(); d.remove(); };
    d.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fechar));
    d.addEventListener("cancel", (e) => { e.preventDefault(); fechar(); });
    const form = d.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("[type=submit]"), erro = form.querySelector(".ca-erro");
      btn.disabled = true; erro.textContent = "";
      try { await enviar(form); fechar(); await carregar(); S.aoMudar(); }
      catch (err) { erro.textContent = err.message || String(err); btn.disabled = false; }
    });
    d.showModal();
    form.querySelector("select, input, textarea")?.focus();
    return d;
  }
  const motivosOpcoes = () => '<option value="">Escolha o motivo</option>' + (S.cfg.motivos || []).map((m) => `<option>${esc(m)}</option>`).join("");
  const rpc = async (nome, args) => { const { error } = await S.sb.rpc(nome, args); if (error) throw new Error(error.message); };

  function registrar(p) {
    const { lista, enviado } = situacao(p);
    const historico = `<ol class="ca-hist"><li><b>Orçamento enviado</b> · ${esc(brAno(enviado))}</li>${lista.map((a, i) => `<li><b>${i + 1}º contato</b> · ${esc(brAno(diaLocal(a.em)))} · ${esc(a.motivo)}${a.observacao ? `<small>${esc(a.observacao)}</small>` : ""}${a.por ? `<small>${esc(a.por)}</small>` : ""}</li>`).join("")}</ol>`;
    dialogo(`${lista.length + 1}º acompanhamento · Pedido ${p.numero || ""}`,
      `<p class="ca-sub">${esc(p.cliente || "")}</p>${historico}
       <label>Por que ainda não fechou?<select name="motivo" required>${motivosOpcoes()}</select></label>
       <label>Próximo contato<input type="date" name="proximo" required min="${hoje()}" value="${somaDias(hoje(), Number(S.cfg.dias) || 3)}"></label>
       <label>Observação (opcional)<textarea name="obs" rows="3" maxlength="2000"></textarea></label>`,
      "Registrar acompanhamento",
      (f) => { const a = alvo(p); return rpc("comercial_followup_registrar", { p_empresa: S.empresa, p_tipo: a.tipo, p_alvo: a.id, p_motivo: f.elements.motivo.value, p_proximo: f.elements.proximo.value, p_observacao: f.elements.obs.value || null }); });
  }

  function naoFechou(p) {
    const aviso = p.origemCatalogo ? "O pedido do catálogo sai da aba Catálogo." : "O pedido será cancelado e a reserva dos itens é liberada.";
    dialogo(`Cliente decidiu não fechar · Pedido ${p.numero || ""}`,
      `<p class="ca-sub">${esc(p.cliente || "")}</p><p class="ca-aviso">${esc(aviso)}</p>
       <label>Motivo<select name="motivo" required>${motivosOpcoes()}</select></label>
       <label>Observação (opcional)<textarea name="obs" rows="3" maxlength="2000"></textarea></label>`,
      "Confirmar",
      (f) => { const a = alvo(p); return rpc("comercial_followup_nao_fechou", { p_empresa: S.empresa, p_tipo: a.tipo, p_alvo: a.id, p_motivo: f.elements.motivo.value, p_observacao: f.elements.obs.value || null }); });
  }

  // Histórico ao passar o mouse (ou focar) no card da última resposta: linha do tempo num card branco, preso à tela.
  let pop = null;
  // Foto de quem fez o contato: o avatar da conta (bucket "avatares", <empresa>/<usuário>.jpg, o mesmo do menu); sem foto, as iniciais.
  function quem(a) {
    const nome = String(a.por || "").trim();
    const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    let url = ""; try { if (a.por_id) url = S.sb.storage.from("avatares").getPublicUrl(S.empresa + "/" + a.por_id + ".jpg").data?.publicUrl || ""; } catch (_) {}
    return `<span class="ca-h-quem"><span class="ca-h-avatar">${esc(iniciais)}${url ? `<img src="${esc(url)}" alt="" onerror="this.remove()">` : ""}</span>${esc(nome)}</span>`;
  }
  function fecharHistorico() { pop?.remove(); pop = null; }
  function abrirHistorico(card) {
    const p = S.pedido(card.closest("[data-pedido-id]")?.dataset.pedidoId); if (!p) return;
    const { lista, enviado, proximo } = situacao(p);
    fecharHistorico();
    pop = document.createElement("div"); pop.className = "ca-historico"; pop.setAttribute("role", "tooltip");
    pop.innerHTML = `<h4>Histórico de contatos</h4><ol>
      <li class="ca-h-envio"><i></i><div><b>Orçamento enviado</b><time>${esc(brAno(enviado))}</time><small>Automático</small></div></li>
      ${lista.map((a, i) => `<li><i></i><div><div class="ca-h-topo"><b>${i + 1}º contato</b>${a.por ? quem(a) : ""}</div><time>${esc(brAno(diaLocal(a.em)))}</time><p>${esc(a.motivo)}</p>${a.observacao ? `<small>"${esc(a.observacao)}"</small>` : ""}</div></li>`).join("")}
      <li class="ca-h-proximo"><i></i><div><b>Próximo contato</b><time>${esc(brAno(proximo))}</time></div></li></ol>`;
    document.body.append(pop);
    const r = card.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    let left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
    let top = r.bottom + 8; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 8);
    pop.style.left = left + "px"; pop.style.top = top + "px";
  }

  // Botões em cada linha, um em cima do outro, ao lado do próximo contato (nov/2026).
  function iniciar(opts) {
    Object.assign(S, opts);
    document.addEventListener("mouseover", (e) => { const c = e.target.closest("[data-acomp-historico]"); if (c && !c.contains(e.relatedTarget)) abrirHistorico(c); });
    document.addEventListener("mouseout", (e) => { const c = e.target.closest("[data-acomp-historico]"); if (c && !c.contains(e.relatedTarget)) fecharHistorico(); });
    document.addEventListener("focusin", (e) => { const c = e.target.closest?.("[data-acomp-historico]"); if (c) abrirHistorico(c); });
    document.addEventListener("focusout", (e) => { if (e.target.closest?.("[data-acomp-historico]")) fecharHistorico(); });
    document.addEventListener("scroll", fecharHistorico, true);
    document.addEventListener("click", (e) => {
      const b = e.target.closest('[data-action="acomp-registrar"], [data-action="acomp-nao-fechou"]'); if (!b) return;
      const p = S.pedido(b.closest("[data-pedido-id]")?.dataset.pedidoId); if (!p) return;
      e.preventDefault(); e.stopPropagation();
      (b.dataset.action === "acomp-registrar" ? registrar : naoFechou)(p);
    }, true);
  }

  window.CentralAcompanhamento = { iniciar, carregar, celula, encerrado: (p) => S.encerrados.has(chave(p)) };
})();
