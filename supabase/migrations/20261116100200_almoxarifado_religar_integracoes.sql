-- Religa ao Almoxarifado novo (warehouse_materials) tudo o que lia a planilha antiga (16/11/2026).
-- Assinaturas e formatos mantidos: Produção, Personalização, Cartela, Compras e Recebimento continuam iguais.
-- ID do material = uuid em texto (as colunas produto_id/almox_produto_id continuam texto).

-- Materiais da planilha não existem mais: limpa referências antigas (o almoxarifado novo começa vazio).
delete from public.almox_fornecedor_produtos;
-- Personalizações/cartelas que apontavam para materiais da planilha (PROD_...) ficam como estão: sem material igual no
-- almoxarifado novo, não reservam nada até alguém escolher o material novo no cadastro da personalização/cartela.

create or replace function public.almox_produtos(p_empresa_id uuid)
returns table(id text, codigo text, produto text, categoria text, unidade text, estoque_atual numeric, estoque_minimo numeric, valor_custo numeric, status text)
language sql stable security definer set search_path to 'public' as $$
  select m.id::text, m.codigo, m.nome, m.categoria, m.unidade, m.quantidade_disponivel, m.estoque_minimo, m.valor_unitario,
         case when m.status = 'inativo' then 'Inativo' else 'Ativo' end
    from public.warehouse_materials m
   where m.empresa_id = p_empresa_id and (auth.uid() is null or public.eh_membro_empresa(p_empresa_id))
   order by m.nome
$$;

create or replace function public.almox_estoque_mover(p_empresa uuid, p_produto_id text, p_qtd numeric, p_tipo text, p_valor_unit numeric,
  p_origem text, p_responsavel text, p_fornecedor text, p_nota text, p_obs text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare m public.warehouse_materials; atual numeric; novo numeric; v_resp uuid;
begin
  if p_tipo not in ('entrada', 'saida') or coalesce(p_qtd, 0) <= 0 then raise exception 'Movimento de estoque inválido.'; end if;
  if auth.uid() is not null and not public.eh_membro_empresa(p_empresa) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select * into m from public.warehouse_materials where empresa_id = p_empresa and id::text = p_produto_id for update;
  if m.id is null then raise exception 'Material não encontrado no Almoxarifado.'; end if;
  atual := coalesce(m.quantidade_disponivel, 0);
  novo := case when p_tipo = 'entrada' then atual + p_qtd else atual - p_qtd end;
  if novo < 0 then raise exception 'Estoque insuficiente de % (tem %, precisa de %).', m.nome, trim_scale(atual), trim_scale(p_qtd); end if;
  update public.warehouse_materials set quantidade_disponivel = novo,
    valor_unitario = case when p_tipo = 'entrada' and coalesce(p_valor_unit, 0) > 0 then round(p_valor_unit, 4) else valor_unitario end,
    status = case when status = 'inativo' then status when novo <= 0 then 'sem saldo' when novo <= coalesce(estoque_minimo, 0) then 'abaixo do mínimo' else 'disponivel' end
   where id = m.id;
  begin v_resp := nullif(p_responsavel, '')::uuid; exception when others then v_resp := null; end;
  insert into public.warehouse_movements(empresa_id, material_id, tipo, quantidade, unidade, responsavel_id, responsavel_nome, origem, documento,
    observacao, estoque_anterior, estoque_atual, valor_unitario, valor_total, fornecedor, op_numero)
  values (p_empresa, m.id, p_tipo, p_qtd, m.unidade, coalesce(v_resp, auth.uid()),
    coalesce(public.almox_nome_func(coalesce(v_resp, auth.uid())), nullif(p_responsavel, '')),
    case upper(coalesce(p_origem, '')) when 'PRODUCAO' then 'producao' when 'COMPRA' then 'compra' when 'BLOQUEIO' then 'bloqueio_divergencia'
      when '' then 'sistema' else lower(p_origem) end,
    nullif(p_nota, ''), nullif(p_obs, ''), atual, novo, coalesce(nullif(p_valor_unit, 0), m.valor_unitario),
    round(coalesce(nullif(p_valor_unit, 0), m.valor_unitario, 0) * p_qtd, 2), nullif(p_fornecedor, ''),
    substring(coalesce(p_obs, '') from 'Pedido ([0-9]+)'));
  return jsonb_build_object('anterior', atual, 'atual', novo);
end $$;

create or replace function public.almox_produto_criar_interno(p_empresa uuid, p_nome text, p_unidade text, p_categoria text, p_custo numeric, p_obs text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare m public.warehouse_materials;
begin
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do material.'; end if;
  insert into public.warehouse_materials(empresa_id, codigo, nome, categoria, unidade, valor_unitario, observacoes, status)
  values (p_empresa, '', left(trim(p_nome), 120), nullif(left(coalesce(trim(p_categoria), ''), 120), ''),
    upper(left(coalesce(nullif(trim(p_unidade), ''), 'UN'), 20)), coalesce(p_custo, 0), nullif(left(coalesce(p_obs, ''), 1000), ''), 'disponivel')
  returning * into m;
  return jsonb_build_object('id', m.id::text, 'codigo', m.codigo, 'nome', m.nome, 'unidade', m.unidade);
end $$;

create or replace function public.almox_produto_editar(p_empresa uuid, p_produto_id text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare d jsonb := '{}'::jsonb; k text; v jsonb; t text;
begin
  if not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa, 'estoque.almoxarifado.movimentar') then
    raise exception 'Sem permissão para alterar o cadastro do material.' using errcode = '42501'; end if;
  if not exists (select 1 from public.warehouse_materials where empresa_id = p_empresa and id::text = p_produto_id) then
    raise exception 'Material não encontrado no Almoxarifado.'; end if;
  for k, v in select * from jsonb_each(coalesce(p_dados, '{}'::jsonb)) loop
    t := trim(coalesce(v #>> '{}', ''));
    if k in ('minimo', 'ideal', 'custo') and t like '%,%' then t := replace(replace(t, '.', ''), ',', '.'); end if;
    d := d || case k when 'categoria' then jsonb_build_object('categoria', t) when 'minimo' then jsonb_build_object('estoque_minimo', t)
      when 'ideal' then jsonb_build_object('estoque_ideal', t) when 'custo' then jsonb_build_object('valor_unitario', t)
      when 'observacoes' then jsonb_build_object('observacoes', t) when 'setor' then jsonb_build_object('grupo', t)
      when 'status' then jsonb_build_object('status', case when lower(t) = 'inativo' then 'inativo' else 'disponivel' end) else '{}'::jsonb end;
  end loop;
  perform public.warehouse_material_update_registration(p_produto_id::uuid, d);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.almox_produto_limites(p_empresa uuid, p_produto_id text, p_minimo numeric, p_ideal numeric) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa, 'estoque.almoxarifado.movimentar') then
    raise exception 'Sem permissão para alterar o estoque mínimo/ideal.' using errcode = '42501'; end if;
  if p_minimo is null or p_minimo < 0 or p_ideal is null or p_ideal < 0 then raise exception 'Informe mínimo e ideal (zero ou mais).'; end if;
  if p_ideal > 0 and p_ideal < p_minimo then raise exception 'O estoque ideal não pode ser menor que o mínimo.'; end if;
  update public.warehouse_materials set estoque_minimo = p_minimo, estoque_ideal = p_ideal where empresa_id = p_empresa and id::text = p_produto_id;
  if not found then raise exception 'Material não encontrado no Almoxarifado.'; end if;
  return jsonb_build_object('ok', true, 'aberta', exists (select 1 from almox_solicitacoes_compra where empresa_id = p_empresa and produto_id = p_produto_id and status = 'aberta'));
end $$;

-- Compra automática: mesma regra de antes, lendo o material novo.
create or replace function public.almox_avaliar_material(m public.warehouse_materials) returns void
language plpgsql security definer set search_path to 'public' as $$
declare pid text := m.id::text; atual numeric := coalesce(m.quantidade_disponivel, 0); minimo numeric := coalesce(m.estoque_minimo, 0);
  ideal numeric := coalesce(m.estoque_ideal, 0); qtd numeric; num bigint;
begin
  if atual > minimo then
    update almox_solicitacoes_compra set status = 'comprada', concluida_em = now(), concluida_por_nome = 'Automático (estoque reposto)', liberada = true, atualizado_em = now()
     where empresa_id = m.empresa_id and produto_id = pid and status = 'aberta';
    update almox_solicitacoes_compra set liberada = true, atualizado_em = now()
     where empresa_id = m.empresa_id and produto_id = pid and status <> 'aberta' and not liberada;
    return;
  end if;
  if not public.almox_compra_automatica_ligada(m.empresa_id) or m.status = 'inativo' or ideal <= 0 or ideal <= atual then return; end if;
  qtd := ideal - atual;
  if exists (select 1 from almox_solicitacoes_compra where empresa_id = m.empresa_id and produto_id = pid and status = 'aberta') then
    update almox_solicitacoes_compra set quantidade = qtd, estoque_no_pedido = atual, estoque_minimo = minimo, estoque_ideal = ideal, atualizado_em = now()
     where empresa_id = m.empresa_id and produto_id = pid and status = 'aberta' and (quantidade <> qtd or estoque_no_pedido is distinct from atual);
    return;
  end if;
  if exists (select 1 from almox_solicitacoes_compra where empresa_id = m.empresa_id and produto_id = pid and status <> 'aberta' and not liberada) then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('almox_compra:' || m.empresa_id::text, 0));
  select coalesce(max(numero), 0) + 1 into num from almox_solicitacoes_compra where empresa_id = m.empresa_id;
  insert into almox_solicitacoes_compra (empresa_id, numero, produto_id, codigo, produto, unidade, categoria, estoque_no_pedido, estoque_minimo, estoque_ideal, quantidade)
  values (m.empresa_id, num, pid, m.codigo, m.nome, m.unidade, m.categoria, atual, minimo, ideal, qtd) on conflict do nothing;
end $$;

create or replace function public.almox_avaliar_todos(p_empresa uuid) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare m public.warehouse_materials; n int := 0;
begin
  for m in select * from public.warehouse_materials where empresa_id = p_empresa loop perform public.almox_avaliar_material(m); n := n + 1; end loop;
  return n;
end $$;

create or replace function public.almox_gatilho_materiais() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' and new.quantidade_disponivel is not distinct from old.quantidade_disponivel and new.estoque_minimo is not distinct from old.estoque_minimo
     and new.estoque_ideal is not distinct from old.estoque_ideal and new.status is not distinct from old.status then return null; end if;
  begin perform public.almox_avaliar_material(new);
  exception when others then raise warning 'almox compra automática: %', sqlerrm; end;
  return null;
end $$;
create trigger almox_compra_automatica after insert or update on public.warehouse_materials
  for each row execute function public.almox_gatilho_materiais();
drop trigger if exists almox_compra_automatica on public.gs_linhas;

create or replace function public.almox_compra_config_salvar(p_empresa uuid, p_automatica boolean, p_edita_financeiro boolean default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare abertas int;
begin
  if not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa, 'configuracoes.empresa.editar') then
    raise exception 'Sem permissão para alterar os parâmetros.' using errcode = '42501'; end if;
  delete from almoxarifado_configuracoes where empresa_id = p_empresa and chave = 'compra_automatica';
  insert into almoxarifado_configuracoes (empresa_id, chave, valor) values (p_empresa, 'compra_automatica', to_jsonb(coalesce(p_automatica, false)));
  if p_edita_financeiro is not null then
    delete from almoxarifado_configuracoes where empresa_id = p_empresa and chave = 'recebimento_edita_financeiro';
    insert into almoxarifado_configuracoes (empresa_id, chave, valor) values (p_empresa, 'recebimento_edita_financeiro', to_jsonb(p_edita_financeiro));
  end if;
  if p_automatica then perform public.almox_avaliar_todos(p_empresa); end if;
  select count(*) into abertas from almox_solicitacoes_compra where empresa_id = p_empresa and status = 'aberta';
  return jsonb_build_object('automatica', coalesce(p_automatica, false), 'abertas', abertas,
    'edita_financeiro', public.almox_param(p_empresa, 'recebimento_edita_financeiro'));
end $$;

create or replace function public.almox_receb_completar_produtos(p_rec uuid) returns void
language sql security definer set search_path to 'public' as $$
  update almox_recebimento_itens i set produto_nome = m.nome, produto_codigo = m.codigo, unidade_interna = m.unidade
    from public.warehouse_materials m where i.recebimento_id = p_rec and i.produto_id is not null and m.id::text = i.produto_id
$$;

-- Memória do recebimento (produto da nota -> material) aparece na aba Vínculos de fornecedores.
create or replace function public.almox_fornecedor_produtos_espelhar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_mat uuid; r record;
begin
  begin v_mat := new.produto_id::uuid; exception when others then return null; end;
  if not exists (select 1 from public.warehouse_materials where id = v_mat and empresa_id = new.empresa_id) then return null; end if;
  select i.descricao_nf, i.unidade_nf, rc.fornecedor_nome into r from public.almox_recebimento_itens i join public.almox_recebimentos rc on rc.id = i.recebimento_id
   where rc.empresa_id = new.empresa_id and rc.fornecedor_cnpj = new.cnpj and i.codigo_fornecedor = new.codigo_fornecedor order by rc.created_at desc limit 1;
  insert into public.supplier_product_links(empresa_id, cnpj_fornecedor, codigo_fornecedor, material_id, fator_conversao, criado_por,
    descricao_fornecedor, unidade_fornecedor, unidade_interna, fornecedor_nome)
  values (new.empresa_id, regexp_replace(new.cnpj, '[^0-9]', '', 'g'), new.codigo_fornecedor, v_mat, new.fator_conversao, auth.uid(),
    r.descricao_nf, r.unidade_nf, (select unidade from public.warehouse_materials where id = v_mat), r.fornecedor_nome)
  on conflict (empresa_id, cnpj_fornecedor, codigo_fornecedor) do update set material_id = excluded.material_id, fator_conversao = excluded.fator_conversao,
    unidade_interna = excluded.unidade_interna, atualizado_em = now(),
    descricao_fornecedor = coalesce(excluded.descricao_fornecedor, supplier_product_links.descricao_fornecedor),
    unidade_fornecedor = coalesce(excluded.unidade_fornecedor, supplier_product_links.unidade_fornecedor),
    fornecedor_nome = coalesce(excluded.fornecedor_nome, supplier_product_links.fornecedor_nome);
  return null;
exception when others then
  raise warning 'vínculo de fornecedor: %', sqlerrm; return null;
end $$;
create trigger almox_fornecedor_produtos_espelhar after insert or update on public.almox_fornecedor_produtos
  for each row execute function public.almox_fornecedor_produtos_espelhar();

-- Editar o vínculo na aba também muda a memória que o recebimento usa.
create or replace function public.supplier_product_links_espelhar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  update public.almox_fornecedor_produtos f set produto_id = new.material_id::text, fator_conversao = new.fator_conversao, atualizado_em = now()
   where f.empresa_id = new.empresa_id and regexp_replace(f.cnpj, '[^0-9]', '', 'g') = new.cnpj_fornecedor and f.codigo_fornecedor = new.codigo_fornecedor
     and (f.produto_id is distinct from new.material_id::text or f.fator_conversao is distinct from new.fator_conversao);
  return null;
end $$;
create trigger supplier_product_links_espelhar after update on public.supplier_product_links
  for each row execute function public.supplier_product_links_espelhar();

-- Recebimento: conferir o material no almoxarifado novo
CREATE OR REPLACE FUNCTION public.almox_receb_salvar(p_empresa uuid, p_id uuid, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      if nullif(it->>'produto_id', '') is not null and not exists (select 1 from public.warehouse_materials wm
           where wm.empresa_id = p_empresa and wm.id::text = it->>'produto_id') then
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
end $function$
;
