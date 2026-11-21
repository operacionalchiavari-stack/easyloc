-- Rodar SÓ DEPOIS de publicar o site (GitHub Pages) e a Vercel com o servidor antigo apagado (nov/2026).
-- Antes disso o site no ar ainda chama /api/gs, que lê estas tabelas.
--   npx supabase db query --linked -f Scripts/arquivar-planilhas-google.sql
-- Não apaga nada: as cópias das planilhas do Google vão para o schema "arquivo_google", que a API do
-- Supabase não expõe (nenhuma tela ou função usa mais). As funções que só serviam ao servidor antigo saem.
-- Para desfazer: alter table arquivo_google.<tabela> set schema public; (e recriar as funções pelo histórico do git).
begin;
create schema if not exists arquivo_google;
revoke all on schema arquivo_google from public, anon, authenticated;

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('gs_gravar', 'gs_ler_aba', 'gs_versoes', 'gs_estado', 'gs_cache_ler', 'almox_col') loop
    execute 'drop function ' || f;
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['gs_linhas', 'gs_abas', 'gs_planilhas', 'gs_propriedades', 'gs_cache'] loop
    if to_regclass('public.' || t) is not null then execute format('alter table public.%I set schema arquivo_google', t); end if;
  end loop;
end $$;

-- gs_eh_da_equipe e gs_aba_protegida ficam (são das regras de leitura das tabelas arquivadas); gs_empresa_dona é usada pelo sistema todo.
commit;
