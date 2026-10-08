/****************************************************
 * ENVIAR FRETES — SALVA NAS ABAS "Fretes" OU "Fretes Ch"
 ****************************************************/
/****************************************************
 * TRAVAS DE SEGURANÇA DO CADASTRO
 ****************************************************/

// Corridas do mesmo pedido ficam perto umas das outras (ida, volta, montagem).
// Se o pedido só tem fretes a mais de 15 dias, provavelmente o número foi digitado errado.
const JANELA_PEDIDO_DIAS = 15;

function normalizarTexto(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\|/g, "-").replace(/\s+/g, " ").trim();
}

/* Data da planilha (Date, "dd/mm/aaaa" ou "aaaa-mm-dd") → "aaaa-mm-dd" */
function dataISO(v) {
  if (v instanceof Date) return Utilities.formatDate(v, "GMT-03:00", "yyyy-MM-dd");
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return m[3] + "-" + m[2] + "-" + m[1];
  return "";
}

/* { pedido: [ [data, transportadora, origem, destino], ... ] } das abas Fretes e Fretes Ch */
function pedidosExistentes() {
  const ss = SpreadsheetApp.openById("1uVhL4YbFbheyWDfVpDSwzPRg1P4AmgkMhAUhogrSVQs");
  const mapa = {};
  ["Fretes", "Fretes Ch"].forEach(nome => {
    const aba = ss.getSheetByName(nome);
    if (!aba || aba.getLastRow() < 2) return;
    aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues().forEach(l => {
      const p = String(limparPedido(l[4])).trim();
      const d = dataISO(l[3]);
      if (!p || !d) return;
      (mapa[p] = mapa[p] || []).push([d, normalizarTexto(l[2]), normalizarTexto(l[6]), normalizarTexto(l[7])]);
    });
  });
  return mapa;
}

/* Mesma regra da tela, repetida aqui para ninguém passar por fora */
function conferirFretes(fretes) {
  const mapa = pedidosExistentes();
  const dia = 86400000;
  const hoje = new Date(Utilities.formatDate(new Date(), "GMT-03:00", "yyyy-MM-dd") + "T12:00:00");
  const erros = [];

  fretes.forEach((f, i) => {
    const p = String(f.numeroPedido || "").trim();
    const d = dataISO(f.dataFrete);
    const quando = new Date(d + "T12:00:00");
    const rotulo = "Corrida " + (i + 1) + " (pedido " + p + ")";

    if (!/^\d+$/.test(p)) { erros.push(rotulo + ": número do pedido inválido."); return; }
    if (!d) { erros.push(rotulo + ": data inválida."); return; }
    if (quando > hoje) erros.push(rotulo + ": data no futuro.");
    if (normalizarTexto(f.origem) === normalizarTexto(f.destino)) erros.push(rotulo + ": origem igual ao destino.");
    if (!(Number(f.valor) > 0)) erros.push(rotulo + ": valor precisa ser maior que zero.");

    const existentes = (mapa[p] || []).concat(fretes.slice(0, i)
      .filter(o => String(o.numeroPedido).trim() === p)
      .map(o => [dataISO(o.dataFrete), normalizarTexto(o.transp), normalizarTexto(o.origem), normalizarTexto(o.destino)]));

    const igual = existentes.some(e => e[0] === d && e[1] === normalizarTexto(f.transp) &&
      e[2] === normalizarTexto(f.origem) && e[3] === normalizarTexto(f.destino));
    if (igual) erros.push(rotulo + ": essa corrida já foi lançada (mesma data, transportadora e rota).");

    if (existentes.length && !igual) {
      const perto = Math.min(...existentes.map(e => Math.abs(new Date(e[0] + "T12:00:00") - quando) / dia));
      if (perto > JANELA_PEDIDO_DIAS) {
        erros.push(rotulo + ": esse pedido já tem fretes em outras datas (o mais próximo a " + Math.round(perto) +
          " dias). Confira o número do pedido.");
      }
    }
  });

  if (erros.length) throw new Error(erros.join(" | "));
}

function enviarFretes(fretes) {

  conferirFretes(fretes);

  const ss = SpreadsheetApp.openById("1uVhL4YbFbheyWDfVpDSwzPRg1P4AmgkMhAUhogrSVQs");

  fretes.forEach(f => {

    // 🔥 Define automaticamente a aba de destino com base no RESPONSÁVEL
    const aba =
      f.responsavel === "Supervisor de Montagem"
        ? ss.getSheetByName("Fretes Ch")      // nova aba
        : ss.getSheetByName("Fretes");        // aba normal

    // Prepara linha para inserir
    const linha = [
      new Date(),               // A – Automático (data/hora)
      f.responsavel,            // B – Responsável
      f.transp,                 // C – Transportadora
      f.dataFrete,              // D – Data frete
      f.numeroPedido,           // E – Nº pedido
      f.caminhao,               // F – Caminhão
      f.origem,                 // G – De onde
      f.destino,                // H – Para onde
      Number(f.km),             // I – KM
      f.cidade,                 // J – Cidade
      Number(f.valor),          // K – Valor frete
      f.obs || "",              // L – Observações
      "PENDENTE"                // M – Status
    ];

    // Insere na aba correspondente
    aba.appendRow(linha);
  });
}


/****************************************************
 * KM AUTOMÁTICO — GOOGLE DISTANCE MATRIX
 ****************************************************/
function buscarDistancia(origem, destino) {

  const apiKey = "AIzaSyBRTnhpv3S0kqV9G56x0npaxd6YABj8dnI";

  // "|" separa vários endereços na API do Google: "Vale dos Desejos | Casamento..."
  // viraria dois endereços e o KM sairia errado. Troca por "-".
  const limpar = (texto) => String(texto || "").replace(/\|/g, " - ").replace(/\s+/g, " ").trim();

  const url =
    "https://maps.googleapis.com/maps/api/distancematrix/json?" +
    "origins=" + encodeURIComponent(limpar(origem)) +
    "&destinations=" + encodeURIComponent(limpar(destino)) +
    "&mode=driving&language=pt-BR&units=metric&region=br" +
    "&key=" + apiKey;

  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const json = JSON.parse(response.getContentText());

  if (json.status !== "OK") {
    throw new Error("Google não calculou a rota (" + json.status + (json.error_message ? ": " + json.error_message : "") + ")");
  }

  const elemento = json.rows && json.rows[0] && json.rows[0].elements && json.rows[0].elements[0];
  if (!elemento || elemento.status !== "OK" || !elemento.distance) {
    throw new Error("Rota não encontrada entre esses endereços");
  }

  const km = elemento.distance.value / 1000;

  return { km: km.toFixed(2) };
}
