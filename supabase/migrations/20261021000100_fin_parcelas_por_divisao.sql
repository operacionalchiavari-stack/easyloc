-- Financeiro do pedido separado por divisão (out/2026, pedido do usuário: "os pagamentos não podem ficar unificados,
-- precisam ficar separados igual em contas a receber"). A tela do pedido agora programa as parcelas de Locação, Frete e
-- Montagem em blocos próprios e cada parcela de observacoes.parcelas_financeiras leva "componente". Cada uma vira
-- exatamente uma conta a receber daquela divisão (parcela = posição dentro da divisão), sem rateio.
-- Parcelas sem "componente" (pedidos salvos antes) continuam como antes: cada parcela é rateada pelos três valores.
-- O PIX recebido pelo gateway vale para a conta da própria parcela (antes: rateado entre as partes da parcela).
begin;
create or replace function public.fin_sincronizar_pedido(p_pedido uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  p separacoes_pedidos%rowtype; cfg fin_config%rowtype;
  v_total numeric; v_frete numeric; v_mont numeric; v_loc numeric; v_val jsonb;
  v_parc jsonb; v_n int; v_i int; v_pv numeric; v_venc date; v_forma text; v_receb numeric; v_baixa_em date;
  v_partes jsonb := '[]'; v_por_comp boolean; v_comp text; v_pos jsonb := '{}'; v_qtd jsonb := '{}';
  v_valores numeric[]; v_comps text[] := array['locacao','frete','montagem']; v_k int; v_parte numeric;
  v_alvos text[] := '{}'; v_x jsonb; v_id uuid; v_conta uuid; v_cat uuid; v_count int := 0;
  v_ja numeric; v_dif numeric; v_aberto numeric; v_conta_b uuid;
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
  v_por_comp := exists (select 1 from jsonb_array_elements(v_parc) x where x->>'componente' in ('locacao','frete','montagem'));

  -- 1) monta a lista de contas a receber que o pedido pede (uma por parcela de cada divisão)
  if v_por_comp then
    for v_i in 0 .. v_n - 1 loop
      v_comp := coalesce(nullif(v_parc->v_i->>'componente', ''), 'locacao');
      if v_comp not in ('locacao','frete','montagem') then v_comp := 'locacao'; end if;
      if coalesce(nullif(v_parc->v_i->>'valor','')::numeric, 0) > 0 then
        v_qtd := jsonb_set(v_qtd, array[v_comp], to_jsonb(coalesce((v_qtd->>v_comp)::int, 0) + 1));
      end if;
    end loop;
  end if;
  for v_i in 0 .. v_n - 1 loop
    v_pv := coalesce(nullif(v_parc->v_i->>'valor','')::numeric, 0);
    if v_pv <= 0 then continue; end if;
    v_venc := coalesce(nullif(left(v_parc->v_i->>'vencimento', 10), '')::date, p.data_evento, current_date);
    v_forma := nullif(v_parc->v_i->>'metodo', '');
    v_receb := greatest(coalesce(nullif(v_parc->v_i->>'valor_recebido','')::numeric, 0), coalesce(nullif(v_parc->v_i->>'recebido','')::numeric, 0), coalesce(nullif(v_parc->v_i->>'baixado','')::numeric, 0));
    v_baixa_em := coalesce(nullif(left(v_parc->v_i->>'baixado_em', 10), '')::date, current_date);
    if v_por_comp then
      v_comp := coalesce(nullif(v_parc->v_i->>'componente', ''), 'locacao');
      if v_comp not in ('locacao','frete','montagem') then v_comp := 'locacao'; end if;
      v_pos := jsonb_set(v_pos, array[v_comp], to_jsonb(coalesce((v_pos->>v_comp)::int, 0) + 1));
      v_partes := v_partes || jsonb_build_object('comp', v_comp, 'parcela', (v_pos->>v_comp)::int, 'parcelas', (v_qtd->>v_comp)::int,
        'valor', v_pv, 'venc', v_venc, 'forma', v_forma, 'receb', v_receb, 'baixa_em', v_baixa_em);
    else
      v_valores := array[round(v_pv * v_loc / v_total, 2), round(v_pv * v_frete / v_total, 2), 0];
      v_valores[3] := v_pv - v_valores[1] - v_valores[2];
      for v_k in 1 .. 3 loop
        if v_valores[v_k] <= 0 then continue; end if;
        v_partes := v_partes || jsonb_build_object('comp', v_comps[v_k], 'parcela', v_i + 1, 'parcelas', v_n,
          'valor', v_valores[v_k], 'venc', v_venc, 'forma', v_forma, 'receb', round(v_receb * v_valores[v_k] / v_pv, 2), 'baixa_em', v_baixa_em);
      end loop;
    end if;
  end loop;

  -- 2) cria ou atualiza cada conta a receber (só o que ainda não teve recebimento muda de valor/vencimento)
  for v_x in select * from jsonb_array_elements(v_partes) loop
    v_comp := v_x->>'comp'; v_parte := (v_x->>'valor')::numeric; v_venc := (v_x->>'venc')::date; v_forma := v_x->>'forma';
    v_alvos := v_alvos || ((v_x->>'parcela') || ':' || v_comp);
    v_conta := case v_comp when 'locacao' then cfg.conta_locacao when 'frete' then cfg.conta_frete else cfg.conta_montagem end;
    v_cat := fin_categoria(p.empresa_id, v_comp);
    select id into v_id from fin_receber where pedido_id = p.id and origem = 'pedido' and parcela = (v_x->>'parcela')::int and componente = v_comp and status <> 'cancelado';
    if v_id is null then
      insert into fin_receber(empresa_id, origem, grupo, pedido_id, pedido_numero, componente, cliente_id, cliente_nome, documento, descricao, emissao, competencia, vencimento, valor, parcela, parcelas, forma, conta_id, categoria_id, observacoes)
      values (p.empresa_id, 'pedido', p.id, p.id, p.numero_pedido, v_comp, p.cliente_id, p.cliente_nome, p.numero_pedido,
              case v_comp when 'locacao' then 'Locação' when 'frete' then 'Frete' else 'Montagem' end || ' · ' || coalesce(p.tipo_evento, 'Evento'),
              current_date, coalesce(p.data_evento, v_venc), v_venc, v_parte, (v_x->>'parcela')::int, (v_x->>'parcelas')::int, v_forma, v_conta, v_cat, 'Gerado pelo pedido')
      returning id into v_id;
      v_count := v_count + 1;
    else
      update fin_receber set valor = case when recebido = 0 then v_parte else valor end,
             vencimento = case when recebido = 0 then v_venc else vencimento end,
             parcelas = (v_x->>'parcelas')::int, pedido_numero = p.numero_pedido, cliente_id = p.cliente_id, cliente_nome = p.cliente_nome,
             forma = coalesce(v_forma, forma), competencia = coalesce(p.data_evento, competencia),
             conta_id = case when conta_manual then conta_id else coalesce(v_conta, conta_id) end
       where id = v_id;
    end if;

    -- 3) PIX recebido pelo gateway nesta parcela → baixa na própria conta
    v_receb := coalesce((v_x->>'receb')::numeric, 0);
    if v_receb > 0 then
      select coalesce(sum(b.valor), 0) into v_ja from fin_baixas b where b.receber_id = v_id and b.origem = 'gateway' and b.estornado_em is null;
      v_dif := round(v_receb - v_ja, 2);
      select aberto, coalesce(cfg.conta_gateway, conta_id) into v_aberto, v_conta_b from fin_receber where id = v_id;
      v_dif := least(v_dif, coalesce(v_aberto, 0));
      if v_dif > 0.005 and v_conta_b is not null then
        perform fin_baixar_(p.empresa_id, 'receber', v_id, (v_x->>'baixa_em')::date, v_dif, 0, 0, 0, 0, v_conta_b, 'PIX', 'PIX recebido pelo gateway', 'gateway', null);
      end if;
    end if;
  end loop;

  -- contas que o pedido não pede mais (parcelas mudaram) e não tiveram recebimento
  update fin_receber set status = 'cancelado', cancelado_em = now(), cancelamento_motivo = 'Parcela do pedido alterada'
   where pedido_id = p.id and origem = 'pedido' and status <> 'cancelado' and recebido = 0
     and not ((parcela::text || ':' || componente) = any (v_alvos));
  return v_count;
end $$;
revoke all on function public.fin_sincronizar_pedido(uuid) from public, anon, authenticated;
commit;
