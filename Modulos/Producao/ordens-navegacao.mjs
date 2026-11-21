import {renderizarFila} from './producao-vistas.mjs?v=20261103-reabrir-producao';

// O painel abre cada tela no próprio documento, sem um iframe intermediário.
const params = new URLSearchParams(location.search);
if (params.get('painel_ordens') === '1') {
  const servico = /\/itens-danificados\.html$/i.test(location.pathname);
  const atual = servico ? 'servico' : 'producao';
  const base = new URL('./', import.meta.url);
  const destinos = {
    producao: new URL('ordens.html?painel_ordens=1',base),
    servico: new URL('../Chiavari/CentralMetas/itens-danificados.html?painel_ordens=1',base),
  };
  const header = document.querySelector(servico ? 'header.cabecalho' : '.producao-page>header');
  document.documentElement.classList.add('ord-native');
  document.body.classList.add('ord-native-page');
  document.title = 'O.S e O.P';
  const nav = document.createElement('nav'); nav.className = 'ord-native-tabs';
  nav.setAttribute('aria-label','Ordens');
  for (const [key,label] of [['producao','Ordens de produção'],['servico','Ordens de serviço']]) {
    const link = document.createElement('a'); link.href = destinos[key].href;
    link.target = '_self'; link.dataset.ordTab = key; link.textContent = label;
    if (key === atual) link.setAttribute('aria-current','page');
    const badge = document.createElement('span'); badge.className = 'ord-native-badge'; badge.hidden = true;
    link.append(badge); nav.append(link);
  }
  header?.prepend(nav);
  if (servico) {
    const actions = document.getElementById('acoesTopo');
    const status = document.querySelector('.status-atualizacao');
    const filters = document.getElementById('filtros');
    if (actions && status) actions.prepend(status);
    if (actions && filters) actions.append(filters);
  }
  function badge(key,quantity) {
    const element = nav.querySelector(`[data-ord-tab="${key}"] .ord-native-badge`);
    element.textContent = String(quantity); element.hidden = quantity === 0;
    element.setAttribute('aria-label',`${quantity} ordens em aberto`);
  }
  function atualizarDocumento() {
    if (servico) {
      const table = document.getElementById('tabela');
      if (table) badge(atual,[...table.rows].filter(row=>row.cells.length>1).length);
    } else {
      if (document.querySelector('.producao-fila-page')) badge(atual,document.querySelectorAll('.producao-order-card:not([data-coluna="concluido"])').length);
      // Conserva abas, filtros e retorno ao navegar para uma ficha de produção.
      document.querySelectorAll('.producao-page a[href]').forEach(link=>{
        const url = new URL(link.href,location.href);
        if (url.origin === location.origin && /\/Producao\/(?:ordens|pedido)\.html$/i.test(url.pathname)) {
          url.searchParams.set('painel_ordens','1');
          if (link.href !== url.href) link.href = url.href;
        }
      });
    }
  }
  const content = document.getElementById(servico ? 'tabela' : 'ordens');
  if (content) new MutationObserver(atualizarDocumento).observe(content,{childList:true,subtree:true});
  atualizarDocumento();

  (async()=>{
    try { await window.EasyLocPermissions?.load?.(); } catch {}
    const cache = window.EasyLocPermissions?._cache;
    const tem = key => !cache || cache.legacyAdmin || cache.permissions?.get?.(key) === true;
    const liberado = {
      producao: cache?.active !== false && (tem('producao.ordens.visualizar') || tem('estoque.almoxarifado.visualizar')),
      servico: cache?.active !== false && tem('estoque.almoxarifado.visualizar'),
    };
    nav.querySelectorAll('[data-ord-tab]').forEach(link=>{link.hidden = !liberado[link.dataset.ordTab];});
    const outro = servico ? 'producao' : 'servico';
    if (!liberado[outro]) return;
    try {
      const context = await window.aguardarContexto();
      const response = await window.supabaseClient.rpc(outro === 'producao' ? 'producao_quadro' : 'acervo_ordens',{p_empresa:context.empresa_id});
      if (response.error) return;
      if (outro === 'servico') badge(outro,(response.data || []).filter(order=>order.fonte==='sistema' && !order.concluida).length);
      else {
        const result = renderizarFila(response.data?.itens || [],{setor:'todos',situacao:'todas',busca:'',executar:false});
        const template = document.createElement('template'); template.innerHTML = result.html;
        badge(outro,template.content.querySelectorAll('.producao-order-card:not([data-coluna="concluido"])').length);
      }
    } catch { /* Falha na contagem não impede consultar a aba. */ }
  })();
}
