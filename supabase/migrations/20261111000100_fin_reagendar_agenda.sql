-- Agenda do dia na Visão geral do Financeiro (nov/2026, igual à da Tecnoweld): "Alterar data" de uma conta em aberto.
-- A data combinada fica em programado_para (o vencimento original não muda: nas contas a receber ele vem das parcelas do
-- pedido e seria regravado quando o pedido é salvo de novo). O fluxo de caixa passa a usar a data combinada também nas
-- contas a receber (nas a pagar já usava). Cada mudança fica na auditoria, com o motivo.
alter table public.fin_receber add column if not exists programado_para date;

create or replace function public.fin_reagendar_titulo(p_empresa uuid, p_tipo text, p_id uuid, p_data date, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare anterior jsonb; novo jsonb;
begin
  if p_tipo is null or p_tipo not in ('receber','pagar') then raise exception 'Tipo de conta inválido'; end if;
  if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa, case when p_tipo='receber' then 'financeiro.contas_receber.editar' else 'financeiro.contas_pagar.editar' end) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  if p_data is null then raise exception 'Informe a nova data'; end if;
  if length(trim(coalesce(p_motivo,''))) < 3 then raise exception 'Informe o motivo ou o combinado'; end if;
  if p_tipo='receber' then
    select to_jsonb(r) into anterior from fin_receber r where id=p_id and empresa_id=p_empresa for update;
  else
    select to_jsonb(r) into anterior from fin_pagar r where id=p_id and empresa_id=p_empresa for update;
  end if;
  if anterior is null then raise exception 'Conta não encontrada'; end if;
  if anterior->>'status' in ('recebido','pago','cancelado') or coalesce((anterior->>'aberto')::numeric,0) <= 0 then
    raise exception 'Somente contas com saldo em aberto podem ter a data alterada';
  end if;
  if p_tipo='receber' then
    update fin_receber set programado_para=p_data, updated_at=now() where id=p_id and empresa_id=p_empresa;
    select to_jsonb(r) into novo from fin_receber r where id=p_id;
  else
    update fin_pagar set programado_para=p_data, updated_at=now() where id=p_id and empresa_id=p_empresa;
    select to_jsonb(r) into novo from fin_pagar r where id=p_id;
  end if;
  perform fin_auditar(p_empresa, 'fin_'||p_tipo, p_id, 'reagendamento', anterior, novo, trim(p_motivo));
end $$;
revoke all on function public.fin_reagendar_titulo(uuid,text,uuid,date,text) from public, anon;
grant execute on function public.fin_reagendar_titulo(uuid,text,uuid,date,text) to authenticated;

create or replace function public.fin_fluxo(p_empresa uuid, p_ini date, p_fim date, p_conta uuid default null::uuid)
 returns table(dia date, previsto_entrada numeric, previsto_saida numeric, realizado_entrada numeric, realizado_saida numeric, saldo_previsto numeric, saldo_realizado numeric, vencido_receber numeric, vencido_pagar numeric)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_base numeric; v_antes numeric; v_vr numeric; v_vp numeric;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select coalesce(sum(saldo_inicial),0) into v_base from fin_contas where empresa_id = p_empresa and ativo and (p_conta is null or id = p_conta);
  select coalesce(sum(case when m.direcao = 'entrada' then m.valor else -m.valor end),0) into v_antes
    from fin_movimentos m join fin_contas c on c.id = m.conta_id
   where m.empresa_id = p_empresa and m.cancelado_em is null and m.data >= c.saldo_inicial_data and m.data < p_ini and (p_conta is null or m.conta_id = p_conta);
  select coalesce(sum(aberto),0) into v_vr from fin_receber where empresa_id = p_empresa and status in ('aberto','parcial') and coalesce(programado_para, vencimento) < current_date and (p_conta is null or conta_id = p_conta);
  select coalesce(sum(aberto),0) into v_vp from fin_pagar where empresa_id = p_empresa and status not in ('pago','cancelado') and coalesce(programado_para, vencimento) < current_date and (p_conta is null or conta_id = p_conta);
  return query
  with dias as (select generate_series(p_ini, p_fim, '1 day')::date d),
  t as (select d.d,
    case when d.d < current_date then 0 else coalesce((select sum(aberto) from fin_receber where empresa_id = p_empresa and status in ('aberto','parcial') and coalesce(programado_para, vencimento) = d.d and (p_conta is null or conta_id = p_conta)),0) end pe,
    case when d.d < current_date then 0 else coalesce((select sum(aberto) from fin_pagar where empresa_id = p_empresa and status not in ('pago','cancelado') and coalesce(programado_para, vencimento) = d.d and (p_conta is null or conta_id = p_conta)),0) end ps,
    coalesce((select sum(valor) from fin_movimentos where empresa_id = p_empresa and cancelado_em is null and direcao = 'entrada' and data = d.d and (p_conta is null or conta_id = p_conta)),0) re,
    coalesce((select sum(valor) from fin_movimentos where empresa_id = p_empresa and cancelado_em is null and direcao = 'saida' and data = d.d and (p_conta is null or conta_id = p_conta)),0) rs
    from dias d)
  select t.d, t.pe, t.ps, t.re, t.rs,
         v_base + v_antes + sum(t.re - t.rs + t.pe - t.ps) over (order by t.d),
         v_base + v_antes + sum(t.re - t.rs) over (order by t.d),
         v_vr, v_vp
    from t order by t.d;
end $function$;
