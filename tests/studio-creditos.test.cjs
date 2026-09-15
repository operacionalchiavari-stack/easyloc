const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/studio-ai-engine/index.ts','utf8').replace(/^import .*;\r?\n/gm,''));
function engine({insufficient=false,fail=false}={}){
 let handler;const calls=[];let providerCalls=0;
 const client={rpc:async(name,args)=>{calls.push({name,args});return name==='catalogo_validar_sessao'?{data:{valido:true,empresa_id:'company',cliente_id:'decorator'}}:name==='creditos_reservar'&&insufficient?{error:{message:'Saldo insuficiente'}}:{data:true};}};
 const context=vm.createContext({Deno:{env:{get:()=> 'test'}},serve:h=>handler=h,createClient:()=>client,Response,FormData,Blob,Uint8Array,atob,console,fetch:async()=>{providerCalls++;return {ok:!fail,json:async()=>fail?{error:'failed'}:{data:[{b64_json:'result'}]}};}});
 vm.runInContext(source,context);
 return {calls,providerCalls:()=>providerCalls,run:body=>handler(new Request('http://test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({empresa_id:'company',catalog_token:'test',request_id:'00000000-0000-4000-8000-000000000001',expected_cost:1,prompt:'render',scene:{preview:'data:image/png;base64,AA=='},...body})}))};
}
test('saldo insuficiente não chama provedor',async()=>{const e=engine({insufficient:true});assert.equal((await e.run()).status,402);assert.equal(e.providerCalls(),0);});
test('sucesso conclui a reserva no servidor',async()=>{const e=engine();const r=await e.run();assert.equal((await r.json()).ok,true);assert.equal(e.calls.at(-1).name,'creditos_finalizar');assert.equal(e.calls.at(-1).args.p_sucesso,true);});
test('falha do provedor devolve a reserva',async()=>{const e=engine({fail:true});await e.run();assert.equal(e.calls.at(-1).name,'creditos_finalizar');assert.equal(e.calls.at(-1).args.p_sucesso,false);});
test('cliente precisa confirmar o custo e enviar identificador',async()=>{const e=engine();assert.equal((await e.run({request_id:null})).status,400);assert.equal(e.providerCalls(),0);assert.equal(e.calls.some(c=>c.name==='creditos_reservar'),false);});
