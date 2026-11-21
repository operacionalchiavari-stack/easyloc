-- funcionario_tabela_permitida (19/11/2026): 15 regras de leitura e ~35 funções passam a ação no formato do SQL
-- ('select', 'insert', 'update', 'delete'), mas a função só entendia 'visualizar'/'editar'/'criar'/'excluir' e montava
-- chaves que não existem (ex.: 'estoque.almoxarifado.select'). Resultado: admin sem cadastro de funcionário passava, e
-- qualquer pessoa COM cadastro ficava sem acesso (Compras, Gestão do acervo, O.S, confirmações de entrega/coleta,
-- sublocações, histórico do item...). Agora 'select' vale como 'visualizar' e insert/update/delete como 'editar'.
do $$
declare d text;
begin
  select pg_get_functiondef('public.funcionario_tabela_permitida'::regproc) into d;
  if position('-- acoes do SQL' in d) > 0 then return; end if;
  d := replace(d, E'begin\n select * into f from funcionarios_acesso where id=auth.uid();',
    E'begin\n -- acoes do SQL\n p_acao := case lower(coalesce(p_acao,'''')) when ''select'' then ''visualizar'' when ''insert'' then ''editar'' when ''update'' then ''editar'' when ''delete'' then ''editar'' else p_acao end;\n select * into f from funcionarios_acesso where id=auth.uid();');
  if position('-- acoes do SQL' in d) = 0 then raise exception 'Trecho não encontrado em funcionario_tabela_permitida'; end if;
  execute d;
end $$;
