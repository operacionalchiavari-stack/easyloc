/* Avisos (notificações) do app da equipe (nov/2026). Bloco na Início do app.html:
   - "Ativar avisos": pede a permissão, registra o service worker (app-sw.js) e guarda o celular (app_push_registrar);
   - "Enviar teste": a Edge Function app-push manda um exemplo de "Você foi escalado" para os próprios celulares;
   - "Desligar": tira este celular da lista.
   Primeiro aviso automático: "Você foi escalado" quando a pessoa entra numa montagem/desmontagem (gatilho no banco).
   iPhone: só funciona com o app adicionado à Tela de Início (iOS 16.4+). */
(function () {
  "use strict";
  const CHAVE_PUBLICA = "BMfQhKFdl_iHuGqwIe7TLYg64rI6knGmEDuTHOtWHGKWqReQms_glck0NB4_e-c1MVR8EmNMtuhxPpBAEx1fWOA";
  const sb = () => window.supabaseClient;
  const host = () => document.getElementById("apAvisos");
  const suporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  let empresa = null, ocupado = false;

  function base64Bytes(b64) {
    const p = "=".repeat((4 - (b64.length % 4)) % 4), s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  }
  async function registro() { return navigator.serviceWorker.register("app-sw.js", { scope: "./" }); }
  async function assinaturaAtual() {
    if (!suporta) return null;
    const r = await navigator.serviceWorker.getRegistration("./"); if (!r) return null;
    return r.pushManager.getSubscription();
  }
  function msg(t, erro) { const p = host()?.querySelector("[data-avisos-msg]"); if (p) { p.textContent = t || ""; p.classList.toggle("erro", !!erro); } }

  // Nov/2026: em Configurações do app, uma linha simples com um botão liga/desliga.
  const ICONE = '<span class="ap-cfg-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/></svg></span>';
  function pintar(estado) {
    const h = host(); if (!h) return;
    const ligado = estado === "ligado";
    let texto, botao = "";
    if (!suporta) texto = "Este navegador não recebe notificações." + (iphone ? " No iPhone, abra pelo Safari e adicione à Tela de Início." : "");
    else if (iphone && !instalado) texto = "No iPhone, funciona só com o app na Tela de Início (Safari › Compartilhar › Adicionar à Tela de Início).";
    else if (Notification.permission === "denied") texto = "Bloqueadas no celular. Libere em Configurações do celular › Notificações.";
    else { texto = ligado ? "Ligadas. Você recebe quando for escalado." : "Receba quando for escalado para uma montagem ou desmontagem.";
      botao = '<button type="button" class="ap-switch" role="switch" aria-checked="' + ligado + '" aria-label="Notificações" data-avisos="' + (ligado ? "desligar" : "ligar") + '"><span></span></button>'; }
    h.innerHTML = '<div class="ap-cfg-linha">' + ICONE + '<div class="ap-cfg-texto"><b>Notificações</b><p>' + texto + '</p></div>' + botao + '</div>' +
      (ligado ? '<button type="button" class="ap-cfg-link" data-avisos="teste">Enviar notificação de teste</button>' : "") + '<small class="ap-cfg-msg" data-avisos-msg role="status"></small>';
    h.hidden = false;
  }

  async function ligar() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { pintar(); msg(perm === "denied" ? "Avisos bloqueados." : "Você não permitiu os avisos.", true); return; }
    const r = await registro(); await navigator.serviceWorker.ready;
    let s = await r.pushManager.getSubscription();
    if (!s) s = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64Bytes(CHAVE_PUBLICA) });
    const j = s.toJSON();
    const { error } = await sb().rpc("app_push_registrar", { p_empresa: empresa, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_aparelho: navigator.userAgent.slice(0, 200) });
    if (error) throw new Error(error.message);
    pintar("ligado"); msg("Notificações ligadas.");
  }
  async function desligar() {
    const s = await assinaturaAtual();
    if (s) { await sb().rpc("app_push_remover", { p_endpoint: s.endpoint }).catch(() => {}); await s.unsubscribe().catch(() => {}); }
    pintar(); msg("Avisos desligados neste celular.");
  }
  async function teste() {
    const { data, error } = await sb().functions.invoke("app-push", { body: { acao: "teste", empresa_id: empresa } });
    let erro = data?.erro || "";
    if (error && !erro) { try { erro = (await error.context?.json?.())?.erro || error.message; } catch (_) { erro = error.message; } }
    if (erro) throw new Error(erro);
    msg("Notificação enviada. Ela aparece em alguns segundos (com o app aberto, olhe a barra do celular).");
  }

  async function iniciar(empresaId) {
    if(window.AcervoAndroid?.postMessage && window.AppAvisosAndroid){window.AppAvisosAndroid.iniciar(empresaId);return;}
    empresa = empresaId;
    if (!host()) return;
    if (!suporta || (iphone && !instalado)) { pintar(); return; }
    let ligado = false;
    // Confere se há versão nova do app-sw.js (ex.: troca do ícone da notificação) sempre que a Início abre.
    navigator.serviceWorker.getRegistration("./").then((r) => r && r.update()).catch(() => {});
    try {
      const s = Notification.permission === "granted" ? await assinaturaAtual() : null;
      if (s) {
        const { data } = await sb().rpc("app_push_status", { p_endpoint: s.endpoint });
        ligado = !!data?.este_aparelho;
        if (!ligado) { // permissão dada e celular inscrito, mas sumiu do banco (ou outra conta): registra de novo
          const j = s.toJSON();
          const r = await sb().rpc("app_push_registrar", { p_empresa: empresa, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_aparelho: navigator.userAgent.slice(0, 200) });
          ligado = !r.error;
        }
      }
    } catch (_) {}
    pintar(ligado ? "ligado" : "");
  }

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-avisos]"); if (!b || ocupado) return;
    ocupado = true; b.disabled = true; msg("");
    try { if (b.dataset.avisos === "ligar") await ligar(); else if (b.dataset.avisos === "desligar") await desligar(); else await teste(); }
    catch (err) { msg(err.message || String(err), true); }
    finally { ocupado = false; b.disabled = false; }
  });
  window.AppAvisos = { iniciar };
})();
