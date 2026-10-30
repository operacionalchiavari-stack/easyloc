-- Pagamento mínimo (out/2026, substitui a trava na entrega de 20261028000900): Parâmetros > Financeiro escolhe ONDE o
-- pedido trava sem o pagamento mínimo: na Triagem (a separação não começa nem avança) ou no Carregamento (a conferência
-- do carregamento não abre, não lê peça nem conclui). A entrega nunca é travada.
begin;
alter table public.empresa_financeiro rename column entrega_exige_pagamento to pagamento_exige;
alter table public.empresa_financeiro rename column entrega_pagamento_percent to pagamento_percent;
alter table public.empresa_financeiro rename constraint empresa_financeiro_entrega_pagamento_percent_check to empresa_financeiro_pagamento_percent_check;
alter table public.empresa_financeiro add column if not exists pagamento_trava_etapa text not null default 'carregamento';
alter table public.empresa_financeiro drop constraint if exists empresa_financeiro_pagamento_trava_etapa_check;
alter table public.empresa_financeiro add constraint empresa_financeiro_pagamento_trava_etapa_check check (pagamento_trava_etapa in ('triagem','carregamento'));

-- Entrega volta a ser como antes (sem trava de pagamento).
create or replace function public.logistica_confirmacao_base(p_pedido uuid, p_etapa text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare p separacoes_pedidos; b jsonb; etapa text; pre boolean;
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
 end if;
 return b||jsonb_build_object('fluxo_etapa',etapa);
end $function$;
create or replace function public.logistica_confirmacao_salvar(p_pedido uuid, p_etapa text, p_token text, p_itens jsonb, p_responsavel text, p_observacao text DEFAULT ''::text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare p separacoes_pedidos; etapa text;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if not eh_membro_empresa(p.empresa_id) or auth.uid() is null then raise exception 'Sem acesso ao pedido'; end if;
 etapa:=pedido_fluxo_etapa(p);
 if etapa<>p_etapa then raise exception 'Não é possível executar esta etapa. Etapa atual: %',etapa; end if;
 return logistica_confirmacao_salvar_antes_fluxo(p_pedido,p_etapa,p_token,p_itens,p_responsavel,p_observacao);
end $function$;
drop function if exists public.pedido_pagamento_entrega_msg(jsonb);
drop function if exists public.pedido_pagamento_entrega(uuid);

-- Situação do pagamento do pedido para uma etapa ('triagem' ou 'carregamento').
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
    'mensagem',case when trava then
      (case p_etapa when 'triagem' then 'Triagem bloqueada' else 'Carregamento bloqueado' end)||' pelo Financeiro: o pedido precisa ter '||trim_scale(exigido)
      ||'% pago. Pago: '||trim_scale(perc)||'% — falta R$ '
      ||replace(replace(replace(to_char(falta,'FM999,999,990.00'),',','#'),'.',','),'#','.')||'.' end);
end $fn$;
revoke all on function public.pedido_pagamento_situacao(uuid,text) from public, anon;
grant execute on function public.pedido_pagamento_situacao(uuid,text) to authenticated, service_role;

create or replace function public.pedido_pagamento_conferir(p_pedido uuid, p_etapa text) returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare s jsonb;
begin
  s:=public.pedido_pagamento_situacao(p_pedido,p_etapa);
  if not (s->>'liberada')::boolean then raise exception '%', s->>'mensagem'; end if;
end $fn$;
revoke all on function public.pedido_pagamento_conferir(uuid,text) from public, anon, authenticated;

-- Travas: as funções de sempre passam a conferir o pagamento antes (renomeadas para *_sem_pagamento, só uso interno).
alter function public.separacao_definir_modo(uuid,text) rename to separacao_definir_modo_sem_pagamento;
alter function public.operacao_atualizar_separacao(uuid,jsonb,numeric,jsonb,uuid) rename to operacao_atualizar_separacao_sem_pagamento;
alter function public.operacao_iniciar_conferencia(uuid,text) rename to operacao_iniciar_conferencia_sem_pagamento;
alter function public.operacao_ler_peca(uuid,text,text,text) rename to operacao_ler_peca_sem_pagamento;
alter function public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb,jsonb) rename to operacao_concluir_conferencia_sem_pagamento;
revoke all on function public.separacao_definir_modo_sem_pagamento(uuid,text) from public, anon, authenticated;
revoke all on function public.operacao_atualizar_separacao_sem_pagamento(uuid,jsonb,numeric,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.operacao_iniciar_conferencia_sem_pagamento(uuid,text) from public, anon, authenticated;
revoke all on function public.operacao_ler_peca_sem_pagamento(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.operacao_concluir_conferencia_sem_pagamento(uuid,text,boolean,jsonb,jsonb,jsonb) from public, anon, authenticated;

create function public.separacao_definir_modo(p_pedido uuid, p_modo text) returns text
language plpgsql security definer set search_path to 'public' as $fn$
begin
  perform public.pedido_pagamento_conferir(p_pedido,'triagem');
  return public.separacao_definir_modo_sem_pagamento(p_pedido,p_modo);
end $fn$;
create function public.operacao_atualizar_separacao(p_item uuid, p_dados jsonb, p_quantidade_anterior numeric, p_componentes_anteriores jsonb DEFAULT '{}'::jsonb, p_etiqueta uuid DEFAULT NULL::uuid) returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare ped uuid;
begin
  select separacao_pedido_id into ped from public.separacoes_itens where id=p_item;
  if ped is not null then perform public.pedido_pagamento_conferir(ped,'triagem'); end if;
  perform public.operacao_atualizar_separacao_sem_pagamento(p_item,p_dados,p_quantidade_anterior,p_componentes_anteriores,p_etiqueta);
end $fn$;
create function public.operacao_iniciar_conferencia(p_pedido uuid, p_etapa text) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if p_etapa='carregamento' then perform public.pedido_pagamento_conferir(p_pedido,'carregamento'); end if;
  return public.operacao_iniciar_conferencia_sem_pagamento(p_pedido,p_etapa);
end $fn$;
create function public.operacao_ler_peca(p_pedido uuid, p_etapa text, p_tipo text, p_codigo text) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if p_etapa='carregamento' then perform public.pedido_pagamento_conferir(p_pedido,'carregamento'); end if;
  return public.operacao_ler_peca_sem_pagamento(p_pedido,p_etapa,p_tipo,p_codigo);
end $fn$;
create function public.operacao_concluir_conferencia(p_pedido uuid, p_etapa text, p_aceitar_faltas boolean DEFAULT false, p_quantidades jsonb DEFAULT NULL::jsonb, p_observacoes jsonb DEFAULT NULL::jsonb, p_primeira jsonb DEFAULT NULL::jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if p_etapa='carregamento' then perform public.pedido_pagamento_conferir(p_pedido,'carregamento'); end if;
  return public.operacao_concluir_conferencia_sem_pagamento(p_pedido,p_etapa,p_aceitar_faltas,p_quantidades,p_observacoes,p_primeira);
end $fn$;
revoke all on function public.separacao_definir_modo(uuid,text) from public, anon;
revoke all on function public.operacao_atualizar_separacao(uuid,jsonb,numeric,jsonb,uuid) from public, anon;
revoke all on function public.operacao_iniciar_conferencia(uuid,text) from public, anon;
revoke all on function public.operacao_ler_peca(uuid,text,text,text) from public, anon;
revoke all on function public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.separacao_definir_modo(uuid,text) to authenticated, service_role;
grant execute on function public.operacao_atualizar_separacao(uuid,jsonb,numeric,jsonb,uuid) to authenticated, service_role;
grant execute on function public.operacao_iniciar_conferencia(uuid,text) to authenticated, service_role;
grant execute on function public.operacao_ler_peca(uuid,text,text,text) to authenticated, service_role;
grant execute on function public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb,jsonb) to authenticated, service_role;
notify pgrst,'reload schema';
commit;
