const {test}=require('node:test'),assert=require('node:assert/strict');
const f=require('../Modulos/Gestao/Fluxograma/fluxograma-detalhado.js');
const n=id=>f.nos.find(n=>n.id===id),dest=(id,resposta)=>resposta?n(id).saidas.find(s=>s.rotulo===resposta).destino:n(id).saidas[0].destino;
test('all cards explain responsibility, screen, completion and impediments without broken text',()=>{
 f.validarFluxo();for(const x of f.nos){assert.ok(!/\p{L}\?+\p{L}/u.test(x.titulo+' '+x.detalhe),x.id);for(const k of ['quem','onde','concluir','impedimento'])assert.ok(x.guia[k].length>15,x.id+': '+k);}
});
test('delivery exceptions can proceed after a documented solution without falsely claiming no discrepancy',()=>{
 assert.equal(dest('divergencia_entrega'),'divergencia_encaminhada');assert.equal(dest('divergencia_encaminhada','Sim'),'montagem_contratada');assert.equal(dest('divergencia_encaminhada','Não'),'solucionar_entrega');
});
test('own teams are checked and services and collection schedule have explicit applicable paths',()=>{
 assert.equal(dest('equipe_free','Não'),'equipe_completa');assert.equal(dest('montagem_contratada','Não'),'aguardar_evento');assert.equal(dest('concluir_montagem'),'aguardar_evento');assert.equal(dest('coleta_autorizada','Não'),'aguardar_coleta');
});
test('third-party damages are separated from own inventory losses',()=>{
 assert.equal(dest('duas_ok','Sim'),'avaria_terceiro');assert.equal(dest('avaria_terceiro','Sim'),'tratar_avaria_terceiro');assert.match(n('tratar_avaria_terceiro').detalhe,/Não dê baixa no patrimônio próprio/);assert.match(n('ha_avaria').titulo,/próprias/);
});
test('planning changes and invalid field records return to validation without bypassing controls',()=>{
 assert.equal(dest('carregamento_pago','Sim'),'transporte_atualizado');assert.equal(dest('transporte_atualizado','Não'),'replanejar_saida');assert.equal(dest('qr_free_validado','Não'),'regularizar_qr_free');assert.equal(dest('qr_uber_validado','Não'),'regularizar_uber');assert.equal(dest('foto_confirmada','Não'),'regularizar_envio');
});
test('budget shortages and later client requests have distinct paths and only explicit client cancellation can end a request',()=>{
 assert.equal(dest('estoque_ok','Não'),'alternativa_na_proposta');assert.equal(dest('alternativa_na_proposta','Não'),'suprimento_na_proposta');assert.equal(dest('cancelamento_solicitado','Sim'),'apurar_cancelamento');assert.equal(dest('cancelamento_solicitado','Não'),'alteracao_acrescimo');assert.equal(dest('alteracao_acrescimo','Sim'),'pedido_extra');assert.equal(dest('prazo_alternativa','Não'),'escalar_urgencia');
});
