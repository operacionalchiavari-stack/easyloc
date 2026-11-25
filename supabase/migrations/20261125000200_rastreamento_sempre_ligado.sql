-- Rastreamento do app Android sempre ligado (25/11/2026)
-- O aparelho passa a mandar um batimento (estado e diagnóstico) mesmo sem leitura do GPS, e a autorização
-- se renova sozinha enquanto o celular estiver enviando (antes vencia em 30 dias e o envio parava em silêncio).

alter table public.rastreamento_dispositivos
 add column if not exists visto_em timestamptz,
 add column if not exists estado text,
 add column if not exists detalhe text,
 add column if not exists telemetria jsonb not null default '{}'::jsonb;

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
 update public.rastreamento_dispositivos set visto_em=now(),expira_em=greatest(expira_em,now()+interval '30 days')
 where token_hash=dispositivo.token_hash;
end $$;

create or replace function public.rastreamento_dispositivo_ping(p_token text,p_estado text,p_detalhe text,p_telemetria jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare dispositivo public.rastreamento_dispositivos;
begin
 select * into dispositivo from public.rastreamento_dispositivos
 where token_hash=encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex') and expira_em>now() for update;
 if dispositivo.usuario_id is null or not exists(select 1 from public.usuarios_empresas ue where ue.user_id=dispositivo.usuario_id and ue.empresa_id=dispositivo.empresa_id)
 or exists(select 1 from public.funcionarios_acesso f where f.id=dispositivo.usuario_id and (not f.ativo or f.empresa_id<>dispositivo.empresa_id)) then
  raise exception 'Autorização de localização encerrada' using errcode='42501'; end if;
 update public.rastreamento_dispositivos set visto_em=now(),estado=left(coalesce(p_estado,''),40),detalhe=left(coalesce(p_detalhe,''),300),
  telemetria=coalesce(p_telemetria,'{}'::jsonb),expira_em=greatest(expira_em,now()+interval '30 days')
 where token_hash=dispositivo.token_hash;
end $$;

revoke all on function public.rastreamento_dispositivo_ping(text,text,text,jsonb) from public;
grant execute on function public.rastreamento_dispositivo_ping(text,text,text,jsonb) to anon,authenticated;
