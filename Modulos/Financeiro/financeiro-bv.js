(function () {
  let cliente = '', inicio = '', fim = '', situacao = '', sequencia = 0;
  function csv(linhas, nome) {
    const texto = '\uFEFF' + linhas.map(l => l.map(v => {
      const seguro = typeof v === 'string' && /^[\s]*[=+@-]/.test(v) ? "'" + v : v;
      return '"' + String(seguro ?? '').replace(/"/g, '""') + '"';
    }).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.FinanceiroBV = { async render(ctx) {
    const { S, rpc, brl, esc, dataBr } = ctx;
    const root = document.getElementById('finConteudo');
    const vez = ++sequencia;
    try {
    root.innerHTML = '<div class="fin-vazio" role="status">Carregando conta corrente…</div>';
    const dados = await rpc('fin_conta_cliente_extrato', { p_empresa: S.emp, p_cliente: cliente || null });
    const creditos = dados.creditos || [];
    const saldoCredito = creditos.filter(c=>c.status!=='cancelado').reduce((total,c)=>total+Number(c.aberto || 0),0);
    if (vez !== sequencia || S.aba !== 'bv') return;
    const noPeriodo = d => (!inicio || (d && d >= inicio)) && (!fim || (d && d <= fim));
    const somar = (lista, campo) => lista.reduce((s,p) => s + Number(p[campo] || 0), 0);
    const decoradores = new Map(dados.clientes.map(c => [c.id,c]));
    const avatar = c => {
      const iniciais = c?.nome_razao?.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('') || 'BV';
      const foto = /^https?:\/\//i.test(c?.catalogo_logo_url || '') ? c.catalogo_logo_url : '';
      return '<span class="fin-bv-avatar" data-bv-avatar aria-hidden="true"><span>' + esc(iniciais) + '</span>' +
        (foto ? '<img src="' + esc(foto) + '" alt="" loading="lazy">' : '') + '</span>';
    };
    const podePagar = window.hasPermission?.('financeiro.contas_pagar.editar') === true;
    const selecionado = decoradores.get(cliente);
    const saldoTotal = somar(dados.pedidos,'saldo') + saldoCredito;
    const extrato = window.montarExtratoDecorador(dados, S.pagar, saldoTotal);
    const movimentos = extrato.linhas.filter(l=>noPeriodo(l.data) && (!situacao || l.situacao===situacao));
    const anteriores = inicio ? extrato.linhas.filter(l=>l.data && l.data<inicio) : [];
    const saldoAnterior = anteriores.length ? anteriores[anteriores.length-1].saldo : extrato.inicial;
    root.innerHTML = '<section class="fin-bv-conta" aria-label="Saldo da conta corrente"><div class="fin-bv-conta-pessoa">' + avatar(selecionado) +
      '<div class="fin-conta-identidade"><span class="fin-bv-conta-legenda">Conta corrente do decorador</span>' +
      '<div class="fin-conta-busca"><label class="fin-bv-rotulo-sr" for="contaDecoradorBusca">Pesquisar decorador</label><input id="contaDecoradorBusca" data-bv-cliente type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="contaDecoradorOpcoes" autocomplete="off" placeholder="Digite o nome do decorador" value="' + esc(selecionado?.nome_razao || 'Todos os decoradores') + '"><div id="contaDecoradorOpcoes" role="listbox" aria-label="Decoradores" hidden></div></div><p>' +
      (selecionado ? 'BV, pagamentos a maior e outros créditos' : 'Visão consolidada das contas dos decoradores') + '</p></div></div>' +
      '<div class="fin-bv-conta-saldo"><span>Saldo a favor do decorador</span><strong data-bv-saldo-total>' + brl(saldoTotal) + '</strong><small>BV em aberto: ' + brl(somar(dados.pedidos,'saldo')) + ' · Outros créditos: ' + brl(saldoCredito) + '<br>Saldo total, independente dos filtros de período e situação</small></div>' +
      '<div class="fin-bv-filtros fin-conta-filtros">' +
      '<label>De<input type="date" data-bv-inicio value="' + esc(inicio) + '"></label><label>Até<input type="date" data-bv-fim value="' + esc(fim) + '"></label>' +
      '<label>Situação<select data-bv-situacao>' + [['','Todas'],['aberto','Com saldo a pagar'],['pago','Quitados'],['cancelado','Cancelados'],['sem_registro','Sem BV registrado']].map(([v,t]) => '<option value="' + v + '"' + (situacao === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
      '<button type="button" class="fin-btn claro" data-bv-atualizar>Atualizar</button>' +
      (podePagar ? '<button type="button" class="fin-btn" data-cliente-credito>Registrar crédito</button>' : '') +
      '<button type="button" class="fin-bv-ajuda" aria-label="Sobre o saldo e o extrato" title="O saldo soma o BV e os demais créditos, descontando os pagamentos e devoluções. O período filtra pela data de cada lançamento. O saldo principal considera todos os movimentos.">ⓘ</button></div></section>' +
      window.renderizarTabelaExtratoDecorador({movimentos,saldoAnterior,inicio,cliente,podePagar,brl,esc,dataBr});
    root.querySelectorAll('[data-bv-avatar] img').forEach(img => img.addEventListener('error',()=>img.remove(),{once:true}));
    const busca=root.querySelector('[data-bv-cliente]');
    const lista=root.querySelector('#contaDecoradorOpcoes');
    const nomeAtual=selecionado?.nome_razao || 'Todos os decoradores';
    const normalizar=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const fecharBusca=()=>{lista.hidden=true;busca.setAttribute('aria-expanded','false');busca.removeAttribute('aria-activedescendant');};
    let indice=-1;
    const mostrarOpcoes=()=>{
      const termo=normalizar(busca.value===nomeAtual?'':busca.value.trim());
      const opcoes=[{id:'',nome_razao:'Todos os decoradores'},...dados.clientes].filter(c=>normalizar(c.nome_razao).includes(termo));
      lista.innerHTML=opcoes.map((c,i)=>'<button type="button" role="option" tabindex="-1" id="conta-opcao-'+i+'" aria-selected="'+(c.id===cliente)+'" data-decorador-id="'+esc(c.id)+'">'+esc(c.nome_razao)+'</button>').join('') || '<span class="fin-conta-sem-opcoes">Nenhum decorador encontrado.</span>';
      lista.hidden=false;indice=-1;busca.setAttribute('aria-expanded','true');busca.removeAttribute('aria-activedescendant');
      lista.querySelectorAll('[data-decorador-id]').forEach(b=>b.onclick=()=>{cliente=b.dataset.decoradorId;this.render(ctx);});
    };
    busca.onfocus=()=>{busca.select();mostrarOpcoes();};
    busca.oninput=mostrarOpcoes;
    busca.onkeydown=e=>{
      if(e.key==='Escape'){busca.value=nomeAtual;fecharBusca();return;}
      if(!['ArrowDown','ArrowUp','Enter'].includes(e.key))return;
      if(e.key==='Enter' && lista.hidden)return;
      e.preventDefault();if(lista.hidden)mostrarOpcoes();
      const botoes=[...lista.querySelectorAll('[data-decorador-id]')];if(!botoes.length)return;
      if(e.key==='Enter'){(botoes[indice] || botoes.find(b=>normalizar(b.textContent)===normalizar(busca.value)) || (botoes.length===1?botoes[0]:null))?.click();return;}
      indice=(indice+(e.key==='ArrowDown'?1:-1)+botoes.length)%botoes.length;
      botoes.forEach((b,i)=>b.classList.toggle('is-focado',i===indice));
      busca.setAttribute('aria-activedescendant',botoes[indice].id);botoes[indice].scrollIntoView({block:'nearest'});
    };
    root.querySelector('.fin-conta-busca').addEventListener('focusout',e=>{
      if(!e.currentTarget.contains(e.relatedTarget)){busca.value=nomeAtual;fecharBusca();}
    });
    root.querySelector('[data-bv-situacao]').onchange = e => { situacao=e.target.value; this.render(ctx); };
    const alterarData = () => {
      const de=root.querySelector('[data-bv-inicio]'), ate=root.querySelector('[data-bv-fim]');
      ate.setCustomValidity(de.value && ate.value && de.value>ate.value ? 'A data final deve ser igual ou posterior à inicial.' : '');
      if(!ate.reportValidity())return;
      inicio=de.value;fim=ate.value;this.render(ctx);
    };
    root.querySelector('[data-bv-inicio]').onchange = alterarData;
    root.querySelector('[data-bv-fim]').onchange = alterarData;
    root.querySelector('[data-bv-atualizar]').onclick = () => ctx.recarregar();
    root.querySelector('[data-cliente-credito]')?.addEventListener('click',()=>ctx.registrarCredito(cliente,dados.clientes));
    root.querySelector('[data-extrato-exportar]').onclick = () => csv([['Data','Descricao','Decorador','Observacao','Credito','Debito','Saldo'],['','Saldo anterior','','',0,0,saldoAnterior],...movimentos.map(l=>[l.data,l.descricao,l.cliente,l.obs,l.credito,l.debito,l.saldo])],'conta-decorador-extrato.csv');
    } catch (erro) {
      if (vez === sequencia && S.aba === 'bv') {
        root.replaceChildren(); const mensagem = document.createElement('p');
        mensagem.className = 'fin-vazio'; mensagem.textContent = 'Não foi possível carregar o extrato de BV: ' + erro.message; root.append(mensagem);
      }
    }
  } };
})();
