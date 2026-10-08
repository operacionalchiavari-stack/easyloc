function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ================= BUSCAR COMISSÃO =================
function buscarComissaoPorSetor(setor){
  const sheet = SpreadsheetApp
    .openById("1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78")
    .getSheetByName("Comissão");

  if (!sheet) return 0;

  const dados = sheet.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    const nomeSetor = String(dados[i][0]).trim();
    const comissao = Number(dados[i][1] || 0);

    if (nomeSetor === setor) {
      return comissao; // já vem como decimal (ex: 0,003)
    }
  }

  return 0;
}

// ================= CALCULO =================
function calcularComissao(valorLocacao, score, comissao){

  const valor = Number(valorLocacao || 0);
  const scoreNum = Number(score || 0);
  const comissaoNum = Number(comissao || 0);

  // 🔥 converte score (34 → 0,34)
  const scoreCalc = scoreNum > 1 ? scoreNum / 100 : scoreNum;

const valorComissao = valor * scoreCalc * comissaoNum;

// 🔥 arredonda para 2 casas (dinheiro)
return Number(valorComissao.toFixed(2));
}
// ================= TRATAR RESPOSTAS =================
function respostaParaPlanilha(valor){

  if(valor === true){
    return "Sim";
  }

  if(valor === false){
    return "Não";
  }

  const texto = String(
    valor === null || valor === undefined ? "" : valor
  )
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if(texto === "sim"){
    return "Sim";
  }

  if(texto === "nao"){
    return "Não";
  }

  // Ainda não respondido
  return "";
}


function respostaParaFront(valor){

  const texto = String(
    valor === null || valor === undefined ? "" : valor
  )
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if(texto === "sim"){
    return true;
  }

  if(texto === "nao"){
    return false;
  }

  // Resposta pendente
  return null;
}


function converterDataParaPlanilha(data){

  if(!data){
    return "";
  }

  const texto = String(data).trim();

  // Formato vindo do input: yyyy-MM-dd
  if(/^\d{4}-\d{2}-\d{2}$/.test(texto)){

    const partes = texto.split("-");

    return new Date(
      Number(partes[0]),
      Number(partes[1]) - 1,
      Number(partes[2])
    );
  }

  return data;
}

// ================= CÁLCULO DOS SCORES POR SETOR =================
function normalizarRespostaCalculo(valor){

  if(valor === true || valor === false){
    return valor;
  }

  return respostaParaFront(valor);
}


function possuiResposta(valor){

  const resposta = normalizarRespostaCalculo(valor);

  return resposta === true || resposta === false;
}


function calcularScoreSetor(respostas, perguntasEspecificas){

  const pesos = {

    // PERGUNTAS GERAIS — CLIENTE E EVENTO
    5: { sim: 7, nao: 2 },
    6: { sim: 4, nao: 5 },
    7: { sim: 4, nao: 1 },
    8: { sim: 3, nao: 1 },

    // PERGUNTAS GERAIS — LOGÍSTICA
    9: { sim: 5, nao: 2 },
    10: { sim: 7, nao: 2 },

    // MONTAGEM — MESMOS PESOS DE ESTOFADOS
    15: { sim: 18, nao: 6 },
    16: { sim: 14, nao: 5 },
    17: { sim: 14, nao: 5 },
    18: { sim: 24, nao: 8 }
  };

  const perguntasGerais = [
    5,
    6,
    7,
    8,
    9,
    10
  ];

  let total = 0;

  [
    ...perguntasGerais,
    ...perguntasEspecificas
  ].forEach(id => {

    const resposta = normalizarRespostaCalculo(
      respostas[id]
    );

    if(resposta === true){
      total += pesos[id].sim;
    }

    if(resposta === false){
      total += pesos[id].nao;
    }

  });

  return total;
}


// ================= GARANTIR COLUNAS ATÉ AI =================
function garantirColunasMontagem(sheet){

  const totalNecessario = 35;

  const totalAtual = sheet.getMaxColumns();

  if(totalAtual < totalNecessario){

    sheet.insertColumnsAfter(
      totalAtual,
      totalNecessario - totalAtual
    );
  }
}

// ================= ATUALIZAR MONTAGEM DE UMA LINHA =================
function atualizarCalculoMontagemDaLinha(
  sheet,
  numeroLinha
){

  garantirColunasMontagem(sheet);

  const linha = sheet
    .getRange(
      numeroLinha,
      1,
      1,
      35
    )
    .getValues()[0];

  /*
   * AC até AF:
   * AC = índice 28
   * AD = índice 29
   * AE = índice 30
   * AF = índice 31
   */
  const respostasMontagem = [
    linha[28],
    linha[29],
    linha[30],
    linha[31]
  ];

  const temRespostaMontagem =
    respostasMontagem.some(possuiResposta);

  /*
   * Caso Montagem ainda não tenha respostas,
   * deixa AG, AH e AI vazias.
   */
  if(!temRespostaMontagem){

    sheet
      .getRange(
        numeroLinha,
        33,
        1,
        3
      )
      .clearContent();

    return;
  }

  const respostas = {

    // GERAIS
    5: linha[12],
    6: linha[13],
    7: linha[14],
    8: linha[15],
    9: linha[16],
    10: linha[17],

    // MONTAGEM
    15: linha[28],
    16: linha[29],
    17: linha[30],
    18: linha[31]
  };

  const scoreMontagem = calcularScoreSetor(
    respostas,
    [15, 16, 17, 18]
  );

  const comissaoMontagem =
    buscarComissaoPorSetor("Montagem");

  /*
   * Montagem usa o valor da coluna G.
   * No array, a coluna G é o índice 6.
   */
  const valorMontagem = Number(
    linha[6] || 0
  );

  const valorComissaoMontagem =
    calcularComissao(
      valorMontagem,
      scoreMontagem,
      comissaoMontagem
    );

  /*
   * AG = Resultado Montagem
   * AH = Comissão Montagem
   * AI = Valor da Comissão
   */
  sheet
    .getRange(
      numeroLinha,
      33,
      1,
      3
    )
    .setValues([[
      scoreMontagem,
      comissaoMontagem,
      valorComissaoMontagem
    ]]);

  sheet
    .getRange(numeroLinha, 33)
    .setNumberFormat("0");

  sheet
    .getRange(numeroLinha, 34)
    .setNumberFormat("0.000");

  sheet
    .getRange(numeroLinha, 35)
    .setNumberFormat("R$ #,##0.00");
}


// ================= RECALCULAR TODAS AS MONTAGENS =================
function recalcularMontagemTodasLinhas(){

  const sheet = SpreadsheetApp
    .openById(
      "1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78"
    )
    .getSheetByName("Matriz");

  if(!sheet){
    return;
  }

  garantirColunasMontagem(sheet);

  const ultimaLinha = sheet.getLastRow();

  if(ultimaLinha < 2){
    return;
  }

  const quantidadeLinhas =
    ultimaLinha - 1;

  const dados = sheet
    .getRange(
      2,
      1,
      quantidadeLinhas,
      35
    )
    .getValues();

  /*
   * Busca a comissão somente uma vez,
   * evitando consultar a aba em cada linha.
   */
  const comissaoMontagem =
    buscarComissaoPorSetor("Montagem");

  const resultados = dados.map(linha => {

    const respostasMontagem = [
      linha[28],
      linha[29],
      linha[30],
      linha[31]
    ];

    const temRespostaMontagem =
      respostasMontagem.some(possuiResposta);

    if(!temRespostaMontagem){

      return [
        "",
        "",
        ""
      ];
    }

    const respostas = {

      // GERAIS
      5: linha[12],
      6: linha[13],
      7: linha[14],
      8: linha[15],
      9: linha[16],
      10: linha[17],

      // MONTAGEM
      15: linha[28],
      16: linha[29],
      17: linha[30],
      18: linha[31]
    };

    const scoreMontagem =
      calcularScoreSetor(
        respostas,
        [15, 16, 17, 18]
      );

    const valorMontagem = Number(
      linha[6] || 0
    );

    const valorComissaoMontagem =
      calcularComissao(
        valorMontagem,
        scoreMontagem,
        comissaoMontagem
      );

    return [
      scoreMontagem,
      comissaoMontagem,
      valorComissaoMontagem
    ];
  });

  sheet
    .getRange(
      2,
      33,
      quantidadeLinhas,
      3
    )
    .setValues(resultados);

  // AG — Resultado
  sheet
    .getRange(
      2,
      33,
      quantidadeLinhas,
      1
    )
    .setNumberFormat("0");

  // AH — Percentual/comissão
  sheet
    .getRange(
      2,
      34,
      quantidadeLinhas,
      1
    )
    .setNumberFormat("0.000");

  // AI — Valor da comissão
  sheet
    .getRange(
      2,
      35,
      quantidadeLinhas,
      1
    )
    .setNumberFormat("R$ #,##0.00");

  SpreadsheetApp.flush();
}
// ================= SALVAR 1 PEDIDO =================
// ================= SALVAR 1 PEDIDO =================
function salvarPedido(dados) {

  const sheet = SpreadsheetApp
    .openById(
      "1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78"
    )
    .getSheetByName("Matriz");

  if(!sheet){
    throw new Error(
      'A aba "Matriz" não foi encontrada.'
    );
  }

  garantirColunasMontagem(sheet);

  const idPedido =
    dados.id || gerarIdPedido();

  // ===== ESTOFADOS =====
  const comissao =
    buscarComissaoPorSetor("Forração");

  const valorComissao =
    calcularComissao(
      dados.valorLocacao,
      dados.score,
      comissao
    );

  // ===== PINTURA =====
  const comissaoPintura =
    buscarComissaoPorSetor(
      "Acabamento e Pintura"
    );

  const valorComissaoPintura =
    calcularComissao(
      dados.valorLocacao,
      dados.scorePintura,
      comissaoPintura
    );

  // ===== MONTAGEM =====
  const temRespostaMontagem = [
    dados.r15,
    dados.r16,
    dados.r17,
    dados.r18
  ].some(possuiResposta);

  let scoreMontagem = "";
  let comissaoMontagem = "";
  let valorComissaoMontagem = "";

  if(temRespostaMontagem){

    const respostasMontagem = {

      // GERAIS
      5: dados.r5,
      6: dados.r6,
      7: dados.r7,
      8: dados.r8,
      9: dados.r9,
      10: dados.r10,

      // MONTAGEM
      15: dados.r15,
      16: dados.r16,
      17: dados.r17,
      18: dados.r18
    };

    scoreMontagem =
      calcularScoreSetor(
        respostasMontagem,
        [15, 16, 17, 18]
      );

    comissaoMontagem =
      buscarComissaoPorSetor(
        "Montagem"
      );

    valorComissaoMontagem =
      calcularComissao(
        dados.valorMontagem,
        scoreMontagem,
        comissaoMontagem
      );
  }

  sheet.appendRow([

    // A — ID
    idPedido,

    // B até E — Pedido
    dados.data || "",
    dados.numero || "",
    dados.cliente || "",
    dados.local || "",

    // F até H — Financeiro
    dados.valorLocacao || "",
    dados.valorMontagem || "",
    dados.valorFrete || "",

    // I até L — Estofados
    respostaParaPlanilha(dados.r1),
    respostaParaPlanilha(dados.r2),
    respostaParaPlanilha(dados.r3),
    respostaParaPlanilha(dados.r4),

    // M até P — Cliente e evento
    respostaParaPlanilha(dados.r5),
    respostaParaPlanilha(dados.r6),
    respostaParaPlanilha(dados.r7),
    respostaParaPlanilha(dados.r8),

    // Q e R — Logística
    respostaParaPlanilha(dados.r9),
    respostaParaPlanilha(dados.r10),

    // S até U — Estofados
    dados.score || 0,
    comissao,
    valorComissao,

    // V até Y — Pintura
    respostaParaPlanilha(dados.r11),
    respostaParaPlanilha(dados.r12),
    respostaParaPlanilha(dados.r13),
    respostaParaPlanilha(dados.r14),

    // Z até AB — Pintura
    dados.scorePintura || 0,
    comissaoPintura,
    valorComissaoPintura,

    // AC até AF — Montagem
    respostaParaPlanilha(dados.r15),
    respostaParaPlanilha(dados.r16),
    respostaParaPlanilha(dados.r17),
    respostaParaPlanilha(dados.r18),

    // AG até AI — Resultado e comissão
    scoreMontagem,
    comissaoMontagem,
    valorComissaoMontagem
  ]);

  const novaLinha = sheet.getLastRow();

  sheet
    .getRange(novaLinha, 35)
    .setNumberFormat("R$ #,##0.00");

  return {
    sucesso: true,
    id: idPedido
  };
}
// ================= LISTAR =================
// ================= LISTAR =================
// ================= LISTAR =================
function listarPedidos(){

  const sheet = SpreadsheetApp
    .openById(
      "1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78"
    )
    .getSheetByName("Matriz");

  if(!sheet){
    return [];
  }

  garantirIdsMatriz();

  /*
   * Toda vez que o painel carregar,
   * recalcula Montagem com as respostas
   * que vieram do cronograma.
   */
  recalcularMontagemTodasLinhas();

  const dados =
    sheet.getDataRange().getDisplayValues();

  if(dados.length < 2){
    return [];
  }

  return dados
    .slice(1)
    .filter(linha => {

      return linha.some(coluna =>
        String(coluna || "").trim() !== ""
      );

    })
    .map(linha => ({

      id: linha[0] || "",

      data: linha[1] || "",
      numero: linha[2] || "",
      cliente: linha[3] || "",
      local: linha[4] || "",

      valorLocacao: linha[5] || "",
      valorMontagem: linha[6] || "",
      valorFrete: linha[7] || "",

      // ESTOFADOS
      r1: respostaParaFront(linha[8]),
      r2: respostaParaFront(linha[9]),
      r3: respostaParaFront(linha[10]),
      r4: respostaParaFront(linha[11]),

      // GERAIS
      r5: respostaParaFront(linha[12]),
      r6: respostaParaFront(linha[13]),
      r7: respostaParaFront(linha[14]),
      r8: respostaParaFront(linha[15]),
      r9: respostaParaFront(linha[16]),
      r10: respostaParaFront(linha[17]),

      score: linha[18] || "0",
      comissao: linha[19] || "0",
      valorComissao: linha[20] || "0",

      // PINTURA
      r11: respostaParaFront(linha[21]),
      r12: respostaParaFront(linha[22]),
      r13: respostaParaFront(linha[23]),
      r14: respostaParaFront(linha[24]),

      scorePintura: linha[25] || "0",
      comissaoPintura: linha[26] || "0",
      valorComissaoPintura:
        linha[27] || "0",

      // MONTAGEM
      r15: respostaParaFront(linha[28]),
      r16: respostaParaFront(linha[29]),
      r17: respostaParaFront(linha[30]),
      r18: respostaParaFront(linha[31]),

      scoreMontagem: linha[32] || "0",
      comissaoMontagem: linha[33] || "0",
      valorComissaoMontagem:
        linha[34] || "0"

    }));
}
// ================= GARANTIR IDs =================
function garantirIdsMatriz(){

  const sheet = SpreadsheetApp
    .openById("1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78")
    .getSheetByName("Matriz");

  if(!sheet){
    return;
  }

  const ultimaLinha = sheet.getLastRow();

  if(ultimaLinha < 2){
    return;
  }

  const quantidadeLinhas = ultimaLinha - 1;

  const dados = sheet
    .getRange(
      2,
      1,
      quantidadeLinhas,
Math.min(35, sheet.getMaxColumns())
    )
    .getValues();

  const ids = [];
  let alterou = false;

  dados.forEach(linha => {

    let idAtual = String(linha[0] || "").trim();

    const possuiConteudo = linha
      .slice(1)
      .some(valor => {

        return String(
          valor === null || valor === undefined ? "" : valor
        ).trim() !== "";

      });

    if(!possuiConteudo){

      ids.push([""]);
      return;
    }

    if(!idAtual){

      idAtual = gerarIdPedido();
      alterou = true;
    }

    ids.push([idAtual]);
  });

  if(alterou){

    sheet
      .getRange(2, 1, ids.length, 1)
      .setValues(ids);
  }
}

// ================= ATUALIZAR PEDIDO =================
// ================= ATUALIZAR PEDIDO =================
function atualizarPedido(dados){

  if(!dados){
    throw new Error(
      "Nenhum dado foi recebido."
    );
  }

  if(!dados.id){
    throw new Error(
      "O pedido não possui ID."
    );
  }

  const sheet = SpreadsheetApp
    .openById(
      "1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78"
    )
    .getSheetByName("Matriz");

  if(!sheet){
    throw new Error(
      'A aba "Matriz" não foi encontrada.'
    );
  }

  garantirColunasMontagem(sheet);

  const ultimaLinha = sheet.getLastRow();

  if(ultimaLinha < 2){
    throw new Error(
      "Nenhum pedido foi encontrado."
    );
  }

  const ids = sheet
    .getRange(
      2,
      1,
      ultimaLinha - 1,
      1
    )
    .getDisplayValues();

  const idProcurado =
    String(dados.id).trim();

  let numeroLinha = -1;

  for(let i = 0; i < ids.length; i++){

    const idLinha =
      String(ids[i][0] || "").trim();

    if(idLinha === idProcurado){

      numeroLinha = i + 2;
      break;
    }
  }

  if(numeroLinha === -1){

    throw new Error(
      "Não foi possível encontrar o pedido selecionado."
    );
  }

  const valorLocacao =
    Number(dados.valorLocacao || 0);

  const valorMontagem =
    Number(dados.valorMontagem || 0);

  const valorFrete =
    Number(dados.valorFrete || 0);

  // ===== ESTOFADOS =====
  const comissao =
    buscarComissaoPorSetor("Forração");

  const valorComissao =
    calcularComissao(
      valorLocacao,
      dados.score,
      comissao
    );

  // ===== PINTURA =====
  const comissaoPintura =
    buscarComissaoPorSetor(
      "Acabamento e Pintura"
    );

  const valorComissaoPintura =
    calcularComissao(
      valorLocacao,
      dados.scorePintura,
      comissaoPintura
    );

  /*
   * Atualiza somente B até AB.
   * AC até AF, que vieram do cronograma,
   * são preservadas.
   */
  sheet
    .getRange(
      numeroLinha,
      2,
      1,
      27
    )
    .setValues([[
      converterDataParaPlanilha(
        dados.data
      ),

      dados.numero || "",
      dados.cliente || "",
      dados.local || "",

      valorLocacao,
      valorMontagem,
      valorFrete,

      respostaParaPlanilha(dados.r1),
      respostaParaPlanilha(dados.r2),
      respostaParaPlanilha(dados.r3),
      respostaParaPlanilha(dados.r4),

      respostaParaPlanilha(dados.r5),
      respostaParaPlanilha(dados.r6),
      respostaParaPlanilha(dados.r7),
      respostaParaPlanilha(dados.r8),

      respostaParaPlanilha(dados.r9),
      respostaParaPlanilha(dados.r10),

      Number(dados.score || 0),
      comissao,
      valorComissao,

      respostaParaPlanilha(dados.r11),
      respostaParaPlanilha(dados.r12),
      respostaParaPlanilha(dados.r13),
      respostaParaPlanilha(dados.r14),

      Number(
        dados.scorePintura || 0
      ),

      comissaoPintura,
      valorComissaoPintura
    ]]);

  sheet
    .getRange(numeroLinha, 2)
    .setNumberFormat("dd/MM/yyyy");

  sheet
    .getRange(
      numeroLinha,
      6,
      1,
      3
    )
    .setNumberFormat("R$ #,##0.00");

  sheet
    .getRange(numeroLinha, 21)
    .setNumberFormat("R$ #,##0.00");

  sheet
    .getRange(numeroLinha, 28)
    .setNumberFormat("R$ #,##0.00");

  /*
   * Depois de atualizar as perguntas gerais,
   * recalcula Montagem usando:
   *
   * r5 até r10 + r15 até r18.
   */
  atualizarCalculoMontagemDaLinha(
    sheet,
    numeroLinha
  );

  SpreadsheetApp.flush();

  return {
    sucesso: true,
    mensagem:
      "Pedido atualizado com sucesso."
  };
}
// ================= SENHA =================
function validarSenhaPlanilha(senhaDigitada){
  /* Senha removida (out/2026): quem protege agora é o login do Acervo (api/gs.js). */
  return true;


  const ss = SpreadsheetApp.openById("133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk");
  const aba = ss.getSheetByName("senhas");

  const dados = aba.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const setor = String(dados[i][0]).trim();
    const senha = String(dados[i][1]).trim();

    if(setor === "AL" && senha === senhaDigitada){
      return true;
    }
  }

  return false;
}

// ================= SALVAR LOTE =================
function salvarLotePedidos(lista){

  const sheet = SpreadsheetApp
    .openById("1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78")
    .getSheetByName("Matriz");

  lista.forEach(dados => {

    const setor = dados.setor || "Forração";
    const comissao = buscarComissaoPorSetor(setor);

    const valorComissao = calcularComissao(
      dados.valorLocacao,
      dados.score,
      comissao
    );

    sheet.appendRow([
      gerarIdPedido(),

      dados.data || "",
      dados.numero || "",
      dados.cliente || "",
      dados.local || "",

      dados.valorLocacao || "",
      dados.valorMontagem || "",
      dados.valorFrete || "",

      dados.r1 ? "Sim" : "Não",
      dados.r2 ? "Sim" : "Não",
      dados.r3 ? "Sim" : "Não",
      dados.r4 ? "Sim" : "Não",

      dados.r5 ? "Sim" : "Não",
      dados.r6 ? "Sim" : "Não",
      dados.r7 ? "Sim" : "Não",
      dados.r8 ? "Sim" : "Não",

      dados.r9 ? "Sim" : "Não",
      dados.r10 ? "Sim" : "Não",

dados.score || 0,

comissao,
valorComissao,

// PINTURA (RESPOSTAS)
dados.r11 ? "Sim" : "Não",
dados.r12 ? "Sim" : "Não",
dados.r13 ? "Sim" : "Não",
dados.r14 ? "Sim" : "Não",

dados.scorePintura || 0,

// 🔥 NOVO — DEPOIS DO SCORE PINTURA
buscarComissaoPorSetor("Acabamento e Pintura"),

calcularComissao(
  dados.valorLocacao,
  dados.scorePintura,
  buscarComissaoPorSetor("Acabamento e Pintura")
)
    ]);

  });
}

// ================= TESTE =================
function teste(){
  const dados = listarPedidos();
  Logger.log(dados);
}

function gerarIdPedido(){

  return "PED_" + Utilities.getUuid();
}

function corrigirComissoesExistentes(){

  const sheet = SpreadsheetApp
    .openById("1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78")
    .getSheetByName("Matriz");

  const dados = sheet.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const linha = dados[i];

    const valorLocacao = Number(linha[5] || 0);

    // ===== ESTOFADOS =====
    const score = Number(linha[18] || 0);
    const comissao = Number(linha[19] || 0);

    const scoreCalc = score > 1 ? score / 100 : score;

    const valorComissao = Number(
      (valorLocacao * scoreCalc * comissao).toFixed(2)
    );

    // 🔥 COLUNA U = 21
    sheet.getRange(i + 1, 21).setValue(valorComissao);


    // ===== PINTURA =====
    const scorePintura = Number(linha[25] || 0);
    const comissaoPintura = Number(linha[26] || 0);

    const scorePinturaCalc = scorePintura > 1 ? scorePintura / 100 : scorePintura;

    const valorComissaoPintura = Number(
      (valorLocacao * scorePinturaCalc * comissaoPintura).toFixed(2)
    );

    // 🔥 COLUNA AB = 28
    sheet.getRange(i + 1, 28).setValue(valorComissaoPintura);

  }

  // 🔥 FORMATAÇÃO FINAL
  sheet.getRange("U:U").setNumberFormat("R$ #,##0.00");
sheet
  .getRange("AB:AB")
  .setNumberFormat("R$ #,##0.00");

// Recalcula também Montagem
recalcularMontagemTodasLinhas();

}