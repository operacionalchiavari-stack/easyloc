/* Câmeras ao vivo (nov/2026): servidores usados pelo WebRTC para achar o caminho entre o celular e quem assiste.
   STUN (público, do Google) resolve a maioria das redes. Em 4G com operadora que bloqueia conexão direta é preciso um
   servidor TURN (repassa o vídeo): quando contratar um, preencha TURN abaixo, ex.:
   { urls: ["turn:turn.exemplo.com:3478", "turns:turn.exemplo.com:5349"], username: "...", credential: "..." } */
(function () {
  "use strict";
  const STUN = { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] };
  const TURN = null;
  window.CameraICE = { iceServers: TURN ? [STUN, TURN] : [STUN] };
})();
