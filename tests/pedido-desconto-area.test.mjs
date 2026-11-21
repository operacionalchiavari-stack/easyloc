import test from 'node:test';
import assert from 'node:assert/strict';
import {baseAreaDesconto,descontoNaBaseBV,descontarComponente,totalDescontoComercial,linhasDescontoComercial} from '../js/pedido/pedido.desconto-area.mjs';
import {financeiroPedidoSalvo,pedidoPreviewHtml} from '../Modulos/Comercial/Catalogo/projeto-apresentacao.mjs';
const v={locacao:9000,locacao_bv:8000,customizacoes:700,servicos:200,terceirizados:100,frete:500,montagem:500,total:10000};
test('cada área tem seu limite e reduz somente a divisão correspondente',()=>{
 for(const [area,limite,comp] of [['locacao',8000,'locacao'],['customizacao',700,'locacao'],['frete',500,'frete'],['montagem',500,'montagem']]){
  const cfg={descontoComercialArea:area,descontoComercial:100.25};
  assert.equal(baseAreaDesconto(v,area),limite);
  const esperado={locacao:9000,frete:500,montagem:500};esperado[comp]-=100.25;
  assert.deepEqual(descontarComponente({locacao:9000,frete:500,montagem:500},cfg),esperado);
  assert.equal(descontoNaBaseBV(cfg),area==='locacao'?100.25:0);
 }
 assert.equal(descontoNaBaseBV({descontoComercial:100}),100,'regra dos pedidos antigos preservada');
});
test('descontos simultâneos somam uma vez e mantêm a área de cada abatimento no documento',()=>{
 const cfg={descontosAreas:{locacao:100.25,frete:50.1,montagem:30.2,customizacao:75.15},descontoComercial:99999};
 assert.equal(totalDescontoComercial(cfg),255.7);assert.equal(descontoNaBaseBV(cfg),100.25);
 assert.deepEqual(descontarComponente({locacao:9000,frete:500,montagem:500},cfg),{locacao:8824.6,frete:449.9,montagem:469.8});
 assert.equal(linhasDescontoComercial(cfg).length,4);
 const f=financeiroPedidoSalvo({valor_total:10000,observacoes:{valores:v,pagamento_config:cfg}});
 assert.equal(f.total,9744.3);assert.equal(Math.round(f.resumo.reduce((s,l)=>s+l.valor,0)*100)/100,9744.3);
});
test('documento salvo separa customizações e identifica a área, mantendo a soma e o total',()=>{
 const pedido={valor_total:10000,observacoes:{valores:v,pagamento_config:{descontoComercial:100.25,descontoComercialArea:'customizacao'}}};
 const f=financeiroPedidoSalvo(pedido);assert.equal(f.total,9899.75);
 assert.equal(f.resumo.find(l=>l.rotulo==='Customizações').valor,700);
 assert.equal(f.resumo.find(l=>l.rotulo==='Desconto em customizações').valor,-100.25);
 assert.equal(f.resumo.reduce((s,l)=>s+l.valor,0),9899.75);
 assert.match(pedidoPreviewHtml({nome:'Evento',ambientes:[],financeiro:f}),/Desconto em customizações/);
});
