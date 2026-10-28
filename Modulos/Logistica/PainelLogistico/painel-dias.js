(function () {
  'use strict';
  const nav = document.getElementById('plAbasDias');
  const hoje = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  let inicio = hoje, data = hoje, atual = hoje, etapas = null, operacoes = null, modulo = 'equipe', todos = false;
  function somar(dia, quantidade) {
    const d = new Date(dia + 'T12:00:00');
    d.setDate(d.getDate() + quantidade);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const dias = () => Array.from({length: 7}, (_, i) => somar(inicio, i));
  const solicitada = new URLSearchParams(location.search).get('dia');
  if (dias().includes(solicitada)) data = solicitada;
  function desenhar() {
    nav.innerHTML = dias().map(dia => {
      const selecionado = !todos && dia === data;
      const nome = dia === atual ? 'Hoje' : ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][new Date(dia + 'T12:00:00').getDay()];
      const fonte = modulo === 'equipe' ? etapas : operacoes;
      const itens = (fonte || []).filter(e => (modulo==='equipe'||(!e.somente_consulta&&e.fluxo_etapa===modulo)) && String((modulo === 'equipe' ? e.data : modulo === 'entrega' ? e.data_entrega : e.data_coleta) || '').slice(0, 10) === dia);
      const total=itens.length;
      const completo=modulo==='equipe' && total>0 && itens.every(e=>e.planejamento_completo===true);
      return `<button type="button" id="plTab-${dia}" role="tab" data-dia="${dia}" aria-selected="${selecionado}" aria-controls="plModuloEquipe plModuloEntregas" tabindex="${dia === data ? 0 : -1}"><span>${nome}</span><strong>${dia.slice(8, 10)}/${dia.slice(5, 7)}</strong>${total > 0 ? `<span class="pl-pendencia-dia${completo?' is-completo':''}" aria-hidden="true" title="${completo?'Dia completo · ':''}${total} operações neste dia">${total}</span>` : ''}</button>`;
    }).join('');
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
    definirModulo(nome) {
      modulo = nome;
      todos = nome !== 'equipe';
      if (todos) window.EntregasColetas?.definirDia(null);
      else window.PainelLogisticoEquipe?.definirDia(data);
      desenhar();
    },
    atualizarOperacoes(pedidos) { operacoes = pedidos; desenhar(); },
    atualizar(novoInicio, novoHoje, novasEtapas) {
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
    selecionar(lista[evento.key === 'Home' ? 0 : evento.key === 'End' ? 6 : (indice + (evento.key === 'ArrowRight' ? 1 : -1) + 7) % 7]);
  });
  desenhar();
})();
