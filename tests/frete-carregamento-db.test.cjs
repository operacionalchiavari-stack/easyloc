const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('carregamento confere pedido e caminhão, isolando empresa e coleta',async()=>{
 const db=new PGlite(),id=n=>'30000000-0000-0000-0000-'+String(n).padStart(12,'0');
 try{
  await db.exec(`create function logistica_servicos_autorizar(uuid) returns void language plpgsql as $$begin if $1<>'${id(1)}' then raise exception 'Sem acesso';end if;end $$;
   create function logistica_nome_usuario(uuid) returns text language sql as $$select 'Expedidor'::text$$;
   create table frete_anuncios(id uuid,empresa_id uuid,freteiro_id uuid,direcao text);
   create table frete_freteiros(id uuid,empresa_id uuid,caminhao_id uuid);
   create table caminhoes(id uuid,empresa_id uuid);
   create table separacoes_pedidos(id uuid,empresa_id uuid,operacao jsonb);
   create function logistica_anunciados(uuid,text,date,date) returns jsonb language sql as $$select current_setting('test.servicos')::jsonb$$;
   create function logistica_anunciados_transportadoras(uuid,date,date) returns jsonb language sql as $$select current_setting('test.transportadoras')::jsonb$$;
   insert into frete_anuncios values('${id(3)}','${id(1)}','${id(4)}','entrega'),('${id(9)}','${id(1)}','${id(4)}','coleta');
   insert into frete_freteiros values('${id(4)}','${id(1)}','${id(5)}');
   insert into caminhoes values('${id(5)}','${id(1)}'),('${id(6)}','${id(1)}'),('${id(7)}','${id(2)}');`);
  const carga=n=>({caminhao_id:id(n),codigo:'C'+n,placa:'ABC1234',por:id(8),em:'2026-11-23T11:00:00Z'});
  await db.query('insert into separacoes_pedidos values($1,$2,$3),($4,$5,$6)',[id(10),id(1),{carga_por_veiculo:[carga(5),carga(6),carga(7)]},id(11),id(2),{carga_por_veiculo:[carga(5)]}]);
  const s={id:id(3),pedido_id:id(10),data:'2026-11-23',linhas:[{nome:'Freteiro'}]};
  await db.query("select set_config('test.servicos',$1,false),set_config('test.transportadoras',$2,false)",[
   JSON.stringify([s,{...s,id:id(9)},{...s,pedido_id:id(11)}]),JSON.stringify([{...s,id:null,transportadora:true,etapa:'Entrega · transportadora',linhas:[{caminhao_id:id(6)},{caminhao_id:id(7)}]}])]);
  const fonte=fs.readFileSync('supabase/migrations/20261123001500_frete_carregamento_sem_qr.sql','utf8');
  const a=fonte.indexOf('create or replace function public.logistica_fretes_anunciados(');
  await db.exec(fonte.slice(a,fonte.indexOf('end $$;',a)+'end $$;'.length));
  const result=(await db.query('select logistica_fretes_anunciados($1,$2,$3) j',[id(1),'2026-11-01','2026-11-30'])).rows[0].j;
  const entregue=result.find(x=>x.id===id(3)&&x.pedido_id===id(10));
  assert.equal(entregue.linhas[0].carregamentos.length,1);
  assert.equal(entregue.linhas[0].carregamentos[0].caminhao_id,id(5));
  assert.equal(entregue.linhas[0].carregamentos[0].expedidor,'Expedidor');
  assert.deepEqual(result.find(x=>x.id===id(9)).linhas[0].carregamentos,[]);
  assert.deepEqual(result.find(x=>x.pedido_id===id(11)).linhas[0].carregamentos,[]);
  const tr=result.find(x=>x.transportadora);
  assert.equal(tr.linhas[0].carregamentos[0].caminhao_id,id(6));
  assert.deepEqual(tr.linhas[1].carregamentos,[]);
  await assert.rejects(()=>db.query('select logistica_fretes_anunciados($1,$2,$3)',[id(2),'2026-11-01','2026-11-30']),/Sem acesso/);
 }finally{await db.close();}
});
