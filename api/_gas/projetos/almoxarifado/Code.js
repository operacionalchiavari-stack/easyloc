const NOME_ABA_PRODUTOS    = "Produtos";
const NOME_ABA_MOV         = "Movimentacoes";
const NOME_ABA_EMPRESTIMOS = "Emprestimos";
const NOME_ABA_USUARIOS    = "Usuarios";
const NOME_ABA_CONTAGENS   = "Contagens";

function doGet(e) {

  const pagina = (e && e.parameter && e.parameter.p) || "index";

  return HtmlService
    .createHtmlOutputFromFile(pagina)
    .setTitle("Almoxarifado • Chiavari Eventos")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

}

function initSistema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  criarAbaSeNaoExistir_(ss, NOME_ABA_PRODUTOS, [
    "ID","Codigo","Produto","Categoria","Setor","Unidade","EstoqueAtual","EstoqueMinimo",
    "ValorCusto","ValorReposicao","Status","Observacoes","CriadoEm","AtualizadoEm"
  ]);

criarAbaSeNaoExistir_(ss, NOME_ABA_MOV, [
  "ID","DataHora","Tipo","ProdutoID","Codigo","Produto","Categoria","Setor","Unidade",
  "Quantidade","Responsavel","Solicitante","Destino","Observacoes","EstoqueAnterior","EstoqueAtual",
  "OrigemRegistro","Valor","Fornecedor","Numero da Nota","Finalidade","Coluna 1"
]);

criarAbaSeNaoExistir_(ss, NOME_ABA_EMPRESTIMOS, [
  "ID",
  "DataHora",
  "ProdutoID",
  "Codigo",
  "Produto",
  "Quantidade",
  "ResponsavelEntrega",
  "PessoaQuePegou",
  "Setor",
  "PrevisaoDevolucao",
  "Status",
  "Observacoes",
  "DataDevolucao",
  "ResponsavelRecebimento",
  "QuantidadeDevolvida"
]);

garantirEstruturaEmprestimos_();
  criarAbaSeNaoExistir_(ss, NOME_ABA_USUARIOS, [
    "ID","Nome","Setor","Funcao","Status","CriadoEm"
  ]);

criarAbaSeNaoExistir_(ss, NOME_ABA_CONTAGENS, [
  "ID","MesRef","DataHora","ProdutoID","Codigo","Produto","EstoqueSistema",
  "EstoqueContado","Diferenca","Responsavel","Observacoes","MetaMensal","Assertividade"
]);

garantirEstruturaContagensMensal_();

  return { ok: true, mensagem: "Sistema inicializado com sucesso." };
}

function criarAbaSeNaoExistir_(ss, nomeAba, cabecalho) {
  let sh = ss.getSheetByName(nomeAba);

  if (!sh) {
    sh = ss.insertSheet(nomeAba);
  }

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
    sh.setFrozenRows(1);
  }
}

function gerarId_(prefixo) {
  return prefixo + "_" + Date.now();
}

function agora_() {
  return new Date().toISOString();
}

function normalizarNumero_(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  return Number(String(valor).replace(",", ".")) || 0;
}

function buscarProdutos() {
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_PRODUTOS);
    if (!sh) return [];

    const dados = sh.getDataRange().getValues();
    if (!dados || dados.length <= 1) return [];

    const cab = dados[0];
    const tz = Session.getScriptTimeZone();

    return dados.slice(1)
      .filter(l => l && l[0])
      .map(l => {
        const obj = {};

        for (let i = 0; i < cab.length; i++) {
          let valor = l[i];

          if (valor instanceof Date) {
            valor = Utilities.formatDate(valor, tz, "dd/MM/yyyy HH:mm:ss");
          }

          obj[cab[i]] = valor;
        }

        return obj;
      });

  } catch (e) {
    Logger.log("ERRO buscarProdutos: " + e);
    return [];
  }
}

function buscarUsuarios() {
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_USUARIOS);
    if (!sh) return [];

    const dados = sh.getDataRange().getValues();
    if (!dados || dados.length <= 1) return [];

    const cab = dados[0];
    const tz = Session.getScriptTimeZone();

    return dados.slice(1)
      .filter(l => l && l[0])
      .map(l => {
        const obj = {};

        for (let i = 0; i < cab.length; i++) {
          let valor = l[i];

          if (valor instanceof Date) {
            valor = Utilities.formatDate(valor, tz, "dd/MM/yyyy HH:mm:ss");
          }

          obj[cab[i]] = valor;
        }

        return obj;
      })
      .filter(u => String(u.Status || "").toLowerCase() !== "inativo");

  } catch (e) {
    Logger.log("ERRO buscarUsuarios: " + e);
    return [];
  }
}

function salvarUsuario(dados) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_USUARIOS);
  if (!sh) return { ok:false };

  sh.appendRow([
    gerarId_("USER"),
    dados.nome || "",
    dados.setor || "",
    dados.funcao || "",
    dados.status || "Ativo",
    agora_()
  ]);

  return { ok:true, mensagem:"Usuário cadastrado." };
}

function salvarProduto(dados) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_PRODUTOS);
  if (!sh) return { ok:false };

  const agora = agora_();

  sh.appendRow([
    gerarId_("PROD"),
dados.codigo || gerarCodigoInsumo(),
    dados.produto || "",
    dados.categoria || "",
    dados.setor || "",
    dados.unidade || "",
    normalizarNumero_(dados.estoqueAtual),
    normalizarNumero_(dados.estoqueMinimo),
    normalizarNumero_(dados.valorCusto),
    normalizarNumero_(dados.valorReposicao),
    dados.status || "Ativo",
    dados.observacoes || "",
    agora,
    agora
  ]);

  return { ok:true, mensagem:"Produto cadastrado." };
}

function salvarMovimentacao(dados) {

  // Senha do setor removida (out/2026): quem protege agora é o login do Acervo (api/gs.js).

  if (String(dados.tipo || "").toLowerCase() !== "saida") {
    throw new Error("Essa função é exclusiva para SAÍDA");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shProdutos = ss.getSheetByName(NOME_ABA_PRODUTOS);
  const shMov = ss.getSheetByName(NOME_ABA_MOV);

  if (!shProdutos || !shMov) return { ok:false };

  const produtos = shProdutos.getDataRange().getValues();
  if (produtos.length <= 1) throw new Error("Sem produtos");

  const cab = produtos[0];

  const idxID = cab.indexOf("ID");
  const idxCodigo = cab.indexOf("Codigo");
  const idxProduto = cab.indexOf("Produto");
  const idxCategoria = cab.indexOf("Categoria");
  const idxSetor = cab.indexOf("Setor");
  const idxUnidade = cab.indexOf("Unidade");
  const idxEstoque = cab.indexOf("EstoqueAtual");
  const idxValor = cab.indexOf("ValorCusto");

  const itens = Array.isArray(dados.itens) ? dados.itens : [];

  if (!itens.length) {
    throw new Error("Adicione pelo menos 1 item");
  }

  const linhasMov = [];

  itens.forEach(item => {

    const produtoId = String(item.produtoId || "").trim();
    const qtd = normalizarNumero_(item.quantidade);

    if (!produtoId) {
      throw new Error("Produto não informado");
    }

    if (qtd <= 0) {
      throw new Error("Quantidade inválida");
    }

    let linhaProduto = -1;
    let produtoLinha = null;

    for (let i = 1; i < produtos.length; i++) {
      if (String(produtos[i][idxID]) === produtoId) {
        linhaProduto = i + 1;
        produtoLinha = produtos[i];
        break;
      }
    }

    if (linhaProduto === -1 || !produtoLinha) {
      throw new Error("Produto não encontrado");
    }

    const estoqueAtual = normalizarNumero_(
      shProdutos.getRange(linhaProduto, idxEstoque + 1).getValue()
    );

    const novoEstoque = estoqueAtual - qtd;

    if (novoEstoque < 0) {
      throw new Error("Estoque insuficiente para o item: " + (produtoLinha[idxProduto] || ""));
    }

    shProdutos.getRange(linhaProduto, idxEstoque + 1).setValue(novoEstoque);

    const codigo = produtoLinha[idxCodigo] || "";
    const produto = produtoLinha[idxProduto] || "";
    const categoria = produtoLinha[idxCategoria] || "";
    const setor = produtoLinha[idxSetor] || "";
    const unidade = produtoLinha[idxUnidade] || "";
    const valorUnitario = normalizarNumero_(produtoLinha[idxValor]);
    const valorMov = valorUnitario * qtd;

linhasMov.push([
  gerarId_("MOV"),
  agora_(),
  "saida",
  produtoId,
  codigo,
  produto,
  categoria,
  setor,
  unidade,
  qtd,
  dados.responsavel || "",
  dados.solicitante || "",
  String(dados.destino || "").trim(),
  dados.observacoes || "",
  estoqueAtual,
  novoEstoque,
  "WEB",
  valorMov,
  dados.finalidade || ""
]);
  });

  if (linhasMov.length) {
    shMov.getRange(shMov.getLastRow() + 1, 1, linhasMov.length, linhasMov[0].length)
      .setValues(linhasMov);
  }

  atualizarGastosPorSetor();

const dashboard = getDashboardAlmoxarifadoMensalSeguro();

  salvarSnapshotMetasAlmoxarifado_({
    semanaNumero: Math.min(4, Math.max(1, Math.ceil(new Date().getDate() / 7))),
    percentualMeta: dashboard.percentualMeta || 0,
    percentualAssertividade: dashboard.percentualAssertividade || 0,
    percentualGastoMes: dashboard.percentualGastoMes || 0
  });

  return { ok:true, mensagem:"Saída registrada com sucesso" };
}
function salvarEmprestimo(dados){

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const shProdutos = ss.getSheetByName(NOME_ABA_PRODUTOS);
  const shEmp = ss.getSheetByName(NOME_ABA_EMPRESTIMOS);

  if(!shProdutos || !shEmp){
    throw new Error("Abas não encontradas");
  }

  const produtos = shProdutos.getDataRange().getValues();
  const cab = produtos[0];

  const idxID = cab.indexOf("ID");
  const idxCodigo = cab.indexOf("Codigo");
  const idxProduto = cab.indexOf("Produto");
  const idxEstoque = cab.indexOf("EstoqueAtual");

  const itens = Array.isArray(dados.itens)
    ? dados.itens
    : [];

  if(!itens.length){
    throw new Error("Nenhum item informado");
  }

  const linhas = [];

  itens.forEach(item => {

    const produtoId = String(item.produtoId || "").trim();

const qtd = normalizarNumero_(item.quantidade);

    if(!produtoId){
      throw new Error("Produto não informado");
    }

    if(qtd <= 0){
      throw new Error("Quantidade inválida");
    }

    let linhaProduto = -1;
    let produtoLinha = null;

    for(let i = 1; i < produtos.length; i++){

      if(String(produtos[i][idxID]) === produtoId){

        linhaProduto = i + 1;
        produtoLinha = produtos[i];

        break;
      }
    }

    if(linhaProduto === -1 || !produtoLinha){
      throw new Error("Produto não encontrado");
    }

    const estoqueAtual = normalizarNumero_(
      shProdutos.getRange(linhaProduto, idxEstoque + 1).getValue()
    );

    if(estoqueAtual < qtd){
      throw new Error(
        "Estoque insuficiente para: " +
        (produtoLinha[idxProduto] || "")
      );
    }

    const novoEstoque = estoqueAtual - qtd;

    // 🔥 baixa estoque
    shProdutos
      .getRange(linhaProduto, idxEstoque + 1)
      .setValue(novoEstoque);

linhas.push([
  gerarId_("EMP"),
  agora_(),
  produtoId,
  produtoLinha[idxCodigo] || "",
  produtoLinha[idxProduto] || "",
  qtd,
  dados.responsavelEntrega || "",
  dados.pessoaQuePegou || "",
  dados.setor || "",
  dados.previsaoDevolucao || "",
  "Aberto",
  dados.observacoes || "",
  "",
  "",
  0
]);

  });

  if(linhas.length){

    shEmp
      .getRange(
        shEmp.getLastRow() + 1,
        1,
        linhas.length,
        linhas[0].length
      )
      .setValues(linhas);

  }

  return {
    ok:true,
    mensagem:"Empréstimo salvo"
  };

}

function salvarContagemSemanal(dados) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_CONTAGENS);
  if (!sh) return { ok:false };

  const estoqueSistema = 0;
  const estoqueContado = normalizarNumero_(dados.estoqueContado);
  const diferenca = estoqueContado - estoqueSistema;

  const assertividade = diferenca === 0 ? 1 : 0;

  sh.appendRow([
    gerarId_("CONT"),
    dados.semanaRef || "",
    agora_(),
    dados.produtoId,
    "",
    "",
    estoqueSistema,
    estoqueContado,
    diferenca,
    dados.responsavel || "",
    dados.observacoes || "",
    "Sim",
    assertividade
  ]);

  // 🔥 AGORA ATUALIZA META (IGUAL MOVIMENTAÇÃO)
const dashboard = getDashboardAlmoxarifadoMensalSeguro();

  salvarSnapshotMetasAlmoxarifado_({
    semanaNumero: Math.min(4, Math.max(1, Math.ceil(new Date().getDate() / 7))),
    percentualMeta: dashboard.percentualMeta || 0,
    percentualAssertividade: dashboard.percentualAssertividade || 0,
    percentualGastoMes: dashboard.percentualGastoMes || 0
  });

  return { ok:true, mensagem:"Contagem salva" };
}

function listarEmprestimos(limit = 50){

  garantirEstruturaEmprestimos_();

  const sh = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(NOME_ABA_EMPRESTIMOS);

  if(!sh){
    return [];
  }

  const dados = sh.getDataRange().getValues();

  if(dados.length <= 1){
    return [];
  }

  const cab = dados[0];
  const tz = Session.getScriptTimeZone();

  return dados
    .slice(1)
    .filter(linha => linha && linha[0])
    .map(linha => {

      const obj = {};

      for(let i = 0; i < cab.length; i++){

        let valor = linha[i];

        if(valor instanceof Date){

          valor = Utilities.formatDate(
            valor,
            tz,
            "yyyy-MM-dd"
          );
        }

        obj[cab[i]] = valor;
      }

      const quantidadeRetirada =
        normalizarNumero_(obj.Quantidade);

      let quantidadeDevolvida =
        normalizarNumero_(
          obj.QuantidadeDevolvida
        );

      const statusOriginal = String(
        obj.Status || ""
      )
        .trim()
        .toLowerCase();

      /*
        Compatibilidade com registros antigos:
        se já estava como Devolvido, considera que
        toda a quantidade foi devolvida.
      */
      if(
        statusOriginal === "devolvido" &&
        quantidadeDevolvida <= 0
      ){
        quantidadeDevolvida =
          quantidadeRetirada;
      }

      quantidadeDevolvida = Math.min(
        quantidadeDevolvida,
        quantidadeRetirada
      );

      const quantidadePendente = Math.max(
        quantidadeRetirada -
        quantidadeDevolvida,
        0
      );

      obj.Quantidade =
        quantidadeRetirada;

      obj.QuantidadeDevolvida =
        quantidadeDevolvida;

      obj.QuantidadePendente =
        quantidadePendente;

      if(quantidadePendente <= 0){

        obj.Status = "Devolvido";

      } else if(quantidadeDevolvida > 0){

        obj.Status = "Parcial";

      } else {

        obj.Status = "Aberto";
      }

      return obj;
    })
    .reverse()
    .slice(0, limit);
}

function listarContagens(limit = 100) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_CONTAGENS);
  if (!sh) return [];

  const dados = sh.getDataRange().getValues();
  if (dados.length <= 1) return [];

  const cab = dados[0];

  return dados.slice(1)
    .filter(l => l[0])
    .reverse()
    .slice(0, limit)
    .map(l => linhaParaObjeto_(cab, l));
}

function getMetasDoMes() {

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Metas e Gastos");
  if (!sh) return { lista: [], percentualTotal: 0 };

  const dados = sh.getDataRange().getValues();
  if (dados.length < 2) return { lista: [], percentualTotal: 0 };

const header = dados[0].map(h =>
  String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
);

const meses = [
  "janeiro","fevereiro","marco","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro"
];

  const mesAtual = meses[new Date().getMonth()];

  let colMes = header.findIndex(h => h === mesAtual);
  if (colMes === -1) {
    colMes = header.findIndex(h => h.includes(mesAtual));
  }

  if (colMes === -1) return { lista: [], percentualTotal: 0 };

  const colGasto = colMes + 1;

  let somaMeta = 0;
  let somaGasto = 0;

  const lista = [];

  for (let i = 1; i < dados.length; i++) {

    const setor = String(dados[i][0] || "").trim();
    if (!setor) continue;

function parseBR(valor){

  if (valor === null || valor === undefined || valor === "") return 0;

  // 🔥 se já for número → retorna direto
  if (typeof valor === "number") return valor;

  let v = String(valor).trim();

  // 🔥 remove tudo que não for número, vírgula ou ponto
  v = v.replace(/[^\d,.-]/g, "");

  // 🔥 remove pontos de milhar
  v = v.replace(/\.(?=\d{3})/g, "");

  // 🔥 troca vírgula por ponto
  v = v.replace(",", ".");

  return Number(v) || 0;
}

const meta = parseBR(dados[i][colMes]);
const gasto = parseBR(dados[i][colGasto]);

    somaMeta += meta;
    somaGasto += gasto;

    const percentual = meta > 0
      ? Math.min((gasto / meta) * 100, 100)
      : 0;

    lista.push({
      nome: setor,
      percentual: percentual
    });
  }

  const percentualTotal = somaMeta > 0
    ? Math.round((somaGasto / somaMeta) * 100)
    : 0;

  return {
    lista,
    percentualTotal // 🔥 ESSE É O QUE VAI PRO CARD
  };
}

function mesReferenciaAtual_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM"
  );
}

function mesReferenciaDeData_(valor) {
  if (!valor) return "";

  if (valor instanceof Date) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );
  }

  const txt = String(valor || "").trim();
  if (!txt) return "";

  // ISO: 2026-07-05T...
  if (/^\d{4}-\d{2}/.test(txt)) {
    return txt.slice(0, 7);
  }

  // BR: 05/07/2026 ou 05/07/2026 14:30
  const dataSemHora = txt.split(" ")[0];
  const partes = dataSemHora.split("/");

  if (partes.length === 3) {
    const dia = Number(partes[0]);
    const mes = Number(partes[1]) - 1;
    const ano = Number(partes[2]);

    const data = new Date(ano, mes, dia);

    if (!isNaN(data.getTime())) {
      return Utilities.formatDate(
        data,
        Session.getScriptTimeZone(),
        "yyyy-MM"
      );
    }
  }

  const data = new Date(txt);

  if (isNaN(data.getTime())) return "";

  return Utilities.formatDate(
    data,
    Session.getScriptTimeZone(),
    "yyyy-MM"
  );
}

function obterMesRefContagem_(contagem) {
  const ref = String(
    contagem.MesRef ||
    contagem.SemanaRef ||
    ""
  ).trim();

  // Novo padrão mensal
  if (/^\d{4}-\d{2}$/.test(ref)) {
    return ref;
  }

  // Compatibilidade: se ainda tiver valor antigo tipo 2026-S27,
  // usa a DataHora da contagem para descobrir o mês.
  return mesReferenciaDeData_(contagem.DataHora);
}

function obterMesRefLinhaContagem_(linha, cab) {
  const idxMes = cab.indexOf("MesRef");
  const idxSemana = cab.indexOf("SemanaRef");
  const idxDataHora = cab.indexOf("DataHora");

  let ref = "";

  if (idxMes !== -1) {
    ref = String(linha[idxMes] || "").trim();
  } else if (idxSemana !== -1) {
    ref = String(linha[idxSemana] || "").trim();
  }

  if (/^\d{4}-\d{2}$/.test(ref)) {
    return ref;
  }

  if (idxDataHora !== -1) {
    return mesReferenciaDeData_(linha[idxDataHora]);
  }

  return "";
}

function garantirEstruturaContagensMensal_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(NOME_ABA_CONTAGENS);

  if (!sh) return null;

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 13).setValues([[
      "ID","MesRef","DataHora","ProdutoID","Codigo","Produto","EstoqueSistema",
      "EstoqueContado","Diferenca","Responsavel","Observacoes","MetaMensal","Assertividade"
    ]]);
    sh.setFrozenRows(1);
    return sh;
  }

  // Mantém os dados existentes e só ajusta os títulos.
  sh.getRange(1, 2).setValue("MesRef");
  sh.getRange(1, 12).setValue("MetaMensal");

  return sh;
}

function getDashboardAlmoxarifado() {

  garantirEstruturaContagensMensal_();

  let produtos = [];
  let movimentacoes = [];
  let emprestimos = [];
  let contagens = [];

  try {
    produtos = buscarProdutos() || [];
  } catch (e) {
    Logger.log("ERRO buscarProdutos: " + e);
    produtos = [];
  }

  try {
    movimentacoes = listarMovimentacoes(200) || [];
  } catch (e) {
    Logger.log("ERRO listarMovimentacoes: " + e);
    movimentacoes = [];
  }

  try {
    emprestimos = listarEmprestimos(200) || [];
  } catch (e) {
    Logger.log("ERRO listarEmprestimos: " + e);
    emprestimos = [];
  }

  try {
    contagens = listarContagens(500) || [];
  } catch (e) {
    Logger.log("ERRO listarContagens: " + e);
    contagens = [];
  }

  const totalItens = produtos.length;

  const produtosAbaixo = produtos.filter(p => {

    if(!p || !p.Codigo || !p.Produto) return false;

    const atual = normalizarNumero_(p.EstoqueAtual);
    const minimo = normalizarNumero_(p.EstoqueMinimo);

    return atual < minimo;

  });

  const abaixoMinimo = produtosAbaixo.length;

  const estoqueTotal = produtos.reduce((acc, p) =>
    acc + Number(p.EstoqueAtual || 0), 0
  );

const totalComprasMes = calcularTotalComprasMes_();

  const emprestimosAbertos = emprestimos.filter(e =>
    String(e.Status || "").toLowerCase() === "aberto"
  ).length;

  // 🔥 MÊS ATUAL DA META DE CONTAGEM
  const mesAtual = mesReferenciaAtual_();

  // 🔥 CONTAGEM ÚNICA DE ITENS NO MÊS
  const mapaItensContadosMes = {};
  const contagensDoMes = [];

  contagens.forEach(c => {

    const mesContagem = obterMesRefContagem_(c);

    if (mesContagem !== mesAtual) return;

    contagensDoMes.push(c);

    const id = String(c.ProdutoID || "").trim();

    if (id) {
      mapaItensContadosMes[id] = true;
    }

  });

  const itensContados = Object.keys(mapaItensContadosMes).length;

  const percentualMeta = totalItens > 0
    ? Math.round((itensContados / totalItens) * 100)
    : 0;

  // ===============================
  // 🔥 ASSERTIVIDADE DO MÊS
  // ===============================
  let totalContagensMes = 0;
  let somaAssertividade = 0;

  contagensDoMes.forEach(c => {
    totalContagensMes++;
    somaAssertividade += Number(c.Assertividade || 0);
  });

  const percentualAssertividade = totalContagensMes > 0
    ? Math.round((somaAssertividade / totalContagensMes) * 100)
    : 0;

  const dadosMetasMes = getMetasDoMes();

  const dashboard = {
totalItens,
abaixoMinimo,
estoqueTotal,
totalComprasMes,
emprestimosAbertos,

    // mantém semanaAtual por compatibilidade com HTML antigo
    semanaAtual: mesAtual,
    mesAtual,

    percentualMeta,
    percentualAssertividade,

    metas: dadosMetasMes.lista,
    percentualGastoMes: dadosMetasMes.percentualTotal,

    produtos,
    produtosAbaixo,
    movimentacoes: movimentacoes.slice(0, 20),
    emprestimos: emprestimos.slice(0, 20),

    // Mostra no histórico somente as contagens do mês atual
    contagens: contagensDoMes.slice(0, 20)
  };

  return dashboard;

}
function linhaParaObjeto_(cab, linha) {
  const obj = {};
  cab.forEach((c, i) => obj[c] = linha[i]);
  return obj;
}
function listarMovimentacoes(limit = 50) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_MOV);
  if (!sh) return [];

  const dados = sh.getDataRange().getValues();
  if (dados.length <= 1) return [];

  const cab = dados[0];

  return dados.slice(1)
    .filter(l => l[0])
    .reverse()
    .slice(0, limit)
    .map(l => linhaParaObjeto_(cab, l));
}
function testeSimples(){
  return "OK BACKEND";
}
function gerarCodigoInsumo(){
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_PRODUTOS);

  const lastRow = sh.getLastRow();

  // 🔥 SE NÃO TEM DADOS AINDA
  if(lastRow <= 1){
    return "INS001";
  }

  const dados = sh.getRange(2, 2, lastRow - 1, 1).getValues();

  let maior = 0;

  dados.forEach(linha => {
    const codigo = linha[0];

    if(codigo && codigo.startsWith("INS")){
      const numero = parseInt(codigo.replace("INS",""));
      if(numero > maior) maior = numero;
    }
  });

  const novoNumero = maior + 1;

  return "INS" + String(novoNumero).padStart(3, "0");
}
function devolverEmprestimoGS(
  id,
  quantidadeAgora,
  responsavelRecebimento,
  observacaoDevolucao
){

  const lock = LockService.getScriptLock();

  try{

    lock.waitLock(30000);

    garantirEstruturaEmprestimos_();

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const sh =
      ss.getSheetByName(NOME_ABA_EMPRESTIMOS);

    const shProdutos =
      ss.getSheetByName(NOME_ABA_PRODUTOS);

    if(!sh || !shProdutos){
      throw new Error("Abas de empréstimos ou produtos não encontradas.");
    }

    const dados =
      sh.getDataRange().getValues();

    if(dados.length <= 1){
      throw new Error("Nenhuma retirada encontrada.");
    }

    const cab = dados[0];

    const idxID =
      cab.indexOf("ID");

    const idxStatus =
      cab.indexOf("Status");

    const idxQtd =
      cab.indexOf("Quantidade");

    const idxQtdDevolvida =
      cab.indexOf("QuantidadeDevolvida");

    const idxProdutoID =
      cab.indexOf("ProdutoID");

    const idxDataDev =
      cab.indexOf("DataDevolucao");

    const idxRespRec =
      cab.indexOf("ResponsavelRecebimento");

    if(
      idxID === -1 ||
      idxStatus === -1 ||
      idxQtd === -1 ||
      idxQtdDevolvida === -1 ||
      idxProdutoID === -1
    ){
      throw new Error("A estrutura da aba Emprestimos está incompleta.");
    }

    let linhaPlanilha = -1;
    let linhaDados = null;

    for(let i = 1; i < dados.length; i++){

      if(String(dados[i][idxID]) === String(id)){

        linhaPlanilha = i + 1;
        linhaDados = dados[i];

        break;
      }
    }

    if(linhaPlanilha === -1 || !linhaDados){
      throw new Error("Empréstimo não encontrado.");
    }

    const quantidadeRetirada =
      normalizarNumero_(linhaDados[idxQtd]);

let devolvidaAnterior =
  normalizarNumero_(linhaDados[idxQtdDevolvida]);

const statusAtual = String(
  linhaDados[idxStatus] || ""
)
  .trim()
  .toLowerCase();

/*
  Impede que uma retirada antiga já devolvida
  seja devolvida novamente ao estoque.
*/
if(
  statusAtual === "devolvido" &&
  devolvidaAnterior <= 0
){
  devolvidaAnterior =
    quantidadeRetirada;
}

    const quantidadeInformada =
      normalizarNumero_(quantidadeAgora);

    const quantidadePendente =
      Math.max(
        quantidadeRetirada - devolvidaAnterior,
        0
      );

    if(quantidadePendente <= 0){
      throw new Error("Esta retirada já foi totalmente devolvida.");
    }

    if(quantidadeInformada <= 0){
      throw new Error("Informe uma quantidade válida.");
    }

    if(quantidadeInformada > quantidadePendente){

      throw new Error(
        "A quantidade informada é maior que a quantidade pendente. " +
        "Quantidade pendente: " +
        quantidadePendente
      );
    }

    if(!String(responsavelRecebimento || "").trim()){
      throw new Error("Informe quem está recebendo a devolução.");
    }

    const novoTotalDevolvido =
      devolvidaAnterior + quantidadeInformada;

    const novoPendente =
      Math.max(
        quantidadeRetirada - novoTotalDevolvido,
        0
      );

    const novoStatus =
      novoPendente === 0
        ? "Devolvido"
        : "Parcial";

    sh
      .getRange(
        linhaPlanilha,
        idxQtdDevolvida + 1
      )
      .setValue(novoTotalDevolvido);

    sh
      .getRange(
        linhaPlanilha,
        idxStatus + 1
      )
      .setValue(novoStatus);

    if(idxDataDev !== -1){

      sh
        .getRange(
          linhaPlanilha,
          idxDataDev + 1
        )
        .setValue(new Date());
    }

    if(idxRespRec !== -1){

      sh
        .getRange(
          linhaPlanilha,
          idxRespRec + 1
        )
        .setValue(
          String(responsavelRecebimento).trim()
        );
    }

    const produtoId =
      linhaDados[idxProdutoID];

    const produtos =
      shProdutos.getDataRange().getValues();

    const cabProdutos =
      produtos[0];

    const idxIDProduto =
      cabProdutos.indexOf("ID");

    const idxEstoque =
      cabProdutos.indexOf("EstoqueAtual");

    let produtoEncontrado = false;

    for(let i = 1; i < produtos.length; i++){

      if(
        String(produtos[i][idxIDProduto]) ===
        String(produtoId)
      ){

        const linhaProduto = i + 1;

        const estoqueAtual =
          normalizarNumero_(
            shProdutos
              .getRange(
                linhaProduto,
                idxEstoque + 1
              )
              .getValue()
          );

        /*
          Devolve ao estoque somente a quantidade
          recebida nesta devolução.
        */
        shProdutos
          .getRange(
            linhaProduto,
            idxEstoque + 1
          )
          .setValue(
            estoqueAtual + quantidadeInformada
          );

        produtoEncontrado = true;

        break;
      }
    }

    if(!produtoEncontrado){
      throw new Error("Produto da retirada não encontrado.");
    }

    registrarHistoricoDevolucao_({
      emprestimoId: id,
      produtoId: produtoId,
      quantidade: quantidadeInformada,
      responsavel: responsavelRecebimento,
      observacao: observacaoDevolucao,
      quantidadePendente: novoPendente
    });

    return {
      ok: true,
      status: novoStatus,
      quantidadeDevolvida: novoTotalDevolvido,
      quantidadePendente: novoPendente,
      mensagem:
        novoPendente === 0
          ? "Devolução concluída."
          : "Devolução parcial registrada. Restam " +
            novoPendente +
            " unidade(s)."
    };

  } finally {

    try{
      lock.releaseLock();
    } catch(erro){
      Logger.log(erro);
    }
  }
}
function buscarSetoresMetas(){

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Metas e Gastos");
  if (!sh) return [];

  const dados = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();

  return dados
    .map(l => String(l[0] || "").trim())
    .filter(v => v);
}
function buscarFuncionarios(){

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Funcionarios");
  if (!sh) return [];

  const dados = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();

  return dados
    .map(l => String(l[0] || "").trim())
    .filter(v => v);
}
function buscarProdutosParaContagem(mesRef){

  garantirEstruturaContagensMensal_();

  const mesReferencia = String(mesRef || mesReferenciaAtual_()).trim();

  const produtos = buscarProdutos();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_ABA_CONTAGENS);

  if (!sh) {
    return {
      produtos: produtos,
      contados: []
    };
  }

  const dados = sh.getDataRange().getValues();

  if (dados.length <= 1) {
    return {
      produtos: produtos,
      contados: []
    };
  }

  const cab = dados[0];
  const idxProdutoID = cab.indexOf("ProdutoID") !== -1
    ? cab.indexOf("ProdutoID")
    : 3;

  const contados = [];

  dados.slice(1).forEach(l => {

    const mesLinha = obterMesRefLinhaContagem_(l, cab);
    const produtoId = String(l[idxProdutoID] || "").trim();

    if (mesLinha === mesReferencia && produtoId) {
      contados.push(produtoId);
    }

  });

  return {
    produtos: produtos,
    contados: [...new Set(contados)]
  };
}
function salvarContagemLote(dados){

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = garantirEstruturaContagensMensal_();

  if(!sh){
    throw new Error('A aba "' + NOME_ABA_CONTAGENS + '" não foi encontrada.');
  }

  const itens = Array.isArray(dados.itens) ? dados.itens : [];

  if(!itens.length){
    throw new Error("Nenhum item informado para contagem.");
  }

  const mesRef = String(
    dados.mesRef ||
    dados.semanaRef ||
    mesReferenciaAtual_()
  ).trim();

  const produtos = buscarProdutos() || [];
  const mapaProdutos = {};

  produtos.forEach(p => {
    const id = String(p.ID || "").trim();
    if(id){
      mapaProdutos[id] = p;
    }
  });

  const dataHoraFormatada = agora_();
  const linhas = [];

  itens.forEach(item => {

    const produtoId = String(item.produtoId || "").trim();
    const produto = mapaProdutos[produtoId];

    if(!produtoId){
      throw new Error("Produto sem ID informado.");
    }

    if(!produto){
      throw new Error("Produto não encontrado na contagem.");
    }

    const codigo = produto.Codigo || "";
    const nomeProduto = produto.Produto || "";
    const estoqueSistema = normalizarNumero_(produto.EstoqueAtual);
    const estoqueContado = normalizarNumero_(item.estoqueContado);
    const diferenca = estoqueContado - estoqueSistema;

    // 🔥 ASSERTIVIDADE: 1 = conferiu certo / 0 = divergente
    const assertividade = diferenca === 0 ? 1 : 0;

    linhas.push([
      gerarId_("CONT"),
      mesRef,
      dataHoraFormatada,
      produtoId,
      codigo,
      nomeProduto,
      estoqueSistema,
      estoqueContado,
      diferenca,
      dados.responsavel || "",
      dados.observacoes || "",
      "Sim",
      assertividade
    ]);

  });

  if(linhas.length){
    sh.getRange(sh.getLastRow() + 1, 1, linhas.length, linhas[0].length)
      .setValues(linhas);
  }

  const metas = calcularMetasAlmoxarifado_();

  salvarSnapshotMetasAlmoxarifado_({
    percentualMeta: metas.percentualMeta,
    percentualAssertividade: metas.percentualAssertividade,
    percentualGastoMes: metas.percentualGastoMes
  });

  return {
    ok:true,
    mensagem:"Contagem mensal salva com sucesso."
  };
}
function atualizarGastosPorSetor(){

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shMov = ss.getSheetByName("Movimentacoes");
  const shMetas = ss.getSheetByName("Metas e Gastos");

  if (!shMov || !shMetas) return;

  const dadosMov = shMov.getDataRange().getValues();
  const dadosMetas = shMetas.getDataRange().getValues();

  if (dadosMov.length <= 1 || dadosMetas.length <= 1) return;

  const cabMov = dadosMov[0];
  const cabMetas = dadosMetas[0];

const idxTipo = cabMov.indexOf("Tipo");
const idxDestino = cabMov.indexOf("Destino");
const idxValor = cabMov.indexOf("Valor") !== -1
  ? cabMov.indexOf("Valor")
  : cabMov.indexOf("ValorMovimentacao");
const idxData = cabMov.indexOf("DataHora");

  if (idxTipo === -1 || idxDestino === -1 || idxValor === -1 || idxData === -1) {
    throw new Error("Colunas obrigatórias não encontradas na aba Movimentacoes");
  }

  const meses = [
    "janeiro","fevereiro","marco","abril","maio","junho",
    "julho","agosto","setembro","outubro","novembro","dezembro"
  ];

  function normalizar(txt){
    return String(txt || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function numeroSeguro(valor){
    if (typeof valor === "number") return valor;
    if (valor === null || valor === undefined || valor === "") return 0;

    return Number(
      String(valor)
        .replace(/[^\d,.-]/g, "")
        .replace(/\.(?=\d{3})/g, "")
        .replace(",", ".")
    ) || 0;
  }

  const mesAtual = meses[new Date().getMonth()];

  const header = cabMetas.map(h => normalizar(h));

  let colMes = -1;
  for (let i = 0; i < header.length; i++) {
    if (header[i] === mesAtual) {
      colMes = i;
      break;
    }
  }

  if (colMes === -1) {
    throw new Error("Mês não encontrado na aba Metas e Gastos: " + mesAtual);
  }

  const colGasto = colMes + 1;

  if (colGasto >= cabMetas.length) {
    throw new Error("Coluna de Total gasto não encontrada para o mês: " + mesAtual);
  }

  const mapaSetores = {};
  for (let i = 1; i < dadosMetas.length; i++) {
    const setorMeta = normalizar(dadosMetas[i][0]);
    if (setorMeta) {
      mapaSetores[setorMeta] = i;
    }
  }

  const somaPorSetor = {};

  dadosMov.slice(1).forEach(l => {

    const tipo = normalizar(l[idxTipo]);
    if (tipo !== "saida") return;

    const setor = normalizar(l[idxDestino]);
    const valor = numeroSeguro(l[idxValor]);
    const dataRaw = String(l[idxData] || "").trim();

if (!setor || !dataRaw) return;

// 🔥 garante que valor sempre seja número
const valorFinal = Number(valor) || 0;

    // pega o mês direto da string ISO: 2026-04-22T...
    const mesNumero = Number(dataRaw.substring(5, 7)) - 1;
    const mesMov = meses[mesNumero];

    if (mesMov !== mesAtual) return;

    if (!somaPorSetor[setor]) {
      somaPorSetor[setor] = 0;
    }

somaPorSetor[setor] += valorFinal;
  });

  // limpa a coluna de gasto do mês atual
  if (dadosMetas.length > 1) {
    shMetas.getRange(2, colGasto + 1, dadosMetas.length - 1, 1).clearContent();
  }

  Object.keys(somaPorSetor).forEach(setor => {
    const idxLinha = mapaSetores[setor];
    if (idxLinha === undefined) return;

    shMetas.getRange(idxLinha + 1, colGasto + 1).setValue(somaPorSetor[setor]);
  });
}
function salvarMetasAlmoxarifado(dados){
  return { ok:true, mensagem:"Função desativada. Use salvarSnapshotMetasAlmoxarifado_." };
}
function garantirAbaMetasAlmoxarifado_() {
  const ss = SpreadsheetApp.openById("1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI");
  const nomeAba = "Metas Almoxarifado";

  let sh = ss.getSheetByName(nomeAba);

  if (!sh) {
    sh = ss.insertSheet(nomeAba);
  }

  const headers = [[
    "Mês",
    "Meta Contagem Mensal (%)",
    "Assertividade do mês",
    "Compras do mês",
    "Teto de Gasto do mês"
  ]];

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers[0].length).setValues(headers);
    sh.setFrozenRows(1);
  } else {
    sh.getRange(1, 1, 1, headers[0].length).setValues(headers);
  }

  sh.getRange(1, 1, 1, headers[0].length)
    .setFontWeight("bold")
    .setBackground("#123b78")
    .setFontColor("#ffffff");

  sh.autoResizeColumns(1, headers[0].length);

  return sh;
}
function salvarSnapshotMetasAlmoxarifado_(dados) {
  const sh = garantirAbaMetasAlmoxarifado_();

  const mes = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "MM/yyyy"
  );

  const percentualMeta = Number(dados.percentualMeta || 0);
  const percentualAssertividade = Number(dados.percentualAssertividade || 0);

  // 🔥 Se não vier informado, calcula automaticamente
  const totalComprasMes = dados.totalComprasMes !== undefined
    ? Number(dados.totalComprasMes || 0)
    : calcularTotalComprasMes_();

  const percentualGastoMes = Number(dados.percentualGastoMes || 0);

  const ultimaLinha = sh.getLastRow();

  let linha = -1;

  if (ultimaLinha >= 2) {
    const valores = sh.getRange(2, 1, ultimaLinha - 1, 1).getDisplayValues();

    for (let i = 0; i < valores.length; i++) {

      const valor = String(valores[i][0])
        .replace(/\s/g, "")
        .trim();

      if (valor === mes) {
        linha = i + 2;
        break;
      }
    }
  }

  if (linha === -1) {
    linha = sh.getLastRow() + 1;

    sh.getRange(linha, 1, 1, 5).setValues([[
      mes, 0, 0, 0, 0
    ]]);
  }

  // B - Meta Contagem Mensal
  sh.getRange(linha, 2).setValue(percentualMeta);

  // C - Assertividade do mês
  sh.getRange(linha, 3).setValue(percentualAssertividade);

  // D - Compras do mês
  sh.getRange(linha, 4).setValue(totalComprasMes);
  sh.getRange(linha, 4).setNumberFormat("R$ #,##0.00");

  // E - Teto de Gasto do mês
  sh.getRange(linha, 5).setValue(percentualGastoMes);
}
function calcularMetasAlmoxarifado_(){

  garantirEstruturaContagensMensal_();

  const produtos = buscarProdutos() || [];
  const contagens = listarContagens(500) || [];
  const dadosMetasMes = getMetasDoMes();

  const totalItens = produtos.length;
  const mesAtual = mesReferenciaAtual_();

  const mapaItensContadosMes = {};

  let total = 0;
  let soma = 0;

  contagens.forEach(c => {

    const mesContagem = obterMesRefContagem_(c);

    if (mesContagem !== mesAtual) return;

    const id = String(c.ProdutoID || "").trim();

    if (id) {
      mapaItensContadosMes[id] = true;
    }

    total++;
    soma += Number(c.Assertividade || 0);

  });

  const itensContados = Object.keys(mapaItensContadosMes).length;

  const percentualMeta = totalItens > 0
    ? Math.round((itensContados / totalItens) * 100)
    : 0;

  const percentualAssertividade = total > 0
    ? Math.round((soma / total) * 100)
    : 0;

const percentualGastoMes = dadosMetasMes.percentualTotal || 0;
const totalComprasMes = calcularTotalComprasMes_();

return {
  percentualMeta,
  percentualAssertividade,
  totalComprasMes,
  percentualGastoMes,
  mesAtual
};
}

function testeMetasSetores() {

  const dados = buscarItensDanificados();

  function normalizar(txt){
    return String(txt || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function normalizarSetor(txt){
    const t = normalizar(txt);

    if (t.includes("limpeza")) return "limpeza de estofados";
    if (t.includes("costura")) return "costura";
    if (t.includes("forracao")) return "forracao";
    if (t.includes("acabamento")) return "acabamento e pintura";
    if (t.includes("solda")) return "solda";
    if (t.includes("Marcenaria")) return "Marcenaria";

    return t;
  }

  function parseDataBR(valor){
    if (!valor) return null;

    if (valor instanceof Date) return valor;

    const txt = String(valor).trim();
    const partes = txt.split("/");
    if (partes.length !== 3) return null;

    return new Date(partes[2], partes[1]-1, partes[0]);
  }

  function statusConcluido(valor){
    return normalizar(valor).includes("concluido");
  }

  let total = 0;
  let concluidas = 0;

  const setores = {};

  dados.forEach(l => {

    total++;

    const data = parseDataBR(l.dataConclusao);
    if (!data) return;

    if (!statusConcluido(l.c11)) return;

    concluidas++;

    const fluxo = [l.c7, l.c8, l.c9, l.c10]
      .map(x => String(x || "").trim())
      .filter(x => x !== "")
      .map(normalizar);

    const fluxoUnico = [...new Set(fluxo)];

    fluxoUnico.forEach(setor => {

      const nomeSetor = normalizarSetor(setor);

      if (!setores[nomeSetor]) {
        setores[nomeSetor] = 0;
      }

      setores[nomeSetor]++;
    });

  });

  Logger.log("TOTAL DE LINHAS: " + total);
  Logger.log("TOTAL CONCLUIDAS: " + concluidas);
  Logger.log("RESULTADO POR SETOR:");
  Logger.log(JSON.stringify(setores, null, 2));

  return setores;
}

function validarSenhaPorPagina(setor, senhaDigitada) {
  /* Senha removida (out/2026): quem protege agora é o login do Acervo (api/gs.js). */
  return true;


  if (!setor || !senhaDigitada) return false;

  const ss = SpreadsheetApp.openById('133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk');
  const sh = ss.getSheetByName("Senhas");

  if (!sh) return false;

  const dados = sh.getDataRange().getValues();

  const setorBuscado = String(setor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const senhaDigitadaTratada = String(senhaDigitada).trim();

  for (let i = 1; i < dados.length; i++) {

    const setorPlanilha = String(dados[i][0] || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    const senhaPlanilha = String(dados[i][1] || "").trim();

    if (setorPlanilha === setorBuscado) {
      return senhaPlanilha === senhaDigitadaTratada;
    }

  }

  return false;
}

function getPercentuais(){

  const ss = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName("Config Percentuais");

  const dados = ss.getDataRange().getValues();

  const mapa = {};

  for(let i = 1; i < dados.length; i++){

    const linha = dados[i];
    const setor = linha[0];

    if(!setor) continue;

    mapa[setor] = [];

    for(let m = 1; m <= 12; m++){

      let valor = linha[m];

      if(typeof valor === "string" && valor.includes("%")){
        valor = parseFloat(valor.replace("%","")) / 100;
      }

      mapa[setor].push(Number(valor) || 0);

    }

  }

  return mapa;
}
function atualizarTetoGastosAutomatico(){

  limparTeto(); // 🔥 limpa só colunas verdes

  const ID_PEDIDOS = "1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78";
  const ABA_PEDIDOS = "Matriz";

  const ssPedidos = SpreadsheetApp.openById(ID_PEDIDOS)
    .getSheetByName(ABA_PEDIDOS);

  const dados = ssPedidos.getDataRange().getValues();

  const percentuais = getPercentuais();

  const resultado = {};

  // 🔥 função pra normalizar setor
  function normalizar(txt){
    return String(txt || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  for(let i = 1; i < dados.length; i++){

    const linha = dados[i];
    if(!linha || !linha[1]) continue;

    // 🔥 DATA SEGURA
    const data = linha[1] instanceof Date
      ? linha[1]
      : new Date(linha[1]);

    if(!(data instanceof Date) || isNaN(data.getTime())) continue;

    const mes = data.getMonth(); // 0-11

    // 🔥 VALORES (F, G, H)
    const locacao = parseBR(linha[5]);
    const montagem = parseBR(linha[6]);
    const frete = parseBR(linha[7]);

    const faturamento = locacao + montagem + frete;
    if(!faturamento) continue;

    // 🔥 APLICA % POR SETOR (CORRIGIDO)
    Object.keys(percentuais).forEach(setorOriginal => {

      const setorNormalizado = normalizar(setorOriginal);

const perc =
  (percentuais[setorOriginal] && percentuais[setorOriginal][mes])
    ? percentuais[setorOriginal][mes]
    : 0;

const valor = faturamento * (perc / 100);

      if(!resultado[setorNormalizado]){
        resultado[setorNormalizado] = Array(12).fill(0);
      }

      resultado[setorNormalizado][mes] += valor;

    });

  }

  escreverNoTeto(resultado);
}

function escreverNoTeto(resultado){

  const ss = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName("Metas e Gastos");

  const setores = ss.getRange(2,1, ss.getLastRow()-1,1).getValues();

  function normalizar(txt){
    return String(txt || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  setores.forEach((row, i) => {

    const setor = normalizar(row[0]);

    if(!resultado[setor]) return;

    const linha = i + 2;

    resultado[setor].forEach((valor, mes) => {

      const coluna = 2 + (mes * 2); // 🔥 colunas verdes

      const cell = ss.getRange(linha, coluna);

      cell.setValue(valor);
      cell.setNumberFormat("R$ #,##0.00");

    });

  });

}

function parseBR(valor){

  if(typeof valor === "number") return valor;

  if(!valor) return 0;

  return Number(
    String(valor)
      .replace(/\./g, "")   // remove milhar
      .replace(",", ".")    // decimal BR → EN
  ) || 0;
}

function limparTeto(){

  const sh = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName("Metas e Gastos");

  const ultima = sh.getLastRow();
  const cab = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];

  if(ultima < 2) return;

  const meses = [
    "janeiro","fevereiro","marco","abril","maio","junho",
    "julho","agosto","setembro","outubro","novembro","dezembro"
  ];

  function normalizar(txt){
    return String(txt || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  for(let col = 0; col < cab.length; col++){

    const nome = normalizar(cab[col]);

    if(meses.includes(nome)){
      sh.getRange(2, col+1, ultima-1, 1).clearContent();
    }

  }

}

function criarTriggerDiario(){

  // 🔥 remove triggers antigos
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(t => {
    if(t.getHandlerFunction() === "atualizarTetoGastosAutomatico"){
      ScriptApp.deleteTrigger(t);
    }
  });

  // 🔥 cria novo trigger
  ScriptApp.newTrigger("atualizarTetoGastosAutomatico")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

}

function atualizarAgora(){
  atualizarTetoGastosAutomatico();
}

function getPercentuaisUI(){

  const sh = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName("Config Percentuais");

  if(!sh){
    throw new Error("Aba 'Config Percentuais' não encontrada");
  }

  const dados = sh.getDataRange().getValues();

  const resultado = [];

  for(let i = 1; i < dados.length; i++){

    const linha = dados[i];

    resultado.push({
      nome: linha[0],
      valores: linha.slice(1,13)
    });

  }

  return resultado;
}

function salvarPercentuaisUI(dados){

  const sh = SpreadsheetApp.getActiveSpreadsheet()
.getSheetByName("Config Percentuais")

  dados.forEach((item, i) => {

    const linha = i + 2;

    sh.getRange(linha, 2, 1, 12).setValues([item.valores]);

  });

}
function salvarEntrada(dados){

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shProdutos = ss.getSheetByName(NOME_ABA_PRODUTOS);
  const shMov = ss.getSheetByName(NOME_ABA_MOV);

  if (!shProdutos || !shMov) {
    throw new Error("Abas não encontradas");
  }

  const nota = String(dados.nota || "").trim();
  if(!nota) throw new Error("Número da nota obrigatório");

  const produtos = shProdutos.getDataRange().getValues();
  const cab = produtos[0];

  const idxID = cab.indexOf("ID");
  const idxEstoque = cab.indexOf("EstoqueAtual");
  const idxCodigo = cab.indexOf("Codigo");
  const idxProduto = cab.indexOf("Produto");
  const idxCategoria = cab.indexOf("Categoria");
  const idxSetor = cab.indexOf("Setor");
  const idxUnidade = cab.indexOf("Unidade");
  const idxValorCusto = cab.indexOf("ValorCusto");

  const agora = agora_();

  const linhas = [];

  dados.itens.forEach(item => {

    const qtd = Number(item.qtd || 0);
    if(qtd <= 0) throw new Error("Quantidade inválida");

    const valorUnit = normalizarNumero_(item.valorUnit);
    const total = normalizarNumero_(item.total);

    let linha = -1;
    let produtoLinha = null;

    for (let i = 1; i < produtos.length; i++) {
      if (String(produtos[i][idxID]) === String(item.produtoId)) {
        linha = i + 1;
        produtoLinha = produtos[i];
        break;
      }
    }

    if (linha === -1 || !produtoLinha) {
      throw new Error("Produto não encontrado");
    }

    const estoqueAtual = Number(
      shProdutos.getRange(linha, idxEstoque + 1).getValue()
    );

    const novoEstoque = estoqueAtual + qtd;

    // 🔥 atualiza estoque
    shProdutos.getRange(linha, idxEstoque + 1).setValue(novoEstoque);

    // 🔥 atualiza custo (última compra)
    if(idxValorCusto !== -1 && valorUnit > 0){
      shProdutos.getRange(linha, idxValorCusto + 1).setValue(valorUnit);
    }

    const codigo = produtoLinha[idxCodigo];
    const produto = produtoLinha[idxProduto];
    const categoria = produtoLinha[idxCategoria];
    const setor = produtoLinha[idxSetor];
    const unidade = produtoLinha[idxUnidade];

linhas.push([
  gerarId_("MOV"),
  agora,
  "entrada",
  item.produtoId,
  codigo,
  produto,
  categoria,
  setor,
  unidade,
  qtd,
  dados.responsavel || "",
  "",
  "almoxarifado",
  dados.observacoes || "", // 🔥 AQUI
  estoqueAtual,
  novoEstoque,
  "COMPRA",
  total,
  dados.fornecedor || "",
  dados.nota || ""
]);

  });

if(linhas.length){
  shMov.getRange(shMov.getLastRow()+1, 1, linhas.length, linhas[0].length)
    .setValues(linhas);
}

// 🔥 Atualiza as metas do almoxarifado após registrar compra
const metas = calcularMetasAlmoxarifado_();

salvarSnapshotMetasAlmoxarifado_({
  percentualMeta: metas.percentualMeta,
  percentualAssertividade: metas.percentualAssertividade,
  totalComprasMes: metas.totalComprasMes,
  percentualGastoMes: metas.percentualGastoMes
});

return { ok:true, mensagem:"Entrada registrada corretamente" };
}

function testeGastosDebug(){

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Metas e Gastos");

  const dados = sh.getDataRange().getValues();
  const header = dados[0];

  Logger.log("HEADER:");
  Logger.log(header);

}
function buscarSenhaSetor(setor){

  const ss = SpreadsheetApp.openById("133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk");
  const sh = ss.getSheetByName("Senhas");

  if(!sh) throw new Error("Aba Senhas não encontrada");

  const dados = sh.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const setorLinha = String(dados[i][0] || "").trim().toLowerCase();
    const senha = String(dados[i][1] || "").trim();

    if(setorLinha === String(setor).trim().toLowerCase()){
      return senha;
    }
  }

  throw new Error("Setor não encontrado na aba Senhas");
}

function getDashboardAlmoxarifadoMensalSeguro() {

  try {

    garantirEstruturaContagensMensal_();

    let produtos = [];
    let movimentacoes = [];
    let emprestimos = [];
    let contagens = [];

    try {
      produtos = buscarProdutos() || [];
    } catch (e) {
      Logger.log("ERRO buscarProdutos: " + e.message);
      produtos = [];
    }

    try {
      movimentacoes = listarMovimentacoes(200) || [];
    } catch (e) {
      Logger.log("ERRO listarMovimentacoes: " + e.message);
      movimentacoes = [];
    }

    try {
      emprestimos = listarEmprestimos(200) || [];
    } catch (e) {
      Logger.log("ERRO listarEmprestimos: " + e.message);
      emprestimos = [];
    }

    try {
      contagens = listarContagens(500) || [];
    } catch (e) {
      Logger.log("ERRO listarContagens: " + e.message);
      contagens = [];
    }

    const totalItens = produtos.length;

    const produtosAbaixo = produtos.filter(p => {

      if (!p || !p.Codigo || !p.Produto) return false;

      const atual = normalizarNumero_(p.EstoqueAtual);
      const minimo = normalizarNumero_(p.EstoqueMinimo);

      return atual < minimo;

    });

    const abaixoMinimo = produtosAbaixo.length;

const estoqueTotal = produtos.reduce((acc, p) =>
  acc + normalizarNumero_(p.EstoqueAtual), 0
);

const totalComprasMes = calcularTotalComprasMes_();

const emprestimosAbertos = emprestimos.filter(e => {

  const quantidadeRetirada =
    normalizarNumero_(e.Quantidade);

  const quantidadeDevolvida =
    normalizarNumero_(
      e.QuantidadeDevolvida
    );

  const quantidadePendente =
    e.QuantidadePendente !== undefined
      ? normalizarNumero_(
          e.QuantidadePendente
        )
      : Math.max(
          quantidadeRetirada -
          quantidadeDevolvida,
          0
        );

  return quantidadePendente > 0;

}).length;

    const mesAtual = mesReferenciaAtual_();

    const mapaItensContadosMes = {};
    const contagensDoMes = [];

    contagens.forEach(c => {

      const mesContagem = obterMesRefContagem_(c);

      if (mesContagem !== mesAtual) return;

      contagensDoMes.push(c);

      const id = String(c.ProdutoID || "").trim();

      if (id) {
        mapaItensContadosMes[id] = true;
      }

    });

    const itensContados = Object.keys(mapaItensContadosMes).length;

    const percentualMeta = totalItens > 0
      ? Math.round((itensContados / totalItens) * 100)
      : 0;

    let totalContagensMes = 0;
    let somaAssertividade = 0;

    contagensDoMes.forEach(c => {
      totalContagensMes++;
      somaAssertividade += Number(c.Assertividade || 0);
    });

    const percentualAssertividade = totalContagensMes > 0
      ? Math.round((somaAssertividade / totalContagensMes) * 100)
      : 0;

    let dadosMetasMes = {
      lista: [],
      percentualTotal: 0
    };

    try {
      dadosMetasMes = getMetasDoMes() || {
        lista: [],
        percentualTotal: 0
      };
    } catch (e) {
      Logger.log("ERRO getMetasDoMes: " + e.message);
    }
salvarSnapshotMetasAlmoxarifado_({
  percentualMeta: percentualMeta,
  percentualAssertividade: percentualAssertividade,
  totalComprasMes: totalComprasMes,
  percentualGastoMes: dadosMetasMes.percentualTotal || 0
});

return {
  ok: true,

  totalItens,
  abaixoMinimo,
  estoqueTotal,
  totalComprasMes,
  emprestimosAbertos,

      mesAtual,
      semanaAtual: mesAtual,

      percentualMeta,
      percentualAssertividade,

      metas: dadosMetasMes.lista || [],
      percentualGastoMes: dadosMetasMes.percentualTotal || 0,

      produtos: produtos || [],
      produtosAbaixo: produtosAbaixo || [],
      movimentacoes: movimentacoes.slice(0, 20),
      emprestimos: emprestimos.slice(0, 20),
      contagens: contagensDoMes.slice(0, 20)
    };

  } catch (erro) {

    Logger.log("ERRO GERAL DASHBOARD MENSAL: " + erro.message);

    return {
      ok: false,
      erro: erro.message,

totalItens: 0,
abaixoMinimo: 0,
estoqueTotal: 0,
totalComprasMes: 0,
emprestimosAbertos: 0,

      mesAtual: mesReferenciaAtual_(),
      semanaAtual: mesReferenciaAtual_(),

      percentualMeta: 0,
      percentualAssertividade: 0,

      metas: [],
      percentualGastoMes: 0,

      produtos: [],
      produtosAbaixo: [],
      movimentacoes: [],
      emprestimos: [],
      contagens: []
    };

  }

}
function getDashboardAlmoxarifadoJSON() {

  try {

    const dados = getDashboardAlmoxarifadoMensalSeguro();

    const retorno = dados || {
      ok: false,
      erro: "getDashboardAlmoxarifadoMensalSeguro retornou vazio.",
      totalItens: 0,
      abaixoMinimo: 0,
estoqueTotal: 0,
totalComprasMes: 0,
emprestimosAbertos: 0,
      mesAtual: mesReferenciaAtual_(),
      semanaAtual: mesReferenciaAtual_(),
      percentualMeta: 0,
      percentualAssertividade: 0,
      metas: [],
      percentualGastoMes: 0,
      produtos: [],
      produtosAbaixo: [],
      movimentacoes: [],
      emprestimos: [],
      contagens: []
    };

    return JSON.stringify(retorno);

  } catch (e) {

return JSON.stringify({
  ok: false,
  erro: e.message || String(e),
  totalItens: 0,
  abaixoMinimo: 0,
  estoqueTotal: 0,
  totalComprasMes: 0,
  emprestimosAbertos: 0,
      mesAtual: mesReferenciaAtual_(),
      semanaAtual: mesReferenciaAtual_(),
      percentualMeta: 0,
      percentualAssertividade: 0,
      metas: [],
      percentualGastoMes: 0,
      produtos: [],
      produtosAbaixo: [],
      movimentacoes: [],
      emprestimos: [],
      contagens: []
    });

  }

}

function calcularTotalComprasMes_(){

  const ID_PLANILHA_ALMOXARIFADO = "1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI";

  const sh = SpreadsheetApp
    .openById(ID_PLANILHA_ALMOXARIFADO)
    .getSheetByName("Movimentacoes");

  if(!sh) return 0;

  const dados = sh.getDataRange().getValues();

  if(dados.length <= 1) return 0;

  const cab = dados[0];

  function normalizarCabecalho(valor){
    return String(valor || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function acharColuna(nomesPossiveis, fallbackIndex){
    const cabNormalizado = cab.map(normalizarCabecalho);

    for(const nome of nomesPossiveis){
      const idx = cabNormalizado.indexOf(normalizarCabecalho(nome));
      if(idx !== -1) return idx;
    }

    return fallbackIndex;
  }

  function normalizarTexto(valor){
    return String(valor || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function parseMoedaBR(valor){

    if(valor === null || valor === undefined || valor === "") return 0;

    if(typeof valor === "number") return valor;

    let txt = String(valor).trim();

    txt = txt.replace(/[^\d,.-]/g, "");

    // Ex: 1.234,56
    if(txt.includes(",") && txt.includes(".")){
      txt = txt.replace(/\./g, "").replace(",", ".");
    } 
    // Ex: 1234,56
    else if(txt.includes(",")){
      txt = txt.replace(",", ".");
    }

    return Number(txt) || 0;
  }

  const idxData = acharColuna(["DataHora"], 1);              // B
  const idxTipo = acharColuna(["Tipo"], 2);                  // C
  const idxOrigem = acharColuna(["OrigemRegistro"], 16);     // Q
  const idxValor = acharColuna(["Valor", "ValorMovimentacao"], 17); // R

  const mesAtual = mesReferenciaAtual_();

  let total = 0;

  dados.slice(1).forEach(linha => {

    const dataHora = linha[idxData];
    const tipo = normalizarTexto(linha[idxTipo]);
    const origem = normalizarTexto(linha[idxOrigem]);
    const valor = linha[idxValor];

    if(tipo !== "entrada") return;
    if(origem !== "compra") return;

    const mesLinha = mesReferenciaDeData_(dataHora);

    if(mesLinha !== mesAtual) return;

    total += parseMoedaBR(valor);

  });

  return total;
}
function garantirEstruturaEmprestimos_(){

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sh = ss.getSheetByName(NOME_ABA_EMPRESTIMOS);

  if(!sh){

    sh = ss.insertSheet(NOME_ABA_EMPRESTIMOS);

    sh.getRange(1, 1, 1, 15).setValues([[
      "ID",
      "DataHora",
      "ProdutoID",
      "Codigo",
      "Produto",
      "Quantidade",
      "ResponsavelEntrega",
      "PessoaQuePegou",
      "Setor",
      "PrevisaoDevolucao",
      "Status",
      "Observacoes",
      "DataDevolucao",
      "ResponsavelRecebimento",
      "QuantidadeDevolvida"
    ]]);

    sh.setFrozenRows(1);

    return sh;
  }

  const ultimaColuna = Math.max(sh.getLastColumn(), 1);

  const cabecalho = sh
    .getRange(1, 1, 1, ultimaColuna)
    .getValues()[0]
    .map(valor => String(valor || "").trim());

  if(!cabecalho.includes("QuantidadeDevolvida")){

    const novaColuna = sh.getLastColumn() + 1;

    sh
      .getRange(1, novaColuna)
      .setValue("QuantidadeDevolvida");

    if(sh.getLastRow() > 1){

      sh
        .getRange(2, novaColuna, sh.getLastRow() - 1, 1)
        .setValue(0);
    }
  }

  return sh;
}
function registrarHistoricoDevolucao_(dados){

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const nomeAba =
    "HistoricoDevolucoes";

  let sh =
    ss.getSheetByName(nomeAba);

  if(!sh){

    sh =
      ss.insertSheet(nomeAba);

    sh.appendRow([
      "ID",
      "DataHora",
      "EmprestimoID",
      "ProdutoID",
      "QuantidadeDevolvida",
      "ResponsavelRecebimento",
      "Observacao",
      "QuantidadePendente"
    ]);

    sh.setFrozenRows(1);
  }

  sh.appendRow([
    gerarId_("DEV"),
    agora_(),
    dados.emprestimoId || "",
    dados.produtoId || "",
    normalizarNumero_(dados.quantidade),
    dados.responsavel || "",
    dados.observacao || "",
    normalizarNumero_(dados.quantidadePendente)
  ]);
}

/* =========================================================
   GRÁFICOS DE CONSUMO — ALMOXARIFADO
========================================================= */

function getGraficosConsumoAlmoxarifado(
  mesFiltro
){

  const ID_PLANILHA_ALMOXARIFADO =
    "1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI";

  const ABA_MOVIMENTACOES =
    "Movimentacoes";

  const ABA_PRODUTOS =
    "Produtos";

  const mesSeguro =
    String(
      mesFiltro ||
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM"
      )
    ).trim();

  if(
    !/^\d{4}-\d{2}$/.test(
      mesSeguro
    )
  ){

    throw new Error(
      "Mês inválido para os gráficos."
    );

  }

  const ss =
    SpreadsheetApp.openById(
      ID_PLANILHA_ALMOXARIFADO
    );

  const abaMovimentacoes =
    ss.getSheetByName(
      ABA_MOVIMENTACOES
    );

  const abaProdutos =
    ss.getSheetByName(
      ABA_PRODUTOS
    );

  if(!abaMovimentacoes){

    throw new Error(
      'A aba "Movimentacoes" não foi encontrada.'
    );

  }

  if(!abaProdutos){

    throw new Error(
      'A aba "Produtos" não foi encontrada.'
    );

  }

  /* =====================================================
     MAPA DE PRODUTOS E CUSTOS
  ===================================================== */

  const dadosProdutos =
    abaProdutos
      .getDataRange()
      .getValues();

  const mapaProdutosCodigo = {};
  const mapaProdutosId = {};

  if(dadosProdutos.length > 1){

    const cabecalhosProdutos =
      dadosProdutos[0].map(
        graficosConsumoNormalizar_
      );

    const colProdutoId =
      graficosConsumoLocalizarColuna_(
        cabecalhosProdutos,
        [
          "id",
          "produto id",
          "produtoid"
        ],
        0
      );

    const colCodigo =
      graficosConsumoLocalizarColuna_(
        cabecalhosProdutos,
        [
          "codigo",
          "código"
        ],
        1
      );

    const colProduto =
      graficosConsumoLocalizarColuna_(
        cabecalhosProdutos,
        [
          "produto",
          "insumo"
        ],
        2
      );

    const colUnidade =
      graficosConsumoLocalizarColuna_(
        cabecalhosProdutos,
        [
          "unidade",
          "unid"
        ],
        5
      );

    const colValorCusto =
      graficosConsumoLocalizarColuna_(
        cabecalhosProdutos,
        [
          "valor custo",
          "valor de custo",
          "valorcusto",
          "custo"
        ],
        8
      );

    for(
      let i = 1;
      i < dadosProdutos.length;
      i++
    ){

      const linha =
        dadosProdutos[i];

      const id =
        String(
          linha[colProdutoId] || ""
        ).trim();

      const codigo =
        graficosConsumoNormalizarCodigo_(
          linha[colCodigo]
        );

      const produto = {

        id:
          id,

        codigo:
          codigo,

        nome:
          String(
            linha[colProduto] || ""
          ).trim(),

        unidade:
          String(
            linha[colUnidade] || ""
          ).trim(),

        custoUnitario:
          Math.max(
            0,
            graficosConsumoNumero_(
              linha[colValorCusto]
            )
          )

      };

      if(codigo){

        mapaProdutosCodigo[codigo] =
          produto;

      }

      if(id){

        mapaProdutosId[id] =
          produto;

      }

    }

  }

  /* =====================================================
     LEITURA DAS MOVIMENTAÇÕES
  ===================================================== */

  const dadosMovimentacoes =
    abaMovimentacoes
      .getDataRange()
      .getValues();

  if(dadosMovimentacoes.length < 2){

    return {

      ok:
        true,

      mes:
        mesSeguro,

      totalGeral:
        0,

      totalMovimentacoes:
        0,

      totalInsumos:
        0,

      itensSemCusto:
        [],

      topGeral:
        [],

      setores:
        []

    };

  }

  const cabecalhosMovimentacoes =
    dadosMovimentacoes[0].map(
      graficosConsumoNormalizar_
    );

  const colDataHora =
    graficosConsumoLocalizarColuna_(
      cabecalhosMovimentacoes,
      [
        "data hora",
        "datahora",
        "data"
      ],
      1
    );

  const colTipo =
    graficosConsumoLocalizarColuna_(
      cabecalhosMovimentacoes,
      [
        "tipo"
      ],
      2
    );

  const colProdutoIdMov =
    graficosConsumoLocalizarColuna_(
      cabecalhosMovimentacoes,
      [
        "produto id",
        "produtoid"
      ],
      3
    );

  const colCodigoMov =
    graficosConsumoLocalizarColuna_(
      cabecalhosMovimentacoes,
      [
        "codigo",
        "código"
      ],
      4
    );

  const colProdutoMov =
    graficosConsumoLocalizarColuna_(
      cabecalhosMovimentacoes,
      [
        "produto"
      ],
      5
    );

  const colSetorMov =
    graficosConsumoLocalizarColuna_(
      cabecalhosMovimentacoes,
      [
        "setor"
      ],
      7
    );

  const colUnidadeMov =
    graficosConsumoLocalizarColuna_(
      cabecalhosMovimentacoes,
      [
        "unidade",
        "unid"
      ],
      8
    );

  const colQuantidade =
    graficosConsumoLocalizarColuna_(
      cabecalhosMovimentacoes,
      [
        "quantidade",
        "qtd"
      ],
      9
    );

  const colDestino =
    graficosConsumoLocalizarColuna_(
      cabecalhosMovimentacoes,
      [
        "destino"
      ],
      12
    );

  const mapaGeral = {};
  const mapaSetores = {};
  const mapaSemCusto = {};

  let totalMovimentacoes = 0;

  for(
    let i = 1;
    i < dadosMovimentacoes.length;
    i++
  ){

    const linha =
      dadosMovimentacoes[i];

    const tipo =
      graficosConsumoNormalizar_(
        linha[colTipo]
      );

    /*
      Somente saídas representam consumo.
    */
    if(
      tipo !== "saida" &&
      !tipo.includes("saida")
    ){
      continue;
    }

    const mesMovimentacao =
      graficosConsumoObterMes_(
        linha[colDataHora]
      );

    if(
      mesMovimentacao !==
      mesSeguro
    ){
      continue;
    }

    const quantidade =
      Math.abs(
        graficosConsumoNumero_(
          linha[colQuantidade]
        )
      );

    if(quantidade <= 0){
      continue;
    }

    const produtoId =
      String(
        linha[colProdutoIdMov] || ""
      ).trim();

    const codigo =
      graficosConsumoNormalizarCodigo_(
        linha[colCodigoMov]
      );

    const produtoCadastrado =
      mapaProdutosCodigo[codigo] ||
      mapaProdutosId[produtoId] ||
      null;

    const nomeProduto =
      String(
        linha[colProdutoMov] ||
        (
          produtoCadastrado
            ? produtoCadastrado.nome
            : ""
        ) ||
        "Produto não identificado"
      ).trim();

    const unidade =
      String(
        linha[colUnidadeMov] ||
        (
          produtoCadastrado
            ? produtoCadastrado.unidade
            : ""
        )
      ).trim();

    const custoUnitario =
      produtoCadastrado
        ? Number(
            produtoCadastrado
              .custoUnitario || 0
          )
        : 0;

    /*
      Para saber qual departamento consumiu,
      usa primeiro a coluna Destino.

      Se Destino estiver vazio, usa Setor.
    */
    const setorOriginal =
      String(
        linha[colDestino] ||
        linha[colSetorMov] ||
        "Sem setor informado"
      )
        .replace(/\s+/g, " ")
        .trim();

    const chaveSetor =
      graficosConsumoNormalizar_(
        setorOriginal
      ) ||
      "sem setor informado";

    const chaveProduto =
      codigo ||
      produtoId ||
      graficosConsumoNormalizar_(
        nomeProduto
      );

    if(!chaveProduto){
      continue;
    }

    totalMovimentacoes++;

    /*
      Registra produtos sem custo para
      que a tela possa sinalizar.
    */
    if(custoUnitario <= 0){

      mapaSemCusto[chaveProduto] = {

        codigo:
          codigo,

        produto:
          nomeProduto

      };

    }

    const valorImpacto =
      quantidade *
      custoUnitario;

    graficosConsumoAdicionarProduto_(
      mapaGeral,
      chaveProduto,
      {
        codigo:
          codigo,

        produto:
          nomeProduto,

        unidade:
          unidade,

        custoUnitario:
          custoUnitario,

        quantidade:
          quantidade,

        valor:
          valorImpacto
      }
    );

    if(!mapaSetores[chaveSetor]){

      mapaSetores[chaveSetor] = {

        nome:
          setorOriginal,

        produtos:
          {}

      };

    }

    graficosConsumoAdicionarProduto_(
      mapaSetores[chaveSetor]
        .produtos,
      chaveProduto,
      {
        codigo:
          codigo,

        produto:
          nomeProduto,

        unidade:
          unidade,

        custoUnitario:
          custoUnitario,

        quantidade:
          quantidade,

        valor:
          valorImpacto
      }
    );

  }

  const listaGeral =
    graficosConsumoConverterLista_(
      mapaGeral
    );

  const totalGeral =
    listaGeral.reduce(
      function(total, item){

        return (
          total +
          Number(
            item.valorTotal || 0
          )
        );

      },
      0
    );

  const setores =
    Object.values(
      mapaSetores
    )
      .map(function(setor){

        const lista =
          graficosConsumoConverterLista_(
            setor.produtos
          );

        const totalSetor =
          lista.reduce(
            function(total, item){

              return (
                total +
                Number(
                  item.valorTotal || 0
                )
              );

            },
            0
          );

        return {

          setor:
            setor.nome,

          total:
            Number(
              totalSetor.toFixed(2)
            ),

          quantidadeInsumos:
            lista.length,

          top10:
            lista.slice(
              0,
              10
            )

        };

      })
      .filter(function(setor){

        return (
          setor.top10.length > 0
        );

      })
      .sort(function(a, b){

        return (
          b.total -
          a.total
        );

      });

  return {

    ok:
      true,

    mes:
      mesSeguro,

    totalGeral:
      Number(
        totalGeral.toFixed(2)
      ),

    totalMovimentacoes:
      totalMovimentacoes,

    totalInsumos:
      listaGeral.length,

    totalSetores:
      setores.length,

    itensSemCusto:
      Object.values(
        mapaSemCusto
      ),

    topGeral:
      listaGeral.slice(
        0,
        10
      ),

    setores:
      setores

  };

}


/* =========================================================
   SOMAR PRODUTO NO MAPA
========================================================= */

function graficosConsumoAdicionarProduto_(
  mapa,
  chave,
  dados
){

  if(!mapa[chave]){

    mapa[chave] = {

      codigo:
        dados.codigo || "",

      produto:
        dados.produto || "",

      unidade:
        dados.unidade || "",

      quantidade:
        0,

      custoUnitario:
        Number(
          dados.custoUnitario || 0
        ),

      valorTotal:
        0

    };

  }

  mapa[chave].quantidade +=
    Number(
      dados.quantidade || 0
    );

  mapa[chave].valorTotal +=
    Number(
      dados.valor || 0
    );

  /*
    Atualiza o custo caso o primeiro
    registro estivesse sem custo.
  */
  if(
    mapa[chave].custoUnitario <= 0 &&
    Number(
      dados.custoUnitario || 0
    ) > 0
  ){

    mapa[chave].custoUnitario =
      Number(
        dados.custoUnitario
      );

  }

}


/* =========================================================
   CONVERTER MAPA EM LISTA ORDENADA
========================================================= */

function graficosConsumoConverterLista_(
  mapa
){

  return Object.values(
    mapa || {}
  )
    .map(function(item){

      return {

        codigo:
          item.codigo || "",

        produto:
          item.produto || "",

        unidade:
          item.unidade || "",

        quantidade:
          Number(
            Number(
              item.quantidade || 0
            ).toFixed(4)
          ),

        custoUnitario:
          Number(
            Number(
              item.custoUnitario || 0
            ).toFixed(4)
          ),

        valorTotal:
          Number(
            Number(
              item.valorTotal || 0
            ).toFixed(2)
          )

      };

    })
    .sort(function(a, b){

      return (
        b.valorTotal -
        a.valorTotal
      );

    });

}


/* =========================================================
   LOCALIZAR COLUNA PELO CABEÇALHO
========================================================= */

function graficosConsumoLocalizarColuna_(
  cabecalhos,
  nomes,
  fallback
){

  const nomesNormalizados =
    nomes.map(
      graficosConsumoNormalizar_
    );

  for(
    let i = 0;
    i < nomesNormalizados.length;
    i++
  ){

    const indiceExato =
      cabecalhos.indexOf(
        nomesNormalizados[i]
      );

    if(indiceExato >= 0){
      return indiceExato;
    }

  }

  for(
    let i = 0;
    i < cabecalhos.length;
    i++
  ){

    for(
      let j = 0;
      j < nomesNormalizados.length;
      j++
    ){

      if(
        cabecalhos[i].includes(
          nomesNormalizados[j]
        )
      ){
        return i;
      }

    }

  }

  return fallback;

}


/* =========================================================
   OBTER MÊS DA DATA
========================================================= */

function graficosConsumoObterMes_(
  valor
){

  if(
    valor instanceof Date &&
    !isNaN(valor.getTime())
  ){

    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );

  }

  const texto =
    String(
      valor || ""
    ).trim();

  /*
    Formatos ISO:

    2026-04-22
    2026-04-22T13:18:10.065Z
  */
  if(
    /^\d{4}-\d{2}/.test(
      texto
    )
  ){

    return texto.slice(
      0,
      7
    );

  }

  /*
    Formatos brasileiros:

    22/04/2026
    22/04/2026 13:18
  */
  const br =
    texto.match(
      /^\d{2}\/(\d{2})\/(\d{4})/
    );

  if(br){

    return (
      br[2] +
      "-" +
      br[1]
    );

  }

  const data =
    new Date(texto);

  if(isNaN(data.getTime())){
    return "";
  }

  return Utilities.formatDate(
    data,
    Session.getScriptTimeZone(),
    "yyyy-MM"
  );

}


/* =========================================================
   CONVERTER VALOR NUMÉRICO
========================================================= */

function graficosConsumoNumero_(
  valor
){

  if(
    valor === null ||
    valor === undefined ||
    valor === ""
  ){
    return 0;
  }

  if(
    typeof valor === "number"
  ){

    return isFinite(valor)
      ? valor
      : 0;

  }

  let texto =
    String(valor)
      .trim()
      .replace(/R\$/gi, "")
      .replace(/\s/g, "")
      .replace(/[^\d,.-]/g, "");

  if(texto.includes(",")){

    texto =
      texto
        .replace(/\./g, "")
        .replace(",", ".");

  } else if(
    /^-?\d{1,3}(\.\d{3})+$/.test(
      texto
    )
  ){

    texto =
      texto.replace(/\./g, "");

  }

  const numero =
    Number(texto);

  return isFinite(numero)
    ? numero
    : 0;

}


/* =========================================================
   NORMALIZAÇÕES
========================================================= */

function graficosConsumoNormalizar_(
  valor
){

  return String(
    valor || ""
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

}


function graficosConsumoNormalizarCodigo_(
  valor
){

  return String(
    valor || ""
  )
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

}

/* =========================================================
   PAINEL (DASHBOARD) DO ALMOXARIFADO
   Uma chamada só com tudo que o painel precisa.
   Consumo = saídas × custo do insumo (mesma regra dos gráficos antigos)
   Compras = entradas com origem "compra" (mesma regra do card do mês)
========================================================= */

function getPainelAlmoxarifado(mesFiltro){

  const ss = SpreadsheetApp.openById("1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI");
  const fuso = Session.getScriptTimeZone();
  const mes = /^\d{4}-\d{2}$/.test(String(mesFiltro || "")) ? String(mesFiltro) : Utilities.formatDate(new Date(), fuso, "yyyy-MM");
  const norm = graficosConsumoNormalizar_;
  const num = graficosConsumoNumero_;

  function mesDeslocado(base, n){
    const p = base.split("-").map(Number);
    const d = new Date(p[0], p[1] - 1 + n, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  const mesAnterior = mesDeslocado(mes, -1);
  const meses12 = [];
  for (let i = 11; i >= 0; i--) meses12.push(mesDeslocado(mes, -i));

  function diaDe(valor){
    if (valor instanceof Date && !isNaN(valor.getTime())) return Number(Utilities.formatDate(valor, fuso, "d"));
    const t = String(valor || "").trim();
    let m = t.match(/^\d{4}-\d{2}-(\d{2})/); if (m) return Number(m[1]);
    m = t.match(/^(\d{2})\/\d{2}\/\d{4}/); if (m) return Number(m[1]);
    return 0;
  }

  function lerTabela(nome){
    const aba = ss.getSheetByName(nome);
    if (!aba || aba.getLastRow() < 2) return { cab: [], linhas: [] };
    const dados = aba.getDataRange().getValues();
    return { cab: dados[0].map(norm), linhas: dados.slice(1) };
  }
  function col(cab, nomes, padrao){ return graficosConsumoLocalizarColuna_(cab, nomes, padrao); }

  /* ---------- Produtos ---------- */
  const P = lerTabela("Produtos");
  const cP = {
    id: col(P.cab, ["id"], 0), codigo: col(P.cab, ["codigo"], 1), nome: col(P.cab, ["produto", "insumo"], 2),
    categoria: col(P.cab, ["categoria"], 3), setor: col(P.cab, ["setor"], 4), unidade: col(P.cab, ["unidade", "unid"], 5),
    atual: col(P.cab, ["estoqueatual", "estoque atual"], 6), minimo: col(P.cab, ["estoqueminimo", "estoque minimo"], 7),
    custo: col(P.cab, ["valorcusto", "valor custo", "valor de custo", "custo"], 8), status: col(P.cab, ["status"], 10)
  };

  const porCodigo = {}, porId = {};
  let valorEstoque = 0, itensAtivos = 0, abaixoMinimo = 0, zerados = 0, semCusto = 0;
  const criticos = [];

  P.linhas.forEach(l => {
    const nome = String(l[cP.nome] || "").trim();
    const codigo = graficosConsumoNormalizarCodigo_(l[cP.codigo]);
    if (!nome && !codigo) return;
    const prod = {
      codigo: String(l[cP.codigo] || "").trim(), nome: nome, categoria: String(l[cP.categoria] || "").trim() || "Sem categoria",
      unidade: String(l[cP.unidade] || "").trim(), atual: num(l[cP.atual]), minimo: num(l[cP.minimo]), custo: Math.max(0, num(l[cP.custo]))
    };
    if (codigo) porCodigo[codigo] = prod;
    const id = String(l[cP.id] || "").trim();
    if (id) porId[id] = prod;

    if (norm(l[cP.status]) === "inativo") return;
    itensAtivos++;
    valorEstoque += Math.max(0, prod.atual) * prod.custo;
    if (prod.custo <= 0) semCusto++;
    if (prod.atual <= 0) zerados++;
    if (prod.minimo > 0 && prod.atual < prod.minimo){
      abaixoMinimo++;
      criticos.push({ codigo: prod.codigo, produto: prod.nome, atual: prod.atual, minimo: prod.minimo, unidade: prod.unidade,
        nivel: Math.max(0, prod.atual) / prod.minimo });
    }
  });
  criticos.sort((a, b) => a.nivel - b.nivel);

  /* ---------- Movimentações ---------- */
  const M = lerTabela("Movimentacoes");
  const cM = {
    data: col(M.cab, ["datahora", "data hora", "data"], 1), tipo: col(M.cab, ["tipo"], 2), produtoId: col(M.cab, ["produtoid", "produto id"], 3),
    codigo: col(M.cab, ["codigo"], 4), produto: col(M.cab, ["produto"], 5), setor: col(M.cab, ["setor"], 7),
    quantidade: col(M.cab, ["quantidade", "qtd"], 9), solicitante: col(M.cab, ["solicitante"], 11), destino: col(M.cab, ["destino"], 12),
    origem: col(M.cab, ["origemregistro", "origem registro"], 16), valor: col(M.cab, ["valor", "valormovimentacao"], 17),
    fornecedor: col(M.cab, ["fornecedor"], 18)
  };

  const serie = {};
  meses12.forEach(m => serie[m] = { mes: m, consumo: 0, compras: 0, saidas: 0, entradas: 0 });
  const ultimoDia = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  const dias = [];
  for (let d = 1; d <= ultimoDia; d++) dias.push({ dia: d, consumo: 0, compras: 0 });

  const k = { consumo: 0, compras: 0, saidas: 0, entradas: 0, consumoAnt: 0, comprasAnt: 0, saidasAnt: 0, entradasAnt: 0 };
  const insumos = {}, setores = {}, solicitantes = {}, categorias = {}, fornecedores = {};
  const somar = (mapa, chave, nome, valor, qtd) => {
    if (!mapa[chave]) mapa[chave] = { nome: nome, valor: 0, quantidade: 0, movs: 0 };
    mapa[chave].valor += valor; mapa[chave].quantidade += qtd; mapa[chave].movs++;
  };

  M.linhas.forEach(l => {
    const m = graficosConsumoObterMes_(l[cM.data]);
    if (!m) return;
    const tipo = norm(l[cM.tipo]);
    const ehSaida = tipo.includes("saida"), ehEntrada = tipo === "entrada";
    if (!ehSaida && !ehEntrada) return;

    const qtd = Math.abs(num(l[cM.quantidade]));
    const codigo = graficosConsumoNormalizarCodigo_(l[cM.codigo]);
    const prod = porCodigo[codigo] || porId[String(l[cM.produtoId] || "").trim()] || null;
    const consumo = ehSaida ? qtd * (prod ? prod.custo : 0) : 0;
    const compra = ehEntrada && norm(l[cM.origem]) === "compra" ? num(l[cM.valor]) : 0;

    if (serie[m]){
      serie[m].consumo += consumo; serie[m].compras += compra;
      if (ehSaida) serie[m].saidas++; else serie[m].entradas++;
    }

    if (m === mesAnterior){
      k.consumoAnt += consumo; k.comprasAnt += compra;
      if (ehSaida) k.saidasAnt++; else k.entradasAnt++;
    }
    if (m !== mes) return;

    k.consumo += consumo; k.compras += compra;
    if (ehSaida) k.saidas++; else k.entradas++;
    const dia = diaDe(l[cM.data]);
    if (dia >= 1 && dia <= ultimoDia){ dias[dia - 1].consumo += consumo; dias[dia - 1].compras += compra; }

    if (ehSaida && qtd > 0){
      const nome = String(l[cM.produto] || (prod ? prod.nome : "") || "Produto não identificado").trim();
      somar(insumos, codigo || norm(nome), nome, consumo, qtd);
      if (prod) insumos[codigo || norm(nome)].unidade = prod.unidade;
      const setor = String(l[cM.destino] || l[cM.setor] || "Sem setor informado").replace(/\s+/g, " ").trim();
      somar(setores, norm(setor), setor, consumo, qtd);
      const quem = String(l[cM.solicitante] || "").replace(/\s+/g, " ").trim();
      if (quem) somar(solicitantes, norm(quem), quem, consumo, qtd);
      const cat = prod ? prod.categoria : "Sem categoria";
      somar(categorias, norm(cat), cat, consumo, qtd);
    }
    if (compra > 0){
      const forn = String(l[cM.fornecedor] || "Sem fornecedor").replace(/\s+/g, " ").trim();
      somar(fornecedores, norm(forn), forn, compra, 0);
    }
  });

  /* ---------- Retiradas em aberto ---------- */
  const E = lerTabela("Emprestimos");
  const cE = { status: col(E.cab, ["status"], 10) };
  let retiradasAbertas = 0;
  E.linhas.forEach(l => {
    const st = norm(l[cE.status]);
    if (st && !st.includes("devolvid") && !st.includes("finaliz") && !st.includes("baixad")) retiradasAbertas++;
  });

  /* ---------- Teto de gastos por setor (planilha "Metas e Gastos", só do mês atual) ---------- */
  let metas = [], tetoTotal = null;
  if (mes === mesReferenciaAtual_()){
    try { const r = getMetasDoMes(); metas = r.lista || []; tetoTotal = r.percentualTotal; } catch (e) {}
  }

  const ordenar = mapa => Object.keys(mapa).map(c => mapa[c]).sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade);
  const r2 = v => Math.round(v * 100) / 100;
  Object.keys(k).forEach(c => k[c] = r2(k[c]));

  return JSON.stringify({
    ok: true,
    mes: mes,
    kpis: Object.assign(k, { valorEstoque: r2(valorEstoque), itensAtivos, abaixoMinimo, zerados, semCusto, retiradasAbertas }),
    meses: meses12.map(m => serie[m]),
    dias: dias,
    topInsumos: ordenar(insumos).slice(0, 10),
    setores: ordenar(setores),
    solicitantes: ordenar(solicitantes).slice(0, 8),
    categorias: ordenar(categorias),
    fornecedores: ordenar(fornecedores).slice(0, 6),
    criticos: criticos.slice(0, 10),
    metas: metas,
    tetoTotal: tetoTotal
  });
}
