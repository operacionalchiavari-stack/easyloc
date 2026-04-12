(function(){
  // utility helpers used across empresa modules
  const utils = {
    createEl(tag, options = {}) {
      const el = document.createElement(tag);
      if (options.id) el.id = options.id;
      if (options.className) el.className = options.className;
      if (options.html) el.innerHTML = options.html;
      if (options.attrs) {
        Object.keys(options.attrs).forEach(k => el.setAttribute(k, options.attrs[k]));
      }
      if (options.styles) {
        Object.assign(el.style, options.styles);
      }
      if (options.children) {
        options.children.forEach(child => el.appendChild(child));
      }
      return el;
    },
    safeQuery(container, selector) {
      return container ? container.querySelector(selector) : null;
    },
    toInt(val) {
      return parseInt(val, 10) || 0;
    },
    toFloat(val) {
      return parseFloat(val) || 0;
    },
    parseNumber(str) {
      if (typeof str !== 'string') return 0;
      return parseFloat(str.replace(/[^[0-9]\.\-]/g, '')) || 0;
    },
    formatMoney(val) {
      return Number(val || 0).toFixed(2);
    },
    debounce(fn, delay) {
      let timer;
      return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    }
  };
  window.empresa = window.empresa || {};
  window.empresa.utils = utils;
})();