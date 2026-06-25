create extension if not exists pgcrypto;

create table if not exists public.zapi_integracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  status text not null default 'nao_configurado'
    check (status in ('nao_configurado','aguardando_qr','conectado','desconectado','erro')),
  numero_conectado text,
  instancia_id_mascarado text,
  ultimo_qr_at timestamptz,
  ultima_sincronizacao timestamptz,
  ultimo_envio_at timestamptz,
  ultimo_erro text,
  mensagens_enviadas integer not null default 0,
  mensagens_falhas integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id)
);

create table if not exists public.zapi_credenciais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  integracao_id uuid not null references public.zapi_integracoes(id) on delete cascade,
  instance_id text not null,
  instance_token text not null,
  client_token text not null,
  webhook_secret text not null default md5(random()::text || clock_timestamp()::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id),
  unique (instance_id)
);

create table if not exists public.zapi_mensagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid,
  usuario_nome text,
  numero text not null,
  tipo text not null default 'texto'
    check (tipo in ('texto','imagem','pdf','audio','documento')),
  origem text not null default 'manual',
  mensagem text,
  legenda text,
  arquivo_url text,
  zapi_message_id text,
  zapi_zaap_id text,
  status text not null default 'pendente'
    check (status in ('pendente','enviado','falha','recebido','lido')),
  erro text,
  payload jsonb,
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zapi_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  instance_id text,
  tipo text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists zapi_integracoes_empresa_idx
  on public.zapi_integracoes(empresa_id);

create index if not exists zapi_mensagens_empresa_created_idx
  on public.zapi_mensagens(empresa_id, created_at desc);

create index if not exists zapi_mensagens_empresa_status_idx
  on public.zapi_mensagens(empresa_id, status, created_at desc);

create index if not exists zapi_eventos_empresa_created_idx
  on public.zapi_eventos(empresa_id, created_at desc);

create index if not exists zapi_eventos_instance_idx
  on public.zapi_eventos(instance_id, created_at desc);

alter table public.zapi_integracoes enable row level security;
alter table public.zapi_credenciais enable row level security;
alter table public.zapi_mensagens enable row level security;
alter table public.zapi_eventos enable row level security;

drop policy if exists zapi_integracoes_empresa_select on public.zapi_integracoes;
create policy zapi_integracoes_empresa_select on public.zapi_integracoes
for select using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = zapi_integracoes.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists zapi_mensagens_empresa_select on public.zapi_mensagens;
create policy zapi_mensagens_empresa_select on public.zapi_mensagens
for select using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = zapi_mensagens.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists zapi_eventos_empresa_select on public.zapi_eventos;
create policy zapi_eventos_empresa_select on public.zapi_eventos
for select using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = zapi_eventos.empresa_id
    and ue.user_id = auth.uid()
));

insert into public.permissoes_catalogo (chave, modulo, submodulo, acao, descricao, sensivel, ordem) values
('configuracoes.integracoes.whatsapp.visualizar','Configuracoes','Integracoes WhatsApp','visualizar','Visualizar integracao WhatsApp Z-API',true,920),
('configuracoes.integracoes.whatsapp.editar','Configuracoes','Integracoes WhatsApp','editar','Configurar e desconectar WhatsApp Z-API',true,921),
('configuracoes.integracoes.whatsapp.enviar','Configuracoes','Integracoes WhatsApp','criar','Enviar mensagens pela integracao WhatsApp',true,922)
on conflict (chave) do update set
  modulo = excluded.modulo,
  submodulo = excluded.submodulo,
  acao = excluded.acao,
  descricao = excluded.descricao,
  sensivel = excluded.sensivel,
  ordem = excluded.ordem;
