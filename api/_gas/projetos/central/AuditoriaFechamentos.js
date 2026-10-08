/* =========================================================
   AUDITORIA DOS FECHAMENTOS — somente leitura

   Referência: os valores "a receber" gravados nos
   fechamentos (os mesmos do painel de Pagamentos de Bônus).
   A auditoria confere se todo o resto bate com eles.

   Como usar: rode auditoriaFechamentos() e confira o log.
   Nada é gravado.
========================================================= */

function auditoriaFechamentos(){

  liberarAcessoInterno_();


  const ANO = "2026";

  /* Fechamentos Funcionarios (índices) */
  const F_ID = 0, F_MES = 1, F_GRUPO = 3, F_CPF = 4, F_NOME = 5, F_SETOR = 6,
        F_SALARIO = 8, F_TETO = 9, F_CALCULADO = 10, F_A_RECEBER = 11,
        F_EXCEDENTE = 12, F_NAO_DISTRIBUIDO = 13, F_APTO = 14,
        F_SETOR_META = 15, F_RH_META = 16, F_LIMITADO = 17, F_MOTIVO = 18;

  /* Fechamentos Mensais (índices) */
  const M_ID = 0, M_MES = 1, M_PERCENTUAL = 8, M_SUPERVISOR = 9,
        M_SALARIO_SUP = 10, M_TETO_SUP = 11, M_BASE = 12, M_CALC_SUP = 13,
        M_PAGO_SUP = 14, M_TOTAL_FUNC = 15, M_TOTAL_GERAL = 16,
        M_STATUS = 17, M_QTD = 18;

  function c(valor){
    return Math.round(Number(valor || 0) * 100);
  }

  function moeda(centavos){
    return "R$ " + (centavos / 100).toFixed(2).replace(".", ",");
  }

  function bool(valor){
    return valor === true || String(valor).trim().toUpperCase() === "TRUE";
  }

  const problemas = [];
  const avisos = [];

  function problema(mes, texto){ problemas.push(mes + " | " + texto); }
  function aviso(mes, texto){ avisos.push(mes + " | " + texto); }

  const estrutura =
    fechamentoCentralGarantirAbas_();

  const dadosMeses =
    estrutura.abaMeses
      .getRange(2, 1, estrutura.abaMeses.getLastRow() - 1, 19)
      .getValues();

  const dadosFunc =
    estrutura.abaFuncionarios
      .getRange(2, 1, estrutura.abaFuncionarios.getLastRow() - 1, 20)
      .getValues();

  /* ---------- 0. Meses fechados (último FECHADO de cada mês) ---------- */

  const fechadoPorMes = {};
  const quantidadeFechados = {};

  dadosMeses.forEach(function(linha, i){

    const mes = String(linha[M_MES] || "").trim();

    if(mes.indexOf(ANO + "-") !== 0){
      return;
    }

    if(String(linha[M_STATUS] || "").trim() !== "FECHADO"){
      return;
    }

    quantidadeFechados[mes] = (quantidadeFechados[mes] || 0) + 1;
    fechadoPorMes[mes] = { linha: linha, numeroLinha: i + 2 };

  });

  const meses =
    Object.keys(fechadoPorMes).sort();

  meses.forEach(function(mes){
    if(quantidadeFechados[mes] > 1){
      aviso(mes, "há " + quantidadeFechados[mes] + " linhas FECHADO; vale a última (" + fechadoPorMes[mes].linha[M_ID] + ")");
    }
  });

  /* ---------- 1 e 2. Totais do mês e linhas dos funcionários ---------- */

  const idsValidos = {};
  const valoresFechamento = {};   /* mes|chave -> centavos a receber */
  const chavesPorNome = {};       /* nome -> {chave: [meses]} */

  meses.forEach(function(mes){

    const registro = fechadoPorMes[mes];
    const linhaMes = registro.linha;
    const id = String(linhaMes[M_ID] || "");

    idsValidos[id] = mes;

    let soma = 0;
    let quantidade = 0;
    const chavesNoMes = {};

    dadosFunc.forEach(function(linha, i){

      if(String(linha[F_ID] || "") !== id){
        return;
      }

      quantidade++;

      const numero = i + 2;
      const nome = String(linha[F_NOME] || "").trim();
      const quem = nome + " (linha " + numero + ")";

      const aReceber = c(linha[F_A_RECEBER]);
      const calculado = c(linha[F_CALCULADO]);
      const teto = c(linha[F_TETO]);
      const salario = c(linha[F_SALARIO]);
      const excedente = c(linha[F_EXCEDENTE]);
      const naoDistribuido = c(linha[F_NAO_DISTRIBUIDO]);
      const apto = bool(linha[F_APTO]);
      const limitado = bool(linha[F_LIMITADO]);

      soma += aReceber;

      const chave =
        pagamentosBonusChaveFuncionario_(linha[F_CPF], linha[F_NOME]);

      valoresFechamento[mes + "|" + chave] =
        (valoresFechamento[mes + "|" + chave] || 0) + aReceber;

      if(chavesNoMes[chave]){
        problema(mes, quem + ": mesma pessoa (" + chave + ") aparece mais de uma vez no fechamento — o painel mostra só uma das linhas");
      }
      chavesNoMes[chave] = true;

      const nomeNormalizado = fechamentoCentralNormalizar_(nome);
      chavesPorNome[nomeNormalizado] = chavesPorNome[nomeNormalizado] || {};
      chavesPorNome[nomeNormalizado][chave] = chavesPorNome[nomeNormalizado][chave] || [];
      chavesPorNome[nomeNormalizado][chave].push(mes);

      /* Apto x valor */
      if(aReceber > 0 && !apto){
        problema(mes, quem + ": tem " + moeda(aReceber) + " a receber mas está marcado como NÃO apto (" + (linha[F_MOTIVO] || "sem motivo") + ")");
      }

      if(aReceber === 0 && apto && salario > 0){
        problema(mes, quem + ": está como apto mas com R$ 0,00 a receber");
      }

      if(aReceber > 0 && (!bool(linha[F_SETOR_META]) || !bool(linha[F_RH_META]))){
        aviso(mes, quem + ": recebeu " + moeda(aReceber) + " mas está gravado como " +
          (!bool(linha[F_SETOR_META]) ? "setor NÃO atingiu" : "") +
          (!bool(linha[F_SETOR_META]) && !bool(linha[F_RH_META]) ? " e " : "") +
          (!bool(linha[F_RH_META]) ? "RH NÃO atingiu" : ""));
      }

      /* Coerência entre calculado, a receber, teto e excedente */
      if(aReceber > 0){

        const deveriaLimitar = aReceber < calculado;

        if(deveriaLimitar !== limitado){
          problema(mes, quem + ": marca 'limitado pelo teto' = " + limitado +
            ", mas calculado " + moeda(calculado) + " e a receber " + moeda(aReceber));
        }

        if(excedente !== Math.max(0, calculado - aReceber) && limitado){
          problema(mes, quem + ": excedente gravado " + moeda(excedente) + " ≠ calculado − a receber " + moeda(calculado - aReceber));
        }

        if(salario > 0 && aReceber > Math.round(salario * 0.25)){
          aviso(mes, quem + ": a receber " + moeda(aReceber) + " acima de 25% do salário (" + moeda(Math.round(salario * 0.25)) + ")");
        }

      }

      if(naoDistribuido !== Math.max(0, calculado - aReceber)){
        aviso(mes, quem + ": 'não distribuído' gravado " + moeda(naoDistribuido) + " ≠ calculado − a receber " + moeda(Math.max(0, calculado - aReceber)));
      }

      if(salario > 0 && teto > 0 && teto !== Math.round(salario * 0.25)){
        aviso(mes, quem + ": teto gravado " + moeda(teto) + " não é 25% do salário (" + moeda(Math.round(salario * 0.25)) + ")");
      }

    });

    /* Totais do mês */
    const base = c(linhaMes[M_BASE]);
    const totalFunc = c(linhaMes[M_TOTAL_FUNC]);
    const pagoSup = c(linhaMes[M_PAGO_SUP]);
    const calcSup = c(linhaMes[M_CALC_SUP]);
    const totalGeral = c(linhaMes[M_TOTAL_GERAL]);
    const percentual = Number(linhaMes[M_PERCENTUAL] || 0);
    const salarioSup = c(linhaMes[M_SALARIO_SUP]);
    const tetoSup = c(linhaMes[M_TETO_SUP]);

    if(base !== soma){
      problema(mes, "base da supervisora " + moeda(base) + " ≠ soma dos funcionários " + moeda(soma));
    }

    if(totalFunc !== soma){
      problema(mes, "total pago funcionários " + moeda(totalFunc) + " ≠ soma dos funcionários " + moeda(soma));
    }

    if(totalGeral !== soma + pagoSup){
      problema(mes, "total geral " + moeda(totalGeral) + " ≠ funcionários + supervisora " + moeda(soma + pagoSup));
    }

    if(Number(linhaMes[M_QTD] || 0) !== quantidade){
      aviso(mes, "quantidade de funcionários gravada " + linhaMes[M_QTD] + " ≠ linhas no fechamento " + quantidade);
    }

    if(salarioSup > 0 && tetoSup !== Math.round(salarioSup * 0.30)){
      aviso(mes, "teto da supervisora " + moeda(tetoSup) + " não é 30% do salário (" + moeda(Math.round(salarioSup * 0.30)) + ")");
    }

    if(pagoSup > 0){

      const esperadoCalc = Math.round(base * (percentual / 100));

      if(calcSup !== esperadoCalc){
        problema(mes, "calculado da supervisora " + moeda(calcSup) + " ≠ " + percentual + "% da base " + moeda(esperadoCalc));
      }

      if(pagoSup !== Math.min(calcSup, tetoSup)){
        problema(mes, "a receber da supervisora " + moeda(pagoSup) + " ≠ menor entre calculado e teto " + moeda(Math.min(calcSup, tetoSup)));
      }

    }

    Logger.log(
      mes + " | " + id + " | " + quantidade + " funcionários | soma " + moeda(soma) +
      " | supervisora " + (linhaMes[M_SUPERVISOR] || "-") + " " + moeda(pagoSup) +
      " | total geral " + moeda(totalGeral)
    );

  });

  /* Mesma pessoa com chaves diferentes (painel separa em duas) */
  Object.keys(chavesPorNome).forEach(function(nome){

    const chaves = Object.keys(chavesPorNome[nome]);

    if(chaves.length > 1){
      problema("geral", "'" + nome + "' aparece com identificações diferentes: " +
        chaves.map(function(chave){
          return chave + " em " + chavesPorNome[nome][chave].join(", ");
        }).join(" | ") +
        " — o painel mostra como pessoas separadas");
    }

  });

  /* ---------- 3. Painel de Pagamentos x fechamento ---------- */

  const painel =
    pagamentosBonusCentralObter(ANO);

  painel.pessoas.forEach(function(pessoa){

    if(pessoa.grupo === "SUPERVISOR"){
      return;
    }

    Object.keys(pessoa.valores).forEach(function(mes){

      const noPainel = c(pessoa.valores[mes].devido);
      const noFechamento = valoresFechamento[mes + "|" + pessoa.chave];

      if(noFechamento === undefined){
        aviso(mes, pessoa.nome + ": aparece no painel mas não tem linha no fechamento (só pagamento lançado)");
        return;
      }

      if(noPainel !== noFechamento){
        problema(mes, pessoa.nome + ": painel mostra " + moeda(noPainel) + " e o fechamento tem " + moeda(noFechamento));
      }

    });

  });

  const pagamentos =
    pagamentosBonusLerPagamentos_(pagamentosBonusGarantirAba_());

  pagamentos.forEach(function(item){

    if(item.mes.indexOf(ANO + "-") !== 0 || item.chave.indexOf("SUP:") === 0){
      return;
    }

    if(valoresFechamento[item.mes + "|" + item.chave] === undefined){
      aviso(item.mes, "pagamento lançado para " + item.chave + " (linha " + item.linha + " da aba Pagamentos Bonus) sem ninguém com essa identificação no fechamento");
    }

  });

  /* ---------- 4. Status ao vivo do setor x gravado ---------- */

  meses.forEach(function(mes){

    let status;

    try{
      status = calcularStatusSetores(mes);
    } catch(erro){
      aviso(mes, "não foi possível calcular o status ao vivo dos setores: " + erro.message);
      return;
    }

    const statusPorSetor = {};

    status.forEach(function(item){
      statusPorSetor[normalizarSetorKey(item.setor)] = item.status === true;
    });

    const id = String(fechadoPorMes[mes].linha[M_ID] || "");
    const setoresRecebidos = {};

    dadosFunc.forEach(function(linha){

      if(String(linha[F_ID] || "") !== id || c(linha[F_A_RECEBER]) <= 0){
        return;
      }

      setoresRecebidos[normalizarSetorKey(linha[F_SETOR])] = String(linha[F_SETOR]);

    });

    Object.keys(setoresRecebidos).forEach(function(setor){

      if(statusPorSetor.hasOwnProperty(setor) && statusPorSetor[setor] !== true){
        aviso(mes, "setor " + setoresRecebidos[setor] + " recebeu bônus no fechamento, mas a tela 'Desempenho dos setores' mostra 'meta não atingida' hoje");
      }

    });

  });

  /* ---------- Resultado ---------- */

  Logger.log("========== PROBLEMAS (valores/marcas que não batem): " + problemas.length + " ==========");
  problemas.forEach(function(texto){ Logger.log(texto); });

  Logger.log("========== AVISOS (conferir): " + avisos.length + " ==========");
  avisos.forEach(function(texto){ Logger.log(texto); });

  return { problemas: problemas, avisos: avisos };

}


/* =========================================================
   CORREÇÃO DE CONSISTÊNCIA — não muda nenhum valor a receber

   1. Quem tem valor a receber fica marcado como
      "setor atingiu" e "RH atingiu".
   2. Quantidade de funcionários do mês = linhas do fechamento.
   3. Abril/2026, Acabamento e Pintura: meta de prazo vazia
      (sem prazo apurado), para "Desempenho dos setores"
      mostrar o que o fechamento pagou.
   4. Teto da equipe regravado como 25% do salário.
      Quem recebeu acima aparece na tela como
      "Acima do teto de 25%".

   Como usar:
   1. Rode correcaoConsistenciaSimular() e confira o log.
   2. Se estiver correto, rode correcaoConsistenciaAplicar().
========================================================= */

function correcaoConsistenciaSimular(){
  return correcaoConsistencia_(false);
}

function correcaoConsistenciaAplicar(){
  return correcaoConsistencia_(true);
}

function correcaoConsistencia_(aplicar){

  const ANO = "2026";

  const F_ID = 0, F_NOME = 5, F_SALARIO = 8, F_TETO = 9, F_A_RECEBER = 11,
        F_SETOR_META = 15, F_RH_META = 16;

  const M_ID = 0, M_MES = 1, M_STATUS = 17, M_QTD = 18;

  function c(valor){
    return Math.round(Number(valor || 0) * 100);
  }

  function bool(valor){
    return valor === true || String(valor).trim().toUpperCase() === "TRUE";
  }

  const log = [];
  let marcacoes = 0, tetos = 0, acimaDoTeto = 0;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try{

    const estrutura = fechamentoCentralGarantirAbas_();
    const abaMeses = estrutura.abaMeses;
    const abaFunc = estrutura.abaFuncionarios;

    const dadosMeses = abaMeses.getRange(2, 1, abaMeses.getLastRow() - 1, 19).getValues();
    const dadosFunc = abaFunc.getRange(2, 1, abaFunc.getLastRow() - 1, 20).getValues();

    /* Último FECHADO de cada mês */
    const fechadoPorMes = {};

    dadosMeses.forEach(function(linha, i){
      const mes = String(linha[M_MES] || "").trim();
      if(mes.indexOf(ANO + "-") === 0 && String(linha[M_STATUS] || "").trim() === "FECHADO"){
        fechadoPorMes[mes] = { id: String(linha[M_ID] || ""), numeroLinha: i + 2, qtd: Number(linha[M_QTD] || 0) };
      }
    });

    Object.keys(fechadoPorMes).sort().forEach(function(mes){

      const registro = fechadoPorMes[mes];
      let quantidade = 0;

      dadosFunc.forEach(function(linha, i){

        if(String(linha[F_ID] || "") !== registro.id){
          return;
        }

        quantidade++;

        const numero = i + 2;
        const aReceber = c(linha[F_A_RECEBER]);
        const salario = c(linha[F_SALARIO]);

        /* 1. Marcações de meta para quem recebeu */
        if(aReceber > 0 && (!bool(linha[F_SETOR_META]) || !bool(linha[F_RH_META]))){

          marcacoes++;
          log.push(mes + " | " + linha[F_NOME] + ": marcado como setor e RH atingiram (recebeu)");

          if(aplicar){
            abaFunc.getRange(numero, F_SETOR_META + 1, 1, 2).setValues([[true, true]]);
          }

        }

        /* 4. Teto da equipe = 25% do salário */
        if(salario > 0){

          const teto25 = Math.round(salario * 0.25);

          if(c(linha[F_TETO]) !== teto25){

            tetos++;

            if(aplicar){
              abaFunc.getRange(numero, F_TETO + 1).setValue(teto25 / 100);
            }

          }

          if(aReceber > teto25){
            acimaDoTeto++;
            log.push(mes + " | " + linha[F_NOME] + ": a receber R$ " + (aReceber / 100).toFixed(2) +
              " fica acima do teto de 25% (R$ " + (teto25 / 100).toFixed(2) + ") — aparece como 'Acima do teto de 25%'");
          }

        }

      });

      /* 2. Quantidade de funcionários */
      if(registro.qtd !== quantidade){

        log.push(mes + " | quantidade de funcionários " + registro.qtd + " → " + quantidade);

        if(aplicar){
          abaMeses.getRange(registro.numeroLinha, M_QTD + 1).setValue(quantidade);
        }

      }

    });

    /* 3. Abril/2026 — Acabamento e Pintura sem meta de prazo */
    const abaMetas =
      SpreadsheetApp
        .openById("1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE")
        .getSheetByName("Metas");

    const metas = abaMetas.getDataRange().getValues();

    for(let i = 1; i < metas.length; i++){

      if(
        fechamentoCentralNormalizar_(metas[i][0]) === "abril" &&
        normalizarSetorKey(metas[i][1]) === normalizarSetorKey("Acabamento e Pintura")
      ){

        log.push("2026-04 | Metas (Operacional) linha " + (i + 1) +
          " | Acabamento e Pintura: meta de prazo " + (metas[i][5] === "" ? "vazia" : metas[i][5]) + " → vazia");

        if(aplicar){
          abaMetas.getRange(i + 1, 6).setValue("");
        }

      }

    }

    if(aplicar){
      SpreadsheetApp.flush();
    }

    Logger.log(
      (aplicar ? "APLICADO" : "SIMULAÇÃO — nada foi gravado") +
      " | " + marcacoes + " marcação(ões) de meta" +
      " | " + tetos + " teto(s) regravado(s) para 25%" +
      " | " + acimaDoTeto + " valor(es) acima do teto de 25%"
    );

    log.forEach(function(texto){ Logger.log(texto); });

    return log;

  } finally {

    lock.releaseLock();

  }

}
