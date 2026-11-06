/* Parâmetros > Comercial > "Acompanhamento de orçamentos" (nov/2026): com quantos dias depois do orçamento enviado
   (e de cada acompanhamento) deve ser o próximo contato, e os motivos de o cliente ainda não estar fechando.
   Usados pela Central de Pedidos (abas Pré-reserva, Orçamento e Catálogo). Banco: comercial_followup_config_salvar. */
(function () {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  window.carregarParametrosAcompanhamento = async (host, empresa) => {
    const sb = window.supabaseClient;
    const pode = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') !== false;
    const card = document.createElement('section');
    card.className = 'pr-card pr-acompanhamento';
    card.innerHTML = '<h3>Acompanhamento de orçamentos</h3><p class="pr-ajuda">Orçamentos, pré-reservas e pedidos do catálogo: o "orçamento enviado" é registrado sozinho e o próximo contato fica marcado para alguns dias depois. A cada acompanhamento, o Comercial escolhe o motivo de o cliente ainda não ter fechado e marca a próxima data.</p><p role="status">Carregando…</p>';
    host.append(card);
    let cfg;
    try {
      const { data, error } = await sb.rpc('comercial_followup_lista', { p_empresa: empresa });
      if (error) throw error;
      cfg = data?.config || { dias: 3, motivos: [] };
    } catch (e) { card.querySelector('[role=status]').textContent = 'Não foi possível carregar: ' + (e.message || e); return; }
    let motivos = [...(cfg.motivos || [])];
    card.querySelector('[role=status]').remove();
    const corpo = document.createElement('div');
    corpo.innerHTML = '<label class="pr-campo" style="max-width:320px">Dias até o próximo contato<input type="number" min="1" max="90" name="dias" value="' + esc(cfg.dias || 3) + '"' + (pode ? '' : ' disabled') + '></label>'
      + '<h4 style="margin:16px 0 6px">Motivos de o cliente ainda não ter fechado</h4><div data-lista></div>'
      + (pode ? '<form class="pr-mc-novo" data-novo><input name="nome" maxlength="100" placeholder="Novo motivo (ex.: Achou o valor alto)" required><button type="submit" class="btn">+ Incluir</button></form>' : '')
      + '<div class="pr-card-acoes">' + (pode ? '<button type="button" class="btn btn-primary" data-salvar>Salvar</button>' : '') + '<span class="pr-card-status" role="status"></span></div>';
    card.append(corpo);
    const lista = corpo.querySelector('[data-lista]'), status = corpo.querySelector('[role=status]');
    const aviso = (t, erro) => { status.textContent = t; status.classList.toggle('erro', !!erro); };
    function pintar() {
      lista.innerHTML = motivos.length ? '<ul class="pr-mc-lista">' + motivos.map((m, i) => '<li data-i="' + i + '"><span class="pr-mc-ordem">' + (pode ? '<button type="button" data-subir aria-label="Subir"' + (i ? '' : ' disabled') + '>↑</button><button type="button" data-descer aria-label="Descer"' + (i < motivos.length - 1 ? '' : ' disabled') + '>↓</button>' : '') + '</span><span class="pr-mc-texto"><input data-nome value="' + esc(m) + '" maxlength="100" aria-label="Motivo"' + (pode ? '' : ' disabled') + '></span>' + (pode ? '<button type="button" class="btn" data-remover>Remover</button>' : '') + '</li>').join('') + '</ul>' : '<p class="pr-ajuda">Nenhum motivo cadastrado.</p>';
    }
    pintar();
    if (!pode) return;
    lista.addEventListener('input', (e) => { const li = e.target.closest('li[data-i]'); if (li && e.target.matches('[data-nome]')) motivos[+li.dataset.i] = e.target.value; });
    lista.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]'); if (!li) return; const i = +li.dataset.i;
      if (e.target.closest('[data-remover]')) motivos.splice(i, 1);
      else if (e.target.closest('[data-subir]') && i) [motivos[i - 1], motivos[i]] = [motivos[i], motivos[i - 1]];
      else if (e.target.closest('[data-descer]') && i < motivos.length - 1) [motivos[i + 1], motivos[i]] = [motivos[i], motivos[i + 1]];
      else return;
      pintar(); aviso('Alteração ainda não salva.');
    });
    corpo.querySelector('[data-novo]').addEventListener('submit', (e) => {
      e.preventDefault(); const v = e.target.elements.nome.value.trim(); if (!v) return;
      if (motivos.some((m) => m.trim().toLowerCase() === v.toLowerCase())) { aviso('Esse motivo já existe.', true); return; }
      motivos.push(v); e.target.reset(); pintar(); aviso('Alteração ainda não salva.');
    });
    corpo.querySelector('[data-salvar]').addEventListener('click', async (e) => {
      const lim = [...new Set(motivos.map((m) => m.trim()).filter(Boolean))];
      const dias = parseInt(corpo.querySelector('[name=dias]').value, 10);
      e.target.disabled = true;
      try {
        const { error } = await sb.rpc('comercial_followup_config_salvar', { p_empresa: empresa, p_dias: dias, p_motivos: lim });
        if (error) throw error;
        motivos = lim; pintar(); aviso('Salvo.');
      } catch (err) { aviso(err.message || String(err), true); }
      e.target.disabled = false;
    });
  };

  /* Parâmetros > Comercial > "Aviso no documento do pedido" (nov/2026): a frase do card azul (Orçamento) e do card
     amarelo (Pré-reserva) que aparece acima do local do evento no pedido enviado ao cliente (tela, PDF e link).
     {data} vira a validade da pré-reserva. Banco: comercial_avisos_pedido_ler / _salvar. */
  window.carregarParametrosAvisosPedido = async (host, empresa) => {
    const sb = window.supabaseClient;
    const pode = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') !== false;
    const card = document.createElement('section');
    card.className = 'pr-card pr-avisos-pedido';
    card.innerHTML = '<h3>Aviso no documento do pedido</h3><p class="pr-ajuda">Aparece num card colorido acima do local do evento, no pedido enviado ao cliente (na tela, no PDF e no link). Use {data} na frase da pré-reserva para mostrar até quando ela vale.</p><p role="status">Carregando…</p>';
    host.append(card);
    let t;
    try { const { data, error } = await sb.rpc('comercial_avisos_pedido_ler', { p_empresa: empresa }); if (error) throw error; t = data || {}; }
    catch (e) { card.querySelector('[role=status]').textContent = 'Não foi possível carregar: ' + (e.message || e); return; }
    card.querySelector('[role=status]').remove();
    const corpo = document.createElement('div');
    corpo.innerHTML = '<label class="pr-campo pr-aviso-orc">Orçamento (card azul)<textarea name="orcamento" rows="3" maxlength="600"' + (pode ? '' : ' disabled') + '>' + esc(t.orcamento || '') + '</textarea></label>'
      + '<label class="pr-campo pr-aviso-pre" style="margin-top:12px">Pré-reserva (card amarelo)<textarea name="pre_reserva" rows="3" maxlength="600"' + (pode ? '' : ' disabled') + '>' + esc(t.pre_reserva || '') + '</textarea></label>'
      + '<div class="pr-card-acoes">' + (pode ? '<button type="button" class="btn btn-primary" data-salvar>Salvar</button>' : '') + '<span class="pr-card-status" role="status"></span></div>';
    card.append(corpo);
    const status = corpo.querySelector('[role=status]');
    corpo.querySelector('[data-salvar]')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const { error } = await sb.rpc('comercial_avisos_pedido_salvar', { p_empresa: empresa, p_orcamento: corpo.querySelector('[name=orcamento]').value, p_pre_reserva: corpo.querySelector('[name=pre_reserva]').value });
        if (error) throw error;
        status.textContent = 'Salvo. Frase vazia volta para a padrão.'; status.classList.remove('erro');
      } catch (err) { status.textContent = err.message || String(err); status.classList.add('erro'); }
      e.target.disabled = false;
    });
  };
})();
