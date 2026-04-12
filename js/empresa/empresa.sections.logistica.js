(function(){
  async function render(container, state) {
    container.innerHTML = ''; // empty wrapper
    const freteWrapper = document.createElement('div');
    freteWrapper.id = 'frete-section';
    container.appendChild(freteWrapper);

    const montagemWrapper = document.createElement('div');
    montagemWrapper.id = 'montagem-section';
    container.appendChild(montagemWrapper);
  }

  async function bind(container, state, api) {
    console.log('🔶 [LOGISTICA-BIND] START');
    
    const freteWrapper = container.querySelector('#frete-section');
    console.log('🔶 [LOGISTICA-BIND] Renderizando FRETE...');
    window.empresa.logistica.frete.render(freteWrapper, state);
    const cleanupFrete = await window.empresa.logistica.frete.bind(freteWrapper, state, api);
    console.log('🔶 [LOGISTICA-BIND] FRETE OK');

    const montagemWrapper = container.querySelector('#montagem-section');
    console.log('🔶 [LOGISTICA-BIND] Renderizando MONTAGEM...');
    window.empresa.logistica.montagem.render(montagemWrapper, state);
    console.log('🔶 [LOGISTICA-BIND] Executando bind MONTAGEM...');
    const cleanupMontagem = await window.empresa.logistica.montagem.bind(montagemWrapper, state, api);
    console.log('🔶 [LOGISTICA-BIND] MONTAGEM OK');

    return () => {
      cleanupFrete && cleanupFrete();
      cleanupMontagem && cleanupMontagem();
    };
  }

  window.empresa = window.empresa || {};
  window.empresa.sections = window.empresa.sections || {};
  window.empresa.sections.logistica = { render, bind };
})();