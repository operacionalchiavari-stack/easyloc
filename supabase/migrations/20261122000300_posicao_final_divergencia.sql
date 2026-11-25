-- Parâmetros (22/11/2026, pedido do usuário): "Enviar o pedido para a Posição final com divergência de contagem ainda não
-- concluída? Sim / Não". Com "Não", o pedido só aparece na fila da Posição final quando todas as faltas/sobras da contagem
-- (do pedido e dos extras) estiverem resolvidas na Gestão do acervo. Pedido com a posição já confirmada continua aparecendo.
alter table public.empresa_fluxo_pedidos add column if not exists posicao_com_divergencia boolean not null default true;

create or replace function public.pedido_posicao_bloqueada(p public.separacoes_pedidos) returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce((select not f.posicao_com_divergencia from empresa_fluxo_pedidos f where f.empresa_id=p.empresa_id),false)
  and not exists(select 1 from fin_posicoes_finais x where x.pedido_id=p.id and x.status='confirmado')
  and exists(select 1 from operacao_ocorrencias o where o.tipo in ('falta','sobra') and o.resolvida_em is null
             and (o.pedido_id=p.id or o.pedido_id in (select e.id from separacoes_pedidos e where e.pedido_origem_id=p.id)));
$$;
revoke all on function public.pedido_posicao_bloqueada(public.separacoes_pedidos) from public,anon,authenticated;

create or replace function public.pedido_posicao_divergencia_salvar(p_empresa uuid,p_permitir boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not operacao_pode(p_empresa,'configuracoes.empresa.editar') then raise exception 'Sem permissão.'; end if;
 insert into empresa_fluxo_pedidos(empresa_id,posicao_com_divergencia,atualizado_em,atualizado_por) values(p_empresa,coalesce(p_permitir,true),now(),auth.uid())
 on conflict(empresa_id) do update set posicao_com_divergencia=excluded.posicao_com_divergencia,atualizado_em=now(),atualizado_por=auth.uid();
end $$;
revoke all on function public.pedido_posicao_divergencia_salvar(uuid,boolean) from public,anon;
grant execute on function public.pedido_posicao_divergencia_salvar(uuid,boolean) to authenticated;

create or replace function public.pedido_fluxo_fila(p_empresa uuid, p_setor text, p_de integer DEFAULT 0, p_limite integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare resultado jsonb; pre boolean;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso à empresa'; end if;
 if p_setor is null or p_setor not in ('triagem','expedicao','entrega','coleta','entregas_coletas','posicao_final','montagem_equipe') then raise exception 'Setor inválido'; end if;
 if p_setor='montagem_equipe' then
  if not (funcionario_pode(p_empresa,auth.uid(),'logistica.planejamento.visualizar') or funcionario_pode(p_empresa,auth.uid(),'logistica.cronograma.visualizar')) then raise exception 'Sem permissao para consultar o planejamento'; end if;
 elsif p_setor='posicao_final' then
  if not fin_pode(p_empresa,'financeiro.fluxo.visualizar') then raise exception 'Sem permissão financeira'; end if;
 elsif not funcionario_tabela_permitida(p_empresa,case when p_setor='triagem' then 'separacoes_itens' else 'separacoes_pedidos' end,'select') then raise exception 'Sem permissão para consultar esta fila'; end if;
 select pre_reservas_consulta into pre from empresa_fluxo_pedidos where empresa_id=p_empresa;
 with candidatos as(select p,pedido_fluxo_etapa(p) etapa from separacoes_pedidos p where p.empresa_id=p_empresa),
 fila as(select p,etapa from candidatos where
  -- pedido extra: da coleta em diante é tratado no pedido principal
  not (p_setor<>'montagem_equipe' and (p).pedido_origem_id is not null and etapa in ('coleta','retorno_simultaneo','descarregamento','triagem_retorno','posicao_final')) and (
  (p_setor='montagem_equipe' and etapa in ('triagem','expedicao','entrega','coleta','retorno_simultaneo','descarregamento','triagem_retorno','posicao_final')) or
  (p_setor='triagem' and etapa in ('triagem','triagem_retorno','retorno_simultaneo')) or
   -- Separado e ainda não carregado: continua na Triagem, em Concluídos, até a Expedição começar o carregamento.
   (p_setor='triagem' and etapa='expedicao' and (p).operacao->'carregamento'->>'iniciado_em' is null
    and not exists(select 1 from separacoes_etiquetas e where e.separacao_pedido_id=(p).id and e.lida_carregamento_em is not null)) or
  (p_setor='expedicao' and etapa in ('expedicao','descarregamento','retorno_simultaneo')) or
   -- Carregado: continua na Expedição, em Conferido, até a entrega ser confirmada; descarregado, até a triagem da volta começar.
   (p_setor='expedicao' and etapa='entrega' and (p).operacao->'carregamento'->>'concluido_em' is not null
    and not exists(select 1 from logistica_confirmacoes l where l.pedido_id=(p).id and l.etapa='entrega')) or
   (p_setor='expedicao' and etapa in ('triagem_retorno','posicao_final') and (p).operacao->'descarregamento'->>'concluido_em' is not null
    and (p).operacao->'retorno'->>'iniciado_em' is null and (p).operacao->'retorno'->>'concluido_em' is null and (p).encerrado_operacional_em is null) or
  (etapa=p_setor and not (p_setor='posicao_final' and pedido_posicao_bloqueada(p))) or (p_setor='entregas_coletas' and etapa in ('entrega','coleta')) or
  (coalesce(pre,false) and etapa='pre_reserva' and p_setor in ('triagem','montagem_equipe')
   and ((p).pre_reserva_ate is null or (p).pre_reserva_ate>=(now() at time zone 'America/Sao_Paulo')::date))
) order by (p).data_entrega nulls last,(p).id offset greatest(p_de,0) limit least(greatest(p_limite,1),1000))
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('fluxo_etapa',etapa,'somente_consulta',etapa='pre_reserva')),'[]') into resultado from fila;
 return resultado;
end $function$
;
notify pgrst,'reload schema';
