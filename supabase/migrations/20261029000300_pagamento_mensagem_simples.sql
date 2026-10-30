-- Mensagem da trava de pagamento sem porcentagem nem valores (out/2026, pedido do usuário):
-- "Aguardando aprovação do Financeiro. Avise o supervisor." — na Triagem e no Carregamento.
begin;
create or replace function public.pedido_pagamento_situacao(p_pedido uuid, p_etapa text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare p public.separacoes_pedidos; f public.empresa_financeiro; total numeric; pago numeric; exigido numeric; perc numeric; trava boolean; falta numeric;
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido;
  if auth.uid() is not null and not public.eh_membro_empresa(p.empresa_id) then raise exception 'Sem acesso ao pedido'; end if;
  select * into f from public.empresa_financeiro where empresa_id=p.empresa_id;
  select coalesce(sum(r.valor),0), coalesce(sum(r.valor-r.aberto),0) into total, pago
    from public.fin_receber r where r.pedido_id=p.id and r.status<>'cancelado';
  if total=0 then total:=coalesce(p.valor_total,0); end if;
  perc:=case when total>0 then round(pago*100/total,2) else 100 end;
  exigido:=coalesce(f.pagamento_percent,100);
  falta:=greatest(round(total*exigido/100-pago,2),0);
  trava:=coalesce(f.pagamento_exige,false) and coalesce(f.pagamento_trava_etapa,'carregamento')=p_etapa and total>0 and falta>0.005;
  return jsonb_build_object('etapa_trava',coalesce(f.pagamento_trava_etapa,'carregamento'),'exige',coalesce(f.pagamento_exige,false),
    'percentual_exigido',exigido,'total',total,'pago',pago,'percentual_pago',perc,'falta',falta,'liberada',not trava,
    'mensagem',case when trava then 'Aguardando aprovação do Financeiro. Avise o supervisor.' end);
end $fn$;
notify pgrst,'reload schema';
commit;
