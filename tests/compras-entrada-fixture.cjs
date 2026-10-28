const {createDB}=require('./compras-fluxo-db.cjs');const fs=require('node:fs');
async function createEntradaDB(){
 const db=await createDB();
 await db.exec(`create table permissoes_catalogo(chave text primary key,modulo text,submodulo text,acao text,descricao text,ordem int);
 create function funcionario_pode(uuid,uuid,text) returns boolean language sql as $$select coalesce(current_setting('test.geral',true),'sim')='sim'$$;
 create or replace function funcionario_tabela_permitida(uuid,text,text) returns boolean language sql as $$select coalesce(current_setting('test.compras',true),'sim')='sim'$$;
 create function almox_nome_usuario(uuid) returns text language sql as $$select 'Equipe Teste'$$;
 create table itens(id uuid primary key,empresa_id uuid,produto text,descricao_total text,codigo text,tipo text,estoque_total numeric default 0);
 create table produtos_almox(id text primary key,produto text,codigo text,unidade text,estoque numeric);
 insert into produtos_almox values('PROD_TESTE','Tinta','T01','LT',10);
 insert into itens values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Cadeira','Cadeira clara','C01','item',3),
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Outra empresa','Outra empresa','C02','item',4),
 ('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Kit','Kit','K01','kit',0);
 create function almox_produtos(uuid) returns table(id text,produto text,codigo text,unidade text) language sql as $$select id,produto,codigo,unidade from produtos_almox$$;
 create function almox_estoque_mover(uuid,text,numeric,text,numeric,text,text,text,text,text) returns jsonb language plpgsql as $$begin update produtos_almox set estoque=estoque+$3 where id=$2;return '{}';end$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261023003300_compras_galpao_registro.sql','utf8'));await db.exec("alter table itens add column foto_url text;update itens set foto_url='/slide1.jpg' where codigo='C01';");await db.exec(fs.readFileSync('supabase/migrations/20261023003400_compras_catalogo_fotos.sql','utf8'));await db.exec(`create function operacao_pode(uuid,text) returns boolean language sql as $$select true$$;
 create table almox_recebimentos(id uuid,pedido_id uuid,status text,numero_nf text,numero bigint,etapa int,origem text,created_at timestamptz);
 create function almox_receb_checar(uuid,text) returns void language sql as $$select$$;
 create function fin_semear(uuid) returns void language sql as $$select$$;
 create function fin_categoria(uuid,text) returns uuid language sql as $$select null::uuid$$;
 create table fin_pagar(empresa_id uuid,origem text,origem_id uuid,grupo uuid,fornecedor_id uuid,fornecedor_nome text,documento text,descricao text,emissao date,competencia date,vencimento date,valor numeric,parcela int,parcelas int,forma text,categoria_id uuid,observacoes text,criado_por uuid,status text default 'aberto',pago numeric default 0,cancelado_em timestamptz,cancelado_por uuid,cancelamento_motivo text);`);
 const receb=fs.readFileSync('supabase/migrations/20261022001500_almox_recebimento.sql','utf8');const inicio=receb.indexOf('create or replace function public.compras_pagamento_aplicar('),fim=receb.indexOf('create or replace function public.compras_pedido_pagamento(',inicio);await db.exec(receb.slice(inicio,fim));const iniLista=receb.indexOf('create or replace function public.almox_pedido_itens('),fimLista=receb.indexOf('create or replace function public.almox_receb_listar(',iniLista);await db.exec(receb.slice(iniLista,fimLista));await db.exec(fs.readFileSync('supabase/migrations/20261023003500_compras_pagamento_previsao.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261023003600_compras_sem_lotes_certificados.sql','utf8'));return db;
}
module.exports={createEntradaDB};
