-- Margens de reserva em dias corridos, compartilhadas por todas as consultas e pelo salvar.
alter table public.empresa_fluxo_pedidos
 add column reserva_dias_antes_entrega integer not null default 0 check (reserva_dias_antes_entrega between 0 and 365),
 add column reserva_dias_apos_desmontagem integer not null default 0 check (reserva_dias_apos_desmontagem between 0 and 365);
create function public.pedido_fluxo_configurar(p_empresa uuid, p_pre_reservas boolean, p_retorno_simultaneo boolean, p_acervo_antecedencia numeric, p_reserva_antes integer, p_reserva_depois integer)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_reserva_antes is null or p_reserva_depois is null or p_reserva_antes not between 0 and 365 or p_reserva_depois not between 0 and 365 then raise exception 'Informe de 0 a 365 dias para as margens de reserva'; end if;
 perform pedido_fluxo_configurar(p_empresa,p_pre_reservas,p_retorno_simultaneo,p_acervo_antecedencia);
 update empresa_fluxo_pedidos set reserva_dias_antes_entrega=p_reserva_antes, reserva_dias_apos_desmontagem=p_reserva_depois where empresa_id=p_empresa;
end $$;
revoke all on function public.pedido_fluxo_configurar(uuid,boolean,boolean,numeric,integer,integer) from public,anon;
grant execute on function public.pedido_fluxo_configurar(uuid,boolean,boolean,numeric,integer,integer) to authenticated;

create function public.reserva_periodo(p_empresa uuid, p_entrega date, p_coleta date)
returns table(inicio date, fim date) language sql stable security definer set search_path=public as $$
 select p_entrega-coalesce(f.reserva_dias_antes_entrega,0),
        greatest(p_entrega,p_coleta)+coalesce(r.desmontagem_dias_apos_coleta,0)+coalesce(f.reserva_dias_apos_desmontagem,0)
 from (select 1) a left join empresa_fluxo_pedidos f on f.empresa_id=p_empresa
 left join empresa_logistica_regras r on r.empresa_id=p_empresa;
$$;
revoke all on function public.reserva_periodo(uuid,date,date) from public,anon,authenticated;
grant execute on function public.reserva_periodo(uuid,date,date) to service_role;

create or replace function public.operacao_bloqueios_detalhe(p_empresa uuid, p_data date)
returns table(item_id uuid, pedido_id uuid, motivo text, quantidade numeric)
language sql stable security definer set search_path = public as $$
  with ped as (
    select p.id, rp.fim fim from separacoes_pedidos p cross join lateral reserva_periodo(p.empresa_id, coalesce(p.data_entrega, p.data_evento), coalesce(p.data_coleta, p.data_evento_fim, p.data_evento)) rp where p.empresa_id = p_empresa
  ), transito as (
    select e.item_id, p.id pedido_id, count(*)::numeric qtd
      from separacoes_etiquetas e join separacoes_pedidos p on p.id = e.separacao_pedido_id
     where p.empresa_id = p_empresa and e.lida_carregamento_em is not null and e.lida_retorno_em is null
       and (select ped.fim from ped where ped.id = p.id) < p_data
       and not exists (select 1 from operacao_ocorrencias o where o.pedido_id = p.id and o.codigo = e.codigo and o.resolucao like 'Perda confirmada:%')
     group by e.item_id, p.id
  ), baixado as (
    select a.item_id, a.pedido_id, sum(a.quantidade) qtd from acervo_retornos a
     where a.empresa_id = p_empresa and a.estado = 'baixado' group by a.item_id, a.pedido_id
  ), acervo as (
    select a.item_id, a.pedido_id, sum(a.quantidade) qtd, string_agg(distinct a.estado, ', ') estados
      from acervo_retornos a left join ped on ped.id = a.pedido_id
     where a.empresa_id = p_empresa and a.estado not in ('liberado', 'baixado')
       and (ped.id is null or ped.fim is null or p_data > ped.fim)
     group by a.item_id, a.pedido_id
  ), ocorr as (
    select o.item_id, o.pedido_id, sum(o.quantidade) qtd, string_agg(distinct o.tipo, ', ') tipos
      from operacao_ocorrencias o left join ped on ped.id = o.pedido_id
     where o.empresa_id = p_empresa and o.resolvida_em is null and o.tipo in ('avaria', 'limpeza', 'manutencao') and o.item_id is not null
       and (ped.id is null or ped.fim is null or p_data > ped.fim)
     group by o.item_id, o.pedido_id
  ), chaves as (
    select t.item_id, t.pedido_id from transito t union select a.item_id, a.pedido_id from acervo a
    union select o.item_id, o.pedido_id from ocorr o where o.pedido_id is not null
  ), por_pedido as (
    select c.item_id, c.pedido_id,
           greatest(0, coalesce(t.qtd, 0) - coalesce(b.qtd, 0)) tq, coalesce(a.qtd, 0) aq, coalesce(o.qtd, 0) oq, a.estados, o.tipos
      from chaves c
      left join transito t on t.item_id = c.item_id and t.pedido_id is not distinct from c.pedido_id
      left join baixado b on b.item_id = c.item_id and b.pedido_id is not distinct from c.pedido_id
      left join acervo a on a.item_id = c.item_id and a.pedido_id is not distinct from c.pedido_id
      left join ocorr o on o.item_id = c.item_id and o.pedido_id is not distinct from c.pedido_id
  )
  select item_id, pedido_id,
         case when aq >= tq and aq >= oq then 'Acervo: ' || estados when oq >= tq then tipos else 'Retorno pendente' end,
         greatest(tq, aq, oq)
    from por_pedido where greatest(tq, aq, oq) > 0
  union all
  select o.item_id, null, o.tipos, o.qtd from ocorr o where o.pedido_id is null;
$$;

CREATE OR REPLACE FUNCTION public.operacao_livre_calc(p_empresa uuid, p_inicio date, p_fim date, p_pedido uuid DEFAULT NULL::uuid)
 RETURNS TABLE(item_id uuid, total numeric, manutencao numeric, reservado numeric, bloqueado numeric, livre numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with janela as (select * from reserva_periodo(p_empresa, p_inicio, greatest(p_inicio, p_fim))), dias as (
    select d::date dia from janela cross join lateral generate_series(janela.inicio::timestamp, janela.fim::timestamp, interval '1 day') d
  ), ped as (
    select p.id, rp.inicio ini, rp.fim fim
      from separacoes_pedidos p cross join lateral reserva_periodo(p.empresa_id, coalesce(p.data_entrega, p.data_evento), coalesce(p.data_coleta, p.data_evento_fim, p.data_evento)) rp
     where p.empresa_id = p_empresa and p.id is distinct from p_pedido
       and p.status_comercial in ('pre_reserva', 'aprovado', 'enviado', 'finalizado')
       and coalesce(p.status, '') <> 'cancelado' and p.encerrado_operacional_em is null
       and rp.inicio <= (select fim from janela)
       and rp.fim >= (select inicio from janela)
  ), linhas as (
    select s.item_id, s.quantidade_solicitada q, ped.ini, ped.fim from separacoes_itens s join ped on ped.id = s.separacao_pedido_id
  ), pecas_res as (
    select l.item_id, l.q, l.ini, l.fim from linhas l join itens i on i.id = l.item_id
     where coalesce(lower(i.tipo), '') <> 'kit' or not exists (select 1 from kit_itens k where k.kit_id = i.id)
    union all
    select k.item_id, l.q * k.quantidade, l.ini, l.fim from linhas l join itens i on i.id = l.item_id and lower(i.tipo) = 'kit'
      join kit_itens k on k.kit_id = i.id
  ), res_dia as (
    select pr.item_id, d.dia, sum(pr.q) q from pecas_res pr join dias d on d.dia between pr.ini and pr.fim group by 1, 2
  ), bloq_dia as (
    select b.item_id, d.dia, b.quantidade q from dias d cross join lateral public.operacao_bloqueios_calc(p_empresa, d.dia) b
  ), comb as (
    select x.item_id, x.dia, sum(x.r) r, sum(x.b) b
      from (select item_id, dia, q r, 0::numeric b from res_dia union all select item_id, dia, 0, q from bloq_dia) x
     group by 1, 2
  ), pior as (
    select distinct on (item_id) item_id, r, b from comb order by item_id, (r + b) desc
  ), pecas as (
    select i.id, coalesce(i.estoque_total, 0)::numeric tot, coalesce(i.estoque_manutencao, 0)::numeric man,
           coalesce(pi.r, 0)::numeric res, coalesce(pi.b, 0)::numeric blo,
           case when public.acervo_item_bloqueado(p_empresa, i.id) then 0
                else greatest(0, coalesce(i.estoque_total, 0) - coalesce(i.estoque_manutencao, 0) - coalesce(pi.r, 0) - coalesce(pi.b, 0)) end::numeric liv
      from itens i left join pior pi on pi.item_id = i.id
     where i.empresa_id = p_empresa
  ), kits as (
    select k.kit_id id, min(floor(pc.tot / nullif(k.quantidade, 0)))::numeric tot, min(floor(pc.liv / nullif(k.quantidade, 0)))::numeric liv
      from kit_itens k join pecas pc on pc.id = k.item_id
     where k.empresa_id = p_empresa
     group by k.kit_id
  )
  select pc.id, coalesce(kt.tot, pc.tot), pc.man, pc.res, pc.blo, coalesce(kt.liv, pc.liv)
    from pecas pc left join kits kt on kt.id = pc.id;
$function$;

CREATE OR REPLACE FUNCTION public.pedido_estoque_detalhes(p_empresa_id uuid, p_item_id uuid, p_data date, p_pedido uuid DEFAULT NULL::uuid, p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare resultado jsonb; v_ini date := coalesce(p_inicio, p_data); v_fim date := greatest(coalesce(p_fim, p_inicio, p_data), coalesce(p_inicio, p_data));
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa_id) or not (
    funcionario_pode(p_empresa_id, auth.uid(), 'comercial.pedidos.visualizar') or funcionario_pode(p_empresa_id, auth.uid(), 'comercial.pedidos.criar')) then
    raise exception 'Sem permissão para consultar reservas' using errcode = '42501'; end if;
  if not catalogo_parametro_permite(p_empresa_id, 'disponivel', 'equipe', null) then
    raise exception 'Consulta de disponibilidade desativada' using errcode = '42501'; end if;
  if p_data is null or not exists (select 1 from itens where id = p_item_id and empresa_id = p_empresa_id) then
    raise exception 'Item ou data inválidos'; end if;
  with janela as (select * from reserva_periodo(p_empresa_id, v_ini, v_fim)), componentes as (
    select k.item_id, sum(k.quantidade)::numeric necessario from kit_itens k
      join itens i on i.id = k.kit_id and lower(i.tipo) = 'kit' and i.empresa_id = p_empresa_id
     where k.kit_id = p_item_id group by k.item_id
    union all
    select p_item_id, 1::numeric where not exists (select 1 from kit_itens k join itens i on i.id = k.kit_id and lower(i.tipo) = 'kit' where k.kit_id = p_item_id)
  ), reservas as (
    select s.item_id, s.quantidade_solicitada qtd, p.id pedido_id,
      coalesce(to_jsonb(p)->>'numero_pedido', to_jsonb(p)->>'numero', p.id::text) numero,
      coalesce(to_jsonb(p)->>'cliente_nome', 'Cliente não informado') cliente,
      p.data_evento evento, p.local_nome local, p.status_comercial situacao,
      rp.inicio inicio, rp.fim fim
      from separacoes_itens s join separacoes_pedidos p on p.id = s.separacao_pedido_id
      cross join lateral reserva_periodo(p.empresa_id, coalesce(p.data_entrega, p.data_evento), coalesce(p.data_coleta, p.data_evento_fim, p.data_evento)) rp
     where p.empresa_id = p_empresa_id and p.status_comercial in ('pre_reserva', 'aprovado', 'enviado', 'finalizado')
       and coalesce(p.status, '') <> 'cancelado' and p.encerrado_operacional_em is null
       and rp.inicio <= (select fim from janela) and rp.fim >= (select inicio from janela)
  ), expandidas as (
    select r.item_id, r.qtd, r.pedido_id, r.numero, r.cliente, r.evento, r.local, r.situacao, r.inicio, r.fim from reservas r join itens i on i.id = r.item_id
     where coalesce(lower(i.tipo), '') <> 'kit' or not exists (select 1 from kit_itens where kit_id = i.id)
    union all
    select k.item_id, r.qtd * k.quantidade, r.pedido_id, r.numero, r.cliente, r.evento, r.local, r.situacao, r.inicio, r.fim
      from reservas r join itens i on i.id = r.item_id and lower(i.tipo) = 'kit' join kit_itens k on k.kit_id = i.id
  ), pedidos as (
    select e.item_id, e.pedido_id, e.numero, e.cliente, e.evento, e.local, e.situacao, e.inicio, e.fim, sum(e.qtd) quantidade
      from expandidas e join componentes c on c.item_id = e.item_id
     group by e.item_id, e.pedido_id, e.numero, e.cliente, e.evento, e.local, e.situacao, e.inicio, e.fim
  ), bloqueios as (
    select b.item_id, b.pedido_id, p.numero_pedido::text numero,
      p.cliente_nome cliente, p.data_evento evento, p.local_nome local, b.motivo, b.quantidade
      from operacao_bloqueios_detalhe(p_empresa_id, p_data) b
      join componentes c on c.item_id = b.item_id
      left join separacoes_pedidos p on p.id = b.pedido_id and p.empresa_id = p_empresa_id
  ), disponibilidade as (
    select c.item_id, c.necessario, i.codigo, i.produto,
      coalesce(nullif(i.foto_url, ''), (select origem.foto_url from itens origem where origem.id = p_item_id and origem.empresa_id = p_empresa_id)) foto_url,
      coalesce(i.estoque_total, 0) estoque, coalesce(i.estoque_manutencao, 0) manutencao,
      coalesce((select sum(p.quantidade) from pedidos p where p.item_id = c.item_id and p.pedido_id is distinct from p_pedido), 0) reservado,
      coalesce((select sum(b.quantidade) from bloqueios b where b.item_id = c.item_id), 0) bloqueado
      from componentes c join itens i on i.id = c.item_id and i.empresa_id = p_empresa_id
  ) select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', d.item_id, 'codigo', d.codigo, 'nome', d.produto, 'foto_url', d.foto_url, 'necessario', d.necessario, 'estoque', d.estoque,
    'manutencao', d.manutencao, 'reservado', d.reservado, 'bloqueado', d.bloqueado,
    'livre', coalesce((select l.livre from public.operacao_livre_calc(p_empresa_id, v_ini, v_fim, p_pedido) l where l.item_id = d.item_id), 0),
    'bloqueio_contagem', d.item_id in (select public.acervo_itens_bloqueados(p_empresa_id)),
    'pedidos', coalesce((select jsonb_agg(to_jsonb(p) - 'item_id' order by p.inicio, p.numero) from pedidos p where p.item_id = d.item_id), '[]'),
    'bloqueios', coalesce((select jsonb_agg(to_jsonb(b) - 'item_id') from bloqueios b where b.item_id = d.item_id), '[]')
  ) order by d.codigo), '[]') into resultado from disponibilidade d;
  return jsonb_build_object('data', v_ini, 'inicio', v_ini, 'fim', v_fim, 'componentes', resultado);
end $function$
;
grant execute on function public.pedido_estoque_detalhes(uuid, uuid, date, uuid, date, date) to authenticated;
revoke all on function public.pedido_estoque_detalhes(uuid, uuid, date, uuid, date, date) from public, anon;

notify pgrst, 'reload schema';
