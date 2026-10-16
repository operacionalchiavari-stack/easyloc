// Out/2026 — na "Lista Completa" do pedido comercial (catálogo dentro da tela do pedido), ao lado de "Salvar pedido"
// há "Ver pedido e PDF": abre a mesma prévia que o decorador envia (decorador solicitante, período, ambientes) com
// "Baixar PDF". Com prints do 3D salvos no projeto, a janela tem "Renderizar projeto com IA": cada print com cena vira
// uma renderização de IA no mesmo lugar (imagens já de IA e prints antigos sem cena ficam como estão).
// Uma página "pai" imita a tela do pedido (as funções que o catálogo chama em window.parent).
const { chromium } = require('playwright'); const express = require('express'); const assert = require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
function fakeGlbTriangle(){
  const json=JSON.stringify({asset:{version:"2.0"},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],
    buffers:[{byteLength:42}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962},{buffer:0,byteOffset:36,byteLength:6,target:34963}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3",max:[1,1,0],min:[0,0,0]},{bufferView:1,componentType:5123,count:3,type:"SCALAR",max:[2],min:[0]}]});
  const jb=Buffer.from(json,'utf8');const jp=Buffer.concat([jb,Buffer.alloc((4-(jb.length%4))%4,0x20)]);
  const pos=Buffer.alloc(36);[0,0,0,1,0,0,0,1,0].forEach((v,i)=>pos.writeFloatLE(v,i*4));
  const idx=Buffer.alloc(6);[0,1,2].forEach((v,i)=>idx.writeUInt16LE(v,i*2));
  const bin=Buffer.concat([pos,idx]);const bp=Buffer.concat([bin,Buffer.alloc((4-(bin.length%4))%4,0)]);
  const jh=Buffer.alloc(8);jh.writeUInt32LE(jp.length,0);jh.writeUInt32LE(0x4E4F534A,4);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(bp.length,0);bh.writeUInt32LE(0x004E4942,4);
  const h=Buffer.alloc(12);h.writeUInt32LE(0x46546C67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+jp.length+8+bp.length,8);
  return Buffer.concat([h,jh,jp,bh,bp]);
}
const CENA = { version: 1, roomWidth: 10, roomDepth: 10, wallHeight: 4, floorFinish: 'neutral', gridVisible: true, walls: {}, customWalls: [],
  objects: [{ itemId: '1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }], camera: { position: [0, 1.2, 7], target: [0, .5, 0], topView: false } };
const P = (p) => 'https://fixture/storage/v1/object/public/projetos/' + p;
const RENDERS = [
  { id: 'r1', url: P('e/ped-1/renders/print1.jpg'), path: 'e/ped-1/renders/print1.jpg', origem: 'Print 3D Livre', cena: { url: 'https://fixture/cenas/c1.json', path: 'e/ped-1/cenas/c1.json', tipo: 'print' } },
  { id: 'r2', url: P('e/ped-1/renders/print2.jpg'), path: 'e/ped-1/renders/print2.jpg', origem: 'Print 3D Livre', cena: { url: 'https://fixture/cenas/c2.json', path: 'e/ped-1/cenas/c2.json', tipo: 'print' } },
  { id: 'r3', url: P('e/ped-1/renders/ia.jpg'), path: 'e/ped-1/renders/ia.jpg', origem: '3D Livre', cena: { url: 'https://fixture/cenas/c3.json', path: 'e/ped-1/cenas/c3.json', tipo: 'ia' } },
  { id: 'r4', url: P('e/ped-1/renders/velho.jpg'), path: 'e/ped-1/renders/velho.jpg', origem: 'Print 3D Livre' },
];
(async () => {
  const app = express();
  app.get('/host-pedido.html', (req, res) => {
    const renders = req.query.renders ? RENDERS : [];
    res.type('html').send(`<!doctype html><html><body style="margin:0">
<script>
  window.__pedidoClienteAtual = { nome: 'Lis Baêtas', foto: 'https://fixture/lis.png' };
  const projeto = { id: 'ped-1', noivos: 'Lis Baêtas', data_evento: '2026-11-11', data_evento_fim: '2026-11-13', local_evento: 'Vale dos Desejos', status: 'rascunho',
    dados: { ambientes: [{ id: 'a1', nome: 'Lounge', itens: [{ item_id: '1', quantidade: 2 }], renders: ${JSON.stringify(renders)}, notas: '' }], plantas: [] } };
  window.__sincronizados = [];
  window.pedidoProjetoCatalogo = () => structuredClone(projeto);
  window.pedidoMetadadosCatalogo = () => ({ noivos: projeto.noivos, data_evento: projeto.data_evento, data_evento_fim: projeto.data_evento_fim, local_evento: projeto.local_evento });
  window.pedidoSincronizarProjetoCatalogo = async (p) => { window.__sincronizados.push(structuredClone(p)); };
  window.__pedidoIrPara = () => {}; window.__pedidoSincronizarEtapa = () => {}; window.__salvarPedidoOperacional = async () => {};
</script>
<iframe id="cat" src="/Modulos/Comercial/Catalogo/catalogo.html?comercial=pedido" style="width:100vw;height:100vh;border:0"></iframe></body></html>`);
  });
  app.use(express.static(process.cwd()));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.on('listening', r));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  async function abrir(query){
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await context.route('https://**/*', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
    await context.route('https://fixture/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
    await context.route('https://fixture/modelos/**', (r) => r.fulfill({ contentType: 'model/gltf-binary', body: fakeGlbTriangle() }));
    await context.route('https://fixture/cenas/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(CENA) }));
    await context.addInitScript(() => { sessionStorage.setItem('login_ok', '1'); try { localStorage.clear(); } catch {} });
    await context.addInitScript(installMock, { staff: true, modelos: true });
    // IA simulada (mesma resposta do teste do editor de cena) e registro do que vai pro Storage.
    await context.addInitScript(() => {
      window.__ia = [];
      window.supabaseClient.functions = { invoke: async (name, opt) => { window.__ia.push({ name, body: opt.body }); await new Promise((r) => setTimeout(r, 300));
        return { data: { providerStatus: 'ok', images: [{ base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }] }, error: null }; } };
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/host-pedido.html' + query);
    const frame = () => page.frames().find((f) => f.url().includes('catalogo.html'));
    await page.waitForFunction(() => typeof document.getElementById('cat').contentWindow.abrirProjetoComercialPedido === 'function', null, { timeout: 20000 });
    await frame().evaluate(() => window.abrirProjetoComercialPedido());
    const cat = page.frameLocator('#cat');
    await cat.locator('.pa-geral-footer').waitFor({ timeout: 15000 });
    return { context, page, cat, frame, errors };
  }

  // 1) Sem imagens: Ver pedido e PDF, sem botão de renderizar.
  {
    const { context, cat, frame, errors } = await abrir('');
    const botoes = await cat.locator('.pa-geral-footer button').allTextContents();
    assert.deepEqual(botoes.map((t) => t.trim()), ['Ver pedido e PDF', 'Salvar pedido'], 'botões da Lista Completa');
    console.log('ok 1 - Lista Completa: "Ver pedido e PDF" ao lado de "Salvar pedido"');
    await cat.locator('[data-cpj="ver-pedido-comercial"]').click();
    const d = cat.locator('dialog.cpj-order-preview[open]'); await d.waitFor({ timeout: 10000 });
    const r = await d.evaluate((el) => ({ sol: el.querySelector('.cpj-order-requester strong')?.textContent,
      foto: el.querySelector('.cpj-order-requester img')?.getAttribute('src'), info: el.querySelector('.cpj-order-event-info')?.innerText,
      amb: [...el.querySelectorAll('.cpj-order-environment th')].map((t) => t.textContent), botoes: [...el.querySelectorAll('footer button')].map((b) => b.textContent) }));
    assert.equal(r.sol, 'Lis Baêtas'); assert.equal(r.foto, 'https://fixture/lis.png');
    assert.ok(r.info.includes('11/11/2026 a 13/11/2026') && r.info.includes('Vale dos Desejos'), r.info);
    assert.deepEqual(r.amb, ['Lounge']); assert.deepEqual(r.botoes, ['Baixar PDF', 'Fechar'], 'sem imagens: sem botão de renderizar');
    console.log('ok 2 - abre a prévia do pedido (solicitante com foto, período, ambiente) com Baixar PDF e Fechar');
    await d.locator('[data-pedido-pdf]').click();
    await frame().waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => f.title === 'Impressão do documento' && f.contentDocument?.querySelector('.cpj-order-paper')), null, { timeout: 10000 });
    console.log('ok 3 - Baixar PDF monta o documento de impressão');
    await d.locator('[data-pedido-fechar]').click();
    await frame().waitForFunction(() => !document.querySelector('dialog.cpj-order-preview'));
    console.log('ok 4 - Fechar volta pra lista');
    assert.deepEqual(errors, [], errors.join('\n'));
    await context.close();
  }

  // 2) Com prints do 3D: "Renderizar projeto com IA" renderiza os 2 prints com cena, nada mais.
  {
    const { context, page, cat, frame, errors } = await abrir('?renders=1');
    await cat.locator('[data-cpj="ver-pedido-comercial"]').click();
    const d = cat.locator('dialog.cpj-order-preview[open]'); await d.waitFor({ timeout: 10000 });
    const botao = d.locator('[data-pedido-renderizar]');
    assert.equal((await botao.textContent()).trim(), 'Renderizar projeto com IA (2 imagens)', 'conta só os prints com cena');
    assert.equal(await d.locator('.cpj-order-renders img').count(), 4);
    await botao.click();
    await frame().waitForFunction(() => window.__ia.length === 2 && !document.querySelector('[data-pedido-renderizar]'), null, { timeout: 30000 });
    const r = await frame().evaluate(() => ({
      politicas: window.__ia.map((c) => c.name + ':' + c.body?.scene?.referencePolicy),
      imgs: [...document.querySelectorAll('dialog.cpj-order-preview .cpj-order-renders img')].map((i) => i.getAttribute('src')),
      canvasNoPalco: [...document.querySelectorAll('[aria-hidden="true"]')].some((e) => e.querySelector('canvas') && e.style.left === '-12000px'),
    }));
    assert.deepEqual(r.politicas, ['studio-ai-engine:furniture_studio_catalog', 'studio-ai-engine:furniture_studio_catalog'], 'mesma renderização do 3D Livre');
    assert.equal(r.canvasNoPalco, false, 'palco escondido removido, 3D devolvido');
    assert.equal(r.imgs.length, 4, 'continua com 4 imagens');
    assert.ok(!r.imgs[0].includes('print1') && !r.imgs[1].includes('print2'), 'os 2 prints foram trocados: ' + r.imgs.slice(0, 2));
    assert.ok(r.imgs[2].includes('ia.jpg') && r.imgs[3].includes('velho.jpg'), 'IA e print sem cena ficaram: ' + r.imgs.slice(2));
    // O projeto do pedido recebeu as imagens novas com a cena marcada como IA.
    const ultimo = await page.evaluate(() => window.__sincronizados.at(-1));
    const rs = ultimo.dados.ambientes[0].renders;
    assert.deepEqual(rs.map((x) => x.cena?.tipo || null), ['ia', 'ia', 'ia', null]);
    assert.deepEqual(rs.slice(0, 2).map((x) => x.cena.url), ['https://fixture/cenas/c1.json', 'https://fixture/cenas/c2.json'], 'a cena continua guardada (editor de cena)');
    console.log('ok 5 - Renderizar projeto: 2 prints viram renderização de IA (estúdio), IA e print sem cena intactos, gravado no pedido');
    const removidos = await frame().evaluate(() => JSON.parse(sessionStorage.getItem('mockdb') || '{}').removed || []);
    assert.ok(removidos.flat().some((p) => String(p).includes('print1.jpg')) && removidos.flat().some((p) => String(p).includes('print2.jpg')), 'prints antigos apagados do Storage: ' + JSON.stringify(removidos));
    console.log('ok 6 - os arquivos dos prints antigos saem do Storage');
    assert.deepEqual(errors, [], errors.join('\n'));
    await context.close();
  }
  await browser.close(); server.close(); console.log('PASS');
})().catch((e) => { console.error(e); process.exit(1); });
