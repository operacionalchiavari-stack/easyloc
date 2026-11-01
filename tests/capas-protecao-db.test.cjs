const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
async function fixture(){const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function eh_membro_empresa(uuid) returns boolean language sql stable as $$select $1='${id(1)}'::uuid and auth.uid() in ('${id(10)}','${id(11)}')$$;
 create function seguranca_2fa_ok() returns boolean language sql stable as $$select coalesce(current_setting('test.twofa',true),'on')='on'$$;
 create function operacao_pode(uuid,text) returns boolean language sql stable as $$select eh_membro_empresa($1) and auth.uid()='${id(10)}'::uuid$$;
 create function funcionario_tabela_permitida(uuid,text,text) returns boolean language sql stable as $$select eh_membro_empresa($1) and ($3='select' or auth.uid()='${id(10)}'::uuid)$$;
 create table empresas(id uuid primary key);insert into empresas values('${id(1)}'),('${id(2)}');
 create table itens(id uuid primary key,empresa_id uuid,produto text,descricao_total text,tipo text,foto_url text);
 create table kit_itens(kit_id uuid,item_id uuid,quantidade numeric);
 create table separacoes_pedidos(id uuid primary key,empresa_id uuid,numero_pedido text,pedido_origem_id uuid,status text default 'em_separacao',operacao jsonb default '{}',encerrado_operacional_em timestamptz);
 create table separacoes_itens(id uuid primary key,separacao_pedido_id uuid,item_id uuid,quantidade_solicitada numeric,item_nome text);
 create function pedido_grupo(uuid) returns uuid[] language sql as $$select array_agg(x.id) from separacoes_pedidos x where x.id=$1 or x.pedido_origem_id=$1$$;
 create function operacao_validar_etapa(separacoes_pedidos,text) returns void language plpgsql as $$begin if $2 not in ('carregamento','descarregamento','retorno') then raise exception 'Etapa inválida';end if;end$$;
 create function separacao_meus_setores(uuid) returns jsonb language sql as $$select null::jsonb$$;
 create function separacao_setor_item(uuid) returns text language sql as $$select 'Estoque'::text$$;
 select set_config('test.uid','${id(10)}',false);
 insert into itens values('${id(20)}','${id(1)}','Cadeira','Cadeira','item',null),('${id(21)}','${id(1)}','Kit','Kit','kit',null),('${id(22)}','${id(1)}','Mesa','Mesa','item',null),('${id(23)}','${id(2)}','Outro','Outro','item',null);
 insert into kit_itens values('${id(21)}','${id(20)}',2);
 insert into separacoes_pedidos(id,empresa_id,numero_pedido,pedido_origem_id) values('${id(30)}','${id(1)}','1',null),('${id(31)}','${id(1)}','1/2','${id(30)}'),('${id(32)}','${id(2)}','Outro',null);
 insert into separacoes_itens values('${id(40)}','${id(30)}','${id(20)}',5,'Cadeira'),('${id(41)}','${id(30)}','${id(21)}',2,'Kit'),('${id(42)}','${id(31)}','${id(20)}',2,'Cadeira'),('${id(43)}','${id(30)}','${id(22)}',1,'Mesa');
 `);
 const native=fs.readFileSync('supabase/migrations/20261029001900_pedido_extra.sql','utf8');await db.exec(native.slice(native.indexOf('create or replace function public.operacao_conferencia_pecas('),native.indexOf('grant execute on function public.operacao_conferencia_pecas(')));
 await db.exec(fs.readFileSync('supabase/migrations/20261101000200_capas_protecao.sql','utf8'));
 const m=(await db.query('select capas_configurar($1,$2,true,2,null) m',[id(1),id(20)])).rows[0].m;
 return {db,m};}
const lista=async(db,etapa,pedido=id(30))=>(await db.query('select capas_pedido($1,$2) l',[pedido,etapa])).rows[0].l;
const contar=async(db,etapa,q,d=0,pedido=id(30))=>{const r=(await lista(db,etapa,pedido)).find(r=>r.usa_capa);return (await db.query('select capas_contagem_salvar($1,$2,$3) l',[pedido,etapa,[{chave:r.chave,quantidade:q,danificadas:d,observacao:'Contagem física',versao:r.versao}]])).rows[0].l;};
const concluir=async(db,etapa,pedido=id(30))=>db.query("update separacoes_pedidos set operacao=jsonb_set(operacao,array[$2],jsonb_build_object('concluido_em',clock_timestamp())) where id=$1",[pedido,etapa]);
const saldo=async(db,m)=>(await db.query('select capas_saldo($1) s',[m.id])).rows[0].s;
async function automacaoFixture(){
 const f=await fixture(),{db}=f;await db.query('delete from separacoes_itens where separacao_pedido_id=$1',[id(31)]);
 await db.exec(`
  create table itens_fotos(item_id uuid,url text,cliente_id uuid,ordem integer,slot text);
  create table separacoes_etiquetas(separacao_pedido_id uuid,item_id uuid,lida_carregamento_em timestamptz);
  alter table separacoes_pedidos add column cliente_nome text,add column status_comercial text,add column finalizado_em timestamptz;
  create table operacao_ocorrencias(id uuid primary key default gen_random_uuid(),empresa_id uuid,pedido_id uuid,item_id uuid,codigo text,tipo text,quantidade numeric,descricao text,etapa text,esperado numeric,conferido numeric,resolvida_em timestamptz,criado_em timestamptz default now());
  create table acervo_retornos(id uuid primary key default gen_random_uuid(),empresa_id uuid,pedido_id uuid,item_id uuid,tipo text,quantidade numeric,estado text,criado_em timestamptz default now());
  create table qualidade_inspecoes(id uuid primary key default gen_random_uuid(),empresa_id uuid,item_id uuid,dados jsonb,criado_em timestamptz default now());
  create table operacao_etapas(id uuid primary key,empresa_id uuid,pedido_id uuid,nome text,tipo text,data date,hora time,origem text default 'pedido');
  create table operacao_apontamentos(id uuid primary key,empresa_id uuid,etapa_id uuid,inicio timestamptz);
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20261101000300_material_protecao_tipo.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261101000400_ocorrencias_automaticas.sql','utf8'));
 return f;
}
const painel=async db=>(await db.query('select ocorrencias_painel($1) p',[id(1)])).rows[0].p;
async function ampliadaFixture(){
 const f=await automacaoFixture(),{db}=f;
 await db.exec(`
  alter table separacoes_pedidos add column data_entrega date,add column data_coleta date,add column observacoes jsonb default '{}';
  alter table operacao_apontamentos add column fim timestamptz;
  alter table acervo_retornos add column chave text;
  create table acervo_contagens_gerais(id uuid primary key,empresa_id uuid,item_id uuid,status text,esperado numeric,contado numeric,concluida_em timestamptz,contado_em timestamptz);
  create table logistica_confirmacoes(id uuid primary key default gen_random_uuid(),empresa_id uuid,pedido_id uuid,etapa text,versao integer default 1,criado_em timestamptz default now(),responsavel text,itens jsonb default '[]');
  create table empresa_logistica_regras(empresa_id uuid primary key,carregamento_sem_programacao boolean default false);
  create table operacao_etapa_pessoas(id uuid primary key default gen_random_uuid(),empresa_id uuid,etapa_id uuid,nome text);
  create table operacao_etapa_caminhoes(empresa_id uuid,etapa_id uuid,caminhao_id uuid);
  create table operacao_registros(id uuid primary key default gen_random_uuid(),empresa_id uuid,etapa_id uuid,tipo text,dados jsonb default '{}',criado_em timestamptz default now());
  create table free_vagas(id uuid primary key,empresa_id uuid,etapa_id uuid,status text default 'ABERTA',horario text,quantidade integer default 2);
  create table free_inscricoes(id uuid primary key,empresa_id uuid,vaga_id uuid,nome text,status text default 'CONFIRMADO',checkin_em timestamptz,checkout_em timestamptz);
  create table operacao_trocas(id uuid primary key,empresa_id uuid,etapa_id uuid,item text,quantidade integer,motivo text,descricao text,foto_url text,status text,solicitado_em timestamptz default now(),enviado_em timestamptz);
  create table operacao_alertas_motorista(id uuid primary key,empresa_id uuid,pedido_id uuid,problema text,observacao text,status text,criado_em timestamptz default now(),resolvido_em timestamptz,resolucao text);
  create table acervo_inventarios(id uuid primary key,empresa_id uuid,nome text,status text,aprovado_em timestamptz);
  create table acervo_inventario_itens(inventario_id uuid,empresa_id uuid,item_id uuid,saldo_base numeric,contado numeric,motivo text);
  create table posvenda_contatos(id uuid primary key,empresa_id uuid,cliente_nome text,status text,atencao boolean,respostas jsonb,concluido_em timestamptz);
  create table posvenda_contato_pedidos(contato_id uuid,pedido_id uuid);
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20261101000500_ocorrencias_operacionais_ampliadas.sql','utf8'));
 await db.query("update separacoes_pedidos set status_comercial='aprovado' where empresa_id=$1",[id(1)]);
 return f;
}
test('ampliadas: entrega/coleta, horarios validos, ultima versao e janela do retorno',async()=>{
 const {db}=await ampliadaFixture();try{
  await db.query("update separacoes_pedidos set data_entrega=current_date-2,data_coleta=current_date-2,observacoes='{\"horario_entrega\":\"09:00\",\"horario_coleta\":\"17:00\"}' where id=$1",[id(30)]);
  assert.ok((await painel(db)).some(c=>c.tipo==='confirmacao_entrega_atrasada'));
  await db.query("insert into logistica_confirmacoes(empresa_id,pedido_id,etapa,itens,criado_em) values($1,$2,'entrega',$3,now()-interval '30 hours')",[id(1),id(30),[{item_id:id(20),nome:'Cadeira',previsto:5,entregue:3,nao_entregue:2}]]);
  const falta=(await painel(db)).find(c=>c.tipo==='entrega_incompleta');assert.equal(falta.quantidade,2);
  await db.query("insert into logistica_confirmacoes(empresa_id,pedido_id,etapa,versao,itens) values($1,$2,'entrega',2,$3)",[id(1),id(30),[{item_id:id(20),nome:'Cadeira',previsto:5,entregue:5,nao_entregue:0}]]);
  assert.equal((await painel(db)).find(c=>c.id===falta.id).status,'resolvida');
  await db.query("insert into logistica_confirmacoes(empresa_id,pedido_id,etapa,itens,criado_em) values($1,$2,'coleta',$3,now()-interval '30 hours')",[id(1),id(30),[{item_id:id(20),nome:'Cadeira',previsto:5,coletado:4,nao_coletado:1}]]);
  let casos=await painel(db);assert.ok(casos.some(c=>c.tipo==='coleta_incompleta'));assert.ok(casos.some(c=>c.tipo==='retorno_pendente'));
  await db.query("update separacoes_pedidos set data_entrega=current_date+2,observacoes='{\"horario_entrega\":\"inválido\"}' where id=$1",[id(30)]);
  await painel(db); // horário inválido não quebra a operação.
  assert.equal((await db.query("select ocorrencia_numero('NaN') n,ocorrencia_uuid('invalido') u,ocorrencia_instante('amanha') t")).rows[0].n,null);
 }finally{await db.close();}
});
test('ampliadas: escala, checklists, evidencias, presenca e encerramento sem prazo inventado',async()=>{
 const {db}=await ampliadaFixture();try{
  await db.query("insert into operacao_etapas(id,empresa_id,pedido_id,nome,tipo,data,hora) values($1,$2,$3,'Montagem','montagem',current_date-1,'09:00'),($4,$2,$3,'Carga','carregamento',current_date-1,'08:00')",[id(610),id(1),id(30),id(611)]);
  let casos=await painel(db);assert.ok(casos.some(c=>c.tipo==='equipe_sem_escala'));assert.ok(casos.some(c=>c.tipo==='caminhao_sem_escala'));
  await db.query("insert into operacao_etapa_pessoas(empresa_id,etapa_id,nome) values($1,$2,'Equipe')",[id(1),id(610)]);
  await db.query("insert into operacao_apontamentos(id,empresa_id,etapa_id,inicio,fim) values($1,$2,$3,now()-interval '4 hours',now()-interval '1 hour')",[id(612),id(1),id(610)]);
  assert.ok((await painel(db)).some(c=>c.tipo==='checklist_incompleto'));
  await db.query("insert into operacao_registros(empresa_id,etapa_id,tipo,dados) values($1,$2,'equipe','{\"foto\":\"\",\"chegada\":{\"localStatus\":\"FORA_DO_LOCAL\"}}'),($1,$2,'posicionamento','{\"correto\":false}'),($1,$2,'uniformizacao','{\"valor\":\"NAO\"}')",[id(1),id(610)]);
  casos=await painel(db);for(const tipo of ['evidencia_ausente','chegada_fora_area','posicionamento_incorreto','uniforme_reprovado'])assert.ok(casos.some(c=>c.tipo===tipo),tipo);
  await db.query("insert into free_vagas(id,empresa_id,etapa_id,horario) values($1,$2,$3,'09:00')",[id(613),id(1),id(610)]);
  await db.query("insert into free_inscricoes(id,empresa_id,vaga_id,nome) values($1,$2,$3,'Pessoa')",[id(614),id(1),id(613)]);
  assert.ok((await painel(db)).some(c=>c.tipo==='checkin_ausente'));
  await db.query("update free_inscricoes set checkin_em=now()-interval '4 hours' where id=$1",[id(614)]);
  casos=await painel(db);assert.equal(casos.find(c=>c.tipo==='checkin_ausente').status,'resolvida');assert.ok(casos.some(c=>c.tipo==='checkout_ausente'));
  await db.query('update free_inscricoes set checkout_em=now() where id=$1',[id(614)]);
  assert.equal((await painel(db)).find(c=>c.tipo==='checkout_ausente').status,'resolvida');
  assert.ok(!(await painel(db)).some(c=>c.tipo==='atraso_termino'));
 }finally{await db.close();}
});
test('ampliadas: transporte, trocas, inventario e feedback operacional sem confundir comercial',async()=>{
 const {db}=await ampliadaFixture();try{
  await db.query("insert into operacao_alertas_motorista(id,empresa_id,pedido_id,problema,observacao,status) values($1,$2,$3,'Pneu','Troca necessária','ABERTO')",[id(620),id(1),id(30)]);
  assert.ok((await painel(db)).some(c=>c.tipo==='alerta_motorista'&&c.status==='aberta'));
  await db.query("update operacao_alertas_motorista set resolvido_em=now(),resolucao='Resolvido' where id=$1",[id(620)]);
  assert.equal((await painel(db)).find(c=>c.tipo==='alerta_motorista').status,'resolvida');
  await db.query("insert into operacao_etapas(id,empresa_id,pedido_id,nome,tipo,data) values($1,$2,$3,'Montagem','montagem',current_date)",[id(621),id(1),id(30)]);
  await db.query("insert into operacao_trocas(id,empresa_id,etapa_id,item,quantidade,motivo,status) values($1,$2,$3,'Cadeira',1,'Dano','PENDENTE')",[id(622),id(1),id(621)]);
  assert.ok((await painel(db)).some(c=>c.tipo==='troca_solicitada'));
  await db.query("insert into acervo_inventarios values($1,$2,'Contagem','contagem',null)",[id(623),id(1)]);
  await db.query("insert into acervo_inventario_itens values($1,$2,$3,10,8,'Conferido')",[id(623),id(1),id(20)]);
  assert.ok(!(await painel(db)).some(c=>c.tipo==='divergencia_inventario'));
  await db.query("update acervo_inventarios set status='aprovado',aprovado_em=now() where id=$1",[id(623)]);
  assert.equal((await painel(db)).find(c=>c.tipo==='divergencia_inventario').quantidade,2);
  await db.query("insert into posvenda_contatos values($1,$2,'Cliente','concluido',true,$3,now())",[id(624),id(1),[{id:'atendimento',ruim:true},{id:'entrega',pergunta:'Entrega',ruim:true,respostas:['Teve problema']}]]);
  assert.equal((await painel(db)).filter(c=>c.tipo==='feedback_operacional_negativo').length,1);
  await assert.rejects(db.query('select ocorrencias_painel($1)',[id(2)]),/Sem acesso/);
 }finally{await db.close();}
});
test('ampliadas: conferencia visual, danos, contagem de desmontagem, estoque e estabilidade',async()=>{
 const {db,m}=await ampliadaFixture();try{
  await db.query("insert into operacao_etapas(id,empresa_id,pedido_id,nome,tipo,data) values($1,$2,$3,'Montagem','montagem',current_date),($4,$2,$3,'Desmontagem','desmontagem',current_date)",[id(630),id(1),id(30),id(631)]);
  const visual={lista:[{chave:'s',item_id:id(20),nome:'Cadeira',esperado:5}],itens:{s:{entregue:3,danificados:1,observacao:'Avaria'}}};
  await db.query('insert into operacao_registros(empresa_id,etapa_id,tipo,dados) values($1,$2,$3,$4)',[id(1),id(630),'conferencia_entrega',visual]);
  let casos=await painel(db);assert.ok(casos.some(c=>c.tipo==='entrega_incompleta'&&c.quantidade===2));assert.ok(casos.some(c=>c.tipo==='avaria_entrega'&&c.quantidade===1));
  await db.query("insert into logistica_confirmacoes(empresa_id,pedido_id,etapa,itens) values($1,$2,'entrega',$3)",[id(1),id(30),[{item_id:id(20),nome:'Cadeira',entregue:5,nao_entregue:0}]]);
  casos=await painel(db);assert.ok(casos.some(c=>c.tipo==='divergencia_entrega'&&c.quantidade===2));assert.equal(casos.filter(c=>c.tipo==='entrega_incompleta'&&c.status==='aberta').length,0);
  await contar(db,'triagem',5);await db.query("update separacoes_pedidos set status='separado' where id=$1",[id(30)]);
  await db.query("insert into qualidade_inspecoes(empresa_id,item_id,dados,criado_em) values($1,$2,'{\"status\":\"Reprovado\"}',now()-interval '1 hour')",[id(1),id(20)]);
  await contar(db,'carregamento',5);await concluir(db,'carregamento');
  await db.query("update separacoes_pedidos set operacao=jsonb_set(operacao,'{carregamento,itens}',$2) where id=$1",[id(30),[{item_id:id(20),conferido:5}]]);
  assert.ok((await painel(db)).some(c=>c.tipo==='envio_reprovado'));
  assert.ok((await painel(db)).some(c=>c.tipo==='estoque_material_sem_contagem'));
  await db.query("update separacoes_pedidos set operacao=operacao-'carregamento' where id=$1",[id(30)]);
  await mover(db,m,'inventario',0);await contar(db,'carregamento',5);await concluir(db,'carregamento');
  assert.ok((await painel(db)).some(c=>c.tipo==='estoque_material_negativo'&&c.status==='aberta'));
  await contar(db,'retorno',4);await concluir(db,'retorno');
  await db.query("update separacoes_pedidos set operacao=jsonb_set(operacao,'{retorno,itens}',$2) where id=$1",[id(30),[{chave:'s',item_id:id(20),nome:'Cadeira',conferido:4}]]);
  await db.query('insert into operacao_registros(empresa_id,etapa_id,tipo,dados) values($1,$2,$3,$4)',[id(1),id(631),'contagem_itens',{itens:{s:5}}]);
  casos=await painel(db);assert.ok(casos.some(c=>c.tipo==='divergencia_desmontagem_retorno'&&c.quantidade===1));
  const eventos=(await db.query('select count(*)::int n from operacao_casos_eventos')).rows[0].n;await painel(db);
  assert.equal((await db.query('select count(*)::int n from operacao_casos_eventos')).rows[0].n,eventos);
 }finally{await db.close();}
});
test('ampliadas: coleta corrigida por chave, sem duplicar itens e sem apagar perda confirmada',async()=>{
 const {db}=await ampliadaFixture();try{
  await db.query("insert into acervo_retornos(empresa_id,pedido_id,item_id,chave,tipo,quantidade,estado) values($1,$2,$3,'a','falta',1,'investigacao'),($1,$2,$3,'b','falta',2,'investigacao')",[id(1),id(30),id(20)]);
  await db.query("insert into logistica_confirmacoes(empresa_id,pedido_id,etapa,itens) values($1,$2,'coleta',$3)",[id(1),id(30),[{chave:'a',item_id:id(20),nome:'Cadeira',nao_coletado:1},{chave:'b',item_id:id(20),nome:'Cadeira',nao_coletado:2}]]);
  let faltas=(await painel(db)).filter(c=>c.origem==='acervo'&&c.tipo==='falta');assert.equal(faltas.reduce((n,c)=>n+c.quantidade,0),3);
  await db.query("update acervo_retornos set estado='baixado' where chave='b'");
  await db.query("insert into logistica_confirmacoes(empresa_id,pedido_id,etapa,versao,itens) values($1,$2,'coleta',2,$3)",[id(1),id(30),[{chave:'a',item_id:id(20),nome:'Cadeira',nao_coletado:0},{chave:'b',item_id:id(20),nome:'Cadeira',nao_coletado:0}]]);
  faltas=(await painel(db)).filter(c=>c.origem==='acervo'&&c.tipo==='falta');assert.equal(faltas.filter(c=>c.status==='resolvida').length,1);assert.equal(faltas.filter(c=>c.status==='perda_confirmada').length,1);
  await db.query("insert into acervo_contagens_gerais values($1,$2,$3,'concluida',10,8,now(),now())",[id(640),id(1),id(20)]);
  assert.equal((await painel(db)).find(c=>c.tipo==='divergencia_contagem_geral').quantidade,2);
 }finally{await db.close();}
});
test('automaticas: rascunho, saida insuficiente, retorno sem duplicidade, correcao e separacao dos moveis',async()=>{
 const {db}=await automacaoFixture();try{
  await contar(db,'triagem',4);assert.equal((await painel(db)).length,0);
  await db.query('update separacoes_pedidos set status=$1 where id=$2',['separado',id(30)]);
  await contar(db,'carregamento',4);assert.equal((await painel(db)).length,0);await concluir(db,'carregamento');
  let casos=await painel(db);assert.equal(casos.filter(c=>c.tipo==='protecao_insuficiente').length,1);
  await contar(db,'descarregamento',2);await concluir(db,'descarregamento');
  let falta=(await painel(db)).find(c=>c.origem==='materiais'&&c.tipo==='falta');assert.equal(falta.quantidade,2);
  const casoId=falta.id;
  await contar(db,'retorno',2);await concluir(db,'retorno');casos=await painel(db);
  assert.equal(casos.filter(c=>c.origem==='materiais'&&c.tipo==='falta').length,1);
  assert.equal(casos.find(c=>c.tipo==='falta').id,casoId);
  assert.equal((await db.query('select count(*)::int n from operacao_ocorrencias')).rows[0].n,0);
  await db.query("update separacoes_pedidos set operacao=operacao-'retorno' where id=$1",[id(30)]);
  assert.equal((await painel(db)).find(c=>c.id===casoId).status,'em_revisao');
  await contar(db,'retorno',4);await concluir(db,'retorno');
  assert.equal((await painel(db)).find(c=>c.id===casoId).status,'resolvida');
  assert.equal((await db.query('select count(*)::int n from operacao_casos_automaticos where chave=$1',[falta.chave])).rows[0].n,1);
  const antes=(await db.query('select count(*)::int n from operacao_casos_eventos')).rows[0].n;await painel(db);assert.equal((await db.query('select count(*)::int n from operacao_casos_eventos')).rows[0].n,antes);
  const historico=(await db.query('select ocorrencias_evidencias($1,$2) h',[id(1),casoId])).rows[0].h;assert.ok(historico.length>=3);
  assert.equal((await db.query("select has_function_privilege('anon','public.ocorrencias_painel(uuid)','execute') p")).rows[0].p,false);
 }finally{await db.close();}
});
test('automaticas: protecao aplicada, permissao, isolamento e tratamento de avaria por lote',async()=>{
 const {db,m}=await automacaoFixture();try{
  await contar(db,'triagem',5);await db.query('update separacoes_pedidos set status=$1 where id=$2',['separado',id(30)]);
  await contar(db,'carregamento',5);let r=(await lista(db,'carregamento')).find(r=>r.usa_capa);
  await db.query('select capas_contagem_salvar($1,$2,$3)',[id(30),'carregamento',[{chave:r.chave,quantidade:5,danificadas:0,versao:r.versao,protecao_aplicada:false}]]);
  await concluir(db,'carregamento');assert.ok((await painel(db)).some(c=>c.tipo==='sem_protecao'));
  await mover(db,m,'fabricacao',10);
  await contar(db,'retorno',5,2);await concluir(db,'retorno');
  let avaria=(await painel(db)).find(c=>c.tipo==='avaria');assert.equal(avaria.status,'encaminhada');
  const contagem=(await db.query("select id from capas_contagens where etapa='retorno' and pedido_id=$1",[id(30)])).rows[0].id;
  await db.query("select material_movimentar($1,$2,'reparo',2,current_date,'Reparo do lote',$3,null,$4)",[id(1),m.id,id(500),contagem]);
  assert.equal((await painel(db)).find(c=>c.id===avaria.id).status,'resolvida');
  await assert.rejects(db.query("select material_movimentar($1,$2,'reparo',1,current_date,'Reparo extra',$3,null,$4)",[id(1),m.id,id(501),contagem]),/lote/);
  await assert.rejects(db.query('select ocorrencias_painel($1)',[id(2)]),/Sem acesso/);
  await db.exec("select set_config('test.twofa','off',false)");await assert.rejects(painel(db),/Sem acesso/);
  await db.exec("select set_config('test.twofa','on',false);select set_config('test.uid','',false)");await assert.rejects(painel(db),/Sem acesso/);
 }finally{await db.close();}
});
test('automaticas: moveis agregados, qualidade, atraso e cancelamento',async()=>{
 const {db}=await automacaoFixture();try{
  await contar(db,'retorno',0);
  await db.query("update separacoes_pedidos set operacao=jsonb_build_object('retorno',jsonb_build_object('concluido_em',now())) where id=$1",[id(30)]);
  await db.query("insert into operacao_ocorrencias(empresa_id,pedido_id,item_id,codigo,tipo,quantidade,descricao,etapa) values($1,$2,$3,'a','falta',1,'Faltou','retorno'),($1,$2,$3,'b','falta',2,'Faltou','retorno'),($1,$2,$3,'d','falta',3,'Faltou','descarregamento')",[id(1),id(30),id(20)]);
  let casos=await painel(db);assert.equal(casos.filter(c=>c.origem==='conferencia').length,1);assert.equal(casos.find(c=>c.origem==='conferencia').quantidade,3);
  await db.query("insert into qualidade_inspecoes(empresa_id,item_id,dados,criado_em) values($1,$2,'{\"status\":\"Reprovado\"}',now()-interval '1 hour')",[id(1),id(20)]);
  assert.ok((await painel(db)).some(c=>c.tipo==='reprovacao'&&c.status==='aberta'));
  await db.query("insert into qualidade_inspecoes(empresa_id,item_id,dados) values($1,$2,'{\"status\":\"Aprovado\"}')",[id(1),id(20)]);
  assert.equal((await painel(db)).find(c=>c.tipo==='reprovacao').status,'resolvida');
  await contar(db,'carregamento',5);await concluir(db,'carregamento');
  await db.query("update separacoes_pedidos set operacao=jsonb_set(operacao,'{carregamento,itens}',$2) where id=$1",[id(30),[{item_id:id(22),conferido:1}]]);
  assert.ok((await painel(db)).some(c=>c.tipo==='revisao_sem_registro'&&c.item_id===id(22)));
  await db.query("insert into operacao_etapas(id,empresa_id,pedido_id,nome,tipo,data,hora) values($1,$2,$3,'Montagem','montagem',current_date-1,'10:00')",[id(600),id(1),id(30)]);
  assert.ok((await painel(db)).some(c=>c.tipo==='atraso_inicio'&&c.status==='aberta'));
  await db.query("update operacao_etapas set data=current_date+1 where id=$1",[id(600)]);
  assert.equal((await painel(db)).find(c=>c.tipo==='atraso_inicio').status,'resolvida');
  await db.query("update separacoes_pedidos set status_comercial='cancelado' where id=$1",[id(30)]);
  assert.equal((await painel(db)).find(c=>c.origem==='conferencia').status,'cancelada');
 }finally{await db.close();}
});
test('material: tipo e nome fixos, fotos do item e preservacao de saldo',async()=>{
 const {db,m}=await fixture();try{
  await mover(db,m,'fabricacao',10);
  await db.exec('create table itens_fotos(item_id uuid,url text,cliente_id uuid,ordem integer,slot text)');
  await db.exec(fs.readFileSync('supabase/migrations/20261101000300_material_protecao_tipo.sql','utf8'));
  const configurar=async(tipo)=>(await db.query('select material_protecao_configurar($1,$2,$3,2) m',[id(1),id(20),tipo])).rows[0].m;
  let caixa=await configurar('caixa');assert.equal(caixa.nome,'Caixa Cadeira');assert.equal(caixa.id,m.id);
  assert.equal((await saldo(db,m)).disponivel,10);
  await db.query('update capas_modelos set nome=$1 where id=$2',['Nome livre',m.id]);
  assert.equal((await db.query('select nome from capas_modelos where id=$1',[m.id])).rows[0].nome,'Caixa Cadeira');
  await db.query('update itens set descricao_total=$1 where id=$2',['Cadeira nova',id(20)]);
  assert.equal((await db.query('select nome from capas_modelos where id=$1',[m.id])).rows[0].nome,'Caixa Cadeira nova');
  assert.equal((await configurar('capa')).nome,'Capa Cadeira nova');
  assert.equal((await configurar('nenhum')).usa_capa,false);
  await assert.rejects(configurar('outro'),/Selecione/);
  await db.query('insert into itens_fotos values($1,$2,null,1,$3)',[id(20),'https://example.com/item.jpg','detalhe']);
  const lista=(await db.query('select capas_estoque($1) l',[id(1)])).rows[0].l;
  assert.equal(lista.find(x=>x.id===m.id).foto_url,'https://example.com/item.jpg');
 }finally{await db.close();}
});
const mover=async(db,m,tipo,q,chave=90,pedido=null)=>db.query("select capas_movimentar($1,$2,$3,$4,current_date,'Registro conferido',$5,$6)",[id(1),m.id,tipo,q,id(chave),pedido]);
test('capas: capacidade agrupa o mesmo modelo, usa componentes reais e separa os extras',async()=>{const {db}=await fixture();try{
 let l=await lista(db,'triagem');assert.equal(l.length,2);const c=l.find(x=>x.usa_capa);assert.equal(c.pecas,9);assert.equal(c.esperado,5);assert.equal(c.chaves.length,2);assert.equal(l.find(x=>x.item_id===id(22)).configurado,false);
 await db.query('select capas_configurar($1,$2,false,1,null)',[id(1),id(22)]);assert.equal((await lista(db,'triagem')).find(x=>x.item_id===id(22)).configurado,true);
 await assert.rejects(db.query('select capas_configurar($1,$2,true,1,null)',[id(1),id(21)]),/componentes/);
 l=await lista(db,'retorno');assert.equal(l.filter(x=>x.usa_capa).length,2);assert.equal(l.find(x=>x.pedido_id===id(31)).esperado,null);
 }finally{await db.close();}});
test('capas: falta não bloqueia conclusão, ida e volta são independentes e estoque não duplica recebimento',async()=>{const {db,m}=await fixture();try{
 await mover(db,m,'inventario',20);await mover(db,m,'fabricacao',3,91);assert.equal((await saldo(db,m)).disponivel,23);
 await assert.rejects(db.exec(`update separacoes_pedidos set status='separado' where id='${id(30)}'`),/contagem de capas/);
 await contar(db,'triagem',4);await db.exec(`update separacoes_pedidos set status='separado' where id='${id(30)}'`);
 await contar(db,'carregamento',3);await concluir(db,'carregamento');assert.equal((await saldo(db,m)).disponivel,20);
 await contar(db,'carregamento',1,0,id(31));await concluir(db,'carregamento',id(31));
 let r=(await lista(db,'descarregamento')).find(x=>x.pedido_id===id(30));assert.equal(r.esperado,3);assert.equal(r.enviadas,3);assert.equal(r.previsto_saida,5);
 await contar(db,'descarregamento',1);await contar(db,'descarregamento',1,0,id(31));await concluir(db,'descarregamento');assert.equal((await saldo(db,m)).disponivel,19);
 await contar(db,'retorno',1,1);await contar(db,'retorno',1,0,id(31));await concluir(db,'retorno');let s=await saldo(db,m);assert.equal(s.disponivel,20);assert.equal(s.manutencao,1);assert.equal(s.em_pedidos,2);
 await concluir(db,'retorno');assert.deepEqual(await saldo(db,m),s);
 await mover(db,m,'perda_pedido',2,92,id(30));assert.equal((await saldo(db,m)).disponivel,20);assert.equal((await saldo(db,m)).em_pedidos,0);
 await mover(db,m,'reparo',1,93);assert.equal((await saldo(db,m)).disponivel,21);assert.equal((await saldo(db,m)).manutencao,0);
 await assert.rejects(contar(db,'retorno',2),/concluída/);
 }finally{await db.close();}});
test('capas: histórico conserva mudanças, fabricação tem data real e movimentos são idempotentes',async()=>{const {db,m}=await fixture();try{
 await contar(db,'triagem',2);await contar(db,'triagem',3);await contar(db,'triagem',3);
 await assert.rejects(db.query('select capas_contagem_salvar($1,$2,$3)',[id(30),'triagem',[{chave:id(30)+'|'+id(20),quantidade:9,versao:0}]]),/outra pessoa/);assert.equal((await lista(db,'triagem')).find(x=>x.usa_capa).quantidade,3);
 assert.equal((await db.query("select count(*)::int n from capas_historico where acao='contagem'")).rows[0].n,2);
 await mover(db,m,'fabricacao',5);await mover(db,m,'fabricacao',5);assert.equal((await saldo(db,m)).disponivel,5);assert.ok((await saldo(db,m)).ultima_fabricacao);
 await db.exec(`update separacoes_pedidos set status='separado' where id='${id(30)}'`);await contar(db,'carregamento',2);await concluir(db,'carregamento');
 await db.query('select capas_configurar($1,$2,true,10,null)',[id(1),id(20)]);assert.equal((await lista(db,'retorno')).find(x=>x.pedido_id===id(30)).capacidade,2);
 await db.exec(`update separacoes_pedidos set operacao=operacao-'carregamento' where id='${id(30)}'`);assert.equal((await saldo(db,m)).disponivel,5);
 }finally{await db.close();}});
test('capas: permissões, empresa, números inválidos, campos não enviados e falha atômica',async()=>{const {db,m}=await fixture();try{
 await assert.rejects(db.query('select capas_pedido($1,$2)',[id(32),'triagem']),/acesso/);
 await assert.rejects(db.query('select capas_configurar($1,$2,true,1,null)',[id(1),id(23)]),/encontrado/);
 await assert.rejects(contar(db,'triagem',-1),/inteiras/);await assert.rejects(contar(db,'triagem',1,2),/danificada/);
 await assert.rejects(db.query('select capas_contagem_salvar($1,$2,$3)',[id(30),'triagem',[{chave:id(30)+'|'+id(20),quantidade:3},{chave:'inexistente',quantidade:1}]]),/fora deste pedido/);assert.equal((await lista(db,'triagem')).find(x=>x.usa_capa).quantidade,null);
 await db.exec(`create or replace function separacao_meus_setores(uuid) returns jsonb language sql as $$select '["Outro setor"]'::jsonb$$;`);await assert.rejects(contar(db,'triagem',1),/outro setor/);await db.exec(`create or replace function separacao_meus_setores(uuid) returns jsonb language sql as $$select null::jsonb$$;`);
 await db.exec(`select set_config('test.uid','${id(11)}',false);set role authenticated;`);assert.ok((await lista(db,'triagem')).length);await assert.rejects(contar(db,'triagem',1),/permissão/);await assert.rejects(mover(db,m,'fabricacao',5),/permissão/);await assert.rejects(db.query('update capas_modelos set unidades_por_capa=1'),/permission denied/);
 await db.exec(`reset role;select set_config('test.uid','${id(10)}',false);select set_config('test.twofa','off',false);`);await assert.rejects(contar(db,'triagem',1),/permissão|acesso/);
 }finally{await db.close();}});
