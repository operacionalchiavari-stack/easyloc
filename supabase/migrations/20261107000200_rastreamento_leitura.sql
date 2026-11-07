begin;

-- funcionario_pode é interna. A política usa uma função restrita ao usuário
-- autenticado, sem conceder acesso direto à função interna do sistema.
create or replace function public.rastreamento_pode_visualizar(p_empresa uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null
   and public.eh_membro_empresa(p_empresa)
   and public.funcionario_pode(p_empresa,auth.uid(),'logistica.planejamento.visualizar');
$$;
revoke all on function public.rastreamento_pode_visualizar(uuid) from public,anon;
grant execute on function public.rastreamento_pode_visualizar(uuid) to authenticated;

alter policy rastreamento_leitura on public.rastreamento_posicoes
 using (public.rastreamento_pode_visualizar(empresa_id));

notify pgrst, 'reload schema';
commit;
