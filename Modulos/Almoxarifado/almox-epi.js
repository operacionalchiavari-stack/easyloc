// Almoxarifado -> aba EPI (2026-10-13). Acompanhamento das entregas de EPI (saiu do RH): trocas vencidas/proximas,
// historico de entregas e cadastro do EPI (CA, validade do CA, troca a cada X dias) ligado ao item do estoque.
// A entrega NAO e lancada aqui: a Saida do almoxarifado de um item ligado a um EPI vira entrega na ficha da pessoa
// (gatilho rh_epi_from_warehouse_exit). Dados pela RPC almox_epi_data (sem salario/banco do RH).
(function () {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const db = () => window.TecnoweldAPI?.getClient?.();
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const today = () => parse(iso(new Date()));
  const days = (a, b) => Math.round((b - a) / 864e5);
  const br = (s) => { const d = parse(s); return d ? d.toLocaleDateString("pt-BR") : "—"; };
  const num = (v) => String(v ?? "").replace(".", ",");
  const st = { data: null, view: "uso", search: "", peopleSearch: "", selected: null, materials: null };
  const panel = () => document.getElementById("epiTab");
  const ok = (m) => window.TecnoAlert?.success?.(m);
  const fail = (e, m) => window.TecnoAlert?.error?.(`${m} ${e?.message || ""}`.trim());

  async function load() {
    const host = panel(); if (!host || !db()) return;
    if (!st.data) host.innerHTML = '<div class="gp-card"><div class="gp-empty">Carregando…</div></div>';
    try {
      const { data, error } = await db().rpc("almox_epi_data");
      if (error) throw error;
      const people = await window.TecnoweldAPI.listEmployees().catch(() => []);
      st.data = { ...data, colaboradores: (data?.colaboradores || []).map(c => ({ ...c, foto_url: c.foto_url || people.find(p => p.id === c.id)?.foto_url })) };
      if (!colab(st.selected)) st.selected = [...(st.data.colaboradores || [])].sort((a,b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))[0]?.id || null;
      render(); paintBadge();
    } catch (error) {
      host.innerHTML = `<div class="gp-card"><div class="gp-empty">${esc(error.message || "Não foi possível carregar os EPIs.")}</div></div>`;
    }
  }
  const colab = (id) => st.data?.colaboradores?.find((c) => c.id === id);
  const epi = (id) => st.data?.epis?.find((p) => p.id === id);
  // Cada entrega permanece em uso até uma devolução explícita, inclusive entregas adicionais do mesmo EPI.
  function emUso() {
    return (st.data?.entregas || []).filter((e) => !e.devolvido_em && colab(e.colaborador_id)?.status !== "desligado");
  }
  const trocas = () => emUso().filter((e) => e.troca_prevista && days(today(), parse(e.troca_prevista)) <= 7).sort((a, b) => String(a.troca_prevista).localeCompare(String(b.troca_prevista)));
  const pill = (k, t) => `<span class="gp-pill ${k}">${esc(t)}</span>`;
  const person = (c) => `<div class="gp-person"><span class="gp-avatar">${c?.foto_url ? `<img src="${esc(c.foto_url)}" alt="" loading="lazy">` : esc(String(c?.nome || '?').trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase())}</span><div><b>${esc(c?.nome || '—')}</b><span class="gp-sub">${esc(c?.setor || 'Sem setor')}</span></div></div>`;
  const matches = e => { const p = epi(e.epi_id); return e.colaborador_id === st.selected && `${p?.nome || ''} ${e.ca || p?.ca || ''} ${e.motivo || ''}`.toLocaleLowerCase('pt-BR').includes(st.search.trim().toLocaleLowerCase('pt-BR')); };

  function renderPeople() {
    const list = panel()?.querySelector('[data-epi-people]'); if (!list) return;
    const term = st.peopleSearch.trim().toLocaleLowerCase('pt-BR');
    const people = [...(st.data.colaboradores || [])].filter(c => `${c.nome} ${c.setor || ''} ${c.matricula || ''}`.toLocaleLowerCase('pt-BR').includes(term)).sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt-BR'));
    list.innerHTML = people.map(c => {
      const total = emUso().filter(e=>e.colaborador_id === c.id).length;
      const due = trocas().filter(e=>e.colaborador_id === c.id).length;
      return `<button type="button" class="epi-person-option${st.selected === c.id ? ' is-selected' : ''}" data-epi-person="${esc(c.id)}" aria-pressed="${st.selected === c.id}">${person(c)}<span class="epi-person-total${due ? ' has-due' : ''}" title="${due ? `${due} troca(s) pendente(s)` : 'EPIs em uso'}">${due || total}</span></button>`;
    }).join('') || '<p class="gp-empty">Nenhum colaborador encontrado.</p>';
  }

  function entregasTable(list) {
    return `<div class="tw-table-scroll"><table class="gp-table"><thead><tr><th>EPI</th><th>CA</th><th class="num">Qtd.</th><th>Entrega</th><th>Troca prevista</th><th>Motivo</th><th></th></tr></thead><tbody>
      ${list.map((e) => { const p = epi(e.epi_id), n = e.troca_prevista ? days(today(), parse(e.troca_prevista)) : null;
        const troca = e.devolvido_em ? pill("", `Devolvido ${br(e.devolvido_em)}`) : e.troca_prevista ? pill(n < 0 ? "bad" : n <= 7 ? "warn" : "ok", n < 0 ? `${br(e.troca_prevista)} · atrasada` : br(e.troca_prevista)) : "—";
        return `<tr><td>${esc(p?.nome || "")}</td><td>${esc(e.ca || p?.ca || "—")}</td><td class="num">${num(e.quantidade)}</td><td>${br(e.data_entrega)}${e.entregue_por ? `<span class="gp-sub">por ${esc(e.entregue_por)}</span>` : ""}</td><td>${troca}</td><td>${esc(e.motivo || "")}</td>
          <td><div class="gp-actions-cell">${!e.devolvido_em && st.data.pode_editar ? `<button class="gp-link" type="button" data-epi-dev="${esc(e.id)}">Devolvido</button>` : ""}</div></td></tr>`; }).join("") || '<tr><td colspan="7"><div class="gp-empty">Nada nesta lista.</div></td></tr>'}
      </tbody></table></div>`;
  }

  function render() {
    const host = panel(); if (!host || !st.data) return;
    const due = trocas(), epis = st.data.epis || [];
    const selected = colab(st.selected);
    host.innerHTML = `<div class="epi-layout"><aside class="epi-people-panel" aria-label="Colaboradores"><label class="epi-people-heading"><span>Colaboradores</span><input class="tw-field" type="search" data-epi-people-search aria-label="Buscar colaborador" placeholder="Buscar..." value="${esc(st.peopleSearch)}"></label><div data-epi-people class="epi-people-list"></div></aside><section class="epi-records-panel"><header class="epi-selected-person">${st.view === 'catalogo' ? '<strong>EPIs e CA</strong>' : selected ? person(selected) : '<strong>Selecione um colaborador</strong>'}${selected && st.view !== 'catalogo' ? `<button type="button" class="btn btn-secondary" data-epi-ficha="${esc(selected.id)}">Imprimir ficha</button>` : ''}</header><div class="epi-records-toolbar"><div class="gp-seg" data-epi-views>${[['uso','Em uso'],['trocas',`Trocas (${due.filter(e=>e.colaborador_id === st.selected).length})`],['entregas','Histórico de entregas'],['catalogo','EPIs e CA']].map(([k,l])=>`<button type="button" data-v="${k}" class="${st.view === k ? 'active' : ''}" aria-pressed="${st.view === k}">${l}</button>`).join('')}</div>${st.view === 'catalogo' ? '' : `<input class="tw-field" type="search" data-epi-search aria-label="Buscar EPI nos registros do colaborador" placeholder="Buscar EPI ou CA..." value="${esc(st.search)}">`}</div><div data-epi-body></div></section></div>`;
    renderPeople(); renderBody();
  }

  function renderBody() {
    const host = panel(); if (!host || !st.data) return;
    const due = trocas(), epis = st.data.epis || [];
    const body = host.querySelector("[data-epi-body]");
    if (st.view === "trocas") body.innerHTML = due.filter(matches).length ? entregasTable(due.filter(matches)) : '<div class="gp-card"><div class="gp-empty">Nenhuma troca de EPI atrasada ou nos próximos 7 dias.</div></div>';
    if (st.view === "uso") body.innerHTML = entregasTable(emUso().filter(matches).sort((a, b) => String(colab(a.colaborador_id)?.nome).localeCompare(String(colab(b.colaborador_id)?.nome))));
    if (st.view === "entregas") body.innerHTML = entregasTable((st.data.entregas || []).filter(matches));
    if (st.view === "catalogo") body.innerHTML = `<div class="tw-table-scroll"><table class="gp-table"><thead><tr><th>EPI</th><th>Item do estoque</th><th class="num">Em estoque</th><th>CA</th><th>Validade do CA</th><th>Troca a cada</th><th>Situação</th></tr></thead><tbody>
      ${epis.map((p) => { const v = parse(p.ca_validade), n = v ? days(today(), v) : null;
        return `<tr class="${st.data.pode_editar_catalogo ? "clickable" : ""}" data-epi-edit="${esc(p.id)}"><td><b>${esc(p.nome)}</b></td><td>${p.material_id ? `${esc(p.material_nome)}<span class="gp-sub">${esc(p.material_codigo || "")}</span>` : pill("bad", "Sem item ligado")}</td><td class="num">${p.material_id ? `${num(p.estoque ?? 0)} ${esc(p.unidade || "")}` : "—"}</td><td>${esc(p.ca || "—")}</td>
          <td>${v ? pill(n < 0 ? "bad" : n <= 30 ? "warn" : "ok", n < 0 ? `Vencido ${br(p.ca_validade)}` : br(p.ca_validade)) : "—"}</td><td>${p.troca_dias ? `${p.troca_dias} dias` : "—"}</td><td>${p.ativo ? pill("ok", "Ativo") : pill("", "Inativo")}</td></tr>`; }).join("") || '<tr><td colspan="7"><div class="gp-empty">Nenhum EPI ainda. Marque "É EPI" no cadastro do item (luva, óculos, protetor auricular, botina…).</div></td></tr>'}
      </tbody></table></div>`;
    const labels = st.view === 'catalogo' ? ['EPI','Item do estoque','Em estoque','CA','Validade do CA','Troca a cada','Situação'] : ['EPI','CA','Qtd.','Entrega','Troca prevista','Motivo','Ações'];
    body.querySelectorAll('tbody tr').forEach(tr=>[...tr.cells].forEach((td,i)=>{ if(!td.hasAttribute('colspan'))td.dataset.colLabel=labels[i]; }));
    window.lucide?.createIcons();
  }

  // janela simples no padrao do RH
  function modal(title, body, foot) {
    let m = document.getElementById("almoxEpiModal");
    if (!m) { m = document.createElement("div"); m.id = "almoxEpiModal"; m.className = "gp-modal hidden"; m.innerHTML = '<div class="gp-modal-back" data-epi-close></div><article class="gp-modal-card" role="dialog" aria-modal="true"><header class="gp-modal-head"><h2></h2><button class="icon-btn" type="button" data-epi-close aria-label="Fechar"><i data-lucide="x"></i></button></header><div class="gp-modal-body"></div><footer class="gp-modal-foot"></footer></article>'; document.body.appendChild(m); m.addEventListener("click", (e) => { if (e.target.closest("[data-epi-close]")) m.classList.add("hidden"); }); }
    m.querySelector("h2").textContent = title; m.querySelector(".gp-modal-body").innerHTML = body; m.querySelector(".gp-modal-foot").innerHTML = foot;
    m.classList.remove("hidden"); window.lucide?.createIcons(); return m;
  }
  async function epiForm(p = {}) {
    try { st.materials = (await window.TecnoweldAPI.listWarehouseMaterials()) || []; } catch (error) { fail(error, "Não foi possível carregar os itens do estoque."); return; }
    const mats = st.materials.filter((m) => m.id === p.material_id || (m.ativo !== false && m.status !== "inativo" && m.tipo_material !== "retalho")).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    const m = modal(p.id ? `Editar · ${p.nome}` : "Novo EPI", `<form class="gp-form" onsubmit="return false">
      <label class="full">Nome *<input data-f="nome" value="${esc(p.nome || "")}" placeholder="Ex.: Luva de vaqueta"></label>
      <label class="full">Item do estoque (a saída dele vira entrega de EPI)<select data-f="material_id"><option value="">Não ligado</option>${mats.map((x) => `<option value="${esc(x.id)}" ${x.id === p.material_id ? "selected" : ""}>${esc(`${x.codigo ? `${x.codigo} · ` : ""}${x.nome}`)}</option>`).join("")}</select></label>
      <label>Número do CA<input data-f="ca" value="${esc(p.ca || "")}"></label>
      <label>Validade do CA<input data-f="ca_validade" type="date" value="${esc(p.ca_validade || "")}"></label>
      <label>Troca a cada (dias)<input data-f="troca_dias" type="number" min="0" value="${esc(p.troca_dias ?? "")}" placeholder="vazio = sem troca programada"></label>
      <label>Situação<select data-f="ativo"><option value="true" ${p.ativo !== false ? "selected" : ""}>Ativo</option><option value="false" ${p.ativo === false ? "selected" : ""}>Inativo</option></select></label>
    </form>`, '<button class="btn btn-secondary" type="button" data-epi-close>Cancelar</button><button class="btn btn-primary" type="button" data-epi-save>Salvar</button>');
    m.querySelector("[data-epi-save]").onclick = async (ev) => {
      const v = (k) => m.querySelector(`[data-f="${k}"]`).value.trim();
      if (!v("nome")) { m.querySelector('[data-f="nome"]').focus(); return; }
      if (!v("ca")) { fail(null, "Informe o número do CA do EPI."); return; }
      if (v("troca_dias") && (!Number.isInteger(Number(v("troca_dias"))) || Number(v("troca_dias")) < 0)) { fail(null, "Informe um intervalo de troca em dias inteiros, maior ou igual a zero."); return; }
      ev.target.disabled = true;
      try {
        const { error } = await db().rpc("almox_epi_save", { p: { id: p.id || null, nome: v("nome"), material_id: v("material_id"), ca: v("ca"), ca_validade: v("ca_validade"), troca_dias: v("troca_dias"), ativo: v("ativo") === "true" } });
        if (error) throw error;
        m.classList.add("hidden"); ok("EPI salvo."); await load();
      } catch (error) { fail(error, "Não foi possível salvar o EPI."); }
      finally { ev.target.disabled = false; }
    };
  }
  async function printFicha(colabId) {
    const c = colab(colabId); if (!c) return;
    const list = (st.data.entregas || []).filter((e) => e.colaborador_id === colabId).slice().sort((a, b) => String(a.data_entrega).localeCompare(String(b.data_entrega)));
    let co = {}; try { co = (await window.TecnoweldAPI.getCompanyProfile()) || {}; } catch (_) { /* sem logo */ }
    const html = `<div class="rr-doc">
      <header class="rr-head"><div>${co.logo_url ? `<img src="${esc(co.logo_url)}" alt="">` : ""}<div class="rr-head-company">${esc([co.razao_social || co.nome_fantasia, co.documento].filter(Boolean).join(" · "))}</div></div><div class="rr-head-id">Ficha de EPI<strong>${esc(c.matricula || c.nome)}</strong>Emitida em ${new Date().toLocaleDateString("pt-BR")}</div></header>
      <div class="rr-title"><div><span>NR-6 · Equipamento de Proteção Individual</span><h1>Ficha de controle de entrega de EPI</h1></div></div>
      <div class="rr-grid"><div class="w2"><small>Colaborador</small><p>${esc(c.nome)}</p></div><div><small>Matrícula</small><p>${esc(c.matricula || "—")}</p></div><div><small>CPF</small><p>${esc(c.cpf || "—")}</p></div>
        <div><small>Setor</small><p>${esc(c.setor || "—")}</p></div><div><small>Cargo</small><p>${esc(c.cargo || "—")}</p></div><div><small>Admissão</small><p>${br(c.admissao_data)}</p></div><div><small>Calçado</small><p>${esc(c.tamanho_calcado || "—")}</p></div></div>
      <div class="rr-section"><div class="rr-note">Declaro que recebi gratuitamente os EPIs abaixo, em perfeito estado, e fui orientado sobre o uso correto, a guarda e a conservação. Comprometo-me a usá-los apenas para a finalidade a que se destinam, a comunicar qualquer alteração que os torne impróprios e a devolvê-los quando solicitado ou no desligamento (NR-6, item 6.7.1). Estou ciente de que a recusa injustificada em usá-los constitui ato faltoso (CLT, art. 158).</div></div>
      <div class="rr-section"><h2>Entregas <b>${list.length}</b></h2><table><thead><tr><th style="width:15%">Data</th><th style="width:31%">EPI</th><th style="width:11%">CA</th><th style="width:7%">Qtd.</th><th style="width:12%">Motivo</th><th style="width:12%">Devolução</th><th style="width:12%">Assinatura</th></tr></thead><tbody>
        ${list.map((e) => `<tr><td>${br(e.data_entrega)}</td><td>${esc(epi(e.epi_id)?.nome || "")}</td><td>${esc(e.ca || epi(e.epi_id)?.ca || "")}</td><td class="num">${num(e.quantidade)}</td><td>${esc(e.motivo || "")}</td><td>${e.devolvido_em ? br(e.devolvido_em) : ""}</td><td></td></tr>`).join("")}
        ${Array.from({ length: Math.max(4, 12 - list.length) }, () => "<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>").join("")}
      </tbody></table></div>
      <div class="rr-signs"><div><strong>${esc(c.nome)}</strong>Colaborador</div><div><strong>&nbsp;</strong>Responsável pela entrega</div><div><strong>&nbsp;</strong>Segurança do trabalho</div></div>
      <div class="rr-foot"><span>For106 · Almoxarifado · EPI</span><span>${esc(co.nome_fantasia || "")}</span></div>
    </div>`;
    try { await window.TecnoReport.mount(html); } catch (e) { fail(e, "Não foi possível imprimir a ficha."); }
  }

  document.addEventListener("click", async (e) => {
    const host = panel(); if (!host) return;
    const selected = e.target.closest('[data-epi-person]');
    if (selected && host.contains(selected)) { st.selected = selected.dataset.epiPerson; if (st.view === "catalogo") st.view = "uso"; render(); host.querySelector(`[data-epi-person="${CSS.escape(st.selected)}"]`)?.focus({preventScroll:true}); return; }
    const v = e.target.closest("[data-epi-views] [data-v]");
    if (v && host.contains(v)) { st.view = v.dataset.v; render(); return; }
    if (e.target.closest("[data-epi-new]") && host.contains(e.target)) { epiForm({}); return; }
    const ed = e.target.closest("[data-epi-edit]");
    if (ed && host.contains(ed) && st.data?.pode_editar_catalogo) { const p = epi(ed.dataset.epiEdit); if (p?.material_id && window.openMaterialRegistrationEditor && window.TecnoweldPermissions?.has?.("Editar material")) window.openMaterialRegistrationEditor(p.material_id); else epiForm(p); return; }
    const fi = e.target.closest("[data-epi-ficha]"); if (fi && host.contains(fi)) { printFicha(fi.dataset.epiFicha); return; }
    const dv = e.target.closest("[data-epi-dev]");
    if (dv && host.contains(dv)) {
      dv.disabled = true;
      try {
        const { error } = await db().rpc("almox_epi_return", { p_id: dv.dataset.epiDev });
        if (error) throw error;
        ok("Devolução registrada na ficha. O item não foi reincorporado ao estoque disponível.");
        await load();
      } catch (error) {
        fail(error, "Não foi possível registrar a devolução.");
      } finally { dv.disabled = false; }
    }
  });
  document.addEventListener('input', e => {
    if (!panel()?.contains(e.target)) return;
    if(e.target.matches('[data-epi-people-search]')){st.peopleSearch=e.target.value;renderPeople();}
    if(e.target.matches('[data-epi-search]')){st.search=e.target.value;renderBody();}
  });

  // bolinha na aba EPI: trocas atrasadas ou nos proximos 7 dias
  async function paintBadge() {
    const tab = document.querySelector('.almox-tabs [data-tab="epi"]'); if (!tab || !db()) return;
    if (!st.data) { const { data } = await db().rpc("almox_epi_data").then((r) => r, () => ({})); if (!data) return; st.data = data; }
    const n = trocas().length, b = tab.querySelector(".almox-tab-badge");
    if (b) { b.textContent = n; b.hidden = !n; }
  }
  setTimeout(paintBadge, 1800);
  setInterval(load, 300000);
  window.AlmoxEpi = { load };
})();
