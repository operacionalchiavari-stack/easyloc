create table public.logistica_envios(id uuid primary key,empresa_id uuid not null references empresas(id),pedido_id uuid not null references separacoes_pedidos(id),
 usuario_id uuid not null,hash text not null,resposta jsonb not null,criado_em timestamptz not null default now());
alter table logistica_envios enable row level security;revoke all on logistica_envios from public,anon,authenticated;
create function public.logistica_confirmacao_enviar(p_id uuid,p_pedido uuid,p_etapa text,p_token text,p_itens jsonb,p_responsavel text,p_observacao text default '') returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;e logistica_envios;h text;r jsonb;begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para sincronizar';end if;
 h:=md5(jsonb_build_array(p_pedido,p_etapa,p_token,p_itens,p_responsavel,p_observacao)::text);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into e from logistica_envios where id=p_id;
 if found then if e.usuario_id<>auth.uid() or e.hash<>h or e.empresa_id<>p.empresa_id then raise exception 'Envio já utilizado com outro conteúdo';end if;return e.resposta;end if;
 r:=logistica_confirmacao_salvar(p_pedido,p_etapa,p_token,p_itens,p_responsavel,p_observacao);
 insert into logistica_envios values(p_id,p.empresa_id,p.id,auth.uid(),h,r,now());return r;
end $$;
revoke all on function public.logistica_confirmacao_enviar(uuid,uuid,text,text,jsonb,text,text) from public,anon;
grant execute on function public.logistica_confirmacao_enviar(uuid,uuid,text,text,jsonb,text,text) to authenticated;

create table public.sistema_backups(id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),criado_em timestamptz not null default now(),
 tabelas integer not null,registros bigint not null,bytes bigint not null,arquivos integer not null,arquivos_pendentes integer not null,verificado boolean not null,erro text);
alter table sistema_backups enable row level security;
create policy backup_ler on sistema_backups for select to authenticated using(eh_membro_empresa(empresa_id) and funcionario_pode(empresa_id,auth.uid(),'configuracoes.empresa.editar'));
revoke all on sistema_backups from public,anon,authenticated;grant select on sistema_backups to authenticated;grant all on sistema_backups to service_role;
-- Exclusivo do processo de backup no servidor. O navegador nunca recebe estes dados.
create function public.sistema_backup_exportar() returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare t record;dados jsonb:='[]';linhas jsonb;colunas jsonb;restricoes jsonb;funcoes jsonb;tipos jsonb;numericos text;begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Backup restrito ao serviço';end if;
 for t in select n.nspname esquema,c.relname tabela,c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind='r' order by n.nspname,c.relname loop
  select string_agg(format('%L,x.%I::text',a.attname,a.attname),',') into numericos from pg_attribute a where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped and a.atttypid in (20,1700);
  execute format('select coalesce(jsonb_agg(to_jsonb(x)%s),''[]'') from %I.%I x',case when numericos is null then '' else '||jsonb_build_object('||numericos||')' end,t.esquema,t.tabela) into linhas;
  select jsonb_agg(jsonb_build_object('nome',a.attname,'tipo',format_type(a.atttypid,a.atttypmod),'texto_numerico',a.atttypid in (20,1700),'gerada',a.attgenerated<>'','nulo',not a.attnotnull) order by a.attnum) into colunas from pg_attribute a where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped;
  select coalesce(jsonb_agg(jsonb_build_object('nome',conname,'tipo',contype,'sql',pg_get_constraintdef(oid,true))),'[]') into restricoes from pg_constraint where conrelid=t.oid and contype in ('p','u','f','c');
  dados:=dados||jsonb_build_array(jsonb_build_object('esquema',t.esquema,'tabela',t.tabela,'colunas',colunas,'restricoes',restricoes,'linhas',linhas));
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('nome',n.nspname||'.'||ty.typname,'valores',(select jsonb_agg(e.enumlabel order by enumsortorder) from pg_enum e where e.enumtypid=ty.oid))),'[]') into tipos from pg_type ty join pg_namespace n on n.oid=ty.typnamespace where ty.typtype='e' and n.nspname in ('public','auth','storage');
 select coalesce(jsonb_agg(pg_get_functiondef(p.oid)),'[]') into funcoes from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname in ('public','auth','storage') and p.prokind='f' and l.lanname in ('sql','plpgsql');
 return jsonb_build_object('versao',1,'criado_em',now(),'tabelas',dados,'tipos',tipos,'funcoes',funcoes,
 'migracoes',(select coalesce(jsonb_agg(version order by version),'[]') from supabase_migrations.schema_migrations));
end $$;
revoke all on function public.sistema_backup_exportar() from public,anon,authenticated;
grant execute on function public.sistema_backup_exportar() to service_role;
notify pgrst,'reload schema';
