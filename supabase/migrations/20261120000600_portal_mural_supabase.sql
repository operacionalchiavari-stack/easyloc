-- Mural da Início fora da planilha do Portal (nov/2026): avisos e recados de aniversário viram tabelas.
-- Só a Edge Function central-metas lê e grava (chave de serviço; ela confere o login da equipe).
-- As linhas que existiam nas abas Mural_Avisos e Mural_Parabens são copiadas com o mesmo ID (os anexos dos
-- avisos, em portal_avisos_anexos, continuam ligados pelo AVI_…).

create table if not exists public.portal_avisos (
  id text primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  titulo text not null,
  texto text not null,
  prioridade text not null default 'INFO' check (prioridade in ('INFO', 'IMPORTANTE')),
  fixado boolean not null default false,
  valido_ate date,
  autor text,
  autor_id uuid,
  publicado_em timestamptz not null default now(),
  cor text not null default 'neutro' check (cor in ('neutro', 'areia', 'verde', 'azul', 'lavanda'))
);
create index if not exists portal_avisos_emp on public.portal_avisos(empresa_id, publicado_em desc);

create table if not exists public.portal_parabens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  destinatario text not null,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  autor_id uuid,
  autor text,
  texto text not null check (length(texto) between 1 and 300),
  foto text,
  criado_em timestamptz not null default now()
);
create index if not exists portal_parabens_emp on public.portal_parabens(empresa_id, mes);

alter table public.portal_avisos enable row level security;
alter table public.portal_parabens enable row level security;
revoke all on public.portal_avisos, public.portal_parabens from anon, authenticated;

insert into public.portal_avisos (id, empresa_id, titulo, texto, prioridade, fixado, valido_ate, autor, publicado_em, cor)
select v->>0, gs_empresa_dona(), coalesce(nullif(v->>1, ''), 'Aviso'), coalesce(nullif(v->>2, ''), v->>1, ''),
  case when v->>3 = 'IMPORTANTE' then 'IMPORTANTE' else 'INFO' end, v->>4 = 'SIM',
  case when v->>5 ~ '^\d{4}-\d{2}-\d{2}$' then (v->>5)::date end, v->>6,
  coalesce(case when v->>7 ~ '^\d{2}/\d{2}/\d{4}' then to_timestamp(v->>7, 'DD/MM/YYYY HH24:MI:SS') at time zone 'America/Sao_Paulo' end, now()),
  case when v->>8 in ('neutro', 'areia', 'verde', 'azul', 'lavanda') then v->>8 else 'neutro' end
from (select valores v from gs_linhas where aba = 'Mural_Avisos' and linha > 1 and coalesce(valores->>0, '') like 'AVI_%') x
on conflict (id) do nothing;

insert into public.portal_parabens (empresa_id, destinatario, mes, autor_id, autor, texto, foto)
select gs_empresa_dona(), coalesce(v->>1, 'todos'), v->>2,
  case when v->>3 ~ '^[0-9a-f-]{36}$' then (v->>3)::uuid end, v->>4, left(v->>5, 300), nullif(v->>7, '')
from (select valores v from gs_linhas where aba = 'Mural_Parabens' and linha > 1) x
where coalesce(v->>2, '') ~ '^\d{4}-\d{2}$' and length(coalesce(v->>5, '')) between 1 and 300;
