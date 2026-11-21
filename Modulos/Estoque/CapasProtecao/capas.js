(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tipo={fabricacao:'Fabricação',inventario:'Contagem do disponível',manutencao:'Envio à manutenção',reparo:'Retorno da manutenção',perda:'Perda no galpão',perda_manutencao:'Perda na manutenção',perda_pedido:'Perda confirmada no pedido'};
 const etapas={triagem:'Triagem da ida',carregamento:'Carregamento',descarregamento:'Descarregamento',retorno:'Triagem da volta'};
 let sb,empresa,modelos=[],editar=false,versao=0,abaAtual='capas',modoExemplos=false,demonstracao=null,versaoDados=0,versaoPerdas=0,trocaModo=0;
 const hoje=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const data=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'Sem registro';
 const instante=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
 const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 // 15/11/2026: Perdas da equipe. Saiu no carregamento e não voltou no descarregamento = sumiu no evento: conta para a
 // equipe da desmontagem do pedido (o valor é dividido entre as pessoas). Sumiu entre o descarregamento e a triagem da
 // volta = no galpão. Nunca vai para o cliente. Dados: capas_perdas_equipe.
 const perdas={de:null,ate:null};
 const coresPerdas=['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#6250d6','#008300','#e34948'];
 function graficoPerdas(titulo,descricao,partes,monetario=false){
  const fmt=monetario?brl:v=>String(v),total=partes.reduce((s,p)=>s+p.valor,0),R=60,C=2*Math.PI*R;
  let angulo=0;
  const fatias=partes.filter(p=>p.valor>0).map(p=>{
   const fracao=p.valor/total,comprimento=Math.max(0,fracao*C-(partes.filter(x=>x.valor>0).length>1?2:0)),offset=-angulo*C;angulo+=fracao;
   return `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${p.cor}" stroke-width="26" stroke-dasharray="${comprimento} ${C-comprimento}" stroke-dashoffset="${offset}" transform="rotate(-90 80 80)"><title>${esc(p.nome)}: ${esc(fmt(p.valor))} (${Math.round(fracao*100)}%)</title></circle>`;
  }).join('');
  return `<article class="cp-perdas-grafico"><h3>${esc(titulo)}</h3><p class="cp-perdas-nota">${esc(descricao)}</p><div class="cp-perdas-rosca"><svg viewBox="0 0 160 160" role="img" aria-label="${esc(titulo)}"><circle r="${R}" cx="80" cy="80" fill="none" stroke="#e8ecf1" stroke-width="26"/>${fatias}<text x="80" y="76" text-anchor="middle" class="cp-rosca-rot">Total</text><text x="80" y="96" text-anchor="middle" class="cp-rosca-val">${esc(fmt(total))}</text></svg><ul class="cp-perdas-legenda">${partes.map(p=>`<li><i style="background:${p.cor}" aria-hidden="true"></i><span>${esc(p.nome)}</span><b>${esc(fmt(p.valor))}</b><small>${total>0?Math.round(p.valor/total*100):0}%</small></li>`).join('')}</ul></div>${total===0?'<p class="cp-perdas-vazio">Nenhuma perda no período.</p>':''}</article>`;
 }
 // 16/11/2026: foto (ou iniciais) de integrantes e clientes em Perdas da equipe
 const iniciaisDe=n=>String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?';
 function urlFotoPessoa(e){if(/^https?:/i.test(e?.foto||''))return e.foto;if(e?.funcionario_id&&sb?.storage&&!modoExemplos){try{return sb.storage.from('avatares').getPublicUrl(empresa+'/'+e.funcionario_id+'.jpg').data.publicUrl;}catch(_){}}return '';}
 function fotoHtml(url,nome,classe){const ini=esc(iniciaisDe(nome));return '<span class="cp-foto-redonda '+(classe||'')+'" title="'+esc(nome||'')+'">'+ini+(url?'<img src="'+esc(url)+'" alt="" loading="lazy" onerror="this.remove()">':'')+'</span>';}
 async function pintarPerdas(){
  const host=$('cpPerdasPainel'),v=++versaoPerdas;
  if(!perdas.de){const h=hoje();perdas.ate=h;const d=new Date(h+'T12:00:00');d.setDate(d.getDate()-90);perdas.de=d.toISOString().slice(0,10);}
  host.innerHTML=`<form class="cp-perdas-barra"><label>De<input type="date" data-perdas-de value="${perdas.de}" max="${hoje()}" required></label><label>Até<input type="date" data-perdas-ate value="${perdas.ate}" max="${hoje()}" required></label><button type="submit" class="cp-consultar"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>Consultar</button><p class="cp-perdas-erro" role="status"></p></form><div data-perdas-conteudo aria-live="polite" aria-busy="true"><p>Carregando…</p></div>`;
  // 16/11/2026: o filtro fica na linha do título "Material de proteção" (no cabeçalho), não dentro da aba
  const filtro=host.querySelector('form.cp-perdas-barra'),lugar=$('cpPerdasFiltro');if(lugar){lugar.replaceChildren(filtro);}
  filtro.onsubmit=e=>{
   e.preventDefault();const de=filtro.querySelector('[data-perdas-de]').value,ate=filtro.querySelector('[data-perdas-ate]').value;
   if(de>ate){filtro.querySelector('.cp-perdas-erro').textContent='A data inicial deve ser anterior ou igual à data final.';return;}
   perdas.de=de;perdas.ate=ate;pintarPerdas();
  };
  let lista;try{lista=await rpc('capas_perdas_equipe',{p_empresa:empresa,p_de:perdas.de,p_ate:perdas.ate});}catch(e){if(v===versaoPerdas){const conteudo=host.querySelector('[data-perdas-conteudo]');conteudo.textContent=e.message;conteudo.setAttribute('aria-busy','false');}return;}
  if(v!==versaoPerdas)return;
  lista=Array.isArray(lista)?lista:[];
  const pessoas=new Map();let totEv=0,valEv=0,totGal=0,valGal=0;
  for(const r of lista){
   totEv+=Number(r.no_evento||0);valEv+=Number(r.valor_evento||0);totGal+=Number(r.no_galpao||0);valGal+=Number(r.valor_galpao||0);
   if(!r.no_evento)continue;
   const eq=Array.isArray(r.equipe)?r.equipe:[];
   if(!eq.length){const p=pessoas.get('-')||{nome:'Sem equipe escalada',eventos:new Set(),qtd:0,valor:0};p.eventos.add(r.pedido_id);p.qtd+=Number(r.no_evento||0);p.valor+=Number(r.valor_evento||0);pessoas.set('-',p);continue;}
   for(const e of eq){const k=e.funcionario_id||e.free_id||e.nome;const p=pessoas.get(k)||{nome:e.nome,papel:e.papel,foto:urlFotoPessoa(e),eventos:new Set(),qtd:0,valor:0};p.eventos.add(r.pedido_id);p.qtd+=Number(r.no_evento||0);p.valor+=Number(r.valor_evento||0)/eq.length;if(e.papel==='responsavel')p.papel='responsavel';pessoas.set(k,p);}
  }
  const porPessoa=[...pessoas.values()].sort((a,b)=>b.valor-a.valor);
  const equipe=r=>(Array.isArray(r.equipe)&&r.equipe.length)?'<span class="cp-equipe-fotos">'+r.equipe.map(e=>'<span class="cp-equipe-pessoa">'+fotoHtml(urlFotoPessoa(e),e.nome,'is-mini')+'<span>'+esc(e.nome)+(e.papel==='responsavel'?' <small>resp.</small>':'')+'</span></span>').join('')+'</span>':'<span class="cp-sem-custo">Ninguém escalado</span>';
  const conteudo=host.querySelector('[data-perdas-conteudo]');
  const tabelaPessoas=porPessoa.map((p,n)=>`<tr><th scope="row"><span class="cp-perdas-pessoa"><i style="background:${coresPerdas[n%coresPerdas.length]}" aria-hidden="true"></i>${p.nome==='Sem equipe escalada'?'':fotoHtml(p.foto,p.nome)}<span>${esc(p.nome)}${p.papel==='responsavel'?'<small>Responsável da desmontagem</small>':''}</span></span></th><td>${p.eventos.size}</td><td>${p.qtd}</td><td>${brl(p.valor)}</td></tr>`).join('');
  const resumoLinha=(nome,qtd,valor)=>`<tr><th scope="row">${nome}</th><td>${qtd}</td><td>${brl(valor)}</td></tr>`;
  conteudo.innerHTML=`<article class="cp-perdas-card"><header><h2>Visão gerencial</h2><p>${data(perdas.de)} a ${data(perdas.ate)}</p></header><div class="cp-perdas-grade"><div class="cp-perdas-dados"><div class="cp-perdas-resumo"><div><span>Materiais perdidos</span><strong data-perdas-total>${totEv+totGal}</strong></div><div><span>Valor das perdas</span><strong data-perdas-valor>${brl(valEv+valGal)}</strong></div></div><table class="cp-perdas-tabela cp-perdas-origem"><caption>Origem das perdas</caption><thead><tr><th scope="col">Local</th><th scope="col">Materiais</th><th scope="col">Valor</th></tr></thead><tbody>${resumoLinha('No evento',totEv,valEv)}${resumoLinha('No galpão',totGal,valGal)}</tbody></table><h3>Equipe da desmontagem</h3><p class="cp-perdas-nota">O valor perdido no evento é dividido entre os integrantes da equipe.</p><div class="cp-perdas-scroll"><table class="cp-perdas-tabela cp-perdas-pessoas"><thead><tr><th scope="col">Integrante</th><th scope="col">Eventos</th><th scope="col">Materiais¹</th><th scope="col">Parte no valor</th></tr></thead><tbody>${tabelaPessoas||'<tr><td colspan="4" class="cp-sem-registros">Nenhuma perda em evento no período.</td></tr>'}</tbody></table></div><p class="cp-perdas-nota cp-perdas-rodape">¹ Materiais perdidos nos eventos em que a pessoa participou. A mesma ocorrência pode aparecer para mais de um integrante.</p></div><div class="cp-perdas-graficos">${graficoPerdas('Onde ocorreram as perdas','Quantidade de materiais por local.',[{nome:'No evento',valor:totEv,cor:coresPerdas[0]},{nome:'No galpão',valor:totGal,cor:coresPerdas[1]}])}${graficoPerdas('Distribuição do valor por integrante','Considera somente as perdas nos eventos.',porPessoa.map((p,n)=>({nome:p.nome,valor:p.valor,cor:coresPerdas[n%coresPerdas.length]})),true)}</div></div></article><article class="cp-perdas-card cp-perdas-ocorrencias"><header><h2>Ocorrências do período</h2><p>Confira os pedidos e os materiais que compõem os resultados.</p></header><div class="cp-perdas-scroll"><table class="cp-hist"><thead><tr><th>Descarregado em</th><th>Pedido</th><th>Material</th><th>Saíram / voltaram</th><th>Perdas</th><th>Valor</th><th>Equipe da desmontagem</th></tr></thead><tbody>${lista.map(r=>'<tr><td>'+esc(data(r.data))+'</td><td><span class="cp-cliente-linha">'+fotoHtml(/^https?:/i.test(r.cliente_foto||'')?r.cliente_foto:'',r.cliente,'is-mini')+'<span>Pedido '+esc(r.numero)+'<small>'+esc(r.cliente||'')+'</small></span></span></td><td>'+esc(r.modelo||r.item)+'</td><td>'+esc(r.saiu)+' / '+esc(r.descarregou??'—')+(r.voltou!=null?'<small>Triagem da volta: '+esc(r.voltou)+'</small>':'')+'</td><td>'+(r.no_evento?'<b class="cp-perda">'+esc(r.no_evento)+' no evento</b>':'')+(r.no_galpao?'<small>'+esc(r.no_galpao)+' no galpão</small>':'')+'</td><td>'+brl(Number(r.valor_evento||0)+Number(r.valor_galpao||0))+(Number(r.custo)?'':'<small>Sem custo cadastrado</small>')+'</td><td>'+equipe(r)+'</td></tr>').join('')||'<tr><td colspan="7" class="cp-sem-registros">Nenhuma perda no período.</td></tr>'}</tbody></table></div><p class="cp-perdas-nota cp-perdas-rodape">Faltas entre carregamento e descarregamento são atribuídas ao evento; entre descarregamento e triagem da volta, ao galpão. Valores calculados com o custo cadastrado do material.</p></article>`;
  conteudo.setAttribute('aria-busy','false');
 }
 async function rpc(nome,args){if(modoExemplos)return demonstracao.rpc(nome,args);const {data,error}=await sb.rpc(nome,args);if(error)throw error;return data;}
 async function alterarModo(exemplos,reiniciar=false){
  const v=++trocaModo;versao++;versaoDados++;versaoPerdas++;
  modoExemplos=exemplos;
  if(reiniciar){perdas.de=null;perdas.ate=null;}
  if(exemplos&&(!demonstracao||reiniciar))demonstracao=window.CapasExemplos.criar({empresa,hoje:hoje()});
  try{sessionStorage.setItem('capas_exemplos:'+empresa,String(exemplos));}catch(_){}
  modelos=[];$('cpModeloHistorico').value='';$('cpBusca').value='';$('cpItemFiltro').value='';render();renderItensHistorico();$('cpHistoricoConteudo').replaceChildren();$('cpPerdasPainel').replaceChildren();$('cpNovaMovimentacao').hidden=true;
  $('cpStatus').textContent='Carregando...';
  try{
   const podeEditar=exemplos||!!await rpc('capas_pode',{p_empresa:empresa,p_editar:true});
   if(v!==trocaModo)return;editar=podeEditar;
   await carregar();if(v===trocaModo)$('cpStatus').textContent='';
  }catch(e){if(v===trocaModo)$('cpStatus').textContent='Não foi possível carregar: '+e.message;}
 }
 function abrir(titulo,conteudo){versao++;const d=$('cpDialogo');d.innerHTML='<header><h2>'+esc(titulo)+'</h2><button class="cp-fechar" aria-label="Fechar" type="button">×</button></header>'+conteudo;d.querySelector('.cp-fechar').onclick=()=>d.close();if(!d.open)d.showModal();return d;}
 function render(){
  const busca=$('cpBusca').value.toLocaleLowerCase('pt-BR');
  $('cpLista').innerHTML=modelos.filter(m=>m.usa_capa&&(m.nome+' '+m.item_nome).toLocaleLowerCase('pt-BR').includes(busca)).map(m=>'<tr><td><div class="cp-item">'+(/^https?:/i.test(m.foto_url||'')?'<img src="'+esc(m.foto_url)+'" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="cp-foto-ausente" hidden>Sem foto</span>':'<span class="cp-foto-ausente">Sem foto</span>')+'<div><strong>'+esc(m.nome)+'</strong><small>'+esc(m.item_nome)+'</small></div></div></td><td>'+esc(m.usa_capa?m.unidades_por_capa:'Sem capa')+'</td><td><span class="cp-badge '+(!m.estoque_conferido_em||m.saldo.disponivel<0?'cp-pendente':'')+'">'+esc(m.usa_capa?(m.estoque_conferido_em?m.saldo.disponivel:'Não conferido'):'—')+'</span></td><td>'+esc(m.saldo.em_pedidos)+'</td><td>'+esc(m.saldo.manutencao)+'</td><td>'+(Number(m.custo)?brl(m.custo):'<span class="cp-sem-custo">Sem custo</span>')+'</td><td>'+esc(data(m.saldo.ultima_fabricacao))+'</td></tr>').join('')||'<tr><td colspan="7" class="cp-sem-registros">Nenhum item utiliza material de prote\u00e7\u00e3o. Configure no cadastro do item.</td></tr>';
 }
 async function carregar(){const v=++versaoDados,lista=await rpc('capas_estoque',{p_empresa:empresa});if(v!==versaoDados)return;modelos=Array.isArray(lista)?lista:[];if(!modelos.some(m=>m.id===$('cpModeloHistorico').value))$('cpModeloHistorico').value=modoExemplos?(modelos.find(m=>m.id==='exemplo-cadeira')?.id||modelos.find(m=>m.usa_capa)?.id||''):'';render();renderItensHistorico();if(!$('cpHistoricoPainel').hidden)await atualizarHistorico();if(!$('cpPerdasPainel').hidden)await pintarPerdas();}
 
 function movimentar(m,pedido=null){
  const d=abrir('Movimentar · '+m.nome,'<form class="cp-form"><label class="cp-largo">Movimentação<select name="tipo">'+Object.entries(tipo).filter(([t])=>t!=='perda_pedido'||pedido).map(([t,n])=>'<option value="'+t+'">'+esc(n)+'</option>').join('')+'</select></label><label>Quantidade de materiais<input name="quantidade" type="number" min="0" max="1000000" step="1" required></label><label>Data<input name="data" type="date" max="'+hoje()+'" value="'+hoje()+'" required></label><label class="cp-largo">Descrição / origem<textarea name="observacao" minlength="3" maxlength="500" required placeholder="Ex.: fabricação pela costureira, contagem física ou motivo da manutenção"></textarea></label><p class="cp-ajuda cp-largo" id="cpMovAjuda">Registre a quantidade efetivamente fabricada e a data da fabricação. Não é criada uma fabricação presumida para capas antigas.</p><p role="status" class="cp-feedback"></p><footer><button type="submit" class="btn primary">Registrar movimentação</button></footer></form>');
  const f=d.querySelector('form'),chave=crypto.randomUUID();if(pedido)f.elements.tipo.value='perda_pedido';
  const lote=document.createElement('label');lote.className='cp-largo';lote.hidden=true;lote.innerHTML='Lote em manuten&#231;&#227;o<select name="contagem_origem"><option value="">Material sem lote de pedido</option></select>';f.insertBefore(lote,f.querySelector('[role=status]'));
  const atualizarLote=()=>{lote.hidden=!['reparo','perda_manutencao'].includes(f.elements.tipo.value);};f.elements.tipo.addEventListener('change',atualizarLote);atualizarLote();
  rpc('capas_historico_listar',{p_empresa:empresa,p_modelo:m.id}).then(h=>{if(!d.contains(f))return;const mov=h.movimentos||[];f.elements.contagem_origem.innerHTML='<option value="">Material sem lote de pedido</option>'+(h.conferencias||[]).filter(c=>c.etapa==='retorno'&&c.concluida_em&&c.danificadas>0).map(c=>({...c,pendente:c.danificadas-mov.filter(v=>v.contagem_origem_id===c.id).reduce((n,v)=>n+v.quantidade,0)})).filter(c=>c.pendente>0).map(c=>'<option value="'+esc(c.id)+'">Pedido '+esc(c.pedido_numero)+' - '+c.pendente+' em tratamento</option>').join('');}).catch(e=>{if(d.contains(f))f.querySelector('[role=status]').textContent=e.message;});
  const ajuda=()=>{d.querySelector('#cpMovAjuda').textContent=f.elements.tipo.value==='inventario'?'Informe quantas capas boas estão disponíveis agora no galpão, sem incluir as que estão nos pedidos ou na manutenção. A diferença será registrada como ajuste de inventário.':f.elements.tipo.value==='perda_pedido'?'Confirma a perda das capas não devolvidas deste pedido. Não desconta novamente o disponível, pois a saída já foi registrada.':'A quantidade será registrada no histórico deste modelo. Capas danificadas devolvidas já entram na manutenção ao concluir a triagem da volta.';};f.elements.tipo.onchange=ajuda;ajuda();
  f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('[type=submit]');b.disabled=true;try{await rpc('material_movimentar',{p_empresa:empresa,p_modelo:m.id,p_tipo:f.elements.tipo.value,p_quantidade:Number(f.elements.quantidade.value),p_data:f.elements.data.value,p_observacao:f.elements.observacao.value.trim(),p_chave:chave,p_pedido:pedido,p_contagem:['reparo','perda_manutencao'].includes(f.elements.tipo.value)?f.elements.contagem_origem.value||null:null});d.close();await carregar();$('cpStatus').textContent=modoExemplos?'Movimentação de exemplo registrada.':'Movimentação registrada.';}catch(e){f.querySelector('[role=status]').textContent=e.message;}finally{b.disabled=false;}};
 }
 async function historico(m){
  const d=$('cpHistoricoConteudo'),v=++versao;d.innerHTML='<p>Carregando...</p>';
  const h=await rpc('capas_historico_listar',{p_empresa:empresa,p_modelo:m.id});if(v!==versao)return;
  // 16/11/2026: um quadro só, "Movimentações" (fabricação, ajustes, manutenção, perdas e as conferências por pedido)
  const linhasMov=(h.movimentos||[]).map(x=>({quando:String(x.data||'').slice(0,10)+'T'+String(x.criado_em||'').slice(11,19),html:'<tr class="cp-mov-'+esc(x.tipo)+'"><td>'+esc(data(x.data))+'<small>Registrado em '+esc(instante(x.criado_em))+'</small></td><td><span class="cp-status cp-status-'+esc(x.tipo)+'">'+esc(tipo[x.tipo]||x.tipo)+'</span></td><td>'+esc(x.quantidade)+'</td><td>'+esc(x.observacao)+'</td></tr>'}));
  const linhasConf=(h.conferencias||[]).map(x=>({quando:String(x.contado_em||''),html:'<tr class="'+(x.danificadas>0||x.esperado!=null&&x.quantidade!==x.esperado?'cp-conferencia-diferenca':x.concluida_em?'cp-conferencia-concluida':'cp-conferencia-pendente')+'"><td>'+esc(data(x.contado_em))+'<small>'+esc(instante(x.contado_em))+'</small></td><td><span class="cp-status cp-status-conferencia">Conferência · '+esc(etapas[x.etapa]||x.etapa)+'</span></td><td>'+esc(x.quantidade)+'</td><td>Pedido '+esc(x.pedido_numero)+' · '+(x.esperado!=null?'previstas/enviadas: '+esc(x.esperado):'saída sem registro')+(x.danificadas?' · '+esc(x.danificadas)+' danificada(s)':'')+(x.concluida_em?' · concluída':' · em andamento')+(x.observacao?'<small>'+esc(x.observacao)+'</small>':'')+'</td></tr>'}));
  const corpos='<table class="cp-hist"><thead><tr><th>Data</th><th>Movimentação</th><th>Quantidade</th><th>Descrição</th></tr></thead><tbody>'+[...linhasMov,...linhasConf].sort((a,b)=>b.quando.localeCompare(a.quando)).map(x=>x.html).join('')+'</tbody></table>';
  d.innerHTML=corpos;
  d.querySelectorAll('tbody').forEach(t=>{if(!t.children.length){const td=t.insertRow().insertCell();td.colSpan=4;td.className='cp-sem-registros';td.textContent='Nenhum registro para este material.';}});
  if(editar&&abaAtual==='historico'){const pedidos=[...new Set((h.conferencias||[]).filter(x=>x.etapa==='carregamento'&&x.concluida_em).map(x=>x.pedido_id))];const caixas=document.createElement('div');caixas.className='cp-actions';for(const pid of pedidos){const linhas=h.conferencias.filter(x=>x.pedido_id===pid),saida=linhas.find(x=>x.etapa==='carregamento'&&x.concluida_em),volta=linhas.find(x=>x.etapa==='retorno'&&x.concluida_em),perdas=(h.movimentos||[]).filter(x=>x.tipo==='perda_pedido'&&x.pedido_id===pid).reduce((n,x)=>n+x.quantidade,0);if(!volta||saida.quantidade-volta.quantidade-perdas<=0)continue;const b=document.createElement('button');b.textContent='Registrar perda · Pedido '+saida.pedido_numero;b.onclick=()=>movimentar(m,pid);caixas.append(b);}d.append(caixas);}
 }
 function renderItensHistorico(){
  const q=$('cpItemFiltro').value.toLocaleLowerCase('pt-BR');
  $('cpItensHistorico').innerHTML=modelos.filter(m=>m.usa_capa&&(m.nome+' '+m.item_nome).toLocaleLowerCase('pt-BR').includes(q)).map(m=>'<button type="button" class="cp-item-opcao" data-modelo="'+esc(m.id)+'" aria-pressed="'+String(m.id===$('cpModeloHistorico').value)+'">'+(/^https?:/i.test(m.foto_url||'')?'<img src="'+esc(m.foto_url)+'" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="cp-foto-ausente" hidden>Sem foto</span>':'<span class="cp-foto-ausente">Sem foto</span>')+'<span><strong>'+esc(m.item_nome)+'</strong><small>'+esc(m.nome)+'</small></span></button>').join('')||'<p>Nenhum item encontrado.</p>';
 }
 async function atualizarHistorico(){
  const m=modelos.find(m=>m.id===$('cpModeloHistorico').value);$('cpItemSelecionado').textContent=m?.item_nome||'Selecione um item';$('cpNovaMovimentacao').hidden=!editar||!m||abaAtual!=='historico';
  if(!m){versao++;$('cpHistoricoConteudo').textContent='Selecione um material para consultar o historico.';return;}
  try{await historico(m);}catch(e){$('cpHistoricoConteudo').textContent=e.message;}
 }
 $('cpBusca').addEventListener('input',render);
 document.querySelectorAll('[data-cp-aba]').forEach(b=>b.onclick=()=>{
  abaAtual=b.dataset.cpAba;const historico=abaAtual==='historico';$('cpEstoquePainel').hidden=abaAtual!=='capas';$('cpHistoricoPainel').hidden=!historico;$('cpPerdasPainel').hidden=abaAtual!=='perdas';if($('cpPerdasFiltro'))$('cpPerdasFiltro').hidden=abaAtual!=='perdas';if(abaAtual!=='historico')$('cpNovaMovimentacao').hidden=true;$('cpBusca').hidden=abaAtual!=='capas';if(abaAtual==='perdas')pintarPerdas();
  document.querySelectorAll('[data-cp-aba]').forEach(t=>t.setAttribute('aria-selected',String(t===b)));
  if(historico)atualizarHistorico();else versao++;
 });
 $('cpItemFiltro').addEventListener('input',renderItensHistorico);
 $('cpItensHistorico').onclick=e=>{const b=e.target.closest('[data-modelo]');if(!b)return;$('cpModeloHistorico').value=b.dataset.modelo;renderItensHistorico();atualizarHistorico();};
 $('cpNovaMovimentacao').onclick=()=>{const m=modelos.find(m=>m.id===$('cpModeloHistorico').value);if(m&&editar)movimentar(m);};
 (async()=>{const ctx=await window.aguardarContexto?.();sb=window.supabaseClient;empresa=ctx?.empresa_id||window.__CONTEXT?.empresa_id;if(!empresa)throw Error('Entre no sistema para consultar as capas.');let exemplos=true;try{exemplos=sessionStorage.getItem('capas_exemplos:'+empresa)!=='false';}catch(_){}await alterarModo(exemplos);})().catch(e=>$('cpStatus').textContent='Não foi possível carregar: '+e.message);
})();
