const ID_PLANILHA = "1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE";
const ABA = "Itens Danificados";
function normalizar(txt){
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizarSetor(txt){
  const t = normalizar(txt)

  if (t.includes("limpeza")) return "limpeza de estofados";
  if (t.includes("costura")) return "costura";
  if (t.includes("forracao")) return "forracao";
  if (t.includes("acabamento")) return "acabamento e pintura";
  if (t.includes("solda")) return "solda";
  if (t.includes("marcenaria")) return "Marcenaria";

  return t;
}
function doGet(e) {

  const pagina = (e && e.parameter && e.parameter.p) || "central";

  if(pagina === "equipe"){
    return HtmlService
      .createHtmlOutputFromFile('Equipe')
      .setTitle("Meu Bônus")
      .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if(pagina === "painel"){
    return HtmlService
      .createHtmlOutputFromFile('itens_danificados')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService
    .createHtmlOutputFromFile('Central')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function getSheet(){

  const ss = SpreadsheetApp.openById(ID_PLANILHA);
  const sh = ss.getSheetByName(ABA);

  if(!sh){
    throw new Error("Aba não encontrada: " + ABA);
  }

  return sh;
}

// 🔹 BUSCAR DADOS
function buscarItensDanificados(){

  const sh = getSheet();
  const dados = sh.getDataRange().getValues();
  dados.shift();

  const resultado = dados.map(l => ({
    id: l[0],
    data: l[1],
    setor: l[2],
    nome: l[3],
    os: l[4],
    item: l[5],
    qtd: l[6],
    c7: l[7],
    c8: l[8],
    c9: l[9],
c10: l[10],
c11: l[11], // 🔥 CONCLUÍDO (COLUNA L)
onde: l[12],
pedido: l[13],
detalhes: l[14],
urgencia: l[15],
dataU: l[16],
codigo: l[17],
dataConclusao: l[19],
reposicaoTotal: l[20],
comissao: l[21],
total: l[22]
  }));

return JSON.parse(JSON.stringify(resultado));
}
// 🔹 SALVAR OS
function salvarOS(dados){

  dados = dados || {};

  // 🔥 VALIDAÇÃO COMPLETA NO SERVIDOR (vale mesmo se a página for burlada)
  const erroCampos = validarCamposNovaOS_(dados);
  if(erroCampos){
    return { ok:false, msg: erroCampos };
  }

  // 🔥 SENHA DO SETOR CONFERIDA AQUI (não só na página)
  const senha = validarSenha(dados.setor, dados.senha);
  if(!senha.ok){
    return senha;
  }

  const quantidade = Number(dados.quantidade);

  // 🔥 NOME PRECISA ESTAR NA LISTA DE FUNCIONÁRIOS
  const funcionarios = buscarFuncionariosOS();
  if(funcionarios && funcionarios.sucesso){
    const existe = funcionarios.funcionarios.some(function(f){
      return normalizar(f.nome) === normalizar(dados.nome);
    });
    if(!existe){
      return { ok:false, msg: "Funcionário não encontrado na lista. Atualize a página e escolha seu nome." };
    }
  }

  // 🔥 Uma O.S por vez: evita número repetido com dois envios juntos
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try{

  const sh = getSheet();

  const id = "OS_" + new Date().getTime();

  // 🔥 O.S SEQUENCIAL: maior número existente + 1
  const numeroOS = proximoNumeroOS_(sh);

  // 🔥 BUSCAR VALOR DE REPOSIÇÃO
  const shItens = SpreadsheetApp.openById(ID_ITENS).getSheetByName(ABA_ITENS);
  const dadosItens = shItens.getDataRange().getValues();
  dadosItens.shift();

// 🔥 COMPARA COMO TEXTO (código numérico na planilha também bate)
const codigoBuscado = String(dados.codigoItem || "").trim();
const itemEncontrado = dadosItens.find(l => String(l[2]).trim() === codigoBuscado);

// 🔥 BLOQUEIO TOTAL
if(!codigoBuscado){
  return { ok:false, msg: "Item sem código. Selecione um item válido da lista." };
}

if(!itemEncontrado){
  return { ok:false, msg: "Código não encontrado na base de itens." };
}

// 🔥 GRAVA O NOME OFICIAL DO ITEM (não o que foi digitado)
const nomeItemOficial = String(itemEncontrado[1] || dados.item).trim();

// 🔥 ENVIO EM DOBRO: mesma O.S nos últimos 2 minutos
if(osDuplicadaRecente_(sh, dados, codigoBuscado, quantidade)){
  return { ok:false, msg: "Esta O.S acabou de ser enviada. Confira na lista antes de enviar de novo." };
}

const valorReposicao = itemEncontrado[3];

if(!valorReposicao){
  return { ok:false, msg: "Item sem valor de reposição cadastrado. Avise o estoque." };
}

// 🔥 DATA LIMITE COMO DATA (não texto)
let dataLimite = "";
if(dados.saiSemana === "Sim"){
  const p = String(dados.dataLimite).split("-").map(Number);
  dataLimite = new Date(p[0], p[1] - 1, p[2]);
}

sh.appendRow([
  id,                          // A - ID
  new Date(),                  // B - Data

  textoSeguro_(dados.setor),   // C - Setor
  textoSeguro_(dados.nome),    // D - Nome
  numeroOS,                    // E - OS (automática)
  textoSeguro_(nomeItemOficial), // F - Item
  quantidade,                  // G - Quantidade

  dados.setorSolicitado,       // H - Fluxo 1 (validado)
  "",                          // I
  "",                          // J
  "",                          // K
  "",                          // L

  dados.ondeDano,              // M (validado)
  textoSeguro_(dados.ondeDano === "Evento" ? dados.numeroPedido : ""), // N
  textoSeguro_(dados.detalhes), // O
  dados.saiSemana === "Sim" ? "Sim" : "Não", // P
  dataLimite,                  // Q
  codigoBuscado,               // R
  valorReposicao,              // S - Valor de reposição unitário
  "",                          // T
  "",                          // U - Reposição total
  "",                          // V - Comissão
  ""                           // W - Valor comissão
]);

const linha = sh.getLastRow();

try{
  calcularFinanceiroLinha(linha);
}catch(e){
  Logger.log(
    "Erro financeiro linha " +
    linha +
    ": " +
    e.message
  );
}

SpreadsheetApp.flush();

return { ok: true, os: numeroOS };

  } finally {
    lock.releaseLock();
  }
}

// 🔹 LISTAS VÁLIDAS
const OS_SETORES_ORIGEM = ["Setor 01", "Setor 02", "Setor 03", "Estoque"];
const OS_SETORES_MANUTENCAO = ["Marcenaria", "Solda", "Acabamento e Pintura", "Costura", "Forração", "Limpeza de Estofados"];
const OS_ONDE_DANO = ["Dano Interno", "Evento", "Produção"];

// 🔹 CONFERE TODOS OS CAMPOS DA NOVA O.S (devolve a mensagem do primeiro problema)
function validarCamposNovaOS_(d){

  const texto = function(v){ return String(v === null || v === undefined ? "" : v).trim(); };

  if(!texto(d.nome)) return "Escolha seu nome.";
  if(OS_SETORES_ORIGEM.indexOf(texto(d.setor)) < 0) return "Escolha seu setor.";
  /* Senha do setor removida (out/2026): protege o login do Acervo. */
  if(!texto(d.item) || !texto(d.codigoItem)) return "Escolha um item válido da lista.";

  const qtd = Number(d.quantidade);
  if(!Number.isInteger(qtd) || qtd < 1 || qtd > 999) return "Quantidade precisa ser um número inteiro de 1 a 999.";

  if(OS_SETORES_MANUTENCAO.indexOf(texto(d.setorSolicitado)) < 0) return "Escolha o setor solicitado.";
  if(OS_ONDE_DANO.indexOf(texto(d.ondeDano)) < 0) return "Informe onde aconteceu o dano.";
  if(texto(d.ondeDano) === "Evento" && !texto(d.numeroPedido)) return "Informe o número do pedido.";
  if(texto(d.numeroPedido).length > 30) return "Número do pedido muito longo.";

  if(texto(d.saiSemana) === "Sim"){
    const data = texto(d.dataLimite);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "Informe a data limite.";
    const p = data.split("-").map(Number);
    const limite = new Date(p[0], p[1] - 1, p[2]);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    if(isNaN(limite.getTime()) || limite.getDate() !== p[2]) return "Data limite inválida.";
    if(limite < hoje) return "A data limite não pode ser no passado.";
    if(p[0] > hoje.getFullYear() + 2) return "Data limite muito distante. Confira o ano.";
  }

  if(texto(d.detalhes).length > 1000) return "Detalhes muito longos (máximo 1000 caracteres).";

  return "";
}

// 🔹 MESMA O.S (nome + código + qtd + setor) NOS ÚLTIMOS 2 MINUTOS
function osDuplicadaRecente_(sh, d, codigo, quantidade){

  const ultima = sh.getLastRow();
  if(ultima < 2) return false;

  const qtdLinhas = Math.min(30, ultima - 1);
  const linhas = sh.getRange(ultima - qtdLinhas + 1, 1, qtdLinhas, 18).getValues();
  const limite = Date.now() - 2 * 60 * 1000;

  return linhas.some(function(l){
    const data = l[1] instanceof Date ? l[1].getTime() : 0;
    return data >= limite &&
      normalizar(l[3]) === normalizar(d.nome) &&
      String(l[17]).trim() === codigo &&
      Number(l[6]) === quantidade &&
      String(l[7]).trim() === String(d.setorSolicitado).trim();
  });
}

// 🔹 TEXTO QUE NÃO VIRA FÓRMULA NA PLANILHA (=, +, -, @ no começo)
function textoSeguro_(valor){
  const texto = String(valor === null || valor === undefined ? "" : valor).trim();
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

// 🔹 PRÓXIMO NÚMERO DE O.S (coluna E)
function proximoNumeroOS_(sh){

  const ultimaLinha = sh.getLastRow();

  if(ultimaLinha < 2){
    return 1000;
  }

  const maior = sh
    .getRange(2, 5, ultimaLinha - 1, 1)
    .getValues()
    .reduce(function(max, linha){
      const numero = Number(linha[0]);
      return isFinite(numero) && numero > max ? numero : max;
    }, 999);

  return Math.floor(maior) + 1;
}

// 🔹 SENHA DO ESTOQUE (concluir, remover e encaminhar O.S)
function conferirSenhaEstoque_(senha){
  /* Senha removida (out/2026): quem protege agora é o login do Acervo (api/gs.js). */
  return;


  const res = validarSenha("estoque", senha);

  if(!res.ok){
    throw new Error(res.msg === "Senha incorreta" ? "Senha do estoque incorreta." : res.msg);
  }

}

// 🔹 BUSCAR ITENS POR CATEGORIA
function getItensPorCategoria(categoria){

  const sh = SpreadsheetApp.openById(ID_ITENS).getSheetByName(ABA_ITENS);
  const dados = sh.getDataRange().getValues();
  dados.shift();

  return dados
    .filter(l => l[0] == categoria)
    .map(l => ({
      nome: l[1],
      codigo: l[2]
    }));
}
const ID_ITENS = "133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk";
const ABA_ITENS = "Itens";

// 🔹 BUSCAR TODAS CATEGORIAS
function getCategorias(){

  const sh = SpreadsheetApp.openById(ID_ITENS).getSheetByName(ABA_ITENS);
  const dados = sh.getDataRange().getValues();
  dados.shift();

  const categorias = [...new Set(dados.map(l => l[0]))];

  return categorias.sort();
}
function validarSenha(setorSelecionado, senhaDigitada){
  /* Senha removida (out/2026): quem protege agora é o login do Acervo (api/gs.js). */
  return {ok:true};


  if(!setorSelecionado || !senhaDigitada){
    return {ok:false, msg:"Setor e senha são obrigatórios"};
  }

  const sh = SpreadsheetApp.openById(ID_ITENS).getSheetByName("Senhas"); // 🔥 AJUSTA NOME AQUI
  const dados = sh.getDataRange().getValues();
  dados.shift();

  // 🔥 NORMALIZAÇÃO INTELIGENTE
  let setor = String(setorSelecionado).trim();

  // converte "Setor 01" → "1"
  setor = setor.replace("Setor", "").trim();

  // remove zero à esquerda (01 → 1)
  if(!isNaN(setor)){
    setor = String(parseInt(setor));
  }

  // 🔥 BUSCA FLEXÍVEL (aceita número OU texto tipo AL, RH)
  const linha = dados.find(l => 
    String(l[0]).trim().toLowerCase() === setor.toLowerCase()
  );

  if(!linha){
    return {ok:false, msg:"Setor não encontrado: " + setorSelecionado};
  }

  // 🔥 BLOQUEIO POR TENTATIVAS: 8 erros seguidos = 10 minutos sem tentar
  const cache = CacheService.getScriptCache();
  const chaveTentativas = "senhaSetorTentativas:" + setor.toLowerCase();
  const tentativas = Number(cache.get(chaveTentativas) || 0);

  if(tentativas >= 8){
    return {ok:false, msg:"Muitas tentativas erradas. Aguarde 10 minutos."};
  }

  const senhaCorreta = String(linha[1]).trim();

  if(!senhaCorreta || senhaCorreta !== String(senhaDigitada).trim()){
    cache.put(chaveTentativas, String(tentativas + 1), 600);
    Utilities.sleep(500);
    return {ok:false, msg:"Senha incorreta"};
  }

  cache.remove(chaveTentativas);

  return {ok:true};
}

function testeBuscarItensDanificados(){

  const sh = SpreadsheetApp.openById("1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE")
    .getSheetByName("Itens Danificados");

  const dados = sh.getDataRange().getValues();

  Logger.log("TOTAL LINHAS: " + dados.length);

  dados.forEach((linha, i) => {
    Logger.log("LINHA " + i + ": " + JSON.stringify(linha));
  });

}

function atualizarDataUrgencia(id, novaData){

  if(!id || !novaData){
    return {ok:false, msg:"ID e data são obrigatórios"};
  }

  const partes = String(novaData).split("-");
  if(partes.length !== 3){
    return {ok:false, msg:"Data inválida"};
  }

  const ano = Number(partes[0]);
  const mes = Number(partes[1]) - 1;
  const dia = Number(partes[2]);

  const dataCorreta = new Date(ano, mes, dia);

  if(
    isNaN(dataCorreta.getTime()) ||
    dataCorreta.getDate() !== dia ||
    ano < 2020 ||
    ano > new Date().getFullYear() + 2
  ){
    return {ok:false, msg:"Data inválida. Confira o dia e o ano."};
  }

  const sh = getSheet();
  const dados = sh.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    if(String(dados[i][0]) === String(id)){
      sh.getRange(i + 1, 17).setValue(dataCorreta);
      SpreadsheetApp.flush();
      return {ok:true};
    }

  }

  return {ok:false, msg:"ID não encontrado"};

}

function darBaixaOS(lista, senha){

  conferirSenhaEstoque_(senha);

  if(!Array.isArray(lista) || lista.length === 0){
    throw new Error("Nenhuma O.S foi enviada para baixa.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try{
    return darBaixaOSComLock_(lista);
  } finally {
    lock.releaseLock();
  }

}

function darBaixaOSComLock_(lista){

  const sh = getSheet();
  const dados = sh.getDataRange().getValues();

  const ss = SpreadsheetApp.openById(ID_PLANILHA);
  let shReprovadas = ss.getSheetByName("O.S Reprovadas");

  if(!shReprovadas){
    shReprovadas = ss.insertSheet("O.S Reprovadas");
  }

  let alterou = false;

  lista.forEach(item => {

    const idAlvo = String(item.id || "").trim();
    const qualidade = String(item.qualidade || "").trim();

    if(!idAlvo || !qualidade) return;

    for(let i = 1; i < dados.length; i++){

      const id = String(dados[i][0] || "").trim();
      if(id !== idAlvo) continue;

      const statusAtual = String(dados[i][11] || "").trim();
      if(statusAtual.toLowerCase() === "concluído" || statusAtual.toLowerCase() === "concluido"){
        break;
      }

      const agora = new Date();
      const numeroOS = dados[i][4] || "";
      const nomeItem = dados[i][5] || "";
      const quantidade = dados[i][6] || "";
      const fluxo = [dados[i][7], dados[i][8], dados[i][9], dados[i][10]]
        .map(v => String(v || "").trim())
        .filter(v => v !== "");

      const setorResponsavel = fluxo.length ? fluxo[fluxo.length - 1] : "";
      const origem = dados[i][12] || "";
      const responsavelBaixa = "Estoque";

      if(qualidade === "Aprovado"){

        sh.getRange(i + 1, 12).setValue("Concluído");
        sh.getRange(i + 1, 20).setValue(agora);
        alterou = true;

      } else if(qualidade === "Reprovado"){

        shReprovadas.appendRow([
          agora,
          numeroOS,
          nomeItem,
          quantidade,
          setorResponsavel,
          responsavelBaixa,
          "",
          origem,
          "Reprovado"
        ]);

        alterou = true;
      }

      break;
    }

  });

  SpreadsheetApp.flush();

  if(!alterou){
    return {ok:false, msg:"Nenhuma O.S foi alterada."};
  }

  return {ok:true};
}
function encaminharOS(id, setor, dataU, senha){

  conferirSenhaEstoque_(senha);

  if(!id || OS_SETORES_MANUTENCAO.indexOf(String(setor || "").trim()) < 0){
    throw new Error("Escolha um setor válido.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try{
    return encaminharOSComLock_(id, setor, dataU);
  } finally {
    lock.releaseLock();
  }

}

function encaminharOSComLock_(id, setor, dataU){

  const sh = getSheet();
  const dados = sh.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    if(String(dados[i][0]) === String(id)){

      // 🔥 colunas H até K no array: índices 7 até 10
      for(let col = 7; col <= 10; col++){

        if(!dados[i][col]){

          sh.getRange(i + 1, col + 1).setValue(setor);

          // 🔥 atualiza a data de urgência, se informada
          if(dataU){
            const partes = String(dataU).split("-");
            const novaData = new Date(
              Number(partes[0]),
              Number(partes[1]) - 1,
              Number(partes[2])
            );
            sh.getRange(i + 1, 17).setValue(novaData); // coluna Q
          }

          SpreadsheetApp.flush();
          return { ok:true };
        }

      }

      throw new Error("Fluxo já completo");
    }

  }

  throw new Error("ID não encontrado");

}

// 🔹 ENCAMINHAR VÁRIAS O.S DE UMA VEZ (mesmo setor e mesma data)
function encaminharVariasOS(ids, setor, dataU, senha){

  conferirSenhaEstoque_(senha);

  if(!Array.isArray(ids) || ids.length === 0){
    throw new Error("Nenhuma O.S selecionada.");
  }

  if(OS_SETORES_MANUTENCAO.indexOf(String(setor || "").trim()) < 0){
    throw new Error("Setor inválido. Escolha um setor da lista.");
  }

  let novaData = null;

  if(dataU){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dataU))){
      throw new Error("Data de urgência inválida.");
    }
    const partes = String(dataU).split("-");
    novaData = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
    if(isNaN(novaData.getTime()) || novaData.getFullYear() < 2020 || novaData.getFullYear() > new Date().getFullYear() + 2){
      throw new Error("Data de urgência inválida.");
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try{

    const sh = getSheet();
    const ultimaLinha = sh.getLastRow();

    /* Lê só A até K (ID … fluxo) uma única vez */
    const dados = ultimaLinha >= 2
      ? sh.getRange(2, 1, ultimaLinha - 1, 12).getValues()
      : [];

    const linhaPorId = {};
    dados.forEach(function(l, i){ linhaPorId[String(l[0]).trim()] = i; });

    const encaminhadas = [];
    const ignoradas = [];

    ids.forEach(function(id){

      const i = linhaPorId[String(id || "").trim()];

      if(i === undefined){
        ignoradas.push({ id: id, os: "", motivo: "não encontrada" });
        return;
      }

      const l = dados[i];
      const numeroOS = l[4];

      if(normalizar(l[11]).indexOf("concluido") >= 0){
        ignoradas.push({ id: id, os: numeroOS, motivo: "já concluída" });
        return;
      }

      const fluxoAtual = [l[7], l[8], l[9], l[10]].map(function(v){ return String(v || "").trim(); }).filter(Boolean);
      if(fluxoAtual.length && fluxoAtual[fluxoAtual.length - 1] === String(setor).trim()){
        ignoradas.push({ id: id, os: numeroOS, motivo: "já está neste setor" });
        return;
      }

      // colunas H até K no array: índices 7 até 10
      let coluna = -1;
      for(let col = 7; col <= 10; col++){
        if(!l[col]){ coluna = col; break; }
      }

      if(coluna < 0){
        ignoradas.push({ id: id, os: numeroOS, motivo: "já passou por 4 setores" });
        return;
      }

      sh.getRange(i + 2, coluna + 1).setValue(setor);

      if(novaData){
        sh.getRange(i + 2, 17).setValue(novaData); // coluna Q
      }

      encaminhadas.push(numeroOS);

    });

    SpreadsheetApp.flush();

    return {
      ok: true,
      encaminhadas: encaminhadas,
      ignoradas: ignoradas
    };

  } finally {
    lock.releaseLock();
  }

}
function gerarIdsOS(){

  const sh = getSheet();
  const dados = sh.getDataRange().getValues();

  let contadorOS = 1;

  // 🔥 primeiro pega o maior número de OS existente
  dados.forEach(linha => {
    const os = Number(linha[4]); // coluna E
    if(os && os > contadorOS){
      contadorOS = os;
    }
  });

  contadorOS++; // começa do próximo

  for(let i = 1; i < dados.length; i++){

    const idAtual = dados[i][0]; // coluna A
    const osAtual = dados[i][4]; // coluna E
    const data = dados[i][1]; // coluna B

    // 🔥 GERAR ID
    if(!idAtual){

      let dataFormatada = "";

      if(data instanceof Date){

        const ano = data.getFullYear();
        const mes = String(data.getMonth()+1).padStart(2,"0");
        const dia = String(data.getDate()).padStart(2,"0");

        dataFormatada = `${ano}${mes}${dia}`;

      } else {
        dataFormatada = "00000000";
      }

      const numero = String(i).padStart(4,"0");
      const novoId = `OS_${dataFormatada}_${numero}`;

      sh.getRange(i+1, 1).setValue(novoId);

    }

    // 🔥 GERAR O.S (se estiver vazio)
    if(!osAtual){

      sh.getRange(i+1, 5).setValue(contadorOS);
      contadorOS++;

    }

  }

}
/************************************************************
 * AVALIAÇÃO INDIVIDUAL DE RH
 *
 * Colunas esperadas na aba OcorrenciasRH:
 * B = Data
 * D = Nome
 * E = Sobrenome
 * F = Setor
 * G = Tipo da ocorrência
 ************************************************************/
function getAvaliacaoIndividualRH(mesFiltro){

  const ID_PLANILHA_RH =
    "1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo";

  const ABA_OCORRENCIAS =
    "OcorrenciasRH";

  const ABA_METAS_RH =
    "Metas";

  const ssRH =
    SpreadsheetApp.openById(
      ID_PLANILHA_RH
    );

  const shOcorrencias =
    ssRH.getSheetByName(
      ABA_OCORRENCIAS
    );

const shMetas =
  ssRH.getSheetByName(
    ABA_METAS_RH
  );

const shFuncionarios =
  ssRH.getSheetByName(
    "Funcionarios"
  );

if(!shFuncionarios){

  throw new Error(
    'A aba "Funcionários" não foi encontrada na planilha Controle RH.'
  );

}

  if(!shOcorrencias){

    throw new Error(
      'A aba "OcorrenciasRH" não foi encontrada.'
    );

  }

  function normalizarTextoRH(valor){

    return String(valor || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  }
function normalizarSetorRH(valor){

  const setor =
    normalizarTextoRH(valor);

  if(setor.includes("marcenaria")){
    return "marcenaria";
  }

  if(
    setor.includes("acabamento") ||
    setor.includes("pintura")
  ){
    return "acabamento e pintura";
  }

  if(setor.includes("solda")){
    return "solda";
  }

  if(setor.includes("costura")){
    return "costura";
  }

  if(setor.includes("forracao")){
    return "forracao";
  }

  if(
    setor.includes("limpeza") &&
    setor.includes("estof")
  ){
    return "limpeza de estofados";
  }

  return setor;

}
  function parseDataOcorrenciaRH(valor){

    if(!valor){
      return null;
    }

if(
  Object.prototype.toString.call(valor) ===
  "[object Date]"
){

      return isNaN(valor.getTime())
        ? null
        : valor;

    }

    let texto =
      String(valor).trim();

    if(!texto){
      return null;
    }

    /*
      Formato ISO:
      2026-07-21
      2026-07-21T10:30:00
    */
    if(/^\d{4}-\d{2}-\d{2}/.test(texto)){

      const partes =
        texto
          .slice(0, 10)
          .split("-");

      return new Date(
        Number(partes[0]),
        Number(partes[1]) - 1,
        Number(partes[2])
      );

    }

    /*
      Formato brasileiro:
      21/07/2026
      21/07/2026 10:30:00
    */
    texto =
      texto.split(" ")[0];

    const partesBR =
      texto.split("/");

    if(partesBR.length === 3){

      const dataBR =
        new Date(
          Number(partesBR[2]),
          Number(partesBR[1]) - 1,
          Number(partesBR[0])
        );

      return isNaN(dataBR.getTime())
        ? null
        : dataBR;

    }

    const data =
      new Date(texto);

    return isNaN(data.getTime())
      ? null
      : data;

  }

  function identificarTipoRH(valor){

    const tipo =
      normalizarTextoRH(valor);

    if(tipo.includes("atraso")){
      return "atraso";
    }

    if(tipo.includes("uniforme")){
      return "semUniforme";
    }

    if(tipo.includes("epi")){
      return "semEpi";
    }

    if(tipo.includes("celular")){
      return "usoCelular";
    }

    if(tipo.includes("falta")){
      return "falta";
    }

    if(tipo.includes("advertencia")){
      return "advertencia";
    }

    if(
      tipo.includes("ausencia") ||
      tipo.includes("jornada")
    ){
      return "ausenciaJornada";
    }

    return "";

  }

  const mesSeguro =
    mesFiltro ||
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );

  const partesMes =
    String(mesSeguro).split("-");

  const anoBuscado =
    Number(partesMes[0]);

  const mesBuscado =
    Number(partesMes[1]) - 1;

  if(
    !anoBuscado ||
    mesBuscado < 0 ||
    mesBuscado > 11
  ){

    throw new Error(
      "Mês inválido: " + mesSeguro
    );

  }

  /*
    Metas da planilha de RH:

    A = Atraso
    B = Sem Uniforme
    C = Sem EPI
    D = Uso de Celular
    E = Falta
    F = Advertência
    G = Ausência de Jornada
  */
  const metas = {

    atraso:0,
    semUniforme:0,
    semEpi:0,
    usoCelular:0,
    falta:0,
    advertencia:0,
    ausenciaJornada:0

  };

  if(
    shMetas &&
    shMetas.getLastRow() >= 2
  ){

    const linhaMetas =
      shMetas
        .getRange(2, 1, 1, 7)
        .getValues()[0];

    metas.atraso =
      Number(linhaMetas[0] || 0);

    metas.semUniforme =
      Number(linhaMetas[1] || 0);

    metas.semEpi =
      Number(linhaMetas[2] || 0);

    metas.usoCelular =
      Number(linhaMetas[3] || 0);

    metas.falta =
      Number(linhaMetas[4] || 0);

    metas.advertencia =
      Number(linhaMetas[5] || 0);

    metas.ausenciaJornada =
      Number(linhaMetas[6] || 0);

  }

  /*
    Traz todos os funcionários cadastrados,
    inclusive quem não teve ocorrência no mês.
  */
const setoresPermitidosRH = [
  "marcenaria",
  "acabamento e pintura",
  "solda",
  "costura",
  "forracao",
  "limpeza de estofados"
];

/*
  A relação oficial de funcionários vem da aba
  "Funcionários" da planilha Controle RH.

  A leitura é feita pelos títulos das colunas,
  portanto funciona mesmo que Nome, Sobrenome
  e Setor não estejam em A, B e C.
*/
const dadosFuncionariosRH =
  shFuncionarios
    .getDataRange()
    .getValues();

const mapaFuncionarios = {};

if(dadosFuncionariosRH.length > 1){

  const cabecalhosFuncionarios =
    dadosFuncionariosRH[0].map(
      function(valor){

        return normalizarTextoRH(valor);

      }
    );

  function localizarColunaFuncionario(
    nomesPossiveis
  ){

    for(
      let i = 0;
      i < nomesPossiveis.length;
      i++
    ){

      const nomeBuscado =
        normalizarTextoRH(
          nomesPossiveis[i]
        );

      const indice =
        cabecalhosFuncionarios.findIndex(
          function(cabecalho){

            return (
              cabecalho === nomeBuscado ||
              cabecalho.includes(nomeBuscado)
            );

          }
        );

      if(indice >= 0){
        return indice;
      }

    }

    return -1;

  }

  const colNome =
    localizarColunaFuncionario([
      "nome",
      "primeiro nome"
    ]);

  const colSobrenome =
    localizarColunaFuncionario([
      "sobrenome"
    ]);

  const colSetor =
    localizarColunaFuncionario([
      "setor",
      "departamento"
    ]);

  if(colNome < 0 || colSetor < 0){

    throw new Error(
      'A aba "Funcionários" precisa ter as colunas Nome e Setor.'
    );

  }

  for(
    let i = 1;
    i < dadosFuncionariosRH.length;
    i++
  ){

    const linhaFuncionario =
      dadosFuncionariosRH[i];

    const primeiroNome =
      String(
        linhaFuncionario[colNome] || ""
      ).trim();

    const sobrenome =
      colSobrenome >= 0
        ? String(
            linhaFuncionario[colSobrenome] || ""
          ).trim()
        : "";

    const nome =
      (
        primeiroNome +
        " " +
        sobrenome
      )
        .replace(/\s+/g, " ")
        .trim();

    const setorOriginal =
      String(
        linhaFuncionario[colSetor] || ""
      ).trim();

    const setorNormalizado =
      normalizarSetorRH(
        setorOriginal
      );

    if(
      !nome ||
      !setoresPermitidosRH.includes(
        setorNormalizado
      )
    ){
      continue;
    }

    const nomesSetoresRH = {

      "marcenaria":
        "Marcenaria",

      "acabamento e pintura":
        "Acabamento e Pintura",

      "solda":
        "Solda",

      "costura":
        "Costura",

      "forracao":
        "Forração",

      "limpeza de estofados":
        "Limpeza de Estofados"

    };

    const setor =
      nomesSetoresRH[setorNormalizado] ||
      setorOriginal;

    const chave =
      normalizarTextoRH(nome);

    mapaFuncionarios[chave] = {

      nome:nome,
      setor:setor,

      atraso:0,
      semUniforme:0,
      semEpi:0,
      usoCelular:0,
      falta:0,
      advertencia:0,
      ausenciaJornada:0

    };

  }

}

  const dadosOcorrencias =
    shOcorrencias
      .getDataRange()
      .getValues();

  for(
    let i = 1;
    i < dadosOcorrencias.length;
    i++
  ){

    const linha =
      dadosOcorrencias[i];

    const dataOcorrencia =
      parseDataOcorrenciaRH(
        linha[1]
      );

    if(!dataOcorrencia){
      continue;
    }

    if(
      dataOcorrencia.getMonth() !==
        mesBuscado ||

      dataOcorrencia.getFullYear() !==
        anoBuscado
    ){
      continue;
    }

/*
  Estrutura atual da aba OcorrenciasRH:

  B = Data
  D = Nome
  E = Sobrenome
  F = Setor
  G = Tipo da ocorrência
*/
const primeiroNome =
  String(
    linha[3] || ""
  ).trim();

const sobrenome =
  String(
    linha[4] || ""
  ).trim();

const nome =
  (
    primeiroNome +
    " " +
    sobrenome
  )
    .replace(/\s+/g, " ")
    .trim();

const setor =
  String(
    linha[5] || ""
  ).trim();

const setorNormalizado =
  normalizarSetorRH(setor);

const tipo =
  identificarTipoRH(
    linha[6]
  );

if(
  !nome ||
  !tipo ||
  !setoresPermitidosRH.includes(
    setorNormalizado
  )
){
  continue;
}

    const chave =
      normalizarTextoRH(nome);

    /*
      Inclui também alguém que tenha ocorrência,
      mesmo que ainda não esteja na lista principal
      de funcionários.
    */
    if(!mapaFuncionarios[chave]){

      mapaFuncionarios[chave] = {

        nome:nome,
        setor:setor,

        atraso:0,
        semUniforme:0,
        semEpi:0,
        usoCelular:0,
        falta:0,
        advertencia:0,
        ausenciaJornada:0

      };

    }

    if(
      !mapaFuncionarios[chave].setor &&
      setor
    ){

      mapaFuncionarios[chave].setor =
        setor;

    }

    mapaFuncionarios[chave][tipo]++;

  }

  return Object.values(
    mapaFuncionarios
  )
    .map(function(funcionario){

      const ultrapassouMeta =

        funcionario.atraso >
          metas.atraso ||

        funcionario.semUniforme >
          metas.semUniforme ||

        funcionario.semEpi >
          metas.semEpi ||

        funcionario.usoCelular >
          metas.usoCelular ||

        funcionario.falta >
          metas.falta ||

        funcionario.advertencia >
          metas.advertencia ||

        funcionario.ausenciaJornada >
          metas.ausenciaJornada;

      const possuiOcorrencia =

        funcionario.atraso > 0 ||

        funcionario.semUniforme > 0 ||

        funcionario.semEpi > 0 ||

        funcionario.usoCelular > 0 ||

        funcionario.falta > 0 ||

        funcionario.advertencia > 0 ||

        funcionario.ausenciaJornada > 0;

      let status =
        "OK";

      if(ultrapassouMeta){

        status =
          "Meta não atingida";

      } else if(possuiOcorrencia){

        status =
          "Atenção";

      }

      return {

        nome:
          funcionario.nome,

        setor:
          funcionario.setor,

        atraso:
          funcionario.atraso,

        semUniforme:
          funcionario.semUniforme,

        semEpi:
          funcionario.semEpi,

        usoCelular:
          funcionario.usoCelular,

        falta:
          funcionario.falta,

        advertencia:
          funcionario.advertencia,

        ausenciaJornada:
          funcionario.ausenciaJornada,

        metaAtraso:
          metas.atraso,

        metaSemUniforme:
          metas.semUniforme,

        metaSemEpi:
          metas.semEpi,

        metaUsoCelular:
          metas.usoCelular,

        metaFalta:
          metas.falta,

        metaAdvertencia:
          metas.advertencia,

        metaAusenciaJornada:
          metas.ausenciaJornada,

        status:
          status,

        apto:
          !ultrapassouMeta

      };

    })
    .sort(function(a, b){

      const comparacaoSetor =
        String(a.setor || "")
          .localeCompare(
            String(b.setor || ""),
            "pt-BR"
          );

      if(comparacaoSetor !== 0){
        return comparacaoSetor;
      }

      return String(a.nome || "")
        .localeCompare(
          String(b.nome || ""),
          "pt-BR"
        );

    });

}
function getTetoGastosMensal(mesFiltro) {

  const ID = "1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI";
  const ABA = "Metas e Gastos";

  const ss = SpreadsheetApp.openById(ID);
  const sh = ss.getSheetByName(ABA);

  const dados = sh.getDataRange().getValues();
  if (dados.length < 2) return [];

let mesAtualNumero;

if(mesFiltro){
  const partes = mesFiltro.split("-");
  mesAtualNumero = Number(partes[1]) - 1;
}else{
  const hoje = new Date();
  mesAtualNumero = hoje.getMonth();
}

  // 🔥 MAPA DOS MESES (IMPORTANTE)
  const colunasMes = [
    { mes: "janeiro", colTeto: 1, colGasto: 2 },
    { mes: "fevereiro", colTeto: 3, colGasto: 4 },
    { mes: "marco", colTeto: 5, colGasto: 6 },
    { mes: "abril", colTeto: 7, colGasto: 8 },
    { mes: "maio", colTeto: 9, colGasto: 10 },
    { mes: "junho", colTeto: 11, colGasto: 12 },
    { mes: "julho", colTeto: 13, colGasto: 14 },
    { mes: "agosto", colTeto: 15, colGasto: 16 },
    { mes: "setembro", colTeto: 17, colGasto: 18 },
    { mes: "outubro", colTeto: 19, colGasto: 20 },
    { mes: "novembro", colTeto: 21, colGasto: 22 },
    { mes: "dezembro", colTeto: 23, colGasto: 24 }
  ];

  const config = colunasMes[mesAtualNumero];

  const resultado = [];

  for (let i = 1; i < dados.length; i++) {

    const l = dados[i];

    const setor = String(l[0] || "").trim();

function parseBR(valor){

  if (valor === null || valor === undefined || valor === "") return 0;

  if (typeof valor === "number") return valor;

  let v = String(valor).trim();

  v = v.replace(/[^\d,.-]/g, ""); // remove tudo que não for número
  v = v.replace(/\.(?=\d{3})/g, ""); // remove milhar
  v = v.replace(",", "."); // decimal

  return Number(v) || 0;
}

const teto = parseBR(l[config.colTeto]);
const gasto = parseBR(l[config.colGasto]);
let percentual = teto > 0 ? (gasto / teto) * 100 : 0;

// 🔥 garante que não passa de 100% (visual correto)
percentual = Math.min(percentual, 100);

    resultado.push({
      setor,
      teto,
      gasto,
      percentual: Number(percentual.toFixed(1))
    });

  }

  return resultado;
}
function getMetasSetoresMensal(mesFiltro) {

  const dados = buscarItensDanificados();
  const metas = getMetasPorSetor();

let mesAtual;
let anoAtual;

if(mesFiltro){
  const partes = mesFiltro.split("-");
  anoAtual = Number(partes[0]);
  mesAtual = Number(partes[1]) - 1;
}else{
  const hoje = new Date();
  mesAtual = hoje.getMonth();
  anoAtual = hoje.getFullYear();
}

  const setores = {};

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
if (t.includes("marcenaria")) return "Marcenaria";

    return t;
  }

function parseDataBR(valor){

  if (!valor) return null;

  if (Object.prototype.toString.call(valor) === "[object Date]") {
    return isNaN(valor.getTime()) ? null : valor;
  }

  let txt = String(valor).trim();
  if (!txt) return null;

  // 1) ISO / padrão reconhecido pelo JS
  // exemplos:
  // 2026-04-12
  // 2026-04-12T00:00:00.000Z
  // 2026-04-12 00:00:00
  if (/^\d{4}-\d{2}-\d{2}/.test(txt)) {
    const dataIso = new Date(txt);
    return isNaN(dataIso.getTime()) ? null : dataIso;
  }

  // 2) Formato BR com ou sem hora
  // exemplo: 12/04/2026 ou 12/04/2026 17:15:38
  if (txt.includes(" ")) {
    txt = txt.split(" ")[0];
  }

  const partes = txt.split("/");
  if (partes.length === 3) {
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1;
    const ano = parseInt(partes[2], 10);

    const dataBr = new Date(ano, mes, dia);
    return isNaN(dataBr.getTime()) ? null : dataBr;
  }

  // 3) Último fallback
  const data = new Date(txt);
  return isNaN(data.getTime()) ? null : data;
}

  function statusConcluido(valor){
    if (!valor) return false;

    const status = String(valor)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .trim();

    return status.includes("concluido");
  }

  // 🔥 PROCESSAMENTO REAL
  dados.forEach(l => {

// 🔥 FILTRO CORRETO (MÊS ATUAL + CONCLUÍDO)

if(!l.dataConclusao) return;

const data = parseDataBR(l.dataConclusao);
if(!data) return;

if(data.getMonth() !== mesAtual || data.getFullYear() !== anoAtual) return;

if(!statusConcluido(l.c11)) return;

    const fluxo = [l.c7, l.c8, l.c9, l.c10]
      .map(x => String(x || "").trim())
      .filter(x => x !== "");

    const fluxoUnico = [...new Set(fluxo)];

    fluxoUnico.forEach(setor => {

      const nome = normalizarSetor(setor);

      if (!setores[nome]) {
        setores[nome] = {
          nome,
          concluidas: 0
        };
      }

const quantidade = Number(l.qtd) || 1;
setores[nome].concluidas += quantidade;

    });

  });

  // 🔥 CALCULA PRODUÇÃO
// 🔥 CALCULO TEMPO MÉDIO
const tempoPorSetor = {};

dados.forEach(l => {

if(!l.dataConclusao || !l.data) return;

const dataConclusao = parseDataBR(l.dataConclusao);
const dataEntrada = parseDataBR(l.data);

if(!dataConclusao || !dataEntrada) return;

  // 🔥 FILTRO: MES ATUAL
  if(dataConclusao.getMonth() !== mesAtual || dataConclusao.getFullYear() !== anoAtual) return;

  if(!statusConcluido(l.c11)) return;

  // 🔥 REGRA: APENAS UM SETOR (H preenchido, I/J/K vazios)
  const h = String(l.c7 || "").trim();
  const i = String(l.c8 || "").trim();
  const j = String(l.c9 || "").trim();
  const k = String(l.c10 || "").trim();

  if(!h) return;
  if(i || j || k) return;

  const setor = normalizarSetor(h);

  const tempo = (dataConclusao - dataEntrada) / (1000 * 60 * 60 * 24); // dias

  if(!tempoPorSetor[setor]){
    tempoPorSetor[setor] = {
      totalTempo: 0,
      qtd: 0
    };
  }

  tempoPorSetor[setor].totalTempo += tempo;
  tempoPorSetor[setor].qtd += 1;

});

// 🔥 RESULTADO FINAL
const todosSetores = [
  "Marcenaria",
  "acabamento e pintura",
  "solda",
  "costura",
  "forracao",
  "limpeza de estofados"
];

// 🔥 LEITURAS FEITAS UMA VEZ SÓ (antes eram repetidas para cada setor)

// O.S reprovadas no mês
const mapaOSReprovadas = {};

const ssMetas = SpreadsheetApp.openById(ID_PLANILHA);
const shRep = ssMetas.getSheetByName("O.S Reprovadas");

if(shRep){

  const dadosRep = shRep.getDataRange().getValues();

  for(let i = 1; i < dadosRep.length; i++){

    const dataRep = parseDataBR(dadosRep[i][0]);
    if(!dataRep) continue;

    if(dataRep.getMonth() !== mesAtual || dataRep.getFullYear() !== anoAtual) continue;

    const os = String(dadosRep[i][1] || "").trim();

    if(os){
      mapaOSReprovadas[os] = true; // 🔥 só marca existência
    }

  }

}

// Aba Metas (tempo, qualidade e prazo)
const dadosMetas = ssMetas.getSheetByName("Metas").getDataRange().getValues();

const resultado = todosSetores.map(nomeSetor => {

  const s = setores[nomeSetor] || { nome: nomeSetor, concluidas: 0 };

  const producao = calcularProducao(s, metas);

  // 🔥 TEMPO MÉDIO EM DIAS
  let tempoDias = 0;

  if(tempoPorSetor[s.nome]){
    const media = tempoPorSetor[s.nome].totalTempo / tempoPorSetor[s.nome].qtd;
    tempoDias = Number(media.toFixed(1));
  }

  // 🔥 CALCULO PRAZO
  let prazoPerc = 100; // 🔥 se não houver nenhuma O.S com prazo, fica 100%

  let total = 0;
  let noPrazo = 0;

  dados.forEach(l => {

    if(!l.dataConclusao || !l.dataU) return;

    const dataConclusao = parseDataBR(l.dataConclusao);
    const dataLimite = parseDataBR(l.dataU);

    if(!dataConclusao || !dataLimite) return;

    // 🔥 FILTRO MÊS ATUAL
    if(dataConclusao.getMonth() !== mesAtual || dataConclusao.getFullYear() !== anoAtual) return;

    if(!statusConcluido(l.c11)) return;

    // 🔥 PEGA O ÚLTIMO SETOR DO FLUXO
    const fluxo = [l.c7, l.c8, l.c9, l.c10]
      .map(x => String(x || "").trim())
      .filter(x => x !== "");

    if(fluxo.length === 0) return;

    const setor = normalizarSetor(fluxo[fluxo.length - 1]);

    // 🔥 FILTRA PELO SETOR ATUAL
    if(setor !== s.nome) return;

    total++;

    // 🔥 COMPARA SEM HORA
    const d1 = new Date(
      dataConclusao.getFullYear(),
      dataConclusao.getMonth(),
      dataConclusao.getDate()
    );

    const d2 = new Date(
      dataLimite.getFullYear(),
      dataLimite.getMonth(),
      dataLimite.getDate()
    );

    if(d1 <= d2){
      noPrazo++;
    }

  });

  // 🔥 CALCULA %
  if(total > 0){
    prazoPerc = (noPrazo / total) * 100;
  }

// 🔥 CALCULO QUALIDADE (CORRETO)
let aprovados = 0;
let reprovados = 0;

// 🔹 1. MAPA DE OS REPROVADAS (montado antes do loop dos setores)

// 🔹 2. CLASSIFICA CORRETAMENTE
dados.forEach(l => {

  if(!l.dataConclusao) return;

  const data = parseDataBR(l.dataConclusao);
  if(!data) return;

  if(data.getMonth() !== mesAtual || data.getFullYear() !== anoAtual) return;
  if(!statusConcluido(l.c11)) return;

  const fluxo = [l.c7, l.c8, l.c9, l.c10]
    .map(x => String(x || "").trim())
    .filter(x => x !== "");

  const setorResp = fluxo.length ? normalizarSetor(fluxo[fluxo.length - 1]) : "";

  if(setorResp !== s.nome) return;

  const os = String(l.os || "").trim();
  const quantidade = Number(l.qtd) || 1;

  // 🔥 REGRA DE NEGÓCIO
  if(mapaOSReprovadas[os]){
    reprovados += quantidade;
  } else {
    aprovados += quantidade;
  }

});

  // 🔥 % FINAL
  let qualidadeReal = 0;
  const totalQualidade = aprovados + reprovados;

  if(totalQualidade > 0){
    qualidadeReal = (aprovados / totalQualidade) * 100;
  }

  // 🔥 BUSCAR META DE QUALIDADE (COLUNA E)
  let metaQualidade = 0;

  for(let i = 1; i < dadosMetas.length; i++){
    const setorMeta = normalizarSetor(dadosMetas[i][1]);

    if(setorMeta === s.nome){
      metaQualidade = Number(dadosMetas[i][4]) || 0; // COLUNA E
      break;
    }
  }

  // 🔥 COMPARAÇÃO COM META
  let qualidadePerc = 0;

  if(metaQualidade > 0){
    qualidadePerc = (qualidadeReal / metaQualidade) * 100;
    if(qualidadePerc > 100) qualidadePerc = 100;
  }

// 🔥 BUSCA META DE TEMPO (COLUNA D)
let metaTempo = 0;

for(let i = 1; i < dadosMetas.length; i++){
  const setorMeta = normalizarSetor(dadosMetas[i][1]);

  if(setorMeta === s.nome){
    metaTempo = Number(dadosMetas[i][3]) || 0; // COLUNA D = TEMPO
    break;
  }
}

const metaProducao = Number(metas[s.nome]) || 0;

// 🔥 BUSCA META PRAZO (COLUNA F)
let metaPrazo = 0;

for(let i = 1; i < dadosMetas.length; i++){
  const setorMeta = normalizarSetor(dadosMetas[i][1]);

  if(setorMeta === s.nome){
    metaPrazo = Number(dadosMetas[i][5]) || 0;
    break;
  }
}

return {
  setor: s.nome,

  producao,
  concluidas: Number(s.concluidas || 0),
  metaProducao: metaProducao,

  qualidade: Number(qualidadePerc.toFixed(1)),
  metaQualidade: metaQualidade, // 🔥 AGORA VAI PRO HTML

  prazo: Number(prazoPerc.toFixed(1)),
  metaPrazo: metaPrazo, // 🔥 AGORA VAI PRO HTML

  tempo: tempoDias,
  metaTempo: metaTempo
};

});

return resultado;
}
function getMetasPorSetor() {

  const ss = SpreadsheetApp.openById("1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE");
  const sh = ss.getSheetByName("Metas");

  if (!sh) throw new Error("Aba 'Metas' não encontrada.");

  const dados = sh.getDataRange().getValues();
  const mapa = {};

  function normalizar(txt){
    return String(txt || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

function normalizarSetor(txt){
  const t = String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (t.includes("limpeza")) return "limpeza de estofados";
  if (t.includes("costura")) return "costura";
  if (t.includes("forracao")) return "forracao";
  if (t.includes("acabamento")) return "acabamento e pintura";
  if (t.includes("solda")) return "solda";
if (t.includes("marcenaria")) return "Marcenaria";

  return t;
}

for (let i = 1; i < dados.length; i++) {

  const setorOriginal = dados[i][1];
  const setor = normalizarSetor(setorOriginal);

  const meta = Number(dados[i][2]) || 0;

  if (setor) {
    mapa[setor] = meta;
  }

}

  return mapa;
}
function calcularProducao(setorDados, metas) {

  function normalizar(txt){
    return String(txt || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

const nome = setorDados.nome; // 🔥 NÃO NORMALIZA AQUI
const meta = Number(metas[nome]) || 0;

  if (meta <= 0) return 0;

  const concluidas = Number(setorDados.concluidas) || 0;

  let perc = (concluidas / meta) * 100;

  if (perc < 0) perc = 0;
  if (perc > 100) perc = 100;

  return Number(perc.toFixed(1));
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



} // 🔥 FECHA testeMetasSetores
function testeColunas(){

  const sh = SpreadsheetApp.openById("1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE")
    .getSheetByName("Itens Danificados");

  const dados = sh.getDataRange().getValues();

  const linha = dados[1];

  linha.forEach((col, i) => {
    Logger.log("COLUNA " + i + ": " + col);
  });

}
function getHTMLDashboard(){
  return HtmlService.createHtmlOutputFromFile('dashboard').getContent();
}

function getProducaoSetoresMes(){

const dados = buscarItensDanificados(); // ✅ correto

const ss = SpreadsheetApp.getActiveSpreadsheet();
const shMetas = ss.getSheetByName("Metas");

if(!shMetas) throw new Error("Aba Metas não encontrada");

const metas = shMetas.getDataRange().getValues();

  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  const resultado = {};

  function normalizar(txt){
    return String(txt || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  // 🔥 MAPA DE METAS
  const mapaMetas = {};

for(let i=1; i<metas.length; i++){
const setor = normalizar(metas[i][1]);
const meta = Number(metas[i][2]) || 0;

  if(setor){
    mapaMetas[setor] = meta;
  }
}

  // 🔥 PROCESSAR DADOS
  for(let i=1; i<dados.length; i++){

    const row = dados[i];

const status = normalizar(row.c11);
const dataConclusao = row.dataConclusao;

    if(!status.includes("concluido")) continue;
    if(!dataConclusao) continue;

const data = parseDataBR(row.dataConclusao);
if(!data) continue;

if(data.getMonth() !== mesAtual || data.getFullYear() !== anoAtual) continue;

// 🔥 PEGAR FLUXO
const fluxos = [
  row.c7,
  row.c8,
  row.c9,
  row.c10
].filter(v => v);

    fluxos.forEach(setor => {

      const key = normalizar(setor);

      if(!resultado[key]){
        resultado[key] = {
          setor: setor,
          producao: 0,
          meta: mapaMetas[key] || 0
        };
      }

      resultado[key].producao += 1;

    });

  }

  // 🔥 CALCULAR %
  return Object.values(resultado).map(s => {

    const perc = s.meta > 0 ? (s.producao / s.meta) * 100 : 0;

    return {
      setor: s.setor,
      producao: s.producao,
      meta: s.meta,
      percentual: perc
    };

  });

}

function testeAbas(){

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sh1 = ss.getSheetByName("Respostas ao formulário 1");
  const sh2 = ss.getSheetByName("Metas");

  Logger.log("Respostas:", sh1);
  Logger.log("Metas:", sh2);

}

function parseDataBR(valor){

  if (!valor) return null;

  if (Object.prototype.toString.call(valor) === "[object Date]") {
    return isNaN(valor.getTime()) ? null : valor;
  }

  let txt = String(valor).trim();
  if (!txt) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(txt)) {
    const dataIso = new Date(txt);
    return isNaN(dataIso.getTime()) ? null : dataIso;
  }

  if (txt.includes(" ")) {
    txt = txt.split(" ")[0];
  }

  const partes = txt.split("/");
  if (partes.length === 3) {
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1;
    const ano = parseInt(partes[2], 10);

    const dataBr = new Date(ano, mes, dia);
    return isNaN(dataBr.getTime()) ? null : dataBr;
  }

  const data = new Date(txt);
  return isNaN(data.getTime()) ? null : data;
}

// ==============================
// ======== CENTRAL =========
// ==============================

function salvarMetasEmLote(mes, dados){

  exigirAcessoCentral_();


  const ss = SpreadsheetApp.openById("1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE");
  const aba = ss.getSheetByName("Metas");

  if (!aba) {
    throw new Error('A aba "Metas" não foi encontrada.');
  }

  const valores = aba.getDataRange().getValues();

  const mapaMes = {
    "01": "Janeiro",
    "02": "Fevereiro",
    "03": "Março",
    "04": "Abril",
    "05": "Maio",
    "06": "Junho",
    "07": "Julho",
    "08": "Agosto",
    "09": "Setembro",
    "10": "Outubro",
    "11": "Novembro",
    "12": "Dezembro"
  };

  const numeroMes = mes.split("-")[1];
  const nomeMes = mapaMes[numeroMes];

  dados.forEach(d => {

    let linhaExistente = -1;

    for (let i = 1; i < valores.length; i++) {

      const mesLinha = String(valores[i][0] || "")
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      const setorLinha = String(valores[i][1] || "")
        .toLowerCase()
        .trim();

      const mesComparado = nomeMes
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      if (
        mesLinha === mesComparado &&
        setorLinha === d.setor.toLowerCase()
      ) {
        linhaExistente = i + 1;
        break;
      }
    }

    const linhaDados = [[
      nomeMes,
      d.setor,
      d.producao || "",
      d.tempo || "",
      d.qualidade || "",
      d.prazo || "",

      d.atraso || "",
      d.semUniforme || "",
      d.semEpi || "",
      d.usoCelular || "",
      d.falta || "",
      d.advertencia || "",
      d.ausenciaJornada || ""
    ]];

    if (linhaExistente > 0) {

      aba.getRange(
        linhaExistente,
        1,
        1,
        13
      ).setValues(linhaDados);

    } else {

      aba.getRange(
        aba.getLastRow() + 1,
        1,
        1,
        13
      ).setValues(linhaDados);

    }

  });

  return { ok: true };

}

function getMetasConfiguradas(mes){

  exigirAcessoCentral_();


  // 🔥 PLANILHA OPERACIONAL
  const ssOperacional = SpreadsheetApp.openById(
    "1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE"
  );

  const abaOperacional =
    ssOperacional.getSheetByName("Metas");

  const dadosOperacional =
    abaOperacional.getDataRange().getValues();

  // 🔥 PLANILHA RH
  const ssRH = SpreadsheetApp.openById(
    "1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo"
  );

  const abaRH =
    ssRH.getSheetByName("Metas");

  const metasRH =
    abaRH.getRange(2,1,1,7).getValues()[0];

  const mesSeguro =
    mes ||
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );

  const numeroMes =
    mesSeguro.split("-")[1];

  const mapaMes = {
    "janeiro":"01",
    "fevereiro":"02",
    "marco":"03",
    "março":"03",
    "abril":"04",
    "maio":"05",
    "junho":"06",
    "julho":"07",
    "agosto":"08",
    "setembro":"09",
    "outubro":"10",
    "novembro":"11",
    "dezembro":"12"
  };

  const setores = [
    "Marcenaria",
    "Acabamento e Pintura",
    "Solda",
    "Costura",
    "Forração",
    "Limpeza de Estofados"
  ];

  const base = {};

  setores.forEach(setor => {

    base[setor] = {

      setor,

      producao: "",
      tempo: "",
      qualidade: "",
      prazo: "",

      atraso: metasRH[0] || 0,
      semUniforme: metasRH[1] || 0,
      semEpi: metasRH[2] || 0,
      usoCelular: metasRH[3] || 0,
      falta: metasRH[4] || 0,
      advertencia: metasRH[5] || 0,
      ausenciaJornada: metasRH[6] || 0

    };

  });

  dadosOperacional.slice(1).forEach(l => {

    let mesLinha = String(l[0] || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const mesConvertido =
      mapaMes[mesLinha];

    if(mesConvertido !== numeroMes){
      return;
    }

    const setorOriginal = l[1];

    const setorNormalizado =
      normalizarSetorKey(setorOriginal);

    const setorBase =
      Object.keys(base).find(s =>
        normalizarSetorKey(s) === setorNormalizado
      );

    if(!setorBase){
      return;
    }

    base[setorBase] = {

      ...base[setorBase],

      producao: l[2],
      tempo: l[3],
      qualidade: l[4],
      prazo: l[5]

    };

  });

  return Object.values(base);

}
function calcularStatusSetores(mes){

  exigirAcessoCentral_();


  /*
    O status do setor considera somente:
    produção, qualidade, prazo, tempo e gasto.

    Todas as ocorrências de RH, inclusive atraso,
    são avaliadas individualmente por funcionário.
  */

  const metas =
    getMetasConfiguradas(mes);

  const dadosReais =
    getMetasSetoresMensal(mes);

  const gastosLista =
    getTetoGastosMensal(mes);

  const resultado = [];

  metas.forEach(function(meta){

    const real =
      dadosReais.find(function(item){

        return (
          normalizarSetorKey(item.setor) ===
          normalizarSetorKey(meta.setor)
        );

      }) || {};

    const producao =
      Number(real.concluidas || 0);

    const qualidade =
      Number(real.qualidade || 0);

    const prazo =
      Number(real.prazo || 0);

    const tempo =
      Number(real.tempo || 0);

    const gastoObj =
      gastosLista.find(function(item){

        return (
          normalizarSetorKey(item.setor) ===
          normalizarSetorKey(meta.setor)
        );

      }) || {};

    const gasto =
      Number(gastoObj.percentual || 0);

    const metaGasto =
      100;

    const metaProducao =
      Number(meta.producao || 0);

    const metaQualidade =
      Number(meta.qualidade || 0);

    const metaPrazo =
      Number(meta.prazo || 0);

    const metaTempo =
      Number(meta.tempo || 0);

    const okProducao =
      metaProducao === 0 ||
      producao >= metaProducao;

    const okQualidade =
      metaQualidade === 0 ||
      qualidade >= metaQualidade;

    const okPrazo =
      metaPrazo === 0 ||
      prazo >= metaPrazo;

    const okTempo =
      metaTempo === 0 ||
      tempo <= metaTempo;

    const okGasto =
      gasto < metaGasto;

    const bateuMeta =
      okProducao &&
      okQualidade &&
      okPrazo &&
      okTempo &&
      okGasto;

    resultado.push({

      setor:
        meta.setor,

      producao:
        producao,

      qualidade:
        qualidade,

      prazo:
        prazo,

      tempo:
        tempo,

      metaProducao:
        metaProducao,

      metaQualidade:
        metaQualidade,

      metaPrazo:
        metaPrazo,

      metaTempo:
        metaTempo,

      gasto:
        gasto,

      metaGasto:
        metaGasto,

      status:
        bateuMeta

    });

  });

  return resultado;

}
function normalizarSetorKey(txt){
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
function getDadosReaisSetores(mes){
  return getMetasSetoresMensal(mes);
}

function testeStatus(){

  liberarAcessoInterno_();

  const r = calcularStatusSetores("2026-04");
  Logger.log(JSON.stringify(r, null, 2));
}

function calcularFinanceiroLinha(linha) {

  if (!linha || linha < 2) {
    throw new Error("Linha inválida: " + linha);
  }

  const ss = SpreadsheetApp.openById(ID_PLANILHA);

  const aba = ss.getSheetByName("Itens Danificados");
  const abaComissao = ss.getSheetByName("Comissão O.S");

  if (!aba) throw new Error("Aba Itens Danificados não encontrada");
  if (!abaComissao) throw new Error("Aba Comissão O.S não encontrada");

  const row = aba.getRange(linha, 1, 1, aba.getLastColumn()).getValues()[0];

  const quantidade = Number(row[6]) || 0;

  // 🔥 TRATA VALOR BRASILEIRO
  let valorReposicao = row[18];

  if (typeof valorReposicao === "string") {

    valorReposicao = valorReposicao
      .replace("R$", "")
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");

  }

  valorReposicao = Number(valorReposicao) || 0;

  const setor = String(row[7] || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (!quantidade) return;
  if (!valorReposicao) return;
  if (!setor) return;

  const dadosComissao = abaComissao.getDataRange().getValues();

  let comissaoBruta = 0;

  for (let i = 1; i < dadosComissao.length; i++) {

    const setorComissao = String(dadosComissao[i][0] || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    if (setorComissao === setor) {

      let valor = dadosComissao[i][1];

      if (typeof valor === "string") {
        valor = valor.replace(",", ".");
      }

      comissaoBruta = Number(valor) || 0;

      break;
    }

  }

  const reposicaoTotal = quantidade * valorReposicao;

  const percentual = comissaoBruta / 100;

  const valorComissao = reposicaoTotal * percentual;

  aba.getRange(linha, 21).setValue(reposicaoTotal);
  aba.getRange(linha, 22).setValue(comissaoBruta);
  aba.getRange(linha, 23).setValue(valorComissao);

  aba.getRange(linha, 21).setNumberFormat("R$ #,##0.00");
  aba.getRange(linha, 23).setNumberFormat("R$ #,##0.00");

}
function parseValorBR(valor){
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;

  let v = String(valor).trim();
  v = v.replace("R$", "").trim();
  v = v.replace(/\./g, "");
  v = v.replace(",", ".");

  return Number(v) || 0;
}
function testeEventosDebug(){

  const sheet = SpreadsheetApp
    .openById("1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78")
    .getSheetByName("Matriz");

  const dados = sheet.getDataRange().getValues();

  Logger.log("TOTAL LINHAS: " + dados.length);

  for(let i = 1; i < dados.length; i++){

    const linha = dados[i];

    const data = linha[1];

    Logger.log("------ LINHA " + (i+1) + " ------");
    Logger.log("DATA RAW: " + data);
    Logger.log("TIPO DATA: " + typeof data);

    if(data){

function parseData(data){

  if(data instanceof Date) return data;

  const txt = String(data);

  // formato YYYY-MM-DD
  if(txt.includes("-")){
    return new Date(txt);
  }

  // formato BR (DD/MM/YYYY)
  const partes = txt.split("/");
  if(partes.length === 3){
    return new Date(partes[2], partes[1]-1, partes[0]);
  }

  return null;
}

const d = parseData(data);
if(!d) continue;

      Logger.log("DATA FORMATADA: " + d);

      const mesLinha =
        d.getFullYear() + "-" +
        String(d.getMonth()+1).padStart(2,"0");

      Logger.log("MES EXTRAIDO: " + mesLinha);

    }

    Logger.log("PEDIDO: " + linha[2]);
    Logger.log("VALOR LOCAÇÃO: " + linha[5]);

    Logger.log("SCORE ESTOFADOS: " + linha[18]);
    Logger.log("COMISSAO ESTOFADOS: " + linha[19]);
    Logger.log("VALOR COMISSAO ESTOFADOS: " + linha[20]);

    Logger.log("SCORE PINTURA: " + linha[24]);
    Logger.log("COMISSAO PINTURA: " + linha[25]);
    Logger.log("VALOR COMISSAO PINTURA: " + linha[26]);

  }

}

    function testeBruto(){

  const sheet = SpreadsheetApp
    .openById("1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78")
    .getSheetByName("Matriz");

  const dados = sheet.getDataRange().getValues();

  Logger.log(dados.length);
  Logger.log(dados[1]); // primeira linha de dados

}
function testeEventos(){

  liberarAcessoInterno_();


  const r = listarEventosMes("2026-04");

  Logger.log("TIPO:");
  Logger.log(typeof r);

  Logger.log("CONTEUDO:");
  Logger.log(r);

}

function preencherCodigoEValorReposicao(){

  const ID_ITENS_DANIFICADOS = "1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE";
  const ABA_DANIFICADOS = "Itens Danificados";

  const ID_ITENS = "133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk";
  const ABA_ITENS = "Itens";

  const shDanificados = SpreadsheetApp
    .openById(ID_ITENS_DANIFICADOS)
    .getSheetByName(ABA_DANIFICADOS);

  const shItens = SpreadsheetApp
    .openById(ID_ITENS)
    .getSheetByName(ABA_ITENS);

  const dadosDanificados = shDanificados.getDataRange().getValues();
  const dadosItens = shItens.getDataRange().getValues();

  // 🔥 MONTA MAPA: NOME -> {codigo, valor}
  const mapaItens = {};

  for(let i = 1; i < dadosItens.length; i++){
    const linha = dadosItens[i];

    const nome = String(linha[1] || "").trim();     // coluna B (nome)
    const codigo = String(linha[2] || "").trim();   // coluna C (codigo)
    const valor = linha[3] || "";                   // coluna D (valor reposição)

    if(nome){
      mapaItens[nome.toLowerCase()] = {
        codigo: codigo,
        valor: valor
      };
    }
  }

  let atualizacoes = [];

  for(let i = 1; i < dadosDanificados.length; i++){

    const linha = dadosDanificados[i];

    const nomeItem = String(linha[5] || "").trim(); // 🔥 coluna F
    const codigoAtual = linha[17];                  // 🔥 coluna R
    const valorAtual = linha[18];                   // 🔥 coluna S

    if(!nomeItem) continue;

    // 🔥 só processa se estiver vazio
    if(codigoAtual && valorAtual) continue;

    const itemRef = mapaItens[nomeItem.toLowerCase()];

    if(itemRef){

      const novoCodigo = codigoAtual || itemRef.codigo;
      const novoValor = valorAtual || itemRef.valor;

      atualizacoes.push({
        linha: i + 1,
        codigo: novoCodigo,
        valor: novoValor
      });

    }

  }

// 🔥 APLICA ATUALIZAÇÕES
atualizacoes.forEach(up => {

  if(up.codigo){
    shDanificados.getRange(up.linha, 18).setValue(up.codigo); // coluna R
  }

  if(up.valor){
    shDanificados.getRange(up.linha, 19).setValue(up.valor); // coluna S
  }

  try {
    calcularFinanceiroLinha(up.linha);
  } catch(e){
    Logger.log(
      "Erro ao calcular financeiro linha " +
      up.linha +
      ": " +
      e.message
    );
  }

});

Logger.log("Atualizados: " + atualizacoes.length);

}

function debugPrazoSolda(){

  const dados = buscarItensDanificados();

  dados.forEach(l => {

    const fluxo = [l.c7, l.c8, l.c9, l.c10]
      .filter(x => x);

    if(!fluxo.includes("Solda")) return;

    if(!l.dataConclusao) return;

    const dataC = parseDataBR(l.dataConclusao);
    if(!dataC) return;

    if(dataC.getMonth() !== 3) return; // abril = 3

    Logger.log("OS: " + l.os);
    Logger.log("Data U: " + l.dataU);
    Logger.log("Conclusão: " + l.dataConclusao);
    Logger.log("----");

  });

}

function listarOSMes(mes){

  exigirAcessoCentral_();


  const dados = buscarItensDanificados();

  if(!mes){
    const hoje = new Date();
    mes = Utilities.formatDate(hoje, Session.getScriptTimeZone(), "yyyy-MM");
  }

  const resultado = [];

  dados.forEach(l => {

// 🔥 REGRA: só O.S concluídas (coluna L)
const status = String(l.c11 || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, "")
  .trim();

if(!status.includes("concluido")) return;

// 🔥 usa SOMENTE data de conclusão
const data = parseDataBR(l.dataConclusao);
if(!data) return;

const mesLinha = Utilities.formatDate(
  data,
  Session.getScriptTimeZone(),
  "yyyy-MM"
);

if(mesLinha !== mes) return;

    const fluxoArray = [l.c7, l.c8, l.c9, l.c10]
      .map(x => String(x || "").trim())
      .filter(x => x !== "");

    const fluxo = fluxoArray.join(" → ");

    const setorFinal = fluxoArray.length
      ? normalizarSetor(fluxoArray[fluxoArray.length - 1])
      : normalizarSetor(l.setor);

    resultado.push({
      data: l.data,
      os: l.os,
      item: l.item,
      qtd: Number(l.qtd || 0),
      fluxo: fluxo,
      dano: l.onde,
      pedido: l.pedido,
      detalhes: l.detalhes,

      // 🔥 CORRIGIDO (colunas reais)
      reposicao: Number(l.reposicaoTotal || 0),
      comissao: Number(l.comissao || 0),
      total: Number(l.total || 0),

      setor: setorFinal
    });

  });

  return resultado;
}
function testeFinanceiroLinha() {
  calcularFinanceiroLinha(736);
}
function recalcularFinanceiroTudo() {

  const ss = SpreadsheetApp.openById(ID_PLANILHA);

  const aba = ss.getSheetByName("Itens Danificados");
  const abaComissao = ss.getSheetByName("Comissão O.S");

  const dados = aba.getDataRange().getValues();
  const dadosComissao = abaComissao.getDataRange().getValues();

  const mapaComissao = {};

  for(let i = 1; i < dadosComissao.length; i++){

    const setor = String(dadosComissao[i][0] || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    mapaComissao[setor] =
      Number(
        String(dadosComissao[i][1] || "0")
          .replace(",", ".")
      ) || 0;

  }

  let atualizadas = 0;

  for(let i = 1; i < dados.length; i++){

    const linha = dados[i];

    const quantidade = Number(linha[6]) || 0;

    let valorReposicao = linha[18];

    if(typeof valorReposicao === "string"){

      valorReposicao = valorReposicao
        .replace("R$", "")
        .trim()
        .replace(/\./g, "")
        .replace(",", ".");

    }

    valorReposicao = Number(valorReposicao) || 0;

    const setor = String(linha[7] || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    if(!quantidade || !valorReposicao || !setor){
      continue;
    }

    const comissaoBruta =
      Number(mapaComissao[setor] || 0);

    const reposicaoTotal =
      quantidade * valorReposicao;

    const valorComissao =
      reposicaoTotal * (comissaoBruta / 100);

    aba.getRange(i + 1, 21).setValue(reposicaoTotal);
    aba.getRange(i + 1, 22).setValue(comissaoBruta);
    aba.getRange(i + 1, 23).setValue(valorComissao);

    atualizadas++;

  }

  aba.getRange(2,21,aba.getLastRow()-1,1)
    .setNumberFormat("R$ #,##0.00");

  aba.getRange(2,23,aba.getLastRow()-1,1)
    .setNumberFormat("R$ #,##0.00");

  Logger.log("Atualizadas: " + atualizadas);

}
function listarLinhasSemFinanceiro() {

  const sh = getSheet();
  const dados = sh.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const qtd = dados[i][6];      // G
    const setor = dados[i][7];    // H
    const valor = dados[i][18];   // S

    const reposicao = dados[i][20]; // U
    const comissao = dados[i][21];  // V
    const total = dados[i][22];     // W

    if(!reposicao && !comissao && !total){

      Logger.log(
        "Linha: " + (i+1) +
        " | QTD=" + qtd +
        " | SETOR=" + setor +
        " | VALOR=" + valor
      );

    }

  }

}
function testar737() {

  const sh = getSheet();

  const valor = sh.getRange(737,19).getValue();

  Logger.log(valor);
  Logger.log(typeof valor);

}
function testeEventos(){

  liberarAcessoInterno_();

  return listarEventosMes("2026-06");
}
function listarEventosMes(mes){

  exigirAcessoCentral_();


  const sheet = SpreadsheetApp
    .openById("1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78")
    .getSheetByName("Matriz");

  const dados = sheet.getDataRange().getDisplayValues();

  const resultado = [];

  for (let i = 1; i < dados.length; i++) {

    const linha = dados[i];

    const data = String(linha[1] || "").trim();

    if (!data) continue;

    let mesLinha = "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      mesLinha = data.slice(0, 7);
    }
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
      const partes = data.split("/");
      mesLinha = `${partes[2]}-${partes[1]}`;
    }
    else {
      continue;
    }

    if (mes && mesLinha !== mes) continue;

    resultado.push({
      data: data,
      numero: String(linha[2] || "").trim(),
      valorLocacao: parseValorBR(linha[5]),

      score: Number(String(linha[18] || "").replace(",", ".")) || 0,
      comissao: Number(String(linha[19] || "").replace(",", ".")) || 0,
      valorComissao: parseValorBR(linha[20]),

      scorePintura: Number(String(linha[25] || "").replace(",", ".")) || 0,
      comissaoPintura: Number(String(linha[26] || "").replace(",", ".")) || 0,
      valorComissaoPintura: parseValorBR(linha[27])
    });

  }

  return resultado;

}

function parseValorBR(valor){

  if (valor === null || valor === undefined || valor === "") {
    return 0;
  }

  if (typeof valor === "number") {
    return valor;
  }

  let v = String(valor).trim();

  v = v.replace("R$", "").trim();
  v = v.replace(/\./g, "");
  v = v.replace(",", ".");

  return Number(v) || 0;

}
function buscarOSConcluidas(parametros) {
  try {
    const SPREADSHEET_ID = '1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE';
    const NOME_ABA = 'Itens Danificados';

    const pagina = Number(parametros && parametros.pagina) || 1;
    const limite = Number(parametros && parametros.limite) || 20;

    const busca = parametros && parametros.busca
      ? String(parametros.busca).trim().toLowerCase()
      : '';

    const setorFiltro = parametros && parametros.setor
      ? String(parametros.setor).trim()
      : '';

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const aba = ss.getSheetByName(NOME_ABA);

    if (!aba) {
      throw new Error('Aba não encontrada: ' + NOME_ABA);
    }

    const ultimaLinha = aba.getLastRow();

    if (ultimaLinha < 2) {
      return {
        sucesso: true,
        dados: [],
        setores: [],
        total: 0,
        pagina: 1,
        totalPaginas: 1
      };
    }

    const valores = aba.getRange(2, 1, ultimaLinha - 1, 20).getValues();

    let dados = valores
      .map(function(linha) {
        const coluna7 = linha[7] || '';   // H
        const coluna8 = linha[8] || '';   // I
        const coluna9 = linha[9] || '';   // J
        const coluna10 = linha[10] || ''; // K

        return {
          data: formatarDataHoraOSConcluidas(linha[1]),           // B
          setor: linha[2] || '',                                  // C
          nome: linha[3] || '',                                   // D
          os: linha[4] || '',                                     // E
          item: linha[5] || '',                                   // F
          qtd: linha[6] || '',                                    // G
          coluna7: coluna7,                                       // H
          coluna8: coluna8,                                       // I
          coluna9: coluna9,                                       // J
          coluna10: coluna10,                                     // K
          coluna11: linha[11] || '',                              // L
          dataConclusaoOriginal: linha[19],                       // T
          dataConclusao: formatarDataHoraOSConcluidas(linha[19])  // T
        };
      })
      .filter(function(item) {
        return item.dataConclusaoOriginal;
      });

    // Lista de setores para montar o filtro, antes de aplicar o filtro de setor
    const setores = [...new Set(
      dados.flatMap(function(item) {
        return [
          item.coluna7,
          item.coluna8,
          item.coluna9,
          item.coluna10
        ];
      })
      .map(function(valor) {
        return String(valor || '').trim();
      })
      .filter(function(valor) {
        return valor;
      })
    )].sort(function(a, b) {
      return a.localeCompare(b, 'pt-BR');
    });

    // Filtro por busca: número da O.S ou nome do item
    dados = dados.filter(function(item) {
      if (!busca) return true;

      const os = String(item.os || '').toLowerCase();
      const nomeItem = String(item.item || '').toLowerCase();

      return os.includes(busca) || nomeItem.includes(busca);
    });

    // Filtro por setor responsável:
    // verifica se o setor escolhido aparece na coluna 7, 8, 9 ou 10
    dados = dados.filter(function(item) {
      if (!setorFiltro) return true;

      const fluxos = [
        item.coluna7,
        item.coluna8,
        item.coluna9,
        item.coluna10
      ].map(function(valor) {
        return String(valor || '').trim();
      });

      return fluxos.includes(setorFiltro);
    });

    // Ordena pela Data Conclusão, coluna T
    dados.sort(function(a, b) {
      const dataA = converterParaDataOSConcluidas(a.dataConclusaoOriginal);
      const dataB = converterParaDataOSConcluidas(b.dataConclusaoOriginal);

      return dataB - dataA;
    });

    const total = dados.length;
    const totalPaginas = Math.max(1, Math.ceil(total / limite));
    const paginaCorrigida = Math.min(Math.max(pagina, 1), totalPaginas);

    const inicio = (paginaCorrigida - 1) * limite;
    const fim = inicio + limite;

    const dadosPaginados = dados.slice(inicio, fim).map(function(item) {
      delete item.dataConclusaoOriginal;
      return item;
    });

    return {
      sucesso: true,
      dados: dadosPaginados,
      setores: setores,
      total: total,
      pagina: paginaCorrigida,
      totalPaginas: totalPaginas
    };

  } catch (erro) {
    return {
      sucesso: false,
      mensagem: erro.message,
      dados: [],
      setores: [],
      total: 0,
      pagina: 1,
      totalPaginas: 1
    };
  }
}
function formatarDataHoraOSConcluidas(valor) {
  if (!valor) return '';

  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor)) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      'dd/MM/yyyy HH:mm'
    );
  }

  return String(valor);
}


function converterParaDataOSConcluidas(valor) {
  if (!valor) return new Date(0);

  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor)) {
    return valor;
  }

  const texto = String(valor).trim();

  // Aceita formato dd/MM/yyyy ou dd/MM/yyyy HH:mm
  const partes = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);

  if (partes) {
    const dia = Number(partes[1]);
    const mes = Number(partes[2]) - 1;
    const ano = Number(partes[3]);
    const hora = Number(partes[4] || 0);
    const minuto = Number(partes[5] || 0);

    return new Date(ano, mes, dia, hora, minuto);
  }

  const data = new Date(texto);

  if (!isNaN(data)) {
    return data;
  }

  return new Date(0);
}
function cadastrarItemDanificado(dados) {
  try {
    const SPREADSHEET_ID = '133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk';
    const ABA_ITENS = 'Itens';
    const ABA_SENHAS = 'Senhas';

    if (!dados) {
      throw new Error('Dados do item não foram enviados.');
    }

    const categoria = String(dados.categoria || '').trim();
    const nomeItem = String(dados.nomeItem || '').trim();
    const codigo = String(dados.codigo || '').trim().toUpperCase();
    const valorReposicao = String(dados.valorReposicao || '').trim();
    const tipo = String(dados.tipo || '').trim().toUpperCase();
    const senhaDigitada = String(dados.senha || '').trim();

    if (!categoria) {
      throw new Error('Categoria é obrigatória.');
    }

    if (!nomeItem) {
      throw new Error('Nome do item é obrigatório.');
    }

    if (!codigo) {
      throw new Error('Código é obrigatório.');
    }

    if (!valorReposicao) {
      throw new Error('Valor de reposição é obrigatório.');
    }

    if (!tipo) {
      throw new Error('Tipo é obrigatório.');
    }

    /* Senha do estoque removida (out/2026): protege o login do Acervo. */

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Busca senha correta na aba Senhas
    const abaSenhas = ss.getSheetByName(ABA_SENHAS);

    if (!abaSenhas) {
      throw new Error('Aba de senhas não encontrada: ' + ABA_SENHAS);
    }

    // Mesma conferência (com limite de tentativas) das outras ações
    const conferencia = validarSenha('estoque', senhaDigitada);

    if (!conferencia.ok) {
      throw new Error(conferencia.msg === 'Senha incorreta' ? 'Senha do estoque incorreta.' : conferencia.msg);
    }

    // Valor de reposição precisa ser um número maior que zero
    const valorNumero = Number(
      valorReposicao.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')
    );

    if (!isFinite(valorNumero) || valorNumero <= 0) {
      throw new Error('Valor de reposição inválido.');
    }

    if (/\s/.test(codigo) || codigo.length > 30) {
      throw new Error('O código não pode ter espaços (máximo 30 caracteres).');
    }

    if (nomeItem.length > 150 || categoria.length > 80) {
      throw new Error('Nome ou categoria muito longos.');
    }

    if (['ITEM', 'COMPONENTE', 'SERVIÇO'].indexOf(tipo) < 0) {
      throw new Error('Tipo inválido.');
    }

    // Salva item na aba Itens
    const abaItens = ss.getSheetByName(ABA_ITENS);

    if (!abaItens) {
      throw new Error('Aba não encontrada: ' + ABA_ITENS);
    }

    const ultimaLinha = abaItens.getLastRow();

    if (ultimaLinha >= 2) {
      const codigosExistentes = abaItens
        .getRange(2, 3, ultimaLinha - 1, 1)
        .getValues()
        .flat()
        .map(function(valor) {
          return String(valor || '').trim().toUpperCase();
        });

      if (codigosExistentes.includes(codigo)) {
        throw new Error('Já existe um item cadastrado com este código.');
      }
    }

    abaItens.appendRow([
      textoSeguro_(categoria),
      textoSeguro_(nomeItem),
      textoSeguro_(codigo),
      valorReposicao,
      tipo
    ]);

    return {
      sucesso: true,
      mensagem: 'Item cadastrado com sucesso.',
      item: {
        categoria: categoria,
        nomeItem: nomeItem,
        codigo: codigo,
        valorReposicao: valorReposicao,
        tipo: tipo
      }
    };

  } catch (erro) {
    return {
      sucesso: false,
      mensagem: erro.message
    };
  }
}

function buscarSenhaEstoqueAddItem_(abaSenhas) {
  const ultimaLinha = abaSenhas.getLastRow();

  if (ultimaLinha < 2) {
    return '';
  }

  const dados = abaSenhas.getRange(2, 1, ultimaLinha - 1, 2).getValues();

  for (let i = 0; i < dados.length; i++) {
    const setor = String(dados[i][0] || '').trim().toLowerCase();
    const senha = String(dados[i][1] || '').trim();

    if (setor === 'estoque') {
      return senha;
    }
  }

  return '';
}

function buscarFuncionariosOS() {
  try {
    const SPREADSHEET_ID = '1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE';
    const SHEET_GID = 1926386833;

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    const aba = ss.getSheets().find(function(sheet) {
      return sheet.getSheetId() === SHEET_GID;
    });

    if (!aba) {
      throw new Error('Aba de funcionários não encontrada pelo GID: ' + SHEET_GID);
    }

    const ultimaLinha = aba.getLastRow();

    if (ultimaLinha < 2) {
      return {
        sucesso: true,
        funcionarios: []
      };
    }

    const dados = aba.getRange(2, 1, ultimaLinha - 1, 2).getValues();

    const funcionarios = dados
      .map(function(linha) {
        return {
          nome: String(linha[0] || '').trim(),
          setor: String(linha[1] || '').trim()
        };
      })
      .filter(function(funcionario) {
        return funcionario.nome;
      })
      .sort(function(a, b) {
        return a.nome.localeCompare(b.nome, 'pt-BR');
      });

    return {
      sucesso: true,
      funcionarios: funcionarios
    };

  } catch (erro) {
    return {
      sucesso: false,
      mensagem: erro.message,
      funcionarios: []
    };
  }
}

function removerOSPorIds(ids, senha) {
  const lock = LockService.getScriptLock();
  try {
    conferirSenhaEstoque_(senha);
    lock.waitLock(30000);

    const SPREADSHEET_ID = '1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE';
    const NOME_ABA = 'Itens Danificados';

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('Nenhuma O.S foi enviada para remoção.');
    }

    const idsLimpos = ids
      .map(function(id) {
        return String(id || '').trim();
      })
      .filter(function(id) {
        return id;
      });

    if (idsLimpos.length === 0) {
      throw new Error('Nenhum ID válido foi enviado para remoção.');
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const aba = ss.getSheetByName(NOME_ABA);

    if (!aba) {
      throw new Error('Aba não encontrada: ' + NOME_ABA);
    }

    const ultimaLinha = aba.getLastRow();

    if (ultimaLinha < 2) {
      throw new Error('Não há dados para remover.');
    }

    const valoresIds = aba
      .getRange(2, 1, ultimaLinha - 1, 1)
      .getValues();

    const linhasParaRemover = [];

    valoresIds.forEach(function(linha, index) {
      const idLinha = String(linha[0] || '').trim();

      if (idsLimpos.includes(idLinha)) {
        linhasParaRemover.push(index + 2);
      }
    });

    if (linhasParaRemover.length === 0) {
      throw new Error('Nenhuma O.S encontrada para remoção.');
    }

    // Remove de baixo para cima para não bagunçar os índices
    linhasParaRemover
      .sort(function(a, b) {
        return b - a;
      })
      .forEach(function(numeroLinha) {
        aba.deleteRow(numeroLinha);
      });

    SpreadsheetApp.flush();

    return {
      ok: true,
      msg: 'O.S removida(s) com sucesso.',
      totalRemovidas: linhasParaRemover.length
    };

  } catch (erro) {
    return {
      ok: false,
      msg: erro.message
    };
  } finally {
    lock.releaseLock();
  }
}

function getMetasAlmoxarifadoCentral(mesFiltro){

  exigirAcessoCentral_();


  const ID_PLANILHA_ALMOXARIFADO = "1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI";
  const ID_PLANILHA_RH = "1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo";

  const ABA_METAS_ALMOX = "Metas Almoxarifado";
  const ABA_OCORRENCIAS_RH = "OcorrenciasRH";

  const ssAlmox = SpreadsheetApp.openById(ID_PLANILHA_ALMOXARIFADO);
  const shMetas = ssAlmox.getSheetByName(ABA_METAS_ALMOX);

  function normalizarTexto(valor){
    return String(valor || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizarMes(valor){

    if(!valor) return "";

    if(valor instanceof Date){
      return Utilities.formatDate(
        valor,
        Session.getScriptTimeZone(),
        "MM/yyyy"
      );
    }

    let txt = String(valor).trim();

    // yyyy-MM vindo do input type="month"
    if(/^\d{4}-\d{2}$/.test(txt)){
      const partes = txt.split("-");
      return `${partes[1]}/${partes[0]}`;
    }

    // yyyy-MM-dd
    if(/^\d{4}-\d{2}-\d{2}/.test(txt)){
      return `${txt.slice(5,7)}/${txt.slice(0,4)}`;
    }

    return txt.replace(/\s/g, "");
  }

  function mesReferenciaDeDataCentral_(valor){

    if(!valor) return "";

    if(valor instanceof Date){
      return Utilities.formatDate(
        valor,
        Session.getScriptTimeZone(),
        "MM/yyyy"
      );
    }

    const txt = String(valor || "").trim();

    // ISO: 2026-07-05T...
    if(/^\d{4}-\d{2}/.test(txt)){
      return `${txt.slice(5,7)}/${txt.slice(0,4)}`;
    }

    // BR: 05/07/2026
    const partes = txt.split(" ")[0].split("/");

    if(partes.length === 3){
      return `${partes[1].padStart(2,"0")}/${partes[2]}`;
    }

    const data = new Date(txt);

    if(!isNaN(data.getTime())){
      return Utilities.formatDate(
        data,
        Session.getScriptTimeZone(),
        "MM/yyyy"
      );
    }

    return "";
  }

  function numero(valor){

    if(valor === null || valor === undefined || valor === "") return 0;

    if(typeof valor === "number") return valor;

    let txt = String(valor)
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3})/g, "")
      .replace(",", ".");

    return Number(txt) || 0;
  }

  const mesBuscado = normalizarMes(
    mesFiltro || Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM"
    )
  );

  let atual = {
    mes: mesBuscado,
    metaContagem: 0,
    assertividade: 0,
    comprasMes: 0,
    tetoGasto: 0
  };

  const historico = [];

  if(shMetas){

    const dadosMetas = shMetas.getDataRange().getValues();

    for(let i = 1; i < dadosMetas.length; i++){

      const linha = dadosMetas[i];

      const mes = normalizarMes(linha[0]);

      if(!mes) continue;

      const obj = {
        mes: mes,
        metaContagem: numero(linha[1]),
        assertividade: numero(linha[2]),
        comprasMes: numero(linha[3]),
        tetoGasto: numero(linha[4])
      };

      historico.push(obj);

      if(mes === mesBuscado){
        atual = obj;
      }
    }
  }

  // ===============================
  // 🔥 OCORRÊNCIAS DO RH
  // ===============================

  const ocorrencias = {
    atraso: 0,
    semUniforme: 0,
    semEpi: 0,
    usoCelular: 0,
    falta: 0,
    advertencia: 0,
    ausenciaJornada: 0
  };

  try {

    const ssRH = SpreadsheetApp.openById(ID_PLANILHA_RH);
    const shRH = ssRH.getSheetByName(ABA_OCORRENCIAS_RH);

    if(shRH){

      const dadosRH = shRH.getDataRange().getValues();

      dadosRH.slice(1).forEach(linha => {

        // Pela sua planilha:
        // B = Data
        // F = Setor
        // G = Tipo

        const data = linha[1];
        const setor = normalizarTexto(linha[5]);
        const tipo = normalizarTexto(linha[6]);

        const mesLinha = mesReferenciaDeDataCentral_(data);

        if(mesLinha !== mesBuscado) return;

        // 🔥 Se na planilha do RH o setor vier com outro nome,
        // coloque aqui. Exemplo: setor.includes("expedicao")
        const ehAlmoxarifado =
          setor.includes("almoxarifado");

        if(!ehAlmoxarifado) return;

        if(tipo.includes("atraso")){
          ocorrencias.atraso++;
        }

        if(tipo.includes("uniforme")){
          ocorrencias.semUniforme++;
        }

        if(tipo.includes("epi")){
          ocorrencias.semEpi++;
        }

        if(tipo.includes("celular")){
          ocorrencias.usoCelular++;
        }

        if(tipo.includes("falta")){
          ocorrencias.falta++;
        }

        if(tipo.includes("advertencia")){
          ocorrencias.advertencia++;
        }

        if(tipo.includes("ausencia") && tipo.includes("jornada")){
          ocorrencias.ausenciaJornada++;
        }

      });

    }

  } catch(e){
    Logger.log("Erro ao buscar ocorrências RH do almoxarifado: " + e.message);
  }

  // Metas de teto das ocorrências, seguindo o mesmo padrão da central
  atual.metaAtraso = 3;
  atual.metaSemUniforme = 2;
  atual.metaSemEpi = 3;
  atual.metaUsoCelular = 2;
  atual.metaFalta = 2;
  atual.metaAdvertencia = 3;
  atual.metaAusenciaJornada = 2;

  atual.atraso = ocorrencias.atraso;
  atual.semUniforme = ocorrencias.semUniforme;
  atual.semEpi = ocorrencias.semEpi;
  atual.usoCelular = ocorrencias.usoCelular;
  atual.falta = ocorrencias.falta;
  atual.advertencia = ocorrencias.advertencia;
  atual.ausenciaJornada = ocorrencias.ausenciaJornada;

  const ocorrenciasOk =
    atual.atraso <= atual.metaAtraso &&
    atual.semUniforme <= atual.metaSemUniforme &&
    atual.semEpi <= atual.metaSemEpi &&
    atual.usoCelular <= atual.metaUsoCelular &&
    atual.falta <= atual.metaFalta &&
    atual.advertencia <= atual.metaAdvertencia &&
    atual.ausenciaJornada <= atual.metaAusenciaJornada;

  atual.status =
    Number(atual.metaContagem || 0) >= 100 &&
    Number(atual.assertividade || 0) >= 85 &&
    Number(atual.tetoGasto || 0) <= 100 &&
    ocorrenciasOk;

let divergencias = [];

try {

  divergencias =
    buscarDivergenciasContagemAlmoxarifado_(
      mesFiltro ||
      mesBuscado
    );

} catch(e) {

  Logger.log(
    "Erro ao buscar divergências: " +
    e.message
  );

  divergencias = [];

}


/*
  Calcula o bônus utilizando a mesma lista
  de divergências que já foi carregada.

  Isso evita consultar a aba Contagens duas vezes.
*/
let bonusAlmoxarifado = null;

try {

  bonusAlmoxarifado =
    calcularBonusAlmoxarifadoCentral(
      mesFiltro,
      divergencias
    );

} catch(e) {

  Logger.log(
    "Erro ao calcular bônus do almoxarifado: " +
    e.message
  );

  bonusAlmoxarifado = {

    ok:
      false,

    status:
      "ERRO",

    mensagem:
      e.message ||
      String(e)

  };

}


return {

  atual:
    atual,

  historico:
    historico.reverse(),

  divergencias:
    divergencias,

  bonusAlmoxarifado:
    bonusAlmoxarifado

};
}

function getDivergenciasContagemAlmoxarifadoCentral(mesFiltro){
  return buscarDivergenciasContagemAlmoxarifado_(mesFiltro);
}

function buscarDivergenciasContagemAlmoxarifado_(
  mesFiltro
){

  const ID_PLANILHA_ALMOXARIFADO =
    "1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI";

  const ABA_CONTAGENS =
    "Contagens";

  const ABA_PRODUTOS =
    "Produtos";

  const ss =
    SpreadsheetApp.openById(
      ID_PLANILHA_ALMOXARIFADO
    );

  const shContagens =
    ss.getSheetByName(
      ABA_CONTAGENS
    );

  const shProdutos =
    ss.getSheetByName(
      ABA_PRODUTOS
    );

  if(!shContagens){
    return [];
  }

  const ultimaLinhaContagens =
    shContagens.getLastRow();

  if(ultimaLinhaContagens < 2){
    return [];
  }

  /*
    Aba Contagens:

    A = ID
    B = MesRef
    C = Data/Hora
    D = Produto ID
    E = Código
    F = Produto
    G = Estoque Sistema
    H = Estoque Contado
    I = Diferença
    J = Responsável
    K = Observações
  */
  const dadosContagens =
    shContagens
      .getRange(
        2,
        1,
        ultimaLinhaContagens - 1,
        11
      )
      .getDisplayValues();

  function normalizarMes(valor){

    if(!valor){
      return "";
    }

    const txt =
      String(
        valor || ""
      ).trim();

    if(
      /^\d{4}-\d{2}$/.test(txt)
    ){
      return txt;
    }

    if(
      /^\d{4}-\d{2}-\d{2}/.test(txt)
    ){
      return txt.slice(
        0,
        7
      );
    }

    if(
      /^\d{2}\/\d{4}$/.test(txt)
    ){

      const partes =
        txt.split("/");

      return (
        partes[1] +
        "-" +
        partes[0]
      );

    }

    if(
      /^\d{2}\/\d{2}\/\d{4}/.test(txt)
    ){

      const partes =
        txt
          .split(" ")[0]
          .split("/");

      return (
        partes[2] +
        "-" +
        partes[1]
      );

    }

    return txt;

  }

  function numero(valor){

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

    let txt =
      String(valor)
        .trim()
        .replace(/\s/g, "")
        .replace(/[^\d,.-]/g, "");

    /*
      Formato brasileiro com vírgula:

      1.250,50
      19,90
    */
    if(txt.includes(",")){

      txt =
        txt
          .replace(/\./g, "")
          .replace(",", ".");

    /*
      Formato de milhar sem vírgula:

      1.000
      10.000
    */
    } else if(
      /^-?\d{1,3}(\.\d{3})+$/.test(
        txt
      )
    ){

      txt =
        txt.replace(/\./g, "");

    }

    const resultado =
      Number(txt);

    return isFinite(resultado)
      ? resultado
      : 0;

  }

  function normalizarCodigo(valor){

    return String(
      valor || ""
    )
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

  }

  /* =====================================================
     CRIAR MAPA DE CUSTOS DA ABA PRODUTOS

     B = Código
     F = Unidade
     I = Valor de custo

     O intervalo B:I possui oito colunas:

     índice 0 = B
     índice 4 = F
     índice 7 = I
  ===================================================== */

  const mapaProdutos = {};

  if(
    shProdutos &&
    shProdutos.getLastRow() >= 2
  ){

    const ultimaLinhaProdutos =
      shProdutos.getLastRow();

    const dadosProdutos =
      shProdutos
        .getRange(
          2,
          2,
          ultimaLinhaProdutos - 1,
          8
        )
        .getValues();

    dadosProdutos.forEach(
      function(linha){

        const codigo =
          normalizarCodigo(
            linha[0]
          );

        if(!codigo){
          return;
        }

        mapaProdutos[codigo] = {

          custoUnitario:
            Math.max(
              0,
              numero(
                linha[7]
              )
            ),

          unidade:
            String(
              linha[4] || ""
            ).trim()

        };

      }
    );

  }

  const mesBuscado =
    normalizarMes(
      mesFiltro ||
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM"
      )
    );

  const resultado = [];

  dadosContagens.forEach(
    function(linha){

      const mesRef =
        normalizarMes(
          linha[1]
        );

      const diferenca =
        numero(
          linha[8]
        );

      if(
        mesRef !== mesBuscado
      ){
        return;
      }

      if(diferenca === 0){
        return;
      }

      const codigoOriginal =
        String(
          linha[4] || ""
        ).trim();

      const codigoNormalizado =
        normalizarCodigo(
          codigoOriginal
        );

      const custoEncontrado =
        Boolean(
          codigoNormalizado
        ) &&
        Object.prototype
          .hasOwnProperty
          .call(
            mapaProdutos,
            codigoNormalizado
          );

      const produtoCadastrado =
        custoEncontrado
          ? mapaProdutos[
              codigoNormalizado
            ]
          : {
              custoUnitario:0,
              unidade:""
            };

      const custoUnitario =
        Number(
          produtoCadastrado
            .custoUnitario || 0
        );

      /*
        Apenas diferença negativa representa
        quantidade faltante e perda financeira.
      */
      const quantidadePerdida =
        diferenca < 0
          ? Math.abs(
              diferenca
            )
          : 0;

      const valorPerda =
        custoEncontrado &&
        quantidadePerdida > 0
          ? (
              quantidadePerdida *
              custoUnitario
            )
          : 0;

      resultado.push({

        id:
          linha[0] || "",

        mesRef:
          mesRef,

        dataHora:
          linha[2] || "",

        produtoId:
          linha[3] || "",

        codigo:
          codigoOriginal,

        produto:
          linha[5] || "",

        estoqueSistema:
          numero(
            linha[6]
          ),

        estoqueContado:
          numero(
            linha[7]
          ),

        diferenca:
          diferenca,

        responsavel:
          linha[9] || "",

        observacoes:
          linha[10] || "",

        unidade:
          produtoCadastrado
            .unidade || "",

        custoEncontrado:
          custoEncontrado,

        custoUnitario:
          Number(
            custoUnitario.toFixed(4)
          ),

        quantidadePerdida:
          Number(
            quantidadePerdida.toFixed(4)
          ),

        valorPerda:
          Number(
            valorPerda.toFixed(2)
          )

      });

    }
  );

  /*
    Mantém a mesma ordenação atual:
    registros mais recentes primeiro.
  */
  return resultado.reverse();

}
function testeAcessoContagensAlmoxarifado(){

  const ss = SpreadsheetApp.openById("1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI");
  const sh = ss.getSheetByName("Contagens");

  Logger.log("Aba encontrada: " + !!sh);
  Logger.log("Última linha: " + sh.getLastRow());

}
function testePingAlmox(){

  Logger.log("INICIOU TESTE");

  const ss = SpreadsheetApp.openById("1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI");

  Logger.log("ABRIU PLANILHA");

  const sh = ss.getSheetByName("Contagens");

  Logger.log("ACHOU ABA: " + !!sh);

  if(sh){
    Logger.log("ULTIMA LINHA: " + sh.getLastRow());
    Logger.log("ULTIMA COLUNA: " + sh.getLastColumn());
  }

}
function testeLerPrimeirasLinhasContagens(){

  const ss = SpreadsheetApp.openById("1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI");
  const sh = ss.getSheetByName("Contagens");

  if(!sh){
    throw new Error('Aba "Contagens" não encontrada.');
  }

  const ultimaLinha = sh.getLastRow();

  Logger.log("ULTIMA LINHA: " + ultimaLinha);

  const qtd = Math.min(5, ultimaLinha);

  const dados = sh.getRange(1, 1, qtd, 11).getDisplayValues();

  Logger.log(JSON.stringify(dados));

}
function testeDivergenciasLeve(){

  const r = buscarDivergenciasContagemAlmoxarifado_("2026-07");

  Logger.log("TOTAL DIVERGÊNCIAS: " + r.length);

}