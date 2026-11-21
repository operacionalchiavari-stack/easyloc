(function () {
  'use strict';
  const abas = [...document.querySelectorAll('#plTopoUnificado [data-modulo]')];
  const iniciados = new Set();
  const permitidos = new Set();
  // A mesma origem de tempo mantém os indicadores em fase, mesmo com carregamentos separados.
  const navegacao=document.getElementById('plModuloAbas');
  if(navegacao){
    let pendente=false;
    const sincronizar=()=>{
      if(pendente)return;pendente=true;
      requestAnimationFrame(()=>{
        pendente=false;
        navegacao.querySelectorAll('.pl-alerta-aba').forEach(indicador=>{
          (indicador.getAnimations?.({subtree:true})||[]).forEach(animacao=>{if(animacao.animationName==='pl-alerta-aba-anel')animacao.ready.then(()=>{if(animacao.playState!=='idle')animacao.startTime=0;}).catch(()=>{});});
        });
      });
    };
    new MutationObserver(sincronizar).observe(navegacao,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
    sincronizar();
  }
  let atual = null;
  async function selecionar(nome) {
    if (!permitidos.has(nome)) return;
    const operacao = nome === 'entrega' || nome === 'coleta';
    if (operacao && !window.EntregasColetas.podeSelecionarOperacao(nome)) return;
    atual = nome;
    if (['equipe','entrega','coleta'].includes(nome)) window.PainelLogisticoDias.definirModulo(nome);
    document.getElementById('plAbasDias').hidden = true;
    document.getElementById('plIrHoje').hidden=nome!=='equipe';
    abas.forEach(aba => {
      const selecionada = aba.dataset.modulo === nome;
      aba.setAttribute('aria-selected', String(selecionada));
      aba.tabIndex = selecionada ? 0 : -1;
    });
    document.getElementById('plModuloEquipe').hidden = nome !== 'equipe';
    document.getElementById('plModuloEntregas').hidden = !operacao;
    document.getElementById('plModuloFreteiros').hidden = nome !== 'freteiros';
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
    const grupo = nome === 'parametros' ? 'parametros' : nome === 'freteiros' ? 'freteiros' : nome === 'equipe' ? 'equipe' : 'operacoes';
    if (iniciados.has(grupo)) return;
    iniciados.add(grupo);
    try {
      if (nome === 'parametros') {
        const ctx=await window.aguardarContexto();
        await window.carregarParametrosEscala(document.getElementById('plModuloParametros'),ctx.empresa_id,{mostrarAutomatica:false,mostrarUber:true});
      }
      else if (nome === 'freteiros') {
        // 15/11/2026: aprovação dos cadastros do App do Freteiro (antes ficava escondida no Cadastro de Fornecedores)
        const quadro = document.getElementById('plFreteirosFrame');
        window.addEventListener('message', e => {
          if (e.origin !== location.origin || e.source !== quadro.contentWindow) return;
          if (e.data?.tipo === 'fretes-cadastros-altura') quadro.style.height = Math.max(200, Number(e.data.altura) || 200) + 'px';
        });
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
    const chaves = {equipe: 'logistica.planejamento.visualizar', entrega: 'logistica.expedicao.visualizar', coleta: 'logistica.expedicao.visualizar', freteiros: 'logistica.planejamento.visualizar', parametros: 'logistica.planejamento.visualizar'};
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
