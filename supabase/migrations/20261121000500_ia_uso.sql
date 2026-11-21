-- =====================================================================
-- Uso de IA por empresa: franquia mensal + excedente pós-pago (21/11/2026)
--
-- Pedido: a mensalidade do sistema vem com um limite de IA; quem usar mais paga o excedente na próxima fatura
-- (pós-pago, a IA nunca é bloqueada). A empresa acompanha em Geral › Uso de IA: quanto usou, por agente, por usuário
-- e por decorador (o uso do catálogo conta, separado como "Decoradores").
--
-- * ia_uso: uma linha por chamada à OpenAI, gravada pelas Edge Functions (supabase/functions/_shared/ia-uso.ts), com o
--   que a própria OpenAI devolve (tokens, segundos, caracteres). O custo e os créditos são calculados aqui
--   (gatilho ia_uso_custo) pela tabela ia_precos: mudar preço = mudar a tabela, sem publicar nada.
-- * Crédito = US$ 0,01 de custo estimado da IA (1 crédito = 1 centavo de dólar).
-- * ia_planos: franquia mensal (créditos) e preço de cada crédito excedente (R$) por empresa. Só o dono do sistema
--   (acervo_donos) muda; a empresa só vê. Sem plano cadastrado, vale o padrão (2.000 créditos, R$ 0,10 por crédito).
-- * O mês é o mês civil (dia 1 a fim do mês, horário de Brasília). O que sobra não acumula.
-- =====================================================================

create table if not exists public.acervo_donos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.acervo_donos enable row level security;
revoke all on public.acervo_donos from public, anon, authenticated;
insert into public.acervo_donos (user_id) values ('02dd55da-3e30-4a96-8743-04f33b21a954') on conflict do nothing;

create or replace function public.acervo_eh_dono()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from acervo_donos where user_id = auth.uid());
$$;
revoke all on function public.acervo_eh_dono() from public, anon;
grant execute on function public.acervo_eh_dono() to authenticated;

create table if not exists public.ia_precos (
  modelo text primary key,            -- prefixo do nome do modelo (o mais comprido que bater vale)
  entrada numeric not null default 0, -- US$ por milhão de tokens de texto de entrada
  entrada_cache numeric,              -- US$ por milhão de tokens de entrada em cache (nulo = igual à entrada)
  saida numeric not null default 0,   -- US$ por milhão de tokens de texto de saída
  audio_entrada numeric not null default 0,
  audio_saida numeric not null default 0,
  imagem_entrada numeric not null default 0,
  imagem_saida numeric not null default 0,
  por_minuto numeric not null default 0,         -- US$ por minuto (quando só se sabe a duração)
  por_mil_caracteres numeric not null default 0, -- US$ por 1.000 caracteres (voz gerada)
  observacao text,
  atualizado_em timestamptz not null default now()
);
alter table public.ia_precos enable row level security;
revoke all on public.ia_precos from public, anon, authenticated;

-- Preços de tabela da OpenAI (estimativa, US$). Ajustáveis aqui sem publicar nada.
insert into public.ia_precos (modelo, entrada, entrada_cache, saida, audio_entrada, audio_saida, imagem_entrada, imagem_saida, por_minuto, por_mil_caracteres, observacao) values
  ('gpt-4.1',                   2.00, 0.50,  8.00,  0,     0,     0,     0,     0,     0,     'Conversas dos agentes'),
  ('gpt-4.1-mini',              0.40, 0.10,  1.60,  0,     0,     0,     0,     0,     0,     'Tarefas curtas'),
  ('gpt-4.1-nano',              0.10, 0.025, 0.40,  0,     0,     0,     0,     0,     0,     null),
  ('gpt-4o',                    2.50, 1.25, 10.00,  0,     0,     0,     0,     0,     0,     null),
  ('gpt-4o-mini',               0.15, 0.075, 0.60,  0,     0,     0,     0,     0,     0,     null),
  ('gpt-5',                     1.25, 0.125, 10.00, 0,     0,     0,     0,     0,     0,     null),
  ('gpt-5-mini',                0.25, 0.025, 2.00,  0,     0,     0,     0,     0,     0,     null),
  ('gpt-4o-transcribe',         2.50, null, 10.00,  6.00,  0,     0,     0,     0.006, 0,     'Áudio para texto'),
  ('gpt-4o-transcribe-diarize', 2.50, null, 10.00,  6.00,  0,     0,     0,     0.006, 0,     'Reuniões (separa as vozes)'),
  ('gpt-4o-mini-transcribe',    1.25, null,  5.00,  3.00,  0,     0,     0,     0.003, 0,     null),
  ('whisper-1',                 0,    null,  0,     0,     0,     0,     0,     0.006, 0,     'Áudio para texto (por minuto)'),
  ('gpt-4o-mini-tts',           0.60, null,  0,     0,    12.00,  0,     0,     0,     0.015, 'Voz da Helena'),
  ('gpt-image',                 5.00, 1.25,  0,     0,     0,    10.00, 40.00,  0,     0,     'Renderização 3D e tecido'),
  ('gpt-realtime',              4.00, 0.40, 16.00, 32.00, 64.00,  5.00,  0,     0.30,  0,     'Ligação com a Helena (por minuto, estimativa)'),
  ('text-embedding',            0.02, null,  0,     0,     0,     0,     0,     0,     0,     null)
on conflict (modelo) do nothing;

create table if not exists public.ia_planos (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  franquia_creditos numeric not null default 2000 check (franquia_creditos >= 0),
  valor_credito_excedente numeric not null default 0.10 check (valor_credito_excedente >= 0),
  aviso_percentuais int[] not null default '{80,100}',
  observacao text,
  atualizado_por uuid,
  atualizado_em timestamptz not null default now()
);
alter table public.ia_planos enable row level security;
revoke all on public.ia_planos from public, anon, authenticated;

create table if not exists public.ia_uso (
  id bigserial primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  criado_em timestamptz not null default now(),
  origem text not null,               -- agente/recurso: helena, clara, miguel, carla, marcos, ideia, reunioes, studio3d, ...
  acao text,                          -- conversar, transcrever, renderizar, ligacao...
  usuario_id uuid,                    -- equipe (login do sistema)
  cliente_id uuid,                    -- decorador (catálogo)
  modelo text,
  endpoint text,
  tokens_entrada int not null default 0,
  tokens_cache int not null default 0,
  tokens_saida int not null default 0,
  tokens_audio_entrada int not null default 0,
  tokens_audio_saida int not null default 0,
  tokens_imagem_entrada int not null default 0,
  tokens_imagem_saida int not null default 0,
  segundos numeric not null default 0,
  caracteres int not null default 0,
  custo_usd numeric not null default 0,
  creditos numeric not null default 0
);
create index if not exists ia_uso_empresa_data on public.ia_uso (empresa_id, criado_em desc);
alter table public.ia_uso enable row level security;
revoke all on public.ia_uso from public, anon, authenticated;

create or replace function public.ia_uso_custo()
returns trigger language plpgsql security definer set search_path = public as $$
declare p ia_precos; texto_entrada numeric; custo numeric := 0;
begin
  select * into p from ia_precos where lower(coalesce(new.modelo, '')) like lower(modelo) || '%' order by length(modelo) desc limit 1;
  if found then
    texto_entrada := greatest(new.tokens_entrada - new.tokens_cache, 0);
    custo := texto_entrada * p.entrada / 1e6
           + new.tokens_cache * coalesce(p.entrada_cache, p.entrada) / 1e6
           + new.tokens_saida * p.saida / 1e6
           + new.tokens_audio_entrada * p.audio_entrada / 1e6
           + new.tokens_audio_saida * p.audio_saida / 1e6
           + new.tokens_imagem_entrada * p.imagem_entrada / 1e6
           + new.tokens_imagem_saida * p.imagem_saida / 1e6
           + new.caracteres * p.por_mil_caracteres / 1000;
    -- Só a duração conhecida (whisper, ligação): cobra por minuto quando não veio nenhum token.
    if new.segundos > 0 and new.tokens_entrada + new.tokens_saida + new.tokens_audio_entrada + new.tokens_audio_saida = 0 then
      custo := custo + new.segundos / 60.0 * p.por_minuto;
    end if;
  end if;
  new.custo_usd := round(custo, 6);
  new.creditos := round(custo * 100, 4);
  return new;
end $$;
drop trigger if exists ia_uso_custo on public.ia_uso;
create trigger ia_uso_custo before insert on public.ia_uso for each row execute function public.ia_uso_custo();

-- Plano da empresa (com o padrão quando não há linha).
create or replace function public.ia_plano_de(p_empresa uuid)
returns table (franquia numeric, valor_excedente numeric, avisos int[], tem_plano boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(p.franquia_creditos, 2000), coalesce(p.valor_credito_excedente, 0.10), coalesce(p.aviso_percentuais, '{80,100}'), p.empresa_id is not null
  from (select 1) x left join ia_planos p on p.empresa_id = p_empresa;
$$;
revoke all on function public.ia_plano_de(uuid) from public, anon, authenticated;

-- Quem pode ver o painel: o dono do sistema, administradores e quem tem gestao.ia_uso.visualizar.
insert into public.permissoes_catalogo (chave, modulo, submodulo, acao, descricao, sensivel, ordem) values
  ('gestao.ia_uso.visualizar', 'Geral', 'Uso de IA', 'visualizar', 'Uso de IA: ver o consumo de créditos, por agente e por pessoa', false, 20)
on conflict (chave) do nothing;

create or replace function public.ia_uso_pode(p_empresa uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if acervo_eh_dono() then return true; end if;
  if not exists (select 1 from usuarios_empresas where user_id = auth.uid() and empresa_id = p_empresa) then return false; end if;
  return coalesce(funcionario_pode(p_empresa, auth.uid(), 'gestao.ia_uso.visualizar'), false);
end $$;
revoke all on function public.ia_uso_pode(uuid) from public, anon;

-- Painel: o mês escolhido (p_mes = qualquer dia do mês; nulo = mês atual) com tudo que a tela mostra.
create or replace function public.ia_uso_painel(p_empresa uuid, p_mes date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  ini date := date_trunc('month', coalesce(p_mes, hoje))::date;
  fim date := (date_trunc('month', coalesce(p_mes, hoje)) + interval '1 month')::date;
  pl record; usado numeric; dias_mes int; dias_passados numeric; r jsonb; dono boolean := acervo_eh_dono();
begin
  if not ia_uso_pode(p_empresa) then raise exception 'Sem permissão para ver o uso de IA.'; end if;
  select * into pl from ia_plano_de(p_empresa);
  select coalesce(sum(creditos), 0) into usado from ia_uso
   where empresa_id = p_empresa and criado_em >= (ini::timestamp at time zone 'America/Sao_Paulo') and criado_em < (fim::timestamp at time zone 'America/Sao_Paulo');
  dias_mes := fim - ini;
  dias_passados := case when hoje >= fim then dias_mes when hoje < ini then 0
                        else extract(epoch from (now() - (ini::timestamp at time zone 'America/Sao_Paulo'))) / 86400 end;

  with u as (
    select * from ia_uso where empresa_id = p_empresa
      and criado_em >= (ini::timestamp at time zone 'America/Sao_Paulo') and criado_em < (fim::timestamp at time zone 'America/Sao_Paulo')
  ), pessoas as (
    select u.usuario_id, u.cliente_id, sum(u.creditos) c, count(*) n, max(u.criado_em) ultimo from u group by 1, 2
  )
  select jsonb_build_object(
    'mes', ini, 'fim', fim - 1, 'hoje', hoje, 'dias_mes', dias_mes, 'dias_passados', round(dias_passados, 2),
    'franquia', pl.franquia, 'valor_excedente', pl.valor_excedente, 'tem_plano', pl.tem_plano, 'avisos', to_jsonb(pl.avisos),
    'usado', round(usado, 2), 'restante', round(greatest(pl.franquia - usado, 0), 2),
    'excedente', round(greatest(usado - pl.franquia, 0), 2),
    'valor_excedente_total', round(greatest(usado - pl.franquia, 0) * pl.valor_excedente, 2),
    'projecao', case when dias_passados > 0.5 and hoje < fim and hoje >= ini then round(usado / dias_passados * dias_mes, 2) else round(usado, 2) end,
    'chamadas', (select count(*) from u),
    'eh_dono', dono,
    'custo_usd', case when dono then (select round(coalesce(sum(custo_usd), 0), 4) from u) end,
    'por_origem', coalesce((select jsonb_agg(jsonb_build_object('origem', origem, 'creditos', round(c, 2), 'chamadas', n,
        'equipe', round(ce, 2), 'decoradores', round(cd, 2)) order by c desc)
      from (select origem, sum(creditos) c, count(*) n, sum(creditos) filter (where cliente_id is null) ce, sum(creditos) filter (where cliente_id is not null) cd from u group by origem) x), '[]'),
    'por_pessoa', coalesce((select jsonb_agg(jsonb_build_object(
        'usuario_id', p.usuario_id, 'cliente_id', p.cliente_id, 'creditos', round(p.c, 2), 'chamadas', p.n, 'ultimo', p.ultimo,
        'tipo', case when p.cliente_id is not null then 'decorador' when p.usuario_id is not null then 'equipe' else 'sistema' end,
        'nome', coalesce(ce.nome_razao, fa.nome, us.nome, case when p.cliente_id is null and p.usuario_id is null then 'Sistema (automático)' end, 'Sem nome'),
        'foto', coalesce(ce.catalogo_logo_url, fa.foto_url),
        'origens', (select jsonb_object_agg(origem, round(s, 2)) from (select origem, sum(creditos) s from u
                    where u.usuario_id is not distinct from p.usuario_id and u.cliente_id is not distinct from p.cliente_id group by origem) o)
      ) order by p.c desc)
      from pessoas p
      left join clientes_empresas ce on ce.id = p.cliente_id
      left join funcionarios_acesso fa on fa.id = p.usuario_id and p.cliente_id is null
      left join usuarios us on us.id = p.usuario_id and p.cliente_id is null), '[]'),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', d, 'creditos', round(c, 2), 'equipe', round(ce, 2), 'decoradores', round(cd, 2)) order by d)
      from (select (criado_em at time zone 'America/Sao_Paulo')::date d, sum(creditos) c,
                   sum(creditos) filter (where cliente_id is null) ce, sum(creditos) filter (where cliente_id is not null) cd
            from u group by 1) x), '[]'),
    'historico', coalesce((select jsonb_agg(jsonb_build_object('mes', m, 'usado', round(c, 2),
        'excedente', round(greatest(c - pl.franquia, 0), 2), 'valor', round(greatest(c - pl.franquia, 0) * pl.valor_excedente, 2)) order by m desc)
      from (select date_trunc('month', criado_em at time zone 'America/Sao_Paulo')::date m, sum(creditos) c from ia_uso
            where empresa_id = p_empresa and criado_em >= ((ini - interval '11 months')::timestamp at time zone 'America/Sao_Paulo')
            group by 1) h), '[]'),
    'recentes', coalesce((select jsonb_agg(x order by x->>'criado_em' desc) from (
        select jsonb_build_object('criado_em', u.criado_em, 'origem', u.origem, 'acao', u.acao, 'creditos', round(u.creditos, 3),
          'nome', coalesce(ce.nome_razao, fa.nome, us.nome, 'Sistema'), 'decorador', u.cliente_id is not null) x
        from u left join clientes_empresas ce on ce.id = u.cliente_id
               left join funcionarios_acesso fa on fa.id = u.usuario_id and u.cliente_id is null
               left join usuarios us on us.id = u.usuario_id and u.cliente_id is null
        order by u.criado_em desc limit 40) z), '[]')
  ) into r;
  return r;
end $$;
revoke all on function public.ia_uso_painel(uuid, date) from public, anon;
grant execute on function public.ia_uso_painel(uuid, date) to authenticated;

-- Só o dono do sistema muda a franquia e o preço do excedente.
create or replace function public.ia_plano_salvar(p_empresa uuid, p_franquia numeric, p_valor numeric, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not acervo_eh_dono() then raise exception 'Só o responsável pelo sistema muda a franquia de IA.'; end if;
  if p_franquia is null or p_franquia < 0 or p_valor is null or p_valor < 0 then raise exception 'Informe a franquia e o valor do excedente.'; end if;
  insert into ia_planos (empresa_id, franquia_creditos, valor_credito_excedente, observacao, atualizado_por, atualizado_em)
  values (p_empresa, p_franquia, p_valor, nullif(trim(coalesce(p_obs, '')), ''), auth.uid(), now())
  on conflict (empresa_id) do update set franquia_creditos = excluded.franquia_creditos, valor_credito_excedente = excluded.valor_credito_excedente,
    observacao = excluded.observacao, atualizado_por = auth.uid(), atualizado_em = now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.ia_plano_salvar(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.ia_plano_salvar(uuid, numeric, numeric, text) to authenticated;

-- Aviso no celular para quem acompanha o uso, ao passar de cada percentual da franquia (uma vez por mês).
do $$
declare def text;
begin
  def := pg_get_functiondef('public.app_notif_catalogo()'::regprocedure);
  if position('ia_franquia' in def) = 0 then
    def := replace(def, '  (''teste'',', '  (''ia_franquia'',         ''Sistema'',    1, ''Uso de IA da franquia'',             ''Quando o uso de IA do mês passa de 80% e de 100% da franquia (o excedente vai na próxima fatura).'', true, ''gestao.ia_uso.visualizar''),' || chr(10) || '  (''teste'',');
    execute def;
  end if;
end $$;

create or replace function public.ia_uso_aviso()
returns trigger language plpgsql security definer set search_path = public as $$
declare pl record; ini timestamptz; antes numeric; depois numeric; pct int; mes text;
begin
  select * into pl from ia_plano_de(new.empresa_id);
  if pl.franquia <= 0 then return null; end if;
  ini := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  select coalesce(sum(creditos), 0) into depois from ia_uso where empresa_id = new.empresa_id and criado_em >= ini;
  antes := depois - new.creditos;
  mes := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  foreach pct in array pl.avisos loop
    if antes < pl.franquia * pct / 100.0 and depois >= pl.franquia * pct / 100.0 then
      perform app_notif_grupo(new.empresa_id, 'gestao.ia_uso.visualizar', 'ia_franquia',
        case when pct >= 100 then 'A franquia de IA do mês acabou' else 'Uso de IA em ' || pct || '% da franquia' end,
        case when pct >= 100 then 'A IA continua funcionando; o que passar da franquia vai na próxima fatura.'
             else 'Já foram usados ' || round(depois) || ' de ' || round(pl.franquia) || ' créditos deste mês.' end,
        'Modulos/Geral/UsoIA/uso-ia.html', 'ia_franquia:' || mes || ':' || pct);
    end if;
  end loop;
  return null;
exception when others then
  raise warning 'ia_uso_aviso: %', sqlerrm;
  return null;
end $$;
drop trigger if exists ia_uso_aviso on public.ia_uso;
create trigger ia_uso_aviso after insert on public.ia_uso for each row execute function public.ia_uso_aviso();
