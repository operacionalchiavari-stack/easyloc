# Câmera ao vivo no app Android (nov/2026)

## O que foi feito

O app Android que já existia (`android/`, Java, WebView com a ponte `AcervoAndroid` e serviço de localização) ganhou um
serviço nativo de transmissão. **Não foi usado Capacitor**: o projeto já é um app nativo com a mesma ideia (site dentro do
app + serviços Android), e criar um segundo app quebraria a distribuição, a assinatura e as notificações existentes.

| Peça | Arquivo |
|---|---|
| Serviço de transmissão (primeiro plano, tipo `camera`) | `android/app/src/main/java/br/com/chiavari/acervo/CameraStreamService.java` |
| Chamadas ao servidor (token do aparelho) | `.../CameraApi.java` |
| Tela "Ver a câmera" (usa a sessão do serviço) | `.../CameraPreviewActivity.java` |
| Ponte site ↔ Android (`camera:start/stop/status/ver/ciente`, evento `acervo:camera`) | `.../MainActivity.java` |
| Permissões e serviço | `android/app/src/main/AndroidManifest.xml` |
| WebRTC nativo (`io.github.webrtc-sdk:android:125.6422.07`), versão 1.1.0 (código 3) | `android/app/build.gradle` |
| Tela do celular no modo app (no navegador continua como antes) | `Modulos/Logistica/CameraApp/camera-nativo.js` |
| Barra discreta nas telas do app | `js/app/camera-barra.js` (em app, Montagem, Triagem, Expedição, Catálogo, Agentes, Gerencial) |
| Central: estado, telemetria, alertas, qualidade | `Modulos/Logistica/Cameras/cameras.js/.css` |
| Banco | `supabase/migrations/20261124000300_camera_android_nativo.sql` (aplicada) |

### Como funciona
1. Na tela **Câmera ao vivo** do app, o funcionário toca em **Ligar a câmera**.
2. O site (logado) pede ao banco um **token do aparelho** (`camera_dispositivo_iniciar`). Esse token vale só para essa
   câmera, expira em 16 h (renovado pelo batimento) e não abre nada além dela.
3. O Android mostra uma confirmação ("Transmitir a câmera para a Logística?"), pede câmera, notificações e, se marcado,
   microfone. Só com o app visível: nunca liga escondido nem por comando remoto.
4. O serviço captura (Camera2), codifica (hardware quando houver) e transmite por WebRTC direto para cada pessoa que assiste.
   A sinalização usa `camera_disp_sinais/sinal` a cada 1,5 s; batimento com telemetria a cada 15 s (`camera_disp_ping`).
5. Continua com a tela apagada, bloqueada, navegando no app ou em outro app (wake lock parcial + Wi-Fi lock só durante a
   transmissão, soltos ao encerrar).

Por que um token e não o login: o Supabase troca o refresh token a cada renovação. Se o serviço e o site usassem a mesma
sessão, um derrubaria o outro. É o mesmo modelo do rastreamento de localização.

### Economia e qualidade
- Padrão 480p, 15 fps, sem áudio, 0,9 Mbps por pessoa assistindo; ajustável em **Logística › Câmeras ao vivo › Qualidade**
  (só quem edita o planejamento logístico). O aparelho recebe a mudança no próximo batimento.
- Reduz sozinho: celular quente (moderado: 360p/12 fps; severo: 240p/8 fps), bateria abaixo de 15% sem carregador (10 fps),
  mais pessoas assistindo (divide o limite).
- WebRTC ajusta a taxa conforme a conexão.

### Reconexão e falhas
- Servidor/rede: tentativas a cada 1,5 s, 3 s, 6 s… até 30 s; a volta da rede (Wi-Fi ↔ 4G/5G) dispara nova tentativa na hora.
  Quem assiste refaz a conexão sozinho.
- Câmera caída/travada/usada por outro app: imagem fica preta (nunca congelada), estado "Câmera indisponível" e reabre
  com intervalo progressivo. Sem quadro novo por 6 s também conta como câmera parada.
- Se o Android matar o serviço, ele não pode religar a câmera em segundo plano: ao reabrir o app aparece
  "Transmissão interrompida pelo Android · Retomar".
- Sair da conta encerra a transmissão.

### Fotos durante a transmissão
Ao escolher/tirar foto por um campo de foto do app, a transmissão **pausa** (estado "Pausada para foto"), o app de câmera do
Android abre normalmente e a transmissão volta sozinha ao retornar. Uma tela que tentar abrir a câmera pelo navegador
(`getUserMedia`, ex.: leitor de QR) é recusada enquanto transmite, para nunca haver duas partes usando a câmera.
Foto tirada pela própria sessão de transmissão **não** foi feita (a imagem é de 480p; ficaria pior que a foto normal).

### Central (Logística › Câmeras ao vivo)
Cada câmera mostra: cliente/pedido/local (se a pessoa estiver escalada numa montagem de hoje), funcionário, horário de
início, tempo no ar, bateria e se está carregando, temperatura, tipo e qualidade da rede, resolução, fps, último sinal e se
a tela do celular está apagada. Estados: Ao vivo, Conectando, Reconectando, Conexão instável, Câmera indisponível, Pausada
para foto, Sem conexão, Transmissão encerrada. Alertas: bateria < 20% e < 10%, temperatura elevada, perda de conexão e
interrupção inesperada. Registro em `logistica_camera_eventos` (início, fim, retomada, câmera indisponível, pausa) e acessos
de quem assistiu em `logistica_camera_acessos`. Nada é gravado: o vídeo não passa pelo servidor.

## Diferenças em relação ao pedido (decisões)
- **Vínculo com a montagem**: o usuário pediu antes "só ligar e pronto, sem escolher montagem". O sistema liga a câmera
  sozinho à montagem/desmontagem de hoje em que a pessoa está escalada; sem escala, a câmera fica com o nome do funcionário.
  Encerrar automaticamente ao finalizar a montagem não foi feito.
- **Java em vez de Kotlin**: o app inteiro é Java; misturar exigiria o plugin Kotlin no build sem ganho funcional.
- **Servidor de repasse (TURN)**: não há. Em redes móveis que bloqueiam conexão direta, a central mostra "Não foi possível
  conectar". Contratar um TURN e preencher no serviço (lista `ice` em `conectar()`) e em `js/core/camera-ice.js`.

## Compilar e gerar o APK
Não há Android SDK neste computador; o APK sai pelo GitHub Actions:
1. **APK de teste (assinatura de depuração)**: GitHub › Actions › **APK Android de teste** › Run workflow (branch `main`).
   Baixe o artefato `acervo-android-teste` (app-debug.apk). Pelo terminal: `gh workflow run android.yml --ref main`.
2. **APK assinado (distribuição)**: Actions › **Android assinado**. Exige os segredos `ANDROID_KEYSTORE_*` e o
   `google-services.json` (Firebase); sem o Firebase só sai como candidata.
3. Localmente (com Android Studio/JDK 17 + SDK 35): `cd android && gradle assembleDebug`.

## Atualizar o app
- Subir `versionCode`/`versionName` em `android/app/build.gradle`, gerar o APK assinado e atualizar
  `downloads/chiavari-android.json` (`versionCode`, `ready`). O site avisa "Nova versão disponível" para quem tem versão menor.
- O APK de depuração tem assinatura diferente do assinado: para trocar entre eles é preciso desinstalar antes.
- O conteúdo do app (telas) vem do site publicado (`easyloc-zeta.vercel.app`): mudanças nas telas não exigem APK novo.

## Testes executados
- `RUN_CAMERAS_LIVE=1 node tests/cameras-nativo-live.cjs` (banco e Realtime reais): token só com login e no formato do
  Android; página fazendo exatamente o protocolo do serviço Java (token, sinais, batimento, encerrar) com a central
  recebendo o vídeo; telemetria e alertas (bateria 15%, 43,5 °C); conexão estável (1 pedido em 15 s); "Câmera
  indisponível" cobre a imagem; eventos e acessos registrados; qualidade da central chega ao aparelho; encerrar invalida o
  token; tela do celular e barra com a ponte Android simulada. 3 execuções seguidas sem falha.
- `RUN_CAMERAS_LIVE=1 node tests/cameras-live.cjs`: modo navegador continua igual.
- Compilação + lint do Android no GitHub Actions: sem erros.

## Pendente — só dá para testar num celular físico
Não há aparelho nem emulador aqui. Roteiro (instalar o APK de teste e entrar com uma conta da equipe):
1. Ligar a câmera, apagar a tela, bloquear: a central continua mostrando "Ao vivo · tela apagada".
2. Navegar por Montagem, Triagem, Expedição, Catálogo: a barra aparece e a transmissão não cai nem duplica.
3. Abrir outro app (WhatsApp, navegador) por alguns minutos e voltar.
4. Tirar foto por um campo de foto do app de Montagem: central mostra "Pausada para foto" e volta sozinha.
5. Desligar o Wi-Fi (passa para o 4G) e religar; modo avião por 1 min: "Sem conexão" e volta sozinha.
6. Encerrar pela notificação, pela barra e por "Sair da conta".
7. Forçar parada do app em Configurações › Apps: ao reabrir aparece "Transmissão interrompida · Retomar".
8. Transmissão de 8 h no carregador: bateria, temperatura (a central mostra) e se a qualidade reduz com calor.
9. Repetir em aparelhos de fabricantes diferentes (Samsung, Motorola, Xiaomi). Xiaomi/Huawei/Samsung podem matar serviços
   por "economia de bateria": pode ser preciso liberar o app em Bateria › Sem restrições.
