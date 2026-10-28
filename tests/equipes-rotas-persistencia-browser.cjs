const fs=require('fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const db={equipes:[{rota_id:'r1',dados:{roles:[{id:'motorista',employeeId:'rh:p1'}]}}]},avisos=[];
 const page=await browser.newPage();await page.route('**/*',r=>r.abort());
 await page.exposeFunction('consultaRotas',({t,payload})=>{if(payload){if(db.falhar)return {error:{message:'Falha de gravacao'}};assert.equal(payload.empresa_id,'e1');db.equipes=[{rota_id:payload.rota_id,dados:payload.dados}];return {error:null};}return {data:t==='logistica_rotas'?[{id:'r1',dados:{name:'Rota salva',sequence:[]}}]:t==='logistica_equipes_rotas'?db.equipes:t==='rh_funcionarios_lista'?[{id:'p1',nome_completo:'Pessoa da equipe',status:'Ativo'}]:[],error:null};});
 await page.exposeFunction('avisoRotas',message=>avisos.push(message));
 const html=fs.readFileSync('Modulos/Logistica/EquipeRotas/equipe-rotas.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 async function abrir(){await page.setContent(html);await page.evaluate(()=>{window.__CONTEXT={empresa_id:'e1'};window.aguardarContexto=async()=>window.__CONTEXT;window.alerta=window.avisoRotas;window.supabaseClient={from(t){let payload;const q={select(){return q},eq(){return q},order(){return q},upsert(p){payload=p;return q},then(ok,fail){return window.consultaRotas({t,payload}).then(ok,fail)}};return q;}};});await page.addScriptTag({content:fs.readFileSync('Modulos/Logistica/EquipeRotas/equipe-rotas.js','utf8')});await page.waitForFunction(()=>document.querySelector('#teamSelectedRouteName')?.textContent==='Rota salva');}
 await abrir();assert.match(await page.locator('#teamDropZones').textContent(),/Pessoa da equipe/);
 await page.locator('#teamClearBtn').click();await page.locator('#teamSaveBtn').click();await page.waitForFunction(()=>document.querySelector('#teamDropZones')?.textContent&&!document.querySelector('#teamDropZones').textContent.includes('Pessoa da equipe'));
 await new Promise(r=>setTimeout(r,100));assert.equal(db.equipes[0].dados.roles.some(r=>r.employeeId),false);
 await abrir();assert.doesNotMatch(await page.locator('#teamDropZones').textContent(),/Pessoa da equipe/);
 db.falhar=true;await page.locator('#teamSaveBtn').click();await new Promise(r=>setTimeout(r,100));assert.ok(avisos.includes('Falha de gravacao'));
 console.log('PASS: equipe vem do Supabase, alteracao sobrevive a nova abertura e falha de gravacao e exibida.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
