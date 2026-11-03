create function public.expedicao_pode_reabrir(p public.separacoes_pedidos) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and seguranca_2fa_ok() and eh_membro_empresa(p.empresa_id)
 and funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar')
 and p.status in ('separado','separado_com_divergencia')
 and p.status_comercial in ('aprovado','enviado','finalizado')
 and p.encerrado_operacional_em is null
 and coalesce(p.status_operacional,'') in ('','carregado')
 and p.operacao->'carregamento'->>'concluido_em' is not null
 and p.operacao->'entrega'->>'iniciado_em' is null and p.operacao->'entrega'->>'concluido_em' is null
 and p.operacao->'coleta'->>'concluido_em' is null
 and p.operacao->'retorno'->>'iniciado_em' is null and p.operacao->'retorno'->>'concluido_em' is null
 and p.operacao->'descarregamento'->>'iniciado_em' is null and p.operacao->'descarregamento'->>'concluido_em' is null
 and not exists(select 1 from logistica_confirmacoes where pedido_id=p.id and etapa in ('entrega','coleta'))
 and not exists(select 1 from operacao_etapas e join operacao_apontamentos a on a.etapa_id=e.id and a.empresa_id=e.empresa_id
  where e.pedido_id=p.id and e.tipo='montagem' and a.inicio is not null)
 and not exists(select 1 from operacao_etapas e join free_vagas v on v.etapa_id=e.id and v.empresa_id=e.empresa_id
  join free_inscricoes i on i.vaga_id=v.id and i.empresa_id=v.empresa_id
  where e.pedido_id=p.id and e.tipo='montagem' and v.status<>'CANCELADA' and i.status='CONFIRMADO' and i.checkin_em is not null)
$$;
revoke all on function public.expedicao_pode_reabrir(public.separacoes_pedidos) from public,anon,authenticated;

create function public.expedicao_reaberturas_disponiveis(p_pedidos uuid[]) returns uuid[]
language sql stable security definer set search_path=public as $$
 select coalesce(array_agg(p.id),'{}'::uuid[]) from separacoes_pedidos p where p.id=any(p_pedidos) and expedicao_pode_reabrir(p)
$$;

create function public.expedicao_reabrir_conferencia(p_pedido uuid) returns void
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;op jsonb;anterior text;
begin
 select * into p from separacoes_pedidos where id=p_pedido for update;
 if not found or not seguranca_2fa_ok() or not eh_membro_empresa(p.empresa_id) or auth.uid() is null
  or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para reabrir a conferência';end if;
 if not expedicao_pode_reabrir(p) then raise exception 'Não é possível reabrir: a entrega já iniciou, a operação avançou ou o carregamento não está concluído.';end if;
 op:=jsonb_set(p.operacao,'{transferencias}',coalesce(p.operacao->'transferencias','[]')||jsonb_build_array(
  jsonb_build_object('acao','reabrir_conferencia','em',now(),'usuario_id',auth.uid(),'conferencia_anterior',p.operacao->'carregamento')));
 op:=jsonb_set(op,'{carregamento}',((p.operacao->'carregamento')-array['concluido_em','por','por_id'])||jsonb_build_object('iniciado_em',coalesce(p.operacao->'carregamento'->>'iniciado_em',now()::text)));
 anterior:=current_setting('app.fluxo_transferencia',true);
 perform set_config('app.fluxo_transferencia','sim',true);
 update separacoes_pedidos set status_operacional=null,operacao=op,revisao=revisao+1,atualizado_em=now() where id=p.id;
 perform set_config('app.fluxo_transferencia',coalesce(anterior,''),true);
end $$;
revoke all on function public.expedicao_reaberturas_disponiveis(uuid[]),public.expedicao_reabrir_conferencia(uuid) from public,anon;
grant execute on function public.expedicao_reaberturas_disponiveis(uuid[]),public.expedicao_reabrir_conferencia(uuid) to authenticated;
notify pgrst,'reload schema';
