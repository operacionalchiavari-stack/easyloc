(function () {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
 const tipos={folga:'Folga',atestado:'Atestado',afastamento:'Afastamento',licenca:'Licença',trabalho:'Dia de trabalho excepcional'};
 const hoje=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const somar=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const br=s=>s?String(s).split('-').reverse().join('/'):'—';
 const minutos=h=>{if(!h)return 0;const n=s=>s.split(':').reduce((a,b,i)=>a+Number(b)*(i?1:60),0);return ((n(h.fim)-n(h.inicio)+1440)%1440)-Number(h.intervalo||0);};
 const horas=cfg=>{const h=cfg.horarios||{};return (cfg.tipo==='ciclo'?minutos(h.ciclo)*Number(cfg.trabalho)*7/(Number(cfg.trabalho)+Number(cfg.folga)):(cfg.dias||[]).reduce((n,d)=>n+minutos(h[d]),0))/60;};
 let ctx, de=hoje(), setor='', aba='escala', dados={regras:[],ausencias:[],dias:[]}, versao=0;
 const nome=id=>ctx.pessoas.find(p=>p.id===id)?.nome||'Funcionário';
 const regraNoDia=(p,data)=>dados.regras.filter(r=>r.vigencia<=data&&(r.funcionario_id===p.id||!r.funcionario_id&&r.setor===p.setor)).sort((a,b)=>Number(!!b.funcionario_id)-Number(!!a.funcionario_id)||b.vigencia.localeCompare(a.vigencia))[0];
 async function rpc(n,a){const r=await ctx.sb.rpc(n,a);if(r.error)throw Error(r.error.code==='23505'?'Já existe uma regra com essa vigência. Use Editar ou escolha outra data.':r.error.message);return r.data;}
 function notificar(){window.dispatchEvent(new Event('rh-disponibilidade-alterada'));try{localStorage.setItem('rh-disponibilidade-atualizada',String(Date.now()));}catch(_){}}
 function erro(msg){const el=ctx.host.querySelector('[data-rh-erro]');if(el){el.textContent=msg;el.hidden=!msg;}}
 async function carregar(){
  const v=++versao;const contexto=ctx;
  try{const r=await rpc('rh_escala_contexto',{p_empresa:ctx.empresa,p_inicio:de,p_fim:somar(de,13)});if(v!==versao||ctx!==contexto||!ctx.host.querySelector('[data-rh-folgas]'))return; if(!r||!Array.isArray(r.dias))throw Error('A escala ainda não está disponível no banco.');dados=r;pintar();}
  catch(e){if(v===versao&&ctx===contexto)erro('Não foi possível consultar a escala: '+e.message);}
 }
 function pintarFiltros(){
  const setores=[...new Set(ctx.pessoas.map(p=>p.setor).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(setor&&!setores.includes(setor))setor='';
  ctx.filtros.innerHTML='<label>Primeiro dia<input type="date" data-inicio value="'+de+'"></label><label>Setor<select data-setor><option value="">Todos os setores</option>'+setores.map(s=>'<option'+(s===setor?' selected':'')+'>'+esc(s)+'</option>').join('')+'</select></label><button type="button" class="fin-btn claro" data-mover="-14">← Anterior</button><button type="button" class="fin-btn claro" data-mover="14">Próximo →</button><button type="button" class="fin-btn claro" data-recarregar>Atualizar</button>';
  ctx.filtros.onchange=e=>{if(e.target.matches('[data-inicio]')&&e.target.value){de=e.target.value;carregar();}if(e.target.matches('[data-setor]')){setor=e.target.value;pintar();}};
  ctx.filtros.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.mover){de=somar(de,Number(b.dataset.mover));ctx.filtros.querySelector('[data-inicio]').value=de;return carregar();}if(b.hasAttribute('data-recarregar'))return carregar();};
 }
 function selecionarAba(valor,focar=false){
  aba=valor;
  ctx.host.querySelectorAll('[data-folgas-aba]').forEach(b=>{const ativa=b.dataset.folgasAba===aba;b.classList.toggle('ativa',ativa);b.setAttribute('aria-selected',String(ativa));b.tabIndex=ativa?0:-1;if(ativa&&focar)b.focus();});
  ctx.host.querySelectorAll('[data-folgas-painel]').forEach(p=>p.hidden=p.dataset.folgasPainel!==aba);
 }
 function pintar(){
  if(!ctx.host.querySelector('[data-rh-folgas]'))return;
  const pessoas=ctx.pessoas.filter(p=>!setor||p.setor===setor).slice().sort((a,b)=>(a.setor||'Sem setor').localeCompare(b.setor||'Sem setor','pt-BR')||a.nome.localeCompare(b.nome,'pt-BR'));
  const grupos=new Map();pessoas.forEach(p=>{const s=p.setor||'Sem setor';if(!grupos.has(s))grupos.set(s,[]);grupos.get(s).push(p);});
  const datas=Array.from({length:14},(_,i)=>somar(de,i)), mapa=new Map(dados.dias.map(d=>[d.funcionario_id+'|'+d.data,d.motivo]));
  const pessoaNoSetor=id=>ctx.pessoas.some(p=>p.id===id&&p.setor===setor);
  const regras=dados.regras.filter(r=>!setor||(r.funcionario_id?pessoaNoSetor(r.funcionario_id):r.setor===setor));
  const ausencias=dados.ausencias.filter(a=>!setor||pessoaNoSetor(a.funcionario_id));
  const abas=[['escala','Escala de folgas'],['regras','Regras de trabalho'],['registros','Folgas e afastamentos registrados']];
  const painel=(id,conteudo)=>'<section class="fin-bloco" role="tabpanel" id="rhFolgasPainel-'+id+'" aria-labelledby="rhFolgasAba-'+id+'" data-folgas-painel="'+id+'"'+(aba!==id?' hidden':'')+'>'+conteudo+'</section>';
  const linha=p=>'<tr><td><span class="rh-beneficio-pessoa">'+ctx.foto(p)+'<span><strong>'+esc(p.nome)+'</strong><small>'+esc(p.setor||'Sem setor')+'</small></span></span></td>'+datas.map(d=>{const motivo=mapa.get(p.id+'|'+d),r=regraNoDia(p,d),cfg=r?.configuracao,hor=cfg?.horarios?.[cfg.tipo==='ciclo'?'ciclo':new Date(d+'T12:00').getDay()];return '<td><button type="button" class="rh-folgas-dia '+(motivo?'indisponivel':r?'trabalho':'sem-regra')+'" data-dia="'+d+'" data-func="'+esc(p.id)+'"'+(!ctx.editar?' disabled':'')+'><strong>'+esc(motivo||(r?'Trabalho':'Sem regra'))+'</strong>'+(!motivo&&hor?'<small>'+esc(hor.inicio)+'–'+esc(hor.fim)+'</small>':'')+'</button></td>';}).join('')+'</tr>';
  const calendario='<p class="rh-folgas-periodo">'+br(de)+' a '+br(somar(de,13))+'</p><div class="fin-rolar"><table class="fin-tabela rh-folgas-calendario"><thead><tr><th scope="col">Funcionário</th>'+datas.map(d=>'<th scope="col">'+dias[new Date(d+'T12:00').getDay()]+'<br>'+br(d).slice(0,5)+'</th>').join('')+'</tr></thead>'+[...grupos].map(([s,ps])=>'<tbody aria-label="'+esc(s)+'"><tr class="rh-folgas-grupo"><th colspan="15" scope="rowgroup"><span>'+esc(s)+'<small>'+ps.length+' pessoa(s)</small></span></th></tr>'+ps.map(linha).join('')+'</tbody>').join('')+'</table></div>'+(!pessoas.length?'<p class="fin-vazio">Nenhum funcionário neste setor.</p>':'');
  const listaRegras='<p class="fin-info">Cadastre os dias e horários de cada setor ou uma regra individual. Uma nova vigência preserva as regras anteriores. Nenhuma escala é ativada automaticamente.</p>'+ (regras.length?'<div class="rh-folgas-regras">'+regras.map(r=>{const c=r.configuracao,h=horas(c),diverge=c.carga_semanal&&Math.abs(h-Number(c.carga_semanal))>.01;return '<article><strong>'+esc(r.funcionario_id?nome(r.funcionario_id):r.setor)+'</strong><small>Desde '+br(r.vigencia)+' · '+(c.tipo==='ciclo'?esc(c.trabalho)+' de trabalho / '+esc(c.folga)+' de folga':(c.dias||[]).map(d=>dias[d]).join(', '))+'</small><span class="rh-selo '+(diverge?'amar':'')+'">'+h.toLocaleString('pt-BR',{maximumFractionDigits:2})+' h/semana'+(c.tipo==='ciclo'?' em média':'')+(c.carga_semanal?' · meta '+esc(c.carga_semanal)+' h':'')+'</span>'+(diverge?'<small>Carga prevista diferente da meta. Revise os horários.</small>':'')+(ctx.editar?'<button class="fin-btn peq claro" data-regra="'+esc(r.id)+'">Editar</button>':'')+'</article>';}).join('')+'</div>':'<div class="fin-vazio">Nenhuma regra cadastrada'+(setor?' neste setor':'')+'. Configure os setores ou funcionários.</div>');
  const registros=ausencias.length?'<div class="rh-folgas-regras">'+ausencias.map(a=>'<article><strong>'+esc(nome(a.funcionario_id))+'</strong><small>'+esc(tipos[a.tipo])+' · '+br(a.inicio)+' a '+br(a.fim)+'</small>'+(a.observacao?'<small>'+esc(a.observacao)+'</small>':'')+(ctx.editar?'<button class="fin-btn peq claro" data-cancelar="'+esc(a.id)+'">Cancelar registro</button>':'')+'</article>').join('')+'</div>':'<div class="fin-vazio">Nenhum registro neste período'+(setor?' e setor':'')+'. Férias e afastamentos da ficha também aparecem no calendário.</div>';
  ctx.host.innerHTML='<div data-rh-folgas><p data-rh-erro class="fin-aviso" role="alert" hidden></p><nav class="rh-folgas-abas" role="tablist" aria-label="Escala e regras de trabalho">'+abas.map(([id,titulo])=>'<button type="button" role="tab" id="rhFolgasAba-'+id+'" aria-controls="rhFolgasPainel-'+id+'" data-folgas-aba="'+id+'">'+titulo+'</button>').join('')+'</nav>'+painel('escala',calendario)+painel('regras',listaRegras)+painel('registros',registros)+'</div>';
  selecionarAba(aba);
  const raiz=ctx.host.querySelector('[data-rh-folgas]');
  raiz.querySelector('[role=tablist]').addEventListener('keydown',e=>{const b=e.target.closest('[data-folgas-aba]');if(!b)return;const i=abas.findIndex(([id])=>id===b.dataset.folgasAba),n=abas.length;let proxima;if(e.key==='ArrowRight')proxima=(i+1)%n;else if(e.key==='ArrowLeft')proxima=(i+n-1)%n;else if(e.key==='Home')proxima=0;else if(e.key==='End')proxima=n-1;else return;e.preventDefault();selecionarAba(abas[proxima][0],true);});
  raiz.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
   if(b.dataset.folgasAba)return selecionarAba(b.dataset.folgasAba);
   if(b.dataset.dia&&ctx.editar)return ausencia(b.dataset.func,b.dataset.dia);
   if(b.dataset.regra&&ctx.editar)return regra(dados.regras.find(r=>r.id===b.dataset.regra));
   if(b.dataset.cancelar&&ctx.editar){const ok=window.confirmarGlobal?await window.confirmarGlobal('Cancelar este registro? A disponibilidade será recalculada.','Escala de folgas'):confirm('Cancelar este registro?');if(!ok)return;b.disabled=true;try{await rpc('rh_ausencia_cancelar',{p_empresa:ctx.empresa,p_id:b.dataset.cancelar});await carregar();notificar();}catch(err){erro(err.message);b.disabled=false;}}
  });
 }
 function janela(titulo,conteudo,salvar,montar){
  if(!ctx?.editar)return;
  document.getElementById('rhFolgasModal')?.remove();const d=document.createElement('dialog');d.id='rhFolgasModal';d.className='fin-modal rh-folgas-modal';
  d.innerHTML='<form class="fin-modal-caixa"><header><h3>'+titulo+'</h3><button type="button" class="fin-x" data-fechar aria-label="Fechar">×</button></header><div class="fin-modal-corpo">'+conteudo+'<p data-erro class="fin-erro" role="alert" hidden></p></div><footer><button class="fin-btn claro" type="button" data-fechar>Cancelar</button><button class="fin-btn" type="submit">Salvar</button></footer></form>';
  d.addEventListener('click',e=>{if(e.target.closest('[data-fechar]'))d.close();});
  d.addEventListener('close',()=>d.remove());
  d.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const bt=d.querySelector('[type=submit]');bt.disabled=true;const mensagem=d.querySelector('[data-erro]');mensagem.hidden=true;try{await salvar(new FormData(e.target),d);d.close();await carregar();notificar();}catch(err){mensagem.textContent=err.message;mensagem.hidden=false;}finally{bt.disabled=false;}});
  document.body.append(d);montar?.(d);d.showModal();
 }
 const opcoesPessoas=id=>ctx.pessoas.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===id?' selected':'')+'>'+esc(p.nome)+' · '+esc(p.setor||'Sem setor')+'</option>').join('');
 function ausencia(id='',data=de){janela('Folga ou afastamento','<div class="fin-form"><label class="inteiro">Funcionário<select name="funcionario_id" required><option value="">Selecione</option>'+opcoesPessoas(id)+'</select></label><label>Tipo<select name="tipo">'+Object.entries(tipos).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label><label>De<input type="date" name="inicio" value="'+data+'" required></label><label>Até (inclusive)<input type="date" name="fim" value="'+data+'" required></label><label class="inteiro">Observação interna do RH<textarea name="observacao"></textarea></label><p class="fin-info inteiro">Use o período completo do atestado ou afastamento. A Logística recebe apenas o motivo da indisponibilidade, sem a observação. Um dia de trabalho excepcional altera a folga da escala, mas não libera férias, atestado ou afastamento.</p></div>',async f=>{const a=Object.fromEntries(f);if(a.fim<a.inicio)throw Error('A data final deve ser igual ou posterior ao início.');await rpc('rh_ausencia_salvar',{p_empresa:ctx.empresa,p_dados:a});});}
 function regra(r){
  const c=r?.configuracao||{tipo:'semanal',dias:[1,2,3,4,5],trabalho:6,folga:1,base:hoje(),horarios:{}}, hs=c.horarios||{};
  const setores=[...new Set(ctx.pessoas.map(p=>p.setor).filter(Boolean))].sort();
  const horario=(k,n)=>{const h=hs[k]||{inicio:'08:00',fim:'17:00',intervalo:60};return '<tr data-horario="'+k+'"><th>'+n+'</th><td><input type="time" name="inicio_'+k+'" value="'+esc(h.inicio)+'" aria-label="Entrada '+n+'"></td><td><input type="time" name="fim_'+k+'" value="'+esc(h.fim)+'" aria-label="Saída '+n+'"></td><td><input type="number" name="intervalo_'+k+'" value="'+esc(h.intervalo)+'" min="0" max="1439" aria-label="Intervalo '+n+'"></td></tr>';};
  janela(r?'Editar regra de trabalho':'Regra de trabalho',
   '<div class="fin-form"><label>Aplicar a<select name="escopo"><option value="setor"'+(!r?.funcionario_id?' selected':'')+'>Setor</option><option value="pessoa"'+(r?.funcionario_id?' selected':'')+'>Funcionário</option></select></label><label data-escopo="setor">Setor<select name="setor"><option value="">Selecione</option>'+setores.map(s=>'<option'+(s===r?.setor?' selected':'')+'>'+esc(s)+'</option>').join('')+'</select></label><label data-escopo="pessoa">Funcionário<select name="funcionario_id"><option value="">Selecione</option>'+opcoesPessoas(r?.funcionario_id)+'</select></label><label>Vigência a partir de<input type="date" name="vigencia" value="'+(r?.vigencia||hoje())+'" required></label><label>Modelo<select name="tipo"><option value="semanal"'+(c.tipo==='semanal'?' selected':'')+'>Dias fixos da semana</option><option value="ciclo"'+(c.tipo==='ciclo'?' selected':'')+'>Ciclo de trabalho e folga</option></select></label><label>Carga semanal desejada (horas)<input type="number" step="0.01" min="0.1" max="168" name="carga_semanal" value="'+esc(c.carga_semanal||'')+'" placeholder="Ex.: 44"></label><div data-modelo="semanal" class="inteiro rh-folgas-semana">'+dias.map((n,i)=>'<label><input type="checkbox" name="dias" value="'+i+'"'+((c.dias||[]).includes(i)?' checked':'')+'> '+n+'</label>').join('')+'</div><div data-modelo="ciclo" class="inteiro fin-form"><label>Dias de trabalho<input name="trabalho" type="number" min="1" max="365" value="'+(c.trabalho||6)+'"></label><label>Dias de folga<input name="folga" type="number" min="1" max="365" value="'+(c.folga||1)+'"></label><label>Primeiro dia de trabalho do ciclo<input name="base" type="date" value="'+(c.base||hoje())+'"></label></div><div class="inteiro fin-rolar"><table class="fin-tabela rh-folgas-horarios"><thead><tr><th>Dia</th><th>Entrada</th><th>Saída</th><th>Intervalo (min)</th></tr></thead><tbody>'+dias.map((n,i)=>horario(i,n)).join('')+horario('ciclo','Dias de trabalho')+'</tbody></table></div><p class="fin-info inteiro" data-carga></p><p class="fin-info inteiro">Saída anterior à entrada representa uma jornada que atravessa a meia-noite. Em ciclos, a carga exibida é a média semanal. Para mudar a regra a partir de outra data, crie uma nova regra com nova vigência.</p></div>',
   async(f)=>{
    const tipo=f.get('tipo'),ds=f.getAll('dias').map(Number),chaves=tipo==='ciclo'?['ciclo']:ds;
    if(tipo==='semanal'&&!ds.length)throw Error('Selecione ao menos um dia trabalhado.');
    const configuracao={tipo,dias:ds,trabalho:Number(f.get('trabalho')),folga:Number(f.get('folga')),base:f.get('base'),carga_semanal:f.get('carga_semanal')?Number(f.get('carga_semanal')):null,horarios:{}};
    for(const k of chaves){const h={inicio:f.get('inicio_'+k),fim:f.get('fim_'+k),intervalo:Number(f.get('intervalo_'+k))};if(!h.inicio||!h.fim||minutos(h)<=0)throw Error('Confira os horários e intervalos.');configuracao.horarios[k]=h;}
    const p_dados={vigencia:f.get('vigencia'),setor:f.get('escopo')==='setor'?f.get('setor'):null,funcionario_id:f.get('escopo')==='pessoa'?f.get('funcionario_id'):null,configuracao};
    if(!p_dados.setor&&!p_dados.funcionario_id)throw Error('Selecione o setor ou funcionário.');
    await rpc('rh_jornada_salvar',{p_empresa:ctx.empresa,p_id:r?.id||null,p_dados});
   },d=>{
    const ajustar=()=>{const form=d.querySelector('form'),f=new FormData(form),tipo=f.get('tipo'),ds=f.getAll('dias').map(Number),ks=tipo==='ciclo'?['ciclo']:ds;
     d.querySelectorAll('[data-escopo]').forEach(el=>{el.hidden=el.dataset.escopo!==f.get('escopo');});d.querySelectorAll('[data-modelo]').forEach(el=>{el.hidden=el.dataset.modelo!==tipo;});d.querySelectorAll('[data-horario]').forEach(el=>{el.hidden=!ks.map(String).includes(el.dataset.horario);});
     const c={tipo,dias:ds,trabalho:Number(f.get('trabalho')),folga:Number(f.get('folga')),horarios:{}};ks.forEach(k=>c.horarios[k]={inicio:f.get('inicio_'+k),fim:f.get('fim_'+k),intervalo:Number(f.get('intervalo_'+k))});
     const h=horas(c),meta=Number(f.get('carga_semanal')),el=d.querySelector('[data-carga]');el.textContent='Carga prevista: '+(Number.isFinite(h)?h.toLocaleString('pt-BR',{maximumFractionDigits:2}):'—')+' h por semana'+(tipo==='ciclo'?' em média':'')+'.'+(meta&&Math.abs(h-meta)>.01?' Diferente da meta de '+meta+' h: ajuste os dias ou horários.':'');el.classList.toggle('rh-carga-divergente',!!meta&&Math.abs(h-meta)>.01);
    };d.addEventListener('input',ajustar);d.addEventListener('change',ajustar);ajustar();
   });
 }
 window.RHFolgas={horas,regra,ausencia,montar(opcoes){ctx=opcoes;pintarFiltros();ctx.host.innerHTML='<div data-rh-folgas><p data-rh-erro class="fin-aviso" role="alert">Carregando escala…</p></div>';return carregar();}};
})();
