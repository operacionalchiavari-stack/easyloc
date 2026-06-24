create extension if not exists pgcrypto;

create table if not exists public.permissoes_catalogo (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  modulo text not null,
  submodulo text not null,
  acao text not null,
  descricao text,
  sensivel boolean not null default false,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.perfis_acesso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  padrao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table if not exists public.usuarios_perfis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid not null,
  perfil_id uuid not null references public.perfis_acesso(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, usuario_id)
);

create table if not exists public.permissoes_perfil (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  perfil_id uuid not null references public.perfis_acesso(id) on delete cascade,
  permissao_chave text not null references public.permissoes_catalogo(chave) on delete cascade,
  permitido boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, perfil_id, permissao_chave)
);

create table if not exists public.permissoes_usuario (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid not null,
  permissao_chave text not null references public.permissoes_catalogo(chave) on delete cascade,
  permitido boolean not null default false,
  origem text not null default 'usuario',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, usuario_id, permissao_chave)
);

create table if not exists public.logs_permissoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_alvo_id uuid,
  perfil_id uuid references public.perfis_acesso(id) on delete set null,
  acao text not null,
  permissao_chave text,
  antes jsonb,
  depois jsonb,
  usuario_responsavel_id uuid,
  usuario_responsavel_nome text,
  created_at timestamptz not null default now()
);

create index if not exists idx_perfis_acesso_empresa on public.perfis_acesso(empresa_id);
create index if not exists idx_usuarios_perfis_empresa_usuario on public.usuarios_perfis(empresa_id, usuario_id);
create index if not exists idx_permissoes_usuario_empresa_usuario on public.permissoes_usuario(empresa_id, usuario_id);
create index if not exists idx_permissoes_perfil_empresa_perfil on public.permissoes_perfil(empresa_id, perfil_id);
create index if not exists idx_logs_permissoes_empresa on public.logs_permissoes(empresa_id, created_at desc);

insert into public.permissoes_catalogo (chave, modulo, submodulo, acao, descricao, sensivel, ordem) values
('comercial.clientes.visualizar','Comercial','Cadastro de Clientes','visualizar','Visualizar clientes',false,10),
('comercial.clientes.criar','Comercial','Cadastro de Clientes','criar','Cadastrar clientes',false,11),
('comercial.clientes.editar','Comercial','Cadastro de Clientes','editar','Editar clientes',false,12),
('comercial.clientes.excluir','Comercial','Cadastro de Clientes','excluir','Excluir clientes',true,13),
('comercial.clientes.dados_sensiveis','Comercial','Cadastro de Clientes','sensivel','Ver CPF/CNPJ, telefone e email completos',true,14),
('comercial.locais.visualizar','Comercial','Cadastro de Locais','visualizar','Visualizar locais',false,20),
('comercial.locais.criar','Comercial','Cadastro de Locais','criar','Cadastrar locais',false,21),
('comercial.locais.editar','Comercial','Cadastro de Locais','editar','Editar locais',false,22),
('comercial.locais.excluir','Comercial','Cadastro de Locais','excluir','Excluir locais',true,23),
('comercial.pedidos.visualizar','Comercial','Pedidos','visualizar','Visualizar pedidos',false,30),
('comercial.pedidos.criar','Comercial','Pedidos','criar','Criar pedidos',false,31),
('comercial.pedidos.editar','Comercial','Pedidos','editar','Editar pedidos',false,32),
('comercial.pedidos.cancelar','Comercial','Pedidos','aprovar','Cancelar pedidos',true,33),
('comercial.pedidos.aprovar','Comercial','Pedidos','aprovar','Aprovar pedidos',true,34),
('comercial.pedidos.valores','Comercial','Pedidos','sensivel','Visualizar valores comerciais',true,35),
('estoque.itens.visualizar','Estoque','Itens','visualizar','Visualizar itens',false,100),
('estoque.itens.criar','Estoque','Itens','criar','Cadastrar itens',false,101),
('estoque.itens.editar','Estoque','Itens','editar','Editar itens',false,102),
('estoque.itens.excluir','Estoque','Itens','excluir','Excluir itens',true,103),
('estoque.itens.qrcode','Estoque','Itens','sensivel','Gerar e baixar QR Codes',true,104),
('estoque.insumos.visualizar','Estoque','Insumos','visualizar','Visualizar insumos',false,110),
('estoque.insumos.criar','Estoque','Insumos','criar','Cadastrar insumos',false,111),
('estoque.insumos.editar','Estoque','Insumos','editar','Editar insumos',false,112),
('estoque.almoxarifado.visualizar','Estoque','Almoxarifado','visualizar','Visualizar almoxarifado',false,120),
('estoque.almoxarifado.movimentar','Estoque','Almoxarifado','criar','Registrar entradas e saidas',false,121),
('estoque.almoxarifado.aprovar','Estoque','Almoxarifado','aprovar','Aprovar movimentacoes',true,122),
('estoque.compras.visualizar','Estoque','Compras','visualizar','Visualizar compras',false,130),
('estoque.compras.criar','Estoque','Compras','criar','Criar compras',false,131),
('estoque.compras.editar','Estoque','Compras','editar','Editar compras',false,132),
('estoque.compras.receber','Estoque','Compras','aprovar','Confirmar recebimento',true,133),
('logistica.cronograma.visualizar','Logistica','Cronograma','visualizar','Visualizar cronograma',false,200),
('logistica.cronograma.editar','Logistica','Cronograma','editar','Editar cronograma',false,201),
('logistica.planejamento.visualizar','Logistica','Planejamento','visualizar','Visualizar planejamento logistico',false,210),
('logistica.planejamento.editar','Logistica','Planejamento','editar','Alocar caminhoes e equipes',false,211),
('logistica.separacao.visualizar','Logistica','Separacao','visualizar','Visualizar separacao',false,220),
('logistica.separacao.executar','Logistica','Separacao','criar','Executar leituras de separacao',false,221),
('logistica.separacao.finalizar','Logistica','Separacao','aprovar','Finalizar separacao',true,222),
('financeiro.fluxo.visualizar','Financeiro','Fluxo de Caixa','visualizar','Visualizar financeiro',true,300),
('financeiro.fluxo.criar','Financeiro','Fluxo de Caixa','criar','Criar lancamentos',true,301),
('financeiro.fluxo.editar','Financeiro','Fluxo de Caixa','editar','Editar lancamentos',true,302),
('financeiro.fluxo.excluir','Financeiro','Fluxo de Caixa','excluir','Excluir lancamentos',true,303),
('financeiro.contas_receber.visualizar','Financeiro','Contas a Receber','visualizar','Visualizar contas a receber',true,310),
('financeiro.contas_receber.editar','Financeiro','Contas a Receber','editar','Editar contas a receber',true,311),
('financeiro.contas_pagar.visualizar','Financeiro','Contas a Pagar','visualizar','Visualizar contas a pagar',true,320),
('financeiro.contas_pagar.editar','Financeiro','Contas a Pagar','editar','Editar contas a pagar',true,321),
('rh.colaboradores.visualizar','RH','Colaboradores','visualizar','Visualizar colaboradores',true,400),
('rh.colaboradores.criar','RH','Colaboradores','criar','Cadastrar colaboradores',true,401),
('rh.colaboradores.editar','RH','Colaboradores','editar','Editar colaboradores',true,402),
('rh.ocorrencias.visualizar','RH','Ocorrencias','visualizar','Visualizar ocorrencias',true,410),
('rh.ocorrencias.criar','RH','Ocorrencias','criar','Registrar ocorrencias',true,411),
('ia.lia.usar','Inteligencia Artificial','Lia','visualizar','Usar assistente Lia',false,500),
('ia.studio.visualizar','Inteligencia Artificial','Studio IA','visualizar','Visualizar Studio IA',false,510),
('ia.studio.gerar','Inteligencia Artificial','Studio IA','criar','Gerar imagens com IA',true,511),
('configuracoes.empresa.visualizar','Configuracoes','Empresa','visualizar','Visualizar configuracoes da empresa',true,900),
('configuracoes.empresa.editar','Configuracoes','Empresa','editar','Editar configuracoes da empresa',true,901),
('configuracoes.permissoes.visualizar','Configuracoes','Permissoes','visualizar','Visualizar permissoes',true,910),
('configuracoes.permissoes.editar','Configuracoes','Permissoes','editar','Editar permissoes',true,911)
on conflict (chave) do update set
  modulo = excluded.modulo,
  submodulo = excluded.submodulo,
  acao = excluded.acao,
  descricao = excluded.descricao,
  sensivel = excluded.sensivel,
  ordem = excluded.ordem;

alter table public.permissoes_catalogo enable row level security;
alter table public.perfis_acesso enable row level security;
alter table public.usuarios_perfis enable row level security;
alter table public.permissoes_perfil enable row level security;
alter table public.permissoes_usuario enable row level security;
alter table public.logs_permissoes enable row level security;

drop policy if exists permissoes_catalogo_select on public.permissoes_catalogo;
create policy permissoes_catalogo_select on public.permissoes_catalogo
for select using (auth.uid() is not null);

drop policy if exists perfis_acesso_company_select on public.perfis_acesso;
create policy perfis_acesso_company_select on public.perfis_acesso
for select using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = perfis_acesso.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists perfis_acesso_company_write on public.perfis_acesso;
create policy perfis_acesso_company_write on public.perfis_acesso
for all using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = perfis_acesso.empresa_id
    and ue.user_id = auth.uid()
)) with check (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = perfis_acesso.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists usuarios_perfis_company_select on public.usuarios_perfis;
create policy usuarios_perfis_company_select on public.usuarios_perfis
for select using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = usuarios_perfis.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists usuarios_perfis_company_write on public.usuarios_perfis;
create policy usuarios_perfis_company_write on public.usuarios_perfis
for all using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = usuarios_perfis.empresa_id
    and ue.user_id = auth.uid()
)) with check (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = usuarios_perfis.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists permissoes_perfil_company_select on public.permissoes_perfil;
create policy permissoes_perfil_company_select on public.permissoes_perfil
for select using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = permissoes_perfil.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists permissoes_perfil_company_write on public.permissoes_perfil;
create policy permissoes_perfil_company_write on public.permissoes_perfil
for all using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = permissoes_perfil.empresa_id
    and ue.user_id = auth.uid()
)) with check (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = permissoes_perfil.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists permissoes_usuario_company_select on public.permissoes_usuario;
create policy permissoes_usuario_company_select on public.permissoes_usuario
for select using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = permissoes_usuario.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists permissoes_usuario_company_write on public.permissoes_usuario;
create policy permissoes_usuario_company_write on public.permissoes_usuario
for all using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = permissoes_usuario.empresa_id
    and ue.user_id = auth.uid()
)) with check (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = permissoes_usuario.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists logs_permissoes_company_select on public.logs_permissoes;
create policy logs_permissoes_company_select on public.logs_permissoes
for select using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = logs_permissoes.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists logs_permissoes_company_insert on public.logs_permissoes;
create policy logs_permissoes_company_insert on public.logs_permissoes
for insert with check (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = logs_permissoes.empresa_id
    and ue.user_id = auth.uid()
));

create or replace function public.has_permission(
  p_empresa_id uuid,
  p_usuario_id uuid,
  p_chave text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario boolean;
  v_perfil boolean;
begin
  select pu.permitido into v_usuario
  from public.permissoes_usuario pu
  where pu.empresa_id = p_empresa_id
    and pu.usuario_id = p_usuario_id
    and pu.permissao_chave = p_chave
  limit 1;

  if v_usuario is not null then
    return v_usuario;
  end if;

  select pp.permitido into v_perfil
  from public.usuarios_perfis up
  join public.permissoes_perfil pp
    on pp.perfil_id = up.perfil_id
   and pp.empresa_id = up.empresa_id
  where up.empresa_id = p_empresa_id
    and up.usuario_id = p_usuario_id
    and pp.permissao_chave = p_chave
  limit 1;

  if v_perfil is not null then
    return v_perfil;
  end if;

  return false;
end;
$$;

create or replace function public.get_permissoes_usuario_resolvidas(
  p_empresa_id uuid,
  p_usuario_id uuid
) returns table (
  chave text,
  permitido boolean,
  origem text
)
language sql
security definer
set search_path = public
as $$
  select
    pc.chave,
    coalesce(pu.permitido, pp.permitido, false) as permitido,
    case
      when pu.id is not null then 'usuario'
      when pp.id is not null then 'perfil'
      else 'padrao'
    end as origem
  from public.permissoes_catalogo pc
  left join public.permissoes_usuario pu
    on pu.permissao_chave = pc.chave
   and pu.empresa_id = p_empresa_id
   and pu.usuario_id = p_usuario_id
  left join public.usuarios_perfis up
    on up.empresa_id = p_empresa_id
   and up.usuario_id = p_usuario_id
  left join public.permissoes_perfil pp
    on pp.perfil_id = up.perfil_id
   and pp.empresa_id = p_empresa_id
   and pp.permissao_chave = pc.chave
  order by pc.ordem, pc.chave;
$$;
