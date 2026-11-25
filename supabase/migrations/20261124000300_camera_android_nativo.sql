-- Câmera ao vivo pelo app Android nativo (24/11/2026).
-- O serviço nativo (android/.../CameraStreamService.java) transmite com a tela apagada e enquanto a pessoa usa outras telas.
-- Ele não usa o login do site (o refresh token do Supabase é rotativo: dividir a sessão com o WebView derrubaria um dos dois).
-- O site logado pede um "token do aparelho" (camera_dispositivo_iniciar); o serviço usa só esse token, que vale para UMA
-- câmera, expira e não abre nada além dela (camera_disp_*). Mesmo padrão do rastreamento (rastreamento_dispositivos).

alter table public.logistica_cameras
  add column if not exists origem text not null default 'web',
  add column if not exists estado text not null default 'conectando',
  add column if not exists telemetria jsonb not null default '{}'::jsonb,
  add column if not exists motivo_fim text,
  add column if not exists disp_token_hash text,
  add column if not exists disp_expira timestamptz;
create unique index if not exists logistica_cameras_disp_token_idx on public.logistica_cameras(disp_token_hash) where disp_token_hash is not null;

-- Qualidade da transmissão por empresa (ajustável por quem edita o planejamento logístico)
create table if not exists public.logistica_camera_config (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  resolucao text not null default '480p' check (resolucao in ('360p','480p','720p')),
  fps integer not null default 15 check (fps between 5 and 30),
  bitrate_max integer not null default 900 check (bitrate_max between 150 and 3000),
  som_permitido boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
-- Registro: início, fim, interrupções, retomadas, câmera indisponível, foto
create table if not exists public.logistica_camera_eventos (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  camera_id uuid not null references public.logistica_cameras(id) on delete cascade,
  tipo text not null,
  detalhe text,
  usuario_id uuid,
  criado_em timestamptz not null default now()
);
create index if not exists logistica_camera_eventos_cam_idx on public.logistica_camera_eventos(camera_id, criado_em);
-- Quem assistiu cada câmera (no máximo uma linha a cada 10 min por pessoa e câmera)
create table if not exists public.logistica_camera_acessos (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  camera_id uuid not null references public.logistica_cameras(id) on delete cascade,
  usuario_id uuid not null,
  criado_em timestamptz not null default now()
);
create index if not exists logistica_camera_acessos_idx on public.logistica_camera_acessos(camera_id, usuario_id, criado_em desc);

alter table public.logistica_camera_config enable row level security;
alter table public.logistica_camera_eventos enable row level security;
alter table public.logistica_camera_acessos enable row level security;
revoke all on public.logistica_camera_config, public.logistica_camera_eventos, public.logistica_camera_acessos from anon;
revoke insert, update, delete on public.logistica_camera_config, public.logistica_camera_eventos, public.logistica_camera_acessos from authenticated;
grant select on public.logistica_camera_config, public.logistica_camera_eventos, public.logistica_camera_acessos to authenticated;
drop policy if exists camera_config_ler on public.logistica_camera_config;
create policy camera_config_ler on public.logistica_camera_config for select to authenticated using (eh_membro_empresa(empresa_id));
drop policy if exists camera_eventos_ler on public.logistica_camera_eventos;
create policy camera_eventos_ler on public.logistica_camera_eventos for select to authenticated using (public.camera_pode_assistir(empresa_id));
drop policy if exists camera_acessos_ler on public.logistica_camera_acessos;
create policy camera_acessos_ler on public.logistica_camera_acessos for select to authenticated using (public.camera_pode_assistir(empresa_id));
do $$ declare t text; begin
  foreach t in array array['logistica_camera_config','logistica_camera_eventos','logistica_camera_acessos'] loop
    execute format('drop policy if exists seguranca_2fa on public.%I', t);
    execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using (public.seguranca_2fa_ok()) with check (public.seguranca_2fa_ok())', t);
  end loop;
end $$;

create or replace function public.camera_config_json(p_empresa uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('resolucao', coalesce(c.resolucao, '480p'), 'fps', coalesce(c.fps, 15),
    'bitrate_max', coalesce(c.bitrate_max, 900), 'som_permitido', coalesce(c.som_permitido, true))
  from (select 1) x left join logistica_camera_config c on c.empresa_id = p_empresa
$$;
create or replace function public.camera_config(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso.'; end if;
  return camera_config_json(p_empresa) || jsonb_build_object('pode_editar', coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.planejamento.editar'), false));
end $$;
create or replace function public.camera_config_salvar(p_empresa uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.planejamento.editar'), false) then
    raise exception 'Sem permissão para mudar a qualidade das câmeras.'; end if;
  insert into logistica_camera_config(empresa_id, resolucao, fps, bitrate_max, som_permitido, atualizado_em, atualizado_por)
  values (p_empresa, coalesce(p_config->>'resolucao', '480p'), coalesce((p_config->>'fps')::int, 15),
          coalesce((p_config->>'bitrate_max')::int, 900), coalesce((p_config->>'som_permitido')::boolean, true), now(), auth.uid())
  on conflict (empresa_id) do update set resolucao = excluded.resolucao, fps = excluded.fps, bitrate_max = excluded.bitrate_max,
    som_permitido = excluded.som_permitido, atualizado_em = now(), atualizado_por = auth.uid();
  return camera_config(p_empresa);
end $$;

create or replace function public.camera_evento_(p_cam uuid, p_tipo text, p_detalhe text default null)
returns void language sql security definer set search_path = public as $$
  insert into logistica_camera_eventos(empresa_id, camera_id, tipo, detalhe, usuario_id)
  select empresa_id, id, p_tipo, p_detalhe, auth.uid() from logistica_cameras where id = p_cam
$$;

-- O site (logado) liga a câmera e entrega ao serviço nativo um token que só vale para esta câmera.
create or replace function public.camera_dispositivo_iniciar(p_empresa uuid, p_aparelho text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_token text;
begin
  r := camera_iniciar(p_empresa, null, coalesce(nullif(p_aparelho, ''), 'App Android'));
  v_token := rtrim(translate(encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'base64'), '+/', '-_'), '=');
  update logistica_cameras set origem = 'android', estado = 'conectando',
         disp_token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), disp_expira = now() + interval '16 hours'
   where id = (r->>'id')::uuid;
  perform camera_evento_((r->>'id')::uuid, 'inicio', 'App Android');
  return r || jsonb_build_object('token', v_token, 'config', camera_config_json(p_empresa));
end $$;

create or replace function public.camera_disp_cam_(p_token text)
returns public.logistica_cameras language plpgsql stable security definer set search_path = public as $$
declare c logistica_cameras;
begin
  select * into c from logistica_cameras
   where disp_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and disp_expira > now();
  if c.id is null then raise exception 'Autorização da câmera encerrada.'; end if;
  if exists(select 1 from funcionarios_acesso f where f.id = c.usuario_id and (not f.ativo or f.empresa_id <> c.empresa_id))
     or not exists(select 1 from usuarios_empresas ue where ue.user_id = c.usuario_id and ue.empresa_id = c.empresa_id) then
    raise exception 'Autorização da câmera encerrada.';
  end if;
  return c;
end $$;

-- Batimento do aparelho (a cada 15 s): estado e telemetria (bateria, temperatura, rede, tela, resolução, fps…)
create or replace function public.camera_disp_ping(p_token text, p_estado text default null, p_telemetria jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c logistica_cameras; v_estado text;
begin
  c := camera_disp_cam_(p_token);
  if c.status = 'encerrada' and c.motivo_fim is distinct from 'sem_sinal' then
    return jsonb_build_object('encerrada', true, 'motivo', c.motivo_fim);
  end if;
  v_estado := case when p_estado in ('ao_vivo','conectando','reconectando','instavel','camera_indisponivel','pausada','sem_conexao') then p_estado else c.estado end;
  if c.visto_em < now() - interval '60 seconds' then
    perform camera_evento_(c.id, 'retomada', 'Sem sinal por ' || round(extract(epoch from now() - c.visto_em)) || ' s');
  end if;
  if v_estado is distinct from c.estado and v_estado in ('camera_indisponivel','pausada') then
    perform camera_evento_(c.id, v_estado, p_telemetria->>'motivo');
  end if;
  update logistica_cameras set visto_em = now(), status = 'ao_vivo', encerrada_em = null, motivo_fim = null, estado = v_estado,
         telemetria = coalesce(p_telemetria, telemetria), disp_expira = greatest(disp_expira, now() + interval '2 hours')
   where id = c.id;
  return jsonb_build_object('encerrada', false, 'config', camera_config_json(c.empresa_id));
end $$;

create or replace function public.camera_disp_sinal(p_token text, p_para text, p_tipo text, p_dados jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare c logistica_cameras;
begin
  c := camera_disp_cam_(p_token);
  if p_para = 'cam' or p_tipo not in ('oferta','ice','sair') then raise exception 'Sinal inválido.'; end if;
  insert into logistica_camera_sinais(empresa_id, camera_id, de, para, tipo, dados, usuario_id)
  values (c.empresa_id, c.id, 'cam', left(p_para, 64), p_tipo, p_dados, c.usuario_id);
end $$;

create or replace function public.camera_disp_sinais(p_token text, p_depois bigint default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c logistica_cameras; r jsonb;
begin
  c := camera_disp_cam_(p_token);
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'de', s.de, 'tipo', s.tipo, 'dados', s.dados, 'criado_em', s.criado_em) order by s.id), '[]'::jsonb)
    into r from (select * from logistica_camera_sinais where camera_id = c.id and para = 'cam' and id > coalesce(p_depois, 0)
                  and criado_em > now() - interval '10 minutes' order by id limit 200) s;
  return r;
end $$;

create or replace function public.camera_disp_encerrar(p_token text, p_motivo text default 'funcionario')
returns void language plpgsql security definer set search_path = public as $$
declare c logistica_cameras;
begin
  c := camera_disp_cam_(p_token);
  update logistica_cameras set status = 'encerrada', encerrada_em = now(), estado = 'encerrada',
         motivo_fim = left(coalesce(p_motivo, 'funcionario'), 40), disp_token_hash = null, disp_expira = null
   where id = c.id;
  perform camera_evento_(c.id, 'fim', p_motivo);
end $$;

-- Encerrar pelo site também registra e desliga o token do aparelho
create or replace function public.camera_encerrar(p_camera uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update logistica_cameras set status = 'encerrada', encerrada_em = now(), estado = 'encerrada',
         motivo_fim = coalesce(motivo_fim, case when usuario_id = auth.uid() then 'funcionario' else 'central' end),
         disp_token_hash = null, disp_expira = null
   where id = p_camera and (usuario_id = auth.uid() or camera_pode_assistir(empresa_id)) and status = 'ao_vivo';
  if found then perform camera_evento_(p_camera, 'fim', 'pelo site'); end if;
end $$;

-- Quem assiste: registra o acesso (uma linha a cada 10 min por pessoa e câmera)
create or replace function public.camera_sinal(p_camera uuid, p_de text, p_para text, p_tipo text, p_dados jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare c logistica_cameras;
begin
  select * into c from logistica_cameras where id = p_camera;
  if c.id is null then raise exception 'Câmera não encontrada.'; end if;
  if p_de = 'cam' then
    if c.usuario_id is distinct from auth.uid() then raise exception 'Sinal inválido.'; end if;
  elsif not camera_pode_assistir(c.empresa_id) then
    raise exception 'Sem acesso a esta câmera.';
  elsif p_para <> 'cam' then
    raise exception 'Sinal inválido.';
  end if;
  if p_tipo = 'pedido' and p_de <> 'cam' and not exists(select 1 from logistica_camera_acessos a where a.camera_id = c.id
        and a.usuario_id = auth.uid() and a.criado_em > now() - interval '10 minutes') then
    insert into logistica_camera_acessos(empresa_id, camera_id, usuario_id) values (c.empresa_id, c.id, auth.uid());
  end if;
  insert into logistica_camera_sinais(empresa_id, camera_id, de, para, tipo, dados)
  values (c.empresa_id, c.id, left(p_de, 64), left(p_para, 64), p_tipo, p_dados);
end $$;

-- Painel: estado, telemetria, origem e motivo do fim
create or replace function public.camera_painel(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not camera_pode_assistir(p_empresa) then raise exception 'Sem acesso às câmeras.'; end if;
  select coalesce(jsonb_agg(x order by (x->>'no_ar')::boolean desc, x->>'iniciada_em' desc), '[]'::jsonb) into r from (
    select jsonb_build_object(
      'id', k.id, 'titulo', k.titulo, 'status', k.status, 'iniciada_em', k.iniciada_em, 'visto_em', k.visto_em,
      'encerrada_em', k.encerrada_em, 'usuario_id', k.usuario_id, 'usuario_nome', k.usuario_nome, 'aparelho', k.aparelho,
      'origem', k.origem, 'estado', k.estado, 'telemetria', k.telemetria, 'motivo_fim', k.motivo_fim,
      'no_ar', k.status = 'ao_vivo' and k.visto_em > now() - interval '60 seconds',
      'tipo', e.tipo, 'data', e.data, 'hora', to_char(e.hora, 'HH24:MI'),
      'numero', p.numero_pedido, 'cliente', p.cliente_nome, 'local', p.local_nome,
      'cliente_foto', (select c.catalogo_logo_url from clientes_empresas c where c.empresa_id = p_empresa
                        and (c.id = p.cliente_id or (p.cliente_id is null and lower(c.nome_razao) = lower(p.cliente_nome))) limit 1)
    ) x
    from logistica_cameras k
    left join operacao_etapas e on e.id = k.etapa_id
    left join separacoes_pedidos p on p.id = k.pedido_id
    where k.empresa_id = p_empresa
      and (k.status = 'ao_vivo' or k.encerrada_em > now() - interval '12 hours')
      and k.iniciada_em > now() - interval '24 hours'
  ) t;
  return r;
end $$;

revoke all on function public.camera_disp_cam_(text), public.camera_evento_(uuid, text, text), public.camera_config_json(uuid) from public, anon, authenticated;
revoke all on function public.camera_disp_ping(text, text, jsonb), public.camera_disp_sinal(text, text, text, jsonb),
  public.camera_disp_sinais(text, bigint), public.camera_disp_encerrar(text, text) from public;
grant execute on function public.camera_disp_ping(text, text, jsonb), public.camera_disp_sinal(text, text, text, jsonb),
  public.camera_disp_sinais(text, bigint), public.camera_disp_encerrar(text, text) to anon, authenticated;
revoke all on function public.camera_dispositivo_iniciar(uuid, text), public.camera_config(uuid), public.camera_config_salvar(uuid, jsonb) from public, anon;
grant execute on function public.camera_dispositivo_iniciar(uuid, text), public.camera_config(uuid), public.camera_config_salvar(uuid, jsonb) to authenticated;
