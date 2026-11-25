const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const emp='10000000-0000-0000-0000-000000000001',outra='10000000-0000-0000-0000-000000000002';
const id=n=>'20000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('acompanhamento parte da escala e só reconhece confirmação real no aplicativo',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;
   create function logistica_servicos_autorizar(uuid,boolean default false) returns void language plpgsql as $$begin
    if $1<>'${emp}'::uuid or current_setting('test.permissao',true) is distinct from 'sim' then raise exception 'Sem permissão';end if;end$$;
   create table separacoes_pedidos(id uuid,empresa_id uuid,numero_pedido text,cliente_nome text,local_nome text,status_comercial text,status text);
   create table operacao_etapas(id uuid,empresa_id uuid,pedido_id uuid,nome text,tipo text,data date,hora time);
   create table operacao_etapa_pessoas(id uuid,empresa_id uuid,etapa_id uuid,free_id uuid,nome text);
   create table free_cadastros(id uuid,empresa_id uuid,nome text,status text);
   create table free_vagas(id uuid,empresa_id uuid,etapa_id uuid,status text,horario text,ponto_encontro text,valor numeric,quantidade int,modo text,preferidos uuid[],liberar_em timestamptz,observacao text);
   create view free_vagas_v as select v.*,e.data,e.nome etapa from free_vagas v join operacao_etapas e on e.id=v.etapa_id;
   create table free_inscricoes(id uuid,empresa_id uuid,vaga_id uuid,free_id uuid,nome text,status text,confirmado_em timestamptz,checkin_em timestamptz,checkout_em timestamptz,motivo text);
   create table uber_corridas(id uuid,empresa_id uuid,confirmado_em timestamptz);
   create function logistica_anuncios_lista(uuid,text,date,date) returns jsonb language sql as $$select jsonb_build_array(jsonb_build_object('id','uber1','quantidade',2,'participantes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nome','Motorista')) from uber_corridas c where c.empresa_id=$1),'[]'::jsonb)))$$;
   insert into separacoes_pedidos values('${id(1)}','${emp}','20','Decoradora','Salão','aprovado','pendente'),('${id(2)}','${outra}','SECRETO','Outra empresa','Salão','aprovado','pendente');
   insert into operacao_etapas values('${id(11)}','${emp}','${id(1)}','Montagem','montagem','2099-01-01','09:00'),
    ('${id(12)}','${emp}','${id(1)}','Desmontagem','desmontagem','2099-01-02','18:00'),
    ('${id(13)}','${outra}','${id(2)}','Montagem','montagem','2099-01-01','09:00'),
    ('${id(14)}','${emp}','${id(1)}','Carregamento','carregamento','2099-01-01','07:00');
   insert into free_cadastros values('${id(21)}','${emp}','Ana Free','aprovado'),('${id(22)}','${emp}','Bruno Free','aprovado'),('${id(23)}','${emp}','Carla Free','aprovado'),('${id(24)}','${outra}','SEGREDO','aprovado');
   insert into operacao_etapa_pessoas values('${id(31)}','${emp}','${id(11)}','${id(21)}','Ana Free'),('${id(32)}','${emp}','${id(11)}','${id(22)}','Bruno Free'),
    ('${id(33)}','${emp}','${id(12)}','${id(21)}','Ana Free'),('${id(34)}','${emp}','${id(12)}','${id(22)}','Bruno Free'),('${id(35)}','${emp}','${id(12)}','${id(23)}','Carla Free'),
    ('${id(36)}','${outra}','${id(13)}','${id(24)}','SEGREDO'),
    ('${id(37)}','${emp}','${id(14)}','${id(21)}','Ana Free');
   insert into free_vagas values('${id(41)}','${emp}','${id(12)}','ABERTA','18:00','Galpão',200,3,'TODOS','{}',null,'');
   insert into free_inscricoes values('${id(51)}','${emp}','${id(41)}','${id(21)}','Ana Free','CANCELADO','2026-11-20T12:00:00Z',null,null,'Anterior'),
    ('${id(52)}','${emp}','${id(41)}','${id(21)}','Ana Free','CONFIRMADO','2026-11-21T12:00:00Z',null,null,null),
    ('${id(53)}','${emp}','${id(41)}','${id(22)}','Bruno Free','CANCELADO','2026-11-21T12:00:00Z',null,null,'Não poderá ir');
   insert into uber_corridas values('${id(61)}','${emp}','2026-11-21T12:00:00Z');
   select set_config('test.permissao','sim',false);`);
  await db.exec(fs.readFileSync('supabase/migrations/20261122001400_acompanhamento_confirmacoes_apps.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261122001500_acompanhamento_free_todas_etapas.sql','utf8'));
  const listar=async(tipo='free',empresa=emp,inicio='2099-01-01',fim='2099-01-03')=>(await db.query('select logistica_acompanhamento_lista($1,$2,$3,$4) r',[empresa,tipo,inicio,fim])).rows[0].r;
  let lista=await listar();assert.equal(lista.length,3,'escala sem vaga também aparece em todas as etapas');
  assert.equal(lista.find(x=>x.etapa_id===id(14)).participantes[0].status_app,'nao_enviado');
  let semVaga=lista.find(x=>x.etapa_id===id(11)),comVaga=lista.find(x=>x.etapa_id===id(12));
  assert.equal(semVaga.publicado,false);assert.equal(semVaga.escalados,2);assert.equal(semVaga.quantidade,2);assert.equal(semVaga.confirmados_app,0);
  assert.ok(semVaga.participantes.every(p=>p.status_app==='nao_enviado'&&p.escalado));
  assert.equal(comVaga.escalados,3);assert.equal(comVaga.confirmados_app,1);assert.equal(comVaga.participantes.length,3,'não duplica inscrição anterior');
  assert.equal(comVaga.participantes.find(p=>p.free_id===id(21)).status_app,'confirmado');
  assert.equal(comVaga.participantes.find(p=>p.free_id===id(22)).status_app,'cancelou');
  assert.equal(comVaga.participantes.find(p=>p.free_id===id(23)).status_app,'aguardando');
  assert.doesNotMatch(JSON.stringify(lista),/SEGREDO|SECRETO|Outra empresa/);
  assert.equal((await db.query('select count(*)::int n from free_vagas')).rows[0].n,1,'consulta não cria vaga nem aceite');
  await db.exec(`update free_vagas set modo='EXCLUSIVA',preferidos=array['${id(21)}'::uuid]`);
  comVaga=(await listar()).find(x=>x.etapa_id===id(12));assert.equal(comVaga.participantes.find(p=>p.free_id===id(23)).status_app,'nao_convidado');
  await db.exec(`insert into free_inscricoes values('${id(54)}','${emp}','${id(41)}','${id(23)}','Carla Free','CONFIRMADO',now(),null,null,null)`);
  assert.equal((await listar()).find(x=>x.etapa_id===id(12)).confirmados_app,2,'aceite novo aparece na próxima leitura');
  await db.exec(`update free_inscricoes set status='CANCELADO' where id='${id(52)}'`);
  assert.equal((await listar()).find(x=>x.etapa_id===id(12)).confirmados_app,1,'cancelamento não continua confirmado');
  await db.exec(`insert into free_cadastros values('${id(25)}','${emp}','Dora Free','aprovado');
   insert into free_inscricoes values('${id(55)}','${emp}','${id(41)}','${id(25)}','Dora Free','CONFIRMADO',now(),null,null,null);
   update free_vagas set quantidade=2`);
  comVaga=(await listar()).find(x=>x.etapa_id===id(12));
  assert.equal(comVaga.confirmados_app,2);assert.equal(comVaga.quantidade,4,'aceite de outra pessoa não oculta os escalados que faltam confirmar');
  const uber=(await listar('uber'))[0];assert.equal(uber.confirmados_app,1);assert.equal(uber.participantes[0].status_app,'confirmado');assert.ok(uber.participantes[0].confirmado_em);
  assert.deepEqual(await listar('free',emp,'2000-01-01','2000-01-02'),[]);
  await assert.rejects(listar('free',outra),/Sem permissão/);await assert.rejects(listar('invalido'),/Serviço inválido/);
  await db.exec("select set_config('test.permissao','nao',false)");await assert.rejects(listar(),/Sem permissão/);
  assert.equal((await db.query("select has_function_privilege('authenticated','logistica_free_acompanhamento(uuid,date,date)','execute') v")).rows[0].v,false);
  assert.equal((await db.query("select has_function_privilege('anon','logistica_acompanhamento_lista(uuid,text,date,date)','execute') v")).rows[0].v,false);
 }finally{await db.close();}
});
