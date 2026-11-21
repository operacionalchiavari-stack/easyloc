-- (2026-11-14) Nota fiscal do fechamento de parceiro: o Financeiro guarda o arquivo no bucket privado compras-documentos,
-- na pasta <empresa>/financeiro/… (abre por link assinado). Quem vê o Financeiro lê; quem edita contas a pagar envia.
drop policy if exists fin_documentos_ler on storage.objects;
create policy fin_documentos_ler on storage.objects for select to authenticated
  using (bucket_id = 'compras-documentos' and (storage.foldername(name))[2] = 'financeiro'
         and public.eh_membro_empresa(((storage.foldername(name))[1])::uuid) and public.fin_pode(((storage.foldername(name))[1])::uuid, 'financeiro.fluxo.visualizar'));
drop policy if exists fin_documentos_inserir on storage.objects;
create policy fin_documentos_inserir on storage.objects for insert to authenticated
  with check (bucket_id = 'compras-documentos' and (storage.foldername(name))[2] = 'financeiro'
         and public.eh_membro_empresa(((storage.foldername(name))[1])::uuid) and public.fin_pode(((storage.foldername(name))[1])::uuid, 'financeiro.contas_pagar.editar'));
