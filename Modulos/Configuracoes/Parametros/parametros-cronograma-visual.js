(function(){
 'use strict';
 window.carregarParametrosCronogramaVisual=async function(host,empresa){
  const sb=window.supabaseClient,secao=document.createElement('section');secao.className='pr-card';
  secao.innerHTML='<h3>Visualiza\u00e7\u00e3o do cronograma</h3><form><label>Repetir a coluna de pedidos ap\u00f3s<select name="dia" class="el-select"><option value="1">Segunda-feira</option><option value="2">Ter\u00e7a-feira</option><option value="3">Quarta-feira</option><option value="4">Quinta-feira</option><option value="5">Sexta-feira</option><option value="6">S\u00e1bado</option><option value="0">Domingo</option></select></label><p>Cada per\u00edodo usa suas pr\u00f3prias linhas de pedidos. Um pedido aparece apenas onde h\u00e1 etapas ou evento, sem se repetir indefinidamente nos per\u00edodos seguintes.</p><button class="btn primary" type="submit">Salvar visualiza\u00e7\u00e3o do cronograma</button></form>';
  host.appendChild(secao);const form=secao.querySelector('form'),botao=form.querySelector('button');
  const {data,error}=await sb.from('empresa_cronograma_visual').select('pedido_apos_dia').eq('empresa_id',empresa).maybeSingle();
  if(error){secao.remove();throw error;}form.elements.dia.value=String(data?.pedido_apos_dia??1);
  const pode=window.EasyLocPermissions?.hasPermission('configuracoes.empresa.editar')===true;
  form.elements.dia.disabled=botao.disabled=!pode;
  form.addEventListener('submit',async e=>{e.preventDefault();if(!pode)return;botao.disabled=true;try{const dia=Number(form.elements.dia.value);if(!Number.isInteger(dia)||dia<0||dia>6)throw Error('Selecione um dia da semana.');const {error}=await sb.from('empresa_cronograma_visual').upsert({empresa_id:empresa,pedido_apos_dia:dia},{onConflict:'empresa_id'});if(error)throw error;window.alerta('Visualiza\u00e7\u00e3o do cronograma salva.','Sucesso','sucesso');}catch(e){window.alerta(e.message,'Aten\u00e7\u00e3o','aviso');}finally{botao.disabled=false;}});
 };
})();
