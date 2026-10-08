/****************************************************
 *  MURAL DO PORTAL — página de destaques
 *
 *  Automático:
 *  - Premiações: aba "Premiacoes" da Central de Metas
 *    (nome, prêmio, mês e foto). NUNCA o valor.
 *  - Números do mês: aba "Cronograma".
 *
 *  Cadastrado pela RH (?page=mural):
 *  - Avisos, colaboradores (aniversário e boas-vindas),
 *    reconhecimentos extras e galeria de eventos.
 ****************************************************/

const MURAL_PLANILHA_CRONOGRAMA = '14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ';
const MURAL_PLANILHA_CENTRAL = '1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE';
const MURAL_PROP_PASTA = 'MURAL_PASTA_FOTOS_ID';
const MURAL_PREFIXO_ADMIN = 'MURAL_ADMIN_';
const MURAL_CACHE_PUBLICO = 'MURAL_PUBLICO_V3';

const MURAL_ABAS = {
  avisos: { nome: 'Mural_Avisos', cab: ['ID', 'Título', 'Texto', 'Prioridade', 'Fixado', 'Válido até', 'Publicado por', 'Publicado em'] },
  colaboradores: { nome: 'Mural_Colaboradores', cab: ['ID', 'Nome', 'Setor', 'Aniversário (dd/mm)', 'Admissão', 'Foto (ID)', 'Ativo', 'Atualizado em'] },
  reconhecimentos: { nome: 'Mural_Reconhecimentos', cab: ['ID', 'Nome', 'Título', 'Texto', 'Data', 'Foto (ID)', 'Publicado por', 'Publicado em'] },
  galeria: { nome: 'Mural_Galeria', cab: ['ID', 'Legenda', 'Data', 'Foto (ID)', 'Publicado por', 'Publicado em'] }
};


/****************************************************
 *  APOIO
 ****************************************************/
function MURAL_aba_(tipo) {
  const def = MURAL_ABAS[tipo];
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
function MURAL_dadosPublicos_() {

  const cache = CacheService.getScriptCache();
  const guardado = cache.get(MURAL_CACHE_PUBLICO);
  if (guardado) { return JSON.parse(guardado); }

  const hoje = MURAL_hojeISO_();
  const mesAtual = hoje.slice(5, 7);
  const diaAtual = hoje.slice(8, 10);

  const avisos = MURAL_ler_('avisos')
    .map(function (x) {
      return { id: x.v[0], titulo: x.v[1], texto: x.v[2], prioridade: x.v[3] || 'INFO', fixado: x.v[4] === 'SIM', validoAte: x.v[5], publicadoEm: x.v[7] };
    })
    .filter(function (a) { return !a.validoAte || a.validoAte >= hoje; })
    .sort(function (a, b) {
      if (a.fixado !== b.fixado) { return a.fixado ? -1 : 1; }
      if (a.prioridade !== b.prioridade) { return a.prioridade === 'IMPORTANTE' ? -1 : 1; }
      return String(b.publicadoEm).localeCompare(String(a.publicadoEm));
    });

  const colaboradores = MURAL_ler_('colaboradores')
    .map(function (x) {
      return { nome: x.v[1], setor: x.v[2], aniversario: x.v[3], admissao: MURAL_dataISO_(x.v[4]), foto: MURAL_foto_(x.v[5], 400), ativo: x.v[6] !== 'NAO' };
    })
    .filter(function (c) { return c.ativo; });

  const aniversariantes = colaboradores
    .filter(function (c) { return String(c.aniversario).slice(3, 5) === mesAtual; })
    .map(function (c) {
      return { nome: c.nome, setor: c.setor, foto: c.foto, dia: String(c.aniversario).slice(0, 2), hoje: String(c.aniversario).slice(0, 2) === diaAtual };
    })
    .sort(function (a, b) { return a.dia.localeCompare(b.dia); });

  const limiteNovos = new Date();
  limiteNovos.setDate(limiteNovos.getDate() - 60);
  const limiteNovosISO = Utilities.formatDate(limiteNovos, 'America/Sao_Paulo', 'yyyy-MM-dd');

  const novos = colaboradores
    .filter(function (c) { return c.admissao && c.admissao >= limiteNovosISO && c.admissao <= hoje; })
    .map(function (c) { return { nome: c.nome, setor: c.setor, foto: c.foto, admissao: c.admissao }; });

  const reconhecimentos = MURAL_ler_('reconhecimentos')
    .map(function (x) { return { nome: x.v[1], titulo: x.v[2], texto: x.v[3], data: MURAL_dataISO_(x.v[4]), foto: MURAL_foto_(x.v[5], 900), origem: 'RH' }; })
    .concat(MURAL_premiacoesCentral_())
    .sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); })
    .slice(0, 18);

  const galeria = MURAL_ler_('galeria')
    .map(function (x) { return { legenda: x.v[1], data: MURAL_dataISO_(x.v[2]), foto: MURAL_foto_(x.v[3], 1200) }; })
    .sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); })
    .slice(0, 12);

  const dados = {
    hoje: hoje,
    avisos: avisos,
    aniversariantes: aniversariantes,
    novos: novos,
    reconhecimentos: reconhecimentos,
    galeria: galeria,
    numeros: MURAL_numerosMes_()
  };

  try { cache.put(MURAL_CACHE_PUBLICO, JSON.stringify(dados), 600); } catch (e) {}
  return dados;
}


/****************************************************
 *  ADMINISTRAÇÃO (RH)
 ****************************************************/
function MURAL_login(senha) {

  /* Senha da RH removida (out/2026): quem protege é o login do Acervo (api/gs.js).
     O parâmetro agora traz o nome de quem está logado, mostrado em "Publicando como". */
  {
    const usuario = MURAL_texto_(senha, 100) || 'RH';
    const token = Utilities.getUuid().replace(/-/g, '');
    CacheService.getScriptCache().put(MURAL_PREFIXO_ADMIN + token, usuario, 6 * 60 * 60);
    return { token: token, usuario: usuario };
  }

  const s = MURAL_texto_(senha, 100);
  if (!s) { throw new Error('Digite a senha.'); }

  const linhas = SpreadsheetApp.openById(PORTAL_SHEET_ID).getSheetByName(ABA_SENHAS).getDataRange().getValues();

  for (let i = 1; i < linhas.length; i++) {
    const setor = String(linhas[i][0] || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const ehRh = /(^|\s)rh(\s|$)/.test(setor) || setor.indexOf('recursos humanos') >= 0;
    if (ehRh && String(linhas[i][1] || '').trim() === s) {
      const usuario = String(linhas[i][2] || linhas[i][0] || 'RH').trim();
      const token = Utilities.getUuid().replace(/-/g, '');
      CacheService.getScriptCache().put(MURAL_PREFIXO_ADMIN + token, usuario, 6 * 60 * 60);
      return { token: token, usuario: usuario };
    }
  }

  throw new Error('Senha incorreta.');
}

function MURAL_admin_(token) {
  const usuario = CacheService.getScriptCache().get(MURAL_PREFIXO_ADMIN + String(token || ''));
  if (!usuario) { throw new Error('LOGIN: entre de novo.'); }
  return usuario;
}

function MURAL_pasta_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(MURAL_PROP_PASTA);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  const pasta = DriveApp.createFolder('Portal Interno — Fotos do mural');
  props.setProperty(MURAL_PROP_PASTA, pasta.getId());
  return pasta;
}

function MURAL_salvarFoto_(dataUrl, nome) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) { throw new Error('Foto inválida.'); }
  const arquivo = MURAL_pasta_().createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], nome));
  try { arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return arquivo.getId();
}

/* Tudo que a RH já cadastrou (inclusive avisos vencidos) */
function MURAL_listarAdmin(token) {
  MURAL_admin_(token);
  const r = {};
  Object.keys(MURAL_ABAS).forEach(function (tipo) {
    r[tipo] = MURAL_ler_(tipo).map(function (x) {
      const o = { id: x.v[0] };
      MURAL_ABAS[tipo].cab.forEach(function (c, i) { o['c' + i] = x.v[i]; });
      return o;
    }).reverse();
  });
  r.premiacoesCentral = MURAL_premiacoesCentral_().length;
  return r;
}

function MURAL_salvar(token, tipo, dados) {

  const usuario = MURAL_admin_(token);
  if (!MURAL_ABAS[tipo]) { throw new Error('Tipo inválido.'); }
  dados = dados || {};

  const aba = MURAL_aba_(tipo);
  const existentes = MURAL_ler_(tipo);
  const atual = dados.id ? existentes.filter(function (x) { return x.v[0] === dados.id; })[0] : null;
  const id = atual ? atual.v[0] : (tipo.slice(0, 3).toUpperCase() + '_' + Utilities.getUuid().slice(0, 8));
  const fotoId = dados.foto ? MURAL_salvarFoto_(dados.foto, tipo + '_' + id + '.jpg') : (atual ? '' : '');
  const agora = MURAL_agora_();
  let linha;

  if (tipo === 'avisos') {
    if (!MURAL_texto_(dados.titulo)) { throw new Error('Informe o título do aviso.'); }
    linha = [id, MURAL_texto_(dados.titulo, 120), MURAL_texto_(dados.texto, 1200), dados.prioridade === 'IMPORTANTE' ? 'IMPORTANTE' : 'INFO',
      dados.fixado ? 'SIM' : '', MURAL_dataISO_(dados.validoAte), usuario, agora];
  } else if (tipo === 'colaboradores') {
    if (!MURAL_texto_(dados.nome)) { throw new Error('Informe o nome.'); }
    const aniv = String(dados.aniversario || '').match(/^(\d{1,2})\/(\d{1,2})$/);
    if (dados.aniversario && !aniv) { throw new Error('Aniversário no formato dia/mês, ex.: 07/10.'); }
    linha = [id, MURAL_texto_(dados.nome, 120), MURAL_texto_(dados.setor, 80),
      // Apóstrofo: a planilha guarda "07/10" como texto, sem virar data
      aniv ? "'" + ('0' + aniv[1]).slice(-2) + '/' + ('0' + aniv[2]).slice(-2) : '',
      MURAL_dataISO_(dados.admissao), fotoId || (atual ? atual.v[5] : ''), dados.ativo === false ? 'NAO' : 'SIM', agora];
  } else if (tipo === 'reconhecimentos') {
    if (!MURAL_texto_(dados.nome) || !MURAL_texto_(dados.titulo)) { throw new Error('Informe o nome e o reconhecimento.'); }
    linha = [id, MURAL_texto_(dados.nome, 120), MURAL_texto_(dados.titulo, 160), MURAL_texto_(dados.texto, 600),
      MURAL_dataISO_(dados.data) || MURAL_hojeISO_(), fotoId || (atual ? atual.v[5] : ''), usuario, agora];
  } else {
    if (!fotoId && !atual) { throw new Error('Escolha a foto.'); }
    linha = [id, MURAL_texto_(dados.legenda, 200), MURAL_dataISO_(dados.data) || MURAL_hojeISO_(),
      fotoId || atual.v[3], usuario, agora];
  }

  if (atual) {
    aba.getRange(atual.linha, 1, 1, linha.length).setValues([linha]);
  } else {
    aba.appendRow(linha);
  }

  CacheService.getScriptCache().remove(MURAL_CACHE_PUBLICO);
  return MURAL_listarAdmin(token);
}

function MURAL_excluir(token, tipo, id) {
  MURAL_admin_(token);
  if (!MURAL_ABAS[tipo]) { throw new Error('Tipo inválido.'); }
  const atual = MURAL_ler_(tipo).filter(function (x) { return x.v[0] === id; })[0];
  if (atual) { MURAL_aba_(tipo).deleteRow(atual.linha); }
  CacheService.getScriptCache().remove(MURAL_CACHE_PUBLICO);
  return MURAL_listarAdmin(token);
}

/* Prévia do mural para a RH (o mesmo que os funcionários veem) */
function MURAL_previa(token) {
  MURAL_admin_(token);
  CacheService.getScriptCache().remove(MURAL_CACHE_PUBLICO);
  return MURAL_dadosPublicos_();
}
