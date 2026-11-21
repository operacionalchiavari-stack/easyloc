// Sugestões de materiais com o mesmo visual das listas do Almoxarifado.
(() => {
  if (!HTMLElement.prototype.showPopover) return;
  const scope = '#entryModal, #exitModal, #withdrawalsWorkspaceTab, #movementWorkspaceTab';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  let input = null, menu = null, values = [], active = -1;
  function syncPickers() {
    document.querySelectorAll('.movement-picker-dropdown, .movement-op-options').forEach(picker => {
      if (!picker.closest(scope)) return;
      const hidden = picker.closest('.hidden, [hidden]');
      if (hidden) { if (picker.matches(':popover-open')) picker.hidePopover(); return; }
      const anchor = picker.parentElement.querySelector('.movement-picker-trigger, .movement-op-search');
      if (!anchor) return;
      picker.setAttribute('popover', 'manual');
      if (!picker.classList.contains('almox-operation-picker')) picker.classList.add('almox-operation-picker');
      if (!picker.matches(':popover-open')) picker.showPopover();
      const rect = anchor.getBoundingClientRect(), width = Math.min(Math.max(rect.width, 300), innerWidth - 24);
      const below = innerHeight - rect.bottom - 12, above = rect.top - 12;
      const up = below < 180 && above > below, height = Math.min(340, Math.max(80, up ? above : below));
      Object.assign(picker.style, {position:'fixed',inset:'auto',margin:'0',width:width+'px',maxHeight:height+'px',right:'auto',left:Math.max(12,Math.min(rect.left,innerWidth-width-12))+'px',top:(up?Math.max(12,rect.top-Math.min(picker.scrollHeight,height)-6):rect.bottom+6)+'px'});
    });
  }
  function close() {
    if (!menu) return;
    if (menu.matches(':popover-open')) menu.hidePopover();
    menu.hidden = true;
    input?.setAttribute('aria-expanded', 'false');
    input?.removeAttribute('aria-activedescendant');
    input = null;
  }
  function ensure() {
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'almoxOperationSuggestions'; menu.className = 'almox-operation-suggestions';
    menu.setAttribute('popover', 'manual'); menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', 'Materiais encontrados'); menu.hidden = true;
    document.body.append(menu);
    menu.addEventListener('pointerdown', event => {
      const option = event.target.closest('[data-operation-option]');
      if (!option) return;
      event.preventDefault(); choose(Number(option.dataset.operationOption));
    });
    return menu;
  }
  function position() {
    if (!input || !menu) return;
    const rect = input.getBoundingClientRect();
    if (!rect.width || !rect.height || input.closest('.hidden, [hidden]')) return close();
    const width = Math.min(Math.max(rect.width, 300), innerWidth - 24);
    const below = innerHeight - rect.bottom - 12, above = rect.top - 12;
    const up = below < 180 && above > below;
    const height = Math.min(340, Math.max(80, up ? above : below));
    menu.style.width = width + 'px'; menu.style.maxHeight = height + 'px';
    menu.style.left = Math.max(12, Math.min(rect.left, innerWidth - width - 12)) + 'px';
    menu.style.top = (up ? Math.max(12, rect.top - Math.min(menu.scrollHeight, height) - 6) : rect.bottom + 6) + 'px';
  }
  function prepare(control) {
    if (!(control instanceof HTMLInputElement) || !control.closest(scope) || control.disabled || control.readOnly) return;
    const listId = control.getAttribute('list') || control.dataset.operationList;
    const list = listId && document.getElementById(listId); if (!list) return;
    control.dataset.operationList = listId; control.removeAttribute('list');
    control.setAttribute('role', 'combobox'); control.setAttribute('aria-autocomplete', 'list');
    if (input !== control) control.setAttribute('aria-expanded', 'false');
    return list;
  }
  function show(control) {
    const list = prepare(control); if (!list) return;
    if (input && input !== control) close();
    input = control; ensure(); active = -1;
    control.setAttribute('role', 'combobox'); control.setAttribute('aria-autocomplete', 'list');
    control.setAttribute('aria-controls', menu.id); control.setAttribute('aria-expanded', 'true');
    control.removeAttribute('aria-activedescendant');
    const term = normalize(control.value);
    values = [...list.options].filter(option => !option.disabled && normalize(option.value + ' ' + option.label).includes(term)).slice(0, 60);
    menu.replaceChildren();
    if (!values.length) {
      const empty = document.createElement('p'); empty.textContent = 'Nenhum material encontrado.'; menu.append(empty);
    }
    values.forEach((value, index) => {
      const option = document.createElement('div');
      option.id = 'almox-operation-option-' + index; option.className = 'almox-operation-option';
      option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
      option.dataset.operationOption = index;
      option.textContent = value.label || value.value;
      if (control.closest('#entryModal, #exitModal') && value.dataset.materialId) {
        const quantities = window.AlmoxEntryExit?.materialQuantitiesMarkup(value.dataset.materialId);
        if (quantities) option.insertAdjacentHTML('beforeend', quantities);
      }
      menu.append(option);
    });
    menu.hidden = false; menu.showPopover(); position();
  }
  function highlight(index) {
    if (!values.length || !input) return;
    active = (index + values.length) % values.length;
    [...menu.querySelectorAll('[role=option]')].forEach((option, i) => option.setAttribute('aria-selected', String(i === active)));
    const option = document.getElementById('almox-operation-option-' + active);
    input.setAttribute('aria-activedescendant', option.id); option.scrollIntoView({block:'nearest'});
  }
  function choose(index) {
    const value = values[index], control = input; if (!value || !control) return;
    control.value = value.value;
    control.dispatchEvent(new Event('input', {bubbles:true}));
    control.dispatchEvent(new Event('change', {bubbles:true}));
    close();
  }
  document.addEventListener('focusin', event => {
    if (event.target.closest?.('#entryModal, #exitModal')) prepare(event.target);
    else show(event.target);
  });
  document.addEventListener('click', event => {
    if (event.target.closest?.('#entryModal, #exitModal')) show(event.target);
  });
  document.addEventListener('input', event => show(event.target));
  document.addEventListener('focusout', event => { if (event.target === input) close(); });
  document.addEventListener('pointerdown', event => { if (input && event.target !== input && !menu.contains(event.target)) close(); });
  document.addEventListener('keydown', event => {
    const control = event.target;
    const select = control.closest?.('select');
    if (event.key === 'Escape' && select?.closest(scope) && select.matches(':open')) {
      event.stopImmediatePropagation(); return;
    }
    const picker = control.closest?.('.almox-operation-picker');
    if (event.key === 'Escape' && picker?.matches(':popover-open')) {
      event.preventDefault(); event.stopImmediatePropagation();
      picker.classList.add('hidden'); picker.hidePopover();
      const trigger = picker.parentElement.querySelector('.movement-picker-trigger');
      trigger?.setAttribute('aria-expanded', 'false'); trigger?.focus(); return;
    }
    if (event.key === 'ArrowDown' && !input && control.matches?.('input[data-operation-list]')) show(control);
    if (!input || control !== input) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    if (event.key === 'Tab') close();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); highlight(active < 0 ? (event.key === 'ArrowDown' ? 0 : values.length - 1) : active + (event.key === 'ArrowDown' ? 1 : -1)); }
    if (event.key === 'Enter') {
      if (active >= 0) { event.preventDefault(); event.stopImmediatePropagation(); choose(active); }
      else close(); // O Enter do leitor de código continua chegando ao fluxo de saída.
    }
  }, true);
  window.addEventListener('resize', close);
  window.addEventListener('scroll', event => { if (input && !menu.contains(event.target)) position(); }, true);
  // Fecha também ao encerrar uma operação por seus botões.
  new MutationObserver(() => { if (input && (!input.isConnected || input.closest('.hidden, [hidden]'))) close(); syncPickers(); })
    .observe(document.body, {subtree:true, attributes:true, attributeFilter:['class','hidden']});
})();
