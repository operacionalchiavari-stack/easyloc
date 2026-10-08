/****************************************************
 * CONFIGURAÇÕES
 ****************************************************/
const ID_PLANILHA = "1uVhL4YbFbheyWDfVpDSwzPRg1P4AmgkMhAUhogrSVQs";
const ABA_FRETES  = "Fretes";
const ABA_CH      = "Fretes Ch";

/****************************************************
 * LER ABA
 ****************************************************/
function lerAba(nomeAba) {
  const ss   = SpreadsheetApp.openById(ID_PLANILHA);
  const aba  = ss.getSheetByName(nomeAba);
  const ult  = aba.getLastRow();
  if (ult < 2) return [];

  const dados = aba.getRange(2, 1, ult - 1, 13).getValues();
  let lista = [];

  dados.forEach(l => {
    if (!l[4]) return; // sem número de pedido, ignora

    lista.push({
      dataEnvio     : l[0] || "",
      responsavel   : l[1] || "",
      transportadora: l[2] || "",
      data          : l[3] ? new Date(l[3]) : "",
      pedido        : limparPedido(l[4]),
      caminhao      : l[5] || "",
      origem        : l[6] || "",
      destino       : l[7] || "",
      km            : Number(l[8])  || 0,
      cidade        : l[9]  || "",
      valor         : Number(l[10]) || 0,
      obs           : l[11] || "",
      status        : l[12] || "",
      origemTabela  : nomeAba
    });
  });

  return lista;
}

/* Pedido que a planilha transformou em data. Data não pode ir para a página:
   o Google descarta a resposta inteira.
   - digitado "1556" e lido como ano  → 01/01/1556 → 1556
   - número em coluna formatada como data → 1280 vira 03/07/1903 → 1280 */
function limparPedido(valor) {
  if (valor instanceof Date) {
    if (valor.getFullYear() < 1899) return valor.getFullYear();
    const base = new Date(1899, 11, 30);
    return Math.round((valor.getTime() - base.getTime()) / 86400000);
  }
  return valor === null || valor === undefined ? "" : valor;
}

/* Linhas novas na aba Valor Final: pedido como número e datas como texto,
   senão a planilha converte para data e o pedido deixa de ser encontrado. */
function formatarLinhasBD(aba, primeira, quantidade) {
  aba.getRange(primeira, 2, quantidade, 1).setNumberFormat("0");
  aba.getRange(primeira, 4, quantidade, 1).setNumberFormat("@");
}

/* Fretes individuais de um pedido (para abrir o agrupamento na tela) */
function itensDoGrupo(g) {
  const mapear = (tipo) => (f) => ({
    tipo    : tipo,
    data    : formatarData(f.data),
    ordem   : f.data ? new Date(f.data).getTime() : 0,
    caminhao: String(f.caminhao || ""),
    km      : Number(f.km) || 0,
    cidade  : String(f.cidade || ""),
    origem  : String(f.origem || ""),
    destino : String(f.destino || ""),
    valor   : f.valor
  });
  return g.fretes.map(mapear("TRANSP")).concat(g.ch.map(mapear("CH")))
    .sort((a, b) => a.ordem - b.ordem || a.tipo.localeCompare(b.tipo));
}

function formatarData(dt) {
  if (!dt) return "";
  return Utilities.formatDate(new Date(dt), "GMT-03:00", "dd/MM/yyyy");
}

/****************************************************
 * LER BANCO DE VALOR FINAL
 ****************************************************/
function getValoresFinaisBD() {

  const ss  = SpreadsheetApp.openById(ID_PLANILHA);
  const aba = ss.getSheetByName("Valor Final");
  if (!aba) return [];

  const ultima = aba.getLastRow();
  if (ultima < 2) return [];

  const dados = aba.getRange(2, 1, ultima - 1, 13).getValues();

  return dados.map(l => ({
    dataAlteracao     : l[0] || "",
    pedido            : limparPedido(l[1]),
    transportadora    : l[2] || "",
    datas             : l[3] || "",
    origem            : l[4] || "",
    destino           : l[5] || "",
    valorCh           : Number(l[6] || 0),
    valorTransp       : Number(l[7] || 0),
    valorFinal        : Number(l[8] || 0),
    observacao        : l[9] || "",
    statusPagamento   : l[10] || "",
    dataPagamento     : l[11] || "",
    usuarioPagamento  : l[12] || ""
  }));
}

/****************************************************
 * AGRUPAR E RETORNAR CONCILIAÇÃO
 ****************************************************/
function getConciliacao() {

  const fretes = lerAba(ABA_FRETES);
  const ch     = lerAba(ABA_CH);
  const banco  = getValoresFinaisBD();

  let grupos = {};

  [...fretes, ...ch].forEach(item => {

    const chave = item.pedido + "||" + (item.transportadora || "");

    if (!grupos[chave]) {
      grupos[chave] = {
        pedido        : item.pedido,
        transportadora: item.transportadora || "",
        fretes        : [],
        ch            : []
      };
    }

    if (item.origemTabela === ABA_FRETES) grupos[chave].fretes.push(item);
    else grupos[chave].ch.push(item);
  });

  let resultado = [];

  // Índice do BD por pedido + transportadora (evita busca linear a cada grupo)
  const chaveBD = (pedido, transp) =>
    String(pedido).trim() + "||" + String(transp || "").trim().toLowerCase();

  const indiceBD = {};
  banco.forEach(b => { indiceBD[chaveBD(b.pedido, b.transportadora)] = b; });

  // Linhas novas para o BD, gravadas de uma vez só no final
  const novasLinhas = [];
  const agoraTexto  = Utilities.formatDate(new Date(), "GMT-03:00", "dd/MM/yyyy HH:mm:ss");

  Object.values(grupos).forEach(g => {

    const somaFretes = g.fretes.reduce((t, x) => t + x.valor, 0);
    const somaCh     = g.ch.reduce((t, x) => t + x.valor, 0);

    const registroBD = indiceBD[chaveBD(g.pedido, g.transportadora)];

    // 🔥 SE NÃO EXISTIR REGISTRO NO BD, CRIA AUTOMATICAMENTE
    if (!registroBD) {

      novasLinhas.push([
        agoraTexto,
        g.pedido,
        g.transportadora,
        [...g.fretes, ...g.ch].map(x => formatarData(x.data)).join("; "),
        g.fretes[0]?.origem || g.ch[0]?.origem || "",
        g.fretes[0]?.destino || g.ch[0]?.destino || "",
        Number(somaCh || 0),
        Number(somaFretes || 0),
        "",   // ainda sem valor final
        "",   // nenhuma observação
        "",
        "",
        ""
      ]);

      // E agora cria localmente o objeto como se existisse:
      resultado.push({
        pedido: g.pedido,
        transportadora: g.transportadora,
        datas: [...g.fretes, ...g.ch].map(x => formatarData(x.data)).join("<br>"),
        origem: g.fretes[0]?.origem || g.ch[0]?.origem || "",
        destino: g.fretes[0]?.destino || g.ch[0]?.destino || "",
        somaFretes,
        somaCh,
        valorFinal: "",
        observacao: "",
        statusPagamento: "",
        itens: itensDoGrupo(g)
      });

      return; // pula para o próximo grupo
    }

    // SE EXISTE REGISTRO NO BD → usa o registro salvo
    resultado.push({
      pedido: g.pedido,
      transportadora: g.transportadora,
      datas: [...g.fretes, ...g.ch].map(x => formatarData(x.data)).join("<br>"),
      origem: g.fretes[0]?.origem || g.ch[0]?.origem || "",
      destino: g.fretes[0]?.destino || g.ch[0]?.destino || "",
      somaFretes,
      somaCh,
      valorFinal: registroBD.valorFinal,
      observacao: registroBD.observacao,
      statusPagamento: registroBD.statusPagamento,
      itens: itensDoGrupo(g)
    });

  });

  if (novasLinhas.length) {
    const abaBD = SpreadsheetApp.openById(ID_PLANILHA).getSheetByName("Valor Final");
    if (abaBD) {
      const primeira = abaBD.getLastRow() + 1;
      formatarLinhasBD(abaBD, primeira, novasLinhas.length);
      abaBD.getRange(primeira, 1, novasLinhas.length, 13).setValues(novasLinhas);
    }
  }

  return resultado;
}

/****************************************************
 * DETALHES (MODAL)
 ****************************************************/
function getDetalhes(pedido, transportadora) {

  const fretes = lerAba(ABA_FRETES)
    .filter(f => f.pedido == pedido && f.transportadora == transportadora);

  const ch = lerAba(ABA_CH)
    .filter(f => f.pedido == pedido && f.transportadora == transportadora);

  return {
    fretes: fretes.map(f => ({
      data    : formatarData(f.data),
      origem  : f.origem,
      destino : f.destino,
      caminhao: f.caminhao,
      valor   : f.valor
    })),
    ch: ch.map(f => ({
      data    : formatarData(f.data),
      origem  : f.origem,
      destino : f.destino,
      caminhao: f.caminhao,
      valor   : f.valor
    }))
  };
}

/****************************************************
 * SALVAR DECISÃO DE VALOR FINAL
 ****************************************************/
function salvarDecisaoBD(item) {

  const ss  = SpreadsheetApp.openById(ID_PLANILHA);
  const aba = ss.getSheetByName("Valor Final");
  if (!aba) throw new Error('Aba "Valor Final" não encontrada');

  const pedido         = item.pedido;
  const transportadora = item.transportadora || "";

  const datasLimpa = String(item.datas || "")
    .replace(/<br>/g, "; ");

const linhaCompleta = [
    Utilities.formatDate(new Date(), "GMT-03:00", "dd/MM/yyyy HH:mm:ss"),
    pedido,
    transportadora,
    datasLimpa,
    item.origem || "",
    item.destino || "",
    Number(item.somaCh || 0),
    Number(item.somaFretes || 0),
    (item.valorFinal === "" ? "" : Number(item.valorFinal)),   // ✔ CORRETO
    item.observacao || "",
    "",
    "",
    ""
];


  const ultima = aba.getLastRow();
  let linhaEncontrada = -1;

  if (ultima >= 2) {
    const dados = aba.getRange(2, 2, ultima - 1, 2).getValues();

    for (let i = 0; i < dados.length; i++) {
      const pedidoBD = limparPedido(dados[i][0]);
      const transpBD = dados[i][1];

      if (String(pedidoBD) === String(pedido) &&
          String(transpBD).toLowerCase() === transportadora.toLowerCase()) {
        linhaEncontrada = i + 2;
        break;
      }
    }
  }

  if (linhaEncontrada === -1) {
    const primeira = aba.getLastRow() + 1;
    formatarLinhasBD(aba, primeira, 1);
    aba.getRange(primeira, 1, 1, 13).setValues([linhaCompleta]);
  } else {
    aba.getRange(linhaEncontrada, 1, 1, 13).setValues([linhaCompleta]);
  }
}

function registrarPagamentoLote(dados) {

  const ss  = SpreadsheetApp.openById(ID_PLANILHA);
  const aba = ss.getSheetByName("Valor Final");

  const linhas = aba.getRange(2, 1, aba.getLastRow() - 1, 13).getValues();

  const now   = new Date();
  const email = Session.getActiveUser().getEmail();

  dados.corridas.forEach(c => {

    for (let i = 0; i < linhas.length; i++) {

      const pedidoBD = limparPedido(linhas[i][1]);
      const transpBD = linhas[i][2];

      if (String(pedidoBD) === String(c.pedido) &&
          String(transpBD).toLowerCase() === c.transportadora.toLowerCase()) {

        // 🔵 Colunas corretas da aba Valor Final:
        // 0 dataAlteracao
        // 1 pedido
        // 2 transportadora
        // 3 datas
        // 4 origem
        // 5 destino
        // 6 valorCh
        // 7 valorTransp
        // 8 valorFinal
        // 9 observacao
        // 10 statusPagamento
        // 11 dataPagamento
        // 12 usuarioPagamento

        linhas[i][10] = "PAGO";       // statusPagamento
        linhas[i][11] = now;          // dataPagamento
        linhas[i][12] = email;        // usuarioPagamento
      }
    }
  });

  // Gravar de volta (todas as linhas com 13 colunas)
  aba.getRange(2, 1, linhas.length, 13).setValues(linhas);
}

function buscarStatusPagamento(pedido, transportadora) {
  const ss  = SpreadsheetApp.openById(ID_PLANILHA);
  const aba = ss.getSheetByName("Valor Final");

  const ult = aba.getLastRow();
  if (ult < 2) return null;

  const dados = aba.getRange(2, 1, ult - 1, 13).getValues();

  for (let l of dados) {
    
    const ped  = String(limparPedido(l[1])).trim(); // B = pedido
    const transp = String(l[2]).trim(); // C = transportadora

    if (ped === String(pedido) && transp === String(transportadora).trim()) {

return {
  status: String(l[10] || "").trim().toUpperCase(),
  dataPagamento: l[11] ? Utilities.formatDate(new Date(l[11]), "GMT-03:00", "dd/MM/yyyy HH:mm") : "-",
  usuario: l[12] || "-"
};

    }
  }

  return null;
}
