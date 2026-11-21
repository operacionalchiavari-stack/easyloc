/* Parâmetros > Comercial > "Confirmar datas com o decorador" (18/11/2026): com quantos dias de antecedência da entrega o
   pedido aparece na aba "Confirmar datas" da Central de Pedidos. Banco: comercial_confirmar_datas_dias_salvar. */
(function () {
  'use strict';
  window.carregarParametrosConfirmarDatas = async (host, empresa) => {
    const sb = window.supabaseClient;
    const pode = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') !== false;
    const card = document.createElement('section');
    card.className = 'pr-card pr-confirmar-datas';
    card.innerHTML = '<h3>Confirmar datas com o decorador</h3><p class="pr-ajuda">Quando a entrega de um pedido reservado (ou em pré-reserva) estiver a esse número de dias, ele aparece na aba "Confirmar datas" da Central de Pedidos, para o Comercial ligar para o decorador e confirmar entrega, evento e coleta. Depois de confirmado, sai da aba; se as datas mudarem, volta.</p><p role="status">Carregando…</p>';
    host.append(card);
    let dias = 10;
    try {
      const { data, error } = await sb.rpc('comercial_confirmar_datas_lista', { p_empresa: empresa });
      if (error) throw error;
      dias = Number(data?.dias) || 10;
    } catch (e) { card.querySelector('[role=status]').textContent = 'Não foi possível carregar: ' + (e.message || e); return; }
    card.querySelector('[role=status]').remove();
    const corpo = document.createElement('div');
    corpo.innerHTML = '<label class="pr-campo" style="max-width:320px">Dias de antecedência da entrega<input type="number" min="1" max="90" name="dias" value="' + dias + '"' + (pode ? '' : ' disabled') + '></label>'
      + '<div class="pr-card-acoes">' + (pode ? '<button type="button" class="btn btn-primary" data-salvar>Salvar</button>' : '') + '<span class="pr-card-status" role="status"></span></div>';
    card.append(corpo);
    const status = corpo.querySelector('[role=status]');
    corpo.querySelector('[data-salvar]')?.addEventListener('click', async (e) => {
      const n = parseInt(corpo.querySelector('[name=dias]').value, 10);
      e.target.disabled = true;
      try {
        const { error } = await sb.rpc('comercial_confirmar_datas_dias_salvar', { p_empresa: empresa, p_dias: n });
        if (error) throw error;
        status.textContent = 'Salvo.'; status.classList.remove('erro');
      } catch (err) { status.textContent = err.message || String(err); status.classList.add('erro'); }
      e.target.disabled = false;
    });
  };
})();
