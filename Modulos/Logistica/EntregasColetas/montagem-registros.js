(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.MontagemRegistros={async carregar(host,sb,pedido,aoAtualizar,etapa='entrega'){
  host.hidden=true;
  const resposta=await sb.rpc('logistica_montagem_registros',{p_pedido:pedido});if(!host.isConnected)return;
  if(resposta.error){host.hidden=false;host.textContent='Não foi possível verificar a conferência pelo app.';return;}
  const tipos=etapa==='entrega'?['conferencia_entrega']:['contagem_itens'];
  const registros=(resposta.data||[]).filter(e=>e.tipo===(etapa==='entrega'?'montagem':'desmontagem')).flatMap(e=>e.registros||[]).filter(r=>r.origem!=='sistema'&&tipos.includes(r.tipo)).sort((a,b)=>String(b.atualizado_em||b.criado_em).localeCompare(String(a.atualizado_em||a.criado_em)));
  if(!registros.length)return;
  const r=registros[0];host.hidden=false;host.classList.add('ec-app-registrado');
  host.innerHTML='<strong>✓ Conferência registrada pelo app</strong><span>'+esc(r.autor||'Equipe')+' · '+esc(new Date(r.atualizado_em||r.criado_em).toLocaleString('pt-BR'))+'</span>'+(etapa==='entrega'?'<small>As quantidades abaixo vieram do app. Confira e confirme a entrega.</small>':'');
 },url:document.currentScript.src};
})();
