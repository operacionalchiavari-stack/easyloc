> Atualização após a limpeza autorizada: os backups antigos de teste no GitHub foram apagados e as automações anteriores desativadas. As cópias locais continuam pendentes por bloqueio da revisão automática. Consulte [o relatório atual](limpeza-dados-supabase.md). As evidências históricas abaixo não significam que essas cópias continuam disponíveis.

O processo `node Scripts/backup-operacional.cjs` exporta public, auth e os metadados do Storage em um snapshot, cifra os dados com AES-256-GCM e comprime o arquivo. Copia também os arquivos do Storage, de forma incremental e cifrada. Depois restaura todas as tabelas em PostgreSQL isolado em memória, compara os registros e valida chaves primárias, unicidade e relacionamentos.

A automação principal está no repositório privado [easyloc-backups](https://github.com/operacionalchiavari-stack/easyloc-backups): diariamente às 03:17 de Brasília, com artefatos cifrados retidos por 30 dias e monitoramento horário. A execução [40150829787](https://github.com/operacionalchiavari-stack/easyloc-backups/actions/runs/40150829787) terminou com sucesso: 228 tabelas e 33.450 registros restaurados e conferidos, 337 arquivos copiados e nenhuma pendência. O modelo versionado aqui fica em `Scripts/modelos/backup-nuvem.yml`.

A conexão PostgreSQL consulta `sistema_backup_estrutura()` e `sistema_backup_linhas(...)` em lotes de 200 registros, dentro da mesma transação de leitura consistente. Isso evita montar todo o acervo em uma única resposta do servidor. A exportação integral antiga continua disponível para compatibilidade.

O acesso PostgreSQL da automação usa TLS e um usuário próprio, sem permissões de escrita nas tabelas, autorizado apenas a executar a função de exportação. Credenciais e chave ficam nos secrets do repositório privado. A chave precisa também de uma cópia segura fora do GitHub para recuperação independente.

Para recuperar uma cópia: baixar o artefato da execução concluída no GitHub Actions, extrair para uma pasta protegida e executar `node Scripts/verificar-backup-recuperado.cjs CAMINHO_DA_PASTA`. A chave pode ser fornecida por `ACERVO_BACKUP_KEY_FILE` ou `ACERVO_BACKUP_KEY` em base64. Essa verificação decifra o snapshot, restaura em banco isolado e confere a integridade e os tamanhos dos arquivos copiados. Não há restauração sobre produção.

O artefato da execução 40150829787 foi baixado e submetido a essa recuperação local, com resultado aprovado: 228 tabelas, 33.450 registros e 337 arquivos íntegros.

Os snapshots contêm definições de funções e a lista de migrações para recuperação. O teste isolado valida os dados e relacionamentos; a recuperação do ambiente gerenciado do Supabase, políticas, extensões e integrações externas também deve ser ensaiada em um projeto separado antes de uma troca de produção. O processo nunca restaura sobre produção.

Na execução local, os arquivos ficam em `.backups` (ou `ACERVO_BACKUP_DIR`). A chave fica em `%LOCALAPPDATA%\Acervo\backup.key` (ou `ACERVO_BACKUP_KEY_FILE`), fora do repositório. Preserve uma segunda cópia dessa chave em local seguro: sem ela os arquivos são irrecuperáveis. A pasta local sincronizada pelo OneDrive é uma cópia adicional; a automação privada independe de manter este computador ligado.

Para verificar novamente um snapshot: `node Scripts/backup-operacional.cjs CAMINHO_DO_ARQUIVO.enc`. Isso não toca no banco remoto.

No Windows, `powershell -File Scripts/agendar-backup.ps1` agenda a execução diária às 03:00 no horário local. A tarefa usa a sessão do usuário atual e roda quando ele estiver conectado; um servidor sempre ligado pode executar o mesmo comando por seu agendador. Credenciais de serviço permanecem no ambiente local, nunca no navegador ou no agendamento.

O painel de Parâmetros mostra a data e o resultado da última execução. Arquivos pendentes impedem que a execução seja considerada completamente verificada. Não limpe o histórico sem uma política de retenção definida.

A exportação usa uma transação de leitura consistente pela conexão PostgreSQL com TLS e certificado validado. O CLI local fornece credenciais temporárias usando o vínculo já configurado com o projeto; esse login do CLI precisa continuar válido para o agendamento. O navegador nunca participa dessa conexão. A verificação preserva a precisão dos valores numéricos e dos microssegundos, normalizando apenas a representação do fuso horário.

Para retomar um snapshot existente e conferir também os arquivos: `node Scripts/backup-operacional.cjs CAMINHO_DO_ARQUIVO.enc --completo`. A lista detalhada de arquivos pendentes é cifrada em `.backups/arquivos-pendentes.json.enc`. Um arquivo ausente no Storage de origem permanece pendente até sua recuperação; o processo não apaga registros para ocultar essa situação.

Se a restauração do banco já terminou e somente downloads ficaram pendentes, use `node Scripts/repetir-arquivos-backup.cjs CAMINHO_DO_ARQUIVO.enc`. Essa rotina exige o relatório da restauração correspondente, verifica novamente as cifras de todos os arquivos e tenta recuperar os ausentes, atualizando o resultado em Parâmetros. Marcadores de pasta vazia com tamanho zero confirmado nos metadados são preservados como conteúdo vazio.

O modo offline do Painel logístico requer abrir previamente a operação com internet. As listas, conferências e fotos novas ficam cifradas no navegador e isoladas por empresa e usuário. A reabertura usa somente o acesso previamente validado, por até sete dias; a transmissão sempre valida novamente o acesso e a etapa no servidor. Não limpe os dados do navegador enquanto houver pendências. Alterações concorrentes ficam para revisão, sem substituição automática.
