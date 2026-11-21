/* Uma linha por item; disponibilidade mensal calculada no servidor, detalhe diário sob demanda. */
(function(){
 'use strict';
 const n=v=>Number(v||0),fmt=v=>n(v).toLocaleString('pt-BR');
 const dt=v=>new Date(v+'T12:00:00'),iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const data=v=>dt(v).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
 const mes=v=>dt(v).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
 let geracao=0,cache=new Map();
 function meses(inicio,fim){
  const out=[],d=dt(inicio);d.setDate(1);
  while(iso(d)<=fim){const chave=iso(d).slice(0,7),ultimo=iso(new Date(d.getFullYear(),d.getMonth()+1,0));out.push({chave,de:inicio>iso(d)?inicio:iso(d),ate:fim<ultimo?fim:ultimo});d.setMonth(d.getMonth()+1);}
  return out;
 }
 async function consultar(ctx,inicio,fim,ids,diario=false){
  const chave=JSON.stringify([ctx.empresa,inicio,fim,[...ids].sort(),diario]);
  if(!cache.has(chave)){
   const promise=ctx.sb.rpc('acervo_saidas_disponibilidade',{p_empresa:ctx.empresa,p_inicio:inicio,p_fim:fim,p_itens:ids,p_por_dia:diario})
    .then(({data,error})=>{if(error)throw Error(error.message);return Array.isArray(data)?data:[];});
   cache.set(chave,promise);promise.catch(()=>cache.delete(chave));
  }
  return cache.get(chave);
 }
 function fotoItem(i,esc){
  return /^https?:/i.test(i.foto_url||'')?'<img src="'+esc(i.foto_url)+'" alt="" loading="lazy">':'<span class="sa-res-sem-foto" aria-hidden="true"></span>';
 }
 const quantidade=peds=>peds.reduce((s,p)=>s+n(p.quantidade),0);
 function avaliar(i,m,peds,sinais){
  const dn={total:n(m.total),manut:n(m.manutencao),foraQ:n(m.bloqueado),res:n(m.reservado),livre:n(m.livre)};
  const item={...i,contagem_pendente:m.contagem_pendente||i.contagem_pendente};
  if(item.capa)item.capa={...item.capa,precisa:peds.filter(p=>!p.carregado).reduce((s,p)=>s+Math.ceil(n(p.quantidade)/Math.max(1,n(item.capa.por_material))),0)};
  const avisos=sinais(item,dn,peds),nivel=item.contagem_pendente||dn.livre<=0||avisos.some(a=>a.nivel==='erro')?'erro':dn.livre<=Math.max(2,Math.floor(dn.total*.1))||avisos.some(a=>a.nivel==='alerta')?'alerta':'ok';
  const status=item.contagem_pendente?'Contagem pendente':dn.livre<0?'Faltam '+fmt(-dn.livre):dn.livre===0?'Sem folga':dn.livre<=Math.max(2,Math.floor(dn.total*.1))?'Pouca folga':'Com folga';
  return {dn,avisos,nivel,status};
 }
 function dialogo(root){
  const anterior=root.querySelector('dialog');anterior?.close();anterior?.remove();
  const el=document.createElement('dialog');el.className='sa-mes-dialogo';root.append(el);
  el.addEventListener('click',e=>{if(e.target===el){const r=el.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)el.close();}});
  el.addEventListener('close',()=>el.remove(),{once:true});return el;
 }
 async function detalhe(root,ctx,i,m,op){
  const {esc,sinais,numerosDia}=op,el=dialogo(root);
  el.innerHTML='<header><div><h3>'+esc(i.nome)+'</h3><p>'+esc(mes(m.de))+' · '+data(m.de)+' a '+data(m.ate)+'</p></div><button type="button" data-sa-fechar aria-label="Fechar detalhe">×</button></header><div class="sa-mes-conteudo" aria-live="polite">Carregando disponibilidade de cada dia…</div>';
  el.querySelector('[data-sa-fechar]').onclick=()=>el.close();el.showModal();
  const alvo=el.querySelector('.sa-mes-conteudo');
  const carregar=async()=>{
   alvo.textContent='Carregando disponibilidade de cada dia…';
   try{
    const r=await consultar(ctx,m.de,m.ate,[i.item_id],true);if(!el.isConnected)return;
    const dias=r.find(x=>x.item_id===i.item_id)?.periodos;if(!dias?.length)throw Error('Não foi possível consultar os dias deste item.');
    let falta=0,semFolga=0;
    const linhas=dias.map(d=>{
     const peds=(i.pedidos||[]).filter(p=>String(p.data).slice(0,10)===d.de);
     if(peds.some(p=>p.exemplo)&&i.livre_dia?.[d.de]){const dn=numerosDia(i,d.de);d={...d,livre:dn.livre,reservado:dn.res,manutencao:dn.manut,bloqueado:dn.foraQ};}
     const a=avaliar(i,d,peds,sinais);if(a.dn.livre<0)falta++;else if(a.dn.livre===0)semFolga++;
     const pedidos=peds.map(p=>'#'+p.numero+' · '+p.cliente+' ('+fmt(p.quantidade)+')').join(' / ');
     return '<tr class="is-'+a.nivel+'"><td><b>'+data(d.de)+'</b>'+(pedidos?'<small>'+esc(pedidos)+'</small>':'')+'</td><td>'+fmt(quantidade(peds))+'</td><td>'+fmt(a.dn.res)+'</td><td>'+fmt(a.dn.manut+a.dn.foraQ)+'</td><td><strong>'+fmt(a.dn.livre)+'</strong></td><td><span class="sa-sinal sa-'+a.nivel+'">'+esc(a.status)+'</span></td></tr>';
    }).join('');
    alvo.innerHTML='<p class="sa-mes-nota">Estoque: <b>'+fmt(i.total)+'</b> · '+(falta?falta+' dia(s) com falta de peças':semFolga?semFolga+' dia(s) sem folga':'Sem falta de peças neste mês')+'. As reservas incluem as margens de preparação e retorno configuradas.</p>'
     +'<div class="sa-mes-tabela-wrap"><table class="sa-mes-tabela"><thead><tr><th>Dia / pedidos que saem</th><th>Saídas</th><th>Reservado</th><th>Indisponível</th><th>Livre</th><th>Situação</th></tr></thead><tbody>'+linhas+'</tbody></table></div>';
   }catch(err){if(!el.isConnected)return;alvo.innerHTML='<p>Não foi possível carregar: '+esc(err.message)+'</p><button type="button" class="sa-res-tentar">Tentar novamente</button>';alvo.querySelector('button').onclick=carregar;}
  };
  await carregar();
 }
 async function render(op){
  const {host:root,ctx,lista,inicio,fim,busca,so,esc,sinais,numerosDia}=op,token=++geracao;
  root.innerHTML='<p class="sa-vazio" role="status">Calculando o resumo mensal…</p>';
  const itens=lista.filter(i=>(i.pedidos||[]).some(p=>p.data&&String(p.data).slice(0,10)>=inicio&&String(p.data).slice(0,10)<=fim));
  const faixas=meses(inicio,fim);
  try{
   const dados=itens.length?await consultar(ctx,inicio,fim,itens.map(i=>i.item_id)):[];
   if(token!==geracao||!root.isConnected)return;
   const porItem=new Map(dados.map(x=>[x.item_id,x.periodos]));
   const linhas=itens.filter(i=>!busca||[i.nome,i.codigo,i.categoria,...(i.pedidos||[]).flatMap(p=>[p.numero,p.cliente])].join(' ').toLocaleLowerCase('pt-BR').includes(busca)).map(i=>{
    const periodos=porItem.get(i.item_id)||[];
    const celulas=faixas.map(m=>{
     const peds=(i.pedidos||[]).filter(p=>String(p.data).slice(0,10)>=m.de&&String(p.data).slice(0,10)<=m.ate);
     let disp=periodos.find(p=>p.de===m.de);
     if(!disp)return {m,peds,saidas:quantidade(peds),indisponivel:true,nivel:'alerta'};
     // Exemplos são locais: acrescentam demanda apenas nos dias fictícios.
     for(const p of peds.filter(p=>p.exemplo)){const dn=numerosDia(i,String(p.data).slice(0,10));if(dn.livre<n(disp.livre))disp={...disp,livre:dn.livre,reservado:dn.res,manutencao:dn.manut,bloqueado:dn.foraQ};}
     return {m,peds,saidas:quantidade(peds),...avaliar(i,disp,peds,sinais)};
    });
    const avisos=celulas.some(c=>c.nivel!=='ok'),risco=celulas.some(c=>c.dn?.livre<0||c.dn?.livre===0||i.contagem_pendente);
    return {i,celulas,avisos,risco,total:celulas.reduce((s,c)=>s+c.saidas,0)};
   }).filter(x=>!so||x.avisos).sort((a,b)=>Number(b.risco)-Number(a.risco)||String(a.i.nome).localeCompare(String(b.i.nome),'pt-BR'));
   const qtd=linhas.reduce((s,x)=>s+x.total,0),riscos=linhas.filter(x=>x.risco).length;
   const grupos=new Map();for(const x of linhas){const cat=x.i.categoria||'Sem categoria';if(!grupos.has(cat))grupos.set(cat,[]);grupos.get(cat).push(x);}
   const botoes=[];let corpo='';
   for(const [cat,xs] of [...grupos].sort(([a],[b])=>a.localeCompare(b,'pt-BR'))){
    corpo+='<tr class="sa-res-categoria"><td colspan="'+(faixas.length+2)+'">'+esc(cat)+' <small>'+xs.length+' item(ns)</small></td></tr>';
    for(const x of xs){
     corpo+='<tr><td><div class="sa-res-item">'+fotoItem(x.i,esc)+'<div><strong>'+esc(x.i.nome)+'</strong><small>'+esc(x.i.codigo||'')+' · estoque '+fmt(x.i.total)+'</small></div></div></td><td class="sa-res-total"><b>'+fmt(x.total)+'</b><small>peças saindo</small></td>';
     for(const c of x.celulas){
      const id=botoes.push({i:x.i,m:c.m})-1;
      const extra=c.avisos?.find(a=>!['falta','sem_livre','pouca_folga','contagem'].includes(a.chave));
      corpo+='<td><button type="button" data-sa-mes="'+id+'" class="sa-mes-celula is-'+c.nivel+'" aria-label="'+esc('Ver '+x.i.nome+' em '+mes(c.m.de))+'">'
       +'<strong>'+fmt(c.saidas)+' <span>peças saindo</span></strong><small>'+c.peds.length+' saída(s)</small>'
       +(c.indisponivel?'<span class="sa-mes-situacao">Disponibilidade indisponível</span>':'<span class="sa-mes-situacao">'+esc(c.status)+'</span><small>Mín. livre: <b>'+fmt(c.dn.livre)+'</b>'+(c.avisos.length?' · '+c.avisos.length+' aviso(s)':'')+'</small>')
       +(extra?'<small>'+esc(extra.texto)+'</small>':'')+'<span class="sa-mes-ver">Ver dias →</span></button></td>';
     }
     corpo+='</tr>';
    }
   }
   root.innerHTML='<div class="sa-res-cabecalho"><div><h3>Resumo por item e mês</h3><p>'+data(inicio)+' a '+data(fim)+' · '+linhas.length+' itens · '+fmt(qtd)+' peças saindo'+(riscos?' · <b>'+riscos+' item(ns) sem folga ou com falta</b>':'')+'</p></div><p>Clique no mês para ver os dias.<br>As saídas somam as locações; a mesma peça pode sair mais de uma vez.</p></div>'
    +'<p class="sa-res-rolar">Deslize para o lado para comparar os meses →</p><div class="sa-mensal-wrap"><table class="sa-mensal" style="--sa-meses:'+faixas.length+'"><thead><tr><th>Item</th><th>Total no período</th>'+faixas.map(m=>'<th>'+esc(mes(m.de))+'<small>'+data(m.de)+' a '+data(m.ate)+'</small></th>').join('')+'</tr></thead><tbody>'+(corpo||'<tr><td colspan="'+(faixas.length+2)+'" class="sa-vazio">Nenhum item com saída nesse período e filtro.</td></tr>')+'</tbody></table></div>';
   root.querySelectorAll('[data-sa-mes]').forEach(b=>b.onclick=()=>{const x=botoes[Number(b.dataset.saMes)];detalhe(root,ctx,x.i,x.m,op);});
  }catch(err){
   if(token!==geracao||!root.isConnected)return;
   root.innerHTML='<p class="sa-vazio" role="status">Não foi possível carregar o resumo: '+esc(err.message)+'</p><button type="button" class="sa-res-tentar">Tentar novamente</button>';
   root.querySelector('button').onclick=()=>render(op);
  }
 }
 window.AcervoSaidasResumo={render,limpar(){cache.clear();geracao++;},cancelar(){geracao++;}};
})();
