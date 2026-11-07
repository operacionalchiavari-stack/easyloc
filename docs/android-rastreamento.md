# Acervo Android — versão de teste

Esta é a documentação da primeira versão de teste. A preparação do aplicativo principal, a assinatura permanente e as notificações FCM estão em [android-principal.md](android-principal.md).

O projeto `android/` gera um APK com o sistema aberto em WebView e um serviço Android de localização em primeiro plano. O usuário inicia o serviço enquanto o app está visível; o serviço pode continuar ao sair da tela, remover a tarefa dos recentes ou bloquear a tela. Ele mantém notificação com botão Pausar. Forçar parada, revogar permissões, reiniciar o aparelho, restrições do fabricante e falta de sinal/conexão podem interromper as atualizações. Não há inicialização automática após reiniciar o celular.

## Instalar e testar

1. Baixar `downloads/acervo-android-teste.apk` no Android e permitir a instalação dessa origem quando o sistema solicitar.
2. Abrir **Acervo Android (teste)** e entrar com a conta do sistema. O login do PWA não é transferido automaticamente.
3. Tocar em Compartilhar localização, confirmar a finalidade e permitir localização e notificações. Recomenda-se localização precisa.
4. Confirmar que a notificação informa o horário de envio. Voltar à tela inicial do Android, bloquear a tela e verificar no mapa se o horário continua avançando; caminhar em local seguro para gerar novas leituras.
5. Testar pausa pela notificação, pausa no app, logout, perda/retorno de conexão e permissão revogada. Confirmar que a pausa interrompe o envio e remove a posição quando há conexão.

A compilação e o lint não substituem a validação em um aparelho real. Não foi conectado um aparelho Android nesta sessão.

## Autorização e privacidade

O serviço não recebe senha, access token nem refresh token da conta. Após login e confirmação de acesso no servidor, o navegador registra um segredo aleatório de 256 bits, exclusivo do dispositivo e com duração máxima de 30 dias. O banco guarda somente SHA-256; o Android guarda o segredo cifrado com uma chave do AndroidKeyStore. O segredo autoriza apenas enviar a própria posição e encerrar a própria autorização, sem consultar mapas nem outros dados. O servidor revalida vínculo e funcionário ativo em cada envio. Ao expirar, é necessário abrir o app e ativar novamente.

Não há fila de trajetos offline: só novas leituras atuais são enviadas. A última posição pode continuar no mapa se o app for interrompido ou perder a conexão, com indicação de desatualizada. Pausar sem conexão interrompe a coleta local, mas a remoção remota pode precisar de uma nova tentativa ao voltar à rede.

A ponte WebView aceita mensagens apenas da origem de produção e do frame principal. Ativar exige confirmação nativa e permissões. A migração `20261107000400_rastreamento_android.sql` deve ser aplicada antes do APK.

## Compilação

Executar o workflow **APK Android de teste**, ou `gradle assembleDebug lintDebug` em `android/`, com JDK 17, Gradle 8.11.1 e SDK Android 35. O workflow entrega um artefato APK de teste assinado com chave de desenvolvimento. Antes de distribuir uma versão definitiva ou garantir atualizações instaláveis, configurar uma chave de assinatura permanente fora do repositório. O APK de teste não é uma publicação na Play Store.
