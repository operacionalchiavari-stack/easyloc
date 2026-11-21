const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const emp='10000000-0000-0000-0000-000000000001',pedido='20000000-0000-0000-0000-000000000001',etapa='30000000-0000-0000-0000-000000000001',c1='40000000-0000-0000-0000-000000000001',c2='40000000-0000-0000-0000-000000000002';
const migration=n=>fs.readFileSync('supabase/migrations/'+n+'.sql','utf8');
async function fixture(){const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${emp}'::uuid$$;
 create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
 create function funcionario_tabela_permitida(uuid,text,text) returns boolean language sql as $$select coalesce(current_setting('test.negar',true),'')<>'sim'$$;
 create table empresa_financeiro(empresa_id uuid,pagamento_exige boolean,pagamento_percent numeric,pagamento_trava_etapa text);
 insert into empresa_financeiro values('${emp}',true,80,'carregamento');
 create table separacoes_pedidos(id uuid primary key,empresa_id uuid,valor_total numeric,operacao jsonb,atualizado_em timestamptz,encerrado_operacional_em timestamptz,status_comercial text,pedido_origem_id uuid);
 insert into separacoes_pedidos values('${pedido}','${emp}',1000,'{}',now(),null,'aprovado',null);
 create table fin_receber(pedido_id uuid,valor numeric,aberto numeric,status text);
 insert into fin_receber values('${pedido}',1000,1000,'aberto');
 create table producao_itens(id uuid primary key,pedido_id uuid);
 insert into producao_itens values('${etapa}','${pedido}');
 create table producao_etapas(id uuid,producao_item_id uuid,estado text,quantidade_feita numeric);
 insert into producao_etapas values('${etapa}','${etapa}','pendente',0);
 create function producao_quadro(p_empresa uuid) returns jsonb language sql as $$select jsonb_build_object('pedido',jsonb_build_object('id',t.pedido_id)) from producao_itens t$$;
 create function pedido_pagamento_conferir(p_pedido uuid,p_etapa text) returns void language plpgsql as $$declare s jsonb;begin s:=pedido_pagamento_situacao(p_pedido,p_etapa);if not(s->>'liberada')::boolean then raise exception 'Aguardando Financeiro';end if;end$$;
 create table caminhoes(id uuid,empresa_id uuid,codigo text,placa text);
 insert into caminhoes values('${c1}','${emp}','C1','AAA0001'),('${c2}','${emp}','C2','AAA0002');
 create function operacao_caminhao_conferir(uuid) returns void language plpgsql as $$begin end$$;
 create table pecas(chave text,nome text,esperado numeric);
 insert into pecas values('cadeira','Cadeira',10),('mesa','Mesa',2);
 create function operacao_conferencia_pecas(uuid) returns setof pecas language sql as $$select * from pecas$$;
 create table separacoes_etiquetas(separacao_pedido_id uuid,separacao_item_id uuid,item_id uuid,lida_carregamento_em timestamptz);
 create function operacao_concluir_conferencia(p_pedido uuid,p_etapa text,p_aceitar_faltas boolean default false,p_quantidades jsonb default null,p_observacoes jsonb default null,p_primeira jsonb default null) returns jsonb language plpgsql as $$begin perform public.operacao_caminhao_conferir(p_pedido);return '{}';end$$;
 `);await db.exec(migration('20261102000400_producao_bloqueio_financeiro'));return db;}
test('production: independent percentage, exact threshold, canceled receivables and direct quantity bypass',async()=>{
 const db=await fixture();try{
  const status=async stage=>(await db.query('select pedido_pagamento_situacao($1,$2) s',[pedido,stage])).rows[0].s;
  assert.equal((await status('producao')).liberada,true);
  await db.exec('update empresa_financeiro set producao_pagamento_exige=true,producao_pagamento_percent=30');
  assert.equal((await status('producao')).liberada,false);
  await assert.rejects(db.exec("update producao_etapas set estado='execucao'"),/Financeiro/);
  await assert.rejects(db.exec('update producao_etapas set quantidade_feita=1'),/Financeiro/);
  await db.exec('update fin_receber set aberto=700.01');assert.equal((await status('producao')).liberada,false);
  await db.exec('update fin_receber set aberto=700');assert.equal((await status('producao')).liberada,true);
  assert.equal((await status('carregamento')).liberada,false);
  assert.equal((await status('triagem')).liberada,true);
  await db.exec("update producao_etapas set estado='execucao',quantidade_feita=1");
  await db.exec("update producao_etapas set estado='pausada';update fin_receber set aberto=1000");
  await assert.rejects(db.exec("update producao_etapas set estado='execucao'"),/Financeiro/);
  await db.exec(`insert into fin_receber values('${pedido}',10000,0,'cancelado')`);assert.equal((await status('producao')).liberada,false);
  await assert.rejects(db.exec('update empresa_financeiro set producao_pagamento_percent=101'),/check/);
 }finally{await db.close();}
});
test('truck distribution: partial loads stay open, totals, stale token, permissions and final reconciliation',async()=>{
 const db=await fixture();try{
  await db.exec(migration('20261102000500_carga_por_veiculo'));await db.exec('update fin_receber set aberto=0');
  const base=async()=>(await db.query('select operacao_carga_veiculo_base($1) b',[pedido])).rows[0].b;
  const save=async(cam,chair,table,token)=>(await db.query('select operacao_carga_veiculo_salvar($1,$2,$3,$4) b',[pedido,cam,[{chave:'cadeira',quantidade:chair},{chave:'mesa',quantidade:table}],token])).rows[0].b;
  const first=await base(),a=await save(c1,6,1,first.token);assert.equal(a.concluido,false);
  await assert.rejects(save(c2,4,1,first.token),/mudou/);
  await assert.rejects(save(c2,5,1,a.token),/excede/);
  await assert.rejects(db.query('select operacao_carga_distribuicao_conferir($1,$2)',[pedido,{cadeira:10,mesa:2}]),/distribuicao/);
  const b=await save(c2,4,1,a.token);assert.equal(b.veiculos.length,2);assert.equal(b.concluido,false);
  await db.query('select operacao_carga_distribuicao_conferir($1,$2)',[pedido,{cadeira:10,mesa:2}]);
  await assert.rejects(save(c2,-1,1,b.token),/invalida/);
  await db.exec("set test.negar='sim'");await assert.rejects(base(),/acesso/);await db.exec("set test.negar=''");
  await db.exec(`update separacoes_pedidos set operacao=operacao||'{"carregamento":{"concluido_em":"2026-11-02"}}'`);
  await assert.rejects(save(c2,4,1,b.token),/concluido/);
 }finally{await db.close();}
});
test('all operational exceptions have explicit reachable branches',()=>{
 const f=require('../Modulos/Gestao/Fluxograma/fluxograma-detalhado.js');f.validarFluxo();
 for(const id of ['producao_paga','entrada_confirmada','recuperar_separacao','troca_aceita','retirada_aceita','transportador_disponivel','frete_aceito','carga_completa','outro_caminhao','equipe_free','uber_free','quebra_evento','repor_evento','registros_evento']){
  const n=f.nos.find(n=>n.id===id);assert.equal(n.tipo,'decisao',id);assert.equal(n.saidas.length,2,id);
 }
});
test('mounting: shared records, trustworthy origin and company access',async()=>{
 const db=await fixture();try{
  await db.exec(`create table app_sessoes(token_hash text,tipo text,expira_em timestamptz);
   insert into app_sessoes values('mobile-token','montador',now()+interval '1 day');
   create function app_hash(text) returns text language sql immutable as $$select $1$$;
   create function app_sessao(p_token text,p_tipo text) returns app_sessoes language plpgsql stable as $$declare s app_sessoes;begin select * into strict s from app_sessoes where token_hash=p_token;return s;end$$;
   create function mont_login_supervisor() returns jsonb language plpgsql as $$begin insert into app_sessoes values('system-token','montador',now()+interval '1 day');return '{"token":"system-token"}';end$$;
   create table operacao_etapas(id uuid,empresa_id uuid,pedido_id uuid,nome text,tipo text,data date,hora time);
   insert into operacao_etapas values('${etapa}','${emp}','${pedido}','Montagem','montagem','2026-11-02','08:00');
   create table operacao_registros(id uuid default gen_random_uuid(),empresa_id uuid,etapa_id uuid,tipo text,dados jsonb,autor text,criado_em timestamptz default now());`);
  await db.exec(migration('20261102000600_montagem_sistema_origem'));
  await db.exec(`create function enviar(token text,tipo text) returns void language plpgsql as $$begin
   perform app_sessao(token,'montador');insert into operacao_registros(empresa_id,etapa_id,tipo,dados,autor) values('${emp}','${etapa}',tipo,'{}','Operador');end$$;`);
  await db.exec("select enviar('mobile-token','equipe');select mont_login_sistema();select enviar('system-token','sacolas');");
  const r=(await db.query('select logistica_montagem_registros($1) r',[pedido])).rows[0].r;
  assert.equal(r[0].registros.find(r=>r.tipo==='equipe').origem,'mobile');
  assert.equal(r[0].registros.find(r=>r.tipo==='sacolas').origem,'sistema');
  await db.exec("set test.negar='sim'");await assert.rejects(db.query('select logistica_montagem_registros($1)',[pedido]),/acesso/);
 }finally{await db.close();}
});

test('sequential loads: one vehicle per lot, append only, automatic final completion and rollback',async()=>{
 const db=await fixture();try{
  await db.exec(migration('20261102000500_carga_por_veiculo'));
  await db.exec(`alter table caminhoes add column status text default 'ativo';update fin_receber set aberto=0;
   create function operacao_registrar_caminhoes(p_pedido uuid,p_caminhoes uuid[]) returns jsonb language plpgsql as $$begin return to_jsonb(p_caminhoes);end$$;
   create function operacao_concluir_com_pendencia(p_pedido uuid,p_etapa text,p_aceitar_faltas boolean,p_quantidades jsonb,p_observacoes jsonb,p_pendencia jsonb) returns jsonb language plpgsql as $$begin return operacao_concluir_conferencia(p_pedido,p_etapa,p_aceitar_faltas,p_quantidades,p_observacoes);end$$;
   create or replace function operacao_concluir_conferencia(p_pedido uuid,p_etapa text,p_aceitar_faltas boolean default false,p_quantidades jsonb default null,p_observacoes jsonb default null,p_primeira jsonb default null) returns jsonb language plpgsql as $$declare r jsonb;begin
    perform operacao_carga_distribuicao_conferir(p_pedido,p_quantidades);
    if current_setting('test.falhar',true)='sim' then raise exception 'falha final';end if;
    r:=jsonb_build_object('concluido_em',now(),'quantidades',p_quantidades,'observacoes',p_observacoes);
    update separacoes_pedidos set operacao=jsonb_set(operacao,'{carregamento}',r) where id=p_pedido;return r;end$$;`);
  await db.exec(migration('20261108000400_carregamento_sequencial'));
  const base=async()=>(await db.query('select operacao_carga_veiculo_base($1) b',[pedido])).rows[0].b;
  const save=async(cam,q,token,obs={})=>(await db.query('select operacao_carregamento_lote($1,$2,$3,$4,$5) r',[pedido,cam,[{chave:'cadeira',quantidade:q},{chave:'mesa',quantidade:1}],token,obs])).rows[0].r;
  const b=await base();await assert.rejects(save(c1,11,b.token),/excede/);assert.equal((await base()).veiculos.length,0);
  const primeiro=await save(c1,6,b.token,{cadeira:'Primeiro lote'});assert.equal(primeiro.registro,null);assert.equal(primeiro.base.concluido,false);assert.equal(primeiro.base.veiculos.length,1);
  await assert.rejects(save(c1,4,primeiro.base.token),/ja teve/);
  await assert.rejects(save(c2,4,b.token),/mudou/);
  await db.exec("set test.falhar='sim'");await assert.rejects(save(c2,4,primeiro.base.token),/falha final/);assert.equal((await base()).veiculos.length,1);await db.exec("set test.falhar=''");
  const ultimo=await save(c2,4,primeiro.base.token,{mesa:'Segundo lote'});assert.equal(ultimo.base.concluido,true);assert.equal(ultimo.base.veiculos.length,2);assert.deepEqual(ultimo.registro.quantidades,{cadeira:10,mesa:2});assert.deepEqual(ultimo.registro.observacoes,{cadeira:'Primeiro lote',mesa:'Segundo lote'});
  await assert.rejects(save(c2,4,ultimo.base.token),/concluido/);
 }finally{await db.close();}
});


test('sequential unloading: independent vehicles, stale token, quantities, rollback and shortages',async()=>{
 const db=await fixture();try{
  await db.exec(`alter table caminhoes add column status text default 'ativo',add column modelo text,add column tipo text,add column foto_url text;
   alter table separacoes_pedidos add column modo_separacao text default 'manual';
   alter table separacoes_etiquetas add column empresa_id uuid,add column lida_descarregamento_em timestamptz;
   create table operacao_etapas(id uuid,empresa_id uuid,pedido_id uuid,tipo text);
   create table operacao_etapa_caminhoes(etapa_id uuid,caminhao_id uuid);
   create function pedido_grupo(uuid) returns uuid[] language sql as $$select array[$1]$$;
   create function pedido_grupo_carregamento(uuid) returns jsonb language sql as $$select null::jsonb$$;
   create function operacao_conferencia_pecas(uuid,boolean) returns setof pecas language sql as $$select * from pecas$$;
   create function operacao_validar_etapa(separacoes_pedidos,text) returns void language plpgsql as $$begin end$$;
   create or replace function operacao_concluir_conferencia(p_pedido uuid,p_etapa text,p_aceitar_faltas boolean default false,p_quantidades jsonb default null,p_observacoes jsonb default null,p_primeira jsonb default null) returns jsonb language plpgsql as $$declare r jsonb;begin
    if current_setting('test.falhar',true)='sim' then raise exception 'falha final';end if;
    r:=jsonb_build_object('concluido_em',now(),'quantidades',p_quantidades,'aceitar_faltas',p_aceitar_faltas);
    update separacoes_pedidos set operacao=jsonb_set(operacao,'{descarregamento}',r) where id=p_pedido;return r;end$$;
   update separacoes_pedidos set operacao='{"carga_por_veiculo":[{"caminhao_id":"ida"}]}';
   insert into operacao_etapas values('${etapa}','${emp}','${pedido}','desmontagem');
   insert into operacao_etapa_caminhoes values('${etapa}','${c2}');`);
  await db.exec(migration('20261108000600_descarregamento_sequencial'));
  const base=async()=>(await db.query('select operacao_descarga_veiculo_base($1) b',[pedido])).rows[0].b;
  const save=async(cam,q,t,final=false)=>(await db.query('select operacao_descarregamento_lote($1,$2,$3,$4,$5,$6) r',[pedido,cam,q,t,{},final])).rows[0].r;
  const lot=(c,m)=>[{chave:'cadeira',quantidade:c},{chave:'mesa',quantidade:m}];
  assert.equal((await db.query('select * from operacao_caminhoes_volta_programados($1)',[[pedido]])).rows[0].caminhao_id,c2);
  let b=await base();assert.equal(b.veiculos.length,0);
  await assert.rejects(save(c1,lot(-1,0),b.token),/invalida/);
  await assert.rejects(save(c1,lot(0,0),b.token),/Informe/);
  const first=await save(c1,lot(6,1),b.token);assert.equal(first.registro,null);assert.equal(first.base.veiculos.length,1);
  await assert.rejects(save(c1,lot(1,0),first.base.token),/ja teve/);
  await assert.rejects(save(c2,lot(4,1),b.token),/mudou/);
  await db.exec("set test.falhar='sim'");await assert.rejects(save(c2,lot(4,1),first.base.token),/falha final/);assert.equal((await base()).veiculos.length,1);await db.exec("set test.falhar=''");
  const last=await save(c2,lot(4,1),first.base.token);assert.equal(last.base.concluido,true);assert.deepEqual(last.registro.quantidades,{cadeira:10,mesa:2});
  assert.equal(last.operacao.carga_por_veiculo[0].caminhao_id,'ida');
  await assert.rejects(save(c2,lot(1,0),last.base.token),/concluido/);
  await db.exec(`update separacoes_pedidos set operacao=operacao-'descarga_por_veiculo'-'descarregamento'`);
  b=await base();const partial=await save(c2,lot(2,0),b.token);const missing=await save(null,null,partial.base.token,true);
  assert.equal(missing.base.concluido,true);assert.equal(missing.registro.aceitar_faltas,true);assert.deepEqual(missing.registro.quantidades,{cadeira:2,mesa:0});
 }finally{await db.close();}
});
