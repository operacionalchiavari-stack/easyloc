import test from 'node:test';
import assert from 'node:assert/strict';
import { initAutocompleteLocaisEKm } from '../js/pedido/pedido.locais-km.mjs';

test('novo pedido mostra endereço da empresa sem selecionar destino ou gravar dados', async () => {
  let mapa, marcador, consultado;
  const elemento={innerHTML:'',replaceChildren(){}};
  globalThis.document={createElement:()=>({style:{}}),getElementById:id=>id==='pedidoMiniMapa'?elemento:null,addEventListener(){}};
  const maps={
    Map:class {constructor(el,options){mapa=options;} addListener(){}},
    Marker:class {constructor(options){marcador=options;} addListener(){}},
    Geocoder:class {geocode(query,callback){consultado=query.address;callback([{geometry:{location:{lat:()=>-23,lng:()=>-46}}}], 'OK');}}
  };
  globalThis.google={maps};
  globalThis.window={google:globalThis.google,__CONTEXT:{empresa_id:'empresa-teste'}};
  const supabase={from(table){assert.equal(table,'empresas');return {select(fields){assert.ok(fields.includes('endereco_google') && fields.includes('logradouro'));return this;},eq(field,id){assert.equal(id,'empresa-teste');return this;},async single(){return {data:{endereco_google:'Rua da Empresa, 100'}};}};}};
  const destino={value:''};
  initAutocompleteLocaisEKm({supabase,localInput:{value:'',addEventListener(){}},localLista:{},localIdHidden:destino});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(consultado,'Rua da Empresa, 100, Brasil');
  assert.deepEqual(mapa.center,{lat:-23,lng:-46});
  assert.equal(marcador.draggable,false);
  assert.equal(destino.value,'');
});

test('endereço cadastral mostra Google Maps mesmo sem API JavaScript', async () => {
  let frame;
  globalThis.document={createElement:()=>({style:{}}),getElementById:id=>id==='pedidoMiniMapa'?{replaceChildren(el){frame=el;}}:null,addEventListener(){}};
  globalThis.window={__CONTEXT:{empresa_id:'e1'},carregarGooglePlaces:async()=>{throw Error('Sem chave');}};
  const supabase={from(){return {select(){return this;},eq(){return this;},async single(){return {data:{logradouro:'Rua Empresa',numero:'42',cidade:'Petrópolis',uf:'RJ'}};}};}};
  const {initAutocompleteLocaisEKm:iniciar}=await import('../js/pedido/pedido.locais-km.mjs?sem-api');
  iniciar({supabase,localInput:{value:'',addEventListener(){}},localLista:{},localIdHidden:{value:''}});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(new URL(frame.src).searchParams.get('q'),'Rua Empresa, 42, Petrópolis, RJ, Brasil');
  assert.equal(new URL(frame.src).searchParams.get('output'),'embed');
});

test('empresa sem endereço também exibe Maps usando a origem de frete existente', async () => {
  let frame;
  globalThis.document={createElement:()=>({style:{}}),getElementById:id=>id==='pedidoMiniMapa'?{replaceChildren(el){frame=el;}}:null,addEventListener(){}};
  globalThis.window={__CONTEXT:{empresa_id:'e1'}};
  const supabase={from(){return {select(){return this;},eq(){return this;},async single(){return {data:{endereco_google:null,logradouro:null,cidade:null}};}};}};
  const {initAutocompleteLocaisEKm:iniciar}=await import('../js/pedido/pedido.locais-km.mjs?sem-endereco');
  iniciar({supabase,localInput:{value:'',addEventListener(){}},localLista:{},localIdHidden:{value:''}});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(new URL(frame.src).hostname,'www.google.com');
  assert.match(new URL(frame.src).searchParams.get('q'),/Chiavari Eventos, Estrada Uniao e Industria/);
});
