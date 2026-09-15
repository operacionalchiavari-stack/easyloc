// Teste de integração opt-in. Cria somente contas temporárias e remove seus próprios registros no finally.
require('dotenv').config({quiet:true});
const {createClient}=require('@supabase/supabase-js');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
async function main(){
 if(process.env.RUN_FUNCIONARIOS_LIVE!=='1') throw new Error('Defina RUN_FUNCIONARIOS_LIVE=1 para executar o teste de integração');
 const url=process.env.SUPABASE_URL;
 assert.equal(new URL(url).host,'awemuohtvwvrdzfxwrmd.supabase.co');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY;
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const anonKey='sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ';
 const checked=({data,error})=>{if(error)throw new Error(error.message);return data;};
 const {empresa_id:empresa}=checked(await admin.from('usuarios_empresas').select('empresa_id').eq('role','admin').limit(1))[0];
 const suffix=crypto.randomUUID();const password=`Test-${crypto.randomUUID()}!`;
 const ids=[];let path;
 try {
  const owner=checked(await admin.auth.admin.createUser({email:`teste-cadastro-${suffix}@example.invalid`,password,email_confirm:true})).user;
  ids.push(owner.id);
  checked(await admin.from('usuarios').insert({id:owner.id,empresa_id:empresa,nome:'Teste temporário de cadastro'}));
  checked(await admin.from('usuarios_empresas').insert({user_id:owner.id,empresa_id:empresa,role:'admin'}));
  const auth=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  checked(await auth.auth.signInWithPassword({email:owner.email,password}));
  const call=async body=>{
   const result=await auth.functions.invoke('funcionarios-admin',{body:{empresa_id:empresa,...body}});
   if(result.error){let err;try{err=await result.error.context.json()}catch{}throw new Error(err?.error||result.error.message)}
   if(result.data.error)throw new Error(result.data.error);return result.data;
  };
  const browser=await chromium.launch({channel:'msedge',headless:true});
  let photo;
  try{const page=await browser.newPage();photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;c.getContext('2d').fillRect(0,0,64,64);return c.toDataURL('image/jpeg')})}finally{await browser.close()}
  const employee={nome:'Teste temporário funcionário',setor:'Comercial',cargo:'Teste',login:`teste-${suffix}`,email:`teste-funcionario-${suffix}@example.invalid`,senha:password,pin:'0123',nivel_acesso:'Visualizador',ativo:true,telefone:'',foto_url:''};
  const saved=await call({action:'save',employee,photo,permissions:['comercial.catalogo.visualizar']});ids.push(saved.id);
  const row=checked(await admin.from('funcionarios_acesso').select('foto_url,pin_hash').eq('id',saved.id).single());path=row.foto_url;
  assert.ok(path.startsWith(`${empresa}/${saved.id}/`));assert.notEqual(row.pin_hash,'0123');
  const urls=await call({action:'photo-urls',paths:[path]});assert.ok(urls.urls[0].signedUrl);
  const loginClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=checked(await loginClient.functions.invoke('funcionarios-admin',{body:{action:'login',login:employee.login,password}}));
  checked(await loginClient.auth.setSession(result.session));
  const permissions=checked(await loginClient.rpc('get_permissoes_usuario_resolvidas',{p_empresa_id:empresa,p_usuario_id:saved.id}));
  assert.equal(permissions.filter(p=>p.permitido).length,1);
  const denied=await loginClient.rpc('funcionarios_listar',{p_empresa_id:empresa});assert.ok(denied.error);
  const deniedSave=await loginClient.functions.invoke('funcionarios-admin',{body:{action:'save',empresa_id:empresa,id:owner.id,employee,permissions:[]}});assert.ok(deniedSave.error);
  const clients=checked(await loginClient.from('clientes_empresas').select('id').limit(1));assert.equal(clients.length,0);
  const ownUpdate=await loginClient.from('usuarios_empresas').update({role:'admin'}).eq('user_id',saved.id).select();assert.equal(ownUpdate.data?.length||0,0);
  const newPassword=`Changed-${crypto.randomUUID()}!`;
  employee.email=`teste-email-${suffix}@example.invalid`;
  const updated=await call({action:'save',id:saved.id,employee:{...employee,senha:newPassword,pin:'',foto_url:path},permissions:['comercial.catalogo.visualizar']});
  assert.equal(updated.warning,'');
  const updatedLogin=checked(await loginClient.functions.invoke('funcionarios-admin',{body:{action:'login',login:employee.login,password:newPassword}}));
  assert.ok(updatedLogin.session.access_token);
  const next={...employee,senha:'',pin:'',foto_url:path,ativo:false};
  await call({action:'save',id:saved.id,employee:next,permissions:[]});
  const ctx=checked(await loginClient.rpc('funcionario_contexto',{p_empresa_id:empresa}));assert.equal(ctx.ativo,false);
  const noLogin=await loginClient.functions.invoke('funcionarios-admin',{body:{action:'login',login:employee.login,password:newPassword}});assert.ok(noLogin.error);
  const sessionAfter=await loginClient.from('assinaturas').select('empresa_id');assert.equal(sessionAfter.data?.length||0,0);
  console.log('PASS LIVE: conta Auth, login por nome, foto privada, PIN protegido, RLS, tentativa de elevar acesso, bloqueio e sessão já aberta');
 } finally {
  if(path)checked(await admin.storage.from('funcionarios-fotos').remove([path]));
  for(const id of ids.reverse()){
   checked(await admin.from('logs_permissoes').delete().eq('usuario_alvo_id',id));
   checked(await admin.from('permissoes_usuario').delete().eq('usuario_id',id));
   checked(await admin.from('usuarios_empresas').delete().eq('user_id',id));
   checked(await admin.from('usuarios').delete().eq('id',id));
   checked(await admin.auth.admin.deleteUser(id));
  }
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
