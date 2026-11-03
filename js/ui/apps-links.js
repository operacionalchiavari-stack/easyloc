/* Link independente dos apps de campo, exibido quando eles são abertos no Portal. */
(function(){
 "use strict";
 const frame=document.getElementById('appModuleFrame');
 if(!frame||document.getElementById('appLinkToolbar'))return;
 const base=new URL('.',location.href);
 const apps=new Map([
  ['Modulos/Chiavari/Cronograma/montador.html','App do Montador'],
  ['Modulos/Estoque/TriagemApp/triagem.html','App da Triagem'],
  ['Modulos/Chiavari/Cronograma/free.html','Vagas Free'],
  ['Modulos/Chiavari/Uber/motorista.html','App do Motorista'],
  ['Modulos/Chiavari/Fretes/freteiro.html','App do Freteiro'],
  ['Modulos/Chiavari/CentralMetas/equipe.html','Meu Bônus']
 ].map(([caminho,nome])=>[new URL(caminho,base).pathname,nome]));
 const barra=document.createElement('section');barra.id='appLinkToolbar';barra.className='app-link-toolbar';barra.hidden=true;
 barra.setAttribute('aria-label','Link do aplicativo');
 barra.innerHTML='<div class="app-link-toolbar__titulo"><strong>Link do aplicativo</strong><span id="appLinkNome"></span></div>'+
  '<a class="app-link-toolbar__url" id="appLinkUrl" target="_blank" rel="noopener noreferrer"></a>'+
  '<div class="app-link-toolbar__acoes"><button type="button" id="appLinkCopiar">'+
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></svg>Copiar link</button>'+
  '<a id="appLinkAbrir" target="_blank" rel="noopener noreferrer">Abrir aplicativo'+
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg></a></div>'+
  '<span class="app-link-toolbar__status" id="appLinkStatus" role="status" aria-live="polite"></span>';
 frame.before(barra);
 const nome=barra.querySelector('#appLinkNome'),endereco=barra.querySelector('#appLinkUrl'),abrir=barra.querySelector('#appLinkAbrir'),status=barra.querySelector('#appLinkStatus');
 let link='',temporizador;
 function atualizar(){
  let url;
  try{url=new URL(frame.contentWindow.location.href);}catch(_){/* Um destino externo não é um dos apps do Portal. */}
  const titulo=url?.origin===location.origin&&apps.get(url.pathname);
  const visivel=!!titulo&&!frame.classList.contains('hidden')&&!frame.hidden;
  barra.hidden=!visivel;frame.parentElement.classList.toggle('main-com-link-app',visivel);
  if(!visivel){link='';status.textContent='';return;}
  // Links de presença e de sessão não são compartilhados; somente o endereço de entrada do app.
  const direto=new URL(url.pathname,location.origin);
  const empresa=url.searchParams.get('empresa');if(empresa)direto.searchParams.set('empresa',empresa);
  if(link===direto.href)return;
  link=direto.href;clearTimeout(temporizador);nome.textContent=titulo;endereco.textContent=link;endereco.href=link;abrir.href=link;
  endereco.title=link;status.textContent='';
 }
 function copiarAlternativo(valor){
  const foco=document.activeElement,campo=document.createElement('textarea');campo.value=valor;campo.readOnly=true;
  campo.style.cssText='position:fixed;left:-10000px;top:0;width:1px;height:1px;';document.body.append(campo);campo.select();
  let copiou=false;try{copiou=document.execCommand('copy');}catch(_){}finally{campo.remove();foco?.focus({preventScroll:true});}return copiou;
 }
 barra.querySelector('#appLinkCopiar').addEventListener('click',async()=>{
  const valor=link;if(!valor)return;
  let copiou=false;
  try{await navigator.clipboard.writeText(valor);copiou=true;}catch(_){copiou=copiarAlternativo(valor);}
  if(link!==valor)return;
  clearTimeout(temporizador);status.textContent=copiou?'Link copiado. Você já pode compartilhar.':'Não foi possível copiar. Selecione o endereço e copie manualmente.';
  temporizador=setTimeout(()=>{status.textContent='';},5000);
 });
 frame.addEventListener('load',atualizar);
 const observador=new MutationObserver(atualizar);observador.observe(frame,{attributes:true,attributeFilter:['class','hidden','src']});
 atualizar();
})();
