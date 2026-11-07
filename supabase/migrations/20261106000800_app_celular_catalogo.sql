-- App de celular (nov/2026): módulo Catálogo (quem pode ver o catálogo: comercial.catalogo.visualizar; admin vê tudo) e
-- "Meu bônus" só para quem tem cadastro no Cadastro de Funcionários (o bônus é do funcionário; sem cadastro dava erro).
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
  'bonus', p_empresa = gs_empresa_dona() and f.id is not null,
  'nome', coalesce(nullif(f.nome, ''), (select u.nome from usuarios u where u.id = auth.uid()), ''));
end $$;
notify pgrst, 'reload schema';
