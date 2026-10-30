-- (1) Serviço adicional (montagem extra…) não leva caminhão: não tem item para levar. (2) Data e horário das etapas do
-- pedido só mudam pelo pedido (Comercial): o cronograma não altera mais (pedido do usuário, out/2026). A sincronização
-- marca a transação (acervo.sincronizando_pedido) e o gatilho recusa qualquer outra mudança de data/hora ou remoção.
delete from public.operacao_etapa_caminhoes c using public.operacao_etapas e where e.id = c.etapa_id and e.servico_ref is not null;
CREATE OR REPLACE FUNCTION public.operacao_escala_preencher_sem_fluxo(p_empresa uuid, p_etapas uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  reg jsonb := operacao_regras_escala(p_empresa);
  et record; conf jsonb; jan tsrange; m3 numeric; precisa int; tem_resp boolean; n_eq int; mudou boolean; total int := 0;
  pessoa record; cam record; par uuid;
begin
  if reg = '{}'::jsonb then return 0; end if;
  if not coalesce((select automatica from public.empresa_escala_controle where empresa_id=p_empresa),true) then return 0;end if;
  for et in
    select e.*, operacao_janela(e.data, e.hora, e.tipo, reg) j
      from operacao_etapas e
     where e.empresa_id = p_empresa and e.id = any(p_etapas) and (e.pedido_id is null or e.origem='pendencia' or exists(select 1 from public.separacoes_pedidos p where p.id=e.pedido_id and public.pedido_fluxo_etapa(p) in ('triagem','expedicao'))) and e.data >= current_date and e.tipo <> 'outra'
     order by e.data, e.hora nulls first
  loop
    conf := reg->'etapas'->operacao_tipo_regra(et.tipo);
    if conf is null then continue; end if;
    jan := et.j; mudou := false;
    m3 := case when et.volume_m3 is not null then greatest(et.volume_m3, 0.01) end;
    m3 := coalesce(m3, nullif((operacao_volume_pedido(et.pedido_id)->>'m3')::numeric, 0), (reg->>'volume_padrao_m3')::numeric, 10);
    precisa := operacao_sugerido(et.tipo, m3, reg);

    -- quem está ocupado nessa janela (em outra etapa)
    create temp table if not exists _ocupados(funcionario_id uuid, free_id uuid) on commit drop;
    truncate _ocupados;
    insert into _ocupados
      select p.funcionario_id, p.free_id from operacao_etapa_pessoas p join operacao_etapas o on o.id = p.etapa_id
       where o.empresa_id = p_empresa and o.id <> et.id and operacao_janela(o.data, o.hora, o.tipo, reg) && jan;

    tem_resp := exists (select 1 from operacao_etapa_pessoas where etapa_id = et.id and papel = 'responsavel');
    if not tem_resp then
      select f.id, f.nome into pessoa from funcionarios_acesso f
       where f.empresa_id = p_empresa and f.ativo and f.lider_operacao and f.equipe_operacional = conf->>'equipe'
         and public.escala_pessoa_compativel(p_empresa,et.id,f.id,null)
         and not exists (select 1 from _ocupados o where o.funcionario_id = f.id)
         and not exists (select 1 from operacao_etapa_pessoas x where x.etapa_id = et.id and x.funcionario_id = f.id)
       order by (select count(*) from operacao_etapa_pessoas x join operacao_etapas o on o.id = x.etapa_id
                  where x.funcionario_id = f.id and o.data between et.data - 7 and et.data + 7), f.nome
       limit 1;
      if found then
        insert into operacao_etapa_pessoas (empresa_id, etapa_id, funcionario_id, nome, papel) values (p_empresa, et.id, pessoa.id, pessoa.nome, 'responsavel');
        tem_resp := true; mudou := true;
      end if;
    end if;

    n_eq := (select count(*) from operacao_etapa_pessoas where etapa_id = et.id and papel = 'equipe');
    if n_eq = 0 then
      -- fixos da equipe (não-líderes primeiro), depois free com vaga confirmada, depois free aprovados
      for pessoa in
        select f.id, null::uuid free_id, f.nome, 1 grupo, f.lider_operacao ordem2,
               (select count(*) from operacao_etapa_pessoas x join operacao_etapas o on o.id = x.etapa_id
                 where x.funcionario_id = f.id and o.data between et.data - 7 and et.data + 7) carga
          from funcionarios_acesso f
         where f.empresa_id = p_empresa and f.ativo and f.equipe_operacional = conf->>'equipe'
           and not exists (select 1 from _ocupados o where o.funcionario_id = f.id)
           and not exists (select 1 from operacao_etapa_pessoas x where x.etapa_id = et.id and x.funcionario_id = f.id)
        union all
        select null, c.id, c.nome, 3, false,
               (select count(*) from operacao_etapa_pessoas x join operacao_etapas o on o.id = x.etapa_id
                 where x.free_id = c.id and o.data between et.data - 7 and et.data + 7)
          from free_cadastros c
         where c.empresa_id = p_empresa and c.status = 'aprovado' and coalesce((reg->>'usar_free')::boolean, true)
           and not exists (select 1 from _ocupados o where o.free_id = c.id)
           and not exists (select 1 from operacao_etapa_pessoas x where x.etapa_id = et.id and x.free_id = c.id)
         order by 4, 5, 6, 3
      loop
        exit when n_eq >= precisa - (case when tem_resp then 1 else 0 end);
        continue when not public.escala_pessoa_compativel(p_empresa,et.id,pessoa.id,pessoa.free_id);
        insert into operacao_etapa_pessoas (empresa_id, etapa_id, funcionario_id, free_id, nome, papel, ordem)
        values (p_empresa, et.id, pessoa.id, pessoa.free_id, pessoa.nome, 'equipe', n_eq);
        n_eq := n_eq + 1; mudou := true;
      end loop;
    end if;

    if coalesce((conf->>'caminhao')::boolean, false) and et.servico_ref is null and not exists (select 1 from operacao_etapa_caminhoes where etapa_id = et.id) then
      par := null;
      if et.tipo in ('montagem','descarregamento') then
        select c.caminhao_id into par from operacao_etapas o join operacao_etapa_caminhoes c on c.etapa_id = o.id
         where o.pedido_id = et.pedido_id and o.tipo = case et.tipo when 'montagem' then 'carregamento' else 'desmontagem' end limit 1;
      end if;
      if par is not null then
        insert into operacao_etapa_caminhoes (etapa_id, caminhao_id, empresa_id)
          select et.id, c.caminhao_id, p_empresa from operacao_etapas o join operacao_etapa_caminhoes c on c.etapa_id = o.id
           where o.pedido_id = et.pedido_id and o.tipo = case et.tipo when 'montagem' then 'carregamento' else 'desmontagem' end
          on conflict do nothing;
        mudou := true;
      else
        select k.id into cam from caminhoes k
         where k.empresa_id = p_empresa and k.status = 'ativo' and coalesce(k.codigo, '') <> ''
           and not exists (select 1 from operacao_etapa_caminhoes c join operacao_etapas o on o.id = c.etapa_id
                            where c.caminhao_id = k.id and o.id <> et.id and o.pedido_id is distinct from et.pedido_id
                              and operacao_janela(o.data, o.hora, o.tipo, reg) && jan)
         order by (k.capacidade_m3 >= m3) desc, case when k.capacidade_m3 >= m3 then k.capacidade_m3 else -k.capacidade_m3 end
         limit 1;
        if found then
          insert into operacao_etapa_caminhoes (etapa_id, caminhao_id, empresa_id) values (et.id, cam.id, p_empresa);
          mudou := true;
        end if;
      end if;
    end if;
    if mudou then total := total + 1; end if;
  end loop;
  return total;
end $function$
;

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
  perform set_config('acervo.sincronizando_pedido', '1', true);
  select * into p from separacoes_pedidos where id = p_pedido;
  if not found then perform set_config('acervo.sincronizando_pedido', '', true); return 0; end if;
  select * into r from empresa_logistica_regras where empresa_id = p.empresa_id;
  permitidos := coalesce(nullif(r.status_cronograma, '{}'), array['pre_reserva','aprovado']);
  if not (coalesce(p.status_comercial, '') = any(permitidos)) or p.data_evento is null then
    delete from operacao_etapas where pedido_id = p.id;
    perform set_config('acervo.sincronizando_pedido', '', true);
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
        data = e.data, hora = e.hora,
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
     and (v.data + coalesce(v.hora, padrao)) <= (d.data + coalesce(d.hora, padrao)) ;
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
        data = sv.dt, hora = sv.hr,
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
  perform set_config('acervo.sincronizando_pedido', '', true);
  return n;
end $function$
;

create or replace function public.operacao_etapa_data_do_pedido() returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('acervo.sincronizando_pedido', true), '') = '1' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.origem = 'pedido' and exists (select 1 from separacoes_pedidos p where p.id = old.pedido_id) then
      raise exception '% vem do pedido e não pode ser removida no cronograma. Altere o pedido no Comercial.', old.nome;
    end if;
    return old;
  end if;
  if old.origem = 'pedido' and (new.data is distinct from old.data or new.hora is distinct from old.hora) then
    raise exception 'A data e o horário de % vêm do pedido. Para mudar, altere o pedido no Comercial.', old.nome;
  end if;
  return new;
end $$;
drop trigger if exists operacao_etapa_data_do_pedido on public.operacao_etapas;
create trigger operacao_etapa_data_do_pedido before update of data, hora or delete on public.operacao_etapas
  for each row execute function public.operacao_etapa_data_do_pedido();
-- etapas que alguém já tinha mudado à mão voltam à data do pedido
do $$ declare r record; begin for r in select distinct pedido_id from public.operacao_etapas where origem = 'pedido' and pedido_id is not null loop perform public.operacao_sincronizar_pedido(r.pedido_id); end loop; end $$;
