-- A mesma regra de confirmação comercial vale para os três aplicativos.
-- O padrão preserva a publicação anterior; Não passa a exigir as datas atuais.
create table public.logistica_anuncios_config (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  anunciar_sem_confirmacao boolean not null default true
);
alter table public.logistica_anuncios_config enable row level security;
revoke all on public.logistica_anuncios_config from anon,authenticated;

create function public.logistica_anuncios_parametros(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not coalesce(eh_membro_empresa(p_empresa),false) or not coalesce(seguranca_2fa_ok(),false)
    or not coalesce(operacao_pode(p_empresa,'logistica.planejamento.visualizar')
      or operacao_pode(p_empresa,'configuracoes.empresa.visualizar') or escala_controle_pode(p_empresa),false) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  return jsonb_build_object('anunciar_sem_confirmacao',coalesce((select anunciar_sem_confirmacao
    from logistica_anuncios_config where empresa_id=p_empresa),true));
end $$;
create function public.logistica_anuncios_parametros_salvar(p_empresa uuid,p_anunciar_sem_confirmacao boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(escala_controle_pode(p_empresa),false) or not coalesce(seguranca_2fa_ok(),false) then
    raise exception 'Sem permissão para alterar a regra de anúncios' using errcode='42501';
  end if;
  if p_anunciar_sem_confirmacao is null then raise exception 'Selecione Sim ou Não';end if;
  insert into logistica_anuncios_config(empresa_id,anunciar_sem_confirmacao) values(p_empresa,p_anunciar_sem_confirmacao)
    on conflict(empresa_id) do update set anunciar_sem_confirmacao=excluded.anunciar_sem_confirmacao;
end $$;
revoke all on function public.logistica_anuncios_parametros(uuid),public.logistica_anuncios_parametros_salvar(uuid,boolean) from public,anon;
grant execute on function public.logistica_anuncios_parametros(uuid),public.logistica_anuncios_parametros_salvar(uuid,boolean) to authenticated;

-- Usada apenas pelo servidor: solicitações avulsas não têm confirmação comercial.
create function public.logistica_anuncio_datas_liberadas(p_empresa uuid,p_pedido uuid,p_etapa uuid default null) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare pedido uuid:=p_pedido;etapa_pedido uuid;
begin
  if coalesce((select anunciar_sem_confirmacao from logistica_anuncios_config where empresa_id=p_empresa),true) then return true;end if;
  if p_etapa is not null then
    select e.pedido_id into etapa_pedido from operacao_etapas e where e.id=p_etapa and e.empresa_id=p_empresa;
    if not found then return false;end if;
    if pedido is not null and pedido is distinct from etapa_pedido then return false;end if;
    pedido:=coalesce(pedido,etapa_pedido);
  end if;
  if pedido is null then return true;end if;
  return exists(select 1 from separacoes_pedidos p join comercial_confirmacoes_datas c on c.pedido_id=p.id and c.empresa_id=p_empresa
    where p.id=pedido and p.empresa_id=p_empresa
      and c.data_entrega is not distinct from p.data_entrega
      and c.data_evento is not distinct from p.data_evento
      and c.data_coleta is not distinct from p.data_coleta);
end $$;
revoke all on function public.logistica_anuncio_datas_liberadas(uuid,uuid,uuid) from public,anon,authenticated;

-- Publicação manual e aceite também passam pela regra, mesmo fora do painel.
create function public.logistica_anuncio_proteger_datas() returns trigger
language plpgsql security definer set search_path=public as $$
declare pedido uuid;etapa uuid;verificar boolean:=false;
begin
  if tg_table_name='free_vagas' then
    etapa:=new.etapa_id;verificar:=new.status='ABERTA';
  elsif tg_table_name='uber_vagas' then
    etapa:=new.etapa_id;pedido:=new.pedido_id;verificar:=new.status='aberta';
  elsif tg_table_name='frete_anuncios' then
    pedido:=new.pedido_id;
    if tg_op='INSERT' then verificar:=new.status in ('aberto','aceito');
    else verificar:=new.status in ('aberto','aceito') and (old.status is distinct from new.status or old.pedido_id is distinct from new.pedido_id);end if;
  elsif tg_table_name='free_inscricoes' then
    if tg_op='INSERT' then verificar:=new.status='CONFIRMADO';
    else verificar:=new.status='CONFIRMADO' and (old.status is distinct from new.status or old.vaga_id is distinct from new.vaga_id or old.free_id is distinct from new.free_id);end if;
    if verificar then select v.etapa_id into etapa from free_vagas v where v.id=new.vaga_id and v.empresa_id=new.empresa_id;end if;
  elsif tg_table_name='uber_corridas' then
    if tg_op='INSERT' then verificar:=new.status<>'cancelada';
    else verificar:=new.status<>'cancelada' and (old.status='cancelada' or old.vaga_id is distinct from new.vaga_id or old.motorista_id is distinct from new.motorista_id);end if;
    if verificar then select v.pedido_id,v.etapa_id into pedido,etapa from uber_vagas v where v.id=new.vaga_id and v.empresa_id=new.empresa_id;end if;
  end if;
  if verificar and not logistica_anuncio_datas_liberadas(new.empresa_id,pedido,etapa) then
    raise exception 'Aguarde o Comercial confirmar as datas atuais do pedido para anunciar ou aceitar este serviço.';
  end if;
  return new;
end $$;
revoke all on function public.logistica_anuncio_proteger_datas() from public,anon,authenticated;
create trigger logistica_datas_comerciais before insert or update on public.free_vagas for each row execute function public.logistica_anuncio_proteger_datas();
create trigger logistica_datas_comerciais before insert or update on public.uber_vagas for each row execute function public.logistica_anuncio_proteger_datas();
create trigger logistica_datas_comerciais before insert or update on public.frete_anuncios for each row execute function public.logistica_anuncio_proteger_datas();
create trigger logistica_datas_comerciais before insert or update on public.free_inscricoes for each row execute function public.logistica_anuncio_proteger_datas();
create trigger logistica_datas_comerciais before insert or update on public.uber_corridas for each row execute function public.logistica_anuncio_proteger_datas();


-- Os agendadores aguardam a confirmacao sem abortar o lote de outras etapas.
create or replace function public.frete_anuncios_sincronizar(p_empresa uuid) returns int
language plpgsql security definer set search_path = public as $$
declare g record; a frete_anuncios; calc jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  auto boolean := coalesce((select automatica from empresa_escala_controle where empresa_id = p_empresa), true);
  cam uuid; n int := 0; vdest text; vend text; vlat numeric; vlng numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('frete_anuncios:' || p_empresa::text, 0));
  for g in
    select e.pedido_id, frete_direcao(e.tipo) dir,
           array_agg(e.id order by e.data, e.hora nulls first) etapas,
           (array_agg(e.data order by e.data, e.hora nulls first))[1] data,
           (array_agg(e.hora order by e.data, e.hora nulls first))[1] hora
      from operacao_etapas e join separacoes_pedidos p on p.id = e.pedido_id
     where e.empresa_id = p_empresa and e.servico_ref is null and frete_direcao(e.tipo) is not null and e.data >= hoje
       and p.status_comercial in ('aprovado', 'enviado', 'finalizado')
       and coalesce(p.status, '') <> 'cancelado' and p.encerrado_operacional_em is null
     group by 1, 2
  loop
    select * into a from frete_anuncios where pedido_id = g.pedido_id and direcao = g.dir and status <> 'cancelado' for update;
    select p.local_nome, l.endereco, l.latitude, l.longitude into vdest, vend, vlat, vlng
      from separacoes_pedidos p left join locais_empresas l on l.id = p.local_id where p.id = g.pedido_id;
    vdest := concat_ws(' · ', nullif(btrim(coalesce(vdest, '')), ''), nullif(btrim(coalesce(vend, '')), ''));
    if coalesce(vdest, '') = '' then vdest := 'Local do evento'; end if;

    -- caminhão próprio (ou de transportadora) já escalado: não precisa de freteiro
    if exists (select 1 from operacao_etapa_caminhoes ec join caminhoes k on k.id = ec.caminhao_id
                where ec.etapa_id = any(g.etapas) and k.freteiro_id is null) then
      if a.id is not null and a.status = 'aberto' then
        update frete_anuncios set status = 'cancelado', cancelado_em = now(), updated_at = now() where id = a.id;
      end if;
      continue;
    end if;

    if a.id is null then
      if not auto or not logistica_anuncio_datas_liberadas(p_empresa,g.pedido_id) then continue; end if;
      perform operacao_escala_preencher_sem_fluxo(p_empresa, g.etapas);   -- tenta um caminhão próprio antes de anunciar
      if exists (select 1 from operacao_etapa_caminhoes ec join caminhoes k on k.id = ec.caminhao_id
                  where ec.etapa_id = any(g.etapas) and k.freteiro_id is null) then continue; end if;
      calc := frete_anuncio_calculo(p_empresa, g.pedido_id, g.dir);
      if (calc->>'valor')::numeric <= 0 then continue; end if;          -- sem km ou sem categoria de frete: não anuncia
      insert into frete_anuncios (empresa_id, pedido_id, direcao, etapas, data, hora, ponto_encontro, destino, destino_lat, destino_lng, km, m3, valor)
      values (p_empresa, g.pedido_id, g.dir, g.etapas, g.data, g.hora, frete_galpao(p_empresa), vdest, vlat, vlng,
              (calc->>'km')::numeric, (calc->>'m3')::numeric, (calc->>'valor')::numeric);
      n := n + 1;
    elsif a.status = 'aberto' then
      calc := frete_anuncio_calculo(p_empresa, g.pedido_id, g.dir);
      update frete_anuncios set etapas = g.etapas, data = g.data, hora = g.hora, destino = vdest, destino_lat = vlat, destino_lng = vlng,
             ponto_encontro = frete_galpao(p_empresa), km = (calc->>'km')::numeric, m3 = (calc->>'m3')::numeric,
             valor = case when (calc->>'valor')::numeric > 0 then (calc->>'valor')::numeric else valor end, updated_at = now()
       where id = a.id
         and (etapas, data, hora, destino, km, m3) is distinct from (g.etapas, g.data, g.hora, vdest, (calc->>'km')::numeric, (calc->>'m3')::numeric);
    else
      -- aceito: o caminhão do freteiro tem que estar em todas as etapas; se a logística tirou, o frete volta para o app
      select caminhao_id into cam from frete_freteiros where id = a.freteiro_id;
      if a.checkin_em is null and (cam is null or not exists (select 1 from operacao_etapa_caminhoes where caminhao_id = cam and etapa_id = any(a.etapas))) then
        if not logistica_anuncio_datas_liberadas(p_empresa,g.pedido_id) then continue;end if;
        update frete_anuncios set status = 'aberto', freteiro_id = null, aceito_em = null, etapas = g.etapas, data = g.data, hora = g.hora, updated_at = now() where id = a.id;
      else
        if cam is not null then
          insert into operacao_etapa_caminhoes (etapa_id, caminhao_id, empresa_id)
            select x, cam, p_empresa from unnest(g.etapas) x on conflict do nothing;
        end if;
        update frete_anuncios set etapas = g.etapas, data = g.data, hora = g.hora, destino = vdest, destino_lat = vlat, destino_lng = vlng, updated_at = now()
         where id = a.id and (etapas, data, hora, destino) is distinct from (g.etapas, g.data, g.hora, vdest);
      end if;
    end if;
  end loop;

  -- pedido cancelado/encerrado ou etapas que sumiram: o anúncio aberto sai do app
  update frete_anuncios fa set status = 'cancelado', cancelado_em = now(), updated_at = now()
   where fa.empresa_id = p_empresa and fa.status = 'aberto'
     and not exists (select 1 from operacao_etapas e join separacoes_pedidos p on p.id = e.pedido_id
                      where e.pedido_id = fa.pedido_id and frete_direcao(e.tipo) = fa.direcao and e.servico_ref is null
                        and p.status_comercial in ('aprovado', 'enviado', 'finalizado') and coalesce(p.status, '') <> 'cancelado');
  update frete_anuncios fa set status = 'cancelado', cancelado_em = now(), updated_at = now()
   where fa.empresa_id = p_empresa and fa.status = 'aceito' and fa.checkin_em is null
     and exists (select 1 from separacoes_pedidos p where p.id = fa.pedido_id and (p.status_comercial = 'cancelado' or p.status = 'cancelado'));
  return n;
end $$;

create or replace function public.uber_automacao_processar() returns integer
language plpgsql security definer set search_path=public as $$
declare r record; pessoas int; lugares int; desconhecidos int; existentes int; carros int; km numeric; valor numeric; destino text; criadas int:=0;
 agora timestamp:=(now() at time zone 'America/Sao_Paulo');
begin
 for r in select e.id,e.empresa_id,e.pedido_id,e.data,e.hora,p.local_id,c.ativa,c.montagem,c.desmontagem,c.passageiros_carro,c.antecedencia_horas,c.ponto_encontro,c.ida_volta,c.lugares_caminhoes
 from operacao_etapas e join uber_automacao_config c on c.empresa_id=e.empresa_id
 join separacoes_pedidos p on p.id=e.pedido_id and p.empresa_id=e.empresa_id
 where c.ativa and ((e.tipo='montagem' and c.montagem) or(e.tipo='desmontagem' and c.desmontagem))
 and p.status_comercial in('aprovado','enviado','finalizado') and coalesce(p.status,'')<>'cancelado'
 and e.hora is not null and e.data+e.hora>agora and e.data+e.hora<=agora+make_interval(hours=>c.antecedencia_horas)
 loop
  perform pg_advisory_xact_lock(hashtextextended('uber-auto:'||r.id::text,0));
  if not logistica_anuncio_datas_liberadas(r.empresa_id,r.pedido_id,r.id) then continue;end if;
  if exists(select 1 from uber_vagas where etapa_id=r.id and automatica) then continue;end if;
  select count(distinct lower(btrim(nome))) into pessoas from operacao_etapa_pessoas where etapa_id=r.id and nullif(btrim(nome),'') is not null;
  if pessoas=0 then continue;end if;
  select count(*) filter(where not(r.lugares_caminhoes ? caminhao_id::text)),coalesce(sum((r.lugares_caminhoes->>caminhao_id::text)::int),0)
  into desconhecidos,lugares from operacao_etapa_caminhoes where etapa_id=r.id;
  if desconhecidos>0 then continue;end if; -- nunca adivinhar lotacao nao cadastrada
  select coalesce(sum(quantidade),0) into existentes from uber_vagas where etapa_id=r.id and status='aberta';
  carros:=ceil(greatest(pessoas-lugares-existentes*r.passageiros_carro,0)::numeric/r.passageiros_carro);
  if carros<1 or carros>30 then continue;end if;
  select distancia_galpao_km,concat_ws(', ',nullif(endereco,''),nullif(numero_endereco::text,'')) into km,destino
   from locais_empresas where id=r.local_id and empresa_id=r.empresa_id;
  if coalesce(km,0)<=0 or nullif(btrim(destino),'') is null then continue;end if;
  valor:=uber_valor_trecho(r.empresa_id,km)*case when r.ida_volta then 2 else 1 end;
  if valor<=0 then continue;end if;
  insert into uber_vagas(empresa_id,etapa_id,pedido_id,quantidade,ida_volta,ponto_encontro,destino,km,valor,data,hora,obs,automatica)
   values(r.empresa_id,r.id,r.pedido_id,carros,r.ida_volta,r.ponto_encontro,destino,km,valor,r.data,r.hora,
    'Automatico: '||pessoas||' pessoas na equipe e '||lugares||' lugares nos caminhoes.',true);
  criadas:=criadas+1;
 end loop;
 return criadas;
end $$;

-- Novos aceites ficam indisponiveis nos apps. Historico e servicos aceitos permanecem.
create or replace function public.frete_app(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s);
begin
  if f.status = 'aprovado' then perform frete_anuncios_sincronizar(f.empresa_id); end if;
  return jsonb_build_object(
    'perfil', jsonb_build_object('nome', f.nome, 'telefone', f.telefone, 'pix', f.chave_pix, 'carro_modelo', f.veiculo_modelo, 'carro_placa', f.veiculo_placa,
                                 'carro_cor', f.veiculo_tipo, 'capacidade_m3', f.capacidade_m3, 'status', f.status, 'motivo', f.motivo),
    'disponiveis', case when f.status <> 'aprovado' then '[]'::jsonb else coalesce((select jsonb_agg(frete_anuncio_json(a, false) order by a.data, a.hora) from frete_anuncios a
        where a.empresa_id = f.empresa_id and a.status = 'aberto' and logistica_anuncio_datas_liberadas(a.empresa_id,a.pedido_id) and a.data >= (now() at time zone 'America/Sao_Paulo')::date and a.m3 <= f.capacidade_m3), '[]') end,
    'minhas', coalesce((select jsonb_agg(frete_corrida_json(a) order by a.data desc, a.hora desc) from frete_anuncios a
        where a.freteiro_id = f.id and (a.status = 'aceito' or a.updated_at > now() - interval '90 days')), '[]'));
end $$;

create or replace function public.uber_app(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'motorista'); m uber_motoristas := uber_motorista(s);
begin
  return jsonb_build_object(
    'perfil', jsonb_build_object('nome', m.nome, 'telefone', m.telefone, 'pix', m.chave_pix, 'carro_modelo', m.carro_modelo, 'carro_placa', m.carro_placa, 'carro_cor', m.carro_cor),
    'disponiveis', coalesce((select jsonb_agg(uber_vaga_json(v, false) order by v.data, v.hora) from uber_vagas v
        where v.empresa_id = m.empresa_id and v.status = 'aberta' and logistica_anuncio_datas_liberadas(v.empresa_id,v.pedido_id,v.etapa_id) and v.data >= (now() at time zone 'America/Sao_Paulo')::date
          and (select count(*) from uber_corridas c where c.vaga_id = v.id and c.status <> 'cancelada') < v.quantidade
          and not exists (select 1 from uber_corridas c where c.vaga_id = v.id and c.motorista_id = m.id and c.status <> 'cancelada')), '[]'),
    'minhas', coalesce((select jsonb_agg(uber_corrida_json(c) order by v.data desc, v.hora desc) from uber_corridas c join uber_vagas v on v.id = c.vaga_id
        where c.motorista_id = m.id and (c.status in ('confirmada', 'em_andamento') or c.created_at > now() - interval '90 days')), '[]'));
end $$;

create or replace function public.free_app_dados(p_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'free'); c free_cadastros;
begin
  select * into c from free_cadastros where id = s.free_id;
  return jsonb_build_object(
    'free', jsonb_build_object('id', c.id, 'nome', c.nome, 'cpf', public.free_visivel(c.cpf, c.cofre_mascaras->>'cpf'), 'telefone', c.telefone, 'pix', public.free_visivel(c.chave_pix, c.cofre_mascaras->>'pix'), 'status', upper(c.status), 'miniatura', coalesce(c.foto_url, ''), 'pasta', s.pasta),
    'vagas', case when c.status <> 'aprovado' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
        'idVaga', v.id, 'idEtapa', v.etapa_id, 'etapa', v.etapa, 'dataISO', v.data, 'horario', v.horario, 'pontoEncontro', v.ponto_encontro,
        'pontoLat', v.ponto_lat, 'pontoLng', v.ponto_lng, 'lider', v.lider, 'observacao', v.observacao, 'quantidade', v.quantidade,
        'status', v.status, 'valor', v.valor, 'modo', v.modo, 'preferidos', to_jsonb(v.preferidos), 'liberarEm', v.liber_em_txt,
        'inscricoes', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'idFree', i.free_id, 'nome', i.nome, 'status', i.status,
             'confirmadoEm', i.confirmado_em, 'cimaDaHora', i.cima_da_hora, 'dataCiente', i.data_ciente, 'horarioCiente', i.horario_ciente,
             'checkinEm', i.checkin_em, 'checkoutEm', i.checkout_em, 'presencaPor', i.presenca_por,
             'uniforme', (select avaliacao from free_rh_uniforme u where u.inscricao_id = i.id and i.free_id = c.id)))
           from free_inscricoes i where i.vaga_id = v.id), '[]')))
      from (select vv.*, to_char(vv.liberar_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') liber_em_txt from free_vagas_v vv) v
     where v.empresa_id = c.empresa_id
       and (logistica_anuncio_datas_liberadas(v.empresa_id,null,v.etapa_id) or exists(select 1 from free_inscricoes propria where propria.vaga_id=v.id and propria.free_id=c.id))
       and (v.status <> 'CANCELADA' or exists (select 1 from free_inscricoes i where i.vaga_id = v.id and i.free_id = c.id))
       and (v.data >= current_date - 15 or exists (select 1 from free_inscricoes i where i.vaga_id = v.id and i.free_id = c.id))), '[]') end);
end $$;

revoke all on function public.frete_anuncios_sincronizar(uuid),public.uber_automacao_processar() from public,anon,authenticated;
revoke all on function public.frete_app(text),public.uber_app(text),public.free_app_dados(text) from public;
grant execute on function public.frete_app(text),public.uber_app(text),public.free_app_dados(text) to anon,authenticated;
notify pgrst,'reload schema';
