/****************************************************
 * TROCA DE MATERIAL (app do montador -> cronograma)
 *
 * 1. O montador pede a troca no app: item, quantidade,
 *    motivo e foto do dano.            -> PENDENTE
 * 2. A equipe do galpão marca no cronograma que separou
 *    (senha de Operações Internas/Galpão). -> SEPARADO
 * 3. O Supervisor de Montagem marca que enviou. -> ENVIADO
 *
 * Aba criada automaticamente: Montagem_Trocas
 ****************************************************/

const TROCA_ABA = "Montagem_Trocas";

const TROCA_CABECALHO = [
  "ID", "ID Etapa", "Pedido", "Cliente", "Etapa", "Data etapa",
  "Item", "Quantidade", "Motivo", "Descrição", "Foto (Drive)", "ID Foto",
  "Solicitado por", "Solicitado em", "Status",
  "Separado por", "Separado em", "Enviado por", "Enviado em", "Observação"
];

const TROCA_PENDENTE = "PENDENTE";
const TROCA_SEPARADO = "SEPARADO";
const TROCA_ENVIADO = "ENVIADO";
const TROCA_CANCELADO = "CANCELADO";

const TROCA_MOTIVOS = [
  "Danificou no transporte",
  "Quebrou no local",
  "Faltou o item"
];


/****************************************************
 * LEITURA
 ****************************************************/
function TROCA_aba_() {

  const planilha = SpreadsheetApp.openById(FREE_SPREADSHEET_ID);
  let aba = planilha.getSheetByName(TROCA_ABA);

  if (!aba) {
    aba = planilha.insertSheet(TROCA_ABA);
    aba.getRange(1, 1, 1, TROCA_CABECALHO.length)
      .setValues([TROCA_CABECALHO])
      .setFontWeight("bold")
      .setBackground("#2b2a26")
      .setFontColor("#ffffff");
    aba.setFrozenRows(1);
    aba.getRange(1, 1, aba.getMaxRows(), TROCA_CABECALHO.length).setNumberFormat("@");
  }

  return aba;
}

function TROCA_paraObjeto_(linha, indice) {
  return {
    linha: indice + 2,
    id: linha[0],
    idEtapa: linha[1],
    pedido: linha[2],
    cliente: linha[3],
    etapa: linha[4],
    dataEtapa: linha[5],
    item: linha[6],
    quantidade: linha[7],
    motivo: linha[8],
    descricao: linha[9],
    fotoUrl: linha[10],
    fotoId: linha[11],
    solicitadoPor: linha[12],
    solicitadoEm: linha[13],
    status: linha[14] || TROCA_PENDENTE,
    separadoPor: linha[15],
    separadoEm: linha[16],
    enviadoPor: linha[17],
    enviadoEm: linha[18],
    observacao: linha[19]
  };
}

function TROCA_lerTodas_() {

  const aba = TROCA_aba_();
  const ultima = aba.getLastRow();

  if (ultima < 2) {
    return [];
  }

  return aba.getRange(2, 1, ultima - 1, TROCA_CABECALHO.length)
    .getDisplayValues()
    .map(TROCA_paraObjeto_)
    .filter(function (t) { return t.id && t.status !== TROCA_CANCELADO; });
}

/* Usado pelo cronograma e pelo app do montador: { idEtapa: [trocas] } */
function TROCA_mapaPorEtapa_() {

  const mapa = {};

  TROCA_lerTodas_().forEach(function (t) {
    delete t.linha;
    (mapa[t.idEtapa] = mapa[t.idEtapa] || []).push(t);
  });

  return mapa;
}


/****************************************************
 * APP DO MONTADOR: PEDIR E CANCELAR
 ****************************************************/
function MONT_solicitarTroca(token, dados) {

  const sessao = MONT_autenticar_(token);
  dados = dados || {};

  const etapa = getEtapaOperacao(dados.idEtapa);

  if (!etapa || !MONT_podeVer_(sessao, etapa)) {
    throw new Error("Você não tem acesso a esta etapa.");
  }

  const item = FREE_texto_(dados.item, 200);
  const quantidade = Math.floor(Number(dados.quantidade));
  const motivo = FREE_texto_(dados.motivo);

  if (!item) {
    throw new Error("Informe qual item precisa ser trocado.");
  }

  if (!(quantidade >= 1)) {
    throw new Error("Informe a quantidade.");
  }

  if (TROCA_MOTIVOS.indexOf(motivo) < 0) {
    throw new Error("Escolha o motivo.");
  }

  if (!dados.foto) {
    throw new Error("Tire uma foto do item.");
  }

  const id = FREE_novoId_("TROCA");
  const foto = uploadFotoChecklist(dados.foto, id + "_" + item + ".jpg");
  const data = parseData(etapa.dataEtapa);

  return FREE_comLock_(function () {

    TROCA_aba_().appendRow([
      id, String(etapa.id), etapa.pedido, etapa.cliente, etapa.etapa,
      data ? formatISO(data) : etapa.dataEtapa,
      item, String(quantidade), motivo, FREE_texto_(dados.descricao, 500),
      foto.url, foto.id, sessao.nome, FREE_agoraTexto_(), TROCA_PENDENTE,
      "", "", "", "", ""
    ]);

    return TROCA_mapaPorEtapa_()[String(etapa.id)] || [];
  });
}

function MONT_cancelarTroca(token, idTroca) {

  const sessao = MONT_autenticar_(token);

  return FREE_comLock_(function () {

    const troca = TROCA_lerTodas_().filter(function (t) { return t.id === idTroca; })[0];

    if (!troca) {
      throw new Error("Solicitação não encontrada.");
    }

    const etapa = getEtapaOperacao(troca.idEtapa);

    if (!etapa || !MONT_podeVer_(sessao, etapa)) {
      throw new Error("Você não tem acesso a esta solicitação.");
    }

    if (troca.status !== TROCA_PENDENTE) {
      throw new Error("O galpão já separou este item. Fale com o supervisor.");
    }

    const aba = TROCA_aba_();
    aba.getRange(troca.linha, 15).setValue(TROCA_CANCELADO);
    aba.getRange(troca.linha, 20).setValue("Cancelado por " + sessao.nome + " em " + FREE_agoraTexto_());

    return TROCA_mapaPorEtapa_()[String(troca.idEtapa)] || [];
  });
}


/****************************************************
 * CRONOGRAMA: GALPÃO SEPARA, SUPERVISOR ENVIA
 * (token da senha do cronograma)
 ****************************************************/
function TROCA_atualizarStatus(token, idTroca, novoStatus) {

  const sessao = AUD_validarTokenSessao_(token);

  if (!sessao) {
    throw new Error("SESSAO_EXPIRADA: digite a senha novamente.");
  }

  if (novoStatus === TROCA_SEPARADO && ["internas", "montagem"].indexOf(sessao.perfil) < 0) {
    throw new Error("Só a equipe do galpão (ou o supervisor) marca como separado.");
  }

  if (novoStatus === TROCA_ENVIADO && sessao.perfil !== "montagem") {
    throw new Error("Só o Supervisor de Montagem marca como enviado.");
  }

  if ([TROCA_SEPARADO, TROCA_ENVIADO].indexOf(novoStatus) < 0) {
    throw new Error("Status inválido.");
  }

  return FREE_comLock_(function () {

    const troca = TROCA_lerTodas_().filter(function (t) { return t.id === idTroca; })[0];

    if (!troca) {
      throw new Error("Solicitação não encontrada.");
    }

    const aba = TROCA_aba_();
    const agora = FREE_agoraTexto_();

    if (novoStatus === TROCA_SEPARADO) {
      if (troca.status !== TROCA_PENDENTE) {
        throw new Error("Esta troca já foi marcada como separada.");
      }
      aba.getRange(troca.linha, 15, 1, 3).setValues([[TROCA_SEPARADO, sessao.usuario, agora]]);
    } else {
      if (troca.status === TROCA_ENVIADO) {
        throw new Error("Esta troca já foi enviada.");
      }
      // Se o galpão não marcou, registra a separação junto
      if (troca.status === TROCA_PENDENTE) {
        aba.getRange(troca.linha, 16, 1, 2).setValues([[sessao.usuario + " (junto com o envio)", agora]]);
      }
      aba.getRange(troca.linha, 15).setValue(TROCA_ENVIADO);
      aba.getRange(troca.linha, 18, 1, 2).setValues([[sessao.usuario, agora]]);
    }

    return TROCA_mapaPorEtapa_()[String(troca.idEtapa)] || [];
  });
}

function TROCA_listarEtapa(idEtapa) {
  return TROCA_mapaPorEtapa_()[String(idEtapa)] || [];
}
