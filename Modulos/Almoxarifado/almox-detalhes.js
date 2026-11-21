/* Informações completas para células compactas: mouse, foco e title nativo. */
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  window.AlmoxDetails = {
    text(label, detail = label, className = '') {
      return `<span class="almox-compact-text ${escape(className)}" tabindex="0" data-almox-detail="${escape(detail)}" title="${escape(detail)}">${escape(label)}</span>`;
    },
  };
  let anchor = null, tooltip = null;
  function close() {
    if (anchor) anchor.title = anchor.dataset.almoxDetail;
    anchor?.removeAttribute('aria-describedby'); anchor = null;
    if (tooltip?.matches(':popover-open')) tooltip.hidePopover();
  }
  function show(target) {
    if (target === anchor || !target?.dataset.almoxDetail || !HTMLElement.prototype.showPopover) return;
    close(); anchor = target; anchor.removeAttribute('title');
    if (!tooltip) {
      tooltip = document.createElement('div'); tooltip.id = 'almoxCellDetails';
      tooltip.className = 'almox-cell-details'; tooltip.setAttribute('popover','manual');
      tooltip.setAttribute('role','tooltip'); document.body.append(tooltip);
    }
    tooltip.textContent = target.dataset.almoxDetail;
    anchor.setAttribute('aria-describedby',tooltip.id); tooltip.showPopover();
    const rect = anchor.getBoundingClientRect(), width = Math.min(420, innerWidth - 24);
    tooltip.style.width = width + 'px';
    tooltip.style.left = Math.max(12, Math.min(rect.left, innerWidth - width - 12)) + 'px';
    const height = tooltip.getBoundingClientRect().height;
    tooltip.style.top = (rect.bottom + height + 12 <= innerHeight ? rect.bottom + 6 : Math.max(12, rect.top - height - 6)) + 'px';
  }
  document.addEventListener('pointerover', event => show(event.target.closest?.('[data-almox-detail]')));
  document.addEventListener('pointerout', event => {
    if (anchor?.contains(event.target) && !anchor.contains(event.relatedTarget)) close();
  });
  document.addEventListener('focusin', event => show(event.target.closest?.('[data-almox-detail]')));
  document.addEventListener('focusout', event => { if (anchor?.contains(event.target)) close(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && anchor) { event.stopImmediatePropagation(); close(); }
  },true);
  window.addEventListener('resize',close);
  document.addEventListener('scroll',close,true);
  document.addEventListener('click',close);
})();
