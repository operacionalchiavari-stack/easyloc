-- Prazo ampliado somente para a exportação exclusiva do serviço, não para a aplicação.
alter function public.sistema_backup_exportar() set statement_timeout='55s';
alter function public.sistema_backup_exportar() set default_transaction_isolation='repeatable read';
create table public.sistema_erros_operacionais(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),usuario_id uuid not null,
 pagina text not null,mensagem text not null,criado_em timestamptz not null default now()
);
create index sistema_erros_empresa_data on sistema_erros_operacionais(empresa_id,criado_em desc);
create index sistema_erros_usuario_data on sistema_erros_operacionais(usuario_id,criado_em desc);
alter table public.sistema_erros_operacionais enable row level security;
create policy sistema_erros_ler on public.sistema_erros_operacionais for select to authenticated using(eh_membro_empresa(empresa_id) and funcionario_pode(empresa_id,auth.uid(),'configuracoes.empresa.editar'));
revoke all on public.sistema_erros_operacionais from public,anon,authenticated;
grant select on public.sistema_erros_operacionais to authenticated;
create function public.sistema_erro_registrar(p_empresa uuid,p_pagina text,p_mensagem text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso para registrar diagnóstico';end if;
 if p_pagina is null or p_pagina not like '/%' or length(p_pagina)>200 or p_pagina ~ '[?#]' or length(btrim(coalesce(p_mensagem,'')))<3 or length(p_mensagem)>300 then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':diagnostico',0));
 if (select count(*) from sistema_erros_operacionais where usuario_id=auth.uid() and criado_em>now()-interval '1 hour')>=20 then return;end if;
 if exists(select 1 from sistema_erros_operacionais where empresa_id=p_empresa and usuario_id=auth.uid() and pagina=p_pagina and mensagem=p_mensagem and criado_em>now()-interval '5 minutes') then return;end if;
 insert into sistema_erros_operacionais(empresa_id,usuario_id,pagina,mensagem) values(p_empresa,auth.uid(),p_pagina,p_mensagem);
end $$;
revoke all on function public.sistema_erro_registrar(uuid,text,text) from public,anon;
grant execute on function public.sistema_erro_registrar(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
