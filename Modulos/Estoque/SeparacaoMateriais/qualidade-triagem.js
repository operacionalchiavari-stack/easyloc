/* Triagem de Materiais > aba "Controle de qualidade" (16/11/2026).
   A Triagem manda a peça danificada direto para o setor; quando o setor conclui a O.S, a peça volta para cá
   e a própria Triagem aprova (liberada para locação) ou reprova (volta para um setor).
   Também lista as peças danificadas que ainda não têm setor (ex.: registradas pelo App na coleta). */
(function () {
  "use strict";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const avisar = (t, tipo) => (typeof window.alerta === "function" ? window.alerta(t, "Controle de qualidade", tipo || "aviso") : alert(t));
  const dataHora = (v) => (v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  const S = { aba: "triagem", dados: null, empresa: null, sb: null };

  function separarNome(t) {
    const s = String(t || ""), i = s.search(/\((?:L|A|P)\)\s*\d/i);
    return i < 0 ? [s, ""] : [s.slice(0, i).trim(), s.slice(i).trim()];
  }
  function origemHtml(r) {
    if (r.origem === "separacao") return "Separação" + (r.motivo && /pedido\s+(\S+)/i.test(r.motivo) ? " · pedido " + esc(r.motivo.match(/pedido\s+(\S+)/i)[1]) : "");
    if (r.origem === "inventario") return "Inventário";
    return (r.pedido ? '<span class="sq-ped">' + esc(r.pedido) + "</span> " : "") + esc(r.cliente || "") + '<small>' + (r.origem === "coleta" ? "Coleta / App" : "Triagem da volta") + "</small>";
  }
  async function fotos(lista) {
    const urls = [];
    for (const e of lista || []) {
      if (e.url) { urls.push(e.url); continue; }
      if (!e.path) continue;
      const { data } = await S.sb.storage.from(e.bucket || "evidencias-operacionais").createSignedUrl(e.path, 600);
      if (data?.signedUrl) urls.push(data.signedUrl);
    }
    return urls;
  }
  function itemHtml(r) {
    const [nome, med] = separarNome(r.nome);
    return '<div class="sq-item"><span class="sq-foto">' + (/^https?:/.test(r.foto || "") ? '<img src="' + esc(r.foto) + '" alt="" loading="lazy">' : "") + "</span><div><b>" + esc(nome) + "</b>" + (med ? "<small>" + esc(med) + "</small>" : "") + "</div></div>";
  }

  async function carregar() {
    const { data, error } = await S.sb.rpc("acervo_qualidade_lista", { p_empresa: S.empresa });
    if (error) throw Error(error.message);
    S.dados = data || { inspecao: [], sem_setor: [], em_manutencao: 0 };
    const n = (S.dados.inspecao || []).length, b = document.getElementById("sqBadge");
    if (b) { b.textContent = n || ""; b.hidden = !n; }
  }

  async function pintar() {
    const host = document.getElementById("sqQualidade");
    if (!host) return;
    if (!S.dados) host.innerHTML = '<div class="sq-vazio">Carregando…</div>';
    try { await carregar(); } catch (e) { host.innerHTML = '<div class="sq-vazio">Não foi possível carregar: ' + esc(e.message) + "</div>"; return; }
    const { inspecao = [] } = S.dados;
    const linhas = await Promise.all(inspecao.map(async (r) => {
      const ev = await fotos(r.evidencias);
      return '<tr data-id="' + esc(r.id) + '">' +
        "<td>" + itemHtml(r) + "</td>" +
        '<td class="sq-num">' + esc(r.quantidade) + "</td>" +
        '<td class="sq-origem">' + origemHtml(r) + "</td>" +
        '<td><span class="sq-os">O.S ' + esc(r.os_numero) + "</span>" + (r.fluxo || [r.setor]).map((s) => '<span class="sq-setor">' + esc(s) + "</span>").join('<span class="sq-seta">›</span>') +
        (Number(r.reprovacoes) ? '<small class="sq-reprov">Já reprovada ' + esc(r.reprovacoes) + "×</small>" : "") + "</td>" +
        '<td class="sq-res"><p>' + esc(r.resultado || "Serviço concluído") + "</p><small>" + esc(r.concluida_por || "") + (r.concluida_por ? " · " : "") + dataHora(r.concluida_em) + "</small>" +
        (r.motivo ? '<small class="sq-dano">Dano: ' + esc(r.motivo) + "</small>" : "") + "</td>" +
        '<td class="sq-fotos">' + (ev.length ? ev.map((u) => '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="Foto do dano"></a>').join("") : '<small>—</small>') + "</td>" +
        '<td class="sq-acoes"><button type="button" class="sq-aprovar" data-aprovar="' + esc(r.id) + '">Aprovar</button><button type="button" class="sq-reprovar" data-reprovar="' + esc(r.id) + '">Reprovar</button></td></tr>';
    }));
    host.innerHTML =
      '<div class="sq-card"><table class="sq-tabela"><thead><tr><th>Item</th><th>Qtd.</th><th>De onde veio</th><th>O.S e setor</th><th>O que o setor fez</th><th>Fotos do dano</th><th>Qualidade</th></tr></thead><tbody>' +
      (linhas.join("") || '<tr><td colspan="7"><div class="sq-vazio">Nenhuma peça aguardando aprovação. Quando um setor concluir uma O.S, a peça aparece aqui.</div></td></tr>') + "</tbody></table></div>";
    host.querySelectorAll("[data-aprovar]").forEach((b) => (b.onclick = () => decidir(b.dataset.aprovar, true, b)));
    host.querySelectorAll("[data-reprovar]").forEach((b) => (b.onclick = () => reprovar(b.dataset.reprovar)));
  }

  async function decidir(id, aprovar, botao, motivo, setor) {
    const r = (S.dados.inspecao || []).find((x) => x.id === id);
    if (!r) return;
    if (botao) botao.disabled = true;
    const { error } = await S.sb.rpc("acervo_qualidade_decidir", { p_empresa: S.empresa, p_retorno: id, p_versao: r.versao, p_aprovar: aprovar, p_motivo: motivo || null, p_setor: setor || null });
    if (error) { if (botao) botao.disabled = false; avisar(error.message, "erro"); return; }
    avisar(aprovar ? "Qualidade aprovada. A peça está liberada para locação." : "Peça reprovada e devolvida para " + setor + ".", "sucesso");
    await pintar();
  }

  function reprovar(id) {
    const r = (S.dados.inspecao || []).find((x) => x.id === id);
    if (!r) return;
    const dlg = document.createElement("dialog");
    dlg.className = "as-dlg";
    dlg.innerHTML = '<form><header><h3>Reprovar a qualidade</h3><button type="button" class="as-x" aria-label="Fechar">×</button></header>' +
      '<p class="as-item">' + esc(separarNome(r.nome)[0]) + " · O.S " + esc(r.os_numero) + "</p>" +
      '<label class="sq-label">O que ainda está errado?<textarea name="motivo" required minlength="5" maxlength="1000" placeholder="Ex.: o pé continua solto, a cor ficou diferente"></textarea></label>' +
      '<div class="sq-setor-host"></div><div class="as-acoes"><button type="button" class="btn secondary" data-cancelar>Cancelar</button><button type="submit" class="btn primary">Devolver para o setor</button></div></form>';
    document.body.append(dlg);
    const form = dlg.querySelector("form");
    const ctl = window.EasyLocAvariaSetor.montar(dlg.querySelector(".sq-setor-host"), { sb: S.sb, empresa: S.empresa, item: r.nome, descricao: () => form.motivo.value });
    dlg.querySelector('[data-setor="' + CSS.escape(r.setor) + '"]')?.click();
    dlg.querySelector(".as-x").onclick = dlg.querySelector("[data-cancelar]").onclick = () => dlg.close();
    dlg.addEventListener("close", () => dlg.remove());
    form.onsubmit = async (e) => {
      e.preventDefault();
      const motivo = form.motivo.value.trim(), setor = ctl.valor();
      if (motivo.length < 5) return avisar("Escreva o que ainda está errado.");
      if (!setor) return avisar("Escolha para qual setor a peça volta.");
      dlg.close();
      await decidir(id, false, null, motivo, setor);
    };
    dlg.showModal();
  }

  async function mandar(id) {
    const r = (S.dados.sem_setor || []).find((x) => x.id === id);
    if (!r) return;
    const setor = await window.EasyLocAvariaSetor.escolher({ sb: S.sb, empresa: S.empresa, item: separarNome(r.nome)[0], descricao: r.motivo || "" });
    if (!setor) return;
    const { error } = await S.sb.rpc("acervo_avaria_encaminhar", { p_empresa: S.empresa, p_retorno: id, p_setor: setor, p_motivo: r.motivo || null });
    if (error) return avisar(error.message, "erro");
    avisar("O.S aberta em " + setor + ".", "sucesso");
    await pintar();
  }

  function trocar(aba) {
    S.aba = aba;
    document.querySelectorAll("[data-sq-aba]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.sqAba === aba)));
    const board = document.querySelector(".separacao-board-card"), busca = document.querySelector(".separacao-search"), q = document.getElementById("sqQualidade");
    if (board) board.hidden = aba !== "triagem";
    if (busca) busca.style.visibility = aba === "triagem" ? "" : "hidden";
    q.hidden = aba !== "qualidade";
    if (aba === "qualidade") pintar();
    try { sessionStorage.setItem("triagem_aba", aba); } catch {}
  }

  async function iniciar() {
    const header = document.querySelector(".separacao-header"), board = document.querySelector(".separacao-board-card");
    if (!header || !board || document.getElementById("sqAbas")) return;
    const nav = document.createElement("nav");
    nav.id = "sqAbas"; nav.className = "sq-abas el-tabs"; nav.setAttribute("role", "tablist"); nav.setAttribute("aria-label", "Triagem");
    nav.innerHTML = '<button type="button" role="tab" data-sq-aba="triagem" aria-selected="true">Triagem</button>' +
      '<button type="button" role="tab" data-sq-aba="qualidade" aria-selected="false">Controle de qualidade <span class="tab-badge" id="sqBadge" hidden></span></button>';
    header.prepend(nav);
    const sec = document.createElement("section");
    sec.id = "sqQualidade"; sec.className = "sq-qualidade"; sec.hidden = true;
    board.after(sec);
    nav.querySelectorAll("[data-sq-aba]").forEach((b) => (b.onclick = () => trocar(b.dataset.sqAba)));
    try {
      const c = await window.aguardarContexto();
      S.empresa = c.empresa_id; S.sb = window.supabaseClient;
      await carregar();
    } catch (e) { console.warn("Controle de qualidade:", e); }
    const pedido = new URLSearchParams(location.search).get("aba");
    if (pedido === "qualidade" || (!pedido && sessionStorage.getItem("triagem_aba") === "qualidade")) trocar("qualidade");
    setInterval(() => { if (document.visibilityState === "visible" && S.empresa) (S.aba === "qualidade" ? pintar() : carregar()).catch(() => {}); }, 60000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
