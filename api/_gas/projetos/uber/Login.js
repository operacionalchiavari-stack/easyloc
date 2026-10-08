function login(usuario, senha) {

  const ss = SpreadsheetApp.openById("1qYMrypoMvB7t1kwmw-lm_Dye7262OhifKEpXEW5oWow");
  const aba = ss.getSheetByName("Login e Senha");

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 3).getValues();
  // Colunas:
  // A = Usuário
  // B = Senha
  // C = Cargo

  for (let i = 0; i < dados.length; i++) {
    const linha = dados[i];

    const usuarioPlanilha = linha[0];
    const senhaPlanilha = linha[1];
    const cargoPlanilha = linha[2];

    if (usuarioPlanilha === usuario && String(senhaPlanilha) === senha) {
      return {
        status: "OK",
        usuario: usuarioPlanilha,
        cargo: cargoPlanilha
      };
    }
  }

  return { status: "ERRO" };
}
