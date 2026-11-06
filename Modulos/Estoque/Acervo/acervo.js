(function(){'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nomes={aguardando_retorno:'Aguardando retorno físico',triagem:'Triagem',limpeza:'Limpeza',reparo:'Reparo',inspecao:'Inspeção final',investigacao:'Item não encontrado',liberado:'Liberado para locação',baixado:'Baixa patrimonial'};
 const destinos={triagem:['limpeza','reparo','inspecao'],limpeza:['inspecao'],reparo:['inspecao'],inspecao:['liberado','reparo','baixado'],investigacao:['triagem','baixado']};
 const s={sb:null,empresa:null,aba:'retorno',dados:null,itens:[],busca:'',estado:'abertos',inv:null};
 const msg=(v,erro=false)=>{$('acStatus').textContent=v;$('acStatus').classList.toggle('erro',erro);for(const dlg of document.querySelectorAll('.ac-dialogo[open]')){let aviso=dlg.querySelector('[data-ac-aviso]');if(!aviso){aviso=document.createElement('p');aviso.dataset.acAviso='';aviso.setAttribute('role','status');dlg.querySelector('.ac-dialogo-topo').after(aviso);}aviso.textContent=v;aviso.style.color=erro?'#b34238':'#467f68';}};
 const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 async function rpc(nome,args){const {data,error}=await s.sb.rpc(nome,{p_empresa:s.empresa,...args});if(error)throw Error(error.message);return data;}
 let cargaPainel=0;
 async function carregar(){const seq=++cargaPainel,dados=await rpc('acervo_painel',{});
  const codigos=[...new Set((dados.ordens||[]).filter(o=>o.codigo).map(o=>o.codigo))],mapa=new Map();
  for(let de=0;de<codigos.length;de+=100){try{const {data}=await s.sb.from('itens').select('id,codigo,foto_url').eq('empresa_id',s.empresa).in('codigo',codigos.slice(de,de+100));for(const i of data||[])mapa.set(String(i.codigo),i);}catch{}}
  for(const o of dados.ordens||[]){const item=mapa.get(String(o.codigo));o.foto_url=o.foto_url||item?.foto_url||'';o.item_id=o.item_id||item?.id||null;}
  const {data:catalogo,error:erroCatalogo}=await s.sb.from('itens').select('id,codigo,produto,foto_url,estoque_total').eq('empresa_id',s.empresa).order('foto_url',{ascending:false,nullsFirst:false}).order('produto').limit(80);
  if(erroCatalogo)throw erroCatalogo;
  dados.catalogo=catalogo||[];
  dados.exemplos=[];
  if(seq!==cargaPainel)return;s.dados=dados;render();}

 async function executar(botao,fn){botao.disabled=true;try{await fn();if($('acDetalhe').open)$('acDetalhe').close();await carregar();msg('Registro salvo.');}catch(e){msg(e.message,true);}finally{botao.disabled=false;}}
 function render(){document.querySelectorAll('[data-aba]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.aba===s.aba)));if(s.aba==='retorno')retornos();else if(s.aba==='ocorrencias'){window.SeparacaoOcorrencias.painel({host:$('acConteudo'),sb:s.sb,empresa:s.empresa,fila:'acervo',layout:'pedidos'});}else if(s.aba==='divergencias'){window.AcervoDivergencias.render({host:$('acConteudo'),sb:s.sb,empresa:s.empresa,esc,msg});}else inventarios();}
 function retornos(){window.AcervoPainel.render({host:$('acConteudo'),s,esc,nomes,abrir:abrirCard,gerenciar:gerenciarOS,abrirPedido});}
 async function abrirPedido(evento,selecionado){
  let dlg=$('acPedido');if(!dlg){dlg=document.createElement('dialog');dlg.id='acPedido';dlg.className='ac-dialogo ac-pedido-dialogo';document.body.append(dlg);}
  const requisicao=Symbol();dlg._requisicao=requisicao;
  dlg.innerHTML='<div class="ac-dialogo-topo"><h2>Pedido #'+esc(evento.numero_pedido)+(evento.simulado?' \u00b7 Simulado':'')+'</h2><button type="button" data-fechar aria-label="Fechar">×</button></div><div data-pedido-itens role="status">Carregando itens...</div>';
  dlg.querySelector('[data-fechar]').onclick=()=>dlg.close();if(!dlg.open)dlg.showModal();
  try{
   if(!evento.id)throw Error('Pedido sem identificador para consultar o documento.');
   const api=await window.PedidoConferencia.preparar();
   const model=await window.PedidoConferencia.carregar(s.sb,s.empresa,{pedido:{id:evento.id},itens:[]});
   if(!model)throw Error('Pedido não encontrado.');
   if(dlg._requisicao!==requisicao||!dlg.open)return;
   const documento=api.listaConferenciaPedidoHtml(model,{layout:'final'});
   const frame=document.createElement('iframe');frame.className='ac-pedido-documento';frame.title='Pedido #'+(model.numero||evento.numero_pedido)+' sem valores';frame.setAttribute('sandbox','allow-same-origin');
   const estilos=['catalogo-projetos.css','projeto-apresentacao.css'].map(nome=>'<link rel="stylesheet" href="'+esc(new URL('../../Comercial/Catalogo/'+nome,location.href).href)+'">').join('');
   frame.srcdoc='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+estilos+'<style>html,body{margin:0;background:#fff;color:#34352f;font-family:Arial,sans-serif}body{padding:12px;box-sizing:border-box}.cpj-order-paper{box-sizing:border-box;width:100%;max-width:100%;margin:0;box-shadow:none}.cpj-order-table{width:100%;table-layout:fixed}.cpj-order-col-qty{width:50px}.cpj-order-col-photo{width:76px}.cpj-order-table td{overflow-wrap:anywhere}.cpj-order-photo img{max-width:100%;object-fit:contain}.cpj-order-planta-folha{max-width:100%;overflow:hidden}@media(max-width:600px){body{padding:6px}.cpj-order-paper{padding:12px!important}.cpj-order-col-photo{width:58px}}</style></head><body>'+documento+'</body></html>';
   dlg.querySelector('[data-pedido-itens]').replaceChildren(frame);
  }catch(e){if(dlg._requisicao===requisicao&&dlg.open)dlg.querySelector('[data-pedido-itens]').textContent='Não foi possível carregar o pedido: '+e.message;}
 }

 function abrirCard(id){
  const r=s.dados.retornos.find(r=>r.id===id);if(!r)return;s.card=id;
  const area=$('acConferenciaItem');if(!area)return;
  area.innerHTML='<div id="acRetornos"></div><section id="acEncaminhar"></section><section id="acOrdemInline" class="ac-ordem-inline"></section>';listaRetornos(id);
  $('acEncaminhar').innerHTML=r.os_numero?'<p><b>O.S #'+esc(r.os_numero)+'</b> <button type="button" id="acAbrirOS">Gerenciar ordem</button></p>':'';
  $('acAbrirOS')?.addEventListener('click',()=>gerenciarOS(r,r.os_id));
 }
 function gerenciarOS(r,osId=null){
  if(!r)return;const ordem=osId?(s.dados.ordens||[]).find(o=>o.id===osId):null;
  if(osId&&ordem?.fonte!=='sistema'){msg('Esta O.S pertence ao histórico anterior. Consulte o registro em O.S concluídas.',true);return;}
  window.AcervoOrdens.abrir({dlg:$('acOrdemInline'),r,ordem,esc,rpc,concluido:async()=>{if($('acDetalhe').open)$('acDetalhe').close();await carregar();msg('Ordem de serviço salva.');}});
 }
 function listaRetornos(id){
  const lista=s.dados.retornos.filter(r=>(!id||r.id===id)&&(id||s.estado==='todos'||s.estado==='abertos'&&!['liberado','baixado'].includes(r.estado)||s.estado===r.estado)&&(id||[r.nome,r.numero_pedido,r.cliente_nome].join(' ').toLocaleLowerCase('pt-BR').includes(s.busca.toLocaleLowerCase('pt-BR'))));
  $('acRetornos').innerHTML=lista.map(r=>'<article class="ac-card" data-id="'+r.id+'">'+(destinos[r.estado]?'<form><label>Próximo destino<select name="destino">'+destinos[r.estado].map(v=>'<option value="'+v+'">'+nomes[v]+'</option>').join('')+'</select></label><label>Motivo / resultado da inspeção<input name="motivo" required minlength="5" maxlength="500"></label><label>Custo adicional do tratamento<input name="custo" type="number" min="0" step="0.01" value="0"></label><button>Registrar</button></form>':'')+'<div class="ac-fotos" data-fotos="'+r.id+'"></div></article>').join('')||'<div class="ac-vazio">Nenhuma peça nesta situação.</div>';
  lista.forEach(r=>{const card=$('acRetornos').querySelector('[data-id="'+r.id+'"]');card.querySelector('form')?.addEventListener('submit',e=>{e.preventDefault();const f=e.target;executar(f.querySelector('button'),()=>rpc('acervo_movimentar',{p_id:r.id,p_versao:r.versao,p_destino:f.destino.value,p_motivo:f.motivo.value,p_custo:Number(f.custo.value)}));});fotos(r,card.querySelector('[data-fotos]'));});
 }
 // fotos do retorno: anexadas na coleta, do App (link público, campo url) e da Triagem da volta (bucket informado)
 async function fotos(r,host){for(const e of r.evidencias||[]){let url=/^https:\/\//.test(e.url||'')?e.url:'';if(!url&&e.path){const {data,error}=await s.sb.storage.from(e.bucket||'evidencias-operacionais').createSignedUrl(e.path,600);if(!error)url=data.signedUrl;}if(!url||!host.isConnected)continue;const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';const img=document.createElement('img');img.src=url;img.alt=e.descricao||'Evidência no evento';a.append(img);host.append(a);}}
 async function inventarios(){
  if(s.carregandoInventario)return;s.carregandoInventario=true;
  $('acConteudo').innerHTML='<div class="ac-card" role="status">Carregando inventário e categorias…</div>';
  try{
   if(!window.AcervoContagens)await import('./acervo-contagens.js?v=20261105-categorias');
   if(!window.AcervoInventarioQualidade)await import('./acervo-inventario-qualidade.js?v=20261105-contagem-cega');
   await carregarItensInventario();if(s.aba!=='inventario')return;
   let atual=s.dados.inventarios.find(i=>i.id===s.inv);
   if(!atual||atual.status==='contagem'){
    s.inv=await rpc('acervo_inventario_geral',{});
    const dados=await rpc('acervo_painel',{});s.dados.inventarios=dados.inventarios;s.dados.retornos=dados.retornos;
    atual=s.dados.inventarios.find(i=>i.id===s.inv);
   }
   if(s.aba!=='inventario')return;if(!atual)throw Error('N\u00e3o foi poss\u00edvel carregar a contagem geral.');
   $('acConteudo').innerHTML='<div id="acInventario"></div>';
   window.AcervoInventarioQualidade.render({host:$('acInventario'),atual,esc,rascunhos:(s.rascunhosInventario??={}),catalogo:s.itens,componentes:s.componentesInventario||[],categoria:s.categoriaInventario,onCategoria:id=>s.categoriaInventario=id,tratamentos:s.dados.retornos,salvar:(botao,dados)=>executar(botao,()=>rpc('acervo_inventario_contar_cegas',{p_id:atual.id,...dados})),aprovar:botao=>executar(botao,()=>rpc('acervo_inventario_aprovar',{p_id:atual.id}))});
  }catch(e){msg(e.message,true);if(s.aba==='inventario'){$('acConteudo').innerHTML='<div class="ac-card"><p role="alert">Não foi possível abrir o inventário: '+esc(e.message)+'</p><button type="button" id="acTentarInventario">Tentar novamente</button></div>';$('acTentarInventario').onclick=inventarios;}}finally{s.carregandoInventario=false;}
 }
 async function carregarItensInventario(){
  if(s.itensInventarioCarregados)return;
  const itens=[];for(let de=0;;de+=1000){const {data,error}=await s.sb.from('itens').select('id,produto,descricao_total,codigo,tipo,categoria,foto_url,capa_categoria,estoque_total').eq('empresa_id',s.empresa).order('produto').range(de,de+999);if(error)throw error;itens.push(...data||[]);if((data||[]).length<1000)break;}
  const kits=itens.filter(window.AcervoContagens.kit).map(i=>i.id),componentes=[];
  for(let de=0;de<kits.length;de+=100){for(let pagina=0;;pagina+=1000){const {data,error}=await s.sb.from('kit_itens').select('kit_id,item_id,quantidade').in('kit_id',kits.slice(de,de+100)).order('kit_id').order('item_id').range(pagina,pagina+999);if(error)throw error;componentes.push(...data||[]);if((data||[]).length<1000)break;}}
  s.itens=itens;s.componentesInventario=componentes;s.itensInventarioCarregados=true;
 }
 // bolinha da aba Divergências: contagens gerais pendentes
 async function contarDivergencias(){try{
  const ocorrencias=await s.sb.from('separacao_ocorrencias').select('id',{count:'exact',head:true}).eq('empresa_id',s.empresa).eq('estado','acervo');const badge=document.querySelector('[data-aba="ocorrencias"] .tab-badge');if(badge)badge.textContent=ocorrencias.count||'';
const {count}=await s.sb.from('acervo_contagens_gerais').select('id',{count:'exact',head:true}).eq('empresa_id',s.empresa).eq('status','pendente');const b=document.querySelector('[data-aba="divergencias"] .tab-badge');if(b)b.textContent=count||'';}catch{}}
 const atualizarPainel=()=>{if(s.empresa&&!document.hidden&&s.aba==='retorno'&&!document.querySelector('.ac-dialogo[open]')&&!document.activeElement?.matches('input,select'))carregar().catch(e=>msg(e.message,true));};setInterval(atualizarPainel,30000);document.addEventListener('visibilitychange',atualizarPainel);
 document.querySelectorAll('[data-aba]').forEach(b=>b.onclick=()=>{if(b.dataset.aba==='inventario'&&s.aba!=='inventario')s.inv=null;s.aba=b.dataset.aba;render();});
 (async()=>{const c=await window.aguardarContexto();s.sb=window.supabaseClient;s.empresa=c.empresa_id;await carregar();contarDivergencias();window.finalizarCarregamentoModulo?.();})().catch(e=>msg(e.message,true));
})();
