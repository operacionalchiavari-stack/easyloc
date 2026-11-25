const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('Contas do parceiro: pedido e foto pela origem do frete, valores preservados e isolamento da empresa',async()=>{
 const db=new PGlite(),uid=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
 const emp=uid(1),out=uid(2),forn=uid(3),fr=uid(4),ped=uid(5),cli=uid(6),lanc=uid(7),conta=uid(8),anuncio=uid(9),estranho=uid(10);
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql as $$select '${uid(99)}'::uuid$$;
   create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
   create function seguranca_2fa_ok() returns boolean language sql as $$select current_setting('test.duplo',true) is distinct from 'nao'$$;
   create function operacao_pode(uuid,text) returns boolean language sql as $$select current_setting('test.permissao',true) is distinct from 'nao'$$;
   create table frete_freteiros(id uuid,empresa_id uuid,fornecedor_id uuid);
   create table frete_anuncios(id uuid,empresa_id uuid,pedido_id uuid,freteiro_id uuid,data date,hora time,valor numeric,direcao text,destino text,status text);
   create table frete_lancamentos(id uuid,empresa_id uuid,freteiro_id uuid,anuncio_id uuid,pedido_id uuid,pagar_id uuid,avulso_id uuid,relatorio_id uuid,data date,valor numeric,direcao text,destino text,origem text,caminhao text,situacao text,divergencia text,created_at timestamptz default now());
   create function frete_lanc_total(frete_lancamentos) returns numeric language sql as $$select $1.valor$$;
   create table frete_avulsos(id uuid,empresa_id uuid,freteiro_id uuid,data date,origem text,destino text,motivo text,valor numeric,cancelado_em timestamptz);
   create table operacao_etapas(id uuid,empresa_id uuid,pedido_id uuid,data date,hora time,tipo text);
   create table operacao_etapa_caminhoes(etapa_id uuid,caminhao_id uuid);
   create table caminhoes(id uuid,fornecedor_id uuid,freteiro_id uuid,codigo text,modelo text,placa text);
   create function frete_direcao(text) returns text language sql as $$select case when $1='montagem' then 'entrega' end$$;
   create table separacoes_pedidos(id uuid,empresa_id uuid,numero_pedido text,cliente_nome text,cliente_id uuid,local_nome text,status_comercial text);
   create table clientes_empresas(id uuid,empresa_id uuid,catalogo_logo_url text);
   create table fin_pagar(id uuid,empresa_id uuid,origem text,origem_id uuid,fornecedor_id uuid,descricao text,documento text,competencia date,emissao date,vencimento date,valor numeric,pago numeric default 0,aberto numeric,status text default 'aprovado',aguardando_fechamento boolean default true,cancelado_em timestamptz);
   create table fin_baixas(pagar_id uuid,data date,estornado_em timestamptz,forma text);
   insert into frete_freteiros values('${fr}','${emp}','${forn}');
   insert into separacoes_pedidos values('${ped}','${emp}','19','Ana Souza','${cli}','Espaço Serra Verde','aprovado'),('${estranho}','${out}','999','Outra empresa','${uid(11)}','Outro local','aprovado');
   insert into clientes_empresas values('${cli}','${emp}','https://fixture/ana.jpg'),('${uid(11)}','${out}','https://fixture/privado.jpg');
   insert into frete_anuncios values('${anuncio}','${emp}','${ped}','${fr}','2026-11-22','08:30',250,'entrega','Espaço Serra Verde','aceito');
   insert into frete_lancamentos(id,empresa_id,freteiro_id,anuncio_id,pedido_id,pagar_id,data,valor,direcao,origem,destino,caminhao,situacao) values('${lanc}','${emp}','${fr}','${anuncio}',null,'${conta}','2026-11-22',250,'entrega','Galpão','Espaço Serra Verde','Iveco Daily · TST1F23','ok');
   insert into fin_pagar(id,empresa_id,origem,origem_id,fornecedor_id,descricao,competencia,vencimento,valor,aberto) values
    ('${conta}','${emp}','frete','${lanc}','${forn}','Frete aprovado','2026-11-22','2026-11-30',250,250),
    ('${uid(12)}','${emp}','sublocacao','${ped}','${forn}','Sublocação','2026-11-22','2026-11-30',400,400),
    ('${uid(13)}','${emp}','sublocacao','${estranho}','${forn}','Sem vínculo permitido','2026-11-22','2026-11-30',100,100);
   insert into frete_lancamentos(id,empresa_id,freteiro_id,data,valor,destino,caminhao,situacao) values
    ('${uid(14)}','${emp}','${fr}','2026-11-22',298.5,'Espaço Serra Verde','Iveco Daily · TST1F23','rascunho'),
    ('${uid(15)}','${emp}','${fr}','2026-11-22',280,'Galpão','Iveco Daily · TST1F23','rascunho'),
    ('${uid(16)}','${emp}','${fr}','2026-11-22',5000,'chiavari','Iveco Daily · TST1F23','rascunho');`);
  await db.exec(fs.readFileSync('supabase/migrations/20261123000500_fin_parceiro_clientes_contas.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261123000600_fin_parceiro_divergencias_inline.sql','utf8'));
  await db.exec('alter table frete_lancamentos add column explicacao text, add column explicacao_em timestamptz, add column decisao_motivo text, add column decisao_por text, add column decisao_em timestamptz');
  await db.query('update frete_lancamentos set explicacao=$1,decisao_motivo=$2,decisao_por=$3,decisao_em=$4 where id=$5',['Viagem extra solicitada.','Serviço autorizado e conferido.','Supervisora','2026-10-01T12:00:00Z',lanc]);
  await db.exec(fs.readFileSync('supabase/migrations/20261123000700_fin_parceiro_justificativas.sql','utf8'));
  await db.exec('alter table frete_lancamentos add column valor_final numeric, add column valor_sistema numeric');
  await db.query('update frete_lancamentos set valor=280,valor_sistema=250,valor_final=250 where id=$1',[lanc]);
  await db.exec(fs.readFileSync('supabase/migrations/20261123000800_fin_parceiro_valor_final.sql','utf8'));
  await db.exec(`alter table caminhoes add column empresa_id uuid, add column foto_url text;
   alter table frete_lancamentos add column veiculo_id uuid;
   create table frete_veiculos(id uuid,empresa_id uuid,freteiro_id uuid,placa text);
   insert into caminhoes(id,empresa_id,freteiro_id,codigo,modelo,placa,foto_url) values
    ('${uid(20)}','${emp}','${fr}','CAM-1','Iveco Daily','TST1F23','https://fixture/caminhao.jpg'),
    ('${uid(21)}','${emp}','${fr}','CAM-2','Outro caminhão','ABC1234','https://fixture/outro.jpg'),
    ('${uid(22)}','${out}','${fr}','CAM-3','Iveco Daily','TST1F23','https://fixture/privado.jpg');
   insert into frete_veiculos values('${uid(23)}','${emp}','${fr}','TST-1F23'),('${uid(24)}','${emp}','${fr}','ABC1234');
   update frete_lancamentos set veiculo_id='${uid(23)}' where id='${lanc}';`);
  await db.exec(fs.readFileSync('supabase/migrations/20261123000900_fin_parceiro_caminhao_foto.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261123001100_fin_solicitacao_interna.sql','utf8'));
  const rpc=async empresa=>(await db.query('select fin_parceiro_movimentos($1,$2) r',[empresa,forn])).rows[0].r;
  let r=await rpc(emp);assert.equal(r.aguardando.length,6,'frete aprovado não aparece duas vezes');
  const frete=r.aguardando.find(x=>x.titulo_id===conta);assert.equal(frete.cliente,'Ana Souza');assert.equal(frete.cliente_foto,'https://fixture/ana.jpg');assert.equal(frete.pedido,'19');assert.equal(frete.caminhao,'Iveco Daily · TST1F23');assert.equal(frete.hora,'08:30');assert.equal(frete.tipo_servico,'frete');assert.equal(frete.valor_cobrado,280);assert.equal(frete.valor_sistema,250);assert.equal(frete.valor_final,250);assert.equal(frete.vencimento,'2026-11-30');
  assert.equal(frete.frete_lancamento_id,lanc,'a conta mantém a identidade do frete para o histórico da divergência');
  assert.deepEqual(frete.caminhoes,[{id:uid(20),nome:'Iveco Daily · TST1F23',foto_url:'https://fixture/caminhao.jpg'}],'foto do veículo lançado, sem confundir com outro caminhão ou outra empresa');
  assert.equal(frete.explicacao,'Viagem extra solicitada.');assert.equal(frete.decisao_motivo,'Serviço autorizado e conferido.');assert.equal(frete.decisao_por,'Supervisora','a justificativa não depende do recorte de 30 dias das divergências');
  assert.equal(r.aguardando.find(x=>x.tipo_servico==='sublocacao'&&x.valor_cobrado===400).cliente,'Ana Souza');
  const sem=r.aguardando.find(x=>x.valor_cobrado===100);assert.equal(sem.pedido,null);assert.equal(sem.cliente_foto,null,'nunca busca identidade em outra empresa');
  const fora=r.aguardando.filter(x=>x.fora_sistema);assert.equal(fora.length,3);assert.equal(fora.reduce((s,x)=>s+x.valor_cobrado,0),5578.5);assert.ok(fora.every(x=>x.valor_sistema===null&&x.cliente===null));
  assert.ok(fora.every(x=>x.frete_lancamento_id),'lançamentos sem pedido também têm identidade própria');
  assert.ok(fora.every(x=>x.valor_final===null),'rascunhos não têm valor aprovado');
  assert.ok(fora.every(x=>x.caminhoes.length===1&&x.caminhoes[0].id===uid(20)),'lançamentos antigos identificam o caminhão pelo nome completo do cadastro');
  await db.query('update frete_lancamentos set veiculo_id=$1 where id=$2',[uid(24),uid(14)]);assert.equal((await rpc(emp)).aguardando.find(x=>x.frete_lancamento_id===uid(14)).caminhoes[0].foto_url,'https://fixture/outro.jpg','a escolha explícita do veículo prevalece sobre o texto antigo');
  await db.query("update frete_lancamentos set situacao='corrigido',valor_final=275 where id=$1",[uid(14)]);
  let corrigido=(await rpc(emp)).aguardando.find(x=>x.frete_lancamento_id===uid(14));assert.equal(corrigido.valor_cobrado,298.5);assert.equal(corrigido.valor_final,275);
  await db.query("update frete_lancamentos set situacao='divergente' where id=$1",[uid(14)]);assert.equal((await rpc(emp)).aguardando.find(x=>x.frete_lancamento_id===uid(14)).valor_final,null,'divergência não aprovada não exibe valor final');
  await db.query('update fin_pagar set aberto=150 where id=$1',[conta]);assert.equal((await rpc(emp)).aguardando.find(x=>x.titulo_id===conta).valor_final,150,'conta parcialmente paga mostra o saldo a pagar');
  assert.equal((await db.query('select sum(valor)::numeric total from fin_pagar')).rows[0].total,'750','consulta não altera os valores');
  await db.query('insert into frete_avulsos(id,empresa_id,freteiro_id,data,origem,destino,motivo,valor) values($1,$2,$3,$4,$5,$6,$7,120)',[uid(25),emp,fr,'2026-11-22','Galpão','Oficina','Buscar peças']);
  let interna=(await rpc(emp)).aguardando.find(x=>x.avulso_id===uid(25));assert.equal(interna.solicitacao_interna,true);assert.equal(interna.avulso,'Buscar peças');assert.equal(interna.pedido,null,'solicitação interna ainda não lançada é identificada pela origem real');
  await db.query('update frete_lancamentos set avulso_id=$1,anuncio_id=null,pedido_id=null where id=$2',[uid(25),lanc]);interna=(await rpc(emp)).aguardando.find(x=>x.titulo_id===conta);assert.equal(interna.avulso_id,uid(25));assert.equal(interna.pedido,null);assert.equal(interna.avulso,'Buscar peças','conta aprovada preserva identificação da solicitação');
  await db.query('update frete_lancamentos set avulso_id=null,anuncio_id=$2 where id=$1',[lanc,anuncio]);await db.query('delete from frete_avulsos where id=$1',[uid(25)]);
  await db.query("update fin_pagar set status='pago',pago=valor where id=$1",[conta]);await db.query('insert into fin_baixas values($1,$2,null,$3)',[conta,'2026-11-23','PIX']);r=await rpc(emp);assert.equal(r.pagos.length,1);assert.equal(r.pagos[0].pago,250);assert.equal(r.aguardando.length,5);assert.equal(r.pagos[0].explicacao,frete.explicacao);assert.equal(r.pagos[0].decisao_motivo,frete.decisao_motivo,'o pagamento mantém a justificativa do supervisor');
  await assert.rejects(()=>rpc(out),/Sem permissão/);await db.exec("set test.permissao='nao'");await assert.rejects(()=>rpc(emp),/Sem permissão/);await db.exec("set test.permissao='sim';set test.duplo='nao'");await assert.rejects(()=>rpc(emp),/Sem permissão/);
  assert.equal((await db.query("select has_function_privilege('anon','fin_parceiro_movimentos(uuid,uuid)','execute') p")).rows[0].p,false);
 }finally{await db.close();}
});
