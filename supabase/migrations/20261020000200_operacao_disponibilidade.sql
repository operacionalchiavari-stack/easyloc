-- Disponibilidade única (out/2026): a mesma regra que trava a reserva do pedido (operacao_validar_reserva) e a tela
-- Disponibilidade de Itens, numa data. Usada pelo catálogo e pela Helena (Edge Function catalogo-assistente), que antes
-- tinham uma conta própria: não abria o kit nos componentes, não descontava peças em avaria/manutenção nem peças que
-- ainda não voltaram, e ignorava o evento de vários dias.
--   total = estoque cadastrado (kit: conjuntos completos que o estoque dos componentes forma)
--   livre = total − manutenção − reservado nessa data − bloqueado (avaria/limpeza/manutenção aberta e peça fora do prazo)
begin;
create or replace function public.operacao_disponibilidade(p_empresa uuid, p_data date)
returns table(item_id uuid, total numeric, livre numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.eh_membro_empresa(p_empresa) then
    raise exception 'Sem acesso a esta empresa';
  end if;
  return query
  with reservas as (
    select s.item_id, s.quantidade_solicitada qtd
      from public.separacoes_itens s join public.separacoes_pedidos p on p.id = s.separacao_pedido_id
     where p.empresa_id = p_empresa and p.status_comercial in ('pre_reserva','aprovado','enviado','finalizado')
       and coalesce(p.status, '') <> 'cancelado' and p.encerrado_operacional_em is null
       and p_data between coalesce(p.data_entrega, p.data_evento) and coalesce(p.data_coleta, p.data_evento_fim, p.data_evento)
  ), pecas_reservadas as (
    select r.item_id, r.qtd from reservas r join public.itens i on i.id = r.item_id where coalesce(lower(i.tipo), '') <> 'kit'
    union all
    select k.item_id, r.qtd * k.quantidade from reservas r join public.itens i on i.id = r.item_id and lower(i.tipo) = 'kit'
      join public.kit_itens k on k.kit_id = i.id
    union all -- kit sem componentes cadastrados reserva o próprio kit
    select r.item_id, r.qtd from reservas r join public.itens i on i.id = r.item_id and lower(i.tipo) = 'kit'
     where not exists (select 1 from public.kit_itens k where k.kit_id = i.id)
  ), reservado as (
    select pr.item_id, sum(pr.qtd) qtd from pecas_reservadas pr group by pr.item_id
  ), bloqueado as (
    select b.item_id, sum(b.qtd) qtd from (
      select e.item_id, 1::numeric qtd from public.separacoes_etiquetas e join public.separacoes_pedidos p on p.id = e.separacao_pedido_id
       where p.empresa_id = p_empresa and e.lida_carregamento_em is not null and e.lida_retorno_em is null
         and coalesce(p.data_coleta, p.data_evento) < p_data
         and not exists (select 1 from public.operacao_ocorrencias o where o.pedido_id = p.id and o.codigo = e.codigo and o.tipo = 'falta' and o.resolucao like 'Perda confirmada:%')
      union all
      select o.item_id, o.quantidade from public.operacao_ocorrencias o
       where o.empresa_id = p_empresa and o.resolvida_em is null and o.tipo in ('avaria','limpeza','manutencao') and o.item_id is not null
    ) b group by b.item_id
  ), pecas as (
    select i.id, coalesce(i.estoque_total, 0)::numeric tot,
           greatest(0, coalesce(i.estoque_total, 0) - coalesce(i.estoque_manutencao, 0) - coalesce(r.qtd, 0) - coalesce(b.qtd, 0))::numeric liv
      from public.itens i left join reservado r on r.item_id = i.id left join bloqueado b on b.item_id = i.id
     where i.empresa_id = p_empresa
  ), kits as (
    select k.kit_id id, min(floor(pc.tot / nullif(k.quantidade, 0)))::numeric tot, min(floor(pc.liv / nullif(k.quantidade, 0)))::numeric liv
      from public.kit_itens k join pecas pc on pc.id = k.item_id
     where k.empresa_id = p_empresa
     group by k.kit_id
  )
  select pc.id, coalesce(kt.tot, pc.tot), coalesce(kt.liv, pc.liv)
    from pecas pc left join kits kt on kt.id = pc.id;
end $$;
revoke all on function public.operacao_disponibilidade(uuid, date) from public, anon;
grant execute on function public.operacao_disponibilidade(uuid, date) to authenticated, service_role;
commit;
