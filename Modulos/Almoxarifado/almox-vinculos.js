(function () {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const number = (value) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
  const cnpj = (value) => String(value || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const state = { rows: [], allRows: [], selectedSupplier: '', total: 0, offset: 0, search: '', supplierSearch: '', canEdit: false, request: 0 };
  const host = () => document.getElementById('supplierLinksTab');
  const api = () => window.TecnoweldAPI;
  let timer, editorOpening = false;

  function render() {
    const panel = host(); if (!panel) return;
    panel.innerHTML = `<div class="links-layout"><aside class="links-suppliers-panel" aria-label="Fornecedores dos insumos"><label class="links-material-search links-suppliers-heading"><span>Fornecedores</span><input class="tw-field" type="search" data-links-supplier-search aria-label="Buscar fornecedor" placeholder="Buscar..." value="${esc(state.supplierSearch)}"></label><div class="links-suppliers-list" data-links-suppliers></div></aside><div class="links-table-panel" data-links-result><div class="tw-table-scroll"><table class="gp-table"><thead><tr><th>Fornecedor</th><th>Produto na nota</th><th><label class="links-material-search"><span>Material interno</span><input class="tw-field" type="search" data-links-search aria-label="Buscar material interno" placeholder="Buscar material..." value="${esc(state.search)}"></label></th><th>Conversão</th><th>Atualizado</th><th>Ações</th></tr></thead><tbody data-links-body aria-live="polite"></tbody></table></div><div data-links-pagination></div></div></div>`;
    renderSuppliers();
    renderRows();
  }

  function renderRows(error = '') {
    const result = host()?.querySelector('[data-links-body]'); if (!result) return;
    const pagination = host().querySelector('[data-links-pagination]');
    if (error) { result.innerHTML = `<tr><td colspan="6" class="gp-empty">${esc(error)}</td></tr>`; pagination.innerHTML = ''; return; }
    const rows = state.rows.map((row) => `<tr><td><div class="links-supplier">${window.ComprasFoto?.fornecedor(row.fornecedor_id, row.fornecedor_nome, 36) || ''}<span class="links-supplier-text"><strong>${esc(row.fornecedor_nome)}</strong><span class="gp-sub">${esc(cnpj(row.cnpj_fornecedor))}</span></span></div></td>
      <td><strong>${esc(row.descricao_fornecedor || 'Descrição não registrada')}</strong><span class="gp-sub">Código: ${esc(row.codigo_fornecedor || '—')}${row.gtin ? ` · GTIN: ${esc(row.gtin)}` : ''}</span></td>
      <td><strong>${esc(row.material_nome)}</strong><span class="gp-sub">${esc(row.material_codigo || '')}${row.material_status === 'inativo' ? ' · Inativo' : ''}</span></td>
      <td>1 ${esc(row.unidade_fornecedor || '(unidade da nota)')} = ${number(row.fator_conversao)} ${esc(row.material_unidade || row.unidade_interna || '')}</td>
      <td>${row.atualizado_em ? esc(new Date(row.atualizado_em).toLocaleDateString('pt-BR')) : '—'}</td>
      <td>${state.canEdit ? `<button class="btn btn-secondary" type="button" data-link-edit="${esc(row.id)}">Editar</button>` : 'Consulta'}</td></tr>`).join('');
    result.innerHTML = rows || `<tr><td colspan="6" class="gp-empty">${state.search || state.supplierSearch ? 'Nenhum vínculo encontrado para esta busca.' : 'Nenhum vínculo cadastrado. As associações são salvas em Recebimento → Vincular produtos, ao continuar para a conferência.'}</td></tr>`;
    const labels = ['Fornecedor', 'Produto na nota', 'Material interno', 'Conversão', 'Atualizado', 'Ações'];
    result.querySelectorAll('tr').forEach(tr => [...tr.cells].forEach((cell, i) => { if (!cell.hasAttribute('colspan')) cell.dataset.colLabel = labels[i]; }));
    pagination.innerHTML = state.rows.length ? `<div class="gp-toolbar"><span>${state.offset + 1}–${state.offset + state.rows.length} de ${state.total} vínculos</span><span class="gp-grow"></span><button type="button" class="btn btn-secondary" data-links-prev ${state.offset === 0 ? 'disabled' : ''}>Anterior</button><button type="button" class="btn btn-secondary" data-links-next ${state.offset + 50 >= state.total ? 'disabled' : ''}>Próxima</button></div>` : '';
  }

  const normalize = value => String(value || '').toLocaleLowerCase('pt-BR');
  const supplierKey = row => `${row.cnpj_fornecedor || ''}|${normalize(row.fornecedor_nome)}`;

  function renderSuppliers(message = '') {
    const list = host()?.querySelector('[data-links-suppliers]'); if (!list) return;
    if (message) { list.innerHTML = `<p class="gp-empty">${esc(message)}</p>`; return; }
    const suppliers = new Map();
    state.allRows.forEach(row => {
      const key = supplierKey(row);
      if (!suppliers.has(key)) suppliers.set(key, { ...row, key, count: 0 });
      suppliers.get(key).count++;
    });
    const term = normalize(state.supplierSearch.trim());
    const visible = [...suppliers.values()].filter(row => normalize(`${row.fornecedor_nome} ${row.cnpj_fornecedor} ${cnpj(row.cnpj_fornecedor)}`).includes(term));
    visible.sort((a,b) => (a.fornecedor_nome || '').localeCompare(b.fornecedor_nome || '', 'pt-BR'));
    list.innerHTML = `<button type="button" class="links-supplier-option${!state.selectedSupplier ? ' is-selected' : ''}" data-links-supplier="" aria-pressed="${!state.selectedSupplier}"><span class="links-all-icon" aria-hidden="true">Todos</span><span class="links-supplier-text"><strong>Todos os fornecedores</strong><small>${suppliers.size} fornecedores</small></span><span class="links-supplier-count">${state.allRows.length}</span></button>` + visible.map(row => `<button type="button" class="links-supplier-option${state.selectedSupplier === row.key ? ' is-selected' : ''}" data-links-supplier="${esc(row.key)}" aria-pressed="${state.selectedSupplier === row.key}">${window.ComprasFoto?.fornecedor(row.fornecedor_id, row.fornecedor_nome, 36) || ''}<span class="links-supplier-text"><strong>${esc(row.fornecedor_nome)}</strong><small>${esc(cnpj(row.cnpj_fornecedor))}</small></span><span class="links-supplier-count">${row.count}</span></button>`).join('') + (!visible.length ? '<p class="gp-empty">Nenhum fornecedor encontrado.</p>' : '');
  }

  function filterRows(reset = false) {
    editing = null;
    if (reset) state.offset = 0;
    const material = normalize(state.search.trim());
    const filtered = state.allRows.filter(row =>
      (!state.selectedSupplier || supplierKey(row) === state.selectedSupplier) &&
      (!material || normalize(`${row.material_nome || ''} ${row.material_codigo || ''}`).includes(material)));
    state.total = filtered.length;
    if (state.offset >= state.total) state.offset = 0;
    state.rows = filtered.slice(state.offset, state.offset + 50);
    renderRows();
  }

  async function load(reset = false) {
    if (!host()) return;
    editing = null;
    if (reset) state.offset = 0;
    if (!host().querySelector('[data-links-search]')) render();
    const request = ++state.request;
    renderRows('Carregando vínculos…');
    renderSuppliers('Carregando fornecedores…');
    try {
      let rows = [], offset = 0, data;
      do {
        data = await api().listWarehouseSupplierLinks('', offset);
        if (request !== state.request) return;
        const page = data.rows || [];
        rows.push(...page); offset += page.length;
        if (!page.length || offset >= Number(data.total || 0)) break;
      } while (true);
      state.allRows = rows; state.canEdit = data.can_edit === true;
      if (state.selectedSupplier && !rows.some(row => supplierKey(row) === state.selectedSupplier)) state.selectedSupplier = '';
      renderSuppliers(); filterRows();
    } catch (error) {
      if (request !== state.request) return;
      renderRows(error?.message || 'Não foi possível carregar os vínculos. Tente abrir a aba novamente.');
      renderSuppliers('Não foi possível carregar os fornecedores.');
    }
  }

  // (2026-11-12) edição NA PRÓPRIA LINHA (sem modal): material interno e conversão viram campos; Enter salva, Esc cancela.
  let editing = null, materialsCache = null;
  async function edit(id, trigger) {
    if (!state.canEdit || editorOpening) return;
    if (editing && editing.id !== id) cancelEdit();
    const row = state.rows.find((item) => item.id === id); if (!row) return;
    const tr = trigger.closest('tr'); if (!tr) return;
    trigger.disabled = true; editorOpening = true;
    try {
      materialsCache = materialsCache || await api().listWarehouseMaterials();
      const materials = materialsCache.filter((m) => m.status !== 'inativo' || m.id === row.material_id);
      editing = { id, tr, html: tr.innerHTML, busy: false };
      const cells = tr.children; // 0 fornecedor, 1 produto, 2 material, 3 conversão, 4 atualizado, 5 ações
      tr.classList.add('is-editing');
      cells[2].innerHTML = `<select class="tw-field link-inline-material" aria-label="Material interno" required>${materials.map((m) => `<option value="${esc(m.id)}" data-un="${esc(m.unidade || '')}"${m.id === row.material_id ? ' selected' : ''}>${esc(m.codigo || '')} · ${esc(m.nome)} (${esc(m.unidade || '')})${m.status === 'inativo' ? ' — Inativo' : ''}</option>`).join('')}</select>`;
      cells[3].innerHTML = `<span class="link-inline-conv">1 ${esc(row.unidade_fornecedor || '(unidade da nota)')} = <input class="tw-field link-inline-factor" type="number" min="0.000001" step="any" required value="${esc(row.fator_conversao)}" aria-label="Quantidade interna por 1 ${esc(row.unidade_fornecedor || 'unidade da nota')}"> <b data-link-un></b></span>`;
      cells[5].innerHTML = `<span class="link-inline-actions"><button class="btn btn-primary" type="button" data-link-save>Salvar</button><button class="btn btn-secondary" type="button" data-link-cancel>Cancelar</button></span><small class="link-inline-error" role="alert"></small>`;
      const sel = cells[2].querySelector('select'), un = () => { cells[3].querySelector('[data-link-un]').textContent = sel.selectedOptions[0]?.dataset.un || ''; };
      sel.addEventListener('change', un); un();
      tr.addEventListener('keydown', onEditKey);
      cells[3].querySelector('input').focus(); cells[3].querySelector('input').select();
    } catch (error) { window.TecnoAlert?.error?.(error?.message || 'Não foi possível editar o vínculo.'); editing = null; }
    finally { trigger.disabled = false; editorOpening = false; }
  }
  function onEditKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); cancelEdit(); }
    if (event.key === 'Enter' && !event.target.matches('button')) { event.preventDefault(); saveEdit(); }
  }
  function cancelEdit() {
    if (!editing || editing.busy) return;
    const { tr, html, id } = editing; editing = null;
    tr.removeEventListener('keydown', onEditKey); tr.classList.remove('is-editing'); tr.innerHTML = html;
    tr.querySelector(`[data-link-edit="${CSS.escape(id)}"]`)?.focus();
  }
  async function saveEdit() {
    if (!editing || editing.busy) return;
    const { tr, id } = editing, err = tr.querySelector('.link-inline-error');
    const material = tr.querySelector('.link-inline-material').value, factor = Number(tr.querySelector('.link-inline-factor').value);
    if (!material) { err.textContent = 'Escolha o material interno.'; return; }
    if (!Number.isFinite(factor) || factor <= 0) { err.textContent = 'A quantidade precisa ser maior que zero.'; tr.querySelector('.link-inline-factor').focus(); return; }
    editing.busy = true; tr.querySelectorAll('button, input, select').forEach((x) => { x.disabled = true; }); err.textContent = '';
    try {
      await api().updateWarehouseSupplierLink(id, material, factor);
      editing = null; window.TecnoAlert?.success?.('Vínculo atualizado para as próximas notas.'); await load();
    } catch (error) {
      editing.busy = false; tr.querySelectorAll('button, input, select').forEach((x) => { x.disabled = false; });
      err.textContent = error?.message || 'Não foi possível salvar o vínculo.';
    }
  }

  document.addEventListener('input', (event) => {
    if (!host()?.contains(event.target) || !event.target.matches('[data-links-search], [data-links-supplier-search]')) return;
    if (event.target.matches('[data-links-supplier-search]')) {
      state.supplierSearch = event.target.value; renderSuppliers();
    } else {
      state.search = event.target.value; clearTimeout(timer);
      timer = setTimeout(() => filterRows(true), 180);
    }
  });
  document.addEventListener('click', (event) => {
    if (!host()?.contains(event.target)) return;
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.hasAttribute('data-links-supplier')) { state.selectedSupplier = button.dataset.linksSupplier; renderSuppliers(); filterRows(true); }
    if (button.matches('[data-links-prev]')) { state.offset = Math.max(0, state.offset - 50); filterRows(); }
    if (button.matches('[data-links-next]')) { state.offset += 50; filterRows(); }
    if (button.dataset.linkEdit) edit(button.dataset.linkEdit, button);
    if (button.matches('[data-link-save]')) saveEdit();
    if (button.matches('[data-link-cancel]')) cancelEdit();
  });
  window.AlmoxSupplierLinks = { load };
})();
