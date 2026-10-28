-- Out/2026: a Expedição mostra os caminhões programados para a entrega do pedido (escala do Painel Logístico:
-- etapas Carregamento e Montagem) e, no fim do carregamento, a pessoa escolhe em qual caminhão carregou.

-- Caminhões programados de vários pedidos de uma vez (cartões da Expedição e topo da conferência).
create or replace function public.operacao_caminhoes_programados(p_pedidos uuid[])
returns table(pedido_id uuid, caminhao_id uuid, codigo text, placa text, modelo text, tipo text, foto_url text, etapas text[])
language sql stable security definer set search_path=public as $$
  select e.pedido_id, c.id, c.codigo, c.placa, c.modelo, c.tipo, c.foto_url, array_agg(distinct e.tipo order by e.tipo)
    from public.operacao_etapas e
    join public.operacao_etapa_caminhoes ec on ec.etapa_id=e.id
    join public.caminhoes c on c.id=ec.caminhao_id
   where e.pedido_id = any(p_pedidos)
     and e.tipo in ('carregamento','montagem')
     and public.eh_membro_empresa(e.empresa_id)
   group by e.pedido_id, c.id, c.codigo, c.placa, c.modelo, c.tipo, c.foto_url
   order by e.pedido_id, c.codigo nulls last, c.placa;
$$;
revoke all on function public.operacao_caminhoes_programados(uuid[]) from public, anon;
grant execute on function public.operacao_caminhoes_programados(uuid[]) to authenticated;

-- Frota da empresa para a escolha (ativos primeiro).
create or replace function public.operacao_frota(p_empresa uuid)
returns table(id uuid, codigo text, placa text, modelo text, tipo text, foto_url text)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.eh_membro_empresa(p_empresa) then raise exception 'Sem acesso à empresa'; end if;
  return query select c.id, c.codigo, c.placa, c.modelo, c.tipo, c.foto_url from public.caminhoes c
    where c.empresa_id=p_empresa and coalesce(lower(c.status),'ativo') not in ('inativo','vendido','baixado')
    order by c.codigo nulls last, c.placa;
end $$;
revoke all on function public.operacao_frota(uuid) from public, anon;
grant execute on function public.operacao_frota(uuid) to authenticated;

-- Grava os caminhões carregados em operacao.carregamento.caminhoes ([{id,codigo,placa}]), antes de concluir.
create or replace function public.operacao_registrar_caminhoes(p_pedido uuid, p_caminhoes uuid[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.separacoes_pedidos; lista jsonb;
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido for update;
  if not public.eh_membro_empresa(p.empresa_id) or not public.funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then
    raise exception 'Sem permissão para conferir';
  end if;
  if p.operacao->'carregamento'->>'concluido_em' is not null then raise exception 'O carregamento já foi concluído'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'codigo',c.codigo,'placa',c.placa,'modelo',c.modelo) order by c.codigo, c.placa),'[]')
    into lista from public.caminhoes c where c.empresa_id=p.empresa_id and c.id=any(coalesce(p_caminhoes,'{}'));
  if jsonb_array_length(lista)=0 then raise exception 'Selecione o caminhão em que o pedido foi carregado.'; end if;
  update public.separacoes_pedidos
     set operacao=jsonb_set(coalesce(operacao,'{}'),'{carregamento_caminhoes}',lista), atualizado_em=now()
   where id=p.id;
  return lista;
end $$;
revoke all on function public.operacao_registrar_caminhoes(uuid,uuid[]) from public, anon;
grant execute on function public.operacao_registrar_caminhoes(uuid,uuid[]) to authenticated;

-- Concluir o carregamento exige o caminhão escolhido; o registro da etapa leva a lista junto.
do $patch$
declare fonte text; trecho text;
begin
  fonte:=pg_get_functiondef('public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb)'::regprocedure);
  trecho:='  perform public.operacao_validar_etapa(p,p_etapa);';
  if position(trecho in fonte)=0 then raise exception 'Funcao de conferencia diferente da esperada'; end if;
  fonte:=replace(fonte,trecho,trecho||$guard$
  if p_etapa='carregamento' and jsonb_array_length(coalesce(p.operacao->'carregamento_caminhoes','[]'))=0 then
    raise exception 'Selecione o caminhão em que o pedido foi carregado.';
  end if;$guard$);
  trecho:='  update public.separacoes_pedidos set operacao=jsonb_set(coalesce(operacao,''{}''),array[p_etapa],registro),';
  if position(trecho in fonte)=0 then raise exception 'Funcao de conferencia diferente da esperada (update)'; end if;
  fonte:=replace(fonte,trecho,$add$  if p_etapa='carregamento' then registro:=registro||jsonb_build_object('caminhoes',p.operacao->'carregamento_caminhoes'); end if;
$add$||trecho);
  execute fonte;
end $patch$;
