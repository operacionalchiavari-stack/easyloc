-- (2026-11-14) Fechamento mensal de parceiros (trazido da Tecnoweld, adaptado aos dados daqui).
-- Parceiro = fornecedor marcado "Cobra por fechamento mensal" (fornecedores.fechamento_mensal). Vale para:
--   * fornecedores de Compras: as parcelas dos pedidos de compra (fin_pagar origem 'compra') nascem como PRÉVIA "aguardando fechamento";
--   * transportadoras e freteiros: o que a Conciliação de Fretes envia ao Contas a Pagar (origem 'frete') também espera o fechamento;
--   * empresas de sublocação: o custo dos itens sublocados nos pedidos reservados vira conta (origem 'sublocacao', uma por pedido) que
--     espera o fechamento (fin_sublocacoes_sincronizar; até aqui esse custo não ia ao Contas a Pagar).
-- No fim do mês o Financeiro (A pagar → Fechamentos de parceiros) arrasta a cobrança do parceiro; cada linha é ligada a uma conta nossa;
-- diferenças: aceitar o valor deles, contestar, lançar o que só eles têm, ignorar; o que não veio fica para o próximo fechamento.
-- "Unificar": forma e parcelas combinadas; as contas são divididas na proporção das parcelas (DRE continua por categoria/competência de
-- cada conta) e cada parcela do fechamento aparece como UMA linha no A pagar. O débito no banco paga a parcela inteira
-- (fin_assist_aplicar ação 'fechamento').

alter table public.fornecedores
  add column if not exists fechamento_mensal boolean not null default false,
  add column if not exists fechamento_dia int check (fechamento_dia between 1 and 31),
  add column if not exists forma_pagamento_padrao text,
  add column if not exists condicao_pagamento_padrao text;

create table if not exists public.fin_fechamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id),
  referencia text not null,
  status text not null default 'em_conferencia' check (status in ('em_conferencia','unificado','cancelado')),
  arquivo_nome text,
  valor_cobrado numeric(15,2),
  forma_pagamento text,
  nf_numero text,
  nf_arquivo_url text,
  nf_arquivo_nome text,
  observacoes text,
  unificado_em timestamptz,
  unificado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fin_fechamentos_empresa_idx on public.fin_fechamentos(empresa_id);
create index if not exists fin_fechamentos_fornecedor_idx on public.fin_fechamentos(fornecedor_id);

create table if not exists public.fin_fechamento_linhas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  fechamento_id uuid not null references public.fin_fechamentos(id) on delete cascade,
  ordem int,
  data date,
  documento text,
  descricao text,
  valor numeric(15,2) not null,
  po_id uuid references public.compras_registros(id) on delete set null,   -- pedido de compra (todas as contas dele)
  titulo_id uuid references public.fin_pagar(id) on delete set null,       -- ou uma conta (frete, sublocação, lançada aqui)
  situacao text not null default 'pendente' check (situacao in ('pendente','conferida','divergente','ajustada','lancada','contestada','ignorada')),
  valor_anterior numeric(15,2),
  motivo text,
  created_at timestamptz not null default now()
);
create index if not exists fin_fechamento_linhas_fech_idx on public.fin_fechamento_linhas(fechamento_id);

create table if not exists public.fin_fechamento_parcelas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  fechamento_id uuid not null references public.fin_fechamentos(id) on delete cascade,
  numero int not null,
  vencimento date not null,
  valor numeric(15,2) not null check (valor > 0),
  unique (fechamento_id, numero)
);

-- como cada conta original ficou (para desfazer a unificação)
create table if not exists public.fin_fechamento_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  fechamento_id uuid not null references public.fin_fechamentos(id) on delete cascade,
  titulo_id uuid not null references public.fin_pagar(id) on delete cascade,
  valor_antes numeric(15,2) not null,
  vencimento_antes date,
  parcela_antes int
);
create index if not exists fin_fechamento_itens_fech_idx on public.fin_fechamento_itens(fechamento_id);

alter table public.fin_pagar
  add column if not exists aguardando_fechamento boolean not null default false,
  add column if not exists fechamento_id uuid references public.fin_fechamentos(id) on delete set null,
  add column if not exists fechamento_parcela_id uuid references public.fin_fechamento_parcelas(id) on delete set null,
  add column if not exists fechamento_copia boolean not null default false;
create index if not exists fin_pagar_fechamento_idx on public.fin_pagar(fechamento_id);
create index if not exists fin_pagar_fech_parcela_idx on public.fin_pagar(fechamento_parcela_id);

do $$ declare t text; begin
  foreach t in array array['fin_fechamentos','fin_fechamento_linhas','fin_fechamento_parcelas','fin_fechamento_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists fin_ler on public.%I', t);
    execute format('create policy fin_ler on public.%I for select to authenticated using (public.eh_membro_empresa(empresa_id) and public.fin_pode(empresa_id, %L))', t, 'financeiro.fluxo.visualizar');
    execute format('drop policy if exists seguranca_2fa on public.%I', t);
    execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()))', t);
  end loop;
end $$;

-- categoria da DRE para a sublocação (custo da operação, junto de fretes)
insert into public.fin_categorias(empresa_id, codigo, nome, tipo, pai_id, chave, ordem)
select c.empresa_id, null, 'Sublocação de móveis', 'saida', c.pai_id, 'sublocacao', c.ordem + 1
  from public.fin_categorias c
 where c.chave = 'fretes' and not exists (select 1 from public.fin_categorias x where x.empresa_id = c.empresa_id and x.chave = 'sublocacao');

-- ------------------------------------------------------------------ prévia "aguardando fechamento"
create or replace function public.fin_pagar_fechamento_trg()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.fechamento_id is null and new.cartao_id is null and new.fornecedor_id is not null and new.origem in ('compra','frete','sublocacao')
     and exists (select 1 from public.fornecedores s where s.id = new.fornecedor_id and s.fechamento_mensal) then
    new.aguardando_fechamento := true;
  end if;
  return new;
end $function$;
drop trigger if exists trg_fin_pagar_fechamento on public.fin_pagar;
create trigger trg_fin_pagar_fechamento before insert on public.fin_pagar for each row execute function public.fin_pagar_fechamento_trg();

-- ligar/desligar no cadastro: as contas ainda não pagas (fora de fechamento) acompanham
create or replace function public.fornecedores_fechamento_trg()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.fechamento_mensal is distinct from old.fechamento_mensal then
    update public.fin_pagar set aguardando_fechamento = new.fechamento_mensal
     where fornecedor_id = new.id and empresa_id = new.empresa_id and origem in ('compra','frete','sublocacao') and fechamento_id is null and cartao_id is null
       and coalesce(pago, 0) = 0 and status not in ('pago','cancelado');
  end if;
  return new;
end $function$;
drop trigger if exists trg_fornecedores_fechamento on public.fornecedores;
create trigger trg_fornecedores_fechamento after update of fechamento_mensal on public.fornecedores for each row execute function public.fornecedores_fechamento_trg();

-- ------------------------------------------------------------------ travas nas rotinas existentes
-- conta em prévia de fechamento não é paga sozinha
do $$ declare d text; begin
  d := pg_get_functiondef('public.fin_baixar_'::regproc);
  if position('aguardando_fechamento' in d) = 0 then
    d := replace(d, 'if v_aberto is null then raise exception ''Título não encontrado''; end if;',
      'if v_aberto is null then raise exception ''Título não encontrado''; end if;
  if p_tipo = ''pagar'' and exists (select 1 from fin_pagar where id = p_id and aguardando_fechamento) then
    raise exception ''Esta conta é de parceiro com fechamento mensal: ela é paga pelo fechamento (Financeiro → A pagar → Fechamentos de parceiros).'';
  end if;');
    if position('aguardando_fechamento' in d) = 0 then raise exception 'fin_baixar_: trecho não encontrado'; end if;
    execute d;
  end if;
end $$;

-- pedido de compra já unificado num fechamento: o pagamento do pedido não é refeito em Compras
do $$ declare d text; begin
  d := pg_get_functiondef('public.compras_pagamento_aplicar(uuid,uuid,text,jsonb,numeric,text,uuid,date)'::regprocedure);
  if position('fechamento_id' in d) = 0 then
    d := replace(d, '  if exists (select 1 from fin_pagar where empresa_id = p_empresa and origem = ''compra'' and origem_id = p.id and status <> ''cancelado'' and pago > 0) then',
      '  if exists (select 1 from fin_pagar where empresa_id = p_empresa and origem = ''compra'' and origem_id = p.id and status <> ''cancelado'' and fechamento_id is not null) then
    raise exception ''Este pedido já entrou num fechamento mensal conferido no Financeiro: o pagamento é o do fechamento.'';
  end if;
  if exists (select 1 from fin_pagar where empresa_id = p_empresa and origem = ''compra'' and origem_id = p.id and status <> ''cancelado'' and pago > 0) then');
    if position('fechamento_id' in d) = 0 then raise exception 'compras_pagamento_aplicar: trecho não encontrado'; end if;
    execute d;
  end if;
end $$;

-- ------------------------------------------------------------------ sublocação: custo dos itens sublocados vira conta do parceiro
-- Uma conta por pedido reservado e parceiro com fechamento mensal (soma custo × quantidade dos itens dele no pedido).
-- Enquanto a conta espera o fechamento ela acompanha o pedido (valor; pedido cancelado cancela a conta).
create or replace function public.fin_sublocacoes_sincronizar(p_empresa uuid)
 returns int language plpgsql security definer set search_path to 'public'
as $function$
declare r record; v_id uuid; v_n int := 0; v_cat uuid;
begin
  v_cat := fin_categoria(p_empresa, 'sublocacao');
  for r in
    with itens as (
      select p.id pedido_id, p.numero_pedido, p.cliente_nome, coalesce(p.data_evento, current_date) data_evento, p.status_comercial,
             nullif(t->>'fornecedor_id','')::uuid fornecedor_id,
             round(coalesce((t->>'custo')::numeric, 0) * coalesce((t->>'quantidade')::numeric, 0), 2) custo
        from separacoes_pedidos p
        cross join lateral jsonb_array_elements(case when jsonb_typeof(p.observacoes->'projeto_comercial'->'dados'->'terceirizados') = 'array'
                                                     then p.observacoes->'projeto_comercial'->'dados'->'terceirizados' else '[]'::jsonb end) t
       where p.empresa_id = p_empresa)
    select i.pedido_id, i.numero_pedido, i.cliente_nome, i.data_evento, i.fornecedor_id, f.nome_fantasia, f.nome_razao_social,
           sum(i.custo) filter (where i.status_comercial in ('aprovado','finalizado','enviado')) custo
      from itens i join fornecedores f on f.id = i.fornecedor_id and f.empresa_id = p_empresa and f.fechamento_mensal
     group by 1,2,3,4,5,6,7
  loop
    select id into v_id from fin_pagar where empresa_id = p_empresa and origem = 'sublocacao' and origem_id = r.pedido_id and fornecedor_id = r.fornecedor_id and status <> 'cancelado' limit 1;
    if coalesce(r.custo, 0) > 0 then
      if v_id is null then
        insert into fin_pagar(empresa_id, origem, origem_id, grupo, fornecedor_id, fornecedor_nome, documento, descricao, emissao, competencia, vencimento, valor, parcela, parcelas,
                              categoria_id, observacoes, criado_por)
        values (p_empresa, 'sublocacao', r.pedido_id, gen_random_uuid(), r.fornecedor_id, coalesce(nullif(r.nome_fantasia,''), r.nome_razao_social), 'Pedido ' || r.numero_pedido,
                'Sublocação · Pedido ' || r.numero_pedido || coalesce(' · ' || r.cliente_nome, ''), current_date, r.data_evento, r.data_evento, r.custo, 1, 1, v_cat,
                'Custo dos itens sublocados no pedido (sincronizado do Comercial)', auth.uid())
        returning id into v_id;
        insert into fin_custos_evento(empresa_id, pedido_id, categoria, descricao, valor, pagar_id, criado_por)
        values (p_empresa, r.pedido_id, 'terceiros', 'Sublocação · ' || coalesce(nullif(r.nome_fantasia,''), r.nome_razao_social), r.custo, v_id,
                coalesce(auth.uid(), (select user_id from usuarios_empresas where empresa_id = p_empresa order by created_at limit 1)));
        v_n := v_n + 1;
      else
        update fin_pagar set valor = r.custo, competencia = r.data_evento, updated_at = now()
         where id = v_id and aguardando_fechamento and fechamento_id is null and coalesce(pago,0) = 0 and abs(valor - r.custo) > 0.005;
        update fin_custos_evento set valor = r.custo where pagar_id = v_id and cancelado_em is null and abs(valor - r.custo) > 0.005
           and exists (select 1 from fin_pagar where id = v_id and fechamento_id is null);
      end if;
    elsif v_id is not null then
      update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), cancelamento_motivo = 'Pedido sem sublocação deste parceiro (ou cancelado)'
       where id = v_id and fechamento_id is null and coalesce(pago,0) = 0;
      update fin_custos_evento set cancelado_em = now(), cancelamento_motivo = 'Sublocação saiu do pedido' where pagar_id = v_id and cancelado_em is null
         and exists (select 1 from fin_pagar where id = v_id and status = 'cancelado');
    end if;
  end loop;
  return v_n;
end $function$;
revoke all on function public.fin_sublocacoes_sincronizar(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers
-- valor de uma "conta nossa": pedido de compra (todas as contas dele) ou conta avulsa
create or replace function public.fin_fech_compra_valor(p_po uuid, p_titulo uuid)
 returns numeric language sql stable set search_path to 'public'
as $function$
  select coalesce(sum(a.valor), 0) from public.fin_pagar a
   where a.status <> 'cancelado' and coalesce(a.pago, 0) = 0
     and ((p_po is not null and a.origem = 'compra' and a.origem_id = p_po) or (p_po is null and a.id = p_titulo));
$function$;

create or replace function public.fin_fech_titulos_(p_po uuid, p_titulo uuid)
 returns setof public.fin_pagar language sql stable set search_path to 'public'
as $function$
  select a.* from public.fin_pagar a
   where a.status <> 'cancelado' and coalesce(a.pago, 0) = 0
     and ((p_po is not null and a.origem = 'compra' and a.origem_id = p_po) or (p_po is null and a.id = p_titulo));
$function$;

-- liga as linhas pendentes da cobrança às contas do parceiro (pedido de compra pelo número citado, ou valor igual)
create or replace function public.fin_fechamento_conciliar_(p_fech uuid)
 returns int language plpgsql security definer set search_path to 'public'
as $function$
declare f public.fin_fechamentos%rowtype; l record; v_po uuid; v_tit uuid; v_val numeric; v_n int := 0;
begin
  select * into f from public.fin_fechamentos where id = p_fech;
  for l in select * from public.fin_fechamento_linhas where fechamento_id = f.id and situacao = 'pendente' and po_id is null and titulo_id is null and valor > 0 order by ordem loop
    v_po := null; v_tit := null;
    -- 1) número do pedido de compra citado (PC-000123 ou "pedido 123")
    select o.id into v_po from public.compras_registros o
     where o.empresa_id = f.empresa_id and o.tipo = 'pedido'
       and exists (select 1 from public.fin_pagar a where a.origem = 'compra' and a.origem_id = o.id and a.fornecedor_id = f.fornecedor_id and (a.aguardando_fechamento or a.fechamento_id = f.id) and a.status <> 'cancelado')
       and not exists (select 1 from public.fin_fechamento_linhas x where x.fechamento_id = f.id and x.po_id = o.id and x.id <> l.id)
       and (coalesce(l.documento, '') || ' ' || coalesce(l.descricao, '')) ~* ('(^|[^0-9])0*' || o.numero::text || '([^0-9]|$)')
       and (coalesce(l.documento, '') || ' ' || coalesce(l.descricao, '')) ~* ('(pc|pedido|ped)')
     order by abs(public.fin_fech_compra_valor(o.id, null) - l.valor) limit 1;
    -- 2) pedido de compra com valor igual
    if v_po is null then
      select o.id into v_po from public.compras_registros o
       where o.empresa_id = f.empresa_id and o.tipo = 'pedido'
         and exists (select 1 from public.fin_pagar a where a.origem = 'compra' and a.origem_id = o.id and a.fornecedor_id = f.fornecedor_id and (a.aguardando_fechamento or a.fechamento_id = f.id) and a.status <> 'cancelado')
         and not exists (select 1 from public.fin_fechamento_linhas x where x.fechamento_id = f.id and x.po_id = o.id)
         and abs(public.fin_fech_compra_valor(o.id, null) - l.valor) <= 0.01
       order by abs(o.created_at::date - coalesce(l.data, o.created_at::date)) limit 1;
    end if;
    -- 3) conta avulsa (frete, sublocação…): nº do pedido do evento citado, senão valor igual
    if v_po is null then
      select a.id into v_tit from public.fin_pagar a
       where a.empresa_id = f.empresa_id and a.fornecedor_id = f.fornecedor_id and a.origem <> 'compra'
         and (a.aguardando_fechamento or a.fechamento_id = f.id) and a.status <> 'cancelado' and coalesce(a.pago, 0) = 0 and not a.fechamento_copia
         and not exists (select 1 from public.fin_fechamento_linhas x where x.fechamento_id = f.id and x.titulo_id = a.id)
         and (abs(a.valor - l.valor) <= 0.01
              or (a.documento is not null and (coalesce(l.documento, '') || ' ' || coalesce(l.descricao, '')) ~* ('(^|[^0-9])' || regexp_replace(a.documento, '\D', '', 'g') || '([^0-9]|$)')
                  and regexp_replace(a.documento, '\D', '', 'g') <> ''))
       order by abs(a.valor - l.valor), abs(coalesce(a.competencia, a.emissao) - coalesce(l.data, a.emissao)) limit 1;
    end if;
    if v_po is not null or v_tit is not null then
      v_val := public.fin_fech_compra_valor(v_po, v_tit);
      update public.fin_fechamento_linhas set po_id = v_po, titulo_id = v_tit, situacao = case when abs(v_val - l.valor) <= 0.01 then 'conferida' else 'divergente' end where id = l.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $function$;
revoke all on function public.fin_fechamento_conciliar_(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ RPCs da tela
create or replace function public.fin_fechamento_fornecedores(p_empresa uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  perform fin_sublocacoes_sincronizar(p_empresa);
  return coalesce((select jsonb_agg(x order by x->>'nome') from (
    select jsonb_build_object('id', s.id, 'nome', coalesce(nullif(s.nome_fantasia, ''), s.nome_razao_social), 'documento', s.documento, 'fechamento_dia', s.fechamento_dia, 'logo_url', s.foto_url,
      'tipo', case when s.terceirizacao then 'Sublocação' when exists (select 1 from caminhoes k where k.fornecedor_id = s.id) then 'Transporte' else 'Fornecedor' end,
      'forma_padrao', s.forma_pagamento_padrao, 'condicao_padrao', s.condicao_pagamento_padrao,
      'aguardando_valor', (select coalesce(sum(a.valor), 0) from fin_pagar a where a.fornecedor_id = s.id and a.empresa_id = p_empresa and a.aguardando_fechamento and a.status <> 'cancelado'),
      'aguardando_pedidos', (select count(distinct case when a.origem = 'compra' then a.origem_id else a.id end) from fin_pagar a where a.fornecedor_id = s.id and a.empresa_id = p_empresa and a.aguardando_fechamento and a.status <> 'cancelado'),
      'fechamentos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'referencia', f.referencia, 'status', f.status, 'created_at', f.created_at, 'nf_numero', f.nf_numero,
          'total', (select coalesce(sum(p.valor), 0) from fin_fechamento_parcelas p where p.fechamento_id = f.id),
          'aberto', (select coalesce(sum(a.aberto), 0) from fin_pagar a where a.fechamento_id = f.id and a.status <> 'cancelado' and f.status = 'unificado'))
          order by f.created_at desc) from fin_fechamentos f where f.fornecedor_id = s.id and f.empresa_id = p_empresa and f.status <> 'cancelado'), '[]'::jsonb)) x
      from fornecedores s where s.empresa_id = p_empresa and (s.fechamento_mensal or exists (select 1 from fin_fechamentos f where f.fornecedor_id = s.id and f.status <> 'cancelado'))) z), '[]'::jsonb);
end $function$;

create or replace function public.fin_fechamento_criar(p_empresa uuid, p_fornecedor uuid, p_referencia text)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if not exists (select 1 from fornecedores where id = p_fornecedor and empresa_id = p_empresa) then raise exception 'Parceiro não encontrado.'; end if;
  select id into v_id from fin_fechamentos where fornecedor_id = p_fornecedor and empresa_id = p_empresa and status = 'em_conferencia' limit 1;
  if v_id is not null then return v_id; end if; -- um fechamento em conferência por parceiro
  insert into fin_fechamentos(empresa_id, fornecedor_id, referencia) values (p_empresa, p_fornecedor, coalesce(nullif(trim(p_referencia), ''), to_char(current_date, 'MM/YYYY')))
  returning id into v_id;
  return v_id;
end $function$;

create or replace function public.fin_fechamento_detalhe(p_empresa uuid, p_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare f fin_fechamentos%rowtype;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into f from fin_fechamentos where id = p_id and empresa_id = p_empresa;
  if f.id is null then raise exception 'Fechamento não encontrado.'; end if;
  return jsonb_build_object(
    'fechamento', to_jsonb(f) || jsonb_build_object('fornecedor', (select coalesce(nullif(nome_fantasia, ''), nome_razao_social) from fornecedores where id = f.fornecedor_id),
       'condicao_padrao', (select condicao_pagamento_padrao from fornecedores where id = f.fornecedor_id), 'forma_padrao', (select forma_pagamento_padrao from fornecedores where id = f.fornecedor_id)),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'data', l.data, 'documento', l.documento, 'descricao', l.descricao, 'valor', l.valor, 'situacao', l.situacao,
        'po_id', l.po_id, 'titulo_id', l.titulo_id,
        'categoria_id', (select a.categoria_id from fin_pagar a where a.status <> 'cancelado' and ((l.po_id is not null and a.origem = 'compra' and a.origem_id = l.po_id) or a.id = l.titulo_id) order by a.parcela limit 1),
        'centro_custo_id', (select a.centro_custo_id from fin_pagar a where a.status <> 'cancelado' and ((l.po_id is not null and a.origem = 'compra' and a.origem_id = l.po_id) or a.id = l.titulo_id) order by a.parcela limit 1),
        'valor_anterior', l.valor_anterior, 'motivo', l.motivo,
        'po_numero', (select numero from compras_registros where id = l.po_id),
        'rotulo', (select a.descricao from fin_pagar a where a.id = l.titulo_id),
        'nosso_valor', case when l.po_id is not null or l.titulo_id is not null then fin_fech_compra_valor(l.po_id, l.titulo_id) end) order by l.ordem, l.data) from fin_fechamento_linhas l where l.fechamento_id = f.id), '[]'::jsonb),
    -- nossas contas deste parceiro esperando fechamento (ou já neste)
    'compras', coalesce((select jsonb_agg(c order by c->>'data') from (
        select jsonb_build_object('po_id', o.id, 'titulo_id', null, 'numero', o.numero, 'data', o.created_at::date, 'valor', fin_fech_compra_valor(o.id, null),
          'categoria_id', (select a.categoria_id from fin_pagar a where a.status <> 'cancelado' and a.origem = 'compra' and a.origem_id = o.id order by a.parcela limit 1),
          'centro_custo_id', (select a.centro_custo_id from fin_pagar a where a.status <> 'cancelado' and a.origem = 'compra' and a.origem_id = o.id order by a.parcela limit 1),
          'recebido', o.status in ('recebido','concluido'), 'descricao', coalesce(o.dados->>'descricao', o.dados->>'titulo', 'Pedido de compra'),
          'linha_id', (select l.id from fin_fechamento_linhas l where l.fechamento_id = f.id and l.po_id = o.id limit 1)) c
          from compras_registros o
         where o.empresa_id = p_empresa and o.tipo = 'pedido'
           and exists (select 1 from fin_pagar a where a.origem = 'compra' and a.origem_id = o.id and a.fornecedor_id = f.fornecedor_id and a.status <> 'cancelado'
                         and (a.aguardando_fechamento or a.fechamento_id = f.id))
        union all
        select jsonb_build_object('po_id', null, 'titulo_id', a.id, 'numero', null, 'data', coalesce(a.competencia, a.emissao, a.created_at::date), 'valor', a.valor, 'descricao', a.descricao,
          'rotulo', case a.origem when 'frete' then 'Frete' when 'sublocacao' then 'Sublocação' when 'fechamento_item' then 'Lançado no fechamento' else 'Conta' end || coalesce(' · ' || a.documento, ''),
          'categoria_id', a.categoria_id, 'centro_custo_id', a.centro_custo_id,
          'linha_id', (select l.id from fin_fechamento_linhas l where l.fechamento_id = f.id and l.titulo_id = a.id limit 1))
          from fin_pagar a
         where a.empresa_id = p_empresa and a.fornecedor_id = f.fornecedor_id and a.origem <> 'compra' and a.status <> 'cancelado'
           and not a.fechamento_copia and (a.aguardando_fechamento or a.fechamento_id = f.id)) z), '[]'::jsonb),
    'parcelas', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'numero', p.numero, 'vencimento', p.vencimento, 'valor', p.valor,
        'aberto', (select coalesce(sum(a.aberto), 0) from fin_pagar a where a.fechamento_parcela_id = p.id and a.status <> 'cancelado')) order by p.numero)
        from fin_fechamento_parcelas p where p.fechamento_id = f.id), '[]'::jsonb),
    'pago', exists (select 1 from fin_pagar a where a.fechamento_id = f.id and coalesce(a.pago, 0) > 0));
end $function$;

create or replace function public.fin_fechamento_importar(p_empresa uuid, p_id uuid, p_linhas jsonb, p_arquivo text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare f fin_fechamentos%rowtype; x jsonb; v_i int := 0; v_n int := 0;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into f from fin_fechamentos where id = p_id and empresa_id = p_empresa for update;
  if f.id is null then raise exception 'Fechamento não encontrado.'; end if;
  if f.status <> 'em_conferencia' then raise exception 'Este fechamento já foi unificado.'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'O arquivo não tem lançamentos.'; end if;
  delete from fin_fechamento_linhas where fechamento_id = f.id and situacao in ('pendente','conferida','divergente','ignorada');
  for x in select * from jsonb_array_elements(p_linhas) loop
    v_i := v_i + 1;
    if coalesce((x->>'valor')::numeric, 0) = 0 then continue; end if;
    insert into fin_fechamento_linhas(empresa_id, fechamento_id, ordem, data, documento, descricao, valor)
    values (p_empresa, f.id, v_i, nullif(x->>'data', '')::date, left(nullif(trim(coalesce(x->>'documento', '')), ''), 80), left(nullif(trim(coalesce(x->>'descricao', '')), ''), 300), round(abs((x->>'valor')::numeric), 2));
    v_n := v_n + 1;
  end loop;
  update fin_fechamentos set arquivo_nome = left(p_arquivo, 200), updated_at = now(),
         valor_cobrado = (select sum(valor) from fin_fechamento_linhas where fechamento_id = f.id) where id = f.id;
  return jsonb_build_object('linhas', v_n, 'ligadas', fin_fechamento_conciliar_(f.id));
end $function$;

create or replace function public.fin_fechamento_linha_add(p_empresa uuid, p_id uuid, p_dados jsonb)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare f fin_fechamentos%rowtype; v_id uuid;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into f from fin_fechamentos where id = p_id and empresa_id = p_empresa;
  if f.id is null or f.status <> 'em_conferencia' then raise exception 'Fechamento não está em conferência.'; end if;
  if coalesce((p_dados->>'valor')::numeric, 0) <= 0 then raise exception 'Informe o valor.'; end if;
  insert into fin_fechamento_linhas(empresa_id, fechamento_id, ordem, data, documento, descricao, valor)
  values (p_empresa, f.id, coalesce((select max(ordem) from fin_fechamento_linhas where fechamento_id = f.id), 0) + 1, nullif(p_dados->>'data', '')::date,
          nullif(trim(coalesce(p_dados->>'documento', '')), ''), nullif(trim(coalesce(p_dados->>'descricao', '')), ''), round((p_dados->>'valor')::numeric, 2))
  returning id into v_id;
  update fin_fechamentos set valor_cobrado = (select sum(valor) from fin_fechamento_linhas where fechamento_id = f.id), updated_at = now() where id = f.id;
  perform fin_fechamento_conciliar_(f.id);
  return v_id;
end $function$;

create or replace function public.fin_fechamento_linha_acao(p_empresa uuid, p_linha uuid, p_acao jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare l fin_fechamento_linhas%rowtype; f fin_fechamentos%rowtype; v_tipo text := p_acao->>'tipo'; v_po uuid; v_tit uuid; v_val numeric; v_fator numeric; v_cat uuid;
  t fin_pagar%rowtype; v_soma numeric; v_ult uuid;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into l from fin_fechamento_linhas where id = p_linha and empresa_id = p_empresa for update;
  if l.id is null then raise exception 'Linha não encontrada.'; end if;
  select * into f from fin_fechamentos where id = l.fechamento_id;
  if f.status <> 'em_conferencia' then raise exception 'Este fechamento já foi unificado.'; end if;
  if v_tipo = 'vincular' then
    v_po := nullif(p_acao->>'po_id', '')::uuid; v_tit := nullif(p_acao->>'titulo_id', '')::uuid;
    if v_po is not null and not exists (select 1 from fin_pagar where origem = 'compra' and origem_id = v_po and empresa_id = p_empresa and fornecedor_id = f.fornecedor_id) then raise exception 'Pedido inválido.'; end if;
    if v_po is null and (v_tit is null or not exists (select 1 from fin_pagar where id = v_tit and empresa_id = p_empresa and fornecedor_id = f.fornecedor_id)) then raise exception 'Escolha a conta.'; end if;
    if exists (select 1 from fin_fechamento_linhas x where x.fechamento_id = f.id and x.id <> l.id and ((v_po is not null and x.po_id = v_po) or (v_po is null and x.titulo_id = v_tit))) then
      raise exception 'Essa conta já está ligada a outra linha da cobrança.';
    end if;
    v_val := fin_fech_compra_valor(v_po, v_tit);
    update fin_fechamento_linhas set po_id = v_po, titulo_id = case when v_po is null then v_tit end, situacao = case when abs(v_val - l.valor) <= 0.01 then 'conferida' else 'divergente' end, motivo = null where id = l.id;
  elsif v_tipo = 'desvincular' or v_tipo = 'reabrir' then
    if l.situacao = 'lancada' then raise exception 'Esta linha virou um lançamento; cancele a conta no contas a pagar para refazer.'; end if;
    if l.situacao = 'ajustada' then raise exception 'O valor já foi ajustado; ligue de novo ou ajuste a conta no contas a pagar.'; end if;
    update fin_fechamento_linhas set po_id = null, titulo_id = null, situacao = 'pendente', motivo = null where id = l.id;
  elsif v_tipo = 'ajustar' then
    -- aceita o valor deles: as contas são ajustadas na proporção (fica registrado o valor anterior)
    if l.po_id is null and l.titulo_id is null then raise exception 'Ligue a linha a uma conta antes de ajustar.'; end if;
    v_val := fin_fech_compra_valor(l.po_id, l.titulo_id);
    if v_val <= 0 then raise exception 'A conta não tem valor em aberto.'; end if;
    v_fator := l.valor / v_val; v_soma := 0;
    for t in select * from fin_fech_titulos_(l.po_id, l.titulo_id) order by parcela loop
      update fin_pagar set valor = round(t.valor * v_fator, 2),
             observacoes = concat_ws(' · ', observacoes, 'Valor ajustado no fechamento ' || f.referencia || ' (de ' || to_char(t.valor, 'FM999999990.00') || ')') where id = t.id;
      v_soma := v_soma + round(t.valor * v_fator, 2); v_ult := t.id;
    end loop;
    if v_ult is not null and abs(v_soma - l.valor) > 0.001 then update fin_pagar set valor = valor + (l.valor - v_soma) where id = v_ult; end if;
    update fin_fechamento_linhas set situacao = 'ajustada', valor_anterior = v_val where id = l.id;
  elsif v_tipo = 'contestar' then
    if trim(coalesce(p_acao->>'motivo', '')) = '' then raise exception 'Informe o motivo da contestação.'; end if;
    update fin_fechamento_linhas set situacao = 'contestada', motivo = trim(p_acao->>'motivo') where id = l.id;
  elsif v_tipo = 'ignorar' then
    update fin_fechamento_linhas set situacao = 'ignorada', motivo = nullif(trim(coalesce(p_acao->>'motivo', '')), '') where id = l.id;
  elsif v_tipo = 'lancar' then
    if l.po_id is not null or l.titulo_id is not null then raise exception 'Esta linha já está ligada a uma conta.'; end if;
    v_cat := nullif(p_acao->>'categoria_id', '')::uuid;
    if v_cat is null or not exists (select 1 from fin_categorias where id = v_cat and empresa_id = p_empresa and tipo = 'saida') then raise exception 'Escolha a categoria (é ela que entra na DRE).'; end if;
    insert into fin_pagar(empresa_id, origem, origem_id, grupo, fornecedor_id, fornecedor_nome, documento, descricao, emissao, competencia, vencimento,
      valor, parcela, parcelas, categoria_id, centro_custo_id, observacoes, aguardando_fechamento, criado_por)
    values (p_empresa, 'fechamento_item', l.id, gen_random_uuid(), f.fornecedor_id, (select coalesce(nullif(nome_fantasia, ''), nome_razao_social) from fornecedores where id = f.fornecedor_id),
      l.documento, coalesce(nullif(trim(coalesce(p_acao->>'descricao', '')), ''), l.descricao, 'Item do fechamento ' || f.referencia), coalesce(l.data, current_date), coalesce(l.data, current_date),
      coalesce(l.data, current_date) + 30, l.valor, 1, 1, v_cat, nullif(p_acao->>'centro_custo_id', '')::uuid, 'Lançado na conferência do fechamento ' || f.referencia, true, auth.uid())
    returning id into v_tit;
    update fin_fechamento_linhas set titulo_id = v_tit, situacao = 'lancada' where id = l.id;
  else
    raise exception 'Ação inválida.';
  end if;
  perform fin_auditar(p_empresa, 'fin_fechamento_linhas', l.id, 'acao_' || coalesce(v_tipo, ''), to_jsonb(l), p_acao, null);
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.fin_fechamento_salvar(p_empresa uuid, p_id uuid, p_dados jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if not exists (select 1 from fin_fechamentos where id = p_id and empresa_id = p_empresa) then raise exception 'Fechamento não encontrado.'; end if;
  update fin_fechamentos set
    referencia = case when p_dados ? 'referencia' then coalesce(nullif(trim(p_dados->>'referencia'), ''), referencia) else referencia end,
    observacoes = case when p_dados ? 'observacoes' then nullif(trim(p_dados->>'observacoes'), '') else observacoes end,
    nf_numero = case when p_dados ? 'nf_numero' then nullif(trim(p_dados->>'nf_numero'), '') else nf_numero end,
    nf_arquivo_url = case when p_dados ? 'nf_arquivo_url' then nullif(p_dados->>'nf_arquivo_url', '') else nf_arquivo_url end,
    nf_arquivo_nome = case when p_dados ? 'nf_arquivo_nome' then nullif(p_dados->>'nf_arquivo_nome', '') else nf_arquivo_nome end,
    updated_at = now()
   where id = p_id;
  if p_dados ? 'nf_numero' then
    update fin_pagar set documento = coalesce(nullif(trim(p_dados->>'nf_numero'), ''), documento) where fechamento_id = p_id and empresa_id = p_empresa;
  end if;
end $function$;

create or replace function public.fin_fechamento_excluir(p_empresa uuid, p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare f fin_fechamentos%rowtype;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into f from fin_fechamentos where id = p_id and empresa_id = p_empresa for update;
  if f.id is null then raise exception 'Fechamento não encontrado.'; end if;
  if f.status <> 'em_conferencia' then raise exception 'Fechamento unificado: desfaça a unificação antes.'; end if;
  if exists (select 1 from fin_fechamento_linhas where fechamento_id = f.id and situacao in ('lancada','ajustada')) then
    raise exception 'Há linhas lançadas ou com valor ajustado: elas continuam no contas a pagar. Desfaça no contas a pagar ou mantenha o fechamento.';
  end if;
  update fin_fechamentos set status = 'cancelado', updated_at = now() where id = f.id;
end $function$;

-- unificar: divide as contas conferidas na proporção das parcelas combinadas
create or replace function public.fin_fechamento_unificar(p_empresa uuid, p_id uuid, p_parcelas jsonb, p_forma text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare f fin_fechamentos%rowtype; v_total numeric; v_soma numeric; v_n int; x jsonb; v_k int; p record; t record; v_rest numeric; v_part numeric;
  v_first boolean; v_dif numeric; v_alvo uuid; v_comp int := 0;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into f from fin_fechamentos where id = p_id and empresa_id = p_empresa for update;
  if f.id is null then raise exception 'Fechamento não encontrado.'; end if;
  if f.status <> 'em_conferencia' then raise exception 'Este fechamento já foi unificado.'; end if;
  if exists (select 1 from fin_fechamento_linhas where fechamento_id = f.id and situacao in ('pendente','divergente')) then
    raise exception 'Ainda há linhas da cobrança para decidir (sem conta ligada ou com valor diferente).';
  end if;
  if not exists (select 1 from fin_fechamento_linhas where fechamento_id = f.id and situacao in ('conferida','ajustada','lancada')) then raise exception 'Nenhuma conta conferida neste fechamento.'; end if;
  v_n := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));
  if v_n = 0 then raise exception 'Informe as parcelas combinadas (vencimento e valor).'; end if;
  if exists (select 1 from jsonb_array_elements(p_parcelas) y where nullif(y->>'vencimento', '') is null or coalesce((y->>'valor')::numeric, 0) <= 0) then raise exception 'Revise as parcelas: vencimento e valor em todas.'; end if;
  select coalesce(sum(round((y->>'valor')::numeric, 2)), 0) into v_soma from jsonb_array_elements(p_parcelas) y;
  select coalesce(sum(a.valor), 0) into v_total from fin_pagar a
   where a.empresa_id = p_empresa and a.status <> 'cancelado' and coalesce(a.pago, 0) = 0 and a.id in (
     select tt.id from fin_fechamento_linhas l cross join lateral fin_fech_titulos_(l.po_id, l.titulo_id) tt where l.fechamento_id = f.id and l.situacao in ('conferida','ajustada','lancada'));
  if abs(v_total - v_soma) > 0.01 then
    raise exception 'A soma das parcelas (R$ %) precisa ser igual ao total conferido (R$ %).', replace(to_char(v_soma, 'FM999999990.00'), '.', ','), replace(to_char(v_total, 'FM999999990.00'), '.', ',');
  end if;
  v_k := 0;
  for x in select value from jsonb_array_elements(p_parcelas) order by (value->>'vencimento')::date loop
    v_k := v_k + 1;
    insert into fin_fechamento_parcelas(empresa_id, fechamento_id, numero, vencimento, valor) values (p_empresa, f.id, v_k, (x->>'vencimento')::date, round((x->>'valor')::numeric, 2));
  end loop;
  for t in select a.* from fin_pagar a where a.empresa_id = p_empresa and a.status <> 'cancelado' and coalesce(a.pago, 0) = 0 and a.id in (
             select tt.id from fin_fechamento_linhas l cross join lateral fin_fech_titulos_(l.po_id, l.titulo_id) tt where l.fechamento_id = f.id and l.situacao in ('conferida','ajustada','lancada'))
           order by a.valor desc loop
    v_comp := v_comp + 1;
    insert into fin_fechamento_itens(empresa_id, fechamento_id, titulo_id, valor_antes, vencimento_antes, parcela_antes)
    values (p_empresa, f.id, t.id, t.valor, t.vencimento, t.parcela);
    v_rest := t.valor; v_first := true;
    for p in select * from fin_fechamento_parcelas where fechamento_id = f.id order by numero loop
      v_part := case when p.numero = v_n then v_rest else round(t.valor * p.valor / v_total, 2) end;
      v_rest := v_rest - v_part;
      if v_part <= 0 then continue; end if;
      if v_first then
        update fin_pagar set valor = v_part, vencimento = p.vencimento, programado_para = null, fechamento_id = f.id, fechamento_parcela_id = p.id,
               aguardando_fechamento = false, forma = coalesce(nullif(p_forma, ''), forma), documento = coalesce(f.nf_numero, documento) where id = t.id;
        v_first := false;
      else
        insert into fin_pagar(empresa_id, origem, origem_id, grupo, fornecedor_id, fornecedor_nome, documento, descricao, emissao, competencia, vencimento,
          valor, parcela, parcelas, forma, conta_id, categoria_id, centro_custo_id, requer_aprovacao, aprovacao, observacoes, criado_por,
          fechamento_id, fechamento_parcela_id, aguardando_fechamento, fechamento_copia)
        values (t.empresa_id, t.origem, t.origem_id, t.grupo, t.fornecedor_id, t.fornecedor_nome, coalesce(f.nf_numero, t.documento), t.descricao, t.emissao, t.competencia, p.vencimento,
          v_part, 1000 * p.numero + coalesce(t.parcela, 1), t.parcelas, coalesce(nullif(p_forma, ''), t.forma), t.conta_id, t.categoria_id, t.centro_custo_id,
          t.requer_aprovacao, t.aprovacao, t.observacoes, auth.uid(), f.id, p.id, false, true);
      end if;
    end loop;
  end loop;
  -- centavos: a soma de cada parcela tem de bater exatamente
  for p in select * from fin_fechamento_parcelas where fechamento_id = f.id order by numero loop
    select p.valor - coalesce(sum(valor), 0) into v_dif from fin_pagar where fechamento_parcela_id = p.id and status <> 'cancelado';
    if abs(v_dif) >= 0.005 then
      select id into v_alvo from fin_pagar where fechamento_parcela_id = p.id and status <> 'cancelado' order by valor desc limit 1;
      update fin_pagar set valor = valor + v_dif where id = v_alvo;
    end if;
  end loop;
  update fin_fechamentos set status = 'unificado', forma_pagamento = nullif(p_forma, ''), unificado_em = now(), unificado_por = auth.uid(),
         valor_cobrado = coalesce(valor_cobrado, v_total), updated_at = now() where id = f.id;
  perform fin_auditar(p_empresa, 'fin_fechamentos', f.id, 'unificado', null, jsonb_build_object('total', v_total, 'parcelas', p_parcelas, 'contas', v_comp), null);
  return jsonb_build_object('total', v_total, 'parcelas', v_n, 'contas', v_comp);
end $function$;

create or replace function public.fin_fechamento_desfazer(p_empresa uuid, p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare f fin_fechamentos%rowtype; i record;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into f from fin_fechamentos where id = p_id and empresa_id = p_empresa for update;
  if f.id is null then raise exception 'Fechamento não encontrado.'; end if;
  if f.status <> 'unificado' then raise exception 'Este fechamento não está unificado.'; end if;
  if exists (select 1 from fin_pagar where fechamento_id = f.id and coalesce(pago, 0) > 0) then raise exception 'Já existe pagamento neste fechamento: estorne no Financeiro antes de desfazer.'; end if;
  delete from fin_pagar where fechamento_id = f.id and fechamento_copia;
  for i in select * from fin_fechamento_itens where fechamento_id = f.id loop
    update fin_pagar set valor = i.valor_antes, vencimento = i.vencimento_antes, parcela = i.parcela_antes, fechamento_id = null,
           fechamento_parcela_id = null, aguardando_fechamento = true where id = i.titulo_id;
  end loop;
  delete from fin_fechamento_itens where fechamento_id = f.id;
  delete from fin_fechamento_parcelas where fechamento_id = f.id;
  update fin_fechamentos set status = 'em_conferencia', unificado_em = null, unificado_por = null, updated_at = now() where id = f.id;
  perform fin_auditar(p_empresa, 'fin_fechamentos', f.id, 'unificacao_desfeita', null, null, null);
end $function$;

-- ------------------------------------------------------------------ conciliação bancária: 'fatura' e 'fechamento' pagam o conjunto inteiro
create or replace function public.fin_assist_aplicar(p_empresa uuid, p_extrato uuid, p_acao jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r jsonb; v_lote uuid; v_fim boolean; v_par uuid; v_acao jsonb := p_acao; f fin_cartao_faturas%rowtype; v_aberto numeric; e fin_extrato%rowtype;
  v_titulos jsonb; v_rot text;
begin
  if p_acao->>'tipo' in ('fatura', 'fechamento') then
    select * into e from fin_extrato where id = p_extrato and empresa_id = p_empresa;
    if e.valor >= 0 then raise exception 'Este pagamento é uma saída no extrato.'; end if;
    if p_acao->>'tipo' = 'fatura' then
      select * into f from fin_cartao_faturas where id = nullif(p_acao->>'fatura_id','')::uuid and empresa_id = p_empresa;
      if f.id is null then raise exception 'Fatura do cartão não encontrada.'; end if;
      select coalesce(sum(aberto), 0), jsonb_agg(jsonb_build_object('tipo', 'pagar', 'id', id, 'valor', aberto)) into v_aberto, v_titulos
        from fin_pagar where fatura_id = f.id and status not in ('pago','cancelado') and aberto > 0.005;
      v_rot := 'Confira a fatura em Bancos e cartões → Cartões.';
    else
      if not exists (select 1 from fin_fechamento_parcelas where id = nullif(p_acao->>'parcela_id','')::uuid and empresa_id = p_empresa) then raise exception 'Parcela do fechamento não encontrada.'; end if;
      select coalesce(sum(aberto), 0), jsonb_agg(jsonb_build_object('tipo', 'pagar', 'id', id, 'valor', aberto)) into v_aberto, v_titulos
        from fin_pagar where fechamento_parcela_id = (p_acao->>'parcela_id')::uuid and status not in ('pago','cancelado') and aberto > 0.005;
      v_rot := 'Confira o fechamento em A pagar → Fechamentos de parceiros.';
    end if;
    if coalesce(v_aberto, 0) <= 0.005 then raise exception 'Não há nada em aberto para pagar.'; end if;
    if abs(v_aberto - abs(e.valor)) > 0.01 then
      raise exception 'O que está em aberto (R$ %) não bate com o débito do extrato (R$ %). %',
        replace(to_char(v_aberto, 'FM999999990.00'), '.', ','), replace(to_char(abs(e.valor), 'FM999999990.00'), '.', ','), v_rot;
    end if;
    v_acao := jsonb_build_object('tipo', 'baixar', 'resumo', coalesce(p_acao->>'resumo', ''), 'titulos', v_titulos);
  end if;
  r := fin_assist_aplicar_base(p_empresa, p_extrato, v_acao);
  select lote_id into v_lote from fin_extrato where id = p_extrato;
  v_fim := fin_lote_conferir(v_lote);
  v_par := nullif(p_acao->>'par_extrato','')::uuid;
  if v_par is not null then perform fin_lote_conferir((select lote_id from fin_extrato where id = v_par)); end if;
  return r || jsonb_build_object('conciliacao_finalizada', v_fim, 'lote_id', v_lote,
    'faltam', (select count(*) from fin_extrato e where e.lote_id = v_lote and fin_extrato_pendente(e)));
end $function$;

grant execute on function public.fin_fechamento_fornecedores(uuid), public.fin_fechamento_criar(uuid, uuid, text), public.fin_fechamento_detalhe(uuid, uuid),
  public.fin_fechamento_importar(uuid, uuid, jsonb, text), public.fin_fechamento_linha_add(uuid, uuid, jsonb), public.fin_fechamento_linha_acao(uuid, uuid, jsonb),
  public.fin_fechamento_salvar(uuid, uuid, jsonb), public.fin_fechamento_excluir(uuid, uuid), public.fin_fechamento_unificar(uuid, uuid, jsonb, text),
  public.fin_fechamento_desfazer(uuid, uuid) to authenticated;
