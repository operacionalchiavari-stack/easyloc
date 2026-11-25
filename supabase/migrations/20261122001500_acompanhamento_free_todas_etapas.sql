-- Incluir tambem frees de triagem, carregamento e descarregamento.
create or replace function public.logistica_free_acompanhamento(p_empresa uuid,p_inicio date,p_fim date) returns jsonb
language sql stable security definer set search_path=public as $$
  with etapas as (
    select e.*,p.numero_pedido,p.cliente_nome,p.local_nome from operacao_etapas e
      left join separacoes_pedidos p on p.id=e.pedido_id and p.empresa_id=p_empresa
    where e.empresa_id=p_empresa and e.data between p_inicio and p_fim
      and (p.id is null or (coalesce(p.status_comercial,'')<>'cancelado' and coalesce(p.status,'')<>'cancelado'))
      and (exists(select 1 from operacao_etapa_pessoas ep where ep.etapa_id=e.id and ep.empresa_id=p_empresa and ep.free_id is not null)
        or exists(select 1 from free_vagas v where v.etapa_id=e.id and v.empresa_id=p_empresa and v.status<>'CANCELADA'))
  ), vagas as (
    select e.*,v.id vaga_id,v.horario,v.ponto_encontro,v.valor,v.quantidade,v.status vaga_status,v.modo,v.preferidos,v.liberar_em,v.observacao vaga_observacao
    from etapas e left join lateral (select * from free_vagas_v f where f.etapa_id=e.id and f.empresa_id=p_empresa and f.status<>'CANCELADA' limit 1) v on true
  ), pessoas as (
    select v.id etapa_id,ep.free_id from vagas v join operacao_etapa_pessoas ep on ep.etapa_id=v.id and ep.empresa_id=p_empresa where ep.free_id is not null
    union
    select v.id,i.free_id from vagas v join free_inscricoes i on i.vaga_id=v.vaga_id and i.empresa_id=p_empresa
  ), detalhes as (
    select v.id etapa_id,x.free_id,coalesce(f.nome,ep.nome,i.nome,'Free') nome,ep.free_id is not null escalado,
      i.id inscricao_id,i.confirmado_em,i.checkin_em,i.checkout_em,i.motivo,
      case when i.status='CONFIRMADO' then 'confirmado'
        when i.status='CANCELADO' then 'cancelou' when i.status='REMOVIDO' then 'retirado'
        when v.vaga_id is null then 'nao_enviado'
        when f.status is distinct from 'aprovado' then 'cadastro_pendente'
        when v.vaga_status<>'ABERTA' then 'convite_encerrado'
        when (v.modo='EXCLUSIVA' and not coalesce(x.free_id=any(v.preferidos),false))
          or (v.modo='PRIORIDADE' and v.liberar_em>now() and not coalesce(x.free_id=any(v.preferidos),false)) then 'nao_convidado'
        else 'aguardando' end status_app
    from vagas v join pessoas x on x.etapa_id=v.id
      left join free_cadastros f on f.id=x.free_id and f.empresa_id=p_empresa
      left join lateral (select ep.nome,ep.free_id from operacao_etapa_pessoas ep
        where ep.etapa_id=v.id and ep.empresa_id=p_empresa and ep.free_id=x.free_id limit 1) ep on true
      left join lateral (select * from free_inscricoes i where i.vaga_id=v.vaga_id and i.empresa_id=p_empresa and i.free_id=x.free_id
        order by i.confirmado_em desc nulls last,i.id desc limit 1) i on true
  ) select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(v.vaga_id::text,'escala:'||v.id),'etapa_id',v.id,'data',v.data,
    'hora',coalesce(nullif(v.horario,''),to_char(v.hora,'HH24:MI')),'pedido',v.numero_pedido,'cliente',v.cliente_nome,
    'local',v.local_nome,'etapa',v.nome,'ponto_encontro',v.ponto_encontro,'valor',v.valor,'publicado',v.vaga_id is not null,
    'quantidade',greatest(coalesce(v.quantidade,0),q.escalados+q.confirmados-q.confirmados_escalados),'status',coalesce(v.vaga_status,'SEM_CONVITE'),
    'divulgacao',v.modo,'observacao',v.vaga_observacao,'escalados',q.escalados,'confirmados_app',q.confirmados,
    'participantes',coalesce(q.participantes,'[]'::jsonb)) order by v.data,v.hora,v.id),'[]'::jsonb)
  from vagas v cross join lateral (
    select count(*) filter(where d.escalado)::int escalados,count(*) filter(where d.status_app='confirmado')::int confirmados,
      count(*) filter(where d.escalado and d.status_app='confirmado')::int confirmados_escalados,
      jsonb_agg(jsonb_build_object('id',coalesce(d.inscricao_id::text,'escala:'||d.free_id),'free_id',d.free_id,'nome',d.nome,
        'escalado',d.escalado,'status_app',d.status_app,'confirmado_em',case when d.status_app='confirmado' then d.confirmado_em end,
        'checkin',d.checkin_em,'checkout',d.checkout_em,'motivo',d.motivo) order by d.escalado desc,d.nome) participantes
    from detalhes d where d.etapa_id=v.id
  ) q;
$$;
revoke all on function public.logistica_free_acompanhamento(uuid,date,date) from public,anon,authenticated;

notify pgrst,'reload schema';
