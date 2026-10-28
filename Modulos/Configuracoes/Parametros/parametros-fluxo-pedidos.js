(function(){
 'use strict';
 window.carregarFluxoPedidos=async function(host,empresa){
  const sb=window.supabaseClient,secao=document.createElement('section');secao.className='pr-motivos-logistica pr-fluxo-pedidos';
  secao.innerHTML='<h3>Fluxo dos pedidos</h3><form><label style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="pre" style="width:auto"> Mostrar pré-reservas para consulta na Triagem e em Entrega</label><p>Orçamentos ficam apenas no Comercial. Pré-reservas não permitem separar, carregar ou confirmar a entrega.</p><label>Retorno após a coleta<select name="retorno"><option value="simultaneo">Expedição e Triagem simultâneas</option><option value="sequencial">Descarregamento primeiro, Triagem depois</option></select></label><p>No modo simultâneo, os dois setores trabalham no mesmo pedido. A Posição final só é liberada depois das duas conferências.</p><label>Prazo da manuten&#231;&#227;o antes do carregamento<input name="acervo_antecedencia" type="number" min="0" max="8760" step="0.5" required></label><p>Horas corridas de anteced&#234;ncia. O prazo final aparece nos pr&#243;ximos eventos do acervo.</p><button type="submit" disabled>Salvar fluxo</button></form><p role="status"></p>';
  host.prepend(secao);const form=secao.querySelector('form'),botao=form.querySelector('button'),status=secao.querySelector('[role=status]');
  const {data,error}=await sb.from('empresa_fluxo_pedidos').select('pre_reservas_consulta,retorno_simultaneo,acervo_antecedencia_horas').eq('empresa_id',empresa).maybeSingle();
  if(error){status.textContent='Não foi possível carregar o fluxo: '+error.message;return;}
  form.elements.pre.checked=data?.pre_reservas_consulta===true;form.elements.retorno.value=data?.retorno_simultaneo===false?'sequencial':'simultaneo';form.elements.acervo_antecedencia.value=data?.acervo_antecedencia_horas??24;botao.disabled=false;
  form.addEventListener('submit',async ev=>{ev.preventDefault();botao.disabled=true;status.textContent='Salvando…';try{
   const {error}=await sb.rpc('pedido_fluxo_configurar',{p_empresa:empresa,p_pre_reservas:form.elements.pre.checked,p_retorno_simultaneo:form.elements.retorno.value==='simultaneo',p_acervo_antecedencia:Number(form.elements.acervo_antecedencia.value)});if(error)throw error;status.textContent='Fluxo salvo. As filas passam a seguir estas regras.';
  }catch(e){status.textContent='Não foi possível salvar: '+e.message;}finally{botao.disabled=false;}});
 };
})();
