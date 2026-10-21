begin;
alter table public.separacoes_pedidos
  add column if not exists revisao bigint not null default 0,
  add column if not exists reducao_liberada_em timestamptz,
  add column if not exists reducao_liberada_por uuid,
  add column if not exists encerrado_operacional_em timestamptz;
alter table public.empresa_logistica_regras
  add column if not exists descarregamento_minutos_apos_desmontagem integer not null default 60
  check (descarregamento_minutos_apos_desmontagem >= 1);

create table public.pedido_cronograma_pendencias (
  pedido_id uuid primary key references public.separacoes_pedidos(id),
  empresa_id uuid not null references public.empresas(id),
  revisao bigint not null,
  criado_em timestamptz not null default now()
);
alter table public.pedido_cronograma_pendencias enable row level security;

create table if not exists public.operacao_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  pedido_id uuid not null references public.separacoes_pedidos(id),
  item_id uuid references public.itens(id),
  codigo text,
  tipo text not null check (tipo in ('falta','avaria','limpeza','manutencao','outro')),
  quantidade numeric not null default 1 check (quantidade > 0),
  descricao text not null,
  resolvida_em timestamptz,
  resolucao text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (pedido_id, codigo, tipo)
);
alter table public.operacao_ocorrencias enable row level security;
create policy ocorrencias_equipe on public.operacao_ocorrencias for all to authenticated
using (public.eh_membro_empresa(empresa_id) and public.funcionario_tabela_permitida(empresa_id,'separacoes_pedidos','editar'))
with check (public.eh_membro_empresa(empresa_id) and public.funcionario_tabela_permitida(empresa_id,'separacoes_pedidos','editar') and resolvida_em is null and resolucao is null
  and exists(select 1 from public.separacoes_pedidos p where p.id=pedido_id and p.empresa_id=operacao_ocorrencias.empresa_id)
  and (item_id is null or exists(select 1 from public.itens i where i.id=item_id and i.empresa_id=operacao_ocorrencias.empresa_id)));
grant select,insert on public.operacao_ocorrencias to authenticated;

-- O mesmo bloqueio de pedido é usado pelo comercial e pelas leituras.
create or replace function public.operacao_proteger_itens()
returns trigger language plpgsql security definer set search_path=public as $$
declare p public.separacoes_pedidos; mudou boolean;
begin
  select * into p from public.separacoes_pedidos
  where id=case when TG_OP='DELETE' then old.separacao_pedido_id else new.separacao_pedido_id end for update;
  if current_setting('app.pedido_salvar',true)='sim' then
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if TG_OP='UPDATE' then
    mudou := new.item_id is distinct from old.item_id or new.quantidade_solicitada is distinct from old.quantidade_solicitada
      or new.separacao_pedido_id is distinct from old.separacao_pedido_id;
    if new.separacao_pedido_id is distinct from old.separacao_pedido_id then raise exception 'Não é permitido transferir uma linha entre pedidos'; end if;
    if not mudou then
      if p.reducao_liberada_em is not null then raise exception 'Separação pausada: comercial está revisando as retiradas'; end if;
      if (p.status in ('separado','separado_com_divergencia') or coalesce(p.status_operacional,'')<>'') and (new.quantidade_separada is distinct from old.quantidade_separada or new.componentes is distinct from old.componentes) then raise exception 'Separação finalizada'; end if;
      return new;
    end if;
  end if;
  if p.status in ('separado','separado_com_divergencia') or coalesce(p.status_operacional,'')<>'' then
    raise exception 'Separação finalizada: alterações de material estão bloqueadas';
  end if;
  if TG_OP='DELETE' or (TG_OP='UPDATE' and (new.quantidade_solicitada<old.quantidade_solicitada or new.item_id<>old.item_id)) then
    if p.status in ('em_separacao','pausado') and p.reducao_liberada_em is null then
      raise exception 'Retirar ou reduzir itens exige liberação no pedido pela triagem';
    end if;
  end if;
  if TG_OP='DELETE' then return old; else return new; end if;
end $$;
create trigger operacao_proteger_itens before insert or update or delete on public.separacoes_itens
for each row execute function public.operacao_proteger_itens();

create or replace function public.operacao_validar_pedido_update()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.status in ('separado','separado_com_divergencia') and new.status not in ('separado','separado_com_divergencia') then
    raise exception 'Separação finalizada: não é permitido reiniciar o pedido pelo comercial';
  end if;
  if old.status in ('em_separacao','pausado') and new.status='pendente' then raise exception 'A separação está em andamento. Atualize a tela do pedido para acrescentar itens'; end if;
  if exists(select 1 from jsonb_object_keys(coalesce(old.operacao,'{}')) k where not (coalesce(new.operacao,'{}') ? k)) then
    raise exception 'Outro aparelho atualizou a operação. Recarregue antes de concluir';
  end if;
  if (case coalesce(new.status_operacional,'') when 'encerrado' then 4 when 'retornado' then 3 when 'descarregado' then 2 when 'carregado' then 1 else 0 end)
    < (case coalesce(old.status_operacional,'') when 'encerrado' then 4 when 'retornado' then 3 when 'descarregado' then 2 when 'carregado' then 1 else 0 end) then
    raise exception 'A operação já avançou. Não é permitido voltar a uma etapa anterior';
  end if;
  if new.status='separado' and old.status is distinct from new.status then
    if new.reducao_liberada_em is not null then raise exception 'Cancele a liberação de retirada antes de finalizar'; end if;
    if exists(select 1 from public.separacoes_itens where separacao_pedido_id=new.id and quantidade_separada<quantidade_solicitada) then raise exception 'Há itens pendentes. Revise a lista ou conclua com divergência'; end if;
  end if;
  return new;
end $$;
create trigger operacao_validar_pedido_update before update on public.separacoes_pedidos
for each row execute function public.operacao_validar_pedido_update();

create or replace function public.pedido_liberar_reducao(p_pedido uuid,p_liberar boolean)
returns void language plpgsql security definer set search_path=public as $$
declare p public.separacoes_pedidos;
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido for update;
  if not public.eh_membro_empresa(p.empresa_id) or not public.funcionario_tabela_permitida(p.empresa_id,'separacoes_itens','editar') then raise exception 'Sem permissão da triagem'; end if;
  if p.status in ('separado','separado_com_divergencia') or coalesce(p.status_operacional,'')<>'' then raise exception 'A separação já foi finalizada'; end if;
  update public.separacoes_pedidos set reducao_liberada_em=case when p_liberar then now() end,
    reducao_liberada_por=case when p_liberar then auth.uid() end, revisao=revisao+1,atualizado_em=now() where id=p.id;
end $$;

-- Gravação atômica; linhas existentes e suas etiquetas nunca são recriadas.
create or replace function public.pedido_salvar_integrado(p_id uuid,p_pedido jsonb,p_itens jsonb,p_revisao bigint default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.separacoes_pedidos; novo public.separacoes_pedidos; r record; alvo record; etq record; permitido numeric; saldo_linha numeric;
  empresa uuid := (p_pedido->>'empresa_id')::uuid;
  quantidade numeric; anterior numeric; reserva boolean; reduziu boolean:=false; mudou boolean:=false; finalizado boolean;
begin
  if not public.eh_membro_empresa(empresa) or not public.funcionario_pode(empresa,auth.uid(),case when p_id is null then 'comercial.pedidos.criar' else 'comercial.pedidos.editar' end) then raise exception 'Sem permissão para salvar pedido'; end if;
  if coalesce(jsonb_typeof(p_itens),'')<>'array' then raise exception 'Lista de itens inválida'; end if;
  if exists(select 1 from jsonb_array_elements(p_itens) x where x->>'quantidade_solicitada' is null or (x->>'quantidade_solicitada')::numeric<=0 or (x->>'quantidade_solicitada')::numeric='NaN'::numeric or x->>'item_id' is null) then raise exception 'Quantidade inválida'; end if;
  if exists(select 1 from jsonb_array_elements(p_itens) x left join public.itens i on i.id=(x->>'item_id')::uuid and i.empresa_id=empresa where i.id is null) then raise exception 'Item não pertence à empresa'; end if;
  if p_id is not null then
    select * into strict p from public.separacoes_pedidos where id=p_id and empresa_id=empresa for update;
    if p_revisao is null or p.revisao<>p_revisao then raise exception 'Pedido alterado em outro aparelho. Reabra o pedido antes de salvar'; end if;
  end if;
  reserva := coalesce(p_pedido->>'status_comercial','orcamento') in ('pre_reserva','aprovado','enviado','finalizado');
  if reserva and jsonb_array_length(p_itens)=0 then raise exception 'Adicione materiais antes de reservar o pedido'; end if;
  finalizado := p.status in ('separado','separado_com_divergencia') or coalesce(p.status_operacional,'')<>'';
  for r in select item_id,sum(quantidade_solicitada) qtd,sum(quantidade_separada) separada from public.separacoes_itens where separacao_pedido_id=p.id group by item_id loop
    select coalesce(sum((x->>'quantidade_solicitada')::numeric),0) into quantidade from jsonb_array_elements(p_itens) x where (x->>'item_id')::uuid=r.item_id;
    if not reserva then quantidade:=0; end if;
    reduziu:=reduziu or quantidade<r.qtd; mudou:=mudou or quantidade<>r.qtd;
    if quantidade<r.separada then raise exception 'A triagem precisa desfazer a separação das peças antes de reduzir a quantidade'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_itens) x where not exists(select 1 from public.separacoes_itens i where i.separacao_pedido_id=p.id and i.item_id=(x->>'item_id')::uuid)) and reserva then mudou:=true; end if;
  if finalizado and mudou then raise exception 'Separação finalizada: não é permitido acrescentar, retirar ou substituir materiais'; end if;
  if p.status in ('em_separacao','pausado') and reduziu and p.reducao_liberada_em is null then raise exception 'Apenas acréscimos são permitidos. Solicite liberação de retirada na triagem'; end if;
  if p.status in ('em_separacao','pausado') and (p_pedido->>'status_comercial' is distinct from p.status_comercial) then raise exception 'Não altere o status comercial durante a separação'; end if;
  novo:=jsonb_populate_record(p,p_pedido - array['id','status','status_operacional','operacao','revisao','reducao_liberada_em','reducao_liberada_por','encerrado_operacional_em']);
  if p.status in ('em_separacao','pausado') and
    row(novo.cliente_id,novo.cliente_nome,novo.local_id,novo.local_nome,novo.data_evento,novo.data_evento_fim,novo.data_entrega,novo.data_coleta)
      is distinct from row(p.cliente_id,p.cliente_nome,p.local_id,p.local_nome,p.data_evento,p.data_evento_fim,p.data_entrega,p.data_coleta) then
    raise exception 'Durante a separação, altere somente os materiais. Dados e datas do pedido estão bloqueados';
  end if;
  if reserva and mudou then
    perform public.operacao_validar_reserva(empresa,p.id,p_itens,coalesce(novo.data_entrega,novo.data_evento),coalesce(novo.data_coleta,novo.data_evento_fim,novo.data_evento));
  end if;
  perform set_config('app.pedido_salvar','sim',true);
  if p_id is null then
    novo.id:=gen_random_uuid();novo.status:='pendente';novo.revisao:=0;novo.criado_em:=now();novo.operacao:='{}';
    insert into public.separacoes_pedidos select novo.*;
    p.id:=novo.id;
  else
    update public.separacoes_pedidos set cliente_id=novo.cliente_id,cliente_nome=novo.cliente_nome,contato_cliente=novo.contato_cliente,
      tipo_evento=novo.tipo_evento,local_id=novo.local_id,local_nome=novo.local_nome,data_evento=novo.data_evento,data_evento_fim=novo.data_evento_fim,
      data_entrega=novo.data_entrega,data_coleta=novo.data_coleta,data_hora=novo.data_hora,valor_total=novo.valor_total,status_comercial=novo.status_comercial,
      observacoes=novo.observacoes,revisao=revisao+1,atualizado_em=now(),
      reducao_liberada_em=null,reducao_liberada_por=null where id=p.id;
  end if;
  if reserva then
    for r in select (x->>'item_id')::uuid item_id,sum((x->>'quantidade_solicitada')::numeric) qtd,min(x->>'item_nome') nome,min(x->>'codigo_item') codigo,min(x->>'foto_url') foto from jsonb_array_elements(p_itens) x group by (x->>'item_id')::uuid loop
      select coalesce(sum(quantidade_solicitada),0) into anterior from public.separacoes_itens where separacao_pedido_id=p.id and item_id=r.item_id;
      if r.qtd>anterior then
        select id into alvo from public.separacoes_itens where separacao_pedido_id=p.id and item_id=r.item_id order by created_at,id limit 1;
        if found then update public.separacoes_itens set quantidade_solicitada=quantidade_solicitada+r.qtd-anterior,atualizado_em=now() where id=alvo.id;
        else insert into public.separacoes_itens(empresa_id,separacao_pedido_id,item_id,item_nome,codigo_item,foto_url,quantidade_solicitada) values(empresa,p.id,r.item_id,r.nome,r.codigo,r.foto,r.qtd); end if;
      end if;
    end loop;
  end if;
  -- Reduz somente a parcela ainda não separada; etiquetas já lidas impedem a retirada.
  for r in select item_id,sum(quantidade_solicitada) qtd from public.separacoes_itens where separacao_pedido_id=p.id group by item_id loop
    select coalesce(sum((x->>'quantidade_solicitada')::numeric),0) into quantidade from jsonb_array_elements(p_itens) x where (x->>'item_id')::uuid=r.item_id;
    if not reserva then quantidade:=0; end if;
    anterior:=r.qtd-quantidade;
    if anterior<=0 then continue; end if;
    for alvo in select * from public.separacoes_itens where separacao_pedido_id=p.id and item_id=r.item_id order by created_at desc,id for update loop
      quantidade:=least(anterior,alvo.quantidade_solicitada-alvo.quantidade_separada);
      if quantidade<=0 then continue; end if;
      saldo_linha:=alvo.quantidade_solicitada-quantidade;
      if exists(select 1 from jsonb_each(coalesce(alvo.componentes,'{}')) c join public.kit_itens k on k.kit_id=alvo.item_id and k.item_id=c.key::uuid
        where coalesce((c.value->>'separado')::numeric,0)>saldo_linha*k.quantidade) then raise exception 'A triagem precisa desmarcar os componentes excedentes antes da retirada'; end if;
      for etq in select distinct item_id from public.separacoes_etiquetas where separacao_item_id=alvo.id loop
        permitido:=saldo_linha*case when etq.item_id=alvo.item_id then 1 else coalesce((select max(k.quantidade) from public.kit_itens k where k.kit_id=alvo.item_id and k.item_id=etq.item_id),0) end;
        if exists(select 1 from public.separacoes_etiquetas where separacao_item_id=alvo.id and item_id=etq.item_id and sequencia>permitido and (lida_separacao_em is not null or lida_carregamento_em is not null)) then raise exception 'A triagem precisa desmarcar as etiquetas excedentes antes da retirada'; end if;
        delete from public.separacoes_etiquetas where separacao_item_id=alvo.id and item_id=etq.item_id and sequencia>permitido;
        update public.separacoes_etiquetas set total_item=permitido::integer where separacao_item_id=alvo.id and item_id=etq.item_id;
      end loop;
      if quantidade=alvo.quantidade_solicitada then delete from public.separacoes_itens where id=alvo.id;
      elsif quantidade>0 then update public.separacoes_itens set quantidade_solicitada=quantidade_solicitada-quantidade,atualizado_em=now() where id=alvo.id; end if;
      anterior:=anterior-quantidade;exit when anterior<=0;
    end loop;
  end loop;
  perform set_config('app.pedido_salvar','nao',true);
  insert into public.pedido_cronograma_pendencias(pedido_id,empresa_id,revisao)
    select id,empresa_id,revisao from public.separacoes_pedidos where id=p.id
    on conflict(pedido_id) do update set revisao=excluded.revisao,criado_em=now();
  return (select jsonb_build_object('id',id,'revisao',revisao) from public.separacoes_pedidos where id=p.id);
end $$;

revoke all on function public.pedido_salvar_integrado(uuid,jsonb,jsonb,bigint),public.pedido_liberar_reducao(uuid,boolean),public.operacao_proteger_itens() from public,anon;
grant execute on function public.pedido_salvar_integrado(uuid,jsonb,jsonb,bigint),public.pedido_liberar_reducao(uuid,boolean) to authenticated;
commit;
