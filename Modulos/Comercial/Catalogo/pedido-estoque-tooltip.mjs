// periodo(): { ini, fim } do pedido aberto — o quadro usa o MESMO período e a mesma conta do selo (operacao_livre_calc)
export function iniciarDetalhesEstoque({ supabase, empresa, data, pedido = () => null, periodo = () => null }) {
  const caixa = document.createElement('aside');
  caixa.id = 'pedidoEstoqueTooltip'; caixa.className = 'pedido-estoque-tooltip';
  caixa.setAttribute('role', 'tooltip'); caixa.hidden = true; document.body.append(caixa);
  const fixar = document.createElement('button');
  fixar.type = 'button'; fixar.className = 'pedido-estoque-fixar'; fixar.hidden = true;
  fixar.setAttribute('aria-label', 'Fixar quadro para consultar e rolar');
  fixar.setAttribute('aria-pressed', 'false'); fixar.setAttribute('aria-controls', caixa.id);
  fixar.title = 'Fixar quadro para consultar e rolar';
  fixar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-4 1-3 5v3l-3-3-5-3h3l5-3zM11 14l-7 7"/></svg>';
  document.body.append(fixar);
  let fixado = false;
  let ignorar = null;
  const cache = new Map();
  let alvo, timer, versao = 0;
  let ponteiro = null;
  const n = v => Number(v).toLocaleString('pt-BR');
  const dia = v => v ? v.slice(0,10).split('-').reverse().join('/') : '—';
  const linha = (texto, classe = '') => {
    const p = document.createElement('p'); p.textContent = texto; p.className = classe; caixa.append(p);
  };
  function fechar() {
    clearTimeout(timer); ++versao;
    alvo?.removeAttribute('aria-describedby');
    alvo = null; caixa.hidden = true; fixar.hidden = true; fixado = false;
    caixa.classList.remove('is-fixado'); caixa.setAttribute('role', 'tooltip');
    fixar.setAttribute('aria-pressed', 'false');
    fixar.setAttribute('aria-label', 'Fixar quadro para consultar e rolar');
    fixar.title = 'Fixar quadro para consultar e rolar';
  }
  fixar.addEventListener('click', () => {
    if(fixado) { ignorar = alvo; fechar(); return; }
    fixado = true; caixa.classList.add('is-fixado');
    caixa.setAttribute('role', 'dialog'); caixa.setAttribute('aria-label', 'Estoque e reservas');
    fixar.setAttribute('aria-pressed', 'true');
    fixar.setAttribute('aria-label', 'Desafixar e fechar quadro'); fixar.title = 'Desafixar e fechar quadro';
    posicionar();
  });
  function posicionar() {
    if (!alvo?.isConnected) { fechar(); return; }
    const r = alvo.getBoundingClientRect();
    const x = ponteiro?.x ?? r.left;
    const y = ponteiro?.y ?? r.bottom;
    const margem = 12;
    const esquerda = x + margem + caixa.offsetWidth <= innerWidth - 8 ? x + margem : x - caixa.offsetWidth - margem;
    const topo = y + margem + caixa.offsetHeight <= innerHeight - 8 ? y + margem : y - caixa.offsetHeight - margem;
    caixa.style.left = `${Math.max(8, Math.min(esquerda, innerWidth - caixa.offsetWidth - 8))}px`;
    caixa.style.top = `${Math.max(8, Math.min(topo, innerHeight - caixa.offsetHeight - 8))}px`;
    if(!fixado) {
      fixar.style.left = `${Math.max(2, Math.min(x - 13, innerWidth - 28))}px`;
      fixar.style.top = `${Math.max(2, Math.min(y - 13, innerHeight - 28))}px`;
    }
    fixar.hidden = false;
  }
  async function abrir(card) {
    const selo = card.closest('[data-stock-item]');
    const id = selo?.dataset.stockItem, dataAtual = data(), empresaAtual = empresa(), pedidoAtual = pedido(), per = periodo();
    if (!id || !empresaAtual) return;
    alvo = card; const atual = ++versao;
    caixa.replaceChildren(); linha('Consultando reservas…'); caixa.hidden = false;
    card.setAttribute('aria-describedby', caixa.id); posicionar();
    try {
      const chave = `${empresaAtual}:${id}:${dataAtual}:${pedidoAtual || ""}:${per?.ini || ""}:${per?.fim || ""}`;
      if (!cache.has(chave) || cache.get(chave).ate < Date.now()) {
        const promessa = supabase.rpc('pedido_estoque_detalhes', { p_empresa_id: empresaAtual, p_item_id: id, p_data: dataAtual, p_pedido: pedidoAtual, p_inicio: per?.ini || null, p_fim: per?.fim || null })
          .then(({data, error}) => { if(error) throw error; return data; });
        cache.set(chave, { promessa, ate: Date.now() + 60000 });
        promessa.catch(() => cache.delete(chave));
      }
      const resultado = await cache.get(chave).promessa;
      if (atual !== versao || alvo !== card) return;
      const ini = resultado?.inicio || dataAtual, fim = resultado?.fim || ini;
      caixa.replaceChildren(); linha(fim !== ini ? `Estoque e reservas de ${dia(ini)} a ${dia(fim)}` : `Estoque e reservas em ${dia(ini)}`, 'pedido-estoque-titulo');
      const componentes = resultado?.componentes || [];
      if (!componentes.length) linha('Nenhum detalhe de estoque encontrado. Atualize o catálogo para conferir.');
      for (const c of componentes) {
        const cabecalho = document.createElement('div');
        cabecalho.className = 'pedido-estoque-componente-linha';
        const nome = document.createElement('p');
        nome.className = 'pedido-estoque-componente';
        nome.textContent = `${c.codigo || ''} · ${c.nome}`;
        const identidade = document.createElement('div');
        identidade.className = 'pedido-estoque-identidade';
        const foto = document.createElement('span');
        foto.className = 'pedido-estoque-foto'; foto.textContent = 'Sem foto';
        if(c.foto_url) {
          try {
            const url = new URL(c.foto_url, location.href);
            if(['http:', 'https:'].includes(url.protocol)) {
              const img = document.createElement('img'); img.alt = ''; img.src = url.href;
              img.addEventListener('error', () => { foto.textContent = 'Sem foto'; }, {once:true});
              foto.replaceChildren(img);
            }
          } catch {}
        }
        identidade.append(foto, nome); cabecalho.append(identidade);
        const resumo = document.createElement('dl');
        resumo.className = 'pedido-estoque-numeros';
        // soma de todos os pedidos que reservam o item nesta data (a lista está logo abaixo)
        const somaSit = (pre) => (c.pedidos || []).filter(p => (p.situacao === 'pre_reserva') === pre).reduce((s, p) => s + Number(p.quantidade || 0), 0);
        const reservas = `${n(somaSit(false))} / ${n(somaSit(true))}`;
        for (const [titulo, valor] of [['Necessário', c.necessario], ['Estoque', c.estoque], ['Manutenção', c.manutencao], ['Reservado / Pré-reserva', reservas], ['Livre', c.livre]]) {
          const coluna = document.createElement('div');
          const rotulo = document.createElement('dt'); rotulo.textContent = titulo;
          const numero = document.createElement('dd'); numero.textContent = typeof valor === 'string' ? valor : n(valor);
          if (titulo.startsWith('Reservado')) { coluna.classList.add('pedido-estoque-reservas'); coluna.title = 'Reservado (pedidos reservados, enviados e finalizados) / Pré-reserva, somando todos os pedidos da lista abaixo'; }
          if ((titulo === 'Estoque' || titulo === 'Livre') && Number(valor) < Number(c.necessario)) {
            coluna.classList.add('pedido-estoque-insuficiente');
            rotulo.style.setProperty('color', '#b91c1c', 'important');
            numero.style.setProperty('color', '#b91c1c', 'important');
          }
          coluna.append(rotulo, numero); resumo.append(coluna);
        }
        cabecalho.append(resumo); caixa.append(cabecalho);
        if (Number(c.estoque) < Number(c.necessario)) linha('Estoque cadastrado insuficiente para montar uma unidade.');
        if (c.bloqueio_contagem) linha('Bloqueado: teve divergência de contagem num evento e aguarda a contagem geral em Estoque > Gestão do acervo. Até lá não entra em novas reservas (Parâmetros > Divergências de contagem).', 'pedido-estoque-aviso-bloqueio');
        if (!c.pedidos?.length && !Number(c.bloqueado)) linha(fim !== ini ? 'Sem reservas no período.' : 'Sem reservas para esta data.');
        if (c.pedidos?.length) {
          const rolagem = document.createElement('div');
          rolagem.className = 'pedido-estoque-tabela-wrap';
          const tabela = document.createElement('table');
          tabela.className = 'pedido-estoque-tabela';
          tabela.setAttribute('aria-label', `Reservas de ${c.nome}`);
          const cabecalho = tabela.createTHead().insertRow();
          for (const titulo of ['Cliente', 'Data do evento', 'Pedido', 'Local', 'Qtd.', 'Período reservado']) {
            const th = document.createElement('th'); th.scope = 'col'; th.textContent = titulo; cabecalho.append(th);
          }
          const corpo = tabela.createTBody();
          const situacoes = { pre_reserva:'Pré-reserva', aprovado:'Reservado', enviado:'Enviado', finalizado:'Finalizado' };
          for (const p of c.pedidos) {
            const tr = corpo.insertRow(); tr.className = 'pedido-estoque-reserva';
            const proprio = p.pedido_id === window.parent.__PEDIDO_ATUAL_ID ? ' (este pedido)' : '';
            const valores = [p.cliente || '—', dia(p.evento), `${p.numero}${proprio}`, p.local || 'Não informado', n(p.quantidade), `${dia(p.inicio)} até ${dia(p.fim)}`];
            for (const valor of valores) tr.insertCell().textContent = valor;
            if(p.situacao) {
              const status = document.createElement('small'); status.textContent = situacoes[p.situacao] || p.situacao;
              tr.cells[2].append(status);
            }
          }
          rolagem.append(tabela); caixa.append(rolagem);
        }
        const motivos = { avaria:'Avaria', limpeza:'Limpeza', manutencao:'Manutenção' };
        for (const b of c.bloqueios || []) linha(`${motivos[b.motivo] || b.motivo}: ${n(b.quantidade)} unidade(s)${b.numero ? ` · Pedido ${b.numero}` : ''}`);
      }
      posicionar();
    } catch (e) {
      if (atual !== versao) return;
      caixa.replaceChildren(); linha(`Não foi possível consultar: ${e.message || 'tente novamente'}`); posicionar();
    }
  }
  function entrar(e) {
    if(fixado || fixar.contains(e.target)) return;
    if(e.type === 'focusin') ponteiro = null;
    else ponteiro = { x: e.clientX, y: e.clientY };
    const card = e.target.closest?.('[data-stock-item] .is-estoque, [data-stock-item] .is-esgotado, [data-stock-item] .is-livre');
    if (!card || card === alvo || card === ignorar) return;
    fechar(); alvo = card; timer = setTimeout(() => abrir(card), 180);
  }
  document.addEventListener('pointerover', entrar);
  document.addEventListener('pointermove', e => {
    if(ignorar && !ignorar.contains(e.target) && !fixar.contains(e.target)) ignorar = null;
    if (fixado || !alvo?.contains(e.target)) return;
    ponteiro = { x: e.clientX, y: e.clientY };
    if (!caixa.hidden) posicionar();
  });
  document.addEventListener('focusin', entrar);
  document.addEventListener('pointerout', e => {
    if (fixado || alvo?.contains(e.relatedTarget) || fixar.contains(e.relatedTarget)) return;
    if (alvo?.contains(e.target)) fechar();
  });
  fixar.addEventListener('pointerleave', e => { if(!fixado && !alvo?.contains(e.relatedTarget)) fechar(); });
  document.addEventListener('focusout', e => { if (!fixado && !fixar.contains(e.relatedTarget) && (alvo?.contains(e.target) || fixar.contains(e.target)) && !alvo?.contains(e.relatedTarget)) fechar(); });
  document.documentElement.addEventListener('pointerleave', () => { if(!fixado) fechar(); });
  window.addEventListener('blur', () => { if(!fixado) fechar(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') fechar(); });
  window.addEventListener('scroll', e => { if(!fixado && !caixa.contains(e.target)) fechar(); }, { capture: true, passive: true });
  window.addEventListener('resize', () => { if(fixado) posicionar(); else fechar(); });
}
