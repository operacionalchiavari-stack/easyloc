-- Pós-venda (15/11/2026): na aba Equipe da tela da ligação, quem está ligando marca um elogio ou um feedback negativo
-- direto para uma pessoa da equipe daquele evento (um clique; clicar de novo desfaz). Fica registrado por ligação.

create table if not exists public.posvenda_equipe_feedback (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  contato_id uuid not null references public.posvenda_contatos(id) on delete cascade,
  pedido_id uuid not null references public.separacoes_pedidos(id) on delete cascade,
  etapa_tipo text not null,
  nome text not null,
  funcionario_id uuid references public.funcionarios_acesso(id) on delete set null,
  free_id uuid references public.free_cadastros(id) on delete set null,
  tipo text not null check (tipo in ('elogio', 'negativo')),
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  unique (contato_id, pedido_id, etapa_tipo, nome)
);
create index if not exists posvenda_equipe_feedback_func on public.posvenda_equipe_feedback (empresa_id, funcionario_id);
create index if not exists posvenda_equipe_feedback_free on public.posvenda_equipe_feedback (empresa_id, free_id);
alter table public.posvenda_equipe_feedback enable row level security;
drop policy if exists ler on public.posvenda_equipe_feedback;
create policy ler on public.posvenda_equipe_feedback for select to authenticated
  using (eh_membro_empresa(empresa_id) and operacao_pode(empresa_id, 'comercial.pedidos.visualizar'));
drop policy if exists seguranca_2fa on public.posvenda_equipe_feedback;
create policy seguranca_2fa on public.posvenda_equipe_feedback as restrictive for all to authenticated
  using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));
grant select on public.posvenda_equipe_feedback to authenticated;
revoke insert, update, delete on public.posvenda_equipe_feedback from authenticated, anon;

-- p_tipo null = desfazer. A pessoa precisa estar escalada naquela etapa do pedido, e o pedido na ligação.
create or replace function public.posvenda_equipe_marcar(p_empresa uuid, p_contato uuid, p_pedido uuid, p_etapa text, p_nome text, p_tipo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pe record;
begin
  if not operacao_pode(p_empresa, 'comercial.pedidos.visualizar') then raise exception 'Sem permissão.'; end if;
  if not exists (select 1 from posvenda_contato_pedidos cp join posvenda_contatos c on c.id = cp.contato_id
                  where cp.contato_id = p_contato and cp.pedido_id = p_pedido and c.empresa_id = p_empresa) then
    raise exception 'Pedido não pertence a esta ligação.';
  end if;
  select x.funcionario_id, x.free_id, x.nome into pe from operacao_etapas e join operacao_etapa_pessoas x on x.etapa_id = e.id
   where e.pedido_id = p_pedido and e.tipo = p_etapa and x.nome = p_nome limit 1;
  if pe.nome is null then raise exception 'Esta pessoa não está na equipe desta etapa.'; end if;
  if p_tipo is null then
    delete from posvenda_equipe_feedback where contato_id = p_contato and pedido_id = p_pedido and etapa_tipo = p_etapa and nome = p_nome;
  elsif p_tipo in ('elogio', 'negativo') then
    insert into posvenda_equipe_feedback (empresa_id, contato_id, pedido_id, etapa_tipo, nome, funcionario_id, free_id, tipo, criado_por_nome)
    values (p_empresa, p_contato, p_pedido, p_etapa, p_nome, pe.funcionario_id, pe.free_id, p_tipo, logistica_nome_usuario(p_empresa))
    on conflict (contato_id, pedido_id, etapa_tipo, nome) do update set tipo = excluded.tipo, criado_em = now(), criado_por = auth.uid(), criado_por_nome = excluded.criado_por_nome;
  else
    raise exception 'Tipo inválido.';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('pedido_id', f.pedido_id, 'etapa', f.etapa_tipo, 'nome', f.nome, 'tipo', f.tipo))
                     from posvenda_equipe_feedback f where f.contato_id = p_contato), '[]');
end $$;
revoke all on function public.posvenda_equipe_marcar(uuid, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.posvenda_equipe_marcar(uuid, uuid, uuid, text, text, text) to authenticated;
notify pgrst, 'reload schema';
