-- Nomes de quem contou/registrou (para o histórico e a contagem do Almoxarifado novo).
create or replace function public.almox_nomes(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(x, public.almox_nome_func(x)), '{}'::jsonb)
    from unnest(coalesce(p_ids, '{}')) x
   where public.almox_tw_pode('Acessar almoxarifado')
     and (exists (select 1 from public.usuarios_empresas ue where ue.user_id = x and ue.empresa_id = public.almox_empresa())
          or exists (select 1 from public.funcionarios_acesso f where f.id = x and f.empresa_id = public.almox_empresa()))
$$;
