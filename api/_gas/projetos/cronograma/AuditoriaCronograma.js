/****************************************************
 * AUDITORIA DO CRONOGRAMA
 *
 * Este arquivo é independente do GS principal.
 * Nesta primeira etapa, ele ainda não interfere
 * no salvamento atual do cronograma.
 ****************************************************/


/****************************************************
 * CONFIGURAÇÕES
 ****************************************************/

const AUD_SPREADSHEET_ID =
  "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ";

const AUD_NOME_ABA =
  "Cronograma_Alteracoes";


/****************************************************
 * CABEÇALHOS DA AUDITORIA
 ****************************************************/

const AUD_CABECALHOS = [

  "ID Movimentação",
  "Data",
  "Hora",
  "DataHora",

  "Usuário",
  "Perfil",

  "Pedido",
  "Cliente",
  "Local",
  "Data Evento",

  "ID Etapa",
  "Etapa",
  "Data Etapa",

  "Início Semana",
  "Fim Semana",
  "Prazo Limite",

  "Tipo Movimentação",
  "Tipo Alteração",
  "Campo Alterado",

  "Valor Anterior",
  "Valor Novo",

  "Contabilizada",
  "Motivo da Contagem"

];


/****************************************************
 * CRIAR/OBTER ABA DE AUDITORIA
 ****************************************************/

function AUD_obterAbaAuditoria_(){

  const ss = SpreadsheetApp.openById(
    AUD_SPREADSHEET_ID
  );

  let aba = ss.getSheetByName(
    AUD_NOME_ABA
  );

  if(!aba){

    aba = ss.insertSheet(
      AUD_NOME_ABA
    );

    aba
      .getRange(
        1,
        1,
        1,
        AUD_CABECALHOS.length
      )
      .setValues([
        AUD_CABECALHOS
      ]);

    AUD_formatarAbaAuditoria_(
      aba
    );
  }

  return aba;
}


/****************************************************
 * FORMATAR ABA
 ****************************************************/

function AUD_formatarAbaAuditoria_(aba){

  aba.setFrozenRows(1);

  aba
    .getRange(
      1,
      1,
      1,
      AUD_CABECALHOS.length
    )
    .setFontWeight("bold")
    .setBackground("#0B1F3A")
    .setFontColor("#FFFFFF")
    .setHorizontalAlignment("center");

  aba.autoResizeColumns(
    1,
    AUD_CABECALHOS.length
  );

  /*
   * B — Data
   */
  aba
    .getRange(
      2,
      2,
      Math.max(
        aba.getMaxRows() - 1,
        1
      ),
      1
    )
    .setNumberFormat(
      "dd/MM/yyyy"
    );

  /*
   * D — DataHora
   */
  aba
    .getRange(
      2,
      4,
      Math.max(
        aba.getMaxRows() - 1,
        1
      ),
      1
    )
    .setNumberFormat(
      "dd/MM/yyyy HH:mm:ss"
    );

  /*
   * J — Data Evento
   */
  aba
    .getRange(
      2,
      10,
      Math.max(
        aba.getMaxRows() - 1,
        1
      ),
      1
    )
    .setNumberFormat(
      "dd/MM/yyyy"
    );

  /*
   * M até O:
   * Data Etapa
   * Início Semana
   * Fim Semana
   */
  aba
    .getRange(
      2,
      13,
      Math.max(
        aba.getMaxRows() - 1,
        1
      ),
      3
    )
    .setNumberFormat(
      "dd/MM/yyyy"
    );

  /*
   * P — Prazo Limite
   */
  aba
    .getRange(
      2,
      16,
      Math.max(
        aba.getMaxRows() - 1,
        1
      ),
      1
    )
    .setNumberFormat(
      "dd/MM/yyyy HH:mm"
    );
}


/****************************************************
 * FUNÇÃO PARA EXECUTAR UMA VEZ
 *
 * Cria a aba Cronograma_Alteracoes.
 ****************************************************/

function configurarAuditoriaCronograma(){

  const aba =
    AUD_obterAbaAuditoria_();

  return {
    sucesso: true,
    aba: aba.getName(),
    colunas: AUD_CABECALHOS.length
  };
}


/****************************************************
 * CONVERTER DATA COM SEGURANÇA
 ****************************************************/

function AUD_converterData_(valor){

  if(!valor){
    return null;
  }

  /*
   * Já é Date
   */
  if(
    Object.prototype.toString.call(
      valor
    ) === "[object Date]" &&
    !isNaN(valor.getTime())
  ){

    return new Date(
      valor.getFullYear(),
      valor.getMonth(),
      valor.getDate()
    );
  }

  const texto =
    String(valor)
      .trim()
      .split(" ")[0];

  /*
   * yyyy-MM-dd
   */
  if(
    /^\d{4}-\d{2}-\d{2}$/.test(
      texto
    )
  ){

    const partes =
      texto.split("-");

    return new Date(
      Number(partes[0]),
      Number(partes[1]) - 1,
      Number(partes[2])
    );
  }

  /*
   * dd/MM/yyyy
   */
  if(
    /^\d{2}\/\d{2}\/\d{4}$/.test(
      texto
    )
  ){

    const partes =
      texto.split("/");

    return new Date(
      Number(partes[2]),
      Number(partes[1]) - 1,
      Number(partes[0])
    );
  }

  const dataTeste =
    new Date(valor);

  if(!isNaN(dataTeste.getTime())){

    return new Date(
      dataTeste.getFullYear(),
      dataTeste.getMonth(),
      dataTeste.getDate()
    );
  }

  return null;
}


/****************************************************
 * SEMANA DO CRONOGRAMA
 *
 * A semana começa terça-feira
 * e termina segunda-feira.
 ****************************************************/

function AUD_calcularSemanaCronograma_(
  dataEtapa
){

  const data =
    AUD_converterData_(
      dataEtapa
    );

  if(!data){

    return {
      inicioSemana: null,
      fimSemana: null,
      prazoLimite: null
    };
  }

  /*
   * getDay():
   *
   * 0 domingo
   * 1 segunda
   * 2 terça
   * 3 quarta
   * 4 quinta
   * 5 sexta
   * 6 sábado
   */

  const diasDesdeTerca =
    (
      data.getDay() -
      2 +
      7
    ) % 7;

  const inicioSemana =
    new Date(data);

  inicioSemana.setDate(
    inicioSemana.getDate() -
    diasDesdeTerca
  );

  inicioSemana.setHours(
    0,
    0,
    0,
    0
  );

  const fimSemana =
    new Date(
      inicioSemana
    );

  fimSemana.setDate(
    fimSemana.getDate() + 6
  );

  fimSemana.setHours(
    23,
    59,
    59,
    999
  );

  /*
   * Prazo:
   * segunda-feira anterior
   * à semana, às 20h.
   */
  const prazoLimite =
    new Date(
      inicioSemana
    );

  prazoLimite.setDate(
    prazoLimite.getDate() - 1
  );

  prazoLimite.setHours(
    20,
    0,
    0,
    0
  );

  return {
    inicioSemana,
    fimSemana,
    prazoLimite
  };
}


/****************************************************
 * VERIFICAR SE ENTRA NA CONTAGEM
 ****************************************************/

function AUD_verificarContabilizacao_(
  dataEtapa,
  dataAlteracao
){

  const agora =
    dataAlteracao instanceof Date
      ? dataAlteracao
      : new Date();

  const semana =
    AUD_calcularSemanaCronograma_(
      dataEtapa
    );

  /*
   * Caso não exista uma data válida,
   * contabiliza por segurança.
   */
  if(!semana.prazoLimite){

    return {

      contabilizada: true,

      motivo:
        "Contabilizada porque a etapa não possui uma data válida.",

      inicioSemana: null,
      fimSemana: null,
      prazoLimite: null
    };
  }

  const contabilizada =
    agora.getTime() >
    semana.prazoLimite.getTime();

  return {

    contabilizada:

      contabilizada,

    motivo:

      contabilizada

        ? "Alteração realizada após o prazo de segunda-feira às 20h."

        : "Alteração realizada dentro do prazo livre de planejamento.",

    inicioSemana:

      semana.inicioSemana,

    fimSemana:

      semana.fimSemana,

    prazoLimite:

      semana.prazoLimite
  };
}


/****************************************************
 * CONTABILIZAÇÃO CONSIDERANDO DATA ANTIGA E NOVA
 ****************************************************/

function AUD_verificarContabilizacaoAlteracao_(
  dataEtapaAnterior,
  dataEtapaNova,
  dataAlteracao
){

  const agora =
    dataAlteracao instanceof Date
      ? dataAlteracao
      : new Date();

  const dataAnteriorValida =
    AUD_converterData_(
      dataEtapaAnterior
    );

  const dataNovaValida =
    AUD_converterData_(
      dataEtapaNova
    );

  const regraAnterior =
    dataAnteriorValida

      ? AUD_verificarContabilizacao_(
          dataAnteriorValida,
          agora
        )

      : null;

  const regraNova =
    dataNovaValida

      ? AUD_verificarContabilizacao_(
          dataNovaValida,
          agora
        )

      : null;

  /*
   * Caso nenhuma das duas datas
   * seja válida, contabiliza.
   */
  if(
    !regraAnterior &&
    !regraNova
  ){

    return {

      contabilizada: true,

      motivo:
        "Contabilizada porque não foi possível identificar uma data válida para a etapa.",

      inicioSemana: null,
      fimSemana: null,
      prazoLimite: null
    };
  }

  const regrasContabilizadas = [

    regraAnterior,
    regraNova

  ].filter(regra =>

    regra &&
    regra.contabilizada
  );

  const contabilizada =
    regrasContabilizadas.length > 0;

  /*
   * Caso a data antiga ou a nova já
   * esteja fora do prazo, a alteração
   * deve ser contabilizada.
   */
  const referencia =
    contabilizada

      ? regrasContabilizadas
          .sort((a, b) => {

            const prazoA =
              a.prazoLimite
                ? a.prazoLimite.getTime()
                : 0;

            const prazoB =
              b.prazoLimite
                ? b.prazoLimite.getTime()
                : 0;

            return prazoA - prazoB;

          })[0]

      : (
          regraNova ||
          regraAnterior
        );

  return {

    contabilizada:

      contabilizada,

    motivo:

      contabilizada

        ? "Contabilizada porque a data anterior ou a nova data da etapa já ultrapassou o prazo permitido."

        : "Alteração realizada dentro do prazo livre de planejamento.",

    inicioSemana:

      referencia
        ? referencia.inicioSemana
        : null,

    fimSemana:

      referencia
        ? referencia.fimSemana
        : null,

    prazoLimite:

      referencia
        ? referencia.prazoLimite
        : null
  };
}

/****************************************************
 * NORMALIZAR VALORES PARA COMPARAÇÃO
 ****************************************************/

function AUD_normalizarValor_(
  campo,
  valor
){

  if(
    valor === null ||
    valor === undefined
  ){
    return "";
  }

/*
 * Horários da planilha podem chegar
 * como Date, número decimal ou texto.
 */
if(campo === "horario"){

  if(
    Object.prototype.toString.call(valor) ===
      "[object Date]" &&
    !isNaN(valor.getTime())
  ){

    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      "HH:mm"
    );
  }

  if(typeof valor === "number"){

    const totalMinutos =
      Math.round(valor * 24 * 60);

    const horas =
      Math.floor(totalMinutos / 60) % 24;

    const minutos =
      totalMinutos % 60;

    return (
      String(horas).padStart(2, "0") +
      ":" +
      String(minutos).padStart(2, "0")
    );
  }

  const textoHorario =
    String(valor).trim();

  const horarioEncontrado =
    textoHorario.match(
      /^(\d{1,2}):(\d{2})/
    );

  if(horarioEncontrado){

    return (
      String(
        horarioEncontrado[1]
      ).padStart(2, "0") +
      ":" +
      horarioEncontrado[2]
    );
  }

  return textoHorario;
}

  if(
    campo === "dataEvento" ||
    campo === "dataEtapa"
  ){

    const data =
      AUD_converterData_(
        valor
      );

    if(!data){
      return "";
    }

    return Utilities.formatDate(
      data,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );
  }

  if(Array.isArray(valor)){

    valor =
      valor.join("|");
  }

  let texto =
    String(valor)
      .replace(/\r/g, "")
      .replace(/\n/g, "|")
      .trim();

  /*
   * Normaliza campos de listas.
   */
  if(
    campo === "caminhao" ||
    campo === "equipe" ||
    campo === "equipeQtd"
  ){

    texto =
      texto
        .split("|")
        .map(item =>
          item.trim()
        )
        .filter(Boolean)
        .join("|");
  }

  return texto
    .replace(/\s+/g, " ")
    .trim();
}


/****************************************************
 * FORMATAR VALOR PARA O HISTÓRICO
 ****************************************************/

function AUD_formatarValorHistorico_(
  campo,
  valor
){

if(campo === "horario"){

  return AUD_normalizarValor_(
    "horario",
    valor
  );
}

  if(
    valor === null ||
    valor === undefined ||
    valor === ""
  ){
    return "";
  }

  if(
    campo === "dataEvento" ||
    campo === "dataEtapa"
  ){

    const data =
      AUD_converterData_(
        valor
      );

    if(data){

      return Utilities.formatDate(
        data,
        Session.getScriptTimeZone(),
        "dd/MM/yyyy"
      );
    }
  }

  if(Array.isArray(valor)){

    return valor.join(" | ");
  }

  return String(valor)
    .replace(/\r/g, "")
    .replace(/\n/g, " | ")
    .replace(/\|/g, " | ")
    .trim();
}


/****************************************************
 * DEFINIR TIPO DA ALTERAÇÃO
 ****************************************************/

function AUD_tipoPorCampo_(
  campo
){

  const tipos = {

    pedido:
      "Alteração de pedido",

    cliente:
      "Alteração de cliente",

    local:
      "Alteração de local",

    dataEvento:
      "Alteração de data do evento",

    etapa:
      "Mudança de etapa",

    dataEtapa:
      "Alteração de data",

    horario:
      "Alteração de horário",

    caminhao:
      "Troca de caminhão",

    responsavel:
      "Troca de responsável",

    equipe:
      "Troca de equipe",

    equipeQtd:
      "Alteração de quantidade da equipe",

    observacao:
      "Alteração de observação",

    lona:
      "Alteração de lona"
  };

  return (
    tipos[campo] ||
    "Alteração de informação"
  );
}


/****************************************************
 * NOME VISUAL DO CAMPO
 ****************************************************/

function AUD_nomeCampo_(
  campo
){

  const nomes = {

    pedido:
      "Pedido",

    cliente:
      "Cliente",

    local:
      "Local",

    dataEvento:
      "Data do evento",

    etapa:
      "Etapa",

    dataEtapa:
      "Data da etapa",

    horario:
      "Horário",

    caminhao:
      "Caminhão",

    responsavel:
      "Responsável",

    equipe:
      "Equipe",

    equipeQtd:
      "Quantidade da equipe",

    observacao:
      "Observação",

    lona:
      "Lona"
  };

  return (
    nomes[campo] ||
    campo
  );
}


/****************************************************
 * COMPARAR DADOS ANTIGOS E NOVOS
 ****************************************************/

function AUD_compararDados_(
  dadosAnteriores,
  dadosNovos
){

  const campos = [

    "pedido",
    "cliente",
    "local",
    "dataEvento",

    "etapa",
    "dataEtapa",
    "horario",
    "caminhao",
    "responsavel",
    "equipe",
    "equipeQtd",
    "observacao",
    "lona"

  ];

  const alteracoes = [];

  campos.forEach(campo => {

    const anteriorNormalizado =
      AUD_normalizarValor_(
        campo,
        dadosAnteriores
          ? dadosAnteriores[campo]
          : ""
      );

    const novoNormalizado =
      AUD_normalizarValor_(
        campo,
        dadosNovos
          ? dadosNovos[campo]
          : ""
      );

    if(
      anteriorNormalizado ===
      novoNormalizado
    ){
      return;
    }

    alteracoes.push({

      campo,

      nomeCampo:
        AUD_nomeCampo_(campo),

      tipoAlteracao:
        AUD_tipoPorCampo_(campo),

      valorAnterior:
        AUD_formatarValorHistorico_(
          campo,
          dadosAnteriores
            ? dadosAnteriores[campo]
            : ""
        ),

      valorNovo:
        AUD_formatarValorHistorico_(
          campo,
          dadosNovos
            ? dadosNovos[campo]
            : ""
        )
    });
  });

  return alteracoes;
}


/****************************************************
 * CONVERTER LINHA DA ABA CRONOGRAMA
 * EM OBJETO
 *
 * Cronograma:
 *
 * A ID
 * B Pedido
 * C Data Evento
 * D Cliente
 * E Local
 * F Etapa
 * G Data Etapa
 * H Horário
 * I Caminhão
 * J Responsável
 * K Equipe
 * L Observação
 * M Quantidade Equipe
 * N Latitude
 * O Longitude
 * P Lona
 ****************************************************/

function AUD_linhaCronogramaParaObjeto_(
  linha
){

  return {

    id:
      linha[0] || "",

    pedido:
      linha[1] || "",

    dataEvento:
      linha[2] || "",

    cliente:
      linha[3] || "",

    local:
      linha[4] || "",

    etapa:
      linha[5] || "",

    dataEtapa:
      linha[6] || "",

    horario:
      linha[7] || "",

    caminhao:
      linha[8] || "",

    responsavel:
      linha[9] || "",

    equipe:
      linha[10] || "",

    observacao:
      linha[11] || "",

    equipeQtd:
      linha[12] || "",

    latitude:
      linha[13] || "",

    longitude:
      linha[14] || "",

    lona:
      linha[15] || ""
  };
}

/****************************************************
 * OBTER VERSÃO DO CRONOGRAMA
 *
 * A versão inicial sempre é 1.
 *
 * Cada ID Movimentação diferente conta somente
 * uma versão, mesmo que o salvamento tenha alterado
 * vários campos ou várias etapas.
 ****************************************************/

function getVersaoCronograma(
  inicioSemanaStr
){

  const inicioSemana =
    AUD_converterData_(
      inicioSemanaStr
    );

  if(!inicioSemana){

    throw new Error(
      "Data inicial da semana inválida."
    );
  }

  /*
   * Garante que a data informada seja
   * considerada como o início da semana.
   */
  inicioSemana.setHours(
    0,
    0,
    0,
    0
  );

  const fimSemana =
    new Date(
      inicioSemana
    );

  fimSemana.setDate(
    fimSemana.getDate() + 6
  );

  fimSemana.setHours(
    23,
    59,
    59,
    999
  );

  const aba =
    AUD_obterAbaAuditoria_();

  const ultimaLinha =
    aba.getLastRow();

  /*
   * Sem registros:
   * cronograma continua na versão inicial.
   */
  if(ultimaLinha < 2){

    return {
      sucesso: true,
      versao: 1,
      quantidadeMovimentacoes: 0
    };
  }

  const dados =
    aba
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        AUD_CABECALHOS.length
      )
      .getValues();

  /*
   * Apenas estes campos aumentam a versão.
   */
  const camposPermitidos =
    new Set([

      "horario",
      "caminhao",
      "data da etapa",
      "data etapa",
      "novo pedido"

    ]);

  const idsMovimentacao =
    new Set();

  dados.forEach(function(linha){

    /*
     * A — ID Movimentação
     * N — Início Semana
     * O — Fim Semana
     * S — Campo Alterado
     * V — Contabilizada
     */

    const idMovimentacao =
      String(
        linha[0] || ""
      ).trim();

    const inicioRegistro =
      AUD_converterData_(
        linha[13]
      );

    const fimRegistro =
      AUD_converterData_(
        linha[14]
      );

    const campoAlterado =
      AUD_normalizarTextoVersao_(
        linha[18]
      );

    const contabilizada =
      AUD_normalizarTextoVersao_(
        linha[21]
      );

    if(!idMovimentacao){
      return;
    }

    if(contabilizada !== "sim"){
      return;
    }

    if(
      !camposPermitidos.has(
        campoAlterado
      )
    ){
      return;
    }

    if(
      !inicioRegistro ||
      !fimRegistro
    ){
      return;
    }

    inicioRegistro.setHours(
      0,
      0,
      0,
      0
    );

    fimRegistro.setHours(
      23,
      59,
      59,
      999
    );

    /*
     * A alteração somente pertence ao cronograma
     * quando a semana registrada corresponde
     * à semana aberta na tela.
     */
    const pertenceSemana =
      inicioRegistro.getTime() ===
        inicioSemana.getTime() &&
      fimRegistro.getFullYear() ===
        fimSemana.getFullYear() &&
      fimRegistro.getMonth() ===
        fimSemana.getMonth() &&
      fimRegistro.getDate() ===
        fimSemana.getDate();

    if(!pertenceSemana){
      return;
    }

    /*
     * Set impede que várias linhas do mesmo
     * salvamento contem várias versões.
     */
    idsMovimentacao.add(
      idMovimentacao
    );
  });

  return {

    sucesso: true,

    /*
     * A versão original é a Versão 1.
     */
    versao:
      1 +
      idsMovimentacao.size,

    quantidadeMovimentacoes:
      idsMovimentacao.size,

    inicioSemana:
      Utilities.formatDate(
        inicioSemana,
        Session.getScriptTimeZone(),
        "yyyy-MM-dd"
      ),

    fimSemana:
      Utilities.formatDate(
        fimSemana,
        Session.getScriptTimeZone(),
        "yyyy-MM-dd"
      )
  };
}


/****************************************************
 * NORMALIZAR TEXTO PARA O CÁLCULO DA VERSÃO
 ****************************************************/

function AUD_normalizarTextoVersao_(
  valor
){

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
 * REGISTRAR ALTERAÇÕES
 *
 * Uma movimentação pode gerar várias linhas,
 * todas usando o mesmo ID Movimentação.
 ****************************************************/

function AUD_registrarAlteracoes_(
  pacote
){

  pacote = pacote || {};

  const alteracoes =
    Array.isArray(
      pacote.alteracoes
    )
      ? pacote.alteracoes
      : [];

  if(!alteracoes.length){

    return {
      sucesso: true,
      registrado: false,
      motivo:
        "Nenhuma alteração real encontrada."
    };
  }

const agora =
  pacote.dataAlteracao instanceof Date
    ? pacote.dataAlteracao
    : new Date();

const regra =
  AUD_verificarContabilizacaoAlteracao_(

    pacote.dataEtapaAnterior ||
      pacote.dataEtapa,

    pacote.dataEtapaNova ||
      pacote.dataEtapa,

    agora
  );

const idMovimentacao =
  pacote.idMovimentacao ||
  (
    "MOV_" +
    agora.getTime() +
    "_" +
    Utilities
      .getUuid()
      .substring(0, 8)
  );

  const dataSomente =
    new Date(
      agora.getFullYear(),
      agora.getMonth(),
      agora.getDate()
    );

  const dataEvento =
    AUD_converterData_(
      pacote.dataEvento
    );

  const dataEtapa =
    AUD_converterData_(
      pacote.dataEtapa
    );

  const linhas =
    alteracoes.map(
      alteracao => [

        // A
        idMovimentacao,

        // B
        dataSomente,

        // C
        Utilities.formatDate(
          agora,
          Session.getScriptTimeZone(),
          "HH:mm:ss"
        ),

        // D
        agora,

        // E
        pacote.usuario || "",

        // F
        pacote.perfil || "",

        // G
        pacote.pedido || "",

        // H
        pacote.cliente || "",

        // I
        pacote.local || "",

        // J
        dataEvento || "",

        // K
        pacote.idEtapa || "",

        // L
        pacote.etapa || "",

        // M
        dataEtapa || "",

        // N
        regra.inicioSemana || "",

        // O
        regra.fimSemana || "",

        // P
        regra.prazoLimite || "",

        // Q
        pacote.tipoMovimentacao ||
          "Alteração",

        // R
        alteracao.tipoAlteracao ||
          "Alteração de informação",

        // S
        alteracao.nomeCampo ||
          alteracao.campo ||
          "",

        // T
        alteracao.valorAnterior || "",

        // U
        alteracao.valorNovo || "",

        // V
        regra.contabilizada
          ? "Sim"
          : "Não",

        // W
        regra.motivo

      ]
    );

  const lock =
    LockService.getScriptLock();

  try{

    lock.waitLock(
      15000
    );

    const aba =
      AUD_obterAbaAuditoria_();

    const primeiraLinha =
      aba.getLastRow() + 1;

    aba
      .getRange(
        primeiraLinha,
        1,
        linhas.length,
        AUD_CABECALHOS.length
      )
      .setValues(
        linhas
      );

    SpreadsheetApp.flush();

  }finally{

    lock.releaseLock();
  }

  return {
    sucesso: true,
    registrado: true,
    idMovimentacao,
    quantidadeCampos:
      alteracoes.length,
    contabilizada:
      regra.contabilizada
  };
}

/****************************************************
 * SESSÃO SEGURA DA AUDITORIA
 ****************************************************/

const AUD_PREFIXO_TOKEN_SESSAO =
  "AUD_SESSAO_";

const AUD_DURACAO_TOKEN_SEGUNDOS =
  10 * 60;


/****************************************************
 * CRIAR TOKEN APÓS VALIDAR A SENHA
 ****************************************************/

function AUD_criarTokenSessao_(
  usuario,
  perfil
){

  const token =
    Utilities
      .getUuid()
      .replace(/-/g, "") +
    "_" +
    new Date().getTime();

  const dadosSessao = {

    usuario:
      String(usuario || "").trim(),

    perfil:
      String(perfil || "").trim(),

    criadoEm:
      new Date().toISOString()
  };

  CacheService
    .getScriptCache()
    .put(
      AUD_PREFIXO_TOKEN_SESSAO +
        token,

      JSON.stringify(
        dadosSessao
      ),

      AUD_DURACAO_TOKEN_SEGUNDOS
    );

  return token;
}


/****************************************************
 * VALIDAR TOKEN RECEBIDO DO HTML
 ****************************************************/

function AUD_validarTokenSessao_(
  token
){

  const tokenLimpo =
    String(token || "").trim();

  if(!tokenLimpo){
    return null;
  }

  const conteudo =
    CacheService
      .getScriptCache()
      .get(
        AUD_PREFIXO_TOKEN_SESSAO +
          tokenLimpo
      );

  if(!conteudo){
    return null;
  }

  try{

    const dados =
      JSON.parse(conteudo);

    if(
      !dados ||
      !dados.usuario ||
      !dados.perfil
    ){
      return null;
    }

    return {

      usuario:
        String(
          dados.usuario
        ).trim(),

      perfil:
        String(
          dados.perfil
        ).trim()
    };

  }catch(erro){

    console.error(
      "Erro ao validar token da auditoria:",
      erro
    );

    return null;
  }
}

function testeAuditoriaManual(){

  const agora =
    new Date();

  const resultado =
    AUD_registrarAlteracoes_({

      idMovimentacao:
        "TESTE_" + agora.getTime(),

      dataAlteracao:
        agora,

      usuario:
        "Teste Manual",

      perfil:
        "montagem",

      pedido:
        "TESTE-001",

      cliente:
        "Cliente Teste",

      local:
        "Local Teste",

      dataEvento:
        "2026-07-21",

      idEtapa:
        "ETAPA_TESTE",

      etapa:
        "Montagem",

      dataEtapa:
        "2026-07-21",

      dataEtapaAnterior:
        "2026-07-21",

      dataEtapaNova:
        "2026-07-21",

      tipoMovimentacao:
        "Alteração",

      alteracoes: [

        {

          campo:
            "responsavel",

          nomeCampo:
            "Responsável",

          tipoAlteracao:
            "Troca de responsável",

          valorAnterior:
            "Paulo",

          valorNovo:
            "Larissa"
        }
      ]
    });

  Logger.log(
    JSON.stringify(resultado)
  );
}