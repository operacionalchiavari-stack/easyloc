-- Executar em uma transação com ROLLBACK (nenhuma alteração permanente).
do $$
declare empresa uuid:='bb1260f0-99cd-4d17-ab9b-23c299b4c50b'; ator uuid; t uuid; m uuid; r jsonb; n integer;
begin
 select user_id into ator from usuarios_empresas where empresa_id=empresa and lower(role) in ('admin','owner','administrador') limit 1;
 if ator is null then raise exception 'Fixture requer administrador'; end if;
 t:=rh_funcionario_salvar(empresa,ator,null,jsonb_build_object('nome','Teste ciência triagem','setor','Triagem','equipe_operacional','triagem','ativo',true),'0123');
 m:=rh_funcionario_salvar(empresa,ator,null,jsonb_build_object('nome','Teste ciência montagem','setor','Montagem','equipe_operacional','montagem','ativo',true),'4567');
 if exists(select 1 from usuarios_empresas where user_id in(t,m)) then raise exception 'Cadastro sem acesso ganhou login'; end if;
 if not rh_pin_conferir(empresa,t,'0123') then raise exception 'PIN com zero inicial não funciona'; end if;
 if rh_pin_conferir(empresa,t,null) then raise exception 'PIN nulo foi aceito'; end if;
 if rh_pin_conferir(gen_random_uuid(),t,'0123') then raise exception 'PIN de outra empresa foi aceito'; end if;
 r:=rh_dano_ciencia_salvar(empresa,ator,jsonb_build_object('id','TEST-CIENCIA','equipe','montagem','assinatura','v1','acao','sincronizar'));
 if not (r->>'ok')::boolean then raise exception 'Não registrou pendência'; end if;
 r:=rh_dano_ciencia_salvar(empresa,ator,jsonb_build_object('id','TEST-CIENCIA','equipe','montagem','assinatura','v1','acao','confirmar','funcionario_id',t,'pin','0123'));
 if (r->>'ok')::boolean then raise exception 'Outra equipe confirmou o dano'; end if;
 r:=rh_dano_ciencia_salvar(empresa,ator,jsonb_build_object('id','TEST-CIENCIA','equipe','montagem','assinatura','v1','acao','confirmar','funcionario_id',m,'pin','9999'));
 if (r->>'ok')::boolean then raise exception 'PIN incorreto foi aceito'; end if;
 r:=rh_dano_ciencia_salvar(empresa,ator,jsonb_build_object('id','TEST-CIENCIA','equipe','montagem','assinatura','v1','acao','confirmar','funcionario_id',m,'pin','4567'));
 if not (r->>'ok')::boolean then raise exception 'Equipe correta não confirmou'; end if;
 if not exists(select 1 from itens_danos_ciencia where dano_id='TEST-CIENCIA' and confirmado_por=m and confirmado_em is not null and status='confirmado') then raise exception 'Faltou auditoria da confirmação'; end if;
 r:=rh_dano_ciencia_salvar(empresa,ator,jsonb_build_object('id','TEST-CIENCIA','equipe','montagem','assinatura','v1','acao','confirmar','funcionario_id',m,'pin','4567'));
 if (r->>'ok')::boolean then raise exception 'Confirmou duas vezes'; end if;
 perform rh_dano_ciencia_salvar(empresa,ator,jsonb_build_object('id','TEST-CIENCIA','equipe','montagem','assinatura','v2','acao','sincronizar'));
 if not exists(select 1 from itens_danos_ciencia where dano_id='TEST-CIENCIA' and status='pendente' and confirmado_por is null) then raise exception 'Dano alterado manteve ciência'; end if;
 r:=rh_dano_ciencia_salvar(empresa,ator,jsonb_build_object('id','TEST-CIENCIA','equipe','montagem','assinatura','v2','acao','contestar','funcionario_id',m,'pin','4567','justificativa','Não ocorreu na montagem'));
 if not (r->>'ok')::boolean then raise exception 'Não registrou contestação'; end if;
 r:=rh_dano_ciencia_salvar(empresa,ator,jsonb_build_object('id','TEST-CIENCIA','equipe','montagem','assinatura','v2','acao','reabrir','justificativa','Revisão pelo administrador'));
 if not (r->>'ok')::boolean or not exists(select 1 from itens_danos_ciencia where dano_id='TEST-CIENCIA' and status='pendente') then raise exception 'Não reabriu ciência para revisão'; end if;
 update funcionarios_acesso set ativo=false where id=m;
 if rh_pin_conferir(empresa,m,'4567') then raise exception 'Funcionário inativo confirmou'; end if;
 for n in 1..5 loop perform rh_pin_conferir(empresa,t,'9999'); end loop;
 if rh_pin_conferir(empresa,t,'0123') then raise exception 'PIN sem limite de tentativas'; end if;
 if exists(select 1 from gs_linhas where aba='Funcionarios' and planilha_id in(select planilha_id from rh_fontes_legadas)) then raise exception 'Sobrou cadastro legado ativo'; end if;
 if not exists(select 1 from rh_cadastros_arquivados) then raise exception 'Histórico legado não foi preservado'; end if;
 if not exists(select 1 from funcionarios_acesso where empresa_id=empresa and salario_bruto>0 and data_admissao is not null) then raise exception 'Dados do RH não migraram'; end if;
end $$;
select 'PASS: cadastro sem login, PIN individual, isolamento por empresa/equipe, bloqueio, ciência, contestação, alteração e migração' as resultado;
