/****************************************************
 * CONFIG
 ****************************************************/
const NOME_ABA = "Cronograma";

/****************************************************
 * DO GET
 ****************************************************/
function doGet(e) {

  const params =
    e && e.parameter
      ? e.parameter
      : {};


  /****************************************************
   * 🔥 OPERAÇÃO DE MONTAGEM / DESMONTAGEM
   * Agora fica dentro do App do Montador (app_montador.html).
   * Links antigos continuam funcionando:
   * ?operacao=montagem&id=123  /  ?operacao=desmontagem&id=123
   ****************************************************/
  if (
    params.operacao === "montagem" ||
    params.operacao === "desmontagem"
  ) {
    return MONT_paginaApp_();
  }


  /****************************************************
   * 🔥 CONTROLE DE PÁGINAS DO PORTAL
   ****************************************************/
  const page = String(params.page || "index")
    .toLowerCase()
    .trim();


  switch (page) {

    /****************************************************
     * 🔥 APP DOS FREELANCERS (vagas e confirmação)
     * Arquivo HTML:
     * app_free.html
     ****************************************************/
    case "free":
    case "vagas":
    case "equipe-free":

      return HtmlService
        .createHtmlOutputFromFile("app_free")
        .setTitle("Vagas Free")
        .setXFrameOptionsMode(
          HtmlService.XFrameOptionsMode.ALLOWALL
        )
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");


    /****************************************************
     * 🔥 QR CODE DE PRESENÇA (celular do líder)
     * Arquivo HTML:
     * free_qr.html
     ****************************************************/
    /****************************************************
     * 🔥 APP DO MONTADOR
     * Arquivo HTML:
     * app_montador.html
     ****************************************************/
    case "montador":
    case "montagens":
      return MONT_paginaApp_();


    /****************************************************
     * 🔥 PAINEL DA RH (sem acesso pelo cronograma)
     * Arquivo HTML:
     * app_rh.html
     ****************************************************/
    case "rh":
      return HtmlService
        .createHtmlOutputFromFile("app_rh")
        .setTitle("RH · Equipe Free")
        .setXFrameOptionsMode(
          HtmlService.XFrameOptionsMode.ALLOWALL
        )
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");


    case "free-qr":

      return HtmlService
        .createHtmlOutputFromFile("free_qr")
        .setTitle("QR de presença")
        .setXFrameOptionsMode(
          HtmlService.XFrameOptionsMode.ALLOWALL
        )
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");


    /****************************************************
     * 🔥 CENTRAL DE RESPOSTAS DA MONTAGEM
     * Arquivo HTML:
     * CentralRespostasMontagem.html
     ****************************************************/
    case "central-montagem":
    case "central_montagem":
    case "central-respostas-montagem":
    case "central_respostas_montagem":

      return HtmlService
        .createHtmlOutputFromFile("CentralRespostasMontagem")
        .setTitle("Central de Respostas da Montagem")
        .setXFrameOptionsMode(
          HtmlService.XFrameOptionsMode.ALLOWALL
        )
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");


    /****************************************************
     * 🔥 PAINEL PRINCIPAL
     ****************************************************/
    case "painel":
    case "portal":
    case "index":
    default:

      return HtmlService
        .createHtmlOutputFromFile("index")
        .setTitle("Portal Operacional")
        .setXFrameOptionsMode(
          HtmlService.XFrameOptionsMode.ALLOWALL
        )
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");

  }

}


/****************************************************
 * URL ATUAL DO WEB APP
 ****************************************************/
function MONT_paginaApp_(){

  return HtmlService
    .createHtmlOutputFromFile("app_montador")
    .setTitle("App do Montador")
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    )
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");

}


function getWebAppUrl(){

  return ScriptApp
    .getService()
    .getUrl();

}


/****************************************************
 * FECHAMENTO SEMANAL DOS INDICADORES DO CRONOGRAMA
 ****************************************************/

const FECH_ID_PLANILHA_CRONOGRAMA =
  "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ";

const FECH_ABA_HISTORICO =
  "Historico Indicadores";


/****************************************************
 * CRIA O TRIGGER
 *
 * EXECUTAR MANUALMENTE APENAS UMA VEZ
 ****************************************************/
function FECH_criarTriggerSemanal(){

  const nomeFuncao =
    "FECH_registrarIndicadoresSemana";


  /*
   * Remove trigger antigo desta mesma função
   * para evitar duplicidade.
   */
  ScriptApp
    .getProjectTriggers()
    .forEach(function(trigger){

      if(
        trigger.getHandlerFunction() ===
        nomeFuncao
      ){

        ScriptApp.deleteTrigger(
          trigger
        );

      }

    });


  /*
   * O Apps Script não garante minuto exato.
   *
   * Programamos próximo de 23:15.
   * A janela fica aproximadamente
   * entre 23:00 e 23:30.
   *
   * O cálculo, porém, usa 23:00
   * como horário oficial do fechamento.
   */
  ScriptApp
    .newTrigger(nomeFuncao)
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(
      ScriptApp.WeekDay.MONDAY
    )
    .atHour(23)
    .nearMinute(15)
    .inTimezone(
      Session.getScriptTimeZone()
    )
    .create();


  return (
    "Trigger criado com sucesso. " +
    "Fechamento: segunda-feira às 23:00."
  );

}


/****************************************************
 * FUNÇÃO EXECUTADA AUTOMATICAMENTE
 ****************************************************/
function FECH_registrarIndicadoresSemana(){

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);


  try{

    const agora =
      new Date();


    /*
     * Nossa semana operacional:
     *
     * TERÇA → SEGUNDA
     */
    const inicioSemana =
      FECH_obterInicioSemanaOperacional_(
        agora
      );


    const fimSemana =
      new Date(inicioSemana);

    fimSemana.setDate(
      fimSemana.getDate() + 6
    );


    /*
     * Horário oficial do fechamento:
     * segunda-feira às 23:00.
     */
    const referenciaOficial =
      new Date(fimSemana);

    referenciaOficial.setHours(
      23,
      0,
      0,
      0
    );


    /*
     * Se rodarmos manualmente antes das 23h,
     * usa o horário atual para permitir teste.
     *
     * Quando o trigger executar após as 23h,
     * congela a referência exatamente em 23:00.
     */
    const referenciaCalculo =
      agora.getTime() <
      referenciaOficial.getTime()

        ? agora

        : referenciaOficial;


    const inicioSemanaISO =
      FECH_formatarISO_(
        inicioSemana
      );


    const resultado =
      FECH_calcularIndicadoresSemana_(
        inicioSemanaISO,
        referenciaCalculo
      );


    /*
     * ALTERAÇÕES DO CRONOGRAMA
     */
    let totalAlteracoes = 0;


    if(
      typeof
        getQuantidadeAlteracoesCronogramaSemana
        === "function"
    ){

      totalAlteracoes =
        Number(
          getQuantidadeAlteracoesCronogramaSemana(
            inicioSemanaISO
          )
        ) || 0;

    }


    resultado.alteracoes =
      totalAlteracoes;


    const aba =
      FECH_obterAbaHistorico_();


    const tz =
      Session.getScriptTimeZone();


    const semanaTexto =
      Utilities.formatDate(
        inicioSemana,
        tz,
        "dd/MM/yyyy"
      ) +
      " a " +
      Utilities.formatDate(
        fimSemana,
        tz,
        "dd/MM/yyyy"
      );


    const resultadoChegadas =
      resultado.chegadasAtrasadas +
      " de " +
      resultado.totalEtapas;


    const resultadoSacolas =
      resultado.semFotoSacolas +
      " de " +
      resultado.totalEventos;


    const resultadoUniforme =
      resultado.equipeNaoUniformizada +
      " de " +
      resultado.totalEtapas;


    const resultadoListas =
      resultado.listasPendentes +
      " de " +
      resultado.totalEventos;


    const linha = [

      // A
      inicioSemanaISO,

      // B
      FECH_formatarISO_(
        fimSemana
      ),

      // C
      semanaTexto,

      // D
      referenciaCalculo,

      // E
      agora,

      // F
      resultado.chegadasAtrasadas,

      // G
      resultado.totalEtapas,

      // H
      resultadoChegadas,

      // I
      resultado.semFotoSacolas,

      // J
      resultado.totalEventos,

      // K
      resultadoSacolas,

      // L
      resultado.equipeNaoUniformizada,

      // M
      resultadoUniforme,

      // N
      resultado.listasPendentes,

      // O
      resultadoListas,

      // P
      resultado.alteracoes

    ];


    /*
     * Se essa semana já foi gravada,
     * ATUALIZA.
     *
     * Não cria linha duplicada.
     */
    FECH_salvarOuAtualizarSemana_(
      aba,
      inicioSemanaISO,
      linha
    );


    return {

      sucesso: true,

      semana:
        semanaTexto,

      chegadas:
        resultadoChegadas,

      sacolas:
        resultadoSacolas,

      uniforme:
        resultadoUniforme,

      listas:
        resultadoListas,

      alteracoes:
        resultado.alteracoes

    };


  }finally{

    lock.releaseLock();

  }

}


/****************************************************
 * CALCULA OS INDICADORES
 ****************************************************/
function FECH_calcularIndicadoresSemana_(
  inicioSemanaISO,
  referenciaCalculo
){

  const pedidos =
    getCronogramaSemana(
      inicioSemanaISO
    ) || [];


  const inicioSemana =
    FECH_parseData_(
      inicioSemanaISO
    );


  const fimSemana =
    new Date(inicioSemana);

  fimSemana.setDate(
    fimSemana.getDate() + 6
  );

  fimSemana.setHours(
    23,
    59,
    59,
    999
  );


  let chegadasAtrasadas = 0;
  let equipeNaoUniformizada = 0;

  let semFotoSacolas = 0;
  let listasPendentes = 0;

  let totalEtapas = 0;
  let totalEventos = 0;


  pedidos.forEach(function(pedido){

    const etapas =
      Array.isArray(pedido.etapas)
        ? pedido.etapas
        : [];


    /*
     * =========================================
     * PRIMEIRA MONTAGEM DO EVENTO
     * =========================================
     */
    const montagensEvento =
      etapas
        .filter(function(etapa){

          const nome =
            String(
              etapa.etapa || ""
            )
              .toLowerCase()
              .trim();


          if(nome !== "montagem"){
            return false;
          }


          return FECH_etapaEstaNaSemana_(
            etapa,
            inicioSemana,
            fimSemana
          );

        })
        .sort(function(a,b){

          const dataA =
            FECH_combinarDataHora_(
              a.dataEtapa ||
              a.data ||
              "",
              a.horario ||
              a.hora ||
              "23:59"
            );


          const dataB =
            FECH_combinarDataHora_(
              b.dataEtapa ||
              b.data ||
              "",
              b.horario ||
              b.hora ||
              "23:59"
            );


          return (
            (dataA ? dataA.getTime() : 0) -
            (dataB ? dataB.getTime() : 0)
          );

        });


    const primeiraMontagem =
      montagensEvento.length

        ? montagensEvento[0]

        : null;


    /*
     * 1 EVENTO = 1 unidade
     * para Sacolas e Lista Assinada.
     */
    if(primeiraMontagem){

      totalEventos++;

    }


    etapas.forEach(function(etapa){

      const nomeEtapa =
        String(
          etapa.etapa || ""
        )
          .toLowerCase()
          .trim();


      /*
       * CHEGADA + UNIFORME:
       *
       * somente Montagem e Desmontagem.
       */
      if(
        nomeEtapa !== "montagem" &&
        nomeEtapa !== "desmontagem"
      ){
        return;
      }


      /*
       * Somente etapas pertencentes
       * à semana fechada.
       */
      if(
        !FECH_etapaEstaNaSemana_(
          etapa,
          inicioSemana,
          fimSemana
        )
      ){
        return;
      }


      /*
       * Denominador:
       * TODAS as etapas M + D da semana.
       */
      totalEtapas++;


      const dataEtapa =
        etapa.dataEtapa ||
        etapa.data ||
        "";


      const horario =
        etapa.horario ||
        etapa.hora ||
        "";


      /*
       * Sem horário não conseguimos
       * afirmar que a etapa venceu.
       *
       * Ela continua no denominador.
       */
      if(
        !dataEtapa ||
        !horario
      ){
        return;
      }


      const horarioPrevisto =
        FECH_combinarDataHora_(
          dataEtapa,
          horario
        );


      if(!horarioPrevisto){
        return;
      }


      /*
       * Ainda não havia chegado o horário
       * no momento do fechamento.
       *
       * Não gera erro.
       */
      if(
        horarioPrevisto.getTime() >
        referenciaCalculo.getTime()
      ){
        return;
      }


      const montagem =
        etapa.montagem &&
        typeof etapa.montagem === "object"

          ? etapa.montagem

          : {};


      /*
       * =========================================
       * EQUIPE / UNIFORMIZAÇÃO
       * =========================================
       */
      const registroEquipe =
        montagem.equipeTerceirizada ||
        montagem.equipe ||
        null;


      const uniforme =
        registroEquipe

          ? String(
              registroEquipe.uniformizada ||
              ""
            )
              .trim()
              .toUpperCase()

          : "";


      const uniformeOk =
        Boolean(registroEquipe) &&
        (
          uniforme === "SIM" ||
          uniforme === "S" ||
          uniforme === "TRUE"
        );


      if(!uniformeOk){

        equipeNaoUniformizada++;

      }


      /*
       * =========================================
       * CHEGADA
       * =========================================
       */
      let chegadaProblema = false;


      if(!registroEquipe){

        chegadaProblema = true;

      }else{

        const fotoOk =
          FECH_temFoto_(
            registroEquipe.foto ||
            registroEquipe.urlFoto ||
            ""
          );


        const distancia =
          FECH_converterDistanciaMetros_(
            registroEquipe.distanciaEvento
          );


        if(!fotoOk){

          chegadaProblema = true;

        }

        /*
         * Sem distância = registro feito sem localização
         * (a localização deixou de ser pedida): não conta como problema.
         * Com distância (registros antigos), mantém o limite de 300 m.
         */
        else if(
          distancia !== null &&
          distancia > 300
        ){

          chegadaProblema = true;

        }

        else{

          const chegada =
            FECH_obterDataHoraRegistro_(
              registroEquipe
            );


          if(!chegada){

            chegadaProblema = true;

          }

          else if(
            chegada.getTime() >
            horarioPrevisto.getTime()
          ){

            chegadaProblema = true;

          }

        }

      }


      if(chegadaProblema){

        chegadasAtrasadas++;

      }


      /*
       * =========================================
       * SACOLAS
       *
       * SOMENTE A PRIMEIRA MONTAGEM
       * DO EVENTO
       * =========================================
       */
      if(
        nomeEtapa === "montagem" &&
        etapa === primeiraMontagem
      ){

        const sacolas =
          Array.isArray(
            montagem.sacolas
          )

            ? montagem.sacolas

            : [];


        let problemaSacola =
          sacolas.length === 0;


        if(!problemaSacola){

          problemaSacola =
            sacolas.some(
              function(sacola){

                return (
                  !FECH_sacolaTemFoto_(
                    sacola
                  )
                );

              }
            );

        }


        if(problemaSacola){

          semFotoSacolas++;

        }


        /*
         * =========================================
         * LISTA ASSINADA
         *
         * TAMBÉM SOMENTE A PRIMEIRA MONTAGEM
         * =========================================
         */
        const listaAssinada =
          montagem.listaAssinada ||
          montagem.lista ||
          null;


        if(!listaAssinada){

          listasPendentes++;

        }

      }

    });

  });


  return {

    chegadasAtrasadas:
      chegadasAtrasadas,

    totalEtapas:
      totalEtapas,

    semFotoSacolas:
      semFotoSacolas,

    totalEventos:
      totalEventos,

    equipeNaoUniformizada:
      equipeNaoUniformizada,

    listasPendentes:
      listasPendentes,

    alteracoes:
      0

  };

}


/****************************************************
 * CONFERE SE A ETAPA ESTÁ NA SEMANA
 ****************************************************/
function FECH_etapaEstaNaSemana_(
  etapa,
  inicio,
  fim
){

  const data =
    FECH_parseData_(
      etapa.dataEtapa ||
      etapa.data ||
      ""
    );


  if(!data){
    return false;
  }


  data.setHours(
    12,
    0,
    0,
    0
  );


  return (
    data >= inicio &&
    data <= fim
  );

}


/****************************************************
 * TERÇA-FEIRA DA SEMANA OPERACIONAL
 ****************************************************/
function FECH_obterInicioSemanaOperacional_(
  referencia
){

  const data =
    new Date(referencia);


  data.setHours(
    0,
    0,
    0,
    0
  );


  /*
   * JS:
   * DOM = 0
   * SEG = 1
   * TER = 2
   */
  const diferenca =
    (
      data.getDay() -
      2 +
      7
    ) % 7;


  data.setDate(
    data.getDate() -
    diferenca
  );


  return data;

}


/****************************************************
 * PARSE DE DATA
 ****************************************************/
function FECH_parseData_(
  valor
){

  if(!valor){
    return null;
  }


  if(
    Object.prototype.toString.call(valor) ===
    "[object Date]"
  ){

    if(
      !isNaN(
        valor.getTime()
      )
    ){

      return new Date(
        valor.getFullYear(),
        valor.getMonth(),
        valor.getDate()
      );

    }

  }


  const texto =
    String(valor)
      .trim()
      .split("T")[0]
      .split(" ")[0];


  /*
   * yyyy-mm-dd
   */
  if(
    /^\d{4}-\d{2}-\d{2}$/
      .test(texto)
  ){

    const partes =
      texto
        .split("-")
        .map(Number);


    return new Date(
      partes[0],
      partes[1] - 1,
      partes[2]
    );

  }


  /*
   * dd/mm/yyyy
   */
  if(
    /^\d{2}\/\d{2}\/\d{4}$/
      .test(texto)
  ){

    const partes =
      texto
        .split("/")
        .map(Number);


    return new Date(
      partes[2],
      partes[1] - 1,
      partes[0]
    );

  }


  return null;

}


/****************************************************
 * JUNTA DATA + HORA
 ****************************************************/
function FECH_combinarDataHora_(
  data,
  hora
){

  const resultado =
    FECH_parseData_(
      data
    );


  if(!resultado){
    return null;
  }


  const textoHora =
    String(
      hora || ""
    ).trim();


  const match =
    textoHora.match(
      /^(\d{1,2}):(\d{2})/
    );


  if(!match){
    return null;
  }


  resultado.setHours(
    Number(match[1]),
    Number(match[2]),
    0,
    0
  );


  return resultado;

}


/****************************************************
 * DATA/HORA DE ENVIO DA EQUIPE
 ****************************************************/
function FECH_obterDataHoraRegistro_(
  registro
){

  if(!registro){
    return null;
  }


  if(
    registro.data &&
    registro.hora
  ){

    return FECH_combinarDataHora_(
      registro.data,
      registro.hora
    );

  }


  const dataHora =
    String(
      registro.dataHora || ""
    )
      .trim()
      .replace("T"," ");


  if(!dataHora){
    return null;
  }


  const partes =
    dataHora.split(/\s+/);


  if(partes.length < 2){
    return null;
  }


  return FECH_combinarDataHora_(
    partes[0],
    partes[1]
  );

}


/****************************************************
 * FOTO VÁLIDA
 ****************************************************/
function FECH_temFoto_(
  valor
){

  if(!valor){
    return false;
  }


  if(typeof valor === "string"){

    return Boolean(
      valor.trim()
    );

  }


  if(typeof valor === "object"){

    return Boolean(
      String(
        valor.url ||
        valor.foto ||
        valor.link ||
        ""
      ).trim()
    );

  }


  return false;

}


/****************************************************
 * FOTO DA SACOLA
 ****************************************************/
function FECH_sacolaTemFoto_(
  sacola
){

  if(!sacola){
    return false;
  }


  let fotos = [];


  if(
    Array.isArray(
      sacola.fotos
    )
  ){

    fotos =
      sacola.fotos;

  }

  else if(
    sacola.fotos
  ){

    fotos = [
      sacola.fotos
    ];

  }

  else if(
    sacola.foto
  ){

    fotos = [
      sacola.foto
    ];

  }


  return fotos.some(
    function(foto){

      return FECH_temFoto_(
        foto
      );

    }
  );

}


/****************************************************
 * DISTÂNCIA → METROS
 ****************************************************/
function FECH_converterDistanciaMetros_(
  valor
){

  if(
    valor === null ||
    valor === undefined ||
    valor === ""
  ){
    return null;
  }


  if(
    typeof valor === "number"
  ){

    return Number.isFinite(valor)
      ? valor
      : null;

  }


  let texto =
    String(valor)
      .trim()
      .toLowerCase();


  const estaEmKm =
    texto.includes("km");


  texto =
    texto
      .replace(
        /[^\d,.\-]/g,
        ""
      )
      .replace(",", ".");


  const numero =
    Number.parseFloat(
      texto
    );


  if(
    !Number.isFinite(numero)
  ){
    return null;
  }


  return estaEmKm
    ? numero * 1000
    : numero;

}


/****************************************************
 * FORMATA yyyy-mm-dd
 ****************************************************/
function FECH_formatarISO_(
  data
){

  const ano =
    data.getFullYear();

  const mes =
    String(
      data.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const dia =
    String(
      data.getDate()
    ).padStart(
      2,
      "0"
    );


  return (
    ano +
    "-" +
    mes +
    "-" +
    dia
  );

}


/****************************************************
 * CRIA / BUSCA A ABA DE HISTÓRICO
 ****************************************************/
function FECH_obterAbaHistorico_(){

  const planilha =
    SpreadsheetApp.openById(
      FECH_ID_PLANILHA_CRONOGRAMA
    );


  let aba =
    planilha.getSheetByName(
      FECH_ABA_HISTORICO
    );


  if(!aba){

    aba =
      planilha.insertSheet(
        FECH_ABA_HISTORICO
      );

  }


  const cabecalhos = [[

    "INICIO SEMANA",
    "FIM SEMANA",
    "SEMANA",
    "REFERÊNCIA",
    "GRAVADO EM",

    "CHEGADAS ATRASADAS",
    "TOTAL ETAPAS M+D",
    "RESULTADO CHEGADAS",

    "SEM FOTO SACOLAS",
    "TOTAL EVENTOS",
    "RESULTADO SACOLAS",

    "EQUIPE NÃO UNIFORMIZADA",
    "RESULTADO UNIFORME",

    "LISTAS ASSINADAS PENDENTES",
    "RESULTADO LISTAS",

    "ALTERAÇÕES CRONOGRAMA"

  ]];


  if(
    aba.getLastRow() === 0
  ){

    aba
      .getRange(
        1,
        1,
        1,
        cabecalhos[0].length
      )
      .setValues(
        cabecalhos
      )
      .setFontWeight(
        "bold"
      );


    aba.setFrozenRows(1);

  }


  return aba;

}


/****************************************************
 * SALVA SEM DUPLICAR A SEMANA
 ****************************************************/
function FECH_salvarOuAtualizarSemana_(
  aba,
  inicioSemanaISO,
  valores
){

  let linhaEncontrada = 0;


  const ultimaLinha =
    aba.getLastRow();


  if(
    ultimaLinha >= 2
  ){

    const semanas =
      aba
        .getRange(
          2,
          1,
          ultimaLinha - 1,
          1
        )
        .getDisplayValues();


    for(
      let i = 0;
      i < semanas.length;
      i++
    ){

      if(
        String(
          semanas[i][0] || ""
        ).trim() ===
        String(
          inicioSemanaISO || ""
        ).trim()
      ){

        linhaEncontrada =
          i + 2;

        break;

      }

    }

  }


  if(linhaEncontrada){

    aba
      .getRange(
        linhaEncontrada,
        1,
        1,
        valores.length
      )
      .setValues([
        valores
      ]);

  }else{

    aba.appendRow(
      valores
    );

    linhaEncontrada =
      aba.getLastRow();

  }


  /*
   * Datas de referência/gravação
   */
  aba
    .getRange(
      linhaEncontrada,
      4,
      1,
      2
    )
    .setNumberFormat(
      "dd/MM/yyyy HH:mm"
    );

}

/****************************************************
 * BUSCAR CRONOGRAMA POR SEMANA
 ****************************************************/
function getCronogramaSemana(inicioSemanaStr) {

const sheet = SpreadsheetApp
  .openById(
    "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
  )
  .getSheetByName(NOME_ABA);

if (!sheet) {
  throw new Error(
    'A aba "' + NOME_ABA + '" não foi encontrada.'
  );
}


/*
 * Cria/configura automaticamente
 * a coluna Q se necessário.
 */
CRON_garantirColunaConfirmacao_(
  sheet
);


const dados = sheet
  .getDataRange()
  .getDisplayValues();

  // Informações adicionais dos pedidos
  const mapaInfoMatriz =
    buscarInfoLogisticaMatriz_();

  // Alertas enviados pelos motoristas
  const mapaAlertasMotorista =
    buscarAlertasMotoristaPorPedido_();

  // Conclusões e pendências do carregamento
  const mapaConclusoesCarregamento =
    CAR_buscarMapaConclusoes_();
// Respostas enviadas pela equipe de montagem
const mapaResumoMontagem =
  MON_buscarMapaResumoMontagem_();

// Vagas abertas para os freelancers (não derruba o cronograma se falhar)
let mapaVagasFree = {};

try {
  mapaVagasFree =
    FREE_buscarMapaVagasPorEtapa_();
} catch (erroFree) {
  console.error("Erro ao ler vagas free:", erroFree);
}

// Trocas de material pedidas pelo app do montador
let mapaTrocas = {};

try {
  mapaTrocas =
    TROCA_mapaPorEtapa_();
} catch (erroTroca) {
  console.error("Erro ao ler trocas:", erroTroca);
}
  // Remove cabeçalho e linhas inválidas
  const dadosValidos = dados.filter(function(linha, indice) {

    if (indice === 0) {
      return false;
    }

    if (!linha[0]) {
      return false;
    }

    return true;
  });

  function parseISODate(str) {

    const partes = String(str || "")
      .split("-");

    if (partes.length !== 3) {
      return null;
    }

    const ano = Number(partes[0]);
    const mes = Number(partes[1]);
    const dia = Number(partes[2]);

    const data = new Date(
      ano,
      mes - 1,
      dia
    );

    if (isNaN(data.getTime())) {
      return null;
    }

    return data;
  }

  const inicioSemana =
    parseISODate(inicioSemanaStr);

  if (!inicioSemana) {
    throw new Error(
      "Data inicial da semana inválida."
    );
  }

  const fimSemana =
    new Date(inicioSemana);

  fimSemana.setDate(
    fimSemana.getDate() + 6
  );

  inicioSemana.setHours(
    0,
    0,
    0,
    0
  );

  fimSemana.setHours(
    0,
    0,
    0,
    0
  );

  const inicioSemanaISO =
    formatISO(inicioSemana);

  const fimSemanaISO =
    formatISO(fimSemana);

  const pedidos = {};

  // ==========================================
  // 1. AGRUPAR TODOS OS DADOS POR PEDIDO
  // ==========================================
  dadosValidos.forEach(function(linha) {

    const id          = linha[0];
    const pedido      = linha[1];
    const dataEvento  = linha[2];
    const cliente     = linha[3];
    const local       = linha[4];
    const etapa       = linha[5];
    const dataEtapa   = linha[6];
    const horario     = linha[7];
    const caminhao    = linha[8];
    const responsavel = linha[9];
    const equipe      = linha[10];
    const obs         = linha[11];
const equipeQtd   = linha[12] || "";
const lona        = linha[15] || "";

const confirmadoDecorador =
  linha[16] || "";

    const pedidoChave =
      String(pedido || "").trim();

    if (!pedidoChave) {
      return;
    }

    const dataEtapaObj =
      parseData(dataEtapa);

    if (!dataEtapaObj) {
      return;
    }

    if (!pedidos[pedidoChave]) {

      const infoMatriz =
        mapaInfoMatriz[pedidoChave] || {};

      const alertaMotorista =
        mapaAlertasMotorista[pedidoChave] || null;

      pedidos[pedidoChave] = {

        pedido:
          pedidoChave,

        cliente:
          cliente,

        local:
          local,

        dataEvento:
          dataEvento,

        // Alerta amarelo ou verde do motorista
        alertaMotorista:
          alertaMotorista,

        infoLogistica: {

          baldeacao:
            infoMatriz.baldeacao || "",

          escada:
            infoMatriz.escada || "",

          caminhaoPerto:
            infoMatriz.caminhaoPerto || "",

          horarioLimite:
            infoMatriz.horarioLimite || "",

          lona:
            ""
        },

        etapas:
          []
      };
    }

    // A lona é obtida da etapa de montagem
    if (
      String(etapa || "")
        .toLowerCase()
        .includes("montagem") &&
      lona
    ) {

      pedidos[
        pedidoChave
      ].infoLogistica.lona =
        normalizarSimNao(lona);
    }

    const idEtapaNormalizado =
      String(
        id || ""
      ).trim();

    pedidos[
      pedidoChave
    ].etapas.push({

      id:
        id,

      etapa:
        etapa,

      dataEtapa:
        formatISO(dataEtapaObj),

      horario:
        horario,

      caminhao:
        caminhao,

      responsavel:
        responsavel,

      equipe:
        equipe,

equipeQtd:
  equipeQtd,

observacao:
  obs,

confirmadoDecorador:
  CRON_confirmacaoEhSim_(
    confirmadoDecorador
  ),

lona:
  normalizarSimNao(lona),

carregamento:
  mapaConclusoesCarregamento[
    idEtapaNormalizado
  ] || null,

montagem:
  mapaResumoMontagem[
    idEtapaNormalizado
  ] || null,

freeVaga:
  mapaVagasFree[
    idEtapaNormalizado
  ] || null,

trocas:
  mapaTrocas[
    idEtapaNormalizado
  ] || []
    });
  });

  // ==========================================
  // 2. FILTRAR PEDIDOS DA SEMANA
  // ==========================================
  const lista = Object
    .values(pedidos)
    .filter(function(pedido) {

      return pedido.etapas.some(function(etapa) {

        if (!etapa.dataEtapa) {
          return false;
        }

        return (
          etapa.dataEtapa >= inicioSemanaISO &&
          etapa.dataEtapa <= fimSemanaISO
        );
      });
    });

  // ==========================================
  // 3. DEFINIR DATA PRINCIPAL DO PEDIDO
  // ==========================================
  lista.forEach(function(pedido) {

    const montagem = pedido.etapas.find(
      function(etapa) {

        return String(etapa.etapa || "")
          .trim()
          .toLowerCase() === "montagem";
      }
    );

    if (montagem) {

      pedido.dataPrincipal =
        combinarDataHora(
          montagem.dataEtapa,
          montagem.horario
        );

    } else {

      pedido.dataPrincipal =
        new Date("2100-01-01");
    }
  });

  // ==========================================
  // 4. ORDENAR PELA DATA DA MONTAGEM
  // ==========================================
  lista.sort(function(a, b) {

    return (
      new Date(a.dataPrincipal).getTime() -
      new Date(b.dataPrincipal).getTime()
    );
  });

  Logger.log(
    JSON.stringify(lista)
  );

  return JSON.parse(
    JSON.stringify(lista)
  );
}
function getQuantidadeAlteracoesCronogramaSemana(
  inicioSemanaStr
){

  const inicio =
    parseData(inicioSemanaStr);

  if(!inicio){
    return 0;
  }

  inicio.setHours(0,0,0,0);

  const fim =
    new Date(inicio);

  fim.setDate(
    fim.getDate() + 6
  );

  fim.setHours(
    23,59,59,999
  );

  const aba =
    AUD_obterAbaAuditoria_();

  if(
    !aba ||
    aba.getLastRow() < 2
  ){
    return 0;
  }

  const dados =
    aba
      .getDataRange()
      .getDisplayValues();

  const normalizar = function(valor){

    return String(valor || "")
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .toLowerCase()
      .replace(/[^a-z0-9]/g,"")
      .trim();

  };

  const cabecalho =
    dados[0].map(normalizar);

  const localizarColuna =
    function(){

      const nomes =
        Array.from(arguments)
          .map(normalizar);

      for(
        let i = 0;
        i < cabecalho.length;
        i++
      ){

        if(
          nomes.includes(
            cabecalho[i]
          )
        ){
          return i;
        }

      }

      return -1;

    };


  const colMovimentacao =
    localizarColuna(
      "ID Movimentação",
      "IdMovimentacao",
      "Movimentação"
    );

  const colTipo =
    localizarColuna(
      "Tipo Movimentação",
      "TipoMovimentacao"
    );

  const colDataEtapa =
    localizarColuna(
      "Data Etapa",
      "DataEtapa"
    );

  const colDataAnterior =
    localizarColuna(
      "Data Etapa Anterior",
      "DataEtapaAnterior"
    );

  const colDataNova =
    localizarColuna(
      "Data Etapa Nova",
      "DataEtapaNova"
    );


  const movimentos =
    new Set();


  for(
    let i = 1;
    i < dados.length;
    i++
  ){

    const linha =
      dados[i];

    if(colTipo >= 0){

      const tipo =
        normalizar(
          linha[colTipo]
        );

      if(
        tipo &&
        !tipo.includes("alteracao")
      ){
        continue;
      }

    }


    const datas = [];

    if(colDataEtapa >= 0){
      datas.push(
        linha[colDataEtapa]
      );
    }

    if(colDataAnterior >= 0){
      datas.push(
        linha[colDataAnterior]
      );
    }

    if(colDataNova >= 0){
      datas.push(
        linha[colDataNova]
      );
    }


    const pertenceSemana =
      datas.some(function(valor){

        const data =
          parseData(valor);

        if(!data){
          return false;
        }

        data.setHours(
          12,0,0,0
        );

        return (
          data >= inicio &&
          data <= fim
        );

      });


    if(!pertenceSemana){
      continue;
    }


    const idMovimentacao =
      colMovimentacao >= 0

        ? String(
            linha[colMovimentacao] ||
            ""
          ).trim()

        : "";


    movimentos.add(
      idMovimentacao ||
      ("LINHA_" + i)
    );

  }


  return movimentos.size;
}

function getAlteracoesCronogramaSemana(
  inicioSemanaStr
){

  const inicio =
    parseData(inicioSemanaStr);

  if(!inicio){
    return [];
  }

  inicio.setHours(0,0,0,0);

  const fim =
    new Date(inicio);

  fim.setDate(
    fim.getDate() + 6
  );

  fim.setHours(23,59,59,999);


  const aba =
    AUD_obterAbaAuditoria_();

  if(
    !aba ||
    aba.getLastRow() < 2
  ){
    return [];
  }


  const dados =
    aba
      .getDataRange()
      .getDisplayValues();


  const normalizar =
    function(valor){

      return String(valor || "")
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .toLowerCase()
        .replace(/[^a-z0-9]/g,"")
        .trim();

    };


  const cabecalho =
    dados[0].map(normalizar);


  const localizarColuna =
    function(){

      const nomes =
        Array.from(arguments)
          .map(normalizar);

      for(
        let i = 0;
        i < cabecalho.length;
        i++
      ){

        if(
          nomes.includes(
            cabecalho[i]
          )
        ){
          return i;
        }

      }

      return -1;
    };


  const colMov =
    localizarColuna(
      "ID Movimentação",
      "IdMovimentacao"
    );

  const colDataAlteracao =
    localizarColuna(
      "Data Alteração",
      "DataAlteracao"
    );

  const colUsuario =
    localizarColuna(
      "Usuário",
      "Usuario"
    );

  const colPerfil =
    localizarColuna(
      "Perfil"
    );

  const colPedido =
    localizarColuna(
      "Pedido"
    );

  const colCliente =
    localizarColuna(
      "Cliente"
    );

  const colEtapa =
    localizarColuna(
      "Etapa"
    );

  const colTipoMov =
    localizarColuna(
      "Tipo Movimentação",
      "TipoMovimentacao"
    );

  const colDataEtapa =
    localizarColuna(
      "Data Etapa",
      "DataEtapa"
    );

  const colDataAnterior =
    localizarColuna(
      "Data Etapa Anterior",
      "DataEtapaAnterior"
    );

  const colDataNova =
    localizarColuna(
      "Data Etapa Nova",
      "DataEtapaNova"
    );

  const colNomeCampo =
    localizarColuna(
      "Nome Campo",
      "NomeCampo",
      "Campo"
    );

  const colValorAnterior =
    localizarColuna(
      "Valor Anterior",
      "ValorAnterior"
    );

  const colValorNovo =
    localizarColuna(
      "Valor Novo",
      "ValorNovo"
    );

  const colTipoAlteracao =
    localizarColuna(
      "Tipo Alteração",
      "TipoAlteracao"
    );


  const mapa = {};
  const ordem = [];


  for(
    let i = 1;
    i < dados.length;
    i++
  ){

    const linha =
      dados[i];


    if(colTipoMov >= 0){

      const tipo =
        normalizar(
          linha[colTipoMov]
        );

      if(
        tipo &&
        !tipo.includes("alteracao")
      ){
        continue;
      }

    }


    const datas = [
      colDataEtapa >= 0
        ? linha[colDataEtapa]
        : "",

      colDataAnterior >= 0
        ? linha[colDataAnterior]
        : "",

      colDataNova >= 0
        ? linha[colDataNova]
        : ""
    ];


    const pertenceSemana =
      datas.some(function(valor){

        const data =
          parseData(valor);

        if(!data){
          return false;
        }

        data.setHours(
          12,0,0,0
        );

        return (
          data >= inicio &&
          data <= fim
        );

      });


    if(!pertenceSemana){
      continue;
    }


    const id =
      colMov >= 0

        ? String(
            linha[colMov] || ""
          ).trim()

        : "";


    const chave =
      id || ("MOV_LINHA_" + i);


    if(!mapa[chave]){

      mapa[chave] = {

        id: chave,

        dataAlteracao:
          colDataAlteracao >= 0
            ? linha[colDataAlteracao]
            : "",

        usuario:
          colUsuario >= 0
            ? linha[colUsuario]
            : "",

        perfil:
          colPerfil >= 0
            ? linha[colPerfil]
            : "",

        pedido:
          colPedido >= 0
            ? linha[colPedido]
            : "",

        cliente:
          colCliente >= 0
            ? linha[colCliente]
            : "",

        etapa:
          colEtapa >= 0
            ? linha[colEtapa]
            : "",

        alteracoes: []

      };

      ordem.push(chave);
    }


    mapa[chave].alteracoes.push({

      campo:
        colNomeCampo >= 0
          ? linha[colNomeCampo]
          : "Alteração",

      tipo:
        colTipoAlteracao >= 0
          ? linha[colTipoAlteracao]
          : "",

      anterior:
        colValorAnterior >= 0
          ? linha[colValorAnterior]
          : "",

      novo:
        colValorNovo >= 0
          ? linha[colValorNovo]
          : ""

    });

  }


  return ordem
    .map(function(chave){
      return mapa[chave];
    })
    .reverse();

}

/****************************************************
 * SALVAR PEDIDO COMPLETO
 ****************************************************/
function salvarPedidoCompleto(payload) {

const sheet = SpreadsheetApp
  .openById(
    "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
  )
  .getSheetByName(
    NOME_ABA
  );


CRON_garantirColunaConfirmacao_(
  sheet
);


const dados =
  sheet
    .getDataRange()
    .getValues();

const {
  pedido,
  cliente,
  local,
  dataEvento,
  etapas,
  infoLogistica = {}
} = payload || {};

// ========================================
// AUDITORIA DO SALVAMENTO
// ========================================

const sessaoAuditoria =
  AUD_validarTokenSessao_(

    payload &&
    payload.auditoria

      ? payload.auditoria.token
      : ""
  );

/*
 * Um único ID para todas as mudanças
 * realizadas neste salvamento.
 */
const dataAlteracaoAuditoria =
  new Date();

const idMovimentacaoAuditoria =
  sessaoAuditoria
    ? (
        "MOV_" +
        dataAlteracaoAuditoria.getTime() +
        "_" +
        Utilities
          .getUuid()
          .substring(0, 8)
      )
    : "";

/*
 * Evita repetir alterações de dados gerais,
 * como Cliente e Local, em todas as etapas.
 */
const chavesAuditoriaRegistradas =
  new Set();

  /*
 * Verifica se o pedido já existia antes
 * deste salvamento.
 *
 * Isso evita considerar uma nova etapa adicionada
 * a um pedido antigo como "Novo Pedido".
 */
const pedidoNormalizadoAuditoria =
  String(
    pedido || ""
  ).trim();

const pedidoExistiaAntesAuditoria =
  dados
    .slice(1)
    .some(function(linha){

      return String(
        linha[1] || ""
      ).trim() ===
        pedidoNormalizadoAuditoria;
    });

/*
 * Guarda as etapas inseridas neste salvamento.
 *
 * Será usado para registrar "Novo Pedido"
 * apenas depois que todas as etapas forem salvas.
 */
const etapasNovasAuditoria = [];
  
// 🔥 GPS EVENTO
const coordenadas =
  obterCoordenadasEndereco(
    local
  );

const latitudeEvento =
  coordenadas.latitude || "";

const longitudeEvento =
  coordenadas.longitude || "";

  const dataEventoFormatada = formatarDataSemFuso(dataEvento);
  Logger.log("🔥 PAYLOAD RECEBIDO:");
Logger.log(JSON.stringify(payload));

Logger.log("🔥 INFO LOGISTICA:");
Logger.log(JSON.stringify(infoLogistica));

const infoPedido = {
  baldeacao: normalizarSimNao(infoLogistica.baldeacao),
  escada: normalizarSimNao(infoLogistica.escada),
  caminhaoPerto: normalizarSimNao(infoLogistica.caminhaoPerto),
  horarioLimite: normalizarSimNao(infoLogistica.horarioLimite),
  lona: normalizarSimNao(infoLogistica.lona)
};

salvarInfoPedidoNaMatriz({
  pedido: pedido,
  cliente: cliente,
  local: local,
  dataEventoFormatada: dataEventoFormatada,
  baldeacao: infoPedido.baldeacao,
  escada: infoPedido.escada,
  caminhaoPerto: infoPedido.caminhaoPerto,
  horarioLimite: infoPedido.horarioLimite
});

  // ============================
  // MAPA DE IDs EXISTENTES
  // ============================
  let mapaLinhas = {};

  for (let i = 1; i < dados.length; i++) {
    const id = dados[i][0];
    if (id) {
      mapaLinhas[id] = i + 1;
    }
  }

  // ===============================
  // BACKEND NÃO CRIA MAIS TRIAGEM
  // ===============================
  let etapasFinal = [...etapas];

// ===============================
// SALVAR (UPDATE + INSERT)
// ===============================
etapasFinal.forEach(e => {

  const dataEtapaFormatada = formatarDataSemFuso(e.dataEtapa);

  if (e.id && mapaLinhas[e.id]) {

    // UPDATE
    const linha = mapaLinhas[e.id];

// ========================================
// DADOS ANTIGOS PARA A AUDITORIA
// ========================================

const dadosAnterioresAuditoria =
  AUD_linhaCronogramaParaObjeto_(

    dados[
      linha - 1
    ]
  );

const caminhaoNovoAuditoria =
  Array.isArray(e.caminhao)
    ? e.caminhao.join("\n")
    : (e.caminhao || "");

const equipeNovaAuditoria =
  Array.isArray(e.equipe)
    ? e.equipe.join("\n")
    : (e.equipe || "");

const lonaNovaAuditoria =
  String(
    e.etapa || ""
  )
    .toLowerCase()
    .includes("montagem")

      ? infoPedido.lona
      : "";

const dadosNovosAuditoria = {

  id:
    e.id || "",

  pedido:
    pedido || "",

  dataEvento:
    dataEventoFormatada || "",

  cliente:
    cliente || "",

  local:
    local || "",

  etapa:
    e.etapa || "",

  dataEtapa:
    dataEtapaFormatada || "",

  horario:
    e.horario || "",

  caminhao:
    caminhaoNovoAuditoria,

  responsavel:
    e.responsavel || "",

  equipe:
    equipeNovaAuditoria,

  equipeQtd:
    e.equipeQtd || "",

  observacao:
    e.observacao || "",

  lona:
    lonaNovaAuditoria
};

const alteracoesAuditoria =
  AUD_compararDados_(

    dadosAnterioresAuditoria,
    dadosNovosAuditoria
  );

sheet.getRange(linha, 2, 1, 14).setValues([[
      pedido,
      dataEventoFormatada,
      cliente,
      local,
      e.etapa,
      dataEtapaFormatada,
      e.horario || "",
      Array.isArray(e.caminhao) ? e.caminhao.join("\n") : (e.caminhao || ""),
      e.responsavel || "",
      Array.isArray(e.equipe) ? e.equipe.join("\n") : (e.equipe || ""),
      e.observacao || "",
e.equipeQtd || "",

// N
latitudeEvento,

// O
longitudeEvento
    ]]);

const etapaParaLona = String(e.etapa || "").toLowerCase();

sheet.getRange(linha, 16).setValue(
  etapaParaLona.includes("montagem")
    ? infoPedido.lona
    : ""
);
/*
 * Q — CONFIRMAÇÃO DO DECORADOR
 */
sheet
  .getRange(
    linha,
    CRON_COL_CONFIRMADO_DECORADOR
  )
  .setValue(
    CRON_valorConfirmacao_(
      e
    )
  );
// ========================================
// REGISTRAR AUDITORIA DA ALTERAÇÃO
// ========================================

if(
  sessaoAuditoria &&
  alteracoesAuditoria.length
){

  /*
   * Os dados gerais do pedido se repetem
   * em todas as etapas da planilha.
   *
   * Esta filtragem impede que a mesma
   * alteração de Cliente ou Local seja
   * registrada três vezes.
   */
  const camposGeraisPedido = [

    "pedido",
    "cliente",
    "local",
    "dataEvento"
  ];

  const alteracoesSemDuplicidade =
    alteracoesAuditoria.filter(
      alteracao => {

        const chave =
          camposGeraisPedido.includes(
            alteracao.campo
          )

            ? (
                "PEDIDO|" +
                alteracao.campo
              )

            : (
                String(e.id || "") +
                "|" +
                alteracao.campo
              );

        if(
          chavesAuditoriaRegistradas.has(
            chave
          )
        ){

          return false;
        }

        chavesAuditoriaRegistradas.add(
          chave
        );

        return true;
      }
    );

  if(
    alteracoesSemDuplicidade.length
  ){

    try{

      AUD_registrarAlteracoes_({

        idMovimentacao:
          idMovimentacaoAuditoria,

        dataAlteracao:
          dataAlteracaoAuditoria,

        usuario:
          sessaoAuditoria.usuario,

        perfil:
          sessaoAuditoria.perfil,

        pedido:
          dadosNovosAuditoria.pedido,

        cliente:
          dadosNovosAuditoria.cliente,

        local:
          dadosNovosAuditoria.local,

        dataEvento:
          dadosNovosAuditoria.dataEvento,

        idEtapa:
          dadosNovosAuditoria.id,

        etapa:
          dadosNovosAuditoria.etapa,

        dataEtapa:
          dadosNovosAuditoria.dataEtapa,

        dataEtapaAnterior:
          dadosAnterioresAuditoria
            .dataEtapa,

        dataEtapaNova:
          dadosNovosAuditoria
            .dataEtapa,

        tipoMovimentacao:
          "Alteração",

        alteracoes:
          alteracoesSemDuplicidade
      });

    }catch(erroAuditoria){

      /*
       * Nesta fase de teste, um erro na
       * auditoria não interrompe o cronograma.
       */
      console.error(
        "Erro ao registrar auditoria:",
        erroAuditoria
      );
    }
  }
}
    // 🔥 ENVIA PARA FRETE (ATUALIZA)
const etapaNome = (e.etapa || "").toLowerCase();

if (
  etapaNome.includes("carregamento") ||
  etapaNome.includes("desmontagem")
) {

enviarParaFrete({
  id: e.id || id,
  pedido: pedido,
  data: dataEtapaFormatada,
  caminhao: e.caminhao,
  local: local,
  etapa: e.etapa
});

}

  } else {

    // INSERT
    const id = Utilities.getUuid();
    e.id = id; // 🔥 ESSENCIAL
/*
 * Guarda a etapa inserida para a auditoria.
 *
 * Todas continuarão usando o mesmo
 * idMovimentacaoAuditoria deste salvamento.
 */
if(
  sessaoAuditoria &&
  !pedidoExistiaAntesAuditoria
){

  etapasNovasAuditoria.push({

    id:
      id,

    etapa:
      e.etapa || "",

    dataEtapa:
      dataEtapaFormatada || ""
  });
}
sheet.appendRow([

  // A
  id,

  // B
  pedido,

  // C
  dataEventoFormatada,

  // D
  cliente,

  // E
  local,

  // F
  e.etapa,

  // G
  dataEtapaFormatada,

  // H
  e.horario || "",

  // I
  Array.isArray(e.caminhao)
    ? e.caminhao.join("\n")
    : (e.caminhao || ""),

  // J
  e.responsavel || "",

  // K
  Array.isArray(e.equipe)
    ? e.equipe.join("\n")
    : (e.equipe || ""),

  // L
  e.observacao || "",

  // M
  e.equipeQtd || "",

  // N
  latitudeEvento,

// O
longitudeEvento,

// P
String(e.etapa || "").toLowerCase().includes("montagem")
  ? infoPedido.lona
  : "",


// Q
CRON_valorConfirmacao_(
  e
)

]);

const etapaNome = (e.etapa || "").toLowerCase();

if (
  etapaNome.includes("carregamento") ||
  etapaNome.includes("desmontagem")
) {

enviarParaFrete({
  id: e.id || id,
  pedido: pedido,
  data: dataEtapaFormatada,
  caminhao: e.caminhao,
  local: local,
  etapa: e.etapa
});

}

  }

}); // 🔥 FECHOU FOR EACH


// ========================================
// AUDITORIA DE NOVO PEDIDO
// ========================================

if(
  sessaoAuditoria &&
  !pedidoExistiaAntesAuditoria &&
  etapasNovasAuditoria.length
){

  const semanasNovoPedidoRegistradas =
    new Set();

  etapasNovasAuditoria.forEach(
    function(etapaNova){

      const semana =
        AUD_calcularSemanaCronograma_(
          etapaNova.dataEtapa
        );

      if(
        !semana.inicioSemana ||
        !semana.fimSemana
      ){
        return;
      }

      const chaveSemana =
        Utilities.formatDate(
          semana.inicioSemana,
          Session.getScriptTimeZone(),
          "yyyy-MM-dd"
        );

      if(
        semanasNovoPedidoRegistradas.has(
          chaveSemana
        )
      ){
        return;
      }

      semanasNovoPedidoRegistradas.add(
        chaveSemana
      );

      try{

        AUD_registrarAlteracoes_({

          idMovimentacao:
            idMovimentacaoAuditoria,

          dataAlteracao:
            dataAlteracaoAuditoria,

          usuario:
            sessaoAuditoria.usuario,

          perfil:
            sessaoAuditoria.perfil,

          pedido:
            pedido || "",

          cliente:
            cliente || "",

          local:
            local || "",

          dataEvento:
            dataEventoFormatada || "",

          idEtapa:
            etapaNova.id,

          etapa:
            etapaNova.etapa,

          dataEtapa:
            etapaNova.dataEtapa,

          dataEtapaAnterior:
            "",

          dataEtapaNova:
            etapaNova.dataEtapa,

          tipoMovimentacao:
            "Inclusão",

          alteracoes: [

            {

              campo:
                "novoPedido",

              nomeCampo:
                "Novo Pedido",

              tipoAlteracao:
                "Inclusão de novo pedido",

              valorAnterior:
                "",

              valorNovo:
                String(
                  pedido || ""
                )
            }
          ]
        });

      }catch(erroAuditoriaNovoPedido){

        console.error(
          "Erro ao registrar novo pedido na auditoria:",
          erroAuditoriaNovoPedido
        );
      }
    }
  );
}


// ===============================
// 🔥 REMOVER SOMENTE FRETES DAS ETAPAS
// QUE FORAM EXCLUÍDAS DESTE PEDIDO
// ===============================

const sheetFrete = SpreadsheetApp
  .openById("1uVhL4YbFbheyWDfVpDSwzPRg1P4AmgkMhAUhogrSVQs")
  .getSheetByName("Fretes Ch");

const dadosFrete = sheetFrete.getDataRange().getValues();

// IDs que EXISTEM AGORA no pedido salvo
const idsAtuais = etapasFinal
  .map(e => String(e.id || "").trim())
  .filter(Boolean);

// Buscar todos os IDs que pertencem a este pedido
const idsPedidoCronograma = [];

for(let i = 1; i < dados.length; i++){

  const pedidoLinha =
    String(dados[i][1] || "").trim();

  const idLinha =
    String(dados[i][0] || "").trim();

  if(
    pedidoLinha === String(pedido).trim() &&
    idLinha
  ){
    idsPedidoCronograma.push(idLinha);
  }

}

// Remover somente fretes deste pedido
for(let i = dadosFrete.length - 1; i >= 1; i--){

  const idFrete =
    String(dadosFrete[i][0] || "").trim();

  if(!idFrete) continue;

  if(idFrete.startsWith("MANUAL")) continue;

  // Só mexe em fretes deste pedido
  if(idsPedidoCronograma.includes(idFrete)){

    if(!idsAtuais.includes(idFrete)){

      sheetFrete.deleteRow(i + 1);

    }

  }

}

// ==========================================
// ESPELHAR RESPONSÁVEL + EQUIPE
// ==========================================

espelharResponsavelEquipe_(
  sheet,
  etapasFinal
);

// ==========================================
// VAGAS DE FREE PEDIDAS NO PRÓPRIO PEDIDO
// ==========================================
const resultadoFree =
  FREE_criarVagasDoPedido_(
    payload && payload.auditoria ? payload.auditoria.token : "",
    etapasFinal
  );

// 🔥 FECHA A FUNÇÃO
return resultadoFree
  ? { ok: true, free: resultadoFree }
  : true;
}

function espelharResponsavelEquipe_(sheet, etapas){

  if(!etapas || !etapas.length){
    return;
  }

  const dados = sheet.getDataRange().getValues();

  etapas.forEach(function(etapaOrigem){

    if(!etapaOrigem.espelharResponsavelEquipe){
      return;
    }

    const data =
      formatarDataSemFuso(
        etapaOrigem.dataEtapa
      );

    const tipo =
      String(etapaOrigem.etapa || "")
        .toLowerCase()
        .trim();

    for(let i = 1; i < dados.length; i++){

      const etapaPlanilha =
        String(dados[i][5] || "")
          .toLowerCase()
          .trim();

      const dataPlanilha =
        formatarDataSemFuso(
          dados[i][6]
        );

      if(dataPlanilha !== data){
        continue;
      }

      // CARREGAMENTO
      if(
        tipo.includes("carregamento") &&
        !etapaPlanilha.includes("carregamento")
      ){
        continue;
      }

      // TRIAGEM
      if(
        tipo.includes("triagem") &&
        etapaPlanilha !== tipo
      ){
        continue;
      }

      sheet.getRange(i + 1, 10).setValue(
        etapaOrigem.responsavel || ""
      );

      sheet.getRange(i + 1, 11).setValue(

        Array.isArray(etapaOrigem.equipe)

          ? etapaOrigem.equipe.join("\n")

          : (etapaOrigem.equipe || "")

      );

    }

  });

}

// 👇 AGORA SIM começa outra função
function parseData(valor) {

  if (!valor) return null;

  // já é Date válido
  if (Object.prototype.toString.call(valor) === "[object Date]") {
    if (!isNaN(valor.getTime())) {
      return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
    }
  }

  if (typeof valor === "string") {

    const clean = valor.split(" ")[0];

    // formato BR
    if (clean.includes("/")) {
      const [dia, mes, ano] = clean.split("/");
      return new Date(Number(ano), Number(mes)-1, Number(dia));
    }

    // formato ISO
    if (clean.includes("-")) {
      const [ano, mes, dia] = clean.split("-");
      return new Date(Number(ano), Number(mes)-1, Number(dia));
    }

    // fallback seguro
    const dataTeste = new Date(clean);
    if (!isNaN(dataTeste.getTime())) {
      return new Date(
        dataTeste.getFullYear(),
        dataTeste.getMonth(),
        dataTeste.getDate()
      );
    }
  }

  return null;
}

function formatISO(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function combinarDataHora(data, hora) {

  if (!data) return new Date("2100-01-01");

  let d = new Date(data);

  if (isNaN(d.getTime())) return new Date("2100-01-01");

  d.setHours(0,0,0,0);

  if (hora !== null && hora !== "" && hora !== undefined) {

    if (typeof hora === "number") {

      const totalMin = Math.round(hora * 24 * 60);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;

      d.setHours(h, m, 0, 0);
    }

    else if (typeof hora === "string" && hora.includes(":")) {

      const [h, m] = hora.split(":");
      d.setHours(Number(h), Number(m), 0, 0);
    }
  }

  return d;
}

function formatarDataSemFuso(valor) {
  if (!valor) return "";

  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())) {
    const d = new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }

  if (typeof valor === "string") {
    const clean = valor.split(" ")[0];

    // ISO: yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      const [y, m, d] = clean.split("-").map(Number);
      const data = new Date(y, m - 1, d);
      return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
    }

    // BR: dd/mm/yyyy
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
      return clean;
    }
  }

  return "";
}

function teste() {
  const r = getCronogramaSemana("2026-03-17");
  Logger.log(JSON.stringify(r));
}
function validarSenhaPerfil(senhaDigitada) {

  const sheet = SpreadsheetApp
    .openById(
      "133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk"
    )
    .getSheetByName("Senhas");

  if (!sheet) {
    throw new Error(
      'A aba "Senhas" não foi encontrada.'
    );
  }

  const dados = sheet
    .getDataRange()
    .getValues();

  const senhaInformada = String(
    senhaDigitada || ""
  ).trim();

  if (!senhaInformada) {
    return null;
  }

  for (let i = 1; i < dados.length; i++) {

    const setorOriginal = String(
      dados[i][0] || ""
    ).trim();

    const setorNormalizado = setorOriginal
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();

    const senhaPlanilha = String(
      dados[i][1] || ""
    ).trim();

    const usuario = String(
      dados[i][2] ||
      setorOriginal ||
      ""
    ).trim();

    if (senhaPlanilha !== senhaInformada) {
      continue;
    }

    let perfil = "";

    if (
      setorNormalizado.includes("montagem")
    ) {

      perfil = "montagem";

    } else if (
      setorNormalizado.includes("expedicao")
    ) {

      perfil = "expedicao";

    } else if (
      setorNormalizado.includes("opera internas") ||
      setorNormalizado.includes("operacoes internas") ||
      setorNormalizado.includes("galpao")
    ) {

      perfil = "internas";

    } else if (
      setorNormalizado.includes("motorista") ||
      setorNormalizado.includes("frete")
    ) {

      perfil = "frete";

    } else {

      continue;
    }

    const token = AUD_criarTokenSessao_(
      usuario,
      perfil
    );

    return {
      valido: true,
      perfil: perfil,
      usuario: usuario,
      token: token,
      duracaoSegundos:
        AUD_DURACAO_TOKEN_SEGUNDOS
    };
  }

  return null;
}
function salvarResponsavel(nome){

  const sh = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Responsaveis");

  const id = "RESP" + new Date().getTime();

  sh.appendRow([
    id,
    nome,
    "Ativo"
  ]);

  return true;
}

function salvarEquipe(nome){

  const sh = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Equipes");

  const id = "EQP" + new Date().getTime();

  sh.appendRow([
    id,
    nome,
    "Interna",
    "Ativo"
  ]);

  return true;
}

function salvarCaminhao(nome, tipo, empresa, vinculo){

const sh = SpreadsheetApp
  .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
  .getSheetByName("Caminhoes");

  const id = "CAM" + new Date().getTime();

  sh.appendRow([
    id,
    nome,
    tipo,
    empresa,
    vinculo,
    "Ativo"
  ]);

  return true;
}
function listarCaminhoes(){

  const sh = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Caminhoes");

  if (!sh) return [];

  const dados = sh.getDataRange().getValues();

  const lista = [];

  for(let i = 1; i < dados.length; i++){

    if(!dados[i][1]) continue;

    lista.push({
      id: dados[i][0],
      nome: dados[i][1],
      tipo: dados[i][2],
      empresa: dados[i][3],
      vinculo: dados[i][4],
      status: dados[i][5]
    });

  }

  return lista;
}
function listarResponsaveis(){

  const sh = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Responsaveis");

  if (!sh) return [];

  const dados = sh.getDataRange().getValues();
  const lista = [];

  for(let i = 1; i < dados.length; i++){

    if(!dados[i][1]) continue;

    lista.push({
      id: dados[i][0],
      nome: dados[i][1],
      status: dados[i][2]
    });

  }

  return lista;
}
function listarEquipes(){

  const sh = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Equipes");

  if (!sh) return [];

  const dados = sh.getDataRange().getValues();
  const lista = [];

  for(let i = 1; i < dados.length; i++){

    if(!dados[i][1]) continue;

    lista.push({
      id: dados[i][0],
      nome: dados[i][1],
      tipo: dados[i][2],
      status: dados[i][3]
    });

  }

  return lista;
}
function salvarPedidosEmLote(lista){

  if(!lista || !lista.length) return false;

  lista.forEach(payload => {

    // 🔥 reutiliza sua função principal (com triagem automática, ID, etc)
    salvarPedidoCompleto(payload);

  });

  return true;
}
function gerarTriagensRetroativas() {

  const sheet = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Cronograma");

  const dados = sheet.getDataRange().getValues();

  const novasLinhas = [];

  for (let i = 1; i < dados.length; i++) {

    const linha = dados[i];

    const pedido      = linha[1];
    const dataEvento  = linha[2];
    const cliente     = linha[3];
    const local       = linha[4];
    const etapaRaw    = linha[5];
    const dataEtapa   = linha[6];

    if (!etapaRaw || !dataEtapa) continue;

    const etapa = etapaRaw
      .toString()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    const data = new Date(dataEtapa);
    if (isNaN(data.getTime())) continue;

    // ================================
    // CARREGAMENTO → TRIAGEM SEPARAÇÃO
    // ================================
    if (etapa.includes("carregamento")) {

      const triagemSeparacao = new Date(data);
      triagemSeparacao.setDate(triagemSeparacao.getDate() - 1);

      novasLinhas.push([
        Utilities.getUuid(),
        pedido,
        dataEvento,
        cliente,
        local,
        "Triagem Separação",
        triagemSeparacao,
        "", // horario
        "", // caminhao
        "Expedição", // 👤 RESPONSÁVEL FIXO (ajusta se quiser outro nome)
        "Galpão",     // 👥 EQUIPE FIXA
        "Triagem automática"
      ]);
    }

    // ================================
    // DESMONTAGEM → TRIAGEM CONFERÊNCIA
    // ================================
    if (etapa.includes("desmontagem")) {

      novasLinhas.push([
        Utilities.getUuid(),
        pedido,
        dataEvento,
        cliente,
        local,
        "Triagem Conferência",
        data,
        "", // horario
        "", // caminhao
        "Expedição", // 👤 RESPONSÁVEL FIXO
        "Galpão",     // 👥 EQUIPE FIXA
        "Triagem automática"
      ]);
    }

  }

  // SALVAR
  if (novasLinhas.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, novasLinhas.length, novasLinhas[0].length)
      .setValues(novasLinhas);
  }

  return "Triagens criadas: " + novasLinhas.length;
}
function salvarAgenda(dados){
  /* Agenda: precisa da permissão da Agenda no Acervo (out/2026). */
  CRON_exigirAgenda_();


  const sh = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Agenda");

  sh.appendRow([
    new Date(), // envio
    dados.responsavel || "",
    dados.data || "",
    dados.setor || "",
    dados.tipo || "",
    dados.descricao || "",
    dados.caminhao || "", // padrão: XG|XL
dados.equipe || "",
dados.equipeQtd || "", // 🔥 ESSENCIAL
"'" + (dados.horario || "") // J: horário (texto, opcional)
  ]);

  return true;
}


function getAgenda(){

  const sh = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Agenda");

  const dados = sh.getDataRange().getValues();
  const tz = Session.getScriptTimeZone();

  let lista = [];

  for(let i = 1; i < dados.length; i++){

    const data = dados[i][2];
    if(!data) continue;

    const d = new Date(data);

    lista.push({
      envio: new Date(dados[i][0]).getTime(),
      responsavel: dados[i][1],
      data: Utilities.formatDate(d, tz, "yyyy-MM-dd"),
      setor: dados[i][3],
      tipo: dados[i][4],
      descricao: dados[i][5],
      caminhao: dados[i][6] || "",
      equipe: dados[i][7] || "",
      equipeQtd: dados[i][8] || "", // 🔥 NOVO
      horario: dados[i][9] instanceof Date
        ? Utilities.formatDate(dados[i][9], tz, "HH:mm")
        : String(dados[i][9] || "").replace(/^'/, "")
    });

  }

  return lista;
}
function validarSenhaAgenda(responsavel, senha){
  /* Senha removida (out/2026): quem protege agora é o login do Acervo (api/gs.js). */
  return Acervo.pode("logistica.cronograma.agenda");


  const sh = SpreadsheetApp
    .openById("133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk")
    .getSheetByName("Senhas");

  const dados = sh.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const setor = String(dados[i][0]).trim();
    const senhaPlanilha = String(dados[i][1]).trim();

    if(setor === String(responsavel).trim() &&
       senhaPlanilha === String(senha).trim()){
      return true;
    }

  }

  return false;
}


function atualizarAgendaPorEnvio(obj){
  CRON_exigirAgenda_(); /* permissão da Agenda no Acervo (out/2026) */


  const sh = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Agenda");

  const dados = sh.getDataRange().getValues();

  const envioCliente = Number(obj.envio);

  for(let i = 1; i < dados.length; i++){

    const envioPlanilha = new Date(dados[i][0]).getTime();

    if(envioPlanilha === envioCliente){

      sh.getRange(i + 1, 3).setValue(obj.dados.data || "");
      sh.getRange(i + 1, 4).setValue(obj.dados.setor || "");
      sh.getRange(i + 1, 5).setValue(obj.dados.tipo || "");
      sh.getRange(i + 1, 6).setValue(obj.dados.descricao || "");
      sh.getRange(i + 1, 7).setValue(obj.dados.caminhao || "");
sh.getRange(i + 1, 8).setValue(obj.dados.equipe || "");
sh.getRange(i + 1, 9).setValue(obj.dados.equipeQtd || ""); // 🔥 NOVO
sh.getRange(i + 1, 10).setValue("'" + (obj.dados.horario || ""));

      return true;
    }
  }

  return false;
}


function excluirAgendaPorEnvio(envio){
  CRON_exigirAgenda_(); /* permissão da Agenda no Acervo (out/2026) */


  const sh = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Agenda");

  const dados = sh.getDataRange().getValues();

  const envioCliente = Number(envio);

  for(let i = 1; i < dados.length; i++){

    const envioPlanilha = new Date(dados[i][0]).getTime();

    if(envioPlanilha === envioCliente){

      sh.deleteRow(i + 1);
      return true;
    }
  }

  return false;
}
function getCaminhoes(){

  const sh = SpreadsheetApp.getActive().getSheetByName("Caminhoes");
  const dados = sh.getDataRange().getValues();

  let lista = [];

  for(let i = 1; i < dados.length; i++){

    lista.push({
tipo: String(dados[i][2] || "").trim(),     // G, M, XL
empresa: String(dados[i][3] || "").trim()   // Simas Frete
    });

  }

  return lista;
}

function getEquipes(){
  const sh = SpreadsheetApp.getActive().getSheetByName("Equipes");
  return sh.getDataRange().getValues().slice(1).map(r => ({
    nome: r[1],
    tipo: r[2]
  }));
}
function enviarParaFrete(dados){

  const sheetFrete = SpreadsheetApp
    .openById("1uVhL4YbFbheyWDfVpDSwzPRg1P4AmgkMhAUhogrSVQs")
    .getSheetByName("Fretes Ch");

  const sheetCaminhoes = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Caminhoes");

  const listaFrete = sheetFrete.getDataRange().getValues();
  const listaCaminhoes = sheetCaminhoes.getDataRange().getValues();

  // =========================
  // 🔥 APAGA LINHAS DO MESMO ID
  // =========================
  for(let i = listaFrete.length - 1; i >= 1; i--){
const idLinha = String(listaFrete[i][0] || "");

if(idLinha === dados.id){
      sheetFrete.deleteRow(i + 1);
    }
  }

  // =========================
  // 🔍 MAPA TIPO → EMPRESA
  // =========================
  let mapaEmpresa = {};

  for(let i = 1; i < listaCaminhoes.length; i++){
    const tipo = (listaCaminhoes[i][2] || "").trim();
    const empresa = (listaCaminhoes[i][3] || "").trim();
    if(tipo) mapaEmpresa[tipo] = empresa;
  }

  // =========================
  // 🚛 QUEBRA CAMINHÕES
  // =========================
  const lista = String(dados.caminhao || "")
    .split("|")
    .map(c => c.trim())
    .filter(Boolean);

  // =========================
  // 🏙️ EXTRAI CIDADE
  // =========================
  function extrairCidade(endereco){
    if(!endereco) return "";
    const partes = endereco.split(",");
    return partes.length >= 3 ? partes[partes.length - 2].trim() : "";
  }

  const cidade = extrairCidade(dados.local);

  // =========================
  // 🔥 INSERE NOVO
  // =========================
  lista.forEach(tipo => {

    const transportadora = mapaEmpresa[tipo] || "";

const GALPAO =
  "Chiavari Eventos - Estrada União e Indústria - Itaipava, Petrópolis - RJ, Brasil";

const etapa =
  String(dados.etapa || "")
    .toLowerCase();

let origem = "";
let destino = "";

if(etapa.includes("carregamento")){

  origem = GALPAO;
  destino = dados.local;

}
else if(etapa.includes("desmontagem")){

  origem = dados.local;
  destino = GALPAO;

}
else{

  origem = dados.local;
  destino = "";

}

const distanciaIda =
  Number(
    calcularDistanciaRodoviariaKm(
      GALPAO,
      dados.local
    ) || 0
  );

const distanciaVolta =
  Number(
    calcularDistanciaRodoviariaKm(
      dados.local,
      GALPAO
    ) || 0
  );

const distanciaKm =
  Math.max(
    distanciaIda,
    distanciaVolta
  );
  
const valorFrete =
  Number(
    obterValorFrete(
      Number(distanciaKm),
      tipo
    ) || 0
  );

const valorMeioFrete =
  valorFrete / 2;

sheetFrete.appendRow([
  dados.id,
  "Cronograma",
  transportadora,
  dados.data,
  dados.pedido,
  tipo,

  // G
  origem,

  // H
  destino,

  // I
  distanciaKm,

  // J
  cidade,

  // K
  valorMeioFrete
]);

  });

}
function reprocessarFretes(){

  const sheetCronograma = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Cronograma");

  const sheetFrete = SpreadsheetApp
    .openById("1uVhL4YbFbheyWDfVpDSwzPRg1P4AmgkMhAUhogrSVQs")
    .getSheetByName("Fretes Ch");

  const dados = sheetCronograma.getDataRange().getValues();

  // 🔥 LIMPA FRETE (mantém cabeçalho)
  sheetFrete.getRange(2,1,sheetFrete.getLastRow(),11).clearContent();

  // 🔍 buscar caminhões
  const sheetCaminhoes = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Caminhoes");

  const listaCaminhoes = sheetCaminhoes.getDataRange().getValues();

  let mapaEmpresa = {};

  for(let i = 1; i < listaCaminhoes.length; i++){
    const tipo = (listaCaminhoes[i][2] || "").trim();
    const empresa = (listaCaminhoes[i][3] || "").trim();
    if(tipo) mapaEmpresa[tipo] = empresa;
  }

  function extrairCidade(endereco){
    if(!endereco) return "";
    const partes = endereco.split(",");
    return partes.length >= 3 ? partes[partes.length - 2].trim() : "";
  }

  // =========================
  // 🔥 PERCORRE CRONOGRAMA
  // =========================
  for(let i = 1; i < dados.length; i++){

    const id = dados[i][0];
    const pedido = dados[i][1];
    const local = dados[i][4];
    const etapa = String(dados[i][5] || "").toLowerCase();
    const data = dados[i][6];
    const caminhao = dados[i][8];

    if(!id || !data) continue;

    if(
      etapa.includes("carregamento") ||
      etapa.includes("desmontagem")
    ){

      const lista = String(caminhao || "")
        .split("\n")
        .join("|")
        .split("|")
        .map(c => c.trim())
        .filter(Boolean);

      const cidade = extrairCidade(local);

      lista.forEach(tipo => {

        const transportadora = mapaEmpresa[tipo] || "";

        sheetFrete.appendRow([
          id,
          "Cronograma",
          transportadora,
          data,
          pedido,
          tipo,
          local,
          "",
          "",
          cidade,
          ""
        ]);

      });

    }

  }

  return "Fretes reprocessados com sucesso!";
}

function validarSenhaResponsavel(responsavel, senha){

  const ID = "133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk";

  const aba = SpreadsheetApp
    .openById(ID)
    .getSheetByName("Senhas");

  const dados = aba.getDataRange().getValues();

  const nome = String(responsavel || "")
    .trim()
    .toLowerCase();

  const linha = dados.find(r =>
    String(r[0] || "")
      .trim()
      .toLowerCase() === nome
  );

  if(!linha) return false;

  const senhaCorreta = String(linha[1] || "").trim();

  return String(senha).trim() === senhaCorreta;
}
function getEtapaOperacao(id){

  const aba = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Cronograma");

  const dados = aba.getDataRange().getDisplayValues();

  for(let i = 1; i < dados.length; i++){

    const row = dados[i];

    const linhaId = row[0];

    if(String(linhaId).trim() === String(id).trim()){

      return {

        id: row[0],
        pedido: row[1],
        dataEvento: row[2],
        cliente: row[3],
        local: row[4],

        etapa: row[5],
        dataEtapa: row[6],

        horario: row[7],
        caminhao: row[8],

        responsavel: row[9],

        equipe: row[10],
        observacao: row[11]

      };

    }

  }

  return null;

}

/************************************************
 * 🔥 CALCULAR DISTÂNCIA EM METROS
 ************************************************/
function calcularDistanciaMetros(
  lat1,
  lon1,
  lat2,
  lon2
){

  const R = 6371000;

  const dLat =
    (lat2 - lat1) * Math.PI / 180;

  const dLon =
    (lon2 - lon1) * Math.PI / 180;

  const a =

    Math.sin(dLat/2) *
    Math.sin(dLat/2) +

    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *

    Math.sin(dLon/2) *
    Math.sin(dLon/2);

  const c =
    2 * Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1-a)
    );

  const distancia = R * c;

  return Math.round(distancia);

}

/************************************************
 * 🔥 UPLOAD FOTO CHECKLIST
 ************************************************/
function uploadFotoChecklist(
  base64,
  nomeArquivo
){

  // 🔥 ID DA PASTA
const PASTA_ID =
  "1CwbSFQexjk-AmERUWhKEzsy0PvgA9UQv";

  const texto =
    String(base64 || "");

  const partes =
    texto.match(
      /^data:([^;]+);base64,(.+)$/
    );

  if(!partes){
    throw new Error("Foto inválida. Tire a foto novamente.");
  }

  const contentType =
    partes[1];

  const bytes =
    Utilities.base64Decode(partes[2]);

  const blob =
    Utilities.newBlob(
      bytes,
      contentType,
      nomeArquivo
    );

  /* O Drive às vezes falha de forma passageira: tenta até 3 vezes */
  let arquivo = null;
  let ultimoErro = null;

  for(let tentativa = 1; tentativa <= 3 && !arquivo; tentativa++){
    try{
      arquivo =
        DriveApp
          .getFolderById(PASTA_ID)
          .createFile(blob);
    }catch(e){
      ultimoErro = e;
      Utilities.sleep(800 * tentativa);
    }
  }

  if(!arquivo){
    throw new Error(
      "Não foi possível salvar a foto no Drive. Tente novamente. (" +
      (ultimoErro && ultimoErro.message ? ultimoErro.message : "erro desconhecido") +
      ")"
    );
  }

  /* Se o compartilhamento falhar, a foto continua salva */
  try{
    arquivo.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );
  }catch(e){
    console.warn("setSharing falhou para " + nomeArquivo + ": " + e);
  }

  return {
    url: arquivo.getUrl(),
    id: arquivo.getId()
  };

}
function buscarItensOperacao(termo){

  const ID_PLANILHA =
    "133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk";

  const ABA = "Itens";

  const sh = SpreadsheetApp
    .openById(ID_PLANILHA)
    .getSheetByName(ABA);

  const dados =
    sh.getDataRange().getValues();

  const resultado = [];

  termo = String(termo || "")
    .toLowerCase()
    .trim();

  for(let i = 1; i < dados.length; i++){

    const nome =
      String(dados[i][1] || "").trim();

    const tipo =
      String(dados[i][4] || "").trim();

    // 🔥 SOMENTE ITENS
    if(tipo !== "ITEM") continue;

    if(
      nome.toLowerCase().includes(termo)
    ){

      resultado.push(nome);

    }

    if(resultado.length >= 15) break;

  }

  return resultado;

}
function buscarEmpresasTerceirizadas(){

  const ID_PLANILHA =
    "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ";

  const ABA = "Equipes";

  const ss =
    SpreadsheetApp.openById(
      ID_PLANILHA
    );

  const aba =
    ss.getSheetByName(ABA);

  if(!aba){
    return [];
  }

  const dados =
    aba.getDataRange().getValues();

  const resultado = [];

  for(let i = 1; i < dados.length; i++){

    const nome =
      String(
        dados[i][1] || ""
      ).trim();

    const tipo =
      String(
        dados[i][2] || ""
      )
      .toLowerCase()
      .trim();

    const status =
      String(
        dados[i][3] || ""
      )
      .toLowerCase()
      .trim();

    // 🔥 SOMENTE TERCEIRIZADA
    if(
      tipo !== "terceirizada"
    ){
      continue;
    }

    // 🔥 SOMENTE ATIVO
    if(
      status !== "ativo"
    ){
      continue;
    }

    if(nome){

      resultado.push(nome);

    }

  }

  // 🔥 ORDENA ALFABÉTICO
  resultado.sort();

  return resultado;

}
function criarRegistroMontagem(dados){

const ss = SpreadsheetApp
  .openById(
    "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
  );

const aba =
  ss.getSheetByName(
    "Montagem"
  );

const id =
  "MONT_" + Date.now();

  aba.appendRow([
    id,
    dados.data || "",
    dados.hora || "",
    dados.idCronograma || "",
    dados.pedido || "",
    dados.cliente || "",
    dados.localEvento || "",
    dados.responsavel || "",
    "NÃO","NÃO","NÃO","NÃO","NÃO","NÃO","NÃO","NÃO","NÃO",
    "EM ANDAMENTO"
  ]);

  return id;

}

function salvarChecklistPreMontagem(payload){
  return salvarChecklist(payload);
}

function salvarChecklist(dados){

  const ss = SpreadsheetApp.openById(
    "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
  );

  const aba = ss.getSheetByName("Checklist");

  if(!aba){
    throw new Error(
      "Aba Checklist não encontrada"
    );
  }

  let fotoUrl = "";

  // =====================================
  // 🔥 UPLOAD FOTO
  // =====================================
  if(dados.foto){

    try{

      const upload =
        uploadFotoChecklist(

          dados.foto,

          "Checklist_" +
          Date.now() +
          ".jpg"

        );

fotoUrl =

  "https://drive.google.com/uc?export=view&id=" +

  upload.id;

    }catch(e){

      fotoUrl = "";

    }

  }

  // =====================================
  // 🔥 GALPÃO
  // =====================================
  const abaGalpao =
    ss.getSheetByName("Galpão");

  if(!abaGalpao){

    throw new Error(
      "Aba Galpão não encontrada"
    );

  }

  const latGalpao =
    Number(
      abaGalpao
        .getRange("A1")
        .getValue()
    );

  const lonGalpao =
    Number(
      abaGalpao
        .getRange("B1")
        .getValue()
    );

  const latitudeUsuario =
    coordenadaOperacao_(dados.latitude);

  const longitudeUsuario =
    coordenadaOperacao_(dados.longitude);

  const distanciaGalpao =
    calcularDistanciaMetros(

      latGalpao,
      lonGalpao,

      latitudeUsuario,
      longitudeUsuario

    );

  // =====================================
  // 🔥 SALVAR CHECKLIST
  // =====================================
  aba.appendRow([

    // A
    Utilities.getUuid(),

    // B 🔥 ID CRONOGRAMA
    dados.idCronograma || "",

    // C
    new Date(),

    // D
    dados.latitude || "",

    // E
    dados.longitude || "",

    // F
    dados.precisaoGPS ||
    dados.accuracy || "",

    // G
    distanciaGalpao,

    // H
    JSON.stringify(

      dados.itens ||

      dados.checklist ||

      []

    ),

    // I
    fotoUrl

  ]);

  return true;

}

function atualizarStatusMontagem(idMontagem, coluna){

  const aba = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Montagem");

  const dados = aba.getDataRange().getValues();
  const headers = dados[0];

  const colID = headers.indexOf("ID");
  const colStatus = headers.indexOf(coluna);

  if(colID === -1 || colStatus === -1){
    return false;
  }

  for(let i = 1; i < dados.length; i++){

    if(String(dados[i][colID]) === String(idMontagem)){

      aba
        .getRange(i + 1, colStatus + 1)
        .setValue("SIM");

      return true;

    }

  }

  return false;

}
function calcularDistanciaMetros(
  lat1,
  lon1,
  lat2,
  lon2
){

  /* Sem coordenada de um dos lados (ex.: celular sem GPS): sem distância */
  if(!Number(lat1) || !Number(lon1) || !Number(lat2) || !Number(lon2)){
    return "";
  }

  function toRad(valor){
    return valor * Math.PI / 180;
  }

  const R = 6371000;

  const dLat =
    toRad(lat2 - lat1);

  const dLon =
    toRad(lon2 - lon1);

  const a =

    Math.sin(dLat / 2) *
    Math.sin(dLat / 2) +

    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *

    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c =
    2 * Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return Math.round(R * c);

}

function verificarChecklistJaEnviado(
  idCronograma
){

  const aba =
    SpreadsheetApp

      .openById(
        "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
      )

      .getSheetByName(
        "Checklist"
      );

  const dados =
    aba.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const linha = dados[i];

    // 🔥 COLUNA B
    const id =
      String(
        linha[1] || ""
      ).trim();

    if(

      id ===
      String(idCronograma).trim()

    ){

      return {

        enviado:true,

        // 🔥 COLUNA I
        foto:
          linha[8] || ""

      };

    }

  }

  return {

    enviado:false

  };

}

function obterCoordenadasEndereco(
  endereco
){

  try{

    const resultado =

      Maps.newGeocoder()
        .geocode(endereco);

    if(
      resultado.status !== "OK"
    ){

      return {
        latitude:"",
        longitude:""
      };

    }

    const local =

      resultado.results[0]
        .geometry.location;

    return {

      latitude:
        local.lat,

      longitude:
        local.lng

    };

  }catch(e){

    Logger.log(e);

    return {

      latitude:"",
      longitude:""

    };

  }

}

function salvarEquipeTerceirizada(dados){

  const jaEnviada =
    verificarEquipeTerceirizadaJaEnviada(dados.idCronograma);

  if(jaEnviada && jaEnviada.enviado){
    return { sucesso:true, jaExistia:true, foto:jaEnviada.foto || "" };
  }

  const ss = SpreadsheetApp.openById(
    "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
  );

  const aba =
ss.getSheetByName(
  "EquipeTerceirizada"
);

  if(!aba){

    throw new Error(
      "Aba Equipe Terceirizada não encontrada"
    );

  }

  // =========================================
  // 🔥 BUSCA GPS EVENTO NO CRONOGRAMA
  // =========================================

  const abaCronograma =
    ss.getSheetByName(
      "Cronograma"
    );

  const dadosCronograma =
    abaCronograma
      .getDataRange()
      .getValues();

  let latEvento = "";
  let lonEvento = "";

  for(let i = 1; i < dadosCronograma.length; i++){

    const linha = dadosCronograma[i];

    // 🔥 COLUNA A = ID
    const idLinha =
      String(linha[0] || "").trim();

    if(
      idLinha ===
      String(dados.idCronograma).trim()
    ){

      // 🔥 COLUNA N
      latEvento =
        Number(
          linha[13] || 0
        );

      // 🔥 COLUNA O
      lonEvento =
        Number(
          linha[14] || 0
        );

      break;

    }

  }

  // =========================================
  // 🔥 GPS USUÁRIO
  // =========================================

  const latitudeUsuario =
    coordenadaOperacao_(dados.latitude);

  const longitudeUsuario =
    coordenadaOperacao_(dados.longitude);

  // =========================================
  // 🔥 DISTÂNCIA EVENTO
  // =========================================

  let distanciaEvento = "";

  if(
    latEvento &&
    lonEvento
  ){

    distanciaEvento =
      calcularDistanciaMetros(

        latEvento,
        lonEvento,

        latitudeUsuario,
        longitudeUsuario

      );

  }

  // =========================================
  // 🔥 FOTO
  // =========================================

  let fotoUrl = "";

  if(dados.foto){

    try{

      const upload =
        uploadFotoChecklist(

          dados.foto,

          "EquipeTerceirizada_" +
          Date.now() +
          ".jpg"

        );

      fotoUrl =

        "https://drive.google.com/uc?export=view&id=" +

        upload.id;

    }catch(e){

      throw new Error(
        "Não foi possível salvar a foto da equipe. Tente novamente."
      );

    }

  }

  // =========================================
  // 🔥 DATA/HORA
  // =========================================

  const agora =
    new Date();

  const dataFormatada =
    Utilities.formatDate(

      agora,

      Session.getScriptTimeZone(),

      "dd/MM/yyyy"

    );

  const horaFormatada =
    Utilities.formatDate(

      agora,

      Session.getScriptTimeZone(),

      "HH:mm:ss"

    );

  // =========================================
  // 🔥 SALVAR
  // =========================================

  aba.appendRow([

    // A
    Utilities.getUuid(),

    // B
    dados.idCronograma || "",

    // C
    dados.pedido || "",

    // D
    dados.empresa || "",

    // E
    dados.quantidade || "",

    // F
    dados.observacao || "",

    // G
    latitudeUsuario,

    // H
    longitudeUsuario,

    // I
    dados.precisaoGPS ||
    dados.accuracy || "",

    // J
    distanciaEvento,

    // K
    fotoUrl,

    // L
    dataFormatada,

    // M
    horaFormatada,

    // N
    agora

  ]);

  return {

    sucesso:true,

    distancia:
      distanciaEvento,

    foto:
      fotoUrl

  };

}
function verificarEquipeTerceirizadaJaEnviada(
  idCronograma
){

  const aba =
    SpreadsheetApp
      .openById(
        "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
      )
      .getSheetByName(
        "EquipeTerceirizada"
      );

  const dados =
    aba.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const linha = dados[i];

    // 🔥 COLUNA B
    const id =
      String(linha[1] || "").trim();

    if(
      id ===
      String(idCronograma).trim()
    ){

      return {

        enviado:true,

        foto:
          linha[10] || ""

      };

    }

  }

  return {

    enviado:false

  };

}
function salvarSacolasProtecao(dados){

  const jaEnviadas =
    verificarSacolasJaEnviadas(dados.idCronograma);

  if(jaEnviadas && jaEnviadas.enviado){
    return { sucesso:true, jaExistia:true, sacolas:jaEnviadas.sacolas || [] };
  }

  const ss = SpreadsheetApp.openById(
    "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
  );

  const aba =
    ss.getSheetByName(
      "Montagem_Sacolas"
    );

  if(!aba){

    throw new Error(
      "Aba Montagem_Sacolas não encontrada"
    );

  }

  // =========================================
  // 🔥 GPS EVENTO
  // =========================================

  const abaCronograma =
    ss.getSheetByName(
      "Cronograma"
    );

  const dadosCronograma =
    abaCronograma
      .getDataRange()
      .getValues();

  let latEvento = "";
  let lonEvento = "";

  for(let i = 1; i < dadosCronograma.length; i++){

    const linha = dadosCronograma[i];

    const idLinha =
      String(linha[0] || "").trim();

    if(
      idLinha ===
      String(dados.idCronograma).trim()
    ){

      latEvento =
        Number(linha[13] || 0);

      lonEvento =
        Number(linha[14] || 0);

      break;

    }

  }

  // =========================================
  // 🔥 GPS USUÁRIO
  // =========================================

  const latitudeUsuario =
    coordenadaOperacao_(dados.latitude);

  const longitudeUsuario =
    coordenadaOperacao_(dados.longitude);

  // =========================================
  // 🔥 DISTÂNCIA
  // =========================================

  let distanciaEvento = "";

  if(
    latEvento &&
    lonEvento
  ){

    distanciaEvento =
      calcularDistanciaMetros(

        latEvento,
        lonEvento,

        latitudeUsuario,
        longitudeUsuario

      );

  }

  // =========================================
  // 🔥 PROCESSA SACOLAS
  // =========================================

  const sacolasFinal = [];

  const lista =
    dados.sacolas || [];

  lista.forEach(function(sacola){

    const fotos = [];

    // 🔥 FOTO
    if(sacola.foto){

      try{

        const upload =
          uploadFotoChecklist(

            sacola.foto,

            "Sacola_" +
            Date.now() +
            ".jpg"

          );

        const fotoUrl =

          "https://drive.usercontent.google.com/download?id=" +

          upload.id +

          "&export=view&authuser=0";

        fotos.push(fotoUrl);

      }catch(e){

        throw new Error(
          "Não foi possível salvar a foto da sacola " +
          (sacola.codigo || "") +
          ". Tente novamente."
        );

      }

    }

    sacolasFinal.push({

      codigo:
        sacola.codigo || "",

      fotos:
        fotos

    });

  });

  // =========================================
  // 🔥 DATA/HORA
  // =========================================

  const agora =
    new Date();

  const dataFormatada =
    Utilities.formatDate(

      agora,

      Session.getScriptTimeZone(),

      "dd/MM/yyyy"

    );

  const horaFormatada =
    Utilities.formatDate(

      agora,

      Session.getScriptTimeZone(),

      "HH:mm:ss"

    );

  // =========================================
  // 🔥 SALVA 1 LINHA
  // =========================================

  aba.appendRow([

    // A
    Utilities.getUuid(),

    // B
    dados.idCronograma || "",

    // C
    dados.pedido || "",

    // D
    JSON.stringify(
      sacolasFinal
    ),

    // E
    latitudeUsuario,

    // F
    longitudeUsuario,

    // G
    dados.precisaoGPS ||
    dados.accuracy || "",

    // H
    distanciaEvento,

    // I
    dataFormatada,

    // J
    horaFormatada,

    // K
    agora

  ]);

  return {

    sucesso:true,

    sacolas:
      sacolasFinal

  };

}

function verificarSacolasJaEnviadas(
  idCronograma
){

  const aba =
    SpreadsheetApp
      .openById(
        "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
      )
      .getSheetByName(
        "Montagem_Sacolas"
      );

  const dados =
    aba.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const linha = dados[i];

    // 🔥 COLUNA B
    const id =
      String(linha[1] || "").trim();

    if(
      id ===
      String(idCronograma).trim()
    ){

      return {

        enviado:true,

        sacolas:

          jsonSeguroOperacao_(linha[3], [])

      };

    }

  }

  return {

    enviado:false

  };

}
function salvarPosicionamentoItens(dados){

  const jaEnviado =
    verificarPosicionamentoJaEnviado(dados.idCronograma);

  if(jaEnviado && jaEnviado.enviado){
    return { sucesso:true, jaExistia:true, fotos:jaEnviado.fotos || [] };
  }

  const ss = SpreadsheetApp.openById(
    "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
  );

  const aba =
    ss.getSheetByName(
      "Montagem_Posicionamento"
    );

  if(!aba){

    throw new Error(
      "Aba Montagem_Posicionamento não encontrada"
    );

  }

  // =========================================
  // 🔥 GPS EVENTO
  // =========================================

  const abaCronograma =
    ss.getSheetByName(
      "Cronograma"
    );

  const dadosCronograma =
    abaCronograma
      .getDataRange()
      .getValues();

  let latEvento = "";
  let lonEvento = "";

  for(let i = 1; i < dadosCronograma.length; i++){

    const linha = dadosCronograma[i];

    const idLinha =
      String(linha[0] || "").trim();

    if(
      idLinha ===
      String(dados.idCronograma).trim()
    ){

      latEvento =
        Number(linha[13] || 0);

      lonEvento =
        Number(linha[14] || 0);

      break;

    }

  }

  // =========================================
  // 🔥 GPS USUÁRIO
  // =========================================

  const latitudeUsuario =
    coordenadaOperacao_(dados.latitude);

  const longitudeUsuario =
    coordenadaOperacao_(dados.longitude);

  // =========================================
  // 🔥 DISTÂNCIA
  // =========================================

  let distanciaEvento = "";

  if(
    latEvento &&
    lonEvento
  ){

    distanciaEvento =
      calcularDistanciaMetros(

        latEvento,
        lonEvento,

        latitudeUsuario,
        longitudeUsuario

      );

  }

  // =========================================
  // 🔥 FOTOS
  // =========================================

  const fotosFinal = [];

  const fotos =
    dados.fotos || [];

  fotos.forEach(function(base64){

    try{

      const upload =
        uploadFotoChecklist(

          base64,

          "Posicionamento_" +
          Date.now() +
          ".jpg"

        );

      const fotoUrl =

        "https://drive.usercontent.google.com/download?id=" +

        upload.id +

        "&export=view&authuser=0";

      fotosFinal.push(
        fotoUrl
      );

    }catch(e){

      throw new Error(
        "Não foi possível salvar as fotos do posicionamento. Tente novamente."
      );

    }

  });

  // =========================================
  // 🔥 DATA/HORA
  // =========================================

  const agora =
    new Date();

  const dataFormatada =
    Utilities.formatDate(

      agora,

      Session.getScriptTimeZone(),

      "dd/MM/yyyy"

    );

  const horaFormatada =
    Utilities.formatDate(

      agora,

      Session.getScriptTimeZone(),

      "HH:mm:ss"

    );

  // =========================================
  // 🔥 SALVA
  // =========================================

  aba.appendRow([

    // A
    Utilities.getUuid(),

    // B
    dados.idCronograma || "",

    // C
    dados.pedido || "",

    // D
    JSON.stringify(
      fotosFinal
    ),

    // E
    dados.observacao || "",

    // F
    latitudeUsuario,

    // G
    longitudeUsuario,

    // H
    dados.precisaoGPS ||
    dados.accuracy || "",

    // I
    distanciaEvento,

    // J
    dataFormatada,

    // K
    horaFormatada,

    // L
    agora

  ]);

  return {

    sucesso:true,

    fotos:
      fotosFinal

  };

}
function verificarPosicionamentoJaEnviado(
  idCronograma
){

  const aba =
    SpreadsheetApp
      .openById(
        "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
      )
      .getSheetByName(
        "Montagem_Posicionamento"
      );

  const dados =
    aba.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const linha = dados[i];

    // 🔥 COLUNA B
    const id =
      String(linha[1] || "").trim();

    if(
      id ===
      String(idCronograma).trim()
    ){

      return {

        enviado:true,

        fotos:

          jsonSeguroOperacao_(linha[3], [])

      };

    }

  }

  return {

    enviado:false

  };

}

function salvarPercepcaoMontagem(dados){

  const ss = SpreadsheetApp.openById(
    "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
  );

  const aba =
    ss.getSheetByName(
      "Montagem_Percepcao"
    );

  if(!aba){

    throw new Error(
      "Aba Montagem_Percepcao não encontrada"
    );

  }

  // =========================================
  // 🔥 GPS EVENTO
  // =========================================

  const abaCronograma =
    ss.getSheetByName(
      "Cronograma"
    );

  const dadosCronograma =
    abaCronograma
      .getDataRange()
      .getValues();

  let latEvento = "";
  let lonEvento = "";

  for(let i = 1; i < dadosCronograma.length; i++){

    const linha = dadosCronograma[i];

    const idLinha =
      String(linha[0] || "").trim();

    if(
      idLinha ===
      String(dados.idCronograma).trim()
    ){

      latEvento =
        Number(linha[13] || 0);

      lonEvento =
        Number(linha[14] || 0);

      break;

    }

  }

  // =========================================
  // 🔥 GPS USUÁRIO
  // =========================================

  const latitudeUsuario =
    coordenadaOperacao_(dados.latitude);

  const longitudeUsuario =
    coordenadaOperacao_(dados.longitude);

  // =========================================
  // 🔥 DISTÂNCIA
  // =========================================

  let distanciaEvento = "";

  if(
    latEvento &&
    lonEvento
  ){

    distanciaEvento =
      calcularDistanciaMetros(

        latEvento,
        lonEvento,

        latitudeUsuario,
        longitudeUsuario

      );

  }

  // =========================================
  // 🔥 DATA/HORA
  // =========================================

  const agora =
    new Date();

  const dataFormatada =
    Utilities.formatDate(

      agora,

      Session.getScriptTimeZone(),

      "dd/MM/yyyy"

    );

  const horaFormatada =
    Utilities.formatDate(

      agora,

      Session.getScriptTimeZone(),

      "HH:mm:ss"

    );

  // =========================================
  // 🔥 SALVA
  // =========================================

  aba.appendRow([

    // A
    Utilities.getUuid(),

    // B
    dados.idCronograma || "",

    // C
    dados.pedido || "",

    // D
    dados.status || "",

    // E
    JSON.stringify(
      dados.tags || []
    ),

    // F
    dados.observacao || "",

    // G
    latitudeUsuario,

    // H
    longitudeUsuario,

    // I
    dados.precisaoGPS ||
    dados.accuracy || "",

    // J
    distanciaEvento,

    // K
    dataFormatada,

    // L
    horaFormatada,

    // M
    agora

  ]);

  return {

    sucesso:true

  };

}
function verificarPercepcaoJaEnviada(
  idCronograma
){

  const aba =
    SpreadsheetApp
      .openById(
        "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
      )
      .getSheetByName(
        "Montagem_Percepcao"
      );

  const dados =
    aba.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const linha = dados[i];

    const id =
      String(linha[1] || "").trim();

    if(
      id ===
      String(idCronograma).trim()
    ){

      return {

        enviado:true

      };

    }

  }

  return {

    enviado:false

  };

}
function salvarItensNaoEntregues(payload){

  const ss =
    SpreadsheetApp.openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ");

  const aba =
    ss.getSheetByName(
      "Montagem_ItensNaoEntregues"
    );

  // =========================================
  // 🔥 CRONOGRAMA
  // =========================================

  const abaCronograma =
    ss.getSheetByName(
      "Cronograma"
    );

  const dadosCronograma =
    abaCronograma
      .getDataRange()
      .getValues();

  let latEvento = "";
  let lonEvento = "";

  for(let i = 1; i < dadosCronograma.length; i++){

    const linha =
      dadosCronograma[i];

    const idLinha =
      String(
        linha[0] || ""
      ).trim();

    if(
      idLinha ===
      String(
        payload.idEtapa || ""
      ).trim()
    ){

      // COLUNA N
      latEvento =
        Number(
          linha[13] || 0
        );

      // COLUNA O
      lonEvento =
        Number(
          linha[14] || 0
        );

      break;

    }

  }

  // =========================================
  // 🔥 GPS USUÁRIO
  // =========================================

  const latitude =
    coordenadaOperacao_(payload.latitude);

  const longitude =
    coordenadaOperacao_(payload.longitude);

  // =========================================
  // 🔥 DISTÂNCIA
  // =========================================

  let distanciaEvento = "";

  if(
    latEvento &&
    lonEvento
  ){

    distanciaEvento =
      calcularDistanciaMetros(

        latEvento,
        lonEvento,

        latitude,
        longitude

      );

  }

  // =========================================
  // 🔥 DADOS
  // =========================================

  const agora =
    new Date();

  const id =
    Utilities.getUuid();

  const itensJson =
    JSON.stringify(
      payload.itens || []
    );

  // =========================================
  // 🔥 SALVAR
  // =========================================

  aba.appendRow([

    // A
    id,

    // B
    payload.idEtapa || "",

    // C
    payload.pedido || "",

    // D
    itensJson,

    // E
    latitude,

    // F
    longitude,

    // G
    payload.precisao || "",

    // H
    distanciaEvento,

    // I
    "",

    // J
    Utilities.formatDate(
      agora,
      Session.getScriptTimeZone(),
      "dd/MM/yyyy"
    ),

    // K
    Utilities.formatDate(
      agora,
      Session.getScriptTimeZone(),
      "HH:mm:ss"
    ),

    // L
    agora

  ]);

  return {

    sucesso:true,

    distancia:
      distanciaEvento

  };

}
function verificarItensNaoEntreguesJaEnviado(idEtapa){

  const ss =
    SpreadsheetApp.openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ");

  const aba =
    ss.getSheetByName(
      "Montagem_ItensNaoEntregues"
    );

  if(!aba){

    return {
      enviado:false
    };

  }

  const dados =
    aba.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const idLinha =
      String(dados[i][1] || "").trim();

    if(
      idLinha ===
      String(idEtapa || "").trim()
    ){

      return {
        enviado:true,
        idRegistro:dados[i][0] || ""
      };

    }

  }

  return {
    enviado:false
  };

}
function buscarItensNaoEntregues(idEtapa){

  const ss =
    SpreadsheetApp.openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ");

  const aba =
    ss.getSheetByName(
      "Montagem_ItensNaoEntregues"
    );

  if(!aba){

    return null;

  }

  const dados =
    aba.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const idLinha =
      String(dados[i][1] || "").trim();

    if(
      idLinha ===
      String(idEtapa || "").trim()
    ){

      return {

        idRegistro:
          dados[i][0] || "",

        itens:
          JSON.parse(
            dados[i][3] || "[]"
          )

      };

    }

  }

  return null;

}
function salvarObservacoesMontagem(payload){

  const ss =
    SpreadsheetApp
      .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ");

  const aba =
    ss.getSheetByName(
      "Montagem_Observacoes"
    );

  if(!aba){

    throw new Error(
      "Aba Montagem_Observacoes não encontrada."
    );

  }

  const dados =
    aba.getDataRange().getValues();

  const idCronograma =
    String(
      payload.idCronograma || ""
    ).trim();

  let linhaExistente = -1;

  for(let i = 1; i < dados.length; i++){

    const idLinha =
      String(
        dados[i][0] || ""
      ).trim();

    if(idLinha === idCronograma){

      linhaExistente = i + 1;
      break;

    }

  }

const linha = [

  idCronograma,
  new Date(),
  payload.pedido || "",
  payload.cliente || "",
  payload.responsavel || "",
  payload.observacao || "",
  payload.latitude || "",
  payload.longitude || "",
  payload.precisao || "",
  payload.distancia || ""

];

  // EDITA

  if(linhaExistente > 0){

    aba
      .getRange(
        linhaExistente,
        1,
        1,
        linha.length
      )
        .setValues([linha]);

  }

  // NOVO

  else{

    aba.appendRow(linha);

  }

  return true;

}
function buscarObservacoesMontagem(idCronograma){

  const ss =
    SpreadsheetApp
      .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ");

  const aba =
    ss.getSheetByName(
      "Montagem_Observacoes"
    );

  if(!aba) return null;

  const dados =
    aba.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){

    const idLinha =
      String(
        dados[i][0] || ""
      ).trim();

    if(
      idLinha ===
      String(idCronograma).trim()
    ){

      return {

        idCronograma:
          dados[i][0],

        data:
          dados[i][1],

        pedido:
          dados[i][2],

        cliente:
          dados[i][3],

        responsavel:
          dados[i][4],

        observacao:
          dados[i][5]

      };

    }

  }

  return null;

}
function reconstruirFretesDesde09032026(){

  const DATA_LIMITE =
    new Date(2026, 2, 9); // 09/03/2026

  const sheetCronograma = SpreadsheetApp
    .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
    .getSheetByName("Cronograma");

  const sheetFrete = SpreadsheetApp
    .openById("1uVhL4YbFbheyWDfVpDSwzPRg1P4AmgkMhAUhogrSVQs")
    .getSheetByName("Fretes Ch");

  // ===================================
  // PRESERVAR SOMENTE MANUAIS
  // ===================================

  const fretes =
    sheetFrete.getDataRange().getValues();

  const cabecalho =
    fretes[0];

  const manuais = [];

  for(let i = 1; i < fretes.length; i++){

    const id =
      String(fretes[i][0] || "").trim();

    if(id.startsWith("MANUAL")){

      manuais.push(
        fretes[i]
      );

    }

  }

  // limpa tudo

  if(sheetFrete.getLastRow() > 1){

    sheetFrete
      .getRange(
        2,
        1,
        sheetFrete.getLastRow() - 1,
        sheetFrete.getLastColumn()
      )
      .clearContent();

  }

  // recria manuais

  if(manuais.length){

    sheetFrete
      .getRange(
        2,
        1,
        manuais.length,
        manuais[0].length
      )
      .setValues(manuais);

  }

  // ===================================
  // CRONOGRAMA
  // ===================================

  const dados =
    sheetCronograma
      .getDataRange()
      .getValues();

  for(let i = 1; i < dados.length; i++){

    const id =
      dados[i][0];

    const pedido =
      dados[i][1];

    const local =
      dados[i][4];

    const etapa =
      String(
        dados[i][5] || ""
      ).toLowerCase();

    const dataEtapa =
      dados[i][6];

    const caminhao =
      dados[i][8];

    if(!id) continue;

    if(!dataEtapa) continue;

    const data =
      new Date(dataEtapa);

    if(isNaN(data.getTime()))
      continue;

    if(data < DATA_LIMITE)
      continue;

    if(
      !etapa.includes("carregamento") &&
      !etapa.includes("desmontagem")
    ){
      continue;
    }

    enviarParaFrete({

      id: id,

      pedido: pedido,

      data: Utilities.formatDate(
        data,
        Session.getScriptTimeZone(),
        "dd/MM/yyyy"
      ),

      caminhao: caminhao,

      local: local

    });

  }

  return "Fretes reconstruídos com sucesso.";
}
function calcularDistanciaRodoviariaKm(origem, destino){

  try{

    const rota =
      Maps.newDirectionFinder()
        .setOrigin(origem)
        .setDestination(destino)
        .getDirections();

    const metros =
      rota.routes[0]
          .legs[0]
          .distance
          .value;

    return (
      metros / 1000
    ).toFixed(1);

  }catch(e){

    Logger.log(e);

    return "";

  }

}
function obterValorFrete(
  km,
  tipoCaminhao
){

  const sheet =
    SpreadsheetApp
      .openById(
        "1uVhL4YbFbheyWDfVpDSwzPRg1P4AmgkMhAUhogrSVQs"
      )
      .getSheetByName(
        "Tabela"
      );

  const dados =
    sheet.getDataRange()
      .getValues();

  // -------------------
  // GRUPO CAMINHÃO
  // -------------------

  let grupo = "";

  tipoCaminhao =
    String(tipoCaminhao || "")
      .trim()
      .toUpperCase();

  if(tipoCaminhao.startsWith("P")){
    grupo = "P";
  }
  else if(tipoCaminhao.startsWith("M")){
    grupo = "M";
  }
  else if(tipoCaminhao === "XL"){
    grupo = "XL";
  }
  else if(
    tipoCaminhao.startsWith("G") ||
    tipoCaminhao === "XG"
  ){
    grupo = "G/XG";
  }

  // -------------------
  // ACHA COLUNA
  // -------------------

  const cabecalho =
    dados[0];

  const indiceColuna =
    cabecalho.indexOf(
      grupo
    );

  if(indiceColuna < 0)
    return "";

  // -------------------
  // KM MAIS PRÓXIMO
  // -------------------

  let melhorLinha = null;
  let menorDif = 999999;

  for(let i = 1; i < dados.length; i++){

    const kmTabela =
      Number(
        dados[i][0]
      );

    const dif =
      Math.abs(
        kmTabela - km
      );

    if(dif < menorDif){

      menorDif = dif;
      melhorLinha = i;

    }

  }

  if(melhorLinha === null)
    return "";

  return dados[
    melhorLinha
  ][indiceColuna];

}

function salvarListaAssinada(dados){

  const jaEnviada =
    verificarListaAssinadaJaEnviada(dados.idCronograma);

  if(jaEnviada && jaEnviada.enviado){
    return { sucesso:true, jaExistia:true, foto:jaEnviada.foto || "" };
  }

  const ss = SpreadsheetApp.openById(
    "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
  );

  const aba = ss.getSheetByName(
    "Montagem_ListaAssinada"
  );

  if(!aba){
    throw new Error("Aba Montagem_ListaAssinada não encontrada");
  }

  const abaCronograma = ss.getSheetByName("Cronograma");
  const dadosCronograma = abaCronograma.getDataRange().getValues();

  let latEvento = "";
  let lonEvento = "";

  for(let i = 1; i < dadosCronograma.length; i++){

    const idLinha = String(dadosCronograma[i][0] || "").trim();

    if(idLinha === String(dados.idCronograma || "").trim()){

      latEvento = Number(dadosCronograma[i][13] || 0); // coluna N
      lonEvento = Number(dadosCronograma[i][14] || 0); // coluna O

      break;
    }
  }

  const latitudeUsuario = coordenadaOperacao_(dados.latitude);

  const longitudeUsuario = coordenadaOperacao_(dados.longitude);

  let distanciaEvento = "";

  if(latEvento && lonEvento){
    distanciaEvento = calcularDistanciaMetros(
      latEvento,
      lonEvento,
      latitudeUsuario,
      longitudeUsuario
    );
  }

  let fotoUrl = "";

  if(dados.foto){

    const upload = uploadFotoChecklist(
      dados.foto,
      "ListaAssinada_" + Date.now() + ".jpg"
    );

    fotoUrl =
      "https://drive.usercontent.google.com/download?id=" +
      upload.id +
      "&export=view&authuser=0";
  }

  const agora = new Date();

  aba.appendRow([
    Utilities.getUuid(),
    dados.idCronograma || "",
    dados.pedido || "",
    dados.nome || "",
    fotoUrl,
    latitudeUsuario,
    longitudeUsuario,
    dados.precisao || dados.accuracy || "",
    distanciaEvento,
    Utilities.formatDate(agora, Session.getScriptTimeZone(), "dd/MM/yyyy"),
    Utilities.formatDate(agora, Session.getScriptTimeZone(), "HH:mm:ss"),
    agora
  ]);

  return {
    sucesso:true,
    foto:fotoUrl,
    distancia:distanciaEvento
  };

}

/****************************************************
 * CENTRAL DE RESPOSTAS DA MONTAGEM
 * Planilha:
 * https://docs.google.com/spreadsheets/d/14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ/edit
 ****************************************************/

const CENTRAL_MONTAGEM_SPREADSHEET_ID =
  "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ";

const CENTRAL_MONTAGEM_CONFIG = {
cronograma: {
  aba: "Cronograma",
  dataCol: 3,      // C - Data do evento
  pedidoCol: 2,    // B - Número do pedido
  etapaCol: 6,     // F - Precisa estar como Montagem
  montadorCol: 10  // J - Montador/responsável
},

  etapas: [
    {
      key: "checklist",
      titulo: "Checklist",
      aba: "Checklist",
      pedidoCol: 10 // J
    },
    {
      key: "equipe",
      titulo: "Equipe terceirizada",
      aba: "EquipeTerceirizada",
      pedidoCol: 3 // C
    },
    {
      key: "avarias",
      titulo: "Avarias",
      aba: "Montagem_Avarias",
      pedidoCol: 3 // C
    },
    {
      key: "sacolas",
      titulo: "Sacolas de capa",
      aba: "Montagem_Sacolas",
      pedidoCol: 3 // C
    },
    {
      key: "itensNaoEntregues",
      titulo: "Itens não entregues",
      aba: "Montagem_ItensNaoEntregues",
      pedidoCol: 3 // C
    },
    {
      key: "posicionamento",
      titulo: "Posicionamento",
      aba: "Montagem_Posicionamento",
      pedidoCol: 3 // C
    },
    {
      key: "percepcao",
      titulo: "Percepção de montagem",
      aba: "Montagem_Percepcao",
      pedidoCol: 3 // C
    },
    {
      key: "observacoes",
      titulo: "Observações",
      aba: "Montagem_Observacoes",
      pedidoCol: 3 // C
    },
    {
      key: "listaAssinada",
      titulo: "Lista assinada",
      aba: "Montagem_ListaAssinada",
      pedidoCol: 3 // C
    }
  ]
};


/****************************************************
 * ABRIR HTML DIRETO
 ****************************************************/

function abrirCentralRespostasMontagem() {
  return HtmlService
    .createTemplateFromFile("CentralRespostasMontagem")
    .evaluate()
    .setTitle("Central de Respostas da Montagem")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/****************************************************
 * USAR DENTRO DO DASHBOARD
 * Essa função retorna o HTML como texto.
 ****************************************************/

function getHtmlCentralRespostasMontagem() {
  return HtmlService
    .createTemplateFromFile("CentralRespostasMontagem")
    .evaluate()
    .getContent();
}


/****************************************************
 * URL DO SISTEMA
 ****************************************************/

function getUrlCentralMontagem() {
  return ScriptApp.getService().getUrl();
}


/****************************************************
 * FUNÇÃO PRINCIPAL DO HTML
 ****************************************************/

function getCentralRespostasMontagem() {
  try {
    const ss = SpreadsheetApp.openById(
      CENTRAL_MONTAGEM_SPREADSHEET_ID
    );

    const mapaPedidos = {};
    const abasAusentes = [];

    carregarPedidosDoCronogramaMontagem_(
      ss,
      mapaPedidos,
      abasAusentes
    );

    carregarRespostasDasEtapas_(
      ss,
      mapaPedidos,
      abasAusentes
    );

    const pedidos = montarListaFinalPedidos_(
      mapaPedidos
    );

    const resumo = montarResumoCentral_(
      pedidos
    );

    return {
      ok: true,
      atualizadoEm: Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "HH:mm:ss"
      ),
      etapas: CENTRAL_MONTAGEM_CONFIG.etapas.map(function(e) {
        return {
          key: e.key,
          titulo: e.titulo
        };
      }),
      pedidos: pedidos,
      resumo: resumo,
      abasAusentes: abasAusentes
    };

  } catch (erro) {
    return {
      ok: false,
      mensagem: "Erro ao carregar a Central de Respostas da Montagem: " + erro.message
    };
  }
}


/****************************************************
 * CARREGA PEDIDOS E MONTADORES DO CRONOGRAMA
 *
 * Regra:
 * Pedido na coluna B.
 * Verifica se coluna F é Montagem.
 * Montador vem da coluna J.
 ****************************************************/

function carregarPedidosDoCronogramaMontagem_(
  ss,
  mapaPedidos,
  abasAusentes
) {
  const cfg = CENTRAL_MONTAGEM_CONFIG.cronograma;
  const sheet = ss.getSheetByName(cfg.aba);

  if (!sheet) {
    abasAusentes.push(cfg.aba);
    return;
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2) return;

  const valores = sheet
    .getRange(2, 1, lastRow - 1, lastCol)
    .getDisplayValues();

  valores.forEach(function(linha) {
    const pedido = normalizarPedidoCentral_(
      linha[cfg.pedidoCol - 1]
    );

    if (!pedido) return;

    const etapa = normalizarTextoCentral_(
      linha[cfg.etapaCol - 1]
    );

    if (etapa !== "montagem") return;

    const dataMontagemTexto = String(
      linha[cfg.dataCol - 1] || ""
    ).trim();

    const dataInfo = montarInfoMesCentral_(
      dataMontagemTexto
    );

    const montador = String(
      linha[cfg.montadorCol - 1] || ""
    ).trim();

    const item = garantirPedidoCentral_(
      mapaPedidos,
      pedido
    );

    if (montador) {
      item.montadores[montador] = true;
    }

    if (dataInfo.dataBr) {
      item.datasMontagem[dataInfo.dataBr] = true;
    }

    if (dataInfo.mesRef) {
      item.meses[dataInfo.mesRef] = dataInfo.mesTexto;
    }
  });
}

/****************************************************
 * CARREGA TODAS AS ABAS DE RESPOSTA
 ****************************************************/

function carregarRespostasDasEtapas_(
  ss,
  mapaPedidos,
  abasAusentes
) {
  CENTRAL_MONTAGEM_CONFIG.etapas.forEach(function(etapa) {
    const sheet = ss.getSheetByName(etapa.aba);

    if (!sheet) {
      abasAusentes.push(etapa.aba);
      return;
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow < 2) return;

    const valores = sheet
      .getRange(2, 1, lastRow - 1, lastCol)
      .getDisplayValues();

    valores.forEach(function(linha) {
      const pedido = normalizarPedidoCentral_(
        linha[etapa.pedidoCol - 1]
      );

      if (!pedido) return;

      const item = garantirPedidoCentral_(
        mapaPedidos,
        pedido
      );

if (!item.etapas[etapa.key]) {

  item.etapas[etapa.key] = {
    enviado: true,
    quantidade: 0,
    conteudos: []
  };

}

item.etapas[etapa.key].enviado = true;
item.etapas[etapa.key].quantidade++;


/*
 * Guarda também um resumo do conteúdo
 * realmente enviado naquela etapa.
 */
const conteudo =
  CENTRAL_montarConteudoEtapa_(
    etapa.key,
    linha
  );


if (conteudo) {

  item.etapas[
    etapa.key
  ].conteudos.push(
    conteudo
  );

}
    });
  });
}

function CENTRAL_montarConteudoEtapa_(
  etapaKey,
  linha
) {

  linha = linha || [];


  const valor = function(indice) {

    return String(
      linha[indice] || ''
    ).trim();

  };


  const resposta = {
    texto: '',
    links: []
  };


  /****************************************************
   * EQUIPE TERCEIRIZADA
   *
   * D = Empresa
   * E = Quantidade
   * F = Observação
   * K = Foto
   ****************************************************/

  if (etapaKey === 'equipe') {

    const empresa =
      valor(3);

    const quantidade =
      valor(4);

    const observacao =
      valor(5);

    const foto =
      valor(10);


    const partes = [];


    if (empresa) {
      partes.push(empresa);
    }


    if (quantidade) {

      partes.push(
        quantidade +
        (
          Number(quantidade) === 1
            ? ' pessoa'
            : ' pessoas'
        )
      );

    }


    if (observacao) {
      partes.push(observacao);
    }


    resposta.texto =
      partes.join(' • ') ||
      'Equipe enviada';


    if (foto) {

      resposta.links.push({
        titulo: 'Foto',
        url: foto
      });

    }


    return resposta;
  }


  /****************************************************
   * CAPA / SACOLAS DE PROTEÇÃO
   *
   * D = JSON das sacolas
   ****************************************************/

  if (etapaKey === 'sacolas') {

    let sacolas = [];


    try {

      sacolas =
        JSON.parse(
          linha[3] || '[]'
        );

    } catch (e) {

      sacolas = [];

    }


    if (!Array.isArray(sacolas)) {
      sacolas = [];
    }


    const codigos = [];

    let quantidadeFotos = 0;


    sacolas.forEach(function(sacola) {

      sacola =
        sacola || {};


      const codigo =
        String(
          sacola.codigo || ''
        ).trim();


      if (codigo) {
        codigos.push(codigo);
      }


      const fotos =
        Array.isArray(
          sacola.fotos
        )
          ? sacola.fotos
          : [];


      fotos.forEach(function(url) {

        url =
          String(url || '').trim();

        if (!url) {
          return;
        }


        quantidadeFotos++;


        resposta.links.push({
          titulo: 'Foto ' + quantidadeFotos,
          url: url
        });

      });

    });


    const partes = [];


    if (sacolas.length) {

      partes.push(
        sacolas.length +
        (
          sacolas.length === 1
            ? ' sacola'
            : ' sacolas'
        )
      );

    }


    if (codigos.length) {

      partes.push(
        codigos.join(', ')
      );

    }


    if (quantidadeFotos) {

      partes.push(
        quantidadeFotos +
        (
          quantidadeFotos === 1
            ? ' foto'
            : ' fotos'
        )
      );

    }


    resposta.texto =
      partes.join(' • ') ||
      'Capa registrada';


    return resposta;
  }


  /****************************************************
   * POSICIONAMENTO
   *
   * D = JSON das fotos
   * E = Observação
   ****************************************************/

  if (etapaKey === 'posicionamento') {

    let fotos = [];


    try {

      fotos =
        JSON.parse(
          linha[3] || '[]'
        );

    } catch (e) {

      fotos = [];

    }


    if (!Array.isArray(fotos)) {
      fotos = [];
    }


    const observacao =
      valor(4);


    const partes = [];


    if (observacao) {

      partes.push(
        observacao
      );

    }


    if (fotos.length) {

      partes.push(
        fotos.length +
        (
          fotos.length === 1
            ? ' foto'
            : ' fotos'
        )
      );

    }


    fotos.forEach(function(url, index) {

      url =
        String(url || '').trim();

      if (!url) {
        return;
      }


      resposta.links.push({
        titulo:
          'Foto ' + (index + 1),
        url: url
      });

    });


    resposta.texto =
      partes.join(' • ') ||
      'Posicionamento enviado';


    return resposta;
  }


  /****************************************************
   * OBSERVAÇÕES
   *
   * F = Observação
   ****************************************************/

  if (etapaKey === 'observacoes') {

    const observacao =
      valor(5);


    resposta.texto =
      observacao ||
      'Sem observações';


    return resposta;
  }


  /****************************************************
   * LISTA ASSINADA
   *
   * D = Nome
   * E = Foto
   ****************************************************/

  if (etapaKey === 'listaAssinada') {

    const nome =
      valor(3);

    const foto =
      valor(4);


    resposta.texto =
      nome
        ? 'Enviada por ' + nome
        : 'Lista assinada enviada';


    if (foto) {

      resposta.links.push({
        titulo: 'Ver lista',
        url: foto
      });

    }


    return resposta;
  }


  return {
    texto: 'Enviado',
    links: []
  };
}
/****************************************************
 * GARANTE ESTRUTURA DO PEDIDO
 ****************************************************/

function garantirPedidoCentral_(
  mapaPedidos,
  pedido
) {
  if (!mapaPedidos[pedido]) {
    mapaPedidos[pedido] = {
      pedido: pedido,
      montadores: {},
      datasMontagem: {},
      meses: {},
      etapas: {}
    };
  }

  return mapaPedidos[pedido];
}


/****************************************************
 * MONTA LISTA FINAL
 ****************************************************/
function montarListaFinalPedidos_(
  mapaPedidos
) {

  const etapas =
    CENTRAL_MONTAGEM_CONFIG.etapas;


  const lista =
    Object.keys(mapaPedidos)
      .map(function(pedido) {

        const item =
          mapaPedidos[pedido];


        const etapasFinal = {};

        let totalEnviado = 0;


        etapas.forEach(
          function(etapa) {

            const info =
              item.etapas[
                etapa.key
              ];


            if (
              info &&
              info.enviado
            ) {

              etapasFinal[
                etapa.key
              ] = {

                enviado: true,

                quantidade:
                  Number(
                    info.quantidade || 1
                  ),

                conteudos:
                  Array.isArray(
                    info.conteudos
                  )
                    ? info.conteudos
                    : []

              };


              totalEnviado++;

            } else {

              etapasFinal[
                etapa.key
              ] = {

                enviado: false,

                quantidade: 0,

                conteudos: []

              };

            }

          }
        );


        const montadores =
          Object.keys(
            item.montadores || {}
          );


        const montadorTexto =
          montadores.length
            ? montadores.join(" / ")
            : "Não informado";


        const datas =
          Object.keys(
            item.datasMontagem || {}
          );


        const dataMontagemTexto =
          datas.length
            ? datas.join(" / ")
            : "";


        const mesesObj =
          item.meses || {};


        const mesesRefs =
          Object.keys(
            mesesObj
          );


        const completo =
          totalEnviado ===
          etapas.length;


return {

  pedido: pedido,

  dataEvento:
    dataMontagemTexto,

  montador:
    montadorTexto,

  dataMontagem:
    dataMontagemTexto,

          mesesRefs:
            mesesRefs,

          mesesTexto:
            mesesRefs.map(
              function(ref) {

                return mesesObj[
                  ref
                ];

              }
            ),

          completo:
            completo,

          totalEnviado:
            totalEnviado,

          totalEtapas:
            etapas.length,

          etapas:
            etapasFinal

        };

      });


  /****************************************************
   * ORDENA DO MAIOR PEDIDO PARA O MENOR
   ****************************************************/

  lista.sort(
    function(a, b) {

      const na =
        Number(a.pedido);

      const nb =
        Number(b.pedido);


      if (
        !isNaN(na) &&
        !isNaN(nb)
      ) {

        return nb - na;

      }


      return String(
        b.pedido
      ).localeCompare(
        String(a.pedido)
      );

    }
  );


  return lista;
}


/****************************************************
 * RESUMO
 ****************************************************/

function montarResumoCentral_(
  pedidos
) {
  let completos = 0;
  let pendentes = 0;
  let semMontador = 0;

  pedidos.forEach(function(p) {
    if (p.completo) {
      completos++;
    } else {
      pendentes++;
    }

    if (!p.montador || p.montador === "Não informado") {
      semMontador++;
    }
  });

  return {
    totalPedidos: pedidos.length,
    completos: completos,
    pendentes: pendentes,
    semMontador: semMontador
  };
}


/****************************************************
 * DETALHES AO CLICAR EM UMA ETAPA ENVIADA
 ****************************************************/

function getDetalhesRespostaMontagem(
  pedido,
  etapaKey
) {
  try {
    pedido = normalizarPedidoCentral_(pedido);

    if (!pedido) {
      return {
        ok: false,
        mensagem: "Pedido não informado."
      };
    }

    const etapa = CENTRAL_MONTAGEM_CONFIG.etapas.find(function(e) {
      return e.key === etapaKey;
    });

    if (!etapa) {
      return {
        ok: false,
        mensagem: "Etapa não localizada."
      };
    }

    const ss = SpreadsheetApp.openById(
      CENTRAL_MONTAGEM_SPREADSHEET_ID
    );

    const sheet = ss.getSheetByName(etapa.aba);

    if (!sheet) {
      return {
        ok: false,
        mensagem: "Aba não encontrada: " + etapa.aba
      };
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow < 2) {
      return {
        ok: true,
        registros: []
      };
    }

    const cabecalho = sheet
      .getRange(1, 1, 1, lastCol)
      .getDisplayValues()[0]
      .map(function(h, i) {
        h = String(h || "").trim();
        return h || colunaParaLetraCentral_(i + 1);
      });

    const valores = sheet
      .getRange(2, 1, lastRow - 1, lastCol)
      .getDisplayValues();

    const registros = [];

    valores.forEach(function(linha) {
      const pedidoLinha = normalizarPedidoCentral_(
        linha[etapa.pedidoCol - 1]
      );

      if (pedidoLinha !== pedido) return;

      const obj = {};

      linha.forEach(function(valor, i) {
        valor = String(valor || "").trim();

        if (!valor) return;

        obj[cabecalho[i]] = valor;
      });

      registros.push(obj);
    });

    return {
      ok: true,
      etapa: etapa.titulo,
      pedido: pedido,
      registros: registros
    };

  } catch (erro) {
    return {
      ok: false,
      mensagem: "Erro ao buscar detalhes: " + erro.message
    };
  }
}


/****************************************************
 * NORMALIZA PEDIDO
 ****************************************************/

function normalizarPedidoCentral_(
  valor
) {
  if (valor === null || valor === undefined) return "";

  let texto = String(valor)
    .trim()
    .replace(/\s+/g, "");

  if (!texto) return "";

  if (texto === "-") return "";

  texto = texto.replace(/\.0$/, "");

  return texto;
}


/****************************************************
 * NORMALIZA TEXTO
 ****************************************************/

function normalizarTextoCentral_(
  valor
) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}


/****************************************************
 * CONVERTE NÚMERO DA COLUNA EM LETRA
 ****************************************************/

function colunaParaLetraCentral_(
  numero
) {
  let letra = "";

  while (numero > 0) {
    const resto = (numero - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    numero = Math.floor((numero - resto) / 26);
  }

  return "Coluna " + letra;
}

function montarInfoMesCentral_(valor) {
  const data = converterDataCentral_(valor);

  if (!data) {
    return {
      dataBr: "",
      mesRef: "",
      mesTexto: ""
    };
  }

  const ano = data.getFullYear();
  const mes = data.getMonth() + 1;

  const mesRef =
    ano + "-" + String(mes).padStart(2, "0");

  const nomesMeses = [
    "Janeiro", "Fevereiro", "Março", "Abril",
    "Maio", "Junho", "Julho", "Agosto",
    "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const mesTexto =
    nomesMeses[data.getMonth()] + "/" + ano;

  const dataBr = Utilities.formatDate(
    data,
    Session.getScriptTimeZone(),
    "dd/MM/yyyy"
  );

  return {
    dataBr: dataBr,
    mesRef: mesRef,
    mesTexto: mesTexto
  };
}


function converterDataCentral_(valor) {
  if (!valor) return null;

  if (Object.prototype.toString.call(valor) === "[object Date]") {
    if (!isNaN(valor.getTime())) return valor;
  }

  let texto = String(valor).trim();

  if (!texto) return null;

  // Pega só a data caso venha "23/06/2026 08:00"
  texto = texto.split(" ")[0];

  // Formato dd/MM/yyyy
  const partes = texto.split("/");

  if (partes.length === 3) {
    const dia = Number(partes[0]);
    const mes = Number(partes[1]) - 1;
    const ano = Number(partes[2]);

    const data = new Date(ano, mes, dia);

    if (!isNaN(data.getTime())) {
      return data;
    }
  }

  // Tentativa final para datas em formato reconhecido pelo JS
  const dataNativa = new Date(texto);

  if (!isNaN(dataNativa.getTime())) {
    return dataNativa;
  }

  return null;
}
function normalizarSimNao(valor){

  const v = String(valor || "")
    .trim()
    .toLowerCase();

  if(v === "sim") return "Sim";
  if(v === "não" || v === "nao") return "Não";

  return "";

}


function salvarInfoPedidoNaMatriz(dados){

  Logger.log("🔥 INICIANDO salvarInfoPedidoNaMatriz");
  Logger.log(JSON.stringify(dados));

  const ss = SpreadsheetApp.openById(
    "1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78"
  );

  const aba = ss.getSheetByName("Matriz");

  if(!aba){
    throw new Error("Aba Matriz não encontrada.");
  }

  const pedidoBusca = String(dados.pedido || "").trim();

  if(!pedidoBusca){
    throw new Error("Pedido vazio. Não foi possível salvar na Matriz.");
  }

  const ultimaLinha = aba.getLastRow();

  let linhaAlvo = 0;

  if(ultimaLinha >= 2){

    const pedidos = aba
      .getRange(2, 3, ultimaLinha - 1, 1) // Coluna C
      .getValues();

    for(let i = 0; i < pedidos.length; i++){

      const pedidoLinha = String(pedidos[i][0] || "").trim();

      if(pedidoLinha === pedidoBusca){
        linhaAlvo = i + 2;
        break;
      }

    }

  }

  if(linhaAlvo){

    // Se a linha já existe, atualiza

    const idAtual = String(aba.getRange(linhaAlvo, 1).getValue() || "").trim();

    if(!idAtual){
      aba.getRange(linhaAlvo, 1).setValue(Utilities.getUuid());
    }

    // B até E
    aba.getRange(linhaAlvo, 2, 1, 4).setValues([[
      dados.dataEventoFormatada || "",
      dados.pedido || "",
      dados.cliente || "",
      dados.local || ""
    ]]);

    // AC até AF
    aba.getRange(linhaAlvo, 29, 1, 4).setValues([[
      dados.baldeacao || "",
      dados.escada || "",
      dados.caminhaoPerto || "",
      dados.horarioLimite || ""
    ]]);

    Logger.log("✅ Matriz atualizada na linha " + linhaAlvo);

  }else{

    // Se não existe, cria nova linha

    const novaLinha = new Array(32).fill("");

    // A
    novaLinha[0] = Utilities.getUuid();

    // B
    novaLinha[1] = dados.dataEventoFormatada || "";

    // C
    novaLinha[2] = dados.pedido || "";

    // D
    novaLinha[3] = dados.cliente || "";

    // E
    novaLinha[4] = dados.local || "";

    // AC
    novaLinha[28] = dados.baldeacao || "";

    // AD
    novaLinha[29] = dados.escada || "";

    // AE
    novaLinha[30] = dados.caminhaoPerto || "";

    // AF
    novaLinha[31] = dados.horarioLimite || "";

    aba.appendRow(novaLinha);

    Logger.log("✅ Nova linha criada na Matriz.");

  }

  return true;

}
function buscarInfoLogisticaMatriz_(){

  try{

    const aba = SpreadsheetApp
      .openById("1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78")
      .getSheetByName("Matriz");

    if(!aba) return {};

    const dados = aba.getDataRange().getDisplayValues();

    const mapa = {};

    for(let i = 1; i < dados.length; i++){

      const linha = dados[i];

      const pedido = String(linha[2] || "").trim(); // C

      if(!pedido) continue;

      mapa[pedido] = {
        baldeacao: normalizarSimNao(linha[28]),       // AC
        escada: normalizarSimNao(linha[29]),          // AD
        caminhaoPerto: normalizarSimNao(linha[30]),   // AE
        horarioLimite: normalizarSimNao(linha[31])    // AF
      };

    }

    return mapa;

  }catch(e){

    Logger.log("Erro ao buscar infos da Matriz:");
    Logger.log(e);

    return {};

  }

}
/****************************************************
 * ALERTAS DOS MOTORISTAS
 ****************************************************/

const ALERTAS_MOTORISTA_PLANILHA_ID =
  "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ";

const ALERTAS_MOTORISTA_ABA =
  "Alertas_Motoristas";


/****************************************************
 * CRIA OU BUSCA A ABA DE ALERTAS
 ****************************************************/
function obterAbaAlertasMotorista_() {

  const ss = SpreadsheetApp.openById(
    ALERTAS_MOTORISTA_PLANILHA_ID
  );

  let aba = ss.getSheetByName(
    ALERTAS_MOTORISTA_ABA
  );

  if (!aba) {

    aba = ss.insertSheet(
      ALERTAS_MOTORISTA_ABA
    );

    aba.getRange(
      1,
      1,
      1,
      13
    ).setValues([[
      "ID",
      "Pedido",
      "Cliente",
      "Endereco",
      "EnviadoPor",
      "Perfil",
      "Problema",
      "Observacao",
      "Status",
      "AbertoEm",
      "ResolvidoEm",
      "Resolucao",
      "AtualizadoEm"
    ]]);

    aba.setFrozenRows(1);

    aba.getRange(
      1,
      1,
      1,
      13
    )
      .setFontWeight("bold")
      .setBackground("#123A6F")
      .setFontColor("#FFFFFF");

    aba.setColumnWidth(1, 190);
    aba.setColumnWidth(2, 100);
    aba.setColumnWidth(3, 180);
    aba.setColumnWidth(4, 350);
    aba.setColumnWidth(5, 180);
    aba.setColumnWidth(6, 100);
    aba.setColumnWidth(7, 220);
    aba.setColumnWidth(8, 400);
    aba.setColumnWidth(9, 120);
    aba.setColumnWidth(10, 160);
    aba.setColumnWidth(11, 160);
    aba.setColumnWidth(12, 400);
    aba.setColumnWidth(13, 160);
  }

  return aba;
}


/****************************************************
 * NORMALIZAR TEXTO
 ****************************************************/
function normalizarTextoAlertaMotorista_(
  valor
) {

  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    );
}


/****************************************************
 * VERIFICA PERFIL DE MOTORISTA
 ****************************************************/
function perfilEhMotorista_(perfil) {

  const texto =
    normalizarTextoAlertaMotorista_(
      perfil
    );

  return (
    texto.includes("frete") ||
    texto.includes("motorista")
  );
}


/****************************************************
 * FORMATAR DATA/HORA
 ****************************************************/
function formatarDataHoraAlertaMotorista_(
  valor
) {

  if (!valor) {
    return "";
  }

  if (
    Object.prototype.toString.call(valor) ===
      "[object Date]" &&
    !isNaN(valor.getTime())
  ) {

    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      "dd/MM/yyyy HH:mm"
    );
  }

  return String(valor).trim();
}


/****************************************************
 * TRANSFORMA LINHA EM OBJETO
 ****************************************************/
function montarObjetoAlertaMotorista_(
  linha
) {

  if (!linha || !linha.length) {
    return null;
  }

  return {
    id:
      String(linha[0] || "").trim(),

    pedido:
      String(linha[1] || "").trim(),

    cliente:
      String(linha[2] || "").trim(),

    endereco:
      String(linha[3] || "").trim(),

    enviadoPor:
      String(linha[4] || "").trim(),

    perfil:
      String(linha[5] || "").trim(),

    problema:
      String(linha[6] || "").trim(),

    observacao:
      String(linha[7] || "").trim(),

    status:
      String(
        linha[8] || "PENDENTE"
      )
        .trim()
        .toUpperCase(),

    abertoEm:
      formatarDataHoraAlertaMotorista_(
        linha[9]
      ),

    resolvidoEm:
      formatarDataHoraAlertaMotorista_(
        linha[10]
      ),

    resolucao:
      String(linha[11] || "").trim()
  };
}


/****************************************************
 * BUSCAR ALERTAS PARA MOSTRAR NO CRONOGRAMA
 ****************************************************/
function buscarAlertasMotoristaPorPedido_() {

  const aba =
    obterAbaAlertasMotorista_();

  const ultimaLinha =
    aba.getLastRow();

  if (ultimaLinha < 2) {
    return {};
  }

  const dados = aba
    .getRange(
      2,
      1,
      ultimaLinha - 1,
      13
    )
    .getValues();

  const mapa = {};

  dados.forEach(function(linha) {

    const alerta =
      montarObjetoAlertaMotorista_(
        linha
      );

    if (
      !alerta ||
      !alerta.pedido
    ) {
      return;
    }

    /*
     * Se houver mais de um alerta para
     * o pedido, a linha mais recente
     * substituirá a anterior.
     */
    mapa[alerta.pedido] =
      alerta;
  });

  return mapa;
}


/****************************************************
 * SALVAR NOVO ALERTA
 ****************************************************/
function salvarAlertaMotorista(payload) {

  payload = payload || {};

  const pedido = String(
    payload.pedido || ""
  ).trim();

  const problema = String(
    payload.problema || ""
  ).trim();

  const observacao = String(
    payload.observacao || ""
  ).trim();

  if (!pedido) {
    throw new Error(
      "Pedido não informado."
    );
  }

  if (!problema) {
    throw new Error(
      "Problema não informado."
    );
  }

  if (!observacao) {
    throw new Error(
      "Informe uma observação."
    );
  }

  const sessao =
    AUD_validarTokenSessao_(
      String(payload.token || "").trim()
    );

  if (!sessao) {
    throw new Error(
      "Sessão inválida ou expirada. Digite a senha novamente."
    );
  }

  if (
    !perfilEhMotorista_(
      sessao.perfil
    )
  ) {

    throw new Error(
      "Acesso permitido somente para motoristas."
    );
  }

  /*
   * O nome não é aceito diretamente
   * do navegador.
   *
   * Ele é buscado no token criado
   * após a validação da senha.
   */
  const enviadoPor = String(
    sessao.usuario || ""
  ).trim();

  if (!enviadoPor) {
    throw new Error(
      "Não foi possível identificar o motorista."
    );
  }

  const lock =
    LockService.getScriptLock();

  lock.waitLock(20000);

  try {

    const aba =
      obterAbaAlertasMotorista_();

    const dados =
      aba.getDataRange().getValues();

    /*
     * Impede dois alertas pendentes
     * para o mesmo pedido.
     */
    for (
      let i = dados.length - 1;
      i >= 1;
      i--
    ) {

      const pedidoLinha = String(
        dados[i][1] || ""
      ).trim();

      const statusLinha = String(
        dados[i][8] || ""
      )
        .trim()
        .toUpperCase();

      if (
        pedidoLinha === pedido &&
        statusLinha === "PENDENTE"
      ) {

        const alertaExistente =
          montarObjetoAlertaMotorista_(
            dados[i]
          );

        const mesmoAutor =
          normalizarTextoAlertaMotorista_(
            alertaExistente.enviadoPor
          ) ===
          normalizarTextoAlertaMotorista_(
            enviadoPor
          );

        if (!mesmoAutor) {
          throw new Error(
            "Este pedido já possui um alerta pendente enviado por " +
            alertaExistente.enviadoPor +
            "."
          );
        }

        /*
         * Caso o motorista tenha clicado
         * duas vezes, devolve o alerta
         * existente sem duplicar.
         */
        return alertaExistente;
      }
    }

    const agora =
      new Date();

    const id =
      "ALT_" +
      agora.getTime() +
      "_" +
      Utilities
        .getUuid()
        .substring(0, 8);

    const linha = [
      id,
      pedido,
      String(payload.cliente || "").trim(),
      String(payload.endereco || "").trim(),
      enviadoPor,
      String(sessao.perfil || "frete").trim(),
      problema,
      observacao,
      "PENDENTE",
      agora,
      "",
      "",
      agora
    ];

    aba.appendRow(linha);

    return montarObjetoAlertaMotorista_(
      linha
    );

  } finally {

    lock.releaseLock();
  }
}


/****************************************************
 * RESOLVER ALERTA
 ****************************************************/
function resolverAlertaMotorista(payload) {

  payload = payload || {};

  const pedido = String(
    payload.pedido || ""
  ).trim();

  const resolucao = String(
    payload.resolucao || ""
  ).trim();

  if (!pedido) {
    throw new Error(
      "Pedido não informado."
    );
  }

  if (!resolucao) {
    throw new Error(
      "Informe como o problema foi resolvido."
    );
  }

  const sessao =
    AUD_validarTokenSessao_(
      String(payload.token || "").trim()
    );

  if (!sessao) {
    throw new Error(
      "Sessão inválida ou expirada. Digite a senha novamente."
    );
  }

  if (
    !perfilEhMotorista_(
      sessao.perfil
    )
  ) {

    throw new Error(
      "Acesso permitido somente para motoristas."
    );
  }

  const usuarioAtual = String(
    sessao.usuario || ""
  ).trim();

  const lock =
    LockService.getScriptLock();

  lock.waitLock(20000);

  try {

    const aba =
      obterAbaAlertasMotorista_();

    const dados =
      aba.getDataRange().getValues();

    let linhaEncontrada = 0;
    let alertaEncontrado = null;

    /*
     * Procura de baixo para cima para
     * localizar o alerta pendente mais recente.
     */
    for (
      let i = dados.length - 1;
      i >= 1;
      i--
    ) {

      const pedidoLinha = String(
        dados[i][1] || ""
      ).trim();

      const statusLinha = String(
        dados[i][8] || ""
      )
        .trim()
        .toUpperCase();

      if (
        pedidoLinha === pedido &&
        statusLinha === "PENDENTE"
      ) {

        linhaEncontrada =
          i + 1;

        alertaEncontrado =
          montarObjetoAlertaMotorista_(
            dados[i]
          );

        break;
      }
    }

    if (
      !linhaEncontrada ||
      !alertaEncontrado
    ) {

      throw new Error(
        "Nenhum alerta pendente foi encontrado para este pedido."
      );
    }

    const autorAlerta =
      normalizarTextoAlertaMotorista_(
        alertaEncontrado.enviadoPor
      );

    const usuarioSessao =
      normalizarTextoAlertaMotorista_(
        usuarioAtual
      );

    if (
      !usuarioSessao ||
      usuarioSessao !== autorAlerta
    ) {

      throw new Error(
        "Somente " +
        alertaEncontrado.enviadoPor +
        " pode marcar este alerta como resolvido."
      );
    }

    const agora =
      new Date();

    // I - Status
    aba
      .getRange(
        linhaEncontrada,
        9
      )
      .setValue(
        "RESOLVIDO"
      );

    // K - ResolvidoEm
    aba
      .getRange(
        linhaEncontrada,
        11
      )
      .setValue(
        agora
      );

    // L - Resolução
    aba
      .getRange(
        linhaEncontrada,
        12
      )
      .setValue(
        resolucao
      );

    // M - AtualizadoEm
    aba
      .getRange(
        linhaEncontrada,
        13
      )
      .setValue(
        agora
      );

    const linhaAtualizada = aba
      .getRange(
        linhaEncontrada,
        1,
        1,
        13
      )
      .getValues()[0];

    return montarObjetoAlertaMotorista_(
      linhaAtualizada
    );

  } finally {

    lock.releaseLock();
  }
}
function testeVersaoCronograma(){

  try{

    Logger.log("ETAPA 1 — Iniciando teste");

    const dataTeste =
      "2026-07-28";

    Logger.log(
      "ETAPA 2 — Data recebida: " +
      dataTeste
    );

    const dataConvertida =
      AUD_converterData_(
        dataTeste
      );

    Logger.log(
      "ETAPA 3 — Data convertida: " +
      dataConvertida
    );

    const aba =
      AUD_obterAbaAuditoria_();

    Logger.log(
      "ETAPA 4 — Aba encontrada: " +
      aba.getName()
    );

    Logger.log(
      "ETAPA 5 — Última linha: " +
      aba.getLastRow()
    );

    Logger.log(
      "ETAPA 6 — Última coluna: " +
      aba.getLastColumn()
    );

    const resultado =
      getVersaoCronograma(
        dataTeste
      );

    Logger.log(
      "ETAPA 7 — Resultado:"
    );

    Logger.log(
      JSON.stringify(
        resultado
      )
    );

    return resultado;

  }catch(erro){

    Logger.log(
      "ERRO REAL: " +
      erro.message
    );

    Logger.log(
      "STACK: " +
      erro.stack
    );

    console.error(
      erro
    );

    throw new Error(
      "Falha no teste da versão: " +
      erro.message
    );
  }
}

/****************************************************
 * DESMONTAGEM
 ****************************************************/

const DES_ID_PLANILHA =
  "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ";

const DES_ABA_LISTA =
  "Desmontagem_ListaConferida";

const DES_ABA_CONCLUSOES =
  "Desmontagem_Conclusoes";


/****************************************************
 * CRIA / BUSCA ABA DA LISTA
 ****************************************************/
function DES_obterAbaLista_(){

  const ss =
    SpreadsheetApp.openById(
      DES_ID_PLANILHA
    );

  let aba =
    ss.getSheetByName(
      DES_ABA_LISTA
    );

  if(!aba){

    aba =
      ss.insertSheet(
        DES_ABA_LISTA
      );

    aba.appendRow([

      "ID",
      "ID CRONOGRAMA",
      "PEDIDO",
      "FOTOS",
      "QUANTIDADE PAGINAS",
      "LATITUDE",
      "LONGITUDE",
      "PRECISAO GPS",
      "DISTANCIA EVENTO",
      "DATA",
      "HORA",
      "DATA/HORA"

    ]);

    aba
      .getRange(
        1,
        1,
        1,
        12
      )
      .setFontWeight(
        "bold"
      );

    aba.setFrozenRows(1);

  }

  return aba;

}


/****************************************************
 * CRIA / BUSCA ABA DAS CONCLUSÕES
 ****************************************************/
function DES_obterAbaConclusoes_(){

  const ss =
    SpreadsheetApp.openById(
      DES_ID_PLANILHA
    );

  let aba =
    ss.getSheetByName(
      DES_ABA_CONCLUSOES
    );

  if(!aba){

    aba =
      ss.insertSheet(
        DES_ABA_CONCLUSOES
      );

    aba.appendRow([

      "ID",
      "ID CRONOGRAMA",
      "PEDIDO",
      "DATA",
      "HORA",
      "DATA/HORA"

    ]);

    aba
      .getRange(
        1,
        1,
        1,
        6
      )
      .setFontWeight(
        "bold"
      );

    aba.setFrozenRows(1);

  }

  return aba;

}


/****************************************************
 * BUSCAR DISTÂNCIA DO EVENTO
 ****************************************************/
function DES_calcularDistanciaEvento_(
  idCronograma,
  latitudeUsuario,
  longitudeUsuario
){

  const ss =
    SpreadsheetApp.openById(
      DES_ID_PLANILHA
    );

  const aba =
    ss.getSheetByName(
      "Cronograma"
    );

  if(!aba){
    return "";
  }


  const dados =
    aba
      .getDataRange()
      .getValues();


  let latEvento = "";
  let lonEvento = "";


  for(
    let i = 1;
    i < dados.length;
    i++
  ){

    const linha =
      dados[i];

    const id =
      String(
        linha[0] || ""
      ).trim();


    if(
      id ===
      String(
        idCronograma || ""
      ).trim()
    ){

      /*
       * N = latitude
       * O = longitude
       */
      latEvento =
        Number(
          linha[13] || 0
        );

      lonEvento =
        Number(
          linha[14] || 0
        );

      break;

    }

  }


  if(
    !latEvento ||
    !lonEvento ||
    !latitudeUsuario ||
    !longitudeUsuario
  ){
    return "";
  }


  return calcularDistanciaMetros(

    latEvento,
    lonEvento,

    Number(
      latitudeUsuario
    ),

    Number(
      longitudeUsuario
    )

  );

}


/****************************************************
 * SALVAR TODAS AS PÁGINAS DA LISTA
 ****************************************************/
function salvarListaConferidaDesmontagem(
  dados
){

  dados =
    dados || {};


  const idCronograma =
    String(
      dados.idCronograma || ""
    ).trim();


  if(!idCronograma){

    throw new Error(
      "ID da desmontagem não informado."
    );

  }


  const fotos =
    Array.isArray(
      dados.fotos
    )
      ? dados.fotos
      : [];


  if(!fotos.length){

    throw new Error(
      "Envie pelo menos uma página da lista."
    );

  }


  const aba =
    DES_obterAbaLista_();


  /*
   * Não permite enviar a mesma lista duas vezes.
   */
  const existentes =
    aba
      .getDataRange()
      .getValues();


  for(
    let i = 1;
    i < existentes.length;
    i++
  ){

    if(
      String(
        existentes[i][1] || ""
      ).trim() ===
      idCronograma
    ){

      /* Já foi enviada (ex.: reenvio depois de queda de conexão) */
      return verificarListaConferidaDesmontagem(
        idCronograma
      );

    }

  }


  /*
   * UPLOAD DE TODAS AS PÁGINAS
   */
  const urls = [];


  fotos.forEach(
    function(foto,index){

      if(!foto){
        return;
      }


      const upload =
        uploadFotoChecklist(

          foto,

          "Desmontagem_Lista_" +
          (
            dados.pedido ||
            "SEM_PEDIDO"
          ) +
          "_Pagina_" +
          (
            index + 1
          ) +
          "_" +
          Date.now() +
          ".jpg"

        );


      const url =
        upload.url ||
        (
          upload.id

            ? (
                "https://drive.google.com/uc?export=view&id=" +
                upload.id
              )

            : ""
        );


      if(url){

        urls.push(
          url
        );

      }

    }
  );


  if(!urls.length){

    throw new Error(
      "Não foi possível salvar as fotos da lista."
    );

  }


  const latitude =
    coordenadaOperacao_(dados.latitude);


  const longitude =
    coordenadaOperacao_(dados.longitude);


  const distancia =
    DES_calcularDistanciaEvento_(

      idCronograma,

      latitude,

      longitude

    );


  const agora =
    new Date();


  const data =
    Utilities.formatDate(

      agora,

      Session.getScriptTimeZone(),

      "dd/MM/yyyy"

    );


  const hora =
    Utilities.formatDate(

      agora,

      Session.getScriptTimeZone(),

      "HH:mm:ss"

    );


  aba.appendRow([

    // A
    Utilities.getUuid(),

    // B
    idCronograma,

    // C
    dados.pedido || "",

    // D
    JSON.stringify(
      urls
    ),

    // E
    urls.length,

    // F
    latitude || "",

    // G
    longitude || "",

    // H
    dados.precisaoGPS ||
    dados.accuracy ||
    "",

    // I
    distancia,

    // J
    data,

    // K
    hora,

    // L
    agora

  ]);


  return {

    sucesso:true,

    enviado:true,

    fotos:
      urls,

    quantidade:
      urls.length,

    distancia:
      distancia

  };

}


/****************************************************
 * VERIFICAR LISTA JÁ ENVIADA
 ****************************************************/
function verificarListaConferidaDesmontagem(
  idCronograma
){

  const aba =
    DES_obterAbaLista_();


  const dados =
    aba
      .getDataRange()
      .getValues();


  const idBusca =
    String(
      idCronograma || ""
    ).trim();


  for(
    let i = 1;
    i < dados.length;
    i++
  ){

    const id =
      String(
        dados[i][1] || ""
      ).trim();


    if(
      id ===
      idBusca
    ){

      let fotos = [];


      try{

        fotos =
          JSON.parse(
            dados[i][3] ||
            "[]"
          );

      }catch(e){

        fotos = [];

      }


      return {

        enviado:true,

        fotos:
          Array.isArray(fotos)
            ? fotos
            : [],

        quantidade:
          Number(
            dados[i][4] || 0
          )

      };

    }

  }


  return {

    enviado:false,

    fotos:[],

    quantidade:0

  };

}


/****************************************************
 * VERIFICAR SE DESMONTAGEM JÁ FOI CONCLUÍDA
 ****************************************************/
function verificarDesmontagemConcluida(
  idCronograma
){

  const aba =
    DES_obterAbaConclusoes_();


  const dados =
    aba
      .getDataRange()
      .getValues();


  const idBusca =
    String(
      idCronograma || ""
    ).trim();


  for(
    let i = 1;
    i < dados.length;
    i++
  ){

    if(
      String(
        dados[i][1] || ""
      ).trim() ===
      idBusca
    ){

      return {

        concluida:true,

        data:
          dados[i][3] || "",

        hora:
          dados[i][4] || ""

      };

    }

  }


  return {

    concluida:false

  };

}


/****************************************************
 * CONCLUIR DESMONTAGEM
 ****************************************************/
function concluirDesmontagem(
  dados
){

  dados =
    dados || {};


  const idCronograma =
    String(
      dados.idCronograma || ""
    ).trim();


  if(!idCronograma){

    throw new Error(
      "ID da desmontagem não informado."
    );

  }


  /*
   * EQUIPE OBRIGATÓRIA
   */
  const equipe =
    verificarEquipeTerceirizadaJaEnviada(
      idCronograma
    );


  if(
    !equipe ||
    equipe.enviado !== true
  ){

    throw new Error(
      "Envie primeiro a foto da equipe."
    );

  }


  /*
   * LISTA OBRIGATÓRIA
   */
  const lista =
    verificarListaConferidaDesmontagem(
      idCronograma
    );


  if(
    !lista ||
    lista.enviado !== true ||
    !lista.fotos.length
  ){

    throw new Error(
      "Envie todas as páginas da lista conferida."
    );

  }


  /*
   * NÃO DUPLICA CONCLUSÃO
   */
  const jaConcluida =
    verificarDesmontagemConcluida(
      idCronograma
    );


  if(
    jaConcluida &&
    jaConcluida.concluida
  ){

    return {

      sucesso:true,
      concluida:true,
      jaExistia:true

    };

  }


  const aba =
    DES_obterAbaConclusoes_();


  const agora =
    new Date();


  const data =
    Utilities.formatDate(

      agora,

      Session.getScriptTimeZone(),

      "dd/MM/yyyy"

    );


  const hora =
    Utilities.formatDate(

      agora,

      Session.getScriptTimeZone(),

      "HH:mm:ss"

    );


  aba.appendRow([

    Utilities.getUuid(),

    idCronograma,

    dados.pedido || "",

    data,

    hora,

    agora

  ]);


  return {

    sucesso:true,

    concluida:true,

    data:
      data,

    hora:
      hora

  };

}
/****************************************************
 * CONFIRMAÇÃO DO DECORADOR
 ****************************************************/

const CRON_COL_CONFIRMADO_DECORADOR = 17; // Q
const CRON_SENHA_SUPERVISOR_MONTAGEM = "1994";


function CRON_garantirColunaConfirmacao_(
  sheet
){

  if(!sheet){
    throw new Error(
      "A aba Cronograma não foi encontrada."
    );
  }


  /*
   * Garante que exista a coluna Q.
   */
  if(
    sheet.getMaxColumns() <
    CRON_COL_CONFIRMADO_DECORADOR
  ){

    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      CRON_COL_CONFIRMADO_DECORADOR -
      sheet.getMaxColumns()
    );

  }


  const cabecalho =
    String(
      sheet
        .getRange(
          1,
          CRON_COL_CONFIRMADO_DECORADOR
        )
        .getValue() || ""
    ).trim();


  if(!cabecalho){

    sheet
      .getRange(
        1,
        CRON_COL_CONFIRMADO_DECORADOR
      )
      .setValue(
        "CONFIRMAÇÃO DECORADOR"
      );

  }

}


function CRON_etapaPermiteConfirmacao_(
  nomeEtapa
){

  const tipo =
    String(
      nomeEtapa || ""
    )
      .trim()
      .toLowerCase();

  return (
    tipo === "montagem" ||
    tipo === "desmontagem"
  );

}


function CRON_valorConfirmacao_(
  etapa
){

  if(
    !CRON_etapaPermiteConfirmacao_(
      etapa && etapa.etapa
    )
  ){

    return "";

  }


  return (
    etapa.confirmadoDecorador === true
      ? "SIM"
      : "NAO"
  );

}


function CRON_confirmacaoEhSim_(
  valor
){

  const normalizado =
    String(
      valor || ""
    )
      .trim()
      .toUpperCase();

  return (
    normalizado === "SIM" ||
    normalizado === "S" ||
    normalizado === "TRUE" ||
    normalizado === "1"
  );

}
/****************************************************
 * ACESSO DA OPERAÇÃO
 *
 * Supervisor 1994:
 *   confirma a data.
 *
 * Responsável:
 *   entra normalmente na operação.
 ****************************************************/

function validarAcessoExecucaoEtapa(
  responsavel,
  senha
){
  /* Senha removida (out/2026): quem protege agora é o login do Acervo (api/gs.js). */
  return CRON_acessoEtapa_(responsavel);


  const senhaInformada =
    String(
      senha || ""
    ).trim();


  if(!senhaInformada){

    return {
      valido:false,
      tipo:""
    };

  }


  /* SUPERVISOR DE MONTAGEM */

  if(
    senhaInformada ===
    CRON_SENHA_SUPERVISOR_MONTAGEM
  ){

    return {
      valido:true,
      tipo:"SUPERVISOR"
    };

  }


  /* RESPONSÁVEL NORMAL */

  const responsavelValido =
    validarSenhaResponsavel(
      responsavel,
      senhaInformada
    );


  if(responsavelValido){

    return {
      valido:true,
      tipo:"RESPONSAVEL"
    };

  }


  return {
    valido:false,
    tipo:""
  };

}
/****************************************************
 * SALVAR CONFIRMAÇÃO DO DECORADOR
 ****************************************************/

function salvarConfirmacaoDecorador(
  etapaId,
  confirmado,
  senhaSupervisor,
  tokenSessao
){

  const senha =
    String(
      senhaSupervisor || ""
    ).trim();


  const token =
    String(
      tokenSessao || ""
    ).trim();


  /* =====================================================
     AUTORIZAÇÃO
     
     Existem agora duas formas válidas:
     
     1. digitou 1994 agora;
     2. possui sessão válida de montagem.
  ===================================================== */

  let autorizado = false;


  /* SENHA DIRETA */

  if(
    senha ===
    CRON_SENHA_SUPERVISOR_MONTAGEM
  ){

    autorizado = true;

  }


  /* SESSÃO DE 10 MINUTOS */

  if(
    !autorizado &&
    token
  ){

    const sessao =
      AUD_validarTokenSessao_(
        token
      );


    if(
      sessao &&
      String(
        sessao.perfil || ""
      )
        .trim()
        .toLowerCase() ===
          "montagem"
    ){

      autorizado = true;

    }

  }


  if(!autorizado){

    throw new Error(
      "Sessão expirada ou acesso não autorizado."
    );

  }


  /* =====================================================
     ETAPA
  ===================================================== */

  const id =
    String(
      etapaId || ""
    ).trim();


  if(!id){

    throw new Error(
      "ID da etapa não informado."
    );

  }


  const lock =
    LockService.getScriptLock();


  lock.waitLock(
    30000
  );


  try{

    const sheet =
      SpreadsheetApp
        .openById(
          "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ"
        )
        .getSheetByName(
          NOME_ABA
        );


    if(!sheet){

      throw new Error(
        "A aba Cronograma não foi encontrada."
      );

    }


    CRON_garantirColunaConfirmacao_(
      sheet
    );


    const dados =
      sheet
        .getDataRange()
        .getValues();


    for(
      let i = 1;
      i < dados.length;
      i++
    ){

      const idLinha =
        String(
          dados[i][0] || ""
        ).trim();


      if(
        idLinha !== id
      ){
        continue;
      }


      const etapa =
        String(
          dados[i][5] || ""
        )
          .trim()
          .toLowerCase();


      /*
       * Segurança:
       * somente Montagem e Desmontagem.
       */
      if(
        etapa !== "montagem" &&
        etapa !== "desmontagem"
      ){

        throw new Error(
          "Esta etapa não permite confirmação do decorador."
        );

      }


      const valor =
        confirmado === true
          ? "SIM"
          : "NAO";


      sheet
        .getRange(
          i + 1,
          CRON_COL_CONFIRMADO_DECORADOR
        )
        .setValue(
          valor
        );


      SpreadsheetApp.flush();


      return {

        sucesso:
          true,

        confirmado:
          confirmado === true

      };

    }


    throw new Error(
      "Etapa não encontrada."
    );


  }finally{

    lock.releaseLock();

  }

}


/****************************************************
 * OPERAÇÃO MONTAGEM / DESMONTAGEM — APOIO
 ****************************************************/

/* Coordenada enviada pelo celular; vazio quando não veio */
function coordenadaOperacao_(valor){
  const numero =
    Number(String(valor === undefined || valor === null ? "" : valor).replace(",", "."));
  return numero ? numero : "";
}

/* JSON salvo numa célula; se estiver corrompido, devolve o padrão */
function jsonSeguroOperacao_(texto, padrao){
  try{
    const valor = JSON.parse(texto || "null");
    return valor === null ? padrao : valor;
  }catch(e){
    return padrao;
  }
}

/* A lista assinada desta etapa já foi enviada? */
function verificarListaAssinadaJaEnviada(idCronograma){

  const aba =
    SpreadsheetApp
      .openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ")
      .getSheetByName("Montagem_ListaAssinada");

  if(!aba){
    return { enviado:false };
  }

  const dados =
    aba.getDataRange().getValues();

  const idBusca =
    String(idCronograma || "").trim();

  for(let i = 1; i < dados.length; i++){
    if(String(dados[i][1] || "").trim() === idBusca){
      return {
        enviado:true,
        nome:dados[i][3] || "",
        foto:dados[i][4] || ""
      };
    }
  }

  return { enviado:false };
}
