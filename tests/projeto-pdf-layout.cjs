const {chromium}=require('playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const {documentoApresentacao}=await import('../Modulos/Comercial/Catalogo/projeto-apresentacao.mjs');
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const model=JSON.parse(fs.readFileSync('outputs/projeto-apresentacao-dados.json','utf8'));
 const css=fs.readFileSync('Modulos/Comercial/Catalogo/projeto-apresentacao.css','utf8');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const longo of [false,true]){
   const m=structuredClone(model);
   if(longo){const amb=m.ambientes[0],originais=amb.itens;amb.itens=Array.from({length:90},(_,i)=>({...originais[i%originais.length],nome:originais[i%originais.length].nome+' · linha '+(i+1)}));}
   const page=await browser.newPage();
   await page.setContent(documentoApresentacao(m).replace(/<link[^>]+>/,'<style>'+css+'</style>'),{waitUntil:'networkidle'});
   await page.evaluate(async()=>{document.querySelectorAll('img').forEach(i=>i.loading='eager');await Promise.all([...document.images].map(i=>i.decode()));});
   const buffer=await page.pdf({path:'outputs/projeto-pdf-'+(longo?'lista-longa':'revisado')+'.pdf',printBackground:true,preferCSSPageSize:true});
   const pdf=await getDocument({data:new Uint8Array(buffer)}).promise;let text='';
   for(let i=1;i<=pdf.numPages;i++){
    const p=await pdf.getPage(i);const content=await p.getTextContent();
    for(const t of content.items){if(!t.str.trim())continue;assert.ok(t.transform[4]>=20 && t.transform[4]+t.width<=p.view[2]-20,'Texto cortado: '+t.str);}
    text+=content.items.map(t=>t.str).join(' ')+' ';
   }
   for(const amb of m.ambientes)for(const item of amb.itens)assert.ok(text.includes(item.nome),'Item ausente no PDF: '+item.nome);
   if(longo)assert.ok(text.includes('linha 90'));
   console.log('PASS PDF '+(longo?'90 linhas':'dados reais')+': '+pdf.numPages+' páginas, todos os itens e textos dentro das margens.');
   await pdf.destroy();await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
