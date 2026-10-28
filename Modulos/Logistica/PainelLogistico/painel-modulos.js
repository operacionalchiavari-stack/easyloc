(function () {
  'use strict';
  const abas = [...document.querySelectorAll('#plTopoUnificado [data-modulo]')];
  const iniciados = new Set();
  const permitidos = new Set();
  let atual = null;
  async function selecionar(nome) {
    if (!permitidos.has(nome)) return;
    const operacao = nome === 'entrega' || nome === 'coleta';
    if (operacao && !window.EntregasColetas.podeSelecionarOperacao(nome)) return;
    atual = nome;
    if (['equipe','entrega','coleta'].includes(nome)) window.PainelLogisticoDias.definirModulo(nome);
    document.getElementById('plAbasDias').hidden = ['cronograma','parametros'].includes(nome);
    abas.forEach(aba => {
      const selecionada = aba.dataset.modulo === nome;
      aba.setAttribute('aria-selected', String(selecionada));
      aba.tabIndex = selecionada ? 0 : -1;
    });
    document.getElementById('plModuloEquipe').hidden = nome !== 'equipe';
    document.getElementById('plModuloEntregas').hidden = !operacao;
    document.getElementById('plModuloCronograma').hidden = nome !== 'cronograma';
    document.getElementById('plModuloParametros').hidden = nome !== 'parametros';
    if (operacao) {
      document.getElementById('plModuloEntregas').setAttribute('aria-labelledby', nome === 'entrega' ? 'plTabEntrega' : 'plTabColeta');
      window.EntregasColetas.definirOperacao(nome);
    }
    document.getElementById('plPreencher').hidden = nome !== 'equipe' || document.getElementById('plPreencher').dataset.automaticadesativada==='true';
    const url = new URL(location.href);
    url.searchParams.set('aba', nome);
    if (nome !== 'equipe') url.searchParams.delete('dia');
    history.replaceState(null, '', url);
    const grupo = nome === 'parametros' ? 'parametros' : nome === 'cronograma' ? 'cronograma' : nome === 'equipe' ? 'equipe' : 'operacoes';
    if (iniciados.has(grupo)) return;
    iniciados.add(grupo);
    try {
      if (nome === 'parametros') {
        const ctx=await window.aguardarContexto();
        await window.carregarParametrosEscala(document.getElementById('plModuloParametros'),ctx.empresa_id,{mostrarAutomatica:false});
      }
      else if (nome === 'cronograma') {
        const quadro = document.getElementById('plCronogramaFrame');
        quadro.addEventListener('load', () => {
          try {
            const doc = quadro.contentDocument;
            const estilo = doc.createElement('style');
            estilo.textContent = 'html,body{height:auto!important;min-height:0!important}html{overflow-y:hidden!important}body{overflow-y:visible!important}html:root body .app,html:root body .app-cron{height:auto!important;min-height:0!important;max-height:none!important}html:root body .board-wrap{height:auto!important;min-height:0!important;max-height:none!important;overflow-x:auto!important;overflow-y:hidden!important}html body .topbar>.title-wrap,html body .topbar button[onclick="abrirAgendaNova()"]{display:none!important}html body .topbar{grid-template-columns:minmax(0,1fr) auto!important;grid-template-areas:"semana acoes"!important}';
            doc.head.appendChild(estilo);
            quadro.setAttribute('scrolling','no');
            let pendente=false;
            const ajustarAltura=()=>{
              if(pendente || document.getElementById('plModuloCronograma').hidden)return;
              pendente=true;
              requestAnimationFrame(()=>{
                pendente=false;
                const margens=quadro.contentWindow.getComputedStyle(doc.body);
                const altura=Math.ceil(doc.body.getBoundingClientRect().height+(parseFloat(margens.marginTop)||0)+(parseFloat(margens.marginBottom)||0));
                if(altura>0 && Math.abs(quadro.getBoundingClientRect().height-altura)>1)quadro.style.height=altura+'px';
              });
            };
            const observador=new ResizeObserver(ajustarAltura);
            observador.observe(doc.body);
            const visibilidade=new MutationObserver(ajustarAltura);
            visibilidade.observe(document.getElementById('plModuloCronograma'),{attributes:true,attributeFilter:['hidden']});
            quadro.contentWindow.addEventListener('resize',ajustarAltura);
            doc.addEventListener('load',ajustarAltura,true);
            ajustarAltura();
          } catch (_) { /* O cronograma mantém o próprio cabeçalho caso a origem mude. */ }
        }, {once: true});
        quadro.src = quadro.dataset.src;
      }
      else if (nome === 'equipe') await window.PainelLogisticoEquipe.iniciar();
      else await window.EntregasColetas.iniciar();
    } catch (erro) {
      iniciados.delete(grupo);
      const aviso = document.getElementById(nome === 'parametros' ? 'plModuloParametros' : nome === 'equipe' ? 'plErro' : 'ecMensagem');
      aviso.hidden = false;
      aviso.textContent = erro.message || 'Não foi possível carregar esta área.';
    }
  }
  async function iniciar() {
    const permissoes = window.EasyLocPermissions;
    if (permissoes) await permissoes.load();
    const chaves = {equipe: 'logistica.planejamento.visualizar', entrega: 'logistica.expedicao.visualizar', coleta: 'logistica.expedicao.visualizar', cronograma: 'logistica.cronograma.visualizar', parametros: 'logistica.planejamento.visualizar'};
    abas.forEach(aba => {
      const nome = aba.dataset.modulo;
      const pode = !permissoes || permissoes.hasPermission(chaves[nome]);
      aba.hidden = !pode;
      document.getElementById(aba.getAttribute('aria-controls')).hidden = true;
      if (pode) permitidos.add(nome);
      aba.addEventListener('click', () => selecionar(nome));
    });
    document.getElementById('plTopoUnificado').addEventListener('keydown', evento => {
      if(!evento.target.closest('[data-modulo]'))return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evento.key)) return;
      evento.preventDefault();
      const visiveis = abas.filter(aba => !aba.hidden);
      const indice = visiveis.findIndex(aba => aba.dataset.modulo === atual);
      const proxima = evento.key === 'Home' ? 0 : evento.key === 'End' ? visiveis.length - 1 : (indice + (evento.key === 'ArrowRight' ? 1 : -1) + visiveis.length) % visiveis.length;
      visiveis[proxima]?.click();
      visiveis[proxima]?.focus();
    });
    const params = new URLSearchParams(location.search);
    let solicitada = params.get('aba');
    if (solicitada === 'entregas') solicitada = params.get('etapa') === 'coleta' ? 'coleta' : 'entrega';
    await selecionar(permitidos.has(solicitada) ? solicitada : [...permitidos][0]);
    if (permitidos.has('equipe') && !iniciados.has('equipe')) {
      iniciados.add('equipe');
      await window.PainelLogisticoEquipe.iniciar();
    }
    if (permitidos.has('entrega') && !iniciados.has('operacoes')) {
      iniciados.add('operacoes');
      await window.EntregasColetas.iniciar();
    }
  }
  iniciar().catch(erro => {
    const aviso = document.getElementById('plErro');
    aviso.hidden = false;
    aviso.textContent = erro.message;
  });
})();
