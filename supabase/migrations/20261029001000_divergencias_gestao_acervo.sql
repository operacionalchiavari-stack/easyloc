-- Divergências de contagem na Gestão do acervo (out/2026).
-- Triagem da volta e descarregamento (Expedição) continuam com 1ª e 2ª contagem às cegas, mas NÃO resolvem mais a
-- divergência: só veem esperado × contado. A divergência vai para Estoque > Gestão do acervo > Divergências, com o
-- histórico das contagens do pedido (carregamento, desmontagem pelo montador, descarregamento e triagem). O sistema pede
-- uma CONTAGEM GERAL do item no galpão (uma contagem resolve todas as divergências abertas do item); compara com o que
-- deveria estar no galpão (estoque − manutenção − peças fora em outros eventos) e sugere o resultado; o gestor confirma
-- cada divergência com o motivo. Faltou de verdade: avisa em quais eventos a peça pode ter ficado.
-- Parâmetro: enquanto a contagem geral não é feita, o item fica bloqueado para novas reservas (padrão: ligado).

-- 1) App do Montador: contagem por item na desmontagem (lançada a partir da lista em papel)
alter table public.operacao_registros drop constraint if exists operacao_registros_tipo_check;
alter table public.operacao_registros add constraint operacao_registros_tipo_check
  check (tipo in ('equipe','sacolas','posicionamento','observacoes','lista_assinada','lista_conferida','desmontagem_concluida','uniformizacao','contagem_itens'));

-- 2) Parâmetro do bloqueio
alter table public.empresa_logistica_regras add column if not exists divergencia_bloqueia_item boolean not null default true;

-- 3) Contagens gerais pedidas pelo sistema (uma pendente por item)
create table if not exists public.acervo_contagens_gerais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  item_id uuid not null references public.itens(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'concluida', 'cancelada')),
  esperado numeric, estoque numeric, manutencao numeric, fora numeric,
  contado numeric, contado_por uuid, contado_por_nome text, contado_em timestamptz,
  concluida_em timestamptz,
  criado_em timestamptz not null default now()
);
create unique index if not exists acervo_contagens_gerais_pend on public.acervo_contagens_gerais (item_id) where status = 'pendente';
alter table public.acervo_contagens_gerais enable row level security;
drop policy if exists acervo_contagens_gerais_ler on public.acervo_contagens_gerais;
create policy acervo_contagens_gerais_ler on public.acervo_contagens_gerais for select to authenticated using (public.operacao_pode(empresa_id, 'estoque.itens.visualizar'));
drop policy if exists seguranca_2fa on public.acervo_contagens_gerais;
create policy seguranca_2fa on public.acervo_contagens_gerais as restrictive for all to authenticated using ((select public.seguranca_2fa_ok())) with check ((select public.seguranca_2fa_ok()));

-- divergência aberta (falta ou sobra da volta/descarregamento) pede a contagem geral do item
create or replace function public.acervo_divergencia_pede_contagem() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo in ('falta', 'sobra') and coalesce(new.etapa, '') in ('retorno', 'descarregamento') and new.resolvida_em is null and new.item_id is not null then
    insert into acervo_contagens_gerais (empresa_id, item_id) values (new.empresa_id, new.item_id) on conflict do nothing;
  end if;
  return new;
exception when others then
  raise warning 'contagem geral: %', sqlerrm; return new;
end $$;
drop trigger if exists acervo_divergencia_pede_contagem on public.operacao_ocorrencias;
create trigger acervo_divergencia_pede_contagem after insert on public.operacao_ocorrencias for each row execute function public.acervo_divergencia_pede_contagem();

insert into acervo_contagens_gerais (empresa_id, item_id)
select distinct o.empresa_id, o.item_id from operacao_ocorrencias o
 where o.tipo in ('falta', 'sobra') and o.etapa in ('retorno', 'descarregamento') and o.resolvida_em is null and o.item_id is not null
on conflict do nothing;

-- item com contagem geral pendente (e o parâmetro ligado) fica bloqueado
create or replace function public.acervo_item_bloqueado(p_empresa uuid, p_item uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select divergencia_bloqueia_item from empresa_logistica_regras where empresa_id = p_empresa), true)
     and exists (select 1 from acervo_contagens_gerais c where c.empresa_id = p_empresa and c.item_id = p_item and c.status = 'pendente')
$$;
grant execute on function public.acervo_item_bloqueado(uuid, uuid) to authenticated;

-- peças do item que estão fora, em outros eventos (carregadas e ainda sem a volta conferida)
create or replace function public.acervo_pecas_fora(p_empresa uuid, p_item uuid) returns numeric language sql stable security definer set search_path = public as $$
  with ped as (
    select p.id from separacoes_pedidos p
     where p.empresa_id = p_empresa and p.encerrado_operacional_em is null and coalesce(p.status_comercial, '') <> 'cancelado'
       and (p.operacao->'carregamento'->>'concluido_em') is not null and (p.operacao->'retorno'->>'concluido_em') is null
  )
  select coalesce(sum(x.q), 0) from (
    select s.quantidade_solicitada q from separacoes_itens s join ped on ped.id = s.separacao_pedido_id join itens i on i.id = s.item_id
     where s.item_id = p_item and (coalesce(lower(i.tipo), '') <> 'kit')
    union all
    select s.quantidade_solicitada * k.quantidade from separacoes_itens s join ped on ped.id = s.separacao_pedido_id join kit_itens k on k.kit_id = s.item_id
     where k.item_id = p_item
  ) x
$$;
revoke all on function public.acervo_pecas_fora(uuid, uuid) from public, anon, authenticated;

-- 4) App do Montador: itens do pedido (com a quantidade que saiu) e a contagem salva
create or replace function public.mont_contagem_itens(p_token text, p_etapa uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); e operacao_etapas; p separacoes_pedidos; r operacao_registros;
begin
  select * into e from operacao_etapas where id = p_etapa;
  if e.id is null or not mont_pode_ver(s, p_etapa) then raise exception 'Entre no app como responsável por esta etapa.'; end if;
  select * into p from separacoes_pedidos where id = e.pedido_id;
  select * into r from operacao_registros where etapa_id = p_etapa and tipo = 'contagem_itens';
  return jsonb_build_object('enviado', r.id is not null, 'quantidades', coalesce(r.dados->'itens', '{}'), 'autor', r.autor,
    'itens', coalesce((select jsonb_agg(jsonb_build_object('chave', c.chave, 'item_id', c.item_id, 'nome', c.nome, 'kit_nome', c.kit_nome, 'por_kit', c.por_kit,
        'esperado', coalesce((select (x->>'conferido')::numeric from jsonb_array_elements(coalesce(p.operacao->'carregamento'->'itens', '[]')) x where x->>'chave' = c.chave limit 1), c.esperado),
        'foto', (select foto_url from itens where id = c.item_id)) order by c.kit_nome nulls first, c.nome)
      from operacao_conferencia_pecas(p.id) c), '[]'));
end $$;
grant execute on function public.mont_contagem_itens(text, uuid) to anon, authenticated;

create or replace function public.mont_contagem_salvar(p_token text, p_etapa uuid, p_quantidades jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s app_sessoes := app_sessao(p_token, 'montador'); e operacao_etapas; c record; q jsonb := '{}'; v numeric;
begin
  select * into e from operacao_etapas where id = p_etapa;
  if e.id is null or not mont_pode_ver(s, p_etapa) then raise exception 'Entre no app como responsável por esta etapa.'; end if;
  if e.tipo <> 'desmontagem' then raise exception 'A contagem por item é da desmontagem.'; end if;
  if exists (select 1 from operacao_registros where etapa_id = p_etapa and tipo = 'desmontagem_concluida') then raise exception 'A desmontagem já foi concluída.'; end if;
  for c in select * from operacao_conferencia_pecas(e.pedido_id) loop
    v := nullif(p_quantidades->>c.chave, '')::numeric;
    if v is null or v < 0 or v <> trunc(v) then raise exception 'Informe a quantidade de: % (0 se não voltou).', c.nome; end if;
    q := q || jsonb_build_object(c.chave, v);
  end loop;
  insert into operacao_registros (empresa_id, etapa_id, tipo, dados, autor) values (e.empresa_id, p_etapa, 'contagem_itens', jsonb_build_object('itens', q, 'em', now()), s.nome)
  on conflict (etapa_id, tipo) do update set dados = excluded.dados, autor = excluded.autor, atualizado_em = now();
  return mont_contagem_itens(p_token, p_etapa);
end $$;
grant execute on function public.mont_contagem_salvar(text, uuid, jsonb) to anon, authenticated;

-- 5) Gestão do acervo: lista de divergências com o histórico das contagens
create or replace function public.acervo_divergencias(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'estoque.itens.visualizar') then raise exception 'Sem permissão.'; end if;
  return jsonb_build_object(
    'bloqueia', coalesce((select divergencia_bloqueia_item from empresa_logistica_regras where empresa_id = p_empresa), true),
    'contagens', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'item_id', g.item_id, 'status', g.status, 'contado', g.contado, 'esperado', g.esperado,
        'estoque', g.estoque, 'manutencao', g.manutencao, 'fora', g.fora, 'contado_por', g.contado_por_nome, 'contado_em', g.contado_em, 'criado_em', g.criado_em,
        'item', (select jsonb_build_object('nome', coalesce(i.descricao_total, i.produto), 'codigo', i.codigo, 'foto', i.foto_url) from itens i where i.id = g.item_id)) order by g.criado_em)
       from acervo_contagens_gerais g where g.empresa_id = p_empresa and (g.status = 'pendente' or g.concluida_em > now() - interval '60 days')), '[]'),
    'divergencias', coalesce((select jsonb_agg(d order by d->>'criado_em') from (
      select jsonb_build_object('id', o.id, 'item_id', o.item_id, 'tipo', o.tipo, 'etapa', o.etapa, 'quantidade', o.quantidade, 'esperado', o.esperado, 'conferido', o.conferido,
        'resolvida_em', o.resolvida_em, 'resolucao', o.resolucao, 'resolvido_por', o.resolvido_por_nome, 'criado_em', o.criado_em, 'chave', regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', ''),
        'pedido', jsonb_build_object('id', p.id, 'numero', p.numero_pedido, 'cliente', p.cliente_nome, 'local', p.local_nome, 'data', p.data_evento),
        'historico', jsonb_build_object(
          'carregamento', (select (x->>'conferido')::numeric from jsonb_array_elements(coalesce(p.operacao->'carregamento'->'itens', '[]')) x where x->>'chave' = regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', '') limit 1),
          'desmontagem', (select (r.dados->'itens'->>regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', ''))::numeric from operacao_registros r join operacao_etapas e on e.id = r.etapa_id
                           where e.pedido_id = p.id and e.tipo = 'desmontagem' and r.tipo = 'contagem_itens' limit 1),
          'desmontagem_por', (select r.autor from operacao_registros r join operacao_etapas e on e.id = r.etapa_id where e.pedido_id = p.id and e.tipo = 'desmontagem' and r.tipo = 'contagem_itens' limit 1),
          'descarregamento', (select (x->>'conferido')::numeric from jsonb_array_elements(coalesce(p.operacao->'descarregamento'->'itens', '[]')) x where x->>'chave' = regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', '') limit 1),
          'descarregamento_1', (p.operacao->'descarregamento'->'primeira_contagem'->>regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', ''))::numeric,
          'triagem', (select (x->>'conferido')::numeric from jsonb_array_elements(coalesce(p.operacao->'retorno'->'itens', '[]')) x where x->>'chave' = regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', '') limit 1),
          'triagem_1', (p.operacao->'retorno'->'primeira_contagem'->>regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', ''))::numeric,
          'saiu', (select c.esperado from operacao_conferencia_pecas(p.id) c where c.chave = regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', '') limit 1))) d
        from operacao_ocorrencias o join separacoes_pedidos p on p.id = o.pedido_id
       where o.empresa_id = p_empresa and o.tipo in ('falta', 'sobra') and coalesce(o.etapa, '') in ('retorno', 'descarregamento')
         and (o.resolvida_em is null or o.resolvida_em > now() - interval '60 days')) z), '[]'));
end $$;
grant execute on function public.acervo_divergencias(uuid) to authenticated;

-- 6) Contagem geral: o contador informa quantas unidades há no galpão; o sistema compara e sugere
create or replace function public.acervo_contagem_registrar(p_empresa uuid, p_contagem uuid, p_contado numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare g acervo_contagens_gerais; i itens; v_fora numeric; esp numeric;
begin
  if not operacao_pode(p_empresa, 'estoque.itens.editar') then raise exception 'Sem permissão para registrar a contagem.'; end if;
  select * into g from acervo_contagens_gerais where id = p_contagem and empresa_id = p_empresa for update;
  if g.id is null or g.status <> 'pendente' then raise exception 'Contagem não encontrada ou já concluída.'; end if;
  if p_contado is null or p_contado < 0 or p_contado <> trunc(p_contado) then raise exception 'Informe quantas unidades há no galpão.'; end if;
  select * into i from itens where id = g.item_id;
  v_fora := acervo_pecas_fora(p_empresa, g.item_id);
  esp := greatest(coalesce(i.estoque_total, 0) - coalesce(i.estoque_manutencao, 0) - v_fora, 0);
  update acervo_contagens_gerais set contado = p_contado, esperado = esp, estoque = coalesce(i.estoque_total, 0), manutencao = coalesce(i.estoque_manutencao, 0), fora = v_fora,
         contado_por = auth.uid(), contado_por_nome = logistica_nome_usuario(p_empresa), contado_em = now()
   where id = g.id;
  return acervo_divergencias(p_empresa);
end $$;
grant execute on function public.acervo_contagem_registrar(uuid, uuid, numeric) to authenticated;

-- 7) Fechar cada divergência pela Gestão do acervo (depois da contagem geral), com o mesmo motivo/regra de sempre
create or replace function public.acervo_divergencia_fechar(p_empresa uuid, p_id uuid, p_contagem numeric, p_motivo uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare o operacao_ocorrencias; r jsonb;
begin
  if not operacao_pode(p_empresa, 'estoque.itens.editar') then raise exception 'Sem permissão para resolver divergências.'; end if;
  select * into o from operacao_ocorrencias where id = p_id and empresa_id = p_empresa;
  if o.id is null then raise exception 'Divergência não encontrada.'; end if;
  if exists (select 1 from acervo_contagens_gerais where item_id = o.item_id and status = 'pendente' and contado is null) then
    raise exception 'Faça a contagem geral do item no galpão antes de resolver.';
  end if;
  r := operacao_fechar_divergencia_core(p_id, p_contagem, p_motivo);
  if not exists (select 1 from operacao_ocorrencias x where x.empresa_id = p_empresa and x.item_id = o.item_id and x.tipo in ('falta', 'sobra')
                  and coalesce(x.etapa, '') in ('retorno', 'descarregamento') and x.resolvida_em is null) then
    update acervo_contagens_gerais set status = 'concluida', concluida_em = now() where item_id = o.item_id and status = 'pendente';
  end if;
  return r;
end $$;
grant execute on function public.acervo_divergencia_fechar(uuid, uuid, numeric, uuid) to authenticated;

create or replace function public.acervo_parametros_salvar(p_empresa uuid, p_bloqueia boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not operacao_pode(p_empresa, 'configuracoes.empresa.editar') then raise exception 'Sem permissão para editar os parâmetros.'; end if;
  insert into empresa_logistica_regras (empresa_id, divergencia_bloqueia_item) values (p_empresa, coalesce(p_bloqueia, true))
  on conflict (empresa_id) do update set divergencia_bloqueia_item = coalesce(p_bloqueia, true), updated_at = now();
end $$;
grant execute on function public.acervo_parametros_salvar(uuid, boolean) to authenticated;

-- 8) disponibilidade com o bloqueio
CREATE OR REPLACE FUNCTION public.operacao_livre_calc(p_empresa uuid, p_inicio date, p_fim date, p_pedido uuid DEFAULT NULL::uuid)
 RETURNS TABLE(item_id uuid, total numeric, manutencao numeric, reservado numeric, bloqueado numeric, livre numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with dias as (
    select d::date dia from generate_series(p_inicio::timestamp, greatest(p_inicio, p_fim)::timestamp, interval '1 day') d
  ), ped as (
    select p.id, coalesce(p.data_entrega, p.data_evento) ini, coalesce(p.data_coleta, p.data_evento_fim, p.data_evento) fim
      from separacoes_pedidos p
     where p.empresa_id = p_empresa and p.id is distinct from p_pedido
       and p.status_comercial in ('pre_reserva', 'aprovado', 'enviado', 'finalizado')
       and coalesce(p.status, '') <> 'cancelado' and p.encerrado_operacional_em is null
       and coalesce(p.data_entrega, p.data_evento) <= greatest(p_inicio, p_fim)
       and coalesce(p.data_coleta, p.data_evento_fim, p.data_evento) >= p_inicio
  ), linhas as (
    select s.item_id, s.quantidade_solicitada q, ped.ini, ped.fim from separacoes_itens s join ped on ped.id = s.separacao_pedido_id
  ), pecas_res as (
    select l.item_id, l.q, l.ini, l.fim from linhas l join itens i on i.id = l.item_id
     where coalesce(lower(i.tipo), '') <> 'kit' or not exists (select 1 from kit_itens k where k.kit_id = i.id)
    union all
    select k.item_id, l.q * k.quantidade, l.ini, l.fim from linhas l join itens i on i.id = l.item_id and lower(i.tipo) = 'kit'
      join kit_itens k on k.kit_id = i.id
  ), res_dia as (
    select pr.item_id, d.dia, sum(pr.q) q from pecas_res pr join dias d on d.dia between pr.ini and pr.fim group by 1, 2
  ), bloq_dia as (
    select b.item_id, d.dia, b.quantidade q from dias d cross join lateral public.operacao_bloqueios_calc(p_empresa, d.dia) b
  ), comb as (
    select x.item_id, x.dia, sum(x.r) r, sum(x.b) b
      from (select item_id, dia, q r, 0::numeric b from res_dia union all select item_id, dia, 0, q from bloq_dia) x
     group by 1, 2
  ), pior as (
    select distinct on (item_id) item_id, r, b from comb order by item_id, (r + b) desc
  ), pecas as (
    select i.id, coalesce(i.estoque_total, 0)::numeric tot, coalesce(i.estoque_manutencao, 0)::numeric man,
           coalesce(pi.r, 0)::numeric res, coalesce(pi.b, 0)::numeric blo,
           case when public.acervo_item_bloqueado(p_empresa, i.id) then 0
                else greatest(0, coalesce(i.estoque_total, 0) - coalesce(i.estoque_manutencao, 0) - coalesce(pi.r, 0) - coalesce(pi.b, 0)) end::numeric liv
      from itens i left join pior pi on pi.item_id = i.id
     where i.empresa_id = p_empresa
  ), kits as (
    select k.kit_id id, min(floor(pc.tot / nullif(k.quantidade, 0)))::numeric tot, min(floor(pc.liv / nullif(k.quantidade, 0)))::numeric liv
      from kit_itens k join pecas pc on pc.id = k.item_id
     where k.empresa_id = p_empresa
     group by k.kit_id
  )
  select pc.id, coalesce(kt.tot, pc.tot), pc.man, pc.res, pc.blo, coalesce(kt.liv, pc.liv)
    from pecas pc left join kits kt on kt.id = pc.id;
$function$
;

-- 9) reserva com o bloqueio
CREATE OR REPLACE FUNCTION public.operacao_validar_reserva(p_empresa uuid, p_pedido uuid, p_itens jsonb, p_inicio date, p_fim date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d record; identificacao text;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Informe um período válido para reservar os materiais'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_empresa::text, 0));
  if exists (select 1 from jsonb_array_elements(p_itens) x join itens i on i.id = (x->>'item_id')::uuid where lower(i.tipo) = 'kit' and not exists (select 1 from kit_itens where kit_id = i.id)) then
    raise exception 'Cadastre os componentes do kit antes de reservar'; end if;
  if exists (select 1 from jsonb_array_elements(p_itens) x left join itens i on i.id = (x->>'item_id')::uuid and i.empresa_id = p_empresa where i.id is null) then
    raise exception 'Componente não pertence à empresa'; end if;
  for d in
    with lista as (select (x->>'item_id')::uuid id, sum((x->>'quantidade_solicitada')::numeric) qtd from jsonb_array_elements(p_itens) x group by 1),
    pecas as (
      select l.id, l.qtd from lista l join itens i on i.id = l.id where coalesce(lower(i.tipo), '') <> 'kit'
      union all select k.item_id, l.qtd * k.quantidade from lista l join itens i on i.id = l.id and lower(i.tipo) = 'kit' join kit_itens k on k.kit_id = i.id
    ), nec as (select id, sum(qtd) qtd from pecas group by id),
    atual as (
      select x.id, sum(x.q) q from (
        select s.item_id id, s.quantidade_solicitada q from separacoes_itens s join itens i on i.id = s.item_id where s.separacao_pedido_id = p_pedido and coalesce(lower(i.tipo), '') <> 'kit'
        union all select k.item_id, s.quantidade_solicitada * k.quantidade from separacoes_itens s join kit_itens k on k.kit_id = s.item_id where s.separacao_pedido_id = p_pedido) x group by 1)
    select n.id, n.qtd, l.total, l.manutencao, l.reservado, l.bloqueado, l.livre
      from nec n join public.operacao_livre_calc(p_empresa, p_inicio, p_fim, p_pedido) l on l.item_id = n.id
     where n.qtd > l.livre and not (public.acervo_item_bloqueado(p_empresa, n.id) and n.qtd <= coalesce((select a.q from atual a where a.id = n.id), 0))
  loop
    select coalesce(codigo || ' - ', '') || coalesce(produto, 'Item') into identificacao from itens where id = d.id;
    if public.acervo_item_bloqueado(p_empresa, d.id) then
      raise exception 'Item bloqueado: %. Teve divergência de contagem num evento e aguarda a contagem geral na Gestão do acervo.', identificacao;
    end if;
    raise exception 'Estoque insuficiente: %. Necessário para este pedido: %; disponível no período: %. Estoque: %; manutenção: %; reservado: %; bloqueado: %. Em kits, a quantidade se refere ao componente.',
      identificacao, d.qtd, d.livre, d.total, d.manutencao, d.reservado, d.bloqueado;
  end loop;
end $function$
;

-- 10) montador
CREATE OR REPLACE FUNCTION public.mont_registro_salvar(p_token text, p_etapa uuid, p_tipo text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    if not exists (select 1 from operacao_registros where etapa_id = p_etapa and tipo = 'contagem_itens') then
      raise exception 'Lance a contagem de cada item (a partir da lista) antes de concluir.';
    end if;
  end if;
  insert into operacao_registros (empresa_id, etapa_id, tipo, dados, autor) values (e.empresa_id, p_etapa, p_tipo, dados, s.nome)
  on conflict (etapa_id, tipo) do update set dados = excluded.dados, autor = excluded.autor, atualizado_em = now();
  return dados || jsonb_build_object('enviado', true);
end $function$
;

-- 11) fechar divergência
CREATE OR REPLACE FUNCTION public.operacao_fechar_divergencia_core(p_id uuid, p_contagem numeric, p_motivo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o public.operacao_ocorrencias; m public.logistica_motivos; e numeric; dif numeric; sit text; nome text;
  quem text:=coalesce(auth.jwt()->>'email','Equipe');
begin
  select * into strict o from public.operacao_ocorrencias where id=p_id for update;
  if o.resolvida_em is not null then raise exception 'Esta divergência já foi resolvida'; end if;
  if o.tipo not in ('falta','sobra') then raise exception 'Não é uma divergência de conferência'; end if;
  if p_contagem is null or p_contagem<0 or p_contagem<>trunc(p_contagem) then raise exception 'Informe a quantidade da 2ª conferência'; end if;
  e:=coalesce(o.esperado, case when o.tipo='falta' then coalesce(o.conferido,0)+o.quantidade end);
  if e is null then raise exception 'Esta divergência não tem a quantidade esperada'; end if;
  if o.tipo='falta' and p_contagem>e then raise exception 'A 2ª conferência (%) passou do esperado (%): conte de novo', trim_scale(p_contagem), trim_scale(e); end if;
  if o.tipo='sobra' and p_contagem<e then raise exception 'A 2ª conferência (%) ficou abaixo do esperado (%): conte de novo', trim_scale(p_contagem), trim_scale(e); end if;
  sit:=case when p_contagem=e then 'bateu' else 'continua' end;
  select * into m from public.logistica_motivos
   where id=p_motivo_id and empresa_id=o.empresa_id and etapa='divergencia_'||o.tipo and ativo;
  if m.id is null then raise exception 'Escolha o motivo (cadastrado em Parâmetros > Operação)'; end if;
  if coalesce(m.situacao,sit)<>sit then
    raise exception 'O motivo "%" não combina com a 2ª conferência: %', m.nome,
      case when sit='bateu' then 'a quantidade bateu com o esperado' when o.tipo='falta' then 'ainda faltam '||trim_scale(e-p_contagem)
           else 'ainda há '||trim_scale(p_contagem-e)||' a mais' end;
  end if;
  nome:=coalesce((select nullif(btrim(f.nome),'') from public.funcionarios_acesso f where f.id=auth.uid() and f.empresa_id=o.empresa_id),
                 (select nullif(btrim(u.nome),'') from public.usuarios u where u.id=auth.uid()), quem);
  update public.operacao_ocorrencias set segunda_contagem=p_contagem, motivo_id=m.id, resolvido_por=auth.uid(), resolvido_por_nome=nome, resultado=sit
   where id=o.id;
  if sit='bateu' then
    update public.operacao_ocorrencias set resolvida_em=now(),
      resolucao='2ª conferência bateu ('||trim_scale(p_contagem)||' de '||trim_scale(e)||') — '||m.nome||' — '||quem where id=o.id;
    return jsonb_build_object('resolvida',true,'resultado',sit);
  end if;
  if o.tipo='sobra' then
    update public.operacao_ocorrencias set resolvida_em=now(),
      resolucao='Confirmado '||trim_scale(p_contagem-e)||' a mais na 2ª conferência ('||trim_scale(p_contagem)||' de '||trim_scale(e)||') — '||m.nome||' — '||quem where id=o.id;
    return jsonb_build_object('resolvida',true,'resultado',sit);
  end if;
  dif:=e-p_contagem;
  if dif>o.quantidade then raise exception 'A 2ª conferência (%) não pode ser menor que a 1ª (%)', trim_scale(p_contagem), trim_scale(e-o.quantidade); end if;
  update public.operacao_ocorrencias set quantidade=dif where id=o.id;
  if exists(select 1 from public.acervo_retornos a where a.pedido_id=o.pedido_id and a.item_id=o.item_id) then
    update public.operacao_ocorrencias set resolvida_em=now(),
      resolucao='Perda de '||trim_scale(dif)||' confirmada na 2ª conferência ('||trim_scale(p_contagem)||' de '||trim_scale(e)||'; baixa no Retorno do acervo) — '||m.nome||' — '||quem where id=o.id;
    return jsonb_build_object('resolvida',true,'resultado',sit,'perda',dif,'acervo',true);
  end if;
  perform public.operacao_resolver_ocorrencia(p_id,'perda','2ª conferência '||trim_scale(p_contagem)||' de '||trim_scale(e)||' — '||m.nome||' — '||quem);
  return jsonb_build_object('resolvida',true,'resultado',sit,'perda',dif);
end $function$
;
revoke all on function public.operacao_fechar_divergencia_core(uuid, numeric, uuid) from public, anon, authenticated;

create or replace function public.operacao_fechar_divergencia(p_id uuid, p_contagem numeric, p_motivo_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.operacao_ocorrencias;
begin
  select * into strict o from public.operacao_ocorrencias where id = p_id;
  if not public.eh_membro_empresa(o.empresa_id) or not public.funcionario_tabela_permitida(o.empresa_id, 'separacoes_pedidos', 'editar') then
    raise exception 'Sem permissão para resolver divergências';
  end if;
  return public.operacao_fechar_divergencia_core(p_id, p_contagem, p_motivo_id);
end $$;
