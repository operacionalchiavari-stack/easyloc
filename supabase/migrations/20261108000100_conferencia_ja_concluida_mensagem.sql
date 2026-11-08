-- Nov/2026: conferência já concluída tentando concluir de novo (botão "conferir de novo") mostrava
-- "Confirme a coleta antes do descarregamento", sem sentido. Mensagem clara antes de olhar a etapa.
CREATE OR REPLACE FUNCTION public.operacao_validar_etapa(p separacoes_pedidos, p_etapa text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare etapa text; simultaneo boolean;
begin
 if p.encerrado_operacional_em is not null then raise exception 'Operação encerrada'; end if;
 if coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') then raise exception 'Pré-reserva e orçamento são somente consulta. Reserve o pedido para executar'; end if;
 if p.reducao_liberada_em is not null then raise exception 'Pedido aguardando revisão do Comercial'; end if;
 if p_etapa in ('carregamento','descarregamento','retorno') and p.operacao->p_etapa->>'concluido_em' is not null then
  raise exception 'Esta conferência já foi concluída em %. Atualize a tela.', to_char((p.operacao->p_etapa->>'concluido_em')::timestamptz at time zone 'America/Sao_Paulo','DD/MM/YYYY "às" HH24:MI');
 end if;
 etapa:=pedido_fluxo_etapa(p);
 if p_etapa='carregamento' then
  if etapa<>'expedicao' then raise exception 'Finalize a separação antes do carregamento. Etapa atual: %',etapa; end if;
 elsif p_etapa='descarregamento' then
  if etapa not in ('descarregamento','retorno_simultaneo') then raise exception 'Confirme a coleta antes do descarregamento. Etapa atual: %',etapa; end if;
 elsif p_etapa='retorno' then
  if etapa not in ('triagem_retorno','retorno_simultaneo') then raise exception 'Triagem de retorno indisponível. Conclua a coleta e, no modo sequencial, o descarregamento. Etapa atual: %',etapa; end if;
 else raise exception 'Etapa inválida'; end if;
end $function$;
