// Faixas de km do Uber (out/2026): "de X a Y km = R$ Z" por trecho. Ida e volta = 2 trechos. O valor de cada corrida
// pedida no Painel Logístico sai daqui (uber_valor_trecho); corrida já aceita por um motorista mantém o valor da hora.
(function(){
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  window.carregarParametrosUber = async function(host, empresa){
    const sb = window.supabaseClient;
    const secao = document.createElement('section');
    secao.className = 'pr-card pr-uber-faixas';
    secao.innerHTML = '<h3>Valores do Uber por km</h3><p class="pr-ajuda">Cada corrida pedida no Painel Logístico vale a faixa dos km do trajeto (ponto de encontro até o destino). Ida e volta conta dois trechos. Deixe o "até" da última faixa em branco para valer acima disso.</p>'
      + '<form><div class="pr-tabela-wrap"><table class="pr-tabela pr-uber-tabela"><thead><tr><th>De (km)</th><th>Até (km)</th><th>Valor por trecho</th><th></th></tr></thead><tbody data-faixas></tbody></table></div>'
      + '<button type="button" class="btn" data-nova-faixa>+ Faixa</button><p class="pr-ajuda pr-uber-exemplo" data-exemplo></p>'
      + '<div class="pr-card-acoes"><span class="pr-card-status" role="status"></span><button type="submit" class="btn primary">Salvar valores do Uber</button></div></form>';
    host.appendChild(secao);
    const corpo = secao.querySelector('[data-faixas]'), status = secao.querySelector('[role=status]'), form = secao.querySelector('form');
    const pode = window.EasyLocPermissions?.hasPermission?.('configuracoes.empresa.editar') !== false;
    const { data, error } = await sb.from('empresa_logistica_regras').select('uber').eq('empresa_id', empresa).maybeSingle();
    if (error) { status.textContent = 'Não foi possível carregar: ' + error.message; return; }
    let faixas = Array.isArray(data?.uber?.faixas) && data.uber.faixas.length ? data.uber.faixas : [{ de: 0, ate: 10, valor: '' }, { de: 10, ate: 20, valor: '' }, { de: 20, ate: null, valor: '' }];
    const linha = (f, i) => '<tr data-i="' + i + '"><td><input type="number" min="0" step="0.1" data-k="de" value="' + esc(f.de ?? '') + '"' + (pode ? '' : ' disabled') + '></td>'
      + '<td><input type="number" min="0" step="0.1" data-k="ate" value="' + esc(f.ate ?? '') + '" placeholder="acima"' + (pode ? '' : ' disabled') + '></td>'
      + '<td><input type="number" min="0" step="0.01" data-k="valor" value="' + esc(f.valor ?? '') + '" placeholder="R$"' + (pode ? '' : ' disabled') + '></td>'
      + '<td>' + (pode ? '<button type="button" class="btn" data-remover="' + i + '" aria-label="Remover faixa">×</button>' : '') + '</td></tr>';
    const ler = () => [...corpo.querySelectorAll('tr')].map(tr => ({ de: tr.querySelector('[data-k=de]').value, ate: tr.querySelector('[data-k=ate]').value, valor: tr.querySelector('[data-k=valor]').value }));
    function exemplo(){
      const f = ler().filter(x => x.valor !== '');
      const achar = km => { const ok = f.filter(x => km >= Number(x.de || 0) && (x.ate === '' || km <= Number(x.ate))).sort((a, b) => Number(b.de || 0) - Number(a.de || 0))[0]; return ok ? Number(ok.valor) : 0; };
      secao.querySelector('[data-exemplo]').textContent = f.length ? 'Exemplo: 15 km só ida = ' + brl(achar(15)) + ' · 15 km ida e volta = ' + brl(achar(15) * 2) + '.' : '';
    }
    function pintar(){ corpo.innerHTML = faixas.map(linha).join(''); exemplo(); }
    pintar();
    secao.querySelector('[data-nova-faixa]').hidden = !pode;
    secao.querySelector('button[type=submit]').hidden = !pode;
    secao.addEventListener('input', exemplo);
    secao.addEventListener('click', e => {
      if (e.target.closest('[data-nova-faixa]')) { faixas = ler(); const ult = faixas[faixas.length - 1]; faixas.push({ de: ult?.ate || '', ate: '', valor: '' }); pintar(); }
      const r = e.target.closest('[data-remover]'); if (r) { faixas = ler(); faixas.splice(Number(r.dataset.remover), 1); pintar(); }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault(); status.textContent = 'Salvando…';
      const lista = ler().filter(x => x.de !== '' || x.ate !== '' || x.valor !== '');
      const { data: r, error: err } = await sb.rpc('uber_faixas_salvar', { p_empresa: empresa, p_faixas: lista });
      if (err) { status.textContent = err.message; return; }
      faixas = r.faixas; pintar(); status.textContent = 'Salvo';
    });
  };
})();
