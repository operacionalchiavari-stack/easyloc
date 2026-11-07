(function () {
  'use strict';
  const nav = document.getElementById('plAbasDias');
  const hoje = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  let inicio = hoje, data = hoje, atual = hoje, etapas = null, operacoes = null, modulo = 'equipe', todos = false;
  // Os dias não têm limite: começam com BLOCO e, ao rolar a faixa até perto do fim, pedem mais um bloco.
  const BLOCO = 14;
  let quantos = BLOCO * 2, carregando = false, posicionado = false;
  inicio = somar(hoje, -BLOCO);
  function somar(dia, quantidade) {
    const d = new Date(dia + 'T12:00:00');
    d.setDate(d.getDate() + quantidade);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const dias = () => Array.from({length: quantos}, (_, i) => somar(inicio, i));
  const solicitada = new URLSearchParams(location.search).get('dia');
  if (/^\d{4}-\d{2}-\d{2}$/.test(solicitada || '')) {
    if(solicitada < inicio){inicio=somar(solicitada,-BLOCO);quantos=Math.ceil((Math.round((new Date(hoje+'T12:00:00')-new Date(inicio+'T12:00:00'))/864e5)+BLOCO)/BLOCO)*BLOCO;}
    else {const distancia=Math.round((new Date(solicitada+'T12:00:00')-new Date(inicio+'T12:00:00'))/864e5);quantos=Math.max(quantos,Math.ceil((distancia+1)/BLOCO)*BLOCO);}
  }
  if (dias().includes(solicitada)) data = solicitada;
  // Chegou perto do fim da faixa (ou ela ainda não enche a largura): pede mais dias.
  function conferirInicio() {
    if(carregando || nav.offsetParent===null || nav.scrollLeft>160)return;
    window.PainelLogisticoEquipe?.carregarMais('antes');
  }
  function conferirFim() {
    if (carregando || nav.offsetParent === null) return;
    if (nav.scrollWidth - nav.scrollLeft - nav.clientWidth > 160) return;
    const pedir = window.PainelLogisticoEquipe?.carregarMais;
    if (pedir) pedir(); else { quantos += BLOCO; desenhar(); }
  }
  function desenhar() {
    const borda=nav.getBoundingClientRect().left;
    const ancora=[...nav.querySelectorAll('[data-dia]')].find(el=>el.getBoundingClientRect().right>borda);
    const anterior=ancora?.getBoundingClientRect().left;
    nav.innerHTML = dias().map(dia => {
      const selecionado = !todos && dia === data;
      const nome = dia === atual ? 'Hoje' : ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][new Date(dia + 'T12:00:00').getDay()];
      const fonte = modulo === 'equipe' ? etapas : operacoes;
      const itens = (fonte || []).filter(e => (modulo==='equipe'||(!e.somente_consulta&&e.fluxo_etapa===modulo)) && String((modulo === 'equipe' ? e.data : modulo === 'entrega' ? e.data_entrega : e.data_coleta) || '').slice(0, 10) === dia);
      const total=itens.length;
      const completo=modulo==='equipe' && total>0 && itens.every(e=>e.planejamento_completo===true);
      const pend=modulo==='equipe'?itens.filter(e=>e.planejamento_completo!==true).length:total;
      const dica=modulo==='equipe'?(completo?`Dia completo: ${total} montagem(ns)/desmontagem(ns) com equipe e caminhão`:`${pend} de ${total} montagem(ns)/desmontagem(ns) ainda sem equipe ou caminhão completos`):`${total} ${modulo==='entrega'?'entrega(s)':'coleta(s)'} neste dia`;
      return `<button type="button" id="plTab-${dia}" role="tab" data-dia="${dia}" aria-selected="${selecionado}" aria-controls="plModuloEquipe plModuloEntregas" tabindex="${dia === data ? 0 : -1}"><span>${nome}</span><strong>${dia.slice(8, 10)}/${dia.slice(5, 7)}</strong>${total > 0 ? `<span class="pl-pendencia-dia${completo?' is-completo':''}" aria-hidden="true" title="${dica}">${completo?total:pend}</span>` : ''}</button>`;
    }).join('') + (carregando ? '<span class="pl-dias-carregando" role="status">Carregando mais dias…</span>' : '');
    const referencia=ancora&&document.getElementById(ancora.id);
    if(referencia){const delta=referencia.getBoundingClientRect().left-anterior;nav.scrollLeft+=delta;if(arrasto)arrasto.esquerda+=delta;}
    if(!posicionado && nav.offsetParent!==null){const alvo=document.getElementById('plTab-'+data);if(alvo){nav.scrollLeft+=alvo.getBoundingClientRect().left-borda;posicionado=true;}}
    requestAnimationFrame(conferirFim);
  }
  function selecionar(dia) {
    if ((!todos && dia === data) || !dias().includes(dia)) return;
    if (window.EntregasColetas?.podeTrocarDia && !window.EntregasColetas.podeTrocarDia()) return;
    data = dia;
    todos = false;
    desenhar();
    window.PainelLogisticoEquipe?.definirDia(data);
    window.EntregasColetas?.definirDia(data);
    const url = new URL(location.href);
    url.searchParams.set('dia', data);
    history.replaceState(null, '', url);
    document.getElementById('plTab-' + data)?.focus();
  }
  window.PainelLogisticoDias = {
    get data() { return todos ? null : data; },
    get quantos() { return quantos; },
    get inicio() { return inicio; },
    carregando(sim) { carregando = !!sim; desenhar(); },
    definirModulo(nome) {
      modulo = nome;
      todos = nome !== 'equipe';
      if (todos) window.EntregasColetas?.definirDia(null);
      else window.PainelLogisticoEquipe?.definirDia(data);
      desenhar();
    },
    atualizarOperacoes(pedidos) { operacoes = pedidos; desenhar(); },
    atualizar(novoInicio, novoHoje, novasEtapas, total) {
      if (total) quantos = total;
      inicio = novoInicio;
      atual = novoHoje;
      etapas = novasEtapas || [];
      if (!dias().includes(data)) {
        data = dias().includes(atual) ? atual : inicio;
        if (!todos) window.EntregasColetas?.definirDia(data);
      }
      desenhar();
    }
  };
  nav.addEventListener('click', evento => {
    const aba = evento.target.closest('[data-dia]');
    if (aba) selecionar(aba.dataset.dia);
  });
  nav.addEventListener('keydown', evento => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evento.key)) return;
    evento.preventDefault();
    const lista = dias(), indice = lista.indexOf(data);
    selecionar(lista[evento.key === 'Home' ? 0 : evento.key === 'End' ? lista.length - 1 : (indice + (evento.key === 'ArrowRight' ? 1 : -1) + lista.length) % lista.length]);
  });
  let ultimaEsquerda=0;
  nav.addEventListener('scroll',()=>{const esquerda=nav.scrollLeft;if(esquerda<ultimaEsquerda)conferirInicio();else conferirFim();ultimaEsquerda=nav.scrollLeft;},{passive:true});
  window.addEventListener('resize', conferirFim);
  // Roda do mouse em cima da faixa anda para o lado.
  nav.addEventListener('wheel', evento => {
    if (Math.abs(evento.deltaY) <= Math.abs(evento.deltaX) || nav.scrollWidth <= nav.clientWidth) return;
    evento.preventDefault();
    nav.scrollLeft += evento.deltaY;
  }, {passive: false});
  // Segurar e puxar com o mouse, como no cronograma; o clique que sai de um arrasto não troca de dia.
  let arrasto = null, arrastouEm = 0;
  nav.addEventListener('click', evento => { if (Date.now() - arrastouEm < 300) { evento.stopPropagation(); evento.preventDefault(); } }, true);
  nav.addEventListener('pointerdown', evento => {
    if (evento.pointerType !== 'mouse' || evento.button !== 0) return;
    arrasto = {x: evento.clientX, esquerda: nav.scrollLeft, moveu: false};
  });
  window.addEventListener('pointermove', evento => {
    if (!arrasto) return;
    const dx = evento.clientX - arrasto.x;
    if (!arrasto.moveu && Math.abs(dx) < 6) return;
    arrasto.moveu = true;
    nav.classList.add('is-arrastando');
    nav.scrollLeft = arrasto.esquerda - dx;
  });
  window.addEventListener('pointerup', () => {
    if (arrasto?.moveu) arrastouEm = Date.now();
    arrasto = null;
    nav.classList.remove('is-arrastando');
  });
  desenhar();
})();
