-- Executar em BEGIN/ROLLBACK. Todos os valores simulados e títulos gerados são revertidos.
do $$
declare p separacoes_pedidos;usuario uuid;candidato uuid;itens jsonb;v jsonb;obs jsonb;pp jsonb;resultado jsonb;
  motivo comercial_motivos_bv;d jsonb:='{"locacao":100.25,"frete":50.1,"montagem":30.2,"customizacao":75.15}';
  cfg jsonb;revisao bigint;v_base numeric;v_bv numeric;v_componente text;esperado numeric;realizado numeric;quantidade bigint;
begin
  select * into strict p from separacoes_pedidos where id='96e76992-dd9a-42bd-b63c-f45646798772';
  for candidato in select user_id from usuarios_empresas where empresa_id=p.empresa_id loop
    perform set_config('request.jwt.claim.sub',candidato::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',candidato,'role','authenticated')::text,true);
    if eh_membro_empresa(p.empresa_id) and operacao_pode(p.empresa_id,'comercial.pedidos.editar') then usuario:=candidato;exit;end if;
  end loop;
  if usuario is null then raise exception 'Perfil autorizado não encontrado';end if;
  select * into strict motivo from comercial_motivos_bv where empresa_id=p.empresa_id and ativo order by ordem limit 1;
  select jsonb_agg(jsonb_build_object('item_id',item_id,'item_nome',item_nome,'quantidade_solicitada',quantidade_solicitada))
    into itens from separacoes_itens where separacao_pedido_id=p.id;
  v:=p.observacoes->'valores';v:=v||jsonb_build_object('locacao_bv',(v->>'locacao')::numeric-500,'customizacoes',500,'servicos',0,'terceirizados',0);
  obs:=jsonb_set(p.observacoes,'{valores}',v);
  obs:=jsonb_set(obs,'{bv}',jsonb_build_object('manual',true,'percentual',25,'motivo_id',motivo.id,'observacao',motivo.nome,'partes',null));
  cfg:=coalesce(obs->'pagamento_config','{}')||jsonb_build_object('descontosAreas',d,'descontoComercial',99999,
    'descontoComercialArea','frete','descontoBV',0,'abatidoBV',0,'creditoCliente',0,'descontoBvPedido',0,'usoSaldoConta',true);
  obs:=jsonb_set(obs,'{pagamento_config}',cfg);
  obs:=jsonb_set(obs,'{parcelas_financeiras}',(select jsonb_agg(jsonb_set(x,'{valor}',to_jsonb((x->>'valor')::numeric-
    case x->>'componente' when 'frete' then 50.1 when 'montagem' then 30.2 else 175.4 end)))from jsonb_array_elements(p.observacoes->'parcelas_financeiras')x));
  pp:=to_jsonb(p)||jsonb_build_object('observacoes',obs);revisao:=p.revisao;
  execute 'set local role authenticated';
  resultado:=pedido_salvar_integrado(p.id,pp,itens,revisao);revisao:=(resultado->>'revisao')::bigint;
  select observacoes->'pagamento_config' into cfg from separacoes_pedidos where id=p.id;
  if (cfg->>'descontoComercial')::numeric<>255.7 or cfg->'descontosAreas'<>d then raise exception 'Soma dos descontos não foi normalizada no servidor';end if;
  if cfg->'descontoComercialArea'<>'null' then raise exception 'Descontos simultâneos foram reduzidos a uma área só';end if;
  v_base:=round((v->>'locacao_bv')::numeric-100.25,2);
  if not exists(select 1 from fin_bv_comissoes where pedido_id=p.id and base_locacao=v_base and valor=round(v_base*.25,2))then
    raise exception 'BV foi reduzido por descontos fora da locação';end if;
  foreach v_componente in array array['locacao','frete','montagem'] loop
    esperado:=round((v->>v_componente)::numeric-case v_componente when 'frete' then 50.1 when 'montagem' then 30.2 else 175.4 end,2);
    select coalesce(sum(t.valor),0) into realizado from fin_receber t where t.pedido_id=p.id and t.componente=v_componente and t.origem='pedido' and t.status<>'cancelado';
    if esperado<>realizado then raise exception 'Divisão % não recebeu o desconto correto',v_componente;end if;
  end loop;
  select count(*) into quantidade from fin_receber where pedido_id=p.id;
  resultado:=pedido_salvar_integrado(p.id,pp,itens,revisao);revisao:=(resultado->>'revisao')::bigint;
  if(select count(*)from fin_receber where pedido_id=p.id)<>quantidade then raise exception 'Salvamento duplicou parcelas';end if;
  begin
    perform pedido_salvar_integrado(p.id,jsonb_set(pp,'{observacoes,pagamento_config,descontosAreas,customizacao}','500.01'),itens,revisao);
    raise exception 'Falha: desconto acima da customização aceito';
  exception when others then if position('supera o valor da área' in sqlerrm)=0 then raise;end if;end;
  begin
    perform pedido_salvar_integrado(p.id,jsonb_set(pp,'{observacoes,pagamento_config,descontosAreas,indevida}','1'),itens,revisao);
    raise exception 'Falha: área desconhecida aceita';
  exception when others then if position('Área de desconto inválida' in sqlerrm)=0 then raise;end if;end;
  begin
    perform pedido_salvar_integrado(p.id,jsonb_set(pp,'{observacoes,pagamento_config,descontosAreas,frete}','51.1'),itens,revisao);
    raise exception 'Falha: parcelas desatualizadas aceitas';
  exception when others then if position('parcelas da área selecionada' in sqlerrm)=0 then raise;end if;end;
  execute 'reset role';
  if pagamento_link_pedido(p.id)->'pagamento_config'->'descontosAreas'<>d then raise exception 'Link sem o detalhamento dos descontos';end if;
  execute 'set local role authenticated';
  v_bv:=round(v_base*.25,2);
  pp:=jsonb_set(pp,'{observacoes,bv,como_desconto}','true');
  pp:=jsonb_set(pp,'{observacoes,parcelas_financeiras}',(select jsonb_agg(case when x->>'componente'='locacao'
    then jsonb_set(x,'{valor}',to_jsonb((x->>'valor')::numeric-v_bv))else x end)from jsonb_array_elements(pp->'observacoes'->'parcelas_financeiras')x));
  resultado:=pedido_salvar_integrado(p.id,pp,itens,revisao);revisao:=(resultado->>'revisao')::bigint;
  if not exists(select 1 from fin_bv_comissoes where pedido_id=p.id and not ativo and valor=0)then raise exception 'BV convertido ainda seria pago';end if;
  if(select (observacoes->'pagamento_config'->>'descontoBvPedido')::numeric from separacoes_pedidos where id=p.id)<>v_bv then raise exception 'BV convertido incorreto';end if;
  execute 'reset role';
end $$;
select 'Descontos simultâneos: soma canônica, quatro áreas, limites, parcelas, idempotência, BV e documento público verificados' as verificacao;
