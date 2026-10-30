-- (28/out/2026) Disponibilidade: uma regra só, sem contar a mesma peça duas vezes.
-- Problemas corrigidos:
--  1. Peça que voltou da coleta (Acervo "aguardando retorno"/triagem/limpeza...) era bloqueada em QUALQUER data e,
--     dentro do período do próprio pedido, contava também como reservada por ele (dobro). Agora o bloqueio de um
--     pedido só vale depois do fim do período dele (até lá a reserva já cobre a peça).
--  2. Trânsito (etiqueta carregada sem retorno), Acervo e ocorrência de avaria do MESMO pedido e peça somavam entre si.
--     Agora vale o maior dos três (são as mesmas peças físicas). A ocorrência ligada a um pedido segue a regra do item 1.
--  3. O catálogo dentro do pedido contava o próprio pedido como reservado por outro. As funções aceitam p_pedido
--     (o pedido aberto fica fora da conta) e o período inteiro (entrega → coleta), como o salvar já fazia.
--  4. Catálogo (operacao_disponibilidade_calc) ignorava o Acervo e olhava só um dia; salvar olhava o período e o Acervo.
--     Todas passam pela mesma operacao_livre_calc.

-- Bloqueios detalhados numa data (peças fisicamente fora: em trânsito, no Acervo, em avaria/limpeza/manutenção).
create or replace function public.operacao_bloqueios_detalhe(p_empresa uuid, p_data date)
returns table(item_id uuid, pedido_id uuid, motivo text, quantidade numeric)
language sql stable security definer set search_path = public as $$
  with ped as (
    select p.id, coalesce(p.data_coleta, p.data_evento_fim, p.data_evento) fim from separacoes_pedidos p where p.empresa_id = p_empresa
  ), transito as (
    select e.item_id, p.id pedido_id, count(*)::numeric qtd
      from separacoes_etiquetas e join separacoes_pedidos p on p.id = e.separacao_pedido_id
     where p.empresa_id = p_empresa and e.lida_carregamento_em is not null and e.lida_retorno_em is null
       and coalesce(p.data_coleta, p.data_evento) < p_data
       and not exists (select 1 from operacao_ocorrencias o where o.pedido_id = p.id and o.codigo = e.codigo and o.resolucao like 'Perda confirmada:%')
     group by e.item_id, p.id
  ), baixado as (
    select a.item_id, a.pedido_id, sum(a.quantidade) qtd from acervo_retornos a
     where a.empresa_id = p_empresa and a.estado = 'baixado' group by a.item_id, a.pedido_id
  ), acervo as (
    select a.item_id, a.pedido_id, sum(a.quantidade) qtd, string_agg(distinct a.estado, ', ') estados
      from acervo_retornos a left join ped on ped.id = a.pedido_id
     where a.empresa_id = p_empresa and a.estado not in ('liberado', 'baixado')
       and (ped.id is null or ped.fim is null or p_data > ped.fim)
     group by a.item_id, a.pedido_id
  ), ocorr as (
    select o.item_id, o.pedido_id, sum(o.quantidade) qtd, string_agg(distinct o.tipo, ', ') tipos
      from operacao_ocorrencias o left join ped on ped.id = o.pedido_id
     where o.empresa_id = p_empresa and o.resolvida_em is null and o.tipo in ('avaria', 'limpeza', 'manutencao') and o.item_id is not null
       and (ped.id is null or ped.fim is null or p_data > ped.fim)
     group by o.item_id, o.pedido_id
  ), chaves as (
    select t.item_id, t.pedido_id from transito t union select a.item_id, a.pedido_id from acervo a
    union select o.item_id, o.pedido_id from ocorr o where o.pedido_id is not null
  ), por_pedido as (
    select c.item_id, c.pedido_id,
           greatest(0, coalesce(t.qtd, 0) - coalesce(b.qtd, 0)) tq, coalesce(a.qtd, 0) aq, coalesce(o.qtd, 0) oq, a.estados, o.tipos
      from chaves c
      left join transito t on t.item_id = c.item_id and t.pedido_id is not distinct from c.pedido_id
      left join baixado b on b.item_id = c.item_id and b.pedido_id is not distinct from c.pedido_id
      left join acervo a on a.item_id = c.item_id and a.pedido_id is not distinct from c.pedido_id
      left join ocorr o on o.item_id = c.item_id and o.pedido_id is not distinct from c.pedido_id
  )
  select item_id, pedido_id,
         case when aq >= tq and aq >= oq then 'Acervo: ' || estados when oq >= tq then tipos else 'Retorno pendente' end,
         greatest(tq, aq, oq)
    from por_pedido where greatest(tq, aq, oq) > 0
  union all
  select o.item_id, null, o.tipos, o.qtd from ocorr o where o.pedido_id is null;
$$;

create or replace function public.operacao_bloqueios_calc(p_empresa uuid, p_data date)
returns table(item_id uuid, quantidade numeric)
language sql stable security definer set search_path = public as $$
  select d.item_id, sum(d.quantidade) from public.operacao_bloqueios_detalhe(p_empresa, p_data) d group by d.item_id;
$$;

-- Livre por peça num período (pior dia), sem o pedido p_pedido. Kit = componente mais limitado.
create or replace function public.operacao_livre_calc(p_empresa uuid, p_inicio date, p_fim date, p_pedido uuid default null)
returns table(item_id uuid, total numeric, manutencao numeric, reservado numeric, bloqueado numeric, livre numeric)
language sql stable security definer set search_path = public as $$
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
           greatest(0, coalesce(i.estoque_total, 0) - coalesce(i.estoque_manutencao, 0) - coalesce(pi.r, 0) - coalesce(pi.b, 0))::numeric liv
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
$$;

revoke all on function public.operacao_bloqueios_detalhe(uuid, date) from public, anon, authenticated;
revoke all on function public.operacao_bloqueios_calc(uuid, date) from public, anon, authenticated;
revoke all on function public.operacao_livre_calc(uuid, date, date, uuid) from public, anon, authenticated;
grant execute on function public.operacao_bloqueios_detalhe(uuid, date) to service_role;
grant execute on function public.operacao_bloqueios_calc(uuid, date) to service_role;
grant execute on function public.operacao_livre_calc(uuid, date, date, uuid) to service_role;

-- Mesma assinatura de sempre (catalogo_estoque, telas antigas).
create or replace function public.operacao_disponibilidade_calc(p_empresa uuid, p_data date)
returns table(item_id uuid, total numeric, livre numeric)
language sql stable security definer set search_path = public as $$
  select l.item_id, l.total, l.livre from public.operacao_livre_calc(p_empresa, p_data, p_data, null) l;
$$;

create or replace function public.operacao_indisponiveis(p_empresa uuid, p_data date)
returns table(item_id uuid, quantidade numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.eh_membro_empresa(p_empresa) then return; end if;
  return query select * from public.operacao_bloqueios_calc(p_empresa, p_data);
end $$;

-- Helena: no pedido aberto, o próprio pedido não conta.
drop function if exists public.operacao_disponibilidade(uuid, date);
create function public.operacao_disponibilidade(p_empresa uuid, p_data date, p_pedido uuid default null)
returns table(item_id uuid, total numeric, livre numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.eh_membro_empresa(p_empresa) then
    raise exception 'Sem acesso a esta empresa';
  end if;
  return query select l.item_id, l.total, l.livre from public.operacao_livre_calc(p_empresa, p_data, p_data, p_pedido) l;
end $$;
revoke all on function public.operacao_disponibilidade(uuid, date, uuid) from public, anon;
grant execute on function public.operacao_disponibilidade(uuid, date, uuid) to authenticated, service_role;

create or replace function public.operacao_validar_reserva(p_empresa uuid, p_pedido uuid, p_itens jsonb, p_inicio date, p_fim date)
returns void language plpgsql security definer set search_path = public as $$
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
    ), nec as (select id, sum(qtd) qtd from pecas group by id)
    select n.id, n.qtd, l.total, l.manutencao, l.reservado, l.bloqueado, l.livre
      from nec n join public.operacao_livre_calc(p_empresa, p_inicio, p_fim, p_pedido) l on l.item_id = n.id
     where n.qtd > l.livre
  loop
    select coalesce(codigo || ' - ', '') || coalesce(produto, 'Item') into identificacao from itens where id = d.id;
    raise exception 'Estoque insuficiente: %. Necessário para este pedido: %; disponível no período: %. Estoque: %; manutenção: %; reservado: %; bloqueado: %. Em kits, a quantidade se refere ao componente.',
      identificacao, d.qtd, d.livre, d.total, d.manutencao, d.reservado, d.bloqueado;
  end loop;
end $$;

create or replace function public.pedido_disponibilidade_comercial(p_empresa uuid, p_pedido uuid, p_itens jsonb, p_inicio date, p_fim date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare alertas jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Informe um período válido para reservar os materiais'; end if;
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not (
    funcionario_pode(p_empresa, auth.uid(), 'comercial.pedidos.visualizar') or funcionario_pode(p_empresa, auth.uid(), 'comercial.pedidos.criar')) then
    raise exception 'Sem permissao para consultar disponibilidade' using errcode = '42501'; end if;
  if exists (select 1 from jsonb_array_elements(p_itens) x left join itens i on i.id = (x->>'item_id')::uuid and i.empresa_id = p_empresa
     where i.id is null or coalesce((x->>'quantidade_solicitada')::numeric, 0) <= 0) then
    raise exception 'Item inválido ou não pertence à empresa'; end if;
  if exists (select 1 from jsonb_array_elements(p_itens) x join itens i on i.id = (x->>'item_id')::uuid where lower(i.tipo) = 'kit' and not exists (select 1 from kit_itens where kit_id = i.id)) then
    raise exception 'Cadastre os componentes do kit antes de reservar'; end if;
  with lista as (select (x->>'item_id')::uuid id, sum((x->>'quantidade_solicitada')::numeric) qtd from jsonb_array_elements(p_itens) x group by 1),
  pecas as (
    select l.id, l.qtd from lista l join itens i on i.id = l.id where coalesce(lower(i.tipo), '') <> 'kit'
    union all select k.item_id, l.qtd * k.quantidade from lista l join itens i on i.id = l.id and lower(i.tipo) = 'kit' join kit_itens k on k.kit_id = i.id
  ), nec as (select id, sum(qtd) qtd from pecas group by id),
  faltas as (
    select n.id, n.qtd, l.livre from nec n join public.operacao_livre_calc(p_empresa, p_inicio, p_fim, p_pedido) l on l.item_id = n.id where n.qtd > l.livre
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'origens', (select coalesce(jsonb_agg(distinct x->>'item_id'), '[]') from jsonb_array_elements(p_itens) x
                where (x->>'item_id')::uuid = f.id or exists (select 1 from kit_itens k join itens i on i.id = k.kit_id and lower(i.tipo) = 'kit'
                  where k.kit_id = (x->>'item_id')::uuid and k.item_id = f.id)),
    'componente_id', f.id,
    'descricao', (select coalesce(codigo || ' - ', '') || coalesce(produto, 'Item') from itens where id = f.id),
    'necessario', f.qtd, 'disponivel', f.livre, 'faltante', f.qtd - f.livre)), '[]') into alertas from faltas f;
  return alertas;
end $$;

-- Catálogo dentro do pedido: período do pedido e o próprio pedido fora da conta.
drop function if exists public.pedido_catalogo_estoque(date, uuid);
create function public.pedido_catalogo_estoque(p_data date, p_empresa_id uuid, p_pedido uuid default null, p_inicio date default null, p_fim date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_est boolean; v_disp boolean; v_ini date; v_fim date;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa_id) or not (
    funcionario_pode(p_empresa_id, auth.uid(), 'comercial.pedidos.visualizar') or funcionario_pode(p_empresa_id, auth.uid(), 'comercial.pedidos.criar')) then
    raise exception 'Sem permissão para consultar estoque do pedido' using errcode = '42501';
  end if;
  v_est := catalogo_parametro_permite(p_empresa_id, 'estoque', 'equipe', null);
  v_disp := catalogo_parametro_permite(p_empresa_id, 'disponivel', 'equipe', null);
  if not v_est and not v_disp then return '{}'::jsonb; end if;
  v_ini := coalesce(p_inicio, p_data); v_fim := coalesce(p_fim, v_ini);
  if v_ini is null then raise exception 'Informe a data'; end if;
  if v_fim < v_ini or v_fim - v_ini > 60 then v_fim := v_ini; end if;
  return coalesce((select jsonb_object_agg(d.item_id::text, jsonb_build_array(case when v_est then d.total end, case when v_disp then d.livre end))
    from operacao_livre_calc(p_empresa_id, v_ini, v_fim, p_pedido) d), '{}'::jsonb);
end $$;
revoke all on function public.pedido_catalogo_estoque(date, uuid, uuid, date, date) from public, anon;
grant execute on function public.pedido_catalogo_estoque(date, uuid, uuid, date, date) to authenticated, service_role;

-- Quadro "Estoque e reservas" do card: lista todos os pedidos (inclusive o aberto, marcado na tela), mas o livre não
-- desconta o pedido aberto; bloqueios pela mesma regra (sem duplicar trânsito/Acervo/avaria).
drop function if exists public.pedido_estoque_detalhes(uuid, uuid, date);
create function public.pedido_estoque_detalhes(p_empresa_id uuid, p_item_id uuid, p_data date, p_pedido uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare resultado jsonb;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa_id) or not (
    funcionario_pode(p_empresa_id, auth.uid(), 'comercial.pedidos.visualizar') or funcionario_pode(p_empresa_id, auth.uid(), 'comercial.pedidos.criar')) then
    raise exception 'Sem permissão para consultar reservas' using errcode = '42501'; end if;
  if not catalogo_parametro_permite(p_empresa_id, 'disponivel', 'equipe', null) then
    raise exception 'Consulta de disponibilidade desativada' using errcode = '42501'; end if;
  if p_data is null or not exists (select 1 from itens where id = p_item_id and empresa_id = p_empresa_id) then
    raise exception 'Item ou data inválidos'; end if;
  with componentes as (
    select k.item_id, sum(k.quantidade)::numeric necessario from kit_itens k
      join itens i on i.id = k.kit_id and lower(i.tipo) = 'kit' and i.empresa_id = p_empresa_id
     where k.kit_id = p_item_id group by k.item_id
    union all
    select p_item_id, 1::numeric where not exists (select 1 from kit_itens k join itens i on i.id = k.kit_id and lower(i.tipo) = 'kit' where k.kit_id = p_item_id)
  ), reservas as (
    select s.item_id, s.quantidade_solicitada qtd, p.id pedido_id,
      coalesce(to_jsonb(p)->>'numero_pedido', to_jsonb(p)->>'numero', p.id::text) numero,
      coalesce(to_jsonb(p)->>'cliente_nome', 'Cliente não informado') cliente,
      p.data_evento evento, p.local_nome local, p.status_comercial situacao,
      coalesce(p.data_entrega, p.data_evento) inicio, coalesce(p.data_coleta, p.data_evento_fim, p.data_evento) fim
      from separacoes_itens s join separacoes_pedidos p on p.id = s.separacao_pedido_id
     where p.empresa_id = p_empresa_id and p.status_comercial in ('pre_reserva', 'aprovado', 'enviado', 'finalizado')
       and coalesce(p.status, '') <> 'cancelado' and p.encerrado_operacional_em is null
       and p_data between coalesce(p.data_entrega, p.data_evento) and coalesce(p.data_coleta, p.data_evento_fim, p.data_evento)
  ), expandidas as (
    select r.item_id, r.qtd, r.pedido_id, r.numero, r.cliente, r.evento, r.local, r.situacao, r.inicio, r.fim from reservas r join itens i on i.id = r.item_id
     where coalesce(lower(i.tipo), '') <> 'kit' or not exists (select 1 from kit_itens where kit_id = i.id)
    union all
    select k.item_id, r.qtd * k.quantidade, r.pedido_id, r.numero, r.cliente, r.evento, r.local, r.situacao, r.inicio, r.fim
      from reservas r join itens i on i.id = r.item_id and lower(i.tipo) = 'kit' join kit_itens k on k.kit_id = i.id
  ), pedidos as (
    select e.item_id, e.pedido_id, e.numero, e.cliente, e.evento, e.local, e.situacao, e.inicio, e.fim, sum(e.qtd) quantidade
      from expandidas e join componentes c on c.item_id = e.item_id
     group by e.item_id, e.pedido_id, e.numero, e.cliente, e.evento, e.local, e.situacao, e.inicio, e.fim
  ), bloqueios as (
    select b.item_id, b.pedido_id, (select p.numero_pedido::text from separacoes_pedidos p where p.id = b.pedido_id) numero, b.motivo, b.quantidade
      from operacao_bloqueios_detalhe(p_empresa_id, p_data) b join componentes c on c.item_id = b.item_id
  ), disponibilidade as (
    select c.item_id, c.necessario, i.codigo, i.produto,
      coalesce(nullif(i.foto_url, ''), (select origem.foto_url from itens origem where origem.id = p_item_id and origem.empresa_id = p_empresa_id)) foto_url,
      coalesce(i.estoque_total, 0) estoque, coalesce(i.estoque_manutencao, 0) manutencao,
      coalesce((select sum(p.quantidade) from pedidos p where p.item_id = c.item_id and p.pedido_id is distinct from p_pedido), 0) reservado,
      coalesce((select sum(b.quantidade) from bloqueios b where b.item_id = c.item_id), 0) bloqueado
      from componentes c join itens i on i.id = c.item_id and i.empresa_id = p_empresa_id
  ) select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', d.item_id, 'codigo', d.codigo, 'nome', d.produto, 'foto_url', d.foto_url, 'necessario', d.necessario, 'estoque', d.estoque,
    'manutencao', d.manutencao, 'reservado', d.reservado, 'bloqueado', d.bloqueado,
    'livre', greatest(0, d.estoque - d.manutencao - d.reservado - d.bloqueado),
    'pedidos', coalesce((select jsonb_agg(to_jsonb(p) - 'item_id' order by p.inicio, p.numero) from pedidos p where p.item_id = d.item_id), '[]'),
    'bloqueios', coalesce((select jsonb_agg(to_jsonb(b) - 'item_id') from bloqueios b where b.item_id = d.item_id), '[]')
  ) order by d.codigo), '[]') into resultado from disponibilidade d;
  return jsonb_build_object('data', p_data, 'componentes', resultado);
end $$;
revoke all on function public.pedido_estoque_detalhes(uuid, uuid, date, uuid) from public, anon;
grant execute on function public.pedido_estoque_detalhes(uuid, uuid, date, uuid) to authenticated, service_role;
