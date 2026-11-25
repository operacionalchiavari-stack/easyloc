/* Indicadores de Compras. Valores monetários em centavos; quantidades sempre por unidade. */
(function(root){
  'use strict';
  const lista=v=>Array.isArray(v)?v:[], n=v=>Number.isFinite(Number(v))?Number(v):0;
  const centavos=v=>Math.round(n(v)*100), soma=(xs,k)=>xs.reduce((s,x)=>s+n(x[k]),0);
  const normal=v=>String(v||'').trim().toLocaleLowerCase('pt-BR');
  const cancelado=o=>['cancelado','cancelada'].includes(o.status);
  const dia=v=>{
    const s=String(v||'');
    if(s.includes('T')){const d=new Date(s);return Number.isFinite(+d)?d.toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}):'';}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
    const d=new Date(s+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?s:'';
  };
  const dataPedido=o=>dia(o.data_compra)||dia(o.created_at)||dia(o.criado_em);
  const fornecedor=o=>String(o.fornecedor_id||o.fornecedor?.id||normal(o.fornecedor_nome||o.fornecedor?.nome)||'sem-fornecedor');
  const nomeFornecedor=o=>o.fornecedor_nome||o.fornecedor?.nome||'Fornecedor não informado';
  const dataEntre=(d,f)=>Boolean(d&&(!f.de||d>=f.de)&&(!f.ate||d<=f.ate));
  const distintos=xs=>[...new Map(xs.map((x,i)=>[x.id||'sem-id-'+i,x])).values()];
  const destinoNome=k=>({almoxarifado:'Almoxarifado e insumos',locacao:'Acervo de locação',estoque:'Estoque',manutencao:'Manutenção',servico:'Serviços',uso_interno:'Uso interno'}[k]||k||'Não informado');
  const origemNome=k=>({operacional:'Operação / eventos',solicitacao:'Solicitações de compra',manutencao:'Manutenção',op_faltando:'Operação / eventos',ferramental:'Ferramentas',minimo:'Reposição de estoque',estoque_minimo:'Reposição de estoque',cartela:'Personalização'}[k]||k||'Sem vínculo informado');
  function repartir(total,pesos){
    const positivos=pesos.map(p=>Math.max(0,n(p))),s=positivos.reduce((a,b)=>a+b,0);
    if(!pesos.length)return [];
    const partes=positivos.map((p,i)=>{const bruto=total*(s?p/s:1/pesos.length);return {i,v:Math.floor(bruto),resto:bruto-Math.floor(bruto)};});
    let falta=total-partes.reduce((a,p)=>a+p.v,0);
    for(const p of [...partes].sort((a,b)=>b.resto-a.resto||a.i-b.i)){if(falta--<=0)break;p.v++;}
    return partes.map(p=>p.v);
  }
  function itensPedido(o,necessidades){
    return lista(o.items).map(i=>{
      const vinculos=[...lista(i.need_allocations),...lista(i.allocations),...lista(i.necessidades)].map(a=>necessidades.get(a.purchase_request_id||a.id)||a);
      const origens=[...new Set(vinculos.map(a=>a.origem).filter(Boolean))];
      const destinos=[...new Set(vinculos.map(a=>a.destino).filter(Boolean))];
      const unidade=normal(i.unidade)||'un',nome=i.nome||i.material_nome||'Item não informado';
      const quantidade=Math.max(0,n(i.quantidade)),recebida=Math.min(quantidade,Math.max(0,n(i.quantidade_recebida)));
      return {chave:String(i.material_id||i.item_id||i.codigo||normal(nome))+'|'+unidade,nome,unidade,quantidade,recebida,
        valor:Math.max(0,i.valor_total!=null?centavos(i.valor_total):centavos(quantidade*n(i.valor_unitario))),
        destino:destinoNome(i.destino||o.destino||(destinos.length===1?destinos[0]:destinos.length>1?'Destinos mistos':'')),
        origem:o.registro_direto?'Compra direta':origens.length===1?origemNome(origens[0]):origens.length>1?'Demandas mistas':o.quotation_id?'Cotação sem vínculo informado':'Sem vínculo informado'};
    });
  }
  function calcular(dados,f={}){
    const hoje=dia(f.hoje)||new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
    const necessidades=new Map(lista(dados.necessidades).map(x=>[x.id,x]));
    const todas=distintos(lista(dados.pedidos)).map(o=>({...o,data:dataPedido(o),chaveFornecedor:fornecedor(o),nomeFornecedor:nomeFornecedor(o),valor:Math.max(0,centavos(o.valor_total)),itens:itensPedido(o,necessidades)}));
    const filtroFornecedor=o=>!f.fornecedor||o.chaveFornecedor===f.fornecedor;
    const base=todas.filter(o=>dataEntre(o.data,f)&&filtroFornecedor(o));
    const pedidos=base.filter(o=>!cancelado(o)),ids=new Set(pedidos.map(o=>o.id)),porId=new Map(pedidos.map(o=>[o.id,o]));
    const porFornecedor=new Map(),porItem=new Map(),porDestino=new Map(),porOrigem=new Map(),porMes=new Map(),porComprador=new Map();
    const grupo=(m,k,nome)=>{if(!m.has(k))m.set(k,{chave:k,nome:nome||k,valor:0,pedidos:new Set()});return m.get(k);};
    const entrega=o=>{
      if(o.status==='recebido')return 'Recebidos';
      const pendentes=o.itens.some(i=>i.recebida+1e-9<i.quantidade),prazo=dia(o.prazo_acordado||o.previsao_entrega);
      if(prazo&&prazo<hoje&&(pendentes||!o.itens.length))return 'Entrega atrasada';
      if(o.itens.length&&o.itens.every(i=>i.quantidade>0&&i.recebida>=i.quantidade))return 'Recebidos';
      if(o.itens.some(i=>i.recebida>0)||['parcialmente_recebido','recebido_parcial'].includes(o.status))return 'Recebidos em parte';
      return 'Aguardando recebimento';
    };
    const porEntrega=new Map();let brutoItens=0,frete=0,descontos=0,diretas=0,semNota=0;
    for(const o of pedidos){
      o.entrega=entrega(o);o.semNota=!o.numero_nf&&!o.numero_nfe&&!lista(o.nfe_receipts).length;
      if(o.semNota)semNota++;
      const g=grupo(porFornecedor,o.chaveFornecedor,o.nomeFornecedor);g.valor+=o.valor;g.pedidos.add(o.id);g.atrasados=(g.atrasados||0)+(o.entrega==='Entrega atrasada'?1:0);
      const comprador=grupo(porComprador,o.criado_por||o.comprador_id||normal(o.comprador_nome)||'sem-responsavel',o.comprador_nome||'Responsável não informado');comprador.valor+=o.valor;comprador.pedidos.add(o.id);
      if(o.registro_direto)diretas+=o.valor;
      frete+=Math.max(0,centavos(o.frete));descontos+=Math.max(0,centavos(o.desconto));
      for(const m of [grupo(porMes,o.data.slice(0,7)),grupo(porEntrega,o.entrega)]){m.valor+=o.valor;m.pedidos.add(o.id);}
      const semValores=o.itens.length&&o.valor>0&&!o.itens.some(i=>i.valor>0);
      const rateio=semValores?o.itens.map(()=>0):repartir(o.valor,o.itens.map(i=>i.valor));
      if(semValores)for(const m of [grupo(porDestino,'Sem valores para rateio'),grupo(porOrigem,'Sem valores para rateio')]){m.valor+=o.valor;m.pedidos.add(o.id);}
      if(!o.itens.length){for(const m of [grupo(porDestino,destinoNome(o.destino)),grupo(porOrigem,o.registro_direto?'Compra direta':'Sem itens informados')]){m.valor+=o.valor;m.pedidos.add(o.id);}}
      o.itens.forEach((i,j)=>{
        const a=grupo(porItem,i.chave,i.nome);a.unidade=i.unidade;a.quantidade=(a.quantidade||0)+i.quantidade;a.valor+=i.valor;a.pedidos.add(o.id);brutoItens+=i.valor;
        for(const m of [grupo(porDestino,i.destino),grupo(porOrigem,i.origem)]){m.valor+=rateio[j];m.pedidos.add(o.id);}
      });
    }
    const grupos=m=>[...m.values()].map(g=>({...g,ids:[...g.pedidos],pedidos:g.pedidos.size})).sort((a,b)=>b.valor-a.valor||a.nome.localeCompare(b.nome,'pt-BR'));
    const fornecedores=grupos(porFornecedor),itens=grupos(porItem);
    const rncs=dados.rncs==null?null:distintos(lista(dados.rncs)).filter(r=>ids.has(r.order_id||r.pedido_id||r.compras_pedido_id));
    const temRnc=new Set(lista(rncs).map(r=>r.order_id||r.pedido_id||r.compras_pedido_id));
    fornecedores.forEach(g=>g.divergencias=g.ids.filter(id=>temRnc.has(id)).length);
    const contas=dados.contas==null?null:distintos(lista(dados.contas)).filter(t=>ids.has(t.origem_id)&&t.origem==='compra'&&t.status!=='cancelado');
    let financeiro=null;
    if(contas){
      const comConta=new Set(contas.map(t=>t.origem_id));
      financeiro={pago:0,compensado:0,aberto:0,vencido:0,aVencer:0,contas:contas.length,semConta:pedidos.filter(o=>!comConta.has(o.id)).length,porPrazo:[]};
      const faixas=new Map(['Vencido','Vence hoje','Próximos 7 dias','De 8 a 30 dias','Após 30 dias','Sem vencimento'].map(k=>[k,0]));
      for(const t of contas){
        const pago=Math.max(0,centavos(t.pago)),aberto=Math.max(0,centavos(t.aberto)),compensado=Math.max(0,centavos(t.compensado));
        const data=dia(t.programado_para)||dia(t.vencimento),dias=data?Math.round((Date.parse(data+'T12:00:00Z')-Date.parse(hoje+'T12:00:00Z'))/864e5):null;
        financeiro.pago+=pago;financeiro.compensado+=compensado;financeiro.aberto+=aberto;
        if(dias!=null&&dias<0)financeiro.vencido+=aberto;
        const faixa=dias==null?'Sem vencimento':dias<0?'Vencido':dias===0?'Vence hoje':dias<=7?'Próximos 7 dias':dias<=30?'De 8 a 30 dias':'Após 30 dias';
        faixas.set(faixa,faixas.get(faixa)+aberto);
        const g=porFornecedor.get(porId.get(t.origem_id).chaveFornecedor);g.aberto=(g.aberto||0)+aberto;g.pago=(g.pago||0)+pago;
      }
      financeiro.aVencer=financeiro.aberto-financeiro.vencido;financeiro.porPrazo=[...faixas].map(([nome,valor])=>({nome,valor}));
      fornecedores.forEach(g=>Object.assign(g,{aberto:porFornecedor.get(g.chave).aberto||0,pago:porFornecedor.get(g.chave).pago||0}));
    }
    const cotacoes=dados.cotacoes==null?null:distintos(lista(dados.cotacoes)).filter(q=>dataEntre(dia(q.created_at||q.criado_em),f)&&(!f.fornecedor||lista(q.suppliers).some(s=>String(s.supplier_id||s.id)===f.fornecedor)));
    const negociacao=cotacoes?{total:cotacoes.length,abertas:cotacoes.filter(q=>!['cancelada','encerrada','cancelado','encerrado'].includes(q.status)).length,convites:0,respostas:0,concorrencia:0}:null;
    if(negociacao)for(const q of cotacoes){const sups=lista(q.suppliers);negociacao.convites+=sups.length||n(q.fornecedores_count);const respondidos=sups.length?sups.filter(s=>s.status==='respondido').length:n(q.respostas_count);negociacao.respostas+=respondidos;if(respondidos>=2)negociacao.concorrencia++;}
    const creditos=dados.creditos==null?null:lista(dados.creditos).filter(c=>(!f.fornecedor||String(c.fornecedor_id)===f.fornecedor)&&c.status==='aberto'&&n(c.saldo)>0).map(c=>({...c,valor:centavos(c.valor),saldo:centavos(c.saldo)}));
    const pendentes=pedidos.filter(o=>o.entrega!=='Recebidos').sort((a,b)=>(dia(a.prazo_acordado||a.previsao_entrega)||'9999').localeCompare(dia(b.prazo_acordado||b.previsao_entrega)||'9999'));
    let anterior=null;
    if(dia(f.de)&&dia(f.ate)){
      const ateAnterior=new Date(Date.parse(f.de+'T12:00:00Z')-864e5),dias=Math.round((Date.parse(f.ate+'T12:00:00Z')-Date.parse(f.de+'T12:00:00Z'))/864e5)+1;
      const deAnterior=new Date(+ateAnterior-(dias-1)*864e5),periodo={de:deAnterior.toISOString().slice(0,10),ate:ateAnterior.toISOString().slice(0,10)};
      const ps=todas.filter(o=>!cancelado(o)&&filtroFornecedor(o)&&dataEntre(o.data,periodo));
      anterior={...periodo,valor:soma(ps,'valor'),pedidos:ps.length};
    }
    const total=soma(pedidos,'valor');
    return {periodo:{de:f.de,ate:f.ate,hoje},pedidos,total,quantidade:pedidos.length,ticket:pedidos.length?total/pedidos.length:null,fornecedores,itens,brutoItens,
      destinos:grupos(porDestino),origens:grupos(porOrigem),compradores:grupos(porComprador),meses:grupos(porMes).sort((a,b)=>a.nome.localeCompare(b.nome)),entregas:grupos(porEntrega),pendentes,
      atrasados:pedidos.filter(o=>o.entrega==='Entrega atrasada'),rncs,comRnc:temRnc.size,financeiro,negociacao,creditos,creditoDisponivel:creditos?soma(creditos,'saldo'):null,
      cancelados:base.filter(cancelado).length,semData:todas.filter(o=>!o.data&&filtroFornecedor(o)).length,semNota,diretas,frete,descontos,
      ajustes:total-brutoItens-frete+descontos,anterior,concentracao:total?fornecedores.slice(0,3).reduce((s,g)=>s+g.valor,0)/total:null,
      opcoesFornecedores:[...new Map(todas.map(o=>[o.chaveFornecedor,{id:o.chaveFornecedor,nome:o.nomeFornecedor}])).values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))};
  }
  const api={calcular,dia,dataPedido,repartir};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ComprasGerencialDados=api;
})(typeof window==='object'?window:globalThis);
