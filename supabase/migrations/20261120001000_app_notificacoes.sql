-- Notificações do app (20/11/2026): o que cada pessoa quer receber, horário de silêncio, caixa de avisos no app
-- e os avisos automáticos do sistema (operação, comercial, financeiro, estoque, compras, pessoas).
-- Como funciona:
--  * Todo aviso entra em app_push_fila com um "tipo" (ex.: escala, pagamento_recebido). O gatilho app_notif_filtrar
--    (antes de gravar) descarta o tipo que a pessoa desligou e, no horário de silêncio, segura o envio até o fim dele
--    (enviar_apos; a Edge Function app-push só manda o que já passou do horário). A linha continua sendo a "caixa de
--    avisos" do app (lida_em), mesmo para quem não tem celular com notificação ligada.
--  * O catálogo dos tipos (nome, grupo, explicação, padrão e quem pode receber) é app_notif_catalogo(): tipo novo =
--    uma linha lá + quem dispara.
--  * Destinatários "por permissão" seguem funcionario_pode (o administrador recebe tudo o que liga).
begin;

alter table public.app_push_fila add column if not exists tipo text;
alter table public.app_push_fila add column if not exists lida_em timestamptz;
alter table public.app_push_fila add column if not exists enviar_apos timestamptz;
create index if not exists app_push_fila_caixa on public.app_push_fila (user_id, empresa_id, criado_em desc);

create table if not exists public.app_notif_prefs (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null,
  tipos jsonb not null default '{}'::jsonb,   -- {tipo: true|false}; ausente = padrão do catálogo
  silencio boolean not null default false,
  silencio_inicio time not null default '22:00',
  silencio_fim time not null default '07:00',
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, user_id)
);
alter table public.app_notif_prefs enable row level security;
revoke all on public.app_notif_prefs from public, anon, authenticated;

-- Catálogo dos avisos. permissao nula = qualquer pessoa da empresa; 'proprio' = só quem é dono do registro.
create or replace function public.app_notif_catalogo()
returns table (tipo text, grupo text, ordem int, rotulo text, descricao text, padrao boolean, permissao text)
language sql immutable set search_path = public as $$
  values
  ('escala',              'Operação',   1, 'Você foi escalado',                 'Quando você entra numa etapa do cronograma (montagem, desmontagem, carregamento, triagem…).', true, 'proprio'),
  ('escala_saida',        'Operação',   2, 'Você saiu de uma escala',           'Quando tiram você de uma etapa que ainda vai acontecer.', true, 'proprio'),
  ('lembrete_amanha',     'Operação',   3, 'Lembrete da véspera',               'Às 18h, o que você tem no dia seguinte: horário, cliente e local.', true, 'proprio'),
  ('triagem_dia',         'Operação',   4, 'Resumo da triagem do dia',          'Às 7h30, quantos pedidos estão para separar e conferir.', true, 'logistica.separacao.visualizar'),
  ('expedicao_pronto',    'Operação',   5, 'Pedido pronto para carregar',       'Quando a Triagem termina a separação de um pedido.', true, 'logistica.expedicao.visualizar'),
  ('problema_separacao',  'Operação',   6, 'Problema na separação',             'Quando um problema reportado na separação chega à sua área (ou volta com a solução para quem reportou).', true, null),
  ('pedido_reservado',    'Comercial',  1, 'Pedido reservado',                  'Quando um pedido passa para Reservado.', false, 'comercial.pedidos.visualizar'),
  ('pedido_cancelado',    'Comercial',  2, 'Pedido cancelado',                  'Quando um pedido é cancelado, com o motivo.', true, 'comercial.pedidos.visualizar'),
  ('pedido_catalogo',     'Comercial',  3, 'Pedido enviado pelo catálogo',      'Quando um decorador envia um pedido pelo catálogo.', true, 'comercial.pedidos.visualizar'),
  ('pre_reserva_vencendo','Comercial',  4, 'Pré-reserva vencendo',              'Às 7h30, as pré-reservas que vencem até amanhã.', true, 'comercial.pedidos.visualizar'),
  ('acompanhamento_hoje', 'Comercial',  5, 'Contatos de orçamento para hoje',   'Às 7h30, os orçamentos com contato marcado para hoje ou atrasados.', true, 'comercial.pedidos.visualizar'),
  ('posvenda_reclamacao', 'Comercial',  6, 'Reclamação no pós-venda',           'Quando uma ligação de pós-venda termina com reclamação.', true, 'comercial.pedidos.visualizar'),
  ('pagamento_recebido',  'Financeiro', 1, 'Pagamento recebido',                'Cada recebimento lançado (PIX do link, conciliação ou manual).', true, 'financeiro.fluxo.visualizar'),
  ('receber_atrasou',     'Financeiro', 2, 'Recebimento atrasado',              'Às 7h30, as parcelas a receber que venceram ontem e não foram pagas.', true, 'financeiro.fluxo.visualizar'),
  ('pagar_hoje',          'Financeiro', 3, 'Contas a pagar de hoje',            'Às 7h30, o que vence hoje no Contas a pagar.', true, 'financeiro.fluxo.visualizar'),
  ('divergencia_nova',    'Estoque',    1, 'Nova divergência de contagem',      'Quando uma peça entra em contagem geral por divergência.', true, 'estoque.itens.visualizar'),
  ('os_aberta',           'Estoque',    2, 'Ordem de serviço aberta',           'Quando uma peça danificada vai para manutenção num setor.', true, 'producao.ordens.visualizar'),
  ('estoque_minimo',      'Estoque',    3, 'Material no estoque mínimo',        'Quando um material do Almoxarifado chega ao mínimo e vira solicitação de compra.', true, 'estoque.almoxarifado.visualizar'),
  ('compra_minha',        'Compras',    1, 'Andamento da minha solicitação de compra', 'Quando o que você pediu entra em cotação, é comprado, chega ou é cancelado.', true, 'proprio'),
  ('manutencao_minha',    'Compras',    2, 'Andamento da minha manutenção',     'Quando sua solicitação de manutenção é agendada, começa, termina ou é cancelada.', true, 'proprio'),
  ('reuniao_convite',     'Pessoas',    1, 'Convite para reunião',              'Quando alguém convida você para uma reunião.', true, 'proprio'),
  ('reuniao_lembrete',    'Pessoas',    2, 'Reunião daqui a pouco',             '30 minutos antes de uma reunião em que você está convidado.', true, 'proprio'),
  ('ideia_decidida',      'Pessoas',    3, 'Resposta da sua ideia',             'Quando o RH decide sobre uma ideia que você enviou na Ideia Premiada.', true, 'proprio'),
  ('comunicado',          'Pessoas',    4, 'Novo comunicado',                   'Quando sai um aviso novo no quadro de avisos da Início.', true, null),
  ('aniversario',         'Pessoas',    5, 'Aniversariantes do dia',            'Às 7h30, quem faz aniversário hoje.', true, null),
  ('teste',               'Sistema',    9, 'Teste',                             'Notificação de teste enviada por você.', true, 'oculto')
$$;

-- A pessoa quer este tipo? (preferência; senão o padrão do catálogo; tipo desconhecido = sim)
create or replace function public.app_notif_quer(p_empresa uuid, p_user uuid, p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (pr.tipos->>p_tipo)::boolean from app_notif_prefs pr where pr.empresa_id = p_empresa and pr.user_id = p_user and pr.tipos ? p_tipo),
                  (select c.padrao from app_notif_catalogo() c where c.tipo = p_tipo), true);
$$;

-- Antes de gravar na fila: tipo pela chave (avisos antigos), preferência e horário de silêncio.
create or replace function public.app_notif_filtrar() returns trigger
language plpgsql security definer set search_path = public as $$
declare pr app_notif_prefs; agora time := (now() at time zone 'America/Sao_Paulo')::time; fim timestamp;
begin
  if new.tipo is null then
    new.tipo := case split_part(coalesce(new.chave, ''), ':', 1) when 'escala' then 'escala' when 'reuniao' then 'reuniao_convite' else null end;
  end if;
  if new.tipo is not null and not app_notif_quer(new.empresa_id, new.user_id, new.tipo) then return null; end if;
  select * into pr from app_notif_prefs where empresa_id = new.empresa_id and user_id = new.user_id;
  if pr.silencio and new.tipo is distinct from 'teste' and pr.silencio_inicio <> pr.silencio_fim
     and ((pr.silencio_inicio < pr.silencio_fim and agora >= pr.silencio_inicio and agora < pr.silencio_fim)
       or (pr.silencio_inicio > pr.silencio_fim and (agora >= pr.silencio_inicio or agora < pr.silencio_fim))) then
    fim := (now() at time zone 'America/Sao_Paulo')::date + pr.silencio_fim;
    if agora >= pr.silencio_fim then fim := fim + interval '1 day'; end if;
    new.enviar_apos := fim at time zone 'America/Sao_Paulo';
  end if;
  return new;
exception when others then raise warning 'app_notif_filtrar: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_filtrar on public.app_push_fila;
create trigger app_notif_filtrar before insert on public.app_push_fila for each row execute function public.app_notif_filtrar();

-- Manda um aviso para uma pessoa (nunca levanta erro: quem chama é gatilho de outra tabela).
create or replace function public.app_notif_enviar(p_empresa uuid, p_user uuid, p_tipo text, p_titulo text, p_corpo text, p_url text, p_chave text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_empresa is null or p_user is null then return false; end if;
  insert into app_push_fila (user_id, empresa_id, tipo, titulo, corpo, url, chave)
  values (p_user, p_empresa, p_tipo, left(p_titulo, 120), left(coalesce(p_corpo, ''), 600), p_url, p_chave)
  on conflict (chave) do nothing;
  get diagnostics n = row_count;
  return n > 0;
exception when others then raise warning 'app_notif_enviar(%): %', p_tipo, sqlerrm; return false;
end $$;

-- Quem da empresa recebe por permissão (ativos; o administrador sem cadastro de funcionário entra).
create or replace function public.app_notif_publico(p_empresa uuid, p_permissao text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct ue.user_id from usuarios_empresas ue
  where ue.empresa_id = p_empresa
    and not exists (select 1 from funcionarios_acesso f where f.id = ue.user_id and not f.ativo)
    and (p_permissao is null or coalesce(funcionario_pode(p_empresa, ue.user_id, p_permissao), false));
$$;

create or replace function public.app_notif_grupo(p_empresa uuid, p_permissao text, p_tipo text, p_titulo text, p_corpo text, p_url text, p_chave text, p_exceto uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare u uuid; n int := 0;
begin
  for u in select * from app_notif_publico(p_empresa, p_permissao) loop
    if u is distinct from p_exceto and app_notif_enviar(p_empresa, u, p_tipo, p_titulo, p_corpo, p_url, p_chave || ':' || u) then n := n + 1; end if;
  end loop;
  if n > 0 then perform app_push_disparar(); end if;
  return n;
exception when others then raise warning 'app_notif_grupo(%): %', p_tipo, sqlerrm; return n;
end $$;

create or replace function public.app_notif_dia(d date) returns text language sql immutable as $$
  select case when d = (now() at time zone 'America/Sao_Paulo')::date then 'hoje'
              when d = (now() at time zone 'America/Sao_Paulo')::date + 1 then 'amanhã'
              else (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow from d)::int + 1] || ', ' || to_char(d, 'DD/MM') end;
$$;

create or replace function public.app_notif_etapa_nome(t text) returns text language sql immutable as $$
  select case t when 'triagem' then 'Triagem' when 'separacao' then 'Triagem' when 'conferencia' then 'Triagem da volta'
    when 'carregamento' then 'Carregamento' when 'montagem' then 'Montagem' when 'desmontagem' then 'Desmontagem'
    when 'descarregamento' then 'Descarregamento' else initcap(replace(coalesce(t, 'Etapa'), '_', ' ')) end;
$$;

create or replace function public.app_notif_etapa_url(e operacao_etapas) returns text language sql immutable as $$
  select case when e.tipo in ('montagem', 'desmontagem') then 'Modulos/Chiavari/Cronograma/montador.html?app=1&etapa=' || e.id
              when e.tipo in ('carregamento', 'descarregamento') then 'Modulos/Logistica/ExpedicaoApp/expedicao.html?app=1'
              when e.tipo in ('triagem', 'separacao', 'conferencia') then 'Modulos/Estoque/TriagemApp/triagem.html?app=1'
              else 'app.html#avisos' end;
$$;

/* ---------- Operação ---------- */
-- Substitui o gatilho antigo: todas as etapas, e a caixa de avisos mesmo sem celular cadastrado.
create or replace function public.app_push_escala() returns trigger
language plpgsql security definer set search_path = public as $$
declare e operacao_etapas; p separacoes_pedidos; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.funcionario_id is null then return new; end if;
  select * into e from operacao_etapas where id = new.etapa_id;
  if e.id is null or e.data is null or e.data < hoje then return new; end if;
  select * into p from separacoes_pedidos where id = e.pedido_id;
  if app_notif_enviar(e.empresa_id, new.funcionario_id, 'escala', 'Você foi escalado',
       app_notif_etapa_nome(e.tipo) || coalesce(' · Pedido ' || nullif(p.numero_pedido, ''), '') || ' · ' || app_notif_dia(e.data) || coalesce(' às ' || to_char(e.hora, 'HH24:MI'), '')
       || coalesce(chr(10) || nullif(concat_ws(' – ', nullif(p.cliente_nome, ''), nullif(p.local_nome, '')), ''), '')
       || case when new.papel = 'responsavel' then chr(10) || 'Você é o responsável.' else '' end,
       app_notif_etapa_url(e), 'escala:' || e.id || ':' || new.funcionario_id) then perform app_push_disparar(); end if;
  return new;
exception when others then raise warning 'app_push_escala: %', sqlerrm; return new;
end $$;

create or replace function public.app_notif_escala_saida() returns trigger
language plpgsql security definer set search_path = public as $$
declare e operacao_etapas; p separacoes_pedidos;
begin
  if old.funcionario_id is null then return old; end if;
  select * into e from operacao_etapas where id = old.etapa_id;
  if e.id is null or e.data is null or e.data < (now() at time zone 'America/Sao_Paulo')::date then return old; end if;
  select * into p from separacoes_pedidos where id = e.pedido_id;
  if app_notif_enviar(e.empresa_id, old.funcionario_id, 'escala_saida', 'Você saiu de uma escala',
       app_notif_etapa_nome(e.tipo) || coalesce(' · Pedido ' || nullif(p.numero_pedido, ''), '') || ' · ' || app_notif_dia(e.data) || coalesce(' às ' || to_char(e.hora, 'HH24:MI'), ''),
       'app.html#avisos', 'escala_saida:' || e.id || ':' || old.funcionario_id || ':' || extract(epoch from now())::bigint) then perform app_push_disparar(); end if;
  return old;
exception when others then raise warning 'app_notif_escala_saida: %', sqlerrm; return old;
end $$;
drop trigger if exists app_notif_escala_saida on public.operacao_etapa_pessoas;
create trigger app_notif_escala_saida after delete on public.operacao_etapa_pessoas for each row execute function public.app_notif_escala_saida();

create or replace function public.app_notif_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare corpo text := concat_ws(' – ', nullif(new.cliente_nome, ''), nullif(new.local_nome, ''))
  || coalesce(' · evento ' || to_char(new.data_evento, 'DD/MM'), '');
begin
  if new.status = 'separado' and old.status is distinct from 'separado' then
    perform app_notif_grupo(new.empresa_id, 'logistica.expedicao.visualizar', 'expedicao_pronto', 'Pedido ' || coalesce(new.numero_pedido, '') || ' pronto para carregar',
      corpo || coalesce(chr(10) || 'Entrega ' || to_char(new.data_entrega, 'DD/MM'), ''), 'Modulos/Logistica/ExpedicaoApp/expedicao.html?app=1', 'expedicao_pronto:' || new.id);
  end if;
  if new.status_comercial = 'aprovado' and old.status_comercial is distinct from 'aprovado' and coalesce(old.status_comercial, '') not in ('finalizado', 'enviado') then
    perform app_notif_grupo(new.empresa_id, 'comercial.pedidos.visualizar', 'pedido_reservado', 'Pedido ' || coalesce(new.numero_pedido, '') || ' reservado',
      corpo || coalesce(chr(10) || 'Valor R$ ' || to_char(new.valor_total, 'FM999G999G990D00'), ''), 'app.html#avisos', 'pedido_reservado:' || new.id, new.atualizado_por);
  end if;
  if new.status_comercial = 'cancelado' and old.status_comercial is distinct from 'cancelado' then
    perform app_notif_grupo(new.empresa_id, 'comercial.pedidos.visualizar', 'pedido_cancelado', 'Pedido ' || coalesce(new.numero_pedido, '') || ' cancelado',
      corpo || coalesce(chr(10) || 'Motivo: ' || nullif(new.observacoes->'cancelamento'->>'motivo', ''), ''), 'app.html#avisos', 'pedido_cancelado:' || new.id, new.atualizado_por);
  end if;
  return new;
exception when others then raise warning 'app_notif_pedido: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_pedido on public.separacoes_pedidos;
create trigger app_notif_pedido after update of status, status_comercial on public.separacoes_pedidos for each row execute function public.app_notif_pedido();

create or replace function public.app_notif_separacao_problema() returns trigger
language plpgsql security definer set search_path = public as $$
declare p separacoes_pedidos; it text; corpo text;
begin
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then return new; end if;
  select * into p from separacoes_pedidos where id = new.pedido_id;
  select coalesce(nullif(produto, ''), descricao_total) into it from itens where id = new.item_id;
  corpo := coalesce(nullif(it, ''), 'Item') || coalesce(' · ' || nullif(new.motivo_nome, ''), '') || coalesce(chr(10) || 'Pedido ' || nullif(p.numero_pedido, '') || coalesce(' – ' || nullif(p.cliente_nome, ''), ''), '');
  if new.estado = 'acervo' then
    perform app_notif_grupo(new.empresa_id, 'estoque.itens.visualizar', 'problema_separacao', 'Problema na separação', corpo,
      'Modulos/Estoque/Acervo/acervo.html?app=1&aba=ocorrencias&grupo=gerencial&titulo=Separa%C3%A7%C3%A3o', 'sep_prob:' || new.id || ':acervo', new.criado_por);
  elsif new.estado = 'comercial' then
    perform app_notif_grupo(new.empresa_id, 'comercial.pedidos.visualizar', 'problema_separacao', 'Problema na separação precisa do Comercial', corpo,
      'app.html#avisos', 'sep_prob:' || new.id || ':comercial');
  elsif new.estado = 'triagem' and new.criado_por is not null then
    if app_notif_enviar(new.empresa_id, new.criado_por, 'problema_separacao', 'Solução disponível para o problema que você reportou', corpo,
      'Modulos/Estoque/TriagemApp/triagem.html?app=1', 'sep_prob:' || new.id || ':triagem:' || extract(epoch from now())::bigint) then perform app_push_disparar(); end if;
  end if;
  return new;
exception when others then raise warning 'app_notif_separacao_problema: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_separacao_problema on public.separacao_ocorrencias;
create trigger app_notif_separacao_problema after insert or update of estado on public.separacao_ocorrencias for each row execute function public.app_notif_separacao_problema();

/* ---------- Comercial ---------- */
create or replace function public.app_notif_projeto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pedido_enviado' and old.status is distinct from 'pedido_enviado' then
    perform app_notif_grupo(new.empresa_id, 'comercial.pedidos.visualizar', 'pedido_catalogo', 'Pedido novo pelo catálogo',
      coalesce(nullif(new.noivos, ''), 'Projeto') || coalesce(' · evento ' || to_char(new.data_evento, 'DD/MM'), '') || coalesce(chr(10) || nullif(new.local_evento, ''), ''),
      'app.html#avisos', 'pedido_catalogo:' || new.id || ':' || extract(epoch from coalesce(new.pedido_enviado_em, now()))::bigint);
  end if;
  return new;
exception when others then raise warning 'app_notif_projeto: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_projeto on public.projetos;
create trigger app_notif_projeto after update of status on public.projetos for each row execute function public.app_notif_projeto();

create or replace function public.app_notif_posvenda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.atencao and not coalesce(old.atencao, false) then
    perform app_notif_grupo(new.empresa_id, 'comercial.pedidos.visualizar', 'posvenda_reclamacao', 'Reclamação no pós-venda',
      coalesce(nullif(new.cliente_nome, ''), 'Cliente') || coalesce(chr(10) || left(nullif(new.observacao, ''), 160), ''),
      'Modulos/Chiavari/Feedback/feedback.html?app=1&aba=painel', 'posvenda_reclamacao:' || new.id, new.feito_por);
  end if;
  return new;
exception when others then raise warning 'app_notif_posvenda: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_posvenda on public.posvenda_contatos;
create trigger app_notif_posvenda after update of atencao on public.posvenda_contatos for each row execute function public.app_notif_posvenda();

/* ---------- Financeiro ---------- */
create or replace function public.app_notif_recebimento() returns trigger
language plpgsql security definer set search_path = public as $$
declare r fin_receber;
begin
  if new.tipo <> 'receber' or new.receber_id is null then return new; end if;
  select * into r from fin_receber where id = new.receber_id;
  perform app_notif_grupo(new.empresa_id, 'financeiro.fluxo.visualizar', 'pagamento_recebido', 'Pagamento recebido · R$ ' || to_char(new.valor, 'FM999G999G990D00'),
    coalesce(nullif(r.cliente_nome, ''), 'Cliente') || coalesce(' · Pedido ' || nullif(r.pedido_numero, ''), '') || coalesce(' · ' || initcap(nullif(r.componente, '')), '')
    || case new.origem when 'gateway' then chr(10) || 'PIX pelo link do pedido' when 'conciliacao' then chr(10) || 'Conciliação bancária' else '' end,
    'app.html#avisos', 'pagamento_recebido:' || new.id, new.criado_por);
  return new;
exception when others then raise warning 'app_notif_recebimento: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_recebimento on public.fin_baixas;
create trigger app_notif_recebimento after insert on public.fin_baixas for each row execute function public.app_notif_recebimento();

/* ---------- Estoque ---------- */
create or replace function public.app_notif_divergencia() returns trigger
language plpgsql security definer set search_path = public as $$
declare it text;
begin
  if new.status <> 'pendente' then return new; end if;
  select coalesce(nullif(produto, ''), descricao_total) into it from itens where id = new.item_id;
  perform app_notif_grupo(new.empresa_id, 'estoque.itens.visualizar', 'divergencia_nova', 'Nova divergência de contagem',
    coalesce(it, 'Item') || chr(10) || 'Faça a contagem geral no galpão. Até lá a peça fica bloqueada para novas reservas.',
    'Modulos/Estoque/Acervo/acervo.html?app=1&aba=divergencias&grupo=gerencial&titulo=Diverg%C3%AAncias', 'divergencia_nova:' || new.id);
  return new;
exception when others then raise warning 'app_notif_divergencia: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_divergencia on public.acervo_contagens_gerais;
create trigger app_notif_divergencia after insert on public.acervo_contagens_gerais for each row execute function public.app_notif_divergencia();

create or replace function public.app_notif_os() returns trigger
language plpgsql security definer set search_path = public as $$
declare it text;
begin
  select coalesce(nullif(produto, ''), descricao_total) into it from itens where id = new.item_id;
  perform app_notif_grupo(new.empresa_id, 'producao.ordens.visualizar', 'os_aberta', 'O.S. ' || coalesce(new.numero::text, '') || ' aberta · ' || coalesce(nullif(new.setor, ''), 'manutenção'),
    coalesce(it, 'Item') || coalesce(' · ' || trim(to_char(new.quantidade, 'FM999990D##')) || ' un.', '') || coalesce(chr(10) || 'Prazo ' || to_char(new.prazo, 'DD/MM'), ''),
    'app.html#avisos', 'os_aberta:' || new.id, new.criado_por);
  return new;
exception when others then raise warning 'app_notif_os: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_os on public.acervo_os;
create trigger app_notif_os after insert on public.acervo_os for each row execute function public.app_notif_os();

create or replace function public.app_notif_estoque_minimo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'aberta' then return new; end if;
  perform app_notif_grupo(new.empresa_id, 'estoque.almoxarifado.visualizar', 'estoque_minimo', 'Material no estoque mínimo',
    coalesce(nullif(new.produto, ''), 'Material') || ' · ' || trim(to_char(coalesce(new.estoque_no_pedido, 0), 'FM999990D##')) || ' ' || coalesce(new.unidade, '') || ' em estoque'
    || chr(10) || 'Pedido de compra de ' || trim(to_char(new.quantidade, 'FM999990D##')) || ' ' || coalesce(new.unidade, '') || ' aberto em Compras.',
    'app.html#avisos', 'estoque_minimo:' || new.id);
  return new;
exception when others then raise warning 'app_notif_estoque_minimo: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_estoque_minimo on public.almox_solicitacoes_compra;
create trigger app_notif_estoque_minimo after insert on public.almox_solicitacoes_compra for each row execute function public.app_notif_estoque_minimo();

/* ---------- Compras e manutenção (quem pediu) ---------- */
create or replace function public.app_notif_compra() returns trigger
language plpgsql security definer set search_path = public as $$
declare situ text; item text;
begin
  if new.tipo <> 'necessidade' or new.criado_por is null or new.status is not distinct from old.status then return new; end if;
  if coalesce(new.dados->>'origem', '') not in ('solicitacao', 'manutencao', '') then return new; end if;
  situ := case new.status when 'em_cotacao' then 'está em cotação' when 'comprada' then 'foi comprada' when 'recebida' then 'chegou'
    when 'atendida' then 'foi atendida' when 'cancelada' then 'foi cancelada' else null end;
  if situ is null then return new; end if;
  item := coalesce(nullif(new.dados->>'material_nome', ''), nullif(new.dados->>'descricao', ''), nullif(new.dados->>'item', ''), 'Sua solicitação');
  if app_notif_enviar(new.empresa_id, new.criado_por, 'compra_minha', 'Sua solicitação de compra ' || situ,
       item || coalesce(' · ' || nullif(new.dados->>'quantidade', '') || ' ' || coalesce(new.dados->>'unidade', ''), ''),
       'Modulos/Geral/SolicitacoesCompra/solicitacoes.html?app=1&grupo=agentes&titulo=Carla%20%C2%B7%20Compras',
       'compra_minha:' || new.id || ':' || new.status) then perform app_push_disparar(); end if;
  return new;
exception when others then raise warning 'app_notif_compra: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_compra on public.compras_registros;
create trigger app_notif_compra after update of status on public.compras_registros for each row execute function public.app_notif_compra();

create or replace function public.app_notif_manutencao() returns trigger
language plpgsql security definer set search_path = public as $$
declare situ text;
begin
  if new.criado_por is null or new.status is not distinct from old.status then return new; end if;
  situ := case new.status when 'analise' then 'está em análise' when 'agendada' then 'foi agendada' || coalesce(' para ' || to_char(new.programada_para, 'DD/MM'), '')
    when 'execucao' then 'está em execução' when 'concluida' then 'foi concluída' when 'cancelada' then 'foi cancelada' else null end;
  if situ is null then return new; end if;
  if app_notif_enviar(new.empresa_id, new.criado_por, 'manutencao_minha', 'Sua manutenção ' || situ,
       coalesce(nullif(new.titulo, ''), 'Solicitação') || coalesce(' · ' || nullif(new.local, ''), '') || coalesce(chr(10) || left(nullif(new.retorno, ''), 160), ''),
       'Modulos/Geral/SolicitacoesManutencao/solicitacoes.html?app=1&grupo=agentes&titulo=Marcos%20%C2%B7%20Manuten%C3%A7%C3%A3o',
       'manutencao_minha:' || new.id || ':' || new.status) then perform app_push_disparar(); end if;
  return new;
exception when others then raise warning 'app_notif_manutencao: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_manutencao on public.manutencao_predial_solicitacoes;
create trigger app_notif_manutencao after update of status on public.manutencao_predial_solicitacoes for each row execute function public.app_notif_manutencao();

/* ---------- Pessoas ---------- */
create or replace function public.app_notif_ideia() returns trigger
language plpgsql security definer set search_path = public as $$
declare situ text;
begin
  if new.autor_id is null or new.status is not distinct from old.status then return new; end if;
  situ := case new.status when 'premiada' then 'foi premiada! 🎉' when 'em_analise' then 'ficou em espera' when 'nao_priorizada' then 'não foi aprovada desta vez'
    when 'selecionada' then 'foi aprovada' when 'implementada' then 'foi implementada' else null end;
  if situ is null then return new; end if;
  if app_notif_enviar(new.empresa_id, new.autor_id, 'ideia_decidida', 'Sua ideia ' || situ,
       new.titulo || coalesce(chr(10) || left(nullif(new.retorno, ''), 180), '') || coalesce(chr(10) || 'Prêmio: ' || nullif(new.premio, ''), ''),
       'Modulos/RH/IdeiaPremiada/ideia-premiada.html?app=1&grupo=agentes&titulo=Ideia%20Premiada', 'ideia_decidida:' || new.id || ':' || new.status) then perform app_push_disparar(); end if;
  return new;
exception when others then raise warning 'app_notif_ideia: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_ideia on public.ideias_premiadas;
create trigger app_notif_ideia after update of status on public.ideias_premiadas for each row execute function public.app_notif_ideia();

create or replace function public.app_notif_comunicado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app_notif_grupo(new.empresa_id, null, 'comunicado', case when upper(coalesce(new.prioridade, '')) = 'IMPORTANTE' then 'Comunicado importante' else 'Novo comunicado' end,
    case when new.titulo ilike 'Anexo · %' then 'Uma foto nova no quadro de avisos.' else coalesce(nullif(new.titulo, ''), 'Aviso') || coalesce(chr(10) || left(nullif(new.texto, ''), 180), '') end,
    'app.html#avisos', 'comunicado:' || new.id, new.autor_id);
  return new;
exception when others then raise warning 'app_notif_comunicado: %', sqlerrm; return new;
end $$;
drop trigger if exists app_notif_comunicado on public.portal_avisos;
create trigger app_notif_comunicado after insert on public.portal_avisos for each row execute function public.app_notif_comunicado();

/* ---------- Rotinas do dia (pg_cron) ---------- */
create or replace function public.app_notif_rotina_manha() returns void
language plpgsql security definer set search_path = public as $$
declare emp uuid; hoje date := (now() at time zone 'America/Sao_Paulo')::date; n int; v numeric; u uuid; txt text; chave text := to_char(hoje, 'YYYY-MM-DD');
begin
  for emp in select id from empresas loop
    begin
      -- Triagem do dia
      select count(*) into n from separacoes_pedidos where empresa_id = emp and status in ('pendente', 'em_separacao')
        and status_comercial in ('aprovado', 'finalizado', 'enviado') and data_entrega between hoje and hoje + 3;
      if n > 0 then perform app_notif_grupo(emp, 'logistica.separacao.visualizar', 'triagem_dia', 'Triagem de hoje',
        n || case when n = 1 then ' pedido para separar' else ' pedidos para separar' end || ' com entrega até ' || to_char(hoje + 3, 'DD/MM') || '.',
        'Modulos/Estoque/TriagemApp/triagem.html?app=1', 'triagem_dia:' || chave); end if;
      -- Pré-reservas vencendo
      select count(*), string_agg(coalesce(numero_pedido, '') || ' ' || coalesce(cliente_nome, ''), ' · ') into n, txt from separacoes_pedidos
        where empresa_id = emp and status_comercial = 'pre_reserva' and pre_reserva_ate between hoje and hoje + 1;
      if n > 0 then perform app_notif_grupo(emp, 'comercial.pedidos.visualizar', 'pre_reserva_vencendo',
        n || case when n = 1 then ' pré-reserva vence' else ' pré-reservas vencem' end || ' até amanhã', left(txt, 300), 'app.html#avisos', 'pre_reserva:' || chave); end if;
      -- Contatos de orçamento de hoje (do pedido de cada pessoa)
      for u, n in select coalesce(p.criado_por, ue.user_id), count(*) from (
          select distinct on (f.alvo_id) f.alvo_id, f.proximo from comercial_followups f where f.empresa_id = emp and f.alvo_tipo = 'pedido' order by f.alvo_id, f.criado_em desc) ult
          join separacoes_pedidos p on p.id = ult.alvo_id and p.status_comercial in ('orcamento', 'pre_reserva')
          left join lateral (select user_id from usuarios_empresas where empresa_id = emp and role in ('admin', 'owner') limit 1) ue on true
          where ult.proximo <= hoje group by 1 loop
        if u is not null and app_notif_enviar(emp, u, 'acompanhamento_hoje', 'Contatos de orçamento para hoje',
          n || case when n = 1 then ' orçamento' else ' orçamentos' end || ' com contato marcado para hoje ou atrasado.', 'app.html#avisos', 'acomp:' || chave || ':' || u) then null; end if;
      end loop;
      -- Financeiro
      select count(*), sum(aberto) into n, v from fin_receber where empresa_id = emp and status = 'aberto' and aberto > 0
        and coalesce(programado_para, vencimento) = hoje - 1;
      if n > 0 then perform app_notif_grupo(emp, 'financeiro.fluxo.visualizar', 'receber_atrasou', 'Recebimentos atrasados',
        n || case when n = 1 then ' parcela venceu ontem' else ' parcelas venceram ontem' end || ' sem pagamento · R$ ' || to_char(v, 'FM999G999G990D00'), 'app.html#avisos', 'receber_atrasou:' || chave); end if;
      select count(*), sum(aberto) into n, v from fin_pagar where empresa_id = emp and status = 'pendente' and aberto > 0
        and coalesce(programado_para, vencimento) = hoje;
      if n > 0 then perform app_notif_grupo(emp, 'financeiro.fluxo.visualizar', 'pagar_hoje', 'Contas a pagar de hoje',
        n || case when n = 1 then ' conta vence hoje' else ' contas vencem hoje' end || ' · R$ ' || to_char(v, 'FM999G999G990D00'), 'app.html#avisos', 'pagar_hoje:' || chave); end if;
      -- Aniversariantes
      select string_agg(split_part(nome, ' ', 1), ', ' order by nome), count(*) into txt, n from funcionarios_acesso
        where empresa_id = emp and ativo and substr(coalesce(nullif(dados_rh->>'data_nascimento', ''), nullif(dados_rh->>'nascimento', ''), ''), 6, 5) = to_char(hoje, 'MM-DD');
      if n > 0 then perform app_notif_grupo(emp, null, 'aniversario', case when n = 1 then 'Hoje é aniversário de ' || txt else 'Aniversariantes de hoje' end,
        case when n = 1 then 'Deixe um recado de parabéns na Início do sistema. 🎂' else txt || '. Deixe um recado na Início do sistema. 🎂' end, 'app.html#avisos', 'aniversario:' || chave); end if;
      perform app_push_disparar();
    exception when others then raise warning 'app_notif_rotina_manha(%): %', emp, sqlerrm;
    end;
  end loop;
end $$;

create or replace function public.app_notif_rotina_vespera() returns void
language plpgsql security definer set search_path = public as $$
declare amanha date := (now() at time zone 'America/Sao_Paulo')::date + 1; r record;
begin
  for r in select e.*, ep.funcionario_id as pessoa, ep.papel, p.numero_pedido, p.cliente_nome, p.local_nome
      from operacao_etapas e join operacao_etapa_pessoas ep on ep.etapa_id = e.id and ep.funcionario_id is not null
      left join separacoes_pedidos p on p.id = e.pedido_id where e.data = amanha order by e.hora nulls last loop
    perform app_notif_enviar(r.empresa_id, r.pessoa, 'lembrete_amanha', 'Amanhã: ' || app_notif_etapa_nome(r.tipo) || coalesce(' às ' || to_char(r.hora, 'HH24:MI'), ''),
      concat_ws(' – ', 'Pedido ' || nullif(r.numero_pedido, ''), nullif(r.cliente_nome, ''), nullif(r.local_nome, ''))
      || case when r.papel = 'responsavel' then chr(10) || 'Você é o responsável.' else '' end,
      case when r.tipo in ('montagem', 'desmontagem') then 'Modulos/Chiavari/Cronograma/montador.html?app=1&etapa=' || r.id else 'app.html#avisos' end,
      'lembrete_amanha:' || r.id || ':' || r.pessoa);
  end loop;
  perform app_push_disparar();
exception when others then raise warning 'app_notif_rotina_vespera: %', sqlerrm;
end $$;

create or replace function public.app_notif_rotina_reuniao() returns void
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select re.id, re.empresa_id, re.titulo, re.inicio, re.local, rp.funcionario_id from reunioes re
      join reuniao_participantes rp on rp.reuniao_id = re.id and rp.funcionario_id is not null and coalesce(rp.resposta, '') <> 'recusado'
      where re.status = 'agendada' and re.inicio between now() + interval '20 minutes' and now() + interval '35 minutes'
    union
    select re.id, re.empresa_id, re.titulo, re.inicio, re.local, re.organizador_id from reunioes re
      where re.organizador_id is not null and re.status = 'agendada' and re.inicio between now() + interval '20 minutes' and now() + interval '35 minutes' loop
    if app_notif_enviar(r.empresa_id, r.funcionario_id, 'reuniao_lembrete', 'Reunião às ' || to_char(r.inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
      r.titulo || coalesce(' · ' || nullif(r.local, ''), ''), 'Modulos/Gestao/Reunioes/reunioes.html?id=' || r.id, 'reuniao_lembrete:' || r.id || ':' || r.funcionario_id) then n := n + 1; end if;
  end loop;
  if n > 0 then perform app_push_disparar(); end if;
exception when others then raise warning 'app_notif_rotina_reuniao: %', sqlerrm;
end $$;

do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('app-notif-manha', 'app-notif-vespera', 'app-notif-reuniao');
  perform cron.schedule('app-notif-manha', '30 10 * * *', 'select public.app_notif_rotina_manha()');      -- 7h30 de Brasília
  perform cron.schedule('app-notif-vespera', '0 21 * * *', 'select public.app_notif_rotina_vespera()');  -- 18h de Brasília
  perform cron.schedule('app-notif-reuniao', '*/5 * * * *', 'select public.app_notif_rotina_reuniao()');
  -- avisos segurados pelo horário de silêncio: o job da fila passa a olhar também os que chegaram à hora
  perform cron.unschedule('app-push-fila');
  perform cron.schedule('app-push-fila', '*/2 * * * *',
    'select public.app_push_disparar() where exists (select 1 from public.app_push_fila where enviado_em is null and tentativas < 5 and (enviar_apos is null or enviar_apos <= now()))');
end $$;

/* ---------- Telas do app ---------- */
create or replace function public.app_notif_config(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pr app_notif_prefs;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso' using errcode = '42501'; end if;
  select * into pr from app_notif_prefs where empresa_id = p_empresa and user_id = auth.uid();
  return jsonb_build_object(
    'silencio', coalesce(pr.silencio, false), 'inicio', to_char(coalesce(pr.silencio_inicio, '22:00'), 'HH24:MI'), 'fim', to_char(coalesce(pr.silencio_fim, '07:00'), 'HH24:MI'),
    'tipos', (select coalesce(jsonb_agg(jsonb_build_object('tipo', c.tipo, 'grupo', c.grupo, 'rotulo', c.rotulo, 'descricao', c.descricao,
                'ativo', app_notif_quer(p_empresa, auth.uid(), c.tipo)) order by array_position(array['Operação','Comercial','Financeiro','Estoque','Compras','Pessoas'], c.grupo), c.ordem), '[]')
              from app_notif_catalogo() c
              where c.permissao is distinct from 'oculto'
                and (c.permissao is null or c.permissao = 'proprio' or coalesce(funcionario_pode(p_empresa, auth.uid(), c.permissao), false))));
end $$;

create or replace function public.app_notif_config_salvar(p_empresa uuid, p_tipos jsonb, p_silencio boolean, p_inicio time, p_fim time) returns void
language plpgsql security definer set search_path = public as $$
declare t jsonb := '{}'::jsonb; k text;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso' using errcode = '42501'; end if;
  for k in select jsonb_object_keys(coalesce(p_tipos, '{}')) loop
    if exists (select 1 from app_notif_catalogo() c where c.tipo = k) and jsonb_typeof(p_tipos->k) = 'boolean' then t := t || jsonb_build_object(k, p_tipos->k); end if;
  end loop;
  insert into app_notif_prefs (empresa_id, user_id, tipos, silencio, silencio_inicio, silencio_fim)
  values (p_empresa, auth.uid(), t, coalesce(p_silencio, false), coalesce(p_inicio, '22:00'), coalesce(p_fim, '07:00'))
  on conflict (empresa_id, user_id) do update set tipos = app_notif_prefs.tipos || excluded.tipos, silencio = excluded.silencio,
    silencio_inicio = excluded.silencio_inicio, silencio_fim = excluded.silencio_fim, atualizado_em = now();
end $$;

create or replace function public.app_notif_caixa(p_empresa uuid, p_limite int default 80) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso' using errcode = '42501'; end if;
  return jsonb_build_object(
    'nao_lidas', (select count(*) from app_push_fila where user_id = auth.uid() and empresa_id = p_empresa and lida_em is null and criado_em > now() - interval '60 days'),
    'itens', (select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc), '[]') from (
      select f.id, f.tipo, f.titulo, f.corpo, f.url, f.criado_em, f.lida_em, (select c.grupo from app_notif_catalogo() c where c.tipo = f.tipo) as grupo
      from app_push_fila f where f.user_id = auth.uid() and f.empresa_id = p_empresa and f.criado_em > now() - interval '60 days'
      order by f.criado_em desc limit least(greatest(coalesce(p_limite, 80), 1), 200)) x));
end $$;

create or replace function public.app_notif_ler(p_empresa uuid, p_ids uuid[] default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sem acesso' using errcode = '42501'; end if;
  update app_push_fila set lida_em = now() where user_id = auth.uid() and empresa_id = p_empresa and lida_em is null and (p_ids is null or id = any(p_ids));
end $$;

create or replace function public.app_notif_teste(p_empresa uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso' using errcode = '42501'; end if;
  perform app_notif_enviar(p_empresa, auth.uid(), 'teste', 'Notificação de teste', 'Tudo certo! É assim que os avisos do sistema chegam no seu celular.',
    'app.html#avisos', 'teste:' || auth.uid() || ':' || extract(epoch from clock_timestamp())::text);
  perform app_push_disparar();
end $$;

revoke all on function public.app_notif_catalogo() from public, anon;
revoke all on function public.app_notif_quer(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_notif_filtrar() from public, anon, authenticated;
revoke all on function public.app_notif_enviar(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_notif_publico(uuid, text) from public, anon, authenticated;
revoke all on function public.app_notif_grupo(uuid, text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.app_notif_rotina_manha() from public, anon, authenticated;
revoke all on function public.app_notif_rotina_vespera() from public, anon, authenticated;
revoke all on function public.app_notif_rotina_reuniao() from public, anon, authenticated;
revoke all on function public.app_notif_config(uuid) from public, anon;
revoke all on function public.app_notif_config_salvar(uuid, jsonb, boolean, time, time) from public, anon;
revoke all on function public.app_notif_caixa(uuid, int) from public, anon;
revoke all on function public.app_notif_ler(uuid, uuid[]) from public, anon;
revoke all on function public.app_notif_teste(uuid) from public, anon;
grant execute on function public.app_notif_catalogo() to authenticated;
grant execute on function public.app_notif_config(uuid) to authenticated;
grant execute on function public.app_notif_config_salvar(uuid, jsonb, boolean, time, time) to authenticated;
grant execute on function public.app_notif_caixa(uuid, int) to authenticated;
grant execute on function public.app_notif_ler(uuid, uuid[]) to authenticated;
grant execute on function public.app_notif_teste(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
