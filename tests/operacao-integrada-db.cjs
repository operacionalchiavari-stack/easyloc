const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main(){
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create role anon;create role authenticated;create role service_role;
    create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select '{"email":"teste@local"}'::jsonb$$;
    create function public.eh_membro_empresa(uuid) returns boolean language sql as $$select true$$;
    create function public.funcionario_tabela_permitida(uuid,text,text) returns boolean language sql as $$select true$$;
    create function public.funcionario_pode(uuid,uuid,text) returns boolean language sql as $$select true$$;
    create table empresas(id uuid primary key);
    create table itens(id uuid primary key,empresa_id uuid,estoque_total numeric default 100);
    create table kit_itens(kit_id uuid,item_id uuid,quantidade numeric);
    create table itens_patrimonios(id uuid default gen_random_uuid(),empresa_id uuid,item_id uuid,codigo_patrimonio text);
    create table empresa_logistica_regras(empresa_id uuid primary key,separacao_dias_antes_evento integer default 30);
    create table separacoes_pedidos(id uuid primary key default gen_random_uuid(),empresa_id uuid,numero_pedido text,cliente_id uuid,cliente_nome text,contato_cliente text,tipo_evento text,local_id uuid,local_nome text,data_evento date,data_evento_fim date,data_entrega date,data_coleta date,data_hora timestamptz,valor_total numeric,status text default 'pendente',status_comercial text,observacoes jsonb default '{}',operacao jsonb default '{}',status_operacional text,criado_em timestamptz default now(),atualizado_em timestamptz default now());
    create table separacoes_itens(id uuid primary key default gen_random_uuid(),empresa_id uuid,separacao_pedido_id uuid references separacoes_pedidos(id),item_id uuid,item_nome text,codigo_item text,foto_url text,quantidade_solicitada numeric,quantidade_separada numeric default 0,componentes jsonb default '{}',patrimonios_lidos text[] default '{}',status text default 'pendente',atualizado_por uuid,created_at timestamptz default now(),atualizado_em timestamptz default now());
    create table separacoes_etiquetas(id uuid primary key default gen_random_uuid(),empresa_id uuid,separacao_pedido_id uuid,separacao_item_id uuid references separacoes_itens(id) on delete cascade,item_id uuid,codigo text,sequencia int,total_item int,lida_separacao_em timestamptz,lida_carregamento_em timestamptz,lida_retorno_em timestamptz,lida_descarregamento_em timestamptz);
    create table separacoes_leituras(empresa_id uuid,separacao_pedido_id uuid,separacao_item_id uuid,item_id uuid,codigo_lido text,tipo_controle text,usuario_id uuid,status_leitura text,observacao text);
    create table gs_linhas(planilha_id text,aba text,linha int,valores jsonb);
    insert into empresas values('10000000-0000-0000-0000-000000000001');
    insert into empresa_logistica_regras(empresa_id) values('10000000-0000-0000-0000-000000000001');
    insert into itens(id,empresa_id) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
  `);
  for(const file of ['20261018000600_operacao_integrada.sql','20261018000700_operacao_conferencias.sql','20261018000900_operacao_estoque_qualidade.sql','20261018001000_operacao_etapas_campo.sql','20261018001100_operacao_separacao_atomica.sql','20261018001200_operacao_leitura_comercial.sql']){
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
  }
  const empresa='10000000-0000-0000-0000-000000000001',item='20000000-0000-0000-0000-000000000001';
  const payload={empresa_id:empresa,numero_pedido:'001',cliente_nome:'Teste',status_comercial:'aprovado',data_evento:'2026-10-24'};
  const linhas=q=>[{item_id:item,item_nome:'Cadeira',quantidade_solicitada:q}];
  const save=async(id,q,rev)=> (await db.query('select pedido_salvar_integrado($1,$2,$3,$4) r',[id,payload,linhas(q),rev])).rows[0].r;
  const primeiro=await save(null,2,null);const pedido=primeiro.id;
  const linha=(await db.query('select id from separacoes_itens')).rows[0].id;
  await db.query("insert into separacoes_etiquetas(empresa_id,separacao_pedido_id,separacao_item_id,item_id,codigo,sequencia,total_item) values($1,$2,$3,$4,'001-001',1,2)",[empresa,pedido,linha,item]);
  await db.query("update separacoes_pedidos set status='em_separacao' where id=$1",[pedido]);
  let salvo=await save(pedido,3,0);
  assert.equal((await db.query('select id,quantidade_solicitada from separacoes_itens')).rows[0].id,linha);
  assert.equal((await db.query('select count(*)::int n from separacoes_etiquetas')).rows[0].n,1);
  await db.query('select operacao_atualizar_separacao($1,$2,0)',[linha,{quantidade_separada:1}]);
  await assert.rejects(()=>db.query('select operacao_atualizar_separacao($1,$2,0)',[linha,{quantidade_separada:1}]),/Outro aparelho/);
  await assert.rejects(()=>save(pedido,2,salvo.revisao),/liberação|libera/i);
  await db.query('select pedido_liberar_reducao($1,true)',[pedido]);
  await assert.rejects(()=>db.query('select operacao_atualizar_separacao($1,$2,1)',[linha,{quantidade_separada:2}]),/pausada/);
  await assert.rejects(()=>save(pedido,2,salvo.revisao),/outro aparelho/);
  salvo=await save(pedido,2,Number(salvo.revisao)+1);
  assert.equal((await db.query('select reducao_liberada_em from separacoes_pedidos')).rows[0].reducao_liberada_em,null);
  await assert.rejects(()=>db.query("update separacoes_pedidos set status='separado' where id=$1",[pedido]),/itens pendentes/);
  await db.query('update separacoes_itens set quantidade_separada=quantidade_solicitada where separacao_pedido_id=$1',[pedido]);
  await db.query("update separacoes_pedidos set status='separado' where id=$1",[pedido]);
  await assert.rejects(()=>save(pedido,3,salvo.revisao),/finalizada/);
  assert.equal((await db.query('select count(*)::int n from separacoes_etiquetas')).rows[0].n,1,'retirada preserva as etiquetas que continuam válidas');
  await db.query("insert into itens_patrimonios(empresa_id,item_id,codigo_patrimonio) values($1,$2,'PAT1')",[empresa,item]);
  await db.query("update separacoes_etiquetas set patrimonio_codigo='PAT1' where separacao_pedido_id=$1",[pedido]);
  await db.query("select operacao_ler_peca($1,'carregamento','PAT','PAT1')",[pedido]);
  await assert.rejects(()=>db.query("select operacao_ler_peca($1,'carregamento','PAT','PAT1')",[pedido]),/já foi conferido/);
  await db.query("select operacao_concluir_conferencia($1,'carregamento',false)",[pedido]);
  await assert.rejects(()=>db.query("select operacao_concluir_conferencia($1,'descarregamento',true)",[pedido]),/desmontagem/);
  const etapa='etapa-desmontagem';
  await db.query("insert into gs_linhas values('14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ','Cronograma',2,$1)",[JSON.stringify([etapa,'','','','','Desmontagem','','','','','','','','','','','',pedido])]);
  await db.query("insert into gs_linhas values('14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ','Cronograma',3,$1)",[JSON.stringify(['etapa-montagem','','','','','Montagem','','','','','','','','','','','',pedido])]);
  await db.query("select operacao_validar_campo('etapa-montagem')");
  await assert.rejects(()=>db.query('select operacao_validar_campo($1)',[etapa]),/registros obrigatórios/);
  for(const aba of ['EquipeTerceirizada','Montagem_Sacolas','Montagem_Posicionamento','Montagem_ListaAssinada']){
    await db.query("insert into gs_linhas values('14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ',$1,2,$2)",[aba,JSON.stringify(['registro','etapa-montagem'])]);
  }
  await db.query('select operacao_validar_campo($1)',[etapa]);
  await assert.rejects(()=>db.query("select operacao_concluir_conferencia($1,'descarregamento',true)",[pedido]),/Conclua todas/);
  await db.query("insert into gs_linhas values('14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ','Desmontagem_Conclusoes',2,$1)",[JSON.stringify(['c',etapa])]);
  await db.query("select operacao_ler_peca($1,'descarregamento','ENV','001-001')",[pedido]);
  await db.query("select operacao_concluir_conferencia($1,'descarregamento',false)",[pedido]);
  await db.query("select operacao_concluir_conferencia($1,'retorno',true)",[pedido]);
  await assert.rejects(()=>db.query('select operacao_encerrar($1)',[pedido]),/ocorrências/);
  await db.query("select operacao_ler_peca($1,'retorno','ENV','001-001')",[pedido]);
  await db.query("select operacao_concluir_conferencia($1,'retorno',false)",[pedido]);
  await db.query('select operacao_encerrar($1)',[pedido]);
  const op=(await db.query('select operacao,status_operacional from separacoes_pedidos')).rows[0];
  assert(op.operacao.carregamento && op.operacao.descarregamento && op.operacao.retorno);
  assert.equal(op.status_operacional,'encerrado');
  await assert.rejects(()=>save(null,101,null),/Saldo insuficiente/);
  const outra=await save(null,2,null);
  const outraLinha=(await db.query('select id from separacoes_itens where separacao_pedido_id=$1',[outra.id])).rows[0].id;
  await db.query('update separacoes_itens set quantidade_separada=2 where id=$1',[outraLinha]);
  await db.query("update separacoes_pedidos set status='separado',data_coleta='2026-10-01',operacao='{"+'"carregamento":{"concluido_em":"2026-10-01"},"descarregamento":{"concluido_em":"2026-10-02"}}'+"' where id=$1",[outra.id]);
  await db.query("insert into separacoes_etiquetas(empresa_id,separacao_pedido_id,separacao_item_id,item_id,codigo,lida_carregamento_em) values($1,$2,$3,$4,'002-001',now())",[empresa,outra.id,outraLinha,item]);
  const indisponivel=(await db.query("select * from operacao_indisponiveis($1,'2026-10-18')",[empresa])).rows;
  assert.equal(Number(indisponivel[0].quantidade),1);
  await db.query("select operacao_concluir_conferencia($1,'retorno',true)",[outra.id]);
  const ocorrencia=(await db.query('select id from operacao_ocorrencias where pedido_id=$1',[outra.id])).rows[0].id;
  await db.query("select operacao_resolver_ocorrencia($1,'perda','Perda confirmada pela equipe')",[ocorrencia]);
  await db.query("select operacao_resolver_ocorrencia($1,'perda','Repetição não pode baixar novamente')",[ocorrencia]);
  assert.equal(Number((await db.query('select estoque_total from itens where id=$1',[item])).rows[0].estoque_total),99);
  await db.query('select operacao_encerrar($1)',[outra.id]);
  await db.exec('alter table itens add column tipo text');
  const base='30000000-0000-0000-0000-000000000001',topo='30000000-0000-0000-0000-000000000002',
    tampo='30000000-0000-0000-0000-000000000003',kitA='30000000-0000-0000-0000-000000000004',kitB='30000000-0000-0000-0000-000000000005';
  for(const [id,total,tipo] of [[base,2,'Componente'],[topo,6,'Componente'],[tampo,6,'Componente'],[kitA,99,'Kit'],[kitB,99,'Kit']]){
    await db.query('insert into itens(id,empresa_id,estoque_total,tipo) values($1,$2,$3,$4)',[id,empresa,total,tipo]);
  }
  for(const [kit,peca] of [[kitA,base],[kitA,topo],[kitB,base],[kitB,tampo]]){
    await db.query('insert into kit_itens values($1,$2,1)',[kit,peca]);
  }
  const pedidoKit=(await db.query('select pedido_salvar_integrado(null,$1,$2,null) r',[
    {...payload,numero_pedido:'KIT-B',data_evento:'2026-12-01',data_entrega:'2026-12-01',data_coleta:'2026-12-03'},
    [{item_id:kitB,item_nome:'Outro kit',quantidade_solicitada:2}]
  ])).rows[0].r;
  const validar=(itens,ignorar=null)=>db.query('select operacao_validar_reserva($1,$2,$3,$4,$5)',[empresa,ignorar,itens,'2026-12-01','2026-12-03']);
  await assert.rejects(()=>validar([{item_id:kitA,quantidade_solicitada:1}]),/Saldo insuficiente/);
  await assert.rejects(()=>validar([{item_id:base,quantidade_solicitada:1}]),/Saldo insuficiente/);
  await validar([{item_id:topo,quantidade_solicitada:6}]);
  await validar([{item_id:kitA,quantidade_solicitada:2}],pedidoKit.id);
  await assert.rejects(()=>validar([{item_id:kitA,quantidade_solicitada:1},{item_id:kitB,quantidade_solicitada:2}],pedidoKit.id),/Saldo insuficiente/);
  console.log('ok - banco impede reservar kit ou componente consumido por outro kit e soma a demanda compartilhada do pedido');
  await db.close();
  console.log('ok - salvamento atômico, preservação das etiquetas, liberação, revisão concorrente, bloqueio final, leitura única e ciclo completo até encerramento');
}
main().catch(e=>{console.error(e);process.exit(1)});
