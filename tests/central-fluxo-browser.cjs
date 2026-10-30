const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const source=fs.readFileSync('tests/central-situacoes-browser.cjs','utf8');let mock=source.match(/const mockSupabase = `([\s\S]*?)`;/)[1];
 mock=mock.replace('rpc: (nome) =>','rpc: (nome) =>').replace('Promise.resolve(nome === "funcionario_contexto"','Promise.resolve(nome === "comercial_fluxo_pedidos" ? {data:[{id:"r1",etapa:"entrega",finalizado:false},{id:"o1",etapa:"comercial",finalizado:false},{id:"o2",etapa:"posicao_final",finalizado:true},{id:"p1",etapa:"pre_reserva",finalizado:false},{id:"p2",etapa:"pre_reserva",finalizado:false},{id:"p3",etapa:"pre_reserva",finalizado:false},{id:"c1",etapa:"cancelado",finalizado:false}],error:null} : nome === "funcionario_contexto"');
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>{if(!/lucide is not defined/.test(e.message))errors.push(e.message);});
  await page.addInitScript(()=>{sessionStorage.setItem('login_ok','1');sessionStorage.setItem('empresa_id','e1');sessionStorage.setItem('usuario_nome','Teste');});
  await page.route('**/*',route=>{const url=route.request().url();if(url.includes('supabase-js'))return route.fulfill({contentType:'text/javascript',body:mock});if(url.startsWith('http://acervo.teste/')){const file=path.join(process.cwd(),decodeURIComponent(new URL(url).pathname));if(!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}return route.abort();});
  await page.goto('http://acervo.teste/Modulos/Comercial/Pedidos/CentralPedidos.html');await page.locator('[data-pedido-id=r1] .central-fluxo').waitFor();
  assert.equal(await page.locator('thead th').count(),9);assert.equal(await page.locator('.central-contact-cell,[data-action=visualizar],[data-action=contrato]').count(),0);
  const r=page.locator('[data-pedido-id=r1]');assert.equal(await r.locator('td').count(),9);assert.equal(await r.locator('.central-actions button').count(),2);
  assert.match(await r.locator('[aria-current=step]').innerText(),/Entrega/);assert.equal(await r.locator('.is-concluida').count(),3);
  assert.match(await page.locator('[data-pedido-id=o1] [aria-current=step]').innerText(),/Comercial/);assert.match(await page.locator('[data-pedido-id=o2] [aria-current=step]').innerText(),/Finalizado/);
  assert.equal(await page.locator('[data-pedido-id=c1] [aria-current=step]').count(),0);assert.equal(await r.locator('.central-fluxo li').count(),10);
  await page.screenshot({path:'.tmp/central-fluxo-desktop.png',fullPage:true});assert.deepEqual(errors,[]);console.log('OK: 9 colunas, 2 ações, fluxo com etapa atual e conclusão real.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
