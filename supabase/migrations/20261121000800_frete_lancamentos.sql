-- Fretes dos freteiros autônomos lançados pelo próprio freteiro, às cegas (21/11/2026).
-- Fluxo combinado com o usuário:
--  1. No App do Freteiro ("Meus fretes") o freteiro lança cada frete que fez (data, trajeto, valor combinado, extras)
--     SEM ver nada do sistema. Só pode lançar datas do período aberto (parâmetro: semanal, quinzenal ou mensal).
--  2. Ao enviar o relatório do período, ele trava e o sistema confere: cada lançamento procura o frete real do
--     freteiro na mesma data (frete_anuncios aceito por ele e com check-out). Valor igual = ok; valor diferente ou
--     frete inexistente = divergência; frete real que ele não lançou = divergência "não lançado".
--  3. O freteiro só explica as divergências (texto / conversa com a Luísa). A Logística resolve no Painel Logístico:
--     aceitar, corrigir o valor ou recusar, sempre com motivo.
--  4. Sem divergência pendente, o relatório vai para o Financeiro: uma conta por frete no Contas a Pagar (aguardando
--     fechamento) e um fechamento de parceiro já conferido, com o que divergiu e como foi resolvido.
-- A antiga Conciliação de Fretes (frete_viagens / frete_fechar) deixa de ser usada pelas telas.

-- ---------------------------------------------------------------- parâmetro do período
alter table public.empresa_logistica_regras add column if not exists frete_periodo jsonb not null default '{"tipo":"semanal","dia":5}'::jsonb;

alter table public.fornecedores drop constraint if exists fornecedores_fechamento_periodo_check;
alter table public.fornecedores add constraint fornecedores_fechamento_periodo_check check (fechamento_periodo in ('mensal','semanal','quinzenal'));

-- período (ini, fim) que contém a data, pela regra da empresa
create or replace function public.frete_periodo(p_empresa uuid, p_data date) returns table(ini date, fim date)
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb; tipo text; dia int; ultimo int; f date;
begin
  select frete_periodo into cfg from empresa_logistica_regras where empresa_id = p_empresa;
  tipo := coalesce(cfg->>'tipo', 'semanal'); dia := coalesce(nullif(cfg->>'dia', '')::int, 5);
  if tipo = 'quinzenal' then
    if extract(day from p_data) <= 15 then ini := date_trunc('month', p_data)::date; fim := ini + 14;
    else ini := date_trunc('month', p_data)::date + 15; fim := (date_trunc('month', p_data) + interval '1 month - 1 day')::date; end if;
  elsif tipo = 'mensal' then
    dia := least(greatest(dia, 1), 31);
    ultimo := extract(day from (date_trunc('month', p_data) + interval '1 month - 1 day'))::int;
    f := date_trunc('month', p_data)::date + (least(dia, ultimo) - 1);
    if p_data > f then
      ultimo := extract(day from (date_trunc('month', p_data) + interval '2 month - 1 day'))::int;
      f := (date_trunc('month', p_data) + interval '1 month')::date + (least(dia, ultimo) - 1);
    end if;
    fim := f;
    ultimo := extract(day from (date_trunc('month', f) - interval '1 day'))::int;
    ini := ((date_trunc('month', f) - interval '1 month')::date + (least(dia, ultimo) - 1)) + 1;
  else
    dia := least(greatest(dia, 1), 7);
    fim := p_data + ((dia - extract(isodow from p_data)::int + 7) % 7);
    ini := fim - 6;
  end if;
  return next;
end $$;
revoke all on function public.frete_periodo(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------- tabelas
create table if not exists public.frete_relatorios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  freteiro_id uuid not null references public.frete_freteiros(id) on delete cascade,
  periodo_ini date not null,
  periodo_fim date not null,
  status text not null default 'enviado' check (status in ('enviado','no_financeiro')),
  enviado_em timestamptz not null default now(),
  total_informado numeric(15,2) not null default 0,
  fechamento_id uuid references public.fin_fechamentos(id) on delete set null,
  no_financeiro_em timestamptz,
  unique (freteiro_id, periodo_ini)
);
create table if not exists public.frete_lancamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  freteiro_id uuid not null references public.frete_freteiros(id) on delete cascade,
  relatorio_id uuid references public.frete_relatorios(id) on delete cascade,
  origem_lanc text not null default 'freteiro' check (origem_lanc in ('freteiro','sistema')), -- sistema = frete real que ele não lançou
  data date not null,
  origem text not null default '',
  destino text not null default '',
  valor numeric(15,2) not null default 0,       -- valor do frete informado pelo freteiro
  extras jsonb not null default '[]'::jsonb,     -- [{motivo, valor}]
  observacao text,
  anuncio_id uuid references public.frete_anuncios(id) on delete set null,
  valor_sistema numeric(15,2),
  situacao text not null default 'rascunho' check (situacao in ('rascunho','ok','divergente','aceito','corrigido','recusado')),
  divergencia text check (divergencia in ('valor','sem_frete','nao_lancado')),
  explicacao text,
  explicacao_conversa jsonb,
  explicacao_em timestamptz,
  valor_final numeric(15,2),
  decisao_motivo text,
  decisao_por text,
  decisao_em timestamptz,
  pagar_id uuid references public.fin_pagar(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists frete_lancamentos_freteiro_idx on public.frete_lancamentos (freteiro_id, data);
create index if not exists frete_lancamentos_div_idx on public.frete_lancamentos (empresa_id, situacao);
alter table public.frete_relatorios enable row level security;
alter table public.frete_lancamentos enable row level security;
revoke all on public.frete_relatorios, public.frete_lancamentos from anon, authenticated;

-- total cobrado num lançamento (valor + extras)
create or replace function public.frete_lanc_total(l frete_lancamentos) returns numeric language sql immutable as $$
  select round(coalesce(l.valor, 0) + coalesce((select sum(coalesce((e->>'valor')::numeric, 0)) from jsonb_array_elements(l.extras) e), 0), 2)
$$;

-- ---------------------------------------------------------------- freteiro aprovado = parceiro com fechamento
create or replace function public.frete_fornecedor_fechamento(p_empresa uuid, p_fornecedor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; v_tipo text; v_dia int;
begin
  if p_fornecedor is null then return; end if;
  select frete_periodo into cfg from empresa_logistica_regras where empresa_id = p_empresa;
  v_tipo := coalesce(cfg->>'tipo', 'semanal'); v_dia := coalesce(nullif(cfg->>'dia', '')::int, 5);
  update fornecedores set fechamento_mensal = true, fechamento_periodo = v_tipo,
         fechamento_dia_semana = case when v_tipo = 'semanal' then least(greatest(v_dia,1),7) end,
         fechamento_dia = case when v_tipo = 'mensal' then least(greatest(v_dia,1),31) when v_tipo = 'quinzenal' then 15 end
   where id = p_fornecedor and empresa_id = p_empresa;
end $$;
revoke all on function public.frete_fornecedor_fechamento(uuid, uuid) from public, anon, authenticated;

create or replace function public.frete_freteiro_fornecedor_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fornecedor_id is not null and new.fornecedor_id is distinct from old.fornecedor_id then
    perform frete_fornecedor_fechamento(new.empresa_id, new.fornecedor_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_frete_freteiro_fornecedor on public.frete_freteiros;
create trigger trg_frete_freteiro_fornecedor after update of fornecedor_id on public.frete_freteiros for each row execute function public.frete_freteiro_fornecedor_trg();
do $$ declare r record; begin
  for r in select empresa_id, fornecedor_id from frete_freteiros where fornecedor_id is not null loop perform frete_fornecedor_fechamento(r.empresa_id, r.fornecedor_id); end loop;
end $$;

-- ---------------------------------------------------------------- período aberto do freteiro
-- O período anterior continua aberto enquanto não for enviado e tiver fretes dele (ou lançamentos em rascunho);
-- senão vale o período de hoje. Só dá para lançar datas dentro do período aberto.
create or replace function public.frete_periodo_aberto(f frete_freteiros) returns table(ini date, fim date)
language plpgsql stable security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; a date; b date; pa date; pb date;
begin
  select p.ini, p.fim into a, b from frete_periodo(f.empresa_id, hoje) p;
  select p.ini, p.fim into pa, pb from frete_periodo(f.empresa_id, a - 1) p;
  if not exists (select 1 from frete_relatorios r where r.freteiro_id = f.id and r.periodo_ini = pa)
     and (exists (select 1 from frete_lancamentos l where l.freteiro_id = f.id and l.situacao = 'rascunho' and l.data between pa and pb)
          or exists (select 1 from frete_anuncios x where x.freteiro_id = f.id and x.status = 'aceito' and x.checkout_em is not null and x.data between pa and pb)) then
    ini := pa; fim := pb;
  elsif exists (select 1 from frete_relatorios r where r.freteiro_id = f.id and r.periodo_ini = a) then
    -- período de hoje já enviado: abre o seguinte
    select p.ini, p.fim into ini, fim from frete_periodo(f.empresa_id, b + 1) p;
  else
    ini := a; fim := b;
  end if;
  return next;
end $$;
revoke all on function public.frete_periodo_aberto(frete_freteiros) from public, anon, authenticated;

create or replace function public.frete_lanc_json(l frete_lancamentos) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', l.id, 'data', l.data, 'origem', l.origem, 'destino', l.destino, 'valor', l.valor, 'extras', l.extras,
    'total', frete_lanc_total(l), 'observacao', l.observacao, 'situacao', l.situacao, 'divergencia', l.divergencia,
    'tipo', l.origem_lanc, 'explicacao', l.explicacao, 'explicacao_em', l.explicacao_em, 'decisao_motivo', l.decisao_motivo,
    'valor_final', l.valor_final, 'decidido', l.decisao_em is not null)
$$;
revoke all on function public.frete_lanc_json(frete_lancamentos) from public, anon, authenticated;

-- ---------------------------------------------------------------- App do Freteiro
create or replace function public.frete_lanc_app(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a date; b date; cfg jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select p.ini, p.fim into a, b from frete_periodo_aberto(f) p;
  select frete_periodo into cfg from empresa_logistica_regras where empresa_id = f.empresa_id;
  return jsonb_build_object(
    'periodo', jsonb_build_object('ini', a, 'fim', b, 'tipo', coalesce(cfg->>'tipo', 'semanal'), 'pode_enviar', hoje >= b),
    'rascunhos', coalesce((select jsonb_agg(frete_lanc_json(l) order by l.data, l.created_at) from frete_lancamentos l where l.freteiro_id = f.id and l.situacao = 'rascunho'), '[]'),
    'relatorios', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'ini', r.periodo_ini, 'fim', r.periodo_fim, 'status', r.status, 'enviado_em', r.enviado_em,
        'total', r.total_informado,
        'pendentes', (select count(*) from frete_lancamentos l where l.relatorio_id = r.id and l.situacao = 'divergente'),
        'lancamentos', coalesce((select jsonb_agg(frete_lanc_json(l) order by l.data, l.created_at) from frete_lancamentos l where l.relatorio_id = r.id), '[]'))
        order by r.periodo_ini desc) from frete_relatorios r where r.freteiro_id = f.id and r.enviado_em > now() - interval '180 days'), '[]'));
end $$;
grant execute on function public.frete_lanc_app(text) to anon, authenticated;

create or replace function public.frete_lanc_salvar(p_token text, p_id uuid, p_dados jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a date; b date; d date; v numeric; ex jsonb := '[]'::jsonb; e jsonb;
begin
  if f.status <> 'aprovado' then raise exception 'Seu cadastro ainda não foi aprovado.'; end if;
  if p_id is not null and not exists (select 1 from frete_lancamentos where id = p_id and freteiro_id = f.id and situacao = 'rascunho') then
    raise exception 'Este frete já foi enviado e não pode mais ser alterado.';
  end if;
  select p.ini, p.fim into a, b from frete_periodo_aberto(f) p;
  begin d := (p_dados->>'data')::date; exception when others then raise exception 'Informe a data do frete.'; end;
  if d is null then raise exception 'Informe a data do frete.'; end if;
  if d < a or d > b then raise exception 'Data fora do período: lance só fretes de % a %.', to_char(a, 'DD/MM/YYYY'), to_char(b, 'DD/MM/YYYY'); end if;
  if length(btrim(coalesce(p_dados->>'destino', ''))) < 2 then raise exception 'Informe para onde foi o frete.'; end if;
  begin v := round((p_dados->>'valor')::numeric, 2); exception when others then raise exception 'Informe o valor combinado.'; end;
  if coalesce(v, 0) <= 0 then raise exception 'Informe o valor combinado.'; end if;
  for e in select value from jsonb_array_elements(coalesce(p_dados->'extras', '[]'::jsonb)) loop
    if coalesce((e->>'valor')::numeric, 0) > 0 then
      if length(btrim(coalesce(e->>'motivo', ''))) < 2 then raise exception 'Diga o motivo de cada extra.'; end if;
      ex := ex || jsonb_build_object('motivo', btrim(e->>'motivo'), 'valor', round((e->>'valor')::numeric, 2));
    end if;
  end loop;
  if p_id is null then
    insert into frete_lancamentos (empresa_id, freteiro_id, data, origem, destino, valor, extras, observacao)
    values (f.empresa_id, f.id, d, btrim(coalesce(p_dados->>'origem', '')), btrim(p_dados->>'destino'), v, ex, nullif(btrim(coalesce(p_dados->>'observacao', '')), ''));
  else
    update frete_lancamentos set data = d, origem = btrim(coalesce(p_dados->>'origem', '')), destino = btrim(p_dados->>'destino'), valor = v, extras = ex,
           observacao = nullif(btrim(coalesce(p_dados->>'observacao', '')), ''), updated_at = now()
     where id = p_id and freteiro_id = f.id and situacao = 'rascunho';
    if not found then raise exception 'Este frete já foi enviado e não pode mais ser alterado.'; end if;
  end if;
  return frete_lanc_app(p_token);
end $$;
grant execute on function public.frete_lanc_salvar(text, uuid, jsonb) to anon, authenticated;

create or replace function public.frete_lanc_excluir(p_token text, p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s);
begin
  delete from frete_lancamentos where id = p_id and freteiro_id = f.id and situacao = 'rascunho';
  if not found then raise exception 'Este frete já foi enviado e não pode mais ser apagado.'; end if;
  return frete_lanc_app(p_token);
end $$;
grant execute on function public.frete_lanc_excluir(text, uuid) to anon, authenticated;

-- envia o relatório do período aberto: trava e confere
create or replace function public.frete_lanc_enviar(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s); a date; b date; rel uuid; l frete_lancamentos; x frete_anuncios; usados uuid[] := '{}';
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if f.status <> 'aprovado' then raise exception 'Seu cadastro ainda não foi aprovado.'; end if;
  select p.ini, p.fim into a, b from frete_periodo_aberto(f) p;
  if hoje < b then raise exception 'O relatório deste período pode ser enviado a partir de %.', to_char(b, 'DD/MM/YYYY'); end if;
  if exists (select 1 from frete_relatorios where freteiro_id = f.id and periodo_ini = a) then raise exception 'O relatório deste período já foi enviado.'; end if;
  insert into frete_relatorios (empresa_id, freteiro_id, periodo_ini, periodo_fim) values (f.empresa_id, f.id, a, b) returning id into rel;
  update frete_lancamentos set relatorio_id = rel, updated_at = now() where freteiro_id = f.id and situacao = 'rascunho' and data between a and b;
  -- conferência: primeiro os de valor igual, depois qualquer frete da mesma data
  for l in select * from frete_lancamentos where relatorio_id = rel order by data, created_at loop
    select * into x from frete_anuncios where freteiro_id = f.id and status = 'aceito' and checkout_em is not null and data = l.data
       and id <> all(usados) and round(valor, 2) = frete_lanc_total(l) limit 1;
    if x.id is null then
      select * into x from frete_anuncios where freteiro_id = f.id and status = 'aceito' and checkout_em is not null and data = l.data
         and id <> all(usados) order by abs(valor - frete_lanc_total(l)) limit 1;
    end if;
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
  -- frete real do período que ele não lançou
  insert into frete_lancamentos (empresa_id, freteiro_id, relatorio_id, origem_lanc, data, origem, destino, valor, anuncio_id, valor_sistema, situacao, divergencia)
  select f.empresa_id, f.id, rel, 'sistema', z.data, z.ponto_encontro, z.destino, 0, z.id, z.valor, 'divergente', 'nao_lancado'
    from frete_anuncios z where z.freteiro_id = f.id and z.status = 'aceito' and z.checkout_em is not null and z.data between a and b and z.id <> all(usados);
  update frete_relatorios set total_informado = coalesce((select sum(frete_lanc_total(q)) from frete_lancamentos q where q.relatorio_id = rel and q.origem_lanc = 'freteiro'), 0) where id = rel;
  perform frete_relatorio_finalizar(rel);
  return frete_lanc_app(p_token);
end $$;
grant execute on function public.frete_lanc_enviar(text) to anon, authenticated;

create or replace function public.frete_lanc_explicar(p_token text, p_id uuid, p_texto text, p_conversa jsonb default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'freteiro'); f frete_freteiros := frete_freteiro(s);
begin
  if length(btrim(coalesce(p_texto, ''))) < 3 then raise exception 'Escreva a explicação.'; end if;
  update frete_lancamentos set explicacao = left(btrim(p_texto), 4000), explicacao_conversa = p_conversa, explicacao_em = now(), updated_at = now()
   where id = p_id and freteiro_id = f.id and situacao = 'divergente';
  if not found then raise exception 'Esta divergência já foi resolvida pela logística.'; end if;
  return frete_lanc_app(p_token);
end $$;
grant execute on function public.frete_lanc_explicar(text, uuid, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- relatório resolvido -> Financeiro
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
    select p.id, p.numero_pedido into ped from frete_anuncios x join separacoes_pedidos p on p.id = x.pedido_id where x.id = l.anuncio_id;
    v_desc := 'Frete ' || to_char(l.data, 'DD/MM') || ' · ' || coalesce(nullif(l.origem, '') || ' → ', '') || l.destino || coalesce(' · Pedido ' || ped.numero_pedido, '');
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

-- ---------------------------------------------------------------- Painel Logístico: divergências
create or replace function public.frete_div_lista(p_empresa uuid) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.visualizar') then raise exception 'Sem permissão.'; end if;
  return jsonb_build_object(
    'abertas', coalesce((select jsonb_agg(z order by z->>'data') from (
      select frete_lanc_json(l) || jsonb_build_object('freteiro', f.nome, 'telefone', f.telefone, 'veiculo', f.veiculo_modelo,
        'periodo', to_char(r.periodo_ini, 'DD/MM') || ' a ' || to_char(r.periodo_fim, 'DD/MM'), 'enviado_em', r.enviado_em,
        'valor_sistema', l.valor_sistema, 'conversa', l.explicacao_conversa,
        'sistema', case when x.id is not null then jsonb_build_object('data', x.data, 'hora', x.hora, 'origem', x.ponto_encontro, 'destino', x.destino, 'km', x.km,
             'direcao', x.direcao, 'pedido', p.numero_pedido, 'cliente', p.cliente_nome, 'checkin_em', x.checkin_em, 'checkout_em', x.checkout_em) end) z
        from frete_lancamentos l join frete_freteiros f on f.id = l.freteiro_id join frete_relatorios r on r.id = l.relatorio_id
        left join frete_anuncios x on x.id = l.anuncio_id left join separacoes_pedidos p on p.id = x.pedido_id
       where l.empresa_id = p_empresa and l.situacao = 'divergente') q), '[]'),
    'resolvidas', coalesce((select jsonb_agg(frete_lanc_json(l) || jsonb_build_object('freteiro', f.nome, 'decisao_por', l.decisao_por, 'decisao_em', l.decisao_em, 'valor_sistema', l.valor_sistema)
        order by l.decisao_em desc) from frete_lancamentos l join frete_freteiros f on f.id = l.freteiro_id
       where l.empresa_id = p_empresa and l.decisao_em > now() - interval '30 days'), '[]'));
end $$;
grant execute on function public.frete_div_lista(uuid) to authenticated;

create or replace function public.frete_div_resolver(p_empresa uuid, p_id uuid, p_acao text, p_valor numeric, p_motivo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare l frete_lancamentos; v numeric;
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão.'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escreva o motivo da decisão.'; end if;
  select * into l from frete_lancamentos where id = p_id and empresa_id = p_empresa for update;
  if l.id is null then raise exception 'Divergência não encontrada.'; end if;
  if l.situacao <> 'divergente' then raise exception 'Esta divergência já foi resolvida.'; end if;
  if p_acao = 'aceitar' then
    v := case when l.origem_lanc = 'sistema' then l.valor_sistema else frete_lanc_total(l) end;
    if coalesce(v, 0) <= 0 then raise exception 'Sem valor para aceitar; use corrigir.'; end if;
  elsif p_acao = 'corrigir' then
    v := round(coalesce(p_valor, 0), 2);
    if v <= 0 then raise exception 'Informe o valor correto.'; end if;
  elsif p_acao = 'recusar' then
    v := 0;
  else
    raise exception 'Ação inválida.';
  end if;
  update frete_lancamentos set situacao = case p_acao when 'aceitar' then 'aceito' when 'corrigir' then 'corrigido' else 'recusado' end,
         valor_final = v, decisao_motivo = btrim(p_motivo), decisao_por = logistica_nome_usuario(p_empresa), decisao_em = now(), updated_at = now()
   where id = l.id;
  perform frete_relatorio_finalizar(l.relatorio_id);
  return frete_div_lista(p_empresa);
end $$;
grant execute on function public.frete_div_resolver(uuid, uuid, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------- Parâmetro
create or replace function public.frete_periodo_salvar(p_empresa uuid, p_tipo text, p_dia int) returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not operacao_pode(p_empresa, 'configuracoes.empresa.editar') then raise exception 'Sem permissão.'; end if;
  if p_tipo not in ('semanal','quinzenal','mensal') then raise exception 'Período inválido.'; end if;
  if p_tipo = 'semanal' and (p_dia is null or p_dia not between 1 and 7) then raise exception 'Escolha o dia da semana.'; end if;
  if p_tipo = 'mensal' and (p_dia is null or p_dia not between 1 and 31) then raise exception 'Escolha o dia do mês.'; end if;
  insert into empresa_logistica_regras (empresa_id, frete_periodo) values (p_empresa, jsonb_build_object('tipo', p_tipo, 'dia', coalesce(p_dia, 15)))
  on conflict (empresa_id) do update set frete_periodo = excluded.frete_periodo;
  for r in select fornecedor_id from frete_freteiros where empresa_id = p_empresa and fornecedor_id is not null loop perform frete_fornecedor_fechamento(p_empresa, r.fornecedor_id); end loop;
  return jsonb_build_object('tipo', p_tipo, 'dia', p_dia);
end $$;
grant execute on function public.frete_periodo_salvar(uuid, text, int) to authenticated;

create or replace function public.frete_periodo_ler(p_empresa uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when eh_membro_empresa(p_empresa) then coalesce((select frete_periodo from empresa_logistica_regras where empresa_id = p_empresa), '{"tipo":"semanal","dia":5}'::jsonb) end
$$;
grant execute on function public.frete_periodo_ler(uuid) to authenticated;

notify pgrst, 'reload schema';
