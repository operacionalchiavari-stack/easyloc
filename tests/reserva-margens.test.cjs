const { test } = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const { PGlite } = require('@electric-sql/pglite');

const EMP = '10000000-0000-0000-0000-000000000001', OUTRA = '10000000-0000-0000-0000-000000000009';
const KIT = '20000000-0000-0000-0000-000000000001', PE = '20000000-0000-0000-0000-000000000002', TAMPO = '20000000-0000-0000-0000-000000000003';
const CADEIRA = '20000000-0000-0000-0000-000000000004';
const P1 = '30000000-0000-0000-0000-000000000001', P2 = '30000000-0000-0000-0000-000000000002';

async function banco() {
  const db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
    create function auth.uid() returns uuid language sql as $$select '${EMP}'::uuid$$;
    create function auth.role() returns text language sql as $$select 'authenticated'$$;
    create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${EMP}'::uuid$$;
    create function funcionario_pode(uuid,uuid,text) returns boolean language sql as $$select true$$;
    create function catalogo_parametro_permite(uuid,text,text,uuid) returns boolean language sql as $$select true$$;
    create table itens(id uuid primary key,empresa_id uuid,codigo text,produto text,tipo text,estoque_total numeric,estoque_manutencao numeric,foto_url text);
    create table kit_itens(kit_id uuid,item_id uuid,quantidade numeric,empresa_id uuid);
    create table separacoes_pedidos(id uuid primary key,empresa_id uuid,status_comercial text,status text,numero_pedido text,cliente_nome text,local_nome text,
      data_entrega date,data_coleta date,data_evento date,data_evento_fim date,encerrado_operacional_em timestamptz);
    create table separacoes_itens(item_id uuid,separacao_pedido_id uuid,quantidade_solicitada numeric);
    create table separacoes_etiquetas(item_id uuid,separacao_pedido_id uuid,lida_carregamento_em timestamptz,lida_retorno_em timestamptz,codigo text);
    create table operacao_ocorrencias(empresa_id uuid,item_id uuid,pedido_id uuid,codigo text,tipo text,resolucao text,quantidade numeric,resolvida_em timestamptz);
    create table acervo_retornos(empresa_id uuid,pedido_id uuid,item_id uuid,estado text,quantidade numeric);
    insert into itens values
      ('${KIT}','${EMP}','KIT','Mesa','Kit',0,0,null),('${PE}','${EMP}','PE','Pé','Componente',8,0,null),
      ('${TAMPO}','${EMP}','TAMPO','Tampo','Componente',4,0,null),('${CADEIRA}','${EMP}','CAD','Cerimony','Item',2,0,null);
    insert into kit_itens values('${KIT}','${PE}',2,'${EMP}'),('${KIT}','${TAMPO}',1,'${EMP}');
    -- Pedido 1: 30/10 a 03/11, 2 cadeiras e 3 mesas (6 pés e 3 tampos).
    insert into separacoes_pedidos values('${P1}','${EMP}','aprovado',null,'1','Ana','Salão','2026-10-30','2026-11-03','2026-10-31',null,null);
    insert into separacoes_itens values('${CADEIRA}','${P1}',2),('${KIT}','${P1}',3);`);
  await db.exec(fs.readFileSync('supabase/migrations/20261028000100_disponibilidade_regra_unica.sql', 'utf8'));
  await db.exec(`create table empresa_fluxo_pedidos(empresa_id uuid primary key, acervo_antecedencia_horas numeric);
    create table empresa_logistica_regras(empresa_id uuid primary key, desmontagem_dias_apos_coleta integer);
    create function pedido_fluxo_configurar(uuid,boolean,boolean,numeric) returns void language plpgsql as $$begin end$$;
    create function acervo_item_bloqueado(uuid,uuid) returns boolean language sql as $$select false$$;
    create function acervo_itens_bloqueados(uuid) returns setof uuid language sql as $$select null::uuid where false$$;`);
  await db.exec(fs.readFileSync('supabase/migrations/20261102000200_parametros_periodo_reserva.sql','utf8'));
  return db;
}

const saldo=async(db,dia)=>(await db.query('select livre from operacao_livre_calc($1,$2::date,$2::date,null) where item_id=$3',[EMP,dia,CADEIRA])).rows[0].livre;
test('margens zero preservam limites; margens reservam antes e depois, sem somar bloqueio duas vezes', async()=>{
 const db=await banco();try{
 assert.equal(Number(await saldo(db,'2026-10-29')),2);
 await db.query('insert into empresa_fluxo_pedidos(empresa_id,reserva_dias_antes_entrega,reserva_dias_apos_desmontagem) values($1,2,3)',[EMP]);
 assert.equal(Number(await saldo(db,'2026-10-28')),0);
 assert.equal(Number(await saldo(db,'2026-11-06')),0);
 assert.equal(Number(await saldo(db,'2026-11-10')),2);
 await db.query("insert into acervo_retornos values($1,$2,$3,'triagem',2)",[EMP,P1,CADEIRA]);
 const r=(await db.query('select reservado,bloqueado from operacao_livre_calc($1,$2,$2,null) where item_id=$3',[EMP,'2026-11-04',CADEIRA])).rows[0];
 assert.equal(Number(r.reservado),2);assert.equal(Number(r.bloqueado),0);
 assert.equal(Number(await saldo(db,'2026-11-10')),0,'pendencia continua bloqueada depois da margem');
 }finally{await db.close();}
});
test('consulta do pedido considera sua propria margem e tabela mostra periodo ampliado',async()=>{
 const db=await banco();try{
 await db.query('insert into empresa_fluxo_pedidos(empresa_id,reserva_dias_antes_entrega,reserva_dias_apos_desmontagem) values($1,1,2)',[EMP]);
 const r=(await db.query('select livre from operacao_livre_calc($1,$2,$2,$3) where item_id=$4',[EMP,'2026-11-05',P2,CADEIRA])).rows[0];
 assert.equal(Number(r.livre),0);
 const detalhe=(await db.query('select pedido_estoque_detalhes($1,$2,$3,null,$3,$3) d',[EMP,CADEIRA,'2026-11-05'])).rows[0].d;
 assert.equal(detalhe.componentes[0].pedidos[0].inicio,'2026-10-29');
 assert.equal(detalhe.componentes[0].pedidos[0].fim,'2026-11-05');
 await db.query('insert into empresa_logistica_regras values($1,1)',[EMP]);
 const periodo=(await db.query('select fim::text from reserva_periodo($1,$2,$3)',[EMP,'2026-10-30','2026-11-03'])).rows[0];
 assert.equal(periodo.fim,'2026-11-06');
 }finally{await db.close();}
});
