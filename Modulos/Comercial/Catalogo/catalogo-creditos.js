(function(){
  const client=window.supabaseClient;
  const names={tecido:'Personalizar tecido',render:'Renderizar ambiente',planta:'Analisar planta',layout:'Planejar decoração'};
  let wallet=null, refreshing=null, queued=Promise.resolve();
  const token=()=>sessionStorage.getItem('catalogo_token');
  const external=()=>!sessionStorage.getItem('login_ok')&&token();
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function refresh(){
    if(!external())return null;
    if(refreshing)return refreshing;
    refreshing=(async()=>{
      const {data,error}=await client.rpc('catalogo_creditos_saldo',{p_token:token()});
      if(error)throw new Error('Não foi possível consultar seus créditos. Tente novamente.');
      wallet=data;let button=document.getElementById('catalogCreditBalance');
      if(!button){button=document.createElement('button');button.id='catalogCreditBalance';button.type='button';button.className='catalog-credit-balance';button.addEventListener('click',()=>showWallet());document.body.appendChild(button);}
      button.textContent=`✦ ${data.saldo.toLocaleString('pt-BR')} créditos`;
      button.setAttribute('aria-label',`Saldo: ${data.saldo} créditos. Ver custos e histórico`);
      return data;
    })().finally(()=>refreshing=null);
    return refreshing;
  }
  function dialog(title,content,action){
    return new Promise(resolve=>{
      const el=document.createElement('dialog');el.className='catalog-credit-dialog';
      el.innerHTML=`<form method="dialog"><header><span>CHIAVARI · CRÉDITOS DE IA</span><button value="cancel" aria-label="Fechar">×</button></header><h2>${escape(title)}</h2>${content}<footer><button value="cancel" class="credit-secondary">${action?'Agora não':'Fechar'}</button>${action?`<button value="confirm" class="credit-primary">${escape(action)}</button>`:''}</footer></form>`;
      document.body.appendChild(el);el.addEventListener('close',()=>{const ok=el.returnValue==='confirm';el.remove();resolve(ok)},{once:true});el.showModal();
    });
  }
  const costs=()=>`<div class="credit-cost-list">${Object.entries(names).map(([key,name])=>`<div><span>${name}</span><strong>${wallet.custos[key]} crédito${wallet.custos[key]===1?'':'s'}</strong></div>`).join('')}</div>`;
  async function showWallet(){
    try{await refresh();await dialog('Sua liberdade para criar',`<div class="credit-hero"><small>Saldo disponível</small><strong>${wallet.saldo.toLocaleString('pt-BR')} <span>créditos</span></strong></div><p>Use seus créditos para transformar ideias em imagens. Para adicionar mais, fale com a Chiavari.</p>${costs()}<h3>Últimas movimentações</h3><div class="credit-history">${wallet.historico.length?wallet.historico.map(m=>`<div><span>${escape(m.tipo==='recarga'?'Créditos adicionados':names[m.recurso])}<small>${new Date(m.created_at).toLocaleDateString('pt-BR')} · ${m.status==='estornado'?'Devolvido':m.status==='reservado'?'Em processamento':'Concluído'}</small></span><b>${m.tipo==='recarga'?'+':m.status==='estornado'?'↩':'−'}${m.quantidade}</b></div>`).join(''):'<p>Seu histórico aparecerá aqui.</p>'}</div>`);}catch(e){await dialog('Créditos indisponíveis',`<p>${escape(e.message)}</p>`);}
  }
  const original=(name,options)=>client.functions.invoke(name,options);
  async function invoke(name,options){
    if(name!=='studio-ai-engine'||!options?.body?.catalog_token)return original(name,options);
    // Confirmações em sequência, sem bloquear gerações já autorizadas.
    let release;const turn=new Promise(r=>release=r);const previous=queued;queued=turn;await previous;
    let price;
    try{
      await refresh();if(!wallet)throw new Error('Sessão do catálogo indisponível. Entre novamente.');
      const b=options.body;const resource=b.action==='analyze_floor_plan'?'planta':b.action==='plan_layout'?'layout':b.scene?.referencePolicy==='fabric_customization'?'tecido':'render';
      price=wallet.custos[resource];
      if(!Number.isInteger(price))throw new Error('Custo indisponível. Tente novamente.');
      const enough=wallet.saldo>=price;
      const accepted=await dialog(enough?names[resource]:'Seus créditos precisam de uma recarga',`<p>${enough?'Confira o custo antes de continuar.':'Fale com a Chiavari para adicionar créditos à sua conta.'}</p><div class="credit-cost-list"><div><span>Saldo disponível</span><strong>${wallet.saldo} créditos</strong></div><div><span>Esta operação</span><strong>${price} créditos</strong></div>${enough?`<div><span>Saldo após o uso</span><strong>${wallet.saldo-price} créditos</strong></div>`:''}</div><p class="credit-note">Se a geração falhar, os créditos serão devolvidos.</p>`,enough?'Confirmar e usar IA':null);
      if(!accepted)return{data:null,error:new Error('Operação cancelada. Nenhum crédito utilizado.')};
    }catch(error){return{data:null,error};}finally{release();}
    try{return await original(name,{...options,body:{...options.body,request_id:crypto.randomUUID(),expected_cost:price}});}finally{refresh().catch(()=>{});}
  };
  const start=()=>{if(external())refresh().catch(()=>{});};
  setInterval(start,30000);window.addEventListener('focus',start);
  // O login do catálogo termina depois da carga inicial do script.
  window.CatalogCredits={refresh,show:showWallet,invoke};
  start();
})();
