-- Câmeras ao vivo das montagens (nov/2026).
-- O celular da equipe (app › Câmera ao vivo) transmite a montagem por WebRTC; a Logística assiste no Painel Logístico › Câmeras.
-- O vídeo vai direto do celular para quem assiste (ponto a ponto). O banco só guarda quais câmeras estão no ar e
-- troca os "sinais" de conexão (oferta, resposta, ICE), que chegam pelo Realtime do Supabase (postgres_changes com RLS).

create table if not exists public.logistica_cameras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  etapa_id uuid references public.operacao_etapas(id) on delete set null,
  pedido_id uuid references public.separacoes_pedidos(id) on delete set null,
  titulo text not null default '',
  usuario_id uuid not null default auth.uid(),
  usuario_nome text not null default '',
  aparelho text not null default '',
  status text not null default 'ao_vivo' check (status in ('ao_vivo','encerrada')),
  iniciada_em timestamptz not null default now(),
  visto_em timestamptz not null default now(),
  encerrada_em timestamptz
);
create index if not exists logistica_cameras_empresa_idx on public.logistica_cameras(empresa_id, status, visto_em desc);

create table if not exists public.logistica_camera_sinais (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  camera_id uuid not null references public.logistica_cameras(id) on delete cascade,
  de text not null,
  para text not null,
  tipo text not null check (tipo in ('pedido','oferta','resposta','ice','sair')),
  dados jsonb,
  usuario_id uuid not null default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists logistica_camera_sinais_cam_idx on public.logistica_camera_sinais(camera_id, criado_em);
create index if not exists logistica_camera_sinais_tempo_idx on public.logistica_camera_sinais(criado_em);

-- Quem assiste: Painel Logístico.
create or replace function public.camera_pode_assistir(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and eh_membro_empresa(p_empresa)
     and coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.planejamento.visualizar'), false)
$$;

-- Quem transmite: equipe de Montagem, Supervisor de Montagem ou quem planeja a logística.
create or replace function public.camera_pode_transmitir(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and eh_membro_empresa(p_empresa) and (
    exists(select 1 from funcionarios_acesso f where f.id = auth.uid() and f.empresa_id = p_empresa and f.ativo and f.equipe_operacional = 'montagem')
    or coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.cronograma.montagem'), false)
    or coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.planejamento.visualizar'), false))
$$;

alter table public.logistica_cameras enable row level security;
alter table public.logistica_camera_sinais enable row level security;
revoke all on public.logistica_cameras from anon;
revoke all on public.logistica_camera_sinais from anon;
revoke insert, update, delete on public.logistica_cameras from authenticated;
revoke insert, update, delete on public.logistica_camera_sinais from authenticated;
grant select on public.logistica_cameras to authenticated;
grant select on public.logistica_camera_sinais to authenticated;

drop policy if exists camera_ler on public.logistica_cameras;
create policy camera_ler on public.logistica_cameras for select to authenticated
  using (usuario_id = auth.uid() or public.camera_pode_assistir(empresa_id));
drop policy if exists seguranca_2fa on public.logistica_cameras;
create policy seguranca_2fa on public.logistica_cameras as restrictive for all to authenticated
  using (public.seguranca_2fa_ok()) with check (public.seguranca_2fa_ok());

-- Sinal: quem transmite lê os da sua câmera; quem assiste lê os endereçados a ele (o "para" é o id da janela, que só ele sabe)
drop policy if exists camera_sinal_ler on public.logistica_camera_sinais;
create policy camera_sinal_ler on public.logistica_camera_sinais for select to authenticated
  using (
    exists(select 1 from logistica_cameras c where c.id = camera_id and c.usuario_id = auth.uid())
    or (usuario_id <> auth.uid() and public.camera_pode_assistir(empresa_id))
  );
drop policy if exists seguranca_2fa on public.logistica_camera_sinais;
create policy seguranca_2fa on public.logistica_camera_sinais as restrictive for all to authenticated
  using (public.seguranca_2fa_ok()) with check (public.seguranca_2fa_ok());

do $$ begin
  begin alter publication supabase_realtime add table public.logistica_cameras; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.logistica_camera_sinais; exception when duplicate_object then null; end;
end $$;

-- Etapas que podem ser transmitidas (hoje e amanhã; ontem também, para evento que vira a noite)
create or replace function public.camera_etapas(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare todos boolean; r jsonb;
begin
  if not camera_pode_transmitir(p_empresa) then raise exception 'Sem acesso à câmera ao vivo.'; end if;
  todos := coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.cronograma.montagem'), false)
        or coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.planejamento.visualizar'), false);
  select coalesce(jsonb_agg(x order by x->>'data', x->>'hora'), '[]'::jsonb) into r from (
    select jsonb_build_object(
      'id', e.id, 'tipo', e.tipo, 'nome', e.nome, 'data', e.data, 'hora', to_char(e.hora, 'HH24:MI'),
      'pedido_id', p.id, 'numero', p.numero_pedido, 'cliente', p.cliente_nome, 'local', p.local_nome,
      'cliente_foto', (select c.catalogo_logo_url from clientes_empresas c where c.empresa_id = p_empresa
                        and (c.id = p.cliente_id or (p.cliente_id is null and lower(c.nome_razao) = lower(p.cliente_nome))) limit 1),
      'escalado', exists(select 1 from operacao_etapa_pessoas ep where ep.etapa_id = e.id and ep.funcionario_id = auth.uid()),
      'ao_vivo', exists(select 1 from logistica_cameras k where k.etapa_id = e.id and k.status = 'ao_vivo' and k.visto_em > now() - interval '90 seconds')
    ) x
    from operacao_etapas e
    left join separacoes_pedidos p on p.id = e.pedido_id
    where e.empresa_id = p_empresa
      and e.tipo in ('montagem','desmontagem')
      and e.data between (now() at time zone 'America/Sao_Paulo')::date - 1 and (now() at time zone 'America/Sao_Paulo')::date + 1
      and coalesce(p.status, 'aprovado') not in ('cancelado')
      and (todos or exists(select 1 from operacao_etapa_pessoas ep where ep.etapa_id = e.id and ep.funcionario_id = auth.uid()))
  ) t;
  return r;
end $$;

create or replace function public.camera_iniciar(p_empresa uuid, p_etapa uuid, p_aparelho text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare e operacao_etapas; p separacoes_pedidos; nome text; v_id uuid; titulo text;
begin
  if not camera_pode_transmitir(p_empresa) then raise exception 'Sem acesso à câmera ao vivo.'; end if;
  select * into e from operacao_etapas where id = p_etapa and empresa_id = p_empresa;
  if e.id is null then raise exception 'Montagem não encontrada.'; end if;
  select * into p from separacoes_pedidos where id = e.pedido_id;
  nome := coalesce(nullif((select f.nome from funcionarios_acesso f where f.id = auth.uid()), ''),
                   nullif((select u.nome from usuarios u where u.id = auth.uid()), ''), 'Equipe');
  titulo := initcap(coalesce(e.tipo, 'montagem')) || coalesce(' · Pedido ' || p.numero_pedido, '');
  -- o mesmo celular só tem uma câmera no ar
  update logistica_cameras set status = 'encerrada', encerrada_em = now()
   where usuario_id = auth.uid() and empresa_id = p_empresa and status = 'ao_vivo';
  insert into logistica_cameras(empresa_id, etapa_id, pedido_id, titulo, usuario_nome, aparelho)
  values (p_empresa, e.id, p.id, titulo, nome, left(coalesce(p_aparelho, ''), 120)) returning id into v_id;
  delete from logistica_camera_sinais where criado_em < now() - interval '2 hours';
  return jsonb_build_object('id', v_id, 'titulo', titulo);
end $$;

create or replace function public.camera_ping(p_camera uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update logistica_cameras set visto_em = now(), status = 'ao_vivo', encerrada_em = null
   where id = p_camera and usuario_id = auth.uid();
  if not found then raise exception 'Câmera não encontrada.'; end if;
end $$;

create or replace function public.camera_encerrar(p_camera uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update logistica_cameras set status = 'encerrada', encerrada_em = now()
   where id = p_camera and (usuario_id = auth.uid() or camera_pode_assistir(empresa_id));
end $$;

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
  insert into logistica_camera_sinais(empresa_id, camera_id, de, para, tipo, dados)
  values (c.empresa_id, c.id, left(p_de, 64), left(p_para, 64), p_tipo, p_dados);
end $$;

-- Câmeras para o painel (no ar e as encerradas nas últimas 12 horas)
create or replace function public.camera_painel(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not camera_pode_assistir(p_empresa) then raise exception 'Sem acesso às câmeras.'; end if;
  select coalesce(jsonb_agg(x order by (x->>'no_ar')::boolean desc, x->>'iniciada_em' desc), '[]'::jsonb) into r from (
    select jsonb_build_object(
      'id', k.id, 'titulo', k.titulo, 'status', k.status, 'iniciada_em', k.iniciada_em, 'visto_em', k.visto_em,
      'encerrada_em', k.encerrada_em, 'usuario_id', k.usuario_id, 'usuario_nome', k.usuario_nome, 'aparelho', k.aparelho,
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

revoke all on function public.camera_etapas(uuid), public.camera_iniciar(uuid, uuid, text), public.camera_ping(uuid),
  public.camera_encerrar(uuid), public.camera_sinal(uuid, text, text, text, jsonb), public.camera_painel(uuid),
  public.camera_pode_assistir(uuid), public.camera_pode_transmitir(uuid) from public, anon;
grant execute on function public.camera_etapas(uuid), public.camera_iniciar(uuid, uuid, text), public.camera_ping(uuid),
  public.camera_encerrar(uuid), public.camera_sinal(uuid, text, text, text, jsonb), public.camera_painel(uuid),
  public.camera_pode_assistir(uuid), public.camera_pode_transmitir(uuid) to authenticated;

-- Cartão "Câmera ao vivo" no app do celular
create or replace function public.app_celular_modulos(p_empresa uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare f funcionarios_acesso; montador boolean; ger_com boolean; ger_fin boolean; ag jsonb;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso'; end if;
 select * into f from funcionarios_acesso where id = auth.uid() and empresa_id = p_empresa and ativo;
 montador := p_empresa = gs_empresa_dona() and f.id is not null and f.equipe_operacional = 'montagem';
 ger_com := coalesce(funcionario_pode(p_empresa, auth.uid(), 'comercial.pedidos.visualizar'), false);
 ger_fin := coalesce(funcionario_pode(p_empresa, auth.uid(), 'financeiro.fluxo.visualizar'), false);
 ag := jsonb_build_object(
  'ag_helena', coalesce(funcionario_pode(p_empresa, auth.uid(), 'comercial.catalogo.visualizar'), false),
  'ag_clara', ger_fin,
  'ag_cora', coalesce(funcionario_pode(p_empresa, auth.uid(), 'estoque.itens.visualizar'), false),
  'ag_carla', coalesce(funcionario_pode(p_empresa, auth.uid(), 'geral.solicitacoes.visualizar'), false),
  'ag_marcos', coalesce(funcionario_pode(p_empresa, auth.uid(), 'geral.manutencao.visualizar'), false),
  'ag_ideia', true);
 return jsonb_build_object(
  'triagem', coalesce(funcionario_tabela_permitida(p_empresa, 'separacoes_itens', 'select'), false),
  'expedicao', coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.expedicao.visualizar'), false),
  'montagem', montador or (p_empresa = gs_empresa_dona() and coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.cronograma.montagem'), false)),
  'camera', camera_pode_transmitir(p_empresa),
  'catalogo', coalesce(funcionario_pode(p_empresa, auth.uid(), 'comercial.catalogo.visualizar'), false),
  'bonus', p_empresa = gs_empresa_dona() and (f.id is not null or coalesce(funcionario_pode(p_empresa, auth.uid(), 'rh.colaboradores.visualizar'), false)),
  'gerencial', ger_com or ger_fin,
  'ger_comercial', ger_com,
  'ger_financeiro', ger_fin,
  'agentes', true,
  'nome', coalesce(nullif(f.nome, ''), (select u.nome from usuarios u where u.id = auth.uid()), '')) || ag;
end $function$;
