const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const EMP='10000000-0000-0000-0000-000000000001',OUT='10000000-0000-0000-0000-000000000002',ITEM='20000000-0000-0000-0000-000000000001',FORN='40000000-0000-0000-0000-000000000001',FORN2='40000000-0000-0000-0000-000000000002';
const P1='30000000-0000-0000-0000-000000000001',P2='30000000-0000-0000-0000-000000000002',P3='30000000-0000-0000-0000-000000000003';
const ler=n=>fs.readFileSync('supabase/migrations/'+n+'.sql','utf8');
async function fixture(){const db=new PGlite();await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$select '${EMP}'::uuid$$;
 create function auth.role() returns text language sql as $$select 'authenticated'$$;
 create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${EMP}'::uuid$$;
 create function funcionario_pode(uuid,uuid,text) returns boolean language sql as $$select coalesce(current_setting('test.negar',true),'')<>'sim'$$;
 create function funcionario_tabela_permitida(uuid,text,text) returns boolean language sql as $$select coalesce(current_setting('test.negar',true),'')<>'sim'$$;
 create function catalogo_parametro_permite(uuid,text,text,uuid) returns boolean language sql as $$select true$$;
 create table empresas(id uuid primary key);insert into empresas values('${EMP}'),('${OUT}');
 create table fornecedores(id uuid primary key,empresa_id uuid,nome_razao_social text,nome_fantasia text,status text);
 insert into fornecedores values('${FORN}','${EMP}','Fornecedor A','','ativo'),('${FORN2}','${OUT}','Fornecedor externo','','ativo');
 create table itens(id uuid primary key,empresa_id uuid,codigo text,produto text,descricao_total text,tipo text,estoque_total numeric,estoque_manutencao numeric,foto_url text);
 insert into itens values('${ITEM}','${EMP}','CAD','Cadeira','Cadeira Dior','Item',10,0,null);
 create table kit_itens(kit_id uuid,item_id uuid,quantidade numeric,empresa_id uuid);
 create table separacoes_pedidos(id uuid primary key,empresa_id uuid,status_comercial text,status text,numero_pedido text,cliente_nome text,contato_cliente text,local_nome text,
 data_entrega date,data_coleta date,data_evento date,data_evento_fim date,encerrado_operacional_em timestamptz,status_operacional text,operacao jsonb default '{}',observacoes jsonb default '{}',atualizado_em timestamptz default now());
 create table separacoes_itens(id uuid primary key default gen_random_uuid(),item_id uuid,separacao_pedido_id uuid,quantidade_solicitada numeric);
 create table separacoes_etiquetas(item_id uuid,separacao_pedido_id uuid,lida_carregamento_em timestamptz,lida_retorno_em timestamptz,codigo text);
 create table operacao_ocorrencias(empresa_id uuid,item_id uuid,pedido_id uuid,codigo text,tipo text,resolucao text,quantidade numeric,resolvida_em timestamptz);
 create table acervo_retornos(empresa_id uuid,pedido_id uuid,item_id uuid,estado text,quantidade numeric);
 insert into separacoes_pedidos(id,empresa_id,status_comercial,status,numero_pedido,cliente_nome,contato_cliente,data_entrega,data_coleta,data_evento,observacoes) values
 ('${P1}','${EMP}','orcamento','pendente','1','Cliente alvo','123','2026-11-10','2026-11-12','2026-11-11','{"itens_comerciais":[{"item_id":"${ITEM}","quantidade_solicitada":10}]}'),
 ('${P2}','${EMP}','aprovado','pendente','2','Cliente B','456','2026-11-10','2026-11-12','2026-11-11','{}'),
 ('${P3}','${EMP}','aprovado','pendente','3','Cliente C','789','2026-11-10','2026-11-12','2026-11-11','{}');
 insert into separacoes_itens(item_id,separacao_pedido_id,quantidade_solicitada) values('${ITEM}','${P2}',4),('${ITEM}','${P3}',4);
 `);await db.exec(ler('20261028000100_disponibilidade_regra_unica'));
 await db.exec(`create table empresa_fluxo_pedidos(empresa_id uuid primary key,acervo_antecedencia_horas numeric);
 create table empresa_logistica_regras(empresa_id uuid primary key,desmontagem_dias_apos_coleta integer);
 create function pedido_fluxo_configurar(uuid,boolean,boolean,numeric) returns void language plpgsql as $$begin end$$;
 create function acervo_item_bloqueado(uuid,uuid) returns boolean language sql as $$select false$$;
 create function acervo_itens_bloqueados(uuid) returns setof uuid language sql as $$select null::uuid where false$$;
 create function pedido_salvar_integrado(p_id uuid,p_pedido jsonb,p_itens jsonb,p_revisao bigint default null) returns jsonb language plpgsql as $$begin
 if p_pedido->>'status_comercial'='aprovado' then perform operacao_validar_reserva('${EMP}',p_id,p_itens,'2026-11-10','2026-11-12');end if;
 update separacoes_pedidos set status_comercial=coalesce(p_pedido->>'status_comercial',status_comercial),data_coleta=coalesce((p_pedido->>'data_coleta')::date,data_coleta) where id=p_id;
 if p_pedido->>'status_comercial'='aprovado' then insert into separacoes_itens(item_id,separacao_pedido_id,quantidade_solicitada) select (x->>'item_id')::uuid,p_id,(x->>'quantidade_solicitada')::numeric from jsonb_array_elements(p_itens) x;end if;
 return jsonb_build_object('id',p_id);end$$;
 `);await db.exec(ler('20261102000200_parametros_periodo_reserva'));await db.exec(ler('20261102000700_pedido_sublocacoes'));await db.exec(ler('20261102000800_sublocacoes_remessas_parciais'));return db;}
const dados=status=>({item_id:ITEM,fornecedor_id:FORN,quantidade:8,custo_unitario:15,retirada:'2026-11-10',devolucao:'2026-11-12',status,observacao:'Fornecedor confirmou as unidades.'});
async function salvar(db,d,id=null,rev=null){return(await db.query('select pedido_sublocacao_salvar($1,$2,$3,$4) r',[P1,d,id,rev])).rows[0].r;}
async function aprovar(db){return db.query('select pedido_salvar_integrado($1,$2,$3)',[P1,{status_comercial:'aprovado'},[{item_id:ITEM,quantidade_solicitada:10}]]);}
test('quotes do not cover shortages; confirmed quantities use external supply without increasing owned stock',async()=>{
 const db=await fixture();try{
  const cot=await salvar(db,dados('cotacao'));assert.equal(cot.sublocacoes[0].status,'cotacao');
  await assert.rejects(aprovar(db),/Estoque insuficiente/);
  const s=cot.sublocacoes[0];const confirmado=await salvar(db,dados('confirmada'),s.id,s.revisao);
  await aprovar(db);
  const saldo=(await db.query('select * from operacao_livre_calc($1,$2,$3,null)',[EMP,'2026-11-10','2026-11-12'])).rows[0];
  assert.equal(Number(saldo.total),10);assert.equal(Number(saldo.reservado),10);assert.equal(Number(saldo.livre),0);
  const det=(await db.query('select pedido_estoque_detalhes($1,$2,$3,null,$3,$3) r',[EMP,ITEM,'2026-11-11'])).rows[0].r;
  assert.equal(Number(det.componentes[0].pedidos.find(p=>p.pedido_id===P1).quantidade),2);
  const c=confirmado.sublocacoes[0];await assert.rejects(salvar(db,dados('cancelada'),c.id,c.revisao),/Estoque insuficiente/);
  await assert.rejects(db.query('select pedido_salvar_integrado($1,$2,$3)',[P1,{data_coleta:'2026-11-14'},[]]),/período/);
 }finally{await db.close();}
});
test('multiple client reservations are listed, no automatic reassignment and no cross-company access',async()=>{
 const db=await fixture();try{
  const outros=(await db.query('select pedido_item_outros_pedidos($1,$2) r',[P1,ITEM])).rows[0].r;
  assert.deepEqual(outros.map(p=>[p.cliente,Number(p.quantidade)]),[['Cliente B',4],['Cliente C',4]]);
  assert.equal((await db.query('select count(*) n from separacoes_itens')).rows[0].n,2);
  await assert.rejects(salvar(db,{...dados('cotacao'),fornecedor_id:FORN2}),/não pertence/);
  await assert.rejects(db.query('select pedido_sublocacoes_listar($1)',[OUT]),/acesso/);
  await db.exec("set test.negar='sim'");await assert.rejects(salvar(db,dados('cotacao')),/permissão/);
 }finally{await db.close();}
});
test('receipt is required, status progression and optimistic locking preserve the audit history',async()=>{
 const db=await fixture();try{
  let b=await salvar(db,dados('confirmada')),s=b.sublocacoes[0];await aprovar(db);
  await assert.rejects(db.exec(`update separacoes_pedidos set status='separado' where id='${P1}'`),/aguardando recebimento/);
  await assert.rejects(salvar(db,dados('recebida'),s.id,99),/outra tela/);
  await assert.rejects(salvar(db,dados('devolvida'),s.id,s.revisao),/situação inválida/);
  b=await salvar(db,dados('recebida'),s.id,s.revisao);s=b.sublocacoes[0];
  await db.exec(`update separacoes_pedidos set status='separado' where id='${P1}'`);
  await assert.rejects(salvar(db,{...dados('recebida'),quantidade:7},s.id,s.revisao),/depois do recebimento/);
  b=await salvar(db,dados('devolvida'),s.id,s.revisao);s=b.sublocacoes[0];
  await assert.rejects(salvar(db,dados('devolvida'),s.id,s.revisao),/já devolvida/);
  assert.equal((await db.query('select count(*) n from pedido_sublocacoes_historico')).rows[0].n,3);
 }finally{await db.close();}
});
test('external quantity is deducted once across repeated lines; dates and quantities are validated',async()=>{
 const db=await fixture();try{
  await salvar(db,dados('confirmada'));await aprovar(db);
  await db.exec(`delete from separacoes_itens where separacao_pedido_id='${P1}';insert into separacoes_itens(item_id,separacao_pedido_id,quantidade_solicitada) values('${ITEM}','${P1}',4),('${ITEM}','${P1}',6);`);
  const saldo=(await db.query('select reservado from operacao_livre_calc($1,$2,$3,null)',[EMP,'2026-11-10','2026-11-12'])).rows[0];assert.equal(Number(saldo.reservado),10);
  await assert.rejects(salvar(db,{...dados('confirmada'),quantidade:3}),/ultrapassa/);
  await assert.rejects(salvar(db,{...dados('cotacao'),devolucao:'2026-11-09'}),/período/);
  await assert.rejects(salvar(db,{...dados('cotacao'),custo_unitario:-1}),/custo/);
 }finally{await db.close();}
});
test('flow only offers cancellation after explicit client closure and tries alternatives in order',()=>{
 const f=require('../Modulos/Gestao/Fluxograma/fluxograma-detalhado.js');f.validarFluxo();
 assert.deepEqual(f.nos.filter(n=>n.saidas.some(s=>s.destino==='cancelar')).map(n=>n.id),['encerrar_negociacao','cancelamento_analisado']);
 const n=id=>f.nos.find(n=>n.id===id),dest=(id,r)=>n(id).saidas.find(s=>s.rotulo===r).destino;
 assert.equal(dest('retirada_aceita','Não'),'item_outros_pedidos');assert.equal(dest('item_outros_pedidos','Não'),'possivel_sublocar');
 assert.equal(dest('ha_mais_reservas','Não'),'possivel_sublocar');
 for(const id of ['caminhao_ok','programar_caminhao','transportador_disponivel','buscar_freteiro','frete_aceito','reprogramar_frete'])assert.equal(n(id).fase,'planejamento');
 assert.equal(n('planejar').titulo,'Programar equipes e Uber');
});
test('partial receipts and returns keep the real balances and block separation until all pieces arrive',async()=>{
 const db=await fixture();try{
  let b=await salvar(db,dados('confirmada')),s=b.sublocacoes[0];await aprovar(db);
  b=await salvar(db,{...dados('recebida'),quantidade_recebida:6,quantidade_devolvida:0},s.id,s.revisao);s=b.sublocacoes[0];
  assert.equal(s.status,'recebida_parcial');assert.equal(s.quantidade_recebida,6);assert.equal(s.quantidade,8);
  await assert.rejects(db.exec(`update separacoes_pedidos set status='separado' where id='${P1}'`),/aguardando recebimento/);
  await assert.rejects(salvar(db,{...dados('recebida_parcial'),quantidade_recebida:5,quantidade_devolvida:0},s.id,s.revisao),/não podem diminuir/);
  b=await salvar(db,{...dados('recebida'),quantidade_recebida:8,quantidade_devolvida:0},s.id,s.revisao);s=b.sublocacoes[0];
  await db.exec(`update separacoes_pedidos set status='separado' where id='${P1}'`);
  b=await salvar(db,{...dados('devolvida'),quantidade_recebida:8,quantidade_devolvida:3},s.id,s.revisao);s=b.sublocacoes[0];
  assert.equal(s.status,'devolvida_parcial');assert.equal(s.quantidade_devolvida,3);
  await assert.rejects(salvar(db,{...dados('devolvida'),quantidade_recebida:8,quantidade_devolvida:9},s.id,s.revisao),/devolução não pode superar/);
  b=await salvar(db,{...dados('devolvida'),quantidade_recebida:8,quantidade_devolvida:8},s.id,s.revisao);assert.equal(b.sublocacoes[0].status,'devolvida');
 }finally{await db.close();}
});
test('supplier replacement transfers only the missing units atomically and preserves received ownership',async()=>{
 const db=await fixture();try{
  const novo='40000000-0000-0000-0000-000000000003';await db.exec(`insert into fornecedores values('${novo}','${EMP}','Fornecedor B','','ativo')`);
  let b=await salvar(db,dados('confirmada')),s=b.sublocacoes[0];await aprovar(db);
  b=await salvar(db,{...dados('recebida_parcial'),quantidade_recebida:6,quantidade_devolvida:0},s.id,s.revisao);s=b.sublocacoes[0];
  const payload={fornecedor_id:novo,custo_unitario:20,retirada:'2026-11-10',devolucao:'2026-11-12',observacao:'Os dois fornecedores confirmaram a transferencia do saldo.'};
  await assert.rejects(db.query('select pedido_sublocacao_transferir_saldo($1,$2,$3)',[s.id,s.revisao,{...payload,devolucao:'2026-11-11'}]),/período/);
  assert.equal((await db.query('select quantidade from pedido_sublocacoes where id=$1',[s.id])).rows[0].quantidade,8,'failed transfer rolls back both supplier contracts');
  b=(await db.query('select pedido_sublocacao_transferir_saldo($1,$2,$3) r',[s.id,s.revisao,payload])).rows[0].r;
  assert.equal(b.sublocacoes.find(x=>x.id===s.id).quantidade,6);assert.equal(b.sublocacoes.find(x=>x.id===s.id).quantidade_recebida,6);
  assert.equal(b.sublocacoes.find(x=>x.fornecedor_id===novo).quantidade,2);assert.equal(b.sublocacoes.find(x=>x.fornecedor_id===novo).quantidade_recebida,0);
  assert.equal(Number((await db.query('select pedido_sublocado_qtd($1,$2) n',[P1,ITEM])).rows[0].n),8);
  await assert.rejects(db.query('select pedido_sublocacao_transferir_saldo($1,$2,$3)',[s.id,s.revisao,payload]),/outra tela/);
 }finally{await db.close();}
});
test('outsourced kits consume only the owned remainder of each component',async()=>{
 const db=await fixture();try{
  const kit='20000000-0000-0000-0000-000000000002',parte='20000000-0000-0000-0000-000000000003';
  await db.exec(`insert into itens values('${kit}','${EMP}','KIT','Conjunto','Conjunto','kit',0,0,null),('${parte}','${EMP}','PARTE','Componente','Componente','item',10,0,null);
   insert into kit_itens values('${kit}','${parte}',2,'${EMP}');
   update separacoes_pedidos set observacoes='{"itens_comerciais":[{"item_id":"${kit}","quantidade_solicitada":3}]}' where id='${P1}';`);
  await salvar(db,{...dados('confirmada'),item_id:kit,quantidade:2});
  await db.query('select pedido_salvar_integrado($1,$2,$3)',[P1,{status_comercial:'aprovado'},[{item_id:kit,quantidade_solicitada:3}]]);
  const r=(await db.query('select reservado from operacao_livre_calc($1,$2,$3,null) where item_id=$4',[EMP,'2026-11-10','2026-11-12',parte])).rows[0];
  assert.equal(Number(r.reservado),2,'three kits, two outsourced: only one owned kit, two components');
 }finally{await db.close();}
});
