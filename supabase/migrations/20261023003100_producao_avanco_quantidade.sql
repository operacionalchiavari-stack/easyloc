-- Apontamento pela quantidade, sem botões de início e conclusão.
create or replace function public.producao_quantidade_salvar(p_empresa uuid,p_etapa uuid,p_quantidade numeric) returns void
language plpgsql security definer set search_path=public as $$
declare e producao_etapas; t producao_itens; p separacoes_pedidos; solicitada numeric;
begin
 if not eh_membro_empresa(p_empresa) or not producao_permite(p_empresa,'executar') then
  raise exception 'Sem permissão para registrar produção' using errcode='42501';
 end if;
 select i.* into t from producao_itens i join producao_etapas x on x.producao_item_id=i.id
 where x.id=p_etapa and i.empresa_id=p_empresa for update of i;
 if not found then raise exception 'Etapa não encontrada';end if;
 select * into e from producao_etapas where id=p_etapa for update;
 select * into p from separacoes_pedidos where id=t.pedido_id;
 if t.cancelado or t.revisao or p.status_comercial not in ('aprovado','enviado','finalizado') then
  raise exception 'Pedido bloqueado ou aguardando confirmação comercial';end if;
 solicitada:=(t.origem->>'quantidade')::numeric;
 if p_quantidade is null or p_quantidade::text in ('NaN','Infinity','-Infinity') or p_quantidade<0
  or p_quantidade<>trunc(p_quantidade) or p_quantidade>solicitada then
  raise exception 'Informe uma quantidade inteira entre zero e a quantidade solicitada';end if;
 if e.estado not in ('pendente','execucao','pausada') then raise exception 'Esta etapa não permite alterar a quantidade';end if;
 -- Reutiliza todas as validações de prazo, material e etapas anteriores.
 if e.estado in ('pendente','pausada') and p_quantidade>0 then
  perform producao_acao(p_empresa,p_etapa,case when e.estado='pausada' then 'retomar' else 'iniciar' end);
 end if;
 update producao_etapas set quantidade_feita=p_quantidade where id=e.id;
 insert into producao_historico(empresa_id,pedido_id,etapa_id,acao,usuario_id,detalhes)
 values(p_empresa,t.pedido_id,e.id,'quantidade',auth.uid(),jsonb_build_object('anterior',e.quantidade_feita,'quantidade',p_quantidade));
 if p_quantidade=solicitada and solicitada>0 then
  perform producao_acao(p_empresa,p_etapa,'concluir');
 end if;
end $$;
notify pgrst,'reload schema';
