begin;
-- Preserva o conteúdo antigo sem manter cadastros paralelos à Home/RH/Metas.
insert into rh_cadastros_arquivados(planilha_id,aba,linha,valores)
 select planilha_id,aba,linha,valores from gs_linhas
 where planilha_id='133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk'
 and aba in ('Mural_Colaboradores','Mural_Reconhecimentos','Mural_Galeria','Mural_Parabens')
 on conflict do nothing;
do $$
declare r record; f uuid; n integer; aniversario text;
begin
 for r in select valores from rh_cadastros_arquivados where planilha_id='133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk' and aba='Mural_Colaboradores' and linha>1 loop
  select count(*),min(id::text)::uuid into n,f from funcionarios_acesso
   where empresa_id='bb1260f0-99cd-4d17-ab9b-23c299b4c50b' and lower(trim(nome))=lower(trim(r.valores->>1));
  if n<>1 then continue; end if;
  aniversario:=r.valores->>3;
  if aniversario ~ '^[0-9]{2}/[0-9]{2}$' then
   update funcionarios_acesso set dados_rh=dados_rh||jsonb_build_object('aniversario_legado',aniversario)
    where id=f and nullif(dados_rh->>'data_nascimento','') is null;
  end if;
  -- Mantém as mensagens de parabéns ligadas à identidade do cadastro único.
  update gs_linhas set valores=jsonb_set(valores,'{1}',to_jsonb(f::text))
   where planilha_id='133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk' and aba='Mural_Parabens' and linha>1 and valores->>1=r.valores->>0;
 end loop;
end $$;
delete from gs_linhas where planilha_id='133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk'
 and aba in ('Mural_Colaboradores','Mural_Reconhecimentos','Mural_Galeria');
update gs_abas set versao=versao+1 where planilha_id='133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk'
 and nome in ('Mural_Colaboradores','Mural_Reconhecimentos','Mural_Galeria','Mural_Parabens');
commit;
