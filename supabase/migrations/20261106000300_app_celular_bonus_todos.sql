-- App de celular (nov/2026): "Meu bônus" aparece para todos no menu. O extrato precisa de uma sessão do app com o
-- funcionário da pessoa (mont_bonus_cadastro); mont_login_conta(p_bonus) cria essa sessão para qualquer funcionário
-- ativo da empresa (de qualquer equipe), não só para quem é da Montagem. Quem não tem cadastro de funcionário recebe
-- um aviso. O supervisor que também é funcionário passa a levar o próprio cadastro na sessão.
drop function if exists public.mont_login_conta();
create or replace function public.mont_login_conta(p_bonus boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare emp uuid := gs_empresa_dona(); f funcionarios_acesso; t text := app_novo_token(); s app_sessoes; r jsonb;
begin
 if auth.uid() is null or not eh_membro_empresa(emp) then raise exception 'Entre no sistema com o seu usuário.'; end if;
 if not seguranca_2fa_ok() then raise exception 'Confirme a verificação em duas etapas para continuar.'; end if;
 select * into f from funcionarios_acesso where id = auth.uid() and empresa_id = emp and ativo;
 if p_bonus then
  if f.id is null then raise exception 'O Meu bônus mostra o bônus de quem tem cadastro no Cadastro de Funcionários. Seu usuário não tem esse cadastro.'; end if;
  insert into app_sessoes (token_hash, tipo, empresa_id, funcionario_id, usuario_id, nome, perfil, expira_em)
  values (app_hash(t), 'montador', emp, f.id, auth.uid(), f.nome, 'RESPONSAVEL', now() + interval '30 days') returning * into s;
  return jsonb_build_object('token', t, 'nome', f.nome, 'perfil', 'RESPONSAVEL', 'pasta', s.pasta);
 end if;
 if f.id is not null and f.equipe_operacional = 'montagem' then
  insert into app_sessoes (token_hash, tipo, empresa_id, funcionario_id, usuario_id, nome, perfil, expira_em)
  values (app_hash(t), 'montador', emp, f.id, auth.uid(), f.nome, 'RESPONSAVEL', now() + interval '30 days') returning * into s;
  return jsonb_build_object('token', t, 'nome', f.nome, 'perfil', 'RESPONSAVEL', 'pasta', s.pasta);
 end if;
 if funcionario_pode(emp, auth.uid(), 'logistica.cronograma.montagem') then
  r := mont_login_supervisor();
  if f.id is not null then update app_sessoes set funcionario_id = f.id where token_hash = app_hash(r->>'token'); end if;
  return r;
 end if;
 raise exception 'Seu usuário não está na equipe de Montagem nem tem a permissão de Supervisor de Montagem. Fale com o administrador.';
end $$;
revoke all on function public.mont_login_conta(boolean) from public, anon;
grant execute on function public.mont_login_conta(boolean) to authenticated;

create or replace function public.app_celular_modulos(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare f funcionarios_acesso; montador boolean;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso'; end if;
 select * into f from funcionarios_acesso where id = auth.uid() and empresa_id = p_empresa and ativo;
 montador := p_empresa = gs_empresa_dona() and f.id is not null and f.equipe_operacional = 'montagem';
 return jsonb_build_object(
  'triagem', coalesce(funcionario_tabela_permitida(p_empresa, 'separacoes_itens', 'select'), false),
  'montagem', montador or (p_empresa = gs_empresa_dona() and coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.cronograma.montagem'), false)),
  'bonus', p_empresa = gs_empresa_dona(),
  'nome', coalesce(nullif(f.nome, ''), (select u.nome from usuarios u where u.id = auth.uid()), ''));
end $$;
notify pgrst, 'reload schema';
