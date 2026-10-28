-- Retira acessos, RPCs e processamento automático da assistente descontinuada.
-- O conteúdo histórico fica inativo, sem acesso pelos usuários da aplicação.
begin;
delete from public.permissoes_catalogo where chave='ia.lia.usar';
drop trigger if exists tg_gerar_embedding on public.ia_conhecimento;
drop function if exists public.fn_chamar_embedding();
do $$
declare f record;
begin
 for f in select p.oid::regprocedure assinatura from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('ia_buscar_dados','ia_buscar_dados_teste','buscar_conhecimento_semantico','rag_buscar_conhecimento') loop
  execute format('drop function %s',f.assinatura);
 end loop;
end $$;
revoke all on public.ia_conhecimento,public.ia_fontes_dados from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
