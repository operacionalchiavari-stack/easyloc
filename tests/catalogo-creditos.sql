-- Executar dentro de transação com rollback: não altera saldos reais.
do $$
declare a catalogo_acessos; ator uuid; op uuid:=gen_random_uuid(); recarga uuid:=gen_random_uuid(); token text:=gen_random_uuid()::text; saldo_antes integer;
begin
 select * into a from catalogo_acessos where ativo limit 1;
 if a.id is null then raise exception 'Acesso de teste ausente'; end if;
 select user_id into ator from usuarios_empresas where empresa_id=a.empresa_id and lower(role)='admin' and not exists(select 1 from funcionarios_acesso f where f.id=user_id) limit 1;
 perform set_config('request.jwt.claim.sub',ator::text,true);
 perform creditos_definir_custos(a.empresa_id,'{"tecido":1,"render":2,"planta":3,"layout":4}');
 select coalesce((select saldo from catalogo_creditos_carteiras where empresa_id=a.empresa_id and cliente_id=a.cliente_id),0) into saldo_antes;
 perform creditos_adicionar(a.empresa_id,a.cliente_id,10,'Teste transacional',recarga);
 perform creditos_adicionar(a.empresa_id,a.cliente_id,10,'Teste transacional',recarga);
 if not exists(select 1 from jsonb_array_elements(creditos_painel(a.empresa_id)->'clientes') cliente where cliente->>'id'=a.cliente_id::text and (cliente->>'saldo')::integer=saldo_antes+10) then raise exception 'Cliente ou saldo ausente no painel administrativo'; end if;
 if (select saldo from catalogo_creditos_carteiras where empresa_id=a.empresa_id and cliente_id=a.cliente_id)<>saldo_antes+10 then raise exception 'Recarga duplicada'; end if;
 perform creditos_reservar(a.empresa_id,a.cliente_id,'render',op,2);
 perform creditos_finalizar(op,false);perform creditos_finalizar(op,false);
 if (select saldo from catalogo_creditos_carteiras where empresa_id=a.empresa_id and cliente_id=a.cliente_id)<>saldo_antes+10 then raise exception 'Estorno incorreto'; end if;
 op:=gen_random_uuid();perform creditos_reservar(a.empresa_id,a.cliente_id,'render',op,2);perform creditos_finalizar(op,true);perform creditos_finalizar(op,false);
 if (select saldo from catalogo_creditos_carteiras where empresa_id=a.empresa_id and cliente_id=a.cliente_id)<>saldo_antes+8 then raise exception 'Cobranca incorreta'; end if;
 begin perform creditos_reservar(a.empresa_id,a.cliente_id,'render',gen_random_uuid(),1);raise exception 'Custo antigo aceito';exception when others then if sqlerrm='Custo antigo aceito' then raise;end if;end;
 update catalogo_creditos_carteiras set saldo=0 where empresa_id=a.empresa_id and cliente_id=a.cliente_id;
 begin perform creditos_reservar(a.empresa_id,a.cliente_id,'render',gen_random_uuid(),2);raise exception 'Saldo negativo permitido';exception when others then if sqlerrm='Saldo negativo permitido' then raise;end if;end;
 insert into catalogo_sessoes(acesso_id,token_hash,expires_at) values(a.id,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '5 minutes');
 if (catalogo_creditos_saldo(token)->>'saldo')::integer<>0 then raise exception 'Saldo publico incorreto';end if;
 if has_function_privilege('anon','public.creditos_reservar(uuid,uuid,text,uuid,integer)','execute') or has_function_privilege('authenticated','public.creditos_finalizar(uuid,boolean)','execute') then raise exception 'Cobranca exposta'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform creditos_adicionar(a.empresa_id,a.cliente_id,10,'',gen_random_uuid());raise exception 'Recarga anonima permitida';exception when others then if sqlerrm='Recarga anonima permitida' then raise;end if;end;
end $$;
