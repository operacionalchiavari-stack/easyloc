/****************************************************
 * PAINEL DA RH (?page=rh) — fora do cronograma
 *
 * - Pagamento dos free por ciclo (terça a segunda),
 *   com check-in/check-out, horas, hora extra e ajustes.
 * - Fotos dos eventos e avaliação de uniforme
 *   (uniforme ruim tira ponto do free e fica
 *   registrado contra o responsável da montagem).
 *
 * Login: linha "RH" (ou "Recursos Humanos") da aba Senhas.
 * A senha do Supervisor de Montagem também entra.
 *
 * Abas criadas automaticamente:
 *   RH_Pagamentos  — decisões e pagamento de cada diária
 *   RH_Uniforme    — avaliação de uniforme por free/evento
 ****************************************************/

const RH_PERFIL = "RH";
const RH_ABA_PAGAMENTOS = "RH_Pagamentos";
const RH_ABA_UNIFORME = "RH_Uniforme";
const RH_PROP_VALOR_HORA = "RH_VALOR_HORA";
const RH_PROP_HORAS_DIARIA = "RH_HORAS_DIARIA";
const RH_HORAS_DIARIA_PADRAO = 8;

const RH_CAB_PAGAMENTOS = [
  "ID Inscrição", "Ciclo", "Pagar hora extra", "Ajuste (R$)", "Motivo do ajuste",
  "Não pagar", "Valor pago", "Pago em", "Forma", "Pago por",
  "Atualizado por", "Atualizado em"
];

const RH_CAB_UNIFORME = [
  "ID Inscrição", "ID Free", "Nome", "ID Vaga", "ID Etapa", "Responsável da etapa",
  "Avaliação", "Observação", "Avaliado por", "Avaliado em"
];

const RH_UNIFORME_OPCOES = ["OK", "INCOMPLETO", "SEM"];


/****************************************************
 * APOIO
 ****************************************************/
function RH_aba_(nome, cabecalho) {

  const planilha = SpreadsheetApp.openById(FREE_SPREADSHEET_ID);
  let aba = planilha.getSheetByName(nome);

  if (!aba) {
    aba = planilha.insertSheet(nome);
    aba.getRange(1, 1, 1, cabecalho.length)
      .setValues([cabecalho])
      .setFontWeight("bold")
      .setBackground("#2b2a26")
      .setFontColor("#ffffff");
    aba.setFrozenRows(1);
    aba.getRange(1, 1, aba.getMaxRows(), cabecalho.length).setNumberFormat("@");
  }

  return aba;
}

function RH_linhas_(nome, cabecalho) {
  const aba = RH_aba_(nome, cabecalho);
  const ultima = aba.getLastRow();
  return {
    aba: aba,
    linhas: ultima < 2 ? [] : aba.getRange(2, 1, ultima - 1, cabecalho.length).getDisplayValues()
  };
}

function RH_numero_(valor) {
  if (typeof valor === "number") {
    return valor;
  }
  const texto = String(valor == null ? "" : valor).trim();
  if (!texto) {
    return 0;
  }
  const n = Number(texto.indexOf(",") >= 0 ? texto.replace(/\./g, "").replace(",", ".") : texto);
  return isNaN(n) ? 0 : n;
}

function RH_dinheiro_(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function RH_isoMaisDias_(iso, dias) {
  const p = String(iso).split("-");
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + dias);
  return formatISO(d);
}

/* Terça-feira do ciclo que contém a data */
function RH_inicioCiclo_(data) {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const volta = (d.getDay() - 2 + 7) % 7; // 2 = terça
  d.setDate(d.getDate() - volta);
  return formatISO(d);
}

function RH_config_() {
  const props = PropertiesService.getScriptProperties();
  return {
    valorHora: RH_numero_(props.getProperty(RH_PROP_VALOR_HORA)),
    horasDiaria: RH_numero_(props.getProperty(RH_PROP_HORAS_DIARIA)) || RH_HORAS_DIARIA_PADRAO
  };
}


/****************************************************
 * LOGIN (sessão guardada na mesma aba do app do montador)
 ****************************************************/
function RH_login(senha) {

  const senhaLimpa = String(senha || "").trim();

  if (!senhaLimpa) {
    throw new Error("Digite a senha.");
  }

  let usuario = "";

  const linhas = SpreadsheetApp.openById(MONT_ID_SENHAS)
    .getSheetByName("Senhas")
    .getDataRange()
    .getValues();

  for (let i = 1; i < linhas.length; i++) {
    const setor = MONT_normalizar_(linhas[i][0]);
    const ehRh = /(^|\s)rh(\s|$)/.test(setor) || setor.indexOf("recursos humanos") >= 0;
    if (ehRh && String(linhas[i][1] || "").trim() === senhaLimpa) {
      usuario = String(linhas[i][2] || linhas[i][0] || "RH").trim();
      break;
    }
  }

  if (!usuario) {
    const supervisor = validarSenhaPerfil(senhaLimpa);
    if (senhaLimpa === CRON_SENHA_SUPERVISOR_MONTAGEM || (supervisor && supervisor.perfil === "montagem")) {
      usuario = supervisor && supervisor.usuario ? supervisor.usuario : "Supervisor de Montagem";
    }
  }

  if (!usuario) {
    throw new Error("Senha incorreta.");
  }

  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const expira = new Date().getTime() + 30 * 86400000;
  MONT_abaSessoes_().appendRow([token, usuario, RH_PERFIL, FREE_agoraTexto_(), String(expira)]);

  return { token: token, nome: usuario, cicloAtual: RH_inicioCiclo_(new Date()) };
}

function RH_autenticar_(token) {
  const sessao = MONT_autenticar_(token);
  if (sessao.perfil !== RH_PERFIL) {
    throw new Error("SESSAO_EXPIRADA: entre de novo.");
  }
  return sessao;
}

function RH_sair(token) {
  return MONT_sair(token);
}


/****************************************************
 * UNIFORME E PAGAMENTOS (leitura)
 ****************************************************/
let RH_cacheUniforme = null;

/* { idInscricao: { avaliacao, observacao, ... } } — usado também pela nota do free */
function RH_mapaUniforme_() {

  if (RH_cacheUniforme) {
    return RH_cacheUniforme;
  }

  const mapa = {};
  const planilha = SpreadsheetApp.openById(FREE_SPREADSHEET_ID);

  if (planilha.getSheetByName(RH_ABA_UNIFORME)) {
    RH_linhas_(RH_ABA_UNIFORME, RH_CAB_UNIFORME).linhas.forEach(function (l, i) {
      if (l[0]) {
        mapa[l[0]] = {
          linha: i + 2, avaliacao: l[6], observacao: l[7],
          avaliadoPor: l[8], avaliadoEm: l[9], responsavel: l[5]
        };
      }
    });
  }

  RH_cacheUniforme = mapa;
  return mapa;
}

function RH_mapaPagamentos_() {
  const mapa = {};
  RH_linhas_(RH_ABA_PAGAMENTOS, RH_CAB_PAGAMENTOS).linhas.forEach(function (l, i) {
    if (l[0]) {
      mapa[l[0]] = {
        linha: i + 2,
        pagarExtra: l[2] === "SIM",
        ajuste: RH_numero_(l[3]),
        motivoAjuste: l[4],
        naoPagar: l[5] === "SIM",
        valorPago: l[6] === "" ? null : RH_numero_(l[6]),
        pagoEm: l[7],
        forma: l[8],
        pagoPor: l[9],
        atualizadoPor: l[10],
        atualizadoEm: l[11]
      };
    }
  });
  return mapa;
}


/****************************************************
 * CÁLCULO DE CADA DIÁRIA
 ****************************************************/
function RH_calcular_(vaga, ins, pag, uniforme, config) {

  const fase = FREE_fasePresenca_(vaga, ins);
  const minutos = FREE_minutosTrabalhados_(ins);
  const entrada = FREE_parseDataHora_(ins.checkinEm);
  const marcado = FREE_dataHoraVaga_(vaga);
  const atraso = entrada && marcado ? Math.round((entrada.getTime() - marcado.getTime()) / 60000) : 0;

  const diaria = RH_dinheiro_(vaga.valor);
  const extraMin = minutos != null ? Math.max(0, minutos - Math.round(config.horasDiaria * 60)) : 0;
  const extraValor = RH_dinheiro_(extraMin / 60 * config.valorHora);

  const motivos = [];
  let situacao = "PAGAR";

  if (fase === FREE_FASE_FALTOU) {
    situacao = "NAO_PAGAR";
    motivos.push("Faltou (sem check-in)");
  } else if (fase === FREE_FASE_AGUARDANDO || fase === FREE_FASE_CHECKIN || fase === FREE_FASE_TRABALHANDO) {
    situacao = "EM_ANDAMENTO";
  } else {
    if (fase === FREE_FASE_SEM_CHECKOUT) { motivos.push("Sem check-out: horas não calculadas"); }
    if (ins.presencaPor) { motivos.push("Presença lançada à mão por " + ins.presencaPor); }
    if (ins.checkinDistancia !== "" && ins.checkinDistancia > FREE_DISTANCIA_ALERTA_M) {
      motivos.push("Check-in a " + (ins.checkinDistancia / 1000).toFixed(1).replace(".", ",") + " km do ponto");
    }
    if (atraso > FREE_TOLERANCIA_ATRASO_MIN) { motivos.push("Chegou " + atraso + " min atrasado"); }
    if (!ins.fotoUniforme && !ins.presencaPor) { motivos.push("Sem foto de uniforme"); }
    if (uniforme && uniforme.avaliacao === "INCOMPLETO") { motivos.push("Uniforme incompleto"); }
    if (uniforme && uniforme.avaliacao === "SEM") { motivos.push("Sem uniforme"); }
    if (motivos.length) { situacao = "REVISAR"; }
  }

  if (pag && pag.naoPagar) {
    situacao = "NAO_PAGAR";
    motivos.unshift("Marcado para não pagar");
  }

  const pagavel = situacao === "PAGAR" || situacao === "REVISAR";
  const total = pagavel
    ? RH_dinheiro_(diaria + (pag && pag.pagarExtra ? extraValor : 0) + (pag ? pag.ajuste : 0))
    : 0;

  if (pag && pag.valorPago != null && pag.pagoEm) {
    situacao = "PAGO";
  }

  return {
    fase: fase,
    minutos: minutos,
    horas: FREE_duracaoTexto_(minutos),
    atrasoMin: Math.max(0, atraso),
    diaria: diaria,
    extraMin: extraMin,
    extraTexto: FREE_duracaoTexto_(extraMin),
    extraValor: extraValor,
    total: situacao === "PAGO" ? pag.valorPago : total,
    situacao: situacao,
    motivos: motivos
  };
}


/****************************************************
 * FOTOS DO EVENTO
 ****************************************************/
function RH_fotosEtapa_(idEtapa, ehDesmontagem, resumo, trocas) {

  const fotos = [];
  const r = resumo[idEtapa] || {};

  function add(url, tipo, legenda) {
    if (url) { fotos.push({ url: url, tipo: tipo, legenda: legenda || "" }); }
  }

  if (r.equipeTerceirizada) {
    add(r.equipeTerceirizada.foto, "equipe", "Foto da equipe" + (r.equipeTerceirizada.empresa ? " · " + r.equipeTerceirizada.empresa : ""));
  }
  (r.sacolas || []).forEach(function (s) { (s.fotos || []).forEach(function (u) { add(u, "sacola", "Sacola " + (s.codigo || "")); }); });
  if (r.posicionamento) { (r.posicionamento.fotos || []).forEach(function (u, i) { add(u, "posicionamento", "Posicionamento " + (i + 1)); }); }
  if (r.listaAssinada) { add(r.listaAssinada.foto, "lista", "Lista assinada" + (r.listaAssinada.recebedor ? " · " + r.listaAssinada.recebedor : "")); }

  if (ehDesmontagem) {
    try {
      const conferida = verificarListaConferidaDesmontagem(idEtapa);
      ((conferida && conferida.fotos) || []).forEach(function (u, i) { add(u, "lista", "Lista conferida · pág. " + (i + 1)); });
    } catch (e) {
      console.error(e);
    }
  }

  (trocas[idEtapa] || []).forEach(function (t) { add(t.fotoUrl, "troca", "Troca: " + t.quantidade + "× " + t.item); });

  return fotos;
}


/****************************************************
 * CICLO (terça a segunda)
 ****************************************************/
function RH_dadosCiclo_(inicioISO) {

  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(String(inicioISO || ""))
    ? RH_inicioCiclo_(parseData(inicioISO))
    : RH_inicioCiclo_(new Date());
  const fim = RH_isoMaisDias_(inicio, 6);
  const config = RH_config_();

  RH_cacheUniforme = null;
  const uniformes = RH_mapaUniforme_();
  const pagamentos = RH_mapaPagamentos_();
  const etapas = FREE_mapaEtapasCronograma_();
  const vagas = FREE_lerVagas_(true).filter(function (v) {
    return v.dataISO >= inicio && v.dataISO <= fim && v.status !== FREE_VAGA_CANCELADA;
  });
  const todasInscricoes = FREE_lerInscricoes_();
  const porVaga = FREE_agruparInscricoes_(todasInscricoes);
  const notas = FREE_mapaPontuacoes_(todasInscricoes, FREE_lerVagas_(true));

  const cadastros = {};
  FREE_lerLinhas_("cadastros").linhas.map(FREE_cadastroParaObjeto_).forEach(function (c) { cadastros[c.id] = c; });

  let resumo = {};
  let trocas = {};
  try { resumo = MON_buscarMapaResumoMontagem_(); } catch (e) { console.error(e); }
  try { trocas = TROCA_mapaPorEtapa_(); } catch (e) { console.error(e); }

  const idsFree = [];
  const eventos = vagas.map(function (vaga) {

    const etapa = etapas[vaga.idEtapa] || {};
    const confirmados = (porVaga[vaga.idVaga] || []).filter(function (i) { return i.status === FREE_INS_CONFIRMADO; });

    const pessoas = confirmados.map(function (ins) {

      const cad = cadastros[ins.idFree] || {};
      const pag = pagamentos[ins.id] || null;
      const uni = uniformes[ins.id] || null;
      idsFree.push(ins.idFree);

      return {
        idInscricao: ins.id,
        idFree: ins.idFree,
        nome: ins.nome,
        cpf: ins.cpf,
        telefone: ins.telefone,
        pix: cad.pix || "",
        nota: (notas[ins.idFree] || FREE_notaVazia_()).nota,
        checkinEm: ins.checkinEm,
        checkoutEm: ins.checkoutEm,
        via: ins.checkinVia,
        distancia: ins.checkinDistancia,
        presencaPor: ins.presencaPor,
        fotoUniforme: ins.fotoUniforme,
        fotoUniformeId: ins.fotoUniformeId,
        uniforme: uni ? { avaliacao: uni.avaliacao, observacao: uni.observacao, avaliadoPor: uni.avaliadoPor } : null,
        pagamento: pag ? {
          pagarExtra: pag.pagarExtra, ajuste: pag.ajuste, motivoAjuste: pag.motivoAjuste, naoPagar: pag.naoPagar,
          valorPago: pag.valorPago, pagoEm: pag.pagoEm, forma: pag.forma, pagoPor: pag.pagoPor
        } : null,
        calc: RH_calcular_(vaga, ins, pag, uni, config)
      };
    });

    return {
      idVaga: vaga.idVaga,
      idEtapa: vaga.idEtapa,
      pedido: vaga.pedido,
      cliente: vaga.cliente,
      local: vaga.local,
      etapa: vaga.etapa,
      dataISO: vaga.dataISO,
      horario: vaga.horario,
      lider: vaga.lider,
      responsavel: etapa.responsavel || vaga.lider,
      valor: vaga.valor,
      quantidade: vaga.quantidade,
      fotos: RH_fotosEtapa_(vaga.idEtapa, MONT_normalizar_(vaga.etapa) === "desmontagem", resumo, trocas),
      pessoas: pessoas
    };
  }).sort(function (a, b) { return (a.dataISO + a.horario).localeCompare(b.dataISO + b.horario); });

  // Foto do cadastro para comparar com as fotos do evento
  const miniaturas = FREE_mapaMiniaturas_(idsFree);
  eventos.forEach(function (ev) {
    ev.pessoas.forEach(function (p) { p.miniatura = miniaturas[p.idFree] || ""; });
  });

  return {
    inicio: inicio,
    fim: fim,
    config: config,
    eventos: eventos
  };
}

function RH_carregarCiclo(token, inicioISO) {
  const sessao = RH_autenticar_(token);
  const dados = RH_dadosCiclo_(inicioISO);
  dados.usuario = sessao.nome;
  return JSON.parse(JSON.stringify(dados));
}


/****************************************************
 * AÇÕES DA RH
 ****************************************************/
function RH_gravarPagamento_(idInscricao, inicio, campos, usuario) {

  const dados = RH_linhas_(RH_ABA_PAGAMENTOS, RH_CAB_PAGAMENTOS);
  let indice = -1;

  for (let i = 0; i < dados.linhas.length; i++) {
    if (dados.linhas[i][0] === idInscricao) { indice = i; break; }
  }

  const atual = indice >= 0 ? dados.linhas[indice].slice() : [idInscricao, inicio, "", "", "", "", "", "", "", "", "", ""];

  Object.keys(campos).forEach(function (col) { atual[Number(col)] = campos[col]; });
  atual[1] = atual[1] || inicio;
  atual[10] = usuario;
  atual[11] = FREE_agoraTexto_();

  if (indice >= 0) {
    dados.aba.getRange(indice + 2, 1, 1, RH_CAB_PAGAMENTOS.length).setValues([atual]);
  } else {
    dados.aba.appendRow(atual);
  }
}

/* Hora extra, ajuste e "não pagar" de uma diária */
function RH_salvarDiaria(token, inicioISO, idInscricao, dados) {

  const sessao = RH_autenticar_(token);
  dados = dados || {};

  return FREE_comLock_(function () {

    const pag = RH_mapaPagamentos_()[idInscricao];
    if (pag && pag.pagoEm) {
      throw new Error("Esta diária já foi paga. Desfaça o pagamento para alterar.");
    }

    const ajuste = RH_dinheiro_(RH_numero_(dados.ajuste));
    const motivo = FREE_texto_(dados.motivoAjuste, 200);

    if (ajuste !== 0 && !motivo) {
      throw new Error("Informe o motivo do ajuste.");
    }

    RH_gravarPagamento_(idInscricao, inicioISO, {
      2: dados.pagarExtra ? "SIM" : "",
      3: ajuste ? String(ajuste) : "",
      4: ajuste ? motivo : "",
      5: dados.naoPagar ? "SIM" : ""
    }, sessao.nome);

    return RH_carregarCiclo(token, inicioISO);
  });
}

/* Trava o valor das diárias e registra o pagamento */
function RH_marcarPago(token, inicioISO, ids, forma) {

  const sessao = RH_autenticar_(token);
  const formaLimpa = FREE_texto_(forma, 40) || "PIX";

  return FREE_comLock_(function () {

    const ciclo = RH_dadosCiclo_(inicioISO);
    const pessoas = {};
    ciclo.eventos.forEach(function (ev) { ev.pessoas.forEach(function (p) { pessoas[p.idInscricao] = p; }); });

    (ids || []).forEach(function (id) {
      const p = pessoas[id];
      if (!p || (p.calc.situacao !== "PAGAR" && p.calc.situacao !== "REVISAR")) {
        return;
      }
      RH_gravarPagamento_(id, ciclo.inicio, {
        6: String(p.calc.total),
        7: FREE_agoraTexto_(),
        8: formaLimpa,
        9: sessao.nome
      }, sessao.nome);
    });

    return RH_carregarCiclo(token, ciclo.inicio);
  });
}

function RH_desfazerPago(token, inicioISO, idInscricao) {

  const sessao = RH_autenticar_(token);

  return FREE_comLock_(function () {
    RH_gravarPagamento_(idInscricao, inicioISO, { 6: "", 7: "", 8: "", 9: "" }, sessao.nome);
    return RH_carregarCiclo(token, inicioISO);
  });
}

function RH_avaliarUniforme(token, inicioISO, idInscricao, avaliacao, observacao) {

  const sessao = RH_autenticar_(token);

  if (RH_UNIFORME_OPCOES.indexOf(avaliacao) < 0 && avaliacao !== "") {
    throw new Error("Avaliação inválida.");
  }

  return FREE_comLock_(function () {

    const ins = FREE_lerInscricoes_().filter(function (i) { return i.id === idInscricao; })[0];
    if (!ins) {
      throw new Error("Confirmação não encontrada.");
    }

    const vaga = FREE_lerVagas_(true).filter(function (v) { return v.idVaga === ins.idVaga; })[0] || {};
    const etapa = FREE_mapaEtapasCronograma_()[vaga.idEtapa] || {};
    const aba = RH_aba_(RH_ABA_UNIFORME, RH_CAB_UNIFORME);
    RH_cacheUniforme = null;
    const atual = RH_mapaUniforme_()[idInscricao];

    const linha = [
      idInscricao, ins.idFree, ins.nome, ins.idVaga, vaga.idEtapa || "",
      etapa.responsavel || vaga.lider || "", avaliacao, FREE_texto_(observacao, 300),
      sessao.nome, FREE_agoraTexto_()
    ];

    if (atual) {
      aba.getRange(atual.linha, 1, 1, RH_CAB_UNIFORME.length).setValues([linha]);
    } else {
      aba.appendRow(linha);
    }

    RH_cacheUniforme = null;
    return RH_carregarCiclo(token, inicioISO);
  });
}

function RH_salvarConfig(token, inicioISO, valorHora, horasDiaria) {

  RH_autenticar_(token);

  const valor = RH_dinheiro_(RH_numero_(valorHora));
  const horas = RH_numero_(horasDiaria);

  if (valor < 0) {
    throw new Error("Valor da hora inválido.");
  }
  if (!(horas > 0 && horas <= 24)) {
    throw new Error("Informe quantas horas a diária cobre (1 a 24).");
  }

  PropertiesService.getScriptProperties().setProperties({
    RH_VALOR_HORA: String(valor),
    RH_HORAS_DIARIA: String(horas)
  });

  return RH_carregarCiclo(token, inicioISO);
}

/* Planilha nova no Drive com o fechamento do ciclo */
function RH_exportarCiclo(token, inicioISO) {

  RH_autenticar_(token);
  const ciclo = RH_dadosCiclo_(inicioISO);
  const br = function (iso) { const p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; };

  const arquivo = SpreadsheetApp.create("Pagamento free — " + br(ciclo.inicio) + " a " + br(ciclo.fim));

  // Detalhado: uma linha por diária
  const detalhe = [["Data", "Evento", "Etapa", "Free", "CPF", "Chave PIX", "Check-in", "Check-out", "Horas",
    "Hora extra", "Diária", "Hora extra (R$)", "Ajuste", "Motivo do ajuste", "Total", "Situação", "Observações", "Pago em", "Forma"]];

  const porPessoa = {};

  ciclo.eventos.forEach(function (ev) {
    ev.pessoas.forEach(function (p) {
      const c = p.calc;
      const pag = p.pagamento || {};
      detalhe.push([
        br(ev.dataISO), ev.cliente + " (#" + ev.pedido + ")", ev.etapa, p.nome, p.cpf, p.pix,
        p.checkinEm, p.checkoutEm, c.horas, c.extraTexto, c.diaria,
        pag.pagarExtra ? c.extraValor : 0, pag.ajuste || 0, pag.motivoAjuste || "",
        c.total, c.situacao, c.motivos.join("; "), pag.pagoEm || "", pag.forma || ""
      ]);

      if (c.situacao === "NAO_PAGAR" || c.situacao === "EM_ANDAMENTO") {
        return;
      }
      const r = porPessoa[p.idFree] = porPessoa[p.idFree] || { nome: p.nome, cpf: p.cpf, pix: p.pix, telefone: p.telefone, dias: 0, total: 0, pago: 0 };
      r.dias++;
      r.total = RH_dinheiro_(r.total + c.total);
      if (c.situacao === "PAGO") { r.pago = RH_dinheiro_(r.pago + c.total); }
    });
  });

  const resumo = [["Free", "CPF", "Chave PIX", "Telefone", "Dias", "Total", "Já pago", "A pagar"]];
  Object.keys(porPessoa).forEach(function (id) {
    const r = porPessoa[id];
    resumo.push([r.nome, r.cpf, r.pix, r.telefone, r.dias, r.total, r.pago, RH_dinheiro_(r.total - r.pago)]);
  });

  const abaResumo = arquivo.getSheets()[0];
  abaResumo.setName("Por pessoa");
  abaResumo.getRange(1, 1, resumo.length, resumo[0].length).setValues(resumo);
  abaResumo.getRange(1, 1, 1, resumo[0].length).setFontWeight("bold");

  const abaDetalhe = arquivo.insertSheet("Detalhado");
  abaDetalhe.getRange(1, 1, detalhe.length, detalhe[0].length).setValues(detalhe);
  abaDetalhe.getRange(1, 1, 1, detalhe[0].length).setFontWeight("bold");

  return arquivo.getUrl();
}

/* Histórico completo de um free */
function RH_fichaFree(token, idFree) {

  RH_autenticar_(token);

  const config = RH_config_();
  const vagas = FREE_lerVagas_(true);
  const mapaVagas = {};
  vagas.forEach(function (v) { mapaVagas[v.idVaga] = v; });
  const inscricoes = FREE_lerInscricoes_().filter(function (i) { return i.idFree === idFree; });
  const pagamentos = RH_mapaPagamentos_();
  RH_cacheUniforme = null;
  const uniformes = RH_mapaUniforme_();
  const cad = FREE_lerLinhas_("cadastros").linhas.map(FREE_cadastroParaObjeto_).filter(function (c) { return c.id === idFree; })[0];

  if (!cad) {
    throw new Error("Free não encontrado.");
  }

  const historico = inscricoes.map(function (ins) {
    const vaga = mapaVagas[ins.idVaga] || {};
    const calc = ins.status === FREE_INS_CONFIRMADO && vaga.idVaga
      ? RH_calcular_(vaga, ins, pagamentos[ins.id] || null, uniformes[ins.id] || null, config)
      : null;
    return {
      dataISO: vaga.dataISO, etapa: vaga.etapa, cliente: vaga.cliente, pedido: vaga.pedido,
      status: ins.status, motivoCancelamento: ins.motivo, cimaDaHora: ins.cimaDaHora,
      checkinEm: ins.checkinEm, checkoutEm: ins.checkoutEm,
      uniforme: uniformes[ins.id] ? uniformes[ins.id].avaliacao : "",
      calc: calc
    };
  }).sort(function (a, b) { return String(b.dataISO).localeCompare(String(a.dataISO)); });

  const ano = String(new Date().getFullYear());
  const mes = formatISO(new Date()).slice(0, 7);
  const pagos = historico.filter(function (h) { return h.calc && h.calc.situacao === "PAGO"; });

  return JSON.parse(JSON.stringify({
    id: cad.id, nome: cad.nome, cpf: cad.cpf, telefone: cad.telefone, pix: cad.pix, status: cad.status,
    cadastradoEm: cad.cadastradoEm,
    miniatura: FREE_mapaMiniaturas_([cad.id])[cad.id] || "",
    pontuacao: FREE_mapaPontuacoes_(FREE_lerInscricoes_(), vagas)[cad.id] || FREE_notaVazia_(),
    recebidoMes: RH_dinheiro_(pagos.filter(function (h) { return String(h.dataISO).slice(0, 7) === mes; }).reduce(function (s, h) { return s + h.calc.total; }, 0)),
    recebidoAno: RH_dinheiro_(pagos.filter(function (h) { return String(h.dataISO).slice(0, 4) === ano; }).reduce(function (s, h) { return s + h.calc.total; }, 0)),
    aPagar: RH_dinheiro_(historico.filter(function (h) { return h.calc && (h.calc.situacao === "PAGAR" || h.calc.situacao === "REVISAR"); }).reduce(function (s, h) { return s + h.calc.total; }, 0)),
    historico: historico
  }));
}
