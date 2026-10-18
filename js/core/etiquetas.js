/* =====================================================
   ETIQUETAS COM QR (out/2026)
   Duas etiquetas da operação:
   - patrimônio: QR fixo colado no móvel (ACERVO:PAT:<código>), feita uma vez;
   - envio: gerada a cada separação, uma por móvel do pedido (ACERVO:ENV:<código>),
     "como encomenda do Mercado Livre".
   A leitura (Separação de Materiais) entende esses dois formatos.

   EasyLocEtiquetas.escolherFormato() → "100x50" | "100x150" | "a4" | null
   EasyLocEtiquetas.imprimir({ formato, etiquetas: [{ qr, titulo, linhas, codigo, destaque, contador }] })
   A impressão sai de um quadro escondido na própria página (funciona dentro do dashboard).
===================================================== */
(function () {
  if (window.EasyLocEtiquetas) return;

  const FORMATOS = {
    "100x50": { nome: "Térmica 100 × 50 mm", pagina: "100mm 50mm", largura: "100mm", altura: "50mm", qr: 260 },
    "100x150": { nome: "Envio 100 × 150 mm (padrão Mercado Livre)", pagina: "100mm 150mm", largura: "100mm", altura: "150mm", qr: 520 },
    a4: { nome: "Folha A4 (24 por folha)", pagina: "A4", largura: "70mm", altura: "37mm", qr: 220 }
  };
  const CHAVE_FORMATO = "easyloc_etiqueta_formato";

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function carregarQrLib() {
    if (window.QRCode) return Promise.resolve();
    if (window.EasyLocQR?.ensureLib) return window.EasyLocQR.ensureLib();
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
      s.onload = () => ok(); s.onerror = () => erro(new Error("Não foi possível carregar o gerador de QR."));
      document.head.appendChild(s);
    });
  }

  async function qrImagem(texto, tamanho) {
    await carregarQrLib();
    const caixa = document.createElement("div");
    caixa.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(caixa);
    try {
      new window.QRCode(caixa, { text: String(texto), width: tamanho, height: tamanho, correctLevel: window.QRCode.CorrectLevel.M });
      const canvas = caixa.querySelector("canvas");
      if (canvas) return canvas.toDataURL("image/png");
      const img = caixa.querySelector("img");
      return img?.src || "";
    } finally { caixa.remove(); }
  }

  function escolherFormato(padrao) {
    let salvo = padrao || "100x50";
    try { salvo = localStorage.getItem(CHAVE_FORMATO) || salvo; } catch {}
    return new Promise((resolve) => {
      const d = document.createElement("dialog");
      d.className = "etq-dialogo";
      d.innerHTML = '<form method="dialog"><h3>Tamanho da etiqueta</h3>' +
        Object.entries(FORMATOS).map(([k, f]) => '<label><input type="radio" name="f" value="' + k + '"' + (k === salvo ? " checked" : "") + '> ' + esc(f.nome) + "</label>").join("") +
        '<footer><button value="cancelar" type="submit">Cancelar</button><button value="ok" type="submit" class="etq-ok">Imprimir</button></footer></form>';
      const estilo = document.getElementById("etqDialogoEstilo") || Object.assign(document.createElement("style"), { id: "etqDialogoEstilo" });
      estilo.textContent = ".etq-dialogo{border:0;border-radius:16px;padding:22px 24px;max-width:380px;width:calc(100% - 32px);box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:Inter,system-ui,sans-serif}" +
        ".etq-dialogo h3{margin:0 0 14px;font-size:18px}.etq-dialogo label{display:flex;gap:10px;align-items:center;padding:9px 0;font-size:14px;cursor:pointer}" +
        ".etq-dialogo footer{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}.etq-dialogo button{border:1px solid #d9d3c7;background:#fff;border-radius:999px;padding:8px 16px;font:600 13px inherit;cursor:pointer}" +
        ".etq-dialogo .etq-ok{background:#44443f;border-color:#44443f;color:#fff}";
      document.head.appendChild(estilo);
      document.body.appendChild(d);
      d.addEventListener("close", () => {
        const escolhido = d.returnValue === "ok" ? d.querySelector("input:checked")?.value : null;
        if (escolhido) { try { localStorage.setItem(CHAVE_FORMATO, escolhido); } catch {} }
        d.remove();
        resolve(escolhido || null);
      });
      d.showModal();
    });
  }

  function cssDoFormato(f, formato) {
    const a4 = formato === "a4";
    const envio = formato === "100x150";
    return "@page{size:" + f.pagina + ";margin:" + (a4 ? "10mm 5mm" : "0") + "}" +
      "*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#000}" +
      (a4 ? ".folha{display:grid;grid-template-columns:repeat(3,70mm);grid-auto-rows:37mm;justify-content:center}" : "") +
      ".etq{width:" + f.largura + ";height:" + f.altura + ";overflow:hidden;display:flex;" + (envio ? "flex-direction:column;padding:6mm" : "gap:3mm;align-items:center;padding:" + (a4 ? "2.5mm" : "4mm")) + ";" + (a4 ? "" : "page-break-after:always;break-after:page") + "}" +
      ".etq:last-child{page-break-after:auto;break-after:auto}" +
      ".etq img{display:block;flex:none;width:" + (envio ? "62mm" : a4 ? "30mm" : "40mm") + ";height:" + (envio ? "62mm" : a4 ? "30mm" : "40mm") + ";" + (envio ? "margin:4mm auto 3mm" : "") + "}" +
      ".etq .txt{min-width:0;flex:1;display:flex;flex-direction:column;gap:" + (a4 ? ".6mm" : "1mm") + "}" +
      ".etq .marca{font-size:" + (a4 ? "6pt" : "7pt") + ";letter-spacing:.12em;text-transform:uppercase}" +
      ".etq .destaque{font-size:" + (envio ? "30pt" : a4 ? "11pt" : "15pt") + ";font-weight:800;line-height:1}" +
      ".etq .titulo{font-size:" + (envio ? "14pt" : a4 ? "7.5pt" : "9.5pt") + ";font-weight:700;line-height:1.15;overflow:hidden;display:-webkit-box;-webkit-line-clamp:" + (envio ? 3 : 2) + ";-webkit-box-orient:vertical}" +
      ".etq .linha{font-size:" + (envio ? "11pt" : a4 ? "6.5pt" : "8pt") + ";line-height:1.2;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}" +
      ".etq .rodape{display:flex;justify-content:space-between;align-items:flex-end;gap:2mm;margin-top:auto}" +
      ".etq .codigo{font-family:'Courier New',monospace;font-size:" + (envio ? "12pt" : a4 ? "7pt" : "9pt") + ";font-weight:700}" +
      ".etq .contador{font-size:" + (envio ? "20pt" : a4 ? "9pt" : "12pt") + ";font-weight:800}" +
      (envio ? ".etq .topo{border-bottom:1.2mm solid #000;padding-bottom:3mm;margin-bottom:3mm}" : "");
  }

  function htmlEtiqueta(e, img, formato) {
    const linhas = (e.linhas || []).filter(Boolean).map((l) => '<div class="linha">' + esc(l) + "</div>").join("");
    if (formato === "100x150") {
      return '<div class="etq"><div class="topo"><div class="marca">' + esc(e.marca || "") + '</div><div class="destaque">' + esc(e.destaque || "") + "</div></div>" +
        '<div class="txt">' + linhas + '</div><img src="' + img + '" alt=""><div class="titulo">' + esc(e.titulo || "") + "</div>" +
        '<div class="rodape"><span class="codigo">' + esc(e.codigo || "") + '</span><span class="contador">' + esc(e.contador || "") + "</span></div></div>";
    }
    return '<div class="etq"><img src="' + img + '" alt=""><div class="txt"><div class="marca">' + esc(e.marca || "") + "</div>" +
      (e.destaque ? '<div class="destaque">' + esc(e.destaque) + "</div>" : "") + '<div class="titulo">' + esc(e.titulo || "") + "</div>" + linhas +
      '<div class="rodape"><span class="codigo">' + esc(e.codigo || "") + '</span><span class="contador">' + esc(e.contador || "") + "</span></div></div></div>";
  }

  async function imprimir({ formato = "100x50", etiquetas = [] } = {}) {
    const f = FORMATOS[formato] || FORMATOS["100x50"];
    if (!etiquetas.length) return false;
    const imagens = [];
    for (const e of etiquetas) imagens.push(await qrImagem(e.qr, f.qr));
    const corpo = etiquetas.map((e, i) => htmlEtiqueta(e, imagens[i], formato)).join("");
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>' + cssDoFormato(f, formato) + "</style></head><body>" +
      (formato === "a4" ? '<div class="folha">' + corpo + "</div>" : corpo) + "</body></html>";
    const quadro = document.createElement("iframe");
    quadro.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(quadro);
    const doc = quadro.contentDocument;
    doc.open(); doc.write(html); doc.close();
    await new Promise((r) => setTimeout(r, 250));
    quadro.contentWindow.focus();
    quadro.contentWindow.print();
    setTimeout(() => quadro.remove(), 60000);
    window.__ultimaImpressaoEtiquetas = html; // para os testes
    return true;
  }

  window.EasyLocEtiquetas = { FORMATOS, escolherFormato, imprimir, qrImagem };
})();
