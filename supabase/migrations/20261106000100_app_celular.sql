-- Versão de celular do sistema (nov/2026): o mesmo login do sistema abre um app com os módulos Triagem e Montagem.
-- Os apps deixam de ter login próprio: o App do Montador passa a entrar pela conta do sistema (mont_login_conta),
-- como responsável (se a pessoa está na equipe de Montagem do Cadastro de Funcionários) ou como supervisor
-- (permissão de Supervisor de Montagem). O login antigo por CPF + PIN continua no banco, sem tela.
create or replace function public.mont_login_conta() returns jsonb
language plpgsql security definer set search_path=public as $$
declare emp uuid := gs_empresa_dona(); f funcionarios_acesso; t text := app_novo_token(); s app_sessoes;
begin
 if auth.uid() is null or not eh_membro_empresa(emp) then raise exception 'Entre no sistema com o seu usuário.'; end if;
 if not seguranca_2fa_ok() then raise exception 'Confirme a verificação em duas etapas para continuar.'; end if;
 select * into f from funcionarios_acesso where id = auth.uid() and empresa_id = emp and ativo;
 if f.id is not null and f.equipe_operacional = 'montagem' then
  insert into app_sessoes (token_hash, tipo, empresa_id, funcionario_id, usuario_id, nome, perfil, expira_em)
  values (app_hash(t), 'montador', emp, f.id, auth.uid(), f.nome, 'RESPONSAVEL', now() + interval '30 days') returning * into s;
  return jsonb_build_object('token', t, 'nome', f.nome, 'perfil', 'RESPONSAVEL', 'pasta', s.pasta);
 end if;
 if funcionario_pode(emp, auth.uid(), 'logistica.cronograma.montagem') then
  return mont_login_supervisor();
 end if;
 raise exception 'Seu usuário não está na equipe de Montagem nem tem a permissão de Supervisor de Montagem. Fale com o administrador.';
end $$;
revoke all on function public.mont_login_conta() from public, anon;
grant execute on function public.mont_login_conta() to authenticated;

-- Quais módulos do app a pessoa pode abrir (só para desenhar a tela; cada app confere de novo).
create or replace function public.app_celular_modulos(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare f funcionarios_acesso;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso'; end if;
 select * into f from funcionarios_acesso where id = auth.uid() and empresa_id = p_empresa and ativo;
 return jsonb_build_object(
  'triagem', coalesce(funcionario_tabela_permitida(p_empresa, 'separacoes_itens', 'select'), false),
  'montagem', p_empresa = gs_empresa_dona() and ((f.id is not null and f.equipe_operacional = 'montagem') or coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.cronograma.montagem'), false)),
  'nome', coalesce(nullif(f.nome, ''), (select u.nome from usuarios u where u.id = auth.uid()), ''));
end $$;
revoke all on function public.app_celular_modulos(uuid) from public, anon;
grant execute on function public.app_celular_modulos(uuid) to authenticated;
notify pgrst, 'reload schema';
