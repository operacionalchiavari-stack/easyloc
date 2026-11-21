const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync('Modulos/Estoque/CapasProtecao/capas-exemplos.js','utf8'),ctx);
function criar(){
 const motor=ctx.window.CapasExemplos.criar({empresa:'empresa',hoje:'2026-11-16'});let chave=0;
 const rpc=(n,a={})=>JSON.parse(JSON.stringify(motor.rpc(n,{p_empresa:'empresa',...a})));
 const saldo=id=>rpc('capas_estoque').find(m=>m.id==='exemplo-'+id).saldo;
 const mover=(tipo,q,extra={})=>rpc('material_movimentar',{p_modelo:'exemplo-cadeira',p_tipo:tipo,p_quantidade:q,p_data:'2026-11-16',p_observacao:'Registro de teste',p_chave:'teste-'+(++chave),...extra});
 return {rpc,saldo,mover};
}
test('exemplos conciliam fabricação, saída, retorno, manutenção, perda e contagem não conferida',()=>{
 const {rpc,saldo}=criar();assert.equal(rpc('capas_estoque').length,6);
 assert.deepEqual(saldo('cadeira'),{disponivel:67,manutencao:1,em_pedidos:8,ultima_fabricacao:'2026-10-26'});
 assert.deepEqual(saldo('sofa'),{disponivel:14,manutencao:1,em_pedidos:0,ultima_fabricacao:'2026-10-26'});
 assert.deepEqual(saldo('mesa'),{disponivel:15,manutencao:0,em_pedidos:3,ultima_fabricacao:null});
 assert.equal(saldo('tacas').em_pedidos,1);assert.equal(saldo('banco').disponivel,30,'rascunho não retira estoque');
 assert.equal(rpc('capas_estoque').find(m=>m.id==='exemplo-poltrona').estoque_conferido_em,null);
});
test('movimentações atualizam os exemplos e reenvio com a mesma chave não duplica fabricação',()=>{
 const {mover,saldo,rpc}=criar();
 mover('fabricacao',5,{p_chave:'mesma-chave'});mover('fabricacao',5,{p_chave:'mesma-chave'});
 assert.equal(saldo('cadeira').disponivel,72);assert.equal(saldo('cadeira').ultima_fabricacao,'2026-11-16');
 assert.equal(rpc('capas_historico_listar',{p_modelo:'exemplo-cadeira'}).movimentos.filter(m=>m.data==='2026-11-16').length,1);
 mover('inventario',40);assert.equal(saldo('cadeira').disponivel,40);assert.equal(saldo('cadeira').em_pedidos,8);
 mover('manutencao',4);assert.equal(saldo('cadeira').disponivel,36);assert.equal(saldo('cadeira').manutencao,5);
 mover('reparo',2);assert.equal(saldo('cadeira').disponivel,38);assert.equal(saldo('cadeira').manutencao,3);
 const lote=rpc('capas_historico_listar',{p_modelo:'exemplo-cadeira'}).conferencias.find(c=>c.etapa==='retorno');
 assert.throws(()=>mover('reparo',3),/lote/);
 mover('reparo',1,{p_contagem:lote.id});assert.equal(saldo('cadeira').disponivel,39);assert.equal(saldo('cadeira').manutencao,2);
});
test('confirmar a perda de um pedido não desconta o disponível novamente',()=>{
 const {mover,saldo}=criar(),antes=saldo('tacas');
 mover('perda_pedido',1,{p_modelo:'exemplo-tacas',p_pedido:'pedido-exemplo-1803'});
 assert.equal(saldo('tacas').disponivel,antes.disponivel);assert.equal(saldo('tacas').em_pedidos,0);
 assert.throws(()=>mover('perda_pedido',1,{p_modelo:'exemplo-tacas',p_pedido:'pedido-exemplo-1803'}),/excede/);
});
test('perdas distinguem evento e galpão, com equipe e custos coerentes',()=>{
 const {rpc}=criar(),lista=rpc('capas_perdas_equipe',{p_de:'2026-08-01',p_ate:'2026-11-16'});
 assert.equal(lista.length,2);
 const cadeira=lista.find(x=>x.numero==='1801');assert.equal(cadeira.no_evento,2);assert.equal(cadeira.no_galpao,1);assert.equal(cadeira.valor_evento,65);assert.equal(cadeira.valor_galpao,32.5);assert.equal(cadeira.equipe.length,2);
 assert.equal(lista.find(x=>x.numero==='1803').valor_evento,85);
 assert.equal(rpc('capas_perdas_equipe',{p_de:'2026-11-08',p_ate:'2026-11-16'}).length,1);
 assert.equal(rpc('capas_perdas_equipe',{p_de:'2026-11-16',p_ate:'2026-11-16'}).length,0);
});
test('recusa quantidades, datas, lotes e empresas inválidos; leituras não alteram o estado',()=>{
 const {rpc,mover,saldo}=criar();
 for(const q of [-1,.5,1000001])assert.throws(()=>mover('fabricacao',q),/Confira/);
 assert.throws(()=>mover('fabricacao',1,{p_data:'2026-11-17'}),/Confira/);
 assert.throws(()=>mover('fabricacao',1,{p_data:'2026-02-30'}),/Confira/);
 assert.throws(()=>mover('perda',100),/insuficiente/);assert.throws(()=>mover('reparo',5),/insuficiente/);
 assert.throws(()=>mover('reparo',1,{p_contagem:'outro-lote'}),/lote/);
 assert.throws(()=>rpc('capas_estoque',{p_empresa:'outra-empresa'}),/Empresa/);
 const dados=rpc('capas_estoque');dados.find(m=>m.id==='exemplo-cadeira').saldo.disponivel=999;assert.equal(saldo('cadeira').disponivel,67);
 mover('fabricacao',10);assert.equal(criar().saldo('cadeira').disponivel,67,'reiniciar restaura o cenário original');
});
