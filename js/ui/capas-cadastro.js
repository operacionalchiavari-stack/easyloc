(function(){
 'use strict';let versao=0;
 window.CapasCadastro={async mostrar(item){
  const v=++versao;let box=document.getElementById('capasCadastroItem');
  if(!box){const root=document.querySelector('[data-item-panel="dados"]');if(!root)return;box=document.createElement('fieldset');box.id='capasCadastroItem';box.className='cx-cadastro';root.append(box);}
  box.replaceChildren();const legend=document.createElement('legend');legend.textContent='Material de prote\u00e7\u00e3o';box.append(legend);
  const texto=document.createElement('p');box.append(texto);if(!item?.id){texto.textContent='Salve o item para configurar o material e sua capacidade.';return;}
  if(String(item.tipo||'').toLowerCase()==='kit'){texto.textContent='As capas são configuradas nos componentes físicos do kit, para evitar contar o kit e seus componentes duas vezes.';return;}

  try{
   const ctx=await window.aguardarContexto?.(),sb=window.supabaseClient,empresa=ctx?.empresa_id||window.__CONTEXT?.empresa_id;
   const [{data,error},permissao]=await Promise.all([sb.from('capas_modelos').select('usa_capa,unidades_por_capa,nome,tipo_material').eq('empresa_id',empresa).eq('item_id',item.id).maybeSingle(),sb.rpc('capas_pode',{p_empresa:empresa,p_editar:true})]);
   if(v!==versao)return;if(error)throw error;if(permissao.error)throw permissao.error;
   const campos=document.createElement('div');
   campos.innerHTML='<label>Material de prote&#231;&#227;o<select data-uso><option value="">Selecione</option><option value="nenhum">N&#227;o utiliza</option><option value="capa">Capa</option><option value="caixa">Caixa</option></select></label><label data-detalhe>Unidades do item por material<input data-capacidade type="number" min="1" max="10000" step="1" required></label><label data-detalhe>Nome do material<input data-nome readonly aria-readonly="true"></label><button type="button" class="btn secondary">Salvar material de prote&#231;&#227;o</button>';
   box.insertBefore(campos,texto);
   const uso=campos.querySelector('select'),cap=campos.querySelector('[data-capacidade]'),nome=campos.querySelector('[data-nome]'),salvar=campos.querySelector('button');
   uso.value=data?(data.usa_capa?(data.tipo_material||'capa'):'nenhum'):'';cap.value=data?.unidades_por_capa||1;nome.value=data?.nome||'';
   const atualizar=()=>{const utiliza=['capa','caixa'].includes(uso.value);campos.querySelectorAll('[data-detalhe]').forEach(el=>el.hidden=!utiliza);cap.disabled=!utiliza||!permissao.data;nome.value=utiliza?(uso.value==='caixa'?'Caixa ':'Capa ')+(item.descricao_total||item.produto||'Item'):'';};uso.onchange=atualizar;
   campos.querySelectorAll('input,select,button').forEach(el=>el.disabled=!permissao.data);atualizar();
   salvar.onclick=async()=>{
    if(!uso.value){texto.textContent='Selecione o material de prote\u00e7\u00e3o.';uso.focus();return;}
    if(['capa','caixa'].includes(uso.value)&&!cap.reportValidity())return;
    salvar.disabled=true;texto.textContent='Salvando...';
    try{const r=await sb.rpc('material_protecao_configurar',{p_empresa:empresa,p_item:item.id,p_tipo:uso.value,p_capacidade:['capa','caixa'].includes(uso.value)?Number(cap.value):1});if(r.error)throw r.error;if(v===versao)texto.textContent='Material salvo.';}
    catch(e){if(v===versao)texto.textContent=e.message;}finally{salvar.disabled=false;}
   };
  }catch(e){if(v===versao)texto.textContent=e.message;}
 }};
})();
