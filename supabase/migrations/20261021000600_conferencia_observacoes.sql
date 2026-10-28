-- Out/2026: conferência por quantidade (pedido sem etiquetas) ganha uma observação por item:
-- p_observacoes = { "<linha>|<item>": "texto" } vai em operacao.<etapa>.itens[].obs (até 500 caracteres).
drop function if exists public.operacao_concluir_conferencia(uuid,text,boolean,jsonb);

create or replace function public.operacao_concluir_conferencia(p_pedido uuid,p_etapa text,p_aceitar_faltas boolean default false,p_quantidades jsonb default null,p_observacoes jsonb default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.separacoes_pedidos; campo text; registro jsonb; faltas jsonb; total numeric; lidas numeric; itens jsonb; base jsonb; vazios int;
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido for update;
  if not public.eh_membro_empresa(p.empresa_id) or not public.funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para concluir'; end if;
  perform public.operacao_validar_etapa(p,p_etapa);
  campo:=case p_etapa when 'carregamento' then 'lida_carregamento_em' when 'descarregamento' then 'lida_descarregamento_em' else 'lida_retorno_em' end;
  select count(*),count(to_jsonb(t)->>campo),coalesce(jsonb_agg(jsonb_build_object('codigo',t.codigo,'item_id',t.item_id,'item',coalesce(i.item_nome,'Item'))) filter(where to_jsonb(t)->>campo is null),'[]')
    into total,lidas,faltas from public.separacoes_etiquetas t left join public.separacoes_itens i on i.id=t.separacao_item_id
    where t.separacao_pedido_id=p.id and (p_etapa='carregamento' or t.lida_carregamento_em is not null);

  if total>0 then
    if total>lidas and not p_aceitar_faltas then raise exception 'Existem peças faltando. Confirme a conclusão com pendência'; end if;
    registro:=jsonb_build_object('concluido_em',now(),'usuario_id',auth.uid(),'por',coalesce(auth.jwt()->>'email','Equipe'),'total',total,'lidas',lidas,'faltando',faltas,'as_cegas',p_etapa='retorno');
  else
    -- Sem etiquetas: conferência por quantidade.
    if p_quantidades is null or jsonb_typeof(p_quantidades)<>'object' then raise exception 'Informe a quantidade de cada item'; end if;
    base:=case when p_etapa<>'carregamento' then p.operacao->'carregamento'->'itens' end;
    with pecas as (
      select pc.chave, pc.item_id, pc.nome,
             coalesce((select (x->>'conferido')::numeric from jsonb_array_elements(base) x where x->>'chave'=pc.chave), case when base is null then pc.esperado end, 0) esperado,
             case when p_quantidades->>pc.chave ~ '^\d+(\.\d+)?$' then (p_quantidades->>pc.chave)::numeric end conferido
        from public.operacao_conferencia_pecas(p.id) pc)
    select coalesce(jsonb_agg(jsonb_build_object('chave',chave,'item_id',item_id,'item',nome,'esperado',esperado,'conferido',conferido,'obs',nullif(left(btrim(coalesce(p_observacoes->>chave,'')),500),'')) order by nome),'[]'),
           coalesce(sum(esperado),0), coalesce(sum(least(conferido,esperado)),0),
           coalesce(jsonb_agg(jsonb_build_object('codigo',chave,'item_id',item_id,'item',nome,'esperado',esperado,'conferido',conferido,'faltam',esperado-conferido)) filter(where conferido<esperado),'[]'),
           count(*) filter(where conferido is null)
      into itens,total,lidas,faltas,vazios
      from pecas;
    if jsonb_array_length(itens)=0 then raise exception 'Este pedido não tem itens para conferir'; end if;
    if vazios>0 then raise exception 'Informe a quantidade de todos os itens'; end if;
    if jsonb_array_length(faltas)>0 and not p_aceitar_faltas then raise exception 'Existem peças faltando. Confirme a conclusão com pendência'; end if;
    registro:=jsonb_build_object('concluido_em',now(),'usuario_id',auth.uid(),'por',coalesce(auth.jwt()->>'email','Equipe'),'total',total,'lidas',lidas,'faltando',faltas,
      'as_cegas',p_etapa='retorno','sem_etiquetas',true,'itens',itens);
  end if;

  update public.separacoes_pedidos set operacao=jsonb_set(coalesce(operacao,'{}'),array[p_etapa],registro),
    status_operacional=case p_etapa when 'carregamento' then 'carregado' when 'descarregamento' then 'descarregado' else 'retornado' end,
    revisao=revisao+1,atualizado_em=now() where id=p.id;
  if p_etapa='retorno' then
    insert into public.operacao_ocorrencias(empresa_id,pedido_id,item_id,codigo,tipo,quantidade,descricao)
      select p.empresa_id,p.id,(x->>'item_id')::uuid,x->>'codigo','falta',greatest(coalesce((x->>'faltam')::numeric,1),1),
             'Peça não devolvida: '||(x->>'item')||case when x ? 'faltam' then ' ('||(x->>'faltam')||')' else '' end
        from jsonb_array_elements(registro->'faltando') x
      on conflict(pedido_id,codigo,tipo) do nothing;
    update public.operacao_ocorrencias o set resolvida_em=now(),resolucao='Peça conferida no retorno'
      where pedido_id=p.id and tipo='falta' and resolvida_em is null and exists(select 1 from public.separacoes_etiquetas e where e.separacao_pedido_id=p.id and e.codigo=o.codigo and e.lida_retorno_em is not null);
  end if;
  return registro;
end $$;

revoke all on function public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb) from public, anon;
grant execute on function public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb) to authenticated;
