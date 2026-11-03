(function(){
 'use strict';
 const $=id=>document.getElementById(id),sb=window.supabaseClient;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const data=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'Sem data';
 const numero=v=>Number(v||0).toLocaleString('pt-BR');
 const s={usuario:null,empresa:null,vinculos:[],fila:[],fotos:new Map(),etapa:'ida',base:null,q:{},danos:{},primeira:null,fotosNovas:new Map(),vistos:new Set(),ocupado:false,leitor:null,pendente:null,geracao:0};
 const imagens=url=>/^https?:\/\//i.test(url||'');
 const marca=$('taLogoEmpresa');let geracaoMarca=0;
 const ajustarMarca=()=>marca.classList.toggle('quadrada',!!marca.naturalHeight&&marca.naturalWidth/marca.naturalHeight<1.6);
 marca.addEventListener('load',ajustarMarca);if(marca.complete)ajustarMarca();
 const avatar=(nome,url)=>'<span class="avatar">'+esc(String(nome||'?').trim().charAt(0).toUpperCase())+(imagens(url)?'<img src="'+esc(url)+'" alt="" loading="lazy">':'')+'</span>';
 function mensagem(texto,ok=false){$('taMensagem').hidden=!texto;$('taMensagem').classList.toggle('ok',ok);$('taMensagem').textContent=texto||'';}
 async function rpc(nome,args){const r=await sb.rpc(nome,args);if(r.error)throw Error(r.error.message);if(r.data==null&&nome!=='separacao_producao_confirmar')throw Error('Não foi possível confirmar a resposta. Atualize e tente novamente.');return r.data;}
 function tela(id){['taLogin','taFila','taDetalhe','taCarregando'].forEach(x=>$(x).hidden=x!==id);const logado=id==='taFila'||id==='taDetalhe';$('taMarcaAcoes').hidden=!logado;$('taMarcaSaudacao').hidden=!logado;document.body.classList.toggle('ta-logado',logado);document.body.classList.toggle('ta-na-fila',id==='taFila');}
 async function identidade(empresa){
  const geracao=++geracaoMarca;
  const resultados=await Promise.allSettled([sb.rpc('catalogo_capas_publico',{}),sb.rpc('catalogo_vitrine_login',empresa?{p_empresa_id:empresa}:{})]);
  if(geracao!==geracaoMarca)return;
  const capa=resultados[0].status==='fulfilled'?resultados[0].value.data:null,brand=resultados[1].status==='fulfilled'?resultados[1].value.data:null;
  const url=capa?.portal||capa?.catalogo,logo=brand?.logo_url||brand?.empresa?.logo_url;
  const topo=document.querySelector('.marca');topo.classList.toggle('tem-capa',imagens(url));
  if(imagens(url))topo.style.setProperty('--triagem-capa','url('+JSON.stringify(url)+')');else topo.style.removeProperty('--triagem-capa');
  marca.hidden=!imagens(logo);if(imagens(logo)){marca.src=logo;marca.alt=brand?.nome||brand?.empresa?.nome||'Logo da empresa';$('taIconEmpresa').href=logo;}else{marca.removeAttribute('src');$('taIconEmpresa').removeAttribute('href');}
  $('taMarcaNome').textContent=brand?.nome||brand?.empresa?.nome||s.empresaNome||'';$('taMarcaNome').hidden=imagens(logo);
 }
 function pararCamera(){s.leitor?.desligar();const v=$('taVideo');if(v)v.hidden=true;}
 function bloquear(v){s.ocupado=v;document.querySelectorAll('#taDetalhe button,#taDetalhe input').forEach(el=>{const capa=el.closest('[data-capas-chave]'),fechada=capa&&(s.base.concluido||s.base.bloqueio||!s.base.pode_editar||s.capas?.rows.find(r=>r.chave===capa.dataset.capasChave)?.concluida);el.disabled=v||el.dataset.travado==='1'||!!fechada;});}
 function assinatura(){return JSON.stringify(s.base.itens.map(p=>[p.chave,p.esperado]));}
 function chaveRascunho(){return 'triagem-app:v1:'+s.usuario.id+':'+s.empresa+':'+s.base.pedido.id;}
 function guardar(){if(s.etapa!=='volta'||!s.base||s.base.concluido)return;try{localStorage.setItem(chaveRascunho(),JSON.stringify({assinatura:assinatura(),q:s.q,danos:s.danos,primeira:s.primeira,vistos:[...s.vistos]}));}catch(_){mensagem('A contagem está nesta tela, mas não foi possível guardar o rascunho no aparelho. Confirme antes de sair.');}}
 function carregarRascunho(){try{const d=JSON.parse(localStorage.getItem(chaveRascunho())||'null');if(d?.assinatura===assinatura()){s.q=d.q||{};s.danos=d.danos||{};s.primeira=d.primeira||null;s.vistos=new Set(d.vistos||[]);}}catch(_){/* Sem rascunho válido. */}}
 async function confirmar(titulo,texto){const d=$('taConfirmacao');$('taConfirmacaoTitulo').textContent=titulo;$('taConfirmacaoTexto').textContent=texto;d.returnValue='cancelar';d.showModal();return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='confirmar'),{once:true}));}

 async function validarSessao(user){
  if(!user)throw Error('Entre com seu login para continuar.');
  if(window.EasyLoc2FA&&!await window.EasyLoc2FA.garantir({supabase:sb}))throw Error('Entrada cancelada.');
  const r=await sb.from('usuarios_empresas').select('empresa_id').eq('user_id',user.id);
  if(r.error)throw Error(r.error.message);
  if(!r.data?.length)throw Error('Seu usuário não está vinculado a uma empresa.');
  const sugerida=new URLSearchParams(location.search).get('empresa')||localStorage.getItem('triagem-app:empresa');
  const empresa=r.data.some(v=>v.empresa_id===sugerida)?sugerida:r.data[0].empresa_id;
  s.usuario=user;s.vinculos=r.data;
  await selecionarEmpresa(empresa);
 }
 async function selecionarEmpresa(empresa){
  const acesso=await rpc('funcionario_contexto',{p_empresa_id:empresa});
  if(!acesso.ativo||acesso.dois_fatores_pendente)throw Error('Seu acesso está inativo ou precisa de verificação. Consulte o administrador.');
  s.empresa=empresa;s.base=null;s.fotos.clear();
  localStorage.setItem('triagem-app:empresa',empresa);
  s.nome=acesso.nome||s.usuario.user_metadata?.nome||s.usuario.email?.split('@')[0]||'Equipe';
  $('taNomeTopo').textContent=String(s.nome).trim().split(' ')[0];
  $('taConta').textContent=String(s.nome).trim().charAt(0).toUpperCase();
  $('taContaNome').textContent=s.nome;
  $('taEmpresa').innerHTML=s.vinculos.map(v=>'<option value="'+esc(v.empresa_id)+'" '+(v.empresa_id===empresa?'selected':'')+'>Empresa '+esc(v.empresa_id.slice(0,8))+'</option>').join('');
  const nomes=await sb.from('empresas').select('id,nome').in('id',s.vinculos.map(v=>v.empresa_id));
  s.empresaNome=nomes.data?.find(e=>e.id===empresa)?.nome||'';
  (nomes.data||[]).forEach(e=>{const option=[...$('taEmpresa').options].find(o=>o.value===e.id);if(option)option.textContent=e.nome;});
  await identidade(empresa);await carregarFila();tela('taFila');
 }
 async function carregarFila(){
  const geracao=s.geracao,empresa=s.empresa;$('taAtualizar').disabled=true;
  try{
   const fila=await window.PedidoFluxo.fila(sb,empresa,'triagem');
   if(geracao!==s.geracao||empresa!==s.empresa)return;
   s.fila=fila.filter(p=>!p.somente_consulta&&(p.fluxo_etapa==='triagem'||!p.pedido_origem_id)&&['triagem','triagem_retorno','retorno_simultaneo'].includes(p.fluxo_etapa));
   const ids=[...new Set(s.fila.map(p=>p.cliente_id).filter(Boolean))];
   for(let i=0;i<ids.length;i+=100){const r=await sb.from('clientes_empresas').select('id,catalogo_logo_url').eq('empresa_id',empresa).in('id',ids.slice(i,i+100));(r.data||[]).forEach(c=>s.fotos.set(c.id,c.catalogo_logo_url));}
   if(geracao===s.geracao&&empresa===s.empresa)renderFila();
  }finally{$('taAtualizar').disabled=false;}
 }
 const daEtapa=p=>s.etapa==='ida'?p.fluxo_etapa==='triagem':['triagem_retorno','retorno_simultaneo'].includes(p.fluxo_etapa);
 function renderFila(){
  const termo=$('taBusca').value.trim().toLocaleLowerCase('pt-BR');
  const lista=s.fila.filter(daEtapa).filter(p=>!termo||[p.numero_pedido,p.cliente_nome,p.local_nome].join(' ').toLocaleLowerCase('pt-BR').includes(termo));
  lista.sort((a,b)=>String(s.etapa==='ida'?a.data_entrega:a.data_coleta).localeCompare(String(s.etapa==='ida'?b.data_entrega:b.data_coleta)));
  $('taFilaTitulo').textContent=s.etapa==='ida'?'Separação de ida':'Conferência da volta';
  $('taFilaDescricao').textContent=s.etapa==='ida'?'Separe os materiais com a câmera ou com um leitor QR.':'Conte o que voltou. Os danos seguem para a Gestão do Acervo.';
  $('taFilaContagem').textContent=lista.length;
  document.querySelector('[data-total="ida"]').textContent=s.fila.filter(p=>p.fluxo_etapa==='triagem').length;
  document.querySelector('[data-total="volta"]').textContent=s.fila.filter(p=>['triagem_retorno','retorno_simultaneo'].includes(p.fluxo_etapa)).length;
  document.querySelectorAll('[data-etapa]').forEach(b=>{if(b.dataset.etapa===s.etapa)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $('taPedidos').innerHTML=lista.length?lista.map(p=>'<button type="button" class="pedido '+(s.etapa==='volta'?'pedido-volta':'')+'" data-pedido="'+esc(p.id)+'"><span class="pedido-topo"><span class="pedido-numero">Pedido #'+esc(p.numero_pedido)+'</span><span class="pedido-data">'+data(s.etapa==='ida'?p.data_entrega||p.data_evento:p.data_coleta||p.data_evento)+'</span></span><span class="pessoa">'+avatar(p.cliente_nome,s.fotos.get(p.cliente_id))+'<span class="pessoa-texto"><strong>'+esc(p.cliente_nome||'Decorador')+'</strong><small>'+esc(p.local_nome||'Local não informado')+'</small></span></span><span class="pedido-status"><i></i>'+(s.etapa==='volta'?'Pronto para conferir o retorno':['em_separacao','pausado'].includes(p.status)?'Separação em andamento':'Aguardando separação')+'</span></button>').join(''):'<div class="vazio">'+(termo?'Nenhum pedido encontrado.':'Nenhum pedido liberado para esta etapa.')+'</div>';
 }
 async function abrir(id){
  if(s.ocupado)return;s.ocupado=true;const geracao=s.geracao;mensagem('');pararCamera();
  try{
   const b=await rpc('triagem_app_base',{p_pedido:id,p_etapa:s.etapa});if(geracao!==s.geracao||!s.usuario)return;s.base=b;s.q={};s.danos={};s.primeira=null;s.vistos=new Set();s.fotosNovas=new Map();s.pendente=null;
   s.capas=window.CapasOperacao.criar({sb,pedido:id,etapa:s.etapa==='ida'?'triagem':'retorno',cega:s.etapa==='volta'});await s.capas.pronto;
   if(s.etapa==='volta'){
    b.itens.forEach(p=>{s.danos[p.chave]=(b.avarias||[]).filter(a=>[p.chave,'retorno:'+p.chave,'entrega:'+p.chave].includes(a.chave)).reduce((n,a)=>n+Number(a.quantidade||0),0);});
    if(!b.concluido)carregarRascunho();
   }
   renderDetalhe();tela('taDetalhe');window.scrollTo(0,0);
  }catch(e){mensagem(e.message);}finally{s.ocupado=false;}
 }
 function renderDetalhe(){
  const b=s.base,p=b.pedido,volta=s.etapa==='volta',editavel=!b.concluido&&!b.bloqueio&&b.pode_editar;
  $('taDetalhe').innerHTML='<div class="voltar-linha"><button class="voltar" type="button" data-voltar>← Pedidos</button><span class="etapa-chip '+(volta?'volta':'')+'">'+(volta?'TRIAGEM DA VOLTA':'SEPARAÇÃO DE IDA')+'</span></div><section class="cartao pedido-detalhe"><h1>Pedido #'+esc(p.numero)+'</h1><div class="pessoa">'+avatar(p.cliente,p.foto)+'<div class="pessoa-texto"><strong>'+esc(p.cliente)+'</strong><small>'+esc(p.local)+'</small><small>'+data(p.data)+'</small></div></div><div id="taProgresso"></div></section>'+
   (b.concluido?'<div class="concluido"><h2>✓ Conferência concluída</h2><p>Os materiais já estão atualizados no sistema.</p></div>':b.bloqueio?'<div class="aviso-bloco">'+esc(b.bloqueio)+'</div>':!b.pode_editar?'<div class="aviso-bloco">Você possui acesso somente para consulta.</div>':'')+
   (editavel?'<section class="cartao leitor"><div class="leitor-titulo"><h2>Ler QR Code</h2><button type="button" class="botao secundario" data-camera>Abrir câmera</button></div><video id="taVideo" playsinline muted hidden aria-label="Câmera do leitor QR"></video><button type="button" class="botao secundario" data-proxima hidden>Ler próxima peça</button><form class="leitor-form" id="taFormCodigo"><input id="taCodigo" autocomplete="off" placeholder="Ou passe / digite o código" aria-label="Código do material" maxlength="200"><button class="botao" type="submit" aria-label="Conferir código">↵</button></form><p class="dica">QR de item, patrimônio ou etiqueta de envio. Cada leitura conta uma peça. Depois de ler com a câmera, toque em “Ler próxima peça”.</p><p class="ultima-leitura" id="taUltima" role="status"></p></section>':'')+
   '<div class="materiais-cab"><h2>Materiais</h2><span id="taRodada">'+(volta?(s.primeira?'2ª contagem':'1ª contagem'):'QR Code')+'</span></div><div class="materiais" id="taMateriais"></div>'+renderProtecao()+
   (editavel?'<footer class="rodape-detalhe"><button type="button" class="botao" id="taFinalizar">'+(volta?(s.primeira?'Confirmar segunda contagem':'Confirmar retorno'):'Finalizar separação')+'</button></footer>':'');
  renderMateriais();progresso();
  if(editavel){
   s.leitor=window.EasyLocLeitor.criar({video:$('taVideo'),leituraContinua:true,aoLer:async codigo=>{if(!s.ocupado)await ler(codigo);},aoMudar:ligada=>{const v=$('taVideo'),b=document.querySelector('[data-camera]');if(v)v.hidden=!ligada;if(b)b.textContent=ligada?'Fechar câmera':'Abrir câmera';}});
   $('taFormCodigo').onsubmit=e=>{e.preventDefault();ler($('taCodigo').value);};$('taFinalizar').onclick=finalizar;
  }
 }
 function renderProtecao(){const rows=(s.capas?.rows||[]).filter(r=>r.usa_capa);if(!rows.length)return '';const editar=s.base.pode_editar&&!s.base.bloqueio&&!s.base.concluido;return '<details class="cartao protecao" id="taCapas"><summary>Material de proteção <span>'+rows.length+' modelo(s)</span></summary><p class="dica">Confira os materiais de proteção antes de finalizar. Use zero quando não houver.</p>'+rows.map(r=>'<div class="protecao-modelo"><h3>'+esc(r.nome)+'</h3>'+s.capas.celula({item_id:r.item_id,pedido_id:r.pedido_id},editar)+'</div>').join('')+'</details>';}
 function editavelLinha(p){return s.base.pode_editar&&!s.base.bloqueio&&!s.base.concluido&&!(s.primeira&&Number(s.primeira[p.chave])===Number(p.esperado));}
 function renderMateriais(){
  const volta=s.etapa==='volta',b=s.base,feito=new Map((b.registro?.itens||[]).map(r=>[r.chave,r]));
  $('taMateriais').innerHTML=b.itens.length?b.itens.map(p=>{
   const valor=b.concluido?feito.get(p.chave)?.conferido??p.separado:s.q[p.chave]??'';
   const editavel=editavelLinha(p),total=Number(p.separado)+Math.min(Number(p.confirmadas||0),Number(p.producao||0));
   return '<article class="material '+(!volta&&total>=p.esperado?'is-completo':'')+'" data-material="'+esc(p.chave)+'"><div class="material-topo"><span class="material-foto">▧'+(imagens(p.foto)?'<img src="'+esc(p.foto)+'" alt="" loading="lazy">':'')+'</span><div class="material-info"><h3>'+esc(p.nome)+'</h3><small>'+esc([p.codigo,p.setor].filter(Boolean).join(' · '))+'</small>'+(p.kit?'<small>Kit: '+esc(p.kit)+'</small>':'')+'</div>'+(!volta?'<strong class="material-qtd">'+numero(total)+'<small> / '+numero(p.esperado)+'</small></strong>':'')+'</div>'+
   (volta?'<div class="contagens"><span class="contagem-label">'+(b.concluido?'Conferido':s.primeira?'2ª contagem':'Contado')+'</span>'+(b.concluido?'<strong class="material-qtd">'+numero(valor)+'</strong>':'<div class="stepper"><button type="button" data-delta="-1" data-chave="'+esc(p.chave)+'" '+(!editavel?'disabled data-travado="1"':'')+' aria-label="Diminuir '+esc(p.nome)+'">−</button><input type="number" inputmode="numeric" min="0" step="1" value="'+esc(valor)+'" data-contagem="'+esc(p.chave)+'" '+(!editavel?'disabled data-travado="1"':'')+' aria-label="Contagem de '+esc(p.nome)+'"><button type="button" data-delta="1" data-chave="'+esc(p.chave)+'" '+(!editavel?'disabled data-travado="1"':'')+' aria-label="Somar '+esc(p.nome)+'">+</button></div>')+'</div>'+((s.primeira||b.registro?.primeira_contagem)?'<p class="primeira-info">1ª contagem: '+esc((s.primeira||b.registro.primeira_contagem)[p.chave]??'—')+'</p>':'')+
    (b.concluido?'<p class="producao">Danificados: '+numero(b.registro?.danificados?.[p.chave]??s.danos[p.chave])+'</p>':'<div class="dano-linha"><label>Danificados<input type="number" inputmode="numeric" min="0" step="1" value="'+esc(s.danos[p.chave]||0)+'" data-danos="'+esc(p.chave)+'" aria-label="Danificados: '+esc(p.nome)+'" '+(!b.pode_editar||b.bloqueio?'disabled data-travado="1"':'')+'></label>'+(b.pode_editar&&!b.bloqueio?'<label class="foto-adicionar">+ Foto opcional<input type="file" accept="image/*" capture="environment" data-foto="'+esc(p.chave)+'" aria-label="Foto do dano em '+esc(p.nome)+'"></label>':'')+'<div class="fotos-novas" data-fotos="'+esc(p.chave)+'"></div></div>'):'')+
   (!volta&&p.producao>0?'<div class="producao">Produção recebida: '+numero(p.confirmadas)+' / '+numero(p.producao)+(b.pode_editar&&!b.bloqueio&&!b.concluido&&p.prontas>p.confirmadas?'<br><button type="button" data-producao="'+esc(p.item_origem)+'">Confirmar recebimento da produção</button>':'')+'</div>':'')+'</article>';
  }).join(''):'<div class="vazio">Nenhum material liberado para esta conferência.</div>';
  renderFotos();
 }
 function renderFotos(){document.querySelectorAll('[data-fotos]').forEach(host=>{const fotos=s.fotosNovas.get(host.dataset.fotos)||[];host.innerHTML=fotos.map(f=>'<span><img src="'+esc(f.foto)+'" alt="Foto do dano"><button type="button" data-tirar-foto="'+esc(f.id)+'" data-chave="'+esc(host.dataset.fotos)+'" aria-label="Remover foto">×</button></span>').join('');});}
 function progresso(){
  const b=s.base;if(!b)return;
  if(s.etapa==='volta'){
   const preenchidos=b.concluido?b.itens.length:b.itens.filter(p=>s.q[p.chave]!=null&&s.q[p.chave]!=='').length;
   $('taProgresso').innerHTML='<div class="resumo"><span>'+(b.concluido?'Retorno registrado':'Conferência às cegas')+'</span><strong>'+preenchidos+'<small> / '+b.itens.length+' itens</small></strong></div>';
  }else{const total=b.itens.reduce((n,p)=>n+Number(p.esperado),0),feitas=b.itens.reduce((n,p)=>n+Math.min(Number(p.esperado),Number(p.separado)+Math.min(Number(p.producao),Number(p.confirmadas))),0),pct=total?Math.round(feitas/total*100):0;$('taProgresso').innerHTML='<div class="resumo"><span>Materiais separados</span><strong>'+numero(feitas)+'<small> / '+numero(total)+'</small></strong></div><div class="barra" role="progressbar" aria-label="Separação" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><span style="width:'+pct+'%"></span></div>';}
 }
 async function escolher(achados){const disponiveis=achados.filter(p=>s.etapa==='ida'?Number(p.separado)<Number(p.necessario):editavelLinha(p));if(!disponiveis.length)throw Error('As linhas deste material já estão completas nesta rodada.');const d=$('taEscolha');$('taEscolhaItens').innerHTML=disponiveis.map(p=>'<button type="button" class="escolha-material" data-escolher="'+esc(p.chave)+'"><strong>'+esc(p.nome)+'</strong><small>'+esc([p.pedido_numero?'Pedido #'+p.pedido_numero:'',p.kit||'Item do pedido',p.setor].filter(Boolean).join(' · '))+'</small></button>').join('');d.returnValue='';d.showModal();return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue||null),{once:true}));}
 async function ler(codigo){
  codigo=String(codigo||'').trim();if(!codigo||s.ocupado||!s.base)return;
  bloquear(true);mensagem('');
  try{
   if(!s.pendente||s.pendente.codigo!==codigo)s.pendente={codigo,id:crypto.randomUUID()};
   const args={p_pedido:s.base.pedido.id,p_etapa:s.etapa,p_codigo:codigo,p_operacao:s.pendente.id};
   let r=await rpc('triagem_app_ler',args);
   if(r.escolher){const chave=await escolher(r.escolher);if(!chave)return;r=await rpc('triagem_app_ler',{...args,p_chave:chave});}
   if(s.etapa==='ida'){s.base=r.base;renderMateriais();}
   else{
    const p=s.base.itens.find(p=>p.chave===r.chave);if(!p)throw Error('O material não está nesta lista. Atualize o pedido.');
    if(!editavelLinha(p))throw Error('Este item já bateu na primeira contagem. Confira apenas os itens liberados para recontagem.');
    const chave=r.tipo+':'+String(r.codigo).toLocaleUpperCase('pt-BR');
    if(r.unico&&s.vistos.has(chave))throw Error('Este QR já foi contado nesta rodada.');
    s.q[p.chave]=Number(s.q[p.chave]||0)+1;if(r.unico)s.vistos.add(chave);guardar();renderMateriais();
   }
   s.pendente=null;progresso();$('taCodigo').value='';
   const p=s.base.itens.find(p=>p.chave===r.chave);$('taUltima').textContent=r.repetida?'Leitura já salva. Quantidade atualizada.':'✓ '+(p?.nome||'Material')+' · leitura confirmada';
   navigator.vibrate?.(60);
  }catch(e){mensagem(e.message);}finally{bloquear(false);}
 }
 async function finalizar(){
  if(s.ocupado||!s.base)return;const b=s.base;
  if(s.etapa==='volta'){
   for(const p of b.itens){const q=s.q[p.chave],d=Number(s.danos[p.chave]||0);if(q==null||q===''||!Number.isInteger(Number(q))||Number(q)<0){mensagem('Preencha a quantidade de todos os materiais. Use zero quando não voltou.');return;}if(!Number.isInteger(d)||d<0||d>Number(q)){mensagem('A quantidade danificada deve fazer parte da quantidade que voltou: '+p.nome);return;}}
   const diferentes=b.itens.filter(p=>Number(s.q[p.chave])!==Number(p.esperado));
   if(!s.primeira&&diferentes.length){
    pararCamera();s.primeira={...s.q};diferentes.forEach(p=>s.q[p.chave]='');s.vistos.clear();guardar();renderDetalhe();
    mensagem('Conte novamente os '+diferentes.length+' materiais liberados para recontagem. A primeira contagem foi preservada.');return;
   }
  }else if(b.itens.some(p=>Number(p.separado)+Math.min(Number(p.producao),Number(p.confirmadas))<Number(p.esperado))){mensagem('Separe todos os materiais e confirme o recebimento da produção antes de finalizar.');return;}
  pararCamera();
  const ok=await confirmar(s.etapa==='ida'?'Finalizar separação?':'Confirmar retorno?',s.etapa==='ida'?'A separação será concluída e o pedido seguirá para a Expedição.':'A contagem será registrada. Danos e divergências seguirão para a Gestão do Acervo.');if(!ok)return;
  bloquear(true);mensagem('');
  try{
   await s.capas?.salvar(true);
   const fotos={};
   if(s.etapa==='volta')for(const p of b.itens){
    const novas=s.fotosNovas.get(p.chave)||[];if(novas.length&&!Number(s.danos[p.chave]))throw Error('Informe quantos itens estão danificados antes de enviar a foto de '+p.nome);
    const caminhos=(b.avarias||[]).filter(a=>a.chave==='retorno:'+p.chave).flatMap(a=>(a.evidencias||[]).map(e=>e.path).filter(Boolean));
    for(const f of novas){if(!f.path){const path=s.empresa+'/'+b.pedido.id+'/avaria-'+f.id+'.jpg',blob=await(await fetch(f.foto)).blob();const up=await sb.storage.from('evidencias-operacionais').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(up.error&&!['409','Duplicate'].includes(String(up.error.statusCode||up.error.error)))throw Error(up.error.message);f.path=path;}caminhos.push(f.path);}fotos[p.chave]=caminhos.slice(0,6);
   }
   const registro=await rpc('triagem_app_finalizar',{p_pedido:b.pedido.id,p_etapa:s.etapa,p_token:b.token,p_quantidades:s.etapa==='volta'?s.q:{},p_primeira:s.primeira,p_danificados:s.etapa==='volta'?s.danos:{},p_fotos:fotos});
   if(s.etapa==='volta')try{localStorage.removeItem(chaveRascunho());}catch(_){}
   s.base=registro;s.fotosNovas.clear();await s.capas?.carregar().catch(()=>{});renderDetalhe();mensagem('Conferência concluída. Os dados já estão no sistema.',true);
  }catch(e){if(s.capas?.rows.some(r=>r.usa_capa&&r.quantidade==null)){const caps=$('taCapas');if(caps){caps.open=true;caps.scrollIntoView({block:'center',behavior:'smooth'});}}mensagem(e.message);}finally{bloquear(false);}
 }
 async function voltar(){if(s.ocupado)return;if([...s.fotosNovas.values()].some(f=>f.length)&&!await confirmar('Voltar aos pedidos?','As fotos ainda não foram enviadas e serão descartadas. A contagem fica guardada neste aparelho.'))return;pararCamera();s.base=null;mensagem('');tela('taFila');try{await carregarFila();}catch(e){mensagem(e.message);}}

 $('taFormLogin').onsubmit=async e=>{
  e.preventDefault();if(s.ocupado)return;s.ocupado=true;const botao=e.target.querySelector('button');botao.disabled=true;mensagem('');
  try{const login=e.target.elements.login.value.trim(),senha=e.target.elements.senha.value;let r;
   if(login.includes('@'))r=await sb.auth.signInWithPassword({email:login,password:senha});
   else{const res=await sb.functions.invoke('funcionarios-admin',{body:{action:'login',login,password:senha}});if(res.error||!res.data?.session)throw Error('Login ou senha incorretos.');r=await sb.auth.setSession(res.data.session);}
   if(r.error||!r.data?.user)throw Error('Login ou senha incorretos.');await validarSessao(r.data.user);e.target.elements.senha.value='';
  }catch(err){mensagem(err.message);}finally{s.ocupado=false;botao.disabled=false;}
 };
 $('taBusca').oninput=renderFila;$('taAtualizar').onclick=async()=>{mensagem('');try{await carregarFila();}catch(e){mensagem(e.message);}};
 $('taPedidos').onclick=e=>{const b=e.target.closest('[data-pedido]');if(b)abrir(b.dataset.pedido);};
 $('taNavegacao').onclick=e=>{const b=e.target.closest('[data-etapa]');if(b){s.etapa=b.dataset.etapa;mensagem('');renderFila();}};
 $('taConta').onclick=()=>$('taContaDialog').showModal();
 document.querySelector('[data-fechar-conta]').onclick=()=>$('taContaDialog').close();
 $('taEmpresa').onchange=async e=>{if(s.ocupado)return;s.ocupado=true;const anterior=s.empresa;$('taContaDialog').close();tela('taCarregando');try{await selecionarEmpresa(e.target.value);}catch(err){s.empresa=anterior;localStorage.setItem('triagem-app:empresa',anterior);$('taEmpresa').value=anterior;tela('taFila');mensagem(err.message);}finally{s.ocupado=false;}};
 $('taSair').onclick=async()=>{pararCamera();s.geracao++;s.base=null;s.fila=[];s.usuario=null;s.fotosNovas.clear();$('taContaDialog').close();try{await sb.auth.signOut({scope:'local'});tela('taLogin');mensagem('');}catch(e){tela('taLogin');mensagem(e.message);}};
 $('taSairTopo').onclick=()=>$('taSair').click();
 $('taEscolha').onclick=e=>{const b=e.target.closest('[data-escolher]');if(b){$('taEscolha').returnValue=b.dataset.escolher;$('taEscolha').close();}if(e.target.closest('[data-fechar-escolha]'))$('taEscolha').close();};
 $('taDetalhe').addEventListener('click',async e=>{
  if(e.target.closest('[data-voltar]'))return voltar();
  if(e.target.closest('[data-camera]')){try{if(s.leitor.ligada){pararCamera();}else{await s.leitor.ligar();}}catch(err){mensagem(err.message);}return;}
  const delta=e.target.closest('[data-delta]');if(delta&&!s.ocupado){const p=s.base.itens.find(p=>p.chave===delta.dataset.chave);if(!p||!editavelLinha(p))return;s.q[p.chave]=Math.max(0,Number(s.q[p.chave]||0)+Number(delta.dataset.delta));guardar();renderMateriais();progresso();}
  const tirar=e.target.closest('[data-tirar-foto]');if(tirar){s.fotosNovas.set(tirar.dataset.chave,(s.fotosNovas.get(tirar.dataset.chave)||[]).filter(f=>f.id!==tirar.dataset.tirarFoto));renderFotos();}
  const producao=e.target.closest('[data-producao]');if(producao&&!s.ocupado){bloquear(true);try{await rpc('separacao_producao_confirmar',{p_pedido:s.base.pedido.id,p_item:producao.dataset.producao});s.base=await rpc('triagem_app_base',{p_pedido:s.base.pedido.id,p_etapa:s.etapa});renderMateriais();progresso();mensagem('Recebimento da produção confirmado.',true);}catch(err){mensagem(err.message);}finally{bloquear(false);}}
 });
 $('taDetalhe').addEventListener('input',e=>{if(e.target.dataset.contagem){s.q[e.target.dataset.contagem]=e.target.value===''?'':Number(e.target.value);guardar();progresso();}if(e.target.dataset.danos){s.danos[e.target.dataset.danos]=e.target.value===''?'':Number(e.target.value);guardar();}});
 $('taDetalhe').addEventListener('change',async e=>{const input=e.target;if(!input.dataset.foto||!input.files[0])return;try{const lista=s.fotosNovas.get(input.dataset.foto)||[],antigas=(s.base.avarias||[]).filter(a=>a.chave==='retorno:'+input.dataset.foto).flatMap(a=>(a.evidencias||[]).filter(e=>e.path)).length;if(lista.length+antigas>=6)throw Error('Até seis fotos por material.');const foto=await window.EvidenciasOperacao.preparar(input.files[0],input.dataset.foto);lista.push(foto);s.fotosNovas.set(input.dataset.foto,lista);renderFotos();}catch(err){mensagem(err.message);}finally{input.value='';}});
 document.addEventListener('error',e=>{if(e.target.matches('.avatar img,.material-foto img'))e.target.remove();},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pararCamera();});
 window.addEventListener('pagehide',pararCamera);
 window.addEventListener('beforeunload',e=>{if(s.ocupado||[...s.fotosNovas.values()].some(f=>f.length)){e.preventDefault();e.returnValue='';}});
 window.addEventListener('offline',()=>{pararCamera();mensagem('Sem conexão. As leituras de ida precisam de internet; a contagem da volta fica guardada neste aparelho até confirmar.');});
 window.addEventListener('online',()=>mensagem('Conexão restabelecida. Você pode continuar a conferência.',true));
 sb.auth.onAuthStateChange((evento)=>{if(evento==='SIGNED_OUT'){pararCamera();s.geracao++;s.base=null;s.fila=[];s.usuario=null;s.fotosNovas.clear();tela('taLogin');}});
 (async()=>{await window.__limpezaDadosPronta;identidade(new URLSearchParams(location.search).get('empresa')||localStorage.getItem('triagem-app:empresa'));try{const {data,error}=await sb.auth.getSession();if(error)throw Error(error.message);if(data.session?.user)await validarSessao(data.session.user);else tela('taLogin');}catch(e){tela('taLogin');mensagem(e.message);}})();
})();
