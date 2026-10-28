do $patch$ declare f text;begin
 f:=pg_get_functiondef('public.fin_compensacao_status()'::regprocedure);
 f:=replace(f,' quitado:=',$code$
 if new.compensado>0 and (new.status='cancelado' or
  (TG_TABLE_NAME='fin_receber' and to_jsonb(new)->'cliente_id' is distinct from to_jsonb(old)->'cliente_id') or
  (TG_TABLE_NAME='fin_pagar' and to_jsonb(new)->'fornecedor_id' is distinct from to_jsonb(old)->'fornecedor_id')) then
  raise exception 'Estorne as compensacoes antes de cancelar ou trocar o cliente do titulo';
 end if;
 quitado:=$code$);execute f;

 f:=pg_get_functiondef('public.fin_custo_evento(uuid,uuid,text,text,numeric,uuid,uuid)'::regprocedure);
 f:=replace(f,'and status<>''cancelado'' and valor=p_valor','and status<>''cancelado'' and origem is distinct from ''credito_cliente'' and valor=p_valor');execute f;

 f:=pg_get_functiondef('public.acervo_inventario_aprovar(uuid,uuid)'::regprocedure);
 f:=replace(f,'  update itens set estoque_total=c.contado',$code$
  if c.contado<coalesce((select (to_jsonb(catalogo_item)->>'estoque_manutencao')::numeric from itens catalogo_item where id=c.item_id and empresa_id=p_empresa),0) then
   raise exception 'Concilie as pecas em manutencao antes de reduzir o saldo total';
  end if;
  update itens set estoque_total=c.contado$code$);execute f;
end $patch$;
notify pgrst,'reload schema';
