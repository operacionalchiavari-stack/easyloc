-- Arquivos enviados à Helena (planta em PDF ou foto): o bucket passa a aceitar PDF e arquivos de até 20 MB.
update storage.buckets
   set file_size_limit = 20971520,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/json', 'application/pdf']
 where id = 'catalogo-assistente';
