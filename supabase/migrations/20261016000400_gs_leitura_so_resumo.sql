-- (out/2026) Leitura direta das planilhas dos sistemas da Chiavari (gs_*): só o que o mural do Portal usa
-- (js/ui/portalMural.js: abas Cronograma e Agenda da planilha do Cronograma). O resto (Controle RH, Central de
-- Metas, Fretes...) só pelo servidor (/api/gs, com service role), que confere o login e a permissão de cada tela.

drop policy if exists gs_linhas_ler_equipe on public.gs_linhas;
create policy gs_linhas_ler_equipe on public.gs_linhas for select to authenticated
  using (public.gs_eh_da_equipe()
    and planilha_id = '14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ'
    and aba in ('Cronograma', 'Agenda'));

drop policy if exists gs_abas_ler_equipe on public.gs_abas;
create policy gs_abas_ler_equipe on public.gs_abas for select to authenticated
  using (public.gs_eh_da_equipe()
    and planilha_id = '14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ'
    and nome in ('Cronograma', 'Agenda'));

drop policy if exists gs_planilhas_ler_equipe on public.gs_planilhas;
create policy gs_planilhas_ler_equipe on public.gs_planilhas for select to authenticated
  using (public.gs_eh_da_equipe() and id = '14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ');
