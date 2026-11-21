const assert=require('node:assert/strict');const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const root=process.cwd(),out=path.join(root,'.tmp/auditoria-implantacao-20261120'),base='http://acervo.teste/';
const mock=fs.readFileSync('tests/central-situacoes-browser.cjs','utf8').match(/const mockSupabase = `([\s\S]*?)`;/)[1]+`
const criarOriginal=window.supabase.createClient;window.supabase.createClient=(...args)=>{const sb=criarOriginal(...args),rpc=sb.rpc;sb.rpc=(nome,args)=>nome==='pedidos_recebimentos'?(window.__financeiroOk?Promise.resolve({data:(args.p_pedidos||[]).map(id=>({pedido_id:id,devido:100,recebido:75,titulos:2}))}):Promise.resolve({data:null,error:{message:'Falha simulada na consulta do Financeiro'}})):rpc(nome,args);return sb;};`;
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.addInitScript(()=>{sessionStorage.setItem('login_ok','1');sessionStorage.setItem('empresa_id','e1');});
 await page.route('**/*',r=>{const u=r.request().url();if(u.includes('supabase-js'))return r.fulfill({contentType:'application/javascript',body:mock});if(u.startsWith(base)){const f=path.join(root,decodeURIComponent(new URL(u).pathname));if(!fs.existsSync(f))return r.fulfill({status:404,body:''});return r.fulfill({contentType:{'.html':'text/html','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript'}[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});}return r.abort();});
 await page.goto(base+'Modulos/Comercial/Pedidos/CentralPedidos.html');await page.locator('[data-pedido-id=r1]').waitFor();
 const texto=await page.locator('[data-pedido-id=r1] .central-value-cell').innerText();
 assert.match(texto,/Recebimentos indisponíveis/);assert.doesNotMatch(texto,/% pago/);assert.equal(await page.locator('[data-pedido-id=r1] .central-finance-track').count(),0);
 await page.evaluate(()=>window.__financeiroOk=true);await page.locator('[data-pedido-id=r1] [data-action=repetir-recebimentos]').click();await page.waitForFunction(()=>document.querySelector('[data-pedido-id=r1] .central-value-cell')?.innerText.includes('75% pago'));assert.equal(await page.locator('[data-pedido-id=r1] [data-action=repetir-recebimentos]').count(),0);console.log('OK - falha financeira n?o vira zero, e nova consulta recupera o percentual confirmado.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
