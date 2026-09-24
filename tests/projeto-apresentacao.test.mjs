import test from 'node:test';
import assert from 'node:assert/strict';
import {dadosApresentacao,reordenarItens,documentoApresentacao,geralHtml} from '../Modulos/Comercial/Catalogo/projeto-apresentacao.mjs';
test('agrega quantidades reais, preserva ambientes e a ordem e escapa texto',()=>{
 const projeto={noivos:'A < B',dados:{ambientes:[{id:'a',nome:'Cerimônia',itens:[{item_id:'x',quantidade:120},{item_id:'y',quantidade:2},{item_id:'x',quantidade:3}],renders:[{url:'https://example.com/render.jpg'}]},{id:'b',nome:'Bar',itens:[{item_id:'x',quantidade:4}]}]}};
 const find=id=>({name:id,photo:'',specs:[{label:'Código',value:'REF'}]});
 let model=dadosApresentacao(projeto,find);
 assert.deepEqual(model.ambientes.map(a=>a.itens.map(i=>i.quantidade)),[[123,2],[4]]);
 const antes=JSON.stringify(projeto.dados.ambientes[1]);
 assert.equal(reordenarItens(projeto.dados.ambientes[0],'y','x'),true);
 model=dadosApresentacao(JSON.parse(JSON.stringify(projeto)),find);
 assert.deepEqual(model.ambientes[0].itens.map(i=>i.id),['y','x']);
 assert.equal(JSON.stringify(projeto.dados.ambientes[1]),antes);
 assert.match(documentoApresentacao(model),/A &lt; B/);
 assert.match(documentoApresentacao(model),/>123<\/b>/);
 assert.match(geralHtml(model),/Cód. REF/);
 assert.match(documentoApresentacao(model),/https:\/\/example.com\/render.jpg/);
 assert.equal(reordenarItens(projeto.dados.ambientes[0],'x','inexistente'),false);
});
test('estados vazios e compatibilidade com projetos antigos',()=>{
 assert.match(geralHtml(dadosApresentacao({dados:{}},()=>null)),/Este projeto ainda não possui itens/);
 const model=dadosApresentacao({dados:{ambientes:[{id:'a',itens:[{item_id:'removido'}]}]}},()=>null);
 assert.equal(model.ambientes[0].itens[0].quantidade,1);
 assert.match(documentoApresentacao(model),/ainda não possui imagem/);
 assert.match(documentoApresentacao(model),/Item indisponível/);
});
