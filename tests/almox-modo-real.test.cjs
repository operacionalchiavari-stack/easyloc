const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('almoxarifado abre dados reais; simulação exige escolha explícita por empresa',async()=>{
 for(const modo of [null,'real','demo']){
  const valores=new Map(modo?[['almox:modo:empresa-a',modo]]:[]);
  const root={aguardarContexto:async()=>({empresa_id:'empresa-a'}),document:{currentScript:{src:'http://teste/Modulos/Almoxarifado/almox-exemplos.js'},readyState:'complete',querySelector:()=>null},localStorage:{getItem:k=>valores.get(k)||null,setItem:(k,v)=>valores.set(k,v)},sessionStorage:{getItem:()=>null}};
  vm.runInNewContext(fs.readFileSync('Modulos/Almoxarifado/almox-exemplos.js','utf8'),{window:root,document:root.document,localStorage:root.localStorage,sessionStorage:root.sessionStorage,URL,Intl,console});
  await root.AlmoxDemo.ready;assert.equal(root.AlmoxDemo.enabled,modo==='demo');assert.equal(!!root.AlmoxDemo.client,modo==='demo');
 }
});
