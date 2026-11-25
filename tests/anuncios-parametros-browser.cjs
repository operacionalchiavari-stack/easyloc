const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.setContent('<main id="host"></main>');
 await page.evaluate(()=>{
  window.__permitir=false;window.__editar=true;window.__falhar=false;window.__calls=[];window.__avisos=[];
  window.alerta=m=>__avisos.push(m);
  window.supabaseClient={rpc:async(n,a)=>{
   __calls.push({n,a});
   if(n==='operacao_pessoas')return {data:[]};
   if(n==='escala_controle_pode')return {data:__editar};
   if(n==='logistica_anuncios_parametros')return {data:{anunciar_sem_confirmacao:__permitir}};
   if(n==='logistica_anuncios_parametros_salvar'){
    if(__falhar)return {error:{message:'Falha ao salvar a regra'}};
    __permitir=a.p_anunciar_sem_confirmacao;return {data:null};
   }
   return {data:null};
  },from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,then:r=>r({data:[],error:null})};return q;}};
 });
 await page.addStyleTag({path:'styles/escala-parametros.css'});await page.addScriptTag({path:'js/logistica/escala-parametros.js'});
 const montar=()=>page.evaluate(()=>carregarParametrosEscala(document.getElementById('host'),'empresa',{mostrarAutomatica:false}));
 await montar();const form=page.locator('[data-anuncios-datas]');assert.equal(await form.locator('select').inputValue(),'nao');
 await form.locator('select').selectOption('sim');await form.getByRole('button').click();await form.getByText('Regra de anúncios salva.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>__calls.findLast(c=>c.n==='logistica_anuncios_parametros_salvar').a.p_anunciar_sem_confirmacao),true);
 await montar();assert.equal(await form.locator('select').inputValue(),'sim');
 await form.locator('select').selectOption('nao');await form.getByRole('button').click();await form.getByText('Regra de anúncios salva.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>__permitir),false);
 await page.evaluate(()=>__falhar=true);await form.locator('select').selectOption('sim');await form.getByRole('button').click();await page.waitForFunction(()=>__avisos.includes('Falha ao salvar a regra'));assert.equal(await page.evaluate(()=>__permitir),false);
 for(const width of [1440,1024,390]){
  await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'.tmp/parametros-anuncios-'+width+'.png'});
 }
 await page.evaluate(()=>__editar=false);await montar();assert.equal(await form.locator('select').isDisabled(),true);assert.equal(await form.getByRole('button').isDisabled(),true);
 console.log('OK: regra Sim/Não, persistência, falha de gravação, somente leitura e parâmetros responsivos. APIs simuladas.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
