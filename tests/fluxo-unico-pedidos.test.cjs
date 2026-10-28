const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
const empresa='10000000-0000-0000-0000-000000000001',item='20000000-0000-0000-0000-000000000001',cliente='50000000-0000-0000-0000-000000000001';
async function fixture(){
 const source=fs.readFileSync('tests/operacao-integrada-db.cjs','utf8'),prefix=source.slice(source.indexOf('  const db = new PGlite();'),source.indexOf("  const empresa='"));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const db=await new AsyncFunction('PGlite','fs','path','__dirname',prefix+'return db;')(PGlite,fs,path,__dirname);
 await db.exec(`alter table separacoes_pedidos add column pre_reserva_ate date,add column finalizado_em timestamptz,add column finalizado_por uuid;
 alter table itens add column produto text,add column descricao_total text,add column tipo text,add column valor_reposicao numeric,add column foto_url text;
 create table clientes_empresas(id uuid primary key,empresa_id uuid,nome_razao text);insert into clientes_empresas values('${cliente}','${empresa}','Decoradora');
 create or replace function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${empresa}'::uuid$$;
 create or replace function funcionario_pode(uuid,uuid,text) returns boolean language sql as $$select coalesce(current_setting('test.negar',true),'')<>'sim'$$;`);
 for(const file of ['20261021000500_conferencia_quantidades.sql','20261021000600_conferencia_observacoes.sql','20261023004100_fluxo_setores_pedido.sql','20261023004200_fluxo_inicio_leitura.sql','20261024000100_confirmacoes_entrega_coleta.sql','20261024000200_entrega_confirmacao_independente.sql','20261024000400_coleta_ocorrencias_evento.sql','20261024000500_motivos_entrega_coleta.sql','20261018000100_financeiro.sql','20261021002000_conta_cliente_creditos.sql','20261024000600_fin_posicao_final.sql','20261024000700_fluxo_unico_pedidos.sql','20261024000800_comercial_fluxo_pedidos.sql','20261027000100_painel_logistico_sequencia.sql','20261027000700_expedicao_apos_separacao.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 return db;
}
async function criar(db,status='aprovado'){
 const payload={empresa_id:empresa,cliente_id:cliente,numero_pedido:'001',cliente_nome:'Decoradora',status_comercial:status,data_evento:'2026-10-24',data_entrega:'2026-10-24',valor_total:1000,observacoes:{itens_comerciais:[{item_id:item,quantidade_solicitada:10,valor_locacao:100,valor_reposicao:500}]}};
 return (await db.query('select pedido_salvar_integrado($1,$2,$3,$4) p',[null,payload,[{item_id:item,item_nome:'Cadeira',quantidade_solicitada:10}],null])).rows[0].p;
}
const fila=async(db,setor)=>(await db.query('select pedido_fluxo_fila($1,$2) f',[empresa,setor])).rows[0].f;
const base=async(db,id,etapa)=>(await db.query('select logistica_confirmacao_base($1,$2) b',[id,etapa])).rows[0].b;
async function confirmar(db,id,etapa){const b=await base(db,id,etapa);return (await db.query('select logistica_confirmacao_salvar($1,$2,$3,$4,$5,$6) b',[id,etapa,b.token,b.itens.map(i=>({chave:i.chave,...(etapa==='entrega'?{entregue:i.previsto,voltou_antes:0}:{coletado:i.previsto,danificado:0}),retirado_lista:0})),'Equipe',''])).rows[0].b;}
async function conferencia(db,p,etapa){const pcs=(await db.query('select * from operacao_conferencia_pecas($1)',[p.id])).rows;return db.query('select operacao_concluir_conferencia($1,$2,false,$3)',[p.id,etapa,Object.fromEntries(pcs.map(i=>[i.chave,i.esperado]))]);}
test('fluxo único: orçamento oculto, pré-reserva opcional e consulta sem execução',async()=>{
 const db=await fixture();try{
  const orc=await criar(db,'orcamento'),pre=await criar(db,'pre_reserva');
  for(const s of ['triagem','expedicao','montagem_equipe','entrega','coleta','posicao_final'])assert.equal((await fila(db,s)).length,0);
  await db.query('select pedido_fluxo_configurar($1,true,true)',[empresa]);
  for(const s of ['triagem','montagem_equipe']){const f=await fila(db,s);assert.equal(f.length,1);assert.equal(f[0].id,pre.id);assert.equal(f[0].somente_consulta,true);}
  assert.equal((await fila(db,'expedicao')).length,0);
  assert.equal((await base(db,pre.id,'entrega')).somente_consulta,true);
  assert.equal((await fila(db,'montagem_equipe')).length,1);assert.equal((await fila(db,'entrega')).length,0);assert.equal((await fila(db,'entregas_coletas')).length,0);assert.equal((await fila(db,'coleta')).length,0);await assert.rejects(base(db,orc.id,'entrega'),/não disponível/);
  await assert.rejects(confirmar(db,pre.id,'entrega'),/Etapa atual: pre_reserva/);
  await assert.rejects(db.query("update separacoes_pedidos set status='em_separacao' where id=$1",[pre.id]),/indisponível/);
  await assert.rejects(db.query('update separacoes_itens set quantidade_separada=1 where separacao_pedido_id=$1',[pre.id]),/indisponível/);
  await db.exec("set test.negar='sim'");await assert.rejects(db.query('select pedido_fluxo_configurar($1,false,false)',[empresa]),/permissão/);await db.exec("set test.negar=''");
  await assert.rejects(db.query('select pedido_fluxo_fila($1,$2)',['10000000-0000-0000-0000-000000000002','entrega']),/acesso/);
  await db.query("update separacoes_pedidos set pre_reserva_ate='2020-01-01' where id=$1",[pre.id]);assert.equal((await fila(db,'triagem')).length,0);assert.equal((await fila(db,'entrega')).length,0);assert.equal((await fila(db,'montagem_equipe')).length,0);
 }finally{await db.close();}
});
for(const simultaneo of [true,false])test('fluxo completo: retorno '+(simultaneo?'simultâneo, Triagem termina primeiro':'sequencial, descarregamento primeiro'),async()=>{
 const db=await fixture();try{
  await db.query('select pedido_fluxo_configurar($1,false,$2)',[empresa,simultaneo]);const p=await criar(db);
  assert.equal((await fila(db,'triagem')).length,1);assert.equal((await fila(db,'expedicao')).length,0);assert.equal((await fila(db,'entrega')).length,0);assert.equal((await fila(db,'coleta')).length,0);
  await assert.rejects(confirmar(db,p.id,'entrega'),/Etapa atual: triagem/);
  await db.query('update separacoes_itens set quantidade_separada=10 where separacao_pedido_id=$1',[p.id]);await db.query("update separacoes_pedidos set status='separado' where id=$1",[p.id]);
  assert.equal((await fila(db,'triagem')).length,0);assert.equal((await fila(db,'expedicao')).length,1);
  assert.equal((await fila(db,'montagem_equipe')).length,1);await conferencia(db,p,'carregamento');assert.equal((await fila(db,'montagem_equipe')).length,0);assert.equal((await fila(db,'expedicao')).length,0);assert.equal((await fila(db,'entrega')).length,1);
  await assert.rejects(confirmar(db,p.id,'coleta'),/Etapa atual: entrega/);
  await confirmar(db,p.id,'entrega');assert.equal((await fila(db,'entrega')).length,0);assert.equal((await fila(db,'coleta')).length,1);
  await confirmar(db,p.id,'coleta');assert.equal((await fila(db,'coleta')).length,0);assert.equal((await fila(db,'expedicao')).length,1);assert.equal((await fila(db,'triagem')).length,simultaneo?1:0);
  await assert.rejects(db.query('select fin_posicao_final_salvar($1,$2,$3,0,$4,true)',[empresa,p.id,'',[]]),/descarregamento e a Triagem/);
  if(simultaneo){await conferencia(db,p,'retorno');assert.equal((await fila(db,'triagem')).length,0);assert.equal((await fila(db,'expedicao')).length,1);assert.equal((await fila(db,'posicao_final')).length,0);await conferencia(db,p,'descarregamento');}
  else{await assert.rejects(conferencia(db,p,'retorno'),/modo sequencial/);await conferencia(db,p,'descarregamento');assert.equal((await fila(db,'expedicao')).length,0);assert.equal((await fila(db,'triagem')).length,1);await conferencia(db,p,'retorno');}
  assert.equal((await fila(db,'expedicao')).length,0);assert.equal((await fila(db,'triagem')).length,0);assert.equal((await fila(db,'posicao_final')).length,1);
  const atual=(await db.query('select status_operacional from separacoes_pedidos where id=$1',[p.id])).rows[0];assert.equal(atual.status_operacional,'retornado');
  const fin=(await db.query('select fin_posicao_final_base($1,$2) b',[empresa,p.id])).rows[0].b;
  const fechado=(await db.query('select fin_posicao_final_salvar($1,$2,$3,0,$4,true) b',[empresa,p.id,fin.fonte,[]])).rows[0].b;assert.equal(fechado.salvo.status,'confirmado');
  const resumo=(await db.query('select comercial_fluxo_pedidos($1,$2) f',[empresa,[p.id]])).rows[0].f;assert.equal(resumo[0].etapa,'posicao_final');assert.equal(resumo[0].finalizado,true);
 }finally{await db.close();}
});

test('parâmetros: salvar visibilidade das pré-reservas e modo de retorno pela interface',async()=>{
 const db=await fixture(),express=require('express'),{chromium}=require('playwright'),app=express();let server,browser;
 try{
  app.use(express.json());app.get('/__fluxo',(_req,res)=>res.send('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/Modulos/Configuracoes/Parametros/parametros.css"></head><body style="font-family:Arial;background:#f3f5f6"><div id="parametrosPagina"><div id="host" class="pr-card"></div></div><script src="/Modulos/Configuracoes/Parametros/parametros-fluxo-pedidos.js"></script></body></html>'));
  app.post('/__fluxo',async(req,res)=>{try{
   const a=req.body;let data;if(a.read)data=(await db.query('select * from empresa_fluxo_pedidos where empresa_id=$1',[empresa])).rows[0]||null;
   else await db.query('select pedido_fluxo_configurar($1,$2,$3)',[a.p_empresa,a.p_pre_reservas,a.p_retorno_simultaneo]);res.json({data,error:null});
  }catch(e){res.json({data:null,error:{message:e.message}});}});app.use(express.static(process.cwd()));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1400,height:900}});
  await page.goto('http://127.0.0.1:'+server.address().port+'/__fluxo');await page.evaluate(async empresa=>{
   const send=async body=>(await fetch('/__fluxo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
   window.supabaseClient={rpc:(_nome,args)=>send(args),from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:()=>send({read:true})};return q;}};
   await carregarFluxoPedidos(document.getElementById('host'),empresa);
  },empresa);
  assert.equal(await page.locator('[name=pre]').isChecked(),false);await page.locator('[name=pre]').check();await page.locator('[name=retorno]').selectOption('sequencial');await page.getByRole('button',{name:'Salvar fluxo'}).click();await page.getByText('Fluxo salvo. As filas passam a seguir estas regras.').count();
  await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.startsWith('Fluxo salvo.'));
  const cfg=(await db.query('select * from empresa_fluxo_pedidos')).rows[0];assert.equal(cfg.pre_reservas_consulta,true);assert.equal(cfg.retorno_simultaneo,false);
  await page.screenshot({path:'.tmp/parametros-fluxo-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.tmp/parametros-fluxo-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await db.close();}
});
