-- Comercial (30/out/2026):
--  1) Motivos de cancelamento do pedido cadastrados em Parâmetros > Comercial (antes fixos no HTML do pedido).
--  2) BV do cliente com a explicação: por que recebe, quem negociou e quem aprovou.
--  3) Contas a receber dentro do Comercial, sem precisar de acesso ao Financeiro (só leitura, sem dados bancários).

-- 1) motivos de cancelamento -----------------------------------------------------------------------------------------
create table if not exists public.comercial_motivos_cancelamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 3 and 80),
  descricao text check (descricao is null or length(descricao) <= 160),
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);
create unique index if not exists comercial_motivos_cancelamento_nome on public.comercial_motivos_cancelamento (empresa_id, lower(trim(nome)));
alter table public.comercial_motivos_cancelamento enable row level security;
drop policy if exists cmc_ler on public.comercial_motivos_cancelamento;
create policy cmc_ler on public.comercial_motivos_cancelamento for select to authenticated using (public.eh_membro_empresa(empresa_id));
drop policy if exists cmc_gravar on public.comercial_motivos_cancelamento;
create policy cmc_gravar on public.comercial_motivos_cancelamento for all to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'configuracoes.empresa.editar'))
  with check (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'configuracoes.empresa.editar'));
drop policy if exists seguranca_2fa on public.comercial_motivos_cancelamento;
create policy seguranca_2fa on public.comercial_motivos_cancelamento as restrictive for all to authenticated
  using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));
grant select, insert, update, delete on public.comercial_motivos_cancelamento to authenticated;

-- os mesmos motivos que estavam fixos na tela, para cada empresa
insert into public.comercial_motivos_cancelamento (empresa_id, nome, descricao, ordem)
select e.id, m.nome, m.descricao, m.ordem
  from public.empresas e
  cross join (values
    ('Evento remarcado', 'Cliente mudou a data ou adiou o evento.', 1),
    ('Concorrência mais barata', 'Cliente fechou por preço menor.', 2),
    ('Cliente desistiu', 'Evento ou contratação não vai acontecer.', 3),
    ('Sem retorno', 'Cliente não respondeu após o follow-up.', 4),
    ('Falta de disponibilidade', 'Itens, data ou equipe indisponíveis.', 5),
    ('Outro motivo', 'Detalhar na observação.', 99)) m(nome, descricao, ordem)
 where not exists (select 1 from public.comercial_motivos_cancelamento x where x.empresa_id = e.id);

-- 2) BV com explicação -----------------------------------------------------------------------------------------------
alter table public.clientes_empresas add column if not exists bv_observacao text;
alter table public.clientes_empresas add column if not exists bv_negociado_por text;
alter table public.clientes_empresas add column if not exists bv_aprovado_por text;

-- 3) contas a receber para o Comercial -------------------------------------------------------------------------------
-- Só leitura: parcelas, valores, situação e quando foi recebido. Nada de conta bancária, PIX ou CNPJ da conta.
create or replace function public.comercial_contas_receber(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.eh_membro_empresa(p_empresa) or not (public.operacao_pode(p_empresa, 'comercial.pedidos.visualizar') or public.operacao_pode(p_empresa, 'financeiro.fluxo.visualizar')) then
    raise exception 'Sem permissão';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.vencimento, x.numero_pedido), '[]') into r from (
    select t.id, t.pedido_id, coalesce(p.numero_pedido, t.pedido_numero) numero_pedido, coalesce(p.cliente_id, t.cliente_id) cliente_id,
           coalesce(nullif(p.cliente_nome, ''), t.cliente_nome) cliente_nome, p.tipo_evento, p.data_evento, p.data_evento_fim, p.local_nome,
           p.status_comercial, t.descricao, t.componente, t.parcela, t.parcelas, t.vencimento, t.valor, t.recebido, t.aberto, t.status,
           (select max(b.data) from fin_baixas b where b.receber_id = t.id and b.estornado_em is null) recebido_em
      from fin_receber t
      left join separacoes_pedidos p on p.id = t.pedido_id
     where t.empresa_id = p_empresa and t.status <> 'cancelado') x;
  return r;
end $$;
revoke all on function public.comercial_contas_receber(uuid) from public, anon;
grant execute on function public.comercial_contas_receber(uuid) to authenticated;
