const host=document.querySelector('#pr-painel-producao');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function init(){
 try{
 const ctx=await window.aguardarContexto();const sb=window.supabaseClient;
 const r=await sb.rpc('producao_quadro',{p_empresa:ctx.empresa_id});if(r.error)throw r.error;
 const c=r.data.config;
 const vinc=await sb.from('usuarios_empresas').select('user_id').eq('empresa_id',ctx.empresa_id);if(vinc.error)throw vinc.error;
 const ids=[...new Set(vinc.data.map(v=>v.user_id))];const users=ids.length?await sb.from('usuarios').select('id,nome').in('id',ids):{data:[]};if(users.error)throw users.error;
 host.innerHTML=`<form class="pr-form" id="producaoParametros"><section class="pr-card"><h3>Funcionamento da empresa</h3><p>O planejamento da produção usa horas úteis neste calendário, no horário de Brasília.</p><div class="pr-opcoes">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((d,i)=>`<label class="pr-check"><input type="checkbox" name="dias" value="${i}" ${c.dias.includes(i)?'checked':''}>${d}</label>`).join('')}</div><div class="pr-grade">${[['inicio','Abertura'],['fim','Fechamento'],['pausa_inicio','Início do intervalo'],['pausa_fim','Fim do intervalo']].map(([k,t])=>`<label class="pr-campo">${t}<input type="time" name="${k}" value="${esc(c[k])}" ${['inicio','fim'].includes(k)?'required':''}></label>`).join('')}<label class="pr-campo">Feriados e dias sem expediente<textarea name="feriados" rows="3" placeholder="Uma data por linha: AAAA-MM-DD">${esc(c.feriados.join('\n'))}</textarea></label></div></section>
 <section class="pr-card"><h3>Produção dos pedidos</h3><div class="pr-grade"><label class="pr-campo">Concluir antes da entrega<input name="antecedencia_horas" type="number" min="0" max="10000" step="0.5" value="${c.antecedencia_horas}" required><small>Horas úteis de antecedência</small></label></div><label class="pr-check"><input name="material_incompleto" type="checkbox" ${c.material_incompleto?'checked':''}>Permitir iniciar com materiais incompletos</label><label class="pr-check"><input name="exige_conferencia" type="checkbox" ${c.exige_conferencia?'checked':''}>Exigir conferência do responsável para concluir cada etapa</label><p>Pré-reservas ficam visíveis, mas não liberam execução nem recebimento. Prazo insuficiente exige autorização justificada.</p></section>
 <section class="pr-card"><h3>Responsáveis por área</h3><p>Selecione quem pode autorizar prazo, urgência, revisão e conferência em cada área. Os usuários também precisam da permissão “Responsável de produção”. Sem seleção, vale essa permissão geral. Administradores de parâmetros podem administrar todas as áreas.</p><div class="pr-grade">${[['pintura','Pintura'],['forracao','Forração'],['personalizacao','Personalização']].map(([k,t])=>`<fieldset data-setor="${k}"><legend>${t}</legend>${users.data.map(u=>`<label class="pr-check"><input type="checkbox" value="${esc(u.id)}" ${(c.responsaveis[k]||[]).includes(u.id)?'checked':''}>${esc(u.nome||'Usuário')}</label>`).join('')}</fieldset>`).join('')}</div></section><div class="pr-acoes"><span role="status"></span><button type="submit" class="btn primary">Salvar parâmetros da produção</button></div></form>`;
 host.querySelector('form').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget;const status=f.querySelector('[role=status]');const btn=f.querySelector('[type=submit]');btn.disabled=true;
  try{
   const v=new FormData(f);const config={dias:v.getAll('dias').map(Number),inicio:v.get('inicio'),fim:v.get('fim'),pausa_inicio:v.get('pausa_inicio'),pausa_fim:v.get('pausa_fim'),feriados:v.get('feriados').split(/\s+/).filter(Boolean),antecedencia_horas:Number(v.get('antecedencia_horas')),material_incompleto:v.has('material_incompleto'),exige_conferencia:v.has('exige_conferencia'),responsaveis:{}};
   f.querySelectorAll('[data-setor]').forEach(s=>config.responsaveis[s.dataset.setor]=[...s.querySelectorAll('input:checked')].map(x=>x.value));
   const salvo=await sb.rpc('producao_parametros_salvar',{p_empresa:ctx.empresa_id,p_config:config});if(salvo.error)throw salvo.error;
   const recalculo=await sb.rpc('producao_atualizar',{p_empresa:ctx.empresa_id});if(recalculo.error)throw recalculo.error;
   status.textContent='Parâmetros salvos e planejamento atualizado.';
  }catch(err){status.textContent=err.message;}finally{btn.disabled=false;}
 });
 }catch(err){host.textContent='Não foi possível carregar os parâmetros de produção: '+err.message;}
}
init();
