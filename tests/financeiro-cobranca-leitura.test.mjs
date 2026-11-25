import {test} from 'node:test';import assert from 'node:assert/strict';import {normalizarCobranca,esquemaCobranca,instrucoesCobranca} from '../supabase/functions/financeiro-assistente/cobranca.mjs';
test('Leitura de cobranca conserva justificativa e pedido, sem inventar data nem aceitar valores invalidos',()=>{
 const r=normalizarCobranca({linhas:[{data:'',pedido:'18',valor:100.129,descricao:'Galpao > Evento',direcao:'entrega',explicacao:'Espera de 20 minutos'}]},x=>x);
 assert.equal(r[0].valor,100.13);assert.equal(r[0].data,'');assert.equal(r[0].pedido,'18');assert.equal(r[0].explicacao,'Espera de 20 minutos');assert.equal(r[0].direcao,'entrega');assert.ok(esquemaCobranca.properties.linhas.items.required.includes('explicacao'));assert.match(instrucoesCobranca,/Não invente dados/);
 for(const valor of [0,-1,NaN,Infinity,'texto'])assert.throws(()=>normalizarCobranca({linhas:[{valor}]},x=>x),/Revise o valor/);
 assert.throws(()=>normalizarCobranca({linhas:[]},x=>x),/Não encontrei/);assert.throws(()=>normalizarCobranca({linhas:Array.from({length:501},()=>({valor:1}))},x=>x),/500/);
});
