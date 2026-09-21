import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { designPresentation, validarProposta } from '../supabase/functions/studio-ai-engine/presentation-design.mjs';
import { layoutDaProposta } from '../Modulos/Comercial/Catalogo/catalogo-designer.mjs';

const design = { nome:'Jardim contemporâneo',conceito:'Tons naturais, fotos amplas e tipografia elegante.',modelo:'romantico',fonte:'elegante',principal:'#302020',destaque:'#865142',fundo:'#fffafa',suave:'#f1e0dd',capa:'lateral',movimento:'suave',renders:'destaque',pdf_orientacao:'retrato',espaco:'amplo',abertura:'Uma nova história',subtitulo:'Celebrar juntos.',titulo:'Um encontro especial',introducao:'Explore os ambientes preparados para este dia.',encerramento:'Vamos celebrar.' };
test('IA recebe apenas contexto editorial e devolve design validado', async () => {
  let sent;
  const result = await designPresentation({ prompt:'Uma festa romântica ao ar livre', catalog_token:'segredo',scene:{evento:'Ana e Bruno',email:'nao-enviar',ambientes:[{nome:'Lounge',notas:'Acolhedor',fotos:2,preco:123}]} }, {
    apiKey:'teste',fetcher:async (_, options) => { sent = JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(design)}}]})}; },
  });
  assert.deepEqual(result,design);
  assert.equal(sent.response_format.json_schema.strict,true);
  assert.doesNotMatch(JSON.stringify(sent),/segredo|nao-enviar|"preco"/);
  const layout = layoutDaProposta(result);
  assert.equal(layout.pagina.fluxo,'ambientes');
  assert.equal(layout.conteudo.titulo,design.titulo);
  assert.equal(layout.cores.principal,design.principal);
});
test('paletas inválidas, respostas incompletas, recusa e falha do provedor não viram proposta',async()=>{
  assert.throws(()=>validarProposta({...design,principal:'red;url(x)'}));
  assert.throws(()=>validarProposta({modelo:'classico'}));
  for(const response of [{ok:false},{ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})}]) {
    await assert.rejects(designPresentation({prompt:'Uma festa clássica elegante'},{apiKey:'teste',fetcher:async()=>response}));
  }
  await assert.rejects(designPresentation({prompt:'curto'},{apiKey:'teste'}));
});

const source = stripTypeScriptTypes(fs.readFileSync('supabase/functions/studio-ai-engine/index.ts','utf8').replace(/^import .*;\r?\n/gm,''));
function handler({ authorized = true, fail = false, reserveFail = false } = {}) {
  const calls=[]; let requests=0, serveHandler;
  const client={rpc:async(name,params)=>{
    calls.push({name,params});
    if(name==='catalogo_validar_sessao') return {data:{valido:authorized,empresa_id:'empresa',cliente_id:'cliente'}};
    if(name==='creditos_reservar' && reserveFail) return {error:{message:'Saldo insuficiente'}};
    return {data:true,error:null};
  }};
  vm.runInNewContext(source,{Deno:{env:{get:()=> 'test'}},createClient:()=>client,serve:fn=>{serveHandler=fn;},Request,Response,console,
    designPresentation:async()=>{requests++;if(fail)throw new Error('Falha de teste');return design;}});
  return {calls,requests:()=>requests,run:body=>serveHandler(new Request('https://local.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}))};
}
const body={empresa_id:'empresa',catalog_token:'token',action:'design_presentation',prompt:'Uma festa com estilo clássico',scene:{},request_id:'12345678-1234-1234-1234-123456789012',expected_cost:1};
test('endpoint exige sessão válida e créditos antes de chamar a IA',async()=>{
  const denied=handler({authorized:false});assert.equal((await denied.run(body)).status,401);assert.equal(denied.requests(),0);
  const credit=handler({reserveFail:true});assert.equal((await credit.run(body)).status,402);assert.equal(credit.requests(),0);
  const ok=handler();assert.equal((await ok.run(body)).status,200);
  assert.equal(ok.calls.find(c=>c.name==='creditos_reservar').params.p_recurso,'layout');
  assert.equal(ok.calls.find(c=>c.name==='creditos_finalizar').params.p_sucesso,true);
});
test('falha de geração devolve a reserva e não devolve sucesso falso',async()=>{
  const failed=handler({fail:true});assert.equal((await failed.run(body)).status,500);
  assert.equal(failed.calls.find(c=>c.name==='creditos_finalizar').params.p_sucesso,false);
});
