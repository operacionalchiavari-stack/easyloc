-- Assinatura reutilizável da empresa; a imagem é copiada no contrato ao gerar.
create table public.contratos_assinaturas_empresa (
 empresa_id uuid primary key references public.empresas(id) on delete cascade,
 nome_signatario text not null default '' check (length(nome_signatario)<=200),
 imagem text not null default '' check (length(imagem)<=400000 and (imagem='' or imagem ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$')),
 atualizado_em timestamptz not null default now()
);
alter table public.contratos_assinaturas_empresa enable row level security;
create policy assinatura_empresa_membros on public.contratos_assinaturas_empresa
 for all to authenticated using (public.eh_membro_empresa(empresa_id)) with check (public.eh_membro_empresa(empresa_id));
grant select,insert,update,delete on public.contratos_assinaturas_empresa to authenticated;
notify pgrst,'reload schema';
