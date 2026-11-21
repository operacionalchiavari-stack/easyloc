(function(){
 'use strict';
 // Dados locais para experimentar as mesmas consultas e movimentações da tela.
 function criar({empresa,hoje}={}){
  hoje=hoje||new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const copiar=v=>JSON.parse(JSON.stringify(v));
  const dia=n=>{const d=new Date(hoje+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const instante=n=>dia(n)+'T15:00:00Z';
  const modelos=[
   ['cadeira','Cadeira Chiavari','capa',2,32.5,60,20],
   ['sofa','Sofá de linho','capa',1,95,12,4],
   ['mesa','Mesa redonda','capa',1,48,18,0],
   ['poltrona','Poltrona de veludo','capa',1,64,null,3],
   ['tacas','Taças de vidro','caixa',6,85,24,6],
   ['banco','Banco estofado','capa',2,42,20,10]
  ].map(([id,item,tipo,capacidade,custo,inicial,fabricadas])=>({id:'exemplo-'+id,item_id:'item-exemplo-'+id,empresa_id:empresa,item_nome:item,nome:(tipo==='caixa'?'Caixa ':'Capa ')+item,tipo_material:tipo,usa_capa:true,unidades_por_capa:capacidade,custo,foto_url:'',estoque_conferido_em:inicial==null?null:instante(-40),inicial,fabricadas}));
  const movimentos=[],conferencias=[],pedidos=new Map(),chaves=new Map();let sequencia=0;
  function adicionar(m,tipo,quantidade,dias,observacao,dd=0,dm=0,extra={}){
   const r={id:'mov-exemplo-'+(++sequencia),modelo_id:m.id,tipo,quantidade,data:dia(dias),criado_em:instante(dias),observacao,delta_disponivel:dd,delta_manutencao:dm,...extra};
   movimentos.push(r);return r;
  }
  modelos.forEach(m=>{
   if(m.inicial!=null)adicionar(m,'inventario',m.inicial,-40,'Contagem inicial das unidades boas disponíveis no galpão.',m.inicial);
   if(m.fabricadas)adicionar(m,'fabricacao',m.fabricadas,-21,'Lote novo produzido pela costura e conferido no galpão.',m.fabricadas);
  });
  function pedido(id,numero,cliente,equipe){pedidos.set(id,{id,numero,cliente,equipe:equipe.map((nome,i)=>({nome,papel:i===0?'responsavel':'equipe',funcionario_id:'pessoa-exemplo-'+nome.replace(/\s/g,'-'),free_id:null}))});}
  pedido('pedido-exemplo-1801','1801','Evento Jardim das Flores',['João Pereira','Bruno Silva']);
  pedido('pedido-exemplo-1802','1802','Recepção Villa do Lago',['Marcelo Dias','Rafael Souza']);
  pedido('pedido-exemplo-1803','1803','Celebração Casa Aurora',['João Pereira','Bruno Silva','Lucas Alves']);
  pedido('pedido-exemplo-1804','1804','Festa Espaço Primavera',['Marcelo Dias','Lucas Alves']);
  function contar(m,pedido_id,etapa,quantidade,esperado,dias,danificadas=0,concluida=true){
   const c={id:'contagem-exemplo-'+(++sequencia),modelo_id:m.id,pedido_id,pedido_numero:pedidos.get(pedido_id).numero,etapa,quantidade,esperado,danificadas,observacao:danificadas?'Separadas para reparo após a devolução.':'Conferência registrada pela equipe.',contado_em:instante(dias),concluida_em:concluida?instante(dias):null};conferencias.push(c);return c;
  }
  const [cadeira,sofa,mesa,,tacas,banco]=modelos;
  contar(cadeira,'pedido-exemplo-1801','triagem',20,20,-14);contar(cadeira,'pedido-exemplo-1801','carregamento',20,20,-13);
  contar(cadeira,'pedido-exemplo-1801','descarregamento',18,20,-11);const loteCadeiras=contar(cadeira,'pedido-exemplo-1801','retorno',17,20,-10,2);
  adicionar(cadeira,'perda_pedido',3,-10,'Confirmadas as três unidades não devolvidas do pedido 1801.',0,0,{pedido_id:'pedido-exemplo-1801'});
  adicionar(cadeira,'reparo',1,-6,'Capa do pedido 1801 reparada e liberada.',1,-1,{contagem_origem_id:loteCadeiras.id,pedido_id:'pedido-exemplo-1801'});
  adicionar(cadeira,'perda',1,-5,'Capa antiga sem possibilidade de reaproveitamento.',-1);
  contar(cadeira,'pedido-exemplo-1804','triagem',9,9,-3);contar(cadeira,'pedido-exemplo-1804','carregamento',8,9,-2);
  contar(sofa,'pedido-exemplo-1802','triagem',4,4,-12);contar(sofa,'pedido-exemplo-1802','carregamento',4,4,-11);
  contar(sofa,'pedido-exemplo-1802','descarregamento',4,4,-9);contar(sofa,'pedido-exemplo-1802','retorno',4,4,-8,1);
  adicionar(sofa,'manutencao',2,-7,'Reforço de costura em duas capas do galpão.',-2,2);
  adicionar(sofa,'reparo',1,-5,'Reparo concluído em uma capa do galpão.',1,-1);
  adicionar(sofa,'perda_manutencao',1,-4,'Tecido sem recuperação após avaliação da costura.',0,-1);
  contar(mesa,'pedido-exemplo-1804','triagem',3,3,-3);contar(mesa,'pedido-exemplo-1804','carregamento',3,3,-2);
  contar(tacas,'pedido-exemplo-1803','triagem',6,6,-10);contar(tacas,'pedido-exemplo-1803','carregamento',6,6,-9);
  contar(tacas,'pedido-exemplo-1803','descarregamento',5,6,-7);contar(tacas,'pedido-exemplo-1803','retorno',5,6,-6);
  // Uma falta ainda não confirmada permite testar o botão Registrar perda na aba Conferências.
  contar(banco,'pedido-exemplo-1804','triagem',6,6,-1,0,false);
  function saldo(m){
   const mov=movimentos.filter(x=>x.modelo_id===m.id),cont=conferencias.filter(c=>c.modelo_id===m.id&&c.concluida_em);
   const somar=(lista,fn)=>lista.reduce((n,x)=>n+fn(x),0),enviadas=somar(cont,c=>c.etapa==='carregamento'?c.quantidade:0),retornadas=somar(cont,c=>c.etapa==='retorno'?c.quantidade:0),danificadas=somar(cont,c=>c.etapa==='retorno'?c.danificadas:0);
   return {disponivel:somar(mov,x=>x.delta_disponivel)-enviadas+retornadas-danificadas,manutencao:somar(mov,x=>x.delta_manutencao)+danificadas,em_pedidos:Math.max(0,enviadas-retornadas-somar(mov,x=>x.tipo==='perda_pedido'?x.quantidade:0)),ultima_fabricacao:mov.filter(x=>x.tipo==='fabricacao').map(x=>x.data).sort().at(-1)||null};
  }
  function movimentar(a){
   const m=modelos.find(m=>m.id===a.p_modelo),q=a.p_quantidade,t=a.p_tipo,obs=String(a.p_observacao||'').trim(),dataMov=new Date(a.p_data+'T12:00:00Z');
   if(!m)throw Error('Material não encontrado nos exemplos.');
   if(!Number.isInteger(q)||q<0||q>1000000||!a.p_chave||!/^\d{4}-\d{2}-\d{2}$/.test(a.p_data||'')||!Number.isFinite(dataMov.getTime())||dataMov.toISOString().slice(0,10)!==a.p_data||a.p_data>hoje||obs.length<3||obs.length>500)throw Error('Confira quantidade, data e descrição da movimentação.');
   if(chaves.has(a.p_chave))return saldo(m);
   if(t!=='inventario'&&q===0)throw Error('Informe uma quantidade maior que zero.');
   const s=saldo(m);let dd=0,dm=0,pedido_id=a.p_pedido||null;
   if(['manutencao','perda'].includes(t)&&q>s.disponivel)throw Error('Saldo disponível insuficiente. Confira a quantidade.');
   if(['reparo','perda_manutencao'].includes(t)){
    if(q>s.manutencao)throw Error('Saldo em manutenção insuficiente.');
    const lotes=conferencias.filter(c=>c.modelo_id===m.id&&c.etapa==='retorno'&&c.concluida_em&&c.danificadas>0);
    const pendente=c=>c.danificadas-movimentos.filter(x=>x.contagem_origem_id===c.id).reduce((n,x)=>n+x.quantidade,0);
    if(a.p_contagem){const lote=lotes.find(c=>c.id===a.p_contagem);if(!lote||q>pendente(lote))throw Error('Quantidade maior que o saldo deste lote em manutenção.');pedido_id=lote.pedido_id;}
    else if(q>s.manutencao-lotes.reduce((n,c)=>n+pendente(c),0))throw Error('Selecione o lote do pedido ao tratar materiais devolvidos danificados.');
   }
   switch(t){
    case 'fabricacao':dd=q;break;
    case 'inventario':dd=q-s.disponivel;break;
    case 'manutencao':dd=-q;dm=q;break;
    case 'reparo':dd=q;dm=-q;break;
    case 'perda':dd=-q;break;
    case 'perda_manutencao':dm=-q;break;
    case 'perda_pedido':{
     const saida=conferencias.find(c=>c.modelo_id===m.id&&c.pedido_id===pedido_id&&c.etapa==='carregamento'&&c.concluida_em),volta=conferencias.find(c=>c.modelo_id===m.id&&c.pedido_id===pedido_id&&c.etapa==='retorno'&&c.concluida_em);
     const confirmadas=movimentos.filter(x=>x.modelo_id===m.id&&x.pedido_id===pedido_id&&x.tipo==='perda_pedido').reduce((n,x)=>n+x.quantidade,0);
     if(!saida||!volta||q>saida.quantidade-volta.quantidade-confirmadas)throw Error('A perda excede o material não devolvido deste pedido.');break;
    }
    default:throw Error('Tipo de movimentação inválido.');
   }
   const registro=adicionar(m,t,q,0,obs,dd,dm,{data:a.p_data,pedido_id,contagem_origem_id:a.p_contagem||null});chaves.set(a.p_chave,registro.id);
   if(t==='inventario')m.estoque_conferido_em=instante(0);
   return saldo(m);
  }
  function perdas(a){
   return conferencias.filter(c=>c.etapa==='descarregamento'&&c.concluida_em&&c.concluida_em.slice(0,10)>=(a.p_de||'')&&c.concluida_em.slice(0,10)<=(a.p_ate||hoje)).map(c=>{
    const m=modelos.find(m=>m.id===c.modelo_id),p=pedidos.get(c.pedido_id),saida=conferencias.find(x=>x.pedido_id===c.pedido_id&&x.modelo_id===c.modelo_id&&x.etapa==='carregamento'&&x.concluida_em),volta=conferencias.find(x=>x.pedido_id===c.pedido_id&&x.modelo_id===c.modelo_id&&x.etapa==='retorno'&&x.concluida_em);
    const no_evento=Math.max(0,(saida?.quantidade||0)-c.quantidade),no_galpao=volta?Math.max(0,c.quantidade-volta.quantidade):0;
    return {pedido_id:p.id,numero:p.numero,cliente:p.cliente,data:c.concluida_em.slice(0,10),item:m.item_nome,modelo:m.nome,tipo:m.tipo_material,custo:m.custo,saiu:saida?.quantidade||0,descarregou:c.quantidade,voltou:volta?.quantidade??null,no_evento,no_galpao,valor_evento:Math.round(no_evento*m.custo*100)/100,valor_galpao:Math.round(no_galpao*m.custo*100)/100,equipe:p.equipe};
   }).filter(p=>p.no_evento||p.no_galpao).sort((a,b)=>b.data.localeCompare(a.data));
  }
  return {rpc(nome,a={}){
   if(empresa&&a.p_empresa!==empresa)throw Error('Empresa inválida para estes exemplos.');
   let r;
   switch(nome){
    case 'capas_pode':r=true;break;
    case 'capas_estoque':r=modelos.map(({inicial,fabricadas,...m})=>({...m,saldo:saldo(m)})).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));break;
    case 'capas_historico_listar':{
     if(!modelos.some(m=>m.id===a.p_modelo))throw Error('Material não encontrado nos exemplos.');
     r={movimentos:movimentos.filter(x=>x.modelo_id===a.p_modelo).slice().sort((a,b)=>b.data.localeCompare(a.data)||b.id.localeCompare(a.id)),conferencias:conferencias.filter(c=>c.modelo_id===a.p_modelo),alteracoes:[]};break;
    }
    case 'material_movimentar':r=movimentar(a);break;
    case 'capas_perdas_equipe':r=perdas(a);break;
    default:throw Error('Operação indisponível na demonstração.');
   }
   return copiar(r);
  }};
 }
 window.CapasExemplos={criar};
})();
