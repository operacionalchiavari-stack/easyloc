/* Comentário da conta: mesmo registro no Financeiro, Comercial e Compras.
   Interação baseada na Tecnoweld: balão na linha, prévia flutuante e editor abaixo. */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icone = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  const assinantes = new Set();
  let canal;
  try { canal = new BroadcastChannel('fin-comentarios'); canal.onmessage = e => assinantes.forEach(fn => fn(e.data)); } catch (_) {}
  function botao(t, tipo) {
    return '<button type="button" class="fin-com' + (t.comentario ? ' tem' : '') + '" data-fin-com="' + esc(tipo + ':' + t.id) + '" aria-label="' + (t.comentario ? 'Ver ou editar comentário' : 'Adicionar comentário') + '" title="' + (t.comentario ? 'Ver ou editar comentário' : 'Adicionar comentário') + '">' + icone + '</button>';
  }
  function ligar(raiz, op) {
    if (!raiz || raiz.dataset.comentariosLigados) return;
    raiz.dataset.comentariosLigados = '1';
    let previa, editor;
    const fecharPrevia = () => { previa?.remove(); previa = null; };
    const atualizar = (tipo, id, dados) => {
      const t = op.obter(tipo, id); if (!t) return;
      Object.assign(t, dados);
      raiz.querySelectorAll('[data-fin-com]').forEach(b => { if (b.dataset.finCom === tipo + ':' + id) b.outerHTML = botao(t, tipo); });
      fecharPrevia();
    };
    assinantes.add(async msg => {
      if (!msg || !['receber','pagar'].includes(msg.tipo)) return;
      try { const ctx = await op.contexto(); if (msg.empresa === ctx.empresa) atualizar(msg.tipo, msg.id, msg.dados); } catch (_) {}
    });
    const mostrarPrevia = b => {
      fecharPrevia();
      const [tipo, id] = b.dataset.finCom.split(':'), t = op.obter(tipo, id);
      if (!t?.comentario) return;
      previa = document.createElement('div'); previa.className = 'fin-com-card'; previa.setAttribute('role', 'tooltip');
      const nome = t.comentario_nome || 'Comentário';
      const iniciais = nome.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase();
      previa.innerHTML = '<div class="fin-com-quem"><span class="fin-com-avatar" aria-hidden="true">' + esc(iniciais) + '</span><span class="fin-com-identidade"><b>' + esc(nome) + '</b>' + (t.comentario_em ? '<small>' + esc(new Date(t.comentario_em).toLocaleString('pt-BR')) + '</small>' : '') + '</span></div><div class="fin-com-texto">' + esc(t.comentario) + '</div>';
      document.body.append(previa);
      const card = previa;
      // A foto é de quem escreveu, pelo usuário gravado na conta, e não de quem está lendo.
      if (t.comentario_por) (async () => {
        try {
          const {sb, empresa} = await op.contexto();
          if (previa !== card || !card.isConnected) return;
          const foto = sb.storage.from('avatares').getPublicUrl(empresa + '/' + t.comentario_por + '.jpg').data?.publicUrl;
          if (!foto || !['http:', 'https:'].includes(new URL(foto).protocol)) return;
          const img = document.createElement('img'); img.alt = 'Foto de ' + nome;
          img.onerror = () => img.remove(); img.src = foto;
          card.querySelector('.fin-com-avatar').append(img);
        } catch (_) {}
      })();
      const r = b.getBoundingClientRect(), w = previa.offsetWidth, h = previa.offsetHeight;
      previa.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
      previa.style.top = Math.max(8, r.bottom + h + 6 > innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
    };
    raiz.addEventListener('mouseover', e => { const b = e.target.closest('[data-fin-com]'); if (b && !b.contains(e.relatedTarget)) mostrarPrevia(b); });
    raiz.addEventListener('mouseout', e => { const b = e.target.closest('[data-fin-com]'); if (b && !b.contains(e.relatedTarget)) fecharPrevia(); });
    raiz.addEventListener('focusin', e => { const b = e.target.closest('[data-fin-com]'); if (b) mostrarPrevia(b); });
    raiz.addEventListener('focusout', fecharPrevia);
    document.addEventListener('scroll', fecharPrevia, true);
    window.addEventListener('resize', fecharPrevia);
    new MutationObserver(() => { if (previa && !raiz.querySelector('[data-fin-com]:hover,[data-fin-com]:focus')) fecharPrevia(); }).observe(raiz, {childList:true, subtree:true});
    raiz.addEventListener('click', e => {
      const b = e.target.closest('[data-fin-com]'); if (!b) return;
      e.preventDefault(); e.stopPropagation(); fecharPrevia();
      if (editor?.dataset.salvando === '1') return;
      const [tipo, id] = b.dataset.finCom.split(':'), t = op.obter(tipo, id), tr = b.closest('tr');
      if (!t || !tr) return;
      editor?.remove();
      const ed = document.createElement('tr'); editor = ed; ed.className = 'fin-com-ed';
      const versao = t.comentario_em || null;
      ed.innerHTML = '<td colspan="' + tr.children.length + '"><div class="fin-com-caixa"><label>Comentário<textarea maxlength="1000" rows="3" placeholder="Ex.: aguardando boleto; cliente pediu prorrogação">' + esc(t.comentario || '') + '</textarea></label><p class="fin-erro" role="alert"></p><div class="fin-com-acoes">' + (t.comentario ? '<button type="button" class="fin-btn peq claro" data-com-del>Apagar</button>' : '') + '<span class="fin-esp"></span><button type="button" class="fin-btn peq claro" data-com-x>Cancelar</button><button type="button" class="fin-btn peq" data-com-ok>Salvar</button></div></div></td>';
      tr.after(ed);
      const ta = ed.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      const fechar = () => { ed.remove(); raiz.querySelectorAll('[data-fin-com]').forEach(btn => { if (btn.dataset.finCom === tipo + ':' + id) btn.focus(); }); };
      const salvar = async texto => {
        if (ed.dataset.salvando === '1') return;
        ed.dataset.salvando = '1'; ed.querySelectorAll('button,textarea').forEach(el => el.disabled = true);
        ed.querySelector('.fin-erro').textContent = '';
        try {
          const ctx = await op.contexto();
          const r = await ctx.sb.rpc('fin_titulo_comentar', {p_empresa:ctx.empresa, p_tipo:tipo, p_id:id, p_texto:texto, p_versao:versao});
          if (r.error) throw r.error;
          atualizar(tipo, id, r.data); fechar();
          const msg = {empresa:ctx.empresa, tipo, id, dados:r.data};
          canal?.postMessage(msg); assinantes.forEach(fn => fn(msg));
        } catch (erro) { ed.querySelector('.fin-erro').textContent = erro.message || 'Não foi possível salvar o comentário.'; }
        finally { ed.dataset.salvando = ''; ed.querySelectorAll('button,textarea').forEach(el => el.disabled = false); }
      };
      ed.querySelector('[data-com-ok]').onclick = () => salvar(ta.value.trim());
      ed.querySelector('[data-com-del]')?.addEventListener('click', () => salvar(''));
      ed.querySelector('[data-com-x]').onclick = fechar;
      ed.addEventListener('keydown', ev => {
        if (ed.dataset.salvando === '1') return;
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fechar(); }
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); salvar(ta.value.trim()); }
      });
    }, true);
  }
  window.FinanceiroComentarios = {botao, ligar};
})();
