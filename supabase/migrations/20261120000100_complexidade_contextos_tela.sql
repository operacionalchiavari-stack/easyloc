-- Painel de Complexidade calcula no navegador com a regra atual (nov/2026): a tela lê os mesmos contextos que o
-- servidor usava. Só quem é da empresa e pode ver o painel (mesma regra da rota: estoque.insumos.visualizar).
create or replace function public.complexidade_contextos_tela(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not public.eh_membro_empresa(p_empresa) then raise exception 'Sem acesso'; end if;
  if not public.operacao_pode(p_empresa, 'estoque.insumos.visualizar') then raise exception 'Sem permissão para ver a complexidade'; end if;
  return public.complexidade_contextos(p_empresa);
end $$;
revoke all on function public.complexidade_contextos_tela(uuid) from public, anon;
grant execute on function public.complexidade_contextos_tela(uuid) to authenticated;
