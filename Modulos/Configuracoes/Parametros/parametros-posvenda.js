// Pós-venda (out/2026): regras das ligações e o formulário de múltipla escolha que o Comercial preenche.
// Tudo em posvenda_config.config (posvenda_config_salvar); sem nada salvo valem os padrões do banco (posvenda_padrao).
(function(){
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const novoId = p => p + Math.random().toString(36).slice(2, 8);
  window.carregarParametrosPosVenda = async function(host, empresa){
    const sb = window.supabaseClient;
    const pode = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') !== false;
    const { data: cfg0, error } = await sb.rpc('posvenda_cfg', { p_empresa: empresa });
    let cfg = cfg0 || {};
    const regras = document.createElement('section');
    regras.className = 'pr-card pr-posvenda-regras';
    const campo = (nome, rotulo, sufixo, ajuda) => '<label class="pr-pv-campo"><span>' + rotulo + '</span><span class="pr-pv-num"><input type="number" min="0" name="' + nome + '"' + (pode ? '' : ' disabled') + '>' + sufixo + '</span><small>' + ajuda + '</small></label>';
    regras.innerHTML = '<h3>Pós-venda: regras das ligações</h3><p class="pr-ajuda">Depois que o Financeiro confirma a Posição final, o pedido vira uma ligação para o cliente na tela Comercial &gt; Pós-venda.</p>'
      + '<form><div class="pr-pv-grade">'
      + campo('intervalo_dias', 'Intervalo mínimo entre contatos', 'dias', 'Não liga de novo para o mesmo cliente antes disso.')
      + campo('novo_ate_pedidos', 'Cliente novo até', 'pedido(s)', 'Cliente novo recebe a ligação logo, sem esperar o intervalo.')
      + campo('dias_apos_posicao', 'Ligar depois da Posição final', 'dia(s)', 'Quando a ligação aparece para o Comercial.')
      + campo('prazo_dias', 'Prazo para ligar', 'dia(s)', 'Depois disso a ligação fica atrasada.')
      + campo('tentar_dias', 'Não atendeu: tentar de novo em', 'dia(s)', '')
      + campo('max_tentativas', 'Máximo de tentativas', 'tentativa(s)', 'Depois fica "sem contato".')
      + '</div><div class="pr-opcoes"><label class="pr-check"><input type="checkbox" name="agrupar"' + (pode ? '' : ' disabled') + '><span>Uma ligação cobre todos os eventos do cliente desde o último contato</span></label>'
      + '<label class="pr-check"><input type="checkbox" name="observacao"' + (pode ? '' : ' disabled') + '><span>Campo livre de observação no fim do formulário</span></label></div>'
      + '<div class="pr-card-acoes"><span class="pr-card-status" role="status"></span>' + (pode ? '<button type="submit" class="btn primary">Salvar regras</button>' : '') + '</div></form>';
    const form = document.createElement('section');
    form.className = 'pr-card pr-posvenda-form';
    form.innerHTML = '<h3>Pós-venda: formulário da ligação</h3><p class="pr-ajuda">Perguntas de múltipla escolha que o Comercial marca na ligação. Marque como <b>ruim</b> as opções que precisam de atenção: o feedback com uma delas aparece em "Precisam de atenção".</p>'
      + '<div data-perguntas></div>' + (pode ? '<button type="button" class="btn" data-nova-pergunta>+ Pergunta</button>' : '')
      + '<div class="pr-card-acoes"><span class="pr-card-status" role="status"></span>' + (pode ? '<button type="button" class="btn primary" data-salvar-form>Salvar formulário</button>' : '') + '</div>';
    host.append(regras, form);
    if (error) { regras.querySelector('[role=status]').textContent = 'Não foi possível carregar: ' + error.message; return; }

    const fr = regras.querySelector('form');
    function preencherRegras(){
      ['intervalo_dias', 'novo_ate_pedidos', 'dias_apos_posicao', 'prazo_dias', 'tentar_dias', 'max_tentativas'].forEach(k => { fr.elements[k].value = cfg[k] ?? ''; });
      fr.elements.agrupar.checked = cfg.agrupar !== false; fr.elements.observacao.checked = cfg.observacao !== false;
    }
    let perguntas = JSON.parse(JSON.stringify(cfg.perguntas || []));
    const lista = form.querySelector('[data-perguntas]');
    function pintarPerguntas(){
      lista.innerHTML = perguntas.map((p, i) => '<div class="pr-pv-pergunta" data-i="' + i + '">'
        + '<div class="pr-pv-pergunta-topo"><input class="pr-pv-texto" data-k="texto" value="' + esc(p.texto) + '" placeholder="Pergunta"' + (pode ? '' : ' disabled') + '>'
        + '<select data-k="tipo"' + (pode ? '' : ' disabled') + '><option value="unica"' + (p.tipo !== 'multipla' ? ' selected' : '') + '>Uma resposta</option><option value="multipla"' + (p.tipo === 'multipla' ? ' selected' : '') + '>Várias respostas</option></select>'
        + '<label class="pr-pv-mini"><input type="checkbox" data-k="obrigatoria"' + (p.obrigatoria ? ' checked' : '') + (pode ? '' : ' disabled') + '> Obrigatória</label>'
        + (pode ? '<span class="pr-pv-ordem"><button type="button" data-subir="' + i + '" aria-label="Subir">↑</button><button type="button" data-descer="' + i + '" aria-label="Descer">↓</button><button type="button" data-remover-p="' + i + '" aria-label="Remover pergunta">×</button></span>' : '') + '</div>'
        + '<div class="pr-pv-opcoes">' + (p.opcoes || []).map((o, j) => '<span class="pr-pv-opcao' + (o.ruim ? ' is-ruim' : '') + '" data-j="' + j + '"><input data-o="texto" value="' + esc(o.texto) + '" placeholder="Opção"' + (pode ? '' : ' disabled') + '>'
          + '<label title="Resposta que precisa de atenção"><input type="checkbox" data-o="ruim"' + (o.ruim ? ' checked' : '') + (pode ? '' : ' disabled') + '> ruim</label>' + (pode ? '<button type="button" data-remover-o="' + j + '" aria-label="Remover opção">×</button>' : '') + '</span>').join('')
        + (pode ? '<button type="button" class="pr-pv-nova-op" data-nova-op>+ opção</button>' : '') + '</div></div>').join('');
    }
    function ler(){
      lista.querySelectorAll('.pr-pv-pergunta').forEach(div => {
        const p = perguntas[Number(div.dataset.i)];
        p.texto = div.querySelector('[data-k=texto]').value; p.tipo = div.querySelector('[data-k=tipo]').value; p.obrigatoria = div.querySelector('[data-k=obrigatoria]').checked;
        div.querySelectorAll('.pr-pv-opcao').forEach(sp => { const o = p.opcoes[Number(sp.dataset.j)]; o.texto = sp.querySelector('[data-o=texto]').value; o.ruim = sp.querySelector('[data-o=ruim]').checked; });
      });
    }
    preencherRegras(); pintarPerguntas();

    form.addEventListener('click', e => {
      const div = e.target.closest('.pr-pv-pergunta'), i = div ? Number(div.dataset.i) : -1;
      if (e.target.closest('[data-nova-pergunta]')) { ler(); perguntas.push({ id: novoId('p'), texto: '', tipo: 'unica', obrigatoria: true, opcoes: [{ id: novoId('o'), texto: '' }, { id: novoId('o'), texto: '' }] }); pintarPerguntas(); lista.lastElementChild?.querySelector('input')?.focus(); return; }
      if (e.target.closest('[data-nova-op]')) { ler(); perguntas[i].opcoes.push({ id: novoId('o'), texto: '' }); pintarPerguntas(); return; }
      const ro = e.target.closest('[data-remover-o]'); if (ro) { ler(); perguntas[i].opcoes.splice(Number(ro.dataset.removerO), 1); pintarPerguntas(); return; }
      if (e.target.closest('[data-remover-p]')) { ler(); perguntas.splice(i, 1); pintarPerguntas(); return; }
      if (e.target.closest('[data-subir]') && i > 0) { ler(); [perguntas[i - 1], perguntas[i]] = [perguntas[i], perguntas[i - 1]]; pintarPerguntas(); return; }
      if (e.target.closest('[data-descer]') && i < perguntas.length - 1) { ler(); [perguntas[i + 1], perguntas[i]] = [perguntas[i], perguntas[i + 1]]; pintarPerguntas(); return; }
    });
    form.addEventListener('change', e => { if (e.target.matches('[data-o=ruim]')) e.target.closest('.pr-pv-opcao').classList.toggle('is-ruim', e.target.checked); });

    async function salvar(novo, status){
      status.textContent = 'Salvando…';
      const { data, error: err } = await sb.rpc('posvenda_config_salvar', { p_empresa: empresa, p_config: novo });
      if (err) { status.textContent = err.message; return false; }
      cfg = data; status.textContent = 'Salvo'; return true;
    }
    fr.addEventListener('submit', async e => {
      e.preventDefault();
      const novo = { ...cfg };
      ['intervalo_dias', 'novo_ate_pedidos', 'dias_apos_posicao', 'prazo_dias', 'tentar_dias', 'max_tentativas'].forEach(k => { novo[k] = Number(fr.elements[k].value); });
      novo.agrupar = fr.elements.agrupar.checked; novo.observacao = fr.elements.observacao.checked;
      await salvar(novo, regras.querySelector('[role=status]'));
    });
    form.querySelector('[data-salvar-form]')?.addEventListener('click', async () => {
      ler();
      const limpas = perguntas.map(p => ({ ...p, texto: p.texto.trim(), opcoes: p.opcoes.filter(o => o.texto.trim()).map(o => ({ ...o, texto: o.texto.trim() })) }));
      if (await salvar({ ...cfg, perguntas: limpas }, form.querySelector('[role=status]'))) { perguntas = JSON.parse(JSON.stringify(cfg.perguntas)); pintarPerguntas(); }
    });
  };
})();
