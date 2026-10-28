-- Out/2026 — Cartelas de tecidos e tintas dos fornecedores, usadas na personalização.
-- Pedido do usuário: o cliente (no catálogo) e o Comercial (no pedido) escolhem o tecido/tinta da cartela; o pedido
-- chega com o código; o preço muda conforme a opção (tecido de R$ 20 x de R$ 80 o metro); e o Almoxarifado reserva só
-- o insumo de fato escolhido. A cartela é um cadastro próprio (não é estoque): muita opção nunca passa pelo Almoxarifado.
-- Uma opção pode ser ligada a um material do Almoxarifado; só aí ela reserva estoque.
--
-- Na personalização, uma linha de material pode ser "escolhida pelo cliente": em vez do material fixo, guarda o tipo da
-- cartela (Tecido, Tinta...) e a quantidade por unidade do item (ex.: 2,5 m). Preço da personalização com a opção:
--   preço base (preco_sugerido, calculado sem o material da cartela) + quantidade x preço da opção x (1 + margem) x complexidade.
-- Na linha do projeto/pedido: personalizacao_id, personalizacao_nome, personalizacao_escolhas
-- ({"Tecido": {"opcao_id", "codigo", "nome", "cartela", "fornecedor", "cor", "foto_url"}}) e personalizacao_valor (preço
-- da personalização por unidade do item, recalculado pelo servidor no pedido).

create table if not exists public.cartelas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null check (length(trim(tipo)) > 0),
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  fornecedor_nome text,
  link text,
  unidade text not null default 'm',
  ativa boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cartelas_empresa_tipo on public.cartelas (empresa_id, tipo);

create table if not exists public.cartela_opcoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cartela_id uuid not null references public.cartelas(id) on delete cascade,
  codigo text not null check (length(trim(codigo)) > 0),
  nome text not null check (length(trim(nome)) > 0),
  cor text check (cor is null or cor ~* '^#[0-9a-f]{6}$'),
  foto_url text, foto_path text,
  preco numeric(12,2) not null default 0 check (preco >= 0),
  almox_produto_id text,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cartela_id, codigo)
);
create index if not exists cartela_opcoes_cartela on public.cartela_opcoes (cartela_id, ordem);

-- a opção é sempre da mesma empresa da cartela
create or replace function public.cartela_opcao_empresa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select empresa_id into new.empresa_id from cartelas where id = new.cartela_id;
  if new.empresa_id is null then raise exception 'Cartela não encontrada.'; end if;
  new.codigo := trim(new.codigo); new.nome := trim(new.nome);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists cartela_opcao_empresa on public.cartela_opcoes;
create trigger cartela_opcao_empresa before insert or update on public.cartela_opcoes
for each row execute function public.cartela_opcao_empresa();

alter table public.cartelas enable row level security;
alter table public.cartela_opcoes enable row level security;
drop policy if exists cartelas_ler on public.cartelas;
create policy cartelas_ler on public.cartelas for select to authenticated using (public.eh_membro_empresa(empresa_id));
drop policy if exists cartelas_gravar on public.cartelas;
create policy cartelas_gravar on public.cartelas for all to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'estoque.insumos.editar'))
  with check (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'estoque.insumos.editar'));
drop policy if exists cartela_opcoes_ler on public.cartela_opcoes;
create policy cartela_opcoes_ler on public.cartela_opcoes for select to authenticated using (public.eh_membro_empresa(empresa_id));
drop policy if exists cartela_opcoes_gravar on public.cartela_opcoes;
create policy cartela_opcoes_gravar on public.cartela_opcoes for all to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'estoque.insumos.editar'))
  with check (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'estoque.insumos.editar'));
grant select, insert, update, delete on public.cartelas, public.cartela_opcoes to authenticated;

-- fotos das amostras: bucket público, pasta da empresa
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cartelas', 'cartelas', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists cartelas_storage_gravar on storage.objects;
create policy cartelas_storage_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'cartelas' and (storage.foldername(name))[1] in (select ue.empresa_id::text from public.usuarios_empresas ue where ue.user_id = auth.uid()));
drop policy if exists cartelas_storage_trocar on storage.objects;
create policy cartelas_storage_trocar on storage.objects for update to authenticated
  using (bucket_id = 'cartelas' and (storage.foldername(name))[1] in (select ue.empresa_id::text from public.usuarios_empresas ue where ue.user_id = auth.uid()));
drop policy if exists cartelas_storage_apagar on storage.objects;
create policy cartelas_storage_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'cartelas' and (storage.foldername(name))[1] in (select ue.empresa_id::text from public.usuarios_empresas ue where ue.user_id = auth.uid()));

-- linha "escolhida pelo cliente" na personalização
alter table public.personalizacoes_insumos add column if not exists cartela_tipo text;
alter table public.personalizacoes_insumos drop constraint if exists personalizacoes_insumos_material_chk;
alter table public.personalizacoes_insumos add constraint personalizacoes_insumos_material_chk
  check (almox_produto_id is not null or insumo_id is not null or nullif(trim(coalesce(cartela_tipo, '')), '') is not null);

-- ------------------------------------------------------------------ leitura pelo catálogo e pelo pedido
-- quem chama: decorador (token) ou equipe (login). Preço só se o parâmetro do catálogo deixar.
-- No pedido comercial (p_pedido) a equipe com permissão de pedidos sempre vê: o valor entra no total do pedido.
create or replace function public.personalizacao_ver_preco(p_ctx jsonb, p_pedido boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_pedido and (p_ctx->>'equipe')::boolean and public.operacao_pode((p_ctx->>'empresa_id')::uuid, 'comercial.pedidos.visualizar'))
      or public.catalogo_parametro_permite((p_ctx->>'empresa_id')::uuid, 'preco',
           case when (p_ctx->>'equipe')::boolean then 'equipe' else 'decorador' end, nullif(p_ctx->>'cliente_id', '')::uuid)
$$;

-- fator de venda da personalização: (1 + margem) x complexidade
create or replace function public.personalizacao_fator(p public.personalizacoes)
returns numeric language sql immutable as $$
  select (1 + coalesce(p.margem, 0) / 100.0) * coalesce(nullif(p.complexidade, 0), 1)
$$;

-- preço base: o preço manual, se ligado, senão o calculado (sem o material da cartela)
create or replace function public.personalizacao_preco_base(p public.personalizacoes)
returns numeric language sql immutable as $$
  select round(coalesce(case when p.preco_manual_ativo and p.preco_manual is not null then p.preco_manual end, p.preco_sugerido, 0), 2)
$$;

-- Personalizações ativas (para saber em que itens oferecer "Personalizar")
create or replace function public.personalizacao_lista(p_token text default null, p_empresa_id uuid default null, p_pedido boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ctx jsonb := public.projeto_ctx(p_token, p_empresa_id); emp uuid := (ctx->>'empresa_id')::uuid; ver_preco boolean;
begin
  ver_preco := public.personalizacao_ver_preco(ctx, p_pedido);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'vinculo_id', p.vinculo_id, 'tipo', p.tipo,
      'preco_base', case when ver_preco then public.personalizacao_preco_base(p) end,
      'tipos_cartela', (select coalesce(jsonb_agg(distinct pi.cartela_tipo), '[]') from personalizacoes_insumos pi where pi.personalizacao_id = p.id and pi.cartela_tipo is not null)
    ) order by p.tipo)
    from personalizacoes p where p.empresa_id = emp and upper(coalesce(p.status, 'ATIVO')) <> 'INATIVO'), '[]');
end $$;

-- Uma personalização com as cartelas de cada material escolhido pelo cliente e o acréscimo de cada opção
create or replace function public.personalizacao_cartelas(p_token text default null, p_empresa_id uuid default null, p_personalizacao uuid default null, p_pedido boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ctx jsonb := public.projeto_ctx(p_token, p_empresa_id); emp uuid := (ctx->>'empresa_id')::uuid; p personalizacoes; ver_preco boolean;
begin
  select * into p from personalizacoes where id = p_personalizacao and empresa_id = emp and upper(coalesce(status, 'ATIVO')) <> 'INATIVO';
  if not found then raise exception 'Personalização não encontrada.'; end if;
  ver_preco := public.personalizacao_ver_preco(ctx, p_pedido);
  return jsonb_build_object('id', p.id, 'tipo', p.tipo, 'vinculo_id', p.vinculo_id,
    'preco_base', case when ver_preco then public.personalizacao_preco_base(p) end,
    'variaveis', coalesce((select jsonb_agg(jsonb_build_object(
        'tipo', v.cartela_tipo, 'quantidade', v.qtd, 'unidade', v.unid,
        'cartelas', coalesce((select jsonb_agg(jsonb_build_object(
            'id', c.id, 'nome', c.nome, 'fornecedor', c.fornecedor_nome, 'link', c.link, 'unidade', c.unidade,
            'opcoes', coalesce((select jsonb_agg(jsonb_build_object(
                'id', o.id, 'codigo', o.codigo, 'nome', o.nome, 'cor', o.cor, 'foto_url', o.foto_url,
                'acrescimo', case when ver_preco then round(v.qtd * o.preco * public.personalizacao_fator(p), 2) end
              ) order by o.ordem, o.nome) from cartela_opcoes o where o.cartela_id = c.id and o.ativo), '[]')
          ) order by c.ordem, c.nome) from cartelas c
           where c.empresa_id = emp and c.ativa and lower(trim(c.tipo)) = lower(trim(v.cartela_tipo))), '[]')
      ) order by v.cartela_tipo)
      from (select pi.cartela_tipo, sum(pi.quantidade) qtd, max(pi.unidade) unid
              from personalizacoes_insumos pi where pi.personalizacao_id = p.id and pi.cartela_tipo is not null
             group by pi.cartela_tipo) v), '[]'));
end $$;

-- Preço por unidade do item de cada linha {personalizacao_id, escolhas: {tipo: {opcao_id}}} (o pedido recalcula por aqui)
create or replace function public.personalizacao_precos(p_token text default null, p_empresa_id uuid default null, p_linhas jsonb default '[]', p_pedido boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ctx jsonb := public.projeto_ctx(p_token, p_empresa_id); emp uuid := (ctx->>'empresa_id')::uuid; res jsonb := '[]'; l jsonb; p personalizacoes; v numeric;
begin
  if not public.personalizacao_ver_preco(ctx, p_pedido) then
    return (select coalesce(jsonb_agg('null'::jsonb), '[]') from jsonb_array_elements(coalesce(p_linhas, '[]')));
  end if;
  for l in select x from jsonb_array_elements(coalesce(p_linhas, '[]')) x loop
    select * into p from personalizacoes where id = nullif(l->>'personalizacao_id', '')::uuid and empresa_id = emp;
    if not found then res := res || jsonb_build_array(null); continue; end if;
    select public.personalizacao_preco_base(p) + coalesce(sum(round(pi.quantidade * coalesce(o.preco, 0) * public.personalizacao_fator(p), 2)), 0)
      into v
      from personalizacoes_insumos pi
      left join cartela_opcoes o on o.id = nullif(l->'escolhas'->pi.cartela_tipo->>'opcao_id', '')::uuid and o.empresa_id = emp
     where pi.personalizacao_id = p.id and pi.cartela_tipo is not null;
    res := res || jsonb_build_array(round(coalesce(v, public.personalizacao_preco_base(p)), 2));
  end loop;
  return res;
end $$;

grant execute on function public.personalizacao_lista(text, uuid, boolean) to anon, authenticated;
grant execute on function public.personalizacao_cartelas(text, uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.personalizacao_precos(text, uuid, jsonb, boolean) to anon, authenticated;
revoke all on function public.personalizacao_ver_preco(jsonb, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------------ reserva no Almoxarifado: só o insumo escolhido
create or replace function public.almox_reservas_personalizacao(p_empresa_id uuid)
returns table(produto_id text, reservado numeric, pre_reserva numeric, pedidos jsonb)
language sql stable security definer set search_path = public as $$
  with ped as (
    select p.id, p.numero_pedido, p.cliente_nome, p.data_evento,
           case when p.status_comercial = 'pre_reserva' then 'pre' else 'res' end as tipo,
           p.observacoes->'projeto_comercial'->'dados'->'ambientes' as ambs
      from separacoes_pedidos p
     where p.empresa_id = p_empresa_id
       and public.eh_membro_empresa(p_empresa_id)
       and p.status_comercial in ('pre_reserva','aprovado','finalizado','enviado')
       and coalesce(p.data_evento_fim, p.data_evento, current_date) >= current_date
       and p.encerrado_operacional_em is null
  ), linhas as (
    select ped.id, ped.numero_pedido, ped.cliente_nome, ped.data_evento, ped.tipo,
           (it->>'personalizacao_id')::uuid as pers,
           case when jsonb_typeof(it->'personalizacao_escolhas') = 'object' then it->'personalizacao_escolhas' else '{}'::jsonb end as escolhas,
           greatest(coalesce(public.almox_num(it->>'quantidade'), 0), 0) as qtd
      from ped
      cross join lateral jsonb_array_elements(case when jsonb_typeof(ped.ambs) = 'array' then ped.ambs else '[]'::jsonb end) a
      cross join lateral jsonb_array_elements(case when jsonb_typeof(a->'itens') = 'array' then a->'itens' else '[]'::jsonb end) it
     where coalesce(it->>'personalizacao_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ), materiais as (
    -- material fixo da personalização
    select pi.almox_produto_id as prod, l.id, l.numero_pedido, l.cliente_nome, l.data_evento, l.tipo, l.qtd * pi.quantidade as q
      from linhas l
      join personalizacoes_insumos pi on pi.personalizacao_id = l.pers and pi.empresa_id = p_empresa_id
     where pi.almox_produto_id is not null
    union all
    -- material escolhido na cartela (só reserva se a opção estiver ligada a um material do Almoxarifado)
    select o.almox_produto_id, l.id, l.numero_pedido, l.cliente_nome, l.data_evento, l.tipo, l.qtd * pi.quantidade
      from linhas l
      join personalizacoes_insumos pi on pi.personalizacao_id = l.pers and pi.empresa_id = p_empresa_id and pi.cartela_tipo is not null
      join cartela_opcoes o on o.empresa_id = p_empresa_id
       and o.id::text = l.escolhas->pi.cartela_tipo->>'opcao_id'
     where o.almox_produto_id is not null
  ), por_pedido as (
    select prod, id, numero_pedido, cliente_nome, data_evento, tipo, sum(q) as q
      from materiais group by 1,2,3,4,5,6
  )
  select prod,
         coalesce(sum(q) filter (where tipo = 'res'), 0),
         coalesce(sum(q) filter (where tipo = 'pre'), 0),
         jsonb_agg(jsonb_build_object('pedido_id', id, 'numero', numero_pedido, 'cliente', cliente_nome,
                                      'data_evento', data_evento, 'tipo', tipo, 'quantidade', q) order by data_evento)
    from por_pedido group by prod
$$;
revoke all on function public.almox_reservas_personalizacao(uuid) from public, anon;
grant execute on function public.almox_reservas_personalizacao(uuid) to authenticated;
