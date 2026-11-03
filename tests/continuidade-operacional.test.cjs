const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture,empresa,cliente,item}=require('./helpers/ciclo-fixture.cjs');
async function preparar(db){
 const p=(await db.query("insert into separacoes_pedidos(empresa_id,numero_pedido,cliente_id,cliente_nome,status_comercial,status,valor_total,data_evento,operacao) values($1,'90009',$2,'Cliente','aprovado','separado',1000,'2026-10-24',$3) returning id",[empresa,cliente,{carregamento:{concluido_em:'2026-10-24'}}])).rows[0].id;
 await db.query("select set_config('app.pedido_salvar','sim',false)");await db.query('insert into separacoes_itens(empresa_id,separacao_pedido_id,item_id,item_nome,quantidade_solicitada,quantidade_separada) values($1,$2,$3,$4,10,10)',[empresa,p,item,'Cadeira']);await db.query("select set_config('app.pedido_salvar','nao',false)");
 const b=(await db.query("select logistica_confirmacao_base($1,'entrega') b",[p])).rows[0].b;
 return {p,args:{p_pedido:p,p_etapa:'entrega',p_token:b.token,p_itens:b.itens.map(i=>({chave:i.chave,entregue:i.previsto,voltou_antes:0,retirado_lista:0})),p_responsavel:'Maria da equipe',p_observacao:''}};
}
const enviar=async(db,id,a)=>(await db.query('select logistica_confirmacao_enviar($1,$2,$3,$4,$5,$6,$7) b',[id,a.p_pedido,a.p_etapa,a.p_token,JSON.stringify(a.p_itens),a.p_responsavel,a.p_observacao])).rows[0].b;

test('fotos: vinculo com item, autor, empresa e reenvio preservados',async()=>{const db=await fixture();try{
 const {p,args}=await preparar(db),id=crypto.randomUUID(),path=empresa+'/'+p+'/'+id+'.jpg',chave=args.p_itens[0].chave;
 const registrar=(c=chave)=>db.query("select logistica_evidencia_registrar($1,$2,$3,'entrega',$4,$5,'Foto no evento')",[id,empresa,p,c,path]);
 await assert.rejects(registrar(),/Envie a foto/);await db.query("insert into storage.objects(bucket_id,name) values('evidencias-operacionais',$1)",[path]);
 await assert.rejects(registrar('outro item'),/pertence/);await registrar();await registrar();
 assert.equal((await db.query('select count(*)::int n from logistica_evidencias')).rows[0].n,1);assert.equal((await db.query('select criado_por_nome from logistica_evidencias')).rows[0].criado_por_nome,'teste@local');
 await assert.rejects(registrar('outro item'),/utilizada/);
 assert.equal((await db.query('select logistica_evidencia_acesso($1,false) b',[path])).rows[0].b,true);
 assert.equal((await db.query('select logistica_evidencia_acesso($1,false) b',[path.replace(empresa,'10000000-0000-0000-0000-000000000002')])).rows[0].b,false);
}finally{await db.close();}});
test('sincronização: reenvio confirmado é idempotente e conteúdo diferente é recusado',async()=>{const db=await fixture();try{
 const {args}=await preparar(db),id=crypto.randomUUID(),a=await enviar(db,id,args),b=await enviar(db,id,args);assert.deepEqual(a,b);assert.equal((await db.query('select count(*)::int n from logistica_confirmacoes')).rows[0].n,1);
 await assert.rejects(enviar(db,id,{...args,p_responsavel:'Outro conteúdo'}),/outro conteúdo/);
}finally{await db.close();}});
test('backup: acesso restrito, cifras autenticadas e restauração real com conferência de registros',async()=>{const db=await fixture();try{
 const {cifrar,decifrar,restaurarVerificar}=require('../Scripts/backup-operacional.cjs');await assert.rejects(db.query('select sistema_backup_exportar()'),/restrito/);
 await db.exec("set test.role='service_role'");const snapshot=(await db.query('select sistema_backup_exportar() b')).rows[0].b,key=crypto.randomBytes(32),raw=Buffer.from(JSON.stringify(snapshot)),cipher=cifrar(raw,key);
 assert.equal(decifrar(cipher,key).toString(),raw.toString());const corrompido=Buffer.from(cipher);corrompido[corrompido.length-1]^=1;assert.throws(()=>decifrar(corrompido,key));
 const r=await restaurarVerificar(snapshot);assert.equal(r.verificado,true);assert.equal(r.tabelas,snapshot.tabelas.length);assert.ok(r.registros>0);
 const estrutura=(await db.query('select sistema_backup_estrutura() b')).rows[0].b;
 for(const t of estrutura.tabelas){for(let de=0;;de+=2){const linhas=(await db.query('select sistema_backup_linhas($1,$2,$3,2) b',[t.esquema,t.tabela,de])).rows[0].b;t.linhas.push(...linhas);if(linhas.length<2)break;}assert.deepEqual(t.linhas,snapshot.tabelas.find(x=>x.esquema===t.esquema&&x.tabela===t.tabela).linhas);}
 assert.equal((await restaurarVerificar(estrutura)).verificado,true);
 await assert.rejects(db.query("select sistema_backup_linhas('pg_catalog','pg_roles')"),/inválido/);
 await db.exec("set test.role='authenticated'");await assert.rejects(db.query('select sistema_backup_estrutura()'),/restrito/);await assert.rejects(db.query("select sistema_backup_linhas('public','itens')"),/restrito/);
}finally{await db.close();}});
test('offline no navegador: guarda cifrado, recarrega e sincroniza sem duplicar após perda de resposta',async()=>{
 const express=require('express'),{chromium}=require('playwright'),db=await fixture(),app=express();let server,browser;
 try{
  const {args}=await preparar(db);let perderResposta=true;app.use(express.json());
  app.get('/Modulos/Logistica/PainelLogistico/offline.html',(_req,res)=>res.send('<!doctype html><html><head><meta charset="utf-8"><title>Operação offline</title></head><body><p id="ecMensagem"></p><script src="/js/core/operacaoOffline.js"></script><script src="/js/core/context.js"></script><script src="/js/core/permissions.js"></script></body></html>'));
  app.post('/__envio',async(req,res)=>{try{const data=await enviar(db,req.body.p_id,req.body);if(perderResposta){perderResposta=false;res.destroy();return;}res.json({data,error:null});}catch(e){res.json({data:null,error:{message:e.message}});}});app.use(express.static(process.cwd()));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext(),page=await context.newPage();
  await context.addInitScript(({empresa})=>{localStorage.setItem('easyloc-auth',JSON.stringify({user:{id:'u1'},expires_at:1}));sessionStorage.setItem('login_ok','1');sessionStorage.setItem('empresa_id',empresa);window.sb={auth:{getSession:async()=>({data:{session:navigator.onLine?{user:{id:'u1'}}:null}}),getUser:async()=>({data:{user:{id:'u1'}}}),onAuthStateChange:()=>{}},from:()=>{const q={};q.select=()=>q;q.eq=()=>q;q.single=async()=>({data:{nome:'Empresa'}});return q;},rpc:(_nome,args)=>_nome==='funcionario_contexto'?Promise.resolve(navigator.onLine?{data:{ativo:true}}:{error:{message:'network offline'}}):_nome==='get_permissoes_usuario_resolvidas'?Promise.resolve({data:[{chave:'logistica.expedicao.visualizar',permitido:true}]}):fetch('/__envio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)}).then(r=>r.json())};window.supabaseClient=window.sb;window.ctx={empresa_id:empresa,usuario_nome:'Maria'};},{empresa});
  const url='http://127.0.0.1:'+server.address().port;await page.goto(url+'/Modulos/Logistica/PainelLogistico/offline.html');await page.evaluate(()=>OperacaoOffline.init(sb,ctx));await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(async()=>{const c=await caches.open('acervo-operacao-estatica-v1');return !!(await c.match(location.href));});
  await context.setOffline(true);const pendente=await page.evaluate(args=>OperacaoOffline.confirmar(args,[]),args);assert.equal(pendente.pendente,true);
  await page.reload();await page.waitForFunction(()=>window.__ACESSO_OPERACAO_OFFLINE?.ativo).catch(async e=>{console.error('Diagnostico offline',await page.evaluate(async()=>{let acesso;try{acesso=await OperacaoOffline.acessoLocal(sb,ctx.empresa_id);}catch(e){acesso=e.message;}return {url:location.href,offline:!navigator.onLine,acesso,contexto:window.__CONTEXT,texto:document.body.innerText.slice(0,600)};}));throw e;});await page.evaluate(()=>OperacaoOffline.init(sb,ctx));assert.equal(await page.locator('#permissionDeniedNotice').count(),0);assert.match(await page.locator('#operacaoOffline').innerText(),/1 conferência/);
  await context.setOffline(false);await page.evaluate(()=>OperacaoOffline.sincronizar());await page.evaluate(()=>OperacaoOffline.sincronizar());await page.waitForFunction(()=>document.getElementById('operacaoOffline').hidden);
  assert.equal((await db.query('select count(*)::int n from logistica_confirmacoes')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from logistica_envios')).rows[0].n,1);
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await db.close();}
});
