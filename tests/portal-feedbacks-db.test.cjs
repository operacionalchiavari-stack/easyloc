const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');

test('mural de feedbacks limita a leitura à empresa, aos retornos concluídos e aos campos do portal',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role authenticated; create role anon;
   create function eh_membro_empresa(e uuid) returns boolean language sql stable as $$
    select e::text=current_setting('teste.empresa',true) and current_setting('teste.segunda_etapa',true)='ok' $$;
   create table posvenda_contatos(id uuid primary key,empresa_id uuid,cliente_nome text,cliente_id uuid,status text,concluido_em timestamptz,
    atencao boolean,tratativa_concluida_em timestamptz,observacao text,respostas jsonb,observacoes_setor jsonb,telefone text,tratativa_obs text);
   create table clientes_empresas(id uuid primary key,empresa_id uuid,catalogo_logo_url text);
   create table separacoes_pedidos(id uuid primary key,empresa_id uuid,numero_pedido text,data_evento date,tipo_evento text,local_nome text,observacoes jsonb,valor_total numeric);
   create table posvenda_contato_pedidos(contato_id uuid,pedido_id uuid);`);
  await db.query('select set_config($1,$2,false)',['teste.empresa',id(1)]);
  await db.query('select set_config($1,$2,false)',['teste.segunda_etapa','ok']);
  await db.query('insert into clientes_empresas values ($1,$2,$3),($4,$5,$6)',[id(3),id(1),'https://fixture/foto.jpg',id(4),id(2),'https://fixture/outra-empresa.jpg']);
  const migration=fs.readFileSync('supabase/migrations/20261115001900_portal_feedbacks_decoradores.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  const inserir=async(n,op={})=>{
   const empresa=op.empresa||id(1),pid=id(n+1000);
   await db.query('insert into separacoes_pedidos values($1,$2,$3,$4,$5,$6,$7,99999)',[pid,op.empresaPedido||empresa,String(n),'2026-11-10','Casamento','Villa',JSON.stringify(op.teste?{teste_cronograma:true}:{})]);
   await db.query('insert into posvenda_contatos values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[
    id(n),empresa,'Decorador '+n,op.cliente||id(3),op.status||'concluido',op.semData?null:'2026-11-15T12:'+String(n%60).padStart(2,'0')+':00Z',
    op.atencao||false,op.resolvido?'2026-11-15T13:00:00Z':null,op.observacao===undefined?'Relato '+n:op.observacao,
    JSON.stringify(op.respostas===undefined?[]:op.respostas),JSON.stringify(op.setor||{}),'TELEFONE PRIVADO','TRATATIVA PRIVADA']);
   await db.query('insert into posvenda_contato_pedidos values($1,$2)',[id(n),pid]);
  };
  for(let n=10;n<25;n++)await inserir(n);
  await inserir(25,{atencao:true,resolvido:true,respostas:[{pergunta:'Montagem',respostas:['Teve atraso'],ruim:true,interno:'PRIVADO'}],setor:{montagem:'Montadores atenciosos',interno:'PRIVADO'}});
  await inserir(26,{observacao:null,respostas:[{pergunta:'Móveis',respostas:['Impecáveis']}],atencao:true});
  await inserir(27,{observacao:null,setor:{triagem:'Tudo certo'}});
  await inserir(28,{respostas:[{respostas:{invalido:true}}]});
  await inserir(29,{observacao:null,respostas:{invalido:true}});
  await inserir(30,{status:'pendente'});await inserir(31,{status:'sem_contato'});await inserir(32,{status:'dispensado'});
  await inserir(33,{observacao:'  ',respostas:[{respostas:['  ']}]});await inserir(34,{empresa:id(2)});
  await inserir(35,{empresaPedido:id(2)});await inserir(36,{teste:true});await inserir(37,{semData:true});
  const ler=async limite=>(await db.query('select portal_feedbacks_decoradores($1,$2) r',[id(1),limite])).rows[0].r.itens;
  await db.exec('set role authenticated');
  const ultimos=await ler(null);assert.equal(ultimos.length,6);
  assert.deepEqual(ultimos.map(f=>f.id),[28,27,26,25,24,23].map(id));
  assert.equal(ultimos[0].foto,'https://fixture/foto.jpg');
  assert.equal(ultimos[2].atencao,true);assert.equal(ultimos[2].retorno_concluido,false);
  assert.equal(ultimos[3].retorno_concluido,true);assert.equal(ultimos[3].respostas[0].ruim,true);
  assert.deepEqual(ultimos[3].observacoes_setor,{montagem:'Montadores atenciosos'});
  assert.equal(ultimos[3].eventos[0].pedido,'25');assert.equal(ultimos[3].eventos[0].local,'Villa');
  assert.doesNotMatch(JSON.stringify(ultimos),/PRIVAD|telefone|tratativa_obs|valor_total|feito_por|interno/);
  assert.equal((await ler(99)).length,12);assert.equal((await ler(0)).length,1);
  await assert.rejects(()=>db.query('select * from posvenda_contatos'),/permission denied/);
  await assert.rejects(()=>db.query('select portal_feedbacks_decoradores($1)',[id(2)]),/Sem acesso/);
  await assert.rejects(()=>db.query('select portal_feedbacks_decoradores(null)'),/Sem acesso/);
  await db.query('select set_config($1,$2,false)',['teste.segunda_etapa','pendente']);
  await assert.rejects(()=>db.query('select portal_feedbacks_decoradores($1)',[id(1)]),/Sem acesso/);
  await db.exec('set role anon');
  await assert.rejects(()=>db.query('select portal_feedbacks_decoradores($1)',[id(1)]),/permission denied/);
  await db.exec('reset role');
  await db.query('select set_config($1,$2,false)',['teste.segunda_etapa','ok']);
  await db.query('update posvenda_contatos set cliente_id=$1 where id=$2',[id(4),id(28)]);
  assert.equal((await ler(1))[0].foto,null,'foto de outra empresa não aparece');
  await db.query('select set_config($1,$2,false)',['teste.empresa',id(9)]);
  const vazio=(await db.query('select portal_feedbacks_decoradores($1) r',[id(9)])).rows[0].r;
  assert.deepEqual(vazio,{itens:[]});
 }finally{await db.close();}
});
