/* Avaliação: a nota e os impactos vêm do banco; o navegador apenas apresenta. */
(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
 const sinal=v=>(v>0?'+':v<0?'−':'')+num(Math.abs(v));
 const data=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 let atual;
 window.RHDesempenho={montar(ctx){
  const s={...ctx,selecionado:null,busca:'',setor:'',status:'ativos',inicio:'',fim:'',pagina:0,geracao:0,pedidoDetalhe:0};atual=s;
  const root=document.createElement('div');root.className='rh-desempenho';ctx.host.replaceChildren(root);
  const vivo=()=>atual===s&&ctx.host.contains(root);
  const rpc=async(n,args)=>{const r=await ctx.sb.rpc(n,{p_empresa:ctx.empresa,...args});if(r.error)throw Error(r.error.message);return r.data;};
  root.innerHTML='<div class="rhd-filtros"><label>Pesquisar funcionário<input type="search" data-busca placeholder="Nome, cargo ou setor"></label><label>Setor<select data-setor><option value="">Todos os setores</option></select></label><label>Situação<select data-status><option value="ativos">Ativos</option><option value="todos">Todos</option><option value="inativos">Inativos</option></select></label><label>Histórico desde<input type="date" data-inicio aria-label="Data inicial"></label><label>Até<input type="date" data-fim aria-label="Data final"></label><button type="button" class="fin-btn claro" data-atualizar>Atualizar</button></div><p class="rhd-erro" role="alert" hidden></p><div data-corpo><p class="fin-vazio">Carregando avaliações…</p></div>';
  const q=x=>root.querySelector(x),erro=msg=>{q('.rhd-erro').textContent=msg;q('.rhd-erro').hidden=!msg;};
  async function carregar(){
   const g=++s.geracao;erro('');q('[data-atualizar]').disabled=true;
   try{
    const d=await rpc('rh_desempenho_contexto',{p_inicio:s.inicio||null,p_fim:s.fim||null,p_todos:!s.inicio});
    if(!vivo()||g!==s.geracao)return;s.d=d;s.fim=d.fim;q('[data-fim]').value=d.fim;
    const setores=[...new Set(d.pessoas.map(p=>p.setor).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    q('[data-setor]').innerHTML='<option value="">Todos os setores</option>'+setores.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');q('[data-setor]').value=s.setor;
    q('[data-corpo]').innerHTML='<div class="rhd-layout"><section class="fin-bloco rhd-pessoas"><header><h3>Funcionários <small data-contagem></small></h3><span class="rhd-legenda">Nota de 0 a 10</span></header><div data-lista></div></section><section class="fin-bloco rhd-detalhe" aria-live="polite" data-detalhe></section></div>';
    listar();
   }catch(e){if(vivo()&&g===s.geracao){erro('Não foi possível carregar as avaliações: '+e.message);q('[data-corpo]').innerHTML='<p class="fin-vazio">Avaliações indisponíveis. Use Atualizar para tentar novamente.</p>';}}
   finally{if(vivo()&&g===s.geracao)q('[data-atualizar]').disabled=false;}
  }
  function foto(p){return ctx.foto(ctx.pessoas.find(x=>x.id===p.id)||p);}
  function listar(){
   if(!s.d)return;
   const ps=s.d.pessoas.filter(p=>(s.status==='todos'||(s.status==='inativos'?p.ativo===false:p.ativo!==false))&&(!s.setor||p.setor===s.setor)&&norm([p.nome,p.setor,p.cargo].join(' ')).includes(norm(s.busca)));
   if(!ps.some(p=>p.id===s.selecionado)){s.selecionado=ps[0]?.id||null;s.pagina=0;}
   q('[data-contagem]').textContent=ps.length;
   q('[data-lista]').innerHTML=ps.map(p=>'<button type="button" class="rhd-pessoa" data-avaliar="'+esc(p.id)+'" aria-pressed="'+(p.id===s.selecionado)+'">'+foto(p)+'<span class="rhd-identidade"><strong>'+esc(p.nome)+'</strong><small>'+esc([p.cargo,p.setor].filter(Boolean).join(' · '))+'</small><small>'+num(p.quantidade)+' ocorrência(s)'+(p.ativo===false?' · Inativo':'')+'</small></span><strong class="rhd-nota '+(p.nota<6?'baixa':p.nota<8?'media':'')+'">'+num(p.nota)+'</strong></button>').join('')||'<p class="fin-vazio">Nenhum funcionário neste filtro.</p>';
   detalhe();
  }
  async function detalhe(){
   const el=q('[data-detalhe]'),p=s.d.pessoas.find(x=>x.id===s.selecionado);if(!el)return;
   const pedido=++s.pedidoDetalhe;
   if(!p){el.innerHTML='<p class="fin-vazio">Selecione um funcionário para ver a avaliação.</p>';return;}
   el.innerHTML='<header class="rhd-cabecalho">'+foto(p)+'<div><h3>'+esc(p.nome)+'</h3><p>'+esc([p.cargo,p.setor].filter(Boolean).join(' · '))+'</p></div><div class="rhd-nota-total"><strong>'+num(p.nota)+'<small> / 10</small></strong><span>Nota acumulada</span></div></header>'+evolucao(p)+'<div class="rhd-historico"><h4>Histórico de ocorrências</h4><div data-historico>Carregando histórico…</div></div>';
   try{
    const d=await rpc('rh_desempenho_detalhe',{p_funcionario:p.id,p_inicio:s.inicio||null,p_fim:s.d.fim,p_pagina:s.pagina});
    if(!vivo()||s.pedidoDetalhe!==pedido||s.selecionado!==p.id||!root.contains(el))return;
    const estados={acompanhamento:'Em acompanhamento',aplicada:'Aplicada',neutra:'Sem impacto',em_apuracao:'Em apuração',desconsiderada:'Desconsiderada'};
    q('[data-historico]').innerHTML=d.itens.length?'<div class="rhd-rolar"><table><thead><tr><th>Data</th><th>Ocorrência</th><th>Situação</th><th>Pontos</th></tr></thead><tbody>'+d.itens.map(e=>'<tr><td>'+data(e.data_ocorrencia)+'</td><td><strong>'+esc(e.nome)+'</strong><small>'+(e.origem==='rh'?'Registro do RH':'Identificada pelo sistema')+' · Regra v'+num(e.regra_versao)+'</small>'+(e.responsabilidade?.responsavel_nome?'<small>Responsável: '+esc(e.responsabilidade.responsavel_nome)+'</small>':'')+(e.responsabilidade?.atribuicao_historica?'<small>Atribuído pela regra atual</small>':'')+(e.observacao?'<p>'+esc(e.observacao)+'</p>':'')+'</td><td><span class="rh-selo '+(e.estado==='em_apuracao'?'amar':'')+'">'+esc(estados[e.estado]||e.estado)+'</span></td><td class="rhd-impacto '+(e.impacto>0?'positivo':e.impacto<0?'negativo':'')+'">'+sinal(e.impacto)+'</td></tr>').join('')+'</tbody></table></div><div class="rhd-paginacao"><span>'+num(d.total)+' registro(s) · Página '+(s.pagina+1)+' de '+Math.ceil(d.total/50)+'</span><button type="button" class="fin-btn claro" data-pagina="-1"'+(!s.pagina?' disabled':'')+'>Anterior</button><button type="button" class="fin-btn claro" data-pagina="1"'+((s.pagina+1)*50>=d.total?' disabled':'')+'>Próxima</button></div>':'<p class="fin-vazio">Nenhuma ocorrência neste período do histórico.</p>';
   }catch(e){if(vivo()&&s.pedidoDetalhe===pedido&&q('[data-historico]'))q('[data-historico]').textContent='Não foi possível carregar o histórico: '+e.message;}
  }
  function evolucao(p){
   const es=p.evolucao||[];if(!es.length)return '';
   return '<section class="rhd-evolucao"><h4>Evolução da nota</h4><div class="rhd-meses">'+es.map(e=>{const mes=new Date(e.mes+'T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});return '<div><strong>'+num(e.nota)+'</strong><span class="rhd-barra"><i style="height:'+Math.max(0,Math.min(100,Number(e.nota)*10))+'%"></i></span><small>'+esc(mes)+'</small></div>';}).join('')+'</div></section>';
  }
  q('[data-busca]').oninput=e=>{s.busca=e.target.value;listar();};q('[data-setor]').onchange=e=>{s.setor=e.target.value;listar();};q('[data-status]').onchange=e=>{s.status=e.target.value;listar();};
  q('[data-atualizar]').onclick=()=>{s.inicio=q('[data-inicio]').value;s.fim=q('[data-fim]').value;s.pagina=0;carregar();};
  root.addEventListener('click',e=>{const b=e.target.closest('[data-avaliar],[data-pagina]');if(!b)return;if(b.hasAttribute('data-avaliar')){s.selecionado=b.dataset.avaliar;s.pagina=0;listar();}else if(b.hasAttribute('data-pagina')){s.pagina+=Number(b.dataset.pagina);detalhe();}});
  carregar();
 }};
})();
