(function(){
 'use strict';
 const css=new URL('cronograma-detalhes.css?v=20261031-pedido-divisor',document.currentScript.src).href;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const chave=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 let alvo=null,popup=null,timer=null,carregando=null,carregadoEm=0;
 let fotos={equipes:[],responsaveis:[],caminhoes:[]};
 let destino=window,quadro=null;
 try{if(window.frameElement?.id==='plCronogramaFrame'){destino=window.parent;quadro=window.frameElement;}}catch(_){}
 function esconder(){clearTimeout(timer);if(alvo)alvo.setAttribute('aria-expanded','false');popup?.remove();popup=null;alvo=null;}
 function adiar(){clearTimeout(timer);timer=setTimeout(esconder,180);}
 function cadastros(){return fotos;}
 function carregarFotos(){if(carregando&&Date.now()-carregadoEm<50*60000)return;carregadoEm=Date.now();const chamar=nome=>new Promise((ok,erro)=>google.script.run.withSuccessHandler(ok).withFailureHandler(erro)[nome]());carregando=Promise.all([chamar('listarEquipes'),chamar('listarResponsaveis'),chamar('listarCaminhoes')]).then(([equipes,responsaveis,caminhoes])=>{fotos={equipes:equipes||[],responsaveis:responsaveis||[],caminhoes:caminhoes||[]};if(alvo){const card=alvo;esconder();abrir(card);}}).catch(e=>{carregando=null;console.warn('Fotos do cronograma indisponiveis:',e);});}

 function nomes(v){return Array.isArray(v)?v:String(v||'').split(/[,;\n|]+/).map(v=>v.trim()).filter(v=>v&&v!=='-');}
 function pessoa(nome,tipo,lista){const p=(lista||[]).find(p=>chave(tipo==='cam'?p.tipo:p.nome)===chave(tipo==='cam'?(String(nome).match(/\(([^)]+)\)\s*$/)?.[1]||nome):nome));const foto=/^https?:\/\//i.test(p?.foto_url||'')?p.foto_url:'';const label=tipo==='cam'?(p?.nome?nome+' \u00b7 '+p.nome:nome):nome;return `<div class="crono-detalhes-pessoa"><div class="crono-detalhes-foto"><span>${esc(nome.split(/\s+/).slice(0,2).map(s=>s[0]).join(''))}</span>${foto?`<img src="${esc(foto)}" alt="${esc(label)}">`:''}</div><div>${esc(label)}</div></div>`;}
 function posicionar(){if(!popup||!alvo)return;const r=alvo.getBoundingClientRect(),f=quadro?.getBoundingClientRect()||{left:0,top:0};const altura=popup.getBoundingClientRect().height,largura=popup.offsetWidth;let esquerda,topo;const direita=r.right+f.left+12,antes=r.left+f.left-largura-12;if(direita+largura<=destino.innerWidth-12){esquerda=direita;topo=Math.max(12,Math.min(r.top+f.top,destino.innerHeight-altura-12));}else if(antes>=12){esquerda=antes;topo=Math.max(12,Math.min(r.top+f.top,destino.innerHeight-altura-12));}else{esquerda=Math.max(12,Math.min(r.left+f.left,destino.innerWidth-largura-12));const abaixo=r.bottom+f.top+10;topo=abaixo+altura<=destino.innerHeight-12?abaixo:Math.max(12,r.top+f.top-altura-10);}popup.style.left=esquerda+'px';popup.style.top=topo+'px';}

 function abrir(card){carregarFotos();clearTimeout(timer);if(card===alvo&&popup)return;esconder();alvo=card;card.setAttribute('aria-expanded','true');let d;try{d=JSON.parse(card.dataset.cronoDetalhes);}catch(_){return;}
  const cache=cadastros();popup=destino.document.createElement('div');popup.style.cssText='position:fixed;z-index:2147483000;width:min(440px,calc(100vw - 24px));';const root=popup.attachShadow({mode:'open'});const link=destino.document.createElement('link');link.rel='stylesheet';link.href=css;link.onload=posicionar;root.appendChild(link);const box=destino.document.createElement('section');box.className='crono-detalhes';box.setAttribute('role','region');box.setAttribute('aria-label','Detalhes da etapa');
  const equipe=nomes(d.equipe),cams=nomes(d.caminhao);const progresso=card.querySelector('.etapa-progresso')?.getAttribute('title')||'';
  box.innerHTML=`<small>Pedido #${esc(d.pedido||'-')} \u00b7 ${esc(d.etapa||'')} \u00b7 ${esc(d.hora||'')}</small><h3>${esc(d.cliente||'Evento')}</h3><p>${esc(d.local||'Local n\u00e3o informado')}</p>${d.data?`<p>${esc(/^\d{4}-\d{2}-\d{2}/.test(d.data)?String(d.data).slice(0,10).split('-').reverse().join('/'):d.data)}</p>`:''}${progresso?`<p>${esc(progresso)}</p>`:''}<h4>Respons\u00e1vel</h4>${d.responsavel&&d.responsavel!=='-'?pessoa(d.responsavel,'pessoa',[...(cache.responsaveis||[]),...(cache.equipes||[])]):'<small>N\u00e3o definido</small>'}<h4>Equipe</h4><div class="crono-detalhes-grade">${equipe.map(n=>pessoa(n,'pessoa',cache.equipes)).join('')||'<small>N\u00e3o definida</small>'}</div><h4>Caminh\u00f5es</h4><div class="crono-detalhes-grade">${cams.map(n=>pessoa(n,'cam',cache.caminhoes)).join('')||'<small>N\u00e3o definido</small>'}</div>${d.observacao?`<div class="crono-detalhes-obs"><h4>Observa\u00e7\u00e3o</h4>${esc(d.observacao)}</div>`:''}`;
  box.addEventListener('error',e=>{if(e.target.tagName==='IMG')e.target.remove();},true);root.appendChild(box);destino.document.body.appendChild(popup);posicionar();
 }

 document.addEventListener('click',e=>{
  const card=e.target.closest('[data-crono-detalhes]');
  if(card){e.preventDefault();e.stopImmediatePropagation();if(card===alvo)esconder();else abrir(card);return;}
  if(!popup||!e.composedPath().includes(popup))esconder();
 },true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){esconder();return;}const card=e.target.closest('[data-crono-detalhes]');if(card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();card.click();}});
 if(destino!==window){destino.document.addEventListener('click',e=>{if(popup&&!e.composedPath().includes(popup))esconder();});destino.document.addEventListener('keydown',e=>{if(e.key==='Escape')esconder();});}
 destino.addEventListener('scroll',esconder,true);destino.addEventListener('resize',esconder);
 if(destino!==window)document.addEventListener('scroll',esconder,true);
})();
