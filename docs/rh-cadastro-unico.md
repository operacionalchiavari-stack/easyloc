# Cadastro único de funcionários

O ponto de cadastro e edição é **RH → Cadastro de Funcionários**.

`funcionarios_acesso` agora representa a pessoa, inclusive quando não possui
login. `acesso_sistema=false` não cria conta Auth nem vínculo de acesso à empresa.
Ao liberar login, o Auth recebe o mesmo UUID da pessoa. Permissões continuam
separadas do cadastro e só um administrador pode concedê-las ou alterar o login
de outra pessoa. O perfil Recursos Humanos permite administrar pessoas, sem
conceder acessos. Equipe, setor, salário e status não são editáveis pela própria
pessoa.

## Fontes e históricos

- As antigas abas Funcionarios são projeções de leitura do cadastro atual,
  produzidas em `api/_gas/rh-cadastro.js` e protegidas contra escrita pelo motor.
- As antigas listas Usuarios da O.S. e do Almoxarifado foram arquivadas e
  esvaziadas. Seus consumidores leem diretamente o RH.
- `rh_funcionarios_lista` fornece os dados de pessoas para a Logística.
  As views `rh_colaboradores` e `colaboradores` são compatibilidade de leitura
  da mesma fonte, sem permitir outro cadastro.
- Documentos, ocorrências, solicitações e agendas foram ligados à pessoa
  conciliada. Fechamentos e pagamentos continuam como históricos.
- Arquivos de migração ficam em `rh_cadastros_arquivados`,
  `rh_registros_arquivados` e tabelas com sufixo `_arquivo`. Não são fontes de
  cadastro do sistema e não são acessíveis aos usuários comuns.
- Nomes abreviados sem identificação inequívoca foram preservados para revisão
  pelo RH. Não atribuir CPF, equipe ou acesso por suposição.

## PIN individual e ciência

O PIN de quatro dígitos é separado da senha de login, armazenado com bcrypt e
verificado no servidor. Cinco erros bloqueiam novas tentativas por 15 minutos.
Alterar o PIN invalida a sessão anterior do App da Equipe. Os PINs da antiga aba
App Equipe não foram copiados: pessoas sem PIN devem defini-lo no cadastro do RH.

Novas O.S. usam Triagem, Carregamento, Montagem ou Produção. O remetente se
identifica pelo cadastro e PIN; a equipe indicada recebe a pendência de ciência.
Até a confirmação, o conserto pode avançar, mas o dano não entra no desconto nem
no indicador da meta. Produção fica fora do desconto de Operações.

Quem confirma precisa estar ativo, pertencer à mesma empresa e estar vinculado
à equipe indicada. A confirmação identifica a pessoa, a data e os dados exatos
vistos; mudanças em item, quantidade, atribuição, pedido, descrição ou reposição
exigem nova ciência. Uma tela desatualizada não confirma uma versão posterior.
Contestações não descontam; o administrador pode revisar a atribuição com
justificativa e reabrir a ciência. O histórico da revisão é preservado.

Registros antigos classificados como Evento ou Dano Interno mantêm a regra
histórica anterior; não são convertidos automaticamente em novas atribuições.

## Verificação

- `node --test tests/rh-cadastro-ciencia.test.cjs tests/funcionarios-validation.test.mjs tests/portal-metas.test.cjs`
- `node tests/funcionarios-browser.cjs`
- `node tests/ciencia-danos-browser.cjs`
- `tests/rh-cadastro-ciencia.sql` dentro de BEGIN/ROLLBACK.
- `RUN_FUNCIONARIOS_LIVE=1 node tests/rh-unico-live.cjs` é opt-in, usa somente
  identidades temporárias e as remove ao final.

Migrações e servidores foram publicados no projeto conectado. As demais
alterações pendentes do workspace não fizeram parte do pacote de publicação.
