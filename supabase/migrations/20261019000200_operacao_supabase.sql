-- Operação no Supabase (out/2026): sai a "planilha" do Cronograma e o motor da Vercel.
-- Etapas, pessoas e caminhões de cada etapa, agenda interna e auditoria em tabelas de verdade;
-- a criação das etapas a partir do pedido e a escala automática (Painel Logístico) rodam no banco.
-- Começa vazio de propósito (os dados da planilha eram de teste).

-- ===================== tabelas =====================
create table if not exists public.free_cadastros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  cpf text not null,
  telefone text,
  foto_url text,
  senha_hash text,
  status text not null default 'pendente' check (status in ('pendente','aprovado','bloqueado')),
  chave_pix text,
  observacao text,
  nota numeric not null default 5,
  ultimo_acesso timestamptz,
  created_at timestamptz not null default now(),
  unique (empresa_id, cpf)
);

create table if not exists public.operacao_etapas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  pedido_id uuid references public.separacoes_pedidos(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('triagem_ida','carregamento','montagem','desmontagem','descarregamento','triagem_volta','outra')),
  data date not null,
  hora time,
  data_sugerida date,
  hora_sugerida time,
  observacao text not null default '',
  origem text not null default 'pedido' check (origem in ('pedido','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  atualizado_por uuid
);
create index if not exists operacao_etapas_data_idx on public.operacao_etapas (empresa_id, data);
create index if not exists operacao_etapas_pedido_idx on public.operacao_etapas (pedido_id);

create table if not exists public.operacao_etapa_pessoas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  etapa_id uuid not null references public.operacao_etapas(id) on delete cascade,
  funcionario_id uuid references public.funcionarios_acesso(id) on delete set null,
  free_id uuid references public.free_cadastros(id) on delete set null,
  nome text not null,
  papel text not null check (papel in ('responsavel','equipe')),
  ordem int not null default 0
);
create index if not exists operacao_etapa_pessoas_etapa_idx on public.operacao_etapa_pessoas (etapa_id);
create index if not exists operacao_etapa_pessoas_func_idx on public.operacao_etapa_pessoas (funcionario_id);
create unique index if not exists operacao_etapa_um_responsavel on public.operacao_etapa_pessoas (etapa_id) where papel = 'responsavel';

create table if not exists public.operacao_etapa_caminhoes (
  etapa_id uuid not null references public.operacao_etapas(id) on delete cascade,
  caminhao_id uuid not null references public.caminhoes(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  primary key (etapa_id, caminhao_id)
);

create table if not exists public.operacao_agenda (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  data date not null,
  hora time,
  setor text not null default '',
  tipo text not null default '',
  descricao text not null default '',
  enviado_por text not null default '',
  caminhao text not null default '',
  equipe text not null default '',
  criado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists operacao_agenda_data_idx on public.operacao_agenda (empresa_id, data);

create table if not exists public.operacao_alteracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  etapa_id uuid,
  pedido_id uuid,
  descricao text not null,
  antes text,
  depois text,
  usuario_id uuid,
  usuario_nome text,
  em timestamptz not null default now()
);
create index if not exists operacao_alteracoes_em_idx on public.operacao_alteracoes (empresa_id, em);

-- ===================== segurança =====================
alter table public.free_cadastros enable row level security;
alter table public.operacao_etapas enable row level security;
alter table public.operacao_etapa_pessoas enable row level security;
alter table public.operacao_etapa_caminhoes enable row level security;
alter table public.operacao_agenda enable row level security;
alter table public.operacao_alteracoes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['operacao_etapas','operacao_etapa_pessoas','operacao_etapa_caminhoes','operacao_agenda','operacao_alteracoes'] loop
    execute format('drop policy if exists %1$s_ler on public.%1$s', t);
    execute format('create policy %1$s_ler on public.%1$s for select to authenticated using (public.funcionario_pode(empresa_id, auth.uid(), ''logistica.cronograma.visualizar'') or public.funcionario_pode(empresa_id, auth.uid(), ''logistica.planejamento.visualizar''))', t);
  end loop;
  foreach t in array array['operacao_etapas','operacao_etapa_pessoas','operacao_etapa_caminhoes'] loop
    execute format('drop policy if exists %1$s_gravar on public.%1$s', t);
    execute format('create policy %1$s_gravar on public.%1$s for all to authenticated using (public.funcionario_pode(empresa_id, auth.uid(), ''logistica.cronograma.editar'') or public.funcionario_pode(empresa_id, auth.uid(), ''logistica.planejamento.editar'')) with check (public.funcionario_pode(empresa_id, auth.uid(), ''logistica.cronograma.editar'') or public.funcionario_pode(empresa_id, auth.uid(), ''logistica.planejamento.editar''))', t);
  end loop;
end $$;

drop policy if exists operacao_agenda_gravar on public.operacao_agenda;
create policy operacao_agenda_gravar on public.operacao_agenda for all to authenticated
  using (public.funcionario_pode(empresa_id, auth.uid(), 'logistica.cronograma.agenda'))
  with check (public.funcionario_pode(empresa_id, auth.uid(), 'logistica.cronograma.agenda'));
drop policy if exists operacao_alteracoes_gravar on public.operacao_alteracoes;
create policy operacao_alteracoes_gravar on public.operacao_alteracoes for insert to authenticated
  with check (public.eh_membro_empresa(empresa_id));

-- free: equipe da empresa lê; quem cuida do RH/equipe free altera. O app do free usa funções próprias.
drop policy if exists free_cadastros_ler on public.free_cadastros;
create policy free_cadastros_ler on public.free_cadastros for select to authenticated using (public.eh_membro_empresa(empresa_id));
drop policy if exists free_cadastros_gravar on public.free_cadastros;
create policy free_cadastros_gravar on public.free_cadastros for update to authenticated
  using (public.funcionario_pode(empresa_id, auth.uid(), 'rh.colaboradores.editar') or public.funcionario_pode(empresa_id, auth.uid(), 'logistica.planejamento.editar'))
  with check (public.funcionario_pode(empresa_id, auth.uid(), 'rh.colaboradores.editar') or public.funcionario_pode(empresa_id, auth.uid(), 'logistica.planejamento.editar'));
-- senha do free nunca sai para a tela
revoke select (senha_hash) on public.free_cadastros from authenticated, anon;

-- ===================== auxiliares =====================
create or replace function public.operacao_tipo_regra(p_tipo text) returns text language sql immutable as $$
  select case when p_tipo in ('triagem_ida','triagem_volta') then 'triagem' else p_tipo end
$$;

create or replace function public.operacao_regras_escala(p_empresa uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce((select escala from empresa_logistica_regras where empresa_id = p_empresa), '{}'::jsonb)
$$;

-- Janela em que a etapa ocupa pessoas e caminhão (montagem/desmontagem contam o deslocamento)
create or replace function public.operacao_janela(p_data date, p_hora time, p_tipo text, p_regras jsonb) returns tsrange
language sql immutable as $$
  select tsrange(
    (p_data + coalesce(p_hora, time '08:00'))
      - make_interval(mins => case when p_tipo in ('montagem','desmontagem') then round(coalesce((p_regras->>'deslocamento_h')::numeric, 1) * 60)::int else 0 end),
    (p_data + coalesce(p_hora, time '08:00'))
      + make_interval(mins => round(coalesce((p_regras->'etapas'->public.operacao_tipo_regra(p_tipo)->>'duracao_h')::numeric, 3) * 60)::int)
      + make_interval(mins => case when p_tipo in ('montagem','desmontagem') then round(coalesce((p_regras->>'deslocamento_h')::numeric, 1) * 60)::int else 0 end),
    '[)')
$$;

-- m³ e peças do pedido (lista de itens × volume do cadastro)
create or replace function public.operacao_volume_pedido(p_pedido uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('m3', round(coalesce(sum(si.quantidade_solicitada * coalesce(i.volume_cubico, 0)), 0)::numeric, 2),
                            'pecas', coalesce(sum(si.quantidade_solicitada), 0))
    from separacoes_itens si left join itens i on i.id = si.item_id
   where si.separacao_pedido_id = p_pedido
     and (auth.uid() is null or exists (select 1 from separacoes_pedidos sp where sp.id = p_pedido and public.eh_membro_empresa(sp.empresa_id)))
$$;

create or replace function public.operacao_sugerido(p_tipo text, p_m3 numeric, p_regras jsonb) returns int language sql immutable as $$
  select least(coalesce((c->>'maximo')::int, 8), greatest(coalesce((c->>'minimo')::int, 1),
         ceil(coalesce(p_m3, 0) / greatest(coalesce((c->>'m3_por_pessoa')::numeric, 8), 0.5))::int))
    from (select p_regras->'etapas'->public.operacao_tipo_regra(p_tipo) c) x
$$;

-- ===================== pedido → etapas =====================
-- Mesmo que o antigo CRON_sincronizarPedidoAcervo_: status escolhido em Parâmetros cria/atualiza as etapas;
-- fora dele as etapas saem. Data/hora mudadas à mão no cronograma não são sobrescritas.
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
  h_entrega := coalesce(nullif(substr(coalesce(obs->>'horario_entrega', obs->'horarios_pedido'->>'entrega', ''), 1, 5), '')::time, padrao);
  h_coleta := coalesce(nullif(substr(coalesce(obs->>'horario_coleta', obs->'horarios_pedido'->>'coleta', ''), 1, 5), '')::time, padrao);
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

-- ===================== escala automática =====================
-- Preenche só o que está vazio (responsável, equipe, caminhão) das etapas pedidas, de hoje em diante,
-- sem pôr a mesma pessoa/caminhão em horários que se cruzam. Devolve quantas etapas mudaram.
create or replace function public.operacao_escala_preencher(p_empresa uuid, p_etapas uuid[]) returns int
language plpgsql security definer set search_path=public as $$
declare
  reg jsonb := operacao_regras_escala(p_empresa);
  et record; conf jsonb; jan tsrange; m3 numeric; precisa int; tem_resp boolean; n_eq int; mudou boolean; total int := 0;
  pessoa record; cam record; par uuid;
begin
  if reg = '{}'::jsonb then return 0; end if;
  for et in
    select e.*, operacao_janela(e.data, e.hora, e.tipo, reg) j
      from operacao_etapas e
     where e.empresa_id = p_empresa and e.id = any(p_etapas) and e.data >= current_date and e.tipo <> 'outra'
     order by e.data, e.hora nulls first
  loop
    conf := reg->'etapas'->operacao_tipo_regra(et.tipo);
    if conf is null then continue; end if;
    jan := et.j; mudou := false;
    m3 := coalesce(nullif((operacao_volume_pedido(et.pedido_id)->>'m3')::numeric, 0), (reg->>'volume_padrao_m3')::numeric, 10);
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
        insert into operacao_etapa_pessoas (empresa_id, etapa_id, funcionario_id, free_id, nome, papel, ordem)
        values (p_empresa, et.id, pessoa.id, pessoa.free_id, pessoa.nome, 'equipe', n_eq);
        n_eq := n_eq + 1; mudou := true;
      end loop;
    end if;

    if coalesce((conf->>'caminhao')::boolean, false) and not exists (select 1 from operacao_etapa_caminhoes where etapa_id = et.id) then
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
end $$;

-- Conflitos (mesma pessoa ou caminhão em horários que se cruzam) das etapas de um período
create or replace function public.operacao_conflitos(p_empresa uuid, p_inicio date, p_fim date)
returns table (etapa_id uuid, mensagem text) language sql stable security definer set search_path=public as $$
  with reg as (select operacao_regras_escala(p_empresa) r),
  e as (select o.*, operacao_janela(o.data, o.hora, o.tipo, (select r from reg)) j,
               (select numero_pedido from separacoes_pedidos s where s.id = o.pedido_id) numero
          from operacao_etapas o where o.empresa_id = p_empresa and o.data between p_inicio - 1 and p_fim + 1
           and public.eh_membro_empresa(p_empresa))
  select a.id, pa.nome || ' também está em ' || b.nome || ' do pedido ' || coalesce(b.numero, '-') || ' (' || to_char(b.hora, 'HH24:MI') || ')'
    from e a join e b on a.id <> b.id and a.j && b.j
    join operacao_etapa_pessoas pa on pa.etapa_id = a.id
    join operacao_etapa_pessoas pb on pb.etapa_id = b.id
     and ((pa.funcionario_id is not null and pa.funcionario_id = pb.funcionario_id) or (pa.free_id is not null and pa.free_id = pb.free_id))
   where a.data between p_inicio and p_fim
  union all
  select a.id, 'Caminhão ' || k.codigo || ' também está em ' || b.nome || ' do pedido ' || coalesce(b.numero, '-') || ' (' || to_char(b.hora, 'HH24:MI') || ')'
    from e a join e b on a.id <> b.id and a.j && b.j and a.pedido_id is distinct from b.pedido_id
    join operacao_etapa_caminhoes ca on ca.etapa_id = a.id
    join operacao_etapa_caminhoes cb on cb.etapa_id = b.id and cb.caminhao_id = ca.caminhao_id
    join caminhoes k on k.id = ca.caminhao_id
   where a.data between p_inicio and p_fim
$$;

-- Tela pede para preencher (botão do Painel Logístico)
create or replace function public.operacao_escala_preencher_periodo(p_empresa_id uuid, p_inicio date, p_fim date) returns int
language plpgsql security definer set search_path=public as $$
begin
  if not funcionario_pode(p_empresa_id, auth.uid(), 'logistica.planejamento.editar') then raise exception 'Sem permissão para alterar a escala'; end if;
  return operacao_escala_preencher(p_empresa_id, array(select id from operacao_etapas where empresa_id = p_empresa_id and data between p_inicio and p_fim));
end $$;

-- Gatilho: todo pedido salvo atualiza suas etapas (sem a tela precisar chamar nada)
create or replace function public.operacao_pedido_gatilho() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform operacao_sincronizar_pedido(new.id);
  return null;
end $$;
drop trigger if exists operacao_pedido_sincronizar on public.separacoes_pedidos;
create trigger operacao_pedido_sincronizar after insert or update of status_comercial, data_evento, data_evento_fim, data_entrega, data_coleta, observacoes
  on public.separacoes_pedidos for each row execute function public.operacao_pedido_gatilho();

-- itens do pedido mudaram → equipe sugerida muda, mas nada escolhido é trocado (só preenche vazio)

revoke all on function public.operacao_sincronizar_pedido(uuid) from public, anon, authenticated;
revoke all on function public.operacao_escala_preencher(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.operacao_conflitos(uuid, date, date) from public, anon;
grant execute on function public.operacao_conflitos(uuid, date, date) to authenticated;
revoke all on function public.operacao_escala_preencher_periodo(uuid, date, date) from public, anon;
grant execute on function public.operacao_escala_preencher_periodo(uuid, date, date) to authenticated;
grant execute on function public.operacao_volume_pedido(uuid) to authenticated;
