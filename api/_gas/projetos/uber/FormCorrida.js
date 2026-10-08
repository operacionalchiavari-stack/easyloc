/****************************************************
 * FUNÇÃO NOVA — Cálculo por faixas
 ****************************************************/
function calcularValorKm(km) {

  km = Number(km) || 0;

  let total = 0;

  // 0–10 km = 3,50
  if (km > 0) {
    const faixa = Math.min(km, 10);
    total += faixa * 4.5;
  }

  // 11–20 km = 2,50
  if (km > 10) {
    const faixa = Math.min(km - 10, 10);
    total += faixa * 2.5;
  }

  // 21–40 km = 2,00
  if (km > 20) {
    const faixa = Math.min(km - 20, 20);
    total += faixa * 2.0;
  }

  // 41+ km = 1,80
  if (km > 40) {
    total += (km - 40) * 1.8;
  }

  return Number(total.toFixed(2));
}


/****************************************************
 * 1) Verifica senha do Supervisor de Montagem
 ****************************************************/
function verificarSenhaSupervisor(senhaDigitada) {

  const ss = SpreadsheetApp.openById("133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk");
  const aba = ss.getSheetByName("Senhas");

  const dados = aba.getRange(1, 1, aba.getLastRow(), 2).getValues();

  for (let i = 0; i < dados.length; i++) {
    const cargo = String(dados[i][0]).trim();
    const senha = String(dados[i][1]).trim();

    if (cargo === "Superv Montagem") {
      return senhaDigitada === senha;
    }
  }

  return false;
}


/****************************************************
 * 2) Salvar Corrida na aba "CORRIDAS UBER"
 ****************************************************/
function salvarCorrida(form) {

const ss = SpreadsheetApp.openById(
"1qYMrypoMvB7t1kwmw-lm_Dye7262OhifKEpXEW5oWow"
);

const aba = ss.getSheetByName("CORRIDAS UBER");

// Validação Supervisor

if (form.isSupervisor === "true") {

if (!verificarSenhaSupervisor(form.senhaSupervisor)) {
  return "SENHA_INCORRETA";
}

}

const dataHoraEnvio = new Date();

const quemEnviou =
form.isSupervisor === "true"
? "Supervisor de Montagem"
: "Motorista";

const nomeCompleto =
form.nomeCompleto || "";

const pedido =
form.pedido || "";

const dataEvento =
form.dataCorrida || "";

const localEvento =
form.local || "";

const tipoCorrida =
form.tipoCorrida || "";

const distanciaBase =
Number(form.distanciaBase || 0);

const kmConsiderado =
Number(form.kmRodado || 0);

const valorPrevisto =
Number(form.valorPrevisto || 0);

const telefone =
form.telefone || "";

const pix =
form.pix || "";

const observacoes =
form.observacoes || "";

aba.appendRow([

dataHoraEnvio,     // A Data/Hora Envio
quemEnviou,        // B Quem Enviou
nomeCompleto,      // C Nome Completo
pedido,            // D Pedido
dataEvento,        // E Data Evento
localEvento,       // F Local Evento
tipoCorrida,       // G Tipo Corrida
distanciaBase,     // H Distância Base
kmConsiderado,     // I KM Considerado
valorPrevisto,     // J Valor Previsto
telefone,          // K Telefone
pix,               // L PIX
observacoes        // M Observações

]);

const ultimaLinha = aba.getLastRow();

aba.getRange(ultimaLinha, 10)
.setNumberFormat("R$ #,##0.00");

return "OK";

}

function getPedidosSemanaCorridas(semanaSelecionada) {

  semanaSelecionada = Number(semanaSelecionada || 0);

  const ss = SpreadsheetApp.openById(
    "1uVhL4YbFbheyWDfVpDSwzPRg1P4AmgkMhAUhogrSVQs"
  );

  const aba = ss.getSheetByName("Fretes CH");
  const dados = aba.getDataRange().getValues();

  const hoje = new Date();

  const diaSemana = hoje.getDay();

  let diasDesdeTerca = 0;

  switch (diaSemana) {

    case 0: // Domingo
      diasDesdeTerca = 5;
      break;

    case 1: // Segunda
      diasDesdeTerca = 6;
      break;

    case 2: // Terça
      diasDesdeTerca = 0;
      break;

    case 3: // Quarta
      diasDesdeTerca = 1;
      break;

    case 4: // Quinta
      diasDesdeTerca = 2;
      break;

    case 5: // Sexta
      diasDesdeTerca = 3;
      break;

    case 6: // Sábado
      diasDesdeTerca = 4;
      break;
  }

  // Semana atual = 0
  // Semana anterior = 1

  const inicioSemana = new Date(hoje);

  inicioSemana.setDate(
    hoje.getDate() -
    diasDesdeTerca -
    (semanaSelecionada * 7)
  );

  inicioSemana.setHours(0, 0, 0, 0);

  const fimSemana = new Date(inicioSemana);

  fimSemana.setDate(
    inicioSemana.getDate() + 6
  );

  fimSemana.setHours(
    23, 59, 59, 999
  );

  const pedidos = {};

  for (let i = 1; i < dados.length; i++) {

    const linha = dados[i];

    const dataEvento = linha[3]; // D
    const numeroPedido = String(linha[4] || "").trim(); // E
    const destino = String(linha[6] || "").trim(); // G
    const km = Number(linha[8] || 0); // I

    if (!numeroPedido) continue;

    if (!(dataEvento instanceof Date)) continue;

    if (
      dataEvento < inicioSemana ||
      dataEvento > fimSemana
    ) {
      continue;
    }

    const ehGalpao =
      destino.toUpperCase().includes("CHIAVARI EVENTOS");

    if (!pedidos[numeroPedido]) {

      pedidos[numeroPedido] = {
        pedido: numeroPedido,
        local: ehGalpao ? "" : destino,
        distancia: km,
        data: Utilities.formatDate(
          dataEvento,
          Session.getScriptTimeZone(),
          "dd/MM/yyyy"
        )
      };

    } else {

      if (
        !pedidos[numeroPedido].local &&
        !ehGalpao
      ) {
        pedidos[numeroPedido].local = destino;
      }

    }

  }

  return Object.values(pedidos)
    .sort((a, b) => Number(b.pedido) - Number(a.pedido));

}