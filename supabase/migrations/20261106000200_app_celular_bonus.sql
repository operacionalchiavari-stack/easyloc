-- App de celular (nov/2026): "Meu bônus" vira um módulo do menu (saiu de dentro do App do Montador). O extrato usa a
-- sessão do montador (responsável), então aparece para quem está na equipe de Montagem do Cadastro de Funcionários.
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
  'bonus', montador,
  'nome', coalesce(nullif(f.nome, ''), (select u.nome from usuarios u where u.id = auth.uid()), ''));
end $$;
notify pgrst, 'reload schema';
