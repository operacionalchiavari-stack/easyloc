const fs=require('node:fs'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite(),company='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002',person='20000000-0000-0000-0000-000000000001';try{
 await db.exec(`create schema auth;create function auth.uid() returns uuid language sql as $$select '${person}'::uuid$$;
 create function eh_membro_empresa(uuid) returns boolean language sql as $$select true$$;create function funcionario_tabela_permitida(uuid,text,text) returns boolean language sql as $$select true$$;
 create function acervo_ordens_legado(uuid) returns jsonb language sql as $$select '[]'::jsonb$$;
 create table funcionarios_acesso(id uuid,empresa_id uuid,nome text,email text,foto_url text);
 create table acervo_os(id uuid,empresa_id uuid,numero bigint,item_id uuid,quantidade numeric,setor text,fluxo jsonb,status text,prazo date,criado_em timestamptz,concluido_em timestamptz,solicitante_nome text,responsavel text,versao int,retorno_id uuid,historico jsonb,criado_por uuid);
 create table itens(id uuid,empresa_id uuid,produto text,foto_url text);create table acervo_retornos(id uuid,empresa_id uuid,motivo text,origem text,pedido_id uuid);create table separacoes_pedidos(id uuid,empresa_id uuid,numero_pedido text);
 insert into funcionarios_acesso values('${person}','${company}','Jonatan Falck','antigo@exemplo.com','https://example.com/pessoa.jpg'),('20000000-0000-0000-0000-000000000002','${other}','Outra empresa','semcadastro@exemplo.com','https://example.com/errada.jpg');
 insert into itens values('${person}','${company}','Mesa','https://example.com/item.jpg');insert into acervo_retornos values('${person}','${company}','Dano','inventario',null);
 insert into acervo_os(id,empresa_id,numero,item_id,quantidade,setor,fluxo,status,criado_em,solicitante_nome,retorno_id,criado_por) values('${person}','${company}',1,'${person}',1,'Solda','["Solda"]','aberta',now(),'login@exemplo.com','${person}','${person}');`);
 const source=fs.readFileSync('supabase/migrations/20261024002100_acervo_operacao_real.sql','utf8'),start=source.indexOf('create function public.acervo_ordens('),end=source.indexOf('end $$;',start)+7;await db.exec(source.slice(start,end));
 await db.exec(fs.readFileSync('supabase/migrations/20261116103100_acervo_os_solicitante.sql','utf8'));
 const read=async()=> (await db.query('select acervo_ordens($1) dados',[company])).rows[0].dados[0];let o=await read();assert.equal(o.solicitante,'Jonatan Falck');assert.equal(o.solicitante_foto,'https://example.com/pessoa.jpg');
 await db.query("update acervo_os set criado_por=null,solicitante_nome='ANTIGO@exemplo.com'");o=await read();assert.equal(o.solicitante,'Jonatan Falck');
 await db.query("update acervo_os set solicitante_nome='semcadastro@exemplo.com'");o=await read();assert.equal(o.solicitante,'Colaborador não identificado');assert.equal(o.solicitante_foto,'');
 await db.query("update acervo_os set solicitante_nome='Pessoa sem cadastro'");assert.equal((await read()).solicitante,'Pessoa sem cadastro');
 console.log('OK: nome/foto por autor e e-mail antigo, isolamento por empresa e ausência de e-mail na apresentação.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
