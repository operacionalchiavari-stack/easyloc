begin;
create table public.app_android_push_dispositivos (
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 dispositivo_id uuid not null,token text not null unique,binding_hash text not null unique,
 criado_em timestamptz not null default now(),ultimo_envio_em timestamptz,
 primary key(empresa_id,user_id,dispositivo_id)
);
alter table public.app_android_push_dispositivos enable row level security;
revoke all on public.app_android_push_dispositivos from public,anon,authenticated;
grant all on public.app_android_push_dispositivos to service_role;

create or replace function public.app_android_push_registrar(p_empresa uuid,p_dispositivo uuid,p_token text,p_binding text)
returns void language plpgsql security definer set search_path=public as $$
declare contexto jsonb;
begin
 contexto:=public.funcionario_contexto(p_empresa);
 if auth.uid() is null or not coalesce((contexto->>'ativo')::boolean,false) or coalesce((contexto->>'dois_fatores_pendente')::boolean,false) then raise exception 'Sem acesso' using errcode='42501'; end if;
 if coalesce(length(p_token),0) not between 32 and 4096 or p_binding is null or p_binding !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Autorização inválida'; end if;
 delete from public.app_android_push_dispositivos where token=p_token and (user_id<>auth.uid() or empresa_id<>p_empresa);
 insert into public.app_android_push_dispositivos(empresa_id,user_id,dispositivo_id,token,binding_hash)
 values(p_empresa,auth.uid(),p_dispositivo,p_token,encode(sha256(convert_to(p_binding,'UTF8')),'hex'))
 on conflict(empresa_id,user_id,dispositivo_id) do update set token=excluded.token,binding_hash=excluded.binding_hash;
 -- Migração por usuário: não duplica o mesmo aviso no PWA antigo.
 delete from public.app_push_assinaturas where user_id=auth.uid() and empresa_id=p_empresa;
end $$;

create or replace function public.app_android_push_atualizar(p_binding text,p_token text)
returns void language plpgsql security definer set search_path=public as $$
declare dispositivo public.app_android_push_dispositivos;
begin
 select * into dispositivo from public.app_android_push_dispositivos where binding_hash=encode(sha256(convert_to(p_binding,'UTF8')),'hex') for update;
 if dispositivo.user_id is null or not exists(select 1 from public.usuarios_empresas u where u.user_id=dispositivo.user_id and u.empresa_id=dispositivo.empresa_id)
 or exists(select 1 from public.funcionarios_acesso f where f.id=dispositivo.user_id and (not f.ativo or f.empresa_id<>dispositivo.empresa_id)) then raise exception 'Autorização encerrada' using errcode='42501'; end if;
 if coalesce(length(p_token),0) not between 32 and 4096 then raise exception 'Token inválido'; end if;
 update public.app_android_push_dispositivos set token=p_token where binding_hash=dispositivo.binding_hash;
end $$;

create or replace function public.app_android_push_encerrar(p_binding text)
returns void language sql security definer set search_path=public as $$
 delete from public.app_android_push_dispositivos where binding_hash=encode(sha256(convert_to(p_binding,'UTF8')),'hex');
$$;

revoke all on function public.app_android_push_registrar(uuid,uuid,text,text) from public,anon;
grant execute on function public.app_android_push_registrar(uuid,uuid,text,text) to authenticated;
revoke all on function public.app_android_push_atualizar(text,text) from public;
grant execute on function public.app_android_push_atualizar(text,text) to anon,authenticated;
revoke all on function public.app_android_push_encerrar(text) from public;
grant execute on function public.app_android_push_encerrar(text) to anon,authenticated;
create or replace function public.app_push_escala() returns trigger
language plpgsql security definer set search_path = public as $$
declare e operacao_etapas; p separacoes_pedidos; hoje date := (now() at time zone 'America/Sao_Paulo')::date; dia text; corpo text; nova boolean;
begin
  if new.funcionario_id is null then return new; end if;
  select * into e from operacao_etapas where id = new.etapa_id;
  if e.id is null or e.tipo not in ('montagem','desmontagem') or e.data is null or e.data < hoje then return new; end if;
  if not exists (select 1 from app_push_assinaturas where user_id = new.funcionario_id and empresa_id=e.empresa_id) and not exists (select 1 from app_android_push_dispositivos where user_id=new.funcionario_id and empresa_id=e.empresa_id) then return new; end if;
  select * into p from separacoes_pedidos where id = e.pedido_id;
  dia := case when e.data = hoje then 'hoje' when e.data = hoje + 1 then 'amanhã'
              else (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow from e.data)::int + 1] || ', ' || to_char(e.data, 'DD/MM') end;
  corpo := initcap(e.tipo) || coalesce(' · Pedido ' || nullif(p.numero_pedido, ''), '') || ' · ' || dia || coalesce(' às ' || to_char(e.hora, 'HH24:MI'), '')
           || coalesce(chr(10) || nullif(concat_ws(' – ', nullif(p.cliente_nome, ''), nullif(p.local_nome, '')), ''), '')
           || case when new.papel = 'responsavel' then chr(10) || 'Você é o responsável.' else '' end;
  insert into app_push_fila (user_id, empresa_id, titulo, corpo, url, chave)
  values (new.funcionario_id, e.empresa_id, 'Você foi escalado', corpo,
          'Modulos/Chiavari/Cronograma/montador.html?app=1&etapa=' || e.id, 'escala:' || e.id || ':' || new.funcionario_id)
  on conflict (chave) do nothing;
  get diagnostics nova = row_count;
  if nova then perform app_push_disparar(); end if;
  return new;
exception when others then raise warning 'app_push_escala: %', sqlerrm; return new;
end $$;

notify pgrst, 'reload schema';
commit;
