begin;
alter table public.separacoes_etiquetas add column if not exists patrimonio_codigo text;
create unique index separacoes_etiquetas_patrimonio_uidx on public.separacoes_etiquetas(separacao_pedido_id,patrimonio_codigo) where patrimonio_codigo is not null;
create table public.operacao_patrimonios_lidos (
  pedido_id uuid not null references public.separacoes_pedidos(id),
  etapa text not null,
  codigo text not null,
  etiqueta_id uuid not null references public.separacoes_etiquetas(id),
  primary key(pedido_id,etapa,codigo),
  unique(pedido_id,etapa,etiqueta_id)
);
alter table public.operacao_patrimonios_lidos enable row level security;

create or replace function public.operacao_validar_etapa(p public.separacoes_pedidos,p_etapa text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p.encerrado_operacional_em is not null then raise exception 'Operação encerrada'; end if;
  if coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') then raise exception 'O pedido precisa estar aprovado'; end if;
  if p.reducao_liberada_em is not null then raise exception 'A triagem está aguardando a revisão do comercial'; end if;
  if p_etapa='carregamento' then
    if p.status not in ('separado','separado_com_divergencia') then raise exception 'Finalize a separação antes do carregamento'; end if;
    if p.operacao->'descarregamento'->>'concluido_em' is not null or p.operacao->'retorno'->>'concluido_em' is not null then raise exception 'O pedido já avançou para o retorno'; end if;
  elsif p_etapa='descarregamento' then
    if p.operacao->'carregamento'->>'concluido_em' is null then raise exception 'Conclua o carregamento primeiro'; end if;
    if p.operacao->'retorno'->>'concluido_em' is not null then raise exception 'A triagem de retorno já foi concluída'; end if;
    if not exists(select 1 from public.gs_linhas c where c.planilha_id='14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ' and c.aba='Cronograma' and c.valores->>17=p.id::text and lower(c.valores->>5)='desmontagem') then raise exception 'Programe a desmontagem no cronograma antes de descarregar'; end if;
    if exists(select 1 from public.gs_linhas c where c.planilha_id='14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ' and c.aba='Cronograma' and c.valores->>17=p.id::text and lower(c.valores->>5)='desmontagem'
      and not exists(select 1 from public.gs_linhas d where d.planilha_id=c.planilha_id and d.aba='Desmontagem_Conclusoes' and d.linha>1 and d.valores->>1=c.valores->>0)) then raise exception 'Conclua todas as desmontagens antes do descarregamento'; end if;
  elsif p_etapa='retorno' then
    if p.operacao->'descarregamento'->>'concluido_em' is null then raise exception 'Conclua o descarregamento antes da triagem de retorno'; end if;
  else raise exception 'Etapa inválida'; end if;
end $$;

create or replace function public.operacao_ler_peca(p_pedido uuid,p_etapa text,p_tipo text,p_codigo text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.separacoes_pedidos;e public.separacoes_etiquetas; item uuid; campo text;
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido for update;
  if not public.eh_membro_empresa(p.empresa_id) or not public.funcionario_tabela_permitida(p.empresa_id,'separacoes_itens','editar') then raise exception 'Sem permissão para conferir'; end if;
  perform public.operacao_validar_etapa(p,p_etapa);
  campo:=case p_etapa when 'carregamento' then 'lida_carregamento_em' when 'descarregamento' then 'lida_descarregamento_em' else 'lida_retorno_em' end;
  if p_tipo='PAT' then
    if exists(select 1 from public.operacao_patrimonios_lidos where pedido_id=p.id and etapa=p_etapa and codigo=p_codigo) then raise exception 'Este móvel já foi conferido'; end if;
    select item_id into item from public.itens_patrimonios where empresa_id=p.empresa_id and codigo_patrimonio=p_codigo;
    if item is null then raise exception 'QR fixo não encontrado'; end if;
    select * into e from public.separacoes_etiquetas t where t.separacao_pedido_id=p.id and t.item_id=item and t.patrimonio_codigo=p_codigo
      and (p_etapa='carregamento' or t.lida_carregamento_em is not null) order by t.codigo limit 1 for update;
    if e.id is null then raise exception 'QR fixo sem vínculo com uma etiqueta deste pedido. Leia a etiqueta de envio'; end if;
  elsif p_tipo='ENV' then
    select * into e from public.separacoes_etiquetas where empresa_id=p.empresa_id and separacao_pedido_id=p.id and codigo=p_codigo for update;
    if e.id is null then raise exception 'Etiqueta não pertence a este pedido'; end if;
  else raise exception 'Leia a etiqueta de envio ou o QR fixo do móvel'; end if;
  if to_jsonb(e)->>campo is not null then raise exception 'Já conferida'; end if;
  if p_etapa<>'carregamento' and e.lida_carregamento_em is null then raise exception 'Esta peça não consta no carregamento conferido'; end if;
  if p_tipo='PAT' then insert into public.operacao_patrimonios_lidos values(p.id,p_etapa,p_codigo,e.id); end if;
  execute format('update public.separacoes_etiquetas set %I=now() where id=$1',campo) using e.id;
  -- A leitura e o histórico pertencem à mesma transação.
  insert into public.separacoes_leituras(empresa_id,separacao_pedido_id,separacao_item_id,item_id,codigo_lido,tipo_controle,usuario_id,status_leitura,observacao)
    values(p.empresa_id,p.id,e.separacao_item_id,e.item_id,p_codigo,p_etapa,auth.uid(),'sucesso',p_etapa||': etiqueta '||e.codigo);
  return (select to_jsonb(t) from public.separacoes_etiquetas t where id=e.id);
end $$;

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
  if total=0 then raise exception 'Não há etiquetas para conferir nesta etapa'; end if;
  if total>lidas and not p_aceitar_faltas then raise exception 'Existem peças faltando. Confirme a conclusão com pendência'; end if;
  registro:=jsonb_build_object('concluido_em',now(),'usuario_id',auth.uid(),'por',coalesce(auth.jwt()->>'email','Equipe'),'total',total,'lidas',lidas,'faltando',faltas,'as_cegas',p_etapa='retorno');
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

create or replace function public.operacao_encerrar(p_pedido uuid)
returns void language plpgsql security definer set search_path=public as $$
declare p public.separacoes_pedidos;
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido for update;
  if not public.eh_membro_empresa(p.empresa_id) or not public.funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para encerrar'; end if;
  if p.operacao->'retorno'->>'concluido_em' is null then raise exception 'Conclua a triagem de retorno primeiro'; end if;
  if exists(select 1 from public.operacao_ocorrencias where pedido_id=p.id and resolvida_em is null) then raise exception 'Resolva as ocorrências antes de encerrar a operação'; end if;
  if exists(select 1 from public.separacoes_etiquetas where separacao_pedido_id=p.id and lida_carregamento_em is not null and lida_retorno_em is null) then raise exception 'Existem peças ainda não devolvidas'; end if;
  update public.separacoes_pedidos set encerrado_operacional_em=coalesce(encerrado_operacional_em,now()),status_operacional='encerrado',revisao=revisao+1,atualizado_em=now() where id=p.id;
end $$;
revoke all on function public.operacao_validar_etapa(public.separacoes_pedidos,text),public.operacao_ler_peca(uuid,text,text,text),public.operacao_concluir_conferencia(uuid,text,boolean),public.operacao_encerrar(uuid) from public,anon;
grant execute on function public.operacao_ler_peca(uuid,text,text,text),public.operacao_concluir_conferencia(uuid,text,boolean),public.operacao_encerrar(uuid) to authenticated;
commit;
