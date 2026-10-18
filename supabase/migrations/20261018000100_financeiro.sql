-- =====================================================================================
-- FINANCEIRO (out/2026) — baseado no módulo da Tecnoweld, adaptado ao Acervo.
-- Contas bancárias com titular (CNPJ) e PIX, plano de contas, centros de custo, contas a
-- receber e a pagar, baixas (com estorno), transferências, ajustes, fluxo de caixa, DRE,
-- inadimplência e conciliação de extrato.
-- Pedido aprovado vira contas a receber automaticamente, cada parcela DIVIDIDA em
-- locação / frete / montagem (fin_receber.componente), cada parte com a sua conta
-- (padrões em fin_config, trocáveis por título). Recebimentos do PIX do gateway
-- (observacoes.parcelas_financeiras) viram baixas.
-- Acesso: ler = membro da empresa com 'financeiro.fluxo.visualizar'; escrever = só pelas
-- funções (security definer), que conferem a permissão.
-- =====================================================================================

create or replace function public.fin_pode(p_empresa uuid, p_chave text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.funcionario_pode(p_empresa, auth.uid(), p_chave);
$$;

create table if not exists public.fin_contas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  tipo text not null default 'corrente' check (tipo in ('corrente','poupanca','caixa','aplicacao','digital','gateway')),
  banco text, agencia text, conta text,
  titular_nome text, titular_documento text,
  pix_tipo text check (pix_tipo is null or pix_tipo in ('cnpj','cpf','email','telefone','aleatoria')),
  pix_chave text,
  saldo_inicial numeric(15,2) not null default 0,
  saldo_inicial_data date not null default current_date,
  saldo_minimo numeric(15,2) not null default 0,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists fin_contas_empresa on public.fin_contas(empresa_id);

create table if not exists public.fin_config (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  conta_locacao uuid references public.fin_contas(id) on delete set null,
  conta_frete uuid references public.fin_contas(id) on delete set null,
  conta_montagem uuid references public.fin_contas(id) on delete set null,
  conta_gateway uuid references public.fin_contas(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.fin_categorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo text, nome text not null,
  tipo text not null check (tipo in ('entrada','saida')),
  pai_id uuid references public.fin_categorias(id) on delete set null,
  chave text, ordem integer not null default 1, ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists fin_categorias_nome on public.fin_categorias(empresa_id, nome, tipo);
create unique index if not exists fin_categorias_chave on public.fin_categorias(empresa_id, chave) where chave is not null;

create table if not exists public.fin_centros_custo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo text, nome text not null, ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists fin_centros_nome on public.fin_centros_custo(empresa_id, nome);

create table if not exists public.fin_receber (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  origem text not null default 'manual' check (origem in ('pedido','manual','conciliacao')),
  grupo uuid not null default gen_random_uuid(),
  pedido_id uuid references public.separacoes_pedidos(id) on delete set null,
  pedido_numero text,
  componente text not null default 'outro' check (componente in ('locacao','frete','montagem','outro')),
  cliente_id uuid, cliente_nome text,
  documento text, descricao text not null,
  emissao date not null default current_date, competencia date, vencimento date not null,
  valor numeric(15,2) not null check (valor > 0),
  recebido numeric(15,2) not null default 0 check (recebido >= 0),
  aberto numeric(15,2) generated always as (greatest(valor - recebido, 0)) stored,
  parcela integer not null default 1, parcelas integer not null default 1,
  forma text,
  conta_id uuid references public.fin_contas(id) on delete set null,
  conta_manual boolean not null default false,
  categoria_id uuid references public.fin_categorias(id) on delete set null,
  centro_custo_id uuid references public.fin_centros_custo(id) on delete set null,
  status text not null default 'aberto' check (status in ('aberto','parcial','recebido','cancelado')),
  observacoes text,
  criado_por uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  cancelado_em timestamptz, cancelado_por uuid, cancelamento_motivo text
);
create index if not exists fin_receber_empresa on public.fin_receber(empresa_id, vencimento);
create index if not exists fin_receber_pedido on public.fin_receber(pedido_id);
create unique index if not exists fin_receber_pedido_parte on public.fin_receber(pedido_id, parcela, componente) where origem = 'pedido' and status <> 'cancelado';

create table if not exists public.fin_pagar (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  origem text not null default 'manual',
  origem_id uuid,
  grupo uuid not null default gen_random_uuid(),
  fornecedor_id uuid, fornecedor_nome text,
  documento text, descricao text not null,
  emissao date not null default current_date, competencia date, vencimento date not null,
  programado_para date,
  valor numeric(15,2) not null check (valor > 0),
  pago numeric(15,2) not null default 0 check (pago >= 0),
  aberto numeric(15,2) generated always as (greatest(valor - pago, 0)) stored,
  parcela integer not null default 1, parcelas integer not null default 1,
  forma text, codigo_barras text,
  conta_id uuid references public.fin_contas(id) on delete set null,
  categoria_id uuid references public.fin_categorias(id) on delete set null,
  centro_custo_id uuid references public.fin_centros_custo(id) on delete set null,
  status text not null default 'pendente' check (status in ('pendente','aprovado','programado','parcial','pago','cancelado')),
  requer_aprovacao boolean not null default false,
  aprovacao text not null default 'nao_requerida' check (aprovacao in ('nao_requerida','pendente','aprovada','reprovada')),
  aprovado_por uuid, aprovado_em timestamptz, aprovacao_obs text,
  observacoes text,
  criado_por uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  cancelado_em timestamptz, cancelado_por uuid, cancelamento_motivo text
);
create index if not exists fin_pagar_empresa on public.fin_pagar(empresa_id, vencimento);

create table if not exists public.fin_extrato (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conta_id uuid not null references public.fin_contas(id) on delete cascade,
  fitid text not null, data date not null, valor numeric(15,2) not null, descricao text,
  baixa_id uuid, ignorado boolean not null default false,
  created_at timestamptz not null default now(),
  unique (conta_id, fitid)
);

create table if not exists public.fin_baixas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('receber','pagar')),
  receber_id uuid references public.fin_receber(id) on delete cascade,
  pagar_id uuid references public.fin_pagar(id) on delete cascade,
  data date not null,
  valor numeric(15,2) not null check (valor > 0),
  juros numeric(15,2) not null default 0, multa numeric(15,2) not null default 0,
  desconto numeric(15,2) not null default 0, tarifa numeric(15,2) not null default 0,
  liquido numeric(15,2) not null check (liquido > 0),
  conta_id uuid not null references public.fin_contas(id),
  forma text, observacoes text,
  origem text not null default 'manual' check (origem in ('manual','gateway','conciliacao')),
  extrato_id uuid references public.fin_extrato(id) on delete set null,
  criado_por uuid, created_at timestamptz not null default now(),
  estornado_em timestamptz, estornado_por uuid, estorno_motivo text,
  check ((receber_id is not null)::int + (pagar_id is not null)::int = 1)
);
create index if not exists fin_baixas_receber on public.fin_baixas(receber_id);
create index if not exists fin_baixas_pagar on public.fin_baixas(pagar_id);

create table if not exists public.fin_movimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('baixa','transferencia','ajuste')),
  direcao text not null check (direcao in ('entrada','saida')),
  data date not null, descricao text not null,
  valor numeric(15,2) not null check (valor > 0),
  conta_id uuid not null references public.fin_contas(id),
  categoria_id uuid references public.fin_categorias(id) on delete set null,
  baixa_id uuid references public.fin_baixas(id) on delete cascade,
  transferencia_grupo uuid,
  criado_por uuid, created_at timestamptz not null default now(),
  cancelado_em timestamptz
);
create index if not exists fin_movimentos_conta on public.fin_movimentos(empresa_id, conta_id, data);

create table if not exists public.fin_auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null, entidade text not null, entidade_id uuid, acao text not null,
  antes jsonb, depois jsonb, descricao text, usuario_id uuid, created_at timestamptz not null default now()
);

-- updated_at
create or replace function public.fin_tocar() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['fin_contas','fin_receber','fin_pagar','fin_config'] loop
  execute format('drop trigger if exists fin_tocar on public.%I', t);
  execute format('create trigger fin_tocar before update on public.%I for each row execute function public.fin_tocar()', t);
end loop; end $$;

-- RLS: leitura por quem pode ver o financeiro; escrita direta só nos cadastros.
do $$ declare t text; begin foreach t in array array['fin_contas','fin_config','fin_categorias','fin_centros_custo','fin_receber','fin_pagar','fin_extrato','fin_baixas','fin_movimentos','fin_auditoria'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists fin_ler on public.%I', t);
  execute format('create policy fin_ler on public.%I for select to authenticated using (public.eh_membro_empresa(empresa_id) and public.fin_pode(empresa_id, %L))', t, 'financeiro.fluxo.visualizar');
end loop; end $$;
do $$ declare t text; begin foreach t in array array['fin_contas','fin_categorias','fin_centros_custo'] loop
  execute format('drop policy if exists fin_gravar on public.%I', t);
  execute format('create policy fin_gravar on public.%I for all to authenticated using (public.eh_membro_empresa(empresa_id) and public.fin_pode(empresa_id, %L)) with check (public.eh_membro_empresa(empresa_id) and public.fin_pode(empresa_id, %L))', t, 'financeiro.fluxo.editar', 'financeiro.fluxo.editar');
end loop; end $$;
grant select on public.fin_contas, public.fin_config, public.fin_categorias, public.fin_centros_custo, public.fin_receber, public.fin_pagar, public.fin_extrato, public.fin_baixas, public.fin_movimentos, public.fin_auditoria to authenticated;
grant insert, update, delete on public.fin_contas, public.fin_categorias, public.fin_centros_custo to authenticated;

create or replace function public.fin_auditar(p_empresa uuid, p_entidade text, p_id uuid, p_acao text, p_antes jsonb, p_depois jsonb, p_desc text)
returns void language sql security definer set search_path = public as $$
  insert into fin_auditoria(empresa_id, entidade, entidade_id, acao, antes, depois, descricao, usuario_id)
  values (p_empresa, p_entidade, p_id, p_acao, p_antes, p_depois, p_desc, auth.uid());
$$;

-- ------------------------------------------------------------------ plano de contas padrão
create or replace function public.fin_semear(p_empresa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_pai uuid;
begin
  for r in select * from (values
    ('1','Receitas','entrada',null,null,10),
    ('1.1','Locação de mobiliário','entrada','1','locacao',11),
    ('1.2','Frete cobrado do cliente','entrada','1','frete',12),
    ('1.3','Montagem cobrada do cliente','entrada','1','montagem',13),
    ('1.9','Outras receitas','entrada','1','outras_receitas',19),
    ('2','Custos da operação','saida',null,null,20),
    ('2.1','Fretes e transporte','saida','2','fretes',21),
    ('2.2','Montadores e equipe free','saida','2','equipe_free',22),
    ('2.3','Corridas de aplicativo','saida','2','uber',23),
    ('2.4','Manutenção e reposição do acervo','saida','2','manutencao',24),
    ('2.5','Almoxarifado e insumos','saida','2','almoxarifado',25),
    ('3','Impostos','saida',null,'impostos',30),
    ('4','Despesas administrativas','saida',null,null,40),
    ('4.1','Folha e encargos','saida','4','folha',41),
    ('4.2','Aluguel e utilidades','saida','4','aluguel',42),
    ('4.3','Marketing','saida','4','marketing',43),
    ('4.9','Outras despesas','saida','4','outras_despesas',49),
    ('5','Despesas financeiras e tarifas','saida',null,'tarifas',50)
  ) as t(codigo, nome, tipo, pai, chave, ordem) order by ordem loop
    select id into v_pai from fin_categorias where empresa_id = p_empresa and codigo = r.pai;
    insert into fin_categorias(empresa_id, codigo, nome, tipo, pai_id, chave, ordem)
    values (p_empresa, r.codigo, r.nome, r.tipo, case when r.pai is null then null else v_pai end, r.chave, r.ordem)
    on conflict (empresa_id, nome, tipo) do nothing;
  end loop;
  insert into fin_centros_custo(empresa_id, codigo, nome) values
    (p_empresa, 'CC-01', 'Comercial'), (p_empresa, 'CC-02', 'Logística'), (p_empresa, 'CC-03', 'Estoque e manutenção'), (p_empresa, 'CC-04', 'Administrativo')
  on conflict (empresa_id, nome) do nothing;
  insert into fin_config(empresa_id) values (p_empresa) on conflict do nothing;
end $$;

create or replace function public.fin_categoria(p_empresa uuid, p_chave text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from fin_categorias where empresa_id = p_empresa and chave = p_chave and ativo limit 1;
$$;

create or replace function public.fin_preparar(p_empresa uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão para o financeiro' using errcode = '42501'; end if;
  perform fin_semear(p_empresa);
end $$;

create or replace function public.fin_salvar_config(p_empresa uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  perform fin_semear(p_empresa);
  update fin_config set
    conta_locacao = nullif(p_dados->>'conta_locacao','')::uuid,
    conta_frete = nullif(p_dados->>'conta_frete','')::uuid,
    conta_montagem = nullif(p_dados->>'conta_montagem','')::uuid,
    conta_gateway = nullif(p_dados->>'conta_gateway','')::uuid
  where empresa_id = p_empresa;
  -- títulos de pedido ainda em aberto e sem conta escolhida à mão passam a usar o novo padrão
  update fin_receber r set conta_id = case r.componente when 'locacao' then c.conta_locacao when 'frete' then c.conta_frete when 'montagem' then c.conta_montagem else r.conta_id end
    from fin_config c
   where c.empresa_id = p_empresa and r.empresa_id = p_empresa and r.origem = 'pedido' and not r.conta_manual and r.status in ('aberto');
  -- reprocessa os pedidos (ex.: PIX já recebido que esperava uma conta para virar baixa)
  perform fin_sincronizar_pedido(id) from separacoes_pedidos where empresa_id = p_empresa and status_comercial in ('aprovado','finalizado','enviado');
  perform fin_auditar(p_empresa, 'fin_config', null, 'config', null, p_dados, 'Contas padrão do pedido');
end $$;

-- ------------------------------------------------------------------ títulos
create or replace function public.fin_criar_titulo(p_empresa uuid, p_tipo text, p_cab jsonb, p_parcelas jsonb)
returns setof uuid language plpgsql security definer set search_path = public as $$
declare v_item jsonb; v_id uuid; v_grupo uuid := gen_random_uuid(); v_n int; v_i int := 0; v_total numeric;
begin
  if p_tipo not in ('receber','pagar') then raise exception 'Tipo inválido'; end if;
  if not fin_pode(p_empresa, case when p_tipo = 'receber' then 'financeiro.contas_receber.editar' else 'financeiro.contas_pagar.editar' end) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) = 0 then raise exception 'Informe as parcelas'; end if;
  if trim(coalesce(p_cab->>'descricao','')) = '' then raise exception 'Informe a descrição'; end if;
  select count(*), coalesce(sum((x->>'valor')::numeric),0) into v_n, v_total from jsonb_array_elements(p_parcelas) x;
  if v_total <= 0 then raise exception 'Informe o valor'; end if;
  perform fin_semear(p_empresa);
  for v_item in select * from jsonb_array_elements(p_parcelas) loop
    v_i := v_i + 1;
    if p_tipo = 'receber' then
      insert into fin_receber(empresa_id, origem, grupo, cliente_id, cliente_nome, pedido_id, pedido_numero, componente, documento, descricao, emissao, competencia, vencimento, valor, parcela, parcelas, forma, conta_id, conta_manual, categoria_id, centro_custo_id, observacoes, criado_por)
      values (p_empresa, coalesce(nullif(p_cab->>'origem',''),'manual'), v_grupo, nullif(p_cab->>'cliente_id','')::uuid, nullif(p_cab->>'cliente_nome',''), nullif(p_cab->>'pedido_id','')::uuid, nullif(p_cab->>'pedido_numero',''),
        coalesce(nullif(p_cab->>'componente',''),'outro'), nullif(p_cab->>'documento',''), p_cab->>'descricao', coalesce(nullif(p_cab->>'emissao','')::date, current_date), nullif(p_cab->>'competencia','')::date,
        (v_item->>'vencimento')::date, (v_item->>'valor')::numeric, v_i, v_n, nullif(p_cab->>'forma',''), nullif(p_cab->>'conta_id','')::uuid, nullif(p_cab->>'conta_id','') is not null,
        coalesce(nullif(p_cab->>'categoria_id','')::uuid, fin_categoria(p_empresa, 'outras_receitas')), nullif(p_cab->>'centro_custo_id','')::uuid, nullif(p_cab->>'observacoes',''), auth.uid())
      returning id into v_id;
    else
      insert into fin_pagar(empresa_id, origem, grupo, fornecedor_id, fornecedor_nome, documento, descricao, emissao, competencia, vencimento, valor, parcela, parcelas, forma, codigo_barras, conta_id, categoria_id, centro_custo_id, requer_aprovacao, aprovacao, observacoes, criado_por)
      values (p_empresa, coalesce(nullif(p_cab->>'origem',''),'manual'), v_grupo, nullif(p_cab->>'fornecedor_id','')::uuid, nullif(p_cab->>'fornecedor_nome',''), nullif(p_cab->>'documento',''), p_cab->>'descricao',
        coalesce(nullif(p_cab->>'emissao','')::date, current_date), nullif(p_cab->>'competencia','')::date, (v_item->>'vencimento')::date, (v_item->>'valor')::numeric, v_i, v_n,
        nullif(p_cab->>'forma',''), nullif(p_cab->>'codigo_barras',''), nullif(p_cab->>'conta_id','')::uuid, coalesce(nullif(p_cab->>'categoria_id','')::uuid, fin_categoria(p_empresa, 'outras_despesas')), nullif(p_cab->>'centro_custo_id','')::uuid,
        coalesce((p_cab->>'requer_aprovacao')::boolean, false), case when coalesce((p_cab->>'requer_aprovacao')::boolean, false) then 'pendente' else 'nao_requerida' end, nullif(p_cab->>'observacoes',''), auth.uid())
      returning id into v_id;
    end if;
    return next v_id;
  end loop;
  perform fin_auditar(p_empresa, case when p_tipo = 'receber' then 'fin_receber' else 'fin_pagar' end, v_grupo, 'criacao', null, p_cab || jsonb_build_object('parcelas', v_n, 'total', v_total), null);
end $$;

-- Edita dados de um título ainda sem baixa (conta, vencimento, categoria, descrição…). A conta pode ser trocada sempre.
create or replace function public.fin_editar_titulo(p_empresa uuid, p_tipo text, p_id uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_antes jsonb;
begin
  if not fin_pode(p_empresa, case when p_tipo = 'receber' then 'financeiro.contas_receber.editar' else 'financeiro.contas_pagar.editar' end) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if p_tipo = 'receber' then
    select to_jsonb(r) into v_antes from fin_receber r where id = p_id and empresa_id = p_empresa for update;
    if v_antes is null then raise exception 'Título não encontrado'; end if;
    update fin_receber set
      conta_id = case when p_dados ? 'conta_id' then nullif(p_dados->>'conta_id','')::uuid else conta_id end,
      conta_manual = conta_manual or p_dados ? 'conta_id',
      vencimento = case when p_dados ? 'vencimento' and recebido = 0 then (p_dados->>'vencimento')::date else vencimento end,
      valor = case when p_dados ? 'valor' and recebido = 0 and origem <> 'pedido' then (p_dados->>'valor')::numeric else valor end,
      descricao = coalesce(nullif(p_dados->>'descricao',''), descricao),
      documento = case when p_dados ? 'documento' then nullif(p_dados->>'documento','') else documento end,
      forma = case when p_dados ? 'forma' then nullif(p_dados->>'forma','') else forma end,
      categoria_id = case when p_dados ? 'categoria_id' then nullif(p_dados->>'categoria_id','')::uuid else categoria_id end,
      centro_custo_id = case when p_dados ? 'centro_custo_id' then nullif(p_dados->>'centro_custo_id','')::uuid else centro_custo_id end,
      observacoes = case when p_dados ? 'observacoes' then nullif(p_dados->>'observacoes','') else observacoes end
    where id = p_id;
  else
    select to_jsonb(p) into v_antes from fin_pagar p where id = p_id and empresa_id = p_empresa for update;
    if v_antes is null then raise exception 'Título não encontrado'; end if;
    update fin_pagar set
      conta_id = case when p_dados ? 'conta_id' then nullif(p_dados->>'conta_id','')::uuid else conta_id end,
      vencimento = case when p_dados ? 'vencimento' and pago = 0 then (p_dados->>'vencimento')::date else vencimento end,
      valor = case when p_dados ? 'valor' and pago = 0 then (p_dados->>'valor')::numeric else valor end,
      descricao = coalesce(nullif(p_dados->>'descricao',''), descricao),
      documento = case when p_dados ? 'documento' then nullif(p_dados->>'documento','') else documento end,
      forma = case when p_dados ? 'forma' then nullif(p_dados->>'forma','') else forma end,
      codigo_barras = case when p_dados ? 'codigo_barras' then nullif(p_dados->>'codigo_barras','') else codigo_barras end,
      categoria_id = case when p_dados ? 'categoria_id' then nullif(p_dados->>'categoria_id','')::uuid else categoria_id end,
      centro_custo_id = case when p_dados ? 'centro_custo_id' then nullif(p_dados->>'centro_custo_id','')::uuid else centro_custo_id end,
      fornecedor_id = case when p_dados ? 'fornecedor_id' then nullif(p_dados->>'fornecedor_id','')::uuid else fornecedor_id end,
      fornecedor_nome = case when p_dados ? 'fornecedor_nome' then nullif(p_dados->>'fornecedor_nome','') else fornecedor_nome end,
      observacoes = case when p_dados ? 'observacoes' then nullif(p_dados->>'observacoes','') else observacoes end
    where id = p_id;
  end if;
  perform fin_auditar(p_empresa, 'fin_' || p_tipo, p_id, 'edicao', v_antes, p_dados, null);
end $$;

-- Baixa (recebimento/pagamento). Interno: fin_baixar_ (sem conferir permissão), usado pelo pedido/gateway.
create or replace function public.fin_baixar_(p_empresa uuid, p_tipo text, p_id uuid, p_data date, p_valor numeric, p_juros numeric, p_multa numeric, p_desconto numeric, p_tarifa numeric, p_conta uuid, p_forma text, p_obs text, p_origem text, p_extrato uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_aberto numeric; v_liq numeric; v_baixa uuid; v_desc text; v_cat uuid; v_status text;
begin
  if coalesce(p_valor,0) <= 0 then raise exception 'O valor da baixa deve ser maior que zero'; end if;
  if p_conta is null then raise exception 'Escolha a conta da baixa'; end if;
  if not exists (select 1 from fin_contas where id = p_conta and empresa_id = p_empresa) then raise exception 'Conta inválida'; end if;
  if p_tipo = 'receber' then
    select aberto, descricao || coalesce(' · ' || pedido_numero, ''), categoria_id, status into v_aberto, v_desc, v_cat, v_status from fin_receber where id = p_id and empresa_id = p_empresa for update;
  else
    select aberto, descricao, categoria_id, status into v_aberto, v_desc, v_cat, v_status from fin_pagar where id = p_id and empresa_id = p_empresa for update;
    if exists (select 1 from fin_pagar where id = p_id and requer_aprovacao and aprovacao <> 'aprovada') then raise exception 'Este pagamento precisa ser aprovado antes da baixa'; end if;
  end if;
  if v_aberto is null then raise exception 'Título não encontrado'; end if;
  if v_status = 'cancelado' then raise exception 'Título cancelado'; end if;
  if p_valor > v_aberto + 0.005 then raise exception 'Valor maior que o saldo em aberto (%)', v_aberto; end if;
  v_liq := p_valor + coalesce(p_juros,0) + coalesce(p_multa,0) - coalesce(p_desconto,0) - coalesce(p_tarifa,0);
  if v_liq <= 0 then raise exception 'Valor líquido inválido'; end if;
  insert into fin_baixas(empresa_id, tipo, receber_id, pagar_id, data, valor, juros, multa, desconto, tarifa, liquido, conta_id, forma, observacoes, origem, extrato_id, criado_por)
  values (p_empresa, p_tipo, case when p_tipo = 'receber' then p_id end, case when p_tipo = 'pagar' then p_id end, coalesce(p_data, current_date), p_valor,
          coalesce(p_juros,0), coalesce(p_multa,0), coalesce(p_desconto,0), coalesce(p_tarifa,0), v_liq, p_conta, p_forma, p_obs, coalesce(p_origem,'manual'), p_extrato, auth.uid())
  returning id into v_baixa;
  if p_tipo = 'receber' then
    update fin_receber set recebido = recebido + p_valor, status = case when aberto - p_valor <= 0.005 then 'recebido' else 'parcial' end where id = p_id;
  else
    update fin_pagar set pago = pago + p_valor, status = case when aberto - p_valor <= 0.005 then 'pago' else 'parcial' end where id = p_id;
  end if;
  insert into fin_movimentos(empresa_id, tipo, direcao, data, descricao, valor, conta_id, categoria_id, baixa_id, criado_por)
  values (p_empresa, 'baixa', case when p_tipo = 'receber' then 'entrada' else 'saida' end, coalesce(p_data, current_date), coalesce(nullif(p_obs,''), v_desc), v_liq, p_conta, v_cat, v_baixa, auth.uid());
  if p_extrato is not null then update fin_extrato set baixa_id = v_baixa where id = p_extrato; end if;
  perform fin_auditar(p_empresa, 'fin_' || p_tipo, p_id, 'baixa', null, jsonb_build_object('baixa', v_baixa, 'valor', p_valor, 'liquido', v_liq, 'origem', p_origem), p_obs);
  return v_baixa;
end $$;

create or replace function public.fin_baixar(p_empresa uuid, p_tipo text, p_id uuid, p_data date, p_valor numeric, p_juros numeric, p_multa numeric, p_desconto numeric, p_tarifa numeric, p_conta uuid, p_forma text, p_obs text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not fin_pode(p_empresa, case when p_tipo = 'receber' then 'financeiro.contas_receber.editar' else 'financeiro.contas_pagar.editar' end) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return fin_baixar_(p_empresa, p_tipo, p_id, p_data, p_valor, p_juros, p_multa, p_desconto, p_tarifa, p_conta, p_forma, p_obs, 'manual', null);
end $$;

create or replace function public.fin_estornar_baixa(p_empresa uuid, p_baixa uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare b fin_baixas%rowtype;
begin
  select * into b from fin_baixas where id = p_baixa and empresa_id = p_empresa for update;
  if not found then raise exception 'Baixa não encontrada'; end if;
  if not fin_pode(p_empresa, case when b.tipo = 'receber' then 'financeiro.contas_receber.editar' else 'financeiro.contas_pagar.editar' end) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if b.estornado_em is not null then raise exception 'Baixa já estornada'; end if;
  if trim(coalesce(p_motivo,'')) = '' then raise exception 'Informe o motivo do estorno'; end if;
  update fin_baixas set estornado_em = now(), estornado_por = auth.uid(), estorno_motivo = p_motivo where id = p_baixa;
  update fin_movimentos set cancelado_em = now() where baixa_id = p_baixa;
  update fin_extrato set baixa_id = null where baixa_id = p_baixa;
  if b.tipo = 'receber' then
    update fin_receber set recebido = greatest(recebido - b.valor, 0), status = case when recebido - b.valor <= 0.005 then 'aberto' else 'parcial' end where id = b.receber_id and status <> 'cancelado';
  else
    update fin_pagar set pago = greatest(pago - b.valor, 0), status = case when pago - b.valor > 0.005 then 'parcial' when programado_para is not null then 'programado' when aprovacao = 'aprovada' then 'aprovado' else 'pendente' end where id = b.pagar_id and status <> 'cancelado';
  end if;
  perform fin_auditar(p_empresa, 'fin_baixas', p_baixa, 'estorno', to_jsonb(b), null, p_motivo);
end $$;

create or replace function public.fin_cancelar_titulo(p_empresa uuid, p_tipo text, p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if trim(coalesce(p_motivo,'')) = '' then raise exception 'Informe o motivo'; end if;
  if not fin_pode(p_empresa, case when p_tipo = 'receber' then 'financeiro.contas_receber.editar' else 'financeiro.contas_pagar.editar' end) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if p_tipo = 'receber' then
    if exists (select 1 from fin_receber where id = p_id and empresa_id = p_empresa and recebido > 0) then raise exception 'Estorne as baixas antes de cancelar'; end if;
    update fin_receber set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), cancelamento_motivo = p_motivo where id = p_id and empresa_id = p_empresa;
  else
    if exists (select 1 from fin_pagar where id = p_id and empresa_id = p_empresa and pago > 0) then raise exception 'Estorne as baixas antes de cancelar'; end if;
    update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), cancelamento_motivo = p_motivo where id = p_id and empresa_id = p_empresa;
  end if;
  perform fin_auditar(p_empresa, 'fin_' || p_tipo, p_id, 'cancelamento', null, null, p_motivo);
end $$;

create or replace function public.fin_aprovar_pagar(p_empresa uuid, p_id uuid, p_aprovar boolean, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  update fin_pagar set aprovacao = case when p_aprovar then 'aprovada' else 'reprovada' end, aprovado_por = auth.uid(), aprovado_em = now(), aprovacao_obs = p_obs,
         status = case when p_aprovar and status = 'pendente' then 'aprovado' else status end
   where id = p_id and empresa_id = p_empresa;
  perform fin_auditar(p_empresa, 'fin_pagar', p_id, case when p_aprovar then 'aprovacao' else 'reprovacao' end, null, null, p_obs);
end $$;

create or replace function public.fin_programar_pagar(p_empresa uuid, p_id uuid, p_data date, p_conta uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if exists (select 1 from fin_pagar where id = p_id and requer_aprovacao and aprovacao <> 'aprovada') then raise exception 'Pagamento ainda não aprovado'; end if;
  update fin_pagar set programado_para = p_data, conta_id = coalesce(p_conta, conta_id), status = case when status in ('pendente','aprovado','programado') then 'programado' else status end
   where id = p_id and empresa_id = p_empresa;
  perform fin_auditar(p_empresa, 'fin_pagar', p_id, 'programacao', null, jsonb_build_object('data', p_data, 'conta', p_conta), null);
end $$;

create or replace function public.fin_transferir(p_empresa uuid, p_de uuid, p_para uuid, p_data date, p_valor numeric, p_descricao text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_g uuid := gen_random_uuid();
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.criar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if p_de = p_para then raise exception 'Escolha contas diferentes'; end if;
  if coalesce(p_valor,0) <= 0 then raise exception 'Valor inválido'; end if;
  if (select count(*) from fin_contas where id in (p_de, p_para) and empresa_id = p_empresa) <> 2 then raise exception 'Conta inválida'; end if;
  insert into fin_movimentos(empresa_id, tipo, direcao, data, descricao, valor, conta_id, transferencia_grupo, criado_por) values
    (p_empresa, 'transferencia', 'saida', p_data, coalesce(nullif(p_descricao,''), 'Transferência entre contas'), p_valor, p_de, v_g, auth.uid()),
    (p_empresa, 'transferencia', 'entrada', p_data, coalesce(nullif(p_descricao,''), 'Transferência entre contas'), p_valor, p_para, v_g, auth.uid());
  perform fin_auditar(p_empresa, 'transferencia', v_g, 'transferencia', null, jsonb_build_object('de', p_de, 'para', p_para, 'valor', p_valor), p_descricao);
  return v_g;
end $$;

create or replace function public.fin_ajustar_saldo(p_empresa uuid, p_conta uuid, p_direcao text, p_data date, p_valor numeric, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if p_direcao not in ('entrada','saida') or coalesce(p_valor,0) <= 0 or trim(coalesce(p_motivo,'')) = '' then raise exception 'Dados do ajuste inválidos'; end if;
  if not exists (select 1 from fin_contas where id = p_conta and empresa_id = p_empresa) then raise exception 'Conta inválida'; end if;
  insert into fin_movimentos(empresa_id, tipo, direcao, data, descricao, valor, conta_id, criado_por)
  values (p_empresa, 'ajuste', p_direcao, p_data, p_motivo, p_valor, p_conta, auth.uid()) returning id into v_id;
  perform fin_auditar(p_empresa, 'fin_movimentos', v_id, 'ajuste', null, jsonb_build_object('direcao', p_direcao, 'valor', p_valor), p_motivo);
  return v_id;
end $$;

-- ------------------------------------------------------------------ relatórios
create or replace function public.fin_saldos(p_empresa uuid)
returns table(conta_id uuid, saldo numeric)
language sql stable security definer set search_path = public as $$
  select c.id, c.saldo_inicial + coalesce((select sum(case when m.direcao = 'entrada' then m.valor else -m.valor end) from fin_movimentos m
          where m.conta_id = c.id and m.cancelado_em is null and m.data >= c.saldo_inicial_data), 0)
    from fin_contas c where c.empresa_id = p_empresa and public.fin_pode(p_empresa, 'financeiro.fluxo.visualizar');
$$;

-- Fluxo diário: dias passados = realizado; a vencer = previsto; vencidos à parte.
create or replace function public.fin_fluxo(p_empresa uuid, p_ini date, p_fim date, p_conta uuid default null)
returns table(dia date, previsto_entrada numeric, previsto_saida numeric, realizado_entrada numeric, realizado_saida numeric, saldo_previsto numeric, saldo_realizado numeric, vencido_receber numeric, vencido_pagar numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_base numeric; v_antes numeric; v_vr numeric; v_vp numeric;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select coalesce(sum(saldo_inicial),0) into v_base from fin_contas where empresa_id = p_empresa and ativo and (p_conta is null or id = p_conta);
  select coalesce(sum(case when m.direcao = 'entrada' then m.valor else -m.valor end),0) into v_antes
    from fin_movimentos m join fin_contas c on c.id = m.conta_id
   where m.empresa_id = p_empresa and m.cancelado_em is null and m.data >= c.saldo_inicial_data and m.data < p_ini and (p_conta is null or m.conta_id = p_conta);
  select coalesce(sum(aberto),0) into v_vr from fin_receber where empresa_id = p_empresa and status in ('aberto','parcial') and vencimento < current_date and (p_conta is null or conta_id = p_conta);
  select coalesce(sum(aberto),0) into v_vp from fin_pagar where empresa_id = p_empresa and status not in ('pago','cancelado') and coalesce(programado_para, vencimento) < current_date and (p_conta is null or conta_id = p_conta);
  return query
  with dias as (select generate_series(p_ini, p_fim, '1 day')::date d),
  t as (select d.d,
    case when d.d < current_date then 0 else coalesce((select sum(aberto) from fin_receber where empresa_id = p_empresa and status in ('aberto','parcial') and vencimento = d.d and (p_conta is null or conta_id = p_conta)),0) end pe,
    case when d.d < current_date then 0 else coalesce((select sum(aberto) from fin_pagar where empresa_id = p_empresa and status not in ('pago','cancelado') and coalesce(programado_para, vencimento) = d.d and (p_conta is null or conta_id = p_conta)),0) end ps,
    coalesce((select sum(valor) from fin_movimentos where empresa_id = p_empresa and cancelado_em is null and direcao = 'entrada' and data = d.d and (p_conta is null or conta_id = p_conta)),0) re,
    coalesce((select sum(valor) from fin_movimentos where empresa_id = p_empresa and cancelado_em is null and direcao = 'saida' and data = d.d and (p_conta is null or conta_id = p_conta)),0) rs
    from dias d)
  select t.d, t.pe, t.ps, t.re, t.rs,
         v_base + v_antes + sum(t.re - t.rs + t.pe - t.ps) over (order by t.d),
         v_base + v_antes + sum(t.re - t.rs) over (order by t.d),
         v_vr, v_vp
    from t order by t.d;
end $$;

create or replace function public.fin_dre(p_empresa uuid, p_ini date, p_fim date)
returns table(categoria_id uuid, codigo text, nome text, tipo text, pai_id uuid, previsto numeric, realizado numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return query
  with t as (
    select r.categoria_id cat, r.valor prev, r.recebido real from fin_receber r where r.empresa_id = p_empresa and r.status <> 'cancelado' and coalesce(r.competencia, r.vencimento) between p_ini and p_fim
    union all
    select g.categoria_id, g.valor, g.pago from fin_pagar g where g.empresa_id = p_empresa and g.status <> 'cancelado' and coalesce(g.competencia, g.vencimento) between p_ini and p_fim)
  select c.id, c.codigo, coalesce(c.nome, 'Sem categoria'), coalesce(c.tipo, '?'), c.pai_id, sum(t.prev)::numeric, sum(t.real)::numeric
    from t left join fin_categorias c on c.id = t.cat
   group by c.id, c.codigo, c.nome, c.tipo, c.pai_id
   order by c.codigo nulls last;
end $$;

create or replace function public.fin_inadimplencia(p_empresa uuid)
returns table(cliente text, titulos bigint, valor numeric, maior_atraso integer, mais_antigo date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return query
  select coalesce(r.cliente_nome, 'Cliente não informado'), count(*), sum(r.aberto)::numeric, max(current_date - r.vencimento)::int, min(r.vencimento)
    from fin_receber r where r.empresa_id = p_empresa and r.status in ('aberto','parcial') and r.vencimento < current_date and r.aberto > 0
   group by coalesce(r.cliente_nome, 'Cliente não informado') order by 3 desc;
end $$;

-- ------------------------------------------------------------------ conciliação
create or replace function public.fin_importar_extrato(p_empresa uuid, p_conta uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if not exists (select 1 from fin_contas where id = p_conta and empresa_id = p_empresa) then raise exception 'Conta inválida'; end if;
  with ins as (
    insert into fin_extrato(empresa_id, conta_id, fitid, data, valor, descricao)
    select p_empresa, p_conta, x->>'fitid', (x->>'data')::date, (x->>'valor')::numeric, left(x->>'descricao', 300)
      from jsonb_array_elements(p_linhas) x
     where coalesce(x->>'fitid','') <> '' and (x->>'valor')::numeric <> 0
    on conflict (conta_id, fitid) do nothing returning 1)
  select count(*) into v_n from ins;
  return v_n;
end $$;

create or replace function public.fin_conciliar(p_empresa uuid, p_extrato uuid, p_tipo text, p_titulo uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare e fin_extrato%rowtype; v_aberto numeric;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into e from fin_extrato where id = p_extrato and empresa_id = p_empresa for update;
  if not found then raise exception 'Linha do extrato não encontrada'; end if;
  if e.baixa_id is not null then raise exception 'Linha já conciliada'; end if;
  if p_tipo = 'receber' then select aberto into v_aberto from fin_receber where id = p_titulo and empresa_id = p_empresa;
  else select aberto into v_aberto from fin_pagar where id = p_titulo and empresa_id = p_empresa; end if;
  return fin_baixar_(p_empresa, p_tipo, p_titulo, e.data, least(abs(e.valor), v_aberto), 0, 0, 0, 0, e.conta_id, 'Extrato', coalesce(e.descricao, 'Conciliação'), 'conciliacao', e.id);
end $$;

create or replace function public.fin_ignorar_extrato(p_empresa uuid, p_extrato uuid, p_ignorar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  update fin_extrato set ignorado = p_ignorar where id = p_extrato and empresa_id = p_empresa and baixa_id is null;
end $$;

-- Lança e baixa na hora (tarifa, juros, recebimento sem título).
create or replace function public.fin_conciliar_novo(p_empresa uuid, p_extrato uuid, p_descricao text, p_categoria uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare e fin_extrato%rowtype; v_tipo text; v_id uuid;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into e from fin_extrato where id = p_extrato and empresa_id = p_empresa for update;
  if not found or e.baixa_id is not null then raise exception 'Linha inválida ou já conciliada'; end if;
  v_tipo := case when e.valor > 0 then 'receber' else 'pagar' end;
  if v_tipo = 'receber' then
    insert into fin_receber(empresa_id, origem, descricao, emissao, competencia, vencimento, valor, conta_id, conta_manual, categoria_id, criado_por)
    values (p_empresa, 'conciliacao', coalesce(nullif(p_descricao,''), e.descricao, 'Recebimento do extrato'), e.data, e.data, e.data, abs(e.valor), e.conta_id, true, coalesce(p_categoria, fin_categoria(p_empresa,'outras_receitas')), auth.uid()) returning id into v_id;
  else
    insert into fin_pagar(empresa_id, origem, descricao, emissao, competencia, vencimento, valor, conta_id, categoria_id, criado_por)
    values (p_empresa, 'conciliacao', coalesce(nullif(p_descricao,''), e.descricao, 'Pagamento do extrato'), e.data, e.data, e.data, abs(e.valor), e.conta_id, coalesce(p_categoria, fin_categoria(p_empresa,'tarifas')), auth.uid()) returning id into v_id;
  end if;
  return fin_baixar_(p_empresa, v_tipo, v_id, e.data, abs(e.valor), 0, 0, 0, 0, e.conta_id, 'Extrato', coalesce(e.descricao, 'Conciliação'), 'conciliacao', e.id);
end $$;

-- ------------------------------------------------------------------ pedido → contas a receber
create or replace function public.fin_moeda(p_txt text)
returns numeric language sql immutable as $$
  select coalesce(nullif(replace(replace(regexp_replace(coalesce(p_txt,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric, 0);
$$;

create or replace function public.fin_sincronizar_pedido(p_pedido uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  p separacoes_pedidos%rowtype; cfg fin_config%rowtype;
  v_total numeric; v_frete numeric; v_mont numeric; v_loc numeric; v_val jsonb;
  v_parc jsonb; v_n int; v_i int; v_pv numeric; v_venc date; v_forma text;
  v_partes numeric[]; v_comp text[] := array['locacao','frete','montagem']; v_k int; v_parte numeric; v_soma numeric;
  v_alvos text[] := '{}'; v_chave text; v_id uuid; v_conta uuid; v_cat uuid; v_count int := 0;
  v_receb numeric; v_ja numeric; v_dif numeric; v_r record; v_aberto_total numeric; v_quinhao numeric; v_resto numeric; v_conta_b uuid; v_data_b date;
begin
  select * into p from separacoes_pedidos where id = p_pedido;
  if not found then return 0; end if;
  perform fin_semear(p.empresa_id);
  select * into cfg from fin_config where empresa_id = p.empresa_id;

  -- fora dos status que geram cobrança: cancela o que não teve recebimento
  if coalesce(p.status_comercial,'') not in ('aprovado','finalizado','enviado') then
    update fin_receber set status = 'cancelado', cancelado_em = now(), cancelamento_motivo = 'Pedido ' || coalesce(p.status_comercial, '') || ' (cancelado automaticamente)'
     where pedido_id = p.id and origem = 'pedido' and status in ('aberto') and recebido = 0;
    return 0;
  end if;

  v_total := coalesce(p.valor_total, 0);
  if v_total <= 0 then return 0; end if;
  v_val := p.observacoes->'valores';
  if v_val is not null and jsonb_typeof(v_val) = 'object' then
    v_frete := coalesce((v_val->>'frete')::numeric, 0); v_mont := coalesce((v_val->>'montagem')::numeric, 0);
  else
    v_frete := fin_moeda(p.observacoes->'logistica_snapshot'->>'resumoFrete'); v_mont := fin_moeda(p.observacoes->'logistica_snapshot'->>'resumoMontagem');
  end if;
  v_frete := greatest(least(v_frete, v_total), 0); v_mont := greatest(least(v_mont, v_total - v_frete), 0);
  v_loc := v_total - v_frete - v_mont;

  v_parc := p.observacoes->'parcelas_financeiras';
  if v_parc is null or jsonb_typeof(v_parc) <> 'array' or jsonb_array_length(v_parc) = 0 then
    v_parc := jsonb_build_array(jsonb_build_object('numero', 1, 'valor', v_total, 'vencimento', coalesce(p.data_evento, current_date)));
  end if;
  v_n := jsonb_array_length(v_parc);

  for v_i in 0 .. v_n - 1 loop
    v_pv := coalesce(nullif(v_parc->v_i->>'valor','')::numeric, 0);
    if v_pv <= 0 then continue; end if;
    v_venc := coalesce(nullif(left(v_parc->v_i->>'vencimento', 10), '')::date, p.data_evento, current_date);
    v_forma := nullif(v_parc->v_i->>'metodo', '');
    v_partes := array[round(v_pv * v_loc / v_total, 2), round(v_pv * v_frete / v_total, 2), 0];
    v_partes[3] := v_pv - v_partes[1] - v_partes[2];
    for v_k in 1 .. 3 loop
      v_parte := v_partes[v_k];
      if v_parte <= 0 then continue; end if;
      v_chave := (v_i + 1)::text || ':' || v_comp[v_k];
      v_alvos := v_alvos || v_chave;
      v_conta := case v_comp[v_k] when 'locacao' then cfg.conta_locacao when 'frete' then cfg.conta_frete else cfg.conta_montagem end;
      v_cat := fin_categoria(p.empresa_id, v_comp[v_k]);
      select id into v_id from fin_receber where pedido_id = p.id and origem = 'pedido' and parcela = v_i + 1 and componente = v_comp[v_k] and status <> 'cancelado';
      if v_id is null then
        insert into fin_receber(empresa_id, origem, grupo, pedido_id, pedido_numero, componente, cliente_id, cliente_nome, documento, descricao, emissao, competencia, vencimento, valor, parcela, parcelas, forma, conta_id, categoria_id, observacoes)
        values (p.empresa_id, 'pedido', p.id, p.id, p.numero_pedido, v_comp[v_k], p.cliente_id, p.cliente_nome, p.numero_pedido,
                case v_comp[v_k] when 'locacao' then 'Locação' when 'frete' then 'Frete' else 'Montagem' end || ' · ' || coalesce(p.tipo_evento, 'Evento'),
                current_date, coalesce(p.data_evento, v_venc), v_venc, v_parte, v_i + 1, v_n, v_forma, v_conta, v_cat, 'Gerado pelo pedido');
        v_count := v_count + 1;
      else
        update fin_receber set valor = case when recebido = 0 then v_parte else valor end,
               vencimento = case when recebido = 0 then v_venc else vencimento end,
               parcelas = v_n, pedido_numero = p.numero_pedido, cliente_id = p.cliente_id, cliente_nome = p.cliente_nome,
               forma = coalesce(v_forma, forma), competencia = coalesce(p.data_evento, competencia),
               conta_id = case when conta_manual then conta_id else coalesce(v_conta, conta_id) end
         where id = v_id;
      end if;
    end loop;
  end loop;

  -- partes que não existem mais (parcelas mudaram) e não tiveram recebimento
  update fin_receber set status = 'cancelado', cancelado_em = now(), cancelamento_motivo = 'Parcela do pedido alterada'
   where pedido_id = p.id and origem = 'pedido' and status <> 'cancelado' and recebido = 0
     and not ((parcela::text || ':' || componente) = any (v_alvos));

  -- recebimentos do PIX pelo gateway → baixa nas partes da parcela, proporcional ao que está em aberto
  for v_i in 0 .. v_n - 1 loop
    v_receb := greatest(coalesce(nullif(v_parc->v_i->>'valor_recebido','')::numeric, 0), coalesce(nullif(v_parc->v_i->>'recebido','')::numeric, 0), coalesce(nullif(v_parc->v_i->>'baixado','')::numeric, 0));
    if v_receb <= 0 then continue; end if;
    select coalesce(sum(b.valor),0) into v_ja from fin_baixas b join fin_receber r on r.id = b.receber_id
     where r.pedido_id = p.id and r.parcela = v_i + 1 and b.origem = 'gateway' and b.estornado_em is null;
    v_dif := round(v_receb - v_ja, 2);
    if v_dif <= 0.005 then continue; end if;
    select coalesce(sum(aberto),0) into v_aberto_total from fin_receber where pedido_id = p.id and origem = 'pedido' and parcela = v_i + 1 and status in ('aberto','parcial');
    if v_aberto_total <= 0 then continue; end if;
    v_dif := least(v_dif, v_aberto_total); v_resto := v_dif;
    v_data_b := coalesce(nullif(left(v_parc->v_i->>'baixado_em', 10), '')::date, current_date);
    for v_r in select id, aberto, conta_id from fin_receber where pedido_id = p.id and origem = 'pedido' and parcela = v_i + 1 and status in ('aberto','parcial') order by aberto loop
      v_quinhao := round(v_dif * v_r.aberto / v_aberto_total, 2);
      if v_quinhao > v_resto or v_r.aberto >= v_aberto_total - 0.005 then v_quinhao := v_resto; end if;
      v_quinhao := least(v_quinhao, v_r.aberto);
      v_conta_b := coalesce(cfg.conta_gateway, v_r.conta_id);
      if v_quinhao > 0 and v_conta_b is not null then
        perform fin_baixar_(p.empresa_id, 'receber', v_r.id, v_data_b, v_quinhao, 0, 0, 0, 0, v_conta_b, 'PIX', 'PIX recebido pelo gateway', 'gateway', null);
        v_resto := v_resto - v_quinhao;
      end if;
    end loop;
  end loop;
  return v_count;
end $$;

create or replace function public.fin_pedido_gatilho()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform fin_sincronizar_pedido(new.id);
  exception when others then
    raise warning 'Financeiro: não foi possível sincronizar o pedido %: %', new.numero_pedido, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists fin_pedido on public.separacoes_pedidos;
create trigger fin_pedido after insert or update of status_comercial, valor_total, observacoes on public.separacoes_pedidos
  for each row execute function public.fin_pedido_gatilho();

-- ------------------------------------------------------------------ grants (só funções públicas; as internas com "_" não)
revoke all on function public.fin_baixar_(uuid,text,uuid,date,numeric,numeric,numeric,numeric,numeric,uuid,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.fin_sincronizar_pedido(uuid) from public, anon, authenticated;
revoke all on function public.fin_semear(uuid) from public, anon, authenticated;
revoke all on function public.fin_auditar(uuid,text,uuid,text,jsonb,jsonb,text) from public, anon, authenticated;
do $$ declare f text; begin foreach f in array array[
  'fin_preparar(uuid)','fin_salvar_config(uuid,jsonb)','fin_criar_titulo(uuid,text,jsonb,jsonb)','fin_editar_titulo(uuid,text,uuid,jsonb)',
  'fin_baixar(uuid,text,uuid,date,numeric,numeric,numeric,numeric,numeric,uuid,text,text)','fin_estornar_baixa(uuid,uuid,text)','fin_cancelar_titulo(uuid,text,uuid,text)',
  'fin_aprovar_pagar(uuid,uuid,boolean,text)','fin_programar_pagar(uuid,uuid,date,uuid)','fin_transferir(uuid,uuid,uuid,date,numeric,text)',
  'fin_ajustar_saldo(uuid,uuid,text,date,numeric,text)','fin_saldos(uuid)','fin_fluxo(uuid,date,date,uuid)','fin_dre(uuid,date,date)','fin_inadimplencia(uuid)',
  'fin_importar_extrato(uuid,uuid,jsonb)','fin_conciliar(uuid,uuid,text,uuid)','fin_ignorar_extrato(uuid,uuid,boolean)','fin_conciliar_novo(uuid,uuid,text,uuid)'] loop
  execute format('revoke all on function public.%s from public, anon', f);
  execute format('grant execute on function public.%s to authenticated', f);
end loop; end $$;

-- ------------------------------------------------------------------ dados: plano de contas e os pedidos aprovados que já existem
select public.fin_semear(id) from public.empresas;
select public.fin_sincronizar_pedido(id) from public.separacoes_pedidos where status_comercial in ('aprovado','finalizado','enviado');
