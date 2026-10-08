-- =====================================================================
-- Revisão geral de segurança (out/2026)
--
-- Achados confirmados no banco de produção (pg_policies / pg_proc /
-- /auth/v1/settings):
--  1. usuarios_empresas deixava qualquer pessoa logada criar ou mudar o
--     próprio vínculo para QUALQUER empresa — e quase todas as regras do
--     banco confiam nesse vínculo. O cadastro público do Supabase Auth está
--     ligado, então qualquer um podia criar conta, se vincular à empresa e
--     ver/alterar tudo.
--  2. empresas estava sem RLS (qualquer um com a chave pública lia e alterava).
--  3. Regras abertas até para quem não está logado: clientes_empresas
--     ("IA pode ler clientes por empresa" = empresa_id is not null: os 24
--     clientes legíveis sem login), personalizacoes, personalizacoes_insumos,
--     servicos_adicionais, categorias_caminhao, insumos; e
--     "funcionarios_legacy_authenticated" (true para qualquer logado) em
--     usuarios, categorias_montagem, empresas_configuracoes, ia_conhecimento,
--     ia_fontes_dados.
--  4. ia_buscar_dados() (security definer, sem nenhuma checagem) deixava
--     qualquer pessoa sem login ler clientes/itens/locais de qualquer empresa.
--  5. Storage: itens/empresas-logos aceitavam envio/alteração/remoção de
--     qualquer logado em qualquer pasta; insumos aceitava envio sem login;
--     avatares de qualquer logado em qualquer pasta.
--
-- Como o acesso funciona (importante para mexer depois): as regras
-- funcionario_acesso_* são RESTRICTIVE — só filtram pela permissão do
-- funcionário. Quem DÁ acesso são as regras PERMISSIVE. Por isso cada regra
-- aberta removida aqui é trocada por uma permissiva "quem é da empresa"
-- (vínculo em usuarios_empresas); a permissão por função continua filtrando.
-- Regras antigas que comparavam empresa_id com o id do usuário ou com uma
-- claim "empresa_id" que o token não tem também saem (nunca funcionavam).
-- =====================================================================

-- Vínculo da pessoa logada com a empresa (security definer: não depende das
-- regras de usuarios_empresas e evita recursão).
create or replace function public.eh_membro_empresa(p_empresa uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select auth.uid() is not null and exists(
    select 1 from public.usuarios_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = p_empresa)
$$;
revoke execute on function public.eh_membro_empresa(uuid) from public, anon;
grant execute on function public.eh_membro_empresa(uuid) to authenticated, service_role;

-- 1) Ninguém cria nem muda o próprio vínculo ---------------------------
drop policy if exists "Usuario cria vínculo apenas para si" on public.usuarios_empresas;
drop policy if exists "Usuario atualiza apenas seu vínculo" on public.usuarios_empresas;

-- 2) empresas com RLS ---------------------------------------------------
alter table public.empresas enable row level security;
drop policy if exists empresas_select_membro on public.empresas;
drop policy if exists empresas_update_membro on public.empresas;
create policy empresas_select_membro on public.empresas for select to authenticated
  using (public.eh_membro_empresa(id));
create policy empresas_update_membro on public.empresas for update to authenticated
  using (public.eh_membro_empresa(id) and public.funcionario_tabela_permitida(id, 'empresas', 'editar'))
  with check (public.eh_membro_empresa(id) and public.funcionario_tabela_permitida(id, 'empresas', 'editar'));

-- 3) Regras abertas → "quem é da empresa" -------------------------------
drop policy if exists "IA pode ler clientes por empresa" on public.clientes_empresas;

drop policy if exists "delete personalizacoes" on public.personalizacoes;
drop policy if exists "insert personalizacoes" on public.personalizacoes;
drop policy if exists "select personalizacoes" on public.personalizacoes;
drop policy if exists "update personalizacoes" on public.personalizacoes;
drop policy if exists "delete personalizacoes_insumos" on public.personalizacoes_insumos;
drop policy if exists "insert personalizacoes_insumos" on public.personalizacoes_insumos;
drop policy if exists "select personalizacoes_insumos" on public.personalizacoes_insumos;
drop policy if exists "update personalizacoes_insumos" on public.personalizacoes_insumos;
drop policy if exists servicos_delete on public.servicos_adicionais;
drop policy if exists servicos_insert on public.servicos_adicionais;
drop policy if exists servicos_select_empresa on public.servicos_adicionais;
drop policy if exists servicos_update on public.servicos_adicionais;
drop policy if exists "Categorias apenas da propria empresa" on public.categorias_caminhao;
drop policy if exists "Permitir insert para empresa logada" on public.categorias_caminhao;
drop policy if exists "Permitir select categorias" on public.categorias_caminhao;
drop policy if exists "Permitir update categorias" on public.categorias_caminhao;
drop policy if exists insumos_select on public.insumos;
drop policy if exists update_insumos_por_empresa on public.insumos;
drop policy if exists "Empresa pode inserir seus caminhoes" on public.caminhoes;
drop policy if exists "Empresa pode ver seus caminhoes" on public.caminhoes;
drop policy if exists "Empresa pode atualizar seus caminhões" on public.caminhoes;
drop policy if exists "Insert categorias montagem empresa" on public.categorias_montagem;
drop policy if exists "Select categorias montagem empresa" on public.categorias_montagem;
drop policy if exists "Update categorias montagem empresa" on public.categorias_montagem;
drop policy if exists clientes_log_select_empresa on public.clientes_log;
drop policy if exists clientes_log_insert_empresa on public.clientes_log;
drop policy if exists funcionarios_legacy_authenticated on public.usuarios;
drop policy if exists funcionarios_legacy_authenticated on public.categorias_montagem;
drop policy if exists funcionarios_legacy_authenticated on public.empresas_configuracoes;
drop policy if exists funcionarios_legacy_authenticated on public.ia_conhecimento;
drop policy if exists funcionarios_legacy_authenticated on public.ia_fontes_dados;

do $$
declare t text;
begin
  foreach t in array array['personalizacoes','personalizacoes_insumos','servicos_adicionais',
    'categorias_caminhao','categorias_montagem','empresas_configuracoes','ia_conhecimento',
    'ia_fontes_dados','clientes_log']
  loop
    execute format('drop policy if exists membro_empresa_all on public.%I', t);
    execute format('create policy membro_empresa_all on public.%I for all to authenticated
      using (public.eh_membro_empresa(empresa_id)) with check (public.eh_membro_empresa(empresa_id))', t);
  end loop;
end $$;

-- insumos já tinha select/insert por vínculo; faltavam alterar e apagar
-- (o "update" antigo usava uma claim que não existe — alterar insumo nunca funcionou)
drop policy if exists insumos_membro_update on public.insumos;
drop policy if exists insumos_membro_delete on public.insumos;
create policy insumos_membro_update on public.insumos for update to authenticated
  using (public.eh_membro_empresa(empresa_id)) with check (public.eh_membro_empresa(empresa_id));
create policy insumos_membro_delete on public.insumos for delete to authenticated
  using (public.eh_membro_empresa(empresa_id));

-- usuarios: cada pessoa lê/atualiza o próprio cadastro; os da mesma empresa
-- aparecem para quem é da empresa (lista de equipe, permissões)
drop policy if exists usuarios_proprio_select on public.usuarios;
drop policy if exists usuarios_proprio_update on public.usuarios;
drop policy if exists usuarios_mesma_empresa_select on public.usuarios;
create policy usuarios_proprio_select on public.usuarios for select to authenticated using (id = auth.uid());
create policy usuarios_proprio_update on public.usuarios for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy usuarios_mesma_empresa_select on public.usuarios for select to authenticated
  using (public.eh_membro_empresa(empresa_id) or exists(
    select 1 from public.usuarios_empresas ue where ue.user_id = usuarios.id and public.eh_membro_empresa(ue.empresa_id)));

-- 4) ia_buscar_dados só para quem é da empresa --------------------------
create or replace function public.ia_buscar_dados(p_empresa_id uuid, p_tabela text, p_termo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  campos text;
  sql_query text;
  resultado jsonb;
BEGIN
  IF NOT public.eh_membro_empresa(p_empresa_id)
     OR NOT public.funcionario_tabela_permitida(p_empresa_id, p_tabela, 'visualizar') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT string_agg(quote_ident(campo), ', ')
  INTO campos
  FROM ia_fontes_dados, unnest(campos_permitidos) AS campo
  WHERE tabela_nome = p_tabela AND ativo = true;

  IF campos IS NULL THEN
    RAISE EXCEPTION 'Tabela não autorizada para IA';
  END IF;

  sql_query := format(
    'SELECT jsonb_agg(t) FROM (SELECT %s FROM %I WHERE empresa_id = $1 AND (%s) LIMIT 5) t',
    campos, p_tabela,
    (SELECT string_agg(format('%I::text ILIKE %L', campo, '%' || p_termo || '%'), ' OR ')
       FROM unnest((SELECT campos_permitidos FROM ia_fontes_dados WHERE tabela_nome = p_tabela)) AS campo));

  EXECUTE sql_query INTO resultado USING p_empresa_id;
  RETURN COALESCE(resultado, '[]'::jsonb);
END;
$function$;
revoke execute on function public.ia_buscar_dados(uuid, text, text) from public, anon;
grant execute on function public.ia_buscar_dados(uuid, text, text) to authenticated, service_role;

-- has_permission respondia a qualquer um se um usuário tem uma permissão
revoke execute on function public.has_permission(uuid, uuid, text) from public, anon;
grant execute on function public.has_permission(uuid, uuid, text) to authenticated, service_role;

-- 5) Storage ------------------------------------------------------------
-- itens / empresas-logos: ficam só as regras por pasta da empresa (já existiam)
drop policy if exists "Allow update for authenticated users" on storage.objects;
drop policy if exists "Allow upload for authenticated users" on storage.objects;
drop policy if exists "Delete itens" on storage.objects;
drop policy if exists "delete itens" on storage.objects;
drop policy if exists "Upload itens" on storage.objects;
drop policy if exists "upload itens" on storage.objects;
drop policy if exists "Permitir update logos empresa" on storage.objects;
drop policy if exists "Permitir upload logos empresa" on storage.objects;
-- insumos: o sistema não envia arquivo para esse bucket; fica só a leitura
drop policy if exists "Permitir update de fotos de insumos" on storage.objects;
drop policy if exists "Permitir upload de fotos de insumos" on storage.objects;
-- avatares: caminho é <empresa>/<usuario>.jpg → só quem é da empresa
drop policy if exists "Authenticated delete avatares" on storage.objects;
drop policy if exists "Authenticated update avatares" on storage.objects;
drop policy if exists "Authenticated upload avatares" on storage.objects;
drop policy if exists avatares_insert_empresa on storage.objects;
drop policy if exists avatares_update_empresa on storage.objects;
drop policy if exists avatares_delete_empresa on storage.objects;
create policy avatares_insert_empresa on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and public.eh_membro_empresa(((storage.foldername(name))[1])::uuid));
create policy avatares_update_empresa on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and public.eh_membro_empresa(((storage.foldername(name))[1])::uuid));
create policy avatares_delete_empresa on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and public.eh_membro_empresa(((storage.foldername(name))[1])::uuid));
