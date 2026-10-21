-- Numeração própria do catálogo por empresa, independente dos pedidos comerciais.
begin;
lock table public.projetos in share row exclusive mode;
alter table public.projetos add column if not exists numero_catalogo bigint;

create table if not exists public.projetos_numero_contadores (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  ultimo bigint not null default 0
);
alter table public.projetos_numero_contadores enable row level security;
revoke all on public.projetos_numero_contadores from anon, authenticated;

with numerados as (
  select id, row_number() over (partition by empresa_id order by created_at, id) as numero
  from public.projetos where cliente_id is not null
)
update public.projetos p set numero_catalogo = n.numero
from numerados n where p.id = n.id and p.numero_catalogo is null;

insert into public.projetos_numero_contadores (empresa_id, ultimo)
select empresa_id, max(numero_catalogo) from public.projetos
where numero_catalogo is not null group by empresa_id
on conflict (empresa_id) do update
set ultimo = greatest(projetos_numero_contadores.ultimo, excluded.ultimo);

create unique index if not exists projetos_empresa_numero_catalogo_uidx
on public.projetos (empresa_id, numero_catalogo);

create or replace function public.projetos_atribuir_numero_catalogo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' then
    -- O número permanece fixo nas edições do projeto.
    new.numero_catalogo := old.numero_catalogo;
    if old.numero_catalogo is not null then
      if new.empresa_id is distinct from old.empresa_id then
        raise exception 'Não é possível transferir um projeto numerado entre empresas';
      end if;
      return new;
    end if;
  else
    new.numero_catalogo := null;
  end if;
  if new.cliente_id is not null then
    insert into public.projetos_numero_contadores (empresa_id, ultimo)
    values (new.empresa_id, 1)
    on conflict (empresa_id) do update
    set ultimo = projetos_numero_contadores.ultimo + 1
    returning ultimo into new.numero_catalogo;
  end if;
  return new;
end;
$$;
revoke all on function public.projetos_atribuir_numero_catalogo() from public;
drop trigger if exists projetos_numero_catalogo on public.projetos;
create trigger projetos_numero_catalogo before insert or update on public.projetos
for each row execute function public.projetos_atribuir_numero_catalogo();
commit;
