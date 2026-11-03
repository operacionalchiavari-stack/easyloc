const {test}=require('node:test'),assert=require('node:assert/strict');
const f=require('../Modulos/Gestao/Fluxograma/fluxograma-detalhado.js');
const {atravessa}=require('../Modulos/Gestao/Fluxograma/fluxograma-rotas.js');
test('sector summaries cover every original step exactly once and keep decisions accessible',()=>{
 assert.equal(f.ordemSetores[0],'comercial');const ids=[];
 for(const setor of f.ordemSetores){
  const grupos=f.resumirSetor(setor);assert.ok(grupos.length>0&&grupos.length<=8);
  for(const grupo of grupos){
   assert.equal(grupo.setor,setor);assert.ok(grupo.guia.quem);assert.ok(grupo.membros.length>0);
   const membros=grupo.membros.map(id=>f.nos.find(n=>n.id===id));assert.ok(membros.every(n=>n&&n.setor===setor));
   assert.equal(grupo.decisoes,membros.filter(n=>n.tipo==='decisao').length);ids.push(...grupo.membros);
  }
 }
 assert.equal(ids.length,f.nos.length);assert.equal(new Set(ids).size,f.nos.length);assert.deepEqual([...ids].sort(),f.nos.map(n=>n.id).sort());
});
test('responsive summary arrows never cross another card and use different entry and exit points',()=>{
 for(const largura of [390,800,1440])for(const setor of f.ordemSetores){
  const plano=f.planejarSetor(setor,largura);assert.equal(plano.rotas.length,Math.max(0,plano.nos.length-1));
  if(largura===390)assert.ok(plano.largura<=largura);
  for(const r of plano.rotas)for(let i=1;i<r.pontos.length;i++)for(const n of plano.nos)assert.equal(atravessa(r.pontos[i-1],r.pontos[i],n._fx),false,`${setor}: ${r.origem} atravessa ${n.id}`);
  for(const n of plano.nos){const pontos=plano.rotas.flatMap(r=>[...(r.origem===n.id?[r.pontos[0]]:[]),...(r.destino===n.id?[r.pontos.at(-1)]:[])]);if(pontos.length===2)assert.notDeepEqual(pontos[0],pontos[1]);}
 }
});
