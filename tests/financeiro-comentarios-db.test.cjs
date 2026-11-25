const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const emp='10000000-0000-0000-0000-000000000001',outra='10000000-0000-0000-0000-000000000002',user='20000000-0000-0000-0000-000000000001';
const id=n=>'30000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('comentários persistem na mesma conta; Comercial e Compras respeitam empresa, origem, 2FA e conflitos',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
   create function seguranca_2fa_ok() returns boolean language sql as $$select current_setting('test.segundo_fator',true) is distinct from 'nao'$$;
   create function operacao_pode(uuid,text) returns boolean language sql as $$select $2=any(string_to_array(current_setting('test.permissoes',true),','))$$;
   create function fin_pode(uuid,text) returns boolean language sql as $$select operacao_pode($1,$2)$$;
   create function almox_nome_func(uuid) returns text language sql as $$select 'Ana Teste'::text$$;
   create table empresas(id uuid primary key);
   create table separacoes_pedidos(id uuid primary key,empresa_id uuid,numero_pedido text,cliente_id uuid,cliente_nome text,tipo_evento text,data_evento date,data_evento_fim date,local_nome text,data_entrega date,data_coleta date,valor_total numeric,status_comercial text,observacoes jsonb);
   create table clientes_equipes(id uuid,empresa_id uuid,nome text);
   create table clientes_empresas(id uuid,empresa_id uuid,nome_razao text,catalogo_logo_url text);
   create table compras_registros(id uuid,empresa_id uuid,tipo text,numero int);
   create table fornecedores(id uuid,empresa_id uuid,foto_url text);
   create table fin_cartoes(id uuid,empresa_id uuid,nome text,final text);
   create table fin_cartao_faturas(id uuid,empresa_id uuid,virada date,conferida_em timestamptz);
   create table fin_fechamentos(id uuid,empresa_id uuid,referencia text,nf_numero text);
   create table fin_fechamento_parcelas(id uuid,empresa_id uuid,fechamento_id uuid,numero int);
   insert into empresas values('${emp}'),('${outra}');
   select set_config('test.uid','${user}',false);`);
  // As tabelas financeiras são as reais, sem substituir a função sob teste.
  const financeiro=fs.readFileSync('supabase/migrations/20261018000100_financeiro.sql','utf8');
  await db.exec(financeiro.slice(financeiro.indexOf('create table if not exists public.fin_contas'),financeiro.indexOf('-- updated_at')));
  const aud=financeiro.indexOf('create or replace function public.fin_auditar');
  await db.exec(financeiro.slice(aud,financeiro.indexOf('$$;',aud)+3));
  await db.exec(`alter table fin_contas add column cofre_mascaras jsonb;
   alter table fin_pagar add column cartao_id uuid,add column fatura_id uuid,add column fechamento_id uuid,add column fechamento_parcela_id uuid;
   insert into compras_registros values('${id(1)}','${emp}','pedido',1),('${id(2)}','${outra}','pedido',2),('${id(3)}','${emp}','cotacao',3);
   insert into fin_contas(id,empresa_id,nome,titular_documento,pix_chave,cofre_mascaras) values('${id(50)}','${emp}','Conta de compras','cofre:SEGREDO','cofre:PIX_SECRETO','{"titular_documento":"***123","pix_chave":"***456"}');
   insert into fin_pagar(id,empresa_id,origem,origem_id,descricao,vencimento,valor,conta_id) values
    ('${id(11)}','${emp}','compra','${id(1)}','Compra de cadeiras',current_date,100,'${id(50)}'),
    ('${id(12)}','${emp}','manual',null,'Conta particular',current_date,200,null),
    ('${id(13)}','${outra}','compra','${id(2)}','Outra empresa',current_date,300,null),
    ('${id(14)}','${emp}','compra','${id(3)}','Origem não é pedido',current_date,400,null),
    ('${id(15)}','${emp}','compra','${id(2)}','Origem de outra empresa',current_date,500,null);
   insert into fin_receber(id,empresa_id,descricao,vencimento,valor) values('${id(21)}','${emp}','Recebimento',current_date,200),('${id(22)}','${outra}','Outra empresa',current_date,300);`);
  await db.exec(fs.readFileSync('supabase/migrations/20261121001100_fin_comentarios_compras.sql','utf8'));
  const permissao=async p=>db.query("select set_config('test.permissoes',$1,false)",[p]);
  const comentar=async(tipo,conta,texto,versao=null,empresa=emp)=>(await db.query('select fin_titulo_comentar($1,$2,$3,$4,$5) r',[empresa,tipo,conta,texto,versao])).rows[0].r;
  const compras=async (empresa=emp)=>(await db.query('select compras_contas_pagar($1) r',[empresa])).rows[0].r;
  await permissao('financeiro.fluxo.visualizar');
  const r=await comentar('receber',id(21),'  Cliente pediu prorrogação\nConferir dia 25.  ');
  assert.equal(r.comentario,'Cliente pediu prorrogação\nConferir dia 25.');assert.equal(r.comentario_por,user);assert.equal(r.comentario_nome,'Ana Teste');
  const p=await comentar('pagar',id(11),'Aguardando boleto.');
  await permissao('comercial.pedidos.visualizar');
  const comercial=(await db.query('select comercial_contas_receber($1) r',[emp])).rows[0].r;
  assert.equal(comercial.length,1);assert.equal(comercial[0].comentario,r.comentario);
  const editado=await comentar('receber',id(21),'Prorrogação combinada.',r.comentario_em);
  await assert.rejects(comentar('receber',id(21),'Sobrescrever sem atualizar',r.comentario_em),/outra pessoa/);
  await assert.rejects(comentar('pagar',id(11),'Comercial não altera pagamentos',p.comentario_em),/Sem permissão/);
  await permissao('estoque.compras.visualizar');
  const lista=await compras();assert.equal(lista.length,1);assert.equal(lista[0].id,id(11));assert.equal(lista[0].comentario,p.comentario);assert.equal(lista[0].compra_numero,1);
  assert.doesNotMatch(JSON.stringify(lista),/SEGREDO|PIX_SECRETO|Conta particular|Outra empresa/);assert.equal(lista[0].conta_doc,'***123');
  const atualizado=await comentar('pagar',id(11),'Boleto recebido.',p.comentario_em);
  assert.equal((await db.query('select comentario from fin_pagar where id=$1',[id(11)])).rows[0].comentario,'Boleto recebido.');
  for(const n of [12,13,14,15])await assert.rejects(comentar('pagar',id(n),'Não pode acessar'),/Sem permissão/);
  await assert.rejects(compras(outra),/Sem acesso/);await assert.rejects(comentar('receber',id(21),'Sem permissão'),/Sem permissão/);
  const apagado=await comentar('pagar',id(11),' ',atualizado.comentario_em);assert.deepEqual(apagado,{comentario:null,comentario_por:null,comentario_nome:null,comentario_em:null});
  await permissao('financeiro.fluxo.visualizar');
  await assert.rejects(comentar('receber',id(22),'Empresa errada'),/Conta não encontrada/);
  await assert.rejects(comentar('pagar',id(11),'a'.repeat(1001)),/1000/);
  await assert.rejects(comentar('invalido',id(11),'a'),/Tipo inválido/);
  await db.exec("set test.segundo_fator='nao'");await assert.rejects(comentar('receber',id(21),'2FA ausente',editado.comentario_em),/Sem acesso/);
  await permissao('estoque.compras.visualizar');await assert.rejects(compras(),/Sem acesso/);
  await db.exec("set test.segundo_fator='sim';set test.uid=''");await assert.rejects(compras(),/Sem acesso/);
  assert.equal((await db.query('select count(*)::int n from fin_auditoria')).rows[0].n,5);
  assert.equal((await db.query("select has_function_privilege('anon','fin_titulo_comentar(uuid,text,uuid,text,timestamptz)','execute') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
