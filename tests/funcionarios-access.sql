-- Executar dentro de uma transação e sempre terminar com ROLLBACK.
do $$
declare empresa uuid; ator uuid; funcionario uuid:=gen_random_uuid(); outra uuid:=gen_random_uuid(); resultado jsonb;
begin
 select empresa_id,user_id into empresa,ator from public.usuarios_empresas where lower(role)='admin' limit 1;
 if ator is null then raise exception 'Fixture requer administrador existente'; end if;
 insert into auth.users(id,email) values(funcionario,'funcionario-test-'||funcionario||'@example.invalid');
 perform public.funcionario_salvar(empresa,ator,funcionario,jsonb_build_object(
  'nome','Teste transacional','setor','Comercial','cargo','Teste','login','test-'||funcionario,
  'email','funcionario-test-'||funcionario||'@example.invalid','nivel_acesso','Visualizador','ativo',true,
  'telefone','','foto_url',''),'["comercial.catalogo.visualizar"]','1234');
 if not public.funcionario_pode(empresa,funcionario,'comercial.catalogo.visualizar') then raise exception 'Catálogo autorizado foi negado'; end if;
 if public.funcionario_pode(empresa,funcionario,'configuracoes.permissoes.editar') then raise exception 'Funcionário ganhou administração'; end if;
 if public.funcionario_pode(outra,funcionario,'comercial.catalogo.visualizar') then raise exception 'Acesso cruzado entre empresas'; end if;
 if exists(select 1 from public.funcionarios_acesso where id=funcionario and (pin_hash='1234' or pin_hash is null)) then raise exception 'PIN sem hash'; end if;
 perform set_config('request.jwt.claim.sub',funcionario::text,true);
 resultado:=public.funcionario_contexto(empresa);
 if not (resultado->>'ativo')::boolean or (resultado->>'administrador_legado')::boolean then raise exception 'Contexto incorreto'; end if;
 if public.funcionario_tabela_permitida(empresa,'clientes_empresas','visualizar') then raise exception 'Clientes não bloqueados'; end if;
 begin
  perform public.funcionarios_listar(empresa);
  raise exception 'Funcionário sem acesso leu o cadastro';
 exception when others then
  if sqlerrm='Funcionário sem acesso leu o cadastro' then raise; end if;
 end;
 update public.permissoes_usuario set permitido=false where empresa_id=empresa and usuario_id=funcionario;
 if exists(select 1 from public.get_permissoes_usuario_resolvidas(empresa,funcionario) where permitido) then raise exception 'Negação de todas as permissões falhou'; end if;
 update public.funcionarios_acesso set ativo=false where id=funcionario;
 if public.funcionario_tabela_permitida(empresa,'assinaturas','visualizar') then raise exception 'Conta inativa acessou dados'; end if;
 if (public.funcionario_contexto(empresa)->>'ativo')::boolean then raise exception 'Conta inativa liberada'; end if;
 perform set_config('request.jwt.claim.sub',ator::text,true);
 if not public.funcionario_pode(empresa,ator,'rh.funcionarios.editar') then raise exception 'Admin existente bloqueado'; end if;
 if jsonb_array_length(public.funcionarios_listar(empresa))<1 then raise exception 'Lista vazia'; end if;
 raise notice 'PASS: criação, hash PIN, catálogo, isolamento, acesso negado, todas falsas, inativação e administrador legado';
end $$;
