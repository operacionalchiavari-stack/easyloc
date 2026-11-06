-- Acompanhamento simples de orçamentos, pré-reservas e pedidos do catálogo (nov/2026).
-- "Orçamento enviado" é automático (data do pedido / envio do projeto); o próximo contato nasce N dias depois
-- (Parâmetros > Comercial). Cada acompanhamento registrado guarda o motivo de não estar fechando (lista de
-- Parâmetros) e a próxima data. "Cliente decidiu não fechar" cancela o pedido (ou encerra o projeto do catálogo).

create table if not exists public.comercial_followups (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  alvo_tipo text not null check (alvo_tipo in ('pedido','projeto')),
  alvo_id uuid not null,
  motivo text not null,
  observacao text,
  proximo date,
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists comercial_followups_alvo on public.comercial_followups(empresa_id, alvo_tipo, alvo_id, criado_em);

create table if not exists public.comercial_followup_encerrados (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  alvo_tipo text not null check (alvo_tipo in ('pedido','projeto')),
  alvo_id uuid not null,
  motivo text not null,
  observacao text,
  por uuid default auth.uid(),
  por_nome text,
  em timestamptz not null default now(),
  primary key (empresa_id, alvo_tipo, alvo_id)
);

do $$ declare t text; begin
  foreach t in array array['comercial_followups','comercial_followup_encerrados'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists ler on public.%I', t);
    execute format('create policy ler on public.%I for select to authenticated using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, ''comercial.pedidos.visualizar''))', t);
    execute format('drop policy if exists seguranca_2fa on public.%I', t);
    execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()))', t);
  end loop;
end $$;

-- Configuração: dentro de comercial_prod_config.config (chaves dias_proximo_contato e motivos_nao_fechamento).
create or replace function public.comercial_followup_cfg(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c jsonb;
begin
  select config into c from comercial_prod_config where empresa_id = p_empresa;
  return jsonb_build_object(
    'dias', coalesce((c->>'dias_proximo_contato')::int, 3),
    'motivos', coalesce(c->'motivos_nao_fechamento', '["Aguardando o cliente final decidir","Achou o valor alto","Reunião para decidir","Solicitou ajustes no orçamento","Sem resposta do cliente"]'::jsonb)
  );
end $$;

create or replace function public.comercial_followup_nome() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select f.nome from funcionarios_acesso f where f.id = auth.uid() limit 1),
    (select u.nome from usuarios u where u.id = auth.uid() limit 1),
    (select email from auth.users where id = auth.uid()),
    'Equipe')
$$;

create or replace function public.comercial_followup_lista(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok()
     or not operacao_pode(p_empresa, 'comercial.pedidos.visualizar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'config', comercial_followup_cfg(p_empresa),
    'acompanhamentos', coalesce((select jsonb_agg(jsonb_build_object('alvo_tipo', alvo_tipo, 'alvo_id', alvo_id, 'motivo', motivo,
        'observacao', observacao, 'proximo', proximo, 'por', criado_por_nome, 'em', criado_em) order by criado_em)
      from comercial_followups where empresa_id = p_empresa), '[]'::jsonb),
    'encerrados', coalesce((select jsonb_agg(jsonb_build_object('alvo_tipo', alvo_tipo, 'alvo_id', alvo_id, 'motivo', motivo, 'por', por_nome, 'em', em))
      from comercial_followup_encerrados where empresa_id = p_empresa), '[]'::jsonb)
  );
end $$;

create or replace function public.comercial_followup_alvo_ok(p_empresa uuid, p_tipo text, p_alvo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_tipo
    when 'pedido' then exists(select 1 from separacoes_pedidos where id = p_alvo and empresa_id = p_empresa and status_comercial in ('orcamento','pre_reserva'))
    when 'projeto' then exists(select 1 from projetos where id = p_alvo and empresa_id = p_empresa and cliente_id is not null and status in ('pedido_enviado','em_analise'))
    else false end
  and not exists(select 1 from comercial_followup_encerrados where empresa_id = p_empresa and alvo_tipo = p_tipo and alvo_id = p_alvo)
$$;

create or replace function public.comercial_followup_registrar(p_empresa uuid, p_tipo text, p_alvo uuid, p_motivo text, p_proximo date, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cfg jsonb;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok()
     or not operacao_pode(p_empresa, 'comercial.pedidos.editar') then
    raise exception 'Sem permissão para registrar acompanhamentos' using errcode = '42501';
  end if;
  if not comercial_followup_alvo_ok(p_empresa, p_tipo, p_alvo) then raise exception 'Este pedido não está mais em negociação'; end if;
  cfg := comercial_followup_cfg(p_empresa);
  if not (cfg->'motivos') ? coalesce(p_motivo, '') then raise exception 'Escolha um motivo da lista'; end if;
  if p_proximo is null or p_proximo < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe a próxima data de contato (hoje ou depois)'; end if;
  if length(coalesce(p_observacao, '')) > 2000 then raise exception 'Observação muito longa'; end if;
  insert into comercial_followups(empresa_id, alvo_tipo, alvo_id, motivo, observacao, proximo, criado_por_nome)
  values (p_empresa, p_tipo, p_alvo, p_motivo, nullif(btrim(coalesce(p_observacao, '')), ''), p_proximo, comercial_followup_nome());
end $$;

create or replace function public.comercial_followup_nao_fechou(p_empresa uuid, p_tipo text, p_alvo uuid, p_motivo text, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cfg jsonb; nome text;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok()
     or not (operacao_pode(p_empresa, 'comercial.pedidos.editar') or operacao_pode(p_empresa, 'comercial.pedidos.cancelar')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if not comercial_followup_alvo_ok(p_empresa, p_tipo, p_alvo) then raise exception 'Este pedido não está mais em negociação'; end if;
  cfg := comercial_followup_cfg(p_empresa);
  if not (cfg->'motivos') ? coalesce(p_motivo, '') then raise exception 'Escolha um motivo da lista'; end if;
  nome := comercial_followup_nome();
  insert into comercial_followup_encerrados(empresa_id, alvo_tipo, alvo_id, motivo, observacao, por_nome)
  values (p_empresa, p_tipo, p_alvo, p_motivo, nullif(btrim(coalesce(p_observacao, '')), ''), nome);
  if p_tipo = 'pedido' then
    update separacoes_pedidos
       set status_comercial = 'cancelado',
           observacoes = coalesce(observacoes, '{}'::jsonb) || jsonb_build_object('cancelamento', jsonb_build_object(
             'motivo', p_motivo, 'observacao', coalesce(p_observacao, ''), 'usuario', nome,
             'data', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'origem', 'acompanhamento'))
     where id = p_alvo and empresa_id = p_empresa;
  end if;
end $$;

create or replace function public.comercial_followup_config_salvar(p_empresa uuid, p_dias int, p_motivos jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok()
     or not operacao_pode(p_empresa, 'configuracoes.empresa.editar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 90 then raise exception 'Dias até o próximo contato: de 1 a 90'; end if;
  if jsonb_typeof(p_motivos) <> 'array' or jsonb_array_length(p_motivos) = 0 then raise exception 'Cadastre ao menos um motivo'; end if;
  if exists(select 1 from jsonb_array_elements(p_motivos) x where jsonb_typeof(x) <> 'string' or length(btrim(x #>> '{}')) not between 1 and 100) then
    raise exception 'Cada motivo deve ter de 1 a 100 caracteres';
  end if;
  insert into comercial_prod_config(empresa_id) values (p_empresa) on conflict do nothing;
  update comercial_prod_config
     set config = config || jsonb_build_object('dias_proximo_contato', p_dias, 'motivos_nao_fechamento', p_motivos)
   where empresa_id = p_empresa;
end $$;

revoke all on function public.comercial_followup_cfg(uuid), public.comercial_followup_nome(), public.comercial_followup_alvo_ok(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.comercial_followup_lista(uuid), public.comercial_followup_registrar(uuid, text, uuid, text, date, text),
  public.comercial_followup_nao_fechou(uuid, text, uuid, text, text), public.comercial_followup_config_salvar(uuid, int, jsonb) from public, anon;
grant execute on function public.comercial_followup_lista(uuid), public.comercial_followup_registrar(uuid, text, uuid, text, date, text),
  public.comercial_followup_nao_fechou(uuid, text, uuid, text, text), public.comercial_followup_config_salvar(uuid, int, jsonb) to authenticated;
notify pgrst, 'reload schema';
