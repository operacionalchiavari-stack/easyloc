const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('fotos da etapa: limita acesso por sessão, empresa e vínculo, sem expor foto privada do RH',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema storage;
 create table storage.objects(bucket_id text,name text);
 create table app_sessoes(empresa_id uuid,nome text);
 insert into app_sessoes values('${id(1)}','Ana'),('${id(2)}','Outro');
 create function app_sessao(text,text) returns app_sessoes language plpgsql as $$declare s app_sessoes;begin
 select * into s from app_sessoes where nome=$1;if s.nome is null then raise exception 'SESSAO_EXPIRADA';end if;return s;end$$;
 create function mont_pode_ver(app_sessoes,uuid) returns boolean language sql as $$select $2='${id(3)}'::uuid$$;
 create table operacao_etapas(id uuid,empresa_id uuid,pedido_id uuid);
 insert into operacao_etapas values('${id(3)}','${id(1)}','${id(5)}'),('${id(4)}','${id(1)}','${id(5)}');
 create table funcionarios_acesso(id uuid,empresa_id uuid,foto_url text);
 insert into funcionarios_acesso values('${id(6)}','${id(1)}','privada/rh.jpg'),('${id(7)}','${id(1)}','https://foto.test/bruno.jpg'),('${id(8)}','${id(2)}','https://foto.test/outra-empresa.jpg');
 insert into storage.objects values('avatares','${id(1)}/${id(6)}.jpg');
 create table operacao_etapa_pessoas(id uuid,empresa_id uuid,etapa_id uuid,funcionario_id uuid,nome text,papel text,ordem int);
 insert into operacao_etapa_pessoas values
 ('${id(11)}','${id(1)}','${id(3)}','${id(6)}','Ana','responsavel',0),
 ('${id(12)}','${id(1)}','${id(3)}','${id(7)}','Bruno','equipe',1),
 ('${id(13)}','${id(1)}','${id(4)}','${id(8)}','Fora da etapa','equipe',0);
 create table caminhoes(id uuid,empresa_id uuid,codigo text,foto_url text);
 insert into caminhoes values('${id(9)}','${id(1)}','C01','https://foto.test/caminhao.jpg'),('${id(10)}','${id(2)}','C02','https://foto.test/privado.jpg');
 create table operacao_etapa_caminhoes(etapa_id uuid,empresa_id uuid,caminhao_id uuid);
 insert into operacao_etapa_caminhoes values('${id(3)}','${id(1)}','${id(9)}'),('${id(3)}','${id(1)}','${id(10)}');
 create table separacoes_pedidos(id uuid,empresa_id uuid,cliente_id uuid,cliente_nome text);
 insert into separacoes_pedidos values('${id(5)}','${id(1)}','${id(14)}','Decoradora');
 create table clientes_empresas(id uuid,empresa_id uuid,nome_razao text,catalogo_logo_url text);
 insert into clientes_empresas values('${id(14)}','${id(1)}','Decoradora','https://foto.test/decoradora.jpg');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261031005000_montador_fotos_etapa.sql','utf8'));
 await db.exec('set role anon');
 const get=(token='Ana',etapa=id(3))=>db.query('select mont_fotos_etapa($1,$2) r',[token,etapa]);
 const r=(await get()).rows[0].r;
 assert.equal(r.pessoas.length,2);assert.equal(r.pessoas[0].foto,null);assert.equal(r.pessoas[0].avatar,`${id(1)}/${id(6)}.jpg`);
 assert.equal(r.pessoas[1].foto,'https://foto.test/bruno.jpg');assert.equal(r.caminhoes.length,1);assert.equal(r.solicitante.foto,'https://foto.test/decoradora.jpg');
 assert.doesNotMatch(JSON.stringify(r),/privada|outra-empresa|Fora da etapa/);
 await assert.rejects(get('expirada'),/SESSAO/);await assert.rejects(get('Outro'),/acesso/);await assert.rejects(get('Ana',id(4)),/acesso/);
 }finally{await db.close();}
});
test('bridge transforma o avatar público e mantém as fotos de caminhão e solicitante',async()=>{
 const calls=[],data={pessoas:[{nome:'Ana',avatar:'empresa/pessoa.jpg'}],caminhoes:[{foto:'https://foto.test/caminhao.jpg'}],solicitante:{foto:'https://foto.test/cliente.jpg'}};
 const client={rpc:async(name,args)=>{calls.push({name,args});return {data};},storage:{from:bucket=>({getPublicUrl:path=>({data:{publicUrl:`https://storage.test/${bucket}/${path}`}})})}};
 const ctx={window:{supabaseClient:client},document:{currentScript:{src:'https://teste.local/Modulos/Chiavari/operacao-sem-motor.js'}},URL,localStorage:{setItem(){}},setTimeout};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('Modulos/Chiavari/operacao-sem-motor.js','utf8'),ctx);
 const r=await ctx.window.ACERVO_LOCAL.MONT_fotosEtapa('sessao',id(3));
 assert.equal(calls[0].name,'mont_fotos_etapa');assert.equal(calls[0].args.p_token,'sessao');assert.equal(calls[0].args.p_etapa,id(3));
 assert.equal(r.pessoas[0].foto,'https://storage.test/avatares/empresa/pessoa.jpg');assert.equal('avatar' in r.pessoas[0],false);assert.equal(r.solicitante.foto,data.solicitante.foto);
});
