// Revisão visual isolada: CSS e tema reais, sem executar ações ou consultas dos módulos.
const fs=require('node:fs');
const cp=require('node:child_process');
const express=require('express');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
  const auditoria=JSON.parse(cp.execFileSync(process.execPath,['Scripts/auditar-globais.cjs','--json'],{encoding:'utf8'}));
  const docs=auditoria.paginasAuditadas.filter(p=>p.tema==='integrado');
  const app=express();
  app.get('/theme-fixture.html',(req,res)=>res.type('html').send(`<!doctype html><html><head><script src="/js/core/companyTheme.js"></script></head><body style="margin:0"><iframe id="module" style="width:100%;height:100vh;border:0"></iframe><script>sessionStorage.setItem('empresa_id','e1');EasyLocTheme.applyTheme({cor_sidebar:'#3a1220',cor_destaque:'#246b48'});</script></body></html>`));
  app.use((req,res,next)=>{
    if(!req.path.startsWith('/Modulos/') || !req.path.endsWith('.html'))return next();
    const file='.'+decodeURIComponent(req.path);
    if(!fs.existsSync(file))return next();
    const html=fs.readFileSync(file,'utf8').replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi,(all,attrs)=>/src=["'][^"']*\/(?:themePrepaint|companyTheme|moduleTheme)\.js/i.test(attrs)?all:'');
    res.type('html').send(html);
  });
  app.use(express.static(process.cwd()));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const resultados=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.route('https://**/*',r=>r.fulfill({contentType:'text/css',body:''}));
    await page.goto('http://127.0.0.1:'+server.address().port+'/theme-fixture.html');
    for(const doc of docs){
      const navigated=page.waitForEvent('framenavigated',{predicate:f=>f.url().includes(doc.pagina)});
      await page.evaluate(path=>{document.getElementById('module').src='/'+path;},doc.pagina);
      const frame=await navigated;
      await frame.waitForLoadState('load');
      await frame.waitForFunction(()=>window.__moduleThemeReady && window.__COMPANY_THEME?.cor_destaque==='#246b48');
      await frame.waitForFunction(()=>Boolean(document.querySelector('link[data-table-text]')?.sheet));
      const tabela=await frame.evaluate(()=>{
        const table=document.createElement('table');
        table.innerHTML='<thead><tr><th style="color:teal">Item</th></tr></thead><tbody><tr><td><span class="dispon-item-name" style="color:teal">Nome</span><small style="color:gray">Código</small><span class="dispon-badge" style="color:green">Disponível</span><button style="color:white;background:black">Ação</button><strong data-money-sign="negative" style="color:red">-10</strong></td></tr></tbody>';
        document.body.appendChild(table);
        const color=selector=>getComputedStyle(table.querySelector(selector)).color;
        const result={cabecalho:color('th'),nome:color('.dispon-item-name'),codigo:color('small'),status:color('.dispon-badge'),botao:color('button'),negativo:color('strong')};
        if(result.cabecalho!=='rgb(17, 17, 17)'){
          window.__tableColorRules=[];
          function scan(rules){for(const r of rules){if(r.selectorText && table.querySelector('th').matches(r.selectorText) && r.style?.color)window.__tableColorRules.push({s:r.selectorText,c:r.style.color});if(r.cssRules)scan(r.cssRules);}}
          for(const sheet of document.styleSheets){try{scan(sheet.cssRules);}catch{}}
        }
        table.remove();return result;
      });
      if(tabela.cabecalho!=='rgb(17, 17, 17)')console.log(await frame.evaluate(()=>window.__tableColorRules));
      assert.deepEqual(tabela,{cabecalho:'rgb(17, 17, 17)',nome:'rgb(17, 17, 17)',codigo:'rgb(17, 17, 17)',status:'rgb(0, 128, 0)',botao:'rgb(255, 255, 255)',negativo:'rgb(255, 0, 0)'},'texto de tabelas: '+doc.pagina);
      const check=await frame.evaluate(()=>{
        const primary=getComputedStyle(document.documentElement).getPropertyValue('--el-button-primary-bg').trim();
        const azuis=[];
        for(const el of document.querySelectorAll('body *')){
          const rect=el.getBoundingClientRect();if(!rect.width || !rect.height || el.closest('svg'))continue;
          const css=getComputedStyle(el);
          for(const prop of ['backgroundColor','color','borderTopColor']){
            const value=css[prop],nums=value.match(/[.\d]+/g)?.map(Number);if(!nums || nums.length<3 || nums[3]===0)continue;
            const [r,g,b]=nums,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
            if(b!==max || d<24 || max<90)continue;
            const hue=60*((r-g)/d+4),sat=d/max,light=(max+min)/510;
            if(hue>=190 && hue<=260 && (sat>0.4 || light>0.85))azuis.push({el:el.tagName.toLowerCase()+(el.id?'#'+el.id:'.'+String(el.className).slice(0,60)),prop,value});
          }
        }
        const fontesPesadas=[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().width && [...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim()) && Number(getComputedStyle(el).fontWeight)>700).map(el=>el.tagName+'#'+el.id+'.'+el.className);
        return {primary,azuis:azuis.slice(0,12),fontesPesadas};
      });
      assert.equal(check.primary,'#246b48',doc.pagina);
      if(!doc.pagina.includes('/Catalogo/'))assert.deepEqual(check.fontesPesadas,[],'pesos acima do padrão: '+doc.pagina);
      await frame.evaluate(()=>{
        window.__textoAntes=[...document.querySelectorAll('body *')].filter(el=>{
          if(!el.getBoundingClientRect().width || el.closest('button,[role="button"],[role="tab"],.btn,.tab-btn,.btn-setor,.btn-montagem,.sidebar,.sidebar-user,svg'))return false;
          return [...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim()) || el.matches('input,textarea,select');
        }).map(el=>({el,color:getComputedStyle(el).color}));
      });
      await page.evaluate(()=>EasyLocTheme.applyTheme({cor_sidebar:'#3a1220',cor_destaque:'#8b3d56'}));
      await frame.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--el-button-primary-bg').trim()==='#8b3d56');
      await frame.waitForTimeout(180);
      const textosAlterados=await frame.evaluate(()=>window.__textoAntes.filter(({el,color})=>el.isConnected && getComputedStyle(el).color!==color).map(({el,color})=>({el:el.tagName+'#'+el.id+'.'+el.className,antes:color,depois:getComputedStyle(el).color})).slice(0,20));
      if(textosAlterados.length)console.log(JSON.stringify({pagina:doc.pagina,textosAlterados}));
      assert.equal(textosAlterados.length,0,'texto comum deve permanecer neutro: '+doc.pagina);
      await page.evaluate(()=>EasyLocTheme.applyTheme({cor_sidebar:'#3a1220',cor_destaque:'#246b48'}));
      resultados.push({pagina:doc.pagina,...check});
      if(doc.pagina.includes('/Costura/costura.html')){
        await frame.waitForFunction(()=>getComputedStyle(document.querySelector('.btn-setor.ativo')).backgroundColor==='rgb(36, 107, 72)');
        const aba=await frame.locator('.btn-setor.ativo').evaluate(el=>({height:el.getBoundingClientRect().height,font:getComputedStyle(el).fontSize}));
        assert.equal(aba.height,38);
        assert.equal(aba.font,'12px');
        assert.equal(await frame.locator('.btn-setor.ativo').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(36, 107, 72)');
        assert.equal(await frame.locator('#listaPedidos').evaluate(el=>getComputedStyle(el,'::before').backgroundColor),'rgb(255, 255, 255)');
        fs.mkdirSync('outputs',{recursive:true});
        await page.evaluate(()=>EasyLocTheme.applyTheme({cor_sidebar:'#3a1220',cor_destaque:'#7d603d'}));
        await frame.waitForFunction(()=>getComputedStyle(document.querySelector('.btn-setor.ativo')).backgroundColor==='rgb(125, 96, 61)');
        await page.screenshot({path:'outputs/globais-painel-complexidade.png'});
        await page.evaluate(()=>EasyLocTheme.applyTheme({cor_sidebar:'#3a1220',cor_destaque:'#246b48'}));
      }
    }
    fs.writeFileSync('outputs/globais-auditoria.json',JSON.stringify({documentos:resultados.length,resultados},null,2));
    const falhas=resultados.filter(r=>r.azuis.length && !r.pagina.includes('/Catalogo/'));
    console.log(JSON.stringify({documentos:resultados.length,temaDinamico:true,paginasComAzul:falhas},null,2));
    assert.equal(falhas.length,0,'cores locais ainda visíveis');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
