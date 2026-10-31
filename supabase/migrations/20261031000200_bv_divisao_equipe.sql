-- BV dividido por pessoa (31/out/2026).
-- Regra padrão: pedido com equipe (observacoes.equipe_id) usa o percentual da TITULAR da equipe (vigência na criação do
-- pedido) e 100% vai para ela; sem equipe, como antes (percentual e BV de quem fez o pedido).
-- No pedido (Financeiro e pagamentos) dá para: dividir o BV entre as pessoas (observacoes.bv.partes, em pontos
-- percentuais da locação que somam o BV do pedido) e negociar um BV diferente só neste pedido
-- (observacoes.bv.manual = true + percentual + observacao).
-- Cada pessoa ganha o seu título de BV em Contas a Pagar (fin_bv_partes) e o vê na própria conta corrente.

create table if not exists public.fin_bv_partes (
  pedido_id uuid not null,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes_empresas(id),
  percentual numeric not null default 0 check (percentual >= 0 and percentual <= 100),
  valor numeric not null default 0,
  pagar_id uuid references public.fin_pagar(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pedido_id, cliente_id)
);
create index if not exists fin_bv_partes_cliente on public.fin_bv_partes (empresa_id, cliente_id);
create index if not exists fin_bv_partes_pagar on public.fin_bv_partes (pagar_id);
alter table public.fin_bv_partes enable row level security;
drop policy if exists fin_bv_partes_ler on public.fin_bv_partes;
create policy fin_bv_partes_ler on public.fin_bv_partes for select to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.fin_pode(empresa_id, 'financeiro.fluxo.visualizar'));
drop policy if exists seguranca_2fa on public.fin_bv_partes;
create policy seguranca_2fa on public.fin_bv_partes as restrictive for all to authenticated
  using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));
grant select on public.fin_bv_partes to authenticated;

alter table public.fin_bv_comissoes add column if not exists manual boolean not null default false;
alter table public.fin_bv_comissoes add column if not exists observacao text;

-- o BV que já existia vira uma parte só, de quem já recebia
insert into public.fin_bv_partes (pedido_id, empresa_id, cliente_id, percentual, valor, pagar_id, ativo)
select b.pedido_id, b.empresa_id, b.cliente_id, b.percentual, b.valor, b.pagar_id, b.ativo
  from public.fin_bv_comissoes b
 where b.valor > 0 or b.pagar_id is not null
on conflict do nothing;

create or replace function public.fin_uuid(p text) returns uuid language sql immutable as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

-- quem recebe por padrão e com qual percentual (sem conferir permissão: uso interno)
create or replace function public.fin_bv_regra(p_empresa uuid, p_cliente uuid, p_equipe uuid, p_criado timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare tit uuid; eq_nome text; benef uuid;
begin
  if p_equipe is not null then
    select titular_id, nome into tit, eq_nome from clientes_equipes where id = p_equipe and empresa_id = p_empresa;
  end if;
  benef := coalesce(tit, p_cliente);
  return jsonb_build_object(
    'beneficiario_id', benef,
    'beneficiario_nome', (select nome_razao from clientes_empresas where id = benef and empresa_id = p_empresa),
    'pela_titular', tit is not null and tit is distinct from p_cliente,
    'equipe_nome', eq_nome,
    'percentual', case when benef is null then 0 else public.fin_bv_percentual_na_criacao(p_empresa, benef, coalesce(p_criado, now())) end);
end $$;
revoke all on function public.fin_bv_regra(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.fin_bv_sincronizar() returns trigger
language plpgsql security definer set search_path = public as $$
declare c clientes_empresas%rowtype; b fin_bv_comissoes%rowtype; cfg jsonb; equipe uuid; tit uuid; benef uuid;
  manual boolean; pct numeric; base numeric; total numeric; categoria uuid; titulo uuid; titulo_benef uuid; elegivel boolean;
  desejadas jsonb := '[]'; item jsonb; soma numeric := 0; distribuido numeric := 0; n int; i int := 0; vparte numeric;
  r record; t fin_pagar%rowtype; obs text;
  flag_anterior text := current_setting('app.bv_sync', true);
begin
  select * into b from fin_bv_comissoes where pedido_id = new.id for update;
  elegivel := coalesce(new.status_comercial, '') in ('aprovado', 'enviado', 'finalizado');
  cfg := case when jsonb_typeof(new.observacoes->'bv') = 'object' then new.observacoes->'bv' else '{}' end;
  equipe := public.fin_uuid(new.observacoes->>'equipe_id');
  if equipe is not null then select titular_id into tit from clientes_equipes where id = equipe and empresa_id = new.empresa_id; end if;
  benef := coalesce(tit, new.cliente_id);
  select * into c from clientes_empresas where id = benef and empresa_id = new.empresa_id;

  if not elegivel or c.id is null then
    if b.pedido_id is not null then
      if exists (select 1 from fin_bv_partes pt join fin_pagar tt on tt.id = pt.pagar_id where pt.pedido_id = new.id and pt.ativo and coalesce(tt.pago, 0) > 0) then
        raise exception 'Estorne os pagamentos de BV antes de cancelar ou reabrir este pedido.';
      end if;
      perform set_config('app.bv_sync', 'sim', true);
      update fin_bv_comissoes set ativo = false, updated_at = now() where pedido_id = new.id;
      update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelamento_motivo = 'Pedido fora dos status de comissão'
        where id in (select pagar_id from fin_bv_partes where pedido_id = new.id and pagar_id is not null) and status <> 'cancelado';
      update fin_bv_partes set ativo = false, updated_at = now() where pedido_id = new.id;
      perform set_config('app.bv_sync', coalesce(flag_anterior, ''), true);
    end if;
    return new;
  end if;

  manual := coalesce(cfg->>'manual', '') = 'true';
  if manual then
    begin pct := round((cfg->>'percentual')::numeric, 4); exception when others then pct := null; end;
    if pct is null or pct < 0 or pct > 100 then raise exception 'Informe o BV negociado deste pedido (entre 0 e 100%%).'; end if;
  elsif b.pedido_id is null or b.cliente_id is distinct from benef or b.manual then
    pct := public.fin_bv_percentual_na_criacao(new.empresa_id, benef, new.criado_em);
  else
    pct := b.percentual;
  end if;
  base := fin_bv_base(new.observacoes, new.valor_total);
  if base::text in ('NaN', 'Infinity', '-Infinity') then raise exception 'Base de locação inválida para o BV.'; end if;
  total := round(base * pct / 100, 2);

  -- divisão: a do pedido, senão 100% para quem recebe por padrão
  if jsonb_typeof(cfg->'partes') = 'array' and jsonb_array_length(cfg->'partes') > 0 then
    for item in select value from jsonb_array_elements(cfg->'partes') loop
      declare cid uuid := public.fin_uuid(item->>'cliente_id'); pp numeric;
      begin
        begin pp := round((item->>'percentual')::numeric, 4); exception when others then pp := null; end;
        if cid is null or pp is null or pp < 0 then raise exception 'Divisão do BV inválida.'; end if;
        if cid is distinct from new.cliente_id and cid is distinct from benef
           and not exists (select 1 from clientes_equipe_membros m where m.equipe_id = equipe and m.cliente_id = cid) then
          raise exception 'Só quem fez o pedido e as pessoas da equipe podem receber parte do BV.';
        end if;
        if exists (select 1 from jsonb_array_elements(desejadas) d where d->>'cliente_id' = cid::text) then
          raise exception 'A mesma pessoa aparece duas vezes na divisão do BV.';
        end if;
        soma := soma + pp;
        if pp > 0 then desejadas := desejadas || jsonb_build_array(jsonb_build_object('cliente_id', cid, 'percentual', pp)); end if;
      end;
    end loop;
    if abs(soma - pct) > 0.005 then
      raise exception '%', format('A divisão do BV soma %s%%, mas o BV do pedido é %s%%. Ajuste a divisão em Financeiro e pagamentos.', round(soma, 2), round(pct, 2));
    end if;
  elsif pct > 0 then
    desejadas := jsonb_build_array(jsonb_build_object('cliente_id', benef, 'percentual', pct));
  end if;

  -- conferir o que já foi pago antes de mudar qualquer coisa
  n := jsonb_array_length(desejadas);
  for r in select pt.*, coalesce(tt.pago, 0) pago from fin_bv_partes pt left join fin_pagar tt on tt.id = pt.pagar_id where pt.pedido_id = new.id loop
    select d into item from jsonb_array_elements(desejadas) d where d->>'cliente_id' = r.cliente_id::text;
    if item is null and r.pago > 0 then
      raise exception 'Estorne os pagamentos de BV de % antes de tirá-la da divisão.', (select nome_razao from clientes_empresas where id = r.cliente_id);
    end if;
  end loop;

  perform set_config('app.bv_sync', 'sim', true);
  if n > 0 then
    insert into fin_categorias(empresa_id, nome, tipo, chave, ordem)
      values (new.empresa_id, 'Comissões de decoradores (BV)', 'saida', 'bv_decoradores', 90)
      on conflict (empresa_id, chave) where chave is not null do nothing;
    select id into categoria from fin_categorias where empresa_id = new.empresa_id and chave = 'bv_decoradores';
  end if;
  -- quem saiu da divisão: título cancelado
  for r in select * from fin_bv_partes pt where pt.pedido_id = new.id
             and not exists (select 1 from jsonb_array_elements(desejadas) d where d->>'cliente_id' = pt.cliente_id::text) loop
    update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelamento_motivo = 'Fora da divisão do BV'
      where id = r.pagar_id and status <> 'cancelado';
    update fin_bv_partes set ativo = false, updated_at = now() where pedido_id = r.pedido_id and cliente_id = r.cliente_id;
  end loop;
  -- quem está na divisão: um título para cada pessoa (o último leva o arredondamento)
  for item in select value from jsonb_array_elements(desejadas) loop
    i := i + 1; t := null;
    vparte := case when i = n then total - distribuido else round(base * (item->>'percentual')::numeric / 100, 2) end;
    distribuido := distribuido + vparte;
    declare cid uuid := (item->>'cliente_id')::uuid; pp numeric := (item->>'percentual')::numeric; nome text; atual fin_bv_partes%rowtype;
    begin
      select nome_razao into nome from clientes_empresas where id = cid and empresa_id = new.empresa_id;
      select * into atual from fin_bv_partes where pedido_id = new.id and cliente_id = cid;
      obs := pp || '% sobre a locação de ' || base || case when pp <> pct then ' (parte do BV de ' || pct || '%)' else '' end
        || case when manual then ' · negociado no pedido' else '' end;
      titulo := atual.pagar_id;
      if titulo is not null then select * into t from fin_pagar where id = titulo for update; end if;
      if vparte <= 0 then
        if coalesce(t.pago, 0) > 0 then raise exception 'O BV de % já tem pagamento. Estorne antes de zerar.', nome; end if;
        if titulo is not null then update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelamento_motivo = 'BV sem valor a pagar' where id = titulo; end if;
      elsif titulo is null then
        insert into fin_pagar(empresa_id, origem, origem_id, fornecedor_id, fornecedor_nome, descricao, documento,
          emissao, competencia, vencimento, valor, categoria_id, observacoes)
        values (new.empresa_id, 'bv', new.id, cid, nome, 'BV · Pedido ' || new.numero_pedido, new.numero_pedido,
          current_date, new.data_evento, coalesce(new.data_evento, current_date), vparte, categoria, obs)
        returning id into titulo;
      else
        if vparte < coalesce(t.pago, 0) then
          raise exception 'O BV de % ficaria em % e já foram pagos %. Estorne a diferença antes.', nome, vparte, t.pago;
        end if;
        update fin_pagar set fornecedor_id = cid, fornecedor_nome = nome, valor = vparte,
          descricao = 'BV · Pedido ' || new.numero_pedido, documento = new.numero_pedido,
          competencia = new.data_evento, vencimento = coalesce(new.data_evento, current_date),
          status = case when pago >= vparte then 'pago' when pago > 0 then 'parcial'
            when status in ('cancelado', 'pago', 'parcial') then 'pendente' else status end,
          cancelado_em = null, cancelamento_motivo = null, observacoes = obs where id = titulo;
      end if;
      insert into fin_bv_partes(pedido_id, empresa_id, cliente_id, percentual, valor, pagar_id, ativo)
        values (new.id, new.empresa_id, cid, pp, greatest(vparte, 0), titulo, vparte > 0)
        on conflict (pedido_id, cliente_id) do update set percentual = excluded.percentual, valor = excluded.valor,
          pagar_id = excluded.pagar_id, ativo = excluded.ativo, updated_at = now();
      if cid = benef then titulo_benef := titulo; elsif titulo_benef is null then titulo_benef := titulo; end if;
    end;
  end loop;

  insert into fin_bv_comissoes(pedido_id, empresa_id, cliente_id, percentual, base_locacao, valor, pagar_id, manual, observacao)
    values (new.id, new.empresa_id, benef, pct, base, total, titulo_benef, manual, nullif(trim(cfg->>'observacao'), ''))
    on conflict (pedido_id) do update set cliente_id = excluded.cliente_id, percentual = excluded.percentual,
      base_locacao = excluded.base_locacao, valor = excluded.valor, pagar_id = excluded.pagar_id, ativo = true,
      manual = excluded.manual, observacao = excluded.observacao, updated_at = now();
  if b.pedido_id is null or (b.base_locacao, b.valor, b.cliente_id, b.ativo, b.percentual, b.manual) is distinct from (base, total, benef, true, pct, manual) then
    perform fin_auditar(new.empresa_id, 'fin_bv_comissoes', new.id, 'calculo', to_jsonb(b),
      jsonb_build_object('base', base, 'percentual', pct, 'valor', total, 'cliente_id', benef, 'manual', manual, 'partes', desejadas), 'BV calculado pelo pedido');
  end if;
  perform set_config('app.bv_sync', coalesce(flag_anterior, ''), true);
  return new;
end $$;

-- linhas de BV por pessoa (uma por parte; pedido sem BV registrado aparece para quem fez)
create or replace function public.fin_bv_linhas(p_empresa uuid, p_cliente uuid, p_todos boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.data_evento desc nulls last, x.numero_pedido desc), '[]') from (
    select p.id, coalesce(pt.pagar_id::text, p.id::text || coalesce(':' || pt.cliente_id::text, '')) linha_id,
      p.numero_pedido, coalesce(pt.cliente_id, b.cliente_id, p.cliente_id) cliente_id,
      coalesce(cp.nome_razao, cb.nome_razao, p.cliente_nome) cliente_nome, p.cliente_nome feito_por,
      p.data_evento, p.status_comercial,
      coalesce(b.base_locacao, fin_bv_base(p.observacoes, p.valor_total)) base_locacao,
      coalesce(pt.percentual, b.percentual) percentual, b.percentual percentual_total,
      coalesce(pt.valor, case when pt.pedido_id is null then b.valor end) valor, coalesce(t.pago, 0) pago,
      case when coalesce(pt.ativo, b.ativo) and b.ativo and t.status <> 'cancelado' then coalesce(t.aberto, 0) else 0 end saldo,
      coalesce(pt.pagar_id, case when pt.pedido_id is null then b.pagar_id end) pagar_id, t.status status_pagamento,
      coalesce(pt.ativo, b.ativo, false) and coalesce(b.ativo, false) ativo,
      case when b.pedido_id is not null then 'registrado' else 'sem_registro' end registro,
      coalesce(b.manual, false) manual, b.observacao bv_observacao,
      (select count(*) from fin_bv_partes x where x.pedido_id = p.id and x.ativo) partes
    from separacoes_pedidos p
    left join fin_bv_comissoes b on b.pedido_id = p.id and b.empresa_id = p.empresa_id
    left join fin_bv_partes pt on pt.pedido_id = p.id and pt.empresa_id = p.empresa_id
    left join clientes_empresas cp on cp.id = pt.cliente_id
    left join clientes_empresas cb on cb.id = b.cliente_id
    left join fin_pagar t on t.id = coalesce(pt.pagar_id, case when pt.pedido_id is null then b.pagar_id end) and t.empresa_id = p.empresa_id
    where p.empresa_id = p_empresa
      and (p_cliente is null or coalesce(pt.cliente_id, b.cliente_id, p.cliente_id) = p_cliente)
      and (p_todos or pt.pedido_id is not null or coalesce(b.percentual, 0) > 0
           or exists (select 1 from clientes_empresas c where c.id = coalesce(b.cliente_id, p.cliente_id) and c.bv_recebe))) x
$$;
revoke all on function public.fin_bv_linhas(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.fin_bv_extrato(p_empresa uuid, p_cliente uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare clientes jsonb; pagamentos jsonb;
begin
  if not public.eh_membro_empresa(p_empresa) or not public.fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then
    raise exception 'Sem permissão para ver o extrato de BV' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.nome_razao), '[]') into clientes from
    (select c.id, c.nome_razao, c.catalogo_logo_url, c.bv_recebe, c.bv_percentual from clientes_empresas c where c.empresa_id = p_empresa
      and (c.bv_recebe or exists (select 1 from fin_bv_partes pt where pt.empresa_id = p_empresa and pt.cliente_id = c.id and pt.percentual > 0))) c;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.data desc, x.created_at desc), '[]') into pagamentos from (
    select f.id, f.pagar_id, f.data, f.valor, f.liquido, f.forma, f.observacoes, f.estornado_em, f.estorno_motivo,
      f.created_at, c.nome conta, p.numero_pedido, pt.cliente_id, cl.nome_razao cliente_nome
    from fin_baixas f join fin_bv_partes pt on pt.pagar_id = f.pagar_id and pt.empresa_id = f.empresa_id
    join separacoes_pedidos p on p.id = pt.pedido_id and p.empresa_id = pt.empresa_id
    join clientes_empresas cl on cl.id = pt.cliente_id and cl.empresa_id = pt.empresa_id
    left join fin_contas c on c.id = f.conta_id and c.empresa_id = f.empresa_id
    where f.empresa_id = p_empresa and (p_cliente is null or pt.cliente_id = p_cliente)) x;
  return jsonb_build_object('clientes', clientes, 'pedidos', public.fin_bv_linhas(p_empresa, p_cliente, false), 'pagamentos', pagamentos);
end $$;

create or replace function public.fin_conta_cliente_extrato_sem_compensacoes(p_empresa uuid, p_cliente uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare dados jsonb; clientes jsonb; creditos jsonb; pagamentos jsonb;
begin
  dados := public.fin_bv_extrato(p_empresa, p_cliente); -- confere a permissão financeira e a empresa
  select coalesce(jsonb_agg(to_jsonb(c) order by c.nome_razao), '[]') into clientes from
    (select id, nome_razao, catalogo_logo_url, bv_recebe, bv_percentual from clientes_empresas where empresa_id = p_empresa) c;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.emissao desc, t.created_at desc), '[]') into creditos
    from fin_pagar t where t.empresa_id = p_empresa and t.origem = 'credito_cliente' and (p_cliente is null or t.fornecedor_id = p_cliente);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.data desc, x.created_at desc), '[]') into pagamentos from (
    select f.id, f.pagar_id, f.data, f.valor, f.liquido, f.forma, f.observacoes, f.estornado_em, f.estorno_motivo, f.created_at,
      c.nome conta, null::text numero_pedido, t.fornecedor_id cliente_id, t.fornecedor_nome cliente_nome, t.descricao origem_descricao
    from fin_baixas f join fin_pagar t on t.id = f.pagar_id and t.empresa_id = f.empresa_id
    left join fin_contas c on c.id = f.conta_id and c.empresa_id = f.empresa_id
    where f.empresa_id = p_empresa and t.origem = 'credito_cliente' and (p_cliente is null or t.fornecedor_id = p_cliente)) x;
  return dados || jsonb_build_object('clientes', clientes, 'creditos', creditos, 'pedidos', public.fin_bv_linhas(p_empresa, p_cliente, true),
    'pagamentos', coalesce(dados->'pagamentos', '[]') || pagamentos);
end $$;

create or replace function public.pedido_saldo_conta_cliente(p_empresa uuid, p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare bv numeric; credito numeric;
begin
  if not eh_membro_empresa(p_empresa) or not (
    (funcionario_pode(p_empresa, auth.uid(), 'comercial.pedidos.visualizar') and funcionario_pode(p_empresa, auth.uid(), 'comercial.pedidos.valores'))
    or fin_pode(p_empresa, 'financeiro.fluxo.visualizar')) then
    raise exception 'Sem permissão para consultar o saldo do cliente' using errcode = '42501'; end if;
  if not exists (select 1 from clientes_empresas where id = p_cliente and empresa_id = p_empresa) then
    raise exception 'Cliente não encontrado nesta empresa'; end if;
  select coalesce(sum(aberto) filter (where origem = 'bv' and exists (
    select 1 from fin_bv_partes pt where pt.pagar_id = t.id and pt.empresa_id = p_empresa and pt.cliente_id = p_cliente and pt.ativo)), 0),
    coalesce(sum(aberto) filter (where origem = 'credito_cliente'), 0)
    into bv, credito from fin_pagar t where empresa_id = p_empresa and fornecedor_id = p_cliente
      and origem in ('bv', 'credito_cliente') and status <> 'cancelado';
  return jsonb_build_object('bv', bv, 'credito', credito, 'total', bv + credito);
end $$;

-- tela do pedido: regra do BV, o que já está registrado (com o pago de cada parte) e as pessoas da equipe
create or replace function public.pedido_bv_regra(p_empresa uuid, p_pedido uuid, p_cliente uuid, p_equipe uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare criado timestamptz; regra jsonb; reg jsonb; membros jsonb;
begin
  if not eh_membro_empresa(p_empresa) or not (
    funcionario_pode(p_empresa, auth.uid(), 'comercial.pedidos.visualizar') or fin_pode(p_empresa, 'financeiro.fluxo.visualizar')) then
    raise exception 'Sem permissão' using errcode = '42501'; end if;
  if p_pedido is not null then select criado_em into criado from separacoes_pedidos where id = p_pedido and empresa_id = p_empresa; end if;
  regra := public.fin_bv_regra(p_empresa, p_cliente, p_equipe, criado);
  if p_pedido is not null then
    select jsonb_build_object('percentual', b.percentual, 'base', b.base_locacao, 'valor', b.valor, 'manual', b.manual, 'ativo', b.ativo,
      'cliente_id', b.cliente_id,
      'partes', coalesce((select jsonb_agg(jsonb_build_object('cliente_id', pt.cliente_id, 'nome', c.nome_razao, 'percentual', pt.percentual,
         'valor', pt.valor, 'pago', coalesce(t.pago, 0), 'ativo', pt.ativo) order by pt.created_at)
         from fin_bv_partes pt join clientes_empresas c on c.id = pt.cliente_id left join fin_pagar t on t.id = pt.pagar_id
         where pt.pedido_id = b.pedido_id), '[]'))
      into reg from fin_bv_comissoes b where b.pedido_id = p_pedido and b.empresa_id = p_empresa;
    -- BV já registrado e mesma pessoa: o percentual fica o que foi gravado no pedido
    if reg is not null and not coalesce((reg->>'manual')::boolean, false) and (reg->>'cliente_id') = (regra->>'beneficiario_id') then
      regra := regra || jsonb_build_object('percentual', (reg->>'percentual')::numeric);
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('cliente_id', c.id, 'nome', c.nome_razao, 'papel', pa.nome) order by c.nome_razao), '[]')
    into membros from clientes_equipe_membros m join clientes_empresas c on c.id = m.cliente_id
    left join clientes_equipe_papeis pa on pa.id = m.papel_id
    where m.equipe_id = p_equipe and m.empresa_id = p_empresa;
  return jsonb_build_object('regra', regra, 'registrado', reg, 'membros', membros);
end $$;
revoke all on function public.pedido_bv_regra(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.pedido_bv_regra(uuid, uuid, uuid, uuid) to authenticated;
