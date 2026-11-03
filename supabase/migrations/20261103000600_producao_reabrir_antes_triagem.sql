create or replace function public.producao_reabrir(p_empresa uuid,p_pedido uuid) returns void
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos; etapa_anterior record;
begin
 if not eh_membro_empresa(p_empresa) or not producao_permite(p_empresa,'executar') then
  raise exception 'Sem permissão para reabrir produção' using errcode='42501';
 end if;
 select * into p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa for update;
 if not found then raise exception 'Pedido não encontrado'; end if;
 if p.status in ('separado','separado_com_divergencia') or coalesce(p.status_operacional,'')<>'' then
  raise exception 'A triagem já finalizou este pedido. Não é possível reabrir a produção.';
 end if;
 perform 1 from producao_itens where pedido_id=p.id and empresa_id=p_empresa order by id for update;
 perform 1 from producao_etapas where producao_item_id in(select id from producao_itens where pedido_id=p.id and not cancelado) order by id for update;
 if not exists(select 1 from producao_etapas e join producao_itens t on t.id=e.producao_item_id
   where t.pedido_id=p.id and not t.cancelado and e.estado='concluida') or
  exists(select 1 from producao_etapas e join producao_itens t on t.id=e.producao_item_id
   where t.pedido_id=p.id and not t.cancelado and (t.revisao or e.estado not in ('concluida','cancelada'))) then
  raise exception 'A produção precisa estar concluída e sem revisão pendente para ser reaberta.';
 end if;
 for etapa_anterior in select e.* from producao_etapas e join producao_itens t on t.id=e.producao_item_id
  where t.pedido_id=p.id and not t.cancelado and e.estado='concluida'
 loop
  insert into producao_historico(empresa_id,pedido_id,etapa_id,acao,usuario_id,detalhes)
   values(p_empresa,p.id,etapa_anterior.id,'reabrir',auth.uid(),jsonb_build_object('anterior',etapa_anterior.estado,'quantidade_anterior',etapa_anterior.quantidade_feita));
  update producao_etapas set estado='pendente',quantidade_feita=0,iniciada_em=null,concluida_em=null,responsavel=null where id=etapa_anterior.id;
 end loop;
 -- As peças precisarão ser recebidas novamente pela triagem após o retrabalho.
 delete from separacao_producao_confirmacoes c where c.pedido_id=p.id and c.empresa_id=p_empresa
  and c.item_id::text in(select t.origem->>'item_id' from producao_itens t where t.pedido_id=p.id and not t.cancelado);
end $$;
revoke all on function public.producao_reabrir(uuid,uuid) from public,anon;
grant execute on function public.producao_reabrir(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
