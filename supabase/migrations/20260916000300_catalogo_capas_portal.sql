begin;
-- Portal de entrada do catálogo (pedido explícito do usuário): 3 blocos
-- fixos — Catálogo, Biblioteca, Módulo 3D — cada um com uma foto de capa
-- escolhida pela equipe. Diferente da capa de categoria (que vem de um
-- item cadastrado), esses 3 não têm item associado, por isso uma tabela
-- própria com uma linha por "chave" fixa em vez de reaproveitar
-- biblioteca_fotos. Reaproveita o bucket "biblioteca" já criado em
-- 20260916000200_biblioteca_fotos.sql — path
-- `${empresa_id}/_capas/${chave}.ext` já cai dentro da mesma política de
-- storage (primeiro segmento do caminho = empresa_id), sem precisar de
-- bucket/política novos.
create table if not exists public.catalogo_capas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  chave text not null check (chave in ('catalogo', 'biblioteca', 'modulo3d')),
  path text not null,
  url text not null,
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, chave)
);

alter table public.catalogo_capas enable row level security;

drop policy if exists catalogo_capas_empresa_select on public.catalogo_capas;
create policy catalogo_capas_empresa_select
on public.catalogo_capas
for select
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id = catalogo_capas.empresa_id
  )
);

drop policy if exists catalogo_capas_empresa_insert on public.catalogo_capas;
create policy catalogo_capas_empresa_insert
on public.catalogo_capas
for insert
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id = catalogo_capas.empresa_id
  )
);

drop policy if exists catalogo_capas_empresa_update on public.catalogo_capas;
create policy catalogo_capas_empresa_update
on public.catalogo_capas
for update
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id = catalogo_capas.empresa_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id = catalogo_capas.empresa_id
  )
);

-- Mesmo desenho de leitura do resto do catálogo: uma função compartilhada
-- envolvida por um ponto de entrada por token (decorador) e um por
-- empresa+permissão (equipe) — ver catalogo_acervo()/biblioteca_fotos_acervo().
create or replace function public.catalogo_capas_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_object_agg(c.chave, c.url), '{}'::jsonb)
  from public.catalogo_capas c
  where c.empresa_id = p_empresa_id;
$$;
revoke all on function public.catalogo_capas_acervo(uuid) from public,anon,authenticated;
grant execute on function public.catalogo_capas_acervo(uuid) to service_role;

create or replace function public.catalogo_capas_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_sessao jsonb; v_empresa uuid;
begin
  v_sessao := public.catalogo_validar_sessao(p_token);
  if coalesce((v_sessao->>'valido')::boolean, false) is not true then
    raise exception 'Sessão do catálogo expirada';
  end if;
  v_empresa := (v_sessao->>'empresa_id')::uuid;
  return public.catalogo_capas_acervo(v_empresa);
end; $$;
revoke all on function public.catalogo_capas_carregar(text) from public;
grant execute on function public.catalogo_capas_carregar(text) to anon,authenticated,service_role;

create or replace function public.catalogo_capas_carregar_interno(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.funcionario_pode(p_empresa_id,auth.uid(),'comercial.catalogo.visualizar') then
    raise exception 'Sem permissão para acessar o catálogo';
  end if;
  return public.catalogo_capas_acervo(p_empresa_id);
end; $$;
revoke all on function public.catalogo_capas_carregar_interno(uuid) from public,anon;
grant execute on function public.catalogo_capas_carregar_interno(uuid) to authenticated,service_role;
commit;
