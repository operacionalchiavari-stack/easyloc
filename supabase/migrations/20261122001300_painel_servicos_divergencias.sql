-- Vagas anunciadas e divergências de Frete, Free e Uber no Painel Logístico.
create table public.logistica_divergencias_tratamentos (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  chave text not null, versao text not null, dados jsonb not null,
  motivo text not null check(length(btrim(motivo)) between 3 and 2000),
  tratado_por uuid not null, tratado_por_nome text not null, tratado_em timestamptz not null default now(),
  primary key(empresa_id,chave,versao)
);
alter table public.logistica_divergencias_tratamentos enable row level security;
revoke all on public.logistica_divergencias_tratamentos from anon,authenticated;

create function public.logistica_servicos_autorizar(p_empresa uuid,p_editar boolean default false) returns void
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not coalesce(eh_membro_empresa(p_empresa),false) or not coalesce(seguranca_2fa_ok(),false)
     or not coalesce(operacao_pode(p_empresa,case when p_editar then 'logistica.planejamento.editar' else 'logistica.planejamento.visualizar' end),false) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
end $$;
revoke all on function public.logistica_servicos_autorizar(uuid,boolean) from public,anon,authenticated;

create function public.logistica_anuncios_lista(p_empresa uuid,p_tipo text,p_inicio date,p_fim date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  perform logistica_servicos_autorizar(p_empresa);
  if p_inicio is null or p_fim is null or p_fim<p_inicio then raise exception 'Informe um período válido';end if;
  if p_tipo='free' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'data',v.data,'hora',v.horario,'pedido',v.pedido,'cliente',v.cliente,
      'local',v.local,'etapa',v.etapa,'ponto_encontro',v.ponto_encontro,'valor',v.valor,'quantidade',v.quantidade,'status',v.status,
      'divulgacao',v.modo,'observacao',v.observacao,'participantes',coalesce((select jsonb_agg(jsonb_build_object(
        'id',i.id,'nome',i.nome,'checkin',i.checkin_em,'checkout',i.checkout_em) order by i.nome)
        from free_inscricoes i where i.vaga_id=v.id and i.empresa_id=p_empresa and i.status='CONFIRMADO'),'[]'::jsonb)) order by v.data,v.horario)
      from free_vagas_v v where v.empresa_id=p_empresa and v.status<>'CANCELADA' and v.data between p_inicio and p_fim),'[]'::jsonb);
  elsif p_tipo='uber' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'data',v.data,'hora',v.hora,'pedido',p.numero_pedido,'cliente',p.cliente_nome,
      'local',v.destino,'etapa',e.nome,'ponto_encontro',v.ponto_encontro,'valor',v.valor,'quantidade',v.quantidade,'status',v.status,
      'observacao',v.obs,'participantes',coalesce((select jsonb_agg(jsonb_build_object(
        'id',c.id,'nome',m.nome,'checkin',c.checkin_em,'checkout',c.checkout_em) order by m.nome)
        from uber_corridas c join uber_motoristas m on m.id=c.motorista_id and m.empresa_id=p_empresa
        where c.vaga_id=v.id and c.empresa_id=p_empresa and c.status<>'cancelada'),'[]'::jsonb)) order by v.data,v.hora)
      from uber_vagas v left join separacoes_pedidos p on p.id=v.pedido_id and p.empresa_id=p_empresa
        left join operacao_etapas e on e.id=v.etapa_id and e.empresa_id=p_empresa
      where v.empresa_id=p_empresa and v.status<>'cancelada' and v.data between p_inicio and p_fim),'[]'::jsonb);
  end if;
  raise exception 'Serviço inválido';
end $$;

-- Somente inconsistências objetivas: diferença de valor registrado, falta após a janela do app,
-- saída ausente após 24h e marcações invertidas. Trabalho ainda em curso não vira divergência.
create function public.logistica_divergencias_candidatas(p_empresa uuid) returns table(chave text,versao text,dados jsonb)
language sql stable security definer set search_path=public as $$
  with ocorrencias as (
    select 'uber:'||c.id||':'||d.tipo chave,jsonb_build_object('origem','uber','referencia',c.id,'tipo',d.categoria,'titulo',d.titulo,
      'nome',m.nome,'data',v.data,'hora',v.hora,'pedido',p.numero_pedido,'cliente',p.cliente_nome,'local',v.destino,
      'checkin',c.checkin_em,'checkout',c.checkout_em,'valor_previsto',c.valor,'valor_informado',c.valor_final,'observacao',c.obs_logistica) dados
    from uber_corridas c join uber_vagas v on v.id=c.vaga_id and v.empresa_id=p_empresa
      join uber_motoristas m on m.id=c.motorista_id and m.empresa_id=p_empresa
      left join separacoes_pedidos p on p.id=v.pedido_id and p.empresa_id=p_empresa
      cross join lateral (values
        ('valor','valor','Valor conferido diferente do combinado',c.valor_final is not null and abs(c.valor_final-c.valor)>0.009 and c.fechamento_id is null),
        ('entrada','presenca','Entrada não registrada',c.checkin_em is null and c.checkout_em is null and
          now()>((v.data+coalesce(v.hora,time '23:59')) at time zone 'America/Sao_Paulo')+interval '12 hours'),
        ('saida','presenca','Saída não registrada após 24 horas',c.checkin_em is not null and c.checkout_em is null and now()>c.checkin_em+interval '24 hours'),
        ('horario','horario','Horários de entrada e saída inconsistentes',c.checkout_em is not null and (c.checkin_em is null or c.checkout_em<c.checkin_em))
      ) d(tipo,categoria,titulo,ocorre)
    where c.empresa_id=p_empresa and c.status<>'cancelada' and v.status<>'cancelada' and d.ocorre
    union all
    select 'free:'||i.id||':'||d.tipo,jsonb_build_object('origem','free','referencia',i.id,'tipo',d.categoria,'titulo',d.titulo,
      'nome',i.nome,'data',v.data,'hora',v.horario,'pedido',v.pedido,'cliente',v.cliente,'local',v.local,
      'checkin',i.checkin_em,'checkout',i.checkout_em,'valor_previsto',v.valor,'ajuste',pg.ajuste,
      'valor_informado',case when d.tipo='pagamento' then pg.valor_pago else v.valor+coalesce(pg.ajuste,0) end,
      'valor_enviado',pg.valor_enviado,'observacao',pg.motivo_ajuste,'data_ciente',i.data_ciente,'horario_ciente',i.horario_ciente)
    from free_inscricoes i join free_vagas_v v on v.id=i.vaga_id and v.empresa_id=p_empresa
      left join free_rh_pagamentos pg on pg.inscricao_id=i.id and pg.empresa_id=p_empresa
      cross join lateral (values
        ('valor','valor','Diária com ajuste de valor',coalesce(pg.ajuste,0)<>0 and pg.fechamento_id is null and not coalesce(pg.nao_pagar,false)),
        ('pagamento','valor','Valor pago diferente do enviado',pg.pago_em is not null and pg.valor_pago is not null and pg.valor_enviado is not null and abs(pg.valor_pago-pg.valor_enviado)>0.009),
        ('entrada','presenca','Entrada não registrada',i.checkin_em is null and i.checkout_em is null and free_fase(v.status,v.data,v.horario,i.checkin_em,i.checkout_em)='FALTOU'),
        ('saida','presenca','Saída não registrada após 24 horas',i.checkin_em is not null and i.checkout_em is null and free_fase(v.status,v.data,v.horario,i.checkin_em,i.checkout_em)='SEM_CHECKOUT'),
        ('horario','horario','Horários de entrada e saída inconsistentes',i.checkout_em is not null and (i.checkin_em is null or i.checkout_em<i.checkin_em)),
        ('programacao','horario','Programação mudou após o aceite',i.checkin_em is not null and
          ((nullif(i.data_ciente,'') is not null and i.data_ciente<>v.data::text) or
           (nullif(i.horario_ciente,'') is not null and i.horario_ciente<>v.horario)))
      ) d(tipo,categoria,titulo,ocorre)
    where i.empresa_id=p_empresa and i.status='CONFIRMADO' and v.status<>'CANCELADA' and d.ocorre
  ) select chave,md5(dados::text),dados from ocorrencias;
$$;
revoke all on function public.logistica_divergencias_candidatas(uuid) from public,anon,authenticated;

create function public.logistica_divergencias_lista(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare fretes jsonb; abertas jsonb; resolvidas jsonb;
begin
  perform logistica_servicos_autorizar(p_empresa);
  fretes:=frete_div_lista(p_empresa);
  select coalesce(jsonb_agg(c.dados||jsonb_build_object('chave',c.chave,'versao',c.versao) order by c.dados->>'data'),'[]'::jsonb)
    into abertas from logistica_divergencias_candidatas(p_empresa) c
    where not exists(select 1 from logistica_divergencias_tratamentos t where t.empresa_id=p_empresa and t.chave=c.chave and t.versao=c.versao);
  select coalesce(jsonb_agg(t.dados||jsonb_build_object('chave',t.chave,'versao',t.versao,'motivo',t.motivo,
    'tratado_por',t.tratado_por_nome,'tratado_em',t.tratado_em) order by t.tratado_em desc),'[]'::jsonb)
    into resolvidas from logistica_divergencias_tratamentos t where t.empresa_id=p_empresa and t.tratado_em>now()-interval '30 days';
  select abertas||coalesce(jsonb_agg(jsonb_build_object('origem','frete','chave','frete:'||(f->>'id'),'referencia',f->>'id',
      'tipo','valor','nome',f->>'freteiro','data',f->>'data','local',f->>'destino','titulo',case f->>'divergencia'
        when 'sem_frete' then 'Frete não encontrado no sistema' when 'nao_lancado' then 'Frete não lançado no relatório' else 'Valor diferente do combinado' end,
      'valor_previsto',f->'valor_sistema','valor_informado',coalesce(f->'total',f->'valor'),'observacao',f->>'explicacao','registro',f)),'[]'::jsonb)
    into abertas from jsonb_array_elements(coalesce(fretes->'abertas','[]')) f;
  select resolvidas||coalesce(jsonb_agg(jsonb_build_object('origem','frete','chave','frete:'||(f->>'id'),'tipo','valor',
      'nome',f->>'freteiro','data',f->>'data','local',f->>'destino','titulo','Divergência de frete',
      'motivo',f->>'decisao_motivo','tratado_por',f->>'decisao_por','tratado_em',f->>'decisao_em','valor_informado',f->'valor_final','registro',f)),'[]'::jsonb)
    into resolvidas from jsonb_array_elements(coalesce(fretes->'resolvidas','[]')) f;
  return jsonb_build_object('abertas',abertas,'resolvidas',resolvidas);
end $$;

create function public.logistica_divergencia_tratar(p_empresa uuid,p_chave text,p_versao text,p_motivo text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c record;
begin
  perform logistica_servicos_autorizar(p_empresa,true);
  if length(btrim(coalesce(p_motivo,''))) not between 3 and 2000 then raise exception 'Informe a solução ou justificativa (de 3 a 2000 caracteres)';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_chave,0));
  select * into c from logistica_divergencias_candidatas(p_empresa) where chave=p_chave;
  if not found or c.versao is distinct from p_versao then raise exception 'A divergência mudou. Atualize a lista antes de registrar o tratamento';end if;
  if exists(select 1 from logistica_divergencias_tratamentos where empresa_id=p_empresa and chave=p_chave and versao=p_versao) then raise exception 'Divergência já tratada';end if;
  insert into logistica_divergencias_tratamentos(empresa_id,chave,versao,dados,motivo,tratado_por,tratado_por_nome)
    values(p_empresa,c.chave,c.versao,c.dados,btrim(p_motivo),auth.uid(),logistica_nome_usuario(p_empresa));
  return logistica_divergencias_lista(p_empresa);
end $$;
revoke all on function public.logistica_anuncios_lista(uuid,text,date,date),public.logistica_divergencias_lista(uuid),
  public.logistica_divergencia_tratar(uuid,text,text,text) from public,anon;
grant execute on function public.logistica_anuncios_lista(uuid,text,date,date),public.logistica_divergencias_lista(uuid),
  public.logistica_divergencia_tratar(uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
