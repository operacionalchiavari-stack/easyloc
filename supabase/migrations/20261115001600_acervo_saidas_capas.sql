-- 15/11/2026: Material de proteção com custo, perdas contabilizadas para a equipe da desmontagem,
-- aviso de capas na Triagem e aba "Próximas saídas" da Gestão do acervo.

-- 1) custo de cada capa/caixa (para medir em reais o que se perde)
alter table public.capas_modelos add column if not exists custo numeric not null default 0;
alter table public.capas_modelos drop constraint if exists capas_modelos_custo_check;
alter table public.capas_modelos add constraint capas_modelos_custo_check check (custo >= 0);

create or replace function public.material_protecao_custo(p_empresa uuid, p_item uuid, p_custo numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r jsonb;
begin
  if not public.capas_pode(p_empresa, true) then raise exception 'Sem permissão para alterar o material de proteção.' using errcode = '42501'; end if;
  if p_custo is null or p_custo < 0 then raise exception 'Informe um custo válido.'; end if;
  update capas_modelos set custo = round(p_custo, 2), atualizado_em = now()
   where empresa_id = p_empresa and item_id = p_item returning to_jsonb(capas_modelos) into r;
  if r is null then raise exception 'Configure o material de proteção do item antes do custo.'; end if;
  return r;
end $function$;
revoke all on function public.material_protecao_custo(uuid, uuid, numeric) from public, anon;
grant execute on function public.material_protecao_custo(uuid, uuid, numeric) to authenticated;

-- 2) linhas que saem do galpão: pedidos reservados/pré-reserva com saída (entrega) no período, kits abertos nas peças
create or replace function public.acervo_saidas_linhas(p_empresa uuid, p_de date, p_ate date)
returns table(pedido_id uuid, numero text, cliente text, data_saida date, status text, carregado boolean, item_id uuid, quantidade numeric)
language sql
stable security definer
set search_path to 'public'
as $function$
  with ped as (
    select p.id, p.numero_pedido::text numero, p.cliente_nome, coalesce(p.data_entrega, p.data_evento) data_saida, p.status_comercial,
           (p.operacao->'carregamento'->>'concluido_em') is not null carregado
      from separacoes_pedidos p
     where p.empresa_id = p_empresa
       and p.status_comercial in ('pre_reserva', 'aprovado', 'finalizado', 'enviado')
       and coalesce(p.data_entrega, p.data_evento) between p_de and p_ate
       and p.encerrado_operacional_em is null
  ), lin as (
    select ped.*, si.item_id, si.quantidade_solicitada q, i.tipo
      from ped join separacoes_itens si on si.separacao_pedido_id = ped.id
      join itens i on i.id = si.item_id
     where coalesce(si.quantidade_solicitada, 0) > 0
  )
  select id, numero, cliente_nome, data_saida, status_comercial, carregado, item_id, sum(q)
    from (select id, numero, cliente_nome, data_saida, status_comercial, carregado, item_id, q from lin where lower(coalesce(tipo, '')) <> 'kit'
          union all
          select lin.id, lin.numero, lin.cliente_nome, lin.data_saida, lin.status_comercial, lin.carregado, ki.item_id, lin.q * ki.quantidade
            from lin join kit_itens ki on ki.kit_id = lin.item_id
           where lower(coalesce(lin.tipo, '')) = 'kit') x
   group by 1, 2, 3, 4, 5, 6, 7
$function$;
revoke all on function public.acervo_saidas_linhas(uuid, date, date) from public, anon, authenticated;

-- 3) Gestão do acervo > Próximas saídas: item a item, tudo que sai do galpão nos próximos N dias
create or replace function public.acervo_proximas_saidas(p_empresa uuid, p_dias integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; fim date;
begin
  if not public.capas_pode(p_empresa) then raise exception 'Sem acesso à Gestão do acervo.' using errcode = '42501'; end if;
  fim := hoje + greatest(1, least(coalesce(p_dias, 30), 365));
  return (
    with lin as (select * from public.acervo_saidas_linhas(p_empresa, hoje, fim)),
    livre as (select * from public.operacao_livre_calc(p_empresa, hoje, fim, null)),
    bloq as (select public.acervo_itens_bloqueados(p_empresa) item_id),
    por_item as (
      select l.item_id, sum(l.quantidade) saindo, min(l.data_saida) primeira,
             count(distinct l.pedido_id) n_pedidos,
             jsonb_agg(jsonb_build_object('pedido_id', l.pedido_id, 'numero', l.numero, 'cliente', l.cliente, 'data', l.data_saida,
                       'quantidade', l.quantidade, 'pre_reserva', l.status = 'pre_reserva', 'carregado', l.carregado)
                       order by l.data_saida, l.numero) pedidos,
             sum(l.quantidade) filter (where not l.carregado) a_carregar
        from lin l group by l.item_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'item_id', i.id, 'nome', coalesce(i.descricao_total, i.produto), 'codigo', i.codigo, 'categoria', i.categoria,
      'foto_url', i.foto_url, 'saindo', pi.saindo, 'a_carregar', coalesce(pi.a_carregar, 0), 'primeira', pi.primeira, 'n_pedidos', pi.n_pedidos, 'pedidos', pi.pedidos,
      'total', coalesce(lv.total, i.estoque_total, 0), 'manutencao', coalesce(lv.manutencao, 0), 'reservado', coalesce(lv.reservado, 0),
      'bloqueado', coalesce(lv.bloqueado, 0), 'livre', lv.livre,
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
    left join capas_modelos m on m.empresa_id = p_empresa and m.item_id = pi.item_id
  );
end $function$;
revoke all on function public.acervo_proximas_saidas(uuid, integer) from public, anon;
grant execute on function public.acervo_proximas_saidas(uuid, integer) to authenticated;

-- 4) Triagem: o pedido vai precisar de mais capas do que há no galpão?
-- Conta as capas deste pedido + as dos pedidos que saem antes (ou no mesmo dia) e ainda não foram carregados.
create or replace function public.capas_aviso_pedido(p_pedido uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare p separacoes_pedidos; hoje date := (now() at time zone 'America/Sao_Paulo')::date; saida date;
begin
  select * into p from separacoes_pedidos where id = p_pedido;
  if not found or not public.capas_pode(p.empresa_id) then return '[]'::jsonb; end if;
  saida := coalesce(p.data_entrega, p.data_evento, hoje);
  return (
    with lin as (select * from public.acervo_saidas_linhas(p.empresa_id, least(hoje, saida), greatest(hoje, saida)) where not carregado),
    meu as (select item_id, sum(quantidade) q from lin where pedido_id = p.id group by 1),
    calc as (
      select i.id item_id, coalesce(i.descricao_total, i.produto) item_nome, m.id modelo_id, m.nome modelo, m.usa_capa,
             coalesce(m.tipo_material, 'capa') tipo, m.estoque_conferido_em is not null conferido,
             ceil(meu.q / greatest(m.unidades_por_capa, 1)) precisa,
             (select coalesce(sum(ceil(l.quantidade / greatest(m.unidades_por_capa, 1))), 0) from lin l
               where l.item_id = meu.item_id and l.pedido_id <> p.id and (l.data_saida < saida or (l.data_saida = saida and l.numero < p.numero_pedido::text))) antes,
             case when m.id is not null then (public.capas_saldo(m.id)->>'disponivel')::numeric end disponivel
        from meu join itens i on i.id = meu.item_id
        left join capas_modelos m on m.empresa_id = p.empresa_id and m.item_id = meu.item_id
    )
    select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'item', item_nome, 'modelo', modelo, 'tipo', tipo,
             'precisa', precisa, 'antes', antes, 'disponivel', disponivel,
             'situacao', case when modelo_id is null then 'sem_cadastro'
                              when not conferido then 'nao_conferido'
                              else 'insuficiente' end,
             'falta', case when modelo_id is not null and conferido then precisa + antes - disponivel end)
           order by item_nome), '[]')
      from calc
     where modelo_id is null
        or (usa_capa and (not conferido or precisa + antes > disponivel))
  );
end $function$;
revoke all on function public.capas_aviso_pedido(uuid) from public, anon;
grant execute on function public.capas_aviso_pedido(uuid) to authenticated;

-- 5) Perdas de capas por evento e por equipe (nunca para o cliente)
-- Saiu no carregamento e não voltou no descarregamento = sumiu no evento → equipe da desmontagem do pedido.
-- Voltou no descarregamento e não chegou na triagem da volta = sumiu no galpão (sem equipe de evento).
create or replace function public.capas_perdas_equipe(p_empresa uuid, p_de date, p_ate date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.capas_pode(p_empresa) then raise exception 'Sem acesso ao material de proteção.' using errcode = '42501'; end if;
  return (
    with base as (
      select c.pedido_id, c.item_id, c.modelo_id, c.quantidade saiu,
             d.quantidade descarregou, d.concluida_em desc_em, r.quantidade voltou, r.concluida_em ret_em
        from capas_contagens c
        join capas_contagens d on d.pedido_id = c.pedido_id and d.item_id = c.item_id and d.etapa = 'descarregamento' and d.concluida_em is not null
        left join capas_contagens r on r.pedido_id = c.pedido_id and r.item_id = c.item_id and r.etapa = 'retorno' and r.concluida_em is not null
       where c.empresa_id = p_empresa and c.etapa = 'carregamento' and c.concluida_em is not null
         and (d.concluida_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    ), perdas as (
      select b.*, greatest(0, coalesce(b.saiu, 0) - coalesce(b.descarregou, 0)) no_evento,
             case when b.ret_em is not null then greatest(0, coalesce(b.descarregou, 0) - coalesce(b.voltou, 0)) else 0 end no_galpao
        from base b
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'pedido_id', pe.pedido_id, 'numero', sp.numero_pedido, 'cliente', sp.cliente_nome, 'data', (pe.desc_em at time zone 'America/Sao_Paulo')::date,
      'item', coalesce(i.descricao_total, i.produto), 'modelo', m.nome, 'tipo', coalesce(m.tipo_material, 'capa'), 'custo', m.custo,
      'saiu', pe.saiu, 'descarregou', pe.descarregou, 'voltou', pe.voltou,
      'no_evento', pe.no_evento, 'no_galpao', pe.no_galpao,
      'valor_evento', pe.no_evento * m.custo, 'valor_galpao', pe.no_galpao * m.custo,
      'equipe', (select coalesce(jsonb_agg(jsonb_build_object('nome', ep.nome, 'papel', ep.papel, 'funcionario_id', ep.funcionario_id, 'free_id', ep.free_id)
                                           order by ep.papel desc, ep.ordem, ep.nome), '[]')
                   from operacao_etapas e join operacao_etapa_pessoas ep on ep.etapa_id = e.id
                  where e.pedido_id = pe.pedido_id and e.tipo = 'desmontagem' and e.servico_ref is null)
    ) order by pe.desc_em desc), '[]')
    from perdas pe
    join capas_modelos m on m.id = pe.modelo_id
    join itens i on i.id = pe.item_id
    join separacoes_pedidos sp on sp.id = pe.pedido_id
    where pe.no_evento > 0 or pe.no_galpao > 0
  );
end $function$;
revoke all on function public.capas_perdas_equipe(uuid, date, date) from public, anon;
grant execute on function public.capas_perdas_equipe(uuid, date, date) to authenticated;
