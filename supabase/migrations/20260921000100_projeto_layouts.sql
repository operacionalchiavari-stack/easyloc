-- Layouts de apresentação do projeto: cada decorador cria os SEUS layouts (capa, cores, fontes, como aparecem as renderizações e os
-- móveis, formato do PDF...) — quantos quiser — e escolhe em qual gerar o link e o PDF de cada projeto. O layout é só apresentação
-- (um documento jsonb de opções); os dados do projeto e as regras de acesso continuam sendo os de 20260920000100_projetos.sql.
--
-- Dono: cliente_id = decorador; null = equipe (mesmo desenho de projetos). Cada um só vê/edita os PRÓPRIOS layouts. Um projeto
-- aponta pra um layout do seu dono (`projetos.layout_id`); sem escolha, vale o layout marcado como padrão do dono; sem nenhum,
-- a apresentação usa o visual original (o cliente da página monta o padrão embutido).
begin;

create table if not exists public.projeto_layouts (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes_empresas(id) on delete cascade,   -- decorador dono; null = equipe
  criado_por uuid,
  nome text not null check (length(btrim(nome)) > 0 and length(nome) <= 60),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and length(config::text) < 20000),
  padrao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projeto_layouts_dono_idx on public.projeto_layouts(empresa_id, cliente_id);
-- No máximo UM layout padrão por dono.
create unique index if not exists projeto_layouts_padrao_unico
  on public.projeto_layouts (empresa_id, coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid)) where padrao;

alter table public.projeto_layouts enable row level security;
drop policy if exists projeto_layouts_equipe on public.projeto_layouts;
create policy projeto_layouts_equipe on public.projeto_layouts for all to authenticated
  using (exists(select 1 from public.usuarios_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = projeto_layouts.empresa_id))
  with check (exists(select 1 from public.usuarios_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = projeto_layouts.empresa_id));

alter table public.projetos add column if not exists layout_id uuid references public.projeto_layouts(id) on delete set null;

-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.layout_json(l public.projeto_layouts)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id', l.id, 'nome', l.nome, 'config', l.config, 'padrao', l.padrao, 'atualizado_em', l.updated_at);
$$;
revoke all on function public.layout_json(public.projeto_layouts) from public, anon, authenticated;

-- Layouts do dono de um projeto (ou do próprio chamador, sem projeto).
create or replace function public.layout_listar(p_token text default null, p_empresa_id uuid default null, p_projeto_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; dono uuid; r public.projetos; out jsonb;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  if p_projeto_id is not null then
    r := public.projeto_do_chamador(c, p_projeto_id);
    dono := r.cliente_id;
  else
    dono := nullif(c->>'cliente_id', '')::uuid;
  end if;
  select coalesce(jsonb_agg(public.layout_json(l) order by l.padrao desc, lower(l.nome)), '[]'::jsonb) into out
    from public.projeto_layouts l
   where l.empresa_id = (c->>'empresa_id')::uuid and l.cliente_id is not distinct from dono;
  return out;
end; $$;

-- Cria (p_id nulo) ou atualiza um layout do chamador. p_padrao: true marca este como o padrão (desmarca o anterior), false desmarca.
create or replace function public.layout_salvar(
  p_token text default null, p_empresa_id uuid default null, p_id uuid default null,
  p_nome text default null, p_config jsonb default null, p_padrao boolean default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; emp uuid; dono uuid; l public.projeto_layouts; n int;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  emp := (c->>'empresa_id')::uuid;
  dono := nullif(c->>'cliente_id', '')::uuid;
  if p_nome is null or length(btrim(p_nome)) = 0 then raise exception 'Dê um nome ao layout'; end if;
  if length(btrim(p_nome)) > 60 then raise exception 'O nome do layout pode ter até 60 caracteres'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'Configuração do layout inválida'; end if;
  if length(p_config::text) >= 20000 then raise exception 'Layout grande demais'; end if;
  if p_id is null then
    select count(*) into n from public.projeto_layouts where empresa_id = emp and cliente_id is not distinct from dono;
    if n >= 20 then raise exception 'Limite de 20 layouts atingido — exclua algum antes de criar outro'; end if;
    insert into public.projeto_layouts(empresa_id, cliente_id, criado_por, nome, config)
    values (emp, dono, nullif(c->>'uid', '')::uuid, btrim(p_nome), p_config) returning * into l;
  else
    select * into l from public.projeto_layouts where id = p_id and empresa_id = emp and cliente_id is not distinct from dono;
    if not found then raise exception 'Layout não encontrado'; end if;
    update public.projeto_layouts set nome = btrim(p_nome), config = p_config, updated_at = now() where id = l.id returning * into l;
  end if;
  if p_padrao is true then
    update public.projeto_layouts set padrao = false where empresa_id = emp and cliente_id is not distinct from dono and id <> l.id and padrao;
    update public.projeto_layouts set padrao = true where id = l.id returning * into l;
  elsif p_padrao is false and l.padrao then
    update public.projeto_layouts set padrao = false where id = l.id returning * into l;
  end if;
  return public.layout_json(l);
end; $$;

create or replace function public.layout_excluir(p_token text default null, p_empresa_id uuid default null, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; emp uuid; dono uuid; l public.projeto_layouts;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  emp := (c->>'empresa_id')::uuid;
  dono := nullif(c->>'cliente_id', '')::uuid;
  select * into l from public.projeto_layouts where id = p_id and empresa_id = emp and cliente_id is not distinct from dono;
  if not found then raise exception 'Layout não encontrado'; end if;
  delete from public.projeto_layouts where id = l.id;   -- projetos que usavam voltam ao padrão (layout_id = null)
  return jsonb_build_object('ok', true);
end; $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Layout que vale pra um projeto: o escolhido nele; senão o padrão do dono; senão null (o cliente usa o padrão embutido).
create or replace function public.projeto_layout_resolvido(r public.projetos)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(
    (select l.config from public.projeto_layouts l where l.id = r.layout_id and l.empresa_id = r.empresa_id),
    (select l.config from public.projeto_layouts l where l.empresa_id = r.empresa_id and l.cliente_id is not distinct from r.cliente_id and l.padrao limit 1)
  );
$$;
revoke all on function public.projeto_layout_resolvido(public.projetos) from public, anon, authenticated;

create or replace function public.projeto_resumo(r public.projetos)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id', r.id, 'noivos', r.noivos, 'data_evento', r.data_evento, 'local_evento', r.local_evento,
    'status', r.status, 'compartilhar', r.compartilhar, 'pedido_enviado_em', r.pedido_enviado_em,
    'atualizado_em', r.updated_at, 'layout_id', r.layout_id,
    'foto_casal_url', r.dados->'foto_casal'->>'url',
    'ambientes', jsonb_array_length(r.dados->'ambientes'),
    'itens', coalesce((select sum(coalesce((i->>'quantidade')::int, 1)) from jsonb_array_elements(r.dados->'ambientes') a, jsonb_array_elements(coalesce(a->'itens','[]'::jsonb)) i), 0),
    'renders', coalesce((select sum(jsonb_array_length(coalesce(a->'renders','[]'::jsonb))) from jsonb_array_elements(r.dados->'ambientes') a), 0),
    'dono', coalesce((select c.nome_razao from public.clientes_empresas c where c.id = r.cliente_id), 'Equipe')
  );
$$;

create or replace function public.projeto_definir_layout(p_token text default null, p_empresa_id uuid default null, p_id uuid default null, p_layout_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; r public.projetos;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  r := public.projeto_do_chamador(c, p_id);
  if p_layout_id is not null and not exists(
       select 1 from public.projeto_layouts l where l.id = p_layout_id and l.empresa_id = r.empresa_id and l.cliente_id is not distinct from r.cliente_id) then
    raise exception 'Layout não encontrado';
  end if;
  update public.projetos set layout_id = p_layout_id, updated_at = now() where id = r.id returning * into r;
  return public.projeto_resumo(r);
end; $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Tudo que a página de apresentação precisa (a mesma coisa pro link público e pra pré-visualização do dono). Nunca preço.
create or replace function public.projeto_apresentacao(r public.projetos)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare itens jsonb; dec jsonb; emp jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', it.id, 'nome', trim(concat_ws(' ', nullif(it.produto_base,''), it.produto)), 'categoria', it.categoria,
      'material', it.material, 'cor', it.cor, 'largura', it.largura, 'altura', it.altura, 'profundidade', it.profundidade,
      'foto_url', it.foto_url)), '[]'::jsonb) into itens
  from public.itens it
  where it.empresa_id = r.empresa_id
    and it.id::text in (select i->>'item_id' from jsonb_array_elements(r.dados->'ambientes') a, jsonb_array_elements(coalesce(a->'itens','[]'::jsonb)) i);
  select jsonb_build_object('nome', c.nome_razao, 'logo_url', c.catalogo_logo_url, 'cor_primaria', c.catalogo_cor_primaria, 'cor_secundaria', c.catalogo_cor_secundaria, 'telefone', c.telefone, 'email', c.email)
    into dec from public.clientes_empresas c where c.id = r.cliente_id;
  select jsonb_build_object('nome', e.nome, 'logo_url', e.logo_url) into emp from public.empresas e where e.id = r.empresa_id;
  return jsonb_build_object('ok', true,
    'projeto', jsonb_build_object('noivos', r.noivos, 'data_evento', r.data_evento, 'local_evento', r.local_evento,
                                  'foto_casal', r.dados->'foto_casal'->>'url', 'ambientes', r.dados->'ambientes'),
    'itens', itens, 'decorador', dec, 'empresa', emp, 'layout', public.projeto_layout_resolvido(r));
end; $$;
revoke all on function public.projeto_apresentacao(public.projetos) from public, anon, authenticated;

create or replace function public.projeto_publico(p_slug text, p_pin text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r public.projetos;
begin
  select * into r from public.projetos where slug = p_slug and compartilhar is true;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  if r.pin_bloqueado_ate is not null and r.pin_bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'erro', 'bloqueado', 'ate', r.pin_bloqueado_ate);
  end if;
  if r.pin_hash is null or coalesce(p_pin, '') = '' or extensions.crypt(p_pin, r.pin_hash) <> r.pin_hash then
    update public.projetos set
      pin_tentativas = case when pin_tentativas + 1 >= 5 then 0 else pin_tentativas + 1 end,
      pin_bloqueado_ate = case when pin_tentativas + 1 >= 5 then now() + interval '15 minutes' else null end
    where id = r.id;
    return jsonb_build_object('ok', false, 'erro', 'pin');
  end if;
  update public.projetos set pin_tentativas = 0, pin_bloqueado_ate = null where id = r.id and (pin_tentativas <> 0 or pin_bloqueado_ate is not null);
  return public.projeto_apresentacao(r);
end; $$;

-- Pré-visualização do dono (gerar PDF / testar um layout) — sem senha e sem precisar compartilhar; só quem pode mexer no projeto.
-- Devolve também os layouts do dono, pra trocar de layout na própria pré-visualização.
create or replace function public.projeto_previa(p_token text default null, p_empresa_id uuid default null, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; r public.projetos; lay jsonb;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  r := public.projeto_do_chamador(c, p_id);
  select coalesce(jsonb_agg(public.layout_json(l) order by l.padrao desc, lower(l.nome)), '[]'::jsonb) into lay
    from public.projeto_layouts l where l.empresa_id = r.empresa_id and l.cliente_id is not distinct from r.cliente_id;
  return public.projeto_apresentacao(r) || jsonb_build_object('layouts', lay, 'layout_id', r.layout_id, 'projeto_id', r.id);
end; $$;

-- Permissões: decorador e público chamam por anon; equipe por authenticated.
revoke all on function public.layout_listar(text, uuid, uuid) from public;
revoke all on function public.layout_salvar(text, uuid, uuid, text, jsonb, boolean) from public;
revoke all on function public.layout_excluir(text, uuid, uuid) from public;
revoke all on function public.projeto_definir_layout(text, uuid, uuid, uuid) from public;
revoke all on function public.projeto_previa(text, uuid, uuid) from public;
revoke all on function public.projeto_publico(text, text) from public;
grant execute on function public.layout_listar(text, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.layout_salvar(text, uuid, uuid, text, jsonb, boolean) to anon, authenticated, service_role;
grant execute on function public.layout_excluir(text, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.projeto_definir_layout(text, uuid, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.projeto_previa(text, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.projeto_publico(text, text) to anon, authenticated, service_role;

commit;
