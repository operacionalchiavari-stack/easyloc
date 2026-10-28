-- A exportação completa permanece disponível; a nuvem lê lotes na mesma transação.
create function public.sistema_backup_estrutura() returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare t record; dados jsonb[]:='{}'; colunas jsonb; restricoes jsonb; tipos jsonb; funcoes jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Backup restrito ao serviço'; end if;
 for t in select n.nspname esquema,c.relname tabela,c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind='r' order by n.nspname,c.relname loop
  select jsonb_agg(jsonb_build_object('nome',a.attname,'tipo',format_type(a.atttypid,a.atttypmod),'texto_numerico',a.atttypid in (20,1700),'gerada',a.attgenerated<>'','nulo',not a.attnotnull) order by a.attnum) into colunas from pg_attribute a where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped;
  select coalesce(jsonb_agg(jsonb_build_object('nome',conname,'tipo',contype,'sql',pg_get_constraintdef(oid,true))),'[]') into restricoes from pg_constraint where conrelid=t.oid and contype in ('p','u','f','c');
  dados:=array_append(dados,jsonb_build_object('esquema',t.esquema,'tabela',t.tabela,'colunas',colunas,'restricoes',restricoes,'linhas','[]'::jsonb));
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('nome',n.nspname||'.'||ty.typname,'valores',(select jsonb_agg(e.enumlabel order by enumsortorder) from pg_enum e where e.enumtypid=ty.oid))),'[]') into tipos from pg_type ty join pg_namespace n on n.oid=ty.typnamespace where ty.typtype='e' and n.nspname in ('public','auth','storage');
 select coalesce(jsonb_agg(pg_get_functiondef(p.oid)),'[]') into funcoes from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname in ('public','auth','storage') and p.prokind='f' and l.lanname in ('sql','plpgsql');
 return jsonb_build_object('versao',1,'criado_em',now(),'tabelas',dados,'tipos',tipos,'funcoes',funcoes,'migracoes',(select coalesce(jsonb_agg(version order by version),'[]') from supabase_migrations.schema_migrations));
end $$;
create function public.sistema_backup_linhas(p_esquema text,p_tabela text,p_de integer default 0,p_limite integer default 200) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare tabela oid; numericos text; linhas jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Backup restrito ao serviço'; end if;
 if p_esquema not in ('public','auth','storage') or p_esquema is null then raise exception 'Esquema inválido';end if;
 select c.oid into tabela from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=p_esquema and c.relname=p_tabela and c.relkind='r';
 if tabela is null then raise exception 'Tabela inválida';end if;
 select string_agg(format('%L,x.%I::text',a.attname,a.attname),',') into numericos from pg_attribute a where a.attrelid=tabela and a.attnum>0 and not a.attisdropped and a.atttypid in (20,1700);
 execute format('select coalesce(jsonb_agg(to_jsonb(x)%s),''[]'') from (select * from %I.%I order by ctid offset %s limit %s) x',case when numericos is null then '' else '||jsonb_build_object('||numericos||')' end,p_esquema,p_tabela,greatest(coalesce(p_de,0),0),least(greatest(coalesce(p_limite,200),1),500)) into linhas;
 return linhas;
end $$;
revoke all on function public.sistema_backup_estrutura(),public.sistema_backup_linhas(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.sistema_backup_estrutura(),public.sistema_backup_linhas(text,text,integer,integer) to service_role;
notify pgrst,'reload schema';
