const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function fixture(){
 const events={},sent=[],calls=[],state={textContent:''};let logout;
 const host={hidden:true,innerHTML:'',querySelector:()=>state};
 const c={console,crypto:crypto.webcrypto,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),setTimeout:()=>1,clearTimeout(){},document:{getElementById:()=>host,addEventListener:(n,f)=>events[n]=f},addEventListener:(n,f)=>events[n]=f,AcervoAndroid:{postMessage:s=>sent.push(JSON.parse(s))},supabaseClient:{auth:{getSession:async()=>({data:{session:{user:{id:'pessoa'}}}}),onAuthStateChange:f=>logout=f},rpc:async(name,args)=>{calls.push({name,args});return {error:null};},functions:{invoke:async()=>({data:{ok:true}})}}};c.window=c;
 vm.runInNewContext(fs.readFileSync('js/app/avisos-android.js','utf8'),c);
 return {c,events,sent,calls,state,host,logout:()=>logout('SIGNED_OUT')};
}
const flush=()=>new Promise(setImmediate);
test('avisos nativos respeitam ativação, conta e desligamento no logout',async()=>{
 const a=fixture();a.c.AppAvisosAndroid.iniciar('empresa');assert.equal(a.sent[0].action,'push:status');
 a.events['acervo:push']({detail:{type:'status',configured:true,enabled:false}});
 await a.events.click({target:{closest:()=>({dataset:{nativePush:'enable'}})}});assert.equal(a.sent[1].action,'push:enable');assert.equal(a.calls.length,0);
 a.events['acervo:push']({detail:{type:'token',token:'fcm-test',device:'dispositivo'}});await flush();
 assert.equal(a.calls[0].name,'app_android_push_registrar');assert.equal(a.calls[0].args.p_empresa,'empresa');assert.match(a.calls[0].args.p_binding,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(a.sent[2].action,'push:bind');assert.equal(a.sent[2].usuario,'pessoa');
 a.logout();assert.equal(a.sent.at(-1).action,'push:disable');
 a.events['acervo:push']({detail:{type:'token',token:'outro',device:'dispositivo'}});await flush();assert.equal(a.calls.length,1);
});
test('logout durante registro revoga a autorização sem ativar o aparelho',async()=>{
 const a=fixture();let finish;
 a.c.supabaseClient.rpc=async(name,args)=>{a.calls.push({name,args});if(name==='app_android_push_registrar')await new Promise(r=>finish=r);return {error:null};};
 a.c.AppAvisosAndroid.iniciar('empresa');a.events['acervo:push']({detail:{type:'token',token:'fcm-test',device:'dispositivo'}});await flush();
 a.logout();finish();await flush();
 assert.equal(a.calls[1].name,'app_android_push_encerrar');assert.equal(a.sent.some(s=>s.action==='push:bind'),false);
});
