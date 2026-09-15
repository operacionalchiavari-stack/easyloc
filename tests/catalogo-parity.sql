-- Execução transacional: testa o mesmo acervo com sessão de decorador e de administrador.
do $$
declare acesso public.catalogo_acessos; ator uuid; token text:=gen_random_uuid()::text; interno jsonb; externo jsonb; esperado bigint;
begin
 select * into acesso from public.catalogo_acessos where ativo limit 1;
 if acesso.id is null then raise exception 'Fixture requer um acesso ativo de catálogo'; end if;
 select user_id into ator from public.usuarios_empresas where empresa_id=acesso.empresa_id and lower(role)='admin' limit 1;
 insert into public.catalogo_sessoes(acesso_id,token_hash,expires_at)
 values(acesso.id,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '5 minutes');
 externo:=public.catalogo_carregar(token);
 perform set_config('request.jwt.claim.sub',ator::text,true);
 interno:=public.catalogo_carregar_interno(acesso.empresa_id);
 if (select jsonb_agg(i-'itens_fotos') from jsonb_array_elements(interno->'itens') i) is distinct from
    (select jsonb_agg(i-'itens_fotos') from jsonb_array_elements(externo->'itens') i) then raise exception 'Acervo interno e externo diferentes'; end if;
 select count(*) into esperado from public.itens where empresa_id=acesso.empresa_id and ativo and exibir_no_site and tipo in ('Item','Kit');
 if jsonb_array_length(externo->'itens')<>esperado then raise exception 'Itens faltando'; end if;
 if exists(select 1 from jsonb_array_elements(externo->'itens') i where not(i ?& array['produto_base','tipo','familia','estilo','referencia','marca_modelo','itens_fotos','personalizable'])) then raise exception 'Projeção incompleta'; end if;
 if exists(select 1 from jsonb_array_elements(externo->'itens') i cross join lateral jsonb_array_elements(i->'itens_fotos') f where f->>'cliente_id' is not null and f->>'cliente_id'<>acesso.cliente_id::text) then raise exception 'Foto de outro cliente'; end if;
 if exists(select 1 from public.itens_fotos f join public.itens i on i.id=f.item_id
   where f.cliente_id=acesso.cliente_id and f.tipo='galeria' and i.ativo and i.exibir_no_site and i.tipo in ('Item','Kit') and nullif(f.url,'') is not null
   and not exists(select 1 from jsonb_array_elements(externo->'itens') item cross join lateral jsonb_array_elements(item->'itens_fotos') foto where item->>'id'=i.id::text and foto->>'url'=f.url)) then raise exception 'Foto do decorador ausente'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.catalogo_carregar_interno(acesso.empresa_id);
  raise exception 'Acesso interno anônimo permitido';
 exception when others then if sqlerrm='Acesso interno anônimo permitido' then raise; end if; end;
 begin
  perform public.catalogo_carregar('token-invalido');
  raise exception 'Token inválido permitido';
 exception when others then if sqlerrm='Token inválido permitido' then raise; end if; end;
end $$;
