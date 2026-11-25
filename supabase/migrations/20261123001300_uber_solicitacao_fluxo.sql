-- Uber: exibe e preserva a solicitacao interna do supervisor no fluxo completo.

create or replace function public.uber_vaga_json(v uber_vagas, p_equipe boolean) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', v.id, 'solicitacao_interna',v.solicitacao_interna,'solicitacao_motivo',v.solicitacao_motivo,'solicitacao_motorista_id',v.solicitacao_motorista_id,'pedido',(select p.numero_pedido from separacoes_pedidos p where p.id=v.pedido_id and p.empresa_id=v.empresa_id),'etapa_id', v.etapa_id, 'pedido_id', v.pedido_id, 'quantidade', v.quantidade, 'ida_volta', v.ida_volta,
    'ponto_encontro', v.ponto_encontro, 'ponto_lat', v.ponto_lat, 'ponto_lng', v.ponto_lng, 'destino', v.destino, 'destino_lat', v.destino_lat,
    'destino_lng', v.destino_lng, 'km', v.km, 'valor', v.valor, 'data', v.data, 'hora', to_char(v.hora, 'HH24:MI'), 'obs', v.obs, 'status', v.status,
    'etapa', (select e.nome from operacao_etapas e where e.id = v.etapa_id),
    'confirmadas', (select count(*) from uber_corridas c where c.vaga_id = v.id and c.status <> 'cancelada'))
  || case when p_equipe then jsonb_build_object(
       'pedido', (select numero_pedido from separacoes_pedidos where id = v.pedido_id),
       'cliente', (select cliente_nome from separacoes_pedidos where id = v.pedido_id),
       'corridas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status, 'motorista', m.nome, 'telefone', m.telefone,
            'carro', concat_ws(' · ', m.carro_modelo, m.carro_cor, m.carro_placa), 'checkin_em', c.checkin_em, 'checkout_em', c.checkout_em) order by c.confirmado_em)
          from uber_corridas c join uber_motoristas m on m.id = c.motorista_id where c.vaga_id = v.id and c.status <> 'cancelada'), '[]'))
     else '{}'::jsonb end
$$;

create or replace function public.uber_corrida_json(c uber_corridas) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'vaga_id', c.vaga_id, 'status', c.status, 'valor', c.valor, 'confirmado_em', c.confirmado_em, 'checkin_em', c.checkin_em,
    'checkout_em', c.checkout_em, 'cancelado_em', c.cancelado_em, 'cancelado_por', c.cancelado_por,
    'pago', exists (select 1 from logistica_fechamentos f join fin_pagar p on p.id = f.pagar_id where f.id = c.fechamento_id and p.status = 'pago'),
    'vaga', (select jsonb_build_object('solicitacao_interna',v.solicitacao_interna,'solicitacao_motivo',v.solicitacao_motivo,'pedido',(select p.numero_pedido from separacoes_pedidos p where p.id=v.pedido_id and p.empresa_id=v.empresa_id),'data', v.data, 'hora', to_char(v.hora, 'HH24:MI'), 'ponto_encontro', v.ponto_encontro, 'ponto_lat', v.ponto_lat,
               'ponto_lng', v.ponto_lng, 'destino', v.destino, 'km', v.km, 'ida_volta', v.ida_volta, 'obs', v.obs, 'status', v.status)
             from uber_vagas v where v.id = c.vaga_id))
$$;

create or replace function public.uber_app(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'motorista'); m uber_motoristas := uber_motorista(s);
begin
  return jsonb_build_object(
    'perfil', jsonb_build_object('nome', m.nome, 'telefone', m.telefone, 'pix', m.chave_pix, 'carro_modelo', m.carro_modelo, 'carro_placa', m.carro_placa, 'carro_cor', m.carro_cor),
    'disponiveis', coalesce((select jsonb_agg(uber_vaga_json(v, false) order by v.data, v.hora) from uber_vagas v
        where v.empresa_id = m.empresa_id and v.status = 'aberta' and (v.solicitacao_interna or logistica_anuncio_datas_liberadas(v.empresa_id,v.pedido_id,v.etapa_id))
          and ((v.solicitacao_interna and v.solicitacao_motorista_id=m.id and v.solicitacao_autorizada_em is not null and v.criado_por is not null) or (not v.solicitacao_interna and exists(select 1 from separacoes_pedidos p where p.id=v.pedido_id and p.empresa_id=v.empresa_id))) and v.data >= (now() at time zone 'America/Sao_Paulo')::date
          and (select count(*) from uber_corridas c where c.vaga_id = v.id and c.status <> 'cancelada') < v.quantidade
          and not exists (select 1 from uber_corridas c where c.vaga_id = v.id and c.motorista_id = m.id and c.status <> 'cancelada')), '[]'),
    'minhas', coalesce((select jsonb_agg(uber_corrida_json(c) order by v.data desc, v.hora desc) from uber_corridas c join uber_vagas v on v.id = c.vaga_id
        where c.motorista_id = m.id and (c.status in ('confirmada', 'em_andamento') or c.created_at > now() - interval '90 days')), '[]'));
end $$;

create or replace function public.uber_aceitar(p_token text, p_vaga uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'motorista'); m uber_motoristas := uber_motorista(s); v uber_vagas; n int;
begin
  select * into v from uber_vagas where id = p_vaga and empresa_id = m.empresa_id for update;
  if v.id is null or v.status <> 'aberta' then raise exception 'Esta corrida não está mais disponível.'; end if;
  perform uber_vinculo_validar(m.empresa_id,v.id,m.id);
  if not v.solicitacao_interna and not logistica_anuncio_datas_liberadas(v.empresa_id,v.pedido_id,v.etapa_id) then raise exception 'As datas deste pedido ainda precisam ser confirmadas.'; end if;
  if v.data < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Esta corrida já passou.'; end if;
  if exists (select 1 from uber_corridas where vaga_id = v.id and motorista_id = m.id and status <> 'cancelada') then raise exception 'Você já aceitou esta corrida.'; end if;
  select count(*) into n from uber_corridas where vaga_id = v.id and status <> 'cancelada';
  if n >= v.quantidade then raise exception 'Outro motorista aceitou antes. Esta corrida não está mais disponível.'; end if;
  insert into uber_corridas (empresa_id, vaga_id, motorista_id, valor) values (m.empresa_id, v.id, m.id, v.valor);
  return uber_app(p_token);
end $$;

create or replace function public.uber_fechar(p_empresa uuid, p_corridas uuid[], p_vencimento date, p_obs text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; nm int; mot uuid; mnome text; total numeric; fech logistica_fechamentos; pg uuid; num int; r record; doc text;
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão para fechar corridas.'; end if;
  if p_vencimento is null then raise exception 'Informe o vencimento do pagamento.'; end if;
  if coalesce(array_length(p_corridas, 1), 0) = 0 then raise exception 'Selecione as corridas.'; end if;
  perform 1 from uber_corridas where id = any(p_corridas) and empresa_id = p_empresa for update;
  select count(*), count(distinct motorista_id), min(motorista_id::text)::uuid, coalesce(sum(valor_final), 0) into n, nm, mot, total
    from uber_corridas where id = any(p_corridas) and empresa_id = p_empresa;
  if n <> array_length(p_corridas, 1) then raise exception 'Alguma corrida não foi encontrada.'; end if;
  if nm <> 1 then raise exception 'Feche um motorista por vez.'; end if;
  if exists (select 1 from uber_corridas where id = any(p_corridas) and (status <> 'concluida' or fechamento_id is not null)) then raise exception 'Alguma corrida não está concluída ou já foi fechada.'; end if;
  if exists (select 1 from uber_corridas where id = any(p_corridas) and conferido_em is null) then raise exception 'Confira todas as corridas selecionadas antes de fechar.'; end if;
  if total <= 0 then raise exception 'O total precisa ser maior que zero.'; end if;
  select nome into mnome from uber_motoristas where id = mot;
  perform pg_advisory_xact_lock(hashtextextended('logistica_fech:' || p_empresa::text, 0));
  select coalesce(max(numero), 0) + 1 into num from logistica_fechamentos where empresa_id = p_empresa and tipo = 'uber';
  doc := 'UB-' || lpad(num::text, 4, '0');
  insert into logistica_fechamentos (empresa_id, tipo, numero, motorista_id, beneficiario, total, vencimento, obs, criado_por_nome)
  values (p_empresa, 'uber', num, mot, mnome, round(total, 2), p_vencimento, nullif(btrim(coalesce(p_obs, '')), ''), logistica_nome_usuario(p_empresa)) returning * into fech;
  -- Valida e vincula as corridas antes da criacao do titulo financeiro.
  update uber_corridas set fechamento_id=fech.id where id=any(p_corridas) and empresa_id=p_empresa;
  perform fin_semear(p_empresa);
  insert into fin_pagar (empresa_id, origem, origem_id, fornecedor_nome, documento, descricao, emissao, competencia, vencimento, valor, parcela, parcelas,
                         forma, categoria_id, observacoes, criado_por)
  values (p_empresa, 'uber', fech.id, mnome, doc, 'Corridas ' || doc || ' · ' || mnome || ' · ' || n || ' corrida(s)', current_date, current_date, p_vencimento,
          round(total, 2), 1, 1, 'pix', fin_categoria(p_empresa, 'uber'),
          concat_ws(E'\n', 'Fechamento do Controle de Uber (' || doc || ').', 'PIX: ' || (select chave_pix from uber_motoristas where id = mot), nullif(btrim(coalesce(p_obs, '')), '')), auth.uid())
  returning id into pg;
  update logistica_fechamentos set pagar_id = pg where id = fech.id;
  for r in select v.pedido_id, sum(c.valor_final) valor, count(*) qtd from uber_corridas c join uber_vagas v on v.id = c.vaga_id
            where c.id = any(p_corridas) and v.pedido_id is not null group by v.pedido_id loop
    if r.valor > 0 then
      insert into fin_custos_evento (empresa_id, pedido_id, categoria, descricao, valor, pagar_id, fechamento_id, criado_por)
      values (p_empresa, r.pedido_id, 'uber', 'Uber ' || doc || ' · ' || mnome || ' · ' || r.qtd || ' corrida(s)', round(r.valor, 2), pg, fech.id, auth.uid());
      delete from fin_resultados_revisados where pedido_id = r.pedido_id;
    end if;
  end loop;
  update uber_corridas set fechamento_id = fech.id where id = any(p_corridas);
  return jsonb_build_object('ok', true, 'id', fech.id, 'documento', doc, 'total', round(total, 2), 'pagar_id', pg);
end $$;

create or replace function public.uber_controle(p_empresa uuid, p_de date default null, p_ate date default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.visualizar') then raise exception 'Sem permissão.'; end if;
  return jsonb_build_object(
    'corridas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status, 'valor', c.valor, 'valor_final', c.valor_final,
         'obs', c.obs_logistica, 'conferido_em', c.conferido_em, 'conferido_por', c.conferido_por, 'fechamento_id', c.fechamento_id,
         'checkin_em', c.checkin_em, 'checkout_em', c.checkout_em, 'motorista_id', m.id, 'motorista', m.nome, 'telefone', m.telefone, 'pix', m.chave_pix,
         'carro', concat_ws(' · ', m.carro_modelo, m.carro_cor, m.carro_placa), 'data', v.data, 'hora', to_char(v.hora, 'HH24:MI'),
         'ponto_encontro', v.ponto_encontro, 'destino', v.destino, 'km', v.km, 'ida_volta', v.ida_volta,
         'solicitacao_interna',v.solicitacao_interna,'solicitacao_motivo',v.solicitacao_motivo,'etapa', e.nome, 'pedido_id', p.id, 'pedido', p.numero_pedido, 'cliente', p.cliente_nome) order by v.data desc, v.hora desc)
       from uber_corridas c join uber_vagas v on v.id = c.vaga_id join uber_motoristas m on m.id = c.motorista_id
       left join operacao_etapas e on e.id = v.etapa_id left join separacoes_pedidos p on p.id = v.pedido_id
      where c.empresa_id = p_empresa and c.status in ('em_andamento', 'concluida')
        and (c.fechamento_id is null or ((p_de is null or v.data >= p_de) and (p_ate is null or v.data <= p_ate)))), '[]'),
    'fechamentos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'numero', f.numero, 'beneficiario', f.beneficiario, 'total', f.total,
         'vencimento', f.vencimento, 'status', f.status, 'criado_em', f.criado_em, 'criado_por', f.criado_por_nome, 'pagar_status', fp.status) order by f.criado_em desc)
       from logistica_fechamentos f left join fin_pagar fp on fp.id = f.pagar_id
      where f.empresa_id = p_empresa and f.tipo = 'uber' and f.criado_em > now() - interval '180 days'), '[]'));
end $$;

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
      'tipo','uber','id',v.id,'solicitacao_interna',v.solicitacao_interna,'solicitacao_motivo',v.solicitacao_motivo,'ativo',v.status='aberta','etapa_id',v.etapa_id,'pedido_id',v.pedido_id,'pedido',p.numero_pedido,'cliente',p.cliente_nome,
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
    -- etapas com vaga publicada OU com free escalado no Painel (mesmo sem vaga publicada no app)
    return coalesce((select jsonb_agg(jsonb_build_object(
      'tipo','free','id',v.id,'ativo',v.id is not null and v.status='ABERTA','publicado',v.id is not null,'etapa_id',e.id,
      'pedido_id',e.pedido_id,'pedido',p.numero_pedido,'cliente',p.cliente_nome,'cliente_foto',ce.catalogo_logo_url,'local',p.local_nome,
      'data',e.data,'hora',coalesce(nullif(v.horario,''),to_char(e.hora,'HH24:MI')),'etapa',e.nome,
      'valor',v.valor,'quantidade',coalesce(v.quantidade,0),'ponto',v.ponto_encontro,
      'linhas',coalesce((select jsonb_agg(x.l order by x.ordem,x.nome) from (
        select 0 ordem,i.nome,jsonb_build_object('nome',coalesce(f.nome,i.nome),'foto',f.foto_url,'detalhe',null,
          'confirmado',true,'confirmado_em',i.confirmado_em,'situacao','confirmado',
          'checkin',i.checkin_em,'checkout',i.checkout_em,'lat',i.checkin_lat,'lng',i.checkin_lng,
          'distancia',coalesce(i.checkin_distancia,app_distancia_m(i.checkin_lat,i.checkin_lng,v.ponto_lat,v.ponto_lng)),
          'referencia','do ponto de encontro','manual',nullif(i.presenca_por,'')) l
        from free_inscricoes i left join free_cadastros f on f.id=i.free_id and f.empresa_id=p_empresa
        where v.id is not null and i.vaga_id=v.id and i.empresa_id=p_empresa and i.status='CONFIRMADO'
        union all
        select 1,coalesce(f.nome,ep.nome),jsonb_build_object('nome',coalesce(f.nome,ep.nome,'Free'),'foto',f.foto_url,
          'detalhe',case when v.id is null then 'Escalado · vaga não publicada no app' else 'Escalado · falta aceitar no app' end,
          'confirmado',false,'confirmado_em',null,'situacao',case when v.id is null then 'nao_publicado' else 'aguardando' end,
          'checkin',null,'checkout',null)
        from operacao_etapa_pessoas ep left join free_cadastros f on f.id=ep.free_id and f.empresa_id=p_empresa
        where ep.etapa_id=e.id and ep.empresa_id=p_empresa and ep.free_id is not null
          and (v.id is null or not exists(select 1 from free_inscricoes i2 where i2.vaga_id=v.id and i2.free_id=ep.free_id and i2.status='CONFIRMADO'))
      ) x),'[]'::jsonb)
      ) order by e.data,e.hora)
      from operacao_etapas e
      left join lateral (select v0.* from free_vagas_v v0
        where v0.etapa_id=e.id and v0.empresa_id=p_empresa and v0.status<>'CANCELADA' limit 1) v on true
      left join separacoes_pedidos p on p.id=e.pedido_id and p.empresa_id=p_empresa
      left join clientes_empresas ce on ce.id=p.cliente_id
      where e.empresa_id=p_empresa and e.data between p_inicio and p_fim
        and (p.id is null or (coalesce(p.status_comercial,'')<>'cancelado' and coalesce(p.status,'')<>'cancelado'))
        and (v.id is not null or exists(select 1 from operacao_etapa_pessoas ep where ep.etapa_id=e.id and ep.empresa_id=p_empresa and ep.free_id is not null))),'[]'::jsonb);
  end if;
  raise exception 'Serviço inválido';
end $$;

create or replace function public.uber_divergencias_identificar(p_empresa uuid,p_lista jsonb) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(d.j||case when v.solicitacao_interna then jsonb_build_object('solicitacao_interna',true,'solicitacao_id',v.id,'solicitacao_motivo',v.solicitacao_motivo) else '{}'::jsonb end order by d.ord),'[]'::jsonb)
 from jsonb_array_elements(coalesce(p_lista,'[]'::jsonb)) with ordinality d(j,ord)
 left join uber_corridas c on d.j->>'origem'='uber' and c.id::text=d.j->>'referencia' and c.empresa_id=p_empresa
 left join uber_vagas v on v.id=c.vaga_id and v.empresa_id=p_empresa
$$;
revoke all on function public.uber_divergencias_identificar(uuid,jsonb) from public,anon,authenticated;

create or replace function public.logistica_divergencias_dados(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare fretes jsonb; abertas jsonb; resolvidas jsonb;
begin
  fretes:=frete_div_dados(p_empresa);
  select coalesce(jsonb_agg(c.dados||jsonb_build_object('chave',c.chave,'versao',c.versao,'explicacao',x.texto,'explicacao_em',x.criado_em) order by c.dados->>'data'),'[]'::jsonb)
    into abertas from logistica_divergencias_candidatas(p_empresa) c
    left join logistica_div_explicacoes x on x.empresa_id=p_empresa and x.chave=c.chave
    where not exists(select 1 from logistica_divergencias_tratamentos t where t.empresa_id=p_empresa and t.chave=c.chave and t.versao=c.versao);
  select coalesce(jsonb_agg(t.dados||jsonb_build_object('chave',t.chave,'versao',t.versao,'motivo',t.motivo,
    'tratado_por',t.tratado_por_nome,'tratado_em',t.tratado_em,'explicacao',x.texto,'explicacao_em',x.criado_em) order by t.tratado_em desc),'[]'::jsonb)
    into resolvidas from logistica_divergencias_tratamentos t
    left join logistica_div_explicacoes x on x.empresa_id=p_empresa and x.chave=t.chave
    where t.empresa_id=p_empresa and t.tratado_em>now()-interval '30 days';
  select abertas||coalesce(jsonb_agg(jsonb_build_object('origem','frete','chave','frete:'||(f->>'id'),'referencia',f->>'id',
      'tipo','valor','nome',f->>'freteiro','data',f->>'data','local',f->>'destino','titulo',case f->>'divergencia'
        when 'sem_frete' then 'Frete não encontrado no sistema' when 'nao_lancado' then 'Frete não lançado no relatório' else 'Valor diferente do combinado' end,
      'valor_previsto',f->'valor_sistema','valor_informado',coalesce(f->'total',f->'valor'),'explicacao',f->>'explicacao','explicacao_em',f->>'explicacao_em','registro',f)),'[]'::jsonb)
    into abertas from jsonb_array_elements(coalesce(fretes->'abertas','[]')) f;
  select resolvidas||coalesce(jsonb_agg(jsonb_build_object('origem','frete','chave','frete:'||(f->>'id'),'tipo','valor',
      'nome',f->>'freteiro','data',f->>'data','local',f->>'destino','titulo','Divergência de frete',
      'motivo',f->>'decisao_motivo','tratado_por',f->>'decisao_por','tratado_em',f->>'decisao_em','valor_previsto',f->'valor_sistema',
      'valor_informado',f->'valor_final','explicacao',f->>'explicacao','registro',f)),'[]'::jsonb)
    into resolvidas from jsonb_array_elements(coalesce(fretes->'resolvidas','[]')) f;
  return jsonb_build_object('abertas',uber_divergencias_identificar(p_empresa,abertas),'resolvidas',uber_divergencias_identificar(p_empresa,resolvidas));
end $$;

notify pgrst,'reload schema';
