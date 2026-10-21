(function () {
  "use strict";

  function text(node, selector) {
    const el = node?.querySelector(selector);
    return el ? el.textContent.trim() : "";
  }
  function num(node, selector) {
    const value = text(node, selector);
    return value ? Number(value) : 0;
  }

  // Parser independente do modal legado de Almoxarifado (nao reaproveita
  // almoxarifado.js de proposito - evita qualquer risco de tocar num fluxo
  // ja em uso). Le o XML padrao de NF-e modelo 55 (infNFe/emit/ide/det).
  function parse(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("XML inválido ou corrompido.");
    const infNFe = doc.querySelector("infNFe");
    if (!infNFe) throw new Error("Este arquivo não é uma NF-e (modelo 55) reconhecível.");
    const ide = doc.querySelector("ide");
    const emit = doc.querySelector("emit");
    const total = doc.querySelector("ICMSTot");
    const chave = (infNFe.getAttribute("Id") || "").replace(/^NFe/, "");

    const items = [...doc.querySelectorAll("det")].map((det, index) => {
      const prod = det.querySelector("prod");
      return {
        numero_item: Number(det.getAttribute("nItem")) || index + 1,
        codigo_fornecedor: text(prod, "cProd"),
        gtin: text(prod, "cEAN"),
        descricao_xml: text(prod, "xProd"),
        ncm: text(prod, "NCM"),
        cfop: text(prod, "CFOP"),
        unidade_xml: text(prod, "uCom"),
        quantidade_xml: num(prod, "qCom"),
        valor_unitario: num(prod, "vUnCom"),
        valor_total: num(prod, "vProd"),
        lote: text(prod, "nLote"),
        validade: text(prod, "dVal") || null,
      };
    });

    return {
      chave_nfe: chave,
      numero_nfe: text(ide, "nNF"),
      serie: text(ide, "serie"),
      data_emissao: (text(ide, "dhEmi") || text(ide, "dEmi") || "").slice(0, 10) || null,
      natureza_operacao: text(ide, "natOp"),
      cnpj_fornecedor: text(emit, "CNPJ") || text(emit, "CPF"),
      fornecedor: text(emit, "xNome"),
      endereco_fornecedor: {
        logradouro: text(emit, "enderEmit xLgr"), numero: text(emit, "enderEmit nro"),
        bairro: text(emit, "enderEmit xBairro"), municipio: text(emit, "enderEmit xMun"), uf: text(emit, "enderEmit UF"),
      },
      valor_produtos: num(total, "vProd"),
      valor_frete: num(total, "vFrete"),
      valor_desconto: num(total, "vDesc"),
      valor_impostos: num(total, "vTotTrib"),
      valor_total: num(total, "vNF"),
      items,
    };
  }

  window.AcervoNfeParser = { parse };
})();
