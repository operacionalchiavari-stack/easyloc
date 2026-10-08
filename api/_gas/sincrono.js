// =====================================================================
// Chamada HTTP SÍNCRONA (o código do Apps Script é todo síncrono:
// SpreadsheetApp.openById(...).getValues() devolve na hora). Um worker faz
// o fetch e a thread principal espera com Atomics.wait.
// =====================================================================
const { Worker, MessageChannel, receiveMessageOnPort } = require("worker_threads");

const CODIGO_WORKER = `
const { parentPort } = require("worker_threads");
parentPort.on("message", async ({ sinal, porta, url, opcoes }) => {
  let resposta;
  try {
    const r = await fetch(url, opcoes);
    const corpo = Buffer.from(await r.arrayBuffer());
    const headers = {};
    r.headers.forEach((v, k) => { headers[k] = v; });
    resposta = { status: r.status, headers, corpo: corpo.toString("base64") };
  } catch (e) {
    resposta = { erro: String(e && e.message || e) };
  }
  porta.postMessage(resposta);
  const flag = new Int32Array(sinal);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});
`;

let worker = null;

function obterWorker() {
  if (!worker) {
    worker = new Worker(CODIGO_WORKER, { eval: true });
    worker.unref();
  }
  return worker;
}

/** fetch síncrono: devolve { status, headers, corpo: Buffer } */
function fetchSincrono(url, opcoes, limiteMs) {
  const sinal = new SharedArrayBuffer(4);
  const flag = new Int32Array(sinal);
  const { port1, port2 } = new MessageChannel();
  obterWorker().postMessage({ sinal, porta: port2, url, opcoes: opcoes || {} }, [port2]);
  const r = Atomics.wait(flag, 0, 0, limiteMs || 60000);
  if (r === "timed-out") { port1.close(); throw new Error("Tempo esgotado ao acessar " + url.split("?")[0]); }
  const msg = receiveMessageOnPort(port1);
  port1.close();
  if (!msg) { throw new Error("Sem resposta de " + url.split("?")[0]); }
  if (msg.message.erro) { throw new Error(msg.message.erro); }
  return { status: msg.message.status, headers: msg.message.headers, corpo: Buffer.from(msg.message.corpo, "base64") };
}

module.exports = { fetchSincrono };
