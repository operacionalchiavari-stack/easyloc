-- Formatos do Módulo Lounge (Composições): até aqui só existia "Lounge compacto", fixo no código. Pedido explícito do
-- usuário: um lugar dentro de Composições pra criar formatos NOVOS (peças posicionadas num diagrama 2D, igual o
-- "Lounge compacto" já monta), salvar, e depois escolher o formato criado pra selecionar os móveis que entram nele.
--
-- Visibilidade (confirmada com o usuário, pergunta direta): um formato criado pela EQUIPE (cliente_id null) aparece
-- pra todo mundo (equipe + qualquer decorador). Um formato criado por um DECORADOR (cliente_id = o dele) só aparece
-- pra ele mesmo e pra equipe — nunca pra outro decorador. Mesmo desenho de dono de projeto_layouts (cliente_id =
-- decorador dono; null = equipe), mas com uma regra de LEITURA diferente: lá cada um só vê os PRÓPRIOS layouts
-- (nem a equipe vê os dos decoradores); aqui a equipe vê TUDO (mesmo padrão de projeto_listar: "equipe vê os
-- projetos de todos os decoradores") e um decorador vê os seus + os da equipe.
begin;

create table if not exists public.lounge_formatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes_empresas(id) on delete cascade,   -- decorador dono; null = criado pela equipe (público pra empresa toda)
  criado_por uuid,
  nome text not null check (length(btrim(nome)) > 0 and length(nome) <= 60),
  -- peças posicionadas no diagrama: [{role,x,z,rotation}, ...] — x/z normalizados (0-1, mesma convenção do
  -- diagrama arrastável do preset "Lounge compacto" no Estúdio de Ambientes), rotation em graus.
  papeis jsonb not null default '[]'::jsonb check (jsonb_typeof(papeis) = 'array' and length(papeis::text) < 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lounge_formatos_empresa_idx on public.lounge_formatos(empresa_id, cliente_id);

alter table public.lounge_formatos enable row level security;
drop policy if exists lounge_formatos_equipe on public.lounge_formatos;
create policy lounge_formatos_equipe on public.lounge_formatos for all to authenticated
  using (exists(select 1 from public.usuarios_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = lounge_formatos.empresa_id))
  with check (exists(select 1 from public.usuarios_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = lounge_formatos.empresa_id));

-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.lounge_formato_json(lf public.lounge_formatos)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id', lf.id, 'nome', lf.nome, 'papeis', lf.papeis,
    'cliente_id', lf.cliente_id, 'equipe', lf.cliente_id is null,
    'atualizado_em', lf.updated_at
  );
$$;
revoke all on function public.lounge_formato_json(public.lounge_formatos) from public, anon, authenticated;

-- Reaproveita projeto_ctx(p_token, p_empresa_id) — resolvedor genérico de "quem está chamando" já usado por
-- projetos/layouts (token do catálogo → decorador; sem token → exige permissão de equipe), sem nada específico de
-- "projeto" na lógica dele.
create or replace function public.lounge_formatos_listar(p_token text default null, p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; out jsonb;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  select coalesce(jsonb_agg(public.lounge_formato_json(lf) order by lf.created_at), '[]'::jsonb) into out
  from public.lounge_formatos lf
  where lf.empresa_id = (c->>'empresa_id')::uuid
    and (
      (c->>'equipe')::boolean is true
      or lf.cliente_id is null
      or lf.cliente_id = nullif(c->>'cliente_id', '')::uuid
    );
  return out;
end; $$;

-- Cria (p_id nulo) ou atualiza um formato. Equipe grava com cliente_id null (público); decorador grava com o
-- PRÓPRIO cliente_id (só ele + a equipe verão). Editar exige ser o dono OU ser a equipe (equipe pode mexer em
-- qualquer formato, inclusive de decorador — mesmo princípio de moderação já usado noutras partes do catálogo).
create or replace function public.lounge_formato_salvar(
  p_token text default null, p_empresa_id uuid default null, p_id uuid default null,
  p_nome text default null, p_papeis jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; emp uuid; dono uuid; eh_equipe boolean; lf public.lounge_formatos; n int;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  emp := (c->>'empresa_id')::uuid;
  dono := nullif(c->>'cliente_id', '')::uuid;
  eh_equipe := (c->>'equipe')::boolean is true;

  if p_nome is null or length(btrim(p_nome)) = 0 then raise exception 'Dê um nome ao formato'; end if;
  if length(btrim(p_nome)) > 60 then raise exception 'O nome do formato pode ter até 60 caracteres'; end if;
  if p_papeis is null or jsonb_typeof(p_papeis) <> 'array' or jsonb_array_length(p_papeis) = 0 then
    raise exception 'Posicione ao menos uma peça antes de salvar';
  end if;
  if length(p_papeis::text) >= 20000 then raise exception 'Formato grande demais'; end if;
  if not exists(select 1 from jsonb_array_elements(p_papeis) p where p->>'role' = 'sofa') then
    raise exception 'Todo formato precisa de um sofá';
  end if;

  if p_id is null then
    select count(*) into n from public.lounge_formatos
      where empresa_id = emp and cliente_id is not distinct from (case when eh_equipe then null else dono end);
    if n >= 30 then raise exception 'Limite de 30 formatos atingido — exclua algum antes de criar outro'; end if;
    insert into public.lounge_formatos(empresa_id, cliente_id, criado_por, nome, papeis)
    values (emp, case when eh_equipe then null else dono end, nullif(c->>'uid', '')::uuid, btrim(p_nome), p_papeis)
    returning * into lf;
  else
    select * into lf from public.lounge_formatos where id = p_id and empresa_id = emp;
    if not found then raise exception 'Formato não encontrado'; end if;
    if not (eh_equipe or lf.cliente_id = dono) then raise exception 'Sem permissão para editar este formato'; end if;
    update public.lounge_formatos set nome = btrim(p_nome), papeis = p_papeis, updated_at = now() where id = lf.id returning * into lf;
  end if;
  return public.lounge_formato_json(lf);
end; $$;

create or replace function public.lounge_formato_excluir(p_token text default null, p_empresa_id uuid default null, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; emp uuid; dono uuid; eh_equipe boolean; lf public.lounge_formatos;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  emp := (c->>'empresa_id')::uuid;
  dono := nullif(c->>'cliente_id', '')::uuid;
  eh_equipe := (c->>'equipe')::boolean is true;
  select * into lf from public.lounge_formatos where id = p_id and empresa_id = emp;
  if not found then raise exception 'Formato não encontrado'; end if;
  if not (eh_equipe or lf.cliente_id = dono) then raise exception 'Sem permissão para excluir este formato'; end if;
  delete from public.lounge_formatos where id = lf.id;
  return jsonb_build_object('ok', true);
end; $$;

-- Permissões: decorador chama por anon, equipe por authenticated (mesmo padrão de layout_*/projeto_*).
revoke all on function public.lounge_formatos_listar(text, uuid) from public;
revoke all on function public.lounge_formato_salvar(text, uuid, uuid, text, jsonb) from public;
revoke all on function public.lounge_formato_excluir(text, uuid, uuid) from public;
grant execute on function public.lounge_formatos_listar(text, uuid) to anon, authenticated, service_role;
grant execute on function public.lounge_formato_salvar(text, uuid, uuid, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.lounge_formato_excluir(text, uuid, uuid) to anon, authenticated, service_role;

commit;
