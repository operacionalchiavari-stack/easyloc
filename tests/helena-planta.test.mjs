import test from 'node:test';
import assert from 'node:assert/strict';
import {validarMontagemPlanta,resumoMontagemPlanta} from '../supabase/functions/catalogo-assistente/planta-pedido.mjs';
const itens=[{id:'cadeira',nome:'Cadeira Dior'},{id:'mesa',nome:'Mesa redonda'}];
const contexto={projeto:{ambientes:[]},acharItem:id=>itens.find(i=>i.id===id),disponibilidade:new Map([['cadeira',{livre:100}],['mesa',{livre:10}]])};
const linha=(id,q,estimada=false)=>({item_id:id,quantidade:q,evidencia:'Contagem de símbolos na planta',estimada});
const plano={observacoes:'Circulação preservada.',ambientes:[{nome:'Cerimônia',itens:[linha('cadeira',80)]},{nome:'Convidados',itens:[linha('mesa',2),linha('cadeira',20,true)]}]};
test('respeita todas as áreas demarcadas sem acrescentar outras',()=>{
 assert.doesNotThrow(()=>validarMontagemPlanta(plano,{...contexto,areasEsperadas:['Cerimonia','Convidados']}));
 assert.throws(()=>validarMontagemPlanta(plano,{...contexto,areasEsperadas:['Lounge']}),/todos os ambientes demarcados/);
 const p=structuredClone(plano);p.ambientes.pop();assert.throws(()=>validarMontagemPlanta(p,{...contexto,areasEsperadas:['Cerimônia','Convidados']}));
});
test('monta ambientes com peças reais e evidencia de contagem',()=>{
 const acao=validarMontagemPlanta(plano,contexto);assert.equal(acao.tipo,'montar_planta');assert.equal(acao.ambientes.length,2);
 const texto=resumoMontagemPlanta(acao);assert.match(texto,/80× Cadeira Dior/);assert.match(texto,/20× Cadeira Dior \(estimativa\)/);
 assert.doesNotMatch(texto,/\?/);assert.deepEqual(contexto.projeto.ambientes,[],'validar não altera o pedido');
});
test('soma estoque entre ambientes e rejeita o lote inteiro',()=>{
 const p=structuredClone(plano);p.ambientes[1].itens[1].quantidade=21;
 assert.throws(()=>validarMontagemPlanta(p,contexto),/necessário 101, livre 100/);
});
test('mantém na conta os itens existentes fora da montagem',()=>{
 assert.throws(()=>validarMontagemPlanta(plano,{...contexto,projeto:{ambientes:[{nome:'Bar',itens:[{item_id:'cadeira',quantidade:1}]}]}}),/necessário 101/);
});
test('atualizar o mesmo ambiente é idempotente e não dobra quantidades',()=>{
 const acao=validarMontagemPlanta(plano,{...contexto,projeto:{ambientes:[{nome:'Cerimonia',itens:[{item_id:'cadeira',quantidade:80}]}]}});
 assert.equal(acao.ambientes[0].itens[0].quantidade,80);
});
test('rejeita peças inventadas, estoque desconhecido e falta de contagem',()=>{
 for(const mudanca of [p=>p.ambientes[0].itens[0].item_id='inventado',p=>p.ambientes[0].itens[0].quantidade=1.5,p=>p.ambientes[0].itens[0].evidencia='']){
  const p=structuredClone(plano);mudanca(p);assert.throws(()=>validarMontagemPlanta(p,contexto));
 }
 assert.throws(()=>validarMontagemPlanta(plano,{...contexto,disponibilidade:new Map()}),/não confirmado/);
});
