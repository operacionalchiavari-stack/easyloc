// Integração opt-in: todas as identidades criadas são temporárias e removidas.
require('dotenv').config({quiet:true});
const {createClient}=require('@supabase/supabase-js');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
(async()=>{
 if(process.env.RUN_FUNCIONARIOS_LIVE!=='1')throw Error('Defina RUN_FUNCIONARIOS_LIVE=1');
 const url=process.env.SUPABASE_URL;assert.equal(new URL(url).hostname,'awemuohtvwvrdzfxwrmd.supabase.co');
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const client=createClient(url,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
 const check=r=>{if(r.error)throw Error(r.error.message);return r.data;};
 const empresa='bb1260f0-99cd-4d17-ab9b-23c299b4c50b';const suffix=randomUUID();const senha='Temp-'+randomUUID()+'!';
 let owner,staff,rhStaff,rhOper;
 try{
  owner=check(await admin.auth.admin.createUser({email:'rh-unico-'+suffix+'@example.invalid',password:senha,email_confirm:true})).user;
  check(await admin.from('usuarios_empresas').insert({user_id:owner.id,empresa_id:empresa,role:'admin'}));
  check(await client.auth.signInWithPassword({email:owner.email,password:senha}));
  const call=async body=>{const r=await client.functions.invoke('funcionarios-admin',{body:{empresa_id:empresa,...body}});if(r.error){let d;try{d=await r.error.context.json()}catch{}throw Error(d?.error||r.error.message);}return r.data;};
  const e={nome:'Teste temporário RH único '+suffix,setor:'Montagem',cargo:'Teste',acesso_sistema:false,ativo:true,pin:'0123',nivel_acesso:'Visualizador',cpf:'99'+Date.now().toString().slice(-9),salario_bruto:2500,equipe_operacional:'montagem',dados_rh:{rg:'TEMPORARIO'}};
  staff=(await call({action:'save',employee:e})).id;
  assert.equal(check(await admin.from('usuarios_empresas').select('user_id').eq('user_id',staff)).length,0);
  assert.ok((await admin.auth.admin.getUserById(staff)).error);
  assert.equal(check(await admin.rpc('rh_pin_conferir',{p_empresa:empresa,p_funcionario:staff,p_pin:'0123'})),true);
  const row=check(await admin.from('funcionarios_acesso').select('salario_bruto,dados_rh').eq('id',staff).single());assert.equal(row.salario_bruto,2500);assert.equal(row.dados_rh.rg,'TEMPORARIO');
  const promoted=await call({action:'save',id:staff,employee:{...e,acesso_sistema:true,login:'rh-promovido-'+suffix,email:'rh-promovido-'+suffix+'@example.invalid',senha},permissions:[]});
  assert.equal(promoted.id,staff,'A liberação de login deve manter o ID da pessoa');
  assert.equal(check(await admin.auth.admin.getUserById(staff)).user.id,staff);
  const session=check(await client.auth.getSession()).session;
  const gs=async(fn,args=[],projeto='central')=>{
   const r=await fetch((process.env.RH_TEST_API||'https://easyloc-zeta.vercel.app')+'/api/gs',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({projeto,fn,args})});
   const d=await r.json();if(!r.ok||!d.ok)throw Error(JSON.stringify(d));return d;
  };
  const funcionarios=await gs('buscarFuncionariosOS');
  const list=funcionarios.resultado||funcionarios.result||funcionarios;
  assert.ok(list.funcionarios.some(f=>f.id===staff));
  const pessoas=await gs('danoCienciaFuncionarios',['montagem']);
  assert.ok((pessoas.resultado||pessoas.result||pessoas).some(f=>f.id===staff));
  const entrada=(await gs('centralEntrar',[''])).resultado;
  const app=(await gs('centralChamar',[entrada.chave,'appEquipeListar',[]])).resultado;
  assert.ok(app.pessoas.some(f=>f.id===staff));assert.ok(app.link);
  const metas=(await gs('centralChamar',[entrada.chave,'operacaoCalcularMes',['2026-10']])).resultado;
  assert.equal(metas.equipes.length,3);
  assert.ok(metas.equipes.find(f=>f.chave==='montagem').membros.some(f=>f.id===staff));
  const acesso=(await gs('equipeEntrar',[e.cpf,'0123'])).resultado;
  const extrato=(await gs('equipeExtrato',[acesso.token])).resultado;
  assert.equal(extrato.pessoa.nome,e.nome);
  const almox=(await gs('buscarUsuarios',[],'almoxarifado')).resultado;
  assert.ok(almox.some(f=>f.ID===staff));
  const rhOcorrencias=(await gs('getFuncionarios',[],'controlerh')).resultado;
  assert.ok(rhOcorrencias.some(f=>f.nomeCompleto===e.nome));
  const rhEmail='rh-gestor-'+suffix+'@example.invalid';
  rhStaff=(await call({action:'save',employee:{...e,nome:'Teste temporário gestor RH '+suffix,cpf:'',acesso_sistema:true,login:'rh-gestor-'+suffix,email:rhEmail,senha,nivel_acesso:'Recursos Humanos'},permissions:['rh.funcionarios.visualizar','rh.funcionarios.criar','rh.funcionarios.editar']})).id;
  const rhClient=createClient(url,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
  check(await rhClient.auth.signInWithPassword({email:rhEmail,password:senha}));
  const op=await rhClient.functions.invoke('funcionarios-admin',{body:{action:'save',empresa_id:empresa,employee:{...e,nome:'Teste temporário criado pelo RH '+suffix,cpf:'',pin:'4567'}}});
  rhOper=check(op).id;assert.ok(rhOper);
  const proibido=await rhClient.functions.invoke('funcionarios-admin',{body:{action:'save',empresa_id:empresa,id:staff,employee:{...e,acesso_sistema:true,login:'rh-promovido-'+suffix,email:'rh-promovido-'+suffix+'@example.invalid',senha:'Troca-indevida-'+randomUUID(),cpf:e.cpf}}});
  assert.ok(proibido.error,'RH não pode trocar a senha de login de outra pessoa');
  console.log('PASS LIVE: funcionário sem login, PIN, dados de RH, promoção com ID estável e leitura do servidor publicado.');
 }finally{
  for(const id of [rhOper,rhStaff,staff,owner?.id].filter(Boolean)){
   check(await admin.from('rh_pin_tentativas').delete().eq('funcionario_id',id));
   check(await admin.from('logs_permissoes').delete().eq('usuario_alvo_id',id));
   check(await admin.from('permissoes_usuario').delete().eq('usuario_id',id));
   check(await admin.from('usuarios_empresas').delete().eq('user_id',id));
   check(await admin.from('usuarios').delete().eq('id',id));
   check(await admin.from('funcionarios_acesso').delete().eq('id',id));
   if(!(await admin.auth.admin.getUserById(id)).error)check(await admin.auth.admin.deleteUser(id));
  }
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
