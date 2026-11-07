begin;
-- última posição por usuário e empresa; sem acesso público ou histórico de trajetos.
create table public.rastreamento_posicoes (
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 usuario_id uuid not null references auth.users(id) on delete cascade,
 nome text not null, latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 precisao double precision not null check(precisao >= 0 and precisao < 100000),
 atualizado_em timestamptz not null default now(), primary key(empresa_id,usuario_id)
);
alter table public.rastreamento_posicoes enable row level security;
revoke all on public.rastreamento_posicoes from anon, authenticated;
grant select on public.rastreamento_posicoes to authenticated;
create policy rastreamento_leitura on public.rastreamento_posicoes for select to authenticated
using (public.eh_membro_empresa(empresa_id) and public.funcionario_pode(empresa_id,auth.uid(),'logistica.planejamento.visualizar'));
create or replace function public.rastreamento_enviar(p_empresa uuid,p_latitude double precision,p_longitude double precision,p_precisao double precision)
returns void language plpgsql security definer set search_path=public as $$
declare contexto jsonb;
begin
 contexto := public.funcionario_contexto(p_empresa)::jsonb;
 if auth.uid() is null or not coalesce((contexto->>'ativo')::boolean,false) or coalesce((contexto->>'dois_fatores_pendente')::boolean,false) then
 raise exception 'Acesso não autorizado'; end if;
 insert into public.rastreamento_posicoes(empresa_id,usuario_id,nome,latitude,longitude,precisao)
 values(p_empresa,auth.uid(),coalesce((select nullif(nome,'') from public.funcionarios_acesso where id=auth.uid() and empresa_id=p_empresa),nullif((select raw_user_meta_data->>'nome' from auth.users where id=auth.uid()),''),'Usuário'),p_latitude,p_longitude,p_precisao)
 on conflict(empresa_id,usuario_id) do update set nome=excluded.nome,latitude=excluded.latitude,longitude=excluded.longitude,precisao=excluded.precisao,atualizado_em=now();
end $$;
create or replace function public.rastreamento_parar(p_empresa uuid)
returns void language sql security definer set search_path=public as $$
 delete from public.rastreamento_posicoes where empresa_id=p_empresa and usuario_id=auth.uid();
$$;
revoke all on function public.rastreamento_enviar(uuid,double precision,double precision,double precision) from public;
revoke all on function public.rastreamento_parar(uuid) from public;
grant execute on function public.rastreamento_enviar(uuid,double precision,double precision,double precision) to authenticated;
grant execute on function public.rastreamento_parar(uuid) to authenticated;

commit;
