-- Solicitações com especialista (nov/2026): fotos de evidência enviadas na conversa (bota gasta, vazamento, peça quebrada).
-- Bucket público (a IA precisa abrir a foto pelo link; nomes são uuid) em <empresa>/<usuario>/<uuid>.jpg; só quem é da
-- empresa envia, e só na própria pasta. As fotos ficam ligadas à solicitação depois de registrada.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('solicitacoes-evidencias','solicitacoes-evidencias',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

drop policy if exists solicitacoes_evidencias_enviar on storage.objects;
create policy solicitacoes_evidencias_enviar on storage.objects for insert to authenticated
with check(bucket_id='solicitacoes-evidencias'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.eh_membro_empresa(((storage.foldername(name))[1])::uuid)
  and (storage.foldername(name))[2] = auth.uid()::text);

alter table public.manutencao_predial_solicitacoes add column if not exists evidencias jsonb not null default '[]'::jsonb;

-- Liga as fotos à solicitação recém-criada (só quem criou). p_tipo: 'compra' | 'manutencao'.
create or replace function public.solicitacao_evidencias_salvar(p_empresa uuid, p_tipo text, p_id uuid, p_fotos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare fotos jsonb;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso à empresa' using errcode='42501'; end if;
  select coalesce(jsonb_agg(f), '[]'::jsonb) into fotos
    from jsonb_array_elements_text(coalesce(p_fotos, '[]'::jsonb)) f
   where f ~ ('/storage/v1/object/public/solicitacoes-evidencias/' || p_empresa::text || '/');
  if jsonb_array_length(fotos) > 12 then raise exception 'Fotos demais'; end if;
  if p_tipo = 'compra' then
    update compras_registros set dados = dados || jsonb_build_object('evidencias', fotos)
     where id = p_id and empresa_id = p_empresa and tipo = 'necessidade' and criado_por = auth.uid();
  elsif p_tipo = 'manutencao' then
    update manutencao_predial_solicitacoes set evidencias = fotos
     where id = p_id and empresa_id = p_empresa and criado_por = auth.uid();
  else raise exception 'Tipo inválido'; end if;
  if not found then raise exception 'Solicitação não encontrada'; end if;
end $$;
revoke all on function public.solicitacao_evidencias_salvar(uuid,text,uuid,jsonb) from public, anon;
grant execute on function public.solicitacao_evidencias_salvar(uuid,text,uuid,jsonb) to authenticated;
