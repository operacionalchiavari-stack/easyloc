const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const emp='10000000-0000-0000-0000-000000000001',outro='10000000-0000-0000-0000-000000000002';
const func='20000000-0000-0000-0000-000000000001',etapa='30000000-0000-0000-0000-000000000001',etapa2='30000000-0000-0000-0000-000000000002',vaga='40000000-0000-0000-0000-000000000001';
test('cliente usa CPF no endpoint protegido e não consulta a lista de nomes',async()=>{
 const chamadas=[];
 const ctx={window:{supabaseClient:{functions:{invoke:async(nome,op)=>{chamadas.push({nome,op});return {data:{token:'sessao',nome:'Ana',perfil:'RESPONSAVEL',pasta:'pasta'}};}},rpc:()=>{throw Error('Não consultar nomes nem CPF pelo cliente');}}},document:{currentScript:{src:'https://teste.local/Modulos/Chiavari/operacao-sem-motor.js'}},URL,localStorage:{setItem(){}},setTimeout};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('Modulos/Chiavari/operacao-sem-motor.js','utf8'),ctx);
 const r=await ctx.window.ACERVO_LOCAL.MONT_login('123.456.789-01','1234',false);
 assert.equal(r.token,'sessao');assert.equal(chamadas[0].nome,'funcionarios-admin');assert.equal(chamadas[0].op.body.action,'montador-login');assert.equal(chamadas[0].op.body.cpf,'12345678901');
 await assert.rejects(ctx.window.ACERVO_LOCAL.MONT_login('Ana','1234',false),/CPF/);assert.equal(chamadas.length,1);
});
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table funcionarios_acesso(id uuid primary key,empresa_id uuid,nome text,cpf text,cpf_hash text,ativo boolean,equipe_operacional text);
 insert into funcionarios_acesso values('${func}','${emp}','Ana','cofre:v1:protegido',repeat('a',64),true,'montagem');
 create table app_sessoes(empresa_id uuid,funcionario_id uuid,nome text,perfil text);
 insert into app_sessoes values('${emp}','${func}','Ana','RESPONSAVEL'),('${outro}',null,'Outro','SUPERVISOR');
 create table operacao_etapas(id uuid primary key,empresa_id uuid,tipo text,liberada boolean default true);
 insert into operacao_etapas values('${etapa}','${emp}','montagem',true),('${etapa2}','${emp}','desmontagem',true);
 create table operacao_etapa_pessoas(empresa_id uuid,etapa_id uuid,funcionario_id uuid,nome text,papel text);
 insert into operacao_etapa_pessoas values('${emp}','${etapa}','${func}','Ana','responsavel'),('${emp}','${etapa2}','${func}','Ana','responsavel');
 create table operacao_apontamentos(id uuid primary key default gen_random_uuid(),empresa_id uuid,etapa_id uuid,funcionario_id uuid,nome text,inicio timestamptz default now(),fim timestamptz,status text default 'ATIVO');
 create table free_vagas(id uuid primary key,empresa_id uuid,etapa_id uuid,status text default 'ABERTA');insert into free_vagas values('${vaga}','${emp}','${etapa}','ABERTA');
 create table free_inscricoes(id uuid primary key default gen_random_uuid(),empresa_id uuid,vaga_id uuid,status text default 'CONFIRMADO',checkin_em timestamptz);
 create table operacao_registros(etapa_id uuid,tipo text,dados jsonb,unique(etapa_id,tipo));
 create table tentativas(pin text);
 create function gs_empresa_dona() returns uuid language sql as $$select '${emp}'::uuid$$;
 create function rh_pin_conferir(uuid,uuid,text) returns boolean language plpgsql as $$begin insert into tentativas values($3);return $3='1234';end$$;
 create function mont_login(uuid,text) returns jsonb language sql as $$select jsonb_build_object('token','sessao','funcionario',$1)$$;
 create function app_sessao(text,text) returns app_sessoes language plpgsql as $$declare s app_sessoes;begin select * into s from app_sessoes where nome=case $1 when 'ana' then 'Ana' when 'outro' then 'Outro' end;if s.nome is null then raise exception 'SESSAO_EXPIRADA';end if;return s;end$$;
 create function mont_pode_ver(app_sessoes,uuid) returns boolean language sql as $$select true$$;
 create function mont_apontamento_ativo(app_sessoes) returns jsonb language sql as $$select jsonb_build_object('id',a.id,'idEtapa',a.etapa_id,'status',a.status,'inicio',a.inicio) from operacao_apontamentos a where a.empresa_id=($1).empresa_id and a.status='ATIVO' and a.funcionario_id=($1).funcionario_id order by a.inicio limit 1$$;
 create function operacao_validar_etapa_campo(uuid) returns void language plpgsql as $$begin if not (select liberada from operacao_etapas where id=$1) then raise exception 'Etapa não liberada';end if;end$$;
 create function mont_registro_salvar(text,uuid,text,jsonb) returns jsonb language plpgsql as $$begin
  if ($4->>'precisaoGPS')::numeric>100 or $4->>'latitude' is null or $4->>'longitude' is null then raise exception 'GPS impreciso';end if;
  insert into operacao_registros values($2,$3,$4) on conflict(etapa_id,tipo) do nothing;
  return $4||jsonb_build_object('enviado',true,'chegada',jsonb_build_object('localStatus','NO_LOCAL'));end$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261031004000_montador_cpf_checkin.sql','utf8'));return db;
}
test('CPF cifrado e legado: PIN atual, erros genéricos, contador de erros persistente e RPC restrita',async()=>{
 const db=await fixture();try{
 const entrar=async(hash='a'.repeat(64),cpf='12345678901',pin='1234')=>(await db.query('select mont_login_cpf_cofre($1,$2,$3) r',[hash,cpf,pin])).rows[0].r;
 assert.equal((await entrar()).token,'sessao');assert.match((await entrar(undefined,undefined,'0000')).error,/CPF ou PIN/);assert.equal((await db.query('select count(*)::int n from tentativas')).rows[0].n,2);
 assert.match((await entrar('b'.repeat(64))).error,/CPF ou PIN/);
 await db.exec("update funcionarios_acesso set cpf='12345678901',cpf_hash=null");assert.equal((await entrar('b'.repeat(64))).token,'sessao');
 await db.exec("update funcionarios_acesso set ativo=false");assert.match((await entrar()).error,/CPF ou PIN/);
 for(const papel of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'mont_login_cpf_cofre(text,text,text)','execute') p",[papel])).rows[0].p,false);
 assert.equal((await db.query("select has_function_privilege('service_role','mont_login_cpf_cofre(text,text,text)','execute') p")).rows[0].p,true);
 }finally{await db.close();}
});
test('check-in inicia automaticamente com horário original; abrir sem check-in não inicia; conclusão não reinicia',async()=>{
 const db=await fixture();try{
 const sincronizar=async(token='ana',id=etapa)=>(await db.query('select mont_checkin_apontamento($1,$2) r',[token,id])).rows[0].r;
 assert.equal(await sincronizar(),null);
 await db.query("insert into free_inscricoes(empresa_id,vaga_id,checkin_em) values($1,$2,now()-interval '1 hour')",[emp,vaga]);
 const a=(await db.query('select * from operacao_apontamentos')).rows[0];assert.ok(a.id);assert.equal(a.etapa_id,etapa);assert.ok(Date.now()-Date.parse(a.inicio)>3500000);
 await db.query("insert into free_inscricoes(empresa_id,vaga_id,checkin_em) values($1,$2,now())",[emp,vaga]);assert.equal((await sincronizar()).id,a.id);assert.equal((await db.query('select count(*)::int n from operacao_apontamentos')).rows[0].n,1);
 await assert.rejects(sincronizar('outro'),/acesso/);await assert.rejects(sincronizar('invalido'),/SESSAO/);
 await db.exec("update operacao_apontamentos set status='ENCERRADO',fim=now()");assert.equal(await sincronizar(),null);assert.equal((await db.query('select count(*)::int n from operacao_apontamentos')).rows[0].n,1);
 }finally{await db.close();}
});
test('foto sozinha registra chegada; GPS inválido não cria início; empresa e quantidade não são gravadas',async()=>{
 const db=await fixture();try{
 const foto=async(d)=>(await db.query('select mont_equipe_foto($1,$2,$3) r',['ana',etapa,d])).rows[0].r;
 const d={foto:'https://teste.local/foto.jpg',latitude:-23,longitude:-46,precisaoGPS:10,empresa:'Ignorar',quantidade:99};
 await assert.rejects(foto({...d,precisaoGPS:500}),/GPS/);assert.equal((await db.query('select count(*)::int n from operacao_apontamentos')).rows[0].n,0);
 const r=await foto(d);assert.equal(r.apontamento.idEtapa,etapa);assert.equal(r.apontamento.status,'ATIVO');assert.equal(r.enviado,true);
 const salvo=(await db.query('select dados from operacao_registros')).rows[0].dados;assert.equal('empresa' in salvo,false);assert.equal('quantidade' in salvo,false);
 const outroRegistro=await foto(d);assert.equal(outroRegistro.apontamento.id,r.apontamento.id);
 await db.exec("update operacao_apontamentos set status='ENCERRADO'");await assert.rejects(foto(d),/encerrado/);assert.equal((await db.query('select count(*)::int n from operacao_apontamentos')).rows[0].n,1);
 }finally{await db.close();}
});
