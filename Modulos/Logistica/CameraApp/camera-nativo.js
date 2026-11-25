/* Câmera ao vivo — modo app Android (nov/2026). Só age dentro do app Android (window.AcervoAndroid); no navegador não faz
   nada e camera.js continua transmitindo pelo próprio navegador. No app, quem transmite é o serviço nativo
   (android/.../CameraStreamService.java): continua com a tela apagada, bloqueada e em outras telas do app.
   O site pede ao banco um token só desta câmera (camera_dispositivo_iniciar) e entrega ao Android, que confirma com o
   funcionário, pede as permissões e liga. O estado real vem do serviço pelo evento "acervo:camera". */
(function () {
  "use strict";
  if (!window.AcervoAndroid?.postMessage || window.top !== window) return;
  document.documentElement.classList.add("cm-android");
  const $ = (id) => document.getElementById(id);
  const sb = window.supabaseClient;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const enviar = (d) => window.AcervoAndroid.postMessage(JSON.stringify(d));
  let camId = null, ultimo = null, relogio = null;

  function msg(t, ok) { const m = $("cmMensagem"); if (!m) return; m.hidden = !t; m.textContent = t || ""; m.classList.toggle("ok", !!ok); }
  function botao(texto, ativo) { const b = $("cmComecar"); if (b) { b.disabled = !ativo; b.textContent = texto; } }

  async function ligar() {
    msg(""); botao("Preparando…", false);
    try {
      const empresa = sessionStorage.getItem("empresa_id") || localStorage.getItem("acervo_ultima_empresa");
      const r = await sb.rpc("camera_dispositivo_iniciar", { p_empresa: empresa, p_aparelho: "App Android" });
      if (r.error) throw Error(r.error.message);
      camId = r.data.id;
      enviar({ action: "camera:start", token: r.data.token, titulo: r.data.cliente || r.data.titulo, som: !!$("cmSom")?.checked, config: r.data.config || {} });
      setTimeout(() => { if (camId && !(ultimo && ultimo.ativo)) botao("Ligar a câmera", true); }, 15000);
    } catch (e) { msg(e.message); botao("Ligar a câmera", true); }
  }
  async function desfazer() { // pediu e não ligou (cancelou, sem permissão): o registro no banco não fica "no ar"
    const id = camId; camId = null;
    if (id) await sb.rpc("camera_encerrar", { p_camera: id }).then(() => {}, () => {});
  }

  function tempo(inicio) {
    const s = Math.max(0, Math.floor((Date.now() - inicio) / 1000));
    return String(Math.floor(s / 3600)).padStart(2, "0") + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function pintar(d) {
    ultimo = d;
    document.body.classList.toggle("cm-nativo-ativo", !!d.ativo);
    const caixa = $("cmNativo");
    caixa.hidden = !d.ativo;
    clearInterval(relogio);
    if (!d.ativo) { botao("Ligar a câmera", true); return; }
    const bom = d.estado === "ao_vivo";
    caixa.innerHTML =
      '<div class="cm-cartao cm-nativo-cartao">' +
      '<span class="cm-nativo-selo' + (bom ? "" : " alerta") + '"><i></i>' + esc(d.rotulo) + "</span>" +
      '<div class="cm-nativo-tempo" id="cmNativoTempo">' + tempo(d.inicio) + "</div>" +
      "<p class=\"cm-nativo-titulo\">" + esc(d.titulo || "Câmera ao vivo") + "</p>" +
      "<p class=\"cm-nativo-quem\">" + (d.assistindo ? d.assistindo + (d.assistindo === 1 ? " pessoa assistindo" : " pessoas assistindo") : "Ninguém assistindo agora") + "</p>" +
      (d.detalhe ? '<p class="cm-nativo-detalhe">' + esc(d.detalhe) + "</p>" : "") +
      '<ul class="cm-dicas"><li>Pode <b>apagar a tela</b>, <b>bloquear o celular</b> ou usar <b>outras telas do app</b>: a transmissão continua.</li>' +
      "<li>Para encerrar, use o botão abaixo ou a notificação da câmera.</li></ul>" +
      '<button type="button" class="cm-botao cm-secundario" id="cmNativoVer">Ver a câmera</button>' +
      '<button type="button" class="cm-botao cm-perigo" id="cmNativoEncerrar">Encerrar transmissão</button></div>';
    $("cmNativoVer").onclick = () => enviar({ action: "camera:ver" });
    $("cmNativoEncerrar").onclick = encerrar;
    relogio = setInterval(() => { const t = $("cmNativoTempo"); if (t) t.textContent = tempo(d.inicio); }, 1000);
  }
  async function encerrar() {
    const dlg = $("cmConfirmar");
    dlg.returnValue = "nao"; dlg.showModal();
    const r = await new Promise((ok) => dlg.addEventListener("close", () => ok(dlg.returnValue), { once: true }));
    if (r === "sim") enviar({ action: "camera:stop" });
  }

  window.addEventListener("acervo:camera", (e) => {
    const d = e.detail || {};
    if (d.ativo) camId = null;
    if (d.aviso === "cancelada") { desfazer(); msg("Transmissão cancelada."); }
    else if (d.aviso === "sem_permissao") { desfazer(); msg("Sem permissão para usar a câmera. Libere em Configurações do Android › Apps › Chiavari › Permissões › Câmera."); }
    else if (d.aviso === "erro") { desfazer(); msg("Não foi possível iniciar a câmera do Android. Tente de novo."); }
    if (d.interrompida && !d.ativo) { msg("A transmissão foi interrompida pelo Android. Toque em Ligar a câmera para retomar."); enviar({ action: "camera:ciente" }); }
    pintar(d);
  });

  document.addEventListener("DOMContentLoaded", () => {
    const dica = [...document.querySelectorAll("#cmPermissao .cm-dicas li")].find((li) => /bloqueie/i.test(li.textContent));
    if (dica) dica.innerHTML = "<b>Pode apagar a tela</b>, bloquear o celular ou usar outras telas do app: a transmissão continua.";
    $("cmComecar").addEventListener("click", (e) => { e.preventDefault(); e.stopImmediatePropagation(); ligar(); }, true);
    enviar({ action: "camera:status" });
  });
})();
