const {test}=require('node:test'),assert=require('node:assert/strict');
const {contexto,propostas,recebimento}=require('../Modulos/Estoque/Compras/compras-listas.js');
const hoje='2026-11-16';
const cotacao=()=>({items:[{id:'a',nome:'Tecido',quantidade_cotada:10,respostas:[{supplier_id:'f1',valor_unitario:5},{supplier_id:'f2',valor_unitario:4},{supplier_id:'f3',valor_unitario:1},{supplier_id:'f4',valor_unitario:1}]},{id:'b',nome:'Cola',quantidade_cotada:2,respostas:[{supplier_id:'f1',valor_unitario:20},{supplier_id:'f2',valor_unitario:30},{supplier_id:'f3',nao_cotado:true},{supplier_id:'f4',valor_unitario:1}]}],suppliers:[{supplier_id:'f1',nome:'Loja A',status:'respondido',header:{frete:20,desconto:5}},{supplier_id:'f2',nome:'Loja B',status:'respondido',header:{frete:10}},{supplier_id:'f3',nome:'Loja parcial',status:'respondido',header:{frete:0}},{supplier_id:'f4',nome:'Loja vencida',status:'respondido',header:{validade_proposta:'2026-11-15'}},{supplier_id:'f5',nome:'Sem resposta',status:'aguardando'}]});
test('compara o mesmo conjunto de itens com frete e desconto, exclui propostas parciais e vencidas',()=>{
 const p=propostas(cotacao(),hoje);
 assert.deepEqual(p.totais,[{fornecedor:'Loja A',total:105},{fornecedor:'Loja B',total:110}]);
 assert.equal(p.parciais,1);assert.equal(p.vencidas,1);assert.equal(p.pendentes,1);assert.match(p.acao,/Cobrar 1/);
});
test('distingue cotação parcialmente comprada e pede complementação ou renovação quando falta preço',()=>{
 const q=cotacao();q.items[0].comprado=true;assert.equal(propostas(q,hoje).parcial,true);
 q.suppliers=q.suppliers.filter(s=>s.supplier_id==='f4');assert.equal(propostas(q,hoje).acao,'Renovar propostas');
 q.suppliers=[{supplier_id:'f3',status:'respondido'}];assert.equal(propostas(q,hoje).acao,'Completar cotação');
 q.items[1].comprado='true';assert.equal(propostas(q,hoje).acao,'Itens já comprados');
});
test('mantém preços válidos até o último dia e não transforma item não cotado em preço zero',()=>{
 const q=cotacao();q.suppliers[3].header.validade_proposta=hoje;
 assert.equal(propostas(q,hoje).vencidas,0);assert.equal(propostas(q,hoje).totais[0].total,12);
 q.items[0].respostas.forEach(r=>r.nao_cotado='true');assert.deepEqual(propostas(q,hoje).totais,[]);
 assert.doesNotThrow(()=>propostas({},hoje));
});
test('resolve solicitantes e destinos sem duplicar vínculos ou atribuir o comprador como solicitante',()=>{
 const n={id:'n',solicitante_nome:'Ana',criado_por:'ana',setor_nome:'Costura',order_number:'1801',cliente_nome:'Cliente Jardim'};
 const i={need_allocations:[{purchase_request_id:'n'}],allocations:[{purchase_request_id:'n'}]};
 assert.deepEqual(contexto({items:[i,i]},[n]),{pessoas:[{id:'ana',nome:'Ana',setor:'Costura'}],destinos:[{nome:'Pedido 1801',detalhe:'Cliente Jardim'}]});
 assert.deepEqual(contexto({destino:'locacao',comprador_nome:'Comprador',items:[]},[]),{pessoas:[],destinos:[{nome:'Acervo de locação',detalhe:''}]});
 assert.equal(contexto({items:[{allocations:[{origem:'manutencao',local:'Galpão 2'}]}]},[]).destinos[0].detalhe,'Galpão 2');
});
test('preserva unidades e recebimentos parciais por item',()=>{
 const r=recebimento({items:[{nome:'Tecido',unidade:'m',quantidade:'10',quantidade_recebida:'4'},{nome:'Cola',unidade:'kg',quantidade:2,quantidade_recebida:2}]});
 assert.deepEqual(r,{completos:1,itens:[{nome:'Tecido',unidade:'m',comprado:10,recebido:4},{nome:'Cola',unidade:'kg',comprado:2,recebido:2}]});
});
