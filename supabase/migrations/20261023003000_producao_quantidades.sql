alter table public.producao_etapas add column if not exists quantidade_feita numeric not null default 0 check (quantidade_feita>=0);

create or replace function public.producao_quantidade_salvar(p_empresa uuid,p_etapa uuid,p_quantidade numeric) returns void
language plpgsql security definer set search_path=public as $$
declare e producao_etapas; t producao_itens; p separacoes_pedidos;
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
 if e.estado not in ('execucao','pausada') then raise exception 'Inicie a etapa antes de registrar a quantidade feita';end if;
 if p_quantidade is null or p_quantidade::text in ('NaN','Infinity','-Infinity') or p_quantidade<0
  or p_quantidade<>trunc(p_quantidade) or p_quantidade>(t.origem->>'quantidade')::numeric then
  raise exception 'Informe uma quantidade inteira entre zero e a quantidade solicitada';end if;
 update producao_etapas set quantidade_feita=p_quantidade where id=e.id;
 insert into producao_historico(empresa_id,pedido_id,etapa_id,acao,usuario_id,detalhes)
 values(p_empresa,t.pedido_id,e.id,'quantidade',auth.uid(),jsonb_build_object('anterior',e.quantidade_feita,'quantidade',p_quantidade));
end $$;
revoke all on function public.producao_quantidade_salvar(uuid,uuid,numeric) from public;
grant execute on function public.producao_quantidade_salvar(uuid,uuid,numeric) to authenticated;
notify pgrst,'reload schema';
