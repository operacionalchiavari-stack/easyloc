/* =========================================================
   FECHAMENTO MENSAL — ALMOXARIFADO

   Dependências já existentes no projeto:

   - getMetasAlmoxarifadoCentral(mes)
   - buscarDivergenciasContagemAlmoxarifado_(mes)
   - calcularBonusAlmoxarifadoCentral(mes, divergencias)
   - getTetoGastosMensal(mes)
========================================================= */


/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const FECHAMENTO_ALMOX_PLANILHA_ID =
  "1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI";

const FECHAMENTO_ALMOX_SENHAS_ID =
  "133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk";

const FECHAMENTO_ALMOX_ABA_SENHAS =
  "Senhas";

const FECHAMENTO_ALMOX_ABA_MESES =
  "Fechamentos Almoxarifado";

const FECHAMENTO_ALMOX_ABA_SETORES =
  "Fechamentos Almox Setores";

const FECHAMENTO_ALMOX_ABA_DIVERGENCIAS =
  "Fechamentos Almox Divergencias";


/* =========================================================
   CONSULTAR FECHAMENTO
========================================================= */

function fechamentoAlmoxarifadoObter(
  mesFiltro
){

  const mes =
    fechamentoAlmoxValidarMes_(
      mesFiltro,
      false
    );

  const estrutura =
    fechamentoAlmoxGarantirAbas_();

  const registro =
    fechamentoAlmoxLocalizarMes_(
      estrutura.abaMeses,
      mes
    );

  if(!registro){

    return {

      ok:
        true,

      fechado:
        false,

      mes:
        mes

    };

  }

  return fechamentoAlmoxMontarRetorno_(
    estrutura,
    registro
  );

}


/* =========================================================
   SALVAR FECHAMENTO
========================================================= */

function fechamentoAlmoxarifadoSalvar(
  mesFiltro,
  senhaInformada
){

  const mes =
    fechamentoAlmoxValidarMes_(
      mesFiltro,
      true
    );

  fechamentoAlmoxValidarSenhaGerencia_(
    senhaInformada
  );

  const lock =
    LockService.getScriptLock();

  lock.waitLock(
    30000
  );

  let idFechamento =
    "";

  try{

    const estrutura =
      fechamentoAlmoxGarantirAbas_();

    const existente =
      fechamentoAlmoxLocalizarMes_(
        estrutura.abaMeses,
        mes
      );

    if(existente){

      throw new Error(
        "Este mês do Almoxarifado já foi fechado anteriormente."
      );

    }

    /*
      Recalcula tudo no servidor.

      Nenhum valor recebido do HTML
      é usado como fonte do fechamento.
    */
    const snapshot =
      fechamentoAlmoxCalcularSnapshot_(
        mes
      );

    const bonus =
      snapshot.bonusAlmoxarifado;

    /*
      Impede o fechamento caso exista
      perda sem custo cadastrado.
    */
    if(
      bonus &&
      bonus.calculoPendente === true
    ){

      throw new Error(
        "Não é possível fechar o mês porque existem perdas com custo não encontrado. Corrija os custos dos produtos antes do fechamento."
      );

    }

    const agora =
      new Date();

    idFechamento =
      "FA-" +
      mes +
      "-" +
      Utilities
        .getUuid()
        .slice(
          0,
          8
        )
        .toUpperCase();

    const fechadoPor =
      Session
        .getActiveUser()
        .getEmail() ||
      "Gerência";


    /* =====================================================
       SALVAR SETORES
    ===================================================== */

    fechamentoAlmoxSalvarSetores_(
      estrutura.abaSetores,
      idFechamento,
      mes,
      agora,
      snapshot.setores
    );


    /* =====================================================
       SALVAR DIVERGÊNCIAS
    ===================================================== */

    fechamentoAlmoxSalvarDivergencias_(
      estrutura.abaDivergencias,
      idFechamento,
      mes,
      agora,
      snapshot.divergencias
    );


    /* =====================================================
       SALVAR RESUMO PRINCIPAL

       É salvo por último.

       O mês somente é considerado fechado
       quando esta linha principal existir.
    ===================================================== */

    fechamentoAlmoxSalvarResumo_(
      estrutura.abaMeses,
      idFechamento,
      mes,
      agora,
      fechadoPor,
      snapshot
    );

    SpreadsheetApp.flush();

    const registroSalvo =
      fechamentoAlmoxLocalizarMes_(
        estrutura.abaMeses,
        mes
      );

    if(!registroSalvo){

      throw new Error(
        "O fechamento foi gravado, mas não pôde ser confirmado."
      );

    }

    return fechamentoAlmoxMontarRetorno_(
      estrutura,
      registroSalvo
    );

  } catch(erro){

    /*
      Se houver erro no meio da gravação,
      remove os registros parciais.
    */
    if(idFechamento){

      try{

        const estrutura =
          fechamentoAlmoxGarantirAbas_();

        fechamentoAlmoxRemoverLinhasPorId_(
          estrutura.abaMeses,
          idFechamento
        );

        fechamentoAlmoxRemoverLinhasPorId_(
          estrutura.abaSetores,
          idFechamento
        );

        fechamentoAlmoxRemoverLinhasPorId_(
          estrutura.abaDivergencias,
          idFechamento
        );

      } catch(erroLimpeza){

        Logger.log(
          "Erro ao limpar fechamento parcial do Almoxarifado: " +
          erroLimpeza.message
        );

      }

    }

    throw erro;

  } finally {

    lock.releaseLock();

  }

}


/* =========================================================
   CALCULAR FOTOGRAFIA DO MÊS
========================================================= */

function fechamentoAlmoxCalcularSnapshot_(
  mes
){

  if(
    typeof getMetasAlmoxarifadoCentral !==
    "function"
  ){

    throw new Error(
      'A função "getMetasAlmoxarifadoCentral" não foi encontrada no projeto.'
    );

  }

  if(
    typeof getTetoGastosMensal !==
    "function"
  ){

    throw new Error(
      'A função "getTetoGastosMensal" não foi encontrada no projeto.'
    );

  }

  if(
    typeof calcularBonusAlmoxarifadoCentral !==
    "function"
  ){

    throw new Error(
      'A função "calcularBonusAlmoxarifadoCentral" não foi encontrada no projeto.'
    );

  }

  const resposta =
    getMetasAlmoxarifadoCentral(
      mes
    );

  if(
    !resposta ||
    !resposta.atual
  ){

    throw new Error(
      "Não foi possível carregar os indicadores do Almoxarifado."
    );

  }

  const atual =
    resposta.atual;

  let divergencias =
    [];

  if(
    Array.isArray(
      resposta.divergencias
    )
  ){

    divergencias =
      resposta.divergencias;

  } else {

    if(
      typeof buscarDivergenciasContagemAlmoxarifado_ !==
      "function"
    ){

      throw new Error(
        'A função "buscarDivergenciasContagemAlmoxarifado_" não foi encontrada no projeto.'
      );

    }

    divergencias =
      buscarDivergenciasContagemAlmoxarifado_(
        mes
      );

  }

  let bonus =
    resposta.bonusAlmoxarifado ||
    null;

  if(
    !bonus ||
    bonus.ok === false
  ){

    bonus =
      calcularBonusAlmoxarifadoCentral(
        mes,
        divergencias
      );

  }

  if(
    !bonus ||
    bonus.ok === false
  ){

    throw new Error(
      bonus &&
      bonus.mensagem
        ? bonus.mensagem
        : "Não foi possível calcular o bônus do Almoxarifado."
    );

  }

  const setoresBrutos =
    getTetoGastosMensal(
      mes
    );

  const setores =
    (
      Array.isArray(
        setoresBrutos
      )
        ? setoresBrutos
        : []
    ).filter(
      function(item){

        const setor =
          fechamentoAlmoxNormalizar_(
            item &&
            item.setor
          );

        if(!setor){
          return false;
        }

        if(
          setor === "total" ||
          setor.indexOf(
            "total "
          ) === 0
        ){

          return false;

        }

        return true;

      }
    );

  if(setores.length === 0){

    throw new Error(
      'Nenhum setor foi encontrado na aba "Metas e Gastos".'
    );

  }

  return {

    mes:
      mes,

    atual:
      atual,

    divergencias:
      Array.isArray(
        divergencias
      )
        ? divergencias
        : [],

    bonusAlmoxarifado:
      bonus,

    setores:
      setores

  };

}


/* =========================================================
   SALVAR SETORES
========================================================= */

function fechamentoAlmoxSalvarSetores_(
  aba,
  idFechamento,
  mes,
  agora,
  setores
){

  const lista =
    Array.isArray(
      setores
    )
      ? setores
      : [];

  if(lista.length === 0){
    return;
  }

  const linhas =
    lista.map(
      function(
        item,
        indice
      ){

        const teto =
          fechamentoAlmoxNumeroNaoNegativo_(
            item.teto
          );

        const gasto =
          fechamentoAlmoxNumeroNaoNegativo_(
            item.gasto
          );

        const saldo =
          teto -
          gasto;

        const percentualUsado =
          teto > 0
            ? (
                gasto /
                teto
              ) * 100
            : 0;

        return [

          idFechamento,
          mes,
          indice + 1,

          String(
            item.setor || ""
          ).trim(),

          fechamentoAlmoxMoeda_(
            teto
          ),

          fechamentoAlmoxMoeda_(
            gasto
          ),

          fechamentoAlmoxMoeda_(
            saldo
          ),

          fechamentoAlmoxPercentual_(
            percentualUsado
          ),

          teto > 0 &&
          gasto <= teto,

          agora

        ];

      }
    );

  aba
    .getRange(
      aba.getLastRow() + 1,
      1,
      linhas.length,
      linhas[0].length
    )
    .setValues(
      linhas
    );

}


/* =========================================================
   SALVAR DIVERGÊNCIAS
========================================================= */

function fechamentoAlmoxSalvarDivergencias_(
  aba,
  idFechamento,
  mes,
  agora,
  divergencias
){

  const lista =
    Array.isArray(
      divergencias
    )
      ? divergencias
      : [];

  if(lista.length === 0){
    return;
  }

  const linhas =
    lista.map(
      function(
        item,
        indice
      ){

        const diferenca =
          fechamentoAlmoxNumero_(
            item.diferenca
          );

        const quantidadePerdida =
          item.quantidadePerdida !==
          undefined
            ? fechamentoAlmoxNumeroNaoNegativo_(
                item.quantidadePerdida
              )
            : Math.max(
                0,
                diferenca * -1
              );

        return [

          idFechamento,
          mes,
          indice + 1,

          String(
            item.id || ""
          ),

          String(
            item.mesRef || mes
          ),

          fechamentoAlmoxConverterDataPlanilha_(
            item.dataHora
          ),

          String(
            item.produtoId || ""
          ),

          String(
            item.codigo || ""
          ),

          String(
            item.produto || ""
          ),

          String(
            item.unidade || ""
          ),

          fechamentoAlmoxNumero_(
            item.estoqueSistema
          ),

          fechamentoAlmoxNumero_(
            item.estoqueContado
          ),

          diferenca,

          quantidadePerdida,

          item.custoEncontrado === true,

          fechamentoAlmoxNumeroNaoNegativo_(
            item.custoUnitario
          ),

          fechamentoAlmoxMoeda_(
            item.valorPerda
          ),

          String(
            item.responsavel || ""
          ),

          String(
            item.observacoes || ""
          ),

          agora

        ];

      }
    );

  aba
    .getRange(
      aba.getLastRow() + 1,
      1,
      linhas.length,
      linhas[0].length
    )
    .setValues(
      linhas
    );

}


/* =========================================================
   SALVAR RESUMO PRINCIPAL
========================================================= */

function fechamentoAlmoxSalvarResumo_(
  aba,
  idFechamento,
  mes,
  agora,
  fechadoPor,
  snapshot
){

  const atual =
    snapshot.atual ||
    {};

  const bonus =
    snapshot.bonusAlmoxarifado ||
    {};

  const linha = [[

    idFechamento,                                      // A
    mes,                                               // B
    agora,                                             // C
    fechadoPor,                                        // D

    fechamentoAlmoxPercentual_(
      atual.metaContagem
    ),                                                 // E

    fechamentoAlmoxPercentual_(
      atual.assertividade
    ),                                                 // F

    fechamentoAlmoxMoeda_(
      atual.comprasMes
    ),                                                 // G

    fechamentoAlmoxPercentual_(
      atual.tetoGasto
    ),                                                 // H

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.atraso
    ),                                                 // I

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.metaAtraso
    ),                                                 // J

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.semUniforme
    ),                                                 // K

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.metaSemUniforme
    ),                                                 // L

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.semEpi
    ),                                                 // M

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.metaSemEpi
    ),                                                 // N

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.usoCelular
    ),                                                 // O

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.metaUsoCelular
    ),                                                 // P

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.falta
    ),                                                 // Q

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.metaFalta
    ),                                                 // R

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.advertencia
    ),                                                 // S

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.metaAdvertencia
    ),                                                 // T

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.ausenciaJornada
    ),                                                 // U

    fechamentoAlmoxNumeroNaoNegativo_(
      atual.metaAusenciaJornada
    ),                                                 // V

    atual.status === true,                              // W

    fechamentoAlmoxPercentual_(
      bonus.percentualBonus
    ),                                                 // X

    fechamentoAlmoxMoeda_(
      bonus.tetoTotal
    ),                                                 // Y

    fechamentoAlmoxMoeda_(
      bonus.gastoTotal
    ),                                                 // Z

    fechamentoAlmoxMoeda_(
      bonus.valorPerdas
    ),                                                 // AA

    fechamentoAlmoxMoeda_(
      bonus.gastoAjustado
    ),                                                 // AB

    fechamentoAlmoxMoeda_(
      bonus.economiaValida
    ),                                                 // AC

    fechamentoAlmoxMoeda_(
      bonus.valorBonus
    ),                                                 // AD

    String(
      bonus.status || ""
    ),                                                 // AE

    String(
      bonus.mensagem || ""
    ),                                                 // AF

    fechamentoAlmoxNumeroNaoNegativo_(
      bonus.registrosComPerda
    ),                                                 // AG

    fechamentoAlmoxNumeroNaoNegativo_(
      bonus.quantidadePerdida
    ),                                                 // AH

    fechamentoAlmoxNumeroNaoNegativo_(
      bonus.custosNaoEncontrados
    ),                                                 // AI

    fechamentoAlmoxNumeroNaoNegativo_(
      bonus.setoresConsiderados
    ),                                                 // AJ

    "FECHADO",                                         // AK

    fechamentoAlmoxJsonSeguro_(
      atual
    ),                                                 // AL

    fechamentoAlmoxJsonSeguro_(
      bonus
    ),                                                 // AM

    Array.isArray(
      snapshot.divergencias
    )
      ? snapshot.divergencias.length
      : 0,                                             // AN

    Array.isArray(
      snapshot.setores
    )
      ? snapshot.setores.length
      : 0                                              // AO

  ]];

  aba
    .getRange(
      aba.getLastRow() + 1,
      1,
      1,
      linha[0].length
    )
    .setValues(
      linha
    );

}


/* =========================================================
   CRIAR OU REPARAR ABAS
========================================================= */

function fechamentoAlmoxGarantirAbas_(){

  const ss =
    SpreadsheetApp.openById(
      FECHAMENTO_ALMOX_PLANILHA_ID
    );

  const cabecalhoMeses =
    fechamentoAlmoxCabecalhoMeses_();

  const cabecalhoSetores =
    fechamentoAlmoxCabecalhoSetores_();

  const cabecalhoDivergencias =
    fechamentoAlmoxCabecalhoDivergencias_();


  /*
    A função abaixo cria as abas caso não existam.

    Caso tenham sido criadas parcialmente em uma
    tentativa anterior, ela aumenta as colunas e
    repara os cabeçalhos.
  */

  const abaMeses =
    fechamentoAlmoxObterOuCriarAba_(
      ss,
      FECHAMENTO_ALMOX_ABA_MESES,
      cabecalhoMeses
    );

  const abaSetores =
    fechamentoAlmoxObterOuCriarAba_(
      ss,
      FECHAMENTO_ALMOX_ABA_SETORES,
      cabecalhoSetores
    );

  const abaDivergencias =
    fechamentoAlmoxObterOuCriarAba_(
      ss,
      FECHAMENTO_ALMOX_ABA_DIVERGENCIAS,
      cabecalhoDivergencias
    );

  fechamentoAlmoxFormatarAbaMeses_(
    abaMeses
  );

  fechamentoAlmoxFormatarAbaSetores_(
    abaSetores
  );

  fechamentoAlmoxFormatarAbaDivergencias_(
    abaDivergencias
  );

  return {

    abaMeses:
      abaMeses,

    abaSetores:
      abaSetores,

    abaDivergencias:
      abaDivergencias

  };

}


/* =========================================================
   OBTER OU CRIAR ABA
========================================================= */

function fechamentoAlmoxObterOuCriarAba_(
  ss,
  nomeAba,
  cabecalho
){

  let aba =
    ss.getSheetByName(
      nomeAba
    );

  if(!aba){

    aba =
      ss.insertSheet(
        nomeAba
      );

  }

  fechamentoAlmoxGarantirColunas_(
    aba,
    cabecalho.length
  );

  /*
    Uma planilha normalmente já possui linhas,
    mas esta proteção evita erro em abas reduzidas.
  */
  if(
    aba.getMaxRows() <
    2
  ){

    aba.insertRowsAfter(
      aba.getMaxRows(),
      2 -
      aba.getMaxRows()
    );

  }

  /*
    Regrava somente a linha de cabeçalho.

    Os registros salvos abaixo dela não são apagados.
  */
  aba
    .getRange(
      1,
      1,
      1,
      cabecalho.length
    )
    .setValues([
      cabecalho
    ]);

  fechamentoAlmoxFormatarCabecalho_(
    aba,
    cabecalho.length
  );

  return aba;

}


/* =========================================================
   GARANTIR QUANTIDADE DE COLUNAS
========================================================= */

function fechamentoAlmoxGarantirColunas_(
  aba,
  quantidadeNecessaria
){

  const quantidadeAtual =
    aba.getMaxColumns();

  if(
    quantidadeAtual <
    quantidadeNecessaria
  ){

    aba.insertColumnsAfter(
      quantidadeAtual,
      quantidadeNecessaria -
      quantidadeAtual
    );

  }

}


/* =========================================================
   FORMATAR CABEÇALHO
========================================================= */

function fechamentoAlmoxFormatarCabecalho_(
  aba,
  quantidadeColunas
){

  aba.setFrozenRows(
    1
  );

  aba
    .getRange(
      1,
      1,
      1,
      quantidadeColunas
    )
    .setBackground(
      "#123A6F"
    )
    .setFontColor(
      "#FFFFFF"
    )
    .setFontWeight(
      "bold"
    )
    .setHorizontalAlignment(
      "center"
    )
    .setVerticalAlignment(
      "middle"
    )
    .setWrap(
      true
    );

  aba.setRowHeight(
    1,
    42
  );

}


/* =========================================================
   FORMATAR ABA PRINCIPAL
========================================================= */

function fechamentoAlmoxFormatarAbaMeses_(
  aba
){

  aba
    .getRange("B:B")
    .setNumberFormat("@");

  aba
    .getRange("C:C")
    .setNumberFormat(
      "dd/MM/yyyy HH:mm:ss"
    );

  aba
    .getRange("E:F")
    .setNumberFormat(
      '0.00"%"'
    );

  aba
    .getRange("G:G")
    .setNumberFormat(
      'R$ #,##0.00'
    );

  aba
    .getRange("H:H")
    .setNumberFormat(
      '0.00"%"'
    );

  aba
    .getRange("I:V")
    .setNumberFormat(
      "0.####"
    );

  aba
    .getRange("X:X")
    .setNumberFormat(
      '0.00"%"'
    );

  aba
    .getRange("Y:AD")
    .setNumberFormat(
      'R$ #,##0.00'
    );

  aba
    .getRange("AG:AJ")
    .setNumberFormat(
      "0.####"
    );

  aba
    .getRange("AN:AO")
    .setNumberFormat(
      "0"
    );

  aba.setColumnWidth(
    1,
    190
  );

  aba.setColumnWidth(
    2,
    90
  );

  aba.setColumnWidth(
    3,
    150
  );

  aba.setColumnWidth(
    4,
    180
  );

  aba.setColumnWidths(
    5,
    32,
    125
  );

  aba.setColumnWidths(
    37,
    3,
    220
  );

  aba.setColumnWidths(
    40,
    2,
    125
  );

}


/* =========================================================
   FORMATAR ABA DE SETORES
========================================================= */

function fechamentoAlmoxFormatarAbaSetores_(
  aba
){

  aba
    .getRange("B:B")
    .setNumberFormat("@");

  aba
    .getRange("E:G")
    .setNumberFormat(
      'R$ #,##0.00'
    );

  aba
    .getRange("H:H")
    .setNumberFormat(
      '0.00"%"'
    );

  aba
    .getRange("J:J")
    .setNumberFormat(
      "dd/MM/yyyy HH:mm:ss"
    );

  aba.setColumnWidth(
    1,
    190
  );

  aba.setColumnWidth(
    2,
    90
  );

  aba.setColumnWidth(
    3,
    70
  );

  aba.setColumnWidth(
    4,
    210
  );

  aba.setColumnWidths(
    5,
    5,
    125
  );

  aba.setColumnWidth(
    10,
    150
  );

}


/* =========================================================
   FORMATAR ABA DE DIVERGÊNCIAS
========================================================= */

function fechamentoAlmoxFormatarAbaDivergencias_(
  aba
){

  aba
    .getRange("B:B")
    .setNumberFormat("@");

  aba
    .getRange("D:E")
    .setNumberFormat("@");

  aba
    .getRange("F:F")
    .setNumberFormat(
      "dd/MM/yyyy HH:mm:ss"
    );

  aba
    .getRange("G:H")
    .setNumberFormat("@");

  aba
    .getRange("K:N")
    .setNumberFormat(
      "0.####"
    );

  aba
    .getRange("P:P")
    .setNumberFormat(
      'R$ #,##0.0000'
    );

  aba
    .getRange("Q:Q")
    .setNumberFormat(
      'R$ #,##0.00'
    );

  aba
    .getRange("T:T")
    .setNumberFormat(
      "dd/MM/yyyy HH:mm:ss"
    );

  aba.setColumnWidth(
    1,
    190
  );

  aba.setColumnWidth(
    2,
    90
  );

  aba.setColumnWidth(
    3,
    70
  );

  aba.setColumnWidth(
    4,
    150
  );

  aba.setColumnWidth(
    5,
    110
  );

  aba.setColumnWidth(
    6,
    150
  );

  aba.setColumnWidths(
    7,
    2,
    130
  );

  aba.setColumnWidth(
    9,
    240
  );

  aba.setColumnWidth(
    10,
    90
  );

  aba.setColumnWidths(
    11,
    7,
    120
  );

  aba.setColumnWidth(
    18,
    180
  );

  aba.setColumnWidth(
    19,
    260
  );

  aba.setColumnWidth(
    20,
    150
  );

}


/* =========================================================
   CABEÇALHO DA ABA PRINCIPAL
========================================================= */

function fechamentoAlmoxCabecalhoMeses_(){

  return [

    "ID FECHAMENTO",                  // A
    "MÊS",                            // B
    "DATA FECHAMENTO",                // C
    "FECHADO POR",                    // D

    "RESULTADO CONTAGEM (%)",         // E
    "ASSERTIVIDADE (%)",              // F
    "COMPRAS DO MÊS",                 // G
    "CONSUMO DO TETO (%)",            // H

    "ATRASO",                         // I
    "META ATRASO",                    // J

    "SEM UNIFORME",                   // K
    "META SEM UNIFORME",              // L

    "SEM EPI",                        // M
    "META SEM EPI",                   // N

    "USO DE CELULAR",                 // O
    "META USO DE CELULAR",            // P

    "FALTA",                          // Q
    "META FALTA",                     // R

    "ADVERTÊNCIA",                    // S
    "META ADVERTÊNCIA",               // T

    "AUSÊNCIA DE JORNADA",            // U
    "META AUSÊNCIA DE JORNADA",       // V

    "META GERAL ATINGIDA",            // W

    "% BÔNUS",                        // X
    "TETO TOTAL DOS SETORES",         // Y
    "GASTO TOTAL DOS SETORES",        // Z
    "VALOR DAS PERDAS",               // AA
    "GASTO AJUSTADO",                 // AB
    "ECONOMIA VÁLIDA",                // AC
    "VALOR DO BÔNUS",                 // AD

    "STATUS DO BÔNUS",                // AE
    "MENSAGEM DO BÔNUS",              // AF

    "REGISTROS COM PERDA",            // AG
    "QUANTIDADE PERDIDA",             // AH
    "CUSTOS NÃO ENCONTRADOS",         // AI
    "SETORES CONSIDERADOS",           // AJ

    "STATUS",                         // AK

    "FOTOGRAFIA INDICADORES",         // AL
    "FOTOGRAFIA BÔNUS",               // AM

    "QUANTIDADE DIVERGÊNCIAS",        // AN
    "QUANTIDADE SETORES"              // AO

  ];

}


/* =========================================================
   CABEÇALHO DA ABA DE SETORES
========================================================= */

function fechamentoAlmoxCabecalhoSetores_(){

  return [

    "ID FECHAMENTO",
    "MÊS",
    "ORDEM",
    "SETOR",
    "TETO",
    "GASTO",
    "SALDO",
    "% UTILIZADO",
    "DENTRO DO TETO",
    "DATA FECHAMENTO"

  ];

}


/* =========================================================
   CABEÇALHO DA ABA DE DIVERGÊNCIAS
========================================================= */

function fechamentoAlmoxCabecalhoDivergencias_(){

  return [

    "ID FECHAMENTO",
    "MÊS",
    "ORDEM",

    "ID CONTAGEM",
    "MÊS REFERÊNCIA",
    "DATA/HORA CONTAGEM",

    "PRODUTO ID",
    "CÓDIGO",
    "PRODUTO",
    "UNIDADE",

    "ESTOQUE SISTEMA",
    "ESTOQUE CONTADO",
    "DIFERENÇA",
    "QUANTIDADE PERDIDA",

    "CUSTO ENCONTRADO",
    "CUSTO UNITÁRIO",
    "VALOR DA PERDA",

    "RESPONSÁVEL",
    "OBSERVAÇÕES",

    "DATA FECHAMENTO"

  ];

}


/* =========================================================
   LOCALIZAR MÊS FECHADO
========================================================= */

function fechamentoAlmoxLocalizarMes_(
  abaMeses,
  mes
){

  const ultimaLinha =
    abaMeses.getLastRow();

  if(
    ultimaLinha <
    2
  ){

    return null;

  }

  const quantidadeColunas =
    fechamentoAlmoxCabecalhoMeses_()
      .length;

  const dados =
    abaMeses
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        quantidadeColunas
      )
      .getValues();

  for(
    let i =
      dados.length - 1;

    i >= 0;

    i--
  ){

    const mesLinha =
      String(
        dados[i][1] || ""
      ).trim();

    /*
      AK = coluna 37
      Índice do array = 36
    */
    const status =
      String(
        dados[i][36] || ""
      ).trim();

    if(
      mesLinha === mes &&
      status === "FECHADO"
    ){

      return {

        linha:
          i + 2,

        valores:
          dados[i]

      };

    }

  }

  return null;

}


/* =========================================================
   MONTAR RETORNO PARA O HTML
========================================================= */

function fechamentoAlmoxMontarRetorno_(
  estrutura,
  registro
){

  const linha =
    registro.valores;

  const idFechamento =
    String(
      linha[0] || ""
    );

  const mes =
    String(
      linha[1] || ""
    );

  /*
    AL = índice 37
    AM = índice 38
  */
  let atual =
    fechamentoAlmoxJsonLer_(
      linha[37]
    );

  let bonusAlmoxarifado =
    fechamentoAlmoxJsonLer_(
      linha[38]
    );

  /*
    Caso o JSON não esteja disponível,
    reconstrói os dados pelas colunas.
  */
  if(
    !atual ||
    Object.keys(
      atual
    ).length === 0
  ){

    atual =
      fechamentoAlmoxReconstruirAtual_(
        linha
      );

  }

  if(
    !bonusAlmoxarifado ||
    Object.keys(
      bonusAlmoxarifado
    ).length === 0
  ){

    bonusAlmoxarifado =
      fechamentoAlmoxReconstruirBonus_(
        linha
      );

  }

  atual.fechamentoMensal =
    true;

  bonusAlmoxarifado.ok =
    true;

  bonusAlmoxarifado.fechamentoMensal =
    true;

  const setores =
    fechamentoAlmoxLerSetoresFechados_(
      estrutura.abaSetores,
      idFechamento
    );

  const divergencias =
    fechamentoAlmoxLerDivergenciasFechadas_(
      estrutura.abaDivergencias,
      idFechamento
    );

  return {

    ok:
      true,

    fechado:
      true,

    fechamentoMensal:
      true,

    idFechamento:
      idFechamento,

    mes:
      mes,

    dataFechamento:
      fechamentoAlmoxFormatarDataRetorno_(
        linha[2]
      ),

    fechadoPor:
      String(
        linha[3] || ""
      ),

    atual:
      atual,

    historico:
      [],

    divergencias:
      divergencias,

    bonusAlmoxarifado:
      bonusAlmoxarifado,

    setores:
      setores

  };

}


/* =========================================================
   RECONSTRUIR INDICADORES
========================================================= */

function fechamentoAlmoxReconstruirAtual_(
  linha
){

  return {

    metaContagem:
      fechamentoAlmoxNumero_(
        linha[4]
      ),

    assertividade:
      fechamentoAlmoxNumero_(
        linha[5]
      ),

    comprasMes:
      fechamentoAlmoxNumero_(
        linha[6]
      ),

    tetoGasto:
      fechamentoAlmoxNumero_(
        linha[7]
      ),

    atraso:
      fechamentoAlmoxNumero_(
        linha[8]
      ),

    metaAtraso:
      fechamentoAlmoxNumero_(
        linha[9]
      ),

    semUniforme:
      fechamentoAlmoxNumero_(
        linha[10]
      ),

    metaSemUniforme:
      fechamentoAlmoxNumero_(
        linha[11]
      ),

    semEpi:
      fechamentoAlmoxNumero_(
        linha[12]
      ),

    metaSemEpi:
      fechamentoAlmoxNumero_(
        linha[13]
      ),

    usoCelular:
      fechamentoAlmoxNumero_(
        linha[14]
      ),

    metaUsoCelular:
      fechamentoAlmoxNumero_(
        linha[15]
      ),

    falta:
      fechamentoAlmoxNumero_(
        linha[16]
      ),

    metaFalta:
      fechamentoAlmoxNumero_(
        linha[17]
      ),

    advertencia:
      fechamentoAlmoxNumero_(
        linha[18]
      ),

    metaAdvertencia:
      fechamentoAlmoxNumero_(
        linha[19]
      ),

    ausenciaJornada:
      fechamentoAlmoxNumero_(
        linha[20]
      ),

    metaAusenciaJornada:
      fechamentoAlmoxNumero_(
        linha[21]
      ),

    status:
      fechamentoAlmoxBooleano_(
        linha[22]
      )

  };

}


/* =========================================================
   RECONSTRUIR BÔNUS
========================================================= */

function fechamentoAlmoxReconstruirBonus_(
  linha
){

  const statusBonus =
    String(
      linha[30] || ""
    );

  const custosNaoEncontrados =
    fechamentoAlmoxNumero_(
      linha[34]
    );

  return {

    ok:
      true,

    percentualBonus:
      fechamentoAlmoxNumero_(
        linha[23]
      ),

    tetoTotal:
      fechamentoAlmoxNumero_(
        linha[24]
      ),

    gastoTotal:
      fechamentoAlmoxNumero_(
        linha[25]
      ),

    valorPerdas:
      fechamentoAlmoxNumero_(
        linha[26]
      ),

    gastoAjustado:
      fechamentoAlmoxNumero_(
        linha[27]
      ),

    economiaValida:
      fechamentoAlmoxNumero_(
        linha[28]
      ),

    valorBonus:
      fechamentoAlmoxNumero_(
        linha[29]
      ),

    status:
      statusBonus,

    mensagem:
      String(
        linha[31] || ""
      ),

    registrosComPerda:
      fechamentoAlmoxNumero_(
        linha[32]
      ),

    quantidadePerdida:
      fechamentoAlmoxNumero_(
        linha[33]
      ),

    custosNaoEncontrados:
      custosNaoEncontrados,

    setoresConsiderados:
      fechamentoAlmoxNumero_(
        linha[35]
      ),

    calculoPendente:
      custosNaoEncontrados >
      0,

    elegivel:
      statusBonus ===
      "ELEGIVEL"

  };

}


/* =========================================================
   LER SETORES FECHADOS
========================================================= */

function fechamentoAlmoxLerSetoresFechados_(
  aba,
  idFechamento
){

  const ultimaLinha =
    aba.getLastRow();

  if(
    ultimaLinha <
    2
  ){

    return [];

  }

  const dados =
    aba
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        10
      )
      .getValues();

  return dados
    .filter(
      function(item){

        return (
          String(
            item[0] || ""
          ) ===
          idFechamento
        );

      }
    )
    .sort(
      function(
        a,
        b
      ){

        return (
          Number(
            a[2] || 0
          ) -
          Number(
            b[2] || 0
          )
        );

      }
    )
    .map(
      function(item){

        return {

          setor:
            String(
              item[3] || ""
            ),

          teto:
            fechamentoAlmoxNumero_(
              item[4]
            ),

          gasto:
            fechamentoAlmoxNumero_(
              item[5]
            ),

          saldo:
            fechamentoAlmoxNumero_(
              item[6]
            ),

          percentual:
            fechamentoAlmoxNumero_(
              item[7]
            ),

          dentroDoTeto:
            fechamentoAlmoxBooleano_(
              item[8]
            )

        };

      }
    );

}


/* =========================================================
   LER DIVERGÊNCIAS FECHADAS
========================================================= */

function fechamentoAlmoxLerDivergenciasFechadas_(
  aba,
  idFechamento
){

  const ultimaLinha =
    aba.getLastRow();

  if(
    ultimaLinha <
    2
  ){

    return [];

  }

  const dados =
    aba
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        20
      )
      .getValues();

  return dados
    .filter(
      function(item){

        return (
          String(
            item[0] || ""
          ) ===
          idFechamento
        );

      }
    )
    .sort(
      function(
        a,
        b
      ){

        return (
          Number(
            a[2] || 0
          ) -
          Number(
            b[2] || 0
          )
        );

      }
    )
    .map(
      function(item){

        return {

          fechamentoMensal:
            true,

          id:
            String(
              item[3] || ""
            ),

          mesRef:
            String(
              item[4] || ""
            ),

          dataHora:
            fechamentoAlmoxFormatarDataRetorno_(
              item[5]
            ),

          produtoId:
            String(
              item[6] || ""
            ),

          codigo:
            String(
              item[7] || ""
            ),

          produto:
            String(
              item[8] || ""
            ),

          unidade:
            String(
              item[9] || ""
            ),

          estoqueSistema:
            fechamentoAlmoxNumero_(
              item[10]
            ),

          estoqueContado:
            fechamentoAlmoxNumero_(
              item[11]
            ),

          diferenca:
            fechamentoAlmoxNumero_(
              item[12]
            ),

          quantidadePerdida:
            fechamentoAlmoxNumeroNaoNegativo_(
              item[13]
            ),

          custoEncontrado:
            fechamentoAlmoxBooleano_(
              item[14]
            ),

          custoUnitario:
            fechamentoAlmoxNumeroNaoNegativo_(
              item[15]
            ),

          valorPerda:
            fechamentoAlmoxNumeroNaoNegativo_(
              item[16]
            ),

          responsavel:
            String(
              item[17] || ""
            ),

          observacoes:
            String(
              item[18] || ""
            )

        };

      }
    );

}


/* =========================================================
   VALIDAR SENHA DA GERÊNCIA
========================================================= */

function fechamentoAlmoxValidarSenhaGerencia_(
  senhaInformada
){
  /* Senha removida (out/2026): quem protege agora é o login do Acervo (api/gs.js). */
  return;


  const senha =
    String(
      senhaInformada || ""
    ).trim();

  if(!senha){

    throw new Error(
      "Informe a senha da Gerência."
    );

  }

  const ss =
    SpreadsheetApp.openById(
      FECHAMENTO_ALMOX_SENHAS_ID
    );

  let aba =
    ss.getSheetByName(
      FECHAMENTO_ALMOX_ABA_SENHAS
    );

  if(!aba){

    aba =
      ss
        .getSheets()
        .find(
          function(sheet){

            return (
              fechamentoAlmoxNormalizar_(
                sheet.getName()
              ) ===
              "senhas"
            );

          }
        );

  }

  if(!aba){

    throw new Error(
      'A aba "Senhas" não foi encontrada.'
    );

  }

  const ultimaLinha =
    aba.getLastRow();

  if(
    ultimaLinha <
    2
  ){

    throw new Error(
      "A planilha de senhas está vazia."
    );

  }

  const dados =
    aba
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        2
      )
      .getDisplayValues();

  let senhaGerencia =
    "";

  for(
    let i = 0;
    i < dados.length;
    i++
  ){

    const setor =
      fechamentoAlmoxNormalizar_(
        dados[i][0]
      );

    if(
      setor ===
      "gerencia"
    ){

      senhaGerencia =
        String(
          dados[i][1] || ""
        ).trim();

      break;

    }

  }

  if(!senhaGerencia){

    throw new Error(
      'A senha do setor "Gerência" não foi encontrada.'
    );

  }

  if(
    senha !==
    senhaGerencia
  ){

    throw new Error(
      "Senha da Gerência incorreta."
    );

  }

  return true;

}


/* =========================================================
   VALIDAR MÊS
========================================================= */

function fechamentoAlmoxValidarMes_(
  mesFiltro,
  bloquearFuturo
){

  const mes =
    String(
      mesFiltro || ""
    ).trim();

  if(
    !/^\d{4}-\d{2}$/.test(
      mes
    )
  ){

    throw new Error(
      "Mês inválido. Use o formato AAAA-MM."
    );

  }

  const numeroMes =
    Number(
      mes
        .split("-")[1]
    );

  if(
    numeroMes <
    1 ||
    numeroMes >
    12
  ){

    throw new Error(
      "Mês inválido."
    );

  }

  if(
    bloquearFuturo ===
    true
  ){

    const mesAtual =
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM"
      );

    if(
      mes >
      mesAtual
    ){

      throw new Error(
        "Não é possível fechar um mês futuro."
      );

    }

  }

  return mes;

}


/* =========================================================
   REMOVER LINHAS DE FECHAMENTO PARCIAL
========================================================= */

function fechamentoAlmoxRemoverLinhasPorId_(
  aba,
  idFechamento
){

  const ultimaLinha =
    aba.getLastRow();

  if(
    ultimaLinha <
    2
  ){

    return;

  }

  const ids =
    aba
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        1
      )
      .getDisplayValues();

  const linhas =
    [];

  ids.forEach(
    function(
      item,
      indice
    ){

      if(
        String(
          item[0] || ""
        ) ===
        idFechamento
      ){

        linhas.push(
          indice + 2
        );

      }

    }
  );

  /*
    Remove de baixo para cima.
  */
  linhas
    .sort(
      function(
        a,
        b
      ){

        return b - a;

      }
    )
    .forEach(
      function(linha){

        aba.deleteRow(
          linha
        );

      }
    );

}


/* =========================================================
   CONVERTER DATA PARA PLANILHA
========================================================= */

function fechamentoAlmoxConverterDataPlanilha_(
  valor
){

  if(
    valor instanceof Date &&
    !isNaN(
      valor.getTime()
    )
  ){

    return valor;

  }

  const texto =
    String(
      valor || ""
    ).trim();

  if(!texto){

    return "";

  }

  /*
    Formato ISO.
  */
  if(
    /^\d{4}-\d{2}-\d{2}/.test(
      texto
    )
  ){

    const dataIso =
      new Date(
        texto
      );

    return isNaN(
      dataIso.getTime()
    )
      ? texto
      : dataIso;

  }

  /*
    Formato brasileiro:
    22/07/2026 10:30:00
  */
  const partesTexto =
    texto.split(
      " "
    );

  const partesData =
    partesTexto[0].split(
      "/"
    );

  if(
    partesData.length ===
    3
  ){

    const partesHora =
      partesTexto.length >
      1
        ? partesTexto[1].split(
            ":"
          )
        : [];

    const dataBR =
      new Date(

        Number(
          partesData[2]
        ),

        Number(
          partesData[1]
        ) - 1,

        Number(
          partesData[0]
        ),

        Number(
          partesHora[0] || 0
        ),

        Number(
          partesHora[1] || 0
        ),

        Number(
          partesHora[2] || 0
        )

      );

    return isNaN(
      dataBR.getTime()
    )
      ? texto
      : dataBR;

  }

  const data =
    new Date(
      texto
    );

  return isNaN(
    data.getTime()
  )
    ? texto
    : data;

}


/* =========================================================
   CONVERTER NÚMERO
========================================================= */

function fechamentoAlmoxNumero_(
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
    typeof valor ===
    "number"
  ){

    return isFinite(
      valor
    )
      ? valor
      : 0;

  }

  let texto =
    String(
      valor
    )
      .trim()
      .replace(
        /R\$/gi,
        ""
      )
      .replace(
        /\s/g,
        ""
      );

  /*
    Formato brasileiro:
    1.250,50
  */
  if(
    texto.includes(
      ","
    )
  ){

    texto =
      texto
        .replace(
          /\./g,
          ""
        )
        .replace(
          ",",
          "."
        );

  /*
    Formato:
    30.000
  */
  } else if(
    /^-?\d{1,3}(\.\d{3})+$/.test(
      texto
    )
  ){

    texto =
      texto.replace(
        /\./g,
        ""
      );

  }

  texto =
    texto.replace(
      /[^\d.-]/g,
      ""
    );

  const numero =
    Number(
      texto
    );

  return isFinite(
    numero
  )
    ? numero
    : 0;

}


/* =========================================================
   NÚMERO NÃO NEGATIVO
========================================================= */

function fechamentoAlmoxNumeroNaoNegativo_(
  valor
){

  return Math.max(
    0,
    fechamentoAlmoxNumero_(
      valor
    )
  );

}


/* =========================================================
   MOEDA
========================================================= */

function fechamentoAlmoxMoeda_(
  valor
){

  return Number(
    fechamentoAlmoxNumero_(
      valor
    ).toFixed(
      2
    )
  );

}


/* =========================================================
   PERCENTUAL
========================================================= */

function fechamentoAlmoxPercentual_(
  valor
){

  return Number(
    fechamentoAlmoxNumero_(
      valor
    ).toFixed(
      4
    )
  );

}


/* =========================================================
   BOOLEANO
========================================================= */

function fechamentoAlmoxBooleano_(
  valor
){

  if(
    valor === true ||
    valor === 1
  ){

    return true;

  }

  const texto =
    fechamentoAlmoxNormalizar_(
      valor
    );

  return (
    texto === "true" ||
    texto === "verdadeiro" ||
    texto === "sim"
  );

}


/* =========================================================
   NORMALIZAR TEXTO
========================================================= */

function fechamentoAlmoxNormalizar_(
  valor
){

  return String(
    valor || ""
  )
    .toLowerCase()
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

}


/* =========================================================
   FORMATAR DATA PARA HTML
========================================================= */

function fechamentoAlmoxFormatarDataRetorno_(
  valor
){

  if(
    valor instanceof Date &&
    !isNaN(
      valor.getTime()
    )
  ){

    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd'T'HH:mm:ss"
    );

  }

  return String(
    valor || ""
  );

}


/* =========================================================
   GERAR JSON SEGURO
========================================================= */

function fechamentoAlmoxJsonSeguro_(
  valor
){

  try{

    const texto =
      JSON.stringify(
        valor || {}
      );

    /*
      Limite aproximado de caracteres
      aceitos em uma célula do Sheets.
    */
    if(
      texto.length >
      49000
    ){

      throw new Error(
        "A fotografia JSON ultrapassou o limite permitido por célula."
      );

    }

    return texto;

  } catch(erro){

    throw new Error(
      "Não foi possível gerar a fotografia do fechamento: " +
      erro.message
    );

  }

}


/* =========================================================
   LER JSON
========================================================= */

function fechamentoAlmoxJsonLer_(
  valor
){

  try{

    const texto =
      String(
        valor || ""
      ).trim();

    return texto
      ? JSON.parse(
          texto
        )
      : {};

  } catch(erro){

    return {};

  }

}


/* =========================================================
   TESTE 1 — CRIAR E REPARAR ABAS
========================================================= */

function testarCriacaoAbasFechamentoAlmox(){

  try{

    const estrutura =
      fechamentoAlmoxGarantirAbas_();

    const resultado = {

      ok:
        true,

      abaMeses:
        estrutura
          .abaMeses
          .getName(),

      colunasAbaMeses:
        estrutura
          .abaMeses
          .getMaxColumns(),

      abaSetores:
        estrutura
          .abaSetores
          .getName(),

      colunasAbaSetores:
        estrutura
          .abaSetores
          .getMaxColumns(),

      abaDivergencias:
        estrutura
          .abaDivergencias
          .getName(),

      colunasAbaDivergencias:
        estrutura
          .abaDivergencias
          .getMaxColumns()

    };

    Logger.log(
      JSON.stringify(
        resultado,
        null,
        2
      )
    );

    return resultado;

  } catch(erro){

    Logger.log(
      "ERRO AO CRIAR/REPARAR ABAS: " +
      (
        erro &&
        erro.stack
          ? erro.stack
          : erro
      )
    );

    throw new Error(
      "Erro ao criar ou reparar as abas do fechamento: " +
      (
        erro &&
        erro.message
          ? erro.message
          : erro
      )
    );

  }

}


/* =========================================================
   TESTE 2 — CALCULAR SNAPSHOT

   Não salva o fechamento.
========================================================= */

function testarSnapshotFechamentoAlmox(){

  const mes =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );

  const resultado =
    fechamentoAlmoxCalcularSnapshot_(
      mes
    );

  Logger.log(
    JSON.stringify(
      resultado,
      null,
      2
    )
  );

  return resultado;

}


/* =========================================================
   TESTE 3 — CONSULTAR FECHAMENTO
========================================================= */

function testarConsultaFechamentoAlmox(){

  const mes =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );

  const resultado =
    fechamentoAlmoxarifadoObter(
      mes
    );

  Logger.log(
    JSON.stringify(
      resultado,
      null,
      2
    )
  );

  return resultado;

}