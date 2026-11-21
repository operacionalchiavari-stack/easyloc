(function(){
  'use strict';
  const client=()=>window.supabaseClient;
  const empresa=()=>window.__CONTEXT?.empresa_id;
  const ready=(async()=>{await window.aguardarContexto?.();if(!empresa())throw Error('Empresa não identificada. Entre novamente.');})();
  window.AcervoComprasAuth={ready};
  window.AcervoComprasAlert={
    success:(message,title='Compras')=>window.alerta?.(message,title,'sucesso'),
    error:(message,title='Compras')=>window.alerta?.(message,title,'erro'),
    confirm:({title,message,confirmText,cancelText})=>window.confirmarGlobal?window.confirmarGlobal(message,title,{confirmarTexto:confirmText,cancelarTexto:cancelText}):Promise.resolve(confirm(message))
  };
  async function query(table){await ready;return client().from(table).select('*').eq('empresa_id',empresa());}
  async function run(action,payload={}){
    await ready;
    const {data,error}=await client().rpc('compras_operar',{p_empresa:empresa(),p_acao:action,p_dados:payload});
    if(error)throw Error(error.message || 'Não foi possível concluir a operação de Compras.');
    return data;
  }
  async function list(tipo){return await run('listar',{tipo}) || [];}
  async function signed(path){
    if(!path)return '';
    if(!path.startsWith(empresa()+'/'))throw Error('Documento fora desta empresa.');
    const {data,error}=await client().storage.from('compras-documentos').createSignedUrl(path,600);
    if(error)throw Error('Não foi possível abrir o documento.');return data.signedUrl;
  }
  async function upload(file){
    await ready;
    if(!file || file.size>12*1024*1024)throw Error('Selecione um arquivo de até 12 MB.');
    if(!['application/pdf','application/xml','text/xml','image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use PDF, XML, PNG, JPEG ou WEBP.');
    const nome=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=empresa()+'/'+crypto.randomUUID()+'/'+nome;
    const {error}=await client().storage.from('compras-documentos').upload(path,file,{contentType:file.type,upsert:false});
    if(error)throw Error(error.message);
    return {path,nome:file.name,url:await signed(path),tipo:file.type};
  }
  async function profile(){
    await ready;const {data,error}=await client().from('empresas').select('*').eq('id',empresa()).single();if(error)throw error;
    return {...data,nome_fantasia:data.nome || data.razao_social,documento:data.cnpj};
  }
  async function detail(id){
    const data=await run('consultar',{id});
    const company=await profile();
    data.billing_company={id:empresa(),rotulo:company.nome_fantasia,razao_social:company.razao_social,cnpj:company.cnpj,logo_url:company.logo_url};
    data.items=(data.items || []).map(item=>({...item,necessidades:item.need_allocations || item.allocations || []}));
    return data;
  }
  function relacionarXml(order,xmlItems){
    return new Promise(resolve=>{
      const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const d=document.createElement('dialog');d.className='pv-dialog';
      d.innerHTML='<form class="dialog-card"><header><h2>Relacionar itens da NF-e</h2></header><div>'+xmlItems.map((item,index)=>'<label>'+esc(item.descricao_xml)+' · '+esc(item.quantidade_xml)+' '+esc(item.unidade_xml)+'<select class="tw-field" name="item-'+index+'" required><option value="">Selecione o insumo do pedido</option>'+order.items.map(i=>'<option value="'+esc(i.id)+'" '+(i.codigo===item.codigo_fornecedor?'selected':'')+'>'+esc(i.nome)+'</option>').join('')+'</select></label>').join('')+'</div><footer><button class="btn secondary" type="button" data-cancel>Cancelar</button><button class="btn primary">Confirmar vínculo</button></footer></form>';
      document.body.appendChild(d);let resultado=null;
      d.querySelector('[data-cancel]').onclick=()=>d.close();
      d.querySelector('form').onsubmit=e=>{e.preventDefault();const form=new FormData(e.target);resultado=xmlItems.map((item,index)=>({...item,compras_item_id:form.get('item-'+index)}));d.close();};
      d.addEventListener('close',()=>{d.remove();resolve(resultado);},{once:true});d.showModal();
    });
  }
  const api={
    getClient:()=>({rpc:async(name)=>({error:{message:'Esta ação de entrega terceirizada não se aplica ao Acervo.'}}),from:()=>({select:()=>({maybeSingle:async()=>({data:null})})})}),
    getCompanyProfile:profile,
    getPcpParameters:async()=>({purchase_quotation_lead_days:5}),
    listSuppliers:async()=>{const {data,error}=await query('fornecedores');if(error)throw error;return (data || []).filter(f=>f.status!=='inativo').map(f=>({...f,nome:f.nome_fantasia || f.nome_razao_social,trade_name:f.nome_fantasia,legal_name:f.nome_razao_social}));},
    listSupplierQualityIndex:async()=>{
      const orders=await list('pedido'),rncs=await list('rnc');
      return [...new Set(orders.map(o=>o.fornecedor_id))].map(supplier_id=>{const recebimentos=orders.filter(o=>o.fornecedor_id===supplier_id&&o.status==='recebido').length,com_rnc=rncs.filter(r=>r.fornecedor_id===supplier_id).length;return {supplier_id,recebimentos,com_rnc,indice:recebimentos?Math.max(0,Math.round(100*(recebimentos-com_rnc)/recebimentos)):100};});
    },
    // 16/11/2026: materiais do Almoxarifado novo (warehouse_materials), não mais da tabela antiga insumos
    listWarehouseMaterials:async()=>{const {data,error}=await query('warehouse_materials');if(error)throw error;return (data || []).filter(m=>m.status!=='inativo').sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt-BR')).map(m=>({...m,estoque_atual:m.quantidade_disponivel,status:'ativo'}));},
    listPurchaseNeeds:()=>list('necessidade'),
    listQuotationRequests:()=>list('cotacao'),
    listPurchaseOrdersV2:async()=>(await list('pedido')).map(o=>({...o,op_numeros:[],pendencia_documental:!(o.nfe_receipts || []).length})),
    listPurchaseCompositionQuotes:async()=>[],
    listNeedsInOpenQuotation:async()=>{
      const map=new Map();
      for(const q of await list('cotacao'))if(!['encerrada','cancelada'].includes(q.status))for(const item of q.items || [])if(!item.comprado)for(const n of item.need_allocations || []){
        const numbers=map.get(n.purchase_request_id)||[];if(!numbers.includes(q.numero))numbers.push(q.numero);map.set(n.purchase_request_id,numbers);
      }return map;
    },
    createPurchaseRequest:payload=>run('criar_necessidade',payload),
    linkInternalPurchaseMaterial:(id,material_id)=>run('vincular_material',{id,material_id}),
    findConsolidatableNeeds:async(id,days=30)=>{
      const rows=await list('necessidade'),base=rows.find(n=>n.id===id);if(!base)return [];
      return rows.filter(n=>n.id!==id && n.status==='pendente' && n.material_id===base.material_id && (!n.data_necessidade || !base.data_necessidade || Math.abs(new Date(n.data_necessidade)-new Date(base.data_necessidade))<=days*86400000));
    },
    createQuotationRequest:payload=>run('criar_cotacao',payload),
    getQuotationWorkspace:async id=>{
      const q=await run('consultar',{id});q.items=(q.items || []).filter(i=>!i.comprado);
      const needs=await list('necessidade');
      q.items=q.items.map(item=>({...item,data_necessidade_mais_cedo:(item.need_allocations || []).map(a=>needs.find(n=>n.id===a.purchase_request_id)?.data_necessidade).filter(Boolean).sort()[0],necessidades:(item.need_allocations || []).map(a=>({...a,...needs.find(n=>n.id===a.purchase_request_id)})),respostas:(item.respostas || []).map(r=>({...r,fornecedor_nome:r.supplier_nome,condicao_pagamento:r.header?.condicao_pagamento,frete:r.header?.frete,validade_proposta:r.header?.validade_proposta,observacao:r.header?.observacao}))}));
      for(const s of q.suppliers || [])if(s.header?.documento_original_path)s.header.documento_original_url=await signed(s.header.documento_original_path);
      return q;
    },
    saveQuotationSupplierResponse:(id,supplier_id,header,items)=>run('salvar_proposta',{id,supplier_id,header,items}),
    createPurchaseOrdersFromQuotation:(id,selections)=>run('gerar_pedidos',{id,selections}),
    getPurchaseOrderV2Detail:detail,
    // valores e pagamento do pedido -> Contas a Pagar (out/2026)
    // cartão (nov/2026): com forma 'cartao', o cartão e a data da compra decidem em qual fatura cada parcela cai
    listCreditCards:async()=>{await ready;const {data,error}=await client().rpc('fin_cartoes_lista',{p_empresa:empresa()});if(error)throw Error(error.message);return data||[];},
    setPurchaseOrderPayment:async(id,forma,parcelas,total,cartao=null,compra=null)=>{await ready;const {data,error}=await client().rpc('compras_pedido_pagamento',{p_empresa:empresa(),p_pedido:id,p_forma:forma,p_parcelas:parcelas,p_total:total,p_cartao:forma==='cartao'?cartao:null,p_cartao_compra:forma==='cartao'?compra:null});if(error)throw Error(error.message || 'Não foi possível enviar ao Contas a Pagar.');return data;},
    cancelPurchaseOrderV2:(id,motivo)=>run('cancelar_pedido',{id,motivo}),
    cancelQuotationRequest:(id,motivo)=>run('cancelar_cotacao',{id,motivo}),
    listBillingCompaniesBasic:async()=>{const p=await profile();return {empresas:[{id:empresa(),rotulo:p.nome_fantasia,cnpj:p.cnpj,razao_social:p.razao_social}]};},
    setPurchaseRequestsBillingCompany:async(ids,billing_company_id)=>{for(const id of ids)await run('faturamento',{id,billing_company_id});},
    setPurchaseOrderBillingCompany:(id,billing_company_id)=>run('faturamento',{id,billing_company_id}),
    uploadPurchaseDocument:upload,
    createNfeReceiptDraftForPurchaseOrder:async(id,nota,xmlItems)=>{
      const order=await detail(id);
      let rows=xmlItems.map(i=>({...i,compras_item_id:order.items.find(o=>(o.codigo && o.codigo===i.codigo_fornecedor)||String(o.nome).trim().toLowerCase()===String(i.descricao_xml).trim().toLowerCase())?.id}));
      if(rows.some(i=>!i.compras_item_id))rows=await relacionarXml(order,xmlItems);
      if(!rows)throw Error('Importação cancelada.');
      const items=rows.map(i=>{
        const match=order.items.find(o=>o.id===i.compras_item_id);
        if(!match)throw Error('Insumo não encontrado no pedido.');
        return {...i,insumo_id:match.material_id,material_id:match.material_id,tipo:'insumo',material_nome:match.nome,nome:match.nome,quantidade:i.quantidade_xml,valor_unitario:i.valor_unitario,compras_item_id:match.id};
      });
      const arquivo=await upload(new File([nota.xml_text],nota.nome_arquivo_xml||'nota.xml',{type:'application/xml'}));
      return run('nota_fiscal',{id,nota:{...nota,documento_path:arquivo.path,xml_text:undefined},items});
    },
    // (16/11/2026) tela de divergência copiada da Tecnoweld: decisão no formato dela (decisao_tipo = ação) + crédito gerado
    listReceivingRncs:async()=>{
      const rows=await list('rnc');
      const acoes=['aceitar','abater','devolver_repor','devolver_cancelar'];
      let cred=[];try{const r=await client().from('compras_creditos').select('rnc_id,valor,saldo').eq('empresa_id',empresa());cred=r.data||[];}catch{}
      return rows.map(r=>{const c=cred.find(x=>x.rnc_id===r.id);const t=acoes.includes(r.decisao)?r.decisao:(r.decisao_tipo||null);
        return {...r,criado_em:r.criado_em||r.created_at,decisao_tipo:t,decisao:acoes.includes(r.decisao)?null:r.decisao,credito_valor:c?Number(c.valor):null,credito_saldo:c?Number(c.saldo):null};});
    },
    receivingRncHistory:async id=>{
      const r=(await api.listReceivingRncs()).find(x=>x.id===id);if(!r)return [];
      const ev=[{evento:'aberta',em:r.criado_em||r.created_at,por:r.aberto_por||null,descricao:'Divergência registrada no recebimento'}];
      if(r.status!=='aberta')ev.push({evento:'decisao',em:r.decidido_em||r.resolvido_em,por:r.decidido_por||null,descricao:'Decisão de Compras: '+({aceitar:'Aceitar como está',abater:'Aceitar com abatimento',devolver_repor:'Devolver — fornecedor repõe',devolver_cancelar:'Devolver — comprar de outro'}[r.decisao_tipo]||'resolvida')},{evento:'encerrada',em:r.resolvido_em||r.decidido_em,por:r.decidido_por||null,descricao:'Divergência encerrada'});
      return ev;
    },
    supplierOccurrenceConfig:async()=>({ocorrencias:[],faixas:[]}),
    setReceivingRncType:async()=>({ok:true}),
    resolveReceivingRnc:(id,decisao,observacao,valor)=>run('decidir_rnc',{id,decisao,observacao,valor}),
    saveNfeDivergence:async payload=>{
      await ready;const {data,error}=await client().from('almoxarifado_compras').select('compras_pedido_id,numero_nf').eq('empresa_id',empresa()).eq('id',payload.recebimento_id).single();
      if(error || !data?.compras_pedido_id)throw Error('Recebimento não vinculado ao pedido de compra.');
      return run('criar_rnc',{...payload,id:data.compras_pedido_id,numero_nfe:data.numero_nf});
    },
    openOrderRnc:async order=>new Promise(resolve=>{
      const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const d=document.createElement('dialog');d.className='pv-dialog';
      d.innerHTML='<form class="dialog-card"><header><h2>Registrar divergência no recebimento</h2></header><div><label>Material<select class="tw-field" name="item_id" required>'+order.items.filter(i=>Number(i.quantidade_recebida)>0).map(i=>'<option value="'+esc(i.id)+'">'+esc(i.nome)+'</option>').join('')+'</select></label><label>Quantidade bloqueada<input class="tw-field" name="quantidade" type="number" min="0.001" step="0.001" required></label><label>Problema identificado<textarea class="tw-field" name="descricao" required></textarea></label><p role="alert" data-error></p></div><footer><button class="btn secondary" type="button" data-cancel>Cancelar</button><button class="btn primary">Registrar divergência</button></footer></form>';
      document.body.appendChild(d);d.querySelector('[data-cancel]').onclick=()=>d.close();d.addEventListener('close',()=>{d.remove();resolve();},{once:true});
      d.querySelector('form').onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector('button[type="submit"],button:not([type])');btn.disabled=true;try{await run('criar_rnc',{id:order.id,...Object.fromEntries(new FormData(e.target))});d.close();window.dispatchEvent(new Event('acervo:compras-rnc'));}catch(error){d.querySelector('[data-error]').textContent=error.message;btn.disabled=false;}};d.showModal();
    }),
    // Créditos com fornecedor (16/11/2026, aba Créditos): nascem da divergência no recebimento; abatidos numa conta a pagar
    listSupplierCredits:async()=>{await ready;const {data,error}=await client().rpc('compras_creditos_lista',{p_empresa:empresa()});if(error)throw Error(error.message);return data||[];},
    useSupplierCredit:async(id,valor,titulo,obs)=>{await ready;const {data,error}=await client().rpc('compras_credito_usar',{p_empresa:empresa(),p_id:id,p_valor:valor,p_titulo:titulo||null,p_obs:obs||null});if(error)throw Error(error.message);return data;},
    analyzePurchaseProposal:async({file,quotationItems})=>{
      await ready;
      const fileBase64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});
      const {data:result,error}=await client().functions.invoke('compras-proposta',{body:{empresa_id:empresa(),file_name:file.name,mime_type:file.type,file_base64:fileBase64,quotation_items:quotationItems}});
      if(error || result?.error)throw Error(result?.error || error?.message || 'Não foi possível ler a proposta.');return result;
    }
  };
  window.AcervoComprasAPI=api;
})();
