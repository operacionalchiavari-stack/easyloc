/* Máscaras de digitação do sistema (out/2026): CPF, CNPJ, CPF/CNPJ, telefone/celular, CEP e PIS.
   Uso: <input data-mascara="cpf|cnpj|cpfcnpj|telefone|cep|pis">. Em "cpfcnpj", data-mascara-pj="#idDoSelect"
   decide pelo tipo de pessoa (valor com "jur" ou "PJ" = CNPJ); sem ele, decide pela quantidade de números.
   O campo MOSTRA a pontuação, mas quem lê input.value pelo JS recebe só os números: o que é gravado no banco,
   validado e cifrado continua igual a antes. Valor colocado pelo JS (cadastro carregado) já aparece pontuado.
   Funciona também em campos criados depois (janelas montadas pelo JS). */
(function () {
  if (window.EasyLocMascara) return;
  const nativo = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const so = (v) => String(v ?? "").replace(/\D/g, "");
  const montar = (d, partes) => {
    let s = "", i = 0;
    for (const [tam, antes] of partes) {
      if (i >= d.length) break;
      s += (i ? antes : "") + d.slice(i, i + tam);
      i += tam;
    }
    return s;
  };
  const CPF = [[3, ""], [3, "."], [3, "."], [2, "-"]];
  const CNPJ = [[2, ""], [3, "."], [3, "."], [4, "/"], [2, "-"]];
  const PIS = [[3, ""], [5, "."], [2, "."], [1, "-"]];

  function ehPj(el, d) {
    const sel = el.dataset.mascaraPj && document.querySelector(el.dataset.mascaraPj);
    if (sel) return /jur|^pj$/i.test(sel.value || "");
    return d.length > 11;
  }
  function formatar(tipo, valor, el) {
    let d = so(valor);
    if (!d) return "";
    switch (tipo) {
      case "cpf": return montar(d.slice(0, 11), CPF);
      case "cnpj": return montar(d.slice(0, 14), CNPJ);
      case "cpfcnpj": return ehPj(el || {dataset:{}}, d) ? montar(d.slice(0, 14), CNPJ) : montar(d.slice(0, 11), CPF);
      case "pis": return montar(d.slice(0, 11), PIS);
      case "cep": return montar(d.slice(0, 8), [[5, ""], [3, "-"]]);
      case "telefone": {
        if (d.length > 11 && d.startsWith("55")) d = d.slice(2); // +55 colado
        d = d.slice(0, 11);
        if (d.length <= 2) return "(" + d;
        const resto = d.slice(2), corte = d.length === 11 ? 5 : 4;
        return "(" + d.slice(0, 2) + ") " + (resto.length > corte ? resto.slice(0, corte) + "-" + resto.slice(corte) : resto);
      }
      default: return String(valor ?? "");
    }
  }

  // Depois de reformatar, o cursor fica depois do mesmo número em que estava (não pula pro fim ao editar no meio).
  function reformatar(el) {
    const atual = nativo.get.call(el);
    const novo = formatar(el.dataset.mascara, atual, el);
    if (novo === atual) return;
    let cur = null;
    try { cur = el.selectionStart; } catch (_) {}
    const antes = cur == null ? null : so(atual.slice(0, cur)).length;
    nativo.set.call(el, novo);
    if (antes == null || document.activeElement !== el) return;
    let pos = 0, vistos = 0;
    while (pos < novo.length && vistos < antes) { if (/\d/.test(novo[pos])) vistos++; pos++; }
    try { el.setSelectionRange(pos, pos); } catch (_) {}
  }

  function ligar(el) {
    if (!(el instanceof HTMLInputElement) || el.__mascara) return;
    el.__mascara = true;
    Object.defineProperty(el, "value", {
      configurable: true,
      get() { return el.dataset.mascara ? so(nativo.get.call(el)) : nativo.get.call(el); },
      set(v) { nativo.set.call(el, el.dataset.mascara ? formatar(el.dataset.mascara, v, el) : v); }
    });
    if (!el.getAttribute("inputmode")) el.setAttribute("inputmode", "numeric");
    el.addEventListener("input", () => reformatar(el));
    // Apagar logo depois de um ponto/traço/parêntese apaga o número antes dele (senão a máscara devolvia o sinal).
    el.addEventListener("beforeinput", (ev) => {
      if (ev.inputType !== "deleteContentBackward" && ev.inputType !== "deleteContentForward") return;
      const v = nativo.get.call(el), a = el.selectionStart, z = el.selectionEnd;
      if (a == null || a !== z) return;
      const tras = ev.inputType === "deleteContentBackward";
      let i = tras ? a - 1 : a;
      if (i < 0 || i >= v.length || /\d/.test(v[i])) return;
      while (i >= 0 && i < v.length && !/\d/.test(v[i])) i += tras ? -1 : 1;
      if (i < 0 || i >= v.length) return;
      ev.preventDefault();
      const digitosAntes = so(v.slice(0, i)).length;
      nativo.set.call(el, formatar(el.dataset.mascara, v.slice(0, i) + v.slice(i + 1), el));
      const novo = nativo.get.call(el);
      let pos = 0, vistos = 0;
      while (pos < novo.length && vistos < digitosAntes) { if (/\d/.test(novo[pos])) vistos++; pos++; }
      try { el.setSelectionRange(pos, pos); } catch (_) {}
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    if (el.dataset.mascaraPj) {
      const sel = document.querySelector(el.dataset.mascaraPj);
      sel?.addEventListener("change", () => reformatar(el));
    }
    reformatar(el);
  }
  const varrer = (raiz) => {
    if (raiz.matches?.("input[data-mascara]")) ligar(raiz);
    raiz.querySelectorAll?.("input[data-mascara]").forEach(ligar);
  };

  window.EasyLocMascara = { formatar, ligar, varrer, numeros: so };
  const iniciar = () => {
    varrer(document);
    new MutationObserver((lista) => {
      for (const m of lista) m.addedNodes.forEach((n) => n.nodeType === 1 && varrer(n));
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
