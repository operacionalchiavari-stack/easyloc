-- Pedido digital igual ao PDF (30/out/2026): a página do link desenha o MESMO documento do pedido (pedidoPreviewHtml,
-- layout em pé), então o banco devolve os dados no formato que esse código usa (o mesmo da Central de Pedidos), só com
-- os campos necessários. A planta é montada no navegador da equipe: a cópia pronta fica em pagamento_links.plantas,
-- gravada quando a aba Pedido é aberta (pagamento_link_plantas_salvar).
alter table public.pagamento_links add column if not exists plantas jsonb not null default '[]'::jsonb;

create or replace function public.pagamento_link_plantas_salvar(p_empresa uuid, p_pedido uuid, p_plantas jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (operacao_pode(p_empresa, 'comercial.pedidos.visualizar') or operacao_pode(p_empresa, 'financeiro.fluxo.visualizar')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if jsonb_typeof(p_plantas) <> 'array' then raise exception 'Plantas inválidas'; end if;
  if length(p_plantas::text) > 3000000 then return; end if; -- grande demais: fica a cópia anterior
  insert into pagamento_links(pedido_id, empresa_id, pin, criado_por, plantas)
  select p_pedido, p_empresa, pagamento_link_pin(), auth.uid(), p_plantas
    where exists (select 1 from separacoes_pedidos where id = p_pedido and empresa_id = p_empresa)
  on conflict (pedido_id) do update set plantas = excluded.plantas, updated_at = now();
end $$;
revoke all on function public.pagamento_link_plantas_salvar(uuid, uuid, jsonb) from public, anon;
grant execute on function public.pagamento_link_plantas_salvar(uuid, uuid, jsonb) to authenticated;

create or replace function public.pagamento_link_pedido(p_pedido uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p separacoes_pedidos%rowtype; v_dados jsonb; v_lista jsonb; v_amb jsonb := '[]'::jsonb; a jsonb; v_itens jsonb; v_soltos jsonb; v_ids text[]; v_end text; v_foto text;
begin
  select * into p from separacoes_pedidos where id = p_pedido;
  if not found then return null; end if;
  v_dados := coalesce(p.observacoes->'projeto_comercial'->'dados', '{}'::jsonb);
  v_lista := case when jsonb_typeof(v_dados->'ambientes') = 'array' then v_dados->'ambientes' else '[]'::jsonb end;

  for a in select * from jsonb_array_elements(v_lista) loop
    select coalesce(jsonb_agg(jsonb_build_object(
             'item_id', l.linha->>'item_id', 'quantidade', l.linha->'quantidade', 'nome', l.linha->>'nome', 'observacao', l.linha->>'observacao',
             'personalizacao_id', l.linha->>'personalizacao_id', 'personalizacao_nome', coalesce(pz.tipo, l.linha->>'personalizacao_nome'),
             'personalizacao_valor', l.linha->'personalizacao_valor', 'personalizacao_escolhas', l.linha->'personalizacao_escolhas') order by l.ord), '[]'::jsonb) into v_itens
      from jsonb_array_elements(case when jsonb_typeof(a->'itens') = 'array' then a->'itens' else '[]'::jsonb end) with ordinality l(linha, ord)
      left join personalizacoes pz on pz.id = nullif(l.linha->>'personalizacao_id', '')::uuid;
    v_amb := v_amb || jsonb_build_object('id', a->>'id', 'nome', a->>'nome', 'notas', a->>'notas', 'itens', v_itens,
      'renders', coalesce((select jsonb_agg(jsonb_build_object('url', r->>'url', 'origem', r->>'origem', 'jogos', r->'jogos'))
                             from jsonb_array_elements(case when jsonb_typeof(a->'renders') = 'array' then a->'renders' else '[]'::jsonb end) r
                            where nullif(r->>'url', '') is not null), '[]'::jsonb));
  end loop;

  -- item do pedido fora dos ambientes: "Outros itens" (pedido antigo: "Itens do pedido")
  select coalesce(array_agg(li->>'item_id'), '{}') into v_ids
    from jsonb_array_elements(v_lista) ad, jsonb_array_elements(case when jsonb_typeof(ad->'itens') = 'array' then ad->'itens' else '[]'::jsonb end) li;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', s.item_id, 'quantidade', s.qtd, 'nome', s.nome)), '[]'::jsonb) into v_soltos
    from (select si.item_id, max(si.item_nome) nome, sum(si.quantidade_solicitada) qtd from separacoes_itens si
           where si.separacao_pedido_id = p_pedido and si.item_id is not null and not (si.item_id::text = any(v_ids)) group by si.item_id) s;
  if jsonb_array_length(v_soltos) > 0 then
    v_amb := v_amb || jsonb_build_object('id', 'outros', 'nome', case when jsonb_array_length(v_amb) > 0 then 'Outros itens' else 'Itens do pedido' end, 'itens', v_soltos, 'renders', '[]'::jsonb);
  end if;

  if p.local_id is not null then
    select trim(both ', ' from coalesce(l.endereco, '') || case when nullif(l.numero_endereco, '') is not null and position(l.numero_endereco in coalesce(l.endereco, '')) = 0 then ', ' || l.numero_endereco else '' end)
      into v_end from locais_empresas l where l.id = p.local_id;
  end if;
  select c.catalogo_logo_url into v_foto from clientes_empresas c where c.empresa_id = p.empresa_id and c.nome_razao = p.cliente_nome limit 1;

  return jsonb_build_object(
    'nome', p.cliente_nome, 'numero', p.numero_pedido, 'status', p.status_comercial, 'pre_reserva_ate', p.pre_reserva_ate,
    'data_evento', p.data_evento, 'data_evento_fim', p.data_evento_fim, 'data_entrega', p.data_entrega, 'data_coleta', p.data_coleta,
    'hora_entrega', p.observacoes->>'horario_entrega', 'hora_coleta', p.observacoes->>'horario_coleta',
    'local', p.local_nome, 'endereco', nullif(v_end, ''), 'cliente_foto', case when v_foto ~* '^https?:' then v_foto end,
    'valor_total', p.valor_total, 'valores', p.observacoes->'valores',
    'ambientes', v_amb,
    'servicos', coalesce((select jsonb_agg(jsonb_build_object('nome', s->>'nome', 'quantidade', s->'quantidade', 'valor', s->'valor', 'data', s->>'data', 'hora', s->>'hora'))
                            from jsonb_array_elements(case when jsonb_typeof(v_dados->'servicos') = 'array' then v_dados->'servicos' else '[]'::jsonb end) s), '[]'::jsonb),
    'cadastro', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'produto', i.produto, 'produto_base', i.produto_base, 'descricao_total', i.descricao_total, 'foto_url', i.foto_url,
                 'referencia', i.referencia, 'codigo', i.codigo, 'categoria', i.categoria, 'largura', i.largura, 'altura', i.altura, 'profundidade', i.profundidade,
                 'valor_locacao', i.valor_locacao, 'valor_reposicao', i.valor_reposicao))
                 from itens i where i.empresa_id = p.empresa_id and i.id::text in (
                   select x->>'item_id' from jsonb_array_elements(v_amb) am, jsonb_array_elements(am->'itens') x)), '[]'::jsonb),
    'plantas', (select l.plantas from pagamento_links l where l.pedido_id = p_pedido));
end $$;
revoke all on function public.pagamento_link_pedido(uuid) from public, anon, authenticated;
