/* Free automático (nov/2026): parâmetros no Painel Logístico › Parâmetros. A vaga vai para o App do Freelancer quando o
   Comercial confirma as datas do pedido e falta no máximo N dias para a etapa (free_automacao_*). */
(function(){
 'use strict';
 const TIPOS=[['montagem','Montagem'],['desmontagem','Desmontagem'],['carregamento','Carregamento'],['descarregamento','Descarregamento'],['triagem','Triagem']];
 window.carregarParametrosFree=async function(host,empresa){
  const sb=window.supabaseClient,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sec=document.createElement('section');sec.className='escala-parametros-card';sec.dataset.parametrosFree='';host.append(sec);
  const r=await sb.rpc('free_automacao_parametros',{p_empresa:empresa});
  if(r.error){sec.innerHTML='<h2>Free automático</h2><p>Não foi possível carregar: '+esc(r.error.message)+'</p>';return;}
  const c=r.data||{},d=c.diarias||{},pode=!!c.pode_editar;
  sec.innerHTML=`<h2>Free automático</h2>
   <p>A escala escolhe os free de cada etapa. Quando o <b>Comercial confirmar as datas</b> do pedido e faltar no máximo o número de dias abaixo, a vaga vai sozinha para o App do Freelancer: primeiro só para os escalados e, depois do prazo, para todos os free aprovados. O líder é o responsável da etapa na escala.</p>
   <form data-free-auto>
    <label class="escala-parametros-check"><input name="ativa" type="checkbox" ${c.ativa?'checked':''}>Enviar as vagas de free automaticamente para o app</label>
    <div class="uber-parametros-grade">
     <label>Aparecer no app com antecedência de (dias)<input class="el-input" name="antecedencia_dias" type="number" min="0" max="90" required value="${esc(c.antecedencia_dias??7)}"></label>
     <label>Encontro antes do horário da etapa (minutos)<input class="el-input" name="encontro_min_antes" type="number" min="0" max="600" required value="${esc(c.encontro_min_antes??30)}"></label>
     <label>Só para os escalados durante (horas)<input class="el-input" name="horas_prioridade" type="number" min="0" max="168" required value="${esc(c.horas_prioridade??4)}"></label>
     <label class="uber-parametros-endereco">Ponto de encontro padrão (vazio = local do evento)<input class="el-input" name="ponto_encontro" maxlength="300" value="${esc(c.ponto_encontro||'')}" placeholder="Ex.: Galpão Chiavari"></label>
    </div>
    <h3>Diária do free por tipo de etapa</h3>
    <p>Etapa sem diária não é enviada para o app.</p>
    <div class="uber-parametros-frota">${TIPOS.map(([k,n])=>`<label>${n} (R$)<input class="el-input" type="number" min="0" step="0.01" data-diaria="${k}" value="${esc(d[k]??'')}"></label>`).join('')}</div>
    <p data-free-status role="status"></p>
    <button type="submit" class="btn primary">Salvar free automático</button>
   </form>`;
  sec.querySelectorAll('input,button').forEach(el=>el.disabled=!pode);
  const form=sec.querySelector('form'),status=sec.querySelector('[data-free-status]');
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(!pode)return;
   const f=form.elements,diarias={};sec.querySelectorAll('[data-diaria]').forEach(el=>{if(Number(el.value)>0)diarias[el.dataset.diaria]=Number(el.value);});
   const botao=form.querySelector('button[type=submit]');botao.disabled=true;status.textContent='Salvando…';
   try{
    const s=await sb.rpc('free_automacao_salvar',{p_empresa:empresa,p_config:{ativa:f.ativa.checked,antecedencia_dias:Number(f.antecedencia_dias.value),encontro_min_antes:Number(f.encontro_min_antes.value),horas_prioridade:Number(f.horas_prioridade.value),ponto_encontro:f.ponto_encontro.value.trim(),diarias}});
    if(s.error)throw s.error;status.textContent=f.ativa.checked?'Salvo. As vagas das etapas com datas já confirmadas foram enviadas ao app.':'Salvo (free automático desligado).';
   }catch(err){status.textContent=err.message||'Não foi possível salvar.';}finally{botao.disabled=false;}
  });
 };
})();
