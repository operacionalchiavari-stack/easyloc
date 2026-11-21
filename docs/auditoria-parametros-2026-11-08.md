# Auditoria de Parâmetros — 08/11/2026

## Cobertura

Foram verificadas as 12 seções: Dados da empresa, Tributação, Identidade visual, Comercial, Catálogo, Financeiro, Logística, Almoxarifado, Produção, RH, Segurança e Inteligência artificial.

A verificação incluiu abertura das seções, APIs, estrutura do banco, políticas de acesso, validações, falhas de carregamento e gravação, além de testes dos fluxos que consomem os parâmetros.

Em uma empresa temporária isolada no banco real, todas as 12 seções abriram sem erros de API. Foram gravadas e verificadas configurações de Dados, Tributação, Identidade, Comercial, Financeiro, Catálogo, Almoxarifado, Produção e Logística. Os registros temporários foram removidos; os parâmetros das empresas operacionais não foram alterados.

## Problemas encontrados e corrigidos

- Logística ainda chamava uma função do índice removido, interrompendo sua organização.
- Impostos enviava natureza e regime com nomes incompatíveis com as colunas do banco. O mapeamento foi corrigido, incluindo leitura correta de alíquota zero.
- Algumas políticas de motivos logísticos, motivos para não cobrar, backups e erros operacionais chamavam uma função privada, bloqueando usuários autorizados. As políticas agora usam o verificador autorizado, preservando empresa, permissão e autenticação em duas etapas.
- Falhas de leitura podiam deixar configurações padrão disponíveis para gravação. Catálogo, Almoxarifado e cartões operacionais agora bloqueiam a gravação quando não carregam os dados.
- Exceções de rede podiam deixar os botões de Catálogo e Almoxarifado bloqueados. O estado agora é restaurado para permitir nova tentativa.
- A ordenação de condições de pagamento podia informar sucesso após falha ou gravação parcial. Agora utiliza uma operação atômica no banco, com validação da lista e das permissões.
- Leituras de categorias ocultavam erros como listas vazias; também havia consultas de depuração sem escopo de empresa. As consultas foram corrigidas.
- A alteração de categoria de frete agora reverte a seleção e informa erro quando a gravação falha.
- O formulário principal respeita a permissão de edição também no envio e mantém a navegação disponível para consulta.
- Textos com caracteres corrompidos foram corrigidos nos parâmetros de fluxo e separação.

A migração `20261108001500_parametros_permissoes_reordenacao.sql` foi aplicada ao banco. As versões dos scripts alterados foram atualizadas para evitar reutilização do cache anterior.

## Validação executada

Passaram os testes de navegador de empresa, catálogo, almoxarifado, RH, segurança, modos de separação, cronograma visual, escala, Uber, produção, insumos e agentes de IA. Foram acrescentadas regressões para falhas de leitura/rede, mapeamento tributário, permissões e ordenação atômica.

Também passaram os testes de banco dos parâmetros de cronograma, produção, reservas, fluxo de pedidos, agentes de montagem, gestão do acervo, posição final e ciclos com exceções. Incluem isolamento entre empresas, rejeição de usuários sem autorização e operações concorrentes.

## Limites da verificação

Não foram enviados códigos reais de WhatsApp, ativada autenticação em duas etapas em contas operacionais, restaurados backups ou realizados testes externos reais do Google. Esses cenários exigem validação específica das integrações e credenciais. A leitura da seção Segurança e seus fluxos simulados foram testados.

Os resultados cobrem os cenários executados; não constituem garantia de ausência de erros em todas as combinações possíveis. O frontend não foi publicado.
