-- Encerrar a operação (out/2026): a falta resolvida pela Gestão do acervo (contagem geral + 2ª conferência) grava
-- "Perda de N confirmada na 2ª conferência…" ou "2ª conferência bateu…", e não mais "Perda confirmada:…".
-- A trava só aceitava o texto antigo, então o pedido nunca encerrava. Agora vale qualquer falta resolvida da peça.
CREATE OR REPLACE FUNCTION public.operacao_encerrar_antes_fluxo(p_pedido uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.separacoes_pedidos;
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido for update;
  if not public.eh_membro_empresa(p.empresa_id) or not public.funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para encerrar'; end if;
  if p.operacao->'retorno'->>'concluido_em' is null then raise exception 'Conclua a triagem de retorno primeiro'; end if;
  if exists(select 1 from public.operacao_ocorrencias where pedido_id=p.id and resolvida_em is null) then raise exception 'Resolva as ocorrências antes de encerrar a operação'; end if;
  if exists(select 1 from public.separacoes_etiquetas e where e.separacao_pedido_id=p.id and e.lida_carregamento_em is not null and e.lida_retorno_em is null
    and not exists(select 1 from public.operacao_ocorrencias o where o.pedido_id=p.id and o.codigo=e.codigo and o.tipo='falta' and o.resolvida_em is not null)) then raise exception 'Existem peças ainda não devolvidas'; end if;
  update public.separacoes_pedidos set encerrado_operacional_em=coalesce(encerrado_operacional_em,now()),status_operacional='encerrado',revisao=revisao+1,atualizado_em=now() where id=p.id;
end $function$;
