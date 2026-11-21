-- Dados de apoio do Almoxarifado novo (16/11/2026).

-- Itens de pedidos de compra emitidos em Compras que ainda não chegaram (coluna "Aguardando chegada").
create or replace function public.almox_aguardando_chegada() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare e uuid := public.almox_empresa();
begin
  if not (public.almox_tw_pode('Acessar almoxarifado') or public.almox_tw_pode('Acessar compras')) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', it->>'id', 'material_id', it->>'material_id', 'nome', coalesce(it->>'material_nome', it->>'descricao_item'),
      'unidade', it->>'unidade', 'quantidade', public.almox_num(it->>'quantidade'),
      'quantidade_recebida', public.almox_num(it->>'quantidade_recebida'),
      'pendente', greatest(public.almox_num(it->>'quantidade') - public.almox_num(it->>'quantidade_recebida'), 0),
      'purchase_order', jsonb_build_object('id', r.id, 'numero', r.numero, 'status', r.status, 'prazo_acordado', r.dados->>'prazo_acordado',
        'created_at', r.created_at, 'fornecedor', jsonb_build_object('trade_name', r.dados->>'fornecedor_nome'))))
    from public.compras_registros r
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r.dados->'items') = 'array' then r.dados->'items' else '[]'::jsonb end) it
   where r.empresa_id = e and r.tipo = 'pedido' and r.status in ('aguardando_recebimento', 'parcialmente_recebido', 'emitido', 'aprovado')
     and coalesce(it->>'material_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-'
     and public.almox_num(it->>'quantidade') > public.almox_num(it->>'quantidade_recebida')), '[]'::jsonb);
end $$;

-- Reservas de material das personalizações (pedidos reservados e em pré-reserva), no formato da tela.
create or replace function public.almox_reservas_tela() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare e uuid := public.almox_empresa();
begin
  if not public.almox_tw_pode('Acessar almoxarifado') then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.produto_id || ':' || (p->>'pedido_id'), 'material_id', r.produto_id,
      'status', case when p->>'tipo' = 'pre' then 'pre_reserva' else 'reservada' end,
      'quantidade_reservada', public.almox_num(p->>'quantidade'), 'quantidade_retirada', 0,
      'op_numero', p->>'numero', 'data_prevista_uso', p->>'data_evento',
      'production_order', jsonb_build_object('id', p->>'pedido_id', 'numero', p->>'numero', 'cliente', p->>'cliente', 'prazo', p->>'data_evento'),
      'budget_quote', jsonb_build_object('numero', p->>'numero', 'cliente_nome', p->>'cliente')))
    from public.almox_reservas_personalizacao(e) r
    cross join lateral jsonb_array_elements(coalesce(r.pedidos, '[]'::jsonb)) p
   where r.produto_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-' and public.almox_num(p->>'quantidade') > 0), '[]'::jsonb);
end $$;

-- Pedidos (o "OP" da Tecnoweld) para escolher na Saída/Retirada.
create or replace function public.almox_pedidos_abertos() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'numero', p.numero_pedido::text, 'peca_nome', p.cliente_nome, 'cliente', p.cliente_nome,
      'prazo', p.data_evento, 'status', p.status_comercial) order by p.data_evento), '[]'::jsonb)
    from public.separacoes_pedidos p
   where p.empresa_id = public.almox_empresa() and public.almox_tw_pode('Acessar almoxarifado')
     and p.status_comercial in ('pre_reserva', 'aprovado', 'finalizado', 'enviado')
     and coalesce(p.data_evento_fim, p.data_evento, current_date) >= current_date - 30
$$;
