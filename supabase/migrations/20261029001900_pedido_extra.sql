-- Pedido extra (out/2026): o cliente acrescenta itens depois de o pedido fechar ou ser entregue.
-- O extra (separacoes_pedidos.pedido_origem_id = pedido principal, número "1/2", "1/3"…) tem entrega, itens, parcelas e
-- contrato (opcional) próprios e segue Triagem → Carregamento → Entrega sozinho. Da coleta em diante vira uma coisa só com
-- o principal: coleta, desmontagem, descarregamento, triagem da volta, posição final e pós-venda são feitos no principal,
-- somando os itens de todos. Cliente, local, evento e coleta do extra são sempre os do principal.

alter table public.separacoes_pedidos drop constraint if exists separacoes_pedidos_pedido_origem_fk;
alter table public.separacoes_pedidos add constraint separacoes_pedidos_pedido_origem_fk
  foreign key (pedido_origem_id) references public.separacoes_pedidos(id) on delete restrict;
create index if not exists separacoes_pedidos_origem_idx on public.separacoes_pedidos(pedido_origem_id) where pedido_origem_id is not null;

-- principal + extras (sem os cancelados), o principal primeiro
create or replace function public.pedido_grupo(p_pedido uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  with alvo as (select coalesce(pedido_origem_id, id) principal from separacoes_pedidos where id = p_pedido)
  select coalesce(array_agg(p.id order by (p.pedido_origem_id is not null), p.criado_em, p.id), array[p_pedido])
    from separacoes_pedidos p, alvo
   where (p.id = alvo.principal or p.pedido_origem_id = alvo.principal)
     and (p.id = alvo.principal or (coalesce(p.status, '') <> 'cancelado' and coalesce(p.status_comercial, '') <> 'cancelado'))
$$;
revoke all on function public.pedido_grupo(uuid) from public, anon;
grant execute on function public.pedido_grupo(uuid) to authenticated;

-- a coleta do principal começou? (aí não dá mais para criar extra)
create or replace function public.pedido_coleta_iniciada(p_pedido uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from logistica_confirmacoes where pedido_id = p_pedido and etapa = 'coleta')
      or exists (select 1 from operacao_registros r join operacao_etapas e on e.id = r.etapa_id
                  where e.pedido_id = p_pedido and e.tipo = 'desmontagem')
      or exists (select 1 from separacoes_pedidos p where p.id = p_pedido and (p.encerrado_operacional_em is not null
                  or p.operacao->'descarregamento'->>'iniciado_em' is not null or p.operacao->'retorno'->>'iniciado_em' is not null))
$$;
revoke all on function public.pedido_coleta_iniciada(uuid) from public, anon;
grant execute on function public.pedido_coleta_iniciada(uuid) to authenticated;

-- resumo para as telas: extras de um pedido, ou o principal de um extra
create or replace function public.pedido_extras(p_pedido uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p separacoes_pedidos; pr separacoes_pedidos;
begin
  select * into p from separacoes_pedidos where id = p_pedido;
  if not found or not eh_membro_empresa(p.empresa_id) then raise exception 'Sem acesso ao pedido'; end if;
  select * into pr from separacoes_pedidos where id = coalesce(p.pedido_origem_id, p.id);
  return jsonb_build_object(
    'principal', jsonb_build_object('id', pr.id, 'numero', pr.numero_pedido, 'status_comercial', pr.status_comercial),
    'eh_extra', p.pedido_origem_id is not null,
    'pode_criar', p.pedido_origem_id is null and coalesce(p.status_comercial, '') in ('pre_reserva', 'aprovado', 'enviado', 'finalizado')
                  and coalesce(p.status, '') <> 'cancelado' and not pedido_coleta_iniciada(pr.id),
    'coleta_iniciada', pedido_coleta_iniciada(pr.id),
    'extras', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'numero', x.numero_pedido, 'status_comercial', x.status_comercial,
                 'data_entrega', x.data_entrega, 'valor_total', x.valor_total) order by x.criado_em)
               from separacoes_pedidos x where x.pedido_origem_id = pr.id), '[]'));
end $$;
revoke all on function public.pedido_extras(uuid) from public, anon;
grant execute on function public.pedido_extras(uuid) to authenticated;


create or replace function public.pedido_salvar_integrado(p_id uuid, p_pedido jsonb, p_itens jsonb, p_revisao bigint DEFAULT NULL::bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare p separacoes_pedidos; pr separacoes_pedidos; origem uuid; pp jsonb := p_pedido; prox int;
begin
 if p_id is not null then
  select * into strict p from separacoes_pedidos where id=p_id for update;
  if not eh_membro_empresa(p.empresa_id) then raise exception 'Sem acesso ao pedido';end if;
  if p.encerrado_operacional_em is not null or p.operacao->'carregamento'->>'iniciado_em' is not null or coalesce(p.status_operacional,'')<>'' then raise exception 'Pedido com o operacional. Solicite a devolução para a Triagem e depois para o Comercial';end if;
  if p.status<>'pendente' and p.reducao_liberada_em is null then raise exception 'A Triagem assumiu o pedido. Solicite a liberação para o Comercial';end if;
  origem := p.pedido_origem_id;
 else
  origem := nullif(p_pedido->>'pedido_origem_id','')::uuid;
 end if;
 if origem is not null then
  select * into pr from separacoes_pedidos where id=origem for update;
  if not found or pr.empresa_id is distinct from (p_pedido->>'empresa_id')::uuid then raise exception 'Pedido principal não encontrado';end if;
  if pr.pedido_origem_id is not null then raise exception 'Um pedido extra não pode ter outro pedido extra. Crie a partir do pedido principal';end if;
  if coalesce(pr.status,'')='cancelado' or coalesce(pr.status_comercial,'')='cancelado' then raise exception 'O pedido principal % foi cancelado',pr.numero_pedido;end if;
  if p_id is null then
   if coalesce(pr.status_comercial,'') not in ('pre_reserva','aprovado','enviado','finalizado') then raise exception 'Reserve o pedido % antes de criar um pedido extra',pr.numero_pedido;end if;
   if pedido_coleta_iniciada(pr.id) then raise exception 'A coleta do pedido % já começou: não é mais possível criar pedido extra',pr.numero_pedido;end if;
   select coalesce(max(nullif(substring(numero_pedido from '/(\d+)$'),'')::int),1)+1 into prox from separacoes_pedidos where pedido_origem_id=pr.id;
   pp := pp || jsonb_build_object('numero_pedido', pr.numero_pedido||'/'||prox);
  end if;
  -- cliente, local, evento e coleta são sempre os do principal
  pp := pp || jsonb_build_object('pedido_origem_id',pr.id,'cliente_id',pr.cliente_id,'cliente_nome',pr.cliente_nome,
    'contato_cliente',coalesce(nullif(p_pedido->>'contato_cliente',''),pr.contato_cliente),'tipo_evento',pr.tipo_evento,
    'local_id',pr.local_id,'local_nome',pr.local_nome,'data_evento',pr.data_evento,'data_evento_fim',pr.data_evento_fim,
    'data_hora',pr.data_hora,'data_coleta',pr.data_coleta);
  pp := jsonb_set(pp,'{observacoes}',coalesce(pp->'observacoes','{}'::jsonb)||jsonb_build_object(
    'horario_coleta',coalesce(pr.observacoes->>'horario_coleta',pr.observacoes->'horarios_pedido'->>'coleta'),
    'observacoes_coleta',coalesce(pr.observacoes->>'observacoes_coleta','')));
 else
  pp := pp - 'pedido_origem_id';
 end if;
 return pedido_salvar_integrado_base_fluxo(p_id,pp,p_itens,p_revisao);
end $function$;

CREATE OR REPLACE FUNCTION public.pedido_salvar_integrado_base_fluxo(p_id uuid, p_pedido jsonb, p_itens jsonb, p_revisao bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Pré-reserva tem validade (out/2026): obrigatória, e não pode ser informada/trocada para uma data que já passou.
  if p_pedido->>'status_comercial'='pre_reserva' then
    if nullif(p_pedido->>'pre_reserva_ate','') is null then raise exception 'Informe até quando vale a pré-reserva'; end if;
    if (p_pedido->>'pre_reserva_ate')::date<current_date and (p_pedido->>'pre_reserva_ate')::date is distinct from p.pre_reserva_ate then
      raise exception 'A validade da pré-reserva não pode ser uma data que já passou';
    end if;
  end if;
  -- Dados obrigatórios do pedido (out/2026, pedido do usuário): sem cliente, local e as datas não dá pra saber a
  -- disponibilidade nem montar a logística. Vale para qualquer situação, inclusive orçamento.
  if nullif(btrim(coalesce(p_pedido->>'cliente_nome','')),'') is null or lower(btrim(p_pedido->>'cliente_nome')) in ('cliente nao informado','cliente não informado') then
    raise exception 'Informe o cliente do pedido'; end if;
  if nullif(btrim(coalesce(p_pedido->>'local_nome','')),'') is null then raise exception 'Informe o local do evento'; end if;
  if nullif(p_pedido->>'data_evento','') is null then raise exception 'Informe a data do evento'; end if;
  if nullif(p_pedido->>'data_entrega','') is null then raise exception 'Informe a data de entrega'; end if;
  if nullif(p_pedido->>'data_coleta','') is null then raise exception 'Informe a data de coleta'; end if;
  if nullif(p_pedido->>'pedido_origem_id','') is not null then
    -- pedido extra: a entrega pode ser até a coleta (o evento já pode estar acontecendo)
    if (p_pedido->>'data_entrega')::date > (p_pedido->>'data_coleta')::date then raise exception 'A entrega do pedido extra precisa ser até a coleta'; end if;
  elsif (p_pedido->>'data_entrega')::date > (p_pedido->>'data_evento')::date then raise exception 'A entrega precisa ser no dia do evento ou antes'; end if;
  if (p_pedido->>'data_coleta')::date < coalesce(nullif(p_pedido->>'data_evento_fim','')::date, (p_pedido->>'data_evento')::date) then
    raise exception 'A coleta precisa ser no último dia do evento ou depois'; end if;
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
      pre_reserva_ate=novo.pre_reserva_ate,
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
end $function$;

create or replace function public.pedido_extra_acompanhar_principal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pedido_origem_id is not null then return new; end if;
  if row(new.cliente_id,new.cliente_nome,new.tipo_evento,new.local_id,new.local_nome,new.data_evento,new.data_evento_fim,new.data_hora,new.data_coleta,
         new.observacoes->>'horario_coleta',new.observacoes->>'observacoes_coleta')
     is not distinct from row(old.cliente_id,old.cliente_nome,old.tipo_evento,old.local_id,old.local_nome,old.data_evento,old.data_evento_fim,old.data_hora,old.data_coleta,
         old.observacoes->>'horario_coleta',old.observacoes->>'observacoes_coleta') then return new; end if;
  perform set_config('app.fluxo_transferencia','sim',true);
  update separacoes_pedidos x set cliente_id=new.cliente_id, cliente_nome=new.cliente_nome, tipo_evento=new.tipo_evento,
         local_id=new.local_id, local_nome=new.local_nome, data_evento=new.data_evento, data_evento_fim=new.data_evento_fim,
         data_hora=new.data_hora, data_coleta=new.data_coleta,
         data_entrega=least(x.data_entrega, new.data_coleta),
         observacoes=coalesce(x.observacoes,'{}'::jsonb)||jsonb_build_object('horario_coleta',new.observacoes->>'horario_coleta','observacoes_coleta',coalesce(new.observacoes->>'observacoes_coleta','')),
         atualizado_em=now()
   where x.pedido_origem_id=new.id;
  perform set_config('app.fluxo_transferencia','',true);
  return new;
end $$;
drop trigger if exists pedido_extra_acompanhar on public.separacoes_pedidos;
create trigger pedido_extra_acompanhar after update of cliente_id, cliente_nome, tipo_evento, local_id, local_nome, data_evento, data_evento_fim, data_coleta, observacoes
  on public.separacoes_pedidos for each row execute function public.pedido_extra_acompanhar_principal();

CREATE OR REPLACE FUNCTION public.operacao_sincronizar_pedido(p_pedido uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p separacoes_pedidos; r empresa_logistica_regras; permitidos text[]; entrega date; coleta date; carga date;
  padrao time; h_entrega time; h_coleta time; obs jsonb; e record; atual operacao_etapas; n int := 0;
  descarga_min int; sv record; refs text[] := array[]::text[];
begin
  perform set_config('acervo.sincronizando_pedido', '1', true);
  select * into p from separacoes_pedidos where id = p_pedido;
  if not found then perform set_config('acervo.sincronizando_pedido', '', true); return 0; end if;
  select * into r from empresa_logistica_regras where empresa_id = p.empresa_id;
  permitidos := coalesce(nullif(r.status_cronograma, '{}'), array['pre_reserva','aprovado']);
  if not (coalesce(p.status_comercial, '') = any(permitidos)) or p.data_evento is null then
    delete from operacao_etapas where pedido_id = p.id;
    perform set_config('acervo.sincronizando_pedido', '', true);
    return 0;
  end if;
  obs := coalesce(p.observacoes, '{}'::jsonb);
  padrao := coalesce(r.hora_padrao, time '08:00');
  h_entrega := operacao_hora_texto(coalesce(obs->>'horario_entrega', obs->'horarios_pedido'->>'entrega'), padrao);
  h_coleta := operacao_hora_texto(coalesce(obs->>'horario_coleta', obs->'horarios_pedido'->>'coleta'), padrao);
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
    where p.pedido_origem_id is null or v.tipo in ('triagem_ida', 'carregamento', 'montagem')
  loop
    -- descarregamento: depois da desmontagem (+ intervalo dos Parâmetros)
    if e.tipo = 'descarregamento' then
      e.hora := (e.data + e.hora + make_interval(mins => descarga_min))::time;
      e.data := (e.data + h_coleta + make_interval(mins => descarga_min))::date;
    end if;
    select * into atual from operacao_etapas where pedido_id = p.id and tipo = e.tipo and servico_ref is null order by origem = 'pedido' desc, created_at limit 1;
    if found then
      update operacao_etapas set
        data = e.data, hora = e.hora,
        data_sugerida = e.data, hora_sugerida = e.hora, nome = e.nome, updated_at = now()
      where id = atual.id;
    else
      insert into operacao_etapas (empresa_id, pedido_id, nome, tipo, data, hora, data_sugerida, hora_sugerida, observacao, origem)
      values (p.empresa_id, p.id, e.nome, e.tipo, e.data, e.hora, e.data, e.hora, 'Gerado pelo pedido', 'pedido');
      n := n + 1;
    end if;
  end loop;
  -- pedido extra: da coleta em diante tudo é feito no pedido principal
  if p.pedido_origem_id is not null then
    delete from operacao_etapas where pedido_id = p.id and servico_ref is null and tipo in ('desmontagem', 'descarregamento', 'triagem_volta');
  end if;
  -- triagem da volta sempre depois do descarregamento
  update operacao_etapas v set data = (d.data + d.hora + interval '1 minute')::date, hora = (d.data + d.hora + interval '1 minute')::time
    from operacao_etapas d
   where v.pedido_id = p.id and v.tipo = 'triagem_volta' and d.pedido_id = p.id and d.tipo = 'descarregamento'
     and v.servico_ref is null and d.servico_ref is null
     and (v.data + coalesce(v.hora, padrao)) <= (d.data + coalesce(d.hora, padrao)) ;
  -- serviços adicionais operacionais (montagem extra, desmontagem extra…): cada linha do pedido vira uma etapa no
  -- cronograma, na data e no horário informados no pedido (a escala automática preenche equipe e caminhão)
  for sv in
    select x->>'id' ref, coalesce(nullif(btrim(x->>'nome'), ''), sa.nome) nome, sa.etapa_operacao tipo,
           (x->>'data')::date dt, (x->>'hora')::time hr, greatest(1, coalesce(nullif(x->>'quantidade', '')::numeric, 1)) q
      from jsonb_array_elements(case when jsonb_typeof(obs->'projeto_comercial'->'dados'->'servicos') = 'array' then obs->'projeto_comercial'->'dados'->'servicos' else '[]'::jsonb end) x
      join servicos_adicionais sa on sa.id::text = x->>'servico_id' and sa.empresa_id = p.empresa_id and sa.etapa_operacao is not null
     where coalesce(x->>'id', '') <> '' and coalesce(x->>'data', '') ~ '^\d{4}-\d{2}-\d{2}$' and coalesce(x->>'hora', '') ~ '^\d{2}:\d{2}'
  loop
    refs := refs || sv.ref;
    select * into atual from operacao_etapas where pedido_id = p.id and servico_ref = sv.ref limit 1;
    if found then
      update operacao_etapas set nome = sv.nome || case when sv.q > 1 then ' (' || sv.q::int || 'x)' else '' end, tipo = sv.tipo,
        data = sv.dt, hora = sv.hr,
        data_sugerida = sv.dt, hora_sugerida = sv.hr, updated_at = now()
      where id = atual.id;
    else
      insert into operacao_etapas (empresa_id, pedido_id, nome, tipo, data, hora, data_sugerida, hora_sugerida, observacao, origem, servico_ref)
      values (p.empresa_id, p.id, sv.nome || case when sv.q > 1 then ' (' || sv.q::int || 'x)' else '' end, sv.tipo, sv.dt, sv.hr, sv.dt, sv.hr,
              'Serviço adicional do pedido', 'pedido', sv.ref);
      n := n + 1;
    end if;
  end loop;
  delete from operacao_etapas where pedido_id = p.id and servico_ref is not null and not (servico_ref = any(refs));

  perform operacao_escala_preencher(p.empresa_id, array(select id from operacao_etapas where pedido_id = p.id));
  perform set_config('acervo.sincronizando_pedido', '', true);
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.pedido_fluxo_etapa(p separacoes_pedidos)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare simultaneo boolean; principal text;
begin
 if p.status='cancelado' or p.status_comercial='cancelado' then return 'cancelado'; end if;
 if coalesce(p.status_comercial,'') not in ('pre_reserva','aprovado','enviado','finalizado') then return 'comercial'; end if;
 if p.status_comercial='pre_reserva' then return 'pre_reserva'; end if;
 if p.reducao_liberada_em is not null then return 'comercial'; end if;
 -- pedido extra entregue: da coleta em diante acompanha o pedido principal
 if p.pedido_origem_id is not null and exists(select 1 from logistica_confirmacoes where pedido_id=p.id and etapa='entrega') then
  select pedido_fluxo_etapa(x) into principal from separacoes_pedidos x where x.id=p.pedido_origem_id;
  if principal in ('coleta','retorno_simultaneo','descarregamento','triagem_retorno','posicao_final') then return principal; end if;
  return 'coleta';
 end if;
 if exists(select 1 from fin_posicoes_finais where pedido_id=p.id and status='confirmado') then return 'posicao_final'; end if;
 if p.encerrado_operacional_em is not null then return 'posicao_final'; end if;
 if exists(select 1 from logistica_confirmacoes where pedido_id=p.id and etapa='coleta') then
  if p.operacao->'descarregamento'->>'concluido_em' is not null and p.operacao->'retorno'->>'concluido_em' is not null then return 'posicao_final'; end if;
  select retorno_simultaneo into simultaneo from empresa_fluxo_pedidos where empresa_id=p.empresa_id;
  if coalesce(simultaneo,true) and p.operacao->'retorno'->>'concluido_em' is null and p.operacao->'descarregamento'->>'concluido_em' is null then return 'retorno_simultaneo'; end if;
  if p.operacao->'descarregamento'->>'concluido_em' is null then return 'descarregamento'; end if;
  return 'triagem_retorno';
 end if;
 if exists(select 1 from logistica_confirmacoes where pedido_id=p.id and etapa='entrega') then return 'coleta'; end if;
 if p.operacao->'carregamento'->>'concluido_em' is not null or p.status_operacional in ('carregado','descarregado','retornado') then return 'entrega'; end if;
 if p.status in ('separado','separado_com_divergencia') then return 'expedicao'; end if;
 return 'triagem';
end $function$;

CREATE OR REPLACE FUNCTION public.pedido_fluxo_fila(p_empresa uuid, p_setor text, p_de integer DEFAULT 0, p_limite integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare resultado jsonb; pre boolean;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso à empresa'; end if;
 if p_setor is null or p_setor not in ('triagem','expedicao','entrega','coleta','entregas_coletas','posicao_final','montagem_equipe') then raise exception 'Setor inválido'; end if;
 if p_setor='montagem_equipe' then
  if not (funcionario_pode(p_empresa,auth.uid(),'logistica.planejamento.visualizar') or funcionario_pode(p_empresa,auth.uid(),'logistica.cronograma.visualizar')) then raise exception 'Sem permissao para consultar o planejamento'; end if;
 elsif p_setor='posicao_final' then
  if not fin_pode(p_empresa,'financeiro.fluxo.visualizar') then raise exception 'Sem permissão financeira'; end if;
 elsif not funcionario_tabela_permitida(p_empresa,case when p_setor='triagem' then 'separacoes_itens' else 'separacoes_pedidos' end,'select') then raise exception 'Sem permissão para consultar esta fila'; end if;
 select pre_reservas_consulta into pre from empresa_fluxo_pedidos where empresa_id=p_empresa;
 with candidatos as(select p,pedido_fluxo_etapa(p) etapa from separacoes_pedidos p where p.empresa_id=p_empresa),
 fila as(select p,etapa from candidatos where
  -- pedido extra: da coleta em diante é tratado no pedido principal
  not ((p).pedido_origem_id is not null and etapa in ('coleta','retorno_simultaneo','descarregamento','triagem_retorno','posicao_final')) and (
  (p_setor='montagem_equipe' and etapa in ('triagem','expedicao')) or
  (p_setor='triagem' and etapa in ('triagem','triagem_retorno','retorno_simultaneo')) or
   -- Separado e ainda não carregado: continua na Triagem, em Concluídos, até a Expedição começar o carregamento.
   (p_setor='triagem' and etapa='expedicao' and (p).operacao->'carregamento'->>'iniciado_em' is null
    and not exists(select 1 from separacoes_etiquetas e where e.separacao_pedido_id=(p).id and e.lida_carregamento_em is not null)) or
  (p_setor='expedicao' and etapa in ('expedicao','descarregamento','retorno_simultaneo')) or
  etapa=p_setor or (p_setor='entregas_coletas' and etapa in ('entrega','coleta')) or
  (coalesce(pre,false) and etapa='pre_reserva' and p_setor in ('triagem','montagem_equipe')
   and ((p).pre_reserva_ate is null or (p).pre_reserva_ate>=(now() at time zone 'America/Sao_Paulo')::date))
) order by (p).data_entrega nulls last,(p).id offset greatest(p_de,0) limit least(greatest(p_limite,1),1000))
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('fluxo_etapa',etapa,'somente_consulta',etapa='pre_reserva')),'[]') into resultado from fila;
 return resultado;
end $function$;

create or replace function public.comercial_fluxo_pedidos(p_empresa uuid, p_pedidos uuid[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r jsonb;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_pode(p_empresa, auth.uid(), 'comercial.pedidos.visualizar') then raise exception 'Sem permissão para consultar o fluxo'; end if;
  if coalesce(cardinality(p_pedidos), 0) > 500 then raise exception 'Consulte até 500 pedidos por vez'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'etapa', x.etapa,
           'operacao_concluida', x.op_ok, 'financeiro_pendente', x.aberto, 'posicao_final', x.pf,
           'posvenda_feita', x.pv, 'finalizado', x.pf and x.pv and not x.aberto,
           'pedido_origem_id', x.pedido_origem_id, 'unificado', x.unificado)), '[]')
    into r
    from (
      select p.id, p.pedido_origem_id, pedido_fluxo_etapa(p) etapa,
             (p.pedido_origem_id is not null and exists (select 1 from logistica_confirmacoes l where l.pedido_id = p.id and l.etapa = 'entrega')) unificado,
             (b.operacao->'retorno'->>'concluido_em' is not null and b.operacao->'descarregamento'->>'concluido_em' is not null) op_ok,
             exists (select 1 from fin_receber t where t.pedido_id = p.id and t.status <> 'cancelado' and t.aberto > 0) aberto,
             exists (select 1 from fin_posicoes_finais f where f.pedido_id = b.id and f.status = 'confirmado') pf,
             exists (select 1 from posvenda_contato_pedidos cp join posvenda_contatos c on c.id = cp.contato_id
                      where cp.pedido_id = b.id and c.status in ('concluido', 'sem_contato', 'dispensado')) pv
        from separacoes_pedidos p join separacoes_pedidos b on b.id = coalesce(p.pedido_origem_id, p.id)
       where p.empresa_id = p_empresa and p.id = any(p_pedidos)) x;
  return r;
end $function$;

drop function if exists public.operacao_conferencia_pecas(uuid);
create or replace function public.operacao_conferencia_pecas(p_pedido uuid, p_grupo boolean default false)
 RETURNS TABLE(chave text, linha uuid, item_id uuid, nome text, esperado numeric, kit_nome text, por_kit numeric, pedido_id uuid, pedido_numero text)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  with ped as (
    select x.id, x.numero_pedido from public.separacoes_pedidos x
     where x.id = any(case when p_grupo then public.pedido_grupo(p_pedido) else array[p_pedido] end)),
  linhas as (
    select si.id linha, si.item_id, coalesce(si.item_nome, i.descricao_total, i.produto, 'Item') nome,
           coalesce(si.quantidade_solicitada,0) q, lower(coalesce(i.tipo,'')) tipo, ped.id pedido_id, ped.numero_pedido
      from public.separacoes_itens si join ped on ped.id=si.separacao_pedido_id left join public.itens i on i.id=si.item_id)
  select l.linha::text||'|'||k.item_id::text, l.linha, k.item_id, coalesce(c.descricao_total,c.produto,'Componente'), k.quantidade*l.q,
         l.nome, k.quantidade, l.pedido_id, l.numero_pedido
    from linhas l join public.kit_itens k on k.kit_id=l.item_id left join public.itens c on c.id=k.item_id
   where l.tipo='kit'
  union all
  select l.linha::text||'|'||l.item_id::text, l.linha, l.item_id, l.nome, l.q, null::text, null::numeric, l.pedido_id, l.numero_pedido
    from linhas l
   where l.tipo<>'kit' or not exists(select 1 from public.kit_itens k where k.kit_id=l.item_id)
$function$;
grant execute on function public.operacao_conferencia_pecas(uuid, boolean) to authenticated;
revoke all on function public.operacao_conferencia_pecas(uuid, boolean) from anon;

-- itens carregados (base da volta) somando o principal e os extras
create or replace function public.pedido_grupo_carregamento(p_pedido uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when bool_and(g.operacao->'carregamento'->'itens' is null) then null
              else coalesce(jsonb_agg(x) filter (where x is not null), '[]') end
    from separacoes_pedidos g left join lateral jsonb_array_elements(coalesce(g.operacao->'carregamento'->'itens','[]')) x on true
   where g.id = any(pedido_grupo(p_pedido))
$$;
revoke all on function public.pedido_grupo_carregamento(uuid) from public, anon;
grant execute on function public.pedido_grupo_carregamento(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.operacao_concluir_conferencia_sem_pagamento(p_pedido uuid, p_etapa text, p_aceitar_faltas boolean DEFAULT false, p_quantidades jsonb DEFAULT NULL::jsonb, p_observacoes jsonb DEFAULT NULL::jsonb, p_primeira jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.separacoes_pedidos; campo text; registro jsonb; faltas jsonb; total numeric; lidas numeric; itens jsonb; base jsonb; vazios int; sobras jsonb:='[]'; v_grupo uuid[]; agrupado boolean;
begin
  select * into strict p from public.separacoes_pedidos where id=p_pedido for update;
  if not public.eh_membro_empresa(p.empresa_id) or not public.funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para concluir'; end if;
  perform public.operacao_validar_etapa(p,p_etapa);
  if p_etapa='carregamento' and jsonb_array_length(coalesce(p.operacao->'carregamento_caminhoes','[]'))=0 then
    raise exception 'Selecione o caminhão em que o pedido foi carregado.';
  end if;
  v_grupo:=public.pedido_grupo(p.id); agrupado:=p_etapa<>'carregamento' and p.pedido_origem_id is null and cardinality(v_grupo)>1;
  if p.pedido_origem_id is not null and p_etapa<>'carregamento' then raise exception 'A volta deste pedido extra é conferida junto com o pedido principal'; end if;
  campo:=case p_etapa when 'carregamento' then 'lida_carregamento_em' when 'descarregamento' then 'lida_descarregamento_em' else 'lida_retorno_em' end;
  select count(*),count(to_jsonb(t)->>campo),coalesce(jsonb_agg(jsonb_build_object('codigo',t.codigo,'item_id',t.item_id,'item',coalesce(i.item_nome,'Item'))) filter(where to_jsonb(t)->>campo is null),'[]')
    into total,lidas,faltas from public.separacoes_etiquetas t left join public.separacoes_itens i on i.id=t.separacao_item_id
    where t.separacao_pedido_id=p.id and (p_etapa='carregamento' or t.lida_carregamento_em is not null);

  if total>0 and coalesce(p.modo_separacao,'qr')='qr' and not agrupado then
    if total>lidas and not p_aceitar_faltas then raise exception 'Existem peças faltando. Confirme a conclusão com pendência'; end if;
    registro:=jsonb_build_object('concluido_em',now(),'usuario_id',auth.uid(),'por',coalesce(auth.jwt()->>'email','Equipe'),'total',total,'lidas',lidas,'faltando',faltas,'as_cegas',p_etapa='retorno');
  else
    -- Sem etiquetas: conferência por quantidade.
    if p_quantidades is null or jsonb_typeof(p_quantidades)<>'object' then raise exception 'Informe a quantidade de cada item'; end if;
    base:=case when p_etapa<>'carregamento' then case when agrupado then public.pedido_grupo_carregamento(p.id) else p.operacao->'carregamento'->'itens' end end;
    with pecas as (
      select pc.chave, pc.item_id, pc.nome, pc.pedido_numero,
             coalesce((select (x->>'conferido')::numeric from jsonb_array_elements(base) x where x->>'chave'=pc.chave),
                      case when agrupado then (select count(*) filter(where t.lida_carregamento_em is not null) from public.separacoes_etiquetas t where t.separacao_item_id::text||'|'||t.item_id::text=pc.chave having count(*)>0) end,
                      case when base is null or agrupado then pc.esperado end, 0) esperado,
             case when p_quantidades->>pc.chave ~ '^\d+(\.\d+)?$' then (p_quantidades->>pc.chave)::numeric end conferido
        from public.operacao_conferencia_pecas(p.id, agrupado) pc)
    select coalesce(jsonb_agg(jsonb_build_object('chave',chave,'item_id',item_id,'pedido_numero',pedido_numero,'item',nome,'esperado',esperado,'conferido',conferido,'obs',nullif(left(btrim(coalesce(p_observacoes->>chave,'')),500),'')) order by nome),'[]'),
           coalesce(sum(esperado),0), coalesce(sum(least(conferido,esperado)),0),
           coalesce(jsonb_agg(jsonb_build_object('codigo',chave,'item_id',item_id,'item',nome,'esperado',esperado,'conferido',conferido,'faltam',esperado-conferido)) filter(where conferido<esperado),'[]'),
           count(*) filter(where conferido is null),
           coalesce(jsonb_agg(jsonb_build_object('codigo',chave,'item_id',item_id,'item',nome,'esperado',esperado,'conferido',conferido,'sobram',conferido-esperado)) filter(where conferido>esperado),'[]')
      into itens,total,lidas,faltas,vazios,sobras
      from pecas;
    if jsonb_array_length(itens)=0 then raise exception 'Este pedido não tem itens para conferir'; end if;
    if vazios>0 then raise exception 'Informe a quantidade de todos os itens'; end if;
    if jsonb_array_length(faltas)>0 and not p_aceitar_faltas then raise exception 'Existem peças faltando. Confirme a conclusão com pendência'; end if;
    registro:=jsonb_build_object('concluido_em',now(),'usuario_id',auth.uid(),'por',coalesce(auth.jwt()->>'email','Equipe'),'total',total,'lidas',lidas,'faltando',faltas,
      'as_cegas',p_etapa='retorno','sem_etiquetas',true,'itens',itens,'sobrando',sobras)
      ||case when jsonb_typeof(p_primeira)='object' then jsonb_build_object('primeira_contagem',p_primeira) else '{}'::jsonb end;
  end if;

  if p_etapa='carregamento' and jsonb_array_length(coalesce(registro->'faltando','[]'))>0
     and coalesce(current_setting('acervo.pendencia_ok',true),'')<>'1' then
    raise exception 'Informe o motivo e a data de carregamento das pendências.';
  end if;
  if p_etapa='carregamento' then registro:=registro||jsonb_build_object('caminhoes',p.operacao->'carregamento_caminhoes'); end if;
  update public.separacoes_pedidos set operacao=jsonb_set(coalesce(operacao,'{}'),array[p_etapa],registro),
    status_operacional=case when p.operacao->'retorno'->>'concluido_em' is not null then 'retornado' else case p_etapa when 'carregamento' then 'carregado' when 'descarregamento' then 'descarregado' else 'retornado' end end,
    revisao=revisao+1,atualizado_em=now() where id=p.id;
  -- pedido com extras: a volta foi conferida junto; as etiquetas de todos saem do trânsito e os extras ficam com a etapa concluída
  if agrupado then
    update public.separacoes_etiquetas t set lida_descarregamento_em=case when p_etapa='descarregamento' then coalesce(t.lida_descarregamento_em,now()) else t.lida_descarregamento_em end,
           lida_retorno_em=case when p_etapa='retorno' then coalesce(t.lida_retorno_em,now()) else t.lida_retorno_em end
     where t.separacao_pedido_id=any(v_grupo) and t.lida_carregamento_em is not null;
    perform set_config('app.fluxo_transferencia','sim',true);
    update public.separacoes_pedidos x set operacao=jsonb_set(coalesce(x.operacao,'{}'),array[p_etapa],
           jsonb_build_object('concluido_em',now(),'usuario_id',auth.uid(),'por',coalesce(auth.jwt()->>'email','Equipe'),'unificado_no',p.id,'pedido_principal',p.numero_pedido)),
           status_operacional=case when p_etapa='retorno' or x.operacao->'retorno'->>'concluido_em' is not null then 'retornado' else 'descarregado' end,
           revisao=x.revisao+1, atualizado_em=now()
     where x.id=any(v_grupo) and x.id<>p.id;
    perform set_config('app.fluxo_transferencia','',true);
  end if;
  -- Divergências da volta (Expedição: descarregamento; Triagem: retorno) ficam abertas até alguém resolver.
  -- Concluir de novo (recontagem) troca as divergências ainda abertas desta etapa pelas novas.
  if p_etapa in ('retorno','descarregamento') then
    delete from public.operacao_ocorrencias where pedido_id=p.id and tipo in ('falta','sobra') and resolvida_em is null and coalesce(etapa,'retorno')=p_etapa;
    insert into public.operacao_ocorrencias(empresa_id,pedido_id,item_id,codigo,tipo,quantidade,descricao,etapa,esperado,conferido)
      select p.empresa_id,p.id,(x->>'item_id')::uuid,case when p_etapa='retorno' then x->>'codigo' else 'descarregamento:'||(x->>'codigo') end,'falta',
             greatest(coalesce((x->>'faltam')::numeric,1),1),
             case when p_etapa='retorno' then 'Peça não devolvida: ' else 'Peça não descarregada: ' end||(x->>'item')||case when x ? 'faltam' then ' ('||(x->>'faltam')||')' else '' end,
             p_etapa,(x->>'esperado')::numeric,(x->>'conferido')::numeric
        from jsonb_array_elements(registro->'faltando') x
      on conflict(pedido_id,codigo,tipo) do nothing;
    insert into public.operacao_ocorrencias(empresa_id,pedido_id,item_id,codigo,tipo,quantidade,descricao,etapa,esperado,conferido)
      select p.empresa_id,p.id,(x->>'item_id')::uuid,case when p_etapa='retorno' then x->>'codigo' else 'descarregamento:'||(x->>'codigo') end,'sobra',
             (x->>'sobram')::numeric,'Veio a mais: '||(x->>'item')||' ('||(x->>'sobram')||')',p_etapa,(x->>'esperado')::numeric,(x->>'conferido')::numeric
        from jsonb_array_elements(coalesce(registro->'sobrando','[]')) x
      on conflict(pedido_id,codigo,tipo) do nothing;
  end if;
  if p_etapa='retorno' then
    update public.operacao_ocorrencias o set resolvida_em=now(),resolucao='Peça conferida no retorno'
      where pedido_id=p.id and tipo='falta' and resolvida_em is null and exists(select 1 from public.separacoes_etiquetas e where e.separacao_pedido_id=p.id and e.codigo=o.codigo and e.lida_retorno_em is not null);
  end if;
  return registro;
end $function$;

CREATE OR REPLACE FUNCTION public.logistica_confirmacao_base_antes_fluxo(p_pedido uuid, p_etapa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare p separacoes_pedidos; v_grupo uuid[]; falta_entrega text; entrega logistica_confirmacoes; atual logistica_confirmacoes; itens jsonb; hist jsonb; carregamento jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','select') then raise exception 'Sem acesso ao pedido';end if;
 if p_etapa is null or p_etapa not in ('entrega','coleta') then raise exception 'Etapa inválida';end if;
 select * into entrega from logistica_confirmacoes where pedido_id=p.id and etapa='entrega' order by versao desc limit 1;
 select * into atual from logistica_confirmacoes where pedido_id=p.id and etapa=p_etapa order by versao desc limit 1;
 carregamento:=coalesce(p.operacao->'carregamento','{}');
 if p_etapa='coleta' and p.pedido_origem_id is not null then raise exception 'A coleta deste pedido extra é feita junto com o pedido principal'; end if;
 v_grupo:=pedido_grupo(p.id);
 select string_agg(g.numero_pedido,', ' order by g.criado_em) into falta_entrega from separacoes_pedidos g
  where g.id=any(v_grupo) and g.id<>p.id and coalesce(g.status_comercial,'') in ('aprovado','enviado','finalizado')
    and not exists(select 1 from logistica_confirmacoes l where l.pedido_id=g.id and l.etapa='entrega');
 if p_etapa='coleta' then
  select coalesce(jsonb_agg((x-'retirado_lista'-'observacao'-'nao_entregue') || jsonb_build_object('quantidade_pedido',(x->>'previsto')::numeric,
   'nao_entregue_deposito',greatest(0,(x->>'previsto')::numeric-(x->>'entregue')::numeric),
   'ja_no_deposito',greatest(0,(x->>'previsto')::numeric-(x->>'entregue')::numeric)+coalesce((x->>'voltou_antes')::numeric,0),
   'previsto',greatest(0,(x->>'entregue')::numeric-(x->>'voltou_antes')::numeric)) order by x->>'nome'),'[]') into itens
  from (select y.x||jsonb_build_object('pedido_numero',y.numero_pedido) x from (
    select g.numero_pedido, jsonb_array_elements(coalesce(le.itens,'[]')) x
      from separacoes_pedidos g cross join lateral (select l.itens from logistica_confirmacoes l where l.pedido_id=g.id and l.etapa='entrega' order by l.versao desc limit 1) le
     where g.id=any(v_grupo)) y) x0(x);
 else
  -- A união mantém itens do carregamento e da confirmação anterior mesmo se saírem da lista atual.
  with pecas as(select * from operacao_conferencia_pecas(p.id)),
  carga as(select x from jsonb_array_elements(coalesce(carregamento->'itens','[]')) x),
  anteriores as(select x from jsonb_array_elements(coalesce(entrega.itens,'[]')) x),
  etiquetas as(select separacao_item_id::text||'|'||item_id::text chave,count(*) previsto,count(*) filter(where lida_carregamento_em is not null) carregado from separacoes_etiquetas where separacao_pedido_id=p.id and empresa_id=p.empresa_id group by 1),
  chaves as(select chave from pecas union select x->>'chave' from carga union select x->>'chave' from anteriores union select chave from etiquetas)
  select coalesce(jsonb_agg(jsonb_build_object('chave',k.chave,'item_id',coalesce(pc.item_id::text,a.x->>'item_id',split_part(k.chave,'|',2)),
   'nome',coalesce(pc.nome,a.x->>'nome',c.x->>'item','Item'),
   'previsto',greatest(coalesce(pc.esperado,0),coalesce((c.x->>'esperado')::numeric,0),coalesce(e.previsto,0),coalesce((a.x->>'previsto')::numeric,0)),
   'carregado',coalesce((c.x->>'conferido')::numeric,e.carregado), 'fora_lista',pc.chave is null) order by coalesce(pc.nome,a.x->>'nome',c.x->>'item','Item')),'[]') into itens
  from chaves k left join pecas pc on pc.chave=k.chave left join carga c on c.x->>'chave'=k.chave left join anteriores a on a.x->>'chave'=k.chave left join etiquetas e on e.chave=k.chave;
 end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.versao desc),'[]') into hist from logistica_confirmacoes c where pedido_id=p.id and etapa=p_etapa;
 return jsonb_build_object('pedido',jsonb_build_object('id',p.id,'numero_pedido',p.numero_pedido,'cliente_nome',p.cliente_nome,'local_nome',p.local_nome,'data_entrega',p.data_entrega,'data_coleta',p.data_coleta,
   'extras',(select coalesce(jsonb_agg(g.numero_pedido order by g.criado_em),'[]') from separacoes_pedidos g where g.id=any(v_grupo) and g.id<>p.id)),
  'itens',itens,'atual',case when atual.id is null then null else to_jsonb(atual) end,'historico',hist,
  'token',md5(itens::text||carregamento::text||coalesce(entrega.id::text,'')||coalesce(atual.id::text,'')||coalesce(falta_entrega,'')),
  'bloqueio',case when p.encerrado_operacional_em is not null then 'Operação encerrada.'
    when p.status='cancelado' or coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') then 'O pedido precisa estar aprovado.'
    when p_etapa='coleta' and entrega.id is null then 'Confirme a entrega antes de registrar a coleta.'
    when p_etapa='coleta' and falta_entrega is not null then 'Confirme a entrega do pedido extra '||falta_entrega||' antes de registrar a coleta.'
    when p_etapa='entrega' and exists(select 1 from logistica_confirmacoes where pedido_id=p.id and etapa='coleta') then 'A coleta já foi confirmada. Consulte o histórico da entrega.'
     end);
end $function$;

CREATE OR REPLACE FUNCTION public.fin_posicao_final_base(p_empresa uuid, p_pedido uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p separacoes_pedidos%rowtype; e logistica_confirmacoes%rowtype; c logistica_confirmacoes%rowtype;
 f fin_posicoes_finais%rowtype; linhas jsonb; titulos jsonb; pagamentos jsonb; credito jsonb;
 bruto numeric; fator numeric:=1; v_grupo uuid[];
begin
 if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa,'financeiro.fluxo.visualizar') then
  raise exception 'Sem permissão para consultar a posição final' using errcode='42501'; end if;
 select * into p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa;
 if not found then raise exception 'Pedido não encontrado nesta empresa'; end if;
 v_grupo:=pedido_grupo(p.id);
 select * into e from logistica_confirmacoes where pedido_id=p.id and empresa_id=p_empresa and etapa='entrega' order by versao desc limit 1;
 select * into c from logistica_confirmacoes where pedido_id=p.id and empresa_id=p_empresa and etapa='coleta' order by versao desc limit 1;
 select * into f from fin_posicoes_finais where pedido_id=p.id and empresa_id=p_empresa;
 select sum((x->>'valor_locacao')::numeric*(x->>'quantidade_solicitada')::numeric) into bruto
  from jsonb_array_elements(coalesce(p.observacoes->'itens_comerciais','[]')) x;
 if bruto>0 then
  fator:=least(1,greatest(0,coalesce((p.observacoes->'valores'->>'locacao_bv')::numeric,bruto)
   -greatest(fin_moeda(p.observacoes->'pagamento_config'->>'descontoComercial'),0))/bruto);
 end if;
 -- Não distribuir o preço de um kit entre componentes: preço ausente fica pendente.
 with comercial as (
  select x from separacoes_pedidos g, jsonb_array_elements(coalesce(g.observacoes->'itens_comerciais','[]')) x where g.id=any(v_grupo)
 ), ocorrencias as (
  select x, 'credito'::text tipo, greatest(0,(x->>'previsto')::numeric-coalesce((x->>'entregue')::numeric,0)) quantidade
   from separacoes_pedidos g cross join lateral (select l.itens from logistica_confirmacoes l where l.pedido_id=g.id and l.etapa='entrega' order by l.versao desc limit 1) le,
        jsonb_array_elements(coalesce(le.itens,'[]')) x where g.id=any(v_grupo)
  union all select x,'avaria',coalesce((x->>'danificado')::numeric,0) from jsonb_array_elements(coalesce(c.itens,'[]')) x
  union all select x,'desaparecido',coalesce((x->>'nao_coletado')::numeric,0) from jsonb_array_elements(coalesce(c.itens,'[]')) x
 ), precos as (
  select o.*, v.locacao*fator locacao,coalesce(v.reposicao,i.valor_reposicao) reposicao,coalesce(v.foto,i.foto_url) foto from ocorrencias o
  left join lateral (
   select case when count(distinct x->>'valor_locacao')=1 then min((x->>'valor_locacao')::numeric) end locacao,
    case when count(distinct x->>'valor_reposicao')=1 then min((x->>'valor_reposicao')::numeric) end reposicao,
    min(x->>'foto_url') foto from comercial where x->>'item_id'=o.x->>'item_id'
  ) v on true left join itens i on i.id::text=o.x->>'item_id' and i.empresa_id=p_empresa where o.quantidade>0
 ) select coalesce(jsonb_agg(jsonb_build_object(
  'chave',tipo||':'||(x->>'chave'),'item_id',x->>'item_id','nome',x->>'nome','foto_url',foto,
  'tipo',tipo,'quantidade',quantidade,'unitario',case when tipo='credito' then locacao else reposicao end,
  'valor',round(quantidade*case when tipo='credito' then locacao else reposicao end,2),
  'motivo',x->>'observacao') order by tipo,x->>'nome'),'[]') into linhas from precos;
 select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('pedido_numero',g.numero_pedido) order by g.criado_em,t.vencimento),'[]') into titulos from fin_receber t
  join separacoes_pedidos g on g.id=t.pedido_id where t.empresa_id=p_empresa and t.pedido_id=any(v_grupo);
 select coalesce(jsonb_agg(to_jsonb(b) order by b.data,b.created_at),'[]') into pagamentos from fin_baixas b
  join fin_receber t on t.id=b.receber_id and t.empresa_id=b.empresa_id where t.empresa_id=p_empresa and t.pedido_id=any(v_grupo);
 select to_jsonb(t) into credito from fin_pagar t where t.id=f.credito_id and t.empresa_id=p_empresa;
 return jsonb_build_object('pedido',jsonb_build_object('id',p.id,'numero_pedido',p.numero_pedido,'cliente_nome',p.cliente_nome,
  'local_nome',p.local_nome,'valor_total',(select sum(coalesce(g.valor_total,0)) from separacoes_pedidos g where g.id=any(v_grupo)),'data_evento',p.data_evento,
  'extras',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'numero',g.numero_pedido,'valor_total',g.valor_total) order by g.criado_em),'[]') from separacoes_pedidos g where g.id=any(v_grupo) and g.id<>p.id)),
  'itens',linhas,'salvo',case when f.pedido_id is null then null else to_jsonb(f) end,
  'fonte',md5(coalesce(e.id::text,'')||coalesce(c.id::text,'')||coalesce(linhas::text,'')),
  'entrega_confirmada',e.id is not null,'coleta_confirmada',c.id is not null,
  'titulos',titulos,'pagamentos',pagamentos,'credito_titulo',credito);
end $function$;

CREATE OR REPLACE FUNCTION public.mont_contagem_itens(p_token text, p_etapa uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s app_sessoes := app_sessao(p_token, 'montador'); e operacao_etapas; p separacoes_pedidos; r operacao_registros;
begin
  select * into e from operacao_etapas where id = p_etapa;
  if e.id is null or not mont_pode_ver(s, p_etapa) then raise exception 'Entre no app como responsável por esta etapa.'; end if;
  select * into p from separacoes_pedidos where id = e.pedido_id;
  select * into r from operacao_registros where etapa_id = p_etapa and tipo = 'contagem_itens';
  return jsonb_build_object('enviado', r.id is not null, 'quantidades', coalesce(r.dados->'itens', '{}'), 'autor', r.autor,
    'itens', coalesce((select jsonb_agg(jsonb_build_object('chave', c.chave, 'item_id', c.item_id, 'nome', c.nome, 'kit_nome', c.kit_nome, 'por_kit', c.por_kit, 'pedido_numero', case when cardinality(pedido_grupo(p.id)) > 1 then c.pedido_numero end,
        'esperado', coalesce((select (x->>'conferido')::numeric from jsonb_array_elements(coalesce(pedido_grupo_carregamento(p.id), '[]')) x where x->>'chave' = c.chave limit 1), c.esperado),
        'foto', (select foto_url from itens where id = c.item_id)) order by c.kit_nome nulls first, c.nome)
      from operacao_conferencia_pecas(p.id, true) c), '[]'));
end $function$;

CREATE OR REPLACE FUNCTION public.mont_contagem_salvar(p_token text, p_etapa uuid, p_quantidades jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s app_sessoes := app_sessao(p_token, 'montador'); e operacao_etapas; c record; q jsonb := '{}'; v numeric;
begin
  select * into e from operacao_etapas where id = p_etapa;
  if e.id is null or not mont_pode_ver(s, p_etapa) then raise exception 'Entre no app como responsável por esta etapa.'; end if;
  if e.tipo <> 'desmontagem' then raise exception 'A contagem por item é da desmontagem.'; end if;
  if exists (select 1 from operacao_registros where etapa_id = p_etapa and tipo = 'desmontagem_concluida') then raise exception 'A desmontagem já foi concluída.'; end if;
  for c in select * from operacao_conferencia_pecas(e.pedido_id, true) loop
    v := nullif(p_quantidades->>c.chave, '')::numeric;
    if v is null or v < 0 or v <> trunc(v) then raise exception 'Informe a quantidade de: % (0 se não voltou).', c.nome; end if;
    q := q || jsonb_build_object(c.chave, v);
  end loop;
  insert into operacao_registros (empresa_id, etapa_id, tipo, dados, autor) values (e.empresa_id, p_etapa, 'contagem_itens', jsonb_build_object('itens', q, 'em', now()), s.nome)
  on conflict (etapa_id, tipo) do update set dados = excluded.dados, autor = excluded.autor, atualizado_em = now();
  return mont_contagem_itens(p_token, p_etapa);
end $function$;

CREATE OR REPLACE FUNCTION public.acervo_divergencias(p_empresa uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          'carregamento', (select (x->>'conferido')::numeric from jsonb_array_elements(coalesce(pedido_grupo_carregamento(p.id), '[]')) x where x->>'chave' = regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', '') limit 1),
          'desmontagem', (select (r.dados->'itens'->>regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', ''))::numeric from operacao_registros r join operacao_etapas e on e.id = r.etapa_id
                           where e.pedido_id = p.id and e.tipo = 'desmontagem' and r.tipo = 'contagem_itens' limit 1),
          'desmontagem_por', (select r.autor from operacao_registros r join operacao_etapas e on e.id = r.etapa_id where e.pedido_id = p.id and e.tipo = 'desmontagem' and r.tipo = 'contagem_itens' limit 1),
          'descarregamento', (select (x->>'conferido')::numeric from jsonb_array_elements(coalesce(p.operacao->'descarregamento'->'itens', '[]')) x where x->>'chave' = regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', '') limit 1),
          'descarregamento_1', (p.operacao->'descarregamento'->'primeira_contagem'->>regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', ''))::numeric,
          'triagem', (select (x->>'conferido')::numeric from jsonb_array_elements(coalesce(p.operacao->'retorno'->'itens', '[]')) x where x->>'chave' = regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', '') limit 1),
          'triagem_1', (p.operacao->'retorno'->'primeira_contagem'->>regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', ''))::numeric,
          'saiu', (select c.esperado from operacao_conferencia_pecas(p.id, true) c where c.chave = regexp_replace(coalesce(o.codigo, ''), '^descarregamento:', '') limit 1))) d
        from operacao_ocorrencias o join separacoes_pedidos p on p.id = o.pedido_id
       where o.empresa_id = p_empresa and o.tipo in ('falta', 'sobra') and coalesce(o.etapa, '') in ('retorno', 'descarregamento')
         and (o.resolvida_em is null or o.resolvida_em > now() - interval '60 days')) z), '[]'));
end $function$;
