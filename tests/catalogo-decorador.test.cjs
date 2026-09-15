const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const catalog=fs.readFileSync('Modulos/Comercial/Catalogo/catalogo.mjs','utf8');
const photos=fs.readFileSync('Modulos/Estoque/CadastroItens/itens.foto.mjs','utf8');
test('galeria do decorador tem prioridade, com fallback Chiavari e isolamento',()=>{
 const ctx={state:{catalogSession:{cliente_id:'kelly'}},slugify:x=>x,formatDims:()=>'',FOTO_PLACEHOLDER:'placeholder'};
 vm.createContext(ctx);vm.runInContext(catalog.slice(catalog.indexOf('function mapRow('),catalog.indexOf('// Agrupamento de variantes')),ctx);
 const row={itens_fotos:[{tipo:'galeria',url:'padrao',cliente_id:null},{tipo:'galeria',url:'kelly',cliente_id:'kelly'},{tipo:'galeria',url:'outro',cliente_id:'outro'}]};
 assert.equal(ctx.mapRow(row).events[0].img,'kelly');assert.equal(ctx.mapRow(row).events.length,1);
 ctx.state.catalogSession.cliente_id='sem-fotos';assert.equal(ctx.mapRow(row).events[0].img,'padrao');
 ctx.state.catalogSession.cliente_id=null;assert.equal(ctx.mapRow(row).events[0].img,'padrao');
});
test('salva galeria padrão sem cliente e galeria exclusiva com seu cliente',async()=>{
 for(const cliente of ['', 'kelly']){
  const inserted=[],filters=[],state={file:{},path:null};
  const query={eq:(k,v)=>{filters.push([k,v]);return query},is:(k,v)=>{filters.push([k,v]);return query},then:r=>r({error:null})};
  const ctx={window:{},document:{getElementById:()=>({value:cliente})},FOTO_SLOTS:{galeria01:{tipo:'galeria',arquivo:'galeria01',titulo:'Galeria 01',ordem:1}},getSlotState:()=>state,gerarBlobImagemSlot:async()=>({type:'image/jpeg',size:20}),normalizarMimeImagem:x=>x,extensaoImagem:()=> 'jpg',uploadImagem:async()=>true,publicUrl:x=>x,limparObjectUrl:()=>{},setSlotPreview:()=>{},supabase:{from:()=>({delete:()=>query,insert:async row=>{inserted.push(row);return{error:null}}})}};
  vm.createContext(ctx);vm.runInContext(photos.slice(photos.indexOf('window.itens_salvarFotosAdicionais ='),photos.indexOf('async function iniciarSeletorGaleriaCliente')),ctx);
  assert.equal(await ctx.window.itens_salvarFotosAdicionais('item','empresa'),true);
  assert.equal(inserted[0].cliente_id,cliente||null);
  assert.equal(inserted[0].path,`empresa/item/${cliente||'geral'}/galeria01.jpg`);
  assert.ok(filters.some(([k,v])=>k==='cliente_id'&&v===(cliente||null)));
 }
});
