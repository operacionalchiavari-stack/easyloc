begin;
-- Resolve o autor pelo cadastro da mesma empresa, inclusive O.S antigas gravadas com e-mail.
do $patch$
declare f text;
begin
 f:=pg_get_functiondef('public.acervo_ordens(uuid)'::regprocedure);
 if position('''solicitante'',o.solicitante_nome' in f)=0 or position('from acervo_os o join itens i' in f)=0 then
  raise exception 'Consulta de ordens alterada; revise a identificação do solicitante';
 end if;
 f:=replace(f,'''solicitante'',o.solicitante_nome',
  '''solicitante'',coalesce(nullif(btrim(solicitante_pessoa.nome),''''),case when position(''@'' in o.solicitante_nome)=0 then nullif(btrim(o.solicitante_nome),'''') end,''Colaborador não identificado''),''solicitante_foto'',coalesce(solicitante_pessoa.foto_url,''''),''solicitante_id'',solicitante_pessoa.id');
 f:=replace(f,'from acervo_os o join itens i',
  'from acervo_os o left join lateral (
   select f.id,f.nome,f.foto_url from funcionarios_acesso f
   where f.empresa_id=o.empresa_id and (
    f.id::text=o.criado_por::text or to_jsonb(f)->>''usuario_id''=o.criado_por::text or to_jsonb(f)->>''user_id''=o.criado_por::text
    or lower(btrim(f.email))=lower(btrim(o.solicitante_nome)) or lower(btrim(f.nome))=lower(btrim(o.solicitante_nome)))
   order by case when f.id::text=o.criado_por::text or to_jsonb(f)->>''usuario_id''=o.criado_por::text or to_jsonb(f)->>''user_id''=o.criado_por::text then 0 when lower(btrim(f.email))=lower(btrim(o.solicitante_nome)) then 1 else 2 end,f.id
   limit 1
  ) solicitante_pessoa on true join itens i');
 execute f;
end $patch$;
notify pgrst,'reload schema';
commit;
