const {test}=require('node:test');
const assert=require('node:assert/strict');
global.window={};require('../Modulos/Financeiro/conta-decorador-extrato.js');
test('extrato único acumula BV, créditos, devolução e estorno',()=>{
  const dados={pedidos:[{id:'p',cliente_id:'c',cliente_nome:'Cliente',pagar_id:'bv',valor:1000,saldo:600,ativo:true,registro:'registrado',numero_pedido:'1',percentual:10}],
    creditos:[{id:'cr',fornecedor_id:'c',valor:200,aberto:200,status:'pendente',emissao:'2026-10-21',descricao:'Pagamento a maior'}],
    pagamentos:[{id:'b1',pagar_id:'bv',numero_pedido:'1',data:'2026-10-21',valor:400},{id:'b2',pagar_id:'cr',data:'2026-10-22',valor:50,estornado_em:'2026-10-23T12:00:00Z'}]};
  let e=window.montarExtratoDecorador(dados,[{id:'bv',emissao:'2026-10-20'}],800);
  assert.equal(e.inicial,0);assert.deepEqual(e.linhas.map(l=>l.saldo),[1000,1200,800,750,800]);
  dados.creditos[0].status='cancelado';dados.creditos[0].cancelado_em='2026-10-24T12:00:00Z';
  e=window.montarExtratoDecorador(dados,[{id:'bv',emissao:'2026-10-20'}],600);
  assert.equal(e.inicial,0);assert.equal(e.linhas.at(-1).saldo,600);assert.equal(e.linhas.at(-1).debito,200);
});
