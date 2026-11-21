const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const {pedidoPreviewHtml,estilosImpressaoPedido}=await import('../Modulos/Comercial/Catalogo/projeto-apresentacao.mjs');
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const css=fs.readFileSync('Modulos/Comercial/Catalogo/catalogo-projetos.css','utf8');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const horizontal of [false,true])for(const preferCSSPageSize of [true,false]){
   const marker=(w,h,id)=>({nome:'Planta '+id,w,h,html:`<div style="position:relative;width:100%;height:100%;background:#eef4f0"><span style="position:absolute;left:5mm;top:5mm">PLANTA-${id}-INICIO</span><div data-circulo style="position:absolute;left:50%;top:50%;width:40mm;height:40mm;border:2px solid black;border-radius:50%"></div><span style="position:absolute;right:5mm;bottom:5mm">PLANTA-${id}-FIM</span></div>`});
   const model={nome:'PEDIDO-ANTES-PLANTAS',semAviso:true,ambientes:[{id:'a',nome:'Evento',itens:[],imagens:[]}],plantas:[marker(297,210,'H'),marker(210,297,'V')],financeiro:{total:100,parcelas:[],resumo:[{rotulo:'RESUMO-DEPOIS-PLANTAS',valor:100}]}};
   const page=await browser.newPage();await page.setContent(`<html><head><style>${css}</style><style>${estilosImpressaoPedido(horizontal)}</style></head><body>${pedidoPreviewHtml(model,{layout:horizontal?'horizontal':'final'})}</body></html>`);
   const circulos=await page.locator('[data-circulo]').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {w:r.width,h:r.height};}));
   assert.ok(circulos.every(c=>Math.abs(c.w-c.h)<.1),'a rotação mantém os círculos redondos');
   const buffer=await page.pdf({path:'.tmp/pedido-plantas-'+(horizontal?'horizontal':'vertical')+'-'+preferCSSPageSize+'.pdf',preferCSSPageSize,format:'A4',landscape:horizontal,printBackground:true});
   const pdf=await getDocument({data:new Uint8Array(buffer)}).promise,plantaPaginas=[];
   for(let i=1;i<=pdf.numPages;i++){
    const p=await pdf.getPage(i),content=await p.getTextContent(),texto=content.items.map(t=>t.str).join(' '),largura=p.view[2],altura=p.view[3];
    assert.ok(texto.trim(),'sem página extra em branco');
    const plantas=['H','V'].filter(id=>texto.includes('PLANTA-'+id));
    if(plantas.length){
     assert.equal(plantas.length,1,'uma planta por página');assert.equal(largura>altura,horizontal,'planta gira dentro da folha escolhida');
     const titulo=content.items.find(t=>/^planta [hv]$/i.test(t.str));assert.ok(titulo,'título presente na página da planta');
     assert.equal(Math.abs(titulo.transform[0])<.01,!horizontal,'título na lateral longa na impressão vertical');
     for(const id of plantas){assert.ok(texto.includes('PLANTA-'+id+'-INICIO')&&texto.includes('PLANTA-'+id+'-FIM'),'todos os cantos da planta na mesma página');plantaPaginas.push(id);}
     for(const t of content.items.filter(t=>t.str.includes('PLANTA-')))assert.ok(t.transform[4]>=0&&t.transform[4]<=largura+1&&t.transform[5]>=0&&t.transform[5]<=altura,'conteúdo da planta dentro da folha');
    }else{assert.equal(largura>altura,horizontal,'pedido e resumo mantêm a orientação escolhida');}
   }
   assert.deepEqual(plantaPaginas,['H','V']);assert.equal(pdf.numPages,4,'pedido, duas plantas e resumo sem páginas extras');
   await pdf.destroy();await page.close();console.log('PASS - pedido '+(horizontal?'horizontal':'vertical')+', tamanho CSS '+preferCSSPageSize+': rotação, título, proporções e páginas preservados');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
