-- Pós-venda do Comercial (out/2026, no banco; o Feedback Pós-Evento da planilha não é mais usado e começa vazio).
-- Pedido com a Posição final confirmada pelo Financeiro vira uma ligação pendente para o cliente do pedido.
-- Regras em Parâmetros > Comercial (posvenda_config.config):
--   intervalo_dias        — só liga de novo para o mesmo cliente depois de N dias do último contato;
--   novo_ate_pedidos      — cliente com até N pedidos é "novo": liga logo, sem esperar o intervalo;
--   dias_apos_posicao     — a ligação aparece N dias depois da Posição final;
--   prazo_dias            — passa N dias disponível sem ligar → atrasada;
--   tentar_dias / max_tentativas — não atendeu: tenta de novo em N dias, até M tentativas (depois "sem contato");
--   agrupar               — true: uma ligação cobre todos os eventos do cliente desde o último contato;
--   perguntas             — formulário de múltipla escolha [{id, texto, tipo unica|multipla, obrigatoria, opcoes:[{id, texto, ruim}]}];
--   observacao            — campo livre opcional no fim.
-- Resposta com alguma opção marcada como "ruim" deixa o contato em "Precisa de atenção".

create table if not exists public.posvenda_config (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  config jsonb not null default '{}',
  atualizado_em timestamptz not null default now()
);

create table if not exists public.posvenda_contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_chave text not null,
  cliente_id uuid,
  cliente_nome text,
  telefone text,
  novo boolean not null default false,
  status text not null default 'pendente' check (status in ('pendente', 'concluido', 'sem_contato', 'dispensado')),
  disponivel_em date not null,
  prazo date,
  tentativas int not null default 0,
  ultima_tentativa_em timestamptz,
  tentativas_log jsonb not null default '[]',
  respostas jsonb,
  observacao text,
  atencao boolean not null default false,
  motivo text,
  feito_por uuid,
  feito_por_nome text,
  concluido_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists posvenda_contatos_emp on public.posvenda_contatos (empresa_id, status, disponivel_em);
create index if not exists posvenda_contatos_cli on public.posvenda_contatos (empresa_id, cliente_chave, concluido_em);

create table if not exists public.posvenda_contato_pedidos (
  contato_id uuid not null references public.posvenda_contatos(id) on delete cascade,
  pedido_id uuid not null references public.separacoes_pedidos(id) on delete cascade,
  primary key (pedido_id)
);

alter table public.posvenda_config enable row level security;
alter table public.posvenda_contatos enable row level security;
alter table public.posvenda_contato_pedidos enable row level security;
drop policy if exists posvenda_config_ler on public.posvenda_config;
create policy posvenda_config_ler on public.posvenda_config for select to authenticated using (public.eh_membro_empresa(empresa_id));
drop policy if exists posvenda_contatos_ler on public.posvenda_contatos;
create policy posvenda_contatos_ler on public.posvenda_contatos for select to authenticated using (public.operacao_pode(empresa_id, 'comercial.pedidos.visualizar'));
drop policy if exists posvenda_contato_pedidos_ler on public.posvenda_contato_pedidos;
create policy posvenda_contato_pedidos_ler on public.posvenda_contato_pedidos for select to authenticated
  using (exists (select 1 from public.posvenda_contatos c where c.id = contato_id and public.operacao_pode(c.empresa_id, 'comercial.pedidos.visualizar')));
do $$ declare t text; begin
  foreach t in array array['posvenda_config', 'posvenda_contatos', 'posvenda_contato_pedidos'] loop
    execute format('drop policy if exists seguranca_2fa on public.%I', t);
    execute format('create policy seguranca_2fa on public.%I as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- configuração (padrão + o que a empresa salvou)
create or replace function public.posvenda_padrao() returns jsonb language sql immutable as $$
  select '{
    "intervalo_dias": 15, "novo_ate_pedidos": 1, "dias_apos_posicao": 1, "prazo_dias": 5,
    "tentar_dias": 2, "max_tentativas": 3, "agrupar": true, "observacao": true,
    "perguntas": [
      {"id": "atendimento", "texto": "Como foi o atendimento comercial?", "tipo": "unica", "obrigatoria": true,
       "opcoes": [{"id": "a1", "texto": "Excelente"}, {"id": "a2", "texto": "Bom"}, {"id": "a3", "texto": "Regular"}, {"id": "a4", "texto": "Ruim", "ruim": true}]},
      {"id": "entrega", "texto": "Entrega e montagem", "tipo": "unica", "obrigatoria": true,
       "opcoes": [{"id": "e1", "texto": "No horário e tudo certo"}, {"id": "e2", "texto": "Pequenos atrasos ou ajustes"}, {"id": "e3", "texto": "Teve problema", "ruim": true}]},
      {"id": "moveis", "texto": "Estado dos móveis", "tipo": "unica", "obrigatoria": true,
       "opcoes": [{"id": "m1", "texto": "Impecáveis"}, {"id": "m2", "texto": "Algum detalhe"}, {"id": "m3", "texto": "Chegou com avaria ou sujo", "ruim": true}]},
      {"id": "coleta", "texto": "Coleta", "tipo": "unica", "obrigatoria": true,
       "opcoes": [{"id": "c1", "texto": "Tudo certo"}, {"id": "c2", "texto": "Atrasou ou teve problema", "ruim": true}, {"id": "c3", "texto": "Não se aplica"}]},
      {"id": "gostou", "texto": "O que mais gostou?", "tipo": "multipla", "obrigatoria": false,
       "opcoes": [{"id": "g1", "texto": "Atendimento"}, {"id": "g2", "texto": "Variedade do acervo"}, {"id": "g3", "texto": "Qualidade dos móveis"}, {"id": "g4", "texto": "Pontualidade"}, {"id": "g5", "texto": "Equipe de montagem"}]},
      {"id": "indicaria", "texto": "Indicaria a Chiavari?", "tipo": "unica", "obrigatoria": true,
       "opcoes": [{"id": "i1", "texto": "Com certeza"}, {"id": "i2", "texto": "Talvez"}, {"id": "i3", "texto": "Não", "ruim": true}]},
      {"id": "retorno", "texto": "Quer que alguém retorne o contato?", "tipo": "unica", "obrigatoria": true,
       "opcoes": [{"id": "r1", "texto": "Não"}, {"id": "r2", "texto": "Sim", "ruim": true}]}
    ]}'::jsonb
$$;

create or replace function public.posvenda_cfg(p_empresa uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select posvenda_padrao() || coalesce((select config from posvenda_config where empresa_id = p_empresa), '{}')
$$;
grant execute on function public.posvenda_cfg(uuid) to authenticated;

create or replace function public.posvenda_config_salvar(p_empresa uuid, p_config jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb := coalesce(p_config, '{}'); q jsonb; o jsonb; ids text[] := '{}';
begin
  if not operacao_pode(p_empresa, 'configuracoes.empresa.editar') then raise exception 'Sem permissão para editar os parâmetros.'; end if;
  if (c->>'intervalo_dias')::int not between 0 and 365 then raise exception 'Intervalo entre contatos: de 0 a 365 dias.'; end if;
  if (c->>'novo_ate_pedidos')::int not between 0 and 50 then raise exception 'Cliente novo: de 0 a 50 pedidos.'; end if;
  if (c->>'dias_apos_posicao')::int not between 0 and 60 or (c->>'prazo_dias')::int not between 1 and 60 then raise exception 'Prazos inválidos.'; end if;
  if (c->>'tentar_dias')::int not between 0 and 30 or (c->>'max_tentativas')::int not between 1 and 10 then raise exception 'Tentativas inválidas.'; end if;
  if jsonb_typeof(c->'perguntas') <> 'array' or jsonb_array_length(c->'perguntas') = 0 then raise exception 'O formulário precisa de pelo menos uma pergunta.'; end if;
  for q in select x from jsonb_array_elements(c->'perguntas') x loop
    if length(btrim(coalesce(q->>'texto', ''))) < 2 then raise exception 'Toda pergunta precisa de texto.'; end if;
    if coalesce(q->>'tipo', '') not in ('unica', 'multipla') then raise exception 'Tipo de pergunta inválido.'; end if;
    if jsonb_typeof(q->'opcoes') <> 'array' or jsonb_array_length(q->'opcoes') < 2 then raise exception 'A pergunta "%" precisa de pelo menos duas opções.', q->>'texto'; end if;
    if coalesce(q->>'id', '') = '' or q->>'id' = any(ids) then raise exception 'Pergunta sem identificador.'; end if;
    ids := ids || (q->>'id');
    for o in select x from jsonb_array_elements(q->'opcoes') x loop
      if length(btrim(coalesce(o->>'texto', ''))) < 1 or coalesce(o->>'id', '') = '' then raise exception 'Opção vazia na pergunta "%".', q->>'texto'; end if;
    end loop;
  end loop;
  insert into posvenda_config (empresa_id, config) values (p_empresa, c)
  on conflict (empresa_id) do update set config = excluded.config, atualizado_em = now();
  return posvenda_cfg(p_empresa);
end $$;
grant execute on function public.posvenda_config_salvar(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- gera as ligações a partir das Posições finais
create or replace function public.posvenda_gerar(p_empresa uuid) returns void language plpgsql security definer set search_path = public as $$
declare cfg jsonb := posvenda_cfg(p_empresa); r record; ult date; npedidos int; v_novo boolean; disp date; aberto posvenda_contatos; id_ uuid; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform pg_advisory_xact_lock(hashtextextended('posvenda:' || p_empresa::text, 0));
  for r in
    select p.id, p.cliente_id, p.cliente_nome, coalesce(p.cliente_id::text, lower(btrim(coalesce(p.cliente_nome, '')))) chave,
           (f.confirmado_em at time zone 'America/Sao_Paulo')::date confirmado, f.confirmado_em confirmado_ts,
           coalesce((select c.telefone from clientes_empresas c where c.id = p.cliente_id), p.contato_cliente) fone
      from separacoes_pedidos p join fin_posicoes_finais f on f.pedido_id = p.id
     where p.empresa_id = p_empresa and f.status = 'confirmado' and f.confirmado_em is not null
       and coalesce(p.status_comercial, '') <> 'cancelado' and coalesce(p.cliente_nome, '') <> ''
       and not exists (select 1 from posvenda_contato_pedidos cp where cp.pedido_id = p.id)
     order by f.confirmado_em
  loop
    select count(*) into npedidos from separacoes_pedidos p2 join fin_posicoes_finais f2 on f2.pedido_id = p2.id and f2.status = 'confirmado'
     where p2.empresa_id = p_empresa and coalesce(p2.cliente_id::text, lower(btrim(coalesce(p2.cliente_nome, '')))) = r.chave and f2.confirmado_em <= r.confirmado_ts;
    v_novo := npedidos <= coalesce((cfg->>'novo_ate_pedidos')::int, 1);
    select max(coalesce(concluido_em::date, ultima_tentativa_em::date)) into ult from posvenda_contatos
     where empresa_id = p_empresa and cliente_chave = r.chave and status in ('concluido', 'sem_contato');
    disp := r.confirmado + coalesce((cfg->>'dias_apos_posicao')::int, 1);
    if not v_novo and ult is not null then disp := greatest(disp, ult + coalesce((cfg->>'intervalo_dias')::int, 15)); end if;
    aberto := null;
    if coalesce((cfg->>'agrupar')::boolean, true) then
      select * into aberto from posvenda_contatos where empresa_id = p_empresa and cliente_chave = r.chave and status = 'pendente' order by disponivel_em limit 1;
    end if;
    if aberto.id is not null then
      insert into posvenda_contato_pedidos (contato_id, pedido_id) values (aberto.id, r.id);
      update posvenda_contatos set telefone = coalesce(r.fone, telefone), novo = v_novo or posvenda_contatos.novo where id = aberto.id;
    else
      -- uma ligação por evento: cada nova respeita o intervalo a partir da última ligação pendente do cliente
      if not coalesce((cfg->>'agrupar')::boolean, true) and not v_novo then
        select greatest(disp, max(disponivel_em) + coalesce((cfg->>'intervalo_dias')::int, 15)) into disp
          from posvenda_contatos where empresa_id = p_empresa and cliente_chave = r.chave and status = 'pendente' having count(*) > 0;
        disp := coalesce(disp, r.confirmado + coalesce((cfg->>'dias_apos_posicao')::int, 1));
      end if;
      insert into posvenda_contatos (empresa_id, cliente_chave, cliente_id, cliente_nome, telefone, novo, disponivel_em, prazo)
      values (p_empresa, r.chave, r.cliente_id, r.cliente_nome, r.fone, v_novo, greatest(disp, hoje), greatest(disp, hoje) + coalesce((cfg->>'prazo_dias')::int, 5))
      returning id into id_;
      insert into posvenda_contato_pedidos (contato_id, pedido_id) values (id_, r.id);
    end if;
  end loop;
end $$;
revoke all on function public.posvenda_gerar(uuid) from public, anon, authenticated;

create or replace function public.posvenda_contato_json(c posvenda_contatos) returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(c) - 'cliente_chave' || jsonb_build_object(
    'foto', (select e.catalogo_logo_url from clientes_empresas e where e.id = c.cliente_id),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'numero', p.numero_pedido, 'data_evento', p.data_evento, 'tipo', p.tipo_evento,
                  'local', p.local_nome, 'valor', p.valor_total) order by p.data_evento) from posvenda_contato_pedidos cp join separacoes_pedidos p on p.id = cp.pedido_id
                where cp.contato_id = c.id), '[]'),
    'ultimo_contato', (select max(x.concluido_em) from posvenda_contatos x where x.empresa_id = c.empresa_id and x.cliente_chave = c.cliente_chave and x.status = 'concluido' and x.id <> c.id))
$$;
revoke all on function public.posvenda_contato_json(posvenda_contatos) from public, anon, authenticated;

create or replace function public.posvenda_lista(p_empresa uuid) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'comercial.pedidos.visualizar') then raise exception 'Sem permissão.'; end if;
  perform posvenda_gerar(p_empresa);
  return jsonb_build_object('config', posvenda_cfg(p_empresa), 'hoje', (now() at time zone 'America/Sao_Paulo')::date,
    'contatos', coalesce((select jsonb_agg(posvenda_contato_json(c) order by c.disponivel_em, c.created_at) from posvenda_contatos c
       where c.empresa_id = p_empresa and (c.status = 'pendente' or coalesce(c.concluido_em, c.ultima_tentativa_em, c.created_at) > now() - interval '120 days')), '[]'));
end $$;
grant execute on function public.posvenda_lista(uuid) to authenticated;

-- registra a ligação: concluir (com o formulário), não atendeu (agenda nova tentativa) ou dispensar (com motivo)
create or replace function public.posvenda_registrar(p_empresa uuid, p_contato uuid, p_acao text, p_respostas jsonb default null, p_observacao text default null, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c posvenda_contatos; cfg jsonb := posvenda_cfg(p_empresa); q jsonb; resp jsonb; marcadas jsonb; ruim boolean := false; quem text := logistica_nome_usuario(p_empresa);
begin
  if not operacao_pode(p_empresa, 'comercial.pedidos.visualizar') then raise exception 'Sem permissão.'; end if;
  select * into c from posvenda_contatos where id = p_contato and empresa_id = p_empresa for update;
  if c.id is null then raise exception 'Ligação não encontrada.'; end if;
  if c.status <> 'pendente' then raise exception 'Esta ligação já foi registrada.'; end if;
  if p_acao = 'concluir' then
    resp := '[]';
    for q in select x from jsonb_array_elements(cfg->'perguntas') x loop
      marcadas := coalesce(p_respostas->(q->>'id'), '[]');
      if jsonb_typeof(marcadas) = 'string' then marcadas := jsonb_build_array(marcadas); end if;
      marcadas := coalesce((select jsonb_agg(o) from jsonb_array_elements(q->'opcoes') o where (o->>'id') in (select jsonb_array_elements_text(marcadas))), '[]');
      if coalesce((q->>'obrigatoria')::boolean, false) and jsonb_array_length(marcadas) = 0 then raise exception 'Responda: %', q->>'texto'; end if;
      if q->>'tipo' = 'unica' and jsonb_array_length(marcadas) > 1 then raise exception 'Escolha só uma opção em: %', q->>'texto'; end if;
      if exists (select 1 from jsonb_array_elements(marcadas) o where coalesce((o->>'ruim')::boolean, false)) then ruim := true; end if;
      resp := resp || jsonb_build_array(jsonb_build_object('id', q->>'id', 'pergunta', q->>'texto', 'respostas', (select coalesce(jsonb_agg(o->>'texto'), '[]') from jsonb_array_elements(marcadas) o),
               'ruim', exists (select 1 from jsonb_array_elements(marcadas) o where coalesce((o->>'ruim')::boolean, false))));
    end loop;
    update posvenda_contatos set status = 'concluido', respostas = resp, observacao = nullif(btrim(coalesce(p_observacao, '')), ''), atencao = ruim,
           tentativas = tentativas + 1, ultima_tentativa_em = now(), concluido_em = now(), feito_por = auth.uid(), feito_por_nome = quem,
           tentativas_log = tentativas_log || jsonb_build_array(jsonb_build_object('em', now(), 'por', quem, 'resultado', 'atendeu'))
     where id = c.id returning * into c;
  elsif p_acao = 'nao_atendeu' then
    update posvenda_contatos set tentativas = tentativas + 1, ultima_tentativa_em = now(), feito_por_nome = quem,
           tentativas_log = tentativas_log || jsonb_build_array(jsonb_build_object('em', now(), 'por', quem, 'resultado', 'nao_atendeu')),
           status = case when tentativas + 1 >= coalesce((cfg->>'max_tentativas')::int, 3) then 'sem_contato' else 'pendente' end,
           disponivel_em = (now() at time zone 'America/Sao_Paulo')::date + coalesce((cfg->>'tentar_dias')::int, 2),
           prazo = (now() at time zone 'America/Sao_Paulo')::date + coalesce((cfg->>'tentar_dias')::int, 2) + coalesce((cfg->>'prazo_dias')::int, 5)
     where id = c.id returning * into c;
  elsif p_acao = 'dispensar' then
    if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Informe o motivo para não ligar.'; end if;
    update posvenda_contatos set status = 'dispensado', motivo = btrim(p_motivo), concluido_em = now(), feito_por = auth.uid(), feito_por_nome = quem where id = c.id returning * into c;
  else raise exception 'Ação inválida.'; end if;
  return posvenda_contato_json(c);
end $$;
grant execute on function public.posvenda_registrar(uuid, uuid, text, jsonb, text, text) to authenticated;
