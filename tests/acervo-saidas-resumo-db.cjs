const fs=require('node:fs'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite(),empresa='10000000-0000-0000-0000-000000000001',outra='10000000-0000-0000-0000-000000000002',a='20000000-0000-0000-0000-000000000001',b='20000000-0000-0000-0000-000000000002',c='20000000-0000-0000-0000-000000000003';
 try{
  await db.exec(`create role anon;create role authenticated;
   create table itens(id uuid primary key,empresa_id uuid,pendente boolean default false);
   create table disponibilidade(item_id uuid,dia date,total numeric,manutencao numeric,reservado numeric,bloqueado numeric);
   create function capas_pode(uuid) returns boolean language sql as $$select current_setting('test.acesso',true)='sim'$$;
   create function acervo_item_bloqueado(uuid,uuid) returns boolean language sql as $$select pendente from itens where id=$2 and empresa_id=$1$$;
   -- Simula a conta oficial: retorna o pior dia do intervalo, com livre limitado a zero.
   create function operacao_livre_calc(uuid,date,date,uuid) returns table(item_id uuid,total numeric,manutencao numeric,reservado numeric,bloqueado numeric,livre numeric)
    language sql as $$select distinct on(d.item_id) d.item_id,d.total,d.manutencao,d.reservado,d.bloqueado,greatest(0,d.total-d.manutencao-d.reservado-d.bloqueado)
     from disponibilidade d join itens i on i.id=d.item_id where i.empresa_id=$1 and d.dia between $2 and $3 order by d.item_id,(d.reservado+d.bloqueado) desc$$;
   insert into itens values('${a}','${empresa}',false),('${b}','${outra}',false),('${c}','${empresa}',true);
   insert into disponibilidade select '${a}',(date_trunc('month',now())+interval '1 month')::date+g,10,0,case when g<2 then 6 else 8 end,0 from generate_series(0,3) g;
   insert into disponibilidade values('${a}',(date_trunc('month',now())+interval '2 months')::date,10,1,11,0),('${b}',(date_trunc('month',now())+interval '1 month')::date,999,0,0,0),('${c}',(date_trunc('month',now())+interval '1 month')::date,10,0,12,0);
   set test.acesso='sim';`);
  await db.exec(fs.readFileSync('supabase/migrations/20261119000100_acervo_saidas_resumo_periodo.sql','utf8'));
  const {rows:[datas]}=await db.query("select (date_trunc('month',now())+interval '1 month')::date::text inicio,(date_trunc('month',now())+interval '2 months 3 days')::date::text fim");
  await db.exec('set role authenticated');
  const consultar=async(de=datas.inicio,ate=datas.fim,dia=false)=> (await db.query('select acervo_saidas_disponibilidade($1,$2,$3,$4,$5) r',[empresa,de,ate,[a,b,c],dia])).rows[0].r;
  const r=await consultar();assert.equal(r.length,2,'não retorna item de outra empresa');
  const meses=r.find(x=>x.item_id===a).periodos;assert.equal(meses.length,2);assert.equal(meses[0].livre,2,'reservas em dias distintos não são somadas');assert.equal(meses[1].livre,-2,'preserva déficit mesmo com cálculo oficial limitado a zero');assert.equal(meses[1].ate,datas.fim,'respeita mês parcial');
  assert.equal(r.find(x=>x.item_id===c).periodos[0].livre,0,'contagem pendente permanece bloqueada');
  const fimDia=new Date(datas.inicio+'T12:00:00');fimDia.setDate(fimDia.getDate()+3);const ate=fimDia.toISOString().slice(0,10);
  const diario=(await consultar(datas.inicio,ate,true)).find(x=>x.item_id===a).periodos;assert.equal(diario.length,4);assert.deepEqual(diario.map(x=>x.livre),[4,4,2,2]);
  await assert.rejects(consultar(datas.fim,datas.inicio),/período/);
  await assert.rejects(consultar(datas.inicio,datas.fim,true),/32 dias/);
  await assert.rejects(consultar('2000-01-01',datas.fim),/365 dias/);
  await assert.rejects(consultar(datas.inicio,'2099-01-01'),/365 dias/);
  await db.exec("set test.acesso='nao'");await assert.rejects(consultar(),/Sem acesso/);
  await db.exec('reset role;set role anon');await assert.rejects(consultar(),/permission denied/);
  console.log('OK: resumo mensal, meses parciais, concorrência, déficit, contagem pendente, detalhe diário, limite, acesso e isolamento por empresa.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
