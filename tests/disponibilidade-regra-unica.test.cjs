// Regra única de disponibilidade (migration 20261028000100): o pedido aberto não conta contra si mesmo, peça que voltou
// da coleta só bloqueia depois do período do pedido dela, e trânsito/Acervo/avaria do mesmo pedido não somam entre si.
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
  return db;
}
const livre = async (db, ini, fim, pedido = null) => Object.fromEntries((await db.query(
  `select item_id, livre from operacao_livre_calc($1,$2,$3,$4)`, [EMP, ini, fim, pedido])).rows.map((r) => [r.item_id, Number(r.livre)]));

test('o pedido aberto não conta contra si mesmo', async () => {
  const db = await banco();
  try {
    let l = await livre(db, '2026-10-30', '2026-11-03', P1);
    assert.equal(l[CADEIRA], 2, 'as 2 cadeiras são do próprio pedido');
    assert.equal(l[KIT], 4, 'mesa = componente mais limitado (4 tampos)');
    l = await livre(db, '2026-10-30', '2026-11-03');
    assert.equal(l[CADEIRA], 0); assert.equal(l[KIT], 1, 'outro pedido: sobram 2 pés e 1 tampo');
    const cat = (await db.query(`select pedido_catalogo_estoque('2026-10-31',$1,$2,'2026-10-30','2026-11-03') r`, [EMP, P1])).rows[0].r;
    assert.deepEqual(cat[CADEIRA].map(Number), [2, 2], 'card dentro do pedido 1');
    const catSemPedido = (await db.query(`select pedido_catalogo_estoque('2026-10-31',$1) r`, [EMP])).rows[0].r;
    assert.equal(Number(catSemPedido[CADEIRA][1]), 0, 'chamada antiga (2 argumentos) continua funcionando');
    assert.deepEqual((await db.query(`select pedido_disponibilidade_comercial($1,$2,$3,'2026-10-30','2026-11-03') r`,
      [EMP, P1, JSON.stringify([{ item_id: CADEIRA, quantidade_solicitada: 2 }])])).rows[0].r, []);
    await db.query(`select operacao_validar_reserva($1,$2,$3,'2026-10-30','2026-11-03')`,
      [EMP, P1, JSON.stringify([{ item_id: CADEIRA, quantidade_solicitada: 2 }, { item_id: KIT, quantidade_solicitada: 3 }])]);
    await assert.rejects(db.query(`select operacao_validar_reserva($1,null,$2,'2026-10-30','2026-11-03')`,
      [EMP, JSON.stringify([{ item_id: CADEIRA, quantidade_solicitada: 1 }])]), /Cerimony.*disponível no período: 0/);
    const det = (await db.query(`select pedido_estoque_detalhes($1,$2,'2026-10-31',$3) r`, [EMP, CADEIRA, P1])).rows[0].r.componentes[0];
    assert.equal(Number(det.livre), 2); assert.equal(det.pedidos.length, 1, 'o pedido aberto continua listado no quadro');
  } finally { await db.close(); }
});

test('peça que voltou da coleta só bloqueia depois do período do pedido e não soma com trânsito e avaria', async () => {
  const db = await banco();
  try {
    // Coleta confirmada: cadeiras e pés no Acervo "aguardando retorno", etiquetas carregadas sem retorno e uma avaria
    // aberta das mesmas cadeiras — são as mesmas peças físicas.
    await db.exec(`insert into acervo_retornos values('${EMP}','${P1}','${CADEIRA}','aguardando_retorno',2),('${EMP}','${P1}','${PE}','triagem',6);
      insert into separacoes_etiquetas values('${CADEIRA}','${P1}',now(),null,'E1'),('${CADEIRA}','${P1}',now(),null,'E2');
      insert into operacao_ocorrencias values('${EMP}','${CADEIRA}','${P1}',null,'avaria',null,1,null);`);
    let l = await livre(db, '2026-10-30', '2026-11-03');
    assert.equal(l[CADEIRA], 0, 'durante o pedido 1: reservadas, não reservadas + bloqueadas');
    assert.equal(l[KIT], 1, 'pés: 8 - 6 reservados = 2 (antes o Acervo tirava mais 6)');
    l = await livre(db, '2026-10-20', '2026-10-20');
    assert.equal(l[CADEIRA], 2, 'antes do evento o Acervo não bloqueia');
    l = await livre(db, '2026-11-05', '2026-11-05');
    assert.equal(l[CADEIRA], 0, 'depois da coleta: 2 bloqueadas (não 2+2+1)');
    assert.equal(l[KIT], 1, 'pés: 8 - 6 no Acervo');
    const bloq = (await db.query(`select quantidade from operacao_indisponiveis($1,'2026-11-05') where item_id=$2`, [EMP, CADEIRA])).rows;
    assert.deepEqual(bloq.map((r) => Number(r.quantidade)), [2]);
    // Um pedido novo de 03/11 (dia da coleta do 1) a 05/11 não pode contar a mesma cadeira duas vezes.
    await db.exec(`insert into separacoes_pedidos values('${P2}','${EMP}','aprovado',null,'2','Bia','Sítio','2026-11-03','2026-11-05','2026-11-04',null,null);
      update itens set estoque_total=4 where id='${CADEIRA}';`);
    l = await livre(db, '2026-11-03', '2026-11-05', P2);
    assert.equal(l[CADEIRA], 2, '4 em estoque - 2 do pedido 1 (reservadas em 03/11 ou no Acervo depois)');
    const det = (await db.query(`select pedido_estoque_detalhes($1,$2,'2026-11-05') r`, [EMP, CADEIRA])).rows[0].r.componentes[0];
    assert.equal(det.bloqueios.length, 1); assert.equal(Number(det.bloqueios[0].quantidade), 2);
    // Ocorrência sem pedido (manutenção do galpão) continua somando.
    await db.exec(`insert into operacao_ocorrencias values('${EMP}','${CADEIRA}',null,null,'manutencao',null,1,null)`);
    assert.equal((await livre(db, '2026-11-05', '2026-11-05'))[CADEIRA], 1);
    // Outra empresa não enxerga nada.
    assert.deepEqual((await db.query(`select * from operacao_indisponiveis($1,'2026-11-05')`, [OUTRA])).rows, []);
  } finally { await db.close(); }
});
