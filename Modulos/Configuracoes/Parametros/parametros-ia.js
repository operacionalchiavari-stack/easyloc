(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const retratos={compra:'carla',manutencao:'marcos',financeiro:'clara',catalogo:'helena',planejador:'helena',studio:'helena',compras_proposta:'carla',montagem:'montagem',separacao:'miguel',ideia:'ideia',rh:'ideia'};
 const pastaFotos=new URL('../../../assets/agentes/',document.currentScript.src||location.href);
 function foto(agente){
  const retrato=retratos[agente.chave],iniciais=String(agente.nome||'?').trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();
  return `<span class="ia-agente-foto" aria-hidden="true">${esc(iniciais)}${retrato?`<img src="${new URL(retrato+'.jpg',pastaFotos).href}" alt="" decoding="async" onerror="this.remove()">`:''}</span>`;
 }
 window.carregarParametrosIa=async function(host,empresa){
  if(host.dataset.empresa===empresa)return;
  host.innerHTML='<p>Carregando agentes…</p>';
  const sb=window.supabaseClient;
  const [agentes,config]=await Promise.all([sb.from('ia_agentes').select('*').order('nome'),sb.from('ia_agentes_config').select('*').eq('empresa_id',empresa)]);
  if(agentes.error||config.error)throw Error(agentes.error?.message||config.error.message);
  host.dataset.empresa=empresa;
  host.innerHTML='<p class="pr-ajuda">Defina como cada assistente atende sua empresa. As instruções são usadas nas próximas mensagens, no sistema e no app. Evidências obrigatórias e confirmações do sistema continuam valendo.</p><div class="ia-parametros"><nav aria-label="Agentes de IA"></nav><section class="pr-card" data-editor></section></div>';
  const lista=host.querySelector('nav'),editor=host.querySelector('[data-editor]');let atual=null,sujo=false;
  lista.innerHTML=agentes.data.map(a=>`<button type="button" data-agente="${esc(a.chave)}">${foto(a)}<span class="ia-agente-texto"><strong>${esc(a.nome)}</strong><small>${esc(a.descricao)}</small></span></button>`).join('');
  function abrir(chave){
   atual=agentes.data.find(a=>a.chave===chave);const salvo=config.data.find(a=>a.agente===chave),v=salvo||atual;
   lista.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.agente===chave)));
   editor.innerHTML=`<header class="ia-agente-cabecalho">${foto(atual)}<div class="ia-agente-texto"><h3>${esc(atual.nome)}</h3><p class="pr-ajuda">${esc(atual.descricao)}</p></div></header><form><label class="pr-campo"><span>Como deve agir · prompt do agente</span><textarea name="comportamento" rows="6" maxlength="8000" required>${esc(v.comportamento)}</textarea></label><label class="pr-campo"><span>Quais informações precisa colher</span><textarea name="coletar" rows="5" maxlength="8000">${esc(v.coletar)}</textarea></label><label class="pr-campo"><span>O que é indispensável antes de concluir</span><textarea name="indispensavel" rows="5" maxlength="8000">${esc(v.indispensavel)}</textarea></label><label class="pr-campo"><span>O que não pode fazer ou decidir</span><textarea name="limites" rows="5" maxlength="8000">${esc(v.limites??atual.limites)}</textarea></label><div class="pr-acoes"><span role="status">${salvo?'Personalizado pela empresa':'Instruções padrão'}</span><button type="button" data-padrao class="btn">Usar texto padrão</button><button type="submit" class="btn primary">Salvar agente</button></div></form>`;
   sujo=false;const form=editor.querySelector('form');form.oninput=()=>{sujo=true;};
   form.querySelector('[data-padrao]').onclick=()=>{['comportamento','coletar','indispensavel','limites'].forEach(k=>form.elements[k].value=atual[k]);sujo=true;};
   form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');b.disabled=true;
    try{const r=await sb.rpc('ia_agente_salvar',{p_empresa:empresa,p_agente:chave,p_comportamento:form.elements.comportamento.value,p_coletar:form.elements.coletar.value,p_indispensavel:form.elements.indispensavel.value,p_versao:salvo?.atualizado_em||null,p_limites:form.elements.limites.value});if(r.error)throw r.error;const i=config.data.findIndex(a=>a.agente===chave);if(i<0)config.data.push(r.data);else config.data[i]=r.data;abrir(chave);window.alerta?.('Instruções do agente salvas.','Sucesso','sucesso');}catch(err){status.textContent=err.message;window.alerta?.(err.message,'Não foi possível salvar','erro');}finally{b.disabled=false;}
   };
  }
  lista.onclick=e=>{const b=e.target.closest('[data-agente]');if(!b)return;if(sujo){editor.querySelector('[role=status]').textContent='Salve as alterações antes de trocar de agente.';return;}abrir(b.dataset.agente);};
  abrir(agentes.data[0].chave);
 };
})();
