-- A sincronização das ocorrências deve ocorrer uma vez por lote do inventário,
-- sem repetir a projeção inteira para cada peça adicionada.
create or replace function public.ocorrencias_inventario_lote() returns trigger
language plpgsql security definer set search_path=public as $$
declare emp uuid;
begin
 if tg_op='INSERT' then
  for emp in select distinct empresa_id from registros_novos loop perform public.ocorrencias_sincronizar(emp);end loop;
 elsif tg_op='DELETE' then
  for emp in select distinct empresa_id from registros_anteriores loop perform public.ocorrencias_sincronizar(emp);end loop;
 else
  for emp in select empresa_id from registros_novos union select empresa_id from registros_anteriores loop perform public.ocorrencias_sincronizar(emp);end loop;
 end if;
 return null;
end $$;
revoke all on function public.ocorrencias_inventario_lote() from public,anon,authenticated;
do $patch$
declare fonte text;
begin
 if exists(select 1 from pg_trigger where tgrelid='public.acervo_inventario_itens'::regclass and tgname='ocorrencias_automaticas') then
  drop trigger ocorrencias_automaticas on public.acervo_inventario_itens;
  create trigger ocorrencias_inventario_inserir after insert on public.acervo_inventario_itens referencing new table as registros_novos for each statement execute function public.ocorrencias_inventario_lote();
  create trigger ocorrencias_inventario_atualizar after update on public.acervo_inventario_itens referencing new table as registros_novos old table as registros_anteriores for each statement execute function public.ocorrencias_inventario_lote();
  create trigger ocorrencias_inventario_excluir after delete on public.acervo_inventario_itens referencing old table as registros_anteriores for each statement execute function public.ocorrencias_inventario_lote();
 end if;
 select pg_get_functiondef('public.acervo_inventario_geral(uuid)'::regprocedure) into fonte;
 execute replace(fonte,'set geral=true where id=v;','set geral=true where id=v and not geral;');
end $patch$;
notify pgrst,'reload schema';
