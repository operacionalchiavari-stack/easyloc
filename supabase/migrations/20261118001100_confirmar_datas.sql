-- Confirmar datas com o decorador (18/11/2026): N dias antes da entrega (Parâmetros > Comercial, padrão 10), o pedido
-- aparece na aba "Confirmar datas" da Central de Pedidos até alguém registrar que confirmou entrega, evento e coleta.
-- A confirmação guarda as datas confirmadas: se o pedido mudar de data depois, volta a pedir confirmação.
create table if not exists public.comercial_confirmacoes_datas (
  pedido_id uuid primary key references public.separacoes_pedidos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  data_entrega date, data_evento date, data_coleta date,
  observacao text,
  confirmado_por uuid, confirmado_por_nome text,
  confirmado_em timestamptz not null default now()
);
alter table public.comercial_confirmacoes_datas enable row level security;
revoke all on public.comercial_confirmacoes_datas from anon, authenticated;
grant select on public.comercial_confirmacoes_datas to authenticated;
drop policy if exists ler on public.comercial_confirmacoes_datas;
create policy ler on public.comercial_confirmacoes_datas for select to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'comercial.pedidos.visualizar'));
drop policy if exists seguranca_2fa on public.comercial_confirmacoes_datas;
create policy seguranca_2fa on public.comercial_confirmacoes_datas as restrictive for all to authenticated
  using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));

create or replace function public.comercial_confirmar_datas_dias(p_empresa uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (config->>'dias_confirmar_datas')::int from comercial_prod_config where empresa_id = p_empresa), 10)
$$;

create or replace function public.comercial_confirmar_datas_lista(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok()
     or not operacao_pode(p_empresa, 'comercial.pedidos.visualizar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return jsonb_build_object('dias', comercial_confirmar_datas_dias(p_empresa),
    'confirmados', coalesce((select jsonb_agg(jsonb_build_object('pedido_id', pedido_id, 'entrega', data_entrega, 'evento', data_evento,
        'coleta', data_coleta, 'observacao', observacao, 'por', confirmado_por_nome, 'em', confirmado_em))
      from comercial_confirmacoes_datas where empresa_id = p_empresa), '[]'::jsonb));
end $$;

create or replace function public.comercial_confirmar_datas_registrar(p_empresa uuid, p_pedido uuid, p_observacao text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p separacoes_pedidos;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok()
     or not operacao_pode(p_empresa, 'comercial.pedidos.editar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into p from separacoes_pedidos where id = p_pedido and empresa_id = p_empresa;
  if p.id is null then raise exception 'Pedido não encontrado'; end if;
  if length(coalesce(p_observacao, '')) > 1000 then raise exception 'Observação: até 1000 caracteres'; end if;
  insert into comercial_confirmacoes_datas(pedido_id, empresa_id, data_entrega, data_evento, data_coleta, observacao, confirmado_por, confirmado_por_nome, confirmado_em)
  values (p.id, p_empresa, p.data_entrega, p.data_evento, p.data_coleta, nullif(btrim(p_observacao), ''), auth.uid(), comercial_followup_nome(), now())
  on conflict (pedido_id) do update set data_entrega = excluded.data_entrega, data_evento = excluded.data_evento, data_coleta = excluded.data_coleta,
    observacao = excluded.observacao, confirmado_por = excluded.confirmado_por, confirmado_por_nome = excluded.confirmado_por_nome, confirmado_em = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.comercial_confirmar_datas_dias_salvar(p_empresa uuid, p_dias int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok()
     or not operacao_pode(p_empresa, 'configuracoes.empresa.editar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 90 then raise exception 'Dias de antecedência: de 1 a 90'; end if;
  insert into comercial_prod_config(empresa_id) values (p_empresa) on conflict do nothing;
  update comercial_prod_config set config = config || jsonb_build_object('dias_confirmar_datas', p_dias) where empresa_id = p_empresa;
end $$;

revoke all on function public.comercial_confirmar_datas_dias(uuid) from public, anon, authenticated;
revoke all on function public.comercial_confirmar_datas_lista(uuid), public.comercial_confirmar_datas_registrar(uuid, uuid, text),
  public.comercial_confirmar_datas_dias_salvar(uuid, int) from public, anon;
grant execute on function public.comercial_confirmar_datas_lista(uuid), public.comercial_confirmar_datas_registrar(uuid, uuid, text),
  public.comercial_confirmar_datas_dias_salvar(uuid, int) to authenticated;
notify pgrst, 'reload schema';
