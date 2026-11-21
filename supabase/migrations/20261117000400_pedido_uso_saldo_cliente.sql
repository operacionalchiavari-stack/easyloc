-- Consome os títulos de BV/crédito usados como abatimento, sem criar movimentação bancária.
-- O pedido já gera suas parcelas pelo valor líquido, por isso não se abate o receber novamente.
begin;
create table public.fin_pedido_abatimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  pedido_id uuid not null references separacoes_pedidos(id) deferrable initially deferred,
  cliente_id uuid not null references clientes_empresas(id),
  pagar_id uuid not null references fin_pagar(id),
  tipo text not null check (tipo in ('bv','credito')),
  valor numeric(15,2) not null check(valor>0),
  criado_por uuid not null, criado_em timestamptz not null default now(),
  estornado_em timestamptz, estornado_por uuid
);
create index on public.fin_pedido_abatimentos(pedido_id) where estornado_em is null;
create index on public.fin_pedido_abatimentos(pagar_id) where estornado_em is null;
alter table public.fin_pedido_abatimentos enable row level security;
revoke all on public.fin_pedido_abatimentos from anon,authenticated;
grant select on public.fin_pedido_abatimentos to authenticated;
create policy ler on public.fin_pedido_abatimentos for select to authenticated using (
  eh_membro_empresa(empresa_id) and (operacao_pode(empresa_id,'comercial.pedidos.valores') or fin_pode(empresa_id,'financeiro.fluxo.visualizar'))
);

create function public.fin_pedido_aplicar_abatimentos() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  cfg jsonb := new.observacoes->'pagamento_config';
  bv numeric := 0; credito numeric := 0;
  ativo_bv numeric; ativo_credito numeric;
  tipo_atual text; restante numeric; parte numeric;
  campo text; valor_campo numeric;
  titulo fin_pagar; uso fin_pedido_abatimentos;
begin
  -- Projetos antigos não ganham débitos retroativos ao abrir ou salvar imagens.
  if coalesce(cfg->'usoSaldoConta','false'::jsonb)<>'true'::jsonb
     and not exists(select 1 from fin_pedido_abatimentos where pedido_id=new.id and estornado_em is null) then return new; end if;
  if coalesce(cfg->'usoSaldoConta','false'::jsonb)='true'::jsonb and coalesce(new.status_comercial,'')<>'cancelado'
     and coalesce(new.status,'')<>'cancelado' then
    foreach campo in array array['descontoBV','abatidoBV','creditoCliente','descontoComercial'] loop
      begin valor_campo:=coalesce(nullif(cfg->>campo,'')::numeric,0);
      exception when others then raise exception 'Valores de BV ou crédito inválidos'; end;
      if valor_campo<0 or valor_campo::text in ('NaN','Infinity','-Infinity') or valor_campo<>round(valor_campo,2) then
        raise exception 'Valores de BV ou crédito inválidos'; end if;
    end loop;
    bv:=coalesce(nullif(cfg->>'descontoBV','')::numeric,0)+coalesce(nullif(cfg->>'abatidoBV','')::numeric,0);
    credito:=coalesce(nullif(cfg->>'creditoCliente','')::numeric,0);
    if bv+credito>greatest(coalesce(new.valor_total,0)-coalesce(nullif(cfg->>'descontoComercial','')::numeric,0),0) then
      raise exception 'O abatimento não pode superar o valor restante do pedido';
    end if;
  end if;
  select coalesce(sum(valor) filter(where tipo='bv'),0),coalesce(sum(valor) filter(where tipo='credito'),0)
    into ativo_bv,ativo_credito from fin_pedido_abatimentos where pedido_id=new.id and estornado_em is null;
  if bv=ativo_bv and credito=ativo_credito and not exists(
    select 1 from fin_pedido_abatimentos where pedido_id=new.id and estornado_em is null
      and (cliente_id is distinct from new.cliente_id or empresa_id is distinct from new.empresa_id)) then return new; end if;
  if bv+credito>0 and (auth.uid() is null or not eh_membro_empresa(new.empresa_id)
      or not operacao_pode(new.empresa_id,'comercial.pedidos.editar')) then
    raise exception 'Sem permissão para usar o saldo do cliente' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.empresa_id::text,0));
  -- Reversão e nova aplicação são uma única transação. Falta de saldo desfaz tudo.
  for uso in select * from fin_pedido_abatimentos where pedido_id=new.id and estornado_em is null order by pagar_id,id for update loop
    update fin_pagar set compensado=compensado-uso.valor where id=uso.pagar_id;
    update fin_pedido_abatimentos set estornado_em=now(),estornado_por=auth.uid() where id=uso.id;
  end loop;
  foreach tipo_atual in array array['bv','credito'] loop
    restante:=case when tipo_atual='bv' then bv else credito end;
    if restante<=0 then continue; end if;
    for titulo in select t.* from fin_pagar t
      where t.empresa_id=new.empresa_id and t.fornecedor_id=new.cliente_id and t.status<>'cancelado' and t.aberto>0
        and ((tipo_atual='credito' and t.origem='credito_cliente') or (tipo_atual='bv' and t.origem='bv' and exists (
          select 1 from fin_bv_partes pt where pt.pagar_id=t.id and pt.empresa_id=new.empresa_id and pt.cliente_id=new.cliente_id and pt.ativo)))
      order by t.emissao,t.id for update loop
      parte:=least(restante,titulo.aberto);
      if parte<=0 then continue; end if;
      update fin_pagar set compensado=compensado+parte where id=titulo.id;
      insert into fin_pedido_abatimentos(empresa_id,pedido_id,cliente_id,pagar_id,tipo,valor,criado_por)
        values(new.empresa_id,new.id,new.cliente_id,titulo.id,tipo_atual,parte,auth.uid());
      restante:=restante-parte; exit when restante<=0;
    end loop;
    if restante>0 then raise exception '% insuficiente na conta do cliente. Atualize o saldo antes de salvar.',case when tipo_atual='bv' then 'BV' else 'Crédito' end; end if;
  end loop;
  perform fin_auditar(new.empresa_id,'separacoes_pedidos',new.id,'uso_saldo_cliente',
    jsonb_build_object('bv',ativo_bv,'credito',ativo_credito),jsonb_build_object('bv',bv,'credito',credito),
    'Abatimentos de BV e crédito no pedido '||coalesce(new.numero_pedido,''));
  return new;
end $$;
create trigger aa_fin_pedido_abatimentos before insert or update of observacoes,cliente_id,status,status_comercial,valor_total
  on public.separacoes_pedidos for each row execute function public.fin_pedido_aplicar_abatimentos();
revoke all on function public.fin_pedido_aplicar_abatimentos() from public,anon,authenticated;

create function public.fin_pedido_proteger_saldo_usado() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from fin_pedido_abatimentos where pagar_id=old.id and estornado_em is null)
    and (new.status='cancelado' or new.fornecedor_id is distinct from old.fornecedor_id
         or new.origem is distinct from old.origem or new.valor<new.pago+new.compensado) then
    raise exception 'Este saldo já foi usado em um pedido. Remova o abatimento do pedido antes de alterar a origem.';
  end if;
  return new;
end $$;
create trigger fin_pedido_saldo_usado before update on public.fin_pagar for each row execute function public.fin_pedido_proteger_saldo_usado();
revoke all on function public.fin_pedido_proteger_saldo_usado() from public,anon,authenticated;

create or replace function public.pedido_saldo_conta_cliente(p_empresa uuid,p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare bv numeric; credito numeric; aplicacoes jsonb;
begin
  if not eh_membro_empresa(p_empresa) or not (
    (funcionario_pode(p_empresa,auth.uid(),'comercial.pedidos.visualizar') and funcionario_pode(p_empresa,auth.uid(),'comercial.pedidos.valores'))
    or fin_pode(p_empresa,'financeiro.fluxo.visualizar')) then
    raise exception 'Sem permissão para consultar o saldo do cliente' using errcode='42501'; end if;
  if not exists(select 1 from clientes_empresas where id=p_cliente and empresa_id=p_empresa) then raise exception 'Cliente não encontrado nesta empresa'; end if;
  select coalesce(sum(aberto) filter(where origem='bv' and exists(
    select 1 from fin_bv_partes pt where pt.pagar_id=t.id and pt.empresa_id=p_empresa and pt.cliente_id=p_cliente and pt.ativo)),0),
    coalesce(sum(aberto) filter(where origem='credito_cliente'),0)
    into bv,credito from fin_pagar t where empresa_id=p_empresa and fornecedor_id=p_cliente and origem in ('bv','credito_cliente') and status<>'cancelado';
  select coalesce(jsonb_agg(x),'[]'::jsonb) into aplicacoes from (
    select pedido_id,coalesce(sum(valor) filter(where tipo='bv'),0) bv,coalesce(sum(valor) filter(where tipo='credito'),0) credito
      from fin_pedido_abatimentos where empresa_id=p_empresa and cliente_id=p_cliente and estornado_em is null group by pedido_id
  ) x;
  return jsonb_build_object('bv',bv,'credito',credito,'total',bv+credito,'aplicacoes',aplicacoes);
end $$;
notify pgrst,'reload schema';
commit;
