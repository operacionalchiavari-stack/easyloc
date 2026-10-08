function doGet() {
  return HtmlService.createHtmlOutputFromFile('RH')
    .setTitle('Registro RH')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* =========================
   CONFIGURAÇÕES
========================= */

const ID_PLANILHA =
  '1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo';

const ABA_OCORRENCIAS = 'OcorrenciasRH';
const ABA_FUNCIONARIOS = 'Funcionarios';

const CABECALHO_OCORRENCIAS = [
  'ID',
  'Data Ocorrencia',
  'Hora Ocorrencia',
  'Nome',
  'Sobrenome',
  'Setor',
  'Tipo',
  'Observacao',
  'Responsavel',
  'Data Registro',
  'Hora Registro'
];

const CABECALHO_FUNCIONARIOS = [
  "Nome",
  "Sobrenome",
  "CPF",
  "Setor",
  "Cargo",
  "Salário Bruto",
  "Data de Admissão",
  "Status"
];


/* =========================
   INICIAR SISTEMA
========================= */

function iniciarSistemaRH() {

  const ss = SpreadsheetApp.openById(ID_PLANILHA);

  let sh = ss.getSheetByName(ABA_OCORRENCIAS);

  if (!sh) {
    sh = ss.insertSheet(ABA_OCORRENCIAS);
  }

  // Atualiza somente o cabeçalho.
  // Os registros existentes não serão apagados.
  sh.getRange(
    1,
    1,
    1,
    CABECALHO_OCORRENCIAS.length
  ).setValues([CABECALHO_OCORRENCIAS]);


  let shFunc = ss.getSheetByName(ABA_FUNCIONARIOS);

  if (!shFunc) {
    shFunc = ss.insertSheet(ABA_FUNCIONARIOS);
  }

  shFunc.getRange(
    1,
    1,
    1,
    CABECALHO_FUNCIONARIOS.length
  ).setValues([CABECALHO_FUNCIONARIOS]);

  return true;
}


/* =========================
   FUNCIONÁRIOS
========================= */

function getFuncionarios(){

  const ss =
    SpreadsheetApp.openById(
      ID_PLANILHA
    );

  const sh =
    ss.getSheetByName(
      ABA_FUNCIONARIOS
    );

  if(!sh){
    return [];
  }

  const dados =
    sh.getDataRange().getValues();

  const lista = [];

  for(let i = 1; i < dados.length; i++){

    const nome =
      String(dados[i][0] || "").trim();

    const sobrenome =
      String(dados[i][1] || "").trim();

    const cpf =
      String(dados[i][2] || "").trim();

    const setor =
      String(dados[i][3] || "").trim();

    const cargo =
      String(dados[i][4] || "").trim();

    const status =
      String(dados[i][7] || "Ativo")
        .trim()
        .toLowerCase();

    if(!nome){
      continue;
    }

    if(status === "inativo"){
      continue;
    }

    lista.push({

      nomeCompleto: [
        nome,
        sobrenome
      ]
        .filter(Boolean)
        .join(" "),

      cpf: cpf,
      setor: setor,
      cargo: cargo
    });
  }

  return lista;
}
/* =========================
   SALVAR LOTE DE OCORRÊNCIAS
========================= */

function salvarLoteRH(lote) {

  if (!Array.isArray(lote) || lote.length === 0) {
    throw new Error('Nenhuma ocorrência foi enviada.');
  }

  const ss = SpreadsheetApp.openById(ID_PLANILHA);

  let sh = ss.getSheetByName(ABA_OCORRENCIAS);

  if (!sh) {
    iniciarSistemaRH();
    sh = ss.getSheetByName(ABA_OCORRENCIAS);
  }

  const agora = new Date();
  const fusoHorario = Session.getScriptTimeZone();

  // Momento em que o RH fez o lançamento no sistema.
  const dataRegistro = Utilities.formatDate(
    agora,
    fusoHorario,
    'dd/MM/yyyy'
  );

  const horaRegistro = Utilities.formatDate(
    agora,
    fusoHorario,
    'HH:mm:ss'
  );

  const linhas = lote.map(function(item) {

    const funcionario =
      String(item.funcionario || '').trim();

    const dataOcorrencia =
      formatarDataOcorrencia_(item.dataOcorrencia);

    const horaOcorrencia =
      formatarHoraOcorrencia_(item.horaOcorrencia);

    if (!funcionario) {
      throw new Error(
        'Existe uma ocorrência sem funcionário informado.'
      );
    }

    if (!dataOcorrencia) {
      throw new Error(
        'Informe a data em que a ocorrência aconteceu.'
      );
    }

    const partesNome =
      funcionario.split(/\s+/);

    const nome =
      partesNome.shift() || '';

    const sobrenome =
      partesNome.join(' ');

    return [
      Utilities.getUuid(),

      // Data real da ocorrência
      dataOcorrencia,

      // Hora real da ocorrência
      horaOcorrencia,

      nome,
      sobrenome,

      String(item.setor || '').trim(),
      String(item.tipo || '').trim(),
      String(item.observacao || '').trim(),
      String(item.responsavel || '').trim(),

      // Data e hora em que foi lançado no sistema
      dataRegistro,
      horaRegistro
    ];
  });

  sh.getRange(
    sh.getLastRow() + 1,
    1,
    linhas.length,
    CABECALHO_OCORRENCIAS.length
  ).setValues(linhas);

  return true;
}


/* =========================
   FORMATAR DATA DA OCORRÊNCIA
========================= */

function formatarDataOcorrencia_(valor) {

  if (!valor) {
    return '';
  }

  if (
    Object.prototype.toString.call(valor) ===
    '[object Date]'
  ) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      'dd/MM/yyyy'
    );
  }

  const texto = String(valor).trim();

  // Já está no formato brasileiro
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    return texto;
  }

  // Formato enviado pelo input type="date":
  // AAAA-MM-DD
  const formatoISO =
    texto.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (formatoISO) {
    return (
      formatoISO[3] +
      '/' +
      formatoISO[2] +
      '/' +
      formatoISO[1]
    );
  }

  return texto;
}


/* =========================
   FORMATAR HORA DA OCORRÊNCIA
========================= */

function formatarHoraOcorrencia_(valor) {

  if (!valor) {
    return '';
  }

  const texto = String(valor).trim();

  // Aceita HH:mm ou HH:mm:ss
  const horario =
    texto.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);

  if (!horario) {
    return texto;
  }

  if (horario[3]) {
    return (
      horario[1] +
      ':' +
      horario[2] +
      ':' +
      horario[3]
    );
  }

  return horario[1] + ':' + horario[2];
}


/* =========================
   HISTÓRICO DE OCORRÊNCIAS
========================= */

function getHistoricoRH() {

  const ss = SpreadsheetApp.openById(ID_PLANILHA);

  const sh = ss.getSheetByName(ABA_OCORRENCIAS);

  if (!sh || sh.getLastRow() <= 1) {
    return [];
  }

  const dados =
    sh.getDataRange().getDisplayValues();

  const lista = [];

  // Mantém os últimos lançamentos primeiro.
  for (let i = dados.length - 1; i >= 1; i--) {

    const linha = dados[i];

    const id =
      String(linha[0] || '').trim();

    const dataOcorrencia =
      String(linha[1] || '').trim();

    const horaOcorrencia =
      String(linha[2] || '').trim();

    const nome =
      String(linha[3] || '').trim();

    const sobrenome =
      String(linha[4] || '').trim();

    const setor =
      String(linha[5] || '').trim();

    const tipo =
      String(linha[6] || '').trim();

    const observacao =
      String(linha[7] || '').trim();

    const responsavel =
      String(linha[8] || '').trim();

    /*
      Para registros antigos, as colunas J e K
      podem estar vazias.

      Nesse caso, utiliza a antiga data e hora
      como data e hora do registro.
    */
    const dataRegistro =
      String(linha[9] || dataOcorrencia).trim();

    const horaRegistro =
      String(linha[10] || horaOcorrencia).trim();

    if (
      !id &&
      !dataOcorrencia &&
      !nome &&
      !sobrenome
    ) {
      continue;
    }

    lista.push({
      id: id,

      // Mantém compatibilidade com o HTML atual
      data: dataOcorrencia,
      hora: horaOcorrencia,

      // Novos nomes mais específicos
      dataOcorrencia: dataOcorrencia,
      horaOcorrencia: horaOcorrencia,

      funcionario: [nome, sobrenome]
        .filter(Boolean)
        .join(' '),

      setor: setor,
      tipo: tipo,
      observacao: observacao,
      responsavel: responsavel,

      // Auditoria
      dataRegistro: dataRegistro,
      horaRegistro: horaRegistro
    });
  }

  return JSON.parse(JSON.stringify(lista));
}


/* =========================
   SALVAR FUNCIONÁRIO
========================= */

function salvarFuncionarioRH(
  nome,
  sobrenome,
  cpf,
  setor,
  cargo,
  salarioBruto,
  dataAdmissao,
  status
){

  const ss =
    SpreadsheetApp.openById(
      ID_PLANILHA
    );

  let sh =
    ss.getSheetByName(
      ABA_FUNCIONARIOS
    );

  if(!sh){

    iniciarSistemaRH();

    sh =
      ss.getSheetByName(
        ABA_FUNCIONARIOS
      );
  }

  nome =
    String(nome || "").trim();

  sobrenome =
    String(sobrenome || "").trim();

  cpf =
    String(cpf || "").trim();

  setor =
    String(setor || "").trim();

  cargo =
    String(cargo || "").trim();

  salarioBruto =
    Number(salarioBruto || 0);

  status =
    String(status || "Ativo").trim();

  if(
    !nome ||
    !sobrenome ||
    !cpf ||
    !setor ||
    !cargo ||
    salarioBruto <= 0 ||
    !dataAdmissao
  ){

    throw new Error(
      "Preencha todos os dados do funcionário."
    );
  }

  /*
    Impede CPF duplicado.
  */
  const ultimaLinha =
    sh.getLastRow();

  if(ultimaLinha >= 2){

    const cpfsExistentes =
      sh.getRange(
        2,
        3,
        ultimaLinha - 1,
        1
      )
      .getDisplayValues()
      .flat()
      .map(function(valor){

        return String(valor || "")
          .replace(/\D/g, "");

      });

    const cpfNovo =
      cpf.replace(/\D/g, "");

    if(cpfsExistentes.includes(cpfNovo)){

      throw new Error(
        "Já existe um funcionário cadastrado com este CPF."
      );
    }
  }

  const partesData =
    String(dataAdmissao).split("-");

  const dataAdmissaoPlanilha =
    partesData.length === 3
      ? new Date(
          Number(partesData[0]),
          Number(partesData[1]) - 1,
          Number(partesData[2])
        )
      : dataAdmissao;

  sh.appendRow([
    nome,
    sobrenome,
    cpf,
    setor,
    cargo,
    salarioBruto,
    dataAdmissaoPlanilha,
    status
  ]);

  const linhaNova =
    sh.getLastRow();

  /*
    Formata o salário como moeda.
  */
  sh.getRange(
    linhaNova,
    6
  ).setNumberFormat(
    'R$ #,##0.00'
  );

  /*
    Formata a data de admissão.
  */
  sh.getRange(
    linhaNova,
    7
  ).setNumberFormat(
    "dd/MM/yyyy"
  );

  return true;
}
/* =========================
   VALIDAR SENHA DO RH
========================= */

function validarSenhaRH(senhaDigitada) {

  const ss = SpreadsheetApp.openById(
    '133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk'
  );

  const sh = ss.getSheetByName('Senhas');

  if (!sh) {
    throw new Error('Aba Senhas não encontrada.');
  }

  const dados =
    sh.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {

    const setor = String(dados[i][0] || '')
      .trim()
      .toLowerCase();

    const senha = String(dados[i][1] || '')
      .trim();

    if (setor === 'rh') {
      return (
        senha ===
        String(senhaDigitada || '').trim()
      );
    }
  }

  return false;
}
function listarFuncionariosRHCompleto(){

  const ss =
    SpreadsheetApp.openById(
      ID_PLANILHA
    );

  const sh =
    ss.getSheetByName(
      ABA_FUNCIONARIOS
    );

  if(!sh || sh.getLastRow() <= 1){
    return [];
  }

  const dados =
    sh.getRange(
      2,
      1,
      sh.getLastRow() - 1,
      8
    ).getValues();

  const fuso =
    Session.getScriptTimeZone();

  const lista =
    dados.map(function(linha){

      const nome =
        String(linha[0] || "").trim();

      const sobrenome =
        String(linha[1] || "").trim();

      let dataAdmissao = "";

      if(linha[6] instanceof Date){

        dataAdmissao =
          Utilities.formatDate(
            linha[6],
            fuso,
            "yyyy-MM-dd"
          );

      } else {

        dataAdmissao =
          converterDataParaInputRH_(
            linha[6]
          );
      }

      return {
        nome: nome,
        sobrenome: sobrenome,

        nomeCompleto: [
          nome,
          sobrenome
        ]
          .filter(Boolean)
          .join(" "),

        cpf:
          String(linha[2] || "").trim(),

        setor:
          String(linha[3] || "").trim(),

        cargo:
          String(linha[4] || "").trim(),

        salarioBruto:
          Number(linha[5] || 0),

        dataAdmissao:
          dataAdmissao,

        status:
          String(
            linha[7] || "Ativo"
          ).trim()
      };

    })
    .filter(function(funcionario){

      return funcionario.nome;
    })
    .sort(function(a, b){

      return a.nomeCompleto.localeCompare(
        b.nomeCompleto,
        "pt-BR"
      );
    });

  return JSON.parse(
    JSON.stringify(lista)
  );
}
function atualizarFuncionarioRH(
  cpfOriginal,
  nome,
  sobrenome,
  cpf,
  setor,
  cargo,
  salarioBruto,
  dataAdmissao,
  status
){

  const ss =
    SpreadsheetApp.openById(
      ID_PLANILHA
    );

  const sh =
    ss.getSheetByName(
      ABA_FUNCIONARIOS
    );

  if(!sh){
    throw new Error(
      "Aba de funcionários não encontrada."
    );
  }

  nome =
    String(nome || "").trim();

  sobrenome =
    String(sobrenome || "").trim();

  cpf =
    String(cpf || "").trim();

  setor =
    String(setor || "").trim();

  cargo =
    String(cargo || "").trim();

  salarioBruto =
    Number(salarioBruto || 0);

  status =
    String(status || "Ativo").trim();

  if(
    !nome ||
    !sobrenome ||
    !cpf ||
    !setor ||
    !cargo ||
    salarioBruto <= 0 ||
    !dataAdmissao
  ){
    throw new Error(
      "Preencha todos os dados do funcionário."
    );
  }

  const cpfOriginalLimpo =
    normalizarCPFRH_(cpfOriginal);

  const cpfNovoLimpo =
    normalizarCPFRH_(cpf);

  const ultimaLinha =
    sh.getLastRow();

  if(ultimaLinha <= 1){
    throw new Error(
      "Funcionário não encontrado."
    );
  }

  const cpfs =
    sh.getRange(
      2,
      3,
      ultimaLinha - 1,
      1
    ).getDisplayValues();

  let linhaEncontrada = -1;

  for(let i = 0; i < cpfs.length; i++){

    const cpfLinha =
      normalizarCPFRH_(
        cpfs[i][0]
      );

    if(cpfLinha === cpfOriginalLimpo){

      linhaEncontrada =
        i + 2;

      continue;
    }

    if(
      cpfLinha &&
      cpfLinha === cpfNovoLimpo
    ){
      throw new Error(
        "Já existe outro funcionário com este CPF."
      );
    }
  }

  if(linhaEncontrada === -1){

    throw new Error(
      "Funcionário não encontrado para edição."
    );
  }

  const dataPlanilha =
    converterDataFuncionarioRH_(
      dataAdmissao
    );

  sh.getRange(
    linhaEncontrada,
    1,
    1,
    8
  ).setValues([[
    nome,
    sobrenome,
    cpfNovoLimpo,
    setor,
    cargo,
    salarioBruto,
    dataPlanilha,
    status
  ]]);

  sh.getRange(
    linhaEncontrada,
    3
  ).setNumberFormat("@");

  sh.getRange(
    linhaEncontrada,
    6
  ).setNumberFormat(
    'R$ #,##0.00'
  );

  sh.getRange(
    linhaEncontrada,
    7
  ).setNumberFormat(
    "dd/MM/yyyy"
  );

  return true;
}
function normalizarCPFRH_(cpf){

  return String(cpf || "")
    .replace(/\D/g, "");
}


function converterDataFuncionarioRH_(valor){

  const texto =
    String(valor || "").trim();

  const partes =
    texto.split("-");

  if(partes.length !== 3){
    throw new Error(
      "Data de admissão inválida."
    );
  }

  return new Date(
    Number(partes[0]),
    Number(partes[1]) - 1,
    Number(partes[2])
  );
}


function converterDataParaInputRH_(valor){

  if(!valor){
    return "";
  }

  const texto =
    String(valor).trim();

  if(/^\d{4}-\d{2}-\d{2}$/.test(texto)){
    return texto;
  }

  if(/^\d{2}\/\d{2}\/\d{4}$/.test(texto)){

    const partes =
      texto.split("/");

    return (
      partes[2] +
      "-" +
      partes[1] +
      "-" +
      partes[0]
    );
  }

  return "";
}