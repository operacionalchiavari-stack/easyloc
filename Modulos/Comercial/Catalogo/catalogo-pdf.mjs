const assets = new URL('../../../js/vendor/pdfjs/', import.meta.url);

export async function renderPdfPage(file, choosePage = (count) => window.prompt(`Este PDF possui ${count} páginas. Qual página contém a planta?`, '1')) {
  const pdfjs = await import('../../../js/vendor/pdfjs/pdf.js');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.js', assets).href;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: new URL('cmaps/', assets).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', assets).href,
    wasmUrl: new URL('wasm/', assets).href,
  });
  try {
    const pdf = await task.promise;
    let pageNumber = 1;
    if (pdf.numPages > 1) {
      const answer = choosePage(pdf.numPages);
      if (answer === null) return null;
      pageNumber = Number(answer);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) throw new Error(`Escolha uma página entre 1 e ${pdf.numPages}.`);
    }
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(4, 2600 / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport, background: '#ffffff' }).promise;
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Falha ao converter a página do PDF.')), 'image/jpeg', .94));
    return new File([blob], `${file.name.replace(/\.pdf$/i, '')}-pagina-${pageNumber}.jpg`, { type: 'image/jpeg' });
  } finally {
    await task.destroy();
  }
}
