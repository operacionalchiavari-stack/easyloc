import test from 'node:test';
import assert from 'node:assert/strict';
import {aplicarExibicaoFinanceira} from '../js/pedido/pedido.exibicao-financeiro.mjs';
import {financeiroPedidoSalvo,pedidoPreviewHtml} from '../Modulos/Comercial/Catalogo/projeto-apresentacao.mjs';

const pedido={valor_total:1200,observacoes:{valores:{locacao:1000,locacao_bv:1000,frete:120,frete_bruto:200,montagem:80,montagem_bruto:100,total:1200},pagamento_config:{descontoBvPedido:100},exibicao_financeiro:{frete_desconto:true,montagem_desconto:true}}};
test('frete e montagem mostram bruto e desconto sem alterar total; BV oculto vira locação líquida',()=>{
 const f=financeiroPedidoSalvo(pedido);
 assert.equal(f.total,1100);
 assert.deepEqual(f.resumo.map(l=>[l.rotulo,l.valor]),[['Locação',900],['Frete',200],['Desconto de frete',-80],['Montagem',100],['Desconto de montagem',-20]]);
 assert.equal(f.resumo.reduce((t,l)=>t+l.valor,0),f.total);
 assert.equal(pedido.observacoes.valores.locacao,1000);
});
test('BV mostrado usa o texto escolhido, sem informar comissão ou beneficiário no documento',()=>{
 const copia=structuredClone(pedido);copia.observacoes.exibicao_financeiro.bv_desconto=true;copia.observacoes.exibicao_financeiro.bv_texto='Condição especial <cliente>';
 const f=financeiroPedidoSalvo(copia);assert.equal(f.resumo.at(-1).rotulo,'Condição especial <cliente>');assert.equal(f.resumo.at(-1).valor,-100);assert.equal(f.total,1100);
 const html=pedidoPreviewHtml({nome:'Evento',ambientes:[],financeiro:f});assert.ok(html.includes('Condição especial &lt;cliente&gt;'));assert.doesNotMatch(html,/BV convertido|comissão|beneficiário/);
 assert.equal(f.resumo.reduce((t,l)=>t+l.valor,0),1100);
});
test('opções desmarcadas mantêm logística líquida e descontos já aplicados continuam corretos',()=>{
 const copia=structuredClone(pedido);copia.observacoes.exibicao_financeiro={};copia.observacoes.pagamento_config={descontoComercial:'10',abatidoBV:'50',creditoCliente:'20'};
 const f=financeiroPedidoSalvo(copia);assert.equal(f.total,1120);assert.deepEqual(f.resumo.filter(l=>['Frete','Montagem'].includes(l.rotulo)).map(l=>l.valor),[120,80]);assert.equal(f.resumo.reduce((t,l)=>t+l.valor,0),1120);
 const inteiro=aplicarExibicaoFinanceira(f,copia.observacoes.valores,{frete_desconto:true});assert.equal(inteiro.total,f.total);
});
test('descontos ficam junto da área e somam com logística, preservando o total e o texto especial',()=>{
 const copia=structuredClone(pedido);
 copia.observacoes.valores={locacao:1000,locacao_bv:800,customizacoes:200,frete:120,frete_bruto:200,montagem:80,montagem_bruto:100,total:1200};
 copia.observacoes.pagamento_config={descontosAreas:{locacao:100.25,customizacao:25.5,frete:10.1,montagem:5.2},descontoBvPedido:50};
 copia.observacoes.exibicao_financeiro.bv_desconto=true;copia.observacoes.exibicao_financeiro.bv_texto='Desconto na locação';
 const f=financeiroPedidoSalvo(copia);
 assert.deepEqual(f.resumo.map(l=>[l.rotulo,l.valor]),[['Locação',800],['Desconto',-100.25],['Customizações',200],['Desconto em customizações',-25.5],['Frete',200],['Desconto de frete',-90.1],['Montagem',100],['Desconto de montagem',-25.2],['Desconto na locação',-50]]);
 assert.equal(f.total,1008.95);assert.equal(Math.round(f.resumo.reduce((s,l)=>s+l.valor,0)*100)/100,f.total);
 copia.observacoes.exibicao_financeiro={bv_desconto:true};
 const liquido=financeiroPedidoSalvo(copia);
 assert.equal(liquido.resumo.find(l=>l.rotulo==='Frete').valor,120);assert.equal(liquido.resumo.find(l=>l.rotulo==='Desconto de frete').valor,-10.1);
 assert.equal(liquido.resumo.find(l=>l.rotulo==='Montagem').valor,80);assert.equal(liquido.resumo.find(l=>l.rotulo==='Desconto de montagem').valor,-5.2);
 assert.equal(Math.round(liquido.resumo.reduce((s,l)=>s+l.valor,0)*100)/100,f.total);
});
