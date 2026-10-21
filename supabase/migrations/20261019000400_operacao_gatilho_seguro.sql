-- O gatilho que cria as etapas a partir do pedido nunca pode impedir o Comercial de salvar:
-- qualquer erro vira só um aviso no log do banco (a etapa é refeita no próximo salvamento).
create or replace function public.operacao_pedido_gatilho() returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin
    perform operacao_sincronizar_pedido(new.id);
  exception when others then
    raise warning 'operacao_sincronizar_pedido(%): %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- horário escrito livre no pedido ("8h", "08h30", vazio) não derruba a conversão
create or replace function public.operacao_hora_texto(p text, p_padrao time) returns time language plpgsql immutable as $$
declare m text[];
begin
  m := regexp_match(coalesce(p, ''), '(\d{1,2})\s*[:hH]\s*(\d{2})?');
  if m is null or m[1]::int > 23 or coalesce(m[2], '0')::int > 59 then return p_padrao; end if;
  return make_time(m[1]::int, coalesce(m[2], '0')::int, 0);
end $$;

-- horários do pedido lidos com tolerância
create or replace function public.operacao_sincronizar_pedido(p_pedido uuid) returns int
language plpgsql security definer set search_path=public as $$
declare
  p separacoes_pedidos; r empresa_logistica_regras; permitidos text[]; entrega date; coleta date; carga date;
  padrao time; h_entrega time; h_coleta time; obs jsonb; e record; atual operacao_etapas; n int := 0;
  descarga_min int;
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
    select * into atual from operacao_etapas where pedido_id = p.id and tipo = e.tipo order by origem = 'pedido' desc, created_at limit 1;
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
     and (v.data + coalesce(v.hora, padrao)) <= (d.data + coalesce(d.hora, padrao)) and v.data = v.data_sugerida;
  perform operacao_escala_preencher(p.empresa_id, array(select id from operacao_etapas where pedido_id = p.id));
  return n;
end $$;
