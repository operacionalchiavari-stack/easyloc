/* Gestão do acervo > Miguel · IA (21/11/2026): mesma identidade em todo o estoque: agente especialista em estoque.
   Responde com base nas próximas saídas, divergências, problemas de separação, peças danificadas/O.S. e inventário
   (Edge Function estoque-assistente, que lê tudo com o login de quem pergunta).
   - Toda resposta vem com os itens comentados em cartões COM FOTO (pedido: "sempre fotos dos itens, nunca só texto").
   - À direita, relatórios prontos: cada um gera um arquivo A4 (fotos dos itens + comentário de cada um) com
     "Imprimir / salvar PDF" (mesmo modelo da Clara do Financeiro, FinRelatorioA4).
   A conversa fica nesta aba do navegador. */
(function(){
 'use strict';
 const NOME='Miguel';
 const RELATORIOS=[
  {t:'Próximos 3 meses',d:90,p:'Faça uma análise completa dos próximos 3 meses: em quais dias e com quais itens vamos ter falta ou pouca folga, o que depende de pré-reserva e o que precisa ser feito antes de cada evento.'},
  {t:'Problemas das próximas 2 semanas',d:14,p:'Quais problemas podem acontecer nas próximas 2 semanas? Organize por dia, do mais urgente para o menos urgente, com a solução de cada um.'},
  {t:'Itens que mais saem',d:90,p:'Quais itens estão saindo em maior quantidade nos próximos 90 dias (somando todos os pedidos)? Para os principais, diga se o estoque aguenta os dias de pico.'},
  {t:'Manutenção que faz falta',d:60,p:'Quais peças em manutenção, reparo ou fora do galpão fazem falta para eventos próximos? Diga o que precisa voltar até quando.'},
  {t:'Contagens e divergências',d:60,p:'Quais contagens pendentes e divergências estão travando itens que têm saída marcada? O que resolver primeiro?'},
  {t:'Capas e caixas',d:60,p:'Para os próximos eventos, falta material de proteção (capas ou caixas)? Quais itens nem têm proteção cadastrada?'},
  {t:'Prioridades da triagem',d:14,p:'O que a triagem deve priorizar nesta semana para todos os pedidos saírem completos e em condições?'}];
 const SIT={falta:['Falta','bad'],atencao:['Atenção','warn'],ok:['Em dia','ok']};
 const st={lista:[],aguardando:false,chave:''};
 const escH=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const semMedida=t=>String(t||'').split(' (L)')[0];
 const medida=t=>{const m=/\(L\).*$/.exec(String(t||''));return m?m[0]:'';};
 // markdown simples: **negrito**, listas com - ou 1., títulos ###, quebras de linha
 function formatar(t){
  const linhas=escH(t).split(/\n/);let html='',lista='';
  const fecha=()=>{if(lista){html+='</'+lista+'>';lista='';}};
  for(let l of linhas){
   l=l.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\s*\(c\d+\)/g,'');
   let m;
   if((m=/^\s*#{1,4}\s+(.*)$/.exec(l))){fecha();html+='<h4>'+m[1]+'</h4>';}
   else if((m=/^\s*[-•*]\s+(.*)$/.exec(l))){if(lista!=='ul'){fecha();html+='<ul>';lista='ul';}html+='<li>'+m[1]+'</li>';}
   else if((m=/^\s*\d+[.)]\s+(.*)$/.exec(l))){if(lista!=='ol'){fecha();html+='<ol>';lista='ol';}html+='<li>'+m[1]+'</li>';}
   else if(!l.trim()){/* linha vazia */}
   else{fecha();html+='<p>'+l+'</p>';}
  }
  fecha();return html;
 }
 const foto=i=>i.foto?'<img src="'+escH(i.foto)+'" alt="" loading="lazy">':'<span class="cora-sem-foto" aria-hidden="true">📦</span>';
 const cartoes=itens=>!itens?.length?'':'<div class="cora-itens">'+itens.map(i=>{const s=SIT[i.situacao]||SIT.atencao;
  return '<figure class="cora-item s-'+s[1]+'"><div class="cora-foto">'+foto(i)+'<span class="cora-sit">'+s[0]+'</span></div><figcaption><b>'+escH(semMedida(i.nome))+'</b>'
   +'<small>'+escH([i.codigo,medida(i.nome)].filter(Boolean).join(' · '))+'</small>'+(i.foto_kit?'<small class="cora-kit">foto do kit '+escH(i.foto_kit)+'</small>':'')+'<p>'+escH(i.comentario)+'</p></figcaption></figure>';}).join('')+'</div>';
 function salvar(){try{sessionStorage.setItem(st.chave,JSON.stringify(st.lista.slice(-40)));}catch{}}
 function msgIa(m,i){
  if(m.relatorio)return '<div class="cora-msg ia"><div class="cora-avatar" aria-hidden="true"><img data-ia-foto width="512" height="512" loading="eager" src="../../../assets/agentes/miguel.jpg" alt="" decoding="sync"></div><div class="cora-balao"><p>Pronto, o relatório <b>'+escH(m.relatorio.titulo)+'</b> está pronto.</p>'
   +(m.relatorio.resumo?'<p>'+escH(m.relatorio.resumo)+'</p>':'')+cartoes((m.relatorio.secoes||[]).flatMap(s=>s.itens).slice(0,4))
   +'<button type="button" class="btn primary cora-abrir" data-cora-abrir="'+i+'">Abrir relatório (A4 com fotos)</button></div></div>';
  return '<div class="cora-msg ia"><div class="cora-avatar" aria-hidden="true"><img data-ia-foto width="512" height="512" loading="eager" src="../../../assets/agentes/miguel.jpg" alt="" decoding="sync"></div><div class="cora-balao">'+formatar(m.texto)+cartoes(m.itens)+'</div></div>';
 }
 function pintar(host){
  const msgs=host.querySelector('[data-cora-msgs]');
  msgs.innerHTML=(st.lista.length?'':'<div class="cora-boas"><div class="cora-avatar grande" aria-hidden="true"><img data-ia-foto width="512" height="512" loading="eager" src="../../../assets/agentes/miguel.jpg" alt="" decoding="sync"></div><h3>Oi, eu sou o '+NOME+'.</h3><p>Cuido para que todo o material esteja pronto e em condições no dia de cada evento. Pergunte o que quiser sobre as próximas saídas, manutenção, contagens e proteção, sempre com a foto de cada item, ou gere um relatório ao lado.</p></div>')
   +st.lista.map((m,i)=>m.papel==='ia'?msgIa(m,i):'<div class="cora-msg eu"><div class="cora-balao">'+escH(m.texto)+'</div></div>').join('')
   +(st.aguardando?'<div class="cora-msg ia"><div class="cora-avatar" aria-hidden="true"><img data-ia-foto width="512" height="512" loading="eager" src="../../../assets/agentes/miguel.jpg" alt="" decoding="sync"></div><div class="cora-balao cora-digitando"><span></span><span></span><span></span> '+escH(st.aguardando)+'</div></div>':'');
  msgs.scrollTop=msgs.scrollHeight;
  host.querySelector('[data-cora-enviar]').disabled=!!st.aguardando;
  host.querySelectorAll('[data-cora-rel]').forEach(b=>b.disabled=!!st.aguardando);
  host.querySelectorAll('[data-cora-abrir]').forEach(b=>b.addEventListener('click',()=>abrirRelatorio(st.lista[+b.dataset.coraAbrir].relatorio)));
 }
 async function chamar(ctx,body){
  const {data,error}=await ctx.sb.functions.invoke('estoque-assistente',{body:{empresa_id:ctx.empresa,...body}});
  let erro=data?.erro||'';
  if(error&&!erro){try{erro=(await error.context?.json?.())?.erro||error.message;}catch{erro=error.message;}}
  if(erro)throw Error(erro);
  return data;
 }
 async function perguntar(ctx,host,texto,dias){
  texto=String(texto||'').trim();if(!texto||st.aguardando)return;
  st.lista.push({papel:'pessoa',texto});st.aguardando='analisando o estoque…';salvar();pintar(host);
  try{const d=await chamar(ctx,{acao:'conversar',dias:dias||90,mensagens:st.lista.filter(m=>!m.relatorio).slice(-20).map(m=>({papel:m.papel,texto:m.texto}))});
   st.lista.push({papel:'ia',texto:String(d?.resposta||''),itens:d?.itens||[]});}
  catch(e){st.lista.push({papel:'ia',texto:'Não consegui responder agora: '+(e.message||e)});}
  finally{st.aguardando=false;salvar();pintar(host);}
 }
 async function gerarRelatorio(ctx,host,r){
  if(st.aguardando)return;
  st.lista.push({papel:'pessoa',texto:'Gerar o relatório: '+r.t});st.aguardando='montando o relatório com as fotos dos itens…';salvar();pintar(host);
  try{const d=await chamar(ctx,{acao:'relatorio',dias:r.d,pedido:r.p});
   st.lista.push({papel:'ia',texto:'',relatorio:d.relatorio});st.aguardando=false;salvar();pintar(host);abrirRelatorio(d.relatorio);}
  catch(e){st.lista.push({papel:'ia',texto:'Não consegui gerar o relatório agora: '+(e.message||e)});st.aguardando=false;salvar();pintar(host);}
 }
 // folha A4: cabeçalho, resumo, destaques, cada seção com os itens em fichas (foto + comentário) e "O que fazer"
 function abrirRelatorio(rel){
  if(!rel)return;
  const dt=new Date(rel.gerado_em||Date.now());
  const quando=dt.toLocaleDateString('pt-BR')+' às '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const logo=document.querySelector('#sidebarLogo,.catalog-brand-logo')?.src||window.top?.document?.getElementById?.('sidebarLogo')?.src||'';
  const ficha=i=>{const s=SIT[i.situacao]||SIT.atencao;return '<div class="co-ficha"><div class="co-fi-foto">'+(i.foto?'<img src="'+escH(i.foto)+'" alt="">':'')+'</div><div class="co-fi-txt"><div class="co-fi-top"><b>'+escH(semMedida(i.nome))+'</b><span class="rr-pill '+s[1]+'">'+s[0]+'</span></div><small>'+escH([i.codigo,i.categoria,medida(i.nome)].filter(Boolean).join(' · '))+(i.foto_kit?' · foto do kit '+escH(i.foto_kit):'')+'</small><p>'+escH(i.comentario)+'</p></div></div>';};
  const html='<style>.co-fichas{display:grid;grid-template-columns:1fr 1fr;gap:8px}.co-ficha{display:grid;grid-template-columns:30mm 1fr;gap:8px;padding:6px;border:1px solid #e8ebef;border-radius:6px;break-inside:avoid}.co-fi-foto{height:30mm;border-radius:4px;background:#f6f7f9;overflow:hidden}.co-fi-foto img{width:100%;height:100%;object-fit:contain;display:block}.co-fi-top{display:flex;justify-content:space-between;gap:6px;align-items:flex-start}.co-fi-top b{color:#04111f;font-size:8.5pt;line-height:1.25}.co-fi-txt small{display:block;color:#6b7789;font-size:6.8pt;margin-top:1px}.co-fi-txt p{margin:4px 0 0;font-size:8pt}.co-passos{margin:0;padding-left:18px}.co-passos li{margin:3px 0}</style>'
   +'<div class="rr-doc"><div class="rr-head"><div>'+(logo?'<img src="'+escH(logo)+'" alt="" style="filter:brightness(0)">':'<b>Chiavari</b>')+'<div class="rr-head-company">Gestão do acervo · '+escH(NOME)+', assistente do estoque</div></div><div class="rr-head-id"><strong>Relatório do estoque</strong>'+escH(quando)+((()=>{let n='';try{n=sessionStorage.getItem('usuario_nome')||'';}catch{}n=n||rel.por||'';return n&&!n.includes('@')?' · '+escH(n):'';})())+'</div></div>'
   +'<div class="rr-title"><div><span>Próximos '+(rel.periodo_dias||'')+' dias</span><h1>'+escH(rel.titulo)+'</h1></div></div>'
   +(rel.resumo?'<div class="rr-note">'+escH(rel.resumo)+'</div>':'')
   +(rel.destaques?.length?'<div class="rr-kpis">'+rel.destaques.map(x=>'<div><small>'+escH(x.rotulo)+'</small><strong>'+escH(x.valor)+'</strong></div>').join('')+'</div>':'')
   +(rel.secoes||[]).map(s=>'<div class="rr-section"><h2>'+escH(s.titulo)+' <b>'+(s.itens?.length||0)+' itens</b></h2>'+(s.texto?'<p style="margin:0 0 7px">'+escH(s.texto)+'</p>':'')+(s.itens?.length?'<div class="co-fichas">'+s.itens.map(ficha).join('')+'</div>':'')+'</div>').join('')
   +(rel.o_que_fazer?.length?'<div class="rr-section"><h2>O que fazer</h2><ol class="co-passos">'+rel.o_que_fazer.map(x=>'<li>'+escH(x)+'</li>').join('')+'</ol></div>':'')
   +'<div class="rr-foot"><span>Gerado pelo '+escH(NOME)+' com os dados do sistema em '+escH(quando)+'.</span><span>Acervo</span></div></div>';
  if(window.FinRelatorioA4)window.FinRelatorioA4.previa(html,rel.titulo);
 }
 window.AcervoCora={
  abrirRelatorio,
  render(ctx){
   const host=ctx.host;st.chave='cora_chat:'+ctx.empresa;
   try{st.lista=JSON.parse(sessionStorage.getItem(st.chave)||'[]');}catch{st.lista=[];}
   host.innerHTML='<section class="cora"><div class="cora-chat"><header class="ia-topo"><span class="ia-topo-foto" aria-hidden="true"><img data-ia-foto width="512" height="512" src="../../../assets/agentes/miguel.jpg" alt=""></span><div class="ia-topo-texto"><strong>'+NOME+'</strong><small><i class="ia-topo-dot" aria-hidden="true"></i><span>Estoque e separação · online</span></small></div><div class="ia-topo-acoes"><button type="button" class="ia-topo-btn" data-cora-nova title="Começar uma nova conversa"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg><span>Nova conversa</span></button></div></header><div class="cora-msgs" data-cora-msgs aria-live="polite"></div>'
    +'<form class="cora-campo" data-cora-form><textarea rows="1" data-cora-texto placeholder="Pergunte ao '+NOME+' (ex.: o que pode faltar no próximo sábado?)" aria-label="Pergunta para o '+NOME+'"></textarea><button type="submit" class="btn primary" data-cora-enviar>Enviar</button></form>'
    +'<p class="cora-dica">Enter envia · Shift+Enter quebra a linha · O '+NOME+' lê os dados com o seu acesso e não altera nada.</p></div>'
    +'<aside class="cora-lado"><h3>Relatórios</h3><p class="cora-lado-dica">Cada um gera um arquivo A4 com a foto e o comentário de cada item, pronto para imprimir ou salvar em PDF.</p><div class="cora-rels">'+RELATORIOS.map((r,i)=>'<button type="button" class="cora-rel" data-cora-rel="'+i+'"><b>'+escH(r.t)+'</b><small>'+escH(r.p)+'</small><span class="cora-rel-arq">Gerar arquivo</span></button>').join('')+'</div>'
    +'<button type="button" class="cora-nova" data-cora-nova>Nova conversa</button></aside></section>';
   const txt=host.querySelector('[data-cora-texto]');
   const ajustar=()=>{txt.style.height='auto';txt.style.height=Math.min(160,txt.scrollHeight)+'px';};
   txt.addEventListener('input',ajustar);
   txt.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();host.querySelector('[data-cora-form]').requestSubmit();}});
   host.querySelector('[data-cora-form]').addEventListener('submit',e=>{e.preventDefault();const v=txt.value;txt.value='';ajustar();perguntar(ctx,host,v);});
   host.querySelectorAll('[data-cora-rel]').forEach(b=>b.addEventListener('click',()=>gerarRelatorio(ctx,host,RELATORIOS[+b.dataset.coraRel])));
   host.querySelectorAll('[data-cora-nova]').forEach(b=>b.addEventListener('click',()=>{if(st.aguardando)return;st.lista=[];salvar();pintar(host);txt.focus();}));
   pintar(host);
  }
 };
})();
