/* Gestão do acervo > Próximas saídas (15/11/2026): tudo que sai do galpão nos próximos N dias, item a item (kits abertos nas
   peças), com o comparativo de estoque e as sinalizações: falta no período, pouca folga, em manutenção, contagem pendente,
   sem material de proteção cadastrado, capas que não dão conta. Dados: RPC acervo_proximas_saidas (mesma conta de
   disponibilidade do sistema: operacao_livre_calc no período inteiro). */
(function(){
 'use strict';
 const n=v=>Number(v||0),fmt=v=>n(v).toLocaleString('pt-BR');
 const dataBr=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'';
 // (16/11/2026) sem seletor de período: começa com 60 dias e carrega mais 60 sozinho ao chegar perto do fim (até 1 ano)
 const PASSO=60,MAX_DIAS=365;
 const st={dias:PASSO,dadosDias:0,busca:'',so:false,atalho:'',de:'',ate:'',dados:null,carregando:false,erro:null,obs:null,modo:'item',visao:'dias'};
 // (16/11/2026) dois modos: 'item' = uma linha por item no dia (soma dos pedidos); 'pedido' = uma linha por pedido
 try{if(localStorage.getItem('acervo_saidas_modo')==='pedido')st.modo='pedido';st.exemplo=sessionStorage.getItem('acervo_saidas_exemplo')==='1';}catch{}

 // (16/11/2026, pedido do usuário) tudo olhando o dia: o objetivo é a pessoa do estoque se antecipar (pouca folga, peça em
 // manutenção, sem capa…). Números do dia vêm de livre_dia[AAAA-MM-DD] (operacao_livre_calc no próprio dia):
 // Manutenção = em manutenção + peças fora (aguardando retorno, triagem, reparo, avaria); Reservado = todos os pedidos que
 // seguram a peça naquele dia (da entrega até a coleta); Livre = Estoque − Manutenção − Reservado.
 let regras=window.AcervoSinalizacoes?.normalizar();
 const FOLGA=2; // livre até 2 peças (ou até 10% do estoque) já pede atenção
 const NOMES_SITUACAO={aguardando_retorno:'aguardando retorno do evento',investigacao:'em investigação (peça não encontrada)',triagem:'em triagem',
  reparo:'em reparo',limpeza:'em limpeza',inspecao:'em inspeção',avaria:'com avaria',manutencao:'em manutenção','retorno pendente':'retorno pendente do evento'};
 const nomeMotivo=m=>String(m||'').replace(/^Acervo:\s*/,'').split(/,\s*/).map(x=>NOMES_SITUACAO[x.trim().toLowerCase()]||x.replace(/_/g,' ')).join(', ');
 // (16/11/2026) peças indisponíveis separadas em duas colunas: Manutenção e Fora do galpão
 const SIT_FORA=['aguardando_retorno','investigacao','retorno pendente'];
 const ehFora=m=>{const sits=String(m||'').replace(/^Acervo:\s*/,'').split(/,\s*/).map(x=>x.trim().toLowerCase());return sits.some(x=>SIT_FORA.includes(x));};
 function numerosDia(i,dia){
  const d=i.livre_dia?.[dia];
  if(!d||typeof d!=='object'){const t=n(i.total),m=n(i.manutencao),f=n(i.bloqueado),r=n(i.reservado);return {total:t,manut:m,foraQ:f,res:r,livre:t-m-f-r,listaManut:[],listaFora:[],reservas:[]};}
  const lista=d.fora||[],listaFora=lista.filter(x=>ehFora(x.motivo)),listaManut=lista.filter(x=>!ehFora(x.motivo));
  const somaM=listaManut.reduce((t,x)=>t+n(x.quantidade),0),somaF=listaFora.reduce((t,x)=>t+n(x.quantidade),0);
  const resto=Math.max(0,n(d.bloqueado)-somaM-somaF); // o que o cálculo bloqueia e não veio detalhado conta como fora
  const t=n(d.total),m=n(d.manutencao)+somaM,f=somaF+resto,r=n(d.reservado);
  return {total:t,manut:m,foraQ:f,res:r,livre:i.contagem_pendente?0:t-m-f-r,listaManut,listaFora,estoqueManut:n(d.manutencao),reservas:d.reservas||[]};
 }
 const apertado=(dn)=>dn.livre>0&&dn.livre<=Math.max(FOLGA,Math.floor(dn.total*.1));
 // [{nivel:'erro'|'alerta'|'info', texto}]
 function sinais(i,dn,peds){
  const out=[];
  if(dn){
   if(dn.livre<0)out.push({chave:'falta',nivel:'erro',texto:'Faltam '+fmt(-dn.livre)+' neste dia'});
   else if(dn.livre===0&&!i.contagem_pendente)out.push({chave:'sem_livre',nivel:'erro',texto:'Nenhuma livre: um pedido novo não cabe'});
   else if(apertado(dn))out.push({chave:'pouca_folga',nivel:'alerta',texto:'Só '+fmt(dn.livre)+' livre(s): atenção a novos pedidos'});
   if(dn.manut>0)out.push({chave:'manutencao',nivel:'alerta',texto:fmt(dn.manut)+' em manutenção'});
   if(dn.foraQ>0)out.push({chave:'fora',nivel:'alerta',texto:fmt(dn.foraQ)+' fora do galpão'});
  }
  if(i.contagem_pendente)out.push({chave:'contagem',nivel:'erro',texto:'Bloqueado: contagem pendente'});
  const c=i.capa;
  if(!c)out.push({chave:'sem_protecao',nivel:'alerta',texto:'Sem material de proteção cadastrado'});
  else if(c.usa){
   const nome=c.tipo==='caixa'?'caixas':'capas';
   if(!c.conferido)out.push({chave:'protecao_contagem',nivel:'alerta',texto:nome[0].toUpperCase()+nome.slice(1)+' nunca contadas'});
   else if(n(c.precisa)>n(c.disponivel))out.push({chave:'protecao_falta',nivel:'erro',texto:'Faltam '+fmt(n(c.precisa)-n(c.disponivel))+' '+nome});
  }
  if((peds||i.pedidos||[]).some(p=>p.pre_reserva))out.push({chave:'pre_reserva',nivel:'info',texto:'Inclui pré-reserva'});
  return out.filter(x=>!regras||regras[x.chave]?.mostrar);
 }
 const nivelDe=ss=>ss.some(x=>x.nivel==='erro')?'erro':ss.some(x=>x.nivel==='alerta')?'alerta':'';
 function atualizarBadge(dados){
  const b=document.querySelector('[data-aba="saidas"] .tab-badge');if(!b)return;
  const total=window.AcervoSinalizacoes?.contar(dados,regras,(i,dia)=>sinais(i,numerosDia(i,dia),(i.pedidos||[]).filter(p=>String(p.data).slice(0,10)===dia)))||0;
  b.textContent=total||'';b.classList.toggle('sa-badge-pisca',total>0);
  b.setAttribute('aria-label',total+' itens com sinaliza\u00e7\u00e3o');
 }
 async function configurar(ctx){
  if(!window.AcervoSinalizacoes)return;
  try{regras=await window.AcervoSinalizacoes.carregar(ctx.sb,ctx.empresa);}
  catch(err){regras=window.AcervoSinalizacoes.normalizar();ctx.msg?.('N\u00e3o foi poss\u00edvel carregar as sinaliza\u00e7\u00f5es configuradas. Usando os avisos padr\u00e3o.',true);}
 }

 function capaHtml(c){
  if(!c)return '<span class="sa-mudo">Não cadastrado</span>';
  if(!c.usa)return '<span class="sa-mudo">Não utiliza</span>';
  const nome=c.tipo==='caixa'?'caixas':'capas';
  if(!c.conferido)return '<b>'+fmt(c.precisa)+'</b> '+nome+'<small>estoque não contado</small>';
  const falta=n(c.precisa)>n(c.disponivel);
  return '<b class="'+(falta?'sa-vermelho':'')+'">'+fmt(c.precisa)+'</b> de '+fmt(c.disponivel)+' '+nome+'<small>'+fmt(c.por_material)+' peça(s) por '+(c.tipo==='caixa'?'caixa':'capa')+'</small>';
 }

 // (16/11/2026, pedido do usuário) linha do tempo: semana → dia → itens que saem naquele dia (não mais acumulado por item).
 // "Saindo" e os pedidos são só daquele dia; Livre é o do próprio dia (livre_dia); Estoque, Manutenção, Proteção e Sinalizações são do item no período.
 const DIA_SEM=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
 const dt=v=>new Date(String(v).slice(0,10)+'T12:00:00');
 const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const hojeIso=()=>iso(new Date());
 function inicioSemana(v){const d=dt(v);d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d);}
 function nomeSemana(ini){
  const fim=dt(ini);fim.setDate(fim.getDate()+6);
  const atual=inicioSemana(hojeIso()),prox=dt(atual);prox.setDate(prox.getDate()+7);
  const rot=ini===atual?'Esta semana':ini===iso(prox)?'Próxima semana':'Semana';
  return rot+' · '+dataBr(ini)+' a '+dataBr(iso(fim));
 }
 function nomeDia(v){
  const d=dt(v),am=dt(hojeIso());am.setDate(am.getDate()+1);
  const extra=iso(d)===hojeIso()?' · hoje':iso(d)===iso(am)?' · amanhã':'';
  return DIA_SEM[d.getDay()]+', '+dataBr(v)+extra;
 }
 const iniciais=n=>String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?';
 function fotoCliente(p,esc){
  const ini='<span class="sa-cli-foto">'+esc(iniciais(p.cliente))+'</span>';
  return /^(https?:|data:image)/i.test(p.cliente_foto||'')?'<span class="sa-cli-foto"><img src="'+esc(p.cliente_foto)+'" alt="" loading="lazy" onerror="this.parentNode.textContent=\''+esc(iniciais(p.cliente))+'\'"></span>':ini;
 }
 // nome do item sem o trecho das medidas; as medidas vêm do próprio nome "(L)…(A)…(P)…" ou de largura/altura/profundidade
 function nomeMedidas(i){
  const t=String(i.nome||''),k=t.search(/\s*\(L\)/);
  if(k>0)return {nome:t.slice(0,k).trim(),medidas:t.slice(k).trim()};
  const m=v=>v==null||v===''?null:String(v).replace('.',',')+' m';
  const p=[['L',i.largura],['A',i.altura],['P',i.profundidade]].filter(x=>m(x[1])).map(x=>'('+x[0]+') '+m(x[1]));
  return {nome:t,medidas:p.join(' ')};
 }
 // número dentro de um card colorido, igual ao Estoque do Almoxarifado (stock-summary-value)
 const card=(v,tom)=>'<span class="sa-qtd sa-qtd-'+tom+'"><strong>'+fmt(v)+'</strong></span>';
 let cartoes=[],cartaoEl=null,escAtual=v=>v;
 const linhaPedidoCard=(p,esc,extra)=>'<div class="sa-card-ped">'+fotoCliente(p,esc)
   +'<div class="sa-card-info"><div><span class="sa-ped2-num'+(p.exemplo?' is-ex':'')+'">'+esc(p.numero)+'</span><span class="sa-ped2-st'+(p.pre_reserva?' is-pre':'')+'">'+(p.pre_reserva?'Pré-reserva':'Reservado')+'</span></div>'
   +'<strong>'+esc(p.cliente||'—')+'</strong><small>'+esc(extra||p.local||'—')+'</small></div>'
   +'<span class="sa-qtd sa-qtd-neutro"><strong>'+fmt(p.quantidade)+'</strong></span></div>';
 function cartaoHtml(c,esc){
  if(c.tipo==='manut'||c.tipo==='fora'){
   const ehM=c.tipo==='manut',lista=ehM?c.dn.listaManut:c.dn.listaFora;
   const linhas=[...(ehM&&c.dn.estoqueManut?[{t:'Em manutenção no estoque',q:c.dn.estoqueManut}]:[]),
     ...lista.map(f=>({t:nomeMotivo(f.motivo).replace(/^./,x=>x.toUpperCase()),sub:f.pedido?'Pedido '+f.pedido:'',q:f.quantidade}))];
   return '<div class="sa-card-topo"><b>'+(ehM?'Manutenção':'Fora do galpão')+'</b><span>'+fmt(ehM?c.dn.manut:c.dn.foraQ)+' peças</span></div>'
    +(ehM?'':'<p class="sa-card-nota">Peças que não voltaram do evento ou estão em investigação (aba Itens danificados).</p>')
    +(linhas.length?linhas.map(l=>'<div class="sa-card-ped sa-card-simples"><div class="sa-card-info"><strong>'+esc(l.t)+'</strong>'+(l.sub?'<small>'+esc(l.sub)+'</small>':'')+'</div><span class="sa-qtd sa-qtd-alerta"><strong>'+fmt(l.q)+'</strong></span></div>').join('')
     :'<p class="sa-card-vazio">'+(ehM?'Nenhuma peça em manutenção neste dia.':'Nenhuma peça fora do galpão neste dia.')+'</p>');
  }
  if(c.tipo==='res'){
   const lista=c.dn.reservas||[];
   return '<div class="sa-card-topo"><b>Reservadas neste dia</b><span>'+fmt(c.dn.res)+' peças</span></div>'
    +'<p class="sa-card-nota">Pedidos que seguram a peça em '+dataBr(c.dia)+' (da entrega até a coleta).</p>'
    +(lista.length?lista.map(p=>linhaPedidoCard(p,esc,(String(p.entrega).slice(0,10)===c.dia?'Sai neste dia':'Saiu '+dataBr(p.entrega))+' · coleta '+dataBr(p.coleta)+(p.local?' · '+p.local:''))).join('')
     :'<p class="sa-card-vazio">Nenhum pedido reservando a peça neste dia.</p>');
  }
  const peds=c.peds,tot=peds.reduce((t,p)=>t+n(p.quantidade),0);
  return '<div class="sa-card-topo"><b>'+peds.length+' pedidos saindo neste dia</b><span>'+fmt(tot)+' peças</span></div>'+peds.map(p=>linhaPedidoCard(p,esc)).join('');
 }
 let cartaoAlvo=null,fecharCartaoTimer=null;
 function manterCartao(){clearTimeout(fecharCartaoTimer);}
 function agendarFecharCartao(){manterCartao();fecharCartaoTimer=setTimeout(esconderCartao,140);}
 function mostrarCartao(el){
  manterCartao();
  if(cartaoAlvo===el&&cartaoEl&&!cartaoEl.hidden)return;
  const c=cartoes[Number(el.dataset.saCard)];if(!c)return;
  if(!cartaoEl){cartaoEl=document.createElement('div');cartaoEl.className='sa-card';cartaoEl.id='acervoSaidasDetalhe';cartaoEl.setAttribute('role','tooltip');cartaoEl.addEventListener('mouseenter',manterCartao);cartaoEl.addEventListener('mouseleave',agendarFecharCartao);document.body.append(cartaoEl);}
  cartaoAlvo?.removeAttribute('aria-describedby');cartaoAlvo=el;el.setAttribute('aria-describedby',cartaoEl.id);
  cartaoEl.innerHTML=cartaoHtml(c,escAtual);cartaoEl.hidden=false;
  const r=el.getBoundingClientRect(),w=cartaoEl.offsetWidth,h=cartaoEl.offsetHeight;
  const abaixo=innerHeight-r.bottom-20,acima=r.top-20;
  let left=Math.max(12,Math.min(r.left,innerWidth-w-12)),top;
  if(h<=abaixo)top=r.bottom+8;
  else if(h<=acima)top=r.top-h-8;
  else{top=Math.max(12,Math.min(r.top,innerHeight-h-12));if(r.left>=w+20)left=r.left-w-8;else if(innerWidth-r.right>=w+20)left=r.right+8;}
  cartaoEl.style.left=left+'px';cartaoEl.style.top=top+'px';
 }
 function esconderCartao(){manterCartao();if(cartaoEl)cartaoEl.hidden=true;cartaoAlvo?.removeAttribute('aria-describedby');cartaoAlvo=null;}
 document.addEventListener('mouseover',e=>{const el=e.target.closest?.('[data-sa-card]');if(el&&!el.contains(e.relatedTarget))mostrarCartao(el);});
 document.addEventListener('mouseout',e=>{const el=e.target.closest?.('[data-sa-card]');if(el&&!el.contains(e.relatedTarget)){if(cartaoEl?.contains(e.relatedTarget))manterCartao();else agendarFecharCartao();}});
 document.addEventListener('focusin',e=>{const el=e.target.closest?.('[data-sa-card]');if(el)mostrarCartao(el);});
 document.addEventListener('focusout',e=>{if(e.target.closest?.('[data-sa-card]'))agendarFecharCartao();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')esconderCartao();});
 addEventListener('resize',esconderCartao);
 addEventListener('scroll',e=>{if(!cartaoEl?.contains(e.target))esconderCartao();},true);
 function linha(i,peds,esc,dia){
  const dn=numerosDia(i,dia),ss=sinais(i,dn,peds),nivel=nivelDe(ss);
  const foto=/^https?:/i.test(i.foto_url||'')?'<img src="'+esc(i.foto_url)+'" alt="" loading="lazy">':'<span class="sa-sem-foto"></span>';
  // (16/11/2026) sem o apagado de "já carregado"; cada pedido diz se está Reservado ou em Pré-reserva
  const tip=p=>esc(p.cliente||'')+' · '+(p.pre_reserva?'pré-reserva':'reservado');
  const pedidosClientes=peds.map(p=>'<div class="sa-pedido-cliente"><div class="sa-ped2" title="'+tip(p)+'">'+fotoCliente(p,esc)+'<span class="sa-ped2-cli">'+esc(p.cliente||'—')+'</span></div><div class="sa-pedido-meta'+(p.pre_reserva?' is-pre':'')+(p.exemplo?' is-exemplo':'')+'"><span class="sa-ped2-num">Pedido '+esc(p.numero)+'</span><span class="sa-ped2-st">'+(p.pre_reserva?'Pré-reserva':'Reservado')+'</span></div></div>').join('');
  const locais=peds.map(p=>'<div class="sa-local"><span>'+esc(p.local||'—')+'</span></div>').join('');
  // (16/11/2026) vários pedidos no mesmo dia: uma linha compacta ("3 pedidos", fotos dos clientes, "3 locais");
  // ao passar o mouse abre um card branco com cada pedido (número, situação, cliente, local, quantidade)
  let colPed='<div class="sa-peds2">'+pedidosClientes+'</div>',colLoc='<div class="sa-locais">'+locais+'</div>';
  if(peds.length>1){
   const id=cartoes.push({tipo:'peds',peds})-1,pre=peds.filter(p=>p.pre_reserva).length,res=peds.length-pre;
   const locs=new Set(peds.map(p=>p.local||'—')).size,clis=new Set(peds.map(p=>p.cliente||'—')).size;
   const alvo=(html)=>'<button type="button" class="sa-multi" data-sa-card="'+id+'">'+html+'</button>';
   colPed='<div class="sa-pedidos-clientes">'+alvo('<span class="sa-clientes-resumo"><span class="sa-fotos">'+peds.slice(0,3).map(p=>fotoCliente(p,esc)).join('')+'</span><b>'+clis+' cliente'+(clis>1?'s':'')+'</b></span><b>'+peds.length+' pedidos</b><small>'+[res?res+' reservado'+(res>1?'s':''):'',pre?pre+' pré-reserva'+(pre>1?'s':''):''].filter(Boolean).join(' · ')+'</small>')+'</div>';
   colLoc=alvo('<b>'+locs+' '+(locs>1?'locais':'local')+'</b>');
  }
  const nm=nomeMedidas(i);
  const cManut=cartoes.push({tipo:'manut',dn})-1,cFora=cartoes.push({tipo:'fora',dn})-1,cRes=cartoes.push({tipo:'res',dn,dia})-1;
  const tomLivre=dn.livre<=0?'falta':apertado(dn)?'alerta':'livre';
  return '<tr class="'+(nivel==='erro'?'is-erro':nivel==='alerta'?'is-alerta':'')+'">'
   +'<td><div class="sa-item">'+foto+'<div><strong>'+esc(nm.nome)+'</strong>'+(nm.medidas?'<small>'+esc(nm.medidas)+'</small>':'')+'</div></div></td>'
   +'<td>'+colPed+'</td>'
   +'<td>'+colLoc+'</td>'
   +'<td class="sa-num">'+card(dn.total,'neutro')+'</td>'
   +'<td class="sa-num"><button type="button" class="sa-qtd-btn" data-sa-card="'+cManut+'" aria-label="Ver manutenção">'+card(dn.manut,dn.manut?'alerta':'neutro')+'</button></td>'
   +'<td class="sa-num"><button type="button" class="sa-qtd-btn" data-sa-card="'+cFora+'" aria-label="Ver peças fora do galpão">'+card(dn.foraQ,dn.foraQ?'alerta':'neutro')+'</button></td>'
   +'<td class="sa-num"><button type="button" class="sa-qtd-btn" data-sa-card="'+cRes+'" aria-label="Ver reservas do dia">'+card(dn.res,'saindo')+'</button></td>'
   +'<td class="sa-num">'+card(dn.livre,tomLivre)+'</td>'
   +'<td class="sa-capa">'+capaHtml(i.capa)+'</td>'
   +'<td class="sa-sinalizacoes"><div class="sa-sinais">'+(ss.length?ss.map(x=>'<span class="sa-sinal sa-'+x.nivel+'">'+esc(x.texto)+'</span>').join(''):'<span class="sa-sinal sa-ok">Tudo certo</span>')+'</div></td></tr>';
 }
 // agrupa: semana → dia → [{item, pedidos daquele dia}]
 function linhaDoTempo(lista,q){
  const dias=new Map();
  for(const i of lista){
   const porDia=new Map();
   for(const p of i.pedidos||[]){
    if(!p.data)continue;
    if(q&&![i.nome,i.codigo,i.categoria,p.numero,p.cliente].join(' ').toLocaleLowerCase('pt-BR').includes(q))continue;
    const k=String(p.data).slice(0,10);if(!porDia.has(k))porDia.set(k,[]);porDia.get(k).push(p);
   }
   for(const [k,peds] of porDia){if(!dias.has(k))dias.set(k,[]);dias.get(k).push({i,peds});}
  }
  const semanas=new Map();
  [...dias.keys()].sort().forEach(k=>{const w=inicioSemana(k);if(!semanas.has(w))semanas.set(w,[]);semanas.get(w).push(k);});
  return {dias,semanas};
 }
 function desenhar(host,esc){
  // Uma consulta pode terminar depois de o usuário trocar de aba.
  if(!host.isConnected || !host.querySelector('[data-sa-diario]'))return;
  cartoes=[];escAtual=esc;esconderCartao();
  const mensal=st.visao==='meses';
  host.querySelector('[data-sa-diario]').hidden=mensal;
  host.querySelector('[data-sa-mensal]').hidden=!mensal;
  host.querySelector('.sa-modos').hidden=mensal;
  host.querySelectorAll('[data-sa-visao]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.saVisao===st.visao)));
  const erro=host.querySelector('[data-sa-erro]');erro.hidden=!st.erro;
  if(st.erro){
   st.obs?.disconnect();window.AcervoSaidasResumo?.cancelar();
   host.querySelector('[data-sa-diario]').hidden=host.querySelector('[data-sa-mensal]').hidden=true;
   erro.innerHTML='<p>Não foi possível carregar o período: '+esc(st.erro)+'</p><button type="button" class="sa-res-tentar">Tentar novamente</button>';
   erro.querySelector('button').onclick=async e=>{e.target.disabled=true;try{await carregar(ctxAtual);}catch{}if(host.isConnected)desenhar(host,esc);};return;
  }
  if(mensal){
   st.obs?.disconnect();
   const hoje=hojeIso(),limite=dt(hoje);limite.setDate(limite.getDate()+st.dias);
   const inicio=st.de||hoje,fim=st.ate||(inicio>iso(limite)?inicio:iso(limite));
   window.AcervoSaidasResumo.render({host:host.querySelector('[data-sa-mensal]'),ctx:ctxAtual,lista:st.dados||[],inicio,fim,busca:st.busca.trim().toLocaleLowerCase('pt-BR'),so:st.so,esc,sinais,numerosDia});
   return;
  }
  window.AcervoSaidasResumo?.cancelar();
  const d=st.dados||[],q=st.busca.trim().toLocaleLowerCase('pt-BR');
  const lista=d;
  const {dias,semanas}=linhaDoTempo(lista,q);
  let html='';
  for(const [w,ks] of semanas){
   for(const k of ks){
    if((st.de&&k<st.de)||(st.ate&&k>st.ate))continue;
    const linhas=dias.get(k).map(x=>({...x,nivel:nivelDe(sinais(x.i,numerosDia(x.i,k),x.peds))}))
     .filter(x=>!st.so||sinais(x.i,numerosDia(x.i,k),x.peds).length)
     .sort((x,y)=>(x.nivel==='erro'?0:x.nivel==='alerta'?1:2)-(y.nivel==='erro'?0:y.nivel==='alerta'?1:2)||String(x.i.nome).localeCompare(String(y.i.nome),'pt-BR'));
    if(!linhas.length)continue;
    html+='<tr class="sa-dia"><td colspan="10"><b>'+esc(nomeDia(k))+'</b></td></tr>';
    // (18/11/2026) dentro do dia, um bloco por categoria (Estofados, Mesas…), em ordem alfabética
    const porCat=new Map();
    for(const x of linhas){const c=String(x.i.categoria||'').trim()||'Sem categoria';if(!porCat.has(c))porCat.set(c,[]);porCat.get(c).push(x);}
    for(const [cat,xs] of [...porCat].sort((a,b)=>a[0]==='Sem categoria'?1:b[0]==='Sem categoria'?-1:a[0].localeCompare(b[0],'pt-BR'))){
     html+='<tr class="sa-cat"><td colspan="10"><h3 class="sa-categoria-titulo">'+esc(cat)+'</h3></td></tr>';
     html+=xs.flatMap(x=>st.modo==='pedido'
       ? [...x.peds].sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'pt-BR',{numeric:true})).map(p=>linha(x.i,[p],esc,k))
       : [linha(x.i,x.peds,esc,k)]).join('');
    }
   }
  }
  const ate=new Date();ate.setDate(ate.getDate()+st.dias);
  const fim=st.ate?'':st.dias<MAX_DIAS?'<tr class="sa-mais-dias" data-sa-mais><td colspan="10">Carregando as próximas semanas…</td></tr>'
   :'<tr class="sa-mais-dias"><td colspan="10">Mostrando as saídas até '+ate.toLocaleDateString('pt-BR')+'.</td></tr>';
  host.querySelector('[data-sa-corpo]').innerHTML=(html||'<tr><td colspan="10" class="sa-vazio">'+(st.de||st.ate?'Nada sai do galpão nesse período.':d.length?'Nenhum item com esse filtro.':'Nada sai do galpão até '+ate.toLocaleDateString('pt-BR')+'.')+'</td></tr>')+fim;
  vigiarFim(host,esc);
 }

 async function buscar(ctx,dias){
  const {data,error}=await ctx.sb.rpc('acervo_proximas_saidas',{p_empresa:ctx.empresa,p_dias:dias});
  if(error)throw Error(error.message);return Array.isArray(data)?data:[];
 }
 let cargaId=0;
 async function carregar(ctx){
  const id=++cargaId,dias=st.dias;
  try{const dados=await buscar(ctx,dias);if(id!==cargaId)return;st.dados=dados;st.dadosDias=dias;st.erro=null;window.AcervoSaidasResumo?.limpar();if(st.exemplo)comExemplos(st.dados);}
  catch(err){if(id===cargaId)st.erro=err.message;throw err;}
 }
 // (16/11/2026) "Ver com exemplos": só na tela, acrescenta pedidos fictícios saindo no mesmo dia dos reais, para ver o
 // agrupamento Por item × Por pedido. Nada é gravado; a reserva e o livre do dia são ajustados na mesma conta.
 const EXEMPLOS=[
  {numero:'EX-1',cliente:'Exemplo · Ateliê Flor de Lis',local:'Exemplo · Fazenda Santa Clara',pre_reserva:false},
  {numero:'EX-2',cliente:'Exemplo · Studio Bem Casados',local:'Exemplo · Casarão das Palmeiras',pre_reserva:true},
  {numero:'EX-3',cliente:'Exemplo · Lima Eventos',local:'Exemplo · Espaço Vista Mar',pre_reserva:false}];
 function comExemplos(lista){
  let k=0;
  for(const i of lista){
   const base=(i.pedidos||[])[0];if(!base)continue;
   const dia=String(base.data).slice(0,10),extras=1+(k%3),novos=[];
   for(let e=0;e<extras;e++){const ex=EXEMPLOS[(k+e)%EXEMPLOS.length];novos.push({...base,...ex,quantidade:1+((k+e)%4),cliente_foto:'',carregado:false,exemplo:true});}
   i.pedidos=[...i.pedidos,...novos];
   const ld=i.livre_dia?.[dia];
   if(ld&&typeof ld==='object'){const soma=novos.reduce((t,x)=>t+Number(x.quantidade||0),0);ld.reservado=Number(ld.reservado||0)+soma;
    ld.reservas=[...(ld.reservas||[]),...novos.map(x=>({...x,entrega:dia,coleta:dia}))];}
   i.saindo=Number(i.saindo||0)+novos.reduce((t,x)=>t+Number(x.quantidade||0),0);
   i.n_pedidos=Number(i.n_pedidos||0)+novos.length;
   if(++k>=40)break;
  }
 }
 // rolou até o fim da lista: busca mais 60 dias (o que já está na tela não muda de lugar)
 let ctxAtual=null;
 function vigiarFim(host,esc){
  st.obs?.disconnect();
  const alvo=host.querySelector('[data-sa-mais]');if(!alvo||!ctxAtual)return;
  st.obs=new IntersectionObserver(async(ents)=>{
   if(!ents.some(e=>e.isIntersecting)||st.carregando||!host.isConnected)return;
   st.carregando=true;st.obs.disconnect();
   try{st.dias=Math.min(MAX_DIAS,st.dias+PASSO);await carregar(ctxAtual);if(host.isConnected)desenhar(host,esc);}
   catch(err){ctxAtual.msg?.(err.message,true);if(host.isConnected)desenhar(host,esc);}
   finally{st.carregando=false;}
  },{rootMargin:'600px 0px'});
  st.obs.observe(alvo);
 }

 let badgeCtx=null;
 addEventListener('focus',()=>{if(badgeCtx)window.AcervoSaidas.contar(badgeCtx);});
 addEventListener('storage',e=>{const ctx=badgeCtx||ctxAtual;if(e.key!=='acervo_sinais_atualizados'||!ctx)return;try{if(JSON.parse(e.newValue)?.empresa!==ctx.empresa)return;}catch{return;}window.AcervoSaidas.contar(ctx);if(ctxAtual&&document.querySelector('[data-aba=saidas][aria-selected=true]'))window.AcervoSaidas.render(ctxAtual);});
 window.AcervoSaidas={
  async render(ctx){
   const {host,esc}=ctx;ctxAtual=ctx;st.dias=PASSO;
   host.innerHTML='<section class="sa-pagina"><div class="sa-barra">'
    +'<input type="search" class="el-input sa-busca" data-sa-busca placeholder="Pesquisar item, código ou pedido" value="'+esc(st.busca)+'">'
    +'<div class="sa-periodo" role="group" aria-label="Período"><select class="el-select" data-sa-atalho aria-label="Período">'
    +[['','Todos os dias'],['hoje','Hoje'],['amanha','Amanhã'],['7','Próximos 7 dias'],['15','Próximos 15 dias'],['30','Próximos 30 dias'],['mes','Este mês'],['proxmes','Próximo mês'],['periodo','Escolher período…']].map(([v,t])=>'<option value="'+v+'"'+(st.atalho===v?' selected':'')+'>'+t+'</option>').join('')+'</select>'
    +'<label'+(st.atalho==='periodo'?'':' hidden')+' data-sa-de-wrap>De <input type="date" class="el-input" data-sa-de value="'+esc(st.de||'')+'"></label>'
    +'<label'+(st.atalho==='periodo'?'':' hidden')+' data-sa-ate-wrap>Até <input type="date" class="el-input" data-sa-ate value="'+esc(st.ate||'')+'"></label></div>'
    +'<label class="sa-so"><input type="checkbox" data-sa-so'+(st.so?' checked':'')+'> Só itens com sinalização</label>'
    +'<div class="sa-visoes" role="group" aria-label="Agrupar período"><button type="button" data-sa-visao="meses" aria-pressed="'+(st.visao==='meses')+'">Resumo mensal</button><button type="button" data-sa-visao="dias" aria-pressed="'+(st.visao==='dias')+'">Dia a dia</button></div>'
    +'<div class="sa-modos" role="group" aria-label="Visualização"><span>Ver</span>'
    +'<button type="button" data-sa-modo="item" aria-pressed="'+(st.modo==='item')+'">Por item</button>'
    +'<button type="button" data-sa-modo="pedido" aria-pressed="'+(st.modo==='pedido')+'">Por pedido</button></div>'
    +'<button type="button" class="sa-exemplo" data-sa-exemplo aria-pressed="'+!!st.exemplo+'">'+(st.exemplo?'Esconder exemplos':'Ver com exemplos')+'</button>'
    +'</div>'
    +'<div data-sa-erro hidden role="status"></div><div data-sa-mensal hidden aria-live="polite"></div>'
    +'<div class="sa-tabela-wrap" data-sa-diario><table class="sa-tabela"><thead><tr><th class="sa-col-item">Item</th><th class="sa-col-pedido">Pedido e cliente</th><th class="sa-col-local">Local</th><th class="sa-num sa-col-estoque">Estoque</th><th class="sa-num sa-col-manutencao">Manutenção</th><th class="sa-num sa-col-fora">Fora</th><th class="sa-num sa-col-reservado">Reservado</th><th class="sa-num sa-col-livre">Livre</th><th class="sa-col-protecao">Proteção (precisa de / tem)</th><th class="sa-col-sinais">Sinalizações</th></tr></thead><tbody data-sa-corpo><tr><td colspan="10" class="sa-vazio">Carregando…</td></tr></tbody></table></div></section>';
   host.querySelector('[data-sa-busca]').oninput=e=>{st.busca=e.target.value;desenhar(host,esc);};
   host.querySelector('[data-sa-so]').onchange=e=>{st.so=e.target.checked;desenhar(host,esc);};
   // (18/11/2026) dia/período: filtra os dias; se o fim passa do que já foi carregado, busca mais dias
   let periodoGeracao=0;
   const aplicarPeriodo=async(automatico=true)=>{
    const sequencia=++periodoGeracao;
    const hoje=new Date(),h=iso(hoje),soma=d=>{const x=new Date();x.setDate(x.getDate()+d);return iso(x);};
    const a=st.atalho;
    if(a==='hoje'){st.de=h;st.ate=h;}else if(a==='amanha'){st.de=st.ate=soma(1);}
    else if(['7','15','30'].includes(a)){st.de=h;st.ate=soma(Number(a));}
    else if(a==='mes'){st.de=h;st.ate=iso(new Date(hoje.getFullYear(),hoje.getMonth()+1,0));}
    else if(a==='proxmes'){st.de=iso(new Date(hoje.getFullYear(),hoje.getMonth()+1,1));st.ate=iso(new Date(hoje.getFullYear(),hoje.getMonth()+2,0));}
    else if(a==='periodo'){st.de=host.querySelector('[data-sa-de]').value||'';st.ate=host.querySelector('[data-sa-ate]').value||'';if(st.de&&st.ate&&st.ate<st.de)st.ate=st.de;}
    else{st.de='';st.ate='';}
    host.querySelector('[data-sa-de-wrap]').hidden=host.querySelector('[data-sa-ate-wrap]').hidden=a!=='periodo';
    const max=dt(h);max.setDate(max.getDate()+MAX_DIAS);const maxIso=iso(max);
    if(st.de&&st.de<h)st.de=h;if(st.ate&&st.ate<h)st.ate=h;
    if(st.de&&st.de>maxIso)st.de=maxIso;if(st.ate&&st.ate>maxIso)st.ate=maxIso;
    host.querySelector('[data-sa-de]').value=st.de;host.querySelector('[data-sa-ate]').value=st.ate;
    if(automatico)st.visao=st.de&&st.ate&&st.de!==st.ate?'meses':'dias';
    if(st.ate||st.de){const precisa=Math.min(MAX_DIAS,Math.ceil((dt(st.ate||st.de)-dt(h))/86400000)+1);if(precisa>st.dadosDias){st.dias=Math.max(st.dias,precisa);try{await carregar(ctx);}catch(err){ctx.msg?.(err.message,true);}}}
    if(sequencia===periodoGeracao&&host.isConnected)desenhar(host,esc);
   };
   host.querySelector('[data-sa-atalho]').onchange=e=>{st.atalho=e.target.value;aplicarPeriodo();};
   host.querySelector('[data-sa-de]').onchange=()=>aplicarPeriodo();host.querySelector('[data-sa-ate]').onchange=()=>aplicarPeriodo();
   const limite=dt(hojeIso());limite.setDate(limite.getDate()+MAX_DIAS);
   host.querySelectorAll('[data-sa-de],[data-sa-ate]').forEach(input=>{input.min=hojeIso();input.max=iso(limite);});
   host.querySelectorAll('[data-sa-visao]').forEach(b=>b.onclick=()=>{st.visao=b.dataset.saVisao;desenhar(host,esc);});
   host.querySelector('[data-sa-exemplo]').onclick=async e=>{st.exemplo=!st.exemplo;try{sessionStorage.setItem('acervo_saidas_exemplo',st.exemplo?'1':'');}catch{}
    e.target.textContent=st.exemplo?'Esconder exemplos':'Ver com exemplos';e.target.setAttribute('aria-pressed',String(st.exemplo));
    try{await carregar(ctx);}catch(err){ctx.msg?.(err.message,true);}if(host.isConnected)desenhar(host,esc);};
   host.querySelectorAll('[data-sa-modo]').forEach(b=>b.onclick=()=>{st.modo=b.dataset.saModo;try{localStorage.setItem('acervo_saidas_modo',st.modo);}catch{}
    host.querySelectorAll('[data-sa-modo]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));desenhar(host,esc);});
   try{await configurar(ctx);await carregar(ctx);if(st.atalho)await aplicarPeriodo(false);else desenhar(host,esc);window.AcervoSaidas.contar(ctx);}catch(err){st.erro=err.message;desenhar(host,esc);}
  },
  // bolinha da aba (itens com problema nos próximos N dias), sem abrir a aba
  async contar(ctx){badgeCtx=ctx;try{await configurar(ctx);const dias=Math.max(1,...Object.values(regras||{}).filter(r=>r.mostrar&&r.dias!==null).map(r=>r.dias));const d=await buscar(ctx,dias);atualizarBadge(d);}catch{}}

 };
})();
