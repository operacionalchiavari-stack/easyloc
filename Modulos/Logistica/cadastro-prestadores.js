(function(){
  const tipo=new URLSearchParams(location.search).get('tipo')==='uber'?'uber':'free';
  const estado={empresa:null,dados:null,selecionado:null};
  const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nota=v=>Number(v??10).toFixed(1).replace('.',',');
  const iniciais=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const avatar=p=>p.foto_url?'<img class="prest-avatar" src="'+esc(p.foto_url)+'" alt="">':'<span class="prest-avatar">'+esc(iniciais(p.nome))+'</span>';
  function erro(e){$('aviso').hidden=false;$('aviso').textContent=e.message||String(e)}
  async function rpc(nome,args){const r=await window.supabaseClient.rpc(nome,args);if(r.error)throw r.error;return r.data}
  async function carregar(){
    try{const c=await window.aguardarContexto();estado.empresa=c.empresa_id;estado.dados=await rpc('logistica_desempenho_lista',{p_empresa:estado.empresa,p_tipo:tipo});renderLista();renderParametros();if(estado.selecionado){estado.selecionado=estado.dados.pessoas.find(p=>p.id===estado.selecionado.id)||null;if(estado.selecionado)await abrir(estado.selecionado.id)}}catch(e){erro(e)}
  }
  function renderLista(){const q=$('busca').value.trim().toLowerCase();const pend=estado.dados.pessoas.filter(p=>p.status==='pendente').length,ab=document.querySelector('.prest-abas [data-aba="cadastros"]');if(ab)ab.innerHTML='Cadastros'+(pend?' <span class="prest-pend">'+pend+' aguardando aprovação</span>':'');const ps=estado.dados.pessoas.filter(p=>(p.nome+' '+(p.telefone||'')).toLowerCase().includes(q)).sort((a,b)=>(a.status==='pendente'?0:1)-(b.status==='pendente'?0:1));$('lista').innerHTML=ps.length?ps.map(p=>'<button class="prest-pessoa '+(estado.selecionado?.id===p.id?'ativa':'')+'" data-id="'+p.id+'">'+avatar(p)+'<div><strong>'+esc(p.nome)+'</strong><small>'+esc(p.telefone||p.carro||'Sem telefone')+(p.status==='pendente'?'':' · '+esc(SIT[p.status]||p.status||''))+'</small>'+(p.status==='pendente'?'<span class="prest-tag-pend">Aguardando aprovação</span>':'')+'</div><span class="prest-nota">'+nota(p.nota)+'</span></button>').join(''):'<div class="prest-vazio">Nenhum cadastro encontrado.</div>';document.querySelectorAll('.prest-pessoa').forEach(b=>b.onclick=()=>abrir(b.dataset.id))}
  async function abrir(id){
    estado.selecionado=estado.dados.pessoas.find(p=>p.id===id);renderLista();$('ficha').innerHTML='<div class="prest-vazio">Carregando…</div>';estado.completo=null;
    try{const [d,dados]=await Promise.all([rpc('logistica_desempenho_detalhe',{p_empresa:estado.empresa,p_tipo:tipo,p_pessoa:id}),rpc('logistica_prestador_dados',{p_empresa:estado.empresa,p_tipo:tipo,p_pessoa:id})]);
      if(estado.selecionado?.id!==id)return;estado.det=d;estado.ficha=dados;pintarFicha();
    }catch(e){erro(e)}
  }
  const data=v=>v?new Date(String(v).length===10?v+'T12:00:00':v).toLocaleDateString('pt-BR'):'—';
  const dataHora=v=>v?new Date(v).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
  function pintarFicha(){
    const p=estado.selecionado,d=estado.det,f=estado.ficha,hist=d.historico||[],aba=estado.abaFicha||'dados';
    const campo=(r,v,extra)=>'<div class="prest-campo"><span>'+r+'</span><strong>'+(v==null||v===''?'—':v)+'</strong>'+(extra||'')+'</div>';
    const tel=String(f.telefone||'').replace(/\D/g,''),zap=tel?'<a class="prest-link" href="https://wa.me/55'+tel.replace(/^55/,'')+'" target="_blank" rel="noopener">WhatsApp</a>':'';
    const comp=estado.completo||{};
    const dadosHtml='<div class="prest-campos">'+campo('Nome completo',esc(f.nome))+
      (tipo==='free'?campo('CPF',esc(comp.cpf||f.cpf),!estado.completo?'<button class="prest-link prest-ver-link" id="verCompleto">Ver CPF e PIX</button>':''):'')+campo('Telefone (WhatsApp)',esc(f.telefone),zap)+campo('Chave PIX',esc(comp.pix||f.pix))+
      (tipo==='uber'?campo('Carro',esc(f.carro)):'')+campo('Situação',esc(SIT[f.status]||f.status))+
      (tipo==='free'?campo('Foto para identificação',f.foto_url?'Enviada':'Não enviada')+campo('Uso de imagem e dados','Autorizado no cadastro'):'')+
      campo('Cadastrado em',dataHora(f.cadastrado_em))+campo('Último acesso ao app',dataHora(f.ultimo_acesso))+'</div>'+
      
      (f.observacao?'<div class="prest-obs"><span>Observação</span><p>'+esc(f.observacao)+'</p></div>':'')+
      '<h3 class="prest-sub">Trabalho</h3><div class="prest-numeros">'+
      '<div><strong>'+(f.trabalhos??0)+'</strong><span>'+(tipo==='free'?'Trabalhos feitos':'Corridas feitas')+'</span></div>'+
      (tipo==='free'?'<div class="'+(f.faltas?'ruim':'')+'"><strong>'+(f.faltas??0)+'</strong><span>Faltas</span></div>':'')+
      '<div class="'+(f.cancelamentos?'ruim':'')+'"><strong>'+(f.cancelamentos??0)+'</strong><span>Cancelamentos</span></div>'+
      '<div><strong>'+data(f.ultimo_trabalho)+'</strong><span>Último trabalho</span></div></div>'+
      '<h3 class="prest-sub">Próximos trabalhos confirmados</h3>'+((f.proximos||[]).length?'<div class="prest-proximos">'+f.proximos.map(x=>'<div><strong>'+data(x.data)+(x.hora?' · '+esc(String(x.hora).slice(0,5)):'')+'</strong><span>'+esc(x.etapa||'')+(x.pedido?' · Pedido '+esc(x.pedido):'')+'</span><small>'+esc([x.cliente,x.local].filter(Boolean).join(' · '))+'</small></div>').join('')+'</div>':'<div class="prest-vazio pequeno">Nenhum trabalho confirmado pela frente.</div>');
    const histHtml=hist.length?hist.map(h=>'<div class="prest-evento"><div><strong>'+esc(h.parametro)+'</strong><p>'+esc(h.observacao||'Sem observação')+'</p><small>'+new Date(h.created_at).toLocaleString('pt-BR')+' · '+esc(h.origem==='luisa'?'Luísa':h.criado_por||'Registro manual')+(h.etapa?' · '+esc(h.etapa):'')+(h.pedido?' · Pedido '+esc(h.pedido):'')+'</small></div><span class="prest-desconto">− '+nota(h.pontos)+'</span></div>').join(''):'<div class="prest-vazio">Ainda não há ocorrências.</div>';
    $('ficha').innerHTML='<div class="prest-ficha-top">'+'<nav class="prest-ficha-abas" role="tablist"><button role="tab" data-ficha="dados" aria-selected="'+(aba==='dados')+'">Dados</button><button role="tab" data-ficha="historico" aria-selected="'+(aba==='historico')+'">Histórico <span>'+hist.length+'</span></button></nav>'+'<div class="prest-acoes">'+(estado.dados.pode_editar?'<button class="prest-btn" id="registrar">+ Registrar ocorrência</button>'+botoesSituacao(p):'')+'</div>'+'<div class="prest-score"><strong>'+nota(d.nota)+'</strong><span>de 10</span></div></div>'+'<section class="prest-ficha-corpo">'+(aba==='dados'?dadosHtml:histHtml)+'</section>';
    if($('registrar'))$('registrar').onclick=abrirOcorrencia;document.querySelectorAll('[data-situacao]').forEach(b=>b.onclick=()=>mudarSituacao(b.dataset.situacao));
    document.querySelectorAll('[data-ficha]').forEach(b=>b.onclick=()=>{estado.abaFicha=b.dataset.ficha;pintarFicha();});
    if($('verCompleto'))$('verCompleto').onclick=verCompleto;
  }
  async function verCompleto(){
    try{const r=await window.supabaseClient.functions.invoke('free-protegido',{body:{action:'revelar_rh',empresa_id:estado.empresa,ids:[estado.selecionado.id],motivo:'consulta no cadastro de free (Logística)'}});
      if(r.error){let m=r.error.message;try{m=(await r.error.context.json()).error||m}catch(_){}throw Error(m)}
      if(r.data?.error)throw Error(r.data.error);estado.completo=r.data?.valores?.[estado.selecionado.id]||{};pintarFicha();
    }catch(e){erro(e)}
  }
  function abrirOcorrencia(){$('ocParametro').innerHTML=estado.dados.parametros.filter(p=>p.ativo).map(p=>'<option value="'+p.id+'">'+esc(p.nome)+' (− '+nota(p.peso)+')</option>').join('');$('ocQuantidade').value=1;$('ocObservacao').value='';$('modalOcorrencia').showModal()}
  async function salvarOcorrencia(){try{await rpc('logistica_desempenho_registrar',{p_empresa:estado.empresa,p_tipo:tipo,p_pessoa:estado.selecionado.id,p_parametro:$('ocParametro').value,p_quantidade:Number($('ocQuantidade').value),p_observacao:$('ocObservacao').value,p_etapa:null,p_origem:'manual'});$('modalOcorrencia').close();await carregar()}catch(e){erro(e)}}
  const SIT={pendente:'aguardando aprovação',aprovado:'aprovado',recusado:'recusado',bloqueado:'bloqueado',ativo:'ativo'};
  function botoesSituacao(p){const st=p.status;const b=(v,t,cl)=>'<button class="prest-btn '+(cl===undefined?'claro':cl)+'" data-situacao="'+v+'">'+t+'</button>';
    if(tipo!=='free')return st==='bloqueado'?b('ativo','Desbloquear'):b('bloqueado','Bloquear');
    if(st==='pendente')return b('aprovado','Aprovar cadastro','')+b('bloqueado','Recusar');
    if(st==='aprovado')return b('bloqueado','Bloquear');
    return b('aprovado','Aprovar cadastro','');}
  async function mudarSituacao(novo){const p=estado.selecionado;if(!p||novo===p.status)return;
    if(novo!=='aprovado'&&!confirm((p.status==='pendente'?'Recusar':'Bloquear')+' o cadastro de '+p.nome+'?'))return;
    try{await rpc('logistica_desempenho_status',{p_empresa:estado.empresa,p_tipo:tipo,p_pessoa:p.id,p_status:novo});await carregar()}catch(e){erro(e)}}
  function renderParametros(){const ps=estado.dados.parametros||[];$('listaParametros').innerHTML=ps.map(p=>'<div class="prest-regra" data-id="'+p.id+'"><input class="nome" value="'+esc(p.nome)+'" '+(!estado.dados.pode_editar?'disabled':'')+'><label>Peso <input class="peso" type="number" min="0" max="10" step="0.1" value="'+p.peso+'" '+(!estado.dados.pode_editar?'disabled':'')+'></label><label><input class="ativo" type="checkbox" '+(p.ativo?'checked':'')+' '+(!estado.dados.pode_editar?'disabled':'')+'> Ativo</label>'+(estado.dados.pode_editar?'<button class="prest-btn salvar">Salvar</button>':'')+'</div>').join('');document.querySelectorAll('.prest-regra .salvar').forEach(b=>b.onclick=()=>salvarParametro(b.closest('.prest-regra')))}
  async function salvarParametro(el){try{await rpc('logistica_desempenho_parametro_salvar',{p_empresa:estado.empresa,p_id:el.dataset.id||null,p_nome:el.querySelector('.nome').value,p_peso:Number(el.querySelector('.peso').value),p_ativo:el.querySelector('.ativo').checked});await carregar()}catch(e){erro(e)}}
  $('titulo').textContent='Cadastro de '+(tipo==='uber'?'Uber':'Free');$('busca').oninput=renderLista;$('salvarOcorrencia').onclick=salvarOcorrencia;
  document.querySelectorAll('.prest-abas button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.prest-abas button').forEach(x=>x.classList.toggle('ativo',x===b));$('cadastros').hidden=b.dataset.aba!=='cadastros';$('parametros').hidden=b.dataset.aba!=='parametros'});
  $('novoParametro').onclick=()=>{const n=prompt('Nome do novo parâmetro');if(!n)return;rpc('logistica_desempenho_parametro_salvar',{p_empresa:estado.empresa,p_id:null,p_nome:n,p_peso:1,p_ativo:true}).then(carregar).catch(erro)};
  carregar();
})();
