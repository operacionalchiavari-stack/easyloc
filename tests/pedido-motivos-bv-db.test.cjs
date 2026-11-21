const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('motivos de BV: isolamento por empresa, permissão de parâmetros, 2FA e centavos da base',async()=>{
 const db=new PGlite(),emp='10000000-0000-0000-0000-000000000001',outra='10000000-0000-0000-0000-000000000002';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function eh_membro_empresa(uuid)returns boolean language sql as $$select $1='${emp}'::uuid$$;
   create function operacao_pode(uuid,text)returns boolean language sql as $$select eh_membro_empresa($1) and current_setting('test.editar',true) is distinct from 'nao'$$;
   create function seguranca_2fa_ok()returns boolean language sql as $$select current_setting('test.fator',true) is distinct from 'nao'$$;
   create table empresas(id uuid primary key);insert into empresas values('${emp}'),('${outra}');
   create function fin_moeda(p_txt text)returns numeric language sql immutable as $$select coalesce(nullif(replace(replace(regexp_replace(coalesce(p_txt,''),'[^0-9,.-]','','g'),'.',''),',','.'),'')::numeric,0)$$;`);
  const sql=fs.readFileSync('supabase/migrations/20261118000200_pedido_motivos_bv_desconto_area.sql','utf8');
  await db.exec(sql.slice(0,sql.indexOf('create function public.pedido_conferir_bv_desconto_area()'))+'commit;');
  const multiplos=fs.readFileSync('supabase/migrations/20261118000300_pedido_descontos_multiplas_areas.sql','utf8');
  await db.exec(multiplos.slice(0,multiplos.indexOf('create or replace function public.pedido_conferir_bv_desconto_area()'))+'commit;');
  const porArea={locacao:100.25,frete:50.1,montagem:30.2,customizacao:75.15};
  assert.deepEqual((await db.query('select pedido_descontos_areas($1) d',[{descontosAreas:porArea,descontoComercial:99999}])).rows[0].d,porArea);
  assert.equal(Number((await db.query('select fin_bv_base($1,1200)n',[{valores:{locacao_bv:1000},pagamento_config:{descontosAreas:porArea,descontoComercial:99999}}])).rows[0].n),899.75);
  for(const mapa of [{frete:-1},{montagem:.001},{locacao:'NaN'},{outra:1},[1,2]])await assert.rejects(db.query('select pedido_descontos_areas($1)',[{descontosAreas:mapa}]),/inválid/);
  for(const texto of ['100.25','100,25','R$ 100,25'])assert.equal(Number((await db.query('select pedido_valor_financeiro($1) n',[texto])).rows[0].n),100.25);
  for(const area of ['locacao','frete','montagem','customizacao']){
   const obs={valores:{locacao_bv:1000},pagamento_config:{descontoComercial:'100.25',descontoComercialArea:area}};
   assert.equal(Number((await db.query('select fin_bv_base($1,1200)n',[obs])).rows[0].n),area==='locacao'?899.75:1000);
  }
  await db.exec('set role authenticated');
  assert.equal((await db.query('select * from comercial_motivos_bv')).rows.length,3);
  await db.query("insert into comercial_motivos_bv(empresa_id,nome)values($1,'Acordo especial')",[emp]);
  await assert.rejects(db.query("insert into comercial_motivos_bv(empresa_id,nome)values($1,' acordo ESPECIAL ')",[emp]),/unique/);
  await assert.rejects(db.query("insert into comercial_motivos_bv(empresa_id,nome)values($1,'Outra empresa')",[outra]),/row-level security/);
  await assert.rejects(db.query('delete from comercial_motivos_bv'),/permission denied/,'desativação preserva motivos usados');
  await db.exec("set test.editar='nao'");
  await assert.rejects(db.query("insert into comercial_motivos_bv(empresa_id,nome)values($1,'Sem permissão')",[emp]),/row-level security/);
  assert.equal((await db.query('select * from comercial_motivos_bv')).rows.length,4,'leitura não exige permissão de edição dos parâmetros');
  await db.exec("set test.editar='sim';set test.fator='nao'");
  assert.equal((await db.query('select * from comercial_motivos_bv')).rows.length,0);
  await assert.rejects(db.query("insert into comercial_motivos_bv(empresa_id,nome)values($1,'Sem segundo fator')",[emp]),/row-level security/);
 }finally{await db.close();}
});
