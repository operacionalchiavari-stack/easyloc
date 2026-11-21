-- Contas fixas: valor previsto POR MÊS (nov/2026, pedido do usuário). Em vez de um valor fixo repetido, cada conta fixa
-- tem 12 valores (janeiro a dezembro, repetindo todo ano) e o dia do pagamento. Mês sem valor (0 ou vazio) = sem
-- previsão naquele mês. O resto não muda: o que for lançado de verdade na categoria no mês abate a previsão.
-- previsao_valor / previsao_periodicidade / previsao_mes ficam no banco sem uso (nenhuma categoria tinha previsão ainda).
alter table public.fin_categorias add column if not exists previsao_meses numeric(15,2)[];
do $$ begin
  alter table public.fin_categorias add constraint fin_categorias_prev_meses_check
    check (previsao_meses is null or (array_length(previsao_meses, 1) = 12 and 0 <= all (previsao_meses)));
exception when duplicate_object then null; end $$;

create or replace function public.fin_contas_fixas_previstas(p_empresa uuid, p_ini date, p_fim date)
returns table(dia date, valor numeric, titulo text, detalhe text, categoria_id uuid, previsto numeric, lancado numeric)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; c record; m date; v_venc date; v_prev numeric; v_lanc numeric; v_rest numeric;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  for c in select fc.* from fin_categorias fc
            where fc.empresa_id = p_empresa and fc.ativo and fc.tipo = 'saida'
              and fc.previsao_meses is not null and fc.previsao_dia is not null loop
    m := date_trunc('month', greatest(p_ini, v_hoje))::date;
    while m <= p_fim loop
      v_prev := coalesce(c.previsao_meses[extract(month from m)::int], 0);
      v_venc := make_date(extract(year from m)::int, extract(month from m)::int,
                          least(c.previsao_dia::int, extract(day from (m + interval '1 month' - interval '1 day'))::int));
      if v_prev > 0 and v_venc >= v_hoje and v_venc between p_ini and p_fim then
        select coalesce(sum(p.valor), 0) into v_lanc from fin_pagar p
         where p.empresa_id = p_empresa and p.status <> 'cancelado'
           and (p.categoria_id = c.id or p.categoria_id in (select x.id from fin_categorias x where x.pai_id = c.id))
           and date_trunc('month', coalesce(p.competencia, p.vencimento))::date = m;
        v_rest := round(v_prev - v_lanc, 2);
        if v_rest > 0.005 then
          dia := v_venc; valor := v_rest; titulo := c.nome; categoria_id := c.id; previsto := v_prev; lancado := v_lanc;
          detalhe := case when v_lanc > 0 then 'Previsto ' || fin_brl_txt(v_prev) || ', já lançado ' || fin_brl_txt(v_lanc) else 'Previsão do mês' end;
          return next;
        end if;
      end if;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
end $$;
revoke all on function public.fin_contas_fixas_previstas(uuid,date,date) from public, anon;
grant execute on function public.fin_contas_fixas_previstas(uuid,date,date) to authenticated;
