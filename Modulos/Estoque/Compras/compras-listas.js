(function(root){
  'use strict';
  const lista=v=>Array.isArray(v)?v:[];
  const numero=v=>Number.isFinite(Number(v))?Number(v):0;
  const comprado=i=>i.comprado===true||i.comprado==='true';
  const destinos={almoxarifado:'Almoxarifado',locacao:'Acervo de locação',estoque:'Estoque'};
  function contexto(registro,necessidades){
    const mapa=new Map(lista(necessidades).map(n=>[n.id,n])),vinculos=new Map();
    for(const item of lista(registro.items)){
      for(const n of [...lista(item.need_allocations),...lista(item.allocations),...lista(item.necessidades)]){
        const id=n.purchase_request_id||n.id;
        vinculos.set(id||JSON.stringify(n),{...n,...(mapa.get(id)||{})});
      }
    }
    const pessoas=new Map(),locais=new Map();
    for(const n of vinculos.values()){
      if(n.solicitante_nome)pessoas.set(n.criado_por||n.solicitante_nome,{id:n.criado_por,nome:n.solicitante_nome,setor:n.setor_nome||''});
      let nome,detalhe;
      if(n.order_number){nome='Pedido '+n.order_number;detalhe=n.cliente_nome||n.pedido_cliente||n.local_nome||'';}
      else if(n.pedido_destino){nome=n.pedido_destino;detalhe=n.setor_nome||'';}
      else if(n.origem==='manutencao'){nome='Manutenção';detalhe=n.local||n.local_nome||n.setor_nome||'';}
      else if(n.origem||n.setor_nome){nome=destinos[n.destino]||n.destino||'Uso interno';detalhe=n.setor_nome||n.motivo||'';}
      else continue;
      locais.set(nome+'|'+detalhe,{nome,detalhe});
    }
    if(!pessoas.size&&registro.solicitante_nome)pessoas.set('registro',{id:registro.criado_por,nome:registro.solicitante_nome,setor:registro.setor_nome||''});
    if(!locais.size){
      const dest=registro.destino||lista(registro.items).find(i=>i.destino)?.destino;
      if(dest)locais.set(dest,{nome:destinos[dest]||dest,detalhe:''});
      else for(const n of lista(registro.op_numeros))locais.set(n,{nome:'Pedido '+n,detalhe:''});
    }
    return {pessoas:[...pessoas.values()],destinos:[...locais.values()]};
  }
  function propostas(q,hoje){
    const todos=lista(q.items),itens=todos.filter(i=>!comprado(i)),fornecedores=lista(q.suppliers);
    const totalFornecedores=fornecedores.length||numero(q.fornecedores_count);
    const respondidos=fornecedores.length?fornecedores.filter(s=>s.status==='respondido').length:numero(q.respostas_count);
    const pendentes=Math.max(0,totalFornecedores-respondidos),totais=[],cobertos=new Set();
    let parciais=0,vencidas=0;
    for(const s of fornecedores.filter(s=>s.status==='respondido')){
      const respostas=itens.map(i=>lista(i.respostas).find(r=>r.supplier_id===s.supplier_id));
      const header=s.header||respostas.find(Boolean)?.header||{};
      if(header.validade_proposta&&header.validade_proposta.slice(0,10)<hoje){vencidas++;continue;}
      let valor=0,quantos=0;
      itens.forEach((i,n)=>{
        const r=respostas[n];
        if(!r||r.nao_cotado===true||r.nao_cotado==='true'||numero(r.valor_unitario)<=0||numero(i.quantidade_cotada)<=0)return;
        valor+=numero(r.valor_unitario)*numero(i.quantidade_cotada);quantos++;cobertos.add(i.id||n);
      });
      if(quantos&&quantos===itens.length){
        const total=valor+numero(header.frete)-numero(header.desconto);
        if(total>=0)totais.push({fornecedor:s.nome,total:Math.round(total*100)/100});
      }else if(quantos)parciais++;
    }
    totais.sort((a,b)=>a.total-b.total);
    const parcial=todos.some(comprado);
    let acao='Comparar propostas',detalhe='Escolha os fornecedores para os itens pendentes.';
    if(!itens.length&&todos.length){acao='Itens já comprados';detalhe='Consulte os pedidos gerados.';}
    else if(vencidas&&cobertos.size<itens.length){acao='Renovar propostas';detalhe=vencidas+' proposta(s) vencida(s).';}
    else if(pendentes){acao='Cobrar '+pendentes+' fornecedor(es)';detalhe=respondidos+' de '+totalFornecedores+' responderam.';}
    else if(cobertos.size<itens.length){acao='Completar cotação';detalhe=(itens.length-cobertos.size)+' item(ns) sem preço válido.';}
    else if(!todos.length){acao='Abrir cotação';detalhe='Confira os itens e as propostas.';}
    return {itens,fornecedores,totalFornecedores,respondidos,pendentes,totais,parciais,vencidas,parcial,acao,detalhe};
  }
  function recebimento(o){
    const itens=lista(o.items).map(i=>({nome:i.nome||i.material_nome||'Item',unidade:i.unidade||'un',comprado:numero(i.quantidade),recebido:numero(i.quantidade_recebida)}));
    return {itens,completos:itens.filter(i=>i.comprado>0&&i.recebido>=i.comprado).length};
  }
  const api={contexto,propostas,recebimento};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ComprasListas=api;
})(typeof window==='object'?window:globalThis);
