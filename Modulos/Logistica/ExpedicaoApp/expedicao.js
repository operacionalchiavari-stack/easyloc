/* App da Expedição (nov/2026): carregamento e descarregamento pelo celular, no mesmo formato do app da Triagem.
   Usa as mesmas regras da conferência do computador (Modulos/Logistica/Conferencia): operacao_iniciar_conferencia,
   operacao_ler_peca, operacao_registrar_caminhoes e operacao_concluir_conferencia. Cada leitura dá o sinal em tela
   cheia verde/amarelo/vermelho da Triagem. Pedido sem etiqueta de envio (separado no modo manual ou 1 clique) é
   conferido por quantidade. O que só o computador faz: carregar com pendência (motivo e nova data). */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),sb=window.supabaseClient;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const data=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'Sem data';
 const numero=v=>Number(v||0).toLocaleString('pt-BR');
 const imagens=url=>/^(https?:|data:)/i.test(url||'');
 const CAMPO={carregamento:'lida_carregamento_em',descarregamento:'lida_descarregamento_em'};
 const ROTULO={carregamento:'Carregamento',descarregamento:'Descarregamento'};
 const s={usuario:null,empresa:null,vinculos:[],fila:[],fotos:new Map(),etapa:'carregamento',coluna:'aguardando',datas:new Map(),ocupado:false,leitor:null,geracao:0,
  bloqueados:new Set(),semCaminhao:new Set(),cega:false,
  pedido:null,etiquetas:[],nomes:new Map(),fotoItem:new Map(),patLidos:new Set(),modo:'qr',pecas:[],q:{},primeira:null,recontou:false,concluido:null,capas:null};
 const marca=$('taLogoEmpresa');let geracaoMarca=0;
 const ajustarMarca=()=>marca.classList.toggle('quadrada',!!marca.naturalHeight&&marca.naturalWidth/marca.naturalHeight<1.6);
 marca.addEventListener('load',ajustarMarca);if(marca.complete)ajustarMarca();
 const avatar=(nome,url)=>'<span class="avatar">'+esc(String(nome||'?').trim().charAt(0).toUpperCase())+(imagens(url)?'<img src="'+esc(url)+'" alt="" loading="lazy">':'')+'</span>';
 function mensagem(texto,ok=false){$('taMensagem').hidden=!texto;$('taMensagem').classList.toggle('ok',ok);$('taMensagem').textContent=texto||'';}
 async function rpc(nome,args){const r=await sb.rpc(nome,args);if(r.error)throw Error(r.error.message);return r.data;}
 const NO_QUADRO=window.top!==window,APP='../../../app.html';
 const APP_MODO=new URLSearchParams(location.search).get('app')==='1';
 function irParaLogin(msg){if(NO_QUADRO){tela('taLogin');if(msg)mensagem(msg);return;}location.replace(APP);}
 function tela(id){if(APP_MODO&&window.AppCarregamento){id==='taCarregando'?AppCarregamento.mostrar():AppCarregamento.pronto();}['taLogin','taFila','taDetalhe','taCarregando'].forEach(x=>$(x).hidden=x!==id);const logado=id==='taFila'||id==='taDetalhe';$('taMarcaAcoes').hidden=!logado;$('taMarcaSaudacao').hidden=!logado;document.body.classList.toggle('ta-logado',logado);document.body.classList.toggle('ta-na-fila',id==='taFila');}
 async function identidade(empresa){
  const geracao=++geracaoMarca;
  const r=await Promise.allSettled([sb.rpc('catalogo_vitrine_login',empresa?{p_empresa_id:empresa}:{})]);
  if(geracao!==geracaoMarca)return;
  const brand=r[0].status==='fulfilled'?r[0].value.data:null,logo=brand?.logo_url||brand?.empresa?.logo_url;
  marca.hidden=!imagens(logo);if(imagens(logo)){marca.src=logo;marca.alt=brand?.nome||'Logo da empresa';$('taIconEmpresa').href=logo;}
  $('taMarcaNome').textContent=brand?.nome||s.empresaNome||'';$('taMarcaNome').hidden=imagens(logo);
 }
 async function confirmar(titulo,texto){const d=$('taConfirmacao');$('taConfirmacaoTitulo').textContent=titulo;$('taConfirmacaoTexto').textContent=texto;d.returnValue='cancelar';d.showModal();return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='confirmar'),{once:true}));}

 // ------------------------------------------------------------------ sessão e fila
 async function validarSessao(user){
  if(!user)throw Error('Entre com seu login para continuar.');
  if(window.EasyLoc2FA&&!await window.EasyLoc2FA.garantir({supabase:sb}))throw Error('Entrada cancelada.');
  const r=await sb.from('usuarios_empresas').select('empresa_id').eq('user_id',user.id);
  if(r.error)throw Error(r.error.message);
  if(!r.data?.length)throw Error('Seu usuário não está vinculado a uma empresa.');
  const sugerida=localStorage.getItem('expedicao-app:empresa');
  s.usuario=user;s.vinculos=r.data;
  await selecionarEmpresa(r.data.some(v=>v.empresa_id===sugerida)?sugerida:r.data[0].empresa_id);
 }
 async function selecionarEmpresa(empresa){
  const acesso=await rpc('funcionario_contexto',{p_empresa_id:empresa});
  if(!acesso?.ativo||acesso.dois_fatores_pendente)throw Error('Seu acesso está inativo ou precisa de verificação. Consulte o administrador.');
  s.empresa=empresa;localStorage.setItem('expedicao-app:empresa',empresa);
  s.nome=acesso.nome||s.usuario.email?.split('@')[0]||'Equipe';
  $('taNomeTopo').textContent=String(s.nome).trim().split(' ')[0];$('taConta').textContent=String(s.nome).trim().charAt(0).toUpperCase();$('taContaNome').textContent=s.nome;
  const nomes=await sb.from('empresas').select('id,nome').in('id',s.vinculos.map(v=>v.empresa_id));
  $('taEmpresa').innerHTML=s.vinculos.map(v=>'<option value="'+esc(v.empresa_id)+'" '+(v.empresa_id===empresa?'selected':'')+'>'+esc(nomes.data?.find(e=>e.id===v.empresa_id)?.nome||'Empresa')+'</option>').join('');
  s.empresaNome=nomes.data?.find(e=>e.id===empresa)?.nome||'';
  const regra=await sb.from('empresa_logistica_regras').select('descarregamento_conferencia').eq('empresa_id',empresa).maybeSingle();
  s.cegaDescarga=regra.data?.descarregamento_conferencia==='cegas';
  await identidade(empresa);await carregarFila();tela('taFila');
 }
 // Nov/2026: as mesmas colunas do quadro do computador, uma por aba: Aguardando conferência, Em conferência,
 // Aguardando entrega (conferidos) e Pendências. Cada pedido vira um cartão de ida (carregamento) ou de descarregamento.
 const COLUNAS=[{chave:'aguardando',nome:'Aguardando conferência'},{chave:'andamento',nome:'Em conferência'},{chave:'conferidos',nome:'Aguardando entrega'},{chave:'pendencias',nome:'Pendências'}];
 const TITULOS={aguardando:['Aguardando conferência','Pedidos para carregar ou descarregar.'],andamento:['Em conferência','Carregamentos e descarregamentos já começados.'],conferidos:['Aguardando entrega','Conferidos: carregados esperando a entrega, ou descarregados esperando a triagem da volta.'],pendencias:['Pendências','Conferidos com volume faltando.']};
 async function carregarFila(){
  const geracao=s.geracao,empresa=s.empresa;$('taAtualizar').disabled=true;
  try{
   const fila=await window.PedidoFluxo.fila(sb,empresa,'expedicao');
   if(geracao!==s.geracao||empresa!==s.empresa)return;
   s.fila=fila.filter(p=>!p.somente_consulta&&['expedicao','descarregamento','retorno_simultaneo','entrega','triagem_retorno','posicao_final'].includes(p.fluxo_etapa));
   const ids=s.fila.filter(p=>p.fluxo_etapa==='expedicao').map(p=>p.id);s.bloqueados=new Set();s.semCaminhao=new Set();
   for(let i=0;i<ids.length;i+=100){
    const parte=ids.slice(i,i+100);
    const [b1,b2]=await Promise.all([sb.rpc('pedidos_pagamento_bloqueados',{p_pedidos:parte,p_etapa:'carregamento'}),sb.rpc('pedidos_sem_caminhao_bloqueados',{p_pedidos:parte})]);
    (b1.data||[]).forEach(id=>s.bloqueados.add(String(id)));(b2.data||[]).forEach(id=>s.semCaminhao.add(String(id)));
   }
   s.datas=await window.AppFila.datas(sb,empresa,s.fila.map(p=>p.id));
   const cli=[...new Set(s.fila.map(p=>p.cliente_id).filter(Boolean))];
   for(let i=0;i<cli.length;i+=100){const r=await sb.from('clientes_empresas').select('id,catalogo_logo_url').eq('empresa_id',empresa).in('id',cli.slice(i,i+100));(r.data||[]).forEach(c=>s.fotos.set(c.id,c.catalogo_logo_url));}
   if(geracao===s.geracao&&empresa===s.empresa)renderFila();
  }finally{$('taAtualizar').disabled=false;}
 }
 const etapaDo=tipo=>tipo==='ida'?'carregamento':'descarregamento';
 function faltas(p,tipo){const r=p.operacao?.[etapaDo(tipo)];if(!r?.concluido_em||p.encerrado_operacional_em)return 0;return Array.isArray(r.faltando)?r.faltando.length:Number(r.faltando)||0;}
 function cartoes(){
  const out={aguardando:[],andamento:[],conferidos:[],pendencias:[]};
  s.fila.forEach(p=>{
   if(['expedicao','descarregamento','retorno_simultaneo'].includes(p.fluxo_etapa)){const tipo=p.fluxo_etapa==='expedicao'?'ida':'descarregamento';const col=p.operacao?.[etapaDo(tipo)]?.iniciado_em?'andamento':'aguardando';out[col].push({p,tipo,col});}
   else{const tipo=p.fluxo_etapa==='entrega'?'ida':'descarregamento';const col=faltas(p,tipo)?'pendencias':'conferidos';out[col].push({p,tipo,col});}
  });
  return out;
 }
 function motivoBloqueio(p,tipo,col){
  if(tipo!=='ida'||!['aguardando','andamento'].includes(col))return '';
  if(s.bloqueados.has(String(p.id)))return 'Aguardando o Financeiro: o pedido ainda não tem o pagamento mínimo.';
  if(s.semCaminhao.has(String(p.id)))return 'Sem caminhão programado no Painel Logístico.';
  return '';
 }
 const quando=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});};
 function cartaoHtml({p,tipo,col}){
  const d=s.datas?.get(String(p.id))||{},ida=tipo==='ida',reg=p.operacao?.[etapaDo(tipo)];
  let status;
  if(col==='pendencias')status=faltas(p,tipo)+' volume(s) com pendência';
  else if(col==='conferidos')status=(ida?'Carregado ':'Descarregado ')+quando(reg?.concluido_em)+(reg?.por?' por '+reg.por:'');
  else if(col==='andamento')status='Conferência em andamento';
  else if(ida&&!['separado','separado_com_divergencia'].includes(p.status))status='Ainda em separação';
  else status=ida?'Aguardando carregamento':'Aguardando descarregamento';
  return window.AppFila.cartao({id:p.id,numero:p.numero_pedido,cliente:p.cliente_nome,local:p.local_nome,foto:s.fotos.get(p.cliente_id),coluna:col,tipo,selo:ida?'Ida':'Descarregamento',trava:motivoBloqueio(p,tipo,col),
   datas:ida?[['Carregamento',d.carregamento||p.data_entrega||p.data_evento],['Entrega',p.data_entrega||p.data_evento]]:[['Coleta',p.data_coleta||p.data_evento],['Descarregamento',d.descarregamento||p.data_coleta||p.data_evento]],status});
 }
 function renderFila(){
  const termo=$('taBusca').value.trim().toLocaleLowerCase('pt-BR');
  const grupos=cartoes(),filtro=c=>!termo||[c.p.numero_pedido,c.p.cliente_nome,c.p.local_nome].join(' ').toLocaleLowerCase('pt-BR').includes(termo);
  const dataDe=c=>String((c.tipo==='ida'?c.p.data_entrega:c.p.data_coleta)||c.p.data_evento||'9999');
  const lista=grupos[s.coluna].filter(filtro).sort((a,b)=>dataDe(a).localeCompare(dataDe(b)));
  $('taFilaTitulo').textContent=TITULOS[s.coluna][0];$('taFilaDescricao').textContent=TITULOS[s.coluna][1];$('taFilaContagem').textContent=lista.length;
  const cont={};COLUNAS.forEach(c=>cont[c.chave]=grupos[c.chave].length);window.AppFila.nav($('taNavegacao'),COLUNAS,s.coluna,cont);
  $('taPedidos').innerHTML=lista.length?lista.map(cartaoHtml).join(''):'<div class="vazio">'+(termo?'Nenhum pedido encontrado.':'Nenhum pedido nesta coluna.')+'</div>';
 }

 // ------------------------------------------------------------------ pedido
 function pararCamera(){s.leitor?.desligar();const v=$('taCameraQuadro');if(v)v.hidden=true;}
 const nomeItem=e=>s.nomes.get(String(e.item_id))||e.item_nome||'Item';
 async function abrir(id){
  if(s.ocupado)return;s.ocupado=true;const geracao=s.geracao;mensagem('');pararCamera();
  try{
   const etapa=s.etapa;
   const [ped,etq]=await Promise.all([
    sb.from('separacoes_pedidos').select('id,numero_pedido,cliente_nome,cliente_id,local_nome,data_entrega,data_coleta,data_evento,operacao,modo_separacao,pedido_origem_id').eq('empresa_id',s.empresa).eq('id',id).maybeSingle(),
    sb.from('separacoes_etiquetas').select('*').eq('empresa_id',s.empresa).eq('separacao_pedido_id',id).order('codigo')]);
   if(ped.error||!ped.data)throw Error('Pedido não encontrado.');
   const pedido=ped.data;
   // Pedido extra e pedido com extras: a volta é conferida junto, por quantidade, no computador.
   if(etapa==='descarregamento'){
    if(pedido.pedido_origem_id)throw Error('O descarregamento deste pedido extra é conferido junto com o pedido principal.');
    const ex=await sb.from('separacoes_pedidos').select('id').eq('empresa_id',s.empresa).eq('pedido_origem_id',id).neq('status','cancelado');
    if((ex.data||[]).length)throw Error('Este pedido tem pedido extra: o descarregamento é conferido junto, pela Expedição do computador.');
   }
   const assumido=pedido.operacao?.[etapa]?.concluido_em?null:await rpc('operacao_iniciar_conferencia',{p_pedido:id,p_etapa:etapa});
   if(geracao!==s.geracao)return;
   s.pedido=assumido?.id?{...pedido,...assumido}:pedido;s.etiquetas=etq.data||[];s.patLidos=new Set();s.q={};s.primeira=null;s.recontou=false;
   s.cega=etapa==='descarregamento'&&s.cegaDescarga;
   s.modo=(!s.etiquetas.length||['manual','um-clique'].includes(s.pedido.modo_separacao))?'quantidade':'qr';
   const idsItens=[...new Set(s.etiquetas.map(e=>e.item_id).filter(Boolean))];
   if(s.modo==='quantidade'){
    s.pecas=await rpc('operacao_conferencia_pecas',{p_pedido:id,p_grupo:false})||[];
    const base=etapa==='descarregamento'?s.pedido.operacao?.carregamento?.itens:null;
    if(Array.isArray(base))s.pecas=s.pecas.map(p=>{const b=base.find(x=>x.chave===p.chave);return b?{...p,esperado:Number(b.conferido)||0}:p;});
    s.pecas.forEach(p=>{if(p.item_id)idsItens.push(p.item_id);});
   }
   s.nomes=new Map();s.fotoItem=new Map();
   const unicos=[...new Set(idsItens.map(String))];
   for(let i=0;i<unicos.length;i+=200){const r=await sb.from('itens').select('id,produto,descricao_total,foto_url').in('id',unicos.slice(i,i+200));(r.data||[]).forEach(c=>{s.nomes.set(String(c.id),c.descricao_total||c.produto||'Item');s.fotoItem.set(String(c.id),c.foto_url||'');});}
   s.capas=window.CapasOperacao?window.CapasOperacao.criar({sb,pedido:id,etapa,cega:s.cega}):null;if(s.capas)await s.capas.pronto.catch(()=>{});
   s.concluido=s.pedido.operacao?.[etapa]?.concluido_em?s.pedido.operacao[etapa]:null;
   renderDetalhe();tela('taDetalhe');window.scrollTo(0,0);
  }catch(e){mensagem(e.message);sinal('erro',{titulo:'Não dá para abrir este pedido',texto:e.message});}finally{s.ocupado=false;}
 }
 // Volumes a conferir: no carregamento, todas as etiquetas; no descarregamento, as que saíram no carregamento.
 function conferir(){if(s.etapa==='carregamento')return s.etiquetas;const c=s.etiquetas.filter(e=>e.lida_carregamento_em);return c.length?c:s.etiquetas;}
 function grupos(){const g=new Map();conferir().forEach(e=>{const k=e.separacao_item_id+'|'+e.item_id;if(!g.has(k))g.set(k,[]);g.get(k).push(e);});return [...g.values()];}
 function renderDetalhe(){
  const p=s.pedido,etapa=s.etapa,descarga=etapa==='descarregamento',editavel=!s.concluido;
  $('taDetalhe').innerHTML='<div class="voltar-linha"><button class="voltar" type="button" data-voltar>← Pedidos</button><strong class="voltar-numero">Pedido #'+esc(p.numero_pedido)+'</strong><span class="etapa-chip '+(descarga?'volta':'')+'">'+ROTULO[etapa].toUpperCase()+(s.cega?' · ÀS CEGAS':'')+'</span></div>'+
   '<section class="cartao pedido-detalhe"><div class="pessoa">'+avatar(p.cliente_nome,s.fotos.get(p.cliente_id))+'<div class="pessoa-texto"><strong>'+esc(p.cliente_nome||'')+'</strong><small>'+esc(p.local_nome||'')+'</small><small>'+data(descarga?p.data_coleta||p.data_evento:p.data_entrega||p.data_evento)+'</small></div>'+((!s.concluido&&s.modo==='qr')?'<button type="button" class="camera-btn" data-camera><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>Câmera</span></button>':'')+'</div><div id="taProgresso"></div></section>'+
   (s.concluido?'<div class="concluido"><h2>✓ '+ROTULO[etapa]+' concluído</h2><p>'+esc((s.concluido.por?'Por '+s.concluido.por+' · ':'')+(s.concluido.concluido_em?new Date(s.concluido.concluido_em).toLocaleString('pt-BR'):''))+'</p></div>':'')+
   (editavel&&s.modo==='qr'?'<section class="cartao leitor leitor-compacto"><div class="camera-quadro" id="taCameraQuadro" hidden title="Toque para ampliar"><video id="taVideo" playsinline muted aria-label="Câmera do leitor QR"></video><svg class="camera-marcador" id="taQrMarcador" aria-hidden="true" preserveAspectRatio="xMidYMid slice" hidden><polygon id="taQrContorno"/></svg><div class="camera-codigo" id="taQrCodigo" role="status">Aponte para o QR Code</div></div><form class="leitor-form" id="taFormCodigo"><input id="taCodigo" autocomplete="off" placeholder="Ou passe / digite o código" aria-label="Código do volume" maxlength="200"><button class="botao" type="submit" aria-label="Conferir código">↵</button></form><p class="ultima-leitura" id="taUltima" role="status"></p></section>':'')+
   (editavel&&s.modo==='quantidade'?'<div class="aviso-bloco ex-aviso-qtd">Este pedido foi separado sem etiquetas: a conferência é por quantidade. Conte e informe quanto foi '+(descarga?'descarregado':'carregado')+'.</div>':'')+
   '<div class="materiais-cab"><h2>Volumes</h2><span id="taRodada">'+(s.modo==='qr'?'QR Code':s.primeira?'2ª contagem':'Quantidade')+'</span></div><div class="materiais" id="taMateriais"></div>'+renderProtecao()+
   (editavel?'<footer class="rodape-detalhe"><button type="button" class="botao" id="taFinalizar">'+(s.primeira?'Confirmar segunda contagem':'Concluir '+ROTULO[etapa].toLowerCase())+'</button></footer>':'');
  renderMateriais();progresso();
  if(editavel&&s.modo==='qr'){
   s.leitor=window.EasyLocLeitor.criar({video:$('taVideo'),leituraContinua:true,aoDetectar:destacarQr,aoLer:async codigo=>{if(!s.ocupado)await ler(codigo);},aoMudar:ligada=>{const v=$('taCameraQuadro'),b=document.querySelector('[data-camera]');if(v)v.hidden=!ligada;if(b){b.classList.toggle('is-ligada',ligada);b.querySelector('span').textContent=ligada?'Fechar':'Câmera';}if(!ligada&&v)v.classList.remove('is-grande');}});
   $('taFormCodigo').onsubmit=e=>{e.preventDefault();ler($('taCodigo').value);};
  }
  if(editavel)$('taFinalizar').onclick=finalizar;
 }
 function destacarQr(qr){
  const svg=$('taQrMarcador'),texto=$('taQrCodigo'),quadro=$('taCameraQuadro');if(!svg||!texto)return;
  const ok=!!qr?.codigo;quadro.classList.toggle('qr-identificado',ok);texto.textContent=ok?qr.codigo:'Aponte para o QR Code';
  const contorno=ok&&qr.pontos?.length===4&&qr.largura>0&&qr.altura>0;svg.toggleAttribute('hidden',!contorno);
  if(contorno){svg.setAttribute('viewBox','0 0 '+qr.largura+' '+qr.altura);$('taQrContorno').setAttribute('points',qr.pontos.map(p=>p.x+','+p.y).join(' '));}
 }
 function renderProtecao(){const rows=(s.capas?.rows||[]).filter(r=>r.usa_capa);if(!rows.length)return '';const editar=!s.concluido;return '<details class="cartao protecao" id="taCapas"><summary>Material de proteção <span>'+rows.length+' modelo(s)</span></summary><p class="dica">Conte todas as capas deste modelo, inclusive as das sacolas. Use zero quando não houver.</p>'+rows.map(r=>'<div class="protecao-modelo"><h3>'+esc(r.nome)+'</h3>'+s.capas.celula({item_id:r.item_id,pedido_id:r.pedido_id},editar)+'</div>').join('')+'</details>';}
 const fotoHtml=id=>'<span class="material-foto">▧'+(imagens(s.fotoItem.get(String(id)))?'<img src="'+esc(s.fotoItem.get(String(id)))+'" alt="" loading="lazy">':'')+'</span>';
 function renderMateriais(){
  const campo=CAMPO[s.etapa];
  if(s.modo==='qr'){
   const lista=grupos();
   $('taMateriais').innerHTML=lista.length?lista.map(g=>{const ok=g.filter(e=>e[campo]).length,total=g.length,completo=ok>=total;
    return '<article class="material'+(!s.cega&&completo?' is-completo':'')+'"><div class="material-topo">'+fotoHtml(g[0].item_id)+'<div class="material-info"><h3>'+esc(nomeItem(g[0]))+'</h3><small>'+g.map(e=>'<span class="ex-etq'+(e[campo]?' is-ok':'')+'">'+esc(e.codigo)+'</span>').join(' ')+'</small></div><strong class="material-qtd">'+numero(ok)+(s.cega?'':'<small> / '+numero(total)+'</small>')+'</strong></div></article>';}).join(''):'<div class="vazio">Nenhum volume para conferir.</div>';
   if(s.cega)$('taMateriais').querySelectorAll('.ex-etq:not(.is-ok)').forEach(el=>el.remove());
   return;
  }
  const feito=new Map((s.concluido?.itens||[]).map(r=>[r.chave,r]));
  $('taMateriais').innerHTML=s.pecas.length?s.pecas.map(p=>{
   const travada=s.primeira&&Number(s.primeira[p.chave])===Number(p.esperado),editavel=!s.concluido&&!travada;
   const valor=s.concluido?feito.get(p.chave)?.conferido??'':s.q[p.chave]??'';
   return '<article class="material'+(!s.cega&&valor!==''&&Number(valor)===Number(p.esperado)?' is-completo':'')+'"><div class="material-topo">'+fotoHtml(p.item_id)+'<div class="material-info"><h3>'+esc(s.nomes.get(String(p.item_id))||p.nome||'Item')+'</h3>'+(p.kit_nome?'<small>Parte do kit: '+esc(p.kit_nome)+'</small>':'')+(s.cega?'':'<small>Saiu: '+numero(p.esperado)+'</small>')+'</div></div>'+
    '<div class="contagens"><span class="contagem-label">'+(s.concluido?'Conferido':s.primeira&&!travada?'2ª contagem':'Contado')+'</span>'+(s.concluido?'<strong class="material-qtd">'+numero(valor)+'</strong>':'<div class="stepper"><button type="button" data-delta="-1" data-chave="'+esc(p.chave)+'" '+(!editavel?'disabled':'')+' aria-label="Diminuir">−</button><input type="number" inputmode="numeric" min="0" step="1" value="'+esc(valor)+'" data-contagem="'+esc(p.chave)+'" '+(!editavel?'disabled':'')+' aria-label="Quantidade de '+esc(p.nome||'item')+'"><button type="button" data-delta="1" data-chave="'+esc(p.chave)+'" '+(!editavel?'disabled':'')+' aria-label="Somar">+</button></div>')+'</div>'+
    (s.primeira?'<p class="primeira-info">1ª contagem: '+esc(s.primeira[p.chave]??'—')+'</p>':'')+'</article>';
  }).join(''):'<div class="vazio">Este pedido não tem itens para conferir.</div>';
 }
 function progresso(){
  const host=$('taProgresso');if(!host)return;
  if(s.modo==='qr'){
   const lista=conferir(),lidas=lista.filter(e=>e[CAMPO[s.etapa]]).length,total=lista.length,pct=total?Math.round(lidas/total*100):0;
   host.innerHTML=s.cega?'<div class="resumo"><span>Conferência às cegas</span><strong>'+numero(lidas)+'<small> volume(s) lido(s)</small></strong></div>':'<div class="resumo"><span>Volumes conferidos</span><strong>'+numero(lidas)+'<small> / '+numero(total)+'</small></strong></div><div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><span style="width:'+pct+'%"></span></div>';
  }else{
   const preenchidos=s.pecas.filter(p=>s.concluido||(s.q[p.chave]!=null&&s.q[p.chave]!=='')).length;
   host.innerHTML='<div class="resumo"><span>Itens contados</span><strong>'+preenchidos+'<small> / '+s.pecas.length+'</small></strong></div>';
  }
 }

 // ------------------------------------------------------------------ sinal (o mesmo da Triagem)
 const SINAL_MS={ok:1100,aviso:2400,erro:2800};
 let sinalTimer=null,sinalTravado=false,audio=null;
 function tom(tipo){try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const notas=tipo==='ok'?[[1180,.09]]:tipo==='aviso'?[[660,.12],[660,.12]]:[[220,.35]];let t=audio.currentTime;notas.forEach(([f,d])=>{const o=audio.createOscillator(),g=audio.createGain();o.type=tipo==='erro'?'square':'sine';o.frequency.value=f;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.25,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+d+.02);t+=d+.07;});}catch(_){}}
 function fecharSinal(){clearTimeout(sinalTimer);const el=$('taSinal');if(el){el.classList.remove('ver');el.setAttribute('aria-hidden','true');}sinalTravado=false;}
 function sinal(tipo,{titulo,texto,nome,foto,contagem}={}){
  let el=$('taSinal');
  if(!el){el=document.createElement('div');el.id='taSinal';el.className='sinal';el.setAttribute('role','alert');el.setAttribute('aria-hidden','true');el.addEventListener('click',fecharSinal);document.body.appendChild(el);}
  const icone=tipo==='ok'?'✓':tipo==='aviso'?'!':'✕';el.className='sinal sinal-'+tipo;
  el.innerHTML='<div class="sinal-cartao">'+(imagens(foto)?'<div class="sinal-foto"><img src="'+esc(foto)+'" alt=""><span class="sinal-icone">'+icone+'</span></div>':'<div class="sinal-icone sinal-icone-grande">'+icone+'</div>')+'<strong class="sinal-titulo">'+esc(titulo||'')+'</strong>'+(nome?'<b class="sinal-nome">'+esc(nome)+'</b>':'')+(contagem?'<span class="sinal-contagem">'+contagem+'</span>':'')+(texto?'<p class="sinal-texto">'+esc(texto)+'</p>':'')+'<small class="sinal-dica">Toque para continuar</small></div>';
  void el.offsetWidth;el.classList.add('ver');el.setAttribute('aria-hidden','false');
  navigator.vibrate?.(tipo==='ok'?70:tipo==='aviso'?[90,70,90]:[260,90,260]);tom(tipo);
  sinalTravado=tipo!=='ok';clearTimeout(sinalTimer);sinalTimer=setTimeout(fecharSinal,SINAL_MS[tipo]);
 }

 // ------------------------------------------------------------------ leitura
 async function ler(texto){
  texto=String(texto||'').trim();if(!texto||s.ocupado||!s.pedido||sinalTravado||s.concluido)return;
  s.ocupado=true;mensagem('');const campo=CAMPO[s.etapa];
  try{
   const {tipo,codigo}=window.EasyLocLeitor.ler(texto);
   if(tipo==='ITEM'){sinal('erro',{titulo:'Leia a etiqueta de envio',texto:'O QR do item não diz qual unidade é. Leia a etiqueta de envio ou o QR fixo do móvel.'});return;}
   if(tipo==='PAT'&&s.patLidos.has(codigo)){sinal('aviso',{titulo:'Já conferido',texto:'Este móvel já foi lido nesta conferência.'});return;}
   if(tipo!=='PAT'){
    const etq=s.etiquetas.find(e=>e.codigo===codigo);
    if(!etq){const outra=await sb.from('separacoes_etiquetas').select('id').eq('empresa_id',s.empresa).eq('codigo',codigo).maybeSingle();sinal('erro',{titulo:outra.data?'Não é deste pedido':'Código não encontrado',texto:codigo+(outra.data?' — separe este volume.':'')});return;}
    if(s.etapa==='descarregamento'&&!conferir().includes(etq)){sinal('erro',{titulo:'Não saiu no carregamento',texto:codigo+' não foi carregado neste pedido.',nome:nomeItem(etq),foto:s.fotoItem.get(String(etq.item_id))});return;}
    if(etq[campo]){sinal('aviso',{titulo:'Já conferido',nome:nomeItem(etq),foto:s.fotoItem.get(String(etq.item_id)),texto:'Etiqueta '+etq.codigo});return;}
   }
   const r=await sb.rpc('operacao_ler_peca',{p_pedido:s.pedido.id,p_etapa:s.etapa,p_tipo:tipo==='PAT'?'PAT':'ENV',p_codigo:codigo});
   if(r.error){const tp=/j[aá] (foi )?confer|j[aá] lid/i.test(r.error.message)?'aviso':'erro';sinal(tp,{titulo:tp==='aviso'?'Já conferido':'Não foi possível ler',texto:r.error.message});return;}
   const atual=s.etiquetas.find(e=>e.id===r.data?.id);if(atual)Object.assign(atual,r.data);if(tipo==='PAT')s.patLidos.add(codigo);
   renderMateriais();progresso();$('taCodigo').value='';
   const g=grupos().find(l=>l.some(e=>e.id===atual?.id))||[];const ok=g.filter(e=>e[campo]).length;
   $('taUltima').textContent='✓ '+(atual?nomeItem(atual):'Volume')+' · leitura confirmada';
   sinal('ok',{titulo:!s.cega&&g.length&&ok>=g.length?'Item completo':'Leu!',nome:atual?nomeItem(atual):'Volume',foto:atual?s.fotoItem.get(String(atual.item_id)):'',contagem:s.cega?'Lidos: <b>'+numero(ok)+'</b>':'<b>'+numero(ok)+'</b> de '+numero(g.length)+' '+(s.etapa==='carregamento'?'carregados':'descarregados')});
  }catch(e){sinal('erro',{titulo:'Não foi possível ler',texto:e.message});}finally{s.ocupado=false;}
 }

 // ------------------------------------------------------------------ concluir
 async function escolherCaminhoes(){
  const [frota,prog]=await Promise.all([rpc('operacao_frota',{p_empresa:s.empresa}),rpc('operacao_caminhoes_programados',{p_pedidos:[s.pedido.id]})]);
  const programados=new Set((prog||[]).map(c=>String(c.caminhao_id||c.id)));
  const lista=(frota||[]).slice().sort((a,b)=>programados.has(String(b.id))-programados.has(String(a.id)));
  const d=$('taEscolha');
  $('taEscolhaItens').innerHTML=lista.length?lista.map(c=>'<label class="escolha-material ex-caminhao'+(programados.has(String(c.id))?' is-programado':'')+'"><input type="checkbox" value="'+esc(c.id)+'" '+(programados.has(String(c.id))?'checked':'')+'><span><strong>'+esc(c.codigo||c.placa||'Caminhão')+'</strong><small>'+esc([c.placa&&!/^SEM PLACA/i.test(c.placa)?c.placa:'',c.modelo,programados.has(String(c.id))?'Programado':''].filter(Boolean).join(' · '))+'</small></span></label>').join(''):'<p class="muted">Nenhum caminhão cadastrado em Logística › Caminhões.</p>';
  d.returnValue='';d.showModal();
  return new Promise(resolve=>{
   const ok=d.querySelector('[data-confirmar-caminhao]'),volta=d.querySelector('[data-fechar-escolha]');
   const fim=v=>{ok.onclick=null;volta.onclick=null;d.close();resolve(v);};
   volta.onclick=()=>fim(false);d.oncancel=e=>{e.preventDefault();fim(false);};
   ok.onclick=async()=>{const ids=[...d.querySelectorAll('input:checked')].map(i=>i.value);if(!ids.length){sinal('aviso',{titulo:'Escolha o caminhão',texto:'Marque em qual caminhão o pedido foi carregado.'});return;}
    ok.disabled=true;try{await rpc('operacao_registrar_caminhoes',{p_pedido:s.pedido.id,p_caminhoes:ids});fim(true);}catch(e){sinal('erro',{titulo:'Não foi possível registrar o caminhão',texto:e.message});}finally{ok.disabled=false;}};
  });
 }
 async function finalizar(){
  if(s.ocupado||!s.pedido||s.concluido)return;
  const etapa=s.etapa,carga=etapa==='carregamento';let args={p_pedido:s.pedido.id,p_etapa:etapa,p_aceitar_faltas:false};let faltam=0;
  if(s.modo==='qr'){
   faltam=conferir().filter(e=>!e[CAMPO[etapa]]).length;
  }else{
   for(const p of s.pecas){const v=s.q[p.chave];if(v===''||v==null||!Number.isInteger(Number(v))||Number(v)<0){mensagem('Informe a quantidade de todos os itens (0 se nada foi '+(carga?'carregado':'descarregado')+').');return;}}
   const diferentes=s.pecas.filter(p=>Number(s.q[p.chave])!==Number(p.esperado));
   if(!carga&&!s.primeira&&diferentes.length){
    s.primeira={...s.q};diferentes.forEach(p=>s.q[p.chave]='');renderDetalhe();
    sinal('aviso',{titulo:'Conte de novo',texto:diferentes.length+' item(ns) não bateram. Conte novamente só os liberados; a 1ª contagem fica guardada.'});return;
   }
   faltam=s.pecas.filter(p=>Number(s.q[p.chave])<Number(p.esperado)).reduce((n,p)=>n+Number(p.esperado)-Number(s.q[p.chave]),0);
   const quantidades={};s.pecas.forEach(p=>{quantidades[p.chave]=Number(s.q[p.chave]);});
   args={...args,p_quantidades:quantidades,p_observacoes:{},...(s.primeira?{p_primeira:s.primeira}:{})};
  }
  if(carga&&faltam){sinal('erro',{titulo:'Ainda faltam '+faltam+' volume(s)',texto:'Carregue tudo para concluir aqui. Para carregar com pendência (motivo e nova data), conclua na Expedição do computador.'});return;}
  if(!carga&&faltam&&s.modo==='qr'&&!s.recontou){s.recontou=true;sinal('aviso',{titulo:'Procure de novo',texto:(s.cega?'A contagem não bateu.':faltam+' volume(s) ainda não foram lidos.')+' Procure no caminhão e leia; depois toque em Concluir de novo.'});return;}
  pararCamera();
  try{await s.capas?.salvar(true);}catch(e){const c=$('taCapas');if(c){c.open=true;c.scrollIntoView({block:'center',behavior:'smooth'});}sinal('aviso',{titulo:'Material de proteção',texto:e.message});return;}
  if(carga){if(!await escolherCaminhoes())return;}
  else if(!await confirmar('Concluir descarregamento?',faltam||s.cega?'A diferença vai para a Gestão do acervo, que faz a contagem geral e resolve.':'Tudo conferido. O pedido segue para a triagem da volta.'))return;
  if(!carga)args.p_aceitar_faltas=faltam>0||s.cega;
  s.ocupado=true;
  try{
   const registro=await rpc('operacao_concluir_conferencia',args);
   s.pedido.operacao={...(s.pedido.operacao||{}),[etapa]:registro};s.concluido=registro;await s.capas?.carregar().catch(()=>{});
   renderDetalhe();const n=(registro?.faltando||[]).length;
   sinal(n?'aviso':'ok',{titulo:ROTULO[etapa]+' concluído',texto:n?'Diferença enviada para a Gestão do acervo.':carga?'O pedido segue para a entrega.':'O pedido segue para a triagem da volta.'});
  }catch(e){sinal('erro',{titulo:'Não foi possível concluir',texto:e.message});}finally{s.ocupado=false;}
 }
 async function voltar(){if(s.ocupado)return;pararCamera();s.pedido=null;mensagem('');tela('taFila');try{await carregarFila();}catch(e){mensagem(e.message);}}

 // ------------------------------------------------------------------ eventos
 $('taFormLogin').onsubmit=async e=>{
  e.preventDefault();if(s.ocupado)return;s.ocupado=true;const botao=e.target.querySelector('button');botao.disabled=true;mensagem('');
  try{const login=e.target.elements.login.value.trim(),senha=e.target.elements.senha.value;let r;
   if(login.includes('@'))r=await sb.auth.signInWithPassword({email:login,password:senha});
   else{const res=await sb.functions.invoke('funcionarios-admin',{body:{action:'login',login,password:senha}});if(res.error||!res.data?.session)throw Error('Login ou senha incorretos.');r=await sb.auth.setSession(res.data.session);}
   if(r.error||!r.data?.user)throw Error('Login ou senha incorretos.');await validarSessao(r.data.user);e.target.elements.senha.value='';
  }catch(err){mensagem(err.message);}finally{s.ocupado=false;botao.disabled=false;}
 };
 $('taBusca').oninput=renderFila;$('taAtualizar').onclick=async()=>{mensagem('');try{await carregarFila();}catch(e){mensagem(e.message);}};
 $('taPedidos').onclick=e=>{const b=e.target.closest('[data-pedido]');if(!b)return;if(b.dataset.trava){sinal('erro',{titulo:'Pedido bloqueado',texto:b.dataset.trava});return;}s.etapa=b.dataset.tipo==='ida'?'carregamento':'descarregamento';abrir(b.dataset.pedido);};
 $('taNavegacao').onclick=e=>{const b=e.target.closest('[data-coluna-aba]');if(b){s.coluna=b.dataset.colunaAba;mensagem('');renderFila();window.scrollTo(0,0);}};
 $('taConta').onclick=()=>$('taContaDialog').showModal();
 document.querySelector('[data-fechar-conta]').onclick=()=>$('taContaDialog').close();
 $('taEmpresa').onchange=async e=>{if(s.ocupado)return;$('taContaDialog').close();tela('taCarregando');try{await selecionarEmpresa(e.target.value);}catch(err){tela('taFila');mensagem(err.message);}};
 $('taSair').onclick=async()=>{pararCamera();s.geracao++;s.pedido=null;$('taContaDialog').close();try{await sb.auth.signOut({scope:'local'});}catch(_){}irParaLogin('');};
 $('taSairTopo').onclick=()=>{if(s.ocupado)return;location.href=APP;};
 document.body.classList.toggle('ta-app',APP_MODO);
 $('taVoltarApp').onclick=()=>$('taSairTopo').click();$('taAtualizarTopo').onclick=()=>$('taAtualizar').click();
 if(NO_QUADRO){$('taSairTopo').hidden=true;$('taSair').hidden=true;}
 $('taDetalhe').addEventListener('click',async e=>{
  if(e.target.closest('[data-voltar]'))return voltar();
  if(e.target.closest('#taCameraQuadro')){$('taCameraQuadro').classList.toggle('is-grande');return;}
  if(e.target.closest('[data-camera]')){try{if(s.leitor.ligada)pararCamera();else await s.leitor.ligar();}catch(err){mensagem(err.message);}return;}
  const delta=e.target.closest('[data-delta]');if(delta&&!s.ocupado){const k=delta.dataset.chave;s.q[k]=Math.max(0,Number(s.q[k]||0)+Number(delta.dataset.delta));renderMateriais();progresso();}
 });
 $('taDetalhe').addEventListener('input',e=>{if(e.target.dataset.contagem){s.q[e.target.dataset.contagem]=e.target.value===''?'':Number(e.target.value);progresso();}});
 document.addEventListener('error',e=>{if(e.target.matches('.avatar img,.material-foto img'))e.target.remove();},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pararCamera();});
 window.addEventListener('pagehide',pararCamera);
 window.addEventListener('offline',()=>{pararCamera();mensagem('Sem conexão. As leituras precisam de internet.');});
 // Leitor USB/bluetooth: bipar em sequência sem tocar na caixa do código (a caixa fica sempre marcada).
 if(window.EasyLocLeitor?.manterFoco)window.EasyLocLeitor.manterFoco(()=>document.getElementById('taCodigo'),codigo=>ler(codigo));
 window.addEventListener('online',()=>mensagem('Conexão restabelecida. Você pode continuar a conferência.',true));
 sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_OUT'){pararCamera();s.geracao++;s.pedido=null;irParaLogin('');}});
 (async()=>{await window.__limpezaDadosPronta;identidade(localStorage.getItem('expedicao-app:empresa'));try{const {data,error}=await sb.auth.getSession();if(error)throw Error(error.message);if(data.session?.user)await validarSessao(data.session.user);else irParaLogin('');}catch(e){if(NO_QUADRO){tela('taLogin');mensagem(e.message);}else{try{sessionStorage.setItem('app_aviso',e.message);}catch(_){}location.replace(APP);}}})();
})();
