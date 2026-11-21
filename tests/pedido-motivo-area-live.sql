-- Rodar em BEGIN/ROLLBACK depois da migração. O pedido e os parâmetros são restaurados pelo rollback.
do $$
declare p separacoes_pedidos;usuario uuid;candidato uuid;itens jsonb;obs jsonb;original jsonb;v jsonb;cfg jsonb;
  pp jsonb;resultado jsonb;revisao bigint;motivo comercial_motivos_bv;estranho uuid;v_area text;v_comp text;
  v_base numeric;v_valor numeric;v_esperado numeric;v_real numeric;detalhe jsonb;
begin
  select * into strict p from separacoes_pedidos where id='96e76992-dd9a-42bd-b63c-f45646798772';
  for candidato in select user_id from usuarios_empresas where empresa_id=p.empresa_id loop
    perform set_config('request.jwt.claim.sub',candidato::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',candidato,'role','authenticated')::text,true);
    if eh_membro_empresa(p.empresa_id) and operacao_pode(p.empresa_id,'comercial.pedidos.editar') then usuario:=candidato;exit;end if;
  end loop;
  if usuario is null then raise exception 'Perfil autorizado não encontrado';end if;
  select * into strict motivo from comercial_motivos_bv where empresa_id=p.empresa_id and ativo order by ordem limit 1;
  select id into estranho from comercial_motivos_bv where empresa_id<>p.empresa_id limit 1;
  estranho:=coalesce(estranho,gen_random_uuid());
  select jsonb_agg(jsonb_build_object('item_id',item_id,'item_nome',item_nome,'quantidade_solicitada',quantidade_solicitada))
    into itens from separacoes_itens where separacao_pedido_id=p.id;
  original:=p.observacoes;
  v:=coalesce(original->'valores','{}');
  v:=v||jsonb_build_object('locacao_bv',greatest((v->>'locacao')::numeric-500,0),'customizacoes',500,'servicos',0,'terceirizados',0);
  original:=jsonb_set(original,'{valores}',v);
  original:=jsonb_set(original,'{bv}',jsonb_build_object('manual',true,'percentual',25,'motivo_id',motivo.id,'observacao','texto adulterado','partes',null));
  original:=jsonb_set(original,'{pagamento_config}',coalesce(original->'pagamento_config','{}')||jsonb_build_object(
    'descontoComercial',100.25,'descontoComercialArea','locacao','descontoBV',0,'abatidoBV',0,'creditoCliente',0,'descontoBvPedido',0,'usoSaldoConta',true));
  revisao:=p.revisao;
  execute 'set local role authenticated';
  begin
    perform pedido_salvar_integrado(p.id,to_jsonb(p)||jsonb_build_object('observacoes',original#-'{bv,motivo_id}'),itens,revisao);
    raise exception 'Falha: BV manual sem motivo aceito';
  exception when others then if position('Selecione o motivo' in sqlerrm)=0 then raise;end if;end;
  begin
    perform pedido_salvar_integrado(p.id,to_jsonb(p)||jsonb_build_object('observacoes',jsonb_set(original,'{bv,motivo_id}',to_jsonb(estranho))),itens,revisao);
    raise exception 'Falha: motivo de outra empresa aceito';
  exception when others then if position('motivo de negociação' in sqlerrm)=0 then raise;end if;end;
  foreach v_area in array array['locacao','frete','montagem','customizacao'] loop
    v_comp:=case when v_area in('locacao','customizacao') then 'locacao' else v_area end;
    obs:=jsonb_set(original,'{pagamento_config,descontoComercialArea}',to_jsonb(v_area));
    obs:=jsonb_set(obs,'{parcelas_financeiras}',(select jsonb_agg(case when x->>'componente'=v_comp
      then jsonb_set(x,'{valor}',to_jsonb((x->>'valor')::numeric-100.25)) else x end) from jsonb_array_elements(p.observacoes->'parcelas_financeiras')x));
    pp:=to_jsonb(p)||jsonb_build_object('observacoes',obs);
    resultado:=pedido_salvar_integrado(p.id,pp,itens,revisao);revisao:=(resultado->>'revisao')::bigint;
    v_base:=round((v->>'locacao_bv')::numeric-case when v_area='locacao' then 100.25 else 0 end,2);
    if not exists(select 1 from fin_bv_comissoes where pedido_id=p.id and base_locacao=v_base and valor=round(v_base*.25,2)) then
      raise exception 'Base ou comissão de BV incorreta para %',v_area;end if;
    if (select observacoes->'bv'->>'observacao' from separacoes_pedidos where id=p.id)<>motivo.nome then raise exception 'Motivo não foi normalizado';end if;
    foreach v_comp in array array['locacao','frete','montagem'] loop
      v_esperado:=(v->>v_comp)::numeric-case when v_comp=(case when v_area in('locacao','customizacao') then 'locacao' else v_area end) then 100.25 else 0 end;
      select coalesce(sum(valor),0) into v_real from fin_receber where pedido_id=p.id and origem='pedido' and status<>'cancelado' and componente=v_comp;
      if abs(v_real-v_esperado)>.01 then raise exception 'Parcela de % foi alterada incorretamente no desconto de %',v_comp,v_area;end if;
    end loop;
    execute 'reset role';detalhe:=pagamento_link_pedido(p.id);
    if detalhe->'pagamento_config'->>'descontoComercialArea'<>v_area then raise exception 'Link sem área do desconto';end if;
    if detalhe ? 'bv' or detalhe::text like '%texto adulterado%' then raise exception 'Motivo privado vazou no link';end if;
    execute 'set local role authenticated';
  end loop;
  begin
    perform pedido_salvar_integrado(p.id,jsonb_set(pp,'{observacoes,pagamento_config,descontoComercial}','501'),itens,revisao);
    raise exception 'Falha: desconto superior à customização aceito';
  exception when others then if position('supera o valor da área' in sqlerrm)=0 then raise;end if;end;
  begin
    perform pedido_salvar_integrado(p.id,jsonb_set(pp,'{observacoes,pagamento_config,descontoComercialArea}','"invalida"'),itens,revisao);
    raise exception 'Falha: área inválida aceita';
  exception when others then if position('Área de desconto inválida' in sqlerrm)=0 then raise;end if;end;
  begin
    perform pedido_salvar_integrado(p.id,jsonb_set(pp,'{observacoes,pagamento_config,descontoComercialArea}','"frete"'),itens,revisao);
    raise exception 'Falha: desconto foi lançado na divisão errada';
  exception when others then if position('parcelas da área selecionada' in sqlerrm)=0 then raise;end if;end;
  execute 'reset role';
  update comercial_motivos_bv set ativo=false where id=motivo.id;
  select to_jsonb(s) into pp from separacoes_pedidos s where id=p.id;
  execute 'set local role authenticated';
  resultado:=pedido_salvar_integrado(p.id,pp,itens,revisao);revisao:=(resultado->>'revisao')::bigint;
  begin
    perform pedido_salvar_integrado(p.id,jsonb_set(pp,'{observacoes,bv,percentual}','26'),itens,revisao);
    raise exception 'Falha: motivo desativado foi usado em nova negociação';
  exception when others then if position('motivo de negociação' in sqlerrm)=0 then raise;end if;end;
  execute 'reset role';
end $$;
select 'Verificados: motivo obrigatório/empresa/ativo/histórico; descontos nas 4 áreas, limites, parcelas, base do BV e link público' as verificacao;
