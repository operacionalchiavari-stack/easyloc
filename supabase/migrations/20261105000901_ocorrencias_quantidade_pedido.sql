-- Total solicitado do produto no pedido, incluindo componentes de kits.
do $patch$
declare definicao text;
begin
 select pg_get_functiondef('public.separacao_ocorrencias_listar(uuid,uuid)'::regprocedure) into definicao;
 if position('''quantidade_pedido''' in definicao)>0 then return;end if;
 if position('''item_foto'',i.foto_url' in definicao)=0 then raise exception 'Formato da consulta de ocorrências diferente do esperado';end if;
 execute replace(definicao,'''item_foto'',i.foto_url',
  '''item_foto'',i.foto_url,''quantidade_pedido'',(select sum(l.quantidade_solicitada * case when l.item_id=o.item_id then 1 else k.quantidade end) from separacoes_itens l left join kit_itens k on k.kit_id=l.item_id and k.item_id=o.item_id where l.empresa_id=o.empresa_id and l.separacao_pedido_id=o.pedido_id and (l.item_id=o.item_id or k.item_id=o.item_id))');
end $patch$;
notify pgrst,'reload schema';
