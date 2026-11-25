-- Fretes, Free e Uber anunciados no mesmo formato (Painel Logístico): um serviço por vaga/anúncio,
-- agrupado por pedido na tela, com quem aceitou, QR, check-in, check-out e local do check-in.
create or replace function public.logistica_anunciados(p_empresa uuid,p_tipo text,p_inicio date,p_fim date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  perform logistica_servicos_autorizar(p_empresa);
  if p_inicio is null or p_fim is null or p_fim<p_inicio then raise exception 'Informe um período válido';end if;

  if p_tipo='frete' then
    return coalesce((select jsonb_agg(jsonb_build_object(
      'tipo','frete','id',a.id,'ativo',a.status='aceito','pedido_id',a.pedido_id,'pedido',p.numero_pedido,'cliente',p.cliente_nome,
      'cliente_foto',ce.catalogo_logo_url,'local',coalesce(nullif(p.local_nome,''),a.destino),'data',a.data,'hora',to_char(a.hora,'HH24:MI'),
      'etapa',case a.direcao when 'entrega' then 'Entrega' when 'coleta' then 'Coleta' else initcap(coalesce(a.direcao,'Frete')) end,
      'valor',a.valor,'quantidade',1,'ponto',a.ponto_encontro,
      'linhas',case when a.freteiro_id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
        'nome',coalesce(f.nome,'Freteiro'),'foto',null,
        'detalhe',nullif(concat_ws(' · ',nullif(f.veiculo_modelo,''),nullif(f.veiculo_placa,'')),''),
        'confirmado',a.aceito_em is not null,'confirmado_em',a.aceito_em,'situacao',case when a.status='aceito' then 'confirmado' else a.status end,
        'checkin',a.checkin_em,'checkout',a.checkout_em,'lat',a.checkin_lat,'lng',a.checkin_lng,
        'distancia',app_distancia_m(a.checkin_lat,a.checkin_lng,a.destino_lat,a.destino_lng),'referencia','do local do evento')) end
      ) order by a.data,a.hora)
      from frete_anuncios a
      left join separacoes_pedidos p on p.id=a.pedido_id and p.empresa_id=p_empresa
      left join clientes_empresas ce on ce.id=p.cliente_id
      left join frete_freteiros f on f.id=a.freteiro_id and f.empresa_id=p_empresa
      where a.empresa_id=p_empresa and a.data between p_inicio and p_fim and coalesce(a.status,'')<>'cancelado'
        and a.cancelado_em is null),'[]'::jsonb);

  elsif p_tipo='uber' then
    return coalesce((select jsonb_agg(jsonb_build_object(
      'tipo','uber','id',v.id,'ativo',v.status='aberta','etapa_id',v.etapa_id,'pedido_id',v.pedido_id,'pedido',p.numero_pedido,'cliente',p.cliente_nome,
      'cliente_foto',ce.catalogo_logo_url,'local',coalesce(nullif(p.local_nome,''),v.destino),'data',v.data,'hora',to_char(v.hora,'HH24:MI'),
      'etapa',coalesce(e.nome,'Uber')||case when v.ida_volta then ' · ida e volta' else '' end,
      'valor',v.valor,'quantidade',v.quantidade,'ponto',v.ponto_encontro,
      'linhas',coalesce((select jsonb_agg(jsonb_build_object(
        'nome',coalesce(m.nome,'Motorista'),'foto',null,
        'detalhe',nullif(concat_ws(' · ',nullif(m.carro_modelo,''),nullif(m.carro_cor,''),nullif(m.carro_placa,'')),''),
        'confirmado',true,'confirmado_em',c.confirmado_em,'situacao','confirmado',
        'checkin',c.checkin_em,'checkout',c.checkout_em,'lat',c.checkin_lat,'lng',c.checkin_lng,
        'distancia',app_distancia_m(c.checkin_lat,c.checkin_lng,v.ponto_lat,v.ponto_lng),'referencia','do ponto de encontro',
        'valor',coalesce(c.valor_final,c.valor)) order by m.nome)
        from uber_corridas c left join uber_motoristas m on m.id=c.motorista_id and m.empresa_id=p_empresa
        where c.vaga_id=v.id and c.empresa_id=p_empresa and c.status<>'cancelada'),'[]'::jsonb)
      ) order by v.data,v.hora)
      from uber_vagas v
      left join separacoes_pedidos p on p.id=v.pedido_id and p.empresa_id=p_empresa
      left join clientes_empresas ce on ce.id=p.cliente_id
      left join operacao_etapas e on e.id=v.etapa_id and e.empresa_id=p_empresa
      where v.empresa_id=p_empresa and v.status<>'cancelada' and v.data between p_inicio and p_fim),'[]'::jsonb);

  elsif p_tipo='free' then
    return coalesce((select jsonb_agg(jsonb_build_object(
      'tipo','free','id',v.id,'ativo',v.status='ABERTA','etapa_id',v.etapa_id,'pedido_id',v.pedido_id,'pedido',v.pedido,'cliente',v.cliente,
      'cliente_foto',ce.catalogo_logo_url,'local',v.local,'data',v.data,'hora',v.horario,'etapa',v.etapa,
      'valor',v.valor,'quantidade',v.quantidade,'ponto',v.ponto_encontro,
      'linhas',coalesce((select jsonb_agg(x.l order by x.ordem,x.nome) from (
        select 0 ordem,i.nome,jsonb_build_object('nome',coalesce(f.nome,i.nome),'foto',f.foto_url,'detalhe',null,
          'confirmado',true,'confirmado_em',i.confirmado_em,'situacao','confirmado',
          'checkin',i.checkin_em,'checkout',i.checkout_em,'lat',i.checkin_lat,'lng',i.checkin_lng,
          'distancia',coalesce(i.checkin_distancia,app_distancia_m(i.checkin_lat,i.checkin_lng,v.ponto_lat,v.ponto_lng)),
          'referencia','do ponto de encontro','manual',nullif(i.presenca_por,'')) l
        from free_inscricoes i left join free_cadastros f on f.id=i.free_id and f.empresa_id=p_empresa
        where i.vaga_id=v.id and i.empresa_id=p_empresa and i.status='CONFIRMADO'
        union all
        select 1,coalesce(f.nome,ep.nome),jsonb_build_object('nome',coalesce(f.nome,ep.nome,'Free'),'foto',f.foto_url,'detalhe','Escalado no Painel',
          'confirmado',false,'confirmado_em',null,'situacao','aguardando','checkin',null,'checkout',null)
        from operacao_etapa_pessoas ep left join free_cadastros f on f.id=ep.free_id and f.empresa_id=p_empresa
        where ep.etapa_id=v.etapa_id and ep.empresa_id=p_empresa and ep.free_id is not null
          and not exists(select 1 from free_inscricoes i2 where i2.vaga_id=v.id and i2.free_id=ep.free_id and i2.status='CONFIRMADO')
      ) x),'[]'::jsonb)
      ) order by v.data,v.horario)
      from free_vagas_v v
      left join separacoes_pedidos p on p.id=v.pedido_id and p.empresa_id=p_empresa
      left join clientes_empresas ce on ce.id=p.cliente_id
      where v.empresa_id=p_empresa and v.status<>'CANCELADA' and v.data between p_inicio and p_fim
        and (p.id is null or (coalesce(p.status_comercial,'')<>'cancelado' and coalesce(p.status,'')<>'cancelado'))),'[]'::jsonb);
  end if;
  raise exception 'Serviço inválido';
end $$;
revoke all on function public.logistica_anunciados(uuid,text,date,date) from public,anon;
grant execute on function public.logistica_anunciados(uuid,text,date,date) to authenticated;

-- QR para a equipe mostrar na tela (o mesmo código de 6 números dos apps, troca a cada minuto).
create or replace function public.logistica_anunciado_qr(p_empresa uuid,p_tipo text,p_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare j bigint:=floor(extract(epoch from now())/60)::bigint; cod text;
begin
  perform logistica_servicos_autorizar(p_empresa);
  if p_tipo='free' then
    if not exists(select 1 from free_vagas where id=p_id and empresa_id=p_empresa) then raise exception 'Vaga não encontrada';end if;
    cod:=free_codigo_qr(p_id,free_janela());
  elsif p_tipo='uber' then
    if not exists(select 1 from uber_vagas where id=p_id and empresa_id=p_empresa) then raise exception 'Vaga não encontrada';end if;
    cod:=uber_codigo_qr(p_id,j);
  elsif p_tipo='frete' then
    if not exists(select 1 from frete_anuncios where id=p_id and empresa_id=p_empresa) then raise exception 'Frete não encontrado';end if;
    cod:=frete_codigo_qr(p_id,j);
  else raise exception 'Serviço inválido';
  end if;
  return jsonb_build_object('codigo',cod,'trocaEm',((j+1)*60000-floor(extract(epoch from now())*1000))::bigint);
end $$;
revoke all on function public.logistica_anunciado_qr(uuid,text,uuid) from public,anon;
grant execute on function public.logistica_anunciado_qr(uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
