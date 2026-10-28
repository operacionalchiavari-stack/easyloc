import {test} from 'node:test';import assert from 'node:assert/strict';
import {renderizarFila,renderizarPedido} from '../Modulos/Producao/producao-vistas.mjs';
import {situacao,etapaAtual} from '../Modulos/Producao/producao-op.mjs';
const tarefa=(id,estado)=>({pedido_id:id,pedido:{numero:id,cliente:'Cliente '+id,status:'aprovado',entrega:'2026-11-01',evento:'2026-11-02',local:'Local'},origem:{quantidade:2},inicio_previsto:'2026-10-27T11:00:00Z',fim_previsto:'2026-10-30T20:00:00Z',etapas:[{setor:'pintura',estado,materiais:[]}]});
test('um card por pedido em três colunas e filtro por setor',()=>{
 const a=tarefa('p1','pendente'),b=tarefa('p2','execucao'),c=tarefa('p3','concluida');
 const r=renderizarFila([a,b,c,{...a}],{});
 assert.equal(r.total,3);for(const k of ['aguardando','andamento','concluido'])assert.match(r.html,new RegExp(`data-coluna="${k}"`));
 assert.equal((r.html.match(/data-pedido="p1"/g)||[]).length,1);
 assert.equal(renderizarFila([a,b,c],{setor:'forracao'}).total,0);
 assert.equal(renderizarFila([a,b,c],{situacao:'concluidas'}).total,1);
 assert.equal(renderizarFila([a,b,c],{busca:'cliente p2'}).total,1);
});
test('pré-reserva permanece aguardando e detalhes têm informações do pedido',()=>{
 const t=tarefa('p1','execucao');t.pedido.status='pre_reserva';
 const r=renderizarFila([t],{setor:'pintura',busca:'cliente'});
 assert.match(r.html,/data-coluna="aguardando"/);assert.match(r.html,/aguardar confirmação/);
 assert.match(r.html,/pedido.html\?pedido=p1&amp;origem_setor=pintura/);
 assert.match(renderizarPedido([t]),/Cliente p1/);
 assert.match(renderizarPedido([],()=>''),/não encontrado/);
});

test('etapa atual: um botão principal ou o motivo do bloqueio',()=>{
 const dados={executar:true,almox:true,responsavel:{pintura:true},config:{material_incompleto:false}};
 const futuro='2099-01-01T10:00:00Z';
 const item=()=>({pedido:{status:'aprovado'},etapas:[{id:'a',grupo:1,ordem:1,nome:'Lixar',setor:'pintura',horas:2,estado:'pendente',inicio_previsto:futuro,materiais:[],pacotes:[]},{id:'b',grupo:2,ordem:2,nome:'Pintar',setor:'pintura',horas:3,estado:'pendente',inicio_previsto:futuro,materiais:[{id:'m',produto_id:'P',nome:'Tinta',necessario:2,recebido:0,devolvido:0}],pacotes:[]}]});
 let t=item();
 assert.equal(situacao(t,t.etapas[1],dados).titulo,'Aguardando a etapa anterior');
 assert.equal(situacao(t,t.etapas[0],dados).titulo,'Falta material de outra etapa');
 t.etapas[1].pacotes=[{estado:'separado',materiais:[{id:'m',quantidade:2}]}];
 t.etapas[0].estado='concluida';assert.equal(etapaAtual(t,'pintura').id,'b');
 assert.deepEqual(situacao(t,t.etapas[1],dados).principal,['receber','Receber material (ler QR)']);
 t.etapas[1].pacotes=[];assert.deepEqual(situacao(t,t.etapas[1],dados).principal,['separar','Separar materiais']);
 assert.equal(situacao(t,t.etapas[1],{...dados,almox:false}).principal,null);
 t.etapas[1].materiais[0].recebido=2;assert.deepEqual(situacao(t,t.etapas[1],dados).principal,['iniciar','Iniciar etapa']);
 t.etapas[1].inicio_previsto='2000-01-01T10:00:00Z';assert.deepEqual(situacao(t,t.etapas[1],dados).principal,['autorizar_prazo','Autorizar prazo']);
 assert.equal(situacao(t,t.etapas[1],{...dados,responsavel:{}}).principal,null);
 t.etapas[1].estado='execucao';const s=situacao(t,t.etapas[1],dados);assert.deepEqual(s.principal,['concluir','Concluir etapa']);assert.deepEqual(s.extra,[['pausar','Pausar']]);
 t.etapas[1].estado='conferencia';assert.equal(situacao(t,t.etapas[1],{...dados,responsavel:{}}).titulo,'Aguardando conferência');
 t.revisao=true;assert.deepEqual(situacao(t,t.etapas[1],dados).principal,['revisar','Revisar alteração']);
});
