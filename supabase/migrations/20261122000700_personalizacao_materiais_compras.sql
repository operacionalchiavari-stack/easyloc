-- Materiais de itens personalizados → Almoxarifado → Compras (22/11/2026). Revisão pedida pelo usuário: "coloquei estante
-- pintada no pedido, não gerou necessidade operacional; vinculei e nada aconteceu".
-- Erros achados:
--  1) a opção da cartela "Tinta branca" apontava para um material que não existe mais (id DEMO-SISTEMA-… do almoxarifado
--     antigo). A compra automática da cartela pulava a opção ("já tem material") e a Produção ficava com um material fantasma.
--  2) ligar o material depois (na cartela ou no cadastro da personalização) não chegava à Ordem de produção já montada:
--     producao_materiais.produto_id só era preenchido ao montar a ordem.
--  3) nada gerava "necessidade operacional": quando o material existe mas o Almoxarifado não tem o suficiente para os
--     pedidos reservados, ninguém pedia a compra.
-- Correções:
--  a) almox_material_valido(): só vale vínculo com material que existe; vínculos mortos são apagados.
--  b) producao_materiais_revincular(): material ainda não entregue passa a apontar para o vínculo atual (cartela/cadastro).
--  c) producao_compras_sincronizar(): por material, soma o que falta entregar dos pedidos reservados (do mais próximo ao
--     mais distante) contra o saldo do Almoxarifado; a diferença vira necessidade operacional (origem op_faltando) por
--     pedido + material; se o estoque passa a cobrir e ainda não foi comprada, ela é cancelada sozinha.
--  d) cartela_compras_sincronizar(): vínculo morto conta como "sem material"; a necessidade leva pedido, cliente, local,
--     item e personalização (aparece em Necessidades operacionais); depois de ligada, quem cuida da quantidade é (c).
--  e) gatilhos: materiais da produção, saldo do Almoxarifado, vínculo da cartela e do cadastro de personalização.

create or replace function public.almox_material_valido(p_empresa uuid, p_id text)
returns text language sql stable security definer set search_path to 'public' as $$
  select w.id::text from warehouse_materials w
   where w.empresa_id = p_empresa and w.id::text = nullif(btrim(coalesce(p_id, '')), '')
$$;
revoke all on function public.almox_material_valido(uuid, text) from public, anon, authenticated;

-- (a) vínculos mortos
update cartela_opcoes o set almox_produto_id = null
 where o.almox_produto_id is not null and almox_material_valido(o.empresa_id, o.almox_produto_id) is null;
-- (o cadastro da personalização exige material nos insumos fixos: vínculo morto ali fica, e a Produção o trata como "sem vínculo")

-- (b) material ainda não entregue segue o vínculo atual
create or replace function public.producao_materiais_revincular(p_empresa uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  with novo as (
    select m.id,
           coalesce(almox_material_valido(p_empresa, pi.almox_produto_id), almox_material_valido(p_empresa, op.almox_produto_id)) as prod,
           coalesce(op.nome, pi.material_nome, pi.cartela_tipo, m.nome) as nome
      from producao_materiais m
      join producao_etapas e on e.id = m.etapa_id
      join producao_itens t on t.id = e.producao_item_id and not t.cancelado
      join personalizacoes_insumos pi on pi.id::text = m.chave and pi.empresa_id = p_empresa
      left join cartela_opcoes op on op.empresa_id = p_empresa
            and op.id::text = t.origem->'personalizacao_escolhas'->pi.cartela_tipo->>'opcao_id'
     where m.empresa_id = p_empresa and coalesce(m.recebido, 0) = 0 and e.estado not in ('cancelada', 'concluida')
  )
  update producao_materiais m set produto_id = novo.prod, nome = novo.nome
    from novo
   where m.id = novo.id and (m.produto_id is distinct from novo.prod or m.nome is distinct from novo.nome);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.producao_materiais_revincular(uuid) from public, anon, authenticated;

-- (c) necessidades operacionais
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
             min(e.inicio_previsto)::date as precisa_em
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
             where id = n.id and (dados->>'quantidade_faltante')::numeric is distinct from falta or dados->>'item_id' is null;
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

-- (d) compra da cartela: vínculo morto = sem material; leva os dados do pedido e do item
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
             (array_agg(l.item_id))[1] as item_id, string_agg(distinct coalesce(l.pers_nome, ''), ', ') as pers_nome
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
                 'data_necessidade', greatest(current_date, coalesce(p.data_entrega, p.data_evento) - 3)), updated_at = now()
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
        'data_necessidade', greatest(current_date, coalesce(p.data_entrega, p.data_evento) - 3),
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

-- (e) gatilhos
create or replace function public.producao_compras_gatilho_materiais()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare e uuid;
begin
  for e in select distinct empresa_id from producao_itens where not cancelado loop
    begin perform producao_compras_sincronizar(e);
    exception when others then raise warning 'Compras da produção (%): %', e, sqlerrm; end;
  end loop;
  return null;
end $$;
drop trigger if exists producao_compras_materiais on public.producao_materiais;
create trigger producao_compras_materiais after insert or update or delete on public.producao_materiais
  for each statement execute function public.producao_compras_gatilho_materiais();

create or replace function public.producao_compras_gatilho_saldo()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.quantidade_disponivel is distinct from old.quantidade_disponivel
     and exists (select 1 from producao_materiais m where m.produto_id = new.id::text) then
    begin perform producao_compras_sincronizar(new.empresa_id);
    exception when others then raise warning 'Compras da produção (saldo): %', sqlerrm; end;
  end if;
  return null;
end $$;
drop trigger if exists producao_compras_saldo on public.warehouse_materials;
create trigger producao_compras_saldo after update of quantidade_disponivel on public.warehouse_materials
  for each row execute function public.producao_compras_gatilho_saldo();

-- vínculo da cartela ou do cadastro mudou: a Ordem de produção acompanha e a compra é refeita
create or replace function public.producao_vinculo_mudou()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare emp uuid := coalesce(new.empresa_id, old.empresa_id); pid uuid;
begin
  begin
    if tg_table_name = 'cartela_opcoes' then
      -- ligada na própria cartela: a compra que esperava o vínculo passa a ser deste material (não duplica)
      if almox_material_valido(emp, new.almox_produto_id) is not null then
        update compras_registros c set status = 'pendente',
               dados = c.dados || jsonb_build_object('material_id', w.id::text, 'material_codigo', w.codigo, 'material_nome', w.nome,
                                                     'material_vinculado_cartela', true),
               updated_at = now()
          from warehouse_materials w
         where w.id::text = new.almox_produto_id and c.empresa_id = emp and c.tipo = 'necessidade'
           and c.dados->>'origem' = 'cartela' and c.dados->>'cartela_opcao_id' = new.id::text
           and c.status in ('aguardando_vinculo', 'pendente') and coalesce((c.dados->>'quantidade_comprada')::numeric, 0) = 0;
      end if;
    end if;
    -- só depois de ligar a compra da cartela: revincular dispara a conta das necessidades operacionais
    perform producao_materiais_revincular(emp);
    if tg_table_name = 'cartela_opcoes' then
      for pid in select distinct t.pedido_id from producao_itens t where t.empresa_id = emp and not t.cancelado loop
        perform cartela_compras_sincronizar(pid);
      end loop;
    end if;
    perform producao_compras_sincronizar(emp);
  exception when others then raise warning 'Vínculo de material da produção: %', sqlerrm; end;
  return null;
end $$;
drop trigger if exists producao_vinculo_cartela on public.cartela_opcoes;
create trigger producao_vinculo_cartela after update of almox_produto_id on public.cartela_opcoes
  for each row when (new.almox_produto_id is distinct from old.almox_produto_id) execute function public.producao_vinculo_mudou();
drop trigger if exists producao_vinculo_insumo on public.personalizacoes_insumos;
create trigger producao_vinculo_insumo after update of almox_produto_id on public.personalizacoes_insumos
  for each row when (new.almox_produto_id is distinct from old.almox_produto_id) execute function public.producao_vinculo_mudou();

-- a atualização da tela (Produção/Almoxarifado) também revincula e refaz as compras
create or replace function public.producao_atualizar(p_empresa uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare p record;
begin
 if not eh_membro_empresa(p_empresa) or not (operacao_pode(p_empresa,'producao.ordens.visualizar') or operacao_pode(p_empresa,'estoque.almoxarifado.visualizar') or operacao_pode(p_empresa,'configuracoes.empresa.editar')) then raise exception 'Sem acesso' using errcode='42501';end if;
 for p in select id from separacoes_pedidos where empresa_id=p_empresa and
  ((coalesce(data_coleta,data_evento)>=current_date and status_comercial in ('pre_reserva','aprovado','enviado','finalizado'))
   or id in(select pedido_id from producao_itens where empresa_id=p_empresa and not cancelado)) order by id
 loop perform producao_sincronizar(p.id);end loop;
 perform producao_materiais_revincular(p_empresa);
 perform producao_compras_sincronizar(p_empresa);
end $function$;

-- aplica agora em tudo o que existe
do $$ declare e uuid; pid uuid; begin
  for e in select distinct empresa_id from producao_itens loop
    perform producao_materiais_revincular(e);
  end loop;
  for pid in select distinct pedido_id from producao_itens where not cancelado loop
    perform cartela_compras_sincronizar(pid);
  end loop;
  for e in select distinct empresa_id from producao_itens loop
    perform producao_compras_sincronizar(e);
  end loop;
end $$;
