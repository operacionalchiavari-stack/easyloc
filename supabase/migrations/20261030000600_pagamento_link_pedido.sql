-- Link de pagamento do pedido (30/out/2026).
-- O cliente abre um link + código de 6 números, vê todos os pagamentos do pedido (um por conta a receber,
-- com nome neutro "Pagamento 1, 2…") e gera o QR PIX de cada um. O QR é uma cobrança do gateway da CONTA
-- daquela parte (Locação, Frete, Montagem): valor travado, sem mostrar chave PIX nenhuma. Quando o gateway
-- confirma, a baixa cai na conta "Mercado Pago · <conta>" (tipo gateway) do Financeiro.

-- 1) gateway por conta: cada conta do Financeiro pode ter a sua conexão (conta_id null = conexão geral de antes)
alter table public.payment_gateway_connections add column if not exists conta_id uuid references public.fin_contas(id) on delete cascade;
alter table public.payment_gateway_connections add column if not exists recebe_conta_id uuid references public.fin_contas(id) on delete set null;
alter table public.payment_gateway_connections add column if not exists conta_chave text generated always as (coalesce(conta_id::text, '')) stored;
alter table public.payment_gateway_connections drop constraint if exists payment_gateway_connections_empresa_id_gateway_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payment_gateway_connections_empresa_gateway_conta_key') then
    alter table public.payment_gateway_connections add constraint payment_gateway_connections_empresa_gateway_conta_key unique (empresa_id, gateway, conta_chave);
  end if;
end $$;

alter table public.payment_gateway_payments add column if not exists receber_id uuid references public.fin_receber(id) on delete set null;
alter table public.payment_gateway_payments add column if not exists baixa_id uuid references public.fin_baixas(id) on delete set null;
create index if not exists payment_gateway_payments_receber_idx on public.payment_gateway_payments(receber_id) where receber_id is not null;

-- conta do Financeiro onde o dinheiro do gateway cai (criada na primeira vez: "Mercado Pago · Conta Locação")
create or replace function public.pagamento_gateway_conta_recebe(p_connection uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; v_id uuid; v_nome text;
begin
  select g.*, f.nome conta_nome into c from payment_gateway_connections g left join fin_contas f on f.id = g.conta_id where g.id = p_connection;
  if not found then return null; end if;
  if c.recebe_conta_id is not null and exists (select 1 from fin_contas where id = c.recebe_conta_id) then return c.recebe_conta_id; end if;
  v_nome := initcap(replace(c.gateway, '_', ' ')) || coalesce(' · ' || c.conta_nome, '');
  insert into fin_contas(empresa_id, nome, tipo, banco, saldo_inicial, saldo_inicial_data, ativo, observacoes)
  values (c.empresa_id, left(v_nome, 80), 'gateway', initcap(replace(c.gateway, '_', ' ')), 0, current_date, true,
          'Recebimentos do link de pagamento. Transfira para o banco e a conciliação reconhece a transferência.')
  returning id into v_id;
  update payment_gateway_connections set recebe_conta_id = v_id where id = p_connection;
  return v_id;
end $$;
revoke all on function public.pagamento_gateway_conta_recebe(uuid) from public, anon, authenticated;

-- 2) o link do pedido (um por pedido). O código fica visível para a equipe (é ela que envia ao cliente).
create table if not exists public.pagamento_links (
  pedido_id uuid primary key references public.separacoes_pedidos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  slug text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 24),
  pin text not null,
  ativo boolean not null default true,
  tentativas int not null default 0,
  bloqueado_ate timestamptz,
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pagamento_links enable row level security;
-- sem políticas: a equipe usa as funções abaixo; o cliente só a função pública com o código

create or replace function public.pagamento_link_pin() returns text language sql volatile as $$
  select lpad((floor(random() * 1000000))::int::text, 6, '0')
$$;

-- contas a receber do pedido (as partes de cada parcela), na ordem em que o cliente vê
create or replace function public.pagamento_link_itens(p_pedido uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'numero', r.n, 'vencimento', r.vencimento, 'valor', r.valor, 'aberto', r.aberto,
           'situacao', case when r.status = 'recebido' or r.aberto <= 0.005 then 'pago'
                            when r.vencimento < current_date then 'vencido'
                            when r.recebido > 0 then 'parcial' else 'aberto' end,
           'pagavel', exists (select 1 from payment_gateway_connections g where g.empresa_id = r.empresa_id and g.conta_id = r.conta_id and g.status = 'conectado'),
           'conta_id', r.conta_id) order by r.n), '[]'::jsonb)
    from (select x.*, row_number() over (order by x.vencimento, case x.componente when 'locacao' then 1 when 'frete' then 2 when 'montagem' then 3 else 4 end, x.parcela) n
            from fin_receber x where x.pedido_id = p_pedido and x.origem = 'pedido' and x.status <> 'cancelado') r
$$;
revoke all on function public.pagamento_link_itens(uuid) from public, anon, authenticated;

-- equipe: pega (ou cria) o link do pedido
create or replace function public.pagamento_link_obter(p_empresa uuid, p_pedido uuid, p_novo_codigo boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l pagamento_links%rowtype; v_itens jsonb;
begin
  if not (operacao_pode(p_empresa, 'comercial.pedidos.visualizar') or operacao_pode(p_empresa, 'financeiro.fluxo.visualizar')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if not exists (select 1 from separacoes_pedidos where id = p_pedido and empresa_id = p_empresa) then raise exception 'Pedido não encontrado'; end if;
  insert into pagamento_links(pedido_id, empresa_id, pin, criado_por) values (p_pedido, p_empresa, pagamento_link_pin(), auth.uid())
  on conflict (pedido_id) do nothing;
  if p_novo_codigo then
    update pagamento_links set pin = pagamento_link_pin(), tentativas = 0, bloqueado_ate = null, updated_at = now() where pedido_id = p_pedido;
  end if;
  select * into l from pagamento_links where pedido_id = p_pedido;
  v_itens := pagamento_link_itens(p_pedido);
  return jsonb_build_object('slug', l.slug, 'pin', l.pin, 'ativo', l.ativo,
    'pagamentos', jsonb_array_length(v_itens),
    'contas_sem_gateway', coalesce((select jsonb_agg(distinct coalesce(f.nome, 'Sem conta'))
        from jsonb_array_elements(v_itens) i left join fin_contas f on f.id = (i->>'conta_id')::uuid
       where not (i->>'pagavel')::boolean and i->>'situacao' <> 'pago'), '[]'::jsonb));
end $$;
revoke all on function public.pagamento_link_obter(uuid, uuid, boolean) from public, anon;
grant execute on function public.pagamento_link_obter(uuid, uuid, boolean) to authenticated;

-- confere slug + código (5 erros = 15 min bloqueado). Devolve erro em JSON (exceção desfaria a contagem).
create or replace function public.pagamento_link_conferir(p_slug text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l pagamento_links%rowtype;
begin
  select * into l from pagamento_links where slug = p_slug for update;
  if not found or not l.ativo then return jsonb_build_object('erro', 'Link de pagamento não encontrado.'); end if;
  if l.bloqueado_ate is not null and l.bloqueado_ate > now() then
    return jsonb_build_object('erro', 'Muitas tentativas. Tente de novo em alguns minutos.', 'bloqueado', true);
  end if;
  if coalesce(p_pin, '') <> l.pin then
    update pagamento_links set tentativas = case when tentativas + 1 >= 5 then 0 else tentativas + 1 end,
           bloqueado_ate = case when tentativas + 1 >= 5 then now() + interval '15 minutes' else null end where pedido_id = l.pedido_id;
    return jsonb_build_object('erro', 'Código incorreto.', 'codigo_errado', true);
  end if;
  if l.tentativas > 0 or l.bloqueado_ate is not null then update pagamento_links set tentativas = 0, bloqueado_ate = null where pedido_id = l.pedido_id; end if;
  return jsonb_build_object('ok', true, 'pedido_id', l.pedido_id, 'empresa_id', l.empresa_id);
end $$;
revoke all on function public.pagamento_link_conferir(text, text) from public, anon, authenticated;

-- cliente (sem login): abre o link
create or replace function public.pagamento_link_abrir(p_slug text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; p record; e record; v_itens jsonb;
begin
  v := pagamento_link_conferir(p_slug, p_pin);
  if v ? 'erro' then return v; end if;
  select numero_pedido, cliente_nome, data_evento, data_evento_fim into p from separacoes_pedidos where id = (v->>'pedido_id')::uuid;
  select nome, logo_url into e from empresas where id = (v->>'empresa_id')::uuid;
  -- PIX em aberto de cada pagamento (o cliente volta e o QR ainda vale)
  select coalesce(jsonb_agg((i || jsonb_build_object('pix', (
           select jsonb_build_object('qr_code', g.qr_code, 'qr_code_base64', g.qr_code_base64, 'expira_em', g.expires_at, 'valor', g.amount)
             from payment_gateway_payments g
            where g.receber_id = (i->>'id')::uuid and g.paid_at is null and g.cancelled_at is null
              and g.status in ('pending', 'in_process') and (g.expires_at is null or g.expires_at > now() + interval '1 minute')
            order by g.created_at desc limit 1))) - 'conta_id' order by (i->>'numero')::int), '[]'::jsonb)
    into v_itens from jsonb_array_elements(pagamento_link_itens((v->>'pedido_id')::uuid)) i;
  return jsonb_build_object('ok', true,
    'empresa', jsonb_build_object('nome', e.nome, 'logo_url', e.logo_url),
    'pedido', jsonb_build_object('numero', p.numero_pedido, 'cliente', p.cliente_nome, 'data_evento', p.data_evento, 'data_evento_fim', p.data_evento_fim),
    'pagamentos', v_itens);
end $$;
revoke all on function public.pagamento_link_abrir(text, text) from public;
grant execute on function public.pagamento_link_abrir(text, text) to anon, authenticated;

-- servidor (Edge Function): confere o código e devolve o que precisa para gerar/consultar o PIX de um pagamento
create or replace function public.pagamento_link_preparar(p_slug text, p_pin text, p_receber uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; r record; g record; n int;
begin
  v := pagamento_link_conferir(p_slug, p_pin);
  if v ? 'erro' then return v; end if;
  select x.* into r from fin_receber x where x.id = p_receber and x.pedido_id = (v->>'pedido_id')::uuid and x.origem = 'pedido' and x.status <> 'cancelado';
  if not found then return jsonb_build_object('erro', 'Pagamento não encontrado.'); end if;
  select (i->>'numero')::int into n from jsonb_array_elements(pagamento_link_itens(r.pedido_id)) i where i->>'id' = r.id::text;
  select * into g from payment_gateway_connections where empresa_id = r.empresa_id and conta_id = r.conta_id and status = 'conectado' limit 1;
  return jsonb_build_object('ok', true, 'empresa_id', r.empresa_id, 'pedido_id', r.pedido_id,
    'pedido_numero', (select numero_pedido from separacoes_pedidos where id = r.pedido_id),
    'receber_id', r.id, 'numero', n, 'aberto', r.aberto, 'vencimento', r.vencimento, 'pago', r.aberto <= 0.005 or r.status = 'recebido',
    'connection_id', g.id, 'gateway', g.gateway);
end $$;
revoke all on function public.pagamento_link_preparar(text, text, uuid) from public, anon, authenticated;

-- baixa do PIX confirmado pelo gateway (idempotente: uma baixa por cobrança)
create or replace function public.pagamento_link_baixar(p_payment uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare pg payment_gateway_payments%rowtype; r record; v_conta uuid; v_valor numeric; v_baixa uuid;
begin
  select * into pg from payment_gateway_payments where id = p_payment for update;
  if not found or pg.receber_id is null or pg.baixa_id is not null then return pg.baixa_id; end if;
  select * into r from fin_receber where id = pg.receber_id for update;
  if not found or r.status = 'cancelado' then return null; end if;
  v_conta := pagamento_gateway_conta_recebe(pg.gateway_connection_id);
  v_valor := least(round(pg.amount, 2), r.aberto);
  if v_valor <= 0.005 or v_conta is null then return null; end if;
  v_baixa := fin_baixar_(r.empresa_id, 'receber', r.id, coalesce(pg.paid_at, now())::date, v_valor, 0, 0, 0, 0, v_conta, 'PIX',
                         'PIX pelo link de pagamento' || coalesce(' · ' || pg.external_id, ''), 'gateway', null);
  update payment_gateway_payments set baixa_id = v_baixa where id = pg.id;
  return v_baixa;
end $$;
revoke all on function public.pagamento_link_baixar(uuid) from public, anon, authenticated;
