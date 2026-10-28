-- Créditos reconhecidos compõem a conta corrente do cliente e são devolvidos pelo contas a pagar.
create function public.fin_cliente_registrar_credito(p_empresa uuid,p_cliente uuid,p_tipo text,p_valor numeric,p_data date,p_obs text)
returns uuid language plpgsql security definer set search_path=public as $$
declare c clientes_empresas%rowtype; titulo uuid; categoria uuid;
begin
  if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa,'financeiro.contas_pagar.editar') then
    raise exception 'Sem permissão para registrar crédito' using errcode='42501'; end if;
  if p_valor is null or p_valor<=0 or p_valor::text in ('NaN','Infinity','-Infinity') then raise exception 'Informe um valor de crédito válido'; end if;
  if p_tipo not in ('pagamento_maior','adiantamento','ajuste','outro') or p_tipo is null then raise exception 'Tipo de crédito inválido'; end if;
  if p_data is null or nullif(btrim(p_obs,E' \n\r\t'),'') is null then raise exception 'Informe a data e o motivo do crédito'; end if;
  select * into c from clientes_empresas where id=p_cliente and empresa_id=p_empresa;
  if not found then raise exception 'Cliente não encontrado nesta empresa'; end if;
  insert into fin_categorias(empresa_id,nome,tipo,chave,ordem)
    values(p_empresa,'Devolução de créditos de clientes','saida','creditos_clientes',91)
    on conflict (empresa_id,chave) where chave is not null do nothing;
  select id into categoria from fin_categorias where empresa_id=p_empresa and chave='creditos_clientes';
  insert into fin_pagar(empresa_id,origem,origem_id,fornecedor_id,fornecedor_nome,descricao,emissao,competencia,vencimento,valor,categoria_id,observacoes,criado_por)
    values(p_empresa,'credito_cliente',p_cliente,p_cliente,c.nome_razao,
      case p_tipo when 'pagamento_maior' then 'Crédito por pagamento a maior' when 'adiantamento' then 'Crédito de adiantamento'
        when 'ajuste' then 'Ajuste de crédito' else 'Outro crédito' end,p_data,p_data,p_data,round(p_valor,2),categoria,p_obs,auth.uid()) returning id into titulo;
  perform fin_auditar(p_empresa,'fin_pagar',titulo,'credito_cliente',null,
    jsonb_build_object('cliente_id',p_cliente,'tipo',p_tipo,'valor',p_valor,'data',p_data),p_obs);
  return titulo;
end $$;
revoke all on function public.fin_cliente_registrar_credito(uuid,uuid,text,numeric,date,text) from public,anon;
grant execute on function public.fin_cliente_registrar_credito(uuid,uuid,text,numeric,date,text) to authenticated;

create function public.fin_conta_cliente_extrato(p_empresa uuid,p_cliente uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare dados jsonb; clientes jsonb; creditos jsonb; pagamentos jsonb; pedidos jsonb;
begin
  dados:=public.fin_bv_extrato(p_empresa,p_cliente); -- Confere a permissão financeira e a empresa.
  select coalesce(jsonb_agg(to_jsonb(c) order by c.nome_razao),'[]') into clientes from
    (select id,nome_razao,catalogo_logo_url,bv_recebe,bv_percentual from clientes_empresas where empresa_id=p_empresa) c;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.emissao desc,t.created_at desc),'[]') into creditos
    from fin_pagar t where t.empresa_id=p_empresa and t.origem='credito_cliente' and (p_cliente is null or t.fornecedor_id=p_cliente);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.data_evento desc nulls last),'[]') into pedidos from (
    select p.id,p.numero_pedido,p.cliente_id,p.cliente_nome,p.data_evento,p.status_comercial,
      coalesce(b.base_locacao,fin_bv_base(p.observacoes,p.valor_total)) base_locacao,b.percentual,b.valor,
      coalesce(t.pago,0) pago,case when b.ativo and t.status<>'cancelado' then coalesce(t.aberto,0) else 0 end saldo,
      b.pagar_id,t.status status_pagamento,coalesce(b.ativo,false) ativo,
      case when b.pedido_id is null then 'sem_registro' else 'registrado' end registro
    from separacoes_pedidos p left join fin_bv_comissoes b on b.pedido_id=p.id and b.empresa_id=p.empresa_id
    left join fin_pagar t on t.id=b.pagar_id and t.empresa_id=p.empresa_id
    where p.empresa_id=p_empresa and (p_cliente is null or p.cliente_id=p_cliente)) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.data desc,x.created_at desc),'[]') into pagamentos from (
    select f.id,f.pagar_id,f.data,f.valor,f.liquido,f.forma,f.observacoes,f.estornado_em,f.estorno_motivo,f.created_at,
      c.nome conta,null::text numero_pedido,t.fornecedor_id cliente_id,t.fornecedor_nome cliente_nome,t.descricao origem_descricao
    from fin_baixas f join fin_pagar t on t.id=f.pagar_id and t.empresa_id=f.empresa_id
    left join fin_contas c on c.id=f.conta_id and c.empresa_id=f.empresa_id
    where f.empresa_id=p_empresa and t.origem='credito_cliente' and (p_cliente is null or t.fornecedor_id=p_cliente)) x;
  return dados || jsonb_build_object('clientes',clientes,'creditos',creditos,'pedidos',pedidos,
    'pagamentos',coalesce(dados->'pagamentos','[]') || pagamentos);
end $$;
revoke all on function public.fin_conta_cliente_extrato(uuid,uuid) from public,anon;
grant execute on function public.fin_conta_cliente_extrato(uuid,uuid) to authenticated;
