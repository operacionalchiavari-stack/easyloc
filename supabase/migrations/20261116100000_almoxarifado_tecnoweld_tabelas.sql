-- Almoxarifado novo (cópia do da Tecnoweld, adaptada). Começa vazio (decisão do usuário, 16/11/2026).
-- Tabelas com os mesmos nomes da Tecnoweld para as funções e telas portadas ficarem iguais.
-- Empresa = a do usuário logado (todo usuário tem uma empresa em usuarios_empresas).

create extension if not exists pgcrypto with schema extensions;

create or replace function public.almox_empresa() returns uuid
language sql stable security definer set search_path to 'public' as $$
  select ue.empresa_id from public.usuarios_empresas ue where ue.user_id = auth.uid() order by ue.empresa_id limit 1
$$;

-- Pessoa que está usando o sistema (o id do Cadastro de Funcionários é o id do login).
create or replace function public.almox_funcionario() returns uuid
language sql stable security definer set search_path to 'public' as $$
  select case when auth.uid() is not null and public.eh_membro_empresa(public.almox_empresa()) then auth.uid() end
$$;

-- Nomes de permissão da Tecnoweld -> chaves daqui.
create or replace function public.almox_tw_pode(p_nome text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.almox_empresa() is not null and public.operacao_pode(public.almox_empresa(), case
    when p_nome in ('Acessar almoxarifado') then 'estoque.almoxarifado.visualizar'
    when p_nome in ('Ajustar saldo','Editar parametros do sistema') then 'estoque.almoxarifado.aprovar'
    when p_nome in ('Acessar gestao de pessoas') then 'rh.colaboradores.visualizar'
    when p_nome in ('Editar colaboradores') then 'rh.colaboradores.editar'
    when p_nome in ('Acessar compras') then 'estoque.compras.visualizar'
    else 'estoque.almoxarifado.movimentar' end)
$$;

-- Setores (Parâmetros > RH) e funcionários, no formato que as funções da Tecnoweld esperam.
create or replace view public.almox_setores with (security_invoker = true) as
  select o.id, o.empresa_id, o.nome, null::text as cor, o.nome as tipo, o.ativo
    from public.rh_cadastro_opcoes o where o.tipo = 'setor';

create or replace view public.almox_funcionarios with (security_invoker = true) as
  select f.id, f.empresa_id, f.nome, f.ativo, f.foto_url, f.setor as setor_nome, f.cargo,
         (select s.id from public.rh_cadastro_opcoes s where s.empresa_id = f.empresa_id and s.tipo = 'setor'
           and lower(trim(s.nome)) = lower(trim(coalesce(f.setor, ''))) limit 1) as setor_id,
         f.pin_hash is not null as tem_pin
    from public.funcionarios_acesso f;

-- ---------- Cadastros de apoio ----------
create table public.warehouse_material_categories (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  nome text not null, ordem integer not null default 1, created_at timestamptz not null default now(),
  unique (empresa_id, nome));

create table public.warehouse_material_types (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  nome text not null, sigla text not null, ultimo_numero integer not null default 0, ativo boolean not null default true,
  created_at timestamptz not null default now(),
  requer_comprimento boolean not null default false, requer_largura boolean not null default false, requer_espessura boolean not null default false,
  unidade text not null default 'UN',
  requer_diametro boolean not null default false, requer_parede boolean not null default false,
  requer_diametro_interno boolean not null default false, requer_diametro_externo boolean not null default false,
  unique (empresa_id, sigla));

create table public.warehouse_unit_types (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  codigo text not null, nome text not null, ordem integer not null default 1,
  requer_largura boolean not null default false, requer_comprimento boolean not null default false, requer_espessura boolean not null default false,
  created_at timestamptz not null default now(), unique (empresa_id, codigo));

create table public.warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  codigo text not null, nome text, descricao text, setor_id uuid, ativo boolean not null default true,
  created_at timestamptz not null default now(), unique (empresa_id, codigo));

-- ---------- Materiais ----------
create sequence if not exists public.warehouse_materials_codigo_seq;

create table public.warehouse_materials (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  codigo text not null, nome text not null, especificacao text, grupo text, categoria text,
  status text not null default 'disponivel',
  quantidade_disponivel numeric not null default 0, quantidade_reservada numeric not null default 0,
  unidade text, localizacao text, lote text, fornecedor text, heat text,
  estoque_minimo numeric not null default 0, estoque_ideal numeric not null default 0,
  valor_unitario numeric not null default 0,
  foto_url text, desenho_url text, qr_code text, op_origem text,
  largura_maxima numeric, comprimento_maximo numeric, espessura numeric, peso_aproximado numeric,
  classificacao text, emprestado_ate date, observacoes text, dados_tecnicos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  tipo_material text, material_referencia text, perda_percentual_padrao numeric not null default 0,
  location_id uuid references public.warehouse_locations(id) on delete set null,
  type_id uuid references public.warehouse_material_types(id),
  item_numero integer, medida_numero integer, exige_lote boolean not null default false,
  diametro numeric, parede numeric, diametro_interno numeric, diametro_externo numeric,
  unique (empresa_id, codigo));
create index warehouse_materials_empresa_nome on public.warehouse_materials(empresa_id, nome);

create table public.warehouse_movements (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  material_id uuid references public.warehouse_materials(id) on delete set null,
  tipo text not null, quantidade numeric not null default 0, unidade text,
  setor_id uuid, responsavel_id uuid, op_numero text, documento text, localizacao text, observacao text,
  created_at timestamptz not null default now(),
  estoque_anterior numeric, estoque_atual numeric, origem text, valor_unitario numeric, valor_total numeric,
  fornecedor text, chave_nfe text, recebimento_nfe_id uuid, solicitante_id uuid, volume_id uuid, operation_id uuid,
  source_location_id uuid, destination_location_id uuid, related_movement_id uuid, batch_id uuid, cost_price_source text,
  responsavel_nome text, solicitante_nome text, setor_nome text);
create index warehouse_movements_empresa_data on public.warehouse_movements(empresa_id, created_at desc);
create index warehouse_movements_material on public.warehouse_movements(material_id, created_at desc);

create table public.warehouse_operations (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  operation_type text not null, destination_type text, production_order_id uuid,
  requester_id uuid, separated_by uuid, authorized_by uuid, sector_id uuid, note text,
  idempotency_key text not null, created_at timestamptz not null default now(), unique (empresa_id, idempotency_key));

-- ---------- Contagem mensal ----------
create table public.warehouse_count_cycles (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero integer not null, iniciado_em timestamptz not null default now(), concluido_em timestamptz, concluido_por uuid);
create unique index warehouse_count_cycles_aberto on public.warehouse_count_cycles(empresa_id) where concluido_em is null;

create table public.warehouse_count_items (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  material_id uuid references public.warehouse_materials(id) on delete cascade,
  quantidade_sistema numeric, quantidade_contada numeric, divergencia numeric, valor_divergencia numeric,
  observacao text, finalizada boolean not null default false, created_at timestamptz not null default now(),
  responsavel_id uuid, location_id uuid, ajuste_status text not null default 'sem_divergencia',
  justificativa text, analisado_por uuid, analisado_em timestamptz, analise_observacao text, movimento_id uuid);
create index warehouse_count_items_material on public.warehouse_count_items(material_id, created_at desc);

-- ---------- Retiradas (ferramentas e itens que voltam) ----------
create table public.warehouse_loans (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  responsavel_entrega_id uuid, retirado_por_id uuid, setor_id uuid, previsao_devolucao date, observacoes text,
  status text not null default 'aberto', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  op_numero text);

create table public.warehouse_loan_items (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  loan_id uuid not null references public.warehouse_loans(id) on delete cascade,
  material_id uuid references public.warehouse_materials(id) on delete set null,
  quantidade_retirada numeric not null, quantidade_devolvida numeric not null default 0, unidade text,
  status text not null default 'aberto', devolvido_em timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

-- ---------- Teto de consumo por setor ----------
create table public.warehouse_sector_limits (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  setor_id uuid, teto_mensal numeric not null default 0, consumo_atual numeric not null default 0,
  mes_referencia date not null default (date_trunc('month', now()))::date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

-- ---------- Vínculo produto da nota -> material ----------
create table public.supplier_product_links (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  cnpj_fornecedor text not null, codigo_fornecedor text, gtin text,
  material_id uuid not null references public.warehouse_materials(id) on delete cascade,
  fator_conversao numeric not null default 1, criado_por uuid,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  descricao_fornecedor text, unidade_fornecedor text, unidade_interna text,
  unique (empresa_id, cnpj_fornecedor, codigo_fornecedor));

-- ---------- EPI ----------
create table public.rh_epis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  nome text not null, ca text, ca_validade date, troca_dias integer, ativo boolean not null default true,
  created_at timestamptz not null default now(),
  material_id uuid references public.warehouse_materials(id) on delete set null);
create unique index rh_epis_material on public.rh_epis(empresa_id, material_id) where material_id is not null;

create table public.rh_epi_entregas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.almox_empresa() references public.empresas(id) on delete cascade,
  colaborador_id uuid not null, epi_id uuid not null references public.rh_epis(id) on delete cascade,
  quantidade numeric not null default 1, data_entrega date not null default current_date, troca_prevista date,
  motivo text not null default 'entrega', ca text, devolvido_em date, entregue_por uuid, observacao text,
  created_at timestamptz not null default now(), movement_id uuid);

-- ---------- Senha de 4 dígitos (tentativas) ----------
create table public.employee_warehouse_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  employee_id uuid, attempted_by uuid, success boolean not null default false, attempted_at timestamptz not null default now());

-- ---------- Acesso ----------
do $$
declare t text;
begin
  foreach t in array array['warehouse_material_categories','warehouse_material_types','warehouse_unit_types','warehouse_locations',
    'warehouse_materials','warehouse_movements','warehouse_operations','warehouse_count_cycles','warehouse_count_items',
    'warehouse_loans','warehouse_loan_items','warehouse_sector_limits','supplier_product_links','rh_epis','rh_epi_entregas',
    'employee_warehouse_pin_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.eh_membro_empresa(empresa_id) and (public.operacao_pode(empresa_id,''estoque.almoxarifado.visualizar'') or public.operacao_pode(empresa_id,''estoque.compras.visualizar'') or public.operacao_pode(empresa_id,''producao.ordens.visualizar'') or public.operacao_pode(empresa_id,''rh.colaboradores.visualizar'')))', t || '_ler', t);
    execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using (public.seguranca_2fa_ok())', t);
  end loop;
end $$;

-- Gravação direta só em cadastros simples; saldo e histórico só por funções.
create policy warehouse_material_categories_gravar on public.warehouse_material_categories for all to authenticated
  using (public.operacao_pode(empresa_id,'estoque.almoxarifado.movimentar')) with check (public.operacao_pode(empresa_id,'estoque.almoxarifado.movimentar'));
create policy warehouse_unit_types_gravar on public.warehouse_unit_types for all to authenticated
  using (public.operacao_pode(empresa_id,'estoque.almoxarifado.movimentar')) with check (public.operacao_pode(empresa_id,'estoque.almoxarifado.movimentar'));
create policy warehouse_sector_limits_gravar on public.warehouse_sector_limits for all to authenticated
  using (public.operacao_pode(empresa_id,'estoque.almoxarifado.aprovar')) with check (public.operacao_pode(empresa_id,'estoque.almoxarifado.aprovar'));
create policy warehouse_materials_inserir on public.warehouse_materials for insert to authenticated
  with check (public.operacao_pode(empresa_id,'estoque.almoxarifado.movimentar') and quantidade_disponivel = 0);

-- Material novo: saldo começa em zero e só entra por Entrada/Recebimento (funções).
create or replace function public.warehouse_materials_proteger_saldo() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op = 'INSERT' then new.quantidade_disponivel := 0; new.quantidade_reservada := 0;
    elsif new.quantidade_disponivel is distinct from old.quantidade_disponivel then
      raise exception 'O saldo só muda por Entrada, Saída, Recebimento ou Contagem.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger warehouse_materials_proteger_saldo before insert or update on public.warehouse_materials
  for each row execute function public.warehouse_materials_proteger_saldo();

create policy warehouse_materials_editar on public.warehouse_materials for update to authenticated
  using (public.operacao_pode(empresa_id,'estoque.almoxarifado.movimentar')) with check (public.operacao_pode(empresa_id,'estoque.almoxarifado.movimentar'));

-- Fotos dos materiais
insert into storage.buckets (id, name, public) values ('almoxarifado', 'almoxarifado', true) on conflict (id) do nothing;
create policy almoxarifado_fotos_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'almoxarifado' and (storage.foldername(name))[1] = public.almox_empresa()::text
    and public.operacao_pode(public.almox_empresa(),'estoque.almoxarifado.movimentar'));
create policy almoxarifado_fotos_trocar on storage.objects for update to authenticated
  using (bucket_id = 'almoxarifado' and (storage.foldername(name))[1] = public.almox_empresa()::text
    and public.operacao_pode(public.almox_empresa(),'estoque.almoxarifado.movimentar'));

grant select on public.almox_setores, public.almox_funcionarios to authenticated;
