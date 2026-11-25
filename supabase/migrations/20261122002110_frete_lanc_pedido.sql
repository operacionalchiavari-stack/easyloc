-- App do Freteiro (22/11/2026, pedido do usuário): o freteiro não digita mais endereço. Ele escolhe um dos fretes da semana
-- (pedido reservado com entrega ou coleta dentro do período aberto do relatório) e o sistema preenche data, saída e chegada:
-- entrega = Galpão → local do evento; coleta = local do evento → Galpão. Na conferência, o lançamento é casado pelo pedido
-- e pela direção com o frete anunciado que ele fez.
alter table public.frete_lancamentos
  add column if not exists pedido_id uuid references public.separacoes_pedidos(id) on delete set null,
  add column if not exists direcao text;
do $$ begin
  alter table public.frete_lancamentos add constraint frete_lanc_direcao_ck check (direcao is null or direcao in ('entrega','coleta'));
exception when duplicate_object then null; end $$;

-- fretes possíveis no período (uma linha por pedido + direção)
create or replace function public.frete_lanc_opcoes(p_empresa uuid, p_ini date, p_fim date) returns table (
  pedido_id uuid, numero text, cliente text, local_nome text, endereco text, lat numeric, lng numeric, direcao text, data date)
language sql stable security definer set search_path = public as $$
  select p.id, p.numero_pedido, p.cliente_nome, coalesce(nullif(p.local_nome, ''), le.nome_razao), le.endereco, le.latitude, le.longitude, x.direcao, x.data
    from separacoes_pedidos p
    left join locais_empresas le on le.id = p.local_id
    cross join lateral (values ('entrega', p.data_entrega), ('coleta', case when p.pedido_origem_id is null then p.data_coleta end)) x(direcao, data)
   where p.empresa_id = p_empresa and p.status_comercial in ('aprovado', 'finalizado', 'enviado')
     and x.data between p_ini and p_fim
   order by x.data, p.numero_pedido;
$$;
revoke all on function public.frete_lanc_opcoes(uuid, date, date) from public, anon, authenticated;

create or replace function public.frete_lanc_json(l frete_lancamentos) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', l.id, 'data', l.data, 'origem', l.origem, 'destino', l.destino, 'caminhao', l.caminhao, 'veiculo_id', l.veiculo_id, 'origem_lat', l.origem_lat, 'origem_lng', l.origem_lng, 'destino_lat', l.destino_lat, 'destino_lng', l.destino_lng, 'valor', l.valor, 'extras', l.extras,
    'total', frete_lanc_total(l), 'observacao', l.observacao, 'situacao', l.situacao, 'divergencia', l.divergencia,
    'tipo', l.origem_lanc, 'explicacao', l.explicacao, 'explicacao_em', l.explicacao_em, 'decisao_motivo', l.decisao_motivo,
    'valor_final', l.valor_final, 'decidido', l.decisao_em is not null,
    'pedido_id', l.pedido_id, 'direcao', l.direcao,
    'pedido', (select jsonb_build_object('numero', p.numero_pedido, 'cliente', p.cliente_nome) from separacoes_pedidos p where p.id = l.pedido_id))
$$;
revoke all on function public.frete_lanc_json(frete_lancamentos) from public, anon, authenticated;

create or replace function public.frete_lanc_salvar(p_token text, p_id uuid, p_dados jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a date; b date; v numeric; o record;
  ped uuid; dir text; orig text; dest text; olat numeric; olng numeric; dlat numeric; dlng numeric; ende text;
begin
  if f.status <> 'aprovado' then raise exception 'Seu cadastro ainda não foi aprovado.'; end if;
  if p_id is not null and not exists (select 1 from frete_lancamentos where id = p_id and freteiro_id = f.id and situacao = 'rascunho') then
    raise exception 'Este frete já foi enviado e não pode mais ser alterado.';
  end if;
  select p.ini, p.fim into a, b from frete_periodo_aberto(f) p;
  begin ped := nullif(p_dados->>'pedido_id', '')::uuid; exception when others then ped := null; end;
  dir := p_dados->>'direcao';
  if ped is null or dir not in ('entrega', 'coleta') then raise exception 'Escolha o frete (pedido) que você fez.'; end if;
  select * into o from frete_lanc_opcoes(f.empresa_id, a, b) x where x.pedido_id = ped and x.direcao = dir limit 1;
  if o.pedido_id is null then
    raise exception 'Este pedido não tem % entre % e %. Escolha um frete da lista.', dir, to_char(a, 'DD/MM/YYYY'), to_char(b, 'DD/MM/YYYY');
  end if;
  ende := btrim(concat_ws(' · ', o.local_nome, nullif(o.endereco, '')));
  if dir = 'entrega' then orig := 'Galpão'; dest := ende; dlat := o.lat; dlng := o.lng;
  else orig := ende; dest := 'Galpão'; olat := o.lat; olng := o.lng; end if;
  if length(btrim(coalesce(p_dados->>'caminhao', ''))) < 2 then raise exception 'Informe o caminhão do frete.'; end if;
  begin v := round((p_dados->>'valor')::numeric, 2); exception when others then raise exception 'Informe o valor combinado.'; end;
  if coalesce(v, 0) <= 0 then raise exception 'Informe o valor combinado.'; end if;
  if p_id is null then
    insert into frete_lancamentos (empresa_id, freteiro_id, data, origem, destino, valor, extras, observacao, caminhao, veiculo_id,
      origem_lat, origem_lng, destino_lat, destino_lng, pedido_id, direcao)
    values (f.empresa_id, f.id, o.data, orig, coalesce(nullif(dest, ''), 'Local do evento'), v, '[]'::jsonb, nullif(btrim(coalesce(p_dados->>'observacao', '')), ''),
      btrim(p_dados->>'caminhao'), nullif(p_dados->>'veiculo_id', '')::uuid, olat, olng, dlat, dlng, ped, dir);
  else
    update frete_lancamentos set data = o.data, origem = orig, destino = coalesce(nullif(dest, ''), 'Local do evento'), valor = v, extras = '[]'::jsonb,
           observacao = nullif(btrim(coalesce(p_dados->>'observacao', '')), ''), caminhao = btrim(p_dados->>'caminhao'), veiculo_id = nullif(p_dados->>'veiculo_id', '')::uuid,
           origem_lat = olat, origem_lng = olng, destino_lat = dlat, destino_lng = dlng, pedido_id = ped, direcao = dir, updated_at = now()
     where id = p_id and freteiro_id = f.id and situacao = 'rascunho';
    if not found then raise exception 'Este frete já foi enviado e não pode mais ser alterado.'; end if;
  end if;
  return frete_lanc_app(p_token);
end $$;
grant execute on function public.frete_lanc_salvar(text, uuid, jsonb) to anon, authenticated;

create or replace function public.frete_lanc_app(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a date; b date; cfg jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select p.ini, p.fim into a, b from frete_periodo_aberto(f) p;
  select frete_periodo into cfg from empresa_logistica_regras where empresa_id = f.empresa_id;
  return jsonb_build_object('veiculos', frete_veiculos_lista(f),
    'periodo', jsonb_build_object('ini', a, 'fim', b, 'tipo', coalesce(cfg->>'tipo', 'semanal'), 'pode_enviar', hoje >= b),
    'opcoes', coalesce((select jsonb_agg(jsonb_build_object('pedido_id', o.pedido_id, 'numero', o.numero, 'cliente', o.cliente, 'local', o.local_nome,
        'endereco', o.endereco, 'direcao', o.direcao, 'data', o.data)) from frete_lanc_opcoes(f.empresa_id, a, b) o), '[]'),
    'rascunhos', coalesce((select jsonb_agg(frete_lanc_json(l) order by l.data, l.created_at) from frete_lancamentos l where l.freteiro_id = f.id and l.situacao = 'rascunho'), '[]'),
    'relatorios', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'ini', r.periodo_ini, 'fim', r.periodo_fim, 'status', r.status, 'enviado_em', r.enviado_em,
        'total', r.total_informado,
        'pendentes', (select count(*) from frete_lancamentos l where l.relatorio_id = r.id and l.situacao = 'divergente'),
        'lancamentos', coalesce((select jsonb_agg(frete_lanc_json(l) order by l.data, l.created_at) from frete_lancamentos l where l.relatorio_id = r.id), '[]'))
        order by r.periodo_ini desc) from frete_relatorios r where r.freteiro_id = f.id and r.enviado_em > now() - interval '180 days'), '[]'));
end $$;
grant execute on function public.frete_lanc_app(text) to anon, authenticated;

-- envio: todo frete precisa ter o pedido; a conferência casa primeiro pelo pedido + direção
create or replace function public.frete_lanc_enviar(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a date; b date; rel uuid; l frete_lancamentos; x frete_anuncios; usados uuid[] := '{}';
  hoje date := (now() at time zone 'America/Sao_Paulo')::date; n int;
begin
  if f.status <> 'aprovado' then raise exception 'Seu cadastro ainda não foi aprovado.'; end if;
  select p.ini, p.fim into a, b from frete_periodo_aberto(f) p;
  if hoje < b then raise exception 'O relatório deste período pode ser enviado a partir de %.', to_char(b, 'DD/MM/YYYY'); end if;
  if exists (select 1 from frete_relatorios where freteiro_id = f.id and periodo_ini = a) then raise exception 'O relatório deste período já foi enviado.'; end if;
  select count(*) into n from frete_lancamentos where freteiro_id = f.id and situacao = 'rascunho' and data between a and b and pedido_id is null;
  if n > 0 then raise exception 'Escolha o pedido de % frete(s) antes de enviar (toque em Editar).', n; end if;
  insert into frete_relatorios (empresa_id, freteiro_id, periodo_ini, periodo_fim) values (f.empresa_id, f.id, a, b) returning id into rel;
  update frete_lancamentos set relatorio_id = rel, updated_at = now() where freteiro_id = f.id and situacao = 'rascunho' and data between a and b;
  for l in select * from frete_lancamentos where relatorio_id = rel order by data, created_at loop
    -- mesmo pedido e direção (valor igual primeiro)
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
  update frete_relatorios set total_informado = coalesce((select sum(frete_lanc_total(q)) from frete_lancamentos q where q.relatorio_id = rel and q.origem_lanc = 'freteiro'), 0) where id = rel;
  perform frete_relatorio_finalizar(rel);
  return frete_lanc_app(p_token);
end $$;
grant execute on function public.frete_lanc_enviar(text) to anon, authenticated;
notify pgrst, 'reload schema';
