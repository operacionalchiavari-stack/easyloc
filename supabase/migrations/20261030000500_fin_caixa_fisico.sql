-- Caixa físico (dinheiro): única conta com entradas e saídas manuais.
-- Recebimento e pagamento não são mais registrados em Contas a receber/pagar: o reconhecimento é pela
-- conciliação (Bancos) ou, se foi em dinheiro, por um lançamento no caixa.
-- Cada lançamento do caixa vira uma linha do extrato (num "arquivo" próprio, já finalizado) conciliada
-- com a mesma ação da conciliação (baixar título, transferência, lançar com categoria) — assim entra no
-- extrato da conta, na DRE e no saldo exatamente como as linhas do banco.

-- aprender regras da conciliação não vale para o caixa (a descrição é digitada à mão)
create or replace function public.fin_assist_aprender_(p_empresa uuid, e fin_extrato, p_acao text, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_chave text := fin_assist_chave(coalesce(nullif(e.contraparte,''), e.descricao)); v_dir text := case when e.valor > 0 then 'entrada' else 'saida' end;
begin
  if current_setting('acervo.caixa', true) = '1' then return; end if;
  if length(v_chave) < 3 then return; end if;
  insert into fin_assist_regras(empresa_id, chave, direcao, acao, descricao, nome, categoria_id, centro_custo_id, conta_destino, exemplo, criado_por)
  values (p_empresa, v_chave, v_dir, p_acao, nullif(p_dados->>'descricao',''), nullif(p_dados->>'nome',''),
          nullif(p_dados->>'categoria_id','')::uuid, nullif(p_dados->>'centro_custo_id','')::uuid, nullif(p_dados->>'conta_id','')::uuid,
          left(coalesce(e.descricao,'') || coalesce(' · ' || e.contraparte, ''), 200), auth.uid())
  on conflict (empresa_id, chave, direcao) do update set
    acao = excluded.acao, descricao = excluded.descricao, nome = excluded.nome, categoria_id = excluded.categoria_id,
    centro_custo_id = excluded.centro_custo_id, conta_destino = excluded.conta_destino, exemplo = excluded.exemplo,
    usos = fin_assist_regras.usos + 1, ultimo_uso = now();
end $$;

create or replace function public.fin_caixa_lancar(p_empresa uuid, p_conta uuid, p_data date, p_valor numeric, p_descricao text, p_acao jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_lote uuid; v_id uuid; v_tipo text := p_acao->>'tipo'; v_desc text := nullif(trim(coalesce(p_descricao,'')),'');
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if not exists (select 1 from fin_contas where id = p_conta and empresa_id = p_empresa and tipo = 'caixa' and ativo) then
    raise exception 'Lançamento manual só no caixa físico (conta do tipo Caixa)';
  end if;
  if p_data is null then raise exception 'Informe a data'; end if;
  if p_data > current_date then raise exception 'A data não pode ser futura'; end if;
  if coalesce(round(p_valor, 2), 0) = 0 then raise exception 'Informe o valor'; end if;
  if v_desc is null then raise exception 'Informe a descrição'; end if;
  if v_tipo not in ('baixar','transferencia','lancar') then raise exception 'Escolha o que é este lançamento'; end if;
  insert into fin_extrato_lotes(empresa_id, conta_id, arquivo_nome, formato, periodo_ini, periodo_fim, linhas, novas, criado_por)
  values (p_empresa, p_conta, 'Caixa', 'caixa', p_data, p_data, 1, 1, auth.uid()) returning id into v_lote;
  insert into fin_extrato(empresa_id, conta_id, fitid, data, valor, descricao, contraparte, lote_id, ordem)
  values (p_empresa, p_conta, 'caixa:' || gen_random_uuid(), p_data, round(p_valor, 2), v_desc, nullif(trim(coalesce(p_acao->>'nome','')),''), v_lote, 0)
  returning id into v_id;
  perform set_config('acervo.caixa', '1', true);
  perform fin_assist_aplicar(p_empresa, v_id, p_acao);
  perform set_config('acervo.caixa', '', true);
  return v_id;
end $$;

-- excluir um lançamento do caixa: desfaz a baixa/transferência/lançamento e apaga a linha
create or replace function public.fin_caixa_excluir(p_empresa uuid, p_extrato uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e fin_extrato%rowtype;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select x.* into e from fin_extrato x join fin_extrato_lotes l on l.id = x.lote_id
   where x.id = p_extrato and x.empresa_id = p_empresa and l.formato = 'caixa';
  if not found then raise exception 'Lançamento do caixa não encontrado'; end if;
  perform fin_assist_desfazer_base(p_empresa, p_extrato);
  delete from fin_extrato where id = e.id;
  delete from fin_extrato_lotes where id = e.lote_id and not exists (select 1 from fin_extrato where lote_id = e.lote_id);
end $$;

revoke all on function public.fin_caixa_lancar(uuid, uuid, date, numeric, text, jsonb) from public, anon;
revoke all on function public.fin_caixa_excluir(uuid, uuid) from public, anon;
grant execute on function public.fin_caixa_lancar(uuid, uuid, date, numeric, text, jsonb) to authenticated;
grant execute on function public.fin_caixa_excluir(uuid, uuid) to authenticated;

-- Baixa manual pelo Contas a receber/pagar não existe mais (o PIX do gateway e a conciliação usam fin_baixar_).
create or replace function public.fin_baixar(p_empresa uuid, p_tipo text, p_id uuid, p_data date, p_valor numeric, p_juros numeric, p_multa numeric, p_desconto numeric, p_tarifa numeric, p_conta uuid, p_forma text, p_obs text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Recebimentos e pagamentos são reconhecidos em Financeiro > Bancos: pela conciliação do extrato ou, se foi em dinheiro, lançando no caixa.';
end $$;
