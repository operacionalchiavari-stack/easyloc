do $$ declare f text;begin
 f:=pg_get_functiondef('public.acervo_ordens(uuid)'::regprocedure);
 if position('''setor'',coalesce' in f)=0 then raise exception 'Formato da consulta de ordens alterado';end if;
 f:=replace(f,'''setor'',coalesce','''pedido'',v->>13,''setor'',coalesce');
 execute f;
end $$;
notify pgrst,'reload schema';
