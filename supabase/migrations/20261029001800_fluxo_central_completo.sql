-- Fluxo da Central de Pedidos com todas as etapas (pedido do usuário, out/2026): Comercial, Triagem, Carregamento,
-- Entrega, Coleta, Descarregamento, Triagem (volta), Posição final, Pós-venda, Finalizado.
-- Pós-venda: depois da posição final confirmada, até a ligação do pós-venda que cobre o pedido ser concluída
-- (ou marcada sem contato / dispensada). Finalizado: posição final confirmada + pós-venda feito + nada em aberto.
create or replace function public.comercial_fluxo_pedidos(p_empresa uuid, p_pedidos uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_pode(p_empresa, auth.uid(), 'comercial.pedidos.visualizar') then raise exception 'Sem permissão para consultar o fluxo'; end if;
  if coalesce(cardinality(p_pedidos), 0) > 500 then raise exception 'Consulte até 500 pedidos por vez'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'etapa', x.etapa,
           'operacao_concluida', x.op_ok, 'financeiro_pendente', x.aberto, 'posicao_final', x.pf,
           'posvenda_feita', x.pv, 'finalizado', x.pf and x.pv and not x.aberto)), '[]')
    into r
    from (
      select p.id, pedido_fluxo_etapa(p) etapa,
             (p.operacao->'retorno'->>'concluido_em' is not null and p.operacao->'descarregamento'->>'concluido_em' is not null) op_ok,
             exists (select 1 from fin_receber t where t.pedido_id = p.id and t.status <> 'cancelado' and t.aberto > 0) aberto,
             exists (select 1 from fin_posicoes_finais f where f.pedido_id = p.id and f.status = 'confirmado') pf,
             exists (select 1 from posvenda_contato_pedidos cp join posvenda_contatos c on c.id = cp.contato_id
                      where cp.pedido_id = p.id and c.status in ('concluido', 'sem_contato', 'dispensado')) pv
        from separacoes_pedidos p where p.empresa_id = p_empresa and p.id = any(p_pedidos)) x;
  return r;
end $$;
