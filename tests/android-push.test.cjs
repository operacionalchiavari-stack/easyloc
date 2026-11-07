const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
test('FCM usa credencial no servidor, escopo por empresa e mensagem nativa verificável',async()=>{
 const originalFetch=global.fetch,originalDeno=global.Deno;
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const config={project_id:'chiavari-test',client_email:'push@chiavari-test.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
 let configured=false,invalid=false,calls=0;
 global.Deno={env:{get:()=>configured?JSON.stringify(config):undefined}};
 global.fetch=async(url,options)=>{
  calls++;
  if(url==='https://oauth2.googleapis.com/token'){
   const parts=options.body.get('assertion').split('.');
   assert.ok(crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),publicKey,Buffer.from(parts[2],'base64url')));
   const claims=JSON.parse(Buffer.from(parts[1],'base64url'));
   assert.equal(claims.scope,'https://www.googleapis.com/auth/firebase.messaging');
   return Response.json({access_token:'temporary-test-oauth',expires_in:3600});
  }
  assert.equal(url,'https://fcm.googleapis.com/v1/projects/chiavari-test/messages:send');
  assert.equal(options.headers.Authorization,'Bearer temporary-test-oauth');
  const payload=JSON.parse(options.body).message;
  assert.equal(payload.data.user_id,'pessoa');assert.equal(payload.data.empresa_id,'empresa');
  assert.equal(payload.android.priority,'high');assert.equal(payload.android.restricted_package_name,'br.com.chiavari.acervo');
  assert.equal(payload.notification,undefined); // O app confere a conta antes de mostrar o aviso.
  return invalid?Response.json({error:{status:'NOT_FOUND',details:[{errorCode:'UNREGISTERED'}]}},{status:404}):Response.json({name:'projects/test/messages/1'});
 };
 try{
  const source=require('node:module').stripTypeScriptTypes(require('node:fs').readFileSync('supabase/functions/app-push/fcm.ts','utf8')).replace(/^export /gm,'');
  const enviarFcm=require('node:vm').runInNewContext('(function(){'+source+';return enviarFcm;})()',{Deno:global.Deno,crypto:crypto.webcrypto,fetch:(...args)=>global.fetch(...args),btoa,atob,URLSearchParams,TextEncoder,TextDecoder,AbortSignal,Date,Uint8Array,JSON,Error,Number,String});
  const aviso={titulo:'Teste',corpo:'Aviso de teste',user_id:'pessoa',empresa_id:'empresa'};
  assert.equal((await enviarFcm('fcm-test',aviso)).ok,false);assert.equal(calls,0);
  configured=true;assert.equal((await enviarFcm('fcm-test',aviso)).ok,true);assert.equal(calls,2);
  invalid=true;assert.equal((await enviarFcm('fcm-test',aviso)).invalid,true);assert.equal(calls,3);
 }finally{global.fetch=originalFetch;global.Deno=originalDeno;}
});
