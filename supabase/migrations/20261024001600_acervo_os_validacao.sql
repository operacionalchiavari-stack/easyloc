do $$ declare f text;begin
 f:=pg_get_functiondef('public.acervo_os_vincular(uuid,uuid,integer,text)'::regprocedure);
 f:=replace(f,'if r.versao<>p_versao then','if r.versao is distinct from p_versao then');
 f:=replace(f,' select coalesce(sum(quantidade),0) into alocado',$guard$
 if coalesce(o->>'quantidade','') !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'Confira a quantidade da O.S antes de vincular';end if;
 select coalesce(sum(quantidade),0) into alocado$guard$);
 execute f;
end $$;
notify pgrst,'reload schema';
