-- As regras de acesso das tabelas da operação chamavam funcionario_pode(..., auth.uid(), ...), que a
-- equipe logada não pode executar (fechada na revisão de segurança) — toda leitura daria
-- "permission denied". Troca por operacao_pode(empresa, chave), que só confere a pessoa logada.
create or replace function public.operacao_pode(p_empresa uuid, p_chave text) returns boolean
language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and funcionario_pode(p_empresa, auth.uid(), p_chave)
$$;
revoke all on function public.operacao_pode(uuid, text) from public, anon;
grant execute on function public.operacao_pode(uuid, text) to authenticated;

do $$
declare p record; q text; c text; sql text;
begin
  for p in select * from pg_policies where schemaname = 'public'
              and coalesce(qual, '') || coalesce(with_check, '') like '%funcionario_pode%' loop
    q := regexp_replace(p.qual, 'funcionario_pode\((.+?), auth\.uid\(\), ', 'operacao_pode(\1, ', 'g');
    c := regexp_replace(p.with_check, 'funcionario_pode\((.+?), auth\.uid\(\), ', 'operacao_pode(\1, ', 'g');
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    sql := format('create policy %I on %I.%I as %s for %s to %s', p.policyname, p.schemaname, p.tablename,
                  p.permissive, p.cmd, array_to_string(p.roles, ','));
    if q is not null then sql := sql || ' using (' || q || ')'; end if;
    if c is not null then sql := sql || ' with check (' || c || ')'; end if;
    execute sql;
  end loop;
end $$;
