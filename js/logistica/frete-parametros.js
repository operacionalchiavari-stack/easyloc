/* Frete automático (nov/2026): Painel Logístico › Parâmetros. Explica como o frete é anunciado e guarda liga/desliga,
   antecedência e "esperar o Comercial confirmar as datas" (frete_automacao_*; regra em frete_anuncios_sincronizar). */
(function(){
 'use strict';
 window.carregarParametrosFrete=async function(host,empresa){
  const sb=window.supabaseClient,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sec=document.createElement('section');sec.className='escala-parametros-card';sec.dataset.parametrosFrete='';host.append(sec);
  const r=await sb.rpc('frete_automacao_parametros',{p_empresa:empresa});
  if(r.error){sec.innerHTML='<h2>Frete automático</h2><p>Não foi possível carregar: '+esc(r.error.message)+'</p>';return;}
  const c=r.data||{},pode=!!c.pode_editar,semLimite=Number(c.antecedencia_dias)>=3650;
  sec.innerHTML=`<h2>Frete automático</h2>
   <p><b>Como o frete é anunciado:</b> a cada 10 minutos o sistema olha a <b>entrega</b> (carregamento + montagem) e a <b>coleta</b> (desmontagem + descarregamento) de cada pedido <b>reservado</b>.</p>
   <ol class="frete-param-passos">
    <li>Se já há caminhão da frota escalado, não anuncia nada.</li>
    <li>Se não há, a escala automática tenta pôr um caminhão próprio livre.</li>
    <li>Se continuar sem caminhão, o frete vai para o <b>App do Freteiro</b>, com o ponto de encontro no galpão e o destino no local do evento. Só aparece para o freteiro cujo veículo comporta o volume do pedido.</li>
    <li>Valor = valor por km da categoria do caminhão (pela cubagem do pedido) × km do pedido ÷ 2. Sem km ou sem categoria, não anuncia.</li>
    <li>O primeiro freteiro que aceitar leva: o caminhão dele entra na escala da entrega ou da coleta.</li>
   </ol>
   ${c.escala_automatica===false?'<p class="frete-param-aviso">A escala automática está desligada: com ela desligada nenhum frete é anunciado.</p>':''}
   <p class="frete-param-galpao">Ponto de encontro (galpão): <b>${esc(c.galpao||'não cadastrado')}</b></p>
   <form data-frete-auto>
    <label class="escala-parametros-check"><input name="ativa" type="checkbox" ${c.ativa!==false?'checked':''}>Anunciar fretes automaticamente no App do Freteiro</label>
    <label class="escala-parametros-check"><input name="exigir_confirmacao" type="checkbox" ${c.exigir_confirmacao?'checked':''}>Anunciar só depois que o Comercial confirmar as datas do pedido</label>
    <div class="uber-parametros-grade">
     <label>Anunciar com antecedência de até (dias)<input class="el-input" name="antecedencia_dias" type="number" min="0" max="365" placeholder="Sem limite" value="${semLimite?'':esc(c.antecedencia_dias)}"></label>
    </div>
    <p>Vazio = sem limite (anuncia assim que a entrega ou a coleta ficar sem caminhão). As mudanças valem para os próximos anúncios; os que já estão no app continuam.</p>
    <p data-frete-status role="status"></p>
    <button type="submit" class="btn primary">Salvar frete automático</button>
   </form>`;
  sec.querySelectorAll('input,button').forEach(el=>el.disabled=!pode);
  const form=sec.querySelector('form'),status=sec.querySelector('[data-frete-status]');
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(!pode)return;const f=form.elements,botao=form.querySelector('button[type=submit]');botao.disabled=true;status.textContent='Salvando…';
   try{const s=await sb.rpc('frete_automacao_salvar',{p_empresa:empresa,p_config:{ativa:f.ativa.checked,exigir_confirmacao:f.exigir_confirmacao.checked,antecedencia_dias:f.antecedencia_dias.value===''?3650:Number(f.antecedencia_dias.value)}});
    if(s.error)throw s.error;status.textContent='Salvo.';}
   catch(err){status.textContent=err.message||'Não foi possível salvar.';}finally{botao.disabled=false;}
  });
 };
})();
