create function public.pedido_disponibilidade_comercial(p_empresa uuid,p_pedido uuid,p_itens jsonb,p_inicio date,p_fim date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d record;total numeric;manutencao numeric;reservado numeric;bloqueado numeric;identificacao text; alertas jsonb := '[]'::jsonb; origens jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim<p_inicio then raise exception 'Informe um período válido para reservar os materiais'; end if;
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not (
    funcionario_pode(p_empresa,auth.uid(),'comercial.pedidos.visualizar') or
    funcionario_pode(p_empresa,auth.uid(),'comercial.pedidos.criar')) then
    raise exception 'Sem permissao para consultar disponibilidade' using errcode='42501'; end if;
  if exists(select 1 from jsonb_array_elements(p_itens) x
    left join itens i on i.id=(x->>'item_id')::uuid and i.empresa_id=p_empresa
    where i.id is null or coalesce((x->>'quantidade_solicitada')::numeric,0)<=0) then
    raise exception 'Item inválido ou não pertence à empresa'; end if;
  if exists(select 1 from jsonb_array_elements(p_itens) x join public.itens i on i.id=(x->>'item_id')::uuid where lower(to_jsonb(i)->>'tipo')='kit' and not exists(select 1 from public.kit_itens where kit_id=i.id)) then raise exception 'Cadastre os componentes do kit antes de reservar'; end if;
  for d in
    with lista as (select (x->>'item_id')::uuid id,sum((x->>'quantidade_solicitada')::numeric) qtd from jsonb_array_elements(p_itens) x group by (x->>'item_id')::uuid),
    pecas as (
      select l.id,l.qtd from lista l join public.itens i on i.id=l.id where coalesce(lower(to_jsonb(i)->>'tipo'),'')<>'kit'
      union all select k.item_id,l.qtd*k.quantidade from lista l join public.itens i on i.id=l.id and lower(to_jsonb(i)->>'tipo')='kit' join public.kit_itens k on k.kit_id=i.id
    ) select id,sum(qtd) qtd from pecas group by id
  loop
    select coalesce(estoque_total,0),coalesce((to_jsonb(i)->>'estoque_manutencao')::numeric,0) into total,manutencao from public.itens i where id=d.id and empresa_id=p_empresa;
    if not found then raise exception 'Componente não pertence à empresa'; end if;
    with reservas as (
      select s.*,coalesce(p.data_entrega,p.data_evento) inicio,coalesce(p.data_coleta,p.data_evento_fim,p.data_evento) fim from public.separacoes_itens s join public.separacoes_pedidos p on p.id=s.separacao_pedido_id
      where p.empresa_id=p_empresa and p.id is distinct from p_pedido and p.status_comercial in ('pre_reserva','aprovado','enviado','finalizado')
        and p.encerrado_operacional_em is null
        and coalesce(p.data_entrega,p.data_evento)<=p_fim and coalesce(p.data_coleta,p.data_evento_fim,p.data_evento)>=p_inicio
    ), pecas as (
      select quantidade_solicitada qtd,inicio,fim from reservas where item_id=d.id
      union all select r.quantidade_solicitada*k.quantidade,r.inicio,r.fim from reservas r join public.itens i on i.id=r.item_id and lower(to_jsonb(i)->>'tipo')='kit' join public.kit_itens k on k.kit_id=i.id where k.item_id=d.id
    ), dias as (
      select dia,coalesce(sum(qtd),0) qtd from generate_series(p_inicio::timestamp,p_fim::timestamp,interval '1 day') dia
      left join pecas on dia::date between inicio and fim group by dia
    ) select coalesce(max(qtd),0) into reservado from dias;
    select coalesce(max(quantidade),0) into bloqueado from public.operacao_indisponiveis(p_empresa,p_inicio) where item_id=d.id;
    if d.qtd>greatest(0,total-manutencao-reservado-bloqueado) then
      select coalesce(codigo || ' - ','') || coalesce(produto,'Item') into identificacao from itens where id=d.id and empresa_id=p_empresa;
      select coalesce(jsonb_agg(distinct x->>'item_id'),'[]') into origens
      from jsonb_array_elements(p_itens) x
      where (x->>'item_id')::uuid=d.id or exists(
        select 1 from kit_itens k join itens i on i.id=k.kit_id and lower(i.tipo)='kit'
        where k.kit_id=(x->>'item_id')::uuid and k.item_id=d.id);
      alertas := alertas || jsonb_build_array(jsonb_build_object(
        'origens',origens,'componente_id',d.id,'descricao',identificacao,
        'necessario',d.qtd,'disponivel',greatest(0,total-manutencao-reservado-bloqueado),
        'faltante',d.qtd-greatest(0,total-manutencao-reservado-bloqueado)));

    end if;
  end loop;
  return alertas;
end $$;


revoke all on function public.pedido_disponibilidade_comercial(uuid,uuid,jsonb,date,date) from public,anon;
grant execute on function public.pedido_disponibilidade_comercial(uuid,uuid,jsonb,date,date) to authenticated;
