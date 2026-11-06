(function(){
 'use strict';
 const raiz=new URL('../../',document.currentScript.src);
 let apresentacao;
 const estados=new WeakMap();
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function preparar(){return apresentacao||=await import(new URL('Modulos/Comercial/Catalogo/projeto-apresentacao.mjs?v=20261103-sem-foto',raiz));}
 async function carregar(sb,empresa,base,etapa='entrega'){
  const api=await preparar(),ids=[...new Set([base.pedido.id,...base.itens.map(p=>p.pedido_id)].filter(Boolean))];
  const [pedidos,linhas]=await Promise.all([
   sb.from('separacoes_pedidos').select('id,numero_pedido,cliente_nome,local_nome,local_id,data_evento,data_evento_fim,data_entrega,data_coleta,observacoes').eq('empresa_id',empresa).in('id',ids),
   sb.from('separacoes_itens').select('id,separacao_pedido_id,item_id,item_nome,quantidade_solicitada,foto_url').eq('empresa_id',empresa).in('separacao_pedido_id',ids).order('created_at')
  ]);
  if(pedidos.error||linhas.error)throw Error((pedidos.error||linhas.error).message);
  if(!pedidos.data?.length)return null;
  if(base.pedido.extras?.length){
   const extras=await sb.from('separacoes_pedidos').select('id,numero_pedido,cliente_nome,local_nome,local_id,data_evento,data_evento_fim,data_entrega,data_coleta,observacoes').eq('empresa_id',empresa).in('numero_pedido',base.pedido.extras);
   if(extras.error)throw Error(extras.error.message);
   const novos=(extras.data||[]).filter(p=>!pedidos.data.some(atual=>atual.id===p.id));
   if(novos.length){
    const itensExtras=await sb.from('separacoes_itens').select('id,separacao_pedido_id,item_id,item_nome,quantidade_solicitada,foto_url').eq('empresa_id',empresa).in('separacao_pedido_id',novos.map(p=>p.id)).order('created_at');
    if(itensExtras.error)throw Error(itensExtras.error.message);
    pedidos.data.push(...novos);linhas.data.push(...itensExtras.data||[]);
   }
  }
  const projetos=pedidos.data.slice().sort((a,b)=>(a.id===base.pedido.id?-1:b.id===base.pedido.id?1:String(a.numero_pedido).localeCompare(String(b.numero_pedido),'pt-BR',{numeric:true}))).map(p=>{
   const projeto=p.observacoes?.projeto_comercial||{};
   const ambientes=(projeto.dados?.ambientes||[]).map(a=>({...a,itens:[...(a.itens||[])]}));
   const presentes=new Set(ambientes.flatMap(a=>a.itens.map(i=>String(i.item_id))));
   const soltos=(linhas.data||[]).filter(l=>l.separacao_pedido_id===p.id&&!presentes.has(String(l.item_id))).map(l=>({item_id:l.item_id,nome:l.item_nome,quantidade:Number(l.quantidade_solicitada)||1}));
   if(soltos.length)ambientes.push({id:'outros-'+p.id,nome:ambientes.length?'Outros itens':'Itens do pedido',itens:soltos,renders:[]});
   return {pedido:p,projeto:{...projeto,dados:{...projeto.dados,ambientes}}};
  });
  const itemIds=[...new Set([...projetos.flatMap(p=>p.projeto.dados.ambientes.flatMap(a=>a.itens.map(i=>i.item_id))),...base.itens.map(p=>p.item_id)].filter(Boolean))],cadastro=new Map();
  for(let i=0;i<itemIds.length;i+=100){
   const r=await sb.from('itens').select('id,produto,produto_base,descricao_total,foto_url,referencia,codigo,categoria,largura,altura,profundidade').eq('empresa_id',empresa).in('id',itemIds.slice(i,i+100));
   if(r.error)throw Error(r.error.message);(r.data||[]).forEach(item=>cadastro.set(String(item.id),item));
  }
  const findItem=id=>{const i=cadastro.get(String(id));if(!i)return null;const nome=[i.produto_base,i.produto].filter(Boolean).join(' ')||i.descricao_total||'Item';return {name:nome,fullName:i.descricao_total||nome,photo:i.foto_url||'',referencia:i.referencia||i.codigo||'',dims:[i.largura,i.altura,i.profundidade].every(v=>v==null)?'':[i.largura,i.altura,i.profundidade].map(v=>v==null?'–':Number(v)*100).join(' × ')+' cm'};};
  const principal=pedidos.data.find(p=>p.id===base.pedido.id)||pedidos.data[0],obs=principal.observacoes||{};
  const [empresaDados,decoradorDados]=await Promise.all([sb.from('empresas').select('nome,logo_url').eq('id',empresa),sb.from('clientes_empresas').select('nome_razao,catalogo_logo_url').eq('empresa_id',empresa).eq('nome_razao',principal.cliente_nome||'')]);
  let localEndereco=obs.projeto_comercial?.dados?.evento?.endereco||obs.projeto_comercial?.evento?.endereco||'';
  if(principal.local_id){
   const localDados=await sb.from('locais_empresas').select('endereco,numero_endereco').eq('empresa_id',empresa).eq('id',principal.local_id);
   if(localDados.error)throw Error(localDados.error.message);
   const local=localDados.data?.[0];
   if(local?.endereco){
    const endereco=local.endereco.trim(),numero=String(local.numero_endereco||'').trim();
    localEndereco=[endereco,numero&&!endereco.includes(numero)?numero:''].filter(Boolean).join(', ');
   }
  }
  const model={nome:principal.cliente_nome,local:principal.local_nome,localEndereco,data:principal.data_evento,dataFim:principal.data_evento_fim,numero:principal.numero_pedido,evento:{data_entrega:principal.data_entrega,hora_entrega:obs.horario_entrega,data_coleta:principal.data_coleta,hora_coleta:obs.horario_coleta},empresa:empresaDados.data?.[0]||null,decorador:{nome:principal.cliente_nome,logo_url:decoradorDados.data?.[0]?.catalogo_logo_url||''},ambientes:[],plantas:[]},usados=new Set();
  for(const {pedido,projeto} of projetos){
   const parcial=api.dadosApresentacao(projeto,findItem);
   for(const ambiente of parcial.ambientes){
    for(const item of ambiente.itens){
     const origens=new Set((linhas.data||[]).filter(l=>l.separacao_pedido_id===pedido.id&&String(l.item_id)===item.id).map(l=>String(l.id)));
     item.conferencias=[];
     base.itens.forEach((p,i)=>{if(!usados.has(i)&&(origens.has(String(p.chave).split('|')[0])||(!origens.size&&String(p.item_id)===item.id))){item.conferencias.push(i);usados.add(i);}});
     item.conferenciaKit=item.conferencias.some(i=>String(base.itens[i].item_id)!==item.id);
     if(item.conferenciaKit)item.componentesConferencia=item.conferencias.map(i=>{
      const p=base.itens[i],componente=api.dadosApresentacao({dados:{ambientes:[{id:'componente',itens:[{item_id:p.item_id,nome:p.nome,quantidade:p.previsto}]}]}},findItem).ambientes[0].itens[0];
      return {...componente,quantidade:p.previsto,conferencias:[i],componenteConferencia:true};
     });

    }
    if(pedido.id!==principal.id)ambiente.nome='Pedido extra #'+pedido.numero_pedido+' \u00b7 '+ambiente.nome;
    model.ambientes.push(ambiente);
   }
   if(projeto.dados.plantas?.length){
    const {plantasPedidoLeitura}=await import(new URL('Modulos/Comercial/Catalogo/catalogo-projetos.mjs?v=20261103-planta-operacional',raiz));
    model.plantas.push(...await plantasPedidoLeitura(projeto,findItem));
   }
  }
  const gruposAvulsos=new Map();
  base.itens.forEach((p,i)=>{
   if(usados.has(i))return;
   const origem=(linhas.data||[]).find(l=>String(l.id)===String(p.chave).split('|')[0]);
   const numero=p.pedido_numero||pedidos.data.find(pedido=>pedido.id===(p.pedido_id||origem?.separacao_pedido_id))?.numero_pedido;
   const extra=numero&&String(numero)!==String(principal.numero_pedido);
   const nome=extra?'Pedido extra #'+numero:(model.ambientes.length?'Itens adicionais':'Itens do pedido');
   if(!gruposAvulsos.has(nome))gruposAvulsos.set(nome,[]);
   gruposAvulsos.get(nome).push({id:p.item_id||p.chave,nome:p.nome,nomeCompleto:p.nome,quantidade:p.previsto,foto:findItem(p.item_id)?.photo||'',conferencias:[i]});
  });
  for(const [nome,itens] of gruposAvulsos)model.ambientes.push({id:'conferencia-avulsos-'+model.ambientes.length,nome,itens,imagens:[]});
  if(etapa==='coleta'){
   const saldo=new Map();base.itens.forEach(p=>saldo.set(String(p.item_id),(saldo.get(String(p.item_id))||0)+Number(p.previsto)));
   for(const ambiente of model.ambientes)for(const item of ambiente.itens){
    if(item.conferenciaKit)continue;
    const disponivel=saldo.get(String(item.id))||0;
    item.quantidade=Math.min(Number(item.quantidade),disponivel);saldo.set(String(item.id),Math.max(0,disponivel-item.quantidade));
   }
  }
  return model;
 }
 function previaLayouts(model,atual,entrega=true){
  const itens=model.ambientes.flatMap(a=>a.itens||[]),foto=itens.find(i=>i.photo)?.photo;
  const miniLista=Array.from({length:4},(_,i)=>'<span class="ec-previa-linha"><span class="ec-previa-mini-foto">'+(foto?'<img src="'+esc(foto)+'" alt="">':'')+'</span><span class="ec-previa-texto"><i></i><i></i></span><span class="ec-previa-celula"></span><span class="ec-previa-celula"></span><span class="ec-previa-celula"></span></span>').join('');
  const imagem='<span class="ec-previa-foto"><svg viewBox="0 0 100 65" fill="none" aria-hidden="true"><path d="M12 52 37 25 56 44 70 30 91 52Z" fill="#c2cdbf"/><circle cx="74" cy="16" r="7" fill="#c9b28c"/></svg></span>';
  return '<div class="ec-previas-layout" role="radiogroup" aria-label="Layout da lista">'+[
   ['final',entrega?'Fotos no final':'Vertical',entrega?'Folha vertical, com as fotos depois da lista.':'Lista em folha vertical.'],
   ['horizontal',entrega?'Horizontal \u00b7 fotos ao lado':'Horizontal',entrega?'Folha horizontal, com as fotos ao lado de cada ambiente.':'Lista em folha horizontal.']
  ].map(([valor,titulo,descricao])=>'<button type="button" class="ec-previa-opcao" role="radio" aria-checked="'+(atual===valor)+'" data-pedido-layout="'+valor+'"><span class="ec-previa-area"><span class="ec-previa-folha '+(valor==='horizontal'?'is-horizontal':'')+'" aria-hidden="true"><span class="ec-previa-cabecalho"></span><span class="ec-previa-titulo"></span><span class="ec-previa-corpo"><span class="ec-previa-lista">'+miniLista+'</span>'+(entrega?imagem:'')+'</span></span></span><strong>'+titulo+'</strong><small>'+descricao+'</small><span class="ec-previa-selecao" aria-hidden="true">'+(atual===valor?'Selecionado':'Selecionar')+'</span></button>').join('')+'</div>';
 }
 function montar(host,model,entrega){
  if(!model||!apresentacao)return;
  let estado=estados.get(host);
  if(!estado){estado={originais:new Map([...host.querySelectorAll('tr[data-item-index]')].map(tr=>[Number(tr.dataset.itemIndex),tr])),model,entrega};estados.set(host,estado);}
  const {originais}=estado;
  const colunas=entrega?['Entregue','Danificados','Desistência']:['Coletado','Danificados','N\u00e3o encontrado'];
  const layout=apresentacao.layoutPedido();
  estado.renderizar=layout=>apresentacao.listaConferenciaPedidoHtml(entrega?model:{...model,ambientes:model.ambientes.map(a=>({...a,imagens:[]}))},{layout,colunas,campos:item=>{
   const indices=item.conferencias||[];
   return colunas.map((_,col)=>'<td>'+(!indices.length?(col===0?'<small>Total do pedido na primeira ocorrência.</small>':'—'):indices.map(i=>{
    const tr=originais.get(i);if(!tr)return '';
    const nome=tr.querySelector('.ec-item-identidade strong')?.textContent||'';
    const repetido=model.ambientes.flatMap(a=>a.itens).filter(p=>p.id===item.id).length>1;
    const total=col===0&&repetido?'<small class="ec-componente">Total do pedido: '+esc(tr.children[1]?.textContent||'')+' un.</small>':'';
    let complemento='';
    if(entrega){
     const tipo=['entregue','danificado','desistencia'][col],nomeCampo=tipo==='entregue'?'motivo':'motivo_'+tipo;
     const seletor=tr.children[5].querySelector('select')?.cloneNode(true);
     if(seletor){
      seletor.name=nomeCampo;seletor.setAttribute('aria-label','Motivo de '+tipo+' - '+nome);
      const gravados=JSON.parse(seletor.dataset.motivos||'{}');
      const valor=estado.motivos?.get(nomeCampo+':'+i)??gravados[tipo]?.id??seletor.value;
      [...seletor.options].forEach(op=>op.toggleAttribute('selected',op.value===valor));
      complemento='<div class="ec-documento-motivo" data-motivo-item="'+i+'" data-motivo-tipo="'+tipo+'" hidden>'+seletor.outerHTML+(col===0?(tr.querySelector('[data-falta]')?.outerHTML||''):'')+'</div>';
     }
     if(col===2)complemento+=tr.querySelector('.ec-fotos-item')?.outerHTML||'';
    }else{
     if(col===0)complemento='<div class="ec-documento-motivo" data-motivo-item="'+i+'" hidden>'+tr.children[5].innerHTML+'</div>';
     if(col===1)complemento+=tr.querySelector('.ec-fotos-item')?.outerHTML||'';
    }
    return '<div class="ec-documento-campo">'+total+(indices.length>1?'<small class="ec-componente">'+esc(nome)+'</small>':'')+(tr.children[entrega?[2,4,3][col]:col+2]?.innerHTML||'')+complemento+'</div>';
   }).join(''))+'</td>').join('');
  }});
  host.innerHTML=estado.renderizar('final');
  host.querySelectorAll('.cpj-order-renders,.cpj-order-plantas,.cpj-order-planta,.cpj-order-planta-folha').forEach(el=>el.remove());
  host.querySelectorAll('.ec-documento-item>td:nth-child(3)>small').forEach(el=>{if(/^C\u00f3d\./.test(el.textContent.trim()))el.remove();});
  {
   const criarFoto=(original,tipo)=>{
    if(!original)return '<small class="ec-sem-foto">Sem anexo</small>';
    const foto=original.cloneNode(true);foto.dataset.fotoTipo=tipo;foto.hidden=false;
    foto.querySelector('input')?.setAttribute('data-foto-tipo',tipo);
    foto.querySelector('[data-galeria]')?.setAttribute('data-foto-tipo',tipo);
    foto.querySelector('[data-foto-obrigatoria]')?.remove();
    foto.querySelector('.ec-anexar span').textContent='Foto';
    return foto.outerHTML;
   };
   host.querySelectorAll('.ec-documento-tabela').forEach(tabela=>{
    tabela.classList.add('ec-conferencia-cinco');
    const grupo=tabela.querySelector('colgroup');
    grupo.children[4].after(document.createElement('col'));grupo.append(document.createElement('col'));
    tabela.querySelectorAll('tr').forEach(tr=>{
     if(tr.classList.contains('ec-documento-kit')){tr.lastElementChild.colSpan=5;return;}
     if(tr.classList.contains('cpj-order-environment')){tr.firstElementChild.colSpan=8;return;}
     if(tr.children.length!==6)return;
     const cabecalho=tr.classList.contains('cpj-order-colhead')||tr.parentElement.tagName==='THEAD';
     const tipo=cabecalho?tr.lastElementChild.tagName:'TD';
     const desist=document.createElement(tipo),dano=document.createElement(tipo);
     if(cabecalho){desist.textContent='Foto dano';dano.textContent=entrega?'Foto desist\u00eancia':'Foto n\u00e3o encontrado';}
     else{
      const anexo=tr.querySelector('.ec-fotos-item');
      desist.innerHTML=criarFoto(anexo,'danificado');dano.innerHTML=criarFoto(anexo,entrega?'desistencia':'nao_encontrado');anexo?.remove();
     }
     tr.children[4].after(desist);tr.append(dano);
    });
   });
  }
  if(!entrega)host.querySelectorAll('.ec-documento-item').forEach(linha=>{
   const campo=linha.querySelector('[data-i]');if(!campo)return;
   const original=originais.get(Number(campo.dataset.i));
   original?.querySelectorAll('.ec-dano-app,.ec-dano-fotos,.ec-deposito-nota').forEach(nota=>linha.children[2].append(nota.cloneNode(true)));
  });
  const tituloImpressao='Imprimir lista de '+(entrega?'entrega':'coleta');
  const form=host.closest('form');let seletor=form?.previousElementSibling;
  if(!seletor?.classList.contains('ec-documento-layout')){seletor=document.createElement('dialog');seletor.className='ec-documento-layout';seletor.hidden=true;seletor.setAttribute('aria-label',tituloImpressao);seletor.onclose=()=>{seletor.hidden=true;};form?form.before(seletor):host.before(seletor);}
  seletor.innerHTML='<header class="ec-impressao-cab"><h2>'+tituloImpressao+'</h2><button type="button" data-fechar-impressao aria-label="Fechar">&times;</button></header><p>Escolha o layout da lista.</p>'+previaLayouts(model,layout,entrega)+'<footer><button type="button" data-confirmar-impressao>Imprimir</button></footer>';
  seletor.querySelector('[data-fechar-impressao]').onclick=()=>seletor.close();
  seletor.querySelector('[data-confirmar-impressao]').onclick=()=>{seletor.close();estados.get(host)?.imprimir?.();};
  seletor.onclick=e=>{if(e.target===seletor){const r=seletor.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)seletor.close();}const botao=e.target.closest('[data-pedido-layout]');if(!botao)return;alterarLayout(host,botao.dataset.pedidoLayout);};
  host.querySelectorAll('.ec-documento-tabela tr.ec-documento-item').forEach(tr=>[...tr.children].forEach((td,i)=>td.dataset.label=['Qtd.','Foto','Item',...(entrega?['Entregue','Danificados','Foto dano','Desist\u00eancia','Foto desist\u00eancia']:['Coletado','Danificados','Foto dano','N\u00e3o encontrado','Foto n\u00e3o encontrado'])][i]));
  ajustarPlantas(host);
 }
 function alterarLayout(host,layout){
  const estado=estados.get(host);if(!estado)return;
  estado.motivos||=new Map();
  host.querySelectorAll('[data-i][name]').forEach(campo=>{
   if(campo.tagName==='SELECT')estado.motivos.set(campo.name+':'+campo.dataset.i,campo.value);
   const original=estado.originais.get(Number(campo.dataset.i))?.querySelector('[name="'+campo.name+'"]');if(!original)return;
   if(original.tagName==='SELECT'){[...original.options].forEach(opcao=>opcao.toggleAttribute('selected',opcao.value===campo.value));}
   else original.setAttribute('value',campo.value);
  });
  host.querySelectorAll('[data-fotos-item]').forEach(foto=>{const original=estado.originais.get(Number(foto.dataset.fotosItem))?.querySelector('[data-fotos-item]');if(original)original.replaceWith(foto.cloneNode(true));});
  apresentacao.layoutPedido(layout);montar(host,estado.model,estado.entrega);
  host.dispatchEvent(new CustomEvent('pedido-conferencia:layout',{bubbles:true}));
 }
 function ajustarPlantas(host){
  host.querySelectorAll('.cpj-order-planta-folha').forEach(folha=>{folha.style.zoom=Math.min(1,Math.max(0.1,(host.clientWidth-16)/folha.offsetWidth));});
 }
 window.addEventListener('resize',()=>document.querySelectorAll('.ec-documento-pedido').forEach(ajustarPlantas));
 function impressao(host,{titulo,subtitulo}){
  const estado=estados.get(host.parentElement);
  let copia=host.cloneNode(true);
  if(estado?.renderizar){
   const preparo=document.createElement('div');preparo.innerHTML=estado.renderizar(apresentacao.layoutPedido());
   copia=preparo.firstElementChild;
   host.querySelectorAll('[data-i][name]').forEach(campo=>{
    const destino=copia.querySelector('[data-i="'+campo.dataset.i+'"][name="'+campo.name+'"]');if(destino)destino.value=campo.value;
   });
  }
  copia.querySelectorAll('.ec-anexar,button,.ec-fotos-item').forEach(el=>el.remove());
  copia.querySelectorAll('input[type="number"],span[data-falta]').forEach(campo=>{
   const caixa=document.createElement('span');caixa.className='ec-impressao-quantidade';
   caixa.setAttribute('aria-label','Quantidade para preencher');campo.replaceWith(caixa);
  });
  copia.querySelectorAll('input,select,textarea').forEach(el=>{const texto=document.createElement('span');texto.textContent=el.tagName==='SELECT'?(el.value?el.selectedOptions[0]?.textContent:''):el.value;el.replaceWith(texto);});
  copia.querySelectorAll('img').forEach(img=>img.loading='eager');
  const horizontal=copia.classList.contains('is-horizontal');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>'+esc(titulo)+'</title><link rel="stylesheet" href="'+new URL('Modulos/Comercial/Catalogo/catalogo-projetos.css',raiz)+'"><link rel="stylesheet" href="'+new URL('Modulos/Logistica/EntregasColetas/entregas-coletas.css',raiz)+'"><style>'+apresentacao.estilosImpressaoPedido(horizontal)+'@media print{.ec-documento-tabela{display:table!important;width:100%!important}.ec-documento-tabela tbody{display:table-row-group!important}.ec-documento-tabela tr{display:table-row!important}.ec-documento-tabela td,.ec-documento-tabela th{display:table-cell!important}.ec-documento-tabela td::before{display:none!important}.ec-documento-tabela .cpj-order-colhead{display:table-row!important}.ec-documento-pedido.is-horizontal .cpj-order-amb.has-foto .cpj-order-amb-corpo{display:grid!important;grid-template-columns:minmax(0,2fr) minmax(150px,1fr)!important}}</style></head><body>'+copia.outerHTML+'</body></html>';

 }
 function escolherImpressao(host,imprimir){
  const estado=estados.get(host);if(!estado)return;
  estado.imprimir=imprimir;
  const seletor=host.closest('form')?.previousElementSibling;
  if(seletor?.classList.contains('ec-documento-layout')){seletor.hidden=false;if(!seletor.open)seletor.showModal();}
 }
 window.PedidoConferencia={preparar,carregar,montar,impressao,escolherImpressao};
})();
