begin;
-- Biblioteca do catálogo (pedido explícito do usuário): módulo DENTRO do
-- catálogo (mesmo padrão do Painel 3D — um botão no cabeçalho que
-- alterna uma seção na mesma página, ver catalogo-biblioteca.mjs), não
-- um módulo separado. Pastas são as próprias categorias já existentes em
-- `itens.categoria` (calculadas no cliente, sem tabela de lookup — mesmo
-- padrão de "Categoria" em toda a base). Aqui só as FOTOS de cada
-- categoria, subidas manualmente pela equipe — independentes de qualquer
-- item específico (galeria de referência/inspiração).
insert into storage.buckets (id, name, public)
values ('biblioteca', 'biblioteca', true)
on conflict (id) do update set public = excluded.public;

create table if not exists public.biblioteca_fotos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  categoria text not null,
  titulo text,
  path text not null,
  url text not null,
  mime_type text,
  tamanho_bytes bigint,
  ordem integer,
  criado_por uuid,
  criado_em timestamptz not null default now()
);

create index if not exists biblioteca_fotos_empresa_categoria_idx
on public.biblioteca_fotos (empresa_id, categoria, ordem, criado_em);

alter table public.biblioteca_fotos enable row level security;

drop policy if exists biblioteca_fotos_empresa_select on public.biblioteca_fotos;
create policy biblioteca_fotos_empresa_select
on public.biblioteca_fotos
for select
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id = biblioteca_fotos.empresa_id
  )
);

drop policy if exists biblioteca_fotos_empresa_insert on public.biblioteca_fotos;
create policy biblioteca_fotos_empresa_insert
on public.biblioteca_fotos
for insert
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id = biblioteca_fotos.empresa_id
  )
);

drop policy if exists biblioteca_fotos_empresa_delete on public.biblioteca_fotos;
create policy biblioteca_fotos_empresa_delete
on public.biblioteca_fotos
for delete
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id = biblioteca_fotos.empresa_id
  )
);

-- Bucket público pro decorador (sessão por token, sem auth.uid()) conseguir
-- ver as fotos direto pela URL — mesmo padrão do bucket "itens"
-- (20260628000100_itens_fotos_galeria.sql). Upload/exclusão continuam
-- restritos à própria empresa via prefixo do caminho.
drop policy if exists biblioteca_storage_select_public on storage.objects;
create policy biblioteca_storage_select_public
on storage.objects
for select
using (bucket_id = 'biblioteca');

drop policy if exists biblioteca_storage_insert_empresa on storage.objects;
create policy biblioteca_storage_insert_empresa
on storage.objects
for insert
with check (
  bucket_id = 'biblioteca'
  and exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists biblioteca_storage_delete_empresa on storage.objects;
create policy biblioteca_storage_delete_empresa
on storage.objects
for delete
using (
  bucket_id = 'biblioteca'
  and exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);

-- Mesmo desenho do catálogo: uma função única de leitura
-- (biblioteca_fotos_acervo), envolvida por dois pontos de entrada com
-- autorização diferente — biblioteca_carregar (decorador, token via
-- catalogo_validar_sessao, reaproveitado tal qual) e
-- biblioteca_carregar_interno (equipe, mesma permissão já usada pelo
-- catálogo — comercial.catalogo.visualizar — sem criar chave nova).
create or replace function public.biblioteca_fotos_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'categoria', f.categoria, 'titulo', f.titulo, 'url', f.url, 'ordem', f.ordem
  ) order by f.categoria, f.ordem nulls last, f.criado_em), '[]'::jsonb)
  from public.biblioteca_fotos f
  where f.empresa_id = p_empresa_id;
$$;
revoke all on function public.biblioteca_fotos_acervo(uuid) from public,anon,authenticated;
grant execute on function public.biblioteca_fotos_acervo(uuid) to service_role;

create or replace function public.biblioteca_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_sessao jsonb; v_empresa uuid;
begin
  v_sessao := public.catalogo_validar_sessao(p_token);
  if coalesce((v_sessao->>'valido')::boolean, false) is not true then
    raise exception 'Sessão do catálogo expirada';
  end if;
  v_empresa := (v_sessao->>'empresa_id')::uuid;
  return jsonb_build_object('fotos', public.biblioteca_fotos_acervo(v_empresa));
end; $$;
revoke all on function public.biblioteca_carregar(text) from public;
grant execute on function public.biblioteca_carregar(text) to anon,authenticated,service_role;

create or replace function public.biblioteca_carregar_interno(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.funcionario_pode(p_empresa_id,auth.uid(),'comercial.catalogo.visualizar') then
    raise exception 'Sem permissão para acessar a biblioteca';
  end if;
  return jsonb_build_object('fotos', public.biblioteca_fotos_acervo(p_empresa_id));
end; $$;
revoke all on function public.biblioteca_carregar_interno(uuid) from public,anon;
grant execute on function public.biblioteca_carregar_interno(uuid) to authenticated,service_role;
commit;
