const fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
const empresa='10000000-0000-0000-0000-000000000001',cliente='50000000-0000-0000-0000-000000000001',item='20000000-0000-0000-0000-000000000001';
async function fixture(){
 const source=fs.readFileSync('tests/fluxo-unico-pedidos.test.cjs','utf8'),code=source.slice(source.indexOf('async function fixture(){'),source.indexOf('\nasync function criar('));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const db=await new AsyncFunction('fs','path','PGlite','empresa','cliente','__dirname',code+';return fixture();')(fs,path,PGlite,empresa,cliente,path.resolve('tests'));
 await db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 create function fin_conta_cliente_extrato(p_empresa uuid,p_cliente uuid default null) returns jsonb language sql as $$select '{"pedidos":[],"pagamentos":[],"creditos":[]}'::jsonb$$;` .replace('create function fin_conta_cliente_extrato','create or replace function fin_conta_cliente_extrato'));
 await db.exec(`create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('test.role',true),''),'authenticated')$$;
 create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text);insert into supabase_migrations.schema_migrations values('20261024001100');`);
 await db.exec(`alter table itens add column codigo text;create table if not exists gs_linhas(planilha_id text,aba text,linha integer,valores jsonb);create or replace function gs_eh_da_equipe() returns boolean language sql as $$select true$$;`);
 for(const file of ['20261024000900_acervo_inventario_evidencias.sql','20261024001000_compensacoes_resultados.sql','20261024001100_paineis_acervo.sql','20261024001200_sincronizacao_backup.sql','20261024001300_acervo_liberacao_fisica.sql','20261024001400_integridade_creditos_inventario.sql','20261024001500_acervo_painel_visual.sql','20261024001600_acervo_os_validacao.sql','20261024001700_acervo_os_pedido.sql','20261024001800_acervo_prazo_carregamento.sql','20261024001900_acervo_historico_origem.sql','20261024002000_inventario_controle_qualidade.sql','20261024002100_acervo_operacao_real.sql','20261024002200_monitoramento_backup.sql','20261024002300_backup_exportacao_eficiente.sql','20261024002400_backup_em_lotes.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec('create table if not exists operacao_etapas(id uuid default gen_random_uuid(),empresa_id uuid,pedido_id uuid,tipo text,data date,hora time)');
 return db;
}
module.exports={fixture,empresa,cliente,item};
