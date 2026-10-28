-- Escala so pode mudar no planejamento de pedidos reservados.
begin;
-- Atribuicao manual e preenchimento automatico seguem a mesma regra da fila.
alter function public.operacao_escala_salvar(uuid,text,text[],text[],boolean) rename to operacao_escala_salvar_sem_fluxo;
revoke all on function public.operacao_escala_salvar_sem_fluxo(uuid,text,text[],text[],boolean) from public,anon,authenticated,service_role;
create function public.operacao_escala_salvar(p_etapa uuid,p_responsavel text,p_equipe text[],p_caminhoes text[],p_forcar boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;
begin
 select ped.* into p from separacoes_pedidos ped join operacao_etapas e on e.pedido_id=ped.id where e.id=p_etapa for update of ped;
 if p.id is not null and pedido_fluxo_etapa(p) not in ('triagem','expedicao') then
  raise exception 'Montagem de equipe indisponivel. Pre-reserva e somente consulta; o pedido deve estar reservado e na etapa de planejamento.';
 end if;
 return operacao_escala_salvar_sem_fluxo(p_etapa,p_responsavel,p_equipe,p_caminhoes,p_forcar);
end $$;
revoke all on function public.operacao_escala_salvar(uuid,text,text[],text[],boolean) from public,anon;
grant execute on function public.operacao_escala_salvar(uuid,text,text[],text[],boolean) to authenticated;

alter function public.operacao_escala_preencher(uuid,uuid[]) rename to operacao_escala_preencher_sem_fluxo;
revoke all on function public.operacao_escala_preencher_sem_fluxo(uuid,uuid[]) from public,anon,authenticated,service_role;
create function public.operacao_escala_preencher(p_empresa uuid,p_etapas uuid[]) returns int
language plpgsql security definer set search_path=public as $$
begin
 return operacao_escala_preencher_sem_fluxo(p_empresa,array(
  select e.id from operacao_etapas e left join separacoes_pedidos p on p.id=e.pedido_id
  where e.empresa_id=p_empresa and e.id=any(p_etapas)
   and (e.pedido_id is null or pedido_fluxo_etapa(p) in ('triagem','expedicao'))
  order by e.id
  for update of e
 ));
end $$;
revoke all on function public.operacao_escala_preencher(uuid,uuid[]) from public,anon,authenticated,service_role;
commit;

