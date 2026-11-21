const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/studio-ai-engine/index.ts','utf8').replace(/^import .*;\r?\n/gm,''));
const empresa='10000000-0000-0000-0000-000000000001';
function handler(preparacao,{gerarErro=false,reservarErro=false}={}){
 const calls=[];let endpoint;
 const service={rpc:async(name)=>{calls.push(name);return{data:true,error:reservarErro && name==='creditos_reservar'?{message:'Sem créditos'}:null};}};
 const context=vm.createContext({Deno:{env:{get:()=>'*'}},serve:fn=>endpoint=fn,Request,Response,console,
  prepararPersonalizacao:async()=>{calls.push('consultar-combinacao');return{...preparacao,liberar:async()=>calls.push('liberar-combinacao')};},
  guardarPersonalizacao:async()=>({id:'nova'}),
 });
 vm.runInContext(source,context);
 context.validarAcessoEmpresa=async()=>({serviceClient:service,catalogSession:{cliente_id:'cliente'}});
 context.generateScene=async()=>{calls.push('gerar');if(gerarErro)throw Error('Provedor indisponível');return{providerStatus:'ok',images:[{base64:'nova'}]};};
 const body={empresa_id:empresa,prompt:'Aplicar amostra',scene:{referencePolicy:'fabric_customization',personalizacao:{item_id:'item'}},request_id:'60000000-0000-0000-0000-000000000001',expected_cost:3};
 return{calls,run:async extra=>endpoint(new Request('https://fixture',{method:'POST',body:JSON.stringify({...body,...extra}),headers:{'Content-Type':'application/json'}}))};
}
test('combinação pronta é devolvida antes de reservar créditos, sem chamar o provedor',async()=>{
 const {run,calls}=handler({foto:{id:'foto',url:'https://fixture/pronta.png'}});
 const response=await run({request_id:undefined,expected_cost:undefined});const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.reutilizada,true);assert.equal(data.creditosCobrados,0);assert.equal(data.personalizacaoSalva.id,'foto');
 assert.deepEqual(calls,['consultar-combinacao','liberar-combinacao']);
});
test('combinação em andamento não reserva créditos nem chama IA',async()=>{
 const {run,calls}=handler({ocupada:true});const response=await run();assert.equal(response.status,409);
 assert.deepEqual(calls,['consultar-combinacao','liberar-combinacao']);
});
test('falha do provedor libera a combinação e devolve a reserva',async()=>{
 const {run,calls}=handler({nova:true},{gerarErro:true});const response=await run();assert.equal(response.status,500);
 assert.deepEqual(calls,['consultar-combinacao','creditos_reservar','gerar','creditos_finalizar','liberar-combinacao']);
});
test('saldo insuficiente libera a combinação sem chamar IA',async()=>{
 const {run,calls}=handler({nova:true},{reservarErro:true});const response=await run();assert.equal(response.status,402);
 assert.deepEqual(calls,['consultar-combinacao','creditos_reservar','liberar-combinacao']);
});
