-- Apaga as reuniões de exemplo criadas por Scripts/teste-reunioes.sql (participantes, tarefas e transcrições vão junto).
do $$
declare m jsonb;
begin
  select manifesto into m from sistema_demo_lotes where id = 'TESTE-REUNIOES-20261111';
  if m is null then raise notice 'Nada para apagar.'; return; end if;
  delete from reunioes where id in (select (jsonb_array_elements_text(m->'reunioes'))::uuid);
  delete from sistema_demo_lotes where id = 'TESTE-REUNIOES-20261111';
end $$;
