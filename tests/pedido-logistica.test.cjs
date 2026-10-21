const test = require('node:test');
const assert = require('node:assert/strict');
test('frete, cubagem, montagem e limpeza dos totais', async () => {
  const els = new Map();
  global.document = { getElementById(id) {
    if(!els.has(id)) els.set(id, {innerText:'',textContent:'',innerHTML:'',style:{},classList:{remove(){}},addEventListener(){}});
    return els.get(id);
  }};
  const rows = {
    categorias_caminhao:[{nome:'P',volume_maximo:10,valor_km:5},{nome:'G',volume_maximo:30,valor_km:12}],
    categorias_montagem:[{combinacao:'2P',qtd_montadores:3}],
    empresas_configuracoes:{diaria_montador:100}
  };
  const supabase = {from(table){const q={select(){return q},eq(){return q},order(){return q},single(){return q},then(resolve){return Promise.resolve({data:rows[table],error:null}).then(resolve)}};return q}};
  global.window = {supabaseClient:supabase,__CONTEXT:{empresa_id:'e'},volumeTotalPedido:15,kmPedido:20,__ABS_FRETE_PERCENT:10,__ABS_MONTAGEM_PERCENT:0};
  const {initFrete} = await import('../js/pedido/pedido.frete.mjs');
  initFrete({supabase});
  await window.calcularFreteInteligente();
  assert.equal(window.__FRETE_FINAL,180);
  assert.equal(window.__MONTAGEM_FINAL,300);
  assert.equal(window.__FRETE_CARD_RESUMO.capacidadeTotal,20);
  assert.match(els.get('freteDetalheCaminhoes').innerHTML,/75.0%/);
  window.kmPedido=0;
  await window.calcularFreteInteligente();
  assert.equal(window.__FRETE_FINAL,0);
  assert.equal(window.__MONTAGEM_FINAL,300);
  assert.equal(window.__FRETE_CARD_RESUMO.distanciaPendente,true);
  const {renderMontagemSugerida}=await import('../js/pedido/pedido.ui-montagem.mjs');
  renderMontagemSugerida({qtd:3,custoBruto:300,valorAbsorcao:30,percent:10});
  assert.equal(els.get('montagemCusto').style.color,'#15803d');
  assert.equal(els.get('montagemDesconto').style.color,'#b91c1c');
  assert.equal(els.get('montagemValorFinal').style.color,'#15803d');
  assert.doesNotMatch(els.get('freteDetalheCaminhoes').innerHTML,/Qtd ajudantes/);
  window.volumeTotalPedido=0;
  await window.calcularFreteInteligente();
  assert.equal(window.__MONTAGEM_FINAL,0);
  assert.equal(window.__FRETE_FINAL,0);
  assert.equal(els.get('montagemDesconto').style.color,'#526176');
  rows.categorias_caminhao=[{nome:'P',volume_maximo:0,valor_km:1}];
  window.volumeTotalPedido=15;
  await window.calcularFreteInteligente();
  assert.equal(window.__FRETE_CARD_RESUMO,null);
});
