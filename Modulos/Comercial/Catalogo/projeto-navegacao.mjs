// Menu da landing page: a impressão continua mostrando todos os ambientes.
export function iniciarNavegacao(root, { fluxo, movimento, editor = false }) {
  const panels = [...root.querySelectorAll('.pj-amb')];
  const links = [...root.querySelectorAll('.pj-nav-list a')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let active = '';
  function select(id, { scroll = false } = {}) {
    if (id && !panels.some(p => p.id === id)) return;
    active = id;
    links.forEach(link => {
      const selected = link.hash === (id ? `#${id}` : '#inicio');
      link.classList.toggle('is-active', selected);
      if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (fluxo !== 'ambientes') return;
    root.dataset.ambienteAtivo = id ? '1' : '0';
    panels.forEach(panel => {
      const selected = panel.id === id;
      panel.classList.toggle('is-inactive', !selected);
      panel.inert = !selected;
    });
    const panel = panels.find(p => p.id === id);
    if (panel) {
      panel.querySelectorAll('.pj-reveal').forEach(el => el.classList.add('is-visible'));
      panel.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
      if (!reduce.matches && movimento !== 'nenhum') {
        panel.getAnimations().forEach(animation => animation.cancel());
        panel.animate([{ opacity: 0, transform: `translateY(${movimento === 'expressivo' ? 32 : 12}px)` }, { opacity: 1, transform: 'translateY(0)' }], { duration: movimento === 'expressivo' ? 700 : 400, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    }
    if (scroll && !editor) {
      window.scrollTo({ top: 0, behavior: reduce.matches || movimento === 'nenhum' ? 'instant' : 'smooth' });
      const focus = panel?.querySelector('h2') || root.querySelector('.pj-cover h1');
      focus?.setAttribute('tabindex', '-1');
      focus?.focus({ preventScroll: true });
    }
  }
  const click = event => {
    const link = event.target.closest('a[href^="#amb-"],a[href="#inicio"]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const id = link.hash.slice(1) === 'inicio' ? '' : link.hash.slice(1);
    if (fluxo !== 'ambientes') { select(id); return; }
    event.preventDefault();
    if (!editor) history.pushState(null, '', link.hash);
    select(id, { scroll: true });
  };
  const fromHash = () => select(panels.some(panel => `#${panel.id}` === location.hash) ? location.hash.slice(1) : '');
  const beforePrint = () => panels.forEach(panel => { panel.inert = false; });
  const afterPrint = () => select(active);
  root.addEventListener('click', click);
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  fromHash();
  return () => {
    root.removeEventListener('click', click);
    window.removeEventListener('hashchange', fromHash);
    window.removeEventListener('beforeprint', beforePrint);
    window.removeEventListener('afterprint', afterPrint);
  };
}
