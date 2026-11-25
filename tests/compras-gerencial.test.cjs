const {test}=require('node:test'),assert=require('node:assert/strict');
const {calcular,repartir,dataPedido}=require('../Modulos/Estoque/Compras/compras-gerencial-dados.js');
const periodo={de:'2026-11-01',ate:'2026-11-30',hoje:'2026-11-22'};
const itens=[{material_id:'madeira',nome:'Madeira',unidade:'m',quantidade:10,quantidade_recebida:5,valor_unitario:10,destino:'almoxarifado',allocations:[{purchase_request_id:'n1'}]},{material_id:'cadeira',nome:'Cadeira',unidade:'un',quantidade:2,quantidade_recebida:2,valor_total:100,destino:'locacao'}];
const pedido=(id,extra={})=>({id,numero:id,created_at:'2026-11-05T16:00:00Z',fornecedor_id:'f1',fornecedor_nome:'Fornecedor A',status:'aguardando_recebimento',valor_total:210,frete:20,desconto:10,prazo_acordado:'2026-11-15',items:itens,...extra});
const dados=()=>({pedidos:[pedido('1'),pedido('2',{fornecedor_id:'f2',fornecedor_nome:'Fornecedor B',registro_direto:true,valor_total:100,frete:0,desconto:0,status:'recebido',items:[{...itens[1],quantidade:1,quantidade_recebida:1}]})],necessidades:[{id:'n1',origem:'manutencao'}],rncs:[{id:'rnc1',order_id:'1',status:'aberta'}],cotacoes:[],creditos:[],contas:[]});
test('totais reconciliam pedidos, fornecedores, destinos, origens e composição sem somar unidades incompatíveis',()=>{
 const r=calcular(dados(),periodo);assert.equal(r.total,31000);assert.equal(r.quantidade,2);assert.equal(r.ticket,15500);assert.equal(r.fornecedores[0].valor,21000);
 for(const k of ['fornecedores','destinos','origens','meses'])assert.equal(r[k].reduce((s,g)=>s+g.valor,0),r.total,k);
 assert.equal(r.brutoItens+r.frete-r.descontos+r.ajustes,r.total);assert.equal(r.itens.find(i=>i.chave==='madeira|m').quantidade,10);assert.equal(r.itens.find(i=>i.chave==='cadeira|un').quantidade,3);
 assert.equal(r.origens.find(g=>g.nome==='Manutenção').valor,10500);assert.equal(r.diretas,10000);assert.equal(r.atrasados.length,1);assert.equal(r.comRnc,1);
 assert.equal(r.destinos.find(g=>g.nome==='Acervo de locação').pedidos,2);
});
test('rateio distribui centavos e não duplica valor em destinos ou origens múltiplos',()=>{
 assert.deepEqual(repartir(100,[1,1,1]),[34,33,33]);assert.deepEqual(repartir(5,[0,0]),[3,2]);
 const d=dados();d.pedidos=[pedido('1',{valor_total:0.01,items:[...itens,{...itens[0],destino:'servico'}]})];
 const r=calcular(d,periodo);assert.equal(r.destinos.reduce((s,g)=>s+g.valor,0),1);
});
test('filtra datas e fornecedor, exclui cancelados e duplicados e compara o período anterior de mesma duração',()=>{
 const d=dados();d.pedidos.push(pedido('1'),pedido('3',{status:'cancelado',valor_total:900}),pedido('4',{created_at:'2026-10-20T12:00:00Z',valor_total:50}),pedido('5',{created_at:null}));
 const r=calcular(d,{...periodo,fornecedor:'f1'});assert.equal(r.total,21000);assert.equal(r.quantidade,1);assert.equal(r.cancelados,1);assert.equal(r.semData,1);assert.equal(r.anterior.valor,5000);assert.equal(r.anterior.de,'2026-10-02');assert.equal(r.anterior.ate,'2026-10-31');
 assert.equal(dataPedido({created_at:'2026-11-01T01:00:00Z'}),'2026-10-31');assert.equal(dataPedido({data_compra:'2026-11-02',created_at:'2026-11-01T01:00:00Z'}),'2026-11-02');
});
test('posição financeira usa contas brutas, inclui compensações e não duplica faturas nem inclui outras origens',()=>{
 const d=dados();d.contas=[{id:'p1',origem:'compra',origem_id:'1',valor:210,pago:100,compensado:10,aberto:100,vencimento:'2026-11-20',fatura_id:'fatura'},
  {id:'p2',origem:'compra',origem_id:'2',pago:0,aberto:100,vencimento:'2026-11-25',fatura_id:'fatura'},
  {id:'p3',origem:'manual',origem_id:'1',pago:1000,aberto:1000},
  {id:'p4',origem:'compra',origem_id:'1',pago:1000,aberto:1000,status:'cancelado'},
  {id:'p5',origem:'compra',origem_id:'outro',pago:1000,aberto:1000}];d.contas.push(d.contas[0]);
 const r=calcular(d,periodo);assert.equal(r.financeiro.pago,10000);assert.equal(r.financeiro.compensado,1000);assert.equal(r.financeiro.aberto,20000);assert.equal(r.financeiro.vencido,10000);assert.equal(r.financeiro.semConta,0);assert.equal(r.financeiro.contas,2);assert.equal(r.fornecedores[0].aberto,10000);
 assert.equal(r.financeiro.porPrazo.reduce((s,g)=>s+g.valor,0),r.financeiro.aberto);
});
test('não apresenta consultas indisponíveis como saldos zero',()=>{
 const r=calcular({pedidos:[pedido('1')],contas:null,rncs:null,creditos:null,cotacoes:null},periodo);
 assert.equal(r.financeiro,null);assert.equal(r.rncs,null);assert.equal(r.creditoDisponivel,null);assert.equal(r.negociacao,null);
});
test('créditos são posição atual de todos os períodos e respeitam fornecedor; cotações pertencem ao período de emissão',()=>{
 const d=dados();d.creditos=[{id:'c1',fornecedor_id:'f1',created_at:'2020-01-01',status:'aberto',valor:100,saldo:75},{id:'c2',fornecedor_id:'f2',status:'aberto',valor:200,saldo:200},{id:'c3',fornecedor_id:'f1',status:'usado',valor:50,saldo:0}];
 d.cotacoes=[{id:'q1',created_at:'2026-11-05',status:'aberta',suppliers:[{supplier_id:'f1',status:'respondido'},{supplier_id:'f2',status:'respondido'}]},{id:'q2',created_at:'2026-10-01',suppliers:[{supplier_id:'f1',status:'respondido'}]}];
 const r=calcular(d,{...periodo,fornecedor:'f1'});assert.equal(r.creditoDisponivel,7500);assert.equal(r.negociacao.total,1);assert.equal(r.negociacao.concorrencia,1);assert.equal(r.negociacao.respostas,2);
});
test('quantidade separa unidades e preço médio é ponderado, não média simples dos pedidos',()=>{
 const d=dados();d.pedidos=[pedido('1',{items:[{material_id:'x',nome:'Tecido',unidade:'m',quantidade:1,valor_total:100}]}),pedido('2',{items:[{material_id:'x',nome:'Tecido',unidade:'m',quantidade:9,valor_total:90},{material_id:'x',nome:'Tecido',unidade:'kg',quantidade:2,valor_total:80}]})];
 const r=calcular(d,periodo),m=r.itens.find(i=>i.unidade==='m');assert.equal(r.itens.length,2);assert.equal(m.valor/m.quantidade,1900);assert.equal(m.pedidos,2);
});
test('sem compras, o relatório não inventa taxa, ticket ou concentração',()=>{
 const r=calcular({pedidos:[],contas:[],rncs:[],cotacoes:[],creditos:[]},periodo);assert.equal(r.total,0);assert.equal(r.ticket,null);assert.equal(r.concentracao,null);assert.equal(r.quantidade,0);assert.deepEqual(r.fornecedores,[]);
});
test('responsáveis fecham o total e itens sem preço não recebem um rateio inventado',()=>{
 const d=dados();d.pedidos=[pedido('1',{criado_por:'a',comprador_nome:'Ana'}),pedido('2',{criado_por:'b',comprador_nome:'Bia',valor_total:50,items:[{nome:'Sem preço',quantidade:1,unidade:'un',destino:'locacao'}]})];
 const r=calcular(d,periodo);assert.equal(r.compradores.reduce((s,g)=>s+g.valor,0),r.total);assert.equal(r.compradores.find(g=>g.nome==='Ana').pedidos,1);assert.equal(r.destinos.find(g=>g.nome==='Sem valores para rateio').valor,5000);assert.equal(r.destinos.reduce((s,g)=>s+g.valor,0),r.total);
});
