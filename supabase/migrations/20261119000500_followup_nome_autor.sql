-- Acompanhamento de orçamentos (19/11/2026): o histórico mostrava o e-mail de quem registrou o contato (o nome é gravado no
-- registro e, sem cadastro de funcionário naquele momento, ficava o e-mail). A lista passa a mostrar o nome atual do
-- Cadastro de Funcionários; os registros já gravados com e-mail são corrigidos.
update comercial_followups f set criado_por_nome = fa.nome
  from funcionarios_acesso fa where fa.id = f.criado_por and coalesce(fa.nome,'') <> '' and f.criado_por_nome is distinct from fa.nome;
do $$
declare d text;
begin
  select pg_get_functiondef('public.comercial_followup_lista'::regproc) into d;
  if position('''por'', criado_por_nome,' in d) = 0 then return; end if;
  d := replace(d, '''por'', criado_por_nome,', '''por'', coalesce((select nullif(fa.nome,'''') from funcionarios_acesso fa where fa.id = criado_por), criado_por_nome),');
  execute d;
end $$;
