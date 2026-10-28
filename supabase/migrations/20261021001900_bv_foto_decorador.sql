create or replace function public.fin_bv_extrato(p_empresa uuid, p_cliente uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare clientes jsonb; pedidos jsonb; pagamentos jsonb;
begin
  if not public.eh_membro_empresa(p_empresa) or not public.fin_pode(p_empresa,'financeiro.fluxo.visualizar') then
    raise exception 'Sem permissão para ver o extrato de BV' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.nome_razao),'[]') into clientes from
    (select c.id,c.nome_razao,c.catalogo_logo_url,c.bv_recebe,c.bv_percentual from clientes_empresas c where c.empresa_id=p_empresa
      and (c.bv_recebe or exists(select 1 from fin_bv_comissoes b where b.empresa_id=p_empresa and b.cliente_id=c.id and b.percentual>0))) c;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.data_evento desc nulls last,x.numero_pedido desc),'[]') into pedidos from (
    select p.id,p.numero_pedido,p.cliente_id,p.cliente_nome,p.data_evento,p.status_comercial,
      coalesce(b.base_locacao,fin_bv_base(p.observacoes,p.valor_total)) base_locacao,
      b.percentual,b.valor,coalesce(t.pago,0) pago,
      case when b.ativo and t.status<>'cancelado' then coalesce(t.aberto,0) else 0 end saldo,
      b.pagar_id,t.status status_pagamento,coalesce(b.ativo,false) ativo,
      case when b.pedido_id is not null then 'registrado' else 'sem_registro' end registro
    from separacoes_pedidos p join clientes_empresas c on c.id=p.cliente_id and c.empresa_id=p.empresa_id
    left join fin_bv_comissoes b on b.pedido_id=p.id and b.empresa_id=p.empresa_id
    left join fin_pagar t on t.id=b.pagar_id and t.empresa_id=p.empresa_id
    where p.empresa_id=p_empresa and (p_cliente is null or p.cliente_id=p_cliente)
      and (c.bv_recebe or b.percentual>0)) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.data desc,x.created_at desc),'[]') into pagamentos from (
    select f.id,f.pagar_id,f.data,f.valor,f.liquido,f.forma,f.observacoes,f.estornado_em,f.estorno_motivo,
      f.created_at,c.nome conta,p.numero_pedido,b.cliente_id,cl.nome_razao cliente_nome
    from fin_baixas f join fin_bv_comissoes b on b.pagar_id=f.pagar_id and b.empresa_id=f.empresa_id
    join separacoes_pedidos p on p.id=b.pedido_id and p.empresa_id=b.empresa_id
    join clientes_empresas cl on cl.id=b.cliente_id and cl.empresa_id=b.empresa_id
    left join fin_contas c on c.id=f.conta_id and c.empresa_id=f.empresa_id
    where f.empresa_id=p_empresa and (p_cliente is null or b.cliente_id=p_cliente)) x;
  return jsonb_build_object('clientes',clientes,'pedidos',pedidos,'pagamentos',pagamentos);
end $$;
