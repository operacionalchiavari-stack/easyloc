const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const empresa='10000000-0000-0000-0000-000000000001',outro='10000000-0000-0000-0000-000000000002',pedido='20000000-0000-0000-0000-000000000001',item='30000000-0000-0000-0000-000000000001',linha='40000000-0000-0000-0000-000000000001',chave=linha+'|'+item;
test('entrega particiona saldo, exige foto e retorno registra avaria atomicamente sem duplicar',async()=>{
 const source=fs.readFileSync('tests/entregas-coletas.test.cjs','utf8'),code=source.slice(source.indexOf('async function fixture(){'),source.indexOf('const base='));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const db=await new AsyncFunction('fs','PGlite','empresa','outro','pedido','item','linha','chave',code+';return fixture();')(fs,PGlite,empresa,outro,pedido,item,linha,chave);
 try{
 await db.exec(`alter table separacoes_pedidos add column pedido_origem_id uuid;
 create table itens(id uuid primary key,descricao_total text,produto text);insert into itens values('${item}','Cadeira Tiffany','Cadeira');
 create table acervo_retornos(id uuid primary key default gen_random_uuid(),empresa_id uuid,pedido_id uuid,chave text,item_id uuid,tipo text,quantidade numeric,estado text,motivo text,atualizado_por uuid,origem text,evidencias jsonb default '[]',os_id uuid,versao int default 1,criado_em timestamptz default now(),atualizado_em timestamptz default now(),unique(pedido_id,chave,tipo));
 create table acervo_historico(empresa_id uuid,retorno_id uuid,estado text,motivo text,usuario_id uuid);
 create table logistica_evidencias(id uuid default gen_random_uuid(),empresa_id uuid,pedido_id uuid,etapa text,chave text,path text);
 create function pedido_grupo(uuid) returns uuid[] language sql as $$select array[$1]$$;
 create function operacao_conferencia_pecas(uuid,boolean) returns table(chave text,pedido_id uuid,item_id uuid,nome text,esperado numeric) language sql as $$select chave,$1,item_id,nome,esperado from pecas$$;
 create function operacao_danificados_app(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function operacao_concluir_conferencia_sem_pagamento(p_pedido uuid,p_etapa text,p_aceitar_faltas boolean,p_quantidades jsonb,p_observacoes jsonb,p_primeira jsonb) returns jsonb language plpgsql as $f$ declare agrupado boolean:=false; begin if true and not agrupado then null;end if;return '{}';end $f$;
 create function operacao_concluir_conferencia(p_pedido uuid,p_etapa text,p_aceitar_faltas boolean,p_quantidades jsonb,p_observacoes jsonb,p_primeira jsonb) returns jsonb language plpgsql as $f$declare r jsonb:=jsonb_build_object('concluido_em',now(),'itens','[]'::jsonb);begin update separacoes_pedidos set operacao=jsonb_set(operacao,'{retorno}',r) where id=p_pedido;update acervo_retornos set estado='triagem' where pedido_id=p_pedido and estado='aguardando_retorno';return r;end $f$;`);
 const avarias=fs.readFileSync('supabase/migrations/20261101000700_avarias_app_triagem_volta.sql','utf8');await db.exec(avarias.slice(avarias.indexOf('create or replace function public.operacao_avarias_pedido')));
 await db.exec(fs.readFileSync('supabase/migrations/20261103001100_conferencia_entrega_retorno_colunas.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261103001500_entrega_desistencia_sobreposicao.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261103001600_entrega_motivos_por_coluna.sql','utf8'));
 const base=async(etapa='entrega')=>(await db.query('select logistica_confirmacao_base($1,$2) b',[pedido,etapa])).rows[0].b;
 const motivo=(await db.query("select id from logistica_motivos where etapa='entrega' limit 1")).rows[0].id;
 const dados=[{chave,entregue_local:6,desistencia:2,danificado:2,retirado_lista:0,motivo_id:motivo}];
 let b=await base();const salvar=()=>db.query('select logistica_confirmacao_salvar($1,$2,$3,$4,$5)',[pedido,'entrega',b.token,dados,'Supervisor']);
 await assert.rejects(salvar(),/foto/);
 assert.equal((await db.query('select count(*) n from logistica_confirmacoes')).rows[0].n,0);
 await db.query("insert into logistica_evidencias(empresa_id,pedido_id,etapa,chave,path) values($1,$2,'entrega',$3,'foto')",[empresa,pedido,chave]);
 await salvar();b=await base();assert.equal(b.atual.itens[0].entregue_local,6);assert.equal(b.atual.itens[0].entregue,10);assert.equal(b.atual.itens[0].voltou_antes,4);assert.equal(b.atual.itens[0].danificado,2);
 assert.equal(Number((await db.query("select quantidade from acervo_retornos where tipo='avaria'")).rows[0].quantidade),2);
 assert.equal(Number((await db.query("select quantidade from acervo_retornos where tipo='revisao'")).rows[0].quantidade),2);
 assert.equal((await base('coleta')).itens[0].previsto,6,'somente os seis deixados no evento sao coletados');
 // Novo significado: entrega inclui danos e desistencias podem abranger as mesmas unidades.
 const nova=async(entregue,danificado,desistencia)=>{
  const atual=await base();
  return db.query('select logistica_confirmacao_salvar($1,$2,$3,$4,$5)',[pedido,'entrega',atual.token,[{chave,entregue_local:entregue,danificado,desistencia,retirado_lista:0,motivo_id:motivo,conferencia_versao:2}],'Supervisor']);
 };
 const motivoSeparado=await base();
 await assert.rejects(db.query('select logistica_confirmacao_salvar($1,$2,$3,$4,$5)',[pedido,'entrega',motivoSeparado.token,[{chave,entregue_local:6,danificado:0,desistencia:2,retirado_lista:0,motivo_id:motivo,conferencia_versao:2,motivos:{desistencia:{id:motivo}}}],'Supervisor']),/motivo de entregue/);
 await db.query('select logistica_confirmacao_salvar($1,$2,$3,$4,$5)',[pedido,'entrega',motivoSeparado.token,[{chave,entregue_local:6,danificado:0,desistencia:2,retirado_lista:0,motivo_id:motivo,conferencia_versao:2,motivos:{entregue:{id:motivo},desistencia:{id:motivo}}}],'Supervisor']);
 const motivosSalvos=(await base()).atual.itens[0].motivos;
 assert.equal(motivosSalvos.entregue.id,motivo);assert.equal(motivosSalvos.desistencia.id,motivo);
 await nova(10,4,5);
 assert.equal((await base()).atual.itens[0].entregue,10);
 assert.equal((await base()).atual.itens[0].voltou_antes,5);
 assert.equal((await base()).atual.itens[0].conferencia_versao,2);
 assert.equal((await base('coleta')).itens[0].previsto,5,'cinco unidades permanecem no evento');
 assert.equal(Number((await db.query("select sum(quantidade) n from acervo_retornos")).rows[0].n),5,'dano e desistencia nao duplicam retorno');
 await assert.rejects(nova(3,4,0),/Quantidades/);
 await db.exec('update pecas set esperado=8');
 await nova(6,0,2);
 assert.equal((await base()).atual.itens[0].voltou_antes,0,'desistencia de duas nao entregues nao cria retorno');
 assert.equal((await base('coleta')).itens[0].previsto,6);
 assert.equal((await db.query('select count(*) n from acervo_retornos')).rows[0].n,0);
 await db.exec('update pecas set esperado=10');b=await base();await salvar();
 // Coleta precisa existir para registrar dano da volta; saldo em revisao simula a coleta real.
 await db.query("insert into logistica_confirmacoes(empresa_id,pedido_id,etapa,versao,criado_por,responsavel,itens) values($1,$2,'coleta',1,auth.uid(),'Supervisor','[]')",[empresa,pedido]);
 const confirmar=(q,danos)=>db.query("select operacao_concluir_retorno_avarias($1,'retorno',true,$2,'{}',null,$3,'{}') r",[pedido,{[chave]:q},{[chave]:danos}]);
 await assert.rejects(confirmar(4,5),/Danificados/);
 assert.equal((await db.query("select operacao->'retorno' r from separacoes_pedidos where id=$1",[pedido])).rows[0].r,null);
 await assert.rejects(db.query("select operacao_concluir_retorno_avarias($1,'retorno',true,$2,'{}',null,$3,$4)",[pedido,{[chave]:10},{[chave]:3},{[chave]:['caminho-invalido']}]),/Foto/);
 assert.equal((await db.query("select operacao->'retorno' r from separacoes_pedidos where id=$1",[pedido])).rows[0].r,null,'falha na avaria desfaz a confirmacao da contagem');
 await confirmar(10,3);
 assert.equal(Number((await db.query("select quantidade from acervo_retornos where chave=$1 and tipo='avaria'",['retorno:'+chave])).rows[0].quantidade),1);
 assert.equal(Number((await db.query("select sum(quantidade) n from acervo_retornos where tipo='avaria'")).rows[0].n),3);
 assert.equal((await db.query("select estado from acervo_retornos where chave=$1",['retorno:'+chave])).rows[0].estado,'triagem');
 await assert.rejects(confirmar(10,3),/ja confirmada/);
 }finally{await db.close();}
});
