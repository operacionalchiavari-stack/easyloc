const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function run(meta,path='/app.html',search=''){
 const redirects=[];let removed=false;
 const c={navigator:{userAgent:'Android'},location:{pathname:path,search,replace:u=>redirects.push(String(u))},document:{currentScript:{src:'https://example.com/js/app/android-principal.js'},querySelectorAll:()=>[{remove(){removed=true;}}]},URL,URLSearchParams,AbortSignal,fetch:async()=>({ok:true,json:async()=>meta})};c.window=c;c.top=c;
 await vm.runInNewContext(fs.readFileSync('js/app/android-principal.js','utf8'),c);
 return {redirects,removed};
}
test('migração aguarda notificações prontas e preserva catálogo público',async()=>{
 assert.equal((await run({ready:false,notificationsReady:false})).redirects.length,0);
 assert.equal((await run({ready:true,notificationsReady:false})).redirects.length,0);
 const ready=await run({ready:true,notificationsReady:true});assert.deepEqual(ready.redirects,['https://example.com/instalar.html']);assert.equal(ready.removed,true);
 const catalog=await run({ready:true,notificationsReady:true},'/Modulos/Comercial/Catalogo/catalogo-app.html');assert.equal(catalog.redirects.length,0);assert.equal(catalog.removed,false);
 const equipe=await run({ready:true,notificationsReady:true},'/Modulos/Comercial/Catalogo/catalogo-app.html','?app=1');assert.equal(equipe.redirects.length,1);
});
