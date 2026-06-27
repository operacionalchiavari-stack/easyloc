export const CONTRATO_MODELO_INICIAL = `Contrato de Locação

Cláusula 1 - Objeto:
O presente contrato tem como objeto a locação dos materiais descritos no pedido nº {{pedido_numero}}, para utilização no evento do cliente {{cliente_nome}}.

Cláusula 2 - Local do Evento:
O evento será realizado em {{local_nome}}, localizado em {{local_endereco}}, {{local_cidade}} - {{local_estado}}.

Cláusula 3 - Período:
A entrega está prevista para {{data_entrega}} às {{hora_entrega}}, e a recolha está prevista para {{data_recolha}} às {{hora_recolha}}.

Cláusula 4 - Valores:
O valor da locação é de {{valor_locacao}}, o valor dos serviços é de {{valor_servicos}}, totalizando {{valor_total}}.

Cláusula 5 - Responsabilidade:
O contratante se responsabiliza pela guarda, conservação e devolução dos materiais locados nas mesmas condições em que foram entregues.

Cláusula 6 - Itens Locados:
{{itens_locados}}

Cláusula 7 - Pagamento:
O pagamento será realizado conforme as condições acordadas no pedido.`;

export const CONTRATO_TAG_GROUPS = [
  {
    titulo: "Pedido",
    tags: [
      ["{{pedido_numero}}", "Número do pedido"],
      ["{{data_evento}}", "Data do evento"],
      ["{{data_entrega}}", "Data de entrega"],
      ["{{hora_entrega}}", "Hora de entrega"],
      ["{{data_recolha}}", "Data de recolha"],
      ["{{hora_recolha}}", "Hora de recolha"],
    ],
  },
  {
    titulo: "Cliente",
    tags: [
      ["{{cliente_nome}}", "Nome"],
      ["{{cliente_documento}}", "Documento"],
      ["{{cliente_telefone}}", "Telefone"],
      ["{{cliente_email}}", "E-mail"],
    ],
  },
  {
    titulo: "Local",
    tags: [
      ["{{local_nome}}", "Nome do local"],
      ["{{local_endereco}}", "Endereço"],
      ["{{local_cidade}}", "Cidade"],
      ["{{local_estado}}", "Estado"],
    ],
  },
  {
    titulo: "Valores",
    tags: [
      ["{{valor_locacao}}", "Valor de locação"],
      ["{{valor_servicos}}", "Valor de serviços"],
      ["{{valor_total}}", "Valor total"],
      ["{{valor_desconto}}", "Desconto"],
      ["{{valor_final}}", "Valor final"],
      ["{{forma_pagamento}}", "Forma de pagamento"],
    ],
  },
  {
    titulo: "Empresa",
    tags: [
      ["{{empresa_nome}}", "Nome"],
      ["{{empresa_cnpj}}", "CNPJ"],
      ["{{empresa_endereco}}", "Endereço"],
      ["{{empresa_telefone}}", "Telefone"],
      ["{{empresa_email}}", "E-mail"],
    ],
  },
  {
    titulo: "Itens",
    tags: [
      ["{{itens_locados}}", "Itens locados"],
    ],
  },
];

const NAO_INFORMADO = "Não informado";

export function escapeHtml(value = ""){
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function textoParaHtml(value = ""){
  return escapeHtml(value).replace(/\n/g, "<br>");
}

export function formatarMoeda(value){
  const number = Number(value || 0);
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarData(value){
  if(!value) return NAO_INFORMADO;
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(String(value))) return value;
  const date = /^\d{4}-\d{2}-\d{2}/.test(String(value))
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`)
    : new Date(value);
  if(Number.isNaN(date.getTime())) return NAO_INFORMADO;
  return date.toLocaleDateString("pt-BR");
}

function valor(value, fallback = NAO_INFORMADO){
  const normalizado = value === undefined || value === null ? "" : String(value).trim();
  return normalizado || fallback;
}

function listaItens(itens = []){
  const linhas = (Array.isArray(itens) ? itens : [])
    .map((item) => {
      const quantidade = Number(item.quantidade || item.quantidade_solicitada || item.qtd || 0) || 1;
      const nome = valor(item.nome || item.item_nome || item.produto || item.descricao_total, "Item");
      return `- ${quantidade}x ${nome}`;
    });
  return linhas.length ? linhas.join("\n") : NAO_INFORMADO;
}

export function renderizarContrato(conteudoModelo = "", dadosPedido = {}){
  const dados = {
    pedido_numero: valor(dadosPedido.pedido?.numero || dadosPedido.pedido_numero),
    cliente_nome: valor(dadosPedido.cliente?.nome || dadosPedido.cliente_nome),
    cliente_documento: valor(dadosPedido.cliente?.documento || dadosPedido.cliente_documento),
    cliente_telefone: valor(dadosPedido.cliente?.telefone || dadosPedido.cliente_telefone),
    cliente_email: valor(dadosPedido.cliente?.email || dadosPedido.cliente_email),
    local_nome: valor(dadosPedido.local?.nome || dadosPedido.local_nome),
    local_endereco: valor(dadosPedido.local?.endereco || dadosPedido.local_endereco),
    local_cidade: valor(dadosPedido.local?.cidade || dadosPedido.local_cidade),
    local_estado: valor(dadosPedido.local?.estado || dadosPedido.local_estado),
    data_evento: formatarData(dadosPedido.pedido?.data_evento || dadosPedido.data_evento),
    data_entrega: formatarData(dadosPedido.pedido?.data_entrega || dadosPedido.data_entrega),
    hora_entrega: valor(dadosPedido.pedido?.hora_entrega || dadosPedido.hora_entrega),
    data_recolha: formatarData(dadosPedido.pedido?.data_recolha || dadosPedido.pedido?.data_coleta || dadosPedido.data_recolha || dadosPedido.data_coleta),
    hora_recolha: valor(dadosPedido.pedido?.hora_recolha || dadosPedido.pedido?.hora_coleta || dadosPedido.hora_recolha || dadosPedido.hora_coleta),
    valor_locacao: formatarMoeda(dadosPedido.valores?.locacao ?? dadosPedido.valor_locacao),
    valor_servicos: formatarMoeda(dadosPedido.valores?.servicos ?? dadosPedido.valor_servicos),
    valor_total: formatarMoeda(dadosPedido.valores?.total ?? dadosPedido.valor_total),
    valor_desconto: formatarMoeda(dadosPedido.valores?.desconto ?? dadosPedido.valor_desconto),
    valor_final: formatarMoeda(dadosPedido.valores?.final ?? dadosPedido.valor_final ?? dadosPedido.valores?.total ?? dadosPedido.valor_total),
    forma_pagamento: valor(dadosPedido.financeiro?.forma_pagamento || dadosPedido.forma_pagamento),
    empresa_nome: valor(dadosPedido.empresa?.nome || dadosPedido.empresa_nome),
    empresa_cnpj: valor(dadosPedido.empresa?.cnpj || dadosPedido.empresa_cnpj),
    empresa_endereco: valor(dadosPedido.empresa?.endereco || dadosPedido.empresa_endereco),
    empresa_telefone: valor(dadosPedido.empresa?.telefone || dadosPedido.empresa_telefone),
    empresa_email: valor(dadosPedido.empresa?.email || dadosPedido.empresa_email),
    itens_locados: listaItens(dadosPedido.itens || dadosPedido.itens_locados),
  };

  return String(conteudoModelo || "").replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(dados, key) ? dados[key] : NAO_INFORMADO
  ));
}

window.EasyLocContratos = {
  CONTRATO_MODELO_INICIAL,
  CONTRATO_TAG_GROUPS,
  escapeHtml,
  textoParaHtml,
  formatarMoeda,
  formatarData,
  renderizarContrato,
};
