const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
test('Sofia usa contexto autorizado em cada consulta e preserva envio de ideias',async()=>{
 const {sistemaRh}=await import('../supabase/functions/_shared/rh-assistente.mjs');
 let handler,segundoFator=false,negado=false,consultas=0,api=[],configuracoes=[];
 const pessoa={rpc:async(n,a)=>{
  if(n==='funcionario_contexto')return {data:{ativo:a.p_empresa_id==='empresa'}};
  consultas++;return negado?{error:{code:'42501'}}:{data:{hoje:'2026-11-21',modulos:{ferias:{acesso:'proprio',total:1,registros:[{inicio:'2026-12-01',status:'programada'}]}}}};
 }};
 const service={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{nome:'Ana'}})})};
 const resumo={titulo:'Carrinho menor',area:'Operação e eventos',problema:'Passagem estreita causa retrabalho',proposta:'Usar um carrinho menor na passagem',beneficio:'Evitar retrabalho e economizar tempo'};
 const sandbox={Request,Response,Headers,AbortSignal,FormData,Blob,Uint8Array,atob,console,sistemaRh,
  Deno:{env:{get:n=>({SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',OPENAI_API_KEY:'fake'})[n]},serve:h=>handler=h},
  comUsoIA:(_,h)=>h,segundaEtapaPendente:async()=>segundoFator,MENSAGEM_2FA:'Confirme sua identidade',
  instrucoesEmpresa:async(_,k)=>{configuracoes.push(k);return '\nPolítica da empresa.';},
  createClient:(_,key,opts)=>opts?{...pessoa,auth:{getUser:async()=>({data:{user:opts.global.headers.Authorization==='Bearer valido'?{id:'usuario'}:null}})}}:service,
  fetch:async(_,opts)=>{const pedido=JSON.parse(opts.body);api.push(pedido);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(pedido.messages[0].content.includes('Contexto consultado agora')?{resposta:'Suas férias estão programadas para 01/12. Fonte: Férias.',pronto:false,resumo:{}}:{resposta:'Confira sua ideia.',pronto:true,resumo})}}]}));}
 };
 const codigo=fs.readFileSync('supabase/functions/ideia-assistente/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInNewContext(stripTypeScriptTypes(codigo),sandbox);
 const chamar=async(dados={},auth='Bearer valido')=>handler(new Request('https://edge.test',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({empresa_id:'empresa',acao:'consultar_rh',mensagens:[{papel:'pessoa',texto:'Quando são minhas férias?'}],...dados})}));
 let r=await chamar({contexto:{segredo:'OUTRA_EMPRESA'}});assert.equal(r.status,200);assert.match((await r.json()).resposta,/01\/12/);
 assert.equal(consultas,1);assert.match(api[0].messages[0].content,/programada/);assert.match(api[0].messages[0].content,/Sofia/);assert.doesNotMatch(api[0].messages[0].content,/OUTRA_EMPRESA/);assert.equal(configuracoes.at(-1),'rh');
 await chamar();assert.equal(consultas,2,'consulta atualizada em cada mensagem');
 const anteriores=api.length;negado=true;r=await chamar();assert.equal(r.status,403);assert.equal(api.length,anteriores);negado=false;
 segundoFator=true;r=await chamar();assert.equal(r.status,403);assert.equal(api.length,anteriores);segundoFator=false;
 r=await chamar({empresa_id:'outra'});assert.equal(r.status,403);assert.equal(api.length,anteriores);
 r=await chamar({},'Bearer invalido');assert.equal(r.status,401);assert.equal(api.length,anteriores);
 r=await chamar({acao:'conversar'});assert.equal(r.status,200);const ideia=await r.json();assert.equal(ideia.pronto,true);assert.equal(ideia.resumo.titulo,resumo.titulo);assert.equal(configuracoes.at(-1),'ideia');
});
