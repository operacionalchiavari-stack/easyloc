const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fonte=fs.readFileSync('Modulos/Comercial/Catalogo/catalogo-projetos.mjs','utf8');
const funcao=fonte.slice(fonte.indexOf('async function gravarNoPedidoComercial('),fonte.indexOf('async function renderizarProjetoComIA('));
function preparar(id,salvo=true){
 const calls=[],project={dados:{ambientes:[]}},parent={__PEDIDO_ATUAL_ID:id,__pedidoGravarProjetoComercial:async p=>{calls.push(p);return salvo;}};
 const ctx=vm.createContext({ctx:{pedidoComercial:true},S:{current:project},window:{parent},structuredClone,plantasDoPedido:async()=>[]});vm.runInContext(funcao,ctx);
 return {calls,ctx,project,parent};
}
test('composição em pedido novo permanece no rascunho sem erro nem tentativa de gravar pedido inexistente',async()=>{
 const {ctx,calls}=preparar(null,false);await ctx.gravarNoPedidoComercial();assert.equal(calls.length,0);
});
test('pedido existente confirma a gravação e mantém erros reais de persistência visíveis',async()=>{
 const ok=preparar('pedido');await ok.ctx.gravarNoPedidoComercial();assert.equal(ok.calls.length,1);
 const erro=preparar('pedido',false);await assert.rejects(erro.ctx.gravarNoPedidoComercial(),/ainda não foi gravada/);assert.equal(erro.calls.length,1);
});
