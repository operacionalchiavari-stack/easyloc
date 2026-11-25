-- Conferência de fretes pela carga registrada na Expedição, por pedido e caminhão.
begin;
create or replace function public.logistica_anunciados_transportadoras(p_empresa uuid,p_inicio date,p_fim date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  perform logistica_servicos_autorizar(p_empresa);
  if p_inicio is null or p_fim is null or p_fim<p_inicio then raise exception 'Informe um período válido';end if;
  return coalesce((select jsonb_agg(g.j order by g.data,g.hora) from (
    select min(e.data) data,min(e.hora) hora,jsonb_build_object(
      'tipo','frete','id',null,'ativo',false,'transportadora',true,'pedido_id',e.pedido_id,'pedido',p.numero_pedido,'cliente',p.cliente_nome,
      'cliente_foto',ce.catalogo_logo_url,'local',p.local_nome,'data',min(e.data),'hora',to_char(min(e.hora),'HH24:MI'),
      'etapa',case frete_direcao(e.tipo) when 'entrega' then 'Entrega' when 'coleta' then 'Coleta' else 'Frete' end||' · transportadora',
      'valor',null,'quantidade',count(distinct k.id),
      'linhas',jsonb_agg(distinct jsonb_build_object('caminhao_id',k.id,'nome',coalesce(nullif(k.codigo,''),'Caminhão')||coalesce(' · '||nullif(k.modelo,''),''),
        'foto',k.foto_url,'detalhe','Transportadora'||coalesce(' · '||nullif(k.empresa_nome,''),''),
        'confirmado',true,'situacao','escalado','checkin',null,'checkout',null))) j
    from operacao_etapas e
    join operacao_etapa_caminhoes ec on ec.etapa_id=e.id
    join caminhoes k on k.id=ec.caminhao_id and k.empresa_id=p_empresa and k.tipo='terceirizado' and k.freteiro_id is null
    join separacoes_pedidos p on p.id=e.pedido_id and p.empresa_id=p_empresa
    left join clientes_empresas ce on ce.id=p.cliente_id
    where e.empresa_id=p_empresa and e.data between p_inicio and p_fim and frete_direcao(e.tipo) is not null
      and coalesce(p.status_comercial,'')<>'cancelado' and coalesce(p.status,'')<>'cancelado'
    group by e.pedido_id,frete_direcao(e.tipo),p.numero_pedido,p.cliente_nome,ce.catalogo_logo_url,p.local_nome
  ) g),'[]'::jsonb);
end $$;
revoke all on function public.logistica_anunciados_transportadoras(uuid,date,date) from public,anon;
grant execute on function public.logistica_anunciados_transportadoras(uuid,date,date) to authenticated;

create or replace function public.logistica_fretes_anunciados(p_empresa uuid,p_inicio date,p_fim date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare servicos jsonb; resultado jsonb:='[]'; s jsonb; l jsonb; linhas jsonb; cargas jsonb;
  cam uuid; dir text;
begin
  perform logistica_servicos_autorizar(p_empresa);
  servicos:=logistica_anunciados(p_empresa,'frete',p_inicio,p_fim)||logistica_anunciados_transportadoras(p_empresa,p_inicio,p_fim);
  for s in select value from jsonb_array_elements(servicos) loop
    cam:=null;
    if coalesce((s->>'transportadora')::boolean,false) then
      dir:=case when s->>'etapa' like 'Coleta%' then 'coleta' else 'entrega' end;
    else
      select f.caminhao_id,a.direcao into cam,dir from frete_anuncios a
      left join frete_freteiros f on f.id=a.freteiro_id and f.empresa_id=p_empresa
      where a.id=(s->>'id')::uuid and a.empresa_id=p_empresa;
    end if;
    linhas:='[]';
    for l in select value from jsonb_array_elements(s->'linhas') loop
      cargas:='[]';
      if dir='entrega' then
        select coalesce(jsonb_agg(jsonb_build_object('caminhao_id',k.id,'codigo',c->>'codigo',
          'placa',c->>'placa','em',c->>'em','expedidor',logistica_nome_usuario((c->>'por')::uuid)) order by c->>'em'),'[]')
        into cargas
        from separacoes_pedidos p
        cross join lateral jsonb_array_elements(coalesce(p.operacao->'carga_por_veiculo','[]')) c
        join caminhoes k on k.id::text=c->>'caminhao_id' and k.empresa_id=p_empresa
        where p.id=(s->>'pedido_id')::uuid and p.empresa_id=p_empresa
          and k.id=coalesce((l->>'caminhao_id')::uuid,cam);
      end if;
      linhas:=linhas||jsonb_build_array(l||jsonb_build_object('carregamentos',cargas));
    end loop;
    resultado:=resultado||jsonb_build_array(s||jsonb_build_object('direcao',dir,'linhas',linhas));
  end loop;
  return coalesce((select jsonb_agg(x order by x->>'data',x->>'hora') from jsonb_array_elements(resultado) x),'[]');
end $$;
revoke all on function public.logistica_fretes_anunciados(uuid,date,date) from public,anon;
grant execute on function public.logistica_fretes_anunciados(uuid,date,date) to authenticated;

-- Clientes antigos também deixam de registrar presença por QR em fretes.
revoke all on function public.frete_presenca(text,uuid,text,jsonb) from public,anon,authenticated;
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
    raise exception 'Fretes são conferidos pelo carregamento registrado na Expedição';
  else raise exception 'Serviço inválido';end if;
  return jsonb_build_object('codigo',cod,'trocaEm',((j+1)*60000-floor(extract(epoch from now())*1000))::bigint);
end $$;
create or replace function public.frete_lanc_enviar(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a date; b date; rel uuid; l frete_lancamentos; x frete_anuncios; av frete_avulsos; usados uuid[] := '{}';
  hoje date := (now() at time zone 'America/Sao_Paulo')::date; n int;
begin
  if f.status <> 'aprovado' then raise exception 'Seu cadastro ainda não foi aprovado.'; end if;
  select p.ini, p.fim into a, b from frete_periodo_aberto(f) p;
  if hoje < b then raise exception 'O relatório deste período pode ser enviado a partir de %.', to_char(b, 'DD/MM/YYYY'); end if;
  if exists (select 1 from frete_relatorios where freteiro_id = f.id and periodo_ini = a) then raise exception 'O relatório deste período já foi enviado.'; end if;
  select count(*) into n from frete_lancamentos where freteiro_id = f.id and situacao = 'rascunho' and data between a and b and pedido_id is null and avulso_id is null;
  if n > 0 then raise exception 'Escolha o pedido de % frete(s) antes de enviar (toque em Editar).', n; end if;
  insert into frete_relatorios (empresa_id, freteiro_id, periodo_ini, periodo_fim) values (f.empresa_id, f.id, a, b) returning id into rel;
  update frete_lancamentos set relatorio_id = rel, updated_at = now() where freteiro_id = f.id and situacao = 'rascunho' and data between a and b;
  for l in select * from frete_lancamentos where relatorio_id = rel order by data, created_at loop
    if l.avulso_id is not null then
      select * into av from frete_avulsos where id = l.avulso_id;
      if av.id is null or av.cancelado_em is not null then
        update frete_lancamentos set situacao = 'divergente', divergencia = 'sem_frete' where id = l.id;
      elsif round(av.valor, 2) = frete_lanc_total(l) then
        update frete_lancamentos set valor_sistema = av.valor, situacao = 'ok', valor_final = av.valor where id = l.id;
      else
        update frete_lancamentos set valor_sistema = av.valor, situacao = 'divergente', divergencia = 'valor' where id = l.id;
      end if;
      av.id := null;
      continue;
    end if;
    select * into x from frete_anuncios z where z.freteiro_id = f.id and z.status = 'aceito' and z.data between a and b
       and z.pedido_id = l.pedido_id and z.direcao = l.direcao and z.id <> all(usados)
     order by (round(z.valor, 2) = frete_lanc_total(l)) desc, abs(z.valor - frete_lanc_total(l)) limit 1;
    if x.id is null then
      update frete_lancamentos set situacao = 'divergente', divergencia = 'sem_frete' where id = l.id;
    else
      usados := usados || x.id;
      if round(x.valor, 2) = frete_lanc_total(l) then
        update frete_lancamentos set anuncio_id = x.id, valor_sistema = x.valor, situacao = 'ok', valor_final = x.valor where id = l.id;
      else
        update frete_lancamentos set anuncio_id = x.id, valor_sistema = x.valor, situacao = 'divergente', divergencia = 'valor' where id = l.id;
      end if;
    end if;
    x.id := null;
  end loop;
  insert into frete_lancamentos (empresa_id, freteiro_id, relatorio_id, origem_lanc, data, origem, destino, valor, anuncio_id, valor_sistema, situacao, divergencia, pedido_id, direcao)
  select f.empresa_id, f.id, rel, 'sistema', z.data, z.ponto_encontro, z.destino, 0, z.id, z.valor, 'divergente', 'nao_lancado', z.pedido_id, z.direcao
    from frete_anuncios z where z.freteiro_id = f.id and z.status = 'aceito' and z.data between a and b and z.id <> all(usados);
  -- frete avulso cadastrado pela Logística que ele não lançou
  insert into frete_lancamentos (empresa_id, freteiro_id, relatorio_id, origem_lanc, data, origem, destino, valor, valor_sistema, situacao, divergencia, avulso_id)
  select f.empresa_id, f.id, rel, 'sistema', v.data, v.origem, v.destino, 0, v.valor, 'divergente', 'nao_lancado', v.id
    from frete_avulsos v where v.freteiro_id = f.id and v.cancelado_em is null and v.data between a and b
     and not exists (select 1 from frete_lancamentos q where q.avulso_id = v.id and q.relatorio_id = rel);
  update frete_relatorios set total_informado = coalesce((select sum(frete_lanc_total(q)) from frete_lancamentos q where q.relatorio_id = rel and q.origem_lanc = 'freteiro'), 0) where id = rel;
  perform frete_relatorio_finalizar(rel);
  return frete_lanc_app(p_token);
end $$;
create or replace function public.frete_periodo_aberto(f frete_freteiros) returns table(ini date, fim date)
language plpgsql stable security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; a date; b date; pa date; pb date;
begin
  select p.ini, p.fim into a, b from frete_periodo(f.empresa_id, hoje) p;
  select p.ini, p.fim into pa, pb from frete_periodo(f.empresa_id, a - 1) p;
  if not exists (select 1 from frete_relatorios r where r.freteiro_id = f.id and r.periodo_ini = pa)
     and (exists (select 1 from frete_lancamentos l where l.freteiro_id = f.id and l.situacao = 'rascunho' and l.data between pa and pb)
          or exists (select 1 from frete_anuncios x where x.freteiro_id = f.id and x.status = 'aceito' and x.data between pa and pb)) then
    ini := pa; fim := pb;
  elsif exists (select 1 from frete_relatorios r where r.freteiro_id = f.id and r.periodo_ini = a) then
    -- período de hoje já enviado: abre o seguinte
    select p.ini, p.fim into ini, fim from frete_periodo(f.empresa_id, b + 1) p;
  else
    ini := a; fim := b;
  end if;
  return next;
end $$;
notify pgrst,'reload schema';
commit;
