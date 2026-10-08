/****************************************************
 * APP DO MONTADOR (?page=montador)
 *
 * O responsável entra com o nome e a senha da aba
 * "Senhas" e vê só as etapas dele: informações,
 * equipe (internos + free em tempo real) e os
 * registros da montagem/desmontagem, que antes
 * ficavam em operacao_montagem / operacao_desmontagem.
 *
 * Os registros continuam gravando pelas mesmas funções
 * (salvarEquipeTerceirizada, salvarSacolasProtecao...).
 ****************************************************/

const MONT_ID_SENHAS = "133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk";
const MONT_ABA_SESSOES = "Montador_Sessoes";
const MONT_DIAS_TOKEN = 60;

// Janela de etapas que aparecem no app
const MONT_DIAS_ANTES = 7;
const MONT_DIAS_DEPOIS = 30;
const MONT_DIAS_DEPOIS_SUPERVISOR = 14;

const MONT_PERFIL_RESPONSAVEL = "RESPONSAVEL";
const MONT_PERFIL_SUPERVISOR = "SUPERVISOR";


/****************************************************
 * APOIO
 ****************************************************/
function MONT_normalizar_(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// "Igor Ramos|Wesley" -> ["Igor Ramos", "Wesley"]
function MONT_separarNomes_(texto) {
  return String(texto || "")
    .split(/[|\n,\/]+/)
    .map(function (n) { return n.trim(); })
    .filter(String);
}

function MONT_ehResponsavel_(etapaResponsavel, nome) {
  const alvo = MONT_normalizar_(nome);
  return MONT_separarNomes_(etapaResponsavel).some(function (n) {
    return MONT_normalizar_(n) === alvo;
  });
}

function MONT_abaSessoes_() {

  const planilha = SpreadsheetApp.openById(FREE_SPREADSHEET_ID);
  let aba = planilha.getSheetByName(MONT_ABA_SESSOES);

  if (!aba) {
    aba = planilha.insertSheet(MONT_ABA_SESSOES);
    aba.getRange(1, 1, 1, 5)
      .setValues([["Token", "Nome", "Perfil", "Criado em", "Expira"]])
      .setFontWeight("bold")
      .setBackground("#2b2a26")
      .setFontColor("#ffffff");
    aba.setFrozenRows(1);
    aba.getRange(1, 1, aba.getMaxRows(), 5).setNumberFormat("@");
  }

  return aba;
}


/****************************************************
 * LOGIN
 ****************************************************/

/* Nomes para a lista do login (aba Responsaveis, ativos) */
function MONT_listarResponsaveis() {
  return listarResponsaveis()
    .filter(function (r) {
      return MONT_normalizar_(r.status || "ativo") !== "inativo";
    })
    .map(function (r) { return String(r.nome || "").trim(); })
    .filter(String)
    .sort(function (a, b) { return a.localeCompare(b); });
}

function MONT_login(nome, senha, comoSupervisor) {

  const senhaLimpa = String(senha || "").trim();
  let usuario = "";
  let perfil = "";

  if (!senhaLimpa) {
    throw new Error("Digite a senha.");
  }

  if (comoSupervisor) {

    const acesso = validarSenhaPerfil(senhaLimpa);

    if (senhaLimpa === CRON_SENHA_SUPERVISOR_MONTAGEM || (acesso && acesso.perfil === "montagem")) {
      usuario = acesso && acesso.usuario ? acesso.usuario : "Supervisor de Montagem";
      perfil = MONT_PERFIL_SUPERVISOR;
    }

  } else {

    if (!String(nome || "").trim()) {
      throw new Error("Escolha o seu nome.");
    }

    if (validarSenhaResponsavel(nome, senhaLimpa)) {
      usuario = String(nome).trim();
      perfil = MONT_PERFIL_RESPONSAVEL;
    }
  }

  if (!perfil) {
    throw new Error("Senha incorreta.");
  }

  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const expira = new Date().getTime() + MONT_DIAS_TOKEN * 86400000;

  MONT_abaSessoes_().appendRow([token, usuario, perfil, FREE_agoraTexto_(), String(expira)]);

  return { token: token, nome: usuario, perfil: perfil };
}

function MONT_autenticar_(token) {

  const limpo = String(token || "").trim();

  if (limpo) {

    const aba = MONT_abaSessoes_();
    const ultima = aba.getLastRow();

    if (ultima >= 2) {

      const linhas = aba.getRange(2, 1, ultima - 1, 5).getDisplayValues();

      for (let i = linhas.length - 1; i >= 0; i--) {
        if (linhas[i][0] === limpo && Number(linhas[i][4]) > new Date().getTime()) {
          return { nome: linhas[i][1], perfil: linhas[i][2], linha: i + 2 };
        }
      }
    }
  }

  throw new Error("SESSAO_EXPIRADA: entre de novo.");
}

function MONT_sair(token) {
  try {
    const sessao = MONT_autenticar_(token);
    MONT_abaSessoes_().getRange(sessao.linha, 5).setValue("0");
  } catch (e) {
    // já estava fora
  }
  return true;
}


/****************************************************
 * ETAPAS DO MONTADOR
 ****************************************************/
function MONT_podeVer_(sessao, etapa) {
  return sessao.perfil === MONT_PERFIL_SUPERVISOR || MONT_ehResponsavel_(etapa.responsavel, sessao.nome);
}

function MONT_ehOperacao_(tipo) {
  const t = MONT_normalizar_(tipo);
  return t === "montagem" || t === "desmontagem";
}

function MONT_contarRegistros_(registro) {

  if (!registro) {
    return 0;
  }

  let total = 0;
  if (registro.equipeTerceirizada) { total++; }
  if (Array.isArray(registro.sacolas) && registro.sacolas.length) { total++; }
  if (registro.posicionamento) { total++; }
  if (registro.observacoesGerais) { total++; }
  if (registro.listaAssinada) { total++; }
  return total;
}

/* Free da etapa: vaga + quem confirmou, com a presença atual */
function MONT_freePorEtapa_() {

  const vagas = FREE_lerVagas_(true);
  const inscricoes = FREE_lerInscricoes_();
  const porVaga = FREE_agruparInscricoes_(inscricoes);
  const notas = FREE_mapaPontuacoes_(inscricoes, vagas);
  const mapa = {};

  vagas.forEach(function (vaga) {

    if (vaga.status === FREE_VAGA_CANCELADA) {
      return;
    }

    const confirmados = (porVaga[vaga.idVaga] || []).filter(function (i) {
      return i.status === FREE_INS_CONFIRMADO;
    });

    mapa[vaga.idEtapa] = {
      idVaga: vaga.idVaga,
      status: vaga.status,
      quantidade: vaga.quantidade,
      horario: vaga.horario,
      pontoEncontro: vaga.pontoEncontro,
      lider: vaga.lider,
      pessoas: confirmados.map(function (i) {
        return {
          nome: i.nome,
          telefone: i.telefone,
          fase: FREE_fasePresenca_(vaga, i),
          checkinEm: i.checkinEm,
          checkoutEm: i.checkoutEm,
          nota: (notas[i.idFree] || FREE_notaVazia_()).nota
        };
      })
    };
  });

  return mapa;
}

function MONT_appCarregar(token, idExtra) {

  const sessao = MONT_autenticar_(token);
  const supervisor = sessao.perfil === MONT_PERFIL_SUPERVISOR;

  const aba = SpreadsheetApp.openById(FREE_SPREADSHEET_ID).getSheetByName(NOME_ABA);
  const ultima = aba.getLastRow();
  const linhas = ultima >= 2 ? aba.getRange(2, 1, ultima - 1, 17).getDisplayValues() : [];

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicio = new Date(hoje.getTime() - MONT_DIAS_ANTES * 86400000);
  const fim = new Date(hoje.getTime() + (supervisor ? MONT_DIAS_DEPOIS_SUPERVISOR : MONT_DIAS_DEPOIS) * 86400000);
  const inicioISO = formatISO(inicio);
  const fimISO = formatISO(fim);

  // Todas as etapas por pedido (para mostrar o resto do pedido)
  const porPedido = {};
  const todas = linhas
    .filter(function (l) { return String(l[0] || "").trim(); })
    .map(function (l) {
      const data = parseData(l[6]);
      const etapa = {
        id: String(l[0]).trim(),
        pedido: String(l[1] || "").trim(),
        dataEvento: l[2],
        cliente: l[3],
        local: l[4],
        etapa: l[5],
        dataISO: data ? formatISO(data) : "",
        horario: l[7],
        caminhao: l[8],
        responsavel: l[9],
        equipe: MONT_separarNomes_(l[10]),
        observacao: l[11],
        lat: l[13],
        lng: l[14],
        lona: normalizarSimNao(l[15]),
        confirmadoDecorador: CRON_confirmacaoEhSim_(l[16])
      };
      (porPedido[etapa.pedido] = porPedido[etapa.pedido] || []).push(etapa);
      return etapa;
    });

  const minhas = todas.filter(function (e) {

    const extra = idExtra && e.id === String(idExtra);

    if (!extra && (!e.dataISO || e.dataISO < inicioISO || e.dataISO > fimISO)) {
      return false;
    }

    if (supervisor) {
      return extra || MONT_ehOperacao_(e.etapa);
    }

    return MONT_ehResponsavel_(e.responsavel, sessao.nome);
  });

  // Dados extras só para as etapas que vão para o app
  const info = buscarInfoLogisticaMatriz_();
  let alertas = {};
  let resumo = {};
  let free = {};
  try { alertas = buscarAlertasMotoristaPorPedido_(); } catch (e) { console.error(e); }
  try { resumo = MON_buscarMapaResumoMontagem_(); } catch (e) { console.error(e); }
  try { free = MONT_freePorEtapa_(); } catch (e) { console.error(e); }
  let trocas = {};
  try { trocas = TROCA_mapaPorEtapa_(); } catch (e) { console.error(e); }

  const etapas = minhas.map(function (e) {

    const infoPedido = info[e.pedido] || {};
    const alerta = alertas[e.pedido] || null;

    e.operacao = MONT_ehOperacao_(e.etapa) ? MONT_normalizar_(e.etapa) : "";
    e.registros = MONT_contarRegistros_(resumo[e.id]);
    e.free = free[e.id] || null;
    e.trocas = trocas[e.id] || [];

    // Desmontagem: sacolas de proteção registradas na montagem do mesmo pedido
    e.sacolasMontagem = [];
    if (e.operacao === "desmontagem") {
      (porPedido[e.pedido] || []).forEach(function (o) {
        if (MONT_normalizar_(o.etapa) !== "montagem" || !resumo[o.id]) {
          return;
        }
        (resumo[o.id].sacolas || []).forEach(function (s) {
          e.sacolasMontagem.push({ codigo: s.codigo, fotos: s.fotos || [], dataMontagem: o.dataISO });
        });
      });
    }
    const alertaResolvido = alerta && ["RESOLVIDO", "FINALIZADO"].indexOf(alerta.status) >= 0;
    e.alerta = alerta && !alertaResolvido
      ? { problema: alerta.problema || "Alerta do motorista", observacao: alerta.observacao, enviadoPor: alerta.enviadoPor }
      : null;
    e.info = {
      baldeacao: infoPedido.baldeacao || "",
      escada: infoPedido.escada || "",
      caminhaoPerto: infoPedido.caminhaoPerto || "",
      horarioLimite: infoPedido.horarioLimite || ""
    };
    e.outrasEtapas = (porPedido[e.pedido] || [])
      .filter(function (o) { return o.id !== e.id; })
      .map(function (o) {
        return { etapa: o.etapa, dataISO: o.dataISO, horario: o.horario, caminhao: o.caminhao, responsavel: o.responsavel };
      })
      .sort(function (a, b) { return (a.dataISO + a.horario).localeCompare(b.dataISO + b.horario); });

    return e;
  });

  etapas.sort(function (a, b) {
    return (a.dataISO + " " + a.horario).localeCompare(b.dataISO + " " + b.horario);
  });

  const resposta = { nome: sessao.nome, perfil: sessao.perfil, etapas: etapas };

  // Link direto para uma etapa que não é deste montador
  if (idExtra && !etapas.some(function (e) { return e.id === String(idExtra); })) {
    const alvo = todas.filter(function (e) { return e.id === String(idExtra); })[0];
    resposta.avisoExtra = alvo
      ? "Esta etapa é de " + (alvo.responsavel || "outro responsável") + ". Peça para ele registrar ou entre como supervisor."
      : "Etapa não encontrada.";
  }

  return JSON.parse(JSON.stringify(resposta));
}

/* Link oficial do app (usado no cronograma) */
function MONT_getUrlApp() {
  return FREE_urlBase_() + "?page=montador";
}

/* QR de presença dos free, aberto pelo líder no próprio app */
function MONT_qrVaga(token, idEtapa) {

  const sessao = MONT_autenticar_(token);
  const etapa = getEtapaOperacao(idEtapa);

  if (!etapa || !MONT_podeVer_(sessao, etapa)) {
    throw new Error("Você não tem acesso a esta etapa.");
  }

  const vaga = FREE_lerVagas_(true).filter(function (v) {
    return v.idEtapa === String(idEtapa) && v.status !== FREE_VAGA_CANCELADA;
  })[0];

  if (!vaga) {
    throw new Error("Esta etapa não tem vaga de free.");
  }

  return FREE_dadosQr_(FREE_garantirSegredos_(vaga));
}
