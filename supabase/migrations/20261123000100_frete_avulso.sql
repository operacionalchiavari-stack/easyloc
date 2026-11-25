-- Frete avulso (23/11/2026, pedido do usuário): frete que não é de pedido (buscar material, levar peça para conserto,
-- retirada extra). A Logística cadastra no Painel Logístico (antes, ou depois se não foi planejado): freteiro, data, de onde,
-- para onde, motivo e valor combinado. Ele aparece na lista "Qual frete?" do App do Freteiro como "Avulso · motivo"; o
-- freteiro escolhe igual a um pedido. Na conferência, o valor lançado é comparado com o valor combinado do avulso.
create table if not exists public.frete_avulsos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  freteiro_id uuid not null references public.frete_freteiros(id) on delete restrict,
  data date not null,
  origem text not null,
  destino text not null,
  motivo text not null,
  valor numeric(12,2) not null check (valor > 0),
  observacao text,
  cancelado_em timestamptz,
  cancelado_motivo text,
  criado_por uuid,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.frete_avulsos enable row level security;
revoke all on public.frete_avulsos from anon, authenticated;
create index if not exists frete_avulsos_freteiro_data on public.frete_avulsos (freteiro_id, data);

alter table public.frete_lancamentos add column if not exists avulso_id uuid references public.frete_avulsos(id) on delete set null;

-- --------------------------------------------------------------- Painel Logístico
create or replace function public.logistica_fretes_avulsos(p_empresa uuid, p_inicio date, p_fim date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform logistica_servicos_autorizar(p_empresa);
  return jsonb_build_object(
    'freteiros', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'veiculo', trim(concat_ws(' · ', f.veiculo_modelo, f.veiculo_placa))) order by f.nome)
                             from frete_freteiros f where f.empresa_id = p_empresa and f.status = 'aprovado'), '[]'),
    'avulsos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'data', a.data, 'origem', a.origem, 'destino', a.destino, 'motivo', a.motivo,
        'valor', a.valor, 'observacao', a.observacao, 'freteiro_id', a.freteiro_id, 'freteiro', f.nome, 'telefone', f.telefone,
        'cancelado', a.cancelado_em is not null, 'cancelado_motivo', a.cancelado_motivo, 'criado_por', a.criado_por_nome, 'criado_em', a.created_at,
        'lancado', l.id is not null, 'valor_lancado', case when l.id is not null then frete_lanc_total(l) end,
        'situacao', case when a.cancelado_em is not null then 'cancelado'
                         when l.id is null then 'aguardando'
                         when l.relatorio_id is null then 'lancado'
                         when l.pagar_id is not null then 'financeiro'
                         when l.situacao = 'divergente' then 'divergencia'
                         else 'enviado' end) order by a.data, a.created_at)
      from frete_avulsos a join frete_freteiros f on f.id = a.freteiro_id
      left join lateral (select * from frete_lancamentos x where x.avulso_id = a.id order by x.created_at desc limit 1) l on true
     where a.empresa_id = p_empresa and a.data between p_inicio and p_fim), '[]'));
end $$;
revoke all on function public.logistica_fretes_avulsos(uuid, date, date) from public, anon;
grant execute on function public.logistica_fretes_avulsos(uuid, date, date) to authenticated;

create or replace function public.logistica_frete_avulso_salvar(p_empresa uuid, p_id uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v numeric; d date; fr uuid;
begin
  perform logistica_servicos_autorizar(p_empresa, true);
  begin fr := nullif(p_dados->>'freteiro_id', '')::uuid; exception when others then fr := null; end;
  if fr is null or not exists (select 1 from frete_freteiros where id = fr and empresa_id = p_empresa and status = 'aprovado') then raise exception 'Escolha o freteiro.'; end if;
  begin d := (p_dados->>'data')::date; exception when others then d := null; end;
  if d is null then raise exception 'Informe a data do frete.'; end if;
  if length(btrim(coalesce(p_dados->>'origem', ''))) < 2 then raise exception 'Informe de onde sai o frete.'; end if;
  if length(btrim(coalesce(p_dados->>'destino', ''))) < 2 then raise exception 'Informe para onde vai o frete.'; end if;
  if length(btrim(coalesce(p_dados->>'motivo', ''))) < 3 then raise exception 'Informe o motivo do frete.'; end if;
  begin v := round((p_dados->>'valor')::numeric, 2); exception when others then v := null; end;
  if coalesce(v, 0) <= 0 then raise exception 'Informe o valor combinado.'; end if;
  if p_id is null then
    insert into frete_avulsos (empresa_id, freteiro_id, data, origem, destino, motivo, valor, observacao, criado_por, criado_por_nome)
    values (p_empresa, fr, d, btrim(p_dados->>'origem'), btrim(p_dados->>'destino'), btrim(p_dados->>'motivo'), v,
            nullif(btrim(coalesce(p_dados->>'observacao', '')), ''), auth.uid(), logistica_nome_usuario(p_empresa))
    returning id into v_id;
  else
    if exists (select 1 from frete_lancamentos where avulso_id = p_id and relatorio_id is not null) then
      raise exception 'Este frete já está num relatório enviado pelo freteiro e não pode mais ser alterado.';
    end if;
    update frete_avulsos set freteiro_id = fr, data = d, origem = btrim(p_dados->>'origem'), destino = btrim(p_dados->>'destino'),
           motivo = btrim(p_dados->>'motivo'), valor = v, observacao = nullif(btrim(coalesce(p_dados->>'observacao', '')), ''), updated_at = now()
     where id = p_id and empresa_id = p_empresa and cancelado_em is null returning id into v_id;
    if v_id is null then raise exception 'Frete avulso não encontrado.'; end if;
    -- lançamento ainda em rascunho acompanha a mudança (ou sai, se mudou de freteiro)
    delete from frete_lancamentos where avulso_id = p_id and relatorio_id is null and freteiro_id <> fr;
    update frete_lancamentos set data = d, origem = btrim(p_dados->>'origem'), destino = btrim(p_dados->>'destino'), updated_at = now()
     where avulso_id = p_id and relatorio_id is null;
  end if;
  return v_id;
end $$;
revoke all on function public.logistica_frete_avulso_salvar(uuid, uuid, jsonb) from public, anon;
grant execute on function public.logistica_frete_avulso_salvar(uuid, uuid, jsonb) to authenticated;

create or replace function public.logistica_frete_avulso_cancelar(p_empresa uuid, p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform logistica_servicos_autorizar(p_empresa, true);
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Informe o motivo do cancelamento.'; end if;
  if exists (select 1 from frete_lancamentos where avulso_id = p_id and relatorio_id is not null) then
    raise exception 'Este frete já está num relatório enviado pelo freteiro; resolva pelas Divergências.';
  end if;
  update frete_avulsos set cancelado_em = now(), cancelado_motivo = btrim(p_motivo), updated_at = now()
   where id = p_id and empresa_id = p_empresa and cancelado_em is null;
  if not found then raise exception 'Frete avulso não encontrado.'; end if;
  delete from frete_lancamentos where avulso_id = p_id and relatorio_id is null;
end $$;
revoke all on function public.logistica_frete_avulso_cancelar(uuid, uuid, text) from public, anon;
grant execute on function public.logistica_frete_avulso_cancelar(uuid, uuid, text) to authenticated;

-- --------------------------------------------------------------- App do Freteiro
create or replace function public.frete_lanc_json(l frete_lancamentos) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', l.id, 'data', l.data, 'origem', l.origem, 'destino', l.destino, 'caminhao', l.caminhao, 'veiculo_id', l.veiculo_id, 'origem_lat', l.origem_lat, 'origem_lng', l.origem_lng, 'destino_lat', l.destino_lat, 'destino_lng', l.destino_lng, 'valor', l.valor, 'extras', l.extras,
    'total', frete_lanc_total(l), 'observacao', l.observacao, 'situacao', l.situacao, 'divergencia', l.divergencia,
    'tipo', l.origem_lanc, 'explicacao', l.explicacao, 'explicacao_em', l.explicacao_em, 'decisao_motivo', l.decisao_motivo,
    'valor_final', l.valor_final, 'decidido', l.decisao_em is not null,
    'pedido_id', l.pedido_id, 'direcao', l.direcao, 'avulso_id', l.avulso_id,
    'avulso', (select jsonb_build_object('motivo', a.motivo) from frete_avulsos a where a.id = l.avulso_id),
    'pedido', (select jsonb_build_object('numero', p.numero_pedido) from separacoes_pedidos p where p.id = l.pedido_id))
$$;
revoke all on function public.frete_lanc_json(frete_lancamentos) from public, anon, authenticated;

create or replace function public.frete_lanc_app(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a date; b date; cfg jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select p.ini, p.fim into a, b from frete_periodo_aberto(f) p;
  select frete_periodo into cfg from empresa_logistica_regras where empresa_id = f.empresa_id;
  return jsonb_build_object('veiculos', frete_veiculos_lista(f),
    'periodo', jsonb_build_object('ini', a, 'fim', b, 'tipo', coalesce(cfg->>'tipo', 'semanal'), 'pode_enviar', hoje >= b),
    'opcoes', coalesce((select jsonb_agg(z order by z->>'data') from (
        select jsonb_build_object('pedido_id', o.pedido_id, 'numero', o.numero, 'local', o.local_nome, 'endereco', o.endereco, 'direcao', o.direcao, 'data', o.data) z
          from frete_lanc_opcoes(f.empresa_id, a, b) o
        union all
        select jsonb_build_object('avulso_id', v.id, 'direcao', 'avulso', 'data', v.data, 'origem', v.origem, 'destino', v.destino, 'motivo', v.motivo, 'valor', v.valor)
          from frete_avulsos v where v.freteiro_id = f.id and v.cancelado_em is null and v.data between a and b) q), '[]'),
    'rascunhos', coalesce((select jsonb_agg(frete_lanc_json(l) order by l.data, l.created_at) from frete_lancamentos l where l.freteiro_id = f.id and l.situacao = 'rascunho'), '[]'),
    'relatorios', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'ini', r.periodo_ini, 'fim', r.periodo_fim, 'status', r.status, 'enviado_em', r.enviado_em,
        'total', r.total_informado,
        'pendentes', (select count(*) from frete_lancamentos l where l.relatorio_id = r.id and l.situacao = 'divergente'),
        'lancamentos', coalesce((select jsonb_agg(frete_lanc_json(l) order by l.data, l.created_at) from frete_lancamentos l where l.relatorio_id = r.id), '[]'))
        order by r.periodo_ini desc) from frete_relatorios r where r.freteiro_id = f.id and r.enviado_em > now() - interval '180 days'), '[]'));
end $$;
grant execute on function public.frete_lanc_app(text) to anon, authenticated;

create or replace function public.frete_lanc_salvar(p_token text, p_id uuid, p_dados jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a date; b date; v numeric; o record; av frete_avulsos;
  ped uuid; avu uuid; dir text; orig text; dest text; olat numeric; olng numeric; dlat numeric; dlng numeric; ende text; d date;
begin
  if f.status <> 'aprovado' then raise exception 'Seu cadastro ainda não foi aprovado.'; end if;
  if p_id is not null and not exists (select 1 from frete_lancamentos where id = p_id and freteiro_id = f.id and situacao = 'rascunho') then
    raise exception 'Este frete já foi enviado e não pode mais ser alterado.';
  end if;
  select p.ini, p.fim into a, b from frete_periodo_aberto(f) p;
  begin ped := nullif(p_dados->>'pedido_id', '')::uuid; exception when others then ped := null; end;
  begin avu := nullif(p_dados->>'avulso_id', '')::uuid; exception when others then avu := null; end;
  dir := p_dados->>'direcao';
  if avu is not null then
    select * into av from frete_avulsos where id = avu and freteiro_id = f.id and cancelado_em is null and data between a and b;
    if av.id is null then raise exception 'Este frete avulso não está liberado para você neste período.'; end if;
    ped := null; dir := null; d := av.data; orig := av.origem; dest := av.destino;
  else
    if ped is null or dir not in ('entrega', 'coleta') then raise exception 'Escolha o frete (pedido) que você fez.'; end if;
    select * into o from frete_lanc_opcoes(f.empresa_id, a, b) x where x.pedido_id = ped and x.direcao = dir limit 1;
    if o.pedido_id is null then
      raise exception 'Este pedido não tem % entre % e %. Escolha um frete da lista.', dir, to_char(a, 'DD/MM/YYYY'), to_char(b, 'DD/MM/YYYY');
    end if;
    d := o.data;
    ende := btrim(concat_ws(' · ', o.local_nome, nullif(o.endereco, '')));
    if dir = 'entrega' then orig := 'Galpão'; dest := ende; dlat := o.lat; dlng := o.lng;
    else orig := ende; dest := 'Galpão'; olat := o.lat; olng := o.lng; end if;
  end if;
  if length(btrim(coalesce(p_dados->>'caminhao', ''))) < 2 then raise exception 'Informe o caminhão do frete.'; end if;
  begin v := round((p_dados->>'valor')::numeric, 2); exception when others then raise exception 'Informe o valor combinado.'; end;
  if coalesce(v, 0) <= 0 then raise exception 'Informe o valor combinado.'; end if;
  if p_id is null then
    insert into frete_lancamentos (empresa_id, freteiro_id, data, origem, destino, valor, extras, observacao, caminhao, veiculo_id,
      origem_lat, origem_lng, destino_lat, destino_lng, pedido_id, direcao, avulso_id)
    values (f.empresa_id, f.id, d, orig, coalesce(nullif(dest, ''), 'Local do evento'), v, '[]'::jsonb, nullif(btrim(coalesce(p_dados->>'observacao', '')), ''),
      btrim(p_dados->>'caminhao'), nullif(p_dados->>'veiculo_id', '')::uuid, olat, olng, dlat, dlng, ped, dir, avu);
  else
    update frete_lancamentos set data = d, origem = orig, destino = coalesce(nullif(dest, ''), 'Local do evento'), valor = v, extras = '[]'::jsonb,
           observacao = nullif(btrim(coalesce(p_dados->>'observacao', '')), ''), caminhao = btrim(p_dados->>'caminhao'), veiculo_id = nullif(p_dados->>'veiculo_id', '')::uuid,
           origem_lat = olat, origem_lng = olng, destino_lat = dlat, destino_lng = dlng, pedido_id = ped, direcao = dir, avulso_id = avu, updated_at = now()
     where id = p_id and freteiro_id = f.id and situacao = 'rascunho';
    if not found then raise exception 'Este frete já foi enviado e não pode mais ser alterado.'; end if;
  end if;
  return frete_lanc_app(p_token);
end $$;
grant execute on function public.frete_lanc_salvar(text, uuid, jsonb) to anon, authenticated;

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
    select * into x from frete_anuncios z where z.freteiro_id = f.id and z.status = 'aceito' and z.checkout_em is not null
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
    from frete_anuncios z where z.freteiro_id = f.id and z.status = 'aceito' and z.checkout_em is not null and z.data between a and b and z.id <> all(usados);
  -- frete avulso cadastrado pela Logística que ele não lançou
  insert into frete_lancamentos (empresa_id, freteiro_id, relatorio_id, origem_lanc, data, origem, destino, valor, valor_sistema, situacao, divergencia, avulso_id)
  select f.empresa_id, f.id, rel, 'sistema', v.data, v.origem, v.destino, 0, v.valor, 'divergente', 'nao_lancado', v.id
    from frete_avulsos v where v.freteiro_id = f.id and v.cancelado_em is null and v.data between a and b
     and not exists (select 1 from frete_lancamentos q where q.avulso_id = v.id and q.relatorio_id = rel);
  update frete_relatorios set total_informado = coalesce((select sum(frete_lanc_total(q)) from frete_lancamentos q where q.relatorio_id = rel and q.origem_lanc = 'freteiro'), 0) where id = rel;
  perform frete_relatorio_finalizar(rel);
  return frete_lanc_app(p_token);
end $$;
grant execute on function public.frete_lanc_enviar(text) to anon, authenticated;

-- relatório no financeiro: pedido também pelo lançamento e o motivo do avulso na descrição
create or replace function public.frete_relatorio_finalizar(p_rel uuid) returns void language plpgsql security definer set search_path = public as $$
declare r frete_relatorios; f frete_freteiros; forn fornecedores; l record; v_pagar uuid; v_fech uuid; v_cat uuid; ped record; v_user uuid; v_ord int := 0; v_inf numeric;
  ref text; v_desc text;
begin
  select * into r from frete_relatorios where id = p_rel for update;
  if r.id is null or r.status <> 'enviado' then return; end if;
  if exists (select 1 from frete_lancamentos where relatorio_id = r.id and situacao = 'divergente') then return; end if;
  select * into f from frete_freteiros where id = r.freteiro_id;
  select * into forn from fornecedores where id = f.fornecedor_id;
  if forn.id is null then raise exception 'O freteiro não tem fornecedor ligado (aprove o cadastro de novo).'; end if;
  perform frete_fornecedor_fechamento(r.empresa_id, forn.id);
  v_cat := fin_categoria(r.empresa_id, 'fretes');
  v_user := coalesce(auth.uid(), (select user_id from usuarios_empresas where empresa_id = r.empresa_id order by created_at limit 1));
  ref := 'Fretes ' || to_char(r.periodo_ini, 'DD/MM') || ' a ' || to_char(r.periodo_fim, 'DD/MM/YYYY');
  select id into v_fech from fin_fechamentos where fornecedor_id = forn.id and empresa_id = r.empresa_id and status = 'em_conferencia' limit 1;
  if v_fech is null then
    insert into fin_fechamentos (empresa_id, fornecedor_id, referencia, arquivo_nome, valor_cobrado, observacoes)
    values (r.empresa_id, forn.id, ref, 'Relatório enviado pelo App do Freteiro', r.total_informado, 'Conferido pelo sistema e pela Logística.')
    returning id into v_fech;
  else
    update fin_fechamentos set valor_cobrado = coalesce(valor_cobrado, 0) + r.total_informado, updated_at = now() where id = v_fech;
  end if;
  select coalesce(max(ordem), 0) into v_ord from fin_fechamento_linhas where fechamento_id = v_fech;
  for l in select q.*, frete_lanc_total(q) as informado from frete_lancamentos q where q.relatorio_id = r.id order by q.data, q.created_at loop
    v_ord := v_ord + 1; v_pagar := null; v_inf := case when l.origem_lanc = 'sistema' then 0 else l.informado end;
    select p.id, p.numero_pedido into ped from separacoes_pedidos p where p.id = coalesce((select x.pedido_id from frete_anuncios x where x.id = l.anuncio_id), l.pedido_id);
    v_desc := 'Frete ' || to_char(l.data, 'DD/MM') || ' · ' || coalesce(nullif(l.origem, '') || ' → ', '') || l.destino || coalesce(' · Pedido ' || ped.numero_pedido, '') || coalesce(' · Avulso: ' || (select av.motivo from frete_avulsos av where av.id = l.avulso_id), '');
    if l.situacao in ('ok','aceito','corrigido') and coalesce(l.valor_final, 0) > 0 then
      insert into fin_pagar (empresa_id, origem, origem_id, grupo, fornecedor_id, fornecedor_nome, documento, descricao, emissao, competencia, vencimento,
                             valor, parcela, parcelas, categoria_id, forma, observacoes, criado_por)
      values (r.empresa_id, 'frete', l.id, gen_random_uuid(), forn.id, coalesce(nullif(forn.nome_fantasia, ''), forn.nome_razao_social), 'FT-' || to_char(l.data, 'DDMM'),
              v_desc, current_date, l.data, r.periodo_fim + 7, l.valor_final, 1, 1, v_cat, 'pix',
              case when l.situacao = 'ok' then 'Conferido pelo sistema.' else 'Divergência resolvida pela Logística: ' || coalesce(l.decisao_motivo, '') || coalesce(' (' || l.decisao_por || ')', '') end,
              v_user)
      returning id into v_pagar;
      update frete_lancamentos set pagar_id = v_pagar where id = l.id;
      if ped.id is not null and v_user is not null then
        insert into fin_custos_evento (empresa_id, pedido_id, categoria, descricao, valor, pagar_id, criado_por)
        values (r.empresa_id, ped.id, 'frete', v_desc || ' · ' || f.nome, l.valor_final, v_pagar, v_user);
      end if;
    end if;
    insert into fin_fechamento_linhas (empresa_id, fechamento_id, ordem, data, documento, descricao, valor, titulo_id, situacao, valor_anterior, motivo)
    values (r.empresa_id, v_fech, v_ord, l.data, 'FT-' || to_char(l.data, 'DDMM'),
            v_desc || case when l.origem_lanc = 'sistema' then ' (não lançado pelo freteiro)' else '' end,
            coalesce(case when v_pagar is not null then l.valor_final else v_inf end, 0), v_pagar,
            case when v_pagar is null then 'ignorada' when l.situacao = 'ok' or v_inf = l.valor_final then 'conferida' else 'ajustada' end,
            case when v_pagar is not null and l.situacao <> 'ok' and v_inf <> l.valor_final then v_inf end,
            case when l.situacao = 'ok' then null
                 else 'Divergência (' || case l.divergencia when 'valor' then 'valor diferente do combinado' when 'sem_frete' then 'frete não encontrado no sistema' else 'frete não lançado pelo freteiro' end
                      || '). Freteiro: ' || coalesce(l.explicacao, 'sem explicação') || ' · Logística ' ||
                      case l.situacao when 'aceito' then 'aceitou' when 'corrigido' then 'corrigiu para R$ ' || to_char(l.valor_final, 'FM999999990.00') else 'recusou' end ||
                      ': ' || coalesce(l.decisao_motivo, '') || coalesce(' (' || l.decisao_por || ')', '') end);
  end loop;
  update frete_relatorios set status = 'no_financeiro', fechamento_id = v_fech, no_financeiro_em = now() where id = r.id;
end $$;
revoke all on function public.frete_relatorio_finalizar(uuid) from public, anon, authenticated;

-- Financeiro › Fechamentos de parceiros: frete avulso aparece com o motivo
create or replace function public.fin_parceiro_movimentos(p_empresa uuid,p_fornecedor uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare hoje date:=(now() at time zone 'America/Sao_Paulo')::date; aguardando jsonb; pagos jsonb;
begin
  if auth.uid() is null or not coalesce(eh_membro_empresa(p_empresa),false) or not coalesce(seguranca_2fa_ok(),false)
     or not coalesce(operacao_pode(p_empresa,'financeiro.fluxo.visualizar'),false) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  with fret as (select id from frete_freteiros where empresa_id=p_empresa and fornecedor_id=p_fornecedor),
  itens as (
    -- 1) fretes do sistema (anúncio aceito pelo freteiro deste fornecedor)
    select a.data,a.hora,jsonb_build_object('tipo','frete','data',a.data,'hora',to_char(a.hora,'HH24:MI'),
      'pedido',p.numero_pedido,'cliente',p.cliente_nome,'cliente_foto',(select c.catalogo_logo_url from clientes_empresas c where c.id=p.cliente_id),
      'direcao',a.direcao,'caminhao',coalesce(nullif(l.caminhao,''),(select string_agg(trim(concat_ws(' · ',coalesce(nullif(k.modelo,''),k.codigo),nullif(k.placa,''))),', ') from caminhoes k where k.freteiro_id=a.freteiro_id)),'divergencia',case when l.situacao='divergente' then l.divergencia end,'local',coalesce(nullif(p.local_nome,''),a.destino),
      'descricao',case a.direcao when 'entrega' then 'Frete de entrega' when 'coleta' then 'Frete de coleta' else 'Frete' end,
      'valor_sistema',a.valor,'valor_cobrado',case when l.id is not null then frete_lanc_total(l) end,
      'situacao',case
        when l.id is null and a.data>hoje then 'agendado'
        when l.id is null then 'aguardando_envio'
        when l.relatorio_id is null then 'lancado_sem_envio'
        when l.situacao='divergente' then 'divergencia'
        else 'aguardando_fechamento' end) j
    from frete_anuncios a join fret on fret.id=a.freteiro_id
    left join separacoes_pedidos p on p.id=a.pedido_id
    left join lateral (select * from frete_lancamentos x where x.anuncio_id=a.id order by x.created_at desc limit 1) l on true
    where a.empresa_id=p_empresa and a.status='aceito' and (l.id is null or l.pagar_id is null)
    union all
    -- 2) fretes lançados pelo freteiro sem anúncio (avulso cadastrado pela Logística, ou que não existe no sistema)
    select l.data,null,jsonb_build_object('tipo','frete','data',l.data,'pedido',(select p2.numero_pedido from separacoes_pedidos p2 where p2.id=l.pedido_id),
      'cliente',(select p2.cliente_nome from separacoes_pedidos p2 where p2.id=l.pedido_id),
      'cliente_foto',(select c.catalogo_logo_url from separacoes_pedidos p2 join clientes_empresas c on c.id=p2.cliente_id where p2.id=l.pedido_id),
      'direcao',l.direcao,'local',l.destino,
      'avulso',(select av.motivo from frete_avulsos av where av.id=l.avulso_id),
      'descricao','Frete lançado pelo freteiro (não está no sistema)','fora_sistema',l.avulso_id is null,'caminhao',nullif(l.caminhao,''),'divergencia',case when l.situacao='divergente' then coalesce(l.divergencia,'sem_frete') end,'valor_sistema',(select av.valor from frete_avulsos av where av.id=l.avulso_id),'valor_cobrado',frete_lanc_total(l),
      'situacao',case when l.relatorio_id is null then 'lancado_sem_envio' when l.situacao='divergente' then 'divergencia' else 'aguardando_fechamento' end)
    from frete_lancamentos l join fret on fret.id=l.freteiro_id
    where l.empresa_id=p_empresa and l.anuncio_id is null and l.pagar_id is null and coalesce(l.situacao,'')<>'recusado'
    union all
    -- 2b) frete avulso cadastrado pela Logística e ainda não lançado pelo freteiro
    select v.data,null,jsonb_build_object('tipo','frete','data',v.data,'pedido',null,'cliente',null,'local',v.destino,'origem',v.origem,
      'avulso',v.motivo,'valor_sistema',v.valor,'valor_cobrado',null,'caminhao',(select trim(concat_ws(' · ',coalesce(nullif(k.modelo,''),k.codigo),nullif(k.placa,''))) from caminhoes k where k.freteiro_id=v.freteiro_id limit 1),
      'situacao',case when v.data>hoje then 'agendado' else 'aguardando_envio' end)
    from frete_avulsos v join fret on fret.id=v.freteiro_id
    where v.empresa_id=p_empresa and v.cancelado_em is null and not exists (select 1 from frete_lancamentos q where q.avulso_id=v.id)
    union all
    -- 3) caminhão da transportadora escalado (ainda sem cobrança)
    select min(e.data),min(e.hora),jsonb_build_object('tipo','transportadora','data',min(e.data),'hora',to_char(min(e.hora),'HH24:MI'),
      'pedido',p.numero_pedido,'cliente',p.cliente_nome,'cliente_foto',(select c.catalogo_logo_url from clientes_empresas c where c.id=p.cliente_id),
      'direcao',frete_direcao(e.tipo),'caminhao',string_agg(distinct trim(concat_ws(' · ',k.codigo,nullif(k.placa,''))),', '),'local',p.local_nome,
      'descricao',case frete_direcao(e.tipo) when 'entrega' then 'Entrega' when 'coleta' then 'Coleta' else 'Frete' end||' · '||string_agg(distinct k.codigo,', '),
      'valor_sistema',null,'valor_cobrado',null,'situacao',case when min(e.data)>hoje then 'agendado' else 'aguardando_cobranca' end)
    from operacao_etapas e join operacao_etapa_caminhoes ec on ec.etapa_id=e.id
    join caminhoes k on k.id=ec.caminhao_id and k.fornecedor_id=p_fornecedor and k.freteiro_id is null
    join separacoes_pedidos p on p.id=e.pedido_id and coalesce(p.status_comercial,'')<>'cancelado'
    where e.empresa_id=p_empresa and e.data>=hoje-90 and frete_direcao(e.tipo) is not null
    group by e.pedido_id,frete_direcao(e.tipo),p.numero_pedido,p.cliente_nome,p.local_nome,p.cliente_id
    union all
    -- 4) contas a pagar ainda não pagas deste parceiro
    select fp.vencimento,null,jsonb_build_object('tipo','conta','data',coalesce(fp.competencia,fp.emissao,fp.vencimento),'documento',fp.documento,
      'descricao',coalesce(nullif(fp.descricao,''),fp.origem),'valor_sistema',null,'valor_cobrado',fp.valor,'vencimento',fp.vencimento,
      'aberto',coalesce(fp.aberto,fp.valor),'situacao',case when fp.aguardando_fechamento then 'conta_fechamento' else 'conta_aberta' end)
    from fin_pagar fp where fp.empresa_id=p_empresa and fp.fornecedor_id=p_fornecedor and fp.status<>'pago' and fp.cancelado_em is null
  )
  select coalesce(jsonb_agg(j order by data,hora nulls first),'[]'::jsonb) into aguardando from itens;

  select coalesce(jsonb_agg(jsonb_build_object('documento',fp.documento,'descricao',coalesce(nullif(fp.descricao,''),fp.origem),
      'origem',fp.origem,'vencimento',fp.vencimento,'valor',fp.valor,'pago',fp.pago,
      'pago_em',(select max(b.data) from fin_baixas b where b.pagar_id=fp.id and b.estornado_em is null),
      'forma',(select b.forma from fin_baixas b where b.pagar_id=fp.id and b.estornado_em is null order by b.data desc limit 1))
    order by (select max(b.data) from fin_baixas b where b.pagar_id=fp.id and b.estornado_em is null) desc nulls last),'[]'::jsonb)
    into pagos from fin_pagar fp where fp.empresa_id=p_empresa and fp.fornecedor_id=p_fornecedor and fp.status='pago' and fp.cancelado_em is null;
  return jsonb_build_object('aguardando',aguardando,'pagos',pagos);
end $$;
revoke all on function public.fin_parceiro_movimentos(uuid,uuid) from public,anon;
grant execute on function public.fin_parceiro_movimentos(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
