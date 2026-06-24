alter table public.empresa_logistica_regras
  add column if not exists separacao_dias_antes_evento integer not null default 2;

comment on column public.empresa_logistica_regras.separacao_dias_antes_evento
  is 'Quantidade de dias antes do evento em que a separacao de materiais fica liberada para iniciar.';
