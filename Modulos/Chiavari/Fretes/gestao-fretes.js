(function(){
 'use strict';
 const rotas={conciliacao:'conciliacao.html',anuncios:'freteiros.html?aba=fretes&integrado=anuncios',caminhoes:'../../Logistica/cadastro-caminhoes.html',cadastro:'fretes.html'};
 const paineis=new Map();let ativa;const exemplo=new URLSearchParams(location.search).get('exemplo')!=='0';
 function urlQuadro(aba){const u=new URL(rotas[aba],location.href);if(exemplo&&['conciliacao','anuncios'].includes(aba))u.searchParams.set('exemplo','1');return u.href;}
 const busca=document.getElementById('gfBuscaCaminhao'),novo=document.getElementById('gfNovoCaminhao');
 const docCaminhoes=()=>paineis.get('caminhoes')?.querySelector('iframe')?.contentDocument;
 const buscaCf=document.getElementById('gfBuscaConciliacao'),filtrosCf=document.getElementById('gfFiltrosConciliacao'),transpCf=document.getElementById('gfTransportadora'),situacaoCf=document.getElementById('gfSituacao');
 const docCf=()=>paineis.get('conciliacao')?.querySelector('iframe')?.contentDocument;
 function enviarCf(id,valor,tipo){const d=docCf(),el=d?.getElementById(id);if(el){el.value=valor;el.dispatchEvent(new d.defaultView.Event(tipo,{bubbles:true}));}}
 buscaCf.addEventListener('input',()=>enviarCf('cfBusca',buscaCf.value,'input'));
 transpCf.addEventListener('change',()=>enviarCf('cfTransp',transpCf.value,'change'));
 document.getElementById('gfAgrupar').addEventListener('change',e=>enviarCf('cfAgrupar',e.target.value,'change'));
 situacaoCf.addEventListener('change',()=>enviarCf('cfSituacao',situacaoCf.value,'change'));
 function sincronizarTopo(){const d=docCaminhoes(),lista=d?.querySelector('.cadastro-caminhoes-page'),visivel=ativa==='caminhoes'&&!lista?.classList.contains('hidden');busca.hidden=novo.hidden=!visivel;novo.disabled=!d?.querySelector('#caminhoesCabecalho .header-actions button');buscaCf.hidden=filtrosCf.hidden=ativa!=='conciliacao';}
 busca.addEventListener('input',()=>{const input=docCaminhoes()?.getElementById('filtroTexto');if(input){input.value=busca.value;input.dispatchEvent(new input.ownerDocument.defaultView.Event('input',{bubbles:true}));}});
 novo.addEventListener('click',()=>docCaminhoes()?.querySelector('#caminhoesCabecalho .header-actions button')?.click());
 function ajustarRolagem(f,d,painel){
  for(const el of [d.documentElement,d.body]){el.style.setProperty('height','auto','important');el.style.setProperty('min-height','0','important');el.style.setProperty('overflow-y','hidden','important');}
  d.body.style.setProperty('margin','0','important');
  d.querySelectorAll('.el-page,.fp-pagina').forEach(el=>{el.style.setProperty('min-height','0','important');el.style.setProperty('max-width','none','important');el.style.setProperty('padding-left','0','important');el.style.setProperty('padding-right','0','important');el.style.setProperty('width','100%','important');el.style.setProperty('box-sizing','border-box','important');});
  let agendada=false;
  const ajustar=()=>{if(agendada)return;agendada=true;requestAnimationFrame(()=>{agendada=false;if(!f.isConnected||painel.hidden)return;const altura=Math.ceil(d.body.getBoundingClientRect().height);if(altura>0&&Math.abs(f.getBoundingClientRect().height-altura)>1)f.style.height=(altura+1)+'px';});};
  const ro=new ResizeObserver(ajustar);ro.observe(d.body);f.__ajustarAltura=ajustar;f.addEventListener('load',()=>ro.disconnect(),{once:true});d.addEventListener('load',ajustar,true);d.fonts?.ready.then(ajustar);ajustar();
 }
 function quadro(url,titulo,painel,analise=false){
  const f=document.createElement('iframe');f.setAttribute('scrolling','no');f.className=analise?'gf-cadastros-app':'gf-quadro';f.title=titulo;
  f.addEventListener('load',()=>{if(!analise)painel.querySelector('.gf-carregando').hidden=true;
   try{const d=f.contentDocument;if(!d)return;const estilo=d.createElement('style');estilo.textContent='.gf-embutida .header-list>h1,.gf-embutida .header-list>h2,.gf-embutida .page-header>h1{display:none!important}.gf-embutida .header-list:has(>h1:only-child),.gf-embutida .header-list:has(>h2:only-child){display:none!important}';d.documentElement.classList.add('gf-embutida');d.head.append(estilo);ajustarRolagem(f,d,painel);
    if(painel.id==='gf-conciliacao'){
      d.querySelector('.cf-barra')?.style.setProperty('display','none','important');
      const transp=d.getElementById('cfTransp');const atualizar=()=>{if(transp){transpCf.innerHTML=transp.innerHTML;transpCf.options[0].textContent='Todas as transportadoras';transpCf.value=transp.value;}situacaoCf.value=d.getElementById('cfSituacao')?.value||'aberto';document.getElementById('gfAgrupar').value=d.getElementById('cfAgrupar')?.value||'eventos';buscaCf.value=d.getElementById('cfBusca')?.value||'';};
      if(transp)new MutationObserver(atualizar).observe(transp,{childList:true});atualizar();
    }
    if(painel.id==='gf-caminhoes'){
     d.getElementById('caminhoesCabecalho')?.style.setProperty('display','none','important');
     const input=d.getElementById('filtroTexto');if(input){input.value=busca.value;input.dispatchEvent(new d.defaultView.Event('input',{bubbles:true}));}
     const lista=d.querySelector('.cadastro-caminhoes-page');if(lista)new MutationObserver(sincronizarTopo).observe(lista,{attributes:true,attributeFilter:['class']});
     sincronizarTopo();
    }}catch(_){}
  });f.src=url;painel.append(f);return f;
 }
 function abrir(aba){
  if(!rotas[aba])aba='conciliacao';ativa=aba;

  document.querySelectorAll('#gfAbas [data-aba]').forEach(b=>{const sim=b.dataset.aba===aba;b.classList.toggle('ativa',sim);b.setAttribute('aria-selected',String(sim));b.tabIndex=sim?0:-1;});
  if(!paineis.has(aba)){
   const p=document.createElement('div');p.className='gf-painel';p.id='gf-'+aba;p.setAttribute('role','tabpanel');p.innerHTML='<div class="gf-carregando" role="status" aria-label="Carregando"><span></span></div>';document.getElementById('gfPaineis').append(p);paineis.set(aba,p);
   quadro(urlQuadro(aba),document.querySelector('#gfAbas [data-aba="'+aba+'"]').textContent,p);
  }
  paineis.forEach((p,k)=>{p.hidden=k!==aba;});paineis.get(aba)?.querySelector('iframe')?.__ajustarAltura?.();sincronizarTopo();const u=new URL(location.href);u.searchParams.set('aba',aba);if(exemplo)u.searchParams.set('exemplo','1');else u.searchParams.delete('exemplo');history.replaceState(null,'',u);window.finalizarCarregamentoModulo?.();
 }
 document.getElementById('gfAbas').addEventListener('click',e=>{const b=e.target.closest('[data-aba]');if(b)abrir(b.dataset.aba);});
 document.getElementById('gfAbas').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const bs=[...document.querySelectorAll('#gfAbas [data-aba]')],i=bs.indexOf(document.activeElement),n=e.key==='Home'?0:e.key==='End'?bs.length-1:(i+(e.key==='ArrowRight'?1:-1)+bs.length)%bs.length;abrir(bs[n].dataset.aba);bs[n].focus();});
 abrir(new URLSearchParams(location.search).get('aba'));
})();
