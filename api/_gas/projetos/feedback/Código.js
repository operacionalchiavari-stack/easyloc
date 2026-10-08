const SPREADSHEET_ID =
  "1lh7ArXcVK11PxGrmbMhTA9plR_S8eiESi3s49ZrgYOA";

const ABA_FEEDBACK =
  "Feedback";

const PLANILHA_SENHAS_ID =
  "133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk";

const ABA_SENHAS =
  "Senhas";

const SETOR_SENHA_LIGACOES =
  "Comercial";

const MATRIZ_ID =
  "1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78";

const ABA_MATRIZ =
  "Matriz";

const TIMEZONE =
  "America/Sao_Paulo";

const DATA_INICIO_FEEDBACK =
  new Date(2026, 6, 20);

const ABA_REGRAS_FEEDBACK =
  "RegrasFeedback";

const CACHE_REGRAS_FEEDBACK =
  "REGRAS_FEEDBACK_V1";

const COLUNAS_REGRAS_FEEDBACK = [
  "Chave",
  "Regra",
  "Valor",
  "Tipo",
  "Descrição",
  "Ordem",
  "Atualizado em",
  "Atualizado por"
];

/*
  Valores usados na primeira criação da aba RegrasFeedback.
  Depois disso, as regras passam a ser lidas da planilha e podem ser
  alteradas pelo botão Configurações dentro do próprio sistema.
*/
const DEFINICOES_REGRAS_FEEDBACK = [
  {
    chave:"DIAS_CLIENTE_NOVO",
    campo:"diasClienteNovo",
    nome:"Intervalo para cliente novo",
    valorPadrao:30,
    tipo:"NUMERO",
    minimo:1,
    maximo:3650,
    descricao:"Quantidade mínima de dias entre contatos de um cliente classificado como novo.",
    ordem:1
  },
  {
    chave:"DIAS_CLIENTE_RECORRENTE",
    campo:"diasClienteRecorrente",
    nome:"Intervalo para cliente recorrente",
    valorPadrao:60,
    tipo:"NUMERO",
    minimo:1,
    maximo:3650,
    descricao:"Quantidade mínima de dias entre contatos de um cliente classificado como recorrente.",
    ordem:2
  },
  {
    chave:"PEDIDOS_PARA_RECORRENTE",
    campo:"pedidosParaRecorrente",
    nome:"Pedidos para ser recorrente",
    valorPadrao:2,
    tipo:"NUMERO",
    minimo:1,
    maximo:999,
    descricao:"Quantidade de pedidos do cliente necessária para classificá-lo como recorrente.",
    ordem:3
  },
  {
    chave:"APENAS_EVENTOS_REALIZADOS",
    campo:"apenasEventosRealizados",
    nome:"Somente eventos realizados",
    valorPadrao:true,
    tipo:"SIM_NAO",
    descricao:"Quando ativado, eventos com data futura não entram na lista de follow-up.",
    ordem:4
  },
  {
    chave:"EVENTO_SEM_DATA_APARECE",
    campo:"eventoSemDataAparece",
    nome:"Mostrar evento sem data",
    valorPadrao:true,
    tipo:"SIM_NAO",
    descricao:"Quando ativado, pedidos sem data de evento continuam aparecendo na lista.",
    ordem:5
  },
  {
    chave:"UM_PENDENTE_POR_CLIENTE",
    campo:"umPendentePorCliente",
    nome:"Um pendente por cliente",
    valorPadrao:true,
    tipo:"SIM_NAO",
    descricao:"Quando ativado, somente um pedido do mesmo cliente fica marcado como Precisa ligação.",
    ordem:6
  },
  {
    chave:"PEDIDO_COM_FEEDBACK_NAO_LIGA",
    campo:"pedidoComFeedbackNaoLiga",
    nome:"Ignorar pedido já respondido",
    valorPadrao:true,
    tipo:"SIM_NAO",
    descricao:"Quando ativado, um pedido que já possui feedback nunca volta como ligação pendente.",
    ordem:7
  }
];

const COLUNAS_FEEDBACK = [
  "ID",
  "Pedido",
  "Data Evento",
  "Cliente",
  "Local",
  "Resultado do Contato",
  "Satisfação Geral",
  "Houve Elogio",
  "Setor Elogio",
  "Descrição do Elogio",
  "Houve Ponto de Melhoria",
  "Setor Melhoria",
  "Descrição da Melhoria",
  "Observações",
  "Responsável",
  "Data do Contato",
  "Hora do Contato",
  "DataHoraRegistro",
  "DataHoraAtualizacao"
];

function doGet() {
  prepararAbaFeedback();
  prepararAbaRegrasFeedback();

  return HtmlService
    .createHtmlOutputFromFile("Index")
    .setTitle("Feedbacks Pós-Evento")
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );
}

function getSS() {
  return SpreadsheetApp.openById(
    SPREADSHEET_ID
  );
}


function prepararAbaRegrasFeedback() {
  const ss = getSS();

  let aba =
    ss.getSheetByName(
      ABA_REGRAS_FEEDBACK
    );

  if (!aba) {
    aba = ss.insertSheet(
      ABA_REGRAS_FEEDBACK
    );
  }

  aba
    .getRange(
      1,
      1,
      1,
      COLUNAS_REGRAS_FEEDBACK.length
    )
    .setValues([
      COLUNAS_REGRAS_FEEDBACK
    ]);

  const ultimaLinha =
    aba.getLastRow();

  const chavesExistentes =
    ultimaLinha > 1
      ? new Set(
          aba
            .getRange(
              2,
              1,
              ultimaLinha - 1,
              1
            )
            .getDisplayValues()
            .flat()
            .map(valor =>
              limparTexto_(valor)
            )
        )
      : new Set();

  const agora =
    new Date();

  const responsavel =
    obterResponsavelAtual_();

  const linhasFaltantes =
    DEFINICOES_REGRAS_FEEDBACK
      .filter(definicao =>
        !chavesExistentes.has(
          definicao.chave
        )
      )
      .map(definicao => [
        definicao.chave,
        definicao.nome,
        serializarValorRegra_(
          definicao,
          definicao.valorPadrao
        ),
        definicao.tipo,
        definicao.descricao,
        definicao.ordem,
        agora,
        responsavel
      ]);

  if (linhasFaltantes.length) {
    aba
      .getRange(
        aba.getLastRow() + 1,
        1,
        linhasFaltantes.length,
        COLUNAS_REGRAS_FEEDBACK.length
      )
      .setValues(
        linhasFaltantes
      );
  }

  formatarAbaRegrasFeedback_(
    aba
  );

  return aba;
}

function formatarAbaRegrasFeedback_(aba) {
  aba.setFrozenRows(1);

  aba
    .getRange(
      1,
      1,
      1,
      COLUNAS_REGRAS_FEEDBACK.length
    )
    .setBackground("#173d6b")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  aba.setRowHeight(
    1,
    36
  );

  const larguras = [
    235,
    240,
    110,
    100,
    470,
    75,
    155,
    210
  ];

  larguras.forEach((largura, indice) =>
    aba.setColumnWidth(
      indice + 1,
      largura
    )
  );

  const ultimaLinha =
    aba.getLastRow();

  if (ultimaLinha <= 1) return;

  aba
    .getRange(
      2,
      1,
      ultimaLinha - 1,
      COLUNAS_REGRAS_FEEDBACK.length
    )
    .setVerticalAlignment("middle")
    .setWrap(true);

  aba
    .getRange(
      2,
      6,
      ultimaLinha - 1,
      1
    )
    .setHorizontalAlignment("center");

  aba
    .getRange(
      2,
      7,
      ultimaLinha - 1,
      1
    )
    .setNumberFormat(
      "dd/MM/yyyy HH:mm:ss"
    );

  const regraSimNao =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        ["SIM", "NÃO"],
        true
      )
      .setAllowInvalid(false)
      .build();

  DEFINICOES_REGRAS_FEEDBACK
    .filter(definicao =>
      definicao.tipo === "SIM_NAO"
    )
    .forEach(definicao => {
      const linha =
        localizarLinhaRegra_(
          aba,
          definicao.chave
        );

      if (linha) {
        aba
          .getRange(
            linha,
            3
          )
          .setDataValidation(
            regraSimNao
          );
      }
    });
}

function obterRegrasFeedback() {
  const configuracao =
    lerRegrasFeedback_(
      false
    );

  return {
    sucesso:true,
    regras:
      configuracao.regras,
    padroes:
      obterRegrasPadrao_(),
    atualizadoEm:
      configuracao.atualizadoEm,
    atualizadoPor:
      configuracao.atualizadoPor,
    aba:
      ABA_REGRAS_FEEDBACK
  };
}

function salvarRegrasFeedback(dados) {
  const lock =
    LockService.getScriptLock();

  lock.waitLock(
    30000
  );

  try {
    const regrasValidadas =
      validarRegrasFeedback_(
        dados
      );

    const aba =
      prepararAbaRegrasFeedback();

    const agora =
      new Date();

    const responsavel =
      obterResponsavelAtual_();

    DEFINICOES_REGRAS_FEEDBACK
      .forEach(definicao => {
        const linha =
          localizarLinhaRegra_(
            aba,
            definicao.chave
          );

        if (!linha) {
          throw new Error(
            `A regra ${definicao.chave} não foi encontrada na aba ${ABA_REGRAS_FEEDBACK}.`
          );
        }

        aba
          .getRange(
            linha,
            1,
            1,
            COLUNAS_REGRAS_FEEDBACK.length
          )
          .setValues([[
            definicao.chave,
            definicao.nome,
            serializarValorRegra_(
              definicao,
              regrasValidadas[
                definicao.campo
              ]
            ),
            definicao.tipo,
            definicao.descricao,
            definicao.ordem,
            agora,
            responsavel
          ]]);
      });

    CacheService
      .getScriptCache()
      .remove(
        CACHE_REGRAS_FEEDBACK
      );

    SpreadsheetApp.flush();

    const configuracao =
      lerRegrasFeedback_(
        false
      );

    return {
      sucesso:true,
      mensagem:
        "Configurações de follow-up salvas com sucesso.",
      regras:
        configuracao.regras,
      padroes:
        obterRegrasPadrao_(),
      atualizadoEm:
        configuracao.atualizadoEm,
      atualizadoPor:
        configuracao.atualizadoPor,
      aba:
        ABA_REGRAS_FEEDBACK
    };

  } finally {
    lock.releaseLock();
  }
}

function lerRegrasFeedback_(usarCache) {
  const deveUsarCache =
    usarCache !== false;

  const cache =
    CacheService.getScriptCache();

  if (deveUsarCache) {
    const armazenado =
      cache.get(
        CACHE_REGRAS_FEEDBACK
      );

    if (armazenado) {
      try {
        return JSON.parse(
          armazenado
        );
      } catch (erro) {
        cache.remove(
          CACHE_REGRAS_FEEDBACK
        );
      }
    }
  }

  const aba =
    prepararAbaRegrasFeedback();

  const dados =
    aba
      .getRange(
        1,
        1,
        aba.getLastRow(),
        COLUNAS_REGRAS_FEEDBACK.length
      )
      .getValues();

  const mapa =
    mapaCabecalhos_(
      dados[0]
    );

  const linhasPorChave =
    new Map();

  dados
    .slice(1)
    .forEach(linha => {
      const chave =
        limparTexto_(
          linha[
            mapa["Chave"]
          ]
        );

      if (chave) {
        linhasPorChave.set(
          chave,
          linha
        );
      }
    });

  const regras = {};
  let ultimaAtualizacao = null;
  let atualizadoPor = "";

  DEFINICOES_REGRAS_FEEDBACK
    .forEach(definicao => {
      const linha =
        linhasPorChave.get(
          definicao.chave
        );

      const valorBruto =
        linha
          ? linha[
              mapa["Valor"]
            ]
          : definicao.valorPadrao;

      regras[
        definicao.campo
      ] =
        interpretarValorRegra_(
          definicao,
          valorBruto
        );

      if (linha) {
        const dataAtualizacao =
          normalizarDataHora_(
            linha[
              mapa["Atualizado em"]
            ]
          );

        if (
          dataAtualizacao &&
          (
            !ultimaAtualizacao ||
            dataAtualizacao > ultimaAtualizacao
          )
        ) {
          ultimaAtualizacao =
            dataAtualizacao;

          atualizadoPor =
            limparTexto_(
              linha[
                mapa["Atualizado por"]
              ]
            );
        }
      }
    });

  const resultado = {
    regras,
    atualizadoEm:
      formatarDataHoraParaCliente_(
        ultimaAtualizacao
      ),
    atualizadoPor
  };

  cache.put(
    CACHE_REGRAS_FEEDBACK,
    JSON.stringify(
      resultado
    ),
    300
  );

  return resultado;
}

function obterRegrasPadrao_() {
  return DEFINICOES_REGRAS_FEEDBACK
    .reduce((resultado, definicao) => {
      resultado[
        definicao.campo
      ] =
        definicao.valorPadrao;

      return resultado;
    }, {});
}

function validarRegrasFeedback_(dados) {
  if (!dados) {
    throw new Error(
      "As configurações não foram informadas."
    );
  }

  const resultado = {};

  DEFINICOES_REGRAS_FEEDBACK
    .forEach(definicao => {
      const valor =
        dados[
          definicao.campo
        ];

      if (definicao.tipo === "NUMERO") {
        const numero =
          Number(valor);

        if (
          !Number.isFinite(numero) ||
          !Number.isInteger(numero) ||
          numero < definicao.minimo ||
          numero > definicao.maximo
        ) {
          throw new Error(
            `${definicao.nome}: informe um número inteiro entre ${definicao.minimo} e ${definicao.maximo}.`
          );
        }

        resultado[
          definicao.campo
        ] = numero;

        return;
      }

      resultado[
        definicao.campo
      ] =
        interpretarBooleano_(
          valor,
          definicao.valorPadrao
        );
    });

  return resultado;
}

function interpretarValorRegra_(
  definicao,
  valor
) {
  if (definicao.tipo === "NUMERO") {
    const numero =
      Number(valor);

    if (
      Number.isFinite(numero) &&
      Number.isInteger(numero) &&
      numero >= definicao.minimo &&
      numero <= definicao.maximo
    ) {
      return numero;
    }

    return definicao.valorPadrao;
  }

  return interpretarBooleano_(
    valor,
    definicao.valorPadrao
  );
}

function interpretarBooleano_(
  valor,
  padrao
) {
  if (typeof valor === "boolean") {
    return valor;
  }

  const texto =
    normalizarChave_(
      valor
    );

  if (
    [
      "sim",
      "true",
      "1",
      "ativo",
      "ativado"
    ].includes(texto)
  ) {
    return true;
  }

  if (
    [
      "nao",
      "false",
      "0",
      "inativo",
      "desativado"
    ].includes(texto)
  ) {
    return false;
  }

  return Boolean(
    padrao
  );
}

function serializarValorRegra_(
  definicao,
  valor
) {
  if (definicao.tipo === "NUMERO") {
    return Number(valor);
  }

  return valor
    ? "SIM"
    : "NÃO";
}

function localizarLinhaRegra_(
  aba,
  chave
) {
  const ultimaLinha =
    aba.getLastRow();

  if (ultimaLinha <= 1) {
    return 0;
  }

  const chaves =
    aba
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        1
      )
      .getDisplayValues()
      .flat();

  const indice =
    chaves.findIndex(valor =>
      limparTexto_(valor) ===
      chave
    );

  return indice === -1
    ? 0
    : indice + 2;
}

function prepararAbaFeedback() {
  const ss = getSS();

  let aba =
    ss.getSheetByName(
      ABA_FEEDBACK
    );

  if (!aba) {
    aba = ss.insertSheet(
      ABA_FEEDBACK
    );
  }

  if (aba.getLastRow() === 0) {
    aba
      .getRange(
        1,
        1,
        1,
        COLUNAS_FEEDBACK.length
      )
      .setValues([
        COLUNAS_FEEDBACK
      ]);
  } else {
    const ultimaColuna =
      Math.max(
        aba.getLastColumn(),
        1
      );

    const cabecalhosAtuais =
      aba
        .getRange(
          1,
          1,
          1,
          ultimaColuna
        )
        .getDisplayValues()[0]
        .map(String);

    const faltantes =
      COLUNAS_FEEDBACK.filter(
        coluna =>
          !cabecalhosAtuais.includes(
            coluna
          )
      );

    if (faltantes.length) {
      aba
        .getRange(
          1,
          ultimaColuna + 1,
          1,
          faltantes.length
        )
        .setValues([
          faltantes
        ]);
    }
  }

  formatarAbaFeedback_(
    aba
  );

  return aba;
}

function formatarAbaFeedback_(aba) {
  const ultimaColuna =
    aba.getLastColumn();

  if (!ultimaColuna) return;

  aba.setFrozenRows(1);

  aba
    .getRange(
      1,
      1,
      1,
      ultimaColuna
    )
    .setBackground("#173d6b")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  aba.setRowHeight(
    1,
    34
  );

  const mapa =
    mapaCabecalhos_(
      aba
        .getRange(
          1,
          1,
          1,
          ultimaColuna
        )
        .getDisplayValues()[0]
    );

  ajustarLarguraColuna_(
    aba,
    mapa,
    "ID",
    180
  );

  ajustarLarguraColuna_(
    aba,
    mapa,
    "Pedido",
    120
  );

  ajustarLarguraColuna_(
    aba,
    mapa,
    "Data Evento",
    110
  );

  ajustarLarguraColuna_(
    aba,
    mapa,
    "Cliente",
    220
  );

  ajustarLarguraColuna_(
    aba,
    mapa,
    "Local",
    220
  );

  [
    "Descrição do Elogio",
    "Descrição da Melhoria",
    "Observações"
  ].forEach(coluna =>
    ajustarLarguraColuna_(
      aba,
      mapa,
      coluna,
      280
    )
  );
}

function ajustarLarguraColuna_(
  aba,
  mapa,
  coluna,
  largura
) {
  const indice =
    mapa[coluna];

  if (indice === undefined) return;

  aba.setColumnWidth(
    indice + 1,
    largura
  );
}

function listarFeedbacks() {
  const aba =
    prepararAbaFeedback();

  const registros =
    lerFeedbacksInterno_(
      aba
    );

  return registros
    .sort((a, b) =>
      dataParaOrdenacao_(
        b.dataHoraAtualizacao ||
        b.dataHoraRegistro ||
        b.dataContato
      ) -
      dataParaOrdenacao_(
        a.dataHoraAtualizacao ||
        a.dataHoraRegistro ||
        a.dataContato
      )
    )
    .map(registro => ({
      id:
        registro.id,

      pedido:
        registro.pedido,

      dataEvento:
        formatarData(
          registro.dataEvento
        ),

      cliente:
        registro.cliente,

      local:
        registro.local,

      resultado:
        registro.resultado,

      satisfacao:
        registro.satisfacao,

      elogio:
        registro.elogio,

      setorElogio:
        registro.setorElogio,

      textoElogio:
        registro.textoElogio,

      reclamacao:
        registro.reclamacao,

      setorMelhoria:
        registro.setorMelhoria,

      textoMelhoria:
        registro.textoMelhoria,

      resumo:
        registro.resumo,

      responsavel:
        registro.responsavel,

      dataContato:
        formatarData(
          registro.dataContato
        ),

      horaContato:
        formatarHoraParaCliente_(
          registro.horaContato
        ),

      /*
        google.script.run não serializa objetos Date.
        Por isso, todas as datas enviadas ao HTML precisam sair como texto.
      */
      dataHoraRegistro:
        formatarDataHoraParaCliente_(
          registro.dataHoraRegistro
        ),

      dataHoraAtualizacao:
        formatarDataHoraParaCliente_(
          registro.dataHoraAtualizacao
        )
    }));
}

function lerFeedbacksInterno_(aba) {
  const ultimaLinha =
    aba.getLastRow();

  const ultimaColuna =
    aba.getLastColumn();

  if (
    ultimaLinha <= 1 ||
    ultimaColuna === 0
  ) {
    return [];
  }

  const dados =
    aba
      .getRange(
        1,
        1,
        ultimaLinha,
        ultimaColuna
      )
      .getValues();

  const mapa =
    mapaCabecalhos_(
      dados[0]
    );

  return dados
    .slice(1)
    .map(linha => {
      const elogio =
        valorPorCabecalho_(
          linha,
          mapa,
          [
            "Houve Elogio"
          ]
        );

      const reclamacao =
        valorPorCabecalho_(
          linha,
          mapa,
          [
            "Houve Ponto de Melhoria",
            "Houve Reclamação"
          ]
        );

      const setorAntigo =
        valorPorCabecalho_(
          linha,
          mapa,
          [
            "Setor Relacionado"
          ]
        );

      return {
        id:
          valorPorCabecalho_(
            linha,
            mapa,
            ["ID"]
          ),

        pedido:
          normalizarPedido_(
            valorPorCabecalho_(
              linha,
              mapa,
              ["Pedido"]
            )
          ),

        dataEvento:
          valorPorCabecalho_(
            linha,
            mapa,
            ["Data Evento"]
          ),

        cliente:
          valorPorCabecalho_(
            linha,
            mapa,
            ["Cliente"]
          ),

        local:
          valorPorCabecalho_(
            linha,
            mapa,
            ["Local"]
          ),

        resultado:
          valorPorCabecalho_(
            linha,
            mapa,
            ["Resultado do Contato"]
          ),

        satisfacao:
          valorPorCabecalho_(
            linha,
            mapa,
            ["Satisfação Geral"]
          ),

        elogio,

        setorElogio:
          valorPorCabecalho_(
            linha,
            mapa,
            ["Setor Elogio"]
          ) ||
          (
            String(elogio) === "Sim"
              ? setorAntigo
              : ""
          ),

        textoElogio:
          valorPorCabecalho_(
            linha,
            mapa,
            ["Descrição do Elogio"]
          ),

        reclamacao,

        setorMelhoria:
          valorPorCabecalho_(
            linha,
            mapa,
            ["Setor Melhoria"]
          ) ||
          (
            String(reclamacao) === "Sim"
              ? setorAntigo
              : ""
          ),

        textoMelhoria:
          valorPorCabecalho_(
            linha,
            mapa,
            ["Descrição da Melhoria"]
          ),

        resumo:
          valorPorCabecalho_(
            linha,
            mapa,
            [
              "Observações",
              "Resumo da Conversa"
            ]
          ),

        responsavel:
          valorPorCabecalho_(
            linha,
            mapa,
            ["Responsável"]
          ),

        dataContato:
          valorPorCabecalho_(
            linha,
            mapa,
            ["Data do Contato"]
          ),

        horaContato:
          valorPorCabecalho_(
            linha,
            mapa,
            ["Hora do Contato"]
          ),

        dataHoraRegistro:
          valorPorCabecalho_(
            linha,
            mapa,
            ["DataHoraRegistro"]
          ),

        dataHoraAtualizacao:
          valorPorCabecalho_(
            linha,
            mapa,
            ["DataHoraAtualizacao"]
          )
      };
    })
    .filter(registro =>
      registro.id ||
      registro.pedido
    );
}

function listarPendentesAutomaticos() {
  const configuracao =
    lerRegrasFeedback_(
      false
    );

  const regras =
    configuracao.regras;

  const abaFeedback =
    prepararAbaFeedback();

  const feedbacks =
    lerFeedbacksInterno_(
      abaFeedback
    );

  const ssMatriz =
    SpreadsheetApp.openById(
      MATRIZ_ID
    );

  const abaMatriz =
    ssMatriz.getSheetByName(
      ABA_MATRIZ
    );

  if (!abaMatriz) {
    throw new Error(
      `A aba "${ABA_MATRIZ}" não foi encontrada na planilha Matriz.`
    );
  }

  const dadosMatriz =
    abaMatriz
      .getDataRange()
      .getValues();

  if (dadosMatriz.length <= 1) {
    return [];
  }

  const cabecalhos =
    dadosMatriz[0];

  const indices = {
    id:
      localizarIndiceCabecalho_(
        cabecalhos,
        [
          "ID",
          "Id"
        ],
        0
      ),

    dataEvento:
      localizarIndiceCabecalho_(
        cabecalhos,
        [
          "Data Evento",
          "Data do Evento",
          "Data"
        ],
        1
      ),

    pedido:
      localizarIndiceCabecalho_(
        cabecalhos,
        [
          "Pedido",
          "Número do Pedido",
          "Numero do Pedido",
          "Nº Pedido"
        ],
        2
      ),

    cliente:
      localizarIndiceCabecalho_(
        cabecalhos,
        [
          "Cliente",
          "Cliente / Parceiro",
          "Parceiro"
        ],
        3
      ),

    local:
      localizarIndiceCabecalho_(
        cabecalhos,
        [
          "Local",
          "Local do Evento",
          "Evento"
        ],
        4
      )
  };

  const hoje =
    inicioDoDia_(
      new Date()
    );

  const pedidosPorNumero =
    new Map();

  dadosMatriz
    .slice(1)
    .forEach(linha => {
      const pedido =
        normalizarPedido_(
          linha[indices.pedido]
        );

      if (!pedido) return;

const dataEvento =
  normalizarData_(
    linha[indices.dataEvento]
  );

/*
  Ignora pedidos sem data e eventos anteriores a 20/07/2026.
  O dia 20/07/2026 também será considerado.
*/
if (
  !dataEvento ||
  inicioDoDia_(dataEvento) <
    inicioDoDia_(DATA_INICIO_FEEDBACK)
) {
  return;
}

      if (
        regras.apenasEventosRealizados &&
        dataEvento &&
        inicioDoDia_(dataEvento) > hoje
      ) {
        return;
      }

      const registro = {
        id:
          limparTexto_(
            linha[indices.id]
          ),

        pedido,

        cliente:
          limparTexto_(
            linha[indices.cliente]
          ),

        local:
          limparTexto_(
            linha[indices.local]
          ),

        dataEvento
      };

      const chavePedido =
        normalizarChave_(
          pedido
        );

      const atual =
        pedidosPorNumero.get(
          chavePedido
        );

      if (
        !atual ||
        dataParaOrdenacao_(
          registro.dataEvento
        ) >
        dataParaOrdenacao_(
          atual.dataEvento
        )
      ) {
        pedidosPorNumero.set(
          chavePedido,
          registro
        );
      }
    });

  const pedidos =
    Array.from(
      pedidosPorNumero.values()
    );

  const quantidadePedidosPorCliente =
    new Map();

  pedidos.forEach(item => {
    const chaveCliente =
      normalizarChave_(
        item.cliente ||
        `pedido-${item.pedido}`
      );

    quantidadePedidosPorCliente.set(
      chaveCliente,
      (
        quantidadePedidosPorCliente.get(
          chaveCliente
        ) || 0
      ) + 1
    );
  });

  const feedbackPorPedido =
    new Map();

  const ultimaLigacaoPorCliente =
    new Map();

  feedbacks.forEach(item => {
    const chavePedido =
      normalizarChave_(
        item.pedido
      );

    const dataContato =
      obterDataContato_(
        item
      );

    if (chavePedido) {
      const existente =
        feedbackPorPedido.get(
          chavePedido
        );

      if (
        !existente ||
        dataParaOrdenacao_(
          dataContato
        ) >
        dataParaOrdenacao_(
          obterDataContato_(existente)
        )
      ) {
        feedbackPorPedido.set(
          chavePedido,
          item
        );
      }
    }

    const chaveCliente =
      normalizarChave_(
        item.cliente
      );

    if (
      chaveCliente &&
      dataContato
    ) {
      const anterior =
        ultimaLigacaoPorCliente.get(
          chaveCliente
        );

      if (
        !anterior ||
        dataContato > anterior
      ) {
        ultimaLigacaoPorCliente.set(
          chaveCliente,
          dataContato
        );
      }
    }
  });

  pedidos.sort((a, b) =>
    dataParaOrdenacao_(
      b.dataEvento
    ) -
    dataParaOrdenacao_(
      a.dataEvento
    )
  );

  const clienteJaNaFila =
    new Set();

  const resultado =
    pedidos.map(item => {
      const chavePedido =
        normalizarChave_(
          item.pedido
        );

      const chaveCliente =
        normalizarChave_(
          item.cliente ||
          `pedido-${item.pedido}`
        );

      const feedbackDoPedido =
        feedbackPorPedido.get(
          chavePedido
        );

      const quantidadePedidos =
        quantidadePedidosPorCliente.get(
          chaveCliente
        ) || 0;

      const recorrente =
        quantidadePedidos >=
        regras.pedidosParaRecorrente;

      const tipoCliente =
        recorrente
          ? "Cliente recorrente"
          : "Cliente novo";

      if (
        feedbackDoPedido &&
        regras.pedidoComFeedbackNaoLiga
      ) {
        return {
          ...item,
          dataEvento:
            formatarData(
              item.dataEvento
            ),
          precisaLigacao:false,
          statusLigacao:"Não precisa ligação",
          motivoLigacao:
            "Feedback registrado em " +
            (
              formatarData(
                obterDataContato_(
                  feedbackDoPedido
                )
              ) ||
              "data não informada"
            )
        };
      }

      const ultimaLigacao =
        ultimaLigacaoPorCliente.get(
          chaveCliente
        );

      const limiteDias =
        recorrente
          ? regras.diasClienteRecorrente
          : regras.diasClienteNovo;

      const diasDesdeUltima =
        ultimaLigacao
          ? diasEntre_(
              ultimaLigacao,
              hoje
            )
          : null;

      const contatoVencido =
        !ultimaLigacao ||
        diasDesdeUltima >= limiteDias;

      if (contatoVencido) {
        if (
          regras.umPendentePorCliente &&
          clienteJaNaFila.has(
            chaveCliente
          )
        ) {
          return {
            ...item,
            dataEvento:
              formatarData(
                item.dataEvento
              ),
            precisaLigacao:false,
            statusLigacao:"Não precisa ligação",
            motivoLigacao:
              "Outro pedido deste cliente já está aguardando ligação"
          };
        }

        if (
          regras.umPendentePorCliente
        ) {
          clienteJaNaFila.add(
            chaveCliente
          );
        }

        return {
          ...item,
          dataEvento:
            formatarData(
              item.dataEvento
            ),
          precisaLigacao:true,
          statusLigacao:"Precisa ligação",
          motivoLigacao:
            ultimaLigacao
              ? `${tipoCliente} — última ligação há ${diasDesdeUltima} dias`
              : `${tipoCliente} — primeiro contato pendente`
        };
      }

      const diasRestantes =
        Math.max(
          limiteDias - diasDesdeUltima,
          0
        );

      return {
        ...item,
        dataEvento:
          formatarData(
            item.dataEvento
          ),
        precisaLigacao:false,
        statusLigacao:"Não precisa ligação",
        motivoLigacao:
          `${tipoCliente} — última ligação há ${diasDesdeUltima} dias; próximo contato em ${diasRestantes} dias`
      };
    });

  return resultado.sort((a, b) => {
    if (
      a.precisaLigacao !==
      b.precisaLigacao
    ) {
      return a.precisaLigacao
        ? -1
        : 1;
    }

    return dataParaOrdenacao_(
      normalizarData_(b.dataEvento)
    ) -
    dataParaOrdenacao_(
      normalizarData_(a.dataEvento)
    );
  });
}

function salvarFeedback(dados) {
  const lock =
    LockService.getScriptLock();

  lock.waitLock(
    30000
  );

  try {
    validarDadosFeedback_(
      dados
    );

    const aba =
      prepararAbaFeedback();

    const agora =
      new Date();

    const ultimaColuna =
      aba.getLastColumn();

    const cabecalhos =
      aba
        .getRange(
          1,
          1,
          1,
          ultimaColuna
        )
        .getDisplayValues()[0];

    const mapa =
      mapaCabecalhos_(
        cabecalhos
      );

    const linhaExistente =
      localizarLinhaFeedback_(
        aba,
        mapa,
        dados.id,
        dados.pedido
      );

    const id =
      limparTexto_(
        dados.id
      ) ||
      (
        linhaExistente
          ? limparTexto_(
              aba.getRange(
                linhaExistente,
                mapa["ID"] + 1
              ).getValue()
            )
          : ""
      ) ||
      Utilities.getUuid();

    const responsavel =
      limparTexto_(
        dados.responsavel
      ) ||
      obterResponsavelAtual_();

    const elogio =
      limparTexto_(
        dados.elogio
      );

    const reclamacao =
      limparTexto_(
        dados.reclamacao
      );

    const registro = {
      "ID":
        id,

      "Pedido":
        normalizarPedido_(
          dados.pedido
        ),

      "Data Evento":
        normalizarData_(
          dados.dataEvento
        ) ||
        limparTexto_(
          dados.dataEvento
        ),

      "Cliente":
        limparTexto_(
          dados.cliente
        ),

      "Local":
        limparTexto_(
          dados.local
        ),

      "Resultado do Contato":
        limparTexto_(
          dados.resultado
        ) ||
        "Conversa realizada",

      "Satisfação Geral":
        limparTexto_(
          dados.satisfacao
        ),

      "Houve Elogio":
        elogio,

      "Setor Elogio":
        elogio === "Sim"
          ? limparTexto_(
              dados.setorElogio
            )
          : "",

      "Descrição do Elogio":
        elogio === "Sim"
          ? limparTexto_(
              dados.textoElogio
            )
          : "",

      "Houve Ponto de Melhoria":
        reclamacao,

      "Setor Melhoria":
        reclamacao === "Sim"
          ? limparTexto_(
              dados.setorMelhoria
            )
          : "",

      "Descrição da Melhoria":
        reclamacao === "Sim"
          ? limparTexto_(
              dados.textoMelhoria
            )
          : "",

      "Observações":
        limparTexto_(
          dados.resumo
        ),

      "Responsável":
        responsavel,

      "Data do Contato":
        inicioDoDia_(
          agora
        ),

      "Hora do Contato":
        Utilities.formatDate(
          agora,
          TIMEZONE,
          "HH:mm:ss"
        ),

      "DataHoraAtualizacao":
        agora
    };

    let linhaDestino;
    let mensagem;

    if (linhaExistente) {
      linhaDestino =
        linhaExistente;

      mensagem =
        "Feedback atualizado com sucesso.";
    } else {
      linhaDestino =
        aba.getLastRow() + 1;

      registro["DataHoraRegistro"] =
        agora;

      mensagem =
        "Feedback salvo com sucesso.";
    }

    if (
      linhaExistente &&
      mapa["DataHoraRegistro"] !== undefined
    ) {
      const registroOriginal =
        aba.getRange(
          linhaDestino,
          mapa["DataHoraRegistro"] + 1
        ).getValue();

      registro["DataHoraRegistro"] =
        registroOriginal ||
        agora;
    }

    const valoresLinha =
      linhaExistente
        ? aba
            .getRange(
              linhaDestino,
              1,
              1,
              ultimaColuna
            )
            .getValues()[0]
        : new Array(
            ultimaColuna
          ).fill("");

    Object.entries(
      registro
    ).forEach(([coluna, valor]) => {
      const indice =
        mapa[coluna];

      if (indice !== undefined) {
        valoresLinha[indice] =
          valor;
      }
    });

    aba
      .getRange(
        linhaDestino,
        1,
        1,
        ultimaColuna
      )
      .setValues([
        valoresLinha
      ]);

    aplicarFormatosLinha_(
      aba,
      mapa,
      linhaDestino
    );

    SpreadsheetApp.flush();

    return {
      sucesso:true,
      mensagem,
      id,
      linha:linhaDestino
    };

  } catch (erro) {
    console.error(
      erro
    );

    throw new Error(
      erro && erro.message
        ? erro.message
        : "Não foi possível salvar o feedback."
    );

  } finally {
    lock.releaseLock();
  }
}

function validarDadosFeedback_(dados) {
  if (!dados) {
    throw new Error(
      "Os dados do feedback não foram recebidos."
    );
  }

  const pedido =
    limparTexto_(
      dados.pedido
    );

  const cliente =
    limparTexto_(
      dados.cliente
    );

  const satisfacao =
    limparTexto_(
      dados.satisfacao
    );

  const elogio =
    limparTexto_(
      dados.elogio
    );

  const reclamacao =
    limparTexto_(
      dados.reclamacao
    );

  if (!pedido) {
    throw new Error(
      "O número do pedido não foi identificado."
    );
  }

  if (!cliente) {
    throw new Error(
      "O cliente não foi identificado."
    );
  }

  if (
    ![
      "Excelente",
      "Boa",
      "Regular",
      "Ruim"
    ].includes(
      satisfacao
    )
  ) {
    throw new Error(
      "Selecione a satisfação geral do cliente."
    );
  }

  if (
    ![
      "Sim",
      "Não"
    ].includes(
      elogio
    )
  ) {
    throw new Error(
      "Informe se houve elogio."
    );
  }

  if (
    elogio === "Sim" &&
    !limparTexto_(
      dados.setorElogio
    )
  ) {
    throw new Error(
      "Selecione o setor relacionado ao elogio."
    );
  }

  if (
    ![
      "Sim",
      "Não"
    ].includes(
      reclamacao
    )
  ) {
    throw new Error(
      "Informe se houve ponto de melhoria."
    );
  }

  if (
    reclamacao === "Sim" &&
    !limparTexto_(
      dados.setorMelhoria
    )
  ) {
    throw new Error(
      "Selecione o setor relacionado ao ponto de melhoria."
    );
  }
}

function localizarLinhaFeedback_(
  aba,
  mapa,
  id,
  pedido
) {
  const ultimaLinha =
    aba.getLastRow();

  if (ultimaLinha <= 1) {
    return 0;
  }

  const idNormalizado =
    normalizarChave_(
      id
    );

  const pedidoNormalizado =
    normalizarChave_(
      pedido
    );

  if (
    idNormalizado &&
    mapa["ID"] !== undefined
  ) {
    const ids =
      aba
        .getRange(
          2,
          mapa["ID"] + 1,
          ultimaLinha - 1,
          1
        )
        .getDisplayValues()
        .flat();

    const indice =
      ids.findIndex(valor =>
        normalizarChave_(valor) ===
        idNormalizado
      );

    if (indice !== -1) {
      return indice + 2;
    }
  }

  if (
    pedidoNormalizado &&
    mapa["Pedido"] !== undefined
  ) {
    const pedidos =
      aba
        .getRange(
          2,
          mapa["Pedido"] + 1,
          ultimaLinha - 1,
          1
        )
        .getValues()
        .flat();

    const indice =
      pedidos.findIndex(valor =>
        normalizarChave_(
          normalizarPedido_(valor)
        ) ===
        pedidoNormalizado
      );

    if (indice !== -1) {
      return indice + 2;
    }
  }

  return 0;
}

function aplicarFormatosLinha_(
  aba,
  mapa,
  linha
) {
  const formatos = {
    "Data Evento":"dd/MM/yyyy",
    "Data do Contato":"dd/MM/yyyy",
    "DataHoraRegistro":"dd/MM/yyyy HH:mm:ss",
    "DataHoraAtualizacao":"dd/MM/yyyy HH:mm:ss"
  };

  Object.entries(
    formatos
  ).forEach(([coluna, formato]) => {
    const indice =
      mapa[coluna];

    if (indice !== undefined) {
      aba
        .getRange(
          linha,
          indice + 1
        )
        .setNumberFormat(
          formato
        );
    }
  });

  aba
    .getRange(
      linha,
      1,
      1,
      aba.getLastColumn()
    )
    .setVerticalAlignment(
      "middle"
    );
}

function mapaCabecalhos_(cabecalhos) {
  const mapa = {};

  cabecalhos.forEach((cabecalho, indice) => {
    const nome =
      String(
        cabecalho || ""
      ).trim();

    if (nome) {
      mapa[nome] =
        indice;
    }
  });

  return mapa;
}

function valorPorCabecalho_(
  linha,
  mapa,
  nomes
) {
  for (const nome of nomes) {
    const indice =
      mapa[nome];

    if (indice !== undefined) {
      const valor =
        linha[indice];

      if (
        valor !== "" &&
        valor !== null &&
        valor !== undefined
      ) {
        return valor;
      }
    }
  }

  return "";
}

function localizarIndiceCabecalho_(
  cabecalhos,
  nomes,
  fallback
) {
  const normalizados =
    cabecalhos.map(
      normalizarChave_
    );

  for (const nome of nomes) {
    const indice =
      normalizados.indexOf(
        normalizarChave_(
          nome
        )
      );

    if (indice !== -1) {
      return indice;
    }
  }

  return fallback;
}

function obterResponsavelAtual_() {
  const emailAtivo =
    Session
      .getActiveUser()
      .getEmail();

  if (emailAtivo) {
    return emailAtivo;
  }

  const emailEfetivo =
    Session
      .getEffectiveUser()
      .getEmail();

  return emailEfetivo ||
    "Não identificado";
}

function obterDataContato_(registro) {
  return normalizarDataHora_(
    registro.dataHoraAtualizacao
  ) ||
  normalizarDataHora_(
    registro.dataHoraRegistro
  ) ||
  combinarDataHora_(
    registro.dataContato,
    registro.horaContato
  ) ||
  normalizarData_(
    registro.dataContato
  );
}

function combinarDataHora_(
  data,
  hora
) {
  const dataNormalizada =
    normalizarData_(
      data
    );

  if (!dataNormalizada) {
    return null;
  }

  const textoHora =
    limparTexto_(
      hora
    );

  if (!textoHora) {
    return dataNormalizada;
  }

  const partes =
    textoHora
      .split(":")
      .map(Number);

  const resultado =
    new Date(
      dataNormalizada
    );

  resultado.setHours(
    partes[0] || 0,
    partes[1] || 0,
    partes[2] || 0,
    0
  );

  return resultado;
}

function normalizarDataHora_(valor) {
  if (!valor) return null;

  if (
    Object.prototype.toString.call(valor) ===
    "[object Date]" &&
    !isNaN(valor.getTime())
  ) {
    return new Date(
      valor
    );
  }

  const data =
    new Date(
      valor
    );

  return isNaN(
    data.getTime()
  )
    ? null
    : data;
}

function normalizarData_(valor) {
  if (!valor) return null;

  if (
    Object.prototype.toString.call(valor) ===
    "[object Date]" &&
    !isNaN(valor.getTime())
  ) {
    return new Date(
      valor.getFullYear(),
      valor.getMonth(),
      valor.getDate()
    );
  }

  const texto =
    String(valor).trim();

  let correspondencia =
    texto.match(
      /^(\d{2})\/(\d{2})\/(\d{4})$/
    );

  if (correspondencia) {
    return new Date(
      Number(correspondencia[3]),
      Number(correspondencia[2]) - 1,
      Number(correspondencia[1])
    );
  }

  correspondencia =
    texto.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (correspondencia) {
    return new Date(
      Number(correspondencia[1]),
      Number(correspondencia[2]) - 1,
      Number(correspondencia[3])
    );
  }

  const tentativa =
    new Date(
      texto
    );

  if (
    !isNaN(
      tentativa.getTime()
    )
  ) {
    return new Date(
      tentativa.getFullYear(),
      tentativa.getMonth(),
      tentativa.getDate()
    );
  }

  return null;
}

function inicioDoDia_(data) {
  return new Date(
    data.getFullYear(),
    data.getMonth(),
    data.getDate()
  );
}

function diasEntre_(inicio, fim) {
  const umDia =
    24 * 60 * 60 * 1000;

  const inicioDia =
    inicioDoDia_(
      inicio
    );

  const fimDia =
    inicioDoDia_(
      fim
    );

  return Math.max(
    Math.floor(
      (
        fimDia.getTime() -
        inicioDia.getTime()
      ) /
      umDia
    ),
    0
  );
}

function dataParaOrdenacao_(valor) {
  const data =
    normalizarDataHora_(valor) ||
    normalizarData_(valor);

  return data
    ? data.getTime()
    : 0;
}

function normalizarPedido_(valor) {
  if (!valor) return "";

  if (
    Object.prototype.toString.call(valor) ===
    "[object Date]" &&
    !isNaN(valor.getTime())
  ) {
    /*
      Alguns números de pedido foram interpretados pelo Google Sheets
      como anos de uma data, por exemplo 1179 virou 01/01/1179.
    */
    return String(
      valor.getFullYear()
    );
  }

  const texto =
    limparTexto_(valor);

  const dataTexto =
    texto.match(
      /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun).*?\b(\d{3,4})\b/i
    );

  if (dataTexto) {
    return dataTexto[1];
  }

  return texto
    .replace(/^pedido\s*/i, "")
    .trim();
}

function limparTexto_(valor) {
  return String(
    valor === null ||
    valor === undefined
      ? ""
      : valor
  ).trim();
}

function normalizarChave_(valor) {
  return limparTexto_(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}


function formatarDataHoraParaCliente_(valor) {
  if (!valor) return "";

  if (
    Object.prototype.toString.call(valor) ===
    "[object Date]" &&
    !isNaN(valor.getTime())
  ) {
    return Utilities.formatDate(
      valor,
      TIMEZONE,
      "dd/MM/yyyy HH:mm:ss"
    );
  }

  const data =
    normalizarDataHora_(
      valor
    );

  if (data) {
    return Utilities.formatDate(
      data,
      TIMEZONE,
      "dd/MM/yyyy HH:mm:ss"
    );
  }

  return limparTexto_(
    valor
  );
}

function formatarHoraParaCliente_(valor) {
  if (!valor) return "";

  if (
    Object.prototype.toString.call(valor) ===
    "[object Date]" &&
    !isNaN(valor.getTime())
  ) {
    return Utilities.formatDate(
      valor,
      TIMEZONE,
      "HH:mm:ss"
    );
  }

  const texto =
    limparTexto_(
      valor
    );

  const correspondencia =
    texto.match(
      /^(\d{1,2}):(\d{2})(?::(\d{2}))?/
    );

  if (correspondencia) {
    return [
      String(correspondencia[1]).padStart(2, "0"),
      correspondencia[2],
      correspondencia[3] || "00"
    ].join(":");
  }

  return texto;
}

function formatarData(valor) {
  const data =
    normalizarData_(
      valor
    );

  if (!data) {
    return limparTexto_(
      valor
    );
  }

  return Utilities.formatDate(
    data,
    TIMEZONE,
    "dd/MM/yyyy"
  );
}
function autenticarEListarPendentes(
  senhaInformada
) {
  const senhaDigitada =
    limparTexto_(
      senhaInformada
    );

  if (!senhaDigitada) {
    return {
      sucesso:false,
      mensagem:
        "Digite a senha para continuar."
    };
  }

  const ssSenhas =
    SpreadsheetApp.openById(
      PLANILHA_SENHAS_ID
    );

  const abaSenhas =
    ssSenhas.getSheetByName(
      ABA_SENHAS
    );

  if (!abaSenhas) {
    throw new Error(
      `A aba "${ABA_SENHAS}" não foi encontrada na planilha de senhas.`
    );
  }

  const ultimaLinha =
    abaSenhas.getLastRow();

  if (ultimaLinha <= 1) {
    throw new Error(
      "Nenhuma senha foi cadastrada na aba Senhas."
    );
  }

  /*
    Lê somente as colunas:

    A = SETOR
    B = SENHA

    getDisplayValues mantém a senha como texto.
  */
  const dados =
    abaSenhas
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        2
      )
      .getDisplayValues();

  const registroComercial =
    dados.find(linha =>
      normalizarChave_(
        linha[0]
      ) ===
      normalizarChave_(
        SETOR_SENHA_LIGACOES
      )
    );

  if (!registroComercial) {
    throw new Error(
      'O setor "Comercial" não foi encontrado na aba Senhas.'
    );
  }

  const senhaCorreta =
    limparTexto_(
      registroComercial[1]
    );

  if (!senhaCorreta) {
    throw new Error(
      'A senha do setor "Comercial" está vazia.'
    );
  }

  if (
    senhaDigitada !==
    senhaCorreta
  ) {
    return {
      sucesso:false,
      mensagem:
        "Senha incorreta. Verifique e tente novamente."
    };
  }

  /*
    A lista somente é processada e devolvida
    depois que a senha estiver correta.

    O parâmetro false pode ser usado mesmo se sua
    função ainda não receber parâmetros.
  */
  const lista =
    listarPendentesAutomaticos(
      false
    );

  const totalPendentes =
    lista.filter(item =>
      item.precisaLigacao
    ).length;

  return {
    sucesso:true,
    mensagem:
      "Acesso autorizado.",
    lista,
    totalPendentes
  };
}