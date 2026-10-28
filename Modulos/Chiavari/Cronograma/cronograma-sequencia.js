(function(){
 'use strict';
 const estado={inicio:null,semanas:1,cache:new Map(),carregando:false,versao:0,diaQuebra:1,parametros:null,preparadas:new Map()};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dias=()=>window.matchMedia('(min-width:900px)').matches?estado.semanas*7:7;
 function somar(inicio,n){const d=new Date(inicio+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
 function unir(){const pedidos=new Map();for(const lista of estado.cache.values())for(const p of lista){const chave=String(p.pedidoSistemaId||p.chave||p.pedido);const anterior=pedidos.get(chave);if(!anterior){pedidos.set(chave,{...p,etapas:[...(p.etapas||[])]});continue;}const etapas=new Map();for(const e of [...anterior.etapas,...(p.etapas||[])])etapas.set(String(e.id||[e.etapa,e.dataEtapa||e.data,e.horario||e.hora].join('|')),e);pedidos.set(chave,{...anterior,...p,etapas:[...etapas.values()]});}return [...pedidos.values()];}
 function indice(valor){if(!valor)return -1;let iso=String(valor).split('T')[0].split(' ')[0];if(/^\d{2}\/\d{2}\/\d{4}$/.test(iso))iso=iso.split('/').reverse().join('-');const inicio=estado.inicio||formatDateISO(semanaInicioAtual);const n=Math.round((new Date(iso+'T12:00:00')-new Date(inicio+'T12:00:00'))/86400000);return n>=0&&n<dias()?n:-1;}

 function periodos(){const inicio=estado.inicio||formatDateISO(semanaInicioAtual),limites=[0];for(let i=1;i<dias();i++)if(new Date(somar(inicio,i-1)+'T12:00:00').getDay()===estado.diaQuebra)limites.push(i);return limites.map((de,i)=>({de,ate:limites[i+1]??dias()}));}
 function estrutura(){
  prepararProxima();
  const tabela=document.querySelector('table.board');if(!tabela||!semanaInicioAtual)return;
  const quantidade=dias(),inicio=formatDateISO(semanaInicioAtual),grupos=periodos(),colunas=quantidade+grupos.length,cab=tabela.tHead.rows[0],corpo=tabela.tBodies[0];
  const novasColunas=[];
  for(let i=0;i<quantidade;i++){
   if(grupos.some(g=>g.de===i)){const th=document.createElement('th');th.textContent='Pedido';th.className='crono-pedido-col';novasColunas.push(th);}
   const d=new Date(somar(inicio,i)+'T12:00:00'),th=document.createElement('th');th.id='th'+i;th.className='crono-dia-extra';th.innerHTML='<span class="th-dia">'+esc(d.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','').toUpperCase())+' '+esc(d.toLocaleDateString('pt-BR'))+'</span><span class="th-contagem" id="thc'+i+'"></span>';novasColunas.push(th);
  }
  cab.replaceChildren(...novasColunas);
  if(quantidade>7){const label=document.getElementById('weekLabel');if(label){const br=d=>d.split('-').reverse().join('/');label.textContent='Período: '+br(inicio)+' até '+br(somar(inicio,quantidade-1));}}
  const col=tabela.querySelector('colgroup col');if(col)col.span=colunas;
  tabela.style.setProperty('--crono-largura',String(260*colunas)+'px');
  const originais=[...corpo.rows],pedidos=originais.filter(r=>r.classList.contains('linha-pedido')),fragmento=document.createDocumentFragment();
  function copiar(celula){if(!celula)return document.createElement('td');const copia=celula.cloneNode(true);copia.removeAttribute('id');copia.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));return copia;}
  function acrescentar(linha,origem,g){const meta=copiar(origem?.cells[0]);meta.classList.add('crono-pedido-col');linha.appendChild(meta);for(let i=g.de;i<g.ate;i++){const celula=copiar(origem?.cells[i+1]);celula.classList.add('day-cell');linha.appendChild(celula);}}
  for(const original of originais.filter(r=>!r.classList.contains('linha-pedido')&&r.cells.length>1)){const linha=original.cloneNode(false);grupos.forEach(g=>acrescentar(linha,original,g));fragmento.appendChild(linha);}
  const porPeriodo=grupos.map(g=>pedidos.filter(r=>{for(let i=g.de;i<g.ate;i++)if(r.cells[i+1]?.querySelector('.task-card,.agenda-card,.ag-item'))return true;return false;}));
  const quantidadeLinhas=Math.max(0,...porPeriodo.map(p=>p.length));
  for(let i=0;i<quantidadeLinhas;i++){const linha=document.createElement('tr');linha.className='linha-pedido';grupos.forEach((g,j)=>acrescentar(linha,porPeriodo[j][i],g));fragmento.appendChild(linha);}
  if(!quantidadeLinhas){const linha=document.createElement('tr'),celula=document.createElement('td');celula.colSpan=colunas;celula.className='empty-state';celula.textContent='Nenhum pedido neste período.';linha.appendChild(celula);fragmento.appendChild(linha);}
  corpo.replaceChildren(fragmento);
  for(let i=0;i<quantidade;i++){const coluna=i+1+grupos.filter(g=>g.de>0&&g.de<=i).length;let total=0;for(const linha of corpo.rows)total+=linha.cells[coluna]?.querySelectorAll('[data-crono-detalhes],.agenda-card,.ag-item').length||0;const span=document.getElementById('thc'+i);if(span){span.textContent=total?String(total):'';span.setAttribute('aria-label',total+' opera\u00e7\u00f5es no dia');}}
 }
 function carregarParametro(){if(!estado.parametros)estado.parametros=new Promise((ok,erro)=>google.script.run.withSuccessHandler(p=>{const d=Number(p?.pedido_apos_dia??1);estado.diaQuebra=Number.isInteger(d)&&d>=0&&d<=6?d:1;ok();}).withFailureHandler(erro).getParametrosCronograma()).catch(e=>{estado.parametros=null;window.alerta?.('Não foi possível carregar a configuração do cronograma.','Cronograma','aviso');console.warn(e);});return estado.parametros;}
 const buscar=inicio=>new Promise((ok,erro)=>google.script.run.withSuccessHandler(lista=>ok(Array.isArray(lista)?lista:[])).withFailureHandler(erro).getCronogramaSemana(inicio));
 function prepararProxima(){
  if(!estado.inicio||!window.matchMedia('(min-width:900px)').matches)return null;
  const semana=somar(estado.inicio,estado.semanas*7);let pronta=estado.preparadas.get(semana);
  if(pronta&&Date.now()-pronta.em<60000)return pronta.promise;
  const promise=buscar(semana);pronta={promise,em:Date.now()};estado.preparadas.set(semana,pronta);
  promise.catch(()=>{if(estado.preparadas.get(semana)===pronta)estado.preparadas.delete(semana);});
  return promise;
 }
 async function proxima(){
  const wrap=document.querySelector('.board-wrap');if(!wrap||estado.carregando||!estado.inicio||!window.matchMedia('(min-width:900px)').matches)return;
  if(wrap.scrollWidth-wrap.clientWidth-wrap.scrollLeft>Math.max(800,wrap.clientWidth))return;
  estado.carregando=true;wrap.setAttribute('aria-busy','true');const inicio=estado.inicio,versao=estado.versao,semana=somar(inicio,estado.semanas*7);
  try{const lista=await (prepararProxima()||buscar(semana));if(estado.versao!==versao)return;estado.preparadas.delete(semana);const pos=wrap.scrollLeft;estado.cache.set(semana,lista);estado.semanas++;cronogramaData=unir();renderCronograma();wrap.scrollLeft=pos;}
  catch(e){window.alerta?.('N\u00e3o foi poss\u00edvel carregar os pr\u00f3ximos dias. Arraste novamente para tentar.','Cronograma','aviso');}
  finally{estado.carregando=false;wrap.removeAttribute('aria-busy');}
 }
 window.CronoSequencia={dias,indice,estrutura,async receber(lista,inicio){
  await carregarParametro();
  if(estado.inicio!==inicio){estado.inicio=inicio;estado.semanas=1;estado.cache.clear();estado.preparadas.clear();estado.versao++;const wrap=document.querySelector('.board-wrap');if(wrap)wrap.scrollLeft=0;}
  estado.cache.set(inicio,lista);const versao=estado.versao;
  await Promise.all(Array.from({length:estado.semanas-1},(_,i)=>somar(inicio,(i+1)*7)).map(async semana=>{try{const atual=await buscar(semana);if(estado.versao===versao)estado.cache.set(semana,atual);}catch(e){console.warn('Atualizacao da semana indisponivel:',semana,e);}}));
  return estado.versao===versao?unir():[];
 },proxima};
 document.addEventListener('DOMContentLoaded',()=>{const wrap=document.querySelector('.board-wrap');wrap?.addEventListener('scroll',proxima,{passive:true});});
})();
