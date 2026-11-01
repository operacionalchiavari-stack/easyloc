const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table app_sessoes(empresa_id uuid,funcionario_id uuid,nome text);
 insert into app_sessoes values('${id(1)}','${id(2)}','Ana'),('${id(10)}','${id(11)}','Outro'),('${id(1)}',null,'Supervisor');
 create function app_sessao(text,text) returns app_sessoes language plpgsql as $$declare s app_sessoes;begin select * into s from app_sessoes where nome=$1;if s.nome is null then raise exception 'SESSAO_EXPIRADA';end if;return s;end$$;
 create function mont_pode_ver(app_sessoes,uuid) returns boolean language sql as $$select $2='${id(3)}'::uuid$$;
 create function gs_empresa_dona() returns uuid language sql as $$select '${id(1)}'::uuid$$;
 create table funcionarios_acesso(id uuid,empresa_id uuid,nome text,cpf text,foto_url text,ativo boolean);
 insert into funcionarios_acesso values('${id(2)}','${id(1)}','Ana','cofre:protegido','foto.jpg',true);
 create table operacao_etapas(id uuid,empresa_id uuid,pedido_id uuid,tipo text);
 insert into operacao_etapas values('${id(3)}','${id(1)}','${id(4)}','montagem'),('${id(9)}','${id(1)}','${id(4)}','montagem');
 create table separacoes_pedidos(id uuid,empresa_id uuid,observacoes jsonb);
 insert into separacoes_pedidos values('${id(4)}','${id(1)}','{"projeto_comercial":{"dados":{"ambientes":[{"id":"cerimonia","nome":"Cerimônia","itens":[{"item_id":"${id(6)}","quantidade":3},{"item_id":"${id(7)}","quantidade":1}]},{"id":"recepcao","nome":"Recepção","itens":[{"item_id":"${id(6)}","quantidade":5},{"item_id":"${id(7)}","quantidade":2}]}]}}}');
 create table separacoes_itens(id uuid,separacao_pedido_id uuid,item_id uuid);
 insert into separacoes_itens values('${id(5)}','${id(4)}','${id(6)}'),('${id(12)}','${id(4)}','${id(7)}'),('${id(13)}','${id(4)}','${id(8)}');
 create table fixture_itens(dados jsonb);
 insert into fixture_itens values('{"chave":"${id(5)}|${id(6)}","item_id":"${id(6)}","nome":"Cadeira","esperado":8}'),
 ('{"chave":"${id(12)}|${id(16)}","item_id":"${id(16)}","nome":"Almofada do kit","kit_nome":"Sofá","por_kit":2,"esperado":5}'),
 ('{"chave":"${id(13)}|${id(8)}","item_id":"${id(8)}","nome":"Mesa","esperado":2}');
 create function mont_contagem_itens(text,uuid) returns jsonb language sql as $$select jsonb_build_object('itens',jsonb_agg(dados)) from fixture_itens$$;
 create table operacao_registros(id uuid default gen_random_uuid(),empresa_id uuid,etapa_id uuid,tipo text,dados jsonb,autor text);
 create table operacao_apontamentos(id uuid default gen_random_uuid(),empresa_id uuid,etapa_id uuid,funcionario_id uuid,nome text,inicio timestamptz,fim timestamptz,status text default 'ATIVO');
 insert into operacao_apontamentos(empresa_id,etapa_id,funcionario_id,nome,inicio) values('${id(1)}','${id(3)}','${id(2)}','Ana',now()-interval '2 hours');
 create function mont_inicio_por_presenca(uuid,uuid,text,timestamptz) returns uuid language sql as $$select id from operacao_apontamentos where etapa_id=$1 and funcionario_id=$2 limit 1$$;
 create function mont_apontamento_ativo(app_sessoes) returns jsonb language sql as $$select jsonb_build_object('id',id) from operacao_apontamentos where funcionario_id=($1).funcionario_id and status='ATIVO' limit 1$$;
 create function operacao_validar_etapa_campo(uuid) returns void language plpgsql as $$begin return;end$$;
 create table free_vagas(id uuid,empresa_id uuid,etapa_id uuid,status text);
 insert into free_vagas values('${id(20)}','${id(1)}','${id(3)}','ABERTA');
 create table free_inscricoes(id uuid,empresa_id uuid,vaga_id uuid,status text,checkin_em timestamptz,checkout_em timestamptz);
 insert into free_inscricoes values('${id(21)}','${id(1)}','${id(20)}','CONFIRMADO',now()-interval '2 hours',null),('${id(22)}','${id(1)}','${id(20)}','CONFIRMADO',now()-interval '2 hours',null),('${id(23)}','${id(1)}','${id(20)}','CONFIRMADO',null,null);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261031006000_montador_ambientes_checkout_bonus.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261031003000_montador_conferencia_entrega.sql','utf8').match(/create or replace function public.mont_entrega_salvar\([\s\S]*?end \$\$;/)[0]);
 return db;
}
test('ambientes: repete a peça com quantidades próprias, expande kits, respeita carregamento e mantém itens soltos',async()=>{
 const db=await fixture();try{
 const r=(await db.query('select mont_entrega_itens($1,$2) r',['Ana',id(3)])).rows[0].r;
 assert.deepEqual(r.itens.filter(i=>i.nome==='Cadeira').map(i=>[i.ambiente,i.esperado]),[['Cerimônia',3],['Recepção',5]]);
 assert.deepEqual(r.itens.filter(i=>i.nome==='Almofada do kit').map(i=>i.esperado),[2,3]);
 assert.equal(r.itens.find(i=>i.nome==='Mesa').ambiente,'Outros itens');assert.equal(r.itens.reduce((n,i)=>n+i.esperado,0),15);
 assert.equal(new Set(r.itens.map(i=>i.chave)).size,r.itens.length);
 await assert.rejects(db.query('select mont_entrega_itens($1,$2)',['Outro',id(3)]),/acesso/);
 const conferir=Object.fromEntries(r.itens.map(i=>[i.chave,{entregue:i.esperado,danificados:0}]));
 const excesso=structuredClone(conferir);excesso[r.itens[0].chave].entregue++;
 await assert.rejects(db.query('select mont_entrega_salvar($1,$2,$3)',['Ana',id(3),excesso]),/Quantidade/);
 const gravado=(await db.query('select mont_entrega_salvar($1,$2,$3) r',['Ana',id(3),conferir])).rows[0].r;
 assert.equal(gravado.enviado,true);assert.deepEqual(gravado.conferencia[r.itens[0].chave],{entregue:3,danificados:0,observacao:'',foto:''});
 await db.exec("update separacoes_pedidos set observacoes='{}'");
 const salvo=(await db.query('select mont_entrega_itens($1,$2) r',['Ana',id(3)])).rows[0].r;
 assert.deepEqual(salvo.itens,r.itens);assert.equal(salvo.enviado,true);
 }finally{await db.close();}
});
test('check-out: primeira saída mantém cronômetro; última encerra, ausentes não bloqueiam e reabertura não reinicia',async()=>{
 const db=await fixture();try{
 await db.exec(`update free_inscricoes set checkout_em=now()-interval '1 minute' where id='${id(21)}'`);
 assert.equal((await db.query('select status from operacao_apontamentos')).rows[0].status,'ATIVO');
 await db.exec(`update free_inscricoes set checkout_em=now() where id='${id(22)}'`);
 const fim=(await db.query('select status,fim,inicio from operacao_apontamentos')).rows[0];assert.equal(fim.status,'ENCERRADO');assert.ok(fim.fim>fim.inicio);
 const r=(await db.query('select mont_checkin_apontamento($1,$2) r',['Ana',id(3)])).rows[0].r;
 assert.equal(r.status,'ENCERRADO');assert.equal(r.idEtapa,id(3));
 assert.equal((await db.query('select count(*)::int n from operacao_apontamentos')).rows[0].n,1);
 assert.equal((await db.query('select fim from operacao_apontamentos')).rows[0].fim.getTime(),fim.fim.getTime());
 await assert.rejects(db.query('select mont_checkin_apontamento($1,$2)',['Outro',id(3)]),/acesso/);
 }finally{await db.close();}
});
test('bônus: cadastro é exclusivo do servidor e deriva do funcionário da sessão',async()=>{
 const db=await fixture();try{
 await db.exec('set role anon');await assert.rejects(db.query('select mont_bonus_cadastro($1)',['Ana']),/permission denied/);
 await db.exec('reset role;set role service_role');
 const r=(await db.query('select mont_bonus_cadastro($1) r',['Ana'])).rows[0].r;assert.equal(r.id,id(2));assert.equal(r.cpf,'cofre:protegido');
 await assert.rejects(db.query('select mont_bonus_cadastro($1)',['Supervisor']),/individual/);
 await assert.rejects(db.query('select mont_bonus_cadastro($1)',['Outro']),/empresa/);
 await assert.rejects(db.query('select mont_bonus_cadastro($1)',['expirado']),/SESSAO/);
 }finally{await db.close();}
});
test('Central: extrato integrado usa somente a identidade validada e preserva os valores do extrato original',()=>{
 const calls=[];const ctx={Acervo:{equipeCadastroMontador:token=>{calls.push(token);if(token!=='sessao')throw Error('SESSAO_EXPIRADA');return {id:'ana',empresa_id:'empresa',cpf:'12345678901',nome:'Ana'};}},liberarAcessoInterno_(){},pagamentosBonusCentralObter:()=>({ano:'2026',anosDisponiveis:['2026'],meses:[],pessoas:[{chave:'CPF:12345678901',valores:{'2026-10':{devido:300,pago:100}}},{chave:'CPF:99999999999',valores:{'2026-10':{devido:9999,pago:9999}}}]}),premiacoesObter:()=>({meses:[]}),Session:{getScriptTimeZone:()=>''},Utilities:{formatDate:()=>''}};
 ctx.premiacoesEhMesPremiacao_=()=>false;
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('api/_gas/projetos/central/AppEquipe.js','utf8'),ctx);ctx.appEquipeCompletarMetas_=()=>{};
 const r=ctx.equipeExtratoMontador('sessao','outro-funcionario');assert.equal(r.meses[0].abastecido,300);assert.equal(r.meses[0].pago,100);assert.deepEqual(calls,['sessao']);
 assert.throws(()=>ctx.equipeExtratoMontador('expirada'),/SESSAO/);
});
