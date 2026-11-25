const { test }=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const emp='10000000-0000-0000-0000-000000000001',outra='10000000-0000-0000-0000-000000000002';
const id=n=>'20000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('anúncios e divergências unificam serviços, preservam prazos, histórico, concorrência e isolamento',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
   create function seguranca_2fa_ok() returns boolean language sql as $$select current_setting('test.segundo_fator',true) is distinct from 'nao'$$;
   create function operacao_pode(uuid,text) returns boolean language sql as $$select $2=any(string_to_array(current_setting('test.permissoes',true),','))$$;
   create function logistica_nome_usuario(uuid) returns text language sql as $$select 'Supervisora Teste'::text$$;
   create table empresas(id uuid primary key);
   insert into empresas values('${emp}'),('${outra}');
   create table separacoes_pedidos(id uuid,empresa_id uuid,numero_pedido text,cliente_nome text);
   create table operacao_etapas(id uuid,empresa_id uuid,nome text);
   create table free_vagas_v(id uuid,empresa_id uuid,data date,horario text,pedido text,cliente text,local text,etapa text,ponto_encontro text,valor numeric,quantidade int,status text,modo text,observacao text);
   create table free_inscricoes(id uuid,empresa_id uuid,vaga_id uuid,nome text,status text,checkin_em timestamptz,checkout_em timestamptz,data_ciente text,horario_ciente text);
   create table free_rh_pagamentos(inscricao_id uuid,empresa_id uuid,ajuste numeric,fechamento_id uuid,nao_pagar boolean,pago_em timestamptz,valor_pago numeric,valor_enviado numeric,motivo_ajuste text);
   create table uber_vagas(id uuid,empresa_id uuid,data date,hora time,pedido_id uuid,etapa_id uuid,ponto_encontro text,destino text,valor numeric,quantidade int,status text,obs text);
   create table uber_corridas(id uuid,empresa_id uuid,vaga_id uuid,motorista_id uuid,status text,checkin_em timestamptz,checkout_em timestamptz,valor numeric,valor_final numeric,fechamento_id uuid,obs_logistica text);
   create table uber_motoristas(id uuid,empresa_id uuid,nome text);
   create function frete_div_lista(uuid) returns jsonb language sql as $$select jsonb_build_object('abertas',jsonb_build_array(jsonb_build_object('id','frete1','freteiro','Transportadora Teste','divergencia','valor','data','2000-01-01','valor_sistema',100,'total',150)),'resolvidas','[]'::jsonb)$$;
   select set_config('test.uid','${id(90)}',false);select set_config('test.permissoes','logistica.planejamento.visualizar,logistica.planejamento.editar',false);
   insert into free_vagas_v values('${id(1)}','${emp}','2000-01-01','09:00','123','Cliente','Salão','Montagem','Galpão',200,4,'ABERTA','TODOS',''),
    ('${id(2)}','${emp}','2099-01-01','09:00','456','Futuro','Salão','Montagem','Galpão',200,4,'ABERTA','TODOS',''),
    ('${id(3)}','${outra}','2000-01-01','09:00','SECRETO','Outra empresa','Salão','Montagem','Galpão',200,4,'ABERTA','TODOS','');
   insert into free_inscricoes values('${id(11)}','${emp}','${id(1)}','Free ausente','CONFIRMADO',null,null,'2000-01-01','09:00'),
    ('${id(12)}','${emp}','${id(1)}','Free sem saída','CONFIRMADO',now()-interval '25 hours',null,'2000-01-01','09:00'),
    ('${id(13)}','${emp}','${id(1)}','Free com ajuste','CONFIRMADO',now()-interval '3 hours',now(),'2000-01-01','09:00'),
    ('${id(14)}','${emp}','${id(2)}','Free futuro','CONFIRMADO',null,null,null,null),
    ('${id(15)}','${outra}','${id(3)}','SEGREDO','CONFIRMADO',null,null,null,null);
   insert into free_rh_pagamentos values('${id(13)}','${emp}',50,null,false,null,null,null,'Serviço extra');
   insert into uber_motoristas values('${id(21)}','${emp}','Motorista Teste');
   insert into uber_vagas values('${id(22)}','${emp}','2000-01-01','09:00',null,null,'Galpão','Salão',100,5,'aberta','');
   insert into uber_corridas values('${id(23)}','${emp}','${id(22)}','${id(21)}','confirmada',null,null,100,null,null,''),
    ('${id(24)}','${emp}','${id(22)}','${id(21)}','concluida',now()-interval '4 hours',now(),100,150,null,'Km extra'),
    ('${id(25)}','${emp}','${id(22)}','${id(21)}','em_andamento',now()-interval '2 hours',null,100,null,null,''),
    ('${id(26)}','${emp}','${id(22)}','${id(21)}','concluida',now(),now()-interval '2 hours',100,null,null,'');`);
  const source=fs.readFileSync('supabase/migrations/20261019000500_operacao_apps.sql','utf8');
  for(const nome of ['free_vaga_quando','free_fase']){const inicio=source.indexOf('create or replace function public.'+nome+'('),fim=source.indexOf('$$;',source.indexOf('as $$',inicio));await db.exec(source.slice(inicio,fim+3));}
  await db.exec(fs.readFileSync('supabase/migrations/20261122001300_painel_servicos_divergencias.sql','utf8'));
  const lista=async(empresa=emp)=>(await db.query('select logistica_divergencias_lista($1) r',[empresa])).rows[0].r;
  const anuncios=async(tipo,empresa=emp)=>(await db.query('select logistica_anuncios_lista($1,$2,$3,$4) r',[empresa,tipo,'1999-01-01','2100-01-01'])).rows[0].r;
  const free=await anuncios('free');assert.equal(free.length,2);assert.equal(free[0].participantes.length,3);assert.equal(free[0].valor,200);
  const uber=await anuncios('uber');assert.equal(uber.length,1);assert.equal(uber[0].participantes.length,4);
  let d=await lista();assert.deepEqual([...new Set(d.abertas.map(x=>x.origem))].sort(),['free','frete','uber']);
  assert.equal(d.abertas.filter(x=>x.origem==='free').length,3);assert.equal(d.abertas.filter(x=>x.origem==='uber').length,3);
  assert.equal(d.abertas.some(x=>x.nome==='Free futuro'),false);assert.doesNotMatch(JSON.stringify(d),/SEGREDO|SECRETO|Outra empresa/);
  assert.equal(d.abertas.some(x=>x.referencia===id(25)),false,'trabalho em curso não gera falta de saída');
  const item=d.abertas.find(x=>x.chave==='free:'+id(13)+':valor');
  const tratar=async(versao=item.versao,motivo='Ajuste conferido com o RH')=>(await db.query('select logistica_divergencia_tratar($1,$2,$3,$4) r',[emp,item.chave,versao,motivo])).rows[0].r;
  await assert.rejects(tratar('antiga'),/mudou/);await assert.rejects(tratar(item.versao,'x'),/justificativa/);
  d=await tratar();assert.equal(d.abertas.some(x=>x.chave===item.chave),false);assert.equal(d.resolvidas.length,1);assert.equal(d.resolvidas[0].tratado_por,'Supervisora Teste');
  await assert.rejects(tratar(),/já tratada/);
  await db.exec(`update free_rh_pagamentos set ajuste=75 where inscricao_id='${id(13)}'`);
  d=await lista();assert.ok(d.abertas.some(x=>x.chave===item.chave&&x.versao!==item.versao),'novo valor reabre a divergência');assert.equal(d.resolvidas.length,1);
  await assert.rejects(lista(outra),/Sem permissão/);await assert.rejects(anuncios('free',outra),/Sem permissão/);await assert.rejects(anuncios('invalido'),/Serviço inválido/);
  await db.exec("select set_config('test.permissoes','logistica.planejamento.visualizar',false)");
  await assert.rejects(tratar(),/Sem permissão/);assert.ok((await lista()).abertas.length);
  await db.exec("select set_config('test.segundo_fator','nao',false)");await assert.rejects(lista(),/Sem permissão/);
  await db.exec("select set_config('test.segundo_fator','sim',false);select set_config('test.uid','',false)");await assert.rejects(lista(),/Sem permissão/);
  assert.equal((await db.query("select has_function_privilege('anon','logistica_divergencias_lista(uuid)','execute') v")).rows[0].v,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','logistica_divergencias_candidatas(uuid)','execute') v")).rows[0].v,false);
 }finally{await db.close();}
});
