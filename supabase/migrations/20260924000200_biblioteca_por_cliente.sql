begin;

alter table public.biblioteca_fotos
  add column cliente_id uuid references public.clientes_empresas(id) on delete cascade;
create index biblioteca_fotos_cliente_idx on public.biblioteca_fotos(empresa_id, cliente_id, categoria);

-- Preserve os arquivos; atribua somente as fotos existentes de Estofados.
do $$
declare e uuid; k uuid; n integer; total integer;
begin
  for e in select distinct empresa_id from public.biblioteca_fotos
    where lower(trim(categoria)) = 'estofados' and cliente_id is null
  loop
    select count(*) into n from public.clientes_empresas
      where empresa_id=e and lower(trim(nome_razao)) = 'kelly khawam';
    if n <> 1 then raise exception 'Esperado um cadastro Kelly Khawam na empresa %, encontrados %', e, n; end if;
    select id into k from public.clientes_empresas
      where empresa_id=e and lower(trim(nome_razao)) = 'kelly khawam';
    update public.biblioteca_fotos set cliente_id=k
      where empresa_id=e and lower(trim(categoria))='estofados' and cliente_id is null;
    get diagnostics total = row_count;
    raise notice '% fotos de Estofados vinculadas a Kelly Khawam', total;
  end loop;
end $$;

create or replace function public.biblioteca_fotos_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'categoria',f.categoria,'titulo',f.titulo,'url',f.url,
    'path',f.path,'ordem',f.ordem,'cliente_id',f.cliente_id
  ) order by f.categoria,f.ordem nulls last,f.criado_em),'[]'::jsonb)
  from public.biblioteca_fotos f where f.empresa_id=p_empresa_id;
$$;

create or replace function public.biblioteca_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s jsonb; fotos jsonb;
begin
  s := public.catalogo_validar_sessao(p_token);
  if coalesce((s->>'valido')::boolean,false) is not true then
    raise exception 'Sessão do catálogo expirada';
  end if;
  select coalesce(jsonb_agg(f),'[]'::jsonb) into fotos
    from jsonb_array_elements(public.biblioteca_fotos_acervo((s->>'empresa_id')::uuid)) f
    where f->>'cliente_id' is null or f->>'cliente_id'=s->>'cliente_id';
  return jsonb_build_object('fotos',fotos);
end $$;

create or replace function public.biblioteca_carregar_interno(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.funcionario_pode(p_empresa_id,auth.uid(),'comercial.catalogo.visualizar') then
    raise exception 'Sem permissão para acessar a biblioteca';
  end if;
  return jsonb_build_object('fotos',public.biblioteca_fotos_acervo(p_empresa_id),
    'clientes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome_razao) order by c.nome_razao),'[]'::jsonb)
      from public.clientes_empresas c where c.empresa_id=p_empresa_id));
end $$;

create or replace function public.biblioteca_validar_cliente()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.cliente_id is not null and not exists (
    select 1 from public.clientes_empresas where id=new.cliente_id and empresa_id=new.empresa_id
  ) then raise exception 'Cliente não pertence à empresa da biblioteca'; end if;
  return new;
end $$;
create trigger biblioteca_validar_cliente before insert or update on public.biblioteca_fotos
for each row execute function public.biblioteca_validar_cliente();

commit;
