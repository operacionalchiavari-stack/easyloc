const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/studio-ai-engine/index.ts','utf8').replace(/^import .*;\r?\n/gm,''));
function engine(){
  const calls=[];
  const context=vm.createContext({Deno:{env:{get:()=> 'test-key'}},serve:()=>{},FormData,Blob,Uint8Array,atob,console,
    fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({data:[{b64_json:'result'}]})};}});
  vm.runInContext(source,context);
  return {context,calls};
}
const image='data:image/png;base64,AA==';
test('tecido envia duas imagens e preserva instrução de revestimento',async()=>{
  const {context,calls}=engine();
  const input={prompt:'Troque somente o tecido',scene:{preview:image,fabricReference:image,referencePolicy:'fabric_customization'}};
  assert.equal(context.normalizarPrompt(input).prompt,input.prompt);
  const result=await context.generateWithOpenAI(input);
  assert.equal(result.providerStatus,'ok');
  assert.equal(calls[0].options.body.getAll('image[]').length,2);
});
test('renderização preserva uma captura e política de arquitetura',async()=>{
  const {context,calls}=engine();
  await context.generateWithOpenAI({prompt:'Renderize',scene:{preview:image}});
  assert.ok(calls[0].options.body.get('image'));
  assert.match(calls[0].options.body.get('prompt'),/ARQUITETURA/);
});
test('tecido ausente não chama o provedor',async()=>{
  const {context,calls}=engine();
  await assert.rejects(context.generateWithOpenAI({prompt:'Tecido',scene:{preview:image,referencePolicy:'fabric_customization'}}),/tecido ausente/);
  assert.equal(calls.length,0);
});

test('convidados opcionais mantem protecao de moveis e camera',()=>{
  const {context}=engine();
  for(const convidados of ['nenhum','poucos','moderado','invalido']){
    const {prompt}=context.normalizarPrompt({prompt:'Atmosfera',scene:{options:{convidados}}});
    assert.match(prompt,/Nao mover, girar/);
    assert.match(prompt,/Bloqueie a camera/);
    if(['poucos','moderado'].includes(convidados)){
      assert.match(prompt,/Pessoas autorizadas/);
      assert.doesNotMatch(prompt,/Nao adicionar pessoas/);
    }else assert.match(prompt,/Nao adicionar pessoas/);
  }
});
