-- App de celular (nov/2026): "Meu bônus" para quem não tem cadastro de funcionário mas cuida do RH (o dono, admin sem a
-- linha em funcionarios_acesso): ele escolhe o funcionário e vê o bônus como o funcionário vê. Pedido do usuário:
-- "coloca acesso ao meu bônus pra mim". Quem tem cadastro continua vendo só o próprio.

-- O que o app mostra no "Meu bônus": o próprio bônus (tem cadastro) ou a lista para escolher (pode ver o RH).
create or replace function public.mont_bonus_opcoes() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare emp uuid := gs_empresa_dona(); f funcionarios_acesso;
begin
 if auth.uid() is null or not eh_membro_empresa(emp) then raise exception 'Entre no sistema com o seu usuário.'; end if;
 select * into f from funcionarios_acesso where id = auth.uid() and empresa_id = emp and ativo;
 if f.id is not null then return jsonb_build_object('proprio', true); end if;
 if not coalesce(funcionario_pode(emp, auth.uid(), 'rh.colaboradores.visualizar'), false) then
  return jsonb_build_object('proprio', false, 'administrador', false);
 end if;
 return jsonb_build_object('proprio', false, 'administrador', true, 'funcionarios', coalesce((
   select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'setor', coalesce(x.setor, '')) order by x.nome)
     from funcionarios_acesso x where x.empresa_id = emp and x.ativo), '[]'::jsonb));
end $$;
revoke all on function public.mont_bonus_opcoes() from public, anon;
grant execute on function public.mont_bonus_opcoes() to authenticated;

-- Sessão do bônus de um funcionário escolhido pelo administrador (só leitura do extrato; vale 12 horas).
create or replace function public.mont_bonus_ver(p_funcionario uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare emp uuid := gs_empresa_dona(); f funcionarios_acesso; t text := app_novo_token(); s app_sessoes;
begin
 if auth.uid() is null or not eh_membro_empresa(emp) then raise exception 'Entre no sistema com o seu usuário.'; end if;
 if not seguranca_2fa_ok() then raise exception 'Confirme a verificação em duas etapas para continuar.'; end if;
 if not coalesce(funcionario_pode(emp, auth.uid(), 'rh.colaboradores.visualizar'), false) then raise exception 'Sem permissão para ver o bônus de outro funcionário.'; end if;
 select * into f from funcionarios_acesso where id = p_funcionario and empresa_id = emp and ativo;
 if f.id is null then raise exception 'Funcionário não encontrado.'; end if;
 insert into app_sessoes (token_hash, tipo, empresa_id, funcionario_id, usuario_id, nome, perfil, expira_em)
 values (app_hash(t), 'montador', emp, f.id, auth.uid(), f.nome, 'RESPONSAVEL', now() + interval '12 hours') returning * into s;
 return jsonb_build_object('token', t, 'nome', f.nome, 'perfil', 'RESPONSAVEL', 'pasta', s.pasta);
end $$;
revoke all on function public.mont_bonus_ver(uuid) from public, anon;
grant execute on function public.mont_bonus_ver(uuid) to authenticated;

-- O cartão "Meu bônus" aparece também para quem pode ver o RH sem ter cadastro.
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
  'catalogo', coalesce(funcionario_pode(p_empresa, auth.uid(), 'comercial.catalogo.visualizar'), false),
  'bonus', p_empresa = gs_empresa_dona() and (f.id is not null or coalesce(funcionario_pode(p_empresa, auth.uid(), 'rh.colaboradores.visualizar'), false)),
  'nome', coalesce(nullif(f.nome, ''), (select u.nome from usuarios u where u.id = auth.uid()), ''));
end $$;
notify pgrst, 'reload schema';
