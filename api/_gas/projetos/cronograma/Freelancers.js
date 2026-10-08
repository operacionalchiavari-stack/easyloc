/****************************************************
 * EQUIPE FREE — VAGAS PARA FREELANCERS
 *
 * O supervisor abre vagas a partir de uma etapa do
 * cronograma (ex.: "preciso de 4 free na montagem").
 * Os freelancers se cadastram no app (?page=free),
 * veem as vagas abertas e confirmam ou cancelam a
 * presença. O cronograma mostra quem confirmou.
 *
 * Abas criadas automaticamente na planilha do cronograma:
 *   Free_Cadastros   — cadastro e login dos freelancers
 *   Free_Fotos       — miniatura da foto (base64)
 *   Free_Vagas       — vagas abertas por etapa
 *   Free_Inscricoes  — confirmações, cancelamentos e presença
 *
 * Presença: o líder abre o QR code da vaga (?page=free-qr),
 * que muda a cada minuto. O free lê o QR (ou digita o
 * código de 6 números) para fazer check-in e check-out.
 ****************************************************/

const FREE_SPREADSHEET_ID =
  "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ";

const FREE_ABAS = {
  cadastros: "Free_Cadastros",
  fotos: "Free_Fotos",
  vagas: "Free_Vagas",
  inscricoes: "Free_Inscricoes"
};

const FREE_CABECALHOS = {
  cadastros: [
    "ID", "Nome", "CPF", "Telefone", "Foto (Drive)", "ID Foto",
    "Senha (hash)", "Salt", "Status", "Cadastrado em", "Último acesso",
    "Token", "Token expira", "Observação", "Chave PIX"
  ],
  fotos: [
    "ID Free", "Miniatura"
  ],
  vagas: [
    "ID Vaga", "ID Etapa", "Pedido", "Cliente", "Local", "Etapa",
    "Data", "Horário encontro", "Ponto de encontro", "Líder",
    "Qtd vagas", "Observação", "Status", "Criado por", "Criado em",
    "Atualizado em", "Horário da etapa (base)", "Ponto lat", "Ponto lng",
    "Segredo QR", "Chave do líder", "Valor diária", "Direcionamento",
    "Preferidos", "Aberta a todos em"
  ],
  inscricoes: [
    "ID", "ID Vaga", "ID Free", "Nome", "CPF", "Telefone", "Status",
    "Confirmado em", "Cancelado em", "Motivo", "Cancelado por",
    "Em cima da hora", "Data ciente", "Horário ciente",
    "Check-in em", "Check-in lat", "Check-in lng", "Check-in distância (m)",
    "Check-in via", "Check-out em", "Check-out lat", "Check-out lng",
    "Check-out distância (m)", "Presença lançada por",
    "Foto uniforme", "ID foto uniforme"
  ]
};

// Status do cadastro
const FREE_CAD_PENDENTE = "PENDENTE";
const FREE_CAD_APROVADO = "APROVADO";
const FREE_CAD_BLOQUEADO = "BLOQUEADO";

// Status da vaga
const FREE_VAGA_ABERTA = "ABERTA";
const FREE_VAGA_ENCERRADA = "ENCERRADA";
const FREE_VAGA_CANCELADA = "CANCELADA";

// Status da inscrição
const FREE_INS_CONFIRMADO = "CONFIRMADO";
const FREE_INS_CANCELADO = "CANCELADO";
const FREE_INS_REMOVIDO = "REMOVIDO";

const FREE_DIAS_TOKEN = 60;
const FREE_HORAS_CIMA_DA_HORA = 24;
const FREE_PROP_PASTA_FOTOS = "FREE_PASTA_FOTOS_ID";
const FREE_PROP_URL_OFICIAL = "FREE_URL_OFICIAL";
// Acervo: o link oficial era a implantação antiga do Google Apps Script — os
// links de vagas e do líder mandavam o freelancer para o sistema antigo, com os
// dados antigos. Agora é sempre o endereço deste sistema (ScriptApp.getService().getUrl()).
const FREE_URL_OFICIAL_PADRAO = "";

// Janela de check-in em volta do horário de encontro
const FREE_CHECKIN_ANTES_HORAS = 3;
const FREE_CHECKIN_DEPOIS_HORAS = 12;
// Depois do check-in, o check-out fica liberado por até 24h
const FREE_CHECKOUT_LIMITE_HORAS = 24;
// Acima disso o painel marca "longe do ponto"
const FREE_DISTANCIA_ALERTA_M = 1000;
// QR code de presença: muda a cada minuto e vale pelos últimos minutos
const FREE_QR_JANELA_MS = 60000;
const FREE_QR_TOLERANCIA_JANELAS = 3;
// Ler o QR de novo logo após o check-in não vira check-out
const FREE_MINUTOS_MINIMOS_CHECKOUT = 20;

// Para quem a vaga aparece
const FREE_MODO_TODOS = "TODOS";          // todos os aprovados
const FREE_MODO_PRIORIDADE = "PRIORIDADE"; // escolhidos primeiro, depois todos
const FREE_MODO_EXCLUSIVA = "EXCLUSIVA";   // somente os escolhidos
const FREE_PRAZO_PRIORIDADE_PADRAO_MIN = 120;

// Nota do free (0 a 5 estrelas, começa em 5)
const FREE_NOTA_INICIAL = 5;
const FREE_NOTA_MINIMA = 1;
const FREE_PONTOS = {
  concluido: 0.2,
  cancelouAntes: -0.15,
  cancelouEmCima: -0.5,
  uniformeIncompleto: -0.2,
  semUniforme: -0.4,
  atraso: -0.3,
  semCheckout: -0.2,
  faltou: -1
};
const FREE_TOLERANCIA_ATRASO_MIN = 15;
const FREE_MOTIVO_MINIMO = 5;

// Fases da presença (calculadas, não gravadas)
const FREE_FASE_AGUARDANDO = "AGUARDANDO";
const FREE_FASE_CHECKIN = "CHECKIN";
const FREE_FASE_TRABALHANDO = "TRABALHANDO";
const FREE_FASE_CONCLUIDO = "CONCLUIDO";
const FREE_FASE_SEM_CHECKOUT = "SEM_CHECKOUT";
const FREE_FASE_FALTOU = "FALTOU";
const FREE_FASE_CANCELADA = "CANCELADA";


/****************************************************
 * PLANILHA E ABAS
 ****************************************************/
function FREE_planilha_() {
  return SpreadsheetApp.openById(FREE_SPREADSHEET_ID);
}

function FREE_aba_(chave) {

  const planilha = FREE_planilha_();
  const nome = FREE_ABAS[chave];
  let aba = planilha.getSheetByName(nome);

  if (!aba) {
    const cabecalho = FREE_CABECALHOS[chave];
    aba = planilha.insertSheet(nome);
    aba.getRange(1, 1, 1, cabecalho.length)
      .setValues([cabecalho])
      .setFontWeight("bold")
      .setBackground("#2b2a26")
      .setFontColor("#ffffff");
    aba.setFrozenRows(1);
    // Tudo como texto: evita o Sheets converter CPF, datas e horários
    aba.getRange(1, 1, aba.getMaxRows(), cabecalho.length)
      .setNumberFormat("@");
  } else if (aba.getLastColumn() < FREE_CABECALHOS[chave].length) {
    // Aba criada por uma versão anterior: acrescenta as colunas novas
    const cabecalho = FREE_CABECALHOS[chave];
    aba.getRange(1, 1, 1, cabecalho.length)
      .setValues([cabecalho])
      .setFontWeight("bold")
      .setBackground("#2b2a26")
      .setFontColor("#ffffff");
    aba.getRange(1, 1, aba.getMaxRows(), cabecalho.length)
      .setNumberFormat("@");
  }

  return aba;
}

function FREE_lerLinhas_(chave) {

  const aba = FREE_aba_(chave);
  const ultima = aba.getLastRow();
  const colunas = FREE_CABECALHOS[chave].length;

  if (ultima < 2) {
    return { aba: aba, linhas: [] };
  }

  const valores = aba
    .getRange(2, 1, ultima - 1, colunas)
    .getDisplayValues();

  return { aba: aba, linhas: valores };
}

function FREE_agoraTexto_() {
  return Utilities.formatDate(
    new Date(),
    "America/Sao_Paulo",
    "dd/MM/yyyy HH:mm:ss"
  );
}

function FREE_formatarDataHora_(data) {
  return Utilities.formatDate(data, "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
}

// "dd/MM/yyyy HH:mm[:ss]" -> Date
function FREE_parseDataHora_(texto) {

  const m = String(texto || "").match(
    /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/
  );

  if (!m) {
    return null;
  }

  return new Date(
    Number(m[3]), Number(m[2]) - 1, Number(m[1]),
    Number(m[4]), Number(m[5]), Number(m[6] || 0)
  );
}

// "07:30" / "7h30" / "7h" -> minutos do dia
function FREE_minutos_(texto) {

  const m = String(texto || "").match(/(\d{1,2})\s*[:h]\s*(\d{2})?/i);

  if (!m || Number(m[1]) > 23) {
    return null;
  }

  return Number(m[1]) * 60 + Number(m[2] || 0);
}

function FREE_hhmm_(minutos) {
  const m = ((minutos % 1440) + 1440) % 1440;
  return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2);
}

function FREE_duracaoTexto_(minutos) {
  if (!(minutos >= 0)) {
    return "";
  }
  return Math.floor(minutos / 60) + "h" + ("0" + (minutos % 60)).slice(-2);
}

function FREE_numeroOuVazio_(valor) {
  const n = Number(valor);
  return valor === "" || valor == null || isNaN(n) ? "" : n;
}

function FREE_novoId_(prefixo) {
  return prefixo + "_" +
    Utilities.getUuid().replace(/-/g, "").slice(0, 12).toUpperCase();
}

function FREE_texto_(valor, limite) {
  const texto = String(valor == null ? "" : valor).trim();
  return limite ? texto.slice(0, limite) : texto;
}

function FREE_comLock_(funcao) {

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(20000)) {
    throw new Error("O sistema está ocupado. Tente de novo em alguns segundos.");
  }

  try {
    return funcao();
  } finally {
    lock.releaseLock();
  }
}


/****************************************************
 * CPF, SENHA E TOKEN
 ****************************************************/
function FREE_limparCpf_(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function FREE_cpfValido_(cpf) {

  const n = FREE_limparCpf_(cpf);

  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) {
    return false;
  }

  function digito(base) {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (base.length + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  }

  return (
    digito(n.slice(0, 9)) === Number(n[9]) &&
    digito(n.slice(0, 10)) === Number(n[10])
  );
}

function FREE_formatarCpf_(cpf) {
  const n = FREE_limparCpf_(cpf);
  return n.length === 11
    ? n.slice(0, 3) + "." + n.slice(3, 6) + "." + n.slice(6, 9) + "-" + n.slice(9)
    : n;
}

function FREE_hashSenha_(senha, salt) {

  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + "|" + senha,
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(function (b) {
      return ("0" + (b & 0xff).toString(16)).slice(-2);
    })
    .join("");
}

function FREE_cadastroParaObjeto_(linha, indice) {
  return {
    linha: indice + 2,
    id: linha[0],
    nome: linha[1],
    cpf: linha[2],
    telefone: linha[3],
    fotoUrl: linha[4],
    fotoId: linha[5],
    hash: linha[6],
    salt: linha[7],
    status: linha[8] || FREE_CAD_PENDENTE,
    cadastradoEm: linha[9],
    ultimoAcesso: linha[10],
    token: linha[11],
    tokenExpira: linha[12],
    observacao: linha[13],
    pix: linha[14]
  };
}

/*
 * Retorna o cadastro dono do token
 * ou lança erro de sessão expirada.
 */
function FREE_autenticar_(token) {

  const tokenLimpo = FREE_texto_(token);

  if (!tokenLimpo) {
    throw new Error("SESSAO_EXPIRADA: faça login novamente.");
  }

  const dados = FREE_lerLinhas_("cadastros");
  const agora = new Date().getTime();

  for (let i = 0; i < dados.linhas.length; i++) {

    if (dados.linhas[i][11] !== tokenLimpo) {
      continue;
    }

    const cadastro = FREE_cadastroParaObjeto_(dados.linhas[i], i);

    if (Number(cadastro.tokenExpira) < agora) {
      throw new Error("SESSAO_EXPIRADA: faça login novamente.");
    }

    if (cadastro.status === FREE_CAD_BLOQUEADO) {
      throw new Error("Seu cadastro está bloqueado. Fale com a empresa.");
    }

    return cadastro;
  }

  throw new Error("SESSAO_EXPIRADA: faça login novamente.");
}

/*
 * As funções do painel exigem a senha do
 * Supervisor de Montagem (mesmo token da auditoria).
 */
function FREE_validarAdmin_(token) {

  const sessao = AUD_validarTokenSessao_(token);

  if (!sessao) {
    throw new Error("SESSAO_EXPIRADA: digite a senha novamente.");
  }

  if (sessao.perfil !== "montagem") {
    throw new Error("Acesso permitido apenas para o Supervisor de Montagem.");
  }

  return sessao;
}


/****************************************************
 * FOTOS
 ****************************************************/
function FREE_pastaFotos_() {

  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(FREE_PROP_PASTA_FOTOS);

  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      // pasta apagada: cria outra abaixo
    }
  }

  const pasta = DriveApp.createFolder("Equipe Free - Fotos de cadastro");
  props.setProperty(FREE_PROP_PASTA_FOTOS, pasta.getId());
  return pasta;
}

function FREE_salvarFotoDrive_(dataUrl, nomeArquivo) {

  const partes = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);

  if (!partes) {
    throw new Error("Foto inválida. Tire a foto novamente.");
  }

  const blob = Utilities.newBlob(
    Utilities.base64Decode(partes[2]),
    partes[1],
    nomeArquivo
  );

  // A foto fica privada no Drive; o painel usa a miniatura da aba Free_Fotos
  const arquivo = FREE_pastaFotos_().createFile(blob);

  return { url: arquivo.getUrl(), id: arquivo.getId() };
}

function FREE_mapaMiniaturas_(ids) {

  const filtro = ids ? new Set(ids) : null;
  const dados = FREE_lerLinhas_("fotos");
  const mapa = {};

  dados.linhas.forEach(function (linha) {
    if (!filtro || filtro.has(linha[0])) {
      mapa[linha[0]] = linha[1];
    }
  });

  return mapa;
}


/****************************************************
 * ETAPAS DO CRONOGRAMA (data sempre atualizada)
 ****************************************************/
function FREE_mapaEtapasCronograma_() {

  const aba = FREE_planilha_().getSheetByName(NOME_ABA);
  const mapa = {};

  if (!aba || aba.getLastRow() < 2) {
    return mapa;
  }

  const valores = aba
    .getRange(2, 1, aba.getLastRow() - 1, 11)
    .getDisplayValues();

  valores.forEach(function (linha) {

    const id = String(linha[0] || "").trim();

    if (!id) {
      return;
    }

    const data = parseData(linha[6]);

    mapa[id] = {
      pedido: linha[1],
      cliente: linha[3],
      local: linha[4],
      etapa: linha[5],
      dataISO: data ? formatISO(data) : "",
      horario: linha[7],
      responsavel: linha[9]
    };
  });

  return mapa;
}


/****************************************************
 * VAGAS E INSCRIÇÕES — LEITURA
 ****************************************************/

/*
 * Se o supervisor mudar a etapa no cronograma, a vaga acompanha:
 * - a data é sempre a data atual da etapa;
 * - o horário de encontro anda junto com o horário da etapa
 *   (ex.: etapa 08:00 -> 10:00, encontro 07:00 -> 09:00).
 */
function FREE_vagaParaObjeto_(linha, indice, mapaEtapas) {

  const etapaAtual = mapaEtapas ? mapaEtapas[linha[1]] : null;

  const horarioSalvo = linha[7];
  const horarioEtapaBase = linha[16];
  const horarioEtapaAtual = etapaAtual ? etapaAtual.horario : horarioEtapaBase;

  let horario = horarioSalvo;
  let horarioMudou = false;

  const base = FREE_minutos_(horarioEtapaBase);
  const atual = FREE_minutos_(horarioEtapaAtual);
  const encontro = FREE_minutos_(horarioSalvo);

  if (base !== null && atual !== null && encontro !== null && base !== atual) {
    horario = FREE_hhmm_(encontro + (atual - base));
    horarioMudou = true;
  }

  return {
    linha: indice + 2,
    idVaga: linha[0],
    idEtapa: linha[1],
    pedido: linha[2],
    cliente: linha[3],
    local: linha[4],
    etapa: linha[5],
    dataISO: (etapaAtual && etapaAtual.dataISO) || linha[6],
    dataOriginal: linha[6],
    horario: horario,
    horarioOriginal: horarioSalvo,
    horarioEtapaBase: horarioEtapaBase,
    horarioEtapaAtual: horarioEtapaAtual,
    horarioMudou: horarioMudou,
    pontoEncontro: linha[8],
    lider: linha[9],
    quantidade: Number(linha[10]) || 0,
    observacao: linha[11],
    status: linha[12] || FREE_VAGA_ABERTA,
    criadoPor: linha[13],
    criadoEm: linha[14],
    atualizadoEm: linha[15],
    pontoLat: FREE_numeroOuVazio_(linha[17]),
    pontoLng: FREE_numeroOuVazio_(linha[18]),
    segredoQr: linha[19],
    chaveLider: linha[20],
    valor: FREE_numeroOuVazio_(linha[21]),
    modo: linha[22] || FREE_MODO_TODOS,
    preferidos: String(linha[23] || "").split("|").filter(String),
    liberarEm: linha[24],
    etapaRemovida: mapaEtapas ? !etapaAtual : false
  };
}

function FREE_inscricaoParaObjeto_(linha, indice) {
  return {
    linha: indice + 2,
    id: linha[0],
    idVaga: linha[1],
    idFree: linha[2],
    nome: linha[3],
    cpf: linha[4],
    telefone: linha[5],
    status: linha[6],
    confirmadoEm: linha[7],
    canceladoEm: linha[8],
    motivo: linha[9],
    canceladoPor: linha[10],
    cimaDaHora: linha[11] === "SIM",
    dataCiente: linha[12],
    horarioCiente: linha[13],
    checkinEm: linha[14],
    checkinLat: FREE_numeroOuVazio_(linha[15]),
    checkinLng: FREE_numeroOuVazio_(linha[16]),
    checkinDistancia: FREE_numeroOuVazio_(linha[17]),
    checkinVia: linha[18],
    checkoutEm: linha[19],
    checkoutLat: FREE_numeroOuVazio_(linha[20]),
    checkoutLng: FREE_numeroOuVazio_(linha[21]),
    checkoutDistancia: FREE_numeroOuVazio_(linha[22]),
    presencaPor: linha[23],
    fotoUniforme: linha[24],
    fotoUniformeId: linha[25]
  };
}

function FREE_lerVagas_(comEtapas) {

  const mapaEtapas = comEtapas ? FREE_mapaEtapasCronograma_() : null;
  const dados = FREE_lerLinhas_("vagas");

  return dados.linhas
    .map(function (linha, i) {
      return FREE_vagaParaObjeto_(linha, i, mapaEtapas);
    })
    .filter(function (v) {
      return v.idVaga;
    });
}

function FREE_lerInscricoes_() {

  const dados = FREE_lerLinhas_("inscricoes");

  return dados.linhas
    .map(FREE_inscricaoParaObjeto_)
    .filter(function (i) {
      return i.id;
    });
}

function FREE_agruparInscricoes_(inscricoes) {

  const mapa = {};

  inscricoes.forEach(function (ins) {
    if (!mapa[ins.idVaga]) {
      mapa[ins.idVaga] = [];
    }
    mapa[ins.idVaga].push(ins);
  });

  return mapa;
}

function FREE_dataHoraVaga_(vaga) {

  const partes = String(vaga.dataISO || "").split("-");

  if (partes.length !== 3) {
    return null;
  }

  const minutos = FREE_minutos_(vaga.horario);

  return new Date(
    Number(partes[0]),
    Number(partes[1]) - 1,
    Number(partes[2]),
    minutos === null ? 23 : Math.floor(minutos / 60),
    minutos === null ? 59 : minutos % 60
  );
}

function FREE_vagaJaPassou_(vaga) {
  const quando = FREE_dataHoraVaga_(vaga);
  return quando ? quando.getTime() < new Date().getTime() : false;
}


/****************************************************
 * PRESENÇA: MUDANÇAS, CHECK-IN E CHECK-OUT
 ****************************************************/

/*
 * Em que ponto está a presença de um free confirmado:
 * AGUARDANDO -> CHECKIN (janela aberta) -> TRABALHANDO -> CONCLUIDO
 * ou FALTOU (janela fechou sem check-in) / SEM_CHECKOUT.
 */
function FREE_fasePresenca_(vaga, ins, agora) {

  agora = agora || new Date();

  if (ins.checkoutEm) {
    return FREE_FASE_CONCLUIDO;
  }

  if (ins.checkinEm) {
    const entrada = FREE_parseDataHora_(ins.checkinEm);
    const limite = entrada
      ? entrada.getTime() + FREE_CHECKOUT_LIMITE_HORAS * 3600000
      : 0;
    return agora.getTime() <= limite ? FREE_FASE_TRABALHANDO : FREE_FASE_SEM_CHECKOUT;
  }

  if (vaga.status === FREE_VAGA_CANCELADA) {
    return FREE_FASE_CANCELADA;
  }

  const quando = FREE_dataHoraVaga_(vaga);

  if (!quando) {
    return FREE_FASE_AGUARDANDO;
  }

  const abre = quando.getTime() - FREE_CHECKIN_ANTES_HORAS * 3600000;
  const fecha = quando.getTime() + FREE_CHECKIN_DEPOIS_HORAS * 3600000;

  if (agora.getTime() < abre) {
    return FREE_FASE_AGUARDANDO;
  }

  return agora.getTime() <= fecha ? FREE_FASE_CHECKIN : FREE_FASE_FALTOU;
}

function FREE_minutosTrabalhados_(ins) {
  const entrada = FREE_parseDataHora_(ins.checkinEm);
  const saida = FREE_parseDataHora_(ins.checkoutEm);
  return entrada && saida
    ? Math.max(0, Math.round((saida.getTime() - entrada.getTime()) / 60000))
    : null;
}

/*
 * O free confirmou vendo um dia/horário. Se a etapa mudou
 * depois disso, ele precisa dar "ciente" no app.
 */
function FREE_mudancaPendente_(vaga, ins) {

  if (ins.status !== FREE_INS_CONFIRMADO || ins.checkinEm || !ins.dataCiente) {
    return null;
  }

  const fase = FREE_fasePresenca_(vaga, ins);

  if (fase !== FREE_FASE_AGUARDANDO && fase !== FREE_FASE_CHECKIN) {
    return null;
  }

  if (ins.dataCiente === vaga.dataISO && ins.horarioCiente === vaga.horario) {
    return null;
  }

  return {
    dataAntes: ins.dataCiente,
    horarioAntes: ins.horarioCiente,
    dataAgora: vaga.dataISO,
    horarioAgora: vaga.horario
  };
}

function FREE_distanciaPonto_(vaga, lat, lng) {

  if (lat === "" || lng === "" || vaga.pontoLat === "" || vaga.pontoLng === "") {
    return "";
  }

  return calcularDistanciaMetros(vaga.pontoLat, vaga.pontoLng, lat, lng);
}

/* Resumo da presença usado pelo painel */
function FREE_resumoPresenca_(vaga, ins) {

  const minutos = FREE_minutosTrabalhados_(ins);

  return {
    fase: FREE_fasePresenca_(vaga, ins),
    mudanca: FREE_mudancaPendente_(vaga, ins),
    checkinEm: ins.checkinEm,
    checkinVia: ins.checkinVia,
    checkinDistancia: ins.checkinDistancia,
    checkinSemGps: !!ins.checkinEm && ins.checkinLat === "",
    checkoutEm: ins.checkoutEm,
    checkoutDistancia: ins.checkoutDistancia,
    checkoutSemGps: !!ins.checkoutEm && ins.checkoutLat === "",
    minutosTrabalhados: minutos,
    horasTrabalhadas: FREE_duracaoTexto_(minutos),
    presencaPor: ins.presencaPor,
    longeDoPonto:
      (ins.checkinDistancia !== "" && ins.checkinDistancia > FREE_DISTANCIA_ALERTA_M) ||
      (ins.checkoutDistancia !== "" && ins.checkoutDistancia > FREE_DISTANCIA_ALERTA_M)
  };
}


/****************************************************
 * DIRECIONAMENTO: PARA QUEM A VAGA APARECE
 ****************************************************/
function FREE_vagaVisivelPara_(vaga, idFree) {

  if (vaga.modo === FREE_MODO_EXCLUSIVA) {
    return vaga.preferidos.indexOf(idFree) >= 0;
  }

  if (vaga.modo === FREE_MODO_PRIORIDADE) {
    if (vaga.preferidos.indexOf(idFree) >= 0) {
      return true;
    }
    const libera = FREE_parseDataHora_(vaga.liberarEm);
    return !libera || new Date().getTime() >= libera.getTime();
  }

  return true;
}


/****************************************************
 * NOTA DO FREE (estrelas)
 *
 * Começa em 5. Cada trabalho concluído recupera um
 * pouco; cancelamentos, atrasos e faltas tiram pontos.
 ****************************************************/
function FREE_pontuacao_(lista, mapaVagas) {

  const eventos = [];

  lista.forEach(function (ins) {

    const vaga = mapaVagas[ins.idVaga];

    if (!vaga) {
      return;
    }

    const quando = (vaga.dataISO || "") + " " + (vaga.horario || "");
    const titulo = (vaga.etapa || "Vaga") + " " + FREE_dataCurtaServidor_(vaga.dataISO);

    if (ins.status === FREE_INS_CANCELADO) {
      eventos.push({
        quando: quando, titulo: titulo,
        delta: ins.cimaDaHora ? FREE_PONTOS.cancelouEmCima : FREE_PONTOS.cancelouAntes,
        motivo: ins.cimaDaHora ? "Cancelou com menos de 24h" : "Cancelou com antecedência"
      });
      return;
    }

    if (ins.status !== FREE_INS_CONFIRMADO) {
      return;
    }

    const fase = FREE_fasePresenca_(vaga, ins);

    if (fase === FREE_FASE_FALTOU) {
      eventos.push({ quando: quando, titulo: titulo, delta: FREE_PONTOS.faltou, motivo: "Faltou sem avisar" });
      return;
    }

    if (fase === FREE_FASE_CONCLUIDO || fase === FREE_FASE_SEM_CHECKOUT) {

      eventos.push({ quando: quando, titulo: titulo, delta: FREE_PONTOS.concluido, motivo: "Trabalho realizado" });

      const entrada = FREE_parseDataHora_(ins.checkinEm);
      const marcado = FREE_dataHoraVaga_(vaga);
      const atraso = entrada && marcado
        ? Math.round((entrada.getTime() - marcado.getTime()) / 60000)
        : 0;

      if (atraso > FREE_TOLERANCIA_ATRASO_MIN) {
        eventos.push({ quando: quando, titulo: titulo, delta: FREE_PONTOS.atraso, motivo: "Chegou " + atraso + " min atrasado" });
      }

      if (fase === FREE_FASE_SEM_CHECKOUT) {
        eventos.push({ quando: quando, titulo: titulo, delta: FREE_PONTOS.semCheckout, motivo: "Não fez check-out" });
      }

      const uniforme = typeof RH_mapaUniforme_ === "function" ? RH_mapaUniforme_()[ins.id] : null;

      if (uniforme && uniforme.avaliacao === "INCOMPLETO") {
        eventos.push({ quando: quando, titulo: titulo, delta: FREE_PONTOS.uniformeIncompleto, motivo: "Uniforme incompleto" });
      }

      if (uniforme && uniforme.avaliacao === "SEM") {
        eventos.push({ quando: quando, titulo: titulo, delta: FREE_PONTOS.semUniforme, motivo: "Sem uniforme" });
      }
    }
  });

  eventos.sort(function (a, b) { return a.quando.localeCompare(b.quando); });

  let nota = FREE_NOTA_INICIAL;
  eventos.forEach(function (e) {
    nota = Math.max(FREE_NOTA_MINIMA, Math.min(FREE_NOTA_INICIAL, nota + e.delta));
    e.notaDepois = Math.round(nota * 10) / 10;
  });

  return {
    nota: Math.round(nota * 10) / 10,
    trabalhos: eventos.filter(function (e) { return e.delta === FREE_PONTOS.concluido; }).length,
    faltas: eventos.filter(function (e) { return e.delta === FREE_PONTOS.faltou; }).length,
    cancelamentos: eventos.filter(function (e) {
      return e.delta === FREE_PONTOS.cancelouAntes || e.delta === FREE_PONTOS.cancelouEmCima;
    }).length,
    historico: eventos.slice(-12).reverse().map(function (e) {
      return { titulo: e.titulo, motivo: e.motivo, delta: e.delta, nota: e.notaDepois };
    })
  };
}

function FREE_mapaPontuacoes_(inscricoes, vagas) {

  const mapaVagas = {};
  vagas.forEach(function (v) { mapaVagas[v.idVaga] = v; });

  const porFree = {};
  inscricoes.forEach(function (i) {
    (porFree[i.idFree] = porFree[i.idFree] || []).push(i);
  });

  const mapa = {};
  Object.keys(porFree).forEach(function (id) {
    mapa[id] = FREE_pontuacao_(porFree[id], mapaVagas);
  });

  return mapa;
}

function FREE_dataCurtaServidor_(iso) {
  const p = String(iso || "").split("-");
  return p.length === 3 ? p[2] + "/" + p[1] : "";
}

function FREE_notaVazia_() {
  return { nota: FREE_NOTA_INICIAL, trabalhos: 0, faltas: 0, cancelamentos: 0, historico: [] };
}


/****************************************************
 * VAGAS CRIADAS JUNTO COM O PEDIDO
 * Chamado no fim de salvarPedidoCompleto()
 ****************************************************/
function FREE_criarVagasDoPedido_(token, etapas) {

  const pedidas = (etapas || []).filter(function (e) {
    return e && e.freeVaga && e.id;
  });

  if (!pedidas.length) {
    return null;
  }

  const resultado = { criadas: 0, erros: [] };

  pedidas.forEach(function (e) {
    try {
      const dados = Object.assign({}, e.freeVaga, { idEtapa: e.id, idVaga: "" });
      dados.horario = dados.horario || e.horario;
      dados.lider = dados.lider || e.responsavel;
      FREE_admSalvarVaga(token, dados);
      resultado.criadas++;
    } catch (erro) {
      resultado.erros.push(
        (e.etapa || "Etapa") + " " + FREE_dataCurtaServidor_(e.dataEtapa) + ": " +
        String(erro && erro.message || erro).replace(/^SESSAO_EXPIRADA:\s*/, "")
      );
    }
  });

  return resultado;
}


/****************************************************
 * MAPA PARA O CRONOGRAMA (badge nos cards)
 * Chamado por getCronogramaSemana()
 ****************************************************/
function FREE_buscarMapaVagasPorEtapa_() {

  const vagas = FREE_lerVagas_(true);
  const porVaga = FREE_agruparInscricoes_(FREE_lerInscricoes_());
  const mapa = {};

  vagas.forEach(function (vaga) {

    if (vaga.status === FREE_VAGA_CANCELADA) {
      return;
    }

    const lista = porVaga[vaga.idVaga] || [];

    const confirmados = lista.filter(function (i) {
      return i.status === FREE_INS_CONFIRMADO;
    });

    const cancelados = lista.filter(function (i) {
      return i.status === FREE_INS_CANCELADO;
    });

    mapa[vaga.idEtapa] = {
      idVaga: vaga.idVaga,
      status: vaga.status,
      quantidade: vaga.quantidade,
      confirmados: confirmados.length,
      cancelados: cancelados.length,
      checkins: confirmados.filter(function (i) { return i.checkinEm; }).length,
      checkouts: confirmados.filter(function (i) { return i.checkoutEm; }).length,
      faltas: confirmados.filter(function (i) {
        return FREE_fasePresenca_(vaga, i) === FREE_FASE_FALTOU;
      }).length,
      mudancasPendentes: confirmados.filter(function (i) {
        return FREE_mudancaPendente_(vaga, i);
      }).length,
      nomes: confirmados.map(function (i) { return i.nome; }),
      horario: vaga.horario,
      pontoEncontro: vaga.pontoEncontro,
      lider: vaga.lider,
      valor: vaga.valor,
      modo: vaga.modo
    };
  });

  return mapa;
}


/****************************************************
 * APP DO FREE — CADASTRO E LOGIN
 ****************************************************/
function FREE_appCadastrar(dados) {

  dados = dados || {};

  const nome = FREE_texto_(dados.nome, 120);
  const cpf = FREE_limparCpf_(dados.cpf);
  const telefone = FREE_texto_(dados.telefone, 30);
  const senha = String(dados.senha || "");

  if (nome.split(/\s+/).length < 2) {
    throw new Error("Informe o nome completo.");
  }

  if (!FREE_cpfValido_(cpf)) {
    throw new Error("CPF inválido. Confira os números.");
  }

  if (telefone.replace(/\D/g, "").length < 10) {
    throw new Error("Informe um telefone com DDD.");
  }

  if (senha.length < 6) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  }

  if (!dados.foto || !dados.miniatura) {
    throw new Error("Tire uma foto do rosto para o cadastro.");
  }

  const pix = FREE_texto_(dados.pix, 120);

  if (pix.length < 5) {
    throw new Error("Informe sua chave PIX para receber os pagamentos.");
  }

  return FREE_comLock_(function () {

    const cad = FREE_lerLinhas_("cadastros");
    const cpfFormatado = FREE_formatarCpf_(cpf);

    const jaExiste = cad.linhas.some(function (l) {
      return FREE_limparCpf_(l[2]) === cpf;
    });

    if (jaExiste) {
      throw new Error("Este CPF já está cadastrado. Faça login.");
    }

    const id = FREE_novoId_("FREE");
    const foto = FREE_salvarFotoDrive_(dados.foto, id + "_" + nome + ".jpg");
    const salt = Utilities.getUuid();
    const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    const expira = new Date().getTime() + FREE_DIAS_TOKEN * 86400000;
    const agora = FREE_agoraTexto_();

    cad.aba.appendRow([
      id, nome, cpfFormatado, telefone, foto.url, foto.id,
      FREE_hashSenha_(senha, salt), salt, FREE_CAD_PENDENTE,
      agora, agora, token, String(expira), "", pix
    ]);

    FREE_aba_("fotos").appendRow([id, String(dados.miniatura)]);

    return { token: token };
  });
}

function FREE_appLogin(cpf, senha) {

  const cpfLimpo = FREE_limparCpf_(cpf);

  return FREE_comLock_(function () {

    const cad = FREE_lerLinhas_("cadastros");

    for (let i = 0; i < cad.linhas.length; i++) {

      if (FREE_limparCpf_(cad.linhas[i][2]) !== cpfLimpo) {
        continue;
      }

      const c = FREE_cadastroParaObjeto_(cad.linhas[i], i);

      if (FREE_hashSenha_(String(senha || ""), c.salt) !== c.hash) {
        break;
      }

      if (c.status === FREE_CAD_BLOQUEADO) {
        throw new Error("Seu cadastro está bloqueado. Fale com a empresa.");
      }

      // Reaproveita o token válido para o free poder usar mais de um celular
      let token = c.token;
      let expira = Number(c.tokenExpira) || 0;

      if (!token || expira < new Date().getTime()) {
        token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
      }

      expira = new Date().getTime() + FREE_DIAS_TOKEN * 86400000;

      cad.aba.getRange(c.linha, 11, 1, 3)
        .setValues([[FREE_agoraTexto_(), token, String(expira)]]);

      return { token: token };
    }

    throw new Error("CPF ou senha incorretos.");
  });
}

/* Free que se cadastrou antes de existir o campo PIX */
function FREE_appSalvarPix(token, pix) {

  const free = FREE_autenticar_(token);
  const chave = FREE_texto_(pix, 120);

  if (chave.length < 5) {
    throw new Error("Informe uma chave PIX válida.");
  }

  FREE_aba_("cadastros").getRange(free.linha, 15).setValue(chave);
  return FREE_appCarregar(token);
}

function FREE_appSair(token) {

  try {
    const c = FREE_autenticar_(token);
    FREE_aba_("cadastros").getRange(c.linha, 13).setValue("0");
  } catch (e) {
    // já estava deslogado
  }

  return true;
}


/****************************************************
 * APP DO FREE — VAGAS
 ****************************************************/
function FREE_vagaParaFree_(vaga, lista, idFree) {

  const confirmados = lista.filter(function (i) {
    return i.status === FREE_INS_CONFIRMADO;
  });

  const minha = lista
    .filter(function (i) { return i.idFree === idFree; })
    .pop() || null;

  const item = {
    idVaga: vaga.idVaga,
    etapa: vaga.etapa,
    dataISO: vaga.dataISO,
    horario: vaga.horario,
    pontoEncontro: vaga.pontoEncontro,
    valor: vaga.valor,
    convite: vaga.modo !== FREE_MODO_TODOS && vaga.preferidos.indexOf(idFree) >= 0,
    // Escolhido com prazo: até quando a vaga fica reservada para ele
    reservaAte: vaga.modo === FREE_MODO_PRIORIDADE && vaga.preferidos.indexOf(idFree) >= 0 &&
      FREE_parseDataHora_(vaga.liberarEm) && FREE_parseDataHora_(vaga.liberarEm).getTime() > new Date().getTime()
      ? vaga.liberarEm
      : "",
    pontoLat: vaga.pontoLat,
    pontoLng: vaga.pontoLng,
    lider: vaga.lider,
    observacao: vaga.observacao,
    quantidade: vaga.quantidade,
    confirmados: confirmados.length,
    restantes: Math.max(0, vaga.quantidade - confirmados.length),
    status: vaga.status,
    passou: FREE_vagaJaPassou_(vaga),
    minhaStatus: minha ? minha.status : "",
    minhaConfirmadaEm: minha ? minha.confirmadoEm : "",
    colegas: confirmados
      .filter(function (i) { return i.idFree !== idFree; })
      .map(function (i) { return String(i.nome || "").split(" ")[0]; })
  };

  if (minha && minha.status === FREE_INS_CONFIRMADO) {

    const fase = FREE_fasePresenca_(vaga, minha);
    const quando = FREE_dataHoraVaga_(vaga);

    item.fase = fase;
    item.mudanca = FREE_mudancaPendente_(vaga, minha);
    item.checkinEm = minha.checkinEm;
    item.checkoutEm = minha.checkoutEm;
    item.horasTrabalhadas = FREE_duracaoTexto_(FREE_minutosTrabalhados_(minha));
    item.checkinAbreEm = quando
      ? FREE_formatarDataHora_(new Date(quando.getTime() - FREE_CHECKIN_ANTES_HORAS * 3600000))
      : "";
    // Só dá para desistir antes do horário e sem ter feito check-in
    item.podeCancelar = !minha.checkinEm && !item.passou &&
      (fase === FREE_FASE_AGUARDANDO || fase === FREE_FASE_CHECKIN);
  }

  return item;
}

function FREE_appCarregar(token) {

  const free = FREE_autenticar_(token);
  const miniatura = FREE_mapaMiniaturas_([free.id])[free.id] || "";

  const perfil = {
    nome: free.nome,
    cpf: free.cpf,
    telefone: free.telefone,
    pix: free.pix,
    status: free.status,
    miniatura: miniatura
  };

  if (free.status !== FREE_CAD_APROVADO) {
    return { perfil: perfil, vagas: [], minhas: [] };
  }

  const vagas = FREE_lerVagas_(true);
  const inscricoes = FREE_lerInscricoes_();
  const porVaga = FREE_agruparInscricoes_(inscricoes);

  perfil.pontuacao = FREE_pontuacao_(
    inscricoes.filter(function (i) { return i.idFree === free.id; }),
    vagas.reduce(function (m, v) { m[v.idVaga] = v; return m; }, {})
  );
  const abertas = [];
  const minhas = [];

  vagas.forEach(function (vaga) {

    if (vaga.etapaRemovida && vaga.status === FREE_VAGA_ABERTA) {
      return;
    }

    const lista = porVaga[vaga.idVaga] || [];
    const item = FREE_vagaParaFree_(vaga, lista, free.id);

    if (item.minhaStatus) {
      minhas.push(item);
    }

    if (
      vaga.status === FREE_VAGA_ABERTA &&
      !item.passou &&
      item.minhaStatus !== FREE_INS_CONFIRMADO &&
      item.minhaStatus !== FREE_INS_REMOVIDO &&
      FREE_vagaVisivelPara_(vaga, free.id)
    ) {
      abertas.push(item);
    }
  });

  function porData(a, b) {
    return (a.dataISO + a.horario).localeCompare(b.dataISO + b.horario);
  }

  abertas.sort(function (a, b) {
    if (a.convite !== b.convite) {
      return a.convite ? -1 : 1;
    }
    return porData(a, b);
  });
  minhas.sort(porData);

  return { perfil: perfil, vagas: abertas, minhas: minhas };
}

/*
 * Busca a vaga e a inscrição confirmada do free.
 * Usado por ciente, check-in e check-out.
 */
function FREE_minhaInscricao_(free, idVaga) {

  const vaga = FREE_lerVagas_(true).filter(function (v) {
    return v.idVaga === idVaga;
  })[0];

  if (!vaga) {
    throw new Error("Vaga não encontrada.");
  }

  const ins = FREE_lerInscricoes_().filter(function (i) {
    return i.idVaga === idVaga && i.idFree === free.id && i.status === FREE_INS_CONFIRMADO;
  }).pop();

  if (!ins) {
    throw new Error("Você não está confirmado nesta vaga.");
  }

  return { vaga: vaga, ins: ins };
}

function FREE_appConfirmar(token, idVaga) {

  return FREE_comLock_(function () {

    const free = FREE_autenticar_(token);

    if (free.status !== FREE_CAD_APROVADO) {
      throw new Error("Seu cadastro ainda está em análise.");
    }

    const todasVagas = FREE_lerVagas_(true);

    const vaga = todasVagas.filter(function (v) {
      return v.idVaga === idVaga;
    })[0];

    if (!vaga || vaga.status !== FREE_VAGA_ABERTA || vaga.etapaRemovida) {
      throw new Error("Esta vaga não está mais disponível.");
    }

    if (FREE_vagaJaPassou_(vaga)) {
      throw new Error("Esta vaga já passou.");
    }

    if (!FREE_vagaVisivelPara_(vaga, free.id)) {
      throw new Error("Esta vaga não está disponível para você.");
    }

    const inscricoes = FREE_lerInscricoes_();

    const daVaga = inscricoes.filter(function (i) {
      return i.idVaga === idVaga && i.status === FREE_INS_CONFIRMADO;
    });

    if (daVaga.some(function (i) { return i.idFree === free.id; })) {
      return FREE_appCarregar(token);
    }

    if (daVaga.length >= vaga.quantidade) {
      throw new Error("Que pena, as vagas acabaram de ser preenchidas.");
    }

    // Removido pelo supervisor não pode se confirmar de novo
    const removido = inscricoes.some(function (i) {
      return i.idVaga === idVaga && i.idFree === free.id && i.status === FREE_INS_REMOVIDO;
    });

    if (removido) {
      throw new Error("Você foi retirado desta vaga pelo supervisor.");
    }

    // Mesmo dia e horário em outra vaga: avisa para não dar conflito
    const conflito = inscricoes.some(function (i) {
      if (i.idFree !== free.id || i.status !== FREE_INS_CONFIRMADO) {
        return false;
      }
      const outra = todasVagas.filter(function (v) {
        return v.idVaga === i.idVaga;
      })[0];
      return outra &&
        outra.status !== FREE_VAGA_CANCELADA &&
        outra.dataISO === vaga.dataISO &&
        outra.horario === vaga.horario;
    });

    if (conflito) {
      throw new Error("Você já confirmou outra vaga neste mesmo dia e horário.");
    }

    // Guarda o dia/horário que o free viu ao confirmar
    FREE_aba_("inscricoes").appendRow([
      FREE_novoId_("INS"), idVaga, free.id, free.nome, free.cpf,
      free.telefone, FREE_INS_CONFIRMADO, FREE_agoraTexto_(),
      "", "", "", "", vaga.dataISO, vaga.horario,
      "", "", "", "", "", "", "", "", "", "", "", ""
    ]);

    return FREE_appCarregar(token);
  });
}

function FREE_appCancelar(token, idVaga, motivo) {

  return FREE_comLock_(function () {

    const free = FREE_autenticar_(token);

    if (FREE_texto_(motivo).length < FREE_MOTIVO_MINIMO) {
      throw new Error("Conte o motivo do cancelamento.");
    }

    const vaga = FREE_lerVagas_(true).filter(function (v) {
      return v.idVaga === idVaga;
    })[0];

    if (vaga && FREE_vagaJaPassou_(vaga)) {
      throw new Error("O horário desta vaga já passou. Fale com o líder.");
    }

    const ins = FREE_lerInscricoes_().filter(function (i) {
      return i.idVaga === idVaga && i.idFree === free.id && i.status === FREE_INS_CONFIRMADO;
    })[0];

    if (!ins) {
      return FREE_appCarregar(token);
    }

    if (ins.checkinEm) {
      throw new Error("Você já fez check-in nesta vaga. Fale com o líder.");
    }

    const quando = vaga ? FREE_dataHoraVaga_(vaga) : null;
    const cimaDaHora = quando &&
      quando.getTime() - new Date().getTime() < FREE_HORAS_CIMA_DA_HORA * 3600000;

    FREE_aba_("inscricoes")
      .getRange(ins.linha, 7, 1, 6)
      .setValues([[
        FREE_INS_CANCELADO, ins.confirmadoEm, FREE_agoraTexto_(),
        FREE_texto_(motivo, 300), "Free", cimaDaHora ? "SIM" : ""
      ]]);

    return FREE_appCarregar(token);
  });
}

/* O free viu a mudança de dia/horário e continua indo */
function FREE_appCiente(token, idVaga) {

  return FREE_comLock_(function () {

    const free = FREE_autenticar_(token);
    const achado = FREE_minhaInscricao_(free, idVaga);

    FREE_aba_("inscricoes")
      .getRange(achado.ins.linha, 13, 1, 2)
      .setValues([[achado.vaga.dataISO, achado.vaga.horario]]);

    return FREE_appCarregar(token);
  });
}

/****************************************************
 * QR CODE DE PRESENÇA
 *
 * Cada vaga tem um segredo. O código de 6 números é
 * calculado a partir do segredo e do minuto atual, então
 * uma foto do QR enviada para alguém que não está no
 * local perde a validade em poucos minutos.
 ****************************************************/
function FREE_novoSegredo_() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

function FREE_codigoQr_(vaga, janela) {

  const assinatura = Utilities.computeHmacSha256Signature(
    vaga.idVaga + ":" + janela,
    vaga.segredoQr
  );

  let numero = 0;
  for (let i = 0; i < 4; i++) {
    numero = numero * 256 + (assinatura[i] & 0xff);
  }

  return ("000000" + (numero % 1000000)).slice(-6);
}

function FREE_janelaAtual_() {
  return Math.floor(new Date().getTime() / FREE_QR_JANELA_MS);
}

function FREE_codigoValido_(vaga, codigo) {

  const limpo = String(codigo || "").replace(/\D/g, "");

  if (limpo.length !== 6 || !vaga.segredoQr) {
    return false;
  }

  const atual = FREE_janelaAtual_();

  // Aceita o minuto seguinte (relógio adiantado) e os últimos minutos
  for (let j = atual + 1; j >= atual - FREE_QR_TOLERANCIA_JANELAS; j--) {
    if (FREE_codigoQr_(vaga, j) === limpo) {
      return true;
    }
  }

  return false;
}

/* Vagas criadas antes do QR ganham segredo e chave na primeira vez */
function FREE_garantirSegredos_(vaga) {

  if (vaga.segredoQr && vaga.chaveLider) {
    return vaga;
  }

  vaga.segredoQr = vaga.segredoQr || FREE_novoSegredo_();
  vaga.chaveLider = vaga.chaveLider || FREE_novoSegredo_().slice(0, 24);

  FREE_aba_("vagas")
    .getRange(vaga.linha, 20, 1, 2)
    .setValues([[vaga.segredoQr, vaga.chaveLider]]);

  return vaga;
}

function FREE_dadosQr_(vaga) {

  const janela = FREE_janelaAtual_();
  const base = FREE_urlBase_();
  const codigo = FREE_codigoQr_(vaga, janela);
  const porVaga = FREE_agruparInscricoes_(FREE_lerInscricoes_());

  const equipe = (porVaga[vaga.idVaga] || [])
    .filter(function (i) { return i.status === FREE_INS_CONFIRMADO; })
    .map(function (i) {
      return {
        nome: i.nome,
        checkinEm: i.checkinEm,
        checkoutEm: i.checkoutEm,
        fase: FREE_fasePresenca_(vaga, i)
      };
    });

  return {
    idVaga: vaga.idVaga,
    etapa: vaga.etapa,
    cliente: vaga.cliente,
    dataISO: vaga.dataISO,
    horario: vaga.horario,
    pontoEncontro: vaga.pontoEncontro,
    lider: vaga.lider,
    status: vaga.status,
    codigo: codigo,
    urlQr: base + "?page=free&c=" + encodeURIComponent(vaga.idVaga + "." + codigo),
    linkLider: base + "?page=free-qr&v=" + encodeURIComponent(vaga.idVaga) +
      "&k=" + encodeURIComponent(vaga.chaveLider),
    // milissegundos até o código trocar
    trocaEm: (janela + 1) * FREE_QR_JANELA_MS - new Date().getTime(),
    equipe: equipe
  };
}

/* QR exibido dentro do cronograma (senha do supervisor) */
function FREE_admQrVaga(token, idVaga) {

  FREE_validarAdmin_(token);

  const vaga = FREE_lerVagas_(true).filter(function (v) {
    return v.idVaga === idVaga;
  })[0];

  if (!vaga) {
    throw new Error("Vaga não encontrada.");
  }

  return FREE_dadosQr_(FREE_garantirSegredos_(vaga));
}

/* QR exibido no celular do líder (link com a chave da vaga) */
function FREE_liderQr(idVaga, chave) {

  const vaga = FREE_lerVagas_(true).filter(function (v) {
    return v.idVaga === String(idVaga || "");
  })[0];

  if (!vaga || !vaga.chaveLider || vaga.chaveLider !== String(chave || "")) {
    throw new Error("Link do QR code inválido. Peça um novo ao supervisor.");
  }

  if (vaga.status === FREE_VAGA_CANCELADA) {
    throw new Error("Esta vaga foi cancelada.");
  }

  return FREE_dadosQr_(vaga);
}

/*
 * O free leu o QR do líder (ou digitou o código).
 * Sem check-in: registra o check-in.
 * Com check-in: registra o check-out.
 */
function FREE_appPresenca(token, idVaga, codigo, gps) {

  gps = gps || {};

  return FREE_comLock_(function () {

    const free = FREE_autenticar_(token);
    const achado = FREE_minhaInscricao_(free, idVaga);
    const vaga = achado.vaga;
    const ins = achado.ins;

    if (!FREE_codigoValido_(vaga, codigo)) {
      throw new Error("Código inválido ou vencido. Leia o QR code do líder de novo.");
    }

    const lat = FREE_numeroOuVazio_(gps.lat);
    const lng = FREE_numeroOuVazio_(gps.lng);
    const distancia = FREE_distanciaPonto_(vaga, lat, lng);
    const via = gps.via === "codigo" ? "Código" : "QR code";
    const aba = FREE_aba_("inscricoes");
    const fase = FREE_fasePresenca_(vaga, ins);

    let registro = "";

    if (!ins.checkinEm) {

      if (fase === FREE_FASE_AGUARDANDO) {
        throw new Error(
          "O check-in libera " + FREE_CHECKIN_ANTES_HORAS +
          "h antes do horário de encontro (" + vaga.horario + ")."
        );
      }

      if (fase === FREE_FASE_CANCELADA) {
        throw new Error("Esta vaga foi cancelada.");
      }

      if (fase === FREE_FASE_FALTOU) {
        throw new Error("O prazo do check-in acabou. Fale com o líder.");
      }

      if (!gps.foto) {
        throw new Error("Tire a foto de corpo inteiro com o uniforme para fazer o check-in.");
      }

      // Foto compartilhada por link: a RH avalia o uniforme por ela
      const fotoUniforme = uploadFotoChecklist(
        gps.foto,
        "UNIFORME_" + ins.id + "_" + free.nome + ".jpg"
      );

      aba.getRange(ins.linha, 13, 1, 7)
        .setValues([[
          // fazer check-in já conta como ciente da data/horário atual
          vaga.dataISO, vaga.horario,
          FREE_agoraTexto_(), lat, lng, distancia, via
        ]]);

      aba.getRange(ins.linha, 25, 1, 2)
        .setValues([[fotoUniforme.url, fotoUniforme.id]]);

      registro = "checkin";

    } else if (ins.checkoutEm) {

      registro = "jaConcluido";

    } else {

      const entrada = FREE_parseDataHora_(ins.checkinEm);
      const minutos = entrada
        ? (new Date().getTime() - entrada.getTime()) / 60000
        : Infinity;

      if (minutos < FREE_MINUTOS_MINIMOS_CHECKOUT) {

        registro = "checkinRecente";

      } else if (fase === FREE_FASE_SEM_CHECKOUT) {

        throw new Error("O prazo do check-out acabou. Fale com o líder.");

      } else {

        aba.getRange(ins.linha, 20, 1, 4)
          .setValues([[FREE_agoraTexto_(), lat, lng, distancia]]);

        registro = "checkout";
      }
    }

    const dados = FREE_appCarregar(token);
    dados.registro = registro;
    dados.registroVaga = idVaga;
    return dados;
  });
}


/****************************************************
 * PAINEL DO CRONOGRAMA — VAGAS
 ****************************************************/
function FREE_admSalvarVaga(token, dados) {

  const sessao = FREE_validarAdmin_(token);
  dados = dados || {};

  const quantidade = Math.floor(Number(dados.quantidade));
  const pontoEncontro = FREE_texto_(dados.pontoEncontro, 300);
  const lider = FREE_texto_(dados.lider, 120);
  const horario = FREE_texto_(dados.horario, 20);
  const observacao = FREE_texto_(dados.observacao, 500);
  const valor = Math.round((typeof dados.valor === "number"
    ? dados.valor
    : Number(String(dados.valor == null ? "" : dados.valor).replace(/\./g, "").replace(",", "."))) * 100) / 100;
  const modo = [FREE_MODO_TODOS, FREE_MODO_PRIORIDADE, FREE_MODO_EXCLUSIVA].indexOf(dados.modo) >= 0
    ? dados.modo
    : FREE_MODO_TODOS;
  const preferidos = (Array.isArray(dados.preferidos) ? dados.preferidos : [])
    .map(String)
    .filter(String);
  const prazoMin = Number(dados.prazoMin) || 0;

  if (!(valor > 0)) {
    throw new Error("Informe o valor da diária.");
  }

  if (modo !== FREE_MODO_TODOS && !preferidos.length) {
    throw new Error("Escolha quem recebe a vaga primeiro.");
  }

  if (!(quantidade >= 1 && quantidade <= 50)) {
    throw new Error("Informe quantos free você precisa (1 a 50).");
  }

  if (FREE_minutos_(horario) === null) {
    throw new Error("Informe o horário de encontro.");
  }

  if (!pontoEncontro) {
    throw new Error("Informe o ponto de encontro.");
  }

  if (!lider) {
    throw new Error("Informe o líder da equipe.");
  }

  return FREE_comLock_(function () {

    const aba = FREE_aba_("vagas");
    const vagas = FREE_lerVagas_(true);
    const mapaEtapas = FREE_mapaEtapasCronograma_();
    const agora = FREE_agoraTexto_();

    let vaga = dados.idVaga
      ? vagas.filter(function (v) { return v.idVaga === dados.idVaga; })[0]
      : null;

    // Uma vaga ativa por etapa
    if (!vaga && dados.idEtapa) {
      vaga = vagas.filter(function (v) {
        return v.idEtapa === String(dados.idEtapa) && v.status !== FREE_VAGA_CANCELADA;
      })[0] || null;
    }

    const etapa = mapaEtapas[String(vaga ? vaga.idEtapa : dados.idEtapa || "")];

    // Coordenadas do ponto: do autocomplete do Google (quando escolhido na lista),
    // senão as já salvas, senão busca pelo endereço
    const latInformada = FREE_numeroOuVazio_(dados.pontoLat);
    const lngInformada = FREE_numeroOuVazio_(dados.pontoLng);

    let coordenadas = latInformada !== "" && lngInformada !== ""
      ? { latitude: latInformada, longitude: lngInformada }
      : vaga && vaga.pontoEncontro === pontoEncontro
        ? { latitude: vaga.pontoLat, longitude: vaga.pontoLng }
        : null;

    if (!coordenadas || coordenadas.latitude === "") {
      coordenadas = obterCoordenadasEndereco(pontoEncontro);
    }

    // Até quando só os escolhidos veem a vaga
    let liberarEm = "";
    if (modo === FREE_MODO_PRIORIDADE) {
      liberarEm = prazoMin > 0
        ? FREE_formatarDataHora_(new Date(new Date().getTime() + prazoMin * 60000))
        : (vaga && vaga.modo === FREE_MODO_PRIORIDADE && vaga.liberarEm)
          ? vaga.liberarEm
          : FREE_formatarDataHora_(new Date(new Date().getTime() + FREE_PRAZO_PRIORIDADE_PADRAO_MIN * 60000));
    }

    // O horário informado passa a valer em relação ao horário atual da etapa
    const horarioEtapaBase = etapa ? etapa.horario : (vaga ? vaga.horarioEtapaBase : "");

    if (vaga) {

      const confirmados = FREE_lerInscricoes_().filter(function (i) {
        return i.idVaga === vaga.idVaga && i.status === FREE_INS_CONFIRMADO;
      }).length;

      if (quantidade < confirmados) {
        throw new Error(
          "Já há " + confirmados + " free confirmados. " +
          "Retire alguém antes de diminuir para " + quantidade + "."
        );
      }

      aba.getRange(vaga.linha, 7, 1, 6)
        .setValues([[vaga.dataISO, horario, pontoEncontro, lider, String(quantidade), observacao]]);
      aba.getRange(vaga.linha, 16, 1, 4)
        .setValues([[agora, horarioEtapaBase, coordenadas.latitude, coordenadas.longitude]]);
      aba.getRange(vaga.linha, 22, 1, 4)
        .setValues([[String(valor), modo, preferidos.join("|"), liberarEm]]);

      return FREE_admDetalheVaga(token, vaga.idVaga);
    }

    if (!etapa) {
      throw new Error("Etapa não encontrada no cronograma.");
    }

    if (FREE_vagaJaPassou_({ dataISO: etapa.dataISO, horario: horario })) {
      throw new Error("Esta etapa já passou. Os free só veem vagas de hoje em diante.");
    }

    const idVaga = FREE_novoId_("VAGA");

    aba.appendRow([
      idVaga, String(dados.idEtapa), etapa.pedido, etapa.cliente,
      etapa.local, etapa.etapa, etapa.dataISO, horario, pontoEncontro,
      lider, String(quantidade), observacao, FREE_VAGA_ABERTA,
      sessao.usuario, agora, agora, horarioEtapaBase,
      coordenadas.latitude, coordenadas.longitude,
      FREE_novoSegredo_(), FREE_novoSegredo_().slice(0, 24),
      String(valor), modo, preferidos.join("|"), liberarEm
    ]);

    return FREE_admDetalheVaga(token, idVaga);
  });
}

function FREE_admDetalheVaga(token, idVaga) {

  FREE_validarAdmin_(token);

  const vaga = FREE_lerVagas_(true).filter(function (v) {
    return v.idVaga === idVaga;
  })[0];

  if (!vaga) {
    throw new Error("Vaga não encontrada.");
  }

  const inscricoes = FREE_lerInscricoes_().filter(function (i) {
    return i.idVaga === idVaga;
  });

  const fotos = FREE_mapaMiniaturas_(inscricoes.map(function (i) { return i.idFree; }));
  const notas = FREE_mapaPontuacoes_(FREE_lerInscricoes_(), FREE_lerVagas_(true));

  vaga.inscricoes = inscricoes.map(function (i) {
    i.miniatura = fotos[i.idFree] || "";
    i.nota = (notas[i.idFree] || FREE_notaVazia_()).nota;
    if (i.status === FREE_INS_CONFIRMADO) {
      i.presenca = FREE_resumoPresenca_(vaga, i);
    }
    return i;
  });

  vaga.confirmados = inscricoes.filter(function (i) {
    return i.status === FREE_INS_CONFIRMADO;
  }).length;

  return vaga;
}

function FREE_admBuscarVagaPorEtapa(token, idEtapa) {

  FREE_validarAdmin_(token);

  const vaga = FREE_lerVagas_(false).filter(function (v) {
    return v.idEtapa === String(idEtapa) && v.status !== FREE_VAGA_CANCELADA;
  })[0];

  return vaga ? FREE_admDetalheVaga(token, vaga.idVaga) : null;
}

function FREE_admAlterarStatusVaga(token, idVaga, status) {

  FREE_validarAdmin_(token);

  if ([FREE_VAGA_ABERTA, FREE_VAGA_ENCERRADA, FREE_VAGA_CANCELADA].indexOf(status) < 0) {
    throw new Error("Status inválido.");
  }

  return FREE_comLock_(function () {

    const vaga = FREE_lerVagas_(false).filter(function (v) {
      return v.idVaga === idVaga;
    })[0];

    if (!vaga) {
      throw new Error("Vaga não encontrada.");
    }

    const aba = FREE_aba_("vagas");
    aba.getRange(vaga.linha, 13).setValue(status);
    aba.getRange(vaga.linha, 16).setValue(FREE_agoraTexto_());

    return FREE_admDetalheVaga(token, idVaga);
  });
}

function FREE_admRemoverInscricao(token, idInscricao) {

  const sessao = FREE_validarAdmin_(token);

  return FREE_comLock_(function () {

    const ins = FREE_lerInscricoes_().filter(function (i) {
      return i.id === idInscricao;
    })[0];

    if (!ins) {
      throw new Error("Confirmação não encontrada.");
    }

    FREE_aba_("inscricoes")
      .getRange(ins.linha, 7, 1, 5)
      .setValues([[
        FREE_INS_REMOVIDO, ins.confirmadoEm, FREE_agoraTexto_(),
        "Retirado pelo supervisor", sessao.usuario
      ]]);

    return FREE_admDetalheVaga(token, ins.idVaga);
  });
}

/*
 * Lança check-in ou check-out manualmente (celular sem bateria,
 * sem internet etc.). hora = "HH:mm" no dia da vaga.
 */
function FREE_admLancarPresenca(token, idInscricao, tipo, hora) {

  const sessao = FREE_validarAdmin_(token);
  const minutos = FREE_minutos_(hora);

  if (minutos === null) {
    throw new Error("Informe o horário (ex.: 07:30).");
  }

  if (tipo !== "checkin" && tipo !== "checkout") {
    throw new Error("Tipo inválido.");
  }

  return FREE_comLock_(function () {

    const ins = FREE_lerInscricoes_().filter(function (i) {
      return i.id === idInscricao && i.status === FREE_INS_CONFIRMADO;
    })[0];

    if (!ins) {
      throw new Error("Confirmação não encontrada.");
    }

    const vaga = FREE_lerVagas_(true).filter(function (v) {
      return v.idVaga === ins.idVaga;
    })[0];

    const aba = FREE_aba_("inscricoes");
    const responsavel = sessao.usuario + " (manual)";

    if (tipo === "checkin") {

      const p = String(vaga.dataISO).split("-");
      const quando = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]),
        Math.floor(minutos / 60), minutos % 60);

      aba.getRange(ins.linha, 13, 1, 7)
        .setValues([[vaga.dataISO, vaga.horario, FREE_formatarDataHora_(quando), "", "", "", "Manual"]]);
      aba.getRange(ins.linha, 24).setValue(responsavel);

    } else {

      const entrada = FREE_parseDataHora_(ins.checkinEm);

      if (!entrada) {
        throw new Error("Lance o check-in antes do check-out.");
      }

      const saida = new Date(entrada.getFullYear(), entrada.getMonth(), entrada.getDate(),
        Math.floor(minutos / 60), minutos % 60);

      // Saída antes da entrada = virou a noite
      if (saida.getTime() <= entrada.getTime()) {
        saida.setDate(saida.getDate() + 1);
      }

      aba.getRange(ins.linha, 20, 1, 5)
        .setValues([[FREE_formatarDataHora_(saida), "", "", "", responsavel]]);
    }

    return FREE_admDetalheVaga(token, ins.idVaga);
  });
}

function FREE_admListarVagas(token, inicioISO, fimISO) {

  FREE_validarAdmin_(token);

  const porVaga = FREE_agruparInscricoes_(FREE_lerInscricoes_());

  return FREE_lerVagas_(true)
    .filter(function (v) {
      return v.dataISO >= inicioISO && v.dataISO <= fimISO;
    })
    .map(function (v) {
      const lista = porVaga[v.idVaga] || [];
      const confirmados = lista.filter(function (i) { return i.status === FREE_INS_CONFIRMADO; });
      v.confirmados = confirmados.length;
      v.cancelados = lista.filter(function (i) { return i.status === FREE_INS_CANCELADO; }).length;
      v.cimaDaHora = lista.filter(function (i) { return i.status === FREE_INS_CANCELADO && i.cimaDaHora; }).length;
      v.checkins = confirmados.filter(function (i) { return i.checkinEm; }).length;
      v.checkouts = confirmados.filter(function (i) { return i.checkoutEm; }).length;
      v.faltas = confirmados.filter(function (i) { return FREE_fasePresenca_(v, i) === FREE_FASE_FALTOU; }).length;
      v.mudancasPendentes = confirmados.filter(function (i) { return FREE_mudancaPendente_(v, i); }).length;
      v.nomes = confirmados.map(function (i) { return i.nome; });
      return v;
    })
    .sort(function (a, b) {
      return (a.dataISO + a.horario).localeCompare(b.dataISO + b.horario);
    });
}


/****************************************************
 * PAINEL DO CRONOGRAMA — CADASTROS
 ****************************************************/
function FREE_admListarCadastros(token) {

  FREE_validarAdmin_(token);

  const fotos = FREE_mapaMiniaturas_();
  const inscricoes = FREE_lerInscricoes_();
  const dados = FREE_lerLinhas_("cadastros");

  const todasVagas = FREE_lerVagas_(true);
  const mapaVagas = {};
  todasVagas.forEach(function (v) { mapaVagas[v.idVaga] = v; });
  const notas = FREE_mapaPontuacoes_(inscricoes, todasVagas);

  return dados.linhas
    .map(FREE_cadastroParaObjeto_)
    .filter(function (c) { return c.id; })
    .map(function (c) {

      const minhas = inscricoes.filter(function (i) { return i.idFree === c.id; });
      const confirmadas = minhas.filter(function (i) { return i.status === FREE_INS_CONFIRMADO; });

      return {
        id: c.id,
        nome: c.nome,
        cpf: c.cpf,
        telefone: c.telefone,
        status: c.status,
        cadastradoEm: c.cadastradoEm,
        ultimoAcesso: c.ultimoAcesso,
        fotoUrl: c.fotoUrl,
        miniatura: fotos[c.id] || "",
        nota: (notas[c.id] || FREE_notaVazia_()).nota,
        historico: (notas[c.id] || FREE_notaVazia_()).historico,
        confirmacoes: confirmadas.length,
        trabalhos: confirmadas.filter(function (i) { return i.checkinEm; }).length,
        faltas: confirmadas.filter(function (i) {
          const v = mapaVagas[i.idVaga];
          return v && FREE_fasePresenca_(v, i) === FREE_FASE_FALTOU;
        }).length,
        cancelamentos: minhas.filter(function (i) { return i.status === FREE_INS_CANCELADO; }).length,
        cimaDaHora: minhas.filter(function (i) { return i.cimaDaHora; }).length
      };
    })
    .reverse();
}

function FREE_admListarAprovados(token) {

  FREE_validarAdmin_(token);

  const inscricoes = FREE_lerInscricoes_();
  const notas = FREE_mapaPontuacoes_(inscricoes, FREE_lerVagas_(true));

  return FREE_lerLinhas_("cadastros").linhas
    .map(FREE_cadastroParaObjeto_)
    .filter(function (c) { return c.id && c.status === FREE_CAD_APROVADO; })
    .map(function (c) {
      const n = notas[c.id] || FREE_notaVazia_();
      return { id: c.id, nome: c.nome, telefone: c.telefone, nota: n.nota, trabalhos: n.trabalhos, faltas: n.faltas };
    })
    .sort(function (a, b) { return b.nota - a.nota || b.trabalhos - a.trabalhos || a.nome.localeCompare(b.nome); });
}

function FREE_admAlterarStatusCadastro(token, idFree, status) {

  FREE_validarAdmin_(token);

  if ([FREE_CAD_PENDENTE, FREE_CAD_APROVADO, FREE_CAD_BLOQUEADO].indexOf(status) < 0) {
    throw new Error("Status inválido.");
  }

  const dados = FREE_lerLinhas_("cadastros");

  for (let i = 0; i < dados.linhas.length; i++) {
    if (dados.linhas[i][0] === idFree) {
      dados.aba.getRange(i + 2, 9).setValue(status);
      return FREE_admListarCadastros(token);
    }
  }

  throw new Error("Cadastro não encontrado.");
}

/*
 * Link oficial (/exec) que os free usam. Aberto pelo link de teste (/dev),
 * o Apps Script devolveria o /dev, que só abre para editores do projeto.
 * Usa FREE_URL_OFICIAL_PADRAO (ou a propriedade FREE_URL_OFICIAL, se existir).
 */
function FREE_urlBase_() {

  const oficial = PropertiesService
    .getScriptProperties()
    .getProperty(FREE_PROP_URL_OFICIAL);

  return oficial || FREE_URL_OFICIAL_PADRAO || ScriptApp.getService().getUrl();
}

function FREE_getUrlApp() {
  return FREE_urlBase_() + "?page=free";
}
