/****************************************************
 * APP DO MOTORISTA
 * Grava na aba "CORRIDAS UBER" no mesmo formato que o
 * Controle de Corridas lê (16 colunas):
 * A Carimbo · B Quem enviou? · C Nome completo · D Data · E Carro
 * F Embarque · G Destino · H H.E · I V.H · J Km · K V.K · L Total
 * M Celular · N Pix · O Observações · P Status
 ****************************************************/

const ID_PLANILHA_CORRIDAS = "1qYMrypoMvB7t1kwmw-lm_Dye7262OhifKEpXEW5oWow";
const ABA_CORRIDAS = "CORRIDAS UBER";
const ENDERECO_BASE = "Chiavari Eventos - Estrada União e Indústria - Itaipava, Petrópolis - RJ, Brasil";

function apenasDigitos_(v){ return String(v || "").replace(/\D/g, ""); }

/* "dd/MM/yyyy" → Date (meio-dia, para não virar o dia anterior no fuso) */
function dataDoPedido_(texto){
  const m = String(texto || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) : "";
}

/* Corridas disponíveis: pedidos da semana (mesma regra de antes) com o valor já calculado */
function getCorridasDisponiveis(semana){
  return getPedidosSemanaCorridas(semana).map(function(p){
    const km = Number(p.distancia) || 0;
    return {
      pedido: p.pedido,
      local: p.local || "",
      data: p.data,
      km: km,
      valorIda: calcularValorKm(km),
      valorIdaVolta: calcularValorKm(km * 2)
    };
  });
}

/* Envia a corrida. O valor é recalculado aqui, a partir da distância do pedido na planilha. */
function enviarCorridaApp(dados){
  dados = dados || {};

  const nome = String(dados.nome || "").trim();
  const telefone = String(dados.telefone || "").trim();
  const pix = String(dados.pix || "").trim();
  const tipo = dados.tipo === "IDA_VOLTA" ? "IDA_VOLTA" : "IDA";
  const supervisor = dados.supervisor === true || dados.supervisor === "true";

  if (!nome) return { ok:false, erro:"Informe o nome do motorista." };
  if (apenasDigitos_(telefone).length < 10) return { ok:false, erro:"Informe um telefone com DDD." };
  if (!pix) return { ok:false, erro:"Informe a chave Pix." };

  if (supervisor && !verificarSenhaSupervisor(String(dados.senhaSupervisor || ""))) {
    return { ok:false, erro:"Senha do supervisor incorreta." };
  }

  // Procura o pedido na semana escolhida (atual ou anterior)
  const semana = Number(dados.semana) === 1 ? 1 : 0;
  const pedido = getPedidosSemanaCorridas(semana).filter(function(p){ return String(p.pedido) === String(dados.pedido); })[0];
  if (!pedido) return { ok:false, erro:"Esse pedido não está mais disponível. Atualize a lista." };

  const kmBase = Number(pedido.distancia) || 0;
  const km = tipo === "IDA_VOLTA" ? kmBase * 2 : kmBase;
  const valor = calcularValorKm(km);
  const dataEvento = dataDoPedido_(pedido.data);
  const destino = pedido.local || "";

  const aba = SpreadsheetApp.openById(ID_PLANILHA_CORRIDAS).getSheetByName(ABA_CORRIDAS);

  // Bloqueia a mesma corrida enviada duas vezes (mesmo telefone, pedido e tipo)
  const marca = "Pedido " + pedido.pedido + " · " + (tipo === "IDA_VOLTA" ? "Ida e volta" : "Só ida");
  const ultima = aba.getLastRow();
  if (ultima >= 2) {
    const linhas = aba.getRange(2, 1, ultima - 1, 16).getValues();
    const fone = apenasDigitos_(telefone);
    const repetida = linhas.some(function(l){
      return apenasDigitos_(l[12]) === fone && String(l[14] || "").indexOf("Pedido " + pedido.pedido + " ·") === 0 && String(l[15] || "") !== "Recusado";
    });
    if (repetida) return { ok:false, erro:"Você já enviou uma corrida para o pedido " + pedido.pedido + "." };
  }

  const observacoes = marca + (String(dados.observacoes || "").trim() ? " · " + String(dados.observacoes).trim() : "");

  aba.appendRow([
    new Date(),                                        // A Carimbo
    supervisor ? "Supervisor de Montagem" : "Motorista", // B Quem enviou?
    nome,                                              // C Nome completo
    dataEvento,                                        // D Data (do evento)
    dados.carro === "Carro da Empresa" ? "Carro da Empresa" : "Carro Próprio", // E Carro
    "Chiavari Eventos",                                // F Embarque
    destino,                                           // G Destino
    0,                                                 // H H.E
    0,                                                 // I V.H
    km,                                                // J Km
    valor,                                             // K V.K
    valor,                                             // L Total
    telefone,                                          // M Celular
    pix,                                               // N Pix
    observacoes,                                       // O Observações
    "Pendente"                                         // P Status
  ]);

  const linha = aba.getLastRow();
  aba.getRange(linha, 4).setNumberFormat("dd/MM/yyyy");
  aba.getRange(linha, 11, 1, 2).setNumberFormat("R$ #,##0.00");

  return { ok:true, pedido:pedido.pedido, destino:destino, data:pedido.data, km:km, valor:valor, tipo:tipo };
}

/* Corridas enviadas por este motorista (pelo telefone), mais recentes primeiro */
function getMinhasCorridas(telefone){
  const fone = apenasDigitos_(telefone);
  if (fone.length < 10) return [];
  const aba = SpreadsheetApp.openById(ID_PLANILHA_CORRIDAS).getSheetByName(ABA_CORRIDAS);
  const ultima = aba.getLastRow();
  if (ultima < 2) return [];
  const fuso = Session.getScriptTimeZone();
  return aba.getRange(2, 1, ultima - 1, 16).getValues()
    .filter(function(l){ return apenasDigitos_(l[12]) === fone; })
    .map(function(l){
      const data = l[3] instanceof Date ? Utilities.formatDate(l[3], fuso, "dd/MM/yyyy") : String(l[3] || "");
      const enviado = l[0] instanceof Date ? l[0].getTime() : 0;
      return {
        enviadoEm: enviado,
        data: data,
        destino: String(l[6] || ""),
        km: Number(l[9]) || 0,
        total: Number(l[11]) || 0,
        status: String(l[15] || "Pendente").trim() || "Pendente",
        detalhe: String(l[14] || "")
      };
    })
    .sort(function(a, b){ return b.enviadoEm - a.enviadoEm; })
    .slice(0, 40);
}

/* Confere a senha do supervisor na hora (para liberar o modo supervisor) */
function conferirSenhaSupervisorApp(senha){
  return verificarSenhaSupervisor(String(senha || ""));
}
