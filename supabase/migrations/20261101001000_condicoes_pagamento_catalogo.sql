-- Condições de pagamento do catálogo (01/11/2026, pedido do usuário).
-- Em Parâmetros > Comercial a equipe cadastra as condições permitidas (ex.: 50% de entrada + 2 parcelas,
-- quitado até 5 dias antes do evento). O decorador escolhe uma ao enviar o pedido pelo catálogo; ela fica em
-- projetos.dados.pagamento e o Comercial aplica (ou ajusta) no Financeiro do pedido ao abrir pela aba "Catálogo".
create table if not exists public.comercial_condicoes_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 3 and 80),
  entrada_pct numeric not null default 0 check (entrada_pct between 0 and 100),
  parcelas integer not null default 1 check (parcelas between 0 and 24),
  quitar_dias_antes integer check (quitar_dias_antes is null or quitar_dias_antes between 0 and 365),
  forma text not null default 'PIX' check (forma in ('PIX','Boleto','Cartao','Transferencia','Dinheiro')),
  observacao text check (observacao is null or length(observacao) <= 200),
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  check (entrada_pct = 100 or parcelas >= 1)
);
create unique index if not exists comercial_condicoes_pagamento_nome on public.comercial_condicoes_pagamento (empresa_id, lower(trim(nome)));
alter table public.comercial_condicoes_pagamento enable row level security;
drop policy if exists ccp_ler on public.comercial_condicoes_pagamento;
create policy ccp_ler on public.comercial_condicoes_pagamento for select to authenticated using (public.eh_membro_empresa(empresa_id));
drop policy if exists ccp_gravar on public.comercial_condicoes_pagamento;
create policy ccp_gravar on public.comercial_condicoes_pagamento for all to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'configuracoes.empresa.editar'))
  with check (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'configuracoes.empresa.editar'));
drop policy if exists seguranca_2fa on public.comercial_condicoes_pagamento;
create policy seguranca_2fa on public.comercial_condicoes_pagamento as restrictive for all to authenticated
  using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));
grant select, insert, update, delete on public.comercial_condicoes_pagamento to authenticated;

-- Lista para o catálogo: decorador (token) ou equipe (login). Só as ativas.
create or replace function public.catalogo_condicoes_pagamento(p_token text default null, p_empresa_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c jsonb := public.projeto_ctx(p_token, p_empresa_id);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'entrada_pct', x.entrada_pct, 'parcelas', x.parcelas,
      'quitar_dias_antes', x.quitar_dias_antes, 'forma', x.forma, 'observacao', x.observacao) order by x.ordem, x.nome)
    from comercial_condicoes_pagamento x where x.empresa_id = (c->>'empresa_id')::uuid and x.ativo), '[]'::jsonb);
end $$;
revoke all on function public.catalogo_condicoes_pagamento(text, uuid) from public;
grant execute on function public.catalogo_condicoes_pagamento(text, uuid) to anon, authenticated;

-- Três condições de partida (podem ser editadas ou desativadas em Parâmetros).
insert into public.comercial_condicoes_pagamento (empresa_id, nome, entrada_pct, parcelas, quitar_dias_antes, forma, ordem)
select e.id, v.nome, v.entrada, v.parcelas, v.quitar, 'PIX', v.ordem
from public.empresas e cross join (values
  ('À vista no fechamento', 100, 0, null::int, 1),
  ('50% de entrada + saldo até o evento', 50, 1, 5, 2),
  ('30% de entrada + 2 parcelas', 30, 2, 5, 3)) v(nome, entrada, parcelas, quitar, ordem)
on conflict do nothing;

notify pgrst, 'reload schema';
