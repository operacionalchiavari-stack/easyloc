-- Notificações do app (nov/2026, Web Push): celulares que aceitaram receber avisos, fila de avisos e o 1º aviso
-- automático: "Você foi escalado" quando a pessoa entra numa montagem/desmontagem (operacao_etapa_pessoas).
-- O envio é da Edge Function app-push (chaves VAPID nos segredos); o banco chama a função por pg_net logo que um
-- aviso entra na fila, e o pg_cron (job app-push-fila) repassa a cada 2 minutos o que tiver ficado para trás.
-- A URL e o segredo da função ficam em app_push_config (preenchida fora desta migration: o segredo não vai para o git).
create table if not exists public.app_push_assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criado_em timestamptz not null default now(),
  ultimo_envio_em timestamptz
);
create index if not exists app_push_assinaturas_user on public.app_push_assinaturas (user_id);

create table if not exists public.app_push_fila (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  titulo text not null,
  corpo text not null,
  url text,
  chave text unique,              -- evita repetir o mesmo aviso (ex.: escala:<etapa>:<funcionário>)
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  tentativas int not null default 0,
  erro text
);
create index if not exists app_push_fila_pendente on public.app_push_fila (criado_em) where enviado_em is null;

create table if not exists public.app_push_config (id int primary key default 1 check (id = 1), url text not null, segredo text not null);

alter table public.app_push_assinaturas enable row level security;
alter table public.app_push_fila enable row level security;
alter table public.app_push_config enable row level security;
-- Sem políticas: só funções security definer e o servidor mexem nessas tabelas.

create or replace function public.app_push_registrar(p_empresa uuid, p_endpoint text, p_p256dh text, p_auth text, p_aparelho text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso' using errcode = '42501'; end if;
  if coalesce(p_endpoint,'') !~ '^https://' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then raise exception 'Assinatura inválida'; end if;
  insert into app_push_assinaturas (user_id, empresa_id, endpoint, p256dh, auth, aparelho)
  values (auth.uid(), p_empresa, p_endpoint, p_p256dh, p_auth, left(p_aparelho, 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, empresa_id = excluded.empresa_id, p256dh = excluded.p256dh, auth = excluded.auth, aparelho = excluded.aparelho;
end $$;

create or replace function public.app_push_remover(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from app_push_assinaturas where endpoint = p_endpoint and user_id = auth.uid();
end $$;

create or replace function public.app_push_status(p_endpoint text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sem acesso'; end if;
  return jsonb_build_object(
    'este_aparelho', p_endpoint is not null and exists (select 1 from app_push_assinaturas where endpoint = p_endpoint and user_id = auth.uid()),
    'aparelhos', (select count(*) from app_push_assinaturas where user_id = auth.uid()));
end $$;

-- Chama a Edge Function para mandar o que estiver na fila (pg_net, assíncrono: não segura quem gravou).
create or replace function public.app_push_disparar() returns void
language plpgsql security definer set search_path = public as $$
declare c app_push_config;
begin
  select * into c from app_push_config where id = 1;
  if c.url is null then return; end if;
  perform net.http_post(url := c.url, body := jsonb_build_object('acao', 'processar'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-app-push-segredo', c.segredo));
exception when others then raise warning 'app_push_disparar: %', sqlerrm;
end $$;

-- "Você foi escalado": entrou numa montagem/desmontagem que ainda vai acontecer (e tem celular com avisos ligados).
create or replace function public.app_push_escala() returns trigger
language plpgsql security definer set search_path = public as $$
declare e operacao_etapas; p separacoes_pedidos; hoje date := (now() at time zone 'America/Sao_Paulo')::date; dia text; corpo text; nova boolean;
begin
  if new.funcionario_id is null then return new; end if;
  select * into e from operacao_etapas where id = new.etapa_id;
  if e.id is null or e.tipo not in ('montagem','desmontagem') or e.data is null or e.data < hoje then return new; end if;
  if not exists (select 1 from app_push_assinaturas where user_id = new.funcionario_id) then return new; end if;
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
drop trigger if exists app_push_escala on public.operacao_etapa_pessoas;
create trigger app_push_escala after insert on public.operacao_etapa_pessoas for each row execute function public.app_push_escala();

revoke all on function public.app_push_registrar(uuid,text,text,text,text) from public, anon;
revoke all on function public.app_push_remover(text) from public, anon;
revoke all on function public.app_push_status(text) from public, anon;
revoke all on function public.app_push_disparar() from public, anon, authenticated;
revoke all on function public.app_push_escala() from public, anon, authenticated;
grant execute on function public.app_push_registrar(uuid,text,text,text,text) to authenticated;
grant execute on function public.app_push_remover(text) to authenticated;
grant execute on function public.app_push_status(text) to authenticated;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'app-push-fila') then
    perform cron.schedule('app-push-fila', '*/2 * * * *',
      'select public.app_push_disparar() where exists (select 1 from public.app_push_fila where enviado_em is null and tentativas < 5)');
  end if;
end $$;
