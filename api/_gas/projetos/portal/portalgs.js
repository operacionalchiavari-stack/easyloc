/****************************************************
 *  PORTAL INTERNO — servidor
 *
 *  Segurança (fase 1):
 *  - O login do Firebase é conferido AQUI no servidor
 *    (não só no navegador) antes de entregar qualquer dado.
 *  - Os links dos sistemas ficam só neste arquivo; a página
 *    nunca recebe a lista. Cada módulo é pedido na hora e
 *    sai com um "ingresso" temporário assinado (?pt=...),
 *    que os sistemas vão passar a exigir (fase 2).
 ****************************************************/

const PORTAL_SHEET_ID = '133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk';
const ABA_SENHAS = 'Senhas';

const PORTAL_FIREBASE_API_KEY = 'AIzaSyA-GgfOYJ0yyDgmXJ6_CoacAjk3Mc3wlIY';
const PORTAL_PREFIXO_SESSAO = 'PORTAL_SESSAO_';
const PORTAL_DURACAO_SESSAO = 6 * 60 * 60;   // 6 horas
const PORTAL_VALIDADE_INGRESSO_MIN = 10;       // ingresso para abrir um sistema
const PORTAL_PROP_SEGREDO = 'PORTAL_SEGREDO_INGRESSO';


/****************************************************
 *  MENU E LINKS (só no servidor)
 *  comSenha: pede a senha da aba "Acessos" antes de abrir
 ****************************************************/
const PORTAL_MENU = [
  { titulo: 'Cronograma', icone: 'calendar', itens: [
    { chave: 'cronograma', rotulo: 'Cronograma' }
  ]},
  { titulo: 'Comercial', icone: 'handshake', itens: [
    { chave: 'Feedback', rotulo: 'Feedback' }
  ]},
  { titulo: 'Logística', icone: 'truck', itens: [
    { chave: 'lancamentoUber', rotulo: 'Lançamento de Corridas', comSenha: true },
    { chave: 'controleLogistica', rotulo: 'Controle Uber', comSenha: true },
    { chave: 'lancamentoFrete', rotulo: 'Lançamento de Fretes', comSenha: true },
    { chave: 'paineloperações', rotulo: 'Painel Operações' }
  ]},
  { titulo: 'Triagem', icone: 'package', itens: [
    { chave: 'itensDanificados', rotulo: 'Itens Danificados' },
    { chave: 'OcorrênciasOperacionais', rotulo: 'Ocorrências Operacionais' }
  ]},
  { titulo: 'Gerência', icone: 'clipboard-list', itens: [
    { chave: 'inspecoes', rotulo: 'Controle de Inspeções', comSenha: true },
    { chave: 'CentraldeMetas', rotulo: 'Central de Metas', comSenha: true },
    { chave: 'forracaoCostura', rotulo: 'Complexidade dos Pedidos' }
  ]},
  { titulo: 'Estoque', icone: 'warehouse', itens: [
    { chave: 'inspecaoSetores', rotulo: 'Inspeção de Setores' },
    { chave: 'Almoxarifado', rotulo: 'Almoxarifado', comSenha: true },
    { chave: 'itensDanificados', rotulo: 'Itens Danificados' },
    { chave: 'ControleDeQualidade', rotulo: 'Controle de Qualidade', comSenha: true }
  ]},
  { titulo: 'Recursos Humanos', icone: 'users', itens: [
    { chave: 'controlerh', rotulo: 'Registro de Ocorrências RH', comSenha: true },
    { chave: 'muralAdmin', rotulo: 'Editar o mural (avisos e destaques)' }
  ]},
  { titulo: 'Financeiro', icone: 'wallet', itens: [
    { chave: 'pagamentoFretes', rotulo: 'Pagamento de Fretes', comSenha: true },
    { chave: 'TetodeGastos', rotulo: 'Controle Financeiro - Teto de Gastos', comSenha: true }
  ]}
];

const PORTAL_LINKS = {
  pagamentoFretes: '/Modulos/Chiavari/Fretes/?page=conciliacao',
  lancamentoUber: '/Modulos/Chiavari/Uber/?page=form',
  controleLogistica: '/Modulos/Chiavari/Uber/',
  lancamentoFrete: '/Modulos/Chiavari/Fretes/',
  ControleRetorno: 'https://script.google.com/macros/s/AKfycbxCJYdNWIDibvuHkcP_JU7KJ2ihZKouLLlg_M-KKvB0fG4kHhA-Yipn5VSeir1wgXwdUQ/exec',
  osManutencao: 'https://script.google.com/macros/s/AKfycby_rUc5WpFMKzjJdj05t2KJETWiQfAbS1NAJ1nZjVNAxKAE0IlOy3XgnfHy-N7xd8I8/exec?p=formulario',
  itensDanificados: '/Modulos/Chiavari/CentralMetas/?p=painel',
  forracaoLimpeza: 'https://script.google.com/macros/s/AKfycbzBWiTh5Zj5kFijBk_fyusy1-Ip9LYdHcFVKXmG-oLs2tvJD2kXec_9d4InLgX07UJw/exec',
  forracaoCostura: '/Modulos/Chiavari/Costura/',
  forracaoFormularios: 'https://script.google.com/macros/s/AKfycbzBWiTh5Zj5kFijBk_fyusy1-Ip9LYdHcFVKXmG-oLs2tvJD2kXec_9d4InLgX07UJw/exec?p=formulario',
  TetodeGastos: '/Modulos/Chiavari/Almoxarifado/?p=financeiro',
  Feedback: '/Modulos/Chiavari/Feedback/',
  dados: 'https://drive.google.com/drive/folders/1sC1IncUXkUIuXv0l10vaxscWKzs5FtLi',
  inspecoes: 'https://script.google.com/macros/s/AKfycbyySKRwP3XHYZMMWH_Bih3paatALhAB9_Yl96lWdX705dnaaHCekONsiuNkjv9kihZ3QQ/exec?page=painel_fiscalizacao',
  inspecaoSetores: 'https://script.google.com/macros/s/AKfycbyySKRwP3XHYZMMWH_Bih3paatALhAB9_Yl96lWdX705dnaaHCekONsiuNkjv9kihZ3QQ/exec?page=Desempenho',
  CentraldeMetas: '/Modulos/Chiavari/CentralMetas/',
  Almoxarifado: '/Modulos/Chiavari/Almoxarifado/',
  ControleDeQualidade: 'https://script.google.com/macros/s/AKfycbwDKAxlRmh7aaMikcUsD99a_KIVeTop9lr_Mx2bdh_30W2CTciR5XQGWNOnS0gyiUDY/exec',
  cronograma: '/Modulos/Chiavari/Cronograma/',
  'OcorrênciasOperacionais': '/Modulos/Chiavari/Ocorrencias/?page=OcorrenciasOperacionais',
  'paineloperações': '/Modulos/Chiavari/Ocorrencias/?page=PainelQualidade',
  controlerh: '/Modulos/Chiavari/ControleRH/'
};


/****************************************************
 *  LOGIN (Firebase conferido no servidor)
 ****************************************************/
function PORTAL_verificarFirebase_(idToken) {

  if (!idToken) {
    throw new Error('LOGIN: faça login novamente.');
  }

  const resposta = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + PORTAL_FIREBASE_API_KEY,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: String(idToken) }),
      muteHttpExceptions: true
    }
  );

  const dados = JSON.parse(resposta.getContentText() || '{}');
  const usuario = dados.users && dados.users[0];

  if (resposta.getResponseCode() !== 200 || !usuario || !usuario.email || usuario.disabled) {
    throw new Error('LOGIN: sua sessão expirou. Entre de novo.');
  }

  return { email: usuario.email, nome: usuario.displayName || '' };
}

function PORTAL_criarSessao_(usuario) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put(PORTAL_PREFIXO_SESSAO + token, JSON.stringify(usuario), PORTAL_DURACAO_SESSAO);
  return token;
}

function PORTAL_sessao_(token) {
  const bruto = CacheService.getScriptCache().get(PORTAL_PREFIXO_SESSAO + String(token || ''));
  if (!bruto) {
    throw new Error('LOGIN: sua sessão expirou. Entre de novo.');
  }
  return JSON.parse(bruto);
}

/* Chamado pelo portal ao abrir: confere o login e devolve menu + mural */
function PORTAL_iniciar(idToken) {

  const usuario = PORTAL_verificarFirebase_(idToken);
  const token = PORTAL_criarSessao_(usuario);

  return {
    sessao: token,
    usuario: usuario,
    menu: PORTAL_MENU.map(function (s) {
      return {
        titulo: s.titulo,
        icone: s.icone,
        itens: s.itens.map(function (i) { return { chave: i.chave, rotulo: i.rotulo, comSenha: !!i.comSenha }; })
      };
    }),
    mural: MURAL_dadosPublicos_()
  };
}


/****************************************************
 *  ABRIR UM SISTEMA (com ingresso temporário)
 ****************************************************/
function PORTAL_segredo_() {
  const props = PropertiesService.getScriptProperties();
  let segredo = props.getProperty(PORTAL_PROP_SEGREDO);
  if (!segredo) {
    segredo = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(PORTAL_PROP_SEGREDO, segredo);
  }
  return segredo;
}

function PORTAL_base64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

/* Ingresso: chave.expira.assinatura (HMAC-SHA256) */
function PORTAL_ingresso_(chave, email) {
  const expira = new Date().getTime() + PORTAL_VALIDADE_INGRESSO_MIN * 60000;
  const corpo = PORTAL_base64url_(Utilities.newBlob(chave + '|' + email + '|' + expira).getBytes());
  const assinatura = PORTAL_base64url_(Utilities.computeHmacSha256Signature(corpo, PORTAL_segredo_()));
  return corpo + '.' + assinatura;
}

function PORTAL_itemDoMenu_(chave) {
  for (let s = 0; s < PORTAL_MENU.length; s++) {
    for (let i = 0; i < PORTAL_MENU[s].itens.length; i++) {
      if (PORTAL_MENU[s].itens[i].chave === chave) {
        return PORTAL_MENU[s].itens[i];
      }
    }
  }
  return null;
}

function PORTAL_abrirModulo(sessao, chave, senha) {

  const usuario = PORTAL_sessao_(sessao);
  const item = PORTAL_itemDoMenu_(chave);

  if (!item) {
    throw new Error('Módulo não encontrado.');
  }

  if (item.comSenha) {
    if (!senha) {
      return { precisaSenha: true };
    }
    if (!validarSenhaPorPagina(chave, senha)) {
      return { precisaSenha: true, erro: 'Senha incorreta.' };
    }
  }

  let base = chave === 'muralAdmin'
    ? ScriptApp.getService().getUrl() + '?page=mural'
    : PORTAL_LINKS[chave];
  // Acervo: sistemas migrados têm caminho no próprio site
  if (base && base.charAt(0) === '/') { base = ScriptApp.getService().getUrl().replace(/^(https?:\/\/[^/]+).*$/, '$1') + base; }

  if (!base) {
    throw new Error('Link do módulo não configurado.');
  }

  return {
    rotulo: item.rotulo,
    url: base + (base.indexOf('?') >= 0 ? '&' : '?') + 'pt=' + encodeURIComponent(PORTAL_ingresso_(chave, usuario.email))
  };
}

/*
 * FASE 2 — para colar em cada sistema (com o mesmo segredo nas
 * Propriedades do script): devolve true se o ingresso é válido.
 */
function PORTAL_validarIngresso(ingresso, segredo) {
  const partes = String(ingresso || '').split('.');
  if (partes.length !== 2) { return false; }
  const esperado = PORTAL_base64url_(Utilities.computeHmacSha256Signature(partes[0], segredo));
  if (esperado !== partes[1]) { return false; }
  const conteudo = Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString().split('|');
  return Number(conteudo[2]) > new Date().getTime();
}


/****************************************************
 *  SENHA POR MÓDULO (aba "Acessos")
 ****************************************************/
function validarSenhaPorPagina(pagina, senhaDigitada) {

  if (!pagina || !senhaDigitada) return false;

  const ss = SpreadsheetApp.openById(PORTAL_SHEET_ID);
  const sh = ss.getSheetByName('Acessos');

  if (!sh) return false;

  const dados = sh.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {

    const html = String(dados[i][0]).trim();
    const senha = String(dados[i][1]).trim();

    if (html === String(pagina).trim()) {
      return senha === String(senhaDigitada).trim();
    }

  }

  return false;
}
