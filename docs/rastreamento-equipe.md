# Rastreamento da equipe

O módulo Logística → Rastreamento mostra a última posição enviada por cada usuário da empresa. Usa a chave de Google Maps já configurada no sistema. Atualiza a cada 15 segundos; posições com mais de dois minutos ficam desatualizadas.

## Instalação

Aplicar `supabase/migrations/20261107000100_rastreamento_equipe.sql` antes de usar. Somente usuários com `logistica.planejamento.visualizar` podem consultar as posições. O servidor resolve usuário, nome e vínculo ativo; o cliente não pode enviar posição em nome de outro usuário. Cada usuário pode pausar e remover sua própria posição. Armazena somente a última posição por usuário/empresa.

## App atual

O app atual é um PWA. O botão de compartilhamento solicita permissão de geolocalização e informa a finalidade. A preferência é individual por usuário e empresa neste navegador. As páginas do app retomam a coleta autorizada ao navegar; logout interrompe a coleta e apaga a preferência local. Sem conexão, não há envio nem fila offline. A última posição pode continuar no mapa, indicada como desatualizada. Pausar remove a posição do servidor, quando há conexão.

## Requisito ainda pendente: app fechado

PWA e service worker não oferecem coleta contínua confiável com o app fechado, suspenso ou tela bloqueada. Push não dá essa capacidade. Não foi implementado um serviço nativo neste repositório.

Para atender a esse requisito é necessária uma versão nativa: Android com serviço de localização em primeiro plano, notificação persistente e permissões apropriadas; iOS com Core Location e modo de localização em segundo plano. A versão nativa pode reutilizar a RPC `rastreamento_enviar` com sessão autenticada e consentimento. Exige projeto móvel, empacotamento, assinatura e validação em aparelhos reais. Nem mesmo a versão nativa garante atualizações após parada forçada, revogação de permissões, sem sinal/rede ou com o dispositivo desligado.
