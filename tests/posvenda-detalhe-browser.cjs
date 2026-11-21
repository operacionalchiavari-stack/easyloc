const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const raiz = path.resolve(__dirname, '..'), base = 'http://posvenda.teste';

function fixture() {
  const pedido = { id:'p5',numero:'5',data_evento:'2026-10-22',tipo:'Aniversário',local:'Pousada Bosque das Hortênsias',valor:10596.11,vendedor:{nome:'Larissa Mendes'},montador:{nome:'Rodrigo Teixeira'},posicao_final:true,ocorrencias:1,problemas:[{tipo:'confirmacao_coleta_atrasada',qtd:1,itens:['Mesa de apoio']}],etapas:[{tipo:'montagem',nome:'Montagem',data:'2026-10-22',hora:'09:00',pessoas:[{nome:'Rodrigo Teixeira',papel:'responsavel'}],caminhoes:[{codigo:'M',modelo:'Mercedes Benz 710',placa:'HMS0554'}]}] };
  const a = {id:'a',cliente_nome:'Ateliê Flor de Lis',telefone:'(24) 99999-1234',novo:true,status:'concluido',atencao:true,created_at:'2026-11-18T11:00:00Z',concluido_em:'2026-11-19T12:15:00Z',feito_por_nome:'Larissa Mendes',tentativas:2,tentativas_log:[{em:'2026-11-18T13:00:00Z',resultado:'nao_atendeu',por:'Larissa Mendes'},{em:'2026-11-19T12:15:00Z',resultado:'atendeu',por:'Larissa Mendes'}],observacao:'Elogiou a equipe, mas a coleta atrasou 1 hora.\nSolicitou retorno. <img src=x onerror=alert(1)>',observacoes_setor:{montagem:'Equipe muito educada'},respostas:[{pergunta:'Como foi o atendimento comercial?',respostas:['Excelente']},{pergunta:'Entrega e montagem',respostas:['No horário e tudo certo']},{pergunta:'Estado dos móveis',respostas:['Impecáveis']},{pergunta:'Coleta',respostas:['Atrasou ou teve problema'],ruim:true},{pergunta:'O que mais gostou',respostas:['Atendimento','Acervo']},{pergunta:'Indicaria a Chiavari',respostas:['Com certeza']},{pergunta:'Quer que alguém retorne o contato',respostas:['Sim']}],pedidos:[pedido,{id:'p6',numero:'6',data_evento:'2026-10-23',local:'Salão',valor:0}],historico:[{em:'2026-10-02T10:00:00Z',por:'Larissa',observacao:'Ótimo atendimento',respostas:[],elogios:['Gostou da equipe']}]};
  window.__dados = {hoje:'2026-11-20',config:{},contatos:[a,{id:'b',cliente_nome:'Bruna Lima',status:'concluido',atencao:false,concluido_em:'2026-11-19T13:00:00Z',feito_por_nome:'Carla',respostas:[{pergunta:'Atendimento',respostas:['Excelente']}],pedidos:[]},{id:'c',cliente_nome:'Sem contato',status:'sem_contato',ultima_tentativa_em:'2026-11-19T14:00:00Z',pedidos:[]},{id:'d',cliente_nome:'Contato dispensado',status:'dispensado',motivo:'Cliente pediu para não ligar',pedidos:[]}]};
  window.__calls=[]; window.__falha=false;
  window.aguardarContexto=async()=>({empresa_id:'e'});
  window.alerta=()=>{};
  window.supabaseClient={
    async rpc(n,args){
      window.__calls.push({n,args});
      if(n==='posvenda_lista')return {data:window.__dados};
      if(n==='posvenda_tratativa'){
        if(window.__falha)return {error:{message:'Falha simulada ao atualizar'}};
        const contato=window.__dados.contatos.find(x=>x.id===args.p_contato);
        Object.assign(contato,{tratativa_responsavel:args.p_responsavel,tratativa_obs:args.p_obs,tratativa_concluida_em:args.p_concluir?'2026-11-20T15:00:00Z':null,tratativa_por_nome:'Carla'});
        return {data:contato};
      }
      if(n==='posvenda_posicao_final')return {data:{pedido:{id:'p5',numero_pedido:'5',cliente_nome:'Ateliê Flor de Lis'},titulos:[],pagamentos:[],salvo:{status:'confirmado',itens:[]}}};
      return {data:null};
    },
    from(){const q={select:()=>q,eq:()=>q,order:()=>q,then:(a,b)=>Promise.resolve({data:[{nome:'Carla'}]}).then(a,b)};return q;}
  };
}

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  for(const width of [1887,1440,1101,1024,600,390,320]){
   const page=await browser.newPage({viewport:{width,height:width>=1101?837:1000}}),erros=[];
   page.on('pageerror',e=>erros.push(e.message));await page.addInitScript(fixture);
   await page.route('**/*',rt=>{
    const url=rt.request().url();if(!url.startsWith(base))return rt.abort();
    if(/\/js\/core\/.*\.js(?:\?|$)/.test(url))return rt.fulfill({contentType:'application/javascript',body:''});
    const f=path.join(raiz,decodeURIComponent(new URL(url).pathname));
    if(!fs.existsSync(f))return rt.fulfill({status:404,body:''});
    return rt.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.css':'text/css','.woff2':'font/woff2'}[path.extname(f)]||'application/javascript'});
   });
   await page.goto(base+'/Modulos/Chiavari/Feedback/feedback.html');
   await page.click('[data-aba="atencao"]');await page.locator('tr[data-ver="a"]').focus();await page.keyboard.press('Enter');
   const detalhe=page.locator('#pvLateral');await detalhe.waitFor({state:'visible'});
   assert.equal(await detalhe.locator('.pv-disse').count(),7,'todas as respostas');
   assert.match(await detalhe.locator('.pv-disse').first().innerText(),/Coleta.*Atrasou/s,'reclamação aparece antes das outras respostas');
   if(width>=1440){
    const compacto=await page.evaluate(()=>{
     const tela=document.querySelector('.pvd-tela'),cab=document.querySelector('.pvd-topo').getBoundingClientRect();
     return {altura:tela.scrollHeight,visivel:tela.clientHeight,naLinha:[...document.querySelectorAll('.pvd-topo .pvd-resumo>div')].every(e=>{const r=e.getBoundingClientRect();return r.top>=cab.top&&r.bottom<=cab.bottom;}),abaixo:document.querySelector('.pvd-complementos').getBoundingClientRect().bottom};
    });
    assert.ok(compacto.altura<=compacto.visivel+1,'conteúdo inicial sem barra vertical: '+JSON.stringify(compacto));
    assert.equal(compacto.naLinha,true,'resumo na mesma linha da cliente');
   }
   if([1887,1440,390].includes(width)){
    fs.mkdirSync(path.join(raiz,'.tmp'),{recursive:true});await page.screenshot({path:path.join(raiz,'.tmp','posvenda-compacta-'+width+'.png')});
   }
   await detalhe.locator('.pvd-pedidos>details>summary').click();
   assert.equal(await detalhe.locator('.pvd-pedido').count(),2,'todos os pedidos');
   assert.match(await detalhe.locator('.pvd-resumo').innerText(),/10\.596,11/);
   assert.match(await detalhe.locator('.pvd-pedido').nth(1).innerText(),/R\$\s*0,00/,'zero é um valor informado');
   assert.equal(await detalhe.locator('.pvd-tempo>li').count(),3,'tentativa final não aparece duplicada');
   const tempos=await detalhe.locator('time').evaluateAll(xs=>xs.map(x=>x.dateTime));assert.deepEqual(tempos,tempos.slice().sort().reverse());
   assert.equal(await detalhe.locator('.pvd-anotacao img').count(),0,'observação escapada');
   await detalhe.locator('.pvd-operacao summary').click();assert.match(await detalhe.locator('.pvd-operacao').innerText(),/Rodrigo Teixeira.*HMS0554/s);
   assert.equal(await detalhe.locator('[data-eq-fb]').count(),0,'consulta da equipe sem ações de avaliação de outra ligação');
   assert.ok(await page.evaluate(()=>{const t=document.querySelector('.pvd-tela');return t.scrollWidth<=t.clientWidth+1;}),'sem rolagem horizontal em '+width);
   if(width===1440){
    await detalhe.locator('[data-posicao="p5"]').click();await page.locator('dialog.pf-documento-modal[open]').waitFor();
    await page.locator('dialog.pf-documento-modal [data-fechar]').click();assert.ok(await detalhe.isVisible(),'documento fecha e volta ao detalhe');
   }
   await detalhe.locator('.pvd-tela').evaluate(el=>{el.scrollTop=0;});
   await detalhe.locator('[data-tratativa="a"]').click();await page.locator('#pvForm[open]').waitFor();
   await page.keyboard.press('Escape');assert.ok(await detalhe.isVisible(),'Escape do formulário preserva a tela');
   await detalhe.locator('[data-tratativa="a"]').click();await page.locator('#pvFormCorpo [name="__resp"]').fill('Carla');
   await page.locator('#pvFormCorpo [name="__trat"]').fill('Cliente recebeu retorno e confirmou a solução.');
   await page.locator('#pvFormCorpo label:has([name="__concluir"])').click();
   if(width===1440){
    await page.evaluate(()=>window.__falha=true);await page.locator('#pvFormulario button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('#pvFormErro').textContent.includes('Falha simulada'));
    assert.ok(await page.locator('#pvForm[open]').isVisible());await page.evaluate(()=>window.__falha=false);
    await page.locator('#pvFormCorpo label:has([name="__concluir"])').click();
    await page.locator('#pvFormulario button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('.pvd-retorno [data-tratativa]')?.textContent==='Atualizar retorno'&&!document.querySelector('#pvForm[open]'));
    assert.match(await detalhe.locator('.pvd-retorno').innerText(),/Aguardando retorno ao cliente.*Carla/s,'definir responsável mantém retorno pendente');
    await detalhe.locator('[data-tratativa="a"]').click();await page.locator('#pvForm[open]').waitFor();
    assert.equal(await page.locator('#pvFormCorpo [name="__resp"]').inputValue(),'Carla');
    await page.locator('#pvFormCorpo label:has([name="__concluir"])').click();
   }
   await page.locator('#pvFormulario button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('.pvd-titulo h2').textContent==='Retorno concluído');
   assert.match(await detalhe.locator('.pvd-retorno').innerText(),/Carla.*Cliente recebeu retorno/s);assert.equal(await detalhe.locator('[data-tratativa]').count(),0);
   assert.equal(await detalhe.locator('.pvd-tempo>li').count(),4,'resolução entra na linha do tempo');
   await detalhe.locator('[data-fechar-lateral]').click();assert.equal(await detalhe.isVisible(),false);
   assert.ok(await page.evaluate(()=>!document.documentElement.classList.contains('pvd-aberta')&&!document.querySelector('.pv-page').inert));
   await page.click('[data-aba="feitas"]');assert.equal(await page.locator('tr[data-ver="a"]').count(),1,'resolvida entra em Concluídas');
   for(const id of ['a','b','c','d']){
    await page.locator('tr[data-ver="'+id+'"]').click();
    if(id==='b')assert.match(await detalhe.locator('.pvd-retorno').innerText(),/Nenhum retorno pendente/);
    if(id==='c')assert.equal(await detalhe.locator('.pvd-titulo h2').innerText(),'Sem contato');
    if(id==='d')assert.match(await detalhe.locator('.pvd-retorno').innerText(),/Cliente pediu para não ligar/);
    await page.keyboard.press('Escape');
   }
   if(width>=1440){
    await page.evaluate(()=>{
     const c=window.__dados.contatos[0];
     window.PosvendaAbrirLigacao({...c,id:'kelly',cliente_nome:'Kelly Khawam',feito_por_nome:'Jonatan Falck',pedidos:[],tratativa_concluida_em:null,tratativa_responsavel:null,tratativa_obs:null,respostas:c.respostas.map(r=>r.pergunta==='Estado dos móveis'?{...r,respostas:['Chegou com avaria ou sujo'],ruim:true}:r)});
    });
    assert.match(await detalhe.locator('.pvd-resumo').innerText(),/2 reclamações.*0.*Não informado.*Jonatan Falck/s);
    assert.ok(await detalhe.locator('.pvd-tela').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'caso Kelly sem barra vertical');
    await page.screenshot({path:path.join(raiz,'.tmp','posvenda-kelly-compacta-'+width+'.png')});
    await page.keyboard.press('Escape');
   }
   assert.deepEqual(erros,[]);await page.close();console.log(width+'px: detalhe, pedidos, respostas, equipe, retorno, resolução, estados e teclado OK');
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
