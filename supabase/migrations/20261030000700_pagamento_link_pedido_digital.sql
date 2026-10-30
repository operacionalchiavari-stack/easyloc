-- Pedido digital (30/out/2026): o link do pedido mostra o pedido inteiro (ambientes, fotos, itens, serviços e
-- resumo) e, no final, os pagamentos. Mesmas fontes da prévia do pedido na Central: ambientes e renderizações de
-- observacoes.projeto_comercial; item do pedido fora dos ambientes vai para "Outros itens"; valores de observacoes.valores.
-- Só sai dado do próprio pedido, e só depois de conferir o código (pagamento_link_abrir).
create or replace function public.pagamento_link_pedido(p_pedido uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p separacoes_pedidos%rowtype; v_dados jsonb; v_lista jsonb; v_amb jsonb := '[]'::jsonb; a jsonb; v_itens jsonb; v_soltos jsonb; v_ids text[]; v_end text; v_foto text; v_val jsonb;
begin
  select * into p from separacoes_pedidos where id = p_pedido;
  if not found then return null; end if;
  v_dados := coalesce(p.observacoes->'projeto_comercial'->'dados', '{}'::jsonb);
  v_val := coalesce(p.observacoes->'valores', '{}'::jsonb);
  v_lista := case when jsonb_typeof(v_dados->'ambientes') = 'array' then v_dados->'ambientes' else '[]'::jsonb end;

  for a in select * from jsonb_array_elements(v_lista) loop
    select coalesce(jsonb_agg(jsonb_build_object(
             'nome', coalesce(nullif(i.descricao_total, ''), nullif(trim(coalesce(i.produto_base, '') || ' ' || coalesce(i.produto, '')), ''), l.linha->>'nome', 'Item'),
             'foto', i.foto_url, 'largura', i.largura, 'altura', i.altura, 'profundidade', i.profundidade,
             'quantidade', l.qtd, 'preco', i.valor_locacao, 'reposicao', i.valor_reposicao,
             'observacao', nullif(l.linha->>'observacao', ''),
             'personalizacao', case when nullif(l.linha->>'personalizacao_id', '') is not null then coalesce(pz.tipo, l.linha->>'personalizacao_nome', 'Personalização') end,
             'personalizacao_escolhas', l.linha->'personalizacao_escolhas',
             'personalizacao_valor', case when nullif(l.linha->>'personalizacao_id', '') is not null then nullif(l.linha->>'personalizacao_valor', '')::numeric end
           ) order by l.ord), '[]'::jsonb) into v_itens
      from (select x.linha, x.ord, coalesce(nullif(x.linha->>'quantidade', '')::numeric, 1) qtd
              from jsonb_array_elements(case when jsonb_typeof(a->'itens') = 'array' then a->'itens' else '[]'::jsonb end) with ordinality x(linha, ord)) l
      left join itens i on i.id = nullif(l.linha->>'item_id', '')::uuid and i.empresa_id = p.empresa_id
      left join personalizacoes pz on pz.id = nullif(l.linha->>'personalizacao_id', '')::uuid;
    v_amb := v_amb || jsonb_build_object('nome', coalesce(a->>'nome', 'Ambiente'), 'notas', nullif(a->>'notas', ''), 'itens', v_itens,
      'imagens', coalesce((select jsonb_agg(jsonb_build_object('url', r->>'url', 'jogos', greatest(1, coalesce(nullif(r->>'jogos', '')::int, 1))))
                             from jsonb_array_elements(case when jsonb_typeof(a->'renders') = 'array' then a->'renders' else '[]'::jsonb end) r
                            where nullif(r->>'url', '') is not null), '[]'::jsonb));
  end loop;

  -- itens do pedido que não estão em nenhum ambiente
  select coalesce(array_agg(li->>'item_id'), '{}') into v_ids
    from jsonb_array_elements(v_lista) ad, jsonb_array_elements(case when jsonb_typeof(ad->'itens') = 'array' then ad->'itens' else '[]'::jsonb end) li;
  select coalesce(jsonb_agg(jsonb_build_object('nome', coalesce(nullif(i.descricao_total, ''), s.nome_linha, 'Item'), 'foto', coalesce(i.foto_url, s.foto),
           'largura', i.largura, 'altura', i.altura, 'profundidade', i.profundidade, 'quantidade', s.qtd, 'preco', i.valor_locacao, 'reposicao', i.valor_reposicao)), '[]'::jsonb) into v_soltos
    from (select si.item_id, max(si.item_nome) nome_linha, max(si.foto_url) foto, sum(si.quantidade_solicitada) qtd
            from separacoes_itens si
           where si.separacao_pedido_id = p_pedido and si.item_id is not null and not (si.item_id::text = any(v_ids))
           group by si.item_id) s
    left join itens i on i.id = s.item_id;
  if jsonb_array_length(v_soltos) > 0 then
    v_amb := v_amb || jsonb_build_object('nome', case when jsonb_array_length(v_amb) > 0 then 'Outros itens' else 'Itens do pedido' end, 'notas', null, 'itens', v_soltos, 'imagens', '[]'::jsonb);
  end if;

  if p.local_id is not null then
    select trim(both ', ' from coalesce(l.endereco, '') || case when nullif(l.numero_endereco, '') is not null and position(l.numero_endereco in coalesce(l.endereco, '')) = 0 then ', ' || l.numero_endereco else '' end)
      into v_end from locais_empresas l where l.id = p.local_id;
  end if;
  select c.catalogo_logo_url into v_foto from clientes_empresas c where c.empresa_id = p.empresa_id and c.nome_razao = p.cliente_nome limit 1;

  return jsonb_build_object(
    'tipo_evento', p.tipo_evento, 'status', p.status_comercial, 'pre_reserva_ate', p.pre_reserva_ate,
    'local', p.local_nome, 'endereco', nullif(v_end, ''),
    'data_entrega', p.data_entrega, 'hora_entrega', p.observacoes->>'horario_entrega',
    'data_coleta', p.data_coleta, 'hora_coleta', p.observacoes->>'horario_coleta',
    'cliente_foto', case when v_foto ~* '^https?:' then v_foto end,
    'ambientes', v_amb,
    'servicos', coalesce((select jsonb_agg(jsonb_build_object('nome', s->>'nome', 'quantidade', s->'quantidade', 'valor', s->'valor', 'data', s->>'data', 'hora', s->>'hora'))
                            from jsonb_array_elements(case when jsonb_typeof(v_dados->'servicos') = 'array' then v_dados->'servicos' else '[]'::jsonb end) s), '[]'::jsonb),
    'valores', jsonb_build_object('locacao', v_val->'locacao', 'frete', v_val->'frete', 'montagem', v_val->'montagem', 'total', coalesce(v_val->'total', to_jsonb(p.valor_total))));
end $$;
revoke all on function public.pagamento_link_pedido(uuid) from public, anon, authenticated;

create or replace function public.pagamento_link_abrir(p_slug text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; p record; e record; v_itens jsonb;
begin
  v := pagamento_link_conferir(p_slug, p_pin);
  if v ? 'erro' then return v; end if;
  select numero_pedido, cliente_nome, data_evento, data_evento_fim into p from separacoes_pedidos where id = (v->>'pedido_id')::uuid;
  select nome, logo_url into e from empresas where id = (v->>'empresa_id')::uuid;
  select coalesce(jsonb_agg((i || jsonb_build_object('pix', (
           select jsonb_build_object('qr_code', g.qr_code, 'qr_code_base64', g.qr_code_base64, 'expira_em', g.expires_at, 'valor', g.amount)
             from payment_gateway_payments g
            where g.receber_id = (i->>'id')::uuid and g.paid_at is null and g.cancelled_at is null
              and g.status in ('pending', 'in_process') and (g.expires_at is null or g.expires_at > now() + interval '1 minute')
            order by g.created_at desc limit 1))) - 'conta_id' order by (i->>'numero')::int), '[]'::jsonb)
    into v_itens from jsonb_array_elements(pagamento_link_itens((v->>'pedido_id')::uuid)) i;
  return jsonb_build_object('ok', true,
    'empresa', jsonb_build_object('nome', e.nome, 'logo_url', e.logo_url),
    'pedido', jsonb_build_object('numero', p.numero_pedido, 'cliente', p.cliente_nome, 'data_evento', p.data_evento, 'data_evento_fim', p.data_evento_fim),
    'detalhe', pagamento_link_pedido((v->>'pedido_id')::uuid),
    'pagamentos', v_itens);
end $$;
