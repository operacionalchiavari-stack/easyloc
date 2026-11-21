-- Central de Metas e Meu Bônus fora das planilhas do Google (nov/2026).
-- As planilhas da Central (Metas, Fechamentos, Pagamentos Bonus, Premiacoes, Comissão O.S, Bonus-Operações)
-- estavam vazias; tudo começa do zero aqui. Só a Edge Function central-metas lê e grava (chave de serviço):
-- os cálculos precisam do salário, que fica cifrado no cofre e só abre no servidor.

create table if not exists public.central_config (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create table if not exists public.central_metas (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  mes smallint not null check (mes between 1 and 12),
  setor text not null,
  producao numeric, tempo numeric, qualidade numeric, prazo numeric,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, mes, setor)
);

create table if not exists public.central_fechamentos (
  id text primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  fechado_em timestamptz not null default now(),
  fechado_por text,
  fechado_por_id uuid,
  dados jsonb not null,
  unique (empresa_id, mes)
);

create table if not exists public.central_pagamentos (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  chave text not null,
  valor_pago numeric not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (empresa_id, mes, chave)
);

create table if not exists public.central_premiacoes (
  id text primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  chave text not null,
  nome text,
  descricao text not null,
  valor numeric not null check (valor >= 0),
  foto_url text,
  foto_entrega_url text,
  link text,
  data_compra date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists central_premiacoes_emp on public.central_premiacoes(empresa_id, mes);

alter table public.central_config enable row level security;
alter table public.central_metas enable row level security;
alter table public.central_fechamentos enable row level security;
alter table public.central_pagamentos enable row level security;
alter table public.central_premiacoes enable row level security;
revoke all on public.central_config, public.central_metas, public.central_fechamentos,
  public.central_pagamentos, public.central_premiacoes from anon, authenticated;

-- Sessão do Meu Bônus (CPF + PIN do RH). Mesma tabela/tipo das sessões do App do Montador.
create or replace function public.central_equipe_sessao(p_empresa uuid, p_funcionario uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare f funcionarios_acesso; t text := app_novo_token();
begin
  select * into f from funcionarios_acesso where id = p_funcionario and empresa_id = p_empresa and ativo;
  if f.id is null then raise exception 'Cadastro não encontrado ou inativo.'; end if;
  insert into app_sessoes (token_hash, tipo, empresa_id, funcionario_id, nome, perfil, expira_em)
  values (app_hash(t), 'montador', p_empresa, f.id, f.nome, 'BONUS', now() + interval '12 hours');
  return jsonb_build_object('token', t, 'nome', f.nome);
end $$;
revoke all on function public.central_equipe_sessao(uuid, uuid) from public, anon, authenticated;
grant execute on function public.central_equipe_sessao(uuid, uuid) to service_role;

create or replace function public.central_equipe_sair(p_token text)
returns void language sql security definer set search_path to 'public' as $$
  delete from app_sessoes where token_hash = app_hash(p_token) and tipo = 'montador' and perfil = 'BONUS';
$$;
revoke all on function public.central_equipe_sair(text) from public, anon, authenticated;
grant execute on function public.central_equipe_sair(text) to service_role;

-- Para quem a sessão do montador/bônus pertence (o servidor abre o extrato dessa pessoa).
create or replace function public.central_sessao_funcionario(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s app_sessoes := app_sessao(p_token, 'montador');
begin
  if s.funcionario_id is null then raise exception 'Meu bônus está disponível no acesso individual do funcionário.'; end if;
  return jsonb_build_object('empresa_id', s.empresa_id, 'funcionario_id', s.funcionario_id);
end $$;
revoke all on function public.central_sessao_funcionario(text) from public, anon, authenticated;
grant execute on function public.central_sessao_funcionario(text) to service_role;
