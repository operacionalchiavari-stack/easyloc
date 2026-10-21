-- Operação no Supabase, parte 2 (out/2026): App do Montador, Free (app, vagas, presença com QR)
-- e Painel RH Free, sem o motor da Vercel. Os apps de campo entram com login próprio (sessão em
-- app_sessoes) e só falam com o banco por estas funções, que conferem a sessão e as regras.

-- ===================== tabelas =====================
create table if not exists public.app_sessoes (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  tipo text not null check (tipo in ('montador','free')),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  funcionario_id uuid references public.funcionarios_acesso(id) on delete cascade,
  free_id uuid references public.free_cadastros(id) on delete cascade,
  usuario_id uuid,
  nome text not null,
  perfil text not null default '',
  pasta uuid not null default gen_random_uuid(),
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.operacao_pedidos_info (
  pedido_id uuid primary key references public.separacoes_pedidos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  baldeacao text not null default '', escada text not null default '', caminhao_perto text not null default '',
  horario_limite text not null default '', lona text not null default '',
  atualizado_em timestamptz not null default now()
);

create table if not exists public.operacao_registros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  etapa_id uuid not null references public.operacao_etapas(id) on delete cascade,
  tipo text not null check (tipo in ('equipe','sacolas','posicionamento','observacoes','lista_assinada','lista_conferida','desmontagem_concluida','uniformizacao')),
  dados jsonb not null default '{}',
  autor text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (etapa_id, tipo)
);

create table if not exists public.operacao_apontamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  etapa_id uuid not null references public.operacao_etapas(id) on delete cascade,
  funcionario_id uuid,
  nome text not null,
  inicio timestamptz not null default now(),
  fim timestamptz,
  status text not null default 'ATIVO' check (status in ('ATIVO','ENCERRADO'))
);

create table if not exists public.operacao_trocas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  etapa_id uuid not null references public.operacao_etapas(id) on delete cascade,
  item text not null, quantidade int not null check (quantidade >= 1),
  motivo text not null, descricao text not null default '', foto_url text not null default '',
  solicitado_por text not null default '', solicitado_em timestamptz not null default now(),
  status text not null default 'PENDENTE' check (status in ('PENDENTE','SEPARADO','ENVIADO','CANCELADO')),
  separado_por text, separado_em timestamptz, enviado_por text, enviado_em timestamptz,
  observacao text not null default '', apontamento_id uuid
);

create table if not exists public.operacao_alertas_motorista (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  pedido_id uuid not null references public.separacoes_pedidos(id) on delete cascade,
  problema text not null, observacao text not null default '', enviado_por text not null default '',
  status text not null default 'ABERTO', criado_em timestamptz not null default now(),
  resolucao text, resolvido_por text, resolvido_em timestamptz
);

create table if not exists public.free_vagas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  etapa_id uuid not null references public.operacao_etapas(id) on delete cascade,
  horario text not null,                 -- encontro (HH:mm)
  horario_etapa_base text not null default '',
  ponto_encontro text not null, ponto_lat numeric, ponto_lng numeric,
  lider text not null, quantidade int not null check (quantidade between 1 and 50),
  observacao text not null default '',
  status text not null default 'ABERTA' check (status in ('ABERTA','ENCERRADA','CANCELADA')),
  valor numeric not null default 0,
  modo text not null default 'TODOS' check (modo in ('TODOS','PRIORIDADE','EXCLUSIVA')),
  preferidos uuid[] not null default '{}',
  liberar_em timestamptz,
  segredo_qr text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  chave_lider text not null default encode(extensions.gen_random_bytes(12), 'hex'),
  criado_por text not null default '', criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create unique index if not exists free_vagas_uma_por_etapa on public.free_vagas (etapa_id) where status <> 'CANCELADA';

create table if not exists public.free_inscricoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  vaga_id uuid not null references public.free_vagas(id) on delete cascade,
  free_id uuid not null references public.free_cadastros(id) on delete cascade,
  nome text not null, telefone text not null default '',
  status text not null default 'CONFIRMADO' check (status in ('CONFIRMADO','CANCELADO','REMOVIDO')),
  confirmado_em timestamptz not null default now(), cancelado_em timestamptz, motivo text, cancelado_por text,
  cima_da_hora boolean not null default false,
  data_ciente text, horario_ciente text,
  checkin_em timestamptz, checkin_lat numeric, checkin_lng numeric, checkin_distancia numeric, checkin_via text,
  checkout_em timestamptz, checkout_lat numeric, checkout_lng numeric, checkout_distancia numeric,
  presenca_por text, foto_uniforme text
);
create index if not exists free_inscricoes_vaga_idx on public.free_inscricoes (vaga_id);
create index if not exists free_inscricoes_free_idx on public.free_inscricoes (free_id);

create table if not exists public.free_rh_pagamentos (
  inscricao_id uuid primary key references public.free_inscricoes(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ciclo date not null,
  pagar_extra boolean not null default false, ajuste numeric not null default 0, motivo_ajuste text not null default '',
  nao_pagar boolean not null default false,
  valor_pago numeric, pago_em timestamptz, forma text, pago_por text,
  atualizado_por text, atualizado_em timestamptz not null default now()
);

create table if not exists public.free_rh_uniforme (
  inscricao_id uuid primary key references public.free_inscricoes(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  avaliacao text not null check (avaliacao in ('OK','INCOMPLETO','SEM')),
  observacao text not null default '', responsavel_etapa text not null default '',
  avaliado_por text, avaliado_em timestamptz not null default now()
);

create table if not exists public.free_rh_config (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  valor_hora numeric not null default 0, horas_diaria numeric not null default 8
);

-- ===================== segurança das tabelas (telas internas) =====================
alter table public.app_sessoes enable row level security;  -- só funções
do $$
declare t text;
begin
  foreach t in array array['operacao_pedidos_info','operacao_registros','operacao_apontamentos','operacao_trocas','operacao_alertas_motorista','free_vagas','free_inscricoes','free_rh_pagamentos','free_rh_uniforme','free_rh_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_ler on public.%1$s', t);
    execute format('create policy %1$s_ler on public.%1$s for select to authenticated using (public.eh_membro_empresa(empresa_id))', t);
    execute format('drop policy if exists %1$s_gravar on public.%1$s', t);
    execute format('create policy %1$s_gravar on public.%1$s for all to authenticated using (public.funcionario_pode(empresa_id, auth.uid(), ''logistica.cronograma.editar'') or public.funcionario_pode(empresa_id, auth.uid(), ''logistica.planejamento.editar'') or public.funcionario_pode(empresa_id, auth.uid(), ''rh.colaboradores.editar'') or public.funcionario_pode(empresa_id, auth.uid(), ''logistica.cronograma.montagem'')) with check (public.funcionario_pode(empresa_id, auth.uid(), ''logistica.cronograma.editar'') or public.funcionario_pode(empresa_id, auth.uid(), ''logistica.planejamento.editar'') or public.funcionario_pode(empresa_id, auth.uid(), ''rh.colaboradores.editar'') or public.funcionario_pode(empresa_id, auth.uid(), ''logistica.cronograma.montagem''))', t);
  end loop;
end $$;
-- o segredo do QR e o hash da senha nunca vão para a tela por leitura direta
revoke select on public.free_vagas from authenticated, anon;
grant select (id, empresa_id, etapa_id, horario, horario_etapa_base, ponto_encontro, ponto_lat, ponto_lng, lider, quantidade, observacao, status, valor, modo, preferidos, liberar_em, chave_lider, criado_por, criado_em, atualizado_em) on public.free_vagas to authenticated;
revoke select on public.free_cadastros from authenticated, anon;
grant select (id, empresa_id, nome, cpf, telefone, foto_url, status, chave_pix, observacao, nota, ultimo_acesso, created_at) on public.free_cadastros to authenticated;
-- free_cadastros: cadastro pela equipe também
drop policy if exists free_cadastros_inserir on public.free_cadastros;
create policy free_cadastros_inserir on public.free_cadastros for insert to authenticated with check (public.eh_membro_empresa(empresa_id));

-- ===================== fotos =====================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('operacao-fotos', 'operacao-fotos', true, 12582912, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create or replace function public.app_pasta_valida(p_pasta text) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from app_sessoes where pasta::text = p_pasta and expira_em > now())
$$;
grant execute on function public.app_pasta_valida(text) to anon, authenticated;

drop policy if exists operacao_fotos_ler on storage.objects;
create policy operacao_fotos_ler on storage.objects for select to anon, authenticated using (bucket_id = 'operacao-fotos');
drop policy if exists operacao_fotos_app on storage.objects;
create policy operacao_fotos_app on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'operacao-fotos' and public.app_pasta_valida((storage.foldername(name))[1]));
drop policy if exists operacao_fotos_equipe on storage.objects;
create policy operacao_fotos_equipe on storage.objects for insert to authenticated
  with check (bucket_id = 'operacao-fotos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and public.eh_membro_empresa(((storage.foldername(name))[1])::uuid));

-- ===================== auxiliares =====================
create or replace function public.app_hash(p text) returns text language sql immutable as $$
  select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex')
$$;

create or replace function public.app_novo_token() returns text language sql volatile as $$
  select encode(extensions.gen_random_bytes(32), 'hex')
$$;

-- sessão válida do app (erro "SESSAO_EXPIRADA:" faz o app voltar para o login)
create or replace function public.app_sessao(p_token text, p_tipo text) returns public.app_sessoes
language plpgsql stable security definer set search_path=public as $$
declare s app_sessoes;
begin
  select * into s from app_sessoes where token_hash = app_hash(p_token) and tipo = p_tipo and expira_em > now();
  if s.id is null then raise exception 'SESSAO_EXPIRADA: Entre de novo no app.'; end if;
  return s;
end $$;

create or replace function public.app_distancia_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) returns numeric
language sql immutable as $$
  select case when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null else
    round(2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))) end
$$;

-- vaga com a data/horário atuais da etapa (o encontro anda junto se a etapa mudar de horário)
create or replace view public.free_vagas_v with (security_invoker = true) as
select v.id, v.empresa_id, v.etapa_id, e.pedido_id, e.nome etapa, e.data,
       case when v.horario ~ '^\d{1,2}:\d{2}' and v.horario_etapa_base ~ '^\d{1,2}:\d{2}' and e.hora is not null
            then to_char((v.horario::time + (e.hora - v.horario_etapa_base::time)), 'HH24:MI') else v.horario end horario,
       v.horario horario_original, v.horario_etapa_base, to_char(e.hora, 'HH24:MI') horario_etapa_atual,
       v.ponto_encontro, v.ponto_lat, v.ponto_lng, v.lider, v.quantidade, v.observacao, v.status, v.valor, v.modo,
       v.preferidos, v.liberar_em, v.criado_por, v.criado_em, v.atualizado_em,
       s.numero_pedido pedido, s.cliente_nome cliente, coalesce(s.local_nome, '') local
  from free_vagas v join operacao_etapas e on e.id = v.etapa_id left join separacoes_pedidos s on s.id = e.pedido_id;

create or replace function public.free_vaga_quando(p_data date, p_horario text) returns timestamp language sql immutable as $$
  select p_data + case when p_horario ~ '^\d{1,2}:\d{2}' then p_horario::time else time '23:59' end
$$;

-- fase da presença (mesma regra do app: check-in abre 3h antes e fecha 12h depois; check-out até 24h)
create or replace function public.free_fase(p_vaga_status text, p_data date, p_horario text, p_checkin timestamptz, p_checkout timestamptz)
returns text language sql stable as $$
  select case
    when p_checkout is not null then 'CONCLUIDO'
    when p_checkin is not null then case when now() <= p_checkin + interval '24 hours' then 'TRABALHANDO' else 'SEM_CHECKOUT' end
    when p_vaga_status = 'CANCELADA' then 'CANCELADA'
    when (now() at time zone 'America/Sao_Paulo') < free_vaga_quando(p_data, p_horario) - interval '3 hours' then 'AGUARDANDO'
    when (now() at time zone 'America/Sao_Paulo') <= free_vaga_quando(p_data, p_horario) + interval '12 hours' then 'CHECKIN'
    else 'FALTOU' end
$$;

-- código do QR: 6 números a partir do segredo da vaga e do minuto
create or replace function public.free_codigo_qr(p_vaga uuid, p_janela bigint) returns text language sql stable security definer set search_path=public as $$
  select lpad((((get_byte(h, 0)::bigint << 24) + (get_byte(h, 1) << 16) + (get_byte(h, 2) << 8) + get_byte(h, 3)) % 1000000)::text, 6, '0')
    from (select extensions.hmac(p_vaga::text || ':' || p_janela, segredo_qr, 'sha256') h from free_vagas where id = p_vaga) x
$$;
revoke all on function public.free_codigo_qr(uuid, bigint) from public, anon, authenticated;

create or replace function public.free_janela() returns bigint language sql stable as $$
  select floor(extract(epoch from now()) / 60)::bigint
$$;

-- dados do QR (líder, supervisor e app do montador)
create or replace function public.free_qr_dados(p_vaga uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v free_vagas_v; j bigint := free_janela();
begin
  select * into v from free_vagas_v where id = p_vaga;
  if v.id is null then raise exception 'Vaga não encontrada.'; end if;
  return jsonb_build_object('idVaga', v.id, 'etapa', v.etapa, 'cliente', v.cliente, 'dataISO', v.data, 'horario', v.horario,
    'pontoEncontro', v.ponto_encontro, 'lider', v.lider, 'status', v.status, 'codigo', free_codigo_qr(v.id, j),
    'chaveLider', (select chave_lider from free_vagas where id = p_vaga),
    'trocaEm', ((j + 1) * 60000 - floor(extract(epoch from now()) * 1000))::bigint,
    'equipe', coalesce((select jsonb_agg(jsonb_build_object('nome', i.nome, 'checkinEm', i.checkin_em, 'checkoutEm', i.checkout_em,
       'fase', free_fase(v.status, v.data, v.horario, i.checkin_em, i.checkout_em)) order by i.nome)
       from free_inscricoes i where i.vaga_id = v.id and i.status = 'CONFIRMADO'), '[]'));
end $$;
revoke all on function public.free_qr_dados(uuid) from public, anon, authenticated;

-- QR na tela do líder (link com a chave da vaga)
create or replace function public.free_lider_qr(p_vaga uuid, p_chave text) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from free_vagas where id = p_vaga and chave_lider = p_chave) then raise exception 'Link do QR code inválido. Peça um novo ao supervisor.'; end if;
  if exists (select 1 from free_vagas where id = p_vaga and status = 'CANCELADA') then raise exception 'Esta vaga foi cancelada.'; end if;
  return free_qr_dados(p_vaga);
end $$;
grant execute on function public.free_lider_qr(uuid, text) to anon, authenticated;

-- QR para a equipe interna (cronograma / painel)
create or replace function public.free_adm_qr(p_vaga uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare emp uuid;
begin
  select empresa_id into emp from free_vagas where id = p_vaga;
  if emp is null or not eh_membro_empresa(emp) then raise exception 'Vaga não encontrada.'; end if;
  return free_qr_dados(p_vaga);
end $$;
grant execute on function public.free_adm_qr(uuid) to authenticated;

-- ===================== App do Montador =====================
create or replace function public.mont_nomes() returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by nome), '[]')
    from funcionarios_acesso where empresa_id = gs_empresa_dona() and ativo and equipe_operacional = 'montagem'
$$;
grant execute on function public.mont_nomes() to anon, authenticated;

create or replace function public.mont_login(p_funcionario uuid, p_pin text) returns jsonb language plpgsql security definer set search_path=public as $$
declare f funcionarios_acesso; t text := app_novo_token(); s app_sessoes;
begin
  select * into f from funcionarios_acesso where id = p_funcionario and empresa_id = gs_empresa_dona() and ativo and equipe_operacional = 'montagem';
  if f.id is null then raise exception 'Seu nome não está na equipe de Montagem do cadastro do RH.'; end if;
  if not rh_pin_conferir(f.empresa_id, f.id, p_pin) then raise exception 'PIN incorreto.'; end if;
  insert into app_sessoes (token_hash, tipo, empresa_id, funcionario_id, nome, perfil, expira_em)
  values (app_hash(t), 'montador', f.empresa_id, f.id, f.nome, 'RESPONSAVEL', now() + interval '60 days') returning * into s;
  return jsonb_build_object('token', t, 'nome', f.nome, 'perfil', 'RESPONSAVEL', 'pasta', s.pasta);
end $$;
grant execute on function public.mont_login(uuid, text) to anon, authenticated;

-- supervisor: login do Acervo com a permissão de supervisor de montagem
create or replace function public.mont_login_supervisor() returns jsonb language plpgsql security definer set search_path=public as $$
declare emp uuid := gs_empresa_dona(); t text := app_novo_token(); s app_sessoes; nome text;
begin
  if auth.uid() is null or not funcionario_pode(emp, auth.uid(), 'logistica.cronograma.montagem') then
    raise exception 'Entre no sistema com um usuário que tenha a permissão de Supervisor de Montagem.';
  end if;
  select coalesce((select f.nome from funcionarios_acesso f where f.id = auth.uid()), (select u.nome from usuarios u where u.id = auth.uid()), 'Supervisor de Montagem') into nome;
  insert into app_sessoes (token_hash, tipo, empresa_id, usuario_id, nome, perfil, expira_em)
  values (app_hash(t), 'montador', emp, auth.uid(), nome, 'SUPERVISOR', now() + interval '60 days') returning * into s;
  return jsonb_build_object('token', t, 'nome', nome, 'perfil', 'SUPERVISOR', 'pasta', s.pasta);
end $$;
grant execute on function public.mont_login_supervisor() to authenticated;

create or replace function public.app_sair(p_token text) returns boolean language sql security definer set search_path=public as $$
  delete from app_sessoes where token_hash = app_hash(p_token); select true
$$;
grant execute on function public.app_sair(text) to anon, authenticated;

-- a pessoa da sessão é responsável (ou está na equipe) desta etapa — ou é supervisor
create or replace function public.mont_pode_ver(s public.app_sessoes, p_etapa uuid) returns boolean language sql stable security definer set search_path=public as $$
  select s.perfil = 'SUPERVISOR' and exists (select 1 from operacao_etapas e where e.id = p_etapa and e.empresa_id = s.empresa_id)
      or exists (select 1 from operacao_etapa_pessoas p where p.etapa_id = p_etapa and p.funcionario_id = s.funcionario_id and p.papel = 'responsavel')
$$;

-- regra de campo (vinha do motor/operacao_validar_campo): pedido aprovado, carregamento concluído e,
-- na desmontagem, os registros obrigatórios da montagem do mesmo pedido
create or replace function public.operacao_validar_etapa_campo(p_etapa uuid) returns void language plpgsql security definer set search_path=public as $$
declare e operacao_etapas; p separacoes_pedidos; m record;
begin
  select * into e from operacao_etapas where id = p_etapa;
  if e.id is null then raise exception 'Etapa não encontrada'; end if;
  if e.pedido_id is null then return; end if;
  select * into p from separacoes_pedidos where id = e.pedido_id;
  if coalesce(p.status_comercial, '') not in ('aprovado','enviado','finalizado') or p.encerrado_operacional_em is not null then raise exception 'Pedido não está liberado para execução'; end if;
  if p.operacao->'carregamento'->>'concluido_em' is null then raise exception 'Conclua o carregamento antes de iniciar a montagem ou desmontagem'; end if;
  if e.tipo = 'desmontagem' then
    for m in select id from operacao_etapas where pedido_id = p.id and tipo = 'montagem' loop
      if (select count(*) from operacao_registros r where r.etapa_id = m.id and r.tipo in ('equipe','sacolas','posicionamento','lista_assinada')) < 4 then
        raise exception 'Finalize os registros obrigatórios da montagem antes da desmontagem';
      end if;
    end loop;
  end if;
end $$;

create or replace function public.mont_apontamento_ativo(s public.app_sessoes) returns jsonb language sql stable security definer set search_path=public as $$
  select to_jsonb(x) from (select a.id, a.nome, a.etapa_id "idEtapa", (select numero_pedido from separacoes_pedidos sp join operacao_etapas e on e.pedido_id = sp.id where e.id = a.etapa_id) pedido,
          a.inicio, a.fim, a.status from operacao_apontamentos a
    where a.status = 'ATIVO' and a.empresa_id = s.empresa_id
      and ((s.funcionario_id is not null and a.funcionario_id = s.funcionario_id) or (s.funcionario_id is null and a.nome = s.nome))
    order by a.inicio desc limit 1) x
$$;

-- dados do app: etapas da pessoa (supervisor: todas as montagens/desmontagens) de 2 dias atrás a 7/30 dias à frente
create or replace function public.mont_dados(p_token text, p_id_extra uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); sup boolean := s.perfil = 'SUPERVISOR'; apont jsonb := mont_apontamento_ativo(s);
begin
  return jsonb_build_object('nome', s.nome, 'perfil', s.perfil, 'pasta', s.pasta, 'apontamento', apont,
    'etapas', coalesce((select jsonb_agg(row_to_json(x) order by x."dataISO", x.horario) from (
      select e.id, coalesce(sp.numero_pedido, '') pedido, to_char(sp.data_evento, 'DD/MM/YYYY') "dataEvento", coalesce(sp.cliente_nome, '') cliente,
             trim(both ' - ' from coalesce(sp.local_nome, '') || ' - ' || coalesce(l.endereco, '') || coalesce(', ' || l.numero_endereco, '')) local,
             e.nome etapa, e.tipo, e.data "dataISO", to_char(e.hora, 'HH24:MI') horario,
             (select string_agg(k.codigo, ',') from operacao_etapa_caminhoes c join caminhoes k on k.id = c.caminhao_id where c.etapa_id = e.id) caminhao,
             coalesce((select nome from operacao_etapa_pessoas where etapa_id = e.id and papel = 'responsavel'), '') responsavel,
             coalesce((select jsonb_agg(nome order by ordem) from operacao_etapa_pessoas where etapa_id = e.id and papel = 'equipe'), '[]') equipe,
             e.observacao, l.latitude lat, l.longitude lng,
             (select to_jsonb(i) from operacao_pedidos_info i where i.pedido_id = e.pedido_id) info,
             coalesce((select jsonb_object_agg(r.tipo, r.dados) from operacao_registros r where r.etapa_id = e.id), '{}') registros,
             coalesce((select jsonb_agg(to_jsonb(t) order by t.solicitado_em) from operacao_trocas t where t.etapa_id = e.id and t.status <> 'CANCELADO'), '[]') trocas,
             (select jsonb_build_object('problema', a.problema, 'observacao', a.observacao, 'enviadoPor', a.enviado_por)
                from operacao_alertas_motorista a where a.pedido_id = e.pedido_id and a.status not in ('RESOLVIDO','FINALIZADO') order by a.criado_em desc limit 1) alerta,
             (select jsonb_build_object('idVaga', v.id, 'status', v.status, 'quantidade', v.quantidade, 'horario', v.horario, 'pontoEncontro', v.ponto_encontro, 'lider', v.lider,
                'pessoas', coalesce((select jsonb_agg(jsonb_build_object('nome', i.nome, 'telefone', i.telefone, 'miniatura', coalesce(c.foto_url, ''),
                   'fase', free_fase(v.status, v.data, v.horario, i.checkin_em, i.checkout_em), 'checkinEm', i.checkin_em, 'checkoutEm', i.checkout_em, 'nota', c.nota))
                   from free_inscricoes i join free_cadastros c on c.id = i.free_id where i.vaga_id = v.id and i.status = 'CONFIRMADO'), '[]'))
                from free_vagas_v v where v.etapa_id = e.id and v.status <> 'CANCELADA' limit 1) free,
             coalesce((select jsonb_agg(jsonb_build_object('etapa', o.nome, 'dataISO', o.data, 'horario', to_char(o.hora, 'HH24:MI'),
                 'caminhao', (select string_agg(k.codigo, ',') from operacao_etapa_caminhoes c join caminhoes k on k.id = c.caminhao_id where c.etapa_id = o.id),
                 'responsavel', coalesce((select nome from operacao_etapa_pessoas where etapa_id = o.id and papel = 'responsavel'), '')) order by o.data, o.hora)
               from operacao_etapas o where o.pedido_id = e.pedido_id and o.id <> e.id), '[]') "outrasEtapas",
             case when e.tipo = 'desmontagem' then coalesce((select jsonb_agg(jsonb_build_object('codigo', sac->>'codigo', 'fotos', coalesce(sac->'fotos', '[]'), 'dataMontagem', m.data))
               from operacao_etapas m join operacao_registros r on r.etapa_id = m.id and r.tipo = 'sacolas', jsonb_array_elements(r.dados->'sacolas') sac
               where m.pedido_id = e.pedido_id and m.tipo = 'montagem'), '[]') else '[]' end "sacolasMontagem"
        from operacao_etapas e
        left join separacoes_pedidos sp on sp.id = e.pedido_id
        left join locais_empresas l on l.id = sp.local_id
       where e.empresa_id = s.empresa_id
         and ((e.id = p_id_extra) or (apont is not null and e.id = (apont->>'idEtapa')::uuid)
              or (e.data between current_date - 2 and current_date + case when sup then 30 else 7 end
                  and (case when sup then e.tipo in ('montagem','desmontagem')
                       else exists (select 1 from operacao_etapa_pessoas p where p.etapa_id = e.id and p.funcionario_id = s.funcionario_id and p.papel = 'responsavel') end)))
    ) x), '[]'),
    'avisoExtra', case when p_id_extra is not null and not sup and not exists (select 1 from operacao_etapa_pessoas p where p.etapa_id = p_id_extra and p.funcionario_id = s.funcionario_id and p.papel = 'responsavel')
      then coalesce('Esta etapa é de ' || (select nome from operacao_etapa_pessoas where etapa_id = p_id_extra and papel = 'responsavel') || '. Peça para ele registrar ou entre como supervisor.', 'Etapa não encontrada.') end);
end $$;
grant execute on function public.mont_dados(text, uuid) to anon, authenticated;

create or replace function public.mont_apontamento_iniciar(p_token text, p_etapa uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); e operacao_etapas; atual jsonb;
begin
  select * into e from operacao_etapas where id = p_etapa;
  if e.id is null or not mont_pode_ver(s, p_etapa) then raise exception 'Você não tem acesso a esta etapa.'; end if;
  if e.tipo not in ('montagem','desmontagem') then raise exception 'O apontamento está disponível para montagem e desmontagem.'; end if;
  perform operacao_validar_etapa_campo(p_etapa);
  atual := mont_apontamento_ativo(s);
  if atual is not null then
    if (atual->>'idEtapa')::uuid = p_etapa then return atual; end if;
    raise exception 'Encerre o evento em andamento antes de iniciar outro.';
  end if;
  insert into operacao_apontamentos (empresa_id, etapa_id, funcionario_id, nome) values (s.empresa_id, p_etapa, s.funcionario_id, s.nome);
  return mont_apontamento_ativo(s);
end $$;
grant execute on function public.mont_apontamento_iniciar(text, uuid) to anon, authenticated;

create or replace function public.mont_apontamento_finalizar(p_token text, p_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); a operacao_apontamentos;
begin
  select * into a from operacao_apontamentos where id = p_id and empresa_id = s.empresa_id
     and ((s.funcionario_id is not null and funcionario_id = s.funcionario_id) or (s.funcionario_id is null and nome = s.nome));
  if a.id is null then raise exception 'Apontamento não encontrado para este responsável.'; end if;
  update operacao_apontamentos set fim = coalesce(fim, now()), status = 'ENCERRADO' where id = a.id returning * into a;
  return jsonb_build_object('id', a.id, 'nome', a.nome, 'idEtapa', a.etapa_id, 'inicio', a.inicio, 'fim', a.fim, 'status', a.status);
end $$;
grant execute on function public.mont_apontamento_finalizar(text, uuid) to anon, authenticated;

-- grava um registro da montagem/desmontagem (fotos já sobem pelo app; aqui só as URLs)
create or replace function public.mont_registro_salvar(p_token text, p_etapa uuid, p_tipo text, p_dados jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); e operacao_etapas; atual operacao_registros; dados jsonb := coalesce(p_dados, '{}');
  apont jsonb; lat numeric; lng numeric; prec numeric; latev numeric; lngev numeric; dist numeric; previsto timestamptz;
begin
  select * into e from operacao_etapas where id = p_etapa;
  if e.id is null or not mont_pode_ver(s, p_etapa) then raise exception 'Entre no app como responsável por esta etapa.'; end if;
  if e.tipo not in ('montagem','desmontagem') then raise exception 'Esta etapa não é de montagem ou desmontagem.'; end if;
  select * into atual from operacao_registros where etapa_id = p_etapa and tipo = p_tipo;
  if atual.id is not null and p_tipo <> 'observacoes' then return atual.dados || jsonb_build_object('enviado', true, 'jaExistia', true); end if;
  if p_tipo = 'equipe' then
    apont := mont_apontamento_ativo(s);
    if apont is null or (apont->>'idEtapa')::uuid <> p_etapa then raise exception 'Inicie este evento no cronograma antes de enviar. O apontamento pode ter sido encerrado em outro aparelho.'; end if;
    perform operacao_validar_etapa_campo(p_etapa);
    if coalesce(dados->>'foto', '') = '' then raise exception 'Tire uma foto da equipe completa antes de enviar.'; end if;
    lat := nullif(dados->>'latitude', '')::numeric; lng := nullif(dados->>'longitude', '')::numeric; prec := nullif(dados->>'precisaoGPS', '')::numeric;
    if lat is null or lng is null or prec is null or prec <= 0 then raise exception 'Ative a localização e tente enviar novamente.'; end if;
    if prec > 100 then raise exception 'O sinal de localização está impreciso. Vá para uma área aberta e tente novamente.'; end if;
    select l.latitude, l.longitude into latev, lngev from separacoes_pedidos sp join locais_empresas l on l.id = sp.local_id where sp.id = e.pedido_id;
    dist := app_distancia_m(latev, lngev, lat, lng);
    previsto := (e.data + coalesce(e.hora, time '08:00')) at time zone 'America/Sao_Paulo';
    dados := dados || jsonb_build_object('chegada', jsonb_build_object('em', now(), 'distancia', dist, 'previsto', previsto,
      'atraso', greatest(0, ceil(extract(epoch from (now() - previsto)) / 60)),
      'localStatus', case when dist is null then 'SEM_COORDENADAS_EVENTO' when dist <= 300 then 'NO_LOCAL' else 'FORA_DO_LOCAL' end,
      'autor', s.nome, 'apontamentoId', apont->>'id'));
  elsif p_tipo = 'desmontagem_concluida' then
    if (select count(*) from operacao_registros where etapa_id = p_etapa and tipo in ('equipe','lista_conferida')) < 2 then
      raise exception 'Envie a foto da equipe e a lista conferida antes de concluir.';
    end if;
  end if;
  insert into operacao_registros (empresa_id, etapa_id, tipo, dados, autor) values (e.empresa_id, p_etapa, p_tipo, dados, s.nome)
  on conflict (etapa_id, tipo) do update set dados = excluded.dados, autor = excluded.autor, atualizado_em = now();
  return dados || jsonb_build_object('enviado', true);
end $$;
grant execute on function public.mont_registro_salvar(text, uuid, text, jsonb) to anon, authenticated;

create or replace function public.mont_registro_ler(p_token text, p_etapa uuid, p_tipo text) returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); r operacao_registros;
begin
  if not mont_pode_ver(s, p_etapa) then raise exception 'Você não tem acesso a esta etapa.'; end if;
  select * into r from operacao_registros where etapa_id = p_etapa and tipo = p_tipo;
  return case when r.id is null then jsonb_build_object('enviado', false) else r.dados || jsonb_build_object('enviado', true, 'concluida', true) end;
end $$;
grant execute on function public.mont_registro_ler(text, uuid, text) to anon, authenticated;

create or replace function public.mont_itens(p_token text, p_texto text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); termo text := '%' || lower(coalesce(p_texto, '')) || '%';
begin
  return coalesce((select jsonb_agg(nome) from (select coalesce(nullif(descricao_total, ''), produto) nome from itens
     where empresa_id = s.empresa_id and coalesce(ativo, true) and length(coalesce(p_texto, '')) >= 2
       and (lower(coalesce(descricao_total, produto, '')) like termo or lower(coalesce(codigo, '')) like termo or lower(coalesce(referencia, '')) like termo)
     order by 1 limit 20) x), '[]');
end $$;
grant execute on function public.mont_itens(text, text) to anon, authenticated;

create or replace function public.mont_trocas(p_etapa uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'idEtapa', etapa_id, 'item', item, 'quantidade', quantidade, 'motivo', motivo,
    'descricao', descricao, 'fotoUrl', foto_url, 'solicitadoPor', solicitado_por, 'solicitadoEm', solicitado_em, 'status', status,
    'separadoPor', separado_por, 'separadoEm', separado_em, 'enviadoPor', enviado_por, 'enviadoEm', enviado_em, 'observacao', observacao) order by solicitado_em), '[]')
    from operacao_trocas where etapa_id = p_etapa and status <> 'CANCELADO'
$$;

create or replace function public.mont_troca_solicitar(p_token text, p_dados jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); et uuid := (p_dados->>'idEtapa')::uuid; apont jsonb := mont_apontamento_ativo(s); q int := floor(coalesce(nullif(p_dados->>'quantidade', ''), '0')::numeric);
begin
  if apont is null or (apont->>'idEtapa')::uuid <> et then raise exception 'Inicie este evento no cronograma antes de enviar. O apontamento pode ter sido encerrado em outro aparelho.'; end if;
  if not mont_pode_ver(s, et) then raise exception 'Você não tem acesso a esta etapa.'; end if;
  perform operacao_validar_etapa_campo(et);
  if coalesce(trim(p_dados->>'item'), '') = '' then raise exception 'Informe qual item precisa ser trocado.'; end if;
  if q < 1 then raise exception 'Informe a quantidade.'; end if;
  if coalesce(p_dados->>'motivo', '') not in ('Danificou no transporte','Quebrou no local','Faltou o item') then raise exception 'Escolha o motivo.'; end if;
  if coalesce(p_dados->>'foto', '') = '' then raise exception 'Tire uma foto do item.'; end if;
  insert into operacao_trocas (empresa_id, etapa_id, item, quantidade, motivo, descricao, foto_url, solicitado_por, apontamento_id)
  values (s.empresa_id, et, left(trim(p_dados->>'item'), 200), q, p_dados->>'motivo', left(coalesce(p_dados->>'descricao', ''), 500), p_dados->>'foto', s.nome, (apont->>'id')::uuid);
  return mont_trocas(et);
end $$;
grant execute on function public.mont_troca_solicitar(text, jsonb) to anon, authenticated;

create or replace function public.mont_troca_cancelar(p_token text, p_troca uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); t operacao_trocas;
begin
  select * into t from operacao_trocas where id = p_troca;
  if t.id is null then raise exception 'Solicitação não encontrada.'; end if;
  if not mont_pode_ver(s, t.etapa_id) then raise exception 'Você não tem acesso a esta solicitação.'; end if;
  if t.status <> 'PENDENTE' then raise exception 'O galpão já separou este item. Fale com o supervisor.'; end if;
  update operacao_trocas set status = 'CANCELADO', observacao = 'Cancelado por ' || s.nome || ' em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') where id = t.id;
  return mont_trocas(t.etapa_id);
end $$;
grant execute on function public.mont_troca_cancelar(text, uuid) to anon, authenticated;

create or replace function public.mont_qr_vaga(p_token text, p_etapa uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); v uuid;
begin
  if not mont_pode_ver(s, p_etapa) then raise exception 'Você não tem acesso a esta etapa.'; end if;
  select id into v from free_vagas where etapa_id = p_etapa and status <> 'CANCELADA' limit 1;
  if v is null then raise exception 'Esta etapa não tem vaga de free.'; end if;
  return free_qr_dados(v);
end $$;
grant execute on function public.mont_qr_vaga(text, uuid) to anon, authenticated;

-- ===================== App do Free =====================
create or replace function public.free_cpf_valido(p text) returns boolean language plpgsql immutable as $$
declare c text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; d1 int; d2 int; i int;
begin
  if length(c) <> 11 or c ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(c, i, 1)::int * (11 - i); end loop;
  d1 := (s * 10) % 11; if d1 = 10 then d1 := 0; end if;
  s := 0; for i in 1..10 loop s := s + substr(c, i, 1)::int * (12 - i); end loop;
  d2 := (s * 10) % 11; if d2 = 10 then d2 := 0; end if;
  return d1 = substr(c, 10, 1)::int and d2 = substr(c, 11, 1)::int;
end $$;

create or replace function public.free_nova_sessao(c public.free_cadastros) returns jsonb language plpgsql security definer set search_path=public as $$
declare t text := app_novo_token(); s app_sessoes;
begin
  insert into app_sessoes (token_hash, tipo, empresa_id, free_id, nome, perfil, expira_em)
  values (app_hash(t), 'free', c.empresa_id, c.id, c.nome, 'FREE', now() + interval '60 days') returning * into s;
  update free_cadastros set ultimo_acesso = now() where id = c.id;
  return jsonb_build_object('token', t, 'pasta', s.pasta);
end $$;
revoke all on function public.free_nova_sessao(public.free_cadastros) from public, anon, authenticated;

create or replace function public.free_app_cadastrar(p_dados jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_cpf text := regexp_replace(coalesce(p_dados->>'cpf', ''), '\D', '', 'g'); c free_cadastros; emp uuid := gs_empresa_dona();
begin
  if array_length(regexp_split_to_array(trim(coalesce(p_dados->>'nome', '')), '\s+'), 1) < 2 then raise exception 'Informe o nome completo.'; end if;
  if not free_cpf_valido(v_cpf) then raise exception 'CPF inválido. Confira os números.'; end if;
  if length(regexp_replace(coalesce(p_dados->>'telefone', ''), '\D', '', 'g')) < 10 then raise exception 'Informe um telefone com DDD.'; end if;
  if length(coalesce(p_dados->>'senha', '')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  if length(trim(coalesce(p_dados->>'pix', ''))) < 5 then raise exception 'Informe sua chave PIX para receber os pagamentos.'; end if;
  if exists (select 1 from free_cadastros f where f.empresa_id = emp and f.cpf = v_cpf) then raise exception 'Este CPF já está cadastrado. Faça login.'; end if;
  insert into free_cadastros (empresa_id, nome, cpf, telefone, senha_hash, chave_pix, status)
  values (emp, left(trim(p_dados->>'nome'), 120), v_cpf, left(trim(p_dados->>'telefone'), 30), extensions.crypt(p_dados->>'senha', extensions.gen_salt('bf')), left(trim(p_dados->>'pix'), 120), 'pendente')
  returning * into c;
  return free_nova_sessao(c);
end $$;
grant execute on function public.free_app_cadastrar(jsonb) to anon, authenticated;

create or replace function public.free_app_login(p_cpf text, p_senha text) returns jsonb language plpgsql security definer set search_path=public as $$
declare c free_cadastros;
begin
  select * into c from free_cadastros where empresa_id = gs_empresa_dona() and cpf = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  if c.id is null or c.senha_hash is null or c.senha_hash <> extensions.crypt(coalesce(p_senha, ''), c.senha_hash) then raise exception 'CPF ou senha incorretos.'; end if;
  if c.status = 'bloqueado' then raise exception 'Seu cadastro está bloqueado. Fale com a empresa.'; end if;
  return free_nova_sessao(c);
end $$;
grant execute on function public.free_app_login(text, text) to anon, authenticated;

create or replace function public.free_app_foto(p_token text, p_url text) returns boolean language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'free');
begin
  if p_url !~ ('/operacao-fotos/' || s.pasta::text || '/') then raise exception 'Foto inválida.'; end if;
  update free_cadastros set foto_url = p_url where id = s.free_id;
  return true;
end $$;
grant execute on function public.free_app_foto(text, text) to anon, authenticated;

create or replace function public.free_app_pix(p_token text, p_pix text) returns boolean language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'free');
begin
  if length(trim(coalesce(p_pix, ''))) < 5 then raise exception 'Informe uma chave PIX válida.'; end if;
  update free_cadastros set chave_pix = left(trim(p_pix), 120) where id = s.free_id;
  return true;
end $$;
grant execute on function public.free_app_pix(text, text) to anon, authenticated;

-- dados crus do app do free (o app monta as telas com as mesmas regras de antes)
create or replace function public.free_app_dados(p_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'free'); c free_cadastros;
begin
  select * into c from free_cadastros where id = s.free_id;
  return jsonb_build_object(
    'free', jsonb_build_object('id', c.id, 'nome', c.nome, 'cpf', c.cpf, 'telefone', c.telefone, 'pix', coalesce(c.chave_pix, ''), 'status', upper(c.status), 'miniatura', coalesce(c.foto_url, ''), 'pasta', s.pasta),
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
     where v.empresa_id = c.empresa_id and (v.status <> 'CANCELADA' or exists (select 1 from free_inscricoes i where i.vaga_id = v.id and i.free_id = c.id))
       and (v.data >= current_date - 15 or exists (select 1 from free_inscricoes i where i.vaga_id = v.id and i.free_id = c.id))), '[]') end);
end $$;
grant execute on function public.free_app_dados(text) to anon, authenticated;

create or replace function public.free_app_confirmar(p_token text, p_vaga uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'free'); c free_cadastros; v free_vagas_v; n int;
begin
  select * into c from free_cadastros where id = s.free_id;
  if c.status <> 'aprovado' then raise exception 'Seu cadastro ainda está em análise.'; end if;
  perform 1 from free_vagas where id = p_vaga for update;
  select * into v from free_vagas_v where id = p_vaga;
  if v.id is null or v.status <> 'ABERTA' then raise exception 'Esta vaga não está mais disponível.'; end if;
  if free_vaga_quando(v.data, v.horario) < (now() at time zone 'America/Sao_Paulo') then raise exception 'Esta vaga já passou.'; end if;
  if v.modo = 'EXCLUSIVA' and not (c.id = any(v.preferidos)) then raise exception 'Esta vaga não está disponível para você.'; end if;
  if v.modo = 'PRIORIDADE' and not (c.id = any(v.preferidos)) and v.liberar_em is not null and now() < v.liberar_em then raise exception 'Esta vaga não está disponível para você.'; end if;
  if exists (select 1 from free_inscricoes where vaga_id = p_vaga and free_id = c.id and status = 'CONFIRMADO') then return true; end if;
  if exists (select 1 from free_inscricoes where vaga_id = p_vaga and free_id = c.id and status = 'REMOVIDO') then raise exception 'Você foi retirado desta vaga pelo supervisor.'; end if;
  select count(*) into n from free_inscricoes where vaga_id = p_vaga and status = 'CONFIRMADO';
  if n >= v.quantidade then raise exception 'Que pena, as vagas acabaram de ser preenchidas.'; end if;
  if exists (select 1 from free_inscricoes i join free_vagas_v o on o.id = i.vaga_id where i.free_id = c.id and i.status = 'CONFIRMADO'
              and o.status <> 'CANCELADA' and o.data = v.data and o.horario = v.horario) then
    raise exception 'Você já confirmou outra vaga neste mesmo dia e horário.';
  end if;
  insert into free_inscricoes (empresa_id, vaga_id, free_id, nome, telefone, data_ciente, horario_ciente)
  values (v.empresa_id, p_vaga, c.id, c.nome, coalesce(c.telefone, ''), v.data::text, v.horario);
  return true;
end $$;
grant execute on function public.free_app_confirmar(text, uuid) to anon, authenticated;

create or replace function public.free_app_cancelar(p_token text, p_vaga uuid, p_motivo text) returns boolean language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'free'); v free_vagas_v; i free_inscricoes;
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Conte o motivo do cancelamento.'; end if;
  select * into v from free_vagas_v where id = p_vaga;
  if v.id is not null and free_vaga_quando(v.data, v.horario) < (now() at time zone 'America/Sao_Paulo') then raise exception 'O horário desta vaga já passou. Fale com o líder.'; end if;
  select * into i from free_inscricoes where vaga_id = p_vaga and free_id = s.free_id and status = 'CONFIRMADO' for update;
  if i.id is null then return true; end if;
  if i.checkin_em is not null then raise exception 'Você já fez check-in nesta vaga. Fale com o líder.'; end if;
  update free_inscricoes set status = 'CANCELADO', cancelado_em = now(), motivo = left(trim(p_motivo), 300), cancelado_por = 'Free',
    cima_da_hora = v.id is not null and free_vaga_quando(v.data, v.horario) - (now() at time zone 'America/Sao_Paulo') < interval '24 hours'
  where id = i.id;
  return true;
end $$;
grant execute on function public.free_app_cancelar(text, uuid, text) to anon, authenticated;

create or replace function public.free_app_ciente(p_token text, p_vaga uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'free'); v free_vagas_v;
begin
  select * into v from free_vagas_v where id = p_vaga;
  update free_inscricoes set data_ciente = v.data::text, horario_ciente = v.horario where vaga_id = p_vaga and free_id = s.free_id and status = 'CONFIRMADO';
  if not found then raise exception 'Você não está confirmado nesta vaga.'; end if;
  return true;
end $$;
grant execute on function public.free_app_ciente(text, uuid) to anon, authenticated;

-- QR lido pelo free: check-in (com foto do uniforme) ou check-out
create or replace function public.free_app_presenca(p_token text, p_vaga uuid, p_codigo text, p_gps jsonb) returns text language plpgsql security definer set search_path=public as $$
declare s app_sessoes := app_sessao(p_token, 'free'); v free_vagas_v; i free_inscricoes; cod text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
  j int := free_janela()::int; ok boolean := false; k int; fase text; lat numeric := nullif(p_gps->>'lat', '')::numeric; lng numeric := nullif(p_gps->>'lng', '')::numeric;
  via text := case when p_gps->>'via' = 'codigo' then 'Código' else 'QR code' end;
begin
  select * into v from free_vagas_v where id = p_vaga;
  if v.id is null then raise exception 'Vaga não encontrada.'; end if;
  select * into i from free_inscricoes where vaga_id = p_vaga and free_id = s.free_id and status = 'CONFIRMADO' for update;
  if i.id is null then raise exception 'Você não está confirmado nesta vaga.'; end if;
  if length(cod) = 6 then
    for k in reverse (j + 1)..(j - 3) loop
      if free_codigo_qr(p_vaga, k) = cod then ok := true; exit; end if;
    end loop;
  end if;
  if not ok then raise exception 'Código inválido ou vencido. Leia o QR code do líder de novo.'; end if;
  fase := free_fase(v.status, v.data, v.horario, i.checkin_em, i.checkout_em);
  if i.checkin_em is null then
    if fase = 'AGUARDANDO' then raise exception 'O check-in libera 3h antes do horário de encontro (%).', v.horario; end if;
    if fase = 'CANCELADA' then raise exception 'Esta vaga foi cancelada.'; end if;
    if fase = 'FALTOU' then raise exception 'O prazo do check-in acabou. Fale com o líder.'; end if;
    if coalesce(p_gps->>'foto', '') !~ ('/operacao-fotos/' || s.pasta::text || '/') then raise exception 'Tire a foto de corpo inteiro com o uniforme para fazer o check-in.'; end if;
    update free_inscricoes set data_ciente = v.data::text, horario_ciente = v.horario, checkin_em = now(), checkin_lat = lat, checkin_lng = lng,
      checkin_distancia = app_distancia_m(v.ponto_lat, v.ponto_lng, lat, lng), checkin_via = via, foto_uniforme = p_gps->>'foto' where id = i.id;
    return 'checkin';
  elsif i.checkout_em is not null then return 'jaConcluido';
  elsif now() - i.checkin_em < interval '20 minutes' then return 'checkinRecente';
  elsif fase = 'SEM_CHECKOUT' then raise exception 'O prazo do check-out acabou. Fale com o líder.';
  else
    update free_inscricoes set checkout_em = now(), checkout_lat = lat, checkout_lng = lng, checkout_distancia = app_distancia_m(v.ponto_lat, v.ponto_lng, lat, lng) where id = i.id;
    return 'checkout';
  end if;
end $$;
grant execute on function public.free_app_presenca(text, uuid, text, jsonb) to anon, authenticated;
