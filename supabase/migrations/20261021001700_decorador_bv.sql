-- BV é uma comissão sobre a locação, separada dos descontos concedidos ao cliente.
alter table public.clientes_empresas
  add column bv_recebe boolean not null default false,
  add column bv_percentual numeric(5,2) not null default 0 check (bv_percentual between 0 and 100),
  add constraint cliente_bv_percentual_positivo check (not bv_recebe or bv_percentual > 0);

create table public.fin_bv_comissoes (
  pedido_id uuid primary key references public.separacoes_pedidos(id) on delete restrict,
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes_empresas(id) on delete restrict,
  percentual numeric(5,2) not null check (percentual between 0 and 100),
  base_locacao numeric(15,2) not null check (base_locacao >= 0),
  valor numeric(15,2) not null check (valor >= 0),
  pagar_id uuid unique references public.fin_pagar(id) on delete restrict,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fin_bv_cliente on public.fin_bv_comissoes(empresa_id,cliente_id);
alter table public.fin_bv_comissoes enable row level security;
create policy fin_bv_ler on public.fin_bv_comissoes for select to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.fin_pode(empresa_id,'financeiro.fluxo.visualizar'));
grant select on public.fin_bv_comissoes to authenticated;

create function public.fin_bv_base(p_observacoes jsonb, p_total numeric)
returns numeric language sql immutable set search_path=public as $$
  select round(greatest(least(coalesce(
    (p_observacoes->'valores'->>'locacao_bv')::numeric,
    -- Pedidos antigos: usa apenas os itens de locação, sem somar os serviços adicionais.
    (select sum(coalesce((i->>'valor_locacao')::numeric,0) * coalesce((i->>'quantidade_solicitada')::numeric,0))
       from jsonb_array_elements(case when jsonb_typeof(p_observacoes->'itens_comerciais')='array'
         then p_observacoes->'itens_comerciais' else '[]'::jsonb end) i),
    0) - greatest(public.fin_moeda(p_observacoes->'pagamento_config'->>'descontoComercial'),0),
    greatest(coalesce(p_total,0),0)),0),2)
$$;

-- Os pedidos que já estavam aprovados antes desta implantação não ganham BV retroativo.
insert into public.fin_bv_comissoes(pedido_id,empresa_id,cliente_id,percentual,base_locacao,valor)
select p.id,p.empresa_id,p.cliente_id,0,public.fin_bv_base(p.observacoes,p.valor_total),0
from public.separacoes_pedidos p join public.clientes_empresas c on c.id=p.cliente_id and c.empresa_id=p.empresa_id
where p.status_comercial in ('aprovado','enviado','finalizado');

create function public.fin_bv_sincronizar()
returns trigger language plpgsql security definer set search_path=public as $$
declare c clientes_empresas%rowtype; b fin_bv_comissoes%rowtype; t fin_pagar%rowtype;
  pct numeric; base numeric; total numeric; categoria uuid; titulo uuid; elegivel boolean; trocar boolean;
  flag_anterior text := current_setting('app.bv_sync',true);
begin
  select * into b from fin_bv_comissoes where pedido_id=new.id for update;
  if b.pagar_id is not null then select * into t from fin_pagar where id=b.pagar_id for update; end if;
  elegivel := coalesce(new.status_comercial,'') in ('aprovado','enviado','finalizado');
  trocar := b.pedido_id is not null and b.cliente_id is distinct from new.cliente_id;
  if coalesce(t.pago,0)>0 and (not elegivel or trocar) then
    raise exception 'Estorne os pagamentos de BV antes de cancelar, reabrir ou trocar o decorador deste pedido.';
  end if;
  select * into c from clientes_empresas where id=new.cliente_id and empresa_id=new.empresa_id;
  if not elegivel or c.id is null then
    if b.pedido_id is not null then
      perform set_config('app.bv_sync','sim',true);
      update fin_bv_comissoes set ativo=false,updated_at=now() where pedido_id=new.id;
      update fin_pagar set status='cancelado',cancelado_em=now(),cancelamento_motivo='Pedido fora dos status de comissão'
        where id=b.pagar_id;
      perform set_config('app.bv_sync',coalesce(flag_anterior,''),true);
    end if;
    return new;
  end if;
  if b.pedido_id is null or trocar then pct := case when c.bv_recebe then c.bv_percentual else 0 end;
  else pct := b.percentual; end if;
  -- Registra também 0%: habilitar BV depois não cria comissão retroativa nesses pedidos.
  base := fin_bv_base(new.observacoes,new.valor_total);
  if base::text in ('NaN','Infinity','-Infinity') then raise exception 'Base de locação inválida para o BV.'; end if;
  total := round(base*pct/100,2);
  if total<coalesce(t.pago,0) then
    raise exception 'O BV recalculado (%) é menor que o BV já pago (%). Estorne a diferença antes de reduzir a locação.',total,t.pago;
  end if;
  perform set_config('app.bv_sync','sim',true);
  if total>0 then
    insert into fin_categorias(empresa_id,nome,tipo,chave,ordem)
      values(new.empresa_id,'Comissões de decoradores (BV)','saida','bv_decoradores',90)
      on conflict (empresa_id,chave) where chave is not null do nothing;
    select id into categoria from fin_categorias where empresa_id=new.empresa_id and chave='bv_decoradores';
    if b.pagar_id is null then
      insert into fin_pagar(empresa_id,origem,origem_id,fornecedor_id,fornecedor_nome,descricao,documento,
        emissao,competencia,vencimento,valor,categoria_id,observacoes)
      values(new.empresa_id,'bv',new.id,c.id,c.nome_razao,'BV · Pedido '||new.numero_pedido,new.numero_pedido,
        current_date,new.data_evento,coalesce(new.data_evento,current_date),total,categoria,
        pct||'% sobre a locação de '||base)
      returning id into titulo;
    else
      titulo := b.pagar_id;
      update fin_pagar set fornecedor_id=c.id,fornecedor_nome=c.nome_razao,valor=total,
        descricao='BV · Pedido '||new.numero_pedido,documento=new.numero_pedido,
        competencia=new.data_evento,vencimento=coalesce(new.data_evento,current_date),
        status=case when pago>=total then 'pago' when pago>0 then 'parcial'
          when status in ('cancelado','pago','parcial') then 'pendente' else status end,
        cancelado_em=null,cancelamento_motivo=null,
        observacoes=pct||'% sobre a locação de '||base where id=titulo;
    end if;
  elsif b.pagar_id is not null then
    titulo:=b.pagar_id;
    update fin_pagar set status='cancelado',cancelado_em=now(),cancelamento_motivo='BV sem valor a pagar' where id=titulo;
  end if;
  insert into fin_bv_comissoes(pedido_id,empresa_id,cliente_id,percentual,base_locacao,valor,pagar_id)
    values(new.id,new.empresa_id,c.id,pct,base,total,titulo)
    on conflict(pedido_id) do update set cliente_id=excluded.cliente_id,percentual=excluded.percentual,
      base_locacao=excluded.base_locacao,valor=excluded.valor,pagar_id=excluded.pagar_id,ativo=true,updated_at=now();
  if b.pedido_id is null or (b.base_locacao,b.valor,b.cliente_id,b.ativo) is distinct from (base,total,c.id,true) then
    perform fin_auditar(new.empresa_id,'fin_bv_comissoes',new.id,'calculo',to_jsonb(b),
      jsonb_build_object('base',base,'percentual',pct,'valor',total,'cliente_id',c.id),'BV calculado pelo pedido');
  end if;
  perform set_config('app.bv_sync',coalesce(flag_anterior,''),true);
  return new;
end $$;
create trigger fin_bv_pedido after insert or update of cliente_id,status_comercial,valor_total,observacoes,data_evento
  on public.separacoes_pedidos for each row execute function public.fin_bv_sincronizar();

-- Valor/beneficiário do BV são mantidos pelo pedido; pagamentos e estornos usam as baixas existentes.
create function public.fin_bv_proteger_titulo()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.origem='bv' and coalesce(current_setting('app.bv_sync',true),'')<>'sim' and
    ((new.valor,new.origem,new.origem_id,new.fornecedor_id) is distinct from
     (old.valor,old.origem,old.origem_id,old.fornecedor_id) or (new.status='cancelado' and old.status<>'cancelado')) then
    raise exception 'O valor e o cancelamento do BV são controlados pelo pedido de origem.';
  end if;
  return new;
end $$;
create trigger fin_bv_proteger before update on public.fin_pagar for each row execute function public.fin_bv_proteger_titulo();

create function public.fin_bv_extrato(p_empresa uuid, p_cliente uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare clientes jsonb; pedidos jsonb; pagamentos jsonb;
begin
  if not public.eh_membro_empresa(p_empresa) or not public.fin_pode(p_empresa,'financeiro.fluxo.visualizar') then
    raise exception 'Sem permissão para ver o extrato de BV' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.nome_razao),'[]') into clientes from
    (select c.id,c.nome_razao,c.bv_recebe,c.bv_percentual from clientes_empresas c where c.empresa_id=p_empresa
      and (c.bv_recebe or exists(select 1 from fin_bv_comissoes b where b.empresa_id=p_empresa and b.cliente_id=c.id and b.percentual>0))) c;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.data_evento desc nulls last,x.numero_pedido desc),'[]') into pedidos from (
    select p.id,p.numero_pedido,p.cliente_id,p.cliente_nome,p.data_evento,p.status_comercial,
      coalesce(b.base_locacao,fin_bv_base(p.observacoes,p.valor_total)) base_locacao,
      b.percentual,b.valor,coalesce(t.pago,0) pago,
      case when b.ativo and t.status<>'cancelado' then coalesce(t.aberto,0) else 0 end saldo,
      b.pagar_id,t.status status_pagamento,coalesce(b.ativo,false) ativo,
      case when b.pedido_id is not null then 'registrado' else 'sem_registro' end registro
    from separacoes_pedidos p join clientes_empresas c on c.id=p.cliente_id and c.empresa_id=p.empresa_id
    left join fin_bv_comissoes b on b.pedido_id=p.id and b.empresa_id=p.empresa_id
    left join fin_pagar t on t.id=b.pagar_id and t.empresa_id=p.empresa_id
    where p.empresa_id=p_empresa and (p_cliente is null or p.cliente_id=p_cliente)
      and (c.bv_recebe or b.percentual>0)) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.data desc,x.created_at desc),'[]') into pagamentos from (
    select f.id,f.pagar_id,f.data,f.valor,f.liquido,f.forma,f.observacoes,f.estornado_em,f.estorno_motivo,
      f.created_at,c.nome conta,p.numero_pedido,b.cliente_id,cl.nome_razao cliente_nome
    from fin_baixas f join fin_bv_comissoes b on b.pagar_id=f.pagar_id and b.empresa_id=f.empresa_id
    join separacoes_pedidos p on p.id=b.pedido_id and p.empresa_id=b.empresa_id
    join clientes_empresas cl on cl.id=b.cliente_id and cl.empresa_id=b.empresa_id
    left join fin_contas c on c.id=f.conta_id and c.empresa_id=f.empresa_id
    where f.empresa_id=p_empresa and (p_cliente is null or b.cliente_id=p_cliente)) x;
  return jsonb_build_object('clientes',clientes,'pedidos',pedidos,'pagamentos',pagamentos);
end $$;
revoke all on function public.fin_bv_sincronizar(),public.fin_bv_proteger_titulo(),public.fin_bv_extrato(uuid,uuid),public.fin_bv_base(jsonb,numeric) from public,anon,authenticated;
grant execute on function public.fin_bv_extrato(uuid,uuid) to authenticated;
