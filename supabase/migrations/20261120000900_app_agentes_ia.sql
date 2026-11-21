-- App do celular (20/11/2026): módulo "Agentes de IA" (Helena, Clara, Cora, Carla, Marcos e a assistente da Ideia
-- Premiada). Cada agente segue a permissão da tela onde ele mora no sistema.
create or replace function public.app_celular_modulos(p_empresa uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare f funcionarios_acesso; montador boolean; ger_com boolean; ger_fin boolean; ag jsonb;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso'; end if;
 select * into f from funcionarios_acesso where id = auth.uid() and empresa_id = p_empresa and ativo;
 montador := p_empresa = gs_empresa_dona() and f.id is not null and f.equipe_operacional = 'montagem';
 ger_com := coalesce(funcionario_pode(p_empresa, auth.uid(), 'comercial.pedidos.visualizar'), false);
 ger_fin := coalesce(funcionario_pode(p_empresa, auth.uid(), 'financeiro.fluxo.visualizar'), false);
 ag := jsonb_build_object(
  'ag_helena', coalesce(funcionario_pode(p_empresa, auth.uid(), 'comercial.catalogo.visualizar'), false),
  'ag_clara', ger_fin,
  'ag_cora', coalesce(funcionario_pode(p_empresa, auth.uid(), 'estoque.itens.visualizar'), false),
  'ag_carla', coalesce(funcionario_pode(p_empresa, auth.uid(), 'geral.solicitacoes.visualizar'), false),
  'ag_marcos', coalesce(funcionario_pode(p_empresa, auth.uid(), 'geral.manutencao.visualizar'), false),
  'ag_ideia', true);
 return jsonb_build_object(
  'triagem', coalesce(funcionario_tabela_permitida(p_empresa, 'separacoes_itens', 'select'), false),
  'expedicao', coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.expedicao.visualizar'), false),
  'montagem', montador or (p_empresa = gs_empresa_dona() and coalesce(funcionario_pode(p_empresa, auth.uid(), 'logistica.cronograma.montagem'), false)),
  'catalogo', coalesce(funcionario_pode(p_empresa, auth.uid(), 'comercial.catalogo.visualizar'), false),
  'bonus', p_empresa = gs_empresa_dona() and (f.id is not null or coalesce(funcionario_pode(p_empresa, auth.uid(), 'rh.colaboradores.visualizar'), false)),
  'gerencial', ger_com or ger_fin,
  'ger_comercial', ger_com,
  'ger_financeiro', ger_fin,
  'agentes', true,
  'nome', coalesce(nullif(f.nome, ''), (select u.nome from usuarios u where u.id = auth.uid()), '')) || ag;
end $function$;
