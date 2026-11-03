begin;
alter table public.empresa_financeiro add column if not exists producao_pagamento_exige boolean not null default false;
alter table public.empresa_financeiro add column if not exists producao_pagamento_percent integer not null default 100 check(producao_pagamento_percent between 1 and 100);
create or replace function public.pedido_pagamento_situacao(p_pedido uuid, p_etapa text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare p public.separacoes_pedidos; f public.empresa_financeiro; total numeric; pago numeric; exigido numeric; perc numeric; trava boolean; falta numeric; exige boolean; etapa text;
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido;
  if auth.uid() is not null and not public.eh_membro_empresa(p.empresa_id) then raise exception 'Sem acesso ao pedido'; end if;
  select * into f from public.empresa_financeiro where empresa_id=p.empresa_id;
  select coalesce(sum(r.valor),0), coalesce(sum(r.valor-r.aberto),0) into total, pago
    from public.fin_receber r where r.pedido_id=p.id and r.status<>'cancelado';
  if total=0 then total:=coalesce(p.valor_total,0); end if;
  perc:=case when total>0 then round(pago*100/total,2) else 100 end;
  etapa:=case when p_etapa='producao' then 'producao' else coalesce(f.pagamento_trava_etapa,'carregamento') end;
  exige:=case when p_etapa='producao' then coalesce(f.producao_pagamento_exige,false) else coalesce(f.pagamento_exige,false) end;
  exigido:=case when p_etapa='producao' then coalesce(f.producao_pagamento_percent,100) else coalesce(f.pagamento_percent,100) end;
  falta:=greatest(round(total*exigido/100-pago,2),0);
  trava:=exige and etapa=p_etapa and total>0 and falta>0.005;
  return jsonb_build_object('etapa_trava',etapa,'exige',exige,
    'percentual_exigido',exigido,'total',total,'pago',pago,'percentual_pago',perc,'falta',falta,'liberada',not trava,
    'mensagem',case when trava then 'Aguardando aprovação do Financeiro. Avise o supervisor.' end);
end $fn$;

create or replace function public.producao_validar_financeiro() returns trigger
language plpgsql security definer set search_path=public as $$
declare pedido uuid;
begin
 if (new.estado='execucao' and (tg_op='INSERT' or old.estado is distinct from new.estado))
    or (coalesce(new.quantidade_feita,0)>coalesce(old.quantidade_feita,0)) then
  select pedido_id into strict pedido from producao_itens where id=new.producao_item_id;
  perform pedido_pagamento_conferir(pedido,'producao');
 end if;
 return new;
end $$;
revoke all on function public.producao_validar_financeiro() from public,anon,authenticated;
drop trigger if exists producao_bloqueio_financeiro on public.producao_etapas;
create trigger producao_bloqueio_financeiro before insert or update of estado,quantidade_feita on public.producao_etapas
 for each row execute function public.producao_validar_financeiro();
do $$ declare d text; novo text;
begin
 select pg_get_functiondef('public.producao_quadro(uuid)'::regprocedure) into d;
 if position('pedido_pagamento_situacao' in d)=0 then
  novo:=replace(d,'''pedido'',jsonb_build_object', '''pagamento'',public.pedido_pagamento_situacao(t.pedido_id,''producao''),''pedido'',jsonb_build_object');
  if novo=d then raise exception 'Formato do quadro de producao inesperado'; end if;
  execute novo;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
