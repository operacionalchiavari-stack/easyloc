// Substituto do qrcodejs nos testes: desenha um canvas de verdade (sem rede).
window.QRCode = function (el, o) { const c = document.createElement("canvas"); c.width = o.width; c.height = o.height; c.getContext("2d").fillRect(0, 0, 10, 10); el.appendChild(c); };
window.QRCode.CorrectLevel = { M: 0 };
