-- App do celular (20/11/2026): módulo Gerencial com os relatórios do sistema (Panorama dos Eventos, Produtividade
-- comercial, Cancelamentos, Pós-venda, Sublocações, Financeiro gerencial e Painel do CFO). Cada relatório segue a
-- permissão que já vale no sistema: Comercial = comercial.pedidos.visualizar; Financeiro = financeiro.fluxo.visualizar.
create or replace function public.app_celular_modulos(p_empresa uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare f funcionarios_acesso; montador boolean; ger_com boolean; ger_fin boolean;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso'; end if;
 select * into f from funcionarios_acesso where id = auth.uid() and empresa_id = p_empresa and ativo;
 montador := p_empresa = gs_empresa_dona() and f.id is not null and f.equipe_operacional = 'montagem';
 ger_com := coalesce(funcionario_pode(p_empresa, auth.uid(), 'comercial.pedidos.visualizar'), false);
 ger_fin := coalesce(funcionario_pode(p_empresa, auth.uid(), 'financeiro.fluxo.visualizar'), false);
 return jsonb_build_object(
  'triagem', coalesce(funcionario_tabela_permitida(p_empresa, 'separacoes_itens', 'select'), false),
  'expedicao', coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.expedicao.visualizar'), false),
  'montagem', montador or (p_empresa = gs_empresa_dona() and coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.cronograma.montagem'), false)),
  'catalogo', coalesce(funcionario_pode(p_empresa, auth.uid(), 'comercial.catalogo.visualizar'), false),
  'bonus', p_empresa = gs_empresa_dona() and (f.id is not null or coalesce(funcionario_pode(p_empresa, auth.uid(), 'rh.colaboradores.visualizar'), false)),
  'gerencial', ger_com or ger_fin,
  'ger_comercial', ger_com,
  'ger_financeiro', ger_fin,
  'nome', coalesce(nullif(f.nome, ''), (select u.nome from usuarios u where u.id = auth.uid()), ''));
end $function$;
