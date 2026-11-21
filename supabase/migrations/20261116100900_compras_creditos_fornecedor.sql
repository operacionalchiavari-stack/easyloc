-- Compras > Créditos (cópia da Tecnoweld, 16/11/2026): crédito com o fornecedor que nasce da decisão de uma divergência
-- no recebimento (abater valor, ou devolver e cancelar) quando o pedido já tem contas a pagar lançadas. Compras escolhe
-- em qual conta a pagar do mesmo fornecedor o crédito é abatido (fin_pagar.compensado sobe e entra um comentário
-- na conta para o Financeiro), ou registra que o fornecedor devolveu por fora.

create table public.compras_creditos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  fornecedor_id uuid, fornecedor_nome text,
  descricao text, numero_nfe text, pedido_id uuid, pedido_numero bigint, rnc_id uuid unique,
  valor numeric not null check (valor > 0), saldo numeric not null check (saldo >= 0),
  status text not null default 'aberto' check (status in ('aberto', 'usado')),
  usos jsonb not null default '[]'::jsonb, criado_por_nome text, created_at timestamptz not null default now());
alter table public.compras_creditos enable row level security;
create policy compras_creditos_ler on public.compras_creditos for select to authenticated
  using (public.eh_membro_empresa(empresa_id) and (public.operacao_pode(empresa_id, 'estoque.compras.visualizar') or public.operacao_pode(empresa_id, 'financeiro.contas_pagar.visualizar')));
create policy seguranca_2fa on public.compras_creditos as restrictive for all to authenticated using (public.seguranca_2fa_ok());

create or replace function public.compras_creditos_da_rnc() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare ord public.compras_registros; it jsonb; v numeric; dec text := new.dados->>'decisao';
begin
  if new.tipo <> 'rnc' or new.status <> 'resolvida' or old.status = 'resolvida' or dec not in ('abater', 'devolver_cancelar') then return null; end if;
  select * into ord from public.compras_registros where id = (new.dados->>'order_id')::uuid;
  if ord.id is null then return null; end if;
  -- Sem conta a pagar lançada ainda, o desconto já entra no valor do pedido: não precisa de crédito.
  if not exists (select 1 from public.fin_pagar f where f.empresa_id = new.empresa_id and f.origem_id = ord.id and f.status <> 'cancelado') then return null; end if;
  select x into it from jsonb_array_elements(ord.dados->'items') x where x->>'id' = new.dados->>'order_item_id';
  v := case when dec = 'abater' then coalesce((new.dados->>'valor_abatimento')::numeric, 0)
            else coalesce((new.dados->>'quantidade_bloqueada')::numeric, 0) * coalesce((it->>'valor_unitario')::numeric, 0) end;
  v := round(v, 2);
  if v <= 0 then return null; end if;
  insert into public.compras_creditos(empresa_id, fornecedor_id, fornecedor_nome, descricao, numero_nfe, pedido_id, pedido_numero, rnc_id, valor, saldo, criado_por_nome)
  values (new.empresa_id, nullif(ord.dados->>'fornecedor_id', '')::uuid, coalesce(ord.dados->>'fornecedor_nome', ord.dados->'fornecedor'->>'nome'),
    case when dec = 'abater' then 'Abatimento combinado na divergência DR-' else 'Material devolvido (divergência DR-' end || new.numero
      || case when dec = 'abater' then '' else ')' end || ' · ' || coalesce(it->>'material_nome', it->>'nome', 'item'),
    new.dados->>'numero_nfe', ord.id, ord.numero, new.id, v, v, public.almox_nome_func(auth.uid()))
  on conflict (rnc_id) do nothing;
  return null;
exception when others then raise warning 'crédito de fornecedor: %', sqlerrm; return null;
end $$;
create trigger compras_creditos_da_rnc after update on public.compras_registros
  for each row execute function public.compras_creditos_da_rnc();

create or replace function public.compras_creditos_lista(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa, 'estoque.compras.visualizar') then
    raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'fornecedor', c.fornecedor_nome, 'fornecedor_id', c.fornecedor_id, 'descricao', c.descricao,
      'numero_nfe', c.numero_nfe, 'pedido_numero', c.pedido_numero, 'criado_por', c.criado_por_nome, 'created_at', c.created_at,
      'valor', c.valor, 'saldo', c.saldo, 'status', c.status, 'usos', c.usos,
      'titulos_abertos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'descricao', coalesce(f.descricao, f.documento), 'vencimento', f.vencimento,
          'em_aberto', f.aberto, 'parcela', f.parcela, 'parcelas', f.parcelas,
          'pedido_numero', (select r.numero from public.compras_registros r where r.id = f.origem_id and r.tipo = 'pedido'),
          'situacao', case when f.aguardando_fechamento then 'fechamento' when f.cartao_id is not null then 'cartao' when f.pago > 0 then 'parcial' else 'aberta' end)
          order by f.vencimento)
        from public.fin_pagar f where f.empresa_id = c.empresa_id and f.status not in ('cancelado', 'pago') and f.aberto > 0
          and (f.fornecedor_id = c.fornecedor_id or (c.fornecedor_id is null and f.fornecedor_nome = c.fornecedor_nome))), '[]'::jsonb))
      order by c.status, c.created_at desc)
    from public.compras_creditos c where c.empresa_id = p_empresa), '[]'::jsonb);
end $$;

create or replace function public.compras_credito_usar(p_empresa uuid, p_id uuid, p_valor numeric, p_titulo uuid, p_obs text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare c public.compras_creditos; f public.fin_pagar; v_nome text := public.almox_nome_func(auth.uid());
begin
  if not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa, 'estoque.compras.editar') then
    raise exception 'Sem permissão para usar créditos.' using errcode = '42501'; end if;
  select * into c from public.compras_creditos where id = p_id and empresa_id = p_empresa for update;
  if c.id is null or c.status <> 'aberto' then raise exception 'Crédito não encontrado ou já usado.'; end if;
  if p_valor is null or p_valor <= 0 or round(p_valor, 2) <> p_valor or p_valor > c.saldo then raise exception 'Informe um valor até o saldo do crédito (%).', c.saldo; end if;
  if p_titulo is null then
    if length(trim(coalesce(p_obs, ''))) < 3 then raise exception 'Escreva como o fornecedor devolveu.'; end if;
  else
    select * into f from public.fin_pagar where id = p_titulo and empresa_id = p_empresa for update;
    if f.id is null or f.status in ('cancelado', 'pago') then raise exception 'Conta a pagar não encontrada ou já paga.'; end if;
    if p_valor > f.aberto then raise exception 'O valor passa do que falta pagar nesta conta (%).', f.aberto; end if;
    update public.fin_pagar set compensado = compensado + p_valor, updated_at = now(),
      observacoes = concat_ws(E'\n', nullif(observacoes, ''), 'Crédito do fornecedor abatido por Compras: ' || to_char(p_valor, 'FM999G999G990D00')
        || ' (' || coalesce(c.descricao, 'crédito') || ')' || coalesce(' · ' || nullif(trim(p_obs), ''), '') || ' · ' || coalesce(v_nome, ''))
     where id = f.id;
  end if;
  update public.compras_creditos set saldo = saldo - p_valor, status = case when saldo - p_valor <= 0 then 'usado' else 'aberto' end,
    usos = usos || jsonb_build_array(jsonb_build_object('em', now(), 'valor', p_valor, 'titulo', case when f.id is not null then coalesce(f.descricao, f.documento) end,
      'titulo_id', f.id, 'obs', nullif(trim(coalesce(p_obs, '')), ''), 'por', v_nome))
   where id = c.id returning * into c;
  return jsonb_build_object('saldo', c.saldo, 'status', c.status);
end $$;
