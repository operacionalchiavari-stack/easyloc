insert into public.cronograma_logistico (
  empresa_id,
  pedido_id,
  numero_pedido,
  cliente_nome,
  local_nome,
  tipo_evento,
  data_evento,
  etapa,
  data_etapa,
  horario,
  observacao,
  origem,
  regras_snapshot,
  status
)
select
  p.empresa_id,
  p.id,
  p.numero_pedido,
  p.cliente_nome,
  p.local_nome,
  p.tipo_evento,
  p.data_evento::date,
  etapa.etapa,
  etapa.data_etapa,
  '08:00'::time,
  etapa.observacao,
  'pedido',
  jsonb_build_object(
    'carregamento_dias_antes_entrega', 1,
    'triagem_dias_antes_carregamento', 2,
    'montagem_dias_apos_entrega', 0,
    'desmontagem_dias_apos_coleta', 0,
    'triagem_retorno_dias_apos_coleta', 1,
    'hora_padrao', '08:00'
  ),
  'programado'
from public.separacoes_pedidos p
cross join lateral (
  values
    ('Triagem', (coalesce(p.data_entrega, p.data_evento)::date - interval '3 days')::date, 'Separacao previa do pedido.'),
    ('Carregamento', (coalesce(p.data_entrega, p.data_evento)::date - interval '1 day')::date, 'Carregamento conforme regra da empresa.'),
    ('Montagem', coalesce(p.data_entrega, p.data_evento)::date, 'Montagem conforme data de entrega.'),
    ('Evento', p.data_evento::date, 'Data do evento.'),
    ('Desmontagem', coalesce(p.data_coleta, p.data_evento)::date, 'Desmontagem conforme coleta.'),
    ('Triagem Retorno', (coalesce(p.data_coleta, p.data_evento)::date + interval '1 day')::date, 'Conferencia de retorno.')
) as etapa(etapa, data_etapa, observacao)
where p.data_evento is not null
  and coalesce(p.status_comercial, '') <> 'cancelado'
on conflict (pedido_id, etapa) do nothing;
