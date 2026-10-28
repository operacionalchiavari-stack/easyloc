-- Compensação quita obrigações, mas não registra uma entrada/saída bancária fictícia.
alter table public.fin_receber add column compensado numeric(15,2) not null default 0 check(compensado>=0);
alter table public.fin_pagar add column compensado numeric(15,2) not null default 0 check(compensado>=0);
alter table public.fin_receber drop column aberto;
alter table public.fin_receber add column aberto numeric(15,2) generated always as(greatest(valor-recebido-compensado,0)) stored;
alter table public.fin_pagar drop column aberto;
alter table public.fin_pagar add column aberto numeric(15,2) generated always as(greatest(valor-pago-compensado,0)) stored;
create table public.fin_compensacoes(id uuid primary key,empresa_id uuid not null references empresas(id),credito_id uuid not null references fin_pagar(id),receber_id uuid not null references fin_receber(id),
 valor numeric(15,2) not null check(valor>0),criado_por uuid not null,criado_em timestamptz not null default now(),estornado_em timestamptz,estornado_por uuid,motivo text not null,estorno_motivo text);
alter table fin_compensacoes enable row level security;
create policy ler on fin_compensacoes for select to authenticated using(eh_membro_empresa(empresa_id) and fin_pode(empresa_id,'financeiro.fluxo.visualizar'));
revoke all on fin_compensacoes from anon,authenticated;grant select on fin_compensacoes to authenticated;
create function public.fin_compensacao_status() returns trigger language plpgsql set search_path=public as $$
declare quitado numeric;begin
 quitado:=new.compensado+case when TG_TABLE_NAME='fin_receber' then (to_jsonb(new)->>'recebido')::numeric else (to_jsonb(new)->>'pago')::numeric end;
 if new.compensado>0 and quitado>new.valor then raise exception 'O valor do título não pode ficar abaixo do que já foi quitado';end if;
 if new.status<>'cancelado' and (new.compensado>0 or old.compensado>0) then
  if quitado>=new.valor then new.status:=case when TG_TABLE_NAME='fin_receber' then 'recebido' else 'pago' end;
  elsif quitado>0 then new.status:='parcial';else new.status:=case when TG_TABLE_NAME='fin_receber' then 'aberto' else 'pendente' end;end if;
 end if;return new;
end $$;
create trigger zz_compensacao_status before update on fin_receber for each row execute function fin_compensacao_status();
create trigger zz_compensacao_status before update on fin_pagar for each row execute function fin_compensacao_status();
create function public.fin_credito_compensar(p_empresa uuid,p_id uuid,p_credito uuid,p_receber uuid,p_valor numeric,p_motivo text) returns uuid language plpgsql security definer set search_path=public as $$
declare c fin_pagar;r fin_receber;a fin_compensacoes;begin
 if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa,'financeiro.contas_receber.editar') or not fin_pode(p_empresa,'financeiro.contas_pagar.editar') then raise exception 'Sem permissão para compensar';end if;
 if p_valor is null or p_valor<=0 or p_valor::text in ('NaN','Infinity','-Infinity') or p_valor<>round(p_valor,2) or length(btrim(coalesce(p_motivo,'')))<5 then raise exception 'Informe valor e motivo válidos';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into a from fin_compensacoes where id=p_id;
 if found then if a.empresa_id=p_empresa and a.credito_id=p_credito and a.receber_id=p_receber and a.valor=p_valor then return a.id;end if;raise exception 'Identificador já utilizado';end if;
 select * into strict c from fin_pagar where id=p_credito and empresa_id=p_empresa for update;
 select * into strict r from fin_receber where id=p_receber and empresa_id=p_empresa for update;
 if c.origem<>'credito_cliente' or c.fornecedor_id is distinct from r.cliente_id or r.cliente_id is null then raise exception 'Crédito e dívida precisam ser do mesmo cliente';end if;
 if c.status='cancelado' or r.status='cancelado' or p_valor>least(c.aberto,r.aberto) then raise exception 'Valor supera o crédito ou a dívida disponível';end if;
 insert into fin_compensacoes values(p_id,p_empresa,c.id,r.id,p_valor,auth.uid(),now(),null,null,p_motivo,null);
 update fin_pagar set compensado=compensado+p_valor where id=c.id;
 update fin_receber set compensado=compensado+p_valor where id=r.id;
 perform fin_auditar(p_empresa,'fin_compensacoes',p_id,'compensar',null,jsonb_build_object('credito',c.id,'receber',r.id,'valor',p_valor),p_motivo);return p_id;
end $$;
create function public.fin_credito_compensacao_estornar(p_empresa uuid,p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path=public as $$
declare a fin_compensacoes;begin
 if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa,'financeiro.contas_receber.editar') or not fin_pode(p_empresa,'financeiro.contas_pagar.editar') then raise exception 'Sem permissão para estornar';end if;
 if length(btrim(coalesce(p_motivo,'')))<5 then raise exception 'Informe o motivo do estorno';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into strict a from fin_compensacoes where id=p_id and empresa_id=p_empresa for update;if a.estornado_em is not null then return;end if;
 update fin_pagar set compensado=compensado-a.valor where id=a.credito_id;
 update fin_receber set compensado=compensado-a.valor where id=a.receber_id;
 update fin_compensacoes set estornado_em=now(),estornado_por=auth.uid(),estorno_motivo=p_motivo where id=p_id;
 perform fin_auditar(p_empresa,'fin_compensacoes',p_id,'estorno',to_jsonb(a),null,p_motivo);
end $$;
alter function fin_conta_cliente_extrato(uuid,uuid) rename to fin_conta_cliente_extrato_sem_compensacoes;
revoke all on function fin_conta_cliente_extrato_sem_compensacoes(uuid,uuid) from public,anon,authenticated;
create function fin_conta_cliente_extrato(p_empresa uuid,p_cliente uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare b jsonb;c jsonb;begin
 b:=fin_conta_cliente_extrato_sem_compensacoes(p_empresa,p_cliente);
 select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('numero_pedido',r.pedido_numero)),'[]') into c from fin_compensacoes x join fin_receber r on r.id=x.receber_id where x.empresa_id=p_empresa and (p_cliente is null or r.cliente_id=p_cliente);
 return b||jsonb_build_object('compensacoes',c);
end $$;

create table public.fin_custos_evento(id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),pedido_id uuid not null references separacoes_pedidos(id),
 categoria text not null check(categoria in ('equipe','frete','terceiros','personalizacao','reparo','impostos','outros')),descricao text not null,valor numeric(15,2) not null check(valor>0),
 pagar_id uuid unique references fin_pagar(id),acervo_historico_id uuid unique references acervo_historico(id),criado_por uuid not null,criado_em timestamptz not null default now(),cancelado_em timestamptz,cancelamento_motivo text);
create table public.fin_resultados_revisados(pedido_id uuid primary key references separacoes_pedidos(id),empresa_id uuid not null references empresas(id),revisado_por uuid not null,revisado_em timestamptz not null default now());
do $$ declare t text;begin foreach t in array array['fin_custos_evento','fin_resultados_revisados'] loop
 execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);execute format('grant select on %I to authenticated',t);
 execute format('create policy ler on %I for select to authenticated using(eh_membro_empresa(empresa_id) and fin_pode(empresa_id,''financeiro.fluxo.visualizar''))',t);
end loop;end $$;
create function public.fin_custo_evento(p_empresa uuid,p_pedido uuid,p_categoria text,p_descricao text,p_valor numeric,p_pagar uuid default null,p_id uuid default gen_random_uuid()) returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid;c fin_custos_evento;begin
 if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa,'financeiro.fluxo.editar') then raise exception 'Sem permissão para registrar custos';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text,0));
 select * into c from fin_custos_evento where id=p_id;
 if found then
  if c.empresa_id=p_empresa and c.pedido_id=p_pedido and c.categoria=p_categoria and c.descricao=p_descricao and c.valor=p_valor and c.pagar_id is not distinct from p_pagar and c.criado_por=auth.uid() then return c.id;end if;
  raise exception 'Identificador de custo ja utilizado';
 end if;
 if not exists(select 1 from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa) then raise exception 'Pedido fora da empresa';end if;
 if p_pagar is not null and not exists(select 1 from fin_pagar where id=p_pagar and empresa_id=p_empresa and status<>'cancelado' and valor=p_valor) then raise exception 'Título de custo inválido ou valor diferente';end if;
 if length(btrim(coalesce(p_descricao,'')))<3 or p_valor is null or p_valor<=0 or p_valor::text in ('NaN','Infinity','-Infinity') then raise exception 'Custo inválido';end if;
 insert into fin_custos_evento(id,empresa_id,pedido_id,categoria,descricao,valor,pagar_id,criado_por) values(p_id,p_empresa,p_pedido,p_categoria,p_descricao,p_valor,p_pagar,auth.uid()) returning id into v;
 delete from fin_resultados_revisados where pedido_id=p_pedido;
 perform fin_auditar(p_empresa,'fin_custos_evento',v,'registrar',null,jsonb_build_object('valor',p_valor,'pedido',p_pedido),p_descricao);return v;
end $$;
create function public.fin_custo_reparo_acervo() returns trigger language plpgsql security definer set search_path=public as $$
declare r acervo_retornos;begin if new.custo>0 then
 select * into strict r from acervo_retornos where id=new.retorno_id;
 insert into fin_custos_evento(empresa_id,pedido_id,categoria,descricao,valor,acervo_historico_id,criado_por) values(new.empresa_id,r.pedido_id,'reparo',new.motivo,new.custo,new.id,new.usuario_id);
 delete from fin_resultados_revisados where pedido_id=r.pedido_id;
 end if;return new;end $$;
create trigger fin_custo_acervo after insert on acervo_historico for each row execute function fin_custo_reparo_acervo();
create function public.fin_custos_revisar(p_empresa uuid,p_pedido uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa,'financeiro.fluxo.editar') then raise exception 'Sem permissão para revisar custos';end if;
 if not exists(select 1 from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa) then raise exception 'Pedido fora da empresa';end if;
 insert into fin_resultados_revisados values(p_pedido,p_empresa,auth.uid(),now()) on conflict(pedido_id) do update set revisado_por=auth.uid(),revisado_em=now();
end $$;
create function public.fin_resultado_eventos(p_empresa uuid,p_inicio date,p_fim date) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare eventos jsonb;itens_resultado jsonb;begin
 if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa,'financeiro.fluxo.visualizar') then raise exception 'Sem permissão para consultar resultados';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.data_evento desc),'[]') into eventos from(
 select p.id,p.numero_pedido,p.cliente_nome,p.data_evento,p.valor_total,
 coalesce(f.credito,0) credito,coalesce(f.cobranca,0) reposicao,
 coalesce((select sum(c.valor) from fin_custos_evento c where c.pedido_id=p.id and c.cancelado_em is null),0) custos,
 exists(select 1 from fin_resultados_revisados where pedido_id=p.id) custos_revisados,
 coalesce((select sum(t.aberto) from fin_receber t where t.pedido_id=p.id and t.status<>'cancelado'),0) em_aberto,
 coalesce((select sum(b.valor+b.juros+b.multa-b.desconto) from fin_baixas b join fin_receber t on t.id=b.receber_id where t.pedido_id=p.id and b.estornado_em is null),0) recebido
 from separacoes_pedidos p left join fin_posicoes_finais f on f.pedido_id=p.id and f.status='confirmado'
 where p.empresa_id=p_empresa and p.status_comercial in ('aprovado','enviado','finalizado') and p.status<>'cancelado' and p.data_evento between p_inicio and p_fim)x;
 with locacoes as(select i.id,i.produto,coalesce(i.foto_url,'') foto_url,(x->>'quantidade_solicitada')::numeric qtd,
 (x->>'quantidade_solicitada')::numeric*(x->>'valor_locacao')::numeric receita
 from separacoes_pedidos p cross join lateral jsonb_array_elements(coalesce(p.observacoes->'itens_comerciais','[]')) x join itens i on i.id::text=x->>'item_id' and i.empresa_id=p_empresa
 where p.empresa_id=p_empresa and p.status_comercial in ('aprovado','enviado','finalizado') and p.status<>'cancelado' and p.data_evento between p_inicio and p_fim)
 select coalesce(jsonb_agg(to_jsonb(x) order by x.receita_locacao desc),'[]') into itens_resultado from(select l.id,l.produto,l.foto_url,sum(qtd) quantidade,sum(receita) receita_locacao,
 coalesce((select sum(a.custo) from acervo_retornos a join separacoes_pedidos p on p.id=a.pedido_id where a.item_id=l.id and p.data_evento between p_inicio and p_fim),0) reparos,
 coalesce((select sum(a.quantidade) from acervo_retornos a join separacoes_pedidos p on p.id=a.pedido_id where a.item_id=l.id and a.tipo='avaria' and p.data_evento between p_inicio and p_fim),0) avarias
 from locacoes l group by l.id,l.produto,l.foto_url)x;
 return jsonb_build_object('eventos',eventos,'itens',itens_resultado);
end $$;
-- Finalizado comercialmente só quando a análise foi confirmada E não há dívida em aberto.
create or replace function public.comercial_fluxo_pedidos(p_empresa uuid,p_pedidos uuid[]) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb;begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_pode(p_empresa,auth.uid(),'comercial.pedidos.visualizar') then raise exception 'Sem permissão para consultar o fluxo';end if;
 if coalesce(cardinality(p_pedidos),0)>500 then raise exception 'Consulte até 500 pedidos por vez';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'etapa',pedido_fluxo_etapa(p),
 'operacao_concluida',p.operacao->'retorno'->>'concluido_em' is not null and p.operacao->'descarregamento'->>'concluido_em' is not null,
 'financeiro_pendente',exists(select 1 from fin_receber t where t.pedido_id=p.id and t.status<>'cancelado' and t.aberto>0),
 'finalizado',exists(select 1 from fin_posicoes_finais f where f.pedido_id=p.id and f.status='confirmado') and not exists(select 1 from fin_receber t where t.pedido_id=p.id and t.status<>'cancelado' and t.aberto>0))),'[]') into r
 from separacoes_pedidos p where p.empresa_id=p_empresa and p.id=any(p_pedidos);return r;
end $$;
revoke all on function public.fin_credito_compensar(uuid,uuid,uuid,uuid,numeric,text),public.fin_credito_compensacao_estornar(uuid,uuid,text),public.fin_conta_cliente_extrato(uuid,uuid),public.fin_custo_evento(uuid,uuid,text,text,numeric,uuid,uuid),public.fin_custos_revisar(uuid,uuid),public.fin_resultado_eventos(uuid,date,date) from public,anon;
grant execute on function public.fin_credito_compensar(uuid,uuid,uuid,uuid,numeric,text),public.fin_credito_compensacao_estornar(uuid,uuid,text),public.fin_conta_cliente_extrato(uuid,uuid),public.fin_custo_evento(uuid,uuid,text,text,numeric,uuid,uuid),public.fin_custos_revisar(uuid,uuid),public.fin_resultado_eventos(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
