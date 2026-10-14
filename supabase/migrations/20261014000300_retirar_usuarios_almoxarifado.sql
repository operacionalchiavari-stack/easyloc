-- Retira o cadastro independente de usuários do Almoxarifado.
begin;
insert into rh_cadastros_arquivados(planilha_id,aba,linha,valores)
 select planilha_id,aba,linha,valores from gs_linhas where planilha_id='1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI' and aba='Usuarios'
 on conflict do nothing;
do $$
declare r record; v_nome text;
begin
 for r in select valores from rh_cadastros_arquivados where planilha_id='1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI' and aba='Usuarios' and linha>1 loop
  v_nome:=trim(coalesce(r.valores->>1,''));
  if v_nome<>'' and not exists(select 1 from funcionarios_acesso where empresa_id='bb1260f0-99cd-4d17-ab9b-23c299b4c50b' and (lower(trim(nome))=lower(v_nome) or lower(nome) like lower(v_nome)||' %')) then
   insert into funcionarios_acesso(empresa_id,nome,setor,cargo,ativo,acesso_sistema,nivel_acesso)
    values('bb1260f0-99cd-4d17-ab9b-23c299b4c50b',v_nome,coalesce(nullif(trim(r.valores->>2),''),'Sem setor'),coalesce(r.valores->>3,''),lower(coalesce(r.valores->>4,'Ativo'))<>'inativo',false,'Visualizador');
  end if;
 end loop;
end $$;
delete from gs_linhas where planilha_id='1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI' and aba='Usuarios';
update gs_abas set versao=versao+1 where planilha_id='1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI' and nome='Usuarios';
commit;
