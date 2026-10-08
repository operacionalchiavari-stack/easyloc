-- =====================================================================
-- Editar o PRÓPRIO cadastro (out/2026)
--
-- Pedido: "por que eu não posso editar meu próprio cadastro? ... libera,
-- troca de senha por exemplo". funcionario_salvar continua recusando
-- p_id = p_ator (trava contra se trancar fora do sistema: mudar o próprio
-- nível/status/permissões). Esta função é o caminho separado e restrito:
-- só dados pessoais — nome, setor, cargo, telefone, foto e a senha
-- operacional de 4 dígitos. NUNCA toca nível de acesso, status nem
-- permissões, e NUNCA cria a linha em funcionarios_acesso para quem não
-- tem (o dono/admin da empresa ficaria sujeito às caixinhas de permissão
-- e perderia o "pode tudo" de funcionario_pode).
-- A senha de login e o e-mail são trocados pela Edge Function
-- funcionarios-admin (Auth), não aqui.
-- Só a Edge Function (service_role) chama: o ator vem do token conferido lá.
-- =====================================================================

create or replace function public.funcionario_salvar_proprio(
  p_empresa uuid,
  p_ator uuid,
  p_dados jsonb,
  p_pin text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_tem_funcionario boolean;
  v_aviso text := '';
begin
  if not exists (select 1 from usuarios_empresas where empresa_id = p_empresa and user_id = p_ator) then
    raise exception 'Conta não pertence a esta empresa';
  end if;
  if exists (select 1 from funcionarios_acesso where id = p_ator and (not ativo or empresa_id <> p_empresa)) then
    raise exception 'Conta inativa';
  end if;
  if coalesce(trim(p_dados->>'nome'), '') = '' then raise exception 'Informe o nome'; end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then raise exception 'Senha operacional deve conter 4 dígitos'; end if;

  v_tem_funcionario := exists (select 1 from funcionarios_acesso where id = p_ator and empresa_id = p_empresa);

  if v_tem_funcionario then
    update funcionarios_acesso set
      nome = trim(p_dados->>'nome'),
      setor = coalesce(nullif(trim(p_dados->>'setor'), ''), setor),
      cargo = coalesce(p_dados->>'cargo', ''),
      telefone = coalesce(p_dados->>'telefone', ''),
      foto_url = coalesce(p_dados->>'foto_url', foto_url),
      pin_hash = case when p_pin is not null then crypt(p_pin, gen_salt('bf', 10)) else pin_hash end,
      updated_at = now()
    where id = p_ator and empresa_id = p_empresa;
  elsif p_pin is not null then
    v_aviso := 'A senha operacional de 4 dígitos é só para funcionários do almoxarifado; não se aplica ao administrador da empresa.';
  end if;

  -- usuarios: sem nivel_acesso e sem ativo (não se altera o próprio acesso)
  insert into usuarios (id, empresa_id, nome, setor, cargo, telefone, avatar_url)
  values (p_ator, p_empresa, trim(p_dados->>'nome'), nullif(trim(p_dados->>'setor'), ''),
          coalesce(p_dados->>'cargo', ''), coalesce(p_dados->>'telefone', ''), nullif(p_dados->>'foto_url', ''))
  on conflict (id) do update set
    nome = excluded.nome,
    setor = coalesce(excluded.setor, usuarios.setor),
    cargo = excluded.cargo,
    telefone = excluded.telefone,
    avatar_url = coalesce(excluded.avatar_url, usuarios.avatar_url);

  insert into logs_permissoes (empresa_id, usuario_alvo_id, acao, depois, usuario_responsavel_id)
  values (p_empresa, p_ator, 'proprio_cadastro_atualizado',
          jsonb_build_object('nome', trim(p_dados->>'nome'), 'pin_alterado', p_pin is not null and v_tem_funcionario), p_ator);

  return jsonb_build_object('aviso', v_aviso);
end $$;

revoke execute on function public.funcionario_salvar_proprio(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.funcionario_salvar_proprio(uuid, uuid, jsonb, text) to service_role;
