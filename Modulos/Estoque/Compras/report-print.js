/* Relatorio A4 compartilhado (comprovante de recebimento, inventario, contagem de ferramental). */
(() => {
  "use strict";
  const style = `
#receiptReportPrintArea{position:fixed;left:-99999px;top:0;background:#fff}
#receiptReportPrintArea .rr-doc{width:182mm;margin:0 auto;font-family:Inter,Arial,sans-serif;color:#2b3b4f;font-size:9pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
#receiptReportPrintArea .rr-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:10px;border-bottom:2px solid #04111f}
#receiptReportPrintArea .rr-head img{display:block;height:30px;width:auto;max-width:70mm;object-fit:contain}
#receiptReportPrintArea .rr-head-company{margin-top:4px;color:#6b7789;font-size:7.5pt}
#receiptReportPrintArea .rr-head-id{text-align:right;color:#6b7789;font-size:7.5pt}
#receiptReportPrintArea .rr-head-id strong{display:block;color:#04111f;font-size:11pt;font-weight:700}
#receiptReportPrintArea .rr-title{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:14px 0 12px}
#receiptReportPrintArea .rr-title span{display:block;color:#6b7789;font-size:7.5pt;font-weight:600;letter-spacing:.1em;text-transform:uppercase}
#receiptReportPrintArea .rr-title h1{margin:3px 0 0;color:#04111f;font-size:17pt;font-weight:700;line-height:1.15}
#receiptReportPrintArea .rr-status{flex:0 0 auto;padding:4px 12px;border-radius:999px;font-size:8.5pt;font-weight:700}
#receiptReportPrintArea .rr-status.ok{background:#dff8ee;color:#047857}
#receiptReportPrintArea .rr-status.warn{background:#fff1d6;color:#b45309}
#receiptReportPrintArea .rr-status.bad{background:#fee2e2;color:#b91c1c}
#receiptReportPrintArea .rr-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #d9dee6;border-radius:6px;overflow:hidden}
#receiptReportPrintArea .rr-grid>div{min-width:0;padding:7px 10px;border-right:1px solid #e8ebef;border-bottom:1px solid #e8ebef}
#receiptReportPrintArea .rr-grid>div:nth-child(4n){border-right:0}
#receiptReportPrintArea .rr-grid .w2{grid-column:span 2}
#receiptReportPrintArea .rr-grid .w4{grid-column:1/-1;border-right:0}
#receiptReportPrintArea .rr-grid small{display:block;color:#6b7789;font-size:6.5pt;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
#receiptReportPrintArea .rr-grid p{margin:1px 0 0;color:#04111f;font-weight:600;overflow-wrap:anywhere}
#receiptReportPrintArea .rr-grid code{font-family:"SFMono-Regular",Consolas,monospace;font-size:8pt;letter-spacing:.04em}
#receiptReportPrintArea .rr-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
#receiptReportPrintArea .rr-kpis div{padding:8px 10px;border:1px solid #e8ebef;border-radius:6px;background:#f6f7f9}
#receiptReportPrintArea .rr-kpis small{display:block;color:#6b7789;font-size:6.5pt;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
#receiptReportPrintArea .rr-kpis strong{display:block;margin-top:2px;color:#04111f;font-size:12pt}
#receiptReportPrintArea .rr-section{margin-top:16px}
#receiptReportPrintArea .rr-section h2{display:flex;align-items:baseline;gap:8px;margin:0 0 7px;padding-bottom:5px;border-bottom:1px solid #d9dee6;color:#04111f;font-size:10.5pt;font-weight:700;break-after:avoid}
#receiptReportPrintArea .rr-section h2 b{color:#6b7789;font-weight:500}
#receiptReportPrintArea table{width:100%;border-collapse:collapse;table-layout:fixed}
#receiptReportPrintArea th{padding:5px 6px;background:#04111f;color:#fff;font-size:6.8pt;font-weight:600;letter-spacing:.04em;text-align:left;text-transform:uppercase}
#receiptReportPrintArea td{padding:5px 6px;border-bottom:1px solid #e8ebef;vertical-align:top;font-size:8pt;overflow-wrap:anywhere}
#receiptReportPrintArea tr{break-inside:avoid}
#receiptReportPrintArea th{white-space:normal;line-height:1.25;vertical-align:bottom;overflow-wrap:normal;word-break:normal}
#receiptReportPrintArea td .rr-pill{white-space:normal;text-align:center;line-height:1.3}
#receiptReportPrintArea tbody tr:nth-child(even) td{background:#f9fafb}
#receiptReportPrintArea td small{display:block;color:#6b7789;font-size:7pt}
#receiptReportPrintArea .num{text-align:right;white-space:nowrap}
#receiptReportPrintArea .rr-totals{display:grid;grid-template-columns:repeat(5,1fr);margin-top:6px;border:1px solid #d9dee6;border-radius:6px;overflow:hidden}
#receiptReportPrintArea .rr-totals div{padding:6px 10px;border-right:1px solid #e8ebef}
#receiptReportPrintArea .rr-totals div:last-child{border-right:0;background:#04111f;color:#fff}
#receiptReportPrintArea .rr-totals small{display:block;font-size:6.5pt;font-weight:600;letter-spacing:.08em;text-transform:uppercase;opacity:.75}
#receiptReportPrintArea .rr-totals strong{font-size:9.5pt}
#receiptReportPrintArea .rr-pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:7pt;font-weight:700;white-space:nowrap}
#receiptReportPrintArea .rr-pill.ok{background:#dff8ee;color:#047857}
#receiptReportPrintArea .rr-pill.warn{background:#fff1d6;color:#b45309}
#receiptReportPrintArea .rr-pill.bad{background:#fee2e2;color:#b91c1c}
#receiptReportPrintArea .rr-pill.na{background:#eef1f5;color:#6b7789}
#receiptReportPrintArea .rr-check{margin-bottom:8px;border:1px solid #e8ebef;border-radius:6px;overflow:hidden;break-inside:avoid}
#receiptReportPrintArea .rr-check header{display:flex;justify-content:space-between;gap:10px;padding:5px 10px;background:#f6f7f9;font-weight:700;color:#04111f}
#receiptReportPrintArea .rr-check header small{color:#6b7789;font-weight:500}
#receiptReportPrintArea .rr-check table td{border-bottom:1px solid #f0f2f5}
#receiptReportPrintArea .rr-note{padding:9px 12px;border:1px solid #e8ebef;border-left:3px solid #04111f;border-radius:4px;background:#f6f7f9;white-space:pre-wrap}
#receiptReportPrintArea .rr-note.ok{border-left-color:#047857}
#receiptReportPrintArea .rr-rnc{margin-bottom:8px;padding:9px 12px;border:1px solid #f3c9c9;border-left:3px solid #b91c1c;border-radius:4px;break-inside:avoid}
#receiptReportPrintArea .rr-rnc header{display:flex;justify-content:space-between;gap:10px;font-weight:700;color:#04111f}
#receiptReportPrintArea .rr-rnc p{margin:4px 0 0}
#receiptReportPrintArea .rr-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
#receiptReportPrintArea .rr-photos figure{margin:0;border:1px solid #d9dee6;border-radius:6px;overflow:hidden;break-inside:avoid}
#receiptReportPrintArea .rr-photos img{display:block;width:100%;height:42mm;object-fit:cover;background:#f6f7f9}
#receiptReportPrintArea .rr-photos figcaption{padding:4px 8px;color:#6b7789;font-size:7pt}
#receiptReportPrintArea .rr-signs{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:30px;break-inside:avoid}
#receiptReportPrintArea .rr-signs div{padding-top:5px;border-top:1px solid #6b7789;color:#6b7789;font-size:7.5pt;text-align:center}
#receiptReportPrintArea .rr-signs strong{display:block;color:#04111f;font-size:8pt}
#receiptReportPrintArea .rr-foot{display:flex;justify-content:space-between;gap:12px;margin-top:18px;padding-top:7px;border-top:1px solid #d9dee6;color:#6b7789;font-size:7pt}
@media print{
  @page{size:A4;margin:12mm 14mm}
  body.printing-receipt-report:not(#receiptReportPrintArea){display:block!important;margin:0!important;padding:0!important;overflow:visible!important;height:auto!important;min-height:0!important}
  body.printing-receipt-report>*:not(#receiptReportPrintArea){display:none!important}
  body.printing-receipt-report #receiptReportPrintArea{position:static!important;left:auto!important;display:block!important}
}`;
  async function mount(html, options = {}) {
    const topDoc = window.top.document;
    let pageStyle = topDoc.getElementById("receiptReportPageStyle");
    if (!pageStyle) { pageStyle = topDoc.createElement("style"); pageStyle.id = "receiptReportPageStyle"; topDoc.head.appendChild(pageStyle); }
    if (!topDoc.getElementById("receiptReportFont")) {
      const link = topDoc.createElement("link");
      link.id = "receiptReportFont";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
      topDoc.head.appendChild(link);
    }
    if (!topDoc.getElementById("receiptReportStyle")) {
      const el = topDoc.createElement("style");
      el.id = "receiptReportStyle";
      el.textContent = style;
      topDoc.head.appendChild(el);
    }
    let area = topDoc.getElementById("receiptReportPrintArea");
    if (!area) { area = topDoc.createElement("div"); area.id = "receiptReportPrintArea"; topDoc.body.appendChild(area); }
    // anexos sigilosos (bucket privado): troca pelo link temporário antes de montar, para a imagem sair na impressão
    const api = window.AcervoComprasAPI || window.top.AcervoComprasAPI;
    const privateUrls = [...new Set(String(html).match(/https?:\/\/[^"'\s)]+\/storage\/v1\/object\/authenticated\/budget-files\/[^"'\s)]+/g) || [])];
    for (const url of privateUrls) {
      try { html = html.split(url).join(await api.resolveFileUrl(url.replace(/&amp;/g, "&"))); } catch (error) { /* sem acesso: fica sem a imagem */ }
    }
    pageStyle.textContent = options.orientation === "landscape" ? '@media print { @page { size: A4 landscape; margin: 10mm 11mm; } }' : '';
    area.innerHTML = html;
    await Promise.all([...area.querySelectorAll("img")].map((img) => (img.complete ? img.decode?.().catch(() => {}) : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; }))));
    topDoc.body.classList.add("printing-receipt-report");
    window.top.onafterprint = () => { topDoc.body.classList.remove("printing-receipt-report"); area.innerHTML = ""; pageStyle.textContent = ""; };
    window.top.print();
  }
  window.AcervoComprasReport = { style, mount };
})();
