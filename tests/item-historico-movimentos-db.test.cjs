// 15/11/2026: histórico do item só com movimentações; retorno com divergência espera a Gestão do acervo;
// implantação/compra identificadas; responsável com id.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),{PGlite}=require('@electric-sql/pglite');
const empresa='10000000-0000-0000-0000-000000000001',item='20000000-0000-0000-0000-000000000001',pedido='30000000-0000-0000-0000-000000000001',usuario='50000000-0000-0000-0000-000000000001';
async function fixture(){const db=new PGlite();await db.exec(`
create role anon;create role authenticated;create schema auth;
create table auth.users(id uuid primary key,email text);insert into auth.users values('${usuario}','ana@empresa.com');
create function auth.uid() returns uuid language sql as $$select '${usuario}'::uuid$$;
create function auth.jwt() returns jsonb language sql as $$select '{"email":"ana@empresa.com"}'::jsonb$$;
create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${empresa}'::uuid$$;
create function operacao_pode(uuid,text) returns boolean language sql as $$select true$$;
create function funcionario_tabela_permitida(uuid,text,text) returns boolean language sql as $$select true$$;
create function seguranca_2fa_ok() returns boolean language sql as $$select true$$;
create table empresas(id uuid primary key);insert into empresas values('${empresa}');
create table usuarios_empresas(user_id uuid,empresa_id uuid);insert into usuarios_empresas values('${usuario}','${empresa}');
create table usuarios(id uuid primary key,nome text);
create table funcionarios_acesso(id uuid primary key,empresa_id uuid,nome text,email text);insert into funcionarios_acesso values('${usuario}','${empresa}','Ana Souza','ana@empresa.com');
create table itens(id uuid primary key,empresa_id uuid,tipo text,produto text,descricao_total text,estoque_total numeric,estoque_manutencao numeric default 0,grupo_separacao text);
insert into itens values('${item}','${empresa}','Item','Cadeira','Cadeira',10,0,'Cadeiras');
create table kit_itens(empresa_id uuid,kit_id uuid,item_id uuid,quantidade numeric);
create table separacoes_pedidos(id uuid primary key,empresa_id uuid,numero_pedido text,cliente_nome text,operacao jsonb);
create table separacoes_etiquetas(id uuid default gen_random_uuid(),empresa_id uuid,separacao_pedido_id uuid,item_id uuid,lida_carregamento_em timestamptz,lida_retorno_em timestamptz,lida_descarregamento_em timestamptz);
create table logistica_confirmacoes(id uuid default gen_random_uuid(),empresa_id uuid,pedido_id uuid,etapa text,itens jsonb,versao int,responsavel text,criado_em timestamptz default now());
create table operacao_ocorrencias(id uuid default gen_random_uuid(),empresa_id uuid,item_id uuid,pedido_id uuid,tipo text,etapa text,quantidade numeric,descricao text,resolvida_em timestamptz,resolucao text,criado_em timestamptz default now(),
 esperado numeric,conferido numeric,segunda_contagem numeric,resolvido_por uuid,resolvido_por_nome text,resultado text);
create table acervo_contagens_gerais(id uuid default gen_random_uuid(),empresa_id uuid,item_id uuid,status text,esperado numeric,contado numeric,contado_em timestamptz,contado_por_nome text);
create table acervo_inventarios(id uuid,empresa_id uuid,status text,nome text,aprovado_em timestamptz);
create table acervo_inventario_itens(inventario_id uuid,empresa_id uuid,item_id uuid,saldo_base numeric,contado numeric,motivo text,contado_em timestamptz);
create table acervo_retornos(id uuid,empresa_id uuid,item_id uuid,pedido_id uuid,quantidade numeric,tipo text);
create table acervo_historico(id uuid default gen_random_uuid(),empresa_id uuid,retorno_id uuid,estado text,motivo text,criado_em timestamptz default now());
create table compras_registros(id uuid default gen_random_uuid(),empresa_id uuid,numero int,tipo text,dados jsonb,created_at timestamptz default now());
insert into separacoes_pedidos values('${pedido}','${empresa}','7','Decoradora X',null);
`);
 await db.exec(fs.readFileSync('supabase/migrations/20261103001700_item_historico_quantidades.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261115001100_item_historico_movimentos_grupos.sql','utf8'));
 await db.exec(`create function itens_estoque_implantacao(p uuid,q numeric) returns void language plpgsql as $$begin update itens set estoque_total=q where id=p;end$$;
  create function compras_receber_locacao(p uuid,q numeric) returns void language plpgsql as $$begin update itens set estoque_total=estoque_total+q where id=p;end$$;`);
 return db;}
const ler=async db=>(await db.query('select item_historico_quantidades_ler($1,$2,null,100) d',[empresa,item])).rows[0].d.registros;

test('grupo de separação existente vira cadastro',async()=>{const db=await fixture();try{
 const r=await db.query('select nome from separacao_grupos');assert.deepEqual(r.rows.map(x=>x.nome),['Cadeiras']);
}finally{await db.close();}});

test('implantação e compra identificadas, com responsável',async()=>{const db=await fixture();try{
 await db.query('select itens_estoque_implantacao($1,40)',[item]);
 await db.query('select compras_receber_locacao($1,5)',[item]);
 const h=await ler(db);
 const imp=h.find(r=>r.tipo==='implantacao'),cmp=h.find(r=>r.tipo==='entrada_compra'&&r.origem==='compras');
 assert.ok(imp&&Number(imp.variacao)===30,'implantação');assert.ok(cmp&&Number(cmp.variacao)===5,'compra');
 assert.equal(cmp.responsavel_usuario,usuario);assert.equal(cmp.responsavel_nome,'Ana Souza');
}finally{await db.close();}});

test('retorno com divergência só movimenta depois da Gestão do acervo; conferência não aparece',async()=>{const db=await fixture();try{
 await db.query(`update separacoes_pedidos set operacao='{"carregamento":{"concluido_em":"2026-11-10T08:00:00Z","por":"Exp","itens":[{"item_id":"${item}","conferido":10,"esperado":10}]}}' where id=$1`,[pedido]);
 await db.query(`insert into operacao_ocorrencias(empresa_id,item_id,pedido_id,tipo,etapa,quantidade,esperado,conferido) values($1,$2,$3,'falta','retorno',2,10,8)`,[empresa,item,pedido]);
 await db.query(`update separacoes_pedidos set operacao=operacao||'{"retorno":{"concluido_em":"2026-11-12T08:00:00Z","por":"Triagem","itens":[{"item_id":"${item}","conferido":8,"esperado":10}]}}' where id=$1`,[pedido]);
 let h=await ler(db);
 assert.ok(h.some(r=>r.tipo==='saida_evento'&&Number(r.variacao)===-10),'saída');
 assert.ok(!h.some(r=>/retorno/.test(r.tipo)),'retorno espera a Gestão do acervo');
 assert.ok(!h.some(r=>r.tipo.startsWith('conferencia_')||r.tipo.startsWith('divergencia_')),'conferência/divergência não é movimento');
 // Gestão do acervo: 1 apareceu no galpão, 1 perdida (2ª contagem 9 de 10)
 await db.query(`update operacao_ocorrencias set resolvida_em=now(),resultado='continua',segunda_contagem=9,resolvido_por=$1,resolvido_por_nome='Ana Souza'`,[usuario]);
 h=await ler(db);
 const ret=h.filter(r=>r.tipo==='retorno_evento');
 assert.equal(ret.length,1);assert.equal(Number(ret[0].variacao),9);assert.equal(ret[0].origem,'gestao_acervo');
 assert.equal(ret[0].detalhes.conferido_gestao_acervo,true);assert.equal(Number(ret[0].detalhes.perda),1);assert.equal(ret[0].pedido_cliente,'Decoradora X');
}finally{await db.close();}});

test('retorno sem divergência entra direto',async()=>{const db=await fixture();try{
 await db.query(`update separacoes_pedidos set operacao='{"carregamento":{"concluido_em":"2026-11-10T08:00:00Z","por":"Exp","itens":[{"item_id":"${item}","conferido":4,"esperado":4}]},"retorno":{"concluido_em":"2026-11-12T08:00:00Z","por":"Triagem","itens":[{"item_id":"${item}","conferido":4,"esperado":4}]}}' where id=$1`,[pedido]);
 const h=await ler(db);assert.ok(h.some(r=>r.tipo==='retorno_evento'&&Number(r.variacao)===4&&r.origem==='retorno'));
}finally{await db.close();}});
