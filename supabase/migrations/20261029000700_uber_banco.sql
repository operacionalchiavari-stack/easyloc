-- Uber no banco (out/2026), como um aplicativo: qualquer motorista se cadastra sozinho no App do Motorista.
-- 1) Parâmetros > Logística: faixas de km (de X a Y km = R$ Z por trecho). Ida e volta = 2 trechos.
-- 2) Painel Logístico: na etapa a logística pede Uber (quantos carros, ponto de encontro, destino, km pelo mapa).
-- 3) App do Motorista: a vaga aparece como disponível; o 1º que aceitar fica com ela (até completar a quantidade).
--    Nome e telefone de quem aceitou aparecem no Painel, junto de Equipe e Caminhões.
-- 4) Check-in e check-out: o motorista lê o QR do responsável da etapa (App do Montador; o código muda a cada minuto).
-- 5) Só depois do check-out a corrida aparece no Controle de Uber; a logística confere e fecha várias corridas do
--    mesmo motorista → uma conta a pagar + um custo por pedido em Resultados (categoria uber).

alter table public.empresa_logistica_regras add column if not exists uber jsonb not null default '{"faixas": []}'::jsonb;

create table if not exists public.uber_motoristas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  telefone text not null,
  senha_hash text not null,
  chave_pix text,
  carro_modelo text,
  carro_placa text,
  carro_cor text,
  status text not null default 'ativo' check (status in ('ativo', 'bloqueado')),
  tentativas int not null default 0,
  bloqueado_ate timestamptz,
  ultimo_acesso timestamptz,
  created_at timestamptz not null default now(),
  unique (empresa_id, telefone)
);

alter table public.app_sessoes add column if not exists motorista_id uuid references public.uber_motoristas(id) on delete cascade;

create table if not exists public.uber_vagas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  etapa_id uuid not null references public.operacao_etapas(id) on delete cascade,
  pedido_id uuid references public.separacoes_pedidos(id) on delete set null,
  quantidade int not null default 1 check (quantidade between 1 and 30),
  ida_volta boolean not null default false,
  ponto_encontro text not null,
  ponto_lat numeric, ponto_lng numeric,
  destino text not null,
  destino_lat numeric, destino_lng numeric,
  km numeric not null default 0 check (km >= 0),
  valor numeric not null default 0,        -- por carro (faixa do trecho × trechos)
  data date not null,
  hora time,
  obs text,
  segredo_qr text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  status text not null default 'aberta' check (status in ('aberta', 'cancelada')),
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists uber_vagas_etapa_idx on public.uber_vagas (etapa_id);
create index if not exists uber_vagas_data_idx on public.uber_vagas (empresa_id, data, status);

create table if not exists public.uber_corridas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  vaga_id uuid not null references public.uber_vagas(id) on delete cascade,
  motorista_id uuid not null references public.uber_motoristas(id) on delete cascade,
  status text not null default 'confirmada' check (status in ('confirmada', 'em_andamento', 'concluida', 'cancelada')),
  valor numeric not null default 0,
  confirmado_em timestamptz not null default now(),
  cancelado_em timestamptz, cancelado_por text,
  checkin_em timestamptz, checkin_lat numeric, checkin_lng numeric,
  checkout_em timestamptz, checkout_lat numeric, checkout_lng numeric,
  valor_final numeric, obs_logistica text, conferido_em timestamptz, conferido_por text,
  fechamento_id uuid references public.logistica_fechamentos(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists uber_corridas_ativa_uk on public.uber_corridas (vaga_id, motorista_id) where status <> 'cancelada';
create index if not exists uber_corridas_motorista_idx on public.uber_corridas (motorista_id, status);

alter table public.logistica_fechamentos drop constraint if exists logistica_fechamentos_motorista_fk;
alter table public.logistica_fechamentos add constraint logistica_fechamentos_motorista_fk foreign key (motorista_id) references public.uber_motoristas(id) on delete set null;

alter table public.uber_motoristas enable row level security;
alter table public.uber_vagas enable row level security;
alter table public.uber_corridas enable row level security;
-- motoristas: sem leitura direta (a senha está na linha); a equipe vê pelas funções (painel, controle)
drop policy if exists uber_motoristas_ler on public.uber_motoristas;
drop policy if exists uber_vagas_ler on public.uber_vagas;
create policy uber_vagas_ler on public.uber_vagas for select to authenticated using (public.operacao_pode(empresa_id, 'logistica.planejamento.visualizar'));
drop policy if exists uber_corridas_ler on public.uber_corridas;
create policy uber_corridas_ler on public.uber_corridas for select to authenticated using (public.operacao_pode(empresa_id, 'logistica.planejamento.visualizar'));
do $$ declare t text; begin
  foreach t in array array['uber_motoristas', 'uber_vagas', 'uber_corridas'] loop
    execute format('drop policy if exists seguranca_2fa on public.%I', t);
    execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- valores
-- faixas: [{"de":0,"ate":10,"valor":30},{"de":10,"ate":20,"valor":45},{"de":20,"ate":null,"valor":70}]
create or replace function public.uber_valor_trecho(p_empresa uuid, p_km numeric) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (f->>'valor')::numeric
      from empresa_logistica_regras r, jsonb_array_elements(coalesce(r.uber->'faixas', '[]')) f
     where r.empresa_id = p_empresa
       and coalesce(p_km, 0) >= coalesce(nullif(f->>'de', '')::numeric, 0)
       and (nullif(f->>'ate', '') is null or coalesce(p_km, 0) <= (f->>'ate')::numeric)
     order by coalesce(nullif(f->>'de', '')::numeric, 0) desc limit 1), 0)
$$;
grant execute on function public.uber_valor_trecho(uuid, numeric) to authenticated;

create or replace function public.uber_faixas_salvar(p_empresa uuid, p_faixas jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare f jsonb; limpas jsonb := '[]'; ant numeric := null;
begin
  if not operacao_pode(p_empresa, 'configuracoes.empresa.editar') then raise exception 'Sem permissão para editar os parâmetros.'; end if;
  if jsonb_typeof(coalesce(p_faixas, '[]')) <> 'array' then raise exception 'Faixas inválidas.'; end if;
  for f in select x from jsonb_array_elements(p_faixas) x order by coalesce(nullif(x->>'de', '')::numeric, 0) loop
    if coalesce(nullif(f->>'valor', '')::numeric, -1) < 0 then raise exception 'Cada faixa precisa de um valor.'; end if;
    if nullif(f->>'ate', '') is not null and (f->>'ate')::numeric <= coalesce(nullif(f->>'de', '')::numeric, 0) then raise exception 'Em cada faixa o "até" precisa ser maior que o "de".'; end if;
    if ant is not null and coalesce(nullif(f->>'de', '')::numeric, 0) < ant then raise exception 'As faixas se sobrepõem.'; end if;
    ant := nullif(f->>'ate', '')::numeric;
    limpas := limpas || jsonb_build_array(jsonb_build_object('de', coalesce(nullif(f->>'de', '')::numeric, 0),
               'ate', nullif(f->>'ate', '')::numeric, 'valor', round((f->>'valor')::numeric, 2)));
  end loop;
  insert into empresa_logistica_regras (empresa_id, uber) values (p_empresa, jsonb_build_object('faixas', limpas))
  on conflict (empresa_id) do update set uber = coalesce(empresa_logistica_regras.uber, '{}') || jsonb_build_object('faixas', limpas), updated_at = now();
  return jsonb_build_object('faixas', limpas);
end $$;
grant execute on function public.uber_faixas_salvar(uuid, jsonb) to authenticated;

-- código de 6 números que muda a cada minuto (mesma ideia do QR do Free)
create or replace function public.uber_codigo_qr(p_vaga uuid, p_janela bigint) returns text language sql stable security definer set search_path = public as $$
  select lpad((((get_byte(h, 0)::bigint << 24) + (get_byte(h, 1) << 16) + (get_byte(h, 2) << 8) + get_byte(h, 3)) % 1000000)::text, 6, '0')
    from (select extensions.hmac(p_vaga::text || ':uber:' || p_janela, segredo_qr, 'sha256') h from uber_vagas where id = p_vaga) x
$$;
revoke all on function public.uber_codigo_qr(uuid, bigint) from public, anon, authenticated;

create or replace function public.uber_vaga_json(v uber_vagas, p_equipe boolean) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', v.id, 'etapa_id', v.etapa_id, 'pedido_id', v.pedido_id, 'quantidade', v.quantidade, 'ida_volta', v.ida_volta,
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
revoke all on function public.uber_vaga_json(uber_vagas, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- Painel Logístico
create or replace function public.uber_painel(p_empresa uuid, p_inicio date, p_fim date) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.visualizar') then raise exception 'Sem permissão.'; end if;
  return jsonb_build_object('faixas', coalesce((select uber->'faixas' from empresa_logistica_regras where empresa_id = p_empresa), '[]'),
    'vagas', coalesce((select jsonb_agg(uber_vaga_json(v, true) order by v.data, v.hora) from uber_vagas v
                 where v.empresa_id = p_empresa and v.status = 'aberta' and v.data between p_inicio and p_fim), '[]'));
end $$;
grant execute on function public.uber_painel(uuid, date, date) to authenticated;

create or replace function public.uber_vaga_salvar(p_empresa uuid, p_dados jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare e operacao_etapas; v uber_vagas; idv uuid := nullif(p_dados->>'id', '')::uuid; q int := coalesce(nullif(p_dados->>'quantidade', '')::int, 1);
  iv boolean := coalesce((p_dados->>'ida_volta')::boolean, false); vkm numeric := round(greatest(coalesce(nullif(p_dados->>'km', '')::numeric, 0), 0), 1);
  conf int; val numeric;
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão para pedir Uber.'; end if;
  select * into e from operacao_etapas where id = (p_dados->>'etapa_id')::uuid and empresa_id = p_empresa;
  if e.id is null then raise exception 'Etapa não encontrada.'; end if;
  if nullif(btrim(coalesce(p_dados->>'ponto_encontro', '')), '') is null then raise exception 'Informe o ponto de encontro.'; end if;
  if nullif(btrim(coalesce(p_dados->>'destino', '')), '') is null then raise exception 'Informe o destino.'; end if;
  if q < 1 or q > 30 then raise exception 'Quantidade de carros inválida.'; end if;
  if vkm <= 0 then raise exception 'Informe os km do trajeto.'; end if;
  val := uber_valor_trecho(p_empresa, vkm) * case when iv then 2 else 1 end;
  if val <= 0 then raise exception 'Cadastre as faixas de km do Uber em Parâmetros > Logística e operação.'; end if;
  if idv is not null then
    select * into v from uber_vagas where id = idv and empresa_id = p_empresa for update;
    if v.id is null then raise exception 'Pedido de Uber não encontrado.'; end if;
    select count(*) into conf from uber_corridas where vaga_id = v.id and status <> 'cancelada';
    if q < conf then raise exception 'Já há % motorista(s) confirmado(s). Cancele uma corrida antes de diminuir.', conf; end if;
    if conf > 0 and (v.km <> vkm or v.ida_volta <> iv) then raise exception 'Há motorista confirmado: não dá para mudar o trajeto. Cancele as corridas primeiro.'; end if;
    update uber_vagas set quantidade = q, ida_volta = iv, ponto_encontro = btrim(p_dados->>'ponto_encontro'), destino = btrim(p_dados->>'destino'),
           ponto_lat = nullif(p_dados->>'ponto_lat', '')::numeric, ponto_lng = nullif(p_dados->>'ponto_lng', '')::numeric,
           destino_lat = nullif(p_dados->>'destino_lat', '')::numeric, destino_lng = nullif(p_dados->>'destino_lng', '')::numeric,
           km = vkm, valor = case when conf > 0 then valor else val end, hora = coalesce(nullif(p_dados->>'hora', '')::time, e.hora),
           obs = nullif(btrim(coalesce(p_dados->>'obs', '')), ''), updated_at = now()
     where id = v.id returning * into v;
  else
    insert into uber_vagas (empresa_id, etapa_id, pedido_id, quantidade, ida_volta, ponto_encontro, ponto_lat, ponto_lng, destino, destino_lat, destino_lng,
                            km, valor, data, hora, obs)
    values (p_empresa, e.id, e.pedido_id, q, iv, btrim(p_dados->>'ponto_encontro'), nullif(p_dados->>'ponto_lat', '')::numeric, nullif(p_dados->>'ponto_lng', '')::numeric,
            btrim(p_dados->>'destino'), nullif(p_dados->>'destino_lat', '')::numeric, nullif(p_dados->>'destino_lng', '')::numeric,
            vkm, val, e.data, coalesce(nullif(p_dados->>'hora', '')::time, e.hora), nullif(btrim(coalesce(p_dados->>'obs', '')), ''))
    returning * into v;
  end if;
  return uber_vaga_json(v, true);
end $$;
grant execute on function public.uber_vaga_salvar(uuid, jsonb) to authenticated;

create or replace function public.uber_vaga_cancelar(p_empresa uuid, p_vaga uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão.'; end if;
  if exists (select 1 from uber_corridas where vaga_id = p_vaga and status in ('em_andamento', 'concluida')) then
    raise exception 'Já há corrida em andamento ou concluída neste pedido de Uber.';
  end if;
  update uber_corridas set status = 'cancelada', cancelado_em = now(), cancelado_por = 'Logística' where vaga_id = p_vaga and status = 'confirmada';
  update uber_vagas set status = 'cancelada', updated_at = now() where id = p_vaga and empresa_id = p_empresa;
end $$;
grant execute on function public.uber_vaga_cancelar(uuid, uuid) to authenticated;

create or replace function public.uber_corrida_cancelar_logistica(p_empresa uuid, p_corrida uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão.'; end if;
  update uber_corridas set status = 'cancelada', cancelado_em = now(), cancelado_por = 'Logística' where id = p_corrida and empresa_id = p_empresa and status = 'confirmada';
  if not found then raise exception 'Só dá para cancelar corrida que ainda não começou.'; end if;
end $$;
grant execute on function public.uber_corrida_cancelar_logistica(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- QR do responsável (App do Montador e equipe logada)
create or replace function public.uber_qr_dados(p_etapa uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare j bigint := floor(extract(epoch from now()) / 60)::bigint;
begin
  return jsonb_build_object('trocaEm', ((j + 1) * 60000 - floor(extract(epoch from now()) * 1000))::bigint,
    'vagas', coalesce((select jsonb_agg(uber_vaga_json(v, true) || jsonb_build_object('codigo', uber_codigo_qr(v.id, j)) order by v.hora)
                from uber_vagas v where v.etapa_id = p_etapa and v.status = 'aberta'), '[]'));
end $$;
revoke all on function public.uber_qr_dados(uuid) from public, anon, authenticated;

create or replace function public.mont_uber_qr(p_token text, p_etapa uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'montador');
begin
  if not mont_pode_ver(s, p_etapa) then raise exception 'Você não tem acesso a esta etapa.'; end if;
  return uber_qr_dados(p_etapa);
end $$;
grant execute on function public.mont_uber_qr(text, uuid) to anon, authenticated;

create or replace function public.uber_adm_qr(p_etapa uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare emp uuid;
begin
  select empresa_id into emp from operacao_etapas where id = p_etapa;
  if emp is null or not operacao_pode(emp, 'logistica.planejamento.visualizar') then raise exception 'Etapa não encontrada.'; end if;
  return uber_qr_dados(p_etapa);
end $$;
grant execute on function public.uber_adm_qr(uuid) to authenticated;

-- ---------------------------------------------------------------- App do Motorista
create or replace function public.uber_nova_sessao(m uber_motoristas) returns jsonb language plpgsql security definer set search_path = public as $$
declare t text := app_novo_token();
begin
  insert into app_sessoes (token_hash, tipo, empresa_id, motorista_id, nome, perfil, expira_em)
  values (app_hash(t), 'motorista', m.empresa_id, m.id, m.nome, 'MOTORISTA', now() + interval '90 days');
  update uber_motoristas set ultimo_acesso = now() where id = m.id;
  return jsonb_build_object('token', t, 'nome', m.nome);
end $$;
revoke all on function public.uber_nova_sessao(uber_motoristas) from public, anon, authenticated;

create or replace function public.uber_cadastrar(p_dados jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare m uber_motoristas; fone text := regexp_replace(coalesce(p_dados->>'telefone', ''), '\D', '', 'g'); emp uuid := gs_empresa_dona();
begin
  if length(btrim(coalesce(p_dados->>'nome', ''))) < 5 or position(' ' in btrim(p_dados->>'nome')) = 0 then raise exception 'Informe o nome completo.'; end if;
  if length(fone) not between 10 and 11 then raise exception 'Informe o celular com DDD.'; end if;
  if length(coalesce(p_dados->>'senha', '')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  if length(btrim(coalesce(p_dados->>'pix', ''))) < 3 then raise exception 'Informe a chave PIX para receber.'; end if;
  if length(btrim(coalesce(p_dados->>'carro_modelo', ''))) < 2 or length(regexp_replace(coalesce(p_dados->>'carro_placa', ''), '[^A-Za-z0-9]', '', 'g')) <> 7 then
    raise exception 'Informe o modelo e a placa do carro.';
  end if;
  if exists (select 1 from uber_motoristas where empresa_id = emp and telefone = fone) then raise exception 'Este celular já tem cadastro. Entre com a sua senha.'; end if;
  insert into uber_motoristas (empresa_id, nome, telefone, senha_hash, chave_pix, carro_modelo, carro_placa, carro_cor)
  values (emp, initcap(lower(btrim(p_dados->>'nome'))), fone, extensions.crypt(p_dados->>'senha', extensions.gen_salt('bf')), btrim(p_dados->>'pix'),
          btrim(p_dados->>'carro_modelo'), upper(regexp_replace(p_dados->>'carro_placa', '[^A-Za-z0-9]', '', 'g')), nullif(btrim(coalesce(p_dados->>'carro_cor', '')), ''))
  returning * into m;
  return uber_nova_sessao(m);
end $$;
grant execute on function public.uber_cadastrar(jsonb) to anon, authenticated;

create or replace function public.uber_login(p_telefone text, p_senha text) returns jsonb language plpgsql security definer set search_path = public as $$
declare m uber_motoristas; fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
begin
  select * into m from uber_motoristas where empresa_id = gs_empresa_dona() and telefone = fone for update;
  if m.id is null then perform pg_sleep(0.4); return jsonb_build_object('erro', 'Celular ou senha incorretos.'); end if;
  if m.bloqueado_ate > now() then return jsonb_build_object('erro', 'Muitas tentativas. Tente de novo em alguns minutos.'); end if;
  if m.senha_hash <> extensions.crypt(coalesce(p_senha, ''), m.senha_hash) then
    update uber_motoristas set tentativas = case when tentativas + 1 >= 5 then 0 else tentativas + 1 end,
           bloqueado_ate = case when tentativas + 1 >= 5 then now() + interval '15 minutes' else bloqueado_ate end where id = m.id;
    return jsonb_build_object('erro', 'Celular ou senha incorretos.');
  end if;
  if m.status = 'bloqueado' then return jsonb_build_object('erro', 'Seu cadastro está bloqueado. Fale com a empresa.'); end if;
  update uber_motoristas set tentativas = 0, bloqueado_ate = null where id = m.id;
  return uber_nova_sessao(m);
end $$;
grant execute on function public.uber_login(text, text) to anon, authenticated;

create or replace function public.uber_sair(p_token text) returns void language sql security definer set search_path = public as $$
  delete from app_sessoes where token_hash = app_hash(p_token) and tipo = 'motorista'
$$;
grant execute on function public.uber_sair(text) to anon, authenticated;

create or replace function public.uber_motorista(s app_sessoes) returns uber_motoristas language plpgsql stable security definer set search_path = public as $$
declare m uber_motoristas;
begin
  select * into m from uber_motoristas where id = s.motorista_id;
  if m.id is null or m.status = 'bloqueado' then raise exception 'SESSAO_EXPIRADA: Cadastro bloqueado. Fale com a empresa.'; end if;
  return m;
end $$;
revoke all on function public.uber_motorista(app_sessoes) from public, anon, authenticated;

create or replace function public.uber_corrida_json(c uber_corridas) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'vaga_id', c.vaga_id, 'status', c.status, 'valor', c.valor, 'confirmado_em', c.confirmado_em, 'checkin_em', c.checkin_em,
    'checkout_em', c.checkout_em, 'cancelado_em', c.cancelado_em, 'cancelado_por', c.cancelado_por,
    'pago', exists (select 1 from logistica_fechamentos f join fin_pagar p on p.id = f.pagar_id where f.id = c.fechamento_id and p.status = 'pago'),
    'vaga', (select jsonb_build_object('data', v.data, 'hora', to_char(v.hora, 'HH24:MI'), 'ponto_encontro', v.ponto_encontro, 'ponto_lat', v.ponto_lat,
               'ponto_lng', v.ponto_lng, 'destino', v.destino, 'km', v.km, 'ida_volta', v.ida_volta, 'obs', v.obs, 'status', v.status)
             from uber_vagas v where v.id = c.vaga_id))
$$;
revoke all on function public.uber_corrida_json(uber_corridas) from public, anon, authenticated;

create or replace function public.uber_app(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'motorista'); m uber_motoristas := uber_motorista(s);
begin
  return jsonb_build_object(
    'perfil', jsonb_build_object('nome', m.nome, 'telefone', m.telefone, 'pix', m.chave_pix, 'carro_modelo', m.carro_modelo, 'carro_placa', m.carro_placa, 'carro_cor', m.carro_cor),
    'disponiveis', coalesce((select jsonb_agg(uber_vaga_json(v, false) order by v.data, v.hora) from uber_vagas v
        where v.empresa_id = m.empresa_id and v.status = 'aberta' and v.data >= (now() at time zone 'America/Sao_Paulo')::date
          and (select count(*) from uber_corridas c where c.vaga_id = v.id and c.status <> 'cancelada') < v.quantidade
          and not exists (select 1 from uber_corridas c where c.vaga_id = v.id and c.motorista_id = m.id and c.status <> 'cancelada')), '[]'),
    'minhas', coalesce((select jsonb_agg(uber_corrida_json(c) order by v.data desc, v.hora desc) from uber_corridas c join uber_vagas v on v.id = c.vaga_id
        where c.motorista_id = m.id and (c.status in ('confirmada', 'em_andamento') or c.created_at > now() - interval '90 days')), '[]'));
end $$;
grant execute on function public.uber_app(text) to anon, authenticated;

create or replace function public.uber_perfil_salvar(p_token text, p_dados jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'motorista'); m uber_motoristas := uber_motorista(s);
begin
  if length(btrim(coalesce(p_dados->>'pix', ''))) < 3 then raise exception 'Informe a chave PIX.'; end if;
  if length(btrim(coalesce(p_dados->>'carro_modelo', ''))) < 2 or length(regexp_replace(coalesce(p_dados->>'carro_placa', ''), '[^A-Za-z0-9]', '', 'g')) <> 7 then
    raise exception 'Informe o modelo e a placa do carro.';
  end if;
  update uber_motoristas set chave_pix = btrim(p_dados->>'pix'), carro_modelo = btrim(p_dados->>'carro_modelo'),
         carro_placa = upper(regexp_replace(p_dados->>'carro_placa', '[^A-Za-z0-9]', '', 'g')), carro_cor = nullif(btrim(coalesce(p_dados->>'carro_cor', '')), '')
   where id = m.id;
  if coalesce(p_dados->>'senha', '') <> '' then
    if length(p_dados->>'senha') < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
    update uber_motoristas set senha_hash = extensions.crypt(p_dados->>'senha', extensions.gen_salt('bf')) where id = m.id;
  end if;
  return uber_app(p_token);
end $$;
grant execute on function public.uber_perfil_salvar(text, jsonb) to anon, authenticated;

create or replace function public.uber_aceitar(p_token text, p_vaga uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'motorista'); m uber_motoristas := uber_motorista(s); v uber_vagas; n int;
begin
  select * into v from uber_vagas where id = p_vaga and empresa_id = m.empresa_id for update;
  if v.id is null or v.status <> 'aberta' then raise exception 'Esta corrida não está mais disponível.'; end if;
  if v.data < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Esta corrida já passou.'; end if;
  if exists (select 1 from uber_corridas where vaga_id = v.id and motorista_id = m.id and status <> 'cancelada') then raise exception 'Você já aceitou esta corrida.'; end if;
  select count(*) into n from uber_corridas where vaga_id = v.id and status <> 'cancelada';
  if n >= v.quantidade then raise exception 'Outro motorista aceitou antes. Esta corrida não está mais disponível.'; end if;
  insert into uber_corridas (empresa_id, vaga_id, motorista_id, valor) values (m.empresa_id, v.id, m.id, v.valor);
  return uber_app(p_token);
end $$;
grant execute on function public.uber_aceitar(text, uuid) to anon, authenticated;

create or replace function public.uber_desistir(p_token text, p_corrida uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'motorista');
begin
  update uber_corridas set status = 'cancelada', cancelado_em = now(), cancelado_por = 'Motorista'
   where id = p_corrida and motorista_id = s.motorista_id and status = 'confirmada';
  if not found then raise exception 'Só dá para desistir antes do check-in.'; end if;
  return uber_app(p_token);
end $$;
grant execute on function public.uber_desistir(text, uuid) to anon, authenticated;

-- check-in (chegou ao ponto de encontro) e check-out (equipe liberou): código do QR do responsável
create or replace function public.uber_presenca(p_token text, p_corrida uuid, p_codigo text, p_gps jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'motorista'); c uber_corridas; v uber_vagas; cod text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
  j bigint := floor(extract(epoch from now()) / 60)::bigint; ok boolean := false; k bigint; inicio timestamptz;
  lat numeric := nullif(p_gps->>'lat', '')::numeric; lng numeric := nullif(p_gps->>'lng', '')::numeric; r text;
begin
  select * into c from uber_corridas where id = p_corrida and motorista_id = s.motorista_id for update;
  if c.id is null then raise exception 'Corrida não encontrada.'; end if;
  select * into v from uber_vagas where id = c.vaga_id;
  if c.status = 'cancelada' or v.status <> 'aberta' then raise exception 'Esta corrida foi cancelada.'; end if;
  if c.status = 'concluida' then raise exception 'Esta corrida já foi concluída.'; end if;
  if length(cod) = 6 then
    for k in reverse (j + 1)..(j - 3) loop
      if uber_codigo_qr(v.id, k) = cod then ok := true; exit; end if;
    end loop;
  end if;
  if not ok then raise exception 'Código inválido ou vencido. Leia o QR code do responsável de novo.'; end if;
  inicio := ((v.data + coalesce(v.hora, time '06:00')) at time zone 'America/Sao_Paulo');
  if c.status = 'confirmada' then
    if now() < inicio - interval '3 hours' then raise exception 'O check-in libera 3h antes do horário (%).', to_char(v.hora, 'HH24:MI'); end if;
    update uber_corridas set status = 'em_andamento', checkin_em = now(), checkin_lat = lat, checkin_lng = lng where id = c.id;
    r := 'checkin';
  else
    if now() - c.checkin_em < interval '10 minutes' then raise exception 'O check-out libera 10 minutos depois do check-in.'; end if;
    update uber_corridas set status = 'concluida', checkout_em = now(), checkout_lat = lat, checkout_lng = lng where id = c.id;
    r := 'checkout';
  end if;
  return uber_app(p_token) || jsonb_build_object('registro', r);
end $$;
grant execute on function public.uber_presenca(text, uuid, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- Controle de Uber (logística)
create or replace function public.uber_controle(p_empresa uuid, p_de date default null, p_ate date default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.visualizar') then raise exception 'Sem permissão.'; end if;
  return jsonb_build_object(
    'corridas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status, 'valor', c.valor, 'valor_final', c.valor_final,
         'obs', c.obs_logistica, 'conferido_em', c.conferido_em, 'conferido_por', c.conferido_por, 'fechamento_id', c.fechamento_id,
         'checkin_em', c.checkin_em, 'checkout_em', c.checkout_em, 'motorista_id', m.id, 'motorista', m.nome, 'telefone', m.telefone, 'pix', m.chave_pix,
         'carro', concat_ws(' · ', m.carro_modelo, m.carro_cor, m.carro_placa), 'data', v.data, 'hora', to_char(v.hora, 'HH24:MI'),
         'ponto_encontro', v.ponto_encontro, 'destino', v.destino, 'km', v.km, 'ida_volta', v.ida_volta,
         'etapa', e.nome, 'pedido_id', p.id, 'pedido', p.numero_pedido, 'cliente', p.cliente_nome) order by v.data desc, v.hora desc)
       from uber_corridas c join uber_vagas v on v.id = c.vaga_id join uber_motoristas m on m.id = c.motorista_id
       left join operacao_etapas e on e.id = v.etapa_id left join separacoes_pedidos p on p.id = v.pedido_id
      where c.empresa_id = p_empresa and c.status in ('em_andamento', 'concluida')
        and (c.fechamento_id is null or ((p_de is null or v.data >= p_de) and (p_ate is null or v.data <= p_ate)))), '[]'),
    'fechamentos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'numero', f.numero, 'beneficiario', f.beneficiario, 'total', f.total,
         'vencimento', f.vencimento, 'status', f.status, 'criado_em', f.criado_em, 'criado_por', f.criado_por_nome, 'pagar_status', fp.status) order by f.criado_em desc)
       from logistica_fechamentos f left join fin_pagar fp on fp.id = f.pagar_id
      where f.empresa_id = p_empresa and f.tipo = 'uber' and f.criado_em > now() - interval '180 days'), '[]'));
end $$;
grant execute on function public.uber_controle(uuid, date, date) to authenticated;

create or replace function public.uber_conferir(p_empresa uuid, p_corrida uuid, p_valor numeric, p_obs text) returns void language plpgsql security definer set search_path = public as $$
declare c uber_corridas;
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão.'; end if;
  select * into c from uber_corridas where id = p_corrida and empresa_id = p_empresa for update;
  if c.id is null then raise exception 'Corrida não encontrada.'; end if;
  if c.status <> 'concluida' then raise exception 'A corrida só pode ser conferida depois do check-out.'; end if;
  if c.fechamento_id is not null then raise exception 'Esta corrida já foi fechada.'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Valor inválido.'; end if;
  update uber_corridas set valor_final = round(p_valor, 2), obs_logistica = nullif(btrim(coalesce(p_obs, '')), ''),
         conferido_em = now(), conferido_por = logistica_nome_usuario(p_empresa) where id = c.id;
end $$;
grant execute on function public.uber_conferir(uuid, uuid, numeric, text) to authenticated;

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
grant execute on function public.uber_fechar(uuid, uuid[], date, text) to authenticated;

create or replace function public.uber_motorista_status(p_empresa uuid, p_motorista uuid, p_status text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'logistica.planejamento.editar') then raise exception 'Sem permissão.'; end if;
  if p_status not in ('ativo', 'bloqueado') then raise exception 'Situação inválida.'; end if;
  update uber_motoristas set status = p_status where id = p_motorista and empresa_id = p_empresa;
  if p_status = 'bloqueado' then delete from app_sessoes where motorista_id = p_motorista; end if;
end $$;
grant execute on function public.uber_motorista_status(uuid, uuid, text) to authenticated;
