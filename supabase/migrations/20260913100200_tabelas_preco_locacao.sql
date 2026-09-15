-- Estrutura normalizada de tabelas de preço de locação, com histórico.
--
-- Contexto: a planilha real do cliente tem TRÊS colunas diferentes de
-- "Val Unitário Locação" (uma por tabela de preço/ano). O sistema hoje só
-- tem um campo por item (`itens.valor_locacao`), sem histórico. Este
-- arquivo cria a estrutura que falta, SEM remover `itens.valor_locacao` —
-- pedidos, contratos e o catálogo hoje leem esse campo diretamente/ao vivo
-- (confirmado por investigação: não existe snapshot de preço em nenhuma
-- outra tabela hoje, então nada quebra ao manter esse campo). Ele passa a
-- ser espelhado automaticamente (trigger) a partir da tabela de preço
-- marcada como ativa, então continua correto sem exigir mudança em nenhuma
-- tela que já lê `itens.valor_locacao`.

create extension if not exists pgcrypto;

-- =====================================================================
-- 1. Tabelas de preço (uma linha por "tabela" — ex.: "Tabela 2025 Padrão")
-- =====================================================================
create table if not exists public.tabelas_preco (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  ano_referencia integer not null,
  vigencia_inicio date,
  vigencia_fim date,
  ativa boolean not null default false,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tabelas_preco_ano_valido check (ano_referencia between 2000 and 2100),
  constraint tabelas_preco_vigencia_valida check (
    vigencia_inicio is null or vigencia_fim is null or vigencia_fim >= vigencia_inicio
  )
);

comment on table public.tabelas_preco is 'Tabelas de preço de locação por empresa/ano — permite manter histórico (nunca sobrescrito) e ter mais de uma tabela vigente/ativa ao mesmo tempo (ex.: tabelas diferentes por canal).';

create index if not exists tabelas_preco_empresa_idx on public.tabelas_preco (empresa_id);
create index if not exists tabelas_preco_empresa_ativa_idx on public.tabelas_preco (empresa_id, ativa);

-- Duas tabelas da mesma empresa não podem ter o mesmo nome no mesmo ano
-- (evita duplicar a "mesma" tabela ao reimportar a planilha).
create unique index if not exists tabelas_preco_empresa_nome_ano_uidx
  on public.tabelas_preco (empresa_id, nome, ano_referencia);

drop trigger if exists tabelas_preco_set_updated_at on public.tabelas_preco;
create or replace function public.tabelas_preco_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger tabelas_preco_set_updated_at
before update on public.tabelas_preco
for each row execute function public.tabelas_preco_touch_updated_at();

-- =====================================================================
-- 2. Preço de cada item dentro de cada tabela
-- =====================================================================
create table if not exists public.itens_precos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tabela_preco_id uuid not null references public.tabelas_preco(id) on delete cascade,
  item_id uuid not null references public.itens(id) on delete cascade,
  valor_locacao numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint itens_precos_valor_nao_negativo check (valor_locacao >= 0)
);

comment on table public.itens_precos is 'Preço de locação de um item dentro de uma tabela de preço específica. Nunca é apagado por uma nova importação/tabela — cada ano/tabela fica com seu próprio histórico.';

-- Impede o mesmo item duplicado dentro da mesma tabela de preço.
create unique index if not exists itens_precos_tabela_item_uidx
  on public.itens_precos (tabela_preco_id, item_id);

create index if not exists itens_precos_item_idx on public.itens_precos (item_id);
create index if not exists itens_precos_empresa_idx on public.itens_precos (empresa_id);
create index if not exists itens_precos_tabela_idx on public.itens_precos (tabela_preco_id);

drop trigger if exists itens_precos_set_updated_at on public.itens_precos;
create or replace function public.itens_precos_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger itens_precos_set_updated_at
before update on public.itens_precos
for each row execute function public.itens_precos_touch_updated_at();

-- =====================================================================
-- 3. Espelhar o preço ativo em `itens.valor_locacao` (compatibilidade)
-- =====================================================================
-- Mantém todo o código existente (pedidos, catálogo, kits) funcionando sem
-- alteração: eles continuam lendo `itens.valor_locacao` ao vivo, e esse
-- valor passa a ser mantido em dia automaticamente a partir da tabela de
-- preço ativa. Não apaga nem sobrescreve o histórico em `itens_precos` —
-- só copia o valor mais recente de uma tabela ativa para o item.
create or replace function public.sync_itens_valor_locacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.tabelas_preco tp
    where tp.id = new.tabela_preco_id and tp.ativa = true
  ) then
    update public.itens
       set valor_locacao = new.valor_locacao,
           updated_at = now()
     where id = new.item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists itens_precos_sync_valor_locacao on public.itens_precos;
create trigger itens_precos_sync_valor_locacao
after insert or update of valor_locacao, tabela_preco_id on public.itens_precos
for each row execute function public.sync_itens_valor_locacao();

-- Quando uma tabela é ativada, propaga todos os preços dela pros itens de
-- uma vez (sem isso, só itens tocados DEPOIS da ativação ficariam em dia).
create or replace function public.sync_itens_valor_locacao_on_activate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ativa = true and coalesce(old.ativa, false) = false then
    update public.itens i
       set valor_locacao = ip.valor_locacao,
           updated_at = now()
      from public.itens_precos ip
     where ip.tabela_preco_id = new.id
       and ip.item_id = i.id;
  end if;
  return new;
end;
$$;

drop trigger if exists tabelas_preco_sync_on_activate on public.tabelas_preco;
create trigger tabelas_preco_sync_on_activate
after update of ativa on public.tabelas_preco
for each row execute function public.sync_itens_valor_locacao_on_activate();

-- =====================================================================
-- 4. RLS — mesmo padrão usado pelas migrations mais recentes do projeto
--    (join em usuarios_empresas, nunca comparar empresa_id com auth.uid()).
-- =====================================================================
alter table public.tabelas_preco enable row level security;

drop policy if exists tabelas_preco_select on public.tabelas_preco;
create policy tabelas_preco_select
on public.tabelas_preco
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = tabelas_preco.empresa_id
  )
);

drop policy if exists tabelas_preco_write on public.tabelas_preco;
create policy tabelas_preco_write
on public.tabelas_preco
for all
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = tabelas_preco.empresa_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = tabelas_preco.empresa_id
  )
);

alter table public.itens_precos enable row level security;

drop policy if exists itens_precos_select on public.itens_precos;
create policy itens_precos_select
on public.itens_precos
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_precos.empresa_id
  )
);

drop policy if exists itens_precos_write on public.itens_precos;
create policy itens_precos_write
on public.itens_precos
for all
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_precos.empresa_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_precos.empresa_id
  )
  and exists (
    select 1 from public.tabelas_preco tp
    where tp.id = itens_precos.tabela_preco_id
      and tp.empresa_id = itens_precos.empresa_id
  )
  and exists (
    select 1 from public.itens i
    where i.id = itens_precos.item_id
      and i.empresa_id = itens_precos.empresa_id
  )
);
