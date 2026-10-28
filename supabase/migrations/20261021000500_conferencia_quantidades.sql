-- Out/2026: pedido separado sem etiquetas de envio ("1 clique") é conferido por QUANTIDADE, não por bipe.
-- A tela mostra os itens (Kit aberto nos componentes) e a pessoa digita quanto foi carregado / descarregado / voltou;
-- p_quantidades = { "<linha do pedido>|<item>": quantidade }. O esperado é calculado aqui (nunca vem da tela):
-- carregamento = pedido; descarregamento e volta = o que o carregamento conferiu (se houver), senão o pedido.
-- Com etiquetas, nada muda (p_quantidades é ignorado).
drop function if exists public.operacao_concluir_conferencia(uuid,text,boolean);

create or replace function public.operacao_conferencia_pecas(p_pedido uuid)
returns table(chave text, linha uuid, item_id uuid, nome text, esperado numeric)
language sql stable security invoker set search_path=public as $$
  with linhas as (
    select si.id linha, si.item_id, coalesce(si.item_nome, i.descricao_total, i.produto, 'Item') nome,
           coalesce(si.quantidade_solicitada,0) q, lower(coalesce(i.tipo,'')) tipo
      from public.separacoes_itens si left join public.itens i on i.id=si.item_id
     where si.separacao_pedido_id=p_pedido)
  select l.linha::text||'|'||k.item_id::text, l.linha, k.item_id, coalesce(c.descricao_total,c.produto,'Componente'), k.quantidade*l.q
    from linhas l join public.kit_itens k on k.kit_id=l.item_id left join public.itens c on c.id=k.item_id
   where l.tipo='kit'
  union all
  select l.linha::text||'|'||l.item_id::text, l.linha, l.item_id, l.nome, l.q
    from linhas l
   where l.tipo<>'kit' or not exists(select 1 from public.kit_itens k where k.kit_id=l.item_id)
$$;

create or replace function public.operacao_concluir_conferencia(p_pedido uuid,p_etapa text,p_aceitar_faltas boolean default false,p_quantidades jsonb default null)
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
    select coalesce(jsonb_agg(jsonb_build_object('chave',chave,'item_id',item_id,'item',nome,'esperado',esperado,'conferido',conferido) order by nome),'[]'),
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

revoke all on function public.operacao_conferencia_pecas(uuid), public.operacao_concluir_conferencia(uuid,text,boolean,jsonb) from public, anon;
-- A tela usa a mesma lista de peças (security invoker: as regras de acesso das tabelas valem para quem chama).
grant execute on function public.operacao_conferencia_pecas(uuid), public.operacao_concluir_conferencia(uuid,text,boolean,jsonb) to authenticated;
