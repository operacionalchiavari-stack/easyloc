const {test}=require('node:test'),assert=require('node:assert/strict');
const cx=require('../js/shared/complexidade');
function completo(){return {id:'p1',numero:'101',data_evento:'2026-11-04',cliente_nome:'Cliente',local_nome:'Local',tipo_evento:'Casamento',config:cx.padrao(),cliente:{complexidade:{reclamacao:false}},pedidos_anteriores:0,local:{complexidade:{baldeacao:true,escada:false,distancia_manual_m:80}},caminhoes:3,carregamento:{data:'2026-11-02',hora:'08:00:00'},montagem:{data:'2026-11-04',hora:'12:00:00'},confirmado_em:'2026-11-04T10:00:00-03:00',excecoes:{viagens:2},itens:[{item_id:'sofa',familia:'Estofados',complexidade:{grupo:'sofa',sob_medida:false,volumoso:true}},{item_id:'bar',complexidade:{grupo:'bar',sob_medida:false,volumoso:true}}],pecas:[{item_id:'peca',quantidade:51,complexidade:{fragil:false}}],servicos:[{item_id:'sofa',quantidade:5,etapas:[{setor:'forracao'}]},{item_id:'bar',quantidade:5,etapas:[{setor:'pintura'}]}]};}
test('23 respostas automáticas (8, 17 e 25 saíram em nov/2026) com pesos de antes; serviços dos setores são independentes',()=>{
 const r=cx.avaliar(completo());assert.equal(Object.keys(r.respostas).length,23);
 for(const id of [8,17,25])assert.equal(r.respostas[id],undefined,'r'+id+' removida');
 for(const id of [1,4,9,10,12,14,15,18,19,21,22,23])assert.equal(r.respostas[id].valor,true,'r'+id);
 for(const id of [2,3,5,6,7,11,13,16,20,24,26])assert.equal(r.respostas[id].valor,false,'r'+id);
 for(const s of Object.values(r.setores)){assert.equal(s.status,'completo');assert.ok(s.score>=0&&s.score<=100);}
 assert.deepEqual(cx.padrao().pesos[18],{sim:24,nao:8},'a 18 mantém o peso que tinha');assert.deepEqual(cx.padrao().pesos[26],{sim:24,nao:8});
 const c=completo();c.excecoes.respostas=Object.fromEntries(cx.perguntas.map(q=>[q.id,{valor:q.id!==6,motivo:'Condição confirmada'}]));
 for(const s of Object.values(cx.avaliar(c).setores))assert.equal(s.score,100);
});
test('local: etiqueta presente = Sim, ausente = Não; frágil pelo material; volumoso pelo grupo do móvel',()=>{
 const c=completo();c.local={tags:{observacoes:['Necessita Baldeação','Tem escadas','Caminhão para perto']}};
 let r=cx.avaliar(c);assert.equal(r.respostas[15].valor,true);assert.equal(r.respostas[16].valor,true);
 c.local={tags:{observacoes:[]}};r=cx.avaliar(c);assert.equal(r.respostas[15].valor,false);assert.equal(r.respostas[16].valor,false);assert.equal(r.setores.montagem.status,'completo');
 c.local={tags:'{"observacoes":["Tem escadas"]}'};assert.equal(cx.avaliar(c).respostas[16].valor,true);
 c.pecas=[{quantidade:5,material:'Vidro',complexidade:{}}];assert.equal(cx.avaliar(c).respostas[20].valor,true);assert.equal(cx.avaliar(c).respostas[24].valor,true);
 c.pecas[0].complexidade.fragil=false;assert.equal(cx.avaliar(c).respostas[20].valor,false);
 c.pecas=[{quantidade:5,material:'Madeira',complexidade:{}}];assert.equal(cx.avaliar(c).respostas[20].valor,false);
 c.itens=[{item_id:'x',produto_base:'Cadeira',complexidade:{}}];assert.equal(cx.avaliar(c).respostas[23].valor,false);
 c.itens=[{item_id:'x',produto_base:'Sofá Berlim',complexidade:{}}];assert.equal(cx.avaliar(c).respostas[23].valor,true);
 c.itens=[{item_id:'x',produto_base:'Vaso decorativo',complexidade:{}}];assert.equal(cx.avaliar(c).respostas[23].valor,false);
});
test('cor do móvel não cria serviço; quantidades somam ambientes e kits contam pelas peças físicas',()=>{
 const c=completo();c.servicos=[];c.itens[0].cor='Azul';let r=cx.avaliar(c);
 assert.equal(r.setores.personalizacao.status,'completo');assert.equal(r.setores.pintura.status,'completo');
 assert.equal(r.setores.personalizacao.base_geral,true);assert.equal(r.setores.pintura.base_geral,true);
 c.servicos=[{item_id:'sofa',quantidade:3,etapas:['forracao']},{item_id:'sofa',quantidade:2,etapas:['forracao']}];
 assert.equal(cx.avaliar(c).respostas[4].valor,true);
 c.itens[0].quantidade=1000;c.pecas[0].quantidade=50;assert.equal(cx.avaliar(c).respostas[19].valor,false);
 c.servicos=[{item_id:'sofa',quantidade:3,etapas:[]}];assert.equal(cx.avaliar(c).setores.pintura.status,'pendente');
 c.servicos=[{item_id:'sofa',tipo:'Pintura',quantidade:3,etapas:[{setor:'pintura',revisao:true}]}];assert.equal(cx.avaliar(c).setores.pintura.status,'pendente');
});
test('orçamento sem cronograma usa a entrega; confirmação pelo dia em que virou Reservado; exceções preservam fonte e motivo',()=>{
 const c=completo();delete c.confirmado_em;delete c.carregamento;delete c.montagem;c.caminhoes=0;
 c.data_entrega='2026-11-03';c.hora_entrega='19:00';
 let r=cx.avaliar(c);assert.equal(r.respostas[9].valor,true);assert.equal(r.respostas[9].fonte,'Entrega do pedido');assert.equal(r.respostas[26].valor,true,'19h, fora do expediente');
 assert.equal(r.respostas[18].valor,false);assert.match(r.respostas[18].detalhe,/Ainda sem caminhão/);
 assert.equal(r.respostas[22].valor,false);assert.match(r.respostas[22].detalhe,/ainda não confirmado/);
 c.reservado_em='2026-11-03T10:00:00-03:00';r=cx.avaliar(c);assert.equal(r.respostas[22].valor,true);assert.equal(r.respostas[22].fonte,'Dia em que virou Reservado');
 c.reservado_em='2026-10-01T10:00:00-03:00';assert.equal(cx.avaliar(c).respostas[22].valor,false);
 for(const s of Object.values(cx.avaliar(c).setores)){assert.equal(s.status,'completo');assert.notEqual(s.aplica,null);}
 c.excecoes={confirmado_em:'2026-11-03T10:00:00-03:00',respostas:{16:{valor:true,motivo:'Acesso especial neste evento',por:'gestor'}}};
 r=cx.avaliar(c);assert.equal(r.respostas[22].valor,true);assert.equal(r.respostas[16].fonte,'Exceção do pedido');assert.equal(r.respostas[16].por,'gestor');
 c.carregamento={data:'2026-11-01',hora:'08:00:00'};assert.equal(cx.avaliar(c).respostas[26].valor,true);
});
test('mescla preserva históricos sem duplicar pedidos; vínculos ambíguos ficam fora da projeção financeira',()=>{
 const c=completo(),p=cx.paraPainel(c),manual=[{numero:'101',id:'legado',score:37},{numero:'99',id:'hist',score:75}];
 const m=cx.mesclar(manual,[p]);assert.equal(m.length,2);assert.equal(m.find(o=>o.id==='p1').manual_original.score,37);assert.equal(manual[0].score,37);
 const linhas=[['ID'],['legado','2026-11-04','101','Cliente','Local',1000]];
 assert.equal(cx.linhas(linhas,[p]).length,2);assert.equal(cx.linhas(linhas,[p])[1][49].automatico,true);
 const duplicados=cx.linhas(linhas,[p,{...p,id:'p2'}]);assert.equal(duplicados.length,2);assert.equal(duplicados[1][0],'legado');
 const pendente=cx.paraPainel({...c,cliente:{}});assert.equal(cx.linhas([[]],[pendente])[1][32],null);
 const legado=Array(49).fill('');Object.assign(legado,{0:'anterior',1:'2026-11-04',2:'101',18:37,19:0.003,20:11.1,32:62});
 const preservado=cx.linhas([[],legado],[pendente]);assert.equal(preservado[1][18],37);assert.equal(preservado[1][20],11.1);assert.equal(preservado[1][32],62);assert.equal(preservado[1][49].setores.montagem.status,'manual_preservado');
 legado[1]='2025-11-04';assert.equal(cx.linhas([[],legado],[pendente])[1][0],'anterior');
});
module.exports={completo};
test('reclamação automática usa o resultado consultado, preserva falhas como pendência e aceita exceções',()=>{
 const c=completo();c.cliente={complexidade:{},reclamacao_historico:{valor:false,fonte:'Histórico de feedbacks',detalhe:'Nenhuma reclamação registrada'}};
 assert.equal(cx.avaliar(c).respostas[5].valor,false);assert.equal(cx.paraPainel(c).r5,false);
 c.cliente.reclamacao_historico.valor=true;assert.equal(cx.avaliar(c).respostas[5].valor,true);
 c.cliente.reclamacao_historico.valor=null;c.cliente.complexidade.reclamacao=false;assert.equal(cx.avaliar(c).respostas[5].valor,null);
 c.excecoes.respostas={5:{valor:false,motivo:'Conferência autorizada do histórico'}};assert.equal(cx.avaliar(c).respostas[5].valor,false);assert.equal(cx.avaliar(c).respostas[5].fonte,'Exceção do pedido');
});
test('score parcial (só quando falta o cliente) delimita as respostas desconhecidas sem criar percentual definitivo ou bônus',()=>{
 const c=completo();c.cliente={};
 const s=cx.avaliar(c).setores.montagem;
 assert.equal(s.score,null);assert.deepEqual(s.pendentes,[5]);
 const finais=[];
 for(const reclamacao of [false,true]){finais.push(cx.avaliar({...c,cliente:{complexidade:{reclamacao}}}).setores.montagem.score);}
 assert.equal(s.intervalo.minimo,Math.min(...finais));assert.equal(s.intervalo.maximo,Math.max(...finais));
 const visual=cx.apresentarScore(s);assert.match(visual.texto,/%.*%/);assert.match(visual.legenda,/Parcial.*1 resposta pendente/);
 assert.equal(cx.linhas([[]],[cx.paraPainel(c)])[1][32],null);
 const fechado=cx.avaliar(completo()).setores.montagem;assert.equal(fechado.intervalo.minimo,fechado.score);assert.equal(fechado.intervalo.maximo,fechado.score);assert.equal(cx.apresentarScore(fechado).legenda,'');
 assert.equal(cx.apresentarScore({...s,aplica:null}).legenda,'Parcial · setor a confirmar');
 assert.equal(cx.apresentarScore({...s,status:'manual_preservado',score:62}).texto,'62%');
 c.cliente={complexidade:{reclamacao:false}};c.pedidos_anteriores=null;
 const recorrencia=cx.avaliar(c).setores.montagem;assert.ok(recorrencia.intervalo.minimo<=recorrencia.intervalo.maximo);
});
test('sem serviço mantém dificuldade geral, pesos Não e a mesma porcentagem na projeção dos setores',()=>{
 const c=completo();c.servicos=[];c.excecoes.montagem_aplica=false;c.local={};c.caminhoes=0;
 let r=cx.avaliar(c);
 const esperado=s=>{
  const ids=[...cx.gerais,...s.perguntas],p=c.config.pesos;
  const soma=ids.reduce((n,id)=>n+p[id][s.perguntas.includes(id)?'nao':r.respostas[id].valor?'sim':'nao'],0);
  return Math.round(soma/ids.reduce((n,id)=>n+Math.max(p[id].sim,p[id].nao),0)*1000)/10;
 };
 for(const id of ['personalizacao','pintura','montagem']){
  const s=r.setores[id];assert.equal(s.status,'completo');assert.equal(s.aplica,false);assert.equal(s.base_geral,true);assert.equal(s.score,esperado(cx.setores.find(s=>s.id===id)));assert.ok(s.score>0);assert.deepEqual(s.pendentes,[]);assert.equal(cx.apresentarScore(s).legenda,'Dificuldade mínima');
 }
 assert.equal(r.respostas[15].valor,false); // nov/2026: local sem a etiqueta de baldeação = Não
 const anterior=r.setores.pintura.score;c.cliente.complexidade.reclamacao=true;r=cx.avaliar(c);assert.ok(r.setores.pintura.score>anterior);
 c.config.pesos[11].nao=0;r=cx.avaliar(c);assert.equal(r.setores.pintura.score,esperado(cx.setores.find(s=>s.id==='pintura')));
 const p=cx.paraPainel(c),linha=cx.linhas([[]],[p])[1];assert.equal(linha[18],p.score);assert.equal(linha[25],p.scorePintura);assert.equal(linha[32],p.scoreMontagem);
});
test('a Edge Function central-metas usa a mesma regra da tela (cópia idêntica em supabase/functions/_shared)',()=>{
 const fs=require('node:fs');
 assert.equal(fs.readFileSync('supabase/functions/_shared/complexidade.js','utf8'),fs.readFileSync('js/shared/complexidade.js','utf8'),'copie js/shared/complexidade.js para supabase/functions/_shared/ e publique a função central-metas');
});
