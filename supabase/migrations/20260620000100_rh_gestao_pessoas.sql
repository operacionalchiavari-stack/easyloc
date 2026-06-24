create table if not exists public.rh_colaboradores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome_completo text not null,
  cpf text,
  rg text,
  data_nascimento date,
  telefone text,
  whatsapp text,
  email text,
  endereco text,
  setor text,
  funcao text,
  data_admissao date,
  status text not null default 'Ativo',
  observacoes text,
  foto_url text,
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_colaborador_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  colaborador_id uuid not null references public.rh_colaboradores(id) on delete cascade,
  tipo text not null,
  nome_arquivo text,
  storage_path text,
  mime_type text,
  tamanho bigint,
  criado_por uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.rh_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  colaborador_id uuid not null references public.rh_colaboradores(id) on delete cascade,
  colaborador_nome text,
  setor text,
  tipo text not null,
  data_ocorrencia date not null default current_date,
  descricao text,
  responsavel_id uuid,
  responsavel_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  colaborador_id uuid not null references public.rh_colaboradores(id) on delete cascade,
  colaborador_nome text,
  tipo text not null,
  descricao text,
  status text not null default 'Pendente',
  responsavel_id uuid,
  responsavel_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rh_solicitacao_comentarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  solicitacao_id uuid not null references public.rh_solicitacoes(id) on delete cascade,
  comentario text,
  status_de text,
  status_para text,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamptz not null default now()
);

create table if not exists public.rh_anexos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  origem_tipo text not null,
  origem_id uuid not null,
  tipo_documento text,
  nome_arquivo text,
  storage_path text,
  mime_type text,
  tamanho bigint,
  criado_por uuid,
  created_at timestamptz not null default now()
);

create index if not exists rh_colaboradores_empresa_status_idx
  on public.rh_colaboradores (empresa_id, status);

create index if not exists rh_colaboradores_empresa_setor_funcao_idx
  on public.rh_colaboradores (empresa_id, setor, funcao);

create index if not exists rh_ocorrencias_empresa_data_idx
  on public.rh_ocorrencias (empresa_id, data_ocorrencia desc);

create index if not exists rh_ocorrencias_colaborador_idx
  on public.rh_ocorrencias (colaborador_id, data_ocorrencia desc);

create index if not exists rh_solicitacoes_empresa_status_idx
  on public.rh_solicitacoes (empresa_id, status, updated_at desc);

create index if not exists rh_solicitacoes_colaborador_idx
  on public.rh_solicitacoes (colaborador_id, updated_at desc);

create index if not exists rh_documentos_colaborador_idx
  on public.rh_colaborador_documentos (colaborador_id, created_at desc);

alter table public.rh_colaboradores enable row level security;
alter table public.rh_colaborador_documentos enable row level security;
alter table public.rh_ocorrencias enable row level security;
alter table public.rh_solicitacoes enable row level security;
alter table public.rh_solicitacao_comentarios enable row level security;
alter table public.rh_anexos enable row level security;

drop policy if exists rh_colaboradores_empresa_select on public.rh_colaboradores;
create policy rh_colaboradores_empresa_select on public.rh_colaboradores
for select to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_colaboradores.empresa_id
));

drop policy if exists rh_colaboradores_empresa_write on public.rh_colaboradores;
create policy rh_colaboradores_empresa_write on public.rh_colaboradores
for all to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_colaboradores.empresa_id
))
with check (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_colaboradores.empresa_id
));

drop policy if exists rh_documentos_empresa_select on public.rh_colaborador_documentos;
create policy rh_documentos_empresa_select on public.rh_colaborador_documentos
for select to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_colaborador_documentos.empresa_id
));

drop policy if exists rh_documentos_empresa_write on public.rh_colaborador_documentos;
create policy rh_documentos_empresa_write on public.rh_colaborador_documentos
for all to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_colaborador_documentos.empresa_id
))
with check (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_colaborador_documentos.empresa_id
));

drop policy if exists rh_ocorrencias_empresa_select on public.rh_ocorrencias;
create policy rh_ocorrencias_empresa_select on public.rh_ocorrencias
for select to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_ocorrencias.empresa_id
));

drop policy if exists rh_ocorrencias_empresa_write on public.rh_ocorrencias;
create policy rh_ocorrencias_empresa_write on public.rh_ocorrencias
for all to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_ocorrencias.empresa_id
))
with check (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_ocorrencias.empresa_id
));

drop policy if exists rh_solicitacoes_empresa_select on public.rh_solicitacoes;
create policy rh_solicitacoes_empresa_select on public.rh_solicitacoes
for select to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_solicitacoes.empresa_id
));

drop policy if exists rh_solicitacoes_empresa_write on public.rh_solicitacoes;
create policy rh_solicitacoes_empresa_write on public.rh_solicitacoes
for all to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_solicitacoes.empresa_id
))
with check (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_solicitacoes.empresa_id
));

drop policy if exists rh_comentarios_empresa_select on public.rh_solicitacao_comentarios;
create policy rh_comentarios_empresa_select on public.rh_solicitacao_comentarios
for select to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_solicitacao_comentarios.empresa_id
));

drop policy if exists rh_comentarios_empresa_write on public.rh_solicitacao_comentarios;
create policy rh_comentarios_empresa_write on public.rh_solicitacao_comentarios
for all to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_solicitacao_comentarios.empresa_id
))
with check (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_solicitacao_comentarios.empresa_id
));

drop policy if exists rh_anexos_empresa_select on public.rh_anexos;
create policy rh_anexos_empresa_select on public.rh_anexos
for select to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_anexos.empresa_id
));

drop policy if exists rh_anexos_empresa_write on public.rh_anexos;
create policy rh_anexos_empresa_write on public.rh_anexos
for all to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_anexos.empresa_id
))
with check (exists (
  select 1 from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.empresa_id = rh_anexos.empresa_id
));

insert into storage.buckets (id, name, public)
values ('rh-documentos', 'rh-documentos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('rh-anexos', 'rh-anexos', false)
on conflict (id) do nothing;

drop policy if exists rh_documentos_storage_select on storage.objects;
create policy rh_documentos_storage_select on storage.objects
for select to authenticated
using (
  bucket_id in ('rh-documentos', 'rh-anexos')
  and exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists rh_documentos_storage_insert on storage.objects;
create policy rh_documentos_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id in ('rh-documentos', 'rh-anexos')
  and exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists rh_documentos_storage_update on storage.objects;
create policy rh_documentos_storage_update on storage.objects
for update to authenticated
using (
  bucket_id in ('rh-documentos', 'rh-anexos')
  and exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id in ('rh-documentos', 'rh-anexos')
  and exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists rh_documentos_storage_delete on storage.objects;
create policy rh_documentos_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id in ('rh-documentos', 'rh-anexos')
  and exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);
