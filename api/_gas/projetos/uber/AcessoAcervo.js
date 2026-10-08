/****************************************************
 * CONTROLE DE CORRIDAS — ACESSO PELO LOGIN DO ACERVO (out/2026)
 *
 * Antes: login próprio (aba "Login e Senha") com o cargo da pessoa
 * (Supervisor, Financeiro, Gerência), e a regra de quem muda o status
 * ficava só na tela. Agora vale quem está logado no Acervo e as
 * permissões marcadas para ele (tela Permissões); o administrador da
 * empresa pode tudo. A regra também é conferida aqui no servidor.
 *
 * O app do Motorista (motorista.html) não usa nada disto.
 ****************************************************/

function UBER_cargoDoUsuario_() {
  if (Acervo.pode("logistica.uber.gerencia")) { return "Gerência"; }
  if (Acervo.pode("logistica.uber.financeiro")) { return "Financeiro"; }
  if (Acervo.pode("logistica.uber.supervisor")) { return "Supervisor"; }
  return "Consulta";
}

/* Substitui a tela de login: devolve o mesmo formato de login() */
function uberEntrarComLogin() {
  const usuario = Acervo.usuario();
  if (!usuario) {
    return { status: "ERRO" };
  }
  return {
    status: "OK",
    usuario: usuario.nome,
    cargo: UBER_cargoDoUsuario_()
  };
}

/* Quem pode levar uma corrida de statusAtual para novoStatus.
   Devolve "" quando pode, ou a mensagem de por que não pode. */
function UBER_motivoBloqueioStatus_(statusAtual, novoStatus) {
  const gerencia = Acervo.pode("logistica.uber.gerencia");
  const financeiro = Acervo.pode("logistica.uber.financeiro");
  const supervisor = Acervo.pode("logistica.uber.supervisor");

  if (!gerencia && !financeiro && !supervisor) {
    return "Seu usuário não tem permissão para mudar o status das corridas.";
  }
  if (gerencia) { return ""; } // Gerência (e o admin) pode tudo, inclusive corrigir uma corrida já paga
  if (statusAtual === "Pago" && novoStatus !== "Pago") {
    return "Este item já está pago e não pode ser alterado.";
  }

  const financeiroPode = financeiro && statusAtual === "Conferido" && novoStatus === "Pago";
  const supervisorPode = supervisor && novoStatus !== "Pago";
  if (financeiroPode || supervisorPode) { return ""; }

  if (novoStatus === "Pago") {
    return financeiro
      ? "O Financeiro só pode marcar como Pago quando o status atual é Conferido."
      : "Só o Financeiro ou a Gerência marcam a corrida como Paga.";
  }
  return "O Financeiro só pode marcar como Pago o que já está Conferido.";
}
