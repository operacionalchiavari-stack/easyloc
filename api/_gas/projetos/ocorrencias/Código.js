/************************************************************
 * CONFIGURAÇÕES GERAIS
 ************************************************************/

const PLANILHA_QUALIDADE_ID = '1i197sFXQSzZ7yVdRlQ_Z6H7K9TuaoN5rOOpPnoyjOhI';
const ABA_INDICATIVOS = 'Indicativos';

// Aba de ocorrências pelo GID informado
const ABA_OCORRENCIAS_GID = 907273559;

const PLANILHA_ALMOXARIFADO_ID = '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI';
const ABA_METAS_GASTOS = 'Metas e Gastos';

// Catálogo de itens usado nas Ocorrências Operacionais
const PLANILHA_CATALOGO_ITENS_ID =
  '133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk';

const ABA_CATALOGO_ITENS = 'Itens';

/************************************************************
 * ITENS DANIFICADOS
 ************************************************************/

const PLANILHA_ITENS_DANIFICADOS_ID =
  '1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE';

const ABA_ITENS_DANIFICADOS =
  'Itens Danificados';
/************************************************************
 * ABERTURA DOS HTMLs
 ************************************************************/

function doGet(e) {
  const page = e && e.parameter && e.parameter.page
    ? String(e.parameter.page)
    : 'PainelQualidade';

  const paginasPermitidas = [
    'PainelQualidade',
    'OcorrenciasOperacionais'
  ];

  const arquivo = paginasPermitidas.includes(page)
    ? page
    : 'PainelQualidade';

  const template = HtmlService.createTemplateFromFile(arquivo);

  // URL base do Web App para usar nos botões dos HTMLs
  template.baseUrl = ScriptApp.getService().getUrl();

  const titulo = arquivo === 'OcorrenciasOperacionais'
    ? 'Ocorrências Operacionais'
    : 'Indicadores Operacionais';

  return template
    .evaluate()
    .setTitle(titulo)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
/************************************************************
 * PAINEL DE QUALIDADE
 ************************************************************/

function buscarDadosPainelQualidade() {
  try {

    const indicadores =
      buscarIndicadoresQualidade_();

    const itensDanificados =
      buscarItensDanificadosMesAtual_();

    /*
     * Substitui somente o indicador
     * "Itens danificados".
     *
     * Os demais indicadores continuam sendo
     * calculados pela planilha de ocorrências.
     */
    aplicarItensDanificadosNosIndicadores_(
      indicadores,
      itensDanificados
    );

    const tetoGastos =
      buscarTetoGastosQualidade_();

    return {
      ok: true,

      atualizadoAs: Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'HH:mm:ss'
      ),

      indicadores: indicadores,

      itensDanificados: itensDanificados,

      tetoGastos: tetoGastos
    };

  } catch (erro) {

    console.error(
      'Erro em buscarDadosPainelQualidade:',
      erro
    );

    return {
      ok: false,
      msg: erro.message
    };
  }
}

function buscarIndicadoresQualidade_() {
  const ss = SpreadsheetApp.openById(PLANILHA_QUALIDADE_ID);

  const abaIndicativos = ss.getSheetByName(ABA_INDICATIVOS);
  if (!abaIndicativos) {
    throw new Error('Aba Indicativos não encontrada.');
  }

  const abaOcorrencias = obterAbaPorGid_(ss, ABA_OCORRENCIAS_GID);
  if (!abaOcorrencias) {
    throw new Error('Aba de ocorrências não encontrada pelo GID: ' + ABA_OCORRENCIAS_GID);
  }

  const ultimaLinhaIndicativos = abaIndicativos.getLastRow();

  if (ultimaLinhaIndicativos < 2) {
    return {
      internos: [],
      externos: []
    };
  }

  // Indicativos:
  // A = Indicativo Operações Internas
  // B = Meta
  // C = Indicativo Operações Externas
  // D = Meta
  const dadosIndicativos = abaIndicativos
    .getRange(2, 1, ultimaLinhaIndicativos - 1, 4)
    .getValues();

  const contagemAtual = contarOcorrenciasMesAtual_(abaOcorrencias);

  const internos = [];
  const externos = [];

  dadosIndicativos.forEach(function(linha) {
    const nomeInterno = String(linha[0] || '').trim();
    const metaInterno = converterNumero_(linha[1]);

    const nomeExterno = String(linha[2] || '').trim();
    const metaExterno = converterNumero_(linha[3]);

    if (nomeInterno) {
      internos.push({
        nome: nomeInterno,
        meta: metaInterno,
        valor: contagemAtual.internos[normalizarTexto_(nomeInterno)] || 0
      });
    }

    if (nomeExterno) {
      externos.push({
        nome: nomeExterno,
        meta: metaExterno,
        valor: contagemAtual.externos[normalizarTexto_(nomeExterno)] || 0
      });
    }
  });

  return {
    internos: internos,
    externos: externos
  };
}


function contarOcorrenciasMesAtual_(abaOcorrencias) {

  const ultimaLinha =
    abaOcorrencias.getLastRow();


  const resultado = {
    internos: {},
    externos: {}
  };


  if (ultimaLinha < 2) {
    return resultado;
  }


  /*
   * Estrutura atual da aba Ocorrências:
   *
   * A = ID
   * B = Data
   * C = Nº do Pedido
   * D = Departamento
   * E = Supervisor
   * F = Ocorrência
   * G = Status
   * H = Observação
   * I = Categoria
   * J = Item
   * K = Quantidade
   */

  const valores =
    abaOcorrencias
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        11
      )
      .getValues();


  const agora =
    new Date();

  const mesAtual =
    agora.getMonth();

  const anoAtual =
    agora.getFullYear();


  valores.forEach(function(linha) {

    const data =
      converterParaData_(
        linha[1]
      );

    const departamento =
      String(
        linha[3] || ''
      ).trim();

    const ocorrencia =
      String(
        linha[5] || ''
      ).trim();

    const quantidade =
      converterNumero_(
        linha[10]
      );


    if (
      !data ||
      !ocorrencia ||
      !departamento
    ) {
      return;
    }


    /*
     * Considera somente ocorrências
     * do mês atual.
     */
    if (
      data.getMonth() !== mesAtual ||
      data.getFullYear() !== anoAtual
    ) {
      return;
    }


    const chaveOcorrencia =
      normalizarTexto_(
        ocorrencia
      );


    /*
     * Estas ocorrências deixam de ser
     * contadas por linha.
     *
     * O valor passa a ser a soma da
     * coluna K = Quantidade.
     */
const ocorrenciasPorQuantidade = [
  'material sem capa',
  'itens sem capa de protecao',
  'item sem revisao',
  'itens sem revisao'
];


    const deveSomarQuantidade =
      ocorrenciasPorQuantidade
        .indexOf(
          chaveOcorrencia
        ) !== -1;


    /*
     * Para as ocorrências especiais:
     *
     * quantidade = 4
     * soma 4
     *
     * Para qualquer outra:
     * soma 1 por ocorrência.
     */
    const valorSomar =
      deveSomarQuantidade
        ? quantidade
        : 1;


    /************************************************************
     * OPERAÇÕES INTERNAS
     ************************************************************/

    if (
      normalizarTexto_(
        departamento
      ) ===
      normalizarTexto_(
        'Operações Internas'
      )
    ) {

      resultado.internos[
        chaveOcorrencia
      ] =
        (
          resultado.internos[
            chaveOcorrencia
          ] || 0
        ) +
        valorSomar;
    }


    /************************************************************
     * OPERAÇÕES EXTERNAS
     ************************************************************/

    if (
      normalizarTexto_(
        departamento
      ) ===
      normalizarTexto_(
        'Operações Externas'
      )
    ) {

      resultado.externos[
        chaveOcorrencia
      ] =
        (
          resultado.externos[
            chaveOcorrencia
          ] || 0
        ) +
        valorSomar;
    }

  });


  return resultado;
}


/************************************************************
 * TETO DE GASTOS
 ************************************************************/

function buscarTetoGastosQualidade_() {
  const ss = SpreadsheetApp.openById(PLANILHA_ALMOXARIFADO_ID);
  const aba = ss.getSheetByName(ABA_METAS_GASTOS);

  if (!aba) {
    throw new Error('Aba Metas e Gastos não encontrada.');
  }

  const valores = aba.getDataRange().getValues();

  if (valores.length < 2) {
    throw new Error('Aba Metas e Gastos sem dados suficientes.');
  }

  const cabecalho = valores[0];

  const mesAtual = obterNomeMesAtual_();
  const colunaMes = encontrarColunaMes_(cabecalho, mesAtual);

  if (colunaMes === -1) {
    throw new Error('Mês atual não encontrado no cabeçalho: ' + mesAtual);
  }

  // Pela sua planilha:
  // coluna do mês = teto
  // coluna seguinte = total gasto
  const colunaTeto = colunaMes;
  const colunaGasto = colunaMes + 1;

  const mapaSetores = montarMapaSetoresGastos_(
    valores,
    colunaTeto,
    colunaGasto
  );

  const setor01 = obterGastoSetor_(mapaSetores, 'Setor 01', 'Setor 01');
  const setor02 = obterGastoSetor_(mapaSetores, 'Setor 02', 'Setor 02');

  // No painel aparece Setor 03, mas na planilha é Futtons e Almofadas
  const setor03 = obterGastoSetor_(
    mapaSetores,
    'Futtons e Almofadas',
    'Setor 03'
  );

  // Operações externas, por enquanto, usa Expedição
  const exp = obterGastoSetor_(
    mapaSetores,
    'Expedição',
    'Operações Externas'
  );

  const setoresInternos = [setor01, setor02, setor03];

  const tetoInterno = setoresInternos.reduce(function(total, item) {
    return total + item.teto;
  }, 0);

  const gastoInterno = setoresInternos.reduce(function(total, item) {
    return total + item.gasto;
  }, 0);

  const percentualInterno = calcularPercentual_(gastoInterno, tetoInterno);
  const percentualExterno = calcularPercentual_(exp.gasto, exp.teto);

  return {
    mes: mesAtual,

    interno: {
      nome: 'Operações Internas',
      teto: tetoInterno,
      gasto: gastoInterno,
      percentual: percentualInterno,
      setores: setoresInternos
    },

    externo: {
      nome: 'Operações Externas',
      teto: exp.teto,
      gasto: exp.gasto,
      percentual: percentualExterno,
      setores: [exp]
    }
  };
}


function montarMapaSetoresGastos_(valores, colunaTeto, colunaGasto) {
  const mapa = {};

  for (let i = 1; i < valores.length; i++) {
    const linha = valores[i];

    const setor = String(linha[0] || '').trim();

    if (!setor) continue;

    const teto = converterNumero_(linha[colunaTeto]);
    const gasto = converterNumero_(linha[colunaGasto]);

    mapa[normalizarTexto_(setor)] = {
      nome: setor,
      teto: teto,
      gasto: gasto,
      percentual: calcularPercentual_(gasto, teto)
    };
  }

  return mapa;
}


function obterGastoSetor_(mapa, nomePlanilha, nomeExibicao) {
  const chave = normalizarTexto_(nomePlanilha);

  const item = mapa[chave] || {
    nome: nomePlanilha,
    teto: 0,
    gasto: 0,
    percentual: 0
  };

  return {
    nome: nomePlanilha,
    nomeExibicao: nomeExibicao || nomePlanilha,
    teto: item.teto || 0,
    gasto: item.gasto || 0,
    percentual: calcularPercentual_(item.gasto || 0, item.teto || 0)
  };
}

/************************************************************
 * CATÁLOGO DE ITENS — OCORRÊNCIAS OPERACIONAIS
 ************************************************************/

function buscarCatalogoItensOcorrencias() {
  try {

    const ss = SpreadsheetApp.openById(
      PLANILHA_CATALOGO_ITENS_ID
    );

    const aba = ss.getSheetByName(
      ABA_CATALOGO_ITENS
    );

    if (!aba) {
      throw new Error(
        'A aba "Itens" não foi encontrada na planilha do catálogo.'
      );
    }

    const ultimaLinha = aba.getLastRow();

    if (ultimaLinha < 2) {
      return {
        ok: true,
        categorias: []
      };
    }

    /*
     * Estrutura da aba Itens:
     *
     * A = Categoria
     * B = Nome do item
     */
    const valores = aba
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        2
      )
      .getDisplayValues();

    const mapaCategorias = {};

    valores.forEach(function(linha) {

      const categoria =
        String(linha[0] || '').trim();

      const item =
        String(linha[1] || '').trim();

      if (!categoria || !item) {
        return;
      }

      const chaveCategoria =
        normalizarTexto_(categoria);

      const chaveItem =
        normalizarTexto_(item);

      if (!mapaCategorias[chaveCategoria]) {
        mapaCategorias[chaveCategoria] = {
          nome: categoria,
          itens: {}
        };
      }

      // Evita itens duplicados dentro da categoria
      if (!mapaCategorias[chaveCategoria].itens[chaveItem]) {
        mapaCategorias[chaveCategoria].itens[chaveItem] = item;
      }

    });

    const categorias =
      Object.keys(mapaCategorias)
        .map(function(chaveCategoria) {

          const registro =
            mapaCategorias[chaveCategoria];

          const itens =
            Object.keys(registro.itens)
              .map(function(chaveItem) {
                return registro.itens[chaveItem];
              })
              .sort(function(a, b) {
                return a.localeCompare(
                  b,
                  'pt-BR',
                  { sensitivity: 'base' }
                );
              });

          return {
            nome: registro.nome,
            itens: itens
          };
        })
        .sort(function(a, b) {
          return a.nome.localeCompare(
            b.nome,
            'pt-BR',
            { sensitivity: 'base' }
          );
        });

    return {
      ok: true,
      categorias: categorias
    };

  } catch (erro) {

    console.error(
      'Erro em buscarCatalogoItensOcorrencias:',
      erro
    );

    return {
      ok: false,
      msg: erro.message,
      categorias: []
    };
  }
}


/************************************************************
 * VERIFICA SE A OCORRÊNCIA EXIGE IDENTIFICAÇÃO DO ITEM
 ************************************************************/

function ocorrenciaExigeItemOperacional_(ocorrencia) {

  const valor =
    normalizarTexto_(ocorrencia);

  const ocorrenciasComItem = [
    'material sem capa',
    'item sem revisao',
    'itens danificados',
    'itens sem capa de protecao'
  ];

  return ocorrenciasComItem.indexOf(valor) !== -1;
}

function ocorrenciaExigeQuantidadeOperacional_(
  ocorrencia
) {

  const valor =
    normalizarTexto_(
      ocorrencia
    );

const ocorrenciasComQuantidade = [
  'material sem capa',
  'item sem revisao',
  'itens sem revisao',
  'itens danificados',
  'itens sem capa de protecao'
];

  return ocorrenciasComQuantidade
    .indexOf(valor) !== -1;
}

/************************************************************
 * OCORRÊNCIAS OPERACIONAIS
 ************************************************************/

function buscarOcorrenciasOperacionais(filtros) {
  try {
    filtros = filtros || {};

    const pagina = Number(filtros.pagina) || 1;
    const limite = Number(filtros.limite) || 10;

    const dataInicial = String(filtros.dataInicial || '').trim();
    const dataFinal = String(filtros.dataFinal || '').trim();
    const departamentoFiltro = String(filtros.departamento || '').trim();
    const supervisorFiltro = String(filtros.supervisor || '').trim();
    const ocorrenciaFiltro = String(filtros.ocorrencia || '').trim();
    const statusFiltro = String(filtros.status || '').trim();
    const busca = String(filtros.busca || '').trim().toLowerCase();

    const ss = SpreadsheetApp.openById(PLANILHA_QUALIDADE_ID);
    const aba = obterAbaPorGid_(ss, ABA_OCORRENCIAS_GID);

    if (!aba) {
      throw new Error('Aba de ocorrências não encontrada pelo GID: ' + ABA_OCORRENCIAS_GID);
    }

    const ultimaLinha = aba.getLastRow();

    if (ultimaLinha < 2) {
      return {
        ok: true,
        dados: [],
        total: 0,
        pagina: 1,
        totalPaginas: 1,
        atualizadoAs: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm:ss')
      };
    }

const valores = aba
.getRange(2, 1, ultimaLinha - 1, 11)
  .getValues();

    let dados = valores.map(function(linha) {
      const dataOriginal = linha[1];

return {
  id: String(linha[0] || '').trim(),
  dataOriginal: dataOriginal,
  dataObj: converterParaData_(dataOriginal),
  dataHora: formatarDataHoraOcorrencia_(dataOriginal),
  numeroPedido: String(linha[2] || '').trim(),
  departamento: String(linha[3] || '').trim(),
  supervisor: String(linha[4] || '').trim(),
  ocorrencia: String(linha[5] || '').trim(),
  status: String(linha[6] || '').trim(),
  observacao: String(linha[7] || '').trim(),
categoria: String(linha[8] || '').trim(),
item: String(linha[9] || '').trim(),
quantidade: String(linha[10] || '').trim()
};
    }).filter(function(item) {
      return item.id || item.dataHora || item.ocorrencia;
    });

    // Filtro por data inicial
    if (dataInicial) {
      const inicio = criarDataInicioDia_(dataInicial);

      dados = dados.filter(function(item) {
        if (!item.dataObj) return false;
        return item.dataObj >= inicio;
      });
    }

    // Filtro por data final
    if (dataFinal) {
      const fim = criarDataFimDia_(dataFinal);

      dados = dados.filter(function(item) {
        if (!item.dataObj) return false;
        return item.dataObj <= fim;
      });
    }

    if (departamentoFiltro) {
      dados = dados.filter(function(item) {
        return item.departamento === departamentoFiltro;
      });
    }

    if (supervisorFiltro) {
      dados = dados.filter(function(item) {
        return item.supervisor === supervisorFiltro;
      });
    }

    if (ocorrenciaFiltro) {
      dados = dados.filter(function(item) {
        return item.ocorrencia === ocorrenciaFiltro;
      });
    }

    if (statusFiltro) {
      dados = dados.filter(function(item) {
        return item.status === statusFiltro;
      });
    }

    if (busca) {
      dados = dados.filter(function(item) {
const texto = [
  item.numeroPedido,
  item.departamento,
  item.supervisor,
  item.ocorrencia,
  item.observacao,
  item.status,
  item.categoria,
  item.item
].join(' ').toLowerCase();

        return texto.includes(busca);
      });
    }

    // Mais recentes primeiro
    dados.sort(function(a, b) {
      const dataA = a.dataObj ? a.dataObj.getTime() : 0;
      const dataB = b.dataObj ? b.dataObj.getTime() : 0;

      return dataB - dataA;
    });

    const total = dados.length;
    const totalPaginas = Math.max(1, Math.ceil(total / limite));
    const paginaCorrigida = Math.min(Math.max(pagina, 1), totalPaginas);

    const inicio = (paginaCorrigida - 1) * limite;
    const fim = inicio + limite;

    const dadosPaginados = dados.slice(inicio, fim).map(function(item) {
      delete item.dataOriginal;
      delete item.dataObj;
      return item;
    });

    return {
      ok: true,
      dados: dadosPaginados,
      total: total,
      pagina: paginaCorrigida,
      totalPaginas: totalPaginas,
      atualizadoAs: Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'HH:mm:ss'
      )
    };

  } catch (erro) {
    return {
      ok: false,
      msg: erro.message,
      dados: [],
      total: 0,
      pagina: 1,
      totalPaginas: 1
    };
  }
}

function salvarOcorrenciaOperacional(dados) {
  try {

    dados = dados || {};

    const departamento =
      String(dados.departamento || '').trim();

    const supervisor =
      String(dados.supervisor || '').trim();

    const ocorrencia =
      String(dados.ocorrencia || '').trim();

    const numeroPedido =
      String(dados.numeroPedido || '').trim();

    const observacao =
      String(dados.observacao || '').trim();

    const status =
      String(dados.status || '').trim();

    const senha =
      String(dados.senha || '').trim();

    let categoria =
      String(dados.categoria || '').trim();

    let item =
      String(dados.item || '').trim();

    let quantidade =
      String(dados.quantidade || '').trim();


    /************************************************************
     * VALIDAÇÕES BÁSICAS
     ************************************************************/

    if (!departamento) {
      throw new Error(
        'Departamento é obrigatório.'
      );
    }

    if (!supervisor) {
      throw new Error(
        'Supervisor é obrigatório.'
      );
    }

    if (!ocorrencia) {
      throw new Error(
        'Ocorrência é obrigatória.'
      );
    }

    if (
      departamento === 'Operações Externas' &&
      !numeroPedido
    ) {
      throw new Error(
        'Número do pedido é obrigatório para Operações Externas.'
      );
    }


    /************************************************************
     * VERIFICA SE A OCORRÊNCIA EXIGE ITEM
     ************************************************************/

    const exigeItem =
      ocorrenciaExigeItemOperacional_(
        ocorrencia
      );


    if (exigeItem && !categoria) {
      throw new Error(
        'Selecione a categoria do item.'
      );
    }

    if (exigeItem && !item) {
      throw new Error(
        'Selecione o item.'
      );
    }


    /*
     * Se a ocorrência não exige item,
     * limpa qualquer informação residual.
     */
    if (!exigeItem) {
      categoria = '';
      item = '';
    }


    /************************************************************
     * VERIFICA SE A OCORRÊNCIA EXIGE QUANTIDADE
     ************************************************************/

    const exigeQuantidade =
      ocorrenciaExigeQuantidadeOperacional_(
        ocorrencia
      );


    if (exigeQuantidade) {

      if (!quantidade) {
        throw new Error(
          'Quantidade é obrigatória.'
        );
      }


      const quantidadeNumero =
        Number(quantidade);


      if (
        !Number.isInteger(quantidadeNumero) ||
        quantidadeNumero <= 0
      ) {
        throw new Error(
          'Informe uma quantidade válida.'
        );
      }


      quantidade =
        quantidadeNumero;

    } else {

      quantidade = '';

    }


    /************************************************************
     * SENHA
     ************************************************************/

    /* Senha do supervisor removida (out/2026): quem protege é o login do Acervo (api/gs.js). */


    /************************************************************
     * ABRE A PLANILHA DE OCORRÊNCIAS
     ************************************************************/

    const ss =
      SpreadsheetApp.openById(
        PLANILHA_QUALIDADE_ID
      );


    const aba =
      obterAbaPorGid_(
        ss,
        ABA_OCORRENCIAS_GID
      );


    if (!aba) {
      throw new Error(
        'Aba de ocorrências não encontrada pelo GID: ' +
        ABA_OCORRENCIAS_GID
      );
    }


    /************************************************************
     * DADOS DO REGISTRO
     ************************************************************/

    const id =
      gerarIdOcorrencia_();

    const agora =
      new Date();


    const statusFinal =
      ocorrencia === 'Itens esquecidos'
        ? (status || 'Aberto')
        : '';


    /************************************************************
     * GARANTE OS CABEÇALHOS
     ************************************************************/

    // H = Observação
    const cabecalhoObservacao =
      String(
        aba.getRange(
          1,
          8
        ).getValue() || ''
      ).trim();


    if (!cabecalhoObservacao) {

      aba
        .getRange(
          1,
          8
        )
        .setValue(
          'Observação'
        );
    }


    // I = Categoria
    const cabecalhoCategoria =
      String(
        aba.getRange(
          1,
          9
        ).getValue() || ''
      ).trim();


    if (!cabecalhoCategoria) {

      aba
        .getRange(
          1,
          9
        )
        .setValue(
          'Categoria'
        );
    }


    // J = Item
    const cabecalhoItem =
      String(
        aba.getRange(
          1,
          10
        ).getValue() || ''
      ).trim();


    if (!cabecalhoItem) {

      aba
        .getRange(
          1,
          10
        )
        .setValue(
          'Item'
        );
    }


    // K = Quantidade
    const cabecalhoQuantidade =
      String(
        aba.getRange(
          1,
          11
        ).getValue() || ''
      ).trim();


    if (!cabecalhoQuantidade) {

      aba
        .getRange(
          1,
          11
        )
        .setValue(
          'Quantidade'
        );
    }


    /************************************************************
     * SALVA A OCORRÊNCIA
     ************************************************************/

    aba.appendRow([
      id,              // A
      agora,           // B
      numeroPedido,    // C
      departamento,    // D
      supervisor,      // E
      ocorrencia,      // F
      statusFinal,     // G
      observacao,      // H
      categoria,       // I
      item,            // J
      quantidade       // K
    ]);


    return {
      ok: true,
      msg: 'Ocorrência salva com sucesso.',
      id: id
    };


  } catch (erro) {

    console.error(
      'Erro em salvarOcorrenciaOperacional:',
      erro
    );


    return {
      ok: false,
      msg: erro.message
    };

  }
}
function atualizarStatusOcorrencia(id, novoStatus) {
  try {
    id = String(id || '').trim();
    novoStatus = String(novoStatus || '').trim();

    if (!id) {
      throw new Error('ID da ocorrência não informado.');
    }

    if (!novoStatus) {
      throw new Error('Novo status não informado.');
    }

    const ss = SpreadsheetApp.openById(PLANILHA_QUALIDADE_ID);
    const aba = obterAbaPorGid_(ss, ABA_OCORRENCIAS_GID);

    if (!aba) {
      throw new Error('Aba de ocorrências não encontrada pelo GID: ' + ABA_OCORRENCIAS_GID);
    }

    const ultimaLinha = aba.getLastRow();

    if (ultimaLinha < 2) {
      throw new Error('Não há ocorrências cadastradas.');
    }

    const ids = aba
      .getRange(2, 1, ultimaLinha - 1, 1)
      .getValues();

    for (let i = 0; i < ids.length; i++) {
      const idLinha = String(ids[i][0] || '').trim();

      if (idLinha === id) {
        const linhaReal = i + 2;

        const ocorrencia = String(aba.getRange(linhaReal, 6).getValue() || '').trim();

        if (ocorrencia !== 'Itens esquecidos') {
          throw new Error('Status só pode ser alterado para Itens esquecidos.');
        }

        aba.getRange(linhaReal, 7).setValue(novoStatus);

        return {
          ok: true,
          msg: 'Status atualizado com sucesso.'
        };
      }
    }

    throw new Error('Ocorrência não encontrada.');

  } catch (erro) {
    return {
      ok: false,
      msg: erro.message
    };
  }
}

/************************************************************
 * OCORRÊNCIAS RH — OPERAÇÕES
 ************************************************************/

function getOcorrenciasRHOperacoes(){

  const PLANILHA_RH_ID =
    "1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo";

  const ABA_RH =
    "OcorrenciasRH";

  const ss =
    SpreadsheetApp.openById(
      PLANILHA_RH_ID
    );

  const aba =
    ss.getSheetByName(
      ABA_RH
    );

  if(!aba){

    throw new Error(
      'A aba "OcorrenciasRH" não foi encontrada.'
    );
  }

  const ultimaLinha =
    aba.getLastRow();

  /*
    Cria os quatro setores desde o início.
    Assim, mesmo sem ocorrência, o card
    aparecerá com todos os valores zerados.
  */
  const setoresPermitidos = [
    "Setor 01",
    "Setor 02",
    "Setor 03",
    "Montagem"
  ];

  const tiposPermitidos = [
    "Atraso",
    "Sem Uniforme",
    "Sem EPI",
    "Uso de Celular",
    "Falta",
    "Advertência",
    "Ausência de Jornada"
  ];

  const mapaSetores = {};

  setoresPermitidos.forEach(function(setor){

    mapaSetores[
      normalizarSetorRHOperacoes_(setor)
    ] = {
      setor:setor,
      ocorrencias:{}
    };

    tiposPermitidos.forEach(function(tipo){

      mapaSetores[
        normalizarSetorRHOperacoes_(setor)
      ].ocorrencias[tipo] = 0;
    });
  });


  if(ultimaLinha <= 1){

    return montarRetornoOcorrenciasRHOperacoes_(
      mapaSetores,
      setoresPermitidos,
      tiposPermitidos
    );
  }


  /*
    Estrutura atual da aba OcorrenciasRH:

    A = ID
    B = Data da ocorrência
    C = Hora da ocorrência
    D = Nome
    E = Sobrenome
    F = Setor
    G = Tipo
  */
  const dados =
    aba.getRange(
      2,
      1,
      ultimaLinha - 1,
      7
    ).getValues();

  const hoje =
    new Date();

  const mesAtual =
    hoje.getMonth();

  const anoAtual =
    hoje.getFullYear();


  dados.forEach(function(linha){

    const dataOcorrencia =
      converterParaData_(
        linha[1]
      );

    if(!dataOcorrencia){
      return;
    }

    if(
      dataOcorrencia.getMonth() !== mesAtual ||
      dataOcorrencia.getFullYear() !== anoAtual
    ){
      return;
    }

    const setor =
      normalizarSetorRHOperacoes_(
        linha[5]
      );

    const tipo =
      normalizarTipoRHOperacoes_(
        linha[6]
      );

    if(!mapaSetores[setor]){
      return;
    }

    if(!tipo){
      return;
    }

    mapaSetores[setor]
      .ocorrencias[tipo] =
        Number(
          mapaSetores[setor]
            .ocorrencias[tipo] || 0
        ) + 1;
  });


  return montarRetornoOcorrenciasRHOperacoes_(
    mapaSetores,
    setoresPermitidos,
    tiposPermitidos
  );
}


/************************************************************
 * NORMALIZAR SETORES DO RH
 ************************************************************/

function normalizarSetorRHOperacoes_(valor){

  const texto =
    normalizarTexto_(valor)
      .replace(/\s+/g, " ")
      .trim();

  if(
    texto === "setor 1" ||
    texto === "setor 01" ||
    texto === "setor01"
  ){
    return "setor 01";
  }

  if(
    texto === "setor 2" ||
    texto === "setor 02" ||
    texto === "setor02"
  ){
    return "setor 02";
  }

  if(
    texto === "setor 3" ||
    texto === "setor 03" ||
    texto === "setor03"
  ){
    return "setor 03";
  }

  if(texto.indexOf("montagem") !== -1){
    return "montagem";
  }

  return texto;
}


/************************************************************
 * NORMALIZAR TIPOS DE OCORRÊNCIA
 ************************************************************/

function normalizarTipoRHOperacoes_(valor){

  const texto =
    normalizarTexto_(valor);

  if(texto.indexOf("atraso") !== -1){
    return "Atraso";
  }

  if(texto.indexOf("uniforme") !== -1){
    return "Sem Uniforme";
  }

  if(texto.indexOf("epi") !== -1){
    return "Sem EPI";
  }

  if(texto.indexOf("celular") !== -1){
    return "Uso de Celular";
  }

  if(texto.indexOf("falta") !== -1){
    return "Falta";
  }

  if(texto.indexOf("advertencia") !== -1){
    return "Advertência";
  }

  if(
    texto.indexOf("ausencia") !== -1 ||
    texto.indexOf("jornada") !== -1
  ){
    return "Ausência de Jornada";
  }

  return "";
}


/************************************************************
 * MONTAR RETORNO PARA O HTML
 ************************************************************/

function montarRetornoOcorrenciasRHOperacoes_(
  mapaSetores,
  setoresPermitidos,
  tiposPermitidos
){

  return setoresPermitidos.map(function(setor){

    const chave =
      normalizarSetorRHOperacoes_(
        setor
      );

    const registro =
      mapaSetores[chave];

    return {
      setor:setor,

      ocorrencias:
        tiposPermitidos.map(function(tipo){

          return {
            tipo:tipo,

            qtd:Number(
              registro.ocorrencias[tipo] || 0
            ),

            /*
              Mantém o mesmo padrão visual
              atual do painel de Manutenção.
            */
            meta:0
          };
        })
    };
  });
}
/************************************************************
 * SENHAS
 ************************************************************/

function validarSenhaOcorrencia_(supervisor, senhaDigitada) {
  // Por enquanto, se não existir uma aba "Senhas" nesta planilha,
  // o sistema apenas exige que a senha seja preenchida.
  // Quando você quiser, podemos travar por senha real por supervisor.

  const ss = SpreadsheetApp.openById(PLANILHA_QUALIDADE_ID);
  const abaSenhas = ss.getSheetByName('Senhas');

  if (!abaSenhas) {
    return true;
  }

  const ultimaLinha = abaSenhas.getLastRow();

  if (ultimaLinha < 2) {
    return true;
  }

  const dados = abaSenhas
    .getRange(2, 1, ultimaLinha - 1, 2)
    .getValues();

  const supervisorNorm = normalizarTexto_(supervisor);
  const senhaLimpa = String(senhaDigitada || '').trim();

  for (let i = 0; i < dados.length; i++) {
    const nome = String(dados[i][0] || '').trim();
    const senha = String(dados[i][1] || '').trim();

    if (normalizarTexto_(nome) === supervisorNorm) {
      if (senhaLimpa === senha) {
        return true;
      }

      throw new Error('Senha incorreta para o supervisor selecionado.');
    }
  }

  // Se a aba Senhas existir, mas o supervisor não estiver cadastrado,
  // bloqueia para evitar lançamento sem controle.
  throw new Error('Supervisor não encontrado na aba Senhas.');
}


/************************************************************
 * HELPERS
 ************************************************************/

function obterAbaPorGid_(ss, gid) {
  const sheets = ss.getSheets();

  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === Number(gid)) {
      return sheets[i];
    }
  }

  return null;
}


function gerarIdOcorrencia_() {
  const agora = new Date();

  const data = Utilities.formatDate(
    agora,
    Session.getScriptTimeZone(),
    'yyyyMMdd_HHmmss'
  );

  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');

  return 'OC_' + data + '_' + random;
}


function formatarDataHoraOcorrencia_(valor) {
  if (!valor) return '';

  const data = converterParaData_(valor);

  if (!data) {
    return String(valor);
  }

  return Utilities.formatDate(
    data,
    Session.getScriptTimeZone(),
    'dd/MM/yyyy HH:mm'
  );
}


function converterParaData_(valor) {
  if (!valor) return null;

  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor)) {
    return valor;
  }

  const texto = String(valor).trim();

  // Aceita dd/MM/yyyy ou dd/MM/yyyy HH:mm
  const partesBR = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);

  if (partesBR) {
    const dia = Number(partesBR[1]);
    const mes = Number(partesBR[2]) - 1;
    const ano = Number(partesBR[3]);
    const hora = Number(partesBR[4] || 0);
    const minuto = Number(partesBR[5] || 0);

    return new Date(ano, mes, dia, hora, minuto);
  }

  const data = new Date(texto);

  if (!isNaN(data)) {
    return data;
  }

  return null;
}


function criarDataInicioDia_(dataTexto) {
  const partes = String(dataTexto).split('-');

  if (partes.length !== 3) {
    return new Date(dataTexto);
  }

  return new Date(
    Number(partes[0]),
    Number(partes[1]) - 1,
    Number(partes[2]),
    0,
    0,
    0,
    0
  );
}


function criarDataFimDia_(dataTexto) {
  const partes = String(dataTexto).split('-');

  if (partes.length !== 3) {
    const data = new Date(dataTexto);
    data.setHours(23, 59, 59, 999);
    return data;
  }

  return new Date(
    Number(partes[0]),
    Number(partes[1]) - 1,
    Number(partes[2]),
    23,
    59,
    59,
    999
  );
}


function encontrarColunaMes_(cabecalho, mesAtual) {
  const mesNormalizado = normalizarTexto_(mesAtual);

  for (let i = 0; i < cabecalho.length; i++) {
    const texto = normalizarTexto_(cabecalho[i]);

    if (texto === mesNormalizado) {
      return i;
    }
  }

  return -1;
}


function obterNomeMesAtual_() {
  const meses = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro'
  ];

  const agora = new Date();

  return meses[agora.getMonth()];
}


function calcularPercentual_(gasto, teto) {
  gasto = Number(gasto) || 0;
  teto = Number(teto) || 0;

  if (teto <= 0) return 0;

  return (gasto / teto) * 100;
}


function converterNumero_(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return 0;
  }

  if (typeof valor === 'number') {
    return valor;
  }

  let texto = String(valor)
    .trim()
    .replace(/\s/g, '')
    .replace('R$', '');

  if (!texto) return 0;

  // pt-BR: 1.493,98
  if (texto.includes(',') && texto.includes('.')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.includes(',')) {
    texto = texto.replace(',', '.');
  }

  const numero = Number(texto);

  return isNaN(numero) ? 0 : numero;
}


function normalizarTexto_(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
/************************************************************
 * SOMA DOS ITENS DANIFICADOS DO MÊS ATUAL
 ************************************************************/

function buscarItensDanificadosMesAtual_() {

  const PLANILHA_ITENS_DANIFICADOS_ID =
    '1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE';

  const ABA_ITENS_DANIFICADOS =
    'Itens Danificados';

  const ss =
    SpreadsheetApp.openById(
      PLANILHA_ITENS_DANIFICADOS_ID
    );

  const aba =
    ss.getSheetByName(
      ABA_ITENS_DANIFICADOS
    );

  if (!aba) {
    throw new Error(
      'A aba "Itens Danificados" não foi encontrada.'
    );
  }

  const ultimaLinha =
    aba.getLastRow();

  const resultado = {
    internos: 0,
    externos: 0,
    ignoradosProducao: 0,
    ignoradosLimpeza: 0,
    linhasConsideradas: 0
  };

  if (ultimaLinha < 2) {
    return resultado;
  }

  /*
   * Colunas utilizadas:
   *
   * B = Data
   * G = Quantidade
   * H = Campo chamado "Coluna 7"
   * M = Onde aconteceu o dano?
   *
   * Lemos de B até M:
   * B,C,D,E,F,G,H,I,J,K,L,M
   */
  const valores =
    aba.getRange(
      2,
      2,
      ultimaLinha - 1,
      12
    ).getValues();

  const agora = new Date();
  const mesAtual = agora.getMonth();
  const anoAtual = agora.getFullYear();

  valores.forEach(function(linha) {

    /*
     * Como o intervalo começa na coluna B:
     *
     * linha[0]  = B = Data
     * linha[5]  = G = Quantidade
     * linha[6]  = H = "Coluna 7"
     * linha[11] = M = Onde aconteceu o dano
     */
    const data =
      converterParaData_(linha[0]);

    const quantidade =
      converterNumero_(linha[5]);

    const classificacaoColuna7 =
      normalizarTexto_(linha[6]);

    const localDano =
      normalizarTexto_(linha[11]);

    if (!data) {
      return;
    }

    // Considera somente o mês e o ano atuais.
    if (
      data.getMonth() !== mesAtual ||
      data.getFullYear() !== anoAtual
    ) {
      return;
    }

    /*
     * Nova regra:
     * Limpeza de Estofados representa desgaste/uso,
     * e não deve entrar como item danificado.
     */
    if (
      classificacaoColuna7.includes(
        'limpeza de estofados'
      )
    ) {
      resultado.ignoradosLimpeza += quantidade;
      return;
    }

    // Produção também deve ser ignorada.
    if (localDano.includes('producao')) {
      resultado.ignoradosProducao += quantidade;
      return;
    }

    if (quantidade <= 0) {
      return;
    }

    // Evento = Operações Externas.
    if (localDano.includes('evento')) {
      resultado.externos += quantidade;
      resultado.linhasConsideradas++;
      return;
    }

    // Dano interno = Operações Internas.
    if (
      localDano.includes('dano interno') ||
      localDano.includes('interno')
    ) {
      resultado.internos += quantidade;
      resultado.linhasConsideradas++;
    }

  });

  return resultado;
}
/************************************************************
 * INSERE OS TOTAIS NO INDICADOR "ITENS DANIFICADOS"
 ************************************************************/

function aplicarItensDanificadosNosIndicadores_(
  indicadores,
  itensDanificados
) {

  indicadores =
    indicadores || {
      internos: [],
      externos: []
    };

  itensDanificados =
    itensDanificados || {
      internos: 0,
      externos: 0
    };

  /*
   * Operações Internas
   */
  (indicadores.internos || [])
    .forEach(function(item) {

      const nome =
        normalizarTexto_(
          item.nome
        );

      if (
        nome === 'itens danificados' ||
        nome === 'item danificado'
      ) {

        item.valor =
          Number(
            itensDanificados.internos || 0
          );
      }
    });

  /*
   * Operações Externas
   */
  (indicadores.externos || [])
    .forEach(function(item) {

      const nome =
        normalizarTexto_(
          item.nome
        );

      if (
        nome === 'itens danificados' ||
        nome === 'item danificado'
      ) {

        item.valor =
          Number(
            itensDanificados.externos || 0
          );
      }
    });

  return indicadores;
}