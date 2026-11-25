(function(){
 'use strict';
 let selecionado=null, busca='', rodada=0, aba='pendentes';
 const soma=(a,k)=>a.reduce((t,x)=>t+(Number(x[k])||0),0);
 function indicadorPendentes(total){
  const aba=document.querySelector('#finAbas [data-aba="posicao"]');if(!aba)return;
  let badge=aba.querySelector('[data-cont="posicao"]');
  if(!badge){badge=document.createElement('span');badge.dataset.cont='posicao';badge.className='fin-conta-aba fin-posicao-contador';badge.setAttribute('aria-live','polite');aba.append(badge);}
  badge.textContent=total?String(total):'';badge.hidden=!total;
  aba.classList.toggle('fin-posicao-pendente',total>0);
  aba.setAttribute('aria-label','Posição final'+(total?' · '+total+' pedido(s) pendente(s)':''));
 }
 async function atualizarIndicador(sb,empresa){
  const pedidos=await window.PedidoFluxo.fila(sb,empresa,'posicao_final'),ids=[...new Set(pedidos.map(p=>p.id))],confirmados=new Set();
  for(let i=0;i<ids.length;i+=200){const {data,error}=await sb.from('fin_posicoes_finais').select('pedido_id,status').eq('empresa_id',empresa).in('pedido_id',ids.slice(i,i+200));if(error)throw Error(error.message);(data||[]).filter(p=>p.status==='confirmado').forEach(p=>confirmados.add(p.pedido_id));}
  indicadorPendentes(ids.filter(id=>!confirmados.has(id)).length);
 }
 function previewEvidencia(link){
  document.querySelector('dialog.pf-preview-evidencia')?.close();
  const anterior=document.activeElement,modal=document.createElement('dialog'),fechar=document.createElement('button'),imagem=document.createElement('img'),legenda=document.createElement('p');
  modal.className='pf-preview-evidencia';modal.setAttribute('aria-label','Prévia da evidência');
  fechar.type='button';fechar.className='pf-preview-fechar';fechar.textContent='×';fechar.setAttribute('aria-label','Fechar prévia');
  imagem.src=link.href;imagem.alt=link.querySelector('img')?.alt||'Evidência da ocorrência';
  legenda.textContent=link.title||'';
  imagem.onerror=()=>{imagem.hidden=true;legenda.textContent='Não foi possível carregar a foto. Feche a prévia e tente novamente.';};
  fechar.onclick=()=>modal.close();modal.addEventListener('click',ev=>{if(ev.target===modal)modal.close();});
  modal.addEventListener('close',()=>{modal.remove();if(anterior?.isConnected)anterior.focus();},{once:true});
  modal.append(fechar,imagem,legenda);document.body.append(modal);modal.showModal();fechar.focus();
 }
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
  const {data:motivosNaoCobrar,error:erroMotivos}=await S.sb.from('fin_posicao_motivos').select('id,nome,ativo,ordem').eq('empresa_id',S.emp).order('ordem').order('nome');
  if(erroMotivos)throw Error('Não foi possível carregar os motivos: '+erroMotivos.message);if(!ativo())return;
  // Foto do decorador (nov/2026): a mesma do catálogo (clientes_empresas.catalogo_logo_url), pelo cliente_id ou pelo nome.
  const fotos=new Map();
  try{
   const ids=[...new Set(pedidos.map(p=>p.cliente_id).filter(Boolean))];
   const nomes=[...new Set(pedidos.filter(p=>!p.cliente_id&&p.cliente_nome).map(p=>p.cliente_nome))];
   for(let i=0;i<ids.length;i+=150){const {data}=await S.sb.from('clientes_empresas').select('id,nome_razao,catalogo_logo_url').eq('empresa_id',S.emp).in('id',ids.slice(i,i+150));(data||[]).forEach(c=>{fotos.set('id:'+c.id,c.catalogo_logo_url);});}
   for(let i=0;i<nomes.length;i+=150){const {data}=await S.sb.from('clientes_empresas').select('nome_razao,catalogo_logo_url').eq('empresa_id',S.emp).in('nome_razao',nomes.slice(i,i+150));(data||[]).forEach(c=>{fotos.set('nome:'+String(c.nome_razao).trim().toLowerCase(),c.catalogo_logo_url);});}
  }catch(_){}
  if(!ativo())return;
  const fotoDe=p=>(p.cliente_id&&fotos.get('id:'+p.cliente_id))||fotos.get('nome:'+String(p.cliente_nome||'').trim().toLowerCase())||'';
  const iniciais=n=>String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?';
  const avatar=(p,cls)=>{const u=fotoDe(p);let img='';try{const x=new URL(u);if(['https:','http:'].includes(x.protocol))img='<img src="'+esc(x.href)+'" alt="" loading="lazy" onerror="this.remove()">';}catch{}return '<span class="pf-avatar '+(cls||'')+'" aria-hidden="true"><b>'+esc(iniciais(p.cliente_nome))+'</b>'+img+'</span>';};
  const concluido=p=>estados.get(p.id)==='confirmado';
  host.innerHTML='<div class="pf-layout"><aside class="pf-lateral"><nav class="el-tabs pf-abas" role="tablist" aria-label="Posições finais"><button type="button" role="tab" data-pf-aba="pendentes">Pendentes <span class="tab-badge" data-pf-cont></span></button><button type="button" role="tab" data-pf-aba="concluidos">Concluídos</button></nav><input type="search" aria-label="Buscar pedido na posição final" placeholder="Pedido, cliente ou local" value="'+esc(busca)+'"><div class="pf-lista"></div></aside><section class="pf-detalhe"><div class="fin-vazio">Selecione um pedido para conferir a posição final.</div></section></div>';
  const lista=host.querySelector('.pf-lista'), detalhe=host.querySelector('.pf-detalhe');let abertura=0,b=null,linhas=[],bvSel=null;
  function listar(){
   const filtro=busca.toLocaleLowerCase('pt-BR');
   host.querySelectorAll('[data-pf-aba]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.pfAba===aba)));
   const pend=pedidos.filter(p=>!concluido(p)).length, cont=host.querySelector('[data-pf-cont]');if(cont)cont.textContent=pend?String(pend):'';indicadorPendentes(pend);
   lista.innerHTML=pedidos.filter(p=>(aba==='concluidos')===concluido(p)).filter(p=>[p.numero_pedido,p.cliente_nome,p.local_nome].join(' ').toLocaleLowerCase('pt-BR').includes(filtro)).map(p=>'<button type="button" class="pf-pedido '+(concluido(p)?'is-concluido':'is-pendente')+'" data-id="'+esc(p.id)+'" aria-current="'+(p.id===selecionado)+'">'+avatar(p)+'<span class="pf-pedido-txt"><strong>Pedido #'+esc(p.numero_pedido)+'</strong><span>'+esc(p.cliente_nome)+'</span><small>'+esc(p.local_nome||'')+' · '+dataBr(p.data_evento)+'</small><small>'+(concluido(p)?'Posição confirmada':estados.has(p.id)?'Em análise':'A conferir')+'</small></span></button>').join('')||'<div class="pf-vazio">'+(aba==='concluidos'?'Nenhum pedido concluído.':'Nenhum pedido pendente.')+'</div>';
  }
  host.querySelector('.pf-abas').addEventListener('click',e=>{const t=e.target.closest('[data-pf-aba]');if(!t||t.dataset.pfAba===aba)return;aba=t.dataset.pfAba;listar();});
  host.querySelector('input[type=search]').addEventListener('input',e=>{busca=e.target.value;listar();});
  lista.addEventListener('click',e=>{const bt=e.target.closest('[data-id]');if(bt)abrir(bt.dataset.id);});
  async function abrir(id){
   selecionado=id;listar();const req=++abertura;detalhe.innerHTML='<div class="fin-vazio">Carregando pedido…</div>';
   try{const dados=await rpc('fin_posicao_final_base',{p_empresa:S.emp,p_pedido:id});if(window.EvidenciasOperacao){try{const ids=[...new Set([id,...(dados.pedido.extras||[]).map(p=>p.id)].filter(Boolean))];dados.evidencias=(await Promise.all(ids.map(pedido=>window.EvidenciasOperacao.carregar(S.sb,S.emp,pedido)))).flat();}catch(e){dados.evidenciasErro=e.message;}}if(!ativo()||req!==abertura)return;b=dados;montar();}
   catch(e){if(ativo()&&req===abertura)detalhe.innerHTML='<p class="pf-erro" role="alert">'+esc(e.message)+'</p>';}
  }
  function evidenciasDoItem(item,evidencias=b.evidencias||[]){
   const chave=String(item.chave||'').replace(/^(credito|avaria|desaparecido):/,'');
   return evidencias.filter(e=>{
    if(String(e.chave)!==chave)return false;
    const tipo=['danificado','desistencia','nao_encontrado'].includes(e.descricao)?e.descricao:null;
    if(item.tipo==='avaria')return !tipo||tipo==='danificado';
    if(item.tipo==='desaparecido')return e.etapa==='coleta'&&(!tipo||tipo==='nao_encontrado');
    return e.etapa==='entrega'&&(!tipo||tipo==='desistencia'||tipo==='nao_encontrado');
   });
  }
  function financeiroUnificado(){
   const recebido=p=>Number(p.valor||0)+Number(p.juros||0)+Number(p.multa||0)-Number(p.desconto||0);
   const linhasTitulos=b.titulos.filter(t=>t.status!=='cancelado'||b.pagamentos.some(p=>p.receber_id===t.id));
   const recebimentos=pagos=>pagos.length?pagos.map(p=>'<div class="pf-recebimento '+(p.estornado_em?'pf-estornado':'')+'"><strong>'+brl(recebido(p))+'</strong><small>'+dataBr(p.data)+' \u00b7 '+esc(p.forma||'Forma n\u00e3o informada')+(p.estornado_em?' \u00b7 Estornado':'')+'</small></div>').join(''):'<span class="pf-nota">Nenhum recebimento</span>';
   return '<div class="pf-bloco"><h4>Pagamentos e saldo do pedido</h4><div class="pf-scroll"><table class="pf-tabela pf-financeiro-unificado"><thead><tr><th>Descri\u00e7\u00e3o</th><th>Vencimento</th><th>Valor</th><th>Recebimentos</th><th>Juros / multa e desconto</th><th>Quitado</th><th>Em aberto</th></tr></thead><tbody>'+linhasTitulos.map(t=>{
    const pagos=b.pagamentos.filter(p=>p.receber_id===t.id),validos=pagos.filter(p=>!p.estornado_em),juros=validos.reduce((v,p)=>v+Number(p.juros||0)+Number(p.multa||0),0),desconto=soma(validos,'desconto');
    return '<tr'+(t.status!=='cancelado'&&Number(t.aberto)<=0.004?' class="pf-quitado"':'')+'><td>'+esc(t.descricao)+((b.pedido.extras||[]).length&&t.pedido_numero?'<small class="pf-titulo-pedido">Pedido '+esc(t.pedido_numero)+'</small>':'')+(t.status==='cancelado'?'<small class="pf-nota">Cancelado</small>':'')+'</td><td>'+dataBr(t.vencimento)+'</td><td>'+brl(t.valor)+'</td><td>'+recebimentos(pagos)+'</td><td>'+(juros||desconto?'<small>Juros / multa: '+brl(juros)+'</small><small>Desconto: '+brl(desconto)+'</small>':'\u2014')+'</td><td>'+brl(Number(t.recebido||0)+Number(t.compensado||0))+'</td><td><strong>'+brl(t.aberto)+'</strong><small class="pf-nota">'+(t.status==='cancelado'?'Cancelado':Number(t.aberto)>0?'Em aberto':'Quitado')+'</small></td></tr>';
   }).join('')+b.pagamentos.filter(p=>!linhasTitulos.some(t=>t.id===p.receber_id)).map(p=>'<tr><td>Recebimento sem t\u00edtulo dispon\u00edvel</td><td>\u2014</td><td>\u2014</td><td>'+recebimentos([p])+'</td><td>\u2014</td><td>\u2014</td><td>\u2014</td></tr>').join('')+'</tbody></table>'+(linhasTitulos.length||b.pagamentos.length?'':'<div class="pf-vazio">Nenhum t\u00edtulo ou pagamento registrado.</div>')+'</div></div>';
  }
  // BV do decorador (nov/2026): o Comercial indicou no pedido quem recebe e quanto; aqui o Financeiro aprova (pode
  // descontar, ex.: itens danificados) ou não. Só ao confirmar a posição final o BV aprovado vai para Contas a pagar.
  const bvParteFinal=(pt,total,desc)=>total>0?Math.round(Number(pt.valor||0)*(total-desc)/total*100)/100:0;
  function blocoBv(final){
   const v=b.bv; if(!v)return '';
   const ini=(n)=>String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
   const pessoa=(pt)=>{let img='';try{const u=new URL(pt.foto);if(['https:','http:'].includes(u.protocol))img='<img src="'+esc(u.href)+'" alt="" loading="lazy" onerror="this.remove()">';}catch{}return '<span class="pf-avatar" aria-hidden="true"><b>'+esc(ini(pt.nome))+'</b>'+img+'</span><b>'+esc(pt.nome)+'</b>';};
   const total=Number(v.valor||0), decidido=v.aprovacao!=='pendente';
   const desc=decidido?Number(v.desconto||0):(bvSel.decisao==='aprovar'?Number(bvSel.desconto||0):0);
   const aprovado=decidido?v.aprovacao==='aprovado':bvSel.decisao==='aprovar', reprovado=decidido?v.aprovacao==='reprovado':bvSel.decisao==='reprovar';
   const linhasBv=(v.partes||[]).map(pt=>'<tr><td><div class="pf-bv-pessoa">'+pessoa(pt)+'</div></td><td>'+esc(String(pt.percentual).replace('.',','))+'%</td><td>'+brl(pt.valor)+'</td><td><strong data-bv-parte="'+esc(pt.cliente_id)+'">'+(reprovado?brl(0):brl(bvParteFinal(pt,total,desc)))+'</strong></td></tr>').join('');
   const cab='<h4>BV do decorador <small class="pf-bv-sub">'+esc(String(v.percentual).replace('.',','))+'% sobre a locação de '+brl(v.base)+(v.manual?' · negociado no pedido':'')+'</small></h4>'+(v.observacao?'<p class="pf-nota">'+esc(v.observacao)+'</p>':'');
   const tabela='<div class="pf-scroll"><table class="pf-tabela pf-bv-tabela"><thead><tr><th>Quem recebe</th><th>Parte</th><th>BV indicado pelo Comercial</th><th>A pagar</th></tr></thead><tbody>'+linhasBv+'</tbody></table></div>';
   if(decidido||final){
    const st=v.aprovacao==='aprovado'?'<span class="pf-bv-st ok">BV aprovado'+(v.legado?' (antes da aprovação na Posição final)':'')+'</span>':v.aprovacao==='reprovado'?'<span class="pf-bv-st nao">BV não aprovado</span>':'<span class="pf-bv-st">Aguardando decisão</span>';
    return '<div class="pf-bloco pf-bv">'+cab+tabela+'<div class="pf-bv-res">'+st+(Number(v.desconto)>0?'<span>Desconto no BV: <b>'+brl(v.desconto)+'</b></span>':'')+(v.motivo?'<span>Motivo: '+esc(v.motivo)+'</span>':'')+(v.aprovacao==='aprovado'?'<span>Em Contas a pagar: <b>'+brl(v.valor_aprovado??v.valor)+'</b></span>':'')+'</div></div>';
   }
   const sug=Number(v.sugestao_desconto||0);
   return '<div class="pf-bloco pf-bv">'+cab+tabela+
    '<div class="pf-bv-decisao"><span class="pf-motivo-rotulo">Aprovar o BV?</span><div class="pf-cobrar-botoes pf-bv-botoes" role="group" aria-label="Aprovar o BV">'+[['aprovar','Sim'],['reprovar','Não']].map(([k,t])=>'<button type="button" data-bv-decisao="'+k+'" value="'+(k==='aprovar'?'cobrar':'dispensar')+'" aria-pressed="'+(bvSel.decisao===k)+'">'+t+'</button>').join('')+'</div>'+
    '<label class="pf-bv-campo" '+(aprovado?'':'hidden')+' data-bv-desc-area><span>Descontar do BV</span><input type="text" inputmode="decimal" data-bv-desconto value="'+brl(bvSel.desconto)+'"></label>'+
    (sug>0?'<button type="button" class="fin-btn peq claro" data-bv-sugestao '+(aprovado?'':'hidden')+'>Descontar avarias e itens não encontrados ('+brl(Math.min(sug,total))+')</button>':'')+
    '<label class="pf-bv-campo pf-bv-motivo" data-bv-motivo-area '+((aprovado&&bvSel.desconto>0)||reprovado?'':'hidden')+'><span data-bv-motivo-rot>'+(reprovado?'Motivo para não aprovar':'Motivo do desconto')+'</span><input type="text" maxlength="500" data-bv-motivo value="'+esc(bvSel.motivo||'')+'"></label></div>'+
    '<p class="pf-nota">O BV só vai para Contas a pagar quando a posição final for confirmada com o BV aprovado. O desconto é repartido entre as pessoas na proporção de cada parte.</p></div>';
  }
  function ligarBv(){
   const area=detalhe.querySelector('.pf-bv'); if(!area||!b.bv||b.bv.aprovacao!=='pendente'||b.salvo?.status==='confirmado')return;
   const total=Number(b.bv.valor||0);
   const pintar=()=>{const ap=bvSel.decisao==='aprovar',rp=bvSel.decisao==='reprovar';
    area.querySelectorAll('[data-bv-decisao]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.bvDecisao===bvSel.decisao)));
    area.querySelector('[data-bv-desc-area]').hidden=!ap; const sb=area.querySelector('[data-bv-sugestao]'); if(sb)sb.hidden=!ap;
    area.querySelector('[data-bv-motivo-area]').hidden=!((ap&&bvSel.desconto>0)||rp);
    area.querySelector('[data-bv-motivo-rot]').textContent=rp?'Motivo para não aprovar':'Motivo do desconto';
    area.querySelector('[data-bv-desconto]').value=brl(bvSel.desconto);
    (b.bv.partes||[]).forEach(pt=>{const el=area.querySelector('[data-bv-parte="'+CSS.escape(pt.cliente_id)+'"]');if(el)el.textContent=rp?brl(0):brl(bvParteFinal(pt,total,ap?bvSel.desconto:0));});resumir();};
   area.querySelectorAll('[data-bv-decisao]').forEach(x=>x.addEventListener('click',()=>{bvSel.decisao=x.dataset.bvDecisao;pintar();}));
   area.querySelector('[data-bv-desconto]').addEventListener('input',e=>{bvSel.desconto=Math.min(total,Number(e.target.value.replace(/\D/g,'')||0)/100);pintar();});
   area.querySelector('[data-bv-sugestao]')?.addEventListener('click',()=>{bvSel.desconto=Math.min(total,Number(b.bv.sugestao_desconto||0));if(!bvSel.motivo)bvSel.motivo='Itens danificados ou não encontrados no evento';area.querySelector('[data-bv-motivo]').value=bvSel.motivo;pintar();});
   area.querySelector('[data-bv-motivo]').addEventListener('input',e=>bvSel.motivo=e.target.value);
  }
  function validarBv(confirmar){
   if(!confirmar||!b.bv||b.bv.aprovacao!=='pendente')return true;
   if(!bvSel.decisao){window.alerta?.('Decida se o BV deste pedido será aprovado.','BV','aviso');return false;}
   if(bvSel.decisao==='aprovar'&&bvSel.desconto>0&&!bvSel.motivo.trim()){window.alerta?.('Informe o motivo do desconto no BV.','BV','aviso');return false;}
   if(bvSel.decisao==='reprovar'&&!bvSel.motivo.trim()){window.alerta?.('Informe o motivo para não aprovar o BV.','BV','aviso');return false;}
   return true;
  }
  function valorFinal(x){return x.tipo==='credito'?Number(x.valor||0):x.decisao==='cobrar'?Math.max(0,Number(x.valor||0)-Number(x.desconto||0)):0;}
  function seletorNaoCobrar(x,i){
   const id=x.justificativa_id||'',historico=!!x.justificativa,valor=historico?(id||'__historico__'):'';
   const opcoes=(motivosNaoCobrar||[]).filter(m=>m.ativo&&String(m.id)!==String(historico?id:''));
   return '<select data-justificativa="'+i+'" aria-label="Motivo para n\u00e3o cobrar '+esc(x.nome)+'" '+(x.decisao==='dispensar'?'':'hidden')+'><option value="">'+(opcoes.length||historico?'Selecione o motivo':'Cadastre em Par\u00e2metros > Financeiro')+'</option>'+(historico?'<option value="'+esc(valor)+'" data-nome="'+esc(x.justificativa)+'" selected>'+esc(x.justificativa)+'</option>':'')+opcoes.map(m=>'<option value="'+esc(m.id)+'" data-nome="'+esc(m.nome)+'">'+esc(m.nome)+'</option>').join('')+'</select>';
  }
  function blocoMotivoNaoCobrar(x,i,final){
   if(x.tipo==='credito')return '';
   return '<tr class="pf-motivo-linha pf-linha-'+x.decisao+'" data-motivo-nao="'+i+'" '+(x.decisao==='dispensar'?'':'hidden')+'><td colspan="8"><div class="pf-nao-cobrar-motivo"><span class="pf-motivo-rotulo">Motivo para n\u00e3o cobrar</span>'+(final?'<p>'+esc(x.justificativa)+'</p>':seletorNaoCobrar(x,i))+'</div></td></tr>';
  }
  function campoCobranca(x,i,final){
   if(x.tipo==='credito')return 'Cr\u00e9dito autom\u00e1tico';
   return '<div class="pf-cobrar-botoes" role="group" aria-label="Cobrar '+esc(x.nome)+'">'+[['cobrar','Sim'],['dispensar','N\u00e3o']].map(([valor,nome])=>'<button type="button" data-decisao="'+i+'" value="'+valor+'" aria-pressed="'+(x.decisao===valor)+'" '+(final?'disabled':'')+'>'+nome+'</button>').join('')+'</div>';
  }
  function blocoMotivoDesconto(x,i,final){
   if(x.tipo==='credito')return '';
   return '<tr class="pf-motivo-linha pf-motivo-desconto-linha pf-linha-'+x.decisao+'" data-motivo-desconto-linha="'+i+'" '+(x.decisao==='cobrar'&&Number(x.desconto)>0?'':'hidden')+'><td colspan="8"><div class="pf-nao-cobrar-motivo"><span class="pf-motivo-rotulo">Motivo do desconto</span>'+(final?'<p>'+esc(x.motivo_desconto||'')+'</p>':'<input type="text" maxlength="500" data-motivo-desconto="'+i+'" aria-label="Motivo do desconto de '+esc(x.nome)+'" placeholder="Informe o motivo do desconto" value="'+esc(x.motivo_desconto||'')+'">')+'</div></td></tr>';
  }
  function campoDesconto(x,i,final){
   if(x.tipo==='credito')return '<td>—</td>';
   if(final)return '<td>'+brl(x.desconto)+'</td>';
   return '<td><div class="pf-desconto" data-desconto-area="'+i+'" '+(x.decisao==='cobrar'?'':'hidden')+'><input type="text" inputmode="decimal" data-desconto="'+i+'" aria-label="Desconto de '+esc(x.nome)+'" value="'+brl(x.desconto)+'"></div><small data-sem-desconto="'+i+'" '+(x.decisao==='cobrar'?'hidden':'')+'>—</small></td>';
  }
  function validarDescontos(){
   for(const x of linhas){if(x.decisao!=='cobrar')continue;
    if(!Number.isFinite(Number(x.desconto||0))||Number(x.desconto)<0||Number(x.desconto)>Number(x.valor||0)){window.alerta?.('O desconto não pode superar o valor da ocorrência: '+x.nome,'Desconto','aviso');return false;}
    if(Number(x.desconto)>0&&!x.motivo_desconto?.trim()){window.alerta?.('Informe o motivo do desconto de '+x.nome,'Desconto','aviso');return false;}
   }return true;
  }
  async function documento(){
   if(!validarDescontos())return;
   const atual=b,itensDocumento=linhas.map(x=>({...x}));
   try{
    let evidencias=atual.evidencias||[];
    if(window.EvidenciasOperacao){const ids=[...new Set([atual.pedido.id,...(atual.pedido.extras||[]).map(p=>p.id)].filter(Boolean))];evidencias=(await Promise.all(ids.map(id=>window.EvidenciasOperacao.carregar(S.sb,S.emp,id)))).flat();}
    const ocorrencias=itensDocumento.map(x=>({...x,evidencias:evidenciasDoItem(x,evidencias)}));
    const modulo=await import('./financeiro-posicao-documento.mjs?v=20261108-posicao-documento');
    const {data,error}=await S.sb.from('empresas').select('nome,logo_url').eq('id',S.emp);if(error)throw Error(error.message);
    let endereco=atual.pedido.observacoes?.projeto_comercial?.dados?.evento?.endereco||'';
    if(atual.pedido.local_id){const {data:locais,error}=await S.sb.from('locais_empresas').select('endereco,numero_endereco').eq('empresa_id',S.emp).eq('id',atual.pedido.local_id);if(error)throw Error(error.message);const local=locais?.[0];if(local?.endereco)endereco=[local.endereco,local.numero_endereco&&!local.endereco.includes(String(local.numero_endereco))?local.numero_endereco:''].filter(Boolean).join(', ');}
    modulo.abrirDocumentoPosicao({base:atual,linhas:ocorrencias,empresa:data?.[0],decorador:{nome:atual.pedido.cliente_nome,logo_url:fotoDe(pedidos.find(p=>p.id===atual.pedido.id)||atual.pedido)},endereco});
   }catch(e){window.alerta?.(e.message,'Documento','erro');}
  }
  function montar(){
   const final=b.salvo?.status==='confirmado', mesmaFonte=b.salvo?.fonte===b.fonte;
   const decisoes=new Map((mesmaFonte?b.salvo?.itens||[]:[]).map(x=>[x.chave,x]));
   {const sv=b.salvo?.bv||{};bvSel={decisao:sv.decisao||null,desconto:Number(sv.desconto||0),motivo:sv.motivo||''};}
   linhas=final?b.salvo.itens:b.itens.map(x=>({...x,decisao:x.tipo==='credito'?'credito':decisoes.get(x.chave)?.decisao||'pendente',justificativa:decisoes.get(x.chave)?.justificativa||'',justificativa_id:decisoes.get(x.chave)?.justificativa_id||null,desconto:Number(decisoes.get(x.chave)?.desconto||0),motivo_desconto:decisoes.get(x.chave)?.motivo_desconto||''}));
   detalhe.innerHTML='<header class="pf-cabecalho"><div class="pf-cab-cliente">'+avatar(pedidos.find(p=>p.id===b.pedido.id)||b.pedido,'grande')+'<div><h3>Pedido #'+esc(b.pedido.numero_pedido)+((b.pedido.extras||[]).length?' <small class="pf-extras">+ '+(b.pedido.extras||[]).map(x=>esc(x.numero)).join(', ')+'</small>':'')+'</h3><p>'+esc(b.pedido.cliente_nome)+' · '+esc(b.pedido.local_nome||'')+'</p></div></div><div class="pf-cab-cards" data-pf-cab-cards></div><span class="pf-status '+(final?'ok':'')+'">'+(final?'Posição confirmada':!b.entrega_confirmada?'Aguardando entrega':!b.coleta_confirmada?'Aguardando coleta':'Pronto para análise')+'</span></header><div class="pf-resumo"></div>'+
    (b.salvo&&!mesmaFonte?'<p class="pf-erro">Entrega, coleta ou preços foram alterados após esta análise. '+(final?'Os lançamentos confirmados abaixo preservam o fechamento original; revise a diferença antes de novos acertos.':'As decisões anteriores precisam ser revistas.')+'</p>':'')+
    '<div class="pf-bloco"><h4>Créditos e ocorrências do evento</h4><div class="pf-scroll"><table class="pf-tabela pf-ocorrencias"><thead><tr><th>Item / ocorrência</th><th>Evidências</th><th>Qtd.</th><th>Valor unitário</th><th>Total</th><th>Desconto</th><th>Valor final</th><th>Cobrar</th></tr></thead><tbody>'+linhas.map((x,i)=>'<tr data-linha="'+i+'" class="pf-linha-'+x.decisao+'"><td><div class="pf-item">'+foto(x.foto_url)+'<div><b>'+esc(x.nome)+'</b><small>'+({credito:'Não entregue · crédito de locação',avaria:'Avaria encontrada no evento',desaparecido:'Não encontrado no evento'}[x.tipo])+'</small>'+(x.motivo?'<small>'+esc(x.motivo)+'</small>':'')+'</div></div></td><td><div class="pf-evidencias-item" data-evidencias-item="'+i+'"></div></td><td>'+esc(x.quantidade)+'</td><td>'+(x.unitario===null?'Preço não informado':brl(x.unitario))+'</td><td>'+(x.valor===null?'—':brl(x.valor))+'</td>'+campoDesconto(x,i,final)+'<td><strong data-valor-cobrar="'+i+'">'+brl(valorFinal(x))+'</strong></td><td>'+campoCobranca(x,i,final)+'</td></tr>'+blocoMotivoNaoCobrar(x,i,final)+blocoMotivoDesconto(x,i,final)).join('')+'</tbody></table>'+(linhas.length?'':'<div class="pf-vazio">Nenhum item não entregue, avariado ou desaparecido nas confirmações registradas.</div>')+'</div></div>'+
    blocoBv(final)+financeiroUnificado()+
    '<p class="pf-nota">O crédito usa a locação dos itens não entregues. Avarias e itens desaparecidos usam o valor de reposição. Itens que já estavam no depósito não geram falta na coleta. Ao confirmar, a cobrança entra em A receber e o crédito na Conta dos decoradores. O saldo líquido considera os dois; a compensação ou devolução do crédito é feita pelo financeiro.</p>'+
    '<p class="pf-erro" role="alert" hidden></p><div class="pf-acoes"><button type="button" class="fin-btn claro" data-documento>Gerar documento</button>'+(final?'<span class="pf-nota">Confirmada em '+dataBr(b.salvo.confirmado_em)+'. Lançamentos gerados uma única vez.</span>':'<button type="button" class="fin-btn claro" data-salvar>Salvar análise</button><button type="button" class="fin-btn" data-confirmar '+(!b.entrega_confirmada||!b.coleta_confirmada?'disabled':'')+'>Confirmar posição final</button>')+'</div>';
   const cabecalhos=[...detalhe.querySelectorAll('.pf-ocorrencias th')].map(el=>el.textContent);detalhe.querySelectorAll('.pf-ocorrencias tbody tr[data-linha]').forEach(tr=>[...tr.children].forEach((td,i)=>td.dataset.label=cabecalhos[i]));
   detalhe.querySelectorAll('[data-evidencias-item]').forEach(galeria=>{
    const fotos=evidenciasDoItem(linhas[Number(galeria.dataset.evidenciasItem)]);
    if(fotos.length&&window.EvidenciasOperacao){
     window.EvidenciasOperacao.render(galeria,fotos,[],()=>{});
     galeria.querySelectorAll('a').forEach(link=>{link.removeAttribute('target');link.onclick=ev=>{ev.preventDefault();previewEvidencia(link);};});
    }
    else{const nota=document.createElement('small');nota.className='pf-nota';nota.textContent=b.evidenciasErro?'N\u00e3o foi poss\u00edvel carregar as fotos.':'Sem evid\u00eancia registrada';galeria.append(nota);}
   });
   detalhe.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>img.remove()));
   detalhe.querySelectorAll('[data-decisao]').forEach(el=>el.addEventListener('click',()=>{const i=Number(el.dataset.decisao);linhas[i].decisao=el.value;detalhe.querySelectorAll('[data-decisao="'+i+'"]').forEach(botao=>botao.setAttribute("aria-pressed",String(botao.value===el.value)));if(el.value!=='cobrar'){linhas[i].desconto=0;linhas[i].motivo_desconto='';const campo=detalhe.querySelector('[data-desconto="'+i+'"]');if(campo)campo.value=brl(0);const motivo=detalhe.querySelector('[data-motivo-desconto="'+i+'"]');if(motivo){motivo.value='';motivo.hidden=true;}}detalhe.querySelector('[data-motivo-desconto-linha="'+i+'"]').className='pf-motivo-linha pf-motivo-desconto-linha pf-linha-'+el.value;detalhe.querySelector('[data-motivo-desconto-linha="'+i+'"]').hidden=el.value!=='cobrar'||!(Number(linhas[i].desconto)>0);detalhe.querySelector('[data-desconto-area="'+i+'"]').hidden=el.value!=='cobrar';detalhe.querySelector('[data-sem-desconto="'+i+'"]').hidden=el.value==='cobrar';detalhe.querySelector('[data-linha="'+i+'"]').className='pf-linha-'+el.value;detalhe.querySelector('[data-motivo-nao="'+i+'"]').className='pf-motivo-linha pf-linha-'+el.value;detalhe.querySelector('[data-motivo-nao="'+i+'"]').hidden=el.value!=='dispensar';detalhe.querySelector('[data-justificativa="'+i+'"]').hidden=el.value!=='dispensar';resumir();}));
   detalhe.querySelectorAll('[data-justificativa]').forEach(el=>el.addEventListener('change',()=>{const x=linhas[Number(el.dataset.justificativa)];x.justificativa_id=el.value&&el.value!=='__historico__'?el.value:null;x.justificativa=el.value?(el.selectedOptions[0]?.dataset.nome||''):'';}));
   detalhe.querySelectorAll('[data-desconto]').forEach(el=>el.addEventListener('input',()=>{const i=Number(el.dataset.desconto),v=Number(el.value.replace(/\D/g,'')||0)/100;linhas[i].desconto=v;el.value=brl(v);detalhe.querySelector('[data-motivo-desconto-linha="'+i+'"]').hidden=v===0;detalhe.querySelector('[data-motivo-desconto="'+i+'"]').hidden=v===0;resumir();}));
   detalhe.querySelectorAll('[data-motivo-desconto]').forEach(el=>el.addEventListener('input',()=>linhas[Number(el.dataset.motivoDesconto)].motivo_desconto=el.value));
   ligarBv();
   detalhe.querySelector('[data-documento]').onclick=documento;
   carregarSaldoDecorador(b);detalhe.querySelector('[data-salvar]')?.addEventListener('click',()=>salvar(false));detalhe.querySelector('[data-confirmar]')?.addEventListener('click',()=>salvar(true));resumir();
  }
  function foto(url){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?'<img src="'+esc(u.href)+'" alt="" loading="lazy">':'';}catch{return '';}}
  // card do BV no resumo: o que vai para Contas a pagar (indicado pelo Comercial − desconto), ou zero se não aprovado
  function bvAPagar(){const v=b.bv;if(!v)return 0;if(v.aprovacao==='aprovado')return Number(v.valor_aprovado??v.valor)||0;if(v.aprovacao==='reprovado')return 0;
   if(bvSel?.decisao==='reprovar')return 0;return Math.max(0,Number(v.valor||0)-(bvSel?.decisao==='aprovar'?Number(bvSel.desconto||0):0));}
  function bvRotulo(){const v=b.bv;if(v.aprovacao==='aprovado')return 'BV aprovado (Contas a pagar)';if(v.aprovacao==='reprovado')return 'BV não aprovado';
   return bvSel?.decisao==='aprovar'?'BV a pagar (aprovando)':bvSel?.decisao==='reprovar'?'BV (não aprovar)':'BV do decorador · aguardando decisão';}
  // Cabeçalho (nov/2026): BV deste pedido e o saldo da conta do decorador SEM o BV deste pedido (para não contar duas vezes).
  function pintarCabCards(){
   const box=detalhe.querySelector('[data-pf-cab-cards]'); if(!box)return;
   const cards=[];
   if(b.bv)cards.push('<div class="pf-cab-card bv"><small>'+esc(bvRotulo())+'</small><strong>'+brl(bvAPagar())+'</strong></div>');
   if(b.saldoDecorador!=null)cards.push('<div class="pf-cab-card"><small title="Créditos e BVs de outros pedidos ainda em aberto na conta do decorador">Saldo na conta do decorador (sem este BV)</small><strong>'+brl(b.saldoDecorador)+'</strong></div>');
   box.innerHTML=cards.join('');
  }
  async function carregarSaldoDecorador(alvo){
   const cid=(pedidos.find(p=>p.id===alvo.pedido.id)||{}).cliente_id; if(!cid)return;
   try{
    const r=await rpc('pedido_saldo_conta_cliente',{p_empresa:S.emp,p_cliente:cid});
    const deste=(S.pagar||[]).filter(t=>t.origem==='bv'&&t.origem_id===alvo.pedido.id&&t.fornecedor_id===cid&&t.status!=='cancelado').reduce((x,t)=>x+(Number(t.aberto)||0),0);
    alvo.saldoDecorador=Math.round((Number(r?.total||0)-deste)*100)/100;
    if(b===alvo)pintarCabCards();
   }catch(_){}
  }
  function resumir(){
   pintarCabCards();
   detalhe.querySelectorAll('[data-valor-cobrar]').forEach(el=>el.textContent=brl(valorFinal(linhas[Number(el.dataset.valorCobrar)])));
   const final=b.salvo?.status==='confirmado',titulos=b.titulos.filter(t=>t.status!=='cancelado');
   const cre=soma(linhas.filter(x=>x.tipo==='credito'),'valor'),cob=linhas.filter(x=>x.decisao==='cobrar').reduce((t,x)=>t+valorFinal(x),0),descontos=soma(linhas.filter(x=>x.decisao==='cobrar'),'desconto');
   const aberto=soma(titulos,'aberto'),pago=b.pagamentos.filter(p=>!p.estornado_em).reduce((t,p)=>t+Number(p.valor)+Number(p.juros||0)+Number(p.multa||0)-Number(p.desconto||0),0);
   const creAberto=final?(Number(b.credito_titulo?.aberto)||0):cre;
   const liquido=aberto+(final?0:cob)-creAberto;
   detalhe.querySelector('.pf-resumo').innerHTML=[['Pedido',b.pedido.valor_total,''],['Pagamentos registrados',pago,''],['Em aberto nos títulos',aberto,''],['Crédito de locação',cre,'credito'],['Descontos nas ocorrências',descontos,'credito'],['Reposição a cobrar',cob,'custo'],[liquido>=0?'Saldo líquido a receber':'Saldo líquido a favor do cliente',Math.abs(liquido),liquido<0?'credito':'custo']].map(([t,v,c])=>'<div class="'+c+'"><small>'+t+'</small><strong>'+brl(v)+'</strong></div>').join('');
  }
  async function salvar(confirmar){
   if(!validarDescontos()||!validarBv(confirmar))return;
   // Nov/2026 (teste do usuário final, item 11): confirmar é definitivo; pergunta antes, mostrando o que falta receber.
   if(confirmar){
    const cartao=[...detalhe.querySelectorAll('.pf-resumo *')].find(el=>el.childElementCount===0&&/saldo líquido/i.test(el.textContent));
    const saldo=(cartao?.parentElement?.innerText||'').replace(/saldo líquido a receber/i,'').trim();
    const texto='Confirmar a posição final do pedido #'+(b.pedido.numero_pedido||'')+'? A cobrança e o crédito são lançados agora e não podem ser refeitos.'+(b.bv&&b.bv.aprovacao==='pendente'?(bvSel.decisao==='aprovar'?' O BV aprovado ('+brl(Math.max(0,Number(b.bv.valor||0)-Number(bvSel.desconto||0)))+') vai para Contas a pagar.':' O BV não será pago.'):'')+(saldo&&!/^R\$\s*0,00$/.test(saldo)?' Ainda falta receber '+saldo+'.':'');
    const ok=typeof window.confirmarGlobal==='function'?await window.confirmarGlobal(texto,'Confirmar posição final',{confirmarTexto:'Confirmar',cancelarTexto:'Voltar'}):confirm(texto);
    if(!ok)return;
   }
   const erro=detalhe.querySelector('[role=alert]'),botoes=detalhe.querySelectorAll('.pf-acoes button'),req=abertura,analisado=b;erro.hidden=true;botoes.forEach(x=>x.disabled=true);
   try{
    const salvo=await rpc('fin_posicao_final_salvar',{p_empresa:S.emp,p_pedido:analisado.pedido.id,p_fonte:analisado.fonte,p_versao:analisado.salvo?.versao||0,p_decisoes:linhas.map(x=>({chave:x.chave,decisao:x.decisao,justificativa:x.justificativa,justificativa_id:x.justificativa_id||null,desconto:Number(x.desconto||0),motivo_desconto:x.motivo_desconto||''})),p_confirmar:confirmar,p_bv:b.bv&&b.bv.aprovacao==='pendente'?{decisao:bvSel.decisao,desconto:Math.round(Number(bvSel.desconto||0)*100)/100,motivo:bvSel.motivo||''}:null});
    estados.set(salvo.pedido.id,salvo.salvo.status);if(salvo.salvo.status==='confirmado')aba='concluidos';
    if(confirmar)window.alerta?.('Posição final do pedido #'+(salvo.pedido?.numero_pedido||analisado.pedido.numero_pedido||'')+' confirmada.','Posição final','sucesso');
    if(confirmar&&ctx.recarregar){await ctx.recarregar();return;}
    if(!ativo()||req!==abertura)return;b={...salvo,evidencias:analisado.evidencias,evidenciasErro:analisado.evidenciasErro};listar();montar();
   }catch(e){if(ativo()&&req===abertura){erro.textContent=e.message;erro.hidden=false;botoes.forEach(x=>x.disabled=false);if(!b.coleta_confirmada||!b.entrega_confirmada)detalhe.querySelector('[data-confirmar]')?.setAttribute('disabled','');}}
  }
  {const sel=pedidos.find(p=>p.id===selecionado);if(sel)aba=concluido(sel)?'concluidos':'pendentes';}
  listar();if(selecionado&&pedidos.some(p=>p.id===selecionado))await abrir(selecionado);
 }
 window.FinanceiroPosicaoFinal={render,atualizarIndicador};
})();
