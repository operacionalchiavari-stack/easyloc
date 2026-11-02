-- Financeiro vê a pré-reserva como previsão (01/11/2026, pedido do usuário).
-- A pré-reserva não gera contas a receber (só o "Reservado" gera). Esta função devolve as parcelas que o
-- Comercial programou no pedido, para A receber e o calendário mostrarem com o selo "Pré-reserva",
-- sem cobrança, sem link de PIX e sem baixa.
create or replace function public.fin_previsao_pre_reservas(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem acesso ao financeiro'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'pedido_id', p.id, 'pedido_numero', p.numero_pedido, 'cliente_nome', p.cliente_nome, 'data_evento', p.data_evento,
      'pre_reserva_ate', p.pre_reserva_ate, 'valor_pedido', p.valor_total,
      'componente', coalesce(x->>'componente', 'locacao'), 'parcela', coalesce(x->>'numero', x->>'tipo'),
      'valor', coalesce(nullif(x->>'valor', '')::numeric, 0), 'vencimento', nullif(x->>'vencimento', ''), 'forma', x->>'metodo')
      order by nullif(x->>'vencimento', ''), p.numero_pedido)
    from separacoes_pedidos p, jsonb_array_elements(coalesce(p.observacoes->'parcelas_financeiras', '[]'::jsonb)) x
    where p.empresa_id = p_empresa and p.status_comercial = 'pre_reserva' and coalesce(p.status, '') <> 'cancelado'
      and coalesce(nullif(x->>'valor', '')::numeric, 0) > 0), '[]'::jsonb);
end $$;
revoke all on function public.fin_previsao_pre_reservas(uuid) from public, anon;
grant execute on function public.fin_previsao_pre_reservas(uuid) to authenticated;
