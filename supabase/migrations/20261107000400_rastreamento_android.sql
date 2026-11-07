begin;
-- Autorização exclusiva para enviar localização. Não permite consultar dados,
-- acessar outros módulos, escolher outro usuário ou renovar o login da conta.
create table public.rastreamento_dispositivos (
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 usuario_id uuid not null references auth.users(id) on delete cascade,
 dispositivo_id uuid not null, token_hash text not null unique,
 expira_em timestamptz not null, criado_em timestamptz not null default now(),
 primary key(empresa_id,usuario_id,dispositivo_id)
);
alter table public.rastreamento_dispositivos enable row level security;
revoke all on public.rastreamento_dispositivos from public,anon,authenticated;

create or replace function public.rastreamento_dispositivo_registrar(p_empresa uuid,p_dispositivo uuid,p_token text)
returns void language plpgsql security definer set search_path=public as $$
declare contexto jsonb;
begin
 contexto:=public.funcionario_contexto(p_empresa);
 if auth.uid() is null or not coalesce((contexto->>'ativo')::boolean,false)
 or coalesce((contexto->>'dois_fatores_pendente')::boolean,false) then
  raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Token inválido'; end if;
 insert into public.rastreamento_dispositivos(empresa_id,usuario_id,dispositivo_id,token_hash,expira_em)
 values(p_empresa,auth.uid(),p_dispositivo,encode(sha256(convert_to(p_token,'UTF8')),'hex'),now()+interval '30 days')
 on conflict(empresa_id,usuario_id,dispositivo_id) do update set token_hash=excluded.token_hash,expira_em=excluded.expira_em,criado_em=now();
end $$;

create or replace function public.rastreamento_dispositivo_enviar(p_token text,p_latitude double precision,p_longitude double precision,p_precisao double precision)
returns void language plpgsql security definer set search_path=public as $$
declare dispositivo public.rastreamento_dispositivos; nome_usuario text;
begin
 select * into dispositivo from public.rastreamento_dispositivos
 where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expira_em>now() for update;
 if dispositivo.usuario_id is null or not exists(select 1 from public.usuarios_empresas ue where ue.user_id=dispositivo.usuario_id and ue.empresa_id=dispositivo.empresa_id)
 or exists(select 1 from public.funcionarios_acesso f where f.id=dispositivo.usuario_id and (not f.ativo or f.empresa_id<>dispositivo.empresa_id)) then
  raise exception 'Autorização de localização encerrada' using errcode='42501'; end if;
 select coalesce(nullif(f.nome,''),nullif(u.nome,''),'Usuário') into nome_usuario
 from auth.users a left join public.funcionarios_acesso f on f.id=a.id and f.empresa_id=dispositivo.empresa_id
 left join public.usuarios u on u.id=a.id where a.id=dispositivo.usuario_id;
 insert into public.rastreamento_posicoes(empresa_id,usuario_id,nome,latitude,longitude,precisao)
 values(dispositivo.empresa_id,dispositivo.usuario_id,nome_usuario,p_latitude,p_longitude,p_precisao)
 on conflict(empresa_id,usuario_id) do update set nome=excluded.nome,latitude=excluded.latitude,longitude=excluded.longitude,precisao=excluded.precisao,atualizado_em=now();
end $$;

create or replace function public.rastreamento_dispositivo_encerrar(p_token text)
returns void language plpgsql security definer set search_path=public as $$
declare dispositivo public.rastreamento_dispositivos;
begin
 delete from public.rastreamento_dispositivos where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') returning * into dispositivo;
 if dispositivo.usuario_id is not null then
  delete from public.rastreamento_posicoes where empresa_id=dispositivo.empresa_id and usuario_id=dispositivo.usuario_id;
 end if;
end $$;

create or replace function public.rastreamento_parar(p_empresa uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 delete from public.rastreamento_dispositivos where empresa_id=p_empresa and usuario_id=auth.uid();
 delete from public.rastreamento_posicoes where empresa_id=p_empresa and usuario_id=auth.uid();
end $$;

revoke all on function public.rastreamento_dispositivo_registrar(uuid,uuid,text) from public,anon;
grant execute on function public.rastreamento_dispositivo_registrar(uuid,uuid,text) to authenticated;
revoke all on function public.rastreamento_dispositivo_enviar(text,double precision,double precision,double precision) from public;
grant execute on function public.rastreamento_dispositivo_enviar(text,double precision,double precision,double precision) to anon,authenticated;
revoke all on function public.rastreamento_dispositivo_encerrar(text) from public;
grant execute on function public.rastreamento_dispositivo_encerrar(text) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
