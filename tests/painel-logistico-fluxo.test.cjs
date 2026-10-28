const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {fixture,empresa}=require('./helpers/ciclo-fixture.cjs');
test('escala: pre-reserva nao permite salvar nem preencher; reserva permite planejamento',async()=>{
 const db=await fixture();try{
  await db.exec(`create function operacao_escala_salvar(p_etapa uuid,p_responsavel text,p_equipe text[],p_caminhoes text[],p_forcar boolean default false) returns jsonb language plpgsql as $$declare e operacao_etapas;begin select * into e from operacao_etapas where id = p_etapa;return '{"ok":true}'::jsonb;end$$;
  create function operacao_escala_preencher(p_empresa uuid,p_etapas uuid[]) returns int language plpgsql as $$declare n int;begin select count(*) into n from operacao_etapas e where e.empresa_id = p_empresa and e.id = any(p_etapas);return n;end$$;`);
  await db.exec(fs.readFileSync('supabase/migrations/20261027000200_escala_somente_planejamento.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261027000300_escala_guardas_internas.sql','utf8'));
  const pre=(await db.query("insert into separacoes_pedidos(empresa_id,numero_pedido,status_comercial,status,data_entrega) values($1,'PRE','pre_reserva','pendente',current_date+5) returning id",[empresa])).rows[0].id;
  const res=(await db.query("insert into separacoes_pedidos(empresa_id,numero_pedido,status_comercial,status,data_entrega) values($1,'RES','aprovado','pendente',current_date+5) returning id",[empresa])).rows[0].id;
  const etapas=[];for(const p of [pre,res])etapas.push((await db.query("insert into operacao_etapas(empresa_id,pedido_id,tipo,data) values($1,$2,'montagem',current_date+5) returning id",[empresa,p])).rows[0].id);
  await assert.rejects(db.query("select operacao_escala_salvar($1,'Equipe','{}','{}',true)",[etapas[0]]),/somente consulta/);
  assert.equal((await db.query("select operacao_escala_salvar($1,'Equipe','{}','{}',false) r",[etapas[1]])).rows[0].r.ok,true);
  assert.equal((await db.query('select operacao_escala_preencher($1,$2) n',[empresa,etapas])).rows[0].n,1);
  assert.equal((await db.query('select operacao_escala_preencher($1,$2) n',[empresa,[etapas[0]]])).rows[0].n,0);await assert.rejects(db.query("select operacao_escala_salvar_sem_fluxo($1,'Equipe','{}','{}',true)",[etapas[0]]),/somente consulta/);assert.equal((await db.query('select operacao_escala_preencher_sem_fluxo($1,$2) n',[empresa,[etapas[0]]])).rows[0].n,0);
  assert.equal((await db.query("select has_function_privilege('authenticated','operacao_escala_salvar_sem_fluxo(uuid,text,text[],text[],boolean)','execute') permitido")).rows[0].permitido,false);
 }finally{await db.close();}
});

test('painel nativo: pre-reserva aparece como consulta e pedidos em entrega/coleta saem do planejamento',async()=>{
 const pre={id:'pre',numero_pedido:'1',cliente_nome:'Consulta',somente_consulta:true,data_entrega:'2026-10-27',data_coleta:'2026-10-28'};
 const reservado={id:'res',numero_pedido:'2',cliente_nome:'Reservado',somente_consulta:false};
 const lista=[{id:'r',pedido_id:'res',pedido:reservado,nome:'Montagem',tipo:'montagem',data:'2026-10-27',pessoas:[],cams:[]},{id:'d',pedido_id:'entrega',pedido:{status_comercial:'aprovado'},nome:'Montagem',tipo:'montagem',data:'2026-10-27',pessoas:[{papel:'responsavel',nome:'Em entrega'}],cams:[]},{id:'c',pedido_id:'coleta',pedido:{status_comercial:'aprovado'},nome:'Desmontagem',tipo:'desmontagem',data:'2026-10-27',pessoas:[],cams:[]}];
 const client={rpc:async(nome)=>({data:nome==='operacao_empresa'?'e1':nome==='operacao_minhas_permissoes'?{'logistica.planejamento.visualizar':true}:nome==='pedido_fluxo_fila'?[pre,reservado]:nome==='operacao_regras_escala'?{etapas:{montagem:{minimo:1,maximo:3,m3_por_pessoa:10}}}:nome==='operacao_volume_pedido'?{m3:5,pecas:1}:[],error:null}),from(t){const q={select(){return q},eq(){return q},gte(){return q},lte(){return q},order(){return q},in(){return q},neq(){return q},range(){return q},then(ok,no){return Promise.resolve({data:t==='operacao_etapas'?lista:[],error:null}).then(ok,no)}};return q;}};
 const window={supabaseClient:client};window.top=window;const ctx={window,document:{currentScript:{src:'http://teste/Modulos/Chiavari/operacao-sem-motor.js'}},URL,Date,Intl,console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('Modulos/Chiavari/operacao-sem-motor.js','utf8'),ctx);
 const p=await window.ACERVO_LOCAL.ESC_painel('2026-10-27',2,false);
 assert.equal(p.etapas.filter(e=>e.pedidoSistemaId==='pre').length,2);
 assert.ok(p.etapas.filter(e=>e.pedidoSistemaId==='pre').every(e=>e.somente_consulta&&!e.responsavel&&!e.equipe.length&&!e.caminhoes.length));
 assert.equal(p.etapas.filter(e=>e.pedidoSistemaId==='res').length,1);
 assert.equal(p.etapas.some(e=>['entrega','coleta'].includes(e.pedidoSistemaId)),false);
 assert.ok(p.ocupacoes.some(e=>e.responsavel==='Em entrega'),'Pessoas que estao em entrega continuam ocupadas');
});

test('fotos da equipe: caminho privado recebe URL assinada; foto publica permanece',async()=>{
 const assinaturas=[];
 const client={rpc:async()=>({data:[{id:'joao',nome:'Joao Pedro',foto_url:'empresa/joao/foto.jpg',free:false},{id:'free',nome:'Free',foto_url:'https://foto.test/free.jpg',free:true}]}),storage:{from(bucket){assert.equal(bucket,'funcionarios-fotos');return {createSignedUrls:async(paths,tempo)=>{assinaturas.push({paths:[...paths],tempo});return {data:paths.map(path=>({path,signedUrl:'https://privado.test/'+path+'?token=teste'})),error:null};}};}}};
 const window={supabaseClient:client};window.top=window;
 const ctx={window,document:{currentScript:{src:'http://teste/Modulos/Chiavari/operacao-sem-motor.js'}},URL,Date,Intl,console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('Modulos/Chiavari/operacao-sem-motor.js','utf8'),ctx);
 window.ACERVO_LOCAL.listarCaminhoes=async()=>[];
 const dados=await window.ACERVO_LOCAL.ESC_listas();
 assert.equal(dados.pessoas[0].foto_url,'https://privado.test/empresa/joao/foto.jpg?token=teste');
 assert.equal(dados.pessoas[1].foto_url,'https://foto.test/free.jpg');
 assert.deepEqual(assinaturas,[{paths:['empresa/joao/foto.jpg'],tempo:3600}]);
});
