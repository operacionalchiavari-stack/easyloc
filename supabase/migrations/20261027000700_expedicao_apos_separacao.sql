-- Expedicao recebe somente pedidos com separacao concluida; pre-reserva fica na consulta da Triagem e planejamento.
begin;
create or replace function public.pedido_fluxo_fila(p_empresa uuid,p_setor text,p_de integer default 0,p_limite integer default 500) returns jsonb
language plpgsql stable security definer set search_path=public as $$
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
  (p_setor='montagem_equipe' and etapa in ('triagem','expedicao')) or
  (p_setor='triagem' and etapa in ('triagem','triagem_retorno','retorno_simultaneo')) or
  (p_setor='expedicao' and etapa in ('expedicao','descarregamento','retorno_simultaneo')) or
  etapa=p_setor or (p_setor='entregas_coletas' and etapa in ('entrega','coleta')) or
  (coalesce(pre,false) and etapa='pre_reserva' and p_setor in ('triagem','montagem_equipe')
   and ((p).pre_reserva_ate is null or (p).pre_reserva_ate>=(now() at time zone 'America/Sao_Paulo')::date))
 order by (p).data_entrega nulls last,(p).id offset greatest(p_de,0) limit least(greatest(p_limite,1),1000))
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('fluxo_etapa',etapa,'somente_consulta',etapa='pre_reserva')),'[]') into resultado from fila;
 return resultado;
end $$;

commit;
