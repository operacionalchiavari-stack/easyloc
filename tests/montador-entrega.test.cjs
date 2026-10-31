const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const empresa='10000000-0000-0000-0000-000000000001',outra='10000000-0000-0000-0000-000000000002';
const pedido='20000000-0000-0000-0000-000000000001',etapa='30000000-0000-0000-0000-000000000001',volta='30000000-0000-0000-0000-000000000002';
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;
 create table app_sessoes(id uuid,empresa_id uuid,nome text,perfil text);
 insert into app_sessoes values(gen_random_uuid(),'${empresa}','Ana','RESPONSAVEL'),(gen_random_uuid(),'${outra}','Outro','SUPERVISOR');
 create table separacoes_pedidos(id uuid primary key,status_comercial text,encerrado_operacional_em timestamptz,operacao jsonb);
 insert into separacoes_pedidos values('${pedido}','aprovado',null,'{"carregamento":{"concluido_em":"2026-10-31"}}');
 create table operacao_etapas(id uuid primary key,empresa_id uuid,pedido_id uuid,tipo text);
 insert into operacao_etapas values('${etapa}','${empresa}','${pedido}','montagem'),('${volta}','${empresa}','${pedido}','desmontagem');
 create table operacao_apontamentos(id uuid primary key,etapa_id uuid,status text);
 insert into operacao_apontamentos values('40000000-0000-0000-0000-000000000001','${etapa}','ATIVO');
 create table operacao_registros(id uuid primary key default gen_random_uuid(),empresa_id uuid,etapa_id uuid,tipo text,dados jsonb,autor text,unique(etapa_id,tipo));
 create function app_sessao(text,text) returns app_sessoes language plpgsql as $$declare s app_sessoes;begin
  select * into s from app_sessoes where nome=case $1 when 'ana' then 'Ana' when 'outro' then 'Outro' else '' end;
  if s.id is null then raise exception 'SESSAO_EXPIRADA';end if;return s;end$$;
 create function mont_pode_ver(app_sessoes,uuid) returns boolean language sql as $$select true$$;
 create function mont_apontamento_ativo(app_sessoes) returns jsonb language sql as $$select jsonb_build_object('id',id) from operacao_apontamentos where status='ATIVO' limit 1$$;
 create table fixture_itens(chave text primary key,nome text,esperado numeric);
 insert into fixture_itens values('peca-a','Cadeira',3),('kit-b/peca-a','Cadeira do kit',2);
 create function mont_contagem_itens(text,uuid) returns jsonb language sql as $$select jsonb_build_object('itens',coalesce(jsonb_agg(to_jsonb(i)),'[]')) from fixture_itens i$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261031003000_montador_conferencia_entrega.sql','utf8'));return db;
}
const itens=()=>({'peca-a':{entregue:3,danificados:0},'kit-b/peca-a':{entregue:1,danificados:1,observacao:'Assento danificado',foto:'https://exemplo.test/dano.jpg'}});
const salvar=(db,d=itens(),token='ana',id=etapa)=>db.query('select mont_entrega_salvar($1,$2,$3) r',[token,id,d]);
test('entrega: quantidades, danos e foto persistem por peça; gravação repetida preserva o original',async()=>{
 const db=await fixture();try{
  const r=(await salvar(db)).rows[0].r;assert.equal(r.enviado,true);assert.equal(r.autor,'Ana');
  assert.equal(r.conferencia['kit-b/peca-a'].entregue,1);assert.equal(r.conferencia['kit-b/peca-a'].danificados,1);assert.match(r.conferencia['kit-b/peca-a'].foto,/dano.jpg/);
  assert.equal((await db.query('select dados from operacao_registros')).rows[0].dados.apontamentoId,'40000000-0000-0000-0000-000000000001');
  const alterado=itens();alterado['peca-a'].entregue=0;assert.equal((await salvar(db,alterado)).rows[0].r.conferencia['peca-a'].entregue,3);
  await db.exec("update fixture_itens set esperado=99,nome='Nome novo'");
  const anterior=(await db.query('select mont_entrega_itens($1,$2) r',['ana',etapa])).rows[0].r;
  assert.equal(anterior.itens.find(i=>i.chave==='peca-a').esperado,3);assert.equal(anterior.itens.find(i=>i.chave==='peca-a').nome,'Cadeira');
 }finally{await db.close();}
});
test('entrega: rejeita sessão inválida, outra empresa, etapa incorreta e apontamento encerrado',async()=>{
 const db=await fixture();try{
  await assert.rejects(salvar(db,itens(),'expirado'),/SESSAO/);await assert.rejects(salvar(db,itens(),'outro'),/acesso/);
  await assert.rejects(salvar(db,itens(),'ana',volta),/montagem/);
  await db.exec("update operacao_apontamentos set status='ENCERRADO'");await assert.rejects(salvar(db),/Inicie/);
  assert.equal((await db.query('select count(*)::int n from operacao_registros')).rows[0].n,0);
 }finally{await db.close();}
});
test('entrega: valida todos os itens e impede excesso, frações, dano sem descrição e foto inválida',async()=>{
 const db=await fixture();try{
  for(const [campo,valor] of [['entregue',4],['entregue',-1],['entregue',1.5],['entregue',null],['danificados',4],['danificados',-1],['danificados',0.5]]){
   const d=itens();d['peca-a'][campo]=valor;await assert.rejects(salvar(db,d));
  }
  const d=itens();delete d['peca-a'];await assert.rejects(salvar(db,d),/lista/);
  const e=itens();e.extra={entregue:0,danificados:0};await assert.rejects(salvar(db,e),/lista/);
  const f=itens();f['kit-b/peca-a'].observacao='';await assert.rejects(salvar(db,f),/Descreva/);
  const g=itens();g['kit-b/peca-a'].foto='javascript:alert(1)';await assert.rejects(salvar(db,g),/Foto/);
  await db.exec("update separacoes_pedidos set status_comercial='orcamento'");await assert.rejects(salvar(db),/liberado/);
  assert.equal((await db.query('select count(*)::int n from operacao_registros')).rows[0].n,0);
 }finally{await db.close();}
});
test('desmontagem: aceita a conferência nova e o posicionamento antigo; mantém demais registros obrigatórios',async()=>{
 const db=await fixture();try{
  await assert.rejects(db.query('select operacao_validar_etapa_campo($1)',[volta]),/registros/);
  for(const tipo of ['equipe','sacolas','lista_assinada'])await db.query("insert into operacao_registros(empresa_id,etapa_id,tipo,dados,autor) values($1,$2,$3,'{}','Ana')",[empresa,etapa,tipo]);
  await assert.rejects(db.query('select operacao_validar_etapa_campo($1)',[volta]),/registros/);
  await salvar(db);await db.query('select operacao_validar_etapa_campo($1)',[volta]);
  await db.exec("update operacao_registros set tipo='posicionamento' where tipo='conferencia_entrega'");await db.query('select operacao_validar_etapa_campo($1)',[volta]);
 }finally{await db.close();}
});
