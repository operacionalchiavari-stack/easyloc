const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/studio-ai-engine/index.ts','utf8').replace(/^import .*;\r?\n/gm,''));
function engine(){
  const calls=[];
  const context=vm.createContext({instrucoesEmpresa:async()=>'\nDiretrizes da empresa',Deno:{env:{get:()=> 'test-key'}},serve:()=>{},FormData,Blob,Uint8Array,atob,console,
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

test('renderização do projeto prioriza cor e luminosidade sobre contraste e diretrizes estéticas',async()=>{
  const {context,calls}=engine();
  context.instrucoesEmpresa=async()=> 'Company style: dramatic lighting and deep contrast.';
  const scene={preview:image,referencePolicy:'furniture_studio_catalog',objects:[{itemName:'Sofá verde'},{itemName:'Poltrona madeira clara'},{itemName:'Poltrona madeira clara'}]};
  await context.generateWithOpenAI({empresa_id:'e',prompt:'Lighting style: directional softbox.',scene});
  const form=calls[0].options.body,prompt=form.get('prompt');
  assert.match(prompt,/2x Poltrona madeira clara/);
  assert.match(prompt,/hue, saturation AND midtone lightness/);
  assert.match(prompt,/gentle localized contact shadows only/);
  assert.match(prompt,/Do not darken or brighten/);
  assert.ok(prompt.lastIndexOf('Color and brightness fidelity take priority')>prompt.indexOf('Company style:'),'proteção de cor encerra as instruções enviadas ao provedor');
  assert.deepEqual([...new Uint8Array(await form.get('image').arrayBuffer())],[0],'a referência original chega intacta ao provedor');
  assert.equal(form.getAll('image').length,1);
  assert.equal(form.get('n'),'1');
});

test('a proteção de cor do estúdio não interfere na troca de tecido nem na política de arquitetura',()=>{
  const {context}=engine();
  assert.match(context.normalizarPrompt({prompt:'Suave',scene:{referencePolicy:'furniture_studio_catalog'}}).prompt,/MANDATORY PRODUCT COLOR FIDELITY/);
  for(const referencePolicy of ['fabric_customization','furniture_strict_literal_scene','furniture_strict_architecture_adaptive']){
    const {prompt}=context.normalizarPrompt({prompt:'Instrução original',scene:{referencePolicy}});
    assert.doesNotMatch(prompt,/MANDATORY PRODUCT COLOR FIDELITY/);
    assert.match(prompt,/Instrução original/);
  }
});

test('o editor do projeto envia a mesma referência e pede fidelidade de cor nos dois estilos de luz',()=>{
  const cliente=fs.readFileSync('Modulos/Comercial/Catalogo/catalogo-studio3d.mjs','utf8');
  const trecho=cliente.slice(cliente.indexOf('const LUZ_ESTUDIO ='),cliente.indexOf('async function executarIA('));
  const vetor={toArray:()=>[0,0,0]};
  const context=vm.createContext({capturarFotoEstudio:()=>({src:image,largura:2160,altura:1440}),sessionStorage:{getItem:()=>null},
    studio:{empresaId:'e',objects:[],camera:{position:vetor,fov:27},orbit:{target:vetor}}});
  vm.runInContext(trecho,context);
  for(const iluminacao of ['suave','cenica']){
    const corpo=context.montarCorpoIA({iluminacao});
    assert.equal(corpo.scene.preview,image);
    assert.equal(corpo.scene.referencePolicy,'furniture_studio_catalog');
    assert.match(corpo.prompt,/hue, saturation and midtone brightness/);
  }
  assert.equal(context.montarCorpoIA().scene.options.iluminacao,'suave','renderização do projeto usa a luz suave por padrão');
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
