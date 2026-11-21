-- (2026-11-14) Cartões de crédito no Financeiro (trazido da Tecnoweld, adaptado às tabelas daqui).
-- Cartão tem o dia em que a fatura VIRA (compra a partir desse dia vai para a fatura seguinte) e o dia do vencimento.
-- Toda conta a pagar com cartao_id tem o vencimento calculado pela regra do cartão (data da compra + nº da parcela) e fica
-- ligada à fatura (fin_cartao_faturas, uma por cartão e vencimento). Conciliação da fatura: linhas do arquivo do banco
-- (fin_cartao_fatura_linhas) × parcelas do sistema. Na conciliação BANCÁRIA, o débito da fatura baixa todas as parcelas
-- dela de uma vez (ação 'fatura' em fin_assist_aplicar). Origens das compras no cartão: pedido de compra (Compras, forma
-- "cartao") e lançamento manual no A pagar.

-- ------------------------------------------------------------------ tabelas
create table if not exists public.fin_cartoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  bandeira text,
  final text,
  conta_id uuid references public.fin_contas(id) on delete set null,
  dia_virada int not null check (dia_virada between 1 and 31),
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  limite numeric(15,2),
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fin_cartoes_empresa_idx on public.fin_cartoes(empresa_id);

create table if not exists public.fin_cartao_faturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cartao_id uuid not null references public.fin_cartoes(id) on delete cascade,
  vencimento date not null,
  virada date not null,
  valor_banco numeric(15,2),
  arquivo_nome text,
  conferida_em timestamptz,
  conferida_por uuid,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cartao_id, vencimento)
);
create index if not exists fin_cartao_faturas_empresa_idx on public.fin_cartao_faturas(empresa_id);

create table if not exists public.fin_cartao_fatura_linhas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  fatura_id uuid not null references public.fin_cartao_faturas(id) on delete cascade,
  data date,
  descricao text,
  valor numeric(15,2) not null,            -- positivo = compra na fatura; negativo = crédito (pagamento, estorno)
  ordem int,
  titulo_id uuid references public.fin_pagar(id) on delete set null,
  situacao text not null default 'pendente' check (situacao in ('pendente','conferida','lancada','ignorada','estorno')),
  sugestao jsonb,
  created_at timestamptz not null default now()
);
create index if not exists fin_cartao_fatura_linhas_fatura_idx on public.fin_cartao_fatura_linhas(fatura_id);
create index if not exists fin_cartao_fatura_linhas_titulo_idx on public.fin_cartao_fatura_linhas(titulo_id);

alter table public.fin_pagar
  add column if not exists cartao_id uuid references public.fin_cartoes(id) on delete set null,
  add column if not exists cartao_compra_em date,
  add column if not exists fatura_id uuid references public.fin_cartao_faturas(id) on delete set null;
create index if not exists fin_pagar_cartao_idx on public.fin_pagar(cartao_id);
create index if not exists fin_pagar_fatura_idx on public.fin_pagar(fatura_id);

-- leitura: quem vê o Financeiro (gravação só pelas funções); 2FA como as outras tabelas
do $$ declare t text; begin
  foreach t in array array['fin_cartoes','fin_cartao_faturas','fin_cartao_fatura_linhas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists fin_ler on public.%I', t);
    execute format('create policy fin_ler on public.%I for select to authenticated using (public.eh_membro_empresa(empresa_id) and public.fin_pode(empresa_id, %L))', t, 'financeiro.fluxo.visualizar');
    execute format('drop policy if exists seguranca_2fa on public.%I', t);
    execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()))', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ regra das datas
-- Compra no dia da virada ou depois vai para a fatura seguinte. Vencimento: no mês da virada se o dia do vencimento for
-- depois do dia da virada; senão no mês seguinte. Dias 29-31 caem no último dia dos meses mais curtos.
create or replace function public.fin_cartao_datas(p_virada int, p_venc int, p_compra date, p_parcela int default 1)
 returns table(virada date, vencimento date)
 language plpgsql immutable
 set search_path to 'public'
as $function$
declare v_mes date; v_ult int; v_mv date;
begin
  v_mes := date_trunc('month', p_compra)::date;
  v_ult := extract(day from (v_mes + interval '1 month - 1 day'))::int;
  if extract(day from p_compra)::int >= least(p_virada, v_ult) then v_mes := (v_mes + interval '1 month')::date; end if;
  v_mes := (v_mes + make_interval(months => greatest(coalesce(p_parcela, 1), 1) - 1))::date;
  virada := v_mes + least(p_virada, extract(day from (v_mes + interval '1 month - 1 day'))::int) - 1;
  v_mv := case when p_venc > p_virada then v_mes else (v_mes + interval '1 month')::date end;
  vencimento := v_mv + least(p_venc, extract(day from (v_mv + interval '1 month - 1 day'))::int) - 1;
  return next;
end $function$;

create or replace function public.fin_cartao_virada_de(p_virada int, p_venc_dia int, p_venc date)
 returns date language sql immutable set search_path to 'public'
as $function$
  select (m + least(p_virada, extract(day from (m + interval '1 month - 1 day'))::int) - 1)::date
    from (select case when p_venc_dia > p_virada then date_trunc('month', p_venc)::date else (date_trunc('month', p_venc) - interval '1 month')::date end as m) x;
$function$;

create or replace function public.fin_cartao_fatura_garantir(p_empresa uuid, p_cartao uuid, p_venc date)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c public.fin_cartoes%rowtype; v_id uuid;
begin
  if p_cartao is null or p_venc is null then return null; end if;
  select id into v_id from public.fin_cartao_faturas where cartao_id = p_cartao and vencimento = p_venc;
  if v_id is not null then return v_id; end if;
  select * into c from public.fin_cartoes where id = p_cartao and empresa_id = p_empresa;
  if c.id is null then raise exception 'Cartão não encontrado.'; end if;
  insert into public.fin_cartao_faturas(empresa_id, cartao_id, vencimento, virada)
  values (p_empresa, p_cartao, p_venc, public.fin_cartao_virada_de(c.dia_virada, c.dia_vencimento, p_venc))
  on conflict (cartao_id, vencimento) do nothing;
  select id into v_id from public.fin_cartao_faturas where cartao_id = p_cartao and vencimento = p_venc;
  return v_id;
end $function$;
revoke all on function public.fin_cartao_fatura_garantir(uuid, uuid, date) from public, anon, authenticated;

-- ------------------------------------------------------------------ trigger: parcela no cartão segue a fatura
create or replace function public.fin_pagar_cartao_trg()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c public.fin_cartoes%rowtype; v_venc date;
begin
  -- pedido de compra pago no cartão: a parcela herda o cartão e a data da compra do pedido
  if tg_op = 'INSERT' and new.cartao_id is null and new.origem = 'compra' and new.origem_id is not null and new.forma = 'cartao' then
    select nullif(r.dados->>'cartao_id','')::uuid, coalesce(nullif(r.dados->>'cartao_compra_em','')::date, current_date)
      into new.cartao_id, new.cartao_compra_em
      from public.compras_registros r where r.id = new.origem_id and r.empresa_id = new.empresa_id;
  end if;
  if new.cartao_id is null then new.fatura_id := null; return new; end if;
  select * into c from public.fin_cartoes where id = new.cartao_id and empresa_id = new.empresa_id;
  if c.id is null then raise exception 'Cartão não encontrado.'; end if;
  if coalesce(new.pago, 0) = 0 and (tg_op = 'INSERT' or new.cartao_id is distinct from old.cartao_id
      or new.cartao_compra_em is distinct from old.cartao_compra_em or new.parcela is distinct from old.parcela) then
    new.cartao_compra_em := coalesce(new.cartao_compra_em, new.emissao, current_date);
    select d.vencimento into v_venc from public.fin_cartao_datas(c.dia_virada, c.dia_vencimento, new.cartao_compra_em, coalesce(new.parcela, 1)) d;
    new.vencimento := v_venc;
    new.programado_para := null;
  end if;
  if new.conta_id is null then new.conta_id := c.conta_id; end if;
  new.fatura_id := public.fin_cartao_fatura_garantir(new.empresa_id, new.cartao_id, new.vencimento);
  return new;
end $function$;
drop trigger if exists trg_fin_pagar_cartao on public.fin_pagar;
create trigger trg_fin_pagar_cartao before insert or update of cartao_id, cartao_compra_em, parcela, vencimento
  on public.fin_pagar for each row execute function public.fin_pagar_cartao_trg();

-- ------------------------------------------------------------------ criar título: aceita cartão
create or replace function public.fin_criar_titulo(p_empresa uuid, p_tipo text, p_cab jsonb, p_parcelas jsonb)
 returns setof uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_item jsonb; v_id uuid; v_grupo uuid := gen_random_uuid(); v_n int; v_i int := 0; v_total numeric; v_cartao uuid := nullif(p_cab->>'cartao_id','')::uuid;
begin
  if p_tipo not in ('receber','pagar') then raise exception 'Tipo inválido'; end if;
  if not fin_pode(p_empresa, case when p_tipo = 'receber' then 'financeiro.contas_receber.editar' else 'financeiro.contas_pagar.editar' end) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) = 0 then raise exception 'Informe as parcelas'; end if;
  if trim(coalesce(p_cab->>'descricao','')) = '' then raise exception 'Informe a descrição'; end if;
  if v_cartao is not null and (p_tipo <> 'pagar' or not exists (select 1 from fin_cartoes where id = v_cartao and empresa_id = p_empresa and ativo)) then raise exception 'Cartão inválido.'; end if;
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
      insert into fin_pagar(empresa_id, origem, grupo, fornecedor_id, fornecedor_nome, documento, descricao, emissao, competencia, vencimento, valor, parcela, parcelas, forma, codigo_barras, conta_id, categoria_id, centro_custo_id, requer_aprovacao, aprovacao, observacoes, criado_por, cartao_id, cartao_compra_em)
      values (p_empresa, coalesce(nullif(p_cab->>'origem',''),'manual'), v_grupo, nullif(p_cab->>'fornecedor_id','')::uuid, nullif(p_cab->>'fornecedor_nome',''), nullif(p_cab->>'documento',''), p_cab->>'descricao',
        coalesce(nullif(p_cab->>'emissao','')::date, current_date), nullif(p_cab->>'competencia','')::date, (v_item->>'vencimento')::date, (v_item->>'valor')::numeric, v_i, v_n,
        nullif(p_cab->>'forma',''), nullif(p_cab->>'codigo_barras',''),
        coalesce(nullif(p_cab->>'conta_id','')::uuid, (select conta_id from fin_cartoes where id = v_cartao)),
        coalesce(nullif(p_cab->>'categoria_id','')::uuid, fin_categoria(p_empresa, 'outras_despesas')), nullif(p_cab->>'centro_custo_id','')::uuid,
        coalesce((p_cab->>'requer_aprovacao')::boolean, false), case when coalesce((p_cab->>'requer_aprovacao')::boolean, false) then 'pendente' else 'nao_requerida' end, nullif(p_cab->>'observacoes',''), auth.uid(),
        v_cartao, case when v_cartao is not null then coalesce(nullif(p_cab->>'cartao_compra_em','')::date, current_date) end)
      returning id into v_id;
    end if;
    return next v_id;
  end loop;
  perform fin_auditar(p_empresa, case when p_tipo = 'receber' then 'fin_receber' else 'fin_pagar' end, v_grupo, 'criacao', null, p_cab || jsonb_build_object('parcelas', v_n, 'total', v_total), null);
end $function$;

-- ------------------------------------------------------------------ cadastro de cartões
create or replace function public.fin_cartao_salvar(p_empresa uuid, p_dados jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid := nullif(p_dados->>'id','')::uuid; v_antes public.fin_cartoes%rowtype; v_conta uuid := nullif(p_dados->>'conta_id','')::uuid;
  v_vir int := nullif(p_dados->>'dia_virada','')::int; v_ven int := nullif(p_dados->>'dia_vencimento','')::int;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if trim(coalesce(p_dados->>'nome','')) = '' then raise exception 'Informe o nome do cartão.'; end if;
  if v_vir is null or v_vir not between 1 and 31 then raise exception 'Informe o dia em que a fatura vira (1 a 31).'; end if;
  if v_ven is null or v_ven not between 1 and 31 then raise exception 'Informe o dia do vencimento (1 a 31).'; end if;
  if v_conta is not null and not exists (select 1 from fin_contas where id = v_conta and empresa_id = p_empresa) then raise exception 'Conta inválida.'; end if;
  if nullif(regexp_replace(coalesce(p_dados->>'final',''), '\D', '', 'g'), '') is not null and length(regexp_replace(p_dados->>'final', '\D', '', 'g')) <> 4 then
    raise exception 'O final do cartão tem 4 números.';
  end if;
  if v_id is null then
    insert into fin_cartoes(empresa_id, nome, bandeira, final, conta_id, dia_virada, dia_vencimento, limite, ativo, observacoes)
    values (p_empresa, trim(p_dados->>'nome'), nullif(trim(coalesce(p_dados->>'bandeira','')),''), nullif(regexp_replace(coalesce(p_dados->>'final',''), '\D', '', 'g'),''),
            v_conta, v_vir, v_ven, nullif(p_dados->>'limite','')::numeric, coalesce((p_dados->>'ativo')::boolean, true), nullif(trim(coalesce(p_dados->>'observacoes','')),''))
    returning id into v_id;
  else
    select * into v_antes from fin_cartoes where id = v_id and empresa_id = p_empresa for update;
    if v_antes.id is null then raise exception 'Cartão não encontrado.'; end if;
    update fin_cartoes set nome = trim(p_dados->>'nome'), bandeira = nullif(trim(coalesce(p_dados->>'bandeira','')),''),
           final = nullif(regexp_replace(coalesce(p_dados->>'final',''), '\D', '', 'g'),''), conta_id = v_conta, dia_virada = v_vir, dia_vencimento = v_ven,
           limite = nullif(p_dados->>'limite','')::numeric, ativo = coalesce((p_dados->>'ativo')::boolean, true),
           observacoes = nullif(trim(coalesce(p_dados->>'observacoes','')),''), updated_at = now()
     where id = v_id;
    -- mudou a virada ou o vencimento: as parcelas ainda não pagas são recalculadas (as já pagas ficam)
    if v_antes.dia_virada <> v_vir or v_antes.dia_vencimento <> v_ven then
      update fin_pagar p set vencimento = (select d.vencimento from fin_cartao_datas(v_vir, v_ven, p.cartao_compra_em, p.parcela) d)
       where p.cartao_id = v_id and p.empresa_id = p_empresa and coalesce(p.pago,0) = 0 and p.status not in ('pago','cancelado');
      update fin_cartao_faturas f set virada = fin_cartao_virada_de(v_vir, v_ven, f.vencimento) where f.cartao_id = v_id;
    end if;
  end if;
  perform fin_auditar(p_empresa, 'fin_cartoes', v_id, case when v_antes.id is null then 'criacao' else 'edicao' end, to_jsonb(v_antes), p_dados, null);
  return v_id;
end $function$;

-- lista curta de cartões (Compras usa sem ter acesso ao Financeiro)
create or replace function public.fin_cartoes_lista(p_empresa uuid)
 returns jsonb
 language plpgsql stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.eh_membro_empresa(p_empresa) or not (public.fin_pode(p_empresa, 'financeiro.fluxo.visualizar')
       or public.funcionario_tabela_permitida(p_empresa, 'almoxarifado_compras', 'select')) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'bandeira', bandeira, 'final', final, 'dia_virada', dia_virada, 'dia_vencimento', dia_vencimento) order by nome)
    from fin_cartoes where empresa_id = p_empresa and ativo), '[]'::jsonb);
end $function$;

-- ------------------------------------------------------------------ faturas
create or replace function public.fin_cartao_faturas(p_empresa uuid, p_cartao uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c fin_cartoes%rowtype; v_atual date;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into c from fin_cartoes where id = p_cartao and empresa_id = p_empresa;
  if c.id is null then raise exception 'Cartão não encontrado.'; end if;
  -- a fatura de hoje (a que recebe as compras feitas hoje) sempre aparece
  select d.vencimento into v_atual from fin_cartao_datas(c.dia_virada, c.dia_vencimento, current_date, 1) d;
  perform fin_cartao_fatura_garantir(p_empresa, c.id, v_atual);
  return coalesce((select jsonb_agg(x order by x->>'vencimento' desc) from (
    select jsonb_build_object('id', f.id, 'vencimento', f.vencimento, 'virada', f.virada, 'valor_banco', f.valor_banco, 'arquivo_nome', f.arquivo_nome,
      'conferida_em', f.conferida_em, 'atual', f.vencimento = v_atual,
      'total', coalesce(t.total, 0), 'aberto', coalesce(t.aberto, 0), 'pago', coalesce(t.pago, 0), 'qtd', coalesce(t.qtd, 0),
      'linhas', (select count(*) from fin_cartao_fatura_linhas l where l.fatura_id = f.id),
      'linhas_pendentes', (select count(*) from fin_cartao_fatura_linhas l where l.fatura_id = f.id and l.situacao = 'pendente'),
      'situacao', case when coalesce(t.qtd, 0) > 0 and coalesce(t.aberto, 0) <= 0.005 then 'paga'
                       when f.conferida_em is not null then 'conferida'
                       when f.virada <= current_date then 'fechada' else 'aberta' end) x
      from fin_cartao_faturas f
      left join lateral (select sum(p.valor) total, sum(p.aberto) aberto, sum(p.pago) pago, count(*) qtd
                           from fin_pagar p where p.fatura_id = f.id and p.status <> 'cancelado') t on true
     where f.cartao_id = c.id and f.empresa_id = p_empresa
       and (coalesce(t.qtd, 0) > 0 or f.vencimento >= v_atual or exists (select 1 from fin_cartao_fatura_linhas l where l.fatura_id = f.id))) z), '[]'::jsonb);
end $function$;

create or replace function public.fin_cartao_fatura_detalhe(p_empresa uuid, p_fatura uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare f fin_cartao_faturas%rowtype;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into f from fin_cartao_faturas where id = p_fatura and empresa_id = p_empresa;
  if f.id is null then raise exception 'Fatura não encontrada.'; end if;
  return jsonb_build_object('fatura', to_jsonb(f),
    'parcelas', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'fornecedor', p.fornecedor_nome, 'descricao', p.descricao, 'compra', p.cartao_compra_em,
        'parcela', p.parcela, 'parcelas', p.parcelas, 'valor', p.valor, 'aberto', p.aberto, 'pago', p.pago, 'status', p.status,
        'pedido_compra_numero', (select r.numero from compras_registros r where p.origem = 'compra' and r.id = p.origem_id),
        'categoria_id', p.categoria_id, 'centro_custo_id', p.centro_custo_id, 'linha_id', (select l.id from fin_cartao_fatura_linhas l where l.titulo_id = p.id and l.fatura_id = f.id limit 1))
        order by p.cartao_compra_em, p.fornecedor_nome) from fin_pagar p where p.fatura_id = f.id and p.status <> 'cancelado'), '[]'::jsonb),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'data', l.data, 'descricao', l.descricao, 'valor', l.valor, 'situacao', l.situacao, 'titulo_id', l.titulo_id,
        'titulo_fatura_id', p.fatura_id, 'titulo_vencimento', p.vencimento, 'titulo_nome', coalesce(p.fornecedor_nome, p.descricao), 'sugestao', l.sugestao)
        order by l.data, l.ordem) from fin_cartao_fatura_linhas l left join fin_pagar p on p.id = l.titulo_id where l.fatura_id = f.id), '[]'::jsonb),
    'outras', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'vencimento', o.vencimento) order by o.vencimento)
        from fin_cartao_faturas o where o.cartao_id = f.cartao_id and o.id <> f.id and o.vencimento between f.vencimento - 70 and f.vencimento + 70), '[]'::jsonb));
end $function$;

-- liga as linhas pendentes da fatura do banco às parcelas do sistema (valor igual; procura também nas faturas vizinhas)
create or replace function public.fin_cartao_fatura_conciliar(p_empresa uuid, p_fatura uuid)
 returns int
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare f fin_cartao_faturas%rowtype; l record; v_t uuid; v_n int := 0;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into f from fin_cartao_faturas where id = p_fatura and empresa_id = p_empresa;
  if f.id is null then raise exception 'Fatura não encontrada.'; end if;
  for l in select * from fin_cartao_fatura_linhas where fatura_id = f.id and situacao = 'pendente' and valor > 0 and titulo_id is null order by ordem loop
    select p.id into v_t from fin_pagar p
     where p.cartao_id = f.cartao_id and p.empresa_id = p_empresa and p.status <> 'cancelado'
       and abs(p.valor - l.valor) <= 0.01
       and p.vencimento between f.vencimento - 70 and f.vencimento + 70
       and not exists (select 1 from fin_cartao_fatura_linhas x where x.titulo_id = p.id and x.fatura_id = f.id)
     order by (p.fatura_id = f.id) desc, abs(coalesce(p.cartao_compra_em, p.emissao) - coalesce(l.data, f.virada)), p.parcela
     limit 1;
    if v_t is not null then
      update fin_cartao_fatura_linhas set titulo_id = v_t, situacao = 'conferida' where id = l.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $function$;

-- o valor da fatura do banco vem do arquivo (compras menos estornos; o crédito do pagamento da fatura anterior não entra)
create or replace function public.fin_cartao_total_arquivo(p_fatura uuid) returns numeric language sql stable set search_path to 'public' as $$
  select sum(valor) from fin_cartao_fatura_linhas
   where fatura_id = p_fatura and not (valor < 0 and descricao ~* '(pagamento|pagto|pgto)' and descricao !~* 'estorno')
$$;
revoke all on function public.fin_cartao_total_arquivo(uuid) from public, anon, authenticated;

create or replace function public.fin_cartao_fatura_importar(p_empresa uuid, p_fatura uuid, p_linhas jsonb, p_arquivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare f fin_cartao_faturas%rowtype; x jsonb; v_i int := 0; v_novas int := 0; v_lig int;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into f from fin_cartao_faturas where id = p_fatura and empresa_id = p_empresa for update;
  if f.id is null then raise exception 'Fatura não encontrada.'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'O arquivo não tem lançamentos.'; end if;
  -- importar de novo: refaz o que ainda não virou lançamento/estorno
  delete from fin_cartao_fatura_linhas where fatura_id = f.id and situacao in ('pendente','conferida','ignorada');
  for x in select * from jsonb_array_elements(p_linhas) loop
    v_i := v_i + 1;
    if coalesce((x->>'valor')::numeric, 0) = 0 then continue; end if;
    if exists (select 1 from fin_cartao_fatura_linhas k where k.fatura_id = f.id and k.situacao in ('lancada','estorno')
                 and k.data is not distinct from nullif(x->>'data','')::date and k.valor = round((x->>'valor')::numeric, 2) and coalesce(k.descricao,'') = coalesce(x->>'descricao','')) then continue; end if;
    insert into fin_cartao_fatura_linhas(empresa_id, fatura_id, data, descricao, valor, ordem)
    values (p_empresa, f.id, nullif(x->>'data','')::date, left(nullif(trim(coalesce(x->>'descricao','')),''), 300), round((x->>'valor')::numeric, 2), v_i);
    v_novas := v_novas + 1;
  end loop;
  update fin_cartao_faturas set arquivo_nome = left(p_arquivo, 200), updated_at = now(), valor_banco = fin_cartao_total_arquivo(f.id) where id = f.id;
  v_lig := fin_cartao_fatura_conciliar(p_empresa, f.id);
  return jsonb_build_object('linhas', v_novas, 'ligadas', v_lig);
end $function$;

create or replace function public.fin_cartao_sugestoes_salvar(p_empresa uuid, p_fatura uuid, p_sugestoes jsonb)
 returns int language plpgsql security definer set search_path to 'public'
as $function$
declare x jsonb; v_n int := 0;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if not exists (select 1 from fin_cartao_faturas where id = p_fatura and empresa_id = p_empresa) then raise exception 'Fatura não encontrada.'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_sugestoes, '[]'::jsonb)) loop
    update fin_cartao_fatura_linhas set sugestao = x - 'linha_id'
     where id = nullif(x->>'linha_id', '')::uuid and fatura_id = p_fatura and empresa_id = p_empresa;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

-- ação numa linha da fatura do banco
create or replace function public.fin_cartao_linha_acao(p_empresa uuid, p_linha uuid, p_acao jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare l fin_cartao_fatura_linhas%rowtype; f fin_cartao_faturas%rowtype; c fin_cartoes%rowtype; v_tipo text := p_acao->>'tipo';
  v_t uuid; t fin_pagar%rowtype; v_cat uuid; v_id uuid;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into l from fin_cartao_fatura_linhas where id = p_linha and empresa_id = p_empresa for update;
  if l.id is null then raise exception 'Linha não encontrada.'; end if;
  select * into f from fin_cartao_faturas where id = l.fatura_id;
  select * into c from fin_cartoes where id = f.cartao_id;
  if v_tipo = 'ignorar' then
    update fin_cartao_fatura_linhas set situacao = 'ignorada', titulo_id = null where id = l.id;
  elsif v_tipo = 'reabrir' then
    if l.situacao in ('lancada','estorno') then raise exception 'Esta linha já virou lançamento; desfaça no Contas a pagar.'; end if;
    update fin_cartao_fatura_linhas set situacao = 'pendente', titulo_id = null where id = l.id;
  elsif v_tipo = 'vincular' then
    v_t := nullif(p_acao->>'titulo_id','')::uuid;
    select * into t from fin_pagar where id = v_t and empresa_id = p_empresa and cartao_id = f.cartao_id and status <> 'cancelado';
    if t.id is null then raise exception 'Escolha uma compra deste cartão.'; end if;
    update fin_cartao_fatura_linhas set titulo_id = t.id, situacao = 'conferida' where id = l.id;
  elsif v_tipo = 'trazer' then
    -- a compra está noutra fatura no sistema: passa para esta (vencimento desta fatura)
    select * into t from fin_pagar where id = l.titulo_id and empresa_id = p_empresa for update;
    if t.id is null then raise exception 'A linha não está ligada a nenhuma compra.'; end if;
    if coalesce(t.pago,0) > 0 then raise exception 'Essa parcela já foi paga na outra fatura.'; end if;
    update fin_pagar set vencimento = f.vencimento where id = t.id;
  elsif v_tipo = 'lancar' then
    if l.valor <= 0 then raise exception 'Crédito na fatura não vira conta a pagar: use Estorno ou Ignorar.'; end if;
    v_cat := nullif(p_acao->>'categoria_id','')::uuid;
    if v_cat is null or not exists (select 1 from fin_categorias where id = v_cat and empresa_id = p_empresa and tipo = 'saida') then raise exception 'Escolha a categoria (é ela que entra na DRE).'; end if;
    insert into fin_pagar(empresa_id, origem, grupo, fornecedor_id, fornecedor_nome, descricao, emissao, competencia, vencimento, valor, parcela, parcelas, forma, conta_id, categoria_id, centro_custo_id,
                          requer_aprovacao, aprovacao, observacoes, criado_por, cartao_id, cartao_compra_em)
    values (p_empresa, 'cartao_fatura', gen_random_uuid(), nullif(p_acao->>'fornecedor_id','')::uuid, coalesce(nullif(trim(coalesce(p_acao->>'fornecedor_nome','')),''), l.descricao),
            coalesce(nullif(trim(coalesce(p_acao->>'descricao','')),''), l.descricao, 'Lançamento da fatura'), coalesce(l.data, f.virada), coalesce(l.data, f.virada), f.vencimento, l.valor, 1, 1,
            'cartao', c.conta_id, v_cat, nullif(p_acao->>'centro_custo_id','')::uuid, false, 'nao_requerida', 'Lançado na conciliação da fatura do cartão', auth.uid(), c.id, coalesce(l.data, f.virada))
    returning id into v_id;
    -- a linha está nesta fatura: o vencimento é o desta fatura (mesmo que a data da compra caísse noutra)
    update fin_pagar set vencimento = f.vencimento where id = v_id;
    update fin_cartao_fatura_linhas set titulo_id = v_id, situacao = 'lancada' where id = l.id;
  elsif v_tipo = 'estorno' then
    -- crédito na fatura abate uma compra desta fatura (o gasto da DRE diminui)
    if l.valor >= 0 then raise exception 'Estorno é para crédito na fatura.'; end if;
    select * into t from fin_pagar where id = nullif(p_acao->>'titulo_id','')::uuid and empresa_id = p_empresa and fatura_id = f.id and status not in ('cancelado','pago') for update;
    if t.id is null then raise exception 'Escolha a compra desta fatura que recebeu o estorno.'; end if;
    if abs(l.valor) > t.aberto + 0.005 then raise exception 'O estorno (%) é maior que o valor em aberto da compra (%).', abs(l.valor), t.aberto; end if;
    update fin_pagar set valor = valor - abs(l.valor),
           observacoes = concat_ws(' · ', observacoes, 'Estorno de ' || replace(to_char(abs(l.valor), 'FM999999990.00'), '.', ',') || ' na fatura do cartão ' || to_char(f.vencimento, 'DD/MM/YYYY') || ': ' || coalesce(l.descricao, ''))
     where id = t.id;
    update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), cancelamento_motivo = 'Estornado na fatura do cartão'
     where id = t.id and valor <= 0.005 and coalesce(pago, 0) = 0;
    update fin_cartao_fatura_linhas set titulo_id = t.id, situacao = 'estorno' where id = l.id;
  else
    raise exception 'Ação inválida.';
  end if;
  perform fin_auditar(p_empresa, 'fin_cartao_fatura_linhas', l.id, 'acao_' || coalesce(v_tipo,''), to_jsonb(l), p_acao, null);
  return jsonb_build_object('ok', true);
end $function$;

-- passa uma parcela para outra fatura do mesmo cartão
create or replace function public.fin_cartao_parcela_mover(p_empresa uuid, p_titulo uuid, p_fatura uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare t fin_pagar%rowtype; f fin_cartao_faturas%rowtype;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into t from fin_pagar where id = p_titulo and empresa_id = p_empresa for update;
  if t.id is null or t.cartao_id is null then raise exception 'Parcela de cartão não encontrada.'; end if;
  if coalesce(t.pago,0) > 0 then raise exception 'Parcela já paga não muda de fatura.'; end if;
  select * into f from fin_cartao_faturas where id = p_fatura and empresa_id = p_empresa and cartao_id = t.cartao_id;
  if f.id is null then raise exception 'Fatura inválida.'; end if;
  update fin_pagar set vencimento = f.vencimento where id = t.id;
  perform fin_auditar(p_empresa, 'fin_pagar', t.id, 'cartao_mover_fatura', jsonb_build_object('vencimento', t.vencimento), jsonb_build_object('vencimento', f.vencimento), null);
end $function$;

create or replace function public.fin_cartao_fatura_salvar(p_empresa uuid, p_fatura uuid, p_dados jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare f fin_cartao_faturas%rowtype;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into f from fin_cartao_faturas where id = p_fatura and empresa_id = p_empresa for update;
  if f.id is null then raise exception 'Fatura não encontrada.'; end if;
  update fin_cartao_faturas set
    conferida_em = case when p_dados ? 'conferida' then case when (p_dados->>'conferida')::boolean then now() end else conferida_em end,
    conferida_por = case when p_dados ? 'conferida' then case when (p_dados->>'conferida')::boolean then auth.uid() end else conferida_por end,
    observacoes = case when p_dados ? 'observacoes' then nullif(trim(p_dados->>'observacoes'),'') else observacoes end,
    updated_at = now()
   where id = f.id;
end $function$;

-- tirar uma compra do cartão (lançada no cartão por engano): as parcelas ainda não pagas da mesma compra viram contas normais
create or replace function public.fin_cartao_retirar(p_empresa uuid, p_titulo uuid, p_forma text, p_vencimento date)
 returns int language plpgsql security definer set search_path to 'public'
as $function$
declare t fin_pagar%rowtype; r record; v_k int := 0;
begin
  if not fin_pode(p_empresa, 'financeiro.contas_pagar.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into t from fin_pagar where id = p_titulo and empresa_id = p_empresa for update;
  if t.id is null or t.cartao_id is null then raise exception 'Esta conta não está no cartão.'; end if;
  if coalesce(trim(p_forma), '') = '' or p_forma ilike 'cart%' then raise exception 'Escolha a forma de pagamento (não pode ser cartão de crédito).'; end if;
  if p_vencimento is null then raise exception 'Informe o vencimento.'; end if;
  if coalesce(t.pago, 0) > 0 then raise exception 'Esta parcela já foi paga na fatura: não dá para tirar do cartão.'; end if;
  for r in select a.id from fin_pagar a
            where a.empresa_id = p_empresa and a.cartao_id = t.cartao_id and a.status <> 'cancelado' and coalesce(a.pago, 0) = 0
              and (a.id = t.id or (t.grupo is not null and a.grupo = t.grupo) or (t.origem = 'compra' and a.origem = t.origem and a.origem_id = t.origem_id))
            order by a.parcela, a.vencimento loop
    update fin_pagar set cartao_id = null, cartao_compra_em = null, fatura_id = null, forma = p_forma,
           vencimento = (p_vencimento + make_interval(months => v_k))::date, programado_para = null,
           observacoes = concat_ws(' · ', observacoes, 'Tirada do cartão (' || p_forma || ')')
     where id = r.id;
    delete from fin_cartao_fatura_linhas where titulo_id = r.id and situacao = 'conferida';
    v_k := v_k + 1;
  end loop;
  if t.origem = 'compra' and t.origem_id is not null then
    update compras_registros set dados = (dados - 'cartao_id' - 'cartao_compra_em' - 'cartao_nome') || jsonb_build_object('forma_pagamento', p_forma), updated_at = now()
     where id = t.origem_id and empresa_id = p_empresa;
  end if;
  perform fin_auditar(p_empresa, 'fin_pagar', t.id, 'tirada_do_cartao', jsonb_build_object('cartao_id', t.cartao_id), jsonb_build_object('forma', p_forma, 'vencimento', p_vencimento, 'parcelas', v_k), null);
  return v_k;
end $function$;

-- ------------------------------------------------------------------ conciliação bancária: o débito da fatura paga as parcelas dela
create or replace function public.fin_assist_aplicar(p_empresa uuid, p_extrato uuid, p_acao jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r jsonb; v_lote uuid; v_fim boolean; v_par uuid; v_acao jsonb := p_acao; f fin_cartao_faturas%rowtype; v_aberto numeric; e fin_extrato%rowtype;
begin
  if p_acao->>'tipo' = 'fatura' then
    select * into f from fin_cartao_faturas where id = nullif(p_acao->>'fatura_id','')::uuid and empresa_id = p_empresa;
    if f.id is null then raise exception 'Fatura do cartão não encontrada.'; end if;
    select * into e from fin_extrato where id = p_extrato and empresa_id = p_empresa;
    if e.valor >= 0 then raise exception 'Pagamento de fatura é uma saída no extrato.'; end if;
    select coalesce(sum(aberto), 0) into v_aberto from fin_pagar where fatura_id = f.id and status not in ('pago','cancelado') and aberto > 0.005;
    if v_aberto <= 0.005 then raise exception 'Esta fatura não tem nada em aberto.'; end if;
    if abs(v_aberto - abs(e.valor)) > 0.01 then
      raise exception 'O que está em aberto na fatura (R$ %) não bate com o débito do extrato (R$ %). Confira a fatura em Bancos → Cartões.',
        replace(to_char(v_aberto, 'FM999999990.00'), '.', ','), replace(to_char(abs(e.valor), 'FM999999990.00'), '.', ',');
    end if;
    v_acao := jsonb_build_object('tipo', 'baixar', 'fatura_id', f.id, 'resumo', coalesce(p_acao->>'resumo', ''),
      'titulos', (select jsonb_agg(jsonb_build_object('tipo', 'pagar', 'id', id, 'valor', aberto)) from fin_pagar where fatura_id = f.id and status not in ('pago','cancelado') and aberto > 0.005));
  end if;
  r := fin_assist_aplicar_base(p_empresa, p_extrato, v_acao);
  select lote_id into v_lote from fin_extrato where id = p_extrato;
  v_fim := fin_lote_conferir(v_lote);
  -- transferência que reconheceu a linha da outra conta também pode fechar a conciliação de lá
  v_par := nullif(p_acao->>'par_extrato','')::uuid;
  if v_par is not null then perform fin_lote_conferir((select lote_id from fin_extrato where id = v_par)); end if;
  return r || jsonb_build_object('conciliacao_finalizada', v_fim, 'lote_id', v_lote,
    'faltam', (select count(*) from fin_extrato e where e.lote_id = v_lote and fin_extrato_pendente(e)));
end $function$;

-- ------------------------------------------------------------------ Compras: cartão do pedido
-- compras_pagamento_aplicar ganha o cartão (opcional): grava em dados antes de criar as parcelas, e o gatilho de fin_pagar
-- liga cada parcela ao cartão e à fatura certa (pela data da compra).
drop function if exists public.compras_pagamento_aplicar(uuid, uuid, text, jsonb, numeric, text);
create or replace function public.compras_pagamento_aplicar(p_empresa uuid, p_pedido uuid, p_forma text, p_parcelas jsonb, p_total numeric, p_origem text,
                                                           p_cartao uuid default null, p_cartao_compra date default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare p compras_registros; soma numeric; n int; k int := 0; it jsonb; doc text; nome text; desc_ text; v_grupo uuid := gen_random_uuid(); notas text; v_cartao_nome text;
begin
  select * into p from compras_registros where id = p_pedido and empresa_id = p_empresa and tipo = 'pedido' for update;
  if not found then raise exception 'Pedido de compra não encontrado.'; end if;
  if p.status = 'cancelado' then raise exception 'Pedido cancelado.'; end if;
  if p_forma not in ('boleto', 'pix', 'transferencia', 'cartao', 'dinheiro') then raise exception 'Escolha a forma de pagamento.'; end if;
  if jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) = 0 then raise exception 'Informe as parcelas.'; end if;
  select count(*), coalesce(sum((x->>'valor')::numeric), 0) into n, soma from jsonb_array_elements(p_parcelas) x;
  if exists (select 1 from jsonb_array_elements(p_parcelas) x where nullif(x->>'vencimento', '') is null or coalesce((x->>'valor')::numeric, 0) <= 0) then
    raise exception 'Cada parcela precisa de vencimento e valor.';
  end if;
  if coalesce(p_total, 0) <= 0 then raise exception 'Total inválido.'; end if;
  if abs(soma - p_total) > 0.05 then raise exception 'A soma das parcelas (%) é diferente do total (%).', round(soma, 2), round(p_total, 2); end if;
  -- cartão: com cartões cadastrados, escolher qual é obrigatório (é ele que decide em qual fatura cada parcela cai)
  if p_forma = 'cartao' then
    if p_cartao is not null then
      select fc.nome || coalesce(' final ' || fc.final, '') into v_cartao_nome from fin_cartoes fc where fc.id = p_cartao and fc.empresa_id = p_empresa and fc.ativo;
      if v_cartao_nome is null then raise exception 'Cartão inválido.'; end if;
    elsif p.dados ? 'cartao_id' and exists (select 1 from fin_cartoes where id = nullif(p.dados->>'cartao_id','')::uuid and empresa_id = p_empresa and ativo) then
      p_cartao := (p.dados->>'cartao_id')::uuid;
      p_cartao_compra := coalesce(p_cartao_compra, nullif(p.dados->>'cartao_compra_em','')::date);
      select fc.nome || coalesce(' final ' || fc.final, '') into v_cartao_nome from fin_cartoes fc where fc.id = p_cartao;
    elsif exists (select 1 from fin_cartoes where empresa_id = p_empresa and ativo) then
      raise exception 'Escolha o cartão de crédito usado na compra.';
    end if;
  else
    p_cartao := null;
  end if;
  if exists (select 1 from fin_pagar where empresa_id = p_empresa and origem = 'compra' and origem_id = p.id and status <> 'cancelado' and pago > 0) then
    raise exception 'Este pedido já tem pagamento registrado no Financeiro — ajuste por lá.';
  end if;
  update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
         cancelamento_motivo = 'Pagamento do pedido refeito (' || p_origem || ')'
   where empresa_id = p_empresa and origem = 'compra' and origem_id = p.id and status <> 'cancelado';
  -- cartão antes das parcelas: o gatilho de fin_pagar lê daqui
  update compras_registros set dados = case when p_cartao is null then dados - 'cartao_id' - 'cartao_compra_em' - 'cartao_nome'
                                            else dados || jsonb_build_object('cartao_id', p_cartao, 'cartao_nome', v_cartao_nome,
                                                   'cartao_compra_em', coalesce(p_cartao_compra, nullif(dados->>'cartao_compra_em','')::date, current_date)) end
   where id = p.id;
  perform public.fin_semear(p_empresa);
  nome := coalesce(p.dados->>'fornecedor_nome', p.dados->'fornecedor'->>'nome', 'Fornecedor');
  select string_agg(distinct r.numero_nf, ', ') into notas from almox_recebimentos r where r.pedido_id = p.id and r.status = 'concluido';
  doc := 'PC-' || lpad(p.numero::text, 6, '0') || coalesce(' · NF ' || notas, '');
  desc_ := 'Compra ' || 'PC-' || lpad(p.numero::text, 6, '0') || ' · ' || nome;
  for it in select x from jsonb_array_elements(p_parcelas) x order by (x->>'vencimento')::date loop
    k := k + 1;
    insert into fin_pagar (empresa_id, origem, origem_id, grupo, fornecedor_id, fornecedor_nome, documento, descricao, emissao, competencia,
                           vencimento, valor, parcela, parcelas, forma, categoria_id, observacoes, criado_por)
    values (p_empresa, 'compra', p.id, v_grupo, nullif(p.dados->>'fornecedor_id', '')::uuid, nome, doc, desc_, current_date, current_date,
            (it->>'vencimento')::date, round((it->>'valor')::numeric, 2), k, n, p_forma, public.fin_categoria(p_empresa, 'almoxarifado'),
            concat_ws(' · ', 'Gerado pelo pedido de compra (' || p_origem || ')', case when v_cartao_nome is not null then 'Cartão: ' || v_cartao_nome end), auth.uid());
  end loop;
  update compras_registros set dados = dados || jsonb_build_object(
      'forma_pagamento', p_forma,
      -- vencimentos de verdade (no cartão, o da fatura em que cada parcela caiu)
      'parcelas', (select jsonb_agg(jsonb_build_object('due_date', f.vencimento, 'amount', f.valor) order by f.parcela)
                     from fin_pagar f where f.empresa_id = p_empresa and f.origem = 'compra' and f.origem_id = p.id and f.grupo = v_grupo),
      'valor_pagamento', round(p_total, 2), 'pagamento_por_nome', public.almox_nome_usuario(p_empresa), 'pagamento_em', now(), 'pagamento_origem', p_origem),
      updated_at = now()
   where id = p.id;
  return jsonb_build_object('ok', true, 'parcelas', n, 'total', round(p_total, 2), 'cartao', v_cartao_nome);
end $function$;

drop function if exists public.compras_pedido_pagamento(uuid, uuid, text, jsonb, numeric);
create or replace function public.compras_pedido_pagamento(p_empresa uuid, p_pedido uuid, p_forma text, p_parcelas jsonb, p_total numeric default null,
                                                          p_cartao uuid default null, p_cartao_compra date default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare p compras_registros;
begin
  if not public.eh_membro_empresa(p_empresa) or not (
       public.funcionario_tabela_permitida(p_empresa, 'almoxarifado_compras', 'update')) then
    raise exception 'Sem permissão para definir o pagamento do pedido.' using errcode = '42501';
  end if;
  select * into p from compras_registros where id = p_pedido and empresa_id = p_empresa;
  return public.compras_pagamento_aplicar(p_empresa, p_pedido, p_forma, p_parcelas,
           coalesce(p_total, (p.dados->>'valor_total')::numeric), 'Compras', p_cartao, p_cartao_compra);
end $function$;

revoke all on function public.compras_pagamento_aplicar(uuid, uuid, text, jsonb, numeric, text, uuid, date) from public, anon, authenticated;
grant execute on function public.compras_pedido_pagamento(uuid, uuid, text, jsonb, numeric, uuid, date) to authenticated;
grant execute on function public.fin_cartao_salvar(uuid, jsonb), public.fin_cartoes_lista(uuid),
  public.fin_cartao_faturas(uuid, uuid), public.fin_cartao_fatura_detalhe(uuid, uuid), public.fin_cartao_fatura_conciliar(uuid, uuid),
  public.fin_cartao_fatura_importar(uuid, uuid, jsonb, text), public.fin_cartao_linha_acao(uuid, uuid, jsonb), public.fin_cartao_parcela_mover(uuid, uuid, uuid),
  public.fin_cartao_fatura_salvar(uuid, uuid, jsonb), public.fin_cartao_sugestoes_salvar(uuid, uuid, jsonb), public.fin_cartao_retirar(uuid, uuid, text, date),
  public.fin_cartao_datas(int, int, date, int) to authenticated;
