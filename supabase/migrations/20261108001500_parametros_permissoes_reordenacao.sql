begin;
-- Políticas usam a verificação da própria sessão; funcionario_pode permanece privada.
drop policy motivos_criar on public.logistica_motivos;
drop policy motivos_editar on public.logistica_motivos;
create policy motivos_criar on public.logistica_motivos for insert to authenticated with check(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar'));
create policy motivos_editar on public.logistica_motivos for update to authenticated using(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar')) with check(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar'));
drop policy fin_posicao_motivos_criar on public.fin_posicao_motivos;
drop policy fin_posicao_motivos_editar on public.fin_posicao_motivos;
create policy fin_posicao_motivos_criar on public.fin_posicao_motivos for insert to authenticated with check(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar'));
create policy fin_posicao_motivos_editar on public.fin_posicao_motivos for update to authenticated using(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar')) with check(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar'));
drop policy backup_ler on public.sistema_backups;
drop policy sistema_erros_ler on public.sistema_erros_operacionais;
create policy backup_ler on public.sistema_backups for select to authenticated using(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar'));
create policy sistema_erros_ler on public.sistema_erros_operacionais for select to authenticated using(eh_membro_empresa(empresa_id) and seguranca_2fa_ok() and operacao_pode(empresa_id,'configuracoes.empresa.editar'));
create function public.comercial_condicoes_reordenar(p_empresa uuid,p_ids uuid[]) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa,'configuracoes.empresa.editar') then raise exception 'Sem permissão para ordenar condições';end if;
 perform 1 from empresas where id=p_empresa for update;
 if coalesce(cardinality(p_ids),0)=0 or cardinality(p_ids)>1000 or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids) then raise exception 'Lista de condições inválida';end if;
 perform 1 from comercial_condicoes_pagamento where empresa_id=p_empresa for update;
 if (select count(*) from comercial_condicoes_pagamento where empresa_id=p_empresa)<>cardinality(p_ids) or (select count(*) from comercial_condicoes_pagamento where empresa_id=p_empresa and id=any(p_ids))<>cardinality(p_ids) then raise exception 'A lista mudou. Atualize as condições antes de ordenar.';end if;
 update comercial_condicoes_pagamento c set ordem=v.pos from unnest(p_ids) with ordinality v(id,pos) where c.empresa_id=p_empresa and c.id=v.id;
end $$;
revoke all on function public.comercial_condicoes_reordenar(uuid,uuid[]) from public,anon;
grant execute on function public.comercial_condicoes_reordenar(uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
