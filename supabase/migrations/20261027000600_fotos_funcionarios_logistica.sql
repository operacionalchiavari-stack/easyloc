create or replace function public.logistica_foto_funcionario_acesso(p_nome text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists (
 select 1 from public.funcionarios_acesso f
 where f.foto_url=p_nome and f.ativo and f.equipe_operacional is not null
 and public.eh_membro_empresa(f.empresa_id)
 and (public.funcionario_pode(f.empresa_id,auth.uid(),'logistica.planejamento.visualizar')
 or public.funcionario_pode(f.empresa_id,auth.uid(),'logistica.cronograma.visualizar')
 or public.funcionario_pode(f.empresa_id,auth.uid(),'logistica.expedicao.visualizar'))
 );
$$;
revoke all on function public.logistica_foto_funcionario_acesso(text) from public;
grant execute on function public.logistica_foto_funcionario_acesso(text) to authenticated;
create policy funcionarios_fotos_logistica on storage.objects for select to authenticated
using(bucket_id='funcionarios-fotos' and public.logistica_foto_funcionario_acesso(name));
