-- Projetos do catálogo: o decorador (ou a equipe) monta um projeto de evento — noivos, data, local — dividido em
-- AMBIENTES com nome livre; em cada ambiente escolhe móveis do catálogo (com quantidade) e guarda as renderizações
-- 3D/IA. No fim: página de apresentação (landing, com link + PIN) e PDF, e um pedido enviado à Chiavari.
--
-- O projeto inteiro (ambientes → itens/renders) mora num documento jsonb (`dados`): um projeto é sempre lido e
-- gravado de uma vez, e o decorador não tem `auth.uid()` (entra por token do catálogo) — então todo acesso passa
-- por RPC security definer, com o mesmo desenho de biblioteca_carregar()/catalogo_creditos: token do decorador OU
-- permissão da equipe (comercial.catalogo.visualizar). Valores de locação NUNCA saem daqui (decisão do usuário:
-- a apresentação nunca mostra preço).
begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.projetos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes_empresas(id) on delete set null,   -- decorador dono; null = criado pela equipe
  criado_por uuid,                                                              -- auth.uid() da equipe, quando for o caso
  noivos text not null check (length(btrim(noivos)) > 0),
  data_evento date not null,
  local_evento text not null check (length(btrim(local_evento)) > 0),
  dados jsonb not null default '{"ambientes":[]}'::jsonb check (jsonb_typeof(dados->'ambientes') = 'array'),
  status text not null default 'rascunho' check (status in ('rascunho','pedido_enviado','em_analise','convertido')),
  pedido_enviado_em timestamptz,
  pedido_observacao text,
  pedido_snapshot jsonb,
  compartilhar boolean not null default false,
  slug text unique,
  pin_hash text,
  pin_tentativas integer not null default 0,
  pin_bloqueado_ate timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projetos_empresa_idx on public.projetos(empresa_id, data_evento);
create index if not exists projetos_cliente_idx on public.projetos(cliente_id);

alter table public.projetos enable row level security;
-- Equipe: só a própria empresa. Anônimo (decorador/público): nenhuma política — só pelas RPCs abaixo.
drop policy if exists projetos_equipe on public.projetos;
create policy projetos_equipe on public.projetos for all to authenticated
  using (exists(select 1 from public.usuarios_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = projetos.empresa_id))
  with check (exists(select 1 from public.usuarios_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = projetos.empresa_id));

-- ---------------------------------------------------------------------------------------------------------------
-- Quem está chamando: decorador (token) ou equipe (auth.uid + permissão). Função interna, sem grant pro público.
create or replace function public.projeto_ctx(p_token text, p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v jsonb;
begin
  if p_token is not null and length(p_token) > 0 then
    v := public.catalogo_validar_sessao(p_token);
    if coalesce((v->>'valido')::boolean, false) is not true then raise exception 'Sessão do catálogo expirada'; end if;
    return jsonb_build_object('empresa_id', v->>'empresa_id', 'cliente_id', v->>'cliente_id', 'equipe', false);
  end if;
  if auth.uid() is null or p_empresa_id is null
     or not public.funcionario_pode(p_empresa_id, auth.uid(), 'comercial.catalogo.visualizar') then
    raise exception 'Sem permissão para acessar os projetos';
  end if;
  return jsonb_build_object('empresa_id', p_empresa_id, 'cliente_id', null, 'equipe', true, 'uid', auth.uid());
end; $$;
revoke all on function public.projeto_ctx(text, uuid) from public, anon, authenticated;

-- Um projeto que o chamador pode mexer (decorador: só os dele; equipe: todos da empresa) — senão erro.
create or replace function public.projeto_do_chamador(p_ctx jsonb, p_id uuid)
returns public.projetos language plpgsql security definer set search_path=public,extensions as $$
declare r public.projetos;
begin
  select * into r from public.projetos where id = p_id and empresa_id = (p_ctx->>'empresa_id')::uuid;
  if not found then raise exception 'Projeto não encontrado'; end if;
  if (p_ctx->>'equipe')::boolean is not true and r.cliente_id is distinct from (p_ctx->>'cliente_id')::uuid then
    raise exception 'Projeto não encontrado';
  end if;
  return r;
end; $$;
revoke all on function public.projeto_do_chamador(jsonb, uuid) from public, anon, authenticated;

create or replace function public.projeto_resumo(r public.projetos)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id', r.id, 'noivos', r.noivos, 'data_evento', r.data_evento, 'local_evento', r.local_evento,
    'status', r.status, 'compartilhar', r.compartilhar, 'pedido_enviado_em', r.pedido_enviado_em,
    'atualizado_em', r.updated_at,
    'ambientes', jsonb_array_length(r.dados->'ambientes'),
    'itens', coalesce((select sum(coalesce((i->>'quantidade')::int, 1)) from jsonb_array_elements(r.dados->'ambientes') a, jsonb_array_elements(coalesce(a->'itens','[]'::jsonb)) i), 0),
    'renders', coalesce((select sum(jsonb_array_length(coalesce(a->'renders','[]'::jsonb))) from jsonb_array_elements(r.dados->'ambientes') a), 0),
    'dono', coalesce((select c.nome_razao from public.clientes_empresas c where c.id = r.cliente_id), 'Equipe')
  );
$$;
revoke all on function public.projeto_resumo(public.projetos) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.projeto_listar(p_token text default null, p_empresa_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; out jsonb;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  select coalesce(jsonb_agg(public.projeto_resumo(p) order by p.data_evento, p.created_at), '[]'::jsonb) into out
  from public.projetos p
  where p.empresa_id = (c->>'empresa_id')::uuid
    and ((c->>'equipe')::boolean is true or p.cliente_id = (c->>'cliente_id')::uuid);
  return out;
end; $$;

create or replace function public.projeto_obter(p_token text default null, p_empresa_id uuid default null, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; r public.projetos;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  r := public.projeto_do_chamador(c, p_id);
  return public.projeto_resumo(r) || jsonb_build_object(
    'dados', r.dados, 'slug', r.slug, 'pin_definido', r.pin_hash is not null,
    'pedido_observacao', r.pedido_observacao, 'pedido_snapshot', r.pedido_snapshot);
end; $$;

create or replace function public.projeto_criar(
  p_token text default null, p_empresa_id uuid default null,
  p_noivos text default null, p_data_evento date default null, p_local_evento text default null,
  p_ambientes jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; r public.projetos; amb jsonb := '[]'::jsonb; nome text; n int := 0;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  if p_noivos is null or length(btrim(p_noivos)) = 0 then raise exception 'Informe o nome dos noivos'; end if;
  if p_data_evento is null then raise exception 'Informe a data do evento'; end if;
  if p_local_evento is null or length(btrim(p_local_evento)) = 0 then raise exception 'Informe o local do evento'; end if;
  for nome in select btrim(value) from jsonb_array_elements_text(coalesce(p_ambientes, '[]'::jsonb)) loop
    if nome <> '' then
      amb := amb || jsonb_build_object('id', 'a' || substr(md5(random()::text || n::text), 1, 8), 'nome', left(nome, 60), 'itens', '[]'::jsonb, 'renders', '[]'::jsonb, 'notas', '');
      n := n + 1;
    end if;
  end loop;
  insert into public.projetos(empresa_id, cliente_id, criado_por, noivos, data_evento, local_evento, dados)
  values ((c->>'empresa_id')::uuid, nullif(c->>'cliente_id','')::uuid, nullif(c->>'uid','')::uuid,
          btrim(p_noivos), p_data_evento, btrim(p_local_evento), jsonb_build_object('ambientes', amb))
  returning * into r;
  return public.projeto_resumo(r) || jsonb_build_object('dados', r.dados, 'slug', r.slug, 'pin_definido', false);
end; $$;

create or replace function public.projeto_salvar(
  p_token text default null, p_empresa_id uuid default null, p_id uuid default null,
  p_noivos text default null, p_data_evento date default null, p_local_evento text default null,
  p_dados jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; r public.projetos;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  r := public.projeto_do_chamador(c, p_id);
  if p_noivos is null or length(btrim(p_noivos)) = 0 then raise exception 'Informe o nome dos noivos'; end if;
  if p_data_evento is null then raise exception 'Informe a data do evento'; end if;
  if p_local_evento is null or length(btrim(p_local_evento)) = 0 then raise exception 'Informe o local do evento'; end if;
  if p_dados is null or jsonb_typeof(p_dados->'ambientes') <> 'array' then raise exception 'Dados do projeto inválidos'; end if;
  if length(p_dados::text) > 600000 then raise exception 'Projeto grande demais'; end if;
  update public.projetos set noivos = btrim(p_noivos), data_evento = p_data_evento, local_evento = btrim(p_local_evento),
         dados = p_dados, updated_at = now()
   where id = r.id returning * into r;
  return public.projeto_resumo(r);
end; $$;

create or replace function public.projeto_excluir(p_token text default null, p_empresa_id uuid default null, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; r public.projetos;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  r := public.projeto_do_chamador(c, p_id);
  delete from public.projetos where id = r.id;
  return jsonb_build_object('ok', true);
end; $$;

-- Liga/desliga o link da apresentação. Ligar exige um PIN de 6 dígitos (novo, ou o já existente). O PIN só existe
-- em texto na hora de criar: no banco fica o hash (bcrypt) — quem perder o PIN gera outro.
create or replace function public.projeto_compartilhar(
  p_token text default null, p_empresa_id uuid default null, p_id uuid default null,
  p_ativo boolean default true, p_pin text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; r public.projetos;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  r := public.projeto_do_chamador(c, p_id);
  if p_ativo is not true then
    update public.projetos set compartilhar = false, updated_at = now() where id = r.id returning * into r;
    return jsonb_build_object('compartilhar', false, 'slug', r.slug, 'pin_definido', r.pin_hash is not null);
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{6}$' then raise exception 'O PIN precisa ter 6 números'; end if;
  if p_pin is null and r.pin_hash is null then raise exception 'Defina um PIN de 6 números'; end if;
  update public.projetos set
    compartilhar = true,
    slug = coalesce(r.slug, encode(extensions.gen_random_bytes(12), 'hex')),
    pin_hash = case when p_pin is not null then extensions.crypt(p_pin, extensions.gen_salt('bf')) else r.pin_hash end,
    pin_tentativas = case when p_pin is not null then 0 else r.pin_tentativas end,
    pin_bloqueado_ate = case when p_pin is not null then null else r.pin_bloqueado_ate end,
    updated_at = now()
  where id = r.id returning * into r;
  return jsonb_build_object('compartilhar', true, 'slug', r.slug, 'pin_definido', true);
end; $$;

-- Envia o projeto pra Chiavari como pedido: guarda uma FOTOGRAFIA dos itens e quantidades por ambiente (o que
-- mudar depois no projeto não altera o que foi enviado) e marca o status. NÃO cria linha nas tabelas de pedido do
-- ERP (separacoes_pedidos/itens): elas reservam estoque, e uma solicitação externa ainda não foi analisada.
create or replace function public.projeto_enviar_pedido(
  p_token text default null, p_empresa_id uuid default null, p_id uuid default null, p_observacao text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; r public.projetos; snap jsonb; total int;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  r := public.projeto_do_chamador(c, p_id);
  select coalesce(jsonb_agg(q.amb order by q.aord), '[]'::jsonb) into snap from (
    select t.aord, jsonb_build_object('ambiente', t.a->>'nome', 'itens', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'item_id', x.i->>'item_id', 'quantidade', coalesce((x.i->>'quantidade')::int, 1),
                 'nome', trim(concat_ws(' ', nullif(it.produto_base,''), it.produto)),
                 'referencia', it.referencia, 'categoria', it.categoria) order by x.ord), '[]'::jsonb)
          from jsonb_array_elements(coalesce(t.a->'itens', '[]'::jsonb)) with ordinality as x(i, ord)
          left join public.itens it on it.id::text = x.i->>'item_id' and it.empresa_id = r.empresa_id)) as amb
    from jsonb_array_elements(r.dados->'ambientes') with ordinality as t(a, aord)
  ) q;
  select coalesce(sum(coalesce((i->>'quantidade')::int, 1)), 0) into total
    from jsonb_array_elements(r.dados->'ambientes') a, jsonb_array_elements(coalesce(a->'itens', '[]'::jsonb)) i;
  if total = 0 then raise exception 'Adicione ao menos um item ao projeto antes de enviar o pedido'; end if;
  update public.projetos set status = 'pedido_enviado', pedido_enviado_em = now(), pedido_observacao = nullif(btrim(coalesce(p_observacao,'')),''),
         pedido_snapshot = jsonb_build_object('ambientes', snap, 'total_itens', total, 'enviado_em', now()), updated_at = now()
   where id = r.id returning * into r;
  return public.projeto_resumo(r);
end; $$;

-- Equipe acompanha a solicitação (recebido → em análise → convertido).
create or replace function public.projeto_atualizar_status(p_empresa_id uuid, p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c jsonb; r public.projetos;
begin
  c := public.projeto_ctx(null, p_empresa_id);
  if p_status not in ('pedido_enviado','em_analise','convertido') then raise exception 'Status inválido'; end if;
  r := public.projeto_do_chamador(c, p_id);
  update public.projetos set status = p_status, updated_at = now() where id = r.id returning * into r;
  return public.projeto_resumo(r);
end; $$;

-- Apresentação pública: link (slug) + PIN. 5 erros bloqueiam o link por 15 minutos (PIN de 6 números não sobrevive a
-- tentativa em massa sem isso). Devolve o projeto + dados básicos dos itens (nome, foto, medidas, material, cor) — nunca preço.
create or replace function public.projeto_publico(p_slug text, p_pin text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r public.projetos; itens jsonb; dec jsonb; emp jsonb;
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
    'projeto', jsonb_build_object('noivos', r.noivos, 'data_evento', r.data_evento, 'local_evento', r.local_evento, 'ambientes', r.dados->'ambientes'),
    'itens', itens, 'decorador', dec, 'empresa', emp);
end; $$;

-- Permissões: decorador e público chamam por anon; equipe por authenticated.
revoke all on function public.projeto_listar(text, uuid) from public;
revoke all on function public.projeto_obter(text, uuid, uuid) from public;
revoke all on function public.projeto_criar(text, uuid, text, date, text, jsonb) from public;
revoke all on function public.projeto_salvar(text, uuid, uuid, text, date, text, jsonb) from public;
revoke all on function public.projeto_excluir(text, uuid, uuid) from public;
revoke all on function public.projeto_compartilhar(text, uuid, uuid, boolean, text) from public;
revoke all on function public.projeto_enviar_pedido(text, uuid, uuid, text) from public;
revoke all on function public.projeto_atualizar_status(uuid, uuid, text) from public, anon;
revoke all on function public.projeto_publico(text, text) from public;
grant execute on function public.projeto_listar(text, uuid) to anon, authenticated, service_role;
grant execute on function public.projeto_obter(text, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.projeto_criar(text, uuid, text, date, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.projeto_salvar(text, uuid, uuid, text, date, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.projeto_excluir(text, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.projeto_compartilhar(text, uuid, uuid, boolean, text) to anon, authenticated, service_role;
grant execute on function public.projeto_enviar_pedido(text, uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function public.projeto_atualizar_status(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.projeto_publico(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Renderizações do projeto (imagens 3D/IA). Bucket público pra leitura (a página de apresentação as mostra pro casal;
-- o caminho tem o uuid do projeto — não é adivinhável) e upload de quem conhece um projeto existente da MESMA empresa:
-- o decorador não é usuário do Supabase Auth, então a política não pode exigir auth.uid().
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('projetos', 'projetos', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.projeto_existe(p_empresa text, p_projeto text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.projetos p where p.id::text = p_projeto and p.empresa_id::text = p_empresa);
$$;
revoke all on function public.projeto_existe(text, text) from public;
grant execute on function public.projeto_existe(text, text) to anon, authenticated, service_role;

drop policy if exists projetos_bucket_leitura on storage.objects;
create policy projetos_bucket_leitura on storage.objects for select using (bucket_id = 'projetos');
drop policy if exists projetos_bucket_upload on storage.objects;
create policy projetos_bucket_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'projetos' and public.projeto_existe((storage.foldername(name))[1], (storage.foldername(name))[2]));
drop policy if exists projetos_bucket_remover on storage.objects;
create policy projetos_bucket_remover on storage.objects for delete to anon, authenticated
  using (bucket_id = 'projetos' and public.projeto_existe((storage.foldername(name))[1], (storage.foldername(name))[2]));

commit;
