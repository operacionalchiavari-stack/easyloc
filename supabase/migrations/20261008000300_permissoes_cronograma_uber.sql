-- =====================================================================
-- Permissões do Cronograma e do controle de corridas do Uber
--
-- Pedido: "cronograma deve seguir o usuário que está logado, se for um
-- usuário que tem permissão pode fazer, se não tiver não pode; o mesmo vale
-- pra corridas do Uber". As senhas por setor dessas telas saem; no lugar,
-- o servidor (api/gs.js → Acervo.pode) confere estas chaves. Administrador
-- da empresa (usuarios_empresas.role admin/owner) passa em todas, como em
-- public.funcionario_pode. Marcar quem tem cada uma: tela Permissões.
-- =====================================================================

insert into public.permissoes_catalogo (chave, modulo, submodulo, acao, descricao, sensivel, ordem) values
  ('logistica.cronograma.montagem',   'Logistica', 'Cronograma', 'editar',  'Cronograma: Supervisor de Montagem (pedidos, cadastros, Equipe Free, trocas e execução de etapas)', true,  202),
  ('logistica.cronograma.internas',   'Logistica', 'Cronograma', 'editar',  'Cronograma: Operações Internas / galpão (triagem e separação de trocas)', false, 203),
  ('logistica.cronograma.expedicao',  'Logistica', 'Cronograma', 'aprovar', 'Cronograma: Expedição (concluir carregamento)', false, 204),
  ('logistica.cronograma.motorista',  'Logistica', 'Cronograma', 'editar',  'Cronograma: Motorista / frete (informações de entrega do pedido)', false, 205),
  ('logistica.cronograma.agenda',     'Logistica', 'Cronograma', 'editar',  'Cronograma: criar e editar itens da agenda', false, 206),
  ('logistica.uber.supervisor',       'Logistica', 'Corridas Uber', 'editar',  'Corridas Uber: Supervisor (muda o status, menos para Pago)', false, 230),
  ('logistica.uber.financeiro',       'Logistica', 'Corridas Uber', 'aprovar', 'Corridas Uber: Financeiro (marca como Pago o que está Conferido)', true, 231),
  ('logistica.uber.gerencia',         'Logistica', 'Corridas Uber', 'aprovar', 'Corridas Uber: Gerência (pode tudo)', true, 232)
on conflict (chave) do nothing;
