-- 15/11/2026: tecido/tinta de cartela que nunca foi comprado vira solicitação de compra sozinho.
-- Regra: quando um pedido fica Reservado (aprovado/finalizado/enviado) e tem uma personalização cujo material
-- o cliente escolheu na cartela, e a opção escolhida NÃO está ligada a um material do Almoxarifado, abre-se
-- uma necessidade em Compras (origem 'cartela'), uma por pedido + opção, com a quantidade do pedido.
-- Em Compras ela fica "Aguardando vínculo": ao vincular a um material existente ou cadastrar um novo no
-- Almoxarifado, a opção da cartela passa a apontar para ele (cartela_opcoes.almox_produto_id) e, daí em diante,
-- reserva no Almoxarifado como qualquer material.

-- --------------------------------------------------------------------------------------------------
-- Sincroniza as necessidades de cartela de UM pedido
create or replace function public.cartela_compras_sincronizar(p_pedido uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  p separacoes_pedidos;
  vale boolean;
  w record;
  n compras_registros;
  prox bigint;
  doc jsonb;
  vistos uuid[] := '{}';
begin
  select * into p from separacoes_pedidos where id = p_pedido;
  if not found then return; end if;

  vale := p.status_comercial in ('aprovado', 'finalizado', 'enviado')
          and coalesce(p.data_evento_fim, p.data_evento, current_date) >= current_date
          and p.encerrado_operacional_em is null
          and coalesce(p.observacoes->>'teste_cronograma', '') <> 'true';

  if vale then
    for w in
      with ambs as (
        select a from jsonb_array_elements(case when jsonb_typeof(p.observacoes->'projeto_comercial'->'dados'->'ambientes') = 'array'
                                               then p.observacoes->'projeto_comercial'->'dados'->'ambientes' else '[]'::jsonb end) a
      ), linhas as (
        select (it->>'personalizacao_id')::uuid as pers,
               case when jsonb_typeof(it->'personalizacao_escolhas') = 'object' then it->'personalizacao_escolhas' else '{}'::jsonb end as escolhas,
               greatest(coalesce(public.almox_num(it->>'quantidade'), 0), 0) as qtd
          from ambs
          cross join lateral jsonb_array_elements(case when jsonb_typeof(ambs.a->'itens') = 'array' then ambs.a->'itens' else '[]'::jsonb end) it
         where coalesce(it->>'personalizacao_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
      select o.id as opcao_id, o.codigo, o.nome as opcao_nome, o.almox_produto_id,
             c.id as cartela_id, c.nome as cartela_nome, c.tipo as cartela_tipo, c.unidade,
             c.fornecedor_id, coalesce(c.fornecedor_nome, '') as fornecedor_nome, o.preco,
             sum(l.qtd * pi.quantidade) as quantidade
        from linhas l
        join personalizacoes_insumos pi on pi.personalizacao_id = l.pers and pi.empresa_id = p.empresa_id and pi.cartela_tipo is not null
        join cartela_opcoes o on o.empresa_id = p.empresa_id and o.id::text = l.escolhas->pi.cartela_tipo->>'opcao_id'
        join cartelas c on c.id = o.cartela_id
       group by o.id, o.codigo, o.nome, o.almox_produto_id, c.id, c.nome, c.tipo, c.unidade, c.fornecedor_id, c.fornecedor_nome, o.preco
      having sum(l.qtd * pi.quantidade) > 0
    loop
      vistos := vistos || w.opcao_id;
      select * into n from compras_registros
       where empresa_id = p.empresa_id and tipo = 'necessidade' and dados->>'origem' = 'cartela'
         and dados->>'pedido_id' = p.id::text and dados->>'cartela_opcao_id' = w.opcao_id::text
         and status <> 'cancelada'
       order by created_at desc limit 1 for update;
      if found then
        -- ainda não comprada: acompanha a quantidade do pedido
        if n.status in ('aguardando_vinculo', 'pendente') and coalesce((n.dados->>'quantidade_comprada')::numeric, 0) = 0 then
          update compras_registros set dados = dados || jsonb_build_object('quantidade', w.quantidade, 'quantidade_faltante', w.quantidade,
                 'data_necessidade', greatest(current_date, coalesce(p.data_entrega, p.data_evento) - 3)), updated_at = now()
           where id = n.id;
        end if;
        continue;
      end if;
      -- opção já ligada a um material: quem cuida é a reserva do Almoxarifado (e o estoque mínimo), não abre compra
      if w.almox_produto_id is not null then continue; end if;

      perform pg_advisory_xact_lock(hashtextextended('compras:' || p.empresa_id::text, 0));
      select coalesce(max(numero), 0) + 1 into prox from compras_registros where empresa_id = p.empresa_id and tipo = 'necessidade';
      doc := jsonb_build_object(
        'origem', 'cartela', 'pcp_status', 'published', 'solicitante_nome', 'Automático (pedido ' || p.numero_pedido || ')',
        'material_nome', trim(concat_ws(' ', w.cartela_tipo, nullif(w.codigo, ''), w.opcao_nome)) || case when w.fornecedor_nome <> '' then ' (' || w.fornecedor_nome || ')' else '' end,
        'descricao_item', trim(concat_ws(' ', w.cartela_tipo, nullif(w.codigo, ''), w.opcao_nome)) || ' · cartela ' || w.cartela_nome,
        'unidade', coalesce(nullif(w.unidade, ''), 'un'),
        'quantidade', w.quantidade, 'quantidade_faltante', w.quantidade, 'quantidade_comprada', 0,
        'data_necessidade', greatest(current_date, coalesce(p.data_entrega, p.data_evento) - 3),
        'pedido_id', p.id, 'pedido_numero', p.numero_pedido, 'pedido_cliente', p.cliente_nome,
        'cartela_opcao_id', w.opcao_id, 'cartela_id', w.cartela_id, 'cartela_nome', w.cartela_nome, 'cartela_tipo', w.cartela_tipo,
        'opcao_codigo', w.codigo, 'opcao_nome', w.opcao_nome,
        'fornecedor_id', w.fornecedor_id, 'fornecedor_nome', nullif(w.fornecedor_nome, ''),
        'valor_estimado', w.preco,
        'observacao', 'Escolhido pelo cliente na cartela ' || w.cartela_nome || ' para o pedido ' || p.numero_pedido
                      || '. Ainda não existe no Almoxarifado: vincule a um material ou cadastre um novo.');
      insert into compras_registros (empresa_id, tipo, numero, status, dados)
      values (p.empresa_id, 'necessidade', prox, 'aguardando_vinculo', doc);
    end loop;
  end if;

  -- o que não vale mais (pedido saiu de Reservado, trocou a opção, tirou a personalização) e ainda não foi comprado: cancela
  update compras_registros set status = 'cancelada',
         dados = dados || jsonb_build_object('motivo_cancelamento',
                   case when vale then 'O pedido ' || p.numero_pedido || ' não usa mais esta opção da cartela.'
                        else 'O pedido ' || p.numero_pedido || ' não está mais reservado.' end,
                   'cancelada_automatico', true),
         updated_at = now()
   where empresa_id = p.empresa_id and tipo = 'necessidade' and dados->>'origem' = 'cartela'
     and dados->>'pedido_id' = p.id::text
     and status in ('aguardando_vinculo', 'pendente')
     and coalesce((dados->>'quantidade_comprada')::numeric, 0) = 0
     and not ((dados->>'cartela_opcao_id')::uuid = any (vistos));
end $function$;

revoke all on function public.cartela_compras_sincronizar(uuid) from public, anon, authenticated;

-- Gatilho no pedido (nunca impede salvar)
create or replace function public.cartela_compras_gatilho()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE'
     and new.status_comercial is not distinct from old.status_comercial
     and new.observacoes->'projeto_comercial' is not distinct from old.observacoes->'projeto_comercial'
     and new.data_evento is not distinct from old.data_evento
     and new.data_evento_fim is not distinct from old.data_evento_fim
     and new.data_entrega is not distinct from old.data_entrega
     and new.encerrado_operacional_em is not distinct from old.encerrado_operacional_em then
    return new;
  end if;
  begin
    perform public.cartela_compras_sincronizar(new.id);
  exception when others then
    raise warning 'cartela_compras_sincronizar(%): %', new.id, sqlerrm;
  end;
  return new;
end $function$;

drop trigger if exists cartela_compras_pedido on public.separacoes_pedidos;
create trigger cartela_compras_pedido after insert or update on public.separacoes_pedidos
  for each row execute function public.cartela_compras_gatilho();

-- --------------------------------------------------------------------------------------------------
-- Cria um material na aba Produtos da planilha do Almoxarifado (mesmo formato do cadastro do Almoxarifado)
create or replace function public.almox_produto_criar_interno(p_empresa uuid, p_nome text, p_unidade text, p_categoria text, p_custo numeric, p_obs text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  pl constant text := '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI';
  cab jsonb; vals jsonb; ln int; novo_id text; cod text; maior int; agora text; i int; col text;
begin
  if p_empresa is distinct from public.gs_empresa_dona() then raise exception 'Almoxarifado indisponível para esta empresa.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do material.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('almox-produtos:' || pl, 0));
  select valores into cab from gs_linhas where planilha_id = pl and aba = 'Produtos' and linha = 1;
  if cab is null then raise exception 'Aba de materiais do Almoxarifado não encontrada.'; end if;

  -- código INS001, INS002... (o maior número que já existe + 1)
  select coalesce(max(nullif(regexp_replace(l.valores->>public.almox_col('Produtos', 'Codigo'), '\D', '', 'g'), '')::int)
                  filter (where l.valores->>public.almox_col('Produtos', 'Codigo') ~* '^INS\d+$'), 0)
    into maior from gs_linhas l where l.planilha_id = pl and l.aba = 'Produtos' and l.linha > 1;
  cod := 'INS' || lpad((maior + 1)::text, 3, '0');
  novo_id := 'PROD_' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
  agora := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  vals := '[]'::jsonb;
  for i in 0 .. jsonb_array_length(cab) - 1 loop
    col := cab->>i;
    vals := vals || jsonb_build_array(case col
      when 'ID' then to_jsonb(novo_id)
      when 'Codigo' then to_jsonb(cod)
      when 'Produto' then to_jsonb(left(trim(p_nome), 120))
      when 'Categoria' then to_jsonb(left(coalesce(trim(p_categoria), ''), 120))
      when 'Setor' then to_jsonb(''::text)
      when 'Unidade' then to_jsonb(upper(left(coalesce(nullif(trim(p_unidade), ''), 'UN'), 20)))
      when 'EstoqueAtual' then to_jsonb(0)
      when 'EstoqueMinimo' then to_jsonb(0)
      when 'ValorCusto' then to_jsonb(coalesce(p_custo, 0))
      when 'ValorReposicao' then to_jsonb(0)
      when 'Status' then to_jsonb('Ativo'::text)
      when 'Observacoes' then to_jsonb(left(coalesce(p_obs, ''), 1000))
      when 'CriadoEm' then to_jsonb(agora)
      when 'AtualizadoEm' then to_jsonb(agora)
      when 'EstoqueIdeal' then to_jsonb(0)
      else to_jsonb(''::text) end);
  end loop;

  select coalesce(max(linha), 1) + 1 into ln from gs_linhas where planilha_id = pl and aba = 'Produtos';
  insert into gs_linhas (planilha_id, aba, linha, valores) values (pl, 'Produtos', ln, vals);
  update gs_abas set versao = versao + 1, atualizado_em = now() where planilha_id = pl and nome = 'Produtos';
  return jsonb_build_object('id', novo_id, 'codigo', cod, 'nome', left(trim(p_nome), 120),
                            'unidade', upper(left(coalesce(nullif(trim(p_unidade), ''), 'UN'), 20)));
end $function$;

revoke all on function public.almox_produto_criar_interno(uuid, text, text, text, numeric, text) from public, anon, authenticated;

-- --------------------------------------------------------------------------------------------------
-- Compras: vincula a necessidade de cartela a um material do Almoxarifado (existente ou novo).
-- p_produto_id = material existente; ou p_novo = {nome, unidade, categoria, custo} para cadastrar.
-- Liga também a opção da cartela, para os próximos pedidos já reservarem.
create or replace function public.compras_cartela_vincular(p_empresa uuid, p_necessidade uuid, p_produto_id text default null, p_novo jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  n compras_registros; prod record; criado jsonb; mid text; mcod text; mnome text; mun text;
begin
  if auth.uid() is null or not public.eh_membro_empresa(p_empresa)
     or not public.funcionario_tabela_permitida(p_empresa, 'almoxarifado_compras', 'update') then
    raise exception 'Sem permissão para esta operação de Compras.' using errcode = '42501';
  end if;
  select * into n from compras_registros where id = p_necessidade and empresa_id = p_empresa and tipo = 'necessidade' for update;
  if not found or n.dados->>'origem' <> 'cartela' then raise exception 'Solicitação não encontrada.'; end if;
  if n.status not in ('aguardando_vinculo', 'pendente') then raise exception 'Esta solicitação não pode mais ser vinculada.'; end if;

  if coalesce(p_produto_id, '') <> '' then
    select * into prod from public.almox_produtos(p_empresa) a where a.id = p_produto_id;
    if prod.id is null then raise exception 'Material não encontrado no Almoxarifado.'; end if;
    mid := prod.id; mcod := prod.codigo; mnome := prod.produto; mun := prod.unidade;
  elsif jsonb_typeof(p_novo) = 'object' then
    criado := public.almox_produto_criar_interno(p_empresa, p_novo->>'nome', p_novo->>'unidade', p_novo->>'categoria',
                public.almox_num(p_novo->>'custo'),
                'Cadastrado pelo Compras a partir da cartela ' || coalesce(n.dados->>'cartela_nome', '') || ' (opção ' || coalesce(n.dados->>'opcao_codigo', '') || ').');
    mid := criado->>'id'; mcod := criado->>'codigo'; mnome := criado->>'nome'; mun := criado->>'unidade';
  else
    raise exception 'Escolha um material ou cadastre um novo.';
  end if;

  -- a opção da cartela passa a apontar para o material (vale para os próximos pedidos)
  update cartela_opcoes set almox_produto_id = mid, updated_at = now()
   where id = (n.dados->>'cartela_opcao_id')::uuid and empresa_id = p_empresa;

  -- esta e as outras solicitações abertas da mesma opção ficam ligadas ao material
  update compras_registros set status = 'pendente',
         dados = dados || jsonb_build_object('material_id', mid, 'material_codigo', mcod, 'material_nome', mnome, 'material_vinculado_cartela', true),
         updated_at = now()
   where empresa_id = p_empresa and tipo = 'necessidade' and dados->>'origem' = 'cartela'
     and dados->>'cartela_opcao_id' = n.dados->>'cartela_opcao_id'
     and status in ('aguardando_vinculo', 'pendente');

  return jsonb_build_object('ok', true, 'material_id', mid, 'material_codigo', mcod, 'material_nome', mnome, 'novo', criado is not null);
end $function$;

revoke all on function public.compras_cartela_vincular(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.compras_cartela_vincular(uuid, uuid, text, jsonb) to authenticated;

-- Lista de materiais do Almoxarifado para o vínculo (quem é de Compras)
create or replace function public.compras_almox_materiais(p_empresa uuid)
returns table(id text, codigo text, produto text, unidade text, estoque_atual numeric)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null or not public.eh_membro_empresa(p_empresa)
     or not public.funcionario_tabela_permitida(p_empresa, 'almoxarifado_compras', 'select') then return; end if;
  return query select a.id, a.codigo, a.produto, a.unidade, a.estoque_atual from public.almox_produtos(p_empresa) a
                where lower(coalesce(a.status, '')) <> 'inativo';
end $function$;

revoke all on function public.compras_almox_materiais(uuid) from public, anon;
grant execute on function public.compras_almox_materiais(uuid) to authenticated;
