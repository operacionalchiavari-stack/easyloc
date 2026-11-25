-- App do Freteiro (23/11/2026, pedido do usuário): o freteiro vê só o nº do pedido e o endereço, sem o nome do cliente.
create or replace function public.frete_lanc_json(l frete_lancamentos) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', l.id, 'data', l.data, 'origem', l.origem, 'destino', l.destino, 'caminhao', l.caminhao, 'veiculo_id', l.veiculo_id, 'origem_lat', l.origem_lat, 'origem_lng', l.origem_lng, 'destino_lat', l.destino_lat, 'destino_lng', l.destino_lng, 'valor', l.valor, 'extras', l.extras,
    'total', frete_lanc_total(l), 'observacao', l.observacao, 'situacao', l.situacao, 'divergencia', l.divergencia,
    'tipo', l.origem_lanc, 'explicacao', l.explicacao, 'explicacao_em', l.explicacao_em, 'decisao_motivo', l.decisao_motivo,
    'valor_final', l.valor_final, 'decidido', l.decisao_em is not null,
    'pedido_id', l.pedido_id, 'direcao', l.direcao,
    'pedido', (select jsonb_build_object('numero', p.numero_pedido) from separacoes_pedidos p where p.id = l.pedido_id))
$$;
revoke all on function public.frete_lanc_json(frete_lancamentos) from public, anon, authenticated;

create or replace function public.frete_lanc_app(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a date; b date; cfg jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select p.ini, p.fim into a, b from frete_periodo_aberto(f) p;
  select frete_periodo into cfg from empresa_logistica_regras where empresa_id = f.empresa_id;
  return jsonb_build_object('veiculos', frete_veiculos_lista(f),
    'periodo', jsonb_build_object('ini', a, 'fim', b, 'tipo', coalesce(cfg->>'tipo', 'semanal'), 'pode_enviar', hoje >= b),
    'opcoes', coalesce((select jsonb_agg(jsonb_build_object('pedido_id', o.pedido_id, 'numero', o.numero, 'local', o.local_nome,
        'endereco', o.endereco, 'direcao', o.direcao, 'data', o.data)) from frete_lanc_opcoes(f.empresa_id, a, b) o), '[]'),
    'rascunhos', coalesce((select jsonb_agg(frete_lanc_json(l) order by l.data, l.created_at) from frete_lancamentos l where l.freteiro_id = f.id and l.situacao = 'rascunho'), '[]'),
    'relatorios', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'ini', r.periodo_ini, 'fim', r.periodo_fim, 'status', r.status, 'enviado_em', r.enviado_em,
        'total', r.total_informado,
        'pendentes', (select count(*) from frete_lancamentos l where l.relatorio_id = r.id and l.situacao = 'divergente'),
        'lancamentos', coalesce((select jsonb_agg(frete_lanc_json(l) order by l.data, l.created_at) from frete_lancamentos l where l.relatorio_id = r.id), '[]'))
        order by r.periodo_ini desc) from frete_relatorios r where r.freteiro_id = f.id and r.enviado_em > now() - interval '180 days'), '[]'));
end $$;
grant execute on function public.frete_lanc_app(text) to anon, authenticated;

notify pgrst, 'reload schema';
