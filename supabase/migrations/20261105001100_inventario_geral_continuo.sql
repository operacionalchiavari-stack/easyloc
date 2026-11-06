-- Uma contagem geral inclui todas as peças físicas, sem seleção manual.
alter table public.acervo_inventarios add column if not exists geral boolean not null default false;
create or replace function public.acervo_inventario_geral(p_empresa uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare v uuid;
begin
 if auth.uid() is null or not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissão para inventariar';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select id into v from acervo_inventarios where empresa_id=p_empresa and status='contagem' order by geral desc,criado_em desc limit 1 for update;
 if v is null then
  if not exists(select 1 from itens where empresa_id=p_empresa and lower(coalesce(to_jsonb(itens)->>'tipo',''))<>'kit') then raise exception 'Nenhum item físico cadastrado para contagem';end if;
  insert into acervo_inventarios(empresa_id,nome,criado_por,geral) values(p_empresa,'Inventário geral · '||to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY'),auth.uid(),true) returning id into v;
 else update acervo_inventarios set geral=true where id=v;end if;
 insert into acervo_inventario_itens(inventario_id,empresa_id,item_id,saldo_base)
 select v,p_empresa,id,coalesce(estoque_total,0) from itens where empresa_id=p_empresa and lower(coalesce(to_jsonb(itens)->>'tipo',''))<>'kit'
 on conflict(inventario_id,item_id) do nothing;
 return v;
end $$;
revoke all on function public.acervo_inventario_geral(uuid) from public,anon;
grant execute on function public.acervo_inventario_geral(uuid) to authenticated;

create or replace function public.acervo_inventario_exigir_contagem_geral() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.geral and new.status='aprovado' and old.status is distinct from new.status and exists(
  select 1 from itens i left join acervo_inventario_itens c on c.inventario_id=new.id and c.item_id=i.id
  where i.empresa_id=new.empresa_id and lower(coalesce(to_jsonb(i)->>'tipo',''))<>'kit' and (c.item_id is null or c.contado is null)
 ) then raise exception 'Contabilize todos os itens e componentes antes de finalizar o inventário';end if;
 return new;
end $$;
create trigger acervo_inventario_exigir_contagem_geral before update of status on public.acervo_inventarios
 for each row execute function public.acervo_inventario_exigir_contagem_geral();
notify pgrst,'reload schema';
