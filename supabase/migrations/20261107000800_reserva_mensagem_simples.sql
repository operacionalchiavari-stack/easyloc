-- Mensagem de falta de estoque sem código interno do item (nov/2026, teste de usuário item 38).
CREATE OR REPLACE FUNCTION public.operacao_validar_reserva(p_empresa uuid, p_pedido uuid, p_itens jsonb, p_inicio date, p_fim date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d record; identificacao text;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Informe um período válido para reservar os materiais'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_empresa::text, 0));
  if exists (select 1 from jsonb_array_elements(p_itens) x join itens i on i.id = (x->>'item_id')::uuid where lower(i.tipo) = 'kit' and not exists (select 1 from kit_itens where kit_id = i.id)) then
    raise exception 'Cadastre os componentes do kit antes de reservar'; end if;
  if exists (select 1 from jsonb_array_elements(p_itens) x left join itens i on i.id = (x->>'item_id')::uuid and i.empresa_id = p_empresa where i.id is null) then
    raise exception 'Componente não pertence à empresa'; end if;
  for d in
    with lista as (select (x->>'item_id')::uuid id, greatest(sum((x->>'quantidade_solicitada')::numeric)-public.pedido_sublocado_qtd(p_pedido,(x->>'item_id')::uuid),0) qtd from jsonb_array_elements(p_itens) x group by 1),
    pecas as (
      select l.id, l.qtd from lista l join itens i on i.id = l.id where coalesce(lower(i.tipo), '') <> 'kit'
      union all select k.item_id, l.qtd * k.quantidade from lista l join itens i on i.id = l.id and lower(i.tipo) = 'kit' join kit_itens k on k.kit_id = i.id
    ), nec as (select id, sum(qtd) qtd from pecas group by id),
    atual as (
      select x.id, sum(x.q) q from (
        select s.item_id id, s.quantidade_solicitada q from separacoes_itens s join itens i on i.id = s.item_id where s.separacao_pedido_id = p_pedido and coalesce(lower(i.tipo), '') <> 'kit'
        union all select k.item_id, s.quantidade_solicitada * k.quantidade from separacoes_itens s join kit_itens k on k.kit_id = s.item_id where s.separacao_pedido_id = p_pedido) x group by 1)
    select n.id, n.qtd, l.total, l.manutencao, l.reservado, l.bloqueado, l.livre
      from nec n join public.operacao_livre_calc(p_empresa, p_inicio, p_fim, p_pedido) l on l.item_id = n.id
     where n.qtd > l.livre and not (public.acervo_item_bloqueado(p_empresa, n.id) and n.qtd <= coalesce((select a.q from atual a where a.id = n.id), 0))
  loop
    select coalesce(nullif(btrim(descricao_total),''), nullif(btrim(produto),''), 'Item') into identificacao from itens where id = d.id;
    if public.acervo_item_bloqueado(p_empresa, d.id) then
      raise exception 'O item "%" está em contagem no estoque (faltou ou sobrou numa volta de evento) e não entra em novos pedidos até o estoque contar. Fale com o estoque.', identificacao;
    end if;
    raise exception 'Não há "%" suficiente nessas datas: o pedido precisa de % e há % livre(s) no período (estoque %, em manutenção %, já reservado em outros pedidos %, em contagem %). Em kits, a conta é por peça do kit.',
      identificacao, trim_scale(d.qtd), trim_scale(d.livre), trim_scale(d.total), trim_scale(d.manutencao), trim_scale(d.reservado), trim_scale(d.bloqueado);
  end loop;
end $function$;
