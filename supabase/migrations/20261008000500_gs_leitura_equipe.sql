-- Dados dos sistemas da Chiavari (motor do Apps Script) com leitura direta do navegador (out/2026).
-- Pedido: "quero que deixe igual itens, projetos, clientes, quero ter acesso igual".
-- Leitura: quem tem vínculo com uma empresa em usuarios_empresas (mesmo critério das tabelas do Acervo).
-- Ficam fechadas as abas com senha, PIN, token de sessão, CPF ou salário.
-- Gravação continua só pelo servidor (/api/gs), que confere as regras e a versão de cada aba.

create or replace function public.gs_aba_protegida(p_planilha text, p_aba text)
returns boolean
language sql
immutable
as $$
  select (p_planilha, p_aba) in (
    ('133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk', 'Senhas'),
    ('133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk', 'Acessos'),
    ('1qYMrypoMvB7t1kwmw-lm_Dye7262OhifKEpXEW5oWow', 'Login e Senha'),
    ('14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ', 'Montador_Sessoes'),
    ('14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ', 'Free_Cadastros'),
    ('1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE', 'App Equipe'),
    ('1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo', 'Funcionarios')
  )
$$;

create or replace function public.gs_eh_da_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.usuarios_empresas ue where ue.user_id = auth.uid())
     and not exists (select 1 from public.funcionarios_acesso f where f.id = auth.uid() and f.ativo = false)
$$;

revoke all on function public.gs_eh_da_equipe() from public, anon;
grant execute on function public.gs_eh_da_equipe() to authenticated;

grant select on public.gs_planilhas, public.gs_abas, public.gs_linhas to authenticated;

drop policy if exists gs_planilhas_ler_equipe on public.gs_planilhas;
create policy gs_planilhas_ler_equipe on public.gs_planilhas
  for select to authenticated using (public.gs_eh_da_equipe());

drop policy if exists gs_abas_ler_equipe on public.gs_abas;
create policy gs_abas_ler_equipe on public.gs_abas
  for select to authenticated using (public.gs_eh_da_equipe());

drop policy if exists gs_linhas_ler_equipe on public.gs_linhas;
create policy gs_linhas_ler_equipe on public.gs_linhas
  for select to authenticated
  using (public.gs_eh_da_equipe() and not public.gs_aba_protegida(planilha_id, aba));
