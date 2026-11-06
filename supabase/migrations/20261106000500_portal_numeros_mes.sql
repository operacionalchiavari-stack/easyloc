-- Início do Portal (nov/2026): "Nossos últimos números" lido do Supabase (o mural antigo lia a planilha do
-- Cronograma, que não é mais atualizada). Só a quantidade de eventos do mês: pedidos reservados
-- (aprovado/finalizado/enviado) com o evento no mês corrente, sem pedidos extras nem pedidos de teste.
create or replace function public.portal_numeros_mes(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; ini date := date_trunc('month', hoje)::date;
begin
  if p_empresa is null or not public.eh_membro_empresa(p_empresa) then
    raise exception 'Sem acesso.';
  end if;
  return jsonb_build_object('mes', to_char(ini, 'YYYY-MM'), 'eventos', (
    select count(*) from separacoes_pedidos p
     where p.empresa_id = p_empresa
       and p.status_comercial in ('aprovado','finalizado','enviado')
       and p.pedido_origem_id is null
       and p.data_evento >= ini and p.data_evento < (ini + interval '1 month')::date
       and coalesce(p.observacoes->>'teste_cronograma','') <> 'true'
       and coalesce(p.observacoes->>'teste_ia','') <> 'true'));
end $$;
revoke all on function public.portal_numeros_mes(uuid) from public, anon;
grant execute on function public.portal_numeros_mes(uuid) to authenticated;
