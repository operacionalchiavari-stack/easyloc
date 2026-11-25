(function(){
 'use strict';
 let sequenciaMenu=0;
 function organizarCategorias(host,painel){
  const categorias=[
   {nome:'anuncios',titulo:'Publicação dos anúncios',card:painel.querySelector('[data-anuncios-datas]')?.closest('section')},
   {nome:'fixas',titulo:'Equipes fixas',card:painel.querySelector('[data-equipes-fixas]')},
   {nome:'equipes',titulo:'Restrições de equipe',card:painel.querySelector('[data-restricao]')?.closest('section')},
   {nome:'uber',titulo:'Uber automático',card:painel.querySelector('[data-parametros-uber]')},
   {nome:'free',titulo:'Free automático',card:painel.querySelector('[data-parametros-free]')},
   {nome:'frete',titulo:'Frete automático',card:painel.querySelector('[data-parametros-frete]')},
   {nome:'escala',titulo:'Escala automática',card:painel.querySelector('[data-controle]')?.closest('section')}
  ].filter(c=>c.card);
  const prefixo='escala-parametros-'+(++sequenciaMenu),layout=document.createElement('div');layout.className='escala-parametros-layout';
  const menu=document.createElement('aside');menu.className='escala-parametros-menu';
  menu.innerHTML='<details open><summary><span>Categorias</span><strong></strong></summary><span class="escala-parametros-rotulo">Logística</span><nav role="tablist" aria-label="Categorias dos parâmetros logísticos" aria-orientation="vertical"></nav></details>';
  const detalhes=menu.querySelector('details'),nav=menu.querySelector('nav'),mobile=matchMedia('(max-width:800px)');
  for(const c of categorias){
   const botao=document.createElement('button');botao.type='button';botao.id=prefixo+'-aba-'+c.nome;botao.textContent=c.titulo;
   botao.setAttribute('role','tab');botao.setAttribute('aria-controls',prefixo+'-painel-'+c.nome);c.botao=botao;nav.append(botao);
   c.card.id=prefixo+'-painel-'+c.nome;c.card.setAttribute('role','tabpanel');c.card.setAttribute('aria-labelledby',botao.id);
   botao.addEventListener('click',()=>{selecionar(c);if(mobile.matches){detalhes.open=false;menu.querySelector('summary').focus();}});
  }
  function selecionar(atual){
   categorias.forEach(c=>{const ativa=c===atual;c.botao.setAttribute('aria-selected',String(ativa));c.botao.tabIndex=ativa?0:-1;c.card.hidden=!ativa;});
   menu.querySelector('summary strong').textContent=atual.titulo;
  }
  nav.addEventListener('keydown',e=>{
   const indice=categorias.findIndex(c=>c.botao===e.target);if(indice<0)return;
   const proximo=e.key==='ArrowDown'?(indice+1)%categorias.length:e.key==='ArrowUp'?(indice-1+categorias.length)%categorias.length:e.key==='Home'?0:e.key==='End'?categorias.length-1:null;
   if(proximo===null)return;e.preventDefault();selecionar(categorias[proximo]);categorias[proximo].botao.focus();
  });
  painel.classList.add('escala-parametros-conteudo');layout.append(menu,painel);host.replaceChildren(layout);selecionar(categorias[0]);
  const responsivo=()=>{if(!layout.isConnected){mobile.removeEventListener('change',responsivo);return;}detalhes.open=!mobile.matches;};
  responsivo();mobile.addEventListener('change',responsivo);
 }
 window.carregarParametrosEscala=async function(host,empresa,opcoes={}){
  const sb=window.supabaseClient,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const conferir=async p=>{const r=await p;if(r.error)throw r.error;return r.data;};
  const [controle,restricoes,pessoas,pode,anuncios,equipesFixas]=await Promise.all([
   conferir(sb.from('empresa_escala_controle').select('*').eq('empresa_id',empresa)),
   conferir(sb.from('escala_restricoes_pessoas').select('*').eq('empresa_id',empresa).order('pessoa_a')),
   conferir(sb.rpc('operacao_pessoas')),
   conferir(sb.rpc('escala_controle_pode',{p_empresa:empresa})),
   conferir(sb.rpc('logistica_anuncios_parametros',{p_empresa:empresa})),
   conferir(sb.rpc('escala_equipes_fixas_listar',{p_empresa:empresa}))
  ]);
  await Promise.all((pessoas||[]).map(async p=>{
   const origem=String(p.foto_url||'').trim();if(!origem)return;
   if(/drive\.google\.com/i.test(origem)){const id=origem.match(/\/d\/([^/]+)/)?.[1]||origem.match(/[?&]id=([^&]+)/)?.[1];if(id)p.foto_url='https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w400';return;}
   if(/^https?:\/\//i.test(origem)||p.free||!sb.storage)return;
   const r=await sb.storage.from('funcionarios-fotos').createSignedUrl(origem,3600);if(!r.error&&r.data?.signedUrl)p.foto_url=r.data.signedUrl;
  }));
  const nomes=new Map((pessoas||[]).map(p=>[(p.free?'free:':'func:')+p.id,p.nome]));
  const opts='<option value="">Selecione</option>'+[...nomes].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([id,nome])=>`<option value="${esc(id)}">${esc(nome)}${id.startsWith('free:')?' (Free)':''}</option>`).join('');
  const painel=document.createElement('div');painel.className='escala-parametros';
  painel.innerHTML=`<section class="escala-parametros-card"><h2>Escala autom\u00e1tica</h2><form data-controle><label class="escala-parametros-check"><input type="checkbox" name="automatica" ${controle?.[0]?.automatica===false?'':'checked'}>Montar a escala automaticamente</label><p>O sistema completa os espa\u00e7os vazios com respons\u00e1vel, equipe e caminh\u00f5es. Desativar preserva as escalas existentes e permite continuar montando a equipe manualmente.</p><button type="submit" class="btn primary">Salvar</button></form></section><section class="escala-parametros-card"><h2>Pessoas que n\u00e3o podem trabalhar juntas</h2><p>A restri\u00e7\u00e3o vale na mesma etapa, incluindo o respons\u00e1vel e a equipe. Tamb\u00e9m se aplica aos ajustes manuais. Escalas existentes precisam ser revisadas; n\u00e3o s\u00e3o alteradas automaticamente.</p><form data-restricao><label>Primeira pessoa<select name="a" class="el-select" required>${opts}</select></label><label>Segunda pessoa<select name="b" class="el-select" required>${opts}</select></label><label>Motivo (opcional)<input name="motivo" class="el-input" maxlength="300"></label><button type="submit" class="btn primary">Adicionar restri\u00e7\u00e3o</button></form><div data-restricoes></div></section>`;
  if(opcoes.mostrarAutomatica===false)painel.querySelector('[data-controle]').closest('section').remove();
  const regra=document.createElement('section');regra.className='escala-parametros-card';
  regra.innerHTML='<h2>Publicação dos anúncios</h2><form data-anuncios-datas><label>Anunciar sem o Comercial confirmar as datas?<select name="permitir" class="el-select"><option value="sim">Sim</option><option value="nao">Não</option></select></label><p>Vale para fretes, Free e Uber vinculados a pedidos, incluindo anúncios automáticos. Ao selecionar Não, os anúncios só ficam disponíveis nos aplicativos quando o Comercial confirmar as datas atuais do pedido. Se as datas mudarem, será necessária uma nova confirmação. Serviços já aceitos continuam no acompanhamento.</p><button type="submit" class="btn primary">Salvar regra de anúncios</button><p data-anuncios-status role="status"></p></form>';
  regra.querySelector('select').value=anuncios?.anunciar_sem_confirmacao===false?'nao':'sim';painel.prepend(regra);
  const fixas=document.createElement('section');fixas.className='escala-parametros-card';fixas.dataset.equipesFixas='';
  const lideres=(pessoas||[]).filter(p=>p.lider&&!p.free),membros=(pessoas||[]).filter(p=>!p.lider||p.free);
  const pessoaPorChave=new Map((pessoas||[]).map(p=>[(p.free?'free:':'func:')+p.id,p]));
  const iniciais=nome=>String(nome||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const foto=(p,classe='')=>`<span class="equipe-fixa-foto ${classe}"><b>${esc(iniciais(p?.nome))}</b>${p?.foto_url?`<img src="${esc(p.foto_url)}" alt="" onerror="this.remove()">`:''}</span>`;
  fixas.innerHTML='<h2>Equipes fixas por responsável</h2><p>O responsável aparece em destaque e abaixo ficam somente as pessoas da equipe fixa. Clique em qualquer cartão para montar ou trocar a equipe.</p><div data-equipes-fixas-lista></div>';
  painel.prepend(fixas);
  host.replaceChildren(painel);let lista=restricoes||[],fixasLista=equipesFixas||[],ocupado=false;
  function renderFixas(){
   const grupos=new Map;for(const x of fixasLista){if(!grupos.has(x.responsavel_id))grupos.set(x.responsavel_id,[]);grupos.get(x.responsavel_id).push(x);}
   fixas.querySelector('[data-equipes-fixas-lista]').innerHTML=lideres.length?'<div class="equipes-fixas-grade">'+lideres.map(lider=>{const itens=(grupos.get(lider.id)||[]).sort((a,b)=>a.ordem-b.ordem);return `<article class="equipe-fixa-card"><div class="equipe-fixa-responsavel">${foto(lider,'destaque')}<span><small>Responsável</small><strong>${esc(lider.nome)}</strong></span></div><div class="equipe-fixa-membros">${itens.length?itens.map(x=>{const p=pessoaPorChave.get(x.pessoa_tipo+':'+x.pessoa_id);return `<button type="button" class="equipe-fixa-membro" data-editar-equipe="${esc(lider.id)}" ${pode?'':'disabled'}>${foto(p)}<span>${esc(p?.nome||'Pessoa inativa')}<small>${x.pessoa_tipo==='free'?'Free':'Equipe interna'}</small></span></button>`;}).join(''):`<button type="button" class="equipe-fixa-vazia" data-editar-equipe="${esc(lider.id)}" ${pode?'':'disabled'}>+ Montar equipe fixa</button>`}</div></article>`;}).join('')+'</div>':'<p>Nenhum responsável ativo disponível.</p>';
  }
  function abrirEquipeFixa(responsavel){
   if(!pode)return;const lider=lideres.find(x=>x.id===responsavel);if(!lider)return;
   const atuais=new Set(fixasLista.filter(x=>x.responsavel_id===responsavel).map(x=>x.pessoa_tipo+':'+x.pessoa_id));
   const dialog=document.createElement('dialog');dialog.className='equipe-fixa-modal';
   dialog.innerHTML=`<form method="dialog" class="equipe-fixa-modal-conteudo"><header>${foto(lider,'destaque')}<div><small>Equipe fixa de</small><h2>${esc(lider.nome)}</h2></div><button type="button" data-fechar aria-label="Fechar">×</button></header><div class="equipe-fixa-modal-filtros"><nav role="tablist" aria-label="Tipo de equipe"><button type="button" role="tab" data-tipo="func" aria-selected="true">Equipe interna</button><button type="button" role="tab" data-tipo="free" aria-selected="false">Free</button></nav><input type="search" data-buscar-equipe placeholder="Buscar pessoa..." autocomplete="off"></div><div class="equipe-fixa-modal-grade">${membros.map(p=>{const chave=(p.free?'free:':'func:')+p.id;return `<label data-candidato data-tipo-pessoa="${p.free?'free':'func'}" data-nome="${esc(p.nome.toLocaleLowerCase('pt-BR'))}"><input type="checkbox" value="${esc(chave)}" ${atuais.has(chave)?'checked':''}>${foto(p)}<span><strong>${esc(p.nome)}</strong><small>${p.free?'Free':'Equipe interna'}</small></span></label>`;}).join('')}</div><footer>${atuais.size?'<button type="button" class="btn" data-excluir-equipe>Remover equipe fixa</button>':'<span></span>'}<button type="submit" class="btn primary">Salvar equipe fixa</button></footer></form>`;
   fixas.append(dialog);dialog.showModal();
   const fechar=()=>dialog.close();dialog.querySelector('[data-fechar]').onclick=fechar;dialog.addEventListener('click',e=>{if(e.target===dialog)fechar();});dialog.addEventListener('close',()=>dialog.remove());
   let tipo='func';const filtrar=()=>{const q=dialog.querySelector('[data-buscar-equipe]').value.trim().toLocaleLowerCase('pt-BR');dialog.querySelectorAll('[data-candidato]').forEach(x=>x.hidden=x.dataset.tipoPessoa!==tipo||(q&&!x.dataset.nome.includes(q)));};
   dialog.querySelector('[data-buscar-equipe]').addEventListener('input',filtrar);dialog.querySelector('[role=tablist]').addEventListener('click',e=>{const b=e.target.closest('[data-tipo]');if(!b)return;tipo=b.dataset.tipo;dialog.querySelectorAll('[role=tab]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));filtrar();});filtrar();
   dialog.querySelector('[data-excluir-equipe]')?.addEventListener('click',()=>salvar(async()=>{await conferir(sb.rpc('escala_equipes_fixas_excluir',{p_empresa:empresa,p_responsavel:responsavel}));fixasLista=fixasLista.filter(x=>x.responsavel_id!==responsavel);renderFixas();fechar();}));
   dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const selecionadas=[...dialog.querySelectorAll('[type=checkbox]:checked')].map(x=>{const [tipo,id]=x.value.split(':');return{tipo,id};});if(!selecionadas.length){window.alerta('Selecione pelo menos uma pessoa para a equipe.','Atenção','aviso');return;}salvar(async()=>{await conferir(sb.rpc('escala_equipes_fixas_salvar',{p_empresa:empresa,p_responsavel:responsavel,p_pessoas:selecionadas}));fixasLista=await conferir(sb.rpc('escala_equipes_fixas_listar',{p_empresa:empresa}));renderFixas();fechar();});});
  }
  renderFixas();
  function render(){painel.querySelector('[data-restricoes]').innerHTML=lista.length?'<table><thead><tr><th>Pessoas</th><th>Motivo</th><th></th></tr></thead><tbody>'+lista.map(r=>`<tr><td>${esc(nomes.get(r.pessoa_a)||'Pessoa fora da equipe ativa')}<br>${esc(nomes.get(r.pessoa_b)||'Pessoa fora da equipe ativa')}</td><td>${esc(r.motivo||'\u2014')}</td><td>${pode?`<button type="button" class="btn" data-remover="${esc(r.id)}">Remover</button>`:''}</td></tr>`).join('')+'</tbody></table>':'<p>Nenhuma restri\u00e7\u00e3o cadastrada.</p>';}
  render();painel.querySelectorAll('input,select,button').forEach(el=>el.disabled=!pode);
  if(opcoes.mostrarUber&&window.carregarParametrosUber)await window.carregarParametrosUber(painel,empresa,pode);
  if(opcoes.mostrarUber&&window.carregarParametrosFree)await window.carregarParametrosFree(painel,empresa);
  if(opcoes.mostrarUber&&window.carregarParametrosFrete)await window.carregarParametrosFrete(painel,empresa);
  if(opcoes.navegacaoPorCategorias)organizarCategorias(host,painel);
  async function salvar(acao){if(ocupado||!pode)return;ocupado=true;painel.querySelectorAll('button').forEach(b=>b.disabled=true);try{await acao();window.alerta('Par\u00e2metros da escala salvos.','Sucesso','sucesso');window.dispatchEvent(new CustomEvent('escala-parametros-alterados'));}catch(e){window.alerta(e.message,'Aten\u00e7\u00e3o','aviso');}finally{ocupado=false;painel.querySelectorAll('button').forEach(b=>b.disabled=!pode);}}
  painel.querySelector('[data-anuncios-datas]').addEventListener('submit',e=>{
   e.preventDefault();const status=regra.querySelector('[data-anuncios-status]');status.textContent='';
   salvar(async()=>{await conferir(sb.rpc('logistica_anuncios_parametros_salvar',{p_empresa:empresa,p_anunciar_sem_confirmacao:e.target.elements.permitir.value==='sim'}));status.textContent='Regra de anúncios salva.';});
  });
  painel.querySelector('[data-controle]')?.addEventListener('submit',e=>{e.preventDefault();salvar(()=>conferir(sb.rpc('escala_controle_salvar',{p_empresa:empresa,p_automatica:e.target.elements.automatica.checked})));});
  painel.querySelector('[data-restricao]').addEventListener('submit',e=>{e.preventDefault();const f=e.target;if(f.elements.a.value===f.elements.b.value){window.alerta('Selecione duas pessoas diferentes.','Aten\u00e7\u00e3o','aviso');return;}salvar(async()=>{await conferir(sb.rpc('escala_restricao_salvar',{p_empresa:empresa,p_a:f.elements.a.value,p_b:f.elements.b.value,p_motivo:f.elements.motivo.value.trim()}));lista=await conferir(sb.from('escala_restricoes_pessoas').select('*').eq('empresa_id',empresa).order('pessoa_a'));render();f.reset();});});
  painel.addEventListener('click',e=>{const equipe=e.target.closest('[data-editar-equipe]');if(equipe){abrirEquipeFixa(equipe.dataset.editarEquipe);return;}const b=e.target.closest('[data-remover]');if(!b)return;salvar(async()=>{await conferir(sb.rpc('escala_restricao_excluir',{p_empresa:empresa,p_id:b.dataset.remover}));lista=lista.filter(r=>r.id!==b.dataset.remover);render();});});
 };
})();
