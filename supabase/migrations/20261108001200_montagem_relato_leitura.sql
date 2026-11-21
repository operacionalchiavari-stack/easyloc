begin;
create function public.mont_relato_pode_ler(p_empresa uuid,p_etapa uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and seguranca_2fa_ok() and eh_membro_empresa(p_empresa) and exists(
  select 1 from operacao_etapas m where m.id=p_etapa and m.empresa_id=p_empresa and
  (funcionario_tabela_permitida(p_empresa,'separacoes_pedidos','select') or exists(
   select 1 from operacao_etapas e join operacao_etapa_pessoas p on p.etapa_id=e.id
   where e.empresa_id=p_empresa and e.pedido_id=m.pedido_id and e.tipo in ('montagem','desmontagem')
   and p.funcionario_id=auth.uid() and p.papel='responsavel'
  ))
 )
$$;
revoke all on function public.mont_relato_pode_ler(uuid,uuid) from public,anon;
grant execute on function public.mont_relato_pode_ler(uuid,uuid) to authenticated;
drop policy montagem_relatos_ler on public.montagem_relatos_ia;
create policy montagem_relatos_ler on public.montagem_relatos_ia for select to authenticated using(mont_relato_pode_ler(empresa_id,etapa_id));
drop policy montagem_relato_foto_ler on storage.objects;
create policy montagem_relato_foto_ler on storage.objects for select to authenticated using(bucket_id='montagem-relatos' and seguranca_2fa_ok() and eh_membro_empresa(((storage.foldername(name))[1])::uuid) and ((storage.foldername(name))[2]=auth.uid()::text or exists(select 1 from montagem_relatos_ia r where r.fotos ? name)));
notify pgrst,'reload schema';
commit;
