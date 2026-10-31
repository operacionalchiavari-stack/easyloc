-- Equipes de clientes (31/out/2026): decoradora titular + assistentes/sócios que fecham pedidos em nome dela.
-- Uma pessoa pode estar em mais de uma equipe. O pedido guarda de qual equipe ele é em observacoes.equipe_id /
-- observacoes.equipe_nome (gravado pela tela do pedido; observacoes já é salva pelos dois caminhos de gravação).
-- Papéis (Titular, Assistente, Sócio…) cadastráveis em Parâmetros > Comercial. O titular da equipe fica em
-- clientes_equipes.titular_id (vai ser quem recebe o BV por padrão, na etapa seguinte).

create table if not exists public.clientes_equipe_papeis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 60),
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);
create unique index if not exists clientes_equipe_papeis_nome on public.clientes_equipe_papeis (empresa_id, lower(trim(nome)));

create table if not exists public.clientes_equipes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 80),
  titular_id uuid references public.clientes_empresas(id) on delete set null,
  observacao text check (observacao is null or length(observacao) <= 500),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists clientes_equipes_nome on public.clientes_equipes (empresa_id, lower(trim(nome)));

create table if not exists public.clientes_equipe_membros (
  equipe_id uuid not null references public.clientes_equipes(id) on delete cascade,
  cliente_id uuid not null references public.clientes_empresas(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  papel_id uuid references public.clientes_equipe_papeis(id) on delete set null,
  criado_em timestamptz not null default now(),
  primary key (equipe_id, cliente_id)
);
create index if not exists clientes_equipe_membros_cliente on public.clientes_equipe_membros (cliente_id);

-- membro, titular e papel precisam ser da mesma empresa da equipe
create or replace function public.clientes_equipe_conferir() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'clientes_equipe_membros' then
    if not exists (select 1 from clientes_equipes e where e.id = new.equipe_id and e.empresa_id = new.empresa_id)
       or not exists (select 1 from clientes_empresas c where c.id = new.cliente_id and c.empresa_id = new.empresa_id)
       or (new.papel_id is not null and not exists (select 1 from clientes_equipe_papeis p where p.id = new.papel_id and p.empresa_id = new.empresa_id)) then
      raise exception 'Equipe, cliente e papel precisam ser da mesma empresa';
    end if;
  elsif new.titular_id is not null and not exists (select 1 from clientes_empresas c where c.id = new.titular_id and c.empresa_id = new.empresa_id) then
    raise exception 'O titular precisa ser um cliente da empresa';
  end if;
  if tg_table_name = 'clientes_equipes' then new.atualizado_em := now(); end if;
  return new;
end $$;
drop trigger if exists clientes_equipe_membros_conferir on public.clientes_equipe_membros;
create trigger clientes_equipe_membros_conferir before insert or update on public.clientes_equipe_membros for each row execute function public.clientes_equipe_conferir();
drop trigger if exists clientes_equipes_conferir on public.clientes_equipes;
create trigger clientes_equipes_conferir before insert or update on public.clientes_equipes for each row execute function public.clientes_equipe_conferir();

-- acesso: ler = quem é da empresa; equipes e membros = quem edita clientes; papéis = quem edita os parâmetros
alter table public.clientes_equipe_papeis enable row level security;
alter table public.clientes_equipes enable row level security;
alter table public.clientes_equipe_membros enable row level security;
do $$
declare t text; perm text;
begin
  foreach t in array array['clientes_equipe_papeis', 'clientes_equipes', 'clientes_equipe_membros'] loop
    perm := case when t = 'clientes_equipe_papeis' then 'configuracoes.empresa.editar' else 'comercial.clientes.editar' end;
    execute format('drop policy if exists ler on public.%I', t);
    execute format('create policy ler on public.%I for select to authenticated using (public.eh_membro_empresa(empresa_id))', t);
    execute format('drop policy if exists gravar on public.%I', t);
    execute format('create policy gravar on public.%I for all to authenticated using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, %L)) with check (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, %L))', t, perm, perm);
    execute format('drop policy if exists seguranca_2fa on public.%I', t);
    execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

insert into public.clientes_equipe_papeis (empresa_id, nome, ordem)
select e.id, p.nome, p.ordem from public.empresas e
cross join (values ('Titular', 1), ('Assistente', 2), ('Sócio(a)', 3)) p(nome, ordem)
where not exists (select 1 from public.clientes_equipe_papeis x where x.empresa_id = e.id);

-- Contas a receber do Comercial: com a equipe do pedido
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
           (select max(b.data) from fin_baixas b where b.receber_id = t.id and b.estornado_em is null) recebido_em,
           nullif(p.observacoes->>'equipe_id', '') equipe_id,
           coalesce(eq.nome, nullif(p.observacoes->>'equipe_nome', '')) equipe_nome
      from fin_receber t
      left join separacoes_pedidos p on p.id = t.pedido_id
      left join clientes_equipes eq on eq.id::text = p.observacoes->>'equipe_id' and eq.empresa_id = p_empresa
     where t.empresa_id = p_empresa and t.status <> 'cancelado') x;
  return r;
end $$;
