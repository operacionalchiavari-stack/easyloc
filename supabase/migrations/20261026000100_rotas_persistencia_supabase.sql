-- Rotas e equipes deixam de depender do navegador.
begin;
create table if not exists public.logistica_rotas (
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 id text not null,
 dados jsonb not null default '{}'::jsonb,
 atualizado_em timestamptz not null default now(),
 primary key (empresa_id,id)
);
create table if not exists public.logistica_equipes_rotas (
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 rota_id text not null,
 dados jsonb not null default '{}'::jsonb,
 atualizado_em timestamptz not null default now(),
 primary key (empresa_id,rota_id),
 foreign key (empresa_id,rota_id) references public.logistica_rotas(empresa_id,id) on delete cascade
);
alter table public.logistica_rotas enable row level security;
alter table public.logistica_equipes_rotas enable row level security;
grant select,insert,update,delete on public.logistica_rotas,public.logistica_equipes_rotas to authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['logistica_rotas','logistica_equipes_rotas'] loop
 execute format('create policy acesso_empresa on public.%I for select to authenticated using ((public.funcionario_contexto(empresa_id)->>''ativo'')::boolean and public.has_permission(empresa_id,auth.uid(),''logistica.planejamento.visualizar''))',t);
 execute format('create policy escrita_administrador on public.%I for all to authenticated using ((public.funcionario_contexto(empresa_id)->>''ativo'')::boolean and public.has_permission(empresa_id,auth.uid(),''logistica.planejamento.editar'')) with check ((public.funcionario_contexto(empresa_id)->>''ativo'')::boolean and public.has_permission(empresa_id,auth.uid(),''logistica.planejamento.editar''))',t);
 end loop;
end $$;
commit;
