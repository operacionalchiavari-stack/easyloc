const {test}=require('node:test'),assert=require('node:assert/strict');
const fluxo=require('../Modulos/Gestao/Fluxograma/fluxograma-detalhado.js');
const {atravessa}=require('../Modulos/Gestao/Fluxograma/fluxograma-rotas.js');
test('nenhuma seta passa por dentro de card ou rótulo em nenhuma fase',()=>{
 for(const fase of [...fluxo.fases.map(f=>f[0]),'unificado']){
  const plano=fase==='unificado'?fluxo.planejarCompleto():fluxo.planejarFase(fase);
  if(fase==='unificado'){
   assert.equal(plano.nos.length,fluxo.nos.length);assert.equal(plano.nos.some(n=>n.portal),false);
   assert.equal(plano.rotas.length,fluxo.validarFluxo().conexoes);
   assert.equal(new Set(plano.nos.map(n=>n.id)).size,fluxo.nos.length);
  }
  for(const rota of plano.rotas){
   for(let i=1;i<rota.pontos.length;i++){
    const a=rota.pontos[i-1],b=rota.pontos[i];assert.ok(a.x===b.x||a.y===b.y);
    for(const n of plano.nos){if(n.id===rota.destino&&n.tipo==='decisao'&&!n.portal&&i===rota.pontos.length-1)continue;assert.equal(atravessa(a,b,n._fx),false,`${fase}: ${rota.origem} → ${rota.destino} atravessa ${n.id}`);}
    for(const r of plano.rotas.filter(r=>r.label))assert.equal(atravessa(a,b,{x:r.label.x-5,y:r.label.y-17,w:42,h:24}),false,`Seta atravessa rótulo ${r.rotulo} de ${r.origem}`);
   }
  }
  for(const n of plano.nos){
   const portas=plano.rotas.flatMap(r=>[...(r.origem===n.id?[r.inicio]:[]),...(r.destino===n.id?[r.fim]:[])]);
   for(let i=0;i<portas.length;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot(portas[i].x-portas[j].x,portas[i].y-portas[j].y)>=16,`Portas compartilhadas: ${n.id}`);
  }
  for(let i=0;i<plano.rotas.length;i++)for(let j=0;j<i;j++){
   const r=plano.rotas[i],s=plano.rotas[j];
   for(let k=1;k<r.pontos.length;k++)for(let l=1;l<s.pontos.length;l++){
    const a=r.pontos[k-1],b=r.pontos[k],c=s.pontos[l-1],d=s.pontos[l];
    const vertical=a.x===b.x&&c.x===d.x&&Math.abs(a.x-c.x)<12,horizontal=a.y===b.y&&c.y===d.y&&Math.abs(a.y-c.y)<12;
    if(!vertical&&!horizontal)continue;
    const eixo=vertical?'y':'x';
    assert.ok(Math.min(Math.max(a[eixo],b[eixo]),Math.max(c[eixo],d[eixo]))<=Math.max(Math.min(a[eixo],b[eixo]),Math.min(c[eixo],d[eixo])),`Linhas sobrepostas: ${r.origem} / ${s.origem}`);
   }
  }
  for(const n of plano.nos.filter(n=>n.tipo==='decisao'&&!n.portal)){
   const [sim,nao]=plano.rotas.filter(r=>r.origem===n.id);
   assert.equal(sim.rotulo,'Sim');assert.equal(nao.rotulo,'Não');
   assert.equal(sim.inicio.x,n._fx.x+n._fx.w);assert.equal(nao.inicio.y,n._fx.y+n._fx.h);
   assert.notDeepEqual(sim.inicio,nao.inicio,'As duas respostas saem por pontos diferentes.');
  }
 }
});
test('todas as decisões têm Sim e Não, destinos válidos e possibilidade de conclusão',()=>{
 const resumo=fluxo.validarFluxo();assert.ok(resumo.etapas>=70);assert.ok(resumo.decisoes>=25);
 const ids=new Set(fluxo.nos.map(n=>n.id));for(const n of fluxo.nos){assert.ok(n.detalhe.length>20);for(const s of n.saidas)assert.ok(ids.has(s.destino));}
});
test('rejeita resposta sem destino, etapa isolada e loop sem saída',()=>{
 let nos=structuredClone(fluxo.nos);nos.find(n=>n.tipo==='decisao').saidas.pop();assert.throws(()=>fluxo.validarFluxo(nos),/Sim\/Não/);
 nos=structuredClone(fluxo.nos);nos[0].saidas[0].destino='nao_existe';assert.throws(()=>fluxo.validarFluxo(nos),/Destino inexistente/);
 nos=structuredClone(fluxo.nos);nos.push({id:'isolado',tipo:'fim',detalhe:'Sem ligação com o início',saidas:[]});assert.throws(()=>fluxo.validarFluxo(nos),/isoladas/);
 nos=structuredClone(fluxo.nos);nos.find(n=>n.id==='final_ok').saidas[0].destino='final_ok';assert.throws(()=>fluxo.validarFluxo(nos),/isoladas|conclusão/);
});

test('cruzamentos usam curvas sem apagar outras linhas',()=>{
 const fs=require('node:fs');
 assert.ok(!fs.readFileSync(require.resolve('../Modulos/Gestao/Fluxograma/fluxograma-detalhado.js'),'utf8').includes('class="fxg-edge-halo"'));
 const plano=fluxo.planejarCompleto();
 assert.ok(plano.rotas.some(r=>r.pontes.length));
 for(const r of plano.rotas)assert.equal((r.d.match(/ Q/g)||[]).length,r.pontes.length*2);
});
