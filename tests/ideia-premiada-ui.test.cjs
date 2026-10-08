const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../Modulos/RH/IdeiaPremiada/ideia-premiada.js'),'utf8');
const example={id:'idea-1',titulo:'Economia de material',autor_nome:'Ana',area:'Operacao',problema:'Um problema recorrente',proposta:'Uma proposta de melhoria',beneficio:'Reduzir desperdicio',status:'recebida',retorno:'',premio:'',created_at:'2026-10-08T12:00:00Z',updated_at:'2026-10-08T12:00:00Z'};
async function setup(permissions=[]){
  const elements=new Map(),calls=[];
  function element(id){
    if(!elements.has(id))elements.set(id,{id,value:'',hidden:id==='tabRecebidas',disabled:id==='btnEnviarIdeia',textContent:'',innerHTML:'',events:{},attrs:{},classList:{toggle(){}},elements:{status:{value:''},retorno:{value:''},premio:{value:''}},addEventListener(k,fn){this.events[k]=fn},setAttribute(k,v){this.attrs[k]=v},showModal(){this.open=true},close(){this.open=false},reset(){this.wasReset=true}});
    return elements.get(id);
  }
  let rpcError=null;
  const scope={document:{getElementById:element},window:{aguardarContexto:async()=>({empresa_id:'company-1',usuario_id:'user-1',usuario_nome:'Ana'}),EasyLocPermissions:{load:async()=>{},canNavigate:()=>true,hasPermission:key=>permissions.includes(key)},supabaseClient:{rpc:async(name,args)=>{calls.push({name,args});return rpcError?{error:rpcError}:{data:name==='ideias_premiadas_listar'?[example]:null,error:null}}}},location:{href:'https://test/Modulos/RH/IdeiaPremiada/ideia-premiada.html',search:''},URLSearchParams,FormData:class{constructor(form){this.data=form.values}*[Symbol.iterator](){yield*Object.entries(this.data)}}};
  await vm.runInNewContext(source,scope);
  return {element,calls,setError:error=>rpcError=error};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('employee can submit and track own ideas without opening the RH inbox',async()=>{
  const {element,calls}=await setup();
  assert.equal(element('btnEnviarIdeia').disabled,false);assert.equal(element('tabRecebidas').hidden,true);
  element('tabRecebidas').events.click();assert.equal(calls.length,0);
  const form=element('formIdeia');form.values={titulo:example.titulo,area:example.area,problema:example.problema,proposta:example.proposta,beneficio:example.beneficio};
  await form.events.submit({preventDefault(){},target:form});await flush();
  assert.equal(calls[0].name,'ideias_premiadas_enviar');assert.equal(calls[0].args.p_empresa,'company-1');assert.equal(calls[1].args.p_todas,false);
  assert(form.wasReset);assert.equal(element('btnEnviarIdeia').disabled,false);assert(element('listaIdeias').innerHTML.includes('Economia de material'));
  element('buscaIdeias').value='nobody';element('buscaIdeias').events.input();assert(!element('listaIdeias').innerHTML.includes('data-id'));
  element('buscaIdeias').value='ana economia';element('buscaIdeias').events.input();assert(element('listaIdeias').innerHTML.includes('data-id'));
  element('statusIdeias').value='premiada';element('statusIdeias').events.change();assert(!element('listaIdeias').innerHTML.includes('data-id'));
});
test('failed submission retains the form and restores the button',async()=>{
  const {element,setError}=await setup();setError({message:'Network failed'});
  const form=element('formIdeia');form.values={titulo:example.titulo,area:example.area,problema:example.problema,proposta:example.proposta,beneficio:example.beneficio};
  await form.events.submit({preventDefault(){},target:form});assert(!form.wasReset);assert.equal(element('btnEnviarIdeia').disabled,false);assert.equal(element('avisoIdeias').textContent,'Network failed');
});
test('RH can open the full inbox and reviewers can evaluate',async()=>{
  const {element,calls}=await setup(['rh.ideias.avaliar']);
  assert.equal(element('tabRecebidas').hidden,false);element('tabRecebidas').events.click();await flush();assert.equal(calls[0].args.p_todas,true);
  element('listaIdeias').events.click({target:{closest:()=>({dataset:{id:example.id}})}});
  assert(element('detalheIdeia').open);assert.equal(element('formAvaliacao').hidden,false);
  const form=element('formAvaliacao');form.values={status:'selecionada',retorno:'Vamos testar',premio:''};await form.events.submit({preventDefault(){},target:form});
  const save=calls.find(c=>c.name==='ideias_premiadas_avaliar');assert.equal(save.args.p_updated_at,example.updated_at);assert.equal(save.args.p_id,example.id);assert.equal(element('detalheIdeia').open,false);
});
