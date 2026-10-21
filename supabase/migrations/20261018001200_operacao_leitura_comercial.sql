-- O comercial acompanha a lista; toda alteração passa pela gravação transacional.
create or replace function public.operacao_pode_ler_pedidos(p_empresa uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.eh_membro_empresa(p_empresa) and public.funcionario_pode(p_empresa,auth.uid(),'comercial.pedidos.visualizar');
$$;
revoke all on function public.operacao_pode_ler_pedidos(uuid) from public,anon;
grant execute on function public.operacao_pode_ler_pedidos(uuid) to authenticated;
drop policy if exists funcionario_acesso_select on public.separacoes_pedidos;
create policy funcionario_acesso_select on public.separacoes_pedidos as restrictive for select to authenticated
using(public.eh_membro_empresa(empresa_id) and (
  public.funcionario_tabela_permitida(empresa_id,'separacoes_pedidos','visualizar')
  or public.operacao_pode_ler_pedidos(empresa_id)));
drop policy if exists funcionario_acesso_select on public.separacoes_itens;
create policy funcionario_acesso_select on public.separacoes_itens as restrictive for select to authenticated
using(public.eh_membro_empresa(empresa_id) and (
  public.funcionario_tabela_permitida(empresa_id,'separacoes_itens','visualizar')
  or public.operacao_pode_ler_pedidos(empresa_id)));
