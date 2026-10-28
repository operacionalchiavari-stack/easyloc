do $$declare f text;begin
 f:=pg_get_functiondef('public.sistema_backup_exportar()'::regprocedure);
 if position('dados:=dados||jsonb_build_array' in f)=0 then raise exception 'Formato da exportação alterado';end if;
 f:=replace(f,'dados jsonb:=''[]''','dados jsonb[]:=''{}''');
 f:=replace(f,'dados:=dados||jsonb_build_array(jsonb_build_object','dados:=array_append(dados,jsonb_build_object');
 execute f;
end $$;
alter function public.sistema_backup_exportar() set statement_timeout='180s';
notify pgrst,'reload schema';
