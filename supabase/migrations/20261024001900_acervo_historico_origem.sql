do $$declare f text;begin
 f:=pg_get_functiondef('public.acervo_ordens(uuid)'::regprocedure);
 if position('''concluida'',translate' in f)=0 then raise exception 'Formato da consulta de ordens alterado';end if;
 f:=replace(f,'''concluida'',translate','''onde'',v->>12,''concluida'',translate');
 execute f;
end $$;
