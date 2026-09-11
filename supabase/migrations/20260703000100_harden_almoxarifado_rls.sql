-- Harden multi-company isolation for almoxarifado tables.
-- Previous policies trusted a JWT empresa_id fallback that could become permissive
-- when the claim was missing. These policies require an explicit usuarios_empresas
-- membership for every row-level operation.

do $$
declare
  t text;
begin
  foreach t in array array[
    'almoxarifado_materiais',
    'almoxarifado_movimentacoes',
    'almoxarifado_ferramentas',
    'almoxarifado_solicitacoes',
    'almoxarifado_compras',
    'almoxarifado_conferencias',
    'almoxarifado_configuracoes',
    'almoxarifado_auditoria',
    'almoxarifado_notas'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "%s_empresa_select" on public.%I', t, t);
    execute format('drop policy if exists "%s_empresa_insert" on public.%I', t, t);
    execute format('drop policy if exists "%s_empresa_update" on public.%I', t, t);
    execute format('drop policy if exists "%s_empresa_delete" on public.%I', t, t);

    execute format(
      'create policy "%s_empresa_select" on public.%I for select using (
        exists (
          select 1
          from public.usuarios_empresas ue
          where ue.user_id = auth.uid()
            and ue.empresa_id = %I.empresa_id
        )
      )',
      t,
      t,
      t
    );

    execute format(
      'create policy "%s_empresa_insert" on public.%I for insert with check (
        exists (
          select 1
          from public.usuarios_empresas ue
          where ue.user_id = auth.uid()
            and ue.empresa_id = %I.empresa_id
        )
      )',
      t,
      t,
      t
    );

    execute format(
      'create policy "%s_empresa_update" on public.%I for update using (
        exists (
          select 1
          from public.usuarios_empresas ue
          where ue.user_id = auth.uid()
            and ue.empresa_id = %I.empresa_id
        )
      ) with check (
        exists (
          select 1
          from public.usuarios_empresas ue
          where ue.user_id = auth.uid()
            and ue.empresa_id = %I.empresa_id
        )
      )',
      t,
      t,
      t,
      t
    );

    execute format(
      'create policy "%s_empresa_delete" on public.%I for delete using (
        exists (
          select 1
          from public.usuarios_empresas ue
          where ue.user_id = auth.uid()
            and ue.empresa_id = %I.empresa_id
        )
      )',
      t,
      t,
      t
    );
  end loop;
end $$;
