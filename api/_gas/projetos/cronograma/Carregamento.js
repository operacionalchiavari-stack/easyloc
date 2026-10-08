/****************************************************
 * CONCLUSÃO DO CARREGAMENTO
 ****************************************************/


/****************************************************
 * CONFIGURAÇÕES
 ****************************************************/

const CAR_SPREADSHEET_ID =
  "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ";

const CAR_NOME_ABA =
  "Carregamento_Conclusoes";

const CAR_NOME_ABA_CRONOGRAMA =
  "Cronograma";


/****************************************************
 * CABEÇALHOS
 ****************************************************/

const CAR_CABECALHOS = [

  "ID Registro",
  "ID Etapa",
  "Pedido",
  "Cliente",
  "Data Etapa",
  "Horário",

  "Status",
  "Materiais não carregados",
  "Motivo",

  "Responsável",
  "Perfil",

  "Data",
  "Hora",
  "DataHora"

];


/****************************************************
 * NORMALIZAR TEXTO
 ****************************************************/

function CAR_normalizarTexto_(valor){

  return String(
    valor || ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}


/****************************************************
 * OBTER OU CRIAR ABA
 ****************************************************/

function CAR_obterAba_(){

  const ss =
    SpreadsheetApp.openById(
      CAR_SPREADSHEET_ID
    );

  let aba =
    ss.getSheetByName(
      CAR_NOME_ABA
    );

  if(!aba){

    aba =
      ss.insertSheet(
        CAR_NOME_ABA
      );

    aba
      .getRange(
        1,
        1,
        1,
        CAR_CABECALHOS.length
      )
      .setValues([
        CAR_CABECALHOS
      ]);

    CAR_formatarAba_(
      aba
    );
  }

  return aba;
}


/****************************************************
 * FORMATAR ABA
 ****************************************************/

function CAR_formatarAba_(aba){

  aba.setFrozenRows(1);

  aba
    .getRange(
      1,
      1,
      1,
      CAR_CABECALHOS.length
    )
    .setFontWeight("bold")
    .setBackground("#0B1F3A")
    .setFontColor("#FFFFFF")
    .setHorizontalAlignment("center");

  aba
    .getRange("E:E")
    .setNumberFormat(
      "dd/MM/yyyy"
    );

  aba
    .getRange("L:L")
    .setNumberFormat(
      "dd/MM/yyyy"
    );

  aba
    .getRange("N:N")
    .setNumberFormat(
      "dd/MM/yyyy HH:mm:ss"
    );

  aba.autoResizeColumns(
    1,
    CAR_CABECALHOS.length
  );

  aba.setColumnWidth(
    8,
    280
  );

  aba.setColumnWidth(
    9,
    280
  );
}


/****************************************************
 * CRIAR ABA MANUALMENTE
 *
 * Opcional.
 * A aba também será criada automaticamente
 * no primeiro salvamento.
 ****************************************************/

function configurarConclusoesCarregamento(){

  const aba =
    CAR_obterAba_();

  return {

    sucesso: true,

    aba:
      aba.getName(),

    colunas:
      CAR_CABECALHOS.length
  };
}


/****************************************************
 * VALIDAR TOKEN DA EXPEDIÇÃO
 ****************************************************/

function CAR_validarAcessoExpedicao_(
  token
){

  const sessao =
    AUD_validarTokenSessao_(
      token
    );

  if(!sessao){

    throw new Error(
      "Sua autorização expirou. Digite novamente a senha da Expedição."
    );
  }

  const perfil =
    CAR_normalizarTexto_(
      sessao.perfil
    );

  if(perfil !== "expedicao"){

    throw new Error(
      "Somente a Expedição pode concluir o carregamento."
    );
  }

  return sessao;
}


/****************************************************
 * BUSCAR ETAPA NO CRONOGRAMA
 ****************************************************/

function CAR_buscarEtapaCronograma_(
  idEtapa
){

  const id =
    String(
      idEtapa || ""
    ).trim();

  if(!id){

    throw new Error(
      "O ID da etapa não foi informado."
    );
  }

  const aba =
    SpreadsheetApp
      .openById(
        CAR_SPREADSHEET_ID
      )
      .getSheetByName(
        CAR_NOME_ABA_CRONOGRAMA
      );

  if(!aba){

    throw new Error(
      'A aba "Cronograma" não foi encontrada.'
    );
  }

  const dados =
    aba
      .getDataRange()
      .getDisplayValues();

  for(let i = 1; i < dados.length; i++){

    const idLinha =
      String(
        dados[i][0] || ""
      ).trim();

    if(idLinha !== id){
      continue;
    }

    const etapa =
      String(
        dados[i][5] || ""
      ).trim();

    if(
      !CAR_normalizarTexto_(
        etapa
      ).includes(
        "carregamento"
      )
    ){

      throw new Error(
        "A etapa informada não é uma etapa de carregamento."
      );
    }

    return {

      idEtapa:
        idLinha,

      pedido:
        String(
          dados[i][1] || ""
        ).trim(),

      cliente:
        String(
          dados[i][3] || ""
        ).trim(),

      etapa:
        etapa,

      dataEtapa:
        String(
          dados[i][6] || ""
        ).trim(),

      horario:
        String(
          dados[i][7] || ""
        ).trim()
    };
  }

  throw new Error(
    "A etapa de carregamento não foi encontrada no cronograma."
  );
}


/****************************************************
 * LOCALIZAR REGISTRO EXISTENTE
 ****************************************************/

function CAR_localizarLinhaPorEtapa_(
  aba,
  idEtapa
){

  const ultimaLinha =
    aba.getLastRow();

  if(ultimaLinha < 2){
    return -1;
  }

  const ids =
    aba
      .getRange(
        2,
        2,
        ultimaLinha - 1,
        1
      )
      .getDisplayValues();

  const idBuscado =
    String(
      idEtapa || ""
    ).trim();

  for(let i = 0; i < ids.length; i++){

    const idLinha =
      String(
        ids[i][0] || ""
      ).trim();

    if(idLinha === idBuscado){

      return i + 2;
    }
  }

  return -1;
}


/****************************************************
 * SALVAR CONCLUSÃO
 ****************************************************/

function salvarConclusaoCarregamento(
  payload
){

  payload =
    payload || {};

  const sessao =
    CAR_validarAcessoExpedicao_(
      payload.token
    );

  const etapaCronograma =
    CAR_buscarEtapaCronograma_(
      payload.idEtapa
    );

  const status =
    String(
      payload.status || ""
    )
      .trim()
      .toUpperCase();

  const statusPermitidos = [
    "CONCLUIDO",
    "COM_PENDENCIAS"
  ];

  if(
    !statusPermitidos.includes(
      status
    )
  ){

    return {

      sucesso: false,

      mensagem:
        "Selecione uma situação válida para o carregamento."
    };
  }

  const materiais =
    String(
      payload.materiais || ""
    ).trim();

  const motivo =
    String(
      payload.motivo || ""
    ).trim();

  if(
    status === "COM_PENDENCIAS" &&
    !materiais
  ){

    return {

      sucesso: false,

      mensagem:
        "Informe os materiais que não foram carregados."
    };
  }

  if(
    status === "COM_PENDENCIAS" &&
    !motivo
  ){

    return {

      sucesso: false,

      mensagem:
        "Informe o motivo da pendência."
    };
  }

  const agora =
    new Date();

  const dataRegistro =
    new Date(
      agora.getFullYear(),
      agora.getMonth(),
      agora.getDate()
    );

  const horaRegistro =
    Utilities.formatDate(
      agora,
      Session.getScriptTimeZone(),
      "HH:mm:ss"
    );

  const lock =
    LockService.getScriptLock();

  try{

    lock.waitLock(
      15000
    );

    const aba =
      CAR_obterAba_();

    const linhaExistente =
      CAR_localizarLinhaPorEtapa_(
        aba,
        etapaCronograma.idEtapa
      );

    let idRegistro = "";

    if(linhaExistente > 0){

      idRegistro =
        String(
          aba
            .getRange(
              linhaExistente,
              1
            )
            .getValue() || ""
        ).trim();

    }else{

      idRegistro =
        "CAR_" +
        agora.getTime() +
        "_" +
        Utilities
          .getUuid()
          .substring(
            0,
            8
          );
    }

    const linha = [[

      // A — ID Registro
      idRegistro,

      // B — ID Etapa
      etapaCronograma.idEtapa,

      // C — Pedido
      etapaCronograma.pedido,

      // D — Cliente
      etapaCronograma.cliente,

      // E — Data Etapa
      etapaCronograma.dataEtapa,

      // F — Horário
      etapaCronograma.horario,

      // G — Status
      status,

      // H — Materiais
      status === "COM_PENDENCIAS"
        ? materiais
        : "",

      // I — Motivo
      status === "COM_PENDENCIAS"
        ? motivo
        : "",

      // J — Responsável
      sessao.usuario,

      // K — Perfil
      sessao.perfil,

      // L — Data
      dataRegistro,

      // M — Hora
      horaRegistro,

      // N — DataHora
      agora
    ]];

    if(linhaExistente > 0){

      aba
        .getRange(
          linhaExistente,
          1,
          1,
          CAR_CABECALHOS.length
        )
        .setValues(
          linha
        );

    }else{

      aba
        .getRange(
          aba.getLastRow() + 1,
          1,
          1,
          CAR_CABECALHOS.length
        )
        .setValues(
          linha
        );
    }

    SpreadsheetApp.flush();

    return {

      sucesso: true,

      mensagem:
        status === "COM_PENDENCIAS"

          ? "Carregamento registrado com pendências."

          : "Carregamento concluído com sucesso.",

      carregamento: {

        status:
          status,

        materiais:
          status === "COM_PENDENCIAS"
            ? materiais
            : "",

        motivo:
          status === "COM_PENDENCIAS"
            ? motivo
            : "",

        usuario:
          sessao.usuario,

        perfil:
          sessao.perfil,

        dataHora:
          Utilities.formatDate(
            agora,
            Session.getScriptTimeZone(),
            "dd/MM/yyyy HH:mm:ss"
          )
      }
    };

  }finally{

    lock.releaseLock();
  }
}


/****************************************************
 * BUSCAR MAPA DE CONCLUSÕES
 *
 * Retorna:
 *
 * {
 *   "ID_ETAPA": {
 *     status,
 *     materiais,
 *     motivo,
 *     usuario,
 *     perfil,
 *     dataHora
 *   }
 * }
 ****************************************************/

function CAR_buscarMapaConclusoes_(){

  const aba =
    CAR_obterAba_();

  const ultimaLinha =
    aba.getLastRow();

  if(ultimaLinha < 2){
    return {};
  }

  const dados =
    aba
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        CAR_CABECALHOS.length
      )
      .getValues();

  const mapa = {};

  dados.forEach(function(linha){

    const idEtapa =
      String(
        linha[1] || ""
      ).trim();

    if(!idEtapa){
      return;
    }

    let dataHora = "";

    if(
      linha[13] instanceof Date &&
      !isNaN(
        linha[13].getTime()
      )
    ){

      dataHora =
        Utilities.formatDate(
          linha[13],
          Session.getScriptTimeZone(),
          "dd/MM/yyyy HH:mm:ss"
        );

    }else{

      dataHora =
        String(
          linha[13] || ""
        ).trim();
    }

    mapa[idEtapa] = {

      status:
        String(
          linha[6] || ""
        ).trim(),

      materiais:
        String(
          linha[7] || ""
        ).trim(),

      motivo:
        String(
          linha[8] || ""
        ).trim(),

      usuario:
        String(
          linha[9] || ""
        ).trim(),

      perfil:
        String(
          linha[10] || ""
        ).trim(),

      dataHora:
        dataHora
    };
  });

  return mapa;
}


/****************************************************
 * BUSCAR UM REGISTRO
 ****************************************************/

function buscarConclusaoCarregamento(
  idEtapa
){

  const mapa =
    CAR_buscarMapaConclusoes_();

  return (
    mapa[
      String(
        idEtapa || ""
      ).trim()
    ] ||
    null
  );
}