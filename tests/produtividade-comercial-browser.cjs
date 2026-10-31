const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const raiz=path.resolve(__dirname,'..'),base='http://acervo.teste/';
const mock=`(() => {
 const config={inicio:'2026-10-31T12:00:00Z',participantes:['a','b'],acessos:[{observador:'a',alvo:'b'},{observador:'a',alvo:'equipe'}],situacoes:['Aguardando decisão','Reunião agendada'],motivos:['Reunião']};
 window.__rpcs=[];window.__contatos=[];
 window.__CONTEXT={empresa_id:'e'};window.aguardarContexto=async()=>window.__CONTEXT;window.EasyLocPermissions={hasPermission:()=>true};
 window.supabaseClient={rpc:async(n,a)=>{window.__rpcs.push({n,a});
 if(n==='comercial_prod_contexto')return{data:{config,pessoas:[{id:'a',nome:'Ana'},{id:'b',nome:'Bia'}],usuario:'a'}};
 if(n==='comercial_acompanhamentos')return{data:window.__contatos};
 if(n==='comercial_acompanhamento_salvar'){window.__contatos.push({tipo:a.p_tipo,situacao:a.p_situacao,motivo:a.p_motivo,observacao:a.p_observacao,autor:'Ana',prazo:a.p_proximo,responsavel:'Bia',responsavel_id:'b',criado_em:new Date().toISOString()});return{data:null};}
 if(n==='comercial_prod_config_salvar')return{data:null};
 if(n==='comercial_prod_painel')return{data:{inicio:config.inicio,escopo:a.p_equipe?'Equipe completa':'Pessoas autorizadas',pedidos:3,totais:{criados:1,alteracoes:7,detalhes:12,acompanhamentos:4,no_prazo:2,atrasados:1},dias:[{dia:'2026-10-31',acoes:12}],pessoas:a.p_equipe?[]:[{id:'a',nome:'Ana',criados:1,pedidos:3,alteracoes:7,detalhes:12,acompanhamentos:4,no_prazo:2,atrasados:1}],eventos:a.p_equipe?[]:[{id:'x',pedido_id:'p',numero_pedido:'123',autor:'Ana',tipo:'alteracao',criado_em:'2026-10-31T12:00:00Z',detalhes:[{campo:'horario_entrega',de:'09:00',para:'10:00'}]}]}};
 return{data:null};}};
})();`;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.addInitScript(mock);
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url());if(url.origin!==new URL(base).origin)return route.fulfill({body:'',contentType:'text/javascript'});
 const arquivo=path.join(raiz,decodeURIComponent(url.pathname));
 if(/\/js\/core\//.test(url.pathname))return route.fulfill({body:'',contentType:'text/javascript'});
 if(!arquivo.startsWith(raiz)||!fs.existsSync(arquivo))return route.fulfill({status:404,body:''});
 return route.fulfill({body:fs.readFileSync(arquivo),contentType:arquivo.endsWith('.html')?'text/html':arquivo.endsWith('.css')?'text/css':'text/javascript'});
 });
 await page.goto(base+'Modulos/Comercial/Produtividade/produtividade.html');
 await page.getByRole('status').filter({hasText:'Pessoas autorizadas'}).waitFor();
 const layout=await page.evaluate(()=>{const raiz=document.querySelector('#produtividadeComercial'),titulo=raiz.querySelector('.header-list > h2'),filtro=raiz.querySelector('.cp-filtro-card');return{padding:parseFloat(getComputedStyle(raiz).paddingLeft),alinhamento:getComputedStyle(titulo).textAlign,caixa:getComputedStyle(titulo).textTransform,fonte:getComputedStyle(titulo).fontFamily,colunas:getComputedStyle(raiz.querySelector('.cp-kpis')).gridTemplateColumns.split(' ').length,fundo:getComputedStyle(filtro).backgroundColor};});
 assert.ok(layout.padding>=20);assert.equal(layout.alinhamento,'center');assert.equal(layout.caixa,'uppercase');assert.match(layout.fonte,/serif/i);assert.equal(layout.colunas,4);assert.notEqual(layout.fundo,'rgba(0, 0, 0, 0)');
 assert.equal(await page.locator('[data-kpis] strong').first().textContent(),'3');
 await page.getByText('31/10/2026 · Ana · Pedido 123 · Alteração').click();
 await page.getByText('horario_entrega: "09:00" → "10:00"').waitFor();
 await page.getByLabel('Visualizar').selectOption('equipe');await page.getByRole('button',{name:'Consultar'}).click();
 await page.getByRole('status').filter({hasText:'Equipe completa'}).waitFor();assert.equal(await page.locator('[data-pessoas] tr').count(),0);
 await page.screenshot({path:path.join(raiz,'outputs/produtividade-comercial.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.cp-kpis')).gridTemplateColumns.split(' ').length),2);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.screenshot({path:path.join(raiz,'outputs/produtividade-comercial-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>window.ComercialProdutividade.abrir({id:'p',numero:'123'},'e',()=>{window.__cancelar=true;}));
 const form=page.getByRole('dialog');await form.waitFor();
 await form.getByRole('button',{name:'Registrar e agendar retorno'}).click();assert.equal(await page.evaluate(()=>window.__rpcs.filter(x=>x.n==='comercial_acompanhamento_salvar').length),0);
 await form.getByLabel('Observação').fill('Cliente fará reunião para decidir.');
 await form.getByLabel('Responsável pelo próximo contato').selectOption('b');
 const futuro=new Date(Date.now()+3*86400000).toISOString().slice(0,10);await form.getByLabel('Próximo contato',{exact:true}).fill(futuro);
 await form.getByRole('button',{name:'Registrar e agendar retorno'}).click();await form.waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>window.__rpcs.filter(x=>x.n==='comercial_acompanhamento_salvar').length),1);
 await page.evaluate(()=>window.ComercialProdutividade.abrir({id:'p',numero:'123'},'e',()=>{window.__cancelar=true;}));
 await page.getByText('Cliente fará reunião para decidir.',{exact:true}).waitFor();
 await page.screenshot({path:path.join(raiz,'outputs/acompanhamento-comercial.png'),fullPage:true});
 await page.getByRole('button',{name:'Cliente não vai fechar'}).click();assert.equal(await page.evaluate(()=>window.__cancelar),true);
 await page.evaluate(async()=>{const host=document.createElement('div');host.id='testeParametros';document.body.append(host);await window.carregarParametrosProdutividade(host,'e');});
 const params=page.locator('#testeParametros');await params.getByRole('button',{name:'Salvar produtividade'}).click();await params.getByText('Configuração salva.').waitFor();
 const salvo=await page.evaluate(()=>window.__rpcs.find(x=>x.n==='comercial_prod_config_salvar').a.p_config);assert.deepEqual(salvo.participantes,['a','b']);assert.equal(salvo.acessos.length,2);
 assert.deepEqual(erros,[]);console.log('OK: painel, acesso agregado, detalhes, agenda obrigatória, contato, cancelamento e parâmetros.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
