// Motivos de cancelamento do pedido e papéis das equipes de clientes (out/2026): a lista que aparece na janela "Cancelar pedido" do Comercial.
// Tabela comercial_motivos_cancelamento (grava quem tem configuracoes.empresa.editar). Motivo já usado em pedidos
// não é apagado de verdade: fica desativado, para o relatório de cancelamentos continuar mostrando o nome.
(function(){
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // card de lista simples (incluir, renomear, ordem, "Aparece"); usado também pelos papéis das equipes de clientes
  async function cardLista(host, empresa, cfg){
    const T = cfg.tabela;
    const sb = window.supabaseClient;
    const pode = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') !== false;
    const card = document.createElement('section');
    card.className = 'pr-card ' + cfg.classe;
    card.innerHTML = '<h3>' + cfg.titulo + '</h3><p class="pr-ajuda">' + cfg.ajuda + '</p>'
      + '<div data-lista></div>'
      + (pode ? '<form class="pr-mc-novo" data-novo><input name="nome" maxlength="' + cfg.max + '" placeholder="' + esc(cfg.placeholder) + '" required>' + (cfg.descricao ? '<input name="descricao" maxlength="160" placeholder="Explicação curta (opcional)">' : '') + '<button type="submit" class="btn">+ Incluir</button></form>' : '')
      + '<div class="pr-card-acoes"><span class="pr-card-status" role="status"></span></div>';
    host.append(card);
    const status = card.querySelector('[role=status]'), lista = card.querySelector('[data-lista]');
    const aviso = (t, erro) => { status.textContent = t; status.classList.toggle('erro', !!erro); };
    let motivos = [];
    async function carregar(){
      const { data, error } = await sb.from(T).select('*').eq('empresa_id', empresa).order('ordem').order('nome');
      if (error) { aviso('Não foi possível carregar: ' + error.message, true); return; }
      motivos = data || [];
      pintar();
    }
    function pintar(){
      lista.innerHTML = motivos.length ? '<ul class="pr-mc-lista">' + motivos.map((m, i) => '<li class="' + (m.ativo ? '' : 'inativo') + '" data-id="' + m.id + '">'
        + '<span class="pr-mc-ordem">' + (pode ? '<button type="button" data-subir aria-label="Subir"' + (i ? '' : ' disabled') + '>↑</button><button type="button" data-descer aria-label="Descer"' + (i < motivos.length - 1 ? '' : ' disabled') + '>↓</button>' : '') + '</span>'
        + '<span class="pr-mc-texto"><input data-nome value="' + esc(m.nome) + '" maxlength="' + cfg.max + '" aria-label="Nome"' + (pode ? '' : ' disabled') + '>' + (cfg.descricao ? '<input data-descricao value="' + esc(m.descricao || '') + '" maxlength="160" placeholder="Explicação curta" aria-label="Explicação"' + (pode ? '' : ' disabled') + '>' : '') + '</span>'
        + (pode ? '<label class="pr-check"><input type="checkbox" data-ativo' + (m.ativo ? ' checked' : '') + '><span>Aparece</span></label>' : (m.ativo ? '' : '<small>desativado</small>'))
        + '</li>').join('') + '</ul>' : '<p class="pr-ajuda">' + cfg.vazio + '</p>';
    }
    async function salvar(id, campos, ok){
      const { error } = await sb.from(T).update(campos).eq('id', id).eq('empresa_id', empresa);
      if (error) { aviso(/duplicate|unique/i.test(error.message) ? cfg.repetido : 'Não foi possível salvar: ' + error.message, true); await carregar(); return; }
      Object.assign(motivos.find(m => m.id === id) || {}, campos);
      aviso(ok || 'Salvo.');
    }
    lista.addEventListener('change', async e => {
      const li = e.target.closest('li[data-id]'); if (!li) return;
      const id = li.dataset.id;
      if (e.target.matches('[data-nome]')) {
        const v = e.target.value.trim();
        if (v.length < cfg.min) { aviso(cfg.curto, true); e.target.value = motivos.find(m => m.id === id)?.nome || ''; return; }
        await salvar(id, { nome: v }, 'Renomeado.');
      } else if (e.target.matches('[data-descricao]')) await salvar(id, { descricao: e.target.value.trim() || null });
      else if (e.target.matches('[data-ativo]')) { await salvar(id, { ativo: e.target.checked }, e.target.checked ? 'Volta a aparecer.' : cfg.someTexto); li.classList.toggle('inativo', !e.target.checked); }
    });
    lista.addEventListener('click', async e => {
      const b = e.target.closest('[data-subir],[data-descer]'); if (!b) return;
      const i = motivos.findIndex(m => m.id === b.closest('li').dataset.id), j = b.hasAttribute('data-subir') ? i - 1 : i + 1;
      if (j < 0 || j >= motivos.length) return;
      [motivos[i], motivos[j]] = [motivos[j], motivos[i]];
      pintar();
      const r = await Promise.all(motivos.map((m, k) => sb.from(T).update({ ordem: k + 1 }).eq('id', m.id).eq('empresa_id', empresa)));
      const erro = r.find(x => x.error); aviso(erro ? 'Não foi possível salvar a ordem: ' + erro.error.message : 'Ordem salva.', !!erro);
    });
    card.querySelector('[data-novo]')?.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, nome = f.nome.value.trim();
      if (nome.length < cfg.min) { aviso(cfg.curto, true); return; }
      const ordem = Math.max(0, ...motivos.filter(m => m.ordem < 99).map(m => m.ordem)) + 1;
      const { error } = await sb.from(T).insert(Object.assign({ empresa_id: empresa, nome, ordem }, cfg.descricao ? { descricao: f.descricao.value.trim() || null } : {}));
      if (error) { aviso(/duplicate|unique/i.test(error.message) ? cfg.repetido : 'Não foi possível incluir: ' + error.message, true); return; }
      f.reset(); aviso('Incluído.'); await carregar();
    });
    await carregar();
  }
  window.carregarMotivosCancelamento = (host, empresa) => cardLista(host, empresa, {
    tabela: 'comercial_motivos_cancelamento', titulo: 'Motivos de cancelamento do pedido', descricao: true, max: 80, min: 3,
    ajuda: 'Aparecem na janela "Cancelar pedido" do Comercial. O motivo é obrigatório para cancelar e alimenta o relatório Comercial &gt; Cancelamentos.',
    placeholder: 'Novo motivo (ex.: Orçamento acima do previsto)', vazio: 'Nenhum motivo cadastrado.', repetido: 'Já existe um motivo com esse nome.',
    curto: 'O motivo precisa de pelo menos 3 letras.', someTexto: 'Motivo não aparece mais no cancelamento.', classe: 'pr-motivos-cancel' });
  // Papéis das pessoas nas equipes de clientes (Cadastro de Clientes > Equipes)
  window.carregarPapeisEquipe = (host, empresa) => cardLista(host, empresa, {
    tabela: 'clientes_equipe_papeis', titulo: 'Papéis nas equipes de clientes', descricao: false, max: 60, min: 2, classe: 'pr-papeis-equipe',
    ajuda: 'Usados no Cadastro de Clientes &gt; Equipes para dizer o que cada pessoa faz na equipe (ex.: Titular, Assistente, Sócio(a)).',
    placeholder: 'Novo papel (ex.: Produtora)', vazio: 'Nenhum papel cadastrado.', repetido: 'Já existe um papel com esse nome.',
    curto: 'O papel precisa de pelo menos 2 letras.', someTexto: 'Papel não aparece mais para escolher.' });
})();
