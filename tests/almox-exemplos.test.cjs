const assert=require('node:assert/strict'),{test}=require('node:test');
const {criar}=require('../Modulos/Almoxarifado/almox-exemplos.js');
function exemplo(){const banco=new Map(),storage={getItem:k=>banco.get(k),setItem:(k,v)=>banco.set(k,v),removeItem:k=>banco.delete(k)};return {storage,ex:criar({empresa:'empresa-teste',hoje:'2026-11-16',storage,assets:'http://teste/assets/'})};}
async function rpc(ex,nome,args={}){const r=await ex.client.rpc(nome,args);assert.equal(r.error,null,r.error?.message);return r.data;}
test('todas as abas recebem exemplos variados, sem depender de conexão real',()=>{
 const {ex}=exemplo(),s=ex.snapshot();assert.equal(s.tabelas.warehouse_materials.length,48);assert.equal(s.quadro.itens.length,18);assert.equal(s.tabelas.compras_registros.length,28);assert.equal(s.tabelas.warehouse_movements.length,160);assert.equal(s.solicitacoes.length,32);assert.equal(s.tabelas.supplier_product_links.length,42);assert.equal(s.entregas.length,64);assert.equal(s.tabelas.warehouse_count_items.length,22);
});
test('alterações persistem por empresa e não vazam entre empresas',async()=>{
 const {ex,storage}=exemplo();await rpc(ex,'set_material_location',{p_material_id:'demo-material-0',p_location_id:'demo-local-2'});
 const outraSessao=criar({empresa:'empresa-teste',hoje:'2026-11-16',storage});assert.equal(outraSessao.snapshot().tabelas.warehouse_materials[0].location_id,'demo-local-2');
 const outraEmpresa=criar({empresa:'outra',hoje:'2026-11-16',storage});assert.equal(outraEmpresa.snapshot().tabelas.warehouse_materials[0].location_id,'demo-local-0');
});
test('concluir um recebimento atualiza a lista e o estoque apenas uma vez',async()=>{
 const {ex}=exemplo(),s=ex.snapshot(),antes=s.tabelas.warehouse_materials[0].quantidade_disponivel;
 await rpc(ex,'almox_receb_concluir',{p_id:'demo-recebimento-0'});
 assert.equal(ex.snapshot().tabelas.warehouse_materials[0].quantidade_disponivel,antes+10);
 assert.equal((await rpc(ex,'almox_receb_pedidos')).some(p=>p.id==='demo-compra-0'),false);
 const segunda=await ex.client.rpc('almox_receb_concluir',{p_id:'demo-recebimento-0'});assert.ok(segunda.error);assert.equal(ex.snapshot().tabelas.warehouse_materials[0].quantidade_disponivel,antes+10);
});
test('contagem aceita justificativas cadastradas e segue para aprovação',async()=>{
 const {ex}=exemplo();const err=await ex.client.rpc('justify_warehouse_count_item',{p_id:'demo-contagem-1',p_justificativa:'texto livre'});assert.ok(err.error);
 await rpc(ex,'justify_warehouse_count_item',{p_id:'demo-contagem-1',p_justificativa:'Erro de registro na entrada'});const antes=ex.snapshot().tabelas.warehouse_materials[1].quantidade_disponivel;
 await rpc(ex,'review_warehouse_count_adjustment',{p_id:'demo-contagem-1',p_approve:true});assert.equal(ex.snapshot().tabelas.warehouse_materials[1].quantidade_disponivel,antes-2);
});
test('separação gera kit e rejeita quantidade acima da pendência',async()=>{
 const {ex}=exemplo();const id=await rpc(ex,'producao_separar_modo',{p_etapa:'demo-etapa-0',p_modo:'manual',p_materiais:[{id:'demo-mat-etapa-0-0',quantidade:2}]});assert.ok(id);
 const antes=ex.snapshot();const r=await ex.client.rpc('producao_separar_modo',{p_etapa:'demo-etapa-0',p_materiais:[{id:'demo-mat-etapa-0-0',quantidade:100}]});assert.ok(r.error);assert.deepEqual(ex.snapshot(),antes);
});
test('operação desconhecida falha sem alterar o estado; reiniciar limpa os dados locais',async()=>{
 const {ex,storage}=exemplo(),antes=ex.snapshot();const r=await ex.client.rpc('operacao_real');assert.ok(r.error);assert.deepEqual(ex.snapshot(),antes);ex.reset();const novo=criar({empresa:'empresa-teste',hoje:'2026-11-16',storage});assert.equal(novo.snapshot().tabelas.warehouse_materials.length,48);
});
