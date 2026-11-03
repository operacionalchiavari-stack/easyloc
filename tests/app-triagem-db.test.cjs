const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const emp='10000000-0000-0000-0000-000000000001',user='10000000-0000-0000-0000-000000000002',pedido='20000000-0000-0000-0000-000000000001',outro='20000000-0000-0000-0000-000000000002',linha='30000000-0000-0000-0000-000000000001',linhaKit='30000000-0000-0000-0000-000000000002',item='40000000-0000-0000-0000-000000000001',kit='40000000-0000-0000-0000-000000000002',comp='40000000-0000-0000-0000-000000000003',comp2='40000000-0000-0000-0000-000000000004',etq='50000000-0000-0000-0000-000000000001';
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select '{"email":"triagem@teste.local"}'::jsonb$$;
 create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
 create function funcionario_tabela_permitida(uuid,text,text) returns boolean language sql as $$select $1='${emp}'::uuid and ($3='select' or coalesce(current_setting('test.editar',true),'')<>'nao')$$;
 create function seguranca_2fa_ok() returns boolean language sql as $$select coalesce(current_setting('test.segundo_fator',true),'')<>'pendente'$$;
 create table empresas(id uuid primary key);insert into empresas values('${emp}');
 create table separacoes_pedidos(id uuid primary key,empresa_id uuid,cliente_id uuid,cliente_nome text,local_nome text,numero_pedido text,data_entrega date,data_coleta date,data_evento date,pedido_origem_id uuid,modo_separacao text,status text default 'pendente',operacao jsonb default '{}',revisao int default 1,fluxo text default 'triagem',atualizado_por uuid,atualizado_em timestamptz);
 insert into separacoes_pedidos(id,empresa_id,numero_pedido,cliente_nome,local_nome,data_evento) values('${pedido}','${emp}','8','Decoradora','Local','2026-11-03'),('${outro}','${emp}','9','Outra','Local','2026-11-03');
 create table clientes_empresas(id uuid,empresa_id uuid,catalogo_logo_url text);
 create table itens(id uuid primary key,empresa_id uuid,codigo text,produto text,descricao_total text,tipo text,setor_estoque text,foto_url text,referencia text,qr_code text);
 insert into itens(id,empresa_id,codigo,produto,descricao_total,tipo,setor_estoque,foto_url) values('${item}','${emp}','CAD1','Cadeira',null,'Item','Moveis',null),('${kit}','${emp}','KIT1','Mesa kit',null,'Kit','Moveis',null),('${comp}','${emp}','TAM1','Tampo',null,'Item','Moveis',null),('${comp2}','${emp}','PE1','Pe',null,'Item','Moveis',null);
 create table separacoes_itens(id uuid primary key,separacao_pedido_id uuid,empresa_id uuid,item_id uuid,item_nome text,quantidade_solicitada numeric,quantidade_separada numeric default 0,componentes jsonb default '{}',patrimonios_lidos text[] default '{}',status text,tipo_controle text default 'quantidade');
 insert into separacoes_itens(id,separacao_pedido_id,empresa_id,item_id,item_nome,quantidade_solicitada) values('${linha}','${pedido}','${emp}','${item}','Cadeira',2),('${linhaKit}','${pedido}','${emp}','${kit}','Mesa',1);
 create table kit_itens(empresa_id uuid,kit_id uuid,item_id uuid,quantidade numeric);insert into kit_itens values('${emp}','${kit}','${comp}',1),('${emp}','${kit}','${comp2}',2);
 create table separacoes_etiquetas(id uuid primary key,empresa_id uuid,separacao_pedido_id uuid,separacao_item_id uuid,item_id uuid,codigo text,lida_separacao_em timestamptz,lida_carregamento_em timestamptz);
 insert into separacoes_etiquetas values('${etq}','${emp}','${pedido}','${linha}','${item}','8-001',null,null);
 create table itens_patrimonios(id uuid primary key,empresa_id uuid,item_id uuid,codigo_patrimonio text);
 insert into itens_patrimonios values(gen_random_uuid(),'${emp}','${item}','PATR-1');
 create table separacoes_leituras(empresa_id uuid,separacao_pedido_id uuid,separacao_item_id uuid,item_id uuid,codigo_lido text,tipo_controle text,usuario_id uuid,usuario_nome text,status_leitura text,observacao text,item_nome text);
 create function pedido_fluxo_etapa(p separacoes_pedidos) returns text language sql as $$select p.fluxo$$;
 create function pedido_grupo(uuid) returns uuid[] language sql as $$select array[$1]$$;
 create function separacao_meus_setores(uuid) returns jsonb language sql as $$select null::jsonb$$;
 create function separacao_setor_item(uuid) returns text language sql as $$select setor_estoque from itens where id=$1$$;
 create function separacao_producao_calc(uuid) returns table(item_id uuid,unidades numeric,prontas numeric,confirmadas numeric) language sql as $$select null::uuid,0::numeric,0::numeric,0::numeric where false$$;
 create function pedido_pagamento_situacao(uuid,text) returns jsonb language sql as $$select case when current_setting('test.financeiro',true)='bloqueado' then '{"liberada":false,"mensagem":"Aguardando financeiro"}' else '{"liberada":true}' end::jsonb$$;
 create function separacao_modos_disponiveis(uuid) returns jsonb language sql as $$select '{"qr":true}'::jsonb$$;
 create function separacao_definir_modo(uuid,text) returns text language plpgsql as $$begin update separacoes_pedidos set modo_separacao=$2 where id=$1;return $2;end $$;
 create function operacao_avarias_pedido(uuid) returns jsonb language sql as $$select '[]'::jsonb$$;
 create function operacao_atualizar_separacao(p_item uuid,p_dados jsonb,p_quantidade_anterior numeric,p_componentes_anteriores jsonb,p_etiqueta uuid) returns void language plpgsql as $$begin
 update separacoes_itens set quantidade_separada=(p_dados->>'quantidade_separada')::numeric,componentes=coalesce(p_dados->'componentes',componentes),patrimonios_lidos=case when p_dados?'patrimonios_lidos' then array(select jsonb_array_elements_text(p_dados->'patrimonios_lidos')) else patrimonios_lidos end where id=p_item;
 if p_etiqueta is not null then update separacoes_etiquetas set lida_separacao_em=now() where id=p_etiqueta;end if;
 end $$;
 create function operacao_concluir_retorno_avarias(p_pedido uuid,p_etapa text,p_aceitar_faltas boolean,p_quantidades jsonb,p_observacoes jsonb,p_primeira jsonb,p_danificados jsonb,p_fotos jsonb) returns jsonb language plpgsql as $$declare r jsonb:=jsonb_build_object('concluido_em',now(),'primeira_contagem',p_primeira,'danificados',p_danificados);begin update separacoes_pedidos set operacao=jsonb_set(operacao,'{retorno}',r) where id=p_pedido;return r;end $$;
 create function finalizar_valida() returns trigger language plpgsql as $$begin if new.status='separado' and exists(select 1 from separacoes_itens where separacao_pedido_id=new.id and quantidade_separada<quantidade_solicitada) then raise exception 'Ainda existem materiais pendentes';end if;return new;end $$;
 create trigger finalizar_valida before update of status on separacoes_pedidos for each row execute function finalizar_valida();`);
 const texto=fs.readFileSync('supabase/migrations/20261029001900_pedido_extra.sql','utf8'),a=texto.indexOf('create or replace function public.operacao_conferencia_pecas('),b=texto.indexOf('revoke all on function public.operacao_conferencia_pecas',a);
 await db.exec(texto.slice(a,b));await db.exec(fs.readFileSync('supabase/migrations/20261103001200_app_triagem.sql','utf8'));
 return db;
}
test('app Triagem: leitura atomica, etiqueta/patrimonio duplicados, kits e bloqueios reais',async()=>{
 const db=await fixture();try{
 const base=async(etapa='ida')=>(await db.query('select triagem_app_base($1,$2) b',[pedido,etapa])).rows[0].b;
 const ler=(cod,id,etapa='ida',ped=pedido)=>db.query('select triagem_app_ler($1,$2,$3,null,$4) r',[ped,etapa,cod,id]);
 let b=await base();assert.equal(b.itens.length,3);
 const id='60000000-0000-0000-0000-000000000001';await ler('ACERVO:ENV:8-001',id);await ler('ACERVO:ENV:8-001',id);assert.equal(Number((await base()).itens.find(p=>p.item_id===item).separado),1);
 await assert.rejects(ler('ACERVO:ENV:8-001','60000000-0000-0000-0000-000000000002'),/conferida/);
 await assert.rejects(ler('ACERVO:ENV:8-001','60000000-0000-0000-0000-000000000003','ida',outro),/outro pedido/);
 await ler('ACERVO:PAT:PATR-1','60000000-0000-0000-0000-000000000004');
 await assert.rejects(ler('ACERVO:ITEM:CAD1','60000000-0000-0000-0000-000000000005'),/completa/);
 await ler('ACERVO:ITEM:TAM1','60000000-0000-0000-0000-000000000006');await ler('ACERVO:ITEM:PE1','60000000-0000-0000-0000-000000000007');
 b=await base();await assert.rejects(db.query("select triagem_app_finalizar($1,'ida',$2)",[pedido,b.token]),/pendentes/);
 await ler('ACERVO:ITEM:PE1','60000000-0000-0000-0000-000000000008');
 await assert.rejects(db.query("select triagem_app_finalizar($1,'ida',$2)",[pedido,b.token]),/outro aparelho/);
 b=await base();const pronto=(await db.query("select triagem_app_finalizar($1,'ida',$2) b",[pedido,b.token])).rows[0].b;assert.equal(pronto.concluido,true);
 await db.exec("set test.segundo_fator='pendente'");await assert.rejects(base(),/duas etapas/);await db.exec("set test.segundo_fator='ok'");
 await db.exec("set test.editar='nao'");assert.equal((await base()).pode_editar,false);
 assert.equal(Number((await db.query('select count(*) n from triagem_app_leituras')).rows[0].n),5);
 }finally{await db.close();}
});
test('app Triagem: retorno exige todas as quantidades e segunda contagem antes de concluir',async()=>{
 const db=await fixture();try{
 await db.query("update separacoes_pedidos set fluxo='triagem_retorno' where id=$1",[pedido]);
 const base=async()=>(await db.query("select triagem_app_base($1,'volta') b",[pedido])).rows[0].b;
 let b=await base(),q=Object.fromEntries(b.itens.map(p=>[p.chave,Number(p.esperado)]));q[linha+'|'+item]=1;
 const concluir=(quant,primeira)=>db.query("select triagem_app_finalizar($1,'volta',$2,$3,$4,'{}','{}') b",[pedido,b.token,quant,primeira]);
 await assert.rejects(concluir({},null),/Preencha/);await assert.rejects(concluir(q,null),/segunda contagem/);
 const leitura=(await db.query("select triagem_app_ler($1,'volta','ACERVO:PAT:PATR-1') r",[pedido])).rows[0].r;assert.equal(leitura.unico,true);
 const fim=(await concluir(q,q)).rows[0].b;assert.equal(fim.concluido,true);
 }finally{await db.close();}
});
test('app Triagem: ambiguidade, lotes de outro setor, modo travado e financeiro',async()=>{
 const db=await fixture();try{
 const base=async()=>(await db.query("select triagem_app_base($1,'ida') b",[pedido])).rows[0].b;
 const outraLinha='30000000-0000-0000-0000-000000000003';
 await db.query("insert into separacoes_itens(id,separacao_pedido_id,empresa_id,item_id,quantidade_solicitada) values($1,$2,$3,$4,1)",[outraLinha,pedido,emp,item]);
 const id='60000000-0000-0000-0000-000000000009';
 const escolha=(await db.query("select triagem_app_ler($1,'ida','ACERVO:ITEM:CAD1',null,$2) r",[pedido,id])).rows[0].r;
 assert.equal(escolha.escolher.length,2);assert.equal(Number((await db.query('select count(*) n from triagem_app_leituras')).rows[0].n),0);
 await db.query("select triagem_app_ler($1,'ida','ACERVO:ITEM:CAD1',$2,$3)",[pedido,outraLinha+'|'+item,id]);
 assert.equal(Number((await db.query('select quantidade_separada q from separacoes_itens where id=$1',[outraLinha])).rows[0].q),1);
 await db.exec("set test.financeiro='bloqueado'");assert.match((await base()).bloqueio,/financeiro/);await db.exec("set test.financeiro='liberado'");
 await db.query("update separacoes_pedidos set modo_separacao='manual' where id=$1",[pedido]);assert.match((await base()).bloqueio,/outro modo/);
 await db.query("update separacoes_pedidos set modo_separacao='qr' where id=$1",[pedido]);
 await db.exec("create or replace function separacao_meus_setores(uuid) returns jsonb language sql as $$select '[\"Loucas\"]'::jsonb$$");
 assert.equal((await base()).itens.length,0);
 await assert.rejects(db.query("select triagem_app_ler($1,'ida','ACERVO:ITEM:CAD1',null,gen_random_uuid())",[pedido]),/setor/);
 }finally{await db.close();}
});
