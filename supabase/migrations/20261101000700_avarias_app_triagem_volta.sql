-- Itens danificados (01/11/2026, pedido do usuário):
-- 1) App do Montador, na contagem da desmontagem: quantidade danificada + foto obrigatória.
--    Fica no registro 'contagem_itens' (dados.danificados) e a coleta confirmada pela logística leva a foto
--    para o retorno de avaria da Gestão do acervo.
-- 2) Triagem da volta: registrar item danificado (quantidade + descrição; foto opcional). Vira retorno de
--    avaria na Gestão do acervo, já no galpão (estado 'triagem'), tirando a mesma quantidade da "revisão".
begin;

alter table public.acervo_retornos add column if not exists evidencias jsonb not null default '[]'::jsonb;
alter table public.acervo_retornos drop constraint if exists acervo_retornos_origem_check;
alter table public.acervo_retornos add constraint acervo_retornos_origem_check check (origem = any (array['coleta','inventario','triagem_retorno']));
alter table public.acervo_retornos drop constraint if exists acervo_origem_valida;
alter table public.acervo_retornos add constraint acervo_origem_valida check (
  (origem in ('coleta','triagem_retorno') and pedido_id is not null and inventario_id is null)
  or (origem = 'inventario' and pedido_id is null and inventario_id is not null));

-- 1) App: contagem com danificados -------------------------------------------------------------
create or replace function public.mont_contagem_itens(p_token text, p_etapa uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); e operacao_etapas; p separacoes_pedidos; r operacao_registros;
begin
  select * into e from operacao_etapas where id = p_etapa;
  if e.id is null or not mont_pode_ver(s, p_etapa) then raise exception 'Entre no app como responsável por esta etapa.'; end if;
  select * into p from separacoes_pedidos where id = e.pedido_id;
  select * into r from operacao_registros where etapa_id = p_etapa and tipo = 'contagem_itens';
  return jsonb_build_object('enviado', r.id is not null, 'quantidades', coalesce(r.dados->'itens', '{}'), 'danificados', coalesce(r.dados->'danificados', '{}'), 'autor', r.autor,
    'itens', coalesce((select jsonb_agg(jsonb_build_object('chave', c.chave, 'item_id', c.item_id, 'nome', c.nome, 'kit_nome', c.kit_nome, 'por_kit', c.por_kit, 'pedido_numero', case when cardinality(pedido_grupo(p.id)) > 1 then c.pedido_numero end,
        'esperado', coalesce((select (x->>'conferido')::numeric from jsonb_array_elements(coalesce(pedido_grupo_carregamento(p.id), '[]')) x where x->>'chave' = c.chave limit 1), c.esperado),
        'foto', (select foto_url from itens where id = c.item_id)) order by c.kit_nome nulls first, c.nome)
      from operacao_conferencia_pecas(p.id, true) c), '[]'));
end $$;

drop function if exists public.mont_contagem_salvar(text, uuid, jsonb);
create function public.mont_contagem_salvar(p_token text, p_etapa uuid, p_quantidades jsonb, p_danificados jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); e operacao_etapas; c record; q jsonb := '{}'; d jsonb := '{}'; v numeric; dn numeric; x jsonb; f jsonb; url text;
begin
  select * into e from operacao_etapas where id = p_etapa;
  if e.id is null or not mont_pode_ver(s, p_etapa) then raise exception 'Entre no app como responsável por esta etapa.'; end if;
  if e.tipo <> 'desmontagem' then raise exception 'A contagem por item é da desmontagem.'; end if;
  if exists (select 1 from operacao_registros where etapa_id = p_etapa and tipo = 'desmontagem_concluida') then raise exception 'A desmontagem já foi concluída.'; end if;
  for c in select * from operacao_conferencia_pecas(e.pedido_id, true) loop
    v := nullif(p_quantidades->>c.chave, '')::numeric;
    if v is null or v < 0 or v <> trunc(v) then raise exception 'Informe a quantidade de: % (0 se não voltou).', c.nome; end if;
    q := q || jsonb_build_object(c.chave, v);
    x := coalesce(p_danificados, '{}'::jsonb)->c.chave;
    dn := coalesce(nullif(x->>'quantidade', '')::numeric, 0);
    if dn < 0 or dn <> trunc(dn) then raise exception 'Quantidade danificada inválida: %.', c.nome; end if;
    if dn > v then raise exception 'Danificados de % passam do que foi contado (%).', c.nome, v; end if;
    if dn > 0 then
      f := coalesce(x->'fotos', '[]'::jsonb);
      if jsonb_typeof(f) <> 'array' or jsonb_array_length(f) = 0 then raise exception 'Tire a foto do item danificado: %.', c.nome; end if;
      if jsonb_array_length(f) > 6 then raise exception 'Até 6 fotos por item.'; end if;
      for url in select jsonb_array_elements_text(f) loop
        if url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/operacao-fotos/' then raise exception 'Foto inválida.'; end if;
      end loop;
      d := d || jsonb_build_object(c.chave, jsonb_build_object('quantidade', dn, 'fotos', f, 'descricao', left(coalesce(x->>'descricao', ''), 300)));
    end if;
  end loop;
  insert into operacao_registros (empresa_id, etapa_id, tipo, dados, autor) values (e.empresa_id, p_etapa, 'contagem_itens', jsonb_build_object('itens', q, 'danificados', d, 'em', now()), s.nome)
  on conflict (etapa_id, tipo) do update set dados = excluded.dados, autor = excluded.autor, atualizado_em = now();
  return mont_contagem_itens(p_token, p_etapa);
end $$;
revoke all on function public.mont_contagem_salvar(text, uuid, jsonb, jsonb) from public;
grant execute on function public.mont_contagem_salvar(text, uuid, jsonb, jsonb) to anon, authenticated;

-- Danificados que o App registrou para o pedido (todas as desmontagens do grupo), por chave.
create or replace function public.operacao_danificados_app(p_pedido uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb)
  from operacao_registros r join operacao_etapas e on e.id = r.etapa_id,
       jsonb_each(coalesce(r.dados->'danificados', '{}'::jsonb)) k
  where r.tipo = 'contagem_itens' and e.tipo = 'desmontagem' and e.pedido_id = any(pedido_grupo(p_pedido));
$$;
revoke all on function public.operacao_danificados_app(uuid) from public, anon;
grant execute on function public.operacao_danificados_app(uuid) to authenticated;

-- Coleta confirmada: a avaria leva as fotos do App.
create or replace function public.acervo_sincronizar_coleta() returns trigger language plpgsql security definer set search_path=public as $$
declare x jsonb;t text;q numeric;r uuid;app jsonb := operacao_danificados_app(new.pedido_id);ev jsonb;begin
 if new.etapa<>'coleta' then return new;end if;
 for x in select * from jsonb_array_elements(new.itens) loop
  foreach t in array array['revisao','avaria','falta'] loop
   q:=case t when 'revisao' then coalesce((x->>'coletado')::numeric,0)-coalesce((x->>'danificado')::numeric,0) when 'avaria' then coalesce((x->>'danificado')::numeric,0) else coalesce((x->>'nao_coletado')::numeric,0) end;
   if q>0 then
    ev := case when t='avaria' then coalesce((select jsonb_agg(jsonb_build_object('url',u,'origem','app','descricao',coalesce(app->(x->>'chave')->>'descricao',''))) from jsonb_array_elements_text(coalesce(app->(x->>'chave')->'fotos','[]'::jsonb)) u),'[]'::jsonb) else '[]'::jsonb end;
    insert into acervo_retornos(empresa_id,pedido_id,chave,item_id,tipo,quantidade,estado,motivo,atualizado_por,evidencias)
    values(new.empresa_id,new.pedido_id,x->>'chave',(x->>'item_id')::uuid,t,q,case when t='falta' then 'investigacao' else 'aguardando_retorno' end,
      coalesce(nullif(x->>'observacao',''), case when t='avaria' then coalesce(app->(x->>'chave')->>'descricao','') end, ''),new.criado_por,ev)
    on conflict(pedido_id,chave,tipo) do nothing returning id into r;
    if r is not null then insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) select empresa_id,id,estado,'Registro da coleta',new.criado_por from acervo_retornos where id=r;end if;
   end if;
  end loop;
 end loop;return new;
end $$;

-- 2) Triagem da volta: registrar item danificado ------------------------------------------------
create or replace function public.operacao_avarias_pedido(p_pedido uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p separacoes_pedidos;
begin
  select * into p from separacoes_pedidos where id = p_pedido;
  if p.id is null or not eh_membro_empresa(p.empresa_id) or not (funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','select') or funcionario_tabela_permitida(p.empresa_id,'itens','select')) then
    raise exception 'Sem acesso a este pedido'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'chave', a.chave, 'item_id', a.item_id, 'nome', coalesce(i.descricao_total, i.produto), 'quantidade', a.quantidade,
      'origem', a.origem, 'estado', a.estado, 'motivo', a.motivo, 'evidencias', a.evidencias, 'criado_em', a.criado_em,
      'pode_remover', a.origem = 'triagem_retorno' and a.estado = 'triagem' and a.os_id is null) order by a.criado_em)
    from acervo_retornos a join itens i on i.id = a.item_id
    where a.pedido_id = any(pedido_grupo(p.id)) and a.tipo = 'avaria'), '[]'::jsonb);
end $$;
revoke all on function public.operacao_avarias_pedido(uuid) from public, anon;
grant execute on function public.operacao_avarias_pedido(uuid) to authenticated;

create or replace function public.operacao_avaria_retorno(p_pedido uuid, p_chave text, p_quantidade numeric, p_descricao text, p_fotos jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p separacoes_pedidos; c record; ja numeric; atual acervo_retornos; rev acervo_retornos; f text; delta numeric; nova numeric;
begin
  select * into p from separacoes_pedidos where id = p_pedido for update;
  if p.id is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para registrar avaria'; end if;
  if p.encerrado_operacional_em is not null then raise exception 'Operação encerrada'; end if;
  if p.pedido_origem_id is not null then raise exception 'Registre a avaria no pedido principal'; end if;
  if coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') then raise exception 'Pré-reserva e orçamento são somente consulta.'; end if;
  if not exists (select 1 from logistica_confirmacoes where pedido_id = any(pedido_grupo(p.id)) and etapa = 'coleta') then raise exception 'A avaria da volta é registrada depois da coleta.'; end if;
  select * into c from operacao_conferencia_pecas(p.id, true) x where x.chave = p_chave;
  if c.chave is null then raise exception 'Item não pertence a este pedido'; end if;
  if p_quantidade is null or p_quantidade < 0 or p_quantidade <> trunc(p_quantidade) then raise exception 'Quantidade inválida'; end if;
  if p_quantidade > 0 and length(btrim(coalesce(p_descricao,''))) < 3 then raise exception 'Descreva o dano'; end if;
  if jsonb_typeof(coalesce(p_fotos,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_fotos,'[]'::jsonb)) > 6 then raise exception 'Até 6 fotos'; end if;
  for f in select jsonb_array_elements_text(coalesce(p_fotos,'[]'::jsonb)) loop
    if f !~ ('^' || p.empresa_id::text || '/' || p.id::text || '/avaria-[0-9a-f-]{36}\.jpg$') then raise exception 'Foto inválida'; end if;
  end loop;
  -- avaria já registrada para o mesmo item (coleta) entra no limite
  select coalesce(sum(quantidade),0) into ja from acervo_retornos where pedido_id = any(pedido_grupo(p.id)) and item_id = c.item_id and tipo = 'avaria' and chave <> 'retorno:' || p_chave;
  if ja + p_quantidade > c.esperado then raise exception 'Danificados de % passam do que saiu (%).', c.nome, c.esperado; end if;

  select * into atual from acervo_retornos where pedido_id = c.pedido_id and chave = 'retorno:' || p_chave and tipo = 'avaria' for update;
  if atual.id is not null and (atual.estado <> 'triagem' or atual.os_id is not null) then raise exception 'Esta avaria já está em tratamento na Gestão do acervo'; end if;
  delta := p_quantidade - coalesce(atual.quantidade, 0);

  if p_quantidade = 0 then
    if atual.id is not null then delete from acervo_historico where retorno_id = atual.id; delete from acervo_retornos where id = atual.id; end if;
  elsif atual.id is null then
    insert into acervo_retornos(empresa_id,pedido_id,chave,item_id,tipo,quantidade,estado,motivo,atualizado_por,origem,evidencias)
    values (p.empresa_id, c.pedido_id, 'retorno:' || p_chave, c.item_id, 'avaria', p_quantidade, 'triagem', left(btrim(p_descricao),500), auth.uid(), 'triagem_retorno',
      coalesce((select jsonb_agg(jsonb_build_object('path', u, 'bucket', 'evidencias-operacionais', 'origem', 'triagem')) from jsonb_array_elements_text(coalesce(p_fotos,'[]'::jsonb)) u), '[]'::jsonb))
    returning * into atual;
    insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) values (p.empresa_id, atual.id, 'triagem', 'Danificado na Triagem da volta', auth.uid());
  else
    update acervo_retornos set quantidade = p_quantidade, motivo = left(btrim(p_descricao),500), atualizado_por = auth.uid(), atualizado_em = now(), versao = versao + 1,
      evidencias = coalesce((select jsonb_agg(jsonb_build_object('path', u, 'bucket', 'evidencias-operacionais', 'origem', 'triagem')) from jsonb_array_elements_text(coalesce(p_fotos,'[]'::jsonb)) u), '[]'::jsonb)
    where id = atual.id;
  end if;

  -- a mesma quantidade sai (ou volta) da "revisão" do item, para o total parado não dobrar
  if delta <> 0 then
    select * into rev from acervo_retornos where pedido_id = any(pedido_grupo(p.id)) and item_id = c.item_id and tipo = 'revisao' and estado in ('aguardando_retorno','triagem') and os_id is null order by criado_em limit 1 for update;
    if rev.id is null and delta < 0 then
      insert into acervo_retornos(empresa_id,pedido_id,chave,item_id,tipo,quantidade,estado,motivo,atualizado_por,origem)
      values (p.empresa_id, c.pedido_id, 'retorno-revisao:' || p_chave, c.item_id, 'revisao', -delta, 'triagem', 'Avaria desfeita na Triagem da volta', auth.uid(), 'triagem_retorno')
      on conflict (pedido_id, chave, tipo) do update set quantidade = acervo_retornos.quantidade + excluded.quantidade, versao = acervo_retornos.versao + 1, atualizado_em = now();
    elsif rev.id is not null then
      nova := rev.quantidade - delta;
      if nova <= 0 then delete from acervo_historico where retorno_id = rev.id; delete from acervo_retornos where id = rev.id;
      else update acervo_retornos set quantidade = nova, versao = versao + 1, atualizado_em = now() where id = rev.id; end if;
    end if;
  end if;
  return operacao_avarias_pedido(p.id);
end $$;
revoke all on function public.operacao_avaria_retorno(uuid, text, numeric, text, jsonb) from public, anon;
grant execute on function public.operacao_avaria_retorno(uuid, text, numeric, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
