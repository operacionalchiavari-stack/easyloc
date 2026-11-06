-- Apaga os dados de teste da Gestão de Pessoas (lote TESTE-RH-20261103, criado em 03/11/2026).
-- Rodar com: npx supabase db query --linked -f Scripts/remover-teste-rh.sql
do $$
declare m jsonb; e uuid := 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b';
begin
  select manifesto into m from sistema_demo_lotes where id = 'TESTE-RH-20261103';
  if m is null then raise notice 'Lote TESTE-RH-20261103 não existe'; return; end if;
  delete from free_rh_pagamentos where inscricao_id in (select id from free_inscricoes where vaga_id in (select (jsonb_array_elements_text(m->'free_vagas'))::uuid));
  delete from free_rh_uniforme where inscricao_id in (select id from free_inscricoes where vaga_id in (select (jsonb_array_elements_text(m->'free_vagas'))::uuid));
  if (m->>'free_rh_config_criada')::boolean then delete from free_rh_config where empresa_id = e; end if;
  delete from free_inscricoes where vaga_id in (select (jsonb_array_elements_text(m->'free_vagas'))::uuid);
  delete from free_vagas where id in (select (jsonb_array_elements_text(m->'free_vagas'))::uuid);
  delete from free_inscricoes where free_id in (select (jsonb_array_elements_text(m->'free_cadastros'))::uuid);
  delete from free_cadastros where id in (select (jsonb_array_elements_text(m->'free_cadastros'))::uuid);
  delete from ideias_premiadas_historico where ideia_id in (select (jsonb_array_elements_text(m->'ideias_premiadas'))::uuid);
  delete from ideias_premiadas where id in (select (jsonb_array_elements_text(m->'ideias_premiadas'))::uuid);
  -- documentos, exames, férias, checklists, fichas e adesões saem junto (on delete cascade)
  delete from operacao_etapa_pessoas where funcionario_id in (select (jsonb_array_elements_text(m->'funcionarios_acesso'))::uuid);
  delete from funcionarios_acesso where id in (select (jsonb_array_elements_text(m->'funcionarios_acesso'))::uuid);
  delete from rh_turmas where id in (select (jsonb_array_elements_text(m->'rh_turmas'))::uuid);
  delete from rh_beneficios where id in (select (jsonb_array_elements_text(m->'rh_beneficios'))::uuid);
  delete from rh_treinamentos where id in (select (jsonb_array_elements_text(m->'rh_treinamentos'))::uuid);
  delete from rh_exames_cadastro where id in (select (jsonb_array_elements_text(m->'rh_exames_cadastro'))::uuid);
  delete from gs_linhas where planilha_id = '1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo' and aba = 'OcorrenciasRH' and valores->>0 like 'TESTE-RH-%';
  update gs_abas set versao = versao + 1, atualizado_em = now() where planilha_id = '1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo' and nome = 'OcorrenciasRH';
  delete from sistema_demo_lotes where id = 'TESTE-RH-20261103';
end $$;
