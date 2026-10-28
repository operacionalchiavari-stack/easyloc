create table public.rh_cadastro_opcoes (
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 tipo text not null check(tipo in ('setor','cargo')),
 nome text not null check(length(trim(nome)) between 1 and 100),
 ativo boolean not null default true
);
create unique index rh_cadastro_opcoes_nome on public.rh_cadastro_opcoes(empresa_id,tipo,lower(trim(nome)));
alter table public.rh_cadastro_opcoes enable row level security;
grant select,insert,update on public.rh_cadastro_opcoes to authenticated;
create policy rh_opcoes_ler on public.rh_cadastro_opcoes for select to authenticated using(public.eh_membro_empresa(empresa_id));
create policy rh_opcoes_criar on public.rh_cadastro_opcoes for insert to authenticated with check(public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id,'configuracoes.empresa.editar'));
create policy rh_opcoes_editar on public.rh_cadastro_opcoes for update to authenticated using(public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id,'configuracoes.empresa.editar')) with check(public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id,'configuracoes.empresa.editar'));
