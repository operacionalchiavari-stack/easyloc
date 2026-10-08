/* =========================================================
   DISTRIBUIÇÃO DE COMISSÕES — CENTRAL DE METAS
========================================================= */

/*
  Planilha de funcionários:
  https://docs.google.com/spreadsheets/d/
  1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo
*/

const COMISSAO_FUNCIONARIOS_PLANILHA_ID =
  "1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo";

const COMISSAO_FUNCIONARIOS_ABA =
  "Funcionarios";

const COMISSAO_FUNCIONARIOS_GID =
  1479697495;


/* =========================================================
   LISTAR FUNCIONÁRIOS DOS DOIS GRUPOS
========================================================= */

function listarFuncionariosDistribuicaoCentral(mesFiltro){

  exigirAcessoCentral_();


  try{

    const mesSeguro =
      mesFiltro ||
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM"
      );

    /*
      1. Busca o resultado operacional
      de todos os setores.
    */
    const resultadoSetores =
      calcularStatusSetores(
        mesSeguro
      );

    /*
      2. Busca a avaliação individual
      de RH de todos os funcionários.
    */
    const resultadoRH =
      getAvaliacaoIndividualRH(
        mesSeguro
      );

    const mapaSetores = {};
    const mapaRH = {};

    /*
      Cria o mapa de avaliação dos setores.
    */
    (
      Array.isArray(resultadoSetores)
        ? resultadoSetores
        : []
    ).forEach(function(item){

      const chaveSetor =
        normalizarSetorComissaoCentral_(
          item.setor
        );

      if(!chaveSetor){
        return;
      }

      mapaSetores[chaveSetor] = {

        atingiuMeta:
          item.status === true,

        motivos:
          identificarMotivosSetorComissaoCentral_(
            item
          )

      };

    });

    /*
      Cria o mapa de avaliação individual
      dos funcionários.
    */
    (
      Array.isArray(resultadoRH)
        ? resultadoRH
        : []
    ).forEach(function(item){

      const chaveNome =
        normalizarTextoComissaoCentral_(
          item.nome
        );

      const chaveSetor =
        normalizarSetorComissaoCentral_(
          item.setor
        );

      if(!chaveNome){
        return;
      }

      const chaveCompleta =
        chaveNome +
        "|" +
        chaveSetor;

      mapaRH[chaveCompleta] =
        item;

      /*
        Mantém também uma busca somente
        pelo nome como alternativa.
      */
      if(!mapaRH[chaveNome]){

        mapaRH[chaveNome] =
          item;

      }

    });

    const ss =
      SpreadsheetApp.openById(
        COMISSAO_FUNCIONARIOS_PLANILHA_ID
      );

    let aba =
      ss.getSheetByName(
        COMISSAO_FUNCIONARIOS_ABA
      );

    if(!aba){

      aba =
        ss.getSheets().find(
          function(sheet){

            return (
              sheet.getSheetId() ===
              COMISSAO_FUNCIONARIOS_GID
            );

          }
        );

    }

    if(!aba){

      throw new Error(
        'A aba "Funcionarios" não foi encontrada.'
      );

    }

    const ultimaLinha =
      aba.getLastRow();

    if(ultimaLinha < 2){

      return {

        ok: true,
        mes: mesSeguro,

        estofados: [],
        estrutura: [],

        totalEstofados: 0,
        totalEstrutura: 0,

        aptosEstofados: 0,
        aptosEstrutura: 0

      };

    }

/*
  Estrutura da aba Funcionarios:

  A = Nome
  B = Sobrenome
  C = CPF
  D = Setor
  E = Cargo
  F = Salário Bruto
*/
const intervaloFuncionarios =
  aba.getRange(
    2,
    1,
    ultimaLinha - 1,
    6
  );

/*
  Usa os valores exibidos para preservar
  CPF, nomes e textos exatamente como
  aparecem na planilha.
*/
const dadosExibidos =
  intervaloFuncionarios
    .getDisplayValues();

/*
  Usa os valores reais principalmente
  para ler corretamente o salário.
*/
const dadosReais =
  intervaloFuncionarios
    .getValues();

    const estofados = [];
    const estrutura = [];

    const registrosIncluidos =
      new Set();

dadosExibidos.forEach(function(
  linha,
  indiceLinha
){

  const linhaReal =
    dadosReais[indiceLinha] || [];

      const primeiroNome =
        String(
          linha[0] || ""
        ).trim();

      const sobrenome =
        String(
          linha[1] || ""
        ).trim();

      const cpf =
        String(
          linha[2] || ""
        ).trim();

const setor =
  String(
    linha[3] || ""
  ).trim();

const cargo =
  String(
    linha[4] || ""
  ).trim();

const salarioBruto =
  converterSalarioComissaoCentral_(
    linhaReal[5],
    linha[5]
  );

/*
  Cada funcionário pode receber no máximo
  25% do próprio salário bruto.
  (O supervisor tem teto de 30%.)
*/
const tetoBonus =
  Number(
    (
      salarioBruto * 0.25
    ).toFixed(2)
  );

      const nomeCompleto =
        [
          primeiroNome,
          sobrenome
        ]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

      if(!nomeCompleto || !setor){
        return;
      }

      const grupo =
        classificarGrupoComissaoCentral_(
          setor
        );

      if(!grupo){
        return;
      }

      const chaveDuplicidade =
        cpf
          ? normalizarCPFComissaoCentral_(
              cpf
            )
          : normalizarTextoComissaoCentral_(
              nomeCompleto +
              "|" +
              setor
            );

      if(
        chaveDuplicidade &&
        registrosIncluidos.has(
          chaveDuplicidade
        )
      ){
        return;
      }

      if(chaveDuplicidade){

        registrosIncluidos.add(
          chaveDuplicidade
        );

      }

      const chaveNome =
        normalizarTextoComissaoCentral_(
          nomeCompleto
        );

      const chaveSetor =
        normalizarSetorComissaoCentral_(
          setor
        );

      const chaveCompleta =
        chaveNome +
        "|" +
        chaveSetor;

      const avaliacaoSetor =
        mapaSetores[chaveSetor] ||
        null;

      const avaliacaoIndividual =
        mapaRH[chaveCompleta] ||
        mapaRH[chaveNome] ||
        null;

      /*
        PRIMEIRA REGRA:
        o setor precisa atingir a meta.
      */
      const setorAtingiuMeta =
        avaliacaoSetor !== null &&
        avaliacaoSetor.atingiuMeta === true;

      /*
        SEGUNDA REGRA:
        o funcionário precisa atingir
        a meta individual de RH.
      */
      const rhAtingiuMeta =
        avaliacaoIndividual !== null &&
        avaliacaoIndividual.apto === true;

      const aptoBonus =
        setorAtingiuMeta &&
        rhAtingiuMeta;

      let motivoBonus = "";

      /*
        A ordem das verificações é importante:
        primeiro setor, depois RH.
      */
      if(!avaliacaoSetor){

        motivoBonus =
          "Setor sem avaliação no mês";

      } else if(!setorAtingiuMeta){

        const motivosSetor =
          Array.isArray(
            avaliacaoSetor.motivos
          )
            ? avaliacaoSetor.motivos
            : [];

        motivoBonus =
          motivosSetor.length
            ? "Setor: " +
              motivosSetor.join(", ")
            : "Setor não atingiu a meta";

      } else if(!avaliacaoIndividual){

        motivoBonus =
          "RH: avaliação não encontrada";

      } else if(!rhAtingiuMeta){

        const motivosRH =
          identificarMotivosRHComissaoCentral_(
            avaliacaoIndividual
          );

        motivoBonus =
          motivosRH.length
            ? "RH: " +
              motivosRH.join(", ")
            : "RH: meta individual não atingida";

      }

      const funcionario = {

        nome:
          nomeCompleto,

        nomeCompleto:
          nomeCompleto,

        primeiroNome:
          primeiroNome,

        sobrenome:
          sobrenome,

cpf:
  cpf,

setor:
  setor,

cargo:
  cargo,

salarioBruto:
  salarioBruto,

tetoBonus:
  tetoBonus,

setorAtingiuMeta:
  setorAtingiuMeta,

        rhAtingiuMeta:
          rhAtingiuMeta,

        aptoBonus:
          aptoBonus,

        motivoBonus:
          motivoBonus

      };

      if(grupo === "estofados"){

        estofados.push(
          funcionario
        );

      }

      if(grupo === "estrutura"){

        estrutura.push(
          funcionario
        );

      }

    });

    estofados.sort(function(a, b){

      return a.nome.localeCompare(
        b.nome,
        "pt-BR"
      );

    });

    estrutura.sort(function(a, b){

      return a.nome.localeCompare(
        b.nome,
        "pt-BR"
      );

    });

    const aptosEstofados =
      estofados.filter(
        function(funcionario){

          return (
            funcionario.aptoBonus === true
          );

        }
      ).length;

    const aptosEstrutura =
      estrutura.filter(
        function(funcionario){

          return (
            funcionario.aptoBonus === true
          );

        }
      ).length;

    return {

      ok:
        true,

      mes:
        mesSeguro,

      estofados:
        estofados,

      estrutura:
        estrutura,

      totalEstofados:
        estofados.length,

      totalEstrutura:
        estrutura.length,

      aptosEstofados:
        aptosEstofados,

      aptosEstrutura:
        aptosEstrutura

    };

  } catch(erro){

    throw new Error(
      "Erro ao carregar funcionários: " +
      erro.message
    );

  }

}


/* =========================================================
   CLASSIFICAR FUNCIONÁRIO POR GRUPO
========================================================= */

function classificarGrupoComissaoCentral_(setor){

  const texto =
    normalizarTextoComissaoCentral_(
      setor
    );

  /*
    CARD 1 — ESTOFADOS

    Inclui:
    - Forração
    - Costura
    - Limpeza de Estofados
  */
  if(
    texto.includes("limpeza") ||
    texto.includes("forracao") ||
    texto.includes("costura") ||
    texto === "estofados" ||
    texto === "estofado"
  ){
    return "estofados";
  }

  /*
    CARD 2 — ESTRUTURA

    Inclui:
    - Solda
    - Acabamento e Pintura
    - Marcenaria
  */
  if(
    texto.includes("solda") ||
    texto.includes("acabamento") ||
    texto.includes("pintura") ||
    texto.includes("marcenaria")
  ){
    return "estrutura";
  }

  /*
    Outros setores, como:
    - Setor 01
    - Montagem
    - Almoxarifado

    não entram nos cards.
  */
  return "";
}


/* =========================================================
   NORMALIZAR TEXTO
========================================================= */

function normalizarTextoComissaoCentral_(valor){

  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


/* =========================================================
   NORMALIZAR CPF
========================================================= */

function normalizarCPFComissaoCentral_(cpf){

  return String(cpf || "")
    .replace(/\D/g, "")
    .trim();
}
function normalizarSetorComissaoCentral_(
  setor
){

  const texto =
    normalizarTextoComissaoCentral_(
      setor
    );

  if(
    texto.includes(
      "marcenaria"
    )
  ){
    return "marcenaria";
  }

  if(
    texto.includes(
      "acabamento"
    ) ||
    texto.includes(
      "pintura"
    )
  ){
    return "acabamento e pintura";
  }

  if(
    texto.includes(
      "solda"
    )
  ){
    return "solda";
  }

  if(
    texto.includes(
      "costura"
    )
  ){
    return "costura";
  }

  if(
    texto.includes(
      "forracao"
    )
  ){
    return "forracao";
  }

  if(
    texto.includes(
      "limpeza"
    ) &&
    texto.includes(
      "estof"
    )
  ){
    return "limpeza de estofados";
  }

  return texto;

}


function identificarMotivosSetorComissaoCentral_(
  avaliacao
){

  if(!avaliacao){
    return [];
  }

  const motivos = [];

  const producao =
    Number(
      avaliacao.producao || 0
    );

  const metaProducao =
    Number(
      avaliacao.metaProducao || 0
    );

  const qualidade =
    Number(
      avaliacao.qualidade || 0
    );

  const metaQualidade =
    Number(
      avaliacao.metaQualidade || 0
    );

  const prazo =
    Number(
      avaliacao.prazo || 0
    );

  const metaPrazo =
    Number(
      avaliacao.metaPrazo || 0
    );

  const tempo =
    Number(
      avaliacao.tempo || 0
    );

  const metaTempo =
    Number(
      avaliacao.metaTempo || 0
    );

  const gasto =
    Number(
      avaliacao.gasto || 0
    );

  const limiteGasto =
    Number(
      avaliacao.metaGasto || 0
    ) > 0
      ? Number(
          avaliacao.metaGasto
        )
      : 100;

  if(
    metaProducao > 0 &&
    producao < metaProducao
  ){

    motivos.push(
      "produção abaixo da meta"
    );

  }

  if(
    metaQualidade > 0 &&
    qualidade < metaQualidade
  ){

    motivos.push(
      "qualidade abaixo da meta"
    );

  }

  if(
    metaPrazo > 0 &&
    prazo < metaPrazo
  ){

    motivos.push(
      "prazo abaixo da meta"
    );

  }

  if(
    metaTempo > 0 &&
    tempo > metaTempo
  ){

    motivos.push(
      "tempo acima da meta"
    );

  }

  /*
    Ao atingir exatamente 100%,
    o gasto já reprova o setor.
  */
  if(
    gasto >= limiteGasto
  ){

    motivos.push(
      "gasto no limite ou acima"
    );

  }

  if(
    avaliacao.status !== true &&
    motivos.length === 0
  ){

    motivos.push(
      "meta operacional não atingida"
    );

  }

  return motivos;

}


function identificarMotivosRHComissaoCentral_(
  avaliacao
){

  if(!avaliacao){
    return [];
  }

  const motivos = [];

  if(
    Number(
      avaliacao.atraso || 0
    ) >
    Number(
      avaliacao.metaAtraso || 0
    )
  ){

    motivos.push(
      "atraso acima da meta"
    );

  }

  if(
    Number(
      avaliacao.semUniforme || 0
    ) >
    Number(
      avaliacao.metaSemUniforme || 0
    )
  ){

    motivos.push(
      "sem uniforme acima da meta"
    );

  }

  if(
    Number(
      avaliacao.semEpi || 0
    ) >
    Number(
      avaliacao.metaSemEpi || 0
    )
  ){

    motivos.push(
      "sem EPI acima da meta"
    );

  }

  if(
    Number(
      avaliacao.usoCelular || 0
    ) >
    Number(
      avaliacao.metaUsoCelular || 0
    )
  ){

    motivos.push(
      "uso de celular acima da meta"
    );

  }

  if(
    Number(
      avaliacao.falta || 0
    ) >
    Number(
      avaliacao.metaFalta || 0
    )
  ){

    motivos.push(
      "falta acima da meta"
    );

  }

  if(
    Number(
      avaliacao.advertencia || 0
    ) >
    Number(
      avaliacao.metaAdvertencia || 0
    )
  ){

    motivos.push(
      "advertência acima da meta"
    );

  }

  if(
    Number(
      avaliacao.ausenciaJornada || 0
    ) >
    Number(
      avaliacao.metaAusenciaJornada || 0
    )
  ){

    motivos.push(
      "ausência de jornada acima da meta"
    );

  }

  return motivos;

}

/* =========================================================
   FUNÇÃO DE TESTE
========================================================= */

function testarFuncionariosDistribuicaoCentral(){

  liberarAcessoInterno_();


  const resultado =
    listarFuncionariosDistribuicaoCentral();

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
   PERCENTUAL DO SUPERVISOR
========================================================= */

function getPercentualSupervisorComissaoCentral(){

  exigirAcessoCentral_();


  const ID_PLANILHA_COMISSOES =
    "1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE";

  const NOME_ABA_COMISSOES =
    "Comissão O.S";

  const CARGO_SUPERVISOR =
    "supervisor departamento de manutencao";

  try{

    /* =====================================================
       1. BUSCAR PERCENTUAL DA SUPERVISÃO
    ===================================================== */

    const ssComissoes =
      SpreadsheetApp.openById(
        ID_PLANILHA_COMISSOES
      );

    let abaComissoes =
      ssComissoes.getSheetByName(
        NOME_ABA_COMISSOES
      );

    if(!abaComissoes){

      abaComissoes =
        ssComissoes
          .getSheets()
          .find(function(sheet){

            return (
              normalizarTextoComissaoCentral_(
                sheet.getName()
              ) ===
              "comissao o.s"
            );

          });

    }

    if(!abaComissoes){

      throw new Error(
        'A aba "Comissão O.S" não foi encontrada.'
      );

    }

    const ultimaLinhaComissao =
      abaComissoes.getLastRow();

    if(ultimaLinhaComissao < 2){

      throw new Error(
        'A aba "Comissão O.S" não possui dados.'
      );

    }

    const intervaloComissoes =
      abaComissoes.getRange(
        2,
        1,
        ultimaLinhaComissao - 1,
        2
      );

    const valoresComissoesReais =
      intervaloComissoes.getValues();

    const valoresComissoesExibidos =
      intervaloComissoes.getDisplayValues();

    let percentualSupervisor = null;
    let linhaPercentual = 0;

    for(
      let i = 0;
      i < valoresComissoesReais.length;
      i++
    ){

      const descricao =
        normalizarTextoComissaoCentral_(
          valoresComissoesExibidos[i][0] ||
          valoresComissoesReais[i][0]
        );

      if(
        descricao !== "supervisao" &&
        !descricao.includes("supervisao")
      ){
        continue;
      }

      const valorReal =
        valoresComissoesReais[i][1];

      const valorExibido =
        String(
          valoresComissoesExibidos[i][1] ||
          ""
        ).trim();

      if(valorExibido.includes("%")){

        const textoPercentual =
          valorExibido
            .replace("%", "")
            .replace(/\s/g, "")
            .replace(/\./g, "")
            .replace(",", ".");

        percentualSupervisor =
          Number(textoPercentual);

      } else if(
        typeof valorReal === "number"
      ){

        percentualSupervisor =
          valorReal > 0 &&
          valorReal <= 1
            ? valorReal * 100
            : valorReal;

      } else {

        const numero =
          Number(
            String(
              valorReal ||
              valorExibido ||
              ""
            )
              .replace(/\s/g, "")
              .replace(/\./g, "")
              .replace(",", ".")
          );

        percentualSupervisor =
          numero > 0 &&
          numero <= 1
            ? numero * 100
            : numero;

      }

      linhaPercentual =
        i + 2;

      break;

    }

    if(
      percentualSupervisor === null ||
      !isFinite(percentualSupervisor) ||
      percentualSupervisor < 0
    ){

      throw new Error(
        'O percentual da linha "Supervisão" não foi encontrado.'
      );

    }

    /* =====================================================
       2. BUSCAR SUPERVISOR E SALÁRIO
    ===================================================== */

    const ssFuncionarios =
      SpreadsheetApp.openById(
        COMISSAO_FUNCIONARIOS_PLANILHA_ID
      );

    let abaFuncionarios =
      ssFuncionarios.getSheetByName(
        COMISSAO_FUNCIONARIOS_ABA
      );

    if(!abaFuncionarios){

      abaFuncionarios =
        ssFuncionarios
          .getSheets()
          .find(function(sheet){

            return (
              sheet.getSheetId() ===
              COMISSAO_FUNCIONARIOS_GID
            );

          });

    }

    if(!abaFuncionarios){

      throw new Error(
        'A aba "Funcionarios" não foi encontrada.'
      );

    }

    const ultimaLinhaFuncionarios =
      abaFuncionarios.getLastRow();

    if(ultimaLinhaFuncionarios < 2){

      throw new Error(
        "Não existem funcionários cadastrados."
      );

    }

    /*
      A = Nome
      B = Sobrenome
      C = CPF
      D = Setor
      E = Cargo
      F = Salário Bruto
    */
    const intervaloFuncionarios =
      abaFuncionarios.getRange(
        2,
        1,
        ultimaLinhaFuncionarios - 1,
        6
      );

    const funcionariosReais =
      intervaloFuncionarios.getValues();

    const funcionariosExibidos =
      intervaloFuncionarios.getDisplayValues();

    let nomeSupervisor = "";
    let salarioSupervisor = 0;
    let linhaSupervisor = 0;

    for(
      let i = 0;
      i < funcionariosExibidos.length;
      i++
    ){

      const cargo =
        normalizarTextoComissaoCentral_(
          funcionariosExibidos[i][4] ||
          funcionariosReais[i][4]
        );

      /*
        Procura a linha cuja coluna E contém:

        Supervisor Departamento de Manutenção
      */
      if(
        cargo !== CARGO_SUPERVISOR &&
        !(
          cargo.includes("supervisor") &&
          cargo.includes(
            "departamento de manutencao"
          )
        )
      ){
        continue;
      }

      const nome =
        String(
          funcionariosExibidos[i][0] ||
          funcionariosReais[i][0] ||
          ""
        ).trim();

      const sobrenome =
        String(
          funcionariosExibidos[i][1] ||
          funcionariosReais[i][1] ||
          ""
        ).trim();

      nomeSupervisor =
        [nome, sobrenome]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

      salarioSupervisor =
        converterSalarioComissaoCentral_(
          funcionariosReais[i][5],
          funcionariosExibidos[i][5]
        );

      linhaSupervisor =
        i + 2;

      break;

    }

    if(!nomeSupervisor){

      throw new Error(
        'Nenhum funcionário com o cargo "Supervisor Departamento de Manutenção" foi encontrado na coluna E.'
      );

    }

    if(
      !salarioSupervisor ||
      salarioSupervisor <= 0
    ){

      throw new Error(
        "O salário bruto do supervisor não está preenchido corretamente na coluna F."
      );

    }

    const tetoSupervisor =
      Number(
        (
          salarioSupervisor * 0.30
        ).toFixed(2)
      );

    return {

      ok:
        true,

      percentual:
        Number(
          percentualSupervisor.toFixed(4)
        ),

      fator:
        percentualSupervisor / 100,

      nomeSupervisor:
        nomeSupervisor,

      salarioSupervisor:
        salarioSupervisor,

      tetoSupervisor:
        tetoSupervisor,

      linhaPercentual:
        linhaPercentual,

      linhaSupervisor:
        linhaSupervisor

    };

  } catch(erro){

    throw new Error(
      "Erro ao carregar dados do supervisor: " +
      erro.message
    );

  }

}
function converterSalarioComissaoCentral_(
  valorReal,
  valorExibido
){

  /*
    Quando a célula é numérica,
    o Apps Script normalmente retorna
    diretamente o valor correto.
  */
  if(
    typeof valorReal === "number" &&
    isFinite(valorReal)
  ){

    return Math.max(
      0,
      valorReal
    );

  }

  let texto =
    String(
      valorExibido ||
      valorReal ||
      ""
    )
      .replace(/R\$/gi, "")
      .replace(/\s/g, "")
      .trim();

  if(!texto){
    return 0;
  }

  /*
    Formato brasileiro:
    1.500,00
  */
  if(texto.includes(",")){

    texto =
      texto
        .replace(/\./g, "")
        .replace(",", ".");

  }

  texto =
    texto.replace(
      /[^\d.-]/g,
      ""
    );

  const numero =
    Number(texto);

  if(
    !isFinite(numero) ||
    numero < 0
  ){
    return 0;
  }

  return numero;

}

/* =========================================================
   FECHAMENTO MENSAL — CENTRAL DE METAS
   Cole no final de ComissoesCentral.gs
========================================================= */

const FECHAMENTO_CENTRAL_PLANILHA_ID =
  "1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE";

const FECHAMENTO_CENTRAL_SENHAS_ID =
  "133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk";

const FECHAMENTO_CENTRAL_ABA_SENHAS =
  "Senhas";

const FECHAMENTO_CENTRAL_ABA_MESES =
  "Fechamentos Mensais";

const FECHAMENTO_CENTRAL_ABA_FUNCIONARIOS =
  "Fechamentos Funcionarios";


/* =========================================================
   CONSULTAR SE O MÊS JÁ ESTÁ FECHADO
========================================================= */

function fechamentoCentralObter(mesFiltro){

  exigirAcessoCentral_();


  const mes =
    fechamentoCentralValidarMes_(
      mesFiltro,
      false
    );

  const estrutura =
    fechamentoCentralGarantirAbas_();

  const registro =
    fechamentoCentralLocalizarMes_(
      estrutura.abaMeses,
      mes
    );

  if(!registro){

    return {
      ok: true,
      fechado: false,
      mes: mes
    };

  }

  return fechamentoCentralMontarRetorno_(
    estrutura.abaFuncionarios,
    registro
  );

}


/* =========================================================
   FECHAR UM MÊS

   A senha é conferida na linha Gerência.

   Todo o cálculo é refeito no servidor antes
   de ser salvo, usando funcionários, salários,
   eventos e O.S. existentes naquele momento.
========================================================= */

function fechamentoCentralSalvar(
  mesFiltro,
  senhaInformada
){

  exigirAcessoCentral_();


  const mes =
    fechamentoCentralValidarMes_(
      mesFiltro,
      true
    );

  fechamentoCentralValidarSenhaGerencia_(
    senhaInformada
  );

  return fechamentoCentralExecutarFechamento_(
    mes
  );

}


/* =========================================================
   GRAVAR O FECHAMENTO (sem conferir senha)

   Usado pelo botão "Fechar mês" (depois da senha)
   e pelo fechamento em lote rodado no editor.
========================================================= */

function fechamentoCentralExecutarFechamento_(
  mes,
  snapshotPronto
){

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try{

    const estrutura =
      fechamentoCentralGarantirAbas_();

    const existente =
      fechamentoCentralLocalizarMes_(
        estrutura.abaMeses,
        mes
      );

    if(existente){

      throw new Error(
        "Este mês já foi fechado anteriormente."
      );

    }

    const snapshot =
      snapshotPronto ||
      fechamentoCentralCalcularSnapshot_(
        mes
      );

    const agora =
      new Date();

    const idFechamento =
      "FC-" +
      mes +
      "-" +
      Utilities
        .getUuid()
        .slice(0, 8)
        .toUpperCase();

    const fechadoPor =
      Session
        .getActiveUser()
        .getEmail() ||
      "Gerência";

    const todosFuncionarios = [
      ...snapshot.funcionariosEstofados,
      ...snapshot.funcionariosEstrutura
    ];

    /*
      Primeiro salva os funcionários.

      O mês só é considerado fechado depois
      que a linha principal for gravada.
    */
    if(todosFuncionarios.length > 0){

      const linhasFuncionarios =
        todosFuncionarios.map(
          function(funcionario){

            return [

              idFechamento,
              mes,
              funcionario.ordem,
              funcionario.grupo,

              funcionario.cpf,
              funcionario.nome,
              funcionario.setor,
              funcionario.cargo,

              funcionario.salarioBruto,
              funcionario.tetoBonus,
              funcionario.valorCalculado,
              funcionario.valorPago,
              funcionario.valorExcedente,
              funcionario.valorNaoDistribuido,

              funcionario.aptoBonus,
              funcionario.setorAtingiuMeta,
              funcionario.rhAtingiuMeta,
              funcionario.limitadoPeloTeto,

              funcionario.motivoBonus,
              agora

            ];

          }
        );

      estrutura
        .abaFuncionarios
        .getRange(
          estrutura.abaFuncionarios.getLastRow() + 1,
          1,
          linhasFuncionarios.length,
          linhasFuncionarios[0].length
        )
        .setValues(
          linhasFuncionarios
        );

    }

    const linhaMes = [[

      idFechamento,
      mes,
      agora,
      fechadoPor,

      snapshot.eventosEstofados,
      snapshot.osEstofados,
      snapshot.eventosEstrutura,
      snapshot.osEstrutura,

      snapshot.percentualSupervisor,
      snapshot.nomeSupervisor,
      snapshot.salarioSupervisor,
      snapshot.tetoSupervisor,

      snapshot.baseElegivelSupervisor,
      snapshot.valorCalculadoSupervisor,
      snapshot.valorPagoSupervisor,

      snapshot.totalPagoFuncionarios,
      snapshot.totalGeral,

      "FECHADO",
      todosFuncionarios.length

    ]];

    estrutura
      .abaMeses
      .getRange(
        estrutura.abaMeses.getLastRow() + 1,
        1,
        1,
        linhaMes[0].length
      )
      .setValues(
        linhaMes
      );

    SpreadsheetApp.flush();

    const registroSalvo =
      fechamentoCentralLocalizarMes_(
        estrutura.abaMeses,
        mes
      );

    return fechamentoCentralMontarRetorno_(
      estrutura.abaFuncionarios,
      registroSalvo
    );

  } finally {

    lock.releaseLock();

  }

}
/* =========================================================
   RECALCULAR A FOTOGRAFIA NO SERVIDOR
========================================================= */

function fechamentoCentralCalcularSnapshot_(mes){

  const respostaFuncionarios =
    listarFuncionariosDistribuicaoCentral(
      mes
    );

  const eventos =
    listarEventosMes(
      mes
    );

  const ordensServico =
    listarOSMes(
      mes
    );

  const supervisor =
    getPercentualSupervisorComissaoCentral();

  const funcionariosEstofados =
    Array.isArray(
      respostaFuncionarios.estofados
    )
      ? respostaFuncionarios.estofados
      : [];

  const funcionariosEstrutura =
    Array.isArray(
      respostaFuncionarios.estrutura
    )
      ? respostaFuncionarios.estrutura
      : [];

  let eventosEstofados = 0;
  let eventosEstrutura = 0;

  (
    Array.isArray(eventos)
      ? eventos
      : []
  ).forEach(function(evento){

    eventosEstofados +=
      fechamentoCentralNumeroBruto_(
        evento.valorComissao
      );

    eventosEstrutura +=
      fechamentoCentralNumeroBruto_(
        evento.valorComissaoPintura
      );

  });

  let osEstofados = 0;
  let osEstrutura = 0;

  (
    Array.isArray(ordensServico)
      ? ordensServico
      : []
  ).forEach(function(ordem){

    const grupo =
      fechamentoCentralClassificarGrupo_(
        ordem.setor
      );

    const valor =
      fechamentoCentralNumeroBruto_(
        ordem.total
      );

    if(grupo === "estofados"){
      osEstofados += valor;
    }

    if(grupo === "estrutura"){
      osEstrutura += valor;
    }

  });

  eventosEstofados =
    fechamentoCentralNumero_(
      eventosEstofados
    );

  eventosEstrutura =
    fechamentoCentralNumero_(
      eventosEstrutura
    );

  osEstofados =
    fechamentoCentralNumero_(
      osEstofados
    );

  osEstrutura =
    fechamentoCentralNumero_(
      osEstrutura
    );

  const distribuicaoEstofados =
    fechamentoCentralDistribuir_(
      eventosEstofados +
      osEstofados,

      funcionariosEstofados,

      "estofados"
    );

  const distribuicaoEstrutura =
    fechamentoCentralDistribuir_(
      eventosEstrutura +
      osEstrutura,

      funcionariosEstrutura,

      "estrutura"
    );

  const distribuicaoCompleta = [
    ...distribuicaoEstofados,
    ...distribuicaoEstrutura
  ];

  const baseElegivelCentavos =
    distribuicaoCompleta.reduce(
      function(total, funcionario){

        return (
          total +
          funcionario.valorPagoCentavos
        );

      },
      0
    );

  const percentualSupervisor =
    fechamentoCentralPercentual_(
      supervisor.percentual
    );

  const nomeSupervisor =
    String(
      supervisor.nomeSupervisor || ""
    );

  const salarioSupervisorCentavos =
    Math.max(
      0,
      Math.round(
        fechamentoCentralNumero_(
          supervisor.salarioSupervisor
        ) * 100
      )
    );

  const tetoSupervisorCentavos =
    Math.max(
      0,
      Math.round(
        salarioSupervisorCentavos *
        0.30
      )
    );

  const valorCalculadoSupervisorCentavos =
    Math.max(
      0,
      Math.round(
        baseElegivelCentavos *
        (
          percentualSupervisor /
          100
        )
      )
    );

  const valorPagoSupervisorCentavos =
    salarioSupervisorCentavos > 0
      ? Math.min(
          valorCalculadoSupervisorCentavos,
          tetoSupervisorCentavos
        )
      : 0;

  const totalPagoFuncionariosCentavos =
    distribuicaoCompleta.reduce(
      function(total, funcionario){

        return (
          total +
          funcionario.valorPagoCentavos
        );

      },
      0
    );

  return {

    eventosEstofados:
      eventosEstofados,

    osEstofados:
      osEstofados,

    eventosEstrutura:
      eventosEstrutura,

    osEstrutura:
      osEstrutura,

    funcionariosEstofados:
      distribuicaoEstofados.map(
        fechamentoCentralFuncionarioParaPlanilha_
      ),

    funcionariosEstrutura:
      distribuicaoEstrutura.map(
        fechamentoCentralFuncionarioParaPlanilha_
      ),

    percentualSupervisor:
      percentualSupervisor,

    nomeSupervisor:
      nomeSupervisor,

    salarioSupervisor:
      salarioSupervisorCentavos / 100,

    tetoSupervisor:
      tetoSupervisorCentavos / 100,

    baseElegivelSupervisor:
      baseElegivelCentavos / 100,

    valorCalculadoSupervisor:
      valorCalculadoSupervisorCentavos / 100,

    valorPagoSupervisor:
      valorPagoSupervisorCentavos / 100,

    totalPagoFuncionarios:
      totalPagoFuncionariosCentavos / 100,

    totalGeral:
      (
        totalPagoFuncionariosCentavos +
        valorPagoSupervisorCentavos
      ) / 100

  };

}


/* =========================================================
   DISTRIBUIR COMISSÃO COM TETO INDIVIDUAL
========================================================= */

function fechamentoCentralDistribuir_(
  total,
  funcionarios,
  grupo
){

  const lista =
    Array.isArray(funcionarios)
      ? funcionarios
      : [];

  if(lista.length === 0){
    return [];
  }

  const totalCentavos =
    Math.max(
      0,
      Math.round(
        fechamentoCentralNumero_(
          total
        ) * 100
      )
    );

  /*
    A divisão continua usando todos os
    funcionários do departamento.

    Valor não recebido não é redistribuído.
  */
  const valorBase =
    Math.floor(
      totalCentavos /
      lista.length
    );

  const centavosRestantes =
    totalCentavos %
    lista.length;

  return lista.map(function(
    funcionario,
    indice
  ){

    const valorCalculadoCentavos =
      valorBase +
      (
        indice < centavosRestantes
          ? 1
          : 0
      );

    const salarioBrutoCentavos =
      Math.max(
        0,
        Math.round(
          fechamentoCentralNumero_(
            funcionario.salarioBruto
          ) * 100
        )
      );

    /* Teto da equipe: 25% do salário (supervisor: 30%) */
    const tetoBonusCentavos =
      Math.max(
        0,
        Math.round(
          salarioBrutoCentavos *
          0.25
        )
      );

    const aptoBonus =
      funcionario.aptoBonus === true;

    const possuiSalario =
      salarioBrutoCentavos > 0;

    const limitadoPeloTeto =
      aptoBonus &&
      possuiSalario &&
      valorCalculadoCentavos >
      tetoBonusCentavos;

    let valorPagoCentavos = 0;

    if(
      aptoBonus &&
      possuiSalario
    ){

      valorPagoCentavos =
        Math.min(
          valorCalculadoCentavos,
          tetoBonusCentavos
        );

    }

    const valorExcedenteCentavos =
      limitadoPeloTeto
        ? (
            valorCalculadoCentavos -
            tetoBonusCentavos
          )
        : 0;

    const valorNaoDistribuidoCentavos =
      Math.max(
        0,
        valorCalculadoCentavos -
        valorPagoCentavos
      );

    return {

      ordem:
        indice + 1,

      grupo:
        grupo,

      cpf:
        String(
          funcionario.cpf || ""
        ),

      nome:
        String(
          funcionario.nome || ""
        ),

      setor:
        String(
          funcionario.setor || ""
        ),

      cargo:
        String(
          funcionario.cargo || ""
        ),

      salarioBrutoCentavos:
        salarioBrutoCentavos,

      tetoBonusCentavos:
        tetoBonusCentavos,

      valorCalculadoCentavos:
        valorCalculadoCentavos,

      valorPagoCentavos:
        valorPagoCentavos,

      valorExcedenteCentavos:
        valorExcedenteCentavos,

      valorNaoDistribuidoCentavos:
        valorNaoDistribuidoCentavos,

      aptoBonus:
        aptoBonus,

      setorAtingiuMeta:
        funcionario.setorAtingiuMeta === true,

      rhAtingiuMeta:
        funcionario.rhAtingiuMeta === true,

      limitadoPeloTeto:
        limitadoPeloTeto,

      motivoBonus:
        String(
          funcionario.motivoBonus || ""
        )

    };

  });

}


function fechamentoCentralFuncionarioParaPlanilha_(
  funcionario
){

  return {

    ordem:
      funcionario.ordem,

    grupo:
      funcionario.grupo,

    cpf:
      funcionario.cpf,

    nome:
      funcionario.nome,

    setor:
      funcionario.setor,

    cargo:
      funcionario.cargo,

    salarioBruto:
      funcionario.salarioBrutoCentavos / 100,

    tetoBonus:
      funcionario.tetoBonusCentavos / 100,

    valorCalculado:
      funcionario.valorCalculadoCentavos / 100,

    valorPago:
      funcionario.valorPagoCentavos / 100,

    valorExcedente:
      funcionario.valorExcedenteCentavos / 100,

    valorNaoDistribuido:
      funcionario.valorNaoDistribuidoCentavos / 100,

    aptoBonus:
      funcionario.aptoBonus,

    setorAtingiuMeta:
      funcionario.setorAtingiuMeta,

    rhAtingiuMeta:
      funcionario.rhAtingiuMeta,

    limitadoPeloTeto:
      funcionario.limitadoPeloTeto,

    motivoBonus:
      funcionario.motivoBonus

  };

}
/* =========================================================
   CRIAR AS ABAS AUTOMATICAMENTE
========================================================= */

function fechamentoCentralGarantirAbas_(){

  const ss =
    SpreadsheetApp.openById(
      FECHAMENTO_CENTRAL_PLANILHA_ID
    );

  let abaMeses =
    ss.getSheetByName(
      FECHAMENTO_CENTRAL_ABA_MESES
    );

  if(!abaMeses){

    abaMeses =
      ss.insertSheet(
        FECHAMENTO_CENTRAL_ABA_MESES
      );

    const cabecalhoMeses = [[

      "ID FECHAMENTO",
      "MÊS",
      "DATA FECHAMENTO",
      "FECHADO POR",

      "EVENTOS ESTOFADOS",
      "O.S. ESTOFADOS",
      "EVENTOS ESTRUTURA",
      "O.S. ESTRUTURA",

      "% SUPERVISOR",
      "NOME SUPERVISOR",
      "SALÁRIO SUPERVISOR",
      "TETO SUPERVISOR",

      "BASE ELEGÍVEL SUPERVISOR",
      "VALOR CALCULADO SUPERVISOR",
      "VALOR PAGO SUPERVISOR",

      "TOTAL PAGO FUNCIONÁRIOS",
      "TOTAL GERAL",

      "STATUS",
      "QUANTIDADE FUNCIONÁRIOS"

    ]];

    abaMeses
      .getRange(
        1,
        1,
        1,
        cabecalhoMeses[0].length
      )
      .setValues(
        cabecalhoMeses
      );

    fechamentoCentralFormatarCabecalho_(
      abaMeses,
      cabecalhoMeses[0].length
    );

    abaMeses
      .getRange("B:B")
      .setNumberFormat("@");

    abaMeses
      .getRange("C:C")
      .setNumberFormat(
        "dd/MM/yyyy HH:mm:ss"
      );

    abaMeses
      .getRange("E:H")
      .setNumberFormat(
        'R$ #,##0.00'
      );

    abaMeses
      .getRange("I:I")
      .setNumberFormat(
        '0.00"%"'
      );

    abaMeses
      .getRange("K:Q")
      .setNumberFormat(
        'R$ #,##0.00'
      );

  }

  let abaFuncionarios =
    ss.getSheetByName(
      FECHAMENTO_CENTRAL_ABA_FUNCIONARIOS
    );

  if(!abaFuncionarios){

    abaFuncionarios =
      ss.insertSheet(
        FECHAMENTO_CENTRAL_ABA_FUNCIONARIOS
      );

    const cabecalhoFuncionarios = [[

      "ID FECHAMENTO",
      "MÊS",
      "ORDEM",
      "GRUPO",

      "CPF",
      "FUNCIONÁRIO",
      "SETOR",
      "CARGO",

      "SALÁRIO BRUTO",
      "TETO 25%",
      "VALOR CALCULADO",
      "VALOR PAGO",
      "VALOR EXCEDENTE",
      "VALOR NÃO DISTRIBUÍDO",

      "APTO AO BÔNUS",
      "SETOR ATINGIU META",
      "RH ATINGIU META",
      "LIMITADO PELO TETO",

      "MOTIVO",
      "DATA FECHAMENTO"

    ]];

    abaFuncionarios
      .getRange(
        1,
        1,
        1,
        cabecalhoFuncionarios[0].length
      )
      .setValues(
        cabecalhoFuncionarios
      );

    fechamentoCentralFormatarCabecalho_(
      abaFuncionarios,
      cabecalhoFuncionarios[0].length
    );

    abaFuncionarios
      .getRange("B:B")
      .setNumberFormat("@");

    abaFuncionarios
      .getRange("E:E")
      .setNumberFormat("@");

    abaFuncionarios
      .getRange("I:N")
      .setNumberFormat(
        'R$ #,##0.00'
      );

    abaFuncionarios
      .getRange("T:T")
      .setNumberFormat(
        "dd/MM/yyyy HH:mm:ss"
      );

  }

  return {
    abaMeses: abaMeses,
    abaFuncionarios: abaFuncionarios
  };

}


function fechamentoCentralFormatarCabecalho_(
  aba,
  quantidadeColunas
){

  aba.setFrozenRows(1);

  aba
    .getRange(
      1,
      1,
      1,
      quantidadeColunas
    )
    .setBackground("#123A6F")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  aba.autoResizeColumns(
    1,
    quantidadeColunas
  );

}
/* =========================================================
   VALIDAR SENHA DA GERÊNCIA
========================================================= */

function fechamentoCentralValidarSenhaGerencia_(
  senhaInformada
){

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
      FECHAMENTO_CENTRAL_SENHAS_ID
    );

  let aba =
    ss.getSheetByName(
      FECHAMENTO_CENTRAL_ABA_SENHAS
    );

  if(!aba){

    aba =
      ss.getSheets().find(
        function(sheet){

          return (
            fechamentoCentralNormalizar_(
              sheet.getName()
            ) === "senhas"
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

  if(ultimaLinha < 2){

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

  let senhaGerencia = "";

  for(
    let i = 0;
    i < dados.length;
    i++
  ){

    const setor =
      fechamentoCentralNormalizar_(
        dados[i][0]
      );

    if(setor === "gerencia"){

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

  if(senha !== senhaGerencia){

    throw new Error(
      "Senha da Gerência incorreta."
    );

  }

  return true;

}
/* =========================================================
   LOCALIZAR UM MÊS FECHADO
========================================================= */

function fechamentoCentralLocalizarMes_(
  abaMeses,
  mes
){

  const ultimaLinha =
    abaMeses.getLastRow();

  if(ultimaLinha < 2){
    return null;
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

  for(
    let i = dados.length - 1;
    i >= 0;
    i--
  ){

    if(
      String(
        dados[i][1] || ""
      ).trim() === mes &&
      String(
        dados[i][17] || ""
      ).trim() === "FECHADO"
    ){

      return {
        linha: i + 2,
        valores: dados[i]
      };

    }

  }

  return null;

}


/* =========================================================
   MONTAR A RESPOSTA PARA O HTML
========================================================= */

function fechamentoCentralMontarRetorno_(
  abaFuncionarios,
  registro
){

  const linha =
    registro.valores;

  const idFechamento =
    String(
      linha[0] || ""
    );

  const funcionariosEstofados = [];
  const funcionariosEstrutura = [];

  const ultimaLinha =
    abaFuncionarios.getLastRow();

  if(ultimaLinha >= 2){

    const dados =
      abaFuncionarios
        .getRange(
          2,
          1,
          ultimaLinha - 1,
          20
        )
        .getValues();

    dados
      .filter(function(item){

        return (
          String(item[0] || "") ===
          idFechamento
        );

      })
      .sort(function(a, b){

        if(
          String(a[3] || "") !==
          String(b[3] || "")
        ){

          return String(a[3] || "")
            .localeCompare(
              String(b[3] || "")
            );

        }

        return (
          Number(a[2] || 0) -
          Number(b[2] || 0)
        );

      })
      .forEach(function(item){

        const funcionario = {

          /*
            A função de distribuição do HTML
            identificará que estes valores já
            pertencem a um fechamento.
          */
          fechamentoMensal:
            true,

          ordem:
            Number(item[2] || 0),

          grupo:
            String(item[3] || ""),

          cpf:
            String(item[4] || ""),

          nome:
            String(item[5] || ""),

          setor:
            String(item[6] || ""),

          cargo:
            String(item[7] || ""),

          salarioBruto:
            fechamentoCentralNumero_(
              item[8]
            ),

          tetoBonus:
            fechamentoCentralNumero_(
              item[9]
            ),

          valorCalculadoFechado:
            fechamentoCentralNumero_(
              item[10]
            ),

          valorPagoFechado:
            fechamentoCentralNumero_(
              item[11]
            ),

          valorExcedenteFechado:
            fechamentoCentralNumero_(
              item[12]
            ),

          valorNaoDistribuidoFechado:
            fechamentoCentralNumero_(
              item[13]
            ),

          aptoBonus:
            fechamentoCentralBooleano_(
              item[14]
            ),

          setorAtingiuMeta:
            fechamentoCentralBooleano_(
              item[15]
            ),

          rhAtingiuMeta:
            fechamentoCentralBooleano_(
              item[16]
            ),

          limitadoPeloTeto:
            fechamentoCentralBooleano_(
              item[17]
            ),

          motivoBonus:
            String(item[18] || "")

        };

        if(
          funcionario.grupo ===
          "estofados"
        ){

          funcionariosEstofados.push(
            funcionario
          );

        }

        if(
          funcionario.grupo ===
          "estrutura"
        ){

          funcionariosEstrutura.push(
            funcionario
          );

        }

      });

  }

  return {

    ok: true,
    fechado: true,

    idFechamento:
      idFechamento,

    mes:
      String(linha[1] || ""),

    dataFechamento:
      fechamentoCentralFormatarData_(
        linha[2]
      ),

    fechadoPor:
      String(linha[3] || ""),

    eventosEstofados:
      fechamentoCentralNumero_(
        linha[4]
      ),

    osEstofados:
      fechamentoCentralNumero_(
        linha[5]
      ),

    eventosEstrutura:
      fechamentoCentralNumero_(
        linha[6]
      ),

    osEstrutura:
      fechamentoCentralNumero_(
        linha[7]
      ),

    percentualSupervisor:
      fechamentoCentralPercentual_(
        linha[8]
      ),

    nomeSupervisor:
      String(linha[9] || ""),

    salarioSupervisor:
      fechamentoCentralNumero_(
        linha[10]
      ),

    tetoSupervisor:
      fechamentoCentralNumero_(
        linha[11]
      ),

    baseElegivelSupervisor:
      fechamentoCentralNumero_(
        linha[12]
      ),

    valorCalculadoSupervisor:
      fechamentoCentralNumero_(
        linha[13]
      ),

    valorPagoSupervisor:
      fechamentoCentralNumero_(
        linha[14]
      ),

    totalPagoFuncionarios:
      fechamentoCentralNumero_(
        linha[15]
      ),

    totalGeral:
      fechamentoCentralNumero_(
        linha[16]
      ),

    funcionariosEstofados:
      funcionariosEstofados,

    funcionariosEstrutura:
      funcionariosEstrutura

  };

}
/* =========================================================
   FUNÇÕES AUXILIARES
========================================================= */

function fechamentoCentralClassificarGrupo_(
  setor
){

  const texto =
    fechamentoCentralNormalizar_(
      setor
    );

  if(
    texto.includes("limpeza") ||
    texto.includes("forracao") ||
    texto.includes("costura") ||
    texto === "estofados" ||
    texto === "estofado"
  ){
    return "estofados";
  }

  if(
    texto.includes("solda") ||
    texto.includes("acabamento") ||
    texto.includes("pintura") ||
    texto.includes("marcenaria")
  ){
    return "estrutura";
  }

  return "";

}


function fechamentoCentralValidarMes_(
  mesFiltro,
  bloquearFuturo
){

  const mes =
    String(
      mesFiltro || ""
    ).trim();

  if(!/^\d{4}-\d{2}$/.test(mes)){

    throw new Error(
      "Mês inválido."
    );

  }

  if(bloquearFuturo === true){

    const mesAtual =
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM"
      );

    if(mes > mesAtual){

      throw new Error(
        "Não é possível fechar um mês futuro."
      );

    }

  }

  return mes;

}


function fechamentoCentralNumeroBruto_(valor){

  const numero =
    Number(valor || 0);

  if(
    !isFinite(numero) ||
    numero < 0
  ){
    return 0;
  }

  return numero;

}


function fechamentoCentralNumero_(valor){

  const numero =
    Number(valor || 0);

  if(
    !isFinite(numero) ||
    numero < 0
  ){
    return 0;
  }

  return Number(
    numero.toFixed(2)
  );

}


function fechamentoCentralPercentual_(valor){

  const numero =
    Number(valor || 0);

  if(
    !isFinite(numero) ||
    numero < 0
  ){
    return 0;
  }

  return Number(
    numero.toFixed(4)
  );

}


function fechamentoCentralBooleano_(valor){

  if(
    valor === true ||
    valor === 1
  ){
    return true;
  }

  const texto =
    fechamentoCentralNormalizar_(
      valor
    );

  return (
    texto === "true" ||
    texto === "verdadeiro" ||
    texto === "sim"
  );

}


function fechamentoCentralFormatarData_(valor){

  if(
    valor instanceof Date &&
    !isNaN(valor.getTime())
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


function fechamentoCentralNormalizar_(valor){

  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

}
/* =========================================================
   BÔNUS DO ALMOXARIFADO — CENTRAL DE METAS

   Regra:

   Gasto ajustado =
     gasto dos setores + perdas da contagem

   Economia válida =
     teto total - gasto ajustado

   Bônus =
     economia válida × percentual

   Percentual provisório:
     20%
========================================================= */

const BONUS_ALMOXARIFADO_PERCENTUAL_PADRAO =
  20;


/* =========================================================
   CALCULAR BÔNUS DO ALMOXARIFADO
========================================================= */

function calcularBonusAlmoxarifadoCentral(
  mesFiltro,
  divergenciasJaCarregadas
){

  const mes =
    normalizarMesBonusAlmoxarifadoCentral_(
      mesFiltro
    );

  /*
    Esta função já existe no projeto e busca:

    - coluna verde = teto do setor;
    - coluna branca seguinte = gasto do setor.

    Retorno esperado:
    [
      {
        setor: "...",
        teto: 0,
        gasto: 0
      }
    ]
  */
  const gastosPorSetor =
    getTetoGastosMensal(
      mes
    );

  if(
    !Array.isArray(gastosPorSetor)
  ){

    throw new Error(
      "Não foi possível carregar os tetos e gastos dos setores."
    );

  }

  /*
    Ignora linhas vazias e possíveis
    linhas de totalização.
  */
  const setoresValidos =
    gastosPorSetor.filter(
      function(item){

        const setor =
          normalizarTextoBonusAlmoxarifadoCentral_(
            item && item.setor
          );

        if(!setor){
          return false;
        }

        if(
          setor === "total" ||
          setor.indexOf("total ") === 0
        ){
          return false;
        }

        return true;

      }
    );

  if(setoresValidos.length === 0){

    throw new Error(
      'Nenhum setor foi encontrado na aba "Metas e Gastos".'
    );

  }

  const tetoTotal =
    setoresValidos.reduce(
      function(total, item){

        return (
          total +
          numeroBonusAlmoxarifadoCentral_(
            item.teto
          )
        );

      },
      0
    );

  const gastoTotal =
    setoresValidos.reduce(
      function(total, item){

        return (
          total +
          numeroBonusAlmoxarifadoCentral_(
            item.gasto
          )
        );

      },
      0
    );

  /*
    Quando as divergências já vieram da função
    getMetasAlmoxarifadoCentral, utilizamos a
    mesma lista para não consultar a planilha
    duas vezes.

    Se a função for chamada isoladamente,
    ela busca as divergências normalmente.
  */
  const divergencias =
    Array.isArray(
      divergenciasJaCarregadas
    )
      ? divergenciasJaCarregadas
      : buscarDivergenciasContagemAlmoxarifado_(
          mes
        );

  /*
    Somente diferenças negativas representam
    perda de estoque.
  */
  const perdas =
    (
      Array.isArray(divergencias)
        ? divergencias
        : []
    ).filter(
      function(item){

        return (
          numeroBonusAlmoxarifadoCentral_(
            item.diferenca
          ) < 0
        );

      }
    );

  const valorPerdas =
    perdas.reduce(
      function(total, item){

        return (
          total +
          numeroBonusAlmoxarifadoCentral_(
            item.valorPerda
          )
        );

      },
      0
    );

  const quantidadePerdida =
    perdas.reduce(
      function(total, item){

        const quantidade =
          item.quantidadePerdida !==
          undefined
            ? numeroBonusAlmoxarifadoCentral_(
                item.quantidadePerdida
              )
            : Math.abs(
                numeroBonusAlmoxarifadoCentral_(
                  item.diferenca
                )
              );

        return (
          total +
          quantidade
        );

      },
      0
    );

  /*
    Caso algum item perdido não possua custo,
    o bônus fica pendente.

    Isso evita que uma perda seja considerada
    como R$ 0,00 e aumente o bônus indevidamente.
  */
  const custosNaoEncontrados =
    perdas.filter(
      function(item){

        return (
          item.custoEncontrado !== true
        );

      }
    ).length;

  const gastoAjustado =
    gastoTotal +
    valorPerdas;

  const saldoAntesDasPerdas =
    tetoTotal -
    gastoTotal;

  const economiaAntesDasPerdas =
    Math.max(
      0,
      saldoAntesDasPerdas
    );

  const saldoAposPerdas =
    tetoTotal -
    gastoAjustado;

  const economiaValida =
    Math.max(
      0,
      saldoAposPerdas
    );

  const percentualBonus =
    obterPercentualBonusAlmoxarifadoCentral_();

  const calculoPendente =
    custosNaoEncontrados > 0;

  const elegivel =
    !calculoPendente &&
    tetoTotal > 0 &&
    economiaValida > 0;

  const valorBonus =
    elegivel
      ? (
          economiaValida *
          (
            percentualBonus /
            100
          )
        )
      : 0;

  let status = "";
  let mensagem = "";

  if(calculoPendente){

    status =
      "PENDENTE";

    mensagem =
      custosNaoEncontrados +
      (
        custosNaoEncontrados === 1
          ? " item perdido está sem custo cadastrado. O bônus foi bloqueado até a correção."
          : " itens perdidos estão sem custo cadastrado. O bônus foi bloqueado até a correção."
      );

  } else if(tetoTotal <= 0){

    status =
      "SEM_BONUS";

    mensagem =
      "Nenhum teto de gasto foi definido para o mês selecionado.";

  } else if(economiaValida <= 0){

    status =
      "SEM_BONUS";

    mensagem =
      "O gasto dos setores somado às perdas atingiu ou ultrapassou o teto mensal.";

  } else {

    status =
      "ELEGIVEL";

    mensagem =
      "O bônus foi calculado sobre a economia válida após o desconto das perdas.";

  }

  return {

    ok:
      true,

    mes:
      mes,

    percentualBonus:
      percentualBonus,

    setoresConsiderados:
      setoresValidos.length,

    tetoTotal:
      arredondarMoedaBonusAlmoxarifadoCentral_(
        tetoTotal
      ),

    gastoTotal:
      arredondarMoedaBonusAlmoxarifadoCentral_(
        gastoTotal
      ),

    valorPerdas:
      arredondarMoedaBonusAlmoxarifadoCentral_(
        valorPerdas
      ),

    gastoAjustado:
      arredondarMoedaBonusAlmoxarifadoCentral_(
        gastoAjustado
      ),

    saldoAntesDasPerdas:
      arredondarMoedaBonusAlmoxarifadoCentral_(
        saldoAntesDasPerdas
      ),

    economiaAntesDasPerdas:
      arredondarMoedaBonusAlmoxarifadoCentral_(
        economiaAntesDasPerdas
      ),

    saldoAposPerdas:
      arredondarMoedaBonusAlmoxarifadoCentral_(
        saldoAposPerdas
      ),

    economiaValida:
      arredondarMoedaBonusAlmoxarifadoCentral_(
        economiaValida
      ),

    valorBonus:
      arredondarMoedaBonusAlmoxarifadoCentral_(
        valorBonus
      ),

    registrosComPerda:
      perdas.length,

    quantidadePerdida:
      Number(
        quantidadePerdida.toFixed(4)
      ),

    custosNaoEncontrados:
      custosNaoEncontrados,

    calculoPendente:
      calculoPendente,

    elegivel:
      elegivel,

    status:
      status,

    mensagem:
      mensagem

  };

}


/* =========================================================
   PERCENTUAL PROVISÓRIO

   Futuramente esta função poderá buscar o
   percentual em uma aba de configurações.
========================================================= */

function obterPercentualBonusAlmoxarifadoCentral_(){

  const percentual =
    Number(
      BONUS_ALMOXARIFADO_PERCENTUAL_PADRAO
    );

  if(
    !isFinite(percentual) ||
    percentual < 0
  ){

    return 20;

  }

  return percentual;

}


/* =========================================================
   NORMALIZAR MÊS
========================================================= */

function normalizarMesBonusAlmoxarifadoCentral_(
  valor
){

  if(valor instanceof Date){

    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );

  }

  const texto =
    String(
      valor ||
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM"
      )
    ).trim();

  /*
    Formato recebido pelo input:
    2026-07
  */
  if(
    /^\d{4}-\d{2}$/.test(
      texto
    )
  ){

    const partes =
      texto.split("-");

    const mes =
      Number(partes[1]);

    if(
      mes >= 1 &&
      mes <= 12
    ){

      return texto;

    }

  }

  /*
    Formato utilizado em alguns pontos:
    07/2026
  */
  if(
    /^\d{2}\/\d{4}$/.test(
      texto
    )
  ){

    const partes =
      texto.split("/");

    const mes =
      Number(partes[0]);

    if(
      mes >= 1 &&
      mes <= 12
    ){

      return (
        partes[1] +
        "-" +
        partes[0]
      );

    }

  }

  /*
    Formato:
    2026-07-22
  */
  if(
    /^\d{4}-\d{2}-\d{2}/.test(
      texto
    )
  ){

    return texto.slice(
      0,
      7
    );

  }

  throw new Error(
    "Mês inválido para o cálculo do bônus: " +
    texto
  );

}


/* =========================================================
   NORMALIZAR TEXTO
========================================================= */

function normalizarTextoBonusAlmoxarifadoCentral_(
  valor
){

  return String(
    valor || ""
  )
    .toLowerCase()
    .normalize("NFD")
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
   CONVERTER VALOR NUMÉRICO
========================================================= */

function numeroBonusAlmoxarifadoCentral_(
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
    typeof valor === "number"
  ){

    return isFinite(valor)
      ? valor
      : 0;

  }

  let texto =
    String(valor)
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
    20,50
  */
  if(
    texto.indexOf(",") >= 0
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
    Formato de milhar:

    1.000
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
    Number(texto);

  return isFinite(numero)
    ? numero
    : 0;

}


/* =========================================================
   ARREDONDAR MOEDA
========================================================= */

function arredondarMoedaBonusAlmoxarifadoCentral_(
  valor
){

  return Number(
    Number(
      valor || 0
    ).toFixed(2)
  );

}


/* =========================================================
   FUNÇÃO DE TESTE
========================================================= */

function testarBonusAlmoxarifadoCentral(){

  const resultado =
    calcularBonusAlmoxarifadoCentral(
      "2026-07"
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