begin;
-- Um valor por área; a soma legada continua disponível para as integrações financeiras.
create function public.pedido_descontos_areas(p_config jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare mapa jsonb:=p_config->'descontosAreas';resultado jsonb:='{}';area text;valor numeric;
begin
  if mapa is not null and mapa<>'null'::jsonb then
    if jsonb_typeof(mapa)<>'object' then raise exception 'Mapa de descontos inválido';end if;
    if exists(select 1 from jsonb_object_keys(mapa)chave where chave not in('locacao','frete','montagem','customizacao')) then
      raise exception 'Área de desconto inválida';end if;
  else
    area:=coalesce(nullif(p_config->>'descontoComercialArea',''),'locacao');
    if area not in('locacao','frete','montagem','customizacao') then raise exception 'Área de desconto inválida';end if;
    mapa:=jsonb_build_object(area,p_config->'descontoComercial');
  end if;
  foreach area in array array['locacao','frete','montagem','customizacao'] loop
    begin valor:=pedido_valor_financeiro(mapa->>area);exception when others then raise exception 'Desconto inválido em %',area;end;
    if valor::text in('NaN','Infinity','-Infinity') or valor<0 or valor<>round(valor,2) then raise exception 'Desconto inválido em %',area;end if;
    resultado:=resultado||jsonb_build_object(area,valor);
  end loop;
  return resultado;
end $$;

create or replace function public.fin_bv_base(p_observacoes jsonb,p_total numeric) returns numeric
language sql immutable set search_path=public as $$
  select round(greatest(least(coalesce((p_observacoes->'valores'->>'locacao_bv')::numeric,
    (select sum(coalesce((i->>'valor_locacao')::numeric,0)*coalesce((i->>'quantidade_solicitada')::numeric,0))
      from jsonb_array_elements(case when jsonb_typeof(p_observacoes->'itens_comerciais')='array'
        then p_observacoes->'itens_comerciais' else '[]'::jsonb end)i),0)
    -(pedido_descontos_areas(p_observacoes->'pagamento_config')->>'locacao')::numeric,
    greatest(coalesce(p_total,0),0)),0),2)
$$;

create or replace function public.pedido_conferir_bv_desconto_area() returns trigger
language plpgsql security definer set search_path=public as $$
declare cfg jsonb:=coalesce(new.observacoes->'pagamento_config','{}');bv jsonb:=coalesce(new.observacoes->'bv','{}');
  antigo jsonb:='{}';bv_antigo jsonb:='{}';mudou_bv boolean;mudou_desconto boolean;motivo comercial_motivos_bv;
  area text:=nullif(cfg->>'descontoComercialArea','');descontos jsonb;desconto numeric;limite numeric;
  v jsonb:=coalesce(new.observacoes->'valores','{}');tem_mapa boolean:=cfg->'descontosAreas' is not null and cfg->'descontosAreas'<>'null'::jsonb;
begin
  if tg_op='UPDATE' then antigo:=coalesce(old.observacoes->'pagamento_config','{}');bv_antigo:=coalesce(old.observacoes->'bv','{}');end if;
  descontos:=pedido_descontos_areas(cfg);
  if tem_mapa then
    select case when count(*)=1 then min(key) else null end into area from jsonb_each_text(descontos) where value::numeric>0;
    select sum(value::numeric) into desconto from jsonb_each_text(descontos);
    cfg:=cfg||jsonb_build_object('descontosAreas',descontos,'descontoComercial',desconto,'descontoComercialArea',area);
    new.observacoes:=jsonb_set(coalesce(new.observacoes,'{}'),'{pagamento_config}',cfg);
  end if;
  mudou_bv:=bv is distinct from bv_antigo;
  mudou_desconto:=(cfg->>'descontoComercial') is distinct from (antigo->>'descontoComercial')
    or area is distinct from nullif(antigo->>'descontoComercialArea','') or cfg->'descontosAreas' is distinct from antigo->'descontosAreas';
  if (mudou_bv and coalesce(bv->>'manual','')='true') or (mudou_desconto and (area is not null or tem_mapa)) then
    if auth.uid() is null or not eh_membro_empresa(new.empresa_id) or not operacao_pode(new.empresa_id,'comercial.pedidos.editar') then
      raise exception 'Sem permissão para editar o BV ou o desconto do pedido' using errcode='42501';end if;
  end if;
  if coalesce(bv->>'manual','')='true' then
    if nullif(bv->>'motivo_id','') is not null then
      select * into motivo from comercial_motivos_bv where id=fin_uuid(bv->>'motivo_id') and empresa_id=new.empresa_id;
      if motivo.id is null or (not motivo.ativo and mudou_bv) then raise exception 'Selecione um motivo de negociação do BV ativo em Parâmetros > Comercial';end if;
      bv:=bv||jsonb_build_object('observacao',case when (bv->>'motivo_id')=(bv_antigo->>'motivo_id')
        then coalesce(nullif(bv_antigo->>'observacao',''),motivo.nome) else motivo.nome end);
      new.observacoes:=jsonb_set(new.observacoes,'{bv}',bv);
    elsif mudou_bv then raise exception 'Selecione o motivo da negociação do BV em Parâmetros > Comercial';end if;
  end if;
  if (area is not null or tem_mapa) and coalesce(new.status_comercial,'')<>'cancelado' and coalesce(new.status,'')<>'cancelado' then
    foreach area in array array['locacao','frete','montagem','customizacao'] loop
      limite:=case area when 'locacao' then coalesce(nullif(v->>'locacao_bv','')::numeric,nullif(v->>'locacao','')::numeric,0)
        when 'customizacao' then coalesce(nullif(v->>'customizacoes','')::numeric,0) else coalesce(nullif(v->>area,'')::numeric,0) end;
      if (descontos->>area)::numeric>greatest(limite,0)+.005 then raise exception 'O desconto supera o valor da área selecionada: %',area;end if;
    end loop;
  end if;
  return new;
end $$;

create or replace function public.pedido_conferir_parcelas_desconto_area() returns trigger
language plpgsql security definer set search_path=public as $$
declare cfg jsonb:=coalesce(new.observacoes->'pagamento_config','{}');v jsonb:=coalesce(new.observacoes->'valores','{}');
  d jsonb;esperados numeric[];programados numeric[];desconto numeric;restante numeric;parte numeric;i integer;
begin
  if (nullif(cfg->>'descontoComercialArea','') is null and (cfg->'descontosAreas' is null or cfg->'descontosAreas'='null'))
    or coalesce(new.status_comercial,'')='cancelado' or coalesce(new.status,'')='cancelado' then return new;end if;
  d:=pedido_descontos_areas(cfg);select sum(value::numeric) into desconto from jsonb_each_text(d);
  if desconto=0 then return new;end if;
  esperados:=array[coalesce((v->>'locacao')::numeric,0),coalesce((v->>'frete')::numeric,0),coalesce((v->>'montagem')::numeric,0)];
  if abs(esperados[1]+esperados[2]+esperados[3]-coalesce(new.valor_total,0))>.01 then
    esperados[1]:=greatest(coalesce(new.valor_total,0)-esperados[2]-esperados[3],0);end if;
  esperados[1]:=greatest(esperados[1]-(d->>'locacao')::numeric-(d->>'customizacao')::numeric,0);
  esperados[2]:=greatest(esperados[2]-(d->>'frete')::numeric,0);esperados[3]:=greatest(esperados[3]-(d->>'montagem')::numeric,0);
  restante:=greatest(pedido_valor_financeiro(cfg->>'descontoBV'),0)+greatest(pedido_valor_financeiro(cfg->>'abatidoBV'),0)
    +greatest(pedido_valor_financeiro(cfg->>'creditoCliente'),0)+greatest(pedido_valor_financeiro(cfg->>'descontoBvPedido'),0);
  if desconto+restante>coalesce(new.valor_total,0)+.005 then raise exception 'Os descontos e saldos superam o valor restante do pedido';end if;
  for i in 1..3 loop parte:=least(esperados[i],restante);esperados[i]:=round(esperados[i]-parte,2);restante:=restante-parte;end loop;
  if jsonb_typeof(new.observacoes->'parcelas_financeiras') is distinct from 'array' then raise exception 'Programe as parcelas para aplicar o desconto';end if;
  select array[coalesce(sum((x->>'valor')::numeric)filter(where coalesce(x->>'componente','locacao')='locacao'),0),
    coalesce(sum((x->>'valor')::numeric)filter(where x->>'componente'='frete'),0),
    coalesce(sum((x->>'valor')::numeric)filter(where x->>'componente'='montagem'),0)]
    into programados from jsonb_array_elements(new.observacoes->'parcelas_financeiras')x;
  for i in 1..3 loop if abs(esperados[i]-programados[i])>.01 then raise exception 'Atualize as parcelas da área selecionada para o desconto';end if;end loop;
  return new;
end $$;

do $patch$ declare fonte text;trecho text;begin
  select pg_get_functiondef('public.pagamento_link_pedido(uuid)'::regprocedure) into fonte;
  trecho:='''descontoComercialArea'',obs->''pagamento_config''->''descontoComercialArea'',';
  if position(trecho in fonte)=0 then raise exception 'Documento público incompatível com os descontos por área';end if;
  execute replace(fonte,trecho,trecho||E'\n      ''descontosAreas'',obs->''pagamento_config''->''descontosAreas'',');
end $patch$;
notify pgrst,'reload schema';
commit;
