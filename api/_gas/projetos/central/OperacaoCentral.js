/* =========================================================
   BÔNUS DA OPERAÇÃO — CENTRAL DE METAS (out/2026)

   Três equipes: Triagem, Carregamento e Montagem.

   1. Bolo do mês de cada equipe = soma, nos eventos do mês
      (planilha Matriz), de:
        valor de locação × score de dificuldade × % da equipe
   2. Portão da meta: a equipe só tem direito se ficar dentro
      dos limites da aba "Indicativos" (Bonus - Operações).
   3. Desconto: cada item danificado atribuído à equipe tira
      X% do valor de reposição dele do bolo (nunca negativo).
   4. Sobra dividida pela participação de cada pessoa nos
      eventos do mês (Cronograma), com teto de % do salário.

   Parâmetros editáveis na própria aba (PropertiesService,
   chave OPERACAO_PARAMETROS). Nada aqui grava em planilha.
========================================================= */

const OPERACAO_MATRIZ_ID = "1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78";
const OPERACAO_CRONOGRAMA_ID = "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ";
const OPERACAO_OCORRENCIAS_ID = "1i197sFXQSzZ7yVdRlQ_Z6H7K9TuaoN5rOOpPnoyjOhI";
const OPERACAO_DANOS_ID = "1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE";
const OPERACAO_CHAVE_PARAMETROS = "OPERACAO_PARAMETROS";

const OPERACAO_EQUIPES = [
  { chave: "triagem", nome: "Triagem", etapas: ["triagem (separacao)", "triagem (conferencia)"], colunaScore: 39, indicativos: "internos" },
  { chave: "carregamento", nome: "Carregamento", etapas: ["carregamento"], colunaScore: 46, indicativos: "carregamento" },
  { chave: "montagem", nome: "Montagem", etapas: ["montagem", "desmontagem"], colunaScore: 32, indicativos: "externos" }
];

function operacaoParametrosPadrao_(){
  return {
    percentual: { triagem: 0.3, carregamento: 0.3, montagem: 0.5 },
    scorePadrao: { triagem: 50, carregamento: 50, montagem: 50 },
    descontoPercentual: 5,
    tetoDescontoItem: 0,
    tetoSalario: 25,
    metasCarregamento: [
      { nome: "Itens esquecidos", meta: 3 },
      { nome: "Itens sem capa de proteção", meta: 4 },
      { nome: "Itens danificados", meta: 5 }
    ],
    /* Membros de cada equipe. Vazio = pelos setores do cadastro do RH. */
    membros: { triagem: [], carregamento: [], montagem: [] },
    setoresRH: {
      triagem: ["setor 02", "setor 03"],
      carregamento: ["expedicao"],
      montagem: ["montagem", "operacoes externas"]
    },
    /* Pessoas fora do cadastro do RH (teste ou ainda não cadastradas). */
    extras: []
  };
}

function operacaoLerParametros_(){
  const padrao = operacaoParametrosPadrao_();
  let salvo = {};
  try {
    salvo = JSON.parse(PropertiesService.getScriptProperties().getProperty(OPERACAO_CHAVE_PARAMETROS) || "{}") || {};
  } catch(e){ salvo = {}; }
  const p = Object.assign({}, padrao, salvo);
  ["percentual", "scorePadrao", "membros", "setoresRH"].forEach(function(k){
    p[k] = Object.assign({}, padrao[k], salvo[k] || {});
  });
  if(!Array.isArray(p.metasCarregamento)) p.metasCarregamento = padrao.metasCarregamento;
  if(!Array.isArray(p.extras)) p.extras = [];
  return p;
}

function operacaoObterParametros(){
  exigirAcessoCentral_();
  return operacaoLerParametros_();
}

function operacaoSalvarParametros(novos){
  exigirAcessoCentral_();
  const atual = operacaoLerParametros_();
  const n = novos || {};
  const num = function(v, min, max, padrao){
    const x = Number(String(v == null ? "" : v).replace(",", "."));
    if(!isFinite(x)) return padrao;
    return Math.min(max, Math.max(min, x));
  };
  const lista = function(v){
    return (Array.isArray(v) ? v : String(v || "").split(/\n|;/))
      .map(function(x){ return String(x || "").trim(); })
      .filter(Boolean).slice(0, 60);
  };
  const p = {
    percentual: {}, scorePadrao: {}, membros: {},
    setoresRH: atual.setoresRH,
    descontoPercentual: num(n.descontoPercentual, 0, 100, atual.descontoPercentual),
    tetoDescontoItem: num(n.tetoDescontoItem, 0, 1000000, atual.tetoDescontoItem),
    tetoSalario: num(n.tetoSalario, 0, 100, atual.tetoSalario),
    metasCarregamento: (Array.isArray(n.metasCarregamento) ? n.metasCarregamento : atual.metasCarregamento)
      .map(function(m){ return { nome: String(m && m.nome || "").trim().slice(0, 80), meta: num(m && m.meta, 0, 100000, 0) }; })
      .filter(function(m){ return m.nome; }).slice(0, 20),
    extras: (Array.isArray(n.extras) ? n.extras : atual.extras)
      .map(function(x){
        const equipe = String(x && x.equipe || "");
        return { nome: String(x && x.nome || "").trim().slice(0, 80), salario: num(x && x.salario, 0, 1000000, 0), equipe: OPERACAO_EQUIPES.some(function(e){ return e.chave === equipe; }) ? equipe : "" };
      })
      .filter(function(x){ return x.nome && x.equipe; }).slice(0, 60)
  };
  OPERACAO_EQUIPES.forEach(function(e){
    const k = e.chave;
    p.percentual[k] = num(n.percentual && n.percentual[k], 0, 100, atual.percentual[k]);
    p.scorePadrao[k] = num(n.scorePadrao && n.scorePadrao[k], 0, 100, atual.scorePadrao[k]);
    p.membros[k] = n.membros && k in n.membros ? lista(n.membros[k]) : atual.membros[k];
  });
  PropertiesService.getScriptProperties().setProperty(OPERACAO_CHAVE_PARAMETROS, JSON.stringify(p));
  return p;
}

/* ---------------------------------------------------------
   Ajudantes
--------------------------------------------------------- */
function operacaoTexto_(v){
  return String(v == null ? "" : v)
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim();
}

function operacaoNumero_(v){
  if(typeof v === "number") return isFinite(v) ? v : 0;
  let t = String(v == null ? "" : v).replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if(!t) return 0;
  if(t.indexOf(",") >= 0){ t = t.replace(/\./g, "").replace(",", "."); }
  const n = Number(t);
  return isFinite(n) ? n : 0;
}

function operacaoPedido_(v){
  if(v instanceof Date) return String(v.getFullYear());
  const t = String(v == null ? "" : v).trim().replace(/\.0+$/, "");
  return t;
}

function operacaoMesDe_(v){
  let d = v instanceof Date ? v : null;
  if(!d && v){
    const t = String(v).trim();
    let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if(m) d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
    m = !d && t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  }
  if(!d || isNaN(d.getTime())) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM");
}

function operacaoCentavos_(v){ return Math.round(Number(v || 0) * 100); }

/* "Maicon Martiins" × "Maicon Martins", "Fábio(Expedição)" × "Fabio Luiz",
   "João Pedro Maestrini" × "João Pedro": mesmo primeiro nome e começo do
   sobrenome parecido (ou um dos dois só com o primeiro nome). */
function operacaoTokens_(nome){
  return operacaoTexto_(String(nome || "").replace(/\(.*?\)/g, " "))
    .replace(/[^a-z ]/g, " ").split(" ").filter(Boolean);
}

function operacaoMesmoNome_(a, b){
  const ta = operacaoTokens_(a), tb = operacaoTokens_(b);
  if(!ta.length || !tb.length || ta[0] !== tb[0]) return false;
  if(ta.length === 1 || tb.length === 1) return true;
  return ta[1].slice(0, 3) === tb[1].slice(0, 3);
}

function operacaoEhFreelancer_(nome){
  const t = operacaoTexto_(nome);
  return /\bfree\b|freela/.test(t);
}

function operacaoEhEquipeGenerica_(nome){
  const t = operacaoTexto_(nome);
  return t === "equipe galpao" || t === "galpao" || t === "equipe" || t === "equipe interna";
}

/* ---------------------------------------------------------
   Leitura das planilhas
--------------------------------------------------------- */
function operacaoValores_(planilhaId, aba){
  const sh = SpreadsheetApp.openById(planilhaId).getSheetByName(aba);
  if(!sh) throw new Error('A aba "' + aba + '" não foi encontrada.');
  return sh.getDataRange().getValues();
}

function operacaoFuncionariosRH_(){
  return Acervo.funcionarios().filter(function(f){return f.ativo;}).map(function(f){
    return {id:f.id,nome:f.nome,setor:f.setor,cargo:f.cargo,salario:Number(f.salario_bruto || 0),equipe:f.equipe_operacional};
  });
}

function operacaoEventosMes_(mes){
  const linhas = operacaoValores_(OPERACAO_MATRIZ_ID, "Matriz");
  const eventos = [];
  for(let i = 1; i < linhas.length; i++){
    const l = linhas[i];
    if(operacaoMesDe_(l[1]) !== mes) continue;
    const scores = {};
    OPERACAO_EQUIPES.forEach(function(e){
      const s = operacaoNumero_(l[e.colunaScore]);
      scores[e.chave] = s > 0 ? s : null;
    });
    eventos.push({
      pedido: operacaoPedido_(l[2]),
      cliente: String(l[3] || "").trim(),
      data: l[1] instanceof Date ? Utilities.formatDate(l[1], Session.getScriptTimeZone(), "dd/MM/yyyy") : String(l[1] || ""),
      valorLocacao: operacaoNumero_(l[5]),
      scores: scores
    });
  }
  return eventos;
}

function operacaoCronogramaPorPedido_(){
  const linhas = operacaoValores_(OPERACAO_CRONOGRAMA_ID, "Cronograma");
  const mapa = {};
  for(let i = 1; i < linhas.length; i++){
    const l = linhas[i];
    const pedido = operacaoPedido_(l[1]);
    const etapa = operacaoTexto_(l[5]);
    if(!pedido || !etapa) continue;
    const nomes = [String(l[9] || "")].concat(String(l[10] || "").split("|"))
      .map(function(x){ return x.trim(); }).filter(Boolean);
    (mapa[pedido] = mapa[pedido] || []).push({ etapa: etapa, nomes: nomes });
  }
  return mapa;
}

function operacaoOcorrenciasMes_(mes){
  const linhas = operacaoValores_(OPERACAO_OCORRENCIAS_ID, "Ocorrências");
  const porQuantidade = ["material sem capa", "itens sem capa de protecao", "item sem revisao", "itens sem revisao"];
  const r = { internos: {}, externos: {}, carregamento: {} };
  for(let i = 1; i < linhas.length; i++){
    const l = linhas[i];
    if(operacaoMesDe_(l[1]) !== mes) continue;
    const dep = operacaoTexto_(l[3]);
    const tipo = operacaoTexto_(l[5]);
    if(!dep || !tipo) continue;
    const valor = porQuantidade.indexOf(tipo) >= 0 ? operacaoNumero_(l[10]) : 1;
    const grupo = dep.indexOf("carreg") >= 0 ? "carregamento" : dep.indexOf("intern") >= 0 ? "internos" : dep.indexOf("extern") >= 0 ? "externos" : "";
    if(!grupo) continue;
    r[grupo][tipo] = (r[grupo][tipo] || 0) + valor;
  }
  return r;
}

function operacaoIndicativos_(){
  const linhas = operacaoValores_(OPERACAO_OCORRENCIAS_ID, "Indicativos");
  const r = { internos: [], externos: [] };
  for(let i = 1; i < linhas.length; i++){
    const l = linhas[i];
    if(String(l[0] || "").trim()) r.internos.push({ nome: String(l[0]).trim(), meta: operacaoNumero_(l[1]) });
    if(String(l[2] || "").trim()) r.externos.push({ nome: String(l[2]).trim(), meta: operacaoNumero_(l[3]) });
  }
  return r;
}

/* Itens Danificados: B=Data, G=Qtd, H="Coluna 7" (1º setor do conserto),
   M=Onde aconteceu, N=Pedido, F=Item, S=Reposição, U=Reposição total. */
function operacaoDanosMes_(mes){
  const linhas = operacaoValores_(OPERACAO_DANOS_ID, "Itens Danificados");
  const ciencias = Acervo.ciencias();
  const danos = [];
  for(let i = 1; i < linhas.length; i++){
    const l = linhas[i];
    if(operacaoMesDe_(l[1]) !== mes) continue;
    const onde = operacaoTexto_(l[12]);
    const quantidade = operacaoNumero_(l[6]);
    if(quantidade <= 0) continue;
    if(operacaoTexto_(l[7]).indexOf("limpeza de estofados") >= 0) continue; // desgaste, não dano
    if(onde.indexOf("producao") >= 0) continue;                              // não é da operação
    const equipeDano = ["triagem", "carregamento", "montagem"].indexOf(onde) >= 0 ? onde : "";
    const local = equipeDano || (onde.indexOf("evento") >= 0 ? "evento" : onde.indexOf("interno") >= 0 ? "interno" : "");
    if(!local) continue;
    const unitario = operacaoNumero_(l[18]);
    const total = typeof l[20] === "number" && l[20] > 0 ? l[20] : unitario * quantidade;
    danos.push({
      id: String(l[0]), ciencia: cienciaDanoDaLinha_(l,ciencias),
      os: String(l[4] || ""), item: String(l[5] || "").trim(), quantidade: quantidade,
      setor: String(l[2] || "").trim(),
      fluxo: l.slice(7, 11).map(function(s){ return String(s || "").trim(); }).filter(Boolean).join(" → "),
      dano: String(l[12] || "").trim(), detalhes: String(l[14] || "").trim(),
      local: local, pedido: operacaoPedido_(l[13]), reposicaoTotal: total,
      data: l[1] instanceof Date ? Utilities.formatDate(l[1], Session.getScriptTimeZone(), "dd/MM/yyyy") : String(l[1] || "")
    });
  }
  return danos;
}

/* Avaliação individual do RH (mesma da Manutenção). Sem lista (exemplo) ou
   pessoa extra de teste: considera apta. */
function operacaoAvaliacaoRH_(lista, m){
  if(!Array.isArray(lista) || m.extra) return { ok: true };
  const item = lista.filter(function(r){ return operacaoMesmoNome_(r.nome, m.nome); })[0];
  if(!item) return { ok: false, motivo: "RH: avaliação não encontrada" };
  if(item.apto === true) return { ok: true, item: item };
  const motivos = identificarMotivosRHComissaoCentral_(item);
  return { ok: false, item: item, motivo: motivos.length ? "RH: " + motivos.join(", ") : "RH: meta individual não atingida" };
}

/* ---------------------------------------------------------
   Cálculo (puro: recebe os dados, não lê planilha)
--------------------------------------------------------- */
function operacaoCalcular_(d){
  const p = d.parametros;
  const avisos = [];
  const cronograma = d.cronograma || {};
  const equipes = {};

  /* Membros: lista dos parâmetros, ou pelos setores do RH; + extras. */
  OPERACAO_EQUIPES.forEach(function(e){
    const k = e.chave;
    let membros;
    if(!d.exemplo){
      membros = d.funcionarios.filter(function(f){return f.equipe===k;})
        .map(function(f){return {id:f.id,nome:f.nome,setor:f.setor,salario:f.salario,noRH:true};});
    } else if((p.membros[k] || []).length){
      membros = p.membros[k].map(function(nome){
        const rh = d.funcionarios.filter(function(f){ return operacaoMesmoNome_(f.nome, nome); })[0];
        return { nome: rh ? rh.nome : nome, setor: rh ? rh.setor : "", salario: rh ? rh.salario : 0, noRH: !!rh };
      });
    } else {
      const setores = (p.setoresRH[k] || []).map(operacaoTexto_);
      membros = d.funcionarios.filter(function(f){ return setores.indexOf(operacaoTexto_(f.setor)) >= 0; })
        .map(function(f){ return { nome: f.nome, setor: f.setor, salario: f.salario, noRH: true }; });
    }
    (d.exemplo ? (p.extras || []) : []).filter(function(x){ return x.equipe === k; }).forEach(function(x){
      membros.push({ nome: x.nome, setor: "Pessoa extra", salario: x.salario, noRH: false, extra: true });
    });
    equipes[k] = {
      chave: k, nome: e.nome, percentual: p.percentual[k], bolo: 0, eventos: [],
      membros: membros.map(function(m){ return Object.assign(m, { participacoes: 0 }); }),
      foraDoCadastro: {}, semEquipe: 0, danos: [], desconto: 0, indicadores: [], metaOk: true
    };
  });

  /* 1. Bolo + participação */
  (d.eventos || []).forEach(function(ev){
    const linhas = cronograma[ev.pedido] || [];
    OPERACAO_EQUIPES.forEach(function(e){
      const eq = equipes[e.chave];
      const usouPadrao = ev.scores[e.chave] == null;
      const score = usouPadrao ? p.scorePadrao[e.chave] : ev.scores[e.chave];
      const comissao = Math.round(ev.valorLocacao * (score / 100) * (eq.percentual / 100) * 100) / 100;
      eq.bolo += comissao;
      const minhas = linhas.filter(function(l){ return e.etapas.indexOf(l.etapa) >= 0; });
      const presentes = {};
      minhas.forEach(function(l){
        l.nomes.forEach(function(nome){
          if(operacaoEhEquipeGenerica_(nome)){
            eq.membros.forEach(function(m, i){ presentes[i] = true; });
            return;
          }
          const i = eq.membros.findIndex(function(m){ return operacaoMesmoNome_(m.nome, nome); });
          if(i >= 0){ presentes[i] = true; return; }
          if(!operacaoEhFreelancer_(nome)) eq.foraDoCadastro[nome] = (eq.foraDoCadastro[nome] || 0) + 1;
        });
      });
      const qtd = Object.keys(presentes).length;
      Object.keys(presentes).forEach(function(i){ eq.membros[i].participacoes++; });
      if(minhas.length && !qtd) eq.semEquipe++;
      eq.eventos.push({
        pedido: ev.pedido, cliente: ev.cliente, data: ev.data, valorLocacao: ev.valorLocacao,
        score: score, scorePadrao: usouPadrao, comissao: comissao,
        noCronograma: minhas.length > 0, pessoas: qtd
      });
    });
  });

  const controleMontagem = d.montagemRH;
  if(controleMontagem) {
    if(controleMontagem.uniformePendente) avisos.push('Montagem: '+controleMontagem.uniformePendente+' foto(s) aguardam avaliação de uniforme pelo RH.');
    if(controleMontagem.localPendente) avisos.push('Montagem: '+controleMontagem.localPendente+' envio(s) precisam de conferência de localização no cronograma.');
    if(controleMontagem.semRegistro) avisos.push('Montagem: '+controleMontagem.semRegistro+' etapa(s) sem foto da equipe no mês.');
  }
  const semValor = (d.eventos || []).filter(function(ev){ return !ev.valorLocacao; }).length;
  if(semValor) avisos.push(semValor + " evento(s) do mês sem valor de locação na Matriz — entram com R$ 0 no bolo.");

  /* 2. Portão da meta */
  const ocorr = d.ocorrencias || { internos: {}, externos: {}, carregamento: {} };
  const danosQtd = { internos: 0, externos: 0 };
  (d.danos || []).forEach(function(x){
    if(x.ciencia && x.ciencia.status!=='legado' && x.ciencia.status!=='confirmado') return;
    if(x.local === "interno" || x.local === "triagem") danosQtd.internos += x.quantidade;
    else if(x.local === "evento" || x.local === "montagem") danosQtd.externos += x.quantidade;
  });

  /* 3. Atribuição dos danos */
  const desc = p.descontoPercentual / 100;
  (d.danos || []).forEach(function(x){
    let alvo;
    if(["triagem", "carregamento", "montagem"].indexOf(x.local) >= 0){
      alvo = [x.local];
    } else if(x.local === "interno"){
      alvo = ["triagem"];
    } else {
      const linhas = cronograma[x.pedido] || [];
      alvo = ["carregamento", "montagem"].filter(function(k){
        const e = OPERACAO_EQUIPES.filter(function(q){ return q.chave === k; })[0];
        return linhas.some(function(l){ return e.etapas.indexOf(l.etapa) >= 0; });
      });
      if(!alvo.length) alvo = ["montagem"];
    }
    let valor = x.reposicaoTotal * desc;
    if(p.tetoDescontoItem > 0) valor = Math.min(valor, p.tetoDescontoItem * x.quantidade);
    const parte = Math.round(valor / alvo.length * 100) / 100;
    const confirmado = !x.ciencia || x.ciencia.status==='legado' || x.ciencia.status==='confirmado';
    alvo.forEach(function(k){
      equipes[k].danos.push(Object.assign({}, x, { desconto: confirmado ? parte : 0, descontoPrevisto: parte, dividido: alvo.length > 1 }));
      if(confirmado) equipes[k].desconto += parte;
    });
  });

  OPERACAO_EQUIPES.forEach(function(e){
    const eq = equipes[e.chave];
    let lista;
    if(e.indicativos === "carregamento"){
      lista = (p.metasCarregamento || []).map(function(m){ return { nome: m.nome, meta: m.meta }; });
    } else {
      lista = (d.indicativos[e.indicativos] || []).map(function(m){ return { nome: m.nome, meta: m.meta }; });
    }
    if(e.chave === 'montagem') lista = lista.map(function(m){
      const nome = operacaoTexto_(m.nome);
      return {nome:nome === 'itens danificados' || nome === 'item danificado' ? 'Sem uniforme' : nome === 'descuido com material' || nome === 'decuido com material' ? 'Atraso' : m.nome,meta:m.meta};
    });
    lista.forEach(function(m){
      const chave = operacaoTexto_(m.nome);
      let valor = ocorr[e.indicativos] ? (ocorr[e.indicativos][chave] || 0) : 0;
      if(chave === "itens danificados" || chave === "item danificado"){
        if(e.chave === "triagem") valor = danosQtd.internos;
        else if(e.chave === "montagem") valor = danosQtd.externos;
        else valor = eq.danos.reduce(function(s, x){ return s + ((!x.ciencia || x.ciencia.status==='legado' || x.ciencia.status==='confirmado') ? x.quantidade : 0); }, 0);
      }
      if(e.chave === 'montagem' && (chave === 'sem uniforme' || chave === 'atraso')) {
        const controle = d.montagemRH || {};
        valor = Number(chave === 'sem uniforme' ? controle.semUniforme : controle.atraso) || 0;
        m.pendentes = (Number(chave === 'sem uniforme' ? controle.uniformePendente : controle.horarioPendente) || 0) + (Number(controle.semRegistro) || 0);
      }
      m.valor = valor;
      m.ok = valor <= m.meta && !m.pendentes;
      if(!m.ok) eq.metaOk = false;
    });
    eq.indicadores = lista;

    /* Teto de gastos (aba "Metas e Gastos" do Almoxarifado) pelo setor dos membros,
       igual à Manutenção: abaixo de 100% passa. Setor sem teto cadastrado não conta. */
    const setoresEquipe = {};
    eq.membros.forEach(function(m){ if(m.setor && !m.extra) setoresEquipe[operacaoTexto_(m.setor)] = true; });
    eq.gastos = (d.gastos || []).filter(function(g){ return setoresEquipe[operacaoTexto_(g.setor)]; })
      .map(function(g){ const pctGasto = Math.round(Number(g.percentual || 0) * 10) / 10; return { setor: String(g.setor || ""), percentual: pctGasto, ok: pctGasto < 100 }; });
    eq.gastoOk = eq.gastos.every(function(g){ return g.ok; });
    if(!eq.gastoOk) eq.metaOk = false;

    /* 4. Sobra e divisão — mesma regra do Departamento de Manutenção:
       partes iguais entre TODOS da equipe; quem não está apto (meta da equipe
       ou avaliação individual do RH) recebe zero, e a parte dele não é
       redistribuída; cada um recebe no máximo o teto do salário. */
    eq.bolo = Math.round(eq.bolo * 100) / 100;
    eq.desconto = Math.round(eq.desconto * 100) / 100;
    eq.sobra = Math.max(0, Math.round((eq.bolo - eq.desconto) * 100) / 100);
    const sobraC = operacaoCentavos_(eq.sobra);
    const n = eq.membros.length;
    const base = n ? Math.floor(sobraC / n) : 0;
    const restantes = n ? sobraC % n : 0;
    let distribuido = 0;
    eq.aptos = 0;
    eq.membros.forEach(function(m, i){
      m.calculado = (base + (i < restantes ? 1 : 0)) / 100;
      m.teto = m.salario > 0 ? Math.round(m.salario * p.tetoSalario) / 100 : 0;
      const rh = operacaoAvaliacaoRH_(d.rh, m);
      m.rh = rh.item ? {
        atraso: rh.item.atraso, semUniforme: rh.item.semUniforme, semEpi: rh.item.semEpi, usoCelular: rh.item.usoCelular,
        falta: rh.item.falta, advertencia: rh.item.advertencia, ausenciaJornada: rh.item.ausenciaJornada,
        metaAtraso: rh.item.metaAtraso, metaSemUniforme: rh.item.metaSemUniforme, metaSemEpi: rh.item.metaSemEpi,
        metaUsoCelular: rh.item.metaUsoCelular, metaFalta: rh.item.metaFalta, metaAdvertencia: rh.item.metaAdvertencia,
        metaAusenciaJornada: rh.item.metaAusenciaJornada, status: rh.item.status
      } : null;
      m.motivo = "";
      if(!eq.metaOk){
        const fora = eq.indicadores.filter(function(x){ return !x.ok; }).map(function(x){ return x.nome; });
        if(!eq.gastoOk) fora.push("Teto de gastos");
        m.motivo = "Equipe: " + (fora.length ? fora.join(", ") : "meta não atingida");
      } else if(!rh.ok){
        m.motivo = rh.motivo;
      } else if(!(m.salario > 0)){
        m.motivo = "Salário não informado";
      }
      m.apto = !m.motivo;
      m.recebe = m.apto ? Math.min(m.calculado, m.teto) : 0;
      m.limitadoPeloTeto = m.apto && m.calculado > m.teto;
      m.excedente = m.limitadoPeloTeto ? Math.round((m.calculado - m.teto) * 100) / 100 : 0;
      if(m.apto) eq.aptos++;
      distribuido += m.recebe;
    });
    eq.totalPago = Math.round(distribuido * 100) / 100;
    eq.naoPago = Math.round((eq.sobra - eq.totalPago) * 100) / 100;
    eq.foraDoCadastro = Object.keys(eq.foraDoCadastro).sort();
    if(!eq.membros.length) avisos.push(eq.nome + ": nenhum membro na equipe (ajuste em Parâmetros).");
  });

  return {
    mes: d.mes,
    exemplo: !!d.exemplo,
    parametros: p,
    totalEventos: (d.eventos || []).length,
    equipes: OPERACAO_EQUIPES.map(function(e){ return equipes[e.chave]; }),
    avisos: avisos
  };
}

/* ---------------------------------------------------------
   Chamadas da tela
--------------------------------------------------------- */
function operacaoCalcularMes(mes){
  exigirAcessoCentral_();
  if(!/^\d{4}-\d{2}$/.test(String(mes || ""))){
    mes = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
  }
  const funcionarios = operacaoFuncionariosRH_();
  /* A avaliação do RH da Manutenção só olha os setores dela; aqui passa todos os
     setores do cadastro, e cada pessoa da equipe é achada pelo nome. */
  const setoresRH = funcionarios.map(function(f){ return f.setor; }).filter(Boolean);
  return operacaoCalcular_({
    mes: mes,
    parametros: operacaoLerParametros_(),
    funcionarios: funcionarios,
    gastos: getTetoGastosMensal(mes),
    eventos: operacaoEventosMes_(mes),
    cronograma: operacaoCronogramaPorPedido_(),
    ocorrencias: operacaoOcorrenciasMes_(mes),
    indicativos: operacaoIndicativos_(),
    danos: operacaoDanosMes_(mes),
    montagemRH: operacaoMontagemIndicadores_(mes),
    rh: getAvaliacaoIndividualRH(mes, setoresRH)
  });
}

/* O mesmo cálculo com o mês de exemplo da simulação (valores inventados). */
function operacaoCalcularExemplo(){
  exigirAcessoCentral_();
  const p = operacaoLerParametros_();
  p.membros = {
    triagem: ["Pessoa A", "Pessoa B", "Pessoa C"],
    carregamento: ["Pessoa D", "Pessoa E"],
    montagem: ["Pessoa F", "Pessoa G", "Pessoa H", "Pessoa I"]
  };
  p.extras = [];
  const pessoas = ["Pessoa A", "Pessoa B", "Pessoa C", "Pessoa D", "Pessoa E", "Pessoa F", "Pessoa G", "Pessoa H", "Pessoa I"]
    .map(function(nome){ return { nome: nome, setor: "", cargo: "", salario: 2500 }; });
  const presencas = { triagem: [40, 30, 10], carregamento: [35, 25], montagem: [40, 40, 30, 20] };
  const eventos = [], cronograma = {};
  for(let i = 1; i <= 40; i++){
    const pedido = "EX" + i;
    eventos.push({ pedido: pedido, cliente: "Evento de exemplo " + i, data: "", valorLocacao: 15000, scores: { triagem: 45, carregamento: 45, montagem: 45 } });
    cronograma[pedido] = [];
    OPERACAO_EQUIPES.forEach(function(e){
      const nomes = p.membros[e.chave].filter(function(n, j){ return i <= presencas[e.chave][j]; });
      cronograma[pedido].push({ etapa: e.etapas[0], nomes: nomes });
    });
  }
  const indicativos = {
    internos: [{ nome: "Itens danificados", meta: 10 }, { nome: "Prazo", meta: 6 }],
    externos: [{ nome: "Itens danificados", meta: 10 }, { nome: "Feedback negativo do decorador", meta: 7 }]
  };
  p.metasCarregamento = [{ nome: "Itens danificados", meta: 10 }, { nome: "Itens esquecidos", meta: 3 }];
  const danos = [
    { item: "Cadeira", quantidade: 2, local: "interno", pedido: "", reposicaoTotal: 500, data: "" },
    { item: "Espelho", quantidade: 1, local: "interno", pedido: "", reposicaoTotal: 1200, data: "" },
    { item: "Aparador", quantidade: 1, local: "interno", pedido: "", reposicaoTotal: 2000, data: "" },
    { item: "Sofá", quantidade: 1, local: "evento", pedido: "EX-CARREGAMENTO", reposicaoTotal: 6000, data: "" },
    { item: "Banqueta", quantidade: 5, local: "evento", pedido: "EX-MONTAGEM", reposicaoTotal: 2000, data: "" },
    { item: "Mesa", quantidade: 1, local: "evento", pedido: "EX-MONTAGEM", reposicaoTotal: 3000, data: "" }
  ];
  cronograma["EX-CARREGAMENTO"] = [{ etapa: "carregamento", nomes: [] }];
  cronograma["EX-MONTAGEM"] = [{ etapa: "montagem", nomes: [] }];
  return operacaoCalcular_({
    mes: "exemplo", exemplo: true, parametros: p, funcionarios: pessoas, eventos: eventos,
    cronograma: cronograma, ocorrencias: { internos: {}, externos: { "feedback negativo do decorador": 2 }, carregamento: {} },
    indicativos: indicativos, danos: danos
  });
}
