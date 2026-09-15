-- Correção de segurança encontrada durante a investigação para a
-- importação em massa (não é uma funcionalidade nova — é um conserto de
-- isolamento por empresa que já deveria existir).
--
-- Investigação direta no banco (via `supabase db query --linked`, somente
-- leitura) encontrou:
--
-- 1. `public.itens` tinha DUAS políticas de SELECT simultâneas: a correta
--    ("Select itens da empresa", via usuarios_empresas) e uma segunda,
--    "itens_select", com `using (true)` para o role `public` — como
--    políticas permissivas do Postgres são combinadas com OR, a segunda
--    política sozinha já deixava QUALQUER usuário (autenticado ou não, já
--    que o role era `public`, não `authenticated`) ler os itens de
--    QUALQUER empresa. Also havia "itens_insert_empresa" com
--    `with_check: (empresa_id = auth.uid()) OR (empresa_id IS NOT NULL)`
--    — como "empresa_id IS NOT NULL" é verdadeiro pra quase todo insert,
--    essa condição também era, na prática, sempre verdadeira.
--
-- 2. `public.kit_itens` tinha políticas "permitir_*_kit_itens" com
--    `using/with_check: true` para o role `authenticated` — qualquer
--    usuário autenticado (de qualquer empresa) podia ler/escrever os
--    componentes de kit de QUALQUER empresa. As políticas
--    "kit_itens_*_empresa" que deveriam restringir por empresa comparavam
--    `empresa_id = auth.uid()` — errado (auth.uid() é o id do USUÁRIO, não
--    da empresa), então nem essas cumpriam a função pretendida.
--
-- 3. `public.fornecedores` tinha RLS **desabilitado por completo**
--    (`relrowsecurity = false`) — nenhum isolamento por empresa existia
--    nessa tabela.
--
-- Esta migration remove as políticas quebradas/permissivas e recria o
-- isolamento correto no padrão já usado pelo restante do projeto (join em
-- usuarios_empresas). Não é uma mudança destrutiva: nenhuma linha é
-- apagada, só o controle de acesso é corrigido. É idempotente (drop-then-
-- create), então pode ser reaplicada sem erro.

-- =====================================================================
-- 1. itens — remove as políticas permissivas/quebradas, mantém a correta
-- =====================================================================
drop policy if exists "itens_select" on public.itens;
drop policy if exists "itens_insert_empresa" on public.itens;

-- Garante que as políticas corretas existem com a definição esperada
-- (idempotente — se já existirem exatamente assim, drop+create não muda
-- nada visível).
drop policy if exists "Select itens da empresa" on public.itens;
create policy "Select itens da empresa"
on public.itens
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens.empresa_id
  )
);

drop policy if exists "Insert itens da empresa" on public.itens;
create policy "Insert itens da empresa"
on public.itens
for insert
to authenticated
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens.empresa_id
  )
);

drop policy if exists "Update itens da empresa" on public.itens;
create policy "Update itens da empresa"
on public.itens
for update
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens.empresa_id
  )
);

drop policy if exists "Delete itens da empresa" on public.itens;
create policy "Delete itens da empresa"
on public.itens
for delete
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens.empresa_id
  )
);

-- =====================================================================
-- 2. kit_itens — mesma limpeza
-- =====================================================================
drop policy if exists "permitir_select_kit_itens" on public.kit_itens;
drop policy if exists "permitir_insert_kit_itens" on public.kit_itens;
drop policy if exists "permitir_update_kit_itens" on public.kit_itens;
drop policy if exists "permitir_delete_kit_itens" on public.kit_itens;
drop policy if exists "kit_itens_select_empresa" on public.kit_itens;
drop policy if exists "kit_itens_insert_empresa" on public.kit_itens;
drop policy if exists "kit_itens_update_empresa" on public.kit_itens;
drop policy if exists "kit_itens_delete_empresa" on public.kit_itens;

create policy "kit_itens_select_empresa"
on public.kit_itens
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = kit_itens.empresa_id
  )
);

create policy "kit_itens_insert_empresa"
on public.kit_itens
for insert
to authenticated
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = kit_itens.empresa_id
  )
);

create policy "kit_itens_update_empresa"
on public.kit_itens
for update
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = kit_itens.empresa_id
  )
);

create policy "kit_itens_delete_empresa"
on public.kit_itens
for delete
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = kit_itens.empresa_id
  )
);

-- =====================================================================
-- 3. fornecedores — RLS estava desligado; liga e isola por empresa
-- =====================================================================
alter table public.fornecedores enable row level security;

drop policy if exists "fornecedores_select_empresa" on public.fornecedores;
create policy "fornecedores_select_empresa"
on public.fornecedores
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = fornecedores.empresa_id
  )
);

drop policy if exists "fornecedores_insert_empresa" on public.fornecedores;
create policy "fornecedores_insert_empresa"
on public.fornecedores
for insert
to authenticated
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = fornecedores.empresa_id
  )
);

drop policy if exists "fornecedores_update_empresa" on public.fornecedores;
create policy "fornecedores_update_empresa"
on public.fornecedores
for update
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = fornecedores.empresa_id
  )
);

drop policy if exists "fornecedores_delete_empresa" on public.fornecedores;
create policy "fornecedores_delete_empresa"
on public.fornecedores
for delete
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = fornecedores.empresa_id
  )
);
