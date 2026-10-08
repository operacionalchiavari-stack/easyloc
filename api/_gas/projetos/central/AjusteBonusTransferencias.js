/* =========================================================
   AJUSTE PONTUAL — BÔNUS A RECEBER CONFORME TRANSFERÊNCIAS

   O financeiro pagou os bônus, mas os valores calculados
   no fechamento ficaram diferentes do que foi transferido.

   Regra, por mês e por departamento (estofados/estrutura):
   - O valor transferido (informado abaixo) passa a ser o
     VALOR CALCULADO de cada funcionário do departamento.
   - Só muda quem tem VALOR A RECEBER (coluna L) maior que 0.
     Quem está com 0 continua com 0.
   - O a receber respeita o teto de 25% do salário (equipe):
     a receber = menor valor entre transferido e teto.
   - Supervisor e totais do mês são recalculados com a
     mesma fórmula do fechamento.
   - Não mexe nos valores pagos (aba "Pagamentos Bonus").

   Como usar:
   1. Rode ajusteBonusTransferenciasSimular() e confira o log.
   2. Se estiver correto, rode ajusteBonusTransferenciasAplicar().
========================================================= */

const AJUSTE_BONUS_TRANSFERENCIAS = {

  "2026-01": { estrutura: 76.58,  estofados: 154.48 },
  "2026-02": { estrutura: 150.72, estofados: 179.97 },
  "2026-03": { estrutura: 483.68, estofados: 224.42 },
  "2026-04": { estrutura: 324.00, estofados: 364.25 }

};

/*
  Exceção: departamentos que foram pagos mesmo com
  a receber 0 no fechamento. Nesses meses, todos do
  departamento recebem o valor transferido, ficam
  aptos e o motivo registra o ajuste.
*/
const AJUSTE_BONUS_INCLUIR_ZERADOS = {

  "2026-01": ["estofados"],
  "2026-02": ["estofados"]

};

/*
  Troca de pessoa no setor: quem "sai" fica zerado no mês
  (não estava no setor) e quem "entra" recebe o valor do
  departamento. Se quem entra não constar no fechamento,
  a linha é criada com CPF, cargo e salário da aba
  Funcionarios do Controle RH.
*/
/*
  Pessoas que receberam no mês mas estão zeradas no
  fechamento, em meses sem transferência informada.
  Recebem o mesmo valor que os colegas do departamento
  têm no mês (o valor mais comum entre quem é maior que 0).
*/
const AJUSTE_BONUS_INCLUIR_PESSOAS = [

  /* Abril: Lucas e Bruno (Acabamento e Pintura) receberam */
  { mes: "2026-04", nome: "Lucas Gomes" },
  { mes: "2026-04", nome: "Bruno Gomes" }

];

/*
  Meses em que a supervisora não recebeu bônus
  (Larissa só recebe a partir de maio/2026).
*/
const AJUSTE_BONUS_SUPERVISOR_ZERADO = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04"
];

const AJUSTE_BONUS_TROCAS = [

  /* Jan–mar: quem recebeu na Limpeza de Estofados foi o Jonathan */
  { mes: "2026-01", grupo: "estofados", sai: "Vitor Hugo",
    entra: "Jonathan Gomes", setor: "Limpeza de Estofados" },

  { mes: "2026-02", grupo: "estofados", sai: "Vitor Hugo",
    entra: "Jonathan Gomes", setor: "Limpeza de Estofados" },

  { mes: "2026-03", grupo: "estofados", sai: "Vitor Hugo",
    entra: "Jonathan Gomes", setor: "Limpeza de Estofados" },

  /* Abril: ninguém recebeu na Limpeza; Vitor recebe a partir de maio */
  { mes: "2026-04", grupo: "estofados", sai: "Vitor Hugo", entra: "" },

  /* ---------- Departamento de Manutenção (estrutura) ---------- */

  /* Brener não recebeu bônus em nenhum mês */
  { mes: "2026-01", grupo: "estrutura", sai: "Brener Amaral", entra: "", motivo: "Não recebeu bônus no mês" },
  { mes: "2026-02", grupo: "estrutura", sai: "Brener Amaral", entra: "", motivo: "Não recebeu bônus no mês" },
  { mes: "2026-03", grupo: "estrutura", sai: "Brener Amaral", entra: "", motivo: "Não recebeu bônus no mês" },
  { mes: "2026-04", grupo: "estrutura", sai: "Brener Amaral", entra: "", motivo: "Não recebeu bônus no mês" },
  { mes: "2026-05", grupo: "estrutura", sai: "Brener Amaral", entra: "", motivo: "Não recebeu bônus no mês" },
  { mes: "2026-06", grupo: "estrutura", sai: "Brener Amaral", entra: "", motivo: "Não recebeu bônus no mês" },
  { mes: "2026-07", grupo: "estrutura", sai: "Brener Amaral", entra: "", motivo: "Não recebeu bônus no mês" },
  { mes: "2026-08", grupo: "estrutura", sai: "Brener Amaral", entra: "", motivo: "Não recebeu bônus no mês" },

  /* Michael e Lucas Gomes só recebem a partir de março */
  { mes: "2026-01", grupo: "estrutura", sai: "Michael Figueira", entra: "", motivo: "Recebe bônus a partir de março/2026" },
  { mes: "2026-02", grupo: "estrutura", sai: "Michael Figueira", entra: "", motivo: "Recebe bônus a partir de março/2026" },
  { mes: "2026-01", grupo: "estrutura", sai: "Lucas Gomes", entra: "", motivo: "Recebe bônus a partir de março/2026" },
  { mes: "2026-02", grupo: "estrutura", sai: "Lucas Gomes", entra: "", motivo: "Recebe bônus a partir de março/2026" },

  /* Paulo Henrique recebeu de março a junho */
  { mes: "2026-03", grupo: "estrutura", sai: "", entra: "Paulo Henrique", setor: "Marcenaria" },
  { mes: "2026-04", grupo: "estrutura", sai: "", entra: "Paulo Henrique", setor: "Marcenaria" },
  { mes: "2026-05", grupo: "estrutura", sai: "", entra: "Paulo Henrique", setor: "Marcenaria" },
  { mes: "2026-06", grupo: "estrutura", sai: "", entra: "Paulo Henrique", setor: "Marcenaria" },

  /* Guilherme (Almoxarifado) entra no departamento em todos os meses fechados */
  { mes: "2026-01", grupo: "estrutura", sai: "", entra: "José Guilherme Azevedo", setor: "Almoxarifado" },
  { mes: "2026-02", grupo: "estrutura", sai: "", entra: "José Guilherme Azevedo", setor: "Almoxarifado" },
  { mes: "2026-03", grupo: "estrutura", sai: "", entra: "José Guilherme Azevedo", setor: "Almoxarifado" },
  { mes: "2026-04", grupo: "estrutura", sai: "", entra: "José Guilherme Azevedo", setor: "Almoxarifado" },
  { mes: "2026-05", grupo: "estrutura", sai: "", entra: "José Guilherme Azevedo", setor: "Almoxarifado" },
  { mes: "2026-06", grupo: "estrutura", sai: "", entra: "José Guilherme Azevedo", setor: "Almoxarifado" },
  { mes: "2026-07", grupo: "estrutura", sai: "", entra: "José Guilherme Azevedo", setor: "Almoxarifado" },
  { mes: "2026-08", grupo: "estrutura", sai: "", entra: "José Guilherme Azevedo", setor: "Almoxarifado" }

];

function ajusteBonusTransferenciasSimular(){

  return ajusteBonusTransferencias_(
    false
  );

}

function ajusteBonusTransferenciasAplicar(){

  return ajusteBonusTransferencias_(
    true
  );

}

function ajusteBonusTransferencias_(
  aplicar
){

  /* Aba "Fechamentos Funcionarios" (índices do array) */
  const F_ID = 0;
  const F_GRUPO = 3;
  const F_NOME = 5;
  const F_SETOR = 6;
  const F_TETO = 9;
  const F_CALCULADO = 10;
  const F_A_RECEBER = 11;
  const F_EXCEDENTE = 12;
  const F_NAO_DISTRIBUIDO = 13;
  const F_APTO = 14;
  const F_LIMITADO = 17;
  const F_MOTIVO = 18;

  /* Aba "Fechamentos Mensais" (índices do array) */
  const M_ID = 0;
  const M_MES = 1;
  const M_PERCENTUAL = 8;
  const M_SUPERVISOR = 9;
  const M_SALARIO_SUP = 10;
  const M_TETO_SUP = 11;
  const M_BASE = 12;
  const M_CALC_SUP = 13;
  const M_PAGO_SUP = 14;
  const M_TOTAL_FUNC = 15;
  const M_TOTAL_GERAL = 16;
  const M_STATUS = 17;

  function centavos(valor){

    return Math.max(
      0,
      Math.round(
        Number(valor || 0) * 100
      )
    );

  }

  function moeda(c){

    return "R$ " +
      (c / 100)
        .toFixed(2)
        .replace(".", ",");

  }

  const lock =
    LockService.getScriptLock();

  lock.waitLock(
    30000
  );

  try{

    const estrutura =
      fechamentoCentralGarantirAbas_();

    const abaMeses =
      estrutura.abaMeses;

    const abaFunc =
      estrutura.abaFuncionarios;

    const dadosMeses =
      abaMeses
        .getRange(2, 1, abaMeses.getLastRow() - 1, 19)
        .getValues();

    const dadosFunc =
      abaFunc
        .getRange(2, 1, abaFunc.getLastRow() - 1, 20)
        .getValues();

    const log = [];

    /* Meses com transferência informada ou com troca de pessoa */
    const mesesAjuste = {};

    Object.keys(AJUSTE_BONUS_TRANSFERENCIAS).forEach(function(mes){
      mesesAjuste[mes] = true;
    });

    AJUSTE_BONUS_TROCAS.forEach(function(troca){
      mesesAjuste[troca.mes] = true;
    });

    AJUSTE_BONUS_INCLUIR_PESSOAS.forEach(function(item){
      mesesAjuste[item.mes] = true;
    });

    AJUSTE_BONUS_SUPERVISOR_ZERADO.forEach(function(mes){
      mesesAjuste[mes] = true;
    });

    Object.keys(mesesAjuste)
      .sort()
      .forEach(function(mes){

        const valores =
          AJUSTE_BONUS_TRANSFERENCIAS[mes] || {};

        /* Último fechamento FECHADO do mês (mesma regra do sistema) */
        let indiceMes =
          -1;

        for(let i = dadosMeses.length - 1; i >= 0; i--){

          if(
            String(dadosMeses[i][M_MES] || "").trim() === mes &&
            String(dadosMeses[i][M_STATUS] || "").trim() === "FECHADO"
          ){
            indiceMes = i;
            break;
          }

        }

        if(indiceMes < 0){

          log.push(mes + " | mês não está fechado — nada alterado");
          return;

        }

        const linhaMes =
          dadosMeses[indiceMes];

        const idFechamento =
          String(linhaMes[M_ID] || "");

        log.push("===== " + mes + " (" + idFechamento + ") =====");

        let baseCentavos =
          0;

        const trocasMes =
          AJUSTE_BONUS_TROCAS.filter(function(troca){
            return troca.mes === mes;
          });

        const nomesQueSaem =
          trocasMes.map(function(troca){
            return troca.sai
              ? fechamentoCentralNormalizar_(troca.sai)
              : "__sem_nome__";
          });

        const nomesIncluidos =
          AJUSTE_BONUS_INCLUIR_PESSOAS
            .filter(function(item){ return item.mes === mes; })
            .map(function(item){ return fechamentoCentralNormalizar_(item.nome); })
            .concat(
              trocasMes
                .filter(function(troca){ return troca.entra; })
                .map(function(troca){ return fechamentoCentralNormalizar_(troca.entra); })
            );

        /*
          Valor calculado mais comum de cada departamento no mês,
          entre quem tem a receber > 0. O teto é aplicado depois,
          com o salário de cada pessoa.
        */
        const contagemValores = {};

        dadosFunc.forEach(function(linha){

          if(String(linha[F_ID] || "") !== idFechamento){
            return;
          }

          if(centavos(linha[F_A_RECEBER]) <= 0){
            return;
          }

          const valor =
            centavos(linha[F_CALCULADO]);

          const grupo =
            String(linha[F_GRUPO] || "").trim().toLowerCase();

          contagemValores[grupo] = contagemValores[grupo] || {};
          contagemValores[grupo][valor] = (contagemValores[grupo][valor] || 0) + 1;

        });

        function valorComumDoGrupo(grupo){

          const contagem =
            contagemValores[grupo] || {};

          let melhor = null;

          Object.keys(contagem).forEach(function(valor){
            if(melhor === null || contagem[valor] > contagem[melhor]){
              melhor = valor;
            }
          });

          return melhor === null ? null : Number(melhor) / 100;

        }

        const nomesNoFechamento = {};
        let maiorOrdem = 0;

        dadosFunc.forEach(function(linha, i){

          if(String(linha[F_ID] || "") !== idFechamento){
            return;
          }

          nomesNoFechamento[
            fechamentoCentralNormalizar_(linha[F_NOME])
          ] = true;

          maiorOrdem =
            Math.max(maiorOrdem, Number(linha[2] || 0));

          /* Quem não estava no setor no mês fica zerado */
          if(
            nomesQueSaem.indexOf(
              fechamentoCentralNormalizar_(linha[F_NOME])
            ) >= 0
          ){

            const troca =
              trocasMes[
                nomesQueSaem.indexOf(
                  fechamentoCentralNormalizar_(linha[F_NOME])
                )
              ];

            log.push(
              String(linha[F_GRUPO] || "").toLowerCase() + " | " +
              linha[F_NOME] + " (" + linha[F_SETOR] + ")" +
              " | calculado " + moeda(centavos(linha[F_CALCULADO])) +
              " → R$ 0,00 | a receber " + moeda(centavos(linha[F_A_RECEBER])) +
              " → R$ 0,00 (" +
              (troca.motivo ||
                ("não estava no setor" +
                  (troca.entra ? "; quem recebeu foi " + troca.entra : ""))) + ")"
            );

            if(aplicar){

              const numeroLinha =
                i + 2;

              abaFunc
                .getRange(numeroLinha, F_CALCULADO + 1, 1, 4)
                .setValues([[0, 0, 0, 0]]);

              abaFunc
                .getRange(numeroLinha, F_APTO + 1)
                .setValue(false);

              abaFunc
                .getRange(numeroLinha, F_LIMITADO + 1)
                .setValue(false);

              abaFunc
                .getRange(numeroLinha, F_MOTIVO + 1)
                .setValue(
                  troca.motivo ||
                  ("Não estava no setor no mês" +
                    (troca.entra ? " (quem recebeu foi " + troca.entra + ")" : ""))
                );

            }

            return;

          }

          const grupo =
            String(linha[F_GRUPO] || "").trim().toLowerCase();

          const aReceberAtual =
            centavos(linha[F_A_RECEBER]);

          const pessoaIncluida =
            aReceberAtual <= 0 &&
            nomesIncluidos.some(function(nomeIncluido){
              return nomeCorrespondeAjuste_(linha[F_NOME], nomeIncluido);
            });

          const transferido =
            valores[grupo] !== undefined
              ? valores[grupo]
              : (pessoaIncluida ? valorComumDoGrupo(grupo) : undefined);

          const incluirZerado =
            pessoaIncluida ||
            (AJUSTE_BONUS_INCLUIR_ZERADOS[mes] || [])
              .indexOf(grupo) >= 0;

          if(
            transferido === undefined ||
            transferido === null ||
            (aReceberAtual <= 0 && !incluirZerado)
          ){

            if(
              aReceberAtual <= 0 &&
              transferido !== undefined &&
              transferido !== null
            ){

              log.push(
                grupo + " | " +
                linha[F_NOME] + " (" + linha[F_SETOR] + ")" +
                " | mantido em R$ 0,00" +
                (linha[F_MOTIVO] ? " — " + linha[F_MOTIVO] : "")
              );

            }

            baseCentavos += aReceberAtual;
            return;

          }

          const eraZerado =
            aReceberAtual <= 0;

          const novoCalculado =
            centavos(transferido);

          const teto =
            centavos(linha[F_TETO]);

          const limitado =
            teto > 0 &&
            novoCalculado > teto;

          const novoAReceber =
            limitado
              ? teto
              : novoCalculado;

          const excedente =
            limitado
              ? novoCalculado - teto
              : 0;

          baseCentavos += novoAReceber;

          log.push(
            grupo + " | " +
            linha[F_NOME] + " (" + linha[F_SETOR] + ")" +
            " | calculado " + moeda(centavos(linha[F_CALCULADO])) +
            " → " + moeda(novoCalculado) +
            " | a receber " + moeda(aReceberAtual) +
            " → " + moeda(novoAReceber) +
            (limitado ? " (limitado pelo teto " + moeda(teto) + ")" : "") +
            (eraZerado ? " (exceção: estava zerado)" : "")
          );

          if(aplicar){

            const numeroLinha =
              i + 2;

            abaFunc
              .getRange(numeroLinha, F_CALCULADO + 1, 1, 4)
              .setValues([[
                novoCalculado / 100,
                novoAReceber / 100,
                excedente / 100,
                (novoCalculado - novoAReceber) / 100
              ]]);

            abaFunc
              .getRange(numeroLinha, F_LIMITADO + 1)
              .setValue(limitado);

            if(eraZerado){

              abaFunc
                .getRange(numeroLinha, F_APTO + 1)
                .setValue(true);

              abaFunc
                .getRange(numeroLinha, F_MOTIVO + 1)
                .setValue(
                  "Ajustado conforme transferência" +
                  (linha[F_MOTIVO] ? " (antes: " + linha[F_MOTIVO] + ")" : "")
                );

            }

          }

        });

        /* Quem entra no setor e ainda não consta no fechamento */
        trocasMes.forEach(function(troca){

          if(
            !troca.entra ||
            Object.keys(nomesNoFechamento).some(function(nome){
              return nomeCorrespondeAjuste_(nome, troca.entra);
            })
          ){
            return;
          }

          const transferido =
            valores[troca.grupo] !== undefined
              ? valores[troca.grupo]
              : valorComumDoGrupo(troca.grupo);

          if(transferido === undefined || transferido === null){
            log.push(troca.entra + " | sem valor de transferência para " + troca.grupo + " — não incluído");
            return;
          }

          const cadastro =
            buscarCadastroFuncionarioAjuste_(troca.entra);

          const setorEntrada =
            troca.setor ||
            (cadastro ? cadastro.setor : "");

          const novoCalculado =
            centavos(transferido);

          const salario =
            cadastro ? centavos(cadastro.salario) : 0;

          const teto =
            Math.round(salario * 0.25);

          const limitado =
            teto > 0 &&
            novoCalculado > teto;

          const novoAReceber =
            limitado ? teto : novoCalculado;

          baseCentavos += novoAReceber;

          maiorOrdem++;

          log.push(
            troca.grupo + " | " + troca.entra + " (" + setorEntrada + ")" +
            " | NOVO no fechamento | a receber " + moeda(novoAReceber) +
            (limitado ? " (limitado pelo teto " + moeda(teto) + ")" : "") +
            (cadastro
              ? " | CPF " + (cadastro.cpf || "vazio") + ", salário " + moeda(salario)
              : " | não encontrado na aba Funcionarios: CPF e salário vazios, sem teto")
          );

          if(aplicar){

            abaFunc.appendRow([
              idFechamento,
              mes,
              maiorOrdem,
              troca.grupo,
              cadastro ? cadastro.cpf : "",
              troca.entra,
              setorEntrada,
              cadastro ? cadastro.cargo : "",
              salario / 100,
              teto / 100,
              novoCalculado / 100,
              novoAReceber / 100,
              limitado ? (novoCalculado - teto) / 100 : 0,
              (novoCalculado - novoAReceber) / 100,
              true,
              "",
              "",
              limitado,
              troca.sai
                ? "Incluído conforme transferência (substituiu " + troca.sai + " no setor)"
                : "Incluído: recebeu bônus no mês",
              linhaMes[2]
            ]);

          }

        });

        /* Supervisor e totais — mesma fórmula do fechamento */
        const percentual =
          fechamentoCentralPercentual_(linhaMes[M_PERCENTUAL]);

        const salarioSup =
          centavos(linhaMes[M_SALARIO_SUP]);

        const tetoSup =
          centavos(linhaMes[M_TETO_SUP]);

        const supervisorZerado =
          AJUSTE_BONUS_SUPERVISOR_ZERADO.indexOf(mes) >= 0;

        const calcSup =
          supervisorZerado
            ? 0
            : Math.max(
                0,
                Math.round(baseCentavos * (percentual / 100))
              );

        const pagoSup =
          salarioSup > 0
            ? Math.min(calcSup, tetoSup)
            : 0;

        if(supervisorZerado){
          log.push("supervisor sem bônus neste mês (recebe a partir de maio/2026)");
        }

        log.push(
          "supervisor " + (linhaMes[M_SUPERVISOR] || "-") +
          " (" + percentual + "%)" +
          " | base " + moeda(centavos(linhaMes[M_BASE])) +
          " → " + moeda(baseCentavos) +
          " | a receber " + moeda(centavos(linhaMes[M_PAGO_SUP])) +
          " → " + moeda(pagoSup)
        );

        log.push(
          "total geral do mês " + moeda(centavos(linhaMes[M_TOTAL_GERAL])) +
          " → " + moeda(baseCentavos + pagoSup)
        );

        if(aplicar){

          abaMeses
            .getRange(indiceMes + 2, M_BASE + 1, 1, 5)
            .setValues([[
              baseCentavos / 100,
              calcSup / 100,
              pagoSup / 100,
              baseCentavos / 100,
              (baseCentavos + pagoSup) / 100
            ]]);

        }

      });

    if(aplicar){
      SpreadsheetApp.flush();
    }

    Logger.log(
      aplicar
        ? "APLICADO"
        : "SIMULAÇÃO — nada foi gravado"
    );

    log.forEach(function(texto){
      Logger.log(texto);
    });

    return log;

  } finally {

    lock.releaseLock();

  }

}


/* =========================================================
   CADASTRO NA ABA "Funcionarios" (Controle RH)
   A = Nome, B = Sobrenome, C = CPF, D = Setor,
   E = Cargo, F = Salário Bruto
========================================================= */

function buscarCadastroFuncionarioAjuste_(nomeCompleto){

  const aba =
    SpreadsheetApp
      .openById(COMISSAO_FUNCIONARIOS_PLANILHA_ID)
      .getSheetByName(COMISSAO_FUNCIONARIOS_ABA);

  if(!aba || aba.getLastRow() < 2){
    return null;
  }

  const intervalo =
    aba.getRange(2, 1, aba.getLastRow() - 1, 6);

  const exibidos =
    intervalo.getDisplayValues();

  const reais =
    intervalo.getValues();

  const alvo =
    fechamentoCentralNormalizar_(nomeCompleto);

  for(let i = 0; i < exibidos.length; i++){

    const nome =
      fechamentoCentralNormalizar_(
        exibidos[i][0] + " " + exibidos[i][1]
      );

    /* Aceita o nome completo ou nome + início do sobrenome */
    if(nome === alvo || nome.indexOf(alvo + " ") === 0){

      return {
        cpf: String(exibidos[i][2] || "").trim(),
        setor: String(exibidos[i][3] || "").trim(),
        cargo: String(exibidos[i][4] || "").trim(),
        salario: converterSalarioComissaoCentral_(reais[i][5], exibidos[i][5])
      };

    }

  }

  /* Não achou: lista nomes parecidos para conferência */
  const primeiroNome =
    alvo.split(" ")[0];

  const parecidos =
    exibidos
      .map(function(linha){ return String(linha[0] + " " + linha[1]).trim(); })
      .filter(function(nome){
        return fechamentoCentralNormalizar_(nome).indexOf(primeiroNome.slice(0, 4)) >= 0;
      });

  Logger.log(
    "cadastro | '" + nomeCompleto + "' não encontrado na aba Funcionarios" +
    (parecidos.length ? " | parecidos: " + parecidos.join(", ") : " | nenhum nome parecido")
  );

  return null;

}


/* =========================================================
   DIAGNÓSTICO — como o painel de pagamentos enxerga uma
   pessoa (somente leitura)
========================================================= */

function diagnosticoPainelVitor(){

  liberarAcessoInterno_();


  const alvo = "vitor";

  /* 1. Linhas gravadas no fechamento, com CPF e chave */
  const estrutura =
    fechamentoCentralGarantirAbas_();

  const aba =
    estrutura.abaFuncionarios;

  aba
    .getRange(2, 1, aba.getLastRow() - 1, 12)
    .getDisplayValues()
    .forEach(function(linha, i){

      if(fechamentoCentralNormalizar_(linha[5]).indexOf(alvo) < 0){
        return;
      }

      Logger.log(
        "fechamento | linha " + (i + 2) +
        " | " + linha[1] +
        " | id " + linha[0] +
        " | CPF [" + linha[4] + "]" +
        " | chave " + pagamentosBonusChaveFuncionario_(linha[4], linha[5]) +
        " | a receber " + linha[11]
      );

    });

  /* 2. O que o painel monta */
  const painel =
    pagamentosBonusCentralObter("2026");

  painel.pessoas.forEach(function(pessoa){

    if(fechamentoCentralNormalizar_(pessoa.nome).indexOf(alvo) < 0){
      return;
    }

    Logger.log(
      "painel | " + pessoa.nome +
      " | chave " + pessoa.chave +
      " | grupo " + pessoa.grupo +
      " | valores " + JSON.stringify(pessoa.valores)
    );

  });

  /* 3. Meses que o painel considera (id por mês) */
  painel.meses.forEach(function(item){
    Logger.log("painel mês | " + item.mes + " | id " + item.idFechamento);
  });

}


/* Nome igual, ou nome informado + restante do sobrenome */
function nomeCorrespondeAjuste_(nomeLinha, nomeInformado){

  const linha =
    fechamentoCentralNormalizar_(nomeLinha);

  const informado =
    fechamentoCentralNormalizar_(nomeInformado);

  return (
    linha === informado ||
    linha.indexOf(informado + " ") === 0
  );

}
