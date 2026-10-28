-- Almoxarifado: editar o cadastro de um material pelo Estoque atual (out/2026).
-- Só os campos que não mudam QUAL é o material: categoria, setor, mínimo, ideal, custo, reposição,
-- situação e observações. Código, produto, unidade e estoque ficam como estão (estoque só por Entrada/Saída).
-- O gatilho almox_compra_automatica reavalia a solicitação de compra sozinho depois da gravação.

create or replace function public.almox_produto_editar(p_empresa uuid, p_produto_id text, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pl constant text := '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI';
  cab jsonb; vals jsonb; ln int; i_id int; i int;
  campo text; coluna text; v jsonb; n numeric; t text;
  minimo numeric; ideal numeric;
  mapa constant jsonb := jsonb_build_object(
    'categoria', 'Categoria', 'setor', 'Setor', 'minimo', 'EstoqueMinimo', 'ideal', 'EstoqueIdeal',
    'custo', 'ValorCusto', 'reposicao', 'ValorReposicao', 'status', 'Status', 'observacoes', 'Observacoes');
begin
  if p_empresa is distinct from public.gs_empresa_dona() or not public.eh_membro_empresa(p_empresa)
     or not public.operacao_pode(p_empresa, 'estoque.almoxarifado.movimentar') then
    raise exception 'Sem permissão para alterar o cadastro do material.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_dados) is distinct from 'object' then raise exception 'Dados inválidos.'; end if;

  select valores into cab from gs_linhas where planilha_id = pl and aba = 'Produtos' and linha = 1;
  select (o-1) into i_id from jsonb_array_elements_text(cab) with ordinality e(x,o) where x = 'ID';
  select linha, valores into ln, vals from gs_linhas
   where planilha_id = pl and aba = 'Produtos' and linha > 1 and valores->>i_id = p_produto_id limit 1;
  if ln is null then raise exception 'Material não encontrado no Almoxarifado.'; end if;

  for campo, v in select * from jsonb_each(p_dados) loop
    coluna := mapa->>campo;
    if coluna is null then continue; end if;  -- campo que não pode ser alterado: ignora
    select (o-1) into i from jsonb_array_elements_text(cab) with ordinality e(x,o) where x = coluna;
    if i is null then continue; end if;
    if campo in ('minimo', 'ideal', 'custo', 'reposicao') then
      t := trim(coalesce(v #>> '{}', ''));
      if t like '%,%' then t := replace(replace(t, '.', ''), ',', '.'); end if;
      begin n := nullif(t, '')::numeric; exception when others then
        raise exception 'Valor inválido em %.', coluna; end;
      n := coalesce(n, 0);
      if n < 0 then raise exception '% não pode ser negativo.', coluna; end if;
      vals := public.almox_set_valor(vals, i, to_jsonb(n));
    elsif campo = 'status' then
      t := initcap(trim(coalesce(v #>> '{}', '')));
      if t not in ('Ativo', 'Inativo') then raise exception 'Situação inválida.'; end if;
      vals := public.almox_set_valor(vals, i, to_jsonb(t));
    else
      t := left(trim(coalesce(v #>> '{}', '')), case when campo = 'observacoes' then 1000 else 120 end);
      vals := public.almox_set_valor(vals, i, to_jsonb(t));
    end if;
  end loop;

  select (o-1) into i from jsonb_array_elements_text(cab) with ordinality e(x,o) where x = 'EstoqueMinimo';
  minimo := coalesce(nullif(vals->>i, '')::numeric, 0);
  select (o-1) into i from jsonb_array_elements_text(cab) with ordinality e(x,o) where x = 'EstoqueIdeal';
  ideal := case when i is null then 0 else coalesce(nullif(vals->>i, '')::numeric, 0) end;
  if ideal > 0 and ideal < minimo then raise exception 'O estoque ideal não pode ser menor que o mínimo.'; end if;

  select (o-1) into i from jsonb_array_elements_text(cab) with ordinality e(x,o) where x = 'AtualizadoEm';
  if i is not null then
    vals := public.almox_set_valor(vals, i, to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  end if;

  update gs_linhas set valores = vals where planilha_id = pl and aba = 'Produtos' and linha = ln;
  update gs_abas set versao = versao + 1, atualizado_em = now() where planilha_id = pl and nome = 'Produtos';
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.almox_produto_editar(uuid, text, jsonb) from public, anon;
grant execute on function public.almox_produto_editar(uuid, text, jsonb) to authenticated;
