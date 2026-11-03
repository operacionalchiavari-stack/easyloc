begin;
alter table public.pedido_sublocacoes add column quantidade_recebida integer not null default 0;
alter table public.pedido_sublocacoes add column quantidade_devolvida integer not null default 0;
update public.pedido_sublocacoes set quantidade_recebida=quantidade where status in ('recebida','devolvida');
update public.pedido_sublocacoes set quantidade_devolvida=quantidade where status='devolvida';
alter table public.pedido_sublocacoes add constraint pedido_sublocacoes_remessas_check
 check(quantidade_recebida>=0 and quantidade_recebida<=quantidade and quantidade_devolvida>=0 and quantidade_devolvida<=quantidade_recebida);
alter table public.pedido_sublocacoes drop constraint pedido_sublocacoes_status_check;
alter table public.pedido_sublocacoes add constraint pedido_sublocacoes_status_check
 check(status in ('cotacao','confirmada','recebida_parcial','recebida','devolvida_parcial','devolvida','cancelada'));
create or replace function public.pedido_sublocado_qtd(p_pedido uuid,p_item uuid) returns numeric
language sql stable security definer set search_path=public as $$
 select coalesce(sum(quantidade),0)::numeric from pedido_sublocacoes where pedido_id=p_pedido and item_id=p_item and status in ('confirmada','recebida_parcial','recebida','devolvida_parcial','devolvida');
$$;
do $$ declare d text;
begin
 select pg_get_functiondef('public.pedido_sublocacao_validar(uuid)'::regprocedure) into d;
 d:=replace(d,'''confirmada'',''recebida'',''devolvida''','''confirmada'',''recebida_parcial'',''recebida'',''devolvida_parcial'',''devolvida''');execute d;
end $$;

create or replace function public.pedido_sublocacao_salvar(p_pedido uuid,p_dados jsonb,p_id uuid default null,p_revisao bigint default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;ant pedido_sublocacoes;n pedido_sublocacoes;it jsonb;lista jsonb;solicitado text;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_pode(p.empresa_id,auth.uid(),'comercial.pedidos.editar') then raise exception 'Sem permissão para gerir sublocações';end if;
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 perform pg_advisory_xact_lock(hashtextextended(p.empresa_id::text,0));
 if p_id is not null then
  select * into strict ant from pedido_sublocacoes where id=p_id and pedido_id=p.id for update;
  if p_revisao is distinct from ant.revisao then raise exception 'Sublocação alterada em outra tela. Atualize antes de salvar';end if;
 end if;
 n:=jsonb_populate_record(null::pedido_sublocacoes,p_dados-ARRAY['id','empresa_id','pedido_id','criado_por','criado_em','atualizado_em','revisao']);solicitado:=n.status;
 if not exists(select 1 from itens where id=n.item_id and empresa_id=p.empresa_id) or not exists(select 1 from fornecedores where id=n.fornecedor_id and empresa_id=p.empresa_id) then raise exception 'Item ou fornecedor não pertence à empresa';end if;
 if n.fornecedor_id is distinct from ant.fornecedor_id and exists(select 1 from fornecedores where id=n.fornecedor_id and lower(coalesce(status,'')) in ('inativo','inativa')) then raise exception 'Selecione um fornecedor ativo';end if;
 if n.quantidade is null or n.quantidade<=0 or n.custo_unitario is null or n.custo_unitario<0 or n.custo_unitario::text in ('NaN','Infinity','-Infinity') then raise exception 'Revise quantidade e custo';end if;
 if n.retirada is null or n.devolucao is null or n.devolucao<n.retirada or n.status is null or n.status not in ('cotacao','confirmada','recebida_parcial','recebida','devolvida_parcial','devolvida','cancelada') then raise exception 'Revise período e situação';end if;
 if ant.status='devolvida' then raise exception 'Sublocação já devolvida. O histórico está encerrado';end if;
 if ant.status='cancelada' or (p_id is null and n.status not in ('cotacao','confirmada')) or (ant.status='cotacao' and n.status not in ('cotacao','confirmada','cancelada')) or (ant.status='confirmada' and n.status='cotacao') then raise exception 'Mudança de situação inválida. Confirme, receba e devolva nesta ordem';end if;
 if coalesce(ant.quantidade_recebida,0)>0 and row(n.item_id,n.fornecedor_id,n.quantidade) is distinct from row(ant.item_id,ant.fornecedor_id,ant.quantidade) then raise exception 'Não altere item, fornecedor ou quantidade depois do recebimento. Para o saldo ainda não recebido, use Transferir saldo';end if;
 n.quantidade_recebida:=coalesce(n.quantidade_recebida,case when n.status='recebida' and not(p_dados ? 'quantidade_recebida') then n.quantidade else coalesce(ant.quantidade_recebida,0) end);
 n.quantidade_devolvida:=coalesce(n.quantidade_devolvida,case when n.status='devolvida' and not(p_dados ? 'quantidade_devolvida') then n.quantidade else coalesce(ant.quantidade_devolvida,0) end);
 if n.quantidade_recebida<0 or n.quantidade_recebida>n.quantidade or n.quantidade_devolvida<0 or n.quantidade_devolvida>n.quantidade_recebida then raise exception 'Mudança de situação inválida: devolução não pode superar o recebido e recebimento não pode superar o contratado';end if;
 if n.quantidade_recebida<coalesce(ant.quantidade_recebida,0) or n.quantidade_devolvida<coalesce(ant.quantidade_devolvida,0) then raise exception 'Os totais acumulados não podem diminuir. Acione o responsável para corrigir uma conferência já registrada';end if;
 if n.status in ('cotacao','cancelada') and (n.quantidade_recebida>0 or n.quantidade_devolvida>0) then raise exception 'Não cancele ou volte à cotação depois de receber peças. Registre a devolução';end if;
 if n.status in ('recebida_parcial','recebida','devolvida_parcial','devolvida') and n.quantidade_recebida=0 then raise exception 'Informe a quantidade recebida antes de registrar recebimento ou devolução';end if;
 if n.status not in ('cotacao','cancelada') then
  n.status:=case when n.quantidade_devolvida=n.quantidade then 'devolvida' when n.quantidade_devolvida>0 then 'devolvida_parcial'
   when n.quantidade_recebida=n.quantidade then 'recebida' when n.quantidade_recebida>0 then 'recebida_parcial' else 'confirmada' end;
 end if;
 if (p.operacao->'carregamento'->>'iniciado_em' is not null or coalesce(p.status_operacional,'')<>'')
  and (p_id is null or row(n.item_id,n.fornecedor_id,n.quantidade) is distinct from row(ant.item_id,ant.fornecedor_id,ant.quantidade) or (n.status='cancelada' and ant.status<>'cancelada'))
  and (n.status<>'cancelada' or ant.status<>'cotacao') then raise exception 'Carregamento iniciado: preserve a origem das peças e registre ajustes com o responsável operacional';end if;
 if (p.status_comercial='cancelado' or p.encerrado_operacional_em is not null) and n.quantidade_recebida>coalesce(ant.quantidade_recebida,0) then raise exception 'Pedido encerrado: apenas devolva as peças já recebidas';end if;
 if p_id is null and n.status='confirmada' and (p.status_comercial='cancelado' or p.encerrado_operacional_em is not null) then raise exception 'Pedido encerrado: não confirme novas contratações';end if;
 n.id:=coalesce(p_id,gen_random_uuid());n.empresa_id:=p.empresa_id;n.pedido_id:=p.id;n.criado_por:=coalesce(ant.criado_por,auth.uid());
 n.criado_em:=coalesce(ant.criado_em,now());n.atualizado_em:=now();n.revisao:=coalesce(ant.revisao,-1)+1;n.observacao:=btrim(coalesce(n.observacao,''));
 if length(n.observacao)>2000 then raise exception 'Observação muito longa';end if;
 select t into it from jsonb_array_elements(pedido_sublocacao_itens(p.id)) t where t->>'item_id'=n.item_id::text;
 if n.status not in ('cancelada','devolvida') and (it is null or n.quantidade>(it->>'quantidade')::numeric) then raise exception 'Selecione um item do pedido e respeite sua quantidade';end if;
 insert into pedido_sublocacoes select n.* on conflict(id) do update set item_id=excluded.item_id,fornecedor_id=excluded.fornecedor_id,
  quantidade=excluded.quantidade,custo_unitario=excluded.custo_unitario,retirada=excluded.retirada,devolucao=excluded.devolucao,status=excluded.status,
  observacao=excluded.observacao,revisao=excluded.revisao,atualizado_em=excluded.atualizado_em,quantidade_recebida=excluded.quantidade_recebida,quantidade_devolvida=excluded.quantidade_devolvida;
 perform pedido_sublocacao_validar(p.id);
 if p.status_comercial in ('pre_reserva','aprovado','enviado') and p.encerrado_operacional_em is null then
  select coalesce(jsonb_agg(jsonb_build_object('item_id',s.item_id,'quantidade_solicitada',s.quantidade_solicitada)),'[]') into lista from separacoes_itens s where s.separacao_pedido_id=p.id;
  perform operacao_validar_reserva(p.empresa_id,p.id,lista,coalesce(p.data_entrega,p.data_evento),coalesce(p.data_coleta,p.data_evento_fim,p.data_evento));
 end if;
 insert into pedido_sublocacoes_historico(empresa_id,sublocacao_id,usuario_id,antes,depois) values(p.empresa_id,n.id,auth.uid(),case when ant.id is null then null else to_jsonb(ant) end,to_jsonb(n));
 return pedido_sublocacao_base(p.id);
end $$;
create or replace function public.pedido_sublocacao_exigir_recebimento() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status is distinct from old.status and new.status in ('separado','separado_com_divergencia') and exists(
  select 1 from pedido_sublocacoes where pedido_id=new.id and status not in ('cotacao','cancelada') and quantidade_recebida-quantidade_devolvida<quantidade) then
  raise exception 'Há peças sublocadas aguardando recebimento ou já devolvidas ao fornecedor. Confira as quantidades antes de finalizar a Triagem.';
 end if;
 return new;
end $$;

create function public.pedido_sublocacao_transferir_saldo(p_id uuid,p_revisao bigint,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare ant pedido_sublocacoes;depois pedido_sublocacoes;nova pedido_sublocacoes;p separacoes_pedidos;saldo integer;motivo text;
begin
 select * into strict ant from pedido_sublocacoes where id=p_id;
 if auth.uid() is null or not eh_membro_empresa(ant.empresa_id) or not funcionario_pode(ant.empresa_id,auth.uid(),'comercial.pedidos.editar') then raise exception 'Sem permissão';end if;
 select * into strict p from separacoes_pedidos where id=ant.pedido_id for update;
 perform pg_advisory_xact_lock(hashtextextended(p.empresa_id::text,0));
 select * into strict ant from pedido_sublocacoes where id=p_id for update;
 if ant.revisao is distinct from p_revisao then raise exception 'Sublocação alterada em outra tela. Atualize';end if;
 if ant.status not in ('recebida_parcial','devolvida_parcial') or ant.quantidade_recebida<=0 or ant.quantidade_recebida>=ant.quantidade then raise exception 'Não há saldo de recebimento para transferir';end if;
 if p.encerrado_operacional_em is not null or p.status_comercial='cancelado' or p.operacao->'carregamento'->>'iniciado_em' is not null or coalesce(p.status_operacional,'')<>'' then raise exception 'Resolva a troca de fornecedor antes do carregamento ou encerramento';end if;
 motivo:=btrim(coalesce(p_dados->>'observacao',''));if length(motivo)<5 or length(motivo)>1800 then raise exception 'Registre o acordo com os fornecedores para transferir o saldo';end if;
 saldo:=ant.quantidade-ant.quantidade_recebida;
 nova:=jsonb_populate_record(null::pedido_sublocacoes,p_dados);
 if nova.fornecedor_id is null or nova.fornecedor_id=ant.fornecedor_id or not exists(select 1 from fornecedores where id=nova.fornecedor_id and empresa_id=p.empresa_id and lower(coalesce(status,'')) not in ('inativo','inativa')) then raise exception 'Selecione outro fornecedor ativo da empresa';end if;
 if nova.custo_unitario is null or nova.custo_unitario<0 or nova.custo_unitario::text in ('NaN','Infinity','-Infinity') or nova.retirada is null or nova.devolucao is null or nova.devolucao<nova.retirada then raise exception 'Revise custo e período do novo fornecedor';end if;
 update pedido_sublocacoes set quantidade=quantidade_recebida,status=case when quantidade_devolvida=quantidade_recebida then 'devolvida' when quantidade_devolvida>0 then 'devolvida_parcial' else 'recebida' end,
  observacao=left(observacao||E'\nSaldo transferido: '||motivo,2000),revisao=revisao+1,atualizado_em=now() where id=ant.id returning * into depois;
 nova.id:=gen_random_uuid();nova.empresa_id:=p.empresa_id;nova.pedido_id:=p.id;nova.item_id:=ant.item_id;nova.quantidade:=saldo;nova.quantidade_recebida:=0;nova.quantidade_devolvida:=0;
 nova.status:='confirmada';nova.revisao:=0;nova.criado_por:=auth.uid();nova.criado_em:=now();nova.atualizado_em:=now();nova.observacao:='Saldo da sublocação '||ant.id::text||': '||motivo;
 insert into pedido_sublocacoes select nova.*;
 perform pedido_sublocacao_validar(p.id);
 insert into pedido_sublocacoes_historico(empresa_id,sublocacao_id,usuario_id,antes,depois) values(p.empresa_id,ant.id,auth.uid(),to_jsonb(ant),to_jsonb(depois)),(p.empresa_id,nova.id,auth.uid(),null,to_jsonb(nova));
 return pedido_sublocacao_base(p.id);
end $$;
revoke all on function public.pedido_sublocacao_transferir_saldo(uuid,bigint,jsonb) from public,anon;
grant execute on function public.pedido_sublocacao_transferir_saldo(uuid,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
