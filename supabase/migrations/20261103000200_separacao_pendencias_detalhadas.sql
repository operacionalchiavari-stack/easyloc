-- Conserva as validações atuais e identifica os itens que impediram a conclusão.
do $patch$
declare definicao text; antigo text; novo text;
begin
 select pg_get_functiondef('public.operacao_validar_pedido_update()'::regprocedure) into definicao;
 antigo:=$old$raise exception 'Há itens pendentes. Revise a lista ou conclua com divergência'$old$;
 novo:=$new$raise exception using message=(
   select 'Itens pendentes na separação: '||string_agg(
    coalesce(nullif(i.descricao_total,''),nullif(i.produto,''),s.item_id::text)||
    case when nullif(i.codigo,'') is not null then ' ['||i.codigo||']' else '' end||
    ' — faltam '||replace((s.quantidade_solicitada-coalesce(s.quantidade_separada,0))::text,'.',','),'; ' order by s.id)
   from public.separacoes_itens s left join public.itens i on i.id=s.item_id and i.empresa_id=new.empresa_id
   where s.separacao_pedido_id=new.id and coalesce(s.quantidade_separada,0)<s.quantidade_solicitada
  ),detail=(
   select jsonb_agg(jsonb_build_object('registro_id',s.id,'item_id',s.item_id,
    'nome',coalesce(nullif(i.descricao_total,''),nullif(i.produto,''),s.item_id::text),
    'codigo',i.codigo,'setor',i.setor_estoque,'solicitada',s.quantidade_solicitada,
    'separada',coalesce(s.quantidade_separada,0),
    'faltante',s.quantidade_solicitada-coalesce(s.quantidade_separada,0)) order by s.id)::text
   from public.separacoes_itens s left join public.itens i on i.id=s.item_id and i.empresa_id=new.empresa_id
   where s.separacao_pedido_id=new.id and coalesce(s.quantidade_separada,0)<s.quantidade_solicitada
  )$new$;
 if position(antigo in definicao)>0 then execute replace(definicao,antigo,novo);
 elsif position('Itens pendentes na separação:' in definicao)=0 then raise exception 'Validação de separação diferente da esperada; nenhuma regra foi substituída';end if;
end $patch$;
