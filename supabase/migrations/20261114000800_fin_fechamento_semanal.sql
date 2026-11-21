-- (2026-11-14) Fechamento de parceiros: mensal OU semanal.
-- Pedido do usuário: alguns parceiros fecham por semana, não por mês. fornecedores.fechamento_mensal continua sendo
-- "cobra por fechamento" (nome antigo mantido para não mexer nos gatilhos); a periodicidade fica em fechamento_periodo.
-- Mensal usa fechamento_dia (1..31); semanal usa fechamento_dia_semana (1 = segunda ... 7 = domingo, ISO).

alter table public.fornecedores
  add column if not exists fechamento_periodo text not null default 'mensal',
  add column if not exists fechamento_dia_semana int;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fornecedores_fechamento_periodo_check') then
    alter table public.fornecedores add constraint fornecedores_fechamento_periodo_check check (fechamento_periodo in ('mensal','semanal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fornecedores_fechamento_dia_semana_check') then
    alter table public.fornecedores add constraint fornecedores_fechamento_dia_semana_check check (fechamento_dia_semana between 1 and 7);
  end if;
end $$;

comment on column public.fornecedores.fechamento_mensal is 'Cobra por fechamento (mensal ou semanal, ver fechamento_periodo).';

create or replace function public.fin_fechamento_fornecedores(p_empresa uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  perform fin_sublocacoes_sincronizar(p_empresa);
  return coalesce((select jsonb_agg(x order by x->>'nome') from (
    select jsonb_build_object('id', s.id, 'nome', coalesce(nullif(s.nome_fantasia, ''), s.nome_razao_social), 'documento', s.documento, 'fechamento_dia', s.fechamento_dia, 'logo_url', s.foto_url,
      'periodo', coalesce(s.fechamento_periodo, 'mensal'), 'dia_semana', s.fechamento_dia_semana,
      'tipo', case when s.terceirizacao then 'Sublocação' when exists (select 1 from caminhoes k where k.fornecedor_id = s.id) then 'Transporte' else 'Fornecedor' end,
      'forma_padrao', s.forma_pagamento_padrao, 'condicao_padrao', s.condicao_pagamento_padrao,
      'aguardando_valor', (select coalesce(sum(a.valor), 0) from fin_pagar a where a.fornecedor_id = s.id and a.empresa_id = p_empresa and a.aguardando_fechamento and a.status <> 'cancelado'),
      'aguardando_pedidos', (select count(distinct case when a.origem = 'compra' then a.origem_id else a.id end) from fin_pagar a where a.fornecedor_id = s.id and a.empresa_id = p_empresa and a.aguardando_fechamento and a.status <> 'cancelado'),
      'fechamentos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'referencia', f.referencia, 'status', f.status, 'created_at', f.created_at, 'nf_numero', f.nf_numero,
          'total', (select coalesce(sum(p.valor), 0) from fin_fechamento_parcelas p where p.fechamento_id = f.id),
          'aberto', (select coalesce(sum(a.aberto), 0) from fin_pagar a where a.fechamento_id = f.id and a.status <> 'cancelado' and f.status = 'unificado'))
          order by f.created_at desc) from fin_fechamentos f where f.fornecedor_id = s.id and f.empresa_id = p_empresa and f.status <> 'cancelado'), '[]'::jsonb)) x
      from fornecedores s where s.empresa_id = p_empresa and (s.fechamento_mensal or exists (select 1 from fin_fechamentos f where f.fornecedor_id = s.id and f.status <> 'cancelado'))) z), '[]'::jsonb);
end $function$;
