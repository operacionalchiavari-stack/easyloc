(function () {
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const dateFmt = new Intl.DateTimeFormat("pt-BR");
  const escape = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const formatDate = (value) => { if (!value) return "—"; const d = new Date(`${String(value).slice(0, 10)}T12:00:00`); return Number.isNaN(d.getTime()) ? String(value) : dateFmt.format(d); };
  const filenamePart = (value) => String(value || "Acervo").normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");

  async function imageData(url) {
    try {
      const response = await fetch(url);
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return null;
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  function warningBox(title, text) {
    return {
      table: { widths: ["*"], body: [[{ stack: [{ text: title, bold: true, color: "#7a5400", fontSize: 9 }, { text, color: "#7a5400", fontSize: 8.5, margin: [0, 3, 0, 0], lineHeight: 1.3 }], margin: [10, 9, 10, 9] }]] },
      layout: { fillColor: () => "#fff6dd", hLineColor: () => "#f0d488", vLineColor: () => "#f0d488", hLineWidth: () => 1, vLineWidth: () => 1 },
      margin: [0, 14, 0, 0],
      unbreakable: true,
    };
  }

  function header(model, logoData, isoSealData, docTitle, docNumber) {
    return [
      { columns: [
        logoData ? { image: logoData, width: 140 } : { text: model.company?.tradeName || "", color: "#075fd8", bold: true, fontSize: 16 },
        { stack: [
          { text: docNumber, bold: true, color: "#092b50", fontSize: 12 },
          { text: `Emissão: ${formatDate(model.criadoEm || new Date())}`, fontSize: 8, color: "#64748b" },
        ], alignment: "right", margin: [0, 0, isoSealData ? 14 : 0, 0] },
        ...(isoSealData ? [{ image: isoSealData, width: 58, height: 42, fit: [58, 42], alignment: "right" }] : []),
      ], margin: [0, 0, 0, 10] },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineColor: "#dce5ee", lineWidth: 0.7 }] },
      { text: docTitle, style: "docTitle", margin: [0, 16, 0, 14] },
    ];
  }

  function itemsTable(items, columns) {
    const widths = columns.map((c) => c.width);
    return {
      table: {
        widths,
        headerRows: 1,
        body: [
          columns.map((c) => ({ text: c.label, style: "thHead" })),
          ...items.map((item) => columns.map((c) => ({ text: c.value(item), style: c.numeric ? "tdNumeric" : "td" }))),
        ],
      },
      layout: {
        fillColor: (rowIndex) => (rowIndex === 0 ? "#092b50" : rowIndex % 2 === 0 ? "#f7f9fc" : null),
        hLineColor: () => "#e5eaf0",
        vLineColor: () => "#e5eaf0",
        paddingTop: () => 6,
        paddingBottom: () => 6,
        paddingLeft: () => 8,
        paddingRight: () => 8,
      },
      margin: [0, 0, 0, 0],
    };
  }

  function styles() {
    return {
      docTitle: { fontSize: 20, bold: true, color: "#092b50" },
      thHead: { color: "#ffffff", bold: true, fontSize: 8 },
      td: { fontSize: 8.5, color: "#243447" },
      tdNumeric: { fontSize: 8.5, color: "#243447", alignment: "right" },
      micro: { fontSize: 6.8, bold: true, color: "#77869a", characterSpacing: 0.5 },
      value: { fontSize: 9.5, color: "#162b43", bold: true },
    };
  }

  function footer(model) {
    const company = model.company || {};
    return (page, count) => ({
      columns: [
        { text: `${company.tradeName || ""}${company.document ? ` · ${company.document}` : ""}`, color: "#64748b", fontSize: 7 },
        { text: `Página ${page} de ${count}`, alignment: "right", color: "#64748b", fontSize: 7 },
      ],
      margin: [50, 15, 50, 0],
    });
  }

  function infoGrid(pairs) {
    return { columns: pairs.filter(([, v]) => v).map(([label, value]) => ({ stack: [{ text: label.toUpperCase(), style: "micro" }, { text: value, style: "value" }], margin: [0, 0, 10, 8] })), columnGap: 4 };
  }

  function quotationRequestDefinition(model, logoData, isoSealData) {
    const items = model.items?.length ? model.items : [{}];
    return {
      pageSize: "A4",
      pageMargins: [50, 55, 50, 50],
      info: { title: `Solicitacao de Cotacao ${model.numero}`, author: model.company?.tradeName || "", subject: "Solicitação de Cotação" },
      header: () => ({ stack: [{ canvas: [{ type: "rect", x: 0, y: 0, w: 595, h: 5, color: "#092b50" }, { type: "rect", x: 0, y: 5, w: 74, h: 2, color: "#ed1c24" }] }] }),
      footer: footer(model),
      content: [
        ...header(model, logoData, isoSealData, "Solicitação de Cotação", model.documentNumber || `SC-${String(model.numero).padStart(6, "0")}`),
        infoGrid([["Prazo desejado", formatDate(model.prazoDesejado)], ["Validade da resposta", "Conforme combinado com o comprador"]]),
        { text: "Itens solicitados", bold: true, color: "#092b50", fontSize: 11, margin: [0, 16, 0, 8] },
        itemsTable(items, [
          { label: "Código", width: 60, value: (i) => i.codigo || "—" },
          { label: "Descrição", width: "*", value: (i) => [i.nome, i.especificacao].filter(Boolean).join(" — ") },
          { label: "Qtd.", width: 55, numeric: true, value: (i) => `${i.quantidade ?? ""} ${i.unidade || ""}` },
        ]),
        model.observacoes ? { text: "Observações", bold: true, color: "#092b50", fontSize: 10, margin: [0, 16, 0, 4] } : null,
        model.observacoes ? { text: model.observacoes, color: "#4c5f73", fontSize: 8.5 } : null,
        { text: "Solicitamos o retorno com: valor unitário, valor total, prazo de entrega, condição de pagamento, frete e validade da proposta.", color: "#4c5f73", fontSize: 8.5, margin: [0, 16, 0, 0] },
        warningBox(
          "AVISO IMPORTANTE",
          "Para o fornecimento de matérias-primas será obrigatório, no faturamento, o envio do arquivo XML da NF-e e dos certificados de qualidade correspondentes aos lotes das matérias-primas fornecidas.",
        ),
      ].filter(Boolean),
      styles: styles(),
      defaultStyle: { font: "Roboto" },
    };
  }

  function purchaseOrderDefinition(model, logoData, isoSealData) {
    const items = model.items?.length ? model.items : [{}];
    const fornecedor = model.fornecedor || {};
    return {
      pageSize: "A4",
      pageMargins: [50, 55, 50, 50],
      info: { title: `Pedido de Compra ${model.numero}`, author: model.company?.tradeName || "", subject: "Pedido de Compra" },
      header: () => ({ stack: [{ canvas: [{ type: "rect", x: 0, y: 0, w: 595, h: 5, color: "#092b50" }, { type: "rect", x: 0, y: 5, w: 74, h: 2, color: "#ed1c24" }] }] }),
      footer: footer(model),
      content: [
        ...header(model, logoData, isoSealData, "Pedido de Compra", `PC-${String(model.numero).padStart(6, "0")}`),
        { text: "Fornecedor", bold: true, color: "#092b50", fontSize: 10, margin: [0, 0, 0, 6] },
        infoGrid([
          ["Razão social", fornecedor.nome], ["CNPJ / CPF", fornecedor.documento],
          ["E-mail", fornecedor.email], ["Telefone", fornecedor.telefone],
        ]),
        { text: "Condições", bold: true, color: "#092b50", fontSize: 10, margin: [0, 10, 0, 6] },
        infoGrid([
          ["Comprador", model.comprador], ["Condição de pagamento", model.condicaoPagamento],
          ["Prazo acordado", formatDate(model.prazoAcordado)], ["Endereço de entrega", model.enderecoEntrega],
        ]),
        { text: "Itens do pedido", bold: true, color: "#092b50", fontSize: 11, margin: [0, 16, 0, 8] },
        itemsTable(items, [
          { label: "Código", width: 55, value: (i) => i.codigo || "—" },
          { label: "Descrição", width: "*", value: (i) => [i.nome, i.especificacao].filter(Boolean).join(" — ") },
          { label: "Qtd.", width: 45, numeric: true, value: (i) => `${i.quantidade ?? ""} ${i.unidade || ""}` },
          { label: "Vl. unit.", width: 65, numeric: true, value: (i) => money.format(i.valorUnitario || 0) },
          { label: "Vl. total", width: 70, numeric: true, value: (i) => money.format(i.valorTotal || 0) },
        ]),
        { columns: [{ text: "" }, { text: `Total do pedido: ${money.format(model.valorTotal || 0)}`, bold: true, color: "#092b50", fontSize: 11, alignment: "right" }], margin: [0, 10, 0, 0] },
        model.observacoes ? { text: "Observações", bold: true, color: "#092b50", fontSize: 10, margin: [0, 16, 0, 4] } : null,
        model.observacoes ? { text: model.observacoes, color: "#4c5f73", fontSize: 8.5 } : null,
        warningBox(
          "AVISO IMPORTANTE — DOCUMENTAÇÃO OBRIGATÓRIA",
          "No faturamento deste Pedido de Compra é obrigatório o envio do arquivo XML da NF-e e dos certificados de qualidade de todas as matérias-primas fornecidas. Os certificados devem corresponder aos respectivos lotes entregues. O recebimento/liberação do material poderá permanecer pendente até a apresentação completa da documentação obrigatória.",
        ),
      ].filter(Boolean),
      styles: styles(),
      defaultStyle: { font: "Roboto" },
    };
  }

  async function makePdf(definitionFn, model) {
    if (!window.pdfMake) throw new Error("Gerador de PDF indisponível.");
    const [logo, isoSeal] = await Promise.all([
      (model.company?.logo ? imageData(model.company.logo) : Promise.resolve(null)),
      model.company?.isoSeal ? imageData(model.company.isoSeal) : Promise.resolve(null),
    ]);
    return window.pdfMake.createPdf(definitionFn(model, logo, isoSeal));
  }

  async function downloadQuotationRequest(model) {
    const pdf = await makePdf(quotationRequestDefinition, model);
    pdf.download(`Solicitacao_Cotacao_${filenamePart(String(model.numero))}.pdf`);
  }

  async function previewQuotationRequest(model) {
    const pdf = await makePdf(quotationRequestDefinition, model);
    pdf.open();
  }

  async function downloadPurchaseOrder(model) {
    const pdf = await makePdf(purchaseOrderDefinition, model);
    pdf.download(`Pedido_Compra_${filenamePart(String(model.numero))}_${filenamePart(model.fornecedor?.nome)}.pdf`);
  }

  async function previewPurchaseOrder(model) {
    const pdf = await makePdf(purchaseOrderDefinition, model);
    pdf.open();
  }

  window.AcervoComprasDocs = { downloadQuotationRequest, previewQuotationRequest, downloadPurchaseOrder, previewPurchaseOrder };
})();
