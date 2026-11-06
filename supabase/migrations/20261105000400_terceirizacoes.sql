-- Terceirizações (nov/2026): empresas que alugam itens para a Chiavari (são fornecedores marcados como terceirização)
-- e os itens de cada uma (cadastro parecido com o nosso: nome, medidas, foto, quantidade que a empresa tem, custo e
-- valor cobrado do cliente). No pedido comercial, "Sublocação" busca esses itens e eles entram como linhas do pedido
-- (dados.terceirizados do projeto do pedido). A quantidade é só referência: a disponibilidade de verdade é confirmada
-- com a empresa; o sistema mostra quantos já estão sublocados em outros pedidos no mesmo período.

alter table public.fornecedores add column if not exists terceirizacao boolean not null default false;

create table if not exists public.terceirizacao_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id) on delete restrict,
  produto text not null check (length(btrim(produto)) between 1 and 160),
  descricao text,
  categoria text,
  material text,
  cor text,
  largura numeric(10,3),
  altura numeric(10,3),
  profundidade numeric(10,3),
  codigo text,
  quantidade integer not null default 0 check (quantidade >= 0),
  custo numeric(14,2) not null default 0 check (custo >= 0),
  valor_locacao numeric(14,2) not null default 0 check (valor_locacao >= 0),
  foto_url text,
  foto_path text,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists terceirizacao_itens_empresa on public.terceirizacao_itens(empresa_id, fornecedor_id);

alter table public.terceirizacao_itens enable row level security;
revoke all on public.terceirizacao_itens from anon, authenticated;
grant select, insert, update, delete on public.terceirizacao_itens to authenticated;
drop policy if exists ler on public.terceirizacao_itens;
create policy ler on public.terceirizacao_itens for select to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'comercial.pedidos.visualizar'));
drop policy if exists gravar on public.terceirizacao_itens;
create policy gravar on public.terceirizacao_itens for all to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'comercial.pedidos.editar'))
  with check (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'comercial.pedidos.editar')
    and exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.empresa_id = terceirizacao_itens.empresa_id));
drop policy if exists seguranca_2fa on public.terceirizacao_itens;
create policy seguranca_2fa on public.terceirizacao_itens as restrictive for all to authenticated
  using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));

create or replace function public.terceirizacao_itens_atualizado() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists terceirizacao_itens_atualizado on public.terceirizacao_itens;
create trigger terceirizacao_itens_atualizado before update on public.terceirizacao_itens for each row execute function public.terceirizacao_itens_atualizado();

-- Empresas de terceirização: lista (com quantos itens) e marcar/desmarcar um fornecedor.
create or replace function public.terceirizacao_empresas(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa, 'comercial.pedidos.visualizar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', coalesce(nullif(btrim(f.nome_fantasia), ''), f.nome_razao_social),
      'razao', f.nome_razao_social, 'terceirizacao', f.terceirizacao,
      'itens', (select count(*) from terceirizacao_itens t where t.fornecedor_id = f.id and t.ativo)) order by coalesce(nullif(btrim(f.nome_fantasia), ''), f.nome_razao_social))
    from fornecedores f where f.empresa_id = p_empresa), '[]'::jsonb);
end $$;

create or replace function public.terceirizacao_empresa_marcar(p_empresa uuid, p_fornecedor uuid, p_sim boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok() or not operacao_pode(p_empresa, 'comercial.pedidos.editar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if not p_sim and exists (select 1 from terceirizacao_itens where fornecedor_id = p_fornecedor and ativo) then
    raise exception 'Esta empresa ainda tem itens ativos: desative ou exclua os itens antes';
  end if;
  update fornecedores set terceirizacao = coalesce(p_sim, false) where id = p_fornecedor and empresa_id = p_empresa;
  if not found then raise exception 'Fornecedor não encontrado'; end if;
end $$;

-- Quantos de cada item terceirizado já estão em outros pedidos que cruzam o período (pré-reserva e reservado).
create or replace function public.terceirizacao_ocupacao(p_empresa uuid, p_inicio date, p_fim date, p_pedido uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa, 'comercial.pedidos.visualizar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null then return '{}'::jsonb; end if;
  return coalesce((
    select jsonb_object_agg(item, jsonb_build_object('quantidade', qtd, 'pedidos', pedidos))
    from (
      select t->>'terceirizado_id' item, sum(greatest(coalesce((t->>'quantidade')::numeric, 0), 0))::int qtd,
             jsonb_agg(distinct p.numero_pedido) pedidos
      from separacoes_pedidos p
      cross join lateral jsonb_array_elements(coalesce(p.observacoes->'projeto_comercial'->'dados'->'terceirizados', '[]'::jsonb)) t
      where p.empresa_id = p_empresa
        and (p_pedido is null or p.id <> p_pedido)
        and p.status_comercial in ('pre_reserva', 'aprovado', 'enviado', 'finalizado')
        and coalesce(p.data_entrega, p.data_evento) <= p_fim
        and coalesce(p.data_coleta, p.data_evento_fim, p.data_evento) >= p_inicio
        and t->>'terceirizado_id' is not null
      group by 1
    ) x), '{}'::jsonb);
end $$;

-- Link do pedido (cliente): leva também os itens terceirizados do projeto do pedido.
create or replace function public.pagamento_link_pedido(p_pedido uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; emp uuid; terc jsonb;
begin
  r := pagamento_link_pedido_base(p_pedido);
  select empresa_id, coalesce(observacoes->'projeto_comercial'->'dados'->'terceirizados', '[]'::jsonb) into emp, terc from separacoes_pedidos where id = p_pedido;
  if r is null or emp is null then return r; end if;
  -- custo e fornecedor ficam de fora do link do cliente
  terc := coalesce((select jsonb_agg(t - 'custo' - 'fornecedor_id' - 'fornecedor_nome') from jsonb_array_elements(terc) t), '[]'::jsonb);
  return r || jsonb_build_object('avisos', comercial_avisos_pedido_textos(emp), 'terceirizados', terc);
end $$;

revoke all on function public.terceirizacao_empresas(uuid), public.terceirizacao_empresa_marcar(uuid, uuid, boolean),
  public.terceirizacao_ocupacao(uuid, date, date, uuid) from public, anon;
grant execute on function public.terceirizacao_empresas(uuid), public.terceirizacao_empresa_marcar(uuid, uuid, boolean),
  public.terceirizacao_ocupacao(uuid, date, date, uuid) to authenticated;
revoke all on function public.pagamento_link_pedido(uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
