/* Parâmetros > Comercial: etiquetas dos cadastros de Clientes e Locais (out/2026).
   Cada cadastro tem grupos (Estilo, Canal, Horário...) com opções; grava em cadastro_etiquetas.
   A chave do grupo é o nome gravado no cadastro (tags.estilo...): nasce do título e não muda depois. */
(function () {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const CADASTROS = [['cliente', 'Etiquetas do cadastro de clientes', 'Grupos de opções que aparecem no cadastro de cada cliente (estilo, canal, horário…). "Estilo" e "Orçamento" também viram filtros da lista de clientes.'],
    ['local', 'Etiquetas do cadastro de locais', 'Grupos de opções do cadastro de locais. "Tipo" e "Orçamento" também viram filtros da lista. Em "Observações", as opções com baldeação, escada, elevador e caminhão perto continuam marcando essas condições no pedido.']];
  const CORES = [['azul', 'Azul'], ['verde', 'Verde'], ['amarelo', 'Amarelo'], ['laranja', 'Laranja'], ['vermelho', 'Vermelho']];
  const chaveDe = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'grupo';
  const estado = { empresaId: null, dados: {} };

  function grupoHtml(g, i) {
    return '<fieldset class="pe-grupo" data-i="' + i + '"><div class="pe-grupo-topo">' +
      '<input class="pe-titulo" type="text" value="' + esc(g.titulo) + '" aria-label="Nome do grupo" maxlength="40">' +
      '<select class="pe-cor" aria-label="Cor">' + CORES.map(([v, r]) => '<option value="' + v + '"' + (v === g.cor ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
      '<select class="pe-unica" aria-label="Quantas podem ser marcadas"><option value="1"' + (g.unica ? ' selected' : '') + '>Escolhe uma</option><option value="0"' + (g.unica ? '' : ' selected') + '>Escolhe várias</option></select>' +
      '<label class="pe-obrig"><input type="checkbox" class="pe-obrigatoria"' + (g.obrigatoria === false ? '' : ' checked') + '> Obrigatório</label>' +
      '<span class="pe-mover"><button type="button" class="pe-btn" data-acao="subir" title="Subir" aria-label="Subir grupo">↑</button><button type="button" class="pe-btn" data-acao="descer" title="Descer" aria-label="Descer grupo">↓</button></span>' +
      '<button type="button" class="pe-btn pe-perigo" data-acao="remover-grupo" title="Excluir grupo" aria-label="Excluir grupo">Excluir</button></div>' +
      '<div class="pe-opcoes tag-group ' + esc(g.cor) + '">' + (g.opcoes || []).map((o, j) => '<span class="tag selected pe-opcao">' + esc(o) + '<button type="button" data-acao="remover-opcao" data-j="' + j + '" aria-label="Tirar ' + esc(o) + '">×</button></span>').join('') +
      '<input class="pe-nova" type="text" placeholder="+ Nova opção (Enter)" maxlength="40" aria-label="Nova opção em ' + esc(g.titulo) + '"></div></fieldset>';
  }

  function desenhar(section, cadastro) {
    const grupos = estado.dados[cadastro];
    section.querySelector('.pe-grupos').innerHTML = grupos.length ? grupos.map(grupoHtml).join('') : '<p class="pr-ajuda">Nenhum grupo. O cadastro fica sem etiquetas.</p>';
  }

  // Lê o que está digitado na tela para o estado (título, cor, uma/várias, obrigatório).
  function lerTela(section, cadastro) {
    section.querySelectorAll('.pe-grupo').forEach(f => {
      const g = estado.dados[cadastro][+f.dataset.i];
      g.titulo = f.querySelector('.pe-titulo').value.trim();
      g.cor = f.querySelector('.pe-cor').value;
      g.unica = f.querySelector('.pe-unica').value === '1';
      g.obrigatoria = f.querySelector('.pe-obrigatoria').checked;
      const nova = f.querySelector('.pe-nova').value.trim();
      if (nova && !g.opcoes.includes(nova)) g.opcoes.push(nova);
    });
  }

  window.carregarEtiquetasCadastro = async (host, empresaId) => {
    estado.empresaId = empresaId;
    const { data, error } = await window.supabaseClient.from('cadastro_etiquetas').select('cadastro,grupos').eq('empresa_id', empresaId);
    if (error) {
      const aviso = document.createElement('section'); aviso.className = 'pr-card'; aviso.id = 'etiquetasCadastroParametros'; aviso.dataset.indisponivel = 'true';
      aviso.textContent = 'As etiquetas dos cadastros aguardam atualização do banco.'; host.append(aviso); return;
    }
    CADASTROS.forEach(([cadastro, titulo, ajuda]) => {
      estado.dados[cadastro] = JSON.parse(JSON.stringify((data || []).find(r => r.cadastro === cadastro)?.grupos || []));
      const section = document.createElement('section');
      section.className = 'pr-card pe-card'; section.dataset.etiquetasCadastro = cadastro;
      if (cadastro === 'cliente') section.id = 'etiquetasCadastroParametros';
      section.innerHTML = '<h3>' + titulo + '</h3><p class="pr-ajuda">' + ajuda + '</p><div class="pe-grupos"></div><button type="button" class="btn secondary pe-add-grupo" data-acao="novo-grupo">+ Novo grupo</button>';
      desenhar(section, cadastro);
      section.addEventListener('click', ev => {
        const b = ev.target.closest('[data-acao]'); if (!b) return;
        lerTela(section, cadastro);
        const grupos = estado.dados[cadastro], i = +b.closest('.pe-grupo')?.dataset.i;
        if (b.dataset.acao === 'novo-grupo') grupos.push({ chave: '', titulo: 'Novo grupo', cor: 'azul', unica: false, obrigatoria: false, opcoes: [] });
        if (b.dataset.acao === 'remover-grupo' && confirm('Excluir o grupo "' + grupos[i].titulo + '"? O que já foi marcado nos cadastros continua guardado, só não aparece mais para marcar.')) grupos.splice(i, 1);
        if (b.dataset.acao === 'remover-opcao') grupos[i].opcoes.splice(+b.dataset.j, 1);
        if (b.dataset.acao === 'subir' && i > 0) grupos.splice(i - 1, 0, grupos.splice(i, 1)[0]);
        if (b.dataset.acao === 'descer' && i < grupos.length - 1) grupos.splice(i + 1, 0, grupos.splice(i, 1)[0]);
        desenhar(section, cadastro);
        if (b.dataset.acao === 'novo-grupo') section.querySelector('.pe-grupo:last-child .pe-titulo')?.select();
      });
      section.addEventListener('keydown', ev => {
        if (!ev.target.matches('.pe-nova') || ev.key !== 'Enter') return;
        ev.preventDefault();
        const i = +ev.target.closest('.pe-grupo').dataset.i;
        lerTela(section, cadastro); desenhar(section, cadastro);
        section.querySelector('.pe-grupo[data-i="' + i + '"] .pe-nova')?.focus();
      });
      section.addEventListener('change', ev => { if (ev.target.matches('.pe-cor')) { lerTela(section, cadastro); desenhar(section, cadastro); } });
      host.append(section);
    });
  };

  window.salvarEtiquetasCadastro = async empresaId => {
    const sections = [...document.querySelectorAll('[data-etiquetas-cadastro]')];
    if (!sections.length) { if (document.getElementById('etiquetasCadastroParametros')?.dataset.indisponivel) return; throw Error('Reabra a aba Comercial antes de salvar.'); }
    for (const section of sections) {
      const cadastro = section.dataset.etiquetasCadastro;
      lerTela(section, cadastro);
      const grupos = estado.dados[cadastro], usadas = new Set();
      grupos.forEach(g => {
        if (!g.titulo) throw Error('Dê um nome a todos os grupos (' + (cadastro === 'cliente' ? 'clientes' : 'locais') + ').');
        if (!g.opcoes.length) throw Error('O grupo "' + g.titulo + '" precisa de pelo menos uma opção.');
        if (!g.chave) { let k = chaveDe(g.titulo), n = 2; while (grupos.some(x => x !== g && x.chave === k)) k = chaveDe(g.titulo) + '_' + n++; g.chave = k; }
        if (usadas.has(g.chave)) throw Error('Há dois grupos com o mesmo nome interno: ' + g.titulo + '.');
        usadas.add(g.chave);
      });
      const { error } = await window.supabaseClient.from('cadastro_etiquetas').upsert({ empresa_id: empresaId, cadastro, grupos, atualizado_em: new Date().toISOString() }, { onConflict: 'empresa_id,cadastro' });
      if (error) throw error;
      desenhar(section, cadastro);
    }
  };
})();
