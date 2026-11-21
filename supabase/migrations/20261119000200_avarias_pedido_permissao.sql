-- operacao_avarias_pedido (19/11/2026): conferia a permissão com a ação 'select', que não existe no catálogo de permissões
-- (vira 'logistica.separacao.select'). Admin sem cadastro de funcionário passava; qualquer pessoa com cadastro era recusada
-- com "Sem acesso a este pedido" na triagem da volta. A ação certa é 'visualizar'.
do $$
declare d text;
begin
  select pg_get_functiondef('public.operacao_avarias_pedido'::regproc) into d;
  if position('''separacoes_pedidos'',''select''' in d) = 0 then return; end if;
  d := replace(d, '''separacoes_pedidos'',''select''', '''separacoes_pedidos'',''visualizar''');
  d := replace(d, '''itens'',''select''', '''itens'',''visualizar''');
  execute d;
end $$;
