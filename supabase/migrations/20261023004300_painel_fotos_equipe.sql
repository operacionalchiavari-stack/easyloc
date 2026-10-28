create or replace function public.operacao_pessoas() returns jsonb language sql stable security definer set search_path=public as $$
  select case when eh_membro_empresa(gs_empresa_dona()) then
    coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'foto_url', f.foto_url, 'equipe', f.equipe_operacional, 'lider', f.lider_operacao, 'free', false) order by f.nome)
       from funcionarios_acesso f where f.empresa_id = gs_empresa_dona() and f.ativo and f.equipe_operacional is not null), '[]')
    || coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'foto_url', c.foto_url, 'equipe', 'free', 'lider', false, 'free', true) order by c.nome)
       from free_cadastros c where c.empresa_id = gs_empresa_dona() and c.status = 'aprovado'), '[]')
  else '[]'::jsonb end
$$;
grant execute on function public.operacao_pessoas() to authenticated;

