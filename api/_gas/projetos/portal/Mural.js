/****************************************************
 *  MURAL DO PORTAL — página de destaques
 *
 *  Automático:
 *  - Premiações: aba "Premiacoes" da Central de Metas
 *    (nome, prêmio, mês e foto). NUNCA o valor.
 *  - Números do mês: aba "Cronograma".
 *
 *  Funcionários e aniversários: cadastro único do RH.
 *  Avisos: publicados diretamente pela Home.
 ****************************************************/

const MURAL_PLANILHA_CRONOGRAMA = '14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ';
const MURAL_PLANILHA_CENTRAL = '1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE';
const MURAL_CACHE_PUBLICO = 'HOME_RH_METAS_V4';

const MURAL_ABAS = {
  avisos: { nome: 'Mural_Avisos', cab: ['ID', 'Título', 'Texto', 'Prioridade', 'Fixado', 'Válido até', 'Publicado por', 'Publicado em', 'Cor'] }
};


/****************************************************
 *  APOIO
 ****************************************************/
function MURAL_aba_(tipo) {
  const def = MURAL_ABAS[tipo];
  if(!def)throw new Error("Este cadastro foi retirado do Mural. Use o RH ou a Central de Metas.");
  const ss = SpreadsheetApp.openById(PORTAL_SHEET_ID);
  let aba = ss.getSheetByName(def.nome);
  if (!aba) {
    aba = ss.insertSheet(def.nome);
    aba.getRange(1, 1, 1, def.cab.length).setValues([def.cab]).setFontWeight('bold').setBackground('#2b2a26').setFontColor('#ffffff');
    aba.setFrozenRows(1);
    aba.getRange(1, 1, aba.getMaxRows(), def.cab.length).setNumberFormat('@');
  }
  return aba;
}

function MURAL_ler_(tipo) {
  const aba = MURAL_aba_(tipo);
  const n = MURAL_ABAS[tipo].cab.length;
  if (aba.getLastRow() < 2) { return []; }
  return aba.getRange(2, 1, aba.getLastRow() - 1, n).getDisplayValues()
    .map(function (l, i) { return { linha: i + 2, v: l }; })
    .filter(function (x) { return x.v[0]; });
}

function MURAL_foto_(id, largura) {
  return id ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + (largura || 800) : '';
}

function MURAL_hojeISO_() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
}

function MURAL_agora_() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
}

function MURAL_texto_(v, limite) {
  return String(v == null ? '' : v).trim().slice(0, limite || 500);
}

function MURAL_dataISO_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd');
  }
  const t = String(v || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) { return m[1] + '-' + m[2] + '-' + m[3]; }
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) { return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
  m = t.match(/^(\d{4})-(\d{2})$/);
  if (m) { return m[1] + '-' + m[2] + '-01'; }
  return '';
}


/****************************************************
 *  AUTOMÁTICO: PREMIAÇÕES DA CENTRAL DE METAS
 *  Lê só nome, descrição, mês e foto. Sem valor.
 ****************************************************/
function MURAL_premiacoesCentral_() {

  try {
    const aba = SpreadsheetApp.openById(MURAL_PLANILHA_CENTRAL).getSheetByName('Premiacoes');
    if (!aba || aba.getLastRow() < 2) { return []; }

    const valores = aba.getDataRange().getValues();
    const cab = valores[0].map(function (c) { return String(c).trim().toUpperCase(); });
    const col = function (nome) { return cab.indexOf(nome); };

    const cNome = col('NOME');
    const cDesc = col('DESCRIÇÃO');
    const cMes = col('MÊS');
    const cFoto = col('FOTO (ID NO DRIVE)');
    const cEntrega = col('FOTO DA ENTREGA (ID NO DRIVE)');
    const cData = col('DATA DA COMPRA');

    const limite = new Date();
    limite.setMonth(limite.getMonth() - 12);
    const limiteISO = Utilities.formatDate(limite, 'America/Sao_Paulo', 'yyyy-MM-dd');

    return valores.slice(1)
      .map(function (l) {
        const fotoId = String((cEntrega >= 0 && l[cEntrega]) || (cFoto >= 0 && l[cFoto]) || '').trim();
        const data = MURAL_dataISO_(cData >= 0 && l[cData]) || MURAL_dataISO_(cMes >= 0 && l[cMes]);
        return {
          nome: String(cNome >= 0 ? l[cNome] : '').trim(),
          titulo: String(cDesc >= 0 ? l[cDesc] : '').trim(),
          texto: '',
          data: data,
          foto: MURAL_foto_(fotoId, 900),
          origem: 'Central de Metas'
        };
      })
      .filter(function (p) { return p.nome && p.foto && (!p.data || p.data >= limiteISO); })
      // Vários itens da mesma pessoa no mesmo mês (ou com a mesma foto) viram um cartão só
      .reduce(function (lista, p) {
        const chave = function (x) { return x.nome.toUpperCase() + '|' + String(x.data).slice(0, 7); };
        const igual = lista.filter(function (x) { return x.foto === p.foto || chave(x) === chave(p); })[0];
        if (igual) {
          if (p.titulo && igual.titulo.split(' · ').indexOf(p.titulo) < 0) {
            igual.titulo = igual.titulo ? igual.titulo + ' · ' + p.titulo : p.titulo;
          }
          if (p.data > igual.data) { igual.data = p.data; }
        } else {
          lista.push(p);
        }
        return lista;
      }, []);

  } catch (e) {
    console.error('Premiações da Central:', e);
    return [];
  }
}


/****************************************************
 *  AUTOMÁTICO: NÚMEROS DO MÊS (cronograma)
 ****************************************************/
function MURAL_numerosMes_() {

  try {
    const aba = SpreadsheetApp.openById(MURAL_PLANILHA_CRONOGRAMA).getSheetByName('Cronograma');
    const dados = aba.getRange(2, 1, Math.max(1, aba.getLastRow() - 1), 8).getDisplayValues();
    const mes = MURAL_hojeISO_().slice(0, 7);

    const eventos = {};
    let montagens = 0;
    let desmontagens = 0;

    dados.forEach(function (l) {
      const data = MURAL_dataISO_(l[6]);
      if (!data || data.slice(0, 7) !== mes) { return; }
      const etapa = String(l[5]).trim().toLowerCase();
      if (etapa === 'montagem') { montagens++; eventos[l[1]] = true; }
      if (etapa === 'desmontagem') { desmontagens++; }
    });

    return {
      mes: mes,
      eventos: Object.keys(eventos).length,
      montagens: montagens,
      desmontagens: desmontagens
    };
  } catch (e) {
    console.error('Números do mês:', e);
    return null;
  }
}


/****************************************************
 *  DADOS DO MURAL (o que a página mostra)
 ****************************************************/
function MURAL_dadosPublicos_(atualizar, colaboradoresRH) {

  const cache = CacheService.getScriptCache();
  const guardado = cache.get(MURAL_CACHE_PUBLICO);
  if (guardado && !atualizar && !colaboradoresRH) { return JSON.parse(guardado); }

  const hoje = MURAL_hojeISO_();
  const mesAtual = hoje.slice(5, 7);
  const diaAtual = hoje.slice(8, 10);

  const avisos = MURAL_ler_('avisos')
    .map(function (x) {
      return { id: x.v[0], titulo: x.v[1], texto: x.v[2], prioridade: x.v[3] || 'INFO', fixado: x.v[4] === 'SIM', validoAte: x.v[5], publicadoEm: x.v[7], cor: x.v[8] || 'neutro' };
    })
    .filter(function (a) { return !a.validoAte || a.validoAte >= hoje; })
    .sort(function (a, b) {
      if (a.fixado !== b.fixado) { return a.fixado ? -1 : 1; }
      if (a.prioridade !== b.prioridade) { return a.prioridade === 'IMPORTANTE' ? -1 : 1; }
      return String(b.publicadoEm).localeCompare(String(a.publicadoEm));
    });

  const colaboradores = (colaboradoresRH || []).filter(function(c){return c.ativo;});

  const aniversariantes = colaboradores
    .filter(function (c) { return String(c.aniversario).slice(3, 5) === mesAtual; })
    .map(function (c) {
      return { id:c.id, mensagens:MURAL_parabensLer_(c.id), nome: c.nome, setor: c.setor, foto: c.foto, dia: String(c.aniversario).slice(0, 2), hoje: String(c.aniversario).slice(0, 2) === diaAtual };
    })
    .sort(function (a, b) { return a.dia.localeCompare(b.dia); });

  const limiteNovos = new Date();
  limiteNovos.setDate(limiteNovos.getDate() - 60);
  const limiteNovosISO = Utilities.formatDate(limiteNovos, 'America/Sao_Paulo', 'yyyy-MM-dd');

  const novos = colaboradores
    .filter(function (c) { return c.admissao && c.admissao >= limiteNovosISO && c.admissao <= hoje; })
    .map(function (c) { return { nome: c.nome, setor: c.setor, foto: c.foto, admissao: c.admissao }; });

  const reconhecimentos = MURAL_premiacoesCentral_().sort(function(a,b){return String(b.data).localeCompare(String(a.data));}).slice(0,24);

  const dados = {
    hoje: hoje,
    avisos: avisos,
    aniversariantes: aniversariantes,
    parabensTodos: aniversariantes.length ? MURAL_parabensTodos_() : [],
    novos: novos,
    reconhecimentos: reconhecimentos,
    numeros: MURAL_numerosMes_()
  };

  try { cache.put(MURAL_CACHE_PUBLICO, JSON.stringify(dados), 600); } catch (e) {}
  return dados;
}


/****************************************************
 *  ADMINISTRAÇÃO (RH)
 ****************************************************/
// Compatibilidade com links e clientes antigos: edição fica exclusivamente na Home.
function MURAL_login(){throw new Error('A administração do Mural foi removida. Publique avisos na Home.');}
function MURAL_listarAdmin(){return MURAL_login();}
function MURAL_salvar(){return MURAL_login();}
function MURAL_excluir(){return MURAL_login();}
function MURAL_previa(){return MURAL_login();}
