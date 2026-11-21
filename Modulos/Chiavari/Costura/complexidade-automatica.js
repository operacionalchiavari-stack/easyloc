(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const chamada=(nome,...args)=>new Promise((ok,erro)=>google.script.run.withSuccessHandler(ok).withFailureHandler(erro)[nome](...args));
 let aberto=null,empresa=null,versaoTela=0;
 async function empresaAtual(){
  if(empresa)return empresa;
  try{empresa=window.parent.__CONTEXT?.empresa_id||window.__CONTEXT?.empresa_id;}catch(_){}
  if(!empresa){const {data:s}=await supabaseClient.auth.getSession();if(!s.session)throw Error('Entre no sistema para ajustar o pedido.');const {data,error}=await supabaseClient.from('usuarios_empresas').select('empresa_id').eq('user_id',s.session.user.id).limit(1).single();if(error)throw error;empresa=data.empresa_id;}
  return empresa;
 }
 const dlg=document.createElement('dialog');dlg.className='cx-auto-dialog';document.body.append(dlg);
 function localData(valor){if(!valor)return '';const d=new Date(valor);if(!Number.isFinite(d.getTime()))return '';return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d).replace(' ','T');}
 // Nov/2026 (pedido do usuário): a janela é só de consulta. Sem planejamento, exceções, filtro nem salvar.
 function abrir(p){
  // Nov/2026: tela própria com as provas (complexidade-tela.js). A janela abaixo fica só de reserva.
  if(window.CXTela)return window.CXTela.abrir(p);
  versaoTela++;
  aberto=p;const fechado=p.complexidade.congelado;
  dlg.innerHTML='<div class="cx-auto-topo"><div><small>COMPLEXIDADE AUTOMÁTICA</small><div class="cx-auto-linha"><h2>Pedido '+esc(p.numero)+'</h2><span class="cx-auto-cli">'+(typeof fotoClienteCX==='function'?fotoClienteCX(p.cliente):'')+'<span><b>'+esc(p.cliente)+'</b><small>'+esc(p.local)+'</small></span></span></div></div><button type="button" class="cx-auto-fechar" aria-label="Fechar análise">×</button></div>'+
   (fechado?'<p class="cx-auto-ajuda">Avaliação encerrada em '+esc(new Date(p.complexidade.congelado_em).toLocaleString('pt-BR'))+'. Os dados e parâmetros utilizados estão preservados.</p>':'')+
   '<div class="cx-auto-scores">'+CXRegras.setores.map(s=>{const v=CXRegras.apresentarScore(p.complexidade.setores[s.id]);return '<div title="'+esc(v.detalhe)+'"><small>'+esc(s.nome)+'</small><strong>'+esc(v.texto)+'</strong><small class="cx-score-legenda">'+esc(v.legenda)+'</small></div>';}).join('')+'</div>'+
   '<div class="cx-auto-perguntas cx-auto-consulta">'+CXRegras.perguntas.map(q=>{const r=p.complexidade.respostas[q.id]||{valor:null,fonte:'',detalhe:''};return '<article><div><b>'+esc(q.titulo)+'</b><span class="cx-auto-valor '+(r.valor===null?'pendente':r.valor?'sim':'nao')+'">'+(r.valor===null?'Sem dado':r.valor?'Sim':'Não')+'</span><small>'+esc(r.fonte)+(r.detalhe?' · '+esc(r.detalhe):'')+'</small></div></article>';}).join('')+'</div>';
  dlg.querySelector('.cx-auto-fechar').addEventListener('click',()=>dlg.close());
  if(!dlg.open)dlg.showModal();
 }
 // Nov/2026: o servidor (Vercel) ainda pode estar com uma regra antiga. A tela refaz a conta dos pedidos
 // automáticos com js/shared/complexidade.js, lendo os mesmos dados do banco (complexidade_contextos_tela).
 async function recalcular(lista){
  if(!Array.isArray(lista)||!lista.some(p=>p&&p.automatico&&!p.contexto))return lista; // já veio do banco com a regra atual
  try{
   const {data,error}=await supabaseClient.rpc('complexidade_contextos_tela',{p_empresa:await empresaAtual()});if(error)throw error;
   const ctx=new Map((data||[]).map(c=>[String(c.id),c]));
   return lista.map(p=>{
    const c=p&&p.automatico&&ctx.get(String(p.id));if(!c)return p;
    const n=CXRegras.paraPainel(c),novo={...p,complexidade:n.complexidade,contexto:c};
    for(const q of CXRegras.perguntas)novo['r'+q.id]=n['r'+q.id];
    for(const [s,suf] of [['personalizacao',''],['pintura','Pintura'],['montagem','Montagem'],['triagem','Triagem'],['carregamento','Carregamento']]){
     const campo=CXRegras.setores.find(x=>x.id===s).campo,score=n.complexidade.setores[s].score;novo[campo]=score;
     const taxa=Number(p['comissao'+suf]||0),valor=Number(s==='montagem'?p.valorMontagem:p.valorLocacao)||0;
     novo['valorComissao'+suf]=score===null?null:Math.round(valor*score/100*taxa*100)/100;
    }
    return novo;
   });
  }catch(e){console.warn('Complexidade: usando o cálculo do servidor.',e.message||e);return lista;}
 }
 // Toda leitura de listarPedidos (da página ou desta janela) passa pelo recálculo antes de chegar na tela.
 if(window.google&&google.script&&google.script.run){
  const runOriginal=google.script.run;
  const envolver=(ok,falha)=>new Proxy({},{get(_,nome){
   if(nome==='withSuccessHandler')return f=>envolver(f,falha);
   if(nome==='withFailureHandler')return f=>envolver(ok,f);
   if(typeof nome!=='string'||nome==='then')return undefined;
   return (...args)=>{let r=runOriginal;if(ok)r=r.withSuccessHandler(nome==='listarPedidos'?res=>recalcular(res).then(ok):ok);if(falha)r=r.withFailureHandler(falha);return r[nome](...args);};
  }});
  google.script.run=envolver(null,null);
 }
 window.CXAutomatico={abrir,recalcular,score(p,setor){return CXRegras.apresentarScore(p.complexidade?.setores[setor]).texto;}};
 const original=window.abrirPedidoPorId;
 window.abrirPedidoPorId=function(id){const p=pedidos.find(p=>p.id===decodeURIComponent(id));if(p?.automatico)return abrir(p);return original(id);};
 setInterval(async()=>{if(document.visibilityState!=='visible'||dlg.open)return;try{pedidos=await chamada('listarPedidos');render();}catch(_){/* Mantém a última leitura, sem apagar dados durante perda de conexão. */}},60000);
})();
