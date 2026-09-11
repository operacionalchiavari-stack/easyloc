create extension if not exists pgcrypto;

alter table public.itens_fotos
  add column if not exists cliente_id uuid references public.clientes_empresas(id) on delete cascade;
alter table public.itens_fotos drop constraint if exists itens_fotos_item_slot_unique;
create unique index if not exists itens_fotos_detalhe_slot_unique
  on public.itens_fotos(item_id, slot) where cliente_id is null;
create unique index if not exists itens_fotos_cliente_slot_unique
  on public.itens_fotos(item_id, slot, cliente_id) where cliente_id is not null;
create index if not exists itens_fotos_cliente_idx on public.itens_fotos(cliente_id, item_id);

create table if not exists public.catalogo_acessos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null unique references public.clientes_empresas(id) on delete cascade,
  email text not null,
  senha_hash text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, email)
);

create table if not exists public.catalogo_sessoes (
  id uuid primary key default gen_random_uuid(),
  acesso_id uuid not null references public.catalogo_acessos(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.catalogo_acessos enable row level security;
alter table public.catalogo_sessoes enable row level security;

create or replace function public.configurar_acesso_catalogo(
  p_cliente_id uuid, p_email text, p_senha text default null, p_ativo boolean default true
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_empresa_id uuid; v_existente public.catalogo_acessos;
begin
  select empresa_id into v_empresa_id from public.clientes_empresas where id = p_cliente_id;
  if v_empresa_id is null or not exists (
    select 1 from public.usuarios_empresas where user_id = auth.uid() and empresa_id = v_empresa_id
  ) then raise exception 'Acesso não autorizado'; end if;
  select * into v_existente from public.catalogo_acessos where cliente_id = p_cliente_id;
  if p_ativo and v_existente.id is null and (p_senha is null or length(p_senha) < 8) then
    raise exception 'A senha deve ter pelo menos 8 caracteres';
  end if;
  if p_senha is not null and length(p_senha) between 1 and 7 then
    raise exception 'A senha deve ter pelo menos 8 caracteres';
  end if;
  insert into public.catalogo_acessos(empresa_id, cliente_id, email, senha_hash, ativo)
  values(v_empresa_id, p_cliente_id, lower(trim(p_email)), crypt(coalesce(nullif(p_senha,''),gen_random_uuid()::text), gen_salt('bf')), p_ativo)
  on conflict(cliente_id) do update set
    email = excluded.email, ativo = excluded.ativo,
    senha_hash = case when p_senha is null or p_senha = '' then public.catalogo_acessos.senha_hash else crypt(p_senha, gen_salt('bf')) end,
    updated_at = now();
  if not p_ativo then
    delete from public.catalogo_sessoes where acesso_id = (select id from public.catalogo_acessos where cliente_id = p_cliente_id);
  end if;
end;
$$;

create or replace function public.obter_acesso_catalogo(p_cliente_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  select jsonb_build_object('email', a.email, 'ativo', a.ativo) into v_result
  from public.catalogo_acessos a join public.usuarios_empresas ue on ue.empresa_id = a.empresa_id
  where a.cliente_id = p_cliente_id and ue.user_id = auth.uid();
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.catalogo_login(p_email text, p_senha text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_acesso public.catalogo_acessos; v_token text;
begin
  select * into v_acesso from public.catalogo_acessos
  where email = lower(trim(p_email)) and ativo and senha_hash = crypt(p_senha, senha_hash);
  if v_acesso.id is null then return null; end if;
  v_token := gen_random_uuid()::text || gen_random_uuid()::text;
  delete from public.catalogo_sessoes where expires_at < now();
  insert into public.catalogo_sessoes(acesso_id, token_hash, expires_at)
  values(v_acesso.id, encode(digest(v_token, 'sha256'), 'hex'), now() + interval '12 hours');
  return jsonb_build_object('token', v_token, 'cliente_id', v_acesso.cliente_id, 'empresa_id', v_acesso.empresa_id);
end;
$$;

create or replace function public.catalogo_validar_sessao(p_token text)
returns jsonb language sql security definer set search_path = public, extensions as $$
  select coalesce((select jsonb_build_object('valido', true, 'cliente_id', a.cliente_id, 'empresa_id', a.empresa_id)
    from public.catalogo_sessoes s join public.catalogo_acessos a on a.id=s.acesso_id
    where s.token_hash=encode(digest(p_token,'sha256'),'hex') and s.expires_at>now() and a.ativo), '{"valido":false}'::jsonb)
$$;

create or replace function public.catalogo_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_cliente uuid; v_empresa uuid; v_result jsonb;
begin
  select a.cliente_id, a.empresa_id into v_cliente, v_empresa
  from public.catalogo_sessoes s join public.catalogo_acessos a on a.id=s.acesso_id
  where s.token_hash=encode(digest(p_token,'sha256'),'hex') and s.expires_at>now() and a.ativo;
  if v_cliente is null then raise exception 'Sessão do catálogo expirada'; end if;
  select jsonb_build_object(
    'empresa', (select jsonb_build_object('nome',e.nome,'logo_url',e.logo_url) from public.empresas e where e.id=v_empresa),
    'itens', coalesce(jsonb_agg(jsonb_build_object(
      'id',i.id,'produto',i.produto,'material',i.material,'cor',i.cor,'categoria',i.categoria,
      'descricao_total',i.descricao_total,'descricao_complementar',i.descricao_complementar,
      'largura',i.largura,'altura',i.altura,'profundidade',i.profundidade,'foto_url',i.foto_url,
      'itens_modelos_3d',coalesce((select jsonb_agg(jsonb_build_object('url',m.url,'status',m.status)) from public.itens_modelos_3d m where m.item_id=i.id),'[]'::jsonb),
      'itens_fotos',coalesce((select jsonb_agg(jsonb_build_object('tipo',f.tipo,'titulo',f.titulo,'url',f.url,'ordem',f.ordem,'cliente_id',f.cliente_id) order by f.ordem)
        from public.itens_fotos f where f.item_id=i.id and (f.tipo <> 'galeria' or f.cliente_id=v_cliente)),'[]'::jsonb)
    ) order by i.categoria,i.produto),'[]'::jsonb)) into v_result
  from public.itens i where i.empresa_id=v_empresa and i.exibir_no_site=true and i.ativo=true;
  return v_result;
end;
$$;

revoke all on function public.configurar_acesso_catalogo(uuid,text,text,boolean) from public;
revoke all on function public.obter_acesso_catalogo(uuid) from public;
grant execute on function public.configurar_acesso_catalogo(uuid,text,text,boolean) to authenticated;
grant execute on function public.obter_acesso_catalogo(uuid) to authenticated;
grant execute on function public.catalogo_login(text,text) to anon, authenticated;
grant execute on function public.catalogo_validar_sessao(text) to anon, authenticated;
grant execute on function public.catalogo_carregar(text) to anon, authenticated;
