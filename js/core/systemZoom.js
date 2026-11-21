(function () {
  'use strict';
  function apply(value) {
    // O iframe acompanha a escala do portal; aplicar novamente duplicaria o zoom.
    try { if (window.parent !== window && window.parent.EasyLocSystemZoom) return; } catch (_) {}
    const number = Number(value);
    const zoom = Number.isFinite(number) ? Math.min(125, Math.max(75, number)) : 100;
    let style = document.getElementById('elSystemZoom');
    if (!style) {
      style = document.createElement('style');
      style.id = 'elSystemZoom';
      document.head.appendChild(style);
    }
    style.textContent = '@media screen and (min-width:861px){html{zoom:' + zoom / 100 + '}}@media print{html{zoom:1!important}}';
  }
  window.EasyLocSystemZoom = { apply };
})();
