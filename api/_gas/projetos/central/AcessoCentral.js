/* =========================================================
   ACESSO À CENTRAL DE METAS — senha de entrada

   1. A página pede a senha e chama centralEntrar(senha).
   2. O servidor confere e devolve uma chave de acesso
      temporária (guardada no cache do script).
   3. Toda chamada da Central passa por centralChamar(),
      que confere a chave antes de executar a função.
   4. As funções da Central começam com
      exigirAcessoCentral_(): chamadas diretas, sem passar
      pela porta de entrada, são recusadas.

   A senha fica só no servidor; a página nunca a recebe.
========================================================= */

const CENTRAL_SENHA_ACESSO =
  "Metas2026";

/* Validade da chave: 6 horas (máximo do cache), renovada a cada uso */
const CENTRAL_ACESSO_SEGUNDOS =
  21600;

/* Funções que a página da Central pode chamar */
const CENTRAL_FUNCOES_PERMITIDAS = [
  "calcularStatusSetores",
  "fechamentoCentralObter",
  "fechamentoCentralSalvar",
  "getAvaliacaoIndividualRH",
  "getMetasAlmoxarifadoCentral",
  "getMetasConfiguradas",
  "getPercentualSupervisorComissaoCentral",
  "listarEventosMes",
  "listarFuncionariosDistribuicaoCentral",
  "listarOSMes",
  "pagamentosBonusCentralObter",
  "pagamentosBonusCentralSalvar",
  "pagamentosBonusCentralValidarSenha",
  "salvarMetasEmLote",
  "premiacoesObter",
  "premiacoesValidarSenha",
  "premiacoesSalvarItem",
  "premiacoesExcluirItem",
  "appEquipeListar",
  "appEquipeGerarPin",
  "appEquipeSalvarFoto"
];

/* Liberado só durante a execução atual */
let acessoCentralLiberado_ =
  false;

function centralEntrar(senhaInformada){

  const senha =
    String(senhaInformada || "").trim();

  if(senha !== CENTRAL_SENHA_ACESSO){

    /* Pequena espera para dificultar tentativas em sequência */
    Utilities.sleep(800);

    throw new Error("Senha incorreta.");

  }

  const chave =
    Utilities.getUuid();

  CacheService
    .getScriptCache()
    .put("acessoCentral:" + chave, "1", CENTRAL_ACESSO_SEGUNDOS);

  return {
    ok: true,
    chave: chave
  };

}

function centralChamar(chave, nomeFuncao, argumentos){

  const cache =
    CacheService.getScriptCache();

  const chaveCache =
    "acessoCentral:" + String(chave || "");

  if(!chave || !cache.get(chaveCache)){
    throw new Error("ACESSO_EXPIRADO");
  }

  if(CENTRAL_FUNCOES_PERMITIDAS.indexOf(nomeFuncao) < 0){
    throw new Error("Função não permitida: " + nomeFuncao);
  }

  /* Renova a validade a cada uso */
  cache.put(chaveCache, "1", CENTRAL_ACESSO_SEGUNDOS);

  const funcoes = {
    calcularStatusSetores: calcularStatusSetores,
    fechamentoCentralObter: fechamentoCentralObter,
    fechamentoCentralSalvar: fechamentoCentralSalvar,
    getAvaliacaoIndividualRH: getAvaliacaoIndividualRH,
    getMetasAlmoxarifadoCentral: getMetasAlmoxarifadoCentral,
    getMetasConfiguradas: getMetasConfiguradas,
    getPercentualSupervisorComissaoCentral: getPercentualSupervisorComissaoCentral,
    listarEventosMes: listarEventosMes,
    listarFuncionariosDistribuicaoCentral: listarFuncionariosDistribuicaoCentral,
    listarOSMes: listarOSMes,
    pagamentosBonusCentralObter: pagamentosBonusCentralObter,
    pagamentosBonusCentralSalvar: pagamentosBonusCentralSalvar,
    pagamentosBonusCentralValidarSenha: pagamentosBonusCentralValidarSenha,
    salvarMetasEmLote: salvarMetasEmLote,
    premiacoesObter: premiacoesObter,
    premiacoesValidarSenha: premiacoesValidarSenha,
    premiacoesSalvarItem: premiacoesSalvarItem,
    premiacoesExcluirItem: premiacoesExcluirItem,
    appEquipeListar: appEquipeListar,
    appEquipeGerarPin: appEquipeGerarPin,
    appEquipeSalvarFoto: appEquipeSalvarFoto
  };

  acessoCentralLiberado_ = true;

  return funcoes[nomeFuncao].apply(
    null,
    Array.isArray(argumentos) ? argumentos : []
  );

}

/* Primeira linha das funções da Central */
function exigirAcessoCentral_(){

  if(!acessoCentralLiberado_){
    throw new Error("Acesso negado. Entre na Central com a senha.");
  }

}

/*
  Para funções rodadas pelo editor do Apps Script
  (auditoria, ajustes, fechamento em lote, testes).
*/
function liberarAcessoInterno_(){

  acessoCentralLiberado_ = true;

}
