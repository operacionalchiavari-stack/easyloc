const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const emp='10000000-0000-0000-0000-000000000001',ana='20000000-0000-0000-0000-000000000001',bia='20000000-0000-0000-0000-000000000002',ped='30000000-0000-0000-0000-000000000001';
test('cliente mantém autenticação e vincula apenas gravações relacionadas ao salvamento',async()=>{
 let opcoes;const chamadas=[];const janela={supabase:{createClient:(_url,_key,cfg)=>{opcoes=cfg;return {};}}};
 vm.runInNewContext(fs.readFileSync('js/core/supabase.js','utf8'),{window:janela,Request,Headers,fetch:async(url,init)=>{chamadas.push({url,init});}});
 janela.__comercialOperacaoAtual='salvamento-1';
 await opcoes.global.fetch('https://exemplo/rest/v1/rpc/pedido_salvar_integrado',{method:'POST',headers:{authorization:'Bearer teste'}});
 assert.equal(chamadas[0].init.headers.get('authorization'),'Bearer teste');assert.equal(chamadas[0].init.headers.get('x-comercial-operacao'),'salvamento-1');
 await opcoes.global.fetch('https://exemplo/rest/v1/usuarios_empresas',{method:'GET'});assert.equal(chamadas[1].init.headers.get('x-comercial-operacao'),null);
 janela.__comercialOperacaoAtual=null;await opcoes.global.fetch('https://exemplo/rest/v1/separacoes_pedidos');assert.equal(chamadas[2].init.headers.get('x-comercial-operacao'),null);
});
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.usuario',true),'')::uuid $$;
 create function eh_membro_empresa(uuid) returns boolean language sql stable as $$ select $1='${emp}'::uuid $$;
 create function seguranca_2fa_ok() returns boolean language sql as $$select true$$;
 create function operacao_pode(uuid,text) returns boolean language sql stable as $$select $2<>'configuracoes.empresa.editar' or auth.uid()='${ana}'::uuid$$;
 create table empresas(id uuid primary key);insert into empresas values('${emp}');
 create table funcionarios_acesso(id uuid primary key,empresa_id uuid,nome text,ativo boolean default true);
 insert into funcionarios_acesso(id,empresa_id,nome) values('${ana}','${emp}','Ana'),('${bia}','${emp}','Bia');
 create table separacoes_pedidos(id uuid primary key,empresa_id uuid,numero_pedido text,cliente_nome text,status_comercial text,valor_total numeric,observacoes jsonb default '{}',revisao bigint default 0,atualizado_em timestamptz default now());
 create table separacoes_itens(id uuid primary key,empresa_id uuid,separacao_pedido_id uuid,item_id uuid,quantidade_solicitada numeric,quantidade_separada numeric);
 create table fin_receber(id uuid primary key,empresa_id uuid,pedido_id uuid,origem text,componente text,parcela int,status text,valor numeric,recebido numeric);
 create table contratos_pedidos(id uuid primary key,empresa_id uuid,pedido_id uuid,conteudo_final text);
 set test.usuario='${ana}';`);
 await db.exec(fs.readFileSync('supabase/migrations/20261031002000_produtividade_comercial.sql','utf8'));
 const config={participantes:[ana,bia],acessos:[{observador:ana,alvo:bia},{observador:bia,alvo:'equipe'}],situacoes:['Aguardando decisão'],motivos:['Reunião']};
 await db.query('select comercial_prod_config_salvar($1,$2)',[emp,config]);
 await db.exec(`insert into separacoes_pedidos(id,empresa_id,numero_pedido,status_comercial,cliente_nome,valor_total) values('${ped}','${emp}','123','orcamento','Cliente',1000)`);
 return db;
}
const painel=async(db,autor=null,equipe=false)=>(await db.query('select comercial_prod_painel($1,current_date-1,current_date+1,$2,$3) p',[emp,autor,equipe])).rows[0].p;
async function contato(db,id='40000000-0000-0000-0000-000000000001',proximo=true){return db.query("select comercial_acompanhamento_salvar($1,$2,$3,'Orçamento enviado','Aguardando decisão','Reunião','WhatsApp','Vai reunir',case when $4 then current_date+2 else null end,$5)",[emp,ped,id,proximo,ana]);}
test('produtividade: operações, detalhes, autoria compartilhada e não alteração',async()=>{
 const db=await fixture();try{
 assert.equal((await painel(db)).totais.criados,1);
 await db.exec(`update separacoes_pedidos set revisao=1,atualizado_em=now() where id='${ped}'`);
 assert.equal((await painel(db)).totais.alteracoes,0);
 await db.exec(`update separacoes_pedidos set observacoes='{"vazio":"","nulo":null,"lista":[]}' where id='${ped}'`);
 assert.equal((await painel(db)).totais.alteracoes,0);
 await db.exec(`begin; update separacoes_pedidos set cliente_nome='Cliente novo',valor_total=1100 where id='${ped}';update separacoes_pedidos set valor_total=1200 where id='${ped}';commit;`);
 let p=await painel(db);assert.equal(p.totais.alteracoes,1);assert.equal(p.totais.detalhes,2);assert.equal(p.pedidos,1);
 await db.exec(`begin;update separacoes_pedidos set valor_total=999 where id='${ped}';update separacoes_pedidos set valor_total=1200 where id='${ped}';commit;`);
 assert.equal((await painel(db)).totais.alteracoes,1);
 await db.exec(`set test.usuario='${bia}';update separacoes_pedidos set valor_total=1300 where id='${ped}'`);
 await assert.rejects(painel(db,ana),/Sem acesso/);
 await assert.rejects(painel(db,ana,true),/não permite filtrar/);
 p=await painel(db,null,true);assert.equal(p.pedidos,1);assert.equal(p.totais.alteracoes,2);assert.deepEqual(p.pessoas,[]);assert.deepEqual(p.eventos,[]);
 await assert.rejects(db.query('select comercial_prod_config_salvar($1,$2)',[emp,{}]),/permissão/);
 await db.exec(`set test.usuario='${ana}'`);p=await painel(db);assert.equal(p.pessoas.length,2);assert.equal(p.pessoas.reduce((s,x)=>s+Number(x.pedidos),0),2);
 }finally{await db.close();}
});
test('acompanhamento: agenda obrigatória, executor, idempotência e cancelamento',async()=>{
 const db=await fixture();try{
 await assert.rejects(contato(db,undefined,false),/próxima data/);
 await contato(db);await contato(db);
 assert.equal((await db.query('select count(*) n from comercial_contatos')).rows[0].n,1);
 await db.exec(`set test.usuario='${bia}'`);await contato(db,'40000000-0000-0000-0000-000000000002');
 const retorno=(await db.query("select * from comercial_retornos where encerramento='contato'")).rows[0];assert.equal(retorno.executor_id,bia);assert.equal(retorno.responsavel_id,ana);
 await db.exec(`update separacoes_pedidos set status_comercial='cancelado' where id='${ped}'`);
 assert.equal((await db.query('select count(*) n from comercial_retornos where concluido_em is null')).rows[0].n,0);
 await assert.rejects(contato(db,'40000000-0000-0000-0000-000000000003'),/apenas para orçamento/);
 }finally{await db.close();}
});
test('entrada parcial não encerra; primeira parcela integral encerra sem crédito humano',async()=>{
 const db=await fixture();try{
 await contato(db);
 await db.exec(`insert into fin_receber values('50000000-0000-0000-0000-000000000001','${emp}','${ped}','pedido','locacao',1,'parcial',500,100)`);
 assert.equal((await db.query('select count(*) n from comercial_retornos where concluido_em is null')).rows[0].n,1);
 await db.exec("update fin_receber set recebido=500,status='recebido'");
 const r=(await db.query('select * from comercial_retornos')).rows[0];assert.equal(r.encerramento,'pagamento');assert.equal(r.executor_id,null);
 await assert.rejects(contato(db,'40000000-0000-0000-0000-000000000002'),/Entrada já confirmada/);
 }finally{await db.close();}
});
test('operação única atravessa requisições e preserva prazo original ao reagendar',async()=>{
 const db=await fixture();try{
 await db.exec(`set request.headers='{"x-comercial-operacao":"salvamento-1"}';update separacoes_pedidos set valor_total=1200 where id='${ped}';`);
 await db.exec(`insert into contratos_pedidos values('60000000-0000-0000-0000-000000000001','${emp}','${ped}','Contrato novo');`);
 assert.equal((await painel(db)).totais.alteracoes,1);
 await db.exec("set request.headers=''");await contato(db);
 const anterior=(await db.query('select * from comercial_retornos')).rows[0];
 await db.query("select comercial_retorno_reagendar($1,$2,current_date+4,$3,'Aguardando reunião')",[emp,ped,bia]);
 const novo=(await db.query('select * from comercial_retornos')).rows[0];assert.deepEqual(novo.prazo_original,anterior.prazo);assert.equal(novo.responsavel_id,bia);assert.equal(novo.revisoes.length,1);
 assert.equal((await db.query('select count(*) n from comercial_contatos')).rows[0].n,1);
 await db.exec(`set test.usuario='';`);await assert.rejects(painel(db),/permissão/);
 await db.exec(`set test.usuario='${ana}'`);await assert.rejects(db.query('select comercial_prod_contexto($1)',['10000000-0000-0000-0000-000000000002']),/permissão/);
 }finally{await db.close();}
});
