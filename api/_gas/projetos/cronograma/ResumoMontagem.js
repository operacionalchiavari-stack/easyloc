/****************************************************
 * RESUMO DA MONTAGEM PARA O CRONOGRAMA
 *
 * Retorna um objeto organizado pelo ID da etapa:
 *
 * {
 *   "ID_DA_ETAPA": {
 *     equipeTerceirizada: {...},
 *     sacolas: [...],
 *     posicionamento: {...},
 *     observacoesGerais: {...},
 *     listaAssinada: {...}
 *   }
 * }
 ****************************************************/

const MON_SPREADSHEET_ID =
  "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ";

/*
 * Confira somente o nome da primeira aba.
 *
 * Caso sua aba realmente tenha espaço, use:
 * "Equipe Terceirizada"
 *
 * Caso esteja sem espaço, mantenha:
 * "EquipeTerceirizada"
 */
const MON_ABAS = {

  equipe:
    "EquipeTerceirizada",

  sacolas:
    "Montagem_Sacolas",

  posicionamento:
    "Montagem_Posicionamento",

  observacoes:
    "Montagem_Observacoes",

  listaAssinada:
    "Montagem_ListaAssinada"

};


/****************************************************
 * FUNÇÃO PRINCIPAL
 ****************************************************/
function MON_buscarMapaResumoMontagem_() {

  const planilha =
    SpreadsheetApp.openById(
      MON_SPREADSHEET_ID
    );

  const mapa = {};

  MON_lerEquipeTerceirizada_(
    planilha,
    mapa
  );

  MON_lerSacolas_(
    planilha,
    mapa
  );

  MON_lerPosicionamento_(
    planilha,
    mapa
  );

  MON_lerObservacoes_(
    planilha,
    mapa
  );

  MON_lerListaAssinada_(
    planilha,
    mapa
  );

  /*
   * Calcula quantos dos cinco registros
   * já foram enviados.
   */
  Object.keys(mapa).forEach(function(idEtapa) {

    const registro =
      mapa[idEtapa];

    let total = 0;

    if (registro.equipeTerceirizada) {
      total++;
    }

    if (
      Array.isArray(registro.sacolas) &&
      registro.sacolas.length
    ) {
      total++;
    }

    if (registro.posicionamento) {
      total++;
    }

    if (registro.observacoesGerais) {
      total++;
    }

    if (registro.listaAssinada) {
      total++;
    }

    registro.totalRegistros =
      total;

    registro.totalEsperado =
      5;

    registro.completo =
      total === 5;
  });

  return mapa;
}


/****************************************************
 * EQUIPE TERCEIRIZADA
 *
 * A = ID
 * B = ID CRONOGRAMA
 * C = PEDIDO
 * D = EMPRESA
 * E = QUANTIDADE
 * F = OBSERVAÇÃO
 * G = LATITUDE
 * H = LONGITUDE
 * I = PRECISÃO GPS
 * J = DISTÂNCIA EVENTO
 * K = FOTO
 * L = DATA
 * M = HORA
 * N = DATA/HORA
 ****************************************************/
function MON_lerEquipeTerceirizada_(
  planilha,
  mapa
) {

  const aba =
    MON_obterAba_(
      planilha,
      MON_ABAS.equipe
    );

  if (!aba) {
    return;
  }

  const dados =
    aba
      .getDataRange()
      .getDisplayValues();

  dados.forEach(function(linha, indice) {

    if (indice === 0) {
      return;
    }

    const idEtapa =
      MON_normalizarId_(
        linha[1]
      );

    if (!idEtapa) {
      return;
    }

    MON_garantirRegistro_(
      mapa,
      idEtapa
    );

    mapa[
      idEtapa
    ].equipeTerceirizada = {

      empresa:
        linha[3] || "",

      quantidade:
        linha[4] || "",

      observacao:
        linha[5] || "",

      latitude:
        linha[6] || "",

      longitude:
        linha[7] || "",

      precisaoGps:
        linha[8] || "",

      distanciaEvento:
        linha[9] || "",

      foto:
        MON_normalizarUrl_(
          linha[10]
        ),

      data:
        linha[11] || "",

      hora:
        linha[12] || "",

dataHora:
  linha[13] || "",

uniformizada:
  String(linha[14] || "")
    .trim()
    .toUpperCase()

};
  });
}


/****************************************************
 * SACOLAS
 *
 * A = ID
 * B = ID CRONOGRAMA
 * C = PEDIDO
 * D = JSON DAS SACOLAS
 * E = LATITUDE
 * F = LONGITUDE
 * G = PRECISÃO GPS
 * H = DISTÂNCIA EVENTO
 * I = DATA
 * J = HORA
 * K = DATA/HORA
 ****************************************************/
function MON_lerSacolas_(
  planilha,
  mapa
) {

  const aba =
    MON_obterAba_(
      planilha,
      MON_ABAS.sacolas
    );

  if (!aba) {
    return;
  }

  const dados =
    aba
      .getDataRange()
      .getDisplayValues();

  dados.forEach(function(linha, indice) {

    if (indice === 0) {
      return;
    }

    const idEtapa =
      MON_normalizarId_(
        linha[1]
      );

    if (!idEtapa) {
      return;
    }

    const sacolas =
      MON_parseJsonArray_(
        linha[3]
      )
        .map(function(sacola) {

          return {

            codigo:
              sacola &&
              sacola.codigo
                ? String(
                    sacola.codigo
                  )
                : "",

            fotos:
              MON_normalizarListaFotos_(
                sacola
                  ? sacola.fotos
                  : []
              )

          };

        })
        .filter(function(sacola) {

          return (
            sacola.codigo ||
            sacola.fotos.length
          );
        });

    /*
     * Só considera o bloco como enviado quando
     * existe pelo menos uma sacola registrada.
     */
    if (!sacolas.length) {
      return;
    }

    MON_garantirRegistro_(
      mapa,
      idEtapa
    );

    mapa[
      idEtapa
    ].sacolas =
      sacolas;

    mapa[
      idEtapa
    ].dadosSacolas = {

      latitude:
        linha[4] || "",

      longitude:
        linha[5] || "",

      precisaoGps:
        linha[6] || "",

      distanciaEvento:
        linha[7] || "",

      data:
        linha[8] || "",

      hora:
        linha[9] || "",

      dataHora:
        linha[10] || ""

    };
  });
}


/****************************************************
 * POSICIONAMENTO DOS ITENS
 *
 * A = ID
 * B = ID CRONOGRAMA
 * C = PEDIDO
 * D = JSON DAS FOTOS
 * E = OBSERVAÇÃO
 * F = LATITUDE
 * G = LONGITUDE
 * H = PRECISÃO GPS
 * I = DISTÂNCIA EVENTO
 * J = DATA
 * K = HORA
 * L = DATA/HORA
 ****************************************************/
function MON_lerPosicionamento_(
  planilha,
  mapa
) {

  const aba =
    MON_obterAba_(
      planilha,
      MON_ABAS.posicionamento
    );

  if (!aba) {
    return;
  }

  const dados =
    aba
      .getDataRange()
      .getDisplayValues();

  dados.forEach(function(linha, indice) {

    if (indice === 0) {
      return;
    }

    const idEtapa =
      MON_normalizarId_(
        linha[1]
      );

    if (!idEtapa) {
      return;
    }

    const fotos =
      MON_normalizarListaFotos_(
        MON_parseJsonArray_(
          linha[3]
        )
      );

    const observacao =
      String(
        linha[4] || ""
      ).trim();

    /*
     * Mesmo sem foto, o posicionamento conta
     * como enviado se houver uma observação.
     */
    if (
      !fotos.length &&
      !observacao
    ) {
      return;
    }

    MON_garantirRegistro_(
      mapa,
      idEtapa
    );

    mapa[
      idEtapa
    ].posicionamento = {

      fotos:
        fotos,

      observacao:
        observacao,

      latitude:
        linha[5] || "",

      longitude:
        linha[6] || "",

      precisaoGps:
        linha[7] || "",

      distanciaEvento:
        linha[8] || "",

      data:
        linha[9] || "",

      hora:
        linha[10] || "",

      dataHora:
        linha[11] || ""

    };
  });
}


/****************************************************
 * OBSERVAÇÕES GERAIS
 *
 * Pelo exemplo enviado:
 *
 * A = ID CRONOGRAMA
 * B = DATA/HORA
 * C = PEDIDO
 * D = OBSERVAÇÃO
 * E = RESPONSÁVEL
 * F = CAMPO ADICIONAL, CASO EXISTA
 ****************************************************/
function MON_lerObservacoes_(
  planilha,
  mapa
) {

  const aba =
    MON_obterAba_(
      planilha,
      MON_ABAS.observacoes
    );

  if (!aba) {
    return;
  }

  const dados =
    aba
      .getDataRange()
      .getDisplayValues();

  dados.forEach(function(linha, indice) {

    if (indice === 0) {
      return;
    }

    const idEtapa =
      MON_normalizarId_(
        linha[0]
      );

    const texto =
      String(
        linha[3] || ""
      ).trim();

    if (
      !idEtapa ||
      !texto
    ) {
      return;
    }

    MON_garantirRegistro_(
      mapa,
      idEtapa
    );

    mapa[
      idEtapa
    ].observacoesGerais = {

      texto:
        texto,

      responsavel:
        linha[4] || "",

      dataHora:
        linha[1] || "",

      pedido:
        linha[2] || "",

      adicional:
        linha[5] || ""

    };
  });
}


/****************************************************
 * LISTA ASSINADA
 *
 * A = ID
 * B = ID CRONOGRAMA
 * C = PEDIDO
 * D = NOME DO RECEBEDOR
 * E = FOTO
 * F = LATITUDE
 * G = LONGITUDE
 * H = PRECISÃO GPS
 * I = DISTÂNCIA EVENTO
 * J = DATA
 * K = HORA
 * L = DATA/HORA
 ****************************************************/
function MON_lerListaAssinada_(
  planilha,
  mapa
) {

  const aba =
    MON_obterAba_(
      planilha,
      MON_ABAS.listaAssinada
    );

  if (!aba) {
    return;
  }

  const dados =
    aba
      .getDataRange()
      .getDisplayValues();

  dados.forEach(function(linha, indice) {

    if (indice === 0) {
      return;
    }

    const idEtapa =
      MON_normalizarId_(
        linha[1]
      );

    const recebedor =
      String(
        linha[3] || ""
      ).trim();

    const foto =
      MON_normalizarUrl_(
        linha[4]
      );

    if (
      !idEtapa ||
      (
        !recebedor &&
        !foto
      )
    ) {
      return;
    }

    MON_garantirRegistro_(
      mapa,
      idEtapa
    );

    mapa[
      idEtapa
    ].listaAssinada = {

      recebedor:
        recebedor,

      foto:
        foto,

      latitude:
        linha[5] || "",

      longitude:
        linha[6] || "",

      precisaoGps:
        linha[7] || "",

      distanciaEvento:
        linha[8] || "",

      data:
        linha[9] || "",

      hora:
        linha[10] || "",

      dataHora:
        linha[11] || ""

    };
  });
}


/****************************************************
 * CRIA A ESTRUTURA DO ID
 ****************************************************/
function MON_garantirRegistro_(
  mapa,
  idEtapa
) {

  if (!mapa[idEtapa]) {

    mapa[idEtapa] = {

      equipeTerceirizada:
        null,

      sacolas:
        [],

      posicionamento:
        null,

      observacoesGerais:
        null,

      listaAssinada:
        null,

      totalRegistros:
        0,

      totalEsperado:
        5,

      completo:
        false

    };
  }
}


/****************************************************
 * OBTÉM UMA ABA SEM QUEBRAR O CRONOGRAMA
 ****************************************************/
function MON_obterAba_(
  planilha,
  nomeAba
) {

  const aba =
    planilha.getSheetByName(
      nomeAba
    );

  if (!aba) {

    console.warn(
      'A aba "' +
      nomeAba +
      '" não foi encontrada.'
    );

    return null;
  }

  return aba;
}


/****************************************************
 * NORMALIZAÇÃO DO ID
 ****************************************************/
function MON_normalizarId_(
  valor
) {

  return String(
    valor || ""
  ).trim();
}


/****************************************************
 * CONVERTE JSON EM ARRAY
 ****************************************************/
function MON_parseJsonArray_(
  valor
) {

  if (
    Array.isArray(valor)
  ) {
    return valor;
  }

  const texto =
    String(
      valor || ""
    ).trim();

  if (!texto) {
    return [];
  }

  try {

    const convertido =
      JSON.parse(texto);

    return Array.isArray(
      convertido
    )
      ? convertido
      : [];

  } catch (erro) {

    console.warn(
      "Não foi possível converter o JSON:",
      texto,
      erro
    );

    return [];
  }
}


/****************************************************
 * NORMALIZA LISTA DE FOTOS
 ****************************************************/
function MON_normalizarListaFotos_(
  valor
) {

  const lista =
    Array.isArray(valor)
      ? valor
      : valor
        ? [valor]
        : [];

  return lista
    .map(function(item) {

      if (
        item &&
        typeof item === "object"
      ) {

        return MON_normalizarUrl_(
          item.url ||
          item.foto ||
          item.link ||
          ""
        );
      }

      return MON_normalizarUrl_(
        item
      );

    })
    .filter(function(url) {

      return Boolean(url);
    });
}


/****************************************************
 * NORMALIZA URL
 ****************************************************/
function MON_normalizarUrl_(
  valor
) {

  return String(
    valor || ""
  ).trim();
}
function MON_salvarUniformizacaoEquipe(
  idEtapa,
  uniformizada
){

  const planilha =
    SpreadsheetApp.openById(
      MON_SPREADSHEET_ID
    );

  const aba =
    MON_obterAba_(
      planilha,
      MON_ABAS.equipe
    );

  if(!aba){
    throw new Error(
      "Aba de equipe não encontrada."
    );
  }

  const idBuscado =
    MON_normalizarId_(
      idEtapa
    );

  const valor =
    String(
      uniformizada || ""
    )
      .trim()
      .toUpperCase();

  if(
    valor !== "SIM" &&
    valor !== "NAO" &&
    valor !== "NÃO"
  ){
    throw new Error(
      "Valor de uniformização inválido."
    );
  }

  const ultimaLinha =
    aba.getLastRow();

  if(ultimaLinha < 2){
    throw new Error(
      "Nenhum registro de equipe encontrado."
    );
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

  for(
    let i = 0;
    i < ids.length;
    i++
  ){

    if(
      MON_normalizarId_(
        ids[i][0]
      ) === idBuscado
    ){

      aba
        .getRange(
          i + 2,
          15
        )
        .setValue(
          valor === "SIM"
            ? "SIM"
            : "NAO"
        );

      return true;
    }

  }

  throw new Error(
    "Registro da equipe não encontrado para esta montagem."
  );

}
/****************************************************
 * TESTE MANUAL
 ****************************************************/
function MON_testarResumoMontagem() {

  const mapa =
    MON_buscarMapaResumoMontagem_();

  Logger.log(
    JSON.stringify(
      mapa,
      null,
      2
    )
  );
}