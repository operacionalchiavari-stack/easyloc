(function () {
  // Créditos aumentam o saldo a favor do decorador; pagamentos e devoluções diminuem.
  window.montarExtratoDecorador = function (dados, titulos, saldoAtual) {
    const linhas = [], fontes = new Map();
    const dia = valor => String(valor || '').slice(0,10);
    const adicionar = (id, data, descricao, valor, fonte, extra = {}) => {
      linhas.push({ id, data:dia(data), ordem:String(data || ''), descricao, credito:valor>0?valor:0,
        debito:valor<0?-valor:0, cliente:fonte.nome, clienteId:fonte.clienteId,
        titulo:fonte.titulo, situacao:fonte.situacao, pendente:fonte.pendente, ...extra });
    };
    for (const p of dados.pedidos) {
      const t=titulos.find(t=>t.id===p.pagar_id);
      const f={nome:p.cliente_nome,clienteId:p.cliente_id,titulo:p.pagar_id,
        pendente:Number(p.saldo || 0),situacao:p.registro==='sem_registro'?'sem_registro':!p.ativo?'cancelado':Number(p.saldo)>0?'aberto':'pago'};
      if(p.pagar_id)fontes.set(p.pagar_id,f);
      // uma linha por pessoa: o BV de um pedido pode ser dividido entre a titular da equipe e quem fez (out/2026)
      const lid=p.linha_id || p.id;
      const parte=p.percentual_total!=null && Number(p.percentual)!==Number(p.percentual_total)?' (parte do BV de '+Number(p.percentual_total)+'%)':'';
      const feito=p.feito_por && p.feito_por!==p.cliente_nome?' · pedido de '+p.feito_por:'';
      if(Number(p.valor)>0){
        adicionar('bv-'+lid,t?.emissao || p.data_evento,'BV · Pedido #'+p.numero_pedido,Number(p.valor),f,{obs:Number(p.percentual)+'% sobre '+Number(p.base_locacao || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+' de locação'+parte+(p.manual?' · negociado no pedido':'')+feito,acao:true});
        if(!p.ativo || t?.status==='cancelado')adicionar('bv-cancelado-'+lid,t?.cancelado_em || t?.updated_at || p.data_evento,'Cancelamento de BV · Pedido #'+p.numero_pedido,-Number(p.valor),f);
      } else adicionar('pedido-'+lid,p.data_evento,'Pedido #'+p.numero_pedido,0,f,{obs:p.registro==='sem_registro'?'Sem BV registrado':'Sem comissão'});
    }
    for(const c of dados.creditos || []){
      const f={nome:c.fornecedor_nome,clienteId:c.fornecedor_id,titulo:c.id,pendente:c.status==='cancelado'?0:Number(c.aberto || 0),
        situacao:c.status==='cancelado'?'cancelado':Number(c.aberto)>0?'aberto':'pago'};
      fontes.set(c.id,f);
      adicionar('credito-'+c.id,c.emissao,c.descricao,Number(c.valor),f,{obs:c.observacoes,acao:true});
      if(c.status==='cancelado')adicionar('credito-cancelado-'+c.id,c.cancelado_em || c.updated_at || c.emissao,'Cancelamento · '+c.descricao,-Number(c.valor),f,{obs:c.cancelamento_motivo});
    }
    for(const p of dados.pagamentos){
      const f=fontes.get(p.pagar_id) || {nome:p.cliente_nome,clienteId:p.cliente_id,titulo:p.pagar_id,pendente:0,situacao:'pago'};
      const descricao=p.numero_pedido?'Pagamento BV · Pedido #'+p.numero_pedido:'Devolução de crédito';
      adicionar('pagamento-'+p.id,p.data,descricao,-Number(p.valor),f,{obs:[p.conta,p.forma,p.observacoes].filter(Boolean).join(' · ')});
      if(p.estornado_em)adicionar('estorno-'+p.id,p.estornado_em,'Estorno · '+descricao,Number(p.valor),f,{obs:p.estorno_motivo});
    }
    for(const c of dados.compensacoes || []){
      const f=fontes.get(c.credito_id);if(!f)continue;
      adicionar('compensacao-'+c.id,c.criado_em,'Crédito utilizado · Pedido #'+(c.numero_pedido||'—'),-Number(c.valor),f,{obs:c.motivo});
      if(c.estornado_em)adicionar('compensacao-estorno-'+c.id,c.estornado_em,'Estorno de compensação',Number(c.valor),f,{obs:c.estorno_motivo});
    }
    linhas.sort((a,b)=>a.data.localeCompare(b.data) || (b.credito>0)-(a.credito>0) || a.ordem.localeCompare(b.ordem) || a.id.localeCompare(b.id));
    let saldo=Math.round((saldoAtual-linhas.reduce((s,l)=>s+l.credito-l.debito,0))*100)/100;
    const inicial=saldo;
    for(const l of linhas){saldo=Math.round((saldo+l.credito-l.debito)*100)/100;l.saldo=saldo;}
    return {linhas,inicial};
  };
  window.renderizarTabelaExtratoDecorador = function ({movimentos,saldoAnterior,inicio,cliente,podePagar,brl,esc,dataBr}) {
    return '<section class="fin-bloco fin-conta-extrato"><div class="fin-bv-titulo"><h3>Extrato da conta</h3><button class="fin-btn claro" type="button" data-extrato-exportar>Exportar extrato</button></div>' +
      '<div class="fin-rolar"><table class="fin-tabela"><thead><tr><th>Data</th><th>Descrição</th>' + (!cliente?'<th>Decorador</th>':'') + '<th class="num">Crédito</th><th class="num">Débito</th><th class="num">Saldo</th><th></th></tr></thead><tbody>' +
      '<tr class="fin-extrato-anterior"><td>—</td><td>Saldo anterior' + (inicio?' ao período':'') + '</td>' + (!cliente?'<td></td>':'') + '<td></td><td></td><td class="num">'+brl(saldoAnterior)+'</td><td></td></tr>' +
      movimentos.map(l=>'<tr><td>'+dataBr(l.data)+'</td><td><b>'+esc(l.descricao)+'</b>'+(l.obs?'<small>'+esc(l.obs)+'</small>':'')+'</td>'+(!cliente?'<td>'+esc(l.cliente || '—')+'</td>':'')+
        '<td class="num">'+(l.credito?brl(l.credito):'—')+'</td><td class="num">'+(l.debito?brl(l.debito):'—')+'</td><td class="num fin-extrato-saldo">'+brl(l.saldo)+'</td><td><div class="acoes">'+
        (l.titulo?'<button type="button" class="fin-btn peq claro" data-p-ver="'+esc(l.titulo)+'">Detalhes</button>':'')+
        '</div></td></tr>').join('')+
      (!movimentos.length?'<tr><td colspan="7" class="fin-vazio">Nenhum lançamento neste período.</td></tr>':'')+
      '</tbody></table></div><p class="fin-extrato-nota">Créditos aumentam o saldo a favor do decorador; pagamentos e devoluções diminuem. O saldo considera todos os movimentos, inclusive os ocultos pelo filtro de situação.</p></section>';
  };
})();
