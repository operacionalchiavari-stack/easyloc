/* Listas de entrada e históricos das telas de movimentação. */
(function () {
  'use strict';
  let cart = [], saving = false, lastAttempt = null;
  const el = id => document.getElementById(id);
  const message = text => window.TecnoAlert?.info?.(text, 'Entrada de materiais');

  function materialQuantitiesMarkup(id) {
    const material = materials.find(item => item.id === id); if (!material) return '';
    const summary = materialStockSummary(material);
    const unit = escapeHtml(material.unidade || 'UN');
    return `<span class="operation-material-quantities">${[
      ['Saldo', Number(material.quantidade_disponivel || 0), 'stock'],
      ['Reservado', summary.reserved, 'reserved'],
      ['Pré-reserva', summary.preReserved, 'pre'],
      ['Livre', summary.available, 'free'],
    ].map(([label, quantity, kind]) => `<span class="operation-material-metric ${kind}" data-stock-metric="${kind}">${label}: <strong>${escapeHtml(formatNumber(quantity))} ${unit}</strong></span>`).join('')}</span>`;
  }

  function renderCart() {
    el('entryCartBody').innerHTML = cart.map((item, index) => {
      const m = materials.find(m => m.id === item.material_id);
      return `<tr><td data-label="Material"><strong>${escapeHtml(m?.nome || '')}</strong><small>${escapeHtml(m?.codigo || '')} · ${escapeHtml(m?.unidade || '')}</small></td>
        <td data-label="Quantidade"><input class="tw-field" type="number" min="0.001" step="0.001" value="${item.quantity}" data-entry-index="${index}" data-entry-field="quantity" aria-label="Quantidade de ${escapeAttr(m?.nome || '')}"></td>
        <td data-label="Valor unitário"><input class="tw-field" type="number" min="0" step="0.01" value="${item.unit_value ?? ''}" placeholder="Atual" data-entry-index="${index}" data-entry-field="unit_value" aria-label="Valor unitário de ${escapeAttr(m?.nome || '')}"></td>
        <td><button class="icon-btn" type="button" data-entry-remove="${index}" aria-label="Remover ${escapeAttr(m?.nome || '')}">×</button></td></tr>`;
    }).join('');
    el('entryCartEmpty').hidden = cart.length > 0;
  }

  function addEntryItem() {
    if (saving) return false;
    const material = resolveEntryMaterial();
    if (!material) { message('Selecione um material cadastrado.'); return false; }
    const quantity = Number(el('entryQty').value), raw = el('entryUnitValue').value;
    const unit = raw === '' ? null : Number(raw);
    if (!Number.isFinite(quantity) || quantity <= 0) { message('Informe uma quantidade maior que zero.'); return false; }
    if (unit !== null && (!Number.isFinite(unit) || unit < 0)) { message('Informe um valor unitário válido.'); return false; }
    const previous = cart.find(item => item.material_id === material.id);
    if (previous) { previous.quantity = Math.round((previous.quantity + quantity) * 1000) / 1000; if (unit !== null) previous.unit_value = unit; }
    else cart.push({material_id: material.id, quantity, unit_value: unit});
    el('entryMaterial').value = ''; el('entryMaterialId').value = '';
    el('entryQty').value = '1'; el('entryUnitValue').value = '';
    renderCart(); el('entryMaterial').focus(); return true;
  }

  function renderOperator(type) {
    const stored = currentWarehouseUser();
    const person = employees.find(item => item.id === stored?.id) || stored;
    const name = person?.nome || 'Usuário conectado';
    el(type === 'entry' ? 'entryResponsibleName' : 'exitReleaseUser').textContent = name;
    const avatar = el(type + 'ResponsibleAvatar');
    if (person?.foto_url) avatar.innerHTML = `<img src="${escapeAttr(person.foto_url)}" alt="Foto de ${escapeAttr(name)}">`;
    else avatar.textContent = name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '--';
  }

  function resetEntry() { cart = []; lastAttempt = null; renderCart(); renderOperator('entry'); }

  async function saveEntry() {
    if (saving) return;
    if (el('entryMaterial').value.trim() && !addEntryItem()) return;
    if (!cart.length) return message('Adicione pelo menos um material.');
    if (cart.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0 || (item.unit_value !== null && (!Number.isFinite(item.unit_value) || item.unit_value < 0)))) return message('Confira as quantidades e os valores dos materiais.');
    const payload = {items: cart.map(item => ({...item})), reason: el('entryReason').value,
      op_number: el('entryOp').value, note: el('entryNotes').value.trim()};
    const fingerprint = JSON.stringify(payload);
    if (lastAttempt?.fingerprint !== fingerprint) lastAttempt = {fingerprint, key: crypto.randomUUID()};
    payload.idempotency_key = lastAttempt.key;
    saving = true;
    const controls = [...el('entryModal').querySelectorAll('input,select,textarea,button')].map(control => [control, control.disabled]);
    controls.forEach(([control]) => { control.disabled = true; });
    try {
      await TecnoweldAPI.saveWarehouseEntries(payload);
      await loadWarehouse();
      openEntryModal();
      window.TecnoAlert?.success?.('Todos os materiais foram registrados no estoque.', 'Entrada registrada');
    } catch (error) {
      window.TecnoAlert?.error?.(error.message || 'Não foi possível registrar a entrada.', 'Entrada não salva');
    } finally {
      saving = false;
      controls.forEach(([control, disabled]) => { control.disabled = disabled; });
    }
  }

  function renderHistory(type) {
    const body = el(type + 'HistoryBody'); if (!body) return;
    const term = normalizeText(el(type + 'HistorySearch').value);
    const rows = movements.filter(item => item.tipo === (type === 'entry' ? 'entrada' : 'saida'))
      .map(item => {
        const m = materials.find(m => m.id === item.material_id) || item.material || {};
        const person = historyEmployee(item.responsavel) || historyEmployee(item.solicitante);
        const reference = item.op_numero ? `Pedido ${item.op_numero}` : item.documento || item.observacao || '—';
        return {item, m, person, reference};
      }).filter(({m, person, reference}) => !term || normalizeText([m.nome, m.codigo, person?.nome, reference].join(' ')).includes(term))
      .sort((a,b) => new Date(b.item.created_at) - new Date(a.item.created_at));
    body.innerHTML = rows.map(({item,m,person,reference}) => `<tr>
      <td data-label="Data">${escapeHtml(formatDateTime(item.created_at))}</td>
      <td data-label="Material / referência"><strong>${escapeHtml(m.nome || 'Material')}</strong><small>${escapeHtml(reference)}</small></td>
      <td data-label="Quantidade"><strong class="operation-history-quantity ${type}">${type === 'entry' ? '+' : '−'}${escapeHtml(formatNumber(item.quantidade))} ${escapeHtml(item.unidade || m.unidade || '')}</strong></td>
      <td data-label="Responsável"><span class="operation-history-person">${person ? employeeAvatarMarkup(person, 'operation-history-avatar') : ''}<span>${escapeHtml(person?.nome || 'Sistema')}</span></span></td>
    </tr>`).join('') || '<tr><td colspan="4" class="operation-history-empty">Nenhuma movimentação encontrada.</td></tr>';
  }

  window.AlmoxEntryExit = {resetEntry, saveEntry, renderHistory, materialQuantitiesMarkup, renderOperator};
  el('entryAddItemBtn').addEventListener('click', addEntryItem);
  el('entryMaterial').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); addEntryItem(); }
  });
  el('entryForm').addEventListener('submit', event => { event.preventDefault(); saveEntry(); });
  el('entryCartBody').addEventListener('input', event => {
    const input = event.target.closest('[data-entry-field]'); if (!input || saving) return;
    cart[Number(input.dataset.entryIndex)][input.dataset.entryField] = input.value === '' && input.dataset.entryField === 'unit_value' ? null : Number(input.value);
  });
  el('entryCartBody').addEventListener('click', event => {
    const button = event.target.closest('[data-entry-remove]'); if (!button || saving) return;
    cart.splice(Number(button.dataset.entryRemove), 1); renderCart();
  });
  ['entry','exit'].forEach(type => el(type + 'HistorySearch').addEventListener('input', () => renderHistory(type)));
})();
