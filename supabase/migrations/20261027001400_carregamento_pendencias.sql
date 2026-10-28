-- Out/2026: concluir o carregamento com pendências exige motivo (cadastrado em Parâmetros) e data/hora para carregar
-- o que ficou. Isso vira uma etapa "Carregamento · pendências" no cronograma, e a escala automática escolhe o
-- caminhão pelo volume (m³) só dos itens que ficaram.
begin;

-- 1) Motivos de pendência do carregamento (mesma tabela dos motivos de entrega/coleta)
alter table public.logistica_motivos drop constraint if exists logistica_motivos_etapa_check;
alter table public.logistica_motivos add constraint logistica_motivos_etapa_check check (etapa in ('entrega','coleta','carregamento'));
insert into public.logistica_motivos(empresa_id,etapa,nome)
 select e.id,'carregamento',v.nome from public.empresas e cross join (values
  ('Falta de espaço no caminhão'),('Item não separado a tempo'),('Item avariado na conferência'),('Item em produção ou manutenção')
 ) v(nome)
on conflict do nothing;

-- 2) Volume próprio da etapa (a etapa de pendências não carrega o pedido inteiro)
alter table public.operacao_etapas add column if not exists volume_m3 numeric;
alter table public.operacao_etapas drop constraint if exists operacao_etapas_origem_check;
alter table public.operacao_etapas add constraint operacao_etapas_origem_check check (origem in ('pedido','manual','pendencia'));

do $patch$
declare fonte text; trecho text;
begin
  -- escala: usa o volume da etapa quando existir; pendências entram mesmo com o pedido já carregado
  fonte:=pg_get_functiondef('public.operacao_escala_preencher_sem_fluxo(uuid,uuid[])'::regprocedure);
  trecho:='m3 := coalesce(nullif((operacao_volume_pedido(et.pedido_id)->>''m3'')::numeric, 0)';
  if position(trecho in fonte)=0 then raise exception 'Escala diferente da esperada (volume)'; end if;
  fonte:=replace(fonte,trecho,'m3 := case when et.volume_m3 is not null then greatest(et.volume_m3, 0.01) end;'||chr(10)||'    m3 := coalesce(m3, nullif((operacao_volume_pedido(et.pedido_id)->>''m3'')::numeric, 0)');
  trecho:='(e.pedido_id is null or exists(select 1 from public.separacoes_pedidos p';
  if position(trecho in fonte)=0 then raise exception 'Escala diferente da esperada (fluxo)'; end if;
  fonte:=replace(fonte,trecho,'(e.pedido_id is null or e.origem=''pendencia'' or exists(select 1 from public.separacoes_pedidos p');
  execute fonte;

  fonte:=pg_get_functiondef('public.operacao_escala_preencher(uuid,uuid[])'::regprocedure);
  trecho:='(e.pedido_id is null or pedido_fluxo_etapa(p)';
  if position(trecho in fonte)=0 then raise exception 'Escala diferente da esperada (preencher)'; end if;
  fonte:=replace(fonte,trecho,'(e.pedido_id is null or e.origem=''pendencia'' or pedido_fluxo_etapa(p)');
  execute fonte;

  -- concluir o carregamento com faltas só passa pela função com pendência (motivo + data)
  fonte:=pg_get_functiondef('public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb)'::regprocedure);
  trecho:='  if p_etapa=''carregamento'' then registro:=registro||jsonb_build_object(''caminhoes''';
  if position(trecho in fonte)=0 then raise exception 'Conferência diferente da esperada'; end if;
  fonte:=replace(fonte,trecho,$g$  if p_etapa='carregamento' and jsonb_array_length(coalesce(registro->'faltando','[]'))>0
     and coalesce(current_setting('acervo.pendencia_ok',true),'')<>'1' then
    raise exception 'Informe o motivo e a data de carregamento das pendências.';
  end if;
$g$||trecho);
  execute fonte;
end $patch$;

create or replace function public.operacao_concluir_com_pendencia(
  p_pedido uuid, p_etapa text, p_aceitar_faltas boolean default false,
  p_quantidades jsonb default null, p_observacoes jsonb default null, p_pendencia jsonb default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.separacoes_pedidos; r jsonb; mot text; d date; h time; itens jsonb; m3 numeric; et uuid; cams jsonb; pend jsonb; lista text;
begin
  if p_etapa<>'carregamento' or p_pendencia is null then
    return public.operacao_concluir_conferencia(p_pedido,p_etapa,p_aceitar_faltas,p_quantidades,p_observacoes);
  end if;
  select * into strict p from public.separacoes_pedidos where id=p_pedido;
  if not public.eh_membro_empresa(p.empresa_id) then raise exception 'Sem permissão para concluir'; end if;
  select nome into mot from public.logistica_motivos
   where id=nullif(p_pendencia->>'motivo_id','')::uuid and empresa_id=p.empresa_id and etapa='carregamento' and ativo;
  if mot is null then raise exception 'Escolha o motivo da pendência (cadastrado em Parâmetros).'; end if;
  begin d:=(p_pendencia->>'data')::date; h:=(p_pendencia->>'hora')::time; exception when others then d:=null; end;
  if d is null or h is null then raise exception 'Informe a data e o horário do carregamento das pendências.'; end if;
  if d<current_date then raise exception 'A data do carregamento das pendências não pode ser no passado.'; end if;

  perform set_config('acervo.pendencia_ok','1',true);
  r:=public.operacao_concluir_conferencia(p_pedido,p_etapa,p_aceitar_faltas,p_quantidades,p_observacoes);
  perform set_config('acervo.pendencia_ok','',true);

  select coalesce(jsonb_agg(jsonb_build_object('item_id',f.item_id,'item',f.item,'quantidade',trim_scale(f.q)) order by f.item),'[]'),
         coalesce(sum(f.q*coalesce(i.volume_cubico,0)),0),
         string_agg(trim_scale(f.q)::text||'× '||f.item, ', ' order by f.item)
    into itens,m3,lista
    from (select nullif(x->>'item_id','')::uuid item_id, max(coalesce(x->>'item','Item')) item,
                 sum(greatest(coalesce((x->>'faltam')::numeric,1),0)) q
            from jsonb_array_elements(coalesce(r->'faltando','[]')) x group by 1) f
    left join public.itens i on i.id=f.item_id;
  if jsonb_array_length(itens)=0 then return r; end if;

  insert into public.operacao_etapas(empresa_id,pedido_id,nome,tipo,data,hora,observacao,origem,volume_m3,atualizado_por)
  values (p.empresa_id,p.id,'Carregamento · pendências','carregamento',d,h,
          left('Pendências do carregamento — '||mot||': '||lista,1000),'pendencia',round(m3,3),auth.uid())
  returning id into et;
  perform public.operacao_escala_preencher_sem_fluxo(p.empresa_id,array[et]);
  select jsonb_agg(jsonb_build_object('id',c.id,'codigo',c.codigo,'placa',c.placa,'modelo',c.modelo) order by c.codigo)
    into cams from public.operacao_etapa_caminhoes ec join public.caminhoes c on c.id=ec.caminhao_id where ec.etapa_id=et;
  pend:=jsonb_build_object('motivo_id',p_pendencia->>'motivo_id','motivo',mot,'data',d,'hora',to_char(h,'HH24:MI'),
        'itens',itens,'m3',round(m3,3),'etapa_id',et,'caminhoes',coalesce(cams,'[]'));
  update public.separacoes_pedidos set operacao=jsonb_set(operacao,'{carregamento,pendencia}',pend) where id=p.id;
  return r||jsonb_build_object('pendencia',pend);
end $$;
revoke all on function public.operacao_concluir_com_pendencia(uuid,text,boolean,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.operacao_concluir_com_pendencia(uuid,text,boolean,jsonb,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
