-- Serviços adicionais operacionais no cronograma (out/2026, pedido do usuário: "montagem extra, desmontagem extra… precisa
-- de data e horário, porque isso precisa entrar no cronograma… não pode se perder dentro do pedido").
-- 1) No cadastro do serviço (Parâmetros > Comercial > Serviços adicionais) escolhe-se em qual etapa ele entra no cronograma.
alter table public.servicos_adicionais add column if not exists etapa_operacao text;
alter table public.servicos_adicionais drop constraint if exists servicos_adicionais_etapa_operacao_check;
alter table public.servicos_adicionais add constraint servicos_adicionais_etapa_operacao_check
  check (etapa_operacao is null or etapa_operacao in ('triagem_ida','carregamento','montagem','desmontagem','descarregamento','triagem_volta','outra'));
update public.servicos_adicionais set etapa_operacao = case when nome ilike '%desmont%' then 'desmontagem' when nome ilike '%montag%' then 'montagem' end
 where etapa_operacao is null and (nome ilike '%montag%' or nome ilike '%desmont%');
-- 2) A etapa gerada por um serviço guarda a linha do serviço no pedido (dados.servicos[].id).
alter table public.operacao_etapas add column if not exists servico_ref text;
create index if not exists operacao_etapas_servico_ref on public.operacao_etapas (pedido_id, servico_ref) where servico_ref is not null;

-- 3) Pedido não salva com serviço operacional sem data e horário (a tela já confere; isto é a garantia no banco).
create or replace function public.pedido_servicos_operacionais_check() returns trigger language plpgsql security definer set search_path = public as $$
declare faltando text;
begin
  -- só confere quando a lista de serviços do pedido muda (pedidos antigos continuam podendo ser gravados por outras telas)
  if tg_op = 'UPDATE' and (old.observacoes->'projeto_comercial'->'dados'->'servicos') is not distinct from (new.observacoes->'projeto_comercial'->'dados'->'servicos') then return new; end if;
  select string_agg(coalesce(nullif(btrim(x->>'nome'), ''), sa.nome), ', ') into faltando
    from jsonb_array_elements(case when jsonb_typeof(new.observacoes->'projeto_comercial'->'dados'->'servicos') = 'array' then new.observacoes->'projeto_comercial'->'dados'->'servicos' else '[]'::jsonb end) x
    join servicos_adicionais sa on sa.id::text = x->>'servico_id' and sa.empresa_id = new.empresa_id and sa.etapa_operacao is not null
   where not (coalesce(x->>'data', '') ~ '^\d{4}-\d{2}-\d{2}$' and coalesce(x->>'hora', '') ~ '^\d{2}:\d{2}');
  if faltando is not null then
    raise exception 'Informe a data e o horário do serviço % (ele entra no cronograma).', faltando;
  end if;
  return new;
end $$;
drop trigger if exists pedido_servicos_operacionais_check on public.separacoes_pedidos;
create trigger pedido_servicos_operacionais_check before insert or update of observacoes on public.separacoes_pedidos
  for each row execute function public.pedido_servicos_operacionais_check();

-- 4) O pedido gera/atualiza/apaga as etapas desses serviços junto com as etapas normais.
CREATE OR REPLACE FUNCTION public.operacao_sincronizar_pedido(p_pedido uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p separacoes_pedidos; r empresa_logistica_regras; permitidos text[]; entrega date; coleta date; carga date;
  padrao time; h_entrega time; h_coleta time; obs jsonb; e record; atual operacao_etapas; n int := 0;
  descarga_min int; sv record; refs text[] := array[]::text[];
begin
  select * into p from separacoes_pedidos where id = p_pedido;
  if not found then return 0; end if;
  select * into r from empresa_logistica_regras where empresa_id = p.empresa_id;
  permitidos := coalesce(nullif(r.status_cronograma, '{}'), array['pre_reserva','aprovado']);
  if not (coalesce(p.status_comercial, '') = any(permitidos)) or p.data_evento is null then
    delete from operacao_etapas where pedido_id = p.id;
    return 0;
  end if;
  obs := coalesce(p.observacoes, '{}'::jsonb);
  padrao := coalesce(r.hora_padrao, time '08:00');
  h_entrega := operacao_hora_texto(coalesce(obs->>'horario_entrega', obs->'horarios_pedido'->>'entrega'), padrao);
  h_coleta := operacao_hora_texto(coalesce(obs->>'horario_coleta', obs->'horarios_pedido'->>'coleta'), padrao);
  entrega := coalesce(p.data_entrega, p.data_evento);
  coleta := coalesce(p.data_coleta, p.data_evento_fim, p.data_evento);
  carga := entrega - coalesce(r.carregamento_dias_antes_entrega, 0);
  descarga_min := greatest(1, coalesce(r.descarregamento_minutos_apos_desmontagem, 60));
  for e in
    select * from (values
      ('triagem_ida', 'Triagem (Separação)', carga - coalesce(r.triagem_dias_antes_carregamento, 1), padrao),
      ('carregamento', 'Carregamento', carga, padrao),
      ('montagem', 'Montagem', entrega + coalesce(r.montagem_dias_apos_entrega, 0), h_entrega),
      ('desmontagem', 'Desmontagem', coleta + coalesce(r.desmontagem_dias_apos_coleta, 0), h_coleta),
      ('descarregamento', 'Descarregamento', coleta + coalesce(r.desmontagem_dias_apos_coleta, 0), h_coleta),
      ('triagem_volta', 'Triagem (Conferência)', coleta + coalesce(r.triagem_retorno_dias_apos_coleta, 0), padrao)
    ) v(tipo, nome, data, hora)
  loop
    -- descarregamento: depois da desmontagem (+ intervalo dos Parâmetros)
    if e.tipo = 'descarregamento' then
      e.hora := (e.data + e.hora + make_interval(mins => descarga_min))::time;
      e.data := (e.data + h_coleta + make_interval(mins => descarga_min))::date;
    end if;
    select * into atual from operacao_etapas where pedido_id = p.id and tipo = e.tipo and servico_ref is null order by origem = 'pedido' desc, created_at limit 1;
    if found then
      update operacao_etapas set
        data = case when data_sugerida is not null and data = data_sugerida then e.data else data end,
        hora = case when hora is null or hora = hora_sugerida then e.hora else hora end,
        data_sugerida = e.data, hora_sugerida = e.hora, nome = e.nome, updated_at = now()
      where id = atual.id;
    else
      insert into operacao_etapas (empresa_id, pedido_id, nome, tipo, data, hora, data_sugerida, hora_sugerida, observacao, origem)
      values (p.empresa_id, p.id, e.nome, e.tipo, e.data, e.hora, e.data, e.hora, 'Gerado pelo pedido', 'pedido');
      n := n + 1;
    end if;
  end loop;
  -- triagem da volta sempre depois do descarregamento
  update operacao_etapas v set data = (d.data + d.hora + interval '1 minute')::date, hora = (d.data + d.hora + interval '1 minute')::time
    from operacao_etapas d
   where v.pedido_id = p.id and v.tipo = 'triagem_volta' and d.pedido_id = p.id and d.tipo = 'descarregamento'
     and v.servico_ref is null and d.servico_ref is null
     and (v.data + coalesce(v.hora, padrao)) <= (d.data + coalesce(d.hora, padrao)) and v.data = v.data_sugerida;
  -- serviços adicionais operacionais (montagem extra, desmontagem extra…): cada linha do pedido vira uma etapa no
  -- cronograma, na data e no horário informados no pedido (a escala automática preenche equipe e caminhão)
  for sv in
    select x->>'id' ref, coalesce(nullif(btrim(x->>'nome'), ''), sa.nome) nome, sa.etapa_operacao tipo,
           (x->>'data')::date dt, (x->>'hora')::time hr, greatest(1, coalesce(nullif(x->>'quantidade', '')::numeric, 1)) q
      from jsonb_array_elements(case when jsonb_typeof(obs->'projeto_comercial'->'dados'->'servicos') = 'array' then obs->'projeto_comercial'->'dados'->'servicos' else '[]'::jsonb end) x
      join servicos_adicionais sa on sa.id::text = x->>'servico_id' and sa.empresa_id = p.empresa_id and sa.etapa_operacao is not null
     where coalesce(x->>'id', '') <> '' and coalesce(x->>'data', '') ~ '^\d{4}-\d{2}-\d{2}$' and coalesce(x->>'hora', '') ~ '^\d{2}:\d{2}'
  loop
    refs := refs || sv.ref;
    select * into atual from operacao_etapas where pedido_id = p.id and servico_ref = sv.ref limit 1;
    if found then
      update operacao_etapas set nome = sv.nome || case when sv.q > 1 then ' (' || sv.q::int || 'x)' else '' end, tipo = sv.tipo,
        data = case when data = data_sugerida then sv.dt else data end, hora = case when hora is null or hora = hora_sugerida then sv.hr else hora end,
        data_sugerida = sv.dt, hora_sugerida = sv.hr, updated_at = now()
      where id = atual.id;
    else
      insert into operacao_etapas (empresa_id, pedido_id, nome, tipo, data, hora, data_sugerida, hora_sugerida, observacao, origem, servico_ref)
      values (p.empresa_id, p.id, sv.nome || case when sv.q > 1 then ' (' || sv.q::int || 'x)' else '' end, sv.tipo, sv.dt, sv.hr, sv.dt, sv.hr,
              'Serviço adicional do pedido', 'pedido', sv.ref);
      n := n + 1;
    end if;
  end loop;
  delete from operacao_etapas where pedido_id = p.id and servico_ref is not null and not (servico_ref = any(refs));

  perform operacao_escala_preencher(p.empresa_id, array(select id from operacao_etapas where pedido_id = p.id));
  return n;
end $function$
;
