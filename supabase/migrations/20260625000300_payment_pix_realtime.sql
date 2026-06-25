do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'separacoes_pedidos'
    ) then
      execute 'alter publication supabase_realtime add table public.separacoes_pedidos';
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'payment_gateway_payments'
    ) then
      execute 'alter publication supabase_realtime add table public.payment_gateway_payments';
    end if;
  end if;
end;
$$;
