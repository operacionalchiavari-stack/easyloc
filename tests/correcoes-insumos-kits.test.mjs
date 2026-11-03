import {test} from 'node:test';
import assert from 'node:assert/strict';
import {numeroMoeda,fatorComplexidade,calcularPreco} from '../js/shared/custos-personalizacao.mjs';
import {saldoKit,renderizarSeparacaoKits} from '../Modulos/Producao/producao-kits.mjs';
import {instalarProtecaoSaida} from '../js/pedido/pedido.saida.mjs';
import cx from '../js/shared/complexidade.js';
test('moeda brasileira e percentuais configuráveis preservam centavos',()=>{
 assert.equal(numeroMoeda('R$ 1.234,56'),1234.56);assert.equal(numeroMoeda('35.90'),35.9);
 const c={complexidades:{simples:5,media:25,alta:50}};
 assert.equal(calcularPreco(120,40,fatorComplexidade(1.3,c)),252);
 assert.equal(fatorComplexidade(1,c),1.05);
});
const material={id:'m1',produto_id:'tinta',nome:'Tinta',unidade:'L',necessario:10,recebido:3,devolvido:1};
const etapa={id:'e1',nome:'Pintar bar',setor:'pintura',estado:'pendente',materiais:[material],pacotes:[{id:'pa1',estado:'separado',materiais:[{id:'m1',quantidade:4}]}]};
const item={id:'i1',pedido_id:'p1',item_nome:'Bar',origem:{quantidade:2},pedido:{numero:9,cliente:'Cliente',status:'aprovado'},etapas:[etapa]};
test('kit parcial desconta materiais recebidos, devoluções e pacotes já separados',()=>{
 assert.deepEqual(saldoKit(etapa,material),{recebido:2,separado:4,falta:4});
 const html=renderizarSeparacaoKits([item],{pedido:'p1',podeSeparar:true});
 assert.match(html,/data-kit-qtd="m1" min="0.001" max="4"/);
 assert.match(html,/data-pacote="pa1"/);
 const pre=structuredClone(item);pre.pedido.status='pre_reserva';
 assert.match(renderizarSeparacaoKits([pre],{pedido:'p1',podeSeparar:true}),/data-acao="separar-kit" data-etapa="e1" disabled/);
});
test('saída permanece bloqueada ao recusar ou falhar o salvamento; chamadas simultâneas compartilham a confirmação',async()=>{
 let confirmar=0,gravar=0,resposta=false,resultado=false,sujo=true;
 const janela={document:{addEventListener(){}},addEventListener(){},confirmarGlobal:async()=>{confirmar++;return resposta;}};
 const sair=instalarProtecaoSaida({janela,temAlteracoes:()=>sujo,salvar:async()=>{gravar++;return resultado;}});
 assert.equal(await sair(),false);assert.equal(gravar,0);
 resposta=true;assert.equal(await sair(),false);assert.equal(gravar,1);
 resultado=true;confirmar=0;assert.deepEqual(await Promise.all([sair(),sair()]),[true,true]);assert.equal(confirmar,1);
 sujo=false;assert.equal(await sair(),true);
});
test('complexidade da peça aumenta apenas a avaliação do setor correspondente',()=>{
 const c={config:cx.padrao(),itens:[{}],pecas:[{quantidade:1}],servicos:[{tipo:'Pintura',quantidade:2,personalizacao_complexidade:1,etapas:[{setor:'pintura'}]}],excecoes:{respostas:Object.fromEntries(cx.perguntas.map(q=>[q.id,{valor:false,motivo:'Conferido'}]))}};
 const simples=cx.avaliar(c);c.servicos[0].personalizacao_complexidade=1.3;c.custos_personalizacao={complexidades:{simples:0,media:20,alta:50}};
 const alta=cx.avaliar(c);assert.ok(alta.setores.pintura.score>simples.setores.pintura.score);
 assert.equal(alta.setores.pintura.ajuste_personalizacao.acrescimo_percentual,50);
 assert.equal(alta.setores.personalizacao.score,simples.setores.personalizacao.score);
 assert.equal(alta.setores.triagem.score,simples.setores.triagem.score);
});
