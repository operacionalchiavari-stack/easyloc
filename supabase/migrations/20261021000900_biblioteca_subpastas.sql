-- Out/2026: Biblioteca com pastas dentro de pastas (pedido do usuário: "quero poder criar uma pasta dentro da outra").
-- biblioteca_pastas.pai_id aponta para a pasta de cima (null = pasta na raiz). Excluir uma pasta exclui as de dentro
-- (e, pelo cascade que já existia, as fotos delas). O nome só não pode repetir dentro da MESMA pasta.
alter table public.biblioteca_pastas
  add column if not exists pai_id uuid references public.biblioteca_pastas(id) on delete cascade;
create index if not exists biblioteca_pastas_pai_idx on public.biblioteca_pastas(pai_id);

drop index if exists public.biblioteca_pastas_nome_uidx;
create unique index biblioteca_pastas_nome_uidx on public.biblioteca_pastas
  (empresa_id, coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nome)));

-- A pasta de cima precisa ser da mesma empresa e não pode ser a própria pasta nem uma pasta de dentro dela.
create or replace function public.biblioteca_validar_pai()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.pai_id is null then return new; end if;
  if new.pai_id = new.id then raise exception 'Uma pasta não pode ficar dentro dela mesma'; end if;
  if not exists (select 1 from public.biblioteca_pastas where id = new.pai_id and empresa_id = new.empresa_id) then
    raise exception 'Pasta de cima não pertence à empresa da biblioteca';
  end if;
  if tg_op = 'UPDATE' and exists (
    with recursive acima(id, pai_id) as (
      select id, pai_id from public.biblioteca_pastas where id = new.pai_id
      union all
      select p.id, p.pai_id from public.biblioteca_pastas p join acima a on p.id = a.pai_id
    ) select 1 from acima where id = new.id
  ) then raise exception 'Uma pasta não pode ficar dentro de uma pasta que está dentro dela'; end if;
  return new;
end $$;
drop trigger if exists biblioteca_validar_pai on public.biblioteca_pastas;
create trigger biblioteca_validar_pai before insert or update of pai_id on public.biblioteca_pastas
for each row execute function public.biblioteca_validar_pai();

create or replace function public.biblioteca_pastas_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'ordem', p.ordem, 'pai_id', p.pai_id)
         order by p.ordem nulls last, lower(p.nome), p.id), '[]'::jsonb)
    from public.biblioteca_pastas p where p.empresa_id = p_empresa_id;
$$;
revoke all on function public.biblioteca_pastas_acervo(uuid) from public, anon, authenticated;
