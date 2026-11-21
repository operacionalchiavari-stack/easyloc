import test from 'node:test';
import assert from 'node:assert/strict';
import {redistribuirParcelas} from '../js/pedido/pedido.parcelas-auto.mjs';
test('novo total redistribui saldo com centavos exatos e preserva entrada',()=>{
 assert.deepEqual(redistribuirParcelas(100,[{valor:40},{valor:40},{valor:40}]),[33.33,33.33,33.34]);
 assert.deepEqual(redistribuirParcelas(90,[{tipo:'Entrada',valor:30},{valor:40},{valor:40}]),[30,30,30]);
 assert.deepEqual(redistribuirParcelas(0,[{valor:40},{valor:40}]),[0,0]);
});
test('parcelas recebidas preservam valor; reducao abaixo do recebido nao altera historico',()=>{
 assert.deepEqual(redistribuirParcelas(80,[{valor:50,travada:true},{valor:50}]),[50,30]);
 assert.deepEqual(redistribuirParcelas(30,[{valor:50,travada:true},{valor:50}]),[50,50]);
});
