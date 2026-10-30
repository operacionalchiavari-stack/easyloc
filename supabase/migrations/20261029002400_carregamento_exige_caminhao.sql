-- Carregamento só começa com caminhão programado (out/2026).
-- Pedido do usuário: "dentro de expedição, não pode iniciar um carregamento se não tiver o caminhão programado;
-- coloca em parâmetros essa função de ativar carregamento sem programação".
-- Parâmetro: empresa_logistica_regras.carregamento_sem_programacao (padrão false = exige caminhão).
-- "Programado" = algum caminhão escalado (Painel Logístico) na etapa Carregamento ou Montagem do pedido
-- (a mesma regra de operacao_caminhoes_programados, que a Expedição mostra no cartão).

alter table public.empresa_logistica_regras add column if not exists carregamento_sem_programacao boolean not null default false;

create or replace function public.operacao_tem_caminhao_programado(p_pedido uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from operacao_etapas e join operacao_etapa_caminhoes ec on ec.etapa_id = e.id
                 where e.pedido_id = p_pedido and e.tipo in ('carregamento','montagem'));
$$;
revoke all on function public.operacao_tem_caminhao_programado(uuid) from public, anon, authenticated;

create or replace function public.operacao_caminhao_conferir(p_pedido uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_emp uuid; v_livre boolean;
begin
  select empresa_id into v_emp from separacoes_pedidos where id = p_pedido;
  if v_emp is null then return; end if;
  select coalesce(carregamento_sem_programacao, false) into v_livre from empresa_logistica_regras where empresa_id = v_emp;
  if coalesce(v_livre, false) then return; end if;
  if not operacao_tem_caminhao_programado(p_pedido) then
    raise exception 'Nenhum caminhão programado para este pedido. Programe o caminhão no Painel Logístico antes de iniciar o carregamento.';
  end if;
end $$;
revoke all on function public.operacao_caminhao_conferir(uuid) from public, anon, authenticated;

create or replace function public.operacao_iniciar_conferencia(p_pedido uuid, p_etapa text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if p_etapa='carregamento' then
    perform public.pedido_pagamento_conferir(p_pedido,'carregamento');
    perform public.operacao_caminhao_conferir(p_pedido);
  end if;
  return public.operacao_iniciar_conferencia_sem_pagamento(p_pedido,p_etapa);
end $function$;

create or replace function public.operacao_ler_peca(p_pedido uuid, p_etapa text, p_tipo text, p_codigo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if p_etapa='carregamento' then
    perform public.pedido_pagamento_conferir(p_pedido,'carregamento');
    perform public.operacao_caminhao_conferir(p_pedido);
  end if;
  return public.operacao_ler_peca_sem_pagamento(p_pedido,p_etapa,p_tipo,p_codigo);
end $function$;

create or replace function public.operacao_concluir_conferencia(p_pedido uuid, p_etapa text, p_aceitar_faltas boolean DEFAULT false, p_quantidades jsonb DEFAULT NULL::jsonb, p_observacoes jsonb DEFAULT NULL::jsonb, p_primeira jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if p_etapa='carregamento' then
    perform public.pedido_pagamento_conferir(p_pedido,'carregamento');
    perform public.operacao_caminhao_conferir(p_pedido);
  end if;
  return public.operacao_concluir_conferencia_sem_pagamento(p_pedido,p_etapa,p_aceitar_faltas,p_quantidades,p_observacoes,p_primeira);
end $function$;

-- Para a Expedição saber quais cartões travar.
create or replace function public.pedidos_sem_caminhao_bloqueados(p_pedidos uuid[]) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id), '{}') from separacoes_pedidos p
   left join empresa_logistica_regras r on r.empresa_id = p.empresa_id
   where p.id = any(p_pedidos) and eh_membro_empresa(p.empresa_id)
     and not coalesce(r.carregamento_sem_programacao, false)
     and not operacao_tem_caminhao_programado(p.id)
     and p.operacao->'carregamento'->>'concluido_em' is null;
$$;
revoke all on function public.pedidos_sem_caminhao_bloqueados(uuid[]) from public, anon;
grant execute on function public.pedidos_sem_caminhao_bloqueados(uuid[]) to authenticated;

create or replace function public.carregamento_parametros_salvar(p_empresa uuid, p_sem_programacao boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'configuracoes.empresa.editar') then raise exception 'Sem permissão para editar os parâmetros.'; end if;
  insert into empresa_logistica_regras (empresa_id, carregamento_sem_programacao) values (p_empresa, coalesce(p_sem_programacao, false))
  on conflict (empresa_id) do update set carregamento_sem_programacao = coalesce(p_sem_programacao, false), updated_at = now();
end $$;
revoke all on function public.carregamento_parametros_salvar(uuid, boolean) from public, anon;
grant execute on function public.carregamento_parametros_salvar(uuid, boolean) to authenticated;
