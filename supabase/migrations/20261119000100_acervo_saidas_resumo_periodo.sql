-- Resumo mensal e detalhe diário usam a mesma disponibilidade de pedidos e do acervo.
-- O saldo sem limitar a zero permite distinguir falta de peças de estoque sem folga.
begin;

create or replace function public.acervo_saidas_disponibilidade(
  p_empresa uuid, p_inicio date, p_fim date, p_itens uuid[], p_por_dia boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  resultado jsonb;
begin
  if not public.capas_pode(p_empresa) then
    raise exception 'Sem acesso à Gestão do acervo.' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio
     or p_inicio < hoje or p_fim > hoje + 365 then
    raise exception 'Escolha um período entre hoje e os próximos 365 dias.' using errcode = '22023';
  end if;
  -- O detalhe é aberto por mês. Evita uma resposta diária de um ano inteiro.
  if p_por_dia and p_fim - p_inicio > 31 then
    raise exception 'O detalhe diário aceita até 32 dias.' using errcode = '22023';
  end if;

  with selecionados as materialized (
    select i.id, public.acervo_item_bloqueado(p_empresa, i.id) contagem_pendente
      from public.itens i where i.empresa_id = p_empresa and i.id = any(p_itens)
  ), periodos as (
    select greatest(p_inicio, d::date) de,
           least(p_fim, case when p_por_dia then d::date else (d + interval '1 month - 1 day')::date end) ate
      from generate_series(
        case when p_por_dia then p_inicio::timestamp else date_trunc('month', p_inicio::timestamp) end,
        p_fim::timestamp, case when p_por_dia then interval '1 day' else interval '1 month' end
      ) d
     where exists (select 1 from selecionados)
  ), calculos as materialized (
    select s.id item_id, p.de, p.ate, lc.total, lc.manutencao, lc.reservado, lc.bloqueado,
           case when s.contagem_pendente then 0
                else lc.total - lc.manutencao - lc.reservado - lc.bloqueado end livre,
           s.contagem_pendente
      from periodos p cross join lateral public.operacao_livre_calc(p_empresa, p.de, p.ate, null) lc
      join selecionados s on s.id = lc.item_id
  ), por_item as (
    select c.item_id, jsonb_agg(jsonb_build_object(
      'de', c.de, 'ate', c.ate, 'total', c.total, 'manutencao', c.manutencao,
      'reservado', c.reservado, 'bloqueado', c.bloqueado, 'livre', c.livre,
      'contagem_pendente', c.contagem_pendente
    ) order by c.de) periodos from calculos c group by c.item_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'periodos', periodos)), '[]'::jsonb)
    into resultado from por_item;
  return resultado;
end $$;

revoke all on function public.acervo_saidas_disponibilidade(uuid,date,date,uuid[],boolean) from public, anon;
grant execute on function public.acervo_saidas_disponibilidade(uuid,date,date,uuid[],boolean) to authenticated;

commit;
