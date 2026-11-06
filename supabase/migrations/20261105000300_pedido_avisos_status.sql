-- Aviso no documento do pedido conforme a situação (nov/2026): azul em Orçamento ("não reserva os móveis") e amarelo em
-- Pré-reserva ("reservado até {data}"). As frases ficam em Parâmetros > Comercial; sem nada salvo valem as padrão.
-- O link do pedido (cliente, sem login) recebe as frases dentro de pagamento_link_pedido.

create table if not exists public.comercial_avisos_pedido (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  orcamento text,
  pre_reserva text,
  atualizado_em timestamptz not null default now()
);
alter table public.comercial_avisos_pedido enable row level security;
revoke all on public.comercial_avisos_pedido from anon, authenticated;
grant select on public.comercial_avisos_pedido to authenticated;
drop policy if exists ler on public.comercial_avisos_pedido;
create policy ler on public.comercial_avisos_pedido for select to authenticated using (public.eh_membro_empresa(empresa_id));
drop policy if exists seguranca_2fa on public.comercial_avisos_pedido;
create policy seguranca_2fa on public.comercial_avisos_pedido as restrictive for all to authenticated
  using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));

create or replace function public.comercial_avisos_pedido_textos(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'orcamento', coalesce(nullif(btrim(a.orcamento), ''), 'Este documento é um orçamento. Os móveis ainda não estão reservados: a disponibilidade só fica garantida quando o pedido for confirmado.'),
    'pre_reserva', coalesce(nullif(btrim(a.pre_reserva), ''), 'Pré-reserva: os móveis estão reservados para você até {data}. Depois dessa data, se o pedido não for confirmado, a reserva é liberada.'))
  from (select 1) x left join comercial_avisos_pedido a on a.empresa_id = p_empresa
$$;

create or replace function public.comercial_avisos_pedido_ler(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return comercial_avisos_pedido_textos(p_empresa);
end $$;

create or replace function public.comercial_avisos_pedido_salvar(p_empresa uuid, p_orcamento text, p_pre_reserva text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok() or not operacao_pode(p_empresa, 'configuracoes.empresa.editar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if length(coalesce(p_orcamento, '')) > 600 or length(coalesce(p_pre_reserva, '')) > 600 then raise exception 'Cada frase pode ter até 600 caracteres'; end if;
  insert into comercial_avisos_pedido(empresa_id, orcamento, pre_reserva, atualizado_em)
  values (p_empresa, nullif(btrim(p_orcamento), ''), nullif(btrim(p_pre_reserva), ''), now())
  on conflict (empresa_id) do update set orcamento = excluded.orcamento, pre_reserva = excluded.pre_reserva, atualizado_em = now();
end $$;

-- Link do pedido: a função de sempre passa a se chamar _base e a nova acrescenta as frases.
do $$ begin
  if to_regprocedure('public.pagamento_link_pedido_base(uuid)') is null then
    alter function public.pagamento_link_pedido(uuid) rename to pagamento_link_pedido_base;
  end if;
end $$;
create or replace function public.pagamento_link_pedido(p_pedido uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; emp uuid;
begin
  r := pagamento_link_pedido_base(p_pedido);
  select empresa_id into emp from separacoes_pedidos where id = p_pedido;
  if r is null or emp is null then return r; end if;
  return r || jsonb_build_object('avisos', comercial_avisos_pedido_textos(emp));
end $$;

revoke all on function public.pagamento_link_pedido_base(uuid), public.pagamento_link_pedido(uuid), public.comercial_avisos_pedido_textos(uuid) from public, anon, authenticated;
revoke all on function public.comercial_avisos_pedido_ler(uuid), public.comercial_avisos_pedido_salvar(uuid, text, text) from public, anon;
grant execute on function public.comercial_avisos_pedido_ler(uuid), public.comercial_avisos_pedido_salvar(uuid, text, text) to authenticated;
notify pgrst, 'reload schema';
