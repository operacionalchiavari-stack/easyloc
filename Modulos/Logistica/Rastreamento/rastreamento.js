(async function(){
 'use strict';
 const $=id=>document.getElementById(id), marcadores=new Map();
 let mapa, contexto, linhas=[], carregando=false, timer;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function enquadrar(){if(!marcadores.size)return;const limites=new google.maps.LatLngBounds();marcadores.forEach(m=>limites.extend(m.getPosition()));mapa.fitBounds(limites,70);if(marcadores.size===1)google.maps.event.addListenerOnce(mapa,'idle',()=>mapa.setZoom(Math.min(mapa.getZoom(),16)));}
 function pintar(){
  const termo=$('busca').value.trim().toLocaleLowerCase('pt-BR');
  const visiveis=linhas.filter(l=>l.nome.toLocaleLowerCase('pt-BR').includes(termo));
  const ids=new Set(visiveis.map(l=>l.usuario_id));
  for(const [id,m] of marcadores){if(!ids.has(id)){m.setMap(null);marcadores.delete(id);}}
  $('usuarios').innerHTML=visiveis.map(l=>{
   const antiga=Date.now()-Date.parse(l.atualizado_em)>120000;
   let m=marcadores.get(l.usuario_id);
   if(!m){m=window.RastreamentoFotos.criarMarcador(mapa,l,()=>{mapa.panTo(marcadores.get(l.usuario_id).getPosition());mapa.setZoom(16);});marcadores.set(l.usuario_id,m);}
   m.atualizar(l);m.setOpacity(antiga?0.65:1);
   return '<button type="button" class="rt-usuario '+(antiga?'antiga':'recente')+'" data-usuario="'+esc(l.usuario_id)+'"><span data-foto></span><span class="rt-dados"><b>'+esc(l.nome)+'</b><small>'+(antiga?'Última posição · ':'Atualizada · ')+esc(new Date(l.atualizado_em).toLocaleString('pt-BR'))+'</small><small>Precisão aproximada: '+Math.round(l.precisao)+' m</small></span></button>';
  }).join('');
  $('usuarios').querySelectorAll('[data-usuario]').forEach((el,i)=>el.querySelector('[data-foto]').append(window.RastreamentoFotos.avatar(visiveis[i].nome,visiveis[i].foto)));
  $('estado').classList.remove('erro');
  $('estado').textContent=linhas.length?visiveis.length+' usuário(s) no mapa.':'Nenhum usuário compartilhando localização. Ative o compartilhamento no app da equipe.';
 }
 async function atualizar(){
  if(carregando)return;carregando=true;
  try{
   const {data,error}=await window.supabaseClient.rpc('rastreamento_listar',{p_empresa:contexto.empresa_id});
   if(error)throw error;
   await window.RastreamentoFotos.resolver(window.supabaseClient,data||[]);
   const primeira=!linhas.length;linhas=data||[];pintar();if(primeira)enquadrar();
  }catch(_){marcadores.forEach(m=>m.setOpacity(0.4));$('estado').classList.add('erro');$('estado').textContent='Falha ao atualizar as posições. As posições exibidas podem estar desatualizadas. Tentaremos novamente.';}
  finally{carregando=false;}
 }
 $('busca').addEventListener('input',()=>{if(mapa)pintar();});
 $('enquadrar').onclick=enquadrar;
 $('usuarios').onclick=e=>{const b=e.target.closest('[data-usuario]');if(b){mapa.panTo(marcadores.get(b.dataset.usuario).getPosition());mapa.setZoom(16);}};
 $('telaCheia').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(_){$('estado').textContent='Tela cheia indisponível neste navegador.';}};
 try{
  contexto=await window.aguardarContexto(20000);if(!contexto?.empresa_id)throw Error('Entre novamente para acessar o rastreamento.');
  await window.carregarGooglePlaces();
  mapa=new google.maps.Map($('mapa'),{center:{lat:-23.5505,lng:-46.6333},zoom:10,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,zoomControlOptions:{position:google.maps.ControlPosition.RIGHT_CENTER}});
  await atualizar();timer=setInterval(atualizar,15000);
 }catch(e){$('estado').classList.add('erro');$('estado').textContent=e.message||'Não foi possível abrir o mapa.';}
 window.addEventListener('pagehide',()=>clearInterval(timer));
})();
