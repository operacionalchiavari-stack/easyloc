/* =====================================================================
   PEDIDOS DO SISTEMA → CRONOGRAMA (out/2026)

   Quem abastece o cronograma são os pedidos do Comercial (separacoes_pedidos).
   Ao salvar um pedido, a tela chama CRON_sincronizarPedidoAcervo(id):
   - status entre os escolhidos em Parâmetros (padrão: pré-reserva e aprovado)
     → cria/atualiza as etapas Triagem (Separação), Carregamento, Montagem,
       Desmontagem e Triagem (Conferência);
   - fora deles (orçamento, cancelado) → as etapas do pedido saem do cronograma.

   Cada linha fica ligada ao pedido pela coluna R (id do pedido no sistema);
   é por ela que o cronograma separa um pedido novo de um antigo com o mesmo
   número. A coluna S guarda a data que o pedido calculou: se a logística
   mudou a data da etapa no cronograma, ela não é sobrescrita.
   Cliente e local sempre vêm do pedido (no cronograma ficam travados).
   ===================================================================== */

const CRON_COL_PEDIDO_SISTEMA = 18; // R
const CRON_COL_DATA_SUGERIDA = 19;  // S
const CRON_COL_HORA_SUGERIDA = 20;  // T: horário que o pedido calculou (mesma ideia da data)

// Completa pedidos existentes sem duplicar nas leituras seguintes.
function CRON_garantirDescarregamentos_(sheet){
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const linhas = sheet.getDataRange().getValues().slice(1);
    const chave = function(l){ return String(l[17] || l[1] || ""); };
    const existentes = new Set(linhas.filter(function(l){
      return String(l[5] || "").toLowerCase() === "descarregamento";
    }).map(chave));
    const bases = new Map();
    const prioridade = function(l){
      const tipo = String(l[5] || "").toLowerCase();
      return tipo.includes("triagem") && tipo.includes("confer") ? 3 : tipo === "desmontagem" ? 2 : 1;
    };
    linhas.forEach(function(l){
      const key = chave(l);
      if(!key || !l[6] || existentes.has(key)) return;
      if(!bases.has(key) || prioridade(l) > prioridade(bases.get(key))) bases.set(key, l);
    });
    bases.forEach(function(l, key){
      const tipo = String(l[5] || "").toLowerCase();
      const nova = l.slice(0, 20);
      while(nova.length < 20) nova.push("");
      nova[0] = Utilities.getUuid();
      nova[5] = "Descarregamento";
      nova[8] = "";
      nova[11] = "Gerado automaticamente: conferência do descarregamento";
      nova[12] = "";
      nova[15] = "";
      nova[16] = "";
      sheet.appendRow(nova);
      existentes.add(key);
    });
    CRON_ordenarDescarregamentos_(sheet);
  } finally {
    lock.releaseLock();
  }
}

// Descarregamento só pode ocorrer depois da última desmontagem do pedido.
function CRON_ordenarDescarregamentos_(sheet){
  const regras = typeof Acervo !== "undefined" && Acervo.regrasCronograma ? Acervo.regrasCronograma() : {};
  const intervalo = Math.max(1, Number(regras.descarregamento_minutos_apos_desmontagem ?? 60));
  const linhas = sheet.getDataRange().getValues();
  const chave = l => String(l[17] || l[1] || "");
  const instante = function(l){
    const texto = CRON_dataTexto_(l[6]);
    const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
    const iso = br ? br[3] + "-" + br[2] + "-" + br[1] : texto.slice(0, 10);
    const hora = CRON_horaTexto_(l[7]) || "23:59";
    return new Date(iso + "T" + hora + ":00");
  };
  const desmontagens = new Map();
  linhas.slice(1).forEach(function(l){
    if(String(l[5] || "").toLowerCase() !== "desmontagem") return;
    const data = instante(l), anterior = desmontagens.get(chave(l));
    if(!isNaN(data.getTime()) && (!anterior || data > anterior)) desmontagens.set(chave(l), data);
  });
  linhas.forEach(function(l, i){
    if(i === 0 || String(l[5] || "").toLowerCase() !== "descarregamento") return;
    const desmontagem = desmontagens.get(chave(l));
    if(!desmontagem) return;
    const atual = instante(l);
    const depois = new Date(desmontagem.getTime() + intervalo * 60000);
    if(!isNaN(atual.getTime()) && atual >= depois) return;
    sheet.getRange(i + 1, 7, 1, 2).setValues([[
      Utilities.formatDate(depois, Session.getScriptTimeZone(), "dd/MM/yyyy"),
      Utilities.formatDate(depois, Session.getScriptTimeZone(), "HH:mm")
    ]]);
  });
  const descargas = new Map();
  sheet.getDataRange().getValues().slice(1).forEach(l => {
    if(String(l[5] || "").toLowerCase() !== "descarregamento") return;
    const data = instante(l), anterior = descargas.get(chave(l));
    if(!isNaN(data.getTime()) && (!anterior || data > anterior)) descargas.set(chave(l),data);
  });
  sheet.getDataRange().getValues().forEach((l,i) => {
    const tipo=String(l[5] || "").toLowerCase();
    if(!i || !tipo.includes("triagem") || !tipo.includes("confer")) return;
    const descarga=descargas.get(chave(l));
    if(!descarga || instante(l)>descarga) return;
    const depois=new Date(descarga.getTime()+60000);
    sheet.getRange(i+1,7,1,2).setValues([[
      Utilities.formatDate(depois,Session.getScriptTimeZone(),"dd/MM/yyyy"),
      Utilities.formatDate(depois,Session.getScriptTimeZone(),"HH:mm")
    ]]);
  });
}

function CRON_garantirColunasPedidoSistema_(sheet){
  if(sheet.getMaxColumns() < CRON_COL_HORA_SUGERIDA){
    sheet.insertColumnsAfter(sheet.getMaxColumns(), CRON_COL_HORA_SUGERIDA - sheet.getMaxColumns());
  }
  const cab = sheet.getRange(1, CRON_COL_PEDIDO_SISTEMA, 1, 3).getValues()[0];
  if(cab[0] !== "PEDIDO SISTEMA" || cab[1] !== "DATA SUGERIDA" || cab[2] !== "HORA SUGERIDA"){
    sheet.getRange(1, CRON_COL_PEDIDO_SISTEMA, 1, 3).setValues([["PEDIDO SISTEMA", "DATA SUGERIDA", "HORA SUGERIDA"]]);
  }
}

function CRON_somarDias_(iso, dias){
  if(!iso) return "";
  const p = String(iso).slice(0, 10).split("-").map(Number);
  const d = new Date(p[0], p[1] - 1, p[2] + Number(dias || 0));
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
}

function CRON_dataTexto_(valor){
  if(Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())){
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  return String(valor || "").trim();
}

function CRON_horaTexto_(valor){
  if(Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())){
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "HH:mm");
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(String(valor || "").trim());
  return m ? m[1].padStart(2, "0") + ":" + m[2] : "";
}

function CRON_numeroRegra_(valor, padrao){
  return valor === null || valor === undefined || valor === "" || isNaN(Number(valor)) ? padrao : Number(valor);
}

function CRON_etapasDoPedido_(pedido, regras){
  const entrega = pedido.data_entrega || pedido.data_evento;
  const coleta = pedido.data_coleta || pedido.data_evento_fim || pedido.data_evento;
  const diasCarregamento = CRON_numeroRegra_(regras.carregamento_dias_antes_entrega, 0);
  const diasTriagem = CRON_numeroRegra_(regras.triagem_dias_antes_carregamento, 1);
  const carregamentoISO = entrega ? Utilities.formatDate(
    new Date(Number(entrega.slice(0, 4)), Number(entrega.slice(5, 7)) - 1, Number(entrega.slice(8, 10)) - diasCarregamento),
    Session.getScriptTimeZone(), "yyyy-MM-dd") : "";
  // Horário: montagem no horário de entrega do pedido e desmontagem no de coleta; o resto no horário padrão.
  const obs = pedido.observacoes || {};
  const hora = function(v){ return /^\d{2}:\d{2}/.test(String(v || "")) ? String(v).slice(0, 5) : ""; };
  const padrao = String(regras.hora_padrao || "08:00").slice(0, 5);
  const horaEntrega = hora(obs.horario_entrega || (obs.horarios_pedido || {}).entrega) || padrao;
  const horaColeta = hora(obs.horario_coleta || (obs.horarios_pedido || {}).coleta) || padrao;
  return [
    { etapa: "Triagem (Separação)", data: CRON_somarDias_(carregamentoISO, -diasTriagem), triagem: true, horario: padrao },
    { etapa: "Carregamento", data: CRON_somarDias_(carregamentoISO, 0), horario: padrao },
    { etapa: "Montagem", data: CRON_somarDias_(entrega, CRON_numeroRegra_(regras.montagem_dias_apos_entrega, 0)), horario: horaEntrega },
    { etapa: "Desmontagem", data: CRON_somarDias_(coleta, CRON_numeroRegra_(regras.desmontagem_dias_apos_coleta, 0)), horario: horaColeta },
    { etapa: "Descarregamento", data: CRON_somarDias_(coleta, CRON_numeroRegra_(regras.triagem_retorno_dias_apos_coleta, 0)), horario: padrao },
    { etapa: "Triagem (Conferência)", data: CRON_somarDias_(coleta, CRON_numeroRegra_(regras.triagem_retorno_dias_apos_coleta, 0)), triagem: true, horario: padrao }
  ].filter(function(e){ return e.data; });
}

function CRON_sincronizarPedidoAcervo(pedidoId){
  if(!Acervo.usuario()) throw new Error("Entre no sistema para atualizar o cronograma.");
  if(!Acervo.pode("comercial.pedidos.editar") && !Acervo.pode("comercial.pedidos.criar")){
    throw new Error("Sem permissão para atualizar pedidos.");
  }
  return CRON_sincronizarPedidoAcervo_(pedidoId);
}

function CRON_sincronizarPedidoAcervo_(pedidoId){
  const lido = Acervo.pedidoParaCronograma(String(pedidoId || ""));
  const pedido = lido.pedido, regras = lido.regras || {};
  if(!pedido) throw new Error("Pedido não encontrado.");

  const sheet = SpreadsheetApp.openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ").getSheetByName(NOME_ABA);
  CRON_garantirColunaConfirmacao_(sheet);
  CRON_garantirColunasPedidoSistema_(sheet);
  const dados = sheet.getDataRange().getValues();

  const ligadas = [];
  for(let i = 1; i < dados.length; i++){
    if(String(dados[i][CRON_COL_PEDIDO_SISTEMA - 1] || "") === String(pedido.id)) ligadas.push({ linha: i + 1, valores: dados[i] });
  }

  const statusPermitidos = Array.isArray(regras.status_cronograma) && regras.status_cronograma.length
    ? regras.status_cronograma : ["pre_reserva", "aprovado"];
  const entra = statusPermitidos.indexOf(pedido.status_comercial) >= 0 && Boolean(pedido.data_evento);

  if(!entra){
    ligadas.slice().reverse().forEach(function(l){ sheet.deleteRow(l.linha); });
    if(Acervo.sincronizacaoCronogramaConcluida) Acervo.sincronizacaoCronogramaConcluida(pedido.id,pedido.revisao);
    return { noCronograma: false, removidas: ligadas.length, status: pedido.status_comercial };
  }

  const numero = String(pedido.numero_pedido || "").trim();
  const cliente = String(pedido.cliente_nome || "").trim();
  const local = lido.endereco && pedido.local_nome
    ? pedido.local_nome + " - " + lido.endereco
    : String(pedido.local_nome || lido.endereco || "").trim();
  const dataEvento = CRON_somarDias_(pedido.data_evento, 0);

  // Coordenadas do evento só quando o local muda (consulta o Google Maps).
  const localAntes = ligadas.length ? String(ligadas[0].valores[4] || "") : "";
  let lat = ligadas.length ? ligadas[0].valores[13] : "", lng = ligadas.length ? ligadas[0].valores[14] : "";
  if(!ligadas.length || localAntes !== local || !lat){
    const c = local ? obterCoordenadasEndereco(local) : {};
    lat = c.latitude || ""; lng = c.longitude || "";
  }

  const etapas = CRON_etapasDoPedido_(pedido, regras);
  let criadas = 0, atualizadas = 0;
  const usadas = new Set();

  etapas.forEach(function(e){
    // Primeiro a linha que o próprio pedido criou (tem data sugerida); depois uma criada à mão com o mesmo nome.
    const candidatas = ligadas.filter(function(l){
      return !usadas.has(l.linha) && String(l.valores[5] || "").trim() === e.etapa;
    });
    const existente = candidatas.find(function(l){ return CRON_dataTexto_(l.valores[CRON_COL_DATA_SUGERIDA - 1]); }) || candidatas[0];
    if(existente){
      usadas.add(existente.linha);
      const dataAtual = CRON_dataTexto_(existente.valores[6]);
      const sugeridaAntes = CRON_dataTexto_(existente.valores[CRON_COL_DATA_SUGERIDA - 1]);
      // Data mudada à mão no cronograma (ou etapa criada à mão) fica como está.
      const novaData = sugeridaAntes && dataAtual === sugeridaAntes ? e.data : dataAtual;
      sheet.getRange(existente.linha, 2, 1, 6).setValues([[numero, dataEvento, cliente, local, e.etapa, novaData]]);
      sheet.getRange(existente.linha, 14, 1, 2).setValues([[lat, lng]]);
      // Horário só acompanha o pedido enquanto ninguém mudou no cronograma (vazio ou igual ao calculado antes).
      const horaAtual = CRON_horaTexto_(existente.valores[7]);
      const horaAntes = CRON_horaTexto_(existente.valores[CRON_COL_HORA_SUGERIDA - 1]);
      if(!horaAtual || horaAtual === horaAntes || (!horaAntes && horaAtual === String(regras.hora_padrao || "08:00").slice(0, 5))){
        sheet.getRange(existente.linha, 8, 1, 1).setValues([[e.horario]]);
      }
      sheet.getRange(existente.linha, CRON_COL_HORA_SUGERIDA, 1, 1).setValues([[e.horario]]);
      sheet.getRange(existente.linha, CRON_COL_DATA_SUGERIDA, 1, 1).setValues([[e.data]]);
      atualizadas++;
    }else{
      const linha = [
        Utilities.getUuid(), numero, dataEvento, cliente, local, e.etapa, e.data, e.horario, "",
        e.triagem ? (regras.triagem_responsavel || "") : "",
        e.triagem ? (regras.triagem_equipe || "") : "",
        "Gerado pelo pedido", "", lat, lng, "", "", pedido.id, e.data, e.horario
      ];
      sheet.appendRow(linha);
      criadas++;
    }
  });

  // Etapas a mais criadas à mão no cronograma (ex.: uma 2ª montagem): só acompanham cliente e local.
  ligadas.filter(function(l){ return !usadas.has(l.linha); }).forEach(function(l){
    sheet.getRange(l.linha, 2, 1, 4).setValues([[numero, dataEvento, cliente, local]]);
  });

  CRON_ordenarDescarregamentos_(sheet);
  // Painel Logístico (out/2026): escala automática do que ficou vazio (equipe, responsável, caminhão)
  try { ESC_preencherPedido_(pedido.id); } catch(e) { Logger.log("Escala automática: " + e.message); }
  if(Acervo.sincronizacaoCronogramaConcluida) Acervo.sincronizacaoCronogramaConcluida(pedido.id,pedido.revisao);
  return { noCronograma: true, criadas: criadas, atualizadas: atualizadas, numero: numero };
}
