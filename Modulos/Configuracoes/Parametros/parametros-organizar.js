// Organização da tela de Parâmetros (out/2026): um card por assunto, títulos claros, a aba "Logística e operação"
// juntando o que era Logística e Operação, e um índice no topo de cada aba para pular direto ao card.
// Este arquivo só reorganiza o que os outros módulos desenham: as regras e os salvamentos continuam neles.
(function () {
  'use strict';
  const slug = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Deixa o primeiro título do card com o texto novo e o estilo comum.
  function titulo(card, texto, ajuda) {
    if (!card) return null;
    let h = card.querySelector(':scope>h1,:scope>h2,:scope>h3');
    if (!h) { h = document.createElement('h3'); card.prepend(h); }
    h.removeAttribute('style'); h.classList.add('pr-card-titulo'); h.textContent = texto;
    if (ajuda) {
      let p = h.nextElementSibling;
      if (!p || p.tagName !== 'P' || !p.classList.contains('pr-ajuda-auto')) { p = document.createElement('p'); p.className = 'pr-ajuda pr-ajuda-auto'; h.after(p); }
      p.textContent = ajuda;
    }
    card.classList.add('pr-card');
    card.id = card.id || 'pr-card-' + slug(texto);
    card.dataset.prCard = texto;
    return card;
  }
  function novoCard(texto, ajuda, conteudo) {
    const card = document.createElement('section');
    conteudo.forEach(n => n && card.append(n));
    return titulo(card, texto, ajuda);
  }
  function grupo(nome, cards) {
    const g = document.createElement('div');
    g.className = 'pr-grupo'; g.dataset.prGrupo = nome;
    g.innerHTML = '<h2 class="pr-grupo-titulo">' + nome + '</h2>';
    cards.filter(Boolean).forEach(c => g.append(c));
    return g;
  }
  // Botão Salvar dentro do card (o mesmo formulário de antes; cada card ganha o seu).
  function rodapeSalvar(card, html) {
    const r = document.createElement('div'); r.className = 'pr-card-acoes'; r.innerHTML = html; card.append(r); return r;
  }

  // ---- Logística e operação ---------------------------------------------------------------------------------------
  window.prOrganizarLogistica = function (host) {
    if (!host || host.dataset.organizado) return;
    host.dataset.organizado = '1';
    host.classList.remove('pr-card'); host.classList.add('pr-painel-cards');

    // Cards que eram da aba Operação (formulário #formParametros): continuam no mesmo formulário pelo atributo form.
    const form = document.getElementById('formParametros');
    const op = form ? [...form.querySelectorAll(':scope>section.pr-card')] : [];
    const achar = t => op.find(c => (c.querySelector('h3')?.textContent || '').trim().startsWith(t));
    op.forEach(c => {
      c.querySelectorAll('input,select,textarea,button').forEach(el => el.setAttribute('form', 'formParametros'));
      rodapeSalvar(c, '<span class="pr-card-status" data-op-status role="status"></span><button type="submit" form="formParametros" class="btn primary">Salvar</button>');
    });
    const opPedidos = titulo(achar('Pedidos no cronograma'), 'Quais pedidos entram no cronograma');
    const opDatas = titulo(achar('Datas das etapas'), 'Datas e horário das etapas');
    const opTriagem = titulo(achar('Triagem'), 'Triagem: responsável, equipe e conferência');
    const opEscala = titulo(achar('Escala automática'), 'Regras da escala por etapa');

    const fluxo = host.querySelector('.pr-fluxo-pedidos');
    const cronVis = [...host.querySelectorAll(':scope>section.pr-card')].find(s => /cronograma/i.test(s.querySelector('h3')?.textContent || ''));
    const modos = host.querySelector('.pr-separacao-modos');
    const setoresSep = host.querySelector('.pr-separacao-setores');
    const uber = host.querySelector('.pr-uber-faixas');
    const divergencias = host.querySelector('.pr-divergencias');
    const carregCam = host.querySelector('.pr-carregamento-caminhao');
    const motivos = [...host.querySelectorAll('[data-motivos]')];
    const qualidade = [...host.querySelectorAll(':scope>.pr-motivos-logistica')].find(s => !s.dataset.motivos && !s.classList.contains('pr-fluxo-pedidos'));
    const escalaWrap = host.querySelector('.escala-parametros');
    const escalaCards = escalaWrap ? [...escalaWrap.querySelectorAll(':scope>.escala-parametros-card')] : [];
    const escalaLiga = escalaCards.find(c => c.querySelector('[data-controle]'));
    if (escalaLiga) escalaWrap.before(escalaLiga);           // o formulário tem o próprio evento: pode sair do painel
    const escalaPessoas = escalaCards.find(c => c.querySelector('[data-restricao]'));
    escalaWrap?.classList.add('pr-escala-wrap');

    // Frete e montagem: salvam pelo botão Salvar geral dos dados da empresa (agora dentro de cada card).
    const freteSec = host.querySelector('#frete-section'), montSec = host.querySelector('#montagem-section');
    const rotuloFrete = freteSec?.firstElementChild?.firstElementChild;
    if (rotuloFrete && rotuloFrete.textContent.trim() === 'Frete') rotuloFrete.hidden = true;
    const frete = freteSec && novoCard('Frete', 'Valor mínimo e máximo do frete e as categorias de caminhão usadas no cálculo do pedido (por volume e km).', [freteSec]);
    const mont = montSec && novoCard('Montagem', 'Valor mínimo e máximo da montagem, a diária do montador e quantos montadores cada combinação de itens precisa.', [montSec]);
    const salvarGeral = document.getElementById('salvarEmpresaParametros'), statusGeral = document.getElementById('empresaParametrosStatus');
    [frete, mont].filter(Boolean).forEach(c => {
      const r = rodapeSalvar(c, '<span class="pr-card-status" role="status"></span><button type="button" class="btn primary" data-salvar-frete>Salvar valores de frete e montagem</button>');
      r.querySelector('button').addEventListener('click', () => { r.dataset.ultimo = '1'; document.querySelectorAll('[data-salvar-frete]').forEach(b => { if (b !== r.querySelector('button')) b.closest('.pr-card-acoes').dataset.ultimo = ''; }); salvarGeral?.click(); });
    });
    if (statusGeral) new MutationObserver(() => {
      const alvo = document.querySelector('.pr-card-acoes[data-ultimo="1"] .pr-card-status');
      if (alvo) alvo.textContent = statusGeral.textContent;
    }).observe(statusGeral, { childList: true, characterData: true, subtree: true });

    host.querySelector('#logistica-regras-section')?.setAttribute('hidden', '');
    const grupos = [
      grupo('Pedidos e cronograma', [
        opPedidos, opDatas,
        titulo(cronVis, 'Visualização do cronograma'),
        titulo(fluxo, 'Pré-reservas e retorno após a coleta')
      ]),
      grupo('Triagem e conferência', [
        opTriagem,
        titulo(modos, 'Modos de separação'),
        titulo(setoresSep, 'Setores da separação'),
        titulo(divergencias, 'Divergências de contagem'),
        titulo(carregCam, 'Carregamento sem caminhão programado'),
        titulo(qualidade, 'Inventário e controle de qualidade')
      ]),
      grupo('Equipes e caminhões (escala)', [
        titulo(escalaLiga, 'Escala automática'),
        opEscala,
        escalaWrap && (titulo(escalaPessoas, 'Pessoas que não podem trabalhar juntas'), escalaWrap)
      ]),
      grupo('Frete, montagem e Uber', [frete, mont, titulo(uber, 'Valores do Uber por km')]),
      grupo('Motivos', motivos.map(m => titulo(m, m.querySelector('h3')?.textContent || 'Motivos')))
    ];
    // Cards de cada aba antiga que não reconhecemos (novos no futuro) vão para o fim, sem se perder.
    const sobras = [...host.children].filter(n => !n.hidden && !n.classList.contains('pr-grupo') && (n.textContent.trim() || n.querySelector('input,select,button')));
    host.replaceChildren(...grupos.filter(g => g.querySelector('.pr-card')));
    if (sobras.length) host.append(grupo('Outros', sobras));
    atualizarSumario();
  };

  // ---- Outras abas: títulos e cards ------------------------------------------------------------------------------
  const TITULOS = {
    dados: ['Dados da empresa', 'Nome, CNPJ, contato e endereço. O endereço Google é o ponto de partida do cálculo de frete.'],
    tributacao: ['Impostos e regime tributário', ''],
    financeiro: ['Desconto automático de frete e montagem', ''],
    identidade: ['Logo e cores do sistema', '']
  };
  function organizarPainel(nome) {
    const painel = document.getElementById('pr-painel-' + nome);
    if (!painel || painel.dataset.organizado || !painel.firstElementChild) return;
    if (TITULOS[nome]) {
      painel.dataset.organizado = '1';
      const [t, a] = TITULOS[nome];
      if (nome === 'financeiro') {
        // Um card por regra: desconto automático e pagamento mínimo.
        painel.classList.remove('pr-card'); painel.classList.add('pr-painel-cards');
        titulo(painel.querySelector('[data-fin-card=desconto]'), t);
        titulo(painel.querySelector('[data-fin-card=pagamento]'), 'Pagamento mínimo para liberar o pedido');
      } else titulo(painel, t, a);
    }
    if (nome === 'comercial') {
      if (!painel.querySelector('#logisticaManualParametros')) return; // ainda carregando
      painel.dataset.organizado = '1';
      painel.classList.remove('pr-card'); painel.classList.add('pr-painel-cards');
      const servicos = painel.firstElementChild;
      if (servicos && !servicos.classList.contains('pr-card')) painel.prepend(novoCard('Serviços adicionais', 'Serviços que podem ser incluídos no pedido, com valor fixo, mão de obra, por km e por m³.', [servicos]));
      titulo(painel.querySelector('#logisticaManualParametros'), 'Quem pode ajustar frete e montagem no pedido');
      painel.querySelectorAll('.pe-card').forEach(c => titulo(c, c.querySelector('h3')?.textContent || 'Etiquetas'));
    }
  }

  // ---- Índice da aba ---------------------------------------------------------------------------------------------
  let sumario, agendado = 0;
  function painelVisivel() { return [...document.querySelectorAll('#parametrosPagina [role=tabpanel]')].find(p => !p.hidden && !p.closest('[hidden]')); }
  function cardsDe(raiz) {
    return [...raiz.querySelectorAll('.pr-card, .escala-parametros-card, .ps > section')]
      .filter(c => !c.hidden && !c.parentElement.closest('.pr-card') && c.querySelector(':scope>h1,:scope>h2,:scope>h3'));
  }
  function nomeCard(c) { return c.dataset.prCard || c.querySelector(':scope>h1,:scope>h2,:scope>h3').textContent.trim(); }
  function atualizarSumario() {
    if (!sumario) return;
    const p = painelVisivel();
    const mostrar = v => { if (sumario.hidden !== !v) sumario.hidden = !v; };
    if (!p) { mostrar(false); return; }
    const grupos = [...p.querySelectorAll('.pr-grupo')];
    const blocos = grupos.length ? grupos.map(g => [g.dataset.prGrupo, cardsDe(g)]) : [['', cardsDe(p)]];
    const total = blocos.reduce((t, b) => t + b[1].length, 0);
    if (total < 2) { mostrar(false); if (sumario.innerHTML) sumario.innerHTML = ''; return; }
    blocos.forEach(([, cards]) => cards.forEach(c => { if (!c.id) c.id = 'pr-card-' + slug(nomeCard(c)); }));
    const html = '<span class="pr-sumario-rotulo">Nesta aba</span>' + blocos.filter(b => b[1].length).map(([g, cards]) =>
      '<div class="pr-sumario-grupo">' + (g ? '<strong>' + g + '</strong>' : '') + cards.map(c => '<a href="#' + c.id + '" data-ir="' + c.id + '">' + nomeCard(c) + '</a>').join('') + '</div>').join('');
    if (sumario.innerHTML !== html) sumario.innerHTML = html;
    mostrar(true);
  }
  function agendar() { cancelAnimationFrame(agendado); agendado = requestAnimationFrame(() => { const p = painelVisivel(); if (p) organizarPainel(p.id.replace('pr-painel-', '')); atualizarSumario(); }); }
  window.prParametrosAoTrocar = agendar;

  function iniciar() {
    const abas = document.querySelector('#parametrosPagina .pr-abas');
    if (!abas) return;
    sumario = document.createElement('nav');
    sumario.className = 'pr-sumario'; sumario.id = 'prSumario'; sumario.hidden = true;
    sumario.setAttribute('aria-label', 'Assuntos desta aba');
    abas.after(sumario);
    sumario.addEventListener('click', e => {
      const a = e.target.closest('[data-ir]'); if (!a) return;
      e.preventDefault();
      const alvo = document.getElementById(a.dataset.ir);
      alvo?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      alvo?.classList.remove('pr-card-destaque'); void alvo?.offsetWidth; alvo?.classList.add('pr-card-destaque');
    });
    new MutationObserver(agendar).observe(document.getElementById('parametrosPagina'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    agendar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
