-- =====================================================================
-- Motor de compatibilidade dos sistemas que vieram do Google Apps Script
-- (Cronograma, Equipe Free, App do Montador, Painel da RH...).
--
-- Cada aba de planilha vira um conjunto de linhas (valores em jsonb, na
-- mesma ordem das colunas da planilha). O código original roda na Vercel
-- (api/gs.js) sem alterações de regra: o "SpreadsheetApp" de lá lê e grava
-- aqui. Datas ficam como {"$d": "ISO"} dentro do jsonb.
--
-- Acesso: só o servidor (service role). Nenhuma política para anon/auth —
-- os dados de RH (CPF, PIX, pagamentos) nunca saem direto para o navegador.
-- =====================================================================

create table if not exists public.gs_planilhas (
  id          text primary key,              -- id da planilha no Google (mantido como chave)
  nome        text not null,
  fuso        text not null default 'America/Sao_Paulo',
  criado_em   timestamptz not null default now()
);

create table if not exists public.gs_abas (
  planilha_id text not null references public.gs_planilhas(id) on delete cascade,
  nome        text not null,
  sheet_id    bigint,
  ordem       int not null default 0,
  colunas     int not null default 0,
  formatos    jsonb not null default '[]'::jsonb,   -- formato de número por coluna (para getDisplayValues)
  versao      bigint not null default 1,
  atualizado_em timestamptz not null default now(),
  primary key (planilha_id, nome)
);

create table if not exists public.gs_linhas (
  planilha_id text not null,
  aba         text not null,
  linha       int  not null,                       -- 1 = cabeçalho, igual à planilha
  valores     jsonb not null default '[]'::jsonb,
  primary key (planilha_id, aba, linha),
  foreign key (planilha_id, aba) references public.gs_abas(planilha_id, nome) on delete cascade on update cascade
);

create table if not exists public.gs_propriedades (
  projeto text not null,
  chave   text not null,
  valor   text,
  primary key (projeto, chave)
);

create table if not exists public.gs_cache (
  projeto  text not null,
  chave    text not null,
  valor    text,
  expira_em timestamptz not null,
  primary key (projeto, chave)
);
create index if not exists gs_cache_expira on public.gs_cache (expira_em);

alter table public.gs_planilhas    enable row level security;
alter table public.gs_abas         enable row level security;
alter table public.gs_linhas       enable row level security;
alter table public.gs_propriedades enable row level security;
alter table public.gs_cache        enable row level security;

-- ---------------------------------------------------------------------
-- Leitura de uma aba inteira (sem o limite de 1000 linhas do PostgREST)
-- ---------------------------------------------------------------------
create or replace function public.gs_ler_aba(p_planilha text, p_aba text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'versao', a.versao,
    'colunas', a.colunas,
    'formatos', a.formatos,
    'sheet_id', a.sheet_id,
    'linhas', coalesce((
      select jsonb_agg(l.valores order by l.linha)
      from public.gs_linhas l
      where l.planilha_id = a.planilha_id and l.aba = a.nome
    ), '[]'::jsonb)
  )
  from public.gs_abas a
  where a.planilha_id = p_planilha and a.nome = p_aba;
$$;

-- Versões de todas as abas (para o servidor reaproveitar o que já tem em memória)
create or replace function public.gs_versoes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'planilhas', coalesce((select jsonb_object_agg(p.id, jsonb_build_object('nome', p.nome, 'fuso', p.fuso)) from public.gs_planilhas p), '{}'::jsonb),
    'abas', coalesce((select jsonb_agg(jsonb_build_array(a.planilha_id, a.nome, a.versao, a.ordem, a.sheet_id) order by a.planilha_id, a.ordem) from public.gs_abas a), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- Gravação atômica do que uma chamada alterou.
-- p_dados = {
--   "conferir": [[planilha, aba, versao_lida], ...]   -- se mudou, CONFLITO e o servidor roda de novo
--   "abas": [{ planilha, aba, nova, modo: "linhas"|"tudo", linhas: [[n, valores], ...],
--              total, colunas, formatos, sheet_id, ordem, excluir }],
--   "props": [[projeto, chave, valor|null], ...],
--   "cache": [[projeto, chave, valor|null, segundos], ...]
-- }
-- ---------------------------------------------------------------------
create or replace function public.gs_gravar(p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb;
  a jsonb;
  l jsonb;
  v_atual bigint;
begin
  -- Uma gravação por vez (equivale ao LockService do Apps Script)
  perform pg_advisory_xact_lock(hashtext('gs_gravar'));

  for c in select * from jsonb_array_elements(coalesce(p_dados->'conferir', '[]'::jsonb)) loop
    select versao into v_atual from public.gs_abas where planilha_id = c->>0 and nome = c->>1;
    if coalesce(v_atual, 0) <> coalesce((c->>2)::bigint, 0) then
      raise exception 'GS_CONFLITO %/%', c->>0, c->>1 using errcode = 'P0001';
    end if;
  end loop;

  for c in select * from jsonb_array_elements(coalesce(p_dados->'planilhas', '[]'::jsonb)) loop
    insert into public.gs_planilhas (id, nome, fuso) values (c->>0, c->>1, coalesce(c->>2, 'America/Sao_Paulo'))
    on conflict (id) do update set nome = excluded.nome;
  end loop;

  for a in select * from jsonb_array_elements(coalesce(p_dados->'abas', '[]'::jsonb)) loop
    if coalesce((a->>'excluir')::boolean, false) then
      delete from public.gs_abas where planilha_id = a->>'planilha' and nome = a->>'aba';
      continue;
    end if;

    insert into public.gs_abas (planilha_id, nome, sheet_id, ordem, colunas, formatos)
    values (a->>'planilha', a->>'aba', (a->>'sheet_id')::bigint, coalesce((a->>'ordem')::int, 999),
            coalesce((a->>'colunas')::int, 0), coalesce(a->'formatos', '[]'::jsonb))
    on conflict (planilha_id, nome) do update
      set colunas = coalesce((excluded.colunas), gs_abas.colunas),
          formatos = case when a ? 'formatos' then excluded.formatos else gs_abas.formatos end,
          versao = gs_abas.versao + 1,
          atualizado_em = now();

    if a->>'modo' = 'tudo' then
      delete from public.gs_linhas where planilha_id = a->>'planilha' and aba = a->>'aba';
    end if;

    for l in select * from jsonb_array_elements(coalesce(a->'linhas', '[]'::jsonb)) loop
      insert into public.gs_linhas (planilha_id, aba, linha, valores)
      values (a->>'planilha', a->>'aba', (l->>0)::int, l->1)
      on conflict (planilha_id, aba, linha) do update set valores = excluded.valores;
    end loop;

    if a ? 'total' then
      delete from public.gs_linhas
      where planilha_id = a->>'planilha' and aba = a->>'aba' and linha > (a->>'total')::int;
    end if;
  end loop;

  for c in select * from jsonb_array_elements(coalesce(p_dados->'props', '[]'::jsonb)) loop
    if c->>2 is null then
      delete from public.gs_propriedades where projeto = c->>0 and chave = c->>1;
    else
      insert into public.gs_propriedades (projeto, chave, valor) values (c->>0, c->>1, c->>2)
      on conflict (projeto, chave) do update set valor = excluded.valor;
    end if;
  end loop;

  for c in select * from jsonb_array_elements(coalesce(p_dados->'cache', '[]'::jsonb)) loop
    if c->>2 is null then
      delete from public.gs_cache where projeto = c->>0 and chave = c->>1;
    else
      insert into public.gs_cache (projeto, chave, valor, expira_em)
      values (c->>0, c->>1, c->>2, now() + make_interval(secs => coalesce((c->>3)::int, 600)))
      on conflict (projeto, chave) do update set valor = excluded.valor, expira_em = excluded.expira_em;
    end if;
  end loop;

  delete from public.gs_cache where expira_em < now() - interval '1 day';
  return jsonb_build_object('ok', true);
end;
$$;

-- Propriedades e cache de um projeto (lidos no começo de cada chamada)
create or replace function public.gs_estado(p_projeto text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'props', coalesce((select jsonb_object_agg(chave, valor) from public.gs_propriedades where projeto = p_projeto), '{}'::jsonb)
  );
$$;

create or replace function public.gs_cache_ler(p_projeto text, p_chave text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select valor from public.gs_cache where projeto = p_projeto and chave = p_chave and expira_em > now();
$$;

-- Fotos e arquivos novos (as fotos antigas continuam no Google Drive)
insert into storage.buckets (id, name, public)
values ('gs-arquivos', 'gs-arquivos', true)
on conflict (id) do nothing;

revoke all on function public.gs_ler_aba(text, text) from public, anon, authenticated;
revoke all on function public.gs_versoes() from public, anon, authenticated;
revoke all on function public.gs_gravar(jsonb) from public, anon, authenticated;
revoke all on function public.gs_estado(text) from public, anon, authenticated;
revoke all on function public.gs_cache_ler(text, text) from public, anon, authenticated;
grant execute on function public.gs_ler_aba(text, text) to service_role;
grant execute on function public.gs_versoes() to service_role;
grant execute on function public.gs_gravar(jsonb) to service_role;
grant execute on function public.gs_estado(text) to service_role;
grant execute on function public.gs_cache_ler(text, text) to service_role;
