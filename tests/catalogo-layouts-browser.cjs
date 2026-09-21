const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
const { installMock } = require('./mock-projetos.cjs');
// Layouts de apresentação (catalogo-layouts.mjs + projeto.html + projeto-layout.mjs): cada decorador cria os SEUS layouts, edita com
// pré-visualização ao vivo (autosave), escolhe em qual gerar o LINK e o PDF de cada projeto, e a página pública/pré-visualização obedece
// ao layout. O "servidor" é o mock de tests/mock-projetos.cjs (em sessionStorage).
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const CORES={cor_primaria:'#112233',cor_secundaria:'#aa8844'};
const CFG={
 moderno:{versao:1,capa:{estilo:'limpa',alinhamento:'esquerda',fundo:'branco',textoAbertura:'Projeto do evento',mostrarFotoCasal:true,mostrarLogo:true,mostrarData:true,mostrarLocal:true},cores:{usarDoDecorador:false,principal:'#1f1f1f',destaque:'#3a6ea5'},fonte:'moderna',resumo:true,ambientes:{numeracao:true,notas:true,renders:'grade',umaPorPagina:true},moveis:{estilo:'limpo',colunas:3,medidas:true,materialCor:true,quantidade:true},rodape:{mostrar:true,mensagem:'Obrigado!',contato:true},pdf:{orientacao:'retrato'}},
 editorial:{versao:1,capa:{estilo:'lateral',alinhamento:'esquerda',fundo:'escuro',textoAbertura:'Projeto do evento',mostrarFotoCasal:true,mostrarLogo:true,mostrarData:true,mostrarLocal:true},cores:{usarDoDecorador:false,principal:'#14202b',destaque:'#c8a15a'},fonte:'elegante',resumo:true,ambientes:{numeracao:true,notas:true,renders:'destaque',umaPorPagina:true},moveis:{estilo:'cartao',colunas:3,medidas:true,materialCor:true,quantidade:true},rodape:{mostrar:true,mensagem:'Obrigado!',contato:true},pdf:{orientacao:'paisagem'}},
};
const SEMENTE={seq:9,lseq:3,calls:[],uploads:[],removed:[],
 layouts:[
  {id:'lay-1',cliente_id:'client',nome:'Moderno',config:CFG.moderno,padrao:true},
  {id:'lay-2',cliente_id:'client',nome:'Editorial',config:CFG.editorial,padrao:false},
 ],
 projetos:[{id:'p1',cliente_id:'client',noivos:'Ana & Bruno',data_evento:'2027-05-10',local_evento:'Sítio Vale Verde',status:'rascunho',compartilhar:false,slug:null,pin:null,pedido_enviado_em:null,atualizado_em:'2026-09-01T10:00:00Z',layout_id:null,
  dados:{foto_casal:{url:'https://fixture/storage/v1/object/public/projetos/company/p1/casal/a.jpg',path:'company/p1/casal/a.jpg'},ambientes:[
   {id:'a1',nome:'Cerimônia',notas:'Clima leve.',itens:[{item_id:'1',quantidade:24},{item_id:'2',quantidade:3}],renders:[{id:'r1',url:'https://fixture/storage/v1/object/public/projetos/company/p1/renders/a.jpg',origem:'Composições'}]},
   {id:'a2',nome:'Bar',notas:'',itens:[{item_id:'3',quantidade:2}],renders:[]}]}}]};

(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const base='http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/';
const browser=await chromium.launch({channel:'msedge',headless:true});
const novoContexto=async(opts,{viewport={width:1500,height:900},seed=null}={})=>{
 const context=await browser.newContext({viewport});
 await context.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await context.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
 await context.addInitScript(()=>{window.print=()=>{window.__imprimiu=(window.__imprimiu||0)+1;};});   // não abre a caixa de impressão de verdade
 if(seed) await context.addInitScript((db)=>{if(!sessionStorage.getItem('mockdb')) sessionStorage.setItem('mockdb',JSON.stringify(db));},seed);
 await context.addInitScript(installMock,opts);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 return {context,page,errors};
};
const calls=(page,name)=>page.evaluate((n)=>window.mockdb.calls.filter(c=>c.name===n),name);
const modal=(page)=>page.locator('dialog.cpj-modal[open]');
const textosPequenos=(page)=>page.evaluate(()=>{const out=[];document.querySelectorAll('#catalogProjetos *, dialog.cpj-modal *').forEach(el=>{const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return;const r=el.getBoundingClientRect();if(!r.width||!r.height)return;if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return;const px=parseFloat(cs.fontSize);if(px<12)out.push(el.className+' '+px+'px "'+el.textContent.trim().slice(0,24)+'"');});return out;});
const irParaProjetos=async(page)=>{await page.goto(base+'catalogo.html');await page.locator('.catalog-gateway').waitFor();await page.locator('[data-gateway-tile="projetos"]').click();await page.locator('#catalogProjetos:not(.hidden)').waitFor();};
const quadroPrevia=async(page)=>{const el=await page.locator('[data-lay-iframe]').elementHandle();const frame=await el.contentFrame();await frame.waitForSelector('.pj-root');return frame;};
const esperaVar=(frame,nome,valor)=>frame.waitForFunction(([n,v])=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()===v,[nome,valor]);
const seg=(page,grupo,texto)=>page.locator('.lay-campo',{hasText:grupo}).locator('label',{hasText:texto}).first();
const chave=(page,texto)=>page.locator('.lay-chave',{hasText:texto});

// ===== Cenário 1: decorador — cria, edita ao vivo, autosave, duplica, padrão, exclui =====
{
 const {page,errors}=await novoContexto({token:true,decoradorCores:CORES});
 await irParaProjetos(page);
 await page.locator('.cpj-empty-big').waitFor();
 assert.equal(await page.locator('[data-cpj="layouts"]').count(),1,'A lista de projetos tem o botão "Layouts"');
 await page.locator('[data-cpj="layouts"]').click();
 await page.locator('.lay-vazio').waitFor();
 assert.match(await page.locator('.cpj-head h2').textContent(),/Layouts de apresentação/);
 assert.equal(await page.locator('.lay-modelo').count(),7,'Sem layouts ainda: 7 estilos prontos para começar');
 await page.screenshot({path:path.join(os.tmpdir(),'lay-1-vazio.png')});

 // Criar a partir do "Moderno"
 await page.locator('.lay-modelo[data-modelo="moderno"]').click();
 await modal(page).waitFor();
 await modal(page).locator('button[type=submit]').click();
 assert.match(await modal(page).locator('.cpj-modal-error').textContent(),/nome ao layout/i,'Sem nome não cria');
 assert.match(await modal(page).locator('[name=base]').inputValue(),/^m:moderno$/,'O modelo clicado já vem escolhido');
 await modal(page).locator('[name=nome]').fill('Casamento moderno');
 await modal(page).locator('button[type=submit]').click();
 await page.locator('[data-lay-editor]').waitFor();
 const criar=(await calls(page,'layout_salvar'))[0].params;
 assert.equal(criar.p_token,'test');assert.equal(criar.p_id??null,null);assert.equal(criar.p_nome,'Casamento moderno');
 assert.equal(criar.p_config.capa.estilo,'limpa','Saiu do modelo Moderno');assert.equal(criar.p_padrao,true,'O primeiro layout vira o padrão sozinho');
 assert.equal(await page.locator('[data-lay-padrao]').isChecked(),true);
 assert.equal(await page.locator('.lay-grupo').count(),8,'8 grupos de opções: capa, cores, fonte, página, ambientes, móveis, rodapé, PDF');
 assert.equal(await page.locator('[data-lay-nome]').inputValue(),'Casamento moderno');
 let frame=await quadroPrevia(page);
 assert.equal(await frame.locator('.pj-root').getAttribute('data-capa'),'limpa','A pré-visualização já mostra o layout');
 assert.equal(await frame.locator('.pj-root').getAttribute('data-alinhamento'),'esquerda');
 assert.equal(await frame.locator('.pj-root').getAttribute('data-moveis'),'limpo');
 assert.match(await page.locator('[data-lay-origem]').textContent(),/exemplo/,'Sem projeto aberto usa um exemplo');
 assert.equal(await frame.locator('.pj-cover h1').textContent(),'Ana & Bruno');
 assert.equal(await frame.locator('.pj-amb').count(),2,'O exemplo tem 2 ambientes com móveis do catálogo');
 assert.equal(await frame.locator('.pj-piece').count()>=3,true);
 assert.equal(await frame.locator('.pj-render').count()>=3,true,'O exemplo também tem renderizações (fotos do catálogo), pra as opções de fotos terem o que mostrar');
 assert.equal(await frame.locator('.pj-couple img').count(),1,'...e a foto dos noivos, pra as opções de formato e tamanho aparecerem');
 await page.screenshot({path:path.join(os.tmpdir(),'lay-2-editor.png')});

 // Mexer nas opções muda a página ao vivo
 await seg(page,'Estilo da capa','Foto ao lado').click();
 await frame.waitForSelector('.pj-root[data-capa="lateral"]');
 assert.equal(await frame.locator('.pj-cover-media').count(),1,'Capa lateral desenha a coluna da foto');
 await seg(page,'Estilo das letras','Elegante').click();
 await esperaVar(frame,'--pj-titulo','"Playfair Display",serif');
 await seg(page,'Móveis por linha','5').click();
 await esperaVar(frame,'--pj-cols','5');
 await chave(page,'Mostrar o rodapé').click();
 await frame.waitForFunction(()=>!document.querySelector('.pj-footer'));
 await chave(page,'Mostrar a quantidade').click();
 await frame.waitForFunction(()=>!document.querySelector('.pj-qty'));
 await chave(page,'Numerar os ambientes').click();
 await frame.waitForFunction(()=>!document.querySelector('.pj-amb-num'));
 await seg(page,'Orientação da página','Paisagem').click();
 await frame.waitForFunction(()=>/landscape/.test(document.getElementById('pjPagina')?.textContent||''));
 await page.locator('[name="capa.textoAbertura"]').fill('');
 await frame.waitForFunction(()=>!document.querySelector('.pj-cover .pj-eyebrow'));
 await page.locator('[name="capa.textoAbertura"]').fill('Nosso projeto');
 await frame.waitForFunction(()=>document.querySelector('.pj-cover .pj-eyebrow')?.textContent==='Nosso projeto');
 // Sem barra de rolagem própria: a coluna de edição e a apresentação descem JUNTO com a página (o iframe tem a altura do conteúdo inteiro)
 {
  const medir=()=>page.evaluate(()=>{
   const form=document.querySelector('.lay-form'),ifr=document.querySelector('[data-lay-iframe]'),doc=ifr.contentDocument;
   return {formOverflow:getComputedStyle(form).overflowY,formRolagem:form.scrollHeight-form.clientHeight,ifr:Math.round(ifr.getBoundingClientRect().height),
    conteudo:Math.ceil(doc.getElementById('app').getBoundingClientRect().height),ifrOverflow:getComputedStyle(doc.documentElement).overflowY,
    previa:getComputedStyle(document.querySelector('.lay-previa')).position,ifrRolagem:doc.scrollingElement.scrollTop};
  });
  const casa=()=>page.waitForFunction(()=>{const ifr=document.querySelector('[data-lay-iframe]'),h=ifr.contentDocument?.getElementById('app')?.getBoundingClientRect().height||0;return h>200&&Math.abs(ifr.getBoundingClientRect().height-Math.ceil(h))<=2;});
  await casa();
  let m=await medir();
  assert.equal(m.formOverflow,'visible','A coluna de edição não tem barra de rolagem própria');
  assert.ok(m.formRolagem<=1,'A coluna de edição mostra tudo: '+m.formRolagem);
  assert.equal(m.ifrOverflow,'hidden','A apresentação não rola por dentro');
  assert.equal(m.previa,'static','A prévia não fica presa no alto: desce com a página');
  assert.ok(m.ifr>page.viewportSize().height,'O quadro da prévia tem a altura da apresentação inteira ('+m.ifr+'px), maior que a janela');
  // rolar a página leva a apresentação junto (o iframe em si nunca rola)
  await page.evaluate(()=>window.scrollTo(0,0));   // (os cliques nos campos lá de baixo já rolaram a página)
  await page.waitForFunction(()=>window.scrollY===0);
  const y0=(await page.locator('.lay-previa').boundingBox()).y;
  await page.evaluate(()=>window.scrollTo(0,700));
  await page.waitForFunction(()=>window.scrollY>300);
  const y1=(await page.locator('.lay-previa').boundingBox()).y;
  assert.ok(y1<y0-300,'A prévia subiu junto com a página: '+y0+' → '+y1);
  assert.equal((await medir()).ifrRolagem,0,'O quadro não rolou por dentro');
  await page.evaluate(()=>window.scrollTo(0,0));
  // o quadro acompanha o conteúdo: cresce quando algo aparece e encolhe quando some
  await chave(page,'Mostrar o rodapé').click();
  await frame.waitForSelector('.pj-footer');
  await page.waitForFunction((antes)=>document.querySelector('[data-lay-iframe]').getBoundingClientRect().height>antes+40,m.ifr);
  await casa();
  const comRodape=(await medir()).ifr;
  assert.ok(comRodape>m.ifr+40,'Ligar o rodapé aumenta o quadro');
  await chave(page,'Mostrar o rodapé').click();
  await frame.waitForFunction(()=>!document.querySelector('.pj-footer'));
  await page.waitForFunction((antes)=>document.querySelector('[data-lay-iframe]').getBoundingClientRect().height<antes-40,comRodape);
  await casa();
  m=await medir();
  assert.ok(Math.abs(m.ifr-m.conteudo)<=2,'Desligar o rodapé encolhe o quadro de volta ao conteúdo');
  // a altura fica estável (a capa não depende da janela: sem laço de crescimento)
  await page.waitForTimeout(700);
  assert.equal((await medir()).ifr,m.ifr,'A altura do quadro não muda sozinha');
  await page.screenshot({path:path.join(os.tmpdir(),'lay-8-editor-inteiro.png'),fullPage:true});
 }
 // Muito mais opções: o formulário tem seções internas e dezenas de controles; cada um mexe na página ao vivo
 {
  assert.ok(await page.locator('.lay-sub').count()>=8,'Cada grupo grande tem seções internas (Estilo, Textos, Fotos e logo…)');
  assert.ok(await page.locator('.lay-form .lay-campo, .lay-form .lay-chave').count()>=80,'O editor tem mais de 80 opções: '+await page.locator('.lay-form .lay-campo, .lay-form .lay-chave').count());
  const v=(n)=>frame.evaluate((n)=>getComputedStyle(document.documentElement).getPropertyValue(n).trim(),n);
  await seg(page,'Altura da capa','Compacta').click();
  await esperaVar(frame,'--pj-capa-vh','46');
  await seg(page,'Largura do conteúdo','Estreita').click();
  await esperaVar(frame,'--pj-max','980px');
  await seg(page,'Cantos das fotos e cartões','Retos').click();
  await esperaVar(frame,'--pj-raio','0px');
  await seg(page,'Tamanho do texto','Grande').click();
  await esperaVar(frame,'--pj-base','17.5px');
  await seg(page,'Estilo das letras','Romana').click();
  await esperaVar(frame,'--pj-titulo','"Cinzel",serif');
  await seg(page,'Formato das fotos','Quadrado').click();
  await esperaVar(frame,'--pj-rratio','1/1');
  await chave(page,'Mostrar quantas peças tem cada ambiente').click();
  await frame.waitForFunction(()=>document.querySelectorAll('.pj-amb-count').length===2);
  await chave(page,'Mostrar a quantidade').click();   // (foi desligada mais acima)
  await seg(page,'Onde aparece a quantidade','Junto do nome').click();
  await frame.waitForFunction(()=>document.querySelector('.pj-piece-body .pj-qty[data-pos="nome"]'));
  await seg(page,'Onde aparece a quantidade','Selo no canto da foto').click();
  await frame.waitForFunction(()=>document.querySelector('.pj-piece > .pj-qty[data-pos="selo"]'));
  await chave(page,'Mostrar a quantidade').click();
  await frame.waitForFunction(()=>!document.querySelector('.pj-qty'));
  await seg(page,'Fundo da capa','Outra cor').click();
  await page.locator('[name="capa.corFundo"]').fill('#123456');
  await frame.waitForFunction(()=>getComputedStyle(document.querySelector('.pj-cover')).backgroundColor==='rgb(18, 52, 86)');
  assert.equal(await frame.locator('.pj-cover').evaluate(el=>el.classList.contains('is-dark')),true,'Fundo azul-marinho: o texto da capa fica claro sozinho');
  // Página escura: o fundo muda e o TEXTO se ajusta (não fica escuro sobre escuro)
  await page.locator('[name="cores.fundoPagina"]').fill('#101216');
  await esperaVar(frame,'--pj-fundo','#101216');
  await frame.waitForFunction(()=>{const c=getComputedStyle(document.body).color.match(/\d+/g).map(Number);return c[0]>150;});
  assert.equal(await frame.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(16, 18, 22)');
  await page.waitForFunction(()=>{const c=window.mockdb.calls.filter(x=>x.name==='layout_salvar').pop();return c&&c.params.p_config.pagina.largura==='estreita'&&c.params.p_config.capa.fundo==='cor'&&c.params.p_config.cores.fundoPagina==='#101216'&&c.params.p_config.ambientes.contagem===true;});
  // volta ao que os passos seguintes esperam
  await page.locator('[name="cores.fundoPagina"]').fill('#ffffff');
  await esperaVar(frame,'--pj-fundo','#ffffff');
  await seg(page,'Fundo da capa','Branco').click();
  await seg(page,'Estilo das letras','Elegante').click();
  await esperaVar(frame,'--pj-titulo','"Playfair Display",serif');
  await page.waitForFunction(()=>document.querySelector('[data-lay-estado]')?.textContent==='Salvo ✓',null,{timeout:8000});
 }
 // Cores: as do catálogo do decorador OU as próprias
 assert.equal(await page.locator('[name="cores.usarDoDecorador"]').count(),1,'Decorador vê "Usar as cores do meu catálogo"');
 assert.equal(await page.locator('[name="cores.destaque"]').isDisabled(),false,'Modelo Moderno usa cores próprias: seletores livres');
 await page.locator('[name="cores.destaque"]').fill('#ff0000');
 await esperaVar(frame,'--pj-accent','#ff0000');
 await chave(page,'Usar as cores do meu catálogo').click();
 assert.equal(await page.locator('[name="cores.destaque"]').isDisabled(),true,'Com as cores do catálogo ligadas, os seletores travam');
 await esperaVar(frame,'--pj-accent','#aa8844');
 await esperaVar(frame,'--pj-ink','#112233');

 // Salva sozinho (e o que foi salvo é o que estava na tela)
 await page.locator('[data-lay-nome]').fill('Moderno de verão');
 await page.waitForFunction(()=>document.querySelector('[data-lay-estado]')?.textContent==='Salvo ✓',null,{timeout:8000});
 await page.waitForFunction(()=>{const c=window.mockdb.calls.filter(x=>x.name==='layout_salvar').pop();return c&&c.params.p_nome==='Moderno de verão'&&c.params.p_config.cores.usarDoDecorador===true;});
 const ult=(await calls(page,'layout_salvar')).pop().params;
 assert.equal(ult.p_id,'lay-1');
 assert.deepEqual([ult.p_config.capa.estilo,ult.p_config.fonte,ult.p_config.moveis.colunas,ult.p_config.rodape.mostrar,ult.p_config.moveis.quantidade,ult.p_config.ambientes.numeracao,ult.p_config.pdf.orientacao,ult.p_config.capa.textoAbertura,ult.p_config.cores.destaque],['lateral','elegante',5,false,false,false,'paisagem','Nosso projeto','#ff0000']);
 assert.equal(ult.p_padrao??null,null,'Editar não mexe no "padrão"');
 assert.equal((await calls(page,'layout_salvar')).length<=12,true,'Autosave agrupa as edições (debounce)');
 assert.deepEqual(await textosPequenos(page),[],'Editor de layouts: nenhum texto abaixo de 12px');

 // Volta pra lista, duplica, troca o padrão, exclui
 await page.locator('[data-lay="voltar-lista"]').click();
 await page.locator('.lay-card').waitFor();
 assert.equal(await page.locator('.lay-card').count(),1);
 assert.match(await page.locator('.lay-card h3').textContent(),/Moderno de verão.*Padrão/);
 assert.match(await page.locator('.lay-card p').textContent(),/Capa com foto ao lado · Elegante · PDF em paisagem/);
 await page.screenshot({path:path.join(os.tmpdir(),'lay-3-lista.png')});
 await page.locator('[data-lay="duplicar"]').click();
 await page.locator('[data-lay-editor]').waitFor();
 assert.equal(await page.locator('[data-lay-nome]').inputValue(),'Moderno de verão (cópia)');
 assert.equal(await page.locator('[data-lay-padrao]').isChecked(),false,'A cópia não é padrão');
 assert.equal(await seg(page,'Estilo da capa','Foto ao lado').locator('input').isChecked(),true,'A cópia nasce com as mesmas opções');
 await page.locator('[data-lay-padrao]').evaluate(el=>el.click());
 await page.waitForFunction(()=>window.mockdb.calls.filter(c=>c.name==='layout_salvar').pop()?.params.p_padrao===true);
 await page.locator('[data-lay="voltar-lista"]').click();
 await page.locator('.lay-card').nth(1).waitFor();
 assert.equal(await page.locator('.lay-card').count(),2);
 assert.match(await page.locator('.lay-card').first().locator('h3').textContent(),/cópia.*Padrão/,'O padrão é a cópia agora e vem primeiro');
 assert.equal(await page.locator('.lay-badge').count(),1,'Só um layout é o padrão');
 assert.equal(await page.evaluate(()=>window.mockdb.layouts.filter(l=>l.padrao).length),1);
 await page.locator('.lay-card').first().locator('[data-lay="padrao"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.lay-badge').length===0);
 await page.locator('.lay-card').nth(1).locator('[data-lay="excluir"]').click();
 await modal(page).waitFor();
 assert.match(await modal(page).textContent(),/passam a usar o seu layout padrão/);
 await modal(page).locator('button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.lay-card').length===1);
 assert.equal((await calls(page,'layout_excluir')).length,1);
 // Layout novo a partir de um dos meus
 await page.locator('[data-lay="novo"]').click();
 await modal(page).waitFor();
 assert.equal(await modal(page).locator('optgroup[label="Meus layouts"] option').count(),1,'"Começar de" lista os meus layouts também');
 await modal(page).locator('[data-cpj-cancel]').click();
 assert.deepEqual(await textosPequenos(page),[],'Lista de layouts: nenhum texto abaixo de 12px');
 assert.deepEqual(errors,[]);
 await page.context().close();
}

// ===== Cenário 2: escolher o layout no "Link e PDF", pré-visualizar e gerar o PDF em nova aba =====
{
 const {context,page,errors}=await novoContexto({token:true,decoradorCores:CORES},{seed:SEMENTE});
 await irParaProjetos(page);
 await page.locator('.cpj-card').click();
 await page.locator('.cpj-work').waitFor();
 // Mapa de posições das renderizações: segue o layout do projeto (sem escolha = o padrão, Moderno, que usa "grade": 4 espaços iguais)
 await page.waitForFunction(()=>document.querySelector('.cpj-renders-map')?.dataset.modo==='grade');
 // (o ambiente aberto, Cerimônia, já tem 1 renderização salva: ela ocupa a posição 1 e sobram 3 espaços)
 assert.equal(await page.locator('.cpj-renders-map').evaluate(el=>el.children.length),4,'Em grade: 4 posições (1 salva + 3 reservadas)');
 assert.equal(await page.locator('.cpj-render-slot').count(),3);
 assert.doesNotMatch(await page.locator('.cpj-renders-map').textContent(),/Destaque/,'Em grade nenhuma posição é "destaque"');
 await page.locator('[data-cpj="compartilhar"]').click();
 await modal(page).waitFor();
 assert.match(await modal(page).locator('h3').textContent(),/Link e PDF do projeto/);
 const sel=modal(page).locator('[data-share-layout-select]');
 await sel.locator('option[value="lay-2"]').waitFor({state:'attached'});
 assert.deepEqual(await sel.locator('option').allTextContents(),['Usar o meu layout padrão','Moderno (padrão)','Editorial'],'Lista os layouts do dono, o padrão marcado');
 assert.equal(await sel.inputValue(),'','Sem escolha: usa o padrão');
 await sel.selectOption('lay-2');
 await page.waitForFunction(()=>window.mockdb.calls.some(c=>c.name==='projeto_definir_layout'));
 const definir=(await calls(page,'projeto_definir_layout'))[0].params;
 assert.deepEqual([definir.p_id,definir.p_layout_id],['p1','lay-2']);
 // trocar o layout no diálogo já muda o mapa por trás: Editorial usa "destaque" (1 grande + 2)
 await page.waitForFunction(()=>document.querySelector('.cpj-renders-map')?.dataset.modo==='destaque');
 assert.equal(await page.locator('.cpj-renders-map').evaluate(el=>el.children.length),3,'Em destaque: 3 posições (1 salva + 2 reservadas)');
 assert.match(await page.locator('.cpj-render figcaption').textContent(),/Destaque · tamanho grande/,'A posição 1 vira o destaque');
 await page.screenshot({path:path.join(os.tmpdir(),'lay-4-dialogo.png')});

 // Pré-visualizar: nova aba, sem compartilhar nada
 const [previa]=await Promise.all([context.waitForEvent('page'),modal(page).locator('[data-share="previa"]').click()]);
 const errosPrevia=[];previa.on('pageerror',e=>errosPrevia.push(e.message));
 await previa.waitForSelector('.pj-root[data-modo="previa"]');
 assert.match(previa.url(),/projeto\.html\?modo=previa$/,'Sem pdf=1 na pré-visualização comum');
 assert.equal(await previa.locator('.pj-toolbar').isVisible(),true,'Barra da pré-visualização no topo');
 assert.equal(await previa.locator('#pjLayoutSelect').inputValue(),'lay-2','Abre no layout escolhido pro projeto (Editorial)');
 assert.deepEqual(await previa.locator('#pjLayoutSelect option').allTextContents(),['Padrão do sistema','Moderno (padrão)','Editorial']);
 assert.equal(await previa.locator('.pj-root').getAttribute('data-capa'),'lateral');
 assert.equal(await previa.locator('.pj-root').getAttribute('data-orientacao'),'paisagem');
 assert.equal(await previa.locator('.pj-cover h1').textContent(),'Ana & Bruno','Os dados são os do projeto de verdade');
 assert.equal(await previa.locator('.pj-amb').count(),2);
 assert.match(await previa.locator('#amb-0 .pj-piece').first().textContent(),/Sofá Um.*× 24/s);
 assert.equal(await previa.evaluate(()=>window.__imprimiu||0),0,'Só pré-visualizar: não abre a impressão');
 // trocar de layout na própria aba (não muda o layout salvo no projeto)
 await previa.locator('#pjLayoutSelect').selectOption('lay-1');
 await previa.waitForSelector('.pj-root[data-capa="limpa"]');
 assert.equal(await previa.locator('.pj-root').getAttribute('data-orientacao'),'retrato');
 await previa.locator('#pjLayoutSelect').selectOption('');
 await previa.waitForSelector('.pj-root[data-capa="foto"]');
 assert.equal((await calls(page,'projeto_definir_layout')).length,1,'Trocar de layout na pré-visualização não altera o projeto');
 await previa.locator('#pjLayoutSelect').selectOption('lay-2');
 await previa.waitForSelector('.pj-root[data-capa="lateral"]');
 await previa.locator('#pjPdf').click();
 await previa.waitForFunction(()=>window.__imprimiu===1);
 await previa.screenshot({path:path.join(os.tmpdir(),'lay-5-previa.png')});
 assert.deepEqual(errosPrevia,[]);
 await previa.close();

 // Gerar PDF direto: a aba abre e já pede a impressão sozinha
 const [pdf]=await Promise.all([context.waitForEvent('page'),modal(page).locator('[data-share="pdf"]').click()]);
 await pdf.waitForSelector('.pj-root[data-modo="previa"]');
 assert.match(pdf.url(),/modo=previa&pdf=1/);
 await pdf.waitForFunction(()=>window.__imprimiu>=1,null,{timeout:8000});
 assert.equal(await pdf.locator('#pjLayoutSelect').inputValue(),'lay-2','O PDF sai no layout do projeto');
 await pdf.close();
 // "Gerenciar layouts" leva pra tela de layouts
 await modal(page).locator('[data-share="layouts"]').click();
 await page.locator('[data-lay-lista]').waitFor();
 assert.equal(await page.locator('.lay-card').count(),2);
 // Abrir o editor COM o projeto ativo: a pré-visualização usa o projeto de verdade
 await page.locator('.lay-card').first().locator('[data-lay="editar"]').first().click();
 await page.locator('[data-lay-editor]').waitFor();
 const frameEd=await quadroPrevia(page);
 await frameEd.waitForSelector('.pj-cover h1');
 assert.match(await page.locator('[data-lay-origem]').textContent(),/projeto “Ana & Bruno”/);
 assert.equal(await frameEd.locator('#amb-0 .pj-piece').count(),2,'Os móveis do projeto real aparecem na pré-visualização do editor');
 assert.equal(await frameEd.locator('.pj-couple img').count(),1,'A foto dos noivos também');
 assert.deepEqual(errors,[]);
 await context.close();
}

// ===== Cenário 3: a página PÚBLICA obedece ao layout (e não confia em config adulterada) =====
{
 const itens=[{id:'1',nome:'Cadeira Arabesco',categoria:'Cadeiras',material:'Madeira',cor:'Natural',largura:.45,altura:.9,profundidade:.5,foto_url:'https://fixture/storage/v1/object/public/itens/cad.png'}];
 const proj=(layout)=>({ok:true,projeto:{noivos:'Ana & Bruno',data_evento:'2027-05-10',local_evento:'Sítio Vale Verde',foto_casal:null,ambientes:[{id:'a1',nome:'Cerimônia',notas:'Clima leve.',itens:[{item_id:'1',quantidade:24}],renders:[{id:'r1',url:'https://fixture/storage/v1/object/public/projetos/company/p/renders/a.jpg',origem:'Composições'},{id:'r2',url:'https://fixture/storage/v1/object/public/projetos/company/p/renders/b.jpg',origem:'Composições'}]}]},
  itens,decorador:{nome:'Kelly Decor',logo_url:null,...CORES,telefone:'(11) 99999-0000',email:'kelly@decor.com'},empresa:{nome:'Chiavari',logo_url:null},layout});
 const abrirPublica=async(layout,viewport={width:1400,height:900})=>{
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await context.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
  await page.addInitScript((payload)=>{window.supabaseClient={rpc:async(name,p)=>name==='projeto_publico'?{data:p.p_pin==='482913'?payload:{ok:false,erro:'pin'},error:null}:{data:null,error:null}};},proj(layout));
  await page.goto(base+'projeto.html?p=x#pin=482913');
  await page.locator('.pj-cover').waitFor();
  return {page,context,errors};
 };
 // a) Editorial: capa lateral, fundo escuro, elegante, 3 colunas, paisagem
 {const {page,context,errors}=await abrirPublica(CFG.editorial);
  const raiz=page.locator('.pj-root');
  assert.deepEqual([await raiz.getAttribute('data-capa'),await raiz.getAttribute('data-fundo'),await raiz.getAttribute('data-alinhamento')],['lateral','escuro','esquerda']);
  assert.equal(await page.locator('.pj-cover-media img').count(),1,'Foto ao lado: usa a 1ª renderização');
  assert.equal(await page.locator('.pj-cover-photo').count(),0,'Capa lateral não usa a foto de fundo');
  assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--pj-cols').trim()),'3');
  assert.match(await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--pj-titulo')),/Playfair Display/);
  assert.equal(await page.locator('.pj-cover h1').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)','Fundo escuro: texto claro');
  assert.equal(await page.locator('.pj-cover').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(20, 32, 43)','Fundo escuro usa a cor principal do PRÓPRIO layout (#14202b): este layout não usa as cores do catálogo');
  assert.equal(await page.locator('#pjFonte').getAttribute('href'),'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700&display=swap','Carrega só as fontes do layout');
  // o PDF sai em paisagem: a orientação vem do layout (regra @page injetada), não da janela
  await page.emulateMedia({media:'print'});
  const pdfPaisagem=await page.pdf({printBackground:true,preferCSSPageSize:true});
  const dim=(buf)=>{const m=buf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);return m?[Number(m[1]),Number(m[2])]:null;};
  const [larg,alt]=dim(pdfPaisagem);
  assert.ok(larg>alt&&Math.abs(larg-841.9)<3&&Math.abs(alt-595.3)<3,'PDF em paisagem (A4 deitado): '+larg+'x'+alt);
  require('node:fs').writeFileSync(path.join(os.tmpdir(),'layout-paisagem.pdf'),pdfPaisagem);
  await page.emulateMedia({media:'screen'});
  await page.screenshot({path:path.join(os.tmpdir(),'lay-6-publico-editorial.png')});
  assert.deepEqual(errors,[]);await context.close();}
 // b) Retrato + tudo desligado: nada sobra na página
 {const off=normalizeOff();
  const {page,context,errors}=await abrirPublica(off);
  assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--pj-ink').trim()),'#112233','Layout com "usar as cores do catálogo" pega a cor do decorador (#112233)');
  assert.equal(await page.locator('.pj-qty').count(),0,'Sem quantidade');
  assert.equal(await page.locator('.pj-piece-body span, .pj-piece-body small').count(),0,'Sem medidas nem material/cor');
  assert.equal(await page.locator('.pj-footer').count(),0,'Sem rodapé');
  assert.equal(await page.locator('.pj-intro').count(),0,'Sem resumo');
  assert.equal(await page.locator('.pj-amb-num').count(),0,'Sem numeração');
  assert.equal(await page.locator('.pj-amb-notes').count(),0,'Sem observações');
  assert.equal(await page.locator('.pj-cover .pj-eyebrow').count(),0,'Sem texto de abertura');
  assert.equal(await page.locator('.pj-cover-date, .pj-cover-place').count(),0,'Sem data nem local na capa');
  assert.equal(await page.locator('.pj-logo, .pj-brand').count(),0,'Sem logo');
  assert.equal(await page.locator('.pj-root').getAttribute('data-renders'),'grade');
  assert.equal(await page.locator('.pj-renders').getAttribute('class'),'pj-renders pj-renders-grade');
  await page.emulateMedia({media:'print'});
  const [l2,a2]=dim2(await page.pdf({printBackground:true,preferCSSPageSize:true}));
  assert.ok(a2>l2&&Math.abs(l2-595.3)<3,'Retrato é o A4 em pé: '+l2+'x'+a2);
  assert.deepEqual(errors,[]);await context.close();}
 // c) Config adulterada no banco: valores inválidos caem no padrão, nada é injetado
 {const ruim={fonte:'<script>alert(1)</script>',cores:{usarDoDecorador:false,principal:'red;background:url(//evil)',destaque:'#12345'},capa:{estilo:'<b>x</b>',textoAbertura:'<img src=x onerror="window.__xss=1">'},moveis:{colunas:'99; display:none'},__proto__:{x:1}};
  const {page,context,errors}=await abrirPublica(ruim);
  assert.equal(await page.evaluate(()=>window.__xss||0),0,'HTML no texto do layout é escapado, nunca executado');
  assert.equal(await page.locator('.pj-cover .pj-eyebrow img').count(),0);
  assert.match(await page.locator('.pj-cover .pj-eyebrow').textContent(),/<img src=x onerror=/,'aparece como texto literal');
  const vars=await page.locator('html').evaluate(el=>({ink:getComputedStyle(el).getPropertyValue('--pj-ink').trim(),acc:getComputedStyle(el).getPropertyValue('--pj-accent').trim(),cols:getComputedStyle(el).getPropertyValue('--pj-cols').trim(),tit:getComputedStyle(el).getPropertyValue('--pj-titulo')}));
  assert.equal(vars.ink,'#251e19','Cor inválida = a do padrão');assert.equal(vars.acc,'#b99a72');assert.equal(vars.cols,'4','Colunas inválidas caem no padrão (4)');
  assert.match(vars.tit,/Cormorant Garamond/,'Fonte desconhecida = Clássica');
  assert.equal(await page.locator('.pj-root').getAttribute('data-capa'),'foto');
  assert.deepEqual(errors,[]);await context.close();}
 // d) celular: sem overflow horizontal em nenhum estilo de capa
 for(const estilo of ['foto','limpa','lateral']){
  const {page,context,errors}=await abrirPublica({...CFG.editorial,capa:{...CFG.editorial.capa,estilo}},{width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Capa '+estilo+' sem overflow no celular');
  assert.deepEqual(errors,[]);await context.close();
 }
 // e) Muitas opções novas juntas: a página obedece a cada uma, o texto continua legível numa página escura e o PDF sai em Carta
 {const cfg={capa:{estilo:'limpa',fundo:'cor',corFundo:'#0f1216',altura:'media',moldura:true,linhaFina:false,mostrarRolagem:false,subtitulo:'Um projeto de decoração',caixaNome:'maiusculas',tamanhoNome:'enorme',formatoFotoCasal:'quadrada',posicaoLogo:'direita',tamanhoLogo:'grande',mostrarLogo:true},
   cores:{usarDoDecorador:false,principal:'#251e19',destaque:'#c8a15a',fundoPagina:'#101216',tomSuave:'#1b1f26',fundoCartoes:'#ffffff'},
   fonte:'romantica',texto:{tamanho:'grande',pesoTitulos:'forte'},pagina:{largura:'estreita',espaco:'amplo',cantos:'retos',navegacao:'escondida',navegacaoEstilo:'sublinhado',divisoria:'destaque',efeitoFotos:false,ampliarFotos:false},
   ambientes:{ordem:'moveis',contagem:true,alinhamento:'centro',caixaTitulo:'maiusculas',tituloMoveis:'',colunasFotos:3,proporcao:'quadrada',espacoFotos:'colado'},
   moveis:{posicaoQuantidade:'nome',fundoFoto:'branco',ajusteFoto:'preencher',proporcaoFoto:'retrato',efeito:true,alinhamentoTexto:'centro',caixaNome:'maiusculas'},
   rodape:{fundo:'destaque',assinatura:'Com carinho, equipe Kelly',italico:false,mostrarMarca:false,mostrarCredito:false,tamanhoMensagem:'enorme'},
   pdf:{papel:'carta',margem:'ampla',numerarPaginas:true,capaPaginaInteira:false}};
  const {page,context,errors}=await abrirPublica(cfg);
  const v=(n)=>page.locator('html').evaluate((el,n)=>getComputedStyle(el).getPropertyValue(n).trim(),n);
  assert.deepEqual([await v('--pj-fundo'),await v('--pj-max'),await v('--pj-espaco'),await v('--pj-raio'),await v('--pj-base'),await v('--pj-peso-titulos'),await v('--pj-capa-vh')],['#101216','980px','104px','0px','17.5px','600','64']);
  assert.match(await v('--pj-titulo'),/Cinzel/);
  const cores=await page.evaluate(()=>{const cs=(s)=>getComputedStyle(document.querySelector(s));return {corpoBg:cs('body').backgroundColor,corpoCor:cs('body').color,cartaoBg:cs('.pj-piece').backgroundColor,cartaoCor:cs('.pj-piece strong').color,rodapeBg:cs('.pj-footer').backgroundColor,rodapeCor:cs('.pj-footer-thanks').color,capaBg:cs('.pj-cover').backgroundColor};});
  const rgb=(t)=>t.match(/\d+(\.\d+)?/g).slice(0,3).map(Number);
  const lum=([r,g,b])=>{const f=(c)=>{c/=255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4;};return .2126*f(r)+.7152*f(g)+.0722*f(b);};
  const contr=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  assert.equal(cores.corpoBg,'rgb(16, 18, 22)');assert.equal(cores.capaBg,'rgb(15, 18, 22)');
  assert.ok(contr(cores.corpoBg,cores.corpoCor)>=4.5,'Texto legível na página escura: '+JSON.stringify(cores));
  assert.ok(contr(cores.cartaoBg,cores.cartaoCor)>=4.5,'Cartão branco numa página escura: o texto do cartão fica escuro');
  assert.ok(contr(cores.rodapeBg,cores.rodapeCor)>=4.5,'Rodapé na cor de destaque com texto legível');
  assert.equal(await page.locator('.pj-cover-frame').count(),1,'Moldura na capa');
  assert.equal(await page.locator('.pj-cover-rule').count(),0,'Sem a linha fina');assert.equal(await page.locator('.pj-scroll').count(),0,'Sem "Ver o projeto"');
  assert.equal(await page.locator('.pj-cover-sub').textContent(),'Um projeto de decoração');
  assert.equal(await page.locator('.pj-cover h1').evaluate(el=>getComputedStyle(el).textTransform),'uppercase');
  assert.equal(await page.locator('.pj-nav-list').count(),0,'Barra de ambientes escondida');assert.equal(await page.locator('#pjPdf').count(),1,'...mas o botão "Baixar PDF" continua');
  const ordem=await page.locator('#amb-0').evaluate((el)=>[...el.children].map((c)=>c.className.split(' ')[0]));
  assert.ok(ordem.includes('pj-furniture')&&ordem.includes('pj-renders')&&ordem.indexOf('pj-furniture')<ordem.indexOf('pj-renders'),'Móveis antes das renderizações: '+ordem);
  assert.equal(await page.locator('#amb-0 .pj-amb-count').textContent(),'24 peças');
  assert.equal(await page.locator('.pj-furniture h3').count(),0,'Título da lista de móveis em branco: some');
  assert.equal(await page.locator('[data-lightbox]').count(),0,'Sem ampliar a foto');
  assert.equal(await page.locator('.pj-piece-body .pj-qty[data-pos="nome"]').count(),1);assert.equal(await page.locator('.pj-piece > .pj-qty').count(),0,'Quantidade junto do nome, sem selo');
  assert.equal(await page.locator('.pj-footer-sign').textContent(),'Com carinho, equipe Kelly');
  assert.equal(await page.locator('.pj-footer-brand, .pj-footer-credit').count(),0);
  assert.equal(await page.locator('.pj-piece').evaluate(el=>getComputedStyle(el).borderRadius),'0px','Cantos retos');
  assert.equal(await page.locator('#pjPagina').evaluate(el=>el.textContent),'@page{size:letter portrait;margin:20mm;@bottom-center{content:counter(page);font:9pt sans-serif;color:#77716a}}');
  await page.emulateMedia({media:'print'});
  const [lc,ac]=dim2(await page.pdf({printBackground:true,preferCSSPageSize:true}));
  assert.ok(Math.abs(lc-612)<3&&Math.abs(ac-792)<3,'PDF em Carta, em pé: '+lc+'x'+ac);
  assert.deepEqual(errors,[]);await context.close();}
 // e2) o mesmo layout no celular: sem overflow horizontal
 {const {page,context,errors}=await abrirPublica({capa:{estilo:'limpa',tamanhoNome:'enorme',tamanhoLogo:'grande',posicaoLogo:'direita'},pagina:{largura:'total',navegacao:'normal'},texto:{tamanho:'enorme'},ambientes:{colunasFotos:3,tituloMoveis:'Peças'},moveis:{colunas:5}},{width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Texto muito grande + 3 colunas no celular sem overflow');
  assert.deepEqual(errors,[]);await context.close();}
 function normalizeOff(){return {versao:1,capa:{estilo:'limpa',alinhamento:'centro',fundo:'branco',textoAbertura:'',mostrarFotoCasal:false,mostrarLogo:false,mostrarData:false,mostrarLocal:false},cores:{usarDoDecorador:true,principal:'#251e19',destaque:'#b99a72'},fonte:'moderna',resumo:false,ambientes:{numeracao:false,notas:false,renders:'grade',umaPorPagina:false},moveis:{estilo:'limpo',colunas:2,medidas:false,materialCor:false,quantidade:false},rodape:{mostrar:false,mensagem:'',contato:false},pdf:{orientacao:'retrato'}};}
 function dim2(buf){const m=buf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);return [Number(m[1]),Number(m[2])];}
 function dim(buf){return dim2(buf);}
}

// ===== Cenário 4: equipe — os próprios layouts, sem "cores do catálogo do decorador" =====
{
 const {page,errors}=await novoContexto({staff:true});
 await irParaProjetos(page);
 await page.locator('[data-cpj="layouts"]').click();
 await page.locator('.lay-vazio').waitFor();
 await page.locator('.lay-modelo[data-modelo="editorial"]').click();
 await modal(page).waitFor();
 await modal(page).locator('[name=nome]').fill('Da Chiavari');
 await modal(page).locator('button[type=submit]').click();
 await page.locator('[data-lay-editor]').waitFor();
 const criar=(await calls(page,'layout_salvar'))[0].params;
 assert.equal(criar.p_empresa_id,'company','Equipe usa a empresa');assert.equal('p_token' in criar,false,'...e nunca o token do catálogo');
 assert.equal(await page.locator('[name="cores.usarDoDecorador"]').count(),0,'Sem decorador não existe "cores do meu catálogo"');
 assert.equal(await page.locator('[name="cores.destaque"]').isDisabled(),false);
 assert.deepEqual(errors,[]);
 await page.context().close();
}

// ===== Cenário 5: celular =====
{
 const {page,errors}=await novoContexto({token:true,decoradorCores:CORES},{viewport:{width:390,height:844},seed:SEMENTE});
 await irParaProjetos(page);
 await page.locator('[data-cpj="layouts"]').click();
 await page.locator('.lay-card').first().waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Lista de layouts sem overflow no celular');
 await page.locator('.lay-card').first().locator('[data-lay="editar"]').first().click();
 await page.locator('[data-lay-editor]').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Editor sem overflow no celular');
 const form=await page.locator('.lay-form').boundingBox(),previa=await page.locator('.lay-previa').boundingBox();
 assert.ok(previa.y>form.y+form.height-2,'No celular a pré-visualização vem embaixo do formulário');
 await page.screenshot({path:path.join(os.tmpdir(),'lay-7-mobile.png'),fullPage:false});
 assert.deepEqual(errors,[]);
 await page.context().close();
}

await browser.close();server.close();
console.log('catalogo-layouts-browser: ok');
})().catch((e)=>{console.error(e);process.exit(1);});
