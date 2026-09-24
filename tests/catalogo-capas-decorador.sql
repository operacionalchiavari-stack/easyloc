-- Integração no banco vinculado; todas as alterações são desfeitas.
begin;
do $$
declare
  k public.catalogo_acessos%rowtype;
  f public.catalogo_acessos%rowtype;
  tk text := gen_random_uuid()::text;
  tf text := gen_random_uuid()::text;
  original_k jsonb;
  original_f jsonb;
begin
  select a.* into strict k from public.catalogo_acessos a
    join public.clientes_empresas c on c.id=a.cliente_id
    where lower(trim(c.nome_razao))='kelly khawam' and a.ativo;
  select a.* into strict f from public.catalogo_acessos a
    join public.clientes_empresas c on c.id=a.cliente_id
    where lower(trim(c.nome_razao))='fabiane gabrich' and a.ativo and a.empresa_id=k.empresa_id;
  insert into public.catalogo_sessoes(acesso_id,token_hash,expires_at) values
    (k.id,encode(extensions.digest(tk,'sha256'),'hex'),now()+interval '5 minutes'),
    (f.id,encode(extensions.digest(tf,'sha256'),'hex'),now()+interval '5 minutes');
  original_k := public.catalogo_capas_carregar(tk);
  original_f := public.catalogo_capas_carregar(tf);
  if original_k->>'portal' is null then raise exception 'Kelly perdeu a capa atual'; end if;
  if original_f->>'portal'=original_k->>'portal' then raise exception 'Capa da Kelly vazou para Fabi'; end if;

  insert into public.catalogo_capas(empresa_id,cliente_id,chave,path,url)
    values(f.empresa_id,f.cliente_id,'portal','teste/fabi','https://fixture/fabi.jpg')
    on conflict(empresa_id,cliente_id,chave) do update set url=excluded.url;
  if public.catalogo_capas_carregar(tf)->>'portal' <> 'https://fixture/fabi.jpg' then
    raise exception 'Fabi não recebeu sua capa';
  end if;
  if public.catalogo_capas_carregar(tk) <> original_k then raise exception 'Editar Fabi alterou Kelly'; end if;

  update public.catalogo_capas set url='https://fixture/kelly.jpg'
    where empresa_id=k.empresa_id and cliente_id=k.cliente_id and chave='portal';
  if public.catalogo_capas_carregar(tk)->>'portal' <> 'https://fixture/kelly.jpg' then
    raise exception 'Kelly não recebeu sua nova capa';
  end if;
  if public.catalogo_capas_carregar(tf)->>'portal' <> 'https://fixture/fabi.jpg' then
    raise exception 'Editar Kelly alterou Fabi';
  end if;
  begin
    perform public.catalogo_capas_carregar('token-invalido');
    raise exception 'Token inválido foi aceito';
  exception when raise_exception then
    if sqlerrm <> 'Sessão do catálogo expirada' then raise; end if;
  end;
end $$;
rollback;
select 'PASS: capas isoladas por login, atualização independente e token inválido rejeitado' as resultado;
