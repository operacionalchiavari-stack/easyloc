const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const id=n=>'40000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('frete compara transportadora real, decide caminhão e valor sem trocar fornecedor nem duplicar cobrança',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql as $$select '${id(90)}'::uuid$$;
   create function logistica_servicos_autorizar(uuid,boolean default false) returns void language plpgsql as $$begin
    if $1<>'${id(1)}' or ($2 and current_setting('test.editar',true)='nao') then raise exception 'Sem acesso';end if;end $$;
   create function logistica_nome_usuario(uuid) returns text language sql as $$select 'Supervisora'::text$$;
   create table empresas(id uuid primary key);
   create table fornecedores(id uuid primary key,empresa_id uuid,nome_fantasia text,nome_razao_social text);
   create table frete_freteiros(id uuid primary key,empresa_id uuid,fornecedor_id uuid,caminhao_id uuid,nome text);
   create table caminhoes(id uuid primary key,empresa_id uuid,codigo text,modelo text,placa text,foto_url text,empresa_nome text,fornecedor_id uuid,freteiro_id uuid);
   create table separacoes_pedidos(id uuid primary key,empresa_id uuid,numero_pedido text,cliente_nome text,local_nome text,operacao jsonb);
   create table frete_anuncios(id uuid primary key,empresa_id uuid,freteiro_id uuid,direcao text);
   create table frete_viagens(id uuid primary key,empresa_id uuid,pedido_id uuid,data date,direcao text,caminhao_id uuid,
    fornecedor_id uuid,fornecedor_nome text,valor_transportadora numeric,valor_sistema numeric,valor_final numeric,
    transp_enviado_em timestamptz,transp_obs text,obs text,status text default 'aberto',fechamento_id uuid,caminhao_codigo text,
    extra boolean default false,created_at timestamptz default now(),updated_at timestamptz default now(),destino text);
   create table frete_relatorios(id uuid primary key,status text,freteiro_id uuid,empresa_id uuid,periodo_ini date,periodo_fim date,total_informado numeric,arquivo_nome text);
   create table frete_avulsos(id uuid primary key,empresa_id uuid,freteiro_id uuid,data date,destino text,origem text,motivo text,valor numeric,cancelado_em timestamptz);
   create table frete_veiculos(id uuid,empresa_id uuid,freteiro_id uuid,placa text);
   create table funcionarios_acesso(id uuid,empresa_id uuid,nome text);
   create table usuarios(id uuid,nome text);
   create table frete_lancamentos(id uuid primary key,empresa_id uuid,freteiro_id uuid,pedido_id uuid,avulso_id uuid,anuncio_id uuid,veiculo_id uuid,
    data date,direcao text,origem_lanc text default 'freteiro',relatorio_id uuid,situacao text default 'divergente',pagar_id uuid,explicacao text,observacao text,
    caminhao text,valor numeric,valor_final numeric,valor_sistema numeric,decisao_motivo text,decisao_em timestamptz,decisao_por text,
    created_at timestamptz default now(),updated_at timestamptz default now(),origem text,destino text,divergencia text);
   create function frete_lanc_total(frete_lancamentos) returns numeric language sql as $$select $1.valor$$;
   create function logistica_anunciados(uuid,text,date,date) returns jsonb language sql as $$select current_setting('test.servicos')::jsonb$$;
   create function logistica_anunciados_transportadoras(uuid,date,date) returns jsonb language sql as $$select '[]'::jsonb$$;
   create function logistica_divergencias_dados(uuid) returns jsonb language sql as $$select '{"abertas":[{"origem":"frete"},{"origem":"uber"}],"resolvidas":[{"origem":"frete"},{"origem":"free"}]}'::jsonb$$;
   insert into empresas values('${id(1)}'),('${id(2)}');
   insert into fornecedores values('${id(10)}','${id(1)}','Caminho Certo','Caminho Certo'),('${id(11)}','${id(1)}','Outra Transportadora','Outra'),('${id(12)}','${id(2)}','Segredo','Segredo');
   insert into frete_freteiros values('${id(20)}','${id(1)}','${id(10)}','${id(30)}','Caminho Certo'),('${id(21)}','${id(1)}','${id(11)}','${id(31)}','Outra');
   insert into caminhoes values('${id(30)}','${id(1)}','TC','Mercedes Axor','ABC1234','programado.jpg',null,'${id(10)}','${id(20)}'),
    ('${id(31)}','${id(1)}','OUT','Mercedes Atego','DEF5678','real.jpg',null,'${id(11)}','${id(21)}'),
    ('${id(32)}','${id(2)}','SEG','Segredo','SEG0000','segredo.jpg',null,'${id(12)}',null);
   insert into frete_anuncios values('${id(40)}','${id(1)}','${id(20)}','entrega');
   insert into frete_relatorios(id,status,freteiro_id,empresa_id) values('${id(50)}','enviado','${id(21)}','${id(1)}');
   insert into frete_lancamentos(id,empresa_id,freteiro_id,pedido_id,data,direcao,relatorio_id,valor,caminhao)
    values('${id(60)}','${id(1)}','${id(21)}','${id(70)}','2026-11-23','entrega','${id(50)}',350,'Mercedes Atego');
   insert into funcionarios_acesso values('${id(91)}','${id(1)}','João Expedidor');`);
  await db.query('insert into separacoes_pedidos values($1,$2,$3,$4,$5,$6)',[id(70),id(1),'13','Evento','Local',{carga_por_veiculo:[{caminhao_id:id(31),por:id(91),em:'2026-11-23T11:00:00Z'},{caminhao_id:id(32),por:id(91)}]}]);
  const servico={id:id(40),pedido_id:id(70),pedido:'13',data:'2026-11-23',etapa:'Entrega',quantidade:1,valor:310,linhas:[{nome:'Caminho Certo',confirmado:true}]};
  await db.query("select set_config('test.servicos',$1,false)",[JSON.stringify([servico])]);
  await db.exec(`alter table caminhoes add column capacidade_m3 numeric,add column categoria text;
   alter table separacoes_pedidos add column observacoes jsonb;
   create table categorias_caminhao(empresa_id uuid,nome text,valor_km numeric,ativo boolean,volume_minimo numeric,volume_maximo numeric,ordem int);`);
  await db.exec(fs.readFileSync('supabase/migrations/20261123001600_fretes_conferencia_na_tela.sql','utf8'));
  await db.exec(`create table finalizacoes(rel uuid);
   create or replace function frete_relatorio_finalizar_conferido(p_rel uuid) returns void language sql as $$insert into finalizacoes values($1)$$;`);
  const listar=async()=>(await db.query('select logistica_fretes_anunciados($1,$2,$2) j',[id(1),'2026-11-23'])).rows[0].j;
  const linha=async()=>{const lista=await listar();return lista.find(x=>x.id===id(40)).linhas[0];};
  let l=await linha();
  assert.equal(l.programado.transportadora,'Caminho Certo');
  assert.equal(l.carregamentos.length,1,'caminhão de outra empresa não vaza');
  assert.equal(l.carregamentos[0].transportadora,'Outra Transportadora');
  assert.equal(l.carregamentos[0].foto,'real.jpg');
  assert.equal(l.carregamentos[0].expedidor,'João Expedidor');
  assert.equal((await listar()).length,2,'cobrança da transportadora diferente permanece visível');
  await db.query('select frete_relatorio_finalizar($1)',[id(50)]);
  assert.equal((await db.query('select * from finalizacoes')).rows.length,0,'valor automático não libera sem conferência');
  const decidir=async({cam=id(31),lanc=id(60),valor=340,versao=l.versao,chave=l.chave,empresa=id(1)}={})=>db.query('select logistica_frete_conferir($1,$2,$3,$4,$5,$6,$7,$8)',[empresa,chave,'2026-11-23',versao,cam,lanc,valor,'Troca de caminhão conferida']);
  await assert.rejects(()=>decidir({empresa:id(2)}),/Sem acesso/);
  await db.exec("select set_config('test.editar','nao',false)");await assert.rejects(()=>decidir(),/Sem acesso/);await db.exec("select set_config('test.editar','sim',false)");
  await assert.rejects(()=>decidir({cam:id(32)}),/caminhão programado/);
  await assert.rejects(()=>decidir({cam:id(30)}),/fornecedor do caminhão/);
  await assert.rejects(()=>decidir({valor:-1}),/Valor final inválido/);
  await assert.rejects(()=>decidir({valor:'NaN'}),/Valor final inválido/);
  await db.query('update frete_lancamentos set relatorio_id=null where id=$1',[id(60)]);l=await linha();
  await assert.rejects(()=>decidir(),/Aguarde o fornecedor/);
  await db.query('update frete_lancamentos set relatorio_id=$1 where id=$2',[id(50),id(60)]);l=await linha();
  await assert.rejects(()=>decidir({versao:'antiga'}),/dados mudaram/);
  const versaoInicial=l.versao;
  await decidir({lanc:null,valor:null});
  await assert.rejects(()=>decidir({versao:versaoInicial}),/dados mudaram/);
  await db.query('select frete_relatorio_finalizar($1)',[id(50)]);
  assert.equal((await db.query('select * from finalizacoes')).rows.length,0,'decisão só do caminhão ainda não libera valor');
  l=await linha();
  await decidir();
  const salvo=(await db.query('select * from frete_lancamentos where id=$1',[id(60)])).rows[0];
  assert.equal(Number(salvo.valor),350,'valor informado fica preservado');assert.equal(Number(salvo.valor_final),340);
  assert.equal(salvo.freteiro_id,id(21),'pagamento mantém fornecedor do caminhão real');
  assert.equal((await db.query('select * from finalizacoes')).rows.length,1);
  assert.equal((await db.query('select * from logistica_frete_conferencia_historico')).rows.length,2);
  assert.equal((await listar()).length,1,'a cobrança escolhida integra a linha conferida');
  const novo=await linha();assert.equal(novo.conferencia.caminhao_id,id(31));assert.equal(novo.cobranca.fornecedor,'Outra Transportadora');
  await db.query('insert into frete_anuncios values($1,$2,$3,$4)',[id(41),id(1),id(20),'entrega']);
  await db.query("select set_config('test.servicos',$1,false)",[JSON.stringify([servico,{...servico,id:id(41)}])]);
  const segunda=(await listar()).find(x=>x.id===id(41)).linhas[0];
  await assert.rejects(()=>decidir({chave:segunda.chave,versao:segunda.versao,lanc:null,valor:null}),/caminhão já foi escolhido/);
  await assert.rejects(()=>decidir({chave:segunda.chave,versao:segunda.versao}),/cobrança já foi conferida/);
  await db.query('update frete_lancamentos set pagar_id=$1 where id=$2',[id(99),id(60)]);l=await linha();await assert.rejects(()=>decidir(),/Financeiro/);
  const div=(await db.query('select logistica_divergencias_lista($1) j',[id(1)])).rows[0].j;
  assert.deepEqual(div,{abertas:[{origem:'uber'}],resolvidas:[{origem:'free'}]});
  // Portal da transportadora: envio e valor final também passam pela nova tela.
  await db.query("update frete_lancamentos set data='2026-11-22' where id=$1",[id(60)]);
  await db.query('delete from logistica_frete_conferencias');
  await db.query("insert into frete_viagens(id,empresa_id,pedido_id,data,direcao,caminhao_id,fornecedor_id,valor_transportadora,valor_sistema,transp_enviado_em) values($1,$2,$3,'2026-11-23','entrega',$4,$5,390,320,now())",[id(65),id(1),id(70),id(31),id(11)]);
  await db.query("select set_config('test.servicos',$1,false)",[JSON.stringify([servico])]);
  l=await linha();assert.equal(l.cobrancas[0].tipo,'viagem');
  await decidir({lanc:id(65),valor:380});
  const portal=(await db.query('select * from frete_viagens where id=$1',[id(65)])).rows[0];
  assert.equal(Number(portal.valor_transportadora),390);assert.equal(Number(portal.valor_final),380);
  assert.equal(portal.fornecedor_id,id(11));assert.equal((await linha()).conferencia.viagem_id,id(65));
  await db.query("update frete_viagens set status='fechado' where id=$1",[id(65)]);l=await linha();await assert.rejects(()=>decidir({lanc:id(65)}),/Financeiro/);
  // Caminhão de transportadora sem app: preço automático antes de qualquer cobrança.
  await db.exec('delete from logistica_frete_conferencias');
  await db.query("update frete_viagens set status='aberto' where id=$1",[id(65)]);
  await db.query("select set_config('test.servicos','[]',false)");
  const transporte={pedido_id:id(70),pedido:'13',data:'2026-11-23',etapa:'Entrega · transportadora',transportadora:true,valor:null,linhas:[{caminhao_id:id(30),nome:'Programado',confirmado:true}]};
  await db.query("select set_config('test.transportes',$1,false)",[JSON.stringify([transporte])]);
  await db.exec("create or replace function logistica_anunciados_transportadoras(uuid,date,date) returns jsonb language sql as $$select current_setting('test.transportes')::jsonb$$");
  await db.query("update separacoes_pedidos set observacoes=$1 where id=$2",[{logistica_snapshot:{km:62}},id(70)]);
  await db.query("insert into categorias_caminhao(empresa_id,nome,valor_km,ativo) values($1,'TC',10,true)",[id(1)]);
  const t=(await listar()).find(x=>x.transportadora).linhas[0];
  assert.equal(t.valor_sistema,310);assert.equal(t.carregamentos[0].transportadora,'Outra Transportadora');
  await decidir({chave:t.chave,versao:t.versao,lanc:id(65),valor:370});
  assert.equal((await listar()).find(x=>x.transportadora).linhas[0].conferencia.caminhao_id,id(31));
  // Solicitação interna continua conferível mesmo sem caminhão programado.
  await db.query("insert into frete_avulsos(id,empresa_id,freteiro_id,data,destino,origem,motivo,valor) values($1,$2,$3,'2026-11-23','Oficina','Galpão','Buscar material',110)",[id(80),id(1),id(20)]);
  await db.query("insert into frete_relatorios(id,status,freteiro_id,empresa_id) values($1,'enviado',$2,$3)",[id(52),id(20),id(1)]);
  await db.query("insert into frete_lancamentos(id,empresa_id,freteiro_id,avulso_id,data,direcao,relatorio_id,valor) values($1,$2,$3,$4,'2026-11-23','avulso',$5,120)",[id(62),id(1),id(20),id(80),id(52)]);
  const interna=(await listar()).find(x=>x.avulso_id===id(80)).linhas[0];
  await decidir({chave:interna.chave,versao:interna.versao,cam:null,lanc:id(62),valor:110});
  assert.equal(Number((await db.query('select valor_final from frete_lancamentos where id=$1',[id(62)])).rows[0].valor_final),110);
  // Três caminhões carregados: uma substituição e duas linhas extras, nunca juntos numa célula.
  await db.exec(fs.readFileSync('supabase/migrations/20261123001700_frete_um_caminhao_por_linha.sql','utf8'));
  await db.exec('delete from logistica_frete_conferencias;delete from frete_lancamentos;delete from frete_viagens;delete from frete_avulsos;');
  await db.query("select set_config('test.servicos',$1,false),set_config('test.transportes','[]',false)",[JSON.stringify([servico])]);
  for(const n of [33,34])await db.query('insert into caminhoes(id,empresa_id,codigo,modelo,placa,fornecedor_id) values($1,$2,$3,$4,$5,$6)',[id(n),id(1),'EX'+n,'Extra '+n,'EXT00'+n,id(11)]);
  const carregar=async nums=>db.query('update separacoes_pedidos set operacao=$1 where id=$2',[{carga_por_veiculo:nums.map(n=>({caminhao_id:id(n),por:id(91),em:'2026-11-23T11:00:00Z'}))},id(70)]);
  await carregar([31,33,34]);
  const linhas=async()=>(await listar()).flatMap(s=>s.linhas);
  let separadas=await linhas();
  assert.equal(separadas.length,3);assert.equal(separadas.filter(l=>l.tipo_linha==='substituicao').length,1);assert.equal(separadas.filter(l=>l.tipo_linha==='extra').length,2);
  assert.ok(separadas.every(l=>l.carregamentos.length===1));assert.equal(new Set(separadas.map(l=>l.carregamentos[0].id)).size,3);
  // Mesmo com as três cobranças já enviadas, continuam sendo apenas três linhas.
  for(const [cam,fr,rel,lanc] of [[31,21,50,71],[33,23,53,72],[34,24,54,73]]){
   if(fr!==21){await db.query('insert into frete_freteiros values($1,$2,$3,$4,$5)',[id(fr),id(1),id(11),id(cam),'Transportadora extra']);await db.query("insert into frete_relatorios(id,status,freteiro_id,empresa_id) values($1,'enviado',$2,$3)",[id(rel),id(fr),id(1)]);}
   await db.query("insert into frete_lancamentos(id,empresa_id,freteiro_id,pedido_id,data,direcao,relatorio_id,valor) values($1,$2,$3,$4,'2026-11-23','entrega',$5,250)",[id(lanc),id(1),id(fr),id(70),id(rel)]);
  }
  const faturadas=await linhas();assert.equal(faturadas.length,3);assert.ok(faturadas.every(l=>l.carregamentos.length===1));
  assert.equal(faturadas.find(l=>l.programado).cobranca.caminhao_id,faturadas.find(l=>l.programado).carregamentos[0].id);
  assert.equal(new Set(faturadas.map(l=>l.cobranca.id)).size,3);
  await db.exec('delete from frete_lancamentos');
  const extra=separadas.find(l=>l.carregamentos[0].id===id(33));
  await decidir({chave:extra.chave,versao:extra.versao,cam:id(33),lanc:null,valor:null});
  const principal=(await linhas()).find(l=>l.programado);await decidir({chave:principal.chave,versao:principal.versao,cam:id(34),lanc:null,valor:null});
  separadas=await linhas();assert.equal(separadas.find(l=>l.programado).carregamentos[0].id,id(34));assert.equal(separadas.find(l=>l.chave===extra.chave).carregamentos[0].id,id(33));
  assert.ok(separadas.every(l=>l.carregamentos.length===1));assert.equal(new Set(separadas.map(l=>l.carregamentos[0].id)).size,3);
  const extraAtual=separadas.find(l=>l.chave===extra.chave);
  await assert.rejects(()=>decidir({chave:extraAtual.chave,versao:extraAtual.versao,cam:id(31),lanc:null,valor:null}),/caminhão programado/);
  // A cobrança posterior entra no extra já conferido, sem criar outra linha para ele.
  await db.query('update frete_freteiros set caminhao_id=$1 where id=$2',[id(33),id(21)]);
  await db.query("insert into frete_lancamentos(id,empresa_id,freteiro_id,pedido_id,data,direcao,relatorio_id,valor) values($1,$2,$3,$4,'2026-11-23','entrega',$5,250)",[id(66),id(1),id(21),id(70),id(50)]);
  const comCobranca=(await linhas()).find(l=>l.chave===extra.chave);
  assert.equal((await linhas()).length,3);assert.equal(comCobranca.cobranca.id,id(66));
  await decidir({chave:comCobranca.chave,versao:comCobranca.versao,cam:id(33),lanc:id(66),valor:240});
  assert.equal((await linhas()).length,3);assert.equal((await linhas()).find(l=>l.chave===extra.chave).conferencia.valor_final,240);
  await db.exec('delete from logistica_frete_conferencias;delete from frete_lancamentos;');
  await carregar([30,31,33]);
  separadas=await linhas();assert.equal(separadas.find(l=>l.programado).carregamentos[0].id,id(30));assert.equal(separadas.filter(l=>l.tipo_linha==='extra').length,2);
 }finally{await db.close();}
});
