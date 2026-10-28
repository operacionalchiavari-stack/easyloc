> Atualização posterior: por nova solicitação do proprietário, apenas o cadastro de itens e suas dependências de fotos, 3D, kits e preços foram recuperados. Consulte a [recuperação do cadastro](recuperacao-cadastro-itens.md). Os resultados abaixo registram a limpeza anterior.

# Limpeza dos dados e persistência

Limpeza autorizada pelo proprietário, com confirmação de manter apenas sua empresa e acesso de administrador. Também foi solicitado não conservar cópias dos dados de teste.

## Executado no Supabase

- 32.643 registros removidos das tabelas públicas.
- 336 arquivos removidos usando a API do Storage.
- Três outras contas removidas usando a API administrativa de autenticação.
- Conferência final de 195 tabelas públicas: 187 tabelas operacionais vazias.
- Preservados: uma empresa, um usuário, um vínculo administrativo e uma assinatura necessária ao login; definições de permissões, estrutura das telas legadas e seus cabeçalhos, sem linhas de dados.
- Um arquivo da identidade visual da empresa preservado.
- Acesso ativo de administrador conferido pela função de autorização do banco.

As tabelas técnicas de migrações e os mecanismos internos de autenticação e Storage não foram destruídos. A estrutura, funções, políticas e permissões do sistema continuam instaladas.

## Persistência

Dados de negócio continuam nas tabelas do Supabase, inclusive as telas antigas que usam o adaptador de planilhas (`gs_*`). Esse adaptador grava no Supabase, sem gravar no Google Sheets.

Rotas e equipes de rotas deixaram de depender exclusivamente de `localStorage`. A migração `20261026000100_rotas_persistencia_supabase.sql` foi aplicada; as novas tabelas têm isolamento por empresa, leitura autorizada e escrita controlada por permissão de planejamento.

O código obsoleto de projetos locais do Studio foi retirado. Projetos e cenas salvos nas interfaces atuais continuam vinculados aos projetos no Supabase. Os vínculos antigos com fotos do Drive foram retirados do adaptador e das telas legadas. Novos arquivos desse adaptador usam o Storage do Supabase.

O navegador ainda usa preferências, cache e fila temporária para continuidade offline; eles não substituem os registros permanentes no Supabase. Uma limpeza única de dados antigos foi integrada às páginas, preservando o token de login e aguardando a limpeza antes de resolver o contexto. Ela será executada em cada origem/dispositivo quando a versão atualizada for aberta.

Vercel e GitHub hospedam código e executam serviços; não são o banco dos registros operacionais. Não houve publicação geral das alterações de código nesta atividade. As alterações do banco, arquivos, contas e configurações de backup já foram executadas remotamente.

## Backups e limitação da exclusão local

Os dois artefatos de backup do repositório `operacionalchiavari-stack/easyloc-backups` foram excluídos; a consulta posterior retornou zero artefatos. O workflow foi desativado e seus segredos removidos. A tarefa local de backup foi desativada e o usuário de banco exclusivo do backup perdeu a autorização de login.

**Pendência:** a revisão automática bloqueou a exclusão das cópias locais, inclusive a tentativa com um único arquivo e caminho explícito, sem apresentar motivo específico. Essas pastas não foram apagadas:

- `C:\Users\jonat\OneDrive\Desktop\meu-sistema\.backups`
- `C:\Users\jonat\OneDrive\Desktop\meu-sistema\.tmp\backup-nuvem-recuperado`

Portanto, não é correto afirmar que todas as cópias de teste foram eliminadas. A eventual retenção ou lixeira do OneDrive e arquivos históricos na conta Google Drive também não foi verificada nem apagada por esta atividade. Os vínculos usados pela aplicação foram removidos; isso não apaga arquivos na conta externa.

## Evidências

Resultados locais: `.tmp/resultado-limpeza-banco.json`, `.tmp/resultado-limpeza-arquivos.json` e `.tmp/validacao-banco-zerado.json`. Os relatórios contêm contagens, sem cópia dos registros excluídos.

Validações após as alterações: integridade de 319 arquivos, 315 scripts e 848 referências; interfaces de catálogo, formatos 3D, tema de 58 documentos, painel logístico e ciência do dano. Teste isolado de rotas aprovado, incluindo persistência, consulta sem escrita e isolamento entre empresas.
