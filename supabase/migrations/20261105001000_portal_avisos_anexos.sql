-- Quadro de avisos da Início (nov/2026): um aviso pode ter uma foto ou um PDF anexado (ex.: arte do Outubro Rosa).
-- O aviso em si fica no Mural do Portal (planilha do motor, servidor na Vercel); o anexo fica aqui, ligado pelo ID
-- do aviso (AVI_xxxxxxxx). O arquivo vai para o bucket público empresas-logos em <empresa>/avisos/.
create table if not exists public.portal_avisos_anexos (
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 aviso_id text not null check (aviso_id ~ '^AVI_[A-Za-z0-9-]{4,40}$'),
 url text not null check (url ~ '^https://'),
 path text not null,
 tipo text not null check (tipo in ('imagem','pdf')),
 nome text not null default '',
 criado_por uuid default auth.uid(),
 created_at timestamptz not null default now(),
 primary key (empresa_id, aviso_id)
);
alter table public.portal_avisos_anexos enable row level security;
revoke all on public.portal_avisos_anexos from anon;
grant select, insert, update, delete on public.portal_avisos_anexos to authenticated;
create policy portal_avisos_anexos_ler on public.portal_avisos_anexos for select to authenticated using (public.eh_membro_empresa(empresa_id));
create policy portal_avisos_anexos_gravar on public.portal_avisos_anexos for insert to authenticated
 with check (public.eh_membro_empresa(empresa_id) and split_part(path,'/',1) = empresa_id::text and split_part(path,'/',2) = 'avisos');
create policy portal_avisos_anexos_trocar on public.portal_avisos_anexos for update to authenticated
 using (public.eh_membro_empresa(empresa_id)) with check (public.eh_membro_empresa(empresa_id) and split_part(path,'/',1) = empresa_id::text and split_part(path,'/',2) = 'avisos');
create policy portal_avisos_anexos_apagar on public.portal_avisos_anexos for delete to authenticated using (public.eh_membro_empresa(empresa_id));
create policy seguranca_2fa on public.portal_avisos_anexos as restrictive for all to authenticated using (public.seguranca_2fa_ok()) with check (public.seguranca_2fa_ok());
notify pgrst, 'reload schema';
