(function () {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  window.carregarParametrosLogisticaManual = async (host, empresaId) => {
    const sb = window.supabaseClient;
    const [config, links] = await Promise.all([
      sb.from('pedido_logistica_parametros').select('config').eq('empresa_id', empresaId).maybeSingle(),
      sb.from('usuarios_empresas').select('*').eq('empresa_id', empresaId)
    ]);
    if (config.error) {
      if (['PGRST205', '42P01'].includes(config.error.code)) {
        const aviso = document.createElement('section');
        aviso.className = 'pr-card'; aviso.id = 'logisticaManualParametros';
        aviso.dataset.indisponivel = 'true';
        aviso.textContent = 'Os ajustes manuais aguardam atualização do banco. Os demais parâmetros comerciais podem ser usados normalmente.';
        host.append(aviso);
        return;
      }
      throw config.error;
    }
    if (links.error) throw links.error;
    const ids = [...new Set((links.data || []).map(l => l.user_id || l.usuario_id || l.id_usuario).filter(Boolean))];
    const users = ids.length ? await sb.from('usuarios').select('id,nome').in('id', ids) : { data: [] };
    if (users.error) throw users.error;
    const section = document.createElement('section'); section.className = 'pr-card'; section.id = 'logisticaManualParametros';
    section.innerHTML = '<h3>Ajustes manuais no pedido</h3><p>Escolha quem pode substituir o valor final calculado. Cada pedido pode voltar ao automático.</p>' + ['frete', 'montagem'].map(tipo => {
      const cfg = config.data?.config?.[tipo] || {};
      return `<fieldset data-manual-tipo="${tipo}"><legend>${tipo === 'frete' ? 'Frete' : 'Montagem'}</legend><label>Quem pode ajustar <select data-modo aria-label="Quem pode ajustar ${tipo}">${[['nenhum','Ninguém'],['todos','Quem pode editar pedidos'],['escolhidos','Usuários escolhidos']].map(([v,t]) => `<option value="${v}" ${cfg.modo === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><div data-usuarios>${(users.data || []).map(u => `<label class="pr-check"><input type="checkbox" value="${esc(u.id)}" ${(cfg.usuarios || []).includes(u.id) ? 'checked' : ''}>${esc(u.nome || 'Usuário')}</label>`).join('') || '<p>Nenhum usuário disponível.</p>'}</div></fieldset>`;
    }).join('');
    const atualizar = () => section.querySelectorAll('fieldset').forEach(f => { f.querySelector('[data-usuarios]').hidden = f.querySelector('select').value !== 'escolhidos'; });
    section.addEventListener('change', atualizar); atualizar(); host.append(section);
  };
  window.salvarParametrosLogisticaManual = async empresaId => {
    const section = document.getElementById('logisticaManualParametros');
    if (!section) throw Error('Reabra a aba Comercial antes de salvar.');
    if (section.dataset.indisponivel === 'true') return;
    const config = {};
    section.querySelectorAll('fieldset').forEach(f => {
      const modo = f.querySelector('select').value;
      const usuarios = [...f.querySelectorAll('input:checked')].map(i => i.value);
      if (modo === 'escolhidos' && !usuarios.length) throw Error('Escolha pelo menos um usuário para ' + f.dataset.manualTipo + '.');
      config[f.dataset.manualTipo] = { modo, usuarios: modo === 'escolhidos' ? usuarios : [] };
    });
    const { error } = await window.supabaseClient.from('pedido_logistica_parametros').upsert({ empresa_id: empresaId, config, updated_at: new Date().toISOString() });
    if (error) throw error;
  };
})();
