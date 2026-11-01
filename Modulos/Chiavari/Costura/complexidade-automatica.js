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
 function abrir(p){
  versaoTela++;
  aberto=p;const fechado=p.complexidade.congelado,pl=p.planejamento||{};
  dlg.innerHTML='<form method="dialog" class="cx-auto-topo"><div><small>COMPLEXIDADE AUTOMÁTICA</small><h2>Pedido '+esc(p.numero)+'</h2><p>'+esc(p.cliente)+' · '+esc(p.local)+'</p></div><button class="cx-auto-fechar" aria-label="Fechar análise">×</button></form>'+
   (p.vinculo_ambiguo?'<p class="cx-auto-aviso">Há números de pedido repetidos. Confira o vínculo: esta avaliação não participa do cálculo de bônus enquanto houver ambiguidade.</p>':'')+
   '<p class="cx-auto-ajuda">'+(fechado?'Avaliação encerrada em '+esc(new Date(p.complexidade.congelado_em).toLocaleString('pt-BR'))+'. Os dados e parâmetros utilizados estão preservados.':'As respostas são preenchidas pelos cadastros e planejamento. Você só precisa tratar as pendências ou registrar uma exceção deste pedido.')+'</p>'+
   (Object.values(p.complexidade.setores).some(s=>s.status==='manual_preservado')?'<p class="cx-auto-aviso">Os percentuais identificados como anteriores conservam a avaliação manual até que as fontes necessárias estejam completas.</p>':'')+
   '<div class="cx-auto-scores">'+CXRegras.setores.map(s=>{const v=CXRegras.apresentarScore(p.complexidade.setores[s.id]);return '<div title="'+esc(v.detalhe)+'"><small>'+esc(s.nome)+'</small><strong>'+esc(v.texto)+'</strong><small class="cx-score-legenda">'+esc(v.legenda)+'</small></div>';}).join('')+'</div>'+
   '<form id="cxAutoForm"><fieldset '+(fechado?'disabled':'')+'><legend>Planejamento do pedido</legend><div class="cx-auto-planejamento"><label>Viagens previstas na entrega<input name="viagens" type="number" min="1" max="100" placeholder="A planejar" value="'+esc(pl.viagens??'')+'"></label><label>Confirmação autorizada da pré-reserva<input name="confirmado" type="datetime-local" value="'+esc(localData(pl.confirmado_em))+'"><small>Preencha quando houver autorização sem entrada paga. O pagamento registrado é utilizado automaticamente.</small></label><label>Há serviço de montagem?<select name="montagem"><option value="">Usar cronograma</option><option value="true">Sim</option><option value="false">Não</option></select></label></div></fieldset>'+
   '<label class="cx-auto-filtro"><input id="cxMostrarTodas" type="checkbox"'+(fechado?' checked':'')+'>Exibir também as respostas já preenchidas</label><p id="cxSemPendencias" class="cx-auto-ajuda" hidden>As respostas já estão preenchidas. Use a opção acima para consultar as fontes ou registrar uma exceção.</p>'+
   '<div class="cx-auto-perguntas">'+CXRegras.perguntas.map(q=>{const r=p.complexidade.respostas[q.id],e=pl.respostas?.[q.id];return '<article data-cx-pendente="'+(r.valor===null||!!e)+'"><div><b>'+esc(q.titulo)+'</b><span class="cx-auto-valor '+(r.valor===null?'pendente':'')+'">'+(r.valor===null?'Pendente':r.valor?'Sim':'Não')+'</span><small>'+esc(r.fonte)+' · '+esc(r.detalhe)+'</small></div><label>Exceção neste pedido<select data-cx-resposta="'+q.id+'"'+(fechado?' disabled':'')+'><option value="">Usar automático</option><option value="true"'+(e?.valor===true?' selected':'')+'>Sim</option><option value="false"'+(e?.valor===false?' selected':'')+'>Não</option></select></label></article>';}).join('')+'</div>'+
   (fechado?'':'<label class="cx-auto-motivo">Motivo do ajuste<textarea name="motivo" minlength="5" maxlength="1000" required placeholder="Explique a confirmação, o planejamento ou a exceção deste evento"></textarea></label><button class="cx-auto-salvar" type="submit">Salvar ajustes do pedido</button>')+'<p id="cxAutoStatus" role="status"></p></form>'+
   (p.manual_original?'<details><summary>Avaliação manual anterior preservada</summary><p>O registro original continua guardado. O pedido em aberto utiliza as informações atuais.</p><ul>'+CXRegras.setores.map(s=>'<li>'+esc(s.nome)+': '+esc(p.manual_original[s.campo]??'Pendente')+'%</li>').join('')+'</ul></details>':'');
  dlg.querySelector('[name=montagem]').value=typeof pl.montagem_aplica==='boolean'?String(pl.montagem_aplica):'';
  const filtrar=()=>{const todas=dlg.querySelector('#cxMostrarTodas').checked;dlg.querySelectorAll('[data-cx-pendente]').forEach(el=>el.hidden=!todas&&el.dataset.cxPendente!=='true');dlg.querySelector('#cxSemPendencias').hidden=todas||!!dlg.querySelector('[data-cx-pendente="true"]');};
  dlg.querySelector('#cxMostrarTodas').addEventListener('change',filtrar);filtrar();
  dlg.querySelector('#cxAutoForm').addEventListener('submit',salvar);if(!dlg.open)dlg.showModal();
 }
 async function salvar(ev){
  ev.preventDefault();const p=aberto,versao=versaoTela;if(p.complexidade.congelado)return;
  const form=ev.currentTarget,status=dlg.querySelector('#cxAutoStatus'),btn=form.querySelector('button[type=submit]');btn.disabled=true;status.textContent='Salvando ajustes…';
  try{
   const dados={respostas:{},viagens:form.elements.viagens.value?Number(form.elements.viagens.value):null,confirmado_em:form.elements.confirmado.value?form.elements.confirmado.value+':00-03:00':null,montagem_aplica:form.elements.montagem.value===''?null:form.elements.montagem.value==='true'};
   form.querySelectorAll('[data-cx-resposta]').forEach(el=>{if(el.value!=='')dados.respostas[el.dataset.cxResposta]=el.value==='true';});
   const {error}=await supabaseClient.rpc('complexidade_salvar_excecoes',{p_empresa:p.empresa_id||await empresaAtual(),p_pedido:p.id,p_dados:dados,p_motivo:form.elements.motivo.value.trim()});if(error)throw error;
   const atualizados=await chamada('listarPedidos');pedidos=atualizados;render();if(!dlg.open||versao!==versaoTela)return;const novo=atualizados.find(o=>o.id===p.id);if(novo)abrir(novo);else dlg.close();
   dlg.querySelector('#cxAutoStatus').textContent='Ajustes salvos. Respostas e percentuais recalculados.';
  }catch(e){status.textContent='Não foi possível salvar: '+e.message;}finally{btn.disabled=false;}
 }
 window.CXAutomatico={abrir,score(p,setor){return CXRegras.apresentarScore(p.complexidade?.setores[setor]).texto;}};
 const original=window.abrirPedidoPorId;
 window.abrirPedidoPorId=function(id){const p=pedidos.find(p=>p.id===decodeURIComponent(id));if(p?.automatico)return abrir(p);return original(id);};
 setInterval(async()=>{if(document.visibilityState!=='visible'||dlg.open)return;try{pedidos=await chamada('listarPedidos');render();}catch(_){/* Mantém a última leitura, sem apagar dados durante perda de conexão. */}},60000);
})();
