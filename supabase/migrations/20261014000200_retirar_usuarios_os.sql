-- A lista de nomes usada no lançamento de O.S. também fica somente no RH.
begin;
insert into rh_cadastros_arquivados(planilha_id,aba,linha,valores)
 select l.planilha_id,l.aba,l.linha,l.valores from gs_linhas l join gs_abas a on a.planilha_id=l.planilha_id and a.nome=l.aba
 where a.planilha_id='1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE' and a.sheet_id=1926386833
 on conflict do nothing;
do $$
declare r record; v_nome text; v_setor text; v_equipe text;
begin
 for r in select valores from rh_cadastros_arquivados where planilha_id='1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE' and aba='Usuarios' and linha>1 loop
  v_nome:=trim(coalesce(r.valores->>0,''));v_setor:=coalesce(nullif(trim(r.valores->>1),''),'Sem setor');
  if v_nome='' then continue; end if;
  if not exists(select 1 from funcionarios_acesso where empresa_id='bb1260f0-99cd-4d17-ab9b-23c299b4c50b' and (lower(trim(nome))=lower(v_nome) or lower(nome) like lower(v_nome)||' %')) then
   v_equipe:=case lower(v_setor) when 'triagem' then 'triagem' when 'setor 02' then 'triagem' when 'setor 03' then 'triagem'
    when 'carregamento' then 'carregamento' when 'expedição' then 'carregamento' when 'montagem' then 'montagem' else null end;
   insert into funcionarios_acesso(empresa_id,nome,setor,equipe_operacional,acesso_sistema,nivel_acesso)
    values('bb1260f0-99cd-4d17-ab9b-23c299b4c50b',v_nome,v_setor,v_equipe,false,'Visualizador');
  end if;
 end loop;
end $$;
delete from gs_linhas l using gs_abas a where a.planilha_id=l.planilha_id and a.nome=l.aba
 and a.planilha_id='1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE' and a.sheet_id=1926386833;
update gs_abas set versao=versao+1 where planilha_id='1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE' and sheet_id=1926386833;
commit;
