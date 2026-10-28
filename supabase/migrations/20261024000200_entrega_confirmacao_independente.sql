begin;
-- A confirmação no local também atende pedidos cujo carregamento não foi registrado.
-- Mantém os bloqueios de acesso, operação encerrada e entrega já seguida de coleta.
do $migration$
declare fonte text;
begin
 select pg_get_functiondef('public.logistica_confirmacao_base(uuid,text)'::regprocedure) into fonte;
 if position('when carregamento->>''concluido_em'' is null then ''Conclua o carregamento na Expedição antes de confirmar.''' in fonte)=0 then
  raise exception 'Regra de carregamento não encontrada';
 end if;
 fonte:=replace(fonte,'when carregamento->>''concluido_em'' is null then ''Conclua o carregamento na Expedição antes de confirmar.''','');
 execute fonte;
end $migration$;
notify pgrst,'reload schema';
commit;
