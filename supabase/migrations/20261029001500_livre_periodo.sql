-- Disponibilidade de Itens: o número "Disponível" vem da MESMA conta do catálogo, do pedido e do salvar
-- (operacao_livre_calc), em vez da conta própria que a tela fazia no navegador.
create or replace function public.operacao_livre_periodo(p_empresa uuid, p_inicio date, p_fim date)
returns table(item_id uuid, livre numeric, bloqueio_contagem boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_membro_empresa(p_empresa) then raise exception 'Sem permissão'; end if;
  return query
    select l.item_id, l.livre, l.item_id in (select public.acervo_itens_bloqueados(p_empresa))
      from public.operacao_livre_calc(p_empresa, p_inicio, greatest(p_inicio, coalesce(p_fim, p_inicio)), null) l;
end $$;
revoke all on function public.operacao_livre_periodo(uuid, date, date) from public, anon;
grant execute on function public.operacao_livre_periodo(uuid, date, date) to authenticated;
