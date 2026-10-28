-- Out/2026 — Almoxarifado: Recebimento de mercadorias (modelo Tecnoweld) + status das solicitações vindo de Compras
-- + pagamento do pedido de compra alimentando o Contas a Pagar.
-- Decisões do usuário: recebimento com XML (importar a nota) ou sem XML (a partir do pedido de compra); falta/avaria vira
-- "Divergência no recebimento" (não "RNC"): a quantidade avariada fica bloqueada (não entra no estoque) até Compras decidir;
-- o almoxarifado só cancela solicitação (com motivo) antes de entrar em cotação; o financeiro (total, forma, parcelas) é de
-- Compras — o almoxarifado só edita no último passo do recebimento se o parâmetro deixar.
-- O estoque do Almoxarifado mora na planilha (gs_linhas, aba Produtos/Movimentacoes): a entrada do recebimento grava ali,
-- igual ao "Entrada" de hoje (Movimentação tipo entrada, origem COMPRA, custo da última compra).

-- ------------------------------------------------------------------ helpers da planilha
create or replace function public.almox_col(p_aba text, p_coluna text)
returns int language sql stable security definer set search_path = public as $$
  select (o - 1)::int from gs_linhas l, jsonb_array_elements_text(l.valores) with ordinality e(x, o)
   where l.planilha_id = '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI' and l.aba = p_aba and l.linha = 1 and e.x = p_coluna
   limit 1
$$;

create or replace function public.almox_nome_usuario(p_empresa uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(fa.nome, u.nome, au.email, 'Sistema')
    from (select auth.uid() as id) me
    left join auth.users au on au.id = me.id
    left join usuarios u on u.id = me.id
    left join funcionarios_acesso fa on fa.id = me.id and fa.empresa_id = p_empresa
$$;

-- Entrada/saída de estoque na planilha (Produtos + linha em Movimentacoes). Uso interno: quem chama confere permissão.
create or replace function public.almox_estoque_mover(p_empresa uuid, p_produto_id text, p_qtd numeric, p_tipo text,
  p_valor_unit numeric, p_origem text, p_responsavel text, p_fornecedor text, p_nota text, p_obs text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pl constant text := '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI';
  ln int; vals jsonb; mcab jsonb; mov jsonb := '[]'::jsonb; prox int; atual numeric; novo numeric; c text; i int;
  agora text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if p_tipo not in ('entrada', 'saida') or coalesce(p_qtd, 0) <= 0 then raise exception 'Movimento de estoque inválido.'; end if;
  select linha, valores into ln, vals from gs_linhas
   where planilha_id = pl and aba = 'Produtos' and linha > 1 and valores->>almox_col('Produtos', 'ID') = p_produto_id
   limit 1 for update;
  if ln is null then raise exception 'Material % não encontrado no Almoxarifado.', p_produto_id; end if;
  atual := public.almox_num(vals->>almox_col('Produtos', 'EstoqueAtual'));
  novo := case when p_tipo = 'entrada' then atual + p_qtd else atual - p_qtd end;
  if novo < 0 then raise exception 'Estoque insuficiente de % (tem %, precisa de %).', vals->>almox_col('Produtos', 'Produto'), atual, p_qtd; end if;
  vals := public.almox_set_valor(vals, almox_col('Produtos', 'EstoqueAtual'), to_jsonb(novo));
  if p_tipo = 'entrada' and coalesce(p_valor_unit, 0) > 0 then
    vals := public.almox_set_valor(vals, almox_col('Produtos', 'ValorCusto'), to_jsonb(round(p_valor_unit, 4)));
  end if;
  if almox_col('Produtos', 'AtualizadoEm') is not null then
    vals := public.almox_set_valor(vals, almox_col('Produtos', 'AtualizadoEm'), to_jsonb(agora));
  end if;
  update gs_linhas set valores = vals where planilha_id = pl and aba = 'Produtos' and linha = ln;

  select valores into mcab from gs_linhas where planilha_id = pl and aba = 'Movimentacoes' and linha = 1;
  for c, i in select x, n - 1 from jsonb_array_elements_text(mcab) with ordinality t(x, n) loop
    mov := public.almox_set_valor(mov, i, case c
      when 'ID' then to_jsonb('MOV_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || lpad((floor(random() * 1000))::int::text, 3, '0'))
      when 'DataHora' then to_jsonb(agora)
      when 'Tipo' then to_jsonb(p_tipo)
      when 'ProdutoID' then to_jsonb(p_produto_id)
      when 'Codigo' then coalesce(vals->almox_col('Produtos', 'Codigo'), '""')
      when 'Produto' then coalesce(vals->almox_col('Produtos', 'Produto'), '""')
      when 'Categoria' then coalesce(vals->almox_col('Produtos', 'Categoria'), '""')
      when 'Setor' then coalesce(vals->almox_col('Produtos', 'Setor'), '""')
      when 'Unidade' then coalesce(vals->almox_col('Produtos', 'Unidade'), '""')
      when 'Quantidade' then to_jsonb(p_qtd)
      when 'Responsavel' then to_jsonb(coalesce(p_responsavel, ''))
      when 'Destino' then to_jsonb('almoxarifado'::text)
      when 'Observacoes' then to_jsonb(coalesce(p_obs, ''))
      when 'EstoqueAnterior' then to_jsonb(atual)
      when 'EstoqueAtual' then to_jsonb(novo)
      when 'OrigemRegistro' then to_jsonb(coalesce(p_origem, 'WEB'))
      when 'Valor' then to_jsonb(round(coalesce(p_valor_unit, 0) * p_qtd, 2))
      when 'Fornecedor' then to_jsonb(coalesce(p_fornecedor, ''))
      when 'Numero da Nota' then to_jsonb(coalesce(p_nota, ''))
      else '""'::jsonb end);
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('almox_mov:' || pl, 0));
  select coalesce(max(linha), 1) + 1 into prox from gs_linhas where planilha_id = pl and aba = 'Movimentacoes';
  insert into gs_linhas (planilha_id, aba, linha, valores) values (pl, 'Movimentacoes', prox, mov);
  update gs_abas set versao = versao + 1, atualizado_em = now() where planilha_id = pl and nome in ('Produtos', 'Movimentacoes');
  return jsonb_build_object('anterior', atual, 'atual', novo);
end $$;

-- ------------------------------------------------------------------ parâmetros
create or replace function public.almox_param(p_empresa uuid, p_chave text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (valor #>> '{}')::boolean from almoxarifado_configuracoes
                    where empresa_id = p_empresa and chave = p_chave order by updated_at desc nulls last limit 1), false)
$$;

drop function if exists public.almox_compra_config_salvar(uuid, boolean);
create or replace function public.almox_compra_config(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_membro_empresa(p_empresa) then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return jsonb_build_object('automatica', public.almox_compra_automatica_ligada(p_empresa),
                            'edita_financeiro', public.almox_param(p_empresa, 'recebimento_edita_financeiro'));
end $$;

create or replace function public.almox_compra_config_salvar(p_empresa uuid, p_automatica boolean, p_edita_financeiro boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare abertas int;
begin
  if not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa, 'configuracoes.empresa.editar') then
    raise exception 'Sem permissão para alterar os parâmetros.' using errcode = '42501';
  end if;
  delete from almoxarifado_configuracoes where empresa_id = p_empresa and chave = 'compra_automatica';
  insert into almoxarifado_configuracoes (empresa_id, chave, valor) values (p_empresa, 'compra_automatica', to_jsonb(coalesce(p_automatica, false)));
  if p_edita_financeiro is not null then
    delete from almoxarifado_configuracoes where empresa_id = p_empresa and chave = 'recebimento_edita_financeiro';
    insert into almoxarifado_configuracoes (empresa_id, chave, valor) values (p_empresa, 'recebimento_edita_financeiro', to_jsonb(p_edita_financeiro));
  end if;
  if p_automatica and p_empresa = public.gs_empresa_dona() then perform public.almox_avaliar_todos(p_empresa); end if;
  select count(*) into abertas from almox_solicitacoes_compra where empresa_id = p_empresa and status = 'aberta';
  return jsonb_build_object('automatica', coalesce(p_automatica, false), 'abertas', abertas,
                            'edita_financeiro', public.almox_param(p_empresa, 'recebimento_edita_financeiro'));
end $$;

-- ------------------------------------------------------------------ solicitações: status vindo de Compras, só cancelar
drop function if exists public.almox_solicitacao_concluir(uuid, uuid, text, text);

create or replace function public.almox_pedido_da_necessidade(p_empresa uuid, p_nec uuid)
returns compras_registros language sql stable security definer set search_path = public as $$
  select c.* from compras_registros c
   where c.empresa_id = p_empresa and c.tipo = 'pedido' and c.status <> 'cancelado'
     and exists (select 1 from jsonb_array_elements(coalesce(c.dados->'items', '[]')) it,
                               jsonb_array_elements(coalesce(it->'allocations', it->'need_allocations', '[]')) a
                  where a->>'purchase_request_id' = p_nec::text)
   order by c.numero desc limit 1
$$;

create or replace function public.almox_solicitacoes_lista(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa, 'estoque.almoxarifado.visualizar') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x order by (x->>'criado_em') desc), '[]') into res from (
    select to_jsonb(s) || jsonb_build_object(
      'necessidade_status', n.status,
      'cotacao_numero', cot.numero,
      'pedido_numero', ped.numero, 'pedido_status', ped.status, 'pedido_id', ped.id,
      'fase', case
        when s.status = 'cancelada' then 'cancelada'
        when ped.id is not null and ped.status = 'recebido' then 'concluida'
        when ped.id is not null then 'andamento'
        when n.status = 'em_cotacao' then 'andamento'
        when s.status = 'comprada' or n.status = 'atendida' then 'concluida'
        else 'aguardando' end,
      'rotulo', case
        when s.status = 'cancelada' then 'Cancelada'
        when ped.id is not null and ped.status = 'recebido' then 'Recebido · PC-' || lpad(ped.numero::text, 6, '0')
        when ped.id is not null and ped.status = 'parcialmente_recebido' then 'Recebido parcial · PC-' || lpad(ped.numero::text, 6, '0')
        when ped.id is not null then 'Pedido emitido · PC-' || lpad(ped.numero::text, 6, '0')
        when n.status = 'em_cotacao' then 'Em cotação' || coalesce(' · SC-' || lpad(cot.numero::text, 6, '0'), '')
        when s.status = 'comprada' or n.status = 'atendida' then 'Atendida (estoque reposto)'
        else 'Aguardando Compras' end,
      'pode_cancelar', s.status = 'aberta' and (n.id is null or (n.status = 'pendente' and coalesce((n.dados->>'quantidade_comprada')::numeric, 0) = 0))
    ) as x
      from almox_solicitacoes_compra s
      left join compras_registros n on n.id = s.compras_necessidade_id
      left join lateral (select * from public.almox_pedido_da_necessidade(p_empresa, n.id) p where n.id is not null) ped on true
      left join lateral (
        select c.numero from compras_registros c
         where n.id is not null and c.empresa_id = p_empresa and c.tipo = 'cotacao' and c.status <> 'cancelada'
           and exists (select 1 from jsonb_array_elements(coalesce(c.dados->'items', '[]')) it,
                                     jsonb_array_elements(coalesce(it->'need_allocations', '[]')) a
                        where a->>'purchase_request_id' = n.id::text)
         order by c.numero desc limit 1) cot on true
     where s.empresa_id = p_empresa
     order by s.criado_em desc limit 500) t;
  return res;
end $$;

create or replace function public.almox_solicitacao_cancelar(p_empresa uuid, p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s almox_solicitacoes_compra; n compras_registros;
begin
  if not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa, 'estoque.almoxarifado.movimentar') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Informe o motivo do cancelamento.'; end if;
  select * into s from almox_solicitacoes_compra where id = p_id and empresa_id = p_empresa for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if s.compras_necessidade_id is not null then
    select * into n from compras_registros where id = s.compras_necessidade_id;
    if found and (n.status <> 'pendente' or coalesce((n.dados->>'quantidade_comprada')::numeric, 0) > 0) then
      raise exception 'Compras já está cotando ou comprando este material: o cancelamento agora é com Compras.';
    end if;
  end if;
  if s.status <> 'aberta' then raise exception 'Esta solicitação não está mais aberta.'; end if;
  update almox_solicitacoes_compra set status = 'cancelada', observacao = trim(p_motivo), concluida_em = now(), concluida_por = auth.uid(),
         concluida_por_nome = public.almox_nome_usuario(p_empresa), liberada = false, atualizado_em = now()
   where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- A necessidade de Compras leva o motivo do cancelamento junto
create or replace function public.almox_sync_compras() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare nid uuid; prox bigint; n compras_registros;
begin
  if pg_trigger_depth() > 2 then return new; end if;
  if tg_op = 'INSERT' and new.status = 'aberta' then
    perform pg_advisory_xact_lock(hashtextextended('compras:' || new.empresa_id::text, 0));
    select coalesce(max(numero), 0) + 1 into prox from compras_registros where empresa_id = new.empresa_id and tipo = 'necessidade';
    insert into compras_registros (empresa_id, tipo, numero, status, dados, criado_por)
    values (new.empresa_id, 'necessidade', prox, 'pendente', jsonb_build_object(
      'origem', 'estoque_minimo', 'pcp_status', 'published', 'solicitante_nome', 'Automático',
      'material_id', new.produto_id, 'material_codigo', new.codigo, 'material_nome', new.produto,
      'descricao_item', new.produto, 'unidade', coalesce(nullif(new.unidade, ''), 'un'),
      'quantidade', new.quantidade, 'quantidade_faltante', new.quantidade, 'quantidade_comprada', 0,
      'estoque_atual', new.estoque_no_pedido, 'estoque_minimo', new.estoque_minimo, 'estoque_ideal', new.estoque_ideal,
      'almox_solicitacao_id', new.id, 'almox_solicitacao_numero', new.numero), null)
    returning id into nid;
    update almox_solicitacoes_compra set compras_necessidade_id = nid where id = new.id;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.compras_necessidade_id is not null then
    select * into n from compras_registros where id = new.compras_necessidade_id for update;
    if not found or n.status <> 'pendente' or coalesce((n.dados->>'quantidade_comprada')::numeric, 0) > 0 then return new; end if;
    if new.status = 'aberta' then
      update compras_registros set dados = dados || jsonb_build_object('quantidade', new.quantidade, 'quantidade_faltante', new.quantidade,
             'estoque_atual', new.estoque_no_pedido, 'estoque_minimo', new.estoque_minimo, 'estoque_ideal', new.estoque_ideal),
             updated_at = now() where id = n.id;
    elsif old.status = 'aberta' then
      update compras_registros set status = case when new.status = 'cancelada' then 'cancelada' else 'atendida' end,
             dados = dados || jsonb_build_object('encerrada_pelo_almoxarifado', coalesce(new.concluida_por_nome, 'Almoxarifado'),
                                                 'motivo_cancelamento', case when new.status = 'cancelada' then new.observacao end),
             updated_at = now() where id = n.id;
    end if;
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------ recebimento
create table if not exists public.almox_recebimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero bigint not null,
  pedido_id uuid references public.compras_registros(id),
  origem text not null check (origem in ('xml', 'manual')),
  status text not null default 'rascunho' check (status in ('rascunho', 'concluido')),
  etapa int not null default 1,
  chave_nfe text, numero_nf text, serie text, emissao date,
  fornecedor_nome text, fornecedor_cnpj text,
  valor_produtos numeric(15,2), valor_outros numeric(15,2), valor_total numeric(15,2),
  duplicatas jsonb not null default '[]',
  observacao text,
  criado_por uuid default auth.uid(), criado_por_nome text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  concluido_em timestamptz, concluido_por uuid, concluido_por_nome text,
  unique (empresa_id, numero)
);
create unique index if not exists almox_recebimentos_chave on public.almox_recebimentos (empresa_id, chave_nfe) where chave_nfe is not null;
create index if not exists almox_recebimentos_pedido on public.almox_recebimentos (pedido_id);

create table if not exists public.almox_recebimento_itens (
  id uuid primary key default gen_random_uuid(),
  recebimento_id uuid not null references public.almox_recebimentos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ordem int not null default 0,
  descricao_nf text not null, codigo_fornecedor text, gtin text, unidade_nf text,
  quantidade_nf numeric not null default 0,
  valor_unitario_nf numeric(15,4) not null default 0,
  valor_unitario numeric(15,4) not null default 0,
  produto_id text, produto_nome text, produto_codigo text, unidade_interna text,
  fator_conversao numeric not null default 1 check (fator_conversao > 0),
  pedido_item_id text,
  controla_estoque boolean not null default true,
  quantidade_recebida numeric not null default 0 check (quantidade_recebida >= 0),
  quantidade_avariada numeric not null default 0 check (quantidade_avariada >= 0),
  divergencia_descricao text,
  divergencia_fotos jsonb not null default '[]'
);
create index if not exists almox_recebimento_itens_rec on public.almox_recebimento_itens (recebimento_id, ordem);

-- Memória "código do fornecedor -> material do almoxarifado" (vincula sozinho na próxima nota)
create table if not exists public.almox_fornecedor_produtos (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cnpj text not null, codigo_fornecedor text not null,
  produto_id text not null, fator_conversao numeric not null default 1,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, cnpj, codigo_fornecedor)
);

alter table public.almox_recebimentos enable row level security;
alter table public.almox_recebimento_itens enable row level security;
alter table public.almox_fornecedor_produtos enable row level security;
drop policy if exists almox_recebimentos_ler on public.almox_recebimentos;
create policy almox_recebimentos_ler on public.almox_recebimentos for select to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'estoque.almoxarifado.visualizar'));
drop policy if exists almox_recebimento_itens_ler on public.almox_recebimento_itens;
create policy almox_recebimento_itens_ler on public.almox_recebimento_itens for select to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'estoque.almoxarifado.visualizar'));
grant select on public.almox_recebimentos, public.almox_recebimento_itens to authenticated;

create or replace function public.almox_receb_checar(p_empresa uuid, p_chave text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa, p_chave) then
    raise exception 'Sem permissão para o recebimento.' using errcode = '42501';
  end if;
end $$;

-- Saldo a receber de cada item de um pedido de compra
create or replace function public.almox_pedido_itens(p compras_registros)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(it || jsonb_build_object('saldo', greatest(0, coalesce((it->>'quantidade')::numeric, 0) - coalesce((it->>'quantidade_recebida')::numeric, 0)))), '[]')
    from jsonb_array_elements(coalesce(p.dados->'items', '[]')) it
$$;

create or replace function public.almox_receb_pedidos(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  perform public.almox_receb_checar(p_empresa, 'estoque.almoxarifado.visualizar');
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'numero', c.numero, 'status', c.status,
      'fornecedor', coalesce(c.dados->>'fornecedor_nome', c.dados->'fornecedor'->>'nome'),
      'fornecedor_cnpj', c.dados->'fornecedor'->>'documento',
      'prazo', c.dados->>'prazo_acordado', 'valor_total', c.dados->'valor_total',
      'condicao_pagamento', c.dados->>'condicao_pagamento', 'pagamento_confirmado', c.dados ? 'parcelas',
      'itens', public.almox_pedido_itens(c),
      'rascunho', (select jsonb_build_object('id', r.id, 'numero', r.numero, 'etapa', r.etapa, 'origem', r.origem)
                     from almox_recebimentos r where r.pedido_id = c.id and r.status = 'rascunho' order by r.created_at desc limit 1)
    ) order by c.numero), '[]') into res
    from compras_registros c
   where c.empresa_id = p_empresa and c.tipo = 'pedido' and c.status in ('aguardando_recebimento', 'parcialmente_recebido', 'faturado', 'aguardando_entrega', 'emitido');
  return res;
end $$;

create or replace function public.almox_receb_listar(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  perform public.almox_receb_checar(p_empresa, 'estoque.almoxarifado.visualizar');
  select coalesce(jsonb_agg(to_jsonb(r) - 'duplicatas' || jsonb_build_object(
      'pedido_numero', p.numero,
      'itens_count', (select count(*) from almox_recebimento_itens i where i.recebimento_id = r.id),
      'divergencias', (select count(*) from almox_recebimento_itens i where i.recebimento_id = r.id
                        and (i.quantidade_avariada > 0 or i.quantidade_recebida <> i.quantidade_nf))
    ) order by r.created_at desc), '[]') into res
    from almox_recebimentos r left join compras_registros p on p.id = r.pedido_id
   where r.empresa_id = p_empresa;
  return res;
end $$;

create or replace function public.almox_receb_obter(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r almox_recebimentos; p compras_registros; res jsonb;
begin
  perform public.almox_receb_checar(p_empresa, 'estoque.almoxarifado.visualizar');
  select * into r from almox_recebimentos where id = p_id and empresa_id = p_empresa;
  if not found then raise exception 'Recebimento não encontrado.'; end if;
  select * into p from compras_registros where id = r.pedido_id;
  res := to_jsonb(r) || jsonb_build_object(
    'itens', (select coalesce(jsonb_agg(to_jsonb(i) order by i.ordem), '[]') from almox_recebimento_itens i where i.recebimento_id = r.id),
    'pedido', case when p.id is null then null else jsonb_build_object(
       'id', p.id, 'numero', p.numero, 'status', p.status,
       'fornecedor', coalesce(p.dados->>'fornecedor_nome', p.dados->'fornecedor'->>'nome'),
       'fornecedor_cnpj', p.dados->'fornecedor'->>'documento',
       'valor_total', p.dados->'valor_total', 'condicao_pagamento', p.dados->>'condicao_pagamento',
       'forma_pagamento', p.dados->>'forma_pagamento', 'parcelas', p.dados->'parcelas',
       'pagamento_por', p.dados->>'pagamento_por_nome', 'pagamento_em', p.dados->>'pagamento_em',
       'itens', public.almox_pedido_itens(p)) end,
    'edita_financeiro', public.almox_param(p_empresa, 'recebimento_edita_financeiro')
       or public.funcionario_tabela_permitida(p_empresa, 'almoxarifado_compras', 'update'),
    'divergencias', (select coalesce(jsonb_agg((c.dados || jsonb_build_object('id', c.id, 'numero', c.numero, 'status', c.status)) - 'anexos'), '[]')
                       from compras_registros c where c.empresa_id = p_empresa and c.tipo = 'rnc' and c.dados->>'recebimento_id' = r.id::text));
  return res;
end $$;

-- Cria o recebimento. Sem XML: itens = saldo do pedido, já vinculados. Com XML: itens da nota, vinculados pela memória.
create or replace function public.almox_receb_criar(p_empresa uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p compras_registros; rid uuid; num bigint; nota jsonb := coalesce(p_dados->'nota', '{}'); it jsonb; ord int := 0;
  chave text; cnpj text; cnpj_ped text; origem text := p_dados->>'origem'; mem record; pit text; total numeric := 0;
begin
  perform public.almox_receb_checar(p_empresa, 'estoque.almoxarifado.movimentar');
  if origem not in ('xml', 'manual') then raise exception 'Origem inválida.'; end if;
  select * into p from compras_registros where id = nullif(p_dados->>'pedido_id', '')::uuid and empresa_id = p_empresa and tipo = 'pedido';
  if not found then raise exception 'Escolha o pedido de compra que chegou.'; end if;
  if p.status in ('cancelado', 'recebido') then raise exception 'O pedido PC-% não está aberto para recebimento.', lpad(p.numero::text, 6, '0'); end if;
  chave := nullif(regexp_replace(coalesce(nota->>'chave', ''), '\D', '', 'g'), '');
  if chave is not null and length(chave) <> 44 then raise exception 'A chave da nota precisa ter 44 números.'; end if;
  if chave is not null and exists (select 1 from almox_recebimentos where empresa_id = p_empresa and chave_nfe = chave) then
    raise exception 'Esta nota já foi recebida (ou está em recebimento).';
  end if;
  if length(trim(coalesce(nota->>'numero', ''))) = 0 then raise exception 'Informe o número da nota fiscal.'; end if;
  cnpj := nullif(regexp_replace(coalesce(nota->>'cnpj', ''), '\D', '', 'g'), '');
  cnpj_ped := nullif(regexp_replace(coalesce(p.dados->'fornecedor'->>'documento', ''), '\D', '', 'g'), '');
  if cnpj is not null and cnpj_ped is not null and cnpj <> cnpj_ped then
    raise exception 'A nota é de outro fornecedor (CNPJ %) — o pedido PC-% é de %.', nota->>'cnpj', lpad(p.numero::text, 6, '0'), coalesce(p.dados->>'fornecedor_nome', 'outro fornecedor');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('almox_receb:' || p_empresa::text, 0));
  select coalesce(max(numero), 0) + 1 into num from almox_recebimentos where empresa_id = p_empresa;
  insert into almox_recebimentos (empresa_id, numero, pedido_id, origem, etapa, chave_nfe, numero_nf, serie, emissao,
    fornecedor_nome, fornecedor_cnpj, valor_produtos, valor_outros, valor_total, duplicatas, observacao, criado_por_nome)
  values (p_empresa, num, p.id, origem, case when origem = 'manual' then 3 else 2 end, chave, trim(nota->>'numero'), nullif(trim(coalesce(nota->>'serie', '')), ''),
    coalesce(nullif(nota->>'emissao', '')::date, current_date),
    coalesce(nullif(nota->>'fornecedor', ''), p.dados->>'fornecedor_nome', p.dados->'fornecedor'->>'nome'), coalesce(cnpj, cnpj_ped),
    nullif(nota->>'valor_produtos', '')::numeric, nullif(nota->>'valor_outros', '')::numeric, nullif(nota->>'valor_total', '')::numeric,
    coalesce(nota->'duplicatas', '[]'), nullif(trim(coalesce(p_dados->>'observacao', '')), ''), public.almox_nome_usuario(p_empresa))
  returning id into rid;

  if origem = 'manual' then
    for it in select x from jsonb_array_elements(public.almox_pedido_itens(p)) x where (x->>'saldo')::numeric > 0 loop
      ord := ord + 1;
      insert into almox_recebimento_itens (recebimento_id, empresa_id, ordem, descricao_nf, unidade_nf, quantidade_nf, valor_unitario_nf, valor_unitario,
        produto_id, produto_nome, produto_codigo, unidade_interna, pedido_item_id)
      values (rid, p_empresa, ord, coalesce(it->>'nome', it->>'material_nome', 'Item'), it->>'unidade', (it->>'saldo')::numeric,
        coalesce((it->>'valor_unitario')::numeric, 0), coalesce((it->>'valor_unitario')::numeric, 0),
        it->>'material_id', coalesce(it->>'nome', it->>'material_nome'), it->>'codigo', it->>'unidade', it->>'id');
      total := total + (it->>'saldo')::numeric * coalesce((it->>'valor_unitario')::numeric, 0);
    end loop;
    if ord = 0 then raise exception 'O pedido não tem saldo a receber.'; end if;
    update almox_recebimentos set valor_produtos = round(total, 2), valor_total = round(total, 2) where id = rid;
  else
    if jsonb_array_length(coalesce(p_dados->'itens', '[]')) = 0 then raise exception 'A nota não tem itens.'; end if;
    for it in select x from jsonb_array_elements(p_dados->'itens') x loop
      ord := ord + 1;
      select * into mem from almox_fornecedor_produtos m
       where m.empresa_id = p_empresa and m.cnpj = coalesce(cnpj, cnpj_ped, '') and m.codigo_fornecedor = coalesce(nullif(it->>'codigo_fornecedor', ''), '-');
      pit := null;
      if mem.produto_id is not null then
        select x->>'id' into pit from jsonb_array_elements(public.almox_pedido_itens(p)) x
         where x->>'material_id' = mem.produto_id and (x->>'saldo')::numeric > 0 limit 1;
      end if;
      insert into almox_recebimento_itens (recebimento_id, empresa_id, ordem, descricao_nf, codigo_fornecedor, gtin, unidade_nf, quantidade_nf,
        valor_unitario_nf, valor_unitario, produto_id, fator_conversao, pedido_item_id)
      values (rid, p_empresa, ord, coalesce(nullif(it->>'descricao', ''), 'Item'), nullif(it->>'codigo_fornecedor', ''), nullif(it->>'gtin', ''),
        nullif(it->>'unidade', ''), coalesce((it->>'quantidade')::numeric, 0), coalesce((it->>'valor_unitario')::numeric, 0),
        coalesce((it->>'valor_unitario')::numeric, 0), mem.produto_id, coalesce(mem.fator_conversao, 1), pit);
    end loop;
    perform public.almox_receb_completar_produtos(rid);
  end if;
  return rid;
end $$;

-- Preenche nome/código/unidade dos materiais vinculados (a partir da planilha)
create or replace function public.almox_receb_completar_produtos(p_rec uuid)
returns void language sql security definer set search_path = public as $$
  update almox_recebimento_itens i set
    produto_nome = l.valores->>public.almox_col('Produtos', 'Produto'),
    produto_codigo = l.valores->>public.almox_col('Produtos', 'Codigo'),
    unidade_interna = l.valores->>public.almox_col('Produtos', 'Unidade')
   from gs_linhas l
  where i.recebimento_id = p_rec and i.produto_id is not null
    and l.planilha_id = '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI' and l.aba = 'Produtos' and l.linha > 1
    and l.valores->>public.almox_col('Produtos', 'ID') = i.produto_id
$$;

-- Salva o rascunho (vínculos, quantidades, divergências, valores) e a etapa
create or replace function public.almox_receb_salvar(p_empresa uuid, p_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r almox_recebimentos; it jsonb; i almox_recebimento_itens; p compras_registros; fotos jsonb;
begin
  perform public.almox_receb_checar(p_empresa, 'estoque.almoxarifado.movimentar');
  select * into r from almox_recebimentos where id = p_id and empresa_id = p_empresa for update;
  if not found then raise exception 'Recebimento não encontrado.'; end if;
  if r.status <> 'rascunho' then raise exception 'Este recebimento já foi concluído.'; end if;
  select * into p from compras_registros where id = r.pedido_id;
  for it in select x from jsonb_array_elements(coalesce(p_dados->'itens', '[]')) x loop
    select * into i from almox_recebimento_itens where id = (it->>'id')::uuid and recebimento_id = r.id;
    if not found then continue; end if;
    if it ? 'produto_id' then
      if nullif(it->>'produto_id', '') is not null and not exists (select 1 from gs_linhas l
           where l.planilha_id = '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI' and l.aba = 'Produtos' and l.linha > 1
             and l.valores->>public.almox_col('Produtos', 'ID') = it->>'produto_id') then
        raise exception 'Material não encontrado no Almoxarifado.';
      end if;
      i.produto_id := nullif(it->>'produto_id', '');
    end if;
    if it ? 'pedido_item_id' then
      if nullif(it->>'pedido_item_id', '') is not null and not exists (select 1 from jsonb_array_elements(coalesce(p.dados->'items', '[]')) x where x->>'id' = it->>'pedido_item_id') then
        raise exception 'Item do pedido inválido.';
      end if;
      i.pedido_item_id := nullif(it->>'pedido_item_id', '');
    end if;
    if it ? 'fator_conversao' then i.fator_conversao := greatest(coalesce(nullif(it->>'fator_conversao', '')::numeric, 1), 0.000001); end if;
    if it ? 'controla_estoque' then i.controla_estoque := coalesce((it->>'controla_estoque')::boolean, true); end if;
    if it ? 'quantidade_recebida' then i.quantidade_recebida := greatest(coalesce(nullif(it->>'quantidade_recebida', '')::numeric, 0), 0); end if;
    if it ? 'quantidade_avariada' then i.quantidade_avariada := greatest(coalesce(nullif(it->>'quantidade_avariada', '')::numeric, 0), 0); end if;
    if i.quantidade_avariada > i.quantidade_recebida then raise exception 'A quantidade avariada não pode passar da recebida (%).', i.descricao_nf; end if;
    if it ? 'divergencia_descricao' then i.divergencia_descricao := nullif(left(trim(coalesce(it->>'divergencia_descricao', '')), 1000), ''); end if;
    if it ? 'divergencia_fotos' then
      fotos := coalesce(it->'divergencia_fotos', '[]');
      if jsonb_typeof(fotos) <> 'array' or jsonb_array_length(fotos) > 6 or length(fotos::text) > 9000000 then raise exception 'Fotos inválidas (até 6).'; end if;
      i.divergencia_fotos := fotos;
    end if;
    if it ? 'valor_unitario' then i.valor_unitario := greatest(coalesce(nullif(it->>'valor_unitario', '')::numeric, 0), 0); end if;
    update almox_recebimento_itens set produto_id = i.produto_id, pedido_item_id = i.pedido_item_id, fator_conversao = i.fator_conversao,
      controla_estoque = i.controla_estoque, quantidade_recebida = i.quantidade_recebida, quantidade_avariada = i.quantidade_avariada,
      divergencia_descricao = i.divergencia_descricao, divergencia_fotos = i.divergencia_fotos, valor_unitario = i.valor_unitario
     where id = i.id;
    if i.produto_id is not null and i.codigo_fornecedor is not null and coalesce(r.fornecedor_cnpj, '') <> '' then
      insert into almox_fornecedor_produtos (empresa_id, cnpj, codigo_fornecedor, produto_id, fator_conversao)
      values (p_empresa, r.fornecedor_cnpj, i.codigo_fornecedor, i.produto_id, i.fator_conversao)
      on conflict (empresa_id, cnpj, codigo_fornecedor) do update set produto_id = excluded.produto_id, fator_conversao = excluded.fator_conversao, atualizado_em = now();
    end if;
  end loop;
  perform public.almox_receb_completar_produtos(r.id);
  update almox_recebimentos set etapa = greatest(etapa, least(5, coalesce((p_dados->>'etapa')::int, etapa))),
         observacao = case when p_dados ? 'observacao' then nullif(trim(coalesce(p_dados->>'observacao', '')), '') else observacao end,
         updated_at = now() where id = r.id;
  return public.almox_receb_obter(p_empresa, r.id);
end $$;

create or replace function public.almox_receb_excluir(p_empresa uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.almox_receb_checar(p_empresa, 'estoque.almoxarifado.movimentar');
  delete from almox_recebimentos where id = p_id and empresa_id = p_empresa and status = 'rascunho';
  if not found then raise exception 'Só dá para descartar um recebimento ainda não concluído.'; end if;
end $$;

-- ------------------------------------------------------------------ pagamento do pedido -> Contas a Pagar
-- Uso interno: grava forma/parcelas no pedido e refaz os títulos a pagar dele (só se nenhum foi pago).
create or replace function public.compras_pagamento_aplicar(p_empresa uuid, p_pedido uuid, p_forma text, p_parcelas jsonb, p_total numeric, p_origem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p compras_registros; soma numeric; n int; k int := 0; it jsonb; doc text; nome text; desc_ text; grupo uuid := gen_random_uuid(); notas text;
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
  if exists (select 1 from fin_pagar where empresa_id = p_empresa and origem = 'compra' and origem_id = p.id and status <> 'cancelado' and pago > 0) then
    raise exception 'Este pedido já tem pagamento registrado no Financeiro — ajuste por lá.';
  end if;
  update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
         cancelamento_motivo = 'Pagamento do pedido refeito (' || p_origem || ')'
   where empresa_id = p_empresa and origem = 'compra' and origem_id = p.id and status <> 'cancelado';
  perform public.fin_semear(p_empresa);
  nome := coalesce(p.dados->>'fornecedor_nome', p.dados->'fornecedor'->>'nome', 'Fornecedor');
  select string_agg(distinct r.numero_nf, ', ') into notas from almox_recebimentos r where r.pedido_id = p.id and r.status = 'concluido';
  doc := 'PC-' || lpad(p.numero::text, 6, '0') || coalesce(' · NF ' || notas, '');
  desc_ := 'Compra ' || 'PC-' || lpad(p.numero::text, 6, '0') || ' · ' || nome;
  for it in select x from jsonb_array_elements(p_parcelas) x order by (x->>'vencimento')::date loop
    k := k + 1;
    insert into fin_pagar (empresa_id, origem, origem_id, grupo, fornecedor_id, fornecedor_nome, documento, descricao, emissao, competencia,
                           vencimento, valor, parcela, parcelas, forma, categoria_id, observacoes, criado_por)
    values (p_empresa, 'compra', p.id, grupo, nullif(p.dados->>'fornecedor_id', '')::uuid, nome, doc, desc_, current_date, current_date,
            (it->>'vencimento')::date, round((it->>'valor')::numeric, 2), k, n, p_forma, public.fin_categoria(p_empresa, 'almoxarifado'),
            'Gerado pelo pedido de compra (' || p_origem || ')', auth.uid());
  end loop;
  update compras_registros set dados = dados || jsonb_build_object(
      'forma_pagamento', p_forma,
      'parcelas', (select jsonb_agg(jsonb_build_object('due_date', x->>'vencimento', 'amount', round((x->>'valor')::numeric, 2)) order by (x->>'vencimento')::date) from jsonb_array_elements(p_parcelas) x),
      'valor_pagamento', round(p_total, 2), 'pagamento_por_nome', public.almox_nome_usuario(p_empresa), 'pagamento_em', now(), 'pagamento_origem', p_origem),
      updated_at = now()
   where id = p.id;
  return jsonb_build_object('ok', true, 'parcelas', n, 'total', round(p_total, 2));
end $$;

create or replace function public.compras_pedido_pagamento(p_empresa uuid, p_pedido uuid, p_forma text, p_parcelas jsonb, p_total numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p compras_registros;
begin
  if not public.eh_membro_empresa(p_empresa) or not (
       public.funcionario_tabela_permitida(p_empresa, 'almoxarifado_compras', 'update')) then
    raise exception 'Sem permissão para definir o pagamento do pedido.' using errcode = '42501';
  end if;
  select * into p from compras_registros where id = p_pedido and empresa_id = p_empresa;
  return public.compras_pagamento_aplicar(p_empresa, p_pedido, p_forma, p_parcelas,
           coalesce(p_total, (p.dados->>'valor_total')::numeric), 'Compras');
end $$;

-- ------------------------------------------------------------------ concluir o recebimento
create or replace function public.almox_receb_concluir(p_empresa uuid, p_id uuid, p_financeiro jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r almox_recebimentos; p compras_registros; i almox_recebimento_itens; itens jsonb; x jsonb; recebido numeric; nome text;
  entrada numeric; nrnc bigint; criadas int := 0; total_rec numeric; pode_fin boolean;
begin
  perform public.almox_receb_checar(p_empresa, 'estoque.almoxarifado.movimentar');
  select * into r from almox_recebimentos where id = p_id and empresa_id = p_empresa for update;
  if not found then raise exception 'Recebimento não encontrado.'; end if;
  if r.status <> 'rascunho' then raise exception 'Este recebimento já foi concluído.'; end if;
  select * into p from compras_registros where id = r.pedido_id for update;
  if p.status in ('cancelado', 'recebido') then raise exception 'O pedido não está mais aberto para recebimento.'; end if;
  if not exists (select 1 from almox_recebimento_itens where recebimento_id = r.id and quantidade_recebida > 0) then
    raise exception 'Informe a quantidade recebida de pelo menos um item.';
  end if;
  for i in select * from almox_recebimento_itens where recebimento_id = r.id order by ordem loop
    if i.controla_estoque and i.quantidade_recebida > 0 and i.produto_id is null then
      raise exception 'Vincule "%" a um material do Almoxarifado (ou marque que não controla estoque).', i.descricao_nf;
    end if;
    if (i.quantidade_recebida <> i.quantidade_nf or i.quantidade_avariada > 0) and coalesce(i.divergencia_descricao, '') = '' then
      raise exception 'Descreva a divergência de "%".', i.descricao_nf;
    end if;
    if i.quantidade_avariada > 0 and i.pedido_item_id is null then
      raise exception 'Ligue "%" a um item do pedido para registrar o avariado.', i.descricao_nf;
    end if;
    if i.quantidade_avariada > 0 and jsonb_array_length(i.divergencia_fotos) = 0 then
      raise exception 'Tire pelo menos uma foto do avariado de "%".', i.descricao_nf;
    end if;
  end loop;

  nome := public.almox_nome_usuario(p_empresa);
  -- solicitações automáticas dos materiais recebidos voltam a valer (a entrada pode tirar do mínimo)
  update almox_solicitacoes_compra set liberada = true, atualizado_em = now()
   where empresa_id = p_empresa and status <> 'aberta' and not liberada
     and produto_id in (select produto_id from almox_recebimento_itens where recebimento_id = r.id and produto_id is not null);

  -- entrada no estoque (aceito = recebido - avariado; avariado fica bloqueado até Compras decidir)
  for i in select * from almox_recebimento_itens where recebimento_id = r.id and controla_estoque and produto_id is not null order by ordem loop
    entrada := (i.quantidade_recebida - i.quantidade_avariada) * i.fator_conversao;
    if entrada > 0 then
      perform public.almox_estoque_mover(p_empresa, i.produto_id, entrada, 'entrada', i.valor_unitario / i.fator_conversao, 'COMPRA', nome,
        r.fornecedor_nome, r.numero_nf, 'Recebimento R-' || lpad(r.numero::text, 5, '0') || ' · PC-' || lpad(p.numero::text, 6, '0'));
    end if;
  end loop;

  -- pedido de compra: quantidade recebida por item e status
  select coalesce(jsonb_agg(case when exists (select 1 from almox_recebimento_itens ri where ri.recebimento_id = r.id and ri.pedido_item_id = it->>'id')
      then it || jsonb_build_object('quantidade_recebida', coalesce((it->>'quantidade_recebida')::numeric, 0)
             + (select sum(ri.quantidade_recebida * ri.fator_conversao) from almox_recebimento_itens ri where ri.recebimento_id = r.id and ri.pedido_item_id = it->>'id'))
      else it end), '[]') into itens
    from jsonb_array_elements(coalesce(p.dados->'items', '[]')) it;
  select coalesce(sum(least(coalesce((q->>'quantidade_recebida')::numeric, 0), coalesce((q->>'quantidade')::numeric, 0))), 0),
         nullif(sum(coalesce((q->>'quantidade')::numeric, 0)), 0)
    into recebido, total_rec from jsonb_array_elements(itens) q;
  update compras_registros set dados = dados || jsonb_build_object('items', itens,
        'percentual_recebido', case when total_rec > 0 then round(100 * recebido / total_rec) else 0 end,
        'nfe_receipts', coalesce(dados->'nfe_receipts', '[]') || jsonb_build_array(jsonb_build_object('id', r.id, 'numero_nfe', r.numero_nf, 'origem', 'almoxarifado', 'recebimento_numero', r.numero))),
      status = case when not exists (select 1 from jsonb_array_elements(itens) y where coalesce((y->>'quantidade_recebida')::numeric, 0) < coalesce((y->>'quantidade')::numeric, 0))
                    then 'recebido' else 'parcialmente_recebido' end,
      updated_at = now()
   where id = p.id;

  -- avariado vira "Divergência no recebimento" para Compras decidir (material já fora do estoque = bloqueado)
  for i in select * from almox_recebimento_itens where recebimento_id = r.id and quantidade_avariada > 0 order by ordem loop
    perform pg_advisory_xact_lock(hashtextextended('compras:' || p_empresa::text, 0));
    select coalesce(max(numero), 0) + 1 into nrnc from compras_registros where empresa_id = p_empresa and tipo = 'rnc';
    insert into compras_registros (empresa_id, tipo, numero, status, dados) values (p_empresa, 'rnc', nrnc, 'aberta', jsonb_build_object(
      'order_id', p.id, 'order_item_id', i.pedido_item_id, 'material_id', i.produto_id, 'fornecedor_id', p.dados->>'fornecedor_id',
      'fornecedor', coalesce(p.dados->>'fornecedor_nome', p.dados->'fornecedor'->>'nome'), 'pedido_numero', p.numero,
      'material_nome', coalesce(i.produto_nome, i.descricao_nf), 'material_unidade', coalesce(i.unidade_interna, i.unidade_nf),
      'quantidade', i.quantidade_avariada * i.fator_conversao, 'quantidade_bloqueada', i.quantidade_avariada * i.fator_conversao,
      'descricao', i.divergencia_descricao, 'recebimento_concluido', true, 'criado_em', now(), 'numero_nfe', r.numero_nf,
      'recebimento_id', r.id, 'recebimento_numero', r.numero, 'origem', 'recebimento_almoxarifado', 'criado_por_nome', nome,
      'anexos', (select coalesce(jsonb_agg(jsonb_build_object('nome', coalesce(f->>'nome', 'foto.jpg'), 'conteudo', f->>'conteudo')), '[]') from jsonb_array_elements(i.divergencia_fotos) f)));
    criadas := criadas + 1;
  end loop;

  update almox_recebimentos set status = 'concluido', etapa = 5, concluido_em = now(), concluido_por = auth.uid(), concluido_por_nome = nome, updated_at = now()
   where id = r.id;
  -- valores e pagamento (último passo): só com o parâmetro ligado ou com permissão de Compras
  if p_financeiro is not null and jsonb_typeof(p_financeiro) = 'object' then
    pode_fin := public.almox_param(p_empresa, 'recebimento_edita_financeiro') or public.funcionario_tabela_permitida(p_empresa, 'almoxarifado_compras', 'update');
    if not pode_fin then raise exception 'Valores e pagamento são definidos por Compras.'; end if;
    for x in select v from jsonb_array_elements(coalesce(p_financeiro->'itens', '[]')) v loop
      update almox_recebimento_itens set valor_unitario = greatest(coalesce((x->>'valor_unitario')::numeric, 0), 0)
       where id = (x->>'id')::uuid and recebimento_id = r.id;
    end loop;
    update almox_recebimentos set valor_total = (p_financeiro->>'total')::numeric where id = r.id;
    perform public.compras_pagamento_aplicar(p_empresa, p.id, p_financeiro->>'forma', p_financeiro->'parcelas', (p_financeiro->>'total')::numeric, 'Recebimento do Almoxarifado');
  end if;

  return jsonb_build_object('ok', true, 'divergencias', criadas);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public.almox_estoque_mover(uuid, text, numeric, text, numeric, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.compras_pagamento_aplicar(uuid, uuid, text, jsonb, numeric, text) from public, anon, authenticated;
revoke all on function public.almox_receb_completar_produtos(uuid) from public, anon, authenticated;
revoke all on function public.almox_receb_checar(uuid, text) from public, anon;
revoke all on function public.almox_pedido_da_necessidade(uuid, uuid) from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array[
    'almox_compra_config(uuid)', 'almox_compra_config_salvar(uuid, boolean, boolean)', 'almox_solicitacoes_lista(uuid)',
    'almox_solicitacao_cancelar(uuid, uuid, text)', 'almox_receb_pedidos(uuid)', 'almox_receb_listar(uuid)', 'almox_receb_obter(uuid, uuid)',
    'almox_receb_criar(uuid, jsonb)', 'almox_receb_salvar(uuid, uuid, jsonb)', 'almox_receb_excluir(uuid, uuid)',
    'almox_receb_concluir(uuid, uuid, jsonb)', 'compras_pedido_pagamento(uuid, uuid, text, jsonb, numeric)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
