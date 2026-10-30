-- Divergências da conferência de volta (out/2026): na Triagem (retorno) e na Expedição (descarregamento), o que faltou
-- e o que veio a mais viram ocorrências (tipo falta / sobra) que ficam abertas (o pedido continua no quadro, na coluna
-- de divergências) até alguém resolver: falta = "apareceu" (com quantidade) ou "perda" (baixa no estoque); a mais =
-- "conferido" (com explicação). A tela pede uma segunda contagem dos itens divergentes antes de concluir; a primeira
-- contagem fica registrada em operacao.<etapa>.primeira_contagem.
begin;
alter table public.operacao_ocorrencias add column if not exists etapa text;
alter table public.operacao_ocorrencias add column if not exists esperado numeric;
alter table public.operacao_ocorrencias add column if not exists conferido numeric;
alter table public.operacao_ocorrencias drop constraint if exists operacao_ocorrencias_tipo_check;
alter table public.operacao_ocorrencias add constraint operacao_ocorrencias_tipo_check
  check (tipo in ('falta','sobra','avaria','limpeza','manutencao','outro'));
update public.operacao_ocorrencias set etapa='retorno' where tipo='falta' and etapa is null;
create index if not exists operacao_ocorrencias_abertas_idx on public.operacao_ocorrencias(empresa_id,etapa) where resolvida_em is null;

drop function if exists public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb);
create function public.operacao_concluir_conferencia(p_pedido uuid, p_etapa text, p_aceitar_faltas boolean DEFAULT false, p_quantidades jsonb DEFAULT NULL::jsonb, p_observacoes jsonb DEFAULT NULL::jsonb, p_primeira jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.separacoes_pedidos; campo text; registro jsonb; faltas jsonb; total numeric; lidas numeric; itens jsonb; base jsonb; vazios int; sobras jsonb:='[]';
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido for update;
  if not public.eh_membro_empresa(p.empresa_id) or not public.funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para concluir'; end if;
  perform public.operacao_validar_etapa(p,p_etapa);
  if p_etapa='carregamento' and jsonb_array_length(coalesce(p.operacao->'carregamento_caminhoes','[]'))=0 then
    raise exception 'Selecione o caminhão em que o pedido foi carregado.';
  end if;
  campo:=case p_etapa when 'carregamento' then 'lida_carregamento_em' when 'descarregamento' then 'lida_descarregamento_em' else 'lida_retorno_em' end;
  select count(*),count(to_jsonb(t)->>campo),coalesce(jsonb_agg(jsonb_build_object('codigo',t.codigo,'item_id',t.item_id,'item',coalesce(i.item_nome,'Item'))) filter(where to_jsonb(t)->>campo is null),'[]')
    into total,lidas,faltas from public.separacoes_etiquetas t left join public.separacoes_itens i on i.id=t.separacao_item_id
    where t.separacao_pedido_id=p.id and (p_etapa='carregamento' or t.lida_carregamento_em is not null);

  if total>0 and coalesce(p.modo_separacao,'qr')='qr' then
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
           count(*) filter(where conferido is null),
           coalesce(jsonb_agg(jsonb_build_object('codigo',chave,'item_id',item_id,'item',nome,'esperado',esperado,'conferido',conferido,'sobram',conferido-esperado)) filter(where conferido>esperado),'[]')
      into itens,total,lidas,faltas,vazios,sobras
      from pecas;
    if jsonb_array_length(itens)=0 then raise exception 'Este pedido não tem itens para conferir'; end if;
    if vazios>0 then raise exception 'Informe a quantidade de todos os itens'; end if;
    if jsonb_array_length(faltas)>0 and not p_aceitar_faltas then raise exception 'Existem peças faltando. Confirme a conclusão com pendência'; end if;
    registro:=jsonb_build_object('concluido_em',now(),'usuario_id',auth.uid(),'por',coalesce(auth.jwt()->>'email','Equipe'),'total',total,'lidas',lidas,'faltando',faltas,
      'as_cegas',p_etapa='retorno','sem_etiquetas',true,'itens',itens,'sobrando',sobras)
      ||case when jsonb_typeof(p_primeira)='object' then jsonb_build_object('primeira_contagem',p_primeira) else '{}'::jsonb end;
  end if;

  if p_etapa='carregamento' and jsonb_array_length(coalesce(registro->'faltando','[]'))>0
     and coalesce(current_setting('acervo.pendencia_ok',true),'')<>'1' then
    raise exception 'Informe o motivo e a data de carregamento das pendências.';
  end if;
  if p_etapa='carregamento' then registro:=registro||jsonb_build_object('caminhoes',p.operacao->'carregamento_caminhoes'); end if;
  update public.separacoes_pedidos set operacao=jsonb_set(coalesce(operacao,'{}'),array[p_etapa],registro),
    status_operacional=case when p.operacao->'retorno'->>'concluido_em' is not null then 'retornado' else case p_etapa when 'carregamento' then 'carregado' when 'descarregamento' then 'descarregado' else 'retornado' end end,
    revisao=revisao+1,atualizado_em=now() where id=p.id;
  -- Divergências da volta (Expedição: descarregamento; Triagem: retorno) ficam abertas até alguém resolver.
  -- Concluir de novo (recontagem) troca as divergências ainda abertas desta etapa pelas novas.
  if p_etapa in ('retorno','descarregamento') then
    delete from public.operacao_ocorrencias where pedido_id=p.id and tipo in ('falta','sobra') and resolvida_em is null and coalesce(etapa,'retorno')=p_etapa;
    insert into public.operacao_ocorrencias(empresa_id,pedido_id,item_id,codigo,tipo,quantidade,descricao,etapa,esperado,conferido)
      select p.empresa_id,p.id,(x->>'item_id')::uuid,case when p_etapa='retorno' then x->>'codigo' else 'descarregamento:'||(x->>'codigo') end,'falta',
             greatest(coalesce((x->>'faltam')::numeric,1),1),
             case when p_etapa='retorno' then 'Peça não devolvida: ' else 'Peça não descarregada: ' end||(x->>'item')||case when x ? 'faltam' then ' ('||(x->>'faltam')||')' else '' end,
             p_etapa,(x->>'esperado')::numeric,(x->>'conferido')::numeric
        from jsonb_array_elements(registro->'faltando') x
      on conflict(pedido_id,codigo,tipo) do nothing;
    insert into public.operacao_ocorrencias(empresa_id,pedido_id,item_id,codigo,tipo,quantidade,descricao,etapa,esperado,conferido)
      select p.empresa_id,p.id,(x->>'item_id')::uuid,case when p_etapa='retorno' then x->>'codigo' else 'descarregamento:'||(x->>'codigo') end,'sobra',
             (x->>'sobram')::numeric,'Veio a mais: '||(x->>'item')||' ('||(x->>'sobram')||')',p_etapa,(x->>'esperado')::numeric,(x->>'conferido')::numeric
        from jsonb_array_elements(coalesce(registro->'sobrando','[]')) x
      on conflict(pedido_id,codigo,tipo) do nothing;
  end if;
  if p_etapa='retorno' then
    update public.operacao_ocorrencias o set resolvida_em=now(),resolucao='Peça conferida no retorno'
      where pedido_id=p.id and tipo='falta' and resolvida_em is null and exists(select 1 from public.separacoes_etiquetas e where e.separacao_pedido_id=p.id and e.codigo=o.codigo and e.lida_retorno_em is not null);
  end if;
  return registro;
end $function$;
revoke all on function public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb,jsonb) to authenticated, service_role;

create or replace function public.operacao_resolver_divergencia(p_id uuid, p_acao text, p_quantidade numeric default null, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare o public.operacao_ocorrencias; q numeric; quem text:=coalesce(auth.jwt()->>'email','Equipe');
begin
  select * into strict o from public.operacao_ocorrencias where id=p_id for update;
  if not public.eh_membro_empresa(o.empresa_id) or not public.funcionario_tabela_permitida(o.empresa_id,'separacoes_pedidos','editar') then
    raise exception 'Sem permissão para resolver divergências';
  end if;
  if o.resolvida_em is not null then raise exception 'Esta divergência já foi resolvida'; end if;
  if o.tipo not in ('falta','sobra') then raise exception 'Não é uma divergência de conferência'; end if;
  if length(btrim(coalesce(p_motivo,'')))<5 then raise exception 'Explique o que aconteceu (pelo menos 5 letras)'; end if;
  if o.tipo='falta' and p_acao='apareceu' then
    q:=coalesce(p_quantidade,o.quantidade);
    if q is null or q<=0 or q>o.quantidade or q<>trunc(q) then raise exception 'Informe quantas peças apareceram (de 1 a %)', trim_scale(o.quantidade); end if;
    if q<o.quantidade then
      update public.operacao_ocorrencias set quantidade=quantidade-q,
        descricao=descricao||' · '||trim_scale(q)||' apareceram em '||to_char(now() at time zone 'America/Sao_Paulo','DD/MM HH24:MI')||' ('||quem||': '||btrim(p_motivo)||')'
        where id=o.id;
      return jsonb_build_object('resolvida',false,'restam',o.quantidade-q);
    end if;
    update public.operacao_ocorrencias set resolvida_em=now(),resolucao='Apareceu ('||trim_scale(q)||'): '||btrim(p_motivo)||' — '||quem where id=o.id;
  elsif o.tipo='falta' and p_acao='perda' then
    perform public.operacao_resolver_ocorrencia(p_id,'perda',btrim(p_motivo)||' — '||quem);
  elsif o.tipo='sobra' and p_acao='conferido' then
    update public.operacao_ocorrencias set resolvida_em=now(),resolucao='Conferido: '||btrim(p_motivo)||' — '||quem where id=o.id;
  else
    raise exception 'Ação inválida para esta divergência';
  end if;
  return jsonb_build_object('resolvida',true);
end $fn$;
revoke all on function public.operacao_resolver_divergencia(uuid,text,numeric,text) from public, anon;
grant execute on function public.operacao_resolver_divergencia(uuid,text,numeric,text) to authenticated, service_role;
commit;
