import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transferirItens} from '../Modulos/Comercial/Catalogo/projeto-apresentacao.mjs';

test('transfere parte ou todas as unidades sem perder observações e personalizações',()=>{
  const linha={item_id:'i',quantidade:7,observacao:'Perto da entrada',personalizacao_id:'p',personalizacao_escolhas:{Tecido:{nome:'Linho'}}};
  const ambientes=[{id:'a',itens:[structuredClone(linha),{item_id:'j',quantidade:2}]},{id:'b',itens:[]}];
  assert.equal(transferirItens(ambientes,'a','b','i',3),true);
  assert.deepEqual(ambientes[1].itens,[{...linha,quantidade:3}]);
  ambientes[1].itens[0].personalizacao_escolhas.Tecido.nome='Veludo';
  assert.equal(ambientes[0].itens[0].personalizacao_escolhas.Tecido.nome,'Linho');
  ambientes[1].itens[0].personalizacao_escolhas.Tecido.nome='Linho';
  assert.equal(ambientes[0].itens[0].quantidade,4);
  assert.equal(transferirItens(ambientes,'a','b','i',4),true);
  assert.deepEqual(ambientes[0].itens,[{item_id:'j',quantidade:2}]);
  assert.deepEqual(ambientes[1].itens,[linha]);
});

test('mantém registros diferentes do mesmo item e rejeita transferências inválidas sem mutar o projeto',()=>{
  const ambientes=[{id:'a',itens:[{item_id:'i',quantidade:2,observacao:'A'},{item_id:'i',quantidade:3,observacao:'B'}]},{id:'b',itens:[{item_id:'i',quantidade:1,personalizacao_id:'outra'}]}];
  for(const [de,para,q] of [['a','a',1],['a','x',1],['x','b',1],['a','b',6],['a','b',0],['a','b',1.5]]){
    const antes=structuredClone(ambientes);assert.equal(transferirItens(ambientes,de,para,'i',q),false);assert.deepEqual(ambientes,antes);
  }
  assert.equal(transferirItens(ambientes,'a','b','i',4),true);
  assert.deepEqual(ambientes[0].itens,[{item_id:'i',quantidade:1,observacao:'B'}]);
  assert.equal(ambientes[1].itens.length,3);
  assert.equal(ambientes.flatMap(a=>a.itens).reduce((s,i)=>s+i.quantidade,0),6);
});
