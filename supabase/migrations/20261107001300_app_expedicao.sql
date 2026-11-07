-- App do celular (nov/2026): módulo Expedição (carregamento e descarregamento por QR), para quem vê a Expedição.
create or replace function public.app_celular_modulos(p_empresa uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare f funcionarios_acesso; montador boolean;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso'; end if;
 select * into f from funcionarios_acesso where id = auth.uid() and empresa_id = p_empresa and ativo;
 montador := p_empresa = gs_empresa_dona() and f.id is not null and f.equipe_operacional = 'montagem';
 return jsonb_build_object(
  'triagem', coalesce(funcionario_tabela_permitida(p_empresa, 'separacoes_itens', 'select'), false),
  'expedicao', coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.expedicao.visualizar'), false),
  'montagem', montador or (p_empresa = gs_empresa_dona() and coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.cronograma.montagem'), false)),
  'catalogo', coalesce(funcionario_pode(p_empresa, auth.uid(), 'comercial.catalogo.visualizar'), false),
  'bonus', p_empresa = gs_empresa_dona() and (f.id is not null or coalesce(funcionario_pode(p_empresa, auth.uid(), 'rh.colaboradores.visualizar'), false)),
  'nome', coalesce(nullif(f.nome, ''), (select u.nome from usuarios u where u.id = auth.uid()), ''));
end $function$;
