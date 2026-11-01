/* Um único roteiro no evento. Os registros e QR codes usam os serviços do próprio app. */
(function(){
 "use strict";
 let atual=null;
 let inicioPendente=null;
 const fotos=new Map();
 async function carregarFotos(e){
  const token=estado.token;
  try{
   const r=await chamar('MONT_fotosEtapa',token,e.id);
   if(estado.etapaAberta!==e.id||estado.token!==token)return;
   fotos.set(token+':'+e.id,r||{});renderCabeca(e);renderEquipe(e,true);
  }catch(_){/* As iniciais permanecem disponíveis quando não há conexão. */}
 }
 const el=id=>document.getElementById(id);
 function etapaAtual(){return typeof estado!=="undefined"?acharEtapa(estado.etapaAberta):null;}
 function linear(){return etapaAtual()?.operacao==="montagem";}
 function ativo(){return estado.apontamento?.idEtapa===estado.etapaAberta;}
 function mover(ids,pai){ids.forEach(id=>{if(el(id))pai.append(el(id));});}
 function preparar(){
  const tela=el('telaEtapa');mover(['etapaInfo','etapaPedido','etapaTrocas'],tela);el('eventoDetalhes')?.remove();el('etapaConferencia')?.remove();
  if(el('regProgresso')&&!el('etapaRegistros').contains(el('regProgresso')))el('regProgresso').remove();
  mover(['etapaNavegacao','etapaCabeca','apontamentoEtapa','etapaTituloPagina','etapaFotoEquipe','etapaEquipe','etapaUber','etapaFrete','etapaInfo','etapaTrocas','etapaSacolas','etapaPedido','etapaRegistros'],tela);
  atual=null;sair();
 }
 function acesso(){
  const encerrado=etapaAtual()?.apontamento?.status==='ENCERRADO';
  document.querySelectorAll('#telaEtapa fieldset[data-evento-dados]').forEach(f=>f.disabled=encerrado||(!f.closest('#etapaFotoEquipe')&&!ativo()));
  el('telaEtapa').classList.toggle('evento-pendente',!ativo());
 }
 function navegar(painel){
  if(!linear())return false;
  el('telaEtapa').classList.add('evento-linear');
  ['etapaCabeca','etapaFotoEquipe','etapaEquipe','etapaUber','etapaFrete','etapaTrocas','etapaSacolas','etapaRegistros','etapaInfo','etapaPedido','etapaConferencia','eventoDetalhes'].forEach(id=>{if(el(id))el(id).hidden=false;});
  el('etapaTituloPagina').textContent='';
  estado.painel=painel;estado.acesso='agenda';atualizarNavegacao();acesso();resumo();
  const destino=painel==='equipe'?'etapaEquipe':painel==='avarias'?'etapaConferencia':painel==='registros'?'passo_sacolas':null;
  if(destino)requestAnimationFrame(()=>el(destino)?.scrollIntoView({block:'start',behavior:'instant'}));
  return true;
 }
 function montar(e){
  carregarFotos(e);
  sincronizarInicio(e);
  if(e.operacao!=='montagem'){
   sair();el('eventoDetalhes')?.remove();el('etapaConferencia')?.remove();return;
  }
  const tela=el('telaEtapa');tela.classList.add('evento-linear');
  let conferencia=el('etapaConferencia');
  if(!conferencia){conferencia=document.createElement('div');conferencia.id='etapaConferencia';}
  tela.append(el('etapaEquipe'));
  mover(['etapaUber','etapaFrete','apontamentoEtapa'],tela);
  const progresso=el('regProgresso');if(progresso)tela.append(progresso);
  tela.append(el('etapaFotoEquipe'),conferencia);
  mover(['etapaSacolas','etapaRegistros','etapaTrocas'],tela);
  document.querySelectorAll('#etapaFotoEquipe .passo-corpo,#etapaRegistros .passo-corpo').forEach(corpo=>{
   const campo=document.createElement('fieldset');campo.dataset.eventoDados='';
   while(corpo.firstChild)campo.append(corpo.firstChild);corpo.append(campo);
  });
  atual={id:e.id,lista:[],itens:{},carregado:false,enviado:false,carregandoFoto:0};
  conferencia.innerHTML=passoHtml('conferencia',2,'Conferência dos itens','Veja a foto, confira a entrega e sinalize danos.',
   '<div id="entregaItens" aria-live="polite"><p class="entrega-carregando">Carregando os itens do pedido…</p></div>'+
   '<p class="entrega-resumo" id="entregaResumo" role="status"></p><button type="button" class="btn" id="entregaSalvar" disabled>Salvar conferência</button>', '✓ Conferência enviada');
  const reposicao=document.createElement('details');reposicao.className='evento-reposicao';
  reposicao.innerHTML='<summary>Precisa de troca ou reposição?<span>Acionar o galpão para um item danificado ou faltante</span></summary>';
  reposicao.append(el('etapaTrocas'));conferencia.append(reposicao);
  el('entregaSalvar').addEventListener('click',salvar);
  acesso();carregar(e.id);
 }
 async function sincronizarInicio(e){
  if(!e?.operacao||estado.apontamento||inicioPendente===e.id)return;
  inicioPendente=e.id;
  try{
   const p=await chamar('MONT_sincronizarCheckin',estado.token,e.id);
   if(estado.etapaAberta!==e.id||!p?.id||p.idEtapa!==e.id)return;
   e.apontamento=p;
   if(p.status==='ATIVO'){estado.apontamento=p;estado.dados.apontamento=p;}
   renderApontamento();
  }catch(_){/* A foto continua disponível quando ainda não houve check-in. */}
  finally{if(inicioPendente===e.id)inicioPendente=null;}
 }
 async function carregar(id){
  try{
   const r=await chamar('MONT_entregaItens',estado.token,id);
   if(atual?.id!==id||estado.etapaAberta!==id)return;
   if(!r||!Array.isArray(r.itens))throw new Error('O servidor não retornou a lista de itens. Tente novamente.');
   atual.lista=r.itens;atual.itens=r.conferencia||{};atual.enviado=!!r.enviado;atual.carregado=true;
   renderizar();if(atual.enviado)concluido(r);
  }catch(e){
   if(atual?.id!==id||estado.etapaAberta!==id)return;
   el('entregaItens').innerHTML='<p class="entrega-erro">'+esc(mensagemErro(e,'Não foi possível carregar os itens.'))+'</p><button type="button" class="btn btn-claro" id="entregaRecarregar">Tentar novamente</button>';
   el('entregaRecarregar').addEventListener('click',()=>carregar(id));
  }
 }
 function imagem(url){return /^https?:\/\//.test(String(url||''))?String(url):'';}
 function renderizar(){
  const box=el('entregaItens');box.replaceChildren();
  const grupos=new Map();
  if(!atual.lista.length)box.innerHTML='<p class="entrega-vazio">Este pedido não tem itens para conferir.</p>';
  atual.lista.forEach((it,i)=>{
   const salvo=atual.itens[it.chave];
   const linha=document.createElement('article');linha.className='entrega-item';linha.dataset.chave=it.chave;
   const foto=imagem(it.foto);
   linha.innerHTML='<div class="entrega-item-topo">'+(foto?'<button type="button" class="entrega-foto" aria-label="Ampliar foto de '+esc(it.nome)+'"><img src="'+esc(foto)+'" alt="'+esc(it.nome)+'" loading="lazy"></button>':'<div class="entrega-foto sem-foto">Sem foto</div>')+
    '<div><h3 title="'+esc(it.nome)+'">'+esc(it.nome)+'</h3><p class="entrega-previsto">Previsto: <b>'+esc(it.esperado)+'</b></p></div></div>'+
    '<fieldset data-evento-dados><button type="button" class="entrega-tudo" aria-pressed="false">✓ Tudo entregue, sem danos</button>'+
    '<div class="entrega-quantidades"><label for="entregue-'+i+'">Entregues<input id="entregue-'+i+'" class="input" data-entregue type="number" min="0" max="'+esc(it.esperado)+'" step="1" inputmode="numeric" placeholder="Qtd."></label>'+
    '<label for="dano-'+i+'">Danificados<input id="dano-'+i+'" class="input" data-dano type="number" min="0" step="1" inputmode="numeric" value="0"></label></div>'+
    '<button type="button" class="entrega-corrigir" hidden>Corrigir quantidades ou informar dano</button><p class="entrega-confirmado" hidden></p>'+
    '<div class="entrega-dano" hidden><label for="obs-'+i+'">O que aconteceu?<textarea class="input" id="obs-'+i+'" maxlength="1000" placeholder="Descreva o dano" data-obs></textarea></label>'+
    '<label class="entrega-anexo">'+I.camera+'<span>Foto do dano (opcional)</span><input type="file" accept="image/*" capture="environment" hidden></label><img class="entrega-foto-dano" alt="Foto do dano" hidden></div></fieldset>';
   const chaveGrupo=(it.pedido_numero||'')+':'+(it.ambiente_id||'legado');
   if(!grupos.has(chaveGrupo)){
    const grupo=document.createElement('section');grupo.className='entrega-ambiente';
    grupo.dataset.ordem=it.ambiente_ordem??2147483647;grupo.dataset.pedido=it.pedido_numero||'';
    const titulo=document.createElement('h3');titulo.textContent=(it.ambiente||'Itens do pedido')+(it.pedido_numero?' · Pedido #'+it.pedido_numero:'');
    grupo.append(titulo);grupos.set(chaveGrupo,grupo);
   }
   grupos.get(chaveGrupo).append(linha);
   if(salvo){linha.querySelector('[data-entregue]').value=salvo.entregue;linha.querySelector('[data-dano]').value=salvo.danificados;linha.querySelector('[data-obs]').value=salvo.observacao||'';}
   if(foto)linha.querySelector('button.entrega-foto').addEventListener('click',()=>abrirFolha('<h3>'+esc(it.nome)+'</h3><img class="foto-free-ampliada" src="'+esc(foto)+'" alt="'+esc(it.nome)+'"><button class="btn btn-claro" type="button" onclick="fecharFolha()">Fechar foto</button>'));
   linha.querySelector('.entrega-tudo').addEventListener('click',()=>{
    if(atual.enviado)return;delete linha.dataset.editar;linha.querySelector('[data-entregue]').value=it.esperado;linha.querySelector('[data-dano]').value=0;
    guardar(linha,it);resumo();
   });
   linha.querySelector('.entrega-corrigir').addEventListener('click',()=>{linha.dataset.editar='1';pintarItem(linha,it);linha.querySelector('[data-entregue]').focus();});
   linha.querySelectorAll('input[type=number],textarea').forEach(c=>c.addEventListener('input',()=>{guardar(linha,it);resumo();}));
   linha.querySelector('input[type=file]').addEventListener('change',e=>fotoDano(e,linha,it));
   if(salvo?.foto)mostrarFotoDano(linha,salvo.foto);
   pintarItem(linha,it);linha.querySelector('fieldset').disabled=atual.enviado||!ativo();
  });
  [...grupos.values()].sort((a,b)=>a.dataset.pedido.localeCompare(b.dataset.pedido)||Number(a.dataset.ordem)-Number(b.dataset.ordem)).forEach(g=>box.append(g));
  resumo();
 }
 function guardar(linha,it){
  const entregue=linha.querySelector('[data-entregue]').value;
  const dano=linha.querySelector('[data-dano]').value;
  if(dano==='0'){
   linha.querySelector('[data-obs]').value='';linha.querySelector('.entrega-foto-dano').hidden=true;
  }
  atual.itens[it.chave]={entregue:entregue===''?null:Number(entregue),danificados:dano===''?null:Number(dano),observacao:linha.querySelector('[data-obs]').value.trim(),foto:dano==='0'?'':atual.itens[it.chave]?.foto||''};
  pintarItem(linha,it);
 }
 function valido(it,d){return !!d&&Number.isInteger(d.entregue)&&d.entregue>=0&&d.entregue<=Number(it.esperado)&&Number.isInteger(d.danificados)&&d.danificados>=0&&d.danificados<=d.entregue&&(!d.danificados||!!d.observacao);}
 function pintarItem(linha,it){
  const d=atual.itens[it.chave];const perfeito=valido(it,d)&&d.entregue===Number(it.esperado)&&!d.danificados;
  linha.querySelector('.entrega-tudo').setAttribute('aria-pressed',String(perfeito));
  linha.querySelector('.entrega-quantidades').hidden=perfeito&&!linha.dataset.editar;
  linha.querySelector('.entrega-corrigir').hidden=!perfeito||!!linha.dataset.editar||atual.enviado;
  const confirmado=linha.querySelector('.entrega-confirmado');confirmado.hidden=!perfeito||!atual.enviado;
  confirmado.textContent=d?.entregue+' entregues · sem danos';
  linha.querySelector('.entrega-dano').hidden=!(d?.danificados>0);
  linha.classList.toggle('com-dano',d?.danificados>0);
  linha.classList.toggle('conferido',valido(it,d));
 }
 async function fotoDano(ev,linha,it){
  const file=ev.target.files[0];if(!file)return;
  const alvo=atual;alvo.carregandoFoto++;resumo();
  try{
   const foto=await comprimirFoto(file);if(atual!==alvo||Number(linha.querySelector('[data-dano]').value)<=0)return;
   guardar(linha,it);atual.itens[it.chave].foto=foto;mostrarFotoDano(linha,foto);
  }catch(_){/* comprimirFoto já informa o erro. */}finally{alvo.carregandoFoto--;if(atual===alvo)resumo();ev.target.value='';}
 }
 function mostrarFotoDano(linha,foto){const img=linha.querySelector('.entrega-foto-dano');img.src=foto;img.hidden=false;}
 function resumo(){
  if(!atual||!el('entregaResumo'))return;
  const revisados=atual.lista.filter(it=>valido(it,atual.itens[it.chave])).length;
  el('entregaResumo').textContent=atual.enviado?'Conferência salva.':revisados+' de '+atual.lista.length+' itens conferidos.';
  el('entregaSalvar').disabled=!ativo()||!atual.carregado||atual.enviado||atual.carregandoFoto>0;
 }
 async function salvar(){
  if(!atual?.carregado||atual.enviado||!ativo())return;
  const incompleto=atual.lista.find(it=>!valido(it,atual.itens[it.chave]));
  if(incompleto){
   toast('Confira a quantidade entregue e os danos de todos os itens. Descreva os danos encontrados.',true);
   const linha=[...el('entregaItens').querySelectorAll('.entrega-item')].find(l=>l.dataset.chave===incompleto.chave);linha?.scrollIntoView({block:'center'});linha?.querySelector('[data-entregue]')?.focus();return;
  }
  const alvo=atual;const dados=structuredClone(alvo.itens);ocupar(el('entregaSalvar'),'Salvando…');
  try{
   const r=await chamar('MONT_entregaSalvar',estado.token,alvo.id,dados);
   if(atual!==alvo||estado.etapaAberta!==alvo.id)return;
   atual.enviado=true;atual.itens=r.conferencia||dados;concluido(r);toast('Conferência da entrega salva.');
  }catch(e){if(atual===alvo){liberar(el('entregaSalvar'));toast(mensagemErro(e,'Não foi possível salvar a conferência.'),true);}}
 }
 function concluido(r){
  // Mantém a lista visível como comprovante, inclusive quantidades diferentes e danos.
  el('passo_conferencia').classList.add('conferencia-enviada');
  el('passo_conferencia').querySelector('.passo-status').textContent='✓ Enviado';
  reg.feitos.conferencia=true;atualizarProgresso();resumo();
  el('entregaItens').querySelectorAll('fieldset').forEach(f=>{f.disabled=true;f.removeAttribute('data-evento-dados');});
  atual.lista.forEach(it=>{const linha=[...el('entregaItens').querySelectorAll('.entrega-item')].find(l=>l.dataset.chave===it.chave);if(linha){delete linha.dataset.editar;pintarItem(linha,it);}});
  el('entregaSalvar').hidden=true;
  if(r.autor)el('entregaResumo').textContent='Conferência salva por '+r.autor+'.';
 }
 function sair(){
  el('telaEtapa').classList.remove('evento-linear','evento-pendente');
 }
 window.MontadorEvento={montar,navegar,sair,preparar,linear,sincronizarInicio,fotosEtapa(id){return fotos.get(estado.token+':'+id)||{};},sincronizar(){if(linear()){acesso();resumo();}}};
})();
