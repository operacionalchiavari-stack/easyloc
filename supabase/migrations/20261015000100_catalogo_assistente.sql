-- Assistente comercial do catálogo (out/2026).
-- Pedido do usuário: uma IA dentro do catálogo que atende o decorador como uma representante comercial (conversa
-- humanizada, consulta disponibilidade, acrescenta itens ao pedido, sugere combinações, manda imagens de composições
-- montadas a partir dos formatos cadastrados) e que APRENDE com cada decorador (tons, estilos, materiais...).
--
-- Tudo é lido e gravado pela Edge Function `catalogo-assistente` com a service role: o decorador entra por token do
-- catálogo (sem auth.uid()), então nenhuma tabela aqui é aberta direto pro navegador. A equipe só LÊ os perfis
-- (pra ver o que a assistente aprendeu de cada cliente).

create table if not exists public.catalogo_assistente_perfis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  -- 'cliente:<uuid>' (decorador) ou 'usuario:<uuid>' (equipe testando)
  dono text not null,
  cliente_id uuid references public.clientes_empresas(id) on delete cascade,
  usuario_id uuid,
  nome text,
  perfil jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, dono)
);

create table if not exists public.catalogo_assistente_mensagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  dono text not null,
  projeto_id uuid,
  papel text not null check (papel in ('user', 'assistant')),
  conteudo text not null default '',
  anexos jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists catalogo_assistente_mensagens_dono_idx
  on public.catalogo_assistente_mensagens (empresa_id, dono, criado_em desc);

alter table public.catalogo_assistente_perfis enable row level security;
alter table public.catalogo_assistente_mensagens enable row level security;

drop policy if exists catalogo_assistente_perfis_equipe_le on public.catalogo_assistente_perfis;
create policy catalogo_assistente_perfis_equipe_le on public.catalogo_assistente_perfis
  for select to authenticated using (public.eh_membro_empresa(empresa_id));

drop policy if exists catalogo_assistente_mensagens_equipe_le on public.catalogo_assistente_mensagens;
create policy catalogo_assistente_mensagens_equipe_le on public.catalogo_assistente_mensagens
  for select to authenticated using (public.eh_membro_empresa(empresa_id));

-- Imagens que a assistente gera (composições renderizadas) e a cena 3D de cada uma. Leitura pública (a URL vai na
-- conversa); envio só pela Edge Function (service role), por isso nenhuma política de insert.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogo-assistente', 'catalogo-assistente', true, 12582912, array['image/jpeg', 'image/png', 'image/webp', 'application/json'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists catalogo_assistente_le on storage.objects;
create policy catalogo_assistente_le on storage.objects
  for select to anon, authenticated using (bucket_id = 'catalogo-assistente');
