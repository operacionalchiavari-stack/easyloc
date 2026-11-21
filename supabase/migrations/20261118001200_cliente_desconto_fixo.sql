-- Condição especial do decorador (18/11/2026): desconto fixo sobre a locação em TODO pedido (ex.: Kelly 20%).
-- Diferente do BV: não acumula — o que não for usado num pedido não passa para o próximo.
alter table public.clientes_empresas
  add column if not exists desconto_fixo_ativo boolean not null default false,
  add column if not exists desconto_fixo_percentual numeric(5,2) not null default 0,
  add column if not exists desconto_fixo_observacao text;
alter table public.clientes_empresas drop constraint if exists clientes_desconto_fixo_ok;
alter table public.clientes_empresas add constraint clientes_desconto_fixo_ok
  check (desconto_fixo_percentual >= 0 and desconto_fixo_percentual <= 100 and (not desconto_fixo_ativo or desconto_fixo_percentual > 0));
