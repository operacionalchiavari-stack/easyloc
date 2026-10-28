create table public.pedido_logistica_parametros (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.pedido_logistica_parametros enable row level security;
create policy pedido_logistica_parametros_ler on public.pedido_logistica_parametros
  for select to authenticated using (public.eh_membro_empresa(empresa_id));
create policy pedido_logistica_parametros_gravar on public.pedido_logistica_parametros
  for all to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'configuracoes.empresa.editar'))
  with check (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'configuracoes.empresa.editar'));
grant select, insert, update on public.pedido_logistica_parametros to authenticated;

create function public.pedido_logistica_manual_permite(p_empresa uuid, p_tipo text)
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null
    and public.eh_membro_empresa(p_empresa)
    and (public.operacao_pode(p_empresa, 'comercial.pedidos.editar') or public.operacao_pode(p_empresa, 'comercial.pedidos.criar'))
    and coalesce((select case config->p_tipo->>'modo'
      when 'todos' then true
      when 'escolhidos' then coalesce(config->p_tipo->'usuarios', '[]'::jsonb) ? auth.uid()::text
      else false end from public.pedido_logistica_parametros where empresa_id=p_empresa), false)
$$;
create function public.pedido_logistica_manual_permissoes(p_empresa uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('frete', public.pedido_logistica_manual_permite(p_empresa,'frete'),
    'montagem', public.pedido_logistica_manual_permite(p_empresa,'montagem'))
$$;
revoke all on function public.pedido_logistica_manual_permite(uuid,text) from public;
revoke all on function public.pedido_logistica_manual_permissoes(uuid) from public;
grant execute on function public.pedido_logistica_manual_permite(uuid,text) to authenticated;
grant execute on function public.pedido_logistica_manual_permissoes(uuid) to authenticated;

create function public.validar_pedido_logistica_manual()
returns trigger language plpgsql security definer set search_path=public as $$
declare tipo text; antes jsonb; depois jsonb; ajuste jsonb;
begin
  depois := coalesce(new.observacoes->'logistica_manual', '{}'::jsonb);
  if jsonb_typeof(depois) <> 'object' then raise exception 'Ajustes de logística inválidos.'; end if;
  if tg_op='UPDATE' then antes := coalesce(old.observacoes->'logistica_manual','{}'::jsonb);
  else antes := '{}'::jsonb; end if;
  foreach tipo in array array['frete','montagem'] loop
    ajuste := depois->tipo;
    if ajuste is not null then
      if jsonb_typeof(ajuste->'valor') is distinct from 'number' then raise exception 'Informe um valor válido para %.', tipo; end if;
      if (ajuste->>'valor')::numeric < 0 or (ajuste->>'valor')::numeric > 999999999.99 then raise exception 'Valor de % fora do limite.', tipo; end if;
    end if;
    if (antes->tipo) is distinct from ajuste then
      if not public.pedido_logistica_manual_permite(new.empresa_id, tipo) then
        raise exception 'Sem permissão para ajustar manualmente %.', tipo using errcode='42501';
      end if;
    end if;
  end loop;
  return new;
end $$;
create trigger pedido_logistica_manual_validar before insert or update on public.separacoes_pedidos
for each row execute function public.validar_pedido_logistica_manual();
