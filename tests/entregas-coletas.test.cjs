const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const empresa='10000000-0000-0000-0000-000000000001',outro='10000000-0000-0000-0000-000000000002',pedido='20000000-0000-0000-0000-000000000001',item='30000000-0000-0000-0000-000000000001',linha='40000000-0000-0000-0000-000000000001',chave=linha+'|'+item;
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${empresa}'::uuid$$;
 create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${empresa}'::uuid$$;
 create function funcionario_tabela_permitida(uuid,text,text) returns boolean language sql as $$select coalesce(current_setting('test.negar',true),'')<>$3$$;
 create function funcionario_pode(uuid,uuid,text) returns boolean language sql as $$select coalesce(current_setting('test.negar',true),'')<>'config'$$;
 create table empresas(id uuid primary key);insert into empresas values('${empresa}'),('${outro}');
 create table separacoes_pedidos(id uuid primary key,empresa_id uuid,numero_pedido text,cliente_nome text,local_nome text,data_entrega date,data_coleta date,operacao jsonb,status text,status_comercial text,encerrado_operacional_em timestamptz);
 create table pecas(chave text,linha uuid,item_id uuid,nome text,esperado numeric);
 insert into pecas values('${chave}','${linha}','${item}','Cadeira Tiffany',10);
 create function operacao_conferencia_pecas(uuid) returns setof pecas language sql as $$select * from pecas$$;
 create table separacoes_etiquetas(separacao_pedido_id uuid,empresa_id uuid,separacao_item_id uuid,item_id uuid,lida_carregamento_em timestamptz);
 insert into separacoes_pedidos values('${pedido}','${empresa}','2233','Cliente de teste','Casa de Festa Encanto Azul','2026-10-24','2026-10-25','{"carregamento":{"concluido_em":"2026-10-24T08:00:00Z","itens":[{"chave":"${chave}","item":"Cadeira Tiffany","esperado":10,"conferido":9}]}}','separado','aprovado',null);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261024000100_confirmacoes_entrega_coleta.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261024000200_entrega_confirmacao_independente.sql','utf8'));
 await db.exec(`create table funcionarios_acesso(id uuid,empresa_id uuid,foto_url text);
 create table free_cadastros(id uuid,empresa_id uuid,foto_url text);
 create table operacao_etapas(id uuid,pedido_id uuid,empresa_id uuid,nome text,tipo text,data date,hora time);
 create table operacao_etapa_pessoas(etapa_id uuid,empresa_id uuid,papel text,nome text,funcionario_id uuid,free_id uuid);
 insert into funcionarios_acesso values('${empresa}','${empresa}','https://example.test/responsavel.jpg');
 insert into operacao_etapas values('${linha}','${pedido}','${empresa}','Montagem','montagem','2026-10-24','08:00');
 insert into operacao_etapa_pessoas values('${linha}','${empresa}','responsavel','Carlos da montagem','${empresa}',null);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261024000300_confirmacao_responsaveis_cronograma.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261024000400_coleta_ocorrencias_evento.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261024000500_motivos_entrega_coleta.sql','utf8'));
 return db;
}
const base=async(db,etapa='entrega')=>(await db.query('select logistica_confirmacao_base($1,$2) b',[pedido,etapa])).rows[0].b;
const salvar=async(db,b,itens,etapa='entrega')=>{
 const id=(await db.query('select id from logistica_motivos where empresa_id=$1 and etapa=$2 and ativo order by nome limit 1',[empresa,etapa])).rows[0].id;
 itens=itens.map(i=>({...i,motivo_id:i.observacao?id:null}));
 return (await db.query('select logistica_confirmacao_salvar($1,$2,$3,$4,$5,$6) b',[pedido,etapa,b.token,JSON.stringify(itens),'Maria no local','Conferido no evento'])).rows[0].b;
};
test('entrega/coleta: quantidades, retorno antecipado, histórico, concorrência e permissões',async()=>{
 const db=await fixture();try{
  let b=await base(db);assert.equal(b.itens[0].previsto,10);assert.equal(b.itens[0].carregado,9);
  assert.match((await base(db,'coleta')).bloqueio,/entrega/);
  const entrega=[{chave,entregue:8,voltou_antes:2,retirado_lista:1,observacao:'Uma retirada e uma não entregue; duas voltaram antes.'}];
  await assert.rejects(salvar(db,b,[{...entrega[0],observacao:''}]),/Explique/);
  await assert.rejects(salvar(db,b,[{...entrega[0],entregue:11}]),/inválidas/);
  await assert.rejects(salvar(db,b,[{...entrega[0],voltou_antes:9}]),/inválidas/);
  await assert.rejects(salvar(db,b,[{...entrega[0],entregue:1.5}]),/inválidas/);
  await assert.rejects(salvar(db,b,[]),/todos/);
  await db.exec("set test.negar='editar'");await assert.rejects(salvar(db,b,entrega),/permissão/);await db.exec("set test.negar=''");
  const stale=b;b=await salvar(db,b,entrega);assert.equal(b.atual.versao,1);assert.equal(b.atual.itens[0].nao_entregue,1);
  await assert.rejects(salvar(db,stale,entrega),/mudou/);
  b=await salvar(db,b,entrega);assert.equal(b.historico.length,2);
  await db.exec('delete from pecas');b=await base(db);assert.equal(b.itens.length,1);assert.equal(b.itens[0].fora_lista,true);assert.equal(b.itens[0].previsto,10);
  let c=await base(db,'coleta');assert.equal(c.itens[0].previsto,6);assert.equal(c.itens[0].retirado_lista,undefined);assert.equal(c.itens[0].ja_no_deposito,4);assert.equal(c.itens[0].nao_entregue_deposito,2);
  const coleta=[{chave,coletado:4,danificado:1,retirado_lista:1,observacao:'Uma cadeira quebrada; outra removida da lista; uma faltando.'}];
  await assert.rejects(salvar(db,c,[{...coleta[0],danificado:5}],'coleta'),/inválidas/);
  await assert.rejects(salvar(db,c,[{...coleta[0],observacao:''}],'coleta'),/Descreva/);
  c=await salvar(db,c,coleta,'coleta');assert.equal(c.atual.itens[0].nao_coletado,1);assert.equal(c.atual.itens[0].danificado,1);
  await assert.rejects(salvar(db,b,entrega),/coleta já/);
  await db.exec(`update separacoes_pedidos set empresa_id='${outro}'`);await assert.rejects(base(db),/Sem acesso/);
  await db.exec(`update separacoes_pedidos set empresa_id='${empresa}',encerrado_operacional_em=now()`);await assert.rejects(salvar(db,c,coleta,'coleta'),/encerrada/);
  const privileges=(await db.query("select has_table_privilege('authenticated','logistica_confirmacoes','INSERT') i,has_table_privilege('authenticated','logistica_confirmacoes','UPDATE') u")).rows[0];assert.equal(privileges.i,false);assert.equal(privileges.u,false);
 }finally{await db.close();}
});
module.exports={fixture,base,salvar,pedido,empresa,chave};

test('motivos: valida empresa, etapa e atividade e preserva o nome no histórico',async()=>{
 const db=await fixture();try{
  let b=await base(db);
  const ids=(await db.query('select * from logistica_motivos order by empresa_id,etapa,nome')).rows;
  const motivo=ids.find(m=>m.empresa_id===empresa&&m.etapa==='entrega'),coleta=ids.find(m=>m.empresa_id===empresa&&m.etapa==='coleta'),externo=ids.find(m=>m.empresa_id===outro);
  const call=async(id,obs='texto manipulado')=>(await db.query('select logistica_confirmacao_salvar($1,$2,$3,$4,$5,$6) b',[pedido,'entrega',b.token,JSON.stringify([{chave,entregue:8,voltou_antes:0,retirado_lista:0,motivo_id:id,observacao:obs}]),'Teste',''])).rows[0].b;
  await assert.rejects(call(null),/Selecione/);await assert.rejects(call(coleta.id),/inválido/);await assert.rejects(call(externo.id),/inválido/);
  b=await call(motivo.id);assert.equal(b.atual.itens[0].observacao,motivo.nome);assert.equal(b.atual.itens[0].motivo_id,motivo.id);
  await db.query('update logistica_motivos set nome=$1,ativo=false where id=$2',['Motivo renomeado',motivo.id]);await assert.rejects(call(motivo.id),/inválido/);
  assert.equal((await base(db)).atual.itens[0].observacao,motivo.nome);
  await db.exec("grant usage on schema auth to authenticated;set role authenticated;set test.negar='config'");
  await assert.rejects(db.query('insert into logistica_motivos(empresa_id,etapa,nome) values($1,$2,$3)',[empresa,'entrega','Motivo sem permissão']),/row-level security/);
  await db.exec("set test.negar=''");await db.query('insert into logistica_motivos(empresa_id,etapa,nome) values($1,$2,$3)',[empresa,'entrega','Motivo autorizado']);await db.exec('reset role');
 }finally{await db.close();}
});

test('parâmetros: cadastrar, editar e desativar um motivo pela interface',async()=>{
 const express=require('express'),{chromium}=require('playwright'),db=await fixture(),app=express();let browser,server;
 try{
  app.use(express.json());app.get('/__motivos',(_req,res)=>res.send('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="host"></div></body></html>'));
  app.post('/__motivos',async(req,res)=>{try{const d=req.body;let r;if(d.mode==='insert')r=await db.query('insert into logistica_motivos(empresa_id,etapa,nome) values($1,$2,$3) returning id',[empresa,d.payload.etapa,d.payload.nome]);else if(d.mode==='update')r=await db.query('update logistica_motivos set nome=$1,ativo=$2 where empresa_id=$3 and id=$4 returning id',[d.payload.nome,d.payload.ativo,empresa,d.id]);else r=await db.query('select * from logistica_motivos where empresa_id=$1 order by etapa,nome',[empresa]);res.json({data:d.single?r.rows[0]:r.rows,error:null});}catch(e){res.json({data:null,error:{message:e.message}});}});
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port+'/__motivos');
  await page.evaluate(()=>{window.supabaseClient={from:()=>{let mode='select',payload,id,single=false;const q={select:()=>q,order:()=>q,eq:(campo,v)=>{if(campo==='id')id=v;return q;},single:()=>{single=true;return q;},insert:v=>{mode='insert';payload=v;return q;},update:v=>{mode='update';payload=v;return q;},then:fn=>fetch('/__motivos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,payload,id,single})}).then(r=>r.json()).then(fn)};return q;}};});
  await page.addScriptTag({path:'Modulos/Configuracoes/Parametros/parametros-motivos-logistica.js'});
  await page.evaluate(async empresa=>window.carregarMotivosLogistica(document.getElementById('host'),empresa),empresa);
  const form=page.locator('.pr-motivo-novo').first();await form.locator('select').selectOption('coleta');await form.locator('input').fill('Peça trincada no evento');await form.locator('button').click();await page.getByText('Motivo salvo.',{exact:true}).waitFor();
  const id=(await db.query('select id from logistica_motivos where empresa_id=$1 and nome=$2',[empresa,'Peça trincada no evento'])).rows[0].id;
  const linha=page.locator('[data-motivo="'+id+'"]');await linha.locator('[name=nome]').fill('Peça quebrada no evento');await linha.locator('[name=ativo]').uncheck();await linha.locator('button').click();await page.waitForFunction(id=>{const f=document.querySelector('[data-motivo="'+id+'"]');return f?.querySelector('button')?.disabled===false&&f?.querySelector('[name=nome]').value==='Peça quebrada no evento'&&!f.querySelector('[name=ativo]').checked;},id);
  const salvo=(await db.query('select nome,etapa,ativo from logistica_motivos where id=$1',[id])).rows[0];assert.deepEqual(salvo,{nome:'Peça quebrada no evento',etapa:'coleta',ativo:false});
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await db.close();}
});

test('item não entregue permanece na coleta como já no depósito, sem falta cobrável',async()=>{
 const db=await fixture();try{
  let b=await base(db);await salvar(db,b,[{chave,entregue:0,voltou_antes:0,retirado_lista:0,observacao:'Não entregue, permaneceu no depósito.'}]);
  const c=await base(db,'coleta');assert.equal(c.itens.length,1);assert.equal(c.itens[0].previsto,0);assert.equal(c.itens[0].ja_no_deposito,10);
  const r=await salvar(db,c,[{chave,coletado:0,danificado:0,retirado_lista:0,observacao:''}],'coleta');assert.equal(r.atual.itens[0].nao_coletado,0);assert.equal(r.atual.itens[0].ja_no_deposito,10);
 }finally{await db.close();}
});

test('painel integrado: abas, lista conjunta, entrega parcial, impressão, coleta e histórico',async()=>{
 const express=require('express'),{chromium}=require('playwright'),db=await fixture(),app=express();let browser,server;
 try{
  await db.exec("update separacoes_pedidos set operacao='{}'");
  assert.equal((await base(db)).bloqueio,null);
  app.use(express.json());
  app.post('/__ec_rpc',async(req,res)=>{const a=req.body.args;try{
   if(req.body.nome==='pedido_fluxo_fila'){
    const etapa=(await db.query("select case when exists(select 1 from logistica_confirmacoes where etapa='coleta') then 'retorno_simultaneo' when exists(select 1 from logistica_confirmacoes where etapa='entrega') then 'coleta' else 'entrega' end etapa")).rows[0].etapa;
    const data=etapa===a.p_setor||(a.p_setor==='entregas_coletas'&&['entrega','coleta'].includes(etapa))?(await db.query('select *, $1::text fluxo_etapa,false somente_consulta from separacoes_pedidos',[etapa])).rows:[];return res.json({data,error:null});
   }
   const b=req.body.nome==='logistica_confirmacao_responsaveis'?(await db.query('select logistica_confirmacao_responsaveis($1,$2) b',[a.p_pedido,a.p_etapa])).rows[0].b:req.body.nome==='logistica_confirmacao_base'?await base(db,a.p_etapa):
   (await db.query('select logistica_confirmacao_salvar($1,$2,$3,$4,$5,$6) b',[a.p_pedido,a.p_etapa,a.p_token,JSON.stringify(a.p_itens),a.p_responsavel,a.p_observacao])).rows[0].b;res.json({data:b,error:null});}catch(e){res.json({data:null,error:{message:e.message}});}});
  app.post('/__ec_table',async(req,res)=>{const name=req.body.name;if(!['separacoes_pedidos','logistica_confirmacoes','logistica_motivos'].includes(name))return res.json({data:[],error:null});res.json({data:(await db.query('select * from '+name+' where empresa_id=$1 order by '+(name==='logistica_confirmacoes'?'versao desc':'id'),[empresa])).rows,error:null});});
  app.use(express.static(process.cwd()));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({empresa})=>{
   window.aguardarContexto=async()=>({empresa_id:empresa});window.finalizarCarregamentoModulo=()=>{};
   window.google={script:{run:{withSuccessHandler(ok){return {withFailureHandler(){return {ESC_painel(){ok({inicio:'2026-10-24',hoje:'2026-10-24',etapas:[],pessoas:[],caminhoes:[],regras:{etapas:{}}});}};}};}}}};
   window.print=()=>{window.parent.__printHtml=document.documentElement.outerHTML;};
   window.supabaseClient={rpc:(nome,args)=>fetch('/__ec_rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome,args})}).then(r=>r.json()),from:name=>{const q={select:()=>q,eq:()=>q,in:()=>q,neq:()=>q,order:()=>q,range:()=>q,then:fn=>fetch('/__ec_table',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}).then(r=>r.json()).then(fn)};return q;}};
  },{empresa});
  await page.route('**/*',r=>{const u=r.request().url();if(u==='https://example.test/responsavel.jpg')return r.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="green"/></svg>',contentType:'image/svg+xml'});return !u.startsWith(url)||((/\/js\/core\//.test(u)&&!u.includes('pedidoFluxo.js'))||/\/Chiavari\/(gas-cliente|operacao-sem-motor)\.js/.test(u))?r.fulfill({body:'',contentType:'text/javascript'}):r.continue();});
  await page.clock.setFixedTime(new Date('2026-10-24T15:00:00Z'));
  await page.goto(url+'/Modulos/Logistica/EntregasColetas/entregas-coletas.html');await page.locator('[data-operacao=entrega]').waitFor();assert.equal(await page.locator('[data-operacao=entrega]').count(),1);assert.equal(await page.locator('[data-operacao=coleta]').count(),0);assert.equal(await page.locator('#ecData').count(),0);assert.equal(await page.locator('#plAbasDias').isVisible(),true);await page.locator('[data-operacao=entrega]').click();await page.locator('#ecForm').waitFor();
  assert.equal(await page.locator('.ec-responsavel strong').textContent(),'Carlos da montagem');
  assert.equal(await page.locator('.ec-responsavel-foto img').getAttribute('src'),'https://example.test/responsavel.jpg');
  await page.getByRole('tab',{name:'Coleta',exact:true}).click();assert.equal(await page.locator('[data-operacao=coleta]').count(),0);
  await page.getByRole('tab',{name:'Entrega',exact:true}).click();await page.locator('[data-operacao=entrega]').click();await page.locator('#ecForm').waitFor();
  await page.getByRole('button',{name:'Imprimir lista de entrega'}).click();await page.waitForFunction(()=>window.__printHtml?.includes('Lista de entrega'));assert.match(await page.evaluate(()=>window.__printHtml),/ainda não confirmada/);
  await page.locator('[name=entregue]').fill('8');await page.getByRole('tab',{name:'Montagem de equipe',exact:true}).click();await page.locator('#plAbasDias button').first().waitFor();assert.equal(await page.locator('#plModuloEntregas').isVisible(),false);await page.getByRole('tab',{name:'Entrega',exact:true}).click();assert.equal(await page.locator('[name=entregue]').inputValue(),'8');await page.locator('[name=voltou_antes]').fill('2');assert.equal(await page.locator('[name=responsavel]').count(),0);
  await page.getByRole('button',{name:'Confirmar entrega',exact:true}).click();assert.match(await page.locator('#ecMensagem').textContent(),/motivo/);
  await page.locator('[name=motivo]').selectOption({label:'Devolução antecipada'});await page.getByRole('button',{name:'Confirmar entrega',exact:true}).click();await page.getByText('Entrega confirmada. Registro salvo no histórico.',{exact:true}).waitFor();
  assert.equal((await base(db)).atual.itens[0].entregue,8);
  await page.locator('[data-dia="2026-10-25"]').click();assert.equal(await page.locator('[data-operacao=entrega]').count(),0);await page.getByRole('tab',{name:'Coleta',exact:true}).click();await page.locator('[data-operacao=coleta]').click();await page.getByRole('button',{name:'Confirmar coleta',exact:true}).waitFor();assert.equal(await page.locator('#ecForm tbody .ec-num').first().textContent(),'6');assert.equal(await page.locator('[name=retirado_lista]').count(),0);
  await page.locator('[name=coletado]').fill('6');assert.equal(await page.locator('#ecForm tr.ec-coleta-completa').count(),1);await page.locator('[name=danificado]').fill('1');assert.equal(await page.locator('#ecForm tr.ec-coleta-avaria').count(),1);await page.locator('[name=coletado]').fill('4');assert.equal(await page.locator('#ecForm tr.ec-coleta-falta').count(),1);await page.locator('[name=motivo]').selectOption({label:'Avaria identificada no local'});assert.equal(await page.locator('[name=responsavel]').count(),0);
  assert.match(await page.locator('#ecForm tbody').textContent(),/Já no depósito: 4/);assert.equal(await page.locator('#ecOcorrenciasResumo').count(),0);
  await page.getByRole('button',{name:'Imprimir lista de coleta'}).click();await page.waitForFunction(()=>window.__printHtml?.includes('Lista de coleta'));assert.match(await page.evaluate(()=>window.__printHtml),/já voltou: 2/);assert.match(await page.evaluate(()=>window.__printHtml),/Com avaria/);
  await page.getByRole('button',{name:'Confirmar coleta',exact:true}).click();await page.getByText('Coleta confirmada. Registro salvo no histórico.',{exact:true}).waitFor();assert.equal((await base(db,'coleta')).atual.itens[0].nao_coletado,2);
  assert.equal(await page.locator('[data-operacao=coleta]').count(),0);
  fs.mkdirSync('.tmp',{recursive:true});await page.screenshot({path:'.tmp/entregas-coletas-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1}).slice(0,12).map(e=>({tag:e.tagName,id:e.id,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})))));await page.screenshot({path:'.tmp/entregas-coletas-mobile.png',fullPage:true});
  await page.getByRole('tab',{name:'Entrega',exact:true}).click();assert.equal(await page.locator('[data-operacao=entrega]').count(),0);
  assert.deepEqual(errors,[]);
  await page.route('**/Modulos/Chiavari/Cronograma/cronograma.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body><div class="topbar"><div class="title-wrap">Cronograma</div><div class="semana-nav">Semana</div></div><table id="cronograma-teste"><tr><td>Pedido de teste</td></tr></table></body></html>'}));
  await page.getByRole('tab',{name:'Cronograma',exact:true}).click();await page.frameLocator('#plCronogramaFrame').locator('#cronograma-teste').waitFor();assert.equal(await page.locator('#plModuloCronograma').isVisible(),true);assert.equal(await page.locator('#plModuloEntregas').isVisible(),false);assert.equal(await page.locator('#plAbasDias').isVisible(),false);
  await page.getByRole('tab',{name:'Entrega',exact:true}).click();assert.equal(await page.locator('#plModuloCronograma').isVisible(),false);assert.equal(await page.locator('#plAbasDias').isVisible(),true);
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await db.close();}
});
