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

  function pintar(estado) {
    const h = host(); if (!h) return;
    const icone = '<span class="ap-avisos-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/></svg></span>';
    let corpo;
    if (!suporta) corpo = '<p>Este navegador não recebe notificações.' + (iphone ? " No iPhone, abra pelo Safari e use Compartilhar → Adicionar à Tela de Início." : "") + "</p>";
    else if (iphone && !instalado) corpo = '<p>No iPhone, os avisos só funcionam com o app na Tela de Início: no Safari, toque em Compartilhar → <b>Adicionar à Tela de Início</b> e abra por lá.</p>';
    else if (Notification.permission === "denied") corpo = '<p>Os avisos estão bloqueados para este app. Libere nas configurações do celular (Notificações) e volte aqui.</p>';
    else if (estado === "ligado") corpo = '<p>Avisos ligados neste celular. Você recebe quando for escalado para uma montagem ou desmontagem.</p><div class="ap-avisos-acoes"><button type="button" class="ap-avisos-btn" data-avisos="teste">Enviar notificação de teste</button><button type="button" class="ap-avisos-link" data-avisos="desligar">Desligar</button></div>';
    else corpo = '<p>Receba no celular quando for escalado para uma montagem ou desmontagem.</p><div class="ap-avisos-acoes"><button type="button" class="ap-avisos-btn" data-avisos="ligar">Ativar avisos</button></div>';
    h.innerHTML = icone + '<div class="ap-avisos-texto"><b>Avisos no celular</b>' + corpo + '<small data-avisos-msg role="status"></small></div>';
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
    pintar("ligado"); msg("Pronto! Toque em \"Enviar notificação de teste\" para ver como fica.");
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
