/* A tabela reutiliza as etapas efetivamente exibidas na grade, inclusive os detalhes e o período. */
(() => {
  'use strict';
  const botao=document.getElementById('btnVisualizacaoCronograma');
  const grade=document.getElementById('cronogramaGrade');
  if(!botao||!grade)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icones={tabela:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/>',grade:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/>'};
  let modo='grade';try{modo=localStorage.getItem('cronograma_visualizacao')==='tabela'?'tabela':'grade';}catch(_){}
  const tamanhoLote=20;
  let todasEtapas=[],visiveis=tamanhoLote,periodoAtual='',carregando=false,versao=0;
  let fotosCarregadas=false;
  const fotosResponsaveis=new Map();
  const chaveNome=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const caixa=document.createElement('section');caixa.id='cronogramaTabela';caixa.setAttribute('aria-label','Cronograma em tabela');
  caixa.innerHTML='<div class="crono-tabela-scroll"><table class="crono-tabela"><thead><tr><th>Data</th><th>Horário</th><th>Pedido</th><th>Cliente</th><th>Etapa</th><th>Local</th><th>Responsável</th><th>Equipe</th><th>Caminhão</th></tr></thead><tbody></tbody></table></div>';
  grade.closest('.board-wrap').after(caixa);
  const mais=document.createElement('button');mais.type='button';mais.className='crono-tabela-mais';mais.textContent='Carregar mais etapas';mais.hidden=true;caixa.append(mais);
  function dataISO(valor){
    const valorData=String(valor||'').split('T')[0].split(' ')[0];
    return /^\d{2}\/\d{2}\/\d{4}$/.test(valorData)?valorData.split('/').reverse().join('-'):valorData;
  }
  const texto=v=>Array.isArray(v)?v.join(' · '):v||'—';
  function responsavelHtml(valor){
    const nome=texto(valor);if(nome==='—'||nome==='-')return '—';
    const foto=fotosResponsaveis.get(chaveNome(nome));
    const iniciais=nome.split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();
    return `<span class="crono-tabela-pessoa"><span class="crono-tabela-avatar" data-crono-responsavel="${esc(nome)}"><span aria-hidden="true">${esc(iniciais)}</span>${foto?`<img src="${esc(foto)}" alt="" loading="lazy">`:''}</span><span>${esc(nome)}</span></span>`;
  }
  function carregarFotos(){
    if(fotosCarregadas)return;fotosCarregadas=true;
    const buscar=fn=>new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[fn]());
    Promise.allSettled([buscar('listarResponsaveis'),buscar('listarEquipes')]).then(resultados=>{
      for(const r of resultados)if(r.status==='fulfilled')for(const p of r.value||[])if(/^https?:\/\//i.test(p.foto_url||''))fotosResponsaveis.set(chaveNome(p.nome),p.foto_url);
      caixa.querySelectorAll('[data-crono-responsavel]').forEach(el=>{
        const foto=fotosResponsaveis.get(chaveNome(el.dataset.cronoResponsavel));if(!foto||el.querySelector('img'))return;
        const img=document.createElement('img');img.src=foto;img.alt='';img.loading='lazy';el.append(img);
      });
    });
  }
  caixa.addEventListener('error',e=>{if(e.target.matches('.crono-tabela-avatar img'))e.target.remove();},true);
  function etapaHtml(d){
    const p=d.progresso;
    const barra=p?`<span class="etapa-progresso" title="${esc(p.titulo)}"><span class="etapa-progresso-trilho" role="progressbar" aria-label="Progresso de ${esc(d.etapa)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.percentual}"><span class="etapa-progresso-preenchimento" style="width:${p.percentual}%"></span></span></span>`:'';
    return `<button type="button" class="crono-tabela-etapa${p?' tem-progresso':''}" style="--crono-etapa-fundo:${esc(d.corFundo)}" data-crono-detalhes="${esc(JSON.stringify(d))}" aria-expanded="false"><span>${esc(texto(d.etapa))}</span>${barra}</button>`;
  }
  function desenhar(){
    const etapas=todasEtapas.slice(0,visiveis);
    const grupos=new Map();for(const d of etapas){if(!grupos.has(d.dataOrdenada))grupos.set(d.dataOrdenada,[]);grupos.get(d.dataOrdenada).push(d);}
    const tabela=caixa.querySelector('table');tabela.querySelectorAll('tbody').forEach(el=>el.remove());
    tabela.insertAdjacentHTML('beforeend',[...grupos].map(([dia,linhas])=>{
      const data=new Date(dia+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
      return `<tbody data-dia="${esc(dia)}"><tr class="crono-tabela-dia"><th colspan="9" scope="rowgroup"><div class="crono-dia-cabecalho"><span class="crono-dia-numero" aria-hidden="true">${esc(dia.slice(8,10))}</span><span class="crono-dia-titulo">${esc(data)}</span></div></th></tr>`+linhas.map(d=>`<tr class="crono-tabela-linha"><td class="crono-tabela-data">${esc(d.dataOrdenada.split('-').reverse().join('/'))}</td><td>${esc(texto(d.hora))}</td><td class="crono-tabela-pedido"><span class="crono-tabela-pedido-tag">#${esc(texto(d.pedido))}</span></td><td>${esc(texto(d.cliente))}</td><td>${etapaHtml(d)}</td><td>${esc(texto(d.local))}</td><td>${responsavelHtml(d.responsavel)}</td><td>${esc(texto(d.equipe))}</td><td>${esc(texto(d.caminhao))}</td></tr>`).join('')+'</tbody>';
    }).join('')||'<tbody><tr><td colspan="9" class="crono-tabela-vazia">Nenhuma etapa no período selecionado.</td></tr></tbody>');
    mais.hidden=modo!=='tabela'||visiveis>=todasEtapas.length;mais.disabled=carregando;mais.setAttribute('aria-busy',String(carregando));mais.textContent=carregando?'Carregando etapas…':'Carregar mais etapas';
  }
  function carregarMais(){
    if(modo!=='tabela'||carregando||visiveis>=todasEtapas.length)return;
    carregando=true;const atual=versao;mais.disabled=true;mais.setAttribute('aria-busy','true');mais.textContent='Carregando etapas…';
    requestAnimationFrame(()=>{if(atual!==versao)return;visiveis+=tamanhoLote;carregando=false;desenhar();});
  }
  mais.addEventListener('click',carregarMais);
  const fimObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))carregarMais();},{rootMargin:'0px 0px 120px 0px'});
  fimObserver.observe(mais);
  function renderizar(){
    if(modo!=='tabela')return;
    const periodo=[...grade.querySelectorAll('thead .th-dia')].map(el=>el.textContent).join('|');
    if(periodo!==periodoAtual){periodoAtual=periodo;visiveis=tamanhoLote;carregando=false;versao++;}
    todasEtapas=[...grade.querySelectorAll('[data-crono-detalhes]')].map(card=>{
      try{
        const d=JSON.parse(card.dataset.cronoDetalhes),barra=card.querySelector('.etapa-progresso [role="progressbar"]');
        const progresso=barra?{percentual:Math.max(0,Math.min(100,Number(barra.getAttribute('aria-valuenow'))||0)),titulo:card.querySelector('.etapa-progresso').title}:null;
        return{...d,dataOrdenada:dataISO(d.data),corFundo:getComputedStyle(card).backgroundColor,progresso};
      }catch(_){return null;}
    }).filter(Boolean).sort((a,b)=>a.dataOrdenada.localeCompare(b.dataOrdenada)||String(a.hora||'23:59').padStart(5,'0').localeCompare(String(b.hora||'23:59').padStart(5,'0'))||String(a.pedido).localeCompare(String(b.pedido),'pt-BR',{numeric:true}));
    desenhar();
  }
  function atualizar(){
    const tabela=modo==='tabela';document.body.classList.toggle('crono-modo-tabela',tabela);caixa.hidden=!tabela;
    const rotulo=tabela?'Visualizar como cronograma':'Visualizar como tabela';
    botao.title=rotulo;botao.setAttribute('aria-label',rotulo);botao.setAttribute('aria-pressed',String(tabela));
    botao.querySelector('svg').innerHTML=icones[tabela?'grade':'tabela'];
    renderizar();
    if(tabela)carregarFotos();
  }
  function alternar(){modo=modo==='tabela'?'grade':'tabela';try{localStorage.setItem('cronograma_visualizacao',modo);}catch(_){}atualizar();}
  const observer=new MutationObserver(renderizar);observer.observe(grade,{childList:true,subtree:true,attributes:true,attributeFilter:['data-crono-detalhes','aria-valuenow','title']});
  botao.addEventListener('click',alternar);window.CronoVisualizacao={alternar};atualizar();
})();
