-- Próximas saídas (16/11/2026, pedido do usuário: "para a pessoa do estoque se antecipar"): para cada dia de saída o item traz
-- os números daquele dia — total, manutenção, reservado (todos os pedidos que seguram a peça no dia, da entrega à coleta),
-- bloqueado (peças fora: aguardando retorno, triagem, reparo, avaria) com os motivos, e livre.
CREATE OR REPLACE FUNCTION public.acervo_proximas_saidas(p_empresa uuid, p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; fim date;
begin
  if not public.capas_pode(p_empresa) then raise exception 'Sem acesso à Gestão do acervo.' using errcode = '42501'; end if;
  fim := hoje + greatest(1, least(coalesce(p_dias, 30), 365));
  return (
    with lin as (select * from public.acervo_saidas_linhas(p_empresa, hoje, fim)),
    livre as (select * from public.operacao_livre_calc(p_empresa, hoje, fim, null)),
    bloq as (select public.acervo_itens_bloqueados(p_empresa) item_id),
    -- livre de cada item no próprio dia de saída (estoque − manutenção − bloqueadas − reservado naquele dia)
    livre_dia as (
      select x.item_id, jsonb_object_agg(x.dia::text, jsonb_build_object(
               'total', x.total, 'manutencao', x.manutencao, 'reservado', x.reservado, 'bloqueado', x.bloqueado, 'livre', x.livre,
               'fora', coalesce((select jsonb_agg(jsonb_build_object('motivo', b.motivo, 'quantidade', b.quantidade, 'pedido', sp.numero_pedido))
                                   from public.operacao_bloqueios_detalhe(p_empresa, x.dia) b
                                   left join separacoes_pedidos sp on sp.id = b.pedido_id
                                  where b.item_id = x.item_id), '[]'::jsonb))) livres
        from (select distinct l.data_saida dia from lin l) d
        cross join lateral (select lc.item_id, d.dia, lc.total, lc.manutencao, lc.reservado, lc.bloqueado, lc.livre
                              from public.operacao_livre_calc(p_empresa, d.dia, d.dia, null) lc
                             where lc.item_id in (select l2.item_id from lin l2 where l2.data_saida = d.dia)) x
       group by x.item_id
    ),
    por_item as (
      select l.item_id, sum(l.quantidade) saindo, min(l.data_saida) primeira,
             count(distinct l.pedido_id) n_pedidos,
             jsonb_agg(jsonb_build_object('pedido_id', l.pedido_id, 'numero', l.numero, 'cliente', l.cliente, 'data', l.data_saida,
                       'quantidade', l.quantidade, 'pre_reserva', l.status = 'pre_reserva', 'carregado', l.carregado,
                       'local', sp.local_nome, 'cliente_foto', ce.catalogo_logo_url)
                       order by l.data_saida, l.numero) pedidos,
             sum(l.quantidade) filter (where not l.carregado) a_carregar
        from lin l
        left join separacoes_pedidos sp on sp.id = l.pedido_id
        left join clientes_empresas ce on ce.id = sp.cliente_id
       group by l.item_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'item_id', i.id, 'nome', coalesce(i.descricao_total, i.produto), 'codigo', i.codigo, 'categoria', i.categoria,
      'largura', i.largura, 'altura', i.altura, 'profundidade', i.profundidade,
      'foto_url', i.foto_url, 'saindo', pi.saindo, 'a_carregar', coalesce(pi.a_carregar, 0), 'primeira', pi.primeira, 'n_pedidos', pi.n_pedidos, 'pedidos', pi.pedidos,
      'total', coalesce(lv.total, i.estoque_total, 0), 'manutencao', coalesce(lv.manutencao, 0), 'reservado', coalesce(lv.reservado, 0),
      'bloqueado', coalesce(lv.bloqueado, 0), 'livre', lv.livre, 'livre_dia', coalesce(ld.livres, '{}'::jsonb),
      'contagem_pendente', exists (select 1 from bloq where bloq.item_id = i.id),
      'capa', case when m.id is null then null else jsonb_build_object(
          'usa', m.usa_capa, 'tipo', coalesce(m.tipo_material, 'capa'), 'nome', m.nome, 'por_material', m.unidades_por_capa,
          'conferido', m.estoque_conferido_em is not null, 'custo', m.custo,
          'disponivel', (public.capas_saldo(m.id)->>'disponivel')::numeric,
          'precisa', (select sum(ceil(l2.quantidade / greatest(m.unidades_por_capa, 1)))
                        from lin l2 where l2.item_id = i.id and not l2.carregado)) end
    ) order by pi.primeira, coalesce(i.descricao_total, i.produto)), '[]')
    from por_item pi
    join itens i on i.id = pi.item_id
    left join livre lv on lv.item_id = pi.item_id
    left join livre_dia ld on ld.item_id = pi.item_id
    left join capas_modelos m on m.empresa_id = p_empresa and m.item_id = pi.item_id
  );
end $function$;
