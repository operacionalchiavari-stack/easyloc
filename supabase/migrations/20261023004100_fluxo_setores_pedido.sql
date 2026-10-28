begin;
-- Reaberturas são transferências explícitas, autorizadas e registradas.
do $migration$
declare fonte text;
begin
 select pg_get_functiondef('operacao_validar_pedido_update()'::regprocedure) into fonte;
 fonte:=replace(fonte,'begin',E'begin\n  if current_setting(''app.fluxo_transferencia'',true)=''sim'' then return new;end if;\n  if old.status<>''pendente'' and old.reducao_liberada_em is null and row(new.cliente_id,new.cliente_nome,new.local_id,new.local_nome,new.data_evento,new.data_entrega,new.data_coleta,new.valor_total,new.observacoes,new.status_comercial) is distinct from row(old.cliente_id,old.cliente_nome,old.local_id,old.local_nome,old.data_evento,old.data_entrega,old.data_coleta,old.valor_total,old.observacoes,old.status_comercial) then raise exception ''Pedido com o operacional. Solicite a liberação para o Comercial'';end if;\n  if new.status is distinct from old.status then new.revisao:=old.revisao+1;end if;');
 execute fonte;
 select pg_get_functiondef('operacao_proteger_itens()'::regprocedure) into fonte;
 fonte:=replace(fonte,'if TG_OP=''UPDATE'' then',E'if p.operacao->''carregamento''->>''iniciado_em'' is not null or p.operacao->''carregamento''->>''concluido_em'' is not null then raise exception ''A Expedição assumiu o pedido. Solicite a liberação para a Triagem'';end if;\n  if TG_OP=''INSERT'' or TG_OP=''DELETE'' then\n    if p.status<>''pendente'' and p.reducao_liberada_em is null then raise exception ''A Triagem assumiu o pedido. Solicite a liberação para o Comercial'';end if;\n  end if;\n  if TG_OP=''UPDATE'' then');
 fonte:=replace(fonte,'if not mudou then',E'if mudou and p.status<>''pendente'' and p.reducao_liberada_em is null then raise exception ''A Triagem assumiu o pedido. Solicite a liberação para o Comercial'';end if;\n    if not mudou then');
 execute fonte;
end $migration$;

alter function pedido_salvar_integrado(uuid,jsonb,jsonb,bigint) rename to pedido_salvar_integrado_base_fluxo;
revoke all on function pedido_salvar_integrado_base_fluxo(uuid,jsonb,jsonb,bigint) from public,anon,authenticated;
create function pedido_salvar_integrado(p_id uuid,p_pedido jsonb,p_itens jsonb,p_revisao bigint default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p separacoes_pedidos;
begin
 if p_id is not null then
  select * into strict p from separacoes_pedidos where id=p_id for update;
  if not eh_membro_empresa(p.empresa_id) then raise exception 'Sem acesso ao pedido';end if;
  if p.encerrado_operacional_em is not null or p.operacao->'carregamento'->>'iniciado_em' is not null or coalesce(p.status_operacional,'')<>'' then raise exception 'Pedido com o operacional. Solicite a devolução para a Triagem e depois para o Comercial';end if;
  if p.status<>'pendente' and p.reducao_liberada_em is null then raise exception 'A Triagem assumiu o pedido. Solicite a liberação para o Comercial';end if;
 end if;
 return pedido_salvar_integrado_base_fluxo(p_id,p_pedido,p_itens,p_revisao);
end $$;
revoke all on function pedido_salvar_integrado(uuid,jsonb,jsonb,bigint) from public,anon;
grant execute on function pedido_salvar_integrado(uuid,jsonb,jsonb,bigint) to authenticated;

create function operacao_transferir_pedido(p_pedido uuid,p_acao text,p_motivo text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p separacoes_pedidos;op jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if not eh_membro_empresa(p.empresa_id) or auth.uid() is null then raise exception 'Sem acesso ao pedido';end if;
 if p.encerrado_operacional_em is not null then raise exception 'Operação encerrada';end if;
 if p_acao='devolver_triagem' then
  if not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão da Expedição';end if;
  if p.operacao->'carregamento'->>'concluido_em' is not null or coalesce(p.status_operacional,'')<>'' then raise exception 'O carregamento já foi concluído. Não é possível devolver essa conferência em andamento';end if;
  if p.operacao->'carregamento'->>'iniciado_em' is null then raise exception 'A conferência ainda não começou';end if;
 elsif p_acao in ('reabrir_triagem','devolver_comercial','retomar_triagem') then
  if not funcionario_tabela_permitida(p.empresa_id,'separacoes_itens','editar') then raise exception 'Sem permissão da Triagem';end if;
  if p.operacao->'carregamento'->>'iniciado_em' is not null or coalesce(p.status_operacional,'')<>'' then raise exception 'A Expedição assumiu o pedido. Solicite a liberação para a Triagem';end if;
  if p_acao='reabrir_triagem' and p.status not in ('separado','separado_com_divergencia') then raise exception 'A triagem não está concluída';end if;
 else raise exception 'Transferência inválida';end if;
 if p_acao in ('devolver_triagem','devolver_comercial') and length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Informe o motivo da devolução';end if;
 op:=coalesce(p.operacao,'{}');
 if p_acao='devolver_triagem' then
  op:=op-'carregamento';
  update separacoes_etiquetas set lida_carregamento_em=null where separacao_pedido_id=p.id;
  delete from operacao_patrimonios_lidos where pedido_id=p.id and etapa='carregamento';
 end if;
 op:=jsonb_set(op,'{transferencias}',coalesce(op->'transferencias','[]')||jsonb_build_array(jsonb_build_object('acao',p_acao,'motivo',left(p_motivo,1000),'em',now(),'usuario_id',auth.uid())));
 perform set_config('app.fluxo_transferencia','sim',true);
 update separacoes_pedidos set status=case when p_acao='devolver_comercial' then 'pendente' else 'em_separacao' end,
  reducao_liberada_em=case when p_acao='devolver_comercial' then now() end,reducao_liberada_por=case when p_acao='devolver_comercial' then auth.uid() end,
  finalizado_em=null,finalizado_por=null,operacao=op,revisao=revisao+1,atualizado_em=now() where id=p.id returning * into p;
 perform set_config('app.fluxo_transferencia','nao',true);
 return to_jsonb(p);
end $$;
revoke all on function operacao_transferir_pedido(uuid,text,text) from public,anon;
grant execute on function operacao_transferir_pedido(uuid,text,text) to authenticated;

create or replace function pedido_liberar_reducao(p_pedido uuid,p_liberar boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform operacao_transferir_pedido(p_pedido,case when p_liberar then 'devolver_comercial' else 'retomar_triagem' end,case when p_liberar then 'Revisão do pedido pelo Comercial' else 'Devolução cancelada pela Triagem' end);
end $$;

create function operacao_iniciar_conferencia(p_pedido uuid,p_etapa text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p separacoes_pedidos;registro jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para conferir';end if;
 if p_etapa not in ('carregamento','descarregamento','retorno') then raise exception 'Etapa inválida';end if;
 if p.operacao->p_etapa->>'concluido_em' is not null then return to_jsonb(p);end if;
 perform operacao_validar_etapa(p,p_etapa);
 if p.operacao->p_etapa->>'iniciado_em' is null then
  registro:=coalesce(p.operacao->p_etapa,'{}')||jsonb_build_object('iniciado_em',now(),'iniciado_por',auth.uid());
  update separacoes_pedidos set operacao=jsonb_set(coalesce(operacao,'{}'),array[p_etapa],registro),revisao=revisao+1,atualizado_em=now() where id=p.id returning * into p;
 end if;
 return to_jsonb(p);
end $$;
revoke all on function operacao_iniciar_conferencia(uuid,text) from public,anon;
grant execute on function operacao_iniciar_conferencia(uuid,text) to authenticated;

-- Leituras antigas também significam que a Expedição já assumiu o pedido.
update separacoes_pedidos p set operacao=jsonb_set(coalesce(p.operacao,'{}'),'{carregamento}',coalesce(p.operacao->'carregamento','{}')||jsonb_build_object('iniciado_em',e.inicio))
from (select separacao_pedido_id,min(lida_carregamento_em) inicio from separacoes_etiquetas where lida_carregamento_em is not null group by separacao_pedido_id) e
where p.id=e.separacao_pedido_id and p.operacao->'carregamento'->>'iniciado_em' is null;
update separacoes_pedidos p set operacao=jsonb_set(coalesce(p.operacao,'{}'),'{descarregamento}',coalesce(p.operacao->'descarregamento','{}')||jsonb_build_object('iniciado_em',e.inicio))
from (select separacao_pedido_id,min(lida_descarregamento_em) inicio from separacoes_etiquetas where lida_descarregamento_em is not null group by separacao_pedido_id) e
where p.id=e.separacao_pedido_id and p.operacao->'descarregamento'->>'iniciado_em' is null;
update separacoes_pedidos p set operacao=jsonb_set(coalesce(p.operacao,'{}'),'{retorno}',coalesce(p.operacao->'retorno','{}')||jsonb_build_object('iniciado_em',e.inicio))
from (select separacao_pedido_id,min(lida_retorno_em) inicio from separacoes_etiquetas where lida_retorno_em is not null group by separacao_pedido_id) e
where p.id=e.separacao_pedido_id and p.operacao->'retorno'->>'iniciado_em' is null;
notify pgrst,'reload schema';
commit;
