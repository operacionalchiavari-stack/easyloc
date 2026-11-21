begin;
create table public.comercial_motivos_bv(
  id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null check(length(trim(nome)) between 3 and 120),ativo boolean not null default true,
  ordem integer not null default 0,criado_em timestamptz not null default now()
);
create unique index comercial_motivos_bv_nome on comercial_motivos_bv(empresa_id,lower(trim(nome)));
alter table comercial_motivos_bv enable row level security;
create policy bv_motivos_ler on comercial_motivos_bv for select to authenticated using(eh_membro_empresa(empresa_id));
create policy bv_motivos_criar on comercial_motivos_bv for insert to authenticated
  with check(eh_membro_empresa(empresa_id) and operacao_pode(empresa_id,'configuracoes.empresa.editar'));
create policy bv_motivos_editar on comercial_motivos_bv for update to authenticated
  using(eh_membro_empresa(empresa_id) and operacao_pode(empresa_id,'configuracoes.empresa.editar'))
  with check(eh_membro_empresa(empresa_id) and operacao_pode(empresa_id,'configuracoes.empresa.editar'));
create policy seguranca_2fa on comercial_motivos_bv as restrictive for all to authenticated
  using((select seguranca_2fa_ok())) with check((select seguranca_2fa_ok()));
grant select,insert,update on comercial_motivos_bv to authenticated;
revoke all on comercial_motivos_bv from anon;
insert into comercial_motivos_bv(empresa_id,nome,ordem)
select e.id,m.nome,m.ordem from empresas e cross join (values
  ('Negociação comercial',1),('Condição especial para o evento',2),('Acordo com o decorador',3))m(nome,ordem);

-- Configuração do pedido vem de inputs numéricos (ponto decimal) ou de pedidos antigos em BRL.
create function public.pedido_valor_financeiro(p_valor text) returns numeric language sql immutable set search_path=public as $$
  select case when strpos(coalesce(p_valor,''),',')>0 then fin_moeda(p_valor)
    else coalesce(nullif(trim(p_valor),'')::numeric,0) end
$$;

create or replace function public.fin_bv_base(p_observacoes jsonb,p_total numeric) returns numeric
language sql immutable set search_path=public as $$
  select round(greatest(least(coalesce((p_observacoes->'valores'->>'locacao_bv')::numeric,
    (select sum(coalesce((i->>'valor_locacao')::numeric,0)*coalesce((i->>'quantidade_solicitada')::numeric,0))
      from jsonb_array_elements(case when jsonb_typeof(p_observacoes->'itens_comerciais')='array'
        then p_observacoes->'itens_comerciais' else '[]'::jsonb end)i),0)
    -case when coalesce(nullif(p_observacoes->'pagamento_config'->>'descontoComercialArea',''),'locacao')='locacao'
      then greatest(pedido_valor_financeiro(p_observacoes->'pagamento_config'->>'descontoComercial'),0) else 0 end,
    greatest(coalesce(p_total,0),0)),0),2)
$$;

create function public.pedido_conferir_bv_desconto_area() returns trigger
language plpgsql security definer set search_path=public as $$
declare cfg jsonb:=coalesce(new.observacoes->'pagamento_config','{}');bv jsonb:=coalesce(new.observacoes->'bv','{}');
  antigo jsonb:='{}';bv_antigo jsonb:='{}';mudou_bv boolean;mudou_desconto boolean;motivo comercial_motivos_bv;
  area text:=nullif(cfg->>'descontoComercialArea','');desconto numeric;limite numeric;v jsonb:=coalesce(new.observacoes->'valores','{}');
begin
  if tg_op='UPDATE' then antigo:=coalesce(old.observacoes->'pagamento_config','{}');bv_antigo:=coalesce(old.observacoes->'bv','{}');end if;
  mudou_bv:=bv is distinct from bv_antigo;
  mudou_desconto:=(cfg->>'descontoComercial') is distinct from (antigo->>'descontoComercial')
    or area is distinct from nullif(antigo->>'descontoComercialArea','');
  if (mudou_bv and coalesce(bv->>'manual','')='true') or (mudou_desconto and area is not null) then
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
  if area is not null then
    if area not in('locacao','frete','montagem','customizacao') then raise exception 'Área de desconto inválida';end if;
    begin desconto:=coalesce(nullif(cfg->>'descontoComercial','')::numeric,0);exception when others then raise exception 'Desconto inválido';end;
    if desconto::text in('NaN','Infinity','-Infinity') or desconto<0 or desconto<>round(desconto,2) then raise exception 'Desconto inválido';end if;
    limite:=case area when 'locacao' then coalesce(nullif(v->>'locacao_bv','')::numeric,nullif(v->>'locacao','')::numeric,0)
      when 'customizacao' then coalesce(nullif(v->>'customizacoes','')::numeric,0)
      else coalesce(nullif(v->>area,'')::numeric,0) end;
    if coalesce(new.status_comercial,'')<>'cancelado' and coalesce(new.status,'')<>'cancelado' and desconto>greatest(limite,0)+.005 then
      raise exception 'O desconto supera o valor da área selecionada';end if;
  end if;
  return new;
end $$;
revoke all on function public.pedido_conferir_bv_desconto_area() from public,anon,authenticated;
create trigger a0_0_pedido_motivo_desconto before insert or update of observacoes,valor_total,cliente_id,status_comercial
  on separacoes_pedidos for each row execute function public.pedido_conferir_bv_desconto_area();

create function public.pedido_conferir_parcelas_desconto_area() returns trigger
language plpgsql security definer set search_path=public as $$
declare cfg jsonb:=coalesce(new.observacoes->'pagamento_config','{}');area text:=cfg->>'descontoComercialArea';
  v jsonb:=coalesce(new.observacoes->'valores','{}');esperados numeric[];programados numeric[];desconto numeric;restante numeric;parte numeric;i integer;
begin
  if nullif(area,'') is null or coalesce(new.status_comercial,'')='cancelado' or coalesce(new.status,'')='cancelado' then return new;end if;
  desconto:=greatest(coalesce(pedido_valor_financeiro(cfg->>'descontoComercial'),0),0);
  if desconto=0 then return new;end if;
  esperados:=array[coalesce((v->>'locacao')::numeric,0),coalesce((v->>'frete')::numeric,0),coalesce((v->>'montagem')::numeric,0)];
  if abs(esperados[1]+esperados[2]+esperados[3]-coalesce(new.valor_total,0))>.01 then
    esperados[1]:=greatest(coalesce(new.valor_total,0)-esperados[2]-esperados[3],0);end if;
  i:=case area when 'frete' then 2 when 'montagem' then 3 else 1 end;
  esperados[i]:=greatest(esperados[i]-desconto,0);
  restante:=greatest(coalesce(pedido_valor_financeiro(cfg->>'descontoBV'),0),0)+greatest(coalesce(pedido_valor_financeiro(cfg->>'abatidoBV'),0),0)
    +greatest(coalesce(pedido_valor_financeiro(cfg->>'creditoCliente'),0),0)+greatest(coalesce(pedido_valor_financeiro(cfg->>'descontoBvPedido'),0),0);
  for i in 1..3 loop parte:=least(esperados[i],restante);esperados[i]:=round(esperados[i]-parte,2);restante:=restante-parte;end loop;
  if jsonb_typeof(new.observacoes->'parcelas_financeiras') is distinct from 'array' then
    raise exception 'Programe as parcelas para aplicar o desconto';end if;
  select array[coalesce(sum((x->>'valor')::numeric)filter(where coalesce(x->>'componente','locacao')='locacao'),0),
    coalesce(sum((x->>'valor')::numeric)filter(where x->>'componente'='frete'),0),
    coalesce(sum((x->>'valor')::numeric)filter(where x->>'componente'='montagem'),0)]
    into programados from jsonb_array_elements(new.observacoes->'parcelas_financeiras')x;
  for i in 1..3 loop if abs(esperados[i]-programados[i])>.01 then
    raise exception 'Atualize as parcelas da área selecionada para o desconto';end if;end loop;
  return new;
end $$;
revoke all on function public.pedido_conferir_parcelas_desconto_area() from public,anon,authenticated;
create trigger az_pedido_parcelas_desconto_area before insert or update of observacoes,valor_total,cliente_id,status_comercial
  on separacoes_pedidos for each row execute function public.pedido_conferir_parcelas_desconto_area();

do $patch$ declare fonte text;trecho text;begin
  select pg_get_functiondef('public.pedido_bv_converter_desconto()'::regprocedure) into fonte;
  if position('fin_moeda(' in fonte)=0 then raise exception 'Conversão de BV incompatível com a leitura dos centavos';end if;
  execute replace(fonte,'fin_moeda(','pedido_valor_financeiro(');
  select pg_get_functiondef('public.pagamento_link_pedido(uuid)'::regprocedure) into fonte;
  trecho:='''descontoComercial'',obs->''pagamento_config''->''descontoComercial'',';
  if position(trecho in fonte)=0 then raise exception 'Documento público incompatível com o desconto por área';end if;
  execute replace(fonte,trecho,trecho||E'\n      ''descontoComercialArea'',obs->''pagamento_config''->''descontoComercialArea'',');
end $patch$;
notify pgrst,'reload schema';
commit;
