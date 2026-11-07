# Chiavari — aplicativo Android principal

## Estado da entrega

Assinatura permanente criada e protegida no perfil do proprietário. Compilação release com conferência do certificado via `apksigner`. Ícone CH vetorial extraído da logo cadastrada, com variante adaptativa e monocromática. Código de push FCM e migração por usuário preparados.

**A distribuição definitiva permanece bloqueada enquanto o Firebase não estiver conectado e as notificações não tiverem sido verificadas no aparelho.** O arquivo `downloads/chiavari-android.json` só deve ter `ready: true` e `notificationsReady: true` após essa verificação. A versão de teste em uso continua funcionando durante a preparação.

## Configuração que exige a conta Google/Firebase

1. Conectar o Firebase da empresa e registrar o app Android `br.com.chiavari.acervo`.
2. Ativar a API Firebase Cloud Messaging HTTP v1. Usar uma conta de serviço com a permissão Firebase Cloud Messaging API Admin para enviar notificações. Não colocar essa chave no APK, no Git ou no chat.
3. Guardar `google-services.json` em `android/app/` (ignorado no Git) e seu conteúdo em base64 no segredo GitHub `ANDROID_GOOGLE_SERVICES_B64`. Esse arquivo tem identificadores públicos do aplicativo; a credencial privada do servidor fica separada.
4. Configurar o JSON da conta de serviço como segredo Supabase `FCM_SERVICE_ACCOUNT`, por arquivo/entrada segura. Nunca imprimir os valores em logs.
5. Aplicar `20261107000500_android_push.sql` e publicar a Edge Function `app-push`, preservando os segredos VAPID e o segredo interno existentes. O endpoint continua verificando a sessão/2FA nos testes e o segredo nas chamadas da fila.
6. Executar o workflow **Android assinado**, sem a opção candidata. Ele bloqueia a distribuição sem Firebase configurado, assina com a chave permanente e confere o SHA-256 do certificado.
7. Validar no Android: ativar notificações; enviar teste; receber com app fechado e GPS pausado; tocar no aviso e abrir a etapa; sair da conta e confirmar que não recebe avisos da conta anterior. Testar também uma escala real autorizada pelo responsável e o bloqueio de acesso entre empresas.

## Promoção para principal

Copiar o APK final para `downloads/chiavari.apk`, conferir assinatura e hash, atualizar o manifesto público de versão e publicar no GitHub/Vercel. A página `instalar.html` passa a oferecer uma única instalação. Os acessos Android pelo navegador redirecionam para ela e deixam de oferecer instalação PWA. A consulta de versão não impede o acesso se o manifesto ainda não estiver pronto ou a rede falhar.

A primeira troca exige remover **Acervo Android (teste)** porque foi assinado com chave de desenvolvimento. Remover também o atalho PWA antigo no aparelho. Isso precisa ser feito pelo usuário no Android; o servidor não consegue desinstalar aplicativos remotamente. Os dados da empresa permanecem na conta; o login será feito novamente. As próximas versões usam a assinatura permanente e um `versionCode` crescente.

Não remover as assinaturas Web Push de todos antes da migração. Ao ativar FCM para um usuário, a RPC remove as assinaturas PWA somente desse usuário/empresa, evitando notificações duplicadas sem interromper os demais.

## Assinatura e recuperação

O certificado **público** está em `android/signing-certificate.pem` e o fingerprint em `android/signing-fingerprint.txt`. A chave privada PKCS12 cifrada e o arquivo de recuperação ficam no perfil local em `%LOCALAPPDATA%/Acervo/signing`, com acesso restrito ao proprietário. Existe uma segunda cópia do PKCS12 cifrado em `.backups/android-signing`, excluída de Git e deploy. O arquivo de recuperação e a senha não devem ser compartilhados nem publicados.

Os segredos de compilação são `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD` e `ANDROID_KEY_ALIAS`. Não regenerar a chave em cada compilação. Não substituir a assinatura de uma versão já distribuída. A versão candidata permite verificar compilação e assinatura sem Firebase; ela não deve substituir a instalação principal enquanto notificações estiverem pendentes.

## Limites conhecidos

As notificações usam FCM, independente do serviço de localização, e podem chegar sem GPS ativo. Ainda dependem de permissão, rede, serviços Google Play e regras do Android; forçar parada impede o recebimento até abrir novamente. O rastreamento continua com notificação própria e depende das permissões e da conexão. Não há promessa de entrega em tempo exato nem de localização com o aparelho desligado.
