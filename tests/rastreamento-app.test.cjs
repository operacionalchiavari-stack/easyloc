const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function ambiente(){
 const elementos=new Map(),listeners={},storage=new Map(),calls=[];let success,failure,auth,cleared=0;
 const painel={style:{},setAttribute(){},querySelector(s){if(!elementos.has(s))elementos.set(s,{textContent:''});return elementos.get(s);},remove(){}};
 const ctx={console,Date,Promise,setTimeout,setInterval:()=>1,clearInterval(){},location:{pathname:'/app.html'},sessionStorage:{getItem:()=>null},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{createElement:()=>painel,getElementById:()=>({append(){}}),body:{append(){}}},navigator:{geolocation:{watchPosition(ok,err){success=ok;failure=err;return 1;},clearWatch(){cleared++;}}}};
 ctx.window=ctx;ctx.isSecureContext=true;ctx.addEventListener=(name,fn)=>listeners[name]=fn;
 ctx.supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:'pessoa'}}}}),onAuthStateChange:fn=>{auth=fn;}},rpc:async(name,args)=>{calls.push({name,args});return {error:null};}};
 vm.runInNewContext(fs.readFileSync('js/app/rastreamento-app.js','utf8'),ctx);
 return {ctx,calls,storage,elementos,listeners,get success(){return success;},get failure(){return failure;},get cleared(){return cleared;},logout:()=>auth('SIGNED_OUT')};
}
test('localizacao exige ativacao e pausa bloqueia callbacks antigos',async()=>{
 const a=ambiente();await a.ctx.AppRastreador.iniciar('empresa');assert.equal(a.success,undefined);
 await a.elementos.get('[data-ativar]').onclick();const callback=a.success;
 await callback({coords:{latitude:-23,longitude:-46,accuracy:20}});
 assert.equal(a.calls[0].name,'rastreamento_enviar');assert.equal(a.calls[0].args.p_empresa,'empresa');
 await a.elementos.get('[data-parar]').onclick();assert.equal(a.calls[1].name,'rastreamento_parar');
 await callback({coords:{latitude:0,longitude:0,accuracy:1}});assert.equal(a.calls.length,2);assert.equal(a.storage.size,0);assert.ok(a.cleared);
});
test('logout revoga preferencia e bloqueia envio pendente de geolocalizacao',async()=>{
 const a=ambiente();await a.ctx.AppRastreador.iniciar('empresa');await a.elementos.get('[data-ativar]').onclick();const callback=a.success;
 a.logout();await callback({coords:{latitude:0,longitude:0,accuracy:1}});assert.equal(a.calls.length,0);assert.equal(a.storage.size,0);
});
test('permissao negada interrompe rastreamento e remove retomada automatica',async()=>{
 const a=ambiente();await a.ctx.AppRastreador.iniciar('empresa');await a.elementos.get('[data-ativar]').onclick();a.failure({code:1});assert.equal(a.storage.size,0);assert.ok(a.cleared);
});
test('falhas do servidor, sessao e rede mostram orientacoes diferentes',async()=>{
 for(const [error,esperado] of [
  [{code:'PGRST202'},/configurado no servidor/],
  [{code:'P0001',message:'Acesso não autorizado'},/entre novamente/],
  [{code:'23514'},/posição inválida/],
  [{message:'Failed to fetch'},/Sem conexão/],
  [{code:'XX000'},/servidor não conseguiu salvar/]
 ]){
  const a=ambiente();a.ctx.supabaseClient.rpc=async()=>({error});
  await a.ctx.AppRastreador.iniciar('empresa');await a.elementos.get('[data-ativar]').onclick();
  await a.success({coords:{latitude:-23,longitude:-46,accuracy:20}});
  assert.match(a.elementos.get('[role="status"]').textContent,esperado);
 }
});
test('Android usa serviço nativo, mantém rastreamento ao sair da página e para no logout',async()=>{
 const a=ambiente(),mensagens=[];
 a.ctx.crypto=require('node:crypto').webcrypto;a.ctx.Uint8Array=Uint8Array;a.ctx.btoa=s=>Buffer.from(s,'binary').toString('base64');
 a.ctx.AcervoAndroid={postMessage:s=>mensagens.push(JSON.parse(s))};
 a.storage.set('rastreamento:empresa:pessoa','1');
 await a.ctx.AppRastreador.iniciar('empresa');
 assert.equal(mensagens[0].action,'status');assert.equal(a.calls.length,0);
 await a.elementos.get('[data-ativar]').onclick();
 assert.equal(a.success,undefined);assert.equal(a.calls[0].name,'rastreamento_dispositivo_registrar');
 assert.match(a.calls[0].args.p_token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(mensagens[1].action,'start');
 assert.ok(![...a.storage.values()].includes(mensagens[1].token));
 a.listeners['acervo:android']({detail:{type:'started',message:'Ativo'}});
 a.listeners.pagehide();assert.equal(mensagens.length,2);
 a.logout();assert.equal(mensagens.at(-1).action,'stop');
});
