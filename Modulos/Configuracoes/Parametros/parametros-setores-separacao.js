// Setores da separação (out/2026): liga a separação por setor e define, para cada pessoa, quais setores ela vê e pode
// separar na Triagem. O setor do item é o "Setor de estoque" do Cadastro de Itens. Pessoa em "Todos os setores" vê tudo.
(function(){
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.carregarSetoresSeparacao = async function(host, empresa){
    const sb = window.supabaseClient;
    const secao = document.createElement('section');
    secao.className = 'pr-card pr-separacao-setores';
    secao.innerHTML = '<h3>Setores da separação</h3><p class="pr-ajuda">Cada item tem um setor (campo <b>Setor de estoque</b> no Cadastro de Itens). Ligado, cada pessoa vê na Triagem só os pedidos e os itens dos setores marcados para ela, e só consegue separar esses. A triagem do pedido termina quando todos os setores terminarem.</p>'
      + '<form><div class="pr-opcoes"><label class="pr-check"><input type="checkbox" name="ativo"><span>Separar por setor</span></label></div><div class="pr-setores-tabela" data-tabela></div>'
      + '<div class="pr-card-acoes"><span class="pr-card-status" role="status"></span><button type="submit" class="btn primary">Salvar setores</button></div></form>';
    host.appendChild(secao);
    const form = secao.querySelector('form'), status = secao.querySelector('[role=status]');
    const [{ data: config, error: e1 }, { data: setores, error: e2 }, { data: pessoas, error: e3 }] = await Promise.all([
      sb.from('separacao_setores').select('ativo,usuarios').eq('empresa_id', empresa).maybeSingle(),
      sb.rpc('separacao_setores_lista', { p_empresa: empresa }),
      sb.rpc('separacao_modos_funcionarios', { p_empresa: empresa })
    ]);
    if(e1 || e2 || e3){ status.textContent = 'Não foi possível carregar os setores: ' + (e1 || e2 || e3).message; return; }
    const lista = Array.isArray(setores) ? setores : [], gente = Array.isArray(pessoas) ? pessoas : [];
    const usuarios = config?.usuarios || {};
    form.elements.ativo.checked = config?.ativo === true;
    secao.querySelector('[data-tabela]').innerHTML = gente.length
      ? '<div class="pr-tabela-wrap"><table class="pr-tabela"><thead><tr><th>Pessoa</th><th>Todos os setores</th>' + lista.map(s => '<th>' + esc(s) + '</th>').join('') + '</tr></thead><tbody>'
        + gente.map(p => {
            const meus = Array.isArray(usuarios[p.id]) ? usuarios[p.id] : null;
            return '<tr data-pessoa="' + esc(p.id) + '"><th scope="row">' + esc(p.nome) + '</th><td><input type="checkbox" data-todos aria-label="' + esc(p.nome) + ': todos os setores"' + (meus ? '' : ' checked') + '></td>'
              + lista.map(s => '<td><input type="checkbox" data-setor="' + esc(s) + '" aria-label="' + esc(p.nome) + ': ' + esc(s) + '"' + (meus && meus.includes(s) ? ' checked' : '') + '></td>').join('') + '</tr>';
          }).join('') + '</tbody></table></div>'
      : '<p class="pr-ajuda">Nenhum funcionário com acesso ao sistema cadastrado.</p>';
    const pode = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') !== false;
    function atualizar(){
      const ligado = form.elements.ativo.checked;
      secao.querySelector('[data-tabela]').classList.toggle('is-desligado', !ligado);
      secao.querySelectorAll('tr[data-pessoa]').forEach(tr => {
        const todos = tr.querySelector('[data-todos]').checked;
        tr.querySelector('[data-todos]').disabled = !pode || !ligado;
        tr.querySelectorAll('[data-setor]').forEach(c => { c.disabled = !pode || !ligado || todos; });
      });
      form.elements.ativo.disabled = !pode;
      form.querySelector('button[type=submit]').disabled = !pode;
    }
    form.addEventListener('change', atualizar); atualizar();
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const botao = form.querySelector('button[type=submit]');
      const regras = {};
      for(const tr of secao.querySelectorAll('tr[data-pessoa]')){
        if(tr.querySelector('[data-todos]').checked) continue;
        const marcados = [...tr.querySelectorAll('[data-setor]:checked')].map(c => c.dataset.setor);
        if(!marcados.length){ window.alerta?.('Marque pelo menos um setor para ' + tr.querySelector('th').textContent + ' (ou "Todos os setores").', 'Setores da separação', 'aviso'); return; }
        regras[tr.dataset.pessoa] = marcados;
      }
      botao.disabled = true; status.textContent = 'Salvando…';
      const { error } = await sb.rpc('separacao_setores_salvar', { p_empresa: empresa, p_ativo: form.elements.ativo.checked, p_usuarios: regras });
      botao.disabled = false;
      status.textContent = error ? 'Não foi possível salvar: ' + error.message : 'Setores salvos. Valem na próxima vez que a Triagem for aberta.';
    });
  };
})();
