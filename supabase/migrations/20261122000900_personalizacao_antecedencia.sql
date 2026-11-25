-- Antecedência da personalização (22/11/2026): no cadastro da personalização, "Começar com quantos dias de antecedência".
-- "Necessário em" das compras de material = data do carregamento do pedido (cronograma; sem ele, a entrega) − esses dias
-- (com várias personalizações, vale a maior antecedência). Sem antecedência cadastrada: início da produção, senão entrega − 3.
alter table public.personalizacoes add column if not exists dias_antecedencia integer;
alter table public.personalizacoes drop constraint if exists personalizacoes_dias_antecedencia_chk;
alter table public.personalizacoes add constraint personalizacoes_dias_antecedencia_chk check (dias_antecedencia is null or dias_antecedencia between 0 and 365);

-- a antecedência não muda as etapas da produção: não pode marcar a Ordem de produção como "alterada"
create or replace function public.producao_cadastro_snapshot(p personalizacoes)
returns jsonb language sql immutable as $$
 select to_jsonb(p)-array['custo_hora','complexidade','margem','preco_manual_ativo','preco_manual','custo_total','preco_sugerido','dias_antecedencia'];
$$;

create or replace function public.pedido_data_material(p_pedido uuid, p_pers uuid[])
returns date language sql stable security definer set search_path to 'public' as $$
  select coalesce((select min(e.data) from operacao_etapas e where e.pedido_id = p_pedido and e.tipo = 'carregamento'),
                  (select coalesce(p.data_entrega, p.data_evento) from separacoes_pedidos p where p.id = p_pedido))
         - (select max(x.dias_antecedencia) from personalizacoes x where x.id = any (p_pers) and x.dias_antecedencia is not null)
$$;
revoke all on function public.pedido_data_material(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.producao_compras_sincronizar(p_empresa uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  mat record; d record; saldo numeric; falta numeric; n compras_registros; prox bigint; doc jsonb;
  ativos text[] := '{}';
begin
  if p_empresa is null then return; end if;
  if pg_try_advisory_xact_lock(hashtextextended('producao_compras:' || p_empresa::text, 0)) is false then
    perform pg_advisory_xact_lock(hashtextextended('producao_compras:' || p_empresa::text, 0));
  end if;
  for mat in
    select w.id::text as id, w.codigo, w.nome, w.unidade, greatest(coalesce(w.quantidade_disponivel, 0), 0) as disp
      from warehouse_materials w
     where w.empresa_id = p_empresa
       and exists (select 1 from producao_materiais m where m.empresa_id = p_empresa and m.produto_id = w.id::text)
  loop
    saldo := mat.disp;
    for d in
      select p.id as pedido_id, p.numero_pedido, p.cliente_nome, p.local_nome, coalesce(p.data_entrega, p.data_evento) as entrega,
             sum(greatest(m.necessario - coalesce(m.recebido, 0), 0)) as falta,
             (array_agg(t.origem->>'item_id' order by t.created_at))[1] as item_id,
             string_agg(distinct coalesce(t.origem->>'personalizacao_nome', ''), ', ') as personalizacao,
             string_agg(distinct e.setor, ', ') as setor,
             coalesce(public.pedido_data_material(p.id, array_agg(distinct nullif(t.origem->>'personalizacao_id', '')::uuid)),
                      min((e.inicio_previsto at time zone 'America/Sao_Paulo')::date)) as precisa_em
        from producao_materiais m
        join producao_etapas e on e.id = m.etapa_id and e.estado not in ('cancelada', 'concluida')
        join producao_itens t on t.id = e.producao_item_id and not t.cancelado
        join separacoes_pedidos p on p.id = t.pedido_id
       where m.empresa_id = p_empresa and m.produto_id = mat.id
         and p.status_comercial in ('aprovado', 'enviado', 'finalizado') and p.encerrado_operacional_em is null
         and coalesce(p.data_evento_fim, p.data_evento, current_date) >= current_date
         and coalesce(p.observacoes->>'teste_cronograma', '') <> 'true'
       group by p.id, p.numero_pedido, p.cliente_nome, p.local_nome, p.data_entrega, p.data_evento
      having sum(greatest(m.necessario - coalesce(m.recebido, 0), 0)) > 0
       order by coalesce(p.data_entrega, p.data_evento), p.numero_pedido
    loop
      falta := greatest(d.falta - saldo, 0);
      saldo := greatest(saldo - d.falta, 0);
      ativos := ativos || (d.pedido_id::text || '|' || mat.id);
      -- a mesma compra pode já existir: necessidade operacional ou a da cartela já ligada a este material
      select * into n from compras_registros
       where empresa_id = p_empresa and tipo = 'necessidade' and dados->>'origem' in ('op_faltando', 'cartela')
         and dados->>'pedido_id' = d.pedido_id::text and dados->>'material_id' = mat.id and status <> 'cancelada'
       order by (dados->>'origem' = 'cartela') desc, created_at desc limit 1 for update;
      if found then
        if n.status = 'pendente' and coalesce((n.dados->>'quantidade_comprada')::numeric, 0) = 0 then
          if falta > 0 then
            update compras_registros set dados = dados || jsonb_build_object('quantidade', falta, 'quantidade_faltante', falta,
                   'order_number', d.numero_pedido, 'cliente_nome', d.cliente_nome, 'local_nome', d.local_nome,
                   'item_id', d.item_id, 'personalizacao_nome', nullif(d.personalizacao, ''),
                   'data_necessidade', greatest(current_date, coalesce(d.precisa_em, d.entrega - 3)),
                   'estoque_almoxarifado', mat.disp), updated_at = now()
             where id = n.id;
          else
            update compras_registros set status = 'cancelada', dados = dados || jsonb_build_object('cancelada_automatico', true,
                   'motivo_cancelamento', 'O Almoxarifado já tem ' || mat.nome || ' suficiente para o pedido ' || d.numero_pedido || '.'),
                   updated_at = now() where id = n.id;
          end if;
        end if;
        continue;
      end if;
      if falta <= 0 then continue; end if;
      perform pg_advisory_xact_lock(hashtextextended('compras:' || p_empresa::text, 0));
      select coalesce(max(numero), 0) + 1 into prox from compras_registros where empresa_id = p_empresa and tipo = 'necessidade';
      doc := jsonb_build_object('origem', 'op_faltando', 'pcp_status', 'published',
        'solicitante_nome', 'Automático (pedido ' || d.numero_pedido || ')',
        'material_id', mat.id, 'material_codigo', mat.codigo, 'material_nome', mat.nome, 'unidade', coalesce(nullif(mat.unidade, ''), 'un'),
        'quantidade', falta, 'quantidade_faltante', falta, 'quantidade_comprada', 0, 'estoque_almoxarifado', mat.disp,
        'pedido_id', d.pedido_id, 'order_number', d.numero_pedido, 'cliente_nome', d.cliente_nome, 'local_nome', d.local_nome,
        'item_id', d.item_id, 'personalizacao_nome', nullif(d.personalizacao, ''), 'etapa_nome', initcap(coalesce(d.setor, 'Produção')),
        'data_necessidade', greatest(current_date, coalesce(d.precisa_em, d.entrega - 3)),
        'observacao', 'Falta no Almoxarifado para a personalização do pedido ' || d.numero_pedido || '.');
      insert into compras_registros (empresa_id, tipo, numero, status, dados) values (p_empresa, 'necessidade', prox, 'pendente', doc);
    end loop;
  end loop;
  -- pedido saiu de Reservado, trocou o material ou a personalização: cancela o que ainda não foi comprado
  update compras_registros set status = 'cancelada',
         dados = dados || jsonb_build_object('cancelada_automatico', true, 'motivo_cancelamento', 'O pedido ' || coalesce(dados->>'order_number', '') || ' não precisa mais deste material.'),
         updated_at = now()
   where empresa_id = p_empresa and tipo = 'necessidade' and dados->>'origem' = 'op_faltando' and status = 'pendente'
     and coalesce((dados->>'quantidade_comprada')::numeric, 0) = 0
     and not ((coalesce(dados->>'pedido_id', '') || '|' || coalesce(dados->>'material_id', '')) = any (ativos));
end $$;
revoke all on function public.producao_compras_sincronizar(uuid) from public, anon, authenticated;

create or replace function public.cartela_compras_sincronizar(p_pedido uuid)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  p separacoes_pedidos; vale boolean; w record; n compras_registros; prox bigint; doc jsonb; vistos uuid[] := '{}';
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
        select (it->>'personalizacao_id')::uuid as pers, it->>'item_id' as item_id, it->>'personalizacao_nome' as pers_nome,
               case when jsonb_typeof(it->'personalizacao_escolhas') = 'object' then it->'personalizacao_escolhas' else '{}'::jsonb end as escolhas,
               greatest(coalesce(public.almox_num(it->>'quantidade'), 0), 0) as qtd
          from ambs
          cross join lateral jsonb_array_elements(case when jsonb_typeof(ambs.a->'itens') = 'array' then ambs.a->'itens' else '[]'::jsonb end) it
         where coalesce(it->>'personalizacao_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
      select o.id as opcao_id, o.codigo, o.nome as opcao_nome, almox_material_valido(p.empresa_id, o.almox_produto_id) as material,
             c.id as cartela_id, c.nome as cartela_nome, c.tipo as cartela_tipo, c.unidade,
             c.fornecedor_id, coalesce(c.fornecedor_nome, '') as fornecedor_nome, o.preco,
             sum(l.qtd * pi.quantidade) as quantidade,
             (array_agg(l.item_id))[1] as item_id, string_agg(distinct coalesce(l.pers_nome, ''), ', ') as pers_nome, array_agg(distinct l.pers) as pers_ids
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
         and dados->>'pedido_id' = p.id::text and dados->>'cartela_opcao_id' = w.opcao_id::text and status <> 'cancelada'
       order by created_at desc limit 1 for update;
      if found then
        -- ainda sem material: acompanha a quantidade do pedido (ligada a um material, quem cuida é producao_compras_sincronizar)
        if n.status = 'aguardando_vinculo' and coalesce((n.dados->>'quantidade_comprada')::numeric, 0) = 0 then
          update compras_registros set dados = dados || jsonb_build_object('quantidade', w.quantidade, 'quantidade_faltante', w.quantidade,
                 'order_number', p.numero_pedido, 'cliente_nome', p.cliente_nome, 'local_nome', p.local_nome,
                 'item_id', w.item_id, 'personalizacao_nome', nullif(w.pers_nome, ''),
                 'data_necessidade', greatest(current_date, coalesce(public.pedido_data_material(p.id, w.pers_ids), (select min((e.inicio_previsto at time zone 'America/Sao_Paulo')::date) from producao_etapas e
                   join producao_itens t on t.id = e.producao_item_id where t.pedido_id = p.id and not t.cancelado
                    and e.estado not in ('cancelada', 'concluida')), coalesce(p.data_entrega, p.data_evento) - 3))), updated_at = now()
           where id = n.id;
        end if;
        continue;
      end if;
      -- opção ligada a um material que existe: a necessidade (se faltar estoque) é a operacional
      if w.material is not null then continue; end if;
      perform pg_advisory_xact_lock(hashtextextended('compras:' || p.empresa_id::text, 0));
      select coalesce(max(numero), 0) + 1 into prox from compras_registros where empresa_id = p.empresa_id and tipo = 'necessidade';
      doc := jsonb_build_object(
        'origem', 'cartela', 'pcp_status', 'published', 'solicitante_nome', 'Automático (pedido ' || p.numero_pedido || ')',
        'material_nome', trim(concat_ws(' ', w.cartela_tipo, nullif(w.codigo, ''), w.opcao_nome)) || case when w.fornecedor_nome <> '' then ' (' || w.fornecedor_nome || ')' else '' end,
        'descricao_item', trim(concat_ws(' ', w.cartela_tipo, nullif(w.codigo, ''), w.opcao_nome)) || ' · cartela ' || w.cartela_nome,
        'unidade', coalesce(nullif(w.unidade, ''), 'un'),
        'quantidade', w.quantidade, 'quantidade_faltante', w.quantidade, 'quantidade_comprada', 0,
        'data_necessidade', greatest(current_date, coalesce(public.pedido_data_material(p.id, w.pers_ids), (select min((e.inicio_previsto at time zone 'America/Sao_Paulo')::date) from producao_etapas e
                   join producao_itens t on t.id = e.producao_item_id where t.pedido_id = p.id and not t.cancelado
                    and e.estado not in ('cancelada', 'concluida')), coalesce(p.data_entrega, p.data_evento) - 3)),
        'pedido_id', p.id, 'pedido_numero', p.numero_pedido, 'pedido_cliente', p.cliente_nome,
        'order_number', p.numero_pedido, 'cliente_nome', p.cliente_nome, 'local_nome', p.local_nome,
        'item_id', w.item_id, 'personalizacao_nome', nullif(w.pers_nome, ''), 'etapa_nome', 'Personalização',
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

do $$ declare pid uuid; e uuid; begin
  for pid in select distinct pedido_id from producao_itens where not cancelado loop perform cartela_compras_sincronizar(pid); end loop;
  for e in select distinct empresa_id from producao_itens loop perform producao_compras_sincronizar(e); end loop;
end $$;
