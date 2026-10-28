-- Out/2026: pedido separado sem etiquetas de envio ("1 clique") não tem conferência por bipe.
-- Concluir a etapa sem etiquetas passa a ser uma confirmação simples (sem_etiquetas=true), em vez de dar erro.
create or replace function public.operacao_concluir_conferencia(p_pedido uuid,p_etapa text,p_aceitar_faltas boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.separacoes_pedidos; campo text; registro jsonb; faltas jsonb; total bigint; lidas bigint;
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido for update;
  if not public.eh_membro_empresa(p.empresa_id) or not public.funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para concluir'; end if;
  perform public.operacao_validar_etapa(p,p_etapa);
  campo:=case p_etapa when 'carregamento' then 'lida_carregamento_em' when 'descarregamento' then 'lida_descarregamento_em' else 'lida_retorno_em' end;
  select count(*),count(to_jsonb(t)->>campo),coalesce(jsonb_agg(jsonb_build_object('codigo',t.codigo,'item_id',t.item_id,'item',coalesce(i.item_nome,'Item'))) filter(where to_jsonb(t)->>campo is null),'[]')
    into total,lidas,faltas from public.separacoes_etiquetas t left join public.separacoes_itens i on i.id=t.separacao_item_id
    where t.separacao_pedido_id=p.id and (p_etapa='carregamento' or t.lida_carregamento_em is not null);
  -- total=0: pedido sem etiquetas de envio, a etapa é só confirmada (sem bipagem).
  if total>lidas and not p_aceitar_faltas then raise exception 'Existem peças faltando. Confirme a conclusão com pendência'; end if;
  registro:=jsonb_build_object('concluido_em',now(),'usuario_id',auth.uid(),'por',coalesce(auth.jwt()->>'email','Equipe'),'total',total,'lidas',lidas,'faltando',faltas,'as_cegas',p_etapa='retorno' and total>0,'sem_etiquetas',total=0);
  update public.separacoes_pedidos set operacao=jsonb_set(coalesce(operacao,'{}'),array[p_etapa],registro),
    status_operacional=case p_etapa when 'carregamento' then 'carregado' when 'descarregamento' then 'descarregado' else 'retornado' end,
    revisao=revisao+1,atualizado_em=now() where id=p.id;
  if p_etapa='retorno' then
    insert into public.operacao_ocorrencias(empresa_id,pedido_id,item_id,codigo,tipo,descricao)
      select p.empresa_id,p.id,(x->>'item_id')::uuid,x->>'codigo','falta','Peça não devolvida: '||(x->>'item') from jsonb_array_elements(faltas) x
      on conflict(pedido_id,codigo,tipo) do nothing;
    update public.operacao_ocorrencias o set resolvida_em=now(),resolucao='Peça conferida no retorno'
      where pedido_id=p.id and tipo='falta' and resolvida_em is null and exists(select 1 from public.separacoes_etiquetas e where e.separacao_pedido_id=p.id and e.codigo=o.codigo and e.lida_retorno_em is not null);
  end if;
  return registro;
end $$;
