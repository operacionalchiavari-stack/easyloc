/* Barra da câmera ao vivo nas telas do app (nov/2026). Só dentro do app Android: enquanto o serviço nativo transmite
   (CameraStreamService), mostra uma faixa fina no rodapé com o ponto vermelho, o tempo, o estado da conexão, "Ver" e
   "Encerrar". O estado é sempre o do serviço (evento "acervo:camera"), então trocar de tela ou recarregar nunca cria nem
   derruba uma transmissão. Na tela da própria câmera (CameraApp) a barra não aparece. */
(function () {
  "use strict";
  if (!window.AcervoAndroid?.postMessage || window.top !== window || /\/CameraApp\//.test(location.pathname)) return;
  const enviar = (d) => window.AcervoAndroid.postMessage(JSON.stringify(d));
  const raiz = new URL("../../", document.currentScript.src);
  let barra = null, relogio = null, atual = null;

  const css = `
  .cam-barra{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 74px);z-index:2147483000;
    display:flex;align-items:center;gap:10px;max-width:calc(100vw - 20px);padding:7px 8px 7px 12px;border-radius:999px;
    background:rgba(255,255,255,.97);box-shadow:0 2px 12px rgba(15,23,42,.18),0 0 0 1px rgba(15,23,42,.06);
    font:600 13px Manrope,Inter,system-ui,sans-serif;color:#1f2328;-webkit-tap-highlight-color:transparent}
  body:not(:has(.ap-abas:not([hidden]))) .cam-barra{bottom:calc(env(safe-area-inset-bottom) + 14px)}
  .cam-barra i{width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#d92d20;animation:cam-barra-pisca 1.3s infinite}
  .cam-barra.alerta i{background:#d97706;animation:none}
  .cam-barra .t{font-variant-numeric:tabular-nums}
  .cam-barra .e{color:#6b7280;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34vw}
  .cam-barra button,.cam-barra a{border:0;border-radius:999px;padding:6px 11px;font:700 12.5px Manrope,Inter,system-ui,sans-serif;cursor:pointer;text-decoration:none}
  .cam-barra .v{background:#eef1f5;color:#1f2328}
  .cam-barra .x{background:#d92d20;color:#fff}
  .cam-barra .r{background:#1f2328;color:#fff}
  @keyframes cam-barra-pisca{50%{opacity:.3}}`;

  function tempo(inicio) {
    const s = Math.max(0, Math.floor((Date.now() - inicio) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : String(m).padStart(2, "0")) + ":" + String(x).padStart(2, "0");
  }
  function garantir() {
    if (barra) return barra;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    barra = document.createElement("div"); barra.className = "cam-barra"; barra.setAttribute("role", "status"); barra.hidden = true;
    document.body.appendChild(barra);
    barra.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cam]"); if (!b) return;
      if (b.dataset.cam === "ver") enviar({ action: "camera:ver" });
      else if (b.dataset.cam === "encerrar" && confirm("Encerrar a transmissão da câmera? A Logística deixa de ver a imagem.")) enviar({ action: "camera:stop" });
      else if (b.dataset.cam === "ok") { enviar({ action: "camera:ciente" }); barra.hidden = true; }
    });
    return barra;
  }
  function pintar(d) {
    atual = d; clearInterval(relogio);
    const b = garantir();
    if (d.ativo) {
      const bom = d.estado === "ao_vivo";
      b.className = "cam-barra" + (bom ? "" : " alerta");
      b.innerHTML = '<i aria-hidden="true"></i><span class="t">' + tempo(d.inicio) + '</span><span class="e">' + (d.rotulo || "") +
        (d.assistindo ? " · " + d.assistindo + " vendo" : "") + '</span><button type="button" class="v" data-cam="ver">Ver</button><button type="button" class="x" data-cam="encerrar">Encerrar</button>';
      b.hidden = false;
      relogio = setInterval(() => { const t = b.querySelector(".t"); if (t) t.textContent = tempo(d.inicio); }, 1000);
    } else if (d.interrompida) {
      b.className = "cam-barra alerta";
      b.innerHTML = '<i aria-hidden="true"></i><span class="e" style="max-width:52vw">Transmissão interrompida pelo Android</span><a class="r" href="' +
        new URL("Modulos/Logistica/CameraApp/camera.html?app=1", raiz) + '">Retomar</a><button type="button" class="v" data-cam="ok">OK</button>';
      b.hidden = false;
    } else b.hidden = true;
  }
  window.addEventListener("acervo:camera", (e) => pintar(e.detail || {}));
  const pedir = () => enviar({ action: "camera:status" });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pedir); else pedir();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pedir(); });
})();
