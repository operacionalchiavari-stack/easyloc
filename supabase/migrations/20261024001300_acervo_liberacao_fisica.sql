-- A disponibilidade so volta apos as duas conferencias fisicas do deposito.
alter function public.acervo_movimentar(uuid,uuid,integer,text,text,numeric) rename to acervo_movimentar_antes_recebimento;
revoke all on function public.acervo_movimentar_antes_recebimento(uuid,uuid,integer,text,text,numeric) from public,anon,authenticated;
create function public.acervo_movimentar(p_empresa uuid,p_id uuid,p_versao integer,p_destino text,p_motivo text,p_custo numeric default 0) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r acervo_retornos;p separacoes_pedidos;begin
 if not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','editar') then raise exception 'Sem permissao para movimentar o acervo';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into strict r from acervo_retornos where id=p_id and empresa_id=p_empresa;
 select * into strict p from separacoes_pedidos where id=r.pedido_id and empresa_id=p_empresa;
 if p_destino in ('liberado','baixado') and (p.operacao->'retorno'->>'concluido_em' is null or p.operacao->'descarregamento'->>'concluido_em' is null) then raise exception 'Conclua o descarregamento e a Triagem de retorno antes de liberar ou baixar o acervo';end if;
 if p_custo<>round(p_custo,2) then raise exception 'Informe o custo com ate duas casas decimais';end if;
 return acervo_movimentar_antes_recebimento(p_empresa,p_id,p_versao,p_destino,p_motivo,p_custo);
end $$;
revoke all on function public.acervo_movimentar(uuid,uuid,integer,text,text,numeric) from public,anon;
grant execute on function public.acervo_movimentar(uuid,uuid,integer,text,text,numeric) to authenticated;
notify pgrst,'reload schema';
