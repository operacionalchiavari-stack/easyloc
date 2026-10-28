-- A vigência é registrada pelo servidor a cada alteração do BV no cadastro.
alter table public.clientes_empresas add column bv_vigente_desde timestamptz;
create table public.cliente_bv_vigencias (
  id uuid primary key default gen_random_uuid(),
  ordem bigint generated always as identity unique,
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes_empresas(id) on delete cascade,
  inicio timestamptz not null,
  recebe boolean not null,
  percentual numeric(5,2) not null check (percentual between 0 and 100),
  criado_por uuid
);
create index cliente_bv_vigencias_busca on public.cliente_bv_vigencias(empresa_id,cliente_id,inicio desc);
alter table public.cliente_bv_vigencias enable row level security;
create policy cliente_bv_vigencias_ler on public.cliente_bv_vigencias for select to authenticated
  using (public.eh_membro_empresa(empresa_id) and
    (public.funcionario_pode(empresa_id,auth.uid(),'comercial.clientes.visualizar') or
     public.fin_pode(empresa_id,'financeiro.fluxo.visualizar')));
grant select on public.cliente_bv_vigencias to authenticated;

-- Clientes que já estavam habilitados começam a vigência agora, sem retroagir pedidos antigos.
update public.clientes_empresas set bv_vigente_desde=now() where bv_recebe;
insert into public.cliente_bv_vigencias(empresa_id,cliente_id,inicio,recebe,percentual,criado_por)
select empresa_id,id,bv_vigente_desde,true,bv_percentual,auth.uid() from public.clientes_empresas where bv_recebe;

create function public.cliente_bv_marcar_vigencia()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    new.bv_vigente_desde := case when new.bv_recebe then now() else null end;
  elsif (new.bv_recebe,new.bv_percentual) is distinct from (old.bv_recebe,old.bv_percentual) then
    new.bv_vigente_desde := now();
  else
    new.bv_vigente_desde := old.bv_vigente_desde;
  end if;
  return new;
end $$;
create trigger cliente_bv_vigencia_marcar before insert or update on public.clientes_empresas
  for each row execute function public.cliente_bv_marcar_vigencia();

create function public.cliente_bv_gravar_vigencia()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (tg_op='INSERT' and new.bv_recebe) or
    (tg_op='UPDATE' and (new.bv_recebe,new.bv_percentual) is distinct from (old.bv_recebe,old.bv_percentual)) then
    insert into public.cliente_bv_vigencias(empresa_id,cliente_id,inicio,recebe,percentual,criado_por)
      values(new.empresa_id,new.id,new.bv_vigente_desde,new.bv_recebe,new.bv_percentual,auth.uid());
  end if;
  return new;
end $$;
create trigger cliente_bv_vigencia_gravar after insert or update on public.clientes_empresas
  for each row execute function public.cliente_bv_gravar_vigencia();

create function public.fin_bv_percentual_na_criacao(p_empresa uuid,p_cliente uuid,p_criado timestamptz)
returns numeric language sql stable security definer set search_path=public as $$
  select coalesce((select case when recebe then percentual else 0 end
    from public.cliente_bv_vigencias where empresa_id=p_empresa and cliente_id=p_cliente and inicio<=p_criado
    order by inicio desc,ordem desc limit 1),0)
$$;
revoke all on function public.cliente_bv_marcar_vigencia(),public.cliente_bv_gravar_vigencia(),
  public.fin_bv_percentual_na_criacao(uuid,uuid,timestamptz) from public,anon,authenticated;

create or replace function public.fin_bv_sincronizar()
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
  if b.pedido_id is null or trocar then pct := public.fin_bv_percentual_na_criacao(new.empresa_id,c.id,new.criado_em);
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
