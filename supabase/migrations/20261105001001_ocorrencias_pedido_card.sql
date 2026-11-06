-- Dados do pedido para os cards da fila de ocorrências.
do $patch$
declare definicao text;
begin
 select pg_get_functiondef('public.separacao_ocorrencias_listar(uuid,uuid)'::regprocedure) into definicao;
 if position('''pedido_hora_entrega''' in definicao)>0 then return;end if;
 if position('''pedido_numero'',p.numero_pedido' in definicao)=0 then raise exception 'Formato da consulta de ocorrências diferente do esperado';end if;
 execute replace(definicao,'''pedido_numero'',p.numero_pedido',
  '''pedido_numero'',p.numero_pedido,''pedido_local'',to_jsonb(p)->>''local_nome'',''pedido_hora_entrega'',coalesce(nullif(to_jsonb(p)->''observacoes''->>''horario_entrega'',''''),to_jsonb(p)->''observacoes''->''horarios_pedido''->>''entrega'')');
end $patch$;
notify pgrst,'reload schema';
