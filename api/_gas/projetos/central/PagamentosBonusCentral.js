/* =========================================================
   PAINEL DE PAGAMENTOS DE BÔNUS — CENTRAL DE METAS

   Mostra, por pessoa e por mês, o valor de bônus
   que ficou definido no fechamento mensal e o
   valor que foi efetivamente pago.

   Fonte dos valores a receber:
   - "Fechamentos Funcionarios" (funcionários)
   - "Fechamentos Mensais" (supervisor)

   Somente meses FECHADOS aparecem no painel.

   Os valores pagos ficam na aba "Pagamentos Bonus"
   da mesma planilha de fechamentos.
========================================================= */

const PAGAMENTOS_BONUS_ABA =
  "Pagamentos Bonus";


/*
  Senha própria para lançar os valores pagos
  (diferente da senha da Gerência usada no fechamento).
  Fica só no servidor; a página nunca recebe esse valor.
*/
const PAGAMENTOS_BONUS_SENHA =
  "Valentina";

function pagamentosBonusValidarSenhaPagamentos_(senhaInformada){
  /* Senha removida (out/2026): quem protege agora é o login do Acervo (api/gs.js). */
  return;


  const senha =
    String(senhaInformada || "").trim();

  if(!senha){
    throw new Error("Informe a senha para lançar pagamentos.");
  }

  if(senha !== PAGAMENTOS_BONUS_SENHA){
    throw new Error("Senha incorreta.");
  }

}


/* =========================================================
   CONSULTAR O PAINEL DE UM ANO
========================================================= */

function pagamentosBonusCentralObter(anoFiltro){

  exigirAcessoCentral_();


  const estrutura =
    fechamentoCentralGarantirAbas_();

  const abaPagamentos =
    pagamentosBonusGarantirAba_();

  const fechamentos =
    pagamentosBonusLerFechamentos_(
      estrutura.abaMeses
    );

  const anosDisponiveis =
    Object.keys(
      fechamentos.reduce(
        function(mapa, item){

          mapa[item.mes.slice(0, 4)] = true;

          return mapa;

        },
        {}
      )
    ).sort();

  const anoAtual =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy"
    );

  let ano =
    String(
      anoFiltro || ""
    ).trim();

  if(!/^\d{4}$/.test(ano)){

    ano =
      anosDisponiveis.indexOf(anoAtual) >= 0 ||
      anosDisponiveis.length === 0
        ? anoAtual
        : anosDisponiveis[anosDisponiveis.length - 1];

  }

  if(anosDisponiveis.indexOf(anoAtual) < 0){
    anosDisponiveis.push(anoAtual);
    anosDisponiveis.sort();
  }

  const fechamentosAno =
    fechamentos
      .filter(function(item){
        return item.mes.slice(0, 4) === ano;
      })
      .sort(function(a, b){
        return a.mes.localeCompare(b.mes);
      });

  const pessoasPorChave = {};

  function obterPessoa(chave, dados){

    if(!pessoasPorChave[chave]){

      pessoasPorChave[chave] = {
        chave: chave,
        nome: dados.nome,
        setor: dados.setor,
        cargo: dados.cargo,
        grupo: dados.grupo,
        valores: {}
      };

    } else {

      /*
        Mantém os dados cadastrais do mês
        mais recente.
      */
      pessoasPorChave[chave].nome = dados.nome;
      pessoasPorChave[chave].setor = dados.setor;
      pessoasPorChave[chave].cargo = dados.cargo;
      pessoasPorChave[chave].grupo = dados.grupo;

    }

    return pessoasPorChave[chave];

  }

  const idsPorMes = {};

  fechamentosAno.forEach(function(item){

    idsPorMes[item.idFechamento] = item.mes;

    if(item.nomeSupervisor){

      const supervisor =
        obterPessoa(
          pagamentosBonusChaveSupervisor_(
            item.nomeSupervisor
          ),
          {
            nome: item.nomeSupervisor,
            setor: "Supervisão",
            cargo: "Supervisor",
            grupo: "SUPERVISOR"
          }
        );

      supervisor.valores[item.mes] = {
        devido: item.valorPagoSupervisor,
        pago: null,
        atualizadoEm: ""
      };

    }

  });

  const abaFuncionarios =
    estrutura.abaFuncionarios;

  const ultimaLinhaFuncionarios =
    abaFuncionarios.getLastRow();

  if(ultimaLinhaFuncionarios >= 2){

    const dados =
      abaFuncionarios
        .getRange(
          2,
          1,
          ultimaLinhaFuncionarios - 1,
          20
        )
        .getValues();

    dados.forEach(function(linha){

      const mes =
        idsPorMes[
          String(linha[0] || "")
        ];

      if(!mes){
        return;
      }

      const pessoa =
        obterPessoa(
          pagamentosBonusChaveFuncionario_(
            linha[4],
            linha[5]
          ),
          {
            nome: String(linha[5] || "").trim(),
            setor: String(linha[6] || "").trim(),
            cargo: String(linha[7] || "").trim(),
            grupo: String(linha[3] || "").trim().toUpperCase()
          }
        );

      pessoa.valores[mes] = {
        devido: fechamentoCentralNumero_(linha[11]),
        pago: null,
        atualizadoEm: ""
      };

    });

  }

  const pagamentos =
    pagamentosBonusLerPagamentos_(
      abaPagamentos
    );

  pagamentos.forEach(function(item){

    if(item.mes.slice(0, 4) !== ano){
      return;
    }

    const pessoa =
      pessoasPorChave[item.chave];

    if(!pessoa){
      return;
    }

    if(!pessoa.valores[item.mes]){

      pessoa.valores[item.mes] = {
        devido: 0,
        pago: null,
        atualizadoEm: ""
      };

    }

    pessoa.valores[item.mes].pago =
      item.valorPago;

    pessoa.valores[item.mes].atualizadoEm =
      item.atualizadoEm;

  });

  const ordemGrupo = {
    SUPERVISOR: 0,
    ESTOFADOS: 1,
    ESTRUTURA: 2
  };

  const pessoas =
    Object.keys(pessoasPorChave)
      .map(function(chave){
        return pessoasPorChave[chave];
      })
      .sort(function(a, b){

        const grupoA =
          ordemGrupo.hasOwnProperty(a.grupo)
            ? ordemGrupo[a.grupo]
            : 9;

        const grupoB =
          ordemGrupo.hasOwnProperty(b.grupo)
            ? ordemGrupo[b.grupo]
            : 9;

        if(grupoA !== grupoB){
          return grupoA - grupoB;
        }

        return a.nome.localeCompare(b.nome);

      });

  return {

    ok: true,

    ano: ano,

    anosDisponiveis: anosDisponiveis,

    meses: fechamentosAno.map(function(item){

      return {
        mes: item.mes,
        idFechamento: item.idFechamento,
        dataFechamento:
          fechamentoCentralFormatarData_(
            item.dataFechamento
          )
      };

    }),

    pessoas: pessoas

  };

}


/* =========================================================
   CONFERIR A SENHA ANTES DE LIBERAR A EDIÇÃO
========================================================= */

function pagamentosBonusCentralValidarSenha(senhaInformada){

  exigirAcessoCentral_();


  pagamentosBonusValidarSenhaPagamentos_(
    senhaInformada
  );

  return {
    ok: true
  };

}


/* =========================================================
   SALVAR VALORES PAGOS

   lancamentos = [
     { mes: "2026-08", chave: "CPF:...", valorPago: 123.45 }
   ]

   valorPago vazio/null remove o lançamento.
========================================================= */

function pagamentosBonusCentralSalvar(
  lancamentos,
  senhaInformada,
  anoFiltro
){

  exigirAcessoCentral_();


  pagamentosBonusValidarSenhaPagamentos_(
    senhaInformada
  );

  if(
    !Array.isArray(lancamentos) ||
    lancamentos.length === 0
  ){

    throw new Error(
      "Nenhum valor alterado para salvar."
    );

  }

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try{

    const estrutura =
      fechamentoCentralGarantirAbas_();

    const abaPagamentos =
      pagamentosBonusGarantirAba_();

    /*
      Só aceita lançamentos de pessoas que
      realmente constam em um mês fechado.
    */
    const pessoasValidas =
      pagamentosBonusMapaPessoasFechadas_(
        estrutura
      );

    const existentes =
      pagamentosBonusLerPagamentos_(
        abaPagamentos
      );

    const linhaPorChave = {};

    existentes.forEach(function(item){
      linhaPorChave[item.mes + "|" + item.chave] = item.linha;
    });

    const agora =
      new Date();

    const linhasRemover = [];
    const novasLinhas = [];

    lancamentos.forEach(function(lancamento){

      const mes =
        fechamentoCentralValidarMes_(
          lancamento && lancamento.mes,
          false
        );

      const chave =
        String(
          lancamento && lancamento.chave || ""
        ).trim();

      const nome =
        pessoasValidas[mes + "|" + chave];

      if(!nome){

        throw new Error(
          "Pessoa não encontrada no fechamento de " +
          mes +
          ". Atualize o painel e tente novamente."
        );

      }

      const valorBruto =
        lancamento.valorPago;

      const vazio =
        valorBruto === null ||
        valorBruto === undefined ||
        String(valorBruto).trim() === "";

      const linhaExistente =
        linhaPorChave[mes + "|" + chave];

      if(vazio){

        if(linhaExistente){
          linhasRemover.push(linhaExistente);
        }

        return;

      }

      const valor =
        Number(valorBruto);

      if(
        !isFinite(valor) ||
        valor < 0
      ){

        throw new Error(
          "Valor pago inválido para " +
          nome +
          " em " +
          mes +
          "."
        );

      }

      const linhaValores = [
        mes,
        chave,
        nome,
        Number(valor.toFixed(2)),
        agora
      ];

      if(linhaExistente){

        abaPagamentos
          .getRange(
            linhaExistente,
            1,
            1,
            linhaValores.length
          )
          .setValues([
            linhaValores
          ]);

      } else {

        novasLinhas.push(
          linhaValores
        );

      }

    });

    /*
      Remove de baixo para cima para não
      deslocar as linhas ainda pendentes.
    */
    linhasRemover
      .sort(function(a, b){
        return b - a;
      })
      .forEach(function(linha){
        abaPagamentos.deleteRow(linha);
      });

    if(novasLinhas.length > 0){

      abaPagamentos
        .getRange(
          abaPagamentos.getLastRow() + 1,
          1,
          novasLinhas.length,
          novasLinhas[0].length
        )
        .setValues(
          novasLinhas
        );

    }

    SpreadsheetApp.flush();

  } finally {

    lock.releaseLock();

  }

  return pagamentosBonusCentralObter(
    anoFiltro
  );

}


/* =========================================================
   LER MESES FECHADOS
========================================================= */

function pagamentosBonusLerFechamentos_(abaMeses){

  const ultimaLinha =
    abaMeses.getLastRow();

  if(ultimaLinha < 2){
    return [];
  }

  const dados =
    abaMeses
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        19
      )
      .getValues();

  /*
    Se um mês tiver mais de uma linha FECHADO,
    vale a última (mesma regra de
    fechamentoCentralLocalizarMes_).
  */
  const porMes = {};

  dados.forEach(function(linha){

    if(
      String(linha[17] || "").trim() !==
      "FECHADO"
    ){
      return;
    }

    const mes =
      pagamentosBonusMesTexto_(
        linha[1]
      );

    if(!mes){
      return;
    }

    porMes[mes] = {
      mes: mes,
      idFechamento: String(linha[0] || ""),
      dataFechamento: linha[2],
      nomeSupervisor: String(linha[9] || "").trim(),
      valorPagoSupervisor:
        fechamentoCentralNumero_(linha[14])
    };

  });

  return Object.keys(porMes).map(function(mes){
    return porMes[mes];
  });

}


/* =========================================================
   MAPA mes|chave → nome DE TODOS OS MESES FECHADOS
========================================================= */

function pagamentosBonusMapaPessoasFechadas_(estrutura){

  const fechamentos =
    pagamentosBonusLerFechamentos_(
      estrutura.abaMeses
    );

  const mapa = {};
  const mesPorId = {};

  fechamentos.forEach(function(item){

    mesPorId[item.idFechamento] = item.mes;

    if(item.nomeSupervisor){

      mapa[
        item.mes + "|" +
        pagamentosBonusChaveSupervisor_(
          item.nomeSupervisor
        )
      ] = item.nomeSupervisor;

    }

  });

  const aba =
    estrutura.abaFuncionarios;

  const ultimaLinha =
    aba.getLastRow();

  if(ultimaLinha >= 2){

    aba
      .getRange(
        2,
        1,
        ultimaLinha - 1,
        6
      )
      .getValues()
      .forEach(function(linha){

        const mes =
          mesPorId[
            String(linha[0] || "")
          ];

        if(!mes){
          return;
        }

        mapa[
          mes + "|" +
          pagamentosBonusChaveFuncionario_(
            linha[4],
            linha[5]
          )
        ] = String(linha[5] || "").trim();

      });

  }

  return mapa;

}


/* =========================================================
   LER VALORES PAGOS
========================================================= */

function pagamentosBonusLerPagamentos_(abaPagamentos){

  const ultimaLinha =
    abaPagamentos.getLastRow();

  if(ultimaLinha < 2){
    return [];
  }

  return abaPagamentos
    .getRange(
      2,
      1,
      ultimaLinha - 1,
      5
    )
    .getValues()
    .map(function(linha, indice){

      return {
        linha: indice + 2,
        mes: pagamentosBonusMesTexto_(linha[0]),
        chave: String(linha[1] || "").trim(),
        valorPago: fechamentoCentralNumero_(linha[3]),
        atualizadoEm:
          fechamentoCentralFormatarData_(
            linha[4]
          )
      };

    })
    .filter(function(item){
      return item.mes && item.chave;
    });

}


/* =========================================================
   CRIAR A ABA DE PAGAMENTOS
========================================================= */

function pagamentosBonusGarantirAba_(){

  const ss =
    SpreadsheetApp.openById(
      FECHAMENTO_CENTRAL_PLANILHA_ID
    );

  let aba =
    ss.getSheetByName(
      PAGAMENTOS_BONUS_ABA
    );

  if(aba){
    return aba;
  }

  aba =
    ss.insertSheet(
      PAGAMENTOS_BONUS_ABA
    );

  const cabecalho = [[
    "MÊS",
    "CHAVE",
    "FUNCIONÁRIO",
    "VALOR PAGO",
    "ATUALIZADO EM"
  ]];

  aba
    .getRange(
      1,
      1,
      1,
      cabecalho[0].length
    )
    .setValues(
      cabecalho
    );

  fechamentoCentralFormatarCabecalho_(
    aba,
    cabecalho[0].length
  );

  aba
    .getRange("A:B")
    .setNumberFormat("@");

  aba
    .getRange("D:D")
    .setNumberFormat(
      'R$ #,##0.00'
    );

  aba
    .getRange("E:E")
    .setNumberFormat(
      "dd/MM/yyyy HH:mm:ss"
    );

  return aba;

}


/* =========================================================
   CHAVES DE IDENTIFICAÇÃO
========================================================= */

function pagamentosBonusChaveFuncionario_(cpf, nome){

  const cpfLimpo =
    normalizarCPFComissaoCentral_(cpf);

  if(cpfLimpo){
    return "CPF:" + cpfLimpo;
  }

  return "NOME:" + fechamentoCentralNormalizar_(nome);

}


function pagamentosBonusChaveSupervisor_(nome){

  return "SUP:" + fechamentoCentralNormalizar_(nome);

}


function pagamentosBonusMesTexto_(valor){

  if(
    valor instanceof Date &&
    !isNaN(valor.getTime())
  ){

    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );

  }

  const texto =
    String(valor || "").trim();

  return /^\d{4}-\d{2}$/.test(texto)
    ? texto
    : "";

}


/* =========================================================
   FECHAMENTO EM LOTE — RODAR PELO EDITOR

   Selecione "fecharMesesEmLote2026" no editor do
   Apps Script e clique em Executar. O resultado
   de cada mês aparece no Registro de execução.

   ATENÇÃO: funcionários, salários e percentual do
   supervisor usados no cálculo são os do cadastro
   ATUAL. Confira os totais do log com os relatórios
   da época e ajuste na planilha de fechamentos o
   que for diferente.

   Pode rodar de novo sem problema: meses já
   fechados são pulados.
========================================================= */

function fecharMesesEmLote2026(){

  fecharMesesEmLoteCentral_(
    "2026-01",
    "2026-08"
  );

}


function fecharMesesEmLoteCentral_(
  mesInicio,
  mesFim
){

  liberarAcessoInterno_();


  const inicioExecucao =
    Date.now();

  const estrutura =
    fechamentoCentralGarantirAbas_();

  const meses = [];

  let ano = Number(mesInicio.slice(0, 4));
  let numeroMes = Number(mesInicio.slice(5, 7));

  while(true){

    const mes =
      ano + "-" + String(numeroMes).padStart(2, "0");

    if(mes > mesFim){
      break;
    }

    meses.push(mes);

    numeroMes++;

    if(numeroMes > 12){
      numeroMes = 1;
      ano++;
    }

  }

  const resumo = [];

  for(let i = 0; i < meses.length; i++){

    const mes = meses[i];

    /*
      O Apps Script interrompe execuções com mais
      de 6 minutos. Para antes disso; é só rodar
      de novo que ele continua de onde parou.
    */
    if(Date.now() - inicioExecucao > 4.5 * 60 * 1000){

      Logger.log(
        "⏸ Tempo quase esgotado. Rode a função de novo para continuar a partir de " +
        mes + "."
      );

      break;

    }

    try{

      if(
        fechamentoCentralLocalizarMes_(
          estrutura.abaMeses,
          mes
        )
      ){

        Logger.log(mes + " — já estava fechado, pulado.");
        resumo.push(mes + ": já fechado");
        continue;

      }

      const snapshot =
        fechamentoCentralCalcularSnapshot_(
          mes
        );

      const semMovimento =
        snapshot.eventosEstofados === 0 &&
        snapshot.osEstofados === 0 &&
        snapshot.eventosEstrutura === 0 &&
        snapshot.osEstrutura === 0;

      if(semMovimento){

        Logger.log(mes + " — sem eventos nem O.S., não foi fechado.");
        resumo.push(mes + ": sem movimento");
        continue;

      }

      fechamentoCentralExecutarFechamento_(
        mes,
        snapshot
      );

      const quantidade =
        snapshot.funcionariosEstofados.length +
        snapshot.funcionariosEstrutura.length;

      const linha =
        mes +
        " — FECHADO | funcionários: " + quantidade +
        " | pago funcionários: R$ " + snapshot.totalPagoFuncionarios.toFixed(2) +
        " | supervisor (" + (snapshot.nomeSupervisor || "sem nome") + "): R$ " +
        snapshot.valorPagoSupervisor.toFixed(2) +
        " | TOTAL: R$ " + snapshot.totalGeral.toFixed(2);

      Logger.log(linha);
      resumo.push(linha);

    } catch(erro){

      Logger.log(mes + " — ERRO: " + (erro && erro.message));
      resumo.push(mes + ": ERRO " + (erro && erro.message));

    }

  }

  Logger.log("===== RESUMO =====\n" + resumo.join("\n"));

  return resumo;

}


/* =========================================================
   TESTE MANUAL
========================================================= */

function testarPagamentosBonusCentral(){

  liberarAcessoInterno_();


  const retorno =
    pagamentosBonusCentralObter();

  Logger.log(
    "Ano: " + retorno.ano +
    " | Meses: " + retorno.meses.length +
    " | Pessoas: " + retorno.pessoas.length
  );

  Logger.log(
    JSON.stringify(
      retorno.pessoas.slice(0, 3),
      null,
      2
    )
  );

}
