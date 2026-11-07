(function(){
 'use strict';
 const cache=new Map();
 function urlSegura(valor){try{const u=new URL(valor);return /^https?:$/.test(u.protocol)?u.href:'';}catch(_){return '';}}
 function iniciais(nome){return String(nome||'?').trim().split(/\s+/).slice(0,2).map(p=>Array.from(p)[0]).join('').toLocaleUpperCase('pt-BR');}
 function avatar(nome,url){
  const el=document.createElement('span');el.className='rt-avatar';el.setAttribute('aria-hidden','true');
  el.textContent=iniciais(nome);
  const segura=urlSegura(url);
  if(segura){const img=document.createElement('img');img.alt='';img.src=segura;img.referrerPolicy='no-referrer';img.addEventListener('error',()=>img.remove(),{once:true});el.append(img);}
  return el;
 }
 async function resolver(sb,linhas){
  await Promise.all(linhas.map(async l=>{
   l.foto=urlSegura(l.foto_url);
   if(!l.foto_path||!['avatares','funcionarios-fotos'].includes(l.foto_bucket))return;
   const chave=l.foto_bucket+':'+l.foto_path,anterior=cache.get(chave);
   if(anterior&&anterior.expira>Date.now()){l.foto=anterior.url||l.foto;return;}
   try{
    const {data,error}=await sb.storage.from(l.foto_bucket).createSignedUrl(l.foto_path,3600);
    const url=!error&&urlSegura(data?.signedUrl);
    cache.set(chave,{url,expira:Date.now()+(url?3000000:60000)});
    if(url)l.foto=url;
   }catch(_){/* A ausência da foto não deve impedir a localização. */}
  }));
 }
 function criarMarcador(mapa,linha,selecionar){
  class FotoMarcador extends google.maps.OverlayView {
   constructor(){super();this.el=document.createElement('button');this.el.type='button';this.el.className='rt-marcador';this.el.addEventListener('click',selecionar);this.atualizar(linha);this.setMap(mapa);}
   onAdd(){this.getPanes().overlayMouseTarget.appendChild(this.el);google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.el);}
   draw(){const p=this.getProjection()?.fromLatLngToDivPixel(this.posicao);if(p){this.el.style.left=p.x+'px';this.el.style.top=p.y+'px';}}
   onRemove(){this.el.remove();}
   getPosition(){return this.posicao;}
   setOpacity(valor){this.el.style.opacity=String(valor);}
   atualizar(l){this.posicao=new google.maps.LatLng(l.latitude,l.longitude);this.el.title=l.nome;this.el.setAttribute('aria-label','Localização de '+l.nome);this.el.classList.toggle('rt-antiga',Date.now()-Date.parse(l.atualizado_em)>120000);if(this.nome!==l.nome||this.foto!==l.foto){this.nome=l.nome;this.foto=l.foto;this.el.replaceChildren(avatar(l.nome,l.foto));}if(this.getMap())this.draw();}
  }
  return new FotoMarcador();
 }
 window.RastreamentoFotos={avatar,resolver,criarMarcador};
})();
