import {test} from 'node:test';
import assert from 'node:assert/strict';
import {iniciarSaldoClientePedido} from '../js/pedido/pedido.saldo-cliente.mjs';
test('saldo do cliente aparece sem abater o pedido e respostas antigas não vazam para outro cliente',async()=>{
  const el=(value='')=>({value,textContent:'',setAttribute(){},addEventListener(){}});
  const elementos={clienteIdHidden:el('a'),clienteInput:el(),pgResumoBV:el(),pgResumoCredito:el(),pagamentoCreditoCliente:el('25'),bvTotal:el('10')};
  globalThis.document={getElementById:id=>elementos[id],addEventListener(){}};
  let responderB;
  globalThis.window={__CONTEXT:{empresa_id:'e'},addEventListener(){},supabaseClient:{rpc:async(n,p)=>{
    assert.equal(n,'pedido_saldo_conta_cliente');
    if(p.p_cliente==='b')return new Promise(resolve=>{responderB=resolve;});
    if(p.p_cliente==='erro')return {error:{message:'Sem permissão'}};
    return {data:p.p_cliente==='a'?{bv:100,credito:200}:{bv:0,credito:0}};
  }}};
  const api=iniciarSaldoClientePedido();await new Promise(setImmediate);
  assert.match(elementos.pgResumoCredito.textContent,/200,00/);assert.match(elementos.pgResumoBV.textContent,/100,00/);
  assert.equal(elementos.pagamentoCreditoCliente.value,'25');assert.equal(elementos.bvTotal.value,'10');
  elementos.clienteIdHidden.value='b';const antigo=api.atualizar(true);
  elementos.clienteIdHidden.value='c';await api.atualizar(true);
  responderB({data:{bv:999,credito:999}});await antigo;
  assert.match(elementos.pgResumoCredito.textContent,/0,00/);assert.equal(window.__PEDIDO_SALDO_CONTA_CLIENTE.cliente_id,'c');
  elementos.clienteIdHidden.value='erro';await api.atualizar(true);
  assert.equal(elementos.pgResumoCredito.textContent,'Indisponível');
  elementos.clienteIdHidden.value='';await api.atualizar(true);
  assert.match(elementos.pgResumoCredito.textContent,/0,00/);
});
