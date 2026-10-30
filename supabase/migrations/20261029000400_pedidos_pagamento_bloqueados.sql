-- Quais pedidos de uma lista estão travados pelo pagamento mínimo numa etapa (out/2026): a Expedição e a Triagem
-- marcam o cartão com "Aguardando Financeiro" e não deixam abrir.
begin;
create or replace function public.pedidos_pagamento_bloqueados(p_pedidos uuid[], p_etapa text) returns uuid[]
language plpgsql stable security definer set search_path to 'public' as $fn$
declare r uuid[] := '{}'; pid uuid;
begin
  if auth.uid() is null or p_etapa not in ('triagem','carregamento') then return r; end if;
  foreach pid in array coalesce(p_pedidos,'{}') loop
    begin
      if not (public.pedido_pagamento_situacao(pid,p_etapa)->>'liberada')::boolean then r := r || pid; end if;
    exception when others then null; -- pedido de outra empresa ou inexistente: ignora
    end;
  end loop;
  return r;
end $fn$;
revoke all on function public.pedidos_pagamento_bloqueados(uuid[],text) from public, anon;
grant execute on function public.pedidos_pagamento_bloqueados(uuid[],text) to authenticated;
notify pgrst,'reload schema';
commit;
