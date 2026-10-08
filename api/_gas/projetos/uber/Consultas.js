/****************************************************
 * 1) LISTA DE MOTORISTAS (COLUNA C)
 ****************************************************/
function getMotoristas() {
  const ss = SpreadsheetApp.openById("1qYMrypoMvB7t1kwmw-lm_Dye7262OhifKEpXEW5oWow");
  const aba = ss.getSheetByName("CORRIDAS UBER");

  const valores = aba.getRange(2, 3, aba.getLastRow() - 1, 1).getValues();
  const lista = [...new Set(valores.flat().filter(v => v && v !== ""))];

  return lista.sort();
}

/****************************************************
 * 2) BUSCAR CORRIDAS + STATUS (coluna P)
 ****************************************************/
function getCorridas(filtros) {

  const ss = SpreadsheetApp.openById("1qYMrypoMvB7t1kwmw-lm_Dye7262OhifKEpXEW5oWow");
  const aba = ss.getSheetByName("CORRIDAS UBER");

  const linhas = aba.getRange(2, 1, aba.getLastRow() - 1, 16).getValues();

  let lista = [];

  linhas.forEach((l, index) => {
    if (!l[3]) return;

    const dataCorrida = new Date(l[3]);
    const dataFormatada = Utilities.formatDate(dataCorrida, "GMT-3", "dd/MM/yyyy");

    const status = l[15] ? String(l[15]).trim() : "Pendente";

    if (filtros.dataInicial) {
      let inicio = new Date(filtros.dataInicial);
      if (dataCorrida < inicio) return;
    }

    if (filtros.dataFinal) {
      let fim = new Date(filtros.dataFinal);
      fim.setDate(fim.getDate() + 1);
      if (dataCorrida >= fim) return;
    }

    if (filtros.motorista && filtros.motorista !== "" && l[2] !== filtros.motorista) return;

    if (filtros.status && filtros.status !== "" && status.toLowerCase() !== filtros.status.toLowerCase()) return;

    const valorKm = Number(l[10]) || 0;
    const total = Number(l[11]) || 0;

    lista.push({
      indexPlanilha: index + 2,
      quemEnviou: l[1],
      motorista: l[2],
      data: dataFormatada,
      carro: l[4],
      embarque: l[5],
      destino: l[6],
      horas: l[7],
      valorKm: valorKm.toFixed(2),
      total: total.toFixed(2),
      status: status
    });
  });

  return lista;
}

/****************************************************
 * 3) VALIDAR SENHA (APENAS PARA GERÊNCIA SE USAR)
 ****************************************************/
function validarSenhaFinanceiro(senhaDigitada) {

  const ss = SpreadsheetApp.openById("1qYMrypoMvB7t1kwmw-lm_Dye7262OhifKEpXEW5oWow");
  const aba = ss.getSheetByName("Login e Senha");

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues();

  for (let i = 0; i < dados.length; i++) {
    if (String(dados[i][0]).trim().toLowerCase() === "gerência" || 
        String(dados[i][0]).trim().toLowerCase() === "gerencia") {
      const senhaCorreta = String(dados[i][1]).trim();
      return senhaDigitada === senhaCorreta;
    }
  }
  return false;
}

/****************************************************
 * 4) MARCAR STATUS (COLUNA P)
 ****************************************************/
function marcarStatus(linha, novoStatus, senha) {

  const ss = SpreadsheetApp.openById("1qYMrypoMvB7t1kwmw-lm_Dye7262OhifKEpXEW5oWow");
  const aba = ss.getSheetByName("CORRIDAS UBER");

  const statusAtual = aba.getRange(linha, 16).getValue();

  /******************************************************
   * SUPERVISOR — NÃO ALTERA STATUS PAGO
   ******************************************************/
  if (statusAtual === "Pago" && novoStatus !== "Pago" && senha === "SUPERVISOR") {
    return { erro: true, msg: "Este item já está pago. Supervisores não podem alterar." };
  }

  /******************************************************
   * FINANCEIRO — SOMENTE: CONFERIDO → PAGO (sem senha)
   ******************************************************/
  if (senha === "" && novoStatus === "Pago") {
    if (statusAtual !== "Conferido") {
      return { erro: true, msg: "O Financeiro só pode marcar como Pago quando o status atual é Conferido." };
    }
  }

  /******************************************************
   * GERÊNCIA — pode tudo (sem senha)
   ******************************************************/
  if (senha === "GERENCIA" || senha === "GERÊNCIA") {
    // Nenhuma regra, sempre pode alterar
  }

  /******************************************************
   * NÃO PERMITIR VOLTAR STATUS PAGO PARA OUTRO
   ******************************************************/
  if (statusAtual === "Pago" && novoStatus !== "Pago") {
    return { erro: true, msg: "Este item já está pago e não pode ser alterado." };
  }

  /******************************************************
   * SALVAR NA PLANILHA
   ******************************************************/
  aba.getRange(linha, 16).setValue(novoStatus);

  return { erro: false, msg: "Status atualizado com sucesso." };
}

/****************************************************
 * 5) DASHBOARD
 ****************************************************/
/****************************************************
 * 5) DASHBOARD — VERSÃO COMPLETA ATUALIZADA
 ****************************************************/
/****************************************************
 * 5) DASHBOARD COMPLETO
 ****************************************************/
/****************************************************
 * 5) DASHBOARD COMPLETO
 ****************************************************/
function getDashboard(filtros) {

  const dados = getCorridas(filtros).filter(r => r.status !== "Recusado");

  // --- 1. Quantidades e valores ---
  const totalCorridas = dados.length;

  const valorTotal = dados.reduce((s, r) => s + Number(r.total), 0);
  const mediaValor = totalCorridas > 0 ? valorTotal / totalCorridas : 0;

  const totalHoras = dados.reduce((s, r) => s + Number(r.horas), 0);
  const mediaHoras = totalCorridas > 0 ? totalHoras / totalCorridas : 0;

  // --- 2. Status resumo ---
  const statusResumo = { Pendente: 0, Conferido: 0, Pago: 0, Recusado: 0 };
  dados.forEach(r => {
    statusResumo[r.status] = (statusResumo[r.status] || 0) + 1;
  });

  // --- 3. Corridas por motorista ---
  const corridasMotorista = {};
  dados.forEach(r => {
    corridasMotorista[r.motorista] =
      (corridasMotorista[r.motorista] || 0) + 1;
  });

  // --- 4. Valor recebido por motorista ---
  const valorMotorista = {};
  dados.forEach(r => {
    valorMotorista[r.motorista] =
      (valorMotorista[r.motorista] || 0) + Number(r.total);
  });

  // --- 5. Carro Próprio x Empresa ---
  const carroResumo = { "Carro Próprio": 0, "Carro da Empresa": 0 };
  dados.forEach(r => {
    if (r.carro && r.carro.toLowerCase().includes("próprio")) {
      carroResumo["Carro Próprio"]++;
    } else {
      carroResumo["Carro da Empresa"]++;
    }
  });

  // --- 6. Envio: Motorista x Supervisor ---
  const envioResumo = { Motorista: 0, "Supervisor de Montagem": 0 };
  dados.forEach(r => {
    if (!r.quemEnviou) return;
    if (r.quemEnviou.toLowerCase().includes("supervisor")) {
      envioResumo["Supervisor de Montagem"]++;
    } else {
      envioResumo["Motorista"]++;
    }
  });

  // --- 7. Teto de gastos ---
  const teto = 4000; // ← depois podemos puxar da sua planilha
  const percentualTeto =
    teto > 0 ? Number(((valorTotal / teto) * 100).toFixed(2)) : 0;

return {
    totalCorridas,
    valorTotal: valorTotal.toFixed(2),
    mediaValor: mediaValor.toFixed(2),
    mediaHoras: mediaHoras.toFixed(2),
    statusResumo,
    percentualTeto, // ← OK manter, é apenas a porcentagem

    grafCorridasMotorista: corridasMotorista,
    grafValorMotorista: valorMotorista,
    grafCarro: carroResumo,
    grafEnvio: envioResumo
};

  };

/****************************************************
 * 6) EXPORTAÇÃO EXCEL
 ****************************************************/
function exportarExcelCorridas(filtros) {
  const dados = getCorridas(filtros);

  const ss = SpreadsheetApp.create("Exportação Corridas");
  const aba = ss.getActiveSheet();

  aba.appendRow([
    "Quem Enviou", "Motorista", "Data", "Carro",
    "Embarque", "Destino", "Horas", "Total", "Status"
  ]);

  dados.forEach(l => {
    aba.appendRow([
      l.quemEnviou,
      l.motorista,
      l.data,
      l.carro,
      l.embarque,
      l.destino,
      l.horas,
      l.total,
      l.status
    ]);
  });

  return ss.getUrl();
}

/****************************************************
 * 7) EXPORTAÇÃO PDF
 ****************************************************/
function exportarPDFCorridas(filtros) {

  const usuario = filtros.usuario || "Usuário";
  const dataExportacao = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm");

  let dados = getCorridas(filtros);

  let html = `
  <html><head>
    <style>
      body { font-family: Arial; padding: 25px; background:#F3F4F6; color:#1E293B; }
      h1 { text-align:center; color:#1E40AF; }
      table { width:100%; border-collapse:collapse; }
      th { background:#1E40AF; color:white; padding:8px; }
      td { border:1px solid #E5E7EB; padding:8px; }
      tr:nth-child(even) { background:#EEF2FF; }
    </style>
  </head><body>

    <h1>Relatório de Corridas Uber</h1>
    <p>Exportado em <b>${dataExportacao}</b><br>Usuário: <b>${usuario}</b></p>
    <table>
      <tr><th>Quem Enviou</th><th>Motorista</th><th>Data</th><th>Carro</th><th>Embarque</th><th>Destino</th><th>Horas</th><th>Total</th><th>Status</th></tr>
      ${dados.map(row => `
        <tr>
          <td>${row.quemEnviou}</td>
          <td>${row.motorista}</td>
          <td>${row.data}</td>
          <td>${row.carro}</td>
          <td>${row.embarque}</td>
          <td>${row.destino}</td>
          <td>${row.horas}</td>
          <td>${row.total}</td>
          <td>${row.status}</td>
        </tr>
      `).join("")}
    </table>

  </body></html>
  `;

  const blob = Utilities.newBlob(html, "text/html").getAs("application/pdf");
  blob.setName("Relatorio.pdf");

  return "data:application/pdf;base64," + Utilities.base64Encode(blob.getBytes());
}
