-- Item personalizado na Triagem (out/2026). O item com personalização vai para Produção > Ordens (producao_itens, já
-- existia). Na Triagem ele aparece no setor do próprio item, com a linha dividida: a parte normal se separa como sempre;
-- a parte em produção não tem quantidade, só o aviso "Em produção". Quando a produção termina, o separador confirma que
-- recebeu as peças. A triagem só finaliza com tudo separado E a produção confirmada.

create table if not exists public.separacao_producao_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  pedido_id uuid not null references public.separacoes_pedidos(id) on delete cascade,
  item_id uuid not null,
  quantidade numeric not null check (quantidade >= 0),
  por uuid default auth.uid(),
  por_nome text,
  em timestamptz not null default now(),
  unique (pedido_id, item_id)
);
alter table public.separacao_producao_confirmacoes enable row level security;
drop policy if exists separacao_producao_conf_ler on public.separacao_producao_confirmacoes;
create policy separacao_producao_conf_ler on public.separacao_producao_confirmacoes for select to authenticated using (public.eh_membro_empresa(empresa_id));
drop policy if exists seguranca_2fa on public.separacao_producao_confirmacoes;
create policy seguranca_2fa on public.separacao_producao_confirmacoes as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));

-- unidades em produção por pedido + item da linha (Kit personalizado: em kits)
create or replace function public.separacao_producao_calc(p_pedido uuid) returns table(item_id uuid, unidades numeric, prontas numeric, confirmadas numeric, personalizacoes text)
language sql stable security definer set search_path = public as $$
  with pi as (
    select (t.origem->>'item_id')::uuid item_id, coalesce(nullif(t.origem->>'quantidade', '')::numeric, 1) qtd,
           exists (select 1 from producao_etapas e where e.producao_item_id = t.id and e.estado <> 'cancelada')
             and not exists (select 1 from producao_etapas e where e.producao_item_id = t.id and e.estado not in ('concluida', 'cancelada')) pronta,
           coalesce(t.snapshot->'personalizacao'->>'tipo', (select p.tipo from personalizacoes p where p.id = nullif(t.origem->>'personalizacao_id', '')::uuid)) nome
      from producao_itens t
     where t.pedido_id = p_pedido and not t.cancelado and coalesce(t.pendente->>'removido', '') <> 'true' and nullif(t.origem->>'item_id', '') is not null
  )
  select pi.item_id, sum(pi.qtd), sum(case when pi.pronta then pi.qtd else 0 end),
         coalesce((select c.quantidade from separacao_producao_confirmacoes c where c.pedido_id = p_pedido and c.item_id = pi.item_id), 0),
         string_agg(distinct pi.nome, ', ')
    from pi group by pi.item_id
$$;
revoke all on function public.separacao_producao_calc(uuid) from public, anon, authenticated;

create or replace function public.separacao_producao(p_pedidos uuid[]) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select jsonb_agg(jsonb_build_object('pedido_id', p.id, 'item_id', c.item_id, 'unidades', c.unidades, 'prontas', c.prontas,
            'confirmadas', least(c.confirmadas, c.unidades), 'personalizacoes', c.personalizacoes))
     from separacoes_pedidos p cross join lateral separacao_producao_calc(p.id) c
    where p.id = any(p_pedidos) and eh_membro_empresa(p.empresa_id)), '[]');
end $$;
grant execute on function public.separacao_producao(uuid[]) to authenticated;

-- o separador confirma que recebeu da produção as peças que ficaram prontas
create or replace function public.separacao_producao_confirmar(p_pedido uuid, p_item uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p separacoes_pedidos; c record; meus jsonb; setores text[];
begin
  select * into p from separacoes_pedidos where id = p_pedido for update;
  if p.id is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id, 'separacoes_itens', 'editar') then raise exception 'Sem permissão para separar'; end if;
  if p.status in ('separado', 'separado_com_divergencia') then raise exception 'Separação finalizada'; end if;
  select * into c from separacao_producao_calc(p.id) x where x.item_id = p_item;
  if c.item_id is null then raise exception 'Este item não está em produção.'; end if;
  if c.prontas <= c.confirmadas then raise exception 'A produção ainda não terminou estas peças.'; end if;
  meus := separacao_meus_setores(p.empresa_id);
  if meus is not null then
    select array_agg(distinct separacao_setor_item(k.item_id)) into setores from kit_itens k where k.kit_id = p_item;
    if setores is null then setores := array[separacao_setor_item(p_item)]; end if;
    if not exists (select 1 from unnest(setores) s where meus ? s) then raise exception 'Este item é do setor %, que não está liberado para você separar.', array_to_string(setores, ', '); end if;
  end if;
  insert into separacao_producao_confirmacoes (empresa_id, pedido_id, item_id, quantidade, por_nome)
  values (p.empresa_id, p.id, p_item, c.prontas, logistica_nome_usuario(p.empresa_id))
  on conflict (pedido_id, item_id) do update set quantidade = excluded.quantidade, por = auth.uid(), por_nome = excluded.por_nome, em = now();
  update separacoes_pedidos set status = case when status in ('pendente', 'aguardando') then 'em_separacao' else status end, atualizado_em = now() where id = p.id;
  return jsonb_build_object('item_id', p_item, 'confirmadas', c.prontas);
end $$;
grant execute on function public.separacao_producao_confirmar(uuid, uuid) to authenticated;

-- a parte normal nunca passa de (pedido − em produção). Igual ao embrulho anterior (pagamento + setor) + essa trava.
create or replace function public.operacao_atualizar_separacao(p_item uuid, p_dados jsonb, p_quantidade_anterior numeric, p_componentes_anteriores jsonb default '{}'::jsonb, p_etiqueta uuid default null::uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ped uuid; emp uuid; item uuid; meus jsonb; setores text[]; pedida numeric; prod numeric;
begin
  select separacao_pedido_id, empresa_id, item_id, quantidade_solicitada into ped, emp, item, pedida from public.separacoes_itens where id=p_item;
  if ped is not null then perform public.pedido_pagamento_conferir(ped,'triagem'); end if;
  meus:=public.separacao_meus_setores(emp);
  if meus is not null and item is not null then
    -- Kit: vale o setor dos componentes (é o que se separa); item comum: o setor dele.
    select array_agg(distinct public.separacao_setor_item(k.item_id)) into setores from public.kit_itens k where k.kit_id=item;
    if setores is null then setores:=array[public.separacao_setor_item(item)]; end if;
    if not exists(select 1 from unnest(setores) s where meus ? s) then
      raise exception 'Este item é do setor %, que não está liberado para você separar.', array_to_string(setores,', ');
    end if;
  end if;
  if ped is not null then
    select coalesce(sum(c.unidades),0) into prod from public.separacao_producao_calc(ped) c where c.item_id=item;
    if prod>0 and coalesce((p_dados->>'quantidade_separada')::numeric,0)>greatest(coalesce(pedida,0)-prod,0) then
      raise exception 'Parte deste item está em produção (personalização): separe no máximo %.', greatest(coalesce(pedida,0)-prod,0);
    end if;
  end if;
  perform public.operacao_atualizar_separacao_sem_pagamento(p_item,p_dados,p_quantidade_anterior,p_componentes_anteriores,p_etiqueta);
end $$;

-- finalizar: tudo separado + produção confirmada
create or replace function public.separacao_exigir_completa() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'separado_com_divergencia' then
    raise exception 'A triagem precisa ser finalizada com todos os itens separados.';
  end if;
  if new.status = 'separado' then
    if exists (
      select 1 from (select item_id, sum(coalesce(quantidade_solicitada, 0)) pedida, sum(coalesce(quantidade_separada, 0)) separada
                       from separacoes_itens where separacao_pedido_id = new.id group by item_id) i
      left join (select c.item_id, least(c.confirmadas, c.unidades) conf from separacao_producao_calc(new.id) c) pr on pr.item_id = i.item_id
      where i.separada + coalesce(pr.conf, 0) < i.pedida
    ) then
      if exists (select 1 from separacao_producao_calc(new.id) c where c.confirmadas < c.unidades) then
        raise exception 'Ainda há itens em produção (personalização) sem confirmação de recebimento. A triagem termina quando a produção entregar e o separador confirmar.';
      end if;
      raise exception 'Ainda há itens faltando. Separe todos os itens para finalizar a triagem.';
    end if;
  end if;
  return new;
end $$;
