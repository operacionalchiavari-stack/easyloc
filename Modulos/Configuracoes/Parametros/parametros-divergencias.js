// Divergências de contagem (out/2026): enquanto a Gestão do acervo não faz a contagem geral do item, ele fica bloqueado
// para novas reservas (o que já estava reservado continua). acervo_parametros_salvar / empresa_logistica_regras.divergencia_bloqueia_item.
(function(){
  'use strict';
  window.carregarParametrosDivergencias = async function(host, empresa){
    const sb = window.supabaseClient;
    const pode = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') !== false;
    const secao = document.createElement('section');
    secao.className = 'pr-card pr-divergencias';
    secao.innerHTML = '<h3>Divergências de contagem</h3><p class="pr-ajuda">Quando a contagem da volta (descarregamento ou triagem) não bate, a divergência vai para Estoque &gt; Gestão do acervo, que faz a contagem geral do item no galpão e resolve.</p>'
      + '<form><div class="pr-opcoes"><label class="pr-check"><input type="checkbox" name="bloqueia"' + (pode ? '' : ' disabled') + '><span>Bloquear o item para novas reservas até a contagem geral</span></label></div>'
      + '<div class="pr-card-acoes"><span class="pr-card-status" role="status"></span>' + (pode ? '<button type="submit" class="btn primary">Salvar</button>' : '') + '</div></form>';
    host.appendChild(secao);
    const form = secao.querySelector('form'), status = secao.querySelector('[role=status]');
    const { data } = await sb.from('empresa_logistica_regras').select('divergencia_bloqueia_item').eq('empresa_id', empresa).maybeSingle();
    form.elements.bloqueia.checked = data?.divergencia_bloqueia_item !== false;
    form.addEventListener('submit', async e => {
      e.preventDefault(); status.textContent = 'Salvando…';
      const { error } = await sb.rpc('acervo_parametros_salvar', { p_empresa: empresa, p_bloqueia: form.elements.bloqueia.checked });
      status.textContent = error ? error.message : 'Salvo';
    });
  };
})();

// Carregamento sem caminhão programado (out/2026): por padrão a Expedição só começa o carregamento com um caminhão
// escalado no Painel Logístico. carregamento_parametros_salvar / empresa_logistica_regras.carregamento_sem_programacao.
(function(){
  'use strict';
  window.carregarParametrosCarregamento = async function(host, empresa){
    const sb = window.supabaseClient;
    const pode = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') !== false;
    const secao = document.createElement('section');
    secao.className = 'pr-card pr-carregamento-caminhao';
    secao.innerHTML = '<h3>Carregamento sem caminhão programado</h3><p class="pr-ajuda">Desligado, a Expedição só começa o carregamento de um pedido que tem caminhão escalado no Painel Logístico (etapa Carregamento ou Montagem). O cartão aparece com "Sem caminhão programado" e não abre.</p>'
      + '<form><div class="pr-opcoes"><label class="pr-check"><input type="checkbox" name="livre"' + (pode ? '' : ' disabled') + '><span>Permitir carregamento sem caminhão programado</span></label></div>'
      + '<div class="pr-card-acoes"><span class="pr-card-status" role="status"></span>' + (pode ? '<button type="submit" class="btn primary">Salvar</button>' : '') + '</div></form>';
    host.appendChild(secao);
    const form = secao.querySelector('form'), status = secao.querySelector('[role=status]');
    const { data } = await sb.from('empresa_logistica_regras').select('carregamento_sem_programacao').eq('empresa_id', empresa).maybeSingle();
    form.elements.livre.checked = data?.carregamento_sem_programacao === true;
    form.addEventListener('submit', async e => {
      e.preventDefault(); status.textContent = 'Salvando…';
      const { error } = await sb.rpc('carregamento_parametros_salvar', { p_empresa: empresa, p_sem_programacao: form.elements.livre.checked });
      status.textContent = error ? error.message : 'Salvo';
    });
  };

  // Nov/2026: quantos dias à frente o App do Montador mostra as etapas (antes fixo: 7 para o responsável, 30 para o supervisor).
  window.carregarParametrosAppMontador = async function(host, empresa){
    const sb = window.supabaseClient;
    const pode = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') !== false;
    const dis = pode ? '' : ' disabled';
    const secao = document.createElement('section');
    secao.className = 'pr-card pr-app-montador';
    secao.innerHTML = '<h3>App do Montador: etapas que aparecem</h3><p class="pr-ajuda">Quantos dias à frente cada pessoa vê as montagens e desmontagens no App do Montador. As etapas dos últimos 2 dias continuam aparecendo.</p>'
      + '<form><div class="pr-grid"><label class="pr-campo"><span>Responsável da etapa (dias à frente)</span><input type="number" name="resp" min="1" max="90" step="1" required' + dis + '></label>'
      + '<label class="pr-campo"><span>Supervisor de montagem (dias à frente)</span><input type="number" name="sup" min="1" max="90" step="1" required' + dis + '></label></div>'
      + '<div class="pr-card-acoes"><span class="pr-card-status" role="status"></span>' + (pode ? '<button type="submit" class="btn primary">Salvar</button>' : '') + '</div></form>';
    host.appendChild(secao);
    const form = secao.querySelector('form'), status = secao.querySelector('[role=status]');
    const { data } = await sb.from('empresa_logistica_regras').select('app_montador_dias_responsavel,app_montador_dias_supervisor').eq('empresa_id', empresa).maybeSingle();
    form.elements.resp.value = data?.app_montador_dias_responsavel ?? 7;
    form.elements.sup.value = data?.app_montador_dias_supervisor ?? 30;
    form.addEventListener('submit', async e => {
      e.preventDefault(); status.textContent = 'Salvando…';
      const { error } = await sb.rpc('app_montador_parametros_salvar', { p_empresa: empresa, p_responsavel: Number(form.elements.resp.value), p_supervisor: Number(form.elements.sup.value) });
      status.textContent = error ? error.message : 'Salvo';
    });
  };
})();
