-- Separação pelo cronograma (out/2026, etapa 2): tabelas que a tela Separação de Materiais já usava e nunca
-- tinham sido criadas. separacoes_leituras = histórico de cada leitura/ajuste; itens_patrimonios = QR fixo
-- de cada móvel (etiqueta permanente, usada na etapa 3).
create table if not exists public.separacoes_leituras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  separacao_pedido_id uuid references public.separacoes_pedidos(id) on delete cascade,
  separacao_item_id uuid references public.separacoes_itens(id) on delete set null,
  item_id uuid references public.itens(id) on delete set null,
  codigo_lido text not null,
  tipo_controle text not null default 'quantidade',
  usuario_id uuid,
  usuario_nome text,
  status_leitura text not null,
  observacao text,
  item_nome text,
  created_at timestamptz not null default now()
);
create index if not exists separacoes_leituras_pedido_idx on public.separacoes_leituras (separacao_pedido_id, created_at desc);

create table if not exists public.itens_patrimonios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  item_id uuid not null references public.itens(id) on delete cascade,
  codigo_patrimonio text not null,
  status text not null default 'ativo' check (status in ('ativo','manutencao','baixado')),
  observacao text,
  created_at timestamptz not null default now(),
  unique (empresa_id, codigo_patrimonio)
);
create index if not exists itens_patrimonios_item_idx on public.itens_patrimonios (item_id);

alter table public.separacoes_leituras enable row level security;
alter table public.itens_patrimonios enable row level security;

do $$
declare t text;
begin
  foreach t in array array['separacoes_leituras','itens_patrimonios'] loop
    execute format('drop policy if exists %1$s_empresa_all on public.%1$s', t);
    execute format('create policy %1$s_empresa_all on public.%1$s for all to authenticated using (public.eh_membro_empresa(empresa_id)) with check (public.eh_membro_empresa(empresa_id))', t);
    execute format('drop policy if exists funcionario_acesso_select on public.%1$s', t);
    execute format('create policy funcionario_acesso_select on public.%1$s as restrictive for select to authenticated using (public.funcionario_tabela_permitida(empresa_id, %2$L, ''visualizar''))', t, t);
    execute format('drop policy if exists funcionario_acesso_insert on public.%1$s', t);
    execute format('create policy funcionario_acesso_insert on public.%1$s as restrictive for insert to authenticated with check (public.funcionario_tabela_permitida(empresa_id, %2$L, ''criar''))', t, t);
    execute format('drop policy if exists funcionario_acesso_update on public.%1$s', t);
    execute format('create policy funcionario_acesso_update on public.%1$s as restrictive for update to authenticated using (public.funcionario_tabela_permitida(empresa_id, %2$L, ''editar'')) with check (public.funcionario_tabela_permitida(empresa_id, %2$L, ''editar''))', t, t);
    execute format('drop policy if exists funcionario_acesso_delete on public.%1$s', t);
    execute format('create policy funcionario_acesso_delete on public.%1$s as restrictive for delete to authenticated using (public.funcionario_tabela_permitida(empresa_id, %2$L, ''excluir''))', t, t);
  end loop;
end $$;

-- Quando a separação pode começar: dias antes do evento (já existia a coluna; agora aparece em Parâmetros).
alter table public.empresa_logistica_regras alter column separacao_dias_antes_evento set default 2;

-- itens_patrimonios segue a permissão do Cadastro de Itens para funcionários.
CREATE OR REPLACE FUNCTION public.funcionario_tabela_permitida(p_empresa uuid, p_tabela text, p_acao text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f funcionarios_acesso; prefixo text; acao text;
begin
 select * into f from funcionarios_acesso where id=auth.uid();
 if f.id is null then return true; end if;
 if not f.ativo or f.empresa_id<>p_empresa then return false; end if;
 if p_tabela in ('usuarios_empresas','usuarios') then return p_acao='visualizar'; end if;
 if p_tabela in ('permissoes_usuario','permissoes_perfil','usuarios_perfis','perfis_acesso','logs_permissoes') then
  return p_acao='visualizar' or public.funcionario_pode(p_empresa,auth.uid(),'configuracoes.permissoes.editar'); end if;
 if p_tabela in ('assinaturas','configuracoes_empresa','empresas_configuracoes') and p_acao='visualizar' then return true; end if;
 prefixo := case
  when p_tabela like 'clientes%' then 'comercial.clientes'
  when p_tabela like 'locais%' then 'comercial.locais'
  when p_tabela like 'contratos%' then 'comercial.contratos'
  when p_tabela like 'pedido%' or p_tabela='servicos_adicionais' then 'comercial.pedidos'
  when p_tabela in ('itens','itens_fotos','itens_modelos_3d','kit_itens','itens_patrimonios') then 'estoque.itens'
  when p_tabela in ('itens_precos','tabelas_preco') then 'estoque.tabelas_preco'
  when p_tabela='fornecedores' then 'estoque.fornecedores'
  when p_tabela='insumos' or p_tabela like 'personalizacoes%' then 'estoque.insumos'
  when p_tabela like 'almoxarifado%' then 'estoque.almoxarifado'
  when p_tabela like 'separacoes%' then 'logistica.separacao'
  when p_tabela='cronograma_logistico' then 'logistica.cronograma'
  when p_tabela='logistica_expedicoes' then 'logistica.expedicao'
  when p_tabela in ('planejamentos_logisticos','caminhoes','categorias_caminhao','categorias_montagem','empresa_logistica_regras') then 'logistica.planejamento'
  when p_tabela like 'rh_ocorrencias%' or p_tabela like 'rh_solicit%' or p_tabela='rh_anexos' then 'rh.ocorrencias'
  when p_tabela like 'rh_colaborador%' or p_tabela='colaboradores' then 'rh.colaboradores'
  when p_tabela like 'payment_gateway%' then 'configuracoes.integracoes.gateways_pagamento'
  when p_tabela='empresa_financeiro' then 'financeiro.fluxo'
  when p_tabela like 'zapi_%' then 'configuracoes.integracoes.whatsapp'
  when p_tabela='studio_projetos' then 'ia.studio'
  when p_tabela like 'ia_%' then 'ia.lia'
  when p_tabela='catalogo_acessos' then 'comercial.catalogo'
  else 'configuracoes.empresa' end;
 if p_acao='visualizar' and prefixo='estoque.itens' and public.funcionario_pode(p_empresa,auth.uid(),'comercial.catalogo.visualizar') then return true; end if;
 acao := case when prefixo='ia.lia' then 'usar' when p_acao='editar' and prefixo='estoque.almoxarifado' then 'movimentar'
 when p_acao='editar' and prefixo='logistica.separacao' then 'executar' when p_acao='editar' and prefixo='logistica.expedicao' then 'distribuir'
 when p_acao='editar' and prefixo='rh.ocorrencias' then 'criar' when p_acao='editar' and prefixo='ia.studio' then 'gerar' else p_acao end;
 return public.funcionario_pode(p_empresa,auth.uid(),prefixo||'.'||acao);
end; $function$
;
