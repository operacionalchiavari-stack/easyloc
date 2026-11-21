-- Executar depois da migração, dentro de BEGIN/ROLLBACK. Não grava alterações no pedido.
do $$
declare p separacoes_pedidos; usuario uuid; candidato uuid; itens jsonb; obs jsonb; original jsonb;
  pp jsonb; resultado jsonb; revisao bigint; v_desconto numeric; soma numeric; detalhe jsonb; quantidade bigint; titulo uuid; motivo uuid;
begin
  select * into strict p from separacoes_pedidos where id='96e76992-dd9a-42bd-b63c-f45646798772';
  for candidato in select user_id from usuarios_empresas where empresa_id=p.empresa_id loop
    perform set_config('request.jwt.claim.sub',candidato::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',candidato,'role','authenticated')::text,true);
    if eh_membro_empresa(p.empresa_id) and operacao_pode(p.empresa_id,'comercial.pedidos.editar') then usuario:=candidato;exit;end if;
  end loop;
  if usuario is null then raise exception 'Perfil autorizado não encontrado';end if;
  if to_regclass('public.comercial_motivos_bv') is not null then
    execute 'select id from comercial_motivos_bv where empresa_id=$1 and ativo order by ordem limit 1' into motivo using p.empresa_id;
  end if;
  select jsonb_agg(jsonb_build_object('item_id',item_id,'item_nome',item_nome,'quantidade_solicitada',quantidade_solicitada))
    into itens from separacoes_itens where separacao_pedido_id=p.id;
  original:=jsonb_set(p.observacoes,'{pagamento_config}',coalesce(p.observacoes->'pagamento_config','{}')||
    jsonb_build_object('descontoComercial',0,'descontoBV',0,'abatidoBV',0,'creditoCliente',0,'descontoBvPedido',0,'usoSaldoConta',true));
  v_desconto:=round(fin_bv_base(original,p.valor_total)*.1,2);
  if v_desconto<=0 then raise exception 'Pedido sem base de BV para testar';end if;
  select sum((x->>'valor')::numeric) into soma from jsonb_array_elements(original->'parcelas_financeiras') x;
  if abs(soma-p.valor_total)>.01 then raise exception 'Parcelas originais não fecham o total';end if;
  obs:=jsonb_set(original,'{bv}','{"manual":true,"percentual":10,"como_desconto":true,"observacao":"teste de conversão"}');
  if motivo is not null then obs:=jsonb_set(obs,'{bv,motivo_id}',to_jsonb(motivo));end if;
  obs:=jsonb_set(obs,'{pagamento_config,descontoBvPedido}','1'); -- O servidor deve ignorar o valor adulterado.
  obs:=jsonb_set(obs,'{exibicao_financeiro}','{"frete_desconto":true,"montagem_desconto":true,"bv_desconto":false,"bv_texto":"Condição especial"}');
  obs:=jsonb_set(obs,'{parcelas_financeiras}',(select jsonb_agg(case when x->>'componente'='locacao'
    then jsonb_set(x,'{valor}',to_jsonb((x->>'valor')::numeric-v_desconto)) else x end) from jsonb_array_elements(obs->'parcelas_financeiras') x));
  pp:=to_jsonb(p)||jsonb_build_object('observacoes',obs);
  execute 'set local role authenticated';
  resultado:=pedido_salvar_integrado(p.id,pp,itens,p.revisao);revisao:=(resultado->>'revisao')::bigint;
  if (select (observacoes->'pagamento_config'->>'descontoBvPedido')::numeric from separacoes_pedidos where id=p.id)<>v_desconto then
    raise exception 'Desconto não recalculado no servidor';end if;
  if not exists(select 1 from fin_bv_comissoes where pedido_id=p.id and not ativo and valor=0 and percentual=10) then
    raise exception 'Comissão não foi desativada';end if;
  if exists(select 1 from fin_bv_partes where pedido_id=p.id and ativo and valor>0) then raise exception 'Divisão de comissão ainda ativa';end if;
  if abs((select coalesce(sum(valor),0) from fin_receber where pedido_id=p.id and origem='pedido' and status<>'cancelado')-(p.valor_total-v_desconto))>.01 then
    raise exception 'Contas a receber não acompanham o v_desconto';end if;
  select count(*) into quantidade from fin_receber where pedido_id=p.id;
  resultado:=pedido_salvar_integrado(p.id,pp,itens,revisao);revisao:=(resultado->>'revisao')::bigint;
  if (select count(*) from fin_receber where pedido_id=p.id)<>quantidade then raise exception 'Salvamento duplicou parcelas';end if;
  execute 'reset role';
  detalhe:=pagamento_link_pedido(p.id);
  if detalhe->'exibicao_financeiro'->'desconto_mostrar'<>'false' then raise exception 'Exibição deveria estar oculta';end if;
  if (detalhe->'pagamento_config'->>'descontoPedido')::numeric<>v_desconto then raise exception 'Link sem v_desconto';end if;
  if detalhe ? 'bv' or detalhe->'pagamento_config' ? 'percentual' then raise exception 'Dados privados de comissão expostos';end if;
  execute 'set local role authenticated';
  begin
    perform pedido_salvar_integrado(p.id,jsonb_set(pp,'{observacoes,parcelas_financeiras}',original->'parcelas_financeiras'),itens,revisao);
    raise exception 'Falha: parcelas com o total antigo aceitas';
  exception when others then if position('Atualize as parcelas' in sqlerrm)=0 then raise;end if;end;
  -- Retirar a conversão deve restaurar o total e a comissão de 10%.
  obs:=jsonb_set(original,'{bv}','{"manual":true,"percentual":10,"como_desconto":false}');
  if motivo is not null then obs:=jsonb_set(obs,'{bv,motivo_id}',to_jsonb(motivo));end if;
  resultado:=pedido_salvar_integrado(p.id,to_jsonb(p)||jsonb_build_object('observacoes',obs),itens,revisao);revisao:=(resultado->>'revisao')::bigint;
  if not exists(select 1 from fin_bv_comissoes where pedido_id=p.id and ativo and valor=v_desconto) then raise exception 'Comissão não restaurada';end if;
  execute 'reset role';
  perform set_config('app.bv_sync','sim',true);
  insert into fin_pagar(empresa_id,fornecedor_id,fornecedor_nome,origem,origem_id,valor,pago,descricao,emissao,vencimento)
    values(p.empresa_id,p.cliente_id,p.cliente_nome,'bv',p.id,v_desconto,1,'Verificação de conversão de BV',current_date,current_date) returning id into titulo;
  update fin_bv_partes set pagar_id=titulo where pedido_id=p.id and cliente_id=p.cliente_id;
  perform set_config('app.bv_sync','',true);
  execute 'set local role authenticated';
  begin
    perform pedido_salvar_integrado(p.id,pp,itens,revisao);
    raise exception 'Falha: BV pago foi convertido';
  exception when others then if position('já foi pago ou usado' in sqlerrm)=0 then raise;end if;end;
  execute 'reset role';
  perform set_config('app.bv_sync','sim',true);
  update fin_pagar set pago=0,compensado=1 where id=titulo;
  perform set_config('app.bv_sync','',true);
  execute 'set local role authenticated';
  begin
    perform pedido_salvar_integrado(p.id,pp,itens,revisao);
    raise exception 'Falha: BV usado em outro pedido foi convertido';
  exception when others then if position('já foi pago ou usado' in sqlerrm)=0 then raise;end if;end;
  execute 'reset role';
  perform set_config('app.bv_sync','sim',true);update fin_pagar set compensado=0 where id=titulo;perform set_config('app.bv_sync','',true);
  execute 'set local role authenticated';
  resultado:=pedido_salvar_integrado(p.id,pp,itens,revisao);revisao:=(resultado->>'revisao')::bigint;
  if not exists(select 1 from fin_pagar where id=titulo and status='cancelado') then raise exception 'Comissão anterior não cancelada';end if;
  begin
    perform pedido_salvar_integrado(p.id,jsonb_set(jsonb_set(pp,'{observacoes,pagamento_config,abatidoBV}',to_jsonb(p.valor_total-v_desconto+1)),
      '{observacoes,parcelas_financeiras}','[]'),itens,revisao);
    raise exception 'Falha: uso de saldo excedeu o valor já descontado';
  exception when others then if position('superar o valor restante' in sqlerrm)=0 then raise;end if;end;
  resultado:=pedido_salvar_integrado(p.id,to_jsonb(p)||jsonb_build_object('observacoes',obs),itens,revisao);revisao:=(resultado->>'revisao')::bigint;
  execute 'reset role';
  update fin_bv_comissoes set aprovacao='aprovado' where pedido_id=p.id;
  execute 'set local role authenticated';
  begin
    perform pedido_salvar_integrado(p.id,pp,itens,revisao);
    raise exception 'Falha: comissão aprovada foi convertida';
  exception when others then if position('Posição final' in sqlerrm)=0 then raise;end if;end;
  execute 'reset role';
end $$;
select 'Conversão: cálculo no servidor, comissão desativada/restaurada, parcelas líquidas, idempotência, link e trava de BV aprovado verificados' as verificacao;
