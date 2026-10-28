// Teste de integração opt-in (RUN_2FA_LIVE=1) da verificação em duas etapas, contra o banco e a Edge Function reais.
// Cria uma empresa e um usuário temporários (nunca liga a exigência na empresa de verdade) e apaga tudo no fim.
require('dotenv').config({quiet:true});
const {createClient}=require('@supabase/supabase-js');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
async function main(){
 if(process.env.RUN_2FA_LIVE!=='1') throw new Error('Defina RUN_2FA_LIVE=1 para executar o teste de integração');
 const url=process.env.SUPABASE_URL;assert.equal(new URL(url).host,'awemuohtvwvrdzfxwrmd.supabase.co');
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const anonKey='sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ';
 const ok=({data,error})=>{if(error)throw new Error(error.message);return data;};
 const suffix=crypto.randomUUID().slice(0,8),password=`Test-${crypto.randomUUID()}!`;
 let empresa,userId;
 try{
  empresa=ok(await admin.from('empresas').insert({nome:`TESTE 2FA ${suffix}`}).select('id').single()).id;
  const user=ok(await admin.auth.admin.createUser({email:`teste-2fa-${suffix}@example.invalid`,password,email_confirm:true})).user;userId=user.id;
  ok(await admin.from('usuarios').insert({id:userId,empresa_id:empresa,nome:'Teste 2FA',telefone:'(11) 90000-0000'}));
  ok(await admin.from('usuarios_empresas').insert({user_id:userId,empresa_id:empresa,role:'admin'}));
  ok(await admin.from('fin_categorias').insert({empresa_id:empresa,nome:'Categoria teste 2FA',tipo:'entrada'}).select('id'));
  const cli=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const sess=ok(await cli.auth.signInWithPassword({email:user.email,password})).session;
  const sid=JSON.parse(Buffer.from(sess.access_token.split('.')[1],'base64url')).session_id;
  const call=async body=>{const r=await cli.functions.invoke('seguranca-2fa',{body});if(r.error){let e={};try{e=await r.error.context.json()}catch{}return {status:r.error.context?.status,...e};}return {status:200,...r.data};};
  const categorias=async()=>(ok(await cli.from('fin_categorias').select('id').eq('empresa_id',empresa))||[]).length;

  // 1. Exigência desligada: tudo como antes
  let s=await call({action:'status'});
  assert.equal(s.obrigatorio,false);assert.equal(s.verificado,false);assert.equal(s.tem_whatsapp,true);assert.equal(s.whatsapp,'(**) *****-0000');
  assert.equal(await categorias(),1,'sem exigência a pessoa vê os dados');
  console.log('ok 1 - desligado não muda nada');

  // 2. Não dá para ligar sem ter confirmado um código nesta sessão
  const ligar=await cli.rpc('seguranca_2fa_config_salvar',{p_empresa:empresa,p_obrigatorio:true});
  assert.match(ligar.error?.message||'',/confirme você mesmo um código/);
  console.log('ok 2 - ligar exige ter passado pelo código');

  // 3. Liga pela chave de serviço: a mesma sessão perde o acesso aos dados até confirmar
  ok(await admin.from('seguranca_2fa_config').insert({empresa_id:empresa,obrigatorio:true}));
  s=await call({action:'status'});assert.equal(s.obrigatorio,true);assert.equal(s.verificado,false);
  assert.equal(await categorias(),0,'sem o código não vê nada');
  const ctx=ok(await cli.rpc('funcionario_contexto',{p_empresa_id:empresa}));assert.equal(ctx.ativo,false);assert.equal(ctx.dois_fatores_pendente,true);
  const up=await cli.storage.from('itens').upload(`${empresa}/teste-2fa.txt`,new Blob(['x']),{contentType:'text/plain'});assert.ok(up.error,'Storage também bloqueado');
  console.log('ok 3 - senha sozinha não abre dados, RPC nem arquivos');

  // 4. Envio: grava o código antes; Z-API sem token de segurança dá erro claro (ou envia, se já estiver configurado)
  const env=await call({action:'enviar'});
  if(env.status===200)assert.equal(env.whatsapp,'(**) *****-0000');else assert.match(env.error,/WhatsApp/);
  const codigo=ok(await admin.from('seguranca_2fa_codigos').select('codigo_hash,expira_em,session_id').eq('user_id',userId).single());
  assert.equal(codigo.session_id,sid);assert.match(codigo.codigo_hash,/^[0-9a-f]{64}$/,'só o hash é guardado');
  const espera=await call({action:'enviar'});assert.equal(espera.status,429);assert.match(espera.error,/1 minuto/);
  console.log('ok 4 - código guardado só como hash, 1 envio por minuto ('+(env.status===200?'enviado':'Z-API: '+env.error)+')');

  // 5. Código errado conta tentativa; 5 erros invalidam
  for(let i=4;i>=1;i--){const r=await call({action:'verificar',codigo:'000000'});assert.match(r.error,new RegExp(`Restam ${i}`));}
  const quinto=await call({action:'verificar',codigo:'000000'});assert.match(quinto.error,/Muitas tentativas/);
  const sexto=await call({action:'verificar',codigo:'123456'});assert.match(sexto.error,/expirado|Peça um novo/);
  assert.equal(await categorias(),0);
  console.log('ok 5 - 5 tentativas e o código morre');

  // 6. Código de recuperação inválido é recusado e registrado
  const rec=await call({action:'recuperar',codigo:'AAAA-BBBB'});assert.match(rec.error,/inválido/);
  const evs=ok(await admin.from('seguranca_eventos').select('tipo').eq('user_id',userId));
  for(const t of ['codigo_errado','recuperacao_errada'])assert.ok(evs.some(e=>e.tipo===t),'evento '+t);
  console.log('ok 6 - recuperação inválida recusada e eventos registrados');

  // 7. Sessão verificada (como a Edge Function grava) libera só ESTA sessão
  ok(await admin.from('seguranca_2fa_sessoes').insert({session_id:sid,user_id:userId,metodo:'whatsapp',expira_em:new Date(Date.now()+864e5).toISOString()}));
  assert.equal(await categorias(),1,'com o código confirmado vê os dados');
  const cli2=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});ok(await cli2.auth.signInWithPassword({email:user.email,password}));
  assert.equal((ok(await cli2.from('fin_categorias').select('id').eq('empresa_id',empresa))||[]).length,0,'outro login com a mesma senha continua bloqueado');
  const painel=ok(await cli.rpc('seguranca_2fa_painel',{p_empresa:empresa}));assert.equal(painel.sessao_verificada,true);assert.equal(painel.usuarios[0].tem_whatsapp,true);
  const des=ok(await cli.rpc('seguranca_2fa_config_salvar',{p_empresa:empresa,p_obrigatorio:false}));assert.equal(des.obrigatorio,false);
  const religa=ok(await cli.rpc('seguranca_2fa_config_salvar',{p_empresa:empresa,p_obrigatorio:true}));assert.equal(religa.obrigatorio,true);
  console.log('ok 7 - só a sessão confirmada entra; outro login com a mesma senha não');
  console.log('OK - verificação em duas etapas');
 }finally{
  if(userId){for(const t of ['seguranca_2fa_codigos','seguranca_2fa_sessoes','seguranca_2fa_recuperacao','seguranca_eventos'])await admin.from(t).delete().eq('user_id',userId);}
  if(empresa){await admin.from('seguranca_eventos').delete().eq('empresa_id',empresa);await admin.from('seguranca_2fa_config').delete().eq('empresa_id',empresa);await admin.from('fin_categorias').delete().eq('empresa_id',empresa);}
  if(userId){await admin.from('usuarios_empresas').delete().eq('user_id',userId);await admin.from('usuarios').delete().eq('id',userId);await admin.auth.admin.deleteUser(userId);}
  if(empresa)await admin.from('empresas').delete().eq('id',empresa);
 }
}
main().catch(e=>{console.error(e);process.exit(1);});
