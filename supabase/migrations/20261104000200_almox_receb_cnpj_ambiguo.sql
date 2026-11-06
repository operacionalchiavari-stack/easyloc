-- Nov/2026: a variável "cnpj" tinha o mesmo nome da coluna almox_fornecedor_produtos.cnpj e quebrava a memória de produtos
-- do fornecedor ao criar um recebimento ("column reference cnpj is ambiguous"). Só troca o nome da variável.
CREATE OR REPLACE FUNCTION public.almox_receb_criar(p_empresa uuid, p_dados jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p compras_registros; rid uuid; num bigint; nota jsonb := coalesce(p_dados->'nota', '{}'); it jsonb; ord int := 0;
  chave text; v_cnpj text; cnpj_ped text; origem text := p_dados->>'origem'; mem record; pit text; total numeric := 0;
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
  v_cnpj := nullif(regexp_replace(coalesce(nota->>'cnpj', ''), '\D', '', 'g'), '');
  cnpj_ped := nullif(regexp_replace(coalesce(p.dados->'fornecedor'->>'documento', ''), '\D', '', 'g'), '');
  if v_cnpj is not null and cnpj_ped is not null and v_cnpj <> cnpj_ped then
    raise exception 'A nota é de outro fornecedor (CNPJ %) — o pedido PC-% é de %.', nota->>'cnpj', lpad(p.numero::text, 6, '0'), coalesce(p.dados->>'fornecedor_nome', 'outro fornecedor');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('almox_receb:' || p_empresa::text, 0));
  select coalesce(max(numero), 0) + 1 into num from almox_recebimentos where empresa_id = p_empresa;
  insert into almox_recebimentos (empresa_id, numero, pedido_id, origem, etapa, chave_nfe, numero_nf, serie, emissao,
    fornecedor_nome, fornecedor_cnpj, valor_produtos, valor_outros, valor_total, duplicatas, observacao, criado_por_nome)
  values (p_empresa, num, p.id, origem, case when origem = 'manual' then 3 else 2 end, chave, trim(nota->>'numero'), nullif(trim(coalesce(nota->>'serie', '')), ''),
    coalesce(nullif(nota->>'emissao', '')::date, current_date),
    coalesce(nullif(nota->>'fornecedor', ''), p.dados->>'fornecedor_nome', p.dados->'fornecedor'->>'nome'), coalesce(v_cnpj, cnpj_ped),
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
       where m.empresa_id = p_empresa and m.cnpj = coalesce(v_cnpj, cnpj_ped, '') and m.codigo_fornecedor = coalesce(nullif(it->>'codigo_fornecedor', ''), '-');
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
end $function$;
