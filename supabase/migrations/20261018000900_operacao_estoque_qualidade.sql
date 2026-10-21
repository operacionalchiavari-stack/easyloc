begin;
create table public.qualidade_inspecoes (
  id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),
  item_id uuid not null references public.itens(id),criado_por uuid default auth.uid(),criado_em timestamptz not null default now(),dados jsonb not null
);
alter table public.qualidade_inspecoes enable row level security;
create policy qualidade_equipe on public.qualidade_inspecoes for all to authenticated
using(public.eh_membro_empresa(empresa_id) and public.funcionario_tabela_permitida(empresa_id,'itens','editar'))
with check(public.eh_membro_empresa(empresa_id) and public.funcionario_tabela_permitida(empresa_id,'itens','editar') and exists(select 1 from public.itens i where i.id=item_id and i.empresa_id=qualidade_inspecoes.empresa_id));
grant select,insert on public.qualidade_inspecoes to authenticated;

create or replace function public.operacao_indisponiveis(p_empresa uuid,p_data date)
returns table(item_id uuid,quantidade numeric) language sql security definer set search_path=public stable as $$
  select b.item_id,sum(b.qtd) from (
    select e.item_id,1::numeric qtd from public.separacoes_etiquetas e join public.separacoes_pedidos p on p.id=e.separacao_pedido_id
    where p.empresa_id=p_empresa and public.eh_membro_empresa(p_empresa)
      and e.lida_carregamento_em is not null and e.lida_retorno_em is null and coalesce(p.data_coleta,p.data_evento)<p_data
      and not exists(select 1 from public.operacao_ocorrencias o where o.pedido_id=p.id and o.codigo=e.codigo and o.tipo='falta' and o.resolucao like 'Perda confirmada:%')
    union all
    select o.item_id,o.quantidade from public.operacao_ocorrencias o where o.empresa_id=p_empresa and public.eh_membro_empresa(p_empresa)
      and o.resolvida_em is null and o.tipo in ('avaria','limpeza','manutencao') and o.item_id is not null
  ) b group by b.item_id;
$$;

create or replace function public.operacao_resolver_ocorrencia(p_id uuid,p_destino text,p_motivo text)
returns void language plpgsql security definer set search_path=public as $$
declare o public.operacao_ocorrencias;
begin
  select * into strict o from public.operacao_ocorrencias where id=p_id for update;
  if not public.eh_membro_empresa(o.empresa_id) or not public.funcionario_tabela_permitida(o.empresa_id,'itens','editar') then raise exception 'A resolução exige permissão de estoque'; end if;
  if o.resolvida_em is not null then return; end if;
  if length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Informe o encaminhamento da ocorrência'; end if;
  if p_destino='perda' then
      if o.item_id is null then raise exception 'Vincule a peça antes de confirmar a perda'; end if;
      update public.itens set estoque_total=estoque_total-o.quantidade where id=o.item_id and empresa_id=o.empresa_id and estoque_total>=o.quantidade;
      if not found then raise exception 'Revise o saldo do cadastro antes de confirmar a perda'; end if;
  elsif o.tipo='falta' and not exists(select 1 from public.separacoes_etiquetas where separacao_pedido_id=o.pedido_id and codigo=o.codigo and lida_retorno_em is not null) then
      raise exception 'Bipe a peça devolvida ou confirme a perda com baixa de estoque';
  end if;
  if p_destino not in ('perda','resolvido') then raise exception 'Destino inválido'; end if;
  update public.operacao_ocorrencias set resolvida_em=now(),resolucao=case when p_destino='perda' then 'Perda confirmada: ' else 'Resolvido: ' end||p_motivo where id=o.id;
end $$;

create or replace function public.operacao_validar_reserva(p_empresa uuid,p_pedido uuid,p_itens jsonb,p_inicio date,p_fim date)
returns void language plpgsql security definer set search_path=public as $$
declare d record;total numeric;manutencao numeric;reservado numeric;bloqueado numeric;
begin
  if p_inicio is null or p_fim is null or p_fim<p_inicio then raise exception 'Informe um período válido para reservar os materiais'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
  if exists(select 1 from jsonb_array_elements(p_itens) x join public.itens i on i.id=(x->>'item_id')::uuid where lower(to_jsonb(i)->>'tipo')='kit' and not exists(select 1 from public.kit_itens where kit_id=i.id)) then raise exception 'Cadastre os componentes do kit antes de reservar'; end if;
  for d in
    with lista as (select (x->>'item_id')::uuid id,sum((x->>'quantidade_solicitada')::numeric) qtd from jsonb_array_elements(p_itens) x group by (x->>'item_id')::uuid),
    pecas as (
      select l.id,l.qtd from lista l join public.itens i on i.id=l.id where coalesce(lower(to_jsonb(i)->>'tipo'),'')<>'kit'
      union all select k.item_id,l.qtd*k.quantidade from lista l join public.itens i on i.id=l.id and lower(to_jsonb(i)->>'tipo')='kit' join public.kit_itens k on k.kit_id=i.id
    ) select id,sum(qtd) qtd from pecas group by id
  loop
    select coalesce(estoque_total,0),coalesce((to_jsonb(i)->>'estoque_manutencao')::numeric,0) into total,manutencao from public.itens i where id=d.id and empresa_id=p_empresa;
    if not found then raise exception 'Componente não pertence à empresa'; end if;
    with reservas as (
      select s.*,coalesce(p.data_entrega,p.data_evento) inicio,coalesce(p.data_coleta,p.data_evento_fim,p.data_evento) fim from public.separacoes_itens s join public.separacoes_pedidos p on p.id=s.separacao_pedido_id
      where p.empresa_id=p_empresa and p.id is distinct from p_pedido and p.status_comercial in ('pre_reserva','aprovado','enviado','finalizado')
        and p.encerrado_operacional_em is null
        and coalesce(p.data_entrega,p.data_evento)<=p_fim and coalesce(p.data_coleta,p.data_evento_fim,p.data_evento)>=p_inicio
    ), pecas as (
      select quantidade_solicitada qtd,inicio,fim from reservas where item_id=d.id
      union all select r.quantidade_solicitada*k.quantidade,r.inicio,r.fim from reservas r join public.itens i on i.id=r.item_id and lower(to_jsonb(i)->>'tipo')='kit' join public.kit_itens k on k.kit_id=i.id where k.item_id=d.id
    ), dias as (
      select dia,coalesce(sum(qtd),0) qtd from generate_series(p_inicio::timestamp,p_fim::timestamp,interval '1 day') dia
      left join pecas on dia::date between inicio and fim group by dia
    ) select coalesce(max(qtd),0) into reservado from dias;
    select coalesce(max(quantidade),0) into bloqueado from public.operacao_indisponiveis(p_empresa,p_inicio) where item_id=d.id;
    if d.qtd>greatest(0,total-manutencao-reservado-bloqueado) then raise exception 'Saldo insuficiente para uma das peças. Revise a disponibilidade antes de salvar'; end if;
  end loop;
end $$;

create or replace function public.operacao_encerrar(p_pedido uuid)
returns void language plpgsql security definer set search_path=public as $$
declare p public.separacoes_pedidos;
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido for update;
  if not public.eh_membro_empresa(p.empresa_id) or not public.funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para encerrar'; end if;
  if p.operacao->'retorno'->>'concluido_em' is null then raise exception 'Conclua a triagem de retorno primeiro'; end if;
  if exists(select 1 from public.operacao_ocorrencias where pedido_id=p.id and resolvida_em is null) then raise exception 'Resolva as ocorrências antes de encerrar a operação'; end if;
  if exists(select 1 from public.separacoes_etiquetas e where e.separacao_pedido_id=p.id and e.lida_carregamento_em is not null and e.lida_retorno_em is null
    and not exists(select 1 from public.operacao_ocorrencias o where o.pedido_id=p.id and o.codigo=e.codigo and o.tipo='falta' and o.resolvida_em is not null and o.resolucao like 'Perda confirmada:%')) then raise exception 'Existem peças ainda não devolvidas'; end if;
  update public.separacoes_pedidos set encerrado_operacional_em=coalesce(encerrado_operacional_em,now()),status_operacional='encerrado',revisao=revisao+1,atualizado_em=now() where id=p.id;
end $$;
revoke all on function public.operacao_indisponiveis(uuid,date),public.operacao_resolver_ocorrencia(uuid,text,text),public.operacao_validar_reserva(uuid,uuid,jsonb,date,date) from public,anon;
grant execute on function public.operacao_indisponiveis(uuid,date),public.operacao_resolver_ocorrencia(uuid,text,text) to authenticated;
commit;
