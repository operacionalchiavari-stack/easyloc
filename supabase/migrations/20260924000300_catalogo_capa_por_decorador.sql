begin;

alter table public.catalogo_capas
  add column cliente_id uuid references public.clientes_empresas(id) on delete cascade;
alter table public.catalogo_capas drop constraint catalogo_capas_empresa_id_chave_key;
alter table public.catalogo_capas add constraint catalogo_capas_empresa_cliente_chave_key
  unique nulls not distinct (empresa_id, cliente_id, chave);

create trigger catalogo_capas_validar_cliente before insert or update on public.catalogo_capas
for each row execute function public.biblioteca_validar_cliente();

-- Preserve a capa atual para Kelly; os próximos uploads usam caminhos por cliente.
insert into public.catalogo_capas(empresa_id,cliente_id,chave,path,url)
select capa.empresa_id,cliente.id,capa.chave,capa.path,capa.url
from public.catalogo_capas capa
join public.clientes_empresas cliente on cliente.empresa_id=capa.empresa_id
  and lower(trim(cliente.nome_razao))='kelly khawam'
where capa.cliente_id is null and capa.chave='portal';

-- A capa sem cliente fica somente na visão interna da equipe.
create or replace function public.catalogo_capas_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_object_agg(c.chave,c.url),'{}'::jsonb)
  from public.catalogo_capas c where c.empresa_id=p_empresa_id and c.cliente_id is null;
$$;

create or replace function public.catalogo_capas_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s jsonb; capas jsonb;
begin
  s := public.catalogo_validar_sessao(p_token);
  if coalesce((s->>'valido')::boolean,false) is not true then
    raise exception 'Sessão do catálogo expirada';
  end if;
  select coalesce(jsonb_object_agg(c.chave,c.url),'{}'::jsonb) into capas
    from public.catalogo_capas c
    where c.empresa_id=(s->>'empresa_id')::uuid and c.cliente_id=(s->>'cliente_id')::uuid;
  return capas;
end $$;

create or replace function public.catalogo_capas_carregar_interno(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.funcionario_pode(p_empresa_id,auth.uid(),'comercial.catalogo.visualizar') then
    raise exception 'Sem permissão para acessar o catálogo';
  end if;
  return public.catalogo_capas_acervo(p_empresa_id) || jsonb_build_object(
    'clientes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome_razao) order by c.nome_razao),'[]'::jsonb)
      from public.clientes_empresas c where c.empresa_id=p_empresa_id),
    'capas_clientes',(select coalesce(jsonb_agg(jsonb_build_object('cliente_id',c.cliente_id,'chave',c.chave,'url',c.url)),'[]'::jsonb)
      from public.catalogo_capas c where c.empresa_id=p_empresa_id and c.cliente_id is not null));
end $$;

commit;
