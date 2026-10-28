create table public.empresa_cronograma_visual (
 empresa_id uuid primary key references public.empresas(id) on delete cascade,
 pedido_apos_dia smallint not null default 1 check(pedido_apos_dia between 0 and 6)
);
alter table public.empresa_cronograma_visual enable row level security;
grant select,insert,update on public.empresa_cronograma_visual to authenticated;
create policy cronograma_visual_ler on public.empresa_cronograma_visual for select to authenticated using(public.eh_membro_empresa(empresa_id));
create policy cronograma_visual_criar on public.empresa_cronograma_visual for insert to authenticated with check(public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id,'configuracoes.empresa.editar'));
create policy cronograma_visual_editar on public.empresa_cronograma_visual for update to authenticated using(public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id,'configuracoes.empresa.editar')) with check(public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id,'configuracoes.empresa.editar'));
