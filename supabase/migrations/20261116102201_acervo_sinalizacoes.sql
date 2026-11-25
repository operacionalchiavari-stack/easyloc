begin;
create table public.acervo_sinalizacoes_config (
 empresa_id uuid primary key references public.empresas(id),
 regras jsonb not null default '{}'::jsonb check(jsonb_typeof(regras)='object'),
 updated_at timestamptz not null default now()
);
alter table public.acervo_sinalizacoes_config enable row level security;
create policy ler on public.acervo_sinalizacoes_config for select to authenticated using(eh_membro_empresa(empresa_id) and seguranca_2fa_ok());
create policy criar on public.acervo_sinalizacoes_config for insert to authenticated with check(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar'));
create policy editar on public.acervo_sinalizacoes_config for update to authenticated using(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar')) with check(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar'));
revoke all on public.acervo_sinalizacoes_config from public,anon,authenticated;
grant select,insert,update on public.acervo_sinalizacoes_config to authenticated;
notify pgrst,'reload schema';
commit;
