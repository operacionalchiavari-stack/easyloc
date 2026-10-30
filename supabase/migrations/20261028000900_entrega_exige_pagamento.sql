-- Pagamento antes da entrega (out/2026): Parâmetros > Financeiro pode exigir que uma porcentagem do pedido (ex.: 100% ou
-- 80%) esteja paga para a Entrega ser confirmada. Pago = valor dos títulos do pedido em Contas a receber menos o que está em
-- aberto (recebido + compensado); títulos cancelados não contam. Pedido sem títulos usa o valor total do pedido como devido.
begin;
alter table public.empresa_financeiro add column if not exists entrega_exige_pagamento boolean not null default false;
alter table public.empresa_financeiro add column if not exists entrega_pagamento_percent numeric not null default 100;
alter table public.empresa_financeiro drop constraint if exists empresa_financeiro_entrega_pagamento_percent_check;
alter table public.empresa_financeiro add constraint empresa_financeiro_entrega_pagamento_percent_check
  check (entrega_pagamento_percent > 0 and entrega_pagamento_percent <= 100);

-- Quanto do pedido está pago e se a entrega está liberada pela regra da empresa.
create or replace function public.pedido_pagamento_entrega(p_pedido uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare p public.separacoes_pedidos; f public.empresa_financeiro; total numeric; pago numeric; exigido numeric; perc numeric;
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido;
  select * into f from public.empresa_financeiro where empresa_id=p.empresa_id;
  select coalesce(sum(r.valor),0), coalesce(sum(r.valor-r.aberto),0) into total, pago
    from public.fin_receber r where r.pedido_id=p.id and r.status<>'cancelado';
  if total=0 then total:=coalesce(p.valor_total,0); end if;
  perc:=case when total>0 then round(pago*100/total,2) else 100 end;
  exigido:=coalesce(f.entrega_pagamento_percent,100);
  return jsonb_build_object('exige',coalesce(f.entrega_exige_pagamento,false),'percentual_exigido',exigido,
    'total',total,'pago',pago,'percentual_pago',perc,
    'falta',greatest(round(total*exigido/100-pago,2),0),
    'liberada',not coalesce(f.entrega_exige_pagamento,false) or total<=0 or pago>=round(total*exigido/100,2)-0.005);
end $fn$;
revoke all on function public.pedido_pagamento_entrega(uuid) from public, anon, authenticated;

create or replace function public.pedido_pagamento_entrega_msg(s jsonb) returns text language sql immutable as $fn$
  select 'Entrega bloqueada pelo Financeiro: o pedido precisa ter '||trim_scale((s->>'percentual_exigido')::numeric)||'% pago antes da entrega. Pago: '
    ||trim_scale((s->>'percentual_pago')::numeric)||'% — falta R$ '||replace(replace(replace(to_char((s->>'falta')::numeric,'FM999,999,990.00'),',','#'),'.',','),'#','.')||'.'
$fn$;
revoke all on function public.pedido_pagamento_entrega_msg(jsonb) from public, anon;

-- Tela de Entregas e Coletas: mostra o motivo e trava o formulário.
create or replace function public.logistica_confirmacao_base(p_pedido uuid, p_etapa text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare p separacoes_pedidos; b jsonb; etapa text; pre boolean; pg jsonb;
begin
 b:=logistica_confirmacao_base_antes_fluxo(p_pedido,p_etapa);
 select * into strict p from separacoes_pedidos where id=p_pedido;
 etapa:=pedido_fluxo_etapa(p);
 if etapa in ('comercial','cancelado') then raise exception 'Pedido não disponível para este setor'; end if;
 if etapa='pre_reserva' then
  select pre_reservas_consulta into pre from empresa_fluxo_pedidos where empresa_id=p.empresa_id;
  if not coalesce(pre,false) or p_etapa<>'entrega' or p.pre_reserva_ate<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Pré-reserva não disponível para este setor'; end if;
  b:=b||jsonb_build_object('bloqueio','Pré-reserva — somente consulta. Aguarde a reserva comercial.','somente_consulta',true);
 elsif etapa<>p_etapa then
  b:=b||jsonb_build_object('bloqueio','Pedido na etapa '||etapa||'. Esta lista está disponível apenas para consulta.','somente_consulta',true);
 elsif p_etapa='entrega' then
  pg:=pedido_pagamento_entrega(p_pedido);
  b:=b||jsonb_build_object('pagamento',pg);
  if not (pg->>'liberada')::boolean then
   b:=b||jsonb_build_object('bloqueio',pedido_pagamento_entrega_msg(pg),'pagamento_pendente',true);
  end if;
 end if;
 return b||jsonb_build_object('fluxo_etapa',etapa);
end $function$;

-- Confirmar a entrega: o servidor confere de novo (a tela pode estar aberta há horas, ou offline).
create or replace function public.logistica_confirmacao_salvar(p_pedido uuid, p_etapa text, p_token text, p_itens jsonb, p_responsavel text, p_observacao text DEFAULT ''::text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare p separacoes_pedidos; etapa text; pg jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if not eh_membro_empresa(p.empresa_id) or auth.uid() is null then raise exception 'Sem acesso ao pedido'; end if;
 etapa:=pedido_fluxo_etapa(p);
 if etapa<>p_etapa then raise exception 'Não é possível executar esta etapa. Etapa atual: %',etapa; end if;
 if p_etapa='entrega' then
  pg:=pedido_pagamento_entrega(p_pedido);
  if not (pg->>'liberada')::boolean then raise exception '%', pedido_pagamento_entrega_msg(pg); end if;
 end if;
 return logistica_confirmacao_salvar_antes_fluxo(p_pedido,p_etapa,p_token,p_itens,p_responsavel,p_observacao);
end $function$;
notify pgrst,'reload schema';
commit;
