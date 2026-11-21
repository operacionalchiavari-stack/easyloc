-- Cadastro de clientes finais (18/11/2026). Os clientes finais são digitados nos dados do pedido
-- (separacoes_pedidos.observacoes.clientes_finais); um gatilho guarda cada pessoa UMA vez por empresa (pelo CPF/CNPJ)
-- e liga ela aos pedidos em que aparece. Pessoa sem CPF/CNPJ não entra no cadastro. Pessoa que deixa de estar em
-- qualquer pedido é apagada: todo cliente final está ligado a pelo menos um pedido.
create table if not exists public.clientes_finais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  documento text not null,              -- só os números (CPF 11 ou CNPJ 14)
  nome text not null,
  rg text, ie text, telefone text, email text, endereco text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, documento)
);
create table if not exists public.clientes_finais_pedidos (
  cliente_final_id uuid not null references public.clientes_finais(id) on delete cascade,
  pedido_id uuid not null references public.separacoes_pedidos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  primary key (cliente_final_id, pedido_id)
);
create index if not exists clientes_finais_pedidos_pedido on public.clientes_finais_pedidos(pedido_id);

alter table public.clientes_finais enable row level security;
alter table public.clientes_finais_pedidos enable row level security;
revoke all on public.clientes_finais, public.clientes_finais_pedidos from anon, authenticated;
grant select on public.clientes_finais, public.clientes_finais_pedidos to authenticated;
drop policy if exists ler on public.clientes_finais;
create policy ler on public.clientes_finais for select to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'comercial.clientes.visualizar'));
drop policy if exists ler on public.clientes_finais_pedidos;
create policy ler on public.clientes_finais_pedidos for select to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'comercial.clientes.visualizar'));
drop policy if exists seguranca_2fa on public.clientes_finais;
create policy seguranca_2fa on public.clientes_finais as restrictive for all to authenticated
  using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));
drop policy if exists seguranca_2fa on public.clientes_finais_pedidos;
create policy seguranca_2fa on public.clientes_finais_pedidos as restrictive for all to authenticated
  using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));

create or replace function public.clientes_finais_sincronizar(p_pedido uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ped record; v_p jsonb; v_doc text; v_id uuid; v_ids uuid[] := '{}'; v_antigos uuid[];
begin
  select id, empresa_id, observacoes into v_ped from separacoes_pedidos where id = p_pedido;
  select coalesce(array_agg(cliente_final_id), '{}') into v_antigos from clientes_finais_pedidos where pedido_id = p_pedido;
  if v_ped.id is not null and jsonb_typeof(v_ped.observacoes->'clientes_finais') = 'array' then
    for v_p in select * from jsonb_array_elements(v_ped.observacoes->'clientes_finais') loop
      v_doc := regexp_replace(coalesce(v_p->>'documento', ''), '\D', '', 'g');
      if length(v_doc) not in (11, 14) or btrim(coalesce(v_p->>'nome', '')) = '' then continue; end if;
      insert into clientes_finais as c (empresa_id, documento, nome, rg, ie, telefone, email, endereco)
      values (v_ped.empresa_id, v_doc, btrim(v_p->>'nome'), nullif(btrim(v_p->>'rg'), ''), nullif(btrim(v_p->>'ie'), ''),
              nullif(btrim(v_p->>'telefone'), ''), nullif(btrim(v_p->>'email'), ''), nullif(btrim(v_p->>'endereco'), ''))
      on conflict (empresa_id, documento) do update set
        nome = excluded.nome,
        rg = coalesce(excluded.rg, c.rg), ie = coalesce(excluded.ie, c.ie),
        telefone = coalesce(excluded.telefone, c.telefone), email = coalesce(excluded.email, c.email),
        endereco = coalesce(excluded.endereco, c.endereco), atualizado_em = now()
      returning id into v_id;
      v_ids := v_ids || v_id;
    end loop;
  end if;
  delete from clientes_finais_pedidos where pedido_id = p_pedido and not (cliente_final_id = any(v_ids));
  if v_ped.id is not null then
    insert into clientes_finais_pedidos (cliente_final_id, pedido_id, empresa_id)
    select distinct x, p_pedido, v_ped.empresa_id from unnest(v_ids) x on conflict do nothing;
  end if;
  -- quem saiu deste pedido e não está em nenhum outro some do cadastro
  delete from clientes_finais c where c.id = any(v_antigos) and not (c.id = any(v_ids))
    and not exists (select 1 from clientes_finais_pedidos l where l.cliente_final_id = c.id);
end $$;
revoke all on function public.clientes_finais_sincronizar(uuid) from public, anon, authenticated;

create or replace function public.clientes_finais_gatilho() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.observacoes->'clientes_finais' is not distinct from old.observacoes->'clientes_finais' then
    return new;
  end if;
  begin
    perform clientes_finais_sincronizar(new.id);
  exception when others then
    raise warning 'clientes_finais_sincronizar: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists clientes_finais_pedido on public.separacoes_pedidos;
create trigger clientes_finais_pedido after insert or update of observacoes on public.separacoes_pedidos
  for each row execute function public.clientes_finais_gatilho();

-- Lista para a tela Cadastros > Clientes finais: cada pessoa com os pedidos em que aparece.
create or replace function public.clientes_finais_lista(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok()
     or not operacao_pode(p_empresa, 'comercial.clientes.visualizar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'nome', c.nome, 'documento', c.documento, 'rg', c.rg, 'ie', c.ie, 'telefone', c.telefone,
      'email', c.email, 'endereco', c.endereco, 'criado_em', c.criado_em, 'atualizado_em', c.atualizado_em,
      'pedidos', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'numero', p.numero_pedido, 'status', p.status_comercial, 'data_evento', p.data_evento,
          'local', p.local_nome, 'decorador', p.cliente_nome, 'valor', p.valor_total,
          'decorador_foto', (select ce.catalogo_logo_url from clientes_empresas ce where ce.id = p.cliente_id))
          order by p.data_evento desc nulls last)
        from clientes_finais_pedidos l join separacoes_pedidos p on p.id = l.pedido_id
        where l.cliente_final_id = c.id), '[]'::jsonb))
      order by c.nome)
    from clientes_finais c where c.empresa_id = p_empresa), '[]'::jsonb);
end $$;
revoke all on function public.clientes_finais_lista(uuid) from public, anon;
grant execute on function public.clientes_finais_lista(uuid) to authenticated;

-- Pedidos que já tinham clientes finais
do $$ declare r record; begin
  for r in select id from separacoes_pedidos where jsonb_typeof(observacoes->'clientes_finais') = 'array' loop
    perform clientes_finais_sincronizar(r.id);
  end loop;
end $$;
