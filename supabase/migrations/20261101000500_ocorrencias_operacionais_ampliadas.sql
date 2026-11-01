-- Regras explícitas: não inventa horários de término ou execução física.
create table public.operacao_ocorrencias_regras(
 empresa_id uuid primary key references empresas(id),
 tolerancia_minutos integer not null default 15 check(tolerancia_minutos between 0 and 1440),
 antecedencia_escala_minutos integer not null default 120 check(antecedencia_escala_minutos between 0 and 10080),
 retorno_horas integer not null default 24 check(retorno_horas between 1 and 720)
);
alter table public.operacao_ocorrencias_regras enable row level security;
revoke all on public.operacao_ocorrencias_regras from public,anon,authenticated;
grant select,insert,update on public.operacao_ocorrencias_regras to authenticated;
create policy regras_ler on public.operacao_ocorrencias_regras for select to authenticated using(ocorrencias_painel_pode(empresa_id));
create policy regras_editar on public.operacao_ocorrencias_regras for all to authenticated
 using(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar'))
 with check(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar'));

create function public.ocorrencia_numero(p_valor text) returns numeric
language sql immutable set search_path=public as $$
 select case when p_valor ~ '^\d{1,12}(\.\d{1,6})?$' then p_valor::numeric end;
$$;
create function public.ocorrencia_uuid(p_valor text) returns uuid
language plpgsql immutable set search_path=public as $$
begin return p_valor::uuid;exception when invalid_text_representation then return null;end $$;
create function public.ocorrencia_instante(p_valor text) returns timestamptz
language plpgsql stable set search_path=public as $$
begin
 if p_valor !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}.*(Z|[+-]\d{2}(:?\d{2})?)$' then return null;end if;
 return p_valor::timestamptz;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end $$;

create function public.ocorrencias_operacionais_fontes(p_empresa uuid) returns setof jsonb
language plpgsql security definer set search_path=public as $$
#variable_conflict use_column
declare p record;e record;r record;x jsonb;v jsonb;base jsonb;conf record;
 v_tipo text;hora_texto text;v_etapa text;
 previsto timestamptz;realizado timestamptz;fim timestamptz;qt numeric;esperado numeric;contado numeric;
 tolerancia integer:=15;antecedencia integer:=120;retorno integer:=24;necessarios text[];faltantes jsonb;
begin
 select coalesce(rr.tolerancia_minutos,15),coalesce(rr.antecedencia_escala_minutos,120),coalesce(rr.retorno_horas,24)
 into tolerancia,antecedencia,retorno from (select 1) a left join operacao_ocorrencias_regras rr on rr.empresa_id=p_empresa;
 for p in select * from separacoes_pedidos where empresa_id=p_empresa and coalesce(status_comercial,'')<>'cancelado'
  and (status_comercial in ('aprovado','enviado','finalizado') or operacao<>'{}')
 loop
  base:=jsonb_build_object('pedido_id',p.id,'pedido',p.numero_pedido,'cliente',p.cliente_nome,'objeto','item');
  -- Saída incompleta de móveis. Só os faltantes confirmados no registro final.
  if p.operacao->'carregamento'->>'concluido_em' is not null then
   for r in select coalesce(ocorrencia_uuid(f->>'item_id'),i.id) item_id,
    coalesce(i.descricao_total,i.produto,f->>'item','Item') item_nome,
    sum(coalesce(ocorrencia_numero(f->>'faltam'),greatest(0,ocorrencia_numero(f->>'esperado')-ocorrencia_numero(f->>'conferido')),1)) quantidade,
    jsonb_agg(f) evidencias
    from jsonb_array_elements(coalesce(p.operacao->'carregamento'->'faltando','[]')) f
    left join itens i on i.id=ocorrencia_uuid(f->>'item_id') and i.empresa_id=p_empresa
    group by coalesce(ocorrencia_uuid(f->>'item_id'),i.id),coalesce(i.descricao_total,i.produto,f->>'item','Item')
   loop
    if r.quantidade<=0 then continue;end if;
    return next base||jsonb_build_object('chave','carga:'||p.id||':'||coalesce(r.item_id::text,r.item_nome),'origem','conferencia','tipo','carregamento_incompleto',
     'etapa','carregamento','item_id',r.item_id,'item',r.item_nome,'quantidade',r.quantidade,'status','registrada',
     'data',p.operacao->'carregamento'->>'concluido_em','descricao','Carregamento concluído com móveis pendentes.','evidencias',r.evidencias);
   end loop;
  end if;
  foreach v_etapa in array array['entrega','coleta'] loop
   select * into conf from logistica_confirmacoes where empresa_id=p_empresa and pedido_id=p.id and logistica_confirmacoes.etapa=v_etapa
    order by versao desc,criado_em desc limit 1;
   -- Última versão da confirmação é a referência; versões anteriores ficam no histórico do caso.
   if conf.id is not null then
    for r in select ocorrencia_uuid(f->>'item_id') item_id,coalesce(f->>'nome','Item') item_nome,
      sum(coalesce(ocorrencia_numero(f->>case v_etapa when 'entrega' then 'nao_entregue' else 'nao_coletado' end),0)) quantidade,
      sum(coalesce(ocorrencia_numero(f->>'previsto'),0)) esperado,
      sum(coalesce(ocorrencia_numero(f->>case v_etapa when 'entrega' then 'entregue' else 'coletado' end),0)) conferido,jsonb_agg(f) evidencias
     from jsonb_array_elements(conf.itens) f group by ocorrencia_uuid(f->>'item_id'),coalesce(f->>'nome','Item')
    loop
     if r.quantidade<=0 then continue;end if;
     if v_etapa='coleta' and (exists(select 1 from acervo_retornos a where a.empresa_id=p_empresa and a.pedido_id=p.id and a.item_id=r.item_id and a.tipo='falta')
      or exists(select 1 from operacao_ocorrencias o where o.empresa_id=p_empresa and o.pedido_id=p.id and o.item_id=r.item_id and o.tipo='falta')) then continue;end if;
     return next base||jsonb_build_object('chave',v_etapa||':incompleta:'||p.id||':'||coalesce(r.item_id::text,r.item_nome),'origem','logistica',
      'tipo',v_etapa||'_incompleta','etapa',v_etapa,'item_id',r.item_id,'item',r.item_nome,'quantidade',r.quantidade,'esperado',r.esperado,'conferido',r.conferido,
      'status','aberta','data',conf.criado_em,'descricao',case v_etapa when 'entrega' then 'Quantidade não entregue registrada na confirmação.' else 'Quantidade não recolhida registrada na coleta; localização não confirmada.' end,
      'evidencias',jsonb_build_object('versao',conf.versao,'responsavel',conf.responsavel,'itens',r.evidencias));
    end loop;
   end if;
   -- O horário desta confirmação é de REGISTRO, não prova de execução física atrasada.
   hora_texto:=coalesce(nullif(p.observacoes->>('horario_'||v_etapa),''),nullif(p.observacoes->>('hora_'||v_etapa),''),p.observacoes->'horarios_pedido'->>v_etapa);
   previsto:=null;
   if hora_texto ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
    previsto:=((case v_etapa when 'entrega' then p.data_entrega else p.data_coleta end)+hora_texto::time) at time zone 'America/Sao_Paulo';
   end if;
   if previsto is not null and coalesce(conf.criado_em,now())>previsto+make_interval(mins=>tolerancia)
    and (conf.id is not null or p.encerrado_operacional_em is null) and (v_etapa<>'coleta' or p.pedido_origem_id is null) then
    return next base||jsonb_build_object('chave','confirmacao-prazo:'||p.id||':'||v_etapa,'origem','logistica','objeto','etapa','tipo','confirmacao_'||v_etapa||'_atrasada','etapa',v_etapa,
     'item',initcap(v_etapa),'quantidade',1,'status',case when conf.id is null then 'aberta' else 'registrada' end,'data',previsto,
     'descricao',case when conf.id is null then 'Etapa sem confirmação registrada após o horário programado.' else 'Confirmação registrada após o horário programado; não comprova atraso da execução física.' end,
     'evidencias',jsonb_build_object('programado',previsto,'registrado_em',conf.criado_em,'tolerancia_minutos',tolerancia));
   end if;
   if v_etapa='coleta' and conf.id is not null and p.operacao->'retorno'->>'concluido_em' is null and p.encerrado_operacional_em is null
    and now()>conf.criado_em+make_interval(hours=>retorno) then
    return next base||jsonb_build_object('chave','retorno-pendente:'||p.id,'origem','logistica','objeto','etapa','tipo','retorno_pendente','etapa','retorno',
     'quantidade',1,'status','aberta','data',conf.criado_em,'descricao','Triagem da volta não concluída após a janela de retorno da coleta.',
     'evidencias',jsonb_build_object('coleta_registrada',conf.criado_em,'janela_horas',retorno));
   end if;
  end loop;
 end loop;

 for e in select e.*,p.numero_pedido,p.cliente_nome,p.operacao,p.encerrado_operacional_em,
   (e.data+e.hora) at time zone 'America/Sao_Paulo' programado
  from operacao_etapas e join separacoes_pedidos p on p.id=e.pedido_id and p.empresa_id=e.empresa_id
  where e.empresa_id=p_empresa and coalesce(p.status_comercial,'')<>'cancelado'
 loop
  base:=jsonb_build_object('pedido_id',e.pedido_id,'pedido',e.numero_pedido,'cliente',e.cliente_nome,'objeto','etapa','etapa',e.tipo,'item',e.nome);
  -- Escala próxima da execução ou já iniciada; não abre pendência para evento distante.
  if e.encerrado_operacional_em is null and e.programado is not null and now()>=e.programado-make_interval(mins=>antecedencia) then
   if e.tipo in ('montagem','desmontagem','carregamento','descarregamento') and
    not exists(select 1 from operacao_etapa_pessoas ep where ep.etapa_id=e.id and ep.empresa_id=p_empresa)
    and not exists(select 1 from free_vagas fv where fv.etapa_id=e.id and fv.empresa_id=p_empresa and fv.status<>'CANCELADA') then
    return next base||jsonb_build_object('chave','escala-equipe:'||e.id,'origem','escala','tipo','equipe_sem_escala','quantidade',1,'status','aberta','data',e.programado,
     'descricao','Etapa próxima ou em execução sem equipe escalada registrada. Não significa ausência física da equipe.','evidencias',jsonb_build_object('programado',e.programado,'antecedencia_minutos',antecedencia));
   end if;
   for r in select fv.id,fv.quantidade,count(fi.id) confirmados from free_vagas fv
    left join free_inscricoes fi on fi.vaga_id=fv.id and fi.empresa_id=fv.empresa_id and fi.status='CONFIRMADO'
    where fv.etapa_id=e.id and fv.empresa_id=p_empresa and fv.status<>'CANCELADA'
    group by fv.id,fv.quantidade having count(fi.id)<fv.quantidade
   loop
    return next base||jsonb_build_object('chave','escala-incompleta:'||r.id,'origem','escala','tipo','equipe_incompleta','quantidade',r.quantidade-r.confirmados,'esperado',r.quantidade,'conferido',r.confirmados,
     'status','aberta','data',e.programado,'descricao','Vaga da etapa com menos inscrições confirmadas que a quantidade solicitada.','evidencias',jsonb_build_object('solicitado',r.quantidade,'confirmados',r.confirmados));
   end loop;
   if e.tipo='carregamento' and e.operacao->'carregamento'->>'concluido_em' is null
    and not coalesce((select carregamento_sem_programacao from empresa_logistica_regras where empresa_id=p_empresa),false)
    and not exists(select 1 from operacao_etapa_caminhoes ec where ec.etapa_id=e.id and ec.empresa_id=p_empresa)
    and jsonb_array_length(coalesce(e.operacao->'carregamento_caminhoes','[]'))=0 then
    return next base||jsonb_build_object('chave','escala-caminhao:'||e.id,'origem','escala','tipo','caminhao_sem_escala','quantidade',1,'status','aberta','data',e.programado,
     'descricao','Carregamento próximo ou em execução sem caminhão programado ou selecionado.','evidencias',jsonb_build_object('programado',e.programado));
   end if;
  end if;
  if e.tipo not in ('montagem','desmontagem') then continue;end if;
  select min(a.inicio) into realizado from operacao_apontamentos a where a.etapa_id=e.id and a.empresa_id=p_empresa;
  if e.programado is not null and coalesce(realizado,now())>e.programado+make_interval(mins=>tolerancia) and (e.encerrado_operacional_em is null or realizado is not null) then
   return next base||jsonb_build_object('chave','prazo:'||e.id,'origem','cronograma','tipo','atraso_inicio','quantidade',1,'status',case when realizado is null then 'aberta' else 'registrada' end,'data',e.programado,
    'descricao',case when realizado is null then 'Início da etapa sem apontamento após o horário programado.' else 'Início apontado após o horário programado.' end,
    'evidencias',jsonb_build_object('previsto',e.programado,'realizado',realizado,'tolerancia_minutos',tolerancia));
  end if;
  -- Encerramento efetivo dos apontamentos; não usa hora de início como prazo de fim.
  select case when count(*)>0 and bool_and(a.fim is not null) then max(a.fim) end into fim from operacao_apontamentos a where a.etapa_id=e.id and a.empresa_id=p_empresa;
  if e.tipo='desmontagem' then
   select coalesce(fim,min(criado_em)) into fim from operacao_registros where etapa_id=e.id and empresa_id=p_empresa and tipo='desmontagem_concluida';
  end if;
  fim:=coalesce(fim,e.encerrado_operacional_em);
  if fim is not null then
   necessarios:=case when e.tipo='montagem' then array['equipe','sacolas','lista_assinada','conferencia_entrega'] else array['equipe','lista_conferida','contagem_itens','desmontagem_concluida'] end;
   faltantes:='[]';
   foreach v_tipo in array necessarios loop
    if v_tipo='conferencia_entrega' and exists(select 1 from operacao_registros rr where rr.etapa_id=e.id and rr.empresa_id=p_empresa and rr.tipo='posicionamento') then continue;end if;
    if not exists(select 1 from operacao_registros rr where rr.etapa_id=e.id and rr.empresa_id=p_empresa and rr.tipo=v_tipo) then faltantes:=faltantes||jsonb_build_array(v_tipo);end if;
   end loop;
   if jsonb_array_length(faltantes)>0 then
    return next base||jsonb_build_object('chave','checklist:'||e.id,'origem','campo','tipo','checklist_incompleto','quantidade',jsonb_array_length(faltantes),'status','aberta','data',fim,
     'descricao','Etapa encerrada com registros obrigatórios ausentes.','evidencias',jsonb_build_object('registros_ausentes',faltantes,'encerrado_em',fim));
   end if;
  end if;
  for r in select * from operacao_registros where etapa_id=e.id and empresa_id=p_empresa loop
   if r.tipo='posicionamento' and r.dados->>'correto'='false' then
    return next base||jsonb_build_object('chave','posicionamento:'||r.id,'origem','campo','tipo','posicionamento_incorreto','quantidade',1,'status','registrada','data',r.criado_em,
     'descricao','Posicionamento incorreto confirmado no registro da montagem.','evidencias',r.dados);
   end if;
   if r.tipo='uniformizacao' and upper(coalesce(r.dados->>'valor',''))='NAO' then
    return next base||jsonb_build_object('chave','uniforme:'||r.id,'origem','campo','tipo','uniforme_reprovado','quantidade',1,'status','registrada','data',r.criado_em,
     'descricao','Uniformização reprovada na avaliação registrada.','evidencias',r.dados);
   end if;
   if r.tipo='equipe' and r.dados->'chegada'->>'localStatus'='FORA_DO_LOCAL' then
    return next base||jsonb_build_object('chave','chegada-local:'||r.id,'origem','campo','tipo','chegada_fora_area','quantidade',1,'status','registrada','data',r.criado_em,
     'descricao','Localização da foto de chegada fora da área prevista; requer conferência, sem inferir ausência da equipe.','evidencias',r.dados);
   end if;
   if (r.tipo in ('equipe','lista_assinada') and coalesce(r.dados->>'foto','')='')
    or (r.tipo='lista_conferida' and jsonb_array_length(coalesce(r.dados->'fotos','[]'))=0)
    or (r.tipo='sacolas' and exists(select 1 from jsonb_array_elements(coalesce(r.dados->'sacolas','[]')) sc where coalesce(sc->>'codigo','')='' or (coalesce(sc->>'foto','')='' and jsonb_array_length(coalesce(sc->'fotos','[]'))=0))) then
    return next base||jsonb_build_object('chave','evidencia-ausente:'||r.id,'origem','campo','tipo','evidencia_ausente','quantidade',1,'status','aberta','data',r.criado_em,
     'descricao','Registro enviado sem a foto ou identificação exigida para este passo.','evidencias',jsonb_build_object('passo',r.tipo,'registro',r.dados));
   end if;
   if r.tipo='conferencia_entrega' then
    for conf in select ocorrencia_uuid(it->>'item_id') item_id,coalesce(it->>'nome','Item') item_nome,
      sum(greatest(0,coalesce(ocorrencia_numero(it->>'esperado'),0)-coalesce(ocorrencia_numero(r.dados->'itens'->(it->>'chave')->>'entregue'),0))) falta,
      sum(coalesce(ocorrencia_numero(r.dados->'itens'->(it->>'chave')->>'danificados'),0)) danos,
      sum(coalesce(ocorrencia_numero(r.dados->'itens'->(it->>'chave')->>'entregue'),0)) entregue,
      jsonb_agg(jsonb_build_object('item',it,'conferencia',r.dados->'itens'->(it->>'chave'))) evidencias
     from jsonb_array_elements(coalesce(r.dados->'lista','[]')) it group by ocorrencia_uuid(it->>'item_id'),coalesce(it->>'nome','Item')
    loop
     if conf.falta>0 and not exists(select 1 from logistica_confirmacoes lc where lc.pedido_id=e.pedido_id and lc.empresa_id=p_empresa and lc.etapa='entrega') then
      return next base||jsonb_build_object('chave','entrega-visual:'||e.id||':'||coalesce(conf.item_id::text,conf.item_nome),'origem','campo','objeto','item','tipo','entrega_incompleta','item_id',conf.item_id,'item',conf.item_nome,
       'quantidade',conf.falta,'status','aberta','data',r.criado_em,'descricao','Quantidade menor na conferência visual da entrega.','evidencias',conf.evidencias);
     end if;
     if conf.danos>0 then
      return next base||jsonb_build_object('chave','avaria-entrega:'||e.id||':'||coalesce(conf.item_id::text,conf.item_nome),'origem','campo','objeto','item','tipo','avaria_entrega','item_id',conf.item_id,'item',conf.item_nome,
       'quantidade',conf.danos,'status','registrada','data',r.criado_em,'descricao','Móvel danificado confirmado na conferência visual da entrega.','evidencias',conf.evidencias);
     end if;
     select sum(ocorrencia_numero(z->>'entregue')) into qt
      from jsonb_array_elements((select lc.itens from logistica_confirmacoes lc where lc.empresa_id=p_empresa and lc.pedido_id=e.pedido_id and lc.etapa='entrega' order by lc.versao desc,lc.criado_em desc limit 1)) z
      where ocorrencia_uuid(z->>'item_id')=conf.item_id;
     if qt is not null and qt<>conf.entregue then
      return next base||jsonb_build_object('chave','entrega-divergente:'||e.id||':'||coalesce(conf.item_id::text,conf.item_nome),'origem','campo','objeto','item','tipo','divergencia_entrega','item_id',conf.item_id,'item',conf.item_nome,
       'quantidade',abs(qt-conf.entregue),'esperado',qt,'conferido',conf.entregue,'status','registrada','data',r.criado_em,'descricao','Confirmação de entrega e conferência visual apresentam quantidades diferentes.','evidencias',conf.evidencias);
     end if;
    end loop;
   end if;
   if r.tipo='contagem_itens' and e.operacao->'retorno'->>'concluido_em' is not null then
    for conf in select * from jsonb_each(r.dados->'itens') loop
     select z into x from jsonb_array_elements(coalesce(e.operacao->'retorno'->'itens','[]')) z where z->>'chave'=conf.key limit 1;
     esperado:=ocorrencia_numero(conf.value#>>'{}');contado:=ocorrencia_numero(x->>'conferido');
     if esperado is not null and contado is not null and esperado<>contado then
      return next base||jsonb_build_object('chave','desmontagem-retorno:'||e.id||':'||conf.key,'origem','campo','objeto','item','tipo','divergencia_desmontagem_retorno','etapa','retorno',
       'item_id',ocorrencia_uuid(x->>'item_id'),'item',coalesce(x->>'nome',x->>'item','Item'),'quantidade',abs(esperado-contado),'esperado',esperado,'conferido',contado,'status','registrada',
       'data',e.operacao->'retorno'->>'concluido_em','descricao','Contagem da desmontagem diferente da triagem de volta.','evidencias',jsonb_build_object('desmontagem',conf.value,'retorno',x));
     end if;
    end loop;
   end if;
  end loop;
  for r in select fi.*,fv.horario from free_inscricoes fi join free_vagas fv on fv.id=fi.vaga_id and fv.empresa_id=fi.empresa_id
   where fv.etapa_id=e.id and fi.empresa_id=p_empresa and fv.status<>'CANCELADA' and fi.status='CONFIRMADO'
  loop
   previsto:=e.programado;
   if r.horario ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then previsto:=(e.data+r.horario::time) at time zone 'America/Sao_Paulo';end if;
   if r.checkin_em is null and previsto is not null and now()>previsto+make_interval(mins=>tolerancia) then
    return next base||jsonb_build_object('chave','checkin:'||r.id,'origem','presenca','objeto','presenca','tipo','checkin_ausente','item',r.nome,'quantidade',1,'status','aberta','data',previsto,
     'descricao','Check-in não registrado para inscrição confirmada após o horário previsto. Não comprova falta física.','evidencias',jsonb_build_object('programado',previsto,'inscricao',r.id));
   end if;
   if r.checkin_em is not null and previsto is not null and r.checkin_em>previsto+make_interval(mins=>tolerancia) then
    return next base||jsonb_build_object('chave','checkin-atrasado:'||r.id,'origem','presenca','objeto','presenca','tipo','checkin_atrasado','item',r.nome,'quantidade',1,'status','registrada','data',r.checkin_em,
     'descricao','Check-in registrado após o horário previsto da inscrição.','evidencias',jsonb_build_object('programado',previsto,'checkin',r.checkin_em,'tolerancia_minutos',tolerancia));
   end if;
   if r.checkin_em is not null and r.checkout_em is null and fim is not null and now()>fim+make_interval(mins=>tolerancia) then
    return next base||jsonb_build_object('chave','checkout:'||r.id,'origem','presenca','objeto','presenca','tipo','checkout_ausente','item',r.nome,'quantidade',1,'status','aberta','data',fim,
     'descricao','Check-out não registrado após o encerramento da etapa.','evidencias',jsonb_build_object('checkin',r.checkin_em,'fim_etapa',fim));
   end if;
  end loop;
 end loop;

 for r in select a.*,p.numero_pedido,p.cliente_nome from operacao_alertas_motorista a join separacoes_pedidos p on p.id=a.pedido_id and p.empresa_id=a.empresa_id
  where a.empresa_id=p_empresa and coalesce(p.status_comercial,'')<>'cancelado'
 loop
  return next jsonb_build_object('chave','motorista:'||r.id,'origem','transporte','objeto','transporte','tipo','alerta_motorista','pedido_id',r.pedido_id,'pedido',r.numero_pedido,'cliente',r.cliente_nome,
   'item',r.problema,'quantidade',1,'status',case when r.resolvido_em is not null or upper(r.status) in ('RESOLVIDO','ENCERRADO','FECHADO') then 'resolvida' else 'aberta' end,
   'data',r.criado_em,'descricao',r.observacao,'evidencias',jsonb_build_object('problema',r.problema,'observacao',r.observacao,'resolucao',r.resolucao));
 end loop;
 for r in select t.*,e.pedido_id,e.tipo etapa,p.numero_pedido,p.cliente_nome from operacao_trocas t join operacao_etapas e on e.id=t.etapa_id and e.empresa_id=t.empresa_id
  join separacoes_pedidos p on p.id=e.pedido_id and p.empresa_id=e.empresa_id where t.empresa_id=p_empresa and coalesce(p.status_comercial,'')<>'cancelado'
 loop
  return next jsonb_build_object('chave','troca:'||r.id,'origem','campo','objeto','item','tipo','troca_solicitada','pedido_id',r.pedido_id,'pedido',r.numero_pedido,'cliente',r.cliente_nome,
   'etapa',r.etapa,'item',r.item,'quantidade',r.quantidade,'status',case r.status when 'ENVIADO' then 'encaminhada' when 'CANCELADO' then 'cancelada' else 'aberta' end,'data',r.solicitado_em,
   'descricao',r.motivo,'evidencias',jsonb_build_object('motivo',r.motivo,'descricao',r.descricao,'foto',r.foto_url,'estado',r.status,'enviado_em',r.enviado_em));
 end loop;
 for r in select a.*,inv.nome inventario,inv.aprovado_em,coalesce(i.descricao_total,i.produto) item_nome
  from acervo_inventario_itens a join acervo_inventarios inv on inv.id=a.inventario_id and inv.empresa_id=a.empresa_id
  join itens i on i.id=a.item_id and i.empresa_id=a.empresa_id where a.empresa_id=p_empresa and inv.status='aprovado' and a.contado is not null and a.contado<>a.saldo_base
 loop
  return next jsonb_build_object('chave','inventario:'||r.inventario_id||':'||r.item_id,'origem','inventario','objeto','item','tipo','divergencia_inventario','item_id',r.item_id,'item',r.item_nome,
   'quantidade',abs(r.contado-r.saldo_base),'esperado',r.saldo_base,'conferido',r.contado,'status','registrada','data',r.aprovado_em,
   'descricao','Inventário aprovado com diferença entre saldo-base e contagem física.','evidencias',jsonb_build_object('inventario',r.inventario,'saldo_base',r.saldo_base,'contado',r.contado,'motivo',r.motivo));
 end loop;
 for r in select g.*,coalesce(i.descricao_total,i.produto) item_nome from acervo_contagens_gerais g join itens i on i.id=g.item_id and i.empresa_id=g.empresa_id
  where g.empresa_id=p_empresa and g.status='concluida' and g.esperado is not null and g.contado is not null and g.esperado<>g.contado
 loop
  return next jsonb_build_object('chave','contagem-geral:'||r.id,'origem','inventario','objeto','item','tipo','divergencia_contagem_geral','item_id',r.item_id,'item',r.item_nome,
   'quantidade',abs(r.esperado-r.contado),'esperado',r.esperado,'conferido',r.contado,'status','registrada','data',r.concluida_em,
   'descricao','Contagem geral concluída com diferença entre o esperado no galpão e a contagem física.','evidencias',jsonb_build_object('esperado',r.esperado,'contado',r.contado,'contado_em',r.contado_em));
 end loop;
 for r in select m.*,capas_saldo(m.id) saldo from capas_modelos m where m.empresa_id=p_empresa and m.usa_capa loop
  if (r.saldo->>'disponivel')::numeric<0 and r.estoque_conferido_em is not null then
   return next jsonb_build_object('chave','saldo-material:'||r.id,'origem','materiais','objeto',r.tipo_material,'tipo','estoque_material_negativo','item_id',r.item_id,'item',r.nome,'quantidade',abs((r.saldo->>'disponivel')::numeric),
    'status','aberta','data',r.estoque_conferido_em,'descricao','Saldo disponível negativo de material de proteção; conferir estoque e movimentos.','evidencias',r.saldo);
  elsif r.estoque_conferido_em is null and exists(select 1 from capas_contagens cc where cc.modelo_id=r.id and cc.concluida_em is not null) then
   return next jsonb_build_object('chave','inicial-material:'||r.id,'origem','materiais','objeto',r.tipo_material,'tipo','estoque_material_sem_contagem','item_id',r.item_id,'item',r.nome,'quantidade',1,
    'status','aberta','data',r.criado_em,'descricao','Material utilizado na operação sem contagem inicial do disponível.','evidencias',r.saldo);
  end if;
 end loop;
 -- Respostas operacionais negativas explícitas; não interpreta texto livre ou avaliação comercial.
 for r in select c.id,c.cliente_nome,c.concluido_em,c.respostas from posvenda_contatos c where c.empresa_id=p_empresa and c.status='concluido' and c.atencao loop
  for x in select z from jsonb_array_elements(coalesce(r.respostas,'[]')) z where z->>'id' in ('entrega','moveis','coleta') and z->>'ruim'='true' loop
   return next jsonb_build_object('chave','feedback:'||r.id||':'||(x->>'id'),'origem','posvenda','objeto','atendimento','tipo','feedback_operacional_negativo','cliente',r.cliente_nome,
    'pedido',(select string_agg(p.numero_pedido,', ' order by p.numero_pedido) from posvenda_contato_pedidos cp join separacoes_pedidos p on p.id=cp.pedido_id and p.empresa_id=p_empresa where cp.contato_id=r.id),
    'item',x->>'pergunta','quantidade',1,'status','registrada','data',r.concluido_em,'descricao','Cliente registrou resposta negativa sobre a operação.','evidencias',x);
  end loop;
 end loop;
end $$;
revoke all on function public.ocorrencias_operacionais_fontes(uuid) from public,anon,authenticated;

alter function public.ocorrencias_fontes(uuid) rename to ocorrencias_fontes_antes_ampliacao;
create function public.ocorrencias_fontes(p_empresa uuid) returns setof jsonb
language plpgsql security definer set search_path=public as $$
declare x jsonb;q numeric;atual jsonb;inspecao jsonb;anteriores jsonb:='[]';
begin
 for x in select * from ocorrencias_fontes_antes_ampliacao(p_empresa) loop
  -- A regra de início passa a usar a tolerância configurada, mantendo a chave anterior.
  if x->>'tipo'='atraso_inicio' then continue;end if;
  -- Correções da coleta oficial prevalecem sobre o primeiro registro do acervo.
  if x->>'tipo'='revisao_sem_registro' then
   select qi.dados into inspecao from qualidade_inspecoes qi where qi.empresa_id=p_empresa and qi.item_id=ocorrencia_uuid(x->>'item_id')
    and qi.criado_em<=ocorrencia_instante(x->>'data') order by qi.criado_em desc,qi.id desc limit 1;
   if inspecao->>'status'='Reprovado' then x:=x||jsonb_build_object('tipo','envio_reprovado','descricao','Item efetivamente carregado após inspeção reprovada, sem aprovação registrada antes da saída.',
    'evidencias',jsonb_build_object('carregamento',x->'evidencias','inspecao',inspecao));end if;
  end if;
  if x->>'origem'='acervo' and x->>'tipo' in ('falta','avaria') and x->>'status'<>'perda_confirmada' then
   select c.itens into atual from logistica_confirmacoes c where c.empresa_id=p_empresa and c.pedido_id=ocorrencia_uuid(x->>'pedido_id') and c.etapa='coleta' order by c.versao desc,c.criado_em desc limit 1;
   if atual is not null then
    select sum(ocorrencia_numero(z->>case when x->>'tipo'='falta' then 'nao_coletado' else 'danificado' end)) into q from jsonb_array_elements(atual) z
     where z->>'item_id'=x->>'item_id' and (x->'evidencias'->>'chave' is null or z->>'chave'=x->'evidencias'->>'chave');
    if q=0 then continue;end if;
    if q is not null then x:=x||jsonb_build_object('quantidade',q,'evidencias',jsonb_build_object('registro_inicial',x->'evidencias','coleta_atual',atual));end if;
   end if;
  end if;
  anteriores:=anteriores||jsonb_build_array(x);
 end loop;
 return query with fontes as (
  select z ev from jsonb_array_elements(anteriores) z
  union all select * from ocorrencias_operacionais_fontes(p_empresa)
 ) select distinct on(ev->>'chave') ev from fontes
 order by ev->>'chave',ocorrencia_instante(ev->>'data') desc nulls last,ev::text;
end $$;
revoke all on function public.ocorrencias_fontes(uuid) from public,anon,authenticated;

do $triggers$
declare t text;
begin
 foreach t in array array['logistica_confirmacoes','operacao_registros','operacao_etapa_pessoas','operacao_etapa_caminhoes','operacao_trocas','operacao_alertas_motorista','free_vagas','free_inscricoes','acervo_inventarios','acervo_inventario_itens','acervo_contagens_gerais','posvenda_contatos','operacao_ocorrencias_regras','capas_modelos','itens'] loop
  execute format('create trigger ocorrencias_automaticas after insert or update or delete on public.%I for each row execute function public.ocorrencias_fonte_mudou()',t);
 end loop;
end $triggers$;
notify pgrst,'reload schema';
