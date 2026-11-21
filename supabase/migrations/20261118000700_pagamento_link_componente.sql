-- Link do pedido: cada pagamento diz o que é (Locação 1/2, Frete, Montagem) em vez de "Pagamento N".
create or replace function public.pagamento_link_itens(p_pedido uuid)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'numero', r.n, 'vencimento', r.vencimento, 'valor', r.valor, 'aberto', r.aberto,
           'componente', r.componente, 'parcela', r.parcela, 'parcelas', r.parcelas,
           'situacao', case when r.status = 'recebido' or r.aberto <= 0.005 then 'pago'
                            when r.vencimento < current_date then 'vencido'
                            when r.recebido > 0 then 'parcial' else 'aberto' end,
           'pagavel', exists (select 1 from payment_gateway_connections g where g.empresa_id = r.empresa_id and g.conta_id = r.conta_id and g.status = 'conectado'),
           'conta_id', r.conta_id) order by r.n), '[]'::jsonb)
    from (select x.*, row_number() over (order by x.vencimento, case x.componente when 'locacao' then 1 when 'frete' then 2 when 'montagem' then 3 else 4 end, x.parcela) n
            from fin_receber x where x.pedido_id = p_pedido and x.origem = 'pedido' and x.status <> 'cancelado') r
$function$;
