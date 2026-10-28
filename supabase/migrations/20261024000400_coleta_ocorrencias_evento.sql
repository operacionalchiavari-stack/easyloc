begin;
-- Mantém a lista completa e separa o que está no evento do que já está no depósito.
do $migration$
declare fonte text; trecho text;
begin
 select pg_get_functiondef('public.logistica_confirmacao_base(uuid,text)'::regprocedure) into fonte;
 trecho:='''previsto'',greatest(0,(x->>''entregue'')::numeric-(x->>''voltou_antes'')::numeric)';
 if position(trecho in fonte)=0 then raise exception 'Base de coleta não encontrada';end if;
 fonte:=replace(fonte,trecho,
  '''quantidade_pedido'',(x->>''previsto'')::numeric,
   ''nao_entregue_deposito'',greatest(0,(x->>''previsto'')::numeric-(x->>''entregue'')::numeric),
   ''ja_no_deposito'',greatest(0,(x->>''previsto'')::numeric-(x->>''entregue'')::numeric)+coalesce((x->>''voltou_antes'')::numeric,0),
   ''previsto'',greatest(0,(x->>''entregue'')::numeric-(x->>''voltou_antes'')::numeric)');
 execute fonte;
end $migration$;
notify pgrst,'reload schema';
commit;
