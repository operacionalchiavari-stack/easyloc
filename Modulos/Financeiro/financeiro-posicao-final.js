(function(){
 'use strict';
 let selecionado=null, busca='', rodada=0;
 const soma=(a,k)=>a.reduce((t,x)=>t+(Number(x[k])||0),0);
 async function render(ctx){
  const {S,rpc,brl,esc,dataBr}=ctx, host=document.getElementById('finConteudo'), n=++rodada;
  const ativo=()=>n===rodada&&S.aba==='posicao';
  host.innerHTML='<div class="fin-vazio">Carregando posições finais…</div>';
  const pedidos=await window.PedidoFluxo.fila(S.sb,S.emp,'posicao_final');
  const posicoes=[];
  for(let de=0;;de+=1000){
   const {data,error}=await S.sb.from('fin_posicoes_finais').select('pedido_id,status').eq('empresa_id',S.emp).order('pedido_id').range(de,de+999);
   if(error)throw error;posicoes.push(...(data||[]));if(!data||data.length<1000)break;
  }
  if(!ativo())return;
  const estados=new Map(posicoes.map(x=>[x.pedido_id,x.status]));
  host.innerHTML='<div class="pf-layout"><aside class="pf-lateral"><input type="search" aria-label="Buscar pedido na posição final" placeholder="Pedido, cliente ou local" value="'+esc(busca)+'"><div class="pf-lista"></div></aside><section class="pf-detalhe"><div class="fin-vazio">Selecione um pedido para conferir a posição final.</div></section></div>';
  const lista=host.querySelector('.pf-lista'), detalhe=host.querySelector('.pf-detalhe');let abertura=0,b=null,linhas=[];
  function listar(){
   const filtro=busca.toLocaleLowerCase('pt-BR');
   lista.innerHTML=pedidos.filter(p=>[p.numero_pedido,p.cliente_nome,p.local_nome].join(' ').toLocaleLowerCase('pt-BR').includes(filtro)).map(p=>'<button type="button" class="pf-pedido" data-id="'+esc(p.id)+'" aria-current="'+(p.id===selecionado)+'"><strong>Pedido #'+esc(p.numero_pedido)+'</strong><span>'+esc(p.cliente_nome)+'</span><small>'+esc(p.local_nome||'')+' · '+dataBr(p.data_evento)+'</small><small>'+(estados.get(p.id)==='confirmado'?'Posição confirmada':estados.has(p.id)?'Em análise':'A conferir')+'</small></button>').join('')||'<div class="pf-vazio">Nenhum pedido encontrado.</div>';
  }
  host.querySelector('input[type=search]').addEventListener('input',e=>{busca=e.target.value;listar();});
  lista.addEventListener('click',e=>{const bt=e.target.closest('[data-id]');if(bt)abrir(bt.dataset.id);});
  async function abrir(id){
   selecionado=id;listar();const req=++abertura;detalhe.innerHTML='<div class="fin-vazio">Carregando pedido…</div>';
   try{const dados=await rpc('fin_posicao_final_base',{p_empresa:S.emp,p_pedido:id});if(window.EvidenciasOperacao){try{dados.evidencias=await window.EvidenciasOperacao.carregar(S.sb,S.emp,id);}catch(e){dados.evidenciasErro=e.message;}}if(!ativo()||req!==abertura)return;b=dados;montar();}
   catch(e){if(ativo()&&req===abertura)detalhe.innerHTML='<p class="pf-erro" role="alert">'+esc(e.message)+'</p>';}
  }
  function montar(){
   const final=b.salvo?.status==='confirmado', mesmaFonte=b.salvo?.fonte===b.fonte;
   const decisoes=new Map((mesmaFonte?b.salvo?.itens||[]:[]).map(x=>[x.chave,x]));
   linhas=final?b.salvo.itens:b.itens.map(x=>({...x,decisao:x.tipo==='credito'?'credito':decisoes.get(x.chave)?.decisao||'pendente',justificativa:decisoes.get(x.chave)?.justificativa||''}));
   detalhe.innerHTML='<header class="pf-cabecalho"><div><h3>Pedido #'+esc(b.pedido.numero_pedido)+((b.pedido.extras||[]).length?' <small class="pf-extras">+ '+(b.pedido.extras||[]).map(x=>esc(x.numero)).join(', ')+'</small>':'')+'</h3><p>'+esc(b.pedido.cliente_nome)+' · '+esc(b.pedido.local_nome||'')+'</p></div><span class="pf-status '+(final?'ok':'')+'">'+(final?'Posição confirmada':!b.entrega_confirmada?'Aguardando entrega':!b.coleta_confirmada?'Aguardando coleta':'Pronto para análise')+'</span></header><div class="pf-resumo"></div>'+
    (b.salvo&&!mesmaFonte?'<p class="pf-erro">Entrega, coleta ou preços foram alterados após esta análise. '+(final?'Os lançamentos confirmados abaixo preservam o fechamento original; revise a diferença antes de novos acertos.':'As decisões anteriores precisam ser revistas.')+'</p>':'')+
    '<div class="pf-bloco"><h4>Créditos e ocorrências do evento</h4><div class="pf-scroll"><table class="pf-tabela"><thead><tr><th>Item / ocorrência</th><th>Quantidade</th><th>Valor unitário</th><th>Total</th><th>Responsabilidade do decorador</th></tr></thead><tbody>'+linhas.map((x,i)=>'<tr data-linha="'+i+'" class="pf-linha-'+x.decisao+'"><td><div class="pf-item">'+foto(x.foto_url)+'<div><b>'+esc(x.nome)+'</b><small>'+({credito:'Não entregue · crédito de locação',avaria:'Avaria encontrada no evento',desaparecido:'Não encontrado no evento'}[x.tipo])+'</small>'+(x.motivo?'<small>'+esc(x.motivo)+'</small>':'')+'</div></div></td><td>'+esc(x.quantidade)+'</td><td>'+(x.unitario===null?'Preço não informado':brl(x.unitario))+'</td><td>'+(x.valor===null?'—':brl(x.valor))+'</td><td>'+(x.tipo==='credito'?'Crédito automático':final?esc(x.decisao==='cobrar'?'Cobrar reposição':'Não cobrar')+(x.justificativa?'<div class="pf-nota">'+esc(x.justificativa)+'</div>':''):'<select aria-label="Decisão para '+esc(x.nome)+'" data-decisao="'+i+'">'+[['pendente','Selecione'],['cobrar','Cobrar reposição'],['dispensar','Não cobrar']].map(([v,t])=>'<option value="'+v+'"'+(x.decisao===v?' selected':'')+'>'+t+'</option>').join('')+'</select><input data-justificativa="'+i+'" aria-label="Motivo para não cobrar '+esc(x.nome)+'" placeholder="Motivo para não cobrar" maxlength="500" '+(x.decisao==='dispensar'?'':'hidden')+' value="'+esc(x.justificativa)+'">')+'</td></tr>').join('')+'</tbody></table>'+(linhas.length?'':'<div class="pf-vazio">Nenhum item não entregue, avariado ou desaparecido nas confirmações registradas.</div>')+'</div></div>'+
    '<div class="pf-bloco"><h4>Evidências registradas no evento</h4><div id="pfEvidencias" style="display:flex;gap:10px;flex-wrap:wrap;padding:14px"></div></div>'+
    '<div class="pf-bloco"><h4>Pagamentos do pedido</h4><div class="pf-scroll"><table class="pf-tabela"><thead><tr><th>Data</th><th>Forma</th><th>Valor recebido</th><th>Juros / multa</th><th>Desconto</th><th>Situação</th></tr></thead><tbody>'+b.pagamentos.map(p=>'<tr class="'+(p.estornado_em?'pf-estornado':'')+'"><td>'+dataBr(p.data)+'</td><td>'+esc(p.forma||'—')+'</td><td>'+brl(Number(p.valor)+Number(p.juros||0)+Number(p.multa||0)-Number(p.desconto||0))+'</td><td>'+brl(Number(p.juros||0)+Number(p.multa||0))+'</td><td>'+brl(p.desconto)+'</td><td>'+(p.estornado_em?'Estornado':'Recebido')+'</td></tr>').join('')+'</tbody></table>'+(b.pagamentos.length?'':'<div class="pf-vazio">Nenhum pagamento registrado.</div>')+'</div></div>'+
    '<div class="pf-bloco"><h4>Títulos e valores em aberto</h4><div class="pf-scroll"><table class="pf-tabela"><thead><tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Quitado</th><th>Em aberto</th></tr></thead><tbody>'+b.titulos.filter(t=>t.status!=='cancelado').map(t=>'<tr><td>'+esc(t.descricao)+((b.pedido.extras||[]).length&&t.pedido_numero?'<small class="pf-titulo-pedido">Pedido '+esc(t.pedido_numero)+'</small>':'')+'</td><td>'+dataBr(t.vencimento)+'</td><td>'+brl(t.valor)+'</td><td>'+brl(Number(t.recebido||0)+Number(t.compensado||0))+'</td><td>'+brl(t.aberto)+'</td></tr>').join('')+'</tbody></table></div></div>'+
    '<p class="pf-nota">O crédito usa a locação dos itens não entregues. Avarias e itens desaparecidos usam o valor de reposição. Itens que já estavam no depósito não geram falta na coleta. Ao confirmar, a cobrança entra em A receber e o crédito na Conta dos decoradores. O saldo líquido considera os dois; a compensação ou devolução do crédito é feita pelo financeiro.</p>'+
    '<p class="pf-erro" role="alert" hidden></p><div class="pf-acoes">'+(final?'<span class="pf-nota">Confirmada em '+dataBr(b.salvo.confirmado_em)+'. Lançamentos gerados uma única vez.</span>':'<button type="button" class="fin-btn claro" data-salvar>Salvar análise</button><button type="button" class="fin-btn" data-confirmar '+(!b.entrega_confirmada||!b.coleta_confirmada?'disabled':'')+'>Confirmar posição final</button>')+'</div>';
   const galeria=detalhe.querySelector('#pfEvidencias');if(galeria){if(b.evidencias?.length)window.EvidenciasOperacao.render(galeria,b.evidencias,[],()=>{});else galeria.textContent=b.evidenciasErro||'Nenhuma foto anexada a este pedido.';}
   detalhe.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>img.remove()));
   detalhe.querySelectorAll('[data-decisao]').forEach(el=>el.addEventListener('change',()=>{const i=Number(el.dataset.decisao);linhas[i].decisao=el.value;detalhe.querySelector('[data-linha="'+i+'"]').className='pf-linha-'+el.value;detalhe.querySelector('[data-justificativa="'+i+'"]').hidden=el.value!=='dispensar';resumir();}));
   detalhe.querySelectorAll('[data-justificativa]').forEach(el=>el.addEventListener('input',()=>{linhas[Number(el.dataset.justificativa)].justificativa=el.value;}));
   detalhe.querySelector('[data-salvar]')?.addEventListener('click',()=>salvar(false));detalhe.querySelector('[data-confirmar]')?.addEventListener('click',()=>salvar(true));resumir();
  }
  function foto(url){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?'<img src="'+esc(u.href)+'" alt="" loading="lazy">':'';}catch{return '';}}
  function resumir(){
   const final=b.salvo?.status==='confirmado',titulos=b.titulos.filter(t=>t.status!=='cancelado');
   const cre=soma(linhas.filter(x=>x.tipo==='credito'),'valor'),cob=soma(linhas.filter(x=>x.decisao==='cobrar'),'valor');
   const aberto=soma(titulos,'aberto'),pago=b.pagamentos.filter(p=>!p.estornado_em).reduce((t,p)=>t+Number(p.valor)+Number(p.juros||0)+Number(p.multa||0)-Number(p.desconto||0),0);
   const creAberto=final?(Number(b.credito_titulo?.aberto)||0):cre;
   const liquido=aberto+(final?0:cob)-creAberto;
   detalhe.querySelector('.pf-resumo').innerHTML=[['Pedido',b.pedido.valor_total,''],['Pagamentos registrados',pago,''],['Em aberto nos títulos',aberto,''],['Crédito de locação',cre,'credito'],['Reposição a cobrar',cob,'custo'],[liquido>=0?'Saldo líquido a receber':'Saldo líquido a favor do cliente',Math.abs(liquido),liquido<0?'credito':'custo']].map(([t,v,c])=>'<div class="'+c+'"><small>'+t+'</small><strong>'+brl(v)+'</strong></div>').join('');
  }
  async function salvar(confirmar){
   const erro=detalhe.querySelector('[role=alert]'),botoes=detalhe.querySelectorAll('.pf-acoes button'),req=abertura,analisado=b;erro.hidden=true;botoes.forEach(x=>x.disabled=true);
   try{
    const salvo=await rpc('fin_posicao_final_salvar',{p_empresa:S.emp,p_pedido:analisado.pedido.id,p_fonte:analisado.fonte,p_versao:analisado.salvo?.versao||0,p_decisoes:linhas.map(x=>({chave:x.chave,decisao:x.decisao,justificativa:x.justificativa})),p_confirmar:confirmar});
    estados.set(salvo.pedido.id,salvo.salvo.status);
    if(confirmar&&ctx.recarregar){await ctx.recarregar();return;}
    if(!ativo()||req!==abertura)return;b={...salvo,evidencias:analisado.evidencias,evidenciasErro:analisado.evidenciasErro};listar();montar();
   }catch(e){if(ativo()&&req===abertura){erro.textContent=e.message;erro.hidden=false;botoes.forEach(x=>x.disabled=false);if(!b.coleta_confirmada||!b.entrega_confirmada)detalhe.querySelector('[data-confirmar]')?.setAttribute('disabled','');}}
  }
  listar();if(selecionado&&pedidos.some(p=>p.id===selecionado))await abrir(selecionado);
 }
 window.FinanceiroPosicaoFinal={render};
})();
