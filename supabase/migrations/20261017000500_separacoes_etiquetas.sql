-- Etiquetas de envio (out/2026, etapa 3): geradas na separação, uma por móvel do pedido ("como encomenda do
-- Mercado Livre"). O código vai no QR como ACERVO:ENV:<codigo>; ler a etiqueta marca aquela unidade.
-- As colunas de leitura do carregamento e da volta já ficam prontas para as próximas etapas.
create table if not exists public.separacoes_etiquetas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  separacao_pedido_id uuid not null references public.separacoes_pedidos(id) on delete cascade,
  separacao_item_id uuid references public.separacoes_itens(id) on delete cascade,
  item_id uuid references public.itens(id) on delete set null,
  codigo text not null,
  sequencia integer not null,
  total_item integer not null,
  lida_separacao_em timestamptz,
  lida_carregamento_em timestamptz,
  lida_retorno_em timestamptz,
  created_at timestamptz not null default now(),
  unique (empresa_id, codigo),
  unique (separacao_item_id, sequencia)
);
create index if not exists separacoes_etiquetas_pedido_idx on public.separacoes_etiquetas (separacao_pedido_id);

alter table public.separacoes_etiquetas enable row level security;
drop policy if exists separacoes_etiquetas_empresa_all on public.separacoes_etiquetas;
create policy separacoes_etiquetas_empresa_all on public.separacoes_etiquetas for all to authenticated
  using (public.eh_membro_empresa(empresa_id)) with check (public.eh_membro_empresa(empresa_id));
drop policy if exists funcionario_acesso_select on public.separacoes_etiquetas;
create policy funcionario_acesso_select on public.separacoes_etiquetas as restrictive for select to authenticated
  using (public.funcionario_tabela_permitida(empresa_id, 'separacoes_etiquetas', 'visualizar'));
drop policy if exists funcionario_acesso_insert on public.separacoes_etiquetas;
create policy funcionario_acesso_insert on public.separacoes_etiquetas as restrictive for insert to authenticated
  with check (public.funcionario_tabela_permitida(empresa_id, 'separacoes_etiquetas', 'criar'));
drop policy if exists funcionario_acesso_update on public.separacoes_etiquetas;
create policy funcionario_acesso_update on public.separacoes_etiquetas as restrictive for update to authenticated
  using (public.funcionario_tabela_permitida(empresa_id, 'separacoes_etiquetas', 'editar'))
  with check (public.funcionario_tabela_permitida(empresa_id, 'separacoes_etiquetas', 'editar'));
drop policy if exists funcionario_acesso_delete on public.separacoes_etiquetas;
create policy funcionario_acesso_delete on public.separacoes_etiquetas as restrictive for delete to authenticated
  using (public.funcionario_tabela_permitida(empresa_id, 'separacoes_etiquetas', 'excluir'));
