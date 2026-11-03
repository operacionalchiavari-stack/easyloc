const {test}=require('node:test'),assert=require('node:assert/strict');
const fluxo=require('../Modulos/Gestao/Fluxograma/fluxograma-detalhado.js');
const guia=require('../Modulos/Gestao/Fluxograma/fluxograma-guia.js');
test('every original task and branch is readable in its area chapter',()=>{
 let total=0;
 for(const setor of fluxo.ordemSetores){
  const grupos=fluxo.resumirSetor(setor);
  grupos.forEach((grupo,capitulo)=>{
   const html=guia.renderizar({setor,capitulo,grupos,nos:fluxo.nos,setores:fluxo.setores,ordem:fluxo.ordemSetores,podeAbrir:()=>false});
   for(const id of grupo.membros){
    const n=fluxo.nos.find(n=>n.id===id);total++;
    assert.ok(html.includes('data-fxg-estudo-id="'+id+'"'));
    for(const saida of n.saidas)assert.ok(html.includes('data-fxg-guia-ir="'+saida.destino+'"'));
   }
   assert.ok(html.includes('data-fxg-guia-estudado="'+grupo.id+'"'));
   assert.ok(!html.includes('undefined'));
  });
 }
 assert.equal(total,fluxo.nos.length);
});
