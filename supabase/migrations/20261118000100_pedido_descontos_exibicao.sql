begin;
-- Calcula a conversão no servidor, antes do uso de saldos e dos demais gatilhos do pedido.
create function public.pedido_bv_converter_desconto() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_usa boolean:=coalesce(new.observacoes->'bv'->>'como_desconto','')='true';
  v_usava boolean:=false; v_anterior numeric:=0; v_desconto numeric:=0;
  v_bv fin_bv_comissoes; v_cfg jsonb:=coalesce(new.observacoes->'bv','{}');
  v_equipe uuid; v_benef uuid; v_tit uuid; v_pct numeric; v_base numeric; v_liquido numeric; v_parcelas numeric;
begin
  if tg_op='UPDATE' then
    v_usava:=coalesce(old.observacoes->'bv'->>'como_desconto','')='true';
    v_anterior:=coalesce(fin_moeda(old.observacoes->'pagamento_config'->>'descontoBvPedido'),0);
  end if;
  if not v_usa and not v_usava and coalesce(new.observacoes->'pagamento_config'->>'descontoBvPedido','0') in ('','0','0.00') then return new; end if;
  select * into v_bv from fin_bv_comissoes where pedido_id=new.id for update;
  if v_usa then
    v_equipe:=fin_uuid(new.observacoes->>'equipe_id');
    if v_equipe is not null then select titular_id into v_tit from clientes_equipes where id=v_equipe and empresa_id=new.empresa_id; end if;
    v_benef:=coalesce(v_tit,new.cliente_id);
    if coalesce(v_cfg->>'manual','')='true' then
      begin v_pct:=round((v_cfg->>'percentual')::numeric,4); exception when others then v_pct:=null; end;
    elsif v_bv.pedido_id is null or v_bv.cliente_id is distinct from v_benef or v_bv.manual then
      v_pct:=fin_bv_percentual_na_criacao(new.empresa_id,v_benef,new.criado_em);
    else v_pct:=v_bv.percentual; end if;
    if v_pct is null or v_pct<0 or v_pct>100 or v_pct::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Informe o BV do pedido entre 0 e 100%%'; end if;
    v_base:=fin_bv_base(new.observacoes,new.valor_total);
    v_desconto:=round(v_base*v_pct/100,2);
  end if;
  if v_usa is distinct from v_usava or v_desconto<>v_anterior then
    if auth.uid() is null or not eh_membro_empresa(new.empresa_id) or not operacao_pode(new.empresa_id,'comercial.pedidos.editar') then
      raise exception 'Sem permissão para converter o BV em desconto' using errcode='42501'; end if;
    if coalesce(v_bv.aprovacao,'pendente')<>'pendente' or exists(
      select 1 from fin_posicoes_finais where pedido_id=new.id and status='confirmado') then
      raise exception 'O BV já foi decidido na Posição final. Revise-o no Financeiro antes de converter em desconto'; end if;
  end if;
  if v_usa and exists(select 1 from fin_bv_partes pt join fin_pagar t on t.id=pt.pagar_id
    where pt.pedido_id=new.id and (coalesce(t.pago,0)>0 or coalesce(t.compensado,0)>0)) then
    raise exception 'O BV já foi pago ou usado em outro pedido. Estorne esse uso antes de convertê-lo em desconto';
  end if;
  new.observacoes:=jsonb_set(coalesce(new.observacoes,'{}'),'{pagamento_config}',
    coalesce(new.observacoes->'pagamento_config','{}')||jsonb_build_object('descontoBvPedido',v_desconto));
  if (v_usa or v_usava) and coalesce(new.status_comercial,'')<>'cancelado' and coalesce(new.status,'')<>'cancelado' then
    v_liquido:=greatest(coalesce(new.valor_total,0)-v_desconto
      -greatest(coalesce(fin_moeda(new.observacoes->'pagamento_config'->>'descontoComercial'),0),0)
      -greatest(coalesce(fin_moeda(new.observacoes->'pagamento_config'->>'descontoBV'),0),0)
      -greatest(coalesce(fin_moeda(new.observacoes->'pagamento_config'->>'abatidoBV'),0),0)
      -greatest(coalesce(fin_moeda(new.observacoes->'pagamento_config'->>'creditoCliente'),0),0),0);
    if jsonb_typeof(new.observacoes->'parcelas_financeiras')='array' then
      select coalesce(sum((x->>'valor')::numeric),0) into v_parcelas from jsonb_array_elements(new.observacoes->'parcelas_financeiras') x;
      if abs(v_parcelas-v_liquido)>.01 then raise exception 'Atualize as parcelas para o novo total do pedido após a conversão do BV'; end if;
    elsif v_desconto>0 then raise exception 'Programe as parcelas do pedido antes de converter o BV'; end if;
  end if;
  return new;
end $$;
revoke all on function public.pedido_bv_converter_desconto() from public,anon,authenticated;
create trigger a0_bv_converter_desconto before insert or update of observacoes,valor_total,cliente_id,status_comercial
  on public.separacoes_pedidos for each row execute function public.pedido_bv_converter_desconto();

do $patch$ declare fonte text; trecho text; begin
  select pg_get_functiondef('public.fin_bv_sincronizar()'::regprocedure) into fonte;
  trecho:='total := round(base * pct / 100, 2);';
  if position(trecho in fonte)=0 then raise exception 'Cálculo de BV incompatível com a conversão'; end if;
  fonte:=replace(fonte,trecho,trecho||$branch$
  if coalesce(cfg->>'como_desconto','')='true' then
    perform set_config('app.bv_sync','sim',true);
    update fin_pagar set status='cancelado',cancelado_em=now(),cancelamento_motivo='BV convertido em desconto no pedido'
      where id in(select pagar_id from fin_bv_partes where pedido_id=new.id) and status<>'cancelado';
    update fin_bv_partes set ativo=false,valor=0,updated_at=now() where pedido_id=new.id;
    insert into fin_bv_comissoes(pedido_id,empresa_id,cliente_id,percentual,base_locacao,valor,manual,observacao,ativo)
      values(new.id,new.empresa_id,benef,pct,base,0,manual,nullif(trim(cfg->>'observacao'),''),false)
      on conflict(pedido_id) do update set cliente_id=excluded.cliente_id,percentual=excluded.percentual,
        base_locacao=excluded.base_locacao,valor=0,manual=excluded.manual,observacao=excluded.observacao,ativo=false,updated_at=now();
    if b.pedido_id is null or b.ativo or b.percentual is distinct from pct or b.base_locacao is distinct from base then
      perform fin_auditar(new.empresa_id,'fin_bv_comissoes',new.id,'convertido_desconto',to_jsonb(b),
        jsonb_build_object('valor_desconto',total,'percentual',pct),'BV convertido em desconto no pedido');
    end if;
    perform set_config('app.bv_sync',coalesce(flag_anterior,''),true);
    return new;
  end if;
  $branch$);
  execute fonte;

  select pg_get_functiondef('public.fin_pedido_aplicar_abatimentos()'::regprocedure) into fonte;
  trecho:='coalesce(new.valor_total,0)-coalesce(nullif(cfg->>''descontoComercial'','''')::numeric,0)';
  if position(trecho in fonte)=0 then raise exception 'Uso de saldo incompatível com a conversão'; end if;
  execute replace(fonte,trecho,trecho||'-coalesce(nullif(cfg->>''descontoBvPedido'','''')::numeric,0)');

end $patch$;

-- Mantém a projeção pública existente e acrescenta apenas as opções do documento.
create or replace function public.pagamento_link_pedido(p_pedido uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare r jsonb; emp uuid; terc jsonb; obs jsonb;
begin
  r:=pagamento_link_pedido_base(p_pedido);
  select empresa_id,observacoes into emp,obs from separacoes_pedidos where id=p_pedido;
  if r is null or emp is null then return r; end if;
  terc:=coalesce((select jsonb_agg(t-'custo'-'fornecedor_id'-'fornecedor_nome')
    from jsonb_array_elements(coalesce(obs->'projeto_comercial'->'dados'->'terceirizados','[]')) t),'[]');
  return r||jsonb_build_object('avisos',comercial_avisos_pedido_textos(emp),'terceirizados',terc,
    'pagamento_config',jsonb_build_object(
      'descontoComercial',obs->'pagamento_config'->'descontoComercial',
      'descontoBV',obs->'pagamento_config'->'descontoBV',
      'abatidoBV',obs->'pagamento_config'->'abatidoBV',
      'creditoCliente',obs->'pagamento_config'->'creditoCliente',
      'descontoPedido',obs->'pagamento_config'->'descontoBvPedido'),
    'exibicao_financeiro',jsonb_build_object(
      'frete_desconto',coalesce(obs->'exibicao_financeiro'->'frete_desconto','false'::jsonb),
      'montagem_desconto',coalesce(obs->'exibicao_financeiro'->'montagem_desconto','false'::jsonb),
      'desconto_mostrar',coalesce(obs->'exibicao_financeiro'->'bv_desconto','false'::jsonb),
      'desconto_texto',left(coalesce(obs->'exibicao_financeiro'->>'bv_texto','Desconto especial'),100)));
end $$;
notify pgrst,'reload schema';
commit;
