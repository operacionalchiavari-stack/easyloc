-- Contas fixas com previsão (nov/2026, igual à Tecnoweld): no Plano de contas, cada categoria de saída fixa pode ter o
-- valor previsto e o dia do pagamento (todo mês, a cada 3 meses ou uma vez por ano). A previsão entra no fluxo de caixa
-- como saída do dia, mesmo antes de a conta chegar. No mês, o que for lançado de verdade na categoria (ou nas filhas)
-- abate a previsão: só sobra a diferença (lançou tudo = a previsão some). É só previsão: não cria conta a pagar.
alter table public.fin_categorias
  add column if not exists previsao_valor numeric(15,2),
  add column if not exists previsao_dia smallint,
  add column if not exists previsao_periodicidade text not null default 'mensal',
  add column if not exists previsao_mes smallint;
do $$ begin
  alter table public.fin_categorias add constraint fin_categorias_prev_valor_check check (previsao_valor is null or previsao_valor > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.fin_categorias add constraint fin_categorias_prev_dia_check check (previsao_dia is null or previsao_dia between 1 and 31);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.fin_categorias add constraint fin_categorias_prev_period_check check (previsao_periodicidade in ('mensal','trimestral','anual'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.fin_categorias add constraint fin_categorias_prev_mes_check check (previsao_mes is null or previsao_mes between 1 and 12);
exception when duplicate_object then null; end $$;

create or replace function public.fin_brl_txt(v numeric) returns text language sql immutable as
$$ select 'R$ ' || translate(to_char(coalesce(v,0), 'FM999,999,990.00'), ',.', '.,') $$;

-- Saídas previstas das contas fixas entre p_ini e p_fim (só de hoje em diante).
create or replace function public.fin_contas_fixas_previstas(p_empresa uuid, p_ini date, p_fim date)
returns table(dia date, valor numeric, titulo text, detalhe text, categoria_id uuid, previsto numeric, lancado numeric)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; c record; m date; v_venc date; v_lanc numeric; v_rest numeric;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  for c in select fc.* from fin_categorias fc
            where fc.empresa_id = p_empresa and fc.ativo and fc.tipo = 'saida'
              and coalesce(fc.previsao_valor, 0) > 0 and fc.previsao_dia is not null loop
    m := date_trunc('month', greatest(p_ini, v_hoje))::date;
    while m <= p_fim loop
      v_venc := make_date(extract(year from m)::int, extract(month from m)::int,
                          least(c.previsao_dia::int, extract(day from (m + interval '1 month' - interval '1 day'))::int));
      if v_venc >= v_hoje and v_venc between p_ini and p_fim
         and (coalesce(c.previsao_periodicidade, 'mensal') = 'mensal'
              or (c.previsao_periodicidade = 'anual' and extract(month from m)::int = coalesce(c.previsao_mes, 1))
              or (c.previsao_periodicidade = 'trimestral' and mod(extract(month from m)::int - coalesce(c.previsao_mes, 1) + 12, 3) = 0)) then
        select coalesce(sum(p.valor), 0) into v_lanc from fin_pagar p
         where p.empresa_id = p_empresa and p.status <> 'cancelado'
           and (p.categoria_id = c.id or p.categoria_id in (select x.id from fin_categorias x where x.pai_id = c.id))
           and date_trunc('month', coalesce(p.competencia, p.vencimento))::date = m;
        v_rest := round(c.previsao_valor - v_lanc, 2);
        if v_rest > 0.005 then
          dia := v_venc; valor := v_rest; titulo := c.nome; categoria_id := c.id; previsto := c.previsao_valor; lancado := v_lanc;
          detalhe := (case c.previsao_periodicidade when 'anual' then 'Anual · ' when 'trimestral' then 'Trimestral · ' else 'Todo mês · ' end) ||
                     case when v_lanc > 0 then 'previsto ' || fin_brl_txt(c.previsao_valor) || ', já lançado ' || fin_brl_txt(v_lanc) else 'previsão' end;
          return next;
        end if;
      end if;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
end $$;
revoke all on function public.fin_contas_fixas_previstas(uuid,date,date) from public, anon;
grant execute on function public.fin_contas_fixas_previstas(uuid,date,date) to authenticated;

-- Fluxo de caixa: a previsão das contas fixas entra na saída prevista do dia (e no saldo previsto).
create or replace function public.fin_fluxo(p_empresa uuid, p_ini date, p_fim date, p_conta uuid default null::uuid)
 returns table(dia date, previsto_entrada numeric, previsto_saida numeric, realizado_entrada numeric, realizado_saida numeric, saldo_previsto numeric, saldo_realizado numeric, vencido_receber numeric, vencido_pagar numeric)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_base numeric; v_antes numeric; v_vr numeric; v_vp numeric; v_fixas_antes numeric := 0 /* o que sai menos o que entra entre hoje e p_ini */; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select coalesce(sum(saldo_inicial),0) into v_base from fin_contas where empresa_id = p_empresa and ativo and (p_conta is null or id = p_conta);
  select coalesce(sum(case when m.direcao = 'entrada' then m.valor else -m.valor end),0) into v_antes
    from fin_movimentos m join fin_contas c on c.id = m.conta_id
   where m.empresa_id = p_empresa and m.cancelado_em is null and m.data >= c.saldo_inicial_data and m.data < p_ini and (p_conta is null or m.conta_id = p_conta);
  select coalesce(sum(aberto),0) into v_vr from fin_receber where empresa_id = p_empresa and status in ('aberto','parcial') and coalesce(programado_para, vencimento) < current_date and (p_conta is null or conta_id = p_conta);
  select coalesce(sum(aberto),0) into v_vp from fin_pagar where empresa_id = p_empresa and status not in ('pago','cancelado') and coalesce(programado_para, vencimento) < current_date and (p_conta is null or conta_id = p_conta);
  -- mês que começa no futuro: o saldo previsto já soma o que vence entre hoje e o início do período
  -- (a receber − a pagar − contas fixas previstas); antes só entravam os movimentos já realizados.
  if p_ini > v_hoje then
    select coalesce((select sum(aberto) from fin_pagar where empresa_id = p_empresa and status not in ('pago','cancelado') and coalesce(programado_para, vencimento) >= v_hoje and coalesce(programado_para, vencimento) < p_ini and (p_conta is null or conta_id = p_conta)),0)
         - coalesce((select sum(aberto) from fin_receber where empresa_id = p_empresa and status in ('aberto','parcial') and coalesce(programado_para, vencimento) >= v_hoje and coalesce(programado_para, vencimento) < p_ini and (p_conta is null or conta_id = p_conta)),0)
         + case when p_conta is null then coalesce((select sum(f.valor) from fin_contas_fixas_previstas(p_empresa, v_hoje, p_ini - 1) f),0) else 0 end
      into v_fixas_antes;
  end if;
  return query
  with dias as (select generate_series(p_ini, p_fim, '1 day')::date d),
  fx as (select f.dia, sum(f.valor) v from fin_contas_fixas_previstas(p_empresa, p_ini, p_fim) f where p_conta is null group by f.dia),
  t as (select d.d,
    case when d.d < current_date then 0 else coalesce((select sum(aberto) from fin_receber where empresa_id = p_empresa and status in ('aberto','parcial') and coalesce(programado_para, vencimento) = d.d and (p_conta is null or conta_id = p_conta)),0) end pe,
    case when d.d < current_date then 0 else coalesce((select sum(aberto) from fin_pagar where empresa_id = p_empresa and status not in ('pago','cancelado') and coalesce(programado_para, vencimento) = d.d and (p_conta is null or conta_id = p_conta)),0)
                                          + coalesce((select fx.v from fx where fx.dia = d.d),0) end ps,
    coalesce((select sum(valor) from fin_movimentos where empresa_id = p_empresa and cancelado_em is null and direcao = 'entrada' and data = d.d and (p_conta is null or conta_id = p_conta)),0) re,
    coalesce((select sum(valor) from fin_movimentos where empresa_id = p_empresa and cancelado_em is null and direcao = 'saida' and data = d.d and (p_conta is null or conta_id = p_conta)),0) rs
    from dias d)
  select t.d, t.pe, t.ps, t.re, t.rs,
         v_base + v_antes - v_fixas_antes + sum(t.re - t.rs + t.pe - t.ps) over (order by t.d),
         v_base + v_antes + sum(t.re - t.rs) over (order by t.d),
         v_vr, v_vp
    from t order by t.d;
end $function$;
